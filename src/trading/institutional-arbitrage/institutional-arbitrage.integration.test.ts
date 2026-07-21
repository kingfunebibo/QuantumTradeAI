declare const process: { exitCode?: number };

function fail(message: string): never { throw new Error(message); }
function ok(value: unknown, message = "Expected value to be truthy."): asserts value { if (!value) fail(message); }
function equal<T>(actual: T, expected: T, message = "Values are not equal."): void { if (actual !== expected) fail(`${message} Expected ${String(expected)}, received ${String(actual)}.`); }
function deepEqual(actual: unknown, expected: unknown, message = "Values are not deeply equal."): void { const left = JSON.stringify(actual); const right = JSON.stringify(expected); if (left !== right) fail(`${message}\nExpected: ${right}\nActual: ${left}`); }
async function rejects(operation: () => Promise<unknown>, predicate: (error: unknown) => boolean): Promise<void> { try { await operation(); } catch (error: unknown) { if (!predicate(error)) fail("Rejected with an unexpected error."); return; } fail("Expected operation to reject."); }
import {
  type ArbitrageInstrumentReference,
  type ArbitrageMarketSnapshot,
  type ArbitrageVenueReference,
  type CrossExchangeArbitrageOpportunity,
  type InstitutionalArbitrageOpportunitySource,
  type InstitutionalArbitrageOrchestratorRequest,
} from "./institutional-arbitrage-contracts";
import {
  InstitutionalArbitrageExecutorImpl,
  type ArbitrageExecutionAdapterRegistry,
  type ArbitrageOrderExecutionRequest,
} from "./arbitrage-execution-engine";
import {
  InstitutionalArbitrageOrchestrator,
  InstitutionalArbitrageOrchestratorError,
  type InstitutionalArbitrageOrchestratorStage,
} from "./institutional-arbitrage-orchestrator";

const BASE_TIME = 1_800_000_000_000;

const buyVenue: ArbitrageVenueReference = Object.freeze({
  venueId: "binance",
  venueType: "CENTRALIZED_EXCHANGE",
  displayName: "Binance",
  accountId: "account-binance",
  enabled: true,
  metadata: Object.freeze({}),
});

const sellVenue: ArbitrageVenueReference = Object.freeze({
  venueId: "okx",
  venueType: "CENTRALIZED_EXCHANGE",
  displayName: "OKX",
  accountId: "account-okx",
  enabled: true,
  metadata: Object.freeze({}),
});

const instrument: ArbitrageInstrumentReference = Object.freeze({
  instrumentId: "BTC-USDT-SPOT",
  symbol: "BTC/USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  settlementAsset: "USDT",
  marketType: "SPOT",
  inverse: false,
  metadata: Object.freeze({}),
});

const zeroFees = Object.freeze({
  tradingFee: 0.5,
  fundingFee: 0,
  borrowingFee: 0,
  withdrawalFee: 0,
  depositFee: 0,
  networkFee: 0,
  bridgeFee: 0,
  gasFee: 0,
  protocolFee: 0,
  otherFee: 0,
  totalFee: 0.5,
  reportingAsset: "USDT",
});

