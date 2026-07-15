import assert from "node:assert/strict";

import {
  createDeterministicOkxClock,
} from "./okx-authentication";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createOkxRestSuccessResponse,
  type OkxRestBody,
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  OkxRestAdapter,
  createDeterministicOkxRequestIdGenerator,
} from "./okx-rest-adapter";

import {
  type OkxRestTransport,
  type OkxRestTransportRequest,
} from "./okx-rest-transport";

import {
  OkxPrivateTradingApi,
  OkxPrivateTradingApiError,
} from "./okx-private-trading-api";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function createCapturingTransport(): {
  readonly transport: OkxRestTransport;
  readonly getRequests: () =>
    readonly OkxRestTransportRequest<OkxRestBody>[];
} {
  const requests: OkxRestTransportRequest<OkxRestBody>[] = [];

  const transport: OkxRestTransport = {
    async execute<TData, TBody extends OkxRestBody = null>(
      request: OkxRestTransportRequest<TBody>,
    ): Promise<OkxRestResult<TData>> {
      requests.push(
        request as OkxRestTransportRequest<OkxRestBody>,
      );

      return createOkxRestSuccessResponse({
        status: 200,
        headers: {},
        envelope: {
          code: "0",
          msg: "",
          data: [],
        },
      }) as OkxRestResult<TData>;
    },
  };

  return {
    transport,
    getRequests(): readonly OkxRestTransportRequest<OkxRestBody>[] {
      return requests;
    },
  };
}

function createApi(
  transport: OkxRestTransport,
): OkxPrivateTradingApi {
  const adapter = new OkxRestAdapter({
    configuration: createOkxConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
    }),
    transport,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
    requestIdGenerator:
      createDeterministicOkxRequestIdGenerator([
        "request-001",
        "request-002",
        "request-003",
        "request-004",
        "request-005",
        "request-006",
        "request-007",
        "request-008",
        "request-009",
        "request-010",
      ]),
  });

  return new OkxPrivateTradingApi(adapter);
}

async function testPlaceMarketOrder(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  const result = await api.placeOrder({
    instId: " BTC-USDT ",
    tdMode: "cash",
    side: "buy",
    ordType: "market",
    sz: " 0.01 ",
    clOrdId: " client-001 ",
    tag: " strategy-a ",
    tgtCcy: "base_ccy",
    banAmend: true,
    stpMode: "cancel_maker",
  });

  assert.equal(result.ok, true);

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/trade/order",
  );

  assert.equal(request.request.method, "POST");
  assert.equal(
    request.request.authentication,
    "private",
  );

  assert.deepEqual(request.request.body, {
    banAmend: true,
    clOrdId: "client-001",
    instId: "BTC-USDT",
    ordType: "market",
    side: "buy",
    stpMode: "cancel_maker",
    sz: "0.01",
    tag: "strategy-a",
    tdMode: "cash",
    tgtCcy: "base_ccy",
  });

  assert.equal(
    Object.isFrozen(request.request.body),
    true,
  );
}

