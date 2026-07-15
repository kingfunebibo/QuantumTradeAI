import {
  type OkxClock,
} from "./okx-authentication";

export type OkxReconnectState =
  | "idle"
  | "scheduled"
  | "reconnecting"
  | "exhausted"
  | "stopped";

export interface OkxReconnectScheduler {
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): unknown;

  clearTimeout(handle: unknown): void;
}

export interface OkxReconnectConfiguration {
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly multiplier: number;
  readonly maximumAttempts: number;
  readonly retryableCloseCodes?: readonly number[];
}

export interface OkxReconnectAttempt {
  readonly attempt: number;
  readonly delayMs: number;
  readonly scheduledAtMs: number;
  readonly executeAtMs: number;
}

export interface OkxReconnectSnapshot {
  readonly state: OkxReconnectState;
  readonly attemptCount: number;
  readonly maximumAttempts: number;
  readonly nextAttempt?: OkxReconnectAttempt;
  readonly lastCloseCode?: number;
  readonly lastError?: unknown;
}

export interface OkxReconnectManagerDependencies {
  readonly clock: OkxClock;
  readonly scheduler: OkxReconnectScheduler;
  readonly configuration: OkxReconnectConfiguration;
  readonly reconnect: () => void;
}

export class OkxReconnectManagerError extends Error {
  public readonly code =
    "OKX_RECONNECT_MANAGER_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxReconnectManagerError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxReconnectManager {
  private readonly clock: OkxClock;

  private readonly scheduler:
    OkxReconnectScheduler;

  private readonly configuration:
    Readonly<Required<OkxReconnectConfiguration>>;

  private readonly reconnectCallback:
    () => void;

  private state: OkxReconnectState = "idle";

  private attemptCount = 0;

  private timeoutHandle?: unknown;

  private nextAttempt?: OkxReconnectAttempt;

  private lastCloseCode?: number;

  private lastError?: unknown;

  public constructor(
    dependencies: OkxReconnectManagerDependencies,
  ) {
    validateDependencies(dependencies);

    this.clock = dependencies.clock;
    this.scheduler = dependencies.scheduler;
    this.reconnectCallback =
      dependencies.reconnect;

    this.configuration = Object.freeze({
      initialDelayMs:
        dependencies.configuration
          .initialDelayMs,
      maximumDelayMs:
        dependencies.configuration
          .maximumDelayMs,
      multiplier:
        dependencies.configuration.multiplier,
      maximumAttempts:
        dependencies.configuration
          .maximumAttempts,
      retryableCloseCodes:
        Object.freeze([
          ...(
            dependencies.configuration
              .retryableCloseCodes ??
            [
              1001,
              1006,
              1011,
              1012,
              1013,
            ]
          ),
        ]),
    });
  }

  public scheduleReconnect(
    closeCode?: number,
    error?: unknown,
  ): OkxReconnectAttempt {
    if (this.state === "stopped") {
      throw new OkxReconnectManagerError(
        "Cannot schedule reconnect after the manager has been stopped.",
      );
    }

    if (this.state === "scheduled") {
      throw new OkxReconnectManagerError(
        "An OKX reconnect attempt is already scheduled.",
      );
    }

    if (
      closeCode !== undefined &&
      !this.isRetryableCloseCode(closeCode)
    ) {
      throw new OkxReconnectManagerError(
        `OKX WebSocket close code ${closeCode} is not retryable.`,
      );
    }

    if (
      this.attemptCount >=
      this.configuration.maximumAttempts
    ) {
      this.state = "exhausted";

      throw new OkxReconnectManagerError(
        "Maximum OKX reconnect attempts have been exhausted.",
      );
    }

    this.lastCloseCode = closeCode;
    this.lastError = error;

    const attempt =
      this.attemptCount + 1;

    const delayMs =
      calculateOkxReconnectDelay(
        attempt,
        this.configuration,
      );

    const scheduledAtMs =
      this.readClock();

    const nextAttempt =
      Object.freeze({
        attempt,
        delayMs,
        scheduledAtMs,
        executeAtMs:
          scheduledAtMs + delayMs,
      });

    this.nextAttempt = nextAttempt;
    this.state = "scheduled";

    this.timeoutHandle =
      this.scheduler.setTimeout(
        () => {
          this.executeReconnect();
        },
        delayMs,
      );

    return nextAttempt;
  }

  public cancelScheduledReconnect(): void {
    if (
      this.timeoutHandle !== undefined
    ) {
      this.scheduler.clearTimeout(
        this.timeoutHandle,
      );

      this.timeoutHandle = undefined;
    }

    this.nextAttempt = undefined;

    if (this.state === "scheduled") {
      this.state = "idle";
    }
  }

