import WebSocket from "ws";

import {
  type BinanceConnectorConfiguration,
} from "./binance-connector-config";

import {
  type BinanceCombinedStreamEnvelope,
  type BinanceWebSocketCloseContext,
  type BinanceWebSocketCommand,
  type BinanceWebSocketCommandResponse,
  type BinanceWebSocketConnectionState,
  type BinanceWebSocketErrorContext,
  type BinanceWebSocketEvent,
  type BinanceWebSocketHealthSnapshot,
  type BinanceWebSocketMessage,
  BinanceWebSocketError,
  BinanceWebSocketValidationError,
  assertBinanceWebSocketRequestId,
  assertBinanceWebSocketStreamName,
  isBinanceCombinedStreamEnvelope,
  isBinanceWebSocketCommandErrorResponse,
  isBinanceWebSocketCommandResponse,
} from "./binance-websocket.types";

export type BinanceWebSocketRequestId =
  | number
  | string;

export type BinanceWebSocketEventListener = (
  message: BinanceWebSocketMessage,
) => void;

export type BinanceWebSocketStateListener = (
  state: BinanceWebSocketConnectionState,
  health: BinanceWebSocketHealthSnapshot,
) => void;

export type BinanceWebSocketErrorListener = (
  error: BinanceWebSocketError,
) => void;

export type BinanceWebSocketCloseListener = (
  context: BinanceWebSocketCloseContext,
) => void;

export type BinanceWebSocketCommandResponseListener = (
  response: BinanceWebSocketCommandResponse,
) => void;

export interface BinanceWebSocketLogger {
  debug?(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;

  warn?(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;

  error?(
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void;
}

export interface BinanceWebSocketClock {
  now(): number;
}

export interface BinanceWebSocketScheduler {
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): unknown;

  clearTimeout(handle: unknown): void;

  setInterval(
    callback: () => void,
    intervalMs: number,
  ): unknown;

  clearInterval(handle: unknown): void;
}

export interface BinanceWebSocketTransport {
  readonly readyState: number;

  send(
    data: string,
    callback?: (error?: Error) => void,
  ): void;

  close(
    code?: number,
    reason?: string,
  ): void;

  terminate?(): void;

  ping?(
    data?: unknown,
    mask?: boolean,
    callback?: (error?: Error) => void,
  ): void;

  on(
    event: "open",
    listener: () => void,
  ): this;

  on(
    event: "message",
    listener: (
      data: WebSocket.RawData,
      isBinary: boolean,
    ) => void,
  ): this;

  on(
    event: "error",
    listener: (error: Error) => void,
  ): this;

  on(
    event: "close",
    listener: (
      code: number,
      reason: Buffer,
    ) => void,
  ): this;

  on(
    event: "pong",
    listener: (data: Buffer) => void,
  ): this;

  removeAllListeners?(): this;
}

export interface BinanceWebSocketTransportFactory {
  create(
    url: string,
  ): BinanceWebSocketTransport;
}

export interface BinanceWebSocketClientDependencies {
  readonly transportFactory?:
    BinanceWebSocketTransportFactory;

  readonly clock?: BinanceWebSocketClock;

  readonly scheduler?:
    BinanceWebSocketScheduler;

  readonly logger?: BinanceWebSocketLogger;

  /**
   * Injectable random source used by reconnect jitter.
   *
   * Must return a value between zero and one.
   */
  readonly random?: () => number;
}

export interface BinanceWebSocketConnectOptions {
  /**
   * Streams to subscribe to immediately after the connection opens.
   */
  readonly streams?: readonly string[];

  /**
   * When true, Binance combined-stream envelopes are requested.
   *
   * Defaults to false.
   */
  readonly combined?: boolean;
}

export interface BinanceWebSocketSendCommandOptions {
  readonly timeoutMs?: number;
}

export interface BinancePendingCommand {
  readonly id: BinanceWebSocketRequestId;
  readonly command: BinanceWebSocketCommand;
  readonly createdAt: number;
  readonly resolve: (
    response: BinanceWebSocketCommandResponse,
  ) => void;
  readonly reject: (
    error: BinanceWebSocketError,
  ) => void;
  readonly timeoutHandle: unknown;
}

export class BinanceWebSocketClientConfigurationError
  extends Error {
  public constructor(message: string) {
    super(message);

    this.name =
      "BinanceWebSocketClientConfigurationError";

    Object.setPrototypeOf(
      this,
      BinanceWebSocketClientConfigurationError.prototype,
    );
  }
}

const WEBSOCKET_OPEN_STATE = 1;

const NORMAL_CLOSE_CODE = 1_000;
const CLIENT_CLOSE_CODE = 1_000;
const CLIENT_CLOSE_REASON =
  "Binance WebSocket client closed";

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

const DEFAULT_CLOCK: BinanceWebSocketClock =
  Object.freeze({
    now(): number {
      return Date.now();
    },
  });

const DEFAULT_SCHEDULER:
  BinanceWebSocketScheduler = Object.freeze({
    setTimeout(
      callback: () => void,
      delayMs: number,
    ): ReturnType<typeof setTimeout> {
      return setTimeout(callback, delayMs);
    },

    clearTimeout(handle: unknown): void {
      clearTimeout(
        handle as ReturnType<typeof setTimeout>,
      );
    },

    setInterval(
      callback: () => void,
      intervalMs: number,
    ): ReturnType<typeof setInterval> {
      return setInterval(
        callback,
        intervalMs,
      );
    },

    clearInterval(handle: unknown): void {
      clearInterval(
        handle as ReturnType<typeof setInterval>,
      );
    },
  });

const DEFAULT_TRANSPORT_FACTORY:
  BinanceWebSocketTransportFactory =
    Object.freeze({
      create(
        url: string,
      ): BinanceWebSocketTransport {
        return new WebSocket(url);
      },
    });

const NOOP_LOGGER: BinanceWebSocketLogger =
  Object.freeze({});

function assertPositiveSafeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new BinanceWebSocketValidationError(
      `${fieldName} must be a positive safe integer.`,
    );
  }
}

