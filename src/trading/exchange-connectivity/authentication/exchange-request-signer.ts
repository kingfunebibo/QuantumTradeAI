/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Exchange request-signing contracts.
 *
 * This module defines transport-independent abstractions for canonical request
 * creation, credential access, timestamp handling, signature generation, and
 * authenticated REST/WebSocket request preparation.
 *
 * Exchange-specific signers such as Bybit, OKX, Binance, or Coinbase must
 * implement these contracts without exposing credential material to the wider
 * trading domain.
 */

import type { ExchangeConnectorOperationContext } from "../connectors/exchange-connector";
import type {
  ExchangeConnectorCredentials,
  ExchangeHttpMethod,
  ExchangeSigningAlgorithm,
} from "../connectors/exchange-connector-config";
import type {
  ExchangeRestHeaders,
  ExchangeRestQueryParameters,
  ExchangeRestRequestBody,
} from "../rest/exchange-rest-client";
import type {
  ExchangeWebSocketMessageEncoding,
  ExchangeWebSocketMessageType,
  ExchangeWebSocketPayload,
} from "../websocket/exchange-websocket-client";

/**
 * Supported locations for authentication fields.
 */
export type ExchangeAuthenticationFieldLocation =
  | "HEADER"
  | "QUERY"
  | "BODY";

/**
 * Supported signature encodings.
 */
export type ExchangeSignatureEncoding =
  | "HEX_LOWER"
  | "HEX_UPPER"
  | "BASE64"
  | "BASE64_URL"
  | "RAW";

/**
 * Supported canonical body serialization modes.
 */
export type ExchangeCanonicalBodyMode =
  | "EMPTY"
  | "JSON"
  | "RAW"
  | "FORM_URL_ENCODED";

/**
 * Supported canonical query serialization modes.
 */
export type ExchangeCanonicalQueryMode =
  | "SORTED"
  | "PRESERVE_INPUT_ORDER"
  | "NONE";

/**
 * Immutable authentication field definition.
 */
export interface ExchangeAuthenticationField {
  readonly name: string;
  readonly value: string;
  readonly location: ExchangeAuthenticationFieldLocation;
}

/**
 * Clock abstraction used during signing.
 *
 * Implementations must not call Date.now() directly. Production code may use a
 * system clock adapter, while deterministic tests may provide a fixed clock.
 */
export interface ExchangeSigningClock {
  now(): number;
}

/**
 * Unique identifier generator used during signing.
 */
export interface ExchangeSigningIdGenerator {
  nextId(): string;
}

/**
 * Immutable REST request input supplied to a signer.
 */
export interface ExchangeRestSigningRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly method: ExchangeHttpMethod;
  readonly path: string;
  readonly query?: ExchangeRestQueryParameters;
  readonly headers?: ExchangeRestHeaders;
  readonly body?: ExchangeRestRequestBody;
  readonly context: ExchangeConnectorOperationContext;

  /**
   * Optional timestamp supplied by the caller.
   *
   * When absent, the signer uses the injected signing clock.
   */
  readonly timestamp?: number;

  /**
   * Optional exchange receive-window override.
   */
  readonly receiveWindowMs?: number;
}

/**
 * Immutable WebSocket authentication request supplied to a signer.
 */
export interface ExchangeWebSocketSigningRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly messageType: ExchangeWebSocketMessageType;
  readonly encoding: ExchangeWebSocketMessageEncoding;
  readonly payload: ExchangeWebSocketPayload;
  readonly context: ExchangeConnectorOperationContext;

  /**
   * Optional timestamp supplied by the caller.
   */
  readonly timestamp?: number;

  /**
   * Optional exchange receive-window override.
   */
  readonly receiveWindowMs?: number;
}

/**
 * Canonical request components used to produce a signature.
 */
export interface ExchangeCanonicalRequest {
  readonly algorithm: ExchangeSigningAlgorithm;
  readonly method?: ExchangeHttpMethod;
  readonly path?: string;
  readonly canonicalQuery: string;
  readonly canonicalHeaders: string;
  readonly canonicalBody: string;
  readonly timestamp: number;
  readonly receiveWindowMs?: number;

  /**
   * Final deterministic payload passed into the cryptographic algorithm.
   */
  readonly signingPayload: string;
}

/**
 * Result returned after signing a REST request.
 */
