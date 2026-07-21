/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 6:
 * src/trading/ai-decision-intelligence/conflict-resolution-engine.ts
 *
 * Deterministic conflict detection and resolution for scored decision
 * candidates. The engine identifies duplicate, mutually exclusive, resource,
 * dependency, temporal, policy, regime and execution conflicts, resolves each
 * conflict using stable priority/utility ordering, and returns an immutable
 * candidate set for downstream plan optimization.
 */

import type {
  DecisionCandidateType,
  DecisionConflict,
  DecisionConflictResolution,
  DecisionConflictResolutionRequest,
  DecisionConflictResolutionResult,
  DecisionConflictResolverPort,
  DecisionConflictType,
  DecisionIntelligenceId,
  DecisionPriority,
  ResolvedDecisionConflict,
  ScoredDecisionCandidate,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;
const DEFAULT_TOLERANCE = 1e-9;

export interface ConflictResolutionEngineOptions {
  readonly rejectIneligibleCandidates?: boolean;
  readonly detectDuplicateActions?: boolean;
  readonly detectExplicitMutualExclusions?: boolean;
  readonly detectStrategyStateConflicts?: boolean;
  readonly detectResourceConflicts?: boolean;
  readonly detectDependencyConflicts?: boolean;
  readonly detectTemporalConflicts?: boolean;
  readonly detectPolicyConflicts?: boolean;
  readonly detectRegimeConflicts?: boolean;
  readonly detectExecutionConflicts?: boolean;
  readonly allowCompatibleMerges?: boolean;
  readonly sequenceDependencies?: boolean;
  readonly preferNoActionOnExactTie?: boolean;
  readonly capitalTolerance?: number;
  readonly riskBudgetTolerance?: number;
}

export class ConflictResolutionError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "CONFLICT_RESOLUTION_ERROR") {
    super(message);
    this.name = "ConflictResolutionError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface ConflictDescriptor {
  readonly type: DecisionConflictType;
  readonly candidateIds: readonly DecisionIntelligenceId[];
  readonly severity: DecisionPriority;
  readonly description: string;
  readonly recommendedResolution: DecisionConflictResolution;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface ResolutionAccumulator {
  readonly rejected: Set<string>;
  readonly sequenced: Map<string, number>;
  readonly conflicts: ResolvedDecisionConflict[];
  readonly warnings: string[];
}

export class ConflictResolutionEngine implements DecisionConflictResolverPort {
  private readonly rejectIneligibleCandidates: boolean;
  private readonly detectDuplicateActions: boolean;
  private readonly detectExplicitMutualExclusions: boolean;
  private readonly detectStrategyStateConflicts: boolean;
  private readonly detectResourceConflicts: boolean;
  private readonly detectDependencyConflicts: boolean;
  private readonly detectTemporalConflicts: boolean;
  private readonly detectPolicyConflicts: boolean;
  private readonly detectRegimeConflicts: boolean;
  private readonly detectExecutionConflicts: boolean;
  private readonly allowCompatibleMerges: boolean;
  private readonly sequenceDependencies: boolean;
  private readonly preferNoActionOnExactTie: boolean;
  private readonly capitalTolerance: number;
  private readonly riskBudgetTolerance: number;

  public constructor(options: ConflictResolutionEngineOptions = {}) {
    this.rejectIneligibleCandidates = options.rejectIneligibleCandidates ?? true;
    this.detectDuplicateActions = options.detectDuplicateActions ?? true;
    this.detectExplicitMutualExclusions =
      options.detectExplicitMutualExclusions ?? true;
    this.detectStrategyStateConflicts =
      options.detectStrategyStateConflicts ?? true;
    this.detectResourceConflicts = options.detectResourceConflicts ?? true;
    this.detectDependencyConflicts = options.detectDependencyConflicts ?? true;
    this.detectTemporalConflicts = options.detectTemporalConflicts ?? true;
    this.detectPolicyConflicts = options.detectPolicyConflicts ?? true;
    this.detectRegimeConflicts = options.detectRegimeConflicts ?? true;
    this.detectExecutionConflicts = options.detectExecutionConflicts ?? true;
    this.allowCompatibleMerges = options.allowCompatibleMerges ?? true;
    this.sequenceDependencies = options.sequenceDependencies ?? true;
    this.preferNoActionOnExactTie = options.preferNoActionOnExactTie ?? true;
    this.capitalTolerance = nonNegative(
      options.capitalTolerance ?? DEFAULT_TOLERANCE,
      "capitalTolerance",
    );
    this.riskBudgetTolerance = nonNegative(
      options.riskBudgetTolerance ?? DEFAULT_TOLERANCE,
      "riskBudgetTolerance",
    );
  }

