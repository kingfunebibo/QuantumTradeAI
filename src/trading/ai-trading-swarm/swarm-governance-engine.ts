/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-governance-engine.ts
 *
 * Deterministic, immutable swarm governance and execution authorization.
 */

import {
  type TradingSwarmConsensusResult,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmGovernanceAssessment,
  type TradingSwarmGovernanceDecision,
  type TradingSwarmGovernanceEnginePort,
  type TradingSwarmGovernanceRule,
  type TradingSwarmGovernanceRuleResult,
  type TradingSwarmMetadata,
  type TradingSwarmMission,
  type TradingSwarmRiskAssessment,
  type TradingSwarmSafetyPolicy,
  type TradingSwarmTimestamp,
} from "./ai-trading-swarm-contracts";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type SwarmGovernanceEngineErrorCode =
  | "INVALID_MISSION"
  | "INVALID_CONSENSUS"
  | "INVALID_RISK_ASSESSMENT"
  | "INVALID_RULES"
  | "INVALID_SAFETY_POLICY"
  | "MISSION_MISMATCH"
  | "DUPLICATE_RULE"
  | "GOVERNANCE_EVALUATION_FAILED";

export interface SwarmGovernanceEngineErrorDetails {
  readonly missionId?: string;
  readonly consensusId?: string;
  readonly assessmentId?: string;
  readonly ruleId?: string;
  readonly field?: string;
  readonly cause?: unknown;
}

export class SwarmGovernanceEngineError extends Error {
  public readonly code: SwarmGovernanceEngineErrorCode;
  public readonly details: SwarmGovernanceEngineErrorDetails;

