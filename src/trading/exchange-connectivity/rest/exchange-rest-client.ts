/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Transport-independent REST client contracts.
 *
 * This module defines immutable request, response, error, and client
 * abstractions used by live exchange connectors.
 *
 * Concrete implementations may use Axios, Fetch, Undici, or another HTTP
 * library, but exchange connectors must depend only on these contracts.
 */

import type { ExchangeConnectorOperationContext } from "../connectors/exchange-connector";
import type {
  ExchangeHttpMethod,
  ExchangeRestEndpointType,
} from "../connectors/exchange-connector-config";

/**
 * Primitive values supported in REST query parameters.
 */
export type ExchangeRestQueryPrimitive = string | number | boolean;

/**
 * Query parameter values supported by the REST abstraction.
 *
 * Undefined values should be omitted from the serialized request.
 */
export type ExchangeRestQueryValue =
  | ExchangeRestQueryPrimitive
  | readonly ExchangeRestQueryPrimitive[]
  | undefined;

/**
 * Immutable query parameter collection.
 */
export type ExchangeRestQueryParameters = Readonly<
  Record<string, ExchangeRestQueryValue>
>;

/**
 * Immutable HTTP header collection.
 */
export type ExchangeRestHeaders = Readonly<Record<string, string>>;

/**
 * Request body types supported by the transport abstraction.
 *
 * The transport implementation is responsible for serializing structured
 * values according to the request content type.
 */
export type ExchangeRestRequestBody =
  | string
  | Uint8Array
  | Readonly<Record<string, unknown>>
  | readonly unknown[]
  | null;

/**
 * Expected response decoding mode.
 */
export type ExchangeRestResponseType =
  | "JSON"
  | "TEXT"
  | "BINARY"
  | "EMPTY";

/**
 * Request authentication requirement.
 */
export type ExchangeRestAuthenticationMode =
  | "NONE"
  | "OPTIONAL"
  | "REQUIRED";

/**
 * Retry classification applied to an individual REST request.
 */
export type ExchangeRestRetryMode =
  | "DEFAULT"
  | "DISABLED"
  | "SAFE"
  | "IDEMPOTENT";

/**
 * Request priority used by future rate-limiting and scheduling layers.
 */
export type ExchangeRestRequestPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

/**
 * Immutable REST request.
 */
export interface ExchangeRestRequest<TBody extends ExchangeRestRequestBody = ExchangeRestRequestBody> {
  /**
   * Unique deterministic request identifier.
   */
  readonly requestId: string;

  /**
   * Logical exchange operation name.
   *
   * Examples:
   * - "market.getTicker"
   * - "orders.place"
   * - "account.getBalances"
   */
  readonly operation: string;

  /**
   * REST endpoint category used to select the correct base URL.
   */
  readonly endpointType: ExchangeRestEndpointType;

  readonly method: ExchangeHttpMethod;

  /**
   * Relative endpoint path.
   *
   * Example:
   * /market/tickers
   */
  readonly path: string;

  readonly query?: ExchangeRestQueryParameters;
  readonly headers?: ExchangeRestHeaders;
  readonly body?: TBody;

  readonly responseType: ExchangeRestResponseType;
  readonly authentication: ExchangeRestAuthenticationMode;
  readonly retryMode: ExchangeRestRetryMode;
  readonly priority: ExchangeRestRequestPriority;

  /**
   * Per-request timeout override.
   */
  readonly timeoutMs?: number;

  /**
   * Optional idempotency key for state-changing requests.
   */
  readonly idempotencyKey?: string;

  /**
   * Immutable execution context shared across connector infrastructure.
   */
  readonly context: ExchangeConnectorOperationContext;
}

/**
 * Transport timing information.
 */
export interface ExchangeRestResponseTiming {
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
}

/**
 * Immutable REST response.
 */
export interface ExchangeRestResponse<TData = unknown> {
  readonly requestId: string;
  readonly operation: string;

  readonly statusCode: number;
  readonly statusText?: string;

  readonly headers: ExchangeRestHeaders;
  readonly data: TData;

