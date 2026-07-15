/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Unified exchange connectivity error normalization.
 *
 * This module converts REST, WebSocket, transport, exchange, and unknown
 * failures into one immutable error model that application services can handle
 * consistently across every exchange connector.
 */

import {
  ExchangeRestError,
  type ExchangeRestErrorCategory,
} from "../rest/exchange-rest-client";

import {
  ExchangeWebSocketError,
  type ExchangeWebSocketErrorCategory,
} from "../websocket/exchange-websocket-client";

/**
 * Unified exchange connectivity error categories.
 */
export type ExchangeConnectivityErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "NETWORK"
  | "CONNECTION"
  | "TIMEOUT"
  | "PROTOCOL"
  | "SERIALIZATION"
  | "DESERIALIZATION"
  | "SUBSCRIPTION"
  | "EXCHANGE"
  | "CANCELLED"
  | "UNAVAILABLE"
  | "INTERNAL"
  | "UNKNOWN";

/**
 * Source subsystem that produced the error.
 */
export type ExchangeConnectivityErrorSource =
  | "REST"
  | "WEBSOCKET"
  | "TRANSPORT"
  | "EXCHANGE"
  | "CONNECTOR"
  | "UNKNOWN";

/**
 * Immutable unified error details.
 */
export interface ExchangeConnectivityErrorDetails {
  readonly category: ExchangeConnectivityErrorCategory;
  readonly source: ExchangeConnectivityErrorSource;
  readonly code: string;
  readonly message: string;

  readonly connectorId?: string;
  readonly requestId?: string;
  readonly connectionId?: string;
  readonly messageId?: string;
  readonly subscriptionId?: string;
  readonly operation?: string;

  readonly statusCode?: number;
  readonly exchangeCode?: string;
  readonly exchangeMessage?: string;
  readonly exchangeRequestId?: string;

  readonly retryable: boolean;
  readonly occurredAt: number;
  readonly attemptCount?: number;
  readonly retryAfterMs?: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by the unified exchange connectivity layer.
 */
export class ExchangeConnectivityError extends Error {
  public readonly details: ExchangeConnectivityErrorDetails;

  public constructor(
    details: ExchangeConnectivityErrorDetails,
  ) {
    super(details.message);

    this.name = "ExchangeConnectivityError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeConnectivityErrorCategory {
    return this.details.category;
  }

