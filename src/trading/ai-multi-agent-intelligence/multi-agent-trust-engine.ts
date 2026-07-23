/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-trust-engine.ts
 *
 * Deterministic, immutable trust assessment and calibration for registered
 * multi-agent trading-intelligence participants.
 */

import {
  type MultiAgentCalibrationObservation,
  type MultiAgentId,
  type MultiAgentRegistration,
  type MultiAgentScore,
  type MultiAgentTimestamp,
  type MultiAgentTrustEnginePort,
  type MultiAgentTrustPolicy,
  type MultiAgentTrustScore,
  type MultiAgentTrustUpdate,
  type MultiAgentUtility,
} from "./ai-multi-agent-contracts";

export type MultiAgentTrustEngineErrorCode =
  | "INVALID_TRUST_POLICY"
  | "INVALID_REGISTRATION"
  | "INVALID_CALIBRATION_OBSERVATION"
  | "INVALID_PREVIOUS_TRUST_SCORE"
  | "DUPLICATE_AGENT_ID"
  | "UNKNOWN_AGENT_OBSERVATION"
  | "TRUST_ASSESSMENT_FAILED"
  | "TRUST_UPDATE_FAILED";

export interface MultiAgentTrustEngineErrorDetails {
  readonly agentId?: MultiAgentId;
  readonly runId?: string;
  readonly field?: string;
  readonly index?: number;
  readonly cause?: unknown;
}

export class MultiAgentTrustEngineError extends Error {
  public readonly code: MultiAgentTrustEngineErrorCode;
  public readonly details: MultiAgentTrustEngineErrorDetails;

