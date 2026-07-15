import {
  OkxAuthenticationError,
  type OkxClock,
} from "./okx-authentication";

export interface OkxServerTimeSample {
  readonly requestStartedAt: number;
  readonly responseReceivedAt: number;
  readonly serverTime: number;
}

export interface OkxServerTimeSynchronizationState {
  readonly synchronized: boolean;
  readonly offsetMs: number;
  readonly roundTripTimeMs: number;
  readonly serverTimeMs: number;
  readonly localMidpointMs: number;
  readonly synchronizedAtMs: number;
}

export interface OkxServerTimeSynchronizerConfiguration {
  readonly maximumAcceptedClockDriftMs: number;
}

export interface OkxServerTimeSynchronizerSnapshot {
  readonly state: OkxServerTimeSynchronizationState;
  readonly maximumAcceptedClockDriftMs: number;
}

export interface OkxServerTimeProvider {
  getServerTime(): Promise<number>;
}

export class OkxServerTimeSynchronizationError extends Error {
  public readonly code =
    "OKX_SERVER_TIME_SYNCHRONIZATION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxServerTimeSynchronizationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const UNSYNCHRONIZED_STATE: OkxServerTimeSynchronizationState =
  Object.freeze({
    synchronized: false,
    offsetMs: 0,
    roundTripTimeMs: 0,
    serverTimeMs: 0,
    localMidpointMs: 0,
    synchronizedAtMs: 0,
  });

export function createOkxServerTimeSample(
  sample: OkxServerTimeSample,
): OkxServerTimeSample {
  validateTimestamp(
    sample.requestStartedAt,
    "requestStartedAt",
  );

  validateTimestamp(
    sample.responseReceivedAt,
    "responseReceivedAt",
  );

  validateTimestamp(
    sample.serverTime,
    "serverTime",
  );

  if (
    sample.responseReceivedAt <
    sample.requestStartedAt
  ) {
    throw new OkxServerTimeSynchronizationError(
      "responseReceivedAt must be greater than or equal to requestStartedAt.",
    );
  }

  return Object.freeze({
    requestStartedAt: sample.requestStartedAt,
    responseReceivedAt: sample.responseReceivedAt,
    serverTime: sample.serverTime,
  });
}

export function calculateOkxServerTimeState(
  sample: OkxServerTimeSample,
): OkxServerTimeSynchronizationState {
  const validatedSample =
    createOkxServerTimeSample(sample);

  const roundTripTimeMs =
    validatedSample.responseReceivedAt -
    validatedSample.requestStartedAt;

  const localMidpointMs =
    validatedSample.requestStartedAt +
    roundTripTimeMs / 2;

  const offsetMs =
    validatedSample.serverTime -
    localMidpointMs;

  return Object.freeze({
    synchronized: true,
    offsetMs,
    roundTripTimeMs,
    serverTimeMs: validatedSample.serverTime,
    localMidpointMs,
    synchronizedAtMs:
      validatedSample.responseReceivedAt,
  });
}

export function applyOkxServerTimeOffset(
  localTimestampMs: number,
  offsetMs: number,
): number {
  validateTimestamp(localTimestampMs, "localTimestampMs");
  validateFiniteNumber(offsetMs, "offsetMs");

  const correctedTimestamp =
    localTimestampMs + offsetMs;

  validateTimestamp(
    correctedTimestamp,
    "correctedTimestampMs",
  );

  return correctedTimestamp;
}

export function calculateOkxClockDriftMs(
  localTimestampMs: number,
  serverTimestampMs: number,
): number {
  validateTimestamp(localTimestampMs, "localTimestampMs");
  validateTimestamp(serverTimestampMs, "serverTimestampMs");

  return serverTimestampMs - localTimestampMs;
}

export function isOkxClockDriftAcceptable(
  driftMs: number,
  maximumAcceptedClockDriftMs: number,
): boolean {
  validateFiniteNumber(driftMs, "driftMs");

  validateMaximumAcceptedClockDrift(
    maximumAcceptedClockDriftMs,
  );

  return (
    Math.abs(driftMs) <=
    maximumAcceptedClockDriftMs
  );
}

export function assertOkxClockDriftAcceptable(
  driftMs: number,
  maximumAcceptedClockDriftMs: number,
): void {
  if (
    !isOkxClockDriftAcceptable(
      driftMs,
      maximumAcceptedClockDriftMs,
    )
  ) {
    throw new OkxServerTimeSynchronizationError(
      `OKX clock drift of ${driftMs}ms exceeds the maximum accepted drift of ${maximumAcceptedClockDriftMs}ms.`,
    );
  }
}

export class OkxServerTimeSynchronizer implements OkxClock {
  private state: OkxServerTimeSynchronizationState =
    UNSYNCHRONIZED_STATE;

  public constructor(
    private readonly localClock: OkxClock,
    private readonly serverTimeProvider:
      OkxServerTimeProvider,
    private readonly configuration:
      OkxServerTimeSynchronizerConfiguration,
  ) {
    validateClock(localClock);
    validateServerTimeProvider(serverTimeProvider);

    validateMaximumAcceptedClockDrift(
      configuration.maximumAcceptedClockDriftMs,
    );

    this.configuration = Object.freeze({
      maximumAcceptedClockDriftMs:
        configuration.maximumAcceptedClockDriftMs,
    });
  }

