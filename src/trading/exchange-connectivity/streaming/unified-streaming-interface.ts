/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 2:
 * Unified Streaming Interface
 *
 * This module defines the exchange-agnostic contracts used by the live
 * streaming subsystem.
 *
 * Responsibilities:
 * - Normalize exchange-specific streaming concepts
 * - Define immutable subscription requests
 * - Define normalized market-data events
 * - Define stream lifecycle states
 * - Define stream client capabilities
 * - Define deterministic event and result contracts
 * - Provide reusable validation and key-generation utilities
 *
 * This file intentionally contains no exchange-specific implementation.
 */

export type StreamingExchangeId = string;
export type StreamingConnectionId = string;
export type StreamingSubscriptionId = string;
export type StreamingSymbol = string;
export type StreamingChannel = string;

export type UnifiedStreamState =
  | "IDLE"
  | "STARTING"
  | "ACTIVE"
  | "DEGRADED"
  | "RECONNECTING"
  | "STOPPING"
  | "STOPPED"
  | "FAILED"
  | "DISPOSED";

export type UnifiedSubscriptionState =
  | "PENDING"
  | "SUBSCRIBING"
  | "ACTIVE"
  | "UNSUBSCRIBING"
  | "INACTIVE"
  | "FAILED";

export type UnifiedStreamEventType =
  | "TICKER"
  | "TRADE"
  | "ORDER_BOOK_SNAPSHOT"
  | "ORDER_BOOK_UPDATE"
  | "CANDLE"
  | "MARK_PRICE"
  | "INDEX_PRICE"
  | "FUNDING_RATE"
  | "LIQUIDATION"
  | "ACCOUNT"
  | "BALANCE"
  | "POSITION"
  | "ORDER"
  | "EXECUTION"
  | "HEARTBEAT"
  | "SYSTEM"
  | "UNKNOWN";

export type UnifiedMarketSide =
  | "BUY"
  | "SELL"
  | "UNKNOWN";

export type UnifiedStreamScope =
  | "PUBLIC"
  | "PRIVATE";

export type UnifiedSubscriptionOperation =
  | "SUBSCRIBE"
  | "UNSUBSCRIBE";

export type UnifiedSubscriptionResultStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "ALREADY_ACTIVE"
  | "NOT_FOUND"
  | "FAILED";

export type UnifiedStreamHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "UNKNOWN";

export interface UnifiedStreamingClock {
  now(): number;
}

