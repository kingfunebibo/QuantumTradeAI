import assert from "node:assert/strict";

import {
  CoordinatedExecutionAggregator,
} from "./multi-exchange-coordination/coordinated-execution-aggregator";
import {
  CoordinatedExecutionEngine,
  type CoordinatedExecutionPlanSource,
} from "./multi-exchange-coordination/coordinated-execution-engine";
import {
  createCoordinatorExchangeExecutionResponse,
  type CoordinatorExchangeExecutionClient,
  type CoordinatorExchangeExecutionCommand,
  type CoordinatorExchangeExecutionResponse,
} from "./multi-exchange-coordination/coordinated-execution-contracts";
import {
  CoordinatorExchangeExecutionCommandMapper,
} from "./multi-exchange-coordination/exchange-execution-command-mapper";
import {
  CoordinatorExchangeExecutionDispatcher,
  type CoordinatorExecutionDispatcherClock,
} from "./multi-exchange-coordination/exchange-execution-dispatcher";
import {
  InMemoryCoordinatorExchangeExecutionClientRegistry,
} from "./multi-exchange-coordination/exchange-execution-client-registry";

class DeterministicExecutionClock
  implements CoordinatorExecutionDispatcherClock
{
  private currentTimestamp: number;

  public constructor(
    initialTimestamp: number,
    private readonly increment: number = 1,
  ) {
    this.currentTimestamp = initialTimestamp;
  }

  public now(): number {
    const timestamp = this.currentTimestamp;

    this.currentTimestamp += this.increment;

    return timestamp;
  }
}

class StubExecutionClient
  implements CoordinatorExchangeExecutionClient
{
  public readonly receivedCommands:
    CoordinatorExchangeExecutionCommand[] = [];

  public constructor(
    public readonly exchangeId: string,
    private readonly handler: (
      command: CoordinatorExchangeExecutionCommand,
    ) =>
      | CoordinatorExchangeExecutionResponse
      | Promise<CoordinatorExchangeExecutionResponse>,
  ) {}

  public async submit(
    command: CoordinatorExchangeExecutionCommand,
  ): Promise<CoordinatorExchangeExecutionResponse> {
    this.receivedCommands.push(command);

    return this.handler(command);
  }
}

function createAcceptedResponse(
  command: CoordinatorExchangeExecutionCommand,
  options: {
    readonly filledQuantity?: number;
    readonly averageFillPrice?: number | null;
    readonly exchangeOrderId?: string;
  } = {},
): CoordinatorExchangeExecutionResponse {
  const filledQuantity =
    options.filledQuantity ?? command.quantity;

  const status =
    filledQuantity >= command.quantity
      ? "FILLED"
      : filledQuantity > 0
        ? "PARTIALLY_FILLED"
        : "ACCEPTED";

  return createCoordinatorExchangeExecutionResponse({
    exchangeId: command.exchangeId,
    accountId: command.accountId,
    instructionId: command.instructionId,

    clientOrderId: command.clientOrderId,
    exchangeOrderId:
      options.exchangeOrderId ??
      `${command.exchangeId}-order-001`,

    status,

    requestedQuantity: command.quantity,
    acceptedQuantity: command.quantity,
    filledQuantity,
    remainingQuantity: Math.max(
      0,
      command.quantity - filledQuantity,
    ),

    averageFillPrice:
      filledQuantity > 0
        ? options.averageFillPrice ?? command.price
        : null,

    submittedAt: 1_000_001,
    acceptedAt: 1_000_002,
    completedAt:
      status === "FILLED"
        ? 1_000_003
        : null,

    failure: null,
    metadata: Object.freeze({
      source: "stub-client",
    }),
  });
}

