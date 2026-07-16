import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from "axios";

import {
  BINANCE_CONNECTOR_ID,
  BINANCE_CONNECTOR_METADATA,
  BinanceConnector,
  BinanceConnectorConfigurationError,
  BinanceRequestSigner,
  BinanceRequestSigningError,
  BinanceRestApiError,
  BinanceRestClient,
  BinanceWebSocketClient,
  BinanceWebSocketValidationError,
  createBinanceAggregateTradeStreamName,
  createBinanceCanonicalQueryString,
  createBinanceConnectorConfiguration,
  createBinanceDepthStreamName,
  createBinanceHmacSha256Signature,
  createBinanceKlineStreamName,
  createBinanceTradeStreamName,
  normalizeBinanceSigningParameters,
  normalizeBinanceSymbol,
  verifyBinanceHmacSha256Signature,
  type BinanceWebSocketTransport,
  type BinanceWebSocketTransportFactory,
} from "./exchange-connectivity/adapters/binance";

interface MutableClock {
  now(): number;
  set(value: number): void;
  advance(milliseconds: number): void;
}

function createMutableClock(
  initialTime: number,
): MutableClock {
  let currentTime = initialTime;

  return {
    now(): number {
      return currentTime;
    },

    set(value: number): void {
      currentTime = value;
    },

    advance(milliseconds: number): void {
      currentTime += milliseconds;
    },
  };
}

interface RecordedHttpRequest {
  readonly method?: string;
  readonly url?: string;
  readonly headers?: unknown;
  readonly timeout?: number;
}

interface MockAxiosController {
  readonly instance: AxiosInstance;
  readonly requests: RecordedHttpRequest[];

  enqueueResponse<T>(
    response: {
      readonly status: number;
      readonly data: T;
      readonly headers?: Readonly<Record<string, string>>;
    },
  ): void;
}

function createMockAxiosController():
  MockAxiosController {
  const requests: RecordedHttpRequest[] = [];

  const queuedResponses: Array<{
    readonly status: number;
    readonly data: unknown;
    readonly headers: Readonly<
      Record<string, string>
    >;
  }> = [];

  const instance = {
    async request<T>(
      config: AxiosRequestConfig,
    ): Promise<AxiosResponse<T>> {
      requests.push({
        method: config.method,
        url: config.url,
        headers: config.headers,
        timeout: config.timeout,
      });

      const queuedResponse =
        queuedResponses.shift();

      if (queuedResponse === undefined) {
        throw new Error(
          "No deterministic Axios response was queued.",
        );
      }

      return {
        status: queuedResponse.status,
        statusText:
          queuedResponse.status >= 200 &&
          queuedResponse.status < 300
            ? "OK"
            : "ERROR",
        data: queuedResponse.data as T,
        headers: queuedResponse.headers,
        config: config as AxiosResponse<T>["config"],
      };
    },
  } as unknown as AxiosInstance;

  return {
    instance,
    requests,

    enqueueResponse<T>(
      response: {
        readonly status: number;
        readonly data: T;
        readonly headers?: Readonly<
          Record<string, string>
        >;
      },
    ): void {
      queuedResponses.push({
        status: response.status,
        data: response.data,
        headers:
          response.headers ?? {},
      });
    },
  };
}

class MockWebSocketTransport
  extends EventEmitter
  implements BinanceWebSocketTransport {
  public readyState = 0;

  public readonly sentMessages: string[] = [];

  public readonly closeCalls: Array<{
    readonly code?: number;
    readonly reason?: string;
  }> = [];

  public terminated = false;
  public pingCount = 0;

  public send(
    data: string,
    callback?: (error?: Error) => void,
  ): void {
    this.sentMessages.push(data);
    callback?.();
  }

  public close(
    code?: number,
    reason?: string,
  ): void {
    this.closeCalls.push({
      code,
      reason,
    });

    this.readyState = 3;

    this.emit(
      "close",
      code ?? 1_000,
      Buffer.from(reason ?? ""),
    );
  }

  public terminate(): void {
    this.terminated = true;
    this.readyState = 3;
  }

  public ping(
    _data?: unknown,
    _mask?: boolean,
    callback?: (error?: Error) => void,
  ): void {
    this.pingCount += 1;
    callback?.();
  }

  public open(): void {
    this.readyState = 1;
    this.emit("open");
  }

  public receive(
    payload: unknown,
  ): void {
    this.emit(
      "message",
      Buffer.from(
        JSON.stringify(payload),
      ),
      false,
    );
  }
}