  public constructor(
    code: MultiAgentTrustEngineErrorCode,
    message: string,
    details: MultiAgentTrustEngineErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentTrustEngineError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentTrustClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentTrustEngineOptions {
  readonly clock?: MultiAgentTrustClock;

  /**
   * Number of synthetic prior samples applied to a newly assessed agent.
   * This prevents one early observation from causing an excessive trust move.
   */
  readonly priorSampleSize?: number;

  /**
   * Maximum number of observations retained in each returned update.
   * The complete observation set is still used in the calculation.
   */
  readonly maximumSupportingObservations?: number;

  /**
   * When true, observations for agents absent from the supplied score set cause
   * an error. When false, those observations are ignored deterministically.
   */
  readonly rejectUnknownAgents?: boolean;
}

export interface MultiAgentTrustEngineSnapshot {
  readonly operation?: "ASSESS" | "UPDATE";
  readonly assessedAgentCount: number;
  readonly observationCount: number;
  readonly updateCount: number;
  readonly quarantinedAgentIds: readonly MultiAgentId[];
  readonly belowVotingThresholdAgentIds: readonly MultiAgentId[];
  readonly capturedAtMs?: MultiAgentTimestamp;
  readonly deterministicFingerprint: string;
}

interface NormalizedTrustEngineOptions {
  readonly clock: MultiAgentTrustClock;
  readonly priorSampleSize: number;
  readonly maximumSupportingObservations: number;
  readonly rejectUnknownAgents: boolean;
}

interface TrustDimensions {
  readonly historicalAccuracy: number;
  readonly calibrationScore: number;
  readonly reliabilityScore: number;
  readonly evidenceQualityScore: number;
  readonly governanceComplianceScore: number;
  readonly collaborationScore: number;
  readonly outcomeContributionScore: number;
}

interface WeightedObservation {
  readonly observation: MultiAgentCalibrationObservation;
  readonly chronologicalIndex: number;
  readonly recencyWeight: number;
}

interface ObservationStatistics {
  readonly dimensions: TrustDimensions;
  readonly effectiveSampleSize: number;
  readonly rawSampleSize: number;
}

const DEFAULT_PRIOR_SAMPLE_SIZE = 5;
const DEFAULT_MAXIMUM_SUPPORTING_OBSERVATIONS = 100;
const DEFAULT_MODEL_BASELINE = 0.7;

const SYSTEM_CLOCK: MultiAgentTrustClock = Object.freeze({
  now: (): MultiAgentTimestamp => Date.now() as MultiAgentTimestamp,
});

const EMPTY_SNAPSHOT_FINGERPRINT = stableFingerprint({
  type: "MULTI_AGENT_TRUST_ENGINE_SNAPSHOT",
  state: "EMPTY",
});

export class MultiAgentTrustEngine implements MultiAgentTrustEnginePort {
  private readonly options: NormalizedTrustEngineOptions;
  private lastSnapshotValue: MultiAgentTrustEngineSnapshot;

  public constructor(options: MultiAgentTrustEngineOptions = {}) {
    this.options = normalizeOptions(options);
    this.lastSnapshotValue = deepFreeze({
      assessedAgentCount: 0,
      observationCount: 0,
      updateCount: 0,
      quarantinedAgentIds: Object.freeze([]),
      belowVotingThresholdAgentIds: Object.freeze([]),
      deterministicFingerprint: EMPTY_SNAPSHOT_FINGERPRINT,
    });
  }

  public assess(
    registrations: readonly MultiAgentRegistration[],
    history: readonly MultiAgentCalibrationObservation[],
    policy: MultiAgentTrustPolicy,
  ): readonly MultiAgentTrustScore[] {
    try {
      validatePolicy(policy);
      validateRegistrations(registrations);
      validateObservations(history);

      const assessedAtMs = this.options.clock.now();
      assertFiniteNumber(assessedAtMs, "clock.now()");

      const registrationIds = new Set(
        registrations.map((registration) => registration.identity.agentId),
      );

      if (this.options.rejectUnknownAgents) {
        for (const observation of history) {
          if (!registrationIds.has(observation.agentId)) {
            throw new MultiAgentTrustEngineError(
              "UNKNOWN_AGENT_OBSERVATION",
              `Calibration history references unregistered agent "${observation.agentId}".`,
              {
                agentId: observation.agentId,
                runId: observation.runId,
              },
            );
          }
        }
      }

      const scores = registrations
        .slice()
        .sort(compareRegistrations)
        .map((registration) => {
          const agentId = registration.identity.agentId;
          const observations = history
            .filter((observation) => observation.agentId === agentId)
            .slice()
            .sort(compareObservations);

          return assessAgent(
            agentId,
            registration,
            observations,
            policy,
            assessedAtMs,
            this.options.priorSampleSize,
          );
        });

      const immutableScores = deepFreeze(scores);

      this.lastSnapshotValue = createSnapshot(
        "ASSESS",
        immutableScores,
        history.length,
        0,
        policy,
        assessedAtMs,
      );

      return immutableScores;
    } catch (cause) {
      if (cause instanceof MultiAgentTrustEngineError) {
        throw cause;
      }

      throw new MultiAgentTrustEngineError(
        "TRUST_ASSESSMENT_FAILED",
        "Failed to assess multi-agent trust.",
        { cause },
      );
    }
  }

  public update(
    previous: readonly MultiAgentTrustScore[],
    observations: readonly MultiAgentCalibrationObservation[],
    policy: MultiAgentTrustPolicy,
  ): readonly MultiAgentTrustUpdate[] {
    try {
      validatePolicy(policy);
      validatePreviousScores(previous);
      validateObservations(observations);

      const updatedAtMs = this.options.clock.now();
      assertFiniteNumber(updatedAtMs, "clock.now()");

      const previousByAgentId = new Map(
        previous.map((score) => [score.agentId, score] as const),
      );

      if (this.options.rejectUnknownAgents) {
        for (const observation of observations) {
          if (!previousByAgentId.has(observation.agentId)) {
            throw new MultiAgentTrustEngineError(
              "UNKNOWN_AGENT_OBSERVATION",
              `Calibration observation references agent "${observation.agentId}" without a previous trust score.`,
              {
                agentId: observation.agentId,
                runId: observation.runId,
              },
            );
          }
        }
      }

      const observationsByAgentId = groupObservationsByAgent(observations);

      const updates = previous
        .slice()
        .sort(compareTrustScores)
        .map((previousScore) => {
          const agentObservations =
            observationsByAgentId.get(previousScore.agentId) ??
            Object.freeze([]);

          const current = updateAgentScore(
            previousScore,
            agentObservations,
            policy,
            updatedAtMs,
          );

          return deepFreeze({
            agentId: previousScore.agentId,
            previous: deepFreeze(cloneTrustScore(previousScore)),
            current,
            reason: buildUpdateReason(
              previousScore,
              current,
              agentObservations,
              policy,
            ),
            supportingObservations: deepFreeze(
              agentObservations
                .slice()
                .sort(compareObservations)
                .slice(-this.options.maximumSupportingObservations)
                .map(cloneObservation),
            ),
            updatedAtMs,
          } satisfies MultiAgentTrustUpdate);
        });

      const immutableUpdates = deepFreeze(updates);
      const currentScores = immutableUpdates.map((update) => update.current);

      this.lastSnapshotValue = createSnapshot(
        "UPDATE",
        currentScores,
        observations.length,
        immutableUpdates.length,
        policy,
        updatedAtMs,
      );

      return immutableUpdates;
    } catch (cause) {
      if (cause instanceof MultiAgentTrustEngineError) {
        throw cause;
      }

      throw new MultiAgentTrustEngineError(
        "TRUST_UPDATE_FAILED",
        "Failed to update multi-agent trust.",
        { cause },
      );
    }
  }

  public snapshot(): MultiAgentTrustEngineSnapshot {
    return this.lastSnapshotValue;
  }
}

export function createMultiAgentTrustEngine(
  options: MultiAgentTrustEngineOptions = {},
): MultiAgentTrustEngine {
  return new MultiAgentTrustEngine(options);
}

function assessAgent(
  agentId: MultiAgentId,
  registration: MultiAgentRegistration,
  observations: readonly MultiAgentCalibrationObservation[],
  policy: MultiAgentTrustPolicy,
  assessedAtMs: MultiAgentTimestamp,
  priorSampleSize: number,
): MultiAgentTrustScore {
  if (!policy.enabled) {
    return createBaselineScore(
      agentId,
      policy.initialTrust,
      observations.length,
      assessedAtMs,
    );
  }

  if (observations.length === 0) {
    const deterministicReadiness =
      registration.deterministic && registration.replaySafe ? 1 : 0.5;

    const capabilityReadiness =
      registration.capabilities.length === 0
        ? policy.initialTrust
        : weightedAverage(
            registration.capabilities.map((capability) => [
              capability.enabled
                ? clamp01(
                    average([
                      capability.proficiency,
                      capability.confidenceFloor,
                    ]),
                  )
                : 0,
              capability.enabled ? 1 : 0.25,
            ]),
            policy.initialTrust,
          );

    const readiness = clamp01(
      weightedAverage(
        [
          [policy.initialTrust, 0.6],
          [deterministicReadiness, 0.2],
          [capabilityReadiness, 0.2],
        ],
        policy.initialTrust,
      ),
    );

    const dimensions: TrustDimensions = {
      historicalAccuracy: readiness,
      calibrationScore: readiness,
      reliabilityScore: readiness,
      evidenceQualityScore: capabilityReadiness,
      governanceComplianceScore: readiness,
      collaborationScore: readiness,
      outcomeContributionScore: readiness,
    };

    return buildTrustScore(
      agentId,
      dimensions,
      policy,
      0,
      assessedAtMs,
    );
  }

  const statistics = calculateObservationStatistics(
    observations,
    policy.decayRate,
    policy.initialTrust,
  );

  const priorWeight = Math.max(0, priorSampleSize);
  const observedWeight = statistics.effectiveSampleSize;

  const shrunkDimensions = mapDimensions((dimension) =>
    weightedAverage(
      [
        [policy.initialTrust, priorWeight],
        [dimension, observedWeight],
      ],
      policy.initialTrust,
    ),
  )(statistics.dimensions);

  return buildTrustScore(
    agentId,
    shrunkDimensions,
    policy,
    statistics.rawSampleSize,
    assessedAtMs,
  );
}

function updateAgentScore(
  previous: MultiAgentTrustScore,
  observations: readonly MultiAgentCalibrationObservation[],
  policy: MultiAgentTrustPolicy,
  updatedAtMs: MultiAgentTimestamp,
): MultiAgentTrustScore {
  if (!policy.enabled) {
    return deepFreeze({
      ...cloneTrustScore(previous),
      assessedAtMs: updatedAtMs,
    });
  }

  if (observations.length === 0) {
    const decayedDimensions: TrustDimensions = {
      historicalAccuracy: decayTowardBaseline(
        previous.historicalAccuracy,
        policy.initialTrust,
        policy.decayRate,
      ),
      calibrationScore: decayTowardBaseline(
        previous.calibrationScore,
        policy.initialTrust,
        policy.decayRate,
      ),
      reliabilityScore: decayTowardBaseline(
        previous.reliabilityScore,
        policy.initialTrust,
        policy.decayRate,
      ),
      evidenceQualityScore: decayTowardBaseline(
        previous.evidenceQualityScore,
        policy.initialTrust,
        policy.decayRate,
      ),
      governanceComplianceScore: decayTowardBaseline(
        previous.governanceComplianceScore,
        policy.initialTrust,
        policy.decayRate,
      ),
      collaborationScore: decayTowardBaseline(
        previous.collaborationScore,
        policy.initialTrust,
        policy.decayRate,
      ),
      outcomeContributionScore: decayTowardBaseline(
        previous.outcomeContributionScore,
        policy.initialTrust,
        policy.decayRate,
      ),
    };

    return buildTrustScore(
      previous.agentId,
      decayedDimensions,
      policy,
      previous.sampleSize,
      updatedAtMs,
    );
  }

  const statistics = calculateObservationStatistics(
    observations,
    policy.decayRate,
    policy.initialTrust,
  );

  const adaptiveRate = clamp01(
    1 - Math.pow(1 - policy.learningRate, observations.length),
  );

  const previousDimensions = dimensionsFromScore(previous);
  const blendedDimensions = combineDimensions(
    previousDimensions,
    statistics.dimensions,
    adaptiveRate,
  );

  return buildTrustScore(
    previous.agentId,
    blendedDimensions,
    policy,
    previous.sampleSize + statistics.rawSampleSize,
    updatedAtMs,
  );
}

function calculateObservationStatistics(
  observations: readonly MultiAgentCalibrationObservation[],
  decayRate: number,
  baseline: number,
): ObservationStatistics {
  const ordered = observations.slice().sort(compareObservations);

  if (ordered.length === 0) {
    return {
      dimensions: baselineDimensions(baseline),
      effectiveSampleSize: 0,
      rawSampleSize: 0,
    };
  }

  const weighted = ordered.map(
    (observation, chronologicalIndex): WeightedObservation => ({
      observation,
      chronologicalIndex,
      recencyWeight: calculateRecencyWeight(
        ordered.length,
        chronologicalIndex,
        decayRate,
      ),
    }),
  );

  const historicalAccuracy = weightedMean(
    weighted,
    ({ observation }) => observation.realizedCorrectness,
    baseline,
  );

  const calibrationScore = weightedMean(
    weighted,
    ({ observation }) =>
      1 -
      Math.abs(
        observation.predictedConfidence -
          observation.realizedCorrectness,
      ),
    baseline,
  );

  const correctnessValues = weighted.map(
    ({ observation }) => observation.realizedCorrectness,
  );
  const calibrationValues = weighted.map(
    ({ observation }) =>
      1 -
      Math.abs(
        observation.predictedConfidence -
          observation.realizedCorrectness,
      ),
  );

  const outcomeValues = weighted.map(({ observation }) =>
    normalizeOutcomeContribution(
      observation.utilityContribution,
      observation.riskContribution,
    ),
  );

  const correctnessStability = 1 - normalizedDispersion(correctnessValues);
  const calibrationStability = 1 - normalizedDispersion(calibrationValues);
  const outcomeStability = 1 - normalizedDispersion(outcomeValues);

  const reliabilityScore = clamp01(
    weightedAverage(
      [
        [historicalAccuracy, 0.35],
        [calibrationScore, 0.25],
        [correctnessStability, 0.2],
        [outcomeStability, 0.2],
      ],
      baseline,
    ),
  );

  /*
   * The calibration contract does not carry direct evidence, governance, or
   * collaboration fields. These dimensions therefore use deterministic,
   * conservative proxies rather than inventing external state:
   *
   * - evidence quality: confidence calibration plus correctness;
   * - governance compliance: penalizes realized risk not offset by utility;
   * - collaboration: consistency of contribution across independent runs.
   */
  const evidenceQualityScore = clamp01(
    weightedAverage(
      [
        [calibrationScore, 0.55],
        [historicalAccuracy, 0.35],
        [correctnessStability, 0.1],
      ],
      baseline,
    ),
  );

  const governanceComplianceScore = weightedMean(
    weighted,
    ({ observation }) =>
      calculateGovernanceProxy(
        observation.realizedCorrectness,
        observation.utilityContribution,
        observation.riskContribution,
      ),
    baseline,
  );

  const collaborationScore = clamp01(
    weightedAverage(
      [
        [outcomeStability, 0.35],
        [correctnessStability, 0.25],
        [calibrationStability, 0.2],
        [calibrationScore, 0.2],
      ],
      baseline,
    ),
  );

  const outcomeContributionScore = weightedMean(
    weighted,
    ({ observation }) =>
      normalizeOutcomeContribution(
        observation.utilityContribution,
        observation.riskContribution,
      ),
    baseline,
  );

  return {
    dimensions: {
      historicalAccuracy: clamp01(historicalAccuracy),
      calibrationScore: clamp01(calibrationScore),
      reliabilityScore,
      evidenceQualityScore,
      governanceComplianceScore: clamp01(
        governanceComplianceScore,
      ),
      collaborationScore,
      outcomeContributionScore: clamp01(
        outcomeContributionScore,
      ),
    },
    effectiveSampleSize: weighted.reduce(
      (total, value) => total + value.recencyWeight,
      0,
    ),
    rawSampleSize: ordered.length,
  };
}

function buildTrustScore(
  agentId: MultiAgentId,
  dimensions: TrustDimensions,
  policy: MultiAgentTrustPolicy,
  sampleSize: number,
  assessedAtMs: MultiAgentTimestamp,
): MultiAgentTrustScore {
  const normalized = mapDimensions(clamp01)(dimensions);

  const overallTrust = clamp01(
    weightedAverage(
      [
        [normalized.historicalAccuracy, policy.accuracyWeight],
        [normalized.calibrationScore, policy.calibrationWeight],
        [normalized.reliabilityScore, policy.reliabilityWeight],
        [
          normalized.evidenceQualityScore,
          policy.evidenceQualityWeight,
        ],
        [
          normalized.governanceComplianceScore,
          policy.governanceComplianceWeight,
        ],
        [normalized.collaborationScore, policy.collaborationWeight],
        [
          normalized.outcomeContributionScore,
          policy.outcomeContributionWeight,
        ],
      ],
      policy.initialTrust,
    ),
  );

  return deepFreeze({
    agentId,
    overallTrust,
    historicalAccuracy: normalized.historicalAccuracy,
    calibrationScore: normalized.calibrationScore,
    reliabilityScore: normalized.reliabilityScore,
    evidenceQualityScore: normalized.evidenceQualityScore,
    governanceComplianceScore:
      normalized.governanceComplianceScore,
    collaborationScore: normalized.collaborationScore,
    outcomeContributionScore:
      normalized.outcomeContributionScore,
    sampleSize,
    assessedAtMs,
  });
}

function createBaselineScore(
  agentId: MultiAgentId,
  baseline: number,
  sampleSize: number,
  assessedAtMs: MultiAgentTimestamp,
): MultiAgentTrustScore {
  return buildTrustScore(
    agentId,
    baselineDimensions(baseline),
    {
      enabled: true,
      initialTrust: baseline,
      minimumVotingTrust: 0,
      accuracyWeight: 1,
      calibrationWeight: 1,
      reliabilityWeight: 1,
      evidenceQualityWeight: 1,
      governanceComplianceWeight: 1,
      collaborationWeight: 1,
      outcomeContributionWeight: 1,
      learningRate: 0,
      decayRate: 0,
      quarantineThreshold: 0,
    },
    sampleSize,
    assessedAtMs,
  );
}

function createSnapshot(
  operation: "ASSESS" | "UPDATE",
  scores: readonly MultiAgentTrustScore[],
  observationCount: number,
  updateCount: number,
  policy: MultiAgentTrustPolicy,
  capturedAtMs: MultiAgentTimestamp,
): MultiAgentTrustEngineSnapshot {
  const quarantinedAgentIds = scores
    .filter((score) => score.overallTrust < policy.quarantineThreshold)
    .map((score) => score.agentId)
    .sort(compareStrings);

  const belowVotingThresholdAgentIds = scores
    .filter((score) => score.overallTrust < policy.minimumVotingTrust)
    .map((score) => score.agentId)
    .sort(compareStrings);

  return deepFreeze({
    operation,
    assessedAgentCount: scores.length,
    observationCount,
    updateCount,
    quarantinedAgentIds,
    belowVotingThresholdAgentIds,
    capturedAtMs,
    deterministicFingerprint: stableFingerprint({
      operation,
      scores,
      observationCount,
      updateCount,
      quarantinedAgentIds,
      belowVotingThresholdAgentIds,
      capturedAtMs,
    }),
  });
}

function buildUpdateReason(
  previous: MultiAgentTrustScore,
  current: MultiAgentTrustScore,
  observations: readonly MultiAgentCalibrationObservation[],
  policy: MultiAgentTrustPolicy,
): string {
  if (!policy.enabled) {
    return "Trust calibration is disabled; the previous trust dimensions were preserved.";
  }

  if (observations.length === 0) {
    const direction =
      current.overallTrust > previous.overallTrust
        ? "increased"
        : current.overallTrust < previous.overallTrust
          ? "decreased"
          : "remained unchanged";

    return `No new calibration observations were available; trust ${direction} through deterministic decay toward the configured baseline.`;
  }

  const delta = current.overallTrust - previous.overallTrust;
  const direction =
    delta > 0 ? "increased" : delta < 0 ? "decreased" : "remained unchanged";

  const averageCorrectness = average(
    observations.map((observation) => observation.realizedCorrectness),
  );
  const averageCalibration = average(
    observations.map(
      (observation) =>
        1 -
        Math.abs(
          observation.predictedConfidence -
            observation.realizedCorrectness,
        ),
    ),
  );

  return `Trust ${direction} after ${observations.length} calibration observation(s); average realized correctness was ${formatScore(
    averageCorrectness,
  )} and confidence calibration was ${formatScore(
    averageCalibration,
  )}.`;
}

function groupObservationsByAgent(
  observations: readonly MultiAgentCalibrationObservation[],
): ReadonlyMap<
  MultiAgentId,
  readonly MultiAgentCalibrationObservation[]
> {
  const mutable = new Map<
    MultiAgentId,
    MultiAgentCalibrationObservation[]
  >();

  for (const observation of observations) {
    const group = mutable.get(observation.agentId);

    if (group === undefined) {
      mutable.set(observation.agentId, [observation]);
    } else {
      group.push(observation);
    }
  }

  const immutable = new Map<
    MultiAgentId,
    readonly MultiAgentCalibrationObservation[]
  >();

  for (const [agentId, group] of mutable) {
    immutable.set(
      agentId,
      deepFreeze(group.slice().sort(compareObservations)),
    );
  }

  return immutable;
}

function normalizeOutcomeContribution(
  utilityContribution: MultiAgentUtility,
  riskContribution: number,
): number {
  const utility = signedUnitToNormalized(utilityContribution);
  const risk = clamp01(Math.abs(riskContribution));

  return clamp01(utility * (1 - 0.5 * risk));
}

function calculateGovernanceProxy(
  realizedCorrectness: number,
  utilityContribution: number,
  riskContribution: number,
): number {
  const utility = signedUnitToNormalized(utilityContribution);
  const risk = clamp01(Math.abs(riskContribution));

  const uncompensatedRisk = clamp01(risk - utility);
  return clamp01(
    0.55 * realizedCorrectness +
      0.3 * utility +
      0.15 * (1 - uncompensatedRisk),
  );
}

function signedUnitToNormalized(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  if (value >= -1 && value <= 1) {
    return clamp01((value + 1) / 2);
  }

  return clamp01(0.5 + Math.atan(value) / Math.PI);
}

function calculateRecencyWeight(
  count: number,
  chronologicalIndex: number,
  decayRate: number,
): number {
  const age = count - chronologicalIndex - 1;
  return Math.pow(1 - clamp01(decayRate), age);
}

function decayTowardBaseline(
  current: number,
  baseline: number,
  decayRate: number,
): number {
  return clamp01(
    current + (baseline - current) * clamp01(decayRate),
  );
}

function combineDimensions(
  previous: TrustDimensions,
  observed: TrustDimensions,
  learningRate: number,
): TrustDimensions {
  const blend = (oldValue: number, newValue: number): number =>
    clamp01(oldValue + (newValue - oldValue) * learningRate);

  return {
    historicalAccuracy: blend(
      previous.historicalAccuracy,
      observed.historicalAccuracy,
    ),
    calibrationScore: blend(
      previous.calibrationScore,
      observed.calibrationScore,
    ),
    reliabilityScore: blend(
      previous.reliabilityScore,
      observed.reliabilityScore,
    ),
    evidenceQualityScore: blend(
      previous.evidenceQualityScore,
      observed.evidenceQualityScore,
    ),
    governanceComplianceScore: blend(
      previous.governanceComplianceScore,
      observed.governanceComplianceScore,
    ),
    collaborationScore: blend(
      previous.collaborationScore,
      observed.collaborationScore,
    ),
    outcomeContributionScore: blend(
      previous.outcomeContributionScore,
      observed.outcomeContributionScore,
    ),
  };
}

function dimensionsFromScore(
  score: MultiAgentTrustScore,
): TrustDimensions {
  return {
    historicalAccuracy: score.historicalAccuracy,
    calibrationScore: score.calibrationScore,
    reliabilityScore: score.reliabilityScore,
    evidenceQualityScore: score.evidenceQualityScore,
    governanceComplianceScore:
      score.governanceComplianceScore,
    collaborationScore: score.collaborationScore,
    outcomeContributionScore: score.outcomeContributionScore,
  };
}

function baselineDimensions(baseline: number): TrustDimensions {
  const value = clamp01(baseline);

  return {
    historicalAccuracy: value,
    calibrationScore: value,
    reliabilityScore: value,
    evidenceQualityScore: value,
    governanceComplianceScore: value,
    collaborationScore: value,
    outcomeContributionScore: value,
  };
}

function mapDimensions(
  mapper: (value: number) => number,
): (dimensions: TrustDimensions) => TrustDimensions {
  return (dimensions) => ({
    historicalAccuracy: mapper(dimensions.historicalAccuracy),
    calibrationScore: mapper(dimensions.calibrationScore),
    reliabilityScore: mapper(dimensions.reliabilityScore),
    evidenceQualityScore: mapper(dimensions.evidenceQualityScore),
    governanceComplianceScore: mapper(
      dimensions.governanceComplianceScore,
    ),
    collaborationScore: mapper(dimensions.collaborationScore),
    outcomeContributionScore: mapper(
      dimensions.outcomeContributionScore,
    ),
  });
}

function weightedMean(
  observations: readonly WeightedObservation[],
  selector: (value: WeightedObservation) => number,
  fallback: number,
): number {
  return weightedAverage(
    observations.map((value) => [
      clamp01(selector(value)),
      value.recencyWeight,
    ]),
    fallback,
  );
}

function weightedAverage(
  entries: readonly (readonly [number, number])[],
  fallback = DEFAULT_MODEL_BASELINE,
): number {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [value, weight] of entries) {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(weight) ||
      weight <= 0
    ) {
      continue;
    }

    weightedTotal += value * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedTotal / totalWeight : fallback;
}

function normalizedDispersion(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(
    values.map((value) => Math.pow(value - mean, 2)),
  );

  return clamp01(Math.sqrt(variance) / 0.5);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) /
    values.length;
}