function createRejectedResponse(
  command: CoordinatorExchangeExecutionCommand,
): CoordinatorExchangeExecutionResponse {
  return createCoordinatorExchangeExecutionResponse({
    exchangeId: command.exchangeId,
    accountId: command.accountId,
    instructionId: command.instructionId,

    clientOrderId: command.clientOrderId,
    exchangeOrderId: null,

    status: "REJECTED",

    requestedQuantity: command.quantity,
    acceptedQuantity: 0,
    filledQuantity: 0,
    remainingQuantity: command.quantity,
    averageFillPrice: null,

    submittedAt: 1_000_001,
    acceptedAt: null,
    completedAt: 1_000_002,

    failure: Object.freeze({
      code: "EXCHANGE_REJECTED_ORDER",
      message:
        `Exchange ${command.exchangeId} rejected the order.`,
      retryable: false,
      exchangeId: command.exchangeId,
      instructionId: command.instructionId,
      occurredAt: 1_000_002,
      cause: null,
      metadata: Object.freeze({}),
    }),

    metadata: Object.freeze({
      source: "stub-client",
    }),
  });
}

function createPlan(
  overrides: Partial<CoordinatedExecutionPlanSource> = {},
): CoordinatedExecutionPlanSource {
  return Object.freeze({
    planId: "phase-3-plan-001",
    requestId: "phase-3-request-001",
    executionId: "phase-3-execution-001",

    requestedQuantity: 10,

    symbol: "BTC-USDT",
    side: "BUY",
    orderType: "LIMIT",

    instructions: Object.freeze([
      Object.freeze({
        instructionId: "instruction-binance-001",
        exchangeId: "BINANCE",
        accountId: "binance-account",
        exchangeSymbol: "BTCUSDT",

        quantity: 6,
        price: 50_000,
        stopPrice: null,
        timeInForce: "GTC",

        reduceOnly: false,
        postOnly: false,
        clientOrderId:
          "coordinator-binance-order-001",

        metadata: Object.freeze({
          allocationIndex: 0,
        }),
      }),
      Object.freeze({
        instructionId: "instruction-okx-001",
        exchangeId: "OKX",
        accountId: "okx-account",
        exchangeSymbol: "BTC-USDT",

        quantity: 4,
        price: 50_100,
        stopPrice: null,
        timeInForce: "GTC",

        reduceOnly: false,
        postOnly: false,
        clientOrderId:
          "coordinator-okx-order-001",

        metadata: Object.freeze({
          allocationIndex: 1,
        }),
      }),
    ]),

    createdAt: 1_000_000,
    expiresAt: null,

    metadata: Object.freeze({
      phase: 3,
    }),

    ...overrides,
  });
}

function createEngine(
  clients:
    readonly CoordinatorExchangeExecutionClient[],
  clock:
    CoordinatorExecutionDispatcherClock =
      new DeterministicExecutionClock(
        2_000_000,
      ),
): CoordinatedExecutionEngine {
  const registry =
    new InMemoryCoordinatorExchangeExecutionClientRegistry(
      clients,
    );

  const mapper =
    new CoordinatorExchangeExecutionCommandMapper();

  const dispatcher =
    new CoordinatorExchangeExecutionDispatcher(
      registry,
      clock,
    );

  const aggregator =
    new CoordinatedExecutionAggregator();

  return new CoordinatedExecutionEngine(
    mapper,
    dispatcher,
    aggregator,
    clock,
  );
}

