import type {
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorTimestamp,
} from "./coordinator-contracts";
import type {
  CoordinatorExchangeExecutionAttempt,
  CoordinatorExchangeExecutionClientRegistry,
  CoordinatorExchangeExecutionCommand,
  CoordinatorExchangeExecutionFailure,
  CoordinatorExchangeExecutionResponse,
  CoordinatorExecutionFailureCode,
} from "./coordinated-execution-contracts";
import {
  createCoordinatorExchangeExecutionAttempt,
  createCoordinatorExchangeExecutionResponse,
} from "./coordinated-execution-contracts";

export interface CoordinatorExecutionDispatcherClock {
  now(): CoordinatorTimestamp;
}

export interface CoordinatorExchangeExecutionDispatcherOptions {
  readonly timeoutMilliseconds?: number;
  readonly metadata?: CoordinatorMetadata;
}

export interface CoordinatorExchangeExecutionDispatchResult {
  readonly command: CoordinatorExchangeExecutionCommand;
  readonly response: CoordinatorExchangeExecutionResponse | null;
  readonly attempt: CoordinatorExchangeExecutionAttempt;
}

export class SystemCoordinatorExecutionDispatcherClock
  implements CoordinatorExecutionDispatcherClock
{
  public now(): CoordinatorTimestamp {
    return Date.now();
  }
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

function createFailure(
  code: CoordinatorExecutionFailureCode,
  message: string,
  retryable: boolean,
  exchangeId: CoordinatorExchangeId,
  instructionId: string,
  occurredAt: CoordinatorTimestamp,
  cause: unknown,
  metadata: CoordinatorMetadata,
): CoordinatorExchangeExecutionFailure {
  return Object.freeze({
    code,
    message,
    retryable,
    exchangeId,
    instructionId,
    occurredAt,
    cause,
    metadata: Object.freeze({
      ...metadata,
    }),
  });
}

function createFailedAttempt(
  command: CoordinatorExchangeExecutionCommand,
  startedAt: CoordinatorTimestamp,
  completedAt: CoordinatorTimestamp,
  failure: CoordinatorExchangeExecutionFailure,
  metadata: CoordinatorMetadata,
): CoordinatorExchangeExecutionAttempt {
  return createCoordinatorExchangeExecutionAttempt({
    attemptId:
      `${command.executionId}:${command.instructionId}`,

    executionId: command.executionId,
    planId: command.planId,
    requestId: command.requestId,

    exchangeId: command.exchangeId,
    accountId: command.accountId,
    instructionId: command.instructionId,

    status:
      failure.code === "EXCHANGE_TIMEOUT"
        ? "TIMED_OUT"
        : "FAILED",

    requestedQuantity: command.quantity,
    acceptedQuantity: 0,
    filledQuantity: 0,
    remainingQuantity: command.quantity,
    averageFillPrice: null,

    clientOrderId: command.clientOrderId,
    exchangeOrderId: null,

    startedAt,
    completedAt,

    failure,
    metadata,
  });
}

function createSuccessfulAttempt(
  command: CoordinatorExchangeExecutionCommand,
  response: CoordinatorExchangeExecutionResponse,
  startedAt: CoordinatorTimestamp,
  completedAt: CoordinatorTimestamp,
  metadata: CoordinatorMetadata,
): CoordinatorExchangeExecutionAttempt {
  return createCoordinatorExchangeExecutionAttempt({
    attemptId:
      `${command.executionId}:${command.instructionId}`,

    executionId: command.executionId,
    planId: command.planId,
    requestId: command.requestId,

    exchangeId: command.exchangeId,
    accountId: command.accountId,
    instructionId: command.instructionId,

    status: response.status,

    requestedQuantity:
      response.requestedQuantity,
    acceptedQuantity:
      response.acceptedQuantity,
    filledQuantity:
      response.filledQuantity,
    remainingQuantity:
      response.remainingQuantity,
    averageFillPrice:
      response.averageFillPrice,

    clientOrderId:
      response.clientOrderId,
    exchangeOrderId:
      response.exchangeOrderId,

    startedAt,
    completedAt,

    failure: response.failure,
    metadata: mergeMetadata(
      command.metadata,
      response.metadata,
      metadata,
    ),
  });
}

function validateResponse(
  command: CoordinatorExchangeExecutionCommand,
  response: CoordinatorExchangeExecutionResponse,
): void {
  if (
    response.exchangeId.trim().toUpperCase() !==
    command.exchangeId.trim().toUpperCase()
  ) {
    throw new Error(
      `Exchange response mismatch. Expected ${command.exchangeId}, received ${response.exchangeId}.`,
    );
  }

  if (
    response.instructionId !==
    command.instructionId
  ) {
    throw new Error(
      `Instruction response mismatch. Expected ${command.instructionId}, received ${response.instructionId}.`,
    );
  }

  if (
    response.requestedQuantity !==
    command.quantity
  ) {
    throw new Error(
      "Exchange response requestedQuantity does not match the dispatched quantity.",
    );
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  exchangeId: CoordinatorExchangeId,
): Promise<T> {
  if (
    !Number.isFinite(timeoutMilliseconds) ||
    timeoutMilliseconds <= 0
  ) {
    return promise;
  }

  return new Promise<T>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => {
          reject(
            new Error(
              `Exchange ${exchangeId} execution timed out after ${timeoutMilliseconds} milliseconds.`,
            ),
          );
        },
        timeoutMilliseconds,
      );

      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    },
  );
}