export interface ExchangeSignedRestRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly method: ExchangeHttpMethod;
  readonly path: string;
  readonly query: ExchangeRestQueryParameters;
  readonly headers: ExchangeRestHeaders;
  readonly body?: ExchangeRestRequestBody;

  readonly timestamp: number;
  readonly signature: string;
  readonly signatureEncoding: ExchangeSignatureEncoding;

  readonly canonicalRequest: ExchangeCanonicalRequest;
  readonly authenticationFields: readonly ExchangeAuthenticationField[];
}

/**
 * Result returned after signing a WebSocket authentication request.
 */
export interface ExchangeSignedWebSocketRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly messageType: ExchangeWebSocketMessageType;
  readonly encoding: ExchangeWebSocketMessageEncoding;
  readonly payload: ExchangeWebSocketPayload;

  readonly timestamp: number;
  readonly signature: string;
  readonly signatureEncoding: ExchangeSignatureEncoding;

  readonly canonicalRequest: ExchangeCanonicalRequest;
  readonly authenticationFields: readonly ExchangeAuthenticationField[];
}

/**
 * Signature generation input.
 */
export interface ExchangeSignatureInput {
  readonly algorithm: ExchangeSigningAlgorithm;
  readonly payload: string;
  readonly secret?: string;
  readonly privateKey?: string;
  readonly encoding: ExchangeSignatureEncoding;
}

/**
 * Cryptographic signature result.
 */
export interface ExchangeSignatureResult {
  readonly algorithm: ExchangeSigningAlgorithm;
  readonly signature: string;
  readonly encoding: ExchangeSignatureEncoding;
}

/**
 * Cryptographic signature provider.
 *
 * This interface keeps Node crypto, Web Crypto, or external hardware signers
 * outside the connector domain.
 */
export interface ExchangeSignatureProvider {
  sign(input: ExchangeSignatureInput): Promise<ExchangeSignatureResult>;
}

/**
 * Canonicalization configuration.
 */
export interface ExchangeRequestCanonicalizationConfig {
  readonly queryMode: ExchangeCanonicalQueryMode;
  readonly bodyMode: ExchangeCanonicalBodyMode;
  readonly sortHeaders: boolean;
  readonly lowercaseHeaderNames: boolean;
  readonly trimHeaderValues: boolean;
  readonly includeMethod: boolean;
  readonly includePath: boolean;
  readonly includeQuery: boolean;
  readonly includeHeaders: boolean;
  readonly includeBody: boolean;
  readonly includeTimestamp: boolean;
  readonly includeReceiveWindow: boolean;

  /**
   * Separator used between signing payload components.
   */
  readonly componentSeparator: string;

  /**
   * Header names included in canonical headers.
   *
   * An empty list means no headers are included unless the exchange-specific
   * signer overrides the canonicalization behavior.
   */
  readonly signedHeaderNames: readonly string[];
}

/**
 * Exchange-specific request signer configuration.
 */
export interface ExchangeRequestSignerConfig {
  readonly algorithm: ExchangeSigningAlgorithm;
  readonly signatureEncoding: ExchangeSignatureEncoding;
  readonly canonicalization: ExchangeRequestCanonicalizationConfig;

  readonly apiKeyFieldName?: string;
  readonly timestampFieldName?: string;
  readonly signatureFieldName: string;
  readonly passphraseFieldName?: string;
  readonly receiveWindowFieldName?: string;

  readonly apiKeyLocation: ExchangeAuthenticationFieldLocation;
  readonly timestampLocation: ExchangeAuthenticationFieldLocation;
  readonly signatureLocation: ExchangeAuthenticationFieldLocation;
  readonly passphraseLocation?: ExchangeAuthenticationFieldLocation;
  readonly receiveWindowLocation?: ExchangeAuthenticationFieldLocation;

  readonly defaultReceiveWindowMs?: number;
}

/**
 * Signer lifecycle states.
 */
export type ExchangeRequestSignerState =
  | "CREATED"
  | "READY"
  | "FAILED"
  | "DESTROYED";

/**
 * Immutable signer lifecycle snapshot.
 */
