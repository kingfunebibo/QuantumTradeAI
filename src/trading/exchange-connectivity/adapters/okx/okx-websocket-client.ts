import {
  authenticateOkxWebSocketLogin,
} from "./okx-websocket-authentication";

import {
  type OkxClock,
} from "./okx-authentication";

import {
  type OkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createOkxWebSocketConnectionDescriptor,
  createOkxWebSocketSubscriptionRequest,
  isOkxWebSocketErrorMessage,
  isOkxWebSocketEventMessage,
  isOkxWebSocketNoticeMessage,
  isOkxWebSocketOperationResponse,
  isOkxWebSocketPushMessage,
  parseOkxWebSocketMessage,
  serializeOkxWebSocketRequest,
  type OkxWebSocketChannelArgument,
  type OkxWebSocketClientRequest,
  type OkxWebSocketEventMessage,
  type OkxWebSocketOperationResponse,
  type OkxWebSocketPushMessage,
  type OkxWebSocketScope,
} from "./okx-websocket-contracts";

import {
  type OkxWebSocketCloseEvent,
  type OkxWebSocketConnection,
  type OkxWebSocketErrorEvent,
  type OkxWebSocketMessageEvent,
  type OkxWebSocketReadyState,
  type OkxWebSocketTransport,
} from "./okx-websocket-transport";

export type OkxWebSocketClientState =
  | "idle"
  | "connecting"
  | "connected"
  | "authenticating"
  | "authenticated"
  | "closing"
  | "closed"
  | "failed";

export interface OkxWebSocketEndpointConfiguration {
  readonly publicUrl: string;
  readonly privateUrl: string;
  readonly businessUrl: string;
}

export interface OkxWebSocketRequestIdGenerator {
  nextId(): string;
}

export interface OkxWebSocketClientDependencies {
  readonly configuration: OkxConnectorConfiguration;
  readonly endpoints: OkxWebSocketEndpointConfiguration;
  readonly transport: OkxWebSocketTransport;
  readonly clock: OkxClock;
  readonly requestIdGenerator:
    OkxWebSocketRequestIdGenerator;
}

export interface OkxWebSocketClientSnapshot {
  readonly scope: OkxWebSocketScope;
  readonly state: OkxWebSocketClientState;
  readonly readyState: OkxWebSocketReadyState;
  readonly authenticated: boolean;
  readonly subscriptionCount: number;
  readonly lastError?: unknown;
  readonly lastClose?: OkxWebSocketCloseEvent;
}

export interface OkxWebSocketMessageHandlers {
  readonly onEvent?: (
    message: OkxWebSocketEventMessage,
  ) => void;

  readonly onPush?: (
    message: OkxWebSocketPushMessage<unknown>,
  ) => void;

  readonly onOperationResponse?: (
    message: OkxWebSocketOperationResponse,
  ) => void;

  readonly onError?: (
    error: unknown,
  ) => void;

  readonly onClose?: (
    event: OkxWebSocketCloseEvent,
  ) => void;

  readonly onRawMessage?: (
    rawMessage: string,
  ) => void;
}

export interface OkxWebSocketSubscription {
  readonly key: string;
  readonly argument: OkxWebSocketChannelArgument;
}

export class OkxWebSocketClientError extends Error {
  public readonly code =
    "OKX_WEBSOCKET_CLIENT_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxWebSocketClientError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxWebSocketClient {
  private connection?: OkxWebSocketConnection;

  private state: OkxWebSocketClientState =
    "idle";

  private authenticated = false;

  private readonly subscriptions =
    new Map<string, OkxWebSocketSubscription>();

  private lastError?: unknown;

  private lastClose?: OkxWebSocketCloseEvent;

  private readonly handlers:
    OkxWebSocketMessageHandlers;

  public constructor(
    private readonly scope: OkxWebSocketScope,
    private readonly dependencies:
      OkxWebSocketClientDependencies,
    handlers: OkxWebSocketMessageHandlers = {},
  ) {
    validateScope(scope);
    validateDependencies(dependencies);

    this.handlers = Object.freeze({
      ...handlers,
    });
  }

