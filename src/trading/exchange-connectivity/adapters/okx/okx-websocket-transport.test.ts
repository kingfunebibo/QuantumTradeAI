import assert from "node:assert/strict";

import {
  DefaultOkxWebSocketTransport,
  DeterministicOkxMockWebSocketConnection,
  DeterministicOkxMockWebSocketTransport,
  NativeOkxWebSocketConnection,
  OkxWebSocketTransportError,
  mapNativeReadyState,
  type OkxNativeWebSocket,
  type OkxWebSocketCloseEvent,
  type OkxWebSocketErrorEvent,
  type OkxWebSocketFactory,
  type OkxWebSocketMessageEvent,
  type OkxWebSocketOpenEvent,
} from "./okx-websocket-transport";

class FakeNativeWebSocket implements OkxNativeWebSocket {
  public readyState = 0;

  public readonly sentMessages: string[] = [];

  public readonly closeCalls: Array<{
    readonly code?: number;
    readonly reason?: string;
  }> = [];

  private readonly listeners = {
    open: new Set<(event: unknown) => void>(),
    message: new Set<
      (event: { readonly data: unknown }) => void
    >(),
    error: new Set<(event: unknown) => void>(),
    close: new Set<
      (
        event: {
          readonly code?: unknown;
          readonly reason?: unknown;
          readonly wasClean?: unknown;
        },
      ) => void
    >(),
  };

  public send(message: string): void {
    this.sentMessages.push(message);
  }

  public close(
    code?: number,
    reason?: string,
  ): void {
    this.closeCalls.push({
      ...(code !== undefined ? { code } : {}),
      ...(reason !== undefined ? { reason } : {}),
    });

    this.readyState = 2;
  }

  public addEventListener(
    event: "open",
    listener: (event: unknown) => void,
  ): void;

  public addEventListener(
    event: "message",
    listener: (
      event: { readonly data: unknown },
    ) => void,
  ): void;

  public addEventListener(
    event: "error",
    listener: (event: unknown) => void,
  ): void;

  public addEventListener(
    event: "close",
    listener: (
      event: {
        readonly code?: unknown;
        readonly reason?: unknown;
        readonly wasClean?: unknown;
      },
    ) => void,
  ): void;

  public addEventListener(
    event: "open" | "message" | "error" | "close",
    listener:
      | ((event: unknown) => void)
      | ((
          event: { readonly data: unknown },
        ) => void)
      | ((
          event: {
            readonly code?: unknown;
            readonly reason?: unknown;
            readonly wasClean?: unknown;
          },
        ) => void),
  ): void {
    this.listeners[event].add(listener as never);
  }

  public removeEventListener(
    event: "open" | "message" | "error" | "close",
    listener: (event: never) => void,
  ): void {
    this.listeners[event].delete(listener as never);
  }

  public emitOpen(): void {
    this.readyState = 1;

    for (const listener of this.listeners.open) {
      listener({});
    }
  }

  public emitMessage(data: unknown): void {
    for (const listener of this.listeners.message) {
      listener({ data });
    }
  }

  public emitError(error: unknown): void {
    for (const listener of this.listeners.error) {
      listener(error);
    }
  }

  public emitClose(
    code: unknown,
    reason: unknown,
    wasClean: unknown,
  ): void {
    this.readyState = 3;

    for (const listener of this.listeners.close) {
      listener({
        code,
        reason,
        wasClean,
      });
    }
  }
}

function testReadyStateMapping(): void {
  assert.equal(mapNativeReadyState(0), "connecting");
  assert.equal(mapNativeReadyState(1), "open");
  assert.equal(mapNativeReadyState(2), "closing");
  assert.equal(mapNativeReadyState(3), "closed");

  assert.throws(
    () => mapNativeReadyState(4),
    /Unsupported native WebSocket readyState: 4/,
  );
}

function testDefaultTransportConnection(): void {
  const socket = new FakeNativeWebSocket();

  const factory: OkxWebSocketFactory = {
    create(url: string): OkxNativeWebSocket {
      assert.equal(
        url,
        "wss://ws.okx.com:8443/ws/v5/public",
      );

      return socket;
    },
  };

  const transport =
    new DefaultOkxWebSocketTransport(factory);

  const connection = transport.connect(
    "public",
    "wss://ws.okx.com:8443/ws/v5/public",
  );

  assert.equal(connection.scope, "public");

  assert.equal(
    connection.url,
    "wss://ws.okx.com:8443/ws/v5/public",
  );

  assert.equal(
    connection.getReadyState(),
    "connecting",
  );
}

function testInvalidTransportDependencies(): void {
  assert.throws(
    () =>
      new DefaultOkxWebSocketTransport(
        {} as OkxWebSocketFactory,
      ),
    /factory must implement OkxWebSocketFactory/,
  );

  const transport =
    new DefaultOkxWebSocketTransport({
      create(): OkxNativeWebSocket {
        return new FakeNativeWebSocket();
      },
    });

  assert.throws(
    () =>
      transport.connect(
        "invalid" as never,
        "wss://ws.okx.com:8443/ws/v5/public",
      ),
    /Unsupported OKX WebSocket scope/,
  );

  assert.throws(
    () =>
      transport.connect(
        "public",
        "https://www.okx.com",
      ),
    /url must use the WS or WSS protocol/,
  );
}

