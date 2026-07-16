/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/exchange-router.types.ts
 *
 * Purpose:
 * Defines deterministic routing contracts, decisions, execution attempts,
 * retry behavior, failover controls, and router-domain errors.
 */

import type {
  ExchangeCapabilityRequirement,
} from "./exchange-capability-registry";

import type {
  ExchangeDiscoveryCandidate,
  ExchangeDiscoveryRequest,
} from "./exchange-discovery";

import type {
  UnifiedExchange,
  UnifiedExchangeErrorCode,
} from "./unified-exchange-interface";

export type ExchangeRouterOperation =
  | "GET_TICKER"
  | "GET_ORDER_BOOK"
  | "GET_CANDLES"
  | "GET_INSTRUMENTS"
  | "GET_BALANCES"
  | "GET_POSITIONS"
  | "PLACE_ORDER"
  | "CANCEL_ORDER"
  | "GET_ORDER"
  | "CUSTOM";

export type ExchangeRoutingStrategy =
  | "FIRST_MATCH"
  | "PRIORITY"
  | "PREFERRED"
  | "HEALTH_AWARE"
  | "ROUND_ROBIN";

export type ExchangeRouterExecutionOutcome =
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED";

export type ExchangeRouterDecisionOutcome =
  | "SELECTED"
  | "NO_CANDIDATE";

export type ExchangeRouterSkipReason =
  | "NOT_SELECTED"
  | "CAPABILITY_MISMATCH"
  | "LIFECYCLE_INELIGIBLE"
  | "HEALTH_INELIGIBLE"
  | "FAILOVER_EXHAUSTED"
  | "NON_RETRYABLE_FAILURE"
  | "MAX_ATTEMPTS_REACHED";

export type ExchangeRouterErrorCode =
  | "INVALID_ROUTING_REQUEST"
  | "INVALID_OPERATION"
  | "INVALID_STRATEGY"
  | "INVALID_ATTEMPT_LIMIT"
  | "INVALID_RETRY_DELAY"
  | "INVALID_EXCHANGE_ID"
  | "NO_ROUTE_AVAILABLE"
  | "ROUTED_OPERATION_FAILED"
  | "FAILOVER_EXHAUSTED"
  | "ROUTER_NOT_CONFIGURED"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_EXECUTOR_RESULT";

export class ExchangeRouterError extends Error {
  public readonly code: ExchangeRouterErrorCode;
  public readonly operation?: ExchangeRouterOperation;
  public readonly exchangeId?: string;
  public readonly retryable: boolean;