function normalizeOptions(
  options: MultiAgentTrustEngineOptions,
): NormalizedTrustEngineOptions {
  const priorSampleSize =
    options.priorSampleSize ?? DEFAULT_PRIOR_SAMPLE_SIZE;
  const maximumSupportingObservations =
    options.maximumSupportingObservations ??
    DEFAULT_MAXIMUM_SUPPORTING_OBSERVATIONS;

  assertNonNegativeInteger(priorSampleSize, "priorSampleSize");
  assertNonNegativeInteger(
    maximumSupportingObservations,
    "maximumSupportingObservations",
  );

  if (maximumSupportingObservations === 0) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      "maximumSupportingObservations must be greater than zero.",
      { field: "maximumSupportingObservations" },
    );
  }

  return Object.freeze({
    clock: options.clock ?? SYSTEM_CLOCK,
    priorSampleSize,
    maximumSupportingObservations,
    rejectUnknownAgents: options.rejectUnknownAgents ?? true,
  });
}

function validatePolicy(policy: MultiAgentTrustPolicy): void {
  if (!isRecord(policy)) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      "policy must be an object.",
    );
  }

  assertBoolean(policy.enabled, "policy.enabled");

  const normalizedFields: readonly [
    keyof MultiAgentTrustPolicy,
    unknown,
  ][] = [
    ["initialTrust", policy.initialTrust],
    ["minimumVotingTrust", policy.minimumVotingTrust],
    ["accuracyWeight", policy.accuracyWeight],
    ["calibrationWeight", policy.calibrationWeight],
    ["reliabilityWeight", policy.reliabilityWeight],
    ["evidenceQualityWeight", policy.evidenceQualityWeight],
    [
      "governanceComplianceWeight",
      policy.governanceComplianceWeight,
    ],
    ["collaborationWeight", policy.collaborationWeight],
    [
      "outcomeContributionWeight",
      policy.outcomeContributionWeight,
    ],
    ["learningRate", policy.learningRate],
    ["decayRate", policy.decayRate],
    ["quarantineThreshold", policy.quarantineThreshold],
  ];

  for (const [field, value] of normalizedFields) {
    assertNormalizedNumber(value, `policy.${field}`);
  }

  const totalWeight =
    policy.accuracyWeight +
    policy.calibrationWeight +
    policy.reliabilityWeight +
    policy.evidenceQualityWeight +
    policy.governanceComplianceWeight +
    policy.collaborationWeight +
    policy.outcomeContributionWeight;

  if (totalWeight <= 0) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      "At least one trust dimension weight must be greater than zero.",
      { field: "policy weights" },
    );
  }

  if (policy.quarantineThreshold > policy.minimumVotingTrust) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      "policy.quarantineThreshold cannot exceed policy.minimumVotingTrust.",
      { field: "policy.quarantineThreshold" },
    );
  }
}

