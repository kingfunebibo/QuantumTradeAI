/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Deterministic Bybit V5 WebSocket client foundation.
 *
 * This module provides:
 * - an injectable WebSocket transport contract;
 * - public, private, and trade connection modes;
 * - deterministic request-id generation;
 * - private-stream authentication;
 * - subscribe and unsubscribe messages;
 * - heartbeat ping generation;
 * - structured event handling;
 * - reconnect state tracking;
 * - protocol validation and immutable snapshots.
 */

import {
  BybitRequestSigner,
  type BybitClock,
} from "./bybit-authentication";

import {
  resolveBybitPublicWebSocketUrl,
  type BybitApiCredentials,
  type BybitCategory,
  type BybitConnectorConfig,
} from "./bybit-connector-config";

export type BybitWebSocketMode =
  | "PUBLIC"
  | "PRIVATE"
  | "TRADE";

export type BybitWebSocketReadyState =
  | "CONNECTING"
  | "OPEN"
  | "CLOSING"
  | "CLOSED";

export type BybitWebSocketClientState =
  | "IDLE"
  | "CONNECTING"
  | "AUTHENTICATING"
  | "OPEN"
  | "RECONNECTING"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

export interface BybitWebSocketTransportHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (
    data: string,
  ) => void;
  readonly onClose: (
    code: number,
    reason: string,
  ) => void;
  readonly onError: (
    error: unknown,
  ) => void;
}

export interface BybitWebSocketTransport {
  connect(
    url: string,
    handlers:
      BybitWebSocketTransportHandlers,
  ): void;

  send(data: string): void;

  close(
    code?: number,
    reason?: string,
  ): void;

  getReadyState():
    BybitWebSocketReadyState;
}

export interface BybitWebSocketRequestIdGenerator {
  next(): string;
}

export class SequentialBybitRequestIdGenerator
  implements
    BybitWebSocketRequestIdGenerator {
  private sequence = 0;

  public constructor(
    private readonly prefix =
      "bybit",
  ) {}

  public next(): string {
    this.sequence += 1;

    return (
      `${this.prefix}-` +
      String(this.sequence)
        .padStart(6, "0")
    );
  }
}

export interface BybitWebSocketConnectionOptions {
  readonly mode:
    BybitWebSocketMode;
  readonly category?:
    BybitCategory;
  readonly autoAuthenticate?: boolean;
  readonly heartbeatIntervalMs?: number;
  readonly reconnectEnabled?: boolean;
  readonly maximumReconnectAttempts?: number;
}

export interface BybitWebSocketSnapshot {
  readonly state:
    BybitWebSocketClientState;
  readonly mode:
    BybitWebSocketMode;
  readonly category?:
    BybitCategory;
  readonly url: string;
  readonly authenticated: boolean;
  readonly reconnectAttempts: number;
  readonly subscriptions:
    readonly string[];
}

export interface BybitWebSocketMessageEvent {
  readonly raw: string;
  readonly message:
    Readonly<Record<string, unknown>>;
}

export interface BybitWebSocketCloseEvent {
  readonly code: number;
  readonly reason: string;
}

export interface BybitWebSocketEventHandlers {
  readonly onOpen?: () => void;
  readonly onAuthenticated?: () => void;
  readonly onMessage?: (
    event:
      BybitWebSocketMessageEvent,
  ) => void;
  readonly onClose?: (
    event:
      BybitWebSocketCloseEvent,
  ) => void;
  readonly onError?: (
    error: BybitWebSocketError,
  ) => void;
  readonly onStateChange?: (
    snapshot:
      BybitWebSocketSnapshot,
  ) => void;
}

export type BybitWebSocketErrorKind =
  | "VALIDATION"
  | "STATE"
  | "TRANSPORT"
  | "PROTOCOL"
  | "AUTHENTICATION";

