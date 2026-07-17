/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution Engine Integration Tests
 *
 * Run:
 *   npx tsx src/trading/order-execution-engine.test.ts
 */

import assert from "node:assert/strict";

import {
  InMemoryOrderExecutionHistoryStore,
  InMemoryOrderExecutionResultStore,
  LiveOrderExecutionEngine,
  OrderExecutionEngineError,
} from "./index";

import type {
  CancelOrderCommand,
  LiveOrderCancellationResult,
  LiveOrderCancellerContract,
  LiveOrderReconciliationResult,
  LiveOrderReconcilerContract,
  LiveOrderReplacementResult,
  LiveOrderReplacerContract,
  LiveOrderSubmissionResult,
  LiveOrderSubmitterContract,
  OrderExecutionEngineClock,
  ReconcileOrderCommand,
  ReplaceOrderCommand,
  SubmitOrderCommand,
} from "./index";

class DeterministicClock
  implements OrderExecutionEngineClock
{
  private current: number;

  public constructor(startAt = 1_000) {
    this.current = startAt;
  }

  public now(): number {
    const value = this.current;
    this.current += 1;
    return value;
  }
}

interface HandlerCall {
  readonly operation:
    | "SUBMIT"
    | "CANCEL"
    | "REPLACE"
    | "RECONCILE";
  readonly commandId: string;
}

function createSubmitCommand(
  commandId = "command-submit-1",
): SubmitOrderCommand {
  return {
    operation: "SUBMIT",
    order: {
      orderId: "order-1",
    },
    context: {
      commandId,
      correlationId: "correlation-1",
      initiatedAt: 100,
    },
  } as unknown as SubmitOrderCommand;
}

function createCancelCommand(
  commandId = "command-cancel-1",
): CancelOrderCommand {
  return {
    operation: "CANCEL",
    orderId: "order-1",
    context: {
      commandId,
      correlationId: "correlation-1",
      initiatedAt: 101,
    },
  } as unknown as CancelOrderCommand;
}

function createReplaceCommand(
  commandId = "command-replace-1",
): ReplaceOrderCommand {
  return {
    operation: "REPLACE",
    orderId: "order-1",
    context: {
      commandId,
      correlationId: "correlation-1",
      initiatedAt: 102,
    },
  } as unknown as ReplaceOrderCommand;
}

function createReconcileCommand(
  commandId = "command-reconcile-1",
): ReconcileOrderCommand {
  return {
    operation: "RECONCILE",
    orderId: "order-1",
    context: {
      commandId,
      correlationId: "correlation-1",
      initiatedAt: 103,
    },
  } as unknown as ReconcileOrderCommand;
}

function createSubmissionResult():
  LiveOrderSubmissionResult {
  return Object.freeze({
    kind: "submission-result",
  }) as unknown as LiveOrderSubmissionResult;
}

function createCancellationResult():
  LiveOrderCancellationResult {
  return Object.freeze({
    kind: "cancellation-result",
  }) as unknown as LiveOrderCancellationResult;
}

function createReplacementResult():
  LiveOrderReplacementResult {
  return Object.freeze({
    kind: "replacement-result",
  }) as unknown as LiveOrderReplacementResult;
}

function createReconciliationResult():
  LiveOrderReconciliationResult {
  return Object.freeze({
    kind: "reconciliation-result",
  }) as unknown as LiveOrderReconciliationResult;
}