function createOpportunity(
  opportunityId = "arb-opportunity-cross-exchange-001",
): CrossExchangeArbitrageOpportunity {
  return Object.freeze({
    opportunityId,
    type: "CROSS_EXCHANGE",
    automationMode: "FULLY_AUTOMATED",
    status: "DISCOVERED",
    strategyId: "strategy-cross-exchange",
    portfolioId: "portfolio-main",
    accountIds: Object.freeze(["account-binance", "account-okx"] as const),
    reportingAsset: "USDT",
    requestedCapital: 10_000,
    maximumCapital: 20_000,
    profitEstimate: Object.freeze({
      grossProfit: 100,
      totalFees: 1,
      expectedSlippageCost: 1,
      expectedFinancingCost: 0,
      expectedGasCost: 0,
      expectedBridgeCost: 0,
      expectedNetProfit: 98,
      stressedNetProfit: 75,
      grossReturnPercentage: 1,
      netReturnPercentage: 0.98,
      breakEvenPriceMovementBps: 2,
      reportingAsset: "USDT",
    }),
    legs: Object.freeze([
      Object.freeze({
        legId: `${opportunityId}-buy`,
        sequence: 1,
        side: "BUY",
        venue: buyVenue,
        instrument,
        inputAsset: "USDT",
        outputAsset: "BTC",
        inputQuantity: 10_000,
        expectedOutputQuantity: 0.2,
        expectedPrice: 50_000,
        limitPrice: 50_010,
        minimumOutputQuantity: 0.199,
        orderType: "LIMIT",
        timeInForce: "IOC",
        reduceOnly: false,
        postOnly: false,
        requiresTransfer: false,
        requiresBorrowing: false,
        feeEstimate: zeroFees,
        slippageEstimate: Object.freeze({
          expectedSlippageBps: 1,
          stressedSlippageBps: 3,
          maximumSlippageBps: 10,
          expectedSlippageValue: 1,
          stressedSlippageValue: 3,
          reportingAsset: "USDT",
        }),
        liquidity: Object.freeze({
          requestedQuantity: 0.2,
          executableQuantity: 0.2,
          requestedNotional: 10_000,
          executableNotional: 10_000,
          liquidityUtilizationPercentage: 10,
          depthLevelsConsumed: 1,
          sufficient: true,
        }),
        latency: Object.freeze({
          marketDataAgeMs: 10,
          expectedSubmissionLatencyMs: 20,
          expectedExecutionLatencyMs: 50,
          expectedTransferLatencyMs: 0,
          expectedSettlementLatencyMs: 100,
          expectedTotalLatencyMs: 170,
          maximumPermittedLatencyMs: 5_000,
        }),
        dependencyLegIds: Object.freeze([]),
        metadata: Object.freeze({}),
      }),
      Object.freeze({
        legId: `${opportunityId}-sell`,
        sequence: 2,
        side: "SELL",
        venue: sellVenue,
        instrument,
        inputAsset: "BTC",
        outputAsset: "USDT",
        inputQuantity: 0.2,
        expectedOutputQuantity: 10_100,
        expectedPrice: 50_500,
        limitPrice: 50_490,
        minimumOutputQuantity: 10_090,
        orderType: "LIMIT",
        timeInForce: "IOC",
        reduceOnly: false,
        postOnly: false,
        requiresTransfer: false,
        requiresBorrowing: false,
        feeEstimate: zeroFees,
        slippageEstimate: Object.freeze({
          expectedSlippageBps: 1,
          stressedSlippageBps: 3,
          maximumSlippageBps: 10,
          expectedSlippageValue: 1,
          stressedSlippageValue: 3,
          reportingAsset: "USDT",
        }),
        liquidity: Object.freeze({
          requestedQuantity: 0.2,
          executableQuantity: 0.2,
          requestedNotional: 10_100,
          executableNotional: 10_100,
          liquidityUtilizationPercentage: 10,
          depthLevelsConsumed: 1,
          sufficient: true,
        }),
        latency: Object.freeze({
          marketDataAgeMs: 10,
          expectedSubmissionLatencyMs: 20,
          expectedExecutionLatencyMs: 50,
          expectedTransferLatencyMs: 0,
          expectedSettlementLatencyMs: 100,
          expectedTotalLatencyMs: 170,
          maximumPermittedLatencyMs: 5_000,
        }),
        dependencyLegIds: Object.freeze([]),
        metadata: Object.freeze({}),
      }),
    ]),
    transfers: Object.freeze([]),
    discoveredAt: BASE_TIME,
    validFrom: BASE_TIME,
    expiresAt: BASE_TIME + 60_000,
    sourceSequence: 1,
    confidence: 0.95,
    correlationId: "correlation-integration-001",
    traceId: "trace-integration-001",
    version: 1,
    metadata: Object.freeze({}),
    details: Object.freeze({
      buyVenue,
      sellVenue,
      instrument,
      buyPrice: 50_000,
      sellPrice: 50_500,
      grossSpread: 500,
      grossSpreadBps: 100,
      executableQuantity: 0.2,
      inventoryPrepositioned: true,
      settlementVerificationRequired: true,
    }),
  });
}

function createSnapshots(): readonly ArbitrageMarketSnapshot[] {
  return Object.freeze([
    Object.freeze({
      venue: buyVenue,
      instrument,
      bidPrice: 49_990,
      askPrice: 50_000,
      lastPrice: 49_995,
      midPrice: 49_995,
      bidQuantity: 10,
      askQuantity: 10,
      volume24h: 1_000_000,
      sourceTimestamp: BASE_TIME,
      observedAt: BASE_TIME,
      sequence: 1,
      metadata: Object.freeze({}),
    }),
    Object.freeze({
      venue: sellVenue,
      instrument,
      bidPrice: 50_500,
      askPrice: 50_510,
      lastPrice: 50_505,
      midPrice: 50_505,
      bidQuantity: 10,
      askQuantity: 10,
      volume24h: 1_000_000,
      sourceTimestamp: BASE_TIME,
      observedAt: BASE_TIME,
      sequence: 2,
      metadata: Object.freeze({}),
    }),
  ]);
}