  public constructor(
    code: SwarmGovernanceEngineErrorCode,
    message: string,
    details: SwarmGovernanceEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmGovernanceEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmGovernanceEngineOptions {
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly assessedAtStrategy?:
    | "MISSION_TIME"
    | "CONSENSUS_TIME"
    | "RISK_TIME";
  readonly requireSelectedCandidate?: boolean;
  readonly requireConsensusSuccess?: boolean;
  readonly enforceRiskExecutionPermission?: boolean;
  readonly failOnUnknownRuleMetadata?: boolean;
}

interface NormalizedOptions {
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly assessedAtStrategy:
    | "MISSION_TIME"
    | "CONSENSUS_TIME"
    | "RISK_TIME";
  readonly requireSelectedCandidate: boolean;
  readonly requireConsensusSuccess: boolean;
  readonly enforceRiskExecutionPermission: boolean;
  readonly failOnUnknownRuleMetadata: boolean;
}

interface RuleEvaluationContext {
  readonly mission: TradingSwarmMission;
  readonly consensus: TradingSwarmConsensusResult;
  readonly risk: TradingSwarmRiskAssessment;
  readonly safety: TradingSwarmSafetyPolicy;
}

const EXECUTABLE_CONSENSUS_STATUSES = Object.freeze([
  "CONSENSUS_REACHED",
  "CONSENSUS_WITH_RESTRICTIONS",
] as const);

const KNOWN_RULE_METADATA_KEYS = Object.freeze([
  "minimumCollectiveConfidence",
  "maximumOverallRisk",
  "maximumSystemicRisk",
  "maximumExecutionRisk",
  "maximumCoordinationRisk",
  "maximumPartitionRisk",
  "requireExecutionAllowed",
  "requireQuorum",
  "requireSelectedCandidate",
  "requireNoVeto",
  "requireNoMaterialDissent",
  "requireNoBlockingFindings",
  "requireOperatorApproval",
  "prohibitOperatorApproval",
  "allowedConsensusStatuses",
  "prohibitedActionTypes",
  "requiredRestrictions",
  "maximumUnresolvedConflictCount",
] as const);

/* ========================================================================== *
 * Engine
 * ========================================================================== */

export class SwarmGovernanceEngine
  implements TradingSwarmGovernanceEnginePort
{
  private readonly options: NormalizedOptions;

  public constructor(
    options: SwarmGovernanceEngineOptions = {},
  ) {
    this.options = normalizeOptions(options);
  }

  public evaluate(
    mission: TradingSwarmMission,
    consensus: TradingSwarmConsensusResult,
    risk: TradingSwarmRiskAssessment,
    rules: readonly TradingSwarmGovernanceRule[],
    safety: TradingSwarmSafetyPolicy,
  ): TradingSwarmGovernanceAssessment {
    try {
      validateInputs(
        mission,
        consensus,
        risk,
        rules,
        safety,
      );

      const assessedAtMs = resolveAssessedAt(
        mission,
        consensus,
        risk,
        this.options.assessedAtStrategy,
      );

      const context: RuleEvaluationContext = {
        mission,
        consensus,
        risk,
        safety,
      };

      const builtInResults =
        this.evaluateBuiltInSafetyRules(context);

      const configuredResults = rules
        .filter(
          (rule) =>
            rule.enabled &&
            (
              rule.applicableObjectives.length === 0 ||
              rule.applicableObjectives.includes(
                mission.objective,
              )
            ),
        )
        .sort(compareRules)
        .map((rule) =>
          this.evaluateConfiguredRule(rule, context),
        );

      const ruleResults = Object.freeze(
        [...builtInResults, ...configuredResults]
          .map((result) => deepFreeze(result))
          .sort(compareRuleResults),
      );

      const blockingFailures = ruleResults.filter(
        (result) =>
          !result.passed && result.blocking,
      );

      const nonBlockingFailures = ruleResults.filter(
        (result) =>
          !result.passed && !result.blocking,
      );

      const operatorApprovalRequired =
        determineOperatorApprovalRequired(
          rules,
          context,
          blockingFailures,
          nonBlockingFailures,
          safety,
        );

      const decision = determineGovernanceDecision(
        context,
        blockingFailures,
        nonBlockingFailures,
        operatorApprovalRequired,
        safety,
      );

      const executionAuthorized =
        (
          decision === "APPROVED" ||
          decision === "APPROVED_WITH_RESTRICTIONS"
        ) &&
        risk.executionAllowed &&
        consensus.selectedCandidateId !== undefined &&
        EXECUTABLE_CONSENSUS_STATUSES.includes(
          consensus.status as
            (typeof EXECUTABLE_CONSENSUS_STATUSES)[number],
        );

      const restrictions = Object.freeze(
        uniqueSorted([
          ...risk.restrictions,
          ...ruleResults.flatMap(
            (result) => result.restrictions,
          ),
          ...(operatorApprovalRequired
            ? [
                "Operator approval is required before execution.",
              ]
            : []),
          ...(executionAuthorized
            ? []
            : [
                "Autonomous execution is not authorized.",
              ]),
        ]),
      );

      const base = {
        assessmentId: createAssessmentId(
          mission,
          consensus,
          risk,
          rules,
          safety,
          decision,
          ruleResults,
        ),
        missionId: mission.missionId,
        decision,
        ruleResults,
        riskAssessment: risk,
        executionAuthorized,
        operatorApprovalRequired,
        restrictions,
        assessedAtMs,
      } satisfies Omit<
        TradingSwarmGovernanceAssessment,
        "deterministicFingerprint"
      >;

      return deepFreeze({
        ...base,
        deterministicFingerprint:
          this.options.fingerprintGenerator.fingerprint(base),
      });
    } catch (error) {
      if (error instanceof SwarmGovernanceEngineError) {
        throw error;
      }

      throw new SwarmGovernanceEngineError(
        "GOVERNANCE_EVALUATION_FAILED",
        "Failed to evaluate deterministic swarm governance.",
        {
          missionId: mission?.missionId,
          consensusId: consensus?.consensusId,
          assessmentId: risk?.assessmentId,
          cause: error,
        },
      );
    }
  }

  private evaluateBuiltInSafetyRules(
    context: RuleEvaluationContext,
  ): readonly TradingSwarmGovernanceRuleResult[] {
    const results: TradingSwarmGovernanceRuleResult[] = [];
    const {
      consensus,
      risk,
      safety,
    } = context;

    results.push(
      createRuleResult(
        "builtin-consensus-quorum",
        consensus.quorumSatisfied,
        true,
        consensus.quorumSatisfied
          ? "Consensus quorum is satisfied."
          : "Consensus quorum is not satisfied.",
        consensus.quorumSatisfied
          ? []
          : ["Restore quorum before execution."],
      ),
    );

    const consensusSuccessful =
      EXECUTABLE_CONSENSUS_STATUSES.includes(
        consensus.status as
          (typeof EXECUTABLE_CONSENSUS_STATUSES)[number],
      );

    results.push(
      createRuleResult(
        "builtin-consensus-status",
        !this.options.requireConsensusSuccess ||
          consensusSuccessful,
        this.options.requireConsensusSuccess,
        consensusSuccessful
          ? `Consensus status ${consensus.status} is executable.`
          : `Consensus status ${consensus.status} is not executable.`,
        consensusSuccessful
          ? []
          : ["Resolve consensus before execution."],
      ),
    );

    const selectedCandidateSatisfied =
      consensus.selectedCandidateId !== undefined;

    results.push(
      createRuleResult(
        "builtin-selected-candidate",
        !this.options.requireSelectedCandidate ||
          selectedCandidateSatisfied,
        this.options.requireSelectedCandidate,
        selectedCandidateSatisfied
          ? `Selected candidate ${consensus.selectedCandidateId}.`
          : "No candidate was selected by consensus.",
        selectedCandidateSatisfied
          ? []
          : ["Select an approved decision candidate."],
      ),
    );

    results.push(
      createRuleResult(
        "builtin-collective-confidence",
        consensus.collectiveConfidence.finalConfidence >=
          safety.minimumCollectiveConfidence,
        safety.failClosed,
        `Collective confidence ${consensus.collectiveConfidence.finalConfidence.toFixed(6)}; minimum ${safety.minimumCollectiveConfidence.toFixed(6)}.`,
        consensus.collectiveConfidence.finalConfidence >=
          safety.minimumCollectiveConfidence
          ? []
          : [
              "Increase collective confidence before execution.",
            ],
      ),
    );

    results.push(
      createRuleResult(
        "builtin-systemic-risk",
        risk.systemicRisk <=
          safety.maximumSystemicRisk,
        true,
        `Systemic risk ${risk.systemicRisk.toFixed(6)}; maximum ${safety.maximumSystemicRisk.toFixed(6)}.`,
        risk.systemicRisk <= safety.maximumSystemicRisk
          ? []
          : ["Reduce systemic risk before execution."],
      ),
    );

    results.push(
      createRuleResult(
        "builtin-execution-risk",
        risk.executionRisk <=
          safety.maximumExecutionRisk,
        true,
        `Execution risk ${risk.executionRisk.toFixed(6)}; maximum ${safety.maximumExecutionRisk.toFixed(6)}.`,
        risk.executionRisk <= safety.maximumExecutionRisk
          ? []
          : ["Reduce execution risk before execution."],
      ),
    );

    results.push(
      createRuleResult(
        "builtin-partition-coverage",
        consensus.partitionCoverageRatio >=
          safety.minimumPartitionCoverage,
        safety.failClosed,
        `Partition coverage ${consensus.partitionCoverageRatio.toFixed(6)}; minimum ${safety.minimumPartitionCoverage.toFixed(6)}.`,
        consensus.partitionCoverageRatio >=
          safety.minimumPartitionCoverage
          ? []
          : ["Restore required partition coverage."],
      ),
    );

    const materialDissent =
      consensus.dissent.filter(
        (record) => record.material,
      );

    results.push(
      createRuleResult(
        "builtin-material-dissent",
        !safety.rejectOnUnresolvedMaterialDissent ||
          materialDissent.length === 0,
        safety.rejectOnUnresolvedMaterialDissent,
        materialDissent.length === 0
          ? "No unresolved material dissent."
          : `${materialDissent.length} unresolved material dissent records.`,
        materialDissent.length === 0
          ? []
          : [
              "Resolve material dissent or require operator approval.",
            ],
      ),
    );

    const criticalFindings = risk.findings.filter(
      (finding) =>
        finding.severity === "CRITICAL",
    );

    results.push(
      createRuleResult(
        "builtin-critical-findings",
        !safety.rejectOnCriticalAnomaly ||
          criticalFindings.length === 0,
        safety.rejectOnCriticalAnomaly,
        criticalFindings.length === 0
          ? "No critical risk findings."
          : `${criticalFindings.length} critical risk findings detected.`,
        criticalFindings.length === 0
          ? []
          : criticalFindings.flatMap(
              (finding) => finding.mitigations,
            ),
      ),
    );

    const blockingFindings = risk.findings.filter(
      (finding) => finding.blocking,
    );

    results.push(
      createRuleResult(
        "builtin-blocking-findings",
        blockingFindings.length === 0,
        true,
        blockingFindings.length === 0
          ? "No blocking risk findings."
          : `${blockingFindings.length} blocking risk findings detected.`,
        blockingFindings.flatMap(
          (finding) => finding.mitigations,
        ),
      ),
    );

    results.push(
      createRuleResult(
        "builtin-risk-execution-permission",
        !this.options.enforceRiskExecutionPermission ||
          risk.executionAllowed,
        this.options.enforceRiskExecutionPermission,
        risk.executionAllowed
          ? "Risk engine permits execution."
          : "Risk engine does not permit execution.",
        risk.executionAllowed
          ? []
          : ["Obtain a new passing risk assessment."],
      ),
    );

    results.push(
      createRuleResult(
        "builtin-veto",
        consensus.vetoCount === 0,
        true,
        consensus.vetoCount === 0
          ? "No veto was recorded."
          : `${consensus.vetoCount} veto ballots were recorded.`,
        consensus.vetoCount === 0
          ? []
          : ["Resolve governance veto before execution."],
      ),
    );

    return Object.freeze(results);
  }

  private evaluateConfiguredRule(
    rule: TradingSwarmGovernanceRule,
    context: RuleEvaluationContext,
  ): TradingSwarmGovernanceRuleResult {
    const metadata = rule.metadata ?? Object.freeze({});
    const restrictions: string[] = [];
    const failures: string[] = [];

    this.evaluateNumericMaximum(
      metadata,
      "maximumOverallRisk",
      context.risk.overallRisk,
      failures,
    );
    this.evaluateNumericMaximum(
      metadata,
      "maximumSystemicRisk",
      context.risk.systemicRisk,
      failures,
    );
    this.evaluateNumericMaximum(
      metadata,
      "maximumExecutionRisk",
      context.risk.executionRisk,
      failures,
    );
    this.evaluateNumericMaximum(
      metadata,
      "maximumCoordinationRisk",
      context.risk.coordinationRisk,
      failures,
    );
    this.evaluateNumericMaximum(
      metadata,
      "maximumPartitionRisk",
      context.risk.partitionRisk,
      failures,
    );
    this.evaluateNumericMinimum(
      metadata,
      "minimumCollectiveConfidence",
      context.consensus.collectiveConfidence.finalConfidence,
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireExecutionAllowed",
      context.risk.executionAllowed,
      "Risk execution permission is required.",
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireQuorum",
      context.consensus.quorumSatisfied,
      "Consensus quorum is required.",
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireSelectedCandidate",
      context.consensus.selectedCandidateId !== undefined,
      "A selected consensus candidate is required.",
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireNoVeto",
      context.consensus.vetoCount === 0,
      "Consensus veto must be absent.",
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireNoMaterialDissent",
      !context.consensus.dissent.some(
        (record) => record.material,
      ),
      "Material dissent must be resolved.",
      failures,
    );

    evaluateBooleanRequirement(
      metadata,
      "requireNoBlockingFindings",
      !context.risk.findings.some(
        (finding) => finding.blocking,
      ),
      "Blocking risk findings must be resolved.",
      failures,
    );

    const maximumUnresolvedConflictCount =
      readFiniteNumber(
        metadata,
        "maximumUnresolvedConflictCount",
      );

    if (
      maximumUnresolvedConflictCount !== undefined &&
      context.consensus.unresolvedConflictIds.length >
        maximumUnresolvedConflictCount
    ) {
      failures.push(
        `Unresolved conflict count ${context.consensus.unresolvedConflictIds.length} exceeds maximum ${maximumUnresolvedConflictCount}.`,
      );
    }

    const allowedStatuses = readStringArray(
      metadata,
      "allowedConsensusStatuses",
    );

    if (
      allowedStatuses !== undefined &&
      !allowedStatuses.includes(
        context.consensus.status,
      )
    ) {
      failures.push(
        `Consensus status ${context.consensus.status} is not allowed.`,
      );
    }

    const requiredRestrictions = readStringArray(
      metadata,
      "requiredRestrictions",
    );

    if (requiredRestrictions !== undefined) {
      restrictions.push(...requiredRestrictions);
    }

    const prohibitedActionTypes =
      readStringArray(
        metadata,
        "prohibitedActionTypes",
      );

    if (
      prohibitedActionTypes !== undefined &&
      prohibitedActionTypes.length > 0
    ) {
      restrictions.push(
        ...prohibitedActionTypes.map(
          (actionType) =>
            `Action type ${actionType} is prohibited by rule ${rule.ruleId}.`,
        ),
      );
    }

    if (this.options.failOnUnknownRuleMetadata) {
      const unknownKeys = Object.keys(metadata).filter(
        (key) =>
          !KNOWN_RULE_METADATA_KEYS.includes(
            key as
              (typeof KNOWN_RULE_METADATA_KEYS)[number],
          ),
      );

      if (unknownKeys.length > 0) {
        failures.push(
          `Unknown rule metadata keys: ${unknownKeys.sort().join(", ")}.`,
        );
      }
    }

    const passed = failures.length === 0;

    return createRuleResult(
      rule.ruleId,
      passed,
      rule.blocking,
      passed
        ? `Governance rule "${rule.name}" passed.`
        : `Governance rule "${rule.name}" failed: ${failures.join(" ")}`,
      [
        ...restrictions,
        ...(passed
          ? []
          : [
              `Satisfy governance rule "${rule.name}".`,
            ]),
      ],
    );
  }

  private evaluateNumericMaximum(
    metadata: TradingSwarmMetadata,
    key: string,
    actual: number,
    failures: string[],
  ): void {
    const maximum = readFiniteNumber(
      metadata,
      key,
    );

    if (
      maximum !== undefined &&
      actual > maximum
    ) {
      failures.push(
        `${key} exceeded: actual ${actual.toFixed(6)}, maximum ${maximum.toFixed(6)}.`,
      );
    }
  }

  private evaluateNumericMinimum(
    metadata: TradingSwarmMetadata,
    key: string,
    actual: number,
    failures: string[],
  ): void {
    const minimum = readFiniteNumber(
      metadata,
      key,
    );

    if (
      minimum !== undefined &&
      actual < minimum
    ) {
      failures.push(
        `${key} not satisfied: actual ${actual.toFixed(6)}, minimum ${minimum.toFixed(6)}.`,
      );
    }
  }
}

/* ========================================================================== *
 * Decision logic
 * ========================================================================== */

function determineOperatorApprovalRequired(
  rules: readonly TradingSwarmGovernanceRule[],
  context: RuleEvaluationContext,
  blockingFailures: readonly TradingSwarmGovernanceRuleResult[],
  nonBlockingFailures: readonly TradingSwarmGovernanceRuleResult[],
  safety: TradingSwarmSafetyPolicy,
): boolean {
  const applicableRules = rules.filter(
    (rule) =>
      rule.enabled &&
      (
        rule.applicableObjectives.length === 0 ||
        rule.applicableObjectives.includes(
          context.mission.objective,
        )
      ),
  );

  const explicitlyRequired =
    applicableRules.some(
      (rule) =>
        readBoolean(
          rule.metadata,
          "requireOperatorApproval",
        ) === true,
    );

  const explicitlyProhibited =
    applicableRules.some(
      (rule) =>
        readBoolean(
          rule.metadata,
          "prohibitOperatorApproval",
        ) === true,
    );

  if (explicitlyProhibited) {
    return false;
  }

  if (explicitlyRequired) {
    return true;
  }

  if (
    safety.allowOperatorOverride &&
    (
      blockingFailures.length > 0 ||
      nonBlockingFailures.length > 0 ||
      !context.risk.executionAllowed ||
      context.consensus.status === "DEFERRED" ||
      context.consensus.status === "DEADLOCKED"
    )
  ) {
    return true;
  }

  return false;
}

function determineGovernanceDecision(
  context: RuleEvaluationContext,
  blockingFailures: readonly TradingSwarmGovernanceRuleResult[],
  nonBlockingFailures: readonly TradingSwarmGovernanceRuleResult[],
  operatorApprovalRequired: boolean,
  safety: TradingSwarmSafetyPolicy,
): TradingSwarmGovernanceDecision {
  const consensusRejected =
    context.consensus.status === "REJECTED" ||
    context.consensus.status === "VETOED" ||
    context.consensus.status === "NO_QUORUM";

  if (
    consensusRejected &&
    !(
      operatorApprovalRequired &&
      safety.allowOperatorOverride
    )
  ) {
    return "REJECTED";
  }

  if (
    blockingFailures.length > 0
  ) {
    if (
      operatorApprovalRequired &&
      safety.allowOperatorOverride
    ) {
      return "REQUIRES_OPERATOR_APPROVAL";
    }

    return safety.failClosed
      ? "REJECTED"
      : "DEFERRED";
  }

  if (operatorApprovalRequired) {
    return "REQUIRES_OPERATOR_APPROVAL";
  }

  if (
    context.consensus.status === "DEFERRED" ||
    context.consensus.status === "DEADLOCKED"
  ) {
    return "DEFERRED";
  }

  if (
    nonBlockingFailures.length > 0 ||
    context.risk.restrictions.length > 0 ||
    context.consensus.status ===
      "CONSENSUS_WITH_RESTRICTIONS"
  ) {
    return "APPROVED_WITH_RESTRICTIONS";
  }

  if (
    context.risk.executionAllowed &&
    context.consensus.selectedCandidateId !== undefined
  ) {
    return "APPROVED";
  }

  return safety.failClosed
    ? "REJECTED"
    : "DEFERRED";
}

/* ========================================================================== *
 * Rule utilities
 * ========================================================================== */

function createRuleResult(
  ruleId: string,
  passed: boolean,
  blocking: boolean,
  message: string,
  restrictions: readonly string[],
): TradingSwarmGovernanceRuleResult {
  return deepFreeze({
    ruleId,
    passed,
    blocking,
    message,
    restrictions: Object.freeze(
      uniqueSorted(restrictions),
    ),
  });
}

function compareRules(
  left: TradingSwarmGovernanceRule,
  right: TradingSwarmGovernanceRule,
): number {
  const priorityOrder =
    priorityRank(right.priority) -
    priorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  if (left.blocking !== right.blocking) {
    return left.blocking ? -1 : 1;
  }

  return left.ruleId.localeCompare(
    right.ruleId,
  );
}

function compareRuleResults(
  left: TradingSwarmGovernanceRuleResult,
  right: TradingSwarmGovernanceRuleResult,
): number {
  if (left.passed !== right.passed) {
    return left.passed ? 1 : -1;
  }

  if (left.blocking !== right.blocking) {
    return left.blocking ? -1 : 1;
  }

  return left.ruleId.localeCompare(
    right.ruleId,
  );
}

function priorityRank(priority: string): number {
  switch (priority) {
    case "BACKGROUND":
      return 0;
    case "LOW":
      return 1;
    case "NORMAL":
      return 2;
    case "HIGH":
      return 3;
    case "VERY_HIGH":
      return 4;
    case "CRITICAL":
      return 5;
    case "EMERGENCY":
      return 6;
    default:
      return 0;
  }
}

function evaluateBooleanRequirement(
  metadata: TradingSwarmMetadata,
  key: string,
  actual: boolean,
  failureMessage: string,
  failures: string[],
): void {
  const required = readBoolean(
    metadata,
    key,
  );

  if (required === true && !actual) {
    failures.push(failureMessage);
  }
}

function readBoolean(
  metadata: TradingSwarmMetadata | undefined,
  key: string,
): boolean | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const value = metadata[key];

  return typeof value === "boolean"
    ? value
    : undefined;
}

function readFiniteNumber(
  metadata: TradingSwarmMetadata,
  key: string,
): number | undefined {
  const value = metadata[key];

  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : undefined;
}

function readStringArray(
  metadata: TradingSwarmMetadata,
  key: string,
): readonly string[] | undefined {
  const value = metadata[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter(
    (item): item is string =>
      typeof item === "string",
  );

  return Object.freeze(
    uniqueSorted(strings),
  );
}

/* ========================================================================== *
 * Validation
 * ========================================================================== */

function validateInputs(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  risk: TradingSwarmRiskAssessment,
  rules: readonly TradingSwarmGovernanceRule[],
  safety: TradingSwarmSafetyPolicy,
): void {
  if (
    mission === undefined ||
    mission === null ||
    typeof mission.missionId !== "string" ||
    mission.missionId.trim().length === 0
  ) {
    throw new SwarmGovernanceEngineError(
      "INVALID_MISSION",
      "A valid mission is required.",
    );
  }

  if (
    consensus === undefined ||
    consensus === null ||
    typeof consensus.consensusId !== "string" ||
    consensus.consensusId.trim().length === 0
  ) {
    throw new SwarmGovernanceEngineError(
      "INVALID_CONSENSUS",
      "A valid consensus result is required.",
      { missionId: mission.missionId },
    );
  }

  if (consensus.missionId !== mission.missionId) {
    throw new SwarmGovernanceEngineError(
      "MISSION_MISMATCH",
      "Consensus belongs to another mission.",
      {
        missionId: mission.missionId,
        consensusId: consensus.consensusId,
      },
    );
  }

  if (
    risk === undefined ||
    risk === null ||
    typeof risk.assessmentId !== "string" ||
    risk.assessmentId.trim().length === 0
  ) {
    throw new SwarmGovernanceEngineError(
      "INVALID_RISK_ASSESSMENT",
      "A valid risk assessment is required.",
      {
        missionId: mission.missionId,
        consensusId: consensus.consensusId,
      },
    );
  }

  if (!Array.isArray(rules)) {
    throw new SwarmGovernanceEngineError(
      "INVALID_RULES",
      "rules must be an array.",
      { missionId: mission.missionId },
    );
  }

  const ruleIds = new Set<string>();

  for (const rule of rules) {
    if (
      typeof rule.ruleId !== "string" ||
      rule.ruleId.trim().length === 0
    ) {
      throw new SwarmGovernanceEngineError(
        "INVALID_RULES",
        "Every governance rule must have a non-empty ruleId.",
        { missionId: mission.missionId },
      );
    }

    if (ruleIds.has(rule.ruleId)) {
      throw new SwarmGovernanceEngineError(
        "DUPLICATE_RULE",
        `Duplicate governance rule "${rule.ruleId}".`,
        {
          missionId: mission.missionId,
          ruleId: rule.ruleId,
        },
      );
    }

    ruleIds.add(rule.ruleId);
  }

  validateSafetyPolicy(safety);
}

function validateSafetyPolicy(
  safety: TradingSwarmSafetyPolicy,
): void {
  if (safety === undefined || safety === null) {
    throw new SwarmGovernanceEngineError(
      "INVALID_SAFETY_POLICY",
      "A safety policy is required.",
    );
  }

  for (
    const [field, value] of [
      [
        "minimumCollectiveConfidence",
        safety.minimumCollectiveConfidence,
      ],
      [
        "minimumNodeReliability",
        safety.minimumNodeReliability,
      ],
      [
        "minimumPartitionCoverage",
        safety.minimumPartitionCoverage,
      ],
      [
        "maximumSystemicRisk",
        safety.maximumSystemicRisk,
      ],
      [
        "maximumExecutionRisk",
        safety.maximumExecutionRisk,
      ],
      [
        "maximumFailedNodeRatio",
        safety.maximumFailedNodeRatio,
      ],
      [
        "maximumUnsynchronizedNodeRatio",
        safety.maximumUnsynchronizedNodeRatio,
      ],
    ] as const
  ) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new SwarmGovernanceEngineError(
        "INVALID_SAFETY_POLICY",
        `${field} must be between 0 and 1.`,
        { field },
      );
    }
  }

