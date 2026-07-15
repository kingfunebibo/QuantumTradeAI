/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Reusable deterministic base REST client.
 *
 * This implementation provides:
 * - deterministic lifecycle handling;
 * - immutable request and response snapshots;
 * - request validation;
 * - endpoint resolution;
 * - cancellation handling;
 * - transport adapter isolation;
 * - structured error normalization;
 * - active request tracking;
 * - deterministic metrics;
 * - graceful and immediate shutdown.
 */

import type {
  ExchangeRestEndpointConfig,
  ExchangeRestTransportConfig,
} from "../connectors/exchange-connector-config";

import {
  ExchangeRestError,
  isSuccessfulExchangeRestStatus,
  validateExchangeRestRequest,
  type ExchangeRestCancellationToken,
  type ExchangeRestClient,
  type ExchangeRestClientCloseOptions,
  type ExchangeRestClientCloseResult,
  type ExchangeRestClientInitializationResult,
  type ExchangeRestClientMetrics,
  type ExchangeRestClientState,
  type ExchangeRestClientStateSnapshot,
  type ExchangeRestExecutionOptions,
  type ExchangeRestHeaders,
  type ExchangeRestRequest,
  type ExchangeRestResponse,
  type ExchangeRestResponseType,
} from "./exchange-rest-client";

/**
 * Clock dependency used by the base REST client.
 */
export interface BaseExchangeRestClientClock {
  now(): number;
}

/**
 * Raw transport request sent to an HTTP adapter.
 */
export interface BaseExchangeRestTransportRequest {
  readonly requestId: string;
  readonly method: ExchangeRestRequest["method"];
  readonly url: string;
  readonly headers: ExchangeRestHeaders;
  readonly body?: ExchangeRestRequest["body"];
  readonly responseType: ExchangeRestResponseType;
  readonly timeoutMs: number;
  readonly cancellationToken?: ExchangeRestCancellationToken;
}

/**
 * Raw transport response returned by an HTTP adapter.
 */
export interface BaseExchangeRestTransportResponse {
  readonly statusCode: number;
  readonly statusText?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly data: unknown;
  readonly exchangeRequestId?: string;
}

/**
 * Transport adapter implemented using Axios, Fetch, Undici, or another client.
 */
export interface BaseExchangeRestTransport {
  initialize(): Promise<void>;

  execute(
    request: BaseExchangeRestTransportRequest,
  ): Promise<BaseExchangeRestTransportResponse>;

  close(): Promise<void>;
}

/**
 * Optional hook used to prepare requests before transport execution.
 *
 * Exchange-specific subclasses may use this to apply authentication,
 * signatures, exchange headers, or other transformations.
 */
export interface BaseExchangeRestRequestPreparer {
  prepare(
    request: ExchangeRestRequest,
  ): Promise<ExchangeRestRequest>;
}

/**
 * Immutable base REST client configuration.
 */
export interface BaseExchangeRestClientConfig {
  readonly transport: ExchangeRestTransportConfig;

  /**
   * Default timeout used when a request does not provide one.
   */
  readonly defaultRequestTimeoutMs: number;

  /**
   * Whether non-2xx responses should be thrown as ExchangeRestError.
   */
  readonly throwOnHttpError: boolean;
}

/**
 * Dependencies required by the base REST client.
 */
export interface BaseExchangeRestClientDependencies {
  readonly clock: BaseExchangeRestClientClock;
  readonly transport: BaseExchangeRestTransport;
  readonly requestPreparer?: BaseExchangeRestRequestPreparer;
}

/**
 * Error operation classifications.
 */
export type BaseExchangeRestClientOperation =
  | "CONSTRUCTION"
  | "INITIALIZE"
  | "EXECUTE"
  | "CLOSE";

/**
 * Internal active request record.
 */
interface ActiveRequestRecord {
  readonly requestId: string;
  readonly operation: string;
  readonly startedAt: number;
}

/**
 * Reusable REST client implementation.
 */
export class BaseExchangeRestClient implements ExchangeRestClient {
  private readonly config: BaseExchangeRestClientConfig;
  private readonly clock: BaseExchangeRestClientClock;
  private readonly transport: BaseExchangeRestTransport;
  private readonly requestPreparer?: BaseExchangeRestRequestPreparer;

  private state: ExchangeRestClientState = "CREATED";
  private stateRevision = 1;
  private stateChangedAt: number;
  private stateReason?: string;

