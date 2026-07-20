/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 15: Deterministic end-to-end integration test.
 */

import assert from "node:assert/strict";

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiFeatureDefinition,
  type AiFeatureVector,
  type AiInferenceRequest,
  type AiInferenceResponse,
  type AiModelDescriptor,
  type AiModelProvider,
  type AiModelRuntimeConfiguration,
  type AiStrategyInstrument,
  type AiStrategyMarketContext,
  type ConfidenceCalibrationProfile,
  type MetaStrategyRequest,
} from "./ai-strategy-contracts";
import { createInMemoryAiFeatureStore } from "./ai-feature-store";
import { createAiStrategyContractValidator } from "./ai-strategy-validator";
import { createFeatureEngineeringPipeline } from "./feature-engineering-pipeline";
import { createDeterministicMarketRegimeDetector } from "./market-regime-detector";
import { createDeterministicAiInferenceEngine } from "./ai-inference-engine";
import { createDeterministicEnsembleInferenceEngine } from "./ensemble-inference-engine";
import { createDeterministicAiSignalGenerator } from "./ai-signal-generator";
import { createDeterministicAiModelRegistry } from "./ai-model-registry";
import { createDeterministicAiModelRuntime } from "./ai-model-runtime";
import { createConfidenceCalibrationEngine } from "./confidence-calibration-engine";
import { createWalkForwardValidationEngine } from "./walk-forward-validation-engine";
import { createStrategyOptimizationEngine } from "./strategy-optimization-engine";
import { createMetaStrategyController } from "./meta-strategy-controller";

const BASE_TIME = 1_750_000_000_000;
const metadata = EMPTY_AI_STRATEGY_METADATA;

function createClock(): () => number {
  let now = BASE_TIME;
  return () => {
    now += 1;
    return now;
  };
}

const instrument: AiStrategyInstrument = Object.freeze({
  exchangeId: "binance",
  symbol: "BTCUSDT",
  normalizedSymbol: "BTC/USDT",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  marketType: "SPOT",
  pricePrecision: 2,
  quantityPrecision: 6,
  metadata,
});

const marketContext: AiStrategyMarketContext = Object.freeze({
  instrument,
  timeframe: "1m",
  observedAt: BASE_TIME,
  sequence: 1,
  markPrice: 65_000,
  indexPrice: 64_995,
  bestBid: 64_999,
  bestAsk: 65_001,
  lastPrice: 65_000,
  volume: 1_250,
  metadata,
});

