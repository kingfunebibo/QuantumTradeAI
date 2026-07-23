/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/swarm-mission-planner.ts
 *
 * Deterministic, immutable mission planning from a swarm run request,
 * context snapshot, and topology snapshot.
 */

import {
  type AiTradingSwarmRunRequest,
  type TradingSwarmContext,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmIdGenerator,
  type TradingSwarmMetadata,
  type TradingSwarmMission,
  type TradingSwarmMissionConstraints,
  type TradingSwarmMissionObjective,
  type TradingSwarmMissionPlannerPort,
  type TradingSwarmPartition,
  type TradingSwarmPartitionId,
  type TradingSwarmPriority,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
} from "./ai-trading-swarm-contracts";

export type SwarmMissionPlannerErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "INVALID_TOPOLOGY"
  | "STALE_CONTEXT"
  | "SWARM_MISMATCH"
  | "PARTITION_REQUIREMENT_UNSATISFIED"
  | "MISSION_DURATION_INVALID"
  | "MISSION_PLANNING_FAILED";

export interface SwarmMissionPlannerErrorDetails {
  readonly requestId?: string;
  readonly swarmId?: string;
  readonly field?: string;
  readonly requiredPartitionIds?: readonly string[];
  readonly missingPartitionIds?: readonly string[];
  readonly contextAgeMs?: number;
  readonly maximumContextAgeMs?: number;
  readonly cause?: unknown;
}

export class SwarmMissionPlannerError extends Error {
  public readonly code: SwarmMissionPlannerErrorCode;
  public readonly details: SwarmMissionPlannerErrorDetails;

  public constructor(
    code: SwarmMissionPlannerErrorCode,
    message: string,
    details: SwarmMissionPlannerErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "SwarmMissionPlannerError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface SwarmMissionPlannerOptions {
  readonly idGenerator?: TradingSwarmIdGenerator;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly defaultRequestedBy?: string;
  readonly includeAllEligiblePartitions?: boolean;
  readonly rejectStaleContext?: boolean;
  readonly rejectBlockingRisk?: boolean;
  readonly minimumMissionDurationMs?: number;
  readonly defaultPriority?: TradingSwarmPriority;
}

interface NormalizedOptions {
  readonly idGenerator: TradingSwarmIdGenerator;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly defaultRequestedBy: string;
  readonly includeAllEligiblePartitions: boolean;
  readonly rejectStaleContext: boolean;
  readonly rejectBlockingRisk: boolean;
  readonly minimumMissionDurationMs: number;
  readonly defaultPriority: TradingSwarmPriority;
}

export class SwarmMissionPlanner implements TradingSwarmMissionPlannerPort {
  private readonly options: NormalizedOptions;