  private readonly activeRequests = new Map<
    string,
    ActiveRequestRecord
  >();

  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private retriedRequests = 0;
  private timedOutRequests = 0;
  private cancelledRequests = 0;

  private queuedRequests = 0;

  private totalResponseTimeMs = 0;
  private minimumResponseTimeMs?: number;
  private maximumResponseTimeMs?: number;

  private lastRequestAt?: number;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;

  public constructor(
    config: BaseExchangeRestClientConfig,
    dependencies: BaseExchangeRestClientDependencies,
  ) {
    validateBaseExchangeRestClientConfig(config);
    validateBaseExchangeRestClientDependencies(dependencies);

    const createdAt = dependencies.clock.now();

    validateTimestamp(
      createdAt,
      "CONSTRUCTION",
      "REST client construction timestamp",
    );

    this.config = freezeConfig(config);
    this.clock = dependencies.clock;
    this.transport = dependencies.transport;
    this.requestPreparer = dependencies.requestPreparer;
    this.stateChangedAt = createdAt;
  }

  public getState(): ExchangeRestClientStateSnapshot {
    return Object.freeze({
      state: this.state,
      revision: this.stateRevision,
      changedAt: this.stateChangedAt,
      reason: this.stateReason,
    });
  }

  public getMetrics(): ExchangeRestClientMetrics {
    const completedRequests =
      this.successfulRequests + this.failedRequests;

    return Object.freeze({
      capturedAt: this.clock.now(),

      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      retriedRequests: this.retriedRequests,
      timedOutRequests: this.timedOutRequests,
      cancelledRequests: this.cancelledRequests,

      activeRequests: this.activeRequests.size,
      queuedRequests: this.queuedRequests,

      totalResponseTimeMs: this.totalResponseTimeMs,
      minimumResponseTimeMs: this.minimumResponseTimeMs,
      maximumResponseTimeMs: this.maximumResponseTimeMs,
      averageResponseTimeMs:
        completedRequests > 0
          ? this.totalResponseTimeMs / completedRequests
          : undefined,

      lastRequestAt: this.lastRequestAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
    });
  }

