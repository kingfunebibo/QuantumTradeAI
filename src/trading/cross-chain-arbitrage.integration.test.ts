import assert from "node:assert/strict";

import {
  DeterministicCrossChainArbitrageEngine,
} from "./cross-chain-arbitrage/cross-chain-arbitrage-engine";
import type {
  CrossChainBridgeQuoteAggregationRequest,
  CrossChainBridgeQuoteAggregationResult,
  DeterministicCrossChainBridgeQuoteAggregator,
} from "./cross-chain-arbitrage/bridge-quote-aggregator";
import type {
  CrossChainArbitrageDetectionRequest,
  CrossChainArbitrageDetectionResult,
  DetectedCrossChainArbitrageOpportunity,
  DeterministicCrossChainArbitrageOpportunityDetector,
} from "./cross-chain-arbitrage/cross-chain-opportunity-detector";
import {
  DeterministicCrossChainExecutionPlanBuilder,
  type CrossChainExecutionStepTemplate,
} from "./cross-chain-arbitrage/cross-chain-execution-plan-builder";
import type {
  CrossChainSettlementVerificationRequest,
  CrossChainSettlementVerificationResult,
  DeterministicCrossChainSettlementVerifier,
} from "./cross-chain-arbitrage/cross-chain-settlement-verifier";
import type {
  CrossChainRecoveryPlan,
  CrossChainRecoveryPlanningRequest,
  DeterministicCrossChainRecoveryPlanner,
} from "./cross-chain-arbitrage/cross-chain-recovery-planner";

const CREATED_AT = 10_000;
const QUOTED_AT = 10_100;
const DETECTED_AT = 10_200;
const PLAN_CREATED_AT = 10_300;
const FIRST_STEP_STARTED_AT = 10_400;
const FIRST_STEP_COMPLETED_AT = 10_500;
const SECOND_STEP_STARTED_AT = 10_600;
const SECOND_STEP_COMPLETED_AT = 10_700;
const SETTLED_AT = 10_800;
const RECOVERY_PLANNED_AT = 10_900;

const opportunity: DetectedCrossChainArbitrageOpportunity =
  Object.freeze({
    opportunityId: "opportunity-001",
    quoteId: "quote-001",
    bridgeId: "bridge-001",
    requestId: "request-001",
    sourceValueUsd: "1000",
    destinationValueUsd: "1030",
    grossProfitUsd: "30",
    totalCostUsd: "5",
    netProfitUsd: "25",
    netProfitPercentage: 2.5,
    estimatedLatencyMilliseconds: 2_000,
    observedAt: QUOTED_AT,
    expiresAt: 20_000,
    remainingLifetimeMilliseconds:
      20_000 - DETECTED_AT,
    quoteCompositeScore: 1,
    status: "ACTIONABLE",
    rejectionReasons: Object.freeze([]),
  });

const aggregationResult =
  Object.freeze({
    request: Object.freeze({
      requestId: "request-001",
    }),
    generatedAt: QUOTED_AT,
    receivedQuoteCount: 1,
    acceptedQuoteCount: 1,
    rejectedQuoteCount: 0,
    entries: Object.freeze([]),
    bestQuote: null,
    rejectionCounts: Object.freeze({}),
  }) as unknown as CrossChainBridgeQuoteAggregationResult;

const detectionResult:
  CrossChainArbitrageDetectionResult =
  Object.freeze({
    requestId: "request-001",
    generatedAt: DETECTED_AT,
    evaluatedQuoteCount: 1,
    actionableOpportunityCount: 1,
    rejectedOpportunityCount: 0,
    opportunities: Object.freeze([
      opportunity,
    ]),
    bestOpportunity: opportunity,
    rejectionCounts: Object.freeze({}),
  });

function createSettlementResult(
  status:
    CrossChainSettlementVerificationResult["status"],
  verifiedAt: number,
): CrossChainSettlementVerificationResult {
  return Object.freeze({
    verificationId:
      `verification:${verifiedAt}`,
    planId:
      "plan-opportunity-001",
    opportunityId:
      opportunity.opportunityId,
    verifiedAt,
    status,
    transactionResults: Object.freeze([]),
    balanceResults: Object.freeze([]),
    reasons: Object.freeze(
      status === "VERIFIED"
        ? []
        : ["SETTLEMENT_NOT_VERIFIED"],
    ),
    metadata: Object.freeze({}),
  });
}

