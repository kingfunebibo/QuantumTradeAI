/**
 * OKX Exchange Adapter
 *
 * Defines the immutable configuration boundary used by the OKX connector.
 *
 * This file intentionally contains no HTTP, WebSocket, authentication,
 * signing, or exchange-domain logic. It provides the validated configuration
 * required by those components.
 */

export const OKX_EXCHANGE_ID = "okx" as const;

export type OkxExchangeId = typeof OKX_EXCHANGE_ID;

export type OkxEnvironment = "production" | "demo";

export type OkxTradingMode = "spot" | "margin" | "swap" | "futures" | "option";

export interface OkxApiCredentials {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly passphrase: string;
}

export interface OkxRestEndpoints {
  readonly baseUrl: string;
}

export interface OkxWebSocketEndpoints {
  readonly publicUrl: string;
  readonly privateUrl: string;
  readonly businessUrl: string;
}

export interface OkxNetworkTimeouts {
  readonly requestTimeoutMs: number;
  readonly connectionTimeoutMs: number;
  readonly websocketHeartbeatIntervalMs: number;
  readonly websocketHeartbeatTimeoutMs: number;
}

export interface OkxRetryConfiguration {
  readonly enabled: boolean;
  readonly maximumAttempts: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly backoffMultiplier: number;
}

export interface OkxTimeSynchronizationConfiguration {
  readonly enabled: boolean;
  readonly synchronizationIntervalMs: number;
  readonly maximumAcceptedClockDriftMs: number;
}

export interface OkxRateLimitConfiguration {
  readonly enabled: boolean;
  readonly queueRequests: boolean;
  readonly maximumQueueSize: number;
}

export interface OkxConnectorConfiguration {
  readonly exchangeId: OkxExchangeId;
  readonly environment: OkxEnvironment;
  readonly tradingMode: OkxTradingMode;
  readonly credentials?: OkxApiCredentials;
  readonly rest: OkxRestEndpoints;
  readonly websocket: OkxWebSocketEndpoints;
  readonly timeouts: OkxNetworkTimeouts;
  readonly retry: OkxRetryConfiguration;
  readonly timeSynchronization: OkxTimeSynchronizationConfiguration;
  readonly rateLimit: OkxRateLimitConfiguration;
  readonly simulatedTrading: boolean;
}

export interface CreateOkxConnectorConfigurationInput {
  readonly environment?: OkxEnvironment;
  readonly tradingMode?: OkxTradingMode;
  readonly credentials?: OkxApiCredentials;

  readonly rest?: Partial<OkxRestEndpoints>;
  readonly websocket?: Partial<OkxWebSocketEndpoints>;
  readonly timeouts?: Partial<OkxNetworkTimeouts>;
  readonly retry?: Partial<OkxRetryConfiguration>;
  readonly timeSynchronization?: Partial<OkxTimeSynchronizationConfiguration>;
  readonly rateLimit?: Partial<OkxRateLimitConfiguration>;

  readonly simulatedTrading?: boolean;
}

export class OkxConfigurationError extends Error {
  public readonly code = "OKX_CONFIGURATION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxConfigurationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const OKX_PRODUCTION_REST_ENDPOINTS: OkxRestEndpoints = Object.freeze({
  baseUrl: "https://www.okx.com",
});

const OKX_PRODUCTION_WEBSOCKET_ENDPOINTS: OkxWebSocketEndpoints =
  Object.freeze({
    publicUrl: "wss://ws.okx.com:8443/ws/v5/public",
    privateUrl: "wss://ws.okx.com:8443/ws/v5/private",
    businessUrl: "wss://ws.okx.com:8443/ws/v5/business",
  });

const OKX_DEMO_WEBSOCKET_ENDPOINTS: OkxWebSocketEndpoints = Object.freeze({
  publicUrl: "wss://wspap.okx.com:8443/ws/v5/public",
  privateUrl: "wss://wspap.okx.com:8443/ws/v5/private",
  businessUrl: "wss://wspap.okx.com:8443/ws/v5/business",
});

