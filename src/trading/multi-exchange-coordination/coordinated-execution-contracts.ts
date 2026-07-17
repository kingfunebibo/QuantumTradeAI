import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorOrderSide,
  CoordinatorOrderType,
  CoordinatorSymbol,
  CoordinatorTimeInForce,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorExecutionId,
  MultiExchangeCoordinatorPlanId,
  MultiExchangeCoordinatorRequestId,
} from "./coordinator-contracts";

/**
 * Represents the lifecycle state of one exchange-specific execution.
 */
export type CoordinatorExchangeExecutionStatus =
  | "PENDING"
  | "DISPATCHING"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "SKIPPED";

/**
 * Represents the aggregate state of a coordinated multi-exchange execution.
 */
export type CoordinatedExecutionStatus =
  | "CREATED"
  | "DISPATCHING"
  | "PARTIALLY_ACCEPTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "PARTIALLY_FAILED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

/**
 * Identifies why a coordinated execution or one of its exchange attempts failed.
 */
export type CoordinatorExecutionFailureCode =
  | "INVALID_EXECUTION_PLAN"
  | "EXCHANGE_CLIENT_UNAVAILABLE"
  | "EXCHANGE_DISPATCH_FAILED"
  | "EXCHANGE_REJECTED_ORDER"
  | "EXCHANGE_TIMEOUT"
  | "EXCHANGE_RESPONSE_INVALID"
  | "NO_EXECUTABLE_INSTRUCTIONS"
  | "PARTIAL_EXECUTION_NOT_ALLOWED"
  | "AGGREGATION_FAILED"
  | "UNKNOWN_EXECUTION_FAILURE";

/**
 * Exchange-independent command produced from an execution-plan instruction.
 *
 * This command is intentionally structural. Exchange adapters can map it into
 * their native order-submission request without coupling the coordinator to
 * any specific exchange implementation.
 */
export interface CoordinatorExchangeExecutionCommand {
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly instructionId: string;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;
  readonly quantity: number;
  readonly price: number | null;
  readonly stopPrice: number | null;
  readonly timeInForce: CoordinatorTimeInForce | null;

  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly clientOrderId: string | null;

  readonly createdAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Normalized response returned by an exchange execution client.
 */
export interface CoordinatorExchangeExecutionResponse {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly instructionId: string;
  readonly clientOrderId: string | null;
  readonly exchangeOrderId: string | null;

  readonly status: CoordinatorExchangeExecutionStatus;

  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice: number | null;

  readonly submittedAt: CoordinatorTimestamp | null;
  readonly acceptedAt: CoordinatorTimestamp | null;
  readonly completedAt: CoordinatorTimestamp | null;

  readonly failure: CoordinatorExchangeExecutionFailure | null;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Normalized failure produced by an exchange execution client.
 */
export interface CoordinatorExchangeExecutionFailure {
  readonly code: CoordinatorExecutionFailureCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly exchangeId: CoordinatorExchangeId;
  readonly instructionId: string;
  readonly occurredAt: CoordinatorTimestamp;
  readonly cause: unknown;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Exchange-specific execution client registered with the coordinator.
 */
export interface CoordinatorExchangeExecutionClient {
  readonly exchangeId: CoordinatorExchangeId;

  submit(
    command: CoordinatorExchangeExecutionCommand,
  ): Promise<CoordinatorExchangeExecutionResponse>;
}

/**
 * Registry used to resolve an exchange execution client.
 */
export interface CoordinatorExchangeExecutionClientRegistry {
  register(client: CoordinatorExchangeExecutionClient): void;

  unregister(exchangeId: CoordinatorExchangeId): boolean;

  resolve(
    exchangeId: CoordinatorExchangeId,
  ): CoordinatorExchangeExecutionClient | null;

  has(exchangeId: CoordinatorExchangeId): boolean;

  list(): readonly CoordinatorExchangeExecutionClient[];
}

/**
 * One normalized attempt generated while dispatching an execution plan.
 */
export interface CoordinatorExchangeExecutionAttempt {
  readonly attemptId: string;
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;

  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly instructionId: string;

  readonly status: CoordinatorExchangeExecutionStatus;

  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice: number | null;

