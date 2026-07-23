/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-selector.ts
 *
 * Production-grade deterministic agent selection with eligibility filtering,
 * required-role enforcement, objective capability coverage, trust-aware ranking,
 * health-aware ranking, and diversity-aware portfolio construction.
 */

import {
  type MultiAgentAgentSelectionPolicy,
  type MultiAgentCapability,
  type MultiAgentCapabilityDeclaration,
  type MultiAgentHealthSnapshot,
  type MultiAgentId,
  type MultiAgentRegistration,
  type MultiAgentRole,
  type MultiAgentRunRequest,
  type MultiAgentScore,
  type MultiAgentSelectorPort,
  type MultiAgentTrustScore,
} from "./ai-multi-agent-contracts";

export type MultiAgentSelectorErrorCode =
  | "INVALID_INPUT"
  | "DUPLICATE_AGENT_ID"
  | "DUPLICATE_HEALTH_SNAPSHOT"
  | "DUPLICATE_TRUST_SCORE"
  | "UNSATISFIED_REQUIRED_ROLE"
  | "INSUFFICIENT_ELIGIBLE_AGENTS"
  | "CAPABILITY_COVERAGE_UNSATISFIED";

export interface MultiAgentSelectorErrorDetails {
  readonly field?: string;
  readonly agentId?: MultiAgentId;
  readonly role?: MultiAgentRole;
  readonly capability?: MultiAgentCapability;
  readonly requiredCount?: number;
  readonly eligibleCount?: number;
}

export class MultiAgentSelectorError extends Error {
  public readonly code: MultiAgentSelectorErrorCode;
  public readonly details: MultiAgentSelectorErrorDetails;

