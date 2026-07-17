import type {
  CoordinatorDurationMilliseconds,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorClock,
} from "./coordinator-contracts";

/**
 * Error thrown when a coordinator clock receives an invalid timestamp
 * or duration.
 */
export class MultiExchangeCoordinatorClockError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MultiExchangeCoordinatorClockError";

    Object.setPrototypeOf(
      this,
      MultiExchangeCoordinatorClockError.prototype,
    );
  }
}

/**
 * Validates that a value is a safe, finite, non-negative integer suitable
 * for deterministic coordinator timestamps and durations.
 */
function assertValidClockValue(
  value: number,
  fieldName: string,
): asserts value is number {
  if (!Number.isFinite(value)) {
    throw new MultiExchangeCoordinatorClockError(
      `${fieldName} must be a finite number.`,
    );
  }

  if (!Number.isSafeInteger(value)) {
    throw new MultiExchangeCoordinatorClockError(
      `${fieldName} must be a safe integer.`,
    );
  }

  if (value < 0) {
    throw new MultiExchangeCoordinatorClockError(
      `${fieldName} cannot be negative.`,
    );
  }
}

/**
 * A deterministic, manually controlled coordinator clock.
 *
 * This clock is intended for:
 *
 * - deterministic unit tests;
 * - integration simulations;
 * - reproducible coordinator state transitions;
 * - retry and failover testing;
 * - quarantine and recovery simulations;
 * - latency and timeout testing.
 *
 * The clock never advances automatically. Callers must explicitly invoke
 * advanceBy(), advanceTo(), or reset().
 */
export class DeterministicMultiExchangeCoordinatorClock
  implements MultiExchangeCoordinatorClock
{
  private currentTimestamp: CoordinatorTimestamp;

  public constructor(
    initialTimestamp: CoordinatorTimestamp = 0,
  ) {
    assertValidClockValue(initialTimestamp, "initialTimestamp");

    this.currentTimestamp = initialTimestamp;
  }

  /**
   * Returns the current deterministic timestamp.
   */
  public now(): CoordinatorTimestamp {
    return this.currentTimestamp;
  }

  /**
   * Advances the clock by the supplied duration.
   *
   * A duration of zero is valid and leaves the timestamp unchanged.
   */
  public advanceBy(
    durationMilliseconds: CoordinatorDurationMilliseconds,
  ): CoordinatorTimestamp {
    assertValidClockValue(
      durationMilliseconds,
      "durationMilliseconds",
    );

    const nextTimestamp =
      this.currentTimestamp + durationMilliseconds;

    if (!Number.isSafeInteger(nextTimestamp)) {
      throw new MultiExchangeCoordinatorClockError(
        "Advancing the coordinator clock would exceed the maximum safe integer.",
      );
    }

    this.currentTimestamp = nextTimestamp;

    return this.currentTimestamp;
  }

  /**
   * Advances the clock to an exact timestamp.
   *
   * Moving backwards is prohibited because coordinator events, lifecycle
   * transitions, retry attempts, and metrics require monotonic time.
   */
  public advanceTo(
    timestamp: CoordinatorTimestamp,
  ): CoordinatorTimestamp {
    assertValidClockValue(timestamp, "timestamp");

    if (timestamp < this.currentTimestamp) {
      throw new MultiExchangeCoordinatorClockError(
        [
          "The deterministic coordinator clock cannot move backwards.",
          `Current timestamp: ${this.currentTimestamp}.`,
          `Requested timestamp: ${timestamp}.`,
        ].join(" "),
      );
    }

    this.currentTimestamp = timestamp;

    return this.currentTimestamp;
  }

  /**
   * Resets the clock to an exact timestamp.
   *
   * Unlike advanceTo(), reset() may intentionally move the clock backwards.
   * It should only be used when preparing a new deterministic scenario.
   */
  public reset(
    timestamp: CoordinatorTimestamp = 0,
  ): CoordinatorTimestamp {
    assertValidClockValue(timestamp, "timestamp");

    this.currentTimestamp = timestamp;

    return this.currentTimestamp;
  }

  /**
   * Returns an immutable snapshot of the clock state.
   */
  public snapshot(): DeterministicCoordinatorClockSnapshot {
    return Object.freeze({
      timestamp: this.currentTimestamp,
    });
  }
}

export interface DeterministicCoordinatorClockSnapshot {
  readonly timestamp: CoordinatorTimestamp;
}

/**
 * Production clock backed by Date.now().
 *
 * The returned timestamp is protected against wall-clock regressions. If the
 * host system clock moves backwards, this clock continues returning the most
 * recent observed timestamp so coordinator event ordering remains monotonic.
 */
export class SystemMultiExchangeCoordinatorClock
  implements MultiExchangeCoordinatorClock
{
  private lastObservedTimestamp: CoordinatorTimestamp;

  public constructor(
    initialTimestamp: CoordinatorTimestamp = 0,
  ) {
    assertValidClockValue(initialTimestamp, "initialTimestamp");

    this.lastObservedTimestamp = initialTimestamp;
  }

  public now(): CoordinatorTimestamp {
    const systemTimestamp = Date.now();

    assertValidClockValue(systemTimestamp, "systemTimestamp");

    if (systemTimestamp > this.lastObservedTimestamp) {
      this.lastObservedTimestamp = systemTimestamp;
    }

    return this.lastObservedTimestamp;
  }
}

/**
 * Creates a deterministic coordinator clock.
 */
export function createDeterministicMultiExchangeCoordinatorClock(
  initialTimestamp: CoordinatorTimestamp = 0,
): DeterministicMultiExchangeCoordinatorClock {
  return new DeterministicMultiExchangeCoordinatorClock(
    initialTimestamp,
  );
}

/**
 * Creates the production coordinator clock.
 */
export function createSystemMultiExchangeCoordinatorClock(
  initialTimestamp: CoordinatorTimestamp = 0,
): SystemMultiExchangeCoordinatorClock {
  return new SystemMultiExchangeCoordinatorClock(initialTimestamp);
}