function createRecoveryPlan(
  createdAt: number,
): CrossChainRecoveryPlan {
  return Object.freeze({
    recoveryPlanId:
      `recovery:${createdAt}`,
    executionPlanId:
      "plan-opportunity-001",
    opportunityId:
      opportunity.opportunityId,
    bridgeId: opportunity.bridgeId,
    createdAt,
    status: "ACTION_REQUIRED",
    actions: Object.freeze([
      Object.freeze({
        actionId: "recovery-action-001",
        sequence: 1,
        actionType: "RETRY_STEP",
        stepId:
          "plan-opportunity-001:002:SETTLEMENT_VERIFICATION",
        earliestExecutionAt: createdAt,
        reasonCode: "RETRYABLE_STEP_FAILURE",
        description:
          "Retry the failed settlement verification step.",
        requiresManualApproval: false,
        metadata: Object.freeze({}),
      }),
    ]),
    reasons: Object.freeze([
      "RETRYABLE_STEP_FAILURE",
    ]),
    metadata: Object.freeze({}),
  });
}

function createEngine(): DeterministicCrossChainArbitrageEngine {
  const quoteAggregator = {
    aggregate: (
      _request:
        CrossChainBridgeQuoteAggregationRequest,
    ) => aggregationResult,
  } as unknown as DeterministicCrossChainBridgeQuoteAggregator;

  const opportunityDetector = {
    detect: (
      _request:
        CrossChainArbitrageDetectionRequest,
    ) => detectionResult,
  } as unknown as DeterministicCrossChainArbitrageOpportunityDetector;

  const executionPlanBuilder =
    new DeterministicCrossChainExecutionPlanBuilder({
      planIdFactory: () =>
        "plan-opportunity-001",
      stepIdFactory: (
        planId,
        sequence,
        template,
      ) =>
        [
          planId,
          sequence.toString().padStart(3, "0"),
          template.stepType,
        ].join(":"),
      requireSettlementVerification: true,
    });

  const settlementVerifier = {
    verify: (
      request:
        CrossChainSettlementVerificationRequest,
    ) =>
      createSettlementResult(
        request.runtime.status === "COMPLETED"
          ? "VERIFIED"
          : "RUNTIME_NOT_COMPLETED",
        request.verifiedAt,
      ),
  } as unknown as DeterministicCrossChainSettlementVerifier;

  const recoveryPlanner = {
    plan: (
      request: CrossChainRecoveryPlanningRequest,
    ) =>
      createRecoveryPlan(request.plannedAt),
  } as unknown as DeterministicCrossChainRecoveryPlanner;

  return new DeterministicCrossChainArbitrageEngine({
    quoteAggregator,
    opportunityDetector,
    executionPlanBuilder,
    settlementVerifier,
    recoveryPlanner,
    sessionIdFactory: (createdAt) =>
      `integration-session:${createdAt}`,
  });
}

const stepTemplates:
  readonly CrossChainExecutionStepTemplate[] =
  Object.freeze([
    Object.freeze({
      stepType: "BRIDGE_TRANSFER",
      networkId: "ethereum",
      providerId: "bridge-001",
      inputAssetId: "USDC-ETHEREUM",
      outputAssetId: "USDC-ARBITRUM",
      inputAmountAtomic: "1000000000",
      minimumOutputAmountAtomic: "995000000",
      estimatedFeeUsd: "4",
      estimatedDurationMilliseconds: 1_500,
      requiresConfirmation: true,
      metadata: Object.freeze({
        sourceChainId: "ethereum",
        destinationChainId: "arbitrum",
      }),
    }),
    Object.freeze({
      stepType:
        "SETTLEMENT_VERIFICATION",
      networkId: "arbitrum",
      providerId: null,
      inputAssetId: "USDC-ARBITRUM",
      outputAssetId: "USDC-ARBITRUM",
      inputAmountAtomic: "995000000",
      minimumOutputAmountAtomic:
        "995000000",
      estimatedFeeUsd: "1",
      estimatedDurationMilliseconds: 500,
      requiresConfirmation: true,
      metadata: Object.freeze({}),
    }),
  ]);

function prepareExecution():
  DeterministicCrossChainArbitrageEngine {
  const engine = createEngine();

  engine.createSession({
    createdAt: CREATED_AT,
    metadata: {
      scenario: "successful-settlement",
    },
  });

  engine.aggregateQuotes(
    {} as CrossChainBridgeQuoteAggregationRequest,
  );

  engine.detectOpportunities({
    now: DETECTED_AT,
  });

  engine.buildExecutionPlan({
    createdAt: PLAN_CREATED_AT,
    stepTemplates,
  });

  return engine;
}

