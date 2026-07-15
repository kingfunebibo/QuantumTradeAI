/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Full deterministic SDK integration tests.
 *
 * Run with:
 * npx tsx src/trading/exchange-connector-sdk.integration.test.ts
 */

import assert from "node:assert/strict";

import {
  BaseExchangeRestClient,
  BaseExchangeWebSocketClient,
  DeterministicMockRestTransport,
  DeterministicMockWebSocketAuthenticator,
  DeterministicMockWebSocketCodec,
  DeterministicMockWebSocketTransport,
  ExchangeConnectivityError,
  ExchangeRestError,
  ExchangeWebSocketError,
  normalizeExchangeConnectivityError,
  normalizeExchangeRemoteError,
  type BaseExchangeRestClientClock,
  type BaseExchangeWebSocketClock,
  type BaseExchangeRestClientConfig,
  type BaseExchangeWebSocketClientConfig,
  type ExchangeConnectorOperationContext,
  type ExchangeRestRequest,
  type ExchangeRestTransportConfig,
  type ExchangeWebSocketConnectRequest,
  type ExchangeWebSocketSubscriptionRequest,
  type ExchangeWebSocketTransportConfig,
} from "./exchange-connectivity";

const BASE_TIMESTAMP = 1_700_000_000_000;

class ManualSdkClock
  implements BaseExchangeRestClientClock, BaseExchangeWebSocketClock
{
  public constructor(private currentTime: number) {}

  public now(): number {
    return this.currentTime;
  }

  public advance(milliseconds: number): void {
    this.currentTime += milliseconds;
  }

  public set(timestamp: number): void {
    this.currentTime = timestamp;
  }
}

function createOperationContext(
  operationId: string,
): ExchangeConnectorOperationContext {
  return Object.freeze({
    operationId,
    correlationId: `correlation-${operationId}`,
    createdAt: BASE_TIMESTAMP,
    deadlineAt: BASE_TIMESTAMP + 60_000,
    metadata: Object.freeze({
      source: "sdk-integration-test",
    }),
  });
}

function createRestTransportConfig(): ExchangeRestTransportConfig {
  return Object.freeze({
    enabled: true,
    endpoints: Object.freeze([
      Object.freeze({
        type: "PUBLIC",
        baseUrl: "https://api.mock.exchange",
        apiVersion: "v1",
        authenticated: false,
        defaultHeaders: Object.freeze({
          "X-SDK-TEST": "true",
        }),
      }),
      Object.freeze({
        type: "PRIVATE",
        baseUrl: "https://private.mock.exchange",
        apiVersion: "v1",
        authenticated: true,
      }),
    ]),
    userAgent: "QuantumTradeAI-SDK-Test/1.0",
    parseJsonResponses: true,
    maximumResponseSizeBytes: 1_000_000,
  });
}

function createRestClientConfig(): BaseExchangeRestClientConfig {
  return Object.freeze({
    transport: createRestTransportConfig(),
    defaultRequestTimeoutMs: 5_000,
    throwOnHttpError: true,
  });
}

function createWebSocketTransportConfig():
  ExchangeWebSocketTransportConfig {
  return Object.freeze({
    enabled: true,
    endpoints: Object.freeze([
      Object.freeze({
        type: "PUBLIC",
        url: "wss://stream.mock.exchange/public",
        authenticated: false,
      }),
      Object.freeze({
        type: "PRIVATE",
        url: "wss://stream.mock.exchange/private",
        authenticated: true,
      }),
    ]),
    reconnect: Object.freeze({
      enabled: true,
      maximumAttempts: 3,
      initialDelayMs: 1_000,
      maximumDelayMs: 8_000,
      backoffMultiplier: 2,
      jitterRatio: 0,
      stableConnectionThresholdMs: 60_000,
    }),
    heartbeat: Object.freeze({
      enabled: true,
      intervalMs: 30_000,
      responseTimeoutMs: 5_000,
      pingPayload: "ping",
      expectedPongPayload: "pong",
    }),
    maximumMessageSizeBytes: 1_000_000,
    maximumBufferedMessages: 1_000,
  });
}

