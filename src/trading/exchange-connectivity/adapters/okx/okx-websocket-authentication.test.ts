import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  createOkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  OKX_WEBSOCKET_LOGIN_METHOD,
  OKX_WEBSOCKET_LOGIN_REQUEST_PATH,
  OkxWebSocketAuthenticationError,
  authenticateOkxWebSocketLogin,
  createDeterministicOkxWebSocketClock,
  createOkxWebSocketSignature,
  createOkxWebSocketSignaturePrehash,
  formatOkxWebSocketTimestamp,
  isOkxWebSocketTimestamp,
} from "./okx-websocket-authentication";

const FIXED_TIMESTAMP_MS = 1_700_000_000_000;
const FIXED_TIMESTAMP_SECONDS = "1700000000";

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
});

function testTimestampFormatting(): void {
  assert.equal(
    formatOkxWebSocketTimestamp(
      FIXED_TIMESTAMP_MS,
    ),
    FIXED_TIMESTAMP_SECONDS,
  );

  assert.equal(
    formatOkxWebSocketTimestamp(0),
    "0",
  );

  assert.equal(
    formatOkxWebSocketTimestamp(1_999),
    "1",
  );
}

function testInvalidTimestampFormatting(): void {
  assert.throws(
    () =>
      formatOkxWebSocketTimestamp(-1),
    /timestampMs must be a non-negative integer/,
  );

  assert.throws(
    () =>
      formatOkxWebSocketTimestamp(1.5),
    /timestampMs must be a non-negative integer/,
  );

  assert.throws(
    () =>
      formatOkxWebSocketTimestamp(
        8_640_000_000_000_001,
      ),
    /timestampMs exceeds the supported JavaScript date range/,
  );
}

function testTimestampGuard(): void {
  assert.equal(
    isOkxWebSocketTimestamp(
      FIXED_TIMESTAMP_SECONDS,
    ),
    true,
  );

  assert.equal(
    isOkxWebSocketTimestamp("0"),
    true,
  );

  assert.equal(
    isOkxWebSocketTimestamp("001"),
    false,
  );

  assert.equal(
    isOkxWebSocketTimestamp("-1"),
    false,
  );

  assert.equal(
    isOkxWebSocketTimestamp("1.5"),
    false,
  );

  assert.equal(
    isOkxWebSocketTimestamp("invalid"),
    false,
  );

  assert.equal(
    isOkxWebSocketTimestamp(""),
    false,
  );
}

function testSignaturePrehash(): void {
  const prehash =
    createOkxWebSocketSignaturePrehash(
      FIXED_TIMESTAMP_SECONDS,
    );

  assert.equal(
    prehash,
    FIXED_TIMESTAMP_SECONDS +
      OKX_WEBSOCKET_LOGIN_METHOD +
      OKX_WEBSOCKET_LOGIN_REQUEST_PATH,
  );

  assert.equal(
    prehash,
    "1700000000GET/users/self/verify",
  );
}

function testInvalidSignaturePrehash(): void {
  assert.throws(
    () =>
      createOkxWebSocketSignaturePrehash(
        "invalid",
      ),
    /timestamp must contain Unix epoch seconds/,
  );

  assert.throws(
    () =>
      createOkxWebSocketSignaturePrehash(
        "001700000000",
      ),
    /timestamp must use canonical Unix epoch seconds/,
  );

  assert.throws(
    () =>
      createOkxWebSocketSignaturePrehash(
        "-1",
      ),
    /timestamp must contain Unix epoch seconds/,
  );
}

function testSignatureCreation(): void {
  const expectedPrehash =
    "1700000000GET/users/self/verify";

  const expectedSignature = createHmac(
    "sha256",
    TEST_CREDENTIALS.secretKey,
  )
    .update(expectedPrehash, "utf8")
    .digest("base64");

  const actualSignature =
    createOkxWebSocketSignature({
      timestamp: FIXED_TIMESTAMP_SECONDS,
      secretKey:
        TEST_CREDENTIALS.secretKey,
    });

  assert.equal(
    actualSignature,
    expectedSignature,
  );
}

function testInvalidSignatureCreation(): void {
  assert.throws(
    () =>
      createOkxWebSocketSignature({
        timestamp:
          FIXED_TIMESTAMP_SECONDS,
        secretKey: "",
      }),
    /secretKey must not be empty/,
  );

  assert.throws(
    () =>
      createOkxWebSocketSignature({
        timestamp: "invalid",
        secretKey:
          TEST_CREDENTIALS.secretKey,
      }),
    /timestamp must contain Unix epoch seconds/,
  );
}

