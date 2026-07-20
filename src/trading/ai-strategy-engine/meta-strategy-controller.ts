/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 14: Production-grade deterministic meta-strategy controller.
 *
 * Coordinates multiple AI strategy candidates into one bounded,
 * explainable, immutable portfolio-level signal decision.
 */

import {
  type AiGeneratedSignal,
  type AiStrategyDirection,
  type AiStrategyMetadata,
  type AiStrategySignalAction,
  type AiStrategyTimestamp,
  type MarketRegime,
  type MetaStrategyAllocation,
  type MetaStrategyCandidate,
  type MetaStrategyDecision,
  type MetaStrategyRequest,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface MetaStrategyControllerOptions {
  readonly maximumHistoryEntries?: number;
  readonly maximumCandidatesPerRequest?: number;
  readonly rejectExpiredSignals?: boolean;
  readonly rejectInstrumentMismatch?: boolean;
  readonly rejectTimeframeMismatch?: boolean;
  readonly normalizeAcceptedAllocations?: boolean;
  readonly minimumDecisionScore?: number;
  readonly minimumDirectionalAgreement?: number;
  readonly confidenceWeight?: number;
  readonly signalScoreWeight?: number;
  readonly performanceWeight?: number;
  readonly riskWeight?: number;
  readonly regimeWeight?: number;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
  readonly metadata?: AiStrategyMetadata;
}

export interface MetaStrategyDecisionQuery {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly action?: AiStrategySignalAction;
  readonly direction?: AiStrategyDirection;
  readonly fromDecidedAt?: AiStrategyTimestamp;
  readonly toDecidedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface MetaStrategyControllerMetrics {
  readonly decisionCount: number;
  readonly actionableDecisionCount: number;
  readonly holdDecisionCount: number;
  readonly evaluatedCandidateCount: number;
  readonly acceptedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly expiredCandidateCount: number;
  readonly incompatibleRegimeCandidateCount: number;
  readonly instrumentMismatchCandidateCount: number;
  readonly timeframeMismatchCandidateCount: number;
  readonly confidenceRejectedCandidateCount: number;
  readonly allocationRejectedCandidateCount: number;
  readonly averageAcceptedCandidatesPerDecision: number;
  readonly averageDecisionConfidence: number;
  readonly averageDecisionScore: number;
  readonly averageDecisionLatencyMs: number;
  readonly maximumDecisionLatencyMs: number;
}

export interface MetaStrategyControllerSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly history: readonly MetaStrategyDecision[];
  readonly metrics: MetaStrategyControllerMetrics;
  readonly metadata: AiStrategyMetadata;
}

interface ScoredCandidate {
  readonly candidate: MetaStrategyCandidate;
  readonly compositeScore: number;
  readonly requestedWeight: number;
  readonly signedDirection: -1 | 0 | 1;
  readonly rejectionReason?: string;
}

interface MutableMetrics {
  decisionCount: number;
  actionableDecisionCount: number;
  holdDecisionCount: number;
  evaluatedCandidateCount: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  expiredCandidateCount: number;
  incompatibleRegimeCandidateCount: number;
  instrumentMismatchCandidateCount: number;
  timeframeMismatchCandidateCount: number;
  confidenceRejectedCandidateCount: number;
  allocationRejectedCandidateCount: number;
  totalDecisionConfidence: number;
  totalDecisionScore: number;
  totalDecisionLatencyMs: number;
  maximumDecisionLatencyMs: number;
}

const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 2_000;
const DEFAULT_MAXIMUM_CANDIDATES_PER_REQUEST = 1_000;
const EPSILON = 1e-12;

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function assertPositiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive integer.`);
  }
}

function assertProbability(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${path} must be between 0 and 1.`);
  }
}

