/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * Deterministic integration test for the central orchestrator.
 *
 * Run with:
 *   npx tsx src/trading/ai-multi-agent-intelligence.integration.test.ts
 */

import assert from "node:assert/strict";

import {
  AI_MULTI_AGENT_SCHEMA_VERSION,
  DEFAULT_MULTI_AGENT_CONFIGURATION,
  type AiMultiAgentIntelligenceDependencies,
  type MultiAgentCollectiveDecision,
  type MultiAgentConsensusResult,
  type MultiAgentDecisionExplanation,
  type MultiAgentEvent,
  type MultiAgentExecutionHandoff,
  type MultiAgentGovernanceAssessment,
  type MultiAgentHealthSnapshot,
  type MultiAgentMemoryRecord,
  type MultiAgentObservation,
  type MultiAgentPeerReview,
  type MultiAgentProposal,
  type MultiAgentRegistration,
  type MultiAgentRunRequest,
  type MultiAgentRunResult,
  type MultiAgentTimestamp,
  type MultiAgentTrustScore,
  type MultiAgentTrustUpdate,
  type MultiAgentValidationResult,
} from "./ai-multi-agent-intelligence";

import {
  AiMultiAgentIntelligenceOrchestrator,
} from "./ai-multi-agent-intelligence";

const BASE_TIMESTAMP = 1_800_000_000_000 as MultiAgentTimestamp;

class DeterministicClock {
  private current = BASE_TIMESTAMP as number;

  public now(): MultiAgentTimestamp {
    const value = this.current as MultiAgentTimestamp;
    this.current += 1;
    return value;
  }
}

class DeterministicIdGenerator {
  public generate(prefix: string, seed: string): string {
    return `${prefix}:${stableSerialize(seed)}`;
  }
}

class DeterministicFingerprintGenerator {
  public fingerprint(value: unknown): string {
    return `fp:${fnv1a(stableSerialize(value))}`;
  }
}

class InMemoryMemory {
  private readonly records: MultiAgentMemoryRecord[] = [];

  public read(agentId?: string): readonly MultiAgentMemoryRecord[] {
    const selected =
      agentId === undefined
        ? this.records
        : this.records.filter((record) => record.agentId === agentId);

    return Object.freeze([...selected]);
  }

  public write(records: readonly MultiAgentMemoryRecord[]): void {
    this.records.push(...records);
  }
}

class InMemoryPublisher {
  public readonly events: MultiAgentEvent[] = [];

  public publish(event: MultiAgentEvent): void {
    this.events.push(event);
  }
}

class InMemoryPersistence {
  public readonly runs: MultiAgentRunResult[] = [];
  public readonly snapshots: unknown[] = [];

  public saveRun(result: MultiAgentRunResult): void {
    this.runs.push(result);
  }

  public saveSnapshot(snapshot: unknown): void {
    this.snapshots.push(snapshot);
  }

  public loadSnapshot(): undefined {
    return undefined;
  }
}

function valid<T>(value: T): MultiAgentValidationResult<T> {
  return Object.freeze({
    valid: true,
    value,
    issues: Object.freeze([]),
    errorCount: 0,
    warningCount: 0,
  });
}

function createRegistration(
  agentId: string,
  role: MultiAgentRegistration["identity"]["role"],
  capabilities: readonly MultiAgentRegistration["capabilities"][number]["capability"][],
): MultiAgentRegistration {
  return deepFreeze({
    identity: {
      agentId,
      name: agentId,
      role,
      version: "1.0.0",
      modelType: "DETERMINISTIC_RULES",
      description: `Deterministic ${role}`,
    },
    authority: {
      level: role === "GOVERNANCE_AGENT" ? "APPROVER" : "CONTRIBUTOR",
      autonomy: "SEMI_AUTONOMOUS",
      mayPropose: true,
      mayReview: true,
      mayVote: true,
      mayVeto: role === "RISK_AGENT" || role === "GOVERNANCE_AGENT",
      mayArbitrate: role === "CONFLICT_ARBITER_AGENT",
      mayApproveExecution: role === "GOVERNANCE_AGENT",
      restrictedActions: Object.freeze([]),
    },
    capabilities: Object.freeze(
      capabilities.map((capability) =>
        Object.freeze({
          capability,
          enabled: true,
          proficiency: 0.95,
          confidenceFloor: 0.6,
          criticality: "IMPORTANT" as const,
        }),
      ),
    ),
    reasoningMode: "DETERMINISTIC",
    deterministic: true,
    replaySafe: true,
    registeredAtMs: BASE_TIMESTAMP,
    configurationVersion: "1.0.0",
  });
}