  public resolve(
    input: DecisionConflictResolutionRequest,
  ): DecisionConflictResolutionResult {
    this.assertRequest(input);

    const sorted = [...input.candidates].sort(compareCandidates);
    const candidateById = new Map<string, ScoredDecisionCandidate>();
    const warnings: string[] = [];
    const rejected = new Set<string>();

    for (const candidate of sorted) {
      if (candidateById.has(candidate.candidateId)) {
        throw new ConflictResolutionError(
          `Duplicate candidateId: ${candidate.candidateId}`,
          "DUPLICATE_CANDIDATE_ID",
        );
      }
      candidateById.set(candidate.candidateId, candidate);

      if (this.rejectIneligibleCandidates && !candidate.eligible) {
        rejected.add(candidate.candidateId);
      }
    }

    if (sorted.length === 0) {
      warnings.push("No scored decision candidates were supplied.");
    }

    const descriptors = this.detectConflicts(
      sorted.filter((candidate) => !rejected.has(candidate.candidateId)),
      input.tolerance,
    );

    const accumulator: ResolutionAccumulator = {
      rejected,
      sequenced: new Map<string, number>(),
      conflicts: [],
      warnings,
    };

    descriptors.forEach((descriptor, index) => {
      this.resolveConflict(
        descriptor,
        candidateById,
        accumulator,
        input.requestId,
        index,
        input.tolerance,
      );
    });

    const remainingCandidates = sorted
      .filter((candidate) => !accumulator.rejected.has(candidate.candidateId))
      .sort((left, right) => {
        const leftSequence = accumulator.sequenced.get(left.candidateId) ?? 0;
        const rightSequence = accumulator.sequenced.get(right.candidateId) ?? 0;
        if (leftSequence !== rightSequence) {
          return leftSequence - rightSequence;
        }
        return compareCandidates(left, right);
      });

    const rejectedCandidateIds = [...accumulator.rejected].sort(compareText);

    if (sorted.length > 0 && remainingCandidates.length === 0) {
      accumulator.warnings.push(
        "All candidates were rejected during conflict resolution.",
      );
    }

    if (
      remainingCandidates.length > 1 &&
      remainingCandidates.some((candidate) => candidate.type === "NO_ACTION")
    ) {
      accumulator.warnings.push(
        "NO_ACTION remains alongside actionable candidates; plan optimization should choose one path.",
      );
    }

    return Object.freeze({
      requestId: input.requestId,
      generatedAt: input.generatedAt,
      conflicts: Object.freeze(accumulator.conflicts),
      remainingCandidates: Object.freeze(remainingCandidates),
      rejectedCandidateIds: Object.freeze(rejectedCandidateIds),
      warnings: Object.freeze(uniqueStrings(accumulator.warnings)),
    });
  }

