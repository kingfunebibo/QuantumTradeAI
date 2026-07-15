/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic mock WebSocket transport.
 *
 * This transport is designed for deterministic unit and integration tests. It
 * supports:
 * - scripted connection, send, close, and destroy failures;
 * - deterministic clock advancement;
 * - immutable outbound message history;
 * - manual inbound message, error, and close emission;
 * - buffered amount control;
 * - transport lifecycle validation;
 * - stable callback execution.
 */

import {
  ExchangeWebSocketError,
  type BaseExchangeWebSocketClock,
  type BaseExchangeWebSocketTransport,
  type BaseExchangeWebSocketTransportCallbacks,
  type BaseExchangeWebSocketTransportCloseRequest,
  type BaseExchangeWebSocketTransportSendRequest,
  type BaseExchangeWebSocketTransportSendResult,
  type BaseExchangeWebSocketTransportState,
  type ExchangeWebSocketEndpointConfig,
} from "../index";

/**
 * Immutable mock WebSocket transport configuration.
 */
export interface DeterministicMockWebSocketTransportConfig {
  /**
   * Deterministic delay applied during connect().
   */
  readonly connectDelayMs?: number;

  /**
   * Deterministic delay applied during send().
   */
  readonly sendDelayMs?: number;

  /**
   * Deterministic delay applied during close().
   */
  readonly closeDelayMs?: number;

  /**
   * Deterministic delay applied during destroy().
   */
  readonly destroyDelayMs?: number;

  /**
   * Optional failure thrown during connect().
   */
  readonly connectFailure?: Error;

  /**
   * Optional failure thrown during send().
   */
  readonly sendFailure?: Error;

  /**
   * Optional failure thrown during close().
   */
  readonly closeFailure?: Error;

  /**
   * Optional failure thrown during destroy().
   */
  readonly destroyFailure?: Error;

  /**
   * Whether connect() should invoke the registered onOpen callback.
   */
  readonly emitOpenOnConnect?: boolean;

  /**
   * Accepted value returned by send().
   */
  readonly sendAccepted?: boolean;

  /**
   * Initial buffered amount.
   */
  readonly initialBufferedAmount?: number;

  /**
   * Buffered amount returned after each send().
   */
  readonly bufferedAmountAfterSend?: number;
}

/**
 * Immutable outbound message history entry.
 */
export interface DeterministicMockWebSocketSendHistoryEntry {
  readonly sequence: number;
  readonly request: BaseExchangeWebSocketTransportSendRequest;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly accepted: boolean;
  readonly bufferedAmount: number;
}

/**
 * Immutable connection history entry.
 */
export interface DeterministicMockWebSocketConnectionHistoryEntry {
  readonly sequence: number;
  readonly endpoint: ExchangeWebSocketEndpointConfig;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly outcome: "OPENED" | "FAILED";
  readonly errorName?: string;
  readonly errorMessage?: string;
}

/**
 * Immutable close history entry.
 */
export interface DeterministicMockWebSocketCloseHistoryEntry {
  readonly sequence: number;
  readonly request: BaseExchangeWebSocketTransportCloseRequest;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly outcome: "CLOSED" | "FAILED";
  readonly errorName?: string;
  readonly errorMessage?: string;
}

/**
 * Deterministic mock WebSocket transport.
 */
