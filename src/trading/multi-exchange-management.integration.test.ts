import assert from "node:assert/strict";

import {
  AutomaticFailoverManager,
  ConnectorLifecycleManager,
  ExchangeCapabilityRegistry,
  ExchangeDiscovery,
  ExchangeRegistry,
  ExchangeRouter,
  UnifiedExchangeError,
  createAutomaticFailoverDecision,
  createExchangeCapabilityProfile,
  type AutomaticFailoverClock,
  type ConnectorLifecycleClock,
  type ExchangeRouterClock,
  type ExchangeRouterDelay,
  type UnifiedExchange,
  type UnifiedExchangeHealthReport,
  type UnifiedExchangeMarketDataApi,
  type UnifiedExchangeTradingApi,
  type UnifiedPlaceOrderRequest,
  type UnifiedPlaceOrderResult,
} from "./exchange-connectivity/management";

/**
 * Deterministic shared clock used across lifecycle, routing, and failover.
 */
class DeterministicClock
  implements
    ConnectorLifecycleClock,
    ExchangeRouterClock,
    AutomaticFailoverClock
{
  public constructor(
    private current = 1_000,
  ) {}

  public now(): number {
    const value = this.current;
    this.current += 1;
    return value;
  }

  public set(value: number): void {
    this.current = value;
  }

  public advance(value: number): void {
    this.current += value;
  }
}

/**
 * Retry-delay recorder used to keep integration tests deterministic.
 */
class RecordingDelay
  implements ExchangeRouterDelay
{
  public readonly waits: number[] = [];

  public async wait(
    milliseconds: number,
  ): Promise<void> {
    this.waits.push(milliseconds);
  }
}

/**
 * Production-shaped unified exchange test double.
 */
class TestExchange
  implements UnifiedExchange
{
  public readonly capabilities;

  public readonly marketData:
    UnifiedExchangeMarketDataApi;

  public readonly trading:
    UnifiedExchangeTradingApi;

  public initializeCount = 0;

  public startCount = 0;

  public stopCount = 0;

  public disposeCount = 0;

  public placeOrderCount = 0;

  public failNextPlaceOrder = false;

  public constructor(
    public readonly exchangeId: string,
    supportsSandbox: boolean,
  ) {
    this.capabilities =
      createExchangeCapabilityProfile({
        exchangeId,
        marketTypes: [
          "SPOT",
          "PERPETUAL",
        ],
        trading: [
          "PLACE_ORDER",
          "CANCEL_ORDER",
          "QUERY_ORDER",
        ],
        marketData: [
          "TICKER",
          "ORDER_BOOK",
          "CANDLES",
        ],
        account: [
          "BALANCES",
          "POSITIONS",
        ],
        realtime: [
          "PUBLIC_WEBSOCKET",
          "PRIVATE_WEBSOCKET",
        ],
        authentication: [
          "API_KEY",
          "API_SECRET",
          "HMAC_SIGNATURE",
        ],
        orderTypes: [
          "MARKET",
          "LIMIT",
        ],
        timeInForce: [
          "GTC",
          "IOC",
        ],
        positionModes: [
          "ONE_WAY",
          "HEDGE",
        ],
        supportsSandbox,
        supportsPrivateApi: true,
      });

    this.marketData = {
      getTicker: async (request) =>
        Object.freeze({
          exchangeId:
            this.exchangeId,
          symbol:
            request.symbol,
          marketType:
            request.marketType,
          lastPrice:
            this.exchangeId === "okx"
              ? 65_000
              : this.exchangeId ===
                  "binance"
                ? 65_010
                : 64_990,
          observedAt: 2_000,
        }),

      getOrderBook: async (request) =>
        Object.freeze({
          exchangeId:
            this.exchangeId,
          symbol:
            request.symbol,
          marketType:
            request.marketType,
          bids: Object.freeze([]),
          asks: Object.freeze([]),
          observedAt: 2_000,
        }),

      getCandles: async () =>
        Object.freeze([]),

      getInstruments: async () =>
        Object.freeze([]),
    };

    this.trading = {
      placeOrder: async (
        request,
      ): Promise<UnifiedPlaceOrderResult> => {
        this.placeOrderCount += 1;

        if (this.failNextPlaceOrder) {
          this.failNextPlaceOrder = false;

          throw new UnifiedExchangeError(
            "EXCHANGE_UNAVAILABLE",
            `${this.exchangeId} is temporarily unavailable.`,
            {
              exchangeId:
                this.exchangeId,
              operation:
                "placeOrder",
              retryable: true,
            },
          );
        }

        return Object.freeze({
          order: Object.freeze({
            exchangeId:
              this.exchangeId,
            orderId:
              `${this.exchangeId}-order-${this.placeOrderCount}`,
            clientOrderId:
              request.clientOrderId,
            symbol:
              request.symbol,
            marketType:
              request.marketType,
            side:
              request.side,
            orderType:
              request.orderType,
            status: "OPEN",
            quantity:
              request.quantity,
            filledQuantity: 0,
            remainingQuantity:
              request.quantity,
            price:
              request.price,
            timeInForce:
              request.timeInForce,
            createdAt: 2_100,
            updatedAt: 2_100,
          }),
          executions:
            Object.freeze([]),
          acceptedAt: 2_100,
        });
      },

      cancelOrder: async (
        request,
      ) =>
        Object.freeze({
          exchangeId:
            this.exchangeId,
          symbol:
            request.symbol,
          orderId:
            request.orderId ??
            "unknown",
          cancelled: true,
          cancelledAt: 2_200,
        }),

      getOrder: async (
        request,
      ) =>
        Object.freeze({
          exchangeId:
            this.exchangeId,
          orderId:
            request.orderId ??
            "unknown",
          clientOrderId:
            request.clientOrderId,
          symbol:
            request.symbol,
          marketType:
            request.marketType,
          side: "BUY",
          orderType: "LIMIT",
          status: "OPEN",
          quantity: 1,
          filledQuantity: 0,
          remainingQuantity: 1,
          price: 65_000,
          timeInForce: "GTC",
          createdAt: 2_100,
          updatedAt: 2_100,
        }),
    };
  }

  public async initialize(): Promise<void> {
    this.initializeCount += 1;
  }

  public async start(): Promise<void> {
    this.startCount += 1;
  }

  public async stop(): Promise<void> {
    this.stopCount += 1;
  }

  public async dispose(): Promise<void> {
    this.disposeCount += 1;
  }

  public async getHealth(): Promise<{
    readonly status: "HEALTHY";
  }> {
    return Object.freeze({
      status: "HEALTHY",
    });
  }

  public async inspectHealth():
    Promise<UnifiedExchangeHealthReport> {
    return Object.freeze({
      exchangeId:
        this.exchangeId,
      status: "HEALTHY",
      observedAt: 2_000,
    });
  }
}