  private detectConflicts(
    candidates: readonly ScoredDecisionCandidate[],
    tolerance: number,
  ): readonly ConflictDescriptor[] {
    const descriptors: ConflictDescriptor[] = [];
    const seenKeys = new Set<string>();

    const add = (descriptor: ConflictDescriptor): void => {
      const ids = [...descriptor.candidateIds].sort(compareText);
      const key = `${descriptor.type}:${ids.join("|")}`;
      if (seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      descriptors.push(
        Object.freeze({
          ...descriptor,
          candidateIds: Object.freeze(ids),
          metadata: Object.freeze({ ...descriptor.metadata }),
        }),
      );
    };

    if (this.detectDuplicateActions) {
      for (const group of groupBy(candidates, actionIdentity)) {
        if (group.length > 1) {
          add({
            type: "DUPLICATE_ACTION",
            candidateIds: group.map((candidate) => candidate.candidateId),
            severity: highestPriority(group),
            description: `Multiple candidates propose the same effective action: ${actionIdentity(group[0])}.`,
            recommendedResolution: this.allowCompatibleMerges
              ? "MERGE_ACTIONS"
              : "SELECT_HIGHER_UTILITY",
            metadata: {
              actionIdentity: actionIdentity(group[0]),
              candidateCount: group.length,
            },
          });
        }
      }
    }

    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const left = candidates[leftIndex];
        const right = candidates[rightIndex];

        if (this.detectExplicitMutualExclusions && explicitlyExclusive(left, right)) {
          add({
            type: "MUTUALLY_EXCLUSIVE_ACTIONS",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidates explicitly declare each other as mutually exclusive.",
            recommendedResolution: "SELECT_HIGHER_PRIORITY",
            metadata: { explicit: true },
          });
        }

        if (
          this.detectStrategyStateConflicts &&
          sameStrategy(left, right) &&
          strategyStateConflict(left.type, right.type)
        ) {
          add({
            type: "MUTUALLY_EXCLUSIVE_ACTIONS",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: `Conflicting lifecycle or operating-state actions target strategy ${left.strategyId}.`,
            recommendedResolution: "SELECT_HIGHER_PRIORITY",
            metadata: {
              strategyId: left.strategyId,
              leftType: left.type,
              rightType: right.type,
            },
          });
        }

        if (
          this.detectResourceConflicts &&
          samePortfolio(left, right) &&
          competingCapital(left, right, this.capitalTolerance + tolerance)
        ) {
          add({
            type: "COMPETING_CAPITAL",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidates compete for overlapping portfolio capital allocation.",
            recommendedResolution: "SELECT_HIGHER_UTILITY",
            metadata: {
              portfolioId: left.portfolioId,
              leftCapital: left.proposedCapital,
              rightCapital: right.proposedCapital,
              leftWeight: left.proposedWeight,
              rightWeight: right.proposedWeight,
            },
          });
        }

        if (
          this.detectResourceConflicts &&
          samePortfolio(left, right) &&
          competingRiskBudget(left, right, this.riskBudgetTolerance + tolerance)
        ) {
          add({
            type: "COMPETING_RISK_BUDGET",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidates compete for overlapping portfolio risk budget.",
            recommendedResolution: "SELECT_HIGHER_UTILITY",
            metadata: {
              portfolioId: left.portfolioId,
              leftRiskBudget: left.proposedRiskBudget,
              rightRiskBudget: right.proposedRiskBudget,
            },
          });
        }

        if (
          this.detectDependencyConflicts &&
          dependencyConflict(left, right)
        ) {
          add({
            type: "STRATEGY_DEPENDENCY",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "A candidate depends on another candidate that conflicts with its execution path.",
            recommendedResolution: this.sequenceDependencies
              ? "SEQUENCE_ACTIONS"
              : "SELECT_HIGHER_PRIORITY",
            metadata: {
              leftPrerequisites: left.prerequisites,
              rightPrerequisites: right.prerequisites,
            },
          });
        }

        if (
          this.detectTemporalConflicts &&
          temporalConflict(left, right, tolerance)
        ) {
          add({
            type: "TEMPORAL_CONFLICT",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidate execution windows or expirations are incompatible.",
            recommendedResolution: "SELECT_HIGHER_PRIORITY",
            metadata: {
              leftExpiresAt: left.expiresAt,
              rightExpiresAt: right.expiresAt,
            },
          });
        }

        if (
          this.detectPolicyConflicts &&
          policyConflict(left, right)
        ) {
          add({
            type: "POLICY_CONFLICT",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Enabled hard governance or risk constraints are incompatible.",
            recommendedResolution: "SELECT_HIGHER_PRIORITY",
            metadata: {
              leftHardConstraints: enabledHardConstraintNames(left),
              rightHardConstraints: enabledHardConstraintNames(right),
            },
          });
        }

        if (
          this.detectRegimeConflicts &&
          regimeConflict(left, right)
        ) {
          add({
            type: "REGIME_MISMATCH",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidates express materially conflicting regime alignment for the same strategy or market.",
            recommendedResolution: "SELECT_HIGHER_UTILITY",
            metadata: {
              leftRegimeAlignment: left.utility.regimeAlignmentUtility,
              rightRegimeAlignment: right.utility.regimeAlignmentUtility,
            },
          });
        }

        if (
          this.detectExecutionConflicts &&
          executionConflict(left, right)
        ) {
          add({
            type: "EXECUTION_CONFLICT",
            candidateIds: [left.candidateId, right.candidateId],
            severity: maxPriority(left.priority, right.priority),
            description: "Candidates require incompatible execution changes for the same target.",
            recommendedResolution: "SEQUENCE_ACTIONS",
            metadata: {
              leftType: left.type,
              rightType: right.type,
              strategyId: left.strategyId ?? right.strategyId,
              symbol: left.symbol ?? right.symbol,
            },
          });
        }
      }
    }