function testNativeConnectionLifecycleEvents(): void {
  const socket = new FakeNativeWebSocket();

  const connection =
    new NativeOkxWebSocketConnection(
      "private",
      "wss://ws.okx.com:8443/ws/v5/private",
      socket,
    );

  const openEvents: OkxWebSocketOpenEvent[] = [];
  const messageEvents: OkxWebSocketMessageEvent[] = [];
  const errorEvents: OkxWebSocketErrorEvent[] = [];
  const closeEvents: OkxWebSocketCloseEvent[] = [];

  connection.addEventListener(
    "open",
    (event) => {
      openEvents.push(event);
    },
  );

  connection.addEventListener(
    "message",
    (event) => {
      messageEvents.push(event);
    },
  );

  connection.addEventListener(
    "error",
    (event) => {
      errorEvents.push(event);
    },
  );

  connection.addEventListener(
    "close",
    (event) => {
      closeEvents.push(event);
    },
  );

  const sourceError = new Error("socket failure");

  socket.emitOpen();
  socket.emitMessage('{"event":"login"}');
  socket.emitError(sourceError);
  socket.emitClose(
    1000,
    "Normal closure",
    true,
  );

  assert.deepEqual(openEvents, [
    {
      type: "open",
    },
  ]);

  assert.deepEqual(messageEvents, [
    {
      type: "message",
      data: '{"event":"login"}',
    },
  ]);

  assert.equal(errorEvents.length, 1);
  assert.equal(errorEvents[0]?.type, "error");
  assert.equal(errorEvents[0]?.error, sourceError);

  assert.deepEqual(closeEvents, [
    {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    },
  ]);

  assert.equal(
    Object.isFrozen(openEvents[0]),
    true,
  );

  assert.equal(
    Object.isFrozen(messageEvents[0]),
    true,
  );

  assert.equal(
    Object.isFrozen(errorEvents[0]),
    true,
  );

  assert.equal(
    Object.isFrozen(closeEvents[0]),
    true,
  );
}

function testNativeConnectionListenerRemoval(): void {
  const socket = new FakeNativeWebSocket();

  const connection =
    new NativeOkxWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
      socket,
    );

  let calls = 0;

  const listener = (): void => {
    calls += 1;
  };

  connection.addEventListener(
    "open",
    listener,
  );

  socket.emitOpen();

  connection.removeEventListener(
    "open",
    listener,
  );

  socket.emitOpen();

  assert.equal(calls, 1);
}

function testNativeConnectionSend(): void {
  const socket = new FakeNativeWebSocket();

  const connection =
    new NativeOkxWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
      socket,
    );

  assert.throws(
    () => connection.send("ping"),
    /Cannot send an OKX WebSocket message unless the connection is open/,
  );

  socket.emitOpen();

  connection.send(" ping ");

  assert.deepEqual(socket.sentMessages, [
    "ping",
  ]);

  assert.throws(
    () => connection.send(" "),
    /message must not be empty/,
  );
}

function testNativeConnectionClose(): void {
  const socket = new FakeNativeWebSocket();

  const connection =
    new NativeOkxWebSocketConnection(
      "business",
      "wss://ws.okx.com:8443/ws/v5/business",
      socket,
    );

  connection.close(
    1000,
    " Normal closure ",
  );

  assert.deepEqual(socket.closeCalls, [
    {
      code: 1000,
      reason: "Normal closure",
    },
  ]);

  assert.throws(
    () => connection.close(999),
    /WebSocket close code must be an integer between 1000 and 4999/,
  );

  assert.throws(
    () => connection.close(1000, " "),
    /reason must not be empty/,
  );
}

function testInvalidNativeMessageData(): void {
  const socket = new FakeNativeWebSocket();

  new NativeOkxWebSocketConnection(
    "public",
    "wss://ws.okx.com:8443/ws/v5/public",
    socket,
  );

  assert.throws(
    () => socket.emitMessage(new Uint8Array([1, 2])),
    /OKX WebSocket message data must be a string/,
  );
}

function testNativeCloseDefaults(): void {
  const socket = new FakeNativeWebSocket();

  const connection =
    new NativeOkxWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
      socket,
    );

  const events: OkxWebSocketCloseEvent[] = [];

  connection.addEventListener(
    "close",
    (event) => {
      events.push(event);
    },
  );

  socket.emitClose(
    undefined,
    undefined,
    false,
  );

  assert.deepEqual(events, [
    {
      type: "close",
      code: 1000,
      reason: "No reason provided",
      wasClean: false,
    },
  ]);
}

function testMockConnectionLifecycle(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  assert.equal(
    connection.getReadyState(),
    "idle",
  );

  connection.connect();

  assert.equal(
    connection.getReadyState(),
    "connecting",
  );

  let openCount = 0;

  connection.addEventListener(
    "open",
    () => {
      openCount += 1;
    },
  );

  connection.open();

  assert.equal(
    connection.getReadyState(),
    "open",
  );

  assert.equal(openCount, 1);
}

