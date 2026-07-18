/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic integration coverage for:
 * - execution state transitions
 * - submitted transaction monitoring
 * - confirmed receipt reconciliation
 * - underpriced transaction replacement recovery
 * - bounded transient retry planning
 *
 * Run with:
 *   npx tsx src/trading/cross-dex-arbitrage.integration.test.ts
 */

import assert from "node:assert/strict";

import {
  ArbitrageExecutionStatus,
  type ArbitrageExecution,
  type ArbitrageExecutionId,
  type ArbitrageOpportunityId,
  type BlockHash,
  type BlockNumber,
  type ChainId,
  type EvmAddress,
  type EvmTransactionReceipt,
  type ExecutionTrackingSnapshot,
  type GasAmount,
  type TransactionHash,
  type UnixTimestampMilliseconds,
  type WeiAmount,
} from "./cross-dex-arbitrage/cross-dex-arbitrage-contracts";
import {
  createExecutionStateMachine,
  type ExecutionStateMachineClock,
} from "./cross-dex-arbitrage/execution-state-machine";
import {
  createExecutionMonitor,
  type ExecutionMonitorClock,
  type ExecutionReceiptProvider,
} from "./cross-dex-arbitrage/execution-monitor";
import {
  createExecutionRecoveryManager,
  ExecutionRecoveryAction,
  ExecutionRecoveryClassification,
  type ExecutionRecoveryActionExecutor,
  type ExecutionRecoveryActionResult,
  type ExecutionRecoveryClock,
  type ExecutionRecoveryNonceProvider,
  type ExecutionRecoveryPlan,
  type ExecutionRecoveryReceiptProvider,
} from "./cross-dex-arbitrage/execution-recovery-manager";

function asBrand<T>(value: unknown): T {
  return value as T;
}

class DeterministicClock
  implements
    ExecutionStateMachineClock,
    ExecutionMonitorClock,
    ExecutionRecoveryClock
{
  public constructor(
    private currentMilliseconds: number,
  ) {}

  public nowMilliseconds(): UnixTimestampMilliseconds {
    return asBrand<UnixTimestampMilliseconds>(
      this.currentMilliseconds,
    );
  }

  public advance(milliseconds: number): void {
    this.currentMilliseconds += milliseconds;
  }
}

function createExecution(
  status: ArbitrageExecutionStatus,
  transactionHash?: TransactionHash,
): ArbitrageExecution {
  const createdAt = asBrand<UnixTimestampMilliseconds>(
    1_700_000_000_000,
  );

  const execution = {
    id: asBrand<ArbitrageExecutionId>(
      `execution-${status.toLowerCase()}`,
    ),
    opportunityId: asBrand<ArbitrageOpportunityId>(
      "opportunity-integration-001",
    ),
    chainId: asBrand<ChainId>(1),
    request: {
      executionId: asBrand<ArbitrageExecutionId>(
        `execution-${status.toLowerCase()}`,
      ),
      deadlineMilliseconds:
        asBrand<UnixTimestampMilliseconds>(
          1_700_000_300_000,
        ),
    },
    status,
    submission:
      transactionHash === undefined
        ? undefined
        : {
            submissionId: "submission-integration-001",
            mode: "PUBLIC",
            accepted: true,
            transactionHash,
            submittedAtMilliseconds:
              asBrand<UnixTimestampMilliseconds>(
                1_700_000_001_000,
              ),
          },
    validationIssues: Object.freeze([]),
    createdAtMilliseconds: createdAt,
    updatedAtMilliseconds: createdAt,
    submittedAtMilliseconds:
      transactionHash === undefined
        ? undefined
        : asBrand<UnixTimestampMilliseconds>(
            1_700_000_001_000,
          ),
    metadata: Object.freeze({
      testSuite: "cross-dex-arbitrage.integration",
    }),
  };

  return Object.freeze(
    execution,
  ) as unknown as ArbitrageExecution;
}