  readonly timing: ExchangeRestResponseTiming;

  /**
   * Number of transport attempts used to complete the request.
   *
   * The initial attempt is counted as one.
   */
  readonly attemptCount: number;

  /**
   * Optional exchange request ID returned in response headers or payload.
   */
  readonly exchangeRequestId?: string;

  /**
   * Whether the response was returned from a local cache.
   */
  readonly fromCache: boolean;
}

/**
 * REST transport lifecycle state.
 */
export type ExchangeRestClientState =
  | "CREATED"
  | "INITIALIZING"
  | "READY"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

/**
 * Immutable REST client state snapshot.
 */
export interface ExchangeRestClientStateSnapshot {
  readonly state: ExchangeRestClientState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * REST client metrics snapshot.
 */
export interface ExchangeRestClientMetrics {
  readonly capturedAt: number;

  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly retriedRequests: number;
  readonly timedOutRequests: number;
  readonly cancelledRequests: number;

  readonly activeRequests: number;
  readonly queuedRequests: number;

  readonly totalResponseTimeMs: number;
  readonly minimumResponseTimeMs?: number;
  readonly maximumResponseTimeMs?: number;
  readonly averageResponseTimeMs?: number;

  readonly lastRequestAt?: number;
  readonly lastSuccessAt?: number;
  readonly lastFailureAt?: number;
}

/**
 * Error categories produced by the REST transport layer.
 */
export type ExchangeRestErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "CONNECTION"
  | "PROTOCOL"
  | "SERIALIZATION"
  | "DESERIALIZATION"
  | "EXCHANGE"
  | "CANCELLED"
  | "UNAVAILABLE"
  | "INTERNAL";

/**
 * Structured details for a REST transport failure.
 */
export interface ExchangeRestErrorDetails {
  readonly category: ExchangeRestErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly requestId?: string;
  readonly operation?: string;

  readonly statusCode?: number;
  readonly exchangeCode?: string;
  readonly exchangeMessage?: string;
  readonly exchangeRequestId?: string;

  readonly retryable: boolean;
  readonly attemptCount?: number;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by REST transport infrastructure.
 */
export class ExchangeRestError extends Error {
  public readonly details: ExchangeRestErrorDetails;

  public constructor(details: ExchangeRestErrorDetails) {
    super(details.message);

    this.name = "ExchangeRestError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeRestErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public get statusCode(): number | undefined {
    return this.details.statusCode;
  }

  public get requestId(): string | undefined {
    return this.details.requestId;
  }

  public toJSON(): ExchangeRestErrorDetails {
    return this.details;
  }
}

/**
 * Initialization result returned by a REST client.
 */
export interface ExchangeRestClientInitializationResult {
  readonly previousState: ExchangeRestClientState;
  readonly currentState: ExchangeRestClientState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Shutdown options for a REST client.
 */
export interface ExchangeRestClientCloseOptions {
  /**
   * Whether active requests should be allowed to complete.
   */
  readonly graceful?: boolean;

  /**
   * Maximum time allowed for graceful shutdown.
   */
  readonly timeoutMs?: number;

  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Shutdown result returned by a REST client.
 */
export interface ExchangeRestClientCloseResult {
  readonly previousState: ExchangeRestClientState;
  readonly currentState: ExchangeRestClientState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
  readonly cancelledRequestCount: number;
}

/**
 * Optional cancellation abstraction.
 *
 * This avoids coupling the domain to AbortSignal while allowing concrete
 * transports to adapt native cancellation primitives.
 */
export interface ExchangeRestCancellationToken {
  readonly cancelled: boolean;
  readonly reason?: string;

  throwIfCancelled(): void;

  onCancelled(listener: (reason?: string) => void): () => void;
}

/**
 * Execution options supplied separately from the immutable request.
 */
export interface ExchangeRestExecutionOptions {
  readonly cancellationToken?: ExchangeRestCancellationToken;
}

/**
 * Core REST client contract.
 */
export interface ExchangeRestClient {
  /**
   * Returns the latest lifecycle snapshot without performing network I/O.
   */
  getState(): ExchangeRestClientStateSnapshot;

