/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-evaluator.ts
 *
 * Purpose:
 * Deterministic orchestration of enterprise-risk validation outcomes,
 * policy-limit outcomes, circuit-breaker state, restrictions, metrics,
 * and event publication into a single immutable risk decision.
 */

import {
  DEFAULT_ENTERPRISE_RISK_CONFIGURATION,
  EnterpriseRiskCircuitBreaker,
  EnterpriseRiskClock,
  EnterpriseRiskConfiguration,
  EnterpriseRiskDecision,
  EnterpriseRiskDecisionStatus,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskEvaluator,
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
  EnterpriseRiskIdentifierGenerator,
  EnterpriseRiskMetadata,
  EnterpriseRiskMetric,
  EnterpriseRiskRestriction,
  EnterpriseRiskSeverity,
  EnterpriseRiskViolation,
  EnterpriseRiskWarning,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskLimitEvaluationOutcome {
  readonly violations: readonly EnterpriseRiskViolation[];
  readonly warnings: readonly EnterpriseRiskWarning[];
  readonly restrictions: readonly EnterpriseRiskRestriction[];
  readonly metrics: readonly EnterpriseRiskMetric[];
}

export interface EnterpriseRiskLimitEvaluationService {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): EnterpriseRiskLimitEvaluationOutcome;
}

export interface EnterpriseRiskCircuitBreakerEvaluationService {
  evaluate(
    request: EnterpriseRiskEvaluationRequest,
    violations: readonly EnterpriseRiskViolation[],
  ): readonly EnterpriseRiskCircuitBreaker[];
}

export interface EnterpriseRiskRequestValidationService {
  validate(
    request: EnterpriseRiskEvaluationRequest,
  ): readonly EnterpriseRiskViolation[];
}

export interface EnterpriseRiskEvaluatorDependencies {
  readonly clock: EnterpriseRiskClock;
  readonly identifierGenerator: EnterpriseRiskIdentifierGenerator;
  readonly requestValidator?: EnterpriseRiskRequestValidationService;
  readonly limitEvaluator?: EnterpriseRiskLimitEvaluationService;
  readonly circuitBreakerEvaluator?:
    EnterpriseRiskCircuitBreakerEvaluationService;
  readonly eventPublisher?: EnterpriseRiskEventPublisher;
  readonly configuration?: EnterpriseRiskConfiguration;
}

const SEVERITY_RANK: Readonly<
  Record<EnterpriseRiskSeverity, number>
> = Object.freeze({
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
});

function assertObject(
  value: unknown,
  field: string,
): void {
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

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a finite number.",
    );
  }
}

function assertNonNegativeNumber(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be non-negative.",
    );
  }
}

function cloneMetadata(
  metadata: EnterpriseRiskMetadata | undefined,
): EnterpriseRiskMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...metadata,
  });
}

function cloneViolation(
  violation: EnterpriseRiskViolation,
): EnterpriseRiskViolation {
  return Object.freeze({
    ...violation,
    metadata: cloneMetadata(violation.metadata),
  });
}

function cloneWarning(
  warning: EnterpriseRiskWarning,
): EnterpriseRiskWarning {
  return Object.freeze({
    ...warning,
    metadata: cloneMetadata(warning.metadata),
  });
}

function cloneRestriction(
  restriction: EnterpriseRiskRestriction,
): EnterpriseRiskRestriction {
  return Object.freeze({
    ...restriction,
    metadata: cloneMetadata(restriction.metadata),
  });
}

function cloneMetric(
  metric: EnterpriseRiskMetric,
): EnterpriseRiskMetric {
  return Object.freeze({
    ...metric,
    metadata: cloneMetadata(metric.metadata),
  });
}

function cloneCircuitBreaker(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
): EnterpriseRiskCircuitBreaker {
  return Object.freeze({
    ...circuitBreaker,
    metadata: cloneMetadata(circuitBreaker.metadata),
  });
}

function compareByIdentifier<
  T extends { readonly id: string },
>(
  left: T,
  right: T,
): number {
  return left.id.localeCompare(right.id);
}