    return Object.freeze(
      descriptors.sort((left, right) => {
        const severity = priorityScore(right.severity) - priorityScore(left.severity);
        if (severity !== 0) {
          return severity;
        }
        const type = compareText(left.type, right.type);
        if (type !== 0) {
          return type;
        }
        return compareText(
          left.candidateIds.join("|"),
          right.candidateIds.join("|"),
        );
      }),
    );
  }

  private resolveConflict(
    descriptor: ConflictDescriptor,
    candidateById: ReadonlyMap<string, ScoredDecisionCandidate>,
    accumulator: ResolutionAccumulator,
    requestId: DecisionIntelligenceId,
    conflictIndex: number,
    tolerance: number,
  ): void {
    const candidates = descriptor.candidateIds
      .map((candidateId) => candidateById.get(candidateId))
      .filter(
        (candidate): candidate is ScoredDecisionCandidate =>
          candidate !== undefined &&
          !accumulator.rejected.has(candidate.candidateId),
      );

    if (candidates.length < 2) {
      return;
    }

    const resolution = this.chooseResolution(descriptor, candidates, tolerance);
    let selected: readonly ScoredDecisionCandidate[] = [];
    let rejected: readonly ScoredDecisionCandidate[] = [];
    let sequenced: readonly ScoredDecisionCandidate[] = [];
    const rationale: string[] = [];

    switch (resolution) {
      case "MERGE_ACTIONS": {
        const winner = this.selectWinner(candidates, tolerance);
        selected = [winner];
        rejected = candidates.filter(
          (candidate) => candidate.candidateId !== winner.candidateId,
        );
        rationale.push(
          `Equivalent actions were consolidated into candidate ${winner.candidateId}.`,
        );
        break;
      }

      case "SEQUENCE_ACTIONS": {
        sequenced = this.sequenceCandidates(candidates);
        selected = sequenced;
        sequenced.forEach((candidate, index) => {
          const existing = accumulator.sequenced.get(candidate.candidateId) ?? 0;
          accumulator.sequenced.set(
            candidate.candidateId,
            Math.max(existing, index + 1),
          );
        });
        rationale.push(
          "Candidates were retained and assigned a deterministic execution order.",
        );
        break;
      }

      case "REDUCE_SCOPE":
      case "SELECT_HIGHER_PRIORITY":
      case "SELECT_HIGHER_UTILITY": {
        const winner = this.selectWinner(candidates, tolerance);
        selected = [winner];
        rejected = candidates.filter(
          (candidate) => candidate.candidateId !== winner.candidateId,
        );
        rationale.push(
          `Candidate ${winner.candidateId} was selected using priority, score, confidence and stable-id ordering.`,
        );
        break;
      }

      case "DEFER_ALL": {
        selected = candidates;
        rationale.push(
          "All candidates were retained for downstream governance or optimization deferral.",
        );
        accumulator.warnings.push(
          `Conflict ${descriptor.type} was deferred for candidates ${descriptor.candidateIds.join(", ")}.`,
        );
        break;
      }

      case "REJECT_ALL": {
        rejected = candidates;
        rationale.push("All conflicting candidates were rejected.");
        break;
      }

      default: {
        const exhaustive: never = resolution;
        throw new ConflictResolutionError(
          `Unsupported conflict resolution: ${String(exhaustive)}`,
          "UNSUPPORTED_RESOLUTION",
        );
      }
    }

    for (const candidate of rejected) {
      accumulator.rejected.add(candidate.candidateId);
    }

    const conflictId = deterministicConflictId(
      requestId,
      descriptor.type,
      descriptor.candidateIds,
      conflictIndex,
    );

    const conflict: ResolvedDecisionConflict = Object.freeze({
      conflictId,
      type: descriptor.type,
      candidateIds: Object.freeze([...descriptor.candidateIds]),
      severity: descriptor.severity,
      description: descriptor.description,
      recommendedResolution: descriptor.recommendedResolution,
      metadata: Object.freeze({ ...descriptor.metadata }),
      resolution,
      selectedCandidateIds: Object.freeze(
        selected.map((candidate) => candidate.candidateId),
      ),
      rejectedCandidateIds: Object.freeze(
        rejected.map((candidate) => candidate.candidateId),
      ),
      sequencedCandidateIds: Object.freeze(
        sequenced.map((candidate) => candidate.candidateId),
      ),
      rationale: Object.freeze(rationale),
    });

    accumulator.conflicts.push(conflict);
  }