  /**
   * Returns immutable transport metrics.
   */
  getMetrics(): ExchangeRestClientMetrics;

  /**
   * Initializes the underlying transport.
   *
   * Initialization should be idempotent.
   */
  initialize(): Promise<ExchangeRestClientInitializationResult>;

  /**
   * Executes an immutable REST request.
   */
  execute<TResponse = unknown>(
    request: ExchangeRestRequest,
    options?: ExchangeRestExecutionOptions,
  ): Promise<ExchangeRestResponse<TResponse>>;

  /**
   * Closes the REST client and releases transport resources.
   */
  close(
    options?: ExchangeRestClientCloseOptions,
  ): Promise<ExchangeRestClientCloseResult>;
}

/**
 * Validates an exchange REST request.
 *
 * Throws ExchangeRestError when invalid.
 */
export function validateExchangeRestRequest(
  request: ExchangeRestRequest,
): void {
  requireNonEmptyString(request.requestId, "requestId");
  requireNonEmptyString(request.operation, "operation");
  requireValidPath(request.path);

  if (!request.context) {
    throw createValidationError(
      "REST_CONTEXT_REQUIRED",
      "A connector operation context is required.",
      request,
    );
  }

  requireNonEmptyString(request.context.operationId, "context.operationId");

  requireFiniteTimestamp(
    request.context.createdAt,
    "context.createdAt",
    request,
  );

  if (
    request.context.deadlineAt !== undefined &&
    request.context.deadlineAt < request.context.createdAt
  ) {
    throw createValidationError(
      "INVALID_OPERATION_DEADLINE",
      "Operation deadline must be greater than or equal to its creation time.",
      request,
    );
  }

  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw createValidationError(
      "INVALID_REQUEST_TIMEOUT",
      "Request timeout must be a finite number greater than zero.",
      request,
    );
  }

  if (
    request.idempotencyKey !== undefined &&
    request.idempotencyKey.trim().length === 0
  ) {
    throw createValidationError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key must not be empty.",
      request,
    );
  }

  validateHeaders(request.headers, request);
  validateQueryParameters(request.query, request);
  validateRequestBody(request.body, request);
}

/**
 * Returns true when a status code represents a successful HTTP response.
 */
export function isSuccessfulExchangeRestStatus(
  statusCode: number,
): boolean {
  return statusCode >= 200 && statusCode <= 299;
}

/**
 * Returns true when an HTTP method is generally considered safe.
 */
export function isSafeExchangeHttpMethod(
  method: ExchangeHttpMethod,
): boolean {
  return method === "GET";
}

/**
 * Returns true when an HTTP method is generally considered idempotent.
 */
export function isIdempotentExchangeHttpMethod(
  method: ExchangeHttpMethod,
): boolean {
  return (
    method === "GET" ||
    method === "PUT" ||
    method === "DELETE"
  );
}

/**
 * Produces a deterministic query string.
 *
 * Keys are sorted lexicographically. Array values preserve their original
 * ordering and are emitted once per item.
 */
export function serializeExchangeRestQuery(
  query: ExchangeRestQueryParameters | undefined,
): string {
  if (!query) {
    return "";
  }

  const entries: Array<readonly [string, ExchangeRestQueryPrimitive]> = [];

  for (const key of Object.keys(query).sort()) {
    const value = query[key];

    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push([key, item]);
      }

      continue;
    }

    entries.push([key, value as ExchangeRestQueryPrimitive]);
  }

  return entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
}

/**
 * Builds a relative request target containing a deterministic query string.
 */
export function buildExchangeRestRequestTarget(
  path: string,
  query?: ExchangeRestQueryParameters,
): string {
  const serializedQuery = serializeExchangeRestQuery(query);

  if (!serializedQuery) {
    return path;
  }

  return `${path}?${serializedQuery}`;
}

/**
 * Runtime type guard for REST transport errors.
 */
export function isExchangeRestError(
  value: unknown,
): value is ExchangeRestError {
  return value instanceof ExchangeRestError;
}

