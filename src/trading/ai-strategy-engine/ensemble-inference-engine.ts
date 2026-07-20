/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 6: Deterministic ensemble inference engine.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiEnsembleConfiguration,
  type AiEnsembleDecision,
  type AiEnsembleMember,
  type AiEnsembleVote,
  type AiInferenceRequest,
  type AiInferenceResponse,
  type AiModelReference,
  type AiStrategyDirection,
  type AiStrategyMetadata,
  type AiStrategySignalAction,
  type AiStrategyTimestamp,
  type MarketRegime,
} from "./ai-strategy-contracts";
import {
  type AiInferenceEngine,
} from "./ai-inference-engine";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export interface EnsembleInferenceEngineOptions {
  readonly maximumHistoryEntries?: number;
  readonly executeConcurrently?: boolean;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
}

export interface EnsembleInferenceRequest {
  readonly requestId: string;
  readonly correlationId: string;
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly requestedAt: AiStrategyTimestamp;
  readonly marketContext: AiInferenceRequest["marketContext"];
  readonly featureVector: AiInferenceRequest["featureVector"];
  readonly configuration: AiEnsembleConfiguration;
  readonly regime?: MarketRegime;
  readonly metadata?: AiStrategyMetadata;
}

export interface EnsembleInferenceResult {
  readonly requestId: string;
  readonly correlationId: string;
  readonly configuration: AiEnsembleConfiguration;
  readonly decision: AiEnsembleDecision;
  readonly responses: readonly AiInferenceResponse[];
  readonly startedAt: AiStrategyTimestamp;
  readonly completedAt: AiStrategyTimestamp;
  readonly latencyMs: number;
  readonly metadata: AiStrategyMetadata;
}