  public constructor(
    code: MultiAgentSelectorErrorCode,
    message: string,
    details: MultiAgentSelectorErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentSelectorError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export interface MultiAgentSelectorOptions {
  readonly defaultMissingHealthScore?: MultiAgentScore;
  readonly defaultMissingTrustScore?: MultiAgentScore;
  readonly preferredAgentBonus?: number;
  readonly deterministicAgentBonus?: number;
  readonly replaySafeAgentBonus?: number;
  readonly requiredRoleBonus?: number;
  readonly capabilityCoverageBonus?: number;
  readonly busyAgentPenalty?: number;
  readonly rateLimitedAgentPenalty?: number;
}

export interface MultiAgentAgentSelectionScore {
  readonly agentId: MultiAgentId;
  readonly eligible: boolean;
  readonly exclusionReasons: readonly string[];
  readonly readinessScore: MultiAgentScore;
  readonly reliabilityScore: MultiAgentScore;
  readonly proficiencyScore: MultiAgentScore;
  readonly latencyScore: MultiAgentScore;
  readonly diversityScore: MultiAgentScore;
  readonly preferenceAdjustment: number;
  readonly determinismAdjustment: number;
  readonly operationalAdjustment: number;
  readonly totalScore: MultiAgentScore;
}

export interface MultiAgentSelectionReport {
  readonly selectedAgents: readonly MultiAgentRegistration[];
  readonly scores: readonly MultiAgentAgentSelectionScore[];
  readonly requiredRoles: readonly MultiAgentRole[];
  readonly requiredCapabilities: readonly MultiAgentCapability[];
  readonly coveredCapabilities: readonly MultiAgentCapability[];
  readonly uncoveredCapabilities: readonly MultiAgentCapability[];
}

interface NormalizedOptions {
  readonly defaultMissingHealthScore: MultiAgentScore;
  readonly defaultMissingTrustScore: MultiAgentScore;
  readonly preferredAgentBonus: number;
  readonly deterministicAgentBonus: number;
  readonly replaySafeAgentBonus: number;
  readonly requiredRoleBonus: number;
  readonly capabilityCoverageBonus: number;
  readonly busyAgentPenalty: number;
  readonly rateLimitedAgentPenalty: number;
}

interface Candidate {
  readonly registration: MultiAgentRegistration;
  readonly health?: MultiAgentHealthSnapshot;
  readonly trust?: MultiAgentTrustScore;
  readonly readinessScore: MultiAgentScore;
  readonly reliabilityScore: MultiAgentScore;
  readonly proficiencyScore: MultiAgentScore;
  readonly latencyScore: MultiAgentScore;
  readonly preferenceAdjustment: number;
  readonly determinismAdjustment: number;
  readonly operationalAdjustment: number;
  readonly baseScore: MultiAgentScore;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  defaultMissingHealthScore: 0 as MultiAgentScore,
  defaultMissingTrustScore: 0.5 as MultiAgentScore,
  preferredAgentBonus: 0.08,
  deterministicAgentBonus: 0.04,
  replaySafeAgentBonus: 0.02,
  requiredRoleBonus: 0.1,
  capabilityCoverageBonus: 0.08,
  busyAgentPenalty: 0.08,
  rateLimitedAgentPenalty: 0.15,
});

const OBJECTIVE_CAPABILITIES = Object.freeze({
  MARKET_ASSESSMENT: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "ASSESS_MARKET_REGIME",
    "ASSESS_VOLATILITY",
    "ASSESS_LIQUIDITY",
    "ASSESS_RISK",
  ] satisfies readonly MultiAgentCapability[]),
  TRADE_DECISION: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "ASSESS_MARKET_REGIME",
    "ASSESS_RISK",
    "PROPOSE_DECISION",
    "REVIEW_PROPOSAL",
    "VOTE",
  ] satisfies readonly MultiAgentCapability[]),
  STRATEGY_ORCHESTRATION: Object.freeze([
    "ASSESS_STRATEGY",
    "SELECT_STRATEGIES",
    "ALLOCATE_STRATEGY_CAPITAL",
    "ASSESS_RISK",
    "PROPOSE_DECISION",
  ] satisfies readonly MultiAgentCapability[]),
  PORTFOLIO_REBALANCE: Object.freeze([
    "ASSESS_PORTFOLIO",
    "ASSESS_RISK",
    "ASSESS_CORRELATION",
    "PROPOSE_DECISION",
    "REVIEW_PROPOSAL",
  ] satisfies readonly MultiAgentCapability[]),
  RISK_RESPONSE: Object.freeze([
    "ASSESS_RISK",
    "ASSESS_PORTFOLIO",
    "REVIEW_PROPOSAL",
    "CHALLENGE_PROPOSAL",
    "VOTE",
  ] satisfies readonly MultiAgentCapability[]),
  ARBITRAGE_DECISION: Object.freeze([
    "ASSESS_ARBITRAGE",
    "ASSESS_LIQUIDITY",
    "ASSESS_RISK",
    "PROPOSE_DECISION",
    "REVIEW_PROPOSAL",
  ] satisfies readonly MultiAgentCapability[]),
  EXECUTION_REVIEW: Object.freeze([
    "ASSESS_RISK",
    "REVIEW_PROPOSAL",
    "VOTE",
  ] satisfies readonly MultiAgentCapability[]),
  FULL_COLLABORATIVE_DECISION: Object.freeze([
    "OBSERVE_MARKET_INTELLIGENCE",
    "ASSESS_MARKET_REGIME",
    "ASSESS_PORTFOLIO",
    "ASSESS_RISK",
    "ASSESS_STRATEGY",
    "ASSESS_ARBITRAGE",
    "PROPOSE_DECISION",
    "REVIEW_PROPOSAL",
    "CHALLENGE_PROPOSAL",
    "VOTE",
    "ARBITRATE_CONFLICT",
  ] satisfies readonly MultiAgentCapability[]),
} satisfies Readonly<
  Record<
    MultiAgentRunRequest["objective"],
    readonly MultiAgentCapability[]
  >
>);

export class MultiAgentSelector implements MultiAgentSelectorPort {
  private readonly options: NormalizedOptions;