function validateDependencies(
  dependencies: EnterpriseRiskEvaluatorDependencies,
): void {
  assertObject(dependencies, "dependencies");

  if (
    typeof dependencies.clock !== "object" ||
    dependencies.clock === null ||
    typeof dependencies.clock.now !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.clock",
      "must implement EnterpriseRiskClock.",
    );
  }

  if (
    typeof dependencies.identifierGenerator !== "object" ||
    dependencies.identifierGenerator === null ||
    typeof dependencies.identifierGenerator.generate !==
      "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.identifierGenerator",
      "must implement EnterpriseRiskIdentifierGenerator.",
    );
  }

  if (
    dependencies.requestValidator !== undefined &&
    (
      typeof dependencies.requestValidator !== "object" ||
      dependencies.requestValidator === null ||
      typeof dependencies.requestValidator.validate !==
        "function"
    )
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.requestValidator",
      "must expose validate(request).",
    );
  }

  if (
    dependencies.limitEvaluator !== undefined &&
    (
      typeof dependencies.limitEvaluator !== "object" ||
      dependencies.limitEvaluator === null ||
      typeof dependencies.limitEvaluator.evaluate !==
        "function"
    )
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.limitEvaluator",
      "must expose evaluate(request).",
    );
  }

  if (
    dependencies.circuitBreakerEvaluator !== undefined &&
    (
      typeof dependencies.circuitBreakerEvaluator !==
        "object" ||
      dependencies.circuitBreakerEvaluator === null ||
      typeof dependencies.circuitBreakerEvaluator
        .evaluate !== "function"
    )
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.circuitBreakerEvaluator",
      "must expose evaluate(request, violations).",
    );
  }

  if (
    dependencies.eventPublisher !== undefined &&
    (
      typeof dependencies.eventPublisher !== "object" ||
      dependencies.eventPublisher === null ||
      typeof dependencies.eventPublisher.publish !==
        "function"
    )
  ) {
    throw new EnterpriseRiskValidationError(
      "dependencies.eventPublisher",
      "must implement EnterpriseRiskEventPublisher.",
    );
  }
}

function validateConfiguration(
  configuration: EnterpriseRiskConfiguration,
): void {
  assertObject(configuration, "configuration");

  assertNonEmptyString(
    configuration.reportingCurrency,
    "configuration.reportingCurrency",
  );

  assertNonNegativeNumber(
    configuration.maximumMarketDataAgeMs,
    "configuration.maximumMarketDataAgeMs",
  );

  assertNonNegativeNumber(
    configuration.maximumPortfolioDataAgeMs,
    "configuration.maximumPortfolioDataAgeMs",
  );

  assertNonNegativeNumber(
    configuration.maximumAccountDataAgeMs,
    "configuration.maximumAccountDataAgeMs",
  );

  assertNonNegativeNumber(
    configuration.decisionValidityMs,
    "configuration.decisionValidityMs",
  );
}

function normalizeConfiguration(
  configuration:
    | EnterpriseRiskConfiguration
    | undefined,
): EnterpriseRiskConfiguration {
  const normalized = Object.freeze({
    ...DEFAULT_ENTERPRISE_RISK_CONFIGURATION,
    ...(configuration ?? {}),
    metadata: cloneMetadata(configuration?.metadata),
  });

  validateConfiguration(normalized);

  return normalized;
}

function validateRequestEnvelope(
  request: EnterpriseRiskEvaluationRequest,
): void {
  assertObject(request, "request");

  assertNonEmptyString(
    request.requestId,
    "request.requestId",
  );

  assertNonNegativeNumber(
    request.requestedAt,
    "request.requestedAt",
  );

  assertObject(
    request.account,
    "request.account",
  );

  assertNonEmptyString(
    request.account.portfolioId,
    "request.account.portfolioId",
  );

  if (request.account.accountId !== undefined) {
    assertNonEmptyString(
      request.account.accountId,
      "request.account.accountId",
    );
  }

  assertObject(
    request.portfolioSnapshot,
    "request.portfolioSnapshot",
  );

  assertNonEmptyString(
    request.portfolioSnapshot.portfolioId,
    "request.portfolioSnapshot.portfolioId",
  );

  if (!Array.isArray(request.policies)) {
    throw new EnterpriseRiskValidationError(
      "request.policies",
      "must be an array.",
    );
  }

  if (!Array.isArray(request.circuitBreakers)) {
    throw new EnterpriseRiskValidationError(
      "request.circuitBreakers",
      "must be an array.",
    );
  }
}