export interface EnsembleInferenceHistoryQuery {
  readonly ensembleId?: string;
  readonly correlationId?: string;
  readonly status?: AiEnsembleDecision["status"];
  readonly fromCompletedAt?: AiStrategyTimestamp;
  readonly toCompletedAt?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface EnsembleInferenceMetrics {
  readonly requestCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly tiedCount: number;
  readonly insufficientQuorumCount: number;
  readonly modelInvocationCount: number;
  readonly modelSuccessCount: number;
  readonly modelFailureCount: number;
  readonly averageLatencyMs: number;
  readonly maximumLatencyMs: number;
}

export interface EnsembleInferenceEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly history: readonly EnsembleInferenceResult[];
  readonly metrics: EnsembleInferenceMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface EnsembleInferenceEngine {
  execute(request: EnsembleInferenceRequest): Promise<EnsembleInferenceResult>;
  queryHistory(
    query?: EnsembleInferenceHistoryQuery,
  ): readonly EnsembleInferenceResult[];
  clearHistory(): void;
  snapshot(): EnsembleInferenceEngineSnapshot;
}

const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;
const SCORE_EPSILON = 1e-12;

interface ResolvedOptions {
  readonly maximumHistoryEntries: number;
  readonly executeConcurrently: boolean;
  readonly clock: () => AiStrategyTimestamp;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator: AiStrategyContractValidator;
}

interface VoteAggregate {
  readonly key: string;
  readonly action: AiStrategySignalAction;
  readonly direction: AiStrategyDirection;
  readonly votes: readonly AiEnsembleVote[];
  readonly acceptedVotes: readonly AiEnsembleVote[];
  readonly count: number;
  readonly weightedCount: number;
  readonly scoreTotal: number;
  readonly weightedScoreTotal: number;
  readonly confidenceTotal: number;
  readonly weightedConfidenceTotal: number;
  readonly totalWeight: number;
}

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const output: Record<
    string,
    string | number | boolean | null | readonly (
      | string
      | number
      | boolean
      | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(output);
}

function cloneModelReference(model: AiModelReference): AiModelReference {
  return Object.freeze({ ...model });
}

function cloneVote(vote: AiEnsembleVote): AiEnsembleVote {
  return Object.freeze({
    ...vote,
    model: cloneModelReference(vote.model),
    metadata: cloneMetadata(vote.metadata),
  });
}

function cloneDecision(decision: AiEnsembleDecision): AiEnsembleDecision {
  return Object.freeze({
    ...decision,
    votes: Object.freeze(decision.votes.map(cloneVote)),
    rationale: Object.freeze([...decision.rationale]),
    metadata: cloneMetadata(decision.metadata),
  });
}

function cloneConfiguration(
  configuration: AiEnsembleConfiguration,
): AiEnsembleConfiguration {
  return Object.freeze({
    ...configuration,
    members: Object.freeze(
      configuration.members.map((member) =>
        Object.freeze({
          ...member,
          model: Object.freeze({
            ...member.model,
            parameters: Object.freeze({ ...member.model.parameters }),
            metadata: cloneMetadata(member.model.metadata),
          }),
          allowedRegimes: Object.freeze([...member.allowedRegimes]),
          metadata: cloneMetadata(member.metadata),
        }),
      ),
    ),
    metadata: cloneMetadata(configuration.metadata),
  });
}

function cloneResult(result: EnsembleInferenceResult): EnsembleInferenceResult {
  return Object.freeze({
    ...result,
    configuration: cloneConfiguration(result.configuration),
    decision: cloneDecision(result.decision),
    responses: Object.freeze([...result.responses]),
    metadata: cloneMetadata(result.metadata),
  });
}

function compareResults(
  left: EnsembleInferenceResult,
  right: EnsembleInferenceResult,
): number {
  if (left.completedAt !== right.completedAt) {
    return left.completedAt - right.completedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

function voteKey(
  action: AiStrategySignalAction,
  direction: AiStrategyDirection,
): string {
  return `${action}::${direction}`;
}

function inferAction(
  label: string | undefined,
  direction: AiStrategyDirection,
  score: number,
): AiStrategySignalAction {
  const normalized = label?.trim().toUpperCase();

  switch (normalized) {
    case "BUY":
    case "LONG":
      return "BUY";
    case "SELL":
    case "SHORT":
      return "SELL";
    case "CLOSE_LONG":
      return "CLOSE_LONG";
    case "CLOSE_SHORT":
      return "CLOSE_SHORT";
    case "REDUCE_LONG":
      return "REDUCE_LONG";
    case "REDUCE_SHORT":
      return "REDUCE_SHORT";
    case "HOLD":
    case "FLAT":
    case "NEUTRAL":
      return "HOLD";
    default:
      if (direction === "LONG") {
        return "BUY";
      }
      if (direction === "SHORT") {
        return "SELL";
      }
      if (direction === "FLAT" || direction === "HOLD") {
        return "HOLD";
      }
      return score > 0 ? "BUY" : score < 0 ? "SELL" : "HOLD";
  }
}

function inferDirection(
  label: string | undefined,
  score: number,
): AiStrategyDirection {
  const normalized = label?.trim().toUpperCase();

  if (normalized === "BUY" || normalized === "LONG") {
    return "LONG";
  }
  if (normalized === "SELL" || normalized === "SHORT") {
    return "SHORT";
  }
  if (normalized === "FLAT") {
    return "FLAT";
  }
  if (normalized === "HOLD" || normalized === "NEUTRAL") {
    return "HOLD";
  }

  return score > 0 ? "LONG" : score < 0 ? "SHORT" : "HOLD";
}

export class DeterministicEnsembleInferenceEngine
  implements EnsembleInferenceEngine
{
  private readonly options: ResolvedOptions;
  private readonly history: EnsembleInferenceResult[] = [];
  private sequence = 0;
  private modelInvocationCount = 0;
  private modelSuccessCount = 0;
  private modelFailureCount = 0;

  public constructor(
    private readonly inferenceEngine: AiInferenceEngine,
    options: EnsembleInferenceEngineOptions = {},
  ) {
    const maximumHistoryEntries =
      options.maximumHistoryEntries ?? DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    assertPositiveInteger(maximumHistoryEntries, "maximumHistoryEntries");

    this.options = Object.freeze({
      maximumHistoryEntries,
      executeConcurrently: options.executeConcurrently ?? true,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
    });
  }

  public async execute(
    request: EnsembleInferenceRequest,
  ): Promise<EnsembleInferenceResult> {
    this.validateRequest(request);

    const startedAt = this.options.clock();
    const configuration = cloneConfiguration(request.configuration);
    const eligibleMembers = configuration.members.filter((member) =>
      this.isMemberEligible(member, request.regime),
    );

    const responses = this.options.executeConcurrently
      ? await Promise.all(
          eligibleMembers.map((member) =>
            this.executeMember(request, member),
          ),
        )
      : await this.executeMembersSequentially(request, eligibleMembers);

    const votes = eligibleMembers.map((member, index) =>
      this.createVote(member, responses[index]),
    );
    const decision = this.createDecision(
      request,
      configuration,
      votes,
      startedAt,
    );
    const completedAt = this.options.clock();

    const result = cloneResult({
      requestId: request.requestId,
      correlationId: request.correlationId,
      configuration,
      decision,
      responses: Object.freeze([...responses]),
      startedAt,
      completedAt,
      latencyMs: Math.max(0, completedAt - startedAt),
      metadata: cloneMetadata(request.metadata),
    });

    this.history.push(result);
    this.history.sort(compareResults);
    this.trimHistory();

    return result;
  }

  public queryHistory(
    query: EnsembleInferenceHistoryQuery = {},
  ): readonly EnsembleInferenceResult[] {
    const limit = query.limit ?? this.options.maximumHistoryEntries;

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("query.limit must be a positive integer.");
    }

    if (
      query.fromCompletedAt !== undefined &&
      query.toCompletedAt !== undefined &&
      query.fromCompletedAt > query.toCompletedAt
    ) {
      throw new RangeError(
        "query.fromCompletedAt cannot exceed query.toCompletedAt.",
      );
    }

    return Object.freeze(
      this.history
        .filter((result) => {
          if (
            query.ensembleId !== undefined &&
            result.configuration.ensembleId !== query.ensembleId
          ) {
            return false;
          }
          if (
            query.correlationId !== undefined &&
            result.correlationId !== query.correlationId
          ) {
            return false;
          }
          if (
            query.status !== undefined &&
            result.decision.status !== query.status
          ) {
            return false;
          }
          if (
            query.fromCompletedAt !== undefined &&
            result.completedAt < query.fromCompletedAt
          ) {
            return false;
          }
          if (
            query.toCompletedAt !== undefined &&
            result.completedAt > query.toCompletedAt
          ) {
            return false;
          }
          return true;
        })
        .sort(compareResults)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public snapshot(): EnsembleInferenceEngineSnapshot {
    const metrics = this.calculateMetrics();

    return Object.freeze({
      capturedAt: this.options.clock(),
      history: Object.freeze([...this.history]),
      metrics,
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private validateRequest(request: EnsembleInferenceRequest): void {
    if (
      typeof request.requestId !== "string" ||
      request.requestId.trim().length === 0
    ) {
      throw new TypeError("request.requestId must be a non-empty string.");
    }
    if (
      typeof request.correlationId !== "string" ||
      request.correlationId.trim().length === 0
    ) {
      throw new TypeError(
        "request.correlationId must be a non-empty string.",
      );
    }
    assertFiniteNonNegative(request.requestedAt, "request.requestedAt");

    const ensembleValidation =
      this.options.validator.validateEnsembleConfiguration(
        request.configuration,
      );
    this.options.validator.assertValid(
      ensembleValidation,
      "Ensemble configuration validation failed.",
    );

    const marketValidation =
      this.options.validator.validateMarketContext(
        request.marketContext,
      );
    this.options.validator.assertValid(
      marketValidation,
      "Ensemble market context validation failed.",
    );

    const featureValidation =
      this.options.validator.validateFeatureVector(
        request.featureVector,
      );
    this.options.validator.assertValid(
      featureValidation,
      "Ensemble feature vector validation failed.",
    );
  }

  private isMemberEligible(
    member: AiEnsembleMember,
    regime: MarketRegime | undefined,
  ): boolean {
    if (!member.enabled) {
      return false;
    }

    if (
      regime !== undefined &&
      member.allowedRegimes.length > 0 &&
      !member.allowedRegimes.includes(regime)
    ) {
      return false;
    }

    return true;
  }

  private async executeMembersSequentially(
    request: EnsembleInferenceRequest,
    members: readonly AiEnsembleMember[],
  ): Promise<readonly AiInferenceResponse[]> {
    const responses: AiInferenceResponse[] = [];
    for (const member of members) {
      responses.push(await this.executeMember(request, member));
    }
    return Object.freeze(responses);
  }

  private async executeMember(
    request: EnsembleInferenceRequest,
    member: AiEnsembleMember,
  ): Promise<AiInferenceResponse> {
    this.modelInvocationCount += 1;

    const inferenceRequest: AiInferenceRequest = Object.freeze({
      requestId: `${request.requestId}:${member.memberId}`,
      correlationId: request.correlationId,
      strategyId: request.strategyId,
      strategyInstanceId: request.strategyInstanceId,
      requestedAt: request.requestedAt,
      marketContext: request.marketContext,
      featureVector: request.featureVector,
      model: member.model,
      purpose: "SIGNAL_GENERATION",
      metadata: cloneMetadata({
        ...request.metadata,
        ensembleId: request.configuration.ensembleId,
        ensembleMemberId: member.memberId,
      }),
    });

    try {
      const response = await this.inferenceEngine.infer(inferenceRequest);
      if (response.status === "SUCCEEDED") {
        this.modelSuccessCount += 1;
      } else {
        this.modelFailureCount += 1;
      }
      return response;
    } catch (error) {
      this.modelFailureCount += 1;
      throw error;
    }
  }

  private createVote(
    member: AiEnsembleMember,
    response: AiInferenceResponse | undefined,
  ): AiEnsembleVote {
    const prediction = response?.prediction;
    const rawScore =
      prediction?.score ??
      prediction?.value ??
      (prediction?.probability !== undefined
        ? prediction.probability * 2 - 1
        : 0);
    const score = clamp(rawScore, -1, 1);
    const direction =
      prediction?.direction ??
      inferDirection(prediction?.label, score);
    const action = inferAction(prediction?.label, direction, score);
    const confidence = clamp(
      response?.confidence ??
        prediction?.probability ??
        Math.abs(score),
    );
    const accepted =
      response?.status === "SUCCEEDED" &&
      prediction !== undefined &&
      confidence >=
        (member.minimumConfidence ??
          member.model.minimumConfidence);

    return cloneVote({
      memberId: member.memberId,
      model: {
        providerId: member.model.providerId,
        modelId: member.model.modelId,
        modelVersion: member.model.modelVersion ?? "unspecified",
      },
      action,
      direction,
      score,
      confidence,
      weight: member.weight,
      accepted,
      reason: accepted
        ? undefined
        : response === undefined
          ? "No inference response was produced."
          : response.status !== "SUCCEEDED"
            ? `Inference status was ${response.status}.`
            : prediction === undefined
              ? "Inference response did not contain a prediction."
              : "Prediction confidence was below the member threshold.",
      metadata: EMPTY_AI_STRATEGY_METADATA,
    });
  }

  private createDecision(
    request: EnsembleInferenceRequest,
    configuration: AiEnsembleConfiguration,
    votes: readonly AiEnsembleVote[],
    decidedAt: AiStrategyTimestamp,
  ): AiEnsembleDecision {
    const acceptedVotes = votes.filter((vote) => vote.accepted);
    const rationale: string[] = [
      `${acceptedVotes.length} of ${votes.length} eligible members produced accepted votes.`,
    ];

    if (acceptedVotes.length < configuration.quorum) {
      rationale.push(
        `Required quorum ${configuration.quorum} was not reached.`,
      );
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "INSUFFICIENT_QUORUM",
        "HOLD",
        "HOLD",
        0,
        0,
        votes.length === 0 ? 0 : acceptedVotes.length / votes.length,
        rationale,
      );
    }

    const aggregates = this.aggregateVotes(acceptedVotes);
    const ranked = [...aggregates].sort((left, right) => {
      const leftMetric = this.rankingMetric(
        left,
        configuration.votingMethod,
      );
      const rightMetric = this.rankingMetric(
        right,
        configuration.votingMethod,
      );
      if (leftMetric !== rightMetric) {
        return rightMetric - leftMetric;
      }
      return left.key.localeCompare(right.key);
    });

    const winner = ranked[0];
    const runnerUp = ranked[1];

    if (winner === undefined) {
      rationale.push("No accepted vote group was available.");
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "REJECTED",
        "HOLD",
        "HOLD",
        0,
        0,
        0,
        rationale,
      );
    }

    const winnerMetric = this.rankingMetric(
      winner,
      configuration.votingMethod,
    );
    const runnerUpMetric =
      runnerUp === undefined
        ? Number.NEGATIVE_INFINITY
        : this.rankingMetric(
            runnerUp,
            configuration.votingMethod,
          );
    const tied =
      runnerUp !== undefined &&
      Math.abs(winnerMetric - runnerUpMetric) <= SCORE_EPSILON;

    if (tied && configuration.rejectOnTie) {
      rationale.push("The leading vote groups were tied.");
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "TIED",
        "HOLD",
        "HOLD",
        0,
        0,
        0,
        rationale,
      );
    }

    if (
      configuration.votingMethod === "UNANIMOUS" &&
      winner.count !== acceptedVotes.length
    ) {
      rationale.push("Unanimous voting was required but not achieved.");
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "REJECTED",
        "HOLD",
        "HOLD",
        0,
        0,
        winner.count / acceptedVotes.length,
        rationale,
      );
    }

    const totalAcceptedWeight = acceptedVotes.reduce(
      (sum, vote) => sum + vote.weight,
      0,
    );
    const agreement =
      configuration.votingMethod === "WEIGHTED_MAJORITY" ||
      configuration.votingMethod === "WEIGHTED_SCORE"
        ? totalAcceptedWeight <= SCORE_EPSILON
          ? 0
          : winner.totalWeight / totalAcceptedWeight
        : winner.count / acceptedVotes.length;
    const score =
      configuration.votingMethod === "WEIGHTED_SCORE" ||
      configuration.votingMethod === "WEIGHTED_MAJORITY"
        ? winner.totalWeight <= SCORE_EPSILON
          ? 0
          : winner.weightedScoreTotal / winner.totalWeight
        : winner.scoreTotal / winner.count;
    const confidence =
      configuration.votingMethod === "WEIGHTED_SCORE" ||
      configuration.votingMethod === "WEIGHTED_MAJORITY"
        ? winner.totalWeight <= SCORE_EPSILON
          ? 0
          : winner.weightedConfidenceTotal / winner.totalWeight
        : winner.confidenceTotal / winner.count;

    if (agreement < configuration.minimumAgreement) {
      rationale.push(
        `Agreement ${agreement.toFixed(6)} was below minimum ${configuration.minimumAgreement.toFixed(6)}.`,
      );
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "REJECTED",
        "HOLD",
        "HOLD",
        score,
        confidence,
        agreement,
        rationale,
      );
    }

    if (confidence < configuration.minimumConfidence) {
      rationale.push(
        `Confidence ${confidence.toFixed(6)} was below minimum ${configuration.minimumConfidence.toFixed(6)}.`,
      );
      return this.buildDecision(
        request,
        configuration,
        votes,
        decidedAt,
        "REJECTED",
        "HOLD",
        "HOLD",
        score,
        confidence,
        agreement,
        rationale,
      );
    }

    rationale.push(
      `Winning action ${winner.action}/${winner.direction} achieved agreement ${agreement.toFixed(6)} and confidence ${confidence.toFixed(6)}.`,
    );

    return this.buildDecision(
      request,
      configuration,
      votes,
      decidedAt,
      "ACCEPTED",
      winner.action,
      winner.direction,
      score,
      confidence,
      agreement,
      rationale,
    );
  }

  private aggregateVotes(
    votes: readonly AiEnsembleVote[],
  ): readonly VoteAggregate[] {
    const grouped = new Map<string, AiEnsembleVote[]>();

    for (const vote of votes) {
      const key = voteKey(vote.action, vote.direction);
      const current = grouped.get(key) ?? [];
      current.push(vote);
      grouped.set(key, current);
    }

    return Object.freeze(
      [...grouped.entries()].map(([key, group]) => {
        const first = group[0]!;
        const totalWeight = group.reduce(
          (sum, vote) => sum + vote.weight,
          0,
        );

        return Object.freeze({
          key,
          action: first.action,
          direction: first.direction,
          votes: Object.freeze([...group]),
          acceptedVotes: Object.freeze([...group]),
          count: group.length,
          weightedCount: totalWeight,
          scoreTotal: group.reduce(
            (sum, vote) => sum + vote.score,
            0,
          ),
          weightedScoreTotal: group.reduce(
            (sum, vote) => sum + vote.score * vote.weight,
            0,
          ),
          confidenceTotal: group.reduce(
            (sum, vote) => sum + vote.confidence,
            0,
          ),
          weightedConfidenceTotal: group.reduce(
            (sum, vote) =>
              sum + vote.confidence * vote.weight,
            0,
          ),
          totalWeight,
        });
      }),
    );
  }

  private rankingMetric(
    aggregate: VoteAggregate,
    method: AiEnsembleConfiguration["votingMethod"],
  ): number {
    switch (method) {
      case "WEIGHTED_MAJORITY":
        return aggregate.weightedCount;
      case "AVERAGE_SCORE":
        return aggregate.scoreTotal / aggregate.count;
      case "WEIGHTED_SCORE":
      case "STACKING":
        return aggregate.totalWeight <= SCORE_EPSILON
          ? 0
          : aggregate.weightedScoreTotal /
              aggregate.totalWeight;
      case "UNANIMOUS":
      case "MAJORITY":
      case "CUSTOM":
      default:
        return aggregate.count;
    }
  }

  private buildDecision(
    request: EnsembleInferenceRequest,
    configuration: AiEnsembleConfiguration,
    votes: readonly AiEnsembleVote[],
    decidedAt: AiStrategyTimestamp,
    status: AiEnsembleDecision["status"],
    action: AiStrategySignalAction,
    direction: AiStrategyDirection,
    score: number,
    confidence: number,
    agreement: number,
    rationale: readonly string[],
  ): AiEnsembleDecision {
    return cloneDecision({
      decisionId: this.nextId("ensemble-decision", decidedAt),
      ensembleId: configuration.ensembleId,
      correlationId: request.correlationId,
      decidedAt,
      status,
      action,
      direction,
      score: clamp(score, -1, 1),
      confidence: clamp(confidence),
      agreement: clamp(agreement),
      votes: Object.freeze(votes.map(cloneVote)),
      rationale: Object.freeze([...rationale]),
      metadata: cloneMetadata(request.metadata),
    });
  }

  private calculateMetrics(): EnsembleInferenceMetrics {
    const acceptedCount = this.history.filter(
      (entry) => entry.decision.status === "ACCEPTED",
    ).length;
    const rejectedCount = this.history.filter(
      (entry) => entry.decision.status === "REJECTED",
    ).length;
    const tiedCount = this.history.filter(
      (entry) => entry.decision.status === "TIED",
    ).length;
    const insufficientQuorumCount = this.history.filter(
      (entry) =>
        entry.decision.status === "INSUFFICIENT_QUORUM",
    ).length;
    const totalLatency = this.history.reduce(
      (sum, entry) => sum + entry.latencyMs,
      0,
    );
    const maximumLatencyMs = this.history.reduce(
      (maximum, entry) => Math.max(maximum, entry.latencyMs),
      0,
    );

    return Object.freeze({
      requestCount: this.history.length,
      acceptedCount,
      rejectedCount,
      tiedCount,
      insufficientQuorumCount,
      modelInvocationCount: this.modelInvocationCount,
      modelSuccessCount: this.modelSuccessCount,
      modelFailureCount: this.modelFailureCount,
      averageLatencyMs:
        this.history.length === 0
          ? 0
          : totalLatency / this.history.length,
      maximumLatencyMs,
    });
  }

  private trimHistory(): void {
    while (
      this.history.length > this.options.maximumHistoryEntries
    ) {
      this.history.shift();
    }
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(
      prefix,
      timestamp,
      this.sequence,
    );
  }
}

export function createDeterministicEnsembleInferenceEngine(
  inferenceEngine: AiInferenceEngine,
  options: EnsembleInferenceEngineOptions = {},
): DeterministicEnsembleInferenceEngine {
  return new DeterministicEnsembleInferenceEngine(
    inferenceEngine,
    options,
  );
}