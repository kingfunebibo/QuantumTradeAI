/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/
 * ai-market-intelligence.integration.test.ts
 *
 * Deterministic integration coverage for the market-intelligence orchestrator.
 */

import assert from "node:assert/strict";

import {
  AiMarketIntelligenceOrchestratorDependencies,
  AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
  AnomalySeverity,
  ConfidenceQuality,
  ExplanationAudience,
  IntelligenceActionability,
  IntelligencePublicationTopic,
  LiquidityState,
  MarketDataQuality,
  MarketDirection,
  MarketInstrumentType,
  MarketIntelligencePipelineStage,
  MarketIntelligencePublication,
  MarketIntelligenceRequest,
  MarketIntelligenceRunStatus,
  MarketRegime,
  MarketTimeframe,
  MarketVenueType,
  ModelInferenceMode,
  OrderFlowBias,
  ParticipantActivity,
  PredictionHorizon,
  RegimeTransitionState,
  ValidationSeverity,
  VolatilityState,
} from "./ai-market-intelligence-contracts";
import {
  createAiMarketIntelligenceOrchestrator,
} from "./ai-market-intelligence-orchestrator";

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

class DeterministicTestClock {
  private index = 0;

  public constructor(
    private readonly values: readonly number[],
  ) {}

  public now(): number {
    const value =
      this.values[this.index] ??
      this.values[this.values.length - 1] ??
      1_700_000_000_000;

    this.index += 1;
    return value;
  }
}

class DeterministicTestIdGenerator {
  public generate(prefix: string, seed: string): string {
    return `${prefix}-${stableHash(seed)}`;
  }
}

class DeterministicTestFingerprintGenerator {
  public fingerprint(value: unknown): string {
    return `fp-${stableHash(stableStringify(value))}`;
  }
}