export class CoordinatorExchangeExecutionDispatcher {
  public constructor(
    private readonly registry:
      CoordinatorExchangeExecutionClientRegistry,
    private readonly clock:
      CoordinatorExecutionDispatcherClock =
        new SystemCoordinatorExecutionDispatcherClock(),
  ) {}

  public async dispatch(
    command: CoordinatorExchangeExecutionCommand,
    options: CoordinatorExchangeExecutionDispatcherOptions = {},
  ): Promise<CoordinatorExchangeExecutionDispatchResult> {
    const startedAt = this.clock.now();

    const metadata = mergeMetadata(
      command.metadata,
      options.metadata,
    );

    const client = this.registry.resolve(
      command.exchangeId,
    );

    if (client === null) {
      const completedAt = this.clock.now();

      const failure = createFailure(
        "EXCHANGE_CLIENT_UNAVAILABLE",
        `No execution client is registered for exchange ${command.exchangeId}.`,
        false,
        command.exchangeId,
        command.instructionId,
        completedAt,
        null,
        metadata,
      );

      return Object.freeze({
        command,
        response: null,
        attempt: createFailedAttempt(
          command,
          startedAt,
          completedAt,
          failure,
          metadata,
        ),
      });
    }

    try {
      const rawResponse = await withTimeout(
        client.submit(command),
        options.timeoutMilliseconds ?? 0,
        command.exchangeId,
      );

      validateResponse(
        command,
        rawResponse,
      );

      const response =
        createCoordinatorExchangeExecutionResponse(
          rawResponse,
        );

      const completedAt = this.clock.now();

      return Object.freeze({
        command,
        response,
        attempt: createSuccessfulAttempt(
          command,
          response,
          startedAt,
          completedAt,
          metadata,
        ),
      });
    } catch (cause: unknown) {
      const completedAt = this.clock.now();

      const message =
        cause instanceof Error
          ? cause.message
          : "Unknown exchange execution failure.";

      const timedOut =
        message.toLowerCase().includes(
          "timed out",
        );

      const failure = createFailure(
        timedOut
          ? "EXCHANGE_TIMEOUT"
          : "EXCHANGE_DISPATCH_FAILED",
        message,
        timedOut,
        command.exchangeId,
        command.instructionId,
        completedAt,
        cause,
        metadata,
      );

      return Object.freeze({
        command,
        response: null,
        attempt: createFailedAttempt(
          command,
          startedAt,
          completedAt,
          failure,
          metadata,
        ),
      });
    }
  }

  public async dispatchMany(
    commands:
      readonly CoordinatorExchangeExecutionCommand[],
    options: CoordinatorExchangeExecutionDispatcherOptions = {},
  ): Promise<
    readonly CoordinatorExchangeExecutionDispatchResult[]
  > {
    const results =
      await Promise.all(
        commands.map(
          (command) =>
            this.dispatch(
              command,
              options,
            ),
        ),
      );

    return Object.freeze(results);
  }
}

export function createCoordinatorExchangeExecutionDispatcher(
  registry:
    CoordinatorExchangeExecutionClientRegistry,
  clock:
    CoordinatorExecutionDispatcherClock =
      new SystemCoordinatorExecutionDispatcherClock(),
): CoordinatorExchangeExecutionDispatcher {
  return new CoordinatorExchangeExecutionDispatcher(
    registry,
    clock,
  );
}