async function testPlaceLimitOrder(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.placeOrder({
    instId: "ETH-USDT-SWAP",
    tdMode: "cross",
    side: "sell",
    ordType: "limit",
    sz: "2",
    px: "3500.5",
    posSide: "short",
    reduceOnly: false,
    ccy: "USDT",
    quickMgnType: "manual",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.deepEqual(request.request.body, {
    ccy: "USDT",
    instId: "ETH-USDT-SWAP",
    ordType: "limit",
    posSide: "short",
    px: "3500.5",
    quickMgnType: "manual",
    reduceOnly: false,
    side: "sell",
    sz: "2",
    tdMode: "cross",
  });
}

async function testPlaceOrderWithAttachedAlgo(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.placeOrder({
    instId: "BTC-USDT",
    tdMode: "cash",
    side: "buy",
    ordType: "limit",
    sz: "0.1",
    px: "60000",
    attachAlgoOrds: [
      {
        attachAlgoClOrdId: "tp-sl-001",
        tpTriggerPx: "65000",
        tpOrdPx: "-1",
        slTriggerPx: "58000",
        slOrdPx: "-1",
        tpTriggerPxType: "mark",
        slTriggerPxType: "last",
        sz: "0.1",
        amendPxOnTriggerType: "1",
      },
    ],
  });

  const [request] = getRequests();

  assert.ok(request);

  const body = request.request.body as {
    readonly attachAlgoOrds:
      readonly Readonly<Record<string, unknown>>[];
  };

  assert.equal(
    Object.isFrozen(body.attachAlgoOrds),
    true,
  );

  assert.deepEqual(body.attachAlgoOrds, [
    {
      amendPxOnTriggerType: "1",
      attachAlgoClOrdId: "tp-sl-001",
      slOrdPx: "-1",
      slTriggerPx: "58000",
      slTriggerPxType: "last",
      sz: "0.1",
      tpOrdPx: "-1",
      tpTriggerPx: "65000",
      tpTriggerPxType: "mark",
    },
  ]);
}

async function testPlaceBatchOrders(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.placeBatchOrders([
    {
      instId: "BTC-USDT",
      tdMode: "cash",
      side: "buy",
      ordType: "market",
      sz: "0.01",
    },
    {
      instId: "ETH-USDT",
      tdMode: "cash",
      side: "sell",
      ordType: "limit",
      sz: "0.5",
      px: "3500",
    },
  ]);

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/batch-orders",
  );

  assert.equal(
    Object.isFrozen(request.request.body),
    true,
  );

  assert.deepEqual(request.request.body, [
    {
      instId: "BTC-USDT",
      ordType: "market",
      side: "buy",
      sz: "0.01",
      tdMode: "cash",
    },
    {
      instId: "ETH-USDT",
      ordType: "limit",
      px: "3500",
      side: "sell",
      sz: "0.5",
      tdMode: "cash",
    },
  ]);
}

async function testAmendOrder(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.amendOrder({
    instId: "BTC-USDT",
    ordId: "12345",
    reqId: "amend-001",
    cxlOnFail: true,
    newSz: "0.02",
    newPx: "62000",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/amend-order",
  );

  assert.deepEqual(request.request.body, {
    cxlOnFail: true,
    instId: "BTC-USDT",
    newPx: "62000",
    newSz: "0.02",
    ordId: "12345",
    reqId: "amend-001",
  });
}

async function testAmendBatchOrders(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.amendBatchOrders([
    {
      instId: "BTC-USDT",
      ordId: "1",
      newPx: "61000",
    },
    {
      instId: "ETH-USDT",
      clOrdId: "client-2",
      newSz: "1.5",
    },
  ]);

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/amend-batch-orders",
  );

  assert.deepEqual(request.request.body, [
    {
      instId: "BTC-USDT",
      newPx: "61000",
      ordId: "1",
    },
    {
      clOrdId: "client-2",
      instId: "ETH-USDT",
      newSz: "1.5",
    },
  ]);
}

async function testCancelOrder(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.cancelOrder({
    instId: "BTC-USDT",
    clOrdId: "client-001",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/cancel-order",
  );

  assert.deepEqual(request.request.body, {
    clOrdId: "client-001",
    instId: "BTC-USDT",
  });
}

async function testCancelBatchOrders(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.cancelBatchOrders([
    {
      instId: "BTC-USDT",
      ordId: "1",
    },
    {
      instId: "ETH-USDT",
      clOrdId: "client-2",
    },
  ]);

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/cancel-batch-orders",
  );

  assert.deepEqual(request.request.body, [
    {
      instId: "BTC-USDT",
      ordId: "1",
    },
    {
      clOrdId: "client-2",
      instId: "ETH-USDT",
    },
  ]);
}

async function testGetOrder(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getOrder({
    instId: " BTC-USDT ",
    ordId: " 12345 ",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/order",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT",
    ordId: "12345",
  });
}

async function testGetOpenOrders(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getOpenOrders({
    instType: "SWAP",
    uly: "BTC-USDT",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-SWAP",
    ordType: "limit",
    state: "live",
    after: "100",
    before: "200",
    limit: 50,
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/orders-pending",
  );

  assert.deepEqual(request.request.query, {
    after: "100",
    before: "200",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-SWAP",
    instType: "SWAP",
    limit: 50,
    ordType: "limit",
    state: "live",
    uly: "BTC-USDT",
  });
}

async function testGetOrderHistory(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getOrderHistory({
    instType: "SPOT",
    instId: "BTC-USDT",
    ordType: "market",
    state: "filled",
    category: "normal",
    after: "10",
    before: "20",
    begin: "1700000000000",
    end: "1701000000000",
    limit: 100,
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/orders-history",
  );

  assert.deepEqual(request.request.query, {
    after: "10",
    before: "20",
    begin: "1700000000000",
    category: "normal",
    end: "1701000000000",
    instId: "BTC-USDT",
    instType: "SPOT",
    limit: 100,
    ordType: "market",
    state: "filled",
  });
}

async function testGetFills(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getFills({
    instType: "FUTURES",
    uly: "BTC-USDT",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-260925",
    ordId: "12345",
    subType: "1",
    after: "10",
    before: "20",
    begin: "1700000000000",
    end: "1701000000000",
    limit: 100,
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/trade/fills",
  );

  assert.deepEqual(request.request.query, {
    after: "10",
    before: "20",
    begin: "1700000000000",
    end: "1701000000000",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-260925",
    instType: "FUTURES",
    limit: 100,
    ordId: "12345",
    subType: "1",
    uly: "BTC-USDT",
  });
}

function testInvalidOrderTypesAndSides(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "hold" as never,
        ordType: "market",
        sz: "1",
      }),
    /Unsupported OKX trade side/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "stop" as never,
        sz: "1",
      }),
    /Unsupported OKX order type/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "invalid" as never,
        side: "buy",
        ordType: "market",
        sz: "1",
      }),
    /Unsupported OKX trading mode/,
  );
}