  public constructor(options: SwarmMissionPlannerOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public plan(
    request: AiTradingSwarmRunRequest,
    context: TradingSwarmContext,
    topology: TradingSwarmTopologySnapshot,
  ): TradingSwarmMission {
    try {
      this.validateInputs(request, context, topology);

      const constraints = normalizeConstraints(
        request.constraints,
        request.requiredNodeRoles,
        request.requiredCapabilities,
        request.configuration.maximumMissionDurationMs,
      );

      const partitionIds = selectPartitionIds(
        request,
        topology.partitions,
        constraints.requiredPartitionIds ?? [],
        this.options.includeAllEligiblePartitions,
      );

      const requestedBy = resolveRequestedBy(
        request.metadata,
        this.options.defaultRequestedBy,
      );

      const missionDurationMs = resolveMissionDurationMs(
        constraints.maximumMissionDurationMs,
        request.configuration.maximumMissionDurationMs,
        this.options.minimumMissionDurationMs,
      );

      const createdAtMs = request.requestedAtMs;
      const deadlineAtMs = addTimestamp(createdAtMs, missionDurationMs);
      const priority = derivePriority(
        request.objective,
        context,
        this.options.defaultPriority,
      );

      const runId = this.options.idGenerator.generate(
        "swarm-run",
        stableStringify({
          requestId: request.requestId,
          swarmId: request.swarmId,
          requestedAtMs: request.requestedAtMs,
          objective: request.objective,
          contextFingerprint: context.deterministicFingerprint,
          topologyFingerprint: topology.deterministicFingerprint,
        }),
      );

      const missionId = this.options.idGenerator.generate(
        "swarm-mission",
        stableStringify({
          runId,
          requestId: request.requestId,
          swarmId: request.swarmId,
          objective: request.objective,
          partitionIds,
        }),
      );

      const metadata = buildMissionMetadata(
        request,
        context,
        topology,
        missionDurationMs,
      );

      const missionBase = {
        missionId,
        swarmId: request.swarmId,
        runId,
        objective: request.objective,
        status: "PLANNING",
        priority,
        requestedBy,
        ...(request.portfolioId === undefined
          ? {}
          : { portfolioId: request.portfolioId }),
        marketIds: uniqueSorted(request.marketIds ?? []),
        strategyIds: uniqueSorted(request.strategyIds ?? []),
        partitionIds,
        constraints,
        context,
        createdAtMs,
        deadlineAtMs,
        metadata,
      } satisfies Omit<TradingSwarmMission, "deterministicFingerprint">;

      return deepFreeze({
        ...missionBase,
        deterministicFingerprint:
          this.options.fingerprintGenerator.fingerprint(missionBase),
      });
    } catch (error) {
      if (error instanceof SwarmMissionPlannerError) {
        throw error;
      }

      throw new SwarmMissionPlannerError(
        "MISSION_PLANNING_FAILED",
        "Failed to create a deterministic swarm mission.",
        {
          requestId: request?.requestId,
          swarmId: request?.swarmId,
          cause: error,
        },
      );
    }
  }

  private validateInputs(
    request: AiTradingSwarmRunRequest,
    context: TradingSwarmContext,
    topology: TradingSwarmTopologySnapshot,
  ): void {
    if (request === undefined || request === null) {
      throw new SwarmMissionPlannerError(
        "INVALID_REQUEST",
        "A swarm run request is required.",
      );
    }

    assertNonEmptyText(request.requestId, "request.requestId");
    assertNonEmptyText(request.swarmId, "request.swarmId");
    assertTimestamp(request.requestedAtMs, "request.requestedAtMs");

    if (context === undefined || context === null) {
      throw new SwarmMissionPlannerError(
        "INVALID_CONTEXT",
        "A swarm context is required.",
        { requestId: request.requestId },
      );
    }

    if (topology === undefined || topology === null) {
      throw new SwarmMissionPlannerError(
        "INVALID_TOPOLOGY",
        "A topology snapshot is required.",
        { requestId: request.requestId },
      );
    }

    if (
      request.swarmId !== topology.swarmId ||
      request.swarmId !== context.topology.swarmId
    ) {
      throw new SwarmMissionPlannerError(
        "SWARM_MISMATCH",
        "Request, context, and topology must belong to the same swarm.",
        {
          requestId: request.requestId,
          swarmId: request.swarmId,
        },
      );
    }

    if (
      request.context.deterministicFingerprint !==
      context.deterministicFingerprint
    ) {
      throw new SwarmMissionPlannerError(
        "INVALID_CONTEXT",
        "The supplied context does not match request.context.",
        { requestId: request.requestId },
      );
    }

    if (
      context.topology.deterministicFingerprint !==
      topology.deterministicFingerprint
    ) {
      throw new SwarmMissionPlannerError(
        "INVALID_TOPOLOGY",
        "The supplied topology does not match context.topology.",
        { requestId: request.requestId },
      );
    }

    const contextAgeMs = request.requestedAtMs - context.builtAtMs;

    if (
      this.options.rejectStaleContext &&
      contextAgeMs > request.configuration.maximumContextAgeMs
    ) {
      throw new SwarmMissionPlannerError(
        "STALE_CONTEXT",
        "The swarm context exceeds the configured maximum age.",
        {
          requestId: request.requestId,
          contextAgeMs,
          maximumContextAgeMs: request.configuration.maximumContextAgeMs,
        },
      );
    }

    if (
      this.options.rejectBlockingRisk &&
      (!context.systemRisk.executionAllowed ||
        context.systemRisk.findings.some((finding) => finding.blocking))
    ) {
      throw new SwarmMissionPlannerError(
        "INVALID_CONTEXT",
        "Mission planning is blocked by the current system-risk assessment.",
        { requestId: request.requestId },
      );
    }

    assertPositiveFinite(
      request.configuration.maximumMissionDurationMs,
      "configuration.maximumMissionDurationMs",
    );
  }
}

export function createSwarmMissionPlanner(
  options: SwarmMissionPlannerOptions = {},
): SwarmMissionPlanner {
  return new SwarmMissionPlanner(options);
}

export class StableSwarmMissionIdGenerator
  implements TradingSwarmIdGenerator
{
  public generate(prefix: string, seed: string): string {
    return `${prefix}-${stableHash(seed)}`;
  }
}

export class StableSwarmMissionFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    return `swarm-mission-fp-${stableHash(stableStringify(value))}`;
  }
}

