/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * File:
 * src/trading/ai-trading-swarm/trading-swarm-context-builder.ts
 *
 * Deterministic and immutable swarm-context construction.
 */

import {
  type AiTradingSwarmRunRequest,
  type TradingSwarmCapability,
  type TradingSwarmClock,
  type TradingSwarmContext,
  type TradingSwarmContextBuilderPort,
  type TradingSwarmFingerprintGenerator,
  type TradingSwarmFormationPolicy,
  type TradingSwarmMetadata,
  type TradingSwarmNodeId,
  type TradingSwarmNodeRegistration,
  type TradingSwarmNodeRole,
  type TradingSwarmNodeState,
  type TradingSwarmRegistryPort,
  type TradingSwarmRiskAssessment,
  type TradingSwarmRiskFinding,
  type TradingSwarmTimestamp,
  type TradingSwarmTopologySnapshot,
  type TradingSwarmValidatorPort,
  hasTradingSwarmCapability,
  isActiveTradingSwarmNodeState,
  isHealthyTradingSwarmNode,
} from "./ai-trading-swarm-contracts";

import { aiTradingSwarmValidator } from "./ai-trading-swarm-validator";

/* ========================================================================== *
 * Errors and options
 * ========================================================================== */

export type TradingSwarmContextBuilderErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_REQUEST"
  | "SWARM_ID_MISMATCH"
  | "STALE_REQUEST_CONTEXT"
  | "INSUFFICIENT_ELIGIBLE_NODES"
  | "MAXIMUM_NODE_COUNT_EXCEEDED"
  | "REQUIRED_ROLE_MISSING"
  | "REQUIRED_CAPABILITY_MISSING"
  | "PREFERRED_NODE_UNAVAILABLE"
  | "CONTEXT_INVARIANT_VIOLATION";

export class TradingSwarmContextBuilderError extends Error {
  public readonly code: TradingSwarmContextBuilderErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: TradingSwarmContextBuilderErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "TradingSwarmContextBuilderError";
    this.code = code;
    this.details =
      details === undefined
        ? undefined
        : deepFreeze({ ...details });
  }
}

export interface TradingSwarmContextBuilderOptions {
  readonly registry: TradingSwarmRegistryPort;
  readonly validator?: TradingSwarmValidatorPort;
  readonly clock?: TradingSwarmClock;
  readonly fingerprintGenerator?: TradingSwarmFingerprintGenerator;
  readonly rejectStaleRequestContext?: boolean;
  readonly requirePreferredNodes?: boolean;
  readonly includeOnlyEligibleTopologyNodes?: boolean;
  readonly preserveRequestMetadata?: boolean;
}

export interface TradingSwarmContextEligibility {
  readonly eligibleNodeIds: readonly TradingSwarmNodeId[];
  readonly ineligibleNodeIds: readonly TradingSwarmNodeId[];
  readonly excludedNodeIds: readonly TradingSwarmNodeId[];
  readonly preferredNodeIds: readonly TradingSwarmNodeId[];
  readonly roleCoverage: Readonly<
    Partial<Record<TradingSwarmNodeRole, number>>
  >;
  readonly capabilityCoverage: Readonly<
    Partial<Record<TradingSwarmCapability, number>>
  >;
  readonly deterministicFingerprint: string;
}

interface NormalizedOptions {
  readonly registry: TradingSwarmRegistryPort;
  readonly validator: TradingSwarmValidatorPort;
  readonly clock: TradingSwarmClock;
  readonly fingerprintGenerator: TradingSwarmFingerprintGenerator;
  readonly rejectStaleRequestContext: boolean;
  readonly requirePreferredNodes: boolean;
  readonly includeOnlyEligibleTopologyNodes: boolean;
  readonly preserveRequestMetadata: boolean;
}

interface EligibilityResult {
  readonly eligibleNodes: readonly TradingSwarmNodeState[];
  readonly ineligibleNodes: readonly TradingSwarmNodeState[];
  readonly eligibility: TradingSwarmContextEligibility;
}

