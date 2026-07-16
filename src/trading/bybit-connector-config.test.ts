import assert from "node:assert/strict";

import {
  BYBIT_DEFAULT_DOMAINS,
  BybitConnectorConfigError,
  createBybitConnectorConfiguration,
  createDefaultBybitConnectorConfig,
  mapBybitEnvironmentToExchangeEnvironment,
  requiresBybitCredentials,
  resolveBybitDomains,
  resolveBybitPublicWebSocketUrl,
  validateBybitConnectorConfig,
  type BybitConnectorConfig,
  type BybitDomainConfig,
} from "./exchange-connectivity/adapters/bybit/bybit-connector-config";

const TEST_CREDENTIALS = Object.freeze({
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  signatureAlgorithm: "HMAC_SHA256" as const,
});

const CUSTOM_DOMAINS: BybitDomainConfig = Object.freeze({
  environment: "CUSTOM",
  rest: Object.freeze({
    baseUrl: "https://bybit.example.com/",
  }),
  webSocket: Object.freeze({
    public: Object.freeze({
      spotUrl: "wss://stream.example.com/v5/public/spot///",
      linearUrl: "wss://stream.example.com/v5/public/linear///",
      inverseUrl: "wss://stream.example.com/v5/public/inverse///",
      optionUrl: "wss://stream.example.com/v5/public/option///",
    }),
    privateUrl: "wss://stream.example.com/v5/private///",
    tradeUrl: "wss://stream.example.com/v5/trade///",
  }),
});

function testDefaultConfiguration(): void {
  const configuration =
    createDefaultBybitConnectorConfig();

  assert.equal(configuration.connectorId, "bybit");
  assert.equal(configuration.environment, "PRODUCTION");
  assert.equal(
    configuration.bybitEnvironment,
    "PRODUCTION",
  );

  assert.deepEqual(
    configuration.enabledMarketTypes,
    ["SPOT"],
  );

  assert.deepEqual(
    configuration.enabledCategories,
    ["SPOT"],
  );

  assert.equal(
    configuration.accountType,
    "UNIFIED",
  );

  assert.equal(
    configuration.positionMode,
    "ONE_WAY",
  );

  assert.equal(
    configuration.credentials,
    undefined,
  );

  assert.equal(
    configuration.enablePrivateRest,
    false,
  );

  assert.equal(
    configuration.enablePrivateWebSocket,
    false,
  );

  assert.equal(
    configuration.enableOrderManagement,
    false,
  );

  assert.equal(
    configuration.enableWebSocketOrderEntry,
    false,
  );

  assert.equal(
    configuration.receiveWindowMs,
    5_000,
  );

  assert.equal(
    configuration.requestTimeoutMs,
    15_000,
  );

  assert.equal(
    configuration.connectionTimeoutMs,
    10_000,
  );

  assert.equal(
    configuration.shutdownTimeoutMs,
    10_000,
  );

  assert.equal(
    configuration.maximumClockDriftMs,
    1_000,
  );

  assert.equal(
    configuration.serverTimeSynchronizationEnabled,
    true,
  );
}

function testKnownEnvironmentDomains(): void {
  assert.equal(
    BYBIT_DEFAULT_DOMAINS.PRODUCTION.rest.baseUrl,
    "https://api.bybit.com",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.TESTNET.rest.baseUrl,
    "https://api-testnet.bybit.com",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.DEMO.rest.baseUrl,
    "https://api-demo.bybit.com",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.PRODUCTION.webSocket.privateUrl,
    "wss://stream.bybit.com/v5/private",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.TESTNET.webSocket.privateUrl,
    "wss://stream-testnet.bybit.com/v5/private",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.DEMO.webSocket.privateUrl,
    "wss://stream-demo.bybit.com/v5/private",
  );

  assert.equal(
    BYBIT_DEFAULT_DOMAINS.DEMO.webSocket.tradeUrl,
    undefined,
  );
}

function testEnvironmentMapping(): void {
  assert.equal(
    mapBybitEnvironmentToExchangeEnvironment(
      "PRODUCTION",
    ),
    "PRODUCTION",
  );

  assert.equal(
    mapBybitEnvironmentToExchangeEnvironment(
      "TESTNET",
    ),
    "TEST",
  );

  assert.equal(
    mapBybitEnvironmentToExchangeEnvironment(
      "DEMO",
    ),
    "TEST",
  );

  assert.equal(
    mapBybitEnvironmentToExchangeEnvironment(
      "CUSTOM",
    ),
    "TEST",
  );
}