function validateRegistrations(
  registrations: readonly MultiAgentRegistration[],
): void {
  assertArray(registrations, "registrations");

  const seen = new Set<string>();

  registrations.forEach((registration, index) => {
    if (!isRecord(registration) || !isRecord(registration.identity)) {
      throw new MultiAgentTrustEngineError(
        "INVALID_REGISTRATION",
        `registrations[${index}] must contain an identity object.`,
        { index },
      );
    }

    assertNonEmptyString(
      registration.identity.agentId,
      `registrations[${index}].identity.agentId`,
    );

    if (seen.has(registration.identity.agentId)) {
      throw new MultiAgentTrustEngineError(
        "DUPLICATE_AGENT_ID",
        `Duplicate registration for agent "${registration.identity.agentId}".`,
        {
          agentId: registration.identity.agentId,
          index,
        },
      );
    }

    seen.add(registration.identity.agentId);

    assertBoolean(
      registration.deterministic,
      `registrations[${index}].deterministic`,
    );
    assertBoolean(
      registration.replaySafe,
      `registrations[${index}].replaySafe`,
    );
    assertArray(
      registration.capabilities,
      `registrations[${index}].capabilities`,
    );

    registration.capabilities.forEach((capability, capabilityIndex) => {
      if (!isRecord(capability)) {
        throw new MultiAgentTrustEngineError(
          "INVALID_REGISTRATION",
          `registrations[${index}].capabilities[${capabilityIndex}] must be an object.`,
          {
            agentId: registration.identity.agentId,
            index: capabilityIndex,
          },
        );
      }

      assertBoolean(
        capability.enabled,
        `registrations[${index}].capabilities[${capabilityIndex}].enabled`,
      );
      assertNormalizedNumber(
        capability.proficiency,
        `registrations[${index}].capabilities[${capabilityIndex}].proficiency`,
      );
      assertNormalizedNumber(
        capability.confidenceFloor,
        `registrations[${index}].capabilities[${capabilityIndex}].confidenceFloor`,
      );
    });
  });
}