  public constructor(
    code: ExchangeRouterErrorCode,
    message: string,
    options: Readonly<{
      operation?: ExchangeRouterOperation;
      exchangeId?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ExchangeRouterError";
    this.code = code;
    this.operation = options.operation;
    this.exchangeId = options.exchangeId;
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ExchangeRouterRetryPolicy {
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maximumRetryDelayMs: number;
  readonly retryableErrorCodes: readonly UnifiedExchangeErrorCode[];
}

export interface ExchangeRouterFailoverPolicy {
  readonly enabled: boolean;
  readonly maximumExchangeAttempts: number;
  readonly retryCurrentExchangeFirst: boolean;
  readonly failoverOnNonRetryableError: boolean;
}

export interface ExchangeRouterRequest {
  readonly operation: ExchangeRouterOperation;
  readonly strategy?: ExchangeRoutingStrategy;
  readonly capabilities?: ExchangeCapabilityRequirement;
  readonly discovery?: Omit<ExchangeDiscoveryRequest, "capabilities">;
  readonly retryPolicy?: Partial<ExchangeRouterRetryPolicy>;
  readonly failoverPolicy?: Partial<ExchangeRouterFailoverPolicy>;
  readonly requestId?: string;
  readonly requestedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface NormalizedExchangeRouterRequest {
  readonly operation: ExchangeRouterOperation;
  readonly strategy: ExchangeRoutingStrategy;
  readonly discovery: ExchangeDiscoveryRequest;
  readonly retryPolicy: ExchangeRouterRetryPolicy;
  readonly failoverPolicy: ExchangeRouterFailoverPolicy;
  readonly requestId?: string;
  readonly requestedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExchangeRouterDecision<
  TExchange extends UnifiedExchange,
> {
  readonly outcome: ExchangeRouterDecisionOutcome;
  readonly request: NormalizedExchangeRouterRequest;
  readonly selectedCandidate?: ExchangeDiscoveryCandidate<TExchange>;
  readonly candidates: readonly ExchangeDiscoveryCandidate<TExchange>[];
  readonly selectedExchangeId?: string;
  readonly decidedAt: number;
  readonly reason: string;
}

export interface ExchangeRouterAttempt {
  readonly attemptNumber: number;
  readonly exchangeAttemptNumber: number;
  readonly exchangeId: string;
  readonly operation: ExchangeRouterOperation;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly outcome: ExchangeRouterExecutionOutcome;
  readonly retryable: boolean;
  readonly errorCode?: UnifiedExchangeErrorCode | ExchangeRouterErrorCode;
  readonly errorMessage?: string;
  readonly skipReason?: ExchangeRouterSkipReason;
}

export interface ExchangeRouterSuccess<TResult> {
  readonly outcome: "SUCCEEDED";
  readonly request: NormalizedExchangeRouterRequest;
  readonly decision: ExchangeRouterDecision<UnifiedExchange>;
  readonly exchangeId: string;
  readonly result: TResult;
  readonly attempts: readonly ExchangeRouterAttempt[];
  readonly completedAt: number;
}

export interface ExchangeRouterFailure {
  readonly outcome: "FAILED";
  readonly request: NormalizedExchangeRouterRequest;
  readonly decision: ExchangeRouterDecision<UnifiedExchange>;
  readonly attempts: readonly ExchangeRouterAttempt[];
  readonly completedAt: number;
  readonly error: ExchangeRouterError;
}

export type ExchangeRouterResult<TResult> =
  | ExchangeRouterSuccess<TResult>
  | ExchangeRouterFailure;

export interface ExchangeRouterExecutionContext<
  TExchange extends UnifiedExchange,
> {
  readonly request: NormalizedExchangeRouterRequest;
  readonly candidate: ExchangeDiscoveryCandidate<TExchange>;
  readonly attemptNumber: number;
  readonly exchangeAttemptNumber: number;
}

export interface ExchangeRouterExecutor<
  TExchange extends UnifiedExchange,
  TResult,
> {
  execute(
    exchange: TExchange,
    context: ExchangeRouterExecutionContext<TExchange>,
  ): Promise<TResult>;
}

export interface ExchangeRouterClock {
  now(): number;
}

export class SystemExchangeRouterClock implements ExchangeRouterClock {
  public now(): number {
    return Date.now();
  }
}

export interface ExchangeRouterDelay {
  wait(milliseconds: number): Promise<void>;
}

export class SystemExchangeRouterDelay implements ExchangeRouterDelay {
  public async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

export interface ExchangeRouterContract<
  TExchange extends UnifiedExchange,
> {
  select(request: ExchangeRouterRequest): ExchangeRouterDecision<TExchange>;

  route<TResult>(
    request: ExchangeRouterRequest,
    executor: ExchangeRouterExecutor<TExchange, TResult>,
  ): Promise<ExchangeRouterResult<TResult>>;
}

export const EXCHANGE_ROUTER_OPERATIONS = [
  "GET_TICKER",
  "GET_ORDER_BOOK",
  "GET_CANDLES",
  "GET_INSTRUMENTS",
  "GET_BALANCES",
  "GET_POSITIONS",
  "PLACE_ORDER",
  "CANCEL_ORDER",
  "GET_ORDER",
  "CUSTOM",
] as const satisfies readonly ExchangeRouterOperation[];

export const EXCHANGE_ROUTING_STRATEGIES = [
  "FIRST_MATCH",
  "PRIORITY",
  "PREFERRED",
  "HEALTH_AWARE",
  "ROUND_ROBIN",
] as const satisfies readonly ExchangeRoutingStrategy[];

export const UNIFIED_EXCHANGE_ERROR_CODES = [
  "INVALID_EXCHANGE_ID",
  "INVALID_REQUEST",
  "INVALID_SYMBOL",
  "INVALID_QUANTITY",
  "INVALID_PRICE",
  "INVALID_TIMESTAMP",
  "INVALID_RESPONSE",
  "CAPABILITY_NOT_SUPPORTED",
  "AUTHENTICATION_REQUIRED",
  "CONNECTOR_NOT_READY",
  "REQUEST_REJECTED",
  "ORDER_NOT_FOUND",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "TIMEOUT",
  "EXCHANGE_UNAVAILABLE",
  "UNKNOWN_ERROR",
] as const satisfies readonly UnifiedExchangeErrorCode[];

export const DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY =
  Object.freeze({
    maxAttempts: 3,
    retryDelayMs: 100,
    backoffMultiplier: 2,
    maximumRetryDelayMs: 5_000,
    retryableErrorCodes: Object.freeze([
      "RATE_LIMITED",
      "NETWORK_ERROR",
      "TIMEOUT",
      "EXCHANGE_UNAVAILABLE",
    ] as const satisfies readonly UnifiedExchangeErrorCode[]),
  }) satisfies ExchangeRouterRetryPolicy;

export const DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY:
  ExchangeRouterFailoverPolicy =
  Object.freeze({
    enabled: true,
    maximumExchangeAttempts: 3,
    retryCurrentExchangeFirst: false,
    failoverOnNonRetryableError: false,
  });

export function isExchangeRouterOperation(
  value: unknown,
): value is ExchangeRouterOperation {
  return (
    typeof value === "string" &&
    (EXCHANGE_ROUTER_OPERATIONS as readonly string[]).includes(value)
  );
}

export function isExchangeRoutingStrategy(
  value: unknown,
): value is ExchangeRoutingStrategy {
  return (
    typeof value === "string" &&
    (EXCHANGE_ROUTING_STRATEGIES as readonly string[]).includes(value)
  );
}

export function normalizeExchangeRouterRequest(
  request: ExchangeRouterRequest,
): NormalizedExchangeRouterRequest {
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Exchange router request must be a record object.",
    );
  }

  if (!isExchangeRouterOperation(request.operation)) {
    throw new ExchangeRouterError(
      "INVALID_OPERATION",
      `Unsupported exchange router operation "${String(request.operation)}".`,
    );
  }

  const strategy = request.strategy ?? "FIRST_MATCH";

  if (!isExchangeRoutingStrategy(strategy)) {
    throw new ExchangeRouterError(
      "INVALID_STRATEGY",
      `Unsupported exchange routing strategy "${String(strategy)}".`,
      { operation: request.operation },
    );
  }

  if (
    request.requestedAt !== undefined &&
    (!Number.isFinite(request.requestedAt) || request.requestedAt < 0)
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Router request timestamp must be finite and non-negative.",
      { operation: request.operation },
    );
  }

  if (
    request.discovery !== undefined &&
    (
      request.discovery === null ||
      typeof request.discovery !== "object" ||
      Array.isArray(request.discovery)
    )
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Exchange router discovery options must be a record object.",
      { operation: request.operation },
    );
  }

  const retryPolicy =
    normalizeExchangeRouterRetryPolicy(request.retryPolicy);

  const failoverPolicy =
    normalizeExchangeRouterFailoverPolicy(request.failoverPolicy);

  const metadata =
    freezeExchangeRouterMetadata(request.metadata);

  const discovery = Object.freeze({
    ...(request.discovery ?? {}),
    capabilities: request.capabilities ?? {},
  });

  return Object.freeze({
    operation: request.operation,
    strategy,
    discovery,
    retryPolicy,
    failoverPolicy,
    ...(request.requestId === undefined
      ? {}
      : { requestId: request.requestId }),
    ...(request.requestedAt === undefined
      ? {}
      : { requestedAt: request.requestedAt }),
    ...(metadata === undefined
      ? {}
      : { metadata }),
  });
}

export function normalizeExchangeRouterRetryPolicy(
  policy:
    | Partial<ExchangeRouterRetryPolicy>
    | undefined,
): ExchangeRouterRetryPolicy {
  if (
    policy !== undefined &&
    (
      policy === null ||
      typeof policy !== "object" ||
      Array.isArray(policy)
    )
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Exchange router retry policy must be a record object.",
    );
  }

  const maxAttempts =
    policy?.maxAttempts ??
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY.maxAttempts;

  const retryDelayMs =
    policy?.retryDelayMs ??
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY.retryDelayMs;

  const backoffMultiplier =
    policy?.backoffMultiplier ??
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY.backoffMultiplier;

  const maximumRetryDelayMs =
    policy?.maximumRetryDelayMs ??
    DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY.maximumRetryDelayMs;

  assertPositiveInteger(
    maxAttempts,
    "Maximum router attempts",
    "INVALID_ATTEMPT_LIMIT",
  );

  assertNonNegativeFiniteNumber(
    retryDelayMs,
    "Router retry delay",
    "INVALID_RETRY_DELAY",
  );

  assertPositiveFiniteNumber(
    backoffMultiplier,
    "Router backoff multiplier",
    "INVALID_RETRY_DELAY",
  );

  assertNonNegativeFiniteNumber(
    maximumRetryDelayMs,
    "Maximum router retry delay",
    "INVALID_RETRY_DELAY",
  );

  if (maximumRetryDelayMs < retryDelayMs) {
    throw new ExchangeRouterError(
      "INVALID_RETRY_DELAY",
      "Maximum retry delay cannot be lower than the initial retry delay.",
    );
  }

  const retryableErrorCodes =
    normalizeRetryableErrorCodes(
      policy?.retryableErrorCodes ??
      DEFAULT_EXCHANGE_ROUTER_RETRY_POLICY.retryableErrorCodes,
    );

  return Object.freeze({
    maxAttempts,
    retryDelayMs,
    backoffMultiplier,
    maximumRetryDelayMs,
    retryableErrorCodes,
  });
}

export function normalizeExchangeRouterFailoverPolicy(
  policy:
    | Partial<ExchangeRouterFailoverPolicy>
    | undefined,
): ExchangeRouterFailoverPolicy {
  if (
    policy !== undefined &&
    (
      policy === null ||
      typeof policy !== "object" ||
      Array.isArray(policy)
    )
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Exchange router failover policy must be a record object.",
    );
  }

