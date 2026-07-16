import assert from "node:assert/strict";
import {
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";

import {
  BybitAuthenticationError,
  BybitRequestSigner,
  FixedBybitClock,
  canonicalizeBybitJsonBody,
  canonicalizeBybitQuery,
  createBybitRestSigningPayload,
  createBybitWebSocketSigningPayload,
  signBybitPayload,
  stableJsonStringify,
} from "./exchange-connectivity/adapters/bybit/bybit-authentication";

import type {
  BybitApiCredentials,
} from "./exchange-connectivity/adapters/bybit/bybit-connector-config";

const FIXED_TIMESTAMP =
  1_700_000_000_000;

const HMAC_CREDENTIALS:
  BybitApiCredentials =
    Object.freeze({
      apiKey: "test-api-key",
      secretKey: "test-secret-key",
      signatureAlgorithm:
        "HMAC_SHA256",
    });

function testCanonicalQuery(): void {
  const query =
    canonicalizeBybitQuery({
      symbol: "BTCUSDT",
      category: "spot",
      limit: 50,
      includeEmpty: false,
      ignoredNull: null,
      ignoredUndefined: undefined,
    });

  assert.equal(
    query,
    "category=spot&includeEmpty=false&limit=50&symbol=BTCUSDT",
  );

  assert.equal(
    canonicalizeBybitQuery(),
    "",
  );
}

function testStableJsonSerialization(): void {
  const first =
    stableJsonStringify({
      symbol: "BTCUSDT",
      qty: "1",
      nested: {
        z: 2,
        a: 1,
      },
      array: [
        {
          b: 2,
          a: 1,
        },
      ],
      ignored: undefined,
    });

  const second =
    stableJsonStringify({
      array: [
        {
          a: 1,
          b: 2,
        },
      ],
      nested: {
        a: 1,
        z: 2,
      },
      qty: "1",
      symbol: "BTCUSDT",
    });

  assert.equal(first, second);

  assert.equal(
    first,
    '{"array":[{"a":1,"b":2}],"nested":{"a":1,"z":2},"qty":"1","symbol":"BTCUSDT"}',
  );

  assert.equal(
    canonicalizeBybitJsonBody(),
    "",
  );
}

function testRestSigningPayload(): void {
  const payload =
    createBybitRestSigningPayload({
      timestampMs: FIXED_TIMESTAMP,
      apiKey: "test-api-key",
      receiveWindowMs: 5_000,
      requestPayload:
        "category=spot&symbol=BTCUSDT",
    });

  assert.equal(
    payload,
    "1700000000000test-api-key5000category=spot&symbol=BTCUSDT",
  );
}

function testKnownHmacSignature(): void {
  const payload =
    "1700000000000test-api-key5000category=spot&symbol=BTCUSDT";

  const signature =
    signBybitPayload(
      payload,
      HMAC_CREDENTIALS,
    );

  assert.equal(
    signature,
    "ed8716423fd0aeecebe165fb1d1dc06b563bf8dba5582207d00f128b26be9b16",
  );
}

function testGetRequestSigning(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const result =
    signer.signRestRequest({
      method: "GET",
      credentials:
        HMAC_CREDENTIALS,
      receiveWindowMs: 5_000,
      query: {
        symbol: "BTCUSDT",
        category: "spot",
      },
      referralId: "quantumtradeai",
    });

  assert.equal(
    result.timestampMs,
    FIXED_TIMESTAMP,
  );

  assert.equal(
    result.queryString,
    "category=spot&symbol=BTCUSDT",
  );

  assert.equal(
    result.bodyString,
    "",
  );

  assert.equal(
    result.signingPayload,
    "1700000000000test-api-key5000category=spot&symbol=BTCUSDT",
  );

  assert.equal(
    result.signature,
    "ed8716423fd0aeecebe165fb1d1dc06b563bf8dba5582207d00f128b26be9b16",
  );

  assert.deepEqual(
    result.headers,
    {
      "X-BAPI-API-KEY":
        "test-api-key",
      "X-BAPI-TIMESTAMP":
        "1700000000000",
      "X-BAPI-RECV-WINDOW":
        "5000",
      "X-BAPI-SIGN":
        "ed8716423fd0aeecebe165fb1d1dc06b563bf8dba5582207d00f128b26be9b16",
      "X-Referer":
        "quantumtradeai",
    },
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    Object.isFrozen(result.headers),
    true,
  );
}

function testPostRequestSigning(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const result =
    signer.signRestRequest({
      method: "POST",
      credentials:
        HMAC_CREDENTIALS,
      receiveWindowMs: 5_000,
      body: {
        symbol: "BTCUSDT",
        qty: "1",
        category: "spot",
        side: "Buy",
        orderType: "Market",
      },
    });

  assert.equal(
    result.queryString,
    "",
  );

  assert.equal(
    result.bodyString,
    '{"category":"spot","orderType":"Market","qty":"1","side":"Buy","symbol":"BTCUSDT"}',
  );

  assert.equal(
    result.signingPayload,
    "1700000000000test-api-key5000{\"category\":\"spot\",\"orderType\":\"Market\",\"qty\":\"1\",\"side\":\"Buy\",\"symbol\":\"BTCUSDT\"}",
  );

  assert.equal(
    result.headers[
      "X-BAPI-API-KEY"
    ],
    "test-api-key",
  );
}

function testExplicitTimestampOverridesClock(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(1),
    );

  const result =
    signer.signRestRequest({
      method: "GET",
      credentials:
        HMAC_CREDENTIALS,
      receiveWindowMs: 5_000,
      timestampMs:
        FIXED_TIMESTAMP,
    });

  assert.equal(
    result.timestampMs,
    FIXED_TIMESTAMP,
  );
}

