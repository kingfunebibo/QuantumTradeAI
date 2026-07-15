/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic mock WebSocket codec and authenticator.
 *
 * These test doubles provide:
 * - deterministic JSON encoding and decoding;
 * - deterministic subscription and unsubscription messages;
 * - deterministic authentication success or failure;
 * - immutable execution history;
 * - configurable clock advancement;
 * - no network or random behavior.
 */

import {
  ExchangeWebSocketError,
  type BaseExchangeWebSocketAuthenticator,
  type BaseExchangeWebSocketClock,
  type BaseExchangeWebSocketMessageCodec,
  type ExchangeConnectorOperationContext,
  type ExchangeWebSocketMessage,
  type ExchangeWebSocketSendRequest,
  type ExchangeWebSocketSubscriptionRequest,
  type ExchangeWebSocketSubscriptionSnapshot,
} from "../index";

/**
 * Immutable mock codec configuration.
 */
export interface DeterministicMockWebSocketCodecConfig {
  /**
   * Deterministic delay applied during encode().
   */
  readonly encodeDelayMs?: number;

  /**
   * Deterministic delay applied during decode().
   */
  readonly decodeDelayMs?: number;

  /**
   * Optional error thrown during encode().
   */
  readonly encodeFailure?: Error;

  /**
   * Optional error thrown during decode().
   */
  readonly decodeFailure?: Error;

  /**
   * Prefix used for generated subscription message IDs.
   */
  readonly subscriptionMessageIdPrefix?: string;

  /**
   * Prefix used for generated unsubscription message IDs.
   */
  readonly unsubscriptionMessageIdPrefix?: string;
}

/**
 * Immutable codec history entry.
 */
export interface DeterministicMockWebSocketCodecHistoryEntry {
  readonly sequence: number;
  readonly operation:
    | "ENCODE"
    | "DECODE"
    | "CREATE_SUBSCRIPTION"
    | "CREATE_UNSUBSCRIPTION";
  readonly occurredAt: number;
  readonly messageId?: string;
  readonly connectionId?: string;
  readonly subscriptionId?: string;
}

/**
 * Deterministic JSON WebSocket codec.
 */
