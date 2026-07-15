/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Immutable exchange connector configuration contracts.
 *
 * This module defines environment, endpoint, authentication, timeout, retry,
 * rate-limit, and WebSocket configuration used by exchange connectors.
 */

import type {
  ExchangeConnectorId,
  ExchangeEnvironment,
  ExchangeMarketType,
} from "./exchange-connector";

/**
 * Authentication mechanisms supported by exchange connectors.
 */
export type ExchangeAuthenticationType =
  | "NONE"
  | "API_KEY"
  | "API_KEY_SECRET"
  | "API_KEY_SECRET_PASSPHRASE"
  | "OAUTH2"
  | "CUSTOM";

/**
 * REST request-signing algorithms commonly used by exchanges.
 */
export type ExchangeSigningAlgorithm =
  | "NONE"
  | "HMAC_SHA256"
  | "HMAC_SHA384"
  | "HMAC_SHA512"
  | "RSA_SHA256"
  | "ED25519"
  | "CUSTOM";

/**
 * Supported REST endpoint purposes.
 */
export type ExchangeRestEndpointType =
  | "PUBLIC"
  | "PRIVATE"
  | "MARKET_DATA"
  | "TRADING"
  | "ACCOUNT";

/**
 * Supported WebSocket endpoint purposes.
 */
export type ExchangeWebSocketEndpointType =
  | "PUBLIC"
  | "PRIVATE"
  | "MARKET_DATA"
  | "TRADING"
  | "ACCOUNT";

/**
 * HTTP methods available to exchange REST clients.
 */
export type ExchangeHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

/**
 * Immutable connector credentials.
 *
 * Credentials must never be logged, serialized into reports, or exposed
 * through connector metadata.
 */
export interface ExchangeConnectorCredentials {
  readonly authenticationType: ExchangeAuthenticationType;

  /**
   * Public API key supplied by the exchange.
   */
  readonly apiKey?: string;

  /**
   * Private signing secret supplied by the exchange.
   */
  readonly apiSecret?: string;

  /**
   * Additional passphrase required by exchanges such as OKX.
   */
  readonly passphrase?: string;

  /**
   * OAuth access token where supported.
   */
  readonly accessToken?: string;

  /**
   * Optional OAuth refresh token.
   */
  readonly refreshToken?: string;

  /**
   * Optional private key used by asymmetric signing algorithms.
   */
  readonly privateKey?: string;

  /**
   * Optional public key identifier.
   */
  readonly keyId?: string;

  /**
   * Immutable exchange-specific credential values.
   */
  readonly additionalCredentials?: Readonly<Record<string, string>>;
}

/**
 * REST endpoint configuration.
 */
export interface ExchangeRestEndpointConfig {
  readonly type: ExchangeRestEndpointType;

  /**
   * Absolute REST API base URL.
   *
   * Example:
   * https://api.exchange.example
   */
  readonly baseUrl: string;

  /**
   * Optional API version prefix.
   *
   * Example:
   * /v5
   */
  readonly apiVersion?: string;

  /**
   * Whether this endpoint requires authenticated requests by default.
   */
  readonly authenticated: boolean;

  /**
   * Optional immutable default headers.
   */
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

/**
 * WebSocket endpoint configuration.
 */
export interface ExchangeWebSocketEndpointConfig {
  readonly type: ExchangeWebSocketEndpointType;

  /**
   * Absolute WebSocket URL.
   *
   * Example:
   * wss://stream.exchange.example/ws
   */
  readonly url: string;

  /**
   * Whether this endpoint requires authentication.
   */
  readonly authenticated: boolean;

  /**
   * Optional application-level subprotocols.
   */
  readonly protocols?: readonly string[];

  /**
   * Optional immutable connection headers.
   */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Request timeout settings.
 */
export interface ExchangeConnectorTimeoutConfig {
  /**
   * Maximum duration allowed to establish a network connection.
   */
  readonly connectionTimeoutMs: number;

  /**
   * Maximum duration allowed for an individual REST request.
   */
  readonly requestTimeoutMs: number;

  /**
   * Maximum duration allowed while waiting for a WebSocket response.
   */
  readonly webSocketResponseTimeoutMs: number;

  /**
   * Maximum idle duration before a WebSocket connection is considered stale.
   */
  readonly webSocketIdleTimeoutMs: number;

  /**
   * Maximum duration allowed during graceful connector shutdown.
   */
  readonly shutdownTimeoutMs: number;
}

/**
 * Retry and exponential-backoff configuration.
 */
export interface ExchangeConnectorRetryConfig {
  /**
   * Maximum total attempts, including the original attempt.
   */
  readonly maximumAttempts: number;