export class DeterministicMockWebSocketTransport
  implements BaseExchangeWebSocketTransport
{
  private state: BaseExchangeWebSocketTransportState =
    "CREATED";

  private callbacks?: BaseExchangeWebSocketTransportCallbacks;
  private endpoint?: ExchangeWebSocketEndpointConfig;

  private bufferedAmount: number;

  private connectionSequence = 0;
  private sendSequence = 0;
  private closeSequence = 0;

  private readonly connectionHistory:
    DeterministicMockWebSocketConnectionHistoryEntry[] = [];

  private readonly sendHistory:
    DeterministicMockWebSocketSendHistoryEntry[] = [];

  private readonly closeHistory:
    DeterministicMockWebSocketCloseHistoryEntry[] = [];

  private connectCalls = 0;
  private sendCalls = 0;
  private closeCalls = 0;
  private destroyCalls = 0;

  public constructor(
    private readonly clock: BaseExchangeWebSocketClock,
    private readonly config: DeterministicMockWebSocketTransportConfig = {},
  ) {
    validateClock(clock);
    validateConfig(config);

    this.bufferedAmount =
      config.initialBufferedAmount ?? 0;
  }

  public getState(): BaseExchangeWebSocketTransportState {
    return this.state;
  }

  public getBufferedAmount(): number {
    return this.bufferedAmount;
  }

  public setBufferedAmount(value: number): void {
    validateNonNegativeNumber(
      value,
      "bufferedAmount",
    );

    this.bufferedAmount = value;
  }

  public getEndpoint():
    | ExchangeWebSocketEndpointConfig
    | undefined {
    return this.endpoint;
  }

  public getConnectCallCount(): number {
    return this.connectCalls;
  }

  public getSendCallCount(): number {
    return this.sendCalls;
  }

  public getCloseCallCount(): number {
    return this.closeCalls;
  }

  public getDestroyCallCount(): number {
    return this.destroyCalls;
  }

  public getConnectionHistory():
    readonly DeterministicMockWebSocketConnectionHistoryEntry[] {
    return Object.freeze([
      ...this.connectionHistory,
    ]);
  }

  public getSendHistory():
    readonly DeterministicMockWebSocketSendHistoryEntry[] {
    return Object.freeze([...this.sendHistory]);
  }

  public getCloseHistory():
    readonly DeterministicMockWebSocketCloseHistoryEntry[] {
    return Object.freeze([...this.closeHistory]);
  }

  public clearHistory(): void {
    this.connectionHistory.length = 0;
    this.sendHistory.length = 0;
    this.closeHistory.length = 0;
  }

  public async connect(
    endpoint: ExchangeWebSocketEndpointConfig,
    callbacks: BaseExchangeWebSocketTransportCallbacks,
  ): Promise<void> {
    validateEndpoint(endpoint);
    validateCallbacks(callbacks);

    if (
      this.state === "CONNECTING" ||
      this.state === "OPEN"
    ) {
      throw createMockWebSocketError(
        "MOCK_WEBSOCKET_ALREADY_CONNECTED",
        "Mock WebSocket transport is already connecting or open.",
        false,
        this.clock.now(),
      );
    }

    this.connectCalls += 1;
    this.connectionSequence += 1;

    const sequence = this.connectionSequence;
    const startedAt = this.clock.now();

    this.state = "CONNECTING";
    this.endpoint = freezeEndpoint(endpoint);
    this.callbacks = callbacks;

    advanceClock(
      this.clock,
      this.config.connectDelayMs ?? 0,
    );

    const completedAt = this.clock.now();

    if (this.config.connectFailure) {
      this.state = "FAILED";

      this.connectionHistory.push(
        Object.freeze({
          sequence,
          endpoint: this.endpoint,
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          outcome: "FAILED",
          errorName:
            this.config.connectFailure.name,
          errorMessage:
            this.config.connectFailure.message,
        }),
      );

      throw this.config.connectFailure;
    }

    this.state = "OPEN";

    this.connectionHistory.push(
      Object.freeze({
        sequence,
        endpoint: this.endpoint,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        outcome: "OPENED",
      }),
    );

    if (this.config.emitOpenOnConnect !== false) {
      await callbacks.onOpen();
    }
  }

  public async send(
    request: BaseExchangeWebSocketTransportSendRequest,
  ): Promise<BaseExchangeWebSocketTransportSendResult> {
    validateSendRequest(request);

    if (this.state !== "OPEN") {
      throw createMockWebSocketError(
        "MOCK_WEBSOCKET_NOT_OPEN",
        `Mock WebSocket transport cannot send while in ${this.state} state.`,
        this.state === "CONNECTING" ||
          this.state === "FAILED",
        this.clock.now(),
        request.connectionId,
        request.messageId,
      );
    }

    this.sendCalls += 1;
    this.sendSequence += 1;

    const sequence = this.sendSequence;
    const startedAt = this.clock.now();

    advanceClock(
      this.clock,
      this.config.sendDelayMs ?? 0,
    );

    const completedAt = this.clock.now();

    if (this.config.sendFailure) {
      throw this.config.sendFailure;
    }

    const accepted =
      this.config.sendAccepted ?? true;

    if (
      this.config.bufferedAmountAfterSend !==
      undefined
    ) {
      this.bufferedAmount =
        this.config.bufferedAmountAfterSend;
    }

    const result = Object.freeze({
      accepted,
      bufferedAmount: this.bufferedAmount,
    });

    this.sendHistory.push(
      Object.freeze({
        sequence,
        request: freezeSendRequest(request),
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        accepted,
        bufferedAmount: this.bufferedAmount,
      }),
    );

    return result;
  }

  public async close(
    request: BaseExchangeWebSocketTransportCloseRequest,
  ): Promise<void> {
    validateCloseRequest(request);

    if (this.state === "CLOSED") {
      return;
    }

    this.closeCalls += 1;
    this.closeSequence += 1;

    const sequence = this.closeSequence;
    const startedAt = this.clock.now();

    this.state = "CLOSING";

    advanceClock(
      this.clock,
      this.config.closeDelayMs ?? 0,
    );

    const completedAt = this.clock.now();

    if (this.config.closeFailure) {
      this.state = "FAILED";

      this.closeHistory.push(
        Object.freeze({
          sequence,
          request: Object.freeze({ ...request }),
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          outcome: "FAILED",
          errorName:
            this.config.closeFailure.name,
          errorMessage:
            this.config.closeFailure.message,
        }),
      );

      throw this.config.closeFailure;
    }

    this.state = "CLOSED";
    this.bufferedAmount = 0;

    this.closeHistory.push(
      Object.freeze({
        sequence,
        request: Object.freeze({ ...request }),
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        outcome: "CLOSED",
      }),
    );
  }

  public async destroy(): Promise<void> {
    if (this.state === "CLOSED") {
      this.destroyCalls += 1;
      this.callbacks = undefined;
      this.endpoint = undefined;
      this.bufferedAmount = 0;
      return;
    }

    this.destroyCalls += 1;

    advanceClock(
      this.clock,
      this.config.destroyDelayMs ?? 0,
    );

    if (this.config.destroyFailure) {
      this.state = "FAILED";
      throw this.config.destroyFailure;
    }

    this.state = "CLOSED";
    this.callbacks = undefined;
    this.endpoint = undefined;
    this.bufferedAmount = 0;
  }

  /**
   * Manually emits an inbound transport message.
   */
  public async emitMessage(
    payload: string | Uint8Array,
  ): Promise<void> {
    const callbacks = this.requireCallbacks();

    if (this.state !== "OPEN") {
      throw createMockWebSocketError(
        "MOCK_WEBSOCKET_NOT_OPEN",
        "Inbound messages may only be emitted while the transport is open.",
        false,
        this.clock.now(),
      );
    }

    await callbacks.onMessage(clonePayload(payload));
  }

  /**
   * Manually emits a transport error.
   */
  public async emitError(error: unknown): Promise<void> {
    const callbacks = this.requireCallbacks();
    await callbacks.onError(error);
  }

  /**
   * Manually emits a remote close event.
   */
  public async emitClose(
    code?: number,
    reason?: string,
  ): Promise<void> {
    validateOptionalCloseCode(code);

    if (
      reason !== undefined &&
      !reason.trim()
    ) {
      throw createMockWebSocketError(
        "INVALID_MOCK_WEBSOCKET_CLOSE_REASON",
        "Mock WebSocket close reason must not be empty when provided.",
        false,
        this.clock.now(),
      );
    }

    const callbacks = this.requireCallbacks();

    this.state = "CLOSED";
    this.bufferedAmount = 0;

    await callbacks.onClose(code, reason);
  }

  /**
   * Manually re-emits the open callback.
   */
  public async emitOpen(): Promise<void> {
    const callbacks = this.requireCallbacks();

    this.state = "OPEN";
    await callbacks.onOpen();
  }

  private requireCallbacks():
    BaseExchangeWebSocketTransportCallbacks {
    if (!this.callbacks) {
      throw createMockWebSocketError(
        "MOCK_WEBSOCKET_CALLBACKS_NOT_REGISTERED",
        "Mock WebSocket callbacks are not registered.",
        false,
        this.clock.now(),
      );
    }

    return this.callbacks;
  }
}