function stableStringify(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createRequest(): MarketIntelligenceRequest {
  const analysisTimeMs = 1_700_000_000_000;
  const windowStartMs = analysisTimeMs - 60 * 60 * 1_000;

  return deepFreeze({
    requestId: "request-btc-usdt-001",
    requestedAtMs: analysisTimeMs,
    input: {
      market: {
        venueId: "BINANCE",
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        venueType: MarketVenueType.CENTRALIZED_EXCHANGE,
        instrumentType: MarketInstrumentType.SPOT,
      },
      timeframe: MarketTimeframe.ONE_MINUTE,
      analysisTimeMs,
      observationWindow: {
        startTimeMs: windowStartMs,
        endTimeMs: analysisTimeMs,
      },
      candles: [
        {
          openTimeMs: windowStartMs,
          closeTimeMs: windowStartMs + 60_000,
          open: 50_000,
          high: 50_200,
          low: 49_900,
          close: 50_100,
          volume: 125,
          quoteVolume: 6_262_500,
          tradeCount: 1_200,
          provenance: {
            sourceId: "integration-test",
            sourceType: "CANDLES",
            receivedAtMs: analysisTimeMs,
            eventTimeMs: windowStartMs + 60_000,
          },
        },
      ],
      qualityAssessment: {
        quality: MarketDataQuality.EXCELLENT,
        overallScore: 0.98,
        completenessScore: 1,
        freshnessScore: 0.99,
        consistencyScore: 0.98,
        continuityScore: 0.97,
        integrityScore: 0.99,
        assessedAtMs: analysisTimeMs,
        issues: [],
      },
    },
    predictionWindows: [
      {
        horizon: PredictionHorizon.SHORT,
        durationMs: 15 * 60 * 1_000,
        startTimeMs: analysisTimeMs,
        endTimeMs: analysisTimeMs + 15 * 60 * 1_000,
      },
    ],
    configuration: {
      schemaVersion: AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
      featureExtraction: {
        enabledCategories: [],
        definitions: [],
        rejectMissingRequiredFeatures: false,
        maximumMissingFeatureRatio: 1,
        minimumFeatureQuality: 0,
        includeRawFeatures: true,
      },
      regimeIntelligence: {
        inferenceMode: ModelInferenceMode.DETERMINISTIC_RULES,
        minimumConfidence: 0.5,
        transitionThreshold: 0.6,
        persistenceThreshold: 0.6,
        minimumRegimeDurationMs: 60_000,
        enabledRegimes: Object.values(MarketRegime),
        modelVersion: "regime-test-v1",
      },
      volatilityForecasting: {
        enabled: true,
        horizons: [
          {
            horizon: PredictionHorizon.SHORT,
            durationMs: 15 * 60 * 1_000,
            startTimeMs: analysisTimeMs,
            endTimeMs:
              analysisTimeMs + 15 * 60 * 1_000,
          },
        ],
        confidenceLevel: 0.95,
        minimumConfidence: 0.5,
        annualizeResults: true,
        modelVersion: "volatility-test-v1",
      },
      liquidityPrediction: {
        enabled: true,
        horizons: [
          {
            horizon: PredictionHorizon.SHORT,
            durationMs: 15 * 60 * 1_000,
            startTimeMs: analysisTimeMs,
            endTimeMs:
              analysisTimeMs + 15 * 60 * 1_000,
          },
        ],
        targetNotional: 100_000,
        depthLevels: 20,
        minimumFillProbability: 0.7,
        maximumAcceptableSpreadBps: 10,
        maximumAcceptableImpactBps: 20,
        modelVersion: "liquidity-test-v1",
      },
      orderFlow: {
        enabled: true,
        tradeLookbackCount: 1_000,
        orderBookDepthLevels: 20,
        blockTradeNotionalThreshold: 100_000,
        institutionalFootprintThreshold: 0.7,
        reversalProbabilityThreshold: 0.65,
        modelVersion: "order-flow-test-v1",
      },
      correlationIntelligence: {
        enabled: true,
        minimumObservations: 20,
        rollingWindowMs: 60 * 60 * 1_000,
        breakdownThreshold: 0.35,
        clusteringThreshold: 0.7,
        systemicRiskThreshold: 0.75,
        modelVersion: "correlation-test-v1",
      },
      anomalyDetection: {
        enabled: true,
        sensitivity: 0.8,
        minimumProbability: 0.6,
        minimumConfidence: 0.6,
        enabledTypes: [],
        modelVersion: "anomaly-test-v1",
      },
      pricePrediction: {
        enabled: true,
        horizons: [
          {
            horizon: PredictionHorizon.SHORT,
            durationMs: 15 * 60 * 1_000,
            startTimeMs: analysisTimeMs,
            endTimeMs:
              analysisTimeMs + 15 * 60 * 1_000,
          },
        ],
        inferenceMode: ModelInferenceMode.DETERMINISTIC_RULES,
        neutralBandPercentage: 0.1,
        strongDirectionThresholdPercentage: 1,
        minimumConfidence: 0.5,
        modelVersion: "price-test-v1",
      },
      confidenceAggregation: {
        componentWeights: {
          regime: 0.2,
          volatility: 0.15,
          liquidity: 0.15,
          orderFlow: 0.15,
          correlation: 0.1,
          anomaly: 0.1,
          pricePrediction: 0.15,
        },
        minimumDataQuality: 0.5,
        disagreementPenalty: 0.1,
        anomalyPenalty: 0.1,
        regimeInstabilityPenalty: 0.1,
        minimumPublishableConfidence: 0.6,
        calibrationVersion: "confidence-test-v1",
      },
      explainability: {
        enabled: true,
        audience: ExplanationAudience.TRADER,
        maximumPrimaryFactors: 5,
        maximumOpposingFactors: 5,
        maximumCounterfactuals: 3,
        includeLimitations: true,
        modelVersion: "explainability-test-v1",
      },
      publication: {
        enabled: true,
        topics: [
          IntelligencePublicationTopic
            .MARKET_INTELLIGENCE_REPORT,
          IntelligencePublicationTopic.PRICE_PREDICTION,
        ],
        publishOnlyActionableReports: false,
        minimumConfidence: 0.6,
        publishWarnings: true,
      },
      failFast: true,
      requireDeterministicFingerprint: true,
      maximumInputAgeMs: 60_000,
      maximumPipelineDurationMs: 60_000,
    },
  } as unknown as MarketIntelligenceRequest);
}

function createDependencies(
  publications: MarketIntelligencePublication[],
  valid = true,
): AiMarketIntelligenceOrchestratorDependencies {
  const featureVector = deepFreeze({
    vectorId: "feature-vector-001",
    market: createRequest().input.market,
    timeframe: MarketTimeframe.ONE_MINUTE,
    generatedAtMs: 1_700_000_000_000,
    observationWindow: createRequest().input.observationWindow,
    features: [],
    featureCount: 0,
    missingFeatureCount: 0,
    qualityScore: 0.98,
    deterministicFingerprint: "feature-fingerprint",
    schemaVersion: AI_MARKET_INTELLIGENCE_SCHEMA_VERSION,
  });

  const regime = deepFreeze({
    regimeId: "regime-001",
    primaryRegime: MarketRegime.BULL_TREND,
    secondaryRegimes: [],
    transitionState: RegimeTransitionState.STABLE,
    regimeStrength: 0.8,
    confidence: 0.86,
    persistenceProbability: 0.82,
    transitionProbability: 0.18,
    estimatedStartTimeMs: 1_699_999_700_000,
    drivers: [],
    modelVersion: "regime-test-v1",
    generatedAtMs: 1_700_000_000_000,
  });

  const volatilityForecasts = deepFreeze([
    {
      predictionId: "volatility-001",
      window: createRequest().predictionWindows[0],
      currentState: VolatilityState.NORMAL,
      forecastState: VolatilityState.NORMAL,
      currentVolatility: 0.35,
      forecastVolatility: 0.37,
      changePercentage: 0.057,
      confidenceInterval: {
        lowerBound: 0.31,
        upperBound: 0.43,
        confidenceLevel: 0.95,
      },
      expansionProbability: 0.35,
      contractionProbability: 0.2,
      confidence: 0.81,
      drivers: [],
      modelVersion: "volatility-test-v1",
      generatedAtMs: 1_700_000_000_000,
    },
  ]);

  const liquidityPredictions = deepFreeze([
    {
      predictionId: "liquidity-001",
      window: createRequest().predictionWindows[0],
      currentState: LiquidityState.HEALTHY,
      predictedState: LiquidityState.HEALTHY,
      predictedBidDepth: 5_000_000,
      predictedAskDepth: 4_900_000,
      predictedSpreadBps: 1.5,
      predictedMarketImpactBps: 2,
      predictedFillProbability: 0.96,
      deteriorationProbability: 0.12,
      improvementProbability: 0.28,
      confidence: 0.84,
      drivers: [],
      modelVersion: "liquidity-test-v1",
      generatedAtMs: 1_700_000_000_000,
    },
  ]);

  const orderFlow = deepFreeze({
    intelligenceId: "order-flow-001",
    generatedAtMs: 1_700_000_000_000,
    window: createRequest().input.observationWindow,
    bias: OrderFlowBias.BUY,
    buyPressure: 0.68,
    sellPressure: 0.32,
    netAggressiveFlow: 1_250_000,
    cumulativeVolumeDelta: 975_000,
    orderBookImbalance: 0.22,
    absorptionScore: 0.35,
    exhaustionScore: 0.2,
    reversalProbability: 0.24,
    participantActivity:
      ParticipantActivity.INSTITUTIONAL_ACCUMULATION,
    institutionalFootprintScore: 0.73,
    blockTrades: [],
    confidence: 0.83,
    modelVersion: "order-flow-test-v1",
  });

  const correlations = deepFreeze({
    matrixId: "correlation-001",
    generatedAtMs: 1_700_000_000_000,
    window: createRequest().input.observationWindow,
    pairs: [],
    clusters: [],
    breakdowns: [],
    averageMarketCorrelation: 0.42,
    concentrationScore: 0.31,
    diversificationScore: 0.69,
    systemicRiskScore: 0.25,
    confidence: 0.8,
    modelVersion: "correlation-test-v1",
  });

  const pricePredictions = deepFreeze([
    {
      predictionId: "price-001",
      window: createRequest().predictionWindows[0],
      direction: MarketDirection.BULLISH,
      directionProbabilities: {
        bearish: 0.15,
        neutral: 0.2,
        bullish: 0.65,
      },
      expectedReturnPercentage: 0.75,
      expectedMagnitudePercentage: 0.9,
      expectedPrice: 50_475,
      lowerPriceBound: 49_900,
      upperPriceBound: 51_100,
      reversalProbability: 0.2,
      confidence: 0.82,
      drivers: [],
      modelVersion: "price-test-v1",
      generatedAtMs: 1_700_000_000_000,
    },
  ]);

  const confidence = deepFreeze({
    confidence: 0.82,
    quality: ConfidenceQuality.HIGH,
    dataQualityAdjustment: 0,
    regimeStabilityAdjustment: 0.04,
    anomalyAdjustment: 0,
    agreement: {
      agreementScore: 0.88,
      supportingComponents: [
        "regime",
        "orderFlow",
        "pricePrediction",
      ],
      conflictingComponents: [],
    },
    components: [],
    calibrationScore: 0.9,
    generatedAtMs: 1_700_000_000_000,
  });

  const explanation = deepFreeze({
    id: "explanation-001",
    audience: ExplanationAudience.TRADER,
    headline:
      "BTCUSDT: BULLISH outlook under BULL_TREND regime",
    summary:
      "Bullish regime, positive order flow, and healthy liquidity support the forecast.",
    primaryFactors: [],
    opposingFactors: [],
    uncertaintyFactors: [],
    counterfactuals: [],
    limitations: [
      "Predictions remain probabilistic.",
    ],
    generatedAtMs: 1_700_000_000_000,
    modelVersion: "explainability-test-v1",
  });

  return {
    validator: {
      validateRequest: (request: MarketIntelligenceRequest) =>
        valid
          ? deepFreeze({
              valid: true,
              value: request,
              issues: [],
              errorCount: 0,
              warningCount: 0,
            })
          : deepFreeze({
              valid: false,
              issues: [
                {
                  code: "TEST_REJECTION",
                  path: "request",
                  severity: ValidationSeverity.ERROR,
                  message:
                    "Request rejected by integration-test validator.",
                },
              ],
              errorCount: 1,
              warningCount: 0,
            }),
      validateConfiguration: (configuration: MarketIntelligenceRequest["configuration"]) =>
        deepFreeze({
          valid: true,
          value: configuration,
          issues: [],
          errorCount: 0,
          warningCount: 0,
        }),
      validateInput: (input: MarketIntelligenceRequest["input"]) =>
        deepFreeze({
          valid: true,
          value: input,
          issues: [],
          errorCount: 0,
          warningCount: 0,
        }),
      validateFeatureVector: (value: any) =>
        deepFreeze({
          valid: true,
          value,
          issues: [],
          errorCount: 0,
          warningCount: 0,
        }),
      validateReport: (report: any) =>
        deepFreeze({
          valid: true,
          value: report,
          issues: [],
          errorCount: 0,
          warningCount: 0,
        }),
    },
    featureExtractor: {
      extract: () => featureVector,
    },
    regimeEngine: {
      analyze: () => regime,
    },
    volatilityEngine: {
      forecast: () => volatilityForecasts,
    },
    liquidityEngine: {
      predict: () => liquidityPredictions,
    },
    orderFlowEngine: {
      analyze: () => orderFlow,
    },
    correlationEngine: {
      analyze: () => correlations,
    },
    anomalyEngine: {
      detect: () => deepFreeze([]),
    },
    pricePredictionEngine: {
      predict: () => pricePredictions,
    },
    confidenceEngine: {
      aggregate: () => confidence,
    },
    explainabilityEngine: {
      explain: () => explanation,
    },
    publisher: {
      publish: (publication: MarketIntelligencePublication) => {
        publications.push(publication);
      },
    },
    clock: new DeterministicTestClock(
      Array.from(
        { length: 100 },
        (_, index) => 1_700_000_000_000 + index,
      ),
    ),
    idGenerator: new DeterministicTestIdGenerator(),
    fingerprintGenerator:
      new DeterministicTestFingerprintGenerator(),
  } as unknown as AiMarketIntelligenceOrchestratorDependencies;
}

async function testSuccessfulPipeline(): Promise<void> {
  const publications: MarketIntelligencePublication[] = [];
  const orchestrator =
    createAiMarketIntelligenceOrchestrator(
      createDependencies(publications),
    );
  const response = await orchestrator.analyze(createRequest());

  assert.equal(
    response.status,
    MarketIntelligenceRunStatus.COMPLETED,
  );
  assert.equal(response.validation.valid, true);
  if (response.report === undefined) {
    throw new Error("Expected successful response report.");
  }

  const report = response.report;

  assert.equal(
    report.summary.direction,
    MarketDirection.BULLISH,
  );
  assert.equal(
    report.summary.actionability,
    IntelligenceActionability.TRADE_CANDIDATE,
  );
  assert.equal(report.riskSignals.length, 0);
  assert.equal(
    response.trace.completedStages.length,
    13,
  );
  assert.deepEqual(
    response.trace.completedStages,
    Object.values(MarketIntelligencePipelineStage),
  );
  assert.equal(publications.length, 2);
  assert.deepEqual(
    publications.map((publication) => publication.topic),
    [
      IntelligencePublicationTopic
        .MARKET_INTELLIGENCE_REPORT,
      IntelligencePublicationTopic.PRICE_PREDICTION,
    ],
  );
  assert.ok(
    report.deterministicFingerprint.length > 0,
  );
  assert.ok(
    response.trace.deterministicFingerprint?.length,
  );
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(response.trace), true);
}

