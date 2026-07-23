/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-diversity-engine.ts
 *
 * Deterministic and immutable diversity assessment for collective multi-agent
 * trading intelligence.
 */

import {
  type MultiAgentCapability,
  type MultiAgentDebatePosition,
  type MultiAgentDebateTranscript,
  type MultiAgentDiversityAssessment,
  type MultiAgentEvidence,
  type MultiAgentEvidenceDirection,
  type MultiAgentEvidenceSource,
  type MultiAgentId,
  type MultiAgentObservation,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentRegistration,
  type MultiAgentReviewDecision,
  type MultiAgentRole,
  type MultiAgentScore,
  type MultiAgentTrustScore,
} from "./ai-multi-agent-contracts";

export type MultiAgentDiversityEngineErrorCode =
  | "INVALID_DIVERSITY_INPUT"
  | "INVALID_DIVERSITY_OPTIONS"
  | "DUPLICATE_AGENT_ID"
  | "UNKNOWN_AGENT_REFERENCE"
  | "DIVERSITY_ASSESSMENT_FAILED";

export interface MultiAgentDiversityEngineErrorDetails {
  readonly agentId?: MultiAgentId;
  readonly field?: string;
  readonly index?: number;
  readonly cause?: unknown;
}

export class MultiAgentDiversityEngineError extends Error {
  public readonly code: MultiAgentDiversityEngineErrorCode;
  public readonly details: MultiAgentDiversityEngineErrorDetails;