function normalizeConstraints(
  supplied: TradingSwarmMissionConstraints | undefined,
  requiredNodeRoles: AiTradingSwarmRunRequest["requiredNodeRoles"] | undefined,
  requiredCapabilities:
    | AiTradingSwarmRunRequest["requiredCapabilities"]
    | undefined,
  configuredMaximumDurationMs: number,
): TradingSwarmMissionConstraints {
  const maximumMissionDurationMs =
    supplied?.maximumMissionDurationMs ?? configuredMaximumDurationMs;

  assertPositiveFinite(
    maximumMissionDurationMs,
    "constraints.maximumMissionDurationMs",
  );

  if (supplied?.maximumCapitalAtRisk !== undefined) {
    assertNonNegativeFinite(
      supplied.maximumCapitalAtRisk,
      "constraints.maximumCapitalAtRisk",
    );
  }

  if (supplied?.maximumRiskScore !== undefined) {
    assertUnitScore(
      supplied.maximumRiskScore,
      "constraints.maximumRiskScore",
    );
  }

  if (supplied?.maximumLeverage !== undefined) {
    assertNonNegativeFinite(
      supplied.maximumLeverage,
      "constraints.maximumLeverage",
    );
  }

  if (supplied?.maximumDrawdown !== undefined) {
    assertUnitScore(
      supplied.maximumDrawdown,
      "constraints.maximumDrawdown",
    );
  }

  if (supplied?.maximumExecutionActions !== undefined) {
    assertNonNegativeInteger(
      supplied.maximumExecutionActions,
      "constraints.maximumExecutionActions",
    );
  }

  return deepFreeze({
    ...(supplied?.maximumCapitalAtRisk === undefined
      ? {}
      : { maximumCapitalAtRisk: supplied.maximumCapitalAtRisk }),
    ...(supplied?.maximumRiskScore === undefined
      ? {}
      : { maximumRiskScore: supplied.maximumRiskScore }),
    ...(supplied?.maximumLeverage === undefined
      ? {}
      : { maximumLeverage: supplied.maximumLeverage }),
    ...(supplied?.maximumDrawdown === undefined
      ? {}
      : { maximumDrawdown: supplied.maximumDrawdown }),
    ...(supplied?.maximumExecutionActions === undefined
      ? {}
      : { maximumExecutionActions: supplied.maximumExecutionActions }),
    maximumMissionDurationMs,
    requiredNodeRoles: uniqueSorted([
      ...(supplied?.requiredNodeRoles ?? []),
      ...(requiredNodeRoles ?? []),
    ]),
    requiredCapabilities: uniqueSorted([
      ...(supplied?.requiredCapabilities ?? []),
      ...(requiredCapabilities ?? []),
    ]),
    requiredPartitionIds: uniqueSorted(
      supplied?.requiredPartitionIds ?? [],
    ),
    prohibitedActions: uniqueSorted(supplied?.prohibitedActions ?? []),
    ...(supplied?.metadata === undefined
      ? {}
      : { metadata: deepFreeze({ ...supplied.metadata }) }),
  });
}