  /**
   * Delay before the first retry.
   */
  readonly initialDelayMs: number;

  /**
   * Maximum permitted retry delay.
   */
  readonly maximumDelayMs: number;

  /**
   * Multiplier applied to each retry delay.
   */
  readonly backoffMultiplier: number;

  /**
   * Optional proportional jitter.
   *
   * A value of 0.1 represents a maximum adjustment of ten percent.
   *
   * Deterministic tests must use an injected jitter source rather than
   * Math.random().
   */
  readonly jitterRatio: number;

  /**
   * HTTP status codes that may be retried.
   */
  readonly retryableStatusCodes: readonly number[];

  /**
   * Transport or exchange error codes that may be retried.
   */
  readonly retryableErrorCodes: readonly string[];

  /**
   * Whether requests that mutate exchange state may be retried.
   *
   * This should normally remain false unless idempotency is guaranteed.
   */
  readonly retryMutatingRequests: boolean;
}

/**
 * Connector-level rate-limit configuration.
 */
export interface ExchangeConnectorRateLimitConfig {
  /**
   * Whether client-side rate limiting is enabled.
   */
  readonly enabled: boolean;

  /**
   * Maximum number of request tokens in the limiter.
   */
  readonly capacity: number;

  /**
   * Number of tokens restored during each refill interval.
   */
  readonly refillTokens: number;

  /**
   * Duration between token refills.
   */
  readonly refillIntervalMs: number;

  /**
   * Maximum duration an operation may wait for capacity.
   */
  readonly maximumQueueWaitMs: number;

  /**
   * Maximum number of operations waiting for rate-limit capacity.
   */
  readonly maximumQueueSize: number;
}

/**
 * REST transport configuration.
 */
export interface ExchangeRestTransportConfig {
  readonly enabled: boolean;

  readonly endpoints: readonly ExchangeRestEndpointConfig[];

  /**
   * Optional user-agent value sent with HTTP requests.
   */
  readonly userAgent?: string;

  /**
   * Whether the REST client should transparently decode JSON responses.
   */
  readonly parseJsonResponses: boolean;

  /**
   * Maximum accepted response payload size.
   */
  readonly maximumResponseSizeBytes: number;

  /**
   * Optional proxy URL.
   */
  readonly proxyUrl?: string;
}

/**
 * WebSocket reconnect configuration.
 */
export interface ExchangeWebSocketReconnectConfig {
  readonly enabled: boolean;

  /**
   * Maximum total reconnect attempts.
   *
   * A value of zero disables reconnect attempts.
   */
  readonly maximumAttempts: number;

  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitterRatio: number;

  /**
   * Duration for which a connection must remain stable before the reconnect
   * attempt counter may be reset.
   */
  readonly stableConnectionThresholdMs: number;
}

/**
 * WebSocket heartbeat configuration.
 */
export interface ExchangeWebSocketHeartbeatConfig {
  readonly enabled: boolean;

  /**
   * Interval between heartbeat messages.
   */
  readonly intervalMs: number;

  /**
   * Maximum time to wait for a heartbeat response.
   */
  readonly responseTimeoutMs: number;

  /**
   * Exchange-specific ping payload.
   */
  readonly pingPayload?: string;

  /**
   * Exchange-specific pong payload.
   */
  readonly expectedPongPayload?: string;
}

/**
 * WebSocket transport configuration.
 */
export interface ExchangeWebSocketTransportConfig {
  readonly enabled: boolean;

  readonly endpoints: readonly ExchangeWebSocketEndpointConfig[];

  readonly reconnect: ExchangeWebSocketReconnectConfig;
  readonly heartbeat: ExchangeWebSocketHeartbeatConfig;

  /**
   * Maximum incoming WebSocket message size.
   */
  readonly maximumMessageSizeBytes: number;

  /**
   * Maximum number of messages waiting to be processed.
   */
  readonly maximumBufferedMessages: number;
}

/**
 * Exchange request-signing configuration.
 */
export interface ExchangeConnectorSigningConfig {
  readonly algorithm: ExchangeSigningAlgorithm;

  /**
   * Name of the API key header or request field.
   */
  readonly apiKeyParameterName?: string;

  /**
   * Name of the timestamp header or request field.
   */
  readonly timestampParameterName?: string;

  /**
   * Name of the signature header or request field.
   */
  readonly signatureParameterName?: string;