  public constructor(options: MultiAgentSelectorOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public select(
    request: MultiAgentRunRequest,
    registrations: readonly MultiAgentRegistration[],
    health: readonly MultiAgentHealthSnapshot[],
    trust: readonly MultiAgentTrustScore[],
  ): readonly MultiAgentRegistration[] {
    return this.selectWithReport(request, registrations, health, trust)
      .selectedAgents;
  }

  public selectWithReport(
    request: MultiAgentRunRequest,
    registrations: readonly MultiAgentRegistration[],
    health: readonly MultiAgentHealthSnapshot[],
    trust: readonly MultiAgentTrustScore[],
  ): MultiAgentSelectionReport {
    validateInputs(request, registrations, health, trust);

    const policy = request.configuration.agentSelection;
    validatePolicy(policy);

    const healthByAgentId = indexHealth(health);
    const trustByAgentId = indexTrust(trust);
    const preferredAgentIds = new Set(request.preferredAgentIds ?? []);
    const excludedAgentIds = new Set(request.excludedAgentIds ?? []);
    const requiredRoles = uniqueSorted([
      ...policy.requiredRoles,
      ...(request.requiredRoles ?? []),
    ]);
    const requiredCapabilities = uniqueSorted(
      OBJECTIVE_CAPABILITIES[request.objective],
    );

    const scoreRecords: MultiAgentAgentSelectionScore[] = [];
    const candidates: Candidate[] = [];

    for (const registration of registrations) {
      const agentId = registration.identity.agentId;
      const agentHealth = healthByAgentId.get(agentId);
      const agentTrust = trustByAgentId.get(agentId);
      const exclusionReasons = determineExclusionReasons(
        registration,
        agentHealth,
        request,
        policy,
        excludedAgentIds,
        this.options,
      );

      const candidate = buildCandidate(
        registration,
        agentHealth,
        agentTrust,
        preferredAgentIds,
        requiredRoles,
        requiredCapabilities,
        policy,
        this.options,
      );

      scoreRecords.push(
        freezeScoreRecord({
          agentId,
          eligible: exclusionReasons.length === 0,
          exclusionReasons: Object.freeze([...exclusionReasons]),
          readinessScore: candidate.readinessScore,
          reliabilityScore: candidate.reliabilityScore,
          proficiencyScore: candidate.proficiencyScore,
          latencyScore: candidate.latencyScore,
          diversityScore: 0 as MultiAgentScore,
          preferenceAdjustment: candidate.preferenceAdjustment,
          determinismAdjustment: candidate.determinismAdjustment,
          operationalAdjustment: candidate.operationalAdjustment,
          totalScore: candidate.baseScore,
        }),
      );

      if (exclusionReasons.length === 0) {
        candidates.push(candidate);
      }
    }

    if (candidates.length < policy.minimumAgents) {
      throw new MultiAgentSelectorError(
        "INSUFFICIENT_ELIGIBLE_AGENTS",
        `Only ${candidates.length} eligible agents are available; at least ${policy.minimumAgents} are required.`,
        {
          field: "agentSelection.minimumAgents",
          requiredCount: policy.minimumAgents,
          eligibleCount: candidates.length,
        },
      );
    }

    const selected: Candidate[] = [];
    const selectedIds = new Set<MultiAgentId>();

    for (const role of requiredRoles) {
      const roleCandidates = candidates.filter(
        (candidate) =>
          candidate.registration.identity.role === role &&
          !selectedIds.has(candidate.registration.identity.agentId),
      );

      const best = chooseBestCandidate(
        roleCandidates,
        selected,
        policy,
        requiredCapabilities,
      );

      if (best === undefined) {
        throw new MultiAgentSelectorError(
          "UNSATISFIED_REQUIRED_ROLE",
          `No eligible agent can satisfy required role "${role}".`,
          {
            field: "requiredRoles",
            role,
          },
        );
      }

      selected.push(best);
      selectedIds.add(best.registration.identity.agentId);
    }

    if (policy.requireCapabilityCoverage) {
      for (const capability of requiredCapabilities) {
        if (selectionCoversCapability(selected, capability)) {
          continue;
        }

        const capabilityCandidates = candidates.filter(
          (candidate) =>
            !selectedIds.has(candidate.registration.identity.agentId) &&
            candidateHasCapability(candidate, capability),
        );

        const best = chooseBestCandidate(
          capabilityCandidates,
          selected,
          policy,
          requiredCapabilities,
        );

        if (best === undefined) {
          throw new MultiAgentSelectorError(
            "CAPABILITY_COVERAGE_UNSATISFIED",
            `No eligible agent can satisfy required capability "${capability}".`,
            {
              field: "agentSelection.requireCapabilityCoverage",
              capability,
            },
          );
        }

        if (selected.length >= policy.maximumAgents) {
          throw new MultiAgentSelectorError(
            "CAPABILITY_COVERAGE_UNSATISFIED",
            `Capability "${capability}" cannot be added without exceeding maximumAgents.`,
            {
              field: "agentSelection.maximumAgents",
              capability,
              requiredCount: selected.length + 1,
            },
          );
        }

        selected.push(best);
        selectedIds.add(best.registration.identity.agentId);
      }
    }

    while (
      selected.length < policy.minimumAgents &&
      selected.length < policy.maximumAgents
    ) {
      const remaining = candidates.filter(
        (candidate) =>
          !selectedIds.has(candidate.registration.identity.agentId),
      );

      const best = chooseBestCandidate(
        remaining,
        selected,
        policy,
        requiredCapabilities,
      );

      if (best === undefined) {
        break;
      }

      selected.push(best);
      selectedIds.add(best.registration.identity.agentId);
    }

    const rankedRemaining = candidates
      .filter(
        (candidate) =>
          !selectedIds.has(candidate.registration.identity.agentId),
      )
      .map((candidate) => ({
        candidate,
        marginalScore: calculateMarginalScore(
          candidate,
          selected,
          policy,
          requiredCapabilities,
        ),
      }))
      .sort(
        (left, right) =>
          right.marginalScore - left.marginalScore ||
          compareText(
            left.candidate.registration.identity.agentId,
            right.candidate.registration.identity.agentId,
          ),
      );

    for (const entry of rankedRemaining) {
      if (selected.length >= policy.maximumAgents) {
        break;
      }

      if (
        preferredAgentIds.has(entry.candidate.registration.identity.agentId)
      ) {
        selected.push(entry.candidate);
        selectedIds.add(entry.candidate.registration.identity.agentId);
      }
    }

    const selectedRegistrations = selected
      .map((candidate) => deepFreeze(cloneRegistration(candidate.registration)))
      .sort(compareRegistration);

    const coveredCapabilities = requiredCapabilities.filter((capability) =>
      selected.some((candidate) =>
        candidateHasCapability(candidate, capability),
      ),
    );

    const uncoveredCapabilities = requiredCapabilities.filter(
      (capability) => !coveredCapabilities.includes(capability),
    );

    const finalScores = scoreRecords
      .map((record) => {
        const candidate = candidates.find(
          (item) => item.registration.identity.agentId === record.agentId,
        );

        if (candidate === undefined) {
          return record;
        }

        const diversityScore = calculateDiversityScore(
          candidate,
          selected.filter(
            (item) =>
              item.registration.identity.agentId !== record.agentId,
          ),
        );

        return freezeScoreRecord({
          ...record,
          diversityScore,
          totalScore: clampScore(
            candidate.baseScore +
              diversityScore * policy.diversityWeight,
          ),
        });
      })
      .sort(
        (left, right) =>
          Number(right.eligible) - Number(left.eligible) ||
          right.totalScore - left.totalScore ||
          compareText(left.agentId, right.agentId),
      );

    return deepFreeze({
      selectedAgents: Object.freeze(selectedRegistrations),
      scores: Object.freeze(finalScores),
      requiredRoles: Object.freeze([...requiredRoles]),
      requiredCapabilities: Object.freeze([...requiredCapabilities]),
      coveredCapabilities: Object.freeze([...coveredCapabilities]),
      uncoveredCapabilities: Object.freeze([...uncoveredCapabilities]),
    });
  }
}

export function createMultiAgentSelector(
  options: MultiAgentSelectorOptions = {},
): MultiAgentSelector {
  return new MultiAgentSelector(options);
}

function normalizeOptions(
  options: MultiAgentSelectorOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    defaultMissingHealthScore:
      options.defaultMissingHealthScore ??
      DEFAULT_OPTIONS.defaultMissingHealthScore,
    defaultMissingTrustScore:
      options.defaultMissingTrustScore ??
      DEFAULT_OPTIONS.defaultMissingTrustScore,
    preferredAgentBonus:
      options.preferredAgentBonus ??
      DEFAULT_OPTIONS.preferredAgentBonus,
    deterministicAgentBonus:
      options.deterministicAgentBonus ??
      DEFAULT_OPTIONS.deterministicAgentBonus,
    replaySafeAgentBonus:
      options.replaySafeAgentBonus ??
      DEFAULT_OPTIONS.replaySafeAgentBonus,
    requiredRoleBonus:
      options.requiredRoleBonus ??
      DEFAULT_OPTIONS.requiredRoleBonus,
    capabilityCoverageBonus:
      options.capabilityCoverageBonus ??
      DEFAULT_OPTIONS.capabilityCoverageBonus,
    busyAgentPenalty:
      options.busyAgentPenalty ??
      DEFAULT_OPTIONS.busyAgentPenalty,
    rateLimitedAgentPenalty:
      options.rateLimitedAgentPenalty ??
      DEFAULT_OPTIONS.rateLimitedAgentPenalty,
  };