  public connect(): void {
    if (
      this.state !== "idle" &&
      this.state !== "closed" &&
      this.state !== "failed"
    ) {
      throw new OkxWebSocketClientError(
        `Cannot connect OKX WebSocket client from state "${this.state}".`,
      );
    }

    const url = resolveScopeUrl(
      this.scope,
      this.dependencies.endpoints,
    );

    const descriptor =
      createOkxWebSocketConnectionDescriptor({
        scope: this.scope,
        url,
        authenticated: false,
      });

    this.connection =
      this.dependencies.transport.connect(
        descriptor.scope,
        descriptor.url,
      );

    this.state = "connecting";
    this.authenticated = false;
    this.lastError = undefined;
    this.lastClose = undefined;

    this.attachConnectionListeners(
      this.connection,
    );
  }

  public disconnect(
    code = 1000,
    reason = "Normal closure",
  ): void {
    const connection =
      this.requireConnection();

    this.state = "closing";

    connection.close(code, reason);
  }

  public subscribe(
    argumentsList:
      readonly OkxWebSocketChannelArgument[],
    requestId?: string,
  ): string {
    this.assertReadyForSubscriptions();

    const id =
      requestId === undefined
        ? requireNonEmptyString(
            this.dependencies
              .requestIdGenerator.nextId(),
            "generated requestId",
          )
        : requireNonEmptyString(
            requestId,
            "requestId",
          );

    const request =
      createOkxWebSocketSubscriptionRequest({
        operation: "subscribe",
        arguments: argumentsList,
        requestId: id,
      });

    this.sendRequest(request);

    for (const argument of request.args) {
      const key =
        createSubscriptionKey(argument);

      this.subscriptions.set(
        key,
        Object.freeze({
          key,
          argument,
        }),
      );
    }

    return id;
  }

  public unsubscribe(
    argumentsList:
      readonly OkxWebSocketChannelArgument[],
    requestId?: string,
  ): string {
    this.assertReadyForSubscriptions();

    const id =
      requestId === undefined
        ? requireNonEmptyString(
            this.dependencies
              .requestIdGenerator.nextId(),
            "generated requestId",
          )
        : requireNonEmptyString(
            requestId,
            "requestId",
          );

    const request =
      createOkxWebSocketSubscriptionRequest({
        operation: "unsubscribe",
        arguments: argumentsList,
        requestId: id,
      });

    this.sendRequest(request);

    for (const argument of request.args) {
      this.subscriptions.delete(
        createSubscriptionKey(argument),
      );
    }

    return id;
  }

  public sendRequest(
    request: OkxWebSocketClientRequest,
  ): void {
    const connection =
      this.requireConnection();

    if (
      connection.getReadyState() !== "open"
    ) {
      throw new OkxWebSocketClientError(
        "Cannot send an OKX WebSocket request unless the connection is open.",
      );
    }

    connection.send(
      serializeOkxWebSocketRequest(request),
    );
  }