  /**
   * Name of the passphrase header or request field.
   */
  readonly passphraseParameterName?: string;

  /**
   * Timestamp tolerance accepted by the exchange.
   */
  readonly receiveWindowMs?: number;

  /**
   * Whether query parameters must be sorted before signing.
   */
  readonly sortQueryParameters: boolean;

  /**
   * Whether request bodies participate in the signature.
   */
  readonly includeRequestBody: boolean;

  /**
   * Whether the HTTP method participates in the signature.
   */
  readonly includeHttpMethod: boolean;

  /**
   * Whether the request path participates in the signature.
   */
  readonly includeRequestPath: boolean;

  /**
   * Optional immutable exchange-specific signing values.
   */
  readonly additionalParameters?: Readonly<Record<string, string>>;
}

/**
 * Time synchronization settings.
 */
export interface ExchangeConnectorTimeSyncConfig {
  readonly enabled: boolean;

  /**
   * Maximum acceptable difference between local and exchange time.
   */
  readonly maximumClockDriftMs: number;

  /**
   * Interval between synchronization attempts.
   */
  readonly synchronizationIntervalMs: number;

  /**
   * Number of samples used to estimate exchange time.
   */
  readonly sampleCount: number;
}

/**
 * Complete immutable connector configuration.
 */
export interface ExchangeConnectorConfig {
  readonly connectorId: ExchangeConnectorId;
  readonly exchangeName: string;
  readonly environment: ExchangeEnvironment;

  /**
   * Market types enabled for this connector instance.
   */
  readonly marketTypes: readonly ExchangeMarketType[];

  readonly credentials?: ExchangeConnectorCredentials;
  readonly signing: ExchangeConnectorSigningConfig;

  readonly rest: ExchangeRestTransportConfig;
  readonly webSocket: ExchangeWebSocketTransportConfig;

  readonly timeouts: ExchangeConnectorTimeoutConfig;
  readonly retry: ExchangeConnectorRetryConfig;
  readonly rateLimit: ExchangeConnectorRateLimitConfig;
  readonly timeSync: ExchangeConnectorTimeSyncConfig;

  /**
   * Whether private authenticated operations are permitted.
   */
  readonly enablePrivateOperations: boolean;

  /**
   * Whether the connector should start WebSocket transports when connected.
   */
  readonly enableStreaming: boolean;