function testEnvironmentConfiguration(): void {
  const production =
    createBybitConnectorConfiguration({
      bybitEnvironment: "PRODUCTION",
    });

  const testnet =
    createBybitConnectorConfiguration({
      bybitEnvironment: "TESTNET",
    });

  const demo =
    createBybitConnectorConfiguration({
      bybitEnvironment: "DEMO",
    });

  assert.equal(
    production.environment,
    "PRODUCTION",
  );

  assert.equal(testnet.environment, "TEST");
  assert.equal(demo.environment, "TEST");

  assert.deepEqual(
    production.domains,
    BYBIT_DEFAULT_DOMAINS.PRODUCTION,
  );

  assert.deepEqual(
    testnet.domains,
    BYBIT_DEFAULT_DOMAINS.TESTNET,
  );

  assert.deepEqual(
    demo.domains,
    BYBIT_DEFAULT_DOMAINS.DEMO,
  );
}

function testCustomDomains(): void {
  const configuration =
    createBybitConnectorConfiguration({
      connectorId: "bybit-custom",
      bybitEnvironment: "CUSTOM",
      domains: CUSTOM_DOMAINS,
    });

  assert.equal(
    configuration.connectorId,
    "bybit-custom",
  );

  assert.equal(
    configuration.bybitEnvironment,
    "CUSTOM",
  );

  assert.equal(configuration.environment, "TEST");

  assert.equal(
    configuration.domains?.rest.baseUrl,
    "https://bybit.example.com",
  );

  assert.equal(
    configuration.domains?.webSocket.public.spotUrl,
    "wss://stream.example.com/v5/public/spot",
  );

  assert.equal(
    configuration.domains?.webSocket.privateUrl,
    "wss://stream.example.com/v5/private",
  );

  assert.equal(
    configuration.domains?.webSocket.tradeUrl,
    "wss://stream.example.com/v5/trade",
  );
}

function testDomainResolution(): void {
  assert.equal(
    resolveBybitDomains("PRODUCTION"),
    BYBIT_DEFAULT_DOMAINS.PRODUCTION,
  );

  assert.equal(
    resolveBybitDomains("TESTNET"),
    BYBIT_DEFAULT_DOMAINS.TESTNET,
  );

  assert.equal(
    resolveBybitDomains("DEMO"),
    BYBIT_DEFAULT_DOMAINS.DEMO,
  );

  const custom =
    resolveBybitDomains(
      "CUSTOM",
      CUSTOM_DOMAINS,
    );

  assert.notEqual(custom, CUSTOM_DOMAINS);

  assert.equal(
    custom.rest.baseUrl,
    "https://bybit.example.com",
  );
}

function testPublicWebSocketResolution(): void {
  const domains =
    BYBIT_DEFAULT_DOMAINS.PRODUCTION;

  assert.equal(
    resolveBybitPublicWebSocketUrl(
      domains,
      "SPOT",
    ),
    domains.webSocket.public.spotUrl,
  );

  assert.equal(
    resolveBybitPublicWebSocketUrl(
      domains,
      "LINEAR",
    ),
    domains.webSocket.public.linearUrl,
  );

  assert.equal(
    resolveBybitPublicWebSocketUrl(
      domains,
      "INVERSE",
    ),
    domains.webSocket.public.inverseUrl,
  );

  assert.equal(
    resolveBybitPublicWebSocketUrl(
      domains,
      "OPTION",
    ),
    domains.webSocket.public.optionUrl,
  );
}

function testPrivateConfiguration(): void {
  const configuration =
    createBybitConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
      enabledMarketTypes: [
        "SPOT",
      ],
      enabledCategories: [
        "SPOT",
        "LINEAR",
      ],
      enablePrivateRest: true,
      enablePrivateWebSocket: true,
      enableOrderManagement: true,
      enableWebSocketOrderEntry: true,
    });

  assert.deepEqual(
    configuration.credentials,
    TEST_CREDENTIALS,
  );

  assert.equal(
    requiresBybitCredentials(configuration),
    true,
  );

  assert.equal(
    configuration.enableOrderManagement,
    true,
  );

  assert.equal(
    configuration.enableWebSocketOrderEntry,
    true,
  );
}