async function testSuccessfulMultiExchangeExecution():
  Promise<void> {
  const binanceClient =
    new StubExecutionClient(
      "BINANCE",
      (command) =>
        createAcceptedResponse(
          command,
          {
            averageFillPrice: 50_000,
            exchangeOrderId:
              "binance-exchange-order-001",
          },
        ),
    );

  const okxClient =
    new StubExecutionClient(
      "OKX",
      (command) =>
        createAcceptedResponse(
          command,
          {
            averageFillPrice: 50_100,
            exchangeOrderId:
              "okx-exchange-order-001",
          },
        ),
    );

  const engine = createEngine([
    binanceClient,
    okxClient,
  ]);

  const result = await engine.execute({
    plan: createPlan(),
    options: {
      allowPartialExecution: true,
      maximumConcurrency: 2,
    },
  });

  assert.equal(
    result.status,
    "FILLED",
  );

  assert.equal(
    result.requestedQuantity,
    10,
  );

  assert.equal(
    result.dispatchedQuantity,
    10,
  );

  assert.equal(
    result.acceptedQuantity,
    10,
  );

  assert.equal(
    result.filledQuantity,
    10,
  );

  assert.equal(
    result.remainingQuantity,
    0,
  );

  assert.equal(
    result.averageFillPrice,
    50_040,
  );

  assert.deepEqual(
    result.successfulExchangeIds,
    ["BINANCE", "OKX"],
  );

  assert.deepEqual(
    result.failedExchangeIds,
    [],
  );

  assert.deepEqual(
    result.skippedExchangeIds,
    [],
  );

  assert.equal(
    result.attempts.length,
    2,
  );

  assert.equal(
    result.failure,
    null,
  );

  assert.equal(
    binanceClient.receivedCommands.length,
    1,
  );

  assert.equal(
    okxClient.receivedCommands.length,
    1,
  );

  assert.equal(
    binanceClient.receivedCommands[0]
      ?.exchangeSymbol,
    "BTCUSDT",
  );

  assert.equal(
    okxClient.receivedCommands[0]
      ?.exchangeSymbol,
    "BTC-USDT",
  );

  assert.equal(
    Object.isFrozen(result),
    true,
  );

  assert.equal(
    Object.isFrozen(result.attempts),
    true,
  );
}

async function testMissingExchangeClient():
  Promise<void> {
  const binanceClient =
    new StubExecutionClient(
      "BINANCE",
      (command) =>
        createAcceptedResponse(command),
    );

  const engine = createEngine([
    binanceClient,
  ]);

  const result = await engine.execute({
    plan: createPlan(),
    options: {
      allowPartialExecution: true,
      maximumConcurrency: 2,
    },
  });

  assert.equal(
    result.status,
    "PARTIALLY_FAILED",
  );

  assert.equal(
    result.acceptedQuantity,
    6,
  );

  assert.equal(
    result.filledQuantity,
    6,
  );

  assert.equal(
    result.remainingQuantity,
    4,
  );

  assert.deepEqual(
    result.successfulExchangeIds,
    ["BINANCE"],
  );

  assert.deepEqual(
    result.failedExchangeIds,
    ["OKX"],
  );

  assert.equal(
    result.failure?.code,
    "EXCHANGE_CLIENT_UNAVAILABLE",
  );

  assert.equal(
    result.attempts[1]?.status,
    "FAILED",
  );

  assert.equal(
    result.attempts[1]?.failure?.code,
    "EXCHANGE_CLIENT_UNAVAILABLE",
  );
}

async function testRejectedExchangeExecution():
  Promise<void> {
  const binanceClient =
    new StubExecutionClient(
      "BINANCE",
      (command) =>
        createAcceptedResponse(command),
    );

  const okxClient =
    new StubExecutionClient(
      "OKX",
      (command) =>
        createRejectedResponse(command),
    );

  const engine = createEngine([
    binanceClient,
    okxClient,
  ]);

  const result = await engine.execute({
    plan: createPlan(),
    options: {
      allowPartialExecution: true,
      maximumConcurrency: 2,
    },
  });

  assert.equal(
    result.status,
    "PARTIALLY_FAILED",
  );

  assert.equal(
    result.acceptedQuantity,
    6,
  );

  assert.equal(
    result.filledQuantity,
    6,
  );

  assert.deepEqual(
    result.failedExchangeIds,
    ["OKX"],
  );

  assert.equal(
    result.failure?.code,
    "EXCHANGE_REJECTED_ORDER",
  );

  assert.equal(
    result.attempts[1]?.status,
    "REJECTED",
  );
}

async function testPartialExecutionNotAllowed():
  Promise<void> {
  const binanceClient =
    new StubExecutionClient(
      "BINANCE",
      (command) =>
        createAcceptedResponse(command),
    );

  const engine = createEngine([
    binanceClient,
  ]);

  const result = await engine.execute({
    plan: createPlan(),
    options: {
      allowPartialExecution: false,
      maximumConcurrency: 2,
    },
  });

  assert.equal(
    result.status,
    "PARTIALLY_FAILED",
  );

  assert.equal(
    result.acceptedQuantity,
    6,
  );

  assert.equal(
    result.failure?.code,
    "PARTIAL_EXECUTION_NOT_ALLOWED",
  );
}

