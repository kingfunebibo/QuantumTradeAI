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
  OkxPrivateAccountApi,
  OkxPrivateAccountApiError,
} from "./okx-private-account-api";

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
): OkxPrivateAccountApi {
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
      ]),
  });

  return new OkxPrivateAccountApi(adapter);
}

async function testGetBalances(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  const result = await api.getBalances({
    ccy: " BTC,USDT ",
  });

  assert.equal(result.ok, true);

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/balance",
  );

  assert.equal(
    request.request.authentication,
    "private",
  );

  assert.deepEqual(request.request.query, {
    ccy: "BTC,USDT",
  });

  assert.equal(
    typeof request.headers["ok-access-sign"],
    "string",
  );
}

async function testGetBalancesWithoutFilter(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getBalances();

  const [request] = getRequests();

  assert.ok(request);
  assert.deepEqual(request.request.query, {});
}

async function testGetPositions(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getPositions({
    instType: "SWAP",
    instId: " BTC-USDT-SWAP ",
    posId: " 12345 ",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/positions",
  );

  assert.deepEqual(request.request.query, {
    instId: "BTC-USDT-SWAP",
    instType: "SWAP",
    posId: "12345",
  });
}

async function testGetPositionsWithoutFilters(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getPositions();

  const [request] = getRequests();

  assert.ok(request);
  assert.deepEqual(request.request.query, {});
}

async function testGetAccountConfiguration(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getAccountConfiguration();

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/config",
  );

  assert.equal(request.request.query, undefined);
}

async function testGetMaximumOrderSize(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getMaximumOrderSize({
    instId: " BTC-USDT ",
    tdMode: "cash",
    ccy: " USDT ",
    px: " 65000.5 ",
    leverage: " 3 ",
    unSpotOffset: true,
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/max-size",
  );

  assert.deepEqual(request.request.query, {
    ccy: "USDT",
    instId: "BTC-USDT",
    leverage: "3",
    px: "65000.5",
    tdMode: "cash",
    unSpotOffset: true,
  });
}

async function testGetMaximumAvailableBalance(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getMaximumAvailableBalance({
    instId: "ETH-USDT",
    tdMode: "cross",
    ccy: "USDT",
    reduceOnly: false,
    unSpotOffset: true,
    quickMgnType: "manual",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/max-avail-size",
  );

  assert.deepEqual(request.request.query, {
    ccy: "USDT",
    instId: "ETH-USDT",
    quickMgnType: "manual",
    reduceOnly: false,
    tdMode: "cross",
    unSpotOffset: true,
  });
}

async function testGetFeeRates(): Promise<void> {
  const { transport, getRequests } =
    createCapturingTransport();

  const api = createApi(transport);

  await api.getFeeRates({
    instType: "FUTURES",
    instId: "BTC-USDT-260925",
    uly: "BTC-USDT",
    category: "1",
    instFamily: "BTC-USDT",
  });

  const [request] = getRequests();

  assert.ok(request);

  assert.equal(
    request.request.path,
    "/api/v5/account/trade-fee",
  );

  assert.deepEqual(request.request.query, {
    category: "1",
    instFamily: "BTC-USDT",
    instId: "BTC-USDT-260925",
    instType: "FUTURES",
    uly: "BTC-USDT",
  });
}

function testInvalidInstrumentType(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getPositions({
        instType: "INVALID" as never,
      }),
    /Unsupported OKX instrument type/,
  );

  assert.throws(
    () =>
      api.getFeeRates({
        instType: "INVALID" as never,
      }),
    /Unsupported OKX instrument type/,
  );
}

function testInvalidTradingMode(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getMaximumOrderSize({
        instId: "BTC-USDT",
        tdMode: "invalid" as never,
      }),
    /Unsupported OKX trading mode/,
  );

  assert.throws(
    () =>
      api.getMaximumAvailableBalance({
        instId: "BTC-USDT",
        tdMode: "invalid" as never,
      }),
    /Unsupported OKX trading mode/,
  );
}