/* ========================================================================== *
 * Context builder
 * ========================================================================== */

export class TradingSwarmContextBuilder
  implements TradingSwarmContextBuilderPort
{
  private readonly options: NormalizedOptions;

  public constructor(options: TradingSwarmContextBuilderOptions) {
    this.options = normalizeOptions(options);
  }

  public build(
    request: AiTradingSwarmRunRequest,
  ): TradingSwarmContext {
    this.assertValidRequest(request);

    const topology = this.options.registry.topology();
    this.assertMatchingSwarm(request, topology);
    this.assertContextFreshness(request);

    const eligibility = this.evaluateEligibility(
      request,
      topology,
    );

    this.assertFormationPolicy(
      request,
      eligibility.eligibleNodes,
      eligibility.eligibility,
    );

    const builtAtMs = this.options.clock.now();
    const selectedTopology =
      this.options.includeOnlyEligibleTopologyNodes
        ? this.createEligibleTopology(
            topology,
            eligibility.eligibleNodes,
            builtAtMs,
          )
        : topology;

    const activeMissions = Object.freeze(
      [...request.context.activeMissions]
        .sort(compareMissionSummaries)
        .slice(
          0,
          request.configuration.maximumConcurrentMissions,
        )
        .map(immutableClone),
    );

    const recentDecisions = Object.freeze(
      [...request.context.recentDecisions]
        .slice(
          -request.configuration.maximumRecentDecisions,
        )
        .map((decision) => decision),
    );

    const systemRisk = this.buildSystemRiskAssessment(
      request,
      topology,
      eligibility,
      builtAtMs,
    );

    const metadata = this.buildMetadata(
      request,
      eligibility.eligibility,
      topology,
    );

    const fingerprintInput = {
      requestId: request.requestId,
      swarmId: request.swarmId,
      objective: request.objective,
      multiAgentContextFingerprint:
        request.context.multiAgentContext
          .deterministicFingerprint,
      topologyFingerprint:
        selectedTopology.deterministicFingerprint,
      activeMissions,
      recentDecisions,
      systemRisk,
      builtAtMs,
      metadata,
    };

    return deepFreeze({
      multiAgentContext:
        request.context.multiAgentContext,
      topology: selectedTopology,
      activeMissions,
      recentDecisions,
      executionState:
        request.context.executionState,
      systemRisk,
      builtAtMs,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          fingerprintInput,
        ),
      metadata,
    });
  }

  public assessEligibility(
    request: AiTradingSwarmRunRequest,
  ): TradingSwarmContextEligibility {
    this.assertValidRequest(request);

    const topology = this.options.registry.topology();
    this.assertMatchingSwarm(request, topology);

    return this.evaluateEligibility(
      request,
      topology,
    ).eligibility;
  }

  private assertValidRequest(
    request: AiTradingSwarmRunRequest,
  ): void {
    const validation =
      this.options.validator.validateRequest(request);

    if (!validation.valid) {
      throw new TradingSwarmContextBuilderError(
        "INVALID_REQUEST",
        `Swarm run request "${request.requestId}" failed validation.`,
        {
          requestId: request.requestId,
          errorCount: validation.errorCount,
          warningCount: validation.warningCount,
          issues: validation.issues,
        },
      );
    }
  }

  private assertMatchingSwarm(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
  ): void {
    if (request.swarmId !== topology.swarmId) {
      throw new TradingSwarmContextBuilderError(
        "SWARM_ID_MISMATCH",
        `Request swarm "${request.swarmId}" does not match registry swarm "${topology.swarmId}".`,
        {
          requestId: request.requestId,
          requestSwarmId: request.swarmId,
          registrySwarmId: topology.swarmId,
        },
      );
    }

    if (
      request.context.topology.swarmId !== request.swarmId
    ) {
      throw new TradingSwarmContextBuilderError(
        "SWARM_ID_MISMATCH",
        "The supplied request context belongs to a different swarm.",
        {
          requestId: request.requestId,
          requestSwarmId: request.swarmId,
          contextSwarmId:
            request.context.topology.swarmId,
        },
      );
    }
  }

  private assertContextFreshness(
    request: AiTradingSwarmRunRequest,
  ): void {
    const maximumAgeMs =
      request.configuration.maximumContextAgeMs;

    const ageMs =
      request.requestedAtMs -
      request.context.builtAtMs;

    if (
      this.options.rejectStaleRequestContext &&
      (ageMs < 0 || ageMs > maximumAgeMs)
    ) {
      throw new TradingSwarmContextBuilderError(
        "STALE_REQUEST_CONTEXT",
        `Request context age ${ageMs}ms exceeds the configured maximum of ${maximumAgeMs}ms.`,
        {
          requestId: request.requestId,
          requestedAtMs: request.requestedAtMs,
          contextBuiltAtMs:
            request.context.builtAtMs,
          ageMs,
          maximumAgeMs,
        },
      );
    }
  }

  private evaluateEligibility(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
  ): EligibilityResult {
    const policy = request.configuration.formation;
    const excluded = new Set(
      request.excludedNodeIds ?? [],
    );
    const preferred = new Set(
      request.preferredNodeIds ?? [],
    );

    const requiredRoles = new Set<TradingSwarmNodeRole>([
      ...policy.requiredNodeRoles,
      ...(request.requiredNodeRoles ?? []),
    ]);

    const requiredCapabilities =
      new Set<TradingSwarmCapability>([
        ...policy.requiredCapabilities,
        ...(request.requiredCapabilities ?? []),
      ]);

    const eligible: TradingSwarmNodeState[] = [];
    const ineligible: TradingSwarmNodeState[] = [];

    for (const node of topology.nodes) {
      const registration = node.registration;
      const health = node.health;

      const accepted =
        !excluded.has(registration.identity.nodeId) &&
        this.matchesFormationPolicy(
          registration,
          health,
          policy,
        );

      if (accepted) {
        eligible.push(node);
      } else {
        ineligible.push(node);
      }
    }

    eligible.sort(compareNodeStates);
    ineligible.sort(compareNodeStates);

    if (this.options.requirePreferredNodes) {
      const eligibleIds = new Set(
        eligible.map(
          (node) =>
            node.registration.identity.nodeId,
        ),
      );

      const missingPreferred = [...preferred]
        .filter((nodeId) => !eligibleIds.has(nodeId))
        .sort((left, right) =>
          left.localeCompare(right),
        );

      if (missingPreferred.length > 0) {
        throw new TradingSwarmContextBuilderError(
          "PREFERRED_NODE_UNAVAILABLE",
          "One or more preferred swarm nodes are unavailable or ineligible.",
          {
            requestId: request.requestId,
            missingPreferredNodeIds:
              missingPreferred,
          },
        );
      }
    }

    const roleCoverage =
      this.calculateRoleCoverage(eligible);
    const capabilityCoverage =
      this.calculateCapabilityCoverage(eligible);

    const eligibilityBase = {
      eligibleNodeIds: Object.freeze(
        eligible.map(
          (node) =>
            node.registration.identity.nodeId,
        ),
      ),
      ineligibleNodeIds: Object.freeze(
        ineligible.map(
          (node) =>
            node.registration.identity.nodeId,
        ),
      ),
      excludedNodeIds: Object.freeze(
        [...excluded].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      preferredNodeIds: Object.freeze(
        [...preferred].sort((left, right) =>
          left.localeCompare(right),
        ),
      ),
      roleCoverage,
      capabilityCoverage,
    };

    const eligibility = deepFreeze({
      ...eligibilityBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          eligibilityBase,
        ),
    });

    return {
      eligibleNodes: Object.freeze(eligible),
      ineligibleNodes: Object.freeze(ineligible),
      eligibility,
    };
  }

  private matchesFormationPolicy(
    registration: TradingSwarmNodeRegistration,
    health: TradingSwarmNodeState["health"],
    policy: TradingSwarmFormationPolicy,
  ): boolean {
    if (
      policy.requireDeterministicNodes &&
      !registration.deterministic
    ) {
      return false;
    }

    if (
      policy.requireReplaySafeNodes &&
      !registration.replaySafe
    ) {
      return false;
    }

    if (
      health.readinessScore <
        policy.minimumNodeReadiness ||
      health.reliabilityScore <
        policy.minimumNodeReliability
    ) {
      return false;
    }

    if (!policy.allowDegradedNodes) {
      return isHealthyTradingSwarmNode(health);
    }

    return (
      health.availability !== "UNAVAILABLE" &&
      health.lifecycleState !== "FAILED" &&
      health.lifecycleState !== "REMOVED" &&
      isActiveTradingSwarmNodeState(
        health.lifecycleState,
      )
    );
  }

  private assertFormationPolicy(
    request: AiTradingSwarmRunRequest,
    eligibleNodes: readonly TradingSwarmNodeState[],
    eligibility: TradingSwarmContextEligibility,
  ): void {
    const policy = request.configuration.formation;

    if (eligibleNodes.length < policy.minimumNodes) {
      throw new TradingSwarmContextBuilderError(
        "INSUFFICIENT_ELIGIBLE_NODES",
        `Only ${eligibleNodes.length} eligible nodes are available; ${policy.minimumNodes} are required.`,
        {
          requestId: request.requestId,
          eligibleNodeIds:
            eligibility.eligibleNodeIds,
          minimumNodes: policy.minimumNodes,
        },
      );
    }

    if (eligibleNodes.length > policy.maximumNodes) {
      throw new TradingSwarmContextBuilderError(
        "MAXIMUM_NODE_COUNT_EXCEEDED",
        `${eligibleNodes.length} eligible nodes exceed the configured maximum of ${policy.maximumNodes}.`,
        {
          requestId: request.requestId,
          eligibleNodeIds:
            eligibility.eligibleNodeIds,
          maximumNodes: policy.maximumNodes,
        },
      );
    }

    const requiredRoles =
      new Set<TradingSwarmNodeRole>([
        ...policy.requiredNodeRoles,
        ...(request.requiredNodeRoles ?? []),
      ]);

    for (const role of requiredRoles) {
      if ((eligibility.roleCoverage[role] ?? 0) === 0) {
        throw new TradingSwarmContextBuilderError(
          "REQUIRED_ROLE_MISSING",
          `No eligible swarm node provides required role "${role}".`,
          {
            requestId: request.requestId,
            role,
          },
        );
      }
    }

    const requiredCapabilities =
      new Set<TradingSwarmCapability>([
        ...policy.requiredCapabilities,
        ...(request.requiredCapabilities ?? []),
      ]);

    for (const capability of requiredCapabilities) {
      if (
        (eligibility.capabilityCoverage[
          capability
        ] ?? 0) === 0
      ) {
        throw new TradingSwarmContextBuilderError(
          "REQUIRED_CAPABILITY_MISSING",
          `No eligible swarm node provides required capability "${capability}".`,
          {
            requestId: request.requestId,
            capability,
          },
        );
      }
    }
  }

  private calculateRoleCoverage(
    nodes: readonly TradingSwarmNodeState[],
  ): Readonly<
    Partial<Record<TradingSwarmNodeRole, number>>
  > {
    const coverage: Partial<
      Record<TradingSwarmNodeRole, number>
    > = {};

    for (const node of nodes) {
      const role = node.registration.identity.role;
      coverage[role] = (coverage[role] ?? 0) + 1;
    }

    return deepFreeze(
      Object.fromEntries(
        Object.entries(coverage).sort(
          ([left], [right]) =>
            left.localeCompare(right),
        ),
      ),
    ) as Readonly<
      Partial<Record<TradingSwarmNodeRole, number>>
    >;
  }

  private calculateCapabilityCoverage(
    nodes: readonly TradingSwarmNodeState[],
  ): Readonly<
    Partial<Record<TradingSwarmCapability, number>>
  > {
    const coverage: Partial<
      Record<TradingSwarmCapability, number>
    > = {};

    for (const node of nodes) {
      for (const declaration of node.registration
        .capabilities) {
        if (
          declaration.enabled &&
          hasTradingSwarmCapability(
            node.registration,
            declaration.capability,
          )
        ) {
          coverage[declaration.capability] =
            (coverage[declaration.capability] ??
              0) + 1;
        }
      }
    }

    return deepFreeze(
      Object.fromEntries(
        Object.entries(coverage).sort(
          ([left], [right]) =>
            left.localeCompare(right),
        ),
      ),
    ) as Readonly<
      Partial<Record<TradingSwarmCapability, number>>
    >;
  }

  private createEligibleTopology(
    topology: TradingSwarmTopologySnapshot,
    eligibleNodes: readonly TradingSwarmNodeState[],
    capturedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmTopologySnapshot {
    const eligibleNodeIds = new Set(
      eligibleNodes.map(
        (node) =>
          node.registration.identity.nodeId,
      ),
    );

    const partitions = Object.freeze(
      topology.partitions
        .filter(
          (partition) =>
            partition.ownerNodeId === undefined ||
            eligibleNodeIds.has(
              partition.ownerNodeId,
            ),
        )
        .map((partition) =>
          deepFreeze({
            ...partition,
            replicaNodeIds: Object.freeze(
              partition.replicaNodeIds.filter(
                (nodeId) =>
                  eligibleNodeIds.has(nodeId),
              ),
            ),
          }),
        ),
    );

    const partitionIds = new Set(
      partitions.map(
        (partition) => partition.partitionId,
      ),
    );

    const leases = Object.freeze(
      topology.leases.filter(
        (lease) =>
          eligibleNodeIds.has(lease.ownerNodeId) &&
          partitionIds.has(lease.partitionId),
      ),
    );

    const leaderNodeId =
      topology.leaderNodeId !== undefined &&
      eligibleNodeIds.has(topology.leaderNodeId)
        ? topology.leaderNodeId
        : undefined;

    const fingerprintInput = {
      swarmId: topology.swarmId,
      topology: topology.topology,
      coordinationMode: topology.coordinationMode,
      leaderNodeId,
      nodes: eligibleNodes,
      partitions,
      leases,
      term: topology.term,
      epoch: topology.epoch,
      topologyVersion: topology.topologyVersion,
      capturedAtMs,
    };

    return deepFreeze({
      ...fingerprintInput,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          fingerprintInput,
        ),
    });
  }

  private buildSystemRiskAssessment(
    request: AiTradingSwarmRunRequest,
    topology: TradingSwarmTopologySnapshot,
    eligibility: EligibilityResult,
    assessedAtMs: TradingSwarmTimestamp,
  ): TradingSwarmRiskAssessment {
    const existing = request.context.systemRisk;
    const findings: TradingSwarmRiskFinding[] = [
      ...existing.findings.map(immutableClone),
    ];

    const eligibleCount =
      eligibility.eligibleNodes.length;
    const totalCount = topology.nodes.length;
    const unavailableRatio =
      totalCount === 0
        ? 1
        : 1 - eligibleCount / totalCount;

    const formationRatio =
      request.configuration.formation.minimumNodes === 0
        ? 1
        : Math.min(
            1,
            eligibleCount /
              request.configuration.formation
                .minimumNodes,
          );

    const topologyRisk = clamp01(
      Math.max(
        unavailableRatio,
        1 - formationRatio,
      ),
    );

    if (topologyRisk > 0) {
      findings.push(
        deepFreeze({
          findingId: this.options.fingerprintGenerator.fingerprint(
            {
              requestId: request.requestId,
              category: "TOPOLOGY",
              assessedAtMs,
            },
          ),
          category: "TOPOLOGY",
          severity:
            topologyRisk >= 0.75
              ? "CRITICAL"
              : topologyRisk >= 0.5
                ? "HIGH"
                : topologyRisk >= 0.25
                  ? "MODERATE"
                  : "LOW",
          score: topologyRisk,
          title: "Swarm topology eligibility risk",
          description:
            `${eligibleCount} of ${totalCount} registered nodes are eligible for this run.`,
          affectedNodeIds:
            eligibility.eligibility
              .ineligibleNodeIds,
          affectedPartitionIds:
            Object.freeze([]),
          mitigations: Object.freeze([
            "Restore unhealthy nodes.",
            "Register nodes with missing required capabilities.",
            "Review swarm formation thresholds.",
          ]),
          blocking:
            eligibleCount <
            request.configuration.formation
              .minimumNodes,
          detectedAtMs: assessedAtMs,
        }),
      );
    }

    findings.sort((left, right) =>
      left.findingId.localeCompare(right.findingId),
    );

    const coordinationRisk = clamp01(
      Math.max(
        existing.coordinationRisk,
        topologyRisk,
      ),
    );
    const partitionRisk = clamp01(
      Math.max(
        existing.partitionRisk,
        topology.partitions.some(
          (partition) =>
            partition.state === "DEGRADED" ||
            partition.state === "QUARANTINED",
        )
          ? 0.75
          : 0,
      ),
    );

    const systemicRisk = clamp01(
      Math.max(
        existing.systemicRisk,
        coordinationRisk,
        partitionRisk,
      ),
    );
    const overallRisk = clamp01(
      Math.max(
        existing.overallRisk,
        systemicRisk,
        existing.executionRisk,
      ),
    );

    const restrictions = Object.freeze(
      [...new Set(existing.restrictions)].sort(
        (left, right) =>
          left.localeCompare(right),
      ),
    );

    const assessmentBase = {
      assessmentId: existing.assessmentId,
      overallRisk,
      systemicRisk,
      executionRisk: existing.executionRisk,
      coordinationRisk,
      partitionRisk,
      findings: Object.freeze(findings),
      executionAllowed:
        existing.executionAllowed &&
        overallRisk <=
          request.configuration.safety
            .maximumSystemicRisk,
      restrictions,
      assessedAtMs,
    };

    return deepFreeze({
      ...assessmentBase,
      deterministicFingerprint:
        this.options.fingerprintGenerator.fingerprint(
          assessmentBase,
        ),
    });
  }

  private buildMetadata(
    request: AiTradingSwarmRunRequest,
    eligibility: TradingSwarmContextEligibility,
    topology: TradingSwarmTopologySnapshot,
  ): TradingSwarmMetadata {
    const baseMetadata =
      this.options.preserveRequestMetadata
        ? request.context.metadata ?? {}
        : {};

    return deepFreeze({
      ...baseMetadata,
      contextBuilder: "TradingSwarmContextBuilder",
      requestId: request.requestId,
      objective: request.objective,
      eligibleNodeCount:
        eligibility.eligibleNodeIds.length,
      ineligibleNodeCount:
        eligibility.ineligibleNodeIds.length,
      eligibleNodeIds:
        eligibility.eligibleNodeIds,
      excludedNodeIds:
        eligibility.excludedNodeIds,
      preferredNodeIds:
        eligibility.preferredNodeIds,
      topologyVersion:
        topology.topologyVersion,
      topologyTerm: topology.term,
      topologyEpoch: topology.epoch,
      eligibilityFingerprint:
        eligibility.deterministicFingerprint,
    });
  }
}

