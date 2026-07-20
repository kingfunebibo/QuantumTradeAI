/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 12: Autonomous performance monitor.
 *
 * Responsibilities:
 * - monitor portfolio, strategy runtime, trading, risk, and execution health
 * - evaluate deterministic warning and critical thresholds
 * - deduplicate, acknowledge, retain, and query performance alerts
 * - emit immutable monitoring snapshots
 * - expose bounded snapshot and alert history
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousPerformanceAlert,
  type AutonomousPerformanceAlertSeverity,
  type AutonomousPerformanceMonitoringSnapshot,
  type AutonomousPortfolioSnapshot,
  type AutonomousStrategyPerformanceSnapshot,
  type AutonomousStrategyRuntimeState,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousStrategyOperationalMetrics {
  readonly strategyId: string;
  readonly executionCount: number;
  readonly successfulExecutionCount: number;
  readonly rejectedExecutionCount: number;
  readonly failedExecutionCount: number;
  readonly averageExecutionLatencyMs: number;
  readonly maximumExecutionLatencyMs: number;
  readonly averageSlippageBps: number;
  readonly maximumSlippageBps: number;
  readonly signalCount: number;
  readonly acceptedSignalCount: number;
  readonly staleSignalCount: number;
  readonly heartbeatAgeMs?: number;
  readonly providerErrorRate: number;
  readonly exchangeErrorRate: number;
  readonly modelDriftScore: number;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPerformanceMonitoringRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly portfolio: AutonomousPortfolioSnapshot;
  readonly runtimeStates: readonly AutonomousStrategyRuntimeState[];
  readonly strategyPerformance: readonly AutonomousStrategyPerformanceSnapshot[];
  readonly operationalMetrics?: readonly AutonomousStrategyOperationalMetrics[];
  readonly requestedAt: AutonomousTradingTimestamp;
  readonly metadata: AutonomousTradingMetadata;
}

export interface AutonomousPerformanceThresholds {
  readonly warningDrawdown: number;
  readonly criticalDrawdown: number;
  readonly warningDailyLoss: number;
  readonly criticalDailyLoss: number;
  readonly warningConsecutiveFailures: number;
  readonly criticalConsecutiveFailures: number;
  readonly warningConsecutiveLosses: number;
  readonly criticalConsecutiveLosses: number;
  readonly warningExecutionFailureRate: number;
  readonly criticalExecutionFailureRate: number;
  readonly warningExecutionLatencyMs: number;
  readonly criticalExecutionLatencyMs: number;
  readonly warningSlippageBps: number;
  readonly criticalSlippageBps: number;
  readonly warningHeartbeatAgeMs: number;
  readonly criticalHeartbeatAgeMs: number;
  readonly warningProviderErrorRate: number;
  readonly criticalProviderErrorRate: number;
  readonly warningExchangeErrorRate: number;
  readonly criticalExchangeErrorRate: number;
  readonly warningModelDriftScore: number;
  readonly criticalModelDriftScore: number;
  readonly warningRecentPerformanceScore: number;
  readonly criticalRecentPerformanceScore: number;
  readonly warningStabilityScore: number;
  readonly criticalStabilityScore: number;
  readonly minimumTradeCountForPerformanceAlerts: number;
}

export interface AutonomousPerformanceMonitorOptions {
  readonly thresholds?: Partial<AutonomousPerformanceThresholds>;
  readonly maximumRequestAgeMs?: number;
  readonly alertDeduplicationWindowMs?: number;
  readonly maximumRetainedAlerts?: number;
  readonly maximumRetainedSnapshots?: number;
  readonly includeAcknowledgedAlertsInSnapshots?: boolean;
  readonly emitRecoveryAlerts?: boolean;
}

interface ResolvedAutonomousPerformanceMonitorOptions {
  readonly thresholds: AutonomousPerformanceThresholds;
  readonly maximumRequestAgeMs: number;
  readonly alertDeduplicationWindowMs: number;
  readonly maximumRetainedAlerts: number;
  readonly maximumRetainedSnapshots: number;
  readonly includeAcknowledgedAlertsInSnapshots: boolean;
  readonly emitRecoveryAlerts: boolean;
}

interface AlertCandidate {
  readonly strategyId: string;
  readonly severity: AutonomousPerformanceAlertSeverity;
  readonly code: string;
  readonly message: string;
  readonly observedValue?: number;
  readonly thresholdValue?: number;
  readonly metadata: AutonomousTradingMetadata;
}

