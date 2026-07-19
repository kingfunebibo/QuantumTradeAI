/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-circuit-breaker-manager.ts
 *
 * Purpose:
 * Provides deterministic lifecycle management for enterprise-risk
 * circuit breakers.
 *
 * Supported lifecycle:
 *
 * ARMED -> TRIGGERED -> RECOVERING -> ARMED
 *
 * Circuit breakers may also be disabled from any state and subsequently
 * rearmed by an explicit administrative operation.
 *
 * Design goals:
 * - Deterministic
 * - Immutable
 * - Strongly typed
 * - Repository-neutral
 * - Multi-portfolio compatible
 * - Multi-exchange compatible
 * - Multi-chain compatible
 * - Suitable for automated and manual risk controls
 */

import {
  EnterpriseRiskAccountReference,
  EnterpriseRiskCircuitBreaker,
  EnterpriseRiskCircuitBreakerRepository,
  EnterpriseRiskCircuitBreakerScope,
  EnterpriseRiskCircuitBreakerStatus,
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
  EnterpriseRiskIdentifier,
  EnterpriseRiskIdentifierGenerator,
  EnterpriseRiskMarketReference,
  EnterpriseRiskMetadata,
  EnterpriseRiskSeverity,
  EnterpriseRiskTimestamp,
  EnterpriseRiskViolation,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskCircuitBreakerManagerOptions {
  /**
   * Optional repository used to persist circuit-breaker state.
   */
  readonly repository?: EnterpriseRiskCircuitBreakerRepository;

  /**
   * Optional publisher used to emit circuit-breaker lifecycle events.
   */
  readonly eventPublisher?: EnterpriseRiskEventPublisher;

  /**
   * Optional deterministic identifier generator used for emitted events.
   */
  readonly identifierGenerator?: EnterpriseRiskIdentifierGenerator;

  /**
   * Default recovery delay applied when triggering a circuit breaker.
   */
  readonly defaultRecoveryDelayMs?: number;
}

export interface EnterpriseRiskCircuitBreakerTriggerRequest {
  readonly circuitBreaker: EnterpriseRiskCircuitBreaker;
  readonly reason: string;
  readonly triggeredAt: EnterpriseRiskTimestamp;
  readonly recoveryDelayMs?: number;
  readonly manuallyTriggered?: boolean;
  readonly severity?: EnterpriseRiskSeverity;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreakerRecoveryRequest {
  readonly circuitBreaker: EnterpriseRiskCircuitBreaker;
  readonly recoveringAt: EnterpriseRiskTimestamp;
  readonly reason?: string;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreakerResetRequest {
  readonly circuitBreaker: EnterpriseRiskCircuitBreaker;
  readonly resetAt: EnterpriseRiskTimestamp;
  readonly reason?: string;
  readonly force?: boolean;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreakerDisableRequest {
  readonly circuitBreaker: EnterpriseRiskCircuitBreaker;
  readonly disabledAt: EnterpriseRiskTimestamp;
  readonly reason: string;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreakerArmRequest {
  readonly circuitBreaker: EnterpriseRiskCircuitBreaker;
  readonly armedAt: EnterpriseRiskTimestamp;
  readonly reason?: string;
  readonly metadata?: EnterpriseRiskMetadata;
}

export interface EnterpriseRiskCircuitBreakerEvaluationContext {
  readonly account: EnterpriseRiskAccountReference;
  readonly market?: EnterpriseRiskMarketReference;
  readonly violations: readonly EnterpriseRiskViolation[];
  readonly evaluatedAt: EnterpriseRiskTimestamp;
}

export interface EnterpriseRiskCircuitBreakerEvaluationResult {
  readonly applicableCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[];
  readonly blockingCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[];
  readonly triggeredCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[];
  readonly recoveringCircuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[];
  readonly tradingAllowed: boolean;
  readonly highestSeverity: EnterpriseRiskSeverity;
}

export interface EnterpriseRiskCircuitBreakerManager {
  trigger(
    request: EnterpriseRiskCircuitBreakerTriggerRequest,
  ): EnterpriseRiskCircuitBreaker;

  beginRecovery(
    request: EnterpriseRiskCircuitBreakerRecoveryRequest,
  ): EnterpriseRiskCircuitBreaker;

  reset(
    request: EnterpriseRiskCircuitBreakerResetRequest,
  ): EnterpriseRiskCircuitBreaker;

  disable(
    request: EnterpriseRiskCircuitBreakerDisableRequest,
  ): EnterpriseRiskCircuitBreaker;

  arm(
    request: EnterpriseRiskCircuitBreakerArmRequest,
  ): EnterpriseRiskCircuitBreaker;

  evaluate(
    context: EnterpriseRiskCircuitBreakerEvaluationContext,
  ): EnterpriseRiskCircuitBreakerEvaluationResult;
}

interface NormalizedEnterpriseRiskCircuitBreakerManagerOptions {
  readonly repository?: EnterpriseRiskCircuitBreakerRepository;
  readonly eventPublisher?: EnterpriseRiskEventPublisher;
  readonly identifierGenerator?: EnterpriseRiskIdentifierGenerator;
  readonly defaultRecoveryDelayMs: number;
}

const DEFAULT_RECOVERY_DELAY_MS = 60_000;

const SEVERITY_ORDER: Readonly<
  Record<EnterpriseRiskSeverity, number>
> = Object.freeze({
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
});

function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
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
  if (typeof value !== "string") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a string.",
    );
  }

  if (value.trim().length === 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not be empty.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative integer.",
    );
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a boolean.",
    );
  }
}