  for (
    const [field, value] of [
      [
        "maximumCapitalAtRisk",
        safety.maximumCapitalAtRisk,
      ],
      ["maximumLeverage", safety.maximumLeverage],
      ["maximumDrawdown", safety.maximumDrawdown],
    ] as const
  ) {
    if (!Number.isFinite(value) || value < 0) {
      throw new SwarmGovernanceEngineError(
        "INVALID_SAFETY_POLICY",
        `${field} must be non-negative and finite.`,
        { field },
      );
    }
  }
}

/* ========================================================================== *
 * Identity, configuration, and factory
 * ========================================================================== */

function createAssessmentId(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  risk: TradingSwarmRiskAssessment,
  rules: readonly TradingSwarmGovernanceRule[],
  safety: TradingSwarmSafetyPolicy,
  decision: TradingSwarmGovernanceDecision,
  results: readonly TradingSwarmGovernanceRuleResult[],
): string {
  return `swarm-governance-assessment-${stableHash(
    stableStringify({
      missionId: mission.missionId,
      missionFingerprint:
        mission.deterministicFingerprint,
      consensusId: consensus.consensusId,
      consensusFingerprint:
        consensus.deterministicFingerprint,
      riskAssessmentId: risk.assessmentId,
      riskFingerprint:
        risk.deterministicFingerprint,
      rules: [...rules]
        .sort(compareRules)
        .map((rule) => ({
          ruleId: rule.ruleId,
          enabled: rule.enabled,
          priority: rule.priority,
          blocking: rule.blocking,
          applicableObjectives:
            rule.applicableObjectives,
          metadata: rule.metadata ?? null,
        })),
      safety,
      decision,
      results,
    }),
  )}`;
}