function createWebSocketClientConfig():
  BaseExchangeWebSocketClientConfig {
  return Object.freeze({
    transport: createWebSocketTransportConfig(),
    readyOnOpen: true,
    restoreSubscriptionsOnReconnect: true,
  });
}

function createRestRequest(
  requestId: string,
  path: string,
): ExchangeRestRequest {
  return Object.freeze({
    requestId,
    operation: "market.getTicker",
    endpointType: "PUBLIC",
    method: "GET",
    path,
    query: Object.freeze({
      symbol: "BTCUSDT",
    }),
    responseType: "JSON",
    authentication: "NONE",
    retryMode: "SAFE",
    priority: "NORMAL",
    timeoutMs: 5_000,
    context: createOperationContext(
      `rest-${requestId}`,
    ),
  });
}

function createWebSocketConnectRequest(
  authenticated: boolean,
): ExchangeWebSocketConnectRequest {
  return Object.freeze({
    connectionId: authenticated
      ? "private-connection"
      : "public-connection",
    endpointType: authenticated
      ? "PRIVATE"
      : "PUBLIC",
    authenticated,
    timeoutMs: 10_000,
    context: createOperationContext(
      authenticated
        ? "ws-private-connect"
        : "ws-public-connect",
    ),
  });
}

function createSubscriptionRequest():
  ExchangeWebSocketSubscriptionRequest {
  return Object.freeze({
    subscriptionId: "ticker-subscription",
    channel: "tickers",
    symbols: Object.freeze([
      "BTCUSDT",
      "ETHUSDT",
    ]),
    authenticated: false,
    context: createOperationContext(
      "ws-subscribe",
    ),
  });
}

async function testRestIntegration(): Promise<void> {
  const clock = new ManualSdkClock(
    BASE_TIMESTAMP,
  );

  const transport =
    new DeterministicMockRestTransport(
      clock,
      {
        initializeDelayMs: 10,
        closeDelayMs: 5,
        scripts: [
          {
            type: "RESPONSE",
            matcher: {
              method: "GET",
              url:
                "https://api.mock.exchange/v1/ticker?symbol=BTCUSDT",
            },
            delayMs: 25,
            response: {
              statusCode: 200,
              statusText: "OK",
              headers: {
                "content-type":
                  "application/json",
                "x-exchange-request-id":
                  "exchange-request-1",
              },
              data: {
                symbol: "BTCUSDT",
                price: "50000.00",
              },
              exchangeRequestId:
                "exchange-request-1",
            },
          },
        ],
      },
    );

  const client = new BaseExchangeRestClient(
    createRestClientConfig(),
    {
      clock,
      transport,
    },
  );

  const initialization =
    await client.initialize();

  assert.equal(
    initialization.currentState,
    "READY",
  );

  const response = await client.execute<{
    readonly symbol: string;
    readonly price: string;
  }>(
    createRestRequest(
      "ticker-request",
      "/ticker",
    ),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.data.symbol, "BTCUSDT");
  assert.equal(response.data.price, "50000.00");
  assert.equal(response.timing.durationMs, 25);

  const history = transport.getHistory();

  assert.equal(history.length, 1);
  assert.equal(history[0].outcome, "RESPONSE");
  assert.equal(history[0].durationMs, 25);

  const metrics = client.getMetrics();

  assert.equal(metrics.totalRequests, 1);
  assert.equal(metrics.successfulRequests, 1);
  assert.equal(metrics.failedRequests, 0);

  const closeResult = await client.close({
    graceful: true,
    timeoutMs: 5_000,
    reason: "REST integration complete.",
  });

  assert.equal(
    closeResult.currentState,
    "CLOSED",
  );
  assert.equal(transport.getCloseCallCount(), 1);
}