const DEFAULT_TIMEOUTS: OkxNetworkTimeouts = Object.freeze({
  requestTimeoutMs: 15_000,
  connectionTimeoutMs: 10_000,
  websocketHeartbeatIntervalMs: 20_000,
  websocketHeartbeatTimeoutMs: 10_000,
});

const DEFAULT_RETRY_CONFIGURATION: OkxRetryConfiguration = Object.freeze({
  enabled: true,
  maximumAttempts: 3,
  initialDelayMs: 250,
  maximumDelayMs: 5_000,
  backoffMultiplier: 2,
});

const DEFAULT_TIME_SYNCHRONIZATION_CONFIGURATION: OkxTimeSynchronizationConfiguration =
  Object.freeze({
    enabled: true,
    synchronizationIntervalMs: 30_000,
    maximumAcceptedClockDriftMs: 5_000,
  });

const DEFAULT_RATE_LIMIT_CONFIGURATION: OkxRateLimitConfiguration =
  Object.freeze({
    enabled: true,
    queueRequests: true,
    maximumQueueSize: 1_000,
  });

export const DEFAULT_OKX_CONNECTOR_CONFIGURATION: OkxConnectorConfiguration =
  Object.freeze({
    exchangeId: OKX_EXCHANGE_ID,
    environment: "production",
    tradingMode: "spot",
    rest: OKX_PRODUCTION_REST_ENDPOINTS,
    websocket: OKX_PRODUCTION_WEBSOCKET_ENDPOINTS,
    timeouts: DEFAULT_TIMEOUTS,
    retry: DEFAULT_RETRY_CONFIGURATION,
    timeSynchronization: DEFAULT_TIME_SYNCHRONIZATION_CONFIGURATION,
    rateLimit: DEFAULT_RATE_LIMIT_CONFIGURATION,
    simulatedTrading: false,
  });

/**
 * Creates a validated, deeply immutable OKX connector configuration.
 *
 * Credentials are optional because public market-data operations do not
 * require authenticated access. Components performing private operations
 * must explicitly require credentials before sending a request.
 */
export function createOkxConnectorConfiguration(
  input: CreateOkxConnectorConfigurationInput = {},
): OkxConnectorConfiguration {
  const environment = input.environment ?? "production";
  const simulatedTrading =
    input.simulatedTrading ?? environment === "demo";

  validateEnvironment(environment);
  validateTradingMode(input.tradingMode ?? "spot");

  const credentials = input.credentials
    ? createCredentials(input.credentials)
    : undefined;

  const defaultWebSocketEndpoints =
    environment === "demo"
      ? OKX_DEMO_WEBSOCKET_ENDPOINTS
      : OKX_PRODUCTION_WEBSOCKET_ENDPOINTS;

  const rest = createRestEndpoints({
    ...OKX_PRODUCTION_REST_ENDPOINTS,
    ...input.rest,
  });

  const websocket = createWebSocketEndpoints({
    ...defaultWebSocketEndpoints,
    ...input.websocket,
  });

  const timeouts = createTimeouts({
    ...DEFAULT_TIMEOUTS,
    ...input.timeouts,
  });

  const retry = createRetryConfiguration({
    ...DEFAULT_RETRY_CONFIGURATION,
    ...input.retry,
  });

  const timeSynchronization = createTimeSynchronizationConfiguration({
    ...DEFAULT_TIME_SYNCHRONIZATION_CONFIGURATION,
    ...input.timeSynchronization,
  });

  const rateLimit = createRateLimitConfiguration({
    ...DEFAULT_RATE_LIMIT_CONFIGURATION,
    ...input.rateLimit,
  });

  return Object.freeze({
    exchangeId: OKX_EXCHANGE_ID,
    environment,
    tradingMode: input.tradingMode ?? "spot",
    credentials,
    rest,
    websocket,
    timeouts,
    retry,
    timeSynchronization,
    rateLimit,
    simulatedTrading,
  });
}

