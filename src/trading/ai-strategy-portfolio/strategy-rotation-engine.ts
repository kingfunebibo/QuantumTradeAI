import type { UnixTimestampMilliseconds } from "../strategy-framework/strategy-contracts";
/**
 * QuantumTradeAI
 * Milestone 33 â€” AI Trading Strategy Portfolio & Autonomous Strategy Allocation
 *
 * File:
 * src/trading/ai-strategy-portfolio/strategy-rotation-engine.ts
 *
 * Purpose:
 * Produces deterministic, immutable lifecycle instructions that transition the
 * currently active strategy portfolio toward a validated target allocation.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
} from "../strategy-framework/strategy-contracts";
import {
  AI_STRATEGY_PORTFOLIO_BASIS_POINTS_PER_UNIT,
  type AiStrategyAllocationResult,
  type AiStrategyCandidate,
  type AiStrategyCandidateId,
  type AiStrategyLifecycleAction,
  type AiStrategyRotationEnginePort,
  type AiStrategyRotationInstruction,
  type AiStrategyRotationPlan,
  type AiStrategyRotationPolicy,
  type AiStrategyRotationReason,
  type AiStrategyTargetAllocation,
  type AiStrategyPortfolioId,
  type AiStrategyPortfolioRunId,
} from "./ai-strategy-portfolio-contracts";

export interface StrategyRotationEngineOptions {
  readonly numericalPrecision?: number;
  readonly activationWeightThreshold?: number;
  readonly deactivationWeightThreshold?: number;
  readonly immediateRiskReductionThreshold?: number;
  readonly defaultReason?: AiStrategyRotationReason;
  readonly metadata?: StrategyMetadata;
}

interface NormalizedOptions {
  readonly numericalPrecision: number;
  readonly activationWeightThreshold: number;
  readonly deactivationWeightThreshold: number;
  readonly immediateRiskReductionThreshold: number;
  readonly defaultReason: AiStrategyRotationReason;
  readonly metadata: StrategyMetadata;
}

interface RotationCandidate {
  readonly candidate: AiStrategyCandidate;
  readonly allocation: AiStrategyTargetAllocation;
  readonly action: AiStrategyLifecycleAction;
  readonly reason: AiStrategyRotationReason;
  readonly absoluteWeightChange: number;
  readonly turnoverContribution: number;
  readonly priority: number;
  readonly riskReducing: boolean;
  readonly explanation: string;
}

const DEFAULT_PRECISION = 12;
const DEFAULT_ACTIVATION_WEIGHT_THRESHOLD = 1e-8;
const DEFAULT_DEACTIVATION_WEIGHT_THRESHOLD = 1e-8;
const DEFAULT_IMMEDIATE_RISK_REDUCTION_THRESHOLD = 0.05;
const EPSILON = 1e-12;

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
}

function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`${field} must be greater than or equal to zero.`);
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFinite(value, field);
  if (value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1.`);
  }
}

function freezeMetadata(value: object): StrategyMetadata {
  return Object.freeze(value) as unknown as StrategyMetadata;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createRotationId(
  runId: AiStrategyPortfolioRunId,
  portfolioId: AiStrategyPortfolioId,
  timestamp: UnixTimestampMilliseconds,
): string {
  return `rotation:${stableHash(`${runId}|${portfolioId}|${timestamp}`)}`;
}

function isDeterministicFallback(candidate: AiStrategyCandidate): boolean {
  return (
    candidate.classification.intelligenceType === "DETERMINISTIC_RULE_BASED" ||
    candidate.classification.intelligenceType === "DETERMINISTIC_ARBITRAGE"
  );
}

function candidateMap(
  candidates: readonly AiStrategyCandidate[],
): ReadonlyMap<AiStrategyCandidateId, AiStrategyCandidate> {
  const result = new Map<AiStrategyCandidateId, AiStrategyCandidate>();

  for (const candidate of candidates) {
    const id = candidate.identity.candidateId;
    if (result.has(id)) {
      throw new Error(`Duplicate strategy candidate '${id}'.`);
    }
    result.set(id, candidate);
  }

  return result;
}

function validatePolicy(policy: AiStrategyRotationPolicy): void {
  assertNonNegative(
    policy.minimumTimeBetweenRotationsMilliseconds,
    "policy.minimumTimeBetweenRotationsMilliseconds",
  );
  assertNonNegative(
    policy.minimumWeightChangeBps,
    "policy.minimumWeightChangeBps",
  );
  assertUnitInterval(
    policy.maximumRotationTurnover,
    "policy.maximumRotationTurnover",
  );

  if (!Number.isInteger(policy.maximumInstructionsPerRun)) {
    throw new Error("policy.maximumInstructionsPerRun must be an integer.");
  }
  if (policy.maximumInstructionsPerRun < 0) {
    throw new Error(
      "policy.maximumInstructionsPerRun must be greater than or equal to zero.",
    );
  }
}

function validateAllocation(allocation: AiStrategyAllocationResult): void {
  assertUnitInterval(
    allocation.expectedTurnover,
    "allocation.expectedTurnover",
  );

  const ids = new Set<string>();
  for (const target of allocation.allocations) {
    if (ids.has(target.candidateId)) {
      throw new Error(
        `Duplicate target allocation '${target.candidateId}'.`,
      );
    }
    ids.add(target.candidateId);

    assertUnitInterval(target.currentWeight, "target.currentWeight");
    assertUnitInterval(target.targetWeight, "target.targetWeight");
    assertFinite(target.weightChange, "target.weightChange");
    assertFinite(target.capitalChange, "target.capitalChange");
  }
}

function resolveAction(
  allocation: AiStrategyTargetAllocation,
  options: NormalizedOptions,
): AiStrategyLifecycleAction {
  const currentlyActive =
    allocation.currentWeight > options.deactivationWeightThreshold;
  const targetActive =
    allocation.targetWeight > options.activationWeightThreshold;

  if (!currentlyActive && targetActive) {
    return "START";
  }
  if (currentlyActive && !targetActive) {
    return "STOP";
  }
  if (currentlyActive && targetActive) {
    return "NO_CHANGE";
  }
  return "NO_CHANGE";
}

function inferReason(
  allocation: AiStrategyTargetAllocation,
  forceRebalance: boolean,
  options: NormalizedOptions,
): AiStrategyRotationReason {
  const reasons = allocation.reasons.map((value) => value.toUpperCase());

  if (reasons.some((value) => value.includes("REGIME"))) {
    return "REGIME_CHANGE";
  }
  if (reasons.some((value) => value.includes("DRAWDOWN"))) {
    return "DRAWDOWN_LIMIT";
  }
  if (reasons.some((value) => value.includes("CORRELATION"))) {
    return "CORRELATION_SPIKE";
  }
  if (reasons.some((value) => value.includes("CAPACITY"))) {
    return "CAPACITY_LIMIT";
  }
  if (
    reasons.some(
      (value) =>
        value.includes("OPERATIONAL") ||
        value.includes("CIRCUIT") ||
        value.includes("KILL SWITCH"),
    )
  ) {
    return "OPERATIONAL_FAILURE";
  }
  if (
    reasons.some(
      (value) =>
        value.includes("CONFIDENCE") || value.includes("MODEL"),
    )
  ) {
    return "MODEL_CONFIDENCE_CHANGE";
  }
  if (
    reasons.some(
      (value) =>
        value.includes("PERFORMANCE") || value.includes("SCORE"),
    )
  ) {
    return "PERFORMANCE_DECAY";
  }
  if (allocation.currentWeight <= EPSILON && allocation.targetWeight > EPSILON) {
    return "NEW_STRATEGY_PROMOTION";
  }
  if (forceRebalance) {
    return "MANUAL_OVERRIDE";
  }
  return options.defaultReason;
}

function reasonPriority(reason: AiStrategyRotationReason): number {
  switch (reason) {
    case "OPERATIONAL_FAILURE":
      return 1_000;
    case "RISK_LIMIT":
      return 950;
    case "DRAWDOWN_LIMIT":
      return 900;
    case "CORRELATION_SPIKE":
      return 850;
    case "CAPACITY_LIMIT":
      return 800;
    case "REGIME_CHANGE":
      return 700;
    case "PERFORMANCE_DECAY":
      return 650;
    case "MODEL_CONFIDENCE_CHANGE":
      return 600;
    case "NEW_STRATEGY_PROMOTION":
      return 500;
    case "MANUAL_OVERRIDE":
      return 450;
    case "SCHEDULED_REBALANCE":
      return 400;
  }
}

function buildExplanation(
  allocation: AiStrategyTargetAllocation,
  action: AiStrategyLifecycleAction,
  reason: AiStrategyRotationReason,
): string {
  const from = allocation.currentWeight.toFixed(6);
  const to = allocation.targetWeight.toFixed(6);
  const evidence = allocation.reasons.length
    ? ` Evidence: ${allocation.reasons.join("; ")}.`
    : "";

  if (action === "START") {
    return `Start strategy and move allocation from ${from} to ${to} because of ${reason}.${evidence}`;
  }
  if (action === "STOP") {
    return `Stop strategy and move allocation from ${from} to ${to} because of ${reason}.${evidence}`;
  }
  return `Rebalance strategy allocation from ${from} to ${to} because of ${reason}.${evidence}`;
}

function createRotationCandidate(
  candidate: AiStrategyCandidate,
  allocation: AiStrategyTargetAllocation,
  forceRebalance: boolean,
  options: NormalizedOptions,
): RotationCandidate {
  const action = resolveAction(allocation, options);
  const reason = inferReason(allocation, forceRebalance, options);
  const absoluteWeightChange = Math.abs(
    allocation.targetWeight - allocation.currentWeight,
  );
  const riskReducing = allocation.targetWeight < allocation.currentWeight;
  const priority =
    reasonPriority(reason) +
    Math.round(absoluteWeightChange * 10_000) +
    (riskReducing ? 100 : 0);

  return Object.freeze({
    candidate,
    allocation,
    action,
    reason,
    absoluteWeightChange,
    turnoverContribution: absoluteWeightChange,
    priority,
    riskReducing,
    explanation: buildExplanation(allocation, action, reason),
  });
}

function sortRotationCandidates(
  left: RotationCandidate,
  right: RotationCandidate,
): number {
  if (left.riskReducing !== right.riskReducing) {
    return left.riskReducing ? -1 : 1;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  if (left.absoluteWeightChange !== right.absoluteWeightChange) {
    return right.absoluteWeightChange - left.absoluteWeightChange;
  }
  return compareText(
    left.candidate.identity.candidateId,
    right.candidate.identity.candidateId,
  );
}

function choosePlanReason(
  rotations: readonly RotationCandidate[],
  forceRebalance: boolean,
  options: NormalizedOptions,
): AiStrategyRotationReason {
  if (rotations.length === 0) {
    return forceRebalance ? "MANUAL_OVERRIDE" : options.defaultReason;
  }
  return [...rotations].sort(sortRotationCandidates)[0].reason;
}

export class StrategyRotationEngine
  implements AiStrategyRotationEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(options: StrategyRotationEngineOptions = {}) {
    const precision = options.numericalPrecision ?? DEFAULT_PRECISION;
    if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
      throw new Error("numericalPrecision must be an integer from 0 to 15.");
    }

    const activationWeightThreshold =
      options.activationWeightThreshold ??
      DEFAULT_ACTIVATION_WEIGHT_THRESHOLD;
    const deactivationWeightThreshold =
      options.deactivationWeightThreshold ??
      DEFAULT_DEACTIVATION_WEIGHT_THRESHOLD;
    const immediateRiskReductionThreshold =
      options.immediateRiskReductionThreshold ??
      DEFAULT_IMMEDIATE_RISK_REDUCTION_THRESHOLD;

    assertUnitInterval(
      activationWeightThreshold,
      "activationWeightThreshold",
    );
    assertUnitInterval(
      deactivationWeightThreshold,
      "deactivationWeightThreshold",
    );
    assertUnitInterval(
      immediateRiskReductionThreshold,
      "immediateRiskReductionThreshold",
    );

    this.options = Object.freeze({
      numericalPrecision: precision,
      activationWeightThreshold,
      deactivationWeightThreshold,
      immediateRiskReductionThreshold,
      defaultReason: options.defaultReason ?? "SCHEDULED_REBALANCE",
      metadata: options.metadata ?? EMPTY_STRATEGY_METADATA,
    });
  }

  public plan(
    runId: AiStrategyPortfolioRunId,
    portfolioId: AiStrategyPortfolioId,
    timestamp: UnixTimestampMilliseconds,
    allocation: AiStrategyAllocationResult,
    candidates: readonly AiStrategyCandidate[],
    policy: AiStrategyRotationPolicy,
    forceRebalance: boolean,
  ): AiStrategyRotationPlan {
    if (!runId.trim()) {
      throw new Error("runId must not be empty.");
    }
    if (!portfolioId.trim()) {
      throw new Error("portfolioId must not be empty.");
    }
    assertNonNegative(timestamp, "timestamp");
    validatePolicy(policy);
    validateAllocation(allocation);

    if (allocation.runId !== runId) {
      throw new Error("allocation.runId must equal runId.");
    }
    if (allocation.portfolioId !== portfolioId) {
      throw new Error("allocation.portfolioId must equal portfolioId.");
    }

    const byId = candidateMap(candidates);
    const minimumChange =
      policy.minimumWeightChangeBps /
      AI_STRATEGY_PORTFOLIO_BASIS_POINTS_PER_UNIT;

    const warnings: string[] = [];
    const proposed: RotationCandidate[] = [];

    for (const target of allocation.allocations) {
      const candidate = byId.get(target.candidateId);
      if (!candidate) {
        throw new Error(
          `Target allocation references unknown candidate '${target.candidateId}'.`,
        );
      }

      const rotation = createRotationCandidate(
        candidate,
        target,
        forceRebalance,
        this.options,
      );

      const meaningfulChange =
        rotation.absoluteWeightChange + EPSILON >= minimumChange;
      const immediateRiskReduction =
        policy.allowImmediateRiskReduction &&
        rotation.riskReducing &&
        rotation.absoluteWeightChange >=
          this.options.immediateRiskReductionThreshold;

      if (forceRebalance || meaningfulChange || immediateRiskReduction) {
        proposed.push(rotation);
      }
    }

    proposed.sort(sortRotationCandidates);

    const selected: RotationCandidate[] = [];
    let turnover = 0;

    for (const rotation of proposed) {
      if (selected.length >= policy.maximumInstructionsPerRun) {
        warnings.push(
          `Instruction limit ${policy.maximumInstructionsPerRun} reached; remaining rotations were deferred.`,
        );
        break;
      }

      const nextTurnover = turnover + rotation.turnoverContribution;
      const bypassTurnoverLimit =
        policy.allowImmediateRiskReduction && rotation.riskReducing;

      if (
        !bypassTurnoverLimit &&
        nextTurnover > policy.maximumRotationTurnover + EPSILON
      ) {
        warnings.push(
          `Rotation for '${rotation.candidate.identity.candidateId}' was deferred because it would exceed maximum turnover.`,
        );
        continue;
      }

      selected.push(rotation);
      turnover = nextTurnover;
    }

    if (policy.preserveDeterministicFallback) {
      const deterministicTargets = allocation.allocations.filter((target) => {
        const candidate = byId.get(target.candidateId);
        return candidate !== undefined && isDeterministicFallback(candidate);
      });
      const preservesFallback = deterministicTargets.some(
        (target) => target.targetWeight > this.options.activationWeightThreshold,
      );

      if (!preservesFallback) {
        warnings.push(
          "Target allocation does not preserve an active deterministic fallback strategy.",
        );
      }
    }

    const effectiveAt = timestamp;
    const instructions = selected.map(
      (rotation, index): AiStrategyRotationInstruction => {
        const target = rotation.allocation;
        return Object.freeze({
          candidateId: rotation.candidate.identity.candidateId,
          strategyId: rotation.candidate.identity.strategyId,
          strategyInstanceId:
            rotation.candidate.identity.strategyInstanceId,
          action: rotation.action,
          fromWeight: round(
            target.currentWeight,
            this.options.numericalPrecision,
          ),
          toWeight: round(
            target.targetWeight,
            this.options.numericalPrecision,
          ),
          capitalDelta: round(
            target.capitalChange,
            this.options.numericalPrecision,
          ),
          priority: index + 1,
          reason: rotation.reason,
          explanation: rotation.explanation,
          effectiveAt,
          metadata: freezeMetadata({
            absoluteWeightChange: round(
              rotation.absoluteWeightChange,
              this.options.numericalPrecision,
            ),
            turnoverContribution: round(
              rotation.turnoverContribution,
              this.options.numericalPrecision,
            ),
            riskReducing: rotation.riskReducing,
            allocationScore: target.score,
            allocationConfidence: target.confidence,
          }),
        });
      },
    );

    const requiresApproval =
      policy.requireConfirmationForNewStrategies &&
      selected.some(
        (rotation) =>
          rotation.allocation.currentWeight <=
            this.options.deactivationWeightThreshold &&
          rotation.allocation.targetWeight >
            this.options.activationWeightThreshold,
      );

    const expectedTurnover = round(
      clampUnit(
        instructions.reduce(
          (sum, instruction) =>
            sum + Math.abs(instruction.toWeight - instruction.fromWeight),
          0,
        ),
      ),
      this.options.numericalPrecision,
    );

    return Object.freeze({
      rotationId: createRotationId(runId, portfolioId, timestamp),
      runId,
      portfolioId,
      createdAt: timestamp,
      effectiveAt,
      reason: choosePlanReason(selected, forceRebalance, this.options),
      instructions: Object.freeze(instructions),
      expectedTurnover,
      requiresApproval,
      warnings: Object.freeze([...new Set(warnings)]),
      metadata: freezeMetadata({
        proposedInstructionCount: proposed.length,
        selectedInstructionCount: instructions.length,
        deferredInstructionCount: proposed.length - instructions.length,
        forceRebalance,
        minimumWeightChange: minimumChange,
        maximumRotationTurnover: policy.maximumRotationTurnover,
        allocationExpectedTurnover: allocation.expectedTurnover,
        engineMetadata: this.options.metadata,
      } as unknown as object),
    });
  }
}

export function createStrategyRotationEngine(
  options: StrategyRotationEngineOptions = {},
): StrategyRotationEngine {
  return new StrategyRotationEngine(options);
}