  assertScore(
    normalized.defaultMissingHealthScore,
    "defaultMissingHealthScore",
  );
  assertScore(
    normalized.defaultMissingTrustScore,
    "defaultMissingTrustScore",
  );

  for (const [field, value] of [
    ["preferredAgentBonus", normalized.preferredAgentBonus],
    ["deterministicAgentBonus", normalized.deterministicAgentBonus],
    ["replaySafeAgentBonus", normalized.replaySafeAgentBonus],
    ["requiredRoleBonus", normalized.requiredRoleBonus],
    ["capabilityCoverageBonus", normalized.capabilityCoverageBonus],
    ["busyAgentPenalty", normalized.busyAgentPenalty],
    ["rateLimitedAgentPenalty", normalized.rateLimitedAgentPenalty],
  ] as const) {
    assertNonNegativeFinite(value, field);
  }

  return Object.freeze(normalized);
}

function validateInputs(
  request: MultiAgentRunRequest,
  registrations: readonly MultiAgentRegistration[],
  health: readonly MultiAgentHealthSnapshot[],
  trust: readonly MultiAgentTrustScore[],
): void {
  if (request === null || typeof request !== "object") {
    invalidInput("request must be an object.", "request");
  }

  if (!Array.isArray(registrations)) {
    invalidInput("registrations must be an array.", "registrations");
  }

  if (!Array.isArray(health)) {
    invalidInput("health must be an array.", "health");
  }

  if (!Array.isArray(trust)) {
    invalidInput("trust must be an array.", "trust");
  }

  assertNonEmptyString(request.requestId, "request.requestId");

  const registrationIds = new Set<string>();

  for (const [index, registration] of registrations.entries()) {
    const agentId = registration.identity.agentId;
    assertNonEmptyString(
      agentId,
      `registrations[${index}].identity.agentId`,
    );

    if (registrationIds.has(agentId)) {
      throw new MultiAgentSelectorError(
        "DUPLICATE_AGENT_ID",
        `Agent "${agentId}" is registered more than once.`,
        {
          field: `registrations[${index}].identity.agentId`,
          agentId,
        },
      );
    }

    registrationIds.add(agentId);
  }
}