function normalizeStreamNames(
  streams: readonly string[],
): readonly string[] {
  const normalizedStreams =
    new Set<string>();

  for (const stream of streams) {
    if (typeof stream !== "string") {
      throw new BinanceWebSocketValidationError(
        "Binance WebSocket stream names must be strings.",
      );
    }

    const normalizedStream =
      stream.trim().toLowerCase();

    assertBinanceWebSocketStreamName(
      normalizedStream,
    );

    normalizedStreams.add(
      normalizedStream,
    );
  }

  return Object.freeze(
    [...normalizedStreams].sort(),
  );
}

function decodeRawMessage(
  data: WebSocket.RawData,
  isBinary: boolean,
): string {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString(
      isBinary ? "utf8" : "utf8",
    );
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

function parseJsonMessage(
  rawMessage: string,
): unknown {
  try {
    return JSON.parse(rawMessage) as unknown;
  } catch (cause) {
    throw new BinanceWebSocketError(
      "Unable to parse Binance WebSocket message as JSON.",
      {
        cause,
        rawMessage,
      },
    );
  }
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isEventPayload(
  value: unknown,
): value is BinanceWebSocketEvent {
  if (!isRecord(value)) {
    return false;
  }

  /*
   * Most Binance events contain `e`.
   * Book ticker and partial-depth events do not always contain it.
   */
  return (
    typeof value.e === "string" ||
    typeof value.s === "string" ||
    typeof value.lastUpdateId === "number"
  );
}

function calculateReconnectDelay(
  attempt: number,
  initialDelayMs: number,
  maximumDelayMs: number,
  random: () => number,
): number {
  const exponentialDelay =
    initialDelayMs * 2 ** attempt;

  const boundedDelay = Math.min(
    exponentialDelay,
    maximumDelayMs,
  );

  /*
   * Injectable bounded jitter keeps deterministic tests possible.
   */
  const jitterMultiplier =
    0.75 + random() * 0.25;

  return Math.max(
    1,
    Math.round(
      boundedDelay * jitterMultiplier,
    ),
  );
}

function createCommandKey(
  id: BinanceWebSocketRequestId,
): string {
  return `${typeof id}:${String(id)}`;
}

export class BinanceWebSocketClient {
  private readonly configuration:
    BinanceConnectorConfiguration;

  private readonly transportFactory:
    BinanceWebSocketTransportFactory;

  private readonly clock:
    BinanceWebSocketClock;

  private readonly scheduler:
    BinanceWebSocketScheduler;

  private readonly logger:
    BinanceWebSocketLogger;

  private readonly random: () => number;

  private readonly desiredSubscriptions =
    new Set<string>();

  private readonly activeSubscriptions =
    new Set<string>();

  private readonly eventListeners =
    new Set<BinanceWebSocketEventListener>();

  private readonly stateListeners =
    new Set<BinanceWebSocketStateListener>();

  private readonly errorListeners =
    new Set<BinanceWebSocketErrorListener>();

  private readonly closeListeners =
    new Set<BinanceWebSocketCloseListener>();

  private readonly commandResponseListeners =
    new Set<BinanceWebSocketCommandResponseListener>();

  private readonly pendingCommands =
    new Map<string, BinancePendingCommand>();

  private transport:
    | BinanceWebSocketTransport
    | undefined;

  private state:
    BinanceWebSocketConnectionState =
      "DISCONNECTED";

  private combined = false;

  private explicitCloseRequested = false;

  private connectedAt:
    | number
    | undefined;

  private disconnectedAt:
    | number
    | undefined;

  private lastMessageAt:
    | number
    | undefined;

  private lastPongAt:
    | number
    | undefined;

  private reconnectAttempts = 0;

  private nextRequestId = 1;

  private reconnectTimer:
    | unknown
    | undefined;

  private connectionTimeoutTimer:
    | unknown
    | undefined;

  private inactivityTimer:
    | unknown
    | undefined;

  private pingTimer:
    | unknown
    | undefined;

  private currentConnectionUrl:
    | string
    | undefined;

  public constructor(
    configuration:
      BinanceConnectorConfiguration,
    dependencies:
      BinanceWebSocketClientDependencies = {},
  ) {
    if (
      configuration === null ||
      typeof configuration !== "object"
    ) {
      throw new BinanceWebSocketClientConfigurationError(
        "Binance connector configuration is required.",
      );
    }

    this.configuration = configuration;

    this.transportFactory =
      dependencies.transportFactory ??
      DEFAULT_TRANSPORT_FACTORY;

    this.clock =
      dependencies.clock ??
      DEFAULT_CLOCK;

    this.scheduler =
      dependencies.scheduler ??
      DEFAULT_SCHEDULER;

    this.logger =
      dependencies.logger ??
      NOOP_LOGGER;

    this.random =
      dependencies.random ??
      Math.random;
  }

  public getState():
    BinanceWebSocketConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return (
      this.state === "CONNECTED" &&
      this.transport?.readyState ===
        WEBSOCKET_OPEN_STATE
    );
  }

  public getHealthSnapshot():
    BinanceWebSocketHealthSnapshot {
    const now = this.clock.now();

    const inactivityDuration =
      this.lastMessageAt === undefined
        ? undefined
        : now - this.lastMessageAt;

    const healthy =
      this.isConnected() &&
      (
        inactivityDuration === undefined ||
        inactivityDuration <=
          this.configuration.websocket
            .inactivityTimeoutMs
      );

    return Object.freeze({
      state: this.state,
      connectedAt: this.connectedAt,
      disconnectedAt:
        this.disconnectedAt,
      lastMessageAt:
        this.lastMessageAt,
      lastPongAt:
        this.lastPongAt,
      reconnectAttempts:
        this.reconnectAttempts,
      activeSubscriptions:
        Object.freeze(
          [...this.activeSubscriptions].sort(),
        ),
      connectionUrl:
        this.currentConnectionUrl,
      healthy,
    });
  }

  public getDesiredSubscriptions():
    readonly string[] {
    return Object.freeze(
      [...this.desiredSubscriptions].sort(),
    );
  }

  public getActiveSubscriptions():
    readonly string[] {
    return Object.freeze(
      [...this.activeSubscriptions].sort(),
    );
  }

  public onEvent(
    listener:
      BinanceWebSocketEventListener,
  ): () => void {
    this.eventListeners.add(listener);

    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public onStateChange(
    listener:
      BinanceWebSocketStateListener,
  ): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onError(
    listener:
      BinanceWebSocketErrorListener,
  ): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public onClose(
    listener:
      BinanceWebSocketCloseListener,
  ): () => void {
    this.closeListeners.add(listener);

    return () => {
      this.closeListeners.delete(listener);
    };
  }

  public onCommandResponse(
    listener:
      BinanceWebSocketCommandResponseListener,
  ): () => void {
    this.commandResponseListeners.add(
      listener,
    );

    return () => {
      this.commandResponseListeners.delete(
        listener,
      );
    };
  }

  public async connect(
    options:
      BinanceWebSocketConnectOptions = {},
  ): Promise<void> {
    if (
      this.state === "CONNECTING" ||
      this.state === "CONNECTED" ||
      this.state === "RECONNECTING"
    ) {
      return;
    }

    this.explicitCloseRequested = false;
    this.combined =
      options.combined ?? false;

    if (options.streams !== undefined) {
      const normalizedStreams =
        normalizeStreamNames(
          options.streams,
        );

      for (
        const stream of normalizedStreams
      ) {
        this.desiredSubscriptions.add(
          stream,
        );
      }
    }

    await this.openConnection(false);
  }

  public async disconnect(
    code = CLIENT_CLOSE_CODE,
    reason = CLIENT_CLOSE_REASON,
  ): Promise<void> {
    this.explicitCloseRequested = true;

    this.clearReconnectTimer();
    this.clearConnectionTimeout();
    this.stopHealthMonitoring();

    this.rejectPendingCommands(
      new BinanceWebSocketError(
        "Binance WebSocket client disconnected before command completion.",
        {
          state: this.state,
        },
      ),
    );

    if (this.transport === undefined) {
      this.activeSubscriptions.clear();
      this.transitionState("CLOSED");
      return;
    }

    this.transitionState("CLOSING");

    try {
      this.transport.close(
        code,
        reason,
      );
    } catch (cause) {
      this.emitError(
        new BinanceWebSocketError(
          "Failed to close Binance WebSocket transport.",
          {
            cause,
            state: this.state,
          },
        ),
      );

      this.transport.terminate?.();
      this.transport = undefined;
      this.activeSubscriptions.clear();
      this.transitionState("CLOSED");
    }
  }

  public async subscribe(
    streams: readonly string[],
  ): Promise<BinanceWebSocketCommandResponse> {
    const normalizedStreams =
      normalizeStreamNames(streams);

    if (normalizedStreams.length === 0) {
      throw new BinanceWebSocketValidationError(
        "At least one Binance WebSocket stream is required.",
      );
    }

    for (
      const stream of normalizedStreams
    ) {
      this.desiredSubscriptions.add(
        stream,
      );
    }

    if (!this.isConnected()) {
      throw new BinanceWebSocketError(
        "Cannot subscribe because the Binance WebSocket is not connected.",
        {
          state: this.state,
        },
      );
    }

    const command =
      Object.freeze({
        method: "SUBSCRIBE" as const,
        params: normalizedStreams,
        id: this.generateRequestId(),
      });

    const response =
      await this.sendCommand(command);

    for (
      const stream of normalizedStreams
    ) {
      this.activeSubscriptions.add(
        stream,
      );
    }

    return response;
  }

  public async unsubscribe(
    streams: readonly string[],
  ): Promise<BinanceWebSocketCommandResponse> {
    const normalizedStreams =
      normalizeStreamNames(streams);

    if (normalizedStreams.length === 0) {
      throw new BinanceWebSocketValidationError(
        "At least one Binance WebSocket stream is required.",
      );
    }

    for (
      const stream of normalizedStreams
    ) {
      this.desiredSubscriptions.delete(
        stream,
      );
    }

    if (!this.isConnected()) {
      for (
        const stream of normalizedStreams
      ) {
        this.activeSubscriptions.delete(
          stream,
        );
      }

      throw new BinanceWebSocketError(
        "Cannot unsubscribe because the Binance WebSocket is not connected.",
        {
          state: this.state,
        },
      );
    }

    const command =
      Object.freeze({
        method: "UNSUBSCRIBE" as const,
        params: normalizedStreams,
        id: this.generateRequestId(),
      });

    const response =
      await this.sendCommand(command);

    for (
      const stream of normalizedStreams
    ) {
      this.activeSubscriptions.delete(
        stream,
      );
    }

    return response;
  }

  public async listSubscriptions():
    Promise<BinanceWebSocketCommandResponse> {
    return this.sendCommand(
      Object.freeze({
        method:
          "LIST_SUBSCRIPTIONS" as const,
        id: this.generateRequestId(),
      }),
    );
  }

  public async setCombinedStreams(
    enabled: boolean,
  ): Promise<BinanceWebSocketCommandResponse> {
    if (typeof enabled !== "boolean") {
      throw new BinanceWebSocketValidationError(
        "Combined-stream property must be boolean.",
      );
    }

    const response =
      await this.sendCommand(
        Object.freeze({
          method:
            "SET_PROPERTY" as const,
          params: [
            "combined",
            enabled,
          ] as const,
          id: this.generateRequestId(),
        }),
      );

    this.combined = enabled;

    return response;
  }

  public async getCombinedStreamsProperty():
    Promise<BinanceWebSocketCommandResponse> {
    return this.sendCommand(
      Object.freeze({
        method:
          "GET_PROPERTY" as const,
        params: [
          "combined",
        ] as const,
        id: this.generateRequestId(),
      }),
    );
  }

  public sendCommand(
    command: BinanceWebSocketCommand,
    options:
      BinanceWebSocketSendCommandOptions = {},
  ): Promise<BinanceWebSocketCommandResponse> {
    if (!this.isConnected()) {
      return Promise.reject(
        new BinanceWebSocketError(
          "Cannot send Binance WebSocket command because the connection is not open.",
          {
            state: this.state,
          },
        ),
      );
    }

    assertBinanceWebSocketRequestId(
      command.id,
    );

    const timeoutMs =
      options.timeoutMs ??
      DEFAULT_COMMAND_TIMEOUT_MS;

    assertPositiveSafeInteger(
      timeoutMs,
      "timeoutMs",
    );

    const commandKey =
      createCommandKey(command.id);

    if (
      this.pendingCommands.has(
        commandKey,
      )
    ) {
      return Promise.reject(
        new BinanceWebSocketValidationError(
          `A Binance WebSocket command with ID ${String(
            command.id,
          )} is already pending.`,
        ),
      );
    }

    const payload =
      JSON.stringify(command);

    return new Promise<
      BinanceWebSocketCommandResponse
    >((resolve, reject) => {
      const timeoutHandle =
        this.scheduler.setTimeout(
          () => {
            this.pendingCommands.delete(
              commandKey,
            );

            reject(
              new BinanceWebSocketError(
                `Binance WebSocket command ${String(
                  command.id,
                )} timed out.`,
                {
                  state: this.state,
                },
              ),
            );
          },
          timeoutMs,
        );

      this.pendingCommands.set(
        commandKey,
        {
          id: command.id,
          command,
          createdAt:
            this.clock.now(),
          resolve,
          reject,
          timeoutHandle,
        },
      );

      try {
        this.transport?.send(
          payload,
          (error?: Error) => {
            if (error === undefined) {
              return;
            }

            const pendingCommand =
              this.pendingCommands.get(
                commandKey,
              );

            if (
              pendingCommand === undefined
            ) {
              return;
            }

            this.scheduler.clearTimeout(
              pendingCommand.timeoutHandle,
            );

            this.pendingCommands.delete(
              commandKey,
            );

            pendingCommand.reject(
              new BinanceWebSocketError(
                "Failed to send Binance WebSocket command.",
                {
                  cause: error,
                  state: this.state,
                },
              ),
            );
          },
        );
      } catch (cause) {
        this.scheduler.clearTimeout(
          timeoutHandle,
        );

        this.pendingCommands.delete(
          commandKey,
        );

        reject(
          new BinanceWebSocketError(
            "Failed to serialize or send Binance WebSocket command.",
            {
              cause,
              state: this.state,
            },
          ),
        );
      }
    });
  }

  private async openConnection(
    reconnecting: boolean,
  ): Promise<void> {
    this.clearConnectionTimeout();

    this.transitionState(
      reconnecting
        ? "RECONNECTING"
        : "CONNECTING",
    );

    const connectionUrl =
      this.createConnectionUrl();

    this.currentConnectionUrl =
      connectionUrl;

    this.logger.debug?.(
      "Opening Binance WebSocket connection.",
      {
        url: connectionUrl,
        reconnecting,
      },
    );

    let transport:
      BinanceWebSocketTransport;

    try {
      transport =
        this.transportFactory.create(
          connectionUrl,
        );
    } catch (cause) {
      const error =
        new BinanceWebSocketError(
          "Failed to create Binance WebSocket transport.",
          {
            cause,
            state: this.state,
          },
        );

      this.emitError(error);

      await this.handleConnectionFailure(
        error,
      );

      return;
    }

    this.transport = transport;

    this.attachTransportListeners(
      transport,
    );

    this.connectionTimeoutTimer =
      this.scheduler.setTimeout(
        () => {
          if (
            this.state !== "CONNECTING" &&
            this.state !== "RECONNECTING"
          ) {
            return;
          }

          const error =
            new BinanceWebSocketError(
              "Binance WebSocket connection timed out.",
              {
                state: this.state,
              },
            );

          this.emitError(error);

          transport.terminate?.();

          void this.handleConnectionFailure(
            error,
          );
        },
        this.configuration.websocket
          .connectionTimeoutMs,
      );
  }

  private attachTransportListeners(
    transport:
      BinanceWebSocketTransport,
  ): void {
    transport.on(
      "open",
      () => {
        void this.handleOpen();
      },
    );

    transport.on(
      "message",
      (
        data:
          WebSocket.RawData,
        isBinary: boolean,
      ) => {
        this.handleMessage(
          data,
          isBinary,
        );
      },
    );

    transport.on(
      "pong",
      () => {
        this.lastPongAt =
          this.clock.now();
      },
    );

    transport.on(
      "error",
      (error: Error) => {
        this.handleTransportError(
          error,
        );
      },
    );

    transport.on(
      "close",
      (
        code: number,
        reason: Buffer,
      ) => {
        void this.handleClose(
          code,
          reason,
        );
      },
    );
  }

  private async handleOpen():
    Promise<void> {
    this.clearConnectionTimeout();

    const now = this.clock.now();

    this.connectedAt = now;
    this.disconnectedAt = undefined;
    this.lastMessageAt = now;
    this.lastPongAt = now;
    this.reconnectAttempts = 0;

    this.activeSubscriptions.clear();

    this.transitionState("CONNECTED");

    this.startHealthMonitoring();

    if (
      this.desiredSubscriptions.size >
      0
    ) {
      try {
        const subscriptions =
          [...this.desiredSubscriptions].sort();

        await this.subscribe(
          subscriptions,
        );
      } catch (cause) {
        this.emitError(
          cause instanceof
            BinanceWebSocketError
            ? cause
            : new BinanceWebSocketError(
                "Failed to restore Binance WebSocket subscriptions.",
                {
                  cause,
                  state: this.state,
                },
              ),
        );
      }
    }

    if (this.combined) {
      try {
        await this.setCombinedStreams(
          true,
        );
      } catch (cause) {
        this.emitError(
          cause instanceof
            BinanceWebSocketError
            ? cause
            : new BinanceWebSocketError(
                "Failed to enable Binance combined streams.",
                {
                  cause,
                  state: this.state,
                },
              ),
        );
      }
    }
  }

  private handleMessage(
    data: WebSocket.RawData,
    isBinary: boolean,
  ): void {
    const receivedAt =
      this.clock.now();

    this.lastMessageAt =
      receivedAt;

    let rawMessage: string;

    try {
      rawMessage =
        decodeRawMessage(
          data,
          isBinary,
        );
    } catch (cause) {
      this.emitError(
        new BinanceWebSocketError(
          "Unable to decode Binance WebSocket message.",
          {
            cause,
            state: this.state,
          },
        ),
      );

      return;
    }

    let parsedMessage: unknown;

    try {
      parsedMessage =
        parseJsonMessage(
          rawMessage,
        );
    } catch (error) {
      this.emitError(
        error as BinanceWebSocketError,
      );

      return;
    }

    if (
      isBinanceWebSocketCommandResponse(
        parsedMessage,
      )
    ) {
      this.handleCommandResponse(
        parsedMessage,
      );

      return;
    }

    let streamName:
      | string
      | undefined;

    let eventPayload =
      parsedMessage;

    if (
      isBinanceCombinedStreamEnvelope(
        parsedMessage,
      )
    ) {
      const envelope =
        parsedMessage as
          BinanceCombinedStreamEnvelope;

      streamName =
        envelope.stream;

      eventPayload =
        envelope.data;
    }

    if (!isEventPayload(eventPayload)) {
      this.emitError(
        new BinanceWebSocketError(
          "Received an unsupported Binance WebSocket payload.",
          {
            streamName,
            rawMessage,
            state: this.state,
          },
        ),
      );

      return;
    }

    const message:
      BinanceWebSocketMessage =
        Object.freeze({
          event: eventPayload,
          context:
            Object.freeze({
              streamName,
              receivedAt,
              rawMessage,
            }),
        });

    for (
      const listener of this.eventListeners
    ) {
      try {
        listener(message);
      } catch (cause) {
        this.logger.error?.(
          "Binance WebSocket event listener failed.",
          {
            cause:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        );
      }
    }
  }

  private handleCommandResponse(
    response:
      BinanceWebSocketCommandResponse,
  ): void {
    for (
      const listener of
      this.commandResponseListeners
    ) {
      try {
        listener(response);
      } catch (cause) {
        this.logger.error?.(
          "Binance WebSocket command-response listener failed.",
          {
            cause:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        );
      }
    }

    if (
      response.id === undefined
    ) {
      if (
        isBinanceWebSocketCommandErrorResponse(
          response,
        )
      ) {
        this.emitError(
          new BinanceWebSocketError(
            response.msg,
            {
              code: response.code,
              state: this.state,
            },
          ),
        );
      }

      return;
    }

    const commandKey =
      createCommandKey(
        response.id,
      );

    const pendingCommand =
      this.pendingCommands.get(
        commandKey,
      );

    if (
      pendingCommand === undefined
    ) {
      return;
    }

    this.scheduler.clearTimeout(
      pendingCommand.timeoutHandle,
    );

    this.pendingCommands.delete(
      commandKey,
    );

    if (
      isBinanceWebSocketCommandErrorResponse(
        response,
      )
    ) {
      pendingCommand.reject(
        new BinanceWebSocketError(
          response.msg,
          {
            code: response.code,
            state: this.state,
          },
        ),
      );

      return;
    }

    pendingCommand.resolve(response);
  }

  private handleTransportError(
    error: Error,
  ): void {
    const websocketError =
      new BinanceWebSocketError(
        "Binance WebSocket transport error.",
        {
          cause: error,
          state: this.state,
        },
      );

    this.emitError(
      websocketError,
    );
  }

  private async handleClose(
    code: number,
    reasonBuffer: Buffer,
  ): Promise<void> {
    this.clearConnectionTimeout();
    this.stopHealthMonitoring();

    const closedAt =
      this.clock.now();

    const reason =
      reasonBuffer.length > 0
        ? reasonBuffer.toString("utf8")
        : undefined;

    const closeContext:
      BinanceWebSocketCloseContext =
        Object.freeze({
          code,
          reason,
          wasClean:
            code === NORMAL_CLOSE_CODE,
          closedAt,
        });

    this.disconnectedAt =
      closedAt;

    this.transport = undefined;
    this.activeSubscriptions.clear();

    this.rejectPendingCommands(
      new BinanceWebSocketError(
        "Binance WebSocket connection closed before command completion.",
        {
          code,
          state: this.state,
        },
      ),
    );

    for (
      const listener of this.closeListeners
    ) {
      try {
        listener(closeContext);
      } catch (cause) {
        this.logger.error?.(
          "Binance WebSocket close listener failed.",
          {
            cause:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        );
      }
    }

    if (
      this.explicitCloseRequested
    ) {
      this.transitionState("CLOSED");
      return;
    }

    this.transitionState(
      "DISCONNECTED",
    );

    await this.scheduleReconnect();
  }

  private async handleConnectionFailure(
    error:
      BinanceWebSocketError,
  ): Promise<void> {
    this.clearConnectionTimeout();
    this.stopHealthMonitoring();

    this.transport?.terminate?.();
    this.transport = undefined;
    this.activeSubscriptions.clear();

    if (
      this.explicitCloseRequested
    ) {
      this.transitionState("CLOSED");
      return;
    }

    this.logger.warn?.(
      "Binance WebSocket connection failed.",
      {
        error: error.message,
        reconnectAttempts:
          this.reconnectAttempts,
      },
    );

    await this.scheduleReconnect();
  }

  private async scheduleReconnect():
    Promise<void> {
    if (
      this.explicitCloseRequested
    ) {
      return;
    }

    const maximumAttempts =
      this.configuration.websocket
        .maxReconnectAttempts;

    if (
      this.reconnectAttempts >=
      maximumAttempts
    ) {
      this.transitionState("FAILED");

      this.emitError(
        new BinanceWebSocketError(
          `Binance WebSocket exceeded the maximum of ${maximumAttempts} reconnection attempts.`,
          {
            state: this.state,
          },
        ),
      );

      return;
    }

    this.clearReconnectTimer();

    const delayMs =
      calculateReconnectDelay(
        this.reconnectAttempts,
        this.configuration.websocket
          .reconnectDelayMs,
        this.configuration.websocket
          .maxReconnectDelayMs,
        this.random,
      );

    this.reconnectAttempts += 1;

    this.transitionState(
      "RECONNECTING",
    );

    this.logger.warn?.(
      "Scheduling Binance WebSocket reconnection.",
      {
        attempt:
          this.reconnectAttempts,
        delayMs,
      },
    );

    await new Promise<void>(
      (resolve) => {
        this.reconnectTimer =
          this.scheduler.setTimeout(
            () => {
              this.reconnectTimer =
                undefined;

              void this.openConnection(
                true,
              );

              resolve();
            },
            delayMs,
          );
      },
    );
  }

  private startHealthMonitoring():
    void {
    this.stopHealthMonitoring();

    const inactivityTimeoutMs =
      this.configuration.websocket
        .inactivityTimeoutMs;

    const healthCheckIntervalMs =
      Math.max(
        1_000,
        Math.floor(
          inactivityTimeoutMs / 2,
        ),
      );

    this.inactivityTimer =
      this.scheduler.setInterval(
        () => {
          if (!this.isConnected()) {
            return;
          }

          const lastActivityAt =
            this.lastMessageAt ??
            this.connectedAt ??
            this.clock.now();

          const inactivityDuration =
            this.clock.now() -
            lastActivityAt;

          if (
            inactivityDuration <=
            inactivityTimeoutMs
          ) {
            return;
          }

          const error =
            new BinanceWebSocketError(
              "Binance WebSocket connection became inactive.",
              {
                state: this.state,
              },
            );

          this.emitError(error);

          this.transport?.terminate?.();
        },
        healthCheckIntervalMs,
      );

    this.pingTimer =
      this.scheduler.setInterval(
        () => {
          if (!this.isConnected()) {
            return;
          }

          if (
            typeof this.transport?.ping !==
            "function"
          ) {
            return;
          }

          try {
            this.transport.ping(
              undefined,
              undefined,
              (error?: Error) => {
                if (
                  error === undefined
                ) {
                  return;
                }

                this.emitError(
                  new BinanceWebSocketError(
                    "Failed to send Binance WebSocket ping.",
                    {
                      cause: error,
                      state: this.state,
                    },
                  ),
                );
              },
            );
          } catch (cause) {
            this.emitError(
              new BinanceWebSocketError(
                "Failed to initiate Binance WebSocket ping.",
                {
                  cause,
                  state: this.state,
                },
              ),
            );
          }
        },
        healthCheckIntervalMs,
      );
  }

  private stopHealthMonitoring():
    void {
    if (
      this.inactivityTimer !==
      undefined
    ) {
      this.scheduler.clearInterval(
        this.inactivityTimer,
      );

      this.inactivityTimer =
        undefined;
    }

    if (
      this.pingTimer !== undefined
    ) {
      this.scheduler.clearInterval(
        this.pingTimer,
      );

      this.pingTimer =
        undefined;
    }
  }

  private createConnectionUrl():
    string {
    const baseUrl =
      this.configuration.endpoints
        .websocketBaseUrl.replace(
          /\/+$/,
          "",
        );

    /*
     * A base `/ws` connection is used so subscriptions can be changed
     * dynamically with SUBSCRIBE and UNSUBSCRIBE commands.
     */
    return `${baseUrl}/ws`;
  }

  private generateRequestId():
    number {
    const requestId =
      this.nextRequestId;

    this.nextRequestId += 1;

    if (
      this.nextRequestId >
      Number.MAX_SAFE_INTEGER
    ) {
      this.nextRequestId = 1;
    }

    return requestId;
  }

  private transitionState(
    nextState:
      BinanceWebSocketConnectionState,
  ): void {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;

    const health =
      this.getHealthSnapshot();

    for (
      const listener of this.stateListeners
    ) {
      try {
        listener(
          nextState,
          health,
        );
      } catch (cause) {
        this.logger.error?.(
          "Binance WebSocket state listener failed.",
          {
            cause:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        );
      }
    }
  }

  private emitError(
    error:
      BinanceWebSocketError,
  ): void {
    this.logger.error?.(
      error.message,
      {
        code: error.code,
        streamName:
          error.streamName,
        state: error.state,
      },
    );

    for (
      const listener of this.errorListeners
    ) {
      try {
        listener(error);
      } catch (cause) {
        this.logger.error?.(
          "Binance WebSocket error listener failed.",
          {
            cause:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        );
      }
    }
  }

  private rejectPendingCommands(
    error:
      BinanceWebSocketError,
  ): void {
    for (
      const pendingCommand of
      this.pendingCommands.values()
    ) {
      this.scheduler.clearTimeout(
        pendingCommand.timeoutHandle,
      );

      pendingCommand.reject(
        error,
      );
    }

    this.pendingCommands.clear();
  }

  private clearReconnectTimer():
    void {
    if (
      this.reconnectTimer ===
      undefined
    ) {
      return;
    }

    this.scheduler.clearTimeout(
      this.reconnectTimer,
    );

    this.reconnectTimer =
      undefined;
  }

  private clearConnectionTimeout():
    void {
    if (
      this.connectionTimeoutTimer ===
      undefined
    ) {
      return;
    }

    this.scheduler.clearTimeout(
      this.connectionTimeoutTimer,
    );

    this.connectionTimeoutTimer =
      undefined;
  }
}