function validatePreviousScores(
  scores: readonly MultiAgentTrustScore[],
): void {
  assertArray(scores, "previous");

  const seen = new Set<string>();

  scores.forEach((score, index) => {
    if (!isRecord(score)) {
      throw new MultiAgentTrustEngineError(
        "INVALID_PREVIOUS_TRUST_SCORE",
        `previous[${index}] must be an object.`,
        { index },
      );
    }

    assertNonEmptyString(score.agentId, `previous[${index}].agentId`);

    if (seen.has(score.agentId)) {
      throw new MultiAgentTrustEngineError(
        "DUPLICATE_AGENT_ID",
        `Duplicate previous trust score for agent "${score.agentId}".`,
        { agentId: score.agentId, index },
      );
    }

    seen.add(score.agentId);

    assertNormalizedNumber(
      score.overallTrust,
      `previous[${index}].overallTrust`,
    );
    assertNormalizedNumber(
      score.historicalAccuracy,
      `previous[${index}].historicalAccuracy`,
    );
    assertNormalizedNumber(
      score.calibrationScore,
      `previous[${index}].calibrationScore`,
    );
    assertNormalizedNumber(
      score.reliabilityScore,
      `previous[${index}].reliabilityScore`,
    );
    assertNormalizedNumber(
      score.evidenceQualityScore,
      `previous[${index}].evidenceQualityScore`,
    );
    assertNormalizedNumber(
      score.governanceComplianceScore,
      `previous[${index}].governanceComplianceScore`,
    );
    assertNormalizedNumber(
      score.collaborationScore,
      `previous[${index}].collaborationScore`,
    );
    assertNormalizedNumber(
      score.outcomeContributionScore,
      `previous[${index}].outcomeContributionScore`,
    );
    assertNonNegativeInteger(
      score.sampleSize,
      `previous[${index}].sampleSize`,
    );
    assertFiniteNumber(
      score.assessedAtMs,
      `previous[${index}].assessedAtMs`,
    );
  });
}