function resolveAssessedAt(
  mission: TradingSwarmMission,
  consensus: TradingSwarmConsensusResult,
  risk: TradingSwarmRiskAssessment,
  strategy: NormalizedOptions["assessedAtStrategy"],
): TradingSwarmTimestamp {
  switch (strategy) {
    case "MISSION_TIME":
      return mission.createdAtMs;
    case "CONSENSUS_TIME":
      return consensus.formedAtMs;
    case "RISK_TIME":
      return risk.assessedAtMs;
  }
}

function normalizeOptions(
  options: SwarmGovernanceEngineOptions = {},
): NormalizedOptions {
  return Object.freeze({
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmGovernanceFingerprintGenerator(),
    assessedAtStrategy:
      options.assessedAtStrategy ?? "RISK_TIME",
    requireSelectedCandidate:
      options.requireSelectedCandidate ?? true,
    requireConsensusSuccess:
      options.requireConsensusSuccess ?? true,
    enforceRiskExecutionPermission:
      options.enforceRiskExecutionPermission ?? true,
    failOnUnknownRuleMetadata:
      options.failOnUnknownRuleMetadata ?? false,
  });
}

export function createSwarmGovernanceEngine(
  options: SwarmGovernanceEngineOptions = {},
): SwarmGovernanceEngine {
  return new SwarmGovernanceEngine(options);
}