  readonly clientOrderId: string | null;
  readonly exchangeOrderId: string | null;

  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp | null;

  readonly failure: CoordinatorExchangeExecutionFailure | null;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Failure information for the aggregate coordinated execution.
 */
export interface CoordinatedExecutionFailure {
  readonly code: CoordinatorExecutionFailureCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly failedExchangeIds: readonly CoordinatorExchangeId[];
  readonly occurredAt: CoordinatorTimestamp;
  readonly cause: unknown;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Final aggregate result returned after all executable instructions have been
 * dispatched and normalized.
 */
export interface CoordinatedExecutionResult {
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;

  readonly status: CoordinatedExecutionStatus;

  readonly requestedQuantity: number;
  readonly dispatchedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice: number | null;

  readonly successfulExchangeIds: readonly CoordinatorExchangeId[];
  readonly failedExchangeIds: readonly CoordinatorExchangeId[];
  readonly skippedExchangeIds: readonly CoordinatorExchangeId[];

  readonly attempts: readonly CoordinatorExchangeExecutionAttempt[];

  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;

  readonly failure: CoordinatedExecutionFailure | null;
  readonly metadata: CoordinatorMetadata;
}

/**
 * Dispatch configuration controlling partial execution and concurrency.
 */
export interface CoordinatedExecutionOptions {
  readonly allowPartialExecution?: boolean;
  readonly stopOnFirstFailure?: boolean;
  readonly maximumConcurrency?: number;
  readonly exchangeTimeoutMilliseconds?: number;
  readonly metadata?: CoordinatorMetadata;
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must not be empty.`);
  }
}

function assertFiniteNonNegativeNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

/**
 * Creates an immutable exchange execution command.
 */
export function createCoordinatorExchangeExecutionCommand(
  command: CoordinatorExchangeExecutionCommand,
): CoordinatorExchangeExecutionCommand {
  assertNonEmptyString(command.executionId, "executionId");
  assertNonEmptyString(command.planId, "planId");
  assertNonEmptyString(command.requestId, "requestId");
  assertNonEmptyString(command.instructionId, "instructionId");
  assertNonEmptyString(command.exchangeId, "exchangeId");
  assertNonEmptyString(command.accountId, "accountId");
  assertNonEmptyString(command.symbol, "symbol");
  assertNonEmptyString(
    command.exchangeSymbol,
    "exchangeSymbol",
  );

  if (
    !Number.isFinite(command.quantity) ||
    command.quantity <= 0
  ) {
    throw new Error(
      "quantity must be a finite number greater than zero.",
    );
  }

  if (
    command.price !== null &&
    (!Number.isFinite(command.price) ||
      command.price <= 0)
  ) {
    throw new Error(
      "price must be null or a finite number greater than zero.",
    );
  }

  if (
    command.stopPrice !== null &&
    (!Number.isFinite(command.stopPrice) ||
      command.stopPrice <= 0)
  ) {
    throw new Error(
      "stopPrice must be null or a finite number greater than zero.",
    );
  }

  return Object.freeze({
    ...command,
    metadata: Object.freeze({
      ...command.metadata,
    }),
  });
}

/**
 * Creates an immutable exchange execution response.
 */
export function createCoordinatorExchangeExecutionResponse(
  response: CoordinatorExchangeExecutionResponse,
): CoordinatorExchangeExecutionResponse {
  assertNonEmptyString(response.exchangeId, "exchangeId");
  assertNonEmptyString(response.accountId, "accountId");
  assertNonEmptyString(
    response.instructionId,
    "instructionId",
  );

  assertFiniteNonNegativeNumber(
    response.requestedQuantity,
    "requestedQuantity",
  );

  assertFiniteNonNegativeNumber(
    response.acceptedQuantity,
    "acceptedQuantity",
  );

  assertFiniteNonNegativeNumber(
    response.filledQuantity,
    "filledQuantity",
  );

  assertFiniteNonNegativeNumber(
    response.remainingQuantity,
    "remainingQuantity",
  );

  if (
    response.acceptedQuantity >
    response.requestedQuantity
  ) {
    throw new Error(
      "acceptedQuantity cannot exceed requestedQuantity.",
    );
  }

  if (
    response.filledQuantity >
    response.acceptedQuantity
  ) {
    throw new Error(
      "filledQuantity cannot exceed acceptedQuantity.",
    );
  }

  if (
    response.remainingQuantity >
    response.requestedQuantity
  ) {
    throw new Error(
      "remainingQuantity cannot exceed requestedQuantity.",
    );
  }

  if (
    response.averageFillPrice !== null &&
    (!Number.isFinite(response.averageFillPrice) ||
      response.averageFillPrice <= 0)
  ) {
    throw new Error(
      "averageFillPrice must be null or a finite number greater than zero.",
    );
  }

  return Object.freeze({
    ...response,
    failure:
      response.failure === null
        ? null
        : Object.freeze({
            ...response.failure,
            metadata: Object.freeze({
              ...response.failure.metadata,
            }),
          }),
    metadata: Object.freeze({
      ...response.metadata,
    }),
  });
}

/**
 * Creates an immutable exchange execution attempt.
 */
export function createCoordinatorExchangeExecutionAttempt(
  attempt: CoordinatorExchangeExecutionAttempt,
): CoordinatorExchangeExecutionAttempt {
  assertNonEmptyString(attempt.attemptId, "attemptId");
  assertNonEmptyString(attempt.executionId, "executionId");
  assertNonEmptyString(attempt.planId, "planId");
  assertNonEmptyString(attempt.requestId, "requestId");
  assertNonEmptyString(attempt.exchangeId, "exchangeId");
  assertNonEmptyString(attempt.accountId, "accountId");
  assertNonEmptyString(
    attempt.instructionId,
    "instructionId",
  );

  assertFiniteNonNegativeNumber(
    attempt.requestedQuantity,
    "requestedQuantity",
  );

  assertFiniteNonNegativeNumber(
    attempt.acceptedQuantity,
    "acceptedQuantity",
  );

  assertFiniteNonNegativeNumber(
    attempt.filledQuantity,
    "filledQuantity",
  );

  assertFiniteNonNegativeNumber(
    attempt.remainingQuantity,
    "remainingQuantity",
  );

  return Object.freeze({
    ...attempt,
    failure:
      attempt.failure === null
        ? null
        : Object.freeze({
            ...attempt.failure,
            metadata: Object.freeze({
              ...attempt.failure.metadata,
            }),
          }),
    metadata: Object.freeze({
      ...attempt.metadata,
    }),
  });
}

/**
 * Creates an immutable aggregate execution result.
 */
export function createCoordinatedExecutionResult(
  result: CoordinatedExecutionResult,
): CoordinatedExecutionResult {
  assertNonEmptyString(result.executionId, "executionId");
  assertNonEmptyString(result.planId, "planId");
  assertNonEmptyString(result.requestId, "requestId");

  assertFiniteNonNegativeNumber(
    result.requestedQuantity,
    "requestedQuantity",
  );

  assertFiniteNonNegativeNumber(
    result.dispatchedQuantity,
    "dispatchedQuantity",
  );

  assertFiniteNonNegativeNumber(
    result.acceptedQuantity,
    "acceptedQuantity",
  );

  assertFiniteNonNegativeNumber(
    result.filledQuantity,
    "filledQuantity",
  );

  assertFiniteNonNegativeNumber(
    result.remainingQuantity,
    "remainingQuantity",
  );

  return Object.freeze({
    ...result,
    successfulExchangeIds: Object.freeze([
      ...result.successfulExchangeIds,
    ]),
    failedExchangeIds: Object.freeze([
      ...result.failedExchangeIds,
    ]),
    skippedExchangeIds: Object.freeze([
      ...result.skippedExchangeIds,
    ]),
    attempts: Object.freeze([
      ...result.attempts.map(
        createCoordinatorExchangeExecutionAttempt,
      ),
    ]),
    failure:
      result.failure === null
        ? null
        : Object.freeze({
            ...result.failure,
            failedExchangeIds: Object.freeze([
              ...result.failure.failedExchangeIds,
            ]),
            metadata: Object.freeze({
              ...result.failure.metadata,
            }),
          }),
    metadata: Object.freeze({
      ...result.metadata,
    }),
  });
}