function validateObservations(
  observations: readonly MultiAgentCalibrationObservation[],
): void {
  assertArray(observations, "observations");

  const seenKeys = new Set<string>();

  observations.forEach((observation, index) => {
    if (!isRecord(observation)) {
      throw new MultiAgentTrustEngineError(
        "INVALID_CALIBRATION_OBSERVATION",
        `observations[${index}] must be an object.`,
        { index },
      );
    }

    assertNonEmptyString(
      observation.agentId,
      `observations[${index}].agentId`,
    );
    assertNonEmptyString(
      observation.runId,
      `observations[${index}].runId`,
    );
    assertNormalizedNumber(
      observation.predictedConfidence,
      `observations[${index}].predictedConfidence`,
    );
    assertNormalizedNumber(
      observation.realizedCorrectness,
      `observations[${index}].realizedCorrectness`,
    );
    assertFiniteNumber(
      observation.utilityContribution,
      `observations[${index}].utilityContribution`,
    );
    assertFiniteNumber(
      observation.riskContribution,
      `observations[${index}].riskContribution`,
    );
    assertFiniteNumber(
      observation.observedAtMs,
      `observations[${index}].observedAtMs`,
    );

    const key = [
      observation.agentId,
      observation.runId,
      String(observation.observedAtMs),
    ].join("\u0000");

    if (seenKeys.has(key)) {
      throw new MultiAgentTrustEngineError(
        "INVALID_CALIBRATION_OBSERVATION",
        `Duplicate calibration observation for agent "${observation.agentId}" and run "${observation.runId}".`,
        {
          agentId: observation.agentId,
          runId: observation.runId,
          index,
        },
      );
    }

    seenKeys.add(key);
  });
}

