import type {
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorOrderType,
  CoordinatorSymbol,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorExecutionId,
  MultiExchangeCoordinatorPlanId,
  MultiExchangeCoordinatorRequestId,
} from "./coordinator-contracts";
import {
  type CoordinatedExecutionOptions,
  type CoordinatedExecutionResult,
  type CoordinatorExchangeExecutionAttempt,
} from "./coordinated-execution-contracts";
import {
  CoordinatedExecutionAggregator,
} from "./coordinated-execution-aggregator";
import {
  CoordinatorExchangeExecutionCommandMapper,
  type CoordinatorExecutionPlanCommandContext,
  type CoordinatorExecutionPlanInstructionSource,
} from "./exchange-execution-command-mapper";
import {
  CoordinatorExchangeExecutionDispatcher,
  type CoordinatorExecutionDispatcherClock,
  SystemCoordinatorExecutionDispatcherClock,
} from "./exchange-execution-dispatcher";

export interface CoordinatedExecutionPlanSource {
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly executionId: MultiExchangeCoordinatorExecutionId;

  readonly requestedQuantity: number;

  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;

  readonly instructions:
    readonly CoordinatorExecutionPlanInstructionSource[];

  readonly createdAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface CoordinatedExecutionEngineInput {
  readonly plan: CoordinatedExecutionPlanSource;
  readonly options?: CoordinatedExecutionOptions;
  readonly metadata?: CoordinatorMetadata;
}

function mergeMetadata(
  ...sources: readonly (
    | CoordinatorMetadata
    | undefined
  )[]
): CoordinatorMetadata {
  const merged: Record<
    string,
    CoordinatorMetadataValue
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

function assertPositiveFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName} must be a finite number greater than zero.`,
    );
  }
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `${fieldName} must not be empty.`,
    );
  }
}

function validatePlan(
  plan: CoordinatedExecutionPlanSource,
): void {
  assertNonEmptyString(
    plan.planId,
    "planId",
  );

  assertNonEmptyString(
    plan.requestId,
    "requestId",
  );

  assertNonEmptyString(
    plan.executionId,
    "executionId",
  );

  assertNonEmptyString(
    plan.symbol,
    "symbol",
  );

  assertPositiveFiniteNumber(
    plan.requestedQuantity,
    "requestedQuantity",
  );

  if (
    !Array.isArray(plan.instructions)
  ) {
    throw new Error(
      "instructions must be an array.",
    );
  }

  if (
    plan.expiresAt !== null &&
    plan.expiresAt < plan.createdAt
  ) {
    throw new Error(
      "expiresAt cannot be earlier than createdAt.",
    );
  }
}

function createCommandContext(
  plan: CoordinatedExecutionPlanSource,
  createdAt: CoordinatorTimestamp,
  metadata: CoordinatorMetadata,
): CoordinatorExecutionPlanCommandContext {
  return Object.freeze({
    executionId: plan.executionId,
    planId: plan.planId,
    requestId: plan.requestId,
    symbol: plan.symbol,
    side: plan.side,
    orderType: plan.orderType,
    createdAt,
    expiresAt: plan.expiresAt,
    metadata,
  });
}

function createSkippedAttempt(
  plan: CoordinatedExecutionPlanSource,
  instruction:
    CoordinatorExecutionPlanInstructionSource,
  occurredAt: CoordinatorTimestamp,
  metadata: CoordinatorMetadata,
): CoordinatorExchangeExecutionAttempt {
  return Object.freeze({
    attemptId:
      `${plan.executionId}:${instruction.instructionId}`,

    executionId: plan.executionId,
    planId: plan.planId,
    requestId: plan.requestId,

    exchangeId: instruction.exchangeId,
    accountId: instruction.accountId,
    instructionId: instruction.instructionId,

    status: "SKIPPED",

    requestedQuantity:
      instruction.quantity,
    acceptedQuantity: 0,
    filledQuantity: 0,
    remainingQuantity:
      instruction.quantity,
    averageFillPrice: null,

    clientOrderId:
      instruction.clientOrderId,
    exchangeOrderId: null,

    startedAt: occurredAt,
    completedAt: occurredAt,

    failure: null,
    metadata: Object.freeze({
      ...metadata,
    }),
  });
}

function normalizeMaximumConcurrency(
  value: number | undefined,
  instructionCount: number,
): number {
  if (value === undefined) {
    return Math.max(
      1,
      instructionCount,
    );
  }

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      "maximumConcurrency must be a positive integer.",
    );
  }

  return value;
}

export class CoordinatedExecutionEngine {
  public constructor(
    private readonly mapper:
      CoordinatorExchangeExecutionCommandMapper,
    private readonly dispatcher:
      CoordinatorExchangeExecutionDispatcher,
    private readonly aggregator:
      CoordinatedExecutionAggregator =
        new CoordinatedExecutionAggregator(),
    private readonly clock:
      CoordinatorExecutionDispatcherClock =
        new SystemCoordinatorExecutionDispatcherClock(),
  ) {}

  public async execute(
    input: CoordinatedExecutionEngineInput,
  ): Promise<CoordinatedExecutionResult> {
    validatePlan(input.plan);

    const startedAt = this.clock.now();

    const metadata = mergeMetadata(
      input.plan.metadata,
      input.options?.metadata,
      input.metadata,
    );

    if (
      input.plan.instructions.length === 0
    ) {
      return this.aggregator.aggregate({
        executionId:
          input.plan.executionId,
        planId:
          input.plan.planId,
        requestId:
          input.plan.requestId,
        requestedQuantity:
          input.plan.requestedQuantity,
        attempts: Object.freeze([]),
        startedAt,
        completedAt: this.clock.now(),
        allowPartialExecution:
          input.options
            ?.allowPartialExecution,
        metadata,
      });
    }

    const context =
      createCommandContext(
        input.plan,
        startedAt,
        metadata,
      );

    const commands =
      this.mapper.mapMany(
        context,
        input.plan.instructions,
        metadata,
      );

    const maximumConcurrency =
      normalizeMaximumConcurrency(
        input.options
          ?.maximumConcurrency,
        commands.length,
      );

    const attempts:
      CoordinatorExchangeExecutionAttempt[] = [];

    let stopDispatching = false;

    for (
      let index = 0;
      index < commands.length;
      index += maximumConcurrency
    ) {
      const commandBatch =
        commands.slice(
          index,
          index + maximumConcurrency,
        );

      const dispatchResults =
        await Promise.all(
          commandBatch.map(
            (command) =>
              this.dispatcher.dispatch(
                command,
                {
                  timeoutMilliseconds:
                    input.options
                      ?.exchangeTimeoutMilliseconds,
                  metadata,
                },
              ),
          ),
        );

      for (const result of dispatchResults) {
        attempts.push(
          result.attempt,
        );

        const failed =
          result.attempt.status ===
            "FAILED" ||
          result.attempt.status ===
            "REJECTED" ||
          result.attempt.status ===
            "TIMED_OUT";

        if (
          failed &&
          input.options
            ?.stopOnFirstFailure === true
        ) {
          stopDispatching = true;
        }
      }

      if (stopDispatching) {
        const dispatchedCount =
          index +
          commandBatch.length;

        for (
          let skippedIndex =
            dispatchedCount;
          skippedIndex <
          input.plan.instructions.length;
          skippedIndex += 1
        ) {
          const instruction =
            input.plan.instructions[
              skippedIndex
            ];

          if (instruction === undefined) {
            continue;
          }

          attempts.push(
            createSkippedAttempt(
              input.plan,
              instruction,
              this.clock.now(),
              metadata,
            ),
          );
        }

        break;
      }
    }

    const completedAt =
      this.clock.now();

    return this.aggregator.aggregate({
      executionId:
        input.plan.executionId,
      planId:
        input.plan.planId,
      requestId:
        input.plan.requestId,

      requestedQuantity:
        input.plan.requestedQuantity,

      attempts: Object.freeze([
        ...attempts,
      ]),

      startedAt,
      completedAt,

      allowPartialExecution:
        input.options
          ?.allowPartialExecution,

      metadata,
    });
  }
}

export function createCoordinatedExecutionEngine(
  mapper:
    CoordinatorExchangeExecutionCommandMapper,
  dispatcher:
    CoordinatorExchangeExecutionDispatcher,
  aggregator:
    CoordinatedExecutionAggregator =
      new CoordinatedExecutionAggregator(),
  clock:
    CoordinatorExecutionDispatcherClock =
      new SystemCoordinatorExecutionDispatcherClock(),
): CoordinatedExecutionEngine {
  return new CoordinatedExecutionEngine(
    mapper,
    dispatcher,
    aggregator,
    clock,
  );
}