function testInvalidPositionAndStpModes(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "1",
        posSide: "both" as never,
      }),
    /Unsupported OKX position side/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "1",
        stpMode: "none" as never,
      }),
    /Unsupported OKX STP mode/,
  );
}

function testInvalidPricesAndSizes(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "0",
      }),
    /sz must be a positive numeric string/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "limit",
        sz: "1",
      }),
    /px is required for non-market orders/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "limit",
        sz: "1",
        px: "-1",
      }),
    /px must be a positive numeric string/,
  );
}

function testInvalidAmendments(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.amendOrder({
        instId: "BTC-USDT",
        ordId: "1",
      }),
    /At least one amendment field is required/,
  );

  assert.throws(
    () =>
      api.amendOrder({
        instId: "BTC-USDT",
        newPx: "60000",
      }),
    /Either ordId or clOrdId is required/,
  );

  assert.throws(
    () =>
      api.amendOrder({
        instId: "BTC-USDT",
        ordId: "1",
        newSz: "0",
      }),
    /newSz must be a positive numeric string/,
  );
}

function testInvalidOrderIdentifiers(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.cancelOrder({
        instId: "BTC-USDT",
      }),
    /Either ordId or clOrdId is required/,
  );

  assert.throws(
    () =>
      api.getOrder({
        instId: "BTC-USDT",
      }),
    /Either ordId or clOrdId is required/,
  );
}

function testInvalidBatchSizes(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () => api.placeBatchOrders([]),
    /orders must contain between 1 and 20 entries/,
  );

  const twentyOneOrders = Array.from(
    { length: 21 },
    () => ({
      instId: "BTC-USDT",
      tdMode: "cash" as const,
      side: "buy" as const,
      ordType: "market" as const,
      sz: "1",
    }),
  );

  assert.throws(
    () => api.placeBatchOrders(twentyOneOrders),
    /orders must contain between 1 and 20 entries/,
  );
}