  public now(): number {
    const localTimestamp = this.localClock.now();

    validateTimestamp(
      localTimestamp,
      "localClock.now()",
    );

    return applyOkxServerTimeOffset(
      localTimestamp,
      this.state.offsetMs,
    );
  }

  public async synchronize(): Promise<
    OkxServerTimeSynchronizationState
  > {
    const requestStartedAt = this.localClock.now();

    validateTimestamp(
      requestStartedAt,
      "requestStartedAt",
    );

    const serverTime =
      await this.serverTimeProvider.getServerTime();

    validateTimestamp(serverTime, "serverTime");

    const responseReceivedAt = this.localClock.now();

    validateTimestamp(
      responseReceivedAt,
      "responseReceivedAt",
    );

    const nextState = calculateOkxServerTimeState({
      requestStartedAt,
      responseReceivedAt,
      serverTime,
    });

    assertOkxClockDriftAcceptable(
      nextState.offsetMs,
      this.configuration
        .maximumAcceptedClockDriftMs,
    );

    this.state = nextState;

    return nextState;
  }

  public getState():
    OkxServerTimeSynchronizationState {
    return this.state;
  }

  public getSnapshot():
    OkxServerTimeSynchronizerSnapshot {
    return Object.freeze({
      state: this.state,
      maximumAcceptedClockDriftMs:
        this.configuration
          .maximumAcceptedClockDriftMs,
    });
  }

  public isSynchronized(): boolean {
    return this.state.synchronized;
  }

  public reset(): void {
    this.state = UNSYNCHRONIZED_STATE;
  }
}

export function createDeterministicServerTimeProvider(
  serverTimes: readonly number[],
): OkxServerTimeProvider {
  if (!Array.isArray(serverTimes)) {
    throw new OkxServerTimeSynchronizationError(
      "serverTimes must be an array.",
    );
  }

  if (serverTimes.length === 0) {
    throw new OkxServerTimeSynchronizationError(
      "serverTimes must contain at least one timestamp.",
    );
  }

  const values = serverTimes.map(
    (serverTime, index) => {
      validateTimestamp(
        serverTime,
        `serverTimes[${index}]`,
      );

      return serverTime;
    },
  );

  let index = 0;

  return Object.freeze({
    async getServerTime(): Promise<number> {
      const currentIndex = Math.min(
        index,
        values.length - 1,
      );

      const value = values[currentIndex];

      index += 1;

      return value;
    },
  });
}

export function createSequenceOkxClock(
  timestamps: readonly number[],
): OkxClock {
  if (!Array.isArray(timestamps)) {
    throw new OkxServerTimeSynchronizationError(
      "timestamps must be an array.",
    );
  }

  if (timestamps.length === 0) {
    throw new OkxServerTimeSynchronizationError(
      "timestamps must contain at least one timestamp.",
    );
  }

  const values = timestamps.map(
    (timestamp, index) => {
      validateTimestamp(
        timestamp,
        `timestamps[${index}]`,
      );

      return timestamp;
    },
  );

  let index = 0;

  return Object.freeze({
    now(): number {
      const currentIndex = Math.min(
        index,
        values.length - 1,
      );

      const value = values[currentIndex];

      index += 1;

      return value;
    },
  });
}

export function createSynchronizedOkxClock(
  localClock: OkxClock,
  offsetMs: number,
): OkxClock {
  validateClock(localClock);
  validateFiniteNumber(offsetMs, "offsetMs");

  return Object.freeze({
    now(): number {
      const localTimestamp = localClock.now();

      validateTimestamp(
        localTimestamp,
        "localClock.now()",
      );

      return applyOkxServerTimeOffset(
        localTimestamp,
        offsetMs,
      );
    },
  });
}

function validateClock(clock: OkxClock): void {
  if (
    typeof clock !== "object" ||
    clock === null ||
    typeof clock.now !== "function"
  ) {
    throw new OkxServerTimeSynchronizationError(
      "localClock must implement OkxClock.",
    );
  }
}

function validateServerTimeProvider(
  provider: OkxServerTimeProvider,
): void {
  if (
    typeof provider !== "object" ||
    provider === null ||
    typeof provider.getServerTime !== "function"
  ) {
    throw new OkxServerTimeSynchronizationError(
      "serverTimeProvider must implement OkxServerTimeProvider.",
    );
  }
}

function validateMaximumAcceptedClockDrift(
  maximumAcceptedClockDriftMs: number,
): void {
  if (
    !Number.isInteger(
      maximumAcceptedClockDriftMs,
    ) ||
    maximumAcceptedClockDriftMs < 0
  ) {
    throw new OkxServerTimeSynchronizationError(
      "maximumAcceptedClockDriftMs must be a non-negative integer.",
    );
  }
}

function validateTimestamp(
  timestamp: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(timestamp) ||
    timestamp < 0
  ) {
    throw new OkxServerTimeSynchronizationError(
      `${fieldName} must be a non-negative integer timestamp.`,
    );
  }

  const maximumTimestamp =
    8_640_000_000_000_000;

  if (timestamp > maximumTimestamp) {
    throw new OkxServerTimeSynchronizationError(
      `${fieldName} exceeds the supported JavaScript date range.`,
    );
  }
}

function validateFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new OkxServerTimeSynchronizationError(
      `${fieldName} must be a finite number.`,
    );
  }
}