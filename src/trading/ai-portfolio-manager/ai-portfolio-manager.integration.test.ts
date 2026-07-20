import {
  AIPortfolioManagerEngine,
  AIPortfolioCapitalAllocationEngine,
  AIPortfolioCorrelationEngine,
  AIPortfolioDriftDetector,
  AIPortfolioExplainabilityEngine,
  AIPortfolioOptimizationEngine,
  AIPortfolioRebalancePlanner,
  AIPortfolioRiskBudgetAllocator,
  AIPortfolioStateAnalyzer,
  AIPortfolioValidator,
  PortfolioAllocationTargetType,
  PortfolioAssetClass,
  PortfolioDecisionStatus,
  PortfolioManagerMode,
  PortfolioMarketType,
  PortfolioOptimizationMethod,
  PortfolioOptimizationObjective,
  PortfolioPositionSide,
  type AIPortfolioManagerClock,
  type AIPortfolioManagerRequest,
  type AssetReturnSeries,
  type PortfolioAllocationTarget,
  type PortfolioSnapshot,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

function assertThrows(action: () => void, pattern: RegExp, message: string): void {
  try {
    action();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (pattern.test(text)) {
      return;
    }
    throw new Error(`${message} Unexpected error: ${text}`);
  }
  throw new Error(`${message} No error was thrown.`);
}

const FIXED_NOW = Date.parse("2026-07-20T12:00:00.000Z");
const clock: AIPortfolioManagerClock = Object.freeze({
  now: (): number => FIXED_NOW,
});

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function buildReturnSeries(asset: string, values: readonly number[]): AssetReturnSeries {
  return freeze({
    asset,
    observations: freeze(
      values.map((returnValue, index) =>
        freeze({
          timestamp: new Date(FIXED_NOW - (values.length - index) * 60_000).toISOString(),
          returnValue,
        }),
      ),
    ),
  });
}

function buildSnapshot(): PortfolioSnapshot {
  const capturedAt = new Date(FIXED_NOW - 30_000).toISOString();

  return freeze({
    snapshotId: "snapshot-m32-integration-001",
    portfolioId: "portfolio-main",
    baseCurrency: "USDT",
    totalEquity: 100_000,
    availableCapital: 20_000,
    reservedCapital: 0,
    investedCapital: 80_000,
    grossExposure: 80_000,
    netExposure: 80_000,
    longExposure: 80_000,
    shortExposure: 0,
    realizedPnl: 2_000,
    unrealizedPnl: 1_000,
    dailyPnl: 500,
    leverage: 0.8,
    marginUtilization: 0,
    balances: freeze([
      freeze({
        asset: "BTC",
        total: 1,
        available: 1,
        reserved: 0,
        valuationPrice: 40_000,
        valuationCurrency: "USDT",
        marketValue: 40_000,
        exchangeId: "binance",
        accountId: "primary",
        updatedAt: capturedAt,
        metadata: freeze({ assetClass: PortfolioAssetClass.CRYPTOCURRENCY }),
      }),
      freeze({
        asset: "ETH",
        total: 20,
        available: 20,
        reserved: 0,
        valuationPrice: 2_000,
        valuationCurrency: "USDT",
        marketValue: 40_000,
        exchangeId: "okx",
        accountId: "primary",
        updatedAt: capturedAt,
        metadata: freeze({ assetClass: PortfolioAssetClass.CRYPTOCURRENCY }),
      }),
      freeze({
        asset: "USDT",
        total: 20_000,
        available: 20_000,
        reserved: 0,
        valuationPrice: 1,
        valuationCurrency: "USDT",
        marketValue: 20_000,
        exchangeId: "bybit",
        accountId: "primary",
        updatedAt: capturedAt,
        metadata: freeze({ assetClass: PortfolioAssetClass.STABLECOIN }),
      }),
    ]),
    positions: freeze([
      freeze({
        positionId: "position-btc-001",
        marketSymbol: "BTC-USDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        marketType: PortfolioMarketType.SPOT,
        side: PortfolioPositionSide.LONG,
        quantity: 1,
        averageEntryPrice: 38_000,
        markPrice: 40_000,
        marketValue: 40_000,
        notionalValue: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: 2_000,
        exchangeId: "binance",
        accountId: "primary",
        strategyId: "balanced-growth",
        botId: "spot-bot-001",
        updatedAt: capturedAt,
      }),
      freeze({
        positionId: "position-eth-001",
        marketSymbol: "ETH-USDT",
        baseAsset: "ETH",
        quoteAsset: "USDT",
        marketType: PortfolioMarketType.SPOT,
        side: PortfolioPositionSide.LONG,
        quantity: 20,
        averageEntryPrice: 2_050,
        markPrice: 2_000,
        marketValue: 40_000,
        notionalValue: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: -1_000,
        exchangeId: "okx",
        accountId: "primary",
        strategyId: "balanced-growth",
        botId: "spot-bot-002",
        updatedAt: capturedAt,
      }),
    ]),
    strategyExposures: freeze([
      freeze({
        strategyId: "balanced-growth",
        allocatedCapital: 80_000,
        utilizedCapital: 80_000,
        reservedCapital: 0,
        grossExposure: 80_000,
        netExposure: 80_000,
        realizedPnl: 2_000,
        unrealizedPnl: 1_000,
        drawdown: 0.02,
        activePositions: 2,
        activeBots: 2,
      }),
    ]),
    botExposures: freeze([
      freeze({
        botId: "spot-bot-001",
        strategyId: "balanced-growth",
        allocatedCapital: 40_000,
        utilizedCapital: 40_000,
        reservedCapital: 0,
        grossExposure: 40_000,
        netExposure: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: 2_000,
        drawdown: 0.01,
        activePositions: 1,
      }),
      freeze({
        botId: "spot-bot-002",
        strategyId: "balanced-growth",
        allocatedCapital: 40_000,
        utilizedCapital: 40_000,
        reservedCapital: 0,
        grossExposure: 40_000,
        netExposure: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: -1_000,
        drawdown: 0.03,
        activePositions: 1,
      }),
    ]),
    exchangeExposures: freeze([
      freeze({
        exchangeId: "binance",
        accountId: "primary",
        totalCapital: 40_000,
        availableCapital: 0,
        reservedCapital: 0,
        grossExposure: 40_000,
        netExposure: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: 2_000,
        openPositions: 1,
        healthScore: 95,
      }),
      freeze({
        exchangeId: "okx",
        accountId: "primary",
        totalCapital: 40_000,
        availableCapital: 0,
        reservedCapital: 0,
        grossExposure: 40_000,
        netExposure: 40_000,
        realizedPnl: 1_000,
        unrealizedPnl: -1_000,
        openPositions: 1,
        healthScore: 94,
      }),
      freeze({
        exchangeId: "bybit",
        accountId: "primary",
        totalCapital: 20_000,
        availableCapital: 20_000,
        reservedCapital: 0,
        grossExposure: 0,
        netExposure: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        openPositions: 0,
        healthScore: 93,
      }),
    ]),
    capturedAt,
  });
}

function buildTargets(): readonly PortfolioAllocationTarget[] {
  return freeze([
    freeze({
      targetType: PortfolioAllocationTargetType.ASSET,
      targetId: "BTC",
      currentCapital: 40_000,
      currentWeight: 0.4,
      minimumWeight: 0.15,
      maximumWeight: 0.55,
      expectedReturn: 0.12,
      expectedRisk: 0.35,
      performanceScore: 0.8,
      healthScore: 0.9,
      liquidityScore: 0.95,
      enabled: true,
    }),
    freeze({
      targetType: PortfolioAllocationTargetType.ASSET,
      targetId: "ETH",
      currentCapital: 40_000,
      currentWeight: 0.4,
      minimumWeight: 0.15,
      maximumWeight: 0.55,
      expectedReturn: 0.1,
      expectedRisk: 0.4,
      performanceScore: 0.75,
      healthScore: 0.88,
      liquidityScore: 0.93,
      enabled: true,
    }),
    freeze({
      targetType: PortfolioAllocationTargetType.CASH_RESERVE,
      targetId: "USDT",
      currentCapital: 20_000,
      currentWeight: 0.2,
      minimumWeight: 0.1,
      maximumWeight: 0.4,
      expectedReturn: 0,
      expectedRisk: 0,
      performanceScore: 0.5,
      healthScore: 1,
      liquidityScore: 1,
      enabled: true,
    }),
  ]);
}

function buildRequest(): AIPortfolioManagerRequest {
  const requestedAt = new Date(FIXED_NOW - 10_000).toISOString();

  return freeze({
    requestId: "request-m32-integration-001",
    portfolioId: "portfolio-main",
    snapshot: buildSnapshot(),
    configuration: freeze({
      portfolioId: "portfolio-main",
      mode: PortfolioManagerMode.PAPER,
      enabled: true,
      optimizationPreferences: freeze({
        objective: PortfolioOptimizationObjective.BALANCED_GROWTH,
        method: PortfolioOptimizationMethod.MEAN_VARIANCE,
        riskAversion: 0.5,
        returnPreference: 0.5,
        diversificationPreference: 0.75,
        turnoverPenalty: 0.1,
        transactionCostPenalty: 0.1,
        drawdownPenalty: 0.1,
        targetCashWeight: 0.2,
        allowShortPositions: false,
        allowLeverage: false,
        maximumIterations: 250,
        convergenceTolerance: 1e-8,
      }),
      allocationPolicy: freeze({
        policyId: "policy-balanced-growth",
        portfolioId: "portfolio-main",
        baseCurrency: "USDT",
        minimumCashReserveWeight: 0.1,
        maximumInvestedWeight: 0.9,
        maximumSingleAssetWeight: 0.6,
        maximumSingleStrategyWeight: 0.9,
        maximumSingleBotWeight: 0.6,
        maximumSingleExchangeWeight: 0.6,
        maximumStablecoinWeight: 0.4,
        targetVolatility: 0.25,
        maximumPortfolioVolatility: 0.6,
        maximumDrawdown: 0.25,
        maximumTurnover: 1,
        maximumLeverage: 1,
        constraints: freeze([]),
      }),
      rebalanceDriftThreshold: 0.01,
      minimumRebalanceIntervalMilliseconds: 60_000,
      maximumDecisionAgeMilliseconds: 300_000,
      requireFreshMarketData: true,
      requireRiskBudget: false,
      requireExplanation: true,
      allowAutomaticRebalancing: true,
    }),
    returnSeries: freeze([
      buildReturnSeries("BTC", [0.01, -0.004, 0.008, 0.003, -0.002, 0.006]),
      buildReturnSeries("ETH", [0.012, -0.006, 0.01, 0.004, -0.003, 0.007]),
      buildReturnSeries("USDT", [0, 0, 0, 0, 0, 0]),
    ]),
    allocationTargets: buildTargets(),
    requestedAt,
    metadata: freeze({ test: "milestone-32-integration" }),
  });
}

function buildManager(): AIPortfolioManagerEngine {
  return new AIPortfolioManagerEngine(
    undefined,
    Object.freeze({
      validator: new AIPortfolioValidator(undefined, clock),
      stateAnalyzer: new AIPortfolioStateAnalyzer(undefined, clock),
      correlationEngine: new AIPortfolioCorrelationEngine(undefined, clock),
      riskBudgetEngine: new AIPortfolioRiskBudgetAllocator(undefined, clock),
      optimizer: new AIPortfolioOptimizationEngine(undefined, clock),
      capitalAllocator: new AIPortfolioCapitalAllocationEngine(undefined, clock),
      driftDetector: new AIPortfolioDriftDetector(undefined, clock),
      rebalancingEngine: new AIPortfolioRebalancePlanner(undefined, clock),
      explainabilityEngine: new AIPortfolioExplainabilityEngine(undefined, clock),
    }),
    clock,
  );
}

function testEndToEndDeterministicWorkflow(): void {
  const manager = buildManager();
  const request = buildRequest();
  const first = manager.evaluate(request);
  const second = manager.evaluate(request);

  assertDeepEqual(second, first, "Identical inputs and clock must produce identical decisions.");
  assertEqual(first.requestId, request.requestId, "Request ID must be preserved.");
  assertEqual(first.portfolioId, request.portfolioId, "Portfolio ID must be preserved.");
  assertEqual(first.mode, PortfolioManagerMode.PAPER, "Manager mode must be PAPER.");
  assertEqual(first.status, PortfolioDecisionStatus.VALIDATED, "Decision must be validated.");
  assertEqual(first.approvedForExecution, true, "Paper decision must be approved for execution.");
  assertEqual(first.approvalRequired, false, "Paper mode must not require approval.");
  assertDeepEqual(first.rejectionReasons, [], "Successful workflow must not contain rejection reasons.");

  assert(first.correlationMatrix !== undefined, "Correlation matrix must be generated.");
  assertDeepEqual(first.correlationMatrix.assets, ["BTC", "ETH", "USDT"], "Correlation assets must be deterministic.");
  assert(first.covarianceMatrix !== undefined, "Covariance matrix must be generated.");
  assertDeepEqual(first.covarianceMatrix.assets, ["BTC", "ETH", "USDT"], "Covariance assets must be deterministic.");
  assert(first.optimizationResult !== undefined, "Optimization result must be generated.");
  assert(first.optimizationResult.weights.length >= 3, "Optimization must contain all assets.");
  assert(first.allocationResult !== undefined, "Allocation result must be generated.");
  assertEqual(first.allocationResult.allocations.length, 3, "All targets must be allocated.");
  assert(first.driftReport !== undefined, "Drift report must be generated.");
  assert(first.explanation !== undefined, "Explanation must be generated.");
  assertEqual(first.explanation.decisionId, first.decisionId, "Explanation must reference the decision.");
  assertEqual(first.dataQuality.completenessScore, 1, "Data completeness must be perfect.");
  assert(first.dataQuality.freshnessScore > 0.99, "Data freshness must remain above 0.99.");

  assert(Object.isFrozen(first), "Decision must be frozen.");
  assert(Object.isFrozen(first.rejectionReasons), "Rejection reasons must be frozen.");
  assert(Object.isFrozen(first.warnings), "Warnings must be frozen.");
  assert(Object.isFrozen(first.correlationMatrix.values), "Correlation values must be frozen.");
  assert(Object.isFrozen(first.optimizationResult.weights), "Optimization weights must be frozen.");
  assert(Object.isFrozen(first.allocationResult.allocations), "Allocations must be frozen.");
}

function testValidationFailure(): void {
  const manager = buildManager();
  const valid = buildRequest();
  const invalid = freeze({
    ...valid,
    portfolioId: "different-portfolio",
  });

  assertThrows(
    () => manager.evaluate(invalid),
    /portfolioId/i,
    "Mismatched request and configuration portfolio IDs must be rejected.",
  );
}

function run(): void {
  testEndToEndDeterministicWorkflow();
  testValidationFailure();
  console.log("All AI portfolio manager integration tests passed successfully.");
}

run();