function testMockConnectionMessages(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "private",
      "wss://ws.okx.com:8443/ws/v5/private",
    );

  connection.open();

  connection.send(
    '{"op":"login"}',
  );

  connection.send(
    '{"op":"subscribe"}',
  );

  assert.deepEqual(
    connection.getSentMessages(),
    [
      '{"op":"login"}',
      '{"op":"subscribe"}',
    ],
  );

  assert.equal(
    Object.isFrozen(
      connection.getSentMessages(),
    ),
    true,
  );
}

function testMockConnectionEvents(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "business",
      "wss://ws.okx.com:8443/ws/v5/business",
    );

  const messages: string[] = [];
  const errors: unknown[] = [];
  const closes: OkxWebSocketCloseEvent[] = [];

  connection.addEventListener(
    "message",
    (event) => {
      messages.push(event.data);
    },
  );

  connection.addEventListener(
    "error",
    (event) => {
      errors.push(event.error);
    },
  );

  connection.addEventListener(
    "close",
    (event) => {
      closes.push(event);
    },
  );

  const sourceError = new Error("failure");

  connection.emitMessage(
    '{"arg":{"channel":"tickers"},"data":[]}',
  );

  connection.emitError(sourceError);

  connection.emitClose({
    code: 1001,
    reason: "Going away",
    wasClean: false,
  });

  assert.deepEqual(messages, [
    '{"arg":{"channel":"tickers"},"data":[]}',
  ]);

  assert.deepEqual(errors, [
    sourceError,
  ]);

  assert.deepEqual(closes, [
    {
      type: "close",
      code: 1001,
      reason: "Going away",
      wasClean: false,
    },
  ]);

  assert.equal(
    connection.getReadyState(),
    "closed",
  );
}

function testMockConnectionClose(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  const closeEvents: OkxWebSocketCloseEvent[] = [];

  connection.addEventListener(
    "close",
    (event) => {
      closeEvents.push(event);
    },
  );

  connection.open();
  connection.close();

  assert.deepEqual(closeEvents, [
    {
      type: "close",
      code: 1000,
      reason: "Normal closure",
      wasClean: true,
    },
  ]);

  assert.equal(
    connection.getReadyState(),
    "closed",
  );
}

function testMockSendValidation(): void {
  const connection =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  assert.throws(
    () => connection.send("ping"),
    /Cannot send an OKX WebSocket message unless the connection is open/,
  );

  connection.open();

  assert.throws(
    () => connection.send(" "),
    /message must not be empty/,
  );
}

function testMockTransportTracking(): void {
  const transport =
    new DeterministicOkxMockWebSocketTransport();

  const publicConnection =
    transport.connect(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  const privateConnection =
    transport.connect(
      "private",
      "wss://ws.okx.com:8443/ws/v5/private",
    );

  assert.equal(
    publicConnection.getReadyState(),
    "connecting",
  );

  assert.equal(
    privateConnection.getReadyState(),
    "connecting",
  );

  const connections =
    transport.getConnections();

  assert.deepEqual(connections, [
    publicConnection,
    privateConnection,
  ]);

  assert.equal(
    Object.isFrozen(connections),
    true,
  );
}

function testTransportErrorIdentity(): void {
  const error = new OkxWebSocketTransportError(
    "Transport failed.",
  );

  assert.equal(
    error.name,
    "OkxWebSocketTransportError",
  );

  assert.equal(
    error.code,
    "OKX_WEBSOCKET_TRANSPORT_ERROR",
  );

  assert.equal(
    error.message,
    "Transport failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(
    error instanceof OkxWebSocketTransportError,
  );
}

function testDeterministicMockMessages(): void {
  const first =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  const second =
    new DeterministicOkxMockWebSocketConnection(
      "public",
      "wss://ws.okx.com:8443/ws/v5/public",
    );

  first.open();
  second.open();

  first.send("message-1");
  second.send("message-1");

  assert.deepEqual(
    first.getSentMessages(),
    second.getSentMessages(),
  );

  assert.notEqual(
    first.getSentMessages(),
    second.getSentMessages(),
  );
}

function runOkxWebSocketTransportTests(): void {
  testReadyStateMapping();
  testDefaultTransportConnection();
  testInvalidTransportDependencies();
  testNativeConnectionLifecycleEvents();
  testNativeConnectionListenerRemoval();
  testNativeConnectionSend();
  testNativeConnectionClose();
  testInvalidNativeMessageData();
  testNativeCloseDefaults();
  testMockConnectionLifecycle();
  testMockConnectionMessages();
  testMockConnectionEvents();
  testMockConnectionClose();
  testMockSendValidation();
  testMockTransportTracking();
  testTransportErrorIdentity();
  testDeterministicMockMessages();

  console.log(
    "All OKX WebSocket transport tests passed successfully.",
  );
}

runOkxWebSocketTransportTests();