function testPublicConfigurationDoesNotRequireCredentials(): void {
  const configuration =
    createBybitConnectorConfiguration();

  assert.equal(
    requiresBybitCredentials(configuration),
    false,
  );
}

function testDeepImmutability(): void {
  const configuration =
    createBybitConnectorConfiguration({
      credentials: TEST_CREDENTIALS,
      enabledMarketTypes: ["SPOT"],
      enabledCategories: ["SPOT"],
    });

  assert.equal(
    Object.isFrozen(configuration),
    true,
  );

  assert.equal(
    Object.isFrozen(
      configuration.enabledMarketTypes,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      configuration.enabledCategories,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(configuration.credentials),
    true,
  );

  assert.equal(
    Object.isFrozen(configuration.domains),
    true,
  );

  assert.equal(
    Object.isFrozen(configuration.domains?.rest),
    true,
  );

  assert.equal(
    Object.isFrozen(
      configuration.domains?.webSocket,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      configuration.domains?.webSocket.public,
    ),
    true,
  );
}

function testDeterministicConfiguration(): void {
  const overrides = {
    connectorId: "bybit-deterministic",
    bybitEnvironment: "TESTNET" as const,
    credentials: TEST_CREDENTIALS,
    enabledMarketTypes: [
      "SPOT",
    ] as const,
    enabledCategories: [
      "SPOT",
    ] as const,
  };

  const first =
    createBybitConnectorConfiguration(
      overrides,
    );

  const second =
    createBybitConnectorConfiguration(
      overrides,
    );

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(
    first.enabledMarketTypes,
    second.enabledMarketTypes,
  );
  assert.notEqual(
    first.enabledCategories,
    second.enabledCategories,
  );
  assert.notEqual(
    first.credentials,
    second.credentials,
  );
}

function testMissingCustomDomains(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        bybitEnvironment: "CUSTOM",
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_CUSTOM_DOMAINS_REQUIRED",
        "domains",
      ),
  );
}

function testMismatchedKnownEnvironmentDomains(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        bybitEnvironment: "PRODUCTION",
        domains:
          BYBIT_DEFAULT_DOMAINS.TESTNET,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_DOMAIN_ENVIRONMENT_MISMATCH",
        "domains.environment",
      ),
  );
}

function testPrivateOperationsRequireCredentials(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        enablePrivateRest: true,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_CREDENTIALS_REQUIRED",
        "credentials",
      ),
  );
}

function testOrderManagementRequiresPrivateRest(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        credentials: TEST_CREDENTIALS,
        enableOrderManagement: true,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_ORDER_MANAGEMENT_REQUIRES_PRIVATE_REST",
        "enableOrderManagement",
      ),
  );
}

function testWebSocketOrderEntryDependencies(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        credentials: TEST_CREDENTIALS,
        enablePrivateRest: true,
        enableOrderManagement: true,
        enableWebSocketOrderEntry: true,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_WS_ORDER_ENTRY_REQUIRES_PRIVATE_WS",
        "enableWebSocketOrderEntry",
      ),
  );
}

function testDemoWebSocketOrderEntryUnsupported(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        bybitEnvironment: "DEMO",
        credentials: TEST_CREDENTIALS,
        enablePrivateRest: true,
        enablePrivateWebSocket: true,
        enableOrderManagement: true,
        enableWebSocketOrderEntry: true,
      }),
    (error: unknown) =>
      error instanceof
        BybitConnectorConfigError &&
      (
        error.code ===
          "BYBIT_WS_TRADE_ENDPOINT_REQUIRED" ||
        error.code ===
          "BYBIT_DEMO_WS_ORDER_ENTRY_UNSUPPORTED"
      ),
  );
}

function testInvalidCredentials(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        credentials: {
          apiKey: " ",
          secretKey: "secret",
          signatureAlgorithm:
            "HMAC_SHA256",
        },
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_API_KEY_REQUIRED",
        "credentials.apiKey",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        credentials: {
          apiKey: "key",
          secretKey: " ",
          signatureAlgorithm:
            "HMAC_SHA256",
        },
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_SECRET_KEY_REQUIRED",
        "credentials.secretKey",
      ),
  );
}

