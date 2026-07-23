/**
 * QuantumTradeAI
 * Milestone 37 — AI Market Intelligence & Predictive Analytics
 *
 * File:
 * src/trading/ai-market-intelligence/ai-market-intelligence-orchestrator.ts
 *
 * Production-grade deterministic orchestration for the complete market-
 * intelligence pipeline.
 */

import {
  AiMarketIntelligenceOrchestrator,
  AiMarketIntelligenceOrchestratorDependencies,
  AnomalySeverity,
  ConfidenceScore,
  IntelligenceActionability,
  IntelligencePublicationTopic,
  JsonValue,
  LiquidityPrediction,
  LiquidityState,
  MarketAnomaly,
  MarketDataQuality,
  MarketDirection,
  MarketIntelligenceExplanation,
  MarketIntelligencePipelineStage,
  MarketIntelligencePublication,
  MarketIntelligenceReport,
  MarketIntelligenceReportId,
  MarketIntelligenceRequest,
  MarketIntelligenceResponse,
  MarketIntelligenceRunId,
  MarketIntelligenceRunStatus,
  MarketIntelligenceRunTrace,
  MarketIntelligenceStageError,
  MarketIntelligenceSummary,
  MarketIntelligenceValidationError,
  MarketRiskSignal,
  ModelVersion,
  OrderFlowBias,
  PriceMovementPrediction,
  StageExecutionResult,
  StageTiming,
  TimestampMs,
  UnifiedPredictionConfidence,
  ValidationResult,
  ValidationSeverity,
  VolatilityForecast,
  VolatilityState,
} from "./ai-market-intelligence-contracts";

const EPSILON = 1e-12;
const ROUNDING_DECIMALS = 12;

interface PipelineState {
  readonly request: MarketIntelligenceRequest;
  readonly runId: MarketIntelligenceRunId;
  readonly createdAtMs: TimestampMs;
  readonly startedAtMs: TimestampMs;
  readonly timings: StageTiming[];
  readonly completedStages: MarketIntelligencePipelineStage[];
  readonly warnings: string[];
  readonly errors: string[];
}

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** ROUNDING_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function asError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(
        typeof value === "string"
          ? value
          : "Unknown market-intelligence pipeline error.",
      );
}

function stableJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }

  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};

    for (const key of Object.keys(
      value as Record<string, unknown>,
    ).sort()) {
      const child = (value as Record<string, unknown>)[key];

      if (child !== undefined) {
        output[key] = stableJsonValue(child);
      }
    }

    return output;
  }

  return String(value);
}

function severityRank(severity: AnomalySeverity): number {
  switch (severity) {
    case AnomalySeverity.CRITICAL:
      return 5;
    case AnomalySeverity.HIGH:
      return 4;
    case AnomalySeverity.MODERATE:
      return 3;
    case AnomalySeverity.LOW:
      return 2;
    default:
      return 1;
  }
}

function highestSeverity(
  anomalies: readonly MarketAnomaly[],
): AnomalySeverity {
  return [...anomalies]
    .sort(
      (left, right) =>
        severityRank(right.severity) -
          severityRank(left.severity) ||
        String(left.type).localeCompare(String(right.type)),
    )[0]?.severity ?? AnomalySeverity.INFORMATIONAL;
}

function dominantPricePrediction(
  predictions: readonly PriceMovementPrediction[],
): PriceMovementPrediction | undefined {
  return [...predictions].sort(
    (left, right) =>
      Number(right.confidence) -
        Number(left.confidence) ||
      Number(left.window.durationMs) -
        Number(right.window.durationMs),
  )[0];
}

function dominantVolatilityState(
  forecasts: readonly VolatilityForecast[],
): VolatilityState {
  if (forecasts.length === 0) {
    return VolatilityState.NORMAL;
  }

  return [...forecasts].sort(
    (left, right) =>
      Number(right.confidence) -
        Number(left.confidence) ||
      Number(left.window.durationMs) -
        Number(right.window.durationMs),
  )[0].forecastState;
}

