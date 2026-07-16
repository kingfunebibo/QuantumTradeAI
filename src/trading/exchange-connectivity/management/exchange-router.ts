/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/exchange-router.ts
 *
 * Purpose:
 * Implements deterministic exchange selection, routed execution, retries,
 * failover, immutable attempt logging, and round-robin selection.
 */

import {
  ExchangeDiscovery,
  type ExchangeDiscoveryCandidate,
  type ExchangeDiscoveryContract,
  type ExchangeDiscoveryResult,
} from "./exchange-discovery";

import {
  ExchangeRouterError,
  SystemExchangeRouterClock,
  SystemExchangeRouterDelay,
  calculateExchangeRouterRetryDelay,
  normalizeExchangeRouterRequest,
  type ExchangeRouterAttempt,
  type ExchangeRouterClock,
  type ExchangeRouterContract,
  type ExchangeRouterDecision,
  type ExchangeRouterDelay,
  type ExchangeRouterErrorCode,
  type ExchangeRouterExecutionContext,
  type ExchangeRouterExecutor,
  type ExchangeRouterFailure,
  type ExchangeRouterRequest,
  type ExchangeRouterResult,
  type ExchangeRouterSuccess,
  type NormalizedExchangeRouterRequest,
} from "./exchange-router.types";

import {
  UnifiedExchangeError,
  type UnifiedExchange,
  type UnifiedExchangeErrorCode,
} from "./unified-exchange-interface";

export interface ExchangeRouterOptions {
  readonly clock?: ExchangeRouterClock;
  readonly delay?: ExchangeRouterDelay;
  readonly returnFailureResult?: boolean;
}

interface NormalizedRouterFailure {
  readonly code:
    | UnifiedExchangeErrorCode
    | ExchangeRouterErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly cause: unknown;
}