const DEFAULT_THRESHOLDS: Readonly<AutonomousPerformanceThresholds> =
  Object.freeze({
    warningDrawdown: 0.10,
    criticalDrawdown: 0.20,
    warningDailyLoss: 1_000,
    criticalDailyLoss: 5_000,
    warningConsecutiveFailures: 3,
    criticalConsecutiveFailures: 5,
    warningConsecutiveLosses: 4,
    criticalConsecutiveLosses: 8,
    warningExecutionFailureRate: 0.05,
    criticalExecutionFailureRate: 0.15,
    warningExecutionLatencyMs: 1_000,
    criticalExecutionLatencyMs: 5_000,
    warningSlippageBps: 25,
    criticalSlippageBps: 100,
    warningHeartbeatAgeMs: 30_000,
    criticalHeartbeatAgeMs: 120_000,
    warningProviderErrorRate: 0.05,
    criticalProviderErrorRate: 0.20,
    warningExchangeErrorRate: 0.05,
    criticalExchangeErrorRate: 0.20,
    warningModelDriftScore: 0.40,
    criticalModelDriftScore: 0.70,
    warningRecentPerformanceScore: 0.40,
    criticalRecentPerformanceScore: 0.20,
    warningStabilityScore: 0.40,
    criticalStabilityScore: 0.20,
    minimumTradeCountForPerformanceAlerts: 10,
  });

const DEFAULT_OPTIONS = Object.freeze({
  maximumRequestAgeMs: 60_000,
  alertDeduplicationWindowMs: 300_000,
  maximumRetainedAlerts: 10_000,
  maximumRetainedSnapshots: 1_000,
  includeAcknowledgedAlertsInSnapshots: false,
  emitRecoveryAlerts: true,
});

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const copy: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(copy);
}

function freezeAlert(alert: AutonomousPerformanceAlert): AutonomousPerformanceAlert {
  return Object.freeze({
    ...alert,
    metadata: freezeMetadata(alert.metadata),
  });
}

function freezePerformance(
  performance: AutonomousStrategyPerformanceSnapshot,
): AutonomousStrategyPerformanceSnapshot {
  return Object.freeze({
    ...performance,
    metadata: freezeMetadata(performance.metadata),
  });
}

function freezeSnapshot(
  snapshot: AutonomousPerformanceMonitoringSnapshot,
): AutonomousPerformanceMonitoringSnapshot {
  return Object.freeze({
    ...snapshot,
    portfolio: Object.freeze({
      ...snapshot.portfolio,
      metadata: freezeMetadata(snapshot.portfolio.metadata),
    }),
    strategyPerformance: Object.freeze(
      snapshot.strategyPerformance.map(freezePerformance),
    ),
    alerts: Object.freeze(snapshot.alerts.map(freezeAlert)),
    metadata: freezeMetadata(snapshot.metadata),
  });
}

function rate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function uniqueByStrategy<T extends { readonly strategyId: string }>(
  values: readonly T[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.strategyId)) {
      throw new Error(`${label} contains duplicate strategyId '${value.strategyId}'.`);
    }
    seen.add(value.strategyId);
  }
}

export class AutonomousPerformanceMonitor {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedAutonomousPerformanceMonitorOptions;
  private readonly alerts: AutonomousPerformanceAlert[] = [];
  private readonly snapshots: AutonomousPerformanceMonitoringSnapshot[] = [];
  private readonly latestAlertByFingerprint = new Map<string, AutonomousPerformanceAlert>();
  private alertSequence = 0;
  private snapshotSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousPerformanceMonitorOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const thresholds: AutonomousPerformanceThresholds = Object.freeze({
      ...DEFAULT_THRESHOLDS,
      ...options.thresholds,
    });

    this.validateThresholds(thresholds);

    const resolved: ResolvedAutonomousPerformanceMonitorOptions = {
      thresholds,
      maximumRequestAgeMs:
        options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs,
      alertDeduplicationWindowMs:
        options.alertDeduplicationWindowMs ??
        DEFAULT_OPTIONS.alertDeduplicationWindowMs,
      maximumRetainedAlerts:
        options.maximumRetainedAlerts ?? DEFAULT_OPTIONS.maximumRetainedAlerts,
      maximumRetainedSnapshots:
        options.maximumRetainedSnapshots ??
        DEFAULT_OPTIONS.maximumRetainedSnapshots,
      includeAcknowledgedAlertsInSnapshots:
        options.includeAcknowledgedAlertsInSnapshots ??
        DEFAULT_OPTIONS.includeAcknowledgedAlertsInSnapshots,
      emitRecoveryAlerts:
        options.emitRecoveryAlerts ?? DEFAULT_OPTIONS.emitRecoveryAlerts,
    };