function testInvalidRequiredStrings(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getMaximumOrderSize({
        instId: " ",
        tdMode: "cash",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getMaximumAvailableBalance({
        instId: "",
        tdMode: "cross",
      }),
    /instId must not be empty/,
  );
}

function testInvalidOptionalStrings(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getBalances({
        ccy: " ",
      }),
    /ccy must not be empty/,
  );

  assert.throws(
    () =>
      api.getPositions({
        instId: " ",
      }),
    /instId must not be empty/,
  );

  assert.throws(
    () =>
      api.getPositions({
        posId: "",
      }),
    /posId must not be empty/,
  );

  assert.throws(
    () =>
      api.getFeeRates({
        instType: "SPOT",
        instFamily: " ",
      }),
    /instFamily must not be empty/,
  );
}

function testInvalidNumericStrings(): void {
  const { transport } = createCapturingTransport();
  const api = createApi(transport);

  assert.throws(
    () =>
      api.getMaximumOrderSize({
        instId: "BTC-USDT",
        tdMode: "cash",
        px: "not-a-number",
      }),
    /px must be a non-negative numeric string/,
  );

  assert.throws(
    () =>
      api.getMaximumOrderSize({
        instId: "BTC-USDT",
        tdMode: "cash",
        leverage: "-1",
      }),
    /leverage must be a non-negative numeric string/,
  );

  assert.throws(
    () =>
      api.getMaximumOrderSize({
        instId: "BTC-USDT",
        tdMode: "cash",
        px: "",
      }),
    /px must not be empty/,
  );
}

function testInvalidRestAdapterDependency(): void {
  assert.throws(
    () =>
      new OkxPrivateAccountApi(
        {} as OkxRestAdapter,
      ),
    /restAdapter must be an OkxRestAdapter/,
  );
}

function testErrorIdentity(): void {
  const error = new OkxPrivateAccountApiError(
    "Account API failed.",
  );

  assert.equal(
    error.name,
    "OkxPrivateAccountApiError",
  );

  assert.equal(
    error.code,
    "OKX_PRIVATE_ACCOUNT_API_ERROR",
  );

  assert.equal(
    error.message,
    "Account API failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxPrivateAccountApiError);
}

async function testDeterministicRequests(): Promise<void> {
  const firstCapture = createCapturingTransport();
  const secondCapture = createCapturingTransport();

  const firstApi = createApi(firstCapture.transport);
  const secondApi = createApi(secondCapture.transport);

  await firstApi.getPositions({
    instType: "SWAP",
    instId: "BTC-USDT-SWAP",
  });

  await secondApi.getPositions({
    instType: "SWAP",
    instId: "BTC-USDT-SWAP",
  });

  const [firstRequest] = firstCapture.getRequests();
  const [secondRequest] = secondCapture.getRequests();

  assert.ok(firstRequest);
  assert.ok(secondRequest);

  assert.deepEqual(firstRequest, secondRequest);
  assert.notEqual(firstRequest, secondRequest);
}

async function runOkxPrivateAccountApiTests(): Promise<void> {
  await testGetBalances();
  await testGetBalancesWithoutFilter();
  await testGetPositions();
  await testGetPositionsWithoutFilters();
  await testGetAccountConfiguration();
  await testGetMaximumOrderSize();
  await testGetMaximumAvailableBalance();
  await testGetFeeRates();
  testInvalidInstrumentType();
  testInvalidTradingMode();
  testInvalidRequiredStrings();
  testInvalidOptionalStrings();
  testInvalidNumericStrings();
  testInvalidRestAdapterDependency();
  testErrorIdentity();
  await testDeterministicRequests();

  console.log(
    "All OKX private account API tests passed successfully.",
  );
}

runOkxPrivateAccountApiTests().catch((error: unknown) => {
  console.error(
    "OKX private account API tests failed.",
    error,
  );

  process.exitCode = 1;
});