function testAuthenticatedLogin(): void {
  const configuration =
    createOkxConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
    });

  const authenticated =
    authenticateOkxWebSocketLogin({
      configuration,
      clock:
        createDeterministicOkxWebSocketClock(
          FIXED_TIMESTAMP_MS,
        ),
    });

  const expectedPrehash =
    "1700000000GET/users/self/verify";

  const expectedSignature = createHmac(
    "sha256",
    TEST_CREDENTIALS.secretKey,
  )
    .update(expectedPrehash, "utf8")
    .digest("base64");

  assert.deepEqual(authenticated, {
    timestamp:
      FIXED_TIMESTAMP_SECONDS,
    prehash: expectedPrehash,
    signature: expectedSignature,
    request: {
      op: "login",
      args: [
        {
          apiKey:
            TEST_CREDENTIALS.apiKey,
          passphrase:
            TEST_CREDENTIALS.passphrase,
          timestamp:
            FIXED_TIMESTAMP_SECONDS,
          sign: expectedSignature,
        },
      ],
    },
  });

  assert.equal(
    Object.isFrozen(authenticated),
    true,
  );

  assert.equal(
    Object.isFrozen(
      authenticated.request,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      authenticated.request.args,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      authenticated.request.args[0],
    ),
    true,
  );
}

function testMissingCredentials(): void {
  const configuration =
    createOkxConnectorConfiguration();

  assert.throws(
    () =>
      authenticateOkxWebSocketLogin({
        configuration,
        clock:
          createDeterministicOkxWebSocketClock(
            FIXED_TIMESTAMP_MS,
          ),
      }),
    /OKX API credentials are required for private exchange operations/,
  );
}

function testInvalidClock(): void {
  const configuration =
    createOkxConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
    });

  assert.throws(
    () =>
      authenticateOkxWebSocketLogin({
        configuration,
        clock: {} as never,
      }),
    /clock must implement OkxClock/,
  );

  assert.throws(
    () =>
      authenticateOkxWebSocketLogin({
        configuration,
        clock: {
          now(): number {
            return -1;
          },
        },
      }),
    /timestampMs must be a non-negative integer/,
  );

  assert.throws(
    () =>
      authenticateOkxWebSocketLogin({
        configuration,
        clock: {
          now(): number {
            return 1.5;
          },
        },
      }),
    /timestampMs must be a non-negative integer/,
  );
}

function testDeterministicClock(): void {
  const clock =
    createDeterministicOkxWebSocketClock(
      FIXED_TIMESTAMP_MS,
    );

  assert.equal(
    clock.now(),
    FIXED_TIMESTAMP_MS,
  );

  assert.equal(
    clock.now(),
    FIXED_TIMESTAMP_MS,
  );

  assert.equal(
    Object.isFrozen(clock),
    true,
  );

  assert.throws(
    () =>
      createDeterministicOkxWebSocketClock(
        -1,
      ),
    /timestampMs must be a non-negative integer/,
  );
}

function testDeterministicAuthentication(): void {
  const configuration =
    createOkxConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
    });

  const clock =
    createDeterministicOkxWebSocketClock(
      FIXED_TIMESTAMP_MS,
    );

  const first =
    authenticateOkxWebSocketLogin({
      configuration,
      clock,
    });

  const second =
    authenticateOkxWebSocketLogin({
      configuration,
      clock,
    });

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(
    first.request,
    second.request,
  );
  assert.notEqual(
    first.request.args,
    second.request.args,
  );

  assert.equal(
    first.signature,
    second.signature,
  );

  assert.equal(
    first.prehash,
    second.prehash,
  );
}

function testAuthenticationErrorIdentity(): void {
  const error =
    new OkxWebSocketAuthenticationError(
      "Authentication failed.",
    );

  assert.equal(
    error.name,
    "OkxWebSocketAuthenticationError",
  );

  assert.equal(
    error.code,
    "OKX_WEBSOCKET_AUTHENTICATION_ERROR",
  );

  assert.equal(
    error.message,
    "Authentication failed.",
  );

  assert.ok(error instanceof Error);
  assert.ok(
    error instanceof
      OkxWebSocketAuthenticationError,
  );
}

function runOkxWebSocketAuthenticationTests(): void {
  testTimestampFormatting();
  testInvalidTimestampFormatting();
  testTimestampGuard();
  testSignaturePrehash();
  testInvalidSignaturePrehash();
  testSignatureCreation();
  testInvalidSignatureCreation();
  testAuthenticatedLogin();
  testMissingCredentials();
  testInvalidClock();
  testDeterministicClock();
  testDeterministicAuthentication();
  testAuthenticationErrorIdentity();

  console.log(
    "All OKX WebSocket authentication tests passed successfully.",
  );
}

runOkxWebSocketAuthenticationTests();