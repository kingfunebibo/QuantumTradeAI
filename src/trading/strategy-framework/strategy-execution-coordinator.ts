import {
  EMPTY_STRATEGY_METADATA,
  StrategyCorrelationId,
  StrategyError,
  StrategyEvaluationContext,
  StrategyEvaluationResult,
  StrategyInstanceId,
  StrategyMetadata,
  StrategyOrderIntent,
  StrategyResult,
  StrategyRuntime,
  StrategySignal,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

export type StrategyExecutionCoordinatorErrorCode =
  | "INVALID_REQUEST"
  | "EVALUATION_FAILED"
  | "SIGNAL_HANDLING_FAILED"
  | "RISK_CHECK_FAILED"
  | "ORDER_DISPATCH_FAILED"
  | "EXECUTION_ABORTED"
  | "UNEXPECTED_COORDINATOR_ERROR";

export class StrategyExecutionCoordinatorError extends Error {
  public readonly code: StrategyExecutionCoordinatorErrorCode;
  public readonly retryable: boolean;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyExecutionCoordinatorErrorCode,
    message: string,
    options: {
      readonly retryable?: boolean;
      readonly cause?: unknown;
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyExecutionCoordinatorError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
    this.metadata = options.metadata ?? EMPTY_STRATEGY_METADATA;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface StrategyExecutionClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyExecutionIdGenerator {
  nextId(
    prefix: string,
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
  ): string;
}

export interface StrategySignalHandlingContext {
  readonly executionId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly evaluation: StrategyEvaluationResult;
  readonly signal: StrategySignal;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategySignalHandlingResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategySignalHandler {
  handle(
    context: StrategySignalHandlingContext,
  ): Promise<StrategySignalHandlingResult> | StrategySignalHandlingResult;
}

export interface StrategyOrderRiskContext {
  readonly executionId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly evaluation: StrategyEvaluationResult;
  readonly orderIntent: StrategyOrderIntent;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderRiskDecision {
  readonly approved: boolean;
  readonly reason: string;
  readonly adjustedOrderIntent?: StrategyOrderIntent;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderRiskGate {
  assess(
    context: StrategyOrderRiskContext,
  ): Promise<StrategyOrderRiskDecision> | StrategyOrderRiskDecision;
}

export interface StrategyOrderDispatchContext {
  readonly executionId: string;
  readonly correlationId: StrategyCorrelationId;
  readonly evaluation: StrategyEvaluationResult;
  readonly orderIntent: StrategyOrderIntent;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderDispatchResult {
  readonly accepted: boolean;
  readonly dispatchId?: string;
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyOrderDispatcher {
  dispatch(
    context: StrategyOrderDispatchContext,
  ): Promise<StrategyOrderDispatchResult> | StrategyOrderDispatchResult;
}

export type StrategyExecutionStage =
  | "EVALUATION"
  | "SIGNAL_HANDLING"
  | "RISK_ASSESSMENT"
  | "ORDER_DISPATCH";

export interface StrategyExecutionFailure {
  readonly stage: StrategyExecutionStage;
  readonly itemId?: string;
  readonly error: StrategyError;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyProcessedSignal {
  readonly signal: StrategySignal;
  readonly accepted: boolean;
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyProcessedOrderIntent {
  readonly originalOrderIntent: StrategyOrderIntent;
  readonly dispatchedOrderIntent?: StrategyOrderIntent;
  readonly riskDecision?: StrategyOrderRiskDecision;
  readonly dispatchResult?: StrategyOrderDispatchResult;
  readonly status: "REJECTED" | "DISPATCHED" | "FAILED";
  readonly reason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCoordinatedExecutionResult {
  readonly executionId: string;
  readonly evaluation: StrategyEvaluationResult;
  readonly processedSignals: readonly StrategyProcessedSignal[];
  readonly processedOrderIntents: readonly StrategyProcessedOrderIntent[];
  readonly failures: readonly StrategyExecutionFailure[];
  readonly startedAt: UnixTimestampMilliseconds;
  readonly completedAt: UnixTimestampMilliseconds;
  readonly durationMilliseconds: number;
  readonly successful: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyExecutionCoordinatorOptions {
  readonly continueAfterSignalFailure: boolean;
  readonly continueAfterRiskFailure: boolean;
  readonly continueAfterDispatchFailure: boolean;
  readonly rejectConcurrentExecutions: boolean;
  readonly dispatchOrdersWhenSignalHandlingFails: boolean;
}

export const DEFAULT_STRATEGY_EXECUTION_COORDINATOR_OPTIONS: StrategyExecutionCoordinatorOptions =
  Object.freeze({
    continueAfterSignalFailure: true,
    continueAfterRiskFailure: true,
    continueAfterDispatchFailure: true,
    rejectConcurrentExecutions: true,
    dispatchOrdersWhenSignalHandlingFails: false,
  });

export interface StrategyExecutionCoordinatorDependencies {
  readonly runtime: StrategyRuntime;
  readonly signalHandler?: StrategySignalHandler;
  readonly riskGate?: StrategyOrderRiskGate;
  readonly orderDispatcher?: StrategyOrderDispatcher;
  readonly clock?: StrategyExecutionClock;
  readonly idGenerator?: StrategyExecutionIdGenerator;
  readonly options?: Partial<StrategyExecutionCoordinatorOptions>;
}

export interface StrategyExecutionCoordinatorSnapshot {
  readonly activeStrategyInstanceIds: readonly StrategyInstanceId[];
  readonly totalExecutions: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly totalSignalsProcessed: number;
  readonly totalOrderIntentsProcessed: number;
  readonly totalOrdersDispatched: number;
  readonly totalOrdersRejected: number;
  readonly metadata: StrategyMetadata;
}

const systemClock: StrategyExecutionClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

class DeterministicExecutionIdGenerator implements StrategyExecutionIdGenerator {
  private sequence = 0;

  public nextId(
    prefix: string,
    strategyInstanceId: StrategyInstanceId,
    timestamp: UnixTimestampMilliseconds,
  ): string {
    this.sequence += 1;
    return `${prefix}:${strategyInstanceId}:${timestamp}:${this.sequence}`;
  }
}

function success<T>(value: T, metadata: StrategyMetadata = EMPTY_STRATEGY_METADATA): StrategyResult<T> {
  return Object.freeze({ ok: true as const, value, metadata });
}

function failure<T>(error: StrategyError, metadata: StrategyMetadata = EMPTY_STRATEGY_METADATA): StrategyResult<T> {
  return Object.freeze({ ok: false as const, error, metadata });
}

function toStrategyError(
  error: unknown,
  code: StrategyExecutionCoordinatorErrorCode,
  fallbackMessage: string,
): StrategyError {
  if (error instanceof StrategyExecutionCoordinatorError) {
    return Object.freeze({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      cause: error.cause,
      metadata: error.metadata,
    });
  }

  if (error instanceof Error) {
    return Object.freeze({
      code,
      message: error.message || fallbackMessage,
      retryable: false,
      cause: error,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }

  return Object.freeze({
    code,
    message: fallbackMessage,
    retryable: false,
    cause: error,
    metadata: EMPTY_STRATEGY_METADATA,
  });
}

function assertExecutionContext(context: StrategyEvaluationContext): void {
  if (context === null || typeof context !== "object") {
    throw new StrategyExecutionCoordinatorError(
      "INVALID_REQUEST",
      "Strategy evaluation context is required.",
    );
  }
  if (typeof context.strategyInstanceId !== "string" || context.strategyInstanceId.trim().length === 0) {
    throw new StrategyExecutionCoordinatorError(
      "INVALID_REQUEST",
      "context.strategyInstanceId must be a non-empty string.",
    );
  }
  if (typeof context.correlationId !== "string" || context.correlationId.trim().length === 0) {
    throw new StrategyExecutionCoordinatorError(
      "INVALID_REQUEST",
      "context.correlationId must be a non-empty string.",
    );
  }
  if (!Number.isSafeInteger(context.evaluationTime) || context.evaluationTime < 0) {
    throw new StrategyExecutionCoordinatorError(
      "INVALID_REQUEST",
      "context.evaluationTime must be a non-negative safe integer timestamp.",
    );
  }
}

function mergeOptions(
  options?: Partial<StrategyExecutionCoordinatorOptions>,
): StrategyExecutionCoordinatorOptions {
  return Object.freeze({
    ...DEFAULT_STRATEGY_EXECUTION_COORDINATOR_OPTIONS,
    ...options,
  });
}

export class DefaultStrategyExecutionCoordinator {
  private readonly runtime: StrategyRuntime;
  private readonly signalHandler?: StrategySignalHandler;
  private readonly riskGate?: StrategyOrderRiskGate;
  private readonly orderDispatcher?: StrategyOrderDispatcher;
  private readonly clock: StrategyExecutionClock;
  private readonly idGenerator: StrategyExecutionIdGenerator;
  private readonly options: StrategyExecutionCoordinatorOptions;
  private readonly activeExecutions = new Set<StrategyInstanceId>();

  private totalExecutions = 0;
  private successfulExecutions = 0;
  private failedExecutions = 0;
  private totalSignalsProcessed = 0;
  private totalOrderIntentsProcessed = 0;
  private totalOrdersDispatched = 0;
  private totalOrdersRejected = 0;

  public constructor(dependencies: StrategyExecutionCoordinatorDependencies) {
    if (dependencies === null || typeof dependencies !== "object") {
      throw new StrategyExecutionCoordinatorError(
        "INVALID_REQUEST",
        "Strategy execution coordinator dependencies are required.",
      );
    }
    if (dependencies.runtime === undefined) {
      throw new StrategyExecutionCoordinatorError(
        "INVALID_REQUEST",
        "A strategy runtime dependency is required.",
      );
    }

    this.runtime = dependencies.runtime;
    this.signalHandler = dependencies.signalHandler;
    this.riskGate = dependencies.riskGate;
    this.orderDispatcher = dependencies.orderDispatcher;
    this.clock = dependencies.clock ?? systemClock;
    this.idGenerator = dependencies.idGenerator ?? new DeterministicExecutionIdGenerator();
    this.options = mergeOptions(dependencies.options);
  }

  public async execute(
    context: StrategyEvaluationContext,
  ): Promise<StrategyResult<StrategyCoordinatedExecutionResult>> {
    let executionId = "unassigned";
    let startedAt = context?.evaluationTime ?? this.clock.now();

    try {
      assertExecutionContext(context);
      startedAt = context.evaluationTime;
      executionId = this.idGenerator.nextId(
        "strategy-execution",
        context.strategyInstanceId,
        startedAt,
      );

      if (
        this.options.rejectConcurrentExecutions &&
        this.activeExecutions.has(context.strategyInstanceId)
      ) {
        throw new StrategyExecutionCoordinatorError(
          "EXECUTION_ABORTED",
          `An execution is already active for strategy instance '${context.strategyInstanceId}'.`,
          { retryable: true },
        );
      }

      this.activeExecutions.add(context.strategyInstanceId);
      this.totalExecutions += 1;

      const evaluationResult = await this.runtime.evaluate(context);
      if (!evaluationResult.ok) {
        this.failedExecutions += 1;
        return failure(
          Object.freeze({
            ...evaluationResult.error,
            code: "EVALUATION_FAILED",
          }),
          evaluationResult.metadata,
        );
      }

      const evaluation = evaluationResult.value;
      const failures: StrategyExecutionFailure[] = [];
      const processedSignals = await this.processSignals(
        executionId,
        context.correlationId,
        evaluation,
        failures,
      );

      const signalStageFailed = failures.some(
        (item) => item.stage === "SIGNAL_HANDLING",
      );
      const mayDispatchOrders =
        !signalStageFailed || this.options.dispatchOrdersWhenSignalHandlingFails;

      const processedOrderIntents = mayDispatchOrders
        ? await this.processOrderIntents(
            executionId,
            context.correlationId,
            evaluation,
            failures,
          )
        : evaluation.decision.orderIntents.map((orderIntent) =>
            Object.freeze({
              originalOrderIntent: orderIntent,
              status: "REJECTED" as const,
              reason: "Order dispatch was skipped because signal handling failed.",
              metadata: EMPTY_STRATEGY_METADATA,
            }),
          );

      if (!mayDispatchOrders) {
        this.totalOrderIntentsProcessed += evaluation.decision.orderIntents.length;
        this.totalOrdersRejected += evaluation.decision.orderIntents.length;
      }

      const completedAt = Math.max(this.clock.now(), startedAt);
      const successful = failures.length === 0;
      if (successful) {
        this.successfulExecutions += 1;
      } else {
        this.failedExecutions += 1;
      }

      const result: StrategyCoordinatedExecutionResult = Object.freeze({
        executionId,
        evaluation,
        processedSignals: Object.freeze(processedSignals),
        processedOrderIntents: Object.freeze(processedOrderIntents),
        failures: Object.freeze(failures),
        startedAt,
        completedAt,
        durationMilliseconds: completedAt - startedAt,
        successful,
        metadata: EMPTY_STRATEGY_METADATA,
      });

      return success(result, evaluationResult.metadata);
    } catch (error) {
      this.failedExecutions += 1;
      return failure(
        toStrategyError(
          error,
          "UNEXPECTED_COORDINATOR_ERROR",
          `Strategy execution '${executionId}' failed unexpectedly.`,
        ),
      );
    } finally {
      if (context?.strategyInstanceId !== undefined) {
        this.activeExecutions.delete(context.strategyInstanceId);
      }
    }
  }

  public isExecuting(strategyInstanceId: StrategyInstanceId): boolean {
    return this.activeExecutions.has(strategyInstanceId);
  }

  public snapshot(): StrategyExecutionCoordinatorSnapshot {
    return Object.freeze({
      activeStrategyInstanceIds: Object.freeze(
        [...this.activeExecutions].sort((left, right) => left.localeCompare(right)),
      ),
      totalExecutions: this.totalExecutions,
      successfulExecutions: this.successfulExecutions,
      failedExecutions: this.failedExecutions,
      totalSignalsProcessed: this.totalSignalsProcessed,
      totalOrderIntentsProcessed: this.totalOrderIntentsProcessed,
      totalOrdersDispatched: this.totalOrdersDispatched,
      totalOrdersRejected: this.totalOrdersRejected,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }

  private async processSignals(
    executionId: string,
    correlationId: StrategyCorrelationId,
    evaluation: StrategyEvaluationResult,
    failures: StrategyExecutionFailure[],
  ): Promise<StrategyProcessedSignal[]> {
    const processed: StrategyProcessedSignal[] = [];

    for (const signal of evaluation.decision.signals) {
      this.totalSignalsProcessed += 1;

      if (this.signalHandler === undefined) {
        processed.push(Object.freeze({
          signal,
          accepted: true,
          reason: "No external signal handler was configured.",
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        continue;
      }

      const timestamp = Math.max(this.clock.now(), evaluation.completedAt);
      try {
        const result = await this.signalHandler.handle(Object.freeze({
          executionId,
          correlationId,
          evaluation,
          signal,
          timestamp,
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        processed.push(Object.freeze({
          signal,
          accepted: result.accepted,
          reason: result.reason,
          metadata: result.metadata,
        }));
      } catch (error) {
        const normalized = toStrategyError(
          error,
          "SIGNAL_HANDLING_FAILED",
          `Signal '${signal.signalId}' could not be handled.`,
        );
        failures.push(Object.freeze({
          stage: "SIGNAL_HANDLING",
          itemId: signal.signalId,
          error: normalized,
          timestamp,
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        processed.push(Object.freeze({
          signal,
          accepted: false,
          reason: normalized.message,
          metadata: EMPTY_STRATEGY_METADATA,
        }));

        if (!this.options.continueAfterSignalFailure) {
          break;
        }
      }
    }

    return processed;
  }

  private async processOrderIntents(
    executionId: string,
    correlationId: StrategyCorrelationId,
    evaluation: StrategyEvaluationResult,
    failures: StrategyExecutionFailure[],
  ): Promise<StrategyProcessedOrderIntent[]> {
    const processed: StrategyProcessedOrderIntent[] = [];

    for (const originalOrderIntent of evaluation.decision.orderIntents) {
      this.totalOrderIntentsProcessed += 1;
      const timestamp = Math.max(this.clock.now(), evaluation.completedAt);
      let orderIntent = originalOrderIntent;
      let riskDecision: StrategyOrderRiskDecision | undefined;

      if (this.riskGate !== undefined) {
        try {
          riskDecision = await this.riskGate.assess(Object.freeze({
            executionId,
            correlationId,
            evaluation,
            orderIntent,
            timestamp,
            metadata: EMPTY_STRATEGY_METADATA,
          }));
        } catch (error) {
          const normalized = toStrategyError(
            error,
            "RISK_CHECK_FAILED",
            `Risk assessment failed for order intent '${orderIntent.orderIntentId}'.`,
          );
          failures.push(Object.freeze({
            stage: "RISK_ASSESSMENT",
            itemId: orderIntent.orderIntentId,
            error: normalized,
            timestamp,
            metadata: EMPTY_STRATEGY_METADATA,
          }));
          processed.push(Object.freeze({
            originalOrderIntent,
            status: "FAILED",
            reason: normalized.message,
            metadata: EMPTY_STRATEGY_METADATA,
          }));
          this.totalOrdersRejected += 1;
          if (!this.options.continueAfterRiskFailure) {
            break;
          }
          continue;
        }

        if (!riskDecision.approved) {
          processed.push(Object.freeze({
            originalOrderIntent,
            riskDecision,
            status: "REJECTED",
            reason: riskDecision.reason,
            metadata: riskDecision.metadata,
          }));
          this.totalOrdersRejected += 1;
          continue;
        }

        orderIntent = riskDecision.adjustedOrderIntent ?? orderIntent;
      }

      if (this.orderDispatcher === undefined) {
        processed.push(Object.freeze({
          originalOrderIntent,
          dispatchedOrderIntent: orderIntent,
          riskDecision,
          status: "REJECTED",
          reason: "No order dispatcher was configured.",
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        this.totalOrdersRejected += 1;
        continue;
      }

      try {
        const dispatchResult = await this.orderDispatcher.dispatch(Object.freeze({
          executionId,
          correlationId,
          evaluation,
          orderIntent,
          timestamp,
          metadata: EMPTY_STRATEGY_METADATA,
        }));

        const status = dispatchResult.accepted ? "DISPATCHED" : "REJECTED";
        processed.push(Object.freeze({
          originalOrderIntent,
          dispatchedOrderIntent: orderIntent,
          riskDecision,
          dispatchResult,
          status,
          reason: dispatchResult.reason,
          metadata: dispatchResult.metadata,
        }));

        if (dispatchResult.accepted) {
          this.totalOrdersDispatched += 1;
        } else {
          this.totalOrdersRejected += 1;
        }
      } catch (error) {
        const normalized = toStrategyError(
          error,
          "ORDER_DISPATCH_FAILED",
          `Order intent '${orderIntent.orderIntentId}' could not be dispatched.`,
        );
        failures.push(Object.freeze({
          stage: "ORDER_DISPATCH",
          itemId: orderIntent.orderIntentId,
          error: normalized,
          timestamp,
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        processed.push(Object.freeze({
          originalOrderIntent,
          dispatchedOrderIntent: orderIntent,
          riskDecision,
          status: "FAILED",
          reason: normalized.message,
          metadata: EMPTY_STRATEGY_METADATA,
        }));
        this.totalOrdersRejected += 1;
        if (!this.options.continueAfterDispatchFailure) {
          break;
        }
      }
    }

    return processed;
  }
}