function highestSeverity(
  violations: readonly EnterpriseRiskViolation[],
  warnings: readonly EnterpriseRiskWarning[],
  triggeredCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[],
): EnterpriseRiskSeverity {
  let severity: EnterpriseRiskSeverity = "INFO";

  for (const candidate of [
    ...violations.map((violation) =>
      violation.severity,
    ),
    ...warnings.map((warning) =>
      warning.severity,
    ),
  ]) {
    if (
      SEVERITY_RANK[candidate] >
      SEVERITY_RANK[severity]
    ) {
      severity = candidate;
    }
  }

  if (
    triggeredCircuitBreakers.some(
      (circuitBreaker) =>
        circuitBreaker.status === "TRIGGERED",
    ) &&
    SEVERITY_RANK.CRITICAL >
      SEVERITY_RANK[severity]
  ) {
    severity = "CRITICAL";
  }

  return severity;
}

function deduplicateById<
  T extends { readonly id: string },
>(
  values: readonly T[],
): readonly T[] {
  const byId = new Map<string, T>();

  for (const value of values) {
    if (!byId.has(value.id)) {
      byId.set(value.id, value);
    }
  }

  return Object.freeze(
    [...byId.values()].sort(compareByIdentifier),
  );
}

function determineStatus(
  violations: readonly EnterpriseRiskViolation[],
  restrictions: readonly EnterpriseRiskRestriction[],
  triggeredCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[],
  configuration: EnterpriseRiskConfiguration,
): EnterpriseRiskDecisionStatus {
  if (
    triggeredCircuitBreakers.some(
      (circuitBreaker) =>
        circuitBreaker.status === "TRIGGERED",
    )
  ) {
    return "HALTED";
  }

  if (violations.length > 0) {
    return "REJECTED";
  }

  if (
    restrictions.length > 0 &&
    configuration.allowRestrictedApproval
  ) {
    return "APPROVED_WITH_RESTRICTIONS";
  }

  if (restrictions.length > 0) {
    return "REJECTED";
  }

  return "APPROVED";
}

function decisionReason(
  status: EnterpriseRiskDecisionStatus,
  violationCount: number,
  warningCount: number,
  restrictionCount: number,
  circuitBreakerCount: number,
): string {
  switch (status) {
    case "HALTED":
      return (
        `Trading halted by ${circuitBreakerCount} ` +
        "triggered circuit breaker(s)."
      );

    case "REJECTED":
      return (
        `Risk request rejected with ${violationCount} ` +
        `violation(s) and ${restrictionCount} restriction(s).`
      );

    case "APPROVED_WITH_RESTRICTIONS":
      return (
        `Risk request approved with ${restrictionCount} ` +
        `restriction(s) and ${warningCount} warning(s).`
      );

    case "SKIPPED":
      return "Risk evaluation was skipped.";

    case "APPROVED":
    default:
      return (
        `Risk request approved with ${warningCount} ` +
        "warning(s)."
      );
  }
}