export class StableSwarmGovernanceFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-governance-fp-${stableHash(
      stableStringify(value),
    )}`;
  }
}

/* ========================================================================== *
 * Deterministic utilities
 * ========================================================================== */

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return Object.freeze(
    [
      ...new Set(
        values.filter(
          (value) =>
            typeof value === "string" &&
            value.trim().length > 0,
        ),
      ),
    ].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function deepFreeze<TValue>(
  value: TValue,
): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key);
      deepFreeze(item);
    }
  } else if (value instanceof Set) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (
      const key of Object.keys(value as object)
    ) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}

function stableStringify(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeForStableJson(value),
  );
}

function normalizeForStableJson(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeForStableJson,
    );
  }

  if (value instanceof Set) {
    return [...value]
      .map(normalizeForStableJson)
      .sort(compareNormalized);
  }

  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) =>
        String(left).localeCompare(
          String(right),
        ),
      )
      .map(([key, item]) => [
        normalizeForStableJson(key),
        normalizeForStableJson(item),
      ]);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (
      const key of Object.keys(value).sort()
    ) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      result[key] =
        normalizeForStableJson(item);
    }

    return result;
  }

  return String(value);
}

function compareNormalized(
  left: unknown,
  right: unknown,
): number {
  return JSON.stringify(left).localeCompare(
    JSON.stringify(right),
  );
}

function stableHash(
  value: string,
): string {
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(
      hash,
      0x01000193,
    );
  }

  return (hash >>> 0)
    .toString(16)
    .padStart(8, "0");
}

// End of swarm-governance-engine.ts