function isRepository(
  value: unknown,
): value is EnterpriseRiskCircuitBreakerRepository {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  return (
    "getById" in value &&
    typeof value.getById === "function" &&
    "getActive" in value &&
    typeof value.getActive === "function" &&
    "getApplicable" in value &&
    typeof value.getApplicable === "function" &&
    "save" in value &&
    typeof value.save === "function" &&
    "remove" in value &&
    typeof value.remove === "function"
  );
}

function isEventPublisher(
  value: unknown,
): value is EnterpriseRiskEventPublisher {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  return (
    "publish" in value &&
    typeof value.publish === "function"
  );
}

function isIdentifierGenerator(
  value: unknown,
): value is EnterpriseRiskIdentifierGenerator {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  return (
    "generate" in value &&
    typeof value.generate === "function"
  );
}

function normalizeOptions(
  options?: EnterpriseRiskCircuitBreakerManagerOptions,
): NormalizedEnterpriseRiskCircuitBreakerManagerOptions {
  if (
    options !== undefined &&
    (typeof options !== "object" ||
      options === null ||
      Array.isArray(options))
  ) {
    throw new EnterpriseRiskValidationError(
      "options",
      "must be a non-null object.",
    );
  }

  const repository = options?.repository;
  const eventPublisher = options?.eventPublisher;
  const identifierGenerator =
    options?.identifierGenerator;
  const defaultRecoveryDelayMs =
    options?.defaultRecoveryDelayMs ??
    DEFAULT_RECOVERY_DELAY_MS;

  if (
    repository !== undefined &&
    !isRepository(repository)
  ) {
    throw new EnterpriseRiskValidationError(
      "options.repository",
      "must implement EnterpriseRiskCircuitBreakerRepository.",
    );
  }

  if (
    eventPublisher !== undefined &&
    !isEventPublisher(eventPublisher)
  ) {
    throw new EnterpriseRiskValidationError(
      "options.eventPublisher",
      "must implement EnterpriseRiskEventPublisher.",
    );
  }

  if (
    identifierGenerator !== undefined &&
    !isIdentifierGenerator(identifierGenerator)
  ) {
    throw new EnterpriseRiskValidationError(
      "options.identifierGenerator",
      "must implement EnterpriseRiskIdentifierGenerator.",
    );
  }

  assertNonNegativeInteger(
    defaultRecoveryDelayMs,
    "options.defaultRecoveryDelayMs",
  );

  return Object.freeze({
    repository,
    eventPublisher,
    identifierGenerator,
    defaultRecoveryDelayMs,
  });
}