export interface ExchangeRequestSignerStateSnapshot {
  readonly state: ExchangeRequestSignerState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Signing error categories.
 */
export type ExchangeRequestSigningErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "CREDENTIALS"
  | "CANONICALIZATION"
  | "CRYPTOGRAPHY"
  | "UNSUPPORTED_ALGORITHM"
  | "DESTROYED"
  | "INTERNAL";

/**
 * Immutable signing error details.
 */
export interface ExchangeRequestSigningErrorDetails {
  readonly category: ExchangeRequestSigningErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly operation?: string;
  readonly algorithm?: ExchangeSigningAlgorithm;
  readonly retryable: boolean;
  readonly occurredAt: number;
  readonly causeName?: string;
  readonly causeMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by request-signing infrastructure.
 */
export class ExchangeRequestSigningError extends Error {
  public readonly details: ExchangeRequestSigningErrorDetails;

  public constructor(details: ExchangeRequestSigningErrorDetails) {
    super(details.message);

    this.name = "ExchangeRequestSigningError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeRequestSigningErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public get requestId(): string | undefined {
    return this.details.requestId;
  }

  public toJSON(): ExchangeRequestSigningErrorDetails {
    return this.details;
  }
}

/**
 * Core exchange request-signer contract.
 */
export interface ExchangeRequestSigner {
  getState(): ExchangeRequestSignerStateSnapshot;

  /**
   * Returns a signed immutable REST request.
   */
  signRestRequest(
    request: ExchangeRestSigningRequest,
  ): Promise<ExchangeSignedRestRequest>;

  /**
   * Returns a signed immutable WebSocket authentication request.
   */
  signWebSocketRequest(
    request: ExchangeWebSocketSigningRequest,
  ): Promise<ExchangeSignedWebSocketRequest>;

  /**
   * Permanently releases sensitive signer resources.
   */
  destroy(): Promise<void>;
}

/**
 * Validates signer configuration.
 */
export function validateExchangeRequestSignerConfig(
  config: ExchangeRequestSignerConfig,
): void {
  if (config.algorithm === "NONE") {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "SIGNING_ALGORITHM_REQUIRED",
      message:
        "Request signer configuration must use a signing algorithm other than NONE.",
      algorithm: config.algorithm,
      retryable: false,
      occurredAt: 0,
    });
  }

  requireNonEmptyString(
    config.signatureFieldName,
    "signatureFieldName",
    0,
  );

  validateOptionalFieldName(
    config.apiKeyFieldName,
    "apiKeyFieldName",
  );

  validateOptionalFieldName(
    config.timestampFieldName,
    "timestampFieldName",
  );

  validateOptionalFieldName(
    config.passphraseFieldName,
    "passphraseFieldName",
  );

  validateOptionalFieldName(
    config.receiveWindowFieldName,
    "receiveWindowFieldName",
  );

  if (
    config.defaultReceiveWindowMs !== undefined &&
    (!Number.isFinite(config.defaultReceiveWindowMs) ||
      config.defaultReceiveWindowMs < 0)
  ) {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "INVALID_DEFAULT_RECEIVE_WINDOW",
      message:
        "Default receive window must be a finite number greater than or equal to zero.",
      algorithm: config.algorithm,
      retryable: false,
      occurredAt: 0,
    });
  }

  validateCanonicalizationConfig(config.canonicalization);
}

/**
 * Validates connector credentials for a signing operation.
 */
export function validateExchangeSigningCredentials(
  credentials: ExchangeConnectorCredentials,
  algorithm: ExchangeSigningAlgorithm,
): void {
  if (
    credentials.authenticationType === "NONE"
  ) {
    throw createCredentialError(
      "AUTHENTICATION_DISABLED",
      "Credentials cannot use NONE authentication for signed requests.",
      algorithm,
    );
  }

  if (!credentials.apiKey?.trim()) {
    throw createCredentialError(
      "API_KEY_REQUIRED",
      "An API key is required for signed exchange requests.",
      algorithm,
    );
  }

  if (isHmacAlgorithm(algorithm) && !credentials.apiSecret?.trim()) {
    throw createCredentialError(
      "API_SECRET_REQUIRED",
      "An API secret is required for HMAC request signing.",
      algorithm,
    );
  }

  if (
    (algorithm === "RSA_SHA256" || algorithm === "ED25519") &&
    !credentials.privateKey?.trim()
  ) {
    throw createCredentialError(
      "PRIVATE_KEY_REQUIRED",
      "A private key is required for asymmetric request signing.",
      algorithm,
    );
  }

  if (
    credentials.authenticationType === "API_KEY_SECRET_PASSPHRASE" &&
    !credentials.passphrase?.trim()
  ) {
    throw createCredentialError(
      "PASSPHRASE_REQUIRED",
      "A passphrase is required for the selected authentication type.",
      algorithm,
    );
  }
}