export interface UnifiedStreamingSubscription {
  readonly subscriptionId: StreamingSubscriptionId;
  readonly exchangeId: StreamingExchangeId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly scope: UnifiedStreamScope;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UnifiedStreamingSubscriptionSnapshot {
  readonly subscriptionId: StreamingSubscriptionId;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly scope: UnifiedStreamScope;
  readonly state: UnifiedSubscriptionState;
  readonly createdAt: number;
  readonly lastChangedAt: number;
  readonly activatedAt?: number;
  readonly deactivatedAt?: number;
  readonly failureReason?: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface UnifiedSubscriptionResult {
  readonly operation: UnifiedSubscriptionOperation;
  readonly status: UnifiedSubscriptionResultStatus;
  readonly subscriptionId: StreamingSubscriptionId;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly occurredAt: number;
  readonly reason?: string;
}

export interface UnifiedStreamEventBase {
  readonly eventId: string;
  readonly type: UnifiedStreamEventType;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly channel: StreamingChannel;
  readonly symbol?: StreamingSymbol;
  readonly subscriptionId?: StreamingSubscriptionId;
  readonly exchangeTimestamp?: number;
  readonly receivedAt: number;
  readonly normalizedAt: number;
  readonly sequence?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UnifiedTickerPayload {
  readonly bidPrice?: number;
  readonly bidQuantity?: number;
  readonly askPrice?: number;
  readonly askQuantity?: number;
  readonly lastPrice?: number;
  readonly openPrice24h?: number;
  readonly highPrice24h?: number;
  readonly lowPrice24h?: number;
  readonly volume24h?: number;
  readonly quoteVolume24h?: number;
  readonly priceChange24h?: number;
  readonly priceChangePercent24h?: number;
}

export interface UnifiedTradePayload {
  readonly tradeId?: string;
  readonly price: number;
  readonly quantity: number;
  readonly side: UnifiedMarketSide;
  readonly tradeTimestamp: number;
}

export interface UnifiedOrderBookLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface UnifiedOrderBookPayload {
  readonly bids: readonly UnifiedOrderBookLevel[];
  readonly asks: readonly UnifiedOrderBookLevel[];
  readonly previousSequence?: number;
  readonly checksum?: string;
}

export interface UnifiedCandlePayload {
  readonly interval: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly quoteVolume?: number;
  readonly tradeCount?: number;
  readonly closed: boolean;
}

export interface UnifiedMarkPricePayload {
  readonly markPrice: number;
  readonly indexPrice?: number;
  readonly estimatedSettlementPrice?: number;
  readonly fundingRate?: number;
  readonly nextFundingTime?: number;
}

export interface UnifiedFundingRatePayload {
  readonly fundingRate: number;
  readonly fundingTimestamp?: number;
  readonly nextFundingTime?: number;
}

export interface UnifiedLiquidationPayload {
  readonly side: UnifiedMarketSide;
  readonly price: number;
  readonly quantity: number;
  readonly orderId?: string;
}

export interface UnifiedBalanceEntry {
  readonly asset: string;
  readonly total: number;
  readonly available: number;
  readonly locked?: number;
}

export interface UnifiedBalancePayload {
  readonly balances: readonly UnifiedBalanceEntry[];
}

export interface UnifiedPositionEntry {
  readonly symbol: StreamingSymbol;
  readonly side: UnifiedMarketSide;
  readonly quantity: number;
  readonly entryPrice?: number;
  readonly markPrice?: number;
  readonly liquidationPrice?: number;
  readonly unrealizedPnl?: number;
  readonly realizedPnl?: number;
  readonly leverage?: number;
}

export interface UnifiedPositionPayload {
  readonly positions: readonly UnifiedPositionEntry[];
}

export interface UnifiedOrderPayload {
  readonly orderId: string;
  readonly clientOrderId?: string;
  readonly symbol: StreamingSymbol;
  readonly side: UnifiedMarketSide;
  readonly orderType?: string;
  readonly status: string;
  readonly price?: number;
  readonly quantity: number;
  readonly filledQuantity?: number;
  readonly averagePrice?: number;
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

export interface UnifiedExecutionPayload {
  readonly executionId?: string;
  readonly orderId: string;
  readonly clientOrderId?: string;
  readonly symbol: StreamingSymbol;
  readonly side: UnifiedMarketSide;
  readonly price: number;
  readonly quantity: number;
  readonly fee?: number;
  readonly feeAsset?: string;
  readonly executionTimestamp?: number;
}

export interface UnifiedSystemPayload {
  readonly code: string;
  readonly message: string;
  readonly severity?: "INFO" | "WARNING" | "ERROR";
  readonly retryable?: boolean;
}

export interface UnifiedHeartbeatPayload {
  readonly heartbeatType: "PING" | "PONG" | "APPLICATION";
  readonly sentAt?: number;
  readonly acknowledgedAt?: number;
}

export type UnifiedStreamPayload =
  | UnifiedTickerPayload
  | UnifiedTradePayload
  | UnifiedOrderBookPayload
  | UnifiedCandlePayload
  | UnifiedMarkPricePayload
  | UnifiedFundingRatePayload
  | UnifiedLiquidationPayload
  | UnifiedBalancePayload
  | UnifiedPositionPayload
  | UnifiedOrderPayload
  | UnifiedExecutionPayload
  | UnifiedSystemPayload
  | UnifiedHeartbeatPayload
  | Readonly<Record<string, unknown>>;

export interface UnifiedStreamEvent<
  TPayload extends UnifiedStreamPayload = UnifiedStreamPayload,
> extends UnifiedStreamEventBase {
  readonly payload: TPayload;
}

export interface UnifiedStreamError {
  readonly code: string;
  readonly message: string;
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId?: StreamingConnectionId;
  readonly subscriptionId?: StreamingSubscriptionId;
  readonly occurredAt: number;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UnifiedStreamHealth {
  readonly exchangeId: StreamingExchangeId;
  readonly connectionId: StreamingConnectionId;
  readonly status: UnifiedStreamHealthStatus;
  readonly state: UnifiedStreamState;
  readonly checkedAt: number;
  readonly connectedAt?: number;
  readonly lastMessageAt?: number;
  readonly lastHeartbeatAt?: number;
  readonly reconnectAttempts: number;
  readonly activeSubscriptions: number;
  readonly queuedMessages: number;
  readonly droppedMessages: number;
  readonly averageLatencyMs?: number;
  readonly reason?: string;
}

export interface UnifiedStreamingClientSnapshot {
  readonly exchangeId: StreamingExchangeId;
  readonly state: UnifiedStreamState;
  readonly generatedAt: number;
  readonly connectionIds: readonly StreamingConnectionId[];
  readonly subscriptionCount: number;
  readonly activeSubscriptionCount: number;
  readonly failedSubscriptionCount: number;
  readonly receivedEventCount: number;
  readonly droppedEventCount: number;
  readonly health: readonly UnifiedStreamHealth[];
  readonly subscriptions: readonly UnifiedStreamingSubscriptionSnapshot[];
}

export interface UnifiedStreamingCapabilities {
  readonly supportedEventTypes: readonly UnifiedStreamEventType[];
  readonly supportedChannels: readonly StreamingChannel[];
  readonly supportsPublicStreams: boolean;
  readonly supportsPrivateStreams: boolean;
  readonly supportsMultipleSymbolsPerSubscription: boolean;
  readonly supportsDynamicSubscription: boolean;
  readonly supportsSequenceNumbers: boolean;
  readonly supportsChecksums: boolean;
  readonly supportsApplicationHeartbeat: boolean;
}

export type UnifiedStreamEventListener = (
  event: UnifiedStreamEvent,
) => void | Promise<void>;

export type UnifiedStreamErrorListener = (
  error: UnifiedStreamError,
) => void | Promise<void>;

export type UnifiedStreamStateListener = (
  state: UnifiedStreamState,
  previousState: UnifiedStreamState,
  occurredAt: number,
) => void | Promise<void>;

export interface UnifiedStreamingInterface {
  readonly exchangeId: StreamingExchangeId;
  readonly capabilities: UnifiedStreamingCapabilities;

  getState(): UnifiedStreamState;

  start(): Promise<void>;

  stop(reason?: string): Promise<void>;

  subscribe(
    subscription: UnifiedStreamingSubscription,
  ): Promise<UnifiedSubscriptionResult>;

  unsubscribe(
    subscriptionId: StreamingSubscriptionId,
  ): Promise<UnifiedSubscriptionResult>;

  getSubscription(
    subscriptionId: StreamingSubscriptionId,
  ): UnifiedStreamingSubscriptionSnapshot | undefined;

  getSubscriptions(): readonly UnifiedStreamingSubscriptionSnapshot[];

  getHealth(): readonly UnifiedStreamHealth[];

  getSnapshot(): UnifiedStreamingClientSnapshot;

  onEvent(listener: UnifiedStreamEventListener): () => void;

  onError(listener: UnifiedStreamErrorListener): () => void;

  onStateChange(listener: UnifiedStreamStateListener): () => void;

  dispose(): Promise<void>;
}

export class UnifiedStreamingValidationError extends Error {
  public readonly code: string;
  public readonly field?: string;

  public constructor(
    code: string,
    message: string,
    field?: string,
  ) {
    super(message);

    this.name = "UnifiedStreamingValidationError";
    this.code = code;
    this.field = field;
  }
}

export function createStreamingSubscriptionKey(
  subscription: Pick<
    UnifiedStreamingSubscription,
    "exchangeId" | "scope" | "channel" | "symbol"
  >,
): string {
  validateStreamingExchangeId(subscription.exchangeId);
  validateStreamingScope(subscription.scope);
  validateStreamingChannel(subscription.channel);

  const symbol =
    subscription.symbol === undefined
      ? "*"
      : normalizeStreamingSymbol(subscription.symbol);

  return [
    normalizeIdentifier(subscription.exchangeId),
    subscription.scope,
    normalizeIdentifier(subscription.channel),
    symbol,
  ].join(":");
}

export function validateUnifiedStreamingSubscription(
  subscription: UnifiedStreamingSubscription,
): void {
  if (
    subscription === null ||
    typeof subscription !== "object"
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_SUBSCRIPTION",
      "Unified streaming subscription must be an object.",
    );
  }

  validateStreamingSubscriptionId(subscription.subscriptionId);
  validateStreamingExchangeId(subscription.exchangeId);
  validateStreamingChannel(subscription.channel);
  validateStreamingScope(subscription.scope);

  if (subscription.symbol !== undefined) {
    normalizeStreamingSymbol(subscription.symbol);
  }

  validateOptionalRecord(
    subscription.parameters,
    "subscription.parameters",
  );

  validateOptionalRecord(
    subscription.metadata,
    "subscription.metadata",
  );
}

export function validateUnifiedStreamEvent(
  event: UnifiedStreamEvent,
): void {
  if (event === null || typeof event !== "object") {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_EVENT",
      "Unified stream event must be an object.",
    );
  }

  validateRequiredString(event.eventId, "event.eventId");
  validateUnifiedStreamEventType(event.type);
  validateStreamingExchangeId(event.exchangeId);
  validateStreamingConnectionId(event.connectionId);
  validateStreamingChannel(event.channel);

  if (event.symbol !== undefined) {
    normalizeStreamingSymbol(event.symbol);
  }

  if (event.subscriptionId !== undefined) {
    validateStreamingSubscriptionId(event.subscriptionId);
  }

  validateTimestamp(event.receivedAt, "event.receivedAt");
  validateTimestamp(event.normalizedAt, "event.normalizedAt");

  if (event.normalizedAt < event.receivedAt) {
    throw new UnifiedStreamingValidationError(
      "INVALID_NORMALIZATION_TIMESTAMP",
      "Event normalizedAt cannot be earlier than receivedAt.",
      "event.normalizedAt",
    );
  }

  if (event.exchangeTimestamp !== undefined) {
    validateTimestamp(
      event.exchangeTimestamp,
      "event.exchangeTimestamp",
    );
  }

  if (
    event.sequence !== undefined &&
    (!Number.isSafeInteger(event.sequence) || event.sequence < 0)
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_EVENT_SEQUENCE",
      "Event sequence must be a non-negative safe integer.",
      "event.sequence",
    );
  }

  if (
    event.payload === null ||
    typeof event.payload !== "object"
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_EVENT_PAYLOAD",
      "Unified stream event payload must be an object.",
      "event.payload",
    );
  }

  validateOptionalRecord(event.metadata, "event.metadata");
}

export function validateUnifiedStreamError(
  error: UnifiedStreamError,
): void {
  if (error === null || typeof error !== "object") {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_ERROR",
      "Unified stream error must be an object.",
    );
  }