function dominantLiquidityState(
  predictions: readonly LiquidityPrediction[],
): LiquidityState {
  if (predictions.length === 0) {
    return LiquidityState.NORMAL;
  }

  return [...predictions].sort(
    (left, right) =>
      Number(right.confidence) -
        Number(left.confidence) ||
      Number(left.window.durationMs) -
        Number(right.window.durationMs),
  )[0].predictedState;
}

function actionability(
  confidence: UnifiedPredictionConfidence,
  anomalies: readonly MarketAnomaly[],
  prediction: PriceMovementPrediction | undefined,
): IntelligenceActionability {
  const risk = highestSeverity(anomalies);
  const confidenceValue = Number(confidence.confidence);

  if (
    risk === AnomalySeverity.CRITICAL ||
    risk === AnomalySeverity.HIGH
  ) {
    return IntelligenceActionability.RISK_REDUCTION;
  }

  if (confidenceValue < 0.3) {
    return IntelligenceActionability.NOT_ACTIONABLE;
  }

  if (confidenceValue < 0.5) {
    return IntelligenceActionability.MONITOR;
  }

  if (
    prediction === undefined ||
    prediction.direction === MarketDirection.NEUTRAL
  ) {
    return IntelligenceActionability.RESEARCH;
  }

  if (confidenceValue >= 0.75) {
    return IntelligenceActionability.TRADE_CANDIDATE;
  }

  return IntelligenceActionability.STRATEGY_ADJUSTMENT;
}

function buildRiskSignals(
  anomalies: readonly MarketAnomaly[],
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  confidence: UnifiedPredictionConfidence,
): readonly MarketRiskSignal[] {
  const signals: MarketRiskSignal[] = anomalies
    .filter((anomaly) => anomaly.active)
    .map(
      (anomaly): MarketRiskSignal => ({
        name: `market_anomaly_${String(
          anomaly.type,
        ).toLowerCase()}`,
        severity: anomaly.severity,
        probability: anomaly.probability,
        confidence: anomaly.confidence,
        description: anomaly.summary,
        recommendedAction: anomaly.recommendedAction,
      }),
    );

  const elevatedVolatility = volatilityForecasts
    .filter(
      (forecast) =>
        forecast.forecastState === VolatilityState.HIGH ||
        forecast.forecastState ===
          VolatilityState.EXTREMELY_HIGH ||
        forecast.forecastState === VolatilityState.EXPANDING,
    )
    .sort(
      (left, right) =>
        Number(right.confidence) -
        Number(left.confidence),
    )[0];

  if (elevatedVolatility !== undefined) {
    signals.push({
      name: "volatility_elevation",
      severity:
        elevatedVolatility.forecastState ===
        VolatilityState.EXTREMELY_HIGH
          ? AnomalySeverity.HIGH
          : AnomalySeverity.MODERATE,
      probability:
        elevatedVolatility.expansionProbability,
      confidence: elevatedVolatility.confidence,
      description: `Volatility is forecast as ${elevatedVolatility.forecastState}.`,
      recommendedAction:
        IntelligenceActionability.RISK_REDUCTION,
    });
  }

  const stressedLiquidity = liquidityPredictions
    .filter(
      (prediction) =>
        prediction.predictedState === LiquidityState.THIN ||
        prediction.predictedState ===
          LiquidityState.STRESSED ||
        prediction.predictedState ===
          LiquidityState.DISLOCATED,
    )
    .sort(
      (left, right) =>
        Number(right.confidence) -
        Number(left.confidence),
    )[0];

  if (stressedLiquidity !== undefined) {
    signals.push({
      name: "liquidity_deterioration",
      severity:
        stressedLiquidity.predictedState ===
        LiquidityState.DISLOCATED
          ? AnomalySeverity.CRITICAL
          : stressedLiquidity.predictedState ===
              LiquidityState.STRESSED
            ? AnomalySeverity.HIGH
            : AnomalySeverity.MODERATE,
      probability:
        stressedLiquidity.deteriorationProbability,
      confidence: stressedLiquidity.confidence,
      description: `Liquidity is forecast as ${stressedLiquidity.predictedState}.`,
      recommendedAction:
        IntelligenceActionability.RISK_REDUCTION,
    });
  }

  if (Number(confidence.confidence) < 0.4) {
    signals.push({
      name: "low_prediction_confidence",
      severity: AnomalySeverity.LOW,
      probability: clamp(
        1 - Number(confidence.confidence),
        0,
        1,
      ) as MarketRiskSignal["probability"],
      confidence: confidence.confidence,
      description:
        "Unified prediction confidence is below the preferred operating threshold.",
      recommendedAction: IntelligenceActionability.MONITOR,
    });
  }

  return deepFreeze(
    signals.sort(
      (left, right) =>
        severityRank(right.severity) -
          severityRank(left.severity) ||
        left.name.localeCompare(right.name),
    ),
  );
}