  const maximumExchangeAttempts =
    policy?.maximumExchangeAttempts ??
    DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY.maximumExchangeAttempts;

  assertPositiveInteger(
    maximumExchangeAttempts,
    "Maximum exchange attempts",
    "INVALID_ATTEMPT_LIMIT",
  );

  return Object.freeze({
    enabled:
      policy?.enabled ??
      DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY.enabled,
    maximumExchangeAttempts,
    retryCurrentExchangeFirst:
      policy?.retryCurrentExchangeFirst ??
      DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY.retryCurrentExchangeFirst,
    failoverOnNonRetryableError:
      policy?.failoverOnNonRetryableError ??
      DEFAULT_EXCHANGE_ROUTER_FAILOVER_POLICY.failoverOnNonRetryableError,
  });
}

export function calculateExchangeRouterRetryDelay(
  attemptNumber: number,
  policy: ExchangeRouterRetryPolicy,
): number {
  assertPositiveInteger(
    attemptNumber,
    "Attempt number",
    "INVALID_ATTEMPT_LIMIT",
  );

  const exponent = Math.max(0, attemptNumber - 1);

  const delay =
    policy.retryDelayMs *
    policy.backoffMultiplier ** exponent;

  return Math.min(
    delay,
    policy.maximumRetryDelayMs,
  );
}

