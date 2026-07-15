/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Deterministic framework contract and utility tests.
 *
 * Run with:
 * npx tsx src/trading/exchange-connectivity.test.ts
 */

import assert from "node:assert/strict";

import {
  applyExchangeAuthenticationFields,
  applyExchangeRetryJitter,
  buildExchangeRestRequestTarget,
  calculateExchangeRateLimitRefill,
  calculateExchangeRateLimitRefillIntervals,
  calculateExchangeRetryBaseDelay,
  calculateExchangeRetryDelay,
  canExecuteExchangeConnectorManagedOperation,
  canonicalizeExchangeBody,
  canonicalizeExchangeHeaders,
  canonicalizeExchangeQuery,
  createExchangeConnectorHealthCheckResult,
  createExchangeConnectorHealthSnapshot,
  createExchangeConnectorRegistryEntry,
  createExchangeWebSocketSubscriptionKey,
  estimateExchangeRateLimitAvailability,
  evaluateExchangeConnectorHealthStatus,
  isExchangeConnectorManagedOperationSatisfied,
  isExchangeConnectorOperational,
  isExchangeConnectorRemovableState,
  isExchangeRateLimiterOperational,
  isExchangeRetryableFailure,
  isExchangeRetryOperationEligible,
  isExchangeWebSocketConnected,
  isExchangeWebSocketOperational,
  matchesExchangeConnectorRegistryQuery,
  serializeExchangeRestQuery,
  sortExchangeConnectorHealthChecks,
  sortExchangeConnectorManagedSnapshots,
  sortExchangeConnectorRegistryEntries,
  sortExchangeRateLimitQueue,
  validateExchangeConnectorConfig,
  validateExchangeConnectorHealthCheckCycleRequest,
  validateExchangeConnectorHealthMonitorConfig,
  validateExchangeConnectorLifecycleManagerConfig,
  validateExchangeConnectorRegistryConfig,
  validateExchangeRateLimitAcquireRequest,
  validateExchangeRateLimiterConfig,
  validateExchangeRequestSignerConfig,
  validateExchangeRestRequest,
  validateExchangeRetryFailure,
  validateExchangeRetryOperation,
  validateExchangeRetryPolicyConfig,
  validateExchangeWebSocketConnectRequest,
  validateExchangeWebSocketSendRequest,
  validateExchangeWebSocketSubscriptionRequest,
  type ExchangeConnector,
  type ExchangeConnectorCapabilities,
  type ExchangeConnectorConfig,
  type ExchangeConnectorHealthCheckDefinition,
  type ExchangeConnectorHealthCheckResult,
  type ExchangeConnectorOperationContext,
  type ExchangeRateLimiterConfig,
  type ExchangeRequestSignerConfig,
  type ExchangeRestRequest,
  type ExchangeRetryFailure,
  type ExchangeRetryOperation,
  type ExchangeRetryPolicyConfig,
} from "./exchange-connectivity";

const BASE_TIMESTAMP = 1_700_000_000_000;

function createOperationContext(
  operationId = "operation-1",
): ExchangeConnectorOperationContext {
  return Object.freeze({
    operationId,
    correlationId: "correlation-1",
    createdAt: BASE_TIMESTAMP,
    deadlineAt: BASE_TIMESTAMP + 60_000,
    metadata: Object.freeze({
      source: "deterministic-test",
    }),
  });
}

function createCapabilities(): ExchangeConnectorCapabilities {
  return Object.freeze({
    marketTypes: Object.freeze(["SPOT"] as const),

    supportsPublicRest: true,
    supportsPrivateRest: true,
    supportsPublicWebSocket: true,
    supportsPrivateWebSocket: true,

    supportsMarketData: true,
    supportsOrderPlacement: true,
    supportsOrderCancellation: true,
    supportsOrderAmendment: false,
    supportsOpenOrders: true,
    supportsOrderHistory: true,
    supportsTradeHistory: true,
    supportsBalances: true,
    supportsPositions: false,

    supportsClientOrderId: true,
    supportsBatchOrders: false,
    supportsServerTime: true,
    supportsSandbox: true,
  });
}

