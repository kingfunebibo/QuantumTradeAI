import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";
import type {
  CoordinatorExchangeCandidateBuildOptions,
  CoordinatorExchangeCandidateBuildResult,
  CoordinatorExchangeCandidateBuilder,
  CoordinatorExchangeCandidateRejection,
} from "./exchange-candidate-builder";
import type {
  CoordinatorExchangeCandidateRanker,
  CoordinatorRankedExchangeCandidate,
} from "./exchange-candidate-ranker";

export type CoordinatorExchangeSelectionStatus =
  | "SELECTED"
  | "NO_COMPATIBLE_EXCHANGE"
  | "SELECTION_LIMIT_REACHED";

export interface CoordinatorExchangeSelectionOptions
  extends CoordinatorExchangeCandidateBuildOptions {
  readonly maximumSelectedExchanges?: number;
  readonly minimumRequiredExchanges?: number;
}

export interface CoordinatorSelectedExchange {
  readonly selectionIndex: number;
  readonly exchangeId: CoordinatorExchangeId;
  readonly candidate: CoordinatorExchangeCandidate;
  readonly ranking: CoordinatorRankedExchangeCandidate;
}

export interface CoordinatorExchangeSelectionResult {
  readonly status: CoordinatorExchangeSelectionStatus;
  readonly requestId: string;
  readonly selected: readonly CoordinatorSelectedExchange[];
  readonly rankedCandidates:
    readonly CoordinatorRankedExchangeCandidate[];
  readonly rejections:
    readonly CoordinatorExchangeCandidateRejection[];
  readonly reason: string | null;
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive integer.`,
    );
  }
}

export class CoordinatorExchangeSelectionPolicy {
  public constructor(
    private readonly candidateBuilder:
      CoordinatorExchangeCandidateBuilder,
    private readonly candidateRanker:
      CoordinatorExchangeCandidateRanker,
  ) {}

  public select(
    request: MultiExchangeCoordinatorOrderRequest,
    options: CoordinatorExchangeSelectionOptions = {},
  ): CoordinatorExchangeSelectionResult {
    const maximumSelectedExchanges =
      options.maximumSelectedExchanges ?? 1;

    const minimumRequiredExchanges =
      options.minimumRequiredExchanges ?? 1;

    assertPositiveInteger(
      maximumSelectedExchanges,
      "maximumSelectedExchanges",
    );

    assertPositiveInteger(
      minimumRequiredExchanges,
      "minimumRequiredExchanges",
    );

    if (
      minimumRequiredExchanges >
      maximumSelectedExchanges
    ) {
      throw new Error(
        "minimumRequiredExchanges cannot exceed maximumSelectedExchanges.",
      );
    }

    const buildResult =
      this.buildCandidates(request, options);

    const rankedCandidates =
      this.candidateRanker.rank(
        buildResult.candidates,
      );

    if (rankedCandidates.length === 0) {
      return Object.freeze({
        status: "NO_COMPATIBLE_EXCHANGE",
        requestId: request.requestId,
        selected: Object.freeze([]),
        rankedCandidates,
        rejections: buildResult.rejections,
        reason:
          "No compatible exchange candidates were available.",
      });
    }

    const selectedRankings =
      rankedCandidates.slice(
        0,
        maximumSelectedExchanges,
      );

    const selected = Object.freeze(
      selectedRankings.map(
        (ranking, index) =>
          Object.freeze({
            selectionIndex: index,
            exchangeId:
              ranking.candidate.exchangeId,
            candidate: ranking.candidate,
            ranking,
          }),
      ),
    );

    if (
      selected.length <
      minimumRequiredExchanges
    ) {
      return Object.freeze({
        status: "SELECTION_LIMIT_REACHED",
        requestId: request.requestId,
        selected,
        rankedCandidates,
        rejections: buildResult.rejections,
        reason:
          `Only ${selected.length} compatible exchange candidate(s) ` +
          `were available, but ${minimumRequiredExchanges} were required.`,
      });
    }

    return Object.freeze({
      status: "SELECTED",
      requestId: request.requestId,
      selected,
      rankedCandidates,
      rejections: buildResult.rejections,
      reason: null,
    });
  }

  public selectPrimary(
    request: MultiExchangeCoordinatorOrderRequest,
    options:
      CoordinatorExchangeCandidateBuildOptions = {},
  ): CoordinatorSelectedExchange | null {
    const result = this.select(request, {
      ...options,
      maximumSelectedExchanges: 1,
      minimumRequiredExchanges: 1,
    });

    return result.selected[0] ?? null;
  }

  private buildCandidates(
    request: MultiExchangeCoordinatorOrderRequest,
    options: CoordinatorExchangeSelectionOptions,
  ): CoordinatorExchangeCandidateBuildResult {
    return this.candidateBuilder.build(
      request,
      {
        allowedExchangeIds:
          options.allowedExchangeIds,
        excludedExchangeIds:
          options.excludedExchangeIds,
        requireHealthyExchange:
          options.requireHealthyExchange,
        requireAvailableExchange:
          options.requireAvailableExchange,
        requireClientOrderIdSupport:
          options.requireClientOrderIdSupport,
        requireOrderReplacementSupport:
          options.requireOrderReplacementSupport,
        additionalRequiredCapabilities:
          options.additionalRequiredCapabilities,
      },
    );
  }
}

export function createCoordinatorExchangeSelectionPolicy(
  candidateBuilder:
    CoordinatorExchangeCandidateBuilder,
  candidateRanker:
    CoordinatorExchangeCandidateRanker,
): CoordinatorExchangeSelectionPolicy {
  return new CoordinatorExchangeSelectionPolicy(
    candidateBuilder,
    candidateRanker,
  );
}