/**
 * Returns credentials for a private OKX operation.
 *
 * Public connector components should not call this function.
 */
export function requireOkxCredentials(
  configuration: OkxConnectorConfiguration,
): OkxApiCredentials {
  if (!configuration.credentials) {
    throw new OkxConfigurationError(
      "OKX API credentials are required for private exchange operations.",
    );
  }

  return configuration.credentials;
}

function createCredentials(
  credentials: OkxApiCredentials,
): OkxApiCredentials {
  const apiKey = requireNonEmptyString(
    credentials.apiKey,
    "credentials.apiKey",
  );

  const secretKey = requireNonEmptyString(
    credentials.secretKey,
    "credentials.secretKey",
  );

  const passphrase = requireNonEmptyString(
    credentials.passphrase,
    "credentials.passphrase",
  );

  return Object.freeze({
    apiKey,
    secretKey,
    passphrase,
  });
}

function createRestEndpoints(
  endpoints: OkxRestEndpoints,
): OkxRestEndpoints {
  const baseUrl = normalizeHttpUrl(endpoints.baseUrl, "rest.baseUrl");

  return Object.freeze({
    baseUrl,
  });
}

function createWebSocketEndpoints(
  endpoints: OkxWebSocketEndpoints,
): OkxWebSocketEndpoints {
  const publicUrl = normalizeWebSocketUrl(
    endpoints.publicUrl,
    "websocket.publicUrl",
  );

  const privateUrl = normalizeWebSocketUrl(
    endpoints.privateUrl,
    "websocket.privateUrl",
  );

  const businessUrl = normalizeWebSocketUrl(
    endpoints.businessUrl,
    "websocket.businessUrl",
  );

  return Object.freeze({
    publicUrl,
    privateUrl,
    businessUrl,
  });
}

function createTimeouts(
  timeouts: OkxNetworkTimeouts,
): OkxNetworkTimeouts {
  requirePositiveInteger(
    timeouts.requestTimeoutMs,
    "timeouts.requestTimeoutMs",
  );

  requirePositiveInteger(
    timeouts.connectionTimeoutMs,
    "timeouts.connectionTimeoutMs",
  );

  requirePositiveInteger(
    timeouts.websocketHeartbeatIntervalMs,
    "timeouts.websocketHeartbeatIntervalMs",
  );

  requirePositiveInteger(
    timeouts.websocketHeartbeatTimeoutMs,
    "timeouts.websocketHeartbeatTimeoutMs",
  );

  if (
    timeouts.websocketHeartbeatTimeoutMs >=
    timeouts.websocketHeartbeatIntervalMs
  ) {
    throw new OkxConfigurationError(
      "timeouts.websocketHeartbeatTimeoutMs must be less than " +
        "timeouts.websocketHeartbeatIntervalMs.",
    );
  }

  return Object.freeze({
    requestTimeoutMs: timeouts.requestTimeoutMs,
    connectionTimeoutMs: timeouts.connectionTimeoutMs,
    websocketHeartbeatIntervalMs:
      timeouts.websocketHeartbeatIntervalMs,
    websocketHeartbeatTimeoutMs:
      timeouts.websocketHeartbeatTimeoutMs,
  });
}