class MockWebSocketTransportFactory
  implements BinanceWebSocketTransportFactory {
  public readonly createdUrls: string[] = [];
  public readonly transports:
    MockWebSocketTransport[] = [];

  public create(
    url: string,
  ): BinanceWebSocketTransport {
    const transport =
      new MockWebSocketTransport();

    this.createdUrls.push(url);
    this.transports.push(transport);

    return transport;
  }

  public latest():
    MockWebSocketTransport {
    const transport =
      this.transports.at(-1);

    if (transport === undefined) {
      throw new Error(
        "No WebSocket transport has been created.",
      );
    }

    return transport;
  }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

async function testConfiguration(): Promise<void> {
  const productionConfiguration =
    createBinanceConnectorConfiguration();

  assert.equal(
    productionConfiguration.environment,
    "production",
  );

  assert.equal(
    productionConfiguration.endpoints
      .restBaseUrl,
    "https://api.binance.com",
  );

  assert.equal(
    productionConfiguration.endpoints
      .websocketBaseUrl,
    "wss://stream.binance.com:9443",
  );

  assert.equal(
    productionConfiguration.recvWindowMs,
    5_000,
  );

  assert.equal(
    Object.isFrozen(
      productionConfiguration,
    ),
    true,
  );

  const testnetConfiguration =
    createBinanceConnectorConfiguration({
      environment: "testnet",
      credentials: {
        apiKey: " test-api-key ",
        apiSecret: " test-api-secret ",
      },
      requestTimeoutMs: 15_000,
      recvWindowMs: 10_000,
      endpoints: {
        restBaseUrl:
          "https://example.test/",
        websocketBaseUrl:
          "wss://stream.example.test/",
      },
    });

  assert.equal(
    testnetConfiguration.credentials
      ?.apiKey,
    "test-api-key",
  );

  assert.equal(
    testnetConfiguration.credentials
      ?.apiSecret,
    "test-api-secret",
  );

  assert.equal(
    testnetConfiguration.endpoints
      .restBaseUrl,
    "https://example.test",
  );

  assert.equal(
    testnetConfiguration.endpoints
      .websocketBaseUrl,
    "wss://stream.example.test",
  );

  assert.throws(
    () =>
      createBinanceConnectorConfiguration({
        retry: {
          initialDelayMs: 5_000,
          maxDelayMs: 1_000,
        },
      }),
    BinanceConnectorConfigurationError,
  );

  assert.throws(
    () =>
      createBinanceConnectorConfiguration({
        rateLimit: {
          throttleThreshold: 1.1,
        },
      }),
    BinanceConnectorConfigurationError,
  );
}

async function testMetadata(): Promise<void> {
  assert.equal(
    BINANCE_CONNECTOR_ID,
    "binance",
  );

  assert.equal(
    BINANCE_CONNECTOR_METADATA.id,
    "binance",
  );

  assert.equal(
    BINANCE_CONNECTOR_METADATA.exchange,
    "BINANCE",
  );

  assert.equal(
    BINANCE_CONNECTOR_METADATA.capabilities
      .supportsTrading,
    true,
  );

  assert.equal(
    BINANCE_CONNECTOR_METADATA.capabilities
      .supportsTestnet,
    true,
  );

  assert.deepEqual(
    BINANCE_CONNECTOR_METADATA.capabilities
      .marketTypes,
    ["spot"],
  );
}

async function testRequestSigning():
  Promise<void> {
  const clock =
    createMutableClock(
      1_650_000_000_000,
    );

  const signer =
    new BinanceRequestSigner({
      apiSecret: "secret-key",
      defaultRecvWindowMs: 5_000,
      clock,
    });

  const signed =
    signer.signRequest({
      parameters: {
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: "0.01000000",
        price: "20000.00",
        timeInForce: "GTC",
      },
    });

  assert.equal(
    signed.timestamp,
    1_650_000_000_000,
  );

  assert.equal(
    signed.recvWindowMs,
    5_000,
  );

  assert.equal(
    signed.queryString,
    [
      "price=20000.00",
      "quantity=0.01000000",
      "recvWindow=5000",
      "side=BUY",
      "symbol=BTCUSDT",
      "timeInForce=GTC",
      "timestamp=1650000000000",
      "type=LIMIT",
    ].join("&"),
  );

  const independentlyCalculatedSignature =
    createHmac(
      "sha256",
      "secret-key",
    )
      .update(
        signed.queryString,
        "utf8",
      )
      .digest("hex");

  assert.equal(
    signed.signature,
    independentlyCalculatedSignature,
  );

  assert.equal(
    signer.verifyPayloadSignature(
      signed.queryString,
      signed.signature,
    ),
    true,
  );

  assert.equal(
    verifyBinanceHmacSha256Signature(
      signed.signature,
      independentlyCalculatedSignature,
    ),
    true,
  );

  assert.equal(
    createBinanceHmacSha256Signature(
      "symbol=BTCUSDT",
      "secret-key",
    ),
    createHmac(
      "sha256",
      "secret-key",
    )
      .update(
        "symbol=BTCUSDT",
      )
      .digest("hex"),
  );

  const normalized =
    normalizeBinanceSigningParameters({
      z: 10,
      ignored: undefined,
      flags: [
        true,
        false,
      ],
      symbol: "ETHUSDT",
    });

  assert.deepEqual(
    normalized,
    {
      z: "10",
      flags: "true,false",
      symbol: "ETHUSDT",
    },
  );

  assert.equal(
    createBinanceCanonicalQueryString({
      z: "10",
      symbol: "ETHUSDT",
      flags: "true,false",
    }),
    "flags=true%2Cfalse&symbol=ETHUSDT&z=10",
  );

  assert.throws(
    () =>
      signer.signRequest({
        recvWindowMs: 60_001,
      }),
    BinanceRequestSigningError,
  );

  assert.throws(
    () =>
      signer.signRequest({
        parameters: {
          signature: "forbidden",
        },
      }),
    BinanceRequestSigningError,
  );
}

async function testRestClient():
  Promise<void> {
  const clock =
    createMutableClock(
      1_700_000_000_000,
    );

  const http =
    createMockAxiosController();

  const configuration =
    createBinanceConnectorConfiguration({
      credentials: {
        apiKey: "api-key",
        apiSecret: "api-secret",
      },
      retry: {
        maxRetries: 0,
      },
    });

  const restClient =
    new BinanceRestClient(
      configuration,
      {
        axiosInstance:
          http.instance,
        clock,
        random: () => 0,
      },
    );

  http.enqueueResponse({
    status: 200,
    data: {
      serverTime:
        1_700_000_000_100,
    },
    headers: {
      "x-mbx-used-weight-1m": "15",
    },
  });

  const serverTime =
    await restClient.getServerTime();

  assert.equal(
    serverTime.serverTime,
    1_700_000_000_100,
  );

  assert.equal(
    http.requests.length,
    1,
  );

  assert.equal(
    http.requests[0]?.method,
    "GET",
  );

  assert.equal(
    http.requests[0]?.url,
    "/api/v3/time",
  );

  assert.deepEqual(
    restClient.getRequestWeightSnapshot(),
    {
      usedWeight1Minute: 15,
      orderCount10Seconds: undefined,
      orderCount1Minute: undefined,
      updatedAt:
        1_700_000_000_000,
    },
  );

  http.enqueueResponse({
    status: 200,
    data: {
      symbol: "BTCUSDT",
      price: "65000.00",
    },
  });

  const ticker =
    await restClient.getPriceTicker({
      symbol: "btc-usdt",
    });

  assert.deepEqual(
    ticker,
    {
      symbol: "BTCUSDT",
      price: "65000.00",
    },
  );

  assert.equal(
    http.requests[1]?.url,
    "/api/v3/ticker/price?symbol=BTCUSDT",
  );

  http.enqueueResponse({
    status: 200,
    data: {
      makerCommission: 10,
      takerCommission: 10,
      buyerCommission: 0,
      sellerCommission: 0,
      canTrade: true,
      canWithdraw: true,
      canDeposit: true,
      brokered: false,
      requireSelfTradePrevention: false,
      updateTime:
        1_700_000_000_000,
      accountType: "SPOT",
      balances: [],
      permissions: ["SPOT"],
    },
  });

  await restClient.getAccountInformation();

  const accountRequest =
    http.requests[2];

  assert.equal(
    accountRequest?.method,
    "GET",
  );

  assert.match(
    accountRequest?.url ?? "",
    /^\/api\/v3\/account\?/,
  );

  assert.match(
    accountRequest?.url ?? "",
    /timestamp=1700000000000/,
  );

  assert.match(
    accountRequest?.url ?? "",
    /recvWindow=5000/,
  );

  assert.match(
    accountRequest?.url ?? "",
    /signature=[a-f0-9]{64}/,
  );

  const headers =
    accountRequest?.headers as
      | Record<string, string>
      | undefined;

  assert.equal(
    headers?.["X-MBX-APIKEY"],
    "api-key",
  );

  http.enqueueResponse({
    status: 400,
    data: {
      code: -1121,
      msg: "Invalid symbol.",
    },
  });

  await assert.rejects(
    () =>
      restClient.getPriceTicker({
        symbol: "UNKNOWN",
      }),
    (error: unknown) => {
      assert.equal(
        error instanceof
          BinanceRestApiError,
        true,
      );

      const apiError =
        error as BinanceRestApiError;

      assert.equal(
        apiError.status,
        400,
      );

      assert.equal(
        apiError.code,
        -1121,
      );

      assert.equal(
        apiError.message,
        "Invalid symbol.",
      );

      return true;
    },
  );

  assert.equal(
    normalizeBinanceSymbol(
      "eth/usdt",
    ),
    "ETHUSDT",
  );
}

async function testWebSocketClient():
  Promise<void> {
  const clock =
    createMutableClock(
      1_800_000_000_000,
    );

  const factory =
    new MockWebSocketTransportFactory();

  const configuration =
    createBinanceConnectorConfiguration({
      websocket: {
        connectionTimeoutMs: 30_000,
        inactivityTimeoutMs: 60_000,
        reconnectDelayMs: 1_000,
        maxReconnectDelayMs: 5_000,
        maxReconnectAttempts: 3,
      },
    });

  const client =
    new BinanceWebSocketClient(
      configuration,
      {
        transportFactory: factory,
        clock,
        random: () => 0,
      },
    );

  const receivedEvents:
    unknown[] = [];

  client.onEvent((message) => {
    receivedEvents.push(message);
  });

  await client.connect();

  assert.equal(
    client.getState(),
    "CONNECTING",
  );

  assert.equal(
    factory.createdUrls[0],
    "wss://stream.binance.com:9443/ws",
  );

  const transport =
    factory.latest();

  transport.open();

  await flushPromises();

  assert.equal(
    client.getState(),
    "CONNECTED",
  );

  const subscriptionPromise =
    client.subscribe([
      createBinanceTradeStreamName(
        "BTC-USDT",
      ),
    ]);

  assert.equal(
    transport.sentMessages.length,
    1,
  );

  const subscriptionCommand =
    JSON.parse(
      transport.sentMessages[0] ??
        "{}",
    ) as {
      readonly method?: string;
      readonly params?: readonly string[];
      readonly id?: number;
    };

  assert.equal(
    subscriptionCommand.method,
    "SUBSCRIBE",
  );

  assert.deepEqual(
    subscriptionCommand.params,
    ["btcusdt@trade"],
  );

  transport.receive({
    result: null,
    id: subscriptionCommand.id,
  });

  await subscriptionPromise;

  assert.deepEqual(
    client.getActiveSubscriptions(),
    ["btcusdt@trade"],
  );

  transport.receive({
    e: "trade",
    E: 1_800_000_000_010,
    s: "BTCUSDT",
    t: 101,
    p: "65000.00",
    q: "0.01",
    T: 1_800_000_000_009,
    m: false,
    M: true,
  });

  assert.equal(
    receivedEvents.length,
    1,
  );

  const received =
    receivedEvents[0] as {
      readonly event: {
        readonly e: string;
        readonly s: string;
      };
      readonly context: {
        readonly receivedAt: number;
      };
    };

  assert.equal(
    received.event.e,
    "trade",
  );

  assert.equal(
    received.event.s,
    "BTCUSDT",
  );

  assert.equal(
    received.context.receivedAt,
    1_800_000_000_000,
  );

  const health =
    client.getHealthSnapshot();

  assert.equal(
    health.healthy,
    true,
  );

  assert.deepEqual(
    health.activeSubscriptions,
    ["btcusdt@trade"],
  );

  await client.disconnect();

  assert.equal(
    client.getState(),
    "CLOSED",
  );

  assert.equal(
    transport.closeCalls.length,
    1,
  );

  assert.equal(
    createBinanceAggregateTradeStreamName(
      "ETH/USDT",
    ),
    "ethusdt@aggtrade",
  );

  assert.equal(
    createBinanceKlineStreamName(
      "BTCUSDT",
      "1m",
    ),
    "btcusdt@kline_1m",
  );

  assert.equal(
    createBinanceDepthStreamName(
      "BTCUSDT",
      "100ms",
    ),
    "btcusdt@depth@100ms",
  );

  assert.throws(
    () =>
      createBinanceTradeStreamName(
        "",
      ),
    BinanceWebSocketValidationError,
  );
}

async function testConnectorLifecycle():
  Promise<void> {
  const connector =
    new BinanceConnector({
      configuration: {
        environment: "testnet",
      },
    });

  assert.equal(
    connector.getLifecycleState(),
    "CREATED",
  );

  assert.equal(
    connector.isInitialized(),
    false,
  );

  await connector.initialize({
    verifyRestConnectivity: false,
  });

  assert.equal(
    connector.getLifecycleState(),
    "READY",
  );

  assert.equal(
    connector.isInitialized(),
    true,
  );

  await connector.connect({
    connectWebSocket: false,
  });

  assert.equal(
    connector.getLifecycleState(),
    "CONNECTED",
  );

  assert.equal(
    connector.isConnected(),
    true,
  );

  const readiness =
    connector.getReadinessSnapshot();

  assert.deepEqual(
    readiness,
    {
      ready: true,
      lifecycleState:
        "CONNECTED",
      restReachable: true,
      websocketRequired: false,
      websocketConnected: false,
    },
  );

  const health =
    connector.getHealthSnapshot();

  assert.equal(
    health.connectorId,
    "binance",
  );

  assert.equal(
    health.healthy,
    true,
  );

  await assert.rejects(
    () =>
      connector.getAccountInformation(),
    /Binance API credentials are required/,
  );

  await connector.shutdown();

  assert.equal(
    connector.getLifecycleState(),
    "DISCONNECTED",
  );

  assert.equal(
    connector.isInitialized(),
    false,
  );
}

async function runTests():
  Promise<void> {
  await testConfiguration();
  console.log(
    "✓ Binance configuration tests passed",
  );

  await testMetadata();
  console.log(
    "✓ Binance metadata tests passed",
  );

  await testRequestSigning();
  console.log(
    "✓ Binance request signer tests passed",
  );

  await testRestClient();
  console.log(
    "✓ Binance REST client tests passed",
  );

  await testWebSocketClient();
  console.log(
    "✓ Binance WebSocket client tests passed",
  );

  await testConnectorLifecycle();
  console.log(
    "✓ Binance connector lifecycle tests passed",
  );

  console.log(
    "\nAll deterministic Binance adapter integration tests passed successfully.",
  );
}

runTests().catch((error: unknown) => {
  console.error(
    "Binance adapter integration tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
});