function selectPartitionIds(
  request: AiTradingSwarmRunRequest,
  partitions: readonly TradingSwarmPartition[],
  requiredPartitionIds: readonly TradingSwarmPartitionId[],
  includeAllEligiblePartitions: boolean,
): readonly TradingSwarmPartitionId[] {
  const matchingSwarmPartitions = partitions
    .filter(
      (partition) =>
        partition.swarmId === request.swarmId &&
        partition.state !== "RETIRED" &&
        partition.state !== "QUARANTINED",
    )
    .sort(comparePartitions);

  const byId = new Map(
    matchingSwarmPartitions.map((partition) => [
      partition.partitionId,
      partition,
    ]),
  );

  const missingRequired = requiredPartitionIds.filter(
    (partitionId) => !byId.has(partitionId),
  );

  if (missingRequired.length > 0) {
    throw new SwarmMissionPlannerError(
      "PARTITION_REQUIREMENT_UNSATISFIED",
      "One or more required partitions are unavailable.",
      {
        requestId: request.requestId,
        requiredPartitionIds,
        missingPartitionIds: missingRequired,
      },
    );
  }

  const selected = new Set<TradingSwarmPartitionId>(requiredPartitionIds);

  for (const partition of matchingSwarmPartitions) {
    if (
      includeAllEligiblePartitions ||
      partitionMatchesRequest(partition, request)
    ) {
      selected.add(partition.partitionId);
    }
  }

  return Object.freeze([...selected].sort());
}

function partitionMatchesRequest(
  partition: TradingSwarmPartition,
  request: AiTradingSwarmRunRequest,
): boolean {
  if (
    partition.type === "MISSION" &&
    (partition.key === request.requestId ||
      partition.key.includes(request.requestId))
  ) {
    return true;
  }

  if (
    partition.type === "MARKET" &&
    (request.marketIds ?? []).includes(partition.key)
  ) {
    return true;
  }

  if (
    partition.type === "STRATEGY" &&
    (request.strategyIds ?? []).includes(partition.key)
  ) {
    return true;
  }

  if (
    partition.type === "PORTFOLIO" &&
    request.portfolioId === partition.key
  ) {
    return true;
  }

  if (
    partition.type === "RISK_DOMAIN" &&
    request.objective === "SYSTEMIC_RISK_RESPONSE"
  ) {
    return true;
  }

  if (
    partition.type === "EXCHANGE" &&
    (request.objective === "CROSS_EXCHANGE_EXECUTION" ||
      request.objective === "LIQUIDITY_COORDINATION")
  ) {
    return true;
  }

  if (
    partition.type === "CUSTOM" &&
    request.objective === "DISTRIBUTED_ARBITRAGE_DISCOVERY"
  ) {
    return true;
  }

  return false;
}

function derivePriority(
  objective: TradingSwarmMissionObjective,
  context: TradingSwarmContext,
  fallback: TradingSwarmPriority,
): TradingSwarmPriority {
  const objectivePriority = objectiveBasePriority(objective);

  const riskPriority =
    context.systemRisk.overallRisk >= 0.9 ||
    context.systemRisk.systemicRisk >= 0.9
      ? "EMERGENCY"
      : context.systemRisk.overallRisk >= 0.75 ||
          context.systemRisk.systemicRisk >= 0.75
        ? "CRITICAL"
        : context.systemRisk.overallRisk >= 0.55
          ? "VERY_HIGH"
          : fallback;

  return higherPriority(objectivePriority, riskPriority);
}

function objectiveBasePriority(
  objective: TradingSwarmMissionObjective,
): TradingSwarmPriority {
  switch (objective) {
    case "DISASTER_RECOVERY":
      return "EMERGENCY";
    case "SYSTEMIC_RISK_RESPONSE":
      return "CRITICAL";
    case "CROSS_EXCHANGE_EXECUTION":
    case "FULL_SWARM_DECISION":
      return "VERY_HIGH";
    case "DISTRIBUTED_TRADE_DECISION":
    case "DISTRIBUTED_PORTFOLIO_REBALANCE":
    case "REGIME_TRANSITION_RESPONSE":
      return "HIGH";
    case "GLOBAL_MARKET_ASSESSMENT":
    case "CROSS_MARKET_STRATEGY_SELECTION":
    case "DISTRIBUTED_ARBITRAGE_DISCOVERY":
    case "LIQUIDITY_COORDINATION":
      return "NORMAL";
    case "AUTONOMOUS_SWARM_OPTIMIZATION":
      return "LOW";
  }
}

function higherPriority(
  left: TradingSwarmPriority,
  right: TradingSwarmPriority,
): TradingSwarmPriority {
  return priorityRank(right) > priorityRank(left) ? right : left;
}

function priorityRank(priority: TradingSwarmPriority): number {
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
  }
}