function testSuccessfulEndToEndWorkflow(): void {
  const engine = prepareExecution();

  let session = engine.session;
  assert.ok(session !== null);
  assert.equal(session.status, "PLAN_BUILT");
  assert.equal(
    session.executionPlan?.planId,
    "plan-opportunity-001",
  );
  assert.equal(
    session.executionPlan?.steps.length,
    2,
  );

  const machine = engine.executionMachine();
  const firstStep =
    machine.runtime.steps[0].step;
  const secondStep =
    machine.runtime.steps[1].step;

  machine.startStep({
    stepId: firstStep.stepId,
    startedAt: FIRST_STEP_STARTED_AT,
  });

  machine.completeStep({
    stepId: firstStep.stepId,
    completedAt: FIRST_STEP_COMPLETED_AT,
    executionReference: "tx-source-001",
  });

  machine.startStep({
    stepId: secondStep.stepId,
    startedAt: SECOND_STEP_STARTED_AT,
  });

  machine.completeStep({
    stepId: secondStep.stepId,
    completedAt: SECOND_STEP_COMPLETED_AT,
    executionReference:
      "settlement-check-001",
  });

  session = engine.updateExecutionRuntime(
    SECOND_STEP_COMPLETED_AT,
  );

  assert.equal(
    session.status,
    "EXECUTION_COMPLETED",
  );
  assert.equal(
    session.executionRuntime?.status,
    "COMPLETED",
  );

  session = engine.verifySettlement({
    transactions: Object.freeze([]),
    balances: Object.freeze([]),
    verifiedAt: SETTLED_AT,
    policy: Object.freeze({
      requiredConfirmations: 1,
    }),
  });

  assert.equal(
    session.status,
    "SETTLEMENT_VERIFIED",
  );
  assert.equal(
    session.settlement?.status,
    "VERIFIED",
  );

  const snapshot = engine.snapshot();
  const restoredEngine = createEngine();
  const restored =
    restoredEngine.restore(snapshot);

  assert.deepEqual(restored, session);
  assert.deepEqual(
    restoredEngine.snapshot(),
    snapshot,
  );

  const closed =
    restoredEngine.close(SETTLED_AT + 1);

  assert.equal(closed.status, "CLOSED");
}

function testFailedExecutionProducesRecoveryPlan(): void {
  const engine = prepareExecution();
  const machine = engine.executionMachine();

  const firstStep =
    machine.runtime.steps[0].step;

  machine.startStep({
    stepId: firstStep.stepId,
    startedAt: FIRST_STEP_STARTED_AT,
  });

  machine.failStep({
    stepId: firstStep.stepId,
    failedAt: FIRST_STEP_COMPLETED_AT,
    failureCode: "BRIDGE_TIMEOUT",
    failureMessage:
      "Bridge transfer timed out.",
    executionReference: "tx-failed-001",
  });

  let session = engine.updateExecutionRuntime(
    FIRST_STEP_COMPLETED_AT,
  );

  assert.equal(
    session.status,
    "RECOVERY_REQUIRED",
  );
  assert.equal(
    session.executionRuntime?.status,
    "FAILED",
  );

  session = engine.planRecovery({
    plannedAt: RECOVERY_PLANNED_AT,
    policy: Object.freeze({
      currentRetryCount: 0,
    }),
    metadata: Object.freeze({
      scenario: "bridge-timeout",
    }),
  });

  assert.equal(
    session.status,
    "RECOVERY_REQUIRED",
  );
  assert.equal(
    session.recoveryPlan?.status,
    "ACTION_REQUIRED",
  );
  assert.equal(
    session.recoveryPlan?.actions[0]
      .actionType,
    "RETRY_STEP",
  );
}

function testWorkflowIsDeterministic(): void {
  const first = prepareExecution().snapshot();
  const second = prepareExecution().snapshot();

  assert.deepEqual(first, second);
}

function run(): void {
  testSuccessfulEndToEndWorkflow();
  testFailedExecutionProducesRecoveryPlan();
  testWorkflowIsDeterministic();

  console.log(
    "All cross-chain arbitrage integration tests passed successfully.",
  );
}

run();