export class DefaultEnterpriseRiskEvaluator
  implements EnterpriseRiskEvaluator
{
  private readonly configuration:
    EnterpriseRiskConfiguration;

  public constructor(
    private readonly dependencies:
      EnterpriseRiskEvaluatorDependencies,
  ) {
    validateDependencies(dependencies);

    this.configuration = normalizeConfiguration(
      dependencies.configuration,
    );
  }

  public evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): EnterpriseRiskDecision {
    validateRequestEnvelope(request);

    const evaluatedAt =
      this.dependencies.clock.now();

    assertNonNegativeNumber(
      evaluatedAt,
      "dependencies.clock.now()",
    );

    const validationViolations =
      this.dependencies.requestValidator?.validate(
        request,
      ) ?? [];

    const limitOutcome =
      this.dependencies.limitEvaluator?.evaluate(
        request,
      ) ?? {
        violations: Object.freeze([]),
        warnings: Object.freeze([]),
        restrictions: Object.freeze([]),
        metrics: Object.freeze([]),
      };

    const violations = deduplicateById([
      ...validationViolations,
      ...limitOutcome.violations,
    ]).map(cloneViolation);

    const warnings = deduplicateById(
      limitOutcome.warnings,
    ).map(cloneWarning);

    const restrictions = Object.freeze(
      limitOutcome.restrictions.map(
        cloneRestriction,
      ),
    );

    const metrics = Object.freeze(
      limitOutcome.metrics.map(cloneMetric),
    );

    const evaluatedCircuitBreakers =
      this.dependencies.circuitBreakerEvaluator
        ?.evaluate(request, violations) ??
      request.circuitBreakers.filter(
        (circuitBreaker) =>
          circuitBreaker.status === "TRIGGERED",
      );

    const triggeredCircuitBreakers =
      deduplicateById(
        evaluatedCircuitBreakers,
      ).map(cloneCircuitBreaker);

    const status = determineStatus(
      violations,
      restrictions,
      triggeredCircuitBreakers,
      this.configuration,
    );

    const severity = highestSeverity(
      violations,
      warnings,
      triggeredCircuitBreakers,
    );

    const approved =
      status === "APPROVED" ||
      status ===
        "APPROVED_WITH_RESTRICTIONS";

    const decisionId =
      this.dependencies.identifierGenerator.generate(
        "enterprise-risk-decision",
      );

    assertNonEmptyString(
      decisionId,
      "generated decisionId",
    );

    const decision: EnterpriseRiskDecision =
      Object.freeze({
        decisionId,
        requestId: request.requestId,
        status,
        severity,
        approved,
        evaluatedAt,
        expiresAt:
          evaluatedAt +
          this.configuration.decisionValidityMs,
        violations: Object.freeze(violations),
        warnings: Object.freeze(warnings),
        restrictions,
        metrics,
        triggeredCircuitBreakers:
          Object.freeze(
            triggeredCircuitBreakers,
          ),
        reason: decisionReason(
          status,
          violations.length,
          warnings.length,
          restrictions.length,
          triggeredCircuitBreakers.length,
        ),
        metadata: Object.freeze({
          evaluationMode:
            request.evaluationMode,
          portfolioId:
            request.portfolioSnapshot.portfolioId,
          ...(request.account.accountId === undefined
            ? {}
            : {
                accountId:
                  request.account.accountId,
              }),
          policyCount:
            request.policies.length,
          evaluatedCircuitBreakerCount:
            request.circuitBreakers.length,
          source:
            "default-enterprise-risk-evaluator",
        }),
      });

    this.publishDecisionEvent(
      request,
      decision,
    );

    return decision;
  }

  private publishDecisionEvent(
    request: EnterpriseRiskEvaluationRequest,
    decision: EnterpriseRiskDecision,
  ): void {
    const publisher =
      this.dependencies.eventPublisher;

    if (publisher === undefined) {
      return;
    }

    const eventId =
      this.dependencies.identifierGenerator.generate(
        "enterprise-risk-event",
      );

    assertNonEmptyString(
      eventId,
      "generated eventId",
    );

    const event: EnterpriseRiskEvent =
      Object.freeze({
        eventId,
        eventType:
          decision.status === "HALTED"
            ? "TRADING_RESTRICTED"
            : decision.violations.length > 0
              ? "LIMIT_BREACHED"
              : decision.warnings.length > 0
                ? "LIMIT_WARNING"
                : "RISK_EVALUATED",
        severity: decision.severity,
        portfolioId:
          request.portfolioSnapshot.portfolioId,
        accountId:
          request.account.accountId,
        strategyId:
          request.account.strategyId,
        botId:
          request.account.botId,
        exchangeId:
          request.market?.exchangeId,
        chainId:
          request.market?.chainId,
        symbol: request.market?.symbol,
        message: decision.reason,
        occurredAt: decision.evaluatedAt,
        metadata: Object.freeze({
          decisionId:
            decision.decisionId,
          requestId:
            request.requestId,
          decisionStatus:
            decision.status,
          approved:
            decision.approved,
          violationCount:
            decision.violations.length,
          warningCount:
            decision.warnings.length,
          restrictionCount:
            decision.restrictions.length,
        }),
      });

    publisher.publish(event);
  }
}

export function createEnterpriseRiskEvaluator(
  dependencies: EnterpriseRiskEvaluatorDependencies,
): DefaultEnterpriseRiskEvaluator {
  return new DefaultEnterpriseRiskEvaluator(
    dependencies,
  );
}