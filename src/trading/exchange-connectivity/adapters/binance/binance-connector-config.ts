/**
 * Binance connector configuration.
 *
 * Defines the deterministic configuration contract used by the Binance
 * REST client, WebSocket client, request signer, and exchange connector.
 *
 * Credentials are intentionally optional at the configuration level so
 * public market-data operations can operate without authentication.
 */

export type BinanceEnvironment = "production" | "testnet";

export interface BinanceCredentials {
  readonly apiKey: string;
  readonly apiSecret: string;
}

export interface BinanceEndpointConfiguration {
  /**
   * Binance Spot REST API base URL.
   *
   * Example:
   * https://api.binance.com
   */
  readonly restBaseUrl: string;

  /**
   * Binance Spot market-stream WebSocket base URL.
   *
   * The connector appends stream paths such as:
   * /ws/btcusdt@trade
   */
  readonly websocketBaseUrl: string;
}

export interface BinanceRateLimitConfiguration {
  /**
   * Maximum request weight permitted during one rate-limit interval.
   *
   * The Binance REST layer will later update its internal counters from
   * Binance response headers.
   */
  readonly maxRequestWeight: number;

  /**
   * Length of the local request-weight interval.
   */
  readonly intervalMs: number;

  /**
   * Percentage of the configured limit at which the connector should
   * begin throttling requests.
   *
   * Must be greater than zero and less than or equal to one.
   */
  readonly throttleThreshold: number;
}

export interface BinanceRetryConfiguration {
  /**
   * Total number of retry attempts after the initial request fails.
   */
  readonly maxRetries: number;

  /**
   * Initial retry delay used by exponential backoff.
   */
  readonly initialDelayMs: number;

  /**
   * Maximum delay permitted between retries.
   */
  readonly maxDelayMs: number;

  /**
   * Exponential multiplier applied after each failed attempt.
   */
  readonly backoffMultiplier: number;
}

export interface BinanceWebSocketConfiguration {
  /**
   * Time allowed for establishing a WebSocket connection.
   */
  readonly connectionTimeoutMs: number;

  /**
   * Maximum time without receiving a message before the connection is
   * considered unhealthy.
   */
  readonly inactivityTimeoutMs: number;

  /**
   * Delay before the first reconnection attempt.
   */
  readonly reconnectDelayMs: number;

  /**
   * Maximum delay between reconnection attempts.
   */
  readonly maxReconnectDelayMs: number;

  /**
   * Maximum number of consecutive reconnection attempts.
   */
  readonly maxReconnectAttempts: number;
}

export interface BinanceConnectorConfiguration {
  readonly environment: BinanceEnvironment;
  readonly credentials?: BinanceCredentials;
  readonly endpoints: BinanceEndpointConfiguration;

  /**
   * Maximum duration allowed for an individual REST request.
   */
  readonly requestTimeoutMs: number;

  /**
   * Binance signed-request receive window.
   *
   * This value is sent as `recvWindow` on authenticated requests.
   */
  readonly recvWindowMs: number;

  readonly rateLimit: BinanceRateLimitConfiguration;
  readonly retry: BinanceRetryConfiguration;
  readonly websocket: BinanceWebSocketConfiguration;
}

export interface CreateBinanceConnectorConfigurationOptions {
  readonly environment?: BinanceEnvironment;
  readonly credentials?: BinanceCredentials;

  /**
   * Optional endpoint overrides intended for deterministic tests,
   * proxies, mocks, or controlled infrastructure.
   */
  readonly endpoints?: Partial<BinanceEndpointConfiguration>;

  readonly requestTimeoutMs?: number;
  readonly recvWindowMs?: number;
  readonly rateLimit?: Partial<BinanceRateLimitConfiguration>;
  readonly retry?: Partial<BinanceRetryConfiguration>;
  readonly websocket?: Partial<BinanceWebSocketConfiguration>;
}

export class BinanceConnectorConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BinanceConnectorConfigurationError";

    Object.setPrototypeOf(
      this,
      BinanceConnectorConfigurationError.prototype,
    );
  }
}

const BINANCE_PRODUCTION_ENDPOINTS: BinanceEndpointConfiguration =
  Object.freeze({
    restBaseUrl: "https://api.binance.com",
    websocketBaseUrl: "wss://stream.binance.com:9443",
  });

const BINANCE_TESTNET_ENDPOINTS: BinanceEndpointConfiguration = Object.freeze({
  restBaseUrl: "https://testnet.binance.vision",
  websocketBaseUrl: "wss://stream.testnet.binance.vision",
});

