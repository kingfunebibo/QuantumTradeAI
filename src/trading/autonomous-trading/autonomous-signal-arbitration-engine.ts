/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 7: Autonomous signal arbitration engine.
 *
 * Responsibilities:
 * - validate and score live signal candidates
 * - reject expired, stale, mismatched, unhealthy, and duplicate candidates
 * - combine confidence, strength, priority, health, reliability,
 *   regime, portfolio, risk, liquidity, and latency factors
 * - resolve directional conflicts deterministically
 * - enforce winning-score and score-separation thresholds
 * - emit one authoritative signal decision per instrument
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousSignalArbitrationDecision,
  type AutonomousSignalArbitrationRequest,
  type AutonomousSignalCandidate,
  type AutonomousSignalCandidateScore,
  type AutonomousStrategyHealthStatus,
  type AutonomousStrategyPriority,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingInstrument,
  type AutonomousTradingMetadata,
  type AutonomousTradingSignal,
  type AutonomousTradingSignalDirection,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousSignalArbitrationEngineOptions {
  readonly rejectUnknownHealth?: boolean;
  readonly rejectUnhealthyStrategies?: boolean;
  readonly duplicateWindowMs?: number;
  readonly conflictScoreTolerance?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedSignalArbitrationEngineOptions {
  readonly rejectUnknownHealth: boolean;
  readonly rejectUnhealthyStrategies: boolean;
  readonly duplicateWindowMs: number;
  readonly conflictScoreTolerance: number;
  readonly numericalTolerance: number;
}

interface EvaluatedCandidate {
  readonly candidate: AutonomousSignalCandidate;
  readonly rawScore: number;
  readonly normalizedScore: number;
  readonly accepted: boolean;
  readonly rejectionReasons: readonly string[];
}

interface DuplicateRecord {
  readonly signalId: string;
  readonly candidateId: string;
  readonly strategyId: string;
  readonly generatedAt: number;
  readonly fingerprint: string;
}

const DEFAULT_OPTIONS: Readonly<ResolvedSignalArbitrationEngineOptions> =
  Object.freeze({
    rejectUnknownHealth: false,
    rejectUnhealthyStrategies: true,
    duplicateWindowMs: 60_000,
    conflictScoreTolerance: 0.02,
    numericalTolerance: 1e-9,
  });

const PRIORITY_SCORE: Readonly<Record<AutonomousStrategyPriority, number>> =
  Object.freeze({
    LOW: 0.25,
    NORMAL: 0.50,
    HIGH: 0.75,
    CRITICAL: 1,
  });

const HEALTH_SCORE: Readonly<
  Record<AutonomousStrategyHealthStatus, number>
> = Object.freeze({
  HEALTHY: 1,
  DEGRADED: 0.55,
  UNHEALTHY: 0,
  UNKNOWN: 0.25,
});

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

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
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

function freezeSignal(
  signal: AutonomousTradingSignal,
): AutonomousTradingSignal {
  return Object.freeze({
    ...signal,
    instrument: Object.freeze({
      ...signal.instrument,
      metadata: freezeMetadata(signal.instrument.metadata),
    }),
    metadata: freezeMetadata(signal.metadata),
  });
}

function freezeScore(
  score: AutonomousSignalCandidateScore,
): AutonomousSignalCandidateScore {
  return Object.freeze({
    ...score,
    rejectionReasons: Object.freeze([...score.rejectionReasons]),
    metadata: freezeMetadata(score.metadata),
  });
}

function freezeDecision(
  decision: AutonomousSignalArbitrationDecision,
): AutonomousSignalArbitrationDecision {
  return Object.freeze({
    ...decision,
    instrument: Object.freeze({
      ...decision.instrument,
      metadata: freezeMetadata(decision.instrument.metadata),
    }),
    selectedSignal:
      decision.selectedSignal === undefined
        ? undefined
        : freezeSignal(decision.selectedSignal),
    candidateScores: Object.freeze(decision.candidateScores.map(freezeScore)),
    metadata: freezeMetadata(decision.metadata),
  });
}

export class AutonomousSignalArbitrationEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedSignalArbitrationEngineOptions;
  private readonly duplicateRecords = new Map<string, DuplicateRecord>();
  private decisionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousSignalArbitrationEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const duplicateWindowMs =
      options.duplicateWindowMs ?? DEFAULT_OPTIONS.duplicateWindowMs;
    const conflictScoreTolerance =
      options.conflictScoreTolerance ??
      DEFAULT_OPTIONS.conflictScoreTolerance;
    const numericalTolerance =
      options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance;

    assertNonNegativeFinite(duplicateWindowMs, "duplicateWindowMs");
    assertProbability(conflictScoreTolerance, "conflictScoreTolerance");

    if (!Number.isFinite(numericalTolerance) || numericalTolerance <= 0) {
      throw new RangeError(
        "numericalTolerance must be a positive finite number.",
      );
    }

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze({
      rejectUnknownHealth:
        options.rejectUnknownHealth ??
        DEFAULT_OPTIONS.rejectUnknownHealth,
      rejectUnhealthyStrategies:
        options.rejectUnhealthyStrategies ??
        DEFAULT_OPTIONS.rejectUnhealthyStrategies,
      duplicateWindowMs,
      conflictScoreTolerance,
      numericalTolerance,
    });
  }

  public arbitrate(
    request: AutonomousSignalArbitrationRequest,
  ): AutonomousSignalArbitrationDecision {
    const validation =
      this.validator.validateSignalArbitrationRequest(request);
    this.validator.assertValid(
      validation,
      "Signal arbitration request is invalid.",
    );

    const decidedAt = this.clock.now();
    assertNonNegativeFinite(decidedAt, "clock.now()");

    this.pruneDuplicateRecords(decidedAt);

    const rawEvaluations = request.candidates.map((candidate) =>
      this.evaluateCandidate(candidate, request, decidedAt),
    );

    const acceptedRawScoreTotal = rawEvaluations
      .filter((evaluation) => evaluation.accepted)
      .reduce((sum, evaluation) => sum + evaluation.rawScore, 0);

    const evaluations: readonly EvaluatedCandidate[] = Object.freeze(
      rawEvaluations.map((evaluation) =>
        Object.freeze({
          ...evaluation,
          normalizedScore:
            evaluation.accepted &&
            acceptedRawScoreTotal > this.options.numericalTolerance
              ? evaluation.rawScore / acceptedRawScoreTotal
              : 0,
        }),
      ),
    );

    const eligible = evaluations
      .filter((evaluation) => evaluation.accepted)
      .sort((left, right) => this.compareEvaluations(left, right));

    const outcome = this.resolveOutcome(request, eligible);
    const selected =
      outcome.outcome === "SELECTED" ? eligible[0] : undefined;

    const candidateScores = Object.freeze(
      evaluations
        .map((evaluation) =>
          freezeScore({
            candidateId: evaluation.candidate.candidateId,
            signalId: evaluation.candidate.signal.signalId,
            strategyId: evaluation.candidate.signal.strategyId,
            rawScore: evaluation.rawScore,
            normalizedScore: evaluation.normalizedScore,
            accepted: evaluation.accepted,
            rejectionReasons: evaluation.rejectionReasons,
            metadata: freezeMetadata({
              action: evaluation.candidate.signal.action,
              direction: evaluation.candidate.signal.direction,
              generatedAt: evaluation.candidate.signal.generatedAt,
              strategyPriority: evaluation.candidate.strategyPriority,
              strategyHealth: evaluation.candidate.strategyHealth,
            }),
          }),
        )
        .sort((left, right) =>
          left.candidateId.localeCompare(right.candidateId),
        ),
    );

    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "signal-arbitration-decision",
        decidedAt,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      instrument: request.instrument,
      outcome: outcome.outcome,
      selectedSignal:
        selected === undefined
          ? undefined
          : selected.candidate.signal,
      candidateScores,
      reason: outcome.reason,
      decidedAt,
      metadata: freezeMetadata({
        candidateCount: request.candidates.length,
        eligibleCandidateCount: eligible.length,
        rejectedCandidateCount:
          request.candidates.length - eligible.length,
        winningScore: selected?.rawScore ?? 0,
        winningNormalizedScore: selected?.normalizedScore ?? 0,
        minimumWinningScore: request.minimumWinningScore,
        minimumScoreSeparation: request.minimumScoreSeparation,
      }),
    });

    const decisionValidation =
      this.validator.validateSignalArbitrationDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated signal arbitration decision is invalid.",
    );

    if (selected !== undefined) {
      this.rememberSelection(selected.candidate);
    }

    return decision;
  }

  public clearDuplicateHistory(): void {
    this.duplicateRecords.clear();
  }

  public duplicateHistorySize(): number {
    return this.duplicateRecords.size;
  }

  private evaluateCandidate(
    candidate: AutonomousSignalCandidate,
    request: AutonomousSignalArbitrationRequest,
    decidedAt: number,
  ): Omit<EvaluatedCandidate, "normalizedScore"> {
    const reasons: string[] = [];
    const signal = candidate.signal;

    if (!this.instrumentsMatch(signal.instrument, request.instrument)) {
      reasons.push(
        "Signal instrument does not match the arbitration instrument.",
      );
    }

    const ageMs = decidedAt - signal.generatedAt;
    if (ageMs < 0) {
      reasons.push("Signal generatedAt cannot be in the future.");
    } else if (ageMs > request.maximumCandidateAgeMs) {
      reasons.push("Signal exceeds maximumCandidateAgeMs.");
    }

    if (
      signal.expiresAt !== undefined &&
      decidedAt >= signal.expiresAt
    ) {
      reasons.push("Signal has expired.");
    }

    if (
      this.options.rejectUnhealthyStrategies &&
      candidate.strategyHealth === "UNHEALTHY"
    ) {
      reasons.push("Strategy health is UNHEALTHY.");
    }

    if (
      this.options.rejectUnknownHealth &&
      candidate.strategyHealth === "UNKNOWN"
    ) {
      reasons.push("Strategy health is UNKNOWN.");
    }

    if (this.isDuplicate(candidate)) {
      reasons.push("Duplicate signal candidate was suppressed.");
    }

    const rawScore = this.calculateRawScore(candidate, request);

    return Object.freeze({
      candidate,
      rawScore,
      accepted: reasons.length === 0,
      rejectionReasons: Object.freeze(reasons),
    });
  }

  private calculateRawScore(
    candidate: AutonomousSignalCandidate,
    request: AutonomousSignalArbitrationRequest,
  ): number {
    const weights = request.weights;
    const weightedPositiveScore =
      clampProbability(candidate.signal.confidence) * weights.confidence +
      clampProbability(candidate.signal.strength) * weights.strength +
      PRIORITY_SCORE[candidate.strategyPriority] *
        weights.strategyPriority +
      HEALTH_SCORE[candidate.strategyHealth] * weights.strategyHealth +
      clampProbability(candidate.historicalReliability) *
        weights.historicalReliability +
      clampProbability(candidate.regimeCompatibility) *
        weights.regimeCompatibility +
      clampProbability(candidate.portfolioCompatibility) *
        weights.portfolioCompatibility +
      clampProbability(candidate.riskCompatibility) *
        weights.riskCompatibility +
      clampProbability(candidate.liquidityCompatibility) *
        weights.liquidityCompatibility;

    const penalty =
      clampProbability(candidate.latencyPenalty) * weights.latencyPenalty;

    const positiveWeightTotal =
      weights.confidence +
      weights.strength +
      weights.strategyPriority +
      weights.strategyHealth +
      weights.historicalReliability +
      weights.regimeCompatibility +
      weights.portfolioCompatibility +
      weights.riskCompatibility +
      weights.liquidityCompatibility;

    if (positiveWeightTotal <= this.options.numericalTolerance) {
      return 0;
    }

    return clampProbability(
      (weightedPositiveScore - penalty) / positiveWeightTotal,
    );
  }

  private resolveOutcome(
    request: AutonomousSignalArbitrationRequest,
    eligible: readonly EvaluatedCandidate[],
  ): {
    readonly outcome: AutonomousSignalArbitrationDecision["outcome"];
    readonly reason: string;
  } {
    if (eligible.length === 0) {
      return Object.freeze({
        outcome: "NO_ELIGIBLE_SIGNAL",
        reason:
          "No candidate passed freshness, health, duplicate, and instrument checks.",
      });
    }

    const winner = eligible[0];

    if (
      winner.rawScore + this.options.numericalTolerance <
      request.minimumWinningScore
    ) {
      return Object.freeze({
        outcome: "BELOW_THRESHOLD",
        reason:
          `Winning score ${winner.rawScore.toFixed(6)} is below ` +
          `minimumWinningScore ${request.minimumWinningScore.toFixed(6)}.`,
      });
    }

    const runnerUp = eligible[1];
    if (runnerUp === undefined) {
      return Object.freeze({
        outcome: "SELECTED",
        reason:
          `Candidate "${winner.candidate.candidateId}" was the only ` +
          "eligible signal and satisfied the winning threshold.",
      });
    }

    const separation = winner.rawScore - runnerUp.rawScore;
    const conflict =
      this.signalsConflict(
        winner.candidate.signal,
        runnerUp.candidate.signal,
      ) &&
      separation <=
        Math.max(
          request.minimumScoreSeparation,
          this.options.conflictScoreTolerance,
        ) +
          this.options.numericalTolerance;

    if (conflict) {
      return Object.freeze({
        outcome: "CONFLICT",
        reason:
          "Top-ranked candidates express conflicting directions with " +
          `insufficient conflict separation (${separation.toFixed(6)}).`,
      });
    }

    if (
      separation + this.options.numericalTolerance <
      request.minimumScoreSeparation
    ) {
      return Object.freeze({
        outcome: "INSUFFICIENT_SEPARATION",
        reason:
          `Score separation ${separation.toFixed(6)} is below ` +
          `minimumScoreSeparation ${request.minimumScoreSeparation.toFixed(6)}.`,
      });
    }

    return Object.freeze({
      outcome: "SELECTED",
      reason:
        `Candidate "${winner.candidate.candidateId}" won with score ` +
        `${winner.rawScore.toFixed(6)} and separation ` +
        `${separation.toFixed(6)}.`,
    });
  }

  private compareEvaluations(
    left: EvaluatedCandidate,
    right: EvaluatedCandidate,
  ): number {
    const scoreDifference = right.rawScore - left.rawScore;
    if (Math.abs(scoreDifference) > this.options.numericalTolerance) {
      return scoreDifference;
    }

    const confidenceDifference =
      right.candidate.signal.confidence -
      left.candidate.signal.confidence;
    if (
      Math.abs(confidenceDifference) >
      this.options.numericalTolerance
    ) {
      return confidenceDifference;
    }

    const priorityDifference =
      PRIORITY_SCORE[right.candidate.strategyPriority] -
      PRIORITY_SCORE[left.candidate.strategyPriority];
    if (
      Math.abs(priorityDifference) >
      this.options.numericalTolerance
    ) {
      return priorityDifference;
    }

    const generationDifference =
      right.candidate.signal.generatedAt -
      left.candidate.signal.generatedAt;
    if (generationDifference !== 0) {
      return generationDifference;
    }

    return left.candidate.candidateId.localeCompare(
      right.candidate.candidateId,
    );
  }

  private signalsConflict(
    left: AutonomousTradingSignal,
    right: AutonomousTradingSignal,
  ): boolean {
    const leftDirection = this.resolveEffectiveDirection(left);
    const rightDirection = this.resolveEffectiveDirection(right);

    return (
      (leftDirection === "LONG" && rightDirection === "SHORT") ||
      (leftDirection === "SHORT" && rightDirection === "LONG")
    );
  }

  private resolveEffectiveDirection(
    signal: AutonomousTradingSignal,
  ): AutonomousTradingSignalDirection {
    if (signal.action === "BUY" || signal.action === "INCREASE") {
      return signal.direction === "SHORT" ? "SHORT" : "LONG";
    }

    if (signal.action === "SELL") {
      return signal.direction === "LONG" ? "LONG" : "SHORT";
    }

    if (
      signal.action === "HOLD" ||
      signal.action === "CLOSE" ||
      signal.action === "REDUCE"
    ) {
      return signal.direction;
    }

    return signal.direction;
  }

  private instrumentsMatch(
    left: AutonomousTradingInstrument,
    right: AutonomousTradingInstrument,
  ): boolean {
    return (
      left.exchangeId === right.exchangeId &&
      left.normalizedSymbol === right.normalizedSymbol &&
      left.marketType === right.marketType
    );
  }

  private createFingerprint(
    candidate: AutonomousSignalCandidate,
  ): string {
    const signal = candidate.signal;

    return [
      signal.strategyId,
      signal.strategyVersion,
      signal.instrument.exchangeId,
      signal.instrument.normalizedSymbol,
      signal.instrument.marketType,
      signal.timeframe,
      signal.action,
      signal.direction,
      signal.generatedAt,
      signal.referencePrice ?? "",
      signal.targetPrice ?? "",
    ].join("|");
  }

  private isDuplicate(
    candidate: AutonomousSignalCandidate,
  ): boolean {
    const signal = candidate.signal;

    if (this.duplicateRecords.has(`signal:${signal.signalId}`)) {
      return true;
    }

    if (this.duplicateRecords.has(`candidate:${candidate.candidateId}`)) {
      return true;
    }

    return this.duplicateRecords.has(
      `fingerprint:${this.createFingerprint(candidate)}`,
    );
  }

  private rememberSelection(
    candidate: AutonomousSignalCandidate,
  ): void {
    const record: DuplicateRecord = Object.freeze({
      signalId: candidate.signal.signalId,
      candidateId: candidate.candidateId,
      strategyId: candidate.signal.strategyId,
      generatedAt: candidate.signal.generatedAt,
      fingerprint: this.createFingerprint(candidate),
    });

    this.duplicateRecords.set(`signal:${record.signalId}`, record);
    this.duplicateRecords.set(`candidate:${record.candidateId}`, record);
    this.duplicateRecords.set(
      `fingerprint:${record.fingerprint}`,
      record,
    );
  }

  private pruneDuplicateRecords(decidedAt: number): void {
    if (this.options.duplicateWindowMs <= 0) {
      this.duplicateRecords.clear();
      return;
    }

    for (const [key, record] of this.duplicateRecords.entries()) {
      if (
        decidedAt - record.generatedAt >
        this.options.duplicateWindowMs
      ) {
        this.duplicateRecords.delete(key);
      }
    }
  }
}

export function createAutonomousSignalArbitrationEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousSignalArbitrationEngineOptions = {},
): AutonomousSignalArbitrationEngine {
  return new AutonomousSignalArbitrationEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}