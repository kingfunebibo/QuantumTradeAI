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
  OkxPublicMarketApi,
  OkxPublicMarketApiError,
} from "./okx-public-market-api";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;

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
): OkxPublicMarketApi {
  const adapter = new OkxRestAdapter({
    configuration: createOkxConnectorConfiguration(),
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
      ]),
  });

  return new OkxPublicMarketApi(adapter);
}

async function testGetServerTime(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  const result = await api.getServerTime();

  assert.equal(result.ok, true);

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/public/time",
  );
  assert.equal(request.request.method, "GET");
  assert.equal(
    request.request.authentication,
    "public",
  );
}

async function testGetInstruments(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getInstruments({
    instType: "SWAP",
    uly: "BTC-USDT",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-SWAP",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/public/instruments",
  );

  assert.deepEqual(request.request.query, {
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-SWAP",
    instType: "SWAP",
    uly: "BTC-USDT",
  });
}

async function testGetTickers(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getTickers({
    instType: "SPOT",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/market/tickers",
  );

  assert.deepEqual(request.request.query, {
    instType: "SPOT",
  });
}

async function testGetTicker(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getTicker({
    instId: " BTC-USDT ",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/market/ticker",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT",
  });
}

async function testGetOrderBook(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getOrderBook({
    instId: "BTC-USDT",
    sz: 50,
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/market/books",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT",
    sz: 50,
  });
}

async function testGetTrades(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getTrades({
    instId: "ETH-USDT",
    limit: 100,
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/market/trades",
  );

  assert.deepEqual(request.request.query, {
    instId: "ETH-USDT",
    limit: 100,
  });
}

async function testGetCandles(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getCandles({
    instId: "BTC-USDT",
    bar: "4H",
    after: "1700000000000",
    before: "1701000000000",
    limit: 200,
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/market/candles",
  );

  assert.deepEqual(request.request.query, {
    after: "1700000000000",
    bar: "4H",
    before: "1701000000000",
    instId: "BTC-USDT",
    limit: 200,
  });
}

async function testGetFundingRate(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getFundingRate({
    instId: "BTC-USDT-SWAP",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/public/funding-rate",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT-SWAP",
  });
}

async function testGetMarkPrice(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getMarkPrice({
    instType: "SWAP",
    instId: "BTC-USDT-SWAP",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/public/mark-price",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT-SWAP",
    instType: "SWAP",
  });
}

async function testGetOpenInterest(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getOpenInterest({
    instType: "FUTURES",
    uly: "BTC-USDT",
    instFamily: "BTC-USDT",
  });

  const [request] = getRequests();

  assert.ok(request);
  assert.equal(
    request.request.path,
    "/api/v5/public/open-interest",
  );

  assert.deepEqual(request.request.query, {
    instFamily: "BTC-USDT",
    instType: "FUTURES",
    uly: "BTC-USDT",
  });
}

function testInvalidInstrumentType(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getInstruments({
        instType: "INVALID" as never,
      }),
    /Unsupported OKX instrument type/,
  );
}

function testInvalidDerivativeInstrumentType(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getMarkPrice({
        instType: "SPOT" as never,
      }),
    /Unsupported OKX derivative instrument type/,
  );

  assert.throws(
    () =>
      api.getOpenInterest({
        instType: "MARGIN" as never,
      }),
    /Unsupported OKX derivative instrument type/,
  );
}

function testInvalidInstrumentIds(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getTicker({
        instId: " ",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getOrderBook({
        instId: "",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getTrades({
        instId: " ",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getCandles({
        instId: "",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getFundingRate({
        instId: " ",
      }),
    /instId must not be empty/,
  );
}

function testInvalidOrderBookLimits(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getOrderBook({
        instId: "BTC-USDT",
        sz: 0,
      }),
    /sz must be an integer between 1 and 400/,
  );

  assert.throws(
    () =>
      api.getOrderBook({
        instId: "BTC-USDT",
        sz: 401,
      }),
    /sz must be an integer between 1 and 400/,
  );
}

function testInvalidTradeLimits(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getTrades({
        instId: "BTC-USDT",
        limit: 0,
      }),
    /limit must be an integer between 1 and 500/,
  );

  assert.throws(
    () =>
      api.getTrades({
        instId: "BTC-USDT",
        limit: 501,
      }),
    /limit must be an integer between 1 and 500/,
  );
}

function testInvalidCandleLimits(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getCandles({
        instId: "BTC-USDT",
        limit: 0,
      }),
    /limit must be an integer between 1 and 300/,
  );

  assert.throws(
    () =>
      api.getCandles({
        instId: "BTC-USDT",
        limit: 301,
      }),
    /limit must be an integer between 1 and 300/,
  );
}

function testInvalidRestAdapterDependency(): void {
  assert.throws(
    () =>
      new OkxPublicMarketApi(
        {} as OkxRestAdapter,
      ),
    /restAdapter must be an OkxRestAdapter/,
  );
}

function testErrorIdentity(): void {
  const error = new OkxPublicMarketApiError(
    "Market API failed.",
  );

  assert.equal(
    error.name,
    "OkxPublicMarketApiError",
  );

  assert.equal(
    error.code,
    "OKX_PUBLIC_MARKET_API_ERROR",
  );

  assert.equal(
    error.message,
    "Market API failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxPublicMarketApiError);
}

async function testDeterministicRequests(): Promise<void> {
  const firstCapture = createCapturingTransport();
  const secondCapture = createCapturingTransport();

  const firstApi = createApi(firstCapture.transport);
  const secondApi = createApi(secondCapture.transport);

  await firstApi.getCandles({
    instId: "BTC-USDT",
    bar: "1H",
    limit: 100,
  });

  await secondApi.getCandles({
    instId: "BTC-USDT",
    bar: "1H",
    limit: 100,
  });

  const [firstRequest] = firstCapture.getRequests();
  const [secondRequest] = secondCapture.getRequests();

  assert.ok(firstRequest);
  assert.ok(secondRequest);

  assert.deepEqual(firstRequest, secondRequest);
  assert.notEqual(firstRequest, secondRequest);
}

async function runOkxPublicMarketApiTests(): Promise<void> {
  await testGetServerTime();
  await testGetInstruments();
  await testGetTickers();
  await testGetTicker();
  await testGetOrderBook();
  await testGetTrades();
  await testGetCandles();
  await testGetFundingRate();
  await testGetMarkPrice();
  await testGetOpenInterest();
  testInvalidInstrumentType();
  testInvalidDerivativeInstrumentType();
  testInvalidInstrumentIds();
  testInvalidOrderBookLimits();
  testInvalidTradeLimits();
  testInvalidCandleLimits();
  testInvalidRestAdapterDependency();
  testErrorIdentity();
  await testDeterministicRequests();

  console.log(
    "All OKX public market API tests passed successfully.",
  );
}

runOkxPublicMarketApiTests().catch((error: unknown) => {
  console.error(
    "OKX public market API tests failed.",
    error,
  );

  process.exitCode = 1;
});