function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be a non-negative finite number.`);
  }
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  const output: Record<
    string,
    string | number | boolean | null | readonly (
      string | number | boolean | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = Array.isArray(value)
      ? Object.freeze([...value])
      : value;
  }

  return Object.freeze(output);
}

function cloneAllocation(
  allocation: MetaStrategyAllocation,
): MetaStrategyAllocation {
  return Object.freeze({
    ...allocation,
    metadata: cloneMetadata(allocation.metadata),
  });
}

function cloneDecision(
  decision: MetaStrategyDecision,
): MetaStrategyDecision {
  return Object.freeze({
    ...decision,
    allocations: Object.freeze(
      decision.allocations.map(cloneAllocation),
    ),
    selectedSignalIds: Object.freeze([
      ...decision.selectedSignalIds,
    ]),
    rationale: Object.freeze([...decision.rationale]),
    metadata: cloneMetadata(decision.metadata),
  });
}

function compareDecisions(
  left: MetaStrategyDecision,
  right: MetaStrategyDecision,
): number {
  if (left.decidedAt !== right.decidedAt) {
    return left.decidedAt - right.decidedAt;
  }
  return left.decisionId.localeCompare(right.decisionId);
}

function directionSign(direction: AiStrategyDirection): -1 | 0 | 1 {
  switch (direction) {
    case "LONG":
      return 1;
    case "SHORT":
      return -1;
    case "FLAT":
    case "HOLD":
      return 0;
    default:
      return assertNever(direction);
  }
}

function signalActionable(signal: AiGeneratedSignal): boolean {
  return signal.action !== "HOLD" && directionSign(signal.direction) !== 0;
}

function actionForDirection(
  direction: AiStrategyDirection,
): AiStrategySignalAction {
  switch (direction) {
    case "LONG":
      return "BUY";
    case "SHORT":
      return "SELL";
    case "FLAT":
    case "HOLD":
      return "HOLD";
    default:
      return assertNever(direction);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported value '${String(value)}'.`);
}

export class MetaStrategyController {
  private readonly options: Required<
    Omit<MetaStrategyControllerOptions, "metadata">
  > & {
    readonly metadata: AiStrategyMetadata;
  };

  private readonly history: MetaStrategyDecision[] = [];

  private sequence = 0;

  private readonly metricsState: MutableMetrics = {
    decisionCount: 0,
    actionableDecisionCount: 0,
    holdDecisionCount: 0,
    evaluatedCandidateCount: 0,
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    expiredCandidateCount: 0,
    incompatibleRegimeCandidateCount: 0,
    instrumentMismatchCandidateCount: 0,
    timeframeMismatchCandidateCount: 0,
    confidenceRejectedCandidateCount: 0,
    allocationRejectedCandidateCount: 0,
    totalDecisionConfidence: 0,
    totalDecisionScore: 0,
    totalDecisionLatencyMs: 0,
    maximumDecisionLatencyMs: 0,
  };