function createConfirmedReceipt(
  transactionHash: TransactionHash,
): EvmTransactionReceipt {
  return Object.freeze({
    chainId: asBrand<ChainId>(1),
    transactionHash,
    blockNumber: asBrand<BlockNumber>(19_000_100n),
    blockHash: asBrand<BlockHash>(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ),
    from: asBrand<EvmAddress>(
      "0x1111111111111111111111111111111111111111",
    ),
    to: asBrand<EvmAddress>(
      "0x2222222222222222222222222222222222222222",
    ),
    transactionIndex: 0,
    status: true,
    gasUsed: asBrand<GasAmount>(350_000n),
    effectiveGasPriceWei: asBrand<WeiAmount>(
      25_000_000_000n,
    ),
    logs: Object.freeze([]),
    metadata: Object.freeze({
      source: "deterministic-integration-test",
    }),
  });
}

async function testSubmittedExecutionMonitoring(): Promise<void> {
  const transactionHash = asBrand<TransactionHash>(
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );
  const clock = new DeterministicClock(
    1_700_000_002_000,
  );
  const execution = createExecution(
    ArbitrageExecutionStatus.SUBMITTED,
    transactionHash,
  );
  const stateMachine = createExecutionStateMachine(
    execution,
    clock,
  );

  const tracker = {
    async track(
      trackedExecution: ArbitrageExecution,
    ): Promise<ExecutionTrackingSnapshot> {
      assert.equal(trackedExecution.id, execution.id);

      return Object.freeze({
        executionId: trackedExecution.id,
        status: ArbitrageExecutionStatus.CONFIRMED,
        transactionHash,
        currentBlockNumber:
          asBrand<BlockNumber>(19_000_101n),
        submissionBlockNumber:
          asBrand<BlockNumber>(19_000_100n),
        confirmationCount: 2,
        replacementCount: 0,
        lastCheckedAtMilliseconds:
          clock.nowMilliseconds(),
      });
    },
  };

  const receipt = createConfirmedReceipt(transactionHash);

  const receiptProvider: ExecutionReceiptProvider = {
    async getReceipt(
      requestedHash: TransactionHash,
    ): Promise<EvmTransactionReceipt | undefined> {
      assert.equal(requestedHash, transactionHash);
      return receipt;
    },
  };

  const monitor = createExecutionMonitor(
    tracker,
    receiptProvider,
    clock,
    {
      requiredConfirmationCount: 2,
      maximumPollCount: 5,
      maximumMonitoringDurationMilliseconds: 60_000,
      requireReceiptForConfirmation: true,
    },
  );

  const observation = await monitor.poll({
    stateMachine,
    pollNumber: 1,
    startedAtMilliseconds:
      asBrand<UnixTimestampMilliseconds>(
        1_700_000_001_500,
      ),
  });

  assert.equal(
    observation.resultingStatus,
    ArbitrageExecutionStatus.CONFIRMED,
  );
  assert.equal(observation.terminal, true);
  assert.equal(
    observation.receipt?.transactionHash,
    transactionHash,
  );
  assert.equal(
    stateMachine.getStatus(),
    ArbitrageExecutionStatus.CONFIRMED,
  );
  assert.equal(stateMachine.isTerminal(), true);
  assert.equal(
    stateMachine.getSnapshot().transitionHistory.length,
    1,
  );
}