/**
 * Runtime type guard for REST client states.
 */
export function isExchangeRestClientState(
  value: unknown,
): value is ExchangeRestClientState {
  return (
    value === "CREATED" ||
    value === "INITIALIZING" ||
    value === "READY" ||
    value === "CLOSING" ||
    value === "CLOSED" ||
    value === "FAILED"
  );
}

function validateHeaders(
  headers: ExchangeRestHeaders | undefined,
  request: ExchangeRestRequest,
): void {
  if (!headers) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (!key.trim()) {
      throw createValidationError(
        "INVALID_HEADER_NAME",
        "REST header names must not be empty.",
        request,
      );
    }

    if (key.includes("\r") || key.includes("\n")) {
      throw createValidationError(
        "INVALID_HEADER_NAME",
        "REST header names must not contain line breaks.",
        request,
      );
    }

    if (value.includes("\r") || value.includes("\n")) {
      throw createValidationError(
        "INVALID_HEADER_VALUE",
        `REST header '${key}' must not contain line breaks.`,
        request,
      );
    }
  }
}

function validateQueryParameters(
  query: ExchangeRestQueryParameters | undefined,
  request: ExchangeRestRequest,
): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (!key.trim()) {
      throw createValidationError(
        "INVALID_QUERY_PARAMETER_NAME",
        "REST query parameter names must not be empty.",
        request,
      );
    }

    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        validateQueryPrimitive(item, key, request);
      }

      continue;
    }

    validateQueryPrimitive(
      value as ExchangeRestQueryPrimitive,
      key,
      request,
    );
  }
}

function validateQueryPrimitive(
  value: ExchangeRestQueryPrimitive,
  key: string,
  request: ExchangeRestRequest,
): void {
  const type = typeof value;

  if (
    type !== "string" &&
    type !== "number" &&
    type !== "boolean"
  ) {
    throw createValidationError(
      "INVALID_QUERY_PARAMETER_VALUE",
      `REST query parameter '${key}' contains an unsupported value.`,
      request,
    );
  }

  if (type === "number" && !Number.isFinite(value)) {
    throw createValidationError(
      "INVALID_QUERY_PARAMETER_NUMBER",
      `REST query parameter '${key}' must contain a finite number.`,
      request,
    );
  }
}

function validateRequestBody(
  body: ExchangeRestRequestBody | undefined,
  request: ExchangeRestRequest,
): void {
  if (body === undefined || body === null) {
    return;
  }

  if (
    typeof body === "string" ||
    body instanceof Uint8Array ||
    Array.isArray(body) ||
    isPlainRecord(body)
  ) {
    return;
  }

  throw createValidationError(
    "INVALID_REQUEST_BODY",
    "REST request body contains an unsupported value.",
    request,
  );
}

function requireNonEmptyString(
  value: string,
  path: string,
): void {
  if (!value.trim()) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function requireValidPath(path: string): void {
  if (!path.trim()) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "REST_PATH_REQUIRED",
      message: "REST request path must not be empty.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (!path.startsWith("/")) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "INVALID_REST_PATH",
      message: "REST request path must begin with '/'.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (path.includes("://")) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "ABSOLUTE_REST_PATH_NOT_ALLOWED",
      message:
        "REST request path must be relative to a configured endpoint.",
      retryable: false,
      occurredAt: 0,
    });
  }
}

function requireFiniteTimestamp(
  value: number,
  path: string,
  request: ExchangeRestRequest,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw createValidationError(
      "INVALID_TIMESTAMP",
      `${path} must be a finite non-negative timestamp.`,
      request,
    );
  }
}

function createValidationError(
  code: string,
  message: string,
  request: ExchangeRestRequest,
): ExchangeRestError {
  return new ExchangeRestError({
    category: "VALIDATION",
    code,
    message,
    requestId: request.requestId || undefined,
    operation: request.operation || undefined,
    retryable: false,
    occurredAt:
      Number.isFinite(request.context?.createdAt) &&
      request.context.createdAt >= 0
        ? request.context.createdAt
        : 0,
  });
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}