function reportWarnings(
  request: MarketIntelligenceRequest,
  anomalies: readonly MarketAnomaly[],
  confidence: UnifiedPredictionConfidence,
): readonly string[] {
  const warnings: string[] = [];

  if (
    request.input.qualityAssessment.quality ===
      MarketDataQuality.DEGRADED ||
    request.input.qualityAssessment.quality ===
      MarketDataQuality.POOR
  ) {
    warnings.push(
      `Input data quality is ${request.input.qualityAssessment.quality}.`,
    );
  }

  if (
    confidence.agreement.conflictingComponents.length > 0
  ) {
    warnings.push(
      `Confidence components disagree: ${confidence.agreement.conflictingComponents.join(
        ", ",
      )}.`,
    );
  }

  const active = anomalies.filter((anomaly) => anomaly.active);

  if (active.length > 0) {
    warnings.push(
      `${active.length} active market anomaly/anomalies detected.`,
    );
  }

  return deepFreeze([...new Set(warnings)].sort());
}

function buildSummary(
  request: MarketIntelligenceRequest,
  regime: MarketIntelligenceReport["regime"],
  volatilityForecasts: readonly VolatilityForecast[],
  liquidityPredictions: readonly LiquidityPrediction[],
  orderFlow: MarketIntelligenceReport["orderFlow"],
  anomalies: readonly MarketAnomaly[],
  pricePredictions: readonly PriceMovementPrediction[],
  confidence: UnifiedPredictionConfidence,
  explanation: MarketIntelligenceExplanation,
): MarketIntelligenceSummary {
  const prediction = dominantPricePrediction(pricePredictions);
  const resolvedActionability = actionability(
    confidence,
    anomalies,
    prediction,
  );

  return deepFreeze({
    direction:
      prediction?.direction ?? MarketDirection.NEUTRAL,
    regime: regime.primaryRegime,
    volatilityState:
      dominantVolatilityState(volatilityForecasts),
    liquidityState:
      dominantLiquidityState(liquidityPredictions),
    orderFlowBias: orderFlow.bias,
    overallConfidence: confidence.confidence,
    actionability: resolvedActionability,
    riskLevel: highestSeverity(anomalies),
    headline:
      explanation.headline ||
      `${String(request.input.market.symbol)} market intelligence`,
  });
}