function createConnectorConfig(): ExchangeConnectorConfig {
  return Object.freeze({
    connectorId: "test-exchange",
    exchangeName: "Test Exchange",
    environment: "TEST",
    marketTypes: Object.freeze(["SPOT"] as const),

    credentials: Object.freeze({
      authenticationType: "API_KEY_SECRET",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret",
    }),

    signing: Object.freeze({
      algorithm: "HMAC_SHA256",
      apiKeyParameterName: "X-API-KEY",
      timestampParameterName: "X-TIMESTAMP",
      signatureParameterName: "X-SIGNATURE",
      receiveWindowMs: 5_000,
      sortQueryParameters: true,
      includeRequestBody: true,
      includeHttpMethod: true,
      includeRequestPath: true,
    }),

    rest: Object.freeze({
      enabled: true,
      endpoints: Object.freeze([
        Object.freeze({
          type: "PUBLIC",
          baseUrl: "https://api.test.exchange",
          authenticated: false,
        }),
        Object.freeze({
          type: "PRIVATE",
          baseUrl: "https://api.test.exchange",
          authenticated: true,
        }),
      ]),
      parseJsonResponses: true,
      maximumResponseSizeBytes: 1_000_000,
    }),

    webSocket: Object.freeze({
      enabled: true,
      endpoints: Object.freeze([
        Object.freeze({
          type: "PUBLIC",
          url: "wss://stream.test.exchange/public",
          authenticated: false,
        }),
        Object.freeze({
          type: "PRIVATE",
          url: "wss://stream.test.exchange/private",
          authenticated: true,
        }),
      ]),
      reconnect: Object.freeze({
        enabled: true,
        maximumAttempts: 5,
        initialDelayMs: 1_000,
        maximumDelayMs: 30_000,
        backoffMultiplier: 2,
        jitterRatio: 0.1,
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
      maximumBufferedMessages: 10_000,
    }),

    timeouts: Object.freeze({
      connectionTimeoutMs: 10_000,
      requestTimeoutMs: 15_000,
      webSocketResponseTimeoutMs: 10_000,
      webSocketIdleTimeoutMs: 60_000,
      shutdownTimeoutMs: 10_000,
    }),

    retry: Object.freeze({
      maximumAttempts: 4,
      initialDelayMs: 500,
      maximumDelayMs: 10_000,
      backoffMultiplier: 2,
      jitterRatio: 0.1,
      retryableStatusCodes: Object.freeze([429, 500, 502, 503, 504]),
      retryableErrorCodes: Object.freeze(["ETIMEDOUT", "ECONNRESET"]),
      retryMutatingRequests: false,
    }),

    rateLimit: Object.freeze({
      enabled: true,
      capacity: 100,
      refillTokens: 10,
      refillIntervalMs: 1_000,
      maximumQueueWaitMs: 10_000,
      maximumQueueSize: 1_000,
    }),

    timeSync: Object.freeze({
      enabled: true,
      maximumClockDriftMs: 1_000,
      synchronizationIntervalMs: 60_000,
      sampleCount: 3,
    }),

    enablePrivateOperations: true,
    enableStreaming: true,
  });
}

function createRateLimiterConfig(): ExchangeRateLimiterConfig {
  return Object.freeze({
    capacity: 10,
    refillTokens: 2,
    refillIntervalMs: 1_000,
    maximumQueueSize: 100,
    maximumQueueWaitMs: 10_000,
    initialTokens: 10,
    priorityQueueEnabled: true,
    allowFractionalTokens: false,
  });
}

function createRetryPolicyConfig(): ExchangeRetryPolicyConfig {
  return Object.freeze({
    maximumAttempts: 4,
    initialDelayMs: 1_000,
    maximumDelayMs: 8_000,
    backoffMultiplier: 2,
    jitterRatio: 0.1,
    retryableStatusCodes: Object.freeze([429, 500, 502, 503, 504]),
    retryableErrorCodes: Object.freeze([
      "ETIMEDOUT",
      "ECONNRESET",
      "EXCHANGE_TEMPORARY_ERROR",
    ]),
    retryableErrorCategories: Object.freeze([
      "RATE_LIMIT",
      "TIMEOUT",
      "NETWORK",
      "CONNECTION",
      "UNAVAILABLE",
    ] as const),
    retryMutatingRequests: false,
    respectRetryAfter: true,
    maximumRetryAfterMs: 30_000,
    countInitialAttempt: true,
  });
}

function createSignerConfig(): ExchangeRequestSignerConfig {
  return Object.freeze({
    algorithm: "HMAC_SHA256",
    signatureEncoding: "HEX_LOWER",

    canonicalization: Object.freeze({
      queryMode: "SORTED",
      bodyMode: "JSON",
      sortHeaders: true,
      lowercaseHeaderNames: true,
      trimHeaderValues: true,
      includeMethod: true,
      includePath: true,
      includeQuery: true,
      includeHeaders: true,
      includeBody: true,
      includeTimestamp: true,
      includeReceiveWindow: true,
      componentSeparator: "\n",
      signedHeaderNames: Object.freeze([
        "content-type",
        "x-api-key",
      ]),
    }),

    apiKeyFieldName: "X-API-KEY",
    timestampFieldName: "X-TIMESTAMP",
    signatureFieldName: "X-SIGNATURE",
    receiveWindowFieldName: "X-RECV-WINDOW",

    apiKeyLocation: "HEADER",
    timestampLocation: "HEADER",
    signatureLocation: "HEADER",
    receiveWindowLocation: "HEADER",

    defaultReceiveWindowMs: 5_000,
  });
}

function createMockConnector(
  connectorId: string,
  lifecycleState:
    | "CREATED"
    | "INITIALIZED"
    | "CONNECTED"
    | "DISCONNECTED"
    | "FAILED"
    | "DESTROYED" = "CONNECTED",
  healthStatus:
    | "UNKNOWN"
    | "HEALTHY"
    | "DEGRADED"
    | "UNHEALTHY" = "HEALTHY",
): ExchangeConnector {
  const capabilities = createCapabilities();

  return {
    getMetadata: () =>
      Object.freeze({
        id: connectorId,
        exchangeName: "Test Exchange",
        displayName: "Test Exchange Connector",
        implementationVersion: "1.0.0",
        environment: "TEST",
        capabilities,
      }),

    getState: () =>
      Object.freeze({
        connectorId,
        state: lifecycleState,
        revision: 1,
        changedAt: BASE_TIMESTAMP,
      }),

    getHealth: () =>
      Object.freeze({
        connectorId,
        status: healthStatus,
        checkedAt: BASE_TIMESTAMP,
        latencyMs: 25,
      }),

    initialize: async () =>
      Object.freeze({
        connectorId,
        previousState: lifecycleState,
        currentState: "INITIALIZED" as const,
        changed: lifecycleState !== "INITIALIZED",
        completedAt: BASE_TIMESTAMP,
        revision: 2,
      }),

    connect: async () =>
      Object.freeze({
        connectorId,
        previousState: lifecycleState,
        currentState: "CONNECTED" as const,
        changed: lifecycleState !== "CONNECTED",
        completedAt: BASE_TIMESTAMP,
        revision: 2,
      }),

    disconnect: async () =>
      Object.freeze({
        connectorId,
        previousState: lifecycleState,
        currentState: "DISCONNECTED" as const,
        changed: lifecycleState !== "DISCONNECTED",
        completedAt: BASE_TIMESTAMP,
        revision: 2,
      }),

    destroy: async () =>
      Object.freeze({
        connectorId,
        previousState: lifecycleState,
        currentState: "DESTROYED" as const,
        changed: lifecycleState !== "DESTROYED",
        completedAt: BASE_TIMESTAMP,
        revision: 2,
      }),
  };
}

function testConnectorConfiguration(): void {
  const validResult = validateExchangeConnectorConfig(
    createConnectorConfig(),
  );

  assert.equal(validResult.valid, true);
  assert.equal(validResult.issues.length, 0);

  const invalidConfig: ExchangeConnectorConfig = {
    ...createConnectorConfig(),
    connectorId: "",
    marketTypes: [] as const,
    enablePrivateOperations: true,
    credentials: undefined,
  };

  const invalidResult =
    validateExchangeConnectorConfig(invalidConfig);

  assert.equal(invalidResult.valid, false);

  assert.ok(
    invalidResult.issues.some(
      (issue) => issue.code === "CONNECTOR_ID_REQUIRED",
    ),
  );

  assert.ok(
    invalidResult.issues.some(
      (issue) => issue.code === "MARKET_TYPES_REQUIRED",
    ),
  );

  assert.ok(
    invalidResult.issues.some(
      (issue) => issue.code === "PRIVATE_CREDENTIALS_REQUIRED",
    ),
  );
}

function testRestUtilities(): void {
  const query = Object.freeze({
    symbol: "BTC/USDT",
    limit: 100,
    active: true,
    category: Object.freeze(["spot", "margin"]),
    omitted: undefined,
  });

  assert.equal(
    serializeExchangeRestQuery(query),
    "active=true&category=spot&category=margin&limit=100&symbol=BTC%2FUSDT",
  );

  assert.equal(
    buildExchangeRestRequestTarget("/v1/tickers", query),
    "/v1/tickers?active=true&category=spot&category=margin&limit=100&symbol=BTC%2FUSDT",
  );

  const request: ExchangeRestRequest = Object.freeze({
    requestId: "rest-request-1",
    operation: "market.getTicker",
    endpointType: "PUBLIC",
    method: "GET",
    path: "/v1/ticker",
    query,
    responseType: "JSON",
    authentication: "NONE",
    retryMode: "SAFE",
    priority: "NORMAL",
    context: createOperationContext(),
  });

  assert.doesNotThrow(() =>
    validateExchangeRestRequest(request),
  );

  assert.throws(() =>
    validateExchangeRestRequest({
      ...request,
      path: "https://example.com/v1/ticker",
    }),
  );
}

function testWebSocketUtilities(): void {
  const context = createOperationContext();

  assert.doesNotThrow(() =>
    validateExchangeWebSocketConnectRequest({
      connectionId: "ws-connection-1",
      endpointType: "PUBLIC",
      authenticated: false,
      timeoutMs: 10_000,
      context,
    }),
  );

  assert.doesNotThrow(() =>
    validateExchangeWebSocketSendRequest({
      messageId: "ws-message-1",
      type: "SUBSCRIBE",
      encoding: "JSON",
      payload: Object.freeze({
        operation: "subscribe",
        channel: "tickers",
      }),
      channel: "tickers",
      symbol: "BTCUSDT",
      timeoutMs: 5_000,
      context,
    }),
  );

  assert.doesNotThrow(() =>
    validateExchangeWebSocketSubscriptionRequest({
      subscriptionId: "subscription-1",
      channel: "tickers",
      symbols: Object.freeze(["BTCUSDT", "ETHUSDT"]),
      authenticated: false,
      context,
    }),
  );

  assert.throws(() =>
    validateExchangeWebSocketSubscriptionRequest({
      subscriptionId: "subscription-duplicate",
      channel: "tickers",
      symbols: Object.freeze(["BTCUSDT", "BTCUSDT"]),
      authenticated: false,
      context,
    }),
  );

  assert.equal(
    createExchangeWebSocketSubscriptionKey(
      "tickers",
      ["ETHUSDT", "BTCUSDT"],
    ),
    "tickers:BTCUSDT,ETHUSDT",
  );

  assert.equal(isExchangeWebSocketConnected("CONNECTED"), true);
  assert.equal(isExchangeWebSocketConnected("READY"), true);
  assert.equal(isExchangeWebSocketOperational("READY"), true);
  assert.equal(isExchangeWebSocketOperational("CONNECTED"), false);
}

function testSigningUtilities(): void {
  const signerConfig = createSignerConfig();

  assert.doesNotThrow(() =>
    validateExchangeRequestSignerConfig(signerConfig),
  );

  assert.equal(
    canonicalizeExchangeQuery(
      {
        symbol: "BTCUSDT",
        limit: 100,
        category: "spot",
      },
      "SORTED",
    ),
    "category=spot&limit=100&symbol=BTCUSDT",
  );

  assert.equal(
    canonicalizeExchangeHeaders(
      {
        "X-API-KEY": " api-key ",
        "Content-Type": " application/json ",
        "X-UNSIGNED": "ignored",
      },
      signerConfig.canonicalization,
    ),
    "content-type:application/json\nx-api-key:api-key",
  );

  assert.equal(
    canonicalizeExchangeBody(
      {
        quantity: 1,
        price: 50_000,
        symbol: "BTCUSDT",
      },
      "JSON",
    ),
    '{"price":50000,"quantity":1,"symbol":"BTCUSDT"}',
  );

  const authenticationResult =
    applyExchangeAuthenticationFields(
      [
        {
          name: "X-API-KEY",
          value: "key",
          location: "HEADER",
        },
        {
          name: "timestamp",
          value: String(BASE_TIMESTAMP),
          location: "QUERY",
        },
        {
          name: "signature",
          value: "signed",
          location: "BODY",
        },
      ],
      {
        symbol: "BTCUSDT",
      },
      {
        "Content-Type": "application/json",
      },
      {
        quantity: 1,
      },
    );

  assert.equal(
    authenticationResult.headers["X-API-KEY"],
    "key",
  );

  assert.equal(
    authenticationResult.query.timestamp,
    String(BASE_TIMESTAMP),
  );

  assert.deepEqual(authenticationResult.body, {
    quantity: 1,
    signature: "signed",
  });
}

function testRateLimitingUtilities(): void {
  const config = createRateLimiterConfig();

  assert.doesNotThrow(() =>
    validateExchangeRateLimiterConfig(config),
  );

  assert.doesNotThrow(() =>
    validateExchangeRateLimitAcquireRequest({
      requestId: "rate-limit-request-1",
      operation: "market.getTicker",
      weight: 2,
      priority: "NORMAL",
      maximumWaitMs: 5_000,
      deadlineAt: BASE_TIMESTAMP + 5_000,
      context: createOperationContext(),
    }),
  );

  assert.equal(
    calculateExchangeRateLimitRefillIntervals(
      BASE_TIMESTAMP,
      BASE_TIMESTAMP + 3_500,
      1_000,
    ),
    3,
  );

  const refill = calculateExchangeRateLimitRefill(
    3,
    BASE_TIMESTAMP,
    BASE_TIMESTAMP + 3_500,
    config,
  );

  assert.deepEqual(refill, {
    availableTokens: 9,
    refillIntervals: 3,
    tokensAdded: 6,
    lastRefillAt: BASE_TIMESTAMP + 3_000,
    nextRefillAt: BASE_TIMESTAMP + 4_000,
  });

  assert.equal(
    estimateExchangeRateLimitAvailability(
      8,
      2,
      BASE_TIMESTAMP,
      BASE_TIMESTAMP + 1_000,
      config,
    ),
    BASE_TIMESTAMP + 3_000,
  );

  const sortedQueue = sortExchangeRateLimitQueue(
    [
      {
        requestId: "normal-1",
        operation: "normal",
        weight: 1,
        priority: "NORMAL",
        enqueuedAt: BASE_TIMESTAMP,
        position: 1,
      },
      {
        requestId: "critical-1",
        operation: "critical",
        weight: 1,
        priority: "CRITICAL",
        enqueuedAt: BASE_TIMESTAMP + 10,
        position: 2,
      },
      {
        requestId: "high-1",
        operation: "high",
        weight: 1,
        priority: "HIGH",
        enqueuedAt: BASE_TIMESTAMP + 5,
        position: 3,
      },
    ],
    true,
  );

  assert.deepEqual(
    sortedQueue.map((entry) => entry.requestId),
    ["critical-1", "high-1", "normal-1"],
  );

  assert.deepEqual(
    sortedQueue.map((entry) => entry.position),
    [1, 2, 3],
  );

  assert.equal(isExchangeRateLimiterOperational("READY"), true);
  assert.equal(isExchangeRateLimiterOperational("PAUSED"), false);
}

function testRetryUtilities(): void {
  const config = createRetryPolicyConfig();

  assert.doesNotThrow(() =>
    validateExchangeRetryPolicyConfig(config),
  );

  const operation: ExchangeRetryOperation = Object.freeze({
    operationId: "retry-operation-1",
    operation: "market.getTicker",
    method: "GET",
    mutating: false,
    context: createOperationContext(),
  });

  assert.doesNotThrow(() =>
    validateExchangeRetryOperation(operation),
  );

  const failure: ExchangeRetryFailure = Object.freeze({
    errorCategory: "NETWORK",
    errorCode: "ECONNRESET",
    message: "Connection reset by peer.",
    statusCode: 503,
    retryable: true,
    retryAfterMs: 5_000,
    occurredAt: BASE_TIMESTAMP + 100,
  });

  assert.doesNotThrow(() =>
    validateExchangeRetryFailure(failure),
  );

  assert.equal(
    calculateExchangeRetryBaseDelay(1, config),
    1_000,
  );

  assert.equal(
    calculateExchangeRetryBaseDelay(2, config),
    2_000,
  );

  assert.equal(
    calculateExchangeRetryBaseDelay(4, config),
    8_000,
  );

  assert.equal(
    applyExchangeRetryJitter(1_000, 0.1, 1),
    1_100,
  );

  assert.equal(
    applyExchangeRetryJitter(1_000, 0.1, -1),
    900,
  );

  assert.equal(
    calculateExchangeRetryDelay(
      1,
      failure,
      config,
      0,
    ),
    5_000,
  );

  assert.equal(
    isExchangeRetryableFailure(failure, config),
    true,
  );

  assert.equal(
    isExchangeRetryOperationEligible(operation, config),
    true,
  );

  const unsafeMutation: ExchangeRetryOperation = {
    ...operation,
    operationId: "unsafe-mutation",
    operation: "orders.place",
    method: "POST",
    mutating: true,
  };

  assert.equal(
    isExchangeRetryOperationEligible(
      unsafeMutation,
      config,
    ),
    false,
  );

  assert.equal(
    isExchangeRetryOperationEligible(
      {
        ...unsafeMutation,
        idempotencyKey: "client-order-id-1",
      },
      config,
    ),
    true,
  );
}

function testHealthUtilities(): void {
  assert.doesNotThrow(() =>
    validateExchangeConnectorHealthMonitorConfig({
      connectorId: "test-exchange",
      enabled: true,
      checkIntervalMs: 30_000,
      cycleTimeoutMs: 10_000,
      individualCheckTimeoutMs: 5_000,
      maximumHistoryEntries: 100,
      runChecksConcurrently: false,
      stopCycleOnCriticalFailure: true,
      thresholds: {
        degradedLatencyMs: 500,
        unhealthyLatencyMs: 2_000,
        degradedConsecutiveFailures: 2,
        unhealthyConsecutiveFailures: 5,
        degradedStalenessMs: 60_000,
        unhealthyStalenessMs: 300_000,
        minimumSuccessfulChecksForHealthy: 1,
      },
    }),
  );

  assert.doesNotThrow(() =>
    validateExchangeConnectorHealthCheckCycleRequest({
      cycleId: "health-cycle-1",
      context: createOperationContext(),
      checkIds: ["rest", "websocket"],
      timeoutMs: 10_000,
    }),
  );

  const definitions: ExchangeConnectorHealthCheckDefinition[] = [
    {
      checkId: "websocket",
      name: "WebSocket",
      type: "WEBSOCKET_CONNECTIVITY",
      severity: "REQUIRED",
      enabled: true,
      order: 2,
    },
    {
      checkId: "rest",
      name: "REST",
      type: "REST_CONNECTIVITY",
      severity: "CRITICAL",
      enabled: true,
      order: 1,
    },
  ];

  const sortedDefinitions =
    sortExchangeConnectorHealthChecks(definitions);

  assert.deepEqual(
    sortedDefinitions.map(
      (definition) => definition.checkId,
    ),
    ["rest", "websocket"],
  );

  const passedResult =
    createExchangeConnectorHealthCheckResult({
      cycleId: "health-cycle-1",
      definition: definitions[1],
      status: "PASSED",
      startedAt: BASE_TIMESTAMP,
      completedAt: BASE_TIMESTAMP + 25,
      latencyMs: 25,
      lastSuccessfulCommunicationAt:
        BASE_TIMESTAMP + 25,
    });

  const healthyStatus =
    evaluateExchangeConnectorHealthStatus(
      [passedResult],
      {
        degradedLatencyMs: 500,
        unhealthyLatencyMs: 2_000,
        degradedConsecutiveFailures: 2,
        unhealthyConsecutiveFailures: 5,
        degradedStalenessMs: 60_000,
        unhealthyStalenessMs: 300_000,
        minimumSuccessfulChecksForHealthy: 1,
      },
      0,
      1,
      BASE_TIMESTAMP + 25,
      BASE_TIMESTAMP + 25,
    );

  assert.equal(healthyStatus, "HEALTHY");

  const failedCriticalResult =
    createExchangeConnectorHealthCheckResult({
      cycleId: "health-cycle-2",
      definition: definitions[1],
      status: "FAILED",
      startedAt: BASE_TIMESTAMP,
      completedAt: BASE_TIMESTAMP + 100,
      code: "REST_UNAVAILABLE",
      message: "REST endpoint unavailable.",
    });

  const unhealthyStatus =
    evaluateExchangeConnectorHealthStatus(
      [failedCriticalResult],
      {
        degradedLatencyMs: 500,
        unhealthyLatencyMs: 2_000,
        degradedConsecutiveFailures: 2,
        unhealthyConsecutiveFailures: 5,
        degradedStalenessMs: 60_000,
        unhealthyStalenessMs: 300_000,
        minimumSuccessfulChecksForHealthy: 1,
      },
      1,
      0,
      BASE_TIMESTAMP + 100,
    );

  assert.equal(unhealthyStatus, "UNHEALTHY");

  const snapshot = createExchangeConnectorHealthSnapshot(
    "test-exchange",
    healthyStatus,
    BASE_TIMESTAMP + 25,
    [passedResult],
  );

  assert.equal(snapshot.connectorId, "test-exchange");
  assert.equal(snapshot.status, "HEALTHY");
  assert.equal(snapshot.latencyMs, 25);
}

function testRegistryUtilities(): void {
  assert.doesNotThrow(() =>
    validateExchangeConnectorRegistryConfig({
      maximumConnectors: 10,
      caseSensitiveConnectorIds: false,
      requireDisconnectedBeforeRemoval: true,
      validateMetadataOnRegistration: true,
    }),
  );

  const connector = createMockConnector(
    "test-exchange",
    "CONNECTED",
    "HEALTHY",
  );

  const entry = createExchangeConnectorRegistryEntry(
    connector,
    BASE_TIMESTAMP,
  );

  assert.equal(entry.connectorId, "test-exchange");
  assert.equal(entry.lifecycleState, "CONNECTED");
  assert.equal(entry.healthStatus, "HEALTHY");

  assert.equal(
    matchesExchangeConnectorRegistryQuery(entry, {
      environments: ["TEST"],
      marketTypes: ["SPOT"],
      requiredCapabilities: {
        supportsMarketData: true,
        supportsOrderPlacement: true,
      },
    }),
    true,
  );

  assert.equal(
    matchesExchangeConnectorRegistryQuery(entry, {
      environments: ["PRODUCTION"],
    }),
    false,
  );

  const entries = sortExchangeConnectorRegistryEntries([
    {
      ...entry,
      connectorId: "z-exchange",
    },
    {
      ...entry,
      connectorId: "a-exchange",
    },
  ]);

  assert.deepEqual(
    entries.map((item) => item.connectorId),
    ["a-exchange", "z-exchange"],
  );

  assert.equal(
    isExchangeConnectorRemovableState("DISCONNECTED"),
    true,
  );

  assert.equal(
    isExchangeConnectorRemovableState("CONNECTED"),
    false,
  );
}

function testLifecycleUtilities(): void {
  assert.doesNotThrow(() =>
    validateExchangeConnectorLifecycleManagerConfig({
      startHealthMonitorOnConnect: true,
      stopHealthMonitorOnDisconnect: true,
      refreshRegistryAfterOperation: true,
      removeConnectorFromRegistryOnDestroy: true,
      stopBatchOnFailure: false,
      maximumConcurrentOperations: 4,
      operationTimeoutMs: 30_000,
    }),
  );

  assert.equal(
    canExecuteExchangeConnectorManagedOperation(
      "INITIALIZE",
      "CREATED",
    ),
    true,
  );

  assert.equal(
    canExecuteExchangeConnectorManagedOperation(
      "CONNECT",
      "INITIALIZED",
    ),
    true,
  );

  assert.equal(
    canExecuteExchangeConnectorManagedOperation(
      "CONNECT",
      "CREATED",
    ),
    false,
  );

  assert.equal(
    isExchangeConnectorManagedOperationSatisfied(
      "CONNECT",
      "CONNECTED",
    ),
    true,
  );

  assert.equal(
    isExchangeConnectorManagedOperationSatisfied(
      "DISCONNECT",
      "CONNECTED",
    ),
    false,
  );

  assert.equal(
    isExchangeConnectorOperational("CONNECTED"),
    true,
  );

  assert.equal(
    isExchangeConnectorOperational("DISCONNECTED"),
    false,
  );

  const snapshots = sortExchangeConnectorManagedSnapshots([
    {
      connectorId: "z-exchange",
      lifecycleState: "CONNECTED",
      healthStatus: "HEALTHY",
      healthMonitorRegistered: true,
      healthMonitorRunning: true,
      capturedAt: BASE_TIMESTAMP,
    },
    {
      connectorId: "a-exchange",
      lifecycleState: "DISCONNECTED",
      healthStatus: "UNKNOWN",
      healthMonitorRegistered: false,
      healthMonitorRunning: false,
      capturedAt: BASE_TIMESTAMP,
    },
  ]);

  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.connectorId),
    ["a-exchange", "z-exchange"],
  );
}

function runTests(): void {
  testConnectorConfiguration();
  testRestUtilities();
  testWebSocketUtilities();
  testSigningUtilities();
  testRateLimitingUtilities();
  testRetryUtilities();
  testHealthUtilities();
  testRegistryUtilities();
  testLifecycleUtilities();

  console.log(
    "All exchange connectivity framework tests passed successfully.",
  );
}

runTests();