function validatePolicy(policy: MultiAgentAgentSelectionPolicy): void {
  if (policy === null || typeof policy !== "object") {
    invalidInput(
      "request.configuration.agentSelection must be an object.",
      "request.configuration.agentSelection",
    );
  }

  assertNonNegativeInteger(policy.minimumAgents, "minimumAgents");
  assertNonNegativeInteger(policy.maximumAgents, "maximumAgents");

  if (policy.maximumAgents < policy.minimumAgents) {
    invalidInput(
      "maximumAgents cannot be less than minimumAgents.",
      "request.configuration.agentSelection.maximumAgents",
    );
  }

  assertScore(policy.minimumReadinessScore, "minimumReadinessScore");
  assertScore(policy.minimumReliabilityScore, "minimumReliabilityScore");

  const weights = [
    policy.diversityWeight,
    policy.reliabilityWeight,
    policy.proficiencyWeight,
    policy.latencyWeight,
  ];

  for (const [index, weight] of weights.entries()) {
    assertNonNegativeFinite(weight, `selectionWeight[${index}]`);
  }

  if (weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
    invalidInput(
      "At least one agent-selection weight must be greater than zero.",
      "request.configuration.agentSelection",
    );
  }
}

function indexHealth(
  snapshots: readonly MultiAgentHealthSnapshot[],
): ReadonlyMap<MultiAgentId, MultiAgentHealthSnapshot> {
  const indexed = new Map<MultiAgentId, MultiAgentHealthSnapshot>();

  for (const snapshot of snapshots) {
    if (indexed.has(snapshot.agentId)) {
      throw new MultiAgentSelectorError(
        "DUPLICATE_HEALTH_SNAPSHOT",
        `More than one health snapshot exists for agent "${snapshot.agentId}".`,
        { agentId: snapshot.agentId },
      );
    }

    indexed.set(snapshot.agentId, snapshot);
  }

  return indexed;
}

function indexTrust(
  scores: readonly MultiAgentTrustScore[],
): ReadonlyMap<MultiAgentId, MultiAgentTrustScore> {
  const indexed = new Map<MultiAgentId, MultiAgentTrustScore>();

  for (const score of scores) {
    if (indexed.has(score.agentId)) {
      throw new MultiAgentSelectorError(
        "DUPLICATE_TRUST_SCORE",
        `More than one trust score exists for agent "${score.agentId}".`,
        { agentId: score.agentId },
      );
    }

    indexed.set(score.agentId, score);
  }

  return indexed;
}