function publicationTopics(
  report: MarketIntelligenceReport,
): readonly IntelligencePublicationTopic[] {
  const topics =
    report.pricePredictions.length > 0
      ? [
          IntelligencePublicationTopic
            .MARKET_INTELLIGENCE_REPORT,
          IntelligencePublicationTopic.PRICE_PREDICTION,
        ]
      : [
          IntelligencePublicationTopic
            .MARKET_INTELLIGENCE_REPORT,
        ];

  if (report.anomalies.some((anomaly) => anomaly.active)) {
    topics.push(
      IntelligencePublicationTopic.MARKET_ANOMALY,
      IntelligencePublicationTopic.RISK_ALERT,
    );
  }

  if (
    report.volatilityForecasts.some(
      (forecast) =>
        forecast.forecastState === VolatilityState.HIGH ||
        forecast.forecastState ===
          VolatilityState.EXTREMELY_HIGH ||
        forecast.forecastState === VolatilityState.EXPANDING,
    )
  ) {
    topics.push(
      IntelligencePublicationTopic.VOLATILITY_WARNING,
    );
  }

  if (
    report.liquidityPredictions.some(
      (prediction) =>
        prediction.predictedState === LiquidityState.THIN ||
        prediction.predictedState ===
          LiquidityState.STRESSED ||
        prediction.predictedState ===
          LiquidityState.DISLOCATED,
    )
  ) {
    topics.push(
      IntelligencePublicationTopic.LIQUIDITY_WARNING,
    );
  }

  if (report.correlations.breakdowns.length > 0) {
    topics.push(
      IntelligencePublicationTopic.CORRELATION_BREAKDOWN,
    );
  }

  return deepFreeze([...new Set(topics)]);
}