  /**
   * Immutable exchange-specific configuration.
   */
  readonly additionalConfig?: Readonly<Record<string, unknown>>;
}

/**
 * Validation failure returned for an invalid connector configuration.
 */
export interface ExchangeConnectorConfigValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/**
 * Result of validating a connector configuration.
 */
export interface ExchangeConnectorConfigValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ExchangeConnectorConfigValidationIssue[];
}

/**
 * Validates an exchange connector configuration.
 */
export function validateExchangeConnectorConfig(
  config: ExchangeConnectorConfig,
): ExchangeConnectorConfigValidationResult {
  const issues: ExchangeConnectorConfigValidationIssue[] = [];

  validateRequiredString(
    config.connectorId,
    "connectorId",
    "CONNECTOR_ID_REQUIRED",
    issues,
  );

  validateRequiredString(
    config.exchangeName,
    "exchangeName",
    "EXCHANGE_NAME_REQUIRED",
    issues,
  );

  if (config.marketTypes.length === 0) {
    issues.push({
      path: "marketTypes",
      code: "MARKET_TYPES_REQUIRED",
      message: "At least one exchange market type must be configured.",
    });
  }

  validateUniqueValues(config.marketTypes, "marketTypes", issues);

  validateCredentials(config, issues);
  validateSigningConfig(config.signing, issues);
  validateRestConfig(config.rest, issues);
  validateWebSocketConfig(config.webSocket, issues);
  validateTimeoutConfig(config.timeouts, issues);
  validateRetryConfig(config.retry, issues);
  validateRateLimitConfig(config.rateLimit, issues);
  validateTimeSyncConfig(config.timeSync, issues);

  if (config.enablePrivateOperations && !config.credentials) {
    issues.push({
      path: "credentials",
      code: "PRIVATE_CREDENTIALS_REQUIRED",
      message:
        "Credentials are required when private operations are enabled.",
    });
  }

  if (config.enableStreaming && !config.webSocket.enabled) {
    issues.push({
      path: "enableStreaming",
      code: "WEBSOCKET_TRANSPORT_DISABLED",
      message:
        "WebSocket transport must be enabled when streaming is enabled.",
    });
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

/**
 * Returns an immutable redacted copy of the connector credentials.
 *
 * This function is intended for diagnostics and configuration inspection.
 */
export function redactExchangeConnectorCredentials(
  credentials: ExchangeConnectorCredentials,
): ExchangeConnectorCredentials {
  return Object.freeze({
    authenticationType: credentials.authenticationType,
    apiKey: redactSecret(credentials.apiKey),
    apiSecret: redactSecret(credentials.apiSecret),
    passphrase: redactSecret(credentials.passphrase),
    accessToken: redactSecret(credentials.accessToken),
    refreshToken: redactSecret(credentials.refreshToken),
    privateKey: redactSecret(credentials.privateKey),
    keyId: credentials.keyId,
    additionalCredentials: credentials.additionalCredentials
      ? Object.freeze(
          Object.fromEntries(
            Object.keys(credentials.additionalCredentials).map((key) => [
              key,
              "[REDACTED]",
            ]),
          ),
        )
      : undefined,
  });
}

function validateCredentials(
  config: ExchangeConnectorConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  const credentials = config.credentials;

  if (!credentials) {
    return;
  }

  switch (credentials.authenticationType) {
    case "NONE":
      return;

    case "API_KEY":
      requireCredential(credentials.apiKey, "credentials.apiKey", issues);
      return;

    case "API_KEY_SECRET":
      requireCredential(credentials.apiKey, "credentials.apiKey", issues);
      requireCredential(credentials.apiSecret, "credentials.apiSecret", issues);
      return;

    case "API_KEY_SECRET_PASSPHRASE":
      requireCredential(credentials.apiKey, "credentials.apiKey", issues);
      requireCredential(credentials.apiSecret, "credentials.apiSecret", issues);
      requireCredential(
        credentials.passphrase,
        "credentials.passphrase",
        issues,
      );
      return;

    case "OAUTH2":
      requireCredential(
        credentials.accessToken,
        "credentials.accessToken",
        issues,
      );
      return;

    case "CUSTOM":
      if (
        !credentials.additionalCredentials ||
        Object.keys(credentials.additionalCredentials).length === 0
      ) {
        issues.push({
          path: "credentials.additionalCredentials",
          code: "CUSTOM_CREDENTIALS_REQUIRED",
          message:
            "Custom authentication requires additional credential values.",
        });
      }
      return;
  }
}

function validateSigningConfig(
  config: ExchangeConnectorSigningConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validateNonNegativeNumber(
    config.receiveWindowMs,
    "signing.receiveWindowMs",
    issues,
    true,
  );

  if (
    config.algorithm !== "NONE" &&
    !config.signatureParameterName?.trim()
  ) {
    issues.push({
      path: "signing.signatureParameterName",
      code: "SIGNATURE_PARAMETER_REQUIRED",
      message:
        "A signature parameter name is required when request signing is enabled.",
    });
  }
}

function validateRestConfig(
  config: ExchangeRestTransportConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validatePositiveInteger(
    config.maximumResponseSizeBytes,
    "rest.maximumResponseSizeBytes",
    issues,
  );

  if (config.enabled && config.endpoints.length === 0) {
    issues.push({
      path: "rest.endpoints",
      code: "REST_ENDPOINT_REQUIRED",
      message:
        "At least one REST endpoint is required when REST transport is enabled.",
    });
  }

  const endpointTypes = config.endpoints.map((endpoint) => endpoint.type);
  validateUniqueValues(endpointTypes, "rest.endpoints", issues);

  config.endpoints.forEach((endpoint, index) => {
    if (!isValidAbsoluteUrl(endpoint.baseUrl, ["http:", "https:"])) {
      issues.push({
        path: `rest.endpoints[${index}].baseUrl`,
        code: "INVALID_REST_URL",
        message: "REST base URL must be an absolute HTTP or HTTPS URL.",
      });
    }
  });
}

function validateWebSocketConfig(
  config: ExchangeWebSocketTransportConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validatePositiveInteger(
    config.maximumMessageSizeBytes,
    "webSocket.maximumMessageSizeBytes",
    issues,
  );

  validatePositiveInteger(
    config.maximumBufferedMessages,
    "webSocket.maximumBufferedMessages",
    issues,
  );

  if (config.enabled && config.endpoints.length === 0) {
    issues.push({
      path: "webSocket.endpoints",
      code: "WEBSOCKET_ENDPOINT_REQUIRED",
      message:
        "At least one WebSocket endpoint is required when WebSocket transport is enabled.",
    });
  }

  const endpointTypes = config.endpoints.map((endpoint) => endpoint.type);
  validateUniqueValues(endpointTypes, "webSocket.endpoints", issues);

  config.endpoints.forEach((endpoint, index) => {
    if (!isValidAbsoluteUrl(endpoint.url, ["ws:", "wss:"])) {
      issues.push({
        path: `webSocket.endpoints[${index}].url`,
        code: "INVALID_WEBSOCKET_URL",
        message: "WebSocket URL must be an absolute WS or WSS URL.",
      });
    }
  });

  validateReconnectConfig(config.reconnect, issues);
  validateHeartbeatConfig(config.heartbeat, issues);
}

function validateReconnectConfig(
  config: ExchangeWebSocketReconnectConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validateNonNegativeInteger(
    config.maximumAttempts,
    "webSocket.reconnect.maximumAttempts",
    issues,
  );

  validateNonNegativeNumber(
    config.initialDelayMs,
    "webSocket.reconnect.initialDelayMs",
    issues,
  );

  validateNonNegativeNumber(
    config.maximumDelayMs,
    "webSocket.reconnect.maximumDelayMs",
    issues,
  );

  validateMinimumNumber(
    config.backoffMultiplier,
    1,
    "webSocket.reconnect.backoffMultiplier",
    issues,
  );

  validateRatio(
    config.jitterRatio,
    "webSocket.reconnect.jitterRatio",
    issues,
  );

  validateNonNegativeNumber(
    config.stableConnectionThresholdMs,
    "webSocket.reconnect.stableConnectionThresholdMs",
    issues,
  );

  if (config.maximumDelayMs < config.initialDelayMs) {
    issues.push({
      path: "webSocket.reconnect.maximumDelayMs",
      code: "MAXIMUM_DELAY_TOO_SMALL",
      message:
        "Maximum reconnect delay must be greater than or equal to the initial delay.",
    });
  }
}

function validateHeartbeatConfig(
  config: ExchangeWebSocketHeartbeatConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!config.enabled) {
    return;
  }

  validatePositiveNumber(
    config.intervalMs,
    "webSocket.heartbeat.intervalMs",
    issues,
  );

  validatePositiveNumber(
    config.responseTimeoutMs,
    "webSocket.heartbeat.responseTimeoutMs",
    issues,
  );

  if (config.responseTimeoutMs >= config.intervalMs) {
    issues.push({
      path: "webSocket.heartbeat.responseTimeoutMs",
      code: "HEARTBEAT_TIMEOUT_TOO_LARGE",
      message:
        "Heartbeat response timeout must be smaller than the heartbeat interval.",
    });
  }
}

function validateTimeoutConfig(
  config: ExchangeConnectorTimeoutConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validatePositiveNumber(
    config.connectionTimeoutMs,
    "timeouts.connectionTimeoutMs",
    issues,
  );

  validatePositiveNumber(
    config.requestTimeoutMs,
    "timeouts.requestTimeoutMs",
    issues,
  );

  validatePositiveNumber(
    config.webSocketResponseTimeoutMs,
    "timeouts.webSocketResponseTimeoutMs",
    issues,
  );

  validatePositiveNumber(
    config.webSocketIdleTimeoutMs,
    "timeouts.webSocketIdleTimeoutMs",
    issues,
  );

  validatePositiveNumber(
    config.shutdownTimeoutMs,
    "timeouts.shutdownTimeoutMs",
    issues,
  );
}

function validateRetryConfig(
  config: ExchangeConnectorRetryConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  validatePositiveInteger(
    config.maximumAttempts,
    "retry.maximumAttempts",
    issues,
  );

  validateNonNegativeNumber(
    config.initialDelayMs,
    "retry.initialDelayMs",
    issues,
  );

  validateNonNegativeNumber(
    config.maximumDelayMs,
    "retry.maximumDelayMs",
    issues,
  );

  validateMinimumNumber(
    config.backoffMultiplier,
    1,
    "retry.backoffMultiplier",
    issues,
  );

  validateRatio(config.jitterRatio, "retry.jitterRatio", issues);

  if (config.maximumDelayMs < config.initialDelayMs) {
    issues.push({
      path: "retry.maximumDelayMs",
      code: "MAXIMUM_DELAY_TOO_SMALL",
      message:
        "Maximum retry delay must be greater than or equal to the initial delay.",
    });
  }

  config.retryableStatusCodes.forEach((statusCode, index) => {
    if (
      !Number.isInteger(statusCode) ||
      statusCode < 100 ||
      statusCode > 599
    ) {
      issues.push({
        path: `retry.retryableStatusCodes[${index}]`,
        code: "INVALID_HTTP_STATUS_CODE",
        message: "Retryable HTTP status codes must be between 100 and 599.",
      });
    }
  });

  validateUniqueValues(
    config.retryableStatusCodes,
    "retry.retryableStatusCodes",
    issues,
  );

  validateUniqueValues(
    config.retryableErrorCodes,
    "retry.retryableErrorCodes",
    issues,
  );
}

function validateRateLimitConfig(
  config: ExchangeConnectorRateLimitConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!config.enabled) {
    return;
  }

  validatePositiveInteger(config.capacity, "rateLimit.capacity", issues);

  validatePositiveInteger(
    config.refillTokens,
    "rateLimit.refillTokens",
    issues,
  );

  validatePositiveNumber(
    config.refillIntervalMs,
    "rateLimit.refillIntervalMs",
    issues,
  );

  validateNonNegativeNumber(
    config.maximumQueueWaitMs,
    "rateLimit.maximumQueueWaitMs",
    issues,
  );

  validateNonNegativeInteger(
    config.maximumQueueSize,
    "rateLimit.maximumQueueSize",
    issues,
  );
}

function validateTimeSyncConfig(
  config: ExchangeConnectorTimeSyncConfig,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!config.enabled) {
    return;
  }

