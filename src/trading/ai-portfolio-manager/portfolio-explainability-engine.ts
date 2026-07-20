/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 10: Deterministic portfolio explainability engine.
 */

import {
  PortfolioExplanationFactorType,
  type AIPortfolioManagerDecision,
  type PortfolioDecisionExplanation,
  type PortfolioExplainabilityEngine,
  type PortfolioExplanationFactor,
  type PortfolioMetadata,
} from "./ai-portfolio-contracts";

export interface PortfolioExplainabilityClock {
  now(): number;
}

export interface PortfolioExplainabilityEngineOptions {
  readonly modelVersion?: string;
  readonly maximumPrimaryReasons?: number;
  readonly maximumFactorsPerCategory?: number;
  readonly minimumMaterialImpact?: number;
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedOptions {
  readonly modelVersion: string;
  readonly maximumPrimaryReasons: number;
  readonly maximumFactorsPerCategory: number;
  readonly minimumMaterialImpact: number;
  readonly metadata?: PortfolioMetadata;
}

type ExplainableDecision = Omit<
  AIPortfolioManagerDecision,
  "explanation"
>;

interface MutableExplanation {
  readonly primaryReasons: string[];
  readonly supportingFactors: PortfolioExplanationFactor[];
  readonly conflictingFactors: PortfolioExplanationFactor[];
  readonly constraintsApplied: string[];
  readonly expectedBenefits: string[];
  readonly risks: string[];
  readonly invalidationConditions: string[];
}

const SYSTEM_CLOCK: PortfolioExplainabilityClock = Object.freeze({
  now: (): number => Date.now(),
});

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function resolveOptions(
  options: PortfolioExplainabilityEngineOptions | undefined,
): ResolvedOptions {
  const maximumPrimaryReasons =
    options?.maximumPrimaryReasons ?? 8;
  const maximumFactorsPerCategory =
    options?.maximumFactorsPerCategory ?? 12;
  const minimumMaterialImpact =
    options?.minimumMaterialImpact ?? 0.01;

  assertPositiveInteger(
    maximumPrimaryReasons,
    "options.maximumPrimaryReasons",
  );
  assertPositiveInteger(
    maximumFactorsPerCategory,
    "options.maximumFactorsPerCategory",
  );
  assertFinite(
    minimumMaterialImpact,
    "options.minimumMaterialImpact",
  );

  if (
    minimumMaterialImpact < 0 ||
    minimumMaterialImpact > 1
  ) {
    throw new RangeError(
      "options.minimumMaterialImpact must be between 0 and 1.",
    );
  }

  return Object.freeze({
    modelVersion:
      options?.modelVersion ??
      "quantumtradeai-ai-portfolio-explainability-v1",
    maximumPrimaryReasons,
    maximumFactorsPerCategory,
    minimumMaterialImpact,
    metadata: cloneMetadata(options?.metadata),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => value.trim()).filter(Boolean))],
  );
}

function enumFactorType(
  candidates: readonly string[],
): PortfolioExplanationFactorType {
  const values =
    PortfolioExplanationFactorType as unknown as Readonly<
      Record<string, PortfolioExplanationFactorType>
    >;

  for (const candidate of candidates) {
    const value = values[candidate];

    if (value !== undefined) {
      return value;
    }
  }

  const fallback = Object.values(values)[0];

  if (fallback === undefined) {
    throw new Error(
      "PortfolioExplanationFactorType defines no values.",
    );
  }

  return fallback;
}

function factor(
  factorType: PortfolioExplanationFactorType,
  name: string,
  description: string,
  impact: number,
  supporting: boolean,
  affectedTargets: readonly string[] = Object.freeze([]),
  evidence?: PortfolioMetadata,
): PortfolioExplanationFactor {
  return Object.freeze({
    factorType,
    name,
    description,
    impact: clamp(Math.abs(impact)),
    supporting,
    affectedTargets: unique(affectedTargets),
    ...(evidence === undefined
      ? {}
      : { evidence: Object.freeze({ ...evidence }) }),
  });
}

function addFactor(
  state: MutableExplanation,
  value: PortfolioExplanationFactor,
  options: ResolvedOptions,
): void {
  if (value.impact < options.minimumMaterialImpact) {
    return;
  }

  const destination = value.supporting
    ? state.supportingFactors
    : state.conflictingFactors;

  destination.push(value);
}

function addHealthFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const health = decision.healthReport;
  const normalizedScore = clamp(health.overallScore);

  addFactor(
    state,
    factor(
      enumFactorType(["RISK", "OTHER"]),
      "Portfolio health",
      `The portfolio health score is ${health.overallScore.toFixed(
        4,
      )} with status ${String(health.status)} and risk level ${String(
        health.riskLevel,
      )}.`,
      normalizedScore,
      normalizedScore >= 0.5,
      [],
      {
        overallScore: health.overallScore,
        status: health.status,
        riskLevel: health.riskLevel,
      },
    ),
    options,
  );

  if (normalizedScore >= 0.7) {
    state.primaryReasons.push(
      "Portfolio health is sufficiently strong to support the proposed decision.",
    );
    state.expectedBenefits.push(
      "Maintain or improve portfolio health while applying the proposed allocation.",
    );
  } else if (normalizedScore < 0.5) {
    state.primaryReasons.push(
      "Weak portfolio health materially influenced the decision.",
    );
    state.risks.push(
      "Current portfolio health may reduce the reliability or safety of execution.",
    );
    state.invalidationConditions.push(
      "Invalidate the decision if portfolio health deteriorates further before execution.",
    );
  }

  for (const issue of health.issues) {
    addFactor(
      state,
      factor(
        enumFactorType(["RISK", "OTHER"]),
        `Health issue: ${issue.title}`,
        issue.description,
        clamp(1 - normalizedScore),
        false,
        issue.affectedTargets ?? [],
        {
          code: issue.code,
          riskLevel: issue.riskLevel,
          ...(issue.recommendedAction !== undefined
            ? { recommendedAction: issue.recommendedAction }
            : {}),
          ...(issue.metadata ?? {}),
        },
      ),
      options,
    );

    state.risks.push(issue.description);
  }

  for (const recommendation of health.recommendations) {
    state.expectedBenefits.push(recommendation.description);
  }
}

function addCorrelationFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const matrix = decision.correlationMatrix;

  if (matrix === undefined) {
    return;
  }

  const correlations: number[] = matrix.pairs
    .map((pair): number => Math.abs(pair.correlation))
    .filter((value: number): boolean => Number.isFinite(value));

  if (correlations.length === 0) {
    return;
  }

  const average =
    correlations.reduce((sum, value) => sum + value, 0) /
    correlations.length;
  const maximum = Math.max(...correlations);

  addFactor(
    state,
    factor(
      enumFactorType(["CORRELATION", "DIVERSIFICATION"]),
      "Portfolio correlation structure",
      `Average absolute correlation is ${average.toFixed(
        4,
      )}; maximum absolute correlation is ${maximum.toFixed(4)}.`,
      maximum,
      maximum < 0.8,
      matrix.assets,
      {
        averageAbsoluteCorrelation: average,
        maximumAbsoluteCorrelation: maximum,
        observationCount: matrix.observationCount,
      },
    ),
    options,
  );

  if (maximum >= 0.8) {
    state.primaryReasons.push(
      "High cross-asset correlation constrained diversification and allocation choices.",
    );
    state.risks.push(
      "Highly correlated holdings may experience simultaneous losses.",
    );
    state.invalidationConditions.push(
      "Re-evaluate the decision if correlation materially increases before execution.",
    );
  } else {
    state.expectedBenefits.push(
      "The proposed portfolio structure preserves meaningful diversification.",
    );
  }
}

function addRiskBudgetFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const result = decision.riskBudgetResult;

  if (result === undefined) {
    return;
  }

  addFactor(
    state,
    factor(
      enumFactorType(["RISK", "CONSTRAINT"]),
      "Risk-budget compliance",
      result.withinBudget
        ? "The portfolio remains within its configured risk budget."
        : "The portfolio exceeds one or more configured risk-budget limits.",
      result.withinBudget ? 0.7 : 1,
      result.withinBudget,
      result.contributions.map(
        (contribution) => contribution.targetId,
      ),
      {
        withinBudget: result.withinBudget,
        totalMeasuredRisk: result.totalMeasuredRisk,
        budgetUtilization: result.budgetUtilization,
        contributionCount: result.contributions.length,
      },
    ),
    options,
  );

  if (result.withinBudget) {
    state.expectedBenefits.push(
      "Execution is expected to remain within the configured risk budget.",
    );
  } else {
    state.primaryReasons.push(
      "Risk-budget violations materially affected approval and allocation.",
    );
    state.risks.push(
      "Executing while over budget could exceed permitted portfolio risk.",
    );
    state.invalidationConditions.push(
      "Do not execute until hard risk-budget violations are resolved.",
    );
  }

  for (const violation of result.violations) {
    state.constraintsApplied.push(violation);
    state.risks.push(violation);
  }

  for (const contribution of result.contributions) {
    if (contribution.exceedsBudget) {
      state.risks.push(
        `Risk contribution for ${contribution.targetId} exceeds its configured budget.`,
      );
    }
  }
}

function addOptimizationFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const result = decision.optimizationResult;

  if (result === undefined) {
    return;
  }

  if (result.expectedReturn !== undefined) {
    addFactor(
      state,
      factor(
        enumFactorType(["RETURN", "OTHER"]),
        "Expected portfolio return",
        `The optimized portfolio has an expected return of ${result.expectedReturn.toFixed(
          6,
        )}.`,
        clamp(Math.abs(result.expectedReturn)),
        result.expectedReturn >= 0,
        result.weights.map((weight) => weight.asset),
        { expectedReturn: result.expectedReturn },
      ),
      options,
    );
  }

  if (result.expectedVolatility !== undefined) {
    addFactor(
      state,
      factor(
        enumFactorType(["VOLATILITY", "RISK"]),
        "Expected portfolio volatility",
        `The optimized portfolio has expected volatility of ${result.expectedVolatility.toFixed(
          6,
        )}.`,
        clamp(result.expectedVolatility),
        result.expectedVolatility <= 0.5,
        result.weights.map((weight) => weight.asset),
        { expectedVolatility: result.expectedVolatility },
      ),
      options,
    );
  }

  if (result.expectedSharpeRatio !== undefined) {
    addFactor(
      state,
      factor(
        enumFactorType(["RETURN", "RISK"]),
        "Expected risk-adjusted return",
        `The expected Sharpe ratio is ${result.expectedSharpeRatio.toFixed(
          6,
        )}.`,
        clamp(Math.abs(result.expectedSharpeRatio) / 3),
        result.expectedSharpeRatio >= 0,
        result.weights.map((weight) => weight.asset),
        { expectedSharpeRatio: result.expectedSharpeRatio },
      ),
      options,
    );
  }

  addFactor(
    state,
    factor(
      enumFactorType(["EXECUTION_COST", "CONSTRAINT"]),
      "Optimization turnover and cost",
      `Expected turnover is ${result.expectedTurnover.toFixed(
        6,
      )}; estimated transaction cost is ${result.estimatedTransactionCost.toFixed(
        6,
      )}.`,
      clamp(
        result.expectedTurnover +
          result.estimatedTransactionCost,
      ),
      result.diagnostics.converged,
      result.weights.map((weight) => weight.asset),
      {
        expectedTurnover: result.expectedTurnover,
        estimatedTransactionCost:
          result.estimatedTransactionCost,
        converged: result.diagnostics.converged,
        iterations: result.diagnostics.iterations,
      },
    ),
    options,
  );

  if (result.diagnostics.converged) {
    state.primaryReasons.push(
      "The optimization process converged to a feasible portfolio solution.",
    );
    state.expectedBenefits.push(
      "The optimized weights improve the portfolio objective within configured constraints.",
    );
  } else {
    state.risks.push(
      "The optimizer did not fully converge, reducing confidence in the proposed weights.",
    );
    state.invalidationConditions.push(
      "Invalidate the decision if a subsequent optimization run produces materially different weights.",
    );
  }

  for (const violation of result.diagnostics.constraintViolations) {
    state.constraintsApplied.push(violation);
    state.risks.push(violation);
  }

  for (const warning of result.diagnostics.warnings) {
    state.risks.push(warning);
  }
}

function addAllocationFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const result = decision.allocationResult;

  if (result === undefined) {
    return;
  }

  const changed = result.allocations.filter(
    (allocation) => Math.abs(allocation.capitalChange) > 0,
  );
  const increase = changed
    .filter((allocation) => allocation.capitalChange > 0)
    .reduce(
      (total, allocation) =>
        total + allocation.capitalChange,
      0,
    );
  const decrease = changed
    .filter((allocation) => allocation.capitalChange < 0)
    .reduce(
      (total, allocation) =>
        total + Math.abs(allocation.capitalChange),
      0,
    );

  addFactor(
    state,
    factor(
      enumFactorType(["CAPITAL_AVAILABILITY", "CONSTRAINT"]),
      "Capital allocation",
      `${result.allocatedCapital.toFixed(
        2,
      )} is allocated, ${result.reservedCapital.toFixed(
        2,
      )} is reserved, and ${result.unallocatedCapital.toFixed(
        2,
      )} remains unallocated.`,
      clamp(
        result.totalCapital > 0
          ? result.allocatedCapital / result.totalCapital
          : 0,
      ),
      result.constraintsSatisfied,
      changed.map((allocation) => allocation.targetId),
      {
        totalCapital: result.totalCapital,
        allocatedCapital: result.allocatedCapital,
        reservedCapital: result.reservedCapital,
        unallocatedCapital: result.unallocatedCapital,
        increase,
        decrease,
      },
    ),
    options,
  );

  if (changed.length > 0) {
    state.primaryReasons.push(
      `${changed.length} allocation target(s) require capital adjustment.`,
    );
    state.expectedBenefits.push(
      "Capital is redirected toward the approved target allocation while preserving reserves.",
    );
  }

  if (!result.constraintsSatisfied) {
    state.risks.push(
      "The capital-allocation result contains unresolved constraint violations.",
    );
  }

  for (const violation of result.violations) {
    state.constraintsApplied.push(violation);
    state.risks.push(violation);
  }

  for (const warning of result.warnings) {
    state.risks.push(warning);
  }
}

function addDriftFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const report = decision.driftReport;

  if (report === undefined) {
    return;
  }

  const breached = report.targets.filter(
    (target) => target.exceedsThreshold,
  );
  const maximumDrift = report.targets.reduce(
    (maximum, target) =>
      Math.max(maximum, target.absoluteDrift),
    0,
  );

  addFactor(
    state,
    factor(
      enumFactorType(["CONSTRAINT", "DIVERSIFICATION"]),
      "Portfolio drift",
      report.rebalanceRequired
        ? `${breached.length} target(s) exceed their drift thresholds and rebalancing is required.`
        : "Portfolio drift remains within configured thresholds.",
      clamp(maximumDrift),
      !report.rebalanceRequired,
      breached.map((target) => target.targetId),
      {
        rebalanceRequired: report.rebalanceRequired,
        maximumDrift,
        breachedTargetCount: breached.length,
      },
    ),
    options,
  );

  if (report.rebalanceRequired) {
    state.primaryReasons.push(
      "Portfolio drift exceeded configured thresholds and triggered rebalancing.",
    );
    state.risks.push(
      "Delaying rebalancing may allow portfolio exposures to move farther from policy targets.",
    );
  }
}

function addRebalanceFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  const plan = decision.rebalancePlan;

  if (plan === undefined) {
    return;
  }

  addFactor(
    state,
    factor(
      enumFactorType(["EXECUTION_COST", "CAPITAL_AVAILABILITY"]),
      "Rebalance execution plan",
      `The plan contains ${plan.trades.length} trade(s), estimated turnover of ${plan.estimatedTurnover.toFixed(
        6,
      )}, and estimated total cost of ${plan.estimatedTotalCost.toFixed(
        6,
      )}.`,
      clamp(
        plan.estimatedTurnover + plan.estimatedTotalCost,
      ),
      plan.trades.length > 0,
      plan.trades.map((trade) => trade.marketSymbol),
      {
        tradeCount: plan.trades.length,
        totalBuyNotional: plan.totalBuyNotional,
        totalSellNotional: plan.totalSellNotional,
        estimatedTurnover: plan.estimatedTurnover,
        estimatedFees: plan.estimatedFees,
        estimatedSlippage: plan.estimatedSlippage,
        estimatedTotalCost: plan.estimatedTotalCost,
      },
    ),
    options,
  );

  if (plan.trades.length > 0) {
    state.primaryReasons.push(
      "A concrete rebalance trade plan was generated from the approved capital changes.",
    );
    state.expectedBenefits.push(
      "Executing the plan should move actual exposures toward target allocations.",
    );
  }

  if (plan.approvalRequired) {
    state.constraintsApplied.push(
      "Manual approval is required before executing the rebalance plan.",
    );
  }

  if (plan.validUntil !== undefined) {
    state.invalidationConditions.push(
      `The rebalance plan expires at ${plan.validUntil}.`,
    );
  }
}