function testInvalidCollections(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        enabledMarketTypes: [],
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_MARKET_TYPES_REQUIRED",
        "enabledMarketTypes",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        enabledCategories: [],
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_CATEGORIES_REQUIRED",
        "enabledCategories",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        enabledCategories: [
          "SPOT",
          "SPOT",
        ],
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_DUPLICATE_CATEGORIES",
        "enabledCategories",
      ),
  );
}

function testInvalidRuntimeSettings(): void {
  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        receiveWindowMs: 0,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_INVALID_RECEIVE_WINDOW",
        "receiveWindowMs",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        receiveWindowMs: 60_001,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_RECEIVE_WINDOW_OUT_OF_RANGE",
        "receiveWindowMs",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        requestTimeoutMs: 0,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_INVALID_REQUEST_TIMEOUT",
        "requestTimeoutMs",
      ),
  );

  assert.throws(
    () =>
      createBybitConnectorConfiguration({
        maximumClockDriftMs: -1,
      }),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_INVALID_MAXIMUM_CLOCK_DRIFT",
        "maximumClockDriftMs",
      ),
  );
}

function testInvalidDomainUrls(): void {
  const invalidDomains: BybitDomainConfig = {
    ...CUSTOM_DOMAINS,
    rest: {
      baseUrl: "http://bybit.example.com",
    },
  };

  assert.throws(
    () =>
      resolveBybitDomains(
        "CUSTOM",
        invalidDomains,
      ),
    (error: unknown) =>
      isConfigError(
        error,
        "BYBIT_INVALID_DOMAIN_PROTOCOL",
        "domains.rest.baseUrl",
      ),
  );
}

function testValidationResult(): void {
  const valid =
    createBybitConnectorConfiguration();

  const validResult =
    validateBybitConnectorConfig(valid);

  assert.equal(validResult.valid, true);
  assert.deepEqual(validResult.issues, []);
  assert.equal(
    Object.isFrozen(validResult),
    true,
  );
  assert.equal(
    Object.isFrozen(validResult.issues),
    true,
  );

  const invalid: BybitConnectorConfig = {
    ...valid,
    connectorId: " ",
    enabledCategories: [],
  };

  const invalidResult =
    validateBybitConnectorConfig(invalid);

  assert.equal(invalidResult.valid, false);

  assert.ok(
    invalidResult.issues.some(
      (issue) =>
        issue.code ===
        "BYBIT_CONNECTOR_ID_REQUIRED",
    ),
  );

  assert.ok(
    invalidResult.issues.some(
      (issue) =>
        issue.code ===
        "BYBIT_CATEGORIES_REQUIRED",
    ),
  );
}

function testConfigurationErrorIdentity(): void {
  const error =
    new BybitConnectorConfigError({
      code: "TEST_ERROR",
      path: "test.path",
      message: "Test configuration error.",
    });

  assert.equal(
    error.name,
    "BybitConnectorConfigError",
  );

  assert.equal(error.code, "TEST_ERROR");
  assert.equal(error.path, "test.path");

  assert.equal(
    error.message,
    "Test configuration error.",
  );

  assert.ok(error instanceof Error);
  assert.ok(
    error instanceof
      BybitConnectorConfigError,
  );
}

function isConfigError(
  error: unknown,
  code: string,
  path: string,
): boolean {
  return (
    error instanceof
      BybitConnectorConfigError &&
    error.code === code &&
    error.path === path
  );
}

function runBybitConnectorConfigurationTests(): void {
  testDefaultConfiguration();
  testKnownEnvironmentDomains();
  testEnvironmentMapping();
  testEnvironmentConfiguration();
  testCustomDomains();
  testDomainResolution();
  testPublicWebSocketResolution();
  testPrivateConfiguration();
  testPublicConfigurationDoesNotRequireCredentials();
  testDeepImmutability();
  testDeterministicConfiguration();
  testMissingCustomDomains();
  testMismatchedKnownEnvironmentDomains();
  testPrivateOperationsRequireCredentials();
  testOrderManagementRequiresPrivateRest();
  testWebSocketOrderEntryDependencies();
  testDemoWebSocketOrderEntryUnsupported();
  testInvalidCredentials();
  testInvalidCollections();
  testInvalidRuntimeSettings();
  testInvalidDomainUrls();
  testValidationResult();
  testConfigurationErrorIdentity();

  console.log(
    "All Bybit connector configuration tests passed successfully.",
  );
}

runBybitConnectorConfigurationTests();