  validateNonNegativeNumber(
    config.maximumClockDriftMs,
    "timeSync.maximumClockDriftMs",
    issues,
  );

  validatePositiveNumber(
    config.synchronizationIntervalMs,
    "timeSync.synchronizationIntervalMs",
    issues,
  );

  validatePositiveInteger(
    config.sampleCount,
    "timeSync.sampleCount",
    issues,
  );
}

function validateRequiredString(
  value: string,
  path: string,
  code: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!value.trim()) {
    issues.push({
      path,
      code,
      message: `${path} must not be empty.`,
    });
  }
}

function requireCredential(
  value: string | undefined,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!value?.trim()) {
    issues.push({
      path,
      code: "REQUIRED_CREDENTIAL_MISSING",
      message: `${path} is required for the selected authentication type.`,
    });
  }
}

function validatePositiveNumber(
  value: number,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!Number.isFinite(value) || value <= 0) {
    issues.push({
      path,
      code: "POSITIVE_NUMBER_REQUIRED",
      message: `${path} must be a finite number greater than zero.`,
    });
  }
}

function validateNonNegativeNumber(
  value: number | undefined,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
  optional = false,
): void {
  if (value === undefined && optional) {
    return;
  }

  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    issues.push({
      path,
      code: "NON_NEGATIVE_NUMBER_REQUIRED",
      message: `${path} must be a finite number greater than or equal to zero.`,
    });
  }
}