export class DefaultAiMarketIntelligenceOrchestrator
  implements AiMarketIntelligenceOrchestrator
{
  public constructor(
    private readonly dependencies: AiMarketIntelligenceOrchestratorDependencies,
  ) {}

  public async analyze(
    request: MarketIntelligenceRequest,
  ): Promise<MarketIntelligenceResponse> {
    const createdAtMs = this.dependencies.clock.now();
    const runId = this.dependencies.idGenerator.generate(
      "market-intelligence-run",
      `${String(request.requestId)}:${Number(
        request.requestedAtMs,
      )}:${String(request.input.market.symbol)}`,
    ) as MarketIntelligenceRunId;
    const state: PipelineState = {
      request,
      runId,
      createdAtMs,
      startedAtMs: createdAtMs,
      timings: [],
      completedStages: [],
      warnings: [],
      errors: [],
    };

    let validation: ValidationResult<MarketIntelligenceRequest>;

    try {
      validation = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.VALIDATION,
        () => this.dependencies.validator.validateRequest(request),
      );

      if (!validation.valid || validation.value === undefined) {
        const trace = this.buildTrace(
          state,
          MarketIntelligenceRunStatus.REJECTED,
          MarketIntelligencePipelineStage.VALIDATION,
        );

        return deepFreeze({
          requestId: request.requestId,
          runId,
          status: MarketIntelligenceRunStatus.REJECTED,
          trace,
          validation,
        });
      }
    } catch (error) {
      const normalized = asError(error);

      if (
        normalized instanceof MarketIntelligenceValidationError
      ) {
        validation = deepFreeze({
          valid: false,
          issues: normalized.issues,
          errorCount: normalized.issues.filter(
            (issue) =>
              issue.severity === ValidationSeverity.ERROR ||
              issue.severity === ValidationSeverity.FATAL,
          ).length,
          warningCount: normalized.issues.filter(
            (issue) =>
              issue.severity === ValidationSeverity.WARNING,
          ).length,
        });
      } else {
        validation = deepFreeze({
          valid: false,
          issues: [],
          errorCount: 1,
          warningCount: 0,
        });
      }

      const trace = this.buildTrace(
        state,
        MarketIntelligenceRunStatus.FAILED,
        MarketIntelligencePipelineStage.VALIDATION,
      );

      return deepFreeze({
        requestId: request.requestId,
        runId,
        status: MarketIntelligenceRunStatus.FAILED,
        trace,
        validation,
      });
    }

    try {
      const featureVector = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.FEATURE_EXTRACTION,
        () =>
          this.dependencies.featureExtractor.extract(
            request.input,
            request.configuration.featureExtraction,
          ),
      );
      const regime = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.REGIME_INTELLIGENCE,
        () =>
          this.dependencies.regimeEngine.analyze(
            featureVector,
            request.configuration.regimeIntelligence,
          ),
      );
      const volatilityForecasts = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.VOLATILITY_FORECASTING,
        () =>
          this.dependencies.volatilityEngine.forecast(
            featureVector,
            regime,
            request.configuration.volatilityForecasting,
          ),
      );
      const liquidityPredictions = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.LIQUIDITY_PREDICTION,
        () =>
          this.dependencies.liquidityEngine.predict(
            request.input,
            featureVector,
            regime,
            request.configuration.liquidityPrediction,
          ),
      );
      const orderFlow = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.ORDER_FLOW_INTELLIGENCE,
        () =>
          this.dependencies.orderFlowEngine.analyze(
            request.input,
            featureVector,
            request.configuration.orderFlow,
          ),
      );
      const correlations = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.CORRELATION_INTELLIGENCE,
        () =>
          this.dependencies.correlationEngine.analyze(
            request.input,
            request.correlationUniverse ?? [],
            request.configuration.correlationIntelligence,
          ),
      );
      const anomalies = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.ANOMALY_DETECTION,
        () =>
          this.dependencies.anomalyEngine.detect(
            request.input,
            featureVector,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            correlations,
            request.configuration.anomalyDetection,
          ),
      );
      const pricePredictions = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.PRICE_MOVEMENT_PREDICTION,
        () =>
          this.dependencies.pricePredictionEngine.predict(
            request.input,
            featureVector,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            correlations,
            anomalies,
            request.configuration.pricePrediction,
          ),
      );
      const confidence = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.CONFIDENCE_AGGREGATION,
        () =>
          this.dependencies.confidenceEngine.aggregate(
            request.input,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            correlations,
            anomalies,
            pricePredictions,
            request.configuration.confidenceAggregation,
          ),
      );
      const explanation = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.EXPLAINABILITY,
        () =>
          this.dependencies.explainabilityEngine.explain(
            request.input,
            featureVector,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            correlations,
            anomalies,
            pricePredictions,
            confidence,
            request.configuration.explainability,
          ),
      );
      const report = await this.executeStage(
        state,
        MarketIntelligencePipelineStage.REPORT_ASSEMBLY,
        () => {
          const reportId = this.dependencies.idGenerator.generate(
            "market-intelligence-report",
            `${String(request.requestId)}:${String(runId)}`,
          ) as MarketIntelligenceReportId;
          const summary = buildSummary(
            request,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            anomalies,
            pricePredictions,
            confidence,
            explanation,
          );
          const riskSignals = buildRiskSignals(
            anomalies,
            volatilityForecasts,
            liquidityPredictions,
            confidence,
          );
          const warnings = reportWarnings(
            request,
            anomalies,
            confidence,
          );
          const modelVersions: Record<string, ModelVersion> = {
            regime: regime.modelVersion,
            volatility:
              volatilityForecasts[0]?.modelVersion ??
              request.configuration.volatilityForecasting
                .modelVersion,
            liquidity:
              liquidityPredictions[0]?.modelVersion ??
              request.configuration.liquidityPrediction
                .modelVersion,
            orderFlow: orderFlow.modelVersion,
            correlation: correlations.modelVersion,
            anomaly:
              anomalies[0]?.modelVersion ??
              request.configuration.anomalyDetection.modelVersion,
            pricePrediction:
              pricePredictions[0]?.modelVersion ??
              request.configuration.pricePrediction.modelVersion,
            confidence:
              request.configuration.confidenceAggregation
                .calibrationVersion,
            explainability:
              request.configuration.explainability.modelVersion,
          };

          const withoutFingerprint = {
            id: reportId,
            requestId: request.requestId,
            runId,
            schemaVersion: request.configuration.schemaVersion,
            generatedAtMs: request.input.analysisTimeMs,
            market: request.input.market,
            timeframe: request.input.timeframe,
            observationWindow: request.input.observationWindow,
            predictionWindows: request.predictionWindows,
            featureVector,
            regime,
            volatilityForecasts,
            liquidityPredictions,
            orderFlow,
            correlations,
            anomalies,
            pricePredictions,
            confidence,
            explanation,
            riskSignals,
            summary,
            dataQuality: request.input.qualityAssessment,
            warnings,
            modelVersions: deepFreeze(modelVersions),
            metadata: request.metadata,
          };

          const deterministicFingerprint =
            this.dependencies.fingerprintGenerator.fingerprint(
              stableJsonValue(withoutFingerprint),
            );
          const assembled = deepFreeze({
            ...withoutFingerprint,
            deterministicFingerprint,
          }) as MarketIntelligenceReport;
          const reportValidation =
            this.dependencies.validator.validateReport(assembled);

          if (
            !reportValidation.valid ||
            reportValidation.value === undefined
          ) {
            throw new MarketIntelligenceValidationError(
              "Assembled market-intelligence report failed validation.",
              reportValidation.issues,
              {
                requestId: request.requestId,
                runId,
                stage:
                  MarketIntelligencePipelineStage.REPORT_ASSEMBLY,
              },
            );
          }

          return reportValidation.value;
        },
      );

      await this.executeStage(
        state,
        MarketIntelligencePipelineStage.PUBLICATION,
        async () => {
          await this.publishReport(state, report);
          return undefined;
        },
      );

      const status =
        state.warnings.length > 0 ||
        report.warnings.length > 0
          ? MarketIntelligenceRunStatus.COMPLETED_WITH_WARNINGS
          : MarketIntelligenceRunStatus.COMPLETED;
      const trace = this.buildTrace(state, status);

      return deepFreeze({
        requestId: request.requestId,
        runId,
        status,
        report,
        trace,
        validation,
      });
    } catch (error) {
      const normalized = asError(error);
      const failedStage =
        normalized instanceof MarketIntelligenceStageError
          ? normalized.stage
          : undefined;
      const trace = this.buildTrace(
        state,
        MarketIntelligenceRunStatus.FAILED,
        failedStage,
      );

      return deepFreeze({
        requestId: request.requestId,
        runId,
        status: MarketIntelligenceRunStatus.FAILED,
        trace,
        validation,
      });
    }
  }

  private async executeStage<TValue>(
    state: PipelineState,
    stage: MarketIntelligencePipelineStage,
    operation: () => TValue | Promise<TValue>,
  ): Promise<TValue> {
    const startedAtMs = this.dependencies.clock.now();
    await this.dependencies.stageObserver?.onStageStarted?.(
      state.runId,
      stage,
      startedAtMs,
    );

    try {
      const output = await operation();
      const completedAtMs = this.dependencies.clock.now();
      const timing: StageTiming = deepFreeze({
        stage,
        startedAtMs,
        completedAtMs,
        durationMs: Math.max(
          0,
          Number(completedAtMs) - Number(startedAtMs),
        ) as StageTiming["durationMs"],
      });
      const fingerprint =
        output === undefined
          ? undefined
          : this.dependencies.fingerprintGenerator.fingerprint(
              stableJsonValue(output),
            );
      const result: StageExecutionResult<TValue> = deepFreeze({
        stage,
        success: true,
        output,
        warnings: [],
        errors: [],
        timing,
        deterministicFingerprint: fingerprint,
      });

      state.timings.push(timing);
      state.completedStages.push(stage);
      await this.dependencies.stageObserver?.onStageCompleted?.(
        state.runId,
        result,
      );

      this.enforcePipelineDuration(state);
      return output;
    } catch (error) {
      const normalized = asError(error);
      const failedAtMs = this.dependencies.clock.now();
      state.errors.push(`${stage}: ${normalized.message}`);
      await this.dependencies.stageObserver?.onStageFailed?.(
        state.runId,
        stage,
        normalized,
        failedAtMs,
      );

      throw new MarketIntelligenceStageError(
        stage,
        `Market-intelligence stage '${stage}' failed: ${normalized.message}`,
        normalized,
        {
          requestId: state.request.requestId,
          runId: state.runId,
          stage,
        },
      );
    }
  }

  private enforcePipelineDuration(state: PipelineState): void {
    const elapsed =
      Number(this.dependencies.clock.now()) -
      Number(state.startedAtMs);
    const maximum = Number(
      state.request.configuration.maximumPipelineDurationMs,
    );

    if (maximum > 0 && elapsed > maximum) {
      throw new Error(
        `Maximum pipeline duration exceeded: ${elapsed}ms > ${maximum}ms.`,
      );
    }
  }

  private async publishReport(
    state: PipelineState,
    report: MarketIntelligenceReport,
  ): Promise<void> {
    const configuration = state.request.configuration.publication;

    if (
      !configuration.enabled ||
      this.dependencies.publisher === undefined
    ) {
      return;
    }

    if (
      Number(report.confidence.confidence) <
      Number(configuration.minimumConfidence)
    ) {
      state.warnings.push(
        "Publication skipped because report confidence is below the configured minimum.",
      );
      return;
    }

    if (
      configuration.publishOnlyActionableReports &&
      report.summary.actionability ===
        IntelligenceActionability.NOT_ACTIONABLE
    ) {
      return;
    }

    const configuredTopics = new Set(configuration.topics);
    const topics = publicationTopics(report).filter((topic) =>
      configuredTopics.has(topic),
    );

    for (const topic of topics) {
      if (
        !configuration.publishWarnings &&
        topic !==
          IntelligencePublicationTopic
            .MARKET_INTELLIGENCE_REPORT &&
        topic !== IntelligencePublicationTopic.PRICE_PREDICTION
      ) {
        continue;
      }

      const publishedAtMs = this.dependencies.clock.now();
      const payload = stableJsonValue({
        topic,
        report,
      });
      const deterministicFingerprint =
        this.dependencies.fingerprintGenerator.fingerprint(payload);
      const publication: MarketIntelligencePublication =
        deepFreeze({
          publicationId:
            this.dependencies.idGenerator.generate(
              "market-intelligence-publication",
              `${String(report.id)}:${String(topic)}`,
            ),
          topic,
          publishedAtMs,
          reportId: report.id,
          runId: report.runId,
          market: report.market,
          confidence: report.confidence.confidence,
          actionability: report.summary.actionability,
          payload,
          deterministicFingerprint,
        });

      await this.dependencies.publisher.publish(publication);
    }
  }

  private buildTrace(
    state: PipelineState,
    status: MarketIntelligenceRunStatus,
    failedStage?: MarketIntelligencePipelineStage,
  ): MarketIntelligenceRunTrace {
    const completedAtMs = this.dependencies.clock.now();
    const fingerprint =
      this.dependencies.fingerprintGenerator.fingerprint(
        stableJsonValue({
          runId: state.runId,
          requestId: state.request.requestId,
          status,
          createdAtMs: state.createdAtMs,
          startedAtMs: state.startedAtMs,
          completedAtMs,
          stageTimings: state.timings,
          completedStages: state.completedStages,
          failedStage,
          warnings: state.warnings,
          errors: state.errors,
        }),
      );

    return deepFreeze({
      runId: state.runId,
      requestId: state.request.requestId,
      status,
      createdAtMs: state.createdAtMs,
      startedAtMs: state.startedAtMs,
      completedAtMs,
      stageTimings: deepFreeze([...state.timings]),
      completedStages: deepFreeze([
        ...state.completedStages,
      ]),
      failedStage,
      warnings: deepFreeze([...new Set(state.warnings)].sort()),
      errors: deepFreeze([...new Set(state.errors)].sort()),
      deterministicFingerprint: fingerprint,
    });
  }
}

export function createAiMarketIntelligenceOrchestrator(
  dependencies: AiMarketIntelligenceOrchestratorDependencies,
): AiMarketIntelligenceOrchestrator {
  return new DefaultAiMarketIntelligenceOrchestrator(
    dependencies,
  );
}