function createOrderRequest():
  UnifiedPlaceOrderRequest {
  return Object.freeze({
    symbol: "BTC-USDT",
    marketType: "SPOT",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 0.1,
    price: 65_000,
    timeInForce: "GTC",
    clientOrderId:
      "integration-order-001",
    requestedAt: 2_000,
  });
}

async function runIntegration(): Promise<void> {
  const clock =
    new DeterministicClock();

  const delay =
    new RecordingDelay();

  const registry =
    new ExchangeRegistry<TestExchange>();

  const capabilityRegistry =
    new ExchangeCapabilityRegistry();

  const okx =
    new TestExchange(
      "okx",
      true,
    );

  const binance =
    new TestExchange(
      "binance",
      true,
    );

  const bybit =
    new TestExchange(
      "bybit",
      false,
    );

  registry.register({
    exchangeId: "okx",
    connector: okx,
  });

  registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  registry.register({
    exchangeId: "bybit",
    connector: bybit,
  });

  capabilityRegistry.register(
    okx.capabilities,
  );

  capabilityRegistry.register(
    binance.capabilities,
  );

  capabilityRegistry.register(
    bybit.capabilities,
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
    capabilityRegistry
      .listExchangeIds(),
    [
      "okx",
      "binance",
      "bybit",
    ],
  );

  const lifecycle =
    new ConnectorLifecycleManager(
      registry,
      {
        clock,
      },
    );

  await lifecycle.start("okx");
  await lifecycle.start("binance");
  await lifecycle.start("bybit");

  assert.deepEqual(
    lifecycle
      .inspectAll()
      .map((snapshot) => [
        snapshot.exchangeId,
        snapshot.state,
      ]),
    [
      [
        "okx",
        "RUNNING",
      ],
      [
        "binance",
        "RUNNING",
      ],
      [
        "bybit",
        "RUNNING",
      ],
    ],
  );

  assert.equal(
    okx.initializeCount,
    1,
  );

  assert.equal(
    okx.startCount,
    1,
  );

  const discovery =
    new ExchangeDiscovery(
      registry,
      capabilityRegistry,
      lifecycle,
    );

  const sandboxCandidates =
    discovery.discover({
      capabilities: {
        marketTypes: [
          "SPOT",
        ],
        trading: [
          "PLACE_ORDER",
        ],
        requirePrivateApi: true,
        requireSandbox: true,
      },
    });

  assert.deepEqual(
    sandboxCandidates.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
    ],
  );

  const router =
    new ExchangeRouter(
      discovery,
      {
        clock,
        delay,
      },
    );

  const tickerResult =
    await router.route(
      {
        operation: "GET_TICKER",
        strategy: "FIRST_MATCH",
        capabilities: {
          marketTypes: [
            "SPOT",
          ],
          marketData: [
            "TICKER",
          ],
        },
      },
      {
        execute: async (
          exchange,
        ) =>
          exchange.marketData.getTicker({
            symbol: "BTC-USDT",
            marketType: "SPOT",
          }),
      },
    );

  assert.equal(
    tickerResult.outcome,
    "SUCCEEDED",
  );

  if (
    tickerResult.outcome !==
    "SUCCEEDED"
  ) {
    throw new Error(
      "Ticker routing should succeed.",
    );
  }

  assert.equal(
    tickerResult.exchangeId,
    "okx",
  );

  assert.equal(
    tickerResult.result.lastPrice,
    65_000,
  );

  okx.failNextPlaceOrder = true;

  const orderResult =
    await router.route(
      {
        operation: "PLACE_ORDER",
        strategy: "FIRST_MATCH",
        capabilities: {
          marketTypes: [
            "SPOT",
          ],
          trading: [
            "PLACE_ORDER",
          ],
          requirePrivateApi: true,
        },
        retryPolicy: {
          maxAttempts: 2,
          retryDelayMs: 0,
          backoffMultiplier: 2,
          maximumRetryDelayMs: 0,
          retryableErrorCodes: [
            "EXCHANGE_UNAVAILABLE",
          ],
        },
        failoverPolicy: {
          enabled: true,
          maximumExchangeAttempts: 2,
          retryCurrentExchangeFirst: false,
          failoverOnNonRetryableError: false,
        },
      },
      {
        execute: async (
          exchange,
        ) => {
          if (
            exchange.trading ===
            undefined
          ) {
            throw new Error(
              "Trading API unavailable.",
            );
          }

          return exchange.trading.placeOrder(
            createOrderRequest(),
          );
        },
      },
    );

  assert.equal(
    orderResult.outcome,
    "SUCCEEDED",
  );

  if (
    orderResult.outcome !==
    "SUCCEEDED"
  ) {
    throw new Error(
      "Order routing should fail over and succeed.",
    );
  }

  assert.equal(
    orderResult.exchangeId,
    "binance",
  );

  assert.deepEqual(
    orderResult.attempts.map(
      (attempt) => [
        attempt.exchangeId,
        attempt.outcome,
      ]),
    [
      [
        "okx",
        "FAILED",
      ],
      [
        "binance",
        "SUCCEEDED",
      ],
    ],
  );

  const failover =
    new AutomaticFailoverManager(
      {
        failureThreshold: 1,
        cooldownMs: 100,
        maximumCooldownMs: 1_000,
        recoverySuccessThreshold: 1,
      },
      clock,
    );

  for (
    const attempt of
      orderResult.attempts
  ) {
    failover.recordAttempt(
      attempt,
    );
  }

  const excludedAfterFailure =
    failover.getExcludedExchangeIds(
      orderResult.attempts[0]
        ?.completedAt,
    );

  assert.deepEqual(
    excludedAfterFailure,
    [
      "okx",
    ],
  );

  const failoverDecision =
    createAutomaticFailoverDecision(
      discovery.discover({
        capabilities: {
          marketTypes: [
            "SPOT",
          ],
          trading: [
            "PLACE_ORDER",
          ],
        },
      }).candidates,
      failover,
      orderResult.attempts[0]
        ?.completedAt,
    );

  assert.equal(
    failoverDecision
      .selectedExchangeId,
    "binance",
  );

  const failedAttempt =
    orderResult.attempts[0];

  assert.ok(
    failedAttempt !== undefined,
  );

  const failedSnapshot =
    failover.inspect("okx");

  assert.equal(
    failedSnapshot.state,
    "COOLDOWN",
  );

  assert.ok(
    failedSnapshot.cooldownUntil !==
      undefined,
  );

  clock.set(
    failedSnapshot.cooldownUntil ??
      clock.now(),
  );

  const recovering =
    failover.inspect("okx");

  assert.equal(
    recovering.state,
    "RECOVERING",
  );

  const recovery =
    failover.recordSuccess(
      "okx",
      clock.now(),
    );

  assert.equal(
    recovery.recovered,
    true,
  );

  assert.equal(
    recovery.currentSnapshot.state,
    "AVAILABLE",
  );

  assert.equal(
    failover.isAvailable(
      "okx",
      clock.now(),
    ),
    true,
  );

  const recoveredDecision =
    createAutomaticFailoverDecision(
      discovery.discover({
        capabilities: {
          marketTypes: [
            "SPOT",
          ],
          trading: [
            "PLACE_ORDER",
          ],
        },
      }).candidates,
      failover,
      clock.now(),
    );

  assert.equal(
    recoveredDecision
      .selectedExchangeId,
    "okx",
  );

  await lifecycle.stop("bybit");

  const activeCandidates =
    discovery.discover({
      capabilities: {
        marketTypes: [
          "SPOT",
        ],
      },
    });

  assert.deepEqual(
    activeCandidates.candidates.map(
      (candidate) =>
        candidate.exchangeId,
    ),
    [
      "okx",
      "binance",
    ],
  );

  await lifecycle.dispose("bybit");

  assert.equal(
    lifecycle.inspect("bybit").state,
    "DISPOSED",
  );

  assert.equal(
    bybit.disposeCount,
    1,
  );

  assert.ok(
    Object.isFrozen(
      orderResult.attempts,
    ),
  );

  assert.ok(
    Object.isFrozen(
      failoverDecision,
    ),
  );

  console.log(
    "All deterministic multi-exchange management integration tests passed successfully.",
  );
}

void runIntegration();