  public constructor(
    code: MultiAgentDiversityEngineErrorCode,
    message: string,
    details: MultiAgentDiversityEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentDiversityEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentDiversityInput {
  readonly registrations: readonly MultiAgentRegistration[];
  readonly observations?: readonly MultiAgentObservation[];
  readonly proposals?: readonly MultiAgentProposal[];
  readonly reviews?: readonly MultiAgentPeerReview[];
  readonly debate?: MultiAgentDebateTranscript;
  readonly trustScores?: readonly MultiAgentTrustScore[];
  readonly participatingAgentIds?: readonly MultiAgentId[];
}

export interface MultiAgentDiversityDimensionWeights {
  readonly role: number;
  readonly capability: number;
  readonly model: number;
  readonly evidence: number;
  readonly viewpoint: number;
}

export interface MultiAgentDiversityEngineOptions {
  /**
   * Pair similarity at or above this value is treated as materially correlated.
   */
  readonly correlationThreshold?: number;

  /**
   * Minimum size of a correlated connected component returned in the result.
   */
  readonly minimumCorrelatedGroupSize?: number;

  /**
   * Relative weights used to calculate overall diversity.
   */
  readonly dimensionWeights?: Partial<MultiAgentDiversityDimensionWeights>;

  /**
   * Maximum absolute trust influence applied to concentration calculations.
   * Zero makes every participating agent equal-weighted.
   */
  readonly trustInfluence?: number;

  /**
   * When true, any referenced agent not present in registrations causes an error.
   */
  readonly rejectUnknownAgentReferences?: boolean;

  /**
   * Evidence with reliability below this threshold is excluded.
   */
  readonly minimumEvidenceReliability?: number;

  /**
   * Evidence with confidence below this threshold is excluded.
   */
  readonly minimumEvidenceConfidence?: number;
}

export interface MultiAgentDiversityPairAssessment {
  readonly leftAgentId: MultiAgentId;
  readonly rightAgentId: MultiAgentId;
  readonly roleSimilarity: MultiAgentScore;
  readonly capabilitySimilarity: MultiAgentScore;
  readonly modelSimilarity: MultiAgentScore;
  readonly evidenceSimilarity: MultiAgentScore;
  readonly viewpointSimilarity: MultiAgentScore;
  readonly overallSimilarity: MultiAgentScore;
  readonly correlated: boolean;
}

export interface MultiAgentDiversityEngineSnapshot {
  readonly participatingAgentIds: readonly MultiAgentId[];
  readonly pairAssessments: readonly MultiAgentDiversityPairAssessment[];
  readonly assessment: MultiAgentDiversityAssessment;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly correlationThreshold: number;
  readonly minimumCorrelatedGroupSize: number;
  readonly dimensionWeights: MultiAgentDiversityDimensionWeights;
  readonly trustInfluence: number;
  readonly rejectUnknownAgentReferences: boolean;
  readonly minimumEvidenceReliability: number;
  readonly minimumEvidenceConfidence: number;
}

interface AgentProfile {
  readonly agentId: MultiAgentId;
  readonly role: MultiAgentRole;
  readonly modelIdentity: string;
  readonly capabilities: ReadonlySet<MultiAgentCapability>;
  readonly evidenceSources: ReadonlySet<MultiAgentEvidenceSource>;
  readonly evidenceDirections: ReadonlyMap<
    MultiAgentEvidenceDirection,
    number
  >;
  readonly viewpointVector: ReadonlyMap<string, number>;
  readonly trust: number;
}

interface EvidenceAccumulator {
  readonly sources: Set<MultiAgentEvidenceSource>;
  readonly directions: Map<MultiAgentEvidenceDirection, number>;
}

const DEFAULT_DIMENSION_WEIGHTS: MultiAgentDiversityDimensionWeights =
  Object.freeze({
    role: 0.2,
    capability: 0.25,
    model: 0.2,
    evidence: 0.2,
    viewpoint: 0.15,
  });

const EMPTY_ASSESSMENT: MultiAgentDiversityAssessment = deepFreeze({
  roleDiversity: 0 as MultiAgentScore,
  capabilityDiversity: 0 as MultiAgentScore,
  modelDiversity: 0 as MultiAgentScore,
  evidenceDiversity: 0 as MultiAgentScore,
  viewpointDiversity: 0 as MultiAgentScore,
  concentrationRisk: 1,
  correlatedAgentGroups: Object.freeze([]),
  overallDiversity: 0 as MultiAgentScore,
});

const EMPTY_SNAPSHOT: MultiAgentDiversityEngineSnapshot = deepFreeze({
  participatingAgentIds: Object.freeze([]),
  pairAssessments: Object.freeze([]),
  assessment: EMPTY_ASSESSMENT,
  deterministicFingerprint: stableFingerprint({
    type: "MULTI_AGENT_DIVERSITY_ENGINE_SNAPSHOT",
    state: "EMPTY",
  }),
});

export class MultiAgentDiversityEngine {
  private readonly options: NormalizedOptions;
  private lastSnapshotValue: MultiAgentDiversityEngineSnapshot;

  public constructor(options: MultiAgentDiversityEngineOptions = {}) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = EMPTY_SNAPSHOT;
  }

  public assess(input: MultiAgentDiversityInput): MultiAgentDiversityAssessment {
    try {
      validateInput(input, this.options);

      const registrations = input.registrations
        .slice()
        .sort(compareRegistrations);

      const participatingAgentIds = resolveParticipatingAgentIds(
        input,
        registrations,
      );

      if (participatingAgentIds.length === 0) {
        this.lastSnapshotValue = EMPTY_SNAPSHOT;
        return EMPTY_ASSESSMENT;
      }

      const profiles = buildProfiles(
        input,
        registrations,
        participatingAgentIds,
        this.options,
      );

      const pairAssessments = assessPairs(profiles, this.options);
      const correlatedAgentGroups = buildCorrelatedGroups(
        participatingAgentIds,
        pairAssessments,
        this.options.minimumCorrelatedGroupSize,
      );

      const roleDiversity = categoricalDiversity(
        profiles.map((profile) => profile.role),
      );
      const capabilityDiversity = setPopulationDiversity(
        profiles.map((profile) => profile.capabilities),
      );
      const modelDiversity = categoricalDiversity(
        profiles.map((profile) => profile.modelIdentity),
      );
      const evidenceDiversity = setPopulationDiversity(
        profiles.map((profile) => profile.evidenceSources),
      );
      const viewpointDiversity = calculateViewpointDiversity(
        pairAssessments,
        profiles.length,
      );
      const concentrationRisk = calculateConcentrationRisk(
        profiles,
        correlatedAgentGroups,
        pairAssessments,
      );

      const overallDiversity = weightedAverage([
        {
          value: roleDiversity,
          weight: this.options.dimensionWeights.role,
        },
        {
          value: capabilityDiversity,
          weight: this.options.dimensionWeights.capability,
        },
        {
          value: modelDiversity,
          weight: this.options.dimensionWeights.model,
        },
        {
          value: evidenceDiversity,
          weight: this.options.dimensionWeights.evidence,
        },
        {
          value: viewpointDiversity,
          weight: this.options.dimensionWeights.viewpoint,
        },
      ]);

      const assessment: MultiAgentDiversityAssessment = deepFreeze({
        roleDiversity: clamp01(roleDiversity) as MultiAgentScore,
        capabilityDiversity:
          clamp01(capabilityDiversity) as MultiAgentScore,
        modelDiversity: clamp01(modelDiversity) as MultiAgentScore,
        evidenceDiversity:
          clamp01(evidenceDiversity) as MultiAgentScore,
        viewpointDiversity:
          clamp01(viewpointDiversity) as MultiAgentScore,
        concentrationRisk: clamp01(concentrationRisk),
        correlatedAgentGroups,
        overallDiversity:
          clamp01(overallDiversity) as MultiAgentScore,
      });

      this.lastSnapshotValue = deepFreeze({
        participatingAgentIds,
        pairAssessments,
        assessment,
        deterministicFingerprint: stableFingerprint({
          participatingAgentIds,
          pairAssessments,
          assessment,
        }),
      });

      return assessment;
    } catch (cause) {
      if (cause instanceof MultiAgentDiversityEngineError) {
        throw cause;
      }

      throw new MultiAgentDiversityEngineError(
        "DIVERSITY_ASSESSMENT_FAILED",
        "Failed to assess multi-agent diversity.",
        { cause },
      );
    }
  }

  public assessPairs(
    input: MultiAgentDiversityInput,
  ): readonly MultiAgentDiversityPairAssessment[] {
    this.assess(input);
    return this.lastSnapshotValue.pairAssessments;
  }

  public snapshot(): MultiAgentDiversityEngineSnapshot {
    return this.lastSnapshotValue;
  }
}

export function assessMultiAgentDiversity(
  input: MultiAgentDiversityInput,
  options: MultiAgentDiversityEngineOptions = {},
): MultiAgentDiversityAssessment {
  return new MultiAgentDiversityEngine(options).assess(input);
}

function buildProfiles(
  input: MultiAgentDiversityInput,
  registrations: readonly MultiAgentRegistration[],
  participatingAgentIds: readonly MultiAgentId[],
  options: NormalizedOptions,
): readonly AgentProfile[] {
  const registrationsByAgentId = new Map(
    registrations.map(
      (registration) =>
        [registration.identity.agentId, registration] as const,
    ),
  );
  const trustByAgentId = new Map(
    (input.trustScores ?? []).map(
      (score) => [score.agentId, score.overallTrust] as const,
    ),
  );

  const evidenceByAgentId = collectEvidenceByAgent(
    input,
    participatingAgentIds,
    options,
  );
  const viewpointByAgentId = collectViewpoints(
    input,
    participatingAgentIds,
  );

  return deepFreeze(
    participatingAgentIds.map((agentId) => {
      const registration = registrationsByAgentId.get(agentId);

      if (registration === undefined) {
        throw new MultiAgentDiversityEngineError(
          "UNKNOWN_AGENT_REFERENCE",
          `Participating agent "${agentId}" is not registered.`,
          { agentId },
        );
      }

      const evidence = evidenceByAgentId.get(agentId);
      const modelIdentity = buildModelIdentity(registration);

      return {
        agentId,
        role: registration.identity.role,
        modelIdentity,
        capabilities: new Set(
          registration.capabilities
            .filter((capability) => capability.enabled)
            .map((capability) => capability.capability)
            .sort(),
        ),
        evidenceSources:
          evidence?.sources ??
          new Set<MultiAgentEvidenceSource>(),
        evidenceDirections:
          evidence?.directions ??
          new Map<MultiAgentEvidenceDirection, number>(),
        viewpointVector:
          viewpointByAgentId.get(agentId) ??
          new Map<string, number>(),
        trust: resolveTrust(
          trustByAgentId.get(agentId),
          options.trustInfluence,
        ),
      } satisfies AgentProfile;
    }),
  );
}

function collectEvidenceByAgent(
  input: MultiAgentDiversityInput,
  participatingAgentIds: readonly MultiAgentId[],
  options: NormalizedOptions,
): ReadonlyMap<MultiAgentId, EvidenceAccumulator> {
  const participating = new Set(participatingAgentIds);
  const result = new Map<MultiAgentId, EvidenceAccumulator>();

  const ensure = (agentId: MultiAgentId): EvidenceAccumulator => {
    const current = result.get(agentId);

    if (current !== undefined) {
      return current;
    }

    const created: EvidenceAccumulator = {
      sources: new Set<MultiAgentEvidenceSource>(),
      directions: new Map<MultiAgentEvidenceDirection, number>(),
    };
    result.set(agentId, created);
    return created;
  };

  for (const agentId of participatingAgentIds) {
    ensure(agentId);
  }

  const acceptEvidence = (
    agentId: MultiAgentId,
    evidence: MultiAgentEvidence,
  ): void => {
    if (!participating.has(agentId)) {
      return;
    }

    if (
      evidence.reliability < options.minimumEvidenceReliability ||
      evidence.confidence < options.minimumEvidenceConfidence
    ) {
      return;
    }

    const accumulator = ensure(agentId);
    accumulator.sources.add(evidence.source);
    accumulator.directions.set(
      evidence.direction,
      (accumulator.directions.get(evidence.direction) ?? 0) +
        evidence.weight * evidence.confidence * evidence.reliability,
    );
  };

  for (const observation of input.observations ?? []) {
    for (const evidence of observation.evidence) {
      acceptEvidence(observation.agentId, evidence);
    }
  }

  for (const proposal of input.proposals ?? []) {
    for (const evidence of proposal.evidence) {
      acceptEvidence(proposal.proposedByAgentId, evidence);
    }
  }

  for (const review of input.reviews ?? []) {
    for (const evidence of review.supportingEvidence) {
      acceptEvidence(review.reviewerAgentId, evidence);
    }
  }

  return result;
}

function collectViewpoints(
  input: MultiAgentDiversityInput,
  participatingAgentIds: readonly MultiAgentId[],
): ReadonlyMap<MultiAgentId, ReadonlyMap<string, number>> {
  const participating = new Set(participatingAgentIds);
  const vectors = new Map<MultiAgentId, Map<string, number>>();

  const ensure = (agentId: MultiAgentId): Map<string, number> => {
    const current = vectors.get(agentId);

    if (current !== undefined) {
      return current;
    }

    const created = new Map<string, number>();
    vectors.set(agentId, created);
    return created;
  };

  const add = (
    agentId: MultiAgentId,
    key: string,
    value: number,
  ): void => {
    if (!participating.has(agentId)) {
      return;
    }

    const vector = ensure(agentId);
    vector.set(key, (vector.get(key) ?? 0) + value);
  };

  for (const agentId of participatingAgentIds) {
    ensure(agentId);
  }

  for (const proposal of input.proposals ?? []) {
    add(
      proposal.proposedByAgentId,
      `PROPOSAL:${proposal.status}`,
      proposal.confidence,
    );

    for (const action of proposal.actions) {
      const sign =
        action.side === "BUY"
          ? 1
          : action.side === "SELL"
            ? -1
            : 0.25;

      add(
        proposal.proposedByAgentId,
        `ACTION:${action.type}`,
        sign * proposal.confidence,
      );
    }

    for (const evidence of proposal.evidence) {
      add(
        proposal.proposedByAgentId,
        `EVIDENCE:${evidence.direction}`,
        directionValue(evidence.direction) *
          evidence.weight *
          evidence.confidence,
      );
    }
  }

  for (const review of input.reviews ?? []) {
    add(
      review.reviewerAgentId,
      `REVIEW:${review.decision}`,
      reviewDecisionValue(review.decision) * review.confidence,
    );

    for (const score of review.scores) {
      add(
        review.reviewerAgentId,
        `REVIEW_DIMENSION:${score.dimension}`,
        center01(score.score) * score.confidence,
      );
    }
  }

  for (const statement of input.debate?.statements ?? []) {
    add(
      statement.agentId,
      `DEBATE:${statement.position}`,
      debatePositionValue(statement.position) *
        statement.confidence,
    );
  }

  for (const observation of input.observations ?? []) {
    add(
      observation.agentId,
      `OBSERVATION:${observation.type}`,
      observation.confidence * observation.qualityScore,
    );

    for (const evidence of observation.evidence) {
      add(
        observation.agentId,
        `OBSERVATION_EVIDENCE:${evidence.direction}`,
        directionValue(evidence.direction) *
          evidence.weight *
          evidence.confidence *
          evidence.reliability,
      );
    }
  }

  const immutable = new Map<
    MultiAgentId,
    ReadonlyMap<string, number>
  >();

  for (const [agentId, vector] of vectors) {
    immutable.set(
      agentId,
      new Map(
        [...vector.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    );
  }

  return immutable;
}

function assessPairs(
  profiles: readonly AgentProfile[],
  options: NormalizedOptions,
): readonly MultiAgentDiversityPairAssessment[] {
  const assessments: MultiAgentDiversityPairAssessment[] = [];

  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex += 1) {
    const left = profiles[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < profiles.length;
      rightIndex += 1
    ) {
      const right = profiles[rightIndex];

      if (right === undefined) {
        continue;
      }

      const roleSimilarity = left.role === right.role ? 1 : 0;
      const capabilitySimilarity = jaccardSimilarity(
        left.capabilities,
        right.capabilities,
      );
      const modelSimilarity =
        left.modelIdentity === right.modelIdentity ? 1 : 0;
      const evidenceSimilarity = blendedEvidenceSimilarity(
        left,
        right,
      );
      const viewpointSimilarity = cosineSimilarity01(
        left.viewpointVector,
        right.viewpointVector,
      );

      const overallSimilarity = weightedAverage([
        {
          value: roleSimilarity,
          weight: options.dimensionWeights.role,
        },
        {
          value: capabilitySimilarity,
          weight: options.dimensionWeights.capability,
        },
        {
          value: modelSimilarity,
          weight: options.dimensionWeights.model,
        },
        {
          value: evidenceSimilarity,
          weight: options.dimensionWeights.evidence,
        },
        {
          value: viewpointSimilarity,
          weight: options.dimensionWeights.viewpoint,
        },
      ]);

      assessments.push(
        deepFreeze({
          leftAgentId: left.agentId,
          rightAgentId: right.agentId,
          roleSimilarity:
            clamp01(roleSimilarity) as MultiAgentScore,
          capabilitySimilarity:
            clamp01(capabilitySimilarity) as MultiAgentScore,
          modelSimilarity:
            clamp01(modelSimilarity) as MultiAgentScore,
          evidenceSimilarity:
            clamp01(evidenceSimilarity) as MultiAgentScore,
          viewpointSimilarity:
            clamp01(viewpointSimilarity) as MultiAgentScore,
          overallSimilarity:
            clamp01(overallSimilarity) as MultiAgentScore,
          correlated:
            overallSimilarity >= options.correlationThreshold,
        }),
      );
    }
  }

  return deepFreeze(
    assessments.sort(comparePairAssessments),
  );
}

function buildCorrelatedGroups(
  agentIds: readonly MultiAgentId[],
  pairs: readonly MultiAgentDiversityPairAssessment[],
  minimumGroupSize: number,
): readonly (readonly MultiAgentId[])[] {
  const adjacency = new Map<MultiAgentId, Set<MultiAgentId>>();

  for (const agentId of agentIds) {
    adjacency.set(agentId, new Set<MultiAgentId>());
  }

  for (const pair of pairs) {
    if (!pair.correlated) {
      continue;
    }

    adjacency.get(pair.leftAgentId)?.add(pair.rightAgentId);
    adjacency.get(pair.rightAgentId)?.add(pair.leftAgentId);
  }

  const visited = new Set<MultiAgentId>();
  const groups: MultiAgentId[][] = [];

  for (const root of agentIds.slice().sort()) {
    if (visited.has(root)) {
      continue;
    }

    const queue: MultiAgentId[] = [root];
    const component: MultiAgentId[] = [];
    visited.add(root);

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === undefined) {
        break;
      }

      component.push(current);

      const neighbours = [
        ...(adjacency.get(current) ?? new Set<MultiAgentId>()),
      ].sort();

      for (const neighbour of neighbours) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    if (component.length >= minimumGroupSize) {
      groups.push(component.sort());
    }
  }

  return deepFreeze(
    groups.sort((left, right) => {
      const sizeDifference = right.length - left.length;

      return sizeDifference !== 0
        ? sizeDifference
        : (left[0] ?? "").localeCompare(right[0] ?? "");
    }),
  );
}

function calculateConcentrationRisk(
  profiles: readonly AgentProfile[],
  correlatedGroups: readonly (readonly MultiAgentId[])[],
  pairs: readonly MultiAgentDiversityPairAssessment[],
): number {
  if (profiles.length === 0) {
    return 1;
  }

  if (profiles.length === 1) {
    return 1;
  }

  const totalTrust = profiles.reduce(
    (sum, profile) => sum + profile.trust,
    0,
  );
  const normalizedWeights = profiles.map((profile) =>
    totalTrust > 0
      ? profile.trust / totalTrust
      : 1 / profiles.length,
  );

  const hhi = normalizedWeights.reduce(
    (sum, weight) => sum + weight * weight,
    0,
  );
  const minimumHhi = 1 / profiles.length;
  const normalizedHhi =
    profiles.length <= 1
      ? 1
      : clamp01((hhi - minimumHhi) / (1 - minimumHhi));

  const agentWeightById = new Map(
    profiles.map(
      (profile, index) =>
        [
          profile.agentId,
          normalizedWeights[index] ?? 0,
        ] as const,
    ),
  );

  const largestGroupWeight = correlatedGroups.reduce(
    (maximum, group) => {
      const groupWeight = group.reduce(
        (sum, agentId) =>
          sum + (agentWeightById.get(agentId) ?? 0),
        0,
      );

      return Math.max(maximum, groupWeight);
    },
    0,
  );

  const averageCorrelation =
    pairs.length === 0
      ? 0
      : average(
          pairs.map((pair) => pair.overallSimilarity),
        );

  return clamp01(
    0.45 * normalizedHhi +
      0.35 * largestGroupWeight +
      0.2 * averageCorrelation,
  );
}

function calculateViewpointDiversity(
  pairs: readonly MultiAgentDiversityPairAssessment[],
  agentCount: number,
): number {
  if (agentCount <= 1) {
    return 0;
  }

  if (pairs.length === 0) {
    return 0;
  }

  return clamp01(
    1 -
      average(
        pairs.map((pair) => pair.viewpointSimilarity),
      ),
  );
}

function categoricalDiversity(
  values: readonly string[],
): number {
  if (values.length <= 1) {
    return 0;
  }

  const counts = countValues(values);
  const entropy = normalizedEntropy(
    [...counts.values()],
    values.length,
  );
  const uniqueness =
    Math.max(0, counts.size - 1) /
    Math.max(1, values.length - 1);

  return clamp01(0.7 * entropy + 0.3 * uniqueness);
}

function setPopulationDiversity<TValue>(
  sets: readonly ReadonlySet<TValue>[],
): number {
  if (sets.length <= 1) {
    return 0;
  }

  const similarities: number[] = [];

  for (let leftIndex = 0; leftIndex < sets.length; leftIndex += 1) {
    const left = sets[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sets.length;
      rightIndex += 1
    ) {
      const right = sets[rightIndex];

      if (right !== undefined) {
        similarities.push(jaccardSimilarity(left, right));
      }
    }
  }

  if (similarities.length === 0) {
    return 0;
  }

  return clamp01(1 - average(similarities));
}

function blendedEvidenceSimilarity(
  left: AgentProfile,
  right: AgentProfile,
): number {
  const sourceSimilarity = jaccardSimilarity(
    left.evidenceSources,
    right.evidenceSources,
  );
  const directionSimilarity = cosineSimilarity01(
    left.evidenceDirections,
    right.evidenceDirections,
  );

  if (
    left.evidenceSources.size === 0 &&
    right.evidenceSources.size === 0 &&
    left.evidenceDirections.size === 0 &&
    right.evidenceDirections.size === 0
  ) {
    return 0;
  }

  return clamp01(
    0.65 * sourceSimilarity + 0.35 * directionSimilarity,
  );
}

function resolveParticipatingAgentIds(
  input: MultiAgentDiversityInput,
  registrations: readonly MultiAgentRegistration[],
): readonly MultiAgentId[] {
  const explicit = input.participatingAgentIds;

  if (explicit !== undefined) {
    return deepFreeze(uniqueSorted(explicit));
  }

  const referenced = new Set<MultiAgentId>();

  for (const observation of input.observations ?? []) {
    referenced.add(observation.agentId);
  }

  for (const proposal of input.proposals ?? []) {
    referenced.add(proposal.proposedByAgentId);
  }

  for (const review of input.reviews ?? []) {
    referenced.add(review.reviewerAgentId);
  }

  for (const statement of input.debate?.statements ?? []) {
    referenced.add(statement.agentId);
  }

  if (referenced.size > 0) {
    return deepFreeze([...referenced].sort());
  }

  return deepFreeze(
    registrations
      .map((registration) => registration.identity.agentId)
      .sort(),
  );
}

function resolveTrust(
  trust: number | undefined,
  trustInfluence: number,
): number {
  const normalizedTrust =
    trust === undefined ? 0.5 : clamp01(trust);

  return Math.max(
    Number.EPSILON,
    1 + (normalizedTrust - 0.5) * 2 * trustInfluence,
  );
}

function buildModelIdentity(
  registration: MultiAgentRegistration,
): string {
  const modelId =
    registration.identity.modelId?.trim() || "NO_MODEL_ID";

  return [
    registration.identity.modelType,
    modelId,
    registration.reasoningMode,
    registration.deterministic ? "DETERMINISTIC" : "NON_DETERMINISTIC",
  ].join("|");
}

function reviewDecisionValue(
  decision: MultiAgentReviewDecision,
): number {
  const values: Readonly<Record<MultiAgentReviewDecision, number>> =
    Object.freeze({
      STRONGLY_SUPPORT: 1,
      SUPPORT: 0.75,
      SUPPORT_WITH_CHANGES: 0.4,
      NEUTRAL: 0,
      OPPOSE: -0.65,
      STRONGLY_OPPOSE: -0.9,
      VETO: -1,
    });

  return values[decision];
}

function debatePositionValue(
  position: MultiAgentDebatePosition,
): number {
  const values: Readonly<Record<MultiAgentDebatePosition, number>> =
    Object.freeze({
      AFFIRMATIVE: 1,
      NEGATIVE: -1,
      NEUTRAL: 0,
      ARBITER: 0.25,
    });

  return values[position];
}

function directionValue(
  direction: MultiAgentEvidenceDirection,
): number {
  const values: Readonly<
    Record<MultiAgentEvidenceDirection, number>
  > = Object.freeze({
    SUPPORTING: 1,
    OPPOSING: -1,
    NEUTRAL: 0,
    CONTEXTUAL: 0.25,
    INVALIDATING: -1,
  });

  return values[direction];
}

function center01(value: number): number {
  return clamp(value, 0, 1) * 2 - 1;
}

function jaccardSimilarity<TValue>(
  left: ReadonlySet<TValue>,
  right: ReadonlySet<TValue>,
): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;