  private chooseResolution(
    descriptor: ConflictDescriptor,
    candidates: readonly ScoredDecisionCandidate[],
    tolerance: number,
  ): DecisionConflictResolution {
    if (descriptor.recommendedResolution === "MERGE_ACTIONS") {
      return this.allowCompatibleMerges
        ? "MERGE_ACTIONS"
        : "SELECT_HIGHER_UTILITY";
    }

    if (
      descriptor.recommendedResolution === "SEQUENCE_ACTIONS" &&
      this.sequenceDependencies
    ) {
      return "SEQUENCE_ACTIONS";
    }

    const priorities = new Set(candidates.map((candidate) => candidate.priority));
    if (priorities.size > 1) {
      return "SELECT_HIGHER_PRIORITY";
    }

    const scores = candidates.map((candidate) => candidate.finalScore);
    if (Math.max(...scores) - Math.min(...scores) > tolerance + EPSILON) {
      return "SELECT_HIGHER_UTILITY";
    }

    return descriptor.recommendedResolution;
  }

  private selectWinner(
    candidates: readonly ScoredDecisionCandidate[],
    tolerance: number,
  ): ScoredDecisionCandidate {
    return [...candidates].sort((left, right) => {
      const priorityDelta =
        priorityScore(right.priority) - priorityScore(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const scoreDelta = right.finalScore - left.finalScore;
      if (Math.abs(scoreDelta) > tolerance + EPSILON) {
        return scoreDelta;
      }

      const confidenceDelta = right.confidence.score - left.confidence.score;
      if (Math.abs(confidenceDelta) > tolerance + EPSILON) {
        return confidenceDelta;
      }

      if (this.preferNoActionOnExactTie) {
        if (left.type === "NO_ACTION" && right.type !== "NO_ACTION") {
          return -1;
        }
        if (right.type === "NO_ACTION" && left.type !== "NO_ACTION") {
          return 1;
        }
      }

      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return compareText(left.candidateId, right.candidateId);
    })[0];
  }

  private sequenceCandidates(
    candidates: readonly ScoredDecisionCandidate[],
  ): readonly ScoredDecisionCandidate[] {
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate] as const),
    );
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const ordered: ScoredDecisionCandidate[] = [];

    const visit = (candidate: ScoredDecisionCandidate): void => {
      if (visited.has(candidate.candidateId)) {
        return;
      }
      if (visiting.has(candidate.candidateId)) {
        return;
      }

      visiting.add(candidate.candidateId);
      for (const prerequisiteId of candidate.prerequisites) {
        const prerequisite = candidateById.get(prerequisiteId);
        if (prerequisite !== undefined) {
          visit(prerequisite);
        }
      }
      visiting.delete(candidate.candidateId);
      visited.add(candidate.candidateId);
      ordered.push(candidate);
    };

    [...candidates].sort(compareCandidates).forEach(visit);
    return Object.freeze(ordered);
  }

  private assertRequest(input: DecisionConflictResolutionRequest): void {
    if (input === null || typeof input !== "object") {
      throw new ConflictResolutionError(
        "Conflict resolution request is required.",
        "INVALID_REQUEST",
      );
    }

    nonEmpty(input.requestId, "requestId");
    validTimestamp(input.generatedAt, "generatedAt");

    if (!Array.isArray(input.candidates)) {
      throw new ConflictResolutionError(
        "candidates must be an array.",
        "INVALID_CANDIDATES",
      );
    }

    nonNegative(input.tolerance, "tolerance");

    for (const candidate of input.candidates) {
      nonEmpty(candidate.candidateId, "candidate.candidateId");
      finite(candidate.finalScore, `candidate[${candidate.candidateId}].finalScore`);
      finite(candidate.grossScore, `candidate[${candidate.candidateId}].grossScore`);
      finite(
        candidate.penaltyScore,
        `candidate[${candidate.candidateId}].penaltyScore`,
      );
      positiveInteger(candidate.rank, `candidate[${candidate.candidateId}].rank`);
    }
  }
}