/**
 * Validates a REST signing request.
 */
export function validateExchangeRestSigningRequest(
  request: ExchangeRestSigningRequest,
): void {
  requireNonEmptyString(
    request.requestId,
    "requestId",
    normalizeTimestamp(request.context?.createdAt),
  );

  requireNonEmptyString(
    request.operation,
    "operation",
    normalizeTimestamp(request.context?.createdAt),
  );

  requireNonEmptyString(
    request.path,
    "path",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateSigningContext(request.context);

  if (!request.path.startsWith("/")) {
    throw createValidationError(
      "INVALID_SIGNING_PATH",
      "REST signing path must begin with '/'.",
      request,
    );
  }

  validateTimestamp(request.timestamp, request);
  validateReceiveWindow(request.receiveWindowMs, request);
}

/**
 * Validates a WebSocket signing request.
 */
export function validateExchangeWebSocketSigningRequest(
  request: ExchangeWebSocketSigningRequest,
): void {
  requireNonEmptyString(
    request.requestId,
    "requestId",
    normalizeTimestamp(request.context?.createdAt),
  );

  requireNonEmptyString(
    request.operation,
    "operation",
    normalizeTimestamp(request.context?.createdAt),
  );

  validateSigningContext(request.context);
  validateTimestamp(request.timestamp, request);
  validateReceiveWindow(request.receiveWindowMs, request);
}

/**
 * Resolves the deterministic timestamp used for signing.
 */
export function resolveExchangeSigningTimestamp(
  suppliedTimestamp: number | undefined,
  clock: ExchangeSigningClock,
): number {
  const timestamp = suppliedTimestamp ?? clock.now();

  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new ExchangeRequestSigningError({
      category: "VALIDATION",
      code: "INVALID_SIGNING_TIMESTAMP",
      message:
        "Signing timestamp must be a finite non-negative number.",
      retryable: false,
      occurredAt: 0,
    });
  }

  return timestamp;
}

/**
 * Produces deterministic canonical headers.
 */
export function canonicalizeExchangeHeaders(
  headers: ExchangeRestHeaders | undefined,
  config: ExchangeRequestCanonicalizationConfig,
): string {
  if (!config.includeHeaders || !headers) {
    return "";
  }

  const signedHeaderNames = new Set(
    config.signedHeaderNames.map((name) =>
      config.lowercaseHeaderNames ? name.toLowerCase() : name,
    ),
  );

  const entries = Object.entries(headers)
    .map(([name, value]) => {
      const canonicalName = config.lowercaseHeaderNames
        ? name.toLowerCase()
        : name;

      return [
        canonicalName,
        config.trimHeaderValues ? value.trim() : value,
      ] as const;
    })
    .filter(([name]) => signedHeaderNames.has(name));

  if (config.sortHeaders) {
    entries.sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }

  return entries
    .map(([name, value]) => `${name}:${value}`)
    .join("\n");
}

/**
 * Produces deterministic canonical query text.
 */
export function canonicalizeExchangeQuery(
  query: ExchangeRestQueryParameters | undefined,
  mode: ExchangeCanonicalQueryMode,
): string {
  if (!query || mode === "NONE") {
    return "";
  }

  const keys = Object.keys(query);

  if (mode === "SORTED") {
    keys.sort();
  }

  const entries: string[] = [];

  for (const key of keys) {
    const value = query[key];

    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
        );
      }

      continue;
    }

    entries.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }

  return entries.join("&");
}

/**
 * Produces canonical body text.
 */
export function canonicalizeExchangeBody(
  body: ExchangeRestRequestBody | undefined,
  mode: ExchangeCanonicalBodyMode,
): string {
  if (
    mode === "EMPTY" ||
    body === undefined ||
    body === null
  ) {
    return "";
  }

  if (mode === "RAW") {
    if (typeof body === "string") {
      return body;
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body).toString("utf8");
    }

    return stableStringify(body);
  }

  if (mode === "FORM_URL_ENCODED") {
    if (!isPlainRecord(body)) {
      throw new ExchangeRequestSigningError({
        category: "CANONICALIZATION",
        code: "FORM_BODY_RECORD_REQUIRED",
        message:
          "Form URL encoded signing requires a plain record body.",
        retryable: false,
        occurredAt: 0,
      });
    }

    return Object.keys(body)
      .sort()
      .map((key) => {
        const value = body[key];

        return `${encodeURIComponent(key)}=${encodeURIComponent(
          String(value ?? ""),
        )}`;
      })
      .join("&");
  }

  return stableStringify(body);
}