  validateRequiredString(error.code, "error.code");
  validateRequiredString(error.message, "error.message");
  validateStreamingExchangeId(error.exchangeId);

  if (error.connectionId !== undefined) {
    validateStreamingConnectionId(error.connectionId);
  }

  if (error.subscriptionId !== undefined) {
    validateStreamingSubscriptionId(error.subscriptionId);
  }

  validateTimestamp(error.occurredAt, "error.occurredAt");

  if (typeof error.retryable !== "boolean") {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_ERROR_RETRYABLE",
      "Unified stream error retryable property must be boolean.",
      "error.retryable",
    );
  }

  validateOptionalRecord(error.metadata, "error.metadata");
}

export function freezeUnifiedStreamingSubscription(
  subscription: UnifiedStreamingSubscription,
): UnifiedStreamingSubscription {
  validateUnifiedStreamingSubscription(subscription);

  return Object.freeze({
    subscriptionId: subscription.subscriptionId.trim(),
    exchangeId: normalizeIdentifier(subscription.exchangeId),
    channel: normalizeIdentifier(subscription.channel),
    symbol:
      subscription.symbol === undefined
        ? undefined
        : normalizeStreamingSymbol(subscription.symbol),
    scope: subscription.scope,
    parameters: freezeRecord(subscription.parameters),
    metadata: freezeRecord(subscription.metadata),
  });
}