  return union === 0 ? 0 : clamp01(intersection / union);
}

function cosineSimilarity01<TKey>(
  left: ReadonlyMap<TKey, number>,
  right: ReadonlyMap<TKey, number>,
): number {
  if (left.size === 0 && right.size === 0) {
    return 0;
  }

  const keys = new Set<TKey>([
    ...left.keys(),
    ...right.keys(),
  ]);

  let dot = 0;
  let leftMagnitudeSquared = 0;
  let rightMagnitudeSquared = 0;

  for (const key of keys) {
    const leftValue = left.get(key) ?? 0;
    const rightValue = right.get(key) ?? 0;

    dot += leftValue * rightValue;
    leftMagnitudeSquared += leftValue * leftValue;
    rightMagnitudeSquared += rightValue * rightValue;
  }

  if (
    leftMagnitudeSquared === 0 ||
    rightMagnitudeSquared === 0
  ) {
    return 0;
  }

  const cosine =
    dot /
    Math.sqrt(leftMagnitudeSquared * rightMagnitudeSquared);

  return clamp01((clamp(cosine, -1, 1) + 1) / 2);
}

function normalizedEntropy(
  counts: readonly number[],
  total: number,
): number {
  if (total <= 1 || counts.length <= 1) {
    return 0;
  }

  let entropy = 0;

  for (const count of counts) {
    if (count <= 0) {
      continue;
    }

    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }

  const maximumEntropy = Math.log(
    Math.min(total, counts.length),
  );

  return maximumEntropy <= 0
    ? 0
    : clamp01(entropy / maximumEntropy);
}