export class DeterministicMockWebSocketCodec
  implements BaseExchangeWebSocketMessageCodec
{
  private sequence = 0;

  private readonly history:
    DeterministicMockWebSocketCodecHistoryEntry[] = [];

  public constructor(
    private readonly clock: BaseExchangeWebSocketClock,
    private readonly config: DeterministicMockWebSocketCodecConfig = {},
  ) {
    validateClock(clock);
    validateCodecConfig(config);
  }

  public getHistory():
    readonly DeterministicMockWebSocketCodecHistoryEntry[] {
    return Object.freeze([...this.history]);
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public encode(
    request: ExchangeWebSocketSendRequest,
  ): string | Uint8Array {
    validateSendRequest(request);

    advanceClock(
      this.clock,
      this.config.encodeDelayMs ?? 0,
    );

    if (this.config.encodeFailure) {
      throw this.config.encodeFailure;
    }

    this.recordHistory({
      operation: "ENCODE",
      occurredAt: this.clock.now(),
      messageId: request.messageId,
    });

    return JSON.stringify({
      messageId: request.messageId,
      type: request.type,
      encoding: request.encoding,
      payload: request.payload,
      channel: request.channel,
      symbol: request.symbol,
      sentAt: this.clock.now(),
    });
  }

  public decode(
    connectionId: string,
    payload: string | Uint8Array,
    receivedAt: number,
  ): ExchangeWebSocketMessage {
    requireNonEmptyString(
      connectionId,
      "connectionId",
    );

    validateTimestamp(
      receivedAt,
      "receivedAt",
    );

    advanceClock(
      this.clock,
      this.config.decodeDelayMs ?? 0,
    );

    if (this.config.decodeFailure) {
      throw this.config.decodeFailure;
    }

    const text =
      typeof payload === "string"
        ? payload
        : Buffer.from(payload).toString("utf8");

    let decoded: unknown;

    try {
      decoded = JSON.parse(text);
    } catch (error: unknown) {
      throw createCodecError(
        "MOCK_WEBSOCKET_DECODE_FAILED",
        "Mock WebSocket codec failed to decode JSON payload.",
        false,
        receivedAt,
        error,
      );
    }

    if (!isPlainRecord(decoded)) {
      throw createCodecError(
        "MOCK_WEBSOCKET_DECODED_MESSAGE_INVALID",
        "Decoded WebSocket payload must be an object.",
        false,
        receivedAt,
      );
    }

    const messageId =
      typeof decoded.messageId === "string" &&
      decoded.messageId.trim()
        ? decoded.messageId
        : `mock-inbound-${this.sequence + 1}`;

    const type =
      isMessageType(decoded.type)
        ? decoded.type
        : "DATA";

    const encoding =
      decoded.encoding === "TEXT" ||
      decoded.encoding === "BINARY" ||
      decoded.encoding === "JSON"
        ? decoded.encoding
        : "JSON";

    const message = Object.freeze({
      messageId,
      connectionId,
      direction: "INBOUND" as const,
      type,
      encoding,
      timestamp: receivedAt,
      payload:
        decoded.payload === undefined
          ? (Object.freeze({}) as ExchangeWebSocketMessage["payload"])
          : (decoded.payload as ExchangeWebSocketMessage["payload"]),
      channel:
        typeof decoded.channel === "string"
          ? decoded.channel
          : undefined,
      symbol:
        typeof decoded.symbol === "string"
          ? decoded.symbol
          : undefined,
    });

    this.recordHistory({
      operation: "DECODE",
      occurredAt: this.clock.now(),
      messageId,
      connectionId,
    });

    return message;
  }

  public createSubscriptionMessage(
    request: ExchangeWebSocketSubscriptionRequest,
  ): ExchangeWebSocketSendRequest {
    validateSubscriptionRequest(request);

    const messageId =
      `${this.config.subscriptionMessageIdPrefix ?? "subscribe"}-` +
      request.subscriptionId;

    this.recordHistory({
      operation: "CREATE_SUBSCRIPTION",
      occurredAt: this.clock.now(),
      messageId,
      subscriptionId: request.subscriptionId,
    });

    return Object.freeze({
      messageId,
      type: "SUBSCRIBE",
      encoding: "JSON",
      payload: Object.freeze({
        operation: "subscribe",
        channel: request.channel,
        symbols: Object.freeze([
          ...(request.symbols ?? []),
        ]),
        authenticated: request.authenticated,
      }),
      channel: request.channel,
      context: request.context,
    });
  }

  public createUnsubscriptionMessage(
    subscription: ExchangeWebSocketSubscriptionSnapshot,
    context: ExchangeConnectorOperationContext,
  ): ExchangeWebSocketSendRequest {
    validateSubscriptionSnapshot(subscription);
    validateOperationContext(context);

    const messageId =
      `${this.config.unsubscriptionMessageIdPrefix ?? "unsubscribe"}-` +
      subscription.subscriptionId;

    this.recordHistory({
      operation: "CREATE_UNSUBSCRIPTION",
      occurredAt: this.clock.now(),
      messageId,
      subscriptionId:
        subscription.subscriptionId,
    });

    return Object.freeze({
      messageId,
      type: "UNSUBSCRIBE",
      encoding: "JSON",
      payload: Object.freeze({
        operation: "unsubscribe",
        channel: subscription.channel,
        symbols: Object.freeze([
          ...subscription.symbols,
        ]),
      }),
      channel: subscription.channel,
      context,
    });
  }

  private recordHistory(input: {
    readonly operation:
      DeterministicMockWebSocketCodecHistoryEntry["operation"];
    readonly occurredAt: number;
    readonly messageId?: string;
    readonly connectionId?: string;
    readonly subscriptionId?: string;
  }): void {
    this.sequence += 1;

    this.history.push(
      Object.freeze({
        sequence: this.sequence,
        ...input,
      }),
    );
  }
}

/**
 * Immutable mock authenticator configuration.
 */
export interface DeterministicMockWebSocketAuthenticatorConfig {
  /**
   * Deterministic delay applied during authenticate().
   */
  readonly delayMs?: number;

  /**
   * Optional failure thrown during authentication.
   */
  readonly failure?: Error;
}

/**
 * Immutable authentication history entry.
 */
export interface DeterministicMockWebSocketAuthenticationHistoryEntry {
  readonly sequence: number;
  readonly connectionId: string;
  readonly operationId: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly outcome: "AUTHENTICATED" | "FAILED";
  readonly errorName?: string;
  readonly errorMessage?: string;
}

/**
 * Deterministic WebSocket authenticator.
 */
export class DeterministicMockWebSocketAuthenticator
  implements BaseExchangeWebSocketAuthenticator
{
  private sequence = 0;

  private readonly history:
    DeterministicMockWebSocketAuthenticationHistoryEntry[] = [];

  public constructor(
    private readonly clock: BaseExchangeWebSocketClock,
    private readonly config:
      DeterministicMockWebSocketAuthenticatorConfig = {},
  ) {
    validateClock(clock);
    validateAuthenticatorConfig(config);
  }

  public getHistory():
    readonly DeterministicMockWebSocketAuthenticationHistoryEntry[] {
    return Object.freeze([...this.history]);
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public async authenticate(
    connectionId: string,
    context: ExchangeConnectorOperationContext,
  ): Promise<void> {
    requireNonEmptyString(
      connectionId,
      "connectionId",
    );

    validateOperationContext(context);

    const startedAt = this.clock.now();

    advanceClock(
      this.clock,
      this.config.delayMs ?? 0,
    );

    const completedAt = this.clock.now();

    this.sequence += 1;

    if (this.config.failure) {
      this.history.push(
        Object.freeze({
          sequence: this.sequence,
          connectionId,
          operationId: context.operationId,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          outcome: "FAILED",
          errorName: this.config.failure.name,
          errorMessage:
            this.config.failure.message,
        }),
      );

      throw this.config.failure;
    }

    this.history.push(
      Object.freeze({
        sequence: this.sequence,
        connectionId,
        operationId: context.operationId,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        outcome: "AUTHENTICATED",
      }),
    );
  }
}

/**
 * Runtime type guard for the deterministic codec.
 */
export function isDeterministicMockWebSocketCodec(
  value: unknown,
): value is DeterministicMockWebSocketCodec {
  return value instanceof DeterministicMockWebSocketCodec;
}

/**
 * Runtime type guard for the deterministic authenticator.
 */
export function isDeterministicMockWebSocketAuthenticator(
  value: unknown,
): value is DeterministicMockWebSocketAuthenticator {
  return (
    value instanceof
    DeterministicMockWebSocketAuthenticator
  );
}

/**
 * Validates mock codec configuration.
 */
export function validateDeterministicMockWebSocketCodecConfig(
  config: DeterministicMockWebSocketCodecConfig,
): void {
  validateCodecConfig(config);
}

/**
 * Validates mock authenticator configuration.
 */
export function validateDeterministicMockWebSocketAuthenticatorConfig(
  config: DeterministicMockWebSocketAuthenticatorConfig,
): void {
  validateAuthenticatorConfig(config);
}

function validateCodecConfig(
  config: DeterministicMockWebSocketCodecConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_CODEC_CONFIG_REQUIRED",
      "Mock WebSocket codec configuration is required.",
      false,
      0,
    );
  }

  validateOptionalDelay(
    config.encodeDelayMs,
    "encodeDelayMs",
  );

  validateOptionalDelay(
    config.decodeDelayMs,
    "decodeDelayMs",
  );

  validateOptionalError(
    config.encodeFailure,
    "encodeFailure",
  );

  validateOptionalError(
    config.decodeFailure,
    "decodeFailure",
  );

  validateOptionalNonEmptyString(
    config.subscriptionMessageIdPrefix,
    "subscriptionMessageIdPrefix",
  );

  validateOptionalNonEmptyString(
    config.unsubscriptionMessageIdPrefix,
    "unsubscriptionMessageIdPrefix",
  );
}