const DEFAULT_RATE_LIMIT_CONFIGURATION: BinanceRateLimitConfiguration =
  Object.freeze({
    maxRequestWeight: 6_000,
    intervalMs: 60_000,
    throttleThreshold: 0.9,
  });

const DEFAULT_RETRY_CONFIGURATION: BinanceRetryConfiguration = Object.freeze({
  maxRetries: 3,
  initialDelayMs: 250,
  maxDelayMs: 5_000,
  backoffMultiplier: 2,
});

const DEFAULT_WEBSOCKET_CONFIGURATION: BinanceWebSocketConfiguration =
  Object.freeze({
    connectionTimeoutMs: 10_000,
    inactivityTimeoutMs: 60_000,
    reconnectDelayMs: 1_000,
    maxReconnectDelayMs: 30_000,
    maxReconnectAttempts: 10,
  });

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_RECV_WINDOW_MS = 5_000;

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a non-empty string.`,
    );
  }
}

function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a positive safe integer.`,
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a non-negative safe integer.`,
    );
  }
}

function assertPositiveFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a positive finite number.`,
    );
  }
}

function validateEnvironment(
  environment: BinanceEnvironment,
): BinanceEnvironment {
  if (environment !== "production" && environment !== "testnet") {
    throw new BinanceConnectorConfigurationError(
      `Unsupported Binance environment: ${String(environment)}.`,
    );
  }

  return environment;
}

function validateCredentials(
  credentials: BinanceCredentials | undefined,
): BinanceCredentials | undefined {
  if (credentials === undefined) {
    return undefined;
  }

  assertNonEmptyString(credentials.apiKey, "credentials.apiKey");
  assertNonEmptyString(credentials.apiSecret, "credentials.apiSecret");

  return Object.freeze({
    apiKey: credentials.apiKey.trim(),
    apiSecret: credentials.apiSecret.trim(),
  });
}

function validateHttpUrl(value: string, fieldName: string): string {
  assertNonEmptyString(value, fieldName);

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a valid URL.`,
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must use the HTTP or HTTPS protocol.`,
    );
  }

  return removeTrailingSlashes(parsedUrl.toString());
}