/* ========================================================================== *
 * Factory and deterministic defaults
 * ========================================================================== */

export function createTradingSwarmContextBuilder(
  options: TradingSwarmContextBuilderOptions,
): TradingSwarmContextBuilder {
  return new TradingSwarmContextBuilder(options);
}

export class SystemTradingSwarmContextClock
  implements TradingSwarmClock
{
  public now(): TradingSwarmTimestamp {
    return Date.now() as TradingSwarmTimestamp;
  }
}

export class StableTradingSwarmContextFingerprintGenerator
  implements TradingSwarmFingerprintGenerator
{
  public fingerprint(value: unknown): string {
    const serialized = stableStringify(value);
    let hash = 0x811c9dc5;

    for (
      let index = 0;
      index < serialized.length;
      index += 1
    ) {
      hash ^= serialized.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }

    return `swarm-context-fp-${(hash >>> 0)
      .toString(16)
      .padStart(8, "0")}`;
  }
}

/* ========================================================================== *
 * Pure helpers
 * ========================================================================== */

function normalizeOptions(
  options: TradingSwarmContextBuilderOptions,
): NormalizedOptions {
  if (
    options === undefined ||
    options === null ||
    typeof options !== "object"
  ) {
    throw new TradingSwarmContextBuilderError(
      "INVALID_CONFIGURATION",
      "TradingSwarmContextBuilder options are required.",
    );
  }

  if (
    options.registry === undefined ||
    options.registry === null
  ) {
    throw new TradingSwarmContextBuilderError(
      "INVALID_CONFIGURATION",
      "A trading swarm registry is required.",
    );
  }

  return Object.freeze({
    registry: options.registry,
    validator:
      options.validator ?? aiTradingSwarmValidator,
    clock:
      options.clock ??
      new SystemTradingSwarmContextClock(),
    fingerprintGenerator:
      options.fingerprintGenerator ??
      new StableTradingSwarmContextFingerprintGenerator(),
    rejectStaleRequestContext:
      options.rejectStaleRequestContext ?? true,
    requirePreferredNodes:
      options.requirePreferredNodes ?? false,
    includeOnlyEligibleTopologyNodes:
      options.includeOnlyEligibleTopologyNodes ??
      false,
    preserveRequestMetadata:
      options.preserveRequestMetadata ?? true,
  });
}