/**
 * Builds a canonical signing payload from configured components.
 */
export function buildExchangeSigningPayload(
  request: ExchangeCanonicalRequest,
  config: ExchangeRequestCanonicalizationConfig,
): string {
  const components: string[] = [];

  if (config.includeTimestamp) {
    components.push(String(request.timestamp));
  }

  if (
    config.includeReceiveWindow &&
    request.receiveWindowMs !== undefined
  ) {
    components.push(String(request.receiveWindowMs));
  }

  if (config.includeMethod && request.method) {
    components.push(request.method);
  }

  if (config.includePath && request.path !== undefined) {
    components.push(request.path);
  }

  if (config.includeQuery) {
    components.push(request.canonicalQuery);
  }

  if (config.includeHeaders) {
    components.push(request.canonicalHeaders);
  }

  if (config.includeBody) {
    components.push(request.canonicalBody);
  }

  return components.join(config.componentSeparator);
}

/**
 * Adds authentication fields to REST request components.
 */
export function applyExchangeAuthenticationFields(
  fields: readonly ExchangeAuthenticationField[],
  query: ExchangeRestQueryParameters = {},
  headers: ExchangeRestHeaders = {},
  body?: ExchangeRestRequestBody,
): {
  readonly query: ExchangeRestQueryParameters;
  readonly headers: ExchangeRestHeaders;
  readonly body?: ExchangeRestRequestBody;
} {
  const nextQuery: Record<string, unknown> = { ...query };
  const nextHeaders: Record<string, string> = { ...headers };
  let nextBody = body;

  for (const field of fields) {
    if (field.location === "HEADER") {
      nextHeaders[field.name] = field.value;
      continue;
    }

    if (field.location === "QUERY") {
      nextQuery[field.name] = field.value;
      continue;
    }

    if (nextBody === undefined || nextBody === null) {
      nextBody = Object.freeze({
        [field.name]: field.value,
      });
      continue;
    }

    if (!isPlainRecord(nextBody)) {
      throw new ExchangeRequestSigningError({
        category: "CANONICALIZATION",
        code: "BODY_AUTH_FIELD_REQUIRES_RECORD",
        message:
          "Authentication fields can only be added to a plain record request body.",
        retryable: false,
        occurredAt: 0,
      });
    }

    nextBody = Object.freeze({
      ...nextBody,
      [field.name]: field.value,
    });
  }

  return Object.freeze({
    query: Object.freeze(
      nextQuery as Record<
        string,
        string | number | boolean | readonly (string | number | boolean)[] | undefined
      >,
    ),
    headers: Object.freeze(nextHeaders),
    body: nextBody,
  });
}

/**
 * Runtime type guard for signing errors.
 */
export function isExchangeRequestSigningError(
  value: unknown,
): value is ExchangeRequestSigningError {
  return value instanceof ExchangeRequestSigningError;
}

/**
 * Runtime type guard for signer lifecycle states.
 */
export function isExchangeRequestSignerState(
  value: unknown,
): value is ExchangeRequestSignerState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "FAILED" ||
    value === "DESTROYED"
  );
}

function validateCanonicalizationConfig(
  config: ExchangeRequestCanonicalizationConfig,
): void {
  if (config.componentSeparator.includes("\0")) {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "INVALID_COMPONENT_SEPARATOR",
      message:
        "Canonical component separator must not contain null characters.",
      retryable: false,
      occurredAt: 0,
    });
  }

  const normalizedNames = config.signedHeaderNames.map((name) =>
    config.lowercaseHeaderNames
      ? name.trim().toLowerCase()
      : name.trim(),
  );

  if (normalizedNames.some((name) => name.length === 0)) {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "INVALID_SIGNED_HEADER_NAME",
      message:
        "Signed header names must not contain empty values.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "DUPLICATE_SIGNED_HEADER_NAME",
      message:
        "Signed header names must not contain duplicates.",
      retryable: false,
      occurredAt: 0,
    });
  }
}