function testInvalidAttachedAlgoOrders(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "1",
        attachAlgoOrds: [{}],
      }),
    /Attached algo order must contain at least one field/,
  );

  assert.throws(
    () =>
      api.placeOrder({
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "1",
        attachAlgoOrds: [
          {
            sz: "0",
          },
        ],
      }),
    /attachAlgoOrds\.sz must be a positive numeric string/,
  );
}

function testInvalidQueryLimitsAndTimestamps(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getOpenOrders({
        limit: 101,
      }),
    /limit must be an integer between 1 and 100/,
  );

  assert.throws(
    () =>
      api.getOrderHistory({
        instType: "SPOT",
        begin: "invalid",
      }),
    /begin must contain a numeric timestamp/,
  );

  assert.throws(
    () =>
      api.getFills({
        end: "12.5",
      }),
    /end must contain a numeric timestamp/,
  );
}

function testInvalidInstrumentType(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getOpenOrders({
        instType: "INVALID" as never,
      }),
    /Unsupported OKX instrument type/,
  );

  assert.throws(
    () =>
      api.getOrderHistory({
        instType: "INVALID" as never,
      }),
    /Unsupported OKX instrument type/,
  );
}

function testInvalidAdapterDependency(): void {
  assert.throws(
    () =>
      new OkxPrivateTradingApi(
        {} as OkxRestAdapter,
      ),
    /restAdapter must be an OkxRestAdapter/,
  );
}

function testErrorIdentity(): void {
  const error = new OkxPrivateTradingApiError(
    "Trading API failed.",
  );

  assert.equal(
    error.name,
    "OkxPrivateTradingApiError",
  );

  assert.equal(
    error.code,
    "OKX_PRIVATE_TRADING_API_ERROR",
  );

  assert.equal(
    error.message,
    "Trading API failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxPrivateTradingApiError);
}

async function testDeterministicRequests(): Promise<void> {
  const firstCapture = createCapturingTransport();
  const secondCapture = createCapturingTransport();

  const firstApi = createApi(firstCapture.transport);
  const secondApi = createApi(secondCapture.transport);

  const input = {
    instId: "BTC-USDT",
    tdMode: "cash" as const,
    side: "buy" as const,
    ordType: "limit" as const,
    sz: "0.01",
    px: "60000",
    clOrdId: "fixed-client-id",
  };

  await firstApi.placeOrder(input);
  await secondApi.placeOrder(input);

  const [firstRequest] = firstCapture.getRequests();
  const [secondRequest] = secondCapture.getRequests();

  assert.ok(firstRequest);
  assert.ok(secondRequest);

  assert.deepEqual(firstRequest, secondRequest);
  assert.notEqual(firstRequest, secondRequest);
}

async function runOkxPrivateTradingApiTests(): Promise<void> {
  await testPlaceMarketOrder();
  await testPlaceLimitOrder();
  await testPlaceOrderWithAttachedAlgo();
  await testPlaceBatchOrders();
  await testAmendOrder();
  await testAmendBatchOrders();
  await testCancelOrder();
  await testCancelBatchOrders();
  await testGetOrder();
  await testGetOpenOrders();
  await testGetOrderHistory();
  await testGetFills();
  testInvalidOrderTypesAndSides();
  testInvalidPositionAndStpModes();
  testInvalidPricesAndSizes();
  testInvalidAmendments();
  testInvalidOrderIdentifiers();
  testInvalidBatchSizes();
  testInvalidAttachedAlgoOrders();
  testInvalidQueryLimitsAndTimestamps();
  testInvalidInstrumentType();
  testInvalidAdapterDependency();
  testErrorIdentity();
  await testDeterministicRequests();

  console.log(
    "All OKX private trading API tests passed successfully.",
  );
}

runOkxPrivateTradingApiTests().catch((error: unknown) => {
  console.error(
    "OKX private trading API tests failed.",
    error,
  );

  process.exitCode = 1;
});