/**
 * Validates deterministic mock WebSocket configuration.
 */
export function validateDeterministicMockWebSocketTransportConfig(
  config: DeterministicMockWebSocketTransportConfig,
): void {
  validateConfig(config);
}

/**
 * Runtime type guard.
 */
export function isDeterministicMockWebSocketTransport(
  value: unknown,
): value is DeterministicMockWebSocketTransport {
  return (
    value instanceof
    DeterministicMockWebSocketTransport
  );
}

function validateConfig(
  config: DeterministicMockWebSocketTransportConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_CONFIG_REQUIRED",
      "Mock WebSocket transport configuration is required.",
      false,
      0,
    );
  }

  validateOptionalDelay(
    config.connectDelayMs,
    "connectDelayMs",
  );

  validateOptionalDelay(
    config.sendDelayMs,
    "sendDelayMs",
  );

  validateOptionalDelay(
    config.closeDelayMs,
    "closeDelayMs",
  );

  validateOptionalDelay(
    config.destroyDelayMs,
    "destroyDelayMs",
  );

  if (
    config.initialBufferedAmount !== undefined
  ) {
    validateNonNegativeNumber(
      config.initialBufferedAmount,
      "initialBufferedAmount",
    );
  }

  if (
    config.bufferedAmountAfterSend !== undefined
  ) {
    validateNonNegativeNumber(
      config.bufferedAmountAfterSend,
      "bufferedAmountAfterSend",
    );
  }

  validateOptionalError(
    config.connectFailure,
    "connectFailure",
  );

  validateOptionalError(
    config.sendFailure,
    "sendFailure",
  );

  validateOptionalError(
    config.closeFailure,
    "closeFailure",
  );

  validateOptionalError(
    config.destroyFailure,
    "destroyFailure",
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
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_CLOCK_REQUIRED",
      "Mock WebSocket transport requires a valid clock.",
      false,
      0,
    );
  }
}