function determineExclusionReasons(
  registration: MultiAgentRegistration,
  health: MultiAgentHealthSnapshot | undefined,
  request: MultiAgentRunRequest,
  policy: MultiAgentAgentSelectionPolicy,
  excludedAgentIds: ReadonlySet<MultiAgentId>,
  options: NormalizedOptions,
): readonly string[] {
  const reasons: string[] = [];
  const agentId = registration.identity.agentId;

  if (excludedAgentIds.has(agentId)) {
    reasons.push("EXPLICITLY_EXCLUDED");
  }

  if (!policy.enabledRoles.includes(registration.identity.role)) {
    reasons.push("ROLE_DISABLED");
  }

  if (
    request.configuration.requireDeterministicAgents &&
    !registration.deterministic
  ) {
    reasons.push("NON_DETERMINISTIC");
  }

  if (
    request.configuration.requireDeterministicFingerprint &&
    !registration.replaySafe
  ) {
    reasons.push("NOT_REPLAY_SAFE");
  }

  if (health === undefined) {
    if (!policy.allowDegradedAgents) {
      reasons.push("MISSING_HEALTH");
    }

    if (
      options.defaultMissingHealthScore <
      policy.minimumReadinessScore
    ) {
      reasons.push("READINESS_BELOW_THRESHOLD");
    }

    if (
      options.defaultMissingHealthScore <
      policy.minimumReliabilityScore
    ) {
      reasons.push("RELIABILITY_BELOW_THRESHOLD");
    }

    return Object.freeze(uniqueSorted(reasons));
  }

  if (
    health.lifecycleState === "QUARANTINED" ||
    health.lifecycleState === "SUSPENDED" ||
    health.lifecycleState === "FAILED" ||
    health.lifecycleState === "RETIRED"
  ) {
    reasons.push(`LIFECYCLE_${health.lifecycleState}`);
  }

  if (
    health.availability === "UNAVAILABLE" ||
    health.availability === "UNKNOWN"
  ) {
    reasons.push(`AVAILABILITY_${health.availability}`);
  }

  if (!health.healthy && !policy.allowDegradedAgents) {
    reasons.push("UNHEALTHY");
  }

  if (
    health.lifecycleState === "DEGRADED" &&
    !policy.allowDegradedAgents
  ) {
    reasons.push("DEGRADED");
  }

  if (health.readinessScore < policy.minimumReadinessScore) {
    reasons.push("READINESS_BELOW_THRESHOLD");
  }

  if (health.reliabilityScore < policy.minimumReliabilityScore) {
    reasons.push("RELIABILITY_BELOW_THRESHOLD");
  }

  return Object.freeze(uniqueSorted(reasons));
}

function buildCandidate(
  registration: MultiAgentRegistration,
  health: MultiAgentHealthSnapshot | undefined,
  trust: MultiAgentTrustScore | undefined,
  preferredAgentIds: ReadonlySet<MultiAgentId>,
  requiredRoles: readonly MultiAgentRole[],
  requiredCapabilities: readonly MultiAgentCapability[],
  policy: MultiAgentAgentSelectionPolicy,
  options: NormalizedOptions,
): Candidate {
  const readinessScore =
    health?.readinessScore ?? options.defaultMissingHealthScore;
  const healthReliability =
    health?.reliabilityScore ?? options.defaultMissingHealthScore;
  const trustReliability =
    trust?.overallTrust ?? options.defaultMissingTrustScore;
  const reliabilityScore = clampScore(
    healthReliability * 0.55 + trustReliability * 0.45,
  );
  const latencyScore =
    health?.latencyScore ?? options.defaultMissingHealthScore;
  const proficiencyScore = calculateProficiency(
    registration.capabilities,
    requiredCapabilities,
  );

  let preferenceAdjustment = 0;

  if (preferredAgentIds.has(registration.identity.agentId)) {
    preferenceAdjustment += options.preferredAgentBonus;
  }

  if (requiredRoles.includes(registration.identity.role)) {
    preferenceAdjustment += options.requiredRoleBonus;
  }

  if (
    requiredCapabilities.some((capability) =>
      registration.capabilities.some(
        (declaration) =>
          declaration.enabled &&
          declaration.capability === capability,
      ),
    )
  ) {
    preferenceAdjustment += options.capabilityCoverageBonus;
  }

  let determinismAdjustment = 0;

  if (policy.preferDeterministicAgents && registration.deterministic) {
    determinismAdjustment += options.deterministicAgentBonus;
  }

  if (registration.replaySafe) {
    determinismAdjustment += options.replaySafeAgentBonus;
  }

  let operationalAdjustment = 0;

  if (health?.availability === "BUSY") {
    operationalAdjustment -= options.busyAgentPenalty;
  }

  if (health?.availability === "RATE_LIMITED") {
    operationalAdjustment -= options.rateLimitedAgentPenalty;
  }

  const weightedCore = weightedAverage([
    [reliabilityScore, policy.reliabilityWeight],
    [proficiencyScore, policy.proficiencyWeight],
    [latencyScore, policy.latencyWeight],
    [readinessScore, 0.15],
  ]);

  return Object.freeze({
    registration,
    ...(health === undefined ? {} : { health }),
    ...(trust === undefined ? {} : { trust }),
    readinessScore,
    reliabilityScore,
    proficiencyScore,
    latencyScore,
    preferenceAdjustment,
    determinismAdjustment,
    operationalAdjustment,
    baseScore: clampScore(
      weightedCore +
        preferenceAdjustment +
        determinismAdjustment +
        operationalAdjustment,
    ),
  });
}