function testWebSocketAuthentication(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const result =
    signer.createWebSocketAuthentication({
      credentials:
        HMAC_CREDENTIALS,
      expiresAfterMs: 10_000,
    });

  assert.equal(
    result.expiresAtMs,
    1_700_000_010_000,
  );

  assert.equal(
    result.signingPayload,
    "GET/realtime1700000010000",
  );

  assert.deepEqual(
    result.message,
    {
      op: "auth",
      args: [
        "test-api-key",
        1_700_000_010_000,
        result.signature,
      ],
    },
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    Object.isFrozen(result.message),
    true,
  );

  assert.equal(
    Object.isFrozen(
      result.message.args,
    ),
    true,
  );
}

function testWebSocketSigningPayload(): void {
  assert.equal(
    createBybitWebSocketSigningPayload(
      1_700_000_010_000,
    ),
    "GET/realtime1700000010000",
  );
}

function testWebSocketTradeHeaders(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const result =
    signer.createWebSocketTradeHeaders({
      credentials:
        HMAC_CREDENTIALS,
      receiveWindowMs: 5_000,
      referralId:
        "quantumtradeai",
    });

  assert.equal(
    result.timestampMs,
    FIXED_TIMESTAMP,
  );

  assert.equal(
    result.signingPayload,
    "1700000000000test-api-key5000",
  );

  assert.deepEqual(
    result.header,
    {
      "X-BAPI-API-KEY":
        "test-api-key",
      "X-BAPI-TIMESTAMP":
        "1700000000000",
      "X-BAPI-RECV-WINDOW":
        "5000",
      "X-BAPI-SIGN":
        result.signature,
      Referer:
        "quantumtradeai",
    },
  );
}

function testRsaSignature(): void {
  const {
    privateKey,
    publicKey,
  } = generateKeyPairSync(
    "rsa",
    {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    },
  );

  const credentials:
    BybitApiCredentials = {
      apiKey: "rsa-api-key",
      secretKey: privateKey,
      signatureAlgorithm:
        "RSA_SHA256",
    };

  const payload =
    "1700000000000rsa-api-key5000category=spot";

  const signature =
    signBybitPayload(
      payload,
      credentials,
    );

  const verified =
    verify(
      "RSA-SHA256",
      Buffer.from(
        payload,
        "utf8",
      ),
      createPublicKey(publicKey),
      Buffer.from(
        signature,
        "base64",
      ),
    );

  assert.equal(verified, true);
}

function testDeterministicSigning(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  const request = {
    method: "GET" as const,
    credentials:
      HMAC_CREDENTIALS,
    receiveWindowMs: 5_000,
    query: {
      category: "spot",
      symbol: "BTCUSDT",
    },
  };

  const first =
    signer.signRestRequest(request);

  const second =
    signer.signRestRequest(request);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(
    first.headers,
    second.headers,
  );
}