function validateEndpoint(
  endpoint: ExchangeWebSocketEndpointConfig,
): void {
  if (
    typeof endpoint !== "object" ||
    endpoint === null
  ) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_ENDPOINT_REQUIRED",
      "Mock WebSocket endpoint is required.",
      false,
      0,
    );
  }

  if (!endpoint.url.trim()) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_ENDPOINT_URL_REQUIRED",
      "Mock WebSocket endpoint URL must not be empty.",
      false,
      0,
    );
  }
}

function validateCallbacks(
  callbacks: BaseExchangeWebSocketTransportCallbacks,
): void {
  if (
    typeof callbacks !== "object" ||
    callbacks === null ||
    typeof callbacks.onOpen !== "function" ||
    typeof callbacks.onMessage !== "function" ||
    typeof callbacks.onError !== "function" ||
    typeof callbacks.onClose !== "function"
  ) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_CALLBACKS_REQUIRED",
      "Mock WebSocket transport requires valid callbacks.",
      false,
      0,
    );
  }
}

function validateSendRequest(
  request: BaseExchangeWebSocketTransportSendRequest,
): void {
  if (
    typeof request !== "object" ||
    request === null
  ) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_SEND_REQUEST_REQUIRED",
      "Mock WebSocket send request is required.",
      false,
      0,
    );
  }

  requireNonEmptyString(
    request.connectionId,
    "connectionId",
  );

  requireNonEmptyString(
    request.messageId,
    "messageId",
  );

  if (
    typeof request.payload !== "string" &&
    !(request.payload instanceof Uint8Array)
  ) {
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_PAYLOAD",
      "Mock WebSocket payload must be a string or Uint8Array.",
      false,
      0,
      request.connectionId,
      request.messageId,
    );
  }
}