  public async initialize(): Promise<ExchangeRestClientInitializationResult> {
    if (this.state === "READY") {
      return this.createInitializationResult(
        "READY",
        "READY",
        false,
      );
    }

    if (this.state === "CLOSED") {
      throw this.createError({
        category: "UNAVAILABLE",
        code: "REST_CLIENT_CLOSED",
        message: "A closed REST client cannot be initialized.",
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    if (this.state === "INITIALIZING") {
      throw this.createError({
        category: "INTERNAL",
        code: "REST_CLIENT_ALREADY_INITIALIZING",
        message: "REST client initialization is already active.",
        retryable: true,
        occurredAt: this.clock.now(),
      });
    }

    const previousState = this.state;
    const startedAt = this.clock.now();

    this.transitionState("INITIALIZING", startedAt);

    try {
      await this.transport.initialize();

      const completedAt = this.clock.now();

      validateChronology(
        startedAt,
        completedAt,
        "INITIALIZE",
      );

      this.transitionState("READY", completedAt);

      return Object.freeze({
        previousState,
        currentState: "READY",
        changed: true,
        completedAt,
        revision: this.stateRevision,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      throw this.normalizeUnknownError(
        error,
        "INITIALIZE",
        failedAt,
      );
    }
  }

  public async execute<TResponse = unknown>(
    request: ExchangeRestRequest,
    options: ExchangeRestExecutionOptions = {},
  ): Promise<ExchangeRestResponse<TResponse>> {
    validateExchangeRestRequest(request);

    if (this.state !== "READY") {
      throw this.createError({
        category: "UNAVAILABLE",
        code: "REST_CLIENT_NOT_READY",
        message:
          `REST client cannot execute requests while in ${this.state} state.`,
        requestId: request.requestId,
        operation: request.operation,
        retryable:
          this.state === "CREATED" ||
          this.state === "INITIALIZING" ||
          this.state === "FAILED",
        occurredAt: this.clock.now(),
      });
    }

    if (this.activeRequests.has(request.requestId)) {
      throw this.createError({
        category: "VALIDATION",
        code: "DUPLICATE_ACTIVE_REQUEST_ID",
        message:
          `Request '${request.requestId}' is already active.`,
        requestId: request.requestId,
        operation: request.operation,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    options.cancellationToken?.throwIfCancelled();

    const preparedRequest = this.requestPreparer
      ? await this.requestPreparer.prepare(request)
      : request;

    validateExchangeRestRequest(preparedRequest);

    if (preparedRequest.requestId !== request.requestId) {
      throw this.createError({
        category: "VALIDATION",
        code: "REQUEST_PREPARER_CHANGED_REQUEST_ID",
        message:
          "REST request preparer must not change the request ID.",
        requestId: request.requestId,
        operation: request.operation,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    const endpoint = this.resolveEndpoint(preparedRequest);
    const startedAt = this.clock.now();

    validateTimestamp(
      startedAt,
      "EXECUTE",
      "REST request start timestamp",
    );

    this.totalRequests += 1;
    this.lastRequestAt = startedAt;

    this.activeRequests.set(preparedRequest.requestId, {
      requestId: preparedRequest.requestId,
      operation: preparedRequest.operation,
      startedAt,
    });

    const timeoutMs =
      preparedRequest.timeoutMs ??
      this.config.defaultRequestTimeoutMs;

    try {
      options.cancellationToken?.throwIfCancelled();

      const transportResponse =
        await this.transport.execute({
          requestId: preparedRequest.requestId,
          method: preparedRequest.method,
          url: buildAbsoluteUrl(
            endpoint,
            preparedRequest.path,
            preparedRequest.query,
          ),
          headers: mergeHeaders(
            endpoint.defaultHeaders,
            preparedRequest.headers,
          ),
          body: preparedRequest.body,
          responseType: preparedRequest.responseType,
          timeoutMs,
          cancellationToken:
            options.cancellationToken,
        });

      const completedAt = this.clock.now();

      validateChronology(
        startedAt,
        completedAt,
        "EXECUTE",
      );

      const durationMs = completedAt - startedAt;

      this.recordResponseDuration(durationMs);

      if (
        this.config.throwOnHttpError &&
        !isSuccessfulExchangeRestStatus(
          transportResponse.statusCode,
        )
      ) {
        throw this.createError({
          category: classifyHttpError(
            transportResponse.statusCode,
          ),
          code: "HTTP_REQUEST_FAILED",
          message:
            `Exchange REST request failed with status ` +
            `${transportResponse.statusCode}.`,
          requestId: preparedRequest.requestId,
          operation: preparedRequest.operation,
          statusCode: transportResponse.statusCode,
          exchangeRequestId:
            transportResponse.exchangeRequestId,
          retryable: isRetryableHttpStatus(
            transportResponse.statusCode,
          ),
          attemptCount: 1,
          occurredAt: completedAt,
        });
      }

      this.successfulRequests += 1;
      this.lastSuccessAt = completedAt;

      return Object.freeze({
        requestId: preparedRequest.requestId,
        operation: preparedRequest.operation,

        statusCode: transportResponse.statusCode,
        statusText: transportResponse.statusText,

        headers: Object.freeze({
          ...(transportResponse.headers ?? {}),
        }),

        data: transportResponse.data as TResponse,

        timing: Object.freeze({
          startedAt,
          completedAt,
          durationMs,
        }),

        attemptCount: 1,
        exchangeRequestId:
          transportResponse.exchangeRequestId,
        fromCache: false,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      validateChronology(
        startedAt,
        failedAt,
        "EXECUTE",
      );

      const durationMs = failedAt - startedAt;

      this.recordResponseDuration(durationMs);

      const normalized = this.normalizeUnknownError(
        error,
        "EXECUTE",
        failedAt,
        preparedRequest,
      );

      this.failedRequests += 1;
      this.lastFailureAt = failedAt;

      if (normalized.category === "TIMEOUT") {
        this.timedOutRequests += 1;
      }

      if (normalized.category === "CANCELLED") {
        this.cancelledRequests += 1;
      }

      throw normalized;
    } finally {
      this.activeRequests.delete(
        preparedRequest.requestId,
      );
    }
  }

  public async close(
    options: ExchangeRestClientCloseOptions = {},
  ): Promise<ExchangeRestClientCloseResult> {
    validateCloseOptions(options);

    if (this.state === "CLOSED") {
      return Object.freeze({
        previousState: "CLOSED",
        currentState: "CLOSED",
        changed: false,
        completedAt: this.clock.now(),
        revision: this.stateRevision,
        cancelledRequestCount: 0,
      });
    }

    const previousState = this.state;
    const startedAt = this.clock.now();

    this.transitionState(
      "CLOSING",
      startedAt,
      options.reason,
    );

    let cancelledRequestCount = 0;

    try {
      if (
        options.graceful === true &&
        this.activeRequests.size > 0
      ) {
        await this.waitForActiveRequests(
          options.timeoutMs,
        );
      }

      if (this.activeRequests.size > 0) {
        cancelledRequestCount =
          this.activeRequests.size;

        this.cancelledRequests +=
          cancelledRequestCount;

        this.activeRequests.clear();
      }

      await this.transport.close();

      const completedAt = this.clock.now();

      validateChronology(
        startedAt,
        completedAt,
        "CLOSE",
      );

      this.transitionState(
        "CLOSED",
        completedAt,
        options.reason,
      );

      return Object.freeze({
        previousState,
        currentState: "CLOSED",
        changed: true,
        completedAt,
        revision: this.stateRevision,
        cancelledRequestCount,
      });
    } catch (error: unknown) {
      const failedAt = this.clock.now();

      this.transitionState(
        "FAILED",
        failedAt,
        getErrorMessage(error),
      );

      throw this.normalizeUnknownError(
        error,
        "CLOSE",
        failedAt,
      );
    }
  }

  /**
   * Allows subclasses to report retries performed by a composed retry layer.
   */
  protected recordRetry(count = 1): void {
    if (!Number.isInteger(count) || count <= 0) {
      throw this.createError({
        category: "VALIDATION",
        code: "INVALID_RETRY_COUNT",
        message:
          "Retry count must be an integer greater than zero.",
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    this.retriedRequests += count;
  }

  /**
   * Allows subclasses to expose queued request counts from rate limiters.
   */
  protected setQueuedRequestCount(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw this.createError({
        category: "VALIDATION",
        code: "INVALID_QUEUED_REQUEST_COUNT",
        message:
          "Queued request count must be a non-negative integer.",
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    this.queuedRequests = count;
  }

  private resolveEndpoint(
    request: ExchangeRestRequest,
  ): ExchangeRestEndpointConfig {
    const endpoint = this.config.transport.endpoints.find(
      (candidate) =>
        candidate.type === request.endpointType,
    );

    if (!endpoint) {
      throw this.createError({
        category: "CONFIGURATION",
        code: "REST_ENDPOINT_NOT_CONFIGURED",
        message:
          `No REST endpoint is configured for type ` +
          `'${request.endpointType}'.`,
        requestId: request.requestId,
        operation: request.operation,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    if (
      request.authentication === "REQUIRED" &&
      endpoint.authenticated === false
    ) {
      throw this.createError({
        category: "CONFIGURATION",
        code: "AUTHENTICATED_ENDPOINT_REQUIRED",
        message:
          "The selected endpoint does not support required authentication.",
        requestId: request.requestId,
        operation: request.operation,
        retryable: false,
        occurredAt: request.context.createdAt,
      });
    }

    return endpoint;
  }

  private async waitForActiveRequests(
    timeoutMs: number | undefined,
  ): Promise<void> {
    const maximumWaitMs =
      timeoutMs ?? this.config.defaultRequestTimeoutMs;

    const startedAt = this.clock.now();

    while (this.activeRequests.size > 0) {
      const currentTime = this.clock.now();

      if (
        currentTime - startedAt >= maximumWaitMs
      ) {
        return;
      }

      await Promise.resolve();
    }
  }

  private createInitializationResult(
    previousState: ExchangeRestClientState,
    currentState: ExchangeRestClientState,
    changed: boolean,
  ): ExchangeRestClientInitializationResult {
    return Object.freeze({
      previousState,
      currentState,
      changed,
      completedAt: this.clock.now(),
      revision: this.stateRevision,
    });
  }

  private transitionState(
    nextState: ExchangeRestClientState,
    changedAt: number,
    reason?: string,
  ): void {
    validateTimestamp(
      changedAt,
      "CONSTRUCTION",
      "REST client state timestamp",
    );

    if (changedAt < this.stateChangedAt) {
      throw this.createError({
        category: "INTERNAL",
        code: "NON_MONOTONIC_STATE_TIMESTAMP",
        message:
          "REST client state timestamps must be monotonically increasing.",
        retryable: false,
        occurredAt: changedAt,
      });
    }

    const changed =
      nextState !== this.state ||
      reason !== this.stateReason;

    if (!changed) {
      return;
    }

    this.state = nextState;
    this.stateRevision += 1;
    this.stateChangedAt = changedAt;
    this.stateReason = reason;
  }

  private recordResponseDuration(
    durationMs: number,
  ): void {
    if (
      !Number.isFinite(durationMs) ||
      durationMs < 0
    ) {
      throw this.createError({
        category: "INTERNAL",
        code: "INVALID_RESPONSE_DURATION",
        message:
          "REST response duration must be finite and non-negative.",
        retryable: false,
        occurredAt: this.clock.now(),
      });
    }

    this.totalResponseTimeMs += durationMs;

    this.minimumResponseTimeMs =
      this.minimumResponseTimeMs === undefined
        ? durationMs
        : Math.min(
            this.minimumResponseTimeMs,
            durationMs,
          );

    this.maximumResponseTimeMs =
      this.maximumResponseTimeMs === undefined
        ? durationMs
        : Math.max(
            this.maximumResponseTimeMs,
            durationMs,
          );
  }

  private normalizeUnknownError(
    error: unknown,
    operation: BaseExchangeRestClientOperation,
    occurredAt: number,
    request?: ExchangeRestRequest,
  ): ExchangeRestError {
    if (error instanceof ExchangeRestError) {
      return error;
    }

    const message = getErrorMessage(error);
    const normalized = message.toLowerCase();

    const category =
      normalized.includes("cancel")
        ? "CANCELLED"
        : normalized.includes("timeout")
          ? "TIMEOUT"
          : normalized.includes("network") ||
              normalized.includes("socket") ||
              normalized.includes("connection")
            ? "NETWORK"
            : "INTERNAL";

    return this.createError({
      category,
      code:
        operation === "EXECUTE"
          ? "REST_TRANSPORT_FAILURE"
          : "REST_CLIENT_OPERATION_FAILED",
      message:
        operation === "EXECUTE"
          ? "REST transport execution failed."
          : `REST client ${operation.toLowerCase()} failed.`,
      requestId: request?.requestId,
      operation: request?.operation,
      retryable:
        category === "TIMEOUT" ||
        category === "NETWORK",
      occurredAt,
      causeName: getErrorName(error),
      causeMessage: message,
      attemptCount:
        operation === "EXECUTE" ? 1 : undefined,
    });
  }

  private createError(
    details: ConstructorParameters<
      typeof ExchangeRestError
    >[0],
  ): ExchangeRestError {
    return new ExchangeRestError(details);
  }
}

/**
 * Validates base REST client configuration.
 */
export function validateBaseExchangeRestClientConfig(
  config: BaseExchangeRestClientConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "BASE_REST_CONFIG_REQUIRED",
      message:
        "Base REST client configuration is required.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    !Number.isFinite(
      config.defaultRequestTimeoutMs,
    ) ||
    config.defaultRequestTimeoutMs <= 0
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "INVALID_DEFAULT_REQUEST_TIMEOUT",
      message:
        "Default request timeout must be a finite number greater than zero.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (!config.transport.enabled) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "REST_TRANSPORT_DISABLED",
      message:
        "Base REST client requires REST transport to be enabled.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (config.transport.endpoints.length === 0) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "REST_ENDPOINTS_REQUIRED",
      message:
        "Base REST client requires at least one endpoint.",
      retryable: false,
      occurredAt: 0,
    });
  }

  const endpointTypes = config.transport.endpoints.map(
    (endpoint) => endpoint.type,
  );

  if (
    new Set(endpointTypes).size !==
    endpointTypes.length
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "DUPLICATE_REST_ENDPOINT_TYPES",
      message:
        "REST endpoint types must not contain duplicates.",
      retryable: false,
      occurredAt: 0,
    });
  }
}

/**
 * Validates base REST client dependencies.
 */
export function validateBaseExchangeRestClientDependencies(
  dependencies: BaseExchangeRestClientDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "BASE_REST_DEPENDENCIES_REQUIRED",
      message:
        "Base REST client dependencies are required.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    typeof dependencies.clock?.now !== "function"
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "BASE_REST_CLOCK_REQUIRED",
      message:
        "Base REST client requires a valid clock.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    typeof dependencies.transport?.initialize !==
      "function" ||
    typeof dependencies.transport?.execute !==
      "function" ||
    typeof dependencies.transport?.close !==
      "function"
  ) {
    throw new ExchangeRestError({
      category: "CONFIGURATION",
      code: "BASE_REST_TRANSPORT_REQUIRED",
      message:
        "Base REST client requires a valid transport adapter.",
      retryable: false,
      occurredAt: 0,
    });
  }
}

/**
 * Runtime type guard.
 */
export function isBaseExchangeRestClient(
  value: unknown,
): value is BaseExchangeRestClient {
  return value instanceof BaseExchangeRestClient;
}

function buildAbsoluteUrl(
  endpoint: ExchangeRestEndpointConfig,
  path: string,
  query: ExchangeRestRequest["query"],
): string {
  const baseUrl = endpoint.baseUrl.replace(/\/+$/, "");
  const apiVersion = endpoint.apiVersion
    ? `/${endpoint.apiVersion.replace(/^\/+|\/+$/g, "")}`
    : "";

  const requestPath = path.startsWith("/")
    ? path
    : `/${path}`;

  const url = new URL(
    `${baseUrl}${apiVersion}${requestPath}`,
  );

  if (query) {
    for (const key of Object.keys(query).sort()) {
      const value = query[key];

      if (value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(
            key,
            String(item),
          );
        }

        continue;
      }

      url.searchParams.append(
        key,
        String(value),
      );
    }
  }

  return url.toString();
}

function mergeHeaders(
  defaults: Readonly<Record<string, string>> | undefined,
  requestHeaders: ExchangeRestHeaders | undefined,
): ExchangeRestHeaders {
  return Object.freeze({
    ...(defaults ?? {}),
    ...(requestHeaders ?? {}),
  });
}

function classifyHttpError(
  statusCode: number,
):
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "EXCHANGE"
  | "PROTOCOL" {
  if (statusCode === 401) {
    return "AUTHENTICATION";
  }

  if (statusCode === 403) {
    return "AUTHORIZATION";
  }

  if (statusCode === 429) {
    return "RATE_LIMIT";
  }

  if (statusCode >= 500) {
    return "EXCHANGE";
  }

  return "PROTOCOL";
}

function isRetryableHttpStatus(
  statusCode: number,
): boolean {
  return (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

function validateCloseOptions(
  options: ExchangeRestClientCloseOptions,
): void {
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) ||
      options.timeoutMs <= 0)
  ) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "INVALID_CLOSE_TIMEOUT",
      message:
        "Close timeout must be a finite number greater than zero.",
      retryable: false,
      occurredAt: normalizeTimestamp(
        options.requestedAt,
      ),
    });
  }

  if (
    options.reason !== undefined &&
    !options.reason.trim()
  ) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "INVALID_CLOSE_REASON",
      message:
        "Close reason must not be empty when provided.",
      retryable: false,
      occurredAt: normalizeTimestamp(
        options.requestedAt,
      ),
    });
  }
}

function freezeConfig(
  config: BaseExchangeRestClientConfig,
): BaseExchangeRestClientConfig {
  return Object.freeze({
    ...config,
    transport: Object.freeze({
      ...config.transport,
      endpoints: Object.freeze(
        config.transport.endpoints.map(
          (endpoint) =>
            Object.freeze({
              ...endpoint,
              defaultHeaders:
                endpoint.defaultHeaders
                  ? Object.freeze({
                      ...endpoint.defaultHeaders,
                    })
                  : undefined,
            }),
        ),
      ),
    }),
  });
}

function validateTimestamp(
  value: number,
  operation: BaseExchangeRestClientOperation,
  description: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ExchangeRestError({
      category: "VALIDATION",
      code: "INVALID_TIMESTAMP",
      message:
        `${description} must be finite and non-negative.`,
      retryable: false,
      occurredAt: 0,
      metadata: Object.freeze({
        operation,
      }),
    });
  }
}

function validateChronology(
  startedAt: number,
  completedAt: number,
  operation: BaseExchangeRestClientOperation,
): void {
  if (completedAt < startedAt) {
    throw new ExchangeRestError({
      category: "INTERNAL",
      code: "REST_COMPLETION_BEFORE_START",
      message:
        "REST operation completion timestamp must not be earlier than its start timestamp.",
      retryable: false,
      occurredAt: completedAt,
      metadata: Object.freeze({
        operation,
      }),
    });
  }
}

function normalizeTimestamp(
  value: number | undefined,
): number {
  return value !== undefined &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : 0;
}

function getErrorName(error: unknown): string {
  return error instanceof Error
    ? error.name
    : "UnknownError";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown REST client failure.";
}