async function testRestFailureNormalization(): Promise<void> {
  const clock = new ManualSdkClock(
    BASE_TIMESTAMP,
  );

  const transport =
    new DeterministicMockRestTransport(
      clock,
      {
        scripts: [
          {
            type: "ERROR",
            matcher: {
              requestId: "failing-request",
            },
            delayMs: 15,
            error: new Error(
              "Network connection reset.",
            ),
          },
        ],
      },
    );

  const client = new BaseExchangeRestClient(
    createRestClientConfig(),
    {
      clock,
      transport,
    },
  );

  await client.initialize();

  let thrown: unknown;

  try {
    await client.execute(
      createRestRequest(
        "failing-request",
        "/failure",
      ),
    );
  } catch (error: unknown) {
    thrown = error;
  }

  assert.ok(thrown instanceof ExchangeRestError);

  const normalized =
    normalizeExchangeConnectivityError(
      thrown,
      {
        connectorId: "mock-exchange",
      },
    );

  assert.ok(
    normalized instanceof
      ExchangeConnectivityError,
  );

  assert.equal(normalized.source, "REST");
  assert.equal(normalized.category, "NETWORK");
  assert.equal(normalized.retryable, true);
  assert.equal(
    normalized.details.connectorId,
    "mock-exchange",
  );
}

async function testWebSocketIntegration(): Promise<void> {
  const clock = new ManualSdkClock(
    BASE_TIMESTAMP,
  );

  const transport =
    new DeterministicMockWebSocketTransport(
      clock,
      {
        connectDelayMs: 10,
        sendDelayMs: 5,
        closeDelayMs: 5,
        destroyDelayMs: 5,
        bufferedAmountAfterSend: 0,
      },
    );

  const codec =
    new DeterministicMockWebSocketCodec(
      clock,
      {
        encodeDelayMs: 2,
        decodeDelayMs: 3,
      },
    );

  const client =
    new BaseExchangeWebSocketClient(
      createWebSocketClientConfig(),
      {
        clock,
        transport,
        codec,
      },
    );

  const messages: unknown[] = [];

  client.onMessage((message) => {
    messages.push(message);
  });

  const connection = await client.connect(
    createWebSocketConnectRequest(false),
  );

  assert.equal(
    connection.currentState,
    "READY",
  );
  assert.equal(
    transport.getConnectCallCount(),
    1,
  );

  const subscription =
    await client.subscribe(
      createSubscriptionRequest(),
    );

  assert.equal(
    subscription.currentState,
    "ACTIVE",
  );

  assert.equal(
    client.getMetrics().activeSubscriptions,
    1,
  );

  clock.advance(10);

  await transport.emitMessage(
    JSON.stringify({
      messageId: "ticker-update-1",
      type: "DATA",
      encoding: "JSON",
      channel: "tickers",
      symbol: "BTCUSDT",
      payload: {
        price: "50010.00",
      },
    }),
  );

  assert.equal(messages.length, 1);

  const wsMetrics = client.getMetrics();

  assert.equal(
    wsMetrics.totalMessagesReceived,
    1,
  );
  assert.equal(
    wsMetrics.totalMessagesSent,
    1,
  );

  const sendHistory =
    transport.getSendHistory();

  assert.equal(sendHistory.length, 1);
  assert.equal(sendHistory[0].accepted, true);

  const codecHistory = codec.getHistory();

  assert.ok(
    codecHistory.some(
      (entry) =>
        entry.operation ===
        "CREATE_SUBSCRIPTION",
    ),
  );

  assert.ok(
    codecHistory.some(
      (entry) =>
        entry.operation === "ENCODE",
    ),
  );

  assert.ok(
    codecHistory.some(
      (entry) =>
        entry.operation === "DECODE",
    ),
  );

  const unsubscribe =
    await client.unsubscribe(
      "ticker-subscription",
      createOperationContext(
        "ws-unsubscribe",
      ),
    );

  assert.equal(
    unsubscribe.currentState,
    "INACTIVE",
  );

  const disconnect =
    await client.disconnect({
      graceful: true,
      timeoutMs: 5_000,
      reason:
        "WebSocket integration complete.",
    });

  assert.equal(
    disconnect.currentState,
    "DISCONNECTED",
  );

  const destroyed =
    await client.destroy({
      reason:
        "WebSocket test resources released.",
    });

  assert.equal(
    destroyed.currentState,
    "DESTROYED",
  );
}