export function freezeUnifiedStreamEvent<
  TPayload extends UnifiedStreamPayload,
>(
  event: UnifiedStreamEvent<TPayload>,
): UnifiedStreamEvent<TPayload> {
  validateUnifiedStreamEvent(event);

  return Object.freeze({
    ...event,
    eventId: event.eventId.trim(),
    exchangeId: normalizeIdentifier(event.exchangeId),
    connectionId: event.connectionId.trim(),
    channel: normalizeIdentifier(event.channel),
    symbol:
      event.symbol === undefined
        ? undefined
        : normalizeStreamingSymbol(event.symbol),
    subscriptionId: event.subscriptionId?.trim(),
    payload: freezePayload(event.payload),
    metadata: freezeRecord(event.metadata),
  });
}

export function freezeUnifiedStreamError(
  error: UnifiedStreamError,
): UnifiedStreamError {
  validateUnifiedStreamError(error);

  return Object.freeze({
    ...error,
    code: error.code.trim(),
    message: error.message.trim(),
    exchangeId: normalizeIdentifier(error.exchangeId),
    connectionId: error.connectionId?.trim(),
    subscriptionId: error.subscriptionId?.trim(),
    metadata: freezeRecord(error.metadata),
  });
}

export function normalizeStreamingSymbol(
  symbol: StreamingSymbol,
): StreamingSymbol {
  const normalized = validateRequiredString(
    symbol,
    "symbol",
  )
    .toUpperCase()
    .replace(/[\s/_]/g, "-")
    .replace(/-+/g, "-");

  if (
    normalized.startsWith("-") ||
    normalized.endsWith("-")
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAMING_SYMBOL",
      `Streaming symbol "${symbol}" has an invalid separator position.`,
      "symbol",
    );
  }

  return normalized;
}