function countValues(
  values: readonly string[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function weightedAverage(
  items: readonly {
    readonly value: number;
    readonly weight: number;
  }[],
): number {
  const totalWeight = items.reduce(
    (sum, item) => sum + item.weight,
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return items.reduce(
    (sum, item) => sum + item.value * item.weight,
    0,
  ) / totalWeight;
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) /
        values.length;
}

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return [...new Set(values)].sort();
}

function compareRegistrations(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return left.identity.agentId.localeCompare(
    right.identity.agentId,
  );
}

function comparePairAssessments(
  left: MultiAgentDiversityPairAssessment,
  right: MultiAgentDiversityPairAssessment,
): number {
  const leftDifference = left.leftAgentId.localeCompare(
    right.leftAgentId,
  );

  return leftDifference !== 0
    ? leftDifference
    : left.rightAgentId.localeCompare(right.rightAgentId);
}

function validateInput(
  input: MultiAgentDiversityInput,
  options: NormalizedOptions,
): void {
  if (!isRecord(input)) {
    throw new MultiAgentDiversityEngineError(
      "INVALID_DIVERSITY_INPUT",
      "Diversity input must be an object.",
    );
  }

  assertArray(input.registrations, "input.registrations");

  const registrationIds = new Set<MultiAgentId>();

  input.registrations.forEach((registration, index) => {
    if (!isRecord(registration)) {
      throw invalidInput(
        `input.registrations[${index}]`,
        "must be an object.",
        index,
      );
    }

    assertNonEmptyString(
      registration.identity?.agentId,
      `input.registrations[${index}].identity.agentId`,
    );

    const agentId = registration.identity.agentId;

    if (registrationIds.has(agentId)) {
      throw new MultiAgentDiversityEngineError(
        "DUPLICATE_AGENT_ID",
        `Duplicate registration for agent "${agentId}".`,
        { agentId, index },
      );
    }

    registrationIds.add(agentId);

    assertArray(
      registration.capabilities,
      `input.registrations[${index}].capabilities`,
    );
  });

  validateOptionalArray(input.observations, "input.observations");
  validateOptionalArray(input.proposals, "input.proposals");
  validateOptionalArray(input.reviews, "input.reviews");
  validateOptionalArray(
    input.trustScores,
    "input.trustScores",
  );
  validateOptionalArray(
    input.participatingAgentIds,
    "input.participatingAgentIds",
  );

  const references = collectAgentReferences(input);

  if (options.rejectUnknownAgentReferences) {
    for (const agentId of references) {
      if (!registrationIds.has(agentId)) {
        throw new MultiAgentDiversityEngineError(
          "UNKNOWN_AGENT_REFERENCE",
          `Diversity input references unregistered agent "${agentId}".`,
          { agentId },
        );
      }
    }
  }

  for (const trustScore of input.trustScores ?? []) {
    assertNonEmptyString(
      trustScore.agentId,
      "input.trustScores[].agentId",
    );
    assertUnitInterval(
      trustScore.overallTrust,
      "input.trustScores[].overallTrust",
    );
  }
}

function collectAgentReferences(
  input: MultiAgentDiversityInput,
): ReadonlySet<MultiAgentId> {
  const references = new Set<MultiAgentId>();

  for (const agentId of input.participatingAgentIds ?? []) {
    assertNonEmptyString(
      agentId,
      "input.participatingAgentIds[]",
    );
    references.add(agentId);
  }

  for (const observation of input.observations ?? []) {
    assertNonEmptyString(
      observation.agentId,
      "input.observations[].agentId",
    );
    references.add(observation.agentId);
  }

  for (const proposal of input.proposals ?? []) {
    assertNonEmptyString(
      proposal.proposedByAgentId,
      "input.proposals[].proposedByAgentId",
    );
    references.add(proposal.proposedByAgentId);
  }

  for (const review of input.reviews ?? []) {
    assertNonEmptyString(
      review.reviewerAgentId,
      "input.reviews[].reviewerAgentId",
    );
    references.add(review.reviewerAgentId);
  }

  for (const statement of input.debate?.statements ?? []) {
    assertNonEmptyString(
      statement.agentId,
      "input.debate.statements[].agentId",
    );
    references.add(statement.agentId);
  }

  for (const score of input.trustScores ?? []) {
    references.add(score.agentId);
  }

  return references;
}

function normalizeOptions(
  options: MultiAgentDiversityEngineOptions,
): NormalizedOptions {
  if (!isRecord(options)) {
    throw new MultiAgentDiversityEngineError(
      "INVALID_DIVERSITY_OPTIONS",
      "Diversity engine options must be an object.",
    );
  }

  const weights: MultiAgentDiversityDimensionWeights = {
    role:
      options.dimensionWeights?.role ??
      DEFAULT_DIMENSION_WEIGHTS.role,
    capability:
      options.dimensionWeights?.capability ??
      DEFAULT_DIMENSION_WEIGHTS.capability,
    model:
      options.dimensionWeights?.model ??
      DEFAULT_DIMENSION_WEIGHTS.model,
    evidence:
      options.dimensionWeights?.evidence ??
      DEFAULT_DIMENSION_WEIGHTS.evidence,
    viewpoint:
      options.dimensionWeights?.viewpoint ??
      DEFAULT_DIMENSION_WEIGHTS.viewpoint,
  };

  const normalized: NormalizedOptions = {
    correlationThreshold:
      options.correlationThreshold ?? 0.72,
    minimumCorrelatedGroupSize:
      options.minimumCorrelatedGroupSize ?? 2,
    dimensionWeights: weights,
    trustInfluence: options.trustInfluence ?? 0.35,
    rejectUnknownAgentReferences:
      options.rejectUnknownAgentReferences ?? true,
    minimumEvidenceReliability:
      options.minimumEvidenceReliability ?? 0,
    minimumEvidenceConfidence:
      options.minimumEvidenceConfidence ?? 0,
  };

  assertUnitInterval(
    normalized.correlationThreshold,
    "options.correlationThreshold",
  );
  assertPositiveInteger(
    normalized.minimumCorrelatedGroupSize,
    "options.minimumCorrelatedGroupSize",
  );
  assertUnitInterval(
    normalized.trustInfluence,
    "options.trustInfluence",
  );
  assertUnitInterval(
    normalized.minimumEvidenceReliability,
    "options.minimumEvidenceReliability",
  );
  assertUnitInterval(
    normalized.minimumEvidenceConfidence,
    "options.minimumEvidenceConfidence",
  );

  const weightEntries = Object.entries(weights);

  for (const [name, value] of weightEntries) {
    if (!Number.isFinite(value) || value < 0) {
      throw new MultiAgentDiversityEngineError(
        "INVALID_DIVERSITY_OPTIONS",
        `options.dimensionWeights.${name} must be a non-negative finite number.`,
        { field: `dimensionWeights.${name}` },
      );
    }
  }

  const totalWeight = weightEntries.reduce(
    (sum, [, value]) => sum + value,
    0,
  );

  if (totalWeight <= 0) {
    throw new MultiAgentDiversityEngineError(
      "INVALID_DIVERSITY_OPTIONS",
      "At least one diversity dimension weight must be positive.",
      { field: "dimensionWeights" },
    );
  }

  return deepFreeze(normalized);
}

function invalidInput(
  field: string,
  message: string,
  index?: number,
): MultiAgentDiversityEngineError {
  return new MultiAgentDiversityEngineError(
    "INVALID_DIVERSITY_INPUT",
    `${field} ${message}`,
    { field, index },
  );
}

function validateOptionalArray(
  value: unknown,
  field: string,
): void {
  if (value !== undefined) {
    assertArray(value, field);
  }
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidInput(field, "must be an array.");
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw invalidInput(
      field,
      "must be a non-empty string.",
    );
  }
}