function createRetryConfiguration(
  retry: OkxRetryConfiguration,
): OkxRetryConfiguration {
  requirePositiveInteger(
    retry.maximumAttempts,
    "retry.maximumAttempts",
  );

  requireNonNegativeInteger(
    retry.initialDelayMs,
    "retry.initialDelayMs",
  );

  requirePositiveInteger(
    retry.maximumDelayMs,
    "retry.maximumDelayMs",
  );

  requireFiniteNumber(
    retry.backoffMultiplier,
    "retry.backoffMultiplier",
  );

  if (retry.backoffMultiplier < 1) {
    throw new OkxConfigurationError(
      "retry.backoffMultiplier must be greater than or equal to 1.",
    );
  }

  if (retry.initialDelayMs > retry.maximumDelayMs) {
    throw new OkxConfigurationError(
      "retry.initialDelayMs must be less than or equal to " +
        "retry.maximumDelayMs.",
    );
  }

  return Object.freeze({
    enabled: retry.enabled,
    maximumAttempts: retry.maximumAttempts,
    initialDelayMs: retry.initialDelayMs,
    maximumDelayMs: retry.maximumDelayMs,
    backoffMultiplier: retry.backoffMultiplier,
  });
}

function createTimeSynchronizationConfiguration(
  configuration: OkxTimeSynchronizationConfiguration,
): OkxTimeSynchronizationConfiguration {
  requirePositiveInteger(
    configuration.synchronizationIntervalMs,
    "timeSynchronization.synchronizationIntervalMs",
  );

  requireNonNegativeInteger(
    configuration.maximumAcceptedClockDriftMs,
    "timeSynchronization.maximumAcceptedClockDriftMs",
  );

  return Object.freeze({
    enabled: configuration.enabled,
    synchronizationIntervalMs:
      configuration.synchronizationIntervalMs,
    maximumAcceptedClockDriftMs:
      configuration.maximumAcceptedClockDriftMs,
  });
}

function createRateLimitConfiguration(
  configuration: OkxRateLimitConfiguration,
): OkxRateLimitConfiguration {
  requirePositiveInteger(
    configuration.maximumQueueSize,
    "rateLimit.maximumQueueSize",
  );

  if (!configuration.enabled && configuration.queueRequests) {
    throw new OkxConfigurationError(
      "rateLimit.queueRequests cannot be enabled when rate limiting is disabled.",
    );
  }

  return Object.freeze({
    enabled: configuration.enabled,
    queueRequests: configuration.queueRequests,
    maximumQueueSize: configuration.maximumQueueSize,
  });
}

function validateEnvironment(environment: OkxEnvironment): void {
  if (environment !== "production" && environment !== "demo") {
    throw new OkxConfigurationError(
      `Unsupported OKX environment: ${String(environment)}.`,
    );
  }
}

function validateTradingMode(tradingMode: OkxTradingMode): void {
  const supportedModes: readonly OkxTradingMode[] = [
    "spot",
    "margin",
    "swap",
    "futures",
    "option",
  ];

  if (!supportedModes.includes(tradingMode)) {
    throw new OkxConfigurationError(
      `Unsupported OKX trading mode: ${String(tradingMode)}.`,
    );
  }
}

function normalizeHttpUrl(value: string, fieldName: string): string {
  const normalizedValue = requireNonEmptyString(value, fieldName);
  const url = parseUrl(normalizedValue, fieldName);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OkxConfigurationError(
      `${fieldName} must use the HTTP or HTTPS protocol.`,
    );
  }

  return removeTrailingSlashes(url.toString());
}

function normalizeWebSocketUrl(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = requireNonEmptyString(value, fieldName);
  const url = parseUrl(normalizedValue, fieldName);

  if (url.protocol !== "wss:" && url.protocol !== "ws:") {
    throw new OkxConfigurationError(
      `${fieldName} must use the WS or WSS protocol.`,
    );
  }

  return removeTrailingSlashes(url.toString());
}

function parseUrl(value: string, fieldName: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new OkxConfigurationError(
      `${fieldName} must be a valid absolute URL.`,
    );
  }
}

function removeTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxConfigurationError(
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxConfigurationError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalizedValue;
}

function requirePositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OkxConfigurationError(
      `${fieldName} must be a positive integer.`,
    );
  }
}

function requireNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new OkxConfigurationError(
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function requireFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new OkxConfigurationError(
      `${fieldName} must be a finite number.`,
    );
  }
}