function testInvalidGetBody(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  assert.throws(
    () =>
      signer.signRestRequest({
        method: "GET",
        credentials:
          HMAC_CREDENTIALS,
        receiveWindowMs: 5_000,
        body: {
          symbol: "BTCUSDT",
        },
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_GET_BODY_UNSUPPORTED",
        "body",
      ),
  );
}

function testInvalidPostQuery(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  assert.throws(
    () =>
      signer.signRestRequest({
        method: "POST",
        credentials:
          HMAC_CREDENTIALS,
        receiveWindowMs: 5_000,
        query: {
          symbol: "BTCUSDT",
        },
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_POST_QUERY_UNSUPPORTED",
        "query",
      ),
  );
}

function testInvalidCredentials(): void {
  assert.throws(
    () =>
      signBybitPayload(
        "payload",
        {
          apiKey: " ",
          secretKey: "secret",
          signatureAlgorithm:
            "HMAC_SHA256",
        },
      ),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_API_KEY_REQUIRED",
        "credentials.apiKey",
      ),
  );

  assert.throws(
    () =>
      signBybitPayload(
        "payload",
        {
          apiKey: "key",
          secretKey: " ",
          signatureAlgorithm:
            "HMAC_SHA256",
        },
      ),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_SECRET_KEY_REQUIRED",
        "credentials.secretKey",
      ),
  );
}

function testInvalidReceiveWindow(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  assert.throws(
    () =>
      signer.signRestRequest({
        method: "GET",
        credentials:
          HMAC_CREDENTIALS,
        receiveWindowMs: 0,
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_RECEIVE_WINDOW_INVALID",
        "receiveWindowMs",
      ),
  );

  assert.throws(
    () =>
      signer.signRestRequest({
        method: "GET",
        credentials:
          HMAC_CREDENTIALS,
        receiveWindowMs:
          60_001,
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_RECEIVE_WINDOW_INVALID",
        "receiveWindowMs",
      ),
  );
}

function testInvalidTimestamp(): void {
  assert.throws(
    () =>
      new FixedBybitClock(-1),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_TIMESTAMP_INVALID",
        "timestampMs",
      ),
  );

  assert.throws(
    () =>
      createBybitWebSocketSigningPayload(
        Number.NaN,
      ),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_TIMESTAMP_INVALID",
        "expiresAtMs",
      ),
  );
}

function testAmbiguousWebSocketExpiration(): void {
  const signer =
    new BybitRequestSigner(
      new FixedBybitClock(
        FIXED_TIMESTAMP,
      ),
    );

  assert.throws(
    () =>
      signer.createWebSocketAuthentication({
        credentials:
          HMAC_CREDENTIALS,
        expiresAtMs:
          FIXED_TIMESTAMP + 1_000,
        expiresAfterMs: 1_000,
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_WS_EXPIRATION_AMBIGUOUS",
        "expiresAtMs",
      ),
  );
}

function testInvalidJsonValues(): void {
  assert.throws(
    () =>
      stableJsonStringify({
        value: Number.NaN,
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_JSON_NUMBER_INVALID",
        "body",
      ),
  );

  assert.throws(
    () =>
      stableJsonStringify({
        value: BigInt(1),
      }),
    (error: unknown) =>
      isAuthenticationError(
        error,
        "BYBIT_JSON_VALUE_UNSUPPORTED",
        "body",
      ),
  );
}

function testAuthenticationErrorIdentity(): void {
  const error =
    new BybitAuthenticationError(
      "TEST_CODE",
      "test.path",
      "Test message.",
    );

  assert.equal(
    error.name,
    "BybitAuthenticationError",
  );

  assert.equal(
    error.code,
    "TEST_CODE",
  );

  assert.equal(
    error.path,
    "test.path",
  );

  assert.equal(
    error.message,
    "Test message.",
  );

  assert.ok(error instanceof Error);
}

function isAuthenticationError(
  error: unknown,
  code: string,
  path: string,
): boolean {
  return (
    error instanceof
      BybitAuthenticationError &&
    error.code === code &&
    error.path === path
  );
}

function runBybitAuthenticationTests(): void {
  testCanonicalQuery();
  testStableJsonSerialization();
  testRestSigningPayload();
  testKnownHmacSignature();
  testGetRequestSigning();
  testPostRequestSigning();
  testExplicitTimestampOverridesClock();
  testWebSocketAuthentication();
  testWebSocketSigningPayload();
  testWebSocketTradeHeaders();
  testRsaSignature();
  testDeterministicSigning();
  testInvalidGetBody();
  testInvalidPostQuery();
  testInvalidCredentials();
  testInvalidReceiveWindow();
  testInvalidTimestamp();
  testAmbiguousWebSocketExpiration();
  testInvalidJsonValues();
  testAuthenticationErrorIdentity();

  console.log(
    "All Bybit authentication tests passed successfully.",
  );
}

runBybitAuthenticationTests();
