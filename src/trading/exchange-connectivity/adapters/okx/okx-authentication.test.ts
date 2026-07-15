import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  OKX_ACCESS_KEY_HEADER,
  OKX_ACCESS_PASSPHRASE_HEADER,
  OKX_ACCESS_SIGN_HEADER,
  OKX_ACCESS_TIMESTAMP_HEADER,
  OKX_SIMULATED_TRADING_HEADER,
  OkxAuthenticationError,
  authenticateOkxRestRequest,
  createDeterministicOkxClock,
  createOkxAuthenticationHeaders,
  createOkxSignature,
  createOkxSignaturePrehash,
  formatOkxTimestamp,
  hasOkxAuthenticationHeaders,
  isOkxIsoTimestamp,
  isOkxSimulatedTradingRequest,
} from "./okx-authentication";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createOkxPrivateRestRequest,
  createOkxPublicRestRequest,
} from "./okx-rest-contracts";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;
const FIXED_TIMESTAMP = "2023-11-14T22:13:20.000Z";

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function testTimestampFormatting(): void {
  assert.equal(
    formatOkxTimestamp(FIXED_TIMESTAMP_MS),
    FIXED_TIMESTAMP,
  );

  assert.equal(
    formatOkxTimestamp(0),
    "1970-01-01T00:00:00.000Z",
  );
}

function testInvalidTimestampFormatting(): void {
  assert.throws(
    () => formatOkxTimestamp(-1),
    /timestampMs must be a non-negative integer/,
  );

  assert.throws(
    () => formatOkxTimestamp(1.5),
    /timestampMs must be a non-negative integer/,
  );

  assert.throws(
    () =>
      formatOkxTimestamp(
        8_640_000_000_000_001,
      ),
    /timestampMs exceeds the supported JavaScript date range/,
  );
}

function testIsoTimestampGuard(): void {
  assert.equal(
    isOkxIsoTimestamp(FIXED_TIMESTAMP),
    true,
  );

  assert.equal(
    isOkxIsoTimestamp("1970-01-01T00:00:00.000Z"),
    true,
  );

  assert.equal(
    isOkxIsoTimestamp("2023-11-14T22:13:20Z"),
    false,
  );

  assert.equal(
    isOkxIsoTimestamp("2023-11-14 22:13:20"),
    false,
  );

  assert.equal(isOkxIsoTimestamp("invalid"), false);
  assert.equal(isOkxIsoTimestamp(""), false);
}

function testGetSignaturePrehash(): void {
  const prehash = createOkxSignaturePrehash({
    timestamp: FIXED_TIMESTAMP,
    method: "GET",
    requestPath:
      "/api/v5/market/ticker?instId=BTC-USDT",
  });

  assert.equal(
    prehash,
    `${FIXED_TIMESTAMP}GET` +
      "/api/v5/market/ticker?instId=BTC-USDT",
  );
}

function testPostSignaturePrehash(): void {
  const body = {
    instId: "BTC-USDT",
    tdMode: "cash",
    side: "buy",
    ordType: "market",
    sz: "0.01",
  };

  const prehash = createOkxSignaturePrehash({
    timestamp: FIXED_TIMESTAMP,
    method: "POST",
    requestPath: "/api/v5/trade/order",
    body,
  });

  assert.equal(
    prehash,
    `${FIXED_TIMESTAMP}POST/api/v5/trade/order` +
      JSON.stringify(body),
  );
}

function testRawStringBodyPrehash(): void {
  const body = '{"instId":"BTC-USDT"}';

  const prehash = createOkxSignaturePrehash({
    timestamp: FIXED_TIMESTAMP,
    method: "POST",
    requestPath: "/api/v5/trade/order",
    body,
  });

  assert.equal(
    prehash,
    `${FIXED_TIMESTAMP}POST/api/v5/trade/order${body}`,
  );
}

