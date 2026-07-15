import {
  type OkxWebSocketScope,
} from "./okx-websocket-contracts";

export type OkxWebSocketReadyState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed";

export type OkxWebSocketCloseCode = number;

export interface OkxWebSocketOpenEvent {
  readonly type: "open";
}

export interface OkxWebSocketMessageEvent {
  readonly type: "message";
  readonly data: string;
}

export interface OkxWebSocketErrorEvent {
  readonly type: "error";
  readonly error: unknown;
}

export interface OkxWebSocketCloseEvent {
  readonly type: "close";
  readonly code: OkxWebSocketCloseCode;
  readonly reason: string;
  readonly wasClean: boolean;
}

export type OkxWebSocketLifecycleEvent =
  | OkxWebSocketOpenEvent
  | OkxWebSocketMessageEvent
  | OkxWebSocketErrorEvent
  | OkxWebSocketCloseEvent;

export type OkxWebSocketOpenListener = (
  event: OkxWebSocketOpenEvent,
) => void;

export type OkxWebSocketMessageListener = (
  event: OkxWebSocketMessageEvent,
) => void;

export type OkxWebSocketErrorListener = (
  event: OkxWebSocketErrorEvent,
) => void;

export type OkxWebSocketCloseListener = (
  event: OkxWebSocketCloseEvent,
) => void;

export interface OkxWebSocketListenerMap {
  readonly open: OkxWebSocketOpenListener;
  readonly message: OkxWebSocketMessageListener;
  readonly error: OkxWebSocketErrorListener;
  readonly close: OkxWebSocketCloseListener;
}