  public getState():
    OkxWebSocketClientState {
    return this.state;
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public getSubscriptions():
    readonly OkxWebSocketSubscription[] {
    return Object.freeze(
      Array.from(this.subscriptions.values()),
    );
  }

  public getConnection():
    OkxWebSocketConnection | undefined {
    return this.connection;
  }

  public getSnapshot():
    OkxWebSocketClientSnapshot {
    return Object.freeze({
      scope: this.scope,
      state: this.state,
      readyState:
        this.connection?.getReadyState() ??
        "idle",
      authenticated: this.authenticated,
      subscriptionCount:
        this.subscriptions.size,
      ...(this.lastError !== undefined
        ? { lastError: this.lastError }
        : {}),
      ...(this.lastClose !== undefined
        ? { lastClose: this.lastClose }
        : {}),
    });
  }

  private attachConnectionListeners(
    connection: OkxWebSocketConnection,
  ): void {
    connection.addEventListener(
      "open",
      () => {
        this.handleOpen();
      },
    );

    connection.addEventListener(
      "message",
      (event) => {
        this.handleMessage(event);
      },
    );

    connection.addEventListener(
      "error",
      (event) => {
        this.handleError(event);
      },
    );

    connection.addEventListener(
      "close",
      (event) => {
        this.handleClose(event);
      },
    );
  }

  private handleOpen(): void {
    this.state = "connected";

    if (
      this.scope === "private" ||
      this.scope === "business"
    ) {
      this.state = "authenticating";

      const authenticatedLogin =
        authenticateOkxWebSocketLogin({
          configuration:
            this.dependencies.configuration,
          clock: this.dependencies.clock,
        });

      this.sendRequest(
        authenticatedLogin.request,
      );
    }
  }

  private handleMessage(
    event: OkxWebSocketMessageEvent,
  ): void {
    this.handlers.onRawMessage?.(
      event.data,
    );

    let parsed: unknown;

    try {
      parsed = parseOkxWebSocketMessage(
        event.data,
      );
    } catch (error: unknown) {
      this.fail(error);
      return;
    }

    if (
      isOkxWebSocketErrorMessage(parsed)
    ) {
      this.fail(
        new OkxWebSocketClientError(
          `OKX WebSocket error ${parsed.code}: ${parsed.msg}`,
        ),
      );

      this.handlers.onEvent?.(parsed);
      return;
    }

    if (
      isOkxWebSocketNoticeMessage(parsed)
    ) {
      this.handlers.onEvent?.(parsed);
      return;
    }

    if (
      isOkxWebSocketEventMessage(parsed)
    ) {
      this.handleEventMessage(parsed);
      this.handlers.onEvent?.(parsed);
      return;
    }

    if (
      isOkxWebSocketOperationResponse(
        parsed,
      )
    ) {
      this.handlers.onOperationResponse?.(
        parsed,
      );
      return;
    }

    if (
      isOkxWebSocketPushMessage(parsed)
    ) {
      this.handlers.onPush?.(parsed);
      return;
    }

    this.fail(
      new OkxWebSocketClientError(
        "Received an unsupported OKX WebSocket message.",
      ),
    );
  }

  private handleEventMessage(
    message: OkxWebSocketEventMessage,
  ): void {
    if (
      message.event === "login"
    ) {
      if (message.code === "0") {
        this.authenticated = true;
        this.state = "authenticated";
        return;
      }

      this.fail(
        new OkxWebSocketClientError(
          `OKX WebSocket login failed with code "${message.code ?? "unknown"}": ${message.msg ?? "Unknown error"}`,
        ),
      );
    }
  }

  private handleError(
    event: OkxWebSocketErrorEvent,
  ): void {
    this.fail(event.error);
  }

  private handleClose(
    event: OkxWebSocketCloseEvent,
  ): void {
    this.lastClose = event;
    this.authenticated = false;

    this.state =
      this.state === "failed"
        ? "failed"
        : "closed";

    this.handlers.onClose?.(event);
  }

  private fail(error: unknown): void {
    this.lastError = error;
    this.state = "failed";
    this.handlers.onError?.(error);
  }

  private assertReadyForSubscriptions(): void {
    const readyState =
      this.connection?.getReadyState();

    if (readyState !== "open") {
      throw new OkxWebSocketClientError(
        "OKX WebSocket connection must be open before subscribing.",
      );
    }

    if (
      this.scope !== "public" &&
      !this.authenticated
    ) {
      throw new OkxWebSocketClientError(
        "Private and business OKX WebSocket clients must authenticate before subscribing.",
      );
    }
  }

  private requireConnection():
    OkxWebSocketConnection {
    if (!this.connection) {
      throw new OkxWebSocketClientError(
        "OKX WebSocket connection has not been created.",
      );
    }

    return this.connection;
  }
}

export function createDeterministicOkxWebSocketRequestIdGenerator(
  ids: readonly string[],
): OkxWebSocketRequestIdGenerator {
  if (!Array.isArray(ids)) {
    throw new OkxWebSocketClientError(
      "ids must be an array.",
    );
  }

  if (ids.length === 0) {
    throw new OkxWebSocketClientError(
      "ids must contain at least one request ID.",
    );
  }

  const normalizedIds = ids.map(
    (id, index) =>
      requireNonEmptyString(
        id,
        `ids[${index}]`,
      ),
  );

  let index = 0;

  return Object.freeze({
    nextId(): string {
      const currentIndex = Math.min(
        index,
        normalizedIds.length - 1,
      );

      const id =
        normalizedIds[currentIndex];

      index += 1;

      return id;
    },
  });
}

export function createSequentialOkxWebSocketRequestIdGenerator(
  prefix = "okx-ws-request",
  startAt = 1,
): OkxWebSocketRequestIdGenerator {
  const normalizedPrefix =
    requireNonEmptyString(
      prefix,
      "prefix",
    );

  if (
    !Number.isInteger(startAt) ||
    startAt < 0
  ) {
    throw new OkxWebSocketClientError(
      "startAt must be a non-negative integer.",
    );
  }

  let sequence = startAt;

  return Object.freeze({
    nextId(): string {
      const id =
        `${normalizedPrefix}-${sequence}`;

      sequence += 1;

      return id;
    },
  });
}

export function createSubscriptionKey(
  argument: OkxWebSocketChannelArgument,
): string {
  const entries = Object.entries(argument)
    .filter(
      (
        entry,
      ): entry is [string, string] =>
        typeof entry[1] === "string",
    )
    .sort(([left], [right]) =>
      left.localeCompare(right),
    );

  return entries
    .map(
      ([key, value]) =>
        `${key}=${value}`,
    )
    .join("&");
}

function resolveScopeUrl(
  scope: OkxWebSocketScope,
  endpoints: OkxWebSocketEndpointConfiguration,
): string {
  switch (scope) {
    case "public":
      return endpoints.publicUrl;
    case "private":
      return endpoints.privateUrl;
    case "business":
      return endpoints.businessUrl;
  }
}

function validateDependencies(
  dependencies: OkxWebSocketClientDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw new OkxWebSocketClientError(
      "dependencies must be an object.",
    );
  }