function actionIdentity(candidate: ScoredDecisionCandidate): string {
  return [
    candidate.type,
    candidate.portfolioId,
    candidate.strategyId ?? "",
    candidate.replacementStrategyId ?? "",
    candidate.symbol ?? "",
    candidate.timeframe ?? "",
    normalizedOptional(candidate.proposedWeight),
    normalizedOptional(candidate.proposedCapital),
    normalizedOptional(candidate.proposedRiskBudget),
    candidate.proposedOperatingMode ?? "",
    stableRecord(candidate.proposedParameters),
  ].join("::");
}

function explicitlyExclusive(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  return (
    left.mutuallyExclusiveWith.includes(right.candidateId) ||
    right.mutuallyExclusiveWith.includes(left.candidateId)
  );
}

function samePortfolio(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  return left.portfolioId === right.portfolioId;
}

function sameStrategy(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  return (
    left.strategyId !== undefined &&
    right.strategyId !== undefined &&
    left.strategyId === right.strategyId
  );
}

function strategyStateConflict(
  left: DecisionCandidateType,
  right: DecisionCandidateType,
): boolean {
  const opposites: readonly (readonly [DecisionCandidateType, DecisionCandidateType])[] = [
    ["ACTIVATE_STRATEGY", "DEACTIVATE_STRATEGY"],
    ["ACTIVATE_STRATEGY", "PAUSE_STRATEGY"],
    ["RESUME_STRATEGY", "PAUSE_STRATEGY"],
    ["RESUME_STRATEGY", "DEACTIVATE_STRATEGY"],
    ["PROMOTE_STRATEGY", "DEMOTE_STRATEGY"],
    ["PROMOTE_STRATEGY", "RETIRE_STRATEGY"],
    ["DEMOTE_STRATEGY", "RETIRE_STRATEGY"],
    ["INCREASE_EXPOSURE", "REDUCE_EXPOSURE"],
    ["INCREASE_EXPOSURE", "DEACTIVATE_STRATEGY"],
    ["INCREASE_EXPOSURE", "PAUSE_STRATEGY"],
    ["EVOLVE_STRATEGY", "RETIRE_STRATEGY"],
    ["CHANGE_PARAMETERS", "RETIRE_STRATEGY"],
  ];

  return opposites.some(
    ([first, second]) =>
      (left === first && right === second) ||
      (left === second && right === first),
  );
}