export class BybitWebSocketError
  extends Error {
  public readonly kind:
    BybitWebSocketErrorKind;
  public readonly code: string;
  public readonly path?: string;
  public readonly cause?: unknown;

  public constructor(
    input: Readonly<{
      readonly kind:
        BybitWebSocketErrorKind;
      readonly code: string;
      readonly message: string;
      readonly path?: string;
      readonly cause?: unknown;
    }>,
  ) {
    super(input.message);

    this.name =
      "BybitWebSocketError";
    this.kind = input.kind;
    this.code = input.code;
    this.path = input.path;
    this.cause = input.cause;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export class BybitWebSocketClient {
  private readonly signer:
    BybitRequestSigner;

  private readonly requestIds:
    BybitWebSocketRequestIdGenerator;

  private state:
    BybitWebSocketClientState =
      "IDLE";

  private authenticated = false;
  private reconnectAttempts = 0;

  private readonly subscriptions =
    new Set<string>();

  private heartbeatTimer:
    ReturnType<
      typeof setInterval
    > | undefined;

  private readonly url: string;

  public constructor(
    private readonly config:
      BybitConnectorConfig,
    private readonly transport:
      BybitWebSocketTransport,
    private readonly options:
      BybitWebSocketConnectionOptions,
    private readonly handlers:
      BybitWebSocketEventHandlers = {},
    clock?: BybitClock,
    requestIds:
      BybitWebSocketRequestIdGenerator =
        new SequentialBybitRequestIdGenerator(),
  ) {
    validateOptions(
      config,
      options,
    );

    this.signer =
      new BybitRequestSigner(clock);

    this.requestIds = requestIds;

    this.url =
      resolveWebSocketUrl(
        config,
        options,
      );
  }

  public connect(): void {
    if (
      this.state !== "IDLE" &&
      this.state !== "CLOSED" &&
      this.state !== "FAILED" &&
      this.state !== "RECONNECTING"
    ) {
      throw new BybitWebSocketError({
        kind: "STATE",
        code:
          "BYBIT_WS_ALREADY_ACTIVE",
        message:
          "Bybit WebSocket client is already active.",
      });
    }

    this.authenticated = false;

    this.transition(
      this.reconnectAttempts > 0
        ? "RECONNECTING"
        : "CONNECTING",
    );

    try {
      this.transport.connect(
        this.url,
        Object.freeze({
          onOpen:
            () =>
              this.handleOpen(),
          onMessage:
            (data: string) =>
              this.handleMessage(data),
          onClose:
            (
              code: number,
              reason: string,
            ) =>
              this.handleClose(
                code,
                reason,
              ),
          onError:
            (error: unknown) =>
              this.handleTransportError(
                error,
              ),
        }),
      );
    } catch (error: unknown) {
      const wrapped =
        new BybitWebSocketError({
          kind: "TRANSPORT",
          code:
            "BYBIT_WS_CONNECT_FAILED",
          message:
            "Bybit WebSocket transport failed to connect.",
          cause: error,
        });

      this.transition("FAILED");
      this.emitError(wrapped);

      throw wrapped;
    }
  }

  public disconnect(
    code = 1000,
    reason =
      "Client disconnect",
  ): void {
    if (
      this.state === "CLOSED" ||
      this.state === "IDLE"
    ) {
      return;
    }

    this.transition("CLOSING");
    this.stopHeartbeat();

    try {
      this.transport.close(
        code,
        reason,
      );
    } catch (error: unknown) {
      const wrapped =
        new BybitWebSocketError({
          kind: "TRANSPORT",
          code:
            "BYBIT_WS_CLOSE_FAILED",
          message:
            "Bybit WebSocket transport failed to close.",
          cause: error,
        });

      this.transition("FAILED");
      this.emitError(wrapped);

      throw wrapped;
    }
  }

  public authenticate(): void {
    if (
      this.options.mode ===
        "PUBLIC"
    ) {
      throw new BybitWebSocketError({
        kind: "STATE",
        code:
          "BYBIT_WS_PUBLIC_AUTH_UNSUPPORTED",
        message:
          "Public Bybit WebSocket connections do not require authentication.",
      });
    }

    this.assertOpenTransport();

    const credentials =
      this.requireCredentials();

    const authentication =
      this.signer
        .createWebSocketAuthentication({
          credentials,
        });

    this.transition(
      "AUTHENTICATING",
    );

    this.sendJson(
      authentication.message,
    );
  }

  public subscribe(
    topics: readonly string[],
    requestId =
      this.requestIds.next(),
  ): string {
    this.assertOpenTransport();

    const normalizedTopics =
      normalizeTopics(topics);

    this.sendJson({
      req_id: requestId,
      op: "subscribe",
      args: normalizedTopics,
    });

    for (
      const topic of
      normalizedTopics
    ) {
      this.subscriptions.add(
        topic,
      );
    }

    this.emitStateChange();

    return requestId;
  }

  public unsubscribe(
    topics: readonly string[],
    requestId =
      this.requestIds.next(),
  ): string {
    this.assertOpenTransport();

    const normalizedTopics =
      normalizeTopics(topics);

    this.sendJson({
      req_id: requestId,
      op: "unsubscribe",
      args: normalizedTopics,
    });

    for (
      const topic of
      normalizedTopics
    ) {
      this.subscriptions.delete(
        topic,
      );
    }

    this.emitStateChange();

    return requestId;
  }

  public sendHeartbeat(
    requestId =
      this.requestIds.next(),
  ): string {
    this.assertOpenTransport();

    this.sendJson({
      req_id: requestId,
      op: "ping",
    });

    return requestId;
  }

  public sendTradeRequest(
    operation: string,
    args:
      readonly Readonly<
        Record<string, unknown>
      >[],
    requestId =
      this.requestIds.next(),
  ): string {
    if (
      this.options.mode !==
        "TRADE"
    ) {
      throw new BybitWebSocketError({
        kind: "STATE",
        code:
          "BYBIT_WS_TRADE_MODE_REQUIRED",
        message:
          "WebSocket trade requests require TRADE mode.",
      });
    }

    this.assertOpenTransport();

    assertNonEmptyString(
      operation,
      "operation",
      "BYBIT_WS_TRADE_OPERATION_REQUIRED",
    );

    if (
      !Array.isArray(args) ||
      args.length === 0
    ) {
      throw new BybitWebSocketError({
        kind: "VALIDATION",
        code:
          "BYBIT_WS_TRADE_ARGS_REQUIRED",
        message:
          "Bybit WebSocket trade args must contain at least one object.",
        path: "args",
      });
    }

    const credentials =
      this.requireCredentials();

    const signed =
      this.signer
        .createWebSocketTradeHeaders({
          credentials,
          receiveWindowMs:
            this.config.receiveWindowMs,
        });

    this.sendJson({
      reqId: requestId,
      header: signed.header,
      op: operation.trim(),
      args,
    });

    return requestId;
  }

  public getSnapshot():
    BybitWebSocketSnapshot {
    return Object.freeze({
      state: this.state,
      mode: this.options.mode,
      category:
        this.options.category,
      url: this.url,
      authenticated:
        this.authenticated,
      reconnectAttempts:
        this.reconnectAttempts,
      subscriptions:
        Object.freeze(
          Array.from(
            this.subscriptions,
          ).sort(),
        ),
    });
  }

  public getUrl(): string {
    return this.url;
  }

  private handleOpen(): void {
    this.transition("OPEN");
    this.reconnectAttempts = 0;
    this.startHeartbeat();
    this.handlers.onOpen?.();

    if (
      this.options.mode !==
        "PUBLIC" &&
      (
        this.options
          .autoAuthenticate ??
        true
      )
    ) {
      this.authenticate();
    }
  }

  private handleMessage(
    raw: string,
  ): void {
    let message: unknown;

    try {
      message = JSON.parse(raw);
    } catch (error: unknown) {
      const wrapped =
        new BybitWebSocketError({
          kind: "PROTOCOL",
          code:
            "BYBIT_WS_MESSAGE_JSON_INVALID",
          message:
            "Bybit WebSocket message is not valid JSON.",
          cause: error,
        });

      this.emitError(wrapped);
      return;
    }

    if (
      typeof message !==
        "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      this.emitError(
        new BybitWebSocketError({
          kind: "PROTOCOL",
          code:
            "BYBIT_WS_MESSAGE_INVALID",
          message:
            "Bybit WebSocket message must be a JSON object.",
        }),
      );
      return;
    }

    const record =
      message as Record<
        string,
        unknown
      >;

    if (
      record.op === "auth"
    ) {
      const success =
        record.success === true ||
        record.retCode === 0;

      if (success) {
        this.authenticated = true;
        this.transition("OPEN");
        this.handlers
          .onAuthenticated?.();
      } else {
        const error =
          new BybitWebSocketError({
            kind:
              "AUTHENTICATION",
            code:
              "BYBIT_WS_AUTHENTICATION_REJECTED",
            message:
              resolveProtocolMessage(
                record,
                "Bybit WebSocket authentication was rejected.",
              ),
          });

        this.transition("FAILED");
        this.emitError(error);
      }
    }

    this.handlers.onMessage?.(
      Object.freeze({
        raw,
        message:
          Object.freeze({
            ...record,
          }),
      }),
    );
  }

  private handleClose(
    code: number,
    reason: string,
  ): void {
    this.stopHeartbeat();
    this.authenticated = false;

    const reconnectEnabled =
      this.options
        .reconnectEnabled ??
      true;

    const maximumAttempts =
      this.options
        .maximumReconnectAttempts ??
      5;

    const unexpected =
      this.state !== "CLOSING" &&
      code !== 1000;

    if (
      unexpected &&
      reconnectEnabled &&
      this.reconnectAttempts <
        maximumAttempts
    ) {
      this.reconnectAttempts += 1;
      this.transition(
        "RECONNECTING",
      );
    } else {
      this.transition("CLOSED");
    }

    this.handlers.onClose?.(
      Object.freeze({
        code,
        reason,
      }),
    );
  }

  private handleTransportError(
    error: unknown,
  ): void {
    const wrapped =
      new BybitWebSocketError({
        kind: "TRANSPORT",
        code:
          "BYBIT_WS_TRANSPORT_ERROR",
        message:
          "Bybit WebSocket transport reported an error.",
        cause: error,
      });

    this.emitError(wrapped);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const intervalMs =
      this.options
        .heartbeatIntervalMs ??
      20_000;

    this.heartbeatTimer =
      setInterval(
        () => {
          if (
            this.transport
              .getReadyState() ===
            "OPEN"
          ) {
            try {
              this.sendHeartbeat();
            } catch (
              error: unknown
            ) {
              this.emitError(
                error instanceof
                  BybitWebSocketError
                  ? error
                  : new BybitWebSocketError(
                      {
                        kind:
                          "TRANSPORT",
                        code:
                          "BYBIT_WS_HEARTBEAT_FAILED",
                        message:
                          "Bybit WebSocket heartbeat failed.",
                        cause:
                          error,
                      },
                    ),
              );
            }
          }
        },
        intervalMs,
      );
  }

  private stopHeartbeat(): void {
    if (
      this.heartbeatTimer !==
      undefined
    ) {
      clearInterval(
        this.heartbeatTimer,
      );

      this.heartbeatTimer =
        undefined;
    }
  }

  private assertOpenTransport(): void {
    if (
      this.transport
        .getReadyState() !==
      "OPEN"
    ) {
      throw new BybitWebSocketError({
        kind: "STATE",
        code:
          "BYBIT_WS_NOT_OPEN",
        message:
          "Bybit WebSocket transport is not open.",
      });
    }
  }

  private requireCredentials():
    BybitApiCredentials {
    const credentials =
      this.config.credentials;

    if (!credentials) {
      throw new BybitWebSocketError({
        kind: "VALIDATION",
        code:
          "BYBIT_WS_CREDENTIALS_REQUIRED",
        message:
          "Bybit credentials are required for private and trade WebSocket connections.",
        path:
          "config.credentials",
      });
    }

    return credentials;
  }

  private sendJson(
    message: unknown,
  ): void {
    try {
      this.transport.send(
        JSON.stringify(message),
      );
    } catch (error: unknown) {
      const wrapped =
        new BybitWebSocketError({
          kind: "TRANSPORT",
          code:
            "BYBIT_WS_SEND_FAILED",
          message:
            "Bybit WebSocket transport failed to send a message.",
          cause: error,
        });

      this.emitError(wrapped);

      throw wrapped;
    }
  }

  private transition(
    state:
      BybitWebSocketClientState,
  ): void {
    this.state = state;
    this.emitStateChange();
  }

  private emitStateChange(): void {
    this.handlers
      .onStateChange?.(
        this.getSnapshot(),
      );
  }

  private emitError(
    error:
      BybitWebSocketError,
  ): void {
    this.handlers.onError?.(
      error,
    );
  }
}

export function resolveWebSocketUrl(
  config: BybitConnectorConfig,
  options:
    BybitWebSocketConnectionOptions,
): string {
  const domains =
    config.domains;

  if (!domains) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_DOMAINS_REQUIRED",
      message:
        "Bybit WebSocket domain configuration is required.",
      path: "config.domains",
    });
  }

  switch (options.mode) {
    case "PUBLIC":
      if (!options.category) {
        throw new BybitWebSocketError({
          kind: "VALIDATION",
          code:
            "BYBIT_WS_PUBLIC_CATEGORY_REQUIRED",
          message:
            "Public Bybit WebSocket mode requires a category.",
          path:
            "options.category",
        });
      }

      return resolveBybitPublicWebSocketUrl(
        domains,
        options.category,
      );

    case "PRIVATE":
      return domains.webSocket
        .privateUrl;

    case "TRADE": {
      const tradeUrl =
        domains.webSocket
          .tradeUrl;

      if (!tradeUrl) {
        throw new BybitWebSocketError({
          kind: "VALIDATION",
          code:
            "BYBIT_WS_TRADE_URL_REQUIRED",
          message:
            "Bybit trade WebSocket URL is not configured.",
          path:
            "config.domains.webSocket.tradeUrl",
        });
      }

      return tradeUrl;
    }

    default:
      return assertNeverMode(
        options.mode,
      );
  }
}

