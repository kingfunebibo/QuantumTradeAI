/**
 * QuantumTradeAI
 * Milestone 39 — Autonomous AI Trading Swarm & Distributed Cooperative Intelligence
 *
 * Deterministic end-to-end integration test for the AI trading swarm orchestrator.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  AI_TRADING_SWARM_SCHEMA_VERSION,
  DEFAULT_AI_TRADING_SWARM_CONFIGURATION,
  type AiTradingSwarmDependencies,
  type AiTradingSwarmRunRequest,
  type TradingSwarmAuthority,
  type TradingSwarmIdentity,
} from "./ai-trading-swarm/ai-trading-swarm-contracts";
import {
  createAiTradingSwarmOrchestrator,
} from "./ai-trading-swarm/ai-trading-swarm-orchestrator";
import type {
  TimestampMs,
} from "./ai-market-intelligence/ai-market-intelligence-contracts";

function timestamp(value: number): TimestampMs {
  return value as TimestampMs;
}

const BASE_TIME = timestamp(1_750_000_000_000);

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function validation<T>(value: T, valid = true) {
  const issues = valid
    ? []
    : [
        {
          path: "requestId",
          code: "INVALID",
          severity: "ERROR",
          message: "Invalid request.",
          actualValue: null,
          expected: "A valid AI trading swarm run request.",
        },
      ];

  return deepFreeze({
    valid,
    value: valid ? value : undefined,
    issues,
    errorCount: valid ? 0 : 1,
    warningCount: 0,
  }) as never;
}

const swarm: TradingSwarmIdentity = deepFreeze({
  swarmId: "swarm-integration-001",
  name: "Milestone 39 Integration Swarm",
  kind: "CROSS_FUNCTIONAL_SWARM",
  version: "1.0.0",
  description: "Deterministic integration-test swarm.",
  clusterId: "cluster-integration-001",
  criticality: "CRITICAL",
});

const authority: TradingSwarmAuthority = deepFreeze({
  level: "EXECUTION_APPROVED",
  autonomy: "SEMI_AUTONOMOUS",
  mayCreateMissions: true,
  mayDelegateTasks: true,
  mayElectLeader: true,
  mayRepartition: true,
  mayMigrateNodes: true,
  mayApproveExecution: true,
  mayExecuteTrades: true,
  mayPauseExecution: true,
  mayEscalateToOperator: true,
  maximumCapitalAuthority: 1_000_000,
  maximumRiskAuthority: 0.7,
  maximumLeverageAuthority: 3,
  restrictedActions: [],
});

const node = deepFreeze({
  identity: {
    nodeId: "node-alpha",
    swarmId: swarm.swarmId,
    name: "Alpha Node",
    role: "LEADER",
    version: "1.0.0",
    region: "integration",
  },
  capabilities: [{ capability: "COORDINATE_MULTI_AGENT_RUNS", enabled: true, proficiency: 1, confidenceFloor: 0.5, criticality: "CRITICAL" }],
  authority,
  capacity: { maximumConcurrentMissions: 8, maximumConcurrentTasks: 32, maximumAgentRuns: 32, maximumMemoryRecords: 1_000, computeUnits: 100, memoryUnits: 100, networkUnits: 100 },
  multiAgentManager: { schemaVersion: "1.0.0", managerId: "manager-alpha", lifecycleState: "READY", registeredAgents: [], activeRunCount: 0, completedRunCount: 0, failedRunCount: 0, deterministicFingerprint: "manager-fp" },
  agents: [],
  deterministic: true,
  replaySafe: true,
  registeredAtMs: BASE_TIME,
  configurationVersion: "1.0.0",
});

const health = deepFreeze({
  nodeId: node.identity.nodeId,
  lifecycleState: "READY",
  availability: "AVAILABLE",
  healthy: true,
  readinessScore: 1,
  reliabilityScore: 0.99,
  latencyScore: 0.98,
  throughputScore: 0.98,
  synchronizationScore: 1,
  dataFreshnessScore: 1,
  consensusParticipationScore: 1,
  activeMissionCount: 0,
  activeTaskCount: 0,
  activeMultiAgentRunCount: 0,
  consecutiveFailures: 0,
  lastHeartbeatAtMs: BASE_TIME,
  lastSuccessfulMissionAtMs: BASE_TIME,
  lastSynchronizedAtMs: BASE_TIME,
  warnings: [],
  errors: [],
  assessedAtMs: BASE_TIME,
});

const topology = deepFreeze({
  swarmId: swarm.swarmId,
  topology: "LEADER_FOLLOWER",
  coordinationMode: "EVENT_DRIVEN",
  leaderNodeId: node.identity.nodeId,
  nodes: [{ registration: node, health, ownedPartitionIds: ["partition-btc"], activeMissionIds: [], activeTaskIds: [], currentTerm: 1, currentEpoch: 1, stateVersion: 1, deterministicFingerprint: "node-state-fp" }],
  partitions: [],
  leases: [],
  term: 1,
  epoch: 1,
  topologyVersion: 1,
  capturedAtMs: BASE_TIME,
  deterministicFingerprint: "topology-fp",
});

const systemRisk = deepFreeze({
  assessmentId: "risk-context",
  overallRisk: 0.2,
  systemicRisk: 0.2,
  executionRisk: 0.2,
  coordinationRisk: 0.1,
  partitionRisk: 0.1,
  findings: [],
  executionAllowed: true,
  restrictions: [],
  assessedAtMs: BASE_TIME,
  deterministicFingerprint: "risk-context-fp",
});

const context = deepFreeze({
  multiAgentContext: { contextId: "multi-agent-context", builtAtMs: BASE_TIME, deterministicFingerprint: "multi-context-fp" },
  topology,
  activeMissions: [],
  recentDecisions: [],
  systemRisk,
  builtAtMs: BASE_TIME,
  deterministicFingerprint: "context-fp",
});

function createRequest(requestId = "request-integration-001"): AiTradingSwarmRunRequest {
  return deepFreeze({
    requestId,
    requestedAtMs: BASE_TIME,
    swarmId: swarm.swarmId,
    objective: "FULL_SWARM_DECISION",
    context: context as never,
    configuration: deepFreeze({
      ...DEFAULT_AI_TRADING_SWARM_CONFIGURATION,
      schemaVersion: AI_TRADING_SWARM_SCHEMA_VERSION,
      execution: { ...DEFAULT_AI_TRADING_SWARM_CONFIGURATION.execution, enabled: true, mode: "SIMULATION" },
      publishEvents: true,
    }),
    portfolioId: "portfolio-integration",
    marketIds: ["BTC-USDT"],
    strategyIds: ["strategy-momentum"],
    requiredCapabilities: ["COORDINATE_MULTI_AGENT_RUNS"],
    constraints: { maximumCapitalAtRisk: 10_000, maximumRiskScore: 0.5, maximumLeverage: 2, maximumExecutionActions: 2 },
  });
}

function createHarness(invalidRequest = false) {
  let tick = 0;
  const published: unknown[] = [];
  const persistedRuns: unknown[] = [];
  const persistedSnapshots: unknown[] = [];
  const checkpoints: unknown[] = [];

  const partition = deepFreeze({ partitionId: "partition-btc", swarmId: swarm.swarmId, type: "MARKET", key: "BTC-USDT", state: "ACTIVE", ownerNodeId: node.identity.nodeId, replicaNodeIds: [], requiredCapabilities: ["COORDINATE_MULTI_AGENT_RUNS"], weight: 1, priority: "HIGH", createdAtMs: BASE_TIME, updatedAtMs: BASE_TIME, version: 1, deterministicFingerprint: "partition-fp" });
  const lease = deepFreeze({ leaseId: "lease-btc", partitionId: partition.partitionId, ownerNodeId: node.identity.nodeId, term: 1, epoch: 1, acquiredAtMs: BASE_TIME, expiresAtMs: BASE_TIME + 60_000, fencingToken: 1, deterministicFingerprint: "lease-fp" });
  const mission = deepFreeze({ missionId: "mission-integration", swarmId: swarm.swarmId, runId: "derived-at-runtime", objective: "FULL_SWARM_DECISION", status: "PLANNING", priority: "HIGH", requestedBy: "integration-test", portfolioId: "portfolio-integration", marketIds: ["BTC-USDT"], strategyIds: ["strategy-momentum"], partitionIds: [partition.partitionId], constraints: {}, context, createdAtMs: BASE_TIME, deterministicFingerprint: "mission-fp" });
  const task = deepFreeze({ taskId: "task-local-collective", missionId: mission.missionId, runId: mission.runId, type: "RUN_MULTI_AGENT_COLLECTIVE", status: "ASSIGNED", priority: "HIGH", assignedNodeId: node.identity.nodeId, partitionId: partition.partitionId, requiredCapabilities: ["COORDINATE_MULTI_AGENT_RUNS"], dependencies: [], attempt: 1, maximumAttempts: 1, createdAtMs: BASE_TIME, assignedAtMs: BASE_TIME, inputFingerprint: "task-input-fp" });
  const assignment = deepFreeze({ task, node, lease, assignedAtMs: BASE_TIME, assignmentScore: 1, rationale: "Only healthy deterministic node.", deterministicFingerprint: "assignment-fp" });
  const localDecision = deepFreeze({ decisionId: "local-decision-001", runId: "multi-run-001", decision: "BUY", confidence: 0.86, expectedUtility: 0.72, estimatedRisk: 0.24, actions: [], restrictions: [], deterministicFingerprint: "local-decision-fp" });
  const localRun = deepFreeze({ nodeId: node.identity.nodeId, missionId: mission.missionId, taskId: task.taskId, request: { requestId: "multi-request-001" }, outcome: { runId: "multi-run-001", status: "COMPLETED", decision: localDecision }, selectedAgentIds: [], startedAtMs: BASE_TIME, completedAtMs: BASE_TIME + 1, deterministicFingerprint: "local-run-fp" });
  const contribution = deepFreeze({ nodeId: node.identity.nodeId, partitionIds: [partition.partitionId], localRunIds: ["multi-run-001"], observations: [], localDecisions: [localDecision], confidence: 0.86, utilityContribution: 0.72, riskContribution: 0.24, reliabilityScore: 0.99, submittedAtMs: BASE_TIME + 2, deterministicFingerprint: "contribution-fp" });
  const action = deepFreeze({ actionId: "action-buy-btc", type: "PLACE_ORDER", assignedNodeId: node.identity.nodeId, partitionId: partition.partitionId, marketId: "BTC-USDT", strategyId: "strategy-momentum", quantity: 0.01, notional: 500, priority: "HIGH", dependencies: [], restrictions: [] });
  const candidate = deepFreeze({ candidateId: "candidate-buy", missionId: mission.missionId, proposedByNodeId: node.identity.nodeId, sourceDecisionIds: [localDecision.decisionId], decision: "EXECUTE", actions: [action], confidence: 0.86, expectedUtility: 0.72, estimatedRisk: 0.24, partitionCoverageRatio: 1, restrictions: [], createdAtMs: BASE_TIME + 3, deterministicFingerprint: "candidate-fp" });
  const ballot = deepFreeze({ ballotId: "ballot-alpha", missionId: mission.missionId, decisionCandidateId: candidate.candidateId, nodeId: node.identity.nodeId, choice: "APPROVE", weight: 1, confidence: 0.86, riskAdjustment: 0, reliabilityAdjustment: 0, rationale: "Candidate satisfies safety constraints.", restrictions: [], castAtMs: BASE_TIME + 4, deterministicFingerprint: "ballot-fp" });
  const collectiveConfidence = deepFreeze({ rawConfidence: 0.86, nodeReliabilityAdjustment: 0.02, partitionCoverageAdjustment: 0.02, dissentAdjustment: 0, systemicRiskAdjustment: -0.04, governanceAdjustment: 0, finalConfidence: 0.86 });
  const consensus = deepFreeze({ consensusId: "consensus-001", missionId: mission.missionId, status: "CONSENSUS_REACHED", method: "RELIABILITY_WEIGHTED", selectedCandidateId: candidate.candidateId, ballots: [ballot], approvalWeight: 1, rejectionWeight: 0, abstentionWeight: 0, vetoCount: 0, participationRatio: 1, quorumSatisfied: true, partitionCoverageRatio: 1, collectiveConfidence, dissent: [], unresolvedConflictIds: [], rationale: "Unanimous healthy-node approval.", formedAtMs: BASE_TIME + 5, deterministicFingerprint: "consensus-fp" });
  const risk = deepFreeze({ ...systemRisk, assessmentId: "risk-final", deterministicFingerprint: "risk-final-fp" });
  const governance = deepFreeze({ assessmentId: "governance-001", missionId: mission.missionId, decision: "APPROVED", ruleResults: [], riskAssessment: risk, executionAuthorized: true, operatorApprovalRequired: false, restrictions: [], assessedAtMs: BASE_TIME + 6, deterministicFingerprint: "governance-fp" });
  const decision = deepFreeze({ decisionId: "decision-global-001", missionId: mission.missionId, runId: mission.runId, decision: "EXECUTE", selectedCandidateId: candidate.candidateId, actions: [action], consensus, governance, collectiveConfidence, expectedUtility: 0.72, estimatedRisk: 0.24, restrictions: [], dissent: [], decidedAtMs: BASE_TIME + 7, validUntilMs: BASE_TIME + 60_000, deterministicFingerprint: "decision-fp" });
  const executionPlan = deepFreeze({ planId: "plan-001", decisionId: decision.decisionId, missionId: mission.missionId, mode: "SIMULATION", status: "AUTHORIZED", executionAuthorized: true, steps: [{ stepId: "step-001", planId: "plan-001", sequence: 1, action, assignedNodeId: node.identity.nodeId, partitionId: partition.partitionId, timeoutMs: 10_000, maximumAttempts: 1, deterministicFingerprint: "step-fp" }], preconditions: [], monitoringRequirements: [], rollbackRequired: false, restrictions: [], createdAtMs: BASE_TIME + 8, deterministicFingerprint: "plan-fp" });
  const trust = deepFreeze({ nodeId: node.identity.nodeId, overallTrust: 0.99, reliabilityScore: 0.99, consensusIntegrityScore: 1, executionQualityScore: 1, recoveryQualityScore: 1, synchronizationScore: 1, collaborationScore: 1, governanceComplianceScore: 1, sampleSize: 1, quarantined: false, assessedAtMs: BASE_TIME });
  const explanation = deepFreeze({ explanationId: "explanation-001", decisionId: decision.decisionId, headline: "Swarm approved simulated BTC execution", summary: "The healthy leader node produced a high-confidence, low-risk candidate.", topologyNarrative: "Single healthy leader-follower test topology.", partitionNarrative: "BTC-USDT partition fully covered.", consensusNarrative: "Consensus reached without dissent.", governanceNarrative: "Governance approved execution.", executionNarrative: "Simulation plan created.", nodeContributions: [{ nodeId: node.identity.nodeId, role: "LEADER", partitionContribution: 1, evidenceContribution: 0.9, consensusContribution: 1, executionContribution: 1, finalContribution: 1, summary: "Primary deterministic contributor." }], primaryFactors: ["High confidence"], opposingFactors: [], uncertaintyFactors: [], alternativesConsidered: ["HOLD"], limitations: ["Synthetic integration fixture"], generatedAtMs: BASE_TIME + 9, modelVersion: "1.0.0" });

  const dependencies: AiTradingSwarmDependencies = {
    registry: { registerNode: () => undefined, unregisterNode: () => undefined, getNode: () => node as never, listNodes: () => [node] as never, health: () => health as never, topology: () => topology as never },
    contextBuilder: { build: () => context as never },
    leaderElection: { elect: () => deepFreeze({ electionId: "election-001", swarmId: swarm.swarmId, reason: "TERM_EXPIRED", status: "ELECTED", term: 2, candidates: [{ nodeId: node.identity.nodeId, term: 2, readinessScore: 1, reliabilityScore: 0.99, synchronizationScore: 1, leadershipScore: 0.99, eligible: true, disqualifications: [], deterministicFingerprint: "candidate-leader-fp" }], votes: [], electedNodeId: node.identity.nodeId, quorumSatisfied: true, participationRatio: 1, startedAtMs: BASE_TIME, completedAtMs: BASE_TIME + 1, deterministicFingerprint: "election-fp" }) as never },
    partitionManager: { plan: () => [partition] as never, assign: () => [lease] as never },
    missionPlanner: { plan: () => mission as never },
    taskPlanner: { create: () => [task] as never },
    taskAllocator: { assign: () => [assignment] as never },
    localCollectiveExecutor: { execute: async () => localRun as never },
    contributionAggregator: { aggregate: () => [contribution] as never },
    candidateAssembler: { assemble: () => [candidate] as never },
    consensusEngine: { form: async () => consensus as never },
    riskEngine: { assess: () => risk as never },
    governanceEngine: { evaluate: () => governance as never },
    decisionAssembler: { assemble: () => decision as never },
    executionPlanner: { plan: async () => executionPlan as never },
    recoveryManager: { plan: () => ({}) as never, recover: async () => topology as never },
    checkpointStore: { save: async (checkpoint) => { checkpoints.push(checkpoint); }, load: async () => undefined, latest: async () => undefined },
    trustEngine: { assess: () => [trust] as never, update: () => [] },
    explainabilityEngine: { explain: () => explanation as never },
    validator: {
      validateRequest: (request) => validation(request, !invalidRequest),
      validateConfiguration: (configuration) => validation(configuration),
      validateNode: (registration) => validation(registration),
      validateMission: (value) => validation(value),
      validateDecision: (value) => validation(value),
    },
    publisher: { publish: async (event) => { published.push(event); } },
    persistence: { saveRun: async (result) => { persistedRuns.push(result); }, saveSnapshot: async (snapshot) => { persistedSnapshots.push(snapshot); }, loadSnapshot: async () => undefined },
    clock: { now: () => timestamp(BASE_TIME + tick++) },
    idGenerator: { generate: (prefix, seed) => `${prefix}-${fingerprint(seed).slice(0, 16)}` },
    fingerprintGenerator: { fingerprint },
    logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
  };

  const orchestrator = createAiTradingSwarmOrchestrator(dependencies, {
    swarm,
    authority,
    initialLifecycleState: "READY",
    persistSnapshots: true,
    checkpointEverySuccessfulRun: true,
    failRunOnCheckpointError: true,
    failRunOnPublicationError: true,
    failRunOnPersistenceError: true,
  });

  return { orchestrator, published, persistedRuns, persistedSnapshots, checkpoints };
}

async function testSuccessfulEndToEndRun(): Promise<void> {
  const harness = createHarness();
  const outcome = await harness.orchestrator.run(createRequest());

  assert.equal(outcome.status, "COMPLETED");
  assert.ok("mission" in outcome);
  if (!("mission" in outcome)) return;

  assert.equal(outcome.mission.missionId, "mission-integration");
  assert.equal(outcome.assignments.length, 1);
  assert.equal(outcome.localRuns.length, 1);
  assert.equal(outcome.contributions.length, 1);
  assert.equal(outcome.candidates.length, 1);
  assert.equal(outcome.consensus.status, "CONSENSUS_REACHED");
  assert.equal(outcome.governance.decision, "APPROVED");
  assert.equal(outcome.decision.decision, "EXECUTE");
  assert.equal(outcome.decision.actions.length, 1);
  assert.equal(outcome.explanation.decisionId, outcome.decision.decisionId);
  assert.equal(harness.published.length, 1);
  assert.equal(harness.persistedRuns.length, 1);
  assert.equal(harness.persistedSnapshots.length, 1);
  assert.equal(harness.checkpoints.length, 1);
  assert.ok(Object.isFrozen(outcome));
  assert.ok(Object.isFrozen(outcome.decision));
  assert.ok(outcome.trace.completedStages.includes("DISTRIBUTED_CONSENSUS"));
  assert.ok(outcome.trace.completedStages.includes("GOVERNANCE"));
  assert.ok(outcome.trace.completedStages.includes("EXPLAINABILITY"));
}

async function testDeterministicReplay(): Promise<void> {
  const first = await createHarness().orchestrator.run(createRequest("request-replay"));
  const second = await createHarness().orchestrator.run(createRequest("request-replay"));
  assert.equal(first.status, second.status);
  assert.equal(first.runId, second.runId);
  assert.equal(first.deterministicFingerprint, second.deterministicFingerprint);
  assert.deepEqual(first.trace.completedStages, second.trace.completedStages);
}

async function testInvalidRequestRejection(): Promise<void> {
  const harness = createHarness(true);
  const outcome = await harness.orchestrator.run(createRequest("request-invalid"));
  assert.equal(outcome.status, "REJECTED");
  assert.ok("failure" in outcome);
  if (!("failure" in outcome)) return;
  assert.equal(outcome.failure.code, "REQUEST_VALIDATION_FAILED");
  assert.equal(harness.published.length, 0);
  assert.equal(harness.persistedRuns.length, 0);
}

async function testSnapshotProgression(): Promise<void> {
  const harness = createHarness();
  const before = harness.orchestrator.snapshot();
  assert.equal(before.lifecycleState, "READY");
  assert.equal(before.recentDecisions.length, 0);

  await harness.orchestrator.run(createRequest("request-snapshot"));
  const after = harness.orchestrator.snapshot();
  assert.equal(after.lifecycleState, "READY");
  assert.equal(after.recentDecisions.length, 1);
  assert.equal(after.recentDecisions[0]?.decision, "EXECUTE");
  assert.ok(Object.isFrozen(after));
}

async function main(): Promise<void> {
  await testSuccessfulEndToEndRun();
  await testDeterministicReplay();
  await testInvalidRequestRejection();
  await testSnapshotProgression();
  console.log("All AI trading swarm integration tests passed successfully.");
}

main().catch((error: unknown) => {
  console.error("AI trading swarm integration tests failed.");
  console.error(error);
  process.exitCode = 1;
});