function compareNodeStates(
  left: TradingSwarmNodeState,
  right: TradingSwarmNodeState,
): number {
  const preferredOrder =
    nodeRoleRank(
      left.registration.identity.role,
    ) -
    nodeRoleRank(
      right.registration.identity.role,
    );

  if (preferredOrder !== 0) {
    return preferredOrder;
  }

  const readinessOrder =
    right.health.readinessScore -
    left.health.readinessScore;

  if (readinessOrder !== 0) {
    return readinessOrder;
  }

  const reliabilityOrder =
    right.health.reliabilityScore -
    left.health.reliabilityScore;

  if (reliabilityOrder !== 0) {
    return reliabilityOrder;
  }

  return left.registration.identity.nodeId.localeCompare(
    right.registration.identity.nodeId,
  );
}

function compareMissionSummaries(
  left: TradingSwarmContext["activeMissions"][number],
  right: TradingSwarmContext["activeMissions"][number],
): number {
  const priorityOrder =
    missionPriorityRank(right.priority) -
    missionPriorityRank(left.priority);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  return left.missionId.localeCompare(right.missionId);
}

function missionPriorityRank(
  priority:
    TradingSwarmContext["activeMissions"][number]["priority"],
): number {
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

function nodeRoleRank(
  role: TradingSwarmNodeRole,
): number {
  switch (role) {
    case "LEADER":
      return 0;
    case "SUPERVISOR":
      return 1;
    case "GOVERNOR":
      return 2;
    case "COORDINATOR":
      return 3;
    case "ARBITER":
      return 4;
    case "EXECUTOR":
      return 5;
    case "WORKER":
      return 6;
    case "REPLICA":
      return 7;
    case "OBSERVER":
      return 8;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

function immutableClone<TValue>(
  value: TValue,
): TValue {
  return deepFreeze(cloneValue(value));
}

function cloneValue<TValue>(
  value: TValue,
): TValue {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneValue(item),
    ) as TValue;
  }

  const output: Record<string, unknown> = {};

  for (const key of Object.keys(value as object)) {
    output[key] = cloneValue(
      (value as Record<string, unknown>)[key],
    );
  }

  return output as TValue;
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
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze(
        (value as Record<string, unknown>)[key],
      );
    }
  }

  return Object.freeze(value);
}

function stableStringify(value: unknown): string {
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
    return value.map(normalizeForStableJson);
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      const item =
        (value as Record<string, unknown>)[key];

      if (
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        continue;
      }

      output[key] =
        normalizeForStableJson(item);
    }

    return output;
  }

  return String(value);
}