export function validateStreamingSubscriptionId(
  subscriptionId: StreamingSubscriptionId,
): void {
  validateRequiredString(
    subscriptionId,
    "subscriptionId",
  );
}

export function validateStreamingExchangeId(
  exchangeId: StreamingExchangeId,
): void {
  validateRequiredString(exchangeId, "exchangeId");
}

export function validateStreamingConnectionId(
  connectionId: StreamingConnectionId,
): void {
  validateRequiredString(connectionId, "connectionId");
}

export function validateStreamingChannel(
  channel: StreamingChannel,
): void {
  validateRequiredString(channel, "channel");
}

export function validateStreamingScope(
  scope: UnifiedStreamScope,
): void {
  if (scope !== "PUBLIC" && scope !== "PRIVATE") {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_SCOPE",
      `Unsupported stream scope "${String(scope)}".`,
      "scope",
    );
  }
}

export function validateUnifiedStreamState(
  state: UnifiedStreamState,
): void {
  if (!UNIFIED_STREAM_STATES.includes(state)) {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_STATE",
      `Unsupported unified stream state "${String(state)}".`,
      "state",
    );
  }
}

export function validateUnifiedSubscriptionState(
  state: UnifiedSubscriptionState,
): void {
  if (!UNIFIED_SUBSCRIPTION_STATES.includes(state)) {
    throw new UnifiedStreamingValidationError(
      "INVALID_SUBSCRIPTION_STATE",
      `Unsupported subscription state "${String(state)}".`,
      "state",
    );
  }
}

export function validateUnifiedStreamEventType(
  eventType: UnifiedStreamEventType,
): void {
  if (!UNIFIED_STREAM_EVENT_TYPES.includes(eventType)) {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAM_EVENT_TYPE",
      `Unsupported unified stream event type "${String(
        eventType,
      )}".`,
      "event.type",
    );
  }
}

export function validateUnifiedStreamingCapabilities(
  capabilities: UnifiedStreamingCapabilities,
): void {
  if (
    capabilities === null ||
    typeof capabilities !== "object"
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_STREAMING_CAPABILITIES",
      "Unified streaming capabilities must be an object.",
    );
  }

  if (!Array.isArray(capabilities.supportedEventTypes)) {
    throw new UnifiedStreamingValidationError(
      "INVALID_SUPPORTED_EVENT_TYPES",
      "supportedEventTypes must be an array.",
      "capabilities.supportedEventTypes",
    );
  }

  for (const eventType of capabilities.supportedEventTypes) {
    validateUnifiedStreamEventType(eventType);
  }

  if (!Array.isArray(capabilities.supportedChannels)) {
    throw new UnifiedStreamingValidationError(
      "INVALID_SUPPORTED_CHANNELS",
      "supportedChannels must be an array.",
      "capabilities.supportedChannels",
    );
  }

  for (const channel of capabilities.supportedChannels) {
    validateStreamingChannel(channel);
  }

  validateBooleanCapability(
    capabilities.supportsPublicStreams,
    "supportsPublicStreams",
  );

  validateBooleanCapability(
    capabilities.supportsPrivateStreams,
    "supportsPrivateStreams",
  );

  validateBooleanCapability(
    capabilities.supportsMultipleSymbolsPerSubscription,
    "supportsMultipleSymbolsPerSubscription",
  );

  validateBooleanCapability(
    capabilities.supportsDynamicSubscription,
    "supportsDynamicSubscription",
  );

  validateBooleanCapability(
    capabilities.supportsSequenceNumbers,
    "supportsSequenceNumbers",
  );

  validateBooleanCapability(
    capabilities.supportsChecksums,
    "supportsChecksums",
  );

  validateBooleanCapability(
    capabilities.supportsApplicationHeartbeat,
    "supportsApplicationHeartbeat",
  );
}