  public markConnected(): void {
    this.cancelScheduledReconnect();

    this.attemptCount = 0;
    this.lastCloseCode = undefined;
    this.lastError = undefined;
    this.state = "idle";
  }

  public reset(): void {
    this.cancelScheduledReconnect();

    this.attemptCount = 0;
    this.lastCloseCode = undefined;
    this.lastError = undefined;
    this.state = "idle";
  }

  public stop(): void {
    this.cancelScheduledReconnect();
    this.state = "stopped";
  }

  public isRetryableCloseCode(
    closeCode: number,
  ): boolean {
    validateCloseCode(closeCode);

    return this.configuration
      .retryableCloseCodes
      .includes(closeCode);
  }

  public canRetry(): boolean {
    return (
      this.state !== "stopped" &&
      this.attemptCount <
        this.configuration.maximumAttempts
    );
  }

  public getSnapshot():
    OkxReconnectSnapshot {
    return Object.freeze({
      state: this.state,
      attemptCount: this.attemptCount,
      maximumAttempts:
        this.configuration.maximumAttempts,
      ...(this.nextAttempt !== undefined
        ? {
            nextAttempt:
              this.nextAttempt,
          }
        : {}),
      ...(this.lastCloseCode !== undefined
        ? {
            lastCloseCode:
              this.lastCloseCode,
          }
        : {}),
      ...(this.lastError !== undefined
        ? {
            lastError:
              this.lastError,
          }
        : {}),
    });
  }

  private executeReconnect(): void {
    if (this.state !== "scheduled") {
      return;
    }

    this.timeoutHandle = undefined;
    this.nextAttempt = undefined;
    this.state = "reconnecting";
    this.attemptCount += 1;

    try {
      this.reconnectCallback();
    } catch (error: unknown) {
      this.lastError = error;

      if (
        this.attemptCount >=
        this.configuration.maximumAttempts
      ) {
        this.state = "exhausted";
      } else {
        this.state = "idle";
      }

      throw error;
    }

    if (
      this.attemptCount >=
      this.configuration.maximumAttempts
    ) {
      this.state = "exhausted";
    } else {
      this.state = "idle";
    }
  }

  private readClock(): number {
    const timestamp = this.clock.now();

    validateTimestamp(
      timestamp,
      "clock.now()",
    );

    return timestamp;
  }
}

export function calculateOkxReconnectDelay(
  attempt: number,
  configuration: Pick<
    OkxReconnectConfiguration,
    | "initialDelayMs"
    | "maximumDelayMs"
    | "multiplier"
  >,
): number {
  validatePositiveInteger(
    attempt,
    "attempt",
  );

  validatePositiveInteger(
    configuration.initialDelayMs,
    "initialDelayMs",
  );

  validatePositiveInteger(
    configuration.maximumDelayMs,
    "maximumDelayMs",
  );

  validateMultiplier(
    configuration.multiplier,
  );

  if (
    configuration.maximumDelayMs <
    configuration.initialDelayMs
  ) {
    throw new OkxReconnectManagerError(
      "maximumDelayMs must be greater than or equal to initialDelayMs.",
    );
  }

  const rawDelay =
    configuration.initialDelayMs *
    Math.pow(
      configuration.multiplier,
      attempt - 1,
    );

  const boundedDelay = Math.min(
    rawDelay,
    configuration.maximumDelayMs,
  );

  if (
    !Number.isFinite(boundedDelay) ||
    boundedDelay <= 0
  ) {
    throw new OkxReconnectManagerError(
      "Calculated reconnect delay must be a positive finite number.",
    );
  }

  return Math.floor(boundedDelay);
}