function validateWebSocketUrl(value: string, fieldName: string): string {
  assertNonEmptyString(value, fieldName);

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must be a valid URL.`,
    );
  }

  if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
    throw new BinanceConnectorConfigurationError(
      `${fieldName} must use the WS or WSS protocol.`,
    );
  }

  return removeTrailingSlashes(parsedUrl.toString());
}

function removeTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveDefaultEndpoints(
  environment: BinanceEnvironment,
): BinanceEndpointConfiguration {
  return environment === "production"
    ? BINANCE_PRODUCTION_ENDPOINTS
    : BINANCE_TESTNET_ENDPOINTS;
}

/**
 * Creates an immutable, normalized Binance connector configuration.
 *
 * The function performs all validation at the application boundary so the
 * remaining adapter components can safely rely on the resulting values.
 */
export function createBinanceConnectorConfiguration(
  options: CreateBinanceConnectorConfigurationOptions = {},
): BinanceConnectorConfiguration {
  const environment = validateEnvironment(
    options.environment ?? "production",
  );

  const defaultEndpoints = resolveDefaultEndpoints(environment);

  const endpoints: BinanceEndpointConfiguration = Object.freeze({
    restBaseUrl: validateHttpUrl(
      options.endpoints?.restBaseUrl ?? defaultEndpoints.restBaseUrl,
      "endpoints.restBaseUrl",
    ),
    websocketBaseUrl: validateWebSocketUrl(
      options.endpoints?.websocketBaseUrl ??
        defaultEndpoints.websocketBaseUrl,
      "endpoints.websocketBaseUrl",
    ),
  });

  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  assertPositiveInteger(requestTimeoutMs, "requestTimeoutMs");

  const recvWindowMs = options.recvWindowMs ?? DEFAULT_RECV_WINDOW_MS;

  assertPositiveInteger(recvWindowMs, "recvWindowMs");

  const rateLimit: BinanceRateLimitConfiguration = Object.freeze({
    maxRequestWeight:
      options.rateLimit?.maxRequestWeight ??
      DEFAULT_RATE_LIMIT_CONFIGURATION.maxRequestWeight,
    intervalMs:
      options.rateLimit?.intervalMs ??
      DEFAULT_RATE_LIMIT_CONFIGURATION.intervalMs,
    throttleThreshold:
      options.rateLimit?.throttleThreshold ??
      DEFAULT_RATE_LIMIT_CONFIGURATION.throttleThreshold,
  });

  assertPositiveInteger(
    rateLimit.maxRequestWeight,
    "rateLimit.maxRequestWeight",
  );
  assertPositiveInteger(rateLimit.intervalMs, "rateLimit.intervalMs");
  assertPositiveFiniteNumber(
    rateLimit.throttleThreshold,
    "rateLimit.throttleThreshold",
  );

  if (rateLimit.throttleThreshold > 1) {
    throw new BinanceConnectorConfigurationError(
      "rateLimit.throttleThreshold must be less than or equal to 1.",
    );
  }

  const retry: BinanceRetryConfiguration = Object.freeze({
    maxRetries:
      options.retry?.maxRetries ??
      DEFAULT_RETRY_CONFIGURATION.maxRetries,
    initialDelayMs:
      options.retry?.initialDelayMs ??
      DEFAULT_RETRY_CONFIGURATION.initialDelayMs,
    maxDelayMs:
      options.retry?.maxDelayMs ??
      DEFAULT_RETRY_CONFIGURATION.maxDelayMs,
    backoffMultiplier:
      options.retry?.backoffMultiplier ??
      DEFAULT_RETRY_CONFIGURATION.backoffMultiplier,
  });

  assertNonNegativeInteger(retry.maxRetries, "retry.maxRetries");
  assertPositiveInteger(retry.initialDelayMs, "retry.initialDelayMs");
  assertPositiveInteger(retry.maxDelayMs, "retry.maxDelayMs");
  assertPositiveFiniteNumber(
    retry.backoffMultiplier,
    "retry.backoffMultiplier",
  );

  if (retry.maxDelayMs < retry.initialDelayMs) {
    throw new BinanceConnectorConfigurationError(
      "retry.maxDelayMs must be greater than or equal to retry.initialDelayMs.",
    );
  }

  if (retry.backoffMultiplier < 1) {
    throw new BinanceConnectorConfigurationError(
      "retry.backoffMultiplier must be greater than or equal to 1.",
    );
  }

  const websocket: BinanceWebSocketConfiguration = Object.freeze({
    connectionTimeoutMs:
      options.websocket?.connectionTimeoutMs ??
      DEFAULT_WEBSOCKET_CONFIGURATION.connectionTimeoutMs,
    inactivityTimeoutMs:
      options.websocket?.inactivityTimeoutMs ??
      DEFAULT_WEBSOCKET_CONFIGURATION.inactivityTimeoutMs,
    reconnectDelayMs:
      options.websocket?.reconnectDelayMs ??
      DEFAULT_WEBSOCKET_CONFIGURATION.reconnectDelayMs,
    maxReconnectDelayMs:
      options.websocket?.maxReconnectDelayMs ??
      DEFAULT_WEBSOCKET_CONFIGURATION.maxReconnectDelayMs,
    maxReconnectAttempts:
      options.websocket?.maxReconnectAttempts ??
      DEFAULT_WEBSOCKET_CONFIGURATION.maxReconnectAttempts,
  });

  assertPositiveInteger(
    websocket.connectionTimeoutMs,
    "websocket.connectionTimeoutMs",
  );
  assertPositiveInteger(
    websocket.inactivityTimeoutMs,
    "websocket.inactivityTimeoutMs",
  );
  assertPositiveInteger(
    websocket.reconnectDelayMs,
    "websocket.reconnectDelayMs",
  );
  assertPositiveInteger(
    websocket.maxReconnectDelayMs,
    "websocket.maxReconnectDelayMs",
  );
  assertNonNegativeInteger(
    websocket.maxReconnectAttempts,
    "websocket.maxReconnectAttempts",
  );

  if (websocket.maxReconnectDelayMs < websocket.reconnectDelayMs) {
    throw new BinanceConnectorConfigurationError(
      "websocket.maxReconnectDelayMs must be greater than or equal to websocket.reconnectDelayMs.",
    );
  }

  return Object.freeze({
    environment,
    credentials: validateCredentials(options.credentials),
    endpoints,
    requestTimeoutMs,
    recvWindowMs,
    rateLimit,
    retry,
    websocket,
  });
}

export const DEFAULT_BINANCE_CONNECTOR_CONFIGURATION =
  createBinanceConnectorConfiguration();