async function testUnderpricedReplacementRecovery(): Promise<void> {
  const originalHash = asBrand<TransactionHash>(
    "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  );
  const replacementHash = asBrand<TransactionHash>(
    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  );
  const clock = new DeterministicClock(
    1_700_000_010_000,
  );
  const execution = createExecution(
    ArbitrageExecutionStatus.SUBMITTED,
    originalHash,
  );
  const stateMachine = createExecutionStateMachine(
    execution,
    clock,
  );

  const nonceProvider: ExecutionRecoveryNonceProvider = {
    async getPendingNonce(): Promise<number> {
      return 7;
    },
  };

  const receiptProvider: ExecutionRecoveryReceiptProvider = {
    async getReceipt(): Promise<
      EvmTransactionReceipt | undefined
    > {
      return undefined;
    },
  };

  const actionExecutor: ExecutionRecoveryActionExecutor = {
    async retrySubmission(
      _execution: ArbitrageExecution,
      plan: ExecutionRecoveryPlan,
    ): Promise<ExecutionRecoveryActionResult> {
      return Object.freeze({
        success: true,
        action: plan.action,
        transactionHash: originalHash,
      });
    },

    async replaceTransaction(
      replacedExecution: ArbitrageExecution,
      plan: ExecutionRecoveryPlan,
    ): Promise<ExecutionRecoveryActionResult> {
      assert.equal(replacedExecution.id, execution.id);
      assert.equal(
        plan.action,
        ExecutionRecoveryAction.REPLACE_TRANSACTION,
      );
      assert.equal(plan.gasBumpBasisPoints, 1_250);

      return Object.freeze({
        success: true,
        action: plan.action,
        transactionHash: originalHash,
        replacementTransactionHash: replacementHash,
        metadata: Object.freeze({
          replacementAccepted: true,
        }),
      });
    },

    async resimulate(
      _execution: ArbitrageExecution,
      plan: ExecutionRecoveryPlan,
    ): Promise<ExecutionRecoveryActionResult> {
      return Object.freeze({
        success: true,
        action: plan.action,
      });
    },

    async rebuildRoute(
      _execution: ArbitrageExecution,
      plan: ExecutionRecoveryPlan,
    ): Promise<ExecutionRecoveryActionResult> {
      return Object.freeze({
        success: true,
        action: plan.action,
      });
    },

    async reconcile(
      _execution: ArbitrageExecution,
      plan: ExecutionRecoveryPlan,
    ): Promise<ExecutionRecoveryActionResult> {
      return Object.freeze({
        success: true,
        action: plan.action,
      });
    },
  };

  const recoveryManager = createExecutionRecoveryManager(
    clock,
    nonceProvider,
    receiptProvider,
    actionExecutor,
    {
      maximumRetryCount: 3,
      maximumReplacementCount: 2,
      replacementGasBumpBasisPoints: 1_250,
      minimumReplacementGasBumpBasisPoints: 1_000,
    },
  );

  const plan = recoveryManager.plan(
    execution,
    {
      retryCount: 0,
      replacementCount: 0,
      lastErrorCode:
        "REPLACEMENT_TRANSACTION_UNDERPRICED",
      lastErrorMessage:
        "replacement transaction underpriced",
      transactionHash: originalHash,
      profitabilityStillValid: true,
      routeStillValid: true,
    },
    clock.nowMilliseconds(),
  );

  assert.equal(
    plan.classification,
    ExecutionRecoveryClassification.UNDERPRICED,
  );
  assert.equal(
    plan.action,
    ExecutionRecoveryAction.REPLACE_TRANSACTION,
  );
  assert.equal(plan.recoverable, true);
  assert.equal(plan.gasBumpBasisPoints, 1_250);

  const result = await recoveryManager.recover({
    stateMachine,
    context: {
      retryCount: 0,
      replacementCount: 0,
      lastErrorCode:
        "REPLACEMENT_TRANSACTION_UNDERPRICED",
      lastErrorMessage:
        "replacement transaction underpriced",
      transactionHash: originalHash,
      profitabilityStillValid: true,
      routeStillValid: true,
    },
    requestedAtMilliseconds:
      clock.nowMilliseconds(),
  });

  assert.equal(result.recovered, true);
  assert.equal(
    result.plan.action,
    ExecutionRecoveryAction.REPLACE_TRANSACTION,
  );
  assert.equal(
    result.actionResult?.replacementTransactionHash,
    replacementHash,
  );
  assert.equal(
    stateMachine.getStatus(),
    ArbitrageExecutionStatus.REPLACED,
  );
  assert.equal(
    recoveryManager.getHistory().length,
    1,
  );
  assert.equal(
    recoveryManager.getHistory()[0]?.success,
    true,
  );
}

async function testTransientRetryPlanning(): Promise<void> {
  const transactionHash = asBrand<TransactionHash>(
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  );
  const clock = new DeterministicClock(
    1_700_000_020_000,
  );
  const execution = createExecution(
    ArbitrageExecutionStatus.SUBMITTED,
    transactionHash,
  );

  const recoveryManager = createExecutionRecoveryManager(
    clock,
    {
      async getPendingNonce(): Promise<number> {
        return 8;
      },
    },
    {
      async getReceipt(): Promise<
        EvmTransactionReceipt | undefined
      > {
        return undefined;
      },
    },
    {
      async retrySubmission(
        _execution: ArbitrageExecution,
        plan: ExecutionRecoveryPlan,
      ): Promise<ExecutionRecoveryActionResult> {
        return Object.freeze({
          success: true,
          action: plan.action,
          transactionHash,
        });
      },
      async replaceTransaction(
        _execution: ArbitrageExecution,
        plan: ExecutionRecoveryPlan,
      ): Promise<ExecutionRecoveryActionResult> {
        return Object.freeze({
          success: true,
          action: plan.action,
          replacementTransactionHash:
            transactionHash,
        });
      },
      async resimulate(
        _execution: ArbitrageExecution,
        plan: ExecutionRecoveryPlan,
      ): Promise<ExecutionRecoveryActionResult> {
        return Object.freeze({
          success: true,
          action: plan.action,
        });
      },
      async rebuildRoute(
        _execution: ArbitrageExecution,
        plan: ExecutionRecoveryPlan,
      ): Promise<ExecutionRecoveryActionResult> {
        return Object.freeze({
          success: true,
          action: plan.action,
        });
      },
      async reconcile(
        _execution: ArbitrageExecution,
        plan: ExecutionRecoveryPlan,
      ): Promise<ExecutionRecoveryActionResult> {
        return Object.freeze({
          success: true,
          action: plan.action,
        });
      },
    },
    {
      baseRetryDelayMilliseconds: 1_000,
      maximumRetryDelayMilliseconds: 10_000,
      retryBackoffMultiplier: 2,
      maximumRetryCount: 3,
    },
  );

  const firstRetryPlan = recoveryManager.plan(
    execution,
    {
      retryCount: 0,
      replacementCount: 0,
      lastErrorMessage:
        "RPC service temporarily unavailable",
      transactionHash,
    },
    clock.nowMilliseconds(),
  );

  const secondRetryPlan = recoveryManager.plan(
    execution,
    {
      retryCount: 1,
      replacementCount: 0,
      lastErrorMessage:
        "RPC service temporarily unavailable",
      transactionHash,
    },
    clock.nowMilliseconds(),
  );

  assert.equal(
    firstRetryPlan.classification,
    ExecutionRecoveryClassification.RPC_TRANSIENT,
  );
  assert.equal(
    firstRetryPlan.action,
    ExecutionRecoveryAction.RETRY_SUBMISSION,
  );
  assert.equal(
    firstRetryPlan.retryAfterMilliseconds,
    1_000,
  );
  assert.equal(
    secondRetryPlan.retryAfterMilliseconds,
    2_000,
  );
}

async function run(): Promise<void> {
  await testSubmittedExecutionMonitoring();
  await testUnderpricedReplacementRecovery();
  await testTransientRetryPlanning();

  console.log(
    "All cross-DEX arbitrage integration tests passed successfully.",
  );
}

void run().catch((error: unknown) => {
  console.error(
    "Cross-DEX arbitrage integration tests failed.",
  );
  console.error(error);
  process.exitCode = 1;
});