export interface OkxWebSocketConnection {
  readonly scope: OkxWebSocketScope;
  readonly url: string;
  getReadyState(): OkxWebSocketReadyState;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  addEventListener<TKey extends keyof OkxWebSocketListenerMap>(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void;
  removeEventListener<TKey extends keyof OkxWebSocketListenerMap>(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void;
}

export interface OkxWebSocketTransport {
  connect(
    scope: OkxWebSocketScope,
    url: string,
  ): OkxWebSocketConnection;
}

export interface OkxWebSocketFactory {
  create(url: string): OkxNativeWebSocket;
}

export interface OkxNativeWebSocket {
  readonly readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    event: "open",
    listener: (event: unknown) => void,
  ): void;
  addEventListener(
    event: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  addEventListener(
    event: "error",
    listener: (event: unknown) => void,
  ): void;
  addEventListener(
    event: "close",
    listener: (
      event: {
        readonly code?: unknown;
        readonly reason?: unknown;
        readonly wasClean?: unknown;
      },
    ) => void,
  ): void;
  removeEventListener(
    event: "open" | "message" | "error" | "close",
    listener: (event: never) => void,
  ): void;
}

export class OkxWebSocketTransportError extends Error {
  public readonly code =
    "OKX_WEBSOCKET_TRANSPORT_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxWebSocketTransportError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DefaultOkxWebSocketTransport
  implements OkxWebSocketTransport
{
  public constructor(
    private readonly factory: OkxWebSocketFactory,
  ) {
    validateFactory(factory);
  }

  public connect(
    scope: OkxWebSocketScope,
    url: string,
  ): OkxWebSocketConnection {
    validateScope(scope);

    const normalizedUrl = normalizeWebSocketUrl(url);
    const socket = this.factory.create(normalizedUrl);

    return new NativeOkxWebSocketConnection(
      scope,
      normalizedUrl,
      socket,
    );
  }
}

export class NativeOkxWebSocketConnection
  implements OkxWebSocketConnection
{
  private readonly listeners: {
    open: Set<OkxWebSocketOpenListener>;
    message: Set<OkxWebSocketMessageListener>;
    error: Set<OkxWebSocketErrorListener>;
    close: Set<OkxWebSocketCloseListener>;
  } = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set(),
  };

  private readonly nativeHandlers: {
    readonly open: (event: unknown) => void;
    readonly message: (
      event: { readonly data: unknown },
    ) => void;
    readonly error: (event: unknown) => void;
    readonly close: (
      event: {
        readonly code?: unknown;
        readonly reason?: unknown;
        readonly wasClean?: unknown;
      },
    ) => void;
  };

  public constructor(
    public readonly scope: OkxWebSocketScope,
    public readonly url: string,
    private readonly socket: OkxNativeWebSocket,
  ) {
    validateScope(scope);
    normalizeWebSocketUrl(url);
    validateNativeSocket(socket);

    this.nativeHandlers = {
      open: () => {
        this.emitOpen();
      },
      message: (event) => {
        this.emitMessage(
          normalizeIncomingMessageData(event.data),
        );
      },
      error: (event) => {
        this.emitError(event);
      },
      close: (event) => {
        this.emitClose({
          code: normalizeCloseCode(event.code),
          reason: normalizeCloseReason(event.reason),
          wasClean: event.wasClean === true,
        });
      },
    };

    this.socket.addEventListener(
      "open",
      this.nativeHandlers.open,
    );

    this.socket.addEventListener(
      "message",
      this.nativeHandlers.message,
    );

    this.socket.addEventListener(
      "error",
      this.nativeHandlers.error,
    );

    this.socket.addEventListener(
      "close",
      this.nativeHandlers.close,
    );
  }

  public getReadyState(): OkxWebSocketReadyState {
    return mapNativeReadyState(
      this.socket.readyState,
    );
  }

  public send(message: string): void {
    const normalizedMessage =
      requireNonEmptyString(
        message,
        "message",
      );

    if (this.getReadyState() !== "open") {
      throw new OkxWebSocketTransportError(
        "Cannot send an OKX WebSocket message unless the connection is open.",
      );
    }

    this.socket.send(normalizedMessage);
  }

  public close(
    code?: number,
    reason?: string,
  ): void {
    if (code !== undefined) {
      validateCloseCode(code);
    }

    const normalizedReason =
      reason === undefined
        ? undefined
        : requireNonEmptyString(
            reason,
            "reason",
          );

    this.socket.close(
      code,
      normalizedReason,
    );
  }

  public addEventListener<
    TKey extends keyof OkxWebSocketListenerMap,
  >(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void {
    validateListener(listener);

    this.listeners[event].add(
      listener as never,
    );
  }

  public removeEventListener<
    TKey extends keyof OkxWebSocketListenerMap,
  >(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void {
    this.listeners[event].delete(
      listener as never,
    );
  }

  private emitOpen(): void {
    const event: OkxWebSocketOpenEvent =
      Object.freeze({
        type: "open",
      });

    for (const listener of this.listeners.open) {
      listener(event);
    }
  }

  private emitMessage(data: string): void {
    const event: OkxWebSocketMessageEvent =
      Object.freeze({
        type: "message",
        data,
      });

    for (const listener of this.listeners.message) {
      listener(event);
    }
  }

  private emitError(error: unknown): void {
    const event: OkxWebSocketErrorEvent =
      Object.freeze({
        type: "error",
        error,
      });

    for (const listener of this.listeners.error) {
      listener(event);
    }
  }

  private emitClose(
    input: Omit<OkxWebSocketCloseEvent, "type">,
  ): void {
    const event: OkxWebSocketCloseEvent =
      Object.freeze({
        type: "close",
        code: input.code,
        reason: input.reason,
        wasClean: input.wasClean,
      });

    for (const listener of this.listeners.close) {
      listener(event);
    }
  }
}

export class DeterministicOkxMockWebSocketConnection
  implements OkxWebSocketConnection
{
  private readyState: OkxWebSocketReadyState =
    "idle";

  private readonly sentMessages: string[] = [];

  private readonly listeners: {
    open: Set<OkxWebSocketOpenListener>;
    message: Set<OkxWebSocketMessageListener>;
    error: Set<OkxWebSocketErrorListener>;
    close: Set<OkxWebSocketCloseListener>;
  } = {
    open: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set(),
  };

  public constructor(
    public readonly scope: OkxWebSocketScope,
    public readonly url: string,
  ) {
    validateScope(scope);
    normalizeWebSocketUrl(url);
  }

  public getReadyState(): OkxWebSocketReadyState {
    return this.readyState;
  }

  public send(message: string): void {
    const normalizedMessage =
      requireNonEmptyString(
        message,
        "message",
      );

    if (this.readyState !== "open") {
      throw new OkxWebSocketTransportError(
        "Cannot send an OKX WebSocket message unless the connection is open.",
      );
    }

    this.sentMessages.push(normalizedMessage);
  }

  public close(
    code = 1000,
    reason = "Normal closure",
  ): void {
    validateCloseCode(code);

    const normalizedReason =
      requireNonEmptyString(
        reason,
        "reason",
      );

    this.readyState = "closed";

    this.emitClose({
      code,
      reason: normalizedReason,
      wasClean: true,
    });
  }

  public addEventListener<
    TKey extends keyof OkxWebSocketListenerMap,
  >(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void {
    validateListener(listener);

    this.listeners[event].add(
      listener as never,
    );
  }

  public removeEventListener<
    TKey extends keyof OkxWebSocketListenerMap,
  >(
    event: TKey,
    listener: OkxWebSocketListenerMap[TKey],
  ): void {
    this.listeners[event].delete(
      listener as never,
    );
  }

  public open(): void {
    this.readyState = "open";

    const event: OkxWebSocketOpenEvent =
      Object.freeze({
        type: "open",
      });

    for (const listener of this.listeners.open) {
      listener(event);
    }
  }

  public connect(): void {
    this.readyState = "connecting";
  }

  public emitMessage(data: string): void {
    const normalizedData =
      requireNonEmptyString(
        data,
        "data",
      );

    const event: OkxWebSocketMessageEvent =
      Object.freeze({
        type: "message",
        data: normalizedData,
      });

    for (const listener of this.listeners.message) {
      listener(event);
    }
  }

  public emitError(error: unknown): void {
    const event: OkxWebSocketErrorEvent =
      Object.freeze({
        type: "error",
        error,
      });

    for (const listener of this.listeners.error) {
      listener(event);
    }
  }

  public emitClose(
    input: Omit<OkxWebSocketCloseEvent, "type">,
  ): void {
    validateCloseCode(input.code);

    const event: OkxWebSocketCloseEvent =
      Object.freeze({
        type: "close",
        code: input.code,
        reason: requireNonEmptyString(
          input.reason,
          "reason",
        ),
        wasClean: input.wasClean,
      });

    this.readyState = "closed";

    for (const listener of this.listeners.close) {
      listener(event);
    }
  }

  public getSentMessages(): readonly string[] {
    return Object.freeze([
      ...this.sentMessages,
    ]);
  }
}

export class DeterministicOkxMockWebSocketTransport
  implements OkxWebSocketTransport
{
  private readonly connections:
    DeterministicOkxMockWebSocketConnection[] = [];

  public connect(
    scope: OkxWebSocketScope,
    url: string,
  ): DeterministicOkxMockWebSocketConnection {
    const connection =
      new DeterministicOkxMockWebSocketConnection(
        scope,
        url,
      );

    connection.connect();
    this.connections.push(connection);

    return connection;
  }

  public getConnections():
    readonly DeterministicOkxMockWebSocketConnection[] {
    return Object.freeze([
      ...this.connections,
    ]);
  }
}

export function createDefaultOkxWebSocketFactory():
  OkxWebSocketFactory {
  const constructorValue =
    globalThis.WebSocket;

  if (typeof constructorValue !== "function") {
    throw new OkxWebSocketTransportError(
      "Global WebSocket is unavailable. Provide an OkxWebSocketFactory.",
    );
  }

  return Object.freeze({
    create(url: string): OkxNativeWebSocket {
      return new constructorValue(
        url,
      ) as unknown as OkxNativeWebSocket;
    },
  });
}

export function mapNativeReadyState(
  readyState: number,
): OkxWebSocketReadyState {
  switch (readyState) {
    case 0:
      return "connecting";
    case 1:
      return "open";
    case 2:
      return "closing";
    case 3:
      return "closed";
    default:
      throw new OkxWebSocketTransportError(
        `Unsupported native WebSocket readyState: ${readyState}.`,
      );
  }
}

function normalizeIncomingMessageData(
  value: unknown,
): string {
  if (typeof value === "string") {
    return value;
  }

  throw new OkxWebSocketTransportError(
    "OKX WebSocket message data must be a string.",
  );
}

function normalizeCloseCode(
  value: unknown,
): number {
  if (value === undefined) {
    return 1000;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    throw new OkxWebSocketTransportError(
      "WebSocket close code must be an integer.",
    );
  }

  validateCloseCode(value);

  return value;
}

function normalizeCloseReason(
  value: unknown,
): string {
  if (value === undefined || value === "") {
    return "No reason provided";
  }

  if (typeof value !== "string") {
    throw new OkxWebSocketTransportError(
      "WebSocket close reason must be a string.",
    );
  }

  return value;
}

function validateFactory(
  factory: OkxWebSocketFactory,
): void {
  if (
    typeof factory !== "object" ||
    factory === null ||
    typeof factory.create !== "function"
  ) {
    throw new OkxWebSocketTransportError(
      "factory must implement OkxWebSocketFactory.",
    );
  }
}

function validateNativeSocket(
  socket: OkxNativeWebSocket,
): void {
  if (
    typeof socket !== "object" ||
    socket === null ||
    typeof socket.send !== "function" ||
    typeof socket.close !== "function" ||
    typeof socket.addEventListener !== "function" ||
    typeof socket.removeEventListener !== "function"
  ) {
    throw new OkxWebSocketTransportError(
      "socket must implement OkxNativeWebSocket.",
    );
  }
}

function validateScope(
  scope: OkxWebSocketScope,
): void {
  if (
    scope !== "public" &&
    scope !== "private" &&
    scope !== "business"
  ) {
    throw new OkxWebSocketTransportError(
      `Unsupported OKX WebSocket scope: "${String(scope)}".`,
    );
  }
}

function normalizeWebSocketUrl(
  value: string,
): string {
  const normalized =
    requireNonEmptyString(
      value,
      "url",
    );

  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new OkxWebSocketTransportError(
      "url must be a valid absolute URL.",
    );
  }

  if (
    url.protocol !== "ws:" &&
    url.protocol !== "wss:"
  ) {
    throw new OkxWebSocketTransportError(
      "url must use the WS or WSS protocol.",
    );
  }

  return url.toString();
}

function validateListener(
  listener: unknown,
): asserts listener is (...args: never[]) => void {
  if (typeof listener !== "function") {
    throw new OkxWebSocketTransportError(
      "listener must be a function.",
    );
  }
}

function validateCloseCode(
  code: number,
): void {
  if (
    !Number.isInteger(code) ||
    code < 1000 ||
    code > 4999
  ) {
    throw new OkxWebSocketTransportError(
      "WebSocket close code must be an integer between 1000 and 4999.",
    );
  }
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxWebSocketTransportError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxWebSocketTransportError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}