async function testAuthenticatedWebSocketIntegration():
  Promise<void> {
  const clock = new ManualSdkClock(
    BASE_TIMESTAMP,
  );

  const transport =
    new DeterministicMockWebSocketTransport(
      clock,
      {
        connectDelayMs: 10,
      },
    );

  const codec =
    new DeterministicMockWebSocketCodec(
      clock,
    );

  const authenticator =
    new DeterministicMockWebSocketAuthenticator(
      clock,
      {
        delayMs: 7,
      },
    );

  const client =
    new BaseExchangeWebSocketClient(
      createWebSocketClientConfig(),
      {
        clock,
        transport,
        codec,
        authenticator,
      },
    );

  const result = await client.connect(
    createWebSocketConnectRequest(true),
  );

  assert.equal(result.authenticated, true);
  assert.equal(
    result.currentState,
    "READY",
  );

  const history =
    authenticator.getHistory();

  assert.equal(history.length, 1);
  assert.equal(
    history[0].outcome,
    "AUTHENTICATED",
  );
  assert.equal(history[0].durationMs, 7);
}

async function testWebSocketFailureNormalization():
  Promise<void> {
  const clock = new ManualSdkClock(
    BASE_TIMESTAMP,
  );

  const transport =
    new DeterministicMockWebSocketTransport(
      clock,
      {
        connectFailure: new Error(
          "Network socket connection failed.",
        ),
      },
    );

  const codec =
    new DeterministicMockWebSocketCodec(
      clock,
    );

  const client =
    new BaseExchangeWebSocketClient(
      createWebSocketClientConfig(),
      {
        clock,
        transport,
        codec,
      },
    );

  let thrown: unknown;

  try {
    await client.connect(
      createWebSocketConnectRequest(false),
    );
  } catch (error: unknown) {
    thrown = error;
  }

  assert.ok(
    thrown instanceof ExchangeWebSocketError,
  );

  const normalized =
    normalizeExchangeConnectivityError(
      thrown,
      {
        connectorId: "mock-exchange",
      },
    );

  assert.equal(
    normalized.source,
    "WEBSOCKET",
  );

  assert.equal(
    normalized.category,
    "NETWORK",
  );

  assert.equal(normalized.retryable, true);
}

function testRemoteExchangeErrorNormalization(): void {
  const rateLimit =
    normalizeExchangeRemoteError(
      {
        source: "REST",
        statusCode: 429,
        code: "RATE_LIMIT_EXCEEDED",
        message:
          "Too many requests. Rate limit exceeded.",
        requestId: "remote-request-1",
        retryAfterMs: 1_000,
        occurredAt: BASE_TIMESTAMP,
      },
      {
        connectorId: "mock-exchange",
        operation: "orders.place",
      },
    );

  assert.equal(
    rateLimit.category,
    "RATE_LIMIT",
  );
  assert.equal(rateLimit.retryable, true);
  assert.equal(rateLimit.statusCode, 429);
  assert.equal(
    rateLimit.details.retryAfterMs,
    1_000,
  );

  const authentication =
    normalizeExchangeRemoteError({
      statusCode: 401,
      code: "INVALID_API_KEY",
      message: "Invalid API key.",
      occurredAt: BASE_TIMESTAMP,
    });

  assert.equal(
    authentication.category,
    "AUTHENTICATION",
  );
  assert.equal(
    authentication.retryable,
    false,
  );
}

async function runTests(): Promise<void> {
  await testRestIntegration();
  await testRestFailureNormalization();
  await testWebSocketIntegration();
  await testAuthenticatedWebSocketIntegration();
  await testWebSocketFailureNormalization();

  testRemoteExchangeErrorNormalization();

  console.log(
    "All exchange connector SDK integration tests passed successfully.",
  );
}

runTests().catch((error: unknown) => {
  console.error(
    "Exchange connector SDK integration tests failed.",
    error,
  );

  process.exitCode = 1;
});