async function testStopOnFirstFailure():
  Promise<void> {
  const binanceClient =
    new StubExecutionClient(
      "BINANCE",
      (command) =>
        createRejectedResponse(command),
    );

  const okxClient =
    new StubExecutionClient(
      "OKX",
      (command) =>
        createAcceptedResponse(command),
    );

  const plan = createPlan({
    requestedQuantity: 12,

    instructions: Object.freeze([
      Object.freeze({
        instructionId: "instruction-binance-001",
        exchangeId: "BINANCE",
        accountId: "binance-account",
        exchangeSymbol: "BTCUSDT",

        quantity: 4,
        price: 50_000,
        stopPrice: null,
        timeInForce: "GTC",

        reduceOnly: false,
        postOnly: false,
        clientOrderId:
          "coordinator-binance-order-001",

        metadata: Object.freeze({}),
      }),
      Object.freeze({
        instructionId: "instruction-okx-001",
        exchangeId: "OKX",
        accountId: "okx-account",
        exchangeSymbol: "BTC-USDT",

        quantity: 4,
        price: 50_100,
        stopPrice: null,
        timeInForce: "GTC",

        reduceOnly: false,
        postOnly: false,
        clientOrderId:
          "coordinator-okx-order-001",

        metadata: Object.freeze({}),
      }),
      Object.freeze({
        instructionId: "instruction-okx-002",
        exchangeId: "OKX",
        accountId: "okx-account",
        exchangeSymbol: "BTC-USDT",

        quantity: 4,
        price: 50_200,
        stopPrice: null,
        timeInForce: "GTC",

        reduceOnly: false,
        postOnly: false,
        clientOrderId:
          "coordinator-okx-order-002",

        metadata: Object.freeze({}),
      }),
    ]),
  });

  const engine = createEngine([
    binanceClient,
    okxClient,
  ]);

  const result = await engine.execute({
    plan,
    options: {
      allowPartialExecution: true,
      stopOnFirstFailure: true,
      maximumConcurrency: 1,
    },
  });

  assert.equal(
    result.status,
    "FAILED",
  );

  assert.equal(
    result.attempts.length,
    3,
  );

  assert.equal(
    result.attempts[0]?.status,
    "REJECTED",
  );

  assert.equal(
    result.attempts[1]?.status,
    "SKIPPED",
  );

  assert.equal(
    result.attempts[2]?.status,
    "SKIPPED",
  );

  assert.deepEqual(
    result.failedExchangeIds,
    ["BINANCE"],
  );

  assert.deepEqual(
    result.skippedExchangeIds,
    ["OKX"],
  );

  assert.equal(
    binanceClient.receivedCommands.length,
    1,
  );

  assert.equal(
    okxClient.receivedCommands.length,
    0,
  );
}

async function testEmptyExecutionPlan():
  Promise<void> {
  const engine = createEngine([]);

  const result = await engine.execute({
    plan: createPlan({
      instructions: Object.freeze([]),
    }),
  });

  assert.equal(
    result.status,
    "FAILED",
  );

  assert.equal(
    result.attempts.length,
    0,
  );

  assert.equal(
    result.failure?.code,
    "NO_EXECUTABLE_INSTRUCTIONS",
  );

  assert.equal(
    result.dispatchedQuantity,
    0,
  );
}

async function run(): Promise<void> {
  await testSuccessfulMultiExchangeExecution();
  await testMissingExchangeClient();
  await testRejectedExchangeExecution();
  await testPartialExecutionNotAllowed();
  await testStopOnFirstFailure();
  await testEmptyExecutionPlan();

  console.log(
    "All Multi-Exchange Coordinator Phase 3 deterministic tests passed successfully.",
  );
}

run().catch(
  (error: unknown) => {
    console.error(
      "Multi-Exchange Coordinator Phase 3 deterministic tests failed.",
    );

    console.error(error);

    process.exitCode = 1;
  },
);