function validateAuthenticatorConfig(
  config:
    DeterministicMockWebSocketAuthenticatorConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_AUTH_CONFIG_REQUIRED",
      "Mock WebSocket authenticator configuration is required.",
      false,
      0,
    );
  }

  validateOptionalDelay(
    config.delayMs,
    "delayMs",
  );

  validateOptionalError(
    config.failure,
    "failure",
  );
}

function validateClock(
  clock: BaseExchangeWebSocketClock,
): void {
  if (
    typeof clock !== "object" ||
    clock === null ||
    typeof clock.now !== "function"
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_CLOCK_REQUIRED",
      "Mock WebSocket codec and authenticator require a valid clock.",
      false,
      0,
    );
  }
}

function validateSendRequest(
  request: ExchangeWebSocketSendRequest,
): void {
  if (
    typeof request !== "object" ||
    request === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_SEND_REQUEST_REQUIRED",
      "Mock WebSocket send request is required.",
      false,
      0,
    );
  }

  requireNonEmptyString(
    request.messageId,
    "messageId",
  );

  validateOperationContext(request.context);
}

function validateSubscriptionRequest(
  request: ExchangeWebSocketSubscriptionRequest,
): void {
  if (
    typeof request !== "object" ||
    request === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_SUBSCRIPTION_REQUIRED",
      "Mock WebSocket subscription request is required.",
      false,
      0,
    );
  }

  requireNonEmptyString(
    request.subscriptionId,
    "subscriptionId",
  );

  requireNonEmptyString(
    request.channel,
    "channel",
  );

  validateOperationContext(request.context);
}

