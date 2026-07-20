/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 6: Autonomous consensus decision engine.
 *
 * Responsibilities:
 * - evaluate weighted multi-participant consensus
 * - support unanimous, quorum, weighted-majority, highest-confidence,
 *   and risk-adjusted policies
 * - account for abstentions and participation ratios
 * - enforce quorum and approval thresholds
 * - detect conflicting high-confidence votes
 * - emit immutable and explainable consensus decisions
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousConsensusDecision,
  type AutonomousConsensusParticipant,
  type AutonomousConsensusPolicy,
  type AutonomousConsensusRequest,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingMetadata,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";

export interface AutonomousConsensusDecisionEngineOptions {
  readonly abstentionWeightFactor?: number;
  readonly riskEngineWeightMultiplier?: number;
  readonly portfolioEngineWeightMultiplier?: number;
  readonly regimeEngineWeightMultiplier?: number;
  readonly conflictConfidenceThreshold?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedConsensusDecisionEngineOptions {
  readonly abstentionWeightFactor: number;
  readonly riskEngineWeightMultiplier: number;
  readonly portfolioEngineWeightMultiplier: number;
  readonly regimeEngineWeightMultiplier: number;
  readonly conflictConfidenceThreshold: number;
  readonly numericalTolerance: number;
}

interface ParticipantEvaluation {
  readonly participant: AutonomousConsensusParticipant;
  readonly effectiveWeight: number;
  readonly confidenceWeightedWeight: number;
  readonly approvingWeight: number;
  readonly rejectingWeight: number;
  readonly participating: boolean;
}

interface PolicyEvaluation {
  readonly approved: boolean;
  readonly reason: string;
}

const DEFAULT_OPTIONS: Readonly<ResolvedConsensusDecisionEngineOptions> =
  Object.freeze({
    abstentionWeightFactor: 0,
    riskEngineWeightMultiplier: 1.25,
    portfolioEngineWeightMultiplier: 1.10,
    regimeEngineWeightMultiplier: 1.05,
    conflictConfidenceThreshold: 0.80,
    numericalTolerance: 1e-9,
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

function freezeParticipant(
  participant: AutonomousConsensusParticipant,
): AutonomousConsensusParticipant {
  return Object.freeze({
    ...participant,
    metadata: freezeMetadata(participant.metadata),
  });
}

function freezeDecision(
  decision: AutonomousConsensusDecision,
): AutonomousConsensusDecision {
  return Object.freeze({
    ...decision,
    participants: Object.freeze(
      decision.participants.map(freezeParticipant),
    ),
    metadata: freezeMetadata(decision.metadata),
  });
}

export class AutonomousConsensusDecisionEngine {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly options: ResolvedConsensusDecisionEngineOptions;
  private decisionSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousConsensusDecisionEngineOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    const resolved: ResolvedConsensusDecisionEngineOptions = {
      abstentionWeightFactor:
        options.abstentionWeightFactor ??
        DEFAULT_OPTIONS.abstentionWeightFactor,
      riskEngineWeightMultiplier:
        options.riskEngineWeightMultiplier ??
        DEFAULT_OPTIONS.riskEngineWeightMultiplier,
      portfolioEngineWeightMultiplier:
        options.portfolioEngineWeightMultiplier ??
        DEFAULT_OPTIONS.portfolioEngineWeightMultiplier,
      regimeEngineWeightMultiplier:
        options.regimeEngineWeightMultiplier ??
        DEFAULT_OPTIONS.regimeEngineWeightMultiplier,
      conflictConfidenceThreshold:
        options.conflictConfidenceThreshold ??
        DEFAULT_OPTIONS.conflictConfidenceThreshold,
      numericalTolerance:
        options.numericalTolerance ??
        DEFAULT_OPTIONS.numericalTolerance,
    };

    assertProbability(
      resolved.abstentionWeightFactor,
      "abstentionWeightFactor",
    );
    assertNonNegativeFinite(
      resolved.riskEngineWeightMultiplier,
      "riskEngineWeightMultiplier",
    );
    assertNonNegativeFinite(
      resolved.portfolioEngineWeightMultiplier,
      "portfolioEngineWeightMultiplier",
    );
    assertNonNegativeFinite(
      resolved.regimeEngineWeightMultiplier,
      "regimeEngineWeightMultiplier",
    );
    assertProbability(
      resolved.conflictConfidenceThreshold,
      "conflictConfidenceThreshold",
    );

    if (
      !Number.isFinite(resolved.numericalTolerance) ||
      resolved.numericalTolerance <= 0
    ) {
      throw new RangeError(
        "numericalTolerance must be a positive finite number.",
      );
    }

    this.clock = clock;
    this.idFactory = idFactory;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public decide(
    request: AutonomousConsensusRequest,
  ): AutonomousConsensusDecision {
    const validation = this.validator.validateConsensusRequest(request);
    this.validator.assertValid(
      validation,
      "Consensus request is invalid.",
    );

    const decidedAt = this.clock.now();
    assertNonNegativeFinite(decidedAt, "clock.now()");

    const participants = Object.freeze(
      request.participants.map(freezeParticipant),
    );

    const evaluatedParticipants = participants.map((participant) =>
      this.evaluateParticipant(participant, request.policy),
    );

    const participantCount = participants.length;
    const participatingCount = evaluatedParticipants.filter(
      (evaluation) => evaluation.participating,
    ).length;

    const participationRatio =
      participantCount === 0
        ? 0
        : participatingCount / participantCount;

    const weightedApprovalScore = evaluatedParticipants.reduce(
      (sum, evaluation) => sum + evaluation.approvingWeight,
      0,
    );

    const weightedRejectionScore = evaluatedParticipants.reduce(
      (sum, evaluation) => sum + evaluation.rejectingWeight,
      0,
    );

    const totalDecisiveWeight =
      weightedApprovalScore + weightedRejectionScore;

    const approvalRatio =
      totalDecisiveWeight <= this.options.numericalTolerance
        ? 0
        : weightedApprovalScore / totalDecisiveWeight;

    const conflictDetected = this.detectHighConfidenceConflict(
      participants,
    );

    const quorumSatisfied =
      participatingCount >= request.requiredQuorum;

    const policyEvaluation = this.evaluatePolicy(
      request.policy,
      request,
      evaluatedParticipants,
      approvalRatio,
      participationRatio,
      quorumSatisfied,
      conflictDetected,
    );

    const approved =
      quorumSatisfied &&
      !conflictDetected &&
      approvalRatio + this.options.numericalTolerance >=
        request.requiredApprovalRatio &&
      policyEvaluation.approved;

    const reason = this.buildReason(
      request,
      approved,
      quorumSatisfied,
      conflictDetected,
      approvalRatio,
      participationRatio,
      policyEvaluation,
    );

    const decision = freezeDecision({
      decisionId: this.idFactory.create(
        "autonomous-consensus-decision",
        decidedAt,
        this.decisionSequence++,
      ),
      requestId: request.requestId,
      correlationId: request.correlationId,
      approved,
      approvalRatio: clampProbability(approvalRatio),
      participationRatio: clampProbability(participationRatio),
      weightedApprovalScore,
      weightedRejectionScore,
      reason,
      decidedAt,
      participants,
      metadata: freezeMetadata({
        policy: request.policy,
        participantCount,
        participatingCount,
        abstentionCount: participantCount - participatingCount,
        quorumSatisfied,
        conflictDetected,
        requiredApprovalRatio: request.requiredApprovalRatio,
        requiredQuorum: request.requiredQuorum,
        signalId: request.signal.signalId,
        strategyId: request.signal.strategyId,
      }),
    });

    const decisionValidation =
      this.validator.validateConsensusDecision(decision);
    this.validator.assertValid(
      decisionValidation,
      "Generated consensus decision is invalid.",
    );

    return decision;
  }

  private evaluateParticipant(
    participant: AutonomousConsensusParticipant,
    policy: AutonomousConsensusPolicy,
  ): ParticipantEvaluation {
    const typeMultiplier = this.resolveTypeMultiplier(
      participant,
      policy,
    );

    const effectiveWeight = participant.weight * typeMultiplier;
    const confidenceWeightedWeight =
      effectiveWeight * participant.confidence;

    const participating = participant.vote !== "ABSTAIN";

    let approvingWeight = 0;
    let rejectingWeight = 0;

    if (participant.vote === "APPROVE") {
      approvingWeight = confidenceWeightedWeight;
    } else if (participant.vote === "REJECT") {
      rejectingWeight = confidenceWeightedWeight;
    } else {
      const abstentionWeight =
        confidenceWeightedWeight *
        this.options.abstentionWeightFactor;

      approvingWeight = abstentionWeight / 2;
      rejectingWeight = abstentionWeight / 2;
    }

    return Object.freeze({
      participant,
      effectiveWeight,
      confidenceWeightedWeight,
      approvingWeight,
      rejectingWeight,
      participating,
    });
  }

  private resolveTypeMultiplier(
    participant: AutonomousConsensusParticipant,
    policy: AutonomousConsensusPolicy,
  ): number {
    if (policy !== "RISK_ADJUSTED") {
      return 1;
    }

    switch (participant.participantType) {
      case "RISK_ENGINE":
        return this.options.riskEngineWeightMultiplier;
      case "PORTFOLIO_ENGINE":
        return this.options.portfolioEngineWeightMultiplier;
      case "REGIME_ENGINE":
        return this.options.regimeEngineWeightMultiplier;
      case "MODEL":
      case "STRATEGY":
        return 1;
      default: {
        const exhaustiveCheck: never = participant.participantType;
        return exhaustiveCheck;
      }
    }
  }

  private evaluatePolicy(
    policy: AutonomousConsensusPolicy,
    request: AutonomousConsensusRequest,
    evaluations: readonly ParticipantEvaluation[],
    approvalRatio: number,
    participationRatio: number,
    quorumSatisfied: boolean,
    conflictDetected: boolean,
  ): PolicyEvaluation {
    if (!quorumSatisfied) {
      return Object.freeze({
        approved: false,
        reason: "Required participant quorum was not reached.",
      });
    }

    if (conflictDetected) {
      return Object.freeze({
        approved: false,
        reason:
          "Conflicting high-confidence approval and rejection votes were detected.",
      });
    }

    switch (policy) {
      case "WEIGHTED_MAJORITY":
        return Object.freeze({
          approved:
            approvalRatio >
            0.5 + this.options.numericalTolerance,
          reason:
            approvalRatio >
            0.5 + this.options.numericalTolerance
              ? "Weighted approval exceeded weighted rejection."
              : "Weighted approval did not exceed weighted rejection.",
        });

      case "UNANIMOUS": {
        const decisive = evaluations.filter(
          (evaluation) => evaluation.participating,
        );
        const unanimous =
          decisive.length >= request.requiredQuorum &&
          decisive.every(
            (evaluation) =>
              evaluation.participant.vote === "APPROVE",
          );

        return Object.freeze({
          approved: unanimous,
          reason: unanimous
            ? "All participating voters approved the signal."
            : "Unanimous approval was not achieved.",
        });
      }

      case "QUORUM": {
        const approvingCount = evaluations.filter(
          (evaluation) =>
            evaluation.participant.vote === "APPROVE",
        ).length;

        const approved =
          approvingCount >= request.requiredQuorum &&
          approvalRatio + this.options.numericalTolerance >=
            request.requiredApprovalRatio;

        return Object.freeze({
          approved,
          reason: approved
            ? "Approval quorum and required approval ratio were satisfied."
            : "Approval quorum or required approval ratio was not satisfied.",
        });
      }

      case "HIGHEST_CONFIDENCE": {
        const decisive = evaluations
          .filter((evaluation) => evaluation.participating)
          .sort((left, right) => {
            const confidenceDifference =
              right.participant.confidence -
              left.participant.confidence;

            if (
              Math.abs(confidenceDifference) >
              this.options.numericalTolerance
            ) {
              return confidenceDifference;
            }

            const weightDifference =
              right.effectiveWeight - left.effectiveWeight;

            if (
              Math.abs(weightDifference) >
              this.options.numericalTolerance
            ) {
              return weightDifference;
            }

            return left.participant.participantId.localeCompare(
              right.participant.participantId,
            );
          });

        const winner = decisive[0];
        const approved =
          winner !== undefined &&
          winner.participant.vote === "APPROVE";

        return Object.freeze({
          approved,
          reason:
            winner === undefined
              ? "No decisive participant was available."
              : approved
                ? `Highest-confidence participant "${winner.participant.participantId}" approved.`
                : `Highest-confidence participant "${winner.participant.participantId}" rejected.`,
        });
      }

      case "RISK_ADJUSTED": {
        const riskRejection = evaluations.some(
          (evaluation) =>
            evaluation.participant.participantType ===
              "RISK_ENGINE" &&
            evaluation.participant.vote === "REJECT" &&
            evaluation.participant.confidence >=
              this.options.conflictConfidenceThreshold,
        );

        if (riskRejection) {
          return Object.freeze({
            approved: false,
            reason:
              "A high-confidence risk-engine rejection vetoed the signal.",
          });
        }

        const approved =
          approvalRatio + this.options.numericalTolerance >=
            request.requiredApprovalRatio &&
          participationRatio > 0;

        return Object.freeze({
          approved,
          reason: approved
            ? "Risk-adjusted weighted approval satisfied the required threshold."
            : "Risk-adjusted weighted approval did not satisfy the required threshold.",
        });
      }

      default: {
        const exhaustiveCheck: never = policy;
        return exhaustiveCheck;
      }
    }
  }

  private detectHighConfidenceConflict(
    participants: readonly AutonomousConsensusParticipant[],
  ): boolean {
    const hasHighConfidenceApproval = participants.some(
      (participant) =>
        participant.vote === "APPROVE" &&
        participant.confidence >=
          this.options.conflictConfidenceThreshold &&
        participant.weight > this.options.numericalTolerance,
    );

    const hasHighConfidenceRejection = participants.some(
      (participant) =>
        participant.vote === "REJECT" &&
        participant.confidence >=
          this.options.conflictConfidenceThreshold &&
        participant.weight > this.options.numericalTolerance,
    );

    return hasHighConfidenceApproval && hasHighConfidenceRejection;
  }

  private buildReason(
    request: AutonomousConsensusRequest,
    approved: boolean,
    quorumSatisfied: boolean,
    conflictDetected: boolean,
    approvalRatio: number,
    participationRatio: number,
    policyEvaluation: PolicyEvaluation,
  ): string {
    if (!quorumSatisfied) {
      return (
        `Consensus rejected: required quorum ${request.requiredQuorum} ` +
        "was not reached."
      );
    }

    if (conflictDetected) {
      return (
        "Consensus rejected because high-confidence participants cast " +
        "conflicting approval and rejection votes."
      );
    }

    if (
      approvalRatio + this.options.numericalTolerance <
      request.requiredApprovalRatio
    ) {
      return (
        `Consensus rejected: approval ratio ${approvalRatio.toFixed(6)} ` +
        `is below required ratio ${request.requiredApprovalRatio.toFixed(6)}.`
      );
    }

    if (!policyEvaluation.approved) {
      return `Consensus rejected under ${request.policy}: ${policyEvaluation.reason}`;
    }

    return (
      `Consensus approved under ${request.policy}. ` +
      `Approval ratio=${approvalRatio.toFixed(6)}, ` +
      `participation ratio=${participationRatio.toFixed(6)}. ` +
      policyEvaluation.reason
    );
  }
}

export function createAutonomousConsensusDecisionEngine(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousConsensusDecisionEngineOptions = {},
): AutonomousConsensusDecisionEngine {
  return new AutonomousConsensusDecisionEngine(
    clock,
    idFactory,
    validator,
    options,
  );
}