function resolveMissionDurationMs(
  constrainedDurationMs: number | undefined,
  configuredDurationMs: number,
  minimumDurationMs: number,
): number {
  const duration = Math.min(
    constrainedDurationMs ?? configuredDurationMs,
    configuredDurationMs,
  );

  if (!Number.isFinite(duration) || duration < minimumDurationMs) {
    throw new SwarmMissionPlannerError(
      "MISSION_DURATION_INVALID",
      `Mission duration must be at least ${minimumDurationMs} milliseconds.`,
      { field: "maximumMissionDurationMs" },
    );
  }

  return Math.floor(duration);
}

function addTimestamp(
  timestamp: TradingSwarmTimestamp,
  durationMs: number,
): TradingSwarmTimestamp {
  const result = timestamp + durationMs;

  if (!Number.isSafeInteger(result)) {
    throw new SwarmMissionPlannerError(
      "MISSION_DURATION_INVALID",
      "Mission deadline exceeds the safe timestamp range.",
    );
  }

  return result as TradingSwarmTimestamp;
}

function resolveRequestedBy(
  metadata: TradingSwarmMetadata | undefined,
  fallback: string,
): string {
  const candidates = [
    metadata?.requestedBy,
    metadata?.operatorId,
    metadata?.userId,
    metadata?.source,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return fallback;
}

function buildMissionMetadata(
  request: AiTradingSwarmRunRequest,
  context: TradingSwarmContext,
  topology: TradingSwarmTopologySnapshot,
  missionDurationMs: number,
): TradingSwarmMetadata {
  return deepFreeze({
    ...(request.metadata ?? {}),
    requestId: request.requestId,
    schemaVersion: request.configuration.schemaVersion,
    autonomy: request.configuration.autonomy,
    coordinationMode: request.configuration.coordinationMode,
    topology: request.configuration.topology,
    missionDurationMs,
    contextFingerprint: context.deterministicFingerprint,
    topologyFingerprint: topology.deterministicFingerprint,
    riskAssessmentId: context.systemRisk.assessmentId,
    executionAllowed: context.systemRisk.executionAllowed,
    activeMissionCount: context.activeMissions.length,
    recentDecisionCount: context.recentDecisions.length,
  });
}

function normalizeOptions(
  options: SwarmMissionPlannerOptions,
): NormalizedOptions {
  const defaultRequestedBy = options.defaultRequestedBy ?? "system";
  assertNonEmptyText(defaultRequestedBy, "defaultRequestedBy");

  const minimumMissionDurationMs = options.minimumMissionDurationMs ?? 1;
  assertPositiveFinite(minimumMissionDurationMs, "minimumMissionDurationMs");

  return Object.freeze({
    idGenerator: options.idGenerator ?? new StableSwarmMissionIdGenerator(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableSwarmMissionFingerprintGenerator(),
    defaultRequestedBy,
    includeAllEligiblePartitions:
      options.includeAllEligiblePartitions ?? false,
    rejectStaleContext: options.rejectStaleContext ?? true,
    rejectBlockingRisk: options.rejectBlockingRisk ?? false,
    minimumMissionDurationMs,
    defaultPriority: options.defaultPriority ?? "NORMAL",
  });
}

function comparePartitions(
  left: TradingSwarmPartition,
  right: TradingSwarmPartition,
): number {
  const typeOrder = left.type.localeCompare(right.type);
  if (typeOrder !== 0) {
    return typeOrder;
  }

  const keyOrder = left.key.localeCompare(right.key);
  if (keyOrder !== 0) {
    return keyOrder;
  }

  return left.partitionId.localeCompare(right.partitionId);
}

function uniqueSorted<TValue extends string>(
  values: readonly TValue[],
): readonly TValue[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right)),
  );
}

function assertNonEmptyText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be a non-negative safe integer timestamp.`,
      { field },
    );
  }
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be positive and finite.`,
      { field },
    );
  }
}

function assertNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be non-negative and finite.`,
      { field },
    );
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be a non-negative integer.`,
      { field },
    );
  }
}

function assertUnitScore(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new SwarmMissionPlannerError(
      "INVALID_REQUEST",
      `${field} must be between 0 and 1.`,
      { field },
    );
  }
}

function deepFreeze<TValue>(value: TValue): TValue {
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
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }

  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
}

function normalizeForStableJson(value: unknown): unknown {
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
    return value.map(normalizeForStableJson);
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];

      if (typeof item === "function" || typeof item === "symbol") {
        continue;
      }

      output[key] = normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}