/**
 * QuantumTradeAI
 * Milestone 35 — AI Decision Intelligence & Autonomous Strategy Orchestration
 *
 * File 9:
 * src/trading/ai-decision-intelligence/decision-explainability-engine.ts
 */

import type {
  DecisionCandidateType,
  DecisionEvidence,
  DecisionEvidenceDirection,
  DecisionEvidenceSource,
  DecisionExplainabilityEnginePort,
  DecisionExplainabilityLevel,
  DecisionExplainabilityRequest,
  DecisionExplainabilityResult,
  DecisionExplanationFactor,
  DecisionIntelligenceDecision,
  DecisionIntelligenceId,
  DecisionStrategyId,
  ScoredDecisionCandidate,
  StrategyDecisionExplanation,
} from "./ai-decision-intelligence-contracts";

const EPSILON = 1e-12;

export interface DecisionExplainabilityEngineOptions {
  readonly maximumPrimaryFactors?: number;
  readonly maximumStrategyFactors?: number;
  readonly maximumAlternatives?: number;
  readonly maximumEvidenceIdsPerStrategy?: number;
  readonly includeRejectedCandidates?: boolean;
  readonly includeNeutralEvidence?: boolean;
  readonly includeAuditIdentifiers?: boolean;
}

export class DecisionExplainabilityEngineError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code = "DECISION_EXPLAINABILITY_ENGINE_ERROR",
  ) {
    super(message);
    this.name = "DecisionExplainabilityEngineError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DecisionExplainabilityEngine
  implements DecisionExplainabilityEnginePort
{
  private readonly maximumPrimaryFactors: number;
  private readonly maximumStrategyFactors: number;
  private readonly maximumAlternatives: number;
  private readonly maximumEvidenceIdsPerStrategy: number;
  private readonly includeRejectedCandidates: boolean;
  private readonly includeNeutralEvidence: boolean;
  private readonly includeAuditIdentifiers: boolean;

  public constructor(options: DecisionExplainabilityEngineOptions = {}) {
    this.maximumPrimaryFactors = positiveInteger(
      options.maximumPrimaryFactors ?? 8,
      "maximumPrimaryFactors",
    );
    this.maximumStrategyFactors = positiveInteger(
      options.maximumStrategyFactors ?? 6,
      "maximumStrategyFactors",
    );
    this.maximumAlternatives = positiveInteger(
      options.maximumAlternatives ?? 10,
      "maximumAlternatives",
    );
    this.maximumEvidenceIdsPerStrategy = positiveInteger(
      options.maximumEvidenceIdsPerStrategy ?? 12,
      "maximumEvidenceIdsPerStrategy",
    );
    this.includeRejectedCandidates =
      options.includeRejectedCandidates ?? true;
    this.includeNeutralEvidence = options.includeNeutralEvidence ?? false;
    this.includeAuditIdentifiers = options.includeAuditIdentifiers ?? false;
  }

  public explain(
    input: DecisionExplainabilityRequest,
  ): DecisionExplainabilityResult {
    this.assertRequest(input);

    const level = input.request.configuration.explainabilityLevel;
    const selectedCandidateIds = new Set(
      input.plan.actions.map((action) => action.candidateId),
    );
    const selectedCandidates = input.candidates
      .filter((candidate) => selectedCandidateIds.has(candidate.candidateId))
      .sort(compareCandidates);
    const rejectedCandidates = input.candidates
      .filter((candidate) => !selectedCandidateIds.has(candidate.candidateId))
      .sort(compareCandidates);

    const strategyExplanations = this.buildStrategyExplanations(
      input,
      selectedCandidates,
      rejectedCandidates,
      level,
    );
    const primaryFactors = this.buildPortfolioFactors(
      input,
      selectedCandidates,
      level,
    );
    const conflictsResolved = this.buildConflictNarratives(input, level);
    const alternativesConsidered = this.buildAlternatives(
      rejectedCandidates,
      level,
    );
    const safeguards = uniqueStrings([
      ...input.plan.safeguards,
      ...strategyExplanations.flatMap((entry) => entry.safeguards),
      ...input.governance.restrictions,
    ]);
    const warnings = uniqueStrings([
      ...input.context.warnings,
      ...input.plan.warnings,
      ...input.governance.warnings,
      ...selectedCandidates.flatMap((candidate) => candidate.warnings),
    ]);

    const summary = this.buildSummary(input, selectedCandidates);
    const portfolioNarrative = this.buildPortfolioNarrative(
      input,
      selectedCandidates,
      level,
    );
    const governanceNarrative = this.buildGovernanceNarrative(input, level);
    const uncertaintyNarrative = this.buildUncertaintyNarrative(
      input,
      selectedCandidates,
      level,
    );
    const confidence = this.calculateExplanationConfidence(
      input,
      selectedCandidates,
    );

    return Object.freeze({
      explanationId: deterministicId(
        "decision-explanation",
        [
          input.request.requestId,
          input.plan.planId,
          input.governance.assessmentId,
          input.generatedAt,
        ].join("|"),
      ),
      generatedAt: input.generatedAt,
      level,
      decision: input.plan.decision,
      summary,
      portfolioNarrative,
      strategyExplanations: Object.freeze(strategyExplanations),
      primaryFactors: Object.freeze(primaryFactors),
      conflictsResolved: Object.freeze(conflictsResolved),
      governanceNarrative,
      uncertaintyNarrative,
      alternativesConsidered: Object.freeze(alternativesConsidered),
      safeguards: Object.freeze(safeguards),
      confidence,
      warnings: Object.freeze(warnings),
    });
  }

  private buildStrategyExplanations(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
    rejected: readonly ScoredDecisionCandidate[],
    level: DecisionExplainabilityLevel,
  ): readonly StrategyDecisionExplanation[] {
    const currentWeights = input.request.portfolio.strategyWeights;
    const explanations: StrategyDecisionExplanation[] = [];

    for (const candidate of selected) {
      if (candidate.strategyId === undefined) {
        continue;
      }

      const previousWeight = currentWeights[candidate.strategyId] ?? 0;
      const proposedWeight =
        candidate.proposedWeight ??
        input.plan.targetStrategyWeights[candidate.strategyId] ??
        previousWeight;
      const alternatives = rejected
        .filter((alternative) => alternative.strategyId === candidate.strategyId)
        .slice(0, level === "SUMMARY" ? 1 : 3)
        .map((alternative) =>
          this.describeRejectedAlternative(alternative),
        );
      const primaryFactors = this.buildCandidateFactors(candidate, level);
      const supportingEvidenceIds = candidate.evidence
        .filter((evidence) => this.shouldIncludeEvidence(evidence, level))
        .sort(compareEvidence)
        .slice(0, this.maximumEvidenceIdsPerStrategy)
        .map((evidence) => evidence.evidenceId);
      const risks = uniqueStrings([
        ...candidate.riskImpact.breachedLimits,
        ...candidate.riskImpact.warnings,
        ...(candidate.riskImpact.riskDelta > EPSILON
          ? [
              `Projected risk score increases from ${formatNumber(
                candidate.riskImpact.currentRiskScore,
              )} to ${formatNumber(
                candidate.riskImpact.projectedRiskScore,
              )}.`,
            ]
          : []),
      ]);
      const safeguards = uniqueStrings([
        ...input.plan.safeguards,
        ...input.governance.restrictions,
        ...(candidate.riskImpact.riskDelta > EPSILON
          ? ["Revalidate risk budget immediately before execution."]
          : []),
        ...(candidate.expiresAt !== undefined
          ? [`Execute before candidate expiry at ${candidate.expiresAt}.`]
          : []),
      ]);

      explanations.push(
        Object.freeze({
          strategyId: candidate.strategyId,
          decision: candidate.type,
          summary: this.buildStrategySummary(
            candidate,
            previousWeight,
            proposedWeight,
          ),
          previousWeight: round(previousWeight, 12),
          proposedWeight: round(proposedWeight, 12),
          confidence: round(candidate.confidence.score, 12),
          primaryFactors: Object.freeze(primaryFactors),
          supportingEvidenceIds: Object.freeze(supportingEvidenceIds),
          rejectedAlternatives: Object.freeze(alternatives),
          risks: Object.freeze(risks),
          safeguards: Object.freeze(safeguards),
        }),
      );
    }

    return explanations.sort((left, right) =>
      compareText(left.strategyId, right.strategyId),
    );
  }

  private buildCandidateFactors(
    candidate: ScoredDecisionCandidate,
    level: DecisionExplainabilityLevel,
  ): readonly DecisionExplanationFactor[] {
    const utilityFactors: DecisionExplanationFactor[] = [
      factor(
        "Expected return utility",
        "UTILITY",
        candidate.utility.expectedReturnUtility,
        candidate.confidence.score,
        "Expected contribution to portfolio return.",
      ),
      factor(
        "Risk-adjusted utility",
        "UTILITY",
        candidate.utility.riskAdjustedUtility,
        candidate.confidence.riskCertainty,
        "Expected return relative to risk consumption.",
      ),
      factor(
        "Drawdown protection",
        "UTILITY",
        candidate.utility.drawdownProtectionUtility,
        candidate.confidence.riskCertainty,
        "Expected contribution to drawdown containment.",
      ),
      factor(
        "Diversification utility",
        "UTILITY",
        candidate.utility.diversificationUtility,
        candidate.confidence.score,
        "Expected effect on portfolio diversification.",
      ),
      factor(
        "Regime alignment",
        "UTILITY",
        candidate.utility.regimeAlignmentUtility,
        candidate.confidence.regimeCertainty,
        "Alignment with the assessed market regime.",
      ),
      factor(
        "Learning value",
        "UTILITY",
        candidate.utility.learningUtility,
        candidate.confidence.modelAgreement,
        "Expected value of additional strategy learning.",
      ),
      factor(
        "Execution utility",
        "UTILITY",
        candidate.utility.executionUtility,
        candidate.confidence.dataQuality,
        "Expected execution quality and feasibility.",
      ),
      factor(
        "Operational stability",
        "UTILITY",
        candidate.utility.stabilityUtility,
        candidate.confidence.score,
        "Expected effect on operational stability.",
      ),
      factor(
        "Total implementation cost",
        "COST",
        -Math.abs(candidate.costs.totalCost),
        candidate.confidence.dataQuality,
        "Combined transaction, slippage, market-impact and operational cost.",
      ),
      factor(
        "Projected risk change",
        "RISK",
        -candidate.riskImpact.riskDelta,
        candidate.confidence.riskCertainty,
        "Projected change in aggregate strategy and portfolio risk.",
      ),
    ];

    const evidenceFactors = candidate.evidence
      .filter((evidence) => this.shouldIncludeEvidence(evidence, level))
      .map((evidence) => this.evidenceToFactor(evidence));

    const maximum = level === "SUMMARY" ? 3 : this.maximumStrategyFactors;
    return [...utilityFactors, ...evidenceFactors]
      .sort(compareFactors)
      .slice(0, maximum)
      .map((entry) => Object.freeze(entry));
  }

  private buildPortfolioFactors(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
    level: DecisionExplainabilityLevel,
  ): readonly DecisionExplanationFactor[] {
    const factors: DecisionExplanationFactor[] = [
      factor(
        "Portfolio health",
        "PORTFOLIO_STATE",
        signedFromUnit(input.context.portfolioHealthScore),
        input.context.evidenceQualityScore,
        "Overall portfolio health at decision time.",
      ),
      factor(
        "Market opportunity",
        "MARKET_CONTEXT",
        signedFromUnit(input.context.marketOpportunityScore),
        input.context.regimeConfidence,
        "Strength of the available market opportunity.",
      ),
      factor(
        "Market risk",
        "RISK_STATE",
        -input.context.marketRiskScore,
        input.context.evidenceQualityScore,
        "Current market and cross-asset risk pressure.",
      ),
      factor(
        "Strategy health",
        "STRATEGY_STATE",
        signedFromUnit(input.context.strategyHealthScore),
        input.context.evidenceQualityScore,
        "Combined health of the strategy portfolio.",
      ),
      factor(
        "Execution readiness",
        "EXECUTION_INTELLIGENCE",
        signedFromUnit(input.context.executionReadinessScore),
        input.context.systemReadinessScore,
        "Readiness of execution infrastructure and liquidity conditions.",
      ),
      factor(
        "System readiness",
        "SYSTEM_HEALTH",
        signedFromUnit(input.context.systemReadinessScore),
        input.request.systemHealth.overallHealthScore,
        "Operational readiness of supporting platform components.",
      ),
      factor(
        "Expected net utility",
        "UTILITY",
        input.plan.metrics.expectedNetUtility,
        input.plan.metrics.confidence,
        "Aggregate utility of the selected decision plan after costs.",
      ),
      factor(
        "Expected risk delta",
        "RISK",
        -input.plan.metrics.expectedRiskDelta,
        input.plan.metrics.confidence,
        "Aggregate projected risk change from the plan.",
      ),
      factor(
        "Expected turnover",
        "COST",
        -input.plan.metrics.expectedTurnover,
        input.plan.metrics.confidence,
        "Expected portfolio turnover caused by the plan.",
      ),
    ];

    for (const candidate of selected) {
      for (const evidence of candidate.evidence) {
        if (this.shouldIncludeEvidence(evidence, level)) {
          factors.push(this.evidenceToFactor(evidence));
        }
      }
    }

    const maximum = level === "SUMMARY" ? 4 : this.maximumPrimaryFactors;
    return deduplicateFactors(factors)
      .sort(compareFactors)
      .slice(0, maximum)
      .map((entry) => Object.freeze(entry));
  }

  private evidenceToFactor(
    evidence: DecisionEvidence,
  ): DecisionExplanationFactor {
    const contribution =
      directionMultiplier(evidence.direction) *
      evidence.strength *
      evidence.confidence *
      evidence.freshness *
      evidence.relevance;

    return factor(
      evidence.summary,
      evidence.source,
      contribution,
      evidence.confidence,
      evidence.summary,
      evidence.direction,
    );
  }

  private buildSummary(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
  ): string {
    const actionCount = input.plan.actions.length;
    const strategyCount = new Set(
      selected
        .map((candidate) => candidate.strategyId)
        .filter((value): value is string => value !== undefined),
    ).size;

    switch (input.plan.decision) {
      case "EXECUTE":
        return `Execute ${actionCount} action${plural(actionCount)} across ${strategyCount} strategy${plural(strategyCount)} with expected net utility ${formatNumber(input.plan.metrics.expectedNetUtility)} and confidence ${formatPercent(input.plan.metrics.confidence)}.`;
      case "EXECUTE_WITH_RESTRICTIONS":
        return `Execute ${actionCount} action${plural(actionCount)} under governance restrictions with confidence ${formatPercent(input.plan.metrics.confidence)}.`;
      case "HOLD":
        return "Hold the current portfolio state because no sufficiently strong and governable action was selected.";
      case "DEFER":
        return "Defer execution until blocking, approval, data-quality, or system-readiness conditions are resolved.";
      case "REJECT":
        return "Reject the proposed plan because governance or safety requirements were not satisfied.";
      default:
        return exhaustiveDecision(input.plan.decision);
    }
  }

  private buildPortfolioNarrative(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
    level: DecisionExplainabilityLevel,
  ): string {
    const parts = [
      `The portfolio was assessed in the ${humanize(input.context.activeRegime)} regime with regime confidence ${formatPercent(input.context.regimeConfidence)}.`,
      `Portfolio health was ${formatPercent(input.context.portfolioHealthScore)}, market opportunity was ${formatPercent(input.context.marketOpportunityScore)}, and market risk was ${formatPercent(input.context.marketRiskScore)}.`,
      `The optimized plan selected ${selected.length} of ${input.candidates.length} candidates, producing expected net utility ${formatNumber(input.plan.metrics.expectedNetUtility)}, expected turnover ${formatPercent(input.plan.metrics.expectedTurnover)}, and expected risk delta ${formatNumber(input.plan.metrics.expectedRiskDelta)}.`,
    ];

    if (level === "DETAILED" || level === "AUDIT") {
      parts.push(
        `The target reserve weight is ${formatPercent(input.plan.metrics.expectedReserveWeight)}, diversification score is ${formatPercent(input.plan.metrics.diversificationScore)}, and stability score is ${formatPercent(input.plan.metrics.stabilityScore)}.`,
      );
    }

    if (level === "AUDIT" && this.includeAuditIdentifiers) {
      parts.push(
        `Request ${input.request.requestId}, plan ${input.plan.planId}, governance assessment ${input.governance.assessmentId}.`,
      );
    }

    return parts.join(" ");
  }

  private buildGovernanceNarrative(
    input: DecisionExplainabilityRequest,
    level: DecisionExplainabilityLevel,
  ): string {
    const governance = input.governance;
    const parts = [
      `Governance decision: ${humanize(governance.decision)}.`,
      `Approval requirement: ${humanize(governance.approvalRequirement)}.`,
      `${governance.approvedActionIds.length} action${plural(governance.approvedActionIds.length)} approved, ${governance.restrictedActionIds.length} restricted, and ${governance.rejectedActionIds.length} rejected.`,
    ];

    if (governance.reasons.length > 0) {
      parts.push(`Primary rationale: ${governance.reasons.slice(0, level === "SUMMARY" ? 1 : 3).join("; ")}.`);
    }

    if (governance.restrictions.length > 0) {
      parts.push(
        `Restrictions: ${governance.restrictions.slice(0, level === "SUMMARY" ? 1 : 4).join("; ")}.`,
      );
    }

    return parts.join(" ");
  }

  private buildUncertaintyNarrative(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
    level: DecisionExplainabilityLevel,
  ): string {
    const confidence = this.calculateExplanationConfidence(input, selected);
    const uncertainty = 1 - confidence;
    const reasons = uniqueStrings([
      ...selected.flatMap((candidate) => candidate.confidence.reasons),
      ...input.context.warnings,
      ...input.governance.warnings,
    ]);

    const base = `Overall explanation confidence is ${formatPercent(confidence)}, implying residual uncertainty of ${formatPercent(uncertainty)}. Evidence quality is ${formatPercent(input.context.evidenceQualityScore)} and regime certainty is ${formatPercent(input.context.regimeConfidence)}.`;

    if (level === "SUMMARY" || reasons.length === 0) {
      return base;
    }

    return `${base} Main uncertainty drivers: ${reasons.slice(0, level === "AUDIT" ? 8 : 4).join("; ")}.`;
  }

  private buildConflictNarratives(
    input: DecisionExplainabilityRequest,
    level: DecisionExplainabilityLevel,
  ): readonly string[] {
    return input.plan.conflicts
      .slice()
      .sort((left, right) => compareText(left.conflictId, right.conflictId))
      .map((conflict) => {
        const selected = conflict.selectedCandidateIds.length > 0
          ? ` selected ${conflict.selectedCandidateIds.join(", ")}`
          : " selected no candidate";
        const rejected = conflict.rejectedCandidateIds.length > 0
          ? ` and rejected ${conflict.rejectedCandidateIds.join(", ")}`
          : "";
        const rationale =
          level === "SUMMARY" || conflict.rationale.length === 0
            ? ""
            : ` Rationale: ${conflict.rationale.join("; ")}.`;
        return `${humanize(conflict.type)} was resolved using ${humanize(conflict.resolution)};${selected}${rejected}.${rationale}`;
      });
  }

  private buildAlternatives(
    rejected: readonly ScoredDecisionCandidate[],
    level: DecisionExplainabilityLevel,
  ): readonly string[] {
    if (!this.includeRejectedCandidates) {
      return [];
    }

    const maximum = level === "SUMMARY" ? 3 : this.maximumAlternatives;
    return rejected
      .slice(0, maximum)
      .map((candidate) => this.describeRejectedAlternative(candidate));
  }

  private describeRejectedAlternative(
    candidate: ScoredDecisionCandidate,
  ): string {
    const target = candidate.strategyId === undefined
      ? "portfolio"
      : `strategy ${candidate.strategyId}`;
    const reason = candidate.rejectionReasons[0]
      ?? candidate.warnings[0]
      ?? (candidate.eligible
        ? "it was outranked by the selected plan"
        : "it did not satisfy eligibility constraints");
    return `${humanize(candidate.type)} for ${target} was not selected because ${lowercaseFirst(reason)}.`;
  }

  private buildStrategySummary(
    candidate: ScoredDecisionCandidate,
    previousWeight: number,
    proposedWeight: number,
  ): string {
    const weightNarrative =
      Math.abs(previousWeight - proposedWeight) <= EPSILON
        ? `maintaining weight at ${formatPercent(previousWeight)}`
        : `changing weight from ${formatPercent(previousWeight)} to ${formatPercent(proposedWeight)}`;
    const rationale = candidate.rationale[0]
      ? ` ${candidate.rationale[0]}`
      : "";
    return `${humanize(candidate.type)} is proposed for strategy ${candidate.strategyId}, ${weightNarrative}, with score ${formatNumber(candidate.finalScore)} and confidence ${formatPercent(candidate.confidence.score)}.${rationale}`;
  }

  private calculateExplanationConfidence(
    input: DecisionExplainabilityRequest,
    selected: readonly ScoredDecisionCandidate[],
  ): number {
    const candidateConfidence = selected.length === 0
      ? input.plan.metrics.confidence
      : average(selected.map((candidate) => candidate.confidence.score));
    const candidateCoverage = selected.length === 0
      ? input.context.evidenceQualityScore
      : average(
          selected.map((candidate) => candidate.confidence.evidenceCoverage),
        );
    const governanceFactor = governanceConfidence(input.governance.decision);

    return round(
      clamp(
        candidateConfidence * 0.35 +
          candidateCoverage * 0.15 +
          input.context.evidenceQualityScore * 0.2 +
          input.context.regimeConfidence * 0.1 +
          input.context.systemReadinessScore * 0.1 +
          governanceFactor * 0.1,
        0,
        1,
      ),
      12,
    );
  }

  private shouldIncludeEvidence(
    evidence: DecisionEvidence,
    level: DecisionExplainabilityLevel,
  ): boolean {
    if (
      !this.includeNeutralEvidence &&
      evidence.direction === "NEUTRAL"
    ) {
      return false;
    }

    if (level === "AUDIT") {
      return true;
    }

    const quality =
      evidence.strength *
      evidence.confidence *
      evidence.freshness *
      evidence.relevance;
    return quality >= (level === "SUMMARY" ? 0.35 : 0.15);
  }

  private assertRequest(input: DecisionExplainabilityRequest): void {
    if (input === null || typeof input !== "object") {
      throw new DecisionExplainabilityEngineError(
        "Explainability request is required.",
        "INVALID_REQUEST",
      );
    }

    nonEmpty(input.request.requestId, "request.requestId");
    nonEmpty(input.plan.planId, "plan.planId");
    nonEmpty(input.governance.assessmentId, "governance.assessmentId");
    validTimestamp(input.generatedAt, "generatedAt");

    if (input.request.requestId !== input.plan.requestId) {
      throw new DecisionExplainabilityEngineError(
        "Plan requestId does not match the explainability request.",
        "REQUEST_ID_MISMATCH",
      );
    }

    if (input.request.portfolioId !== input.plan.portfolioId) {
      throw new DecisionExplainabilityEngineError(
        "Plan portfolioId does not match the explainability request.",
        "PORTFOLIO_ID_MISMATCH",
      );
    }

    const candidateIds = new Set<string>();
    for (const candidate of input.candidates) {
      nonEmpty(candidate.candidateId, "candidate.candidateId");
      if (candidateIds.has(candidate.candidateId)) {
        throw new DecisionExplainabilityEngineError(
          `Duplicate candidateId: ${candidate.candidateId}`,
          "DUPLICATE_CANDIDATE_ID",
        );
      }
      candidateIds.add(candidate.candidateId);
      unitInterval(
        candidate.confidence.score,
        `${candidate.candidateId}.confidence.score`,
      );
    }
  }
}

function factor(
  name: string,
  category: DecisionEvidenceSource | "UTILITY" | "COST" | "RISK",
  contribution: number,
  confidence: number,
  description: string,
  direction?: DecisionEvidenceDirection,
): DecisionExplanationFactor {
  return {
    name,
    category,
    contribution: round(contribution, 12),
    direction: direction ?? contributionDirection(contribution),
    confidence: round(clamp(confidence, 0, 1), 12),
    description,
  };
}

function contributionDirection(
  contribution: number,
): DecisionEvidenceDirection {
  if (contribution >= 0.5) return "STRONGLY_SUPPORTIVE";
  if (contribution > EPSILON) return "SUPPORTIVE";
  if (contribution <= -0.5) return "STRONGLY_OPPOSING";
  if (contribution < -EPSILON) return "OPPOSING";
  return "NEUTRAL";
}

function directionMultiplier(
  direction: DecisionEvidenceDirection,
): number {
  switch (direction) {
    case "STRONGLY_SUPPORTIVE": return 1;
    case "SUPPORTIVE": return 0.5;
    case "NEUTRAL": return 0;
    case "OPPOSING": return -0.5;
    case "STRONGLY_OPPOSING": return -1;
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}

function governanceConfidence(
  decision: DecisionExplainabilityRequest["governance"]["decision"],
): number {
  switch (decision) {
    case "APPROVED": return 1;
    case "APPROVED_WITH_RESTRICTIONS": return 0.8;
    case "PENDING_APPROVAL": return 0.6;
    case "DEFERRED": return 0.35;
    case "REJECTED": return 0.15;
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

function compareCandidates(
  left: ScoredDecisionCandidate,
  right: ScoredDecisionCandidate,
): number {
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (Math.abs(right.finalScore - left.finalScore) > EPSILON) {
    return right.finalScore - left.finalScore;
  }
  return compareText(left.candidateId, right.candidateId);
}

function compareEvidence(
  left: DecisionEvidence,
  right: DecisionEvidence,
): number {
  const leftScore = Math.abs(
    directionMultiplier(left.direction) *
      left.strength *
      left.confidence *
      left.freshness *
      left.relevance,
  );
  const rightScore = Math.abs(
    directionMultiplier(right.direction) *
      right.strength *
      right.confidence *
      right.freshness *
      right.relevance,
  );
  if (Math.abs(rightScore - leftScore) > EPSILON) {
    return rightScore - leftScore;
  }
  return compareText(left.evidenceId, right.evidenceId);
}

function compareFactors(
  left: DecisionExplanationFactor,
  right: DecisionExplanationFactor,
): number {
  const leftScore = Math.abs(left.contribution) * left.confidence;
  const rightScore = Math.abs(right.contribution) * right.confidence;
  if (Math.abs(rightScore - leftScore) > EPSILON) {
    return rightScore - leftScore;
  }
  return compareText(left.name, right.name);
}

function deduplicateFactors(
  factors: readonly DecisionExplanationFactor[],
): DecisionExplanationFactor[] {
  const bestByKey = new Map<string, DecisionExplanationFactor>();
  for (const entry of factors) {
    const key = `${entry.category}|${entry.name}`;
    const existing = bestByKey.get(key);
    if (
      existing === undefined ||
      Math.abs(entry.contribution) * entry.confidence >
        Math.abs(existing.contribution) * existing.confidence
    ) {
      bestByKey.set(key, entry);
    }
  }
  return [...bestByKey.values()];
}

function signedFromUnit(value: number): number {
  return value * 2 - 1;
}

function deterministicId(
  prefix: string,
  seed: string,
): DecisionIntelligenceId {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
    .filter((value) => value.trim().length > 0)
    .sort(compareText);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  const factorValue = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factorValue) / factorValue;
}

function formatNumber(value: number): string {
  return round(value, 6).toString();
}

function formatPercent(value: number): string {
  return `${round(value * 100, 2)}%`;
}

function plural(value: number): string {
  return value === 1 ? "" : "s";
}

function humanize(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

function lowercaseFirst(value: string): string {
  if (value.length === 0) return value;
  return value[0].toLowerCase() + value.slice(1);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exhaustiveDecision(decision: never): string {
  return String(decision);
}

function nonEmpty(value: string, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DecisionExplainabilityEngineError(
      `${name} must be a non-empty string.`,
      "INVALID_STRING",
    );
  }
  return value;
}

function unitInterval(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DecisionExplainabilityEngineError(
      `${name} must be between 0 and 1.`,
      "INVALID_RANGE",
    );
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DecisionExplainabilityEngineError(
      `${name} must be a positive integer.`,
      "INVALID_INTEGER",
    );
  }
  return value;
}

function validTimestamp(value: string, name: string): string {
  nonEmpty(value, name);
  if (!Number.isFinite(Date.parse(value))) {
    throw new DecisionExplainabilityEngineError(
      `${name} must be a valid timestamp.`,
      "INVALID_TIMESTAMP",
    );
  }
  return value;
}