function chooseBestCandidate(
  candidates: readonly Candidate[],
  selected: readonly Candidate[],
  policy: MultiAgentAgentSelectionPolicy,
  requiredCapabilities: readonly MultiAgentCapability[],
): Candidate | undefined {
  return [...candidates].sort(
    (left, right) =>
      calculateMarginalScore(
        right,
        selected,
        policy,
        requiredCapabilities,
      ) -
        calculateMarginalScore(
          left,
          selected,
          policy,
          requiredCapabilities,
        ) ||
      compareText(
        left.registration.identity.agentId,
        right.registration.identity.agentId,
      ),
  )[0];
}

function calculateMarginalScore(
  candidate: Candidate,
  selected: readonly Candidate[],
  policy: MultiAgentAgentSelectionPolicy,
  requiredCapabilities: readonly MultiAgentCapability[],
): number {
  const diversityScore = calculateDiversityScore(candidate, selected);
  const coverageGain = calculateCoverageGain(
    candidate,
    selected,
    requiredCapabilities,
  );

  return clamp01(
    candidate.baseScore +
      diversityScore * policy.diversityWeight +
      coverageGain * 0.12,
  );
}

function calculateDiversityScore(
  candidate: Candidate,
  selected: readonly Candidate[],
): MultiAgentScore {
  if (selected.length === 0) {
    return 1 as MultiAgentScore;
  }

  const roleNovelty = selected.some(
    (item) =>
      item.registration.identity.role ===
      candidate.registration.identity.role,
  )
    ? 0
    : 1;

  const modelIdentity = createModelIdentity(candidate.registration);
  const modelNovelty = selected.some(
    (item) =>
      createModelIdentity(item.registration) === modelIdentity,
  )
    ? 0
    : 1;

  const reasoningNovelty = selected.some(
    (item) =>
      item.registration.reasoningMode ===
      candidate.registration.reasoningMode,
  )
    ? 0
    : 1;

  const candidateCapabilities = enabledCapabilities(
    candidate.registration,
  );
  const selectedCapabilities = uniqueSorted(
    selected.flatMap((item) => enabledCapabilities(item.registration)),
  );

  const capabilityNovelty =
    candidateCapabilities.length === 0
      ? 0
      : candidateCapabilities.filter(
          (capability) => !selectedCapabilities.includes(capability),
        ).length / candidateCapabilities.length;

  return clampScore(
    roleNovelty * 0.35 +
      capabilityNovelty * 0.3 +
      modelNovelty * 0.2 +
      reasoningNovelty * 0.15,
  );
}

function calculateCoverageGain(
  candidate: Candidate,
  selected: readonly Candidate[],
  requiredCapabilities: readonly MultiAgentCapability[],
): MultiAgentScore {
  if (requiredCapabilities.length === 0) {
    return 0 as MultiAgentScore;
  }

  const covered = new Set(
    requiredCapabilities.filter((capability) =>
      selectionCoversCapability(selected, capability),
    ),
  );

  const newlyCovered = requiredCapabilities.filter(
    (capability) =>
      !covered.has(capability) &&
      candidateHasCapability(candidate, capability),
  );

  return clampScore(newlyCovered.length / requiredCapabilities.length);
}

function calculateProficiency(
  declarations: readonly MultiAgentCapabilityDeclaration[],
  requiredCapabilities: readonly MultiAgentCapability[],
): MultiAgentScore {
  const enabled = declarations.filter(
    (declaration) => declaration.enabled,
  );

  if (enabled.length === 0) {
    return 0 as MultiAgentScore;
  }

  const relevant = enabled.filter((declaration) =>
    requiredCapabilities.includes(declaration.capability),
  );
  const source = relevant.length > 0 ? relevant : enabled;

  return clampScore(
    source.reduce(
      (sum, declaration) => sum + declaration.proficiency,
      0,
    ) / source.length,
  );
}

function selectionCoversCapability(
  selected: readonly Candidate[],
  capability: MultiAgentCapability,
): boolean {
  return selected.some((candidate) =>
    candidateHasCapability(candidate, capability),
  );
}

function candidateHasCapability(
  candidate: Candidate,
  capability: MultiAgentCapability,
): boolean {
  return candidate.registration.capabilities.some(
    (declaration) =>
      declaration.enabled &&
      declaration.capability === capability,
  );
}

function enabledCapabilities(
  registration: MultiAgentRegistration,
): readonly MultiAgentCapability[] {
  return uniqueSorted(
    registration.capabilities
      .filter((declaration) => declaration.enabled)
      .map((declaration) => declaration.capability),
  );
}

function createModelIdentity(
  registration: MultiAgentRegistration,
): string {
  return [
    registration.identity.modelType,
    registration.identity.modelId ?? "NO_MODEL_ID",
    registration.reasoningMode,
  ].join("|");
}