const featureDefinitions: readonly AiFeatureDefinition[] = Object.freeze([
  Object.freeze({
    featureId: "trend_score",
    displayName: "Trend score",
    dataType: "NUMBER",
    minimum: -1,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
  Object.freeze({
    featureId: "momentum_score",
    displayName: "Momentum score",
    dataType: "NUMBER",
    minimum: -1,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
  Object.freeze({
    featureId: "volatility_score",
    displayName: "Volatility score",
    dataType: "NUMBER",
    minimum: 0,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
  Object.freeze({
    featureId: "liquidity_score",
    displayName: "Liquidity score",
    dataType: "NUMBER",
    minimum: 0,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
  Object.freeze({
    featureId: "mean_reversion_score",
    displayName: "Mean reversion score",
    dataType: "NUMBER",
    minimum: 0,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
  Object.freeze({
    featureId: "breakout_score",
    displayName: "Breakout score",
    dataType: "NUMBER",
    minimum: 0,
    maximum: 1,
    required: true,
    deterministic: true,
    metadata,
  }),
]);

function createFeatureVector(): AiFeatureVector {
  const values = Object.freeze({
    trend_score: 0.82,
    momentum_score: 0.76,
    volatility_score: 0.42,
    liquidity_score: 0.91,
    mean_reversion_score: 0.18,
    breakout_score: 0.71,
  });

  return Object.freeze({
    vectorId: "feature-vector-1",
    schemaVersion: "1.0.0",
    instrument,
    timeframe: "1m",
    observedAt: BASE_TIME,
    observations: Object.freeze(
      Object.entries(values).map(([featureId, value]) =>
        Object.freeze({
          featureId,
          value,
          observedAt: BASE_TIME,
          source: "integration-test",
          quality: "VALID" as const,
          metadata,
        }),
      ),
    ),
    values,
    checksum: "feature-vector-checksum-1",
    metadata,
  });
}

const descriptor: AiModelDescriptor = Object.freeze({
  providerId: "deterministic-provider",
  modelId: "direction-model",
  modelVersion: "1.0.0",
  displayName: "Deterministic Direction Model",
  family: "RULE_BASED",
  task: "CLASSIFICATION",
  lifecycleStatus: "ACTIVE",
  deterministic: true,
  supportsSeed: true,
  supportsBatching: false,
  supportedMarketTypes: Object.freeze(["SPOT" as const]),
  supportedTimeframes: Object.freeze(["1m" as const]),
  requiredFeatures: Object.freeze(featureDefinitions.map((item) => item.featureId)),
  optionalFeatures: Object.freeze([]),
  inputSchemaVersion: "1.0.0",
  outputSchemaVersion: "1.0.0",
  trainedAt: BASE_TIME - 10_000,
  trainingDatasetId: "dataset-integration-1",
  checksum: "model-checksum-1",
  metadata,
});

const runtimeConfiguration: AiModelRuntimeConfiguration = Object.freeze({
  providerId: descriptor.providerId,
  modelId: descriptor.modelId,
  modelVersion: descriptor.modelVersion,
  timeoutMs: 1_000,
  deterministicSeed: "milestone-30-integration",
  minimumConfidence: 0.5,
  maximumInferenceAgeMs: 60_000,
  failClosed: true,
  parameters: Object.freeze({}),
  metadata,
});

function createProvider(clock: () => number): AiModelProvider {
  return Object.freeze({
    providerId: descriptor.providerId,
    displayName: "Deterministic Integration Provider",
    metadata,
    async listModels(): Promise<readonly AiModelDescriptor[]> {
      return Object.freeze([descriptor]);
    },
    async healthCheck() {
      return Object.freeze({
        providerId: descriptor.providerId,
        status: "HEALTHY" as const,
        checkedAt: clock(),
        latencyMs: 0,
        message: "Deterministic provider is healthy.",
        metadata,
      });
    },
    async infer(request: AiInferenceRequest): Promise<AiInferenceResponse> {
      const startedAt = clock();
      const trend = Number(request.featureVector.values.trend_score ?? 0);
      const momentum = Number(request.featureVector.values.momentum_score ?? 0);
      const score = Math.max(-1, Math.min(1, trend * 0.6 + momentum * 0.4));
      const confidence = Math.max(0, Math.min(1, Math.abs(score)));
      const completedAt = clock();

      return Object.freeze({
        requestId: request.requestId,
        correlationId: request.correlationId,
        providerId: descriptor.providerId,
        modelId: descriptor.modelId,
        modelVersion: descriptor.modelVersion,
        status: "SUCCEEDED",
        startedAt,
        completedAt,
        latencyMs: completedAt - startedAt,
        prediction: Object.freeze({
          label: score > 0.1 ? "BUY" : score < -0.1 ? "SELL" : "HOLD",
          direction: score > 0.1 ? "LONG" : score < -0.1 ? "SHORT" : "FLAT",
          score,
          probability: confidence,
          payload: Object.freeze({}),
        }),
        confidence,
        featureContributions: Object.freeze([
          Object.freeze({
            featureId: "trend_score",
            contribution: trend * 0.6,
            rank: 1,
            direction: trend > 0 ? "POSITIVE" : "NEGATIVE",
            metadata,
          }),
          Object.freeze({
            featureId: "momentum_score",
            contribution: momentum * 0.4,
            rank: 2,
            direction: momentum > 0 ? "POSITIVE" : "NEGATIVE",
            metadata,
          }),
        ]),
        warnings: Object.freeze([]),
        metadata,
      });
    },
  });
}

async function runIntegrationTest(): Promise<void> {
  const clock = createClock();
  const validator = createAiStrategyContractValidator();
  const vector = createFeatureVector();

  assert.equal(validator.validateInstrument(instrument).valid, true);
  assert.equal(validator.validateFeatureVector(vector).valid, true);
  assert.equal(validator.validateModelDescriptor(descriptor).valid, true);

  const featureStore = createInMemoryAiFeatureStore({ clock, validator });
  featureStore.registerSchema({
    schemaId: "ai-feature-schema",
    version: "1.0.0",
    createdAt: BASE_TIME - 1_000,
    definitions: featureDefinitions,
    checksum: "schema-checksum-1",
    metadata,
  });
  featureStore.putVector(vector);

  const featureSnapshot = featureStore.createSnapshot({
    instrument,
    timeframe: "1m",
    observedAt: BASE_TIME + 10,
    schemaVersion: "1.0.0",
    maximumFeatureAgeMs: 60_000,
    metadata,
  });

  assert.equal(featureSnapshot.valid, true);
  assert.equal(featureSnapshot.completeness, 1);
  assert.equal(featureSnapshot.vectors.length, 1);
  assert.equal(featureStore.snapshot().vectorCount, 1);

  const featurePipeline = createFeatureEngineeringPipeline({ clock, validator });
  assert.equal(featurePipeline.snapshot().history.length, 0);

  const regimeDetector = createDeterministicMarketRegimeDetector({
    clock,
    validator,
    featureMapping: {
      trendScore: Object.freeze(["trend_score"]),
      momentumScore: Object.freeze(["momentum_score"]),
      volatilityScore: Object.freeze(["volatility_score"]),
      liquidityScore: Object.freeze(["liquidity_score"]),
      meanReversionScore: Object.freeze(["mean_reversion_score"]),
      breakoutScore: Object.freeze(["breakout_score"]),
    },
  });

  const regime = regimeDetector.detect({
    marketContext,
    featureSnapshot,
    detectedAt: BASE_TIME + 20,
    validityMs: 60_000,
    metadata,
  });

  assert.equal(regime.instrument.normalizedSymbol, "BTC/USDT");
  assert.ok(regime.confidence >= 0 && regime.confidence <= 1);
  assert.equal(regimeDetector.queryHistory().length, 1);

  const provider = createProvider(clock);
  const inferenceEngine = createDeterministicAiInferenceEngine({
    clock,
    validator,
    healthCheckBeforeInference: true,
  });
  inferenceEngine.registerProvider(provider);

  const registry = createDeterministicAiModelRegistry({ clock, validator });
  registry.registerProvider(provider);
  registry.registerModel(descriptor, "MANUAL");

  const resolution = registry.resolveModel({
    purpose: "SIGNAL_GENERATION",
    strategyId: "integration-strategy",
    marketType: "SPOT",
    timeframe: "1m",
    requiredFeatures: descriptor.requiredFeatures,
  });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.model?.modelId, descriptor.modelId);

  const inferenceRequest: AiInferenceRequest = Object.freeze({
    requestId: "inference-request-1",
    correlationId: "correlation-1",
    strategyId: "integration-strategy",
    strategyInstanceId: "integration-instance",
    requestedAt: BASE_TIME + 30,
    marketContext,
    featureVector: vector,
    model: runtimeConfiguration,
    purpose: "SIGNAL_GENERATION",
    metadata,
  });

  const inference = await inferenceEngine.infer(inferenceRequest);
  assert.equal(inference.status, "SUCCEEDED");
  assert.equal(inference.prediction?.direction, "LONG");
  assert.ok((inference.confidence ?? 0) >= 0.5);

  const cachedInference = await inferenceEngine.infer({
    ...inferenceRequest,
    requestId: "inference-request-2",
  });
  assert.equal(cachedInference.status, "SUCCEEDED");
  assert.equal(inferenceEngine.queryHistory().length, 1);

  const modelRuntime = createDeterministicAiModelRuntime(
    registry,
    inferenceEngine,
    { clock },
  );
  const instances = await modelRuntime.load({
    model: {
      providerId: descriptor.providerId,
      modelId: descriptor.modelId,
      modelVersion: descriptor.modelVersion,
    },
    runtimeConfiguration,
    minimumInstances: 1,
    warmup: false,
    metadata,
  });
  assert.equal(instances.length, 1);

  const runtimeResponse = await modelRuntime.execute({
    request: {
      ...inferenceRequest,
      requestId: "runtime-inference-request-1",
      correlationId: "runtime-correlation-1",
    },
    maximumAttempts: 1,
    executionTimeoutMs: 1_000,
    metadata,
  });
  assert.equal(runtimeResponse.status, "SUCCEEDED");
  assert.equal(modelRuntime.listInstances().length, 1);

  const ensembleEngine = createDeterministicEnsembleInferenceEngine(
    inferenceEngine,
    { clock, validator },
  );
  const ensembleResult = await ensembleEngine.execute({
    requestId: "ensemble-request-1",
    correlationId: "ensemble-correlation-1",
    strategyId: "integration-strategy",
    strategyInstanceId: "integration-instance",
    requestedAt: BASE_TIME + 40,
    marketContext,
    featureVector: vector,
    configuration: {
      ensembleId: "ensemble-1",
      displayName: "Integration Ensemble",
      version: "1.0.0",
      votingMethod: "WEIGHTED_SCORE",
      members: Object.freeze([
        Object.freeze({
          memberId: "member-1",
          model: runtimeConfiguration,
          weight: 1,
          enabled: true,
          minimumConfidence: 0.5,
          allowedRegimes: Object.freeze([]),
          metadata,
        }),
      ]),
      quorum: 1,
      minimumAgreement: 0,
      minimumConfidence: 0.5,
      rejectOnTie: true,
      metadata,
    },
    regime: regime.primaryRegime,
    metadata,
  });
  assert.equal(ensembleResult.responses.length, 1);
  assert.equal(ensembleEngine.queryHistory().length, 1);

  const calibrationEngine = createConfidenceCalibrationEngine({ clock, validator });
  const calibrationProfile: ConfidenceCalibrationProfile = Object.freeze({
    profileId: "calibration-profile-1",
    strategyId: "integration-strategy",
    model: {
      providerId: descriptor.providerId,
      modelId: descriptor.modelId,
      modelVersion: descriptor.modelVersion,
    },
    method: "PLATT_SCALING",
    trainedAt: BASE_TIME - 5_000,
    validFrom: BASE_TIME - 4_000,
    validUntil: BASE_TIME + 100_000,
    sampleCount: 1_000,
    expectedCalibrationError: 0.02,
    parameters: Object.freeze({ slope: 1, intercept: 0 }),
    metadata,
  });
  calibrationEngine.registerProfile(calibrationProfile);
  const calibrated = calibrationEngine.calibrate({
    requestId: "calibration-request-1",
    rawConfidence: inference.confidence ?? 0,
    model: calibrationProfile.model,
    regime: regime.primaryRegime,
    profile: calibrationProfile,
    timestamp: BASE_TIME + 50,
    metadata,
  });
  assert.ok(calibrated.calibratedConfidence >= 0);
  assert.ok(calibrated.calibratedConfidence <= 1);

  const signalGenerator = createDeterministicAiSignalGenerator(
    inferenceEngine,
    ensembleEngine,
    { clock, validator },
  );
  const signalResult = await signalGenerator.generate({
    requestId: "signal-request-1",
    correlationId: "signal-correlation-1",
    strategyId: "integration-strategy",
    strategyInstanceId: "integration-instance",
    requestedAt: BASE_TIME + 60,
    marketContext,
    featureSnapshot,
    regime,
    modelConfigurations: Object.freeze([runtimeConfiguration]),
    sourceType: "MODEL",
    sourceId: descriptor.modelId,
    signalValidityMs: 60_000,
    minimumConfidence: 0.5,
    minimumAbsoluteScore: 0.1,
    metadata,
  });

  assert.equal(signalResult.status, "GENERATED");
  assert.ok(signalResult.signal !== undefined);
  assert.equal(signalResult.signal?.direction, "LONG");
  assert.equal(signalGenerator.queryHistory().length, 1);

  const metaController = createMetaStrategyController({ clock, validator });
  const metaRequest: MetaStrategyRequest = Object.freeze({
    requestId: "meta-request-1",
    correlationId: "meta-correlation-1",
    requestedAt: BASE_TIME + 70,
    marketContext,
    regime,
    candidates: Object.freeze([
      Object.freeze({
        candidateId: "candidate-1",
        strategyId: "integration-strategy",
        strategyInstanceId: "integration-instance",
        signal: signalResult.signal!,
        performanceScore: 0.8,
        riskScore: 0.2,
        regimeSuitability: 0.9,
        allocationWeight: 1,
        metadata,
      }),
    ]),
    constraints: Object.freeze({
      minimumConfidence: 0.5,
      maximumCandidates: 5,
      maximumLongAllocation: 1,
      maximumShortAllocation: 1,
      maximumGrossAllocation: 1,
      requireRegimeCompatibility: false,
      metadata,
    }),
    metadata,
  });

  const metaDecision = metaController.decide(metaRequest);
  assert.equal(metaDecision.action, "BUY");
  assert.equal(metaDecision.direction, "LONG");
  assert.equal(metaDecision.allocations.length, 1);

  const optimizationEngine = createStrategyOptimizationEngine({ clock, validator });
  const walkForwardEngine = createWalkForwardValidationEngine({ clock, validator });

  assert.equal(optimizationEngine.snapshot().history.length, 0);
  assert.equal(walkForwardEngine.snapshot().history.length, 0);

  const inferenceSnapshot = await inferenceEngine.snapshot();
  assert.equal(inferenceSnapshot.providers.length, 1);
  assert.equal(inferenceSnapshot.models.length, 1);
  assert.equal(registry.snapshot().models.length, 1);
  assert.equal(modelRuntime.snapshot().instances.length, 1);
  assert.equal(calibrationEngine.snapshot().profiles.length, 1);
  assert.equal(metaController.snapshot().history.length, 1);

  assert.ok(Object.isFrozen(featureSnapshot));
  assert.ok(Object.isFrozen(inference));
  assert.ok(Object.isFrozen(regime));
  assert.ok(Object.isFrozen(signalResult));
  assert.ok(Object.isFrozen(metaDecision));

  console.log("All AI strategy engine integration tests passed successfully.");
}

runIntegrationTest().catch((error: unknown) => {
  console.error("AI strategy engine integration test failed.");
  console.error(error);
  process.exitCode = 1;
});