function cloneTrustScore(
  score: MultiAgentTrustScore,
): MultiAgentTrustScore {
  return {
    agentId: score.agentId,
    overallTrust: score.overallTrust,
    historicalAccuracy: score.historicalAccuracy,
    calibrationScore: score.calibrationScore,
    reliabilityScore: score.reliabilityScore,
    evidenceQualityScore: score.evidenceQualityScore,
    governanceComplianceScore:
      score.governanceComplianceScore,
    collaborationScore: score.collaborationScore,
    outcomeContributionScore: score.outcomeContributionScore,
    sampleSize: score.sampleSize,
    assessedAtMs: score.assessedAtMs,
  };
}

function cloneObservation(
  observation: MultiAgentCalibrationObservation,
): MultiAgentCalibrationObservation {
  return {
    agentId: observation.agentId,
    runId: observation.runId,
    predictedConfidence: observation.predictedConfidence,
    realizedCorrectness: observation.realizedCorrectness,
    utilityContribution: observation.utilityContribution,
    riskContribution: observation.riskContribution,
    observedAtMs: observation.observedAtMs,
  };
}

function compareRegistrations(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return left.identity.agentId.localeCompare(right.identity.agentId);
}

function compareTrustScores(
  left: MultiAgentTrustScore,
  right: MultiAgentTrustScore,
): number {
  return left.agentId.localeCompare(right.agentId);
}

