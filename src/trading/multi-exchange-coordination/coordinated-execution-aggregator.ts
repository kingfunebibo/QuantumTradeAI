import type {
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorExecutionId,
  MultiExchangeCoordinatorPlanId,
  MultiExchangeCoordinatorRequestId,
} from "./coordinator-contracts";
import {
  createCoordinatedExecutionResult,
  type CoordinatedExecutionFailure,
  type CoordinatedExecutionResult,
  type CoordinatedExecutionStatus,
  type CoordinatorExchangeExecutionAttempt,
  type CoordinatorExecutionFailureCode,
} from "./coordinated-execution-contracts";

export interface CoordinatedExecutionAggregationInput {
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;

  readonly requestedQuantity: number;
  readonly attempts: readonly CoordinatorExchangeExecutionAttempt[];

  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;

  readonly allowPartialExecution?: boolean;
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

function uniqueExchangeIds(
  exchangeIds: readonly CoordinatorExchangeId[],
): readonly CoordinatorExchangeId[] {
  return Object.freeze(
    Array.from(
      new Set(exchangeIds),
    ),
  );
}

function sum(
  values: readonly number[],
): number {
  return values.reduce(
    (total, value) => total + value,
    0,
  );
}

function calculateAverageFillPrice(
  attempts: readonly CoordinatorExchangeExecutionAttempt[],
): number | null {
  let totalFilledQuantity = 0;
  let totalFillValue = 0;

  for (const attempt of attempts) {
    if (
      attempt.filledQuantity <= 0 ||
      attempt.averageFillPrice === null
    ) {
      continue;
    }

    totalFilledQuantity += attempt.filledQuantity;
    totalFillValue +=
      attempt.filledQuantity *
      attempt.averageFillPrice;
  }

  if (totalFilledQuantity === 0) {
    return null;
  }

  return totalFillValue / totalFilledQuantity;
}

function isSuccessfulAttempt(
  attempt: CoordinatorExchangeExecutionAttempt,
): boolean {
  return (
    attempt.status === "ACCEPTED" ||
    attempt.status === "PARTIALLY_FILLED" ||
    attempt.status === "FILLED"
  );
}

function isFailedAttempt(
  attempt: CoordinatorExchangeExecutionAttempt,
): boolean {
  return (
    attempt.status === "REJECTED" ||
    attempt.status === "FAILED" ||
    attempt.status === "TIMED_OUT"
  );
}

function isSkippedAttempt(
  attempt: CoordinatorExchangeExecutionAttempt,
): boolean {
  return attempt.status === "SKIPPED";
}

function determineStatus(
  requestedQuantity: number,
  acceptedQuantity: number,
  filledQuantity: number,
  successfulAttemptCount: number,
  failedAttemptCount: number,
  skippedAttemptCount: number,
): CoordinatedExecutionStatus {
  if (
    filledQuantity >= requestedQuantity &&
    requestedQuantity > 0
  ) {
    return "FILLED";
  }

  if (filledQuantity > 0) {
    return failedAttemptCount > 0
      ? "PARTIALLY_FAILED"
      : "PARTIALLY_FILLED";
  }

  if (acceptedQuantity >= requestedQuantity) {
    return "ACCEPTED";
  }

  if (acceptedQuantity > 0) {
    return failedAttemptCount > 0 ||
      skippedAttemptCount > 0
      ? "PARTIALLY_ACCEPTED"
      : "ACCEPTED";
  }

  if (
    failedAttemptCount > 0 &&
    successfulAttemptCount === 0
  ) {
    const allTimedOut =
      failedAttemptCount > 0;

    return allTimedOut
      ? "FAILED"
      : "FAILED";
  }

  if (
    successfulAttemptCount === 0 &&
    skippedAttemptCount > 0
  ) {
    return "FAILED";
  }

  return "FAILED";
}

function determineFailureCode(
  attempts: readonly CoordinatorExchangeExecutionAttempt[],
  allowPartialExecution: boolean,
  acceptedQuantity: number,
): CoordinatorExecutionFailureCode {
  if (
    !allowPartialExecution &&
    acceptedQuantity > 0
  ) {
    return "PARTIAL_EXECUTION_NOT_ALLOWED";
  }

  if (
    attempts.some(
      (attempt) =>
        attempt.status === "TIMED_OUT",
    )
  ) {
    return "EXCHANGE_TIMEOUT";
  }

  if (
    attempts.some(
      (attempt) =>
        attempt.status === "REJECTED",
    )
  ) {
    return "EXCHANGE_REJECTED_ORDER";
  }

  if (
    attempts.some(
      (attempt) =>
        attempt.failure?.code ===
        "EXCHANGE_CLIENT_UNAVAILABLE",
    )
  ) {
    return "EXCHANGE_CLIENT_UNAVAILABLE";
  }

  if (
    attempts.length === 0 ||
    attempts.every(isSkippedAttempt)
  ) {
    return "NO_EXECUTABLE_INSTRUCTIONS";
  }

  return "EXCHANGE_DISPATCH_FAILED";
}

function createFailure(
  attempts: readonly CoordinatorExchangeExecutionAttempt[],
  allowPartialExecution: boolean,
  acceptedQuantity: number,
  completedAt: CoordinatorTimestamp,
  metadata: CoordinatorMetadata,
): CoordinatedExecutionFailure {
  const failedExchangeIds =
    uniqueExchangeIds(
      attempts
        .filter(
          (attempt) =>
            isFailedAttempt(attempt) ||
            isSkippedAttempt(attempt),
        )
        .map(
          (attempt) => attempt.exchangeId,
        ),
    );

  const code = determineFailureCode(
    attempts,
    allowPartialExecution,
    acceptedQuantity,
  );

  return Object.freeze({
    code,
    message:
      code === "PARTIAL_EXECUTION_NOT_ALLOWED"
        ? "The execution was only partially accepted, but partial execution is not allowed."
        : "One or more exchange execution attempts failed.",
    retryable: attempts.some(
      (attempt) =>
        attempt.failure?.retryable === true,
    ),
    failedExchangeIds,
    occurredAt: completedAt,
    cause: null,
    metadata: Object.freeze({
      ...metadata,
    }),
  });
}

export class CoordinatedExecutionAggregator {
  public aggregate(
    input: CoordinatedExecutionAggregationInput,
  ): CoordinatedExecutionResult {
    if (
      !Number.isFinite(input.requestedQuantity) ||
      input.requestedQuantity < 0
    ) {
      throw new Error(
        "requestedQuantity must be a finite non-negative number.",
      );
    }

    if (input.completedAt < input.startedAt) {
      throw new Error(
        "completedAt cannot be earlier than startedAt.",
      );
    }

    const attempts = Object.freeze([
      ...input.attempts,
    ]);

    const dispatchedQuantity = sum(
      attempts
        .filter(
          (attempt) =>
            attempt.status !== "SKIPPED",
        )
        .map(
          (attempt) =>
            attempt.requestedQuantity,
        ),
    );

    const acceptedQuantity = sum(
      attempts.map(
        (attempt) =>
          attempt.acceptedQuantity,
      ),
    );

    const filledQuantity = sum(
      attempts.map(
        (attempt) =>
          attempt.filledQuantity,
      ),
    );

    const remainingQuantity = Math.max(
      0,
      input.requestedQuantity -
        filledQuantity,
    );

    const successfulAttempts =
      attempts.filter(
        isSuccessfulAttempt,
      );

    const failedAttempts =
      attempts.filter(
        isFailedAttempt,
      );

    const skippedAttempts =
      attempts.filter(
        isSkippedAttempt,
      );

    const status = determineStatus(
      input.requestedQuantity,
      acceptedQuantity,
      filledQuantity,
      successfulAttempts.length,
      failedAttempts.length,
      skippedAttempts.length,
    );

    const allowPartialExecution =
      input.allowPartialExecution ?? true;

    const partialExecutionViolation =
      !allowPartialExecution &&
      acceptedQuantity > 0 &&
      acceptedQuantity <
        input.requestedQuantity;

    const hasFailure =
      failedAttempts.length > 0 ||
      skippedAttempts.length > 0 ||
      partialExecutionViolation ||
      attempts.length === 0;

    const metadata = mergeMetadata(
      input.metadata,
      Object.freeze({
        attemptCount: attempts.length,
        successfulAttemptCount:
          successfulAttempts.length,
        failedAttemptCount:
          failedAttempts.length,
        skippedAttemptCount:
          skippedAttempts.length,
      }),
    );

    return createCoordinatedExecutionResult({
      executionId: input.executionId,
      planId: input.planId,
      requestId: input.requestId,

      status:
        partialExecutionViolation
          ? "PARTIALLY_FAILED"
          : status,

      requestedQuantity:
        input.requestedQuantity,
      dispatchedQuantity,
      acceptedQuantity,
      filledQuantity,
      remainingQuantity,
      averageFillPrice:
        calculateAverageFillPrice(
          attempts,
        ),

      successfulExchangeIds:
        uniqueExchangeIds(
          successfulAttempts.map(
            (attempt) =>
              attempt.exchangeId,
          ),
        ),

      failedExchangeIds:
        uniqueExchangeIds(
          failedAttempts.map(
            (attempt) =>
              attempt.exchangeId,
          ),
        ),

      skippedExchangeIds:
        uniqueExchangeIds(
          skippedAttempts.map(
            (attempt) =>
              attempt.exchangeId,
          ),
        ),

      attempts,

      startedAt: input.startedAt,
      completedAt: input.completedAt,

      failure: hasFailure
        ? createFailure(
            attempts,
            allowPartialExecution,
            acceptedQuantity,
            input.completedAt,
            metadata,
          )
        : null,

      metadata,
    });
  }
}

export function createCoordinatedExecutionAggregator():
  CoordinatedExecutionAggregator {
  return new CoordinatedExecutionAggregator();
}