export function createDeterministicOkxReconnectScheduler():
  OkxReconnectScheduler & {
    readonly runNext: () => void;
    readonly runAll: () => void;
    readonly getScheduledCount: () => number;
    readonly getClearedCount: () => number;
    readonly getDelays: () => readonly number[];
  } {
  const callbacks = new Map<
    number,
    {
      readonly callback: () => void;
      readonly delayMs: number;
    }
  >();

  let nextHandle = 1;
  let clearedCount = 0;

  return Object.freeze({
    setTimeout(
      callback: () => void,
      delayMs: number,
    ): number {
      if (typeof callback !== "function") {
        throw new OkxReconnectManagerError(
          "callback must be a function.",
        );
      }

      validatePositiveInteger(
        delayMs,
        "delayMs",
      );

      const handle = nextHandle;

      nextHandle += 1;

      callbacks.set(handle, {
        callback,
        delayMs,
      });

      return handle;
    },

    clearTimeout(handle: unknown): void {
      if (
        typeof handle !== "number" ||
        !Number.isInteger(handle)
      ) {
        throw new OkxReconnectManagerError(
          "handle must be an integer.",
        );
      }

      if (callbacks.delete(handle)) {
        clearedCount += 1;
      }
    },

    runNext(): void {
      const next =
        callbacks.entries().next();

      if (next.done) {
        throw new OkxReconnectManagerError(
          "No scheduled reconnect callback is available.",
        );
      }

      const [handle, entry] = next.value;

      callbacks.delete(handle);
      entry.callback();
    },

    runAll(): void {
      const entries =
        Array.from(callbacks.entries());

      callbacks.clear();

      for (const [, entry] of entries) {
        entry.callback();
      }
    },

    getScheduledCount(): number {
      return callbacks.size;
    },

    getClearedCount(): number {
      return clearedCount;
    },

    getDelays(): readonly number[] {
      return Object.freeze(
        Array.from(
          callbacks.values(),
          (entry) => entry.delayMs,
        ),
      );
    },
  });
}

export function createSystemOkxReconnectScheduler():
  OkxReconnectScheduler {
  return Object.freeze({
    setTimeout(
      callback: () => void,
      delayMs: number,
    ): ReturnType<typeof setTimeout> {
      return setTimeout(
        callback,
        delayMs,
      );
    },

    clearTimeout(handle: unknown): void {
      clearTimeout(
        handle as ReturnType<typeof setTimeout>,
      );
    },
  });
}

function validateDependencies(
  dependencies:
    OkxReconnectManagerDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw new OkxReconnectManagerError(
      "dependencies must be an object.",
    );
  }

  if (
    typeof dependencies.clock !== "object" ||
    dependencies.clock === null ||
    typeof dependencies.clock.now !==
      "function"
  ) {
    throw new OkxReconnectManagerError(
      "clock must implement OkxClock.",
    );
  }

  if (
    typeof dependencies.scheduler !==
      "object" ||
    dependencies.scheduler === null ||
    typeof dependencies.scheduler
      .setTimeout !== "function" ||
    typeof dependencies.scheduler
      .clearTimeout !== "function"
  ) {
    throw new OkxReconnectManagerError(
      "scheduler must implement OkxReconnectScheduler.",
    );
  }

  if (
    typeof dependencies.reconnect !==
      "function"
  ) {
    throw new OkxReconnectManagerError(
      "reconnect must be a function.",
    );
  }

  validatePositiveInteger(
    dependencies.configuration
      .initialDelayMs,
    "initialDelayMs",
  );

  validatePositiveInteger(
    dependencies.configuration
      .maximumDelayMs,
    "maximumDelayMs",
  );

  validateMultiplier(
    dependencies.configuration.multiplier,
  );

  validatePositiveInteger(
    dependencies.configuration
      .maximumAttempts,
    "maximumAttempts",
  );

  if (
    dependencies.configuration
      .maximumDelayMs <
    dependencies.configuration
      .initialDelayMs
  ) {
    throw new OkxReconnectManagerError(
      "maximumDelayMs must be greater than or equal to initialDelayMs.",
    );
  }

  const retryableCloseCodes =
    dependencies.configuration
      .retryableCloseCodes;

  if (
    retryableCloseCodes !== undefined
  ) {
    if (!Array.isArray(retryableCloseCodes)) {
      throw new OkxReconnectManagerError(
        "retryableCloseCodes must be an array.",
      );
    }

    for (
      let index = 0;
      index < retryableCloseCodes.length;
      index += 1
    ) {
      validateCloseCode(
        retryableCloseCodes[index],
      );
    }
  }
}

function validateCloseCode(
  closeCode: number,
): void {
  if (
    !Number.isInteger(closeCode) ||
    closeCode < 1000 ||
    closeCode > 4999
  ) {
    throw new OkxReconnectManagerError(
      "WebSocket close code must be an integer between 1000 and 4999.",
    );
  }
}

function validateTimestamp(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new OkxReconnectManagerError(
      `${fieldName} must be a non-negative integer timestamp.`,
    );
  }
}

function validatePositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new OkxReconnectManagerError(
      `${fieldName} must be a positive integer.`,
    );
  }
}

function validateMultiplier(
  value: number,
): void {
  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new OkxReconnectManagerError(
      "multiplier must be a finite number greater than or equal to 1.",
    );
  }
}