function createRequest(): InstitutionalArbitrageOrchestratorRequest {
  return Object.freeze({
    context: Object.freeze({
      portfolioId: "portfolio-main",
      strategyIds: Object.freeze(["strategy-cross-exchange"] as const),
      enabledTypes: Object.freeze(["CROSS_EXCHANGE"] as const),
      venueIds: Object.freeze(["binance", "okx"] as const),
      accountIds: Object.freeze(["account-binance", "account-okx"] as const),
      reportingAsset: "USDT",
      availableCapital: 100_000,
      scanTimestamp: BASE_TIME,
      sourceSequence: 1,
      correlationId: "correlation-integration-001",
      traceId: "trace-integration-001",
      metadata: Object.freeze({}),
    }),
    configuration: Object.freeze({
      enabled: true,
      enabledTypes: Object.freeze(["CROSS_EXCHANGE"] as const),
      evaluationPolicy: Object.freeze({
        minimumGrossProfit: 1,
        minimumNetProfit: 1,
        minimumNetReturnPercentage: 0.01,
        minimumConfidence: 0.5,
        maximumRiskScore: 80,
        maximumSlippageBps: 20,
        maximumFeePercentage: 5,
        maximumMarketDataAgeMs: 5_000,
        maximumExecutionLatencyMs: 5_000,
        maximumSettlementLatencyMs: 10_000,
        maximumCapitalPerOpportunity: 25_000,
        maximumPortfolioAllocationPercentage: 50,
        maximumConcurrentExecutions: 5,
        requirePrepositionedInventoryForCrossExchange: true,
        requireManualApprovalForStablecoin: true,
        publishRejectedSignals: false,
      }),
      emergencyShutdownActive: false,
      circuitBreakerActive: false,
      deterministicSeed: "institutional-arbitrage-integration-seed",
      configurationVersion: 1,
      metadata: Object.freeze({}),
    }),
    marketSnapshots: createSnapshots(),
    venueHealth: Object.freeze([
      Object.freeze({
        venueId: "binance",
        available: true,
        authenticated: true,
        marketDataHealthy: true,
        tradingHealthy: true,
        depositHealthy: true,
        withdrawalHealthy: true,
        latencyMs: 20,
        errorRatePercentage: 0,
        observedAt: BASE_TIME,
        lastSuccessfulInteractionAt: BASE_TIME,
        metadata: Object.freeze({}),
      }),
      Object.freeze({
        venueId: "okx",
        available: true,
        authenticated: true,
        marketDataHealthy: true,
        tradingHealthy: true,
        depositHealthy: true,
        withdrawalHealthy: true,
        latencyMs: 25,
        errorRatePercentage: 0,
        observedAt: BASE_TIME,
        lastSuccessfulInteractionAt: BASE_TIME,
        metadata: Object.freeze({}),
      }),
    ]),
  });
}

function createExecutor(): InstitutionalArbitrageExecutorImpl {
  const registry: ArbitrageExecutionAdapterRegistry = {
    getOrderExecutionAdapter: () => ({
      execute: (request: ArbitrageOrderExecutionRequest) => ({
        status: "FILLED",
        submittedQuantity: request.leg.inputQuantity,
        filledQuantity: request.leg.inputQuantity,
        averageFillPrice: request.leg.expectedPrice,
        actualOutputQuantity: request.leg.expectedOutputQuantity,
        actualFees: request.leg.feeEstimate.totalFee,
        grossProfitContribution:
          request.leg.side === "SELL" ? 100 : 0,
        externalOrderIds: Object.freeze([`order-${request.leg.legId}`]),
        completedAt: BASE_TIME + 20,
        metadata: Object.freeze({ deterministicAdapter: true }),
      }),
    }),
  };

  return new InstitutionalArbitrageExecutorImpl(registry, {
    clock: { now: () => BASE_TIME + 9 },
    timer: { delay: () => new Promise<void>(() => undefined) },
  });
}

function createSource(
  opportunities: readonly CrossExchangeArbitrageOpportunity[],
): InstitutionalArbitrageOpportunitySource {
  return Object.freeze({
    type: "CROSS_EXCHANGE" as const,
    scan: () => opportunities,
  });
}