function validateScope(
  scope: unknown,
  field: string,
): asserts scope is EnterpriseRiskCircuitBreakerScope {
  switch (scope) {
    case "GLOBAL":
    case "PORTFOLIO":
    case "ACCOUNT":
    case "EXCHANGE":
    case "CHAIN":
    case "ASSET":
    case "SYMBOL":
    case "STRATEGY":
    case "BOT":
      return;

    default:
      throw new EnterpriseRiskValidationError(
        field,
        "contains an unsupported circuit-breaker scope.",
      );
  }
}

function validateStatus(
  status: unknown,
  field: string,
): asserts status is EnterpriseRiskCircuitBreakerStatus {
  switch (status) {
    case "ARMED":
    case "TRIGGERED":
    case "RECOVERING":
    case "DISABLED":
      return;

    default:
      throw new EnterpriseRiskValidationError(
        field,
        "contains an unsupported circuit-breaker status.",
      );
  }
}

function validateCircuitBreaker(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  field = "circuitBreaker",
): void {
  assertRecord(circuitBreaker, field);

  assertNonEmptyString(
    circuitBreaker.id,
    `${field}.id`,
  );

  validateScope(
    circuitBreaker.scope,
    `${field}.scope`,
  );

  validateStatus(
    circuitBreaker.status,
    `${field}.status`,
  );

  if (circuitBreaker.scope === "GLOBAL") {
    if (circuitBreaker.scopeId !== undefined) {
      throw new EnterpriseRiskValidationError(
        `${field}.scopeId`,
        "must be omitted for a GLOBAL circuit breaker.",
      );
    }
  } else {
    assertNonEmptyString(
      circuitBreaker.scopeId,
      `${field}.scopeId`,
    );
  }

  if (circuitBreaker.reason !== undefined) {
    assertNonEmptyString(
      circuitBreaker.reason,
      `${field}.reason`,
    );
  }

  if (circuitBreaker.triggeredAt !== undefined) {
    assertNonNegativeInteger(
      circuitBreaker.triggeredAt,
      `${field}.triggeredAt`,
    );
  }

  if (
    circuitBreaker.recoveryEligibleAt !== undefined
  ) {
    assertNonNegativeInteger(
      circuitBreaker.recoveryEligibleAt,
      `${field}.recoveryEligibleAt`,
    );
  }

  assertBoolean(
    circuitBreaker.manuallyTriggered,
    `${field}.manuallyTriggered`,
  );

  if (
    circuitBreaker.triggeredAt !== undefined &&
    circuitBreaker.recoveryEligibleAt !== undefined &&
    circuitBreaker.recoveryEligibleAt <
      circuitBreaker.triggeredAt
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.recoveryEligibleAt`,
      "must not be earlier than triggeredAt.",
    );
  }

  if (
    circuitBreaker.status === "TRIGGERED" &&
    circuitBreaker.triggeredAt === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.triggeredAt`,
      "is required when status is TRIGGERED.",
    );
  }

  if (
    circuitBreaker.status === "RECOVERING" &&
    circuitBreaker.triggeredAt === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.triggeredAt`,
      "is required when status is RECOVERING.",
    );
  }
}

function sanitizeIdentifierPart(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createEventIdentifier(
  prefix: string,
  circuitBreakerId: string,
  timestamp: EnterpriseRiskTimestamp,
  generator?: EnterpriseRiskIdentifierGenerator,
): EnterpriseRiskIdentifier {
  if (generator !== undefined) {
    return generator.generate(prefix);
  }

  const normalizedCircuitBreakerId =
    sanitizeIdentifierPart(circuitBreakerId) ||
    "circuit-breaker";

  return [
    prefix,
    normalizedCircuitBreakerId,
    timestamp.toString(10),
  ].join(":");
}

function mergeMetadata(
  current: EnterpriseRiskMetadata | undefined,
  supplied: EnterpriseRiskMetadata | undefined,
): EnterpriseRiskMetadata | undefined {
  if (
    current === undefined &&
    supplied === undefined
  ) {
    return undefined;
  }

  return Object.freeze({
    ...(current ?? {}),
    ...(supplied ?? {}),
  });
}

function createEvent(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  eventType:
    | "CIRCUIT_BREAKER_ARMED"
    | "CIRCUIT_BREAKER_TRIGGERED"
    | "CIRCUIT_BREAKER_RECOVERING"
    | "CIRCUIT_BREAKER_RESET",
  severity: EnterpriseRiskSeverity,
  message: string,
  occurredAt: EnterpriseRiskTimestamp,
  identifierGenerator:
    | EnterpriseRiskIdentifierGenerator
    | undefined,
  metadata?: EnterpriseRiskMetadata,
): EnterpriseRiskEvent {
  const scopeMetadata = Object.freeze({
    circuitBreakerId: circuitBreaker.id,
    circuitBreakerScope: circuitBreaker.scope,
    circuitBreakerScopeId:
      circuitBreaker.scopeId ?? null,
    circuitBreakerStatus: circuitBreaker.status,
  });

  const eventMetadata = Object.freeze({
    ...scopeMetadata,
    ...(metadata ?? {}),
  });

  const baseEvent = {
    eventId: createEventIdentifier(
      "enterprise-risk-event",
      circuitBreaker.id,
      occurredAt,
      identifierGenerator,
    ),
    eventType,
    severity,
    message,
    occurredAt,
    metadata: eventMetadata,
  } as const;

  switch (circuitBreaker.scope) {
    case "PORTFOLIO":
      return Object.freeze({
        ...baseEvent,
        portfolioId: circuitBreaker.scopeId,
      });

    case "ACCOUNT":
      return Object.freeze({
        ...baseEvent,
        accountId: circuitBreaker.scopeId,
      });

    case "EXCHANGE":
      return Object.freeze({
        ...baseEvent,
        exchangeId: circuitBreaker.scopeId,
      });

    case "CHAIN":
      return Object.freeze({
        ...baseEvent,
        chainId: circuitBreaker.scopeId,
      });

    case "SYMBOL":
      return Object.freeze({
        ...baseEvent,
        symbol: circuitBreaker.scopeId,
      });

    case "STRATEGY":
      return Object.freeze({
        ...baseEvent,
        strategyId: circuitBreaker.scopeId,
      });

    case "BOT":
      return Object.freeze({
        ...baseEvent,
        botId: circuitBreaker.scopeId,
      });

    case "ASSET":
    case "GLOBAL":
      return Object.freeze(baseEvent);
  }
}

function persist(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  repository:
    | EnterpriseRiskCircuitBreakerRepository
    | undefined,
): void {
  repository?.save(circuitBreaker);
}

function publish(
  event: EnterpriseRiskEvent,
  publisher:
    | EnterpriseRiskEventPublisher
    | undefined,
): void {
  publisher?.publish(event);
}

function highestSeverity(
  violations: readonly EnterpriseRiskViolation[],
): EnterpriseRiskSeverity {
  let highest: EnterpriseRiskSeverity = "INFO";

  for (const violation of violations) {
    if (
      SEVERITY_ORDER[violation.severity] >
      SEVERITY_ORDER[highest]
    ) {
      highest = violation.severity;
    }
  }

  return highest;
}

function scopeMatchesViolation(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  violation: EnterpriseRiskViolation,
): boolean {
  if (circuitBreaker.scope === "GLOBAL") {
    return true;
  }

  if (
    violation.scope === undefined ||
    violation.scopeId === undefined
  ) {
    return false;
  }

  return (
    circuitBreaker.scope === violation.scope &&
    circuitBreaker.scopeId === violation.scopeId
  );
}

function isBlockingStatus(
  status: EnterpriseRiskCircuitBreakerStatus,
): boolean {
  return (
    status === "TRIGGERED" ||
    status === "RECOVERING"
  );
}

function isRecoveryEligible(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  timestamp: EnterpriseRiskTimestamp,
): boolean {
  if (
    circuitBreaker.recoveryEligibleAt === undefined
  ) {
    return true;
  }

  return (
    timestamp >= circuitBreaker.recoveryEligibleAt
  );
}

export class DeterministicEnterpriseRiskCircuitBreakerManager
  implements EnterpriseRiskCircuitBreakerManager
{
  private readonly options: NormalizedEnterpriseRiskCircuitBreakerManagerOptions;

  public constructor(
    options?: EnterpriseRiskCircuitBreakerManagerOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  public trigger(
    request: EnterpriseRiskCircuitBreakerTriggerRequest,
  ): EnterpriseRiskCircuitBreaker {
    assertRecord(request, "request");
    validateCircuitBreaker(
      request.circuitBreaker,
      "request.circuitBreaker",
    );

    assertNonEmptyString(
      request.reason,
      "request.reason",
    );

    assertNonNegativeInteger(
      request.triggeredAt,
      "request.triggeredAt",
    );

    const recoveryDelayMs =
      request.recoveryDelayMs ??
      this.options.defaultRecoveryDelayMs;

    assertNonNegativeInteger(
      recoveryDelayMs,
      "request.recoveryDelayMs",
    );

    const manuallyTriggered =
      request.manuallyTriggered ?? false;

    assertBoolean(
      manuallyTriggered,
      "request.manuallyTriggered",
    );

    if (
      request.circuitBreaker.status === "DISABLED"
    ) {
      throw new EnterpriseRiskValidationError(
        "request.circuitBreaker.status",
        "a disabled circuit breaker cannot be triggered.",
      );
    }

    if (
      request.circuitBreaker.status === "TRIGGERED"
    ) {
      return request.circuitBreaker;
    }

    const triggered = Object.freeze({
      ...request.circuitBreaker,
      status: "TRIGGERED" as const,
      reason: request.reason.trim(),
      triggeredAt: request.triggeredAt,
      recoveryEligibleAt:
        request.triggeredAt + recoveryDelayMs,
      manuallyTriggered,
      metadata: mergeMetadata(
        request.circuitBreaker.metadata,
        request.metadata,
      ),
    });

    persist(triggered, this.options.repository);

    publish(
      createEvent(
        triggered,
        "CIRCUIT_BREAKER_TRIGGERED",
        request.severity ?? "CRITICAL",
        `Circuit breaker ${triggered.id} was triggered: ` +
          `${request.reason.trim()}`,
        request.triggeredAt,
        this.options.identifierGenerator,
        request.metadata,
      ),
      this.options.eventPublisher,
    );

    return triggered;
  }

  public beginRecovery(
    request: EnterpriseRiskCircuitBreakerRecoveryRequest,
  ): EnterpriseRiskCircuitBreaker {
    assertRecord(request, "request");
    validateCircuitBreaker(
      request.circuitBreaker,
      "request.circuitBreaker",
    );

    assertNonNegativeInteger(
      request.recoveringAt,
      "request.recoveringAt",
    );

    if (request.reason !== undefined) {
      assertNonEmptyString(
        request.reason,
        "request.reason",
      );
    }

    if (
      request.circuitBreaker.status !== "TRIGGERED"
    ) {
      throw new EnterpriseRiskValidationError(
        "request.circuitBreaker.status",
        "must be TRIGGERED before recovery can begin.",
      );
    }

    if (
      !isRecoveryEligible(
        request.circuitBreaker,
        request.recoveringAt,
      )
    ) {
      throw new EnterpriseRiskValidationError(
        "request.recoveringAt",
        "must be at or after recoveryEligibleAt.",
      );
    }

    const recovering = Object.freeze({
      ...request.circuitBreaker,
      status: "RECOVERING" as const,
      reason:
        request.reason?.trim() ??
        request.circuitBreaker.reason,
      metadata: mergeMetadata(
        request.circuitBreaker.metadata,
        request.metadata,
      ),
    });

    persist(recovering, this.options.repository);

    publish(
      createEvent(
        recovering,
        "CIRCUIT_BREAKER_RECOVERING",
        "HIGH",
        `Circuit breaker ${recovering.id} entered recovery.`,
        request.recoveringAt,
        this.options.identifierGenerator,
        request.metadata,
      ),
      this.options.eventPublisher,
    );

    return recovering;
  }

  public reset(
    request: EnterpriseRiskCircuitBreakerResetRequest,
  ): EnterpriseRiskCircuitBreaker {
    assertRecord(request, "request");
    validateCircuitBreaker(
      request.circuitBreaker,
      "request.circuitBreaker",
    );

    assertNonNegativeInteger(
      request.resetAt,
      "request.resetAt",
    );

    if (request.reason !== undefined) {
      assertNonEmptyString(
        request.reason,
        "request.reason",
      );
    }

    const force = request.force ?? false;

    assertBoolean(force, "request.force");

    if (
      request.circuitBreaker.status !== "RECOVERING" &&
      !force
    ) {
      throw new EnterpriseRiskValidationError(
        "request.circuitBreaker.status",
        "must be RECOVERING before reset unless force is true.",
      );
    }

    if (
      request.circuitBreaker.status === "DISABLED" &&
      !force
    ) {
      throw new EnterpriseRiskValidationError(
        "request.circuitBreaker.status",
        "a disabled circuit breaker requires a forced reset.",
      );
    }

    const reset = Object.freeze({
      ...request.circuitBreaker,
      status: "ARMED" as const,
      reason: request.reason?.trim(),
      triggeredAt: undefined,
      recoveryEligibleAt: undefined,
      manuallyTriggered: false,
      metadata: mergeMetadata(
        request.circuitBreaker.metadata,
        request.metadata,
      ),
    });

    persist(reset, this.options.repository);

    publish(
      createEvent(
        reset,
        "CIRCUIT_BREAKER_RESET",
        "INFO",
        `Circuit breaker ${reset.id} was reset.`,
        request.resetAt,
        this.options.identifierGenerator,
        request.metadata,
      ),
      this.options.eventPublisher,
    );

    return reset;
  }

  public disable(
    request: EnterpriseRiskCircuitBreakerDisableRequest,
  ): EnterpriseRiskCircuitBreaker {
    assertRecord(request, "request");
    validateCircuitBreaker(
      request.circuitBreaker,
      "request.circuitBreaker",
    );

    assertNonNegativeInteger(
      request.disabledAt,
      "request.disabledAt",
    );

    assertNonEmptyString(
      request.reason,
      "request.reason",
    );

    const disabled = Object.freeze({
      ...request.circuitBreaker,
      status: "DISABLED" as const,
      reason: request.reason.trim(),
      metadata: mergeMetadata(
        request.circuitBreaker.metadata,
        request.metadata,
      ),
    });

    persist(disabled, this.options.repository);

    return disabled;
  }

  public arm(
    request: EnterpriseRiskCircuitBreakerArmRequest,
  ): EnterpriseRiskCircuitBreaker {
    assertRecord(request, "request");
    validateCircuitBreaker(
      request.circuitBreaker,
      "request.circuitBreaker",
    );

    assertNonNegativeInteger(
      request.armedAt,
      "request.armedAt",
    );

    if (request.reason !== undefined) {
      assertNonEmptyString(
        request.reason,
        "request.reason",
      );
    }

    const armed = Object.freeze({
      ...request.circuitBreaker,
      status: "ARMED" as const,
      reason: request.reason?.trim(),
      triggeredAt: undefined,
      recoveryEligibleAt: undefined,
      manuallyTriggered: false,
      metadata: mergeMetadata(
        request.circuitBreaker.metadata,
        request.metadata,
      ),
    });

    persist(armed, this.options.repository);

    publish(
      createEvent(
        armed,
        "CIRCUIT_BREAKER_ARMED",
        "INFO",
        `Circuit breaker ${armed.id} was armed.`,
        request.armedAt,
        this.options.identifierGenerator,
        request.metadata,
      ),
      this.options.eventPublisher,
    );

    return armed;
  }

  public evaluate(
    context: EnterpriseRiskCircuitBreakerEvaluationContext,
  ): EnterpriseRiskCircuitBreakerEvaluationResult {
    assertRecord(context, "context");
    assertRecord(context.account, "context.account");

    assertNonEmptyString(
      context.account.portfolioId,
      "context.account.portfolioId",
    );

    assertNonEmptyString(
      context.account.accountId,
      "context.account.accountId",
    );

    assertNonNegativeInteger(
      context.evaluatedAt,
      "context.evaluatedAt",
    );

    if (!Array.isArray(context.violations)) {
      throw new EnterpriseRiskValidationError(
        "context.violations",
        "must be an array.",
      );
    }

    const applicableCircuitBreakers = Object.freeze(
      [
        ...(
          this.options.repository?.getApplicable(
            context.account,
            context.market,
          ) ?? []
        ),
      ].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );

    applicableCircuitBreakers.forEach(
      (circuitBreaker, index) => {
        validateCircuitBreaker(
          circuitBreaker,
          `applicableCircuitBreakers[${index}]`,
        );
      },
    );

    const blockingCircuitBreakers = Object.freeze(
      applicableCircuitBreakers.filter(
        (circuitBreaker) =>
          isBlockingStatus(circuitBreaker.status),
      ),
    );

    const triggeredCircuitBreakers = Object.freeze(
      applicableCircuitBreakers.filter(
        (circuitBreaker) =>
          circuitBreaker.status === "TRIGGERED",
      ),
    );

    const recoveringCircuitBreakers = Object.freeze(
      applicableCircuitBreakers.filter(
        (circuitBreaker) =>
          circuitBreaker.status === "RECOVERING",
      ),
    );

    const matchingTriggeredCircuitBreakers =
      triggeredCircuitBreakers.filter(
        (circuitBreaker) =>
          context.violations.some((violation) =>
            scopeMatchesViolation(
              circuitBreaker,
              violation,
            ),
          ),
      );

    const severity = highestSeverity(
      context.violations,
    );

    return Object.freeze({
      applicableCircuitBreakers,
      blockingCircuitBreakers,
      triggeredCircuitBreakers: Object.freeze(
        matchingTriggeredCircuitBreakers.length > 0
          ? matchingTriggeredCircuitBreakers
          : triggeredCircuitBreakers,
      ),
      recoveringCircuitBreakers,
      tradingAllowed:
        blockingCircuitBreakers.length === 0,
      highestSeverity: severity,
    });
  }
}

export function triggerEnterpriseRiskCircuitBreaker(
  request: EnterpriseRiskCircuitBreakerTriggerRequest,
  options?: EnterpriseRiskCircuitBreakerManagerOptions,
): EnterpriseRiskCircuitBreaker {
  return new DeterministicEnterpriseRiskCircuitBreakerManager(
    options,
  ).trigger(request);
}

export function beginEnterpriseRiskCircuitBreakerRecovery(
  request: EnterpriseRiskCircuitBreakerRecoveryRequest,
  options?: EnterpriseRiskCircuitBreakerManagerOptions,
): EnterpriseRiskCircuitBreaker {
  return new DeterministicEnterpriseRiskCircuitBreakerManager(
    options,
  ).beginRecovery(request);
}

export function resetEnterpriseRiskCircuitBreaker(
  request: EnterpriseRiskCircuitBreakerResetRequest,
  options?: EnterpriseRiskCircuitBreakerManagerOptions,
): EnterpriseRiskCircuitBreaker {
  return new DeterministicEnterpriseRiskCircuitBreakerManager(
    options,
  ).reset(request);
}