export function normalizeTopics(
  topics: readonly string[],
): readonly string[] {
  if (
    !Array.isArray(topics) ||
    topics.length === 0
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_TOPICS_REQUIRED",
      message:
        "At least one Bybit WebSocket topic is required.",
      path: "topics",
    });
  }

  const normalized =
    topics.map((topic) => {
      assertNonEmptyString(
        topic,
        "topics",
        "BYBIT_WS_TOPIC_INVALID",
      );

      return topic.trim();
    });

  const unique =
    Array.from(
      new Set(normalized),
    ).sort();

  return Object.freeze(unique);
}

function validateOptions(
  config: BybitConnectorConfig,
  options:
    BybitWebSocketConnectionOptions,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_CONFIG_REQUIRED",
      message:
        "Bybit WebSocket configuration is required.",
      path: "config",
    });
  }

  if (
    typeof options !== "object" ||
    options === null
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_OPTIONS_REQUIRED",
      message:
        "Bybit WebSocket connection options are required.",
      path: "options",
    });
  }

  if (
    options.heartbeatIntervalMs !==
      undefined &&
    (
      !Number.isInteger(
        options.heartbeatIntervalMs,
      ) ||
      options.heartbeatIntervalMs <=
        0
    )
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_HEARTBEAT_INTERVAL_INVALID",
      message:
        "heartbeatIntervalMs must be a positive integer.",
      path:
        "options.heartbeatIntervalMs",
    });
  }

  if (
    options.maximumReconnectAttempts !==
      undefined &&
    (
      !Number.isInteger(
        options.maximumReconnectAttempts,
      ) ||
      options.maximumReconnectAttempts <
        0
    )
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code:
        "BYBIT_WS_RECONNECT_LIMIT_INVALID",
      message:
        "maximumReconnectAttempts must be a non-negative integer.",
      path:
        "options.maximumReconnectAttempts",
    });
  }

  resolveWebSocketUrl(
    config,
    options,
  );
}

function assertNonEmptyString(
  value: string,
  path: string,
  code: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new BybitWebSocketError({
      kind: "VALIDATION",
      code,
      message:
        `${path} must be a non-empty string.`,
      path,
    });
  }
}

function resolveProtocolMessage(
  message:
    Readonly<
      Record<string, unknown>
    >,
  fallback: string,
): string {
  const retMsg =
    message.retMsg;

  if (
    typeof retMsg === "string" &&
    retMsg.length > 0
  ) {
    return retMsg;
  }

  const retMessage =
    message.ret_msg;

  if (
    typeof retMessage ===
      "string" &&
    retMessage.length > 0
  ) {
    return retMessage;
  }

  return fallback;
}

function assertNeverMode(
  value: never,
): never {
  throw new BybitWebSocketError({
    kind: "VALIDATION",
    code:
      "BYBIT_WS_MODE_UNSUPPORTED",
    message:
      `Unsupported Bybit WebSocket mode: ${String(value)}.`,
    path: "options.mode",
  });
}