    assertNonNegativeFinite(resolved.maximumRequestAgeMs, "maximumRequestAgeMs");
    assertNonNegativeFinite(
      resolved.alertDeduplicationWindowMs,
      "alertDeduplicationWindowMs",
    );
    assertNonNegativeInteger(resolved.maximumRetainedAlerts, "maximumRetainedAlerts");
    assertNonNegativeInteger(
      resolved.maximumRetainedSnapshots,
      "maximumRetainedSnapshots",
    );

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public capture(
    request: AutonomousPerformanceMonitoringRequest,
  ): AutonomousPerformanceMonitoringSnapshot {
    const capturedAt = this.clock.now();
    assertNonNegativeFinite(capturedAt, "clock.now()");
    this.validateRequest(request, capturedAt);

    const runtimeByStrategy = new Map(
      request.runtimeStates.map((state) => [state.strategyId, state] as const),
    );
    const performanceByStrategy = new Map(
      request.strategyPerformance.map(
        (performance) => [performance.strategyId, performance] as const,
      ),
    );
    const metricsByStrategy = new Map(
      (request.operationalMetrics ?? []).map(
        (metrics) => [metrics.strategyId, metrics] as const,
      ),
    );

    const candidates: AlertCandidate[] = [];
    for (const state of request.runtimeStates) {
      candidates.push(...this.evaluateRuntimeState(state, capturedAt));

      const performance = performanceByStrategy.get(state.strategyId);
      if (performance !== undefined) {
        candidates.push(...this.evaluatePerformance(performance));
      }

      const metrics = metricsByStrategy.get(state.strategyId);
      if (metrics !== undefined) {
        candidates.push(...this.evaluateOperationalMetrics(metrics));
      }
    }

    candidates.push(...this.evaluatePortfolio(request.portfolio));

    const activeFingerprints = new Set(
      candidates.map((candidate) => this.fingerprint(candidate.strategyId, candidate.code)),
    );

    const generatedAlerts = candidates
      .map((candidate) => this.recordCandidate(candidate, capturedAt))
      .filter((alert): alert is AutonomousPerformanceAlert => alert !== undefined);

    if (this.options.emitRecoveryAlerts) {
      generatedAlerts.push(
        ...this.createRecoveryAlerts(activeFingerprints, capturedAt),
      );
    }

    const snapshotAlerts = this.alerts.filter(
      (alert) =>
        this.options.includeAcknowledgedAlertsInSnapshots ||
        !alert.acknowledged,
    );

    const snapshot = freezeSnapshot({
      snapshotId: this.idFactory.create(
        "autonomous-performance-snapshot",
        capturedAt,
        this.snapshotSequence++,
      ),
      capturedAt,
      portfolio: request.portfolio,
      strategyPerformance: Object.freeze([...request.strategyPerformance]),
      alerts: Object.freeze([...snapshotAlerts]),
      healthyStrategyCount: request.runtimeStates.filter(
        (state) => state.healthStatus === "HEALTHY",
      ).length,
      degradedStrategyCount: request.runtimeStates.filter(
        (state) => state.healthStatus === "DEGRADED",
      ).length,
      unhealthyStrategyCount: request.runtimeStates.filter(
        (state) => state.healthStatus === "UNHEALTHY",
      ).length,
      runningStrategyCount: request.runtimeStates.filter(
        (state) => state.lifecycleState === "RUNNING",
      ).length,
      pausedStrategyCount: request.runtimeStates.filter(
        (state) => state.lifecycleState === "PAUSED",
      ).length,
      failedStrategyCount: request.runtimeStates.filter(
        (state) => state.lifecycleState === "FAILED",
      ).length,
      metadata: freezeMetadata({
        requestId: request.requestId,
        correlationId: request.correlationId,
        runtimeStateCount: request.runtimeStates.length,
        performanceCount: request.strategyPerformance.length,
        operationalMetricCount: request.operationalMetrics?.length ?? 0,
        generatedAlertCount: generatedAlerts.length,
        activeAlertCount: snapshotAlerts.filter((alert) => !alert.acknowledged).length,
        ...request.metadata,
      }),
    });

    const validation =
      this.validator.validatePerformanceMonitoringSnapshot(snapshot);
    this.validator.assertValid(
      validation,
      "Generated autonomous performance monitoring snapshot is invalid.",
    );

    this.snapshots.push(snapshot);
    this.trimHistory();
    return snapshot;
  }