function assertUnitInterval(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new MultiAgentDiversityEngineError(
      "INVALID_DIVERSITY_OPTIONS",
      `${field} must be a finite number between 0 and 1.`,
      { field },
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new MultiAgentDiversityEngineError(
      "INVALID_DIVERSITY_OPTIONS",
      `${field} must be a positive integer.`,
      { field },
    );
  }
}

function isRecord(
  value: unknown,
): value is Record<string, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a32:${(hash >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return '"NaN"';
    }

    if (value === Infinity) {
      return '"Infinity"';
    }

    if (value === -Infinity) {
      return '"-Infinity"';
    }

    return JSON.stringify(value);
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "undefined") {
    return '"undefined"';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value instanceof Set) {
    return stableSerialize(
      [...value].map((item) => stableSerialize(item)).sort(),
    );
  }

  if (value instanceof Map) {
    return stableSerialize(
      [...value.entries()]
        .map(([key, itemValue]) => [
          stableSerialize(key),
          stableSerialize(itemValue),
        ])
        .sort(([leftKey], [rightKey]) =>
          String(leftKey).localeCompare(String(rightKey)),
        ),
    );
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
      );

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  if (value instanceof Map) {
    for (const [key, itemValue] of value) {
      deepFreeze(key);
      deepFreeze(itemValue);
    }

    Object.freeze(value);
    return value;
  }

  if (value instanceof Set) {
    for (const item of value) {
      deepFreeze(item);
    }

    Object.freeze(value);
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    const record = value as Record<PropertyKey, unknown>;
    deepFreeze(record[key]);
  }

  return Object.freeze(value);
}