async function testDeterministicReplay(): Promise<void> {
  const firstPublications: MarketIntelligencePublication[] =
    [];
  const secondPublications: MarketIntelligencePublication[] =
    [];

  const first = await createAiMarketIntelligenceOrchestrator(
    createDependencies(firstPublications),
  ).analyze(createRequest());
  const second = await createAiMarketIntelligenceOrchestrator(
    createDependencies(secondPublications),
  ).analyze(createRequest());

  assert.deepEqual(first, second);
  assert.deepEqual(firstPublications, secondPublications);
}

async function testValidationRejection(): Promise<void> {
  const publications: MarketIntelligencePublication[] = [];
  const response =
    await createAiMarketIntelligenceOrchestrator(
      createDependencies(publications, false),
    ).analyze(createRequest());

  assert.equal(
    response.status,
    MarketIntelligenceRunStatus.REJECTED,
  );
  assert.equal(response.validation.valid, false);
  assert.equal(response.report, undefined);
  assert.equal(publications.length, 0);
  assert.deepEqual(response.trace.completedStages, [
    MarketIntelligencePipelineStage.VALIDATION,
  ]);
}

async function run(): Promise<void> {
  await testSuccessfulPipeline();
  await testDeterministicReplay();
  await testValidationRejection();

  console.log(
    "All AI market intelligence integration tests passed successfully.",
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});