function competingCapital(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
  tolerance: number,
): boolean {
  if (
    left.proposedCapital !== undefined &&
    right.proposedCapital !== undefined &&
    left.proposedCapital > tolerance &&
    right.proposedCapital > tolerance &&
    sameAllocationTarget(left, right)
  ) {
    return Math.abs(left.proposedCapital - right.proposedCapital) > tolerance;
  }

  if (
    left.proposedWeight !== undefined &&
    right.proposedWeight !== undefined &&
    sameAllocationTarget(left, right)
  ) {
    return Math.abs(left.proposedWeight - right.proposedWeight) > tolerance;
  }

  return false;
}

function competingRiskBudget(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
  tolerance: number,
): boolean {
  return (
    left.proposedRiskBudget !== undefined &&
    right.proposedRiskBudget !== undefined &&
    sameAllocationTarget(left, right) &&
    Math.abs(left.proposedRiskBudget - right.proposedRiskBudget) > tolerance
  );
}

function sameAllocationTarget(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  return (
    left.portfolioId === right.portfolioId &&
    (left.strategyId ?? "") === (right.strategyId ?? "") &&
    (left.symbol ?? "") === (right.symbol ?? "")
  );
}

function dependencyConflict(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  const leftDependsOnRight = left.prerequisites.includes(right.candidateId);
  const rightDependsOnLeft = right.prerequisites.includes(left.candidateId);

  if (leftDependsOnRight && rightDependsOnLeft) {
    return true;
  }

  return (
    (leftDependsOnRight || rightDependsOnLeft) &&
    (explicitlyExclusive(left, right) ||
      (sameStrategy(left, right) && strategyStateConflict(left.type, right.type)))
  );
}

function temporalConflict(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
  tolerance: number,
): boolean {
  if (!sameAllocationTarget(left, right) && !sameStrategy(left, right)) {
    return false;
  }

  if (left.expiresAt === undefined || right.expiresAt === undefined) {
    return false;
  }

  const leftExpiry = Date.parse(left.expiresAt);
  const rightExpiry = Date.parse(right.expiresAt);
  if (!Number.isFinite(leftExpiry) || !Number.isFinite(rightExpiry)) {
    return false;
  }

  return Math.abs(leftExpiry - rightExpiry) <= tolerance;
}