function validateSubscriptionSnapshot(
  subscription: ExchangeWebSocketSubscriptionSnapshot,
): void {
  if (
    typeof subscription !== "object" ||
    subscription === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_SUBSCRIPTION_SNAPSHOT_REQUIRED",
      "Mock WebSocket subscription snapshot is required.",
      false,
      0,
    );
  }

  requireNonEmptyString(
    subscription.subscriptionId,
    "subscription.subscriptionId",
  );

  requireNonEmptyString(
    subscription.channel,
    "subscription.channel",
  );
}

function validateOperationContext(
  context: ExchangeConnectorOperationContext,
): void {
  if (
    typeof context !== "object" ||
    context === null
  ) {
    throw createCodecError(
      "MOCK_WEBSOCKET_CONTEXT_REQUIRED",
      "Mock WebSocket operation context is required.",
      false,
      0,
    );
  }

  requireNonEmptyString(
    context.operationId,
    "context.operationId",
  );

  validateTimestamp(
    context.createdAt,
    "context.createdAt",
  );

  if (
    context.deadlineAt !== undefined &&
    context.deadlineAt < context.createdAt
  ) {
    throw createCodecError(
      "INVALID_MOCK_WEBSOCKET_CONTEXT_DEADLINE",
      "Mock WebSocket context deadline must not precede its creation time.",
      false,
      context.createdAt,
    );
  }
}

function validateOptionalDelay(
  value: number | undefined,
  path: string,
): void {
  if (
    value !== undefined &&
    (
      !Number.isFinite(value) ||
      value < 0
    )
  ) {
    throw createCodecError(
      "INVALID_MOCK_WEBSOCKET_DELAY",
      `${path} must be finite and non-negative.`,
      false,
      0,
    );
  }
}

function validateOptionalError(
  value: Error | undefined,
  path: string,
): void {
  if (
    value !== undefined &&
    !(value instanceof Error)
  ) {
    throw createCodecError(
      "INVALID_MOCK_WEBSOCKET_ERROR",
      `${path} must be an Error instance.`,
      false,
      0,
    );
  }
}

function validateOptionalNonEmptyString(
  value: string | undefined,
  path: string,
): void {
  if (
    value !== undefined &&
    !value.trim()
  ) {
    throw createCodecError(
      "INVALID_MOCK_WEBSOCKET_STRING",
      `${path} must not be empty when provided.`,
      false,
      0,
    );
  }
}

function validateTimestamp(
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw createCodecError(
      "INVALID_MOCK_WEBSOCKET_TIMESTAMP",
      `${path} must be finite and non-negative.`,
      false,
      0,
    );
  }
}

function requireNonEmptyString(
  value: string,
  path: string,
): void {
  if (!value.trim()) {
    throw createCodecError(
      "REQUIRED_MOCK_WEBSOCKET_VALUE_MISSING",
      `${path} must not be empty.`,
      false,
      0,
    );
  }
}

function advanceClock(
  clock: BaseExchangeWebSocketClock,
  delayMs: number,
): void {
  if (delayMs === 0) {
    return;
  }

  const mutableClock =
    clock as BaseExchangeWebSocketClock & {
      advance?: (milliseconds: number) => void;
    };

  if (typeof mutableClock.advance !== "function") {
    throw createCodecError(
      "MOCK_WEBSOCKET_CLOCK_NOT_ADVANCEABLE",
      "Mock WebSocket delays require a clock with an advance(milliseconds) method.",
      false,
      clock.now(),
    );
  }

  mutableClock.advance(delayMs);
}

function isMessageType(
  value: unknown,
): value is ExchangeWebSocketMessage["type"] {
  return (
    value === "DATA" ||
    value === "SUBSCRIBE" ||
    value === "UNSUBSCRIBE" ||
    value === "SUBSCRIPTION_ACK" ||
    value === "UNSUBSCRIPTION_ACK" ||
    value === "AUTHENTICATE" ||
    value === "AUTHENTICATION_ACK" ||
    value === "PING" ||
    value === "PONG" ||
    value === "ERROR" ||
    value === "SYSTEM"
  );
}

function createCodecError(
  code: string,
  message: string,
  retryable: boolean,
  occurredAt: number,
  cause?: unknown,
): ExchangeWebSocketError {
  return new ExchangeWebSocketError({
    category: "INTERNAL",
    code,
    message,
    retryable,
    occurredAt,
    causeName:
      cause instanceof Error
        ? cause.name
        : undefined,
    causeMessage:
      cause instanceof Error
        ? cause.message
        : undefined,
  });
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}