  public acknowledgeAlert(
    alertId: string,
    acknowledgedAt = this.clock.now(),
  ): AutonomousPerformanceAlert {
    assertNonEmptyString(alertId, "alertId");
    assertNonNegativeFinite(acknowledgedAt, "acknowledgedAt");

    const index = this.alerts.findIndex((alert) => alert.alertId === alertId);
    if (index < 0) {
      throw new Error(`Performance alert '${alertId}' was not found.`);
    }

    const current = this.alerts[index];
    if (current.acknowledged) {
      return current;
    }

    const updated = freezeAlert({
      ...current,
      acknowledged: true,
      metadata: freezeMetadata({
        ...current.metadata,
        acknowledgedAt,
      }),
    });

    this.alerts[index] = updated;
    this.latestAlertByFingerprint.set(
      this.fingerprint(updated.strategyId, updated.code),
      updated,
    );
    return updated;
  }

  public acknowledgeStrategyAlerts(
    strategyId: string,
    acknowledgedAt = this.clock.now(),
  ): readonly AutonomousPerformanceAlert[] {
    assertNonEmptyString(strategyId, "strategyId");
    return Object.freeze(
      this.alerts
        .filter(
          (alert) =>
            alert.strategyId === strategyId && !alert.acknowledged,
        )
        .map((alert) => this.acknowledgeAlert(alert.alertId, acknowledgedAt)),
    );
  }

  public getAlerts(
    strategyId?: string,
    includeAcknowledged = true,
  ): readonly AutonomousPerformanceAlert[] {
    return Object.freeze(
      this.alerts.filter(
        (alert) =>
          (strategyId === undefined || alert.strategyId === strategyId) &&
          (includeAcknowledged || !alert.acknowledged),
      ),
    );
  }

  public getSnapshots(): readonly AutonomousPerformanceMonitoringSnapshot[] {
    return Object.freeze([...this.snapshots]);
  }

  public getLatestSnapshot():
    | AutonomousPerformanceMonitoringSnapshot
    | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  public clearHistory(): void {
    this.alerts.length = 0;
    this.snapshots.length = 0;
    this.latestAlertByFingerprint.clear();
  }

  private evaluateRuntimeState(
    state: AutonomousStrategyRuntimeState,
    capturedAt: number,
  ): readonly AlertCandidate[] {
    const candidates: AlertCandidate[] = [];
    const t = this.options.thresholds;

    if (state.healthStatus === "UNHEALTHY") {
      candidates.push(this.candidate(
        state.strategyId,
        "CRITICAL",
        "STRATEGY_UNHEALTHY",
        "Strategy health status is UNHEALTHY.",
      ));
    } else if (state.healthStatus === "DEGRADED") {
      candidates.push(this.candidate(
        state.strategyId,
        "WARNING",
        "STRATEGY_DEGRADED",
        "Strategy health status is DEGRADED.",
      ));
    }

    if (state.lifecycleState === "FAILED") {
      candidates.push(this.candidate(
        state.strategyId,
        "CRITICAL",
        "STRATEGY_FAILED",
        "Strategy lifecycle state is FAILED.",
      ));
    }

    this.pushHighThreshold(
      candidates,
      state.strategyId,
      "CONSECUTIVE_FAILURES",
      state.consecutiveFailureCount,
      t.warningConsecutiveFailures,
      t.criticalConsecutiveFailures,
      "Consecutive strategy failures",
    );
    this.pushHighThreshold(
      candidates,
      state.strategyId,
      "CONSECUTIVE_LOSSES",
      state.consecutiveLossCount,
      t.warningConsecutiveLosses,
      t.criticalConsecutiveLosses,
      "Consecutive strategy losses",
    );
    this.pushHighThreshold(
      candidates,
      state.strategyId,
      "STRATEGY_DRAWDOWN",
      state.drawdown,
      t.warningDrawdown,
      t.criticalDrawdown,
      "Strategy drawdown",
    );

    if (state.lastHeartbeatAt !== undefined) {
      const heartbeatAge = Math.max(0, capturedAt - state.lastHeartbeatAt);
      this.pushHighThreshold(
        candidates,
        state.strategyId,
        "HEARTBEAT_AGE",
        heartbeatAge,
        t.warningHeartbeatAgeMs,
        t.criticalHeartbeatAgeMs,
        "Strategy heartbeat age",
      );
    }

    return Object.freeze(candidates);
  }