export function freezeUnifiedStreamingCapabilities(
  capabilities: UnifiedStreamingCapabilities,
): UnifiedStreamingCapabilities {
  validateUnifiedStreamingCapabilities(capabilities);

  return Object.freeze({
    supportedEventTypes: Object.freeze([
      ...capabilities.supportedEventTypes,
    ]),
    supportedChannels: Object.freeze(
      capabilities.supportedChannels.map((channel) =>
        normalizeIdentifier(channel),
      ),
    ),
    supportsPublicStreams: capabilities.supportsPublicStreams,
    supportsPrivateStreams: capabilities.supportsPrivateStreams,
    supportsMultipleSymbolsPerSubscription:
      capabilities.supportsMultipleSymbolsPerSubscription,
    supportsDynamicSubscription:
      capabilities.supportsDynamicSubscription,
    supportsSequenceNumbers:
      capabilities.supportsSequenceNumbers,
    supportsChecksums: capabilities.supportsChecksums,
    supportsApplicationHeartbeat:
      capabilities.supportsApplicationHeartbeat,
  });
}

const UNIFIED_STREAM_STATES: readonly UnifiedStreamState[] =
  Object.freeze<UnifiedStreamState[]>([
    "IDLE",
    "STARTING",
    "ACTIVE",
    "DEGRADED",
    "RECONNECTING",
    "STOPPING",
    "STOPPED",
    "FAILED",
    "DISPOSED",
  ]);

const UNIFIED_SUBSCRIPTION_STATES: readonly UnifiedSubscriptionState[] =
  Object.freeze<UnifiedSubscriptionState[]>([
    "PENDING",
    "SUBSCRIBING",
    "ACTIVE",
    "UNSUBSCRIBING",
    "INACTIVE",
    "FAILED",
  ]);

const UNIFIED_STREAM_EVENT_TYPES: readonly UnifiedStreamEventType[] =
  Object.freeze<UnifiedStreamEventType[]>([
    "TICKER",
    "TRADE",
    "ORDER_BOOK_SNAPSHOT",
    "ORDER_BOOK_UPDATE",
    "CANDLE",
    "MARK_PRICE",
    "INDEX_PRICE",
    "FUNDING_RATE",
    "LIQUIDATION",
    "ACCOUNT",
    "BALANCE",
    "POSITION",
    "ORDER",
    "EXECUTION",
    "HEARTBEAT",
    "SYSTEM",
    "UNKNOWN",
  ]);

function validateRequiredString(
  value: string,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_REQUIRED_STRING",
      `${field} must be a non-empty string.`,
      field,
    );
  }

  return value.trim();
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
      field,
    );
  }
}

function validateOptionalRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value))
  ) {
    throw new UnifiedStreamingValidationError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
      field,
    );
  }
}

function validateBooleanCapability(
  value: boolean,
  field: string,
): void {
  if (typeof value !== "boolean") {
    throw new UnifiedStreamingValidationError(
      "INVALID_BOOLEAN_CAPABILITY",
      `${field} must be boolean.`,
      `capabilities.${field}`,
    );
  }
}

function normalizeIdentifier(value: string): string {
  return validateRequiredString(value, "identifier")
    .trim()
    .toUpperCase();
}

function freezeRecord(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return Object.freeze({});
  }

  return Object.freeze({
    ...value,
  });
}

function freezePayload<
  TPayload extends UnifiedStreamPayload,
>(
  payload: TPayload,
): TPayload {
  if (Array.isArray(payload)) {
    return Object.freeze([...payload]) as unknown as TPayload;
  }

  return Object.freeze({
    ...payload,
  }) as TPayload;
}