function testSignatureCreation(): void {
  const requestPath =
    "/api/v5/market/ticker?instId=BTC-USDT";

  const expectedPrehash =
    `${FIXED_TIMESTAMP}GET${requestPath}`;

  const expectedSignature = createHmac(
    "sha256",
    TEST_CREDENTIALS.secretKey,
  )
    .update(expectedPrehash, "utf8")
    .digest("base64");

  const actualSignature = createOkxSignature({
    timestamp: FIXED_TIMESTAMP,
    method: "GET",
    requestPath,
    secretKey: TEST_CREDENTIALS.secretKey,
  });

  assert.equal(actualSignature, expectedSignature);
}

function testPostSignatureCreation(): void {
  const body = {
    instId: "ETH-USDT",
    tdMode: "cash",
    side: "sell",
    ordType: "limit",
    px: "3500",
    sz: "0.25",
  };

  const requestPath = "/api/v5/trade/order";

  const expectedPrehash =
    `${FIXED_TIMESTAMP}POST${requestPath}` +
    JSON.stringify(body);

  const expectedSignature = createHmac(
    "sha256",
    TEST_CREDENTIALS.secretKey,
  )
    .update(expectedPrehash, "utf8")
    .digest("base64");

  const actualSignature = createOkxSignature({
    timestamp: FIXED_TIMESTAMP,
    method: "POST",
    requestPath,
    body,
    secretKey: TEST_CREDENTIALS.secretKey,
  });

  assert.equal(actualSignature, expectedSignature);
}