  private evaluatePerformance(
    performance: AutonomousStrategyPerformanceSnapshot,
  ): readonly AlertCandidate[] {
    const candidates: AlertCandidate[] = [];
    const t = this.options.thresholds;

    if (performance.tradeCount < t.minimumTradeCountForPerformanceAlerts) {
      return candidates;
    }

    this.pushLowThreshold(
      candidates,
      performance.strategyId,
      "RECENT_PERFORMANCE_SCORE",
      performance.recentPerformanceScore,
      t.warningRecentPerformanceScore,
      t.criticalRecentPerformanceScore,
      "Recent performance score",
    );
    this.pushLowThreshold(
      candidates,
      performance.strategyId,
      "STABILITY_SCORE",
      performance.stabilityScore,
      t.warningStabilityScore,
      t.criticalStabilityScore,
      "Strategy stability score",
    );
    this.pushHighThreshold(
      candidates,
      performance.strategyId,
      "MAXIMUM_DRAWDOWN",
      performance.maximumDrawdown,
      t.warningDrawdown,
      t.criticalDrawdown,
      "Maximum strategy drawdown",
    );

    if (performance.profitFactor < 1) {
      candidates.push(this.candidate(
        performance.strategyId,
        performance.profitFactor <= 0.75 ? "CRITICAL" : "WARNING",
        "LOW_PROFIT_FACTOR",
        `Profit factor is ${performance.profitFactor.toFixed(6)}.`,
        performance.profitFactor,
        1,
      ));
    }

    return Object.freeze(candidates);
  }

