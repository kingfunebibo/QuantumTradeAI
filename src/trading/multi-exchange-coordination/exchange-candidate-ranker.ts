import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
} from "./coordinator-contracts";

export interface CoordinatorExchangeCandidateScoreBreakdown {
  readonly exchangeId: CoordinatorExchangeId;
  readonly healthScore: number;
  readonly availabilityScore: number;
  readonly priorityScore: number;
  readonly weightScore: number;
  readonly preferenceScore: number;
  readonly latencyScore: number;
  readonly totalScore: number;
}

export interface CoordinatorRankedExchangeCandidate {
  readonly rank: number;
  readonly candidate: CoordinatorExchangeCandidate;
  readonly score: CoordinatorExchangeCandidateScoreBreakdown;
}

export interface CoordinatorExchangeCandidateRankingOptions {
  readonly healthyScore?: number;
  readonly degradedScore?: number;
  readonly unhealthyScore?: number;
  readonly availableScore?: number;
  readonly unavailableScore?: number;
  readonly preferredScore?: number;
  readonly maximumPriorityScore?: number;
  readonly maximumWeightScore?: number;
  readonly maximumLatencyScore?: number;
  readonly latencyPenaltyDivisor?: number;
}

const DEFAULT_OPTIONS: Required<
  CoordinatorExchangeCandidateRankingOptions
> = Object.freeze({
  healthyScore: 1_000,
  degradedScore: 500,
  unhealthyScore: 0,
  availableScore: 500,
  unavailableScore: 0,
  preferredScore: 250,
  maximumPriorityScore: 1_000,
  maximumWeightScore: 1_000,
  maximumLatencyScore: 500,
  latencyPenaltyDivisor: 10,
});

function normalizeOptions(
  options: CoordinatorExchangeCandidateRankingOptions,
): Required<CoordinatorExchangeCandidateRankingOptions> {
  return Object.freeze({
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

function calculateHealthScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  switch (candidate.health.status) {
    case "HEALTHY":
      return options.healthyScore;

    case "DEGRADED":
      return options.degradedScore;

    case "UNHEALTHY":
      return options.unhealthyScore;

    default:
      return options.unhealthyScore;
  }
}

function calculateAvailabilityScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  return candidate.health.availability === "AVAILABLE"
    ? options.availableScore
    : options.unavailableScore;
}

function calculatePriorityScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  const normalizedPriority = Math.max(
    0,
    options.maximumPriorityScore - candidate.priority,
  );

  return Math.min(
    options.maximumPriorityScore,
    normalizedPriority,
  );
}

function calculateWeightScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  return Math.min(
    options.maximumWeightScore,
    Math.max(0, candidate.weight),
  );
}

function calculatePreferenceScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  return candidate.preferred
    ? options.preferredScore
    : 0;
}

function calculateLatencyScore(
  candidate: CoordinatorExchangeCandidate,
  options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >,
): number {
  const latency =
    candidate.health.latencyMilliseconds;

  if (latency === null) {
    return 0;
  }

  const penalty =
    latency / options.latencyPenaltyDivisor;

  return Math.max(
    0,
    options.maximumLatencyScore - penalty,
  );
}

export class CoordinatorExchangeCandidateRanker {
  private readonly options: Required<
    CoordinatorExchangeCandidateRankingOptions
  >;

  public constructor(
    options:
      CoordinatorExchangeCandidateRankingOptions = {},
  ) {
    this.options = normalizeOptions(options);

    assertFiniteNonNegative(
      this.options.healthyScore,
      "healthyScore",
    );

    assertFiniteNonNegative(
      this.options.degradedScore,
      "degradedScore",
    );

    assertFiniteNonNegative(
      this.options.unhealthyScore,
      "unhealthyScore",
    );

    assertFiniteNonNegative(
      this.options.availableScore,
      "availableScore",
    );

    assertFiniteNonNegative(
      this.options.unavailableScore,
      "unavailableScore",
    );

    assertFiniteNonNegative(
      this.options.preferredScore,
      "preferredScore",
    );

    assertFiniteNonNegative(
      this.options.maximumPriorityScore,
      "maximumPriorityScore",
    );

    assertFiniteNonNegative(
      this.options.maximumWeightScore,
      "maximumWeightScore",
    );

    assertFiniteNonNegative(
      this.options.maximumLatencyScore,
      "maximumLatencyScore",
    );

    if (
      !Number.isFinite(
        this.options.latencyPenaltyDivisor,
      ) ||
      this.options.latencyPenaltyDivisor <= 0
    ) {
      throw new Error(
        "latencyPenaltyDivisor must be a finite positive number.",
      );
    }
  }

  public score(
    candidate: CoordinatorExchangeCandidate,
  ): CoordinatorExchangeCandidateScoreBreakdown {
    const healthScore = calculateHealthScore(
      candidate,
      this.options,
    );

    const availabilityScore =
      calculateAvailabilityScore(
        candidate,
        this.options,
      );

    const priorityScore = calculatePriorityScore(
      candidate,
      this.options,
    );

    const weightScore = calculateWeightScore(
      candidate,
      this.options,
    );

    const preferenceScore =
      calculatePreferenceScore(
        candidate,
        this.options,
      );

    const latencyScore = calculateLatencyScore(
      candidate,
      this.options,
    );

    return Object.freeze({
      exchangeId: candidate.exchangeId,
      healthScore,
      availabilityScore,
      priorityScore,
      weightScore,
      preferenceScore,
      latencyScore,
      totalScore:
        healthScore +
        availabilityScore +
        priorityScore +
        weightScore +
        preferenceScore +
        latencyScore,
    });
  }

  public rank(
    candidates:
      readonly CoordinatorExchangeCandidate[],
  ): readonly CoordinatorRankedExchangeCandidate[] {
    const scoredCandidates = candidates.map(
      (candidate) =>
        Object.freeze({
          candidate,
          score: this.score(candidate),
        }),
    );

    scoredCandidates.sort((left, right) => {
      const scoreDifference =
        right.score.totalScore -
        left.score.totalScore;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const priorityDifference =
        left.candidate.priority -
        right.candidate.priority;

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const weightDifference =
        right.candidate.weight -
        left.candidate.weight;

      if (weightDifference !== 0) {
        return weightDifference;
      }

      return left.candidate.exchangeId.localeCompare(
        right.candidate.exchangeId,
      );
    });

    return Object.freeze(
      scoredCandidates.map(
        ({ candidate, score }, index) =>
          Object.freeze({
            rank: index + 1,
            candidate,
            score,
          }),
      ),
    );
  }
}

export function createCoordinatorExchangeCandidateRanker(
  options:
    CoordinatorExchangeCandidateRankingOptions = {},
): CoordinatorExchangeCandidateRanker {
  return new CoordinatorExchangeCandidateRanker(
    options,
  );
}