  public constructor(options: MetaStrategyControllerOptions = {}) {
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const maximumCandidatesPerRequest =
      options.maximumCandidatesPerRequest ??
      DEFAULT_MAXIMUM_CANDIDATES_PER_REQUEST;
    const minimumDecisionScore =
      options.minimumDecisionScore ?? 0;
    const minimumDirectionalAgreement =
      options.minimumDirectionalAgreement ?? 0.5;

    assertPositiveInteger(
      maximumHistoryEntries,
      "options.maximumHistoryEntries",
    );
    assertPositiveInteger(
      maximumCandidatesPerRequest,
      "options.maximumCandidatesPerRequest",
    );
    assertProbability(
      minimumDecisionScore,
      "options.minimumDecisionScore",
    );
    assertProbability(
      minimumDirectionalAgreement,
      "options.minimumDirectionalAgreement",
    );

    const confidenceWeight = options.confidenceWeight ?? 0.35;
    const signalScoreWeight = options.signalScoreWeight ?? 0.25;
    const performanceWeight = options.performanceWeight ?? 0.15;
    const riskWeight = options.riskWeight ?? 0.15;
    const regimeWeight = options.regimeWeight ?? 0.1;

    for (const [name, value] of Object.entries({
      confidenceWeight,
      signalScoreWeight,
      performanceWeight,
      riskWeight,
      regimeWeight,
    })) {
      assertFiniteNonNegative(value, `options.${name}`);
    }

    const weightTotal =
      confidenceWeight +
      signalScoreWeight +
      performanceWeight +
      riskWeight +
      regimeWeight;

    if (weightTotal <= 0) {
      throw new RangeError(
        "At least one candidate scoring weight must be positive.",
      );
    }

    this.options = Object.freeze({
      maximumHistoryEntries,
      maximumCandidatesPerRequest,
      rejectExpiredSignals:
        options.rejectExpiredSignals ?? true,
      rejectInstrumentMismatch:
        options.rejectInstrumentMismatch ?? true,
      rejectTimeframeMismatch:
        options.rejectTimeframeMismatch ?? true,
      normalizeAcceptedAllocations:
        options.normalizeAcceptedAllocations ?? true,
      minimumDecisionScore,
      minimumDirectionalAgreement,
      confidenceWeight: confidenceWeight / weightTotal,
      signalScoreWeight: signalScoreWeight / weightTotal,
      performanceWeight: performanceWeight / weightTotal,
      riskWeight: riskWeight / weightTotal,
      regimeWeight: regimeWeight / weightTotal,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      metadata: cloneMetadata(options.metadata),
    });
  }

  public decide(request: MetaStrategyRequest): MetaStrategyDecision {
    const startedAt = this.options.clock();

    this.options.validator.assertValid(
      this.options.validator.validateMetaStrategyRequest(request),
      "Meta-strategy request validation failed.",
    );
    this.validateRequestSemantics(request);

    const scored = request.candidates
      .map((candidate) =>
        this.scoreCandidate(candidate, request, startedAt),
      )
      .sort((left, right) => {
        if (
          Math.abs(right.compositeScore - left.compositeScore) >
          EPSILON
        ) {
          return right.compositeScore - left.compositeScore;
        }
        return left.candidate.candidateId.localeCompare(
          right.candidate.candidateId,
        );
      });

    const allocations = this.allocate(request, scored);
    const accepted = allocations.filter(
      (allocation) => allocation.accepted,
    );

    const decision = this.buildDecision(
      request,
      scored,
      allocations,
      accepted,
      startedAt,
    );

    return this.recordDecision(decision, startedAt);
  }

  public getDecision(
    decisionId: string,
  ): MetaStrategyDecision | undefined {
    return this.history.find(
      (decision) => decision.decisionId === decisionId,
    );
  }