function createHealth(agentId: string): MultiAgentHealthSnapshot {
  return deepFreeze({
    agentId,
    lifecycleState: "READY",
    availability: "AVAILABLE",
    healthy: true,
    readinessScore: 0.98,
    reliabilityScore: 0.97,
    latencyScore: 0.96,
    dataFreshnessScore: 0.99,
    lastHeartbeatAtMs: BASE_TIMESTAMP,
    lastSuccessfulTaskAtMs: BASE_TIMESTAMP,
    consecutiveFailures: 0,
    activeTaskCount: 0,
    warnings: Object.freeze([]),
    errors: Object.freeze([]),
    assessedAtMs: BASE_TIMESTAMP,
  });
}

const REGISTRATIONS: readonly MultiAgentRegistration[] = Object.freeze([
  createRegistration(
    "agent-market",
    "MARKET_INTELLIGENCE_AGENT",
    [
      "OBSERVE_MARKET_INTELLIGENCE",
      "ASSESS_MARKET_REGIME",
      "PROPOSE_DECISION",
      "REVIEW_PROPOSAL",
      "VOTE",
    ],
  ),
  createRegistration(
    "agent-risk",
    "RISK_AGENT",
    [
      "ASSESS_RISK",
      "PROPOSE_DECISION",
      "REVIEW_PROPOSAL",
      "VOTE",
    ],
  ),
  createRegistration(
    "agent-governance",
    "GOVERNANCE_AGENT",
    [
      "EVALUATE_GOVERNANCE",
      "APPROVE_EXECUTION",
      "REVIEW_PROPOSAL",
      "VOTE",
    ],
  ),
  createRegistration(
    "agent-consensus",
    "CONSENSUS_COORDINATOR_AGENT",
    ["FORM_CONSENSUS", "VOTE", "REVIEW_PROPOSAL"],
  ),
  createRegistration(
    "agent-execution",
    "EXECUTION_AGENT",
    ["PLAN_EXECUTION", "REVIEW_PROPOSAL", "VOTE"],
  ),
]);

const HEALTH = new Map(
  REGISTRATIONS.map((registration) => [
    registration.identity.agentId,
    createHealth(registration.identity.agentId),
  ]),
);

function createRequest(): MultiAgentRunRequest {
  const context = deepFreeze({
    market: {
      reports: Object.freeze([]),
      markets: Object.freeze([]),
      riskSignals: Object.freeze([]),
      generatedAtMs: BASE_TIMESTAMP,
    },
    decisionIntelligence: {
      candidatePool: Object.freeze([]),
    },
    metaLearning: {
      strategyDescriptors: Object.freeze([]),
      adaptiveWeights: Object.freeze([]),
      reinforcementStates: Object.freeze([]),
    },
    strategyPortfolio: {
      candidates: Object.freeze([]),
    },
    arbitrage: {
      decisions: Object.freeze([]),
      signals: Object.freeze([]),
    },
    systemHealth: Object.freeze([...HEALTH.values()]),
    builtAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "context-fingerprint",
  });

  return deepFreeze({
    requestId: "integration-request-001",
    requestedAtMs: BASE_TIMESTAMP,
    portfolioId: "portfolio-main",
    objective: "FULL_COLLABORATIVE_DECISION",
    context,
    configuration: {
      ...DEFAULT_MULTI_AGENT_CONFIGURATION,
      agentSelection: {
        ...DEFAULT_MULTI_AGENT_CONFIGURATION.agentSelection,
        minimumAgents: 5,
        maximumAgents: 5,
      },
      debate: {
        ...DEFAULT_MULTI_AGENT_CONFIGURATION.debate,
        enabled: false,
      },
      execution: {
        ...DEFAULT_MULTI_AGENT_CONFIGURATION.execution,
        requireDecisionIntelligenceHandoff: false,
      },
      publishEvents: true,
    },
  });
}