  private evaluateOperationalMetrics(
    metrics: AutonomousStrategyOperationalMetrics,
  ): readonly AlertCandidate[] {
    const candidates: AlertCandidate[] = [];
    const t = this.options.thresholds;
    const failureRate = rate(
      metrics.failedExecutionCount,
      metrics.executionCount,
    );

    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "EXECUTION_FAILURE_RATE",
      failureRate,
      t.warningExecutionFailureRate,
      t.criticalExecutionFailureRate,
      "Execution failure rate",
    );
    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "EXECUTION_LATENCY",
      metrics.averageExecutionLatencyMs,
      t.warningExecutionLatencyMs,
      t.criticalExecutionLatencyMs,
      "Average execution latency",
    );
    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "EXECUTION_SLIPPAGE",
      metrics.averageSlippageBps,
      t.warningSlippageBps,
      t.criticalSlippageBps,
      "Average execution slippage",
    );
    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "PROVIDER_ERROR_RATE",
      metrics.providerErrorRate,
      t.warningProviderErrorRate,
      t.criticalProviderErrorRate,
      "Provider error rate",
    );
    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "EXCHANGE_ERROR_RATE",
      metrics.exchangeErrorRate,
      t.warningExchangeErrorRate,
      t.criticalExchangeErrorRate,
      "Exchange error rate",
    );
    this.pushHighThreshold(
      candidates,
      metrics.strategyId,
      "MODEL_DRIFT",
      metrics.modelDriftScore,
      t.warningModelDriftScore,
      t.criticalModelDriftScore,
      "Model drift score",
    );

    if (metrics.heartbeatAgeMs !== undefined) {
      this.pushHighThreshold(
        candidates,
        metrics.strategyId,
        "HEARTBEAT_AGE",
        metrics.heartbeatAgeMs,
        t.warningHeartbeatAgeMs,
        t.criticalHeartbeatAgeMs,
        "Strategy heartbeat age",
      );
    }

    return Object.freeze(candidates);
  }

  private evaluatePortfolio(
    portfolio: AutonomousPortfolioSnapshot,
  ): readonly AlertCandidate[] {
    const candidates: AlertCandidate[] = [];
    const t = this.options.thresholds;

    this.pushHighThreshold(
      candidates,
      "PORTFOLIO",
      "PORTFOLIO_DRAWDOWN",
      portfolio.drawdown,
      t.warningDrawdown,
      t.criticalDrawdown,
      "Portfolio drawdown",
    );

    const realizedLoss = Math.max(0, -portfolio.realizedPnl);
    this.pushHighThreshold(
      candidates,
      "PORTFOLIO",
      "PORTFOLIO_REALIZED_LOSS",
      realizedLoss,
      t.warningDailyLoss,
      t.criticalDailyLoss,
      "Portfolio realized loss",
    );

    return Object.freeze(candidates);
  }

  private pushHighThreshold(
    output: AlertCandidate[],
    strategyId: string,
    code: string,
    value: number,
    warning: number,
    critical: number,
    label: string,
  ): void {
    if (value >= critical) {
      output.push(this.candidate(
        strategyId,
        "CRITICAL",
        code,
        `${label} ${value.toFixed(6)} reached critical threshold ${critical.toFixed(6)}.`,
        value,
        critical,
      ));
    } else if (value >= warning) {
      output.push(this.candidate(
        strategyId,
        "WARNING",
        code,
        `${label} ${value.toFixed(6)} reached warning threshold ${warning.toFixed(6)}.`,
        value,
        warning,
      ));
    }
  }

  private pushLowThreshold(
    output: AlertCandidate[],
    strategyId: string,
    code: string,
    value: number,
    warning: number,
    critical: number,
    label: string,
  ): void {
    if (value <= critical) {
      output.push(this.candidate(
        strategyId,
        "CRITICAL",
        code,
        `${label} ${value.toFixed(6)} fell to critical threshold ${critical.toFixed(6)}.`,
        value,
        critical,
      ));
    } else if (value <= warning) {
      output.push(this.candidate(
        strategyId,
        "WARNING",
        code,
        `${label} ${value.toFixed(6)} fell to warning threshold ${warning.toFixed(6)}.`,
        value,
        warning,
      ));
    }
  }

  private candidate(
    strategyId: string,
    severity: AutonomousPerformanceAlertSeverity,
    code: string,
    message: string,
    observedValue?: number,
    thresholdValue?: number,
  ): AlertCandidate {
    return Object.freeze({
      strategyId,
      severity,
      code,
      message,
      observedValue,
      thresholdValue,
      metadata: EMPTY_AUTONOMOUS_TRADING_METADATA,
    });
  }

  private recordCandidate(
    candidate: AlertCandidate,
    createdAt: number,
  ): AutonomousPerformanceAlert | undefined {
    const fingerprint = this.fingerprint(candidate.strategyId, candidate.code);
    const previous = this.latestAlertByFingerprint.get(fingerprint);

    if (
      previous !== undefined &&
      !previous.acknowledged &&
      createdAt - previous.createdAt <=
        this.options.alertDeduplicationWindowMs &&
      previous.severity === candidate.severity
    ) {
      return undefined;
    }

    const alert = freezeAlert({
      alertId: this.idFactory.create(
        "autonomous-performance-alert",
        createdAt,
        this.alertSequence++,
      ),
      strategyId: candidate.strategyId,
      severity: candidate.severity,
      code: candidate.code,
      message: candidate.message,
      observedValue: candidate.observedValue,
      thresholdValue: candidate.thresholdValue,
      createdAt,
      acknowledged: false,
      metadata: freezeMetadata(candidate.metadata),
    });

    this.alerts.push(alert);
    this.latestAlertByFingerprint.set(fingerprint, alert);
    return alert;
  }

  private createRecoveryAlerts(
    activeFingerprints: ReadonlySet<string>,
    createdAt: number,
  ): AutonomousPerformanceAlert[] {
    const recoveryAlerts: AutonomousPerformanceAlert[] = [];

    for (const [fingerprint, previous] of this.latestAlertByFingerprint) {
      if (
        previous.acknowledged ||
        previous.code.endsWith("_RECOVERED") ||
        activeFingerprints.has(fingerprint)
      ) {
        continue;
      }

      const recoveredCode = `${previous.code}_RECOVERED`;
      const recoveredFingerprint = this.fingerprint(
        previous.strategyId,
        recoveredCode,
      );
      const existingRecovery =
        this.latestAlertByFingerprint.get(recoveredFingerprint);

      if (
        existingRecovery !== undefined &&
        createdAt - existingRecovery.createdAt <=
          this.options.alertDeduplicationWindowMs
      ) {
        continue;
      }

      const recovery = this.recordCandidate(
        this.candidate(
          previous.strategyId,
          "INFO",
          recoveredCode,
          `Condition ${previous.code} is no longer active.`,
          previous.observedValue,
          previous.thresholdValue,
        ),
        createdAt,
      );

      if (recovery !== undefined) {
        recoveryAlerts.push(recovery);
      }
    }

    return recoveryAlerts;
  }

  private fingerprint(strategyId: string, code: string): string {
    return `${strategyId}|${code}`;
  }

  private validateRequest(
    request: AutonomousPerformanceMonitoringRequest,
    capturedAt: number,
  ): void {
    if (!request || typeof request !== "object") {
      throw new TypeError("request must be an object.");
    }

    assertNonEmptyString(request.requestId, "request.requestId");
    assertNonEmptyString(request.correlationId, "request.correlationId");
    assertNonNegativeFinite(request.requestedAt, "request.requestedAt");

    const age = capturedAt - request.requestedAt;
    if (age < 0) {
      throw new Error("Performance monitoring request cannot be from the future.");
    }
    if (age > this.options.maximumRequestAgeMs) {
      throw new Error(`Performance monitoring request is stale by ${age}ms.`);
    }

    uniqueByStrategy(request.runtimeStates, "request.runtimeStates");
    uniqueByStrategy(
      request.strategyPerformance,
      "request.strategyPerformance",
    );
    uniqueByStrategy(
      request.operationalMetrics ?? [],
      "request.operationalMetrics",
    );

    const runtimeIds = new Set(
      request.runtimeStates.map((state) => state.strategyId),
    );
    for (const performance of request.strategyPerformance) {
      if (!runtimeIds.has(performance.strategyId)) {
        throw new Error(
          `Performance for unknown strategy '${performance.strategyId}' was supplied.`,
        );
      }
    }

    for (const metrics of request.operationalMetrics ?? []) {
      if (!runtimeIds.has(metrics.strategyId)) {
        throw new Error(
          `Operational metrics for unknown strategy '${metrics.strategyId}' were supplied.`,
        );
      }
      this.validateOperationalMetrics(metrics);
    }
  }

  private validateOperationalMetrics(
    metrics: AutonomousStrategyOperationalMetrics,
  ): void {
    assertNonEmptyString(metrics.strategyId, "metrics.strategyId");

    const integerFields: readonly [string, number][] = [
      ["executionCount", metrics.executionCount],
      ["successfulExecutionCount", metrics.successfulExecutionCount],
      ["rejectedExecutionCount", metrics.rejectedExecutionCount],
      ["failedExecutionCount", metrics.failedExecutionCount],
      ["signalCount", metrics.signalCount],
      ["acceptedSignalCount", metrics.acceptedSignalCount],
      ["staleSignalCount", metrics.staleSignalCount],
    ];
    integerFields.forEach(([name, value]) =>
      assertNonNegativeInteger(value, `metrics.${name}`),
    );

    const nonNegativeFields: readonly [string, number | undefined][] = [
      ["averageExecutionLatencyMs", metrics.averageExecutionLatencyMs],
      ["maximumExecutionLatencyMs", metrics.maximumExecutionLatencyMs],
      ["averageSlippageBps", metrics.averageSlippageBps],
      ["maximumSlippageBps", metrics.maximumSlippageBps],
      ["heartbeatAgeMs", metrics.heartbeatAgeMs],
    ];
    nonNegativeFields.forEach(([name, value]) => {
      if (value !== undefined) {
        assertNonNegativeFinite(value, `metrics.${name}`);
      }
    });

    assertProbability(metrics.providerErrorRate, "metrics.providerErrorRate");
    assertProbability(metrics.exchangeErrorRate, "metrics.exchangeErrorRate");
    assertProbability(metrics.modelDriftScore, "metrics.modelDriftScore");

    if (
      metrics.successfulExecutionCount +
        metrics.rejectedExecutionCount +
        metrics.failedExecutionCount >
      metrics.executionCount
    ) {
      throw new Error(
        "Operational execution outcome counts cannot exceed executionCount.",
      );
    }
    if (
      metrics.acceptedSignalCount + metrics.staleSignalCount >
      metrics.signalCount
    ) {
      throw new Error(
        "Operational signal outcome counts cannot exceed signalCount.",
      );
    }
  }

  private validateThresholds(
    thresholds: AutonomousPerformanceThresholds,
  ): void {
    const probabilityFields: readonly [string, number][] = [
      ["warningDrawdown", thresholds.warningDrawdown],
      ["criticalDrawdown", thresholds.criticalDrawdown],
      ["warningExecutionFailureRate", thresholds.warningExecutionFailureRate],
      ["criticalExecutionFailureRate", thresholds.criticalExecutionFailureRate],
      ["warningProviderErrorRate", thresholds.warningProviderErrorRate],
      ["criticalProviderErrorRate", thresholds.criticalProviderErrorRate],
      ["warningExchangeErrorRate", thresholds.warningExchangeErrorRate],
      ["criticalExchangeErrorRate", thresholds.criticalExchangeErrorRate],
      ["warningModelDriftScore", thresholds.warningModelDriftScore],
      ["criticalModelDriftScore", thresholds.criticalModelDriftScore],
      ["warningRecentPerformanceScore", thresholds.warningRecentPerformanceScore],
      ["criticalRecentPerformanceScore", thresholds.criticalRecentPerformanceScore],
      ["warningStabilityScore", thresholds.warningStabilityScore],
      ["criticalStabilityScore", thresholds.criticalStabilityScore],
    ];
    probabilityFields.forEach(([name, value]) =>
      assertProbability(value, `thresholds.${name}`),
    );

    const nonNegativeFields: readonly [string, number][] = [
      ["warningDailyLoss", thresholds.warningDailyLoss],
      ["criticalDailyLoss", thresholds.criticalDailyLoss],
      ["warningExecutionLatencyMs", thresholds.warningExecutionLatencyMs],
      ["criticalExecutionLatencyMs", thresholds.criticalExecutionLatencyMs],
      ["warningSlippageBps", thresholds.warningSlippageBps],
      ["criticalSlippageBps", thresholds.criticalSlippageBps],
      ["warningHeartbeatAgeMs", thresholds.warningHeartbeatAgeMs],
      ["criticalHeartbeatAgeMs", thresholds.criticalHeartbeatAgeMs],
    ];
    nonNegativeFields.forEach(([name, value]) =>
      assertNonNegativeFinite(value, `thresholds.${name}`),
    );

    const integerFields: readonly [string, number][] = [
      ["warningConsecutiveFailures", thresholds.warningConsecutiveFailures],
      ["criticalConsecutiveFailures", thresholds.criticalConsecutiveFailures],
      ["warningConsecutiveLosses", thresholds.warningConsecutiveLosses],
      ["criticalConsecutiveLosses", thresholds.criticalConsecutiveLosses],
      [
        "minimumTradeCountForPerformanceAlerts",
        thresholds.minimumTradeCountForPerformanceAlerts,
      ],
    ];
    integerFields.forEach(([name, value]) =>
      assertNonNegativeInteger(value, `thresholds.${name}`),
    );

    const highPairs: readonly [string, number, number][] = [
      ["drawdown", thresholds.warningDrawdown, thresholds.criticalDrawdown],
      ["dailyLoss", thresholds.warningDailyLoss, thresholds.criticalDailyLoss],
      [
        "consecutiveFailures",
        thresholds.warningConsecutiveFailures,
        thresholds.criticalConsecutiveFailures,
      ],
      [
        "consecutiveLosses",
        thresholds.warningConsecutiveLosses,
        thresholds.criticalConsecutiveLosses,
      ],
      [
        "executionFailureRate",
        thresholds.warningExecutionFailureRate,
        thresholds.criticalExecutionFailureRate,
      ],
      [
        "executionLatencyMs",
        thresholds.warningExecutionLatencyMs,
        thresholds.criticalExecutionLatencyMs,
      ],
      ["slippageBps", thresholds.warningSlippageBps, thresholds.criticalSlippageBps],
      [
        "heartbeatAgeMs",
        thresholds.warningHeartbeatAgeMs,
        thresholds.criticalHeartbeatAgeMs,
      ],
      [
        "providerErrorRate",
        thresholds.warningProviderErrorRate,
        thresholds.criticalProviderErrorRate,
      ],
      [
        "exchangeErrorRate",
        thresholds.warningExchangeErrorRate,
        thresholds.criticalExchangeErrorRate,
      ],
      [
        "modelDriftScore",
        thresholds.warningModelDriftScore,
        thresholds.criticalModelDriftScore,
      ],
    ];

    for (const [name, warning, critical] of highPairs) {
      if (critical < warning) {
        throw new Error(
          `thresholds.critical${name} cannot be below its warning threshold.`,
        );
      }
    }

    if (
      thresholds.criticalRecentPerformanceScore >
      thresholds.warningRecentPerformanceScore
    ) {
      throw new Error(
        "criticalRecentPerformanceScore cannot exceed warningRecentPerformanceScore.",
      );
    }
    if (
      thresholds.criticalStabilityScore >
      thresholds.warningStabilityScore
    ) {
      throw new Error(
        "criticalStabilityScore cannot exceed warningStabilityScore.",
      );
    }
  }

  private trimHistory(): void {
    while (this.alerts.length > this.options.maximumRetainedAlerts) {
      const removed = this.alerts.shift();
      if (removed !== undefined) {
        const fingerprint = this.fingerprint(
          removed.strategyId,
          removed.code,
        );
        if (
          this.latestAlertByFingerprint.get(fingerprint)?.alertId ===
          removed.alertId
        ) {
          this.latestAlertByFingerprint.delete(fingerprint);
        }
      }
    }

    while (this.snapshots.length > this.options.maximumRetainedSnapshots) {
      this.snapshots.shift();
    }
  }
}

export function createAutonomousPerformanceMonitor(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousPerformanceMonitorOptions = {},
): AutonomousPerformanceMonitor {
  return new AutonomousPerformanceMonitor(
    clock,
    idFactory,
    validator,
    options,
  );
}