  public queryHistory(
    query: MetaStrategyDecisionQuery = {},
  ): readonly MetaStrategyDecision[] {
    const limit =
      query.limit ?? this.options.maximumHistoryEntries;
    assertPositiveInteger(limit, "query.limit");

    if (
      query.fromDecidedAt !== undefined &&
      query.toDecidedAt !== undefined &&
      query.fromDecidedAt > query.toDecidedAt
    ) {
      throw new RangeError(
        "query.fromDecidedAt cannot exceed query.toDecidedAt.",
      );
    }

    return Object.freeze(
      this.history
        .filter((decision) => {
          if (
            query.requestId !== undefined &&
            decision.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.correlationId !== undefined &&
            decision.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.action !== undefined &&
            decision.action !== query.action
          ) {
            return false;
          }
          if (
            query.direction !== undefined &&
            decision.direction !== query.direction
          ) {
            return false;
          }
          if (
            query.fromDecidedAt !== undefined &&
            decision.decidedAt < query.fromDecidedAt
          ) {
            return false;
          }
          if (
            query.toDecidedAt !== undefined &&
            decision.decidedAt > query.toDecidedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareDecisions)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public metrics(): MetaStrategyControllerMetrics {
    const state = this.metricsState;
    return Object.freeze({
      decisionCount: state.decisionCount,
      actionableDecisionCount:
        state.actionableDecisionCount,
      holdDecisionCount: state.holdDecisionCount,
      evaluatedCandidateCount:
        state.evaluatedCandidateCount,
      acceptedCandidateCount: state.acceptedCandidateCount,
      rejectedCandidateCount: state.rejectedCandidateCount,
      expiredCandidateCount: state.expiredCandidateCount,
      incompatibleRegimeCandidateCount:
        state.incompatibleRegimeCandidateCount,
      instrumentMismatchCandidateCount:
        state.instrumentMismatchCandidateCount,
      timeframeMismatchCandidateCount:
        state.timeframeMismatchCandidateCount,
      confidenceRejectedCandidateCount:
        state.confidenceRejectedCandidateCount,
      allocationRejectedCandidateCount:
        state.allocationRejectedCandidateCount,
      averageAcceptedCandidatesPerDecision:
        state.decisionCount === 0
          ? 0
          : state.acceptedCandidateCount /
            state.decisionCount,
      averageDecisionConfidence:
        state.decisionCount === 0
          ? 0
          : state.totalDecisionConfidence /
            state.decisionCount,
      averageDecisionScore:
        state.decisionCount === 0
          ? 0
          : state.totalDecisionScore /
            state.decisionCount,
      averageDecisionLatencyMs:
        state.decisionCount === 0
          ? 0
          : state.totalDecisionLatencyMs /
            state.decisionCount,
      maximumDecisionLatencyMs:
        state.maximumDecisionLatencyMs,
    });
  }

  public snapshot(): MetaStrategyControllerSnapshot {
    return Object.freeze({
      capturedAt: this.options.clock(),
      history: Object.freeze([...this.history]),
      metrics: this.metrics(),
      metadata: this.options.metadata,
    });
  }

  private validateRequestSemantics(
    request: MetaStrategyRequest,
  ): void {
    if (
      request.candidates.length >
      this.options.maximumCandidatesPerRequest
    ) {
      throw new RangeError(
        `request.candidates cannot exceed ${this.options.maximumCandidatesPerRequest}.`,
      );
    }

    if (
      request.constraints.maximumCandidates >
      this.options.maximumCandidatesPerRequest
    ) {
      throw new RangeError(
        `request.constraints.maximumCandidates cannot exceed ${this.options.maximumCandidatesPerRequest}.`,
      );
    }

    if (
      request.constraints.maximumCandidates >
      request.candidates.length &&
      request.candidates.length > 0
    ) {
      // This is valid; it simply means every candidate can be selected.
    }

    const candidateIds = new Set<string>();
    for (const candidate of request.candidates) {
      if (candidateIds.has(candidate.candidateId)) {
        throw new Error(
          `Duplicate meta-strategy candidate '${candidate.candidateId}'.`,
        );
      }
      candidateIds.add(candidate.candidateId);

      if (
        candidate.signal.strategyId !== candidate.strategyId
      ) {
        throw new Error(
          `Candidate '${candidate.candidateId}' strategyId does not match its signal.`,
        );
      }

      if (
        candidate.signal.strategyInstanceId !==
        candidate.strategyInstanceId
      ) {
        throw new Error(
          `Candidate '${candidate.candidateId}' strategyInstanceId does not match its signal.`,
        );
      }
    }
  }

  private scoreCandidate(
    candidate: MetaStrategyCandidate,
    request: MetaStrategyRequest,
    now: AiStrategyTimestamp,
  ): ScoredCandidate {
    const rejectionReason = this.rejectionReason(
      candidate,
      request,
      now,
    );

    const confidence = clamp(candidate.signal.confidence);
    const signalScore = clamp(
      (candidate.signal.score + 1) / 2,
    );
    const performance = clamp(
      candidate.performanceScore ?? 0.5,
    );
    const riskQuality = clamp(
      1 - (candidate.riskScore ?? 0.5),
    );
    const regimeSuitability = clamp(
      candidate.regimeSuitability ??
        this.deriveRegimeSuitability(candidate, request),
    );

    const compositeScore = clamp(
      confidence * this.options.confidenceWeight +
        signalScore * this.options.signalScoreWeight +
        performance * this.options.performanceWeight +
        riskQuality * this.options.riskWeight +
        regimeSuitability * this.options.regimeWeight,
    );

    const requestedWeight = clamp(
      candidate.allocationWeight ?? compositeScore,
    );

    return Object.freeze({
      candidate,
      compositeScore,
      requestedWeight,
      signedDirection: directionSign(
        candidate.signal.direction,
      ),
      rejectionReason,
    });
  }

  private rejectionReason(
    candidate: MetaStrategyCandidate,
    request: MetaStrategyRequest,
    now: AiStrategyTimestamp,
  ): string | undefined {
    const signal = candidate.signal;

    if (!signalActionable(signal)) {
      return "Candidate signal is not actionable.";
    }

    if (
      signal.confidence <
      request.constraints.minimumConfidence
    ) {
      this.metricsState.confidenceRejectedCandidateCount += 1;
      return `Signal confidence ${signal.confidence} is below the required minimum ${request.constraints.minimumConfidence}.`;
    }

    if (
      this.options.rejectExpiredSignals &&
      signal.validUntil < now
    ) {
      this.metricsState.expiredCandidateCount += 1;
      return "Candidate signal has expired.";
    }

    if (
      this.options.rejectInstrumentMismatch &&
      !this.sameInstrument(
        signal.instrument,
        request.marketContext.instrument,
      )
    ) {
      this.metricsState.instrumentMismatchCandidateCount += 1;
      return "Candidate signal instrument does not match the request market context.";
    }

    if (
      this.options.rejectTimeframeMismatch &&
      signal.timeframe !== request.marketContext.timeframe
    ) {
      this.metricsState.timeframeMismatchCandidateCount += 1;
      return "Candidate signal timeframe does not match the request market context.";
    }

    if (
      request.constraints.requireRegimeCompatibility &&
      !this.regimeCompatible(candidate, request)
    ) {
      this.metricsState.incompatibleRegimeCandidateCount += 1;
      return "Candidate signal is incompatible with the active market regime.";
    }

    return undefined;
  }

  private sameInstrument(
    left: AiGeneratedSignal["instrument"],
    right: AiGeneratedSignal["instrument"],
  ): boolean {
    return (
      left.exchangeId === right.exchangeId &&
      left.normalizedSymbol === right.normalizedSymbol &&
      left.marketType === right.marketType
    );
  }

  private regimeCompatible(
    candidate: MetaStrategyCandidate,
    request: MetaStrategyRequest,
  ): boolean {
    if (request.regime === undefined) {
      return false;
    }

    if (
      candidate.regimeSuitability !== undefined &&
      candidate.regimeSuitability >= 0.5
    ) {
      return true;
    }

    const signalRegime = candidate.signal.regime;
    if (signalRegime === undefined) {
      return false;
    }

    return this.regimeFamiliesCompatible(
      signalRegime.primaryRegime,
      request.regime.primaryRegime,
    );
  }

  private deriveRegimeSuitability(
    candidate: MetaStrategyCandidate,
    request: MetaStrategyRequest,
  ): number {
    if (request.regime === undefined) {
      return 0.5;
    }

    const signalRegime = candidate.signal.regime;
    if (signalRegime === undefined) {
      return request.constraints.requireRegimeCompatibility
        ? 0
        : 0.5;
    }

    if (
      signalRegime.primaryRegime ===
      request.regime.primaryRegime
    ) {
      return clamp(
        (signalRegime.confidence +
          request.regime.confidence) /
          2,
      );
    }

    return this.regimeFamiliesCompatible(
      signalRegime.primaryRegime,
      request.regime.primaryRegime,
    )
      ? 0.7
      : 0;
  }

  private regimeFamiliesCompatible(
    left: MarketRegime,
    right: MarketRegime,
  ): boolean {
    if (left === right) {
      return true;
    }

    const bullish = new Set<MarketRegime>([
      "STRONG_BULL",
      "BULL",
      "WEAK_BULL",
      "TRENDING",
      "BREAKOUT",
    ]);
    const bearish = new Set<MarketRegime>([
      "STRONG_BEAR",
      "BEAR",
      "WEAK_BEAR",
      "TRENDING",
      "BREAKOUT",
    ]);
    const neutral = new Set<MarketRegime>([
      "RANGE",
      "MEAN_REVERTING",
      "LOW_VOLATILITY",
      "UNKNOWN",
    ]);
    const stressed = new Set<MarketRegime>([
      "HIGH_VOLATILITY",
      "LIQUIDITY_STRESS",
    ]);

    return (
      (bullish.has(left) && bullish.has(right)) ||
      (bearish.has(left) && bearish.has(right)) ||
      (neutral.has(left) && neutral.has(right)) ||
      (stressed.has(left) && stressed.has(right))
    );
  }

  private allocate(
    request: MetaStrategyRequest,
    scored: readonly ScoredCandidate[],
  ): readonly MetaStrategyAllocation[] {
    const accepted: {
      scored: ScoredCandidate;
      weight: number;
    }[] = [];
    const rejected = new Map<string, string>();

    let longAllocation = 0;
    let shortAllocation = 0;
    let grossAllocation = 0;

    for (const item of scored) {
      const id = item.candidate.candidateId;

      if (item.rejectionReason !== undefined) {
        rejected.set(id, item.rejectionReason);
        continue;
      }

      if (
        accepted.length >=
        request.constraints.maximumCandidates
      ) {
        rejected.set(
          id,
          "Maximum accepted candidate count reached.",
        );
        this.metricsState.allocationRejectedCandidateCount += 1;
        continue;
      }

      const directionCap =
        item.signedDirection > 0
          ? request.constraints.maximumLongAllocation
          : request.constraints.maximumShortAllocation;
      const directionUsed =
        item.signedDirection > 0
          ? longAllocation
          : shortAllocation;

      const availableDirection = Math.max(
        0,
        directionCap - directionUsed,
      );
      const availableGross = Math.max(
        0,
        request.constraints.maximumGrossAllocation -
          grossAllocation,
      );
      const weight = Math.min(
        item.requestedWeight,
        availableDirection,
        availableGross,
      );

      if (weight <= EPSILON) {
        rejected.set(
          id,
          "No allocation capacity remains for this candidate.",
        );
        this.metricsState.allocationRejectedCandidateCount += 1;
        continue;
      }

      accepted.push({ scored: item, weight });

      grossAllocation += weight;
      if (item.signedDirection > 0) {
        longAllocation += weight;
      } else {
        shortAllocation += weight;
      }
    }

    if (
      this.options.normalizeAcceptedAllocations &&
      accepted.length > 0 &&
      grossAllocation > EPSILON
    ) {
      const targetGross = Math.min(
        1,
        request.constraints.maximumGrossAllocation,
      );
      const scale =
        grossAllocation < targetGross
          ? targetGross / grossAllocation
          : 1;

      if (scale > 1 + EPSILON) {
        let normalizedLong = longAllocation;
        let normalizedShort = shortAllocation;
        let normalizedGross = grossAllocation;

        for (const entry of accepted) {
          const directionCap =
            entry.scored.signedDirection > 0
              ? request.constraints.maximumLongAllocation
              : request.constraints.maximumShortAllocation;
          const directionUsed =
            entry.scored.signedDirection > 0
              ? normalizedLong
              : normalizedShort;
          const additionalDirection = Math.max(
            0,
            directionCap - directionUsed,
          );
          const additionalGross = Math.max(
            0,
            request.constraints.maximumGrossAllocation -
              normalizedGross,
          );
          const desiredAdditional =
            entry.weight * (scale - 1);
          const additional = Math.min(
            desiredAdditional,
            additionalDirection,
            additionalGross,
          );

          entry.weight += additional;
          normalizedGross += additional;
          if (entry.scored.signedDirection > 0) {
            normalizedLong += additional;
          } else {
            normalizedShort += additional;
          }
        }
      }
    }

    const acceptedById = new Map(
      accepted.map((entry) => [
        entry.scored.candidate.candidateId,
        entry.weight,
      ]),
    );

    return Object.freeze(
      scored.map((item) => {
        const weight = acceptedById.get(
          item.candidate.candidateId,
        );
        if (weight === undefined) {
          return Object.freeze({
            candidateId: item.candidate.candidateId,
            strategyId: item.candidate.strategyId,
            strategyInstanceId:
              item.candidate.strategyInstanceId,
            weight: 0,
            accepted: false,
            reason:
              rejected.get(item.candidate.candidateId) ??
              item.rejectionReason ??
              "Candidate rejected.",
            metadata: cloneMetadata(
              item.candidate.metadata,
            ),
          });
        }

        return Object.freeze({
          candidateId: item.candidate.candidateId,
          strategyId: item.candidate.strategyId,
          strategyInstanceId:
            item.candidate.strategyInstanceId,
          weight,
          accepted: true,
          metadata: cloneMetadata(item.candidate.metadata),
        });
      }),
    );
  }

  private buildDecision(
    request: MetaStrategyRequest,
    scored: readonly ScoredCandidate[],
    allocations: readonly MetaStrategyAllocation[],
    acceptedAllocations: readonly MetaStrategyAllocation[],
    startedAt: AiStrategyTimestamp,
  ): MetaStrategyDecision {
    const decidedAt = this.options.clock();
    this.sequence += 1;

    const acceptedById = new Map(
      acceptedAllocations.map((allocation) => [
        allocation.candidateId,
        allocation,
      ]),
    );
    const acceptedScored = scored.filter((item) =>
      acceptedById.has(item.candidate.candidateId),
    );

    const longWeight = acceptedScored
      .filter((item) => item.signedDirection > 0)
      .reduce(
        (sum, item) =>
          sum +
          (acceptedById.get(item.candidate.candidateId)
            ?.weight ?? 0),
        0,
      );
    const shortWeight = acceptedScored
      .filter((item) => item.signedDirection < 0)
      .reduce(
        (sum, item) =>
          sum +
          (acceptedById.get(item.candidate.candidateId)
            ?.weight ?? 0),
        0,
      );
    const grossWeight = longWeight + shortWeight;
    const dominantWeight = Math.max(longWeight, shortWeight);
    const agreement =
      grossWeight <= EPSILON
        ? 0
        : dominantWeight / grossWeight;

    const weightedConfidence =
      grossWeight <= EPSILON
        ? 0
        : acceptedScored.reduce((sum, item) => {
            const weight =
              acceptedById.get(item.candidate.candidateId)
                ?.weight ?? 0;
            return (
              sum +
              item.candidate.signal.confidence * weight
            );
          }, 0) / grossWeight;

    const weightedScore =
      grossWeight <= EPSILON
        ? 0
        : acceptedScored.reduce((sum, item) => {
            const weight =
              acceptedById.get(item.candidate.candidateId)
                ?.weight ?? 0;
            return sum + item.compositeScore * weight;
          }, 0) / grossWeight;

    let direction: AiStrategyDirection = "HOLD";
    const rationale: string[] = [];

    if (acceptedScored.length === 0) {
      rationale.push(
        "No candidate satisfied the meta-strategy constraints.",
      );
    } else if (
      weightedScore < this.options.minimumDecisionScore
    ) {
      rationale.push(
        `Decision score ${weightedScore.toFixed(6)} is below the required minimum ${this.options.minimumDecisionScore.toFixed(6)}.`,
      );
    } else if (
      agreement <
      this.options.minimumDirectionalAgreement
    ) {
      rationale.push(
        `Directional agreement ${agreement.toFixed(6)} is below the required minimum ${this.options.minimumDirectionalAgreement.toFixed(6)}.`,
      );
    } else if (longWeight > shortWeight + EPSILON) {
      direction = "LONG";
      rationale.push(
        `Long allocation ${longWeight.toFixed(6)} exceeds short allocation ${shortWeight.toFixed(6)}.`,
      );
    } else if (shortWeight > longWeight + EPSILON) {
      direction = "SHORT";
      rationale.push(
        `Short allocation ${shortWeight.toFixed(6)} exceeds long allocation ${longWeight.toFixed(6)}.`,
      );
    } else {
      rationale.push(
        "Long and short allocations are balanced.",
      );
    }

    rationale.push(
      `${acceptedScored.length} of ${scored.length} candidates were accepted.`,
    );
    rationale.push(
      `Gross allocation=${grossWeight.toFixed(6)}, confidence=${weightedConfidence.toFixed(6)}, score=${weightedScore.toFixed(6)}, agreement=${agreement.toFixed(6)}.`,
    );

    const action = actionForDirection(direction);
    const selectedSignalIds =
      direction === "HOLD"
        ? []
        : acceptedScored
            .filter(
              (item) =>
                item.candidate.signal.direction === direction,
            )
            .map((item) => item.candidate.signal.signalId);

    return Object.freeze({
      decisionId: this.options.idFactory(
        "meta-strategy-decision",
        decidedAt,
        this.sequence,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      decidedAt,
      action,
      direction,
      confidence:
        direction === "HOLD"
          ? 0
          : clamp(weightedConfidence * agreement),
      score:
        direction === "HOLD"
          ? 0
          : clamp(weightedScore * agreement),
      allocations: Object.freeze(
        allocations.map(cloneAllocation),
      ),
      selectedSignalIds: Object.freeze(selectedSignalIds),
      rationale: Object.freeze(rationale),
      metadata: cloneMetadata({
        ...request.metadata,
        controllerStartedAt: startedAt,
        grossAllocation: grossWeight,
        longAllocation: longWeight,
        shortAllocation: shortWeight,
        directionalAgreement: agreement,
      }),
    });
  }

  private recordDecision(
    decision: MetaStrategyDecision,
    startedAt: AiStrategyTimestamp,
  ): MetaStrategyDecision {
    const frozen = cloneDecision(decision);
    this.history.push(frozen);

    if (this.history.length > this.options.maximumHistoryEntries) {
      this.history.splice(
        0,
        this.history.length -
          this.options.maximumHistoryEntries,
      );
    }

    const acceptedCount = frozen.allocations.filter(
      (allocation) => allocation.accepted,
    ).length;
    const rejectedCount =
      frozen.allocations.length - acceptedCount;
    const latency = Math.max(
      0,
      frozen.decidedAt - startedAt,
    );

    const state = this.metricsState;
    state.decisionCount += 1;
    state.evaluatedCandidateCount +=
      frozen.allocations.length;
    state.acceptedCandidateCount += acceptedCount;
    state.rejectedCandidateCount += rejectedCount;
    state.totalDecisionConfidence += frozen.confidence;
    state.totalDecisionScore += frozen.score;
    state.totalDecisionLatencyMs += latency;
    state.maximumDecisionLatencyMs = Math.max(
      state.maximumDecisionLatencyMs,
      latency,
    );

    if (frozen.action === "HOLD") {
      state.holdDecisionCount += 1;
    } else {
      state.actionableDecisionCount += 1;
    }

    return frozen;
  }
}

export function createMetaStrategyController(
  options: MetaStrategyControllerOptions = {},
): MetaStrategyController {
  return new MetaStrategyController(options);
}