async function run(): Promise<void> {
  const calls: HandlerCall[] = [];

  const submissionResult =
    createSubmissionResult();

  const cancellationResult =
    createCancellationResult();

  const replacementResult =
    createReplacementResult();

  const reconciliationResult =
    createReconciliationResult();

  const submitter:
    LiveOrderSubmitterContract = {
      async submit(
        command: SubmitOrderCommand,
      ): Promise<LiveOrderSubmissionResult> {
        calls.push({
          operation: "SUBMIT",
          commandId:
            command.context.commandId,
        });

        return submissionResult;
      },
    };

  const canceller:
    LiveOrderCancellerContract = {
      async cancel(
        command: CancelOrderCommand,
      ): Promise<LiveOrderCancellationResult> {
        calls.push({
          operation: "CANCEL",
          commandId:
            command.context.commandId,
        });

        return cancellationResult;
      },
    };

  const replacer:
    LiveOrderReplacerContract = {
      async replace(
        command: ReplaceOrderCommand,
      ): Promise<LiveOrderReplacementResult> {
        calls.push({
          operation: "REPLACE",
          commandId:
            command.context.commandId,
        });

        return replacementResult;
      },
    };

  const reconciler:
    LiveOrderReconcilerContract = {
      async reconcile(
        command: ReconcileOrderCommand,
      ): Promise<LiveOrderReconciliationResult> {
        calls.push({
          operation: "RECONCILE",
          commandId:
            command.context.commandId,
        });

        return reconciliationResult;
      },
    };

  const resultStore =
    new InMemoryOrderExecutionResultStore();

  const historyStore =
    new InMemoryOrderExecutionHistoryStore();

  const engine =
    new LiveOrderExecutionEngine(
      {
        submitter,
        canceller,
        replacer,
        reconciler,
        clock:
          new DeterministicClock(),
        resultStore,
        historyStore,
      },
      {
        enableIdempotency: true,
        serializePerOrder: true,
        recordHistory: true,
      },
    );

  assert.equal(
    engine.getState(),
    "RUNNING",
  );

  const returnedSubmission =
    await engine.submit(
      createSubmitCommand(),
    );

  assert.equal(
    returnedSubmission,
    submissionResult,
  );

  const returnedCancellation =
    await engine.cancel(
      createCancelCommand(),
    );

  assert.equal(
    returnedCancellation,
    cancellationResult,
  );

  const returnedReplacement =
    await engine.replace(
      createReplaceCommand(),
    );

  assert.equal(
    returnedReplacement,
    replacementResult,
  );

  const returnedReconciliation =
    await engine.reconcile(
      createReconcileCommand(),
    );

  assert.equal(
    returnedReconciliation,
    reconciliationResult,
  );

  assert.deepEqual(
    calls.map((call) => call.operation),
    [
      "SUBMIT",
      "CANCEL",
      "REPLACE",
      "RECONCILE",
    ],
  );

  assert.equal(
    historyStore.size,
    4,
  );

  assert.equal(
    resultStore.size,
    4,
  );

  const cachedSubmission =
    await engine.submit(
      createSubmitCommand(),
    );

  assert.equal(
    cachedSubmission,
    submissionResult,
  );

  assert.equal(
    calls.filter(
      (call) =>
        call.operation === "SUBMIT",
    ).length,
    1,
    "A repeated commandId must not execute the submitter twice.",
  );

  assert.equal(
    historyStore.size,
    4,
    "A cache hit must not create a second execution-attempt history entry.",
  );

  const metrics =
    engine.getMetrics();

  assert.equal(
    metrics.acceptedCommands,
    4,
  );

  assert.equal(
    metrics.completedCommands,
    4,
  );

  assert.equal(
    metrics.failedCommands,
    0,
  );

  assert.equal(
    metrics.cacheHits,
    1,
  );

  assert.equal(
    metrics.inFlightCommands,
    0,
  );

  assert.equal(
    metrics.inFlightOrders,
    0,
  );

  await engine.stop();

  assert.equal(
    engine.getState(),
    "STOPPED",
  );

  await assert.rejects(
    async () => {
      await engine.cancel(
        createCancelCommand(
          "command-after-stop",
        ),
      );
    },
    (error: unknown) => {
      assert.ok(
        error instanceof
          OrderExecutionEngineError,
      );

      assert.equal(
        error.code,
        "ENGINE_STOPPED",
      );

      return true;
    },
  );

  engine.start();

  assert.equal(
    engine.getState(),
    "RUNNING",
  );

  const restartedResult =
    await engine.cancel(
      createCancelCommand(
        "command-after-restart",
      ),
    );

  assert.equal(
    restartedResult,
    cancellationResult,
  );

  const restartedMetrics =
    engine.getMetrics();

  assert.equal(
    restartedMetrics.acceptedCommands,
    5,
  );

  assert.equal(
    restartedMetrics.completedCommands,
    5,
  );

  assert.equal(
    restartedMetrics.failedCommands,
    0,
  );

  console.log(
    "All live order execution engine integration tests passed successfully.",
  );
}

run().catch((error: unknown) => {
  console.error(
    "Live order execution engine integration tests failed.",
  );

  console.error(error);

  process.exitCode = 1;
});