  public get source(): ExchangeConnectivityErrorSource {
    return this.details.source;
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

  public toJSON(): ExchangeConnectivityErrorDetails {
    return this.details;
  }
}

/**
 * Options used while normalizing unknown failures.
 */
export interface NormalizeExchangeConnectivityErrorOptions {
  readonly source?: ExchangeConnectivityErrorSource;
  readonly connectorId?: string;
  readonly requestId?: string;
  readonly connectionId?: string;
  readonly messageId?: string;
  readonly subscriptionId?: string;
  readonly operation?: string;
  readonly occurredAt?: number;
  readonly defaultCode?: string;
  readonly defaultMessage?: string;
  readonly defaultRetryable?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Exchange-shaped failure returned by remote APIs.
 */
export interface ExchangeRemoteErrorInput {
  readonly source?: "REST" | "WEBSOCKET" | "EXCHANGE";
  readonly code?: string | number;
  readonly message?: string;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
  readonly retryable?: boolean;
  readonly occurredAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Normalizes any supported error into ExchangeConnectivityError.
 */
export function normalizeExchangeConnectivityError(
  error: unknown,
  options: NormalizeExchangeConnectivityErrorOptions = {},
): ExchangeConnectivityError {
  if (error instanceof ExchangeConnectivityError) {
    return error;
  }

  if (error instanceof ExchangeRestError) {
    return normalizeExchangeRestError(error, options);
  }

  if (error instanceof ExchangeWebSocketError) {
    return normalizeExchangeWebSocketError(error, options);
  }

  if (isExchangeRemoteErrorInput(error)) {
    return normalizeExchangeRemoteError(error, options);
  }

  const occurredAt = resolveOccurredAt(
    options.occurredAt,
  );

  const causeName = getErrorName(error);
  const causeMessage = getErrorMessage(error);

  const inferredCategory =
    inferExchangeConnectivityErrorCategory(
      causeMessage,
    );

  return new ExchangeConnectivityError({
    category: inferredCategory,
    source: options.source ?? "UNKNOWN",
    code:
      options.defaultCode ??
      "UNKNOWN_EXCHANGE_CONNECTIVITY_ERROR",
    message:
      options.defaultMessage ??
      "An unknown exchange connectivity error occurred.",
    connectorId: options.connectorId,
    requestId: options.requestId,
    connectionId: options.connectionId,
    messageId: options.messageId,
    subscriptionId: options.subscriptionId,
    operation: options.operation,
    retryable:
      options.defaultRetryable ??
      isRetryableConnectivityCategory(
        inferredCategory,
      ),
    occurredAt,
    causeName,
    causeMessage,
    metadata: mergeMetadata(
      options.metadata,
      undefined,
    ),
  });
}

/**
 * Normalizes REST errors.
 */
export function normalizeExchangeRestError(
  error: ExchangeRestError,
  options: NormalizeExchangeConnectivityErrorOptions = {},
): ExchangeConnectivityError {
  const details = error.details;

  return new ExchangeConnectivityError({
    category: mapRestCategory(details.category),
    source: "REST",
    code: details.code,
    message: details.message,
    connectorId: options.connectorId,
    requestId:
      details.requestId ?? options.requestId,
    connectionId: options.connectionId,
    messageId: options.messageId,
    subscriptionId: options.subscriptionId,
    operation:
      details.operation ?? options.operation,
    statusCode: details.statusCode,
    exchangeCode: details.exchangeCode,
    exchangeMessage: details.exchangeMessage,
    exchangeRequestId:
      details.exchangeRequestId,
    retryable: details.retryable,
    occurredAt: details.occurredAt,
    attemptCount: details.attemptCount,
    causeName: details.causeName,
    causeMessage: details.causeMessage,
    metadata: mergeMetadata(
      details.metadata,
      options.metadata,
    ),
  });
}

/**
 * Normalizes WebSocket errors.
 */
export function normalizeExchangeWebSocketError(
  error: ExchangeWebSocketError,
  options: NormalizeExchangeConnectivityErrorOptions = {},
): ExchangeConnectivityError {
  const details = error.details;

  return new ExchangeConnectivityError({
    category: mapWebSocketCategory(
      details.category,
    ),
    source: "WEBSOCKET",
    code: details.code,
    message: details.message,
    connectorId: options.connectorId,
    requestId: options.requestId,
    connectionId:
      details.connectionId ??
      options.connectionId,
    messageId:
      details.messageId ?? options.messageId,
    subscriptionId:
      details.subscriptionId ??
      options.subscriptionId,
    operation: options.operation,
    exchangeCode: details.exchangeCode,
    exchangeMessage:
      details.exchangeMessage,
    exchangeRequestId:
      details.exchangeRequestId,
    retryable: details.retryable,
    occurredAt: details.occurredAt,
    causeName: details.causeName,
    causeMessage: details.causeMessage,
    metadata: mergeMetadata(
      details.metadata,
      options.metadata,
    ),
  });
}

/**
 * Normalizes exchange-native response failures.
 */
export function normalizeExchangeRemoteError(
  input: ExchangeRemoteErrorInput,
  options: NormalizeExchangeConnectivityErrorOptions = {},
): ExchangeConnectivityError {
  validateExchangeRemoteErrorInput(input);

  const exchangeCode =
    input.code !== undefined
      ? String(input.code)
      : undefined;

  const category =
    classifyExchangeRemoteError(
      input.statusCode,
      exchangeCode,
      input.message,
    );

  return new ExchangeConnectivityError({
    category,
    source:
      input.source ??
      options.source ??
      "EXCHANGE",
    code:
      exchangeCode ??
      options.defaultCode ??
      "EXCHANGE_REQUEST_FAILED",
    message:
      input.message?.trim() ||
      options.defaultMessage ||
      "The exchange rejected the operation.",
    connectorId: options.connectorId,
    requestId:
      input.requestId ?? options.requestId,
    connectionId: options.connectionId,
    messageId: options.messageId,
    subscriptionId: options.subscriptionId,
    operation: options.operation,
    statusCode: input.statusCode,
    exchangeCode,
    exchangeMessage: input.message,
    retryable:
      input.retryable ??
      isRetryableRemoteFailure(
        input.statusCode,
        category,
      ),
    occurredAt: input.occurredAt,
    retryAfterMs: input.retryAfterMs,
    metadata: mergeMetadata(
      input.metadata,
      options.metadata,
    ),
  });
}

/**
 * Classifies an exchange-native response failure.
 */
export function classifyExchangeRemoteError(
  statusCode?: number,
  exchangeCode?: string,
  message?: string,
): ExchangeConnectivityErrorCategory {
  if (statusCode === 401) {
    return "AUTHENTICATION";
  }

  if (statusCode === 403) {
    return "AUTHORIZATION";
  }

  if (statusCode === 408 || statusCode === 504) {
    return "TIMEOUT";
  }

  if (statusCode === 429) {
    return "RATE_LIMIT";
  }

  if (
    statusCode !== undefined &&
    statusCode >= 500
  ) {
    return "EXCHANGE";
  }

  const searchable = [
    exchangeCode ?? "",
    message ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    searchable.includes("rate limit") ||
    searchable.includes("too many request")
  ) {
    return "RATE_LIMIT";
  }

  if (
    searchable.includes("unauthorized") ||
    searchable.includes("invalid api key") ||
    searchable.includes("invalid signature") ||
    searchable.includes("authentication")
  ) {
    return "AUTHENTICATION";
  }

  if (
    searchable.includes("forbidden") ||
    searchable.includes("permission") ||
    searchable.includes("authorization")
  ) {
    return "AUTHORIZATION";
  }

  if (
    searchable.includes("timeout") ||
    searchable.includes("timed out")
  ) {
    return "TIMEOUT";
  }

  if (
    searchable.includes("network") ||
    searchable.includes("socket") ||
    searchable.includes("connection")
  ) {
    return "NETWORK";
  }

  if (
    searchable.includes("unavailable") ||
    searchable.includes("maintenance")
  ) {
    return "UNAVAILABLE";
  }

  if (
    statusCode !== undefined &&
    statusCode >= 400
  ) {
    return "EXCHANGE";
  }

  return "UNKNOWN";
}

/**
 * Infers a category from an arbitrary failure message.
 */
export function inferExchangeConnectivityErrorCategory(
  message: string,
): ExchangeConnectivityErrorCategory {
  const normalized = message.toLowerCase();

  if (normalized.includes("cancel")) {
    return "CANCELLED";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out")
  ) {
    return "TIMEOUT";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many request")
  ) {
    return "RATE_LIMIT";
  }

  if (
    normalized.includes("authentication") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid api key") ||
    normalized.includes("invalid signature")
  ) {
    return "AUTHENTICATION";
  }

  if (
    normalized.includes("authorization") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission")
  ) {
    return "AUTHORIZATION";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("socket")
  ) {
    return "NETWORK";
  }

  if (normalized.includes("connection")) {
    return "CONNECTION";
  }

  if (
    normalized.includes("protocol") ||
    normalized.includes("parse")
  ) {
    return "PROTOCOL";
  }

  if (
    normalized.includes("serialize") ||
    normalized.includes("serialization")
  ) {
    return "SERIALIZATION";
  }

  if (
    normalized.includes("deserialize") ||
    normalized.includes("deserialization") ||
    normalized.includes("decode")
  ) {
    return "DESERIALIZATION";
  }

  if (
    normalized.includes("unavailable") ||
    normalized.includes("maintenance")
  ) {
    return "UNAVAILABLE";
  }

  return "UNKNOWN";
}

/**
 * Returns whether a normalized category is normally retryable.
 */
export function isRetryableConnectivityCategory(
  category: ExchangeConnectivityErrorCategory,
): boolean {
  return (
    category === "RATE_LIMIT" ||
    category === "NETWORK" ||
    category === "CONNECTION" ||
    category === "TIMEOUT" ||
    category === "EXCHANGE" ||
    category === "UNAVAILABLE" ||
    category === "UNKNOWN"
  );
}

/**
 * Validates remote exchange error input.
 */
export function validateExchangeRemoteErrorInput(
  input: ExchangeRemoteErrorInput,
): void {
  if (
    typeof input !== "object" ||
    input === null
  ) {
    throw createNormalizationValidationError(
      "REMOTE_ERROR_INPUT_REQUIRED",
      "Exchange remote error input is required.",
    );
  }

  if (
    !Number.isFinite(input.occurredAt) ||
    input.occurredAt < 0
  ) {
    throw createNormalizationValidationError(
      "INVALID_REMOTE_ERROR_TIMESTAMP",
      "Remote error timestamp must be finite and non-negative.",
    );
  }

  if (
    input.statusCode !== undefined &&
    (!Number.isInteger(input.statusCode) ||
      input.statusCode < 100 ||
      input.statusCode > 599)
  ) {
    throw createNormalizationValidationError(
      "INVALID_REMOTE_ERROR_STATUS",
      "Remote error HTTP status must be between 100 and 599.",
      input.occurredAt,
    );
  }

  if (
    input.retryAfterMs !== undefined &&
    (!Number.isFinite(input.retryAfterMs) ||
      input.retryAfterMs < 0)
  ) {
    throw createNormalizationValidationError(
      "INVALID_REMOTE_RETRY_AFTER",
      "Remote retry-after duration must be finite and non-negative.",
      input.occurredAt,
    );
  }
}

/**
 * Runtime type guard.
 */
export function isExchangeConnectivityError(
  value: unknown,
): value is ExchangeConnectivityError {
  return value instanceof ExchangeConnectivityError;
}

/**
 * Runtime type guard for remote exchange error shapes.
 */
export function isExchangeRemoteErrorInput(
  value: unknown,
): value is ExchangeRemoteErrorInput {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.occurredAt === "number" &&
    (
      value.code !== undefined ||
      value.message !== undefined ||
      value.statusCode !== undefined
    )
  );
}

function mapRestCategory(
  category: ExchangeRestErrorCategory,
): ExchangeConnectivityErrorCategory {
  return category;
}

function mapWebSocketCategory(
  category: ExchangeWebSocketErrorCategory,
): ExchangeConnectivityErrorCategory {
  switch (category) {
    case "HEARTBEAT":
      return "CONNECTION";

    default:
      return category;
  }
}

function isRetryableRemoteFailure(
  statusCode: number | undefined,
  category: ExchangeConnectivityErrorCategory,
): boolean {
  if (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    (
      statusCode !== undefined &&
      statusCode >= 500
    )
  ) {
    return true;
  }

  return isRetryableConnectivityCategory(category);
}

function resolveOccurredAt(
  value: number | undefined,
): number {
  return value !== undefined &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : 0;
}

function mergeMetadata(
  primary?: Readonly<Record<string, unknown>>,
  secondary?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  if (!primary && !secondary) {
    return undefined;
  }

  return Object.freeze({
    ...(secondary ?? {}),
    ...(primary ?? {}),
  });
}

function createNormalizationValidationError(
  code: string,
  message: string,
  occurredAt = 0,
): ExchangeConnectivityError {
  return new ExchangeConnectivityError({
    category: "VALIDATION",
    source: "UNKNOWN",
    code,
    message,
    retryable: false,
    occurredAt,
  });
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

  return "Unknown exchange connectivity failure.";
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