function normalizeRetryableErrorCodes(
  errorCodes:
    readonly UnifiedExchangeErrorCode[],
): readonly UnifiedExchangeErrorCode[] {
  if (!Array.isArray(errorCodes)) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Retryable error codes must be provided as an array.",
    );
  }

  const supportedErrorCodes =
    new Set<string>(UNIFIED_EXCHANGE_ERROR_CODES);

  const normalized =
    new Set<UnifiedExchangeErrorCode>();

  for (const rawErrorCode of errorCodes) {
    if (
      typeof rawErrorCode !== "string" ||
      !supportedErrorCodes.has(rawErrorCode)
    ) {
      throw new ExchangeRouterError(
        "INVALID_ROUTING_REQUEST",
        `Unsupported retryable exchange error code "${String(
          rawErrorCode,
        )}".`,
      );
    }

    normalized.add(
      rawErrorCode as UnifiedExchangeErrorCode,
    );
  }

  return Object.freeze([
    ...normalized,
  ]);
}

function freezeExchangeRouterMetadata(
  metadata:
    | Readonly<Record<string, unknown>>
    | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new ExchangeRouterError(
      "INVALID_ROUTING_REQUEST",
      "Exchange router metadata must be a record object.",
    );
  }

  return Object.freeze({
    ...metadata,
  });
}

function assertPositiveInteger(
  value: number,
  label: string,
  code: ExchangeRouterErrorCode,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ExchangeRouterError(
      code,
      `${label} must be a positive integer.`,
    );
  }
}

function assertPositiveFiniteNumber(
  value: number,
  label: string,
  code: ExchangeRouterErrorCode,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ExchangeRouterError(
      code,
      `${label} must be a finite positive number.`,
    );
  }
}

function assertNonNegativeFiniteNumber(
  value: number,
  label: string,
  code: ExchangeRouterErrorCode,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ExchangeRouterError(
      code,
      `${label} must be a finite non-negative number.`,
    );
  }
}