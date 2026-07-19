/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-monitor.ts
 *
 * Purpose:
 * Deterministic monitoring facade that evaluates enterprise-risk requests,
 * records the latest decision per portfolio, and publishes normalized
 * enterprise-risk events for evaluations, warnings, breaches, restrictions,
 * and triggered circuit breakers.
 */

import {
  EnterpriseRiskDecision,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskEvaluator,
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
  EnterpriseRiskIdentifierGenerator,
  EnterpriseRiskSeverity,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskMonitor {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): EnterpriseRiskDecision;

  getLatestDecision(
    portfolioId: string,
  ): EnterpriseRiskDecision | undefined;

  getAllLatestDecisions():
    readonly EnterpriseRiskDecision[];

  clear(): void;
}

export interface EnterpriseRiskMonitorDependencies {
  readonly evaluator: EnterpriseRiskEvaluator;
  readonly eventPublisher: EnterpriseRiskEventPublisher;
  readonly identifierGenerator:
    EnterpriseRiskIdentifierGenerator;
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

function assertDependency(
  value: unknown,
  methodName: string,
  field: string,
): void {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (
      value as Readonly<Record<string, unknown>>
    )[methodName] !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      `must provide ${methodName}().`,
    );
  }
}

function deepCloneAndFreeze<T>(value: T): T {
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

function createBaseEvent(
  request: EnterpriseRiskEvaluationRequest,
  decision: EnterpriseRiskDecision,
  eventId: string,
  eventType: EnterpriseRiskEvent["eventType"],
  severity: EnterpriseRiskSeverity,
  message: string,
  metadata?: EnterpriseRiskEvent["metadata"],
): EnterpriseRiskEvent {
  const event: EnterpriseRiskEvent = {
    eventId,
    eventType,
    severity,
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
    message,
    occurredAt: decision.evaluatedAt,
    ...(metadata === undefined
      ? {}
      : { metadata }),
  };

  return deepCloneAndFreeze(event);
}

export class DefaultEnterpriseRiskMonitor
  implements EnterpriseRiskMonitor
{
  private readonly latestDecisions =
    new Map<string, EnterpriseRiskDecision>();

  private readonly evaluator:
    EnterpriseRiskEvaluator;

  private readonly eventPublisher:
    EnterpriseRiskEventPublisher;

  private readonly identifierGenerator:
    EnterpriseRiskIdentifierGenerator;

  public constructor(
    dependencies: EnterpriseRiskMonitorDependencies,
  ) {
    if (
      typeof dependencies !== "object" ||
      dependencies === null
    ) {
      throw new EnterpriseRiskValidationError(
        "dependencies",
        "must be a non-null object.",
      );
    }

    assertDependency(
      dependencies.evaluator,
      "evaluate",
      "dependencies.evaluator",
    );

    assertDependency(
      dependencies.eventPublisher,
      "publish",
      "dependencies.eventPublisher",
    );

    assertDependency(
      dependencies.identifierGenerator,
      "generate",
      "dependencies.identifierGenerator",
    );

    this.evaluator = dependencies.evaluator;
    this.eventPublisher =
      dependencies.eventPublisher;
    this.identifierGenerator =
      dependencies.identifierGenerator;
  }

  public evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): EnterpriseRiskDecision {
    const decision =
      this.evaluator.evaluate(request);

    const immutableDecision =
      deepCloneAndFreeze(decision);

    this.latestDecisions.set(
      request.account.portfolioId,
      immutableDecision,
    );

    this.publishDecisionEvents(
      request,
      immutableDecision,
    );

    return deepCloneAndFreeze(
      immutableDecision,
    );
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

  public clear(): void {
    this.latestDecisions.clear();
  }

  private publishDecisionEvents(
    request: EnterpriseRiskEvaluationRequest,
    decision: EnterpriseRiskDecision,
  ): void {
    this.eventPublisher.publish(
      createBaseEvent(
        request,
        decision,
        this.identifierGenerator.generate(
          "enterprise-risk-event",
        ),
        "RISK_EVALUATED",
        decision.severity,
        decision.reason,
        Object.freeze({
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
      ),
    );

    for (const warning of decision.warnings) {
      this.eventPublisher.publish(
        createBaseEvent(
          request,
          decision,
          this.identifierGenerator.generate(
            "enterprise-risk-warning-event",
          ),
          "LIMIT_WARNING",
          warning.severity,
          warning.message,
          Object.freeze({
            warningCode: warning.code,
            decisionId: decision.decisionId,
          }),
        ),
      );
    }

    for (const violation of decision.violations) {
      this.eventPublisher.publish(
        createBaseEvent(
          request,
          decision,
          this.identifierGenerator.generate(
            "enterprise-risk-breach-event",
          ),
          "LIMIT_BREACHED",
          violation.severity,
          violation.message,
          Object.freeze({
            violationCode: violation.code,
            decisionId: decision.decisionId,
          }),
        ),
      );
    }

    if (decision.restrictions.length > 0) {
      this.eventPublisher.publish(
        createBaseEvent(
          request,
          decision,
          this.identifierGenerator.generate(
            "enterprise-risk-restriction-event",
          ),
          "TRADING_RESTRICTED",
          decision.severity,
          decision.reason,
          Object.freeze({
            decisionId: decision.decisionId,
            restrictionCount:
              decision.restrictions.length,
          }),
        ),
      );
    }

    for (
      const circuitBreaker of
      decision.triggeredCircuitBreakers
    ) {
      this.eventPublisher.publish(
        createBaseEvent(
          request,
          decision,
          this.identifierGenerator.generate(
            "enterprise-risk-circuit-breaker-event",
          ),
          "CIRCUIT_BREAKER_TRIGGERED",
          decision.severity,
          `Circuit breaker ${circuitBreaker.id} was triggered.`,
          Object.freeze({
            circuitBreakerId:
              circuitBreaker.id,
            decisionId: decision.decisionId,
            circuitBreakerStatus:
              circuitBreaker.status,
          }),
        ),
      );
    }
  }
}

export function createEnterpriseRiskMonitor(
  dependencies: EnterpriseRiskMonitorDependencies,
): DefaultEnterpriseRiskMonitor {
  return new DefaultEnterpriseRiskMonitor(
    dependencies,
  );
}