export class ExchangeRouter<
    TExchange extends UnifiedExchange,
  >
  implements ExchangeRouterContract<TExchange>
{
  private readonly discovery: ExchangeDiscoveryContract<TExchange>;
  private readonly clock: ExchangeRouterClock;
  private readonly delay: ExchangeRouterDelay;
  private readonly returnFailureResult: boolean;
  private readonly roundRobinCursorByOperation =
    new Map<string, number>();

  public constructor(
    discovery:
      | ExchangeDiscoveryContract<TExchange>
      | ExchangeDiscovery<TExchange>,
    options: ExchangeRouterOptions = {},
  ) {
    this.discovery = discovery;
    this.clock =
      options.clock ??
      new SystemExchangeRouterClock();
    this.delay =
      options.delay ??
      new SystemExchangeRouterDelay();
    this.returnFailureResult =
      options.returnFailureResult ?? true;
  }

  public select(
    request: ExchangeRouterRequest,
  ): ExchangeRouterDecision<TExchange> {
    const normalizedRequest =
      normalizeExchangeRouterRequest(request);

    const discoveryResult =
      this.discovery.discover(
        normalizedRequest.discovery,
      );

    const candidates =
      this.applyStrategy(
        normalizedRequest,
        discoveryResult,
      );

    const decidedAt = this.now();
    const selectedCandidate = candidates[0];

    if (selectedCandidate === undefined) {
      return Object.freeze({
        outcome: "NO_CANDIDATE",
        request: normalizedRequest,
        candidates,
        decidedAt,
        reason:
          "No discovered exchange satisfies the routing request.",
      });
    }

    return Object.freeze({
      outcome: "SELECTED",
      request: normalizedRequest,
      selectedCandidate,
      candidates,
      selectedExchangeId:
        selectedCandidate.exchangeId,
      decidedAt,
      reason:
        `Selected exchange "${selectedCandidate.exchangeId}" using strategy "${normalizedRequest.strategy}".`,
    });
  }

  public async route<TResult>(
    request: ExchangeRouterRequest,
    executor: ExchangeRouterExecutor<
      TExchange,
      TResult
    >,
  ): Promise<ExchangeRouterResult<TResult>> {
    if (
      executor === null ||
      typeof executor !== "object" ||
      typeof executor.execute !== "function"
    ) {
      throw new ExchangeRouterError(
        "ROUTER_NOT_CONFIGURED",
        "Exchange router executor must provide an execute() function.",
      );
    }

    const decision = this.select(request);
    const normalizedRequest = decision.request;

    if (
      decision.outcome === "NO_CANDIDATE" ||
      decision.candidates.length === 0
    ) {
      const error =
        new ExchangeRouterError(
          "NO_ROUTE_AVAILABLE",
          "No exchange route is available for the requested operation.",
          {
            operation:
              normalizedRequest.operation,
          },
        );

      if (!this.returnFailureResult) {
        throw error;
      }

      return this.createFailureResult(
        normalizedRequest,
        decision,
        [],
        error,
      );
    }

    const attempts: ExchangeRouterAttempt[] = [];

    const candidateLimit =
      normalizedRequest.failoverPolicy.enabled
        ? Math.min(
            normalizedRequest.failoverPolicy
              .maximumExchangeAttempts,
            decision.candidates.length,
          )
        : 1;

    const candidates =
      decision.candidates.slice(
        0,
        candidateLimit,
      );

    let globalAttemptNumber = 0;
    let lastFailure:
      | NormalizedRouterFailure
      | undefined;

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex += 1
    ) {
      const candidate = candidates[candidateIndex];

      if (candidate === undefined) {
        continue;
      }

      const remainingGlobalAttempts =
        normalizedRequest.retryPolicy.maxAttempts -
        globalAttemptNumber;

      if (remainingGlobalAttempts <= 0) {
        break;
      }

      const maximumAttemptsForCurrentExchange =
        normalizedRequest.failoverPolicy
          .retryCurrentExchangeFirst
          ? remainingGlobalAttempts
          : 1;

      for (
        let exchangeAttemptNumber = 1;
        exchangeAttemptNumber <=
        maximumAttemptsForCurrentExchange;
        exchangeAttemptNumber += 1
      ) {
        if (
          globalAttemptNumber >=
          normalizedRequest.retryPolicy
            .maxAttempts
        ) {
          break;
        }

        globalAttemptNumber += 1;
        const startedAt = this.now();

        try {
          const context:
            ExchangeRouterExecutionContext<TExchange> =
            Object.freeze({
              request:
                normalizedRequest,
              candidate,
              attemptNumber:
                globalAttemptNumber,
              exchangeAttemptNumber,
            });

          const result =
            await executor.execute(
              candidate.connector,
              context,
            );

          if (result === undefined) {
            throw new ExchangeRouterError(
              "INVALID_EXECUTOR_RESULT",
              "Exchange router executor returned undefined.",
              {
                operation:
                  normalizedRequest.operation,
                exchangeId:
                  candidate.exchangeId,
              },
            );
          }

          const completedAt = this.now();

          attempts.push(
            Object.freeze({
              attemptNumber:
                globalAttemptNumber,
              exchangeAttemptNumber,
              exchangeId:
                candidate.exchangeId,
              operation:
                normalizedRequest.operation,
              startedAt,
              completedAt,
              outcome: "SUCCEEDED",
              retryable: false,
            }),
          );

          return this.createSuccessResult(
            normalizedRequest,
            decision,
            candidate.exchangeId,
            result,
            attempts,
            completedAt,
          );
        } catch (cause: unknown) {
          const completedAt = this.now();

          const failure =
            normalizeRouterFailure(
              cause,
              normalizedRequest.operation,
              candidate.exchangeId,
            );

          lastFailure = failure;

          attempts.push(
            Object.freeze({
              attemptNumber:
                globalAttemptNumber,
              exchangeAttemptNumber,
              exchangeId:
                candidate.exchangeId,
              operation:
                normalizedRequest.operation,
              startedAt,
              completedAt,
              outcome: "FAILED",
              retryable:
                failure.retryable,
              errorCode:
                failure.code,
              errorMessage:
                failure.message,
            }),
          );

          const retryAllowed =
            failure.retryable &&
            normalizedRequest.retryPolicy
              .retryableErrorCodes.includes(
                failure.code as UnifiedExchangeErrorCode,
              );

          const hasGlobalAttemptsRemaining =
            globalAttemptNumber <
            normalizedRequest.retryPolicy
              .maxAttempts;

          const canRetryCurrentExchange =
            normalizedRequest.failoverPolicy
              .retryCurrentExchangeFirst &&
            retryAllowed &&
            hasGlobalAttemptsRemaining;

          if (canRetryCurrentExchange) {
            const retryDelay =
              calculateExchangeRouterRetryDelay(
                exchangeAttemptNumber,
                normalizedRequest.retryPolicy,
              );

            if (retryDelay > 0) {
              await this.delay.wait(retryDelay);
            }

            continue;
          }

          const hasAnotherCandidate =
            candidateIndex + 1 <
            candidates.length;

          const canFailOver =
            normalizedRequest.failoverPolicy
              .enabled &&
            hasAnotherCandidate &&
            hasGlobalAttemptsRemaining &&
            (
              retryAllowed ||
              normalizedRequest.failoverPolicy
                .failoverOnNonRetryableError
            );

          if (canFailOver) {
            break;
          }

          const terminalError =
            this.createTerminalRouterError(
              normalizedRequest,
              candidate.exchangeId,
              failure,
              hasAnotherCandidate,
            );

          if (!this.returnFailureResult) {
            throw terminalError;
          }

          return this.createFailureResult(
            normalizedRequest,
            decision,
            attempts,
            terminalError,
          );
        }
      }
    }

    const fallbackError =
      new ExchangeRouterError(
        lastFailure === undefined
          ? "FAILOVER_EXHAUSTED"
          : "ROUTED_OPERATION_FAILED",
        lastFailure?.message ??
          "Exchange routing attempts were exhausted.",
        {
          operation:
            normalizedRequest.operation,
          retryable:
            lastFailure?.retryable ?? false,
          cause:
            lastFailure?.cause,
        },
      );

    if (!this.returnFailureResult) {
      throw fallbackError;
    }

    return this.createFailureResult(
      normalizedRequest,
      decision,
      attempts,
      fallbackError,
    );
  }

  private applyStrategy(
    request:
      NormalizedExchangeRouterRequest,
    discoveryResult:
      ExchangeDiscoveryResult<TExchange>,
  ): readonly ExchangeDiscoveryCandidate<TExchange>[] {
    const candidates = [
      ...discoveryResult.candidates,
    ];

    switch (request.strategy) {
      case "FIRST_MATCH":
      case "PRIORITY":
      case "PREFERRED":
      case "HEALTH_AWARE":
        return Object.freeze(candidates);

      case "ROUND_ROBIN":
        return this.applyRoundRobin(
          request,
          candidates,
        );

      default:
        throw new ExchangeRouterError(
          "INVALID_STRATEGY",
          `Unsupported exchange routing strategy "${String(
            request.strategy,
          )}".`,
          {
            operation:
              request.operation,
          },
        );
    }
  }

  private applyRoundRobin(
    request:
      NormalizedExchangeRouterRequest,
    candidates:
      ExchangeDiscoveryCandidate<TExchange>[],
  ): readonly ExchangeDiscoveryCandidate<TExchange>[] {
    if (candidates.length <= 1) {
      return Object.freeze(candidates);
    }

    const key =
      this.createRoundRobinKey(request);

    const cursor =
      this.roundRobinCursorByOperation.get(
        key,
      ) ?? 0;

    const startIndex =
      cursor % candidates.length;

    const rotated = [
      ...candidates.slice(startIndex),
      ...candidates.slice(0, startIndex),
    ];

    this.roundRobinCursorByOperation.set(
      key,
      (startIndex + 1) %
        candidates.length,
    );

    return Object.freeze(rotated);
  }

  private createRoundRobinKey(
    request:
      NormalizedExchangeRouterRequest,
  ): string {
    const preferred =
      request.discovery
        .preferredExchangeIds ?? [];

    const included =
      request.discovery
        .includeExchangeIds ?? [];

    return JSON.stringify({
      operation:
        request.operation,
      preferred,
      included,
    });
  }

  private createTerminalRouterError(
    request:
      NormalizedExchangeRouterRequest,
    exchangeId: string,
    failure: NormalizedRouterFailure,
    hasAnotherCandidate: boolean,
  ): ExchangeRouterError {
    const retryable = failure.retryable;

    if (
      hasAnotherCandidate &&
      request.failoverPolicy.enabled
    ) {
      return new ExchangeRouterError(
        "FAILOVER_EXHAUSTED",
        `Exchange failover could not continue after failure on "${exchangeId}".`,
        {
          operation:
            request.operation,
          exchangeId,
          retryable,
          cause:
            failure.cause,
        },
      );
    }

    return new ExchangeRouterError(
      "ROUTED_OPERATION_FAILED",
      failure.message,
      {
        operation:
          request.operation,
        exchangeId,
        retryable,
        cause:
          failure.cause,
      },
    );
  }

  private createSuccessResult<TResult>(
    request:
      NormalizedExchangeRouterRequest,
    decision:
      ExchangeRouterDecision<TExchange>,
    exchangeId: string,
    result: TResult,
    attempts:
      readonly ExchangeRouterAttempt[],
    completedAt: number,
  ): ExchangeRouterSuccess<TResult> {
    return Object.freeze({
      outcome: "SUCCEEDED",
      request,
      decision:
        decision as ExchangeRouterDecision<UnifiedExchange>,
      exchangeId,
      result,
      attempts:
        Object.freeze([
          ...attempts,
        ]),
      completedAt,
    });
  }

  private createFailureResult(
    request:
      NormalizedExchangeRouterRequest,
    decision:
      ExchangeRouterDecision<TExchange>,
    attempts:
      readonly ExchangeRouterAttempt[],
    error: ExchangeRouterError,
  ): ExchangeRouterFailure {
    return Object.freeze({
      outcome: "FAILED",
      request,
      decision:
        decision as ExchangeRouterDecision<UnifiedExchange>,
      attempts:
        Object.freeze([
          ...attempts,
        ]),
      completedAt: this.now(),
      error,
    });
  }

  private now(): number {
    const value = this.clock.now();

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new ExchangeRouterError(
        "INVALID_ROUTING_REQUEST",
        "Exchange router clock must return a finite, non-negative timestamp.",
      );
    }

    return value;
  }
}

function normalizeRouterFailure(
  cause: unknown,
  operation:
    NormalizedExchangeRouterRequest["operation"],
  exchangeId: string,
): NormalizedRouterFailure {
  if (cause instanceof UnifiedExchangeError) {
    return Object.freeze({
      code: cause.code,
      message: cause.message,
      retryable: cause.retryable,
      cause,
    });
  }

  if (cause instanceof ExchangeRouterError) {
    return Object.freeze({
      code: cause.code,
      message: cause.message,
      retryable: cause.retryable,
      cause,
    });
  }

  if (cause instanceof Error) {
    return Object.freeze({
      code: "UNKNOWN_ERROR",
      message: cause.message,
      retryable: false,
      cause,
    });
  }

  return Object.freeze({
    code: "UNKNOWN_ERROR",
    message:
      `Exchange operation "${operation}" failed on "${exchangeId}" with a non-error value: ${String(
        cause,
      )}.`,
    retryable: false,
    cause,
  });
}