function compareObservations(
  left: MultiAgentCalibrationObservation,
  right: MultiAgentCalibrationObservation,
): number {
  return (
    left.observedAtMs - right.observedAtMs ||
    left.runId.localeCompare(right.runId) ||
    left.agentId.localeCompare(right.agentId)
  );
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function formatScore(value: number): string {
  return clamp01(value).toFixed(4);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function assertArray(
  value: unknown,
  field: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MultiAgentTrustEngineError(
      "INVALID_CALIBRATION_OBSERVATION",
      `${field} must be an array.`,
      { field },
    );
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      `${field} must be a boolean.`,
      { field },
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MultiAgentTrustEngineError(
      "INVALID_CALIBRATION_OBSERVATION",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MultiAgentTrustEngineError(
      "INVALID_CALIBRATION_OBSERVATION",
      `${field} must be a finite number.`,
      { field },
    );
  }
}

function assertNormalizedNumber(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value < 0 || value > 1) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      `${field} must be between 0 and 1 inclusive.`,
      { field },
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new MultiAgentTrustEngineError(
      "INVALID_TRUST_POLICY",
      `${field} must be a non-negative integer.`,
      { field },
    );
  }
}

function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
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
    for (const [key, item] of value) {
      deepFreeze(key);
      deepFreeze(item);
    }

    return Object.freeze(value);
  }

  if (value instanceof Set) {
    for (const item of value) {
      deepFreeze(item);
    }

    return Object.freeze(value);
  }

  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function stableFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);

    first ^= code;
    first = Math.imul(first, 0x01000193);

    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
    second ^= second >>> 13;
  }

  return [
    (first >>> 0).toString(16).padStart(8, "0"),
    (second >>> 0).toString(16).padStart(8, "0"),
  ].join("");
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (Number.isNaN(value)) {
        return '"NaN"';
      }

      if (value === Number.POSITIVE_INFINITY) {
        return '"Infinity"';
      }

      if (value === Number.NEGATIVE_INFINITY) {
        return '"-Infinity"';
      }

      if (Object.is(value, -0)) {
        return "0";
      }

      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return '"undefined"';
    case "bigint":
      return JSON.stringify(`${value.toString()}n`);
    case "symbol":
      return JSON.stringify(String(value));
    case "function":
      return JSON.stringify(`[Function:${value.name || "anonymous"}]`);
    case "object":
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([key, item]) => [
        stableSerialize(key),
        stableSerialize(item),
      ] as const)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, item]) => `${key}:${item}`)
      .join(",")}}`;
  }

  if (value instanceof Set) {
    return `[${Array.from(value)
      .map(stableSerialize)
      .sort(compareStrings)
      .join(",")}]`;
  }

  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort(compareStrings);

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
    )
    .join(",")}}`;
}