function validateSigningContext(
  context: ExchangeConnectorOperationContext | undefined,
): asserts context is ExchangeConnectorOperationContext {
  if (!context) {
    throw new ExchangeRequestSigningError({
      category: "VALIDATION",
      code: "SIGNING_CONTEXT_REQUIRED",
      message:
        "A connector operation context is required for request signing.",
      retryable: false,
      occurredAt: 0,
    });
  }

  requireNonEmptyString(
    context.operationId,
    "context.operationId",
    normalizeTimestamp(context.createdAt),
  );

  if (!Number.isFinite(context.createdAt) || context.createdAt < 0) {
    throw new ExchangeRequestSigningError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_TIMESTAMP",
      message:
        "Context creation timestamp must be finite and non-negative.",
      retryable: false,
      occurredAt: 0,
    });
  }

  if (
    context.deadlineAt !== undefined &&
    (!Number.isFinite(context.deadlineAt) ||
      context.deadlineAt < context.createdAt)
  ) {
    throw new ExchangeRequestSigningError({
      category: "VALIDATION",
      code: "INVALID_CONTEXT_DEADLINE",
      message:
        "Context deadline must be greater than or equal to its creation time.",
      retryable: false,
      occurredAt: context.createdAt,
    });
  }
}

function validateTimestamp(
  timestamp: number | undefined,
  request:
    | ExchangeRestSigningRequest
    | ExchangeWebSocketSigningRequest,
): void {
  if (
    timestamp !== undefined &&
    (!Number.isFinite(timestamp) || timestamp < 0)
  ) {
    throw createValidationError(
      "INVALID_SIGNING_TIMESTAMP",
      "Signing timestamp must be finite and non-negative.",
      request,
    );
  }
}

function validateReceiveWindow(
  receiveWindowMs: number | undefined,
  request:
    | ExchangeRestSigningRequest
    | ExchangeWebSocketSigningRequest,
): void {
  if (
    receiveWindowMs !== undefined &&
    (!Number.isFinite(receiveWindowMs) ||
      receiveWindowMs < 0)
  ) {
    throw createValidationError(
      "INVALID_RECEIVE_WINDOW",
      "Receive window must be finite and non-negative.",
      request,
    );
  }
}

function validateOptionalFieldName(
  value: string | undefined,
  path: string,
): void {
  if (value !== undefined && !value.trim()) {
    throw new ExchangeRequestSigningError({
      category: "CONFIGURATION",
      code: "INVALID_AUTHENTICATION_FIELD_NAME",
      message: `${path} must not be empty when provided.`,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
  occurredAt: number,
): void {
  if (!value.trim()) {
    throw new ExchangeRequestSigningError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt,
    });
  }
}

function createValidationError(
  code: string,
  message: string,
  request:
    | ExchangeRestSigningRequest
    | ExchangeWebSocketSigningRequest,
): ExchangeRequestSigningError {
  return new ExchangeRequestSigningError({
    category: "VALIDATION",
    code,
    message,
    requestId: request.requestId || undefined,
    operation: request.operation || undefined,
    retryable: false,
    occurredAt: normalizeTimestamp(
      request.context?.createdAt,
    ),
  });
}

function createCredentialError(
  code: string,
  message: string,
  algorithm: ExchangeSigningAlgorithm,
): ExchangeRequestSigningError {
  return new ExchangeRequestSigningError({
    category: "CREDENTIALS",
    code,
    message,
    algorithm,
    retryable: false,
    occurredAt: 0,
  });
}

function isHmacAlgorithm(
  algorithm: ExchangeSigningAlgorithm,
): boolean {
  return (
    algorithm === "HMAC_SHA256" ||
    algorithm === "HMAC_SHA384" ||
    algorithm === "HMAC_SHA512"
  );
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

/**
 * Deterministic JSON serialization with recursively sorted object keys.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableSerialization(value));
}

function normalizeForStableSerialization(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ExchangeRequestSigningError({
        category: "CANONICALIZATION",
        code: "NON_FINITE_BODY_NUMBER",
        message:
          "Canonical request bodies cannot contain non-finite numbers.",
        retryable: false,
        occurredAt: 0,
      });
    }

    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeForStableSerialization(item),
    );
  }

  if (isPlainRecord(value)) {
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item = value[key];

      if (item === undefined) {
        continue;
      }

      normalized[key] =
        normalizeForStableSerialization(item);
    }

    return normalized;
  }

  throw new ExchangeRequestSigningError({
    category: "CANONICALIZATION",
    code: "UNSUPPORTED_CANONICAL_VALUE",
    message:
      "Canonical serialization encountered an unsupported value.",
    retryable: false,
    occurredAt: 0,
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

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}