function addDecisionAndDataQualityFactors(
  decision: ExplainableDecision,
  state: MutableExplanation,
  options: ResolvedOptions,
): void {
  addFactor(
    state,
    factor(
      enumFactorType(["MANUAL_POLICY", "CONSTRAINT"]),
      "Execution approval",
      decision.approvedForExecution
        ? "The decision is approved for execution."
        : "The decision is not approved for execution.",
      decision.approvedForExecution ? 0.8 : 1,
      decision.approvedForExecution,
      [],
      {
        approvedForExecution: decision.approvedForExecution,
        approvalRequired: decision.approvalRequired,
        status: decision.status,
        mode: decision.mode,
      },
    ),
    options,
  );

  if (decision.approvedForExecution) {
    state.primaryReasons.push(
      "The decision passed the current execution-approval checks.",
    );
  } else {
    state.primaryReasons.push(
      "Execution approval was withheld by portfolio controls.",
    );
  }

  if (decision.approvalRequired) {
    state.constraintsApplied.push(
      "Manual or external approval is required before execution.",
    );
  }

  for (const reason of decision.rejectionReasons) {
    state.risks.push(reason);
    state.constraintsApplied.push(reason);
  }

  for (const warning of decision.warnings) {
    state.risks.push(warning);
  }

  const quality = decision.dataQuality;
  const qualityScore =
    (quality.completenessScore +
      quality.freshnessScore +
      quality.consistencyScore) /
    3;

  addFactor(
    state,
    factor(
      enumFactorType(["OTHER", "CONSTRAINT"]),
      "Input data quality",
      `Data quality status is ${String(
        quality.status,
      )}; completeness ${quality.completenessScore.toFixed(
        4,
      )}, freshness ${quality.freshnessScore.toFixed(
        4,
      )}, consistency ${quality.consistencyScore.toFixed(4)}.`,
      clamp(qualityScore),
      qualityScore >= 0.7,
      [],
      {
        status: quality.status,
        completenessScore: quality.completenessScore,
        freshnessScore: quality.freshnessScore,
        consistencyScore: quality.consistencyScore,
        issueCount: quality.issues.length,
      },
    ),
    options,
  );

  if (qualityScore < 0.7 || quality.issues.length > 0) {
    state.risks.push(
      "Input data quality limitations reduce decision confidence.",
    );
    state.invalidationConditions.push(
      "Re-evaluate the decision when fresher or more complete portfolio data becomes available.",
    );
  }

  if (decision.expiresAt !== undefined) {
    state.invalidationConditions.push(
      `The decision expires at ${decision.expiresAt}.`,
    );
  }
}