function createDependencies(
  clock: DeterministicClock,
  memory: InMemoryMemory,
  publisher: InMemoryPublisher,
  persistence: InMemoryPersistence,
): AiMultiAgentIntelligenceDependencies {
  const proposal: MultiAgentProposal = deepFreeze({
    proposalId: "proposal-primary",
    runId: "run-placeholder",
    agentId: "agent-market",
    action: "BUY",
    thesis: "Deterministic multi-agent integration proposal.",
    confidence: 0.86,
    expectedUtility: 0.72,
    estimatedRisk: 0.28,
    evidenceIds: Object.freeze([]),
    constraints: Object.freeze([]),
    alternatives: Object.freeze(["HOLD"]),
    createdAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "proposal-fingerprint",
  } as unknown as MultiAgentProposal);

  const review: MultiAgentPeerReview = deepFreeze({
    reviewId: "review-primary",
    proposalId: "proposal-primary",
    reviewerAgentId: "agent-risk",
    verdict: "APPROVE",
    confidence: 0.84,
    evidenceQuality: 0.9,
    reasoningQuality: 0.88,
    riskAssessment: 0.25,
    comments: Object.freeze(["Risk is within deterministic test limits."]),
    identifiedRisks: Object.freeze([]),
    requestedChanges: Object.freeze([]),
    reviewedAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "review-fingerprint",
  } as unknown as MultiAgentPeerReview);

  const consensus: MultiAgentConsensusResult = deepFreeze({
    consensusId: "consensus-primary",
    status: "CONSENSUS_REACHED",
    method: "RISK_ADJUSTED",
    selectedProposalId: "proposal-primary",
    votes: Object.freeze([
      {
        voteId: "vote-market",
        agentId: "agent-market",
        proposalId: "proposal-primary",
        choice: "APPROVE",
        weight: 1,
        confidence: 0.86,
        rationale: "Supported by deterministic market evidence.",
        votedAtMs: BASE_TIMESTAMP,
      },
      {
        voteId: "vote-risk",
        agentId: "agent-risk",
        proposalId: "proposal-primary",
        choice: "APPROVE",
        weight: 1,
        confidence: 0.84,
        rationale: "Risk is acceptable.",
        votedAtMs: BASE_TIMESTAMP,
      },
    ]),
    collectiveConfidence: {
      rawConfidence: 0.85,
      trustAdjustedConfidence: 0.85,
      riskAdjustedConfidence: 0.82,
      dissentAdjustedConfidence: 0.82,
      finalConfidence: 0.82,
      confidenceBand: "HIGH",
    },
    approvalWeight: 1,
    rejectionWeight: 0,
    abstentionWeight: 0,
    vetoCount: 0,
    participationRatio: 1,
    quorumSatisfied: true,
    dissent: Object.freeze([]),
    resolvedConflicts: Object.freeze([]),
    rationale: "All participating deterministic agents approved the proposal.",
    formedAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "consensus-fingerprint",
  } as unknown as MultiAgentConsensusResult);

  const governance: MultiAgentGovernanceAssessment = deepFreeze({
    assessmentId: "governance-primary",
    decision: "APPROVED",
    approvalRequirement: "NONE",
    ruleResults: Object.freeze([]),
    safetyFindings: Object.freeze([]),
    restrictions: Object.freeze([]),
    operatorEscalationRequired: false,
    assessedAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "governance-fingerprint",
  } as unknown as MultiAgentGovernanceAssessment);

  const decision: MultiAgentCollectiveDecision = deepFreeze({
    decisionId: "decision-primary",
    runId: "run-placeholder",
    requestId: "integration-request-001",
    decision: "EXECUTE_WITH_RESTRICTIONS",
    selectedProposalId: "proposal-primary",
    actions: Object.freeze([]),
    collectiveConfidence: consensus.collectiveConfidence,
    expectedUtility: {
      expectedReturn: 0.04,
      expectedRisk: 0.02,
      expectedUtility: 0.72,
      utilityConfidence: 0.82,
    },
    risks: Object.freeze([]),
    constraints: Object.freeze([]),
    restrictions: Object.freeze(["PAPER_EXECUTION_ONLY"]),
    dissent: Object.freeze([]),
    decidedAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "decision-fingerprint",
  } as unknown as MultiAgentCollectiveDecision);

  const executionHandoff: MultiAgentExecutionHandoff = deepFreeze({
    planId: "execution-plan-primary",
    decisionId: "decision-primary",
    executionAuthorized: true,
    executionMode: "PAPER",
    actions: Object.freeze([]),
    preconditions: Object.freeze([]),
    monitoringRequirements: Object.freeze([]),
    rollbackPlan: Object.freeze([]),
    createdAtMs: BASE_TIMESTAMP,
    deterministicFingerprint: "execution-fingerprint",
  } as unknown as MultiAgentExecutionHandoff);

  const explanation: MultiAgentDecisionExplanation = deepFreeze({
    explanationId: "explanation-primary",
    decisionId: "decision-primary",
    audience: "TRADER",
    headline: "Collaborative decision approved",
    summary: "Five deterministic agents formed risk-adjusted consensus.",
    primaryFactors: Object.freeze([]),
    opposingFactors: Object.freeze([]),
    uncertaintyFactors: Object.freeze([]),
    agentContributions: Object.freeze([]),
    consensusNarrative: "Consensus was reached deterministically.",
    governanceNarrative: "Governance approved the decision.",
    alternativesConsidered: Object.freeze(["HOLD"]),
    limitations: Object.freeze(["Synthetic integration-test context."]),
    generatedAtMs: BASE_TIMESTAMP,
    modelVersion: "1.0.0",
  });

  const trustScores: readonly MultiAgentTrustScore[] = Object.freeze(
    REGISTRATIONS.map((registration) =>
      deepFreeze({
        agentId: registration.identity.agentId,
        overallTrust: 0.8,
        accuracyScore: 0.8,
        calibrationScore: 0.8,
        reliabilityScore: 0.8,
        evidenceQualityScore: 0.8,
        governanceComplianceScore: 0.8,
        collaborationScore: 0.8,
        outcomeContributionScore: 0.8,
        assessedAtMs: BASE_TIMESTAMP,
        sampleSize: 10,
        quarantined: false,
      } as unknown as MultiAgentTrustScore),
    ),
  );

  return {
    registry: {
      register: () => undefined,
      unregister: () => undefined,
      get: (agentId) =>
        REGISTRATIONS.find(
          (registration) => registration.identity.agentId === agentId,
        ),
      list: () => REGISTRATIONS,
      health: (agentId) => HEALTH.get(agentId),
    },
    contextBuilder: {
      build: (request) => request.context,
    },
    selector: {
      select: (_request, registrations) => registrations,
    },
    taskDispatcher: {
      dispatch: async (tasks) =>
        Object.freeze(
          tasks.map(
            (task, index) =>
              deepFreeze({
                observationId: `observation-${index + 1}`,
                taskId: task.taskId,
                runId: task.runId,
                agentId: task.assignedAgentId,
                category: "MARKET",
                summary: "Deterministic observation.",
                confidence: 0.8,
                evidence: Object.freeze([]),
                risks: Object.freeze([]),
                recommendations: Object.freeze([]),
                observedAtMs: BASE_TIMESTAMP,
                deterministicFingerprint: `observation-fingerprint-${index + 1}`,
              } as unknown as MultiAgentObservation),
          ),
        ),
    },
    proposalEngine: {
      propose: async () => Object.freeze([proposal]),
    },
    peerReviewEngine: {
      review: async () => Object.freeze([review]),
    },
    debateEngine: {
      debate: async () => {
        throw new Error("Debate must remain disabled in this integration test.");
      },
    },
    conflictResolver: {
      detect: () => Object.freeze([]),
      resolve: async () => Object.freeze([]),
    },
    consensusEngine: {
      form: async () => consensus,
    },
    governanceEngine: {
      evaluate: () => governance,
    },
    decisionAssembler: {
      assemble: () => decision,
    },
    executionPlanner: {
      plan: async () => executionHandoff,
    },
    explainabilityEngine: {
      explain: () => explanation,
    },
    trustEngine: {
      assess: () => trustScores,
      update: (previous) =>
        Object.freeze(
          previous.map(
            (score) =>
              deepFreeze({
                agentId: score.agentId,
                previous: score,
                current: score,
                delta: 0,
                reason: "Deterministic integration update.",
                updatedAtMs: BASE_TIMESTAMP,
              } as unknown as MultiAgentTrustUpdate),
          ),
        ),
    },
    memory,
    validator: {
      validateRequest: (request) => valid(request),
      validateConfiguration: (configuration) => valid(configuration),
      validateRegistration: (registration) => valid(registration),
      validateProposal: (candidate) => valid(candidate),
      validateDecision: (candidate) => valid(candidate),
    },
    publisher,
    persistence,
    clock,
    idGenerator: new DeterministicIdGenerator(),
    fingerprintGenerator: new DeterministicFingerprintGenerator(),
  };
}