function validateMinimumNumber(
  value: number,
  minimum: number,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < minimum) {
    issues.push({
      path,
      code: "MINIMUM_NUMBER_REQUIRED",
      message: `${path} must be a finite number greater than or equal to ${minimum}.`,
    });
  }
}

function validatePositiveInteger(
  value: number,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!Number.isInteger(value) || value <= 0) {
    issues.push({
      path,
      code: "POSITIVE_INTEGER_REQUIRED",
      message: `${path} must be an integer greater than zero.`,
    });
  }
}

function validateNonNegativeInteger(
  value: number,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!Number.isInteger(value) || value < 0) {
    issues.push({
      path,
      code: "NON_NEGATIVE_INTEGER_REQUIRED",
      message: `${path} must be an integer greater than or equal to zero.`,
    });
  }
}

function validateRatio(
  value: number,
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    issues.push({
      path,
      code: "INVALID_RATIO",
      message: `${path} must be between zero and one.`,
    });
  }
}

function validateUniqueValues<T>(
  values: readonly T[],
  path: string,
  issues: ExchangeConnectorConfigValidationIssue[],
): void {
  const uniqueValues = new Set(values);

  if (uniqueValues.size !== values.length) {
    issues.push({
      path,
      code: "DUPLICATE_VALUES",
      message: `${path} must not contain duplicate values.`,
    });
  }
}

function isValidAbsoluteUrl(
  value: string,
  allowedProtocols: readonly string[],
): boolean {
  try {
    const url = new URL(value);
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
}

function redactSecret(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return "[REDACTED]";
}