async function assertRejectsWithCode(
  operation: () => Promise<unknown>,
  code: InstitutionalArbitrageOrchestratorError["code"],
  stage: string,
): Promise<void> {
  await rejects(operation, (error: unknown) => {
    ok(error instanceof InstitutionalArbitrageOrchestratorError);
    equal(error.code, code);
    equal(error.stage, stage);
    return true;
  });
}

async function runSuccessfulPipelineTest(): Promise<void> {
  const stages: InstitutionalArbitrageOrchestratorStage[] = [];
  const source = createSource(Object.freeze([createOpportunity()]));

  const createOrchestrator = () =>
    new InstitutionalArbitrageOrchestrator({
      opportunitySources: Object.freeze([source]),
      executor: createExecutor(),
      clock: { now: () => BASE_TIME },
      observer: {
        onStageCompleted: (stage) => {
          stages.push(stage);
        },
      },
      validateEveryStage: true,
    });

  const request = createRequest();
  const first = await createOrchestrator().run(request);
  const second = await createOrchestrator().run(request);

  deepEqual(first, second, "Equivalent inputs must produce identical outputs.");
  equal(first.scanResult.opportunities.length, 1);
  equal(first.evaluationResult.rankedOpportunities.length, 1);
  equal(first.evaluationResult.decisions.length, 1);
  equal(first.evaluationResult.decisions[0]?.action, "EXECUTE");
  equal(first.executionPlans.length, 1);
  equal(first.publishedSignals.length, 0);
  equal(first.completedAt, BASE_TIME + 11);
  equal(first.correlationId, request.context.correlationId);
  equal(first.traceId, request.context.traceId);
  ok(Object.isFrozen(first));
  ok(Object.isFrozen(first.scanResult));
  ok(Object.isFrozen(first.evaluationResult));
  ok(Object.isFrozen(first.executionPlans));

  const expectedStages: readonly InstitutionalArbitrageOrchestratorStage[] = [
    "REQUEST_VALIDATION",
    "OPPORTUNITY_SCAN",
    "RISK_ASSESSMENT",
    "OPPORTUNITY_RANKING",
    "CAPITAL_ALLOCATION",
    "DECISION",
    "EXECUTION_PLANNING",
    "SIGNAL_PUBLICATION",
    "EXECUTION",
    "SETTLEMENT_VERIFICATION",
    "RESULT_VALIDATION",
  ];
  deepEqual(stages, [...expectedStages, ...expectedStages]);
}

async function runMissingSourceTest(): Promise<void> {
  const orchestrator = new InstitutionalArbitrageOrchestrator({
    opportunitySources: Object.freeze([]),
    executor: createExecutor(),
    clock: { now: () => BASE_TIME },
  });

  await assertRejectsWithCode(
    () => orchestrator.run(createRequest()),
    "MISSING_OPPORTUNITY_SOURCE",
    "OPPORTUNITY_SCAN",
  );
}

async function runDuplicateOpportunityTest(): Promise<void> {
  const opportunity = createOpportunity();
  const orchestrator = new InstitutionalArbitrageOrchestrator({
    opportunitySources: Object.freeze([
      createSource(Object.freeze([opportunity, opportunity])),
    ]),
    executor: createExecutor(),
    clock: { now: () => BASE_TIME },
  });

  await assertRejectsWithCode(
    () => orchestrator.run(createRequest()),
    "DUPLICATE_OPPORTUNITY",
    "OPPORTUNITY_SCAN",
  );
}

async function runUnhealthyVenueFilteringTest(): Promise<void> {
  const request = createRequest();
  const unhealthyRequest: InstitutionalArbitrageOrchestratorRequest = Object.freeze({
    ...request,
    venueHealth: Object.freeze(
      request.venueHealth.map((health) =>
        health.venueId === "okx"
          ? Object.freeze({ ...health, tradingHealthy: false })
          : health,
      ),
    ),
  });

  const orchestrator = new InstitutionalArbitrageOrchestrator({
    opportunitySources: Object.freeze([
      createSource(Object.freeze([createOpportunity()])),
    ]),
    executor: createExecutor(),
    clock: { now: () => BASE_TIME },
  });

  const result = await orchestrator.run(unhealthyRequest);
  equal(result.scanResult.opportunities.length, 0);
  equal(result.scanResult.rejectedCandidateCount, 1);
  equal(result.executionPlans.length, 0);
}

async function main(): Promise<void> {
  await runSuccessfulPipelineTest();
  await runMissingSourceTest();
  await runDuplicateOpportunityTest();
  await runUnhealthyVenueFilteringTest();
  console.log("All institutional arbitrage integration tests passed successfully.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});