function sortedFactors(
  factors: readonly PortfolioExplanationFactor[],
  maximum: number,
): readonly PortfolioExplanationFactor[] {
  return Object.freeze(
    [...factors]
      .sort((left, right) => {
        const impactDifference = right.impact - left.impact;

        if (impactDifference !== 0) {
          return impactDifference;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, maximum),
  );
}

function confidenceFromDecision(
  decision: ExplainableDecision,
  supporting: readonly PortfolioExplanationFactor[],
  conflicting: readonly PortfolioExplanationFactor[],
): number {
  const supportingImpact = supporting.reduce(
    (total, item) => total + item.impact,
    0,
  );
  const conflictingImpact = conflicting.reduce(
    (total, item) => total + item.impact,
    0,
  );
  const factorBalance =
    supportingImpact + conflictingImpact > 0
      ? supportingImpact /
        (supportingImpact + conflictingImpact)
      : 0.5;
  const health = clamp(decision.healthReport.overallScore);
  const dataQuality = clamp(
    (decision.dataQuality.completenessScore +
      decision.dataQuality.freshnessScore +
      decision.dataQuality.consistencyScore) /
      3,
  );
  const approval = decision.approvedForExecution ? 1 : 0.35;
  const optimization =
    decision.optimizationResult === undefined
      ? 0.5
      : decision.optimizationResult.diagnostics.converged
        ? 1
        : 0.35;

  return clamp(
    factorBalance * 0.25 +
      health * 0.25 +
      dataQuality * 0.25 +
      approval * 0.15 +
      optimization * 0.1,
  );
}

function buildSummary(
  decision: ExplainableDecision,
  primaryReasons: readonly string[],
): string {
  const disposition = decision.approvedForExecution
    ? "approved for execution"
    : decision.approvalRequired
      ? "awaiting required approval"
      : "not approved for execution";
  const action =
    decision.rebalancePlan !== undefined &&
    decision.rebalancePlan.trades.length > 0
      ? ` with ${decision.rebalancePlan.trades.length} planned rebalance trade(s)`
      : "";

  const reason =
    primaryReasons[0] ??
    "Portfolio health, risk, allocation, and control evidence were evaluated.";

  return `Portfolio decision ${decision.decisionId} is ${disposition}${action}. ${reason}`;
}

export function explainPortfolioDecision(
  decision: ExplainableDecision,
  options?: PortfolioExplainabilityEngineOptions,
  clock: PortfolioExplainabilityClock = SYSTEM_CLOCK,
): PortfolioDecisionExplanation {
  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  if (
    typeof decision.decisionId !== "string" ||
    decision.decisionId.trim().length === 0
  ) {
    throw new TypeError(
      "decision.decisionId must be a non-empty string.",
    );
  }

  if (
    typeof decision.portfolioId !== "string" ||
    decision.portfolioId.trim().length === 0
  ) {
    throw new TypeError(
      "decision.portfolioId must be a non-empty string.",
    );
  }

  const resolved = resolveOptions(options);
  const state: MutableExplanation = {
    primaryReasons: [],
    supportingFactors: [],
    conflictingFactors: [],
    constraintsApplied: [],
    expectedBenefits: [],
    risks: [],
    invalidationConditions: [],
  };

  addHealthFactors(decision, state, resolved);
  addCorrelationFactors(decision, state, resolved);
  addRiskBudgetFactors(decision, state, resolved);
  addOptimizationFactors(decision, state, resolved);
  addAllocationFactors(decision, state, resolved);
  addDriftFactors(decision, state, resolved);
  addRebalanceFactors(decision, state, resolved);
  addDecisionAndDataQualityFactors(
    decision,
    state,
    resolved,
  );

  const primaryReasons = unique(state.primaryReasons).slice(
    0,
    resolved.maximumPrimaryReasons,
  );
  const supportingFactors = sortedFactors(
    state.supportingFactors,
    resolved.maximumFactorsPerCategory,
  );
  const conflictingFactors = sortedFactors(
    state.conflictingFactors,
    resolved.maximumFactorsPerCategory,
  );
  const generatedAt = new Date(clock.now()).toISOString();
  const confidence = confidenceFromDecision(
    decision,
    supportingFactors,
    conflictingFactors,
  );

  return Object.freeze({
    explanationId: `${decision.decisionId}:explanation`,
    portfolioId: decision.portfolioId,
    decisionId: decision.decisionId,
    summary: buildSummary(decision, primaryReasons),
    primaryReasons: Object.freeze(primaryReasons),
    supportingFactors,
    conflictingFactors,
    constraintsApplied: unique(state.constraintsApplied),
    expectedBenefits: unique(state.expectedBenefits),
    risks: unique(state.risks),
    invalidationConditions: unique(
      state.invalidationConditions,
    ),
    confidence,
    modelVersion: resolved.modelVersion,
    generatedAt,
    metadata: Object.freeze({
      ...(resolved.metadata ?? {}),
      ...(decision.metadata ?? {}),
      requestId: decision.requestId,
      decisionStatus: decision.status,
      managerMode: decision.mode,
      supportingFactorCount: supportingFactors.length,
      conflictingFactorCount: conflictingFactors.length,
      approvedForExecution: decision.approvedForExecution,
      approvalRequired: decision.approvalRequired,
    }),
  });
}

export class DeterministicPortfolioExplainabilityEngine
  implements PortfolioExplainabilityEngine
{
  private readonly options: PortfolioExplainabilityEngineOptions;
  private readonly clock: PortfolioExplainabilityClock;

  public constructor(
    options: PortfolioExplainabilityEngineOptions = Object.freeze({}),
    clock: PortfolioExplainabilityClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({
      ...options,
      metadata: cloneMetadata(options.metadata),
    });
    this.clock = clock;
  }

  public explain(
    decision: ExplainableDecision,
  ): PortfolioDecisionExplanation {
    return explainPortfolioDecision(
      decision,
      this.options,
      this.clock,
    );
  }
}

export class AIPortfolioExplainabilityEngine extends DeterministicPortfolioExplainabilityEngine {}