function validateCloseRequest(
  request: BaseExchangeWebSocketTransportCloseRequest,
): void {
  if (
    typeof request !== "object" ||
    request === null
  ) {
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_CLOSE_REQUEST_REQUIRED",
      "Mock WebSocket close request is required.",
      false,
      0,
    );
  }

  if (
    request.timeoutMs !== undefined &&
    (
      !Number.isFinite(request.timeoutMs) ||
      request.timeoutMs <= 0
    )
  ) {
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_CLOSE_TIMEOUT",
      "Mock WebSocket close timeout must be finite and greater than zero.",
      false,
      0,
    );
  }

  if (
    request.reason !== undefined &&
    !request.reason.trim()
  ) {
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_CLOSE_REASON",
      "Mock WebSocket close reason must not be empty when provided.",
      false,
      0,
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
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_DELAY",
      `${path} must be finite and non-negative.`,
      false,
      0,
    );
  }
}

function validateNonNegativeNumber(
  value: number,
  path: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_NUMBER",
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
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_ERROR",
      `${path} must be an Error instance.`,
      false,
      0,
    );
  }
}

function validateOptionalCloseCode(
  value: number | undefined,
): void {
  if (
    value !== undefined &&
    (
      !Number.isInteger(value) ||
      value < 1000 ||
      value > 4999
    )
  ) {
    throw createMockWebSocketError(
      "INVALID_MOCK_WEBSOCKET_CLOSE_CODE",
      "Mock WebSocket close code must be an integer between 1000 and 4999.",
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
    throw createMockWebSocketError(
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
    throw createMockWebSocketError(
      "MOCK_WEBSOCKET_CLOCK_NOT_ADVANCEABLE",
      "Mock WebSocket delays require a clock with an advance(milliseconds) method.",
      false,
      clock.now(),
    );
  }

  mutableClock.advance(delayMs);
}

function freezeEndpoint(
  endpoint: ExchangeWebSocketEndpointConfig,
): ExchangeWebSocketEndpointConfig {
  return Object.freeze({
    ...endpoint,
    protocols: endpoint.protocols
      ? Object.freeze([...endpoint.protocols])
      : undefined,
    headers: endpoint.headers
      ? Object.freeze({ ...endpoint.headers })
      : undefined,
  });
}

function freezeSendRequest(
  request: BaseExchangeWebSocketTransportSendRequest,
): BaseExchangeWebSocketTransportSendRequest {
  return Object.freeze({
    ...request,
    payload: clonePayload(request.payload),
  });
}

function clonePayload(
  payload: string | Uint8Array,
): string | Uint8Array {
  return typeof payload === "string"
    ? payload
    : new Uint8Array(payload);
}

function createMockWebSocketError(
  code: string,
  message: string,
  retryable: boolean,
  occurredAt: number,
  connectionId?: string,
  messageId?: string,
): ExchangeWebSocketError {
  return new ExchangeWebSocketError({
    category: "INTERNAL",
    code,
    message,
    connectionId,
    messageId,
    retryable,
    occurredAt,
  });
}