/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-real-time-monitor.ts
 *
 * Purpose:
 * Asynchronous real-time enterprise-risk monitoring with deterministic
 * request serialization, latest-decision tracking, and ordered event
 * publication for completed evaluations.
 */

import {
  EnterpriseRiskAsyncEvaluator,
  EnterpriseRiskDecision,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
  EnterpriseRiskIdentifierGenerator,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskRealTimeMonitor {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): Promise<EnterpriseRiskDecision>;

  getLatestDecision(
    portfolioId: string,
  ): EnterpriseRiskDecision | undefined;

  getAllLatestDecisions():
    readonly EnterpriseRiskDecision[];

  getPendingEvaluationCount(): number;

  clear(): void;
}

export interface EnterpriseRiskRealTimeMonitorDependencies {
  readonly evaluator: EnterpriseRiskAsyncEvaluator;
  readonly eventPublisher: EnterpriseRiskEventPublisher;
  readonly identifierGenerator:
    EnterpriseRiskIdentifierGenerator;
}

export interface EnterpriseRiskRealTimeMonitorOptions {
  readonly serializeEvaluations?: boolean;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function assertMethod(
  value: unknown,
  methodName: string,
  field: string,
): void {
  assertObject(value, field);

  if (
    typeof value[methodName] !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      `must provide ${methodName}().`,
    );
  }
}

function deepCloneAndFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        deepCloneAndFreeze(entry),
      ),
    ) as T;
  }

  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    cloned[key] = deepCloneAndFreeze(entry);
  }

  return Object.freeze(cloned) as T;
}

function createEvaluationEvent(
  request: EnterpriseRiskEvaluationRequest,
  decision: EnterpriseRiskDecision,
  eventId: string,
): EnterpriseRiskEvent {
  return deepCloneAndFreeze({
    eventId,
    eventType: "RISK_EVALUATED",
    severity: decision.severity,
    portfolioId: request.account.portfolioId,
    ...(request.account.accountId === undefined
      ? {}
      : { accountId: request.account.accountId }),
    ...(request.account.strategyId === undefined
      ? {}
      : { strategyId: request.account.strategyId }),
    ...(request.account.botId === undefined
      ? {}
      : { botId: request.account.botId }),
    ...(request.market?.exchangeId === undefined
      ? {}
      : { exchangeId: request.market.exchangeId }),
    ...(request.market?.chainId === undefined
      ? {}
      : { chainId: request.market.chainId }),
    ...(request.market?.symbol === undefined
      ? {}
      : { symbol: request.market.symbol }),
    message: decision.reason,
    occurredAt: decision.evaluatedAt,
    metadata: Object.freeze({
      decisionId: decision.decisionId,
      requestId: decision.requestId,
      status: decision.status,
      approved: decision.approved,
      violationCount:
        decision.violations.length,
      warningCount:
        decision.warnings.length,
      restrictionCount:
        decision.restrictions.length,
      triggeredCircuitBreakerCount:
        decision.triggeredCircuitBreakers.length,
    }),
  } satisfies EnterpriseRiskEvent);
}

export class DefaultEnterpriseRiskRealTimeMonitor
  implements EnterpriseRiskRealTimeMonitor
{
  private readonly evaluator:
    EnterpriseRiskAsyncEvaluator;

  private readonly eventPublisher:
    EnterpriseRiskEventPublisher;

  private readonly identifierGenerator:
    EnterpriseRiskIdentifierGenerator;

  private readonly serializeEvaluations: boolean;

  private readonly latestDecisions =
    new Map<string, EnterpriseRiskDecision>();

  private queue: Promise<void> =
    Promise.resolve();

  private pendingEvaluationCount = 0;

  public constructor(
    dependencies:
      EnterpriseRiskRealTimeMonitorDependencies,
    options:
      EnterpriseRiskRealTimeMonitorOptions = {},
  ) {
    assertObject(
      dependencies,
      "dependencies",
    );

    assertMethod(
      dependencies.evaluator,
      "evaluate",
      "dependencies.evaluator",
    );

    assertMethod(
      dependencies.eventPublisher,
      "publish",
      "dependencies.eventPublisher",
    );

    assertMethod(
      dependencies.identifierGenerator,
      "generate",
      "dependencies.identifierGenerator",
    );

    assertObject(options, "options");

    if (
      options.serializeEvaluations !== undefined &&
      typeof options.serializeEvaluations !== "boolean"
    ) {
      throw new EnterpriseRiskValidationError(
        "options.serializeEvaluations",
        "must be a boolean.",
      );
    }

    this.evaluator = dependencies.evaluator;
    this.eventPublisher =
      dependencies.eventPublisher;
    this.identifierGenerator =
      dependencies.identifierGenerator;
    this.serializeEvaluations =
      options.serializeEvaluations ?? true;
  }

  public evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): Promise<EnterpriseRiskDecision> {
    this.pendingEvaluationCount += 1;

    const operation = async (): Promise<
      EnterpriseRiskDecision
    > => {
      try {
        const decision =
          await this.evaluator.evaluate(request);

        const immutableDecision =
          deepCloneAndFreeze(decision);

        this.latestDecisions.set(
          request.account.portfolioId,
          immutableDecision,
        );

        this.eventPublisher.publish(
          createEvaluationEvent(
            request,
            immutableDecision,
            this.identifierGenerator.generate(
              "enterprise-risk-real-time-event",
            ),
          ),
        );

        return deepCloneAndFreeze(
          immutableDecision,
        );
      } finally {
        this.pendingEvaluationCount -= 1;
      }
    };

    if (!this.serializeEvaluations) {
      return operation();
    }

    const result =
      this.queue.then(operation, operation);

    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  public getLatestDecision(
    portfolioId: string,
  ): EnterpriseRiskDecision | undefined {
    assertNonEmptyString(
      portfolioId,
      "portfolioId",
    );

    const decision =
      this.latestDecisions.get(portfolioId);

    return decision === undefined
      ? undefined
      : deepCloneAndFreeze(decision);
  }

  public getAllLatestDecisions():
    readonly EnterpriseRiskDecision[] {
    return Object.freeze(
      [...this.latestDecisions.entries()]
        .sort(([left], [right]) =>
          left.localeCompare(right),
        )
        .map(([, decision]) =>
          deepCloneAndFreeze(decision),
        ),
    );
  }

  public getPendingEvaluationCount():
    number {
    return this.pendingEvaluationCount;
  }

  public clear(): void {
    if (this.pendingEvaluationCount > 0) {
      throw new EnterpriseRiskValidationError(
        "monitor",
        "cannot be cleared while evaluations are pending.",
      );
    }

    this.latestDecisions.clear();
    this.queue = Promise.resolve();
  }
}

export function createEnterpriseRiskRealTimeMonitor(
  dependencies:
    EnterpriseRiskRealTimeMonitorDependencies,
  options:
    EnterpriseRiskRealTimeMonitorOptions = {},
): DefaultEnterpriseRiskRealTimeMonitor {
  return new DefaultEnterpriseRiskRealTimeMonitor(
    dependencies,
    options,
  );
}