  if (
    typeof dependencies.configuration !==
      "object" ||
    dependencies.configuration === null
  ) {
    throw new OkxWebSocketClientError(
      "configuration is required.",
    );
  }

  validateEndpoints(dependencies.endpoints);

  if (
    typeof dependencies.transport !==
      "object" ||
    dependencies.transport === null ||
    typeof dependencies.transport.connect !==
      "function"
  ) {
    throw new OkxWebSocketClientError(
      "transport must implement OkxWebSocketTransport.",
    );
  }

  if (
    typeof dependencies.clock !== "object" ||
    dependencies.clock === null ||
    typeof dependencies.clock.now !==
      "function"
  ) {
    throw new OkxWebSocketClientError(
      "clock must implement OkxClock.",
    );
  }

  if (
    typeof dependencies.requestIdGenerator !==
      "object" ||
    dependencies.requestIdGenerator === null ||
    typeof dependencies.requestIdGenerator
      .nextId !== "function"
  ) {
    throw new OkxWebSocketClientError(
      "requestIdGenerator must implement OkxWebSocketRequestIdGenerator.",
    );
  }
}

function validateEndpoints(
  endpoints: OkxWebSocketEndpointConfiguration,
): void {
  if (
    typeof endpoints !== "object" ||
    endpoints === null
  ) {
    throw new OkxWebSocketClientError(
      "endpoints are required.",
    );
  }

  requireNonEmptyString(
    endpoints.publicUrl,
    "endpoints.publicUrl",
  );

  requireNonEmptyString(
    endpoints.privateUrl,
    "endpoints.privateUrl",
  );

  requireNonEmptyString(
    endpoints.businessUrl,
    "endpoints.businessUrl",
  );
}

function validateScope(
  scope: OkxWebSocketScope,
): void {
  if (
    scope !== "public" &&
    scope !== "private" &&
    scope !== "business"
  ) {
    throw new OkxWebSocketClientError(
      `Unsupported OKX WebSocket scope: "${String(scope)}".`,
    );
  }
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxWebSocketClientError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxWebSocketClientError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}