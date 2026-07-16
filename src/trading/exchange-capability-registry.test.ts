import assert from "node:assert/strict";

import {
  EXCHANGE_ACCOUNT_CAPABILITIES,
  EXCHANGE_AUTHENTICATION_CAPABILITIES,
  EXCHANGE_MARKET_DATA_CAPABILITIES,
  EXCHANGE_MARKET_TYPES,
  EXCHANGE_POSITION_MODES,
  EXCHANGE_REALTIME_CAPABILITIES,
  EXCHANGE_SUPPORTED_ORDER_TYPES,
  EXCHANGE_SUPPORTED_TIME_IN_FORCE,
  EXCHANGE_TRADING_CAPABILITIES,
  ExchangeCapabilityRegistry,
  ExchangeCapabilityRegistryError,
  createExchangeCapabilityProfile,
  normalizeCapabilityRequirement,
  profileMatchesRequirement,
  type ExchangeCapabilityProfile,
  type ExchangeCapabilityRegistryErrorCode,
} from "./exchange-connectivity/management/exchange-capability-registry";

function assertCapabilityRegistryError(
  operation: () => unknown,
  expectedCode: ExchangeCapabilityRegistryErrorCode,
): ExchangeCapabilityRegistryError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof ExchangeCapabilityRegistryError,
    `Expected ExchangeCapabilityRegistryError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(
    capturedError.code,
    expectedCode,
  );

  return capturedError;
}

function createFullCapabilityProfile(
  exchangeId = "okx",
): ExchangeCapabilityProfile {
  return createExchangeCapabilityProfile({
    exchangeId,
    marketTypes: [
      "OPTIONS",
      "SPOT",
      "PERPETUAL",
      "SPOT",
      "FUTURES",
    ],
    trading: [
      "QUERY_OPEN_ORDERS",
      "PLACE_ORDER",
      "CANCEL_ORDER",
      "PLACE_ORDER",
      "AMEND_ORDER",
    ],
    marketData: [
      "MARK_PRICE",
      "TICKER",
      "ORDER_BOOK",
      "CANDLES",
      "SERVER_TIME",
      "TICKER",
    ],
    account: [
      "POSITIONS",
      "BALANCES",
      "ACCOUNT_INFORMATION",
      "BALANCES",
    ],
    realtime: [
      "PRIVATE_WEBSOCKET",
      "PUBLIC_WEBSOCKET",
      "ORDER_BOOK_STREAM",
      "ORDER_STREAM",
      "PUBLIC_WEBSOCKET",
    ],
    authentication: [
      "PASSPHRASE",
      "API_KEY",
      "API_SECRET",
      "HMAC_SIGNATURE",
      "API_KEY",
    ],
    orderTypes: [
      "STOP_LIMIT",
      "MARKET",
      "LIMIT",
      "MARKET",
    ],
    timeInForce: [
      "POST_ONLY",
      "GTC",
      "IOC",
      "GTC",
    ],
    positionModes: [
      "HEDGE",
      "ONE_WAY",
      "HEDGE",
    ],
    supportsSandbox: true,
    supportsPrivateApi: true,
    metadata: {
      adapterVersion: "1.0.0",
      region: "global",
    },
  });
}

function testCanonicalConstants(): void {
  assert.deepEqual(
    EXCHANGE_MARKET_TYPES,
    [
      "SPOT",
      "MARGIN",
      "PERPETUAL",
      "FUTURES",
      "OPTIONS",
    ],
  );

  assert.deepEqual(
    EXCHANGE_TRADING_CAPABILITIES,
    [
      "PLACE_ORDER",
      "CANCEL_ORDER",
      "AMEND_ORDER",
      "CANCEL_ALL_ORDERS",
      "BATCH_PLACE_ORDERS",
      "BATCH_CANCEL_ORDERS",
      "QUERY_ORDER",
      "QUERY_OPEN_ORDERS",
      "QUERY_ORDER_HISTORY",
      "QUERY_TRADE_HISTORY",
    ],
  );

  assert.deepEqual(
    EXCHANGE_MARKET_DATA_CAPABILITIES,
    [
      "TICKER",
      "TICKERS",
      "ORDER_BOOK",
      "TRADES",
      "CANDLES",
      "INSTRUMENTS",
      "SERVER_TIME",
      "FUNDING_RATE",
      "OPEN_INTEREST",
      "MARK_PRICE",
      "INDEX_PRICE",
    ],
  );

  assert.deepEqual(
    EXCHANGE_ACCOUNT_CAPABILITIES,
    [
      "ACCOUNT_INFORMATION",
      "BALANCES",
      "POSITIONS",
      "POSITION_HISTORY",
      "FEE_RATES",
      "TRANSACTION_HISTORY",
      "DEPOSIT_HISTORY",
      "WITHDRAWAL_HISTORY",
    ],
  );

  assert.deepEqual(
    EXCHANGE_REALTIME_CAPABILITIES,
    [
      "PUBLIC_WEBSOCKET",
      "PRIVATE_WEBSOCKET",
      "ORDER_BOOK_STREAM",
      "TRADE_STREAM",
      "TICKER_STREAM",
      "CANDLE_STREAM",
      "ORDER_STREAM",
      "POSITION_STREAM",
      "BALANCE_STREAM",
    ],
  );

  assert.deepEqual(
    EXCHANGE_AUTHENTICATION_CAPABILITIES,
    [
      "API_KEY",
      "API_SECRET",
      "PASSPHRASE",
      "RSA_SIGNATURE",
      "HMAC_SIGNATURE",
      "SUBACCOUNT",
      "DEMO_TRADING",
    ],
  );

  assert.deepEqual(
    EXCHANGE_SUPPORTED_ORDER_TYPES,
    [
      "MARKET",
      "LIMIT",
      "STOP",
      "STOP_LIMIT",
      "TAKE_PROFIT",
      "TAKE_PROFIT_LIMIT",
      "TRAILING_STOP",
    ],
  );

  assert.deepEqual(
    EXCHANGE_SUPPORTED_TIME_IN_FORCE,
    [
      "GTC",
      "IOC",
      "FOK",
      "POST_ONLY",
    ],
  );

  assert.deepEqual(
    EXCHANGE_POSITION_MODES,
    [
      "ONE_WAY",
      "HEDGE",
    ],
  );
}

function testProfileCreationAndNormalization(): void {
  const profile =
    createFullCapabilityProfile(
      " OKX ",
    );

  assert.equal(
    profile.exchangeId,
    "okx",
  );

  assert.deepEqual(
    profile.marketTypes,
    [
      "SPOT",
      "PERPETUAL",
      "FUTURES",
      "OPTIONS",
    ],
  );

  assert.deepEqual(
    profile.trading,
    [
      "PLACE_ORDER",
      "CANCEL_ORDER",
      "AMEND_ORDER",
      "QUERY_OPEN_ORDERS",
    ],
  );

  assert.deepEqual(
    profile.marketData,
    [
      "TICKER",
      "ORDER_BOOK",
      "CANDLES",
      "SERVER_TIME",
      "MARK_PRICE",
    ],
  );

  assert.deepEqual(
    profile.account,
    [
      "ACCOUNT_INFORMATION",
      "BALANCES",
      "POSITIONS",
    ],
  );

  assert.deepEqual(
    profile.realtime,
    [
      "PUBLIC_WEBSOCKET",
      "PRIVATE_WEBSOCKET",
      "ORDER_BOOK_STREAM",
      "ORDER_STREAM",
    ],
  );

  assert.deepEqual(
    profile.authentication,
    [
      "API_KEY",
      "API_SECRET",
      "PASSPHRASE",
      "HMAC_SIGNATURE",
    ],
  );

  assert.deepEqual(
    profile.orderTypes,
    [
      "MARKET",
      "LIMIT",
      "STOP_LIMIT",
    ],
  );

  assert.deepEqual(
    profile.timeInForce,
    [
      "GTC",
      "IOC",
      "POST_ONLY",
    ],
  );

  assert.deepEqual(
    profile.positionModes,
    [
      "ONE_WAY",
      "HEDGE",
    ],
  );

  assert.equal(
    profile.supportsSandbox,
    true,
  );

  assert.equal(
    profile.supportsPrivateApi,
    true,
  );

  assert.deepEqual(
    profile.metadata,
    {
      adapterVersion: "1.0.0",
      region: "global",
    },
  );

  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.marketTypes));
  assert.ok(Object.isFrozen(profile.trading));
  assert.ok(Object.isFrozen(profile.marketData));
  assert.ok(Object.isFrozen(profile.account));
  assert.ok(Object.isFrozen(profile.realtime));
  assert.ok(Object.isFrozen(profile.authentication));
  assert.ok(Object.isFrozen(profile.orderTypes));
  assert.ok(Object.isFrozen(profile.timeInForce));
  assert.ok(Object.isFrozen(profile.positionModes));
  assert.ok(Object.isFrozen(profile.metadata));
}

function testProfileDefaults(): void {
  const profile =
    createExchangeCapabilityProfile({
      exchangeId: "binance",
    });

  assert.equal(
    profile.exchangeId,
    "binance",
  );

  assert.deepEqual(
    profile.marketTypes,
    [],
  );

  assert.deepEqual(
    profile.trading,
    [],
  );

  assert.deepEqual(
    profile.marketData,
    [],
  );

  assert.deepEqual(
    profile.account,
    [],
  );

  assert.deepEqual(
    profile.realtime,
    [],
  );

  assert.deepEqual(
    profile.authentication,
    [],
  );

  assert.deepEqual(
    profile.orderTypes,
    [],
  );

  assert.deepEqual(
    profile.timeInForce,
    [],
  );

  assert.deepEqual(
    profile.positionModes,
    [],
  );

  assert.equal(
    profile.supportsSandbox,
    false,
  );

  assert.equal(
    profile.supportsPrivateApi,
    false,
  );

  assert.equal(
    profile.metadata,
    undefined,
  );
}

function testRegistrationAndResolution(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const okx =
    registry.register({
      exchangeId: " OKX ",
      marketTypes: [
        "SPOT",
        "PERPETUAL",
      ],
      trading: [
        "PLACE_ORDER",
        "CANCEL_ORDER",
      ],
      supportsPrivateApi: true,
    });

  const binance =
    registry.register({
      exchangeId: "BINANCE",
      marketTypes: [
        "SPOT",
        "FUTURES",
      ],
      marketData: [
        "TICKER",
        "CANDLES",
      ],
    });

  const bybit =
    registry.register({
      exchangeId: "bybit",
      marketTypes: [
        "SPOT",
        "PERPETUAL",
      ],
      realtime: [
        "PUBLIC_WEBSOCKET",
        "PRIVATE_WEBSOCKET",
      ],
    });

  assert.equal(
    registry.size,
    3,
  );

  assert.equal(
    registry.version,
    3,
  );

  assert.equal(
    registry.get("okx"),
    okx,
  );

  assert.equal(
    registry.get(" OKX "),
    okx,
  );

  assert.equal(
    registry.require("BINANCE"),
    binance,
  );

  assert.equal(
    registry.require("bybit"),
    bybit,
  );

  assert.equal(
    registry.get("kraken"),
    undefined,
  );

  assert.equal(
    registry.has("okx"),
    true,
  );

  assert.equal(
    registry.has("kraken"),
    false,
  );

  assert.deepEqual(
    registry.listExchangeIds(),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  assert.deepEqual(
    registry.list(),
    [
      okx,
      binance,
      bybit,
    ],
  );

  assert.ok(
    Object.isFrozen(
      registry.list(),
    ),
  );

  assert.ok(
    Object.isFrozen(
      registry.listExchangeIds(),
    ),
  );
}

function testDuplicateRegistrationRejection(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const original =
    registry.register({
      exchangeId: "okx",
      marketTypes: [
        "SPOT",
      ],
    });

  const versionBeforeFailure =
    registry.version;

  const sizeBeforeFailure =
    registry.size;

  const snapshotBeforeFailure =
    registry.snapshot();

  const error =
    assertCapabilityRegistryError(
      () =>
        registry.register({
          exchangeId: " OKX ",
          marketTypes: [
            "PERPETUAL",
          ],
        }),
      "CAPABILITY_PROFILE_ALREADY_REGISTERED",
    );

  assert.equal(
    error.exchangeId,
    "okx",
  );

  assert.equal(
    registry.version,
    versionBeforeFailure,
  );

  assert.equal(
    registry.size,
    sizeBeforeFailure,
  );

  assert.deepEqual(
    registry.snapshot(),
    snapshotBeforeFailure,
  );

  assert.equal(
    registry.require("okx"),
    original,
  );
}

function testReplacementPreservesOrder(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  registry.register({
    exchangeId: "okx",
    marketTypes: [
      "SPOT",
    ],
  });

  const binance =
    registry.register({
      exchangeId: "binance",
      marketTypes: [
        "SPOT",
      ],
    });

  const replacement =
    registry.replace({
      exchangeId: "OKX",
      marketTypes: [
        "SPOT",
        "PERPETUAL",
      ],
      trading: [
        "PLACE_ORDER",
      ],
    });

  assert.deepEqual(
    registry.listExchangeIds(),
    [
      "okx",
      "binance",
    ],
  );

  assert.equal(
    registry.require("okx"),
    replacement,
  );

  assert.equal(
    registry.require("binance"),
    binance,
  );

  assert.equal(
    registry.version,
    3,
  );

  assert.deepEqual(
    replacement.marketTypes,
    [
      "SPOT",
      "PERPETUAL",
    ],
  );
}

function testReplacementCreatesMissingProfile(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const profile =
    registry.replace({
      exchangeId: "kraken",
      marketTypes: [
        "SPOT",
      ],
    });

  assert.equal(
    profile.exchangeId,
    "kraken",
  );

  assert.equal(
    registry.size,
    1,
  );

  assert.equal(
    registry.version,
    1,
  );
}

function testCapabilityRequirementNormalization(): void {
  const requirement =
    normalizeCapabilityRequirement({
      marketTypes: [
        "FUTURES",
        "SPOT",
        "SPOT",
      ],
      trading: [
        "CANCEL_ORDER",
        "PLACE_ORDER",
      ],
      orderTypes: [
        "LIMIT",
        "MARKET",
        "LIMIT",
      ],
      requireSandbox: true,
      requirePrivateApi: true,
    });

  assert.deepEqual(
    requirement.marketTypes,
    [
      "SPOT",
      "FUTURES",
    ],
  );

  assert.deepEqual(
    requirement.trading,
    [
      "PLACE_ORDER",
      "CANCEL_ORDER",
    ],
  );

  assert.deepEqual(
    requirement.orderTypes,
    [
      "MARKET",
      "LIMIT",
    ],
  );

  assert.deepEqual(
    requirement.marketData,
    [],
  );

  assert.equal(
    requirement.requireSandbox,
    true,
  );

  assert.equal(
    requirement.requirePrivateApi,
    true,
  );

  assert.ok(
    Object.isFrozen(requirement),
  );

  assert.ok(
    Object.isFrozen(
      requirement.marketTypes,
    ),
  );
}

function testProfileMatching(): void {
  const profile =
    createFullCapabilityProfile();

  assert.equal(
    profileMatchesRequirement(
      profile,
      {},
    ),
    true,
  );

  assert.equal(
    profileMatchesRequirement(
      profile,
      {
        marketTypes: [
          "SPOT",
          "PERPETUAL",
        ],
        trading: [
          "PLACE_ORDER",
          "CANCEL_ORDER",
        ],
        marketData: [
          "TICKER",
          "ORDER_BOOK",
        ],
        account: [
          "BALANCES",
        ],
        realtime: [
          "PUBLIC_WEBSOCKET",
        ],
        authentication: [
          "API_KEY",
          "HMAC_SIGNATURE",
        ],
        orderTypes: [
          "MARKET",
          "LIMIT",
        ],
        timeInForce: [
          "GTC",
        ],
        positionModes: [
          "HEDGE",
        ],
        requireSandbox: true,
        requirePrivateApi: true,
      },
    ),
    true,
  );

  assert.equal(
    profileMatchesRequirement(
      profile,
      {
        marketTypes: [
          "MARGIN",
        ],
      },
    ),
    false,
  );

  assert.equal(
    profileMatchesRequirement(
      profile,
      {
        trading: [
          "BATCH_PLACE_ORDERS",
        ],
      },
    ),
    false,
  );

  assert.equal(
    profileMatchesRequirement(
      profile,
      {
        marketData: [
          "OPEN_INTEREST",
        ],
      },
    ),
    false,
  );

  assert.equal(
    profileMatchesRequirement(
      profile,
      {
        orderTypes: [
          "TRAILING_STOP",
        ],
      },
    ),
    false,
  );
}

function testRegistryMatchingAndSupports(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const okx =
    registry.register({
      exchangeId: "okx",
      marketTypes: [
        "SPOT",
        "PERPETUAL",
      ],
      trading: [
        "PLACE_ORDER",
        "CANCEL_ORDER",
      ],
      marketData: [
        "TICKER",
        "ORDER_BOOK",
      ],
      realtime: [
        "PUBLIC_WEBSOCKET",
        "PRIVATE_WEBSOCKET",
      ],
      supportsSandbox: true,
      supportsPrivateApi: true,
    });

  registry.register({
    exchangeId: "binance",
    marketTypes: [
      "SPOT",
      "FUTURES",
    ],
    trading: [
      "PLACE_ORDER",
      "CANCEL_ORDER",
    ],
    marketData: [
      "TICKER",
      "ORDER_BOOK",
    ],
    realtime: [
      "PUBLIC_WEBSOCKET",
    ],
    supportsSandbox: true,
    supportsPrivateApi: true,
  });

  registry.register({
    exchangeId: "bybit",
    marketTypes: [
      "SPOT",
      "PERPETUAL",
    ],
    trading: [
      "PLACE_ORDER",
    ],
    marketData: [
      "TICKER",
    ],
    realtime: [
      "PUBLIC_WEBSOCKET",
      "PRIVATE_WEBSOCKET",
    ],
    supportsSandbox: false,
    supportsPrivateApi: true,
  });

  const spotTradingMatches =
    registry.findMatching({
      marketTypes: [
        "SPOT",
      ],
      trading: [
        "PLACE_ORDER",
      ],
      marketData: [
        "TICKER",
      ],
    });

  assert.deepEqual(
    spotTradingMatches.map(
      (profile) =>
        profile.exchangeId,
    ),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  const privateRealtimeMatches =
    registry.findMatching({
      realtime: [
        "PRIVATE_WEBSOCKET",
      ],
      requireSandbox: true,
      requirePrivateApi: true,
    });

  assert.deepEqual(
    privateRealtimeMatches,
    [
      okx,
    ],
  );

  assert.equal(
    registry.supports(
      "okx",
      {
        marketTypes: [
          "PERPETUAL",
        ],
        trading: [
          "CANCEL_ORDER",
        ],
      },
    ),
    true,
  );

  assert.equal(
    registry.supports(
      "bybit",
      {
        requireSandbox: true,
      },
    ),
    false,
  );

  assert.equal(
    registry.supports(
      "kraken",
      {
        marketTypes: [
          "SPOT",
        ],
      },
    ),
    false,
  );

  assert.ok(
    Object.isFrozen(
      spotTradingMatches,
    ),
  );
}

function testSnapshotIsolation(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  registry.register({
    exchangeId: "okx",
    marketTypes: [
      "SPOT",
    ],
  });

  const snapshot =
    registry.snapshot();

  assert.equal(
    snapshot.version,
    1,
  );

  assert.equal(
    snapshot.size,
    1,
  );

  assert.deepEqual(
    snapshot.profiles.map(
      (profile) =>
        profile.exchangeId,
    ),
    [
      "okx",
    ],
  );

  assert.ok(
    Object.isFrozen(snapshot),
  );

  assert.ok(
    Object.isFrozen(
      snapshot.profiles,
    ),
  );

  registry.register({
    exchangeId: "binance",
    marketTypes: [
      "SPOT",
    ],
  });

  assert.equal(
    snapshot.version,
    1,
  );

  assert.equal(
    snapshot.size,
    1,
  );

  assert.deepEqual(
    snapshot.profiles.map(
      (profile) =>
        profile.exchangeId,
    ),
    [
      "okx",
    ],
  );

  const currentSnapshot =
    registry.snapshot();

  assert.equal(
    currentSnapshot.version,
    2,
  );

  assert.equal(
    currentSnapshot.size,
    2,
  );
}

function testUnregister(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const okx =
    registry.register({
      exchangeId: "okx",
      marketTypes: [
        "SPOT",
      ],
    });

  registry.register({
    exchangeId: "binance",
    marketTypes: [
      "SPOT",
    ],
  });

  const removed =
    registry.unregister(" OKX ");

  assert.equal(
    removed,
    okx,
  );

  assert.equal(
    registry.size,
    1,
  );

  assert.equal(
    registry.version,
    3,
  );

  assert.equal(
    registry.has("okx"),
    false,
  );

  assert.deepEqual(
    registry.listExchangeIds(),
    [
      "binance",
    ],
  );

  assertCapabilityRegistryError(
    () =>
      registry.unregister("okx"),
    "CAPABILITY_PROFILE_NOT_REGISTERED",
  );
}

function testClear(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const okx =
    registry.register({
      exchangeId: "okx",
      marketTypes: [
        "SPOT",
      ],
    });

  const binance =
    registry.register({
      exchangeId: "binance",
      marketTypes: [
        "SPOT",
      ],
    });

  const removed =
    registry.clear();

  assert.deepEqual(
    removed,
    [
      okx,
      binance,
    ],
  );

  assert.ok(
    Object.isFrozen(removed),
  );

  assert.equal(
    registry.size,
    0,
  );

  assert.equal(
    registry.version,
    3,
  );

  assert.deepEqual(
    registry.list(),
    [],
  );

  const versionAfterClear =
    registry.version;

  const secondClear =
    registry.clear();

  assert.deepEqual(
    secondClear,
    [],
  );

  assert.equal(
    registry.version,
    versionAfterClear,
  );

  registry.register({
    exchangeId: "bybit",
    marketTypes: [
      "SPOT",
    ],
  });

  assert.deepEqual(
    registry.listExchangeIds(),
    [
      "bybit",
    ],
  );
}

function testMissingProfileErrors(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  const error =
    assertCapabilityRegistryError(
      () =>
        registry.require("kraken"),
      "CAPABILITY_PROFILE_NOT_REGISTERED",
    );

  assert.equal(
    error.exchangeId,
    "kraken",
  );

  assert.equal(
    registry.size,
    0,
  );

  assert.equal(
    registry.version,
    0,
  );
}

function testInvalidProfileInput(): void {
  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile(
        null as unknown as {
          readonly exchangeId: string;
        },
      ),
    "INVALID_CAPABILITY_PROFILE",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId: "",
      }),
    "INVALID_EXCHANGE_ID",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId:
          "invalid/exchange",
      }),
    "INVALID_EXCHANGE_ID",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId: "okx",
        marketTypes:
          "SPOT" as unknown as readonly [
            "SPOT",
          ],
      }),
    "INVALID_CAPABILITY_PROFILE",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId: "okx",
        marketTypes: [
          "INVALID" as never,
        ],
      }),
    "INVALID_CAPABILITY_VALUE",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId: "okx",
        trading: [
          "INVALID" as never,
        ],
      }),
    "INVALID_CAPABILITY_VALUE",
  );

  assertCapabilityRegistryError(
    () =>
      createExchangeCapabilityProfile({
        exchangeId: "okx",
        metadata:
          [] as unknown as Readonly<
            Record<string, unknown>
          >,
      }),
    "INVALID_CAPABILITY_PROFILE",
  );
}

function testInvalidRequirementInput(): void {
  assertCapabilityRegistryError(
    () =>
      normalizeCapabilityRequirement(
        null as unknown as {},
      ),
    "INVALID_CAPABILITY_PROFILE",
  );

  assertCapabilityRegistryError(
    () =>
      normalizeCapabilityRequirement({
        marketData: [
          "INVALID" as never,
        ],
      }),
    "INVALID_CAPABILITY_VALUE",
  );

  assertCapabilityRegistryError(
    () =>
      normalizeCapabilityRequirement({
        orderTypes:
          "MARKET" as unknown as readonly [
            "MARKET",
          ],
      }),
    "INVALID_CAPABILITY_PROFILE",
  );
}

function testFailedRegistrationAtomicity(): void {
  const registry =
    new ExchangeCapabilityRegistry();

  registry.register({
    exchangeId: "okx",
    marketTypes: [
      "SPOT",
    ],
  });

  const snapshotBeforeFailure =
    registry.snapshot();

  assertCapabilityRegistryError(
    () =>
      registry.register({
        exchangeId: "binance",
        marketTypes: [
          "INVALID" as never,
        ],
      }),
    "INVALID_CAPABILITY_VALUE",
  );

  assert.deepEqual(
    registry.snapshot(),
    snapshotBeforeFailure,
  );

  assert.equal(
    registry.has("binance"),
    false,
  );
}

function runExchangeCapabilityRegistryTests(): void {
  testCanonicalConstants();
  testProfileCreationAndNormalization();
  testProfileDefaults();
  testRegistrationAndResolution();
  testDuplicateRegistrationRejection();
  testReplacementPreservesOrder();
  testReplacementCreatesMissingProfile();
  testCapabilityRequirementNormalization();
  testProfileMatching();
  testRegistryMatchingAndSupports();
  testSnapshotIsolation();
  testUnregister();
  testClear();
  testMissingProfileErrors();
  testInvalidProfileInput();
  testInvalidRequirementInput();
  testFailedRegistrationAtomicity();

  console.log(
    "All deterministic exchange capability registry tests passed successfully.",
  );
}

runExchangeCapabilityRegistryTests();