function testAuthenticationHeaders(): void {
  const headers = createOkxAuthenticationHeaders({
    credentials: TEST_CREDENTIALS,
    timestamp: FIXED_TIMESTAMP,
    signature: "generated-signature",
    simulatedTrading: false,
    additionalHeaders: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  assert.deepEqual(headers, {
    accept: "application/json",
    "content-type": "application/json",
    [OKX_ACCESS_KEY_HEADER]: "test-api-key",
    [OKX_ACCESS_PASSPHRASE_HEADER]:
      "test-passphrase",
    [OKX_ACCESS_SIGN_HEADER]: "generated-signature",
    [OKX_ACCESS_TIMESTAMP_HEADER]:
      FIXED_TIMESTAMP,
  });

  assert.equal(Object.isFrozen(headers), true);
  assert.equal(hasOkxAuthenticationHeaders(headers), true);
  assert.equal(isOkxSimulatedTradingRequest(headers), false);
}

function testDemoTradingHeaders(): void {
  const headers = createOkxAuthenticationHeaders({
    credentials: TEST_CREDENTIALS,
    timestamp: FIXED_TIMESTAMP,
    signature: "generated-signature",
    simulatedTrading: true,
  });

  assert.equal(
    headers[OKX_SIMULATED_TRADING_HEADER],
    "1",
  );

  assert.equal(hasOkxAuthenticationHeaders(headers), true);
  assert.equal(isOkxSimulatedTradingRequest(headers), true);
}

function testAuthenticationHeadersOverrideProtectedValues(): void {
  const headers = createOkxAuthenticationHeaders({
    credentials: TEST_CREDENTIALS,
    timestamp: FIXED_TIMESTAMP,
    signature: "correct-signature",
    simulatedTrading: false,
    additionalHeaders: {
      [OKX_ACCESS_KEY_HEADER]: "incorrect-key",
      [OKX_ACCESS_SIGN_HEADER]: "incorrect-signature",
      [OKX_ACCESS_TIMESTAMP_HEADER]:
        "1970-01-01T00:00:00.000Z",
      [OKX_ACCESS_PASSPHRASE_HEADER]:
        "incorrect-passphrase",
    },
  });

  assert.equal(
    headers[OKX_ACCESS_KEY_HEADER],
    TEST_CREDENTIALS.apiKey,
  );

  assert.equal(
    headers[OKX_ACCESS_SIGN_HEADER],
    "correct-signature",
  );

  assert.equal(
    headers[OKX_ACCESS_TIMESTAMP_HEADER],
    FIXED_TIMESTAMP,
  );

  assert.equal(
    headers[OKX_ACCESS_PASSPHRASE_HEADER],
    TEST_CREDENTIALS.passphrase,
  );
}

function testAuthenticatedGetRequest(): void {
  const configuration = createOkxConnectorConfiguration({
    credentials: TEST_CREDENTIALS,
  });

  const request = createOkxPrivateRestRequest({
    method: "GET",
    path: "/api/v5/account/balance",
    query: {
      ccy: "BTC,USDT",
    },
    headers: {
      Accept: "application/json",
    },
    requestId: "balance-request-001",
  });

  const authenticated = authenticateOkxRestRequest({
    configuration,
    request,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
  });

  const expectedRequestPath =
    "/api/v5/account/balance?ccy=BTC%2CUSDT";

  const expectedPrehash =
    `${FIXED_TIMESTAMP}GET${expectedRequestPath}`;

  const expectedSignature = createHmac(
    "sha256",
    TEST_CREDENTIALS.secretKey,
  )
    .update(expectedPrehash, "utf8")
    .digest("base64");

  assert.equal(
    authenticated.request,
    request,
  );

  assert.equal(
    authenticated.requestPath,
    expectedRequestPath,
  );

  assert.equal(authenticated.serializedBody, "");
  assert.equal(authenticated.timestamp, FIXED_TIMESTAMP);
  assert.equal(authenticated.prehash, expectedPrehash);
  assert.equal(
    authenticated.signature,
    expectedSignature,
  );

  assert.equal(
    authenticated.headers[OKX_ACCESS_KEY_HEADER],
    TEST_CREDENTIALS.apiKey,
  );

  assert.equal(
    authenticated.headers[OKX_ACCESS_SIGN_HEADER],
    expectedSignature,
  );

  assert.equal(
    authenticated.headers[
      OKX_ACCESS_TIMESTAMP_HEADER
    ],
    FIXED_TIMESTAMP,
  );

  assert.equal(
    authenticated.headers[
      OKX_ACCESS_PASSPHRASE_HEADER
    ],
    TEST_CREDENTIALS.passphrase,
  );

  assert.equal(
    authenticated.headers.accept,
    "application/json",
  );

  assert.equal(
    isOkxSimulatedTradingRequest(
      authenticated.headers,
    ),
    false,
  );

  assert.equal(Object.isFrozen(authenticated), true);
  assert.equal(
    Object.isFrozen(authenticated.headers),
    true,
  );
}

function testAuthenticatedPostRequest(): void {
  const configuration = createOkxConnectorConfiguration({
    environment: "demo",
    credentials: TEST_CREDENTIALS,
  });

  const body = {
    instId: "BTC-USDT",
    tdMode: "cash",
    side: "buy",
    ordType: "market",
    sz: "0.01",
  } as const;

  const request = createOkxPrivateRestRequest({
    method: "POST",
    path: "/api/v5/trade/order",
    body,
  });

  const authenticated = authenticateOkxRestRequest({
    configuration,
    request,
    clock: createDeterministicOkxClock(
      FIXED_TIMESTAMP_MS,
    ),
  });

  const expectedSerializedBody = JSON.stringify(body);

  const expectedPrehash =
    `${FIXED_TIMESTAMP}POST/api/v5/trade/order` +
    expectedSerializedBody;

  assert.equal(
    authenticated.requestPath,
    "/api/v5/trade/order",
  );

  assert.equal(
    authenticated.serializedBody,
    expectedSerializedBody,
  );

  assert.equal(
    authenticated.prehash,
    expectedPrehash,
  );

  assert.equal(
    isOkxSimulatedTradingRequest(
      authenticated.headers,
    ),
    true,
  );

  assert.equal(
    authenticated.headers[
      OKX_SIMULATED_TRADING_HEADER
    ],
    "1",
  );
}

function testPublicRequestCannotBeAuthenticated(): void {
  const configuration = createOkxConnectorConfiguration({
    credentials: TEST_CREDENTIALS,
  });

  const request = createOkxPublicRestRequest({
    method: "GET",
    path: "/api/v5/public/time",
  });

  assert.throws(
    () =>
      authenticateOkxRestRequest({
        configuration,
        request,
        clock: createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      }),
    /Only private OKX REST requests can be authenticated/,
  );
}

function testMissingCredentials(): void {
  const configuration =
    createOkxConnectorConfiguration();

  const request = createOkxPrivateRestRequest({
    method: "GET",
    path: "/api/v5/account/balance",
  });

  assert.throws(
    () =>
      authenticateOkxRestRequest({
        configuration,
        request,
        clock: createDeterministicOkxClock(
          FIXED_TIMESTAMP_MS,
        ),
      }),
    /OKX API credentials are required for private exchange operations/,
  );
}

function testInvalidCredentials(): void {
  assert.throws(
    () =>
      createOkxAuthenticationHeaders({
        credentials: {
          apiKey: "",
          secretKey: "secret",
          passphrase: "passphrase",
        },
        timestamp: FIXED_TIMESTAMP,
        signature: "signature",
        simulatedTrading: false,
      }),
    /credentials\.apiKey must not be empty/,
  );

  assert.throws(
    () =>
      createOkxAuthenticationHeaders({
        credentials: {
          apiKey: "key",
          secretKey: "",
          passphrase: "passphrase",
        },
        timestamp: FIXED_TIMESTAMP,
        signature: "signature",
        simulatedTrading: false,
      }),
    /credentials\.secretKey must not be empty/,
  );

  assert.throws(
    () =>
      createOkxAuthenticationHeaders({
        credentials: {
          apiKey: "key",
          secretKey: "secret",
          passphrase: "",
        },
        timestamp: FIXED_TIMESTAMP,
        signature: "signature",
        simulatedTrading: false,
      }),
    /credentials\.passphrase must not be empty/,
  );
}

function testInvalidSignatureInput(): void {
  assert.throws(
    () =>
      createOkxSignature({
        timestamp: FIXED_TIMESTAMP,
        method: "GET",
        requestPath: "/api/v5/public/time",
        secretKey: "",
      }),
    /secretKey must not be empty/,
  );

  assert.throws(
    () =>
      createOkxSignaturePrehash({
        timestamp: "invalid",
        method: "GET",
        requestPath: "/api/v5/public/time",
      }),
    /timestamp must be a valid ISO-8601 timestamp/,
  );

  assert.throws(
    () =>
      createOkxSignaturePrehash({
        timestamp: "2023-11-14T22:13:20Z",
        method: "GET",
        requestPath: "/api/v5/public/time",
      }),
    /timestamp must use canonical UTC ISO-8601 format/,
  );

  assert.throws(
    () =>
      createOkxSignaturePrehash({
        timestamp: FIXED_TIMESTAMP,
        method: "GET",
        requestPath: "/public/time",
      }),
    /requestPath must begin with "\/api\/v5\/"/,
  );

  assert.throws(
    () =>
      createOkxSignaturePrehash({
        timestamp: FIXED_TIMESTAMP,
        method: "GET",
        requestPath:
          "/api/v5/public/time#fragment",
      }),
    /requestPath must not contain a URL fragment/,
  );
}

function testInvalidAuthenticationHeaders(): void {
  assert.throws(
    () =>
      createOkxAuthenticationHeaders({
        credentials: TEST_CREDENTIALS,
        timestamp: FIXED_TIMESTAMP,
        signature: "",
        simulatedTrading: false,
      }),
    /signature must not be empty/,
  );

  assert.throws(
    () =>
      createOkxAuthenticationHeaders({
        credentials: TEST_CREDENTIALS,
        timestamp: "invalid",
        signature: "signature",
        simulatedTrading: false,
      }),
    /timestamp must be a valid ISO-8601 timestamp/,
  );
}

function testHeaderDetection(): void {
  assert.equal(
    hasOkxAuthenticationHeaders({
      [OKX_ACCESS_KEY_HEADER]: "key",
      [OKX_ACCESS_SIGN_HEADER]: "signature",
      [OKX_ACCESS_TIMESTAMP_HEADER]:
        FIXED_TIMESTAMP,
      [OKX_ACCESS_PASSPHRASE_HEADER]:
        "passphrase",
    }),
    true,
  );

  assert.equal(
    hasOkxAuthenticationHeaders({
      [OKX_ACCESS_KEY_HEADER]: "key",
      [OKX_ACCESS_SIGN_HEADER]: "signature",
      [OKX_ACCESS_TIMESTAMP_HEADER]:
        FIXED_TIMESTAMP,
    }),
    false,
  );

  assert.equal(
    hasOkxAuthenticationHeaders({
      [OKX_ACCESS_KEY_HEADER]: " ",
      [OKX_ACCESS_SIGN_HEADER]: "signature",
      [OKX_ACCESS_TIMESTAMP_HEADER]:
        FIXED_TIMESTAMP,
      [OKX_ACCESS_PASSPHRASE_HEADER]:
        "passphrase",
    }),
    false,
  );
}

function testDeterministicClock(): void {
  const clock = createDeterministicOkxClock(
    FIXED_TIMESTAMP_MS,
  );

  assert.equal(clock.now(), FIXED_TIMESTAMP_MS);
  assert.equal(clock.now(), FIXED_TIMESTAMP_MS);
  assert.equal(Object.isFrozen(clock), true);

  assert.throws(
    () => createDeterministicOkxClock(-1),
    /timestampMs must be a non-negative integer/,
  );
}

function testDeterministicAuthentication(): void {
  const configuration = createOkxConnectorConfiguration({
    credentials: TEST_CREDENTIALS,
  });

  const request = createOkxPrivateRestRequest({
    method: "GET",
    path: "/api/v5/account/balance",
    query: {
      ccy: "USDT",
    },
  });

  const clock = createDeterministicOkxClock(
    FIXED_TIMESTAMP_MS,
  );

  const first = authenticateOkxRestRequest({
    configuration,
    request,
    clock,
  });

  const second = authenticateOkxRestRequest({
    configuration,
    request,
    clock,
  });

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.headers, second.headers);

  assert.equal(first.prehash, second.prehash);
  assert.equal(first.signature, second.signature);
}

function testAuthenticationErrorIdentity(): void {
  const error = new OkxAuthenticationError(
    "Authentication failed.",
  );

  assert.equal(error.name, "OkxAuthenticationError");
  assert.equal(error.code, "OKX_AUTHENTICATION_ERROR");
  assert.equal(
    error.message,
    "Authentication failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(error instanceof OkxAuthenticationError);
}

function runOkxAuthenticationTests(): void {
  testTimestampFormatting();
  testInvalidTimestampFormatting();
  testIsoTimestampGuard();
  testGetSignaturePrehash();
  testPostSignaturePrehash();
  testRawStringBodyPrehash();
  testSignatureCreation();
  testPostSignatureCreation();
  testAuthenticationHeaders();
  testDemoTradingHeaders();
  testAuthenticationHeadersOverrideProtectedValues();
  testAuthenticatedGetRequest();
  testAuthenticatedPostRequest();
  testPublicRequestCannotBeAuthenticated();
  testMissingCredentials();
  testInvalidCredentials();
  testInvalidSignatureInput();
  testInvalidAuthenticationHeaders();
  testHeaderDetection();
  testDeterministicClock();
  testDeterministicAuthentication();
  testAuthenticationErrorIdentity();

  console.log(
    "All OKX authentication tests passed successfully.",
  );
}

runOkxAuthenticationTests();