function weightedAverage(
  values: readonly (readonly [number, number])[],
): number {
  const totalWeight = values.reduce(
    (sum, [, weight]) => sum + weight,
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return (
    values.reduce(
      (sum, [value, weight]) => sum + value * weight,
      0,
    ) / totalWeight
  );
}

function cloneRegistration(
  registration: MultiAgentRegistration,
): MultiAgentRegistration {
  return {
    identity: {
      agentId: registration.identity.agentId,
      name: registration.identity.name,
      role: registration.identity.role,
      version: registration.identity.version,
      ...(registration.identity.modelId === undefined
        ? {}
        : { modelId: registration.identity.modelId }),
      modelType: registration.identity.modelType,
      description: registration.identity.description,
    },
    authority: {
      level: registration.authority.level,
      autonomy: registration.authority.autonomy,
      mayPropose: registration.authority.mayPropose,
      mayReview: registration.authority.mayReview,
      mayVote: registration.authority.mayVote,
      mayVeto: registration.authority.mayVeto,
      mayArbitrate: registration.authority.mayArbitrate,
      mayApproveExecution:
        registration.authority.mayApproveExecution,
      ...(registration.authority.maximumCapitalAuthority === undefined
        ? {}
        : {
            maximumCapitalAuthority:
              registration.authority.maximumCapitalAuthority,
          }),
      ...(registration.authority.maximumRiskAuthority === undefined
        ? {}
        : {
            maximumRiskAuthority:
              registration.authority.maximumRiskAuthority,
          }),
      restrictedActions: Object.freeze([
        ...registration.authority.restrictedActions,
      ]),
    },
    capabilities: Object.freeze(
      registration.capabilities.map((declaration) => ({
        capability: declaration.capability,
        enabled: declaration.enabled,
        proficiency: declaration.proficiency,
        confidenceFloor: declaration.confidenceFloor,
        criticality: declaration.criticality,
        ...(declaration.supportedMarkets === undefined
          ? {}
          : {
              supportedMarkets: Object.freeze([
                ...declaration.supportedMarkets,
              ]),
            }),
        ...(declaration.supportedTimeframes === undefined
          ? {}
          : {
              supportedTimeframes: Object.freeze([
                ...declaration.supportedTimeframes,
              ]),
            }),
        ...(declaration.metadata === undefined
          ? {}
          : { metadata: deepClone(declaration.metadata) }),
      })),
    ),
    reasoningMode: registration.reasoningMode,
    deterministic: registration.deterministic,
    replaySafe: registration.replaySafe,
    registeredAtMs: registration.registeredAtMs,
    configurationVersion: registration.configurationVersion,
    ...(registration.metadata === undefined
      ? {}
      : { metadata: deepClone(registration.metadata) }),
  };
}

function deepClone<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  const result: Record<string, unknown> = {};
  const record = value as Readonly<Record<string, unknown>>;

  for (const key of Object.keys(record).sort(compareText)) {
    result[key] = deepClone(record[key]);
  }

  return result as T;
}

function compareRegistration(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return compareText(
    left.identity.agentId,
    right.identity.agentId,
  );
}

function freezeScoreRecord(
  record: MultiAgentAgentSelectionScore,
): MultiAgentAgentSelectionScore {
  return Object.freeze({
    ...record,
    exclusionReasons: Object.freeze([...record.exclusionReasons]),
  });
}

function invalidInput(message: string, field: string): never {
  throw new MultiAgentSelectorError(
    "INVALID_INPUT",
    message,
    { field },
  );
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalidInput(`${field} must be a non-empty string.`, field);
  }
}

function assertScore(
  value: unknown,
  field: string,
): asserts value is MultiAgentScore {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    invalidInput(`${field} must be between 0 and 1.`, field);
  }
}

function assertNonNegativeFinite(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    invalidInput(
      `${field} must be a non-negative finite number.`,
      field,
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    invalidInput(
      `${field} must be a non-negative safe integer.`,
      field,
    );
  }
}

function uniqueSorted<T extends string>(
  values: readonly T[],
): T[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampScore(value: number): MultiAgentScore {
  return (
    Math.round(clamp01(value) * 1_000_000_000) / 1_000_000_000
  ) as MultiAgentScore;
}

function deepFreeze<T>(
  value: T,
  seen: Set<object> = new Set(),
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return value;
  }

  seen.add(value as object);

  for (const key of Reflect.ownKeys(value as object)) {
    const propertyValue = (
      value as Record<PropertyKey, unknown>
    )[key];

    if (
      propertyValue !== null &&
      (typeof propertyValue === "object" ||
        typeof propertyValue === "function")
    ) {
      deepFreeze(propertyValue, seen);
    }
  }

  return Object.freeze(value);
}