function policyConflict(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  const leftHard = left.constraints.filter(
    (constraint) => constraint.enabled && constraint.type === "HARD",
  );
  const rightHard = right.constraints.filter(
    (constraint) => constraint.enabled && constraint.type === "HARD",
  );

  for (const leftConstraint of leftHard) {
    for (const rightConstraint of rightHard) {
      if (
        leftConstraint.scope === rightConstraint.scope &&
        leftConstraint.name === rightConstraint.name &&
        !compatibleExpectedValues(
          leftConstraint.expectedValue,
          rightConstraint.expectedValue,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function regimeConflict(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  const sameTarget =
    sameStrategy(left, right) ||
    (left.symbol !== undefined &&
      left.symbol === right.symbol &&
      left.timeframe === right.timeframe);

  if (!sameTarget) {
    return false;
  }

  return (
    Math.abs(
      left.utility.regimeAlignmentUtility -
        right.utility.regimeAlignmentUtility,
    ) >= 0.65 &&
    oneIsDefensive(left.type, right.type)
  );
}

function executionConflict(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): boolean {
  if (!sameAllocationTarget(left, right) && !sameStrategy(left, right)) {
    return false;
  }

  const executionTypes = new Set<DecisionCandidateType>([
    "REBALANCE_PORTFOLIO",
    "REDUCE_EXPOSURE",
    "INCREASE_EXPOSURE",
    "REDUCE_EXPOSURE",
    "ACTIVATE_STRATEGY",
    "DEACTIVATE_STRATEGY",
    "PAUSE_STRATEGY",
    "RESUME_STRATEGY",
  ]);

  return (
    executionTypes.has(left.type) &&
    executionTypes.has(right.type) &&
    left.type !== right.type &&
    !strategyStateConflict(left.type, right.type)
  );
}

function oneIsDefensive(
  left: DecisionCandidateType,
  right: DecisionCandidateType,
): boolean {
  const defensive = new Set<DecisionCandidateType>([
    "PAUSE_STRATEGY",
    "DEACTIVATE_STRATEGY",
    "DEMOTE_STRATEGY",
    "RETIRE_STRATEGY",
    "REDUCE_EXPOSURE",
    "REDUCE_EXPOSURE",
    "NO_ACTION",
  ]);
  return defensive.has(left) !== defensive.has(right);
}

function enabledHardConstraintNames(
  candidate: ScoredDecisionCandidate,
): readonly string[] {
  return Object.freeze(
    candidate.constraints
      .filter((constraint) => constraint.enabled && constraint.type === "HARD")
      .map((constraint) => constraint.name)
      .sort(compareText),
  );
}

function compatibleExpectedValues(
  left: number | string | boolean | undefined,
  right: number | string | boolean | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return true;
  }
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) <= EPSILON;
  }
  return left === right;
}

function highestPriority(
  candidates: readonly ScoredDecisionCandidate[],
): DecisionPriority {
  return [...candidates]
    .map((candidate) => candidate.priority)
    .sort((left, right) => priorityScore(right) - priorityScore(left))[0];
}

function maxPriority(
  left: DecisionPriority,
  right: DecisionPriority,
): DecisionPriority {
  return priorityScore(left) >= priorityScore(right) ? left : right;
}

function priorityScore(priority: DecisionPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 5;
    case "VERY_HIGH":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default: {
      const exhaustive: never = priority;
      return exhaustive;
    }
  }
}

function compareCandidates(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): number {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }

  const priorityDelta =
    priorityScore(right.priority) - priorityScore(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const scoreDelta = right.finalScore - left.finalScore;
  if (Math.abs(scoreDelta) > EPSILON) {
    return scoreDelta;
  }

  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return compareText(left.candidateId, right.candidateId);
}

function deterministicConflictId(
  requestId: DecisionIntelligenceId,
  type: DecisionConflictType,
  candidateIds: readonly DecisionIntelligenceId[],
  index: number,
): DecisionIntelligenceId {
  const seed = `${requestId}|${type}|${[...candidateIds]
    .sort(compareText)
    .join("|")}|${index}`;
  return `decision-conflict-${hash(seed)}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36).padStart(7, "0");
}

function groupBy<T>(
  values: readonly T[],
  keySelector: (value: T) => string,
): readonly (readonly T[])[] {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keySelector(value);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [value]);
    } else {
      existing.push(value);
    }
  }
  return Object.freeze(
    [...groups.values()].map((group) => Object.freeze(group)),
  );
}

function stableRecord(
  record: Readonly<Record<string, number | string | boolean>> | undefined,
): string {
  if (record === undefined) {
    return "";
  }
  return Object.keys(record)
    .sort(compareText)
    .map((key) => `${key}=${String(record[key])}`)
    .join("&");
}

function normalizedOptional(value: number | undefined): string {
  return value === undefined ? "" : value.toFixed(12);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConflictResolutionError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING",
    );
  }
  return value;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new ConflictResolutionError(
      `${name} must be finite.`,
      "INVALID_NUMBER",
    );
  }
  return value;
}

function nonNegative(value: number, name: string): number {
  finite(value, name);
  if (value < 0) {
    throw new ConflictResolutionError(
      `${name} must be non-negative.`,
      "INVALID_NUMBER",
    );
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConflictResolutionError(
      `${name} must be a positive integer.`,
      "INVALID_INTEGER",
    );
  }
  return value;
}

function validTimestamp(value: string, name: string): string {
  nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new ConflictResolutionError(
      `${name} must be a valid ISO timestamp.`,
      "INVALID_TIMESTAMP",
    );
  }
  return value;
}