async function runIntegrationTest(): Promise<void> {
  const clock = new DeterministicClock();
  const memory = new InMemoryMemory();
  const publisher = new InMemoryPublisher();
  const persistence = new InMemoryPersistence();

  const orchestrator = new AiMultiAgentIntelligenceOrchestrator(
    createDependencies(clock, memory, publisher, persistence),
    {
      managerId: "manager-integration",
      maximumRecentDecisions: 10,
      maximumActiveRuns: 2,
    },
  );

  const request = createRequest();
  const outcome = await orchestrator.run(request);

  assert.equal(outcome.status, "COMPLETED");
  assert.ok("decision" in outcome);
  assert.equal(outcome.requestId, request.requestId);
  assert.equal(outcome.selectedAgents.length, 5);
  assert.equal(outcome.observations.length, 5);
  assert.equal(outcome.proposals.length, 1);
  assert.equal(outcome.reviews.length, 1);
  assert.equal(outcome.conflicts.length, 0);
  assert.equal(outcome.consensus?.selectedProposalId, "proposal-primary");
  assert.equal(outcome.decision?.decisionId, "decision-primary");
  assert.equal(
    outcome.decision?.executionHandoff?.planId,
    "execution-plan-primary",
  );
  assert.equal(outcome.explanation?.decisionId, "decision-primary");
  assert.equal(outcome.failures.length, 0);
  assert.equal(outcome.trustUpdates.length, 5);
  assert.ok(outcome.deterministicFingerprint.startsWith("fp:"));
  assert.ok(outcome.trace.completedStages.includes("VALIDATION"));
  assert.ok(outcome.trace.completedStages.includes("DECISION_ASSEMBLY"));
  assert.ok(outcome.trace.completedStages.includes("EXECUTION_PLANNING"));
  assert.ok(outcome.trace.completedStages.includes("EXPLAINABILITY"));

  assert.equal(memory.read().length, 5);
  assert.equal(persistence.runs.length, 1);
  assert.ok(persistence.snapshots.length >= 1);

  const topics = publisher.events.map((event) => event.topic);
  assert.deepEqual(topics, [
    "RUN_STARTED",
    "AGENTS_SELECTED",
    "OBSERVATIONS_COMPLETED",
    "CONSENSUS_FORMED",
    "GOVERNANCE_EVALUATED",
    "DECISION_COMPLETED",
    "EXECUTION_HANDOFF",
  ]);

  const sequences = publisher.events.map((event) => event.sequence);
  assert.deepEqual(sequences, [1, 2, 3, 4, 5, 6, 7]);

  const snapshot = orchestrator.snapshot();

  assert.equal(snapshot.schemaVersion, AI_MULTI_AGENT_SCHEMA_VERSION);
  assert.equal(snapshot.managerId, "manager-integration");
  assert.equal(snapshot.totalRuns, 1);
  assert.equal(snapshot.completedRuns, 1);
  assert.equal(snapshot.rejectedRuns, 0);
  assert.equal(snapshot.failedRuns, 0);
  assert.equal(snapshot.activeRunIds.length, 0);
  assert.equal(snapshot.registrations.length, 5);
  assert.equal(snapshot.health.length, 5);
  assert.equal(snapshot.trustScores.length, 5);
  assert.equal(snapshot.recentDecisions.length, 1);
  assert.equal(snapshot.memory.length, 5);
  assert.equal(snapshot.averageCollectiveConfidence, 0.82);
  assert.equal(snapshot.averageConsensusParticipation, 1);
  assert.ok(snapshot.deterministicFingerprint.startsWith("fp:"));

  assert.equal(Object.isFrozen(outcome), true);
  assert.equal(Object.isFrozen(outcome.trace), true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.registrations), true);
  assert.equal(Object.isFrozen(snapshot.memory), true);

  console.log(
    "All AI multi-agent intelligence integration tests passed successfully.",
  );
}

function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (
      input === null ||
      typeof input === "string" ||
      typeof input === "boolean"
    ) {
      return input;
    }

    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        return String(input);
      }

      return Object.is(input, -0) ? 0 : input;
    }

    if (typeof input === "bigint") {
      return input.toString();
    }

    if (typeof input === "undefined") {
      return "__undefined__";
    }

    if (typeof input === "function" || typeof input === "symbol") {
      return String(input);
    }

    if (Array.isArray(input)) {
      return input.map(normalize);
    }

    if (typeof input === "object") {
      if (seen.has(input)) {
        throw new Error("Circular value cannot be serialized deterministically.");
      }

      seen.add(input);

      const record = input as Readonly<Record<string, unknown>>;
      const normalized: Record<string, unknown> = {};

      for (const key of Object.keys(record).sort()) {
        normalized[key] = normalize(record[key]);
      }

      seen.delete(input);
      return normalized;
    }

    return String(input);
  };

  return JSON.stringify(normalize(value));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  const object = value as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(object)) {
    deepFreeze(object[key]);
  }

  return Object.freeze(value);
}

void runIntegrationTest().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});