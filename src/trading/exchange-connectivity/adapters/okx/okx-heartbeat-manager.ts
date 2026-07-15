import {
  type OkxClock,
} from "./okx-authentication";

import {
  type OkxWebSocketConnection,
  type OkxWebSocketReadyState,
} from "./okx-websocket-transport";

export type OkxWebSocketLivenessState =
  | "idle"
  | "healthy"
  | "awaiting-pong"
  | "timed-out"
  | "stopped";

export interface OkxHeartbeatScheduler {
  setInterval(
    callback: () => void,
    intervalMs: number,
  ): unknown;

  clearInterval(handle: unknown): void;
}

export interface OkxHeartbeatConfiguration {
  readonly heartbeatIntervalMs: number;
  readonly pongTimeoutMs: number;
  readonly pingMessage?: string;
  readonly pongMessage?: string;
}

export interface OkxHeartbeatManagerDependencies {
  readonly connection: OkxWebSocketConnection;
  readonly clock: OkxClock;
  readonly scheduler: OkxHeartbeatScheduler;
  readonly configuration: OkxHeartbeatConfiguration;
}

export interface OkxHeartbeatSnapshot {
  readonly state: OkxWebSocketLivenessState;
  readonly running: boolean;
  readonly readyState: OkxWebSocketReadyState;
  readonly lastActivityAtMs?: number;
  readonly lastPingAtMs?: number;
  readonly lastPongAtMs?: number;
  readonly missedPongCount: number;
}

export class OkxHeartbeatManagerError extends Error {
  public readonly code =
    "OKX_HEARTBEAT_MANAGER_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxHeartbeatManagerError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxHeartbeatManager {
  private readonly connection:
    OkxWebSocketConnection;

  private readonly clock: OkxClock;

  private readonly scheduler:
    OkxHeartbeatScheduler;

  private readonly configuration:
    Readonly<Required<OkxHeartbeatConfiguration>>;

  private intervalHandle?: unknown;

  private running = false;

  private state: OkxWebSocketLivenessState =
    "idle";

  private lastActivityAtMs?: number;

  private lastPingAtMs?: number;

  private lastPongAtMs?: number;

  private missedPongCount = 0;

  public constructor(
    dependencies: OkxHeartbeatManagerDependencies,
  ) {
    validateDependencies(dependencies);

    this.connection = dependencies.connection;
    this.clock = dependencies.clock;
    this.scheduler = dependencies.scheduler;
    this.configuration = Object.freeze({
      heartbeatIntervalMs:
        dependencies.configuration
          .heartbeatIntervalMs,
      pongTimeoutMs:
        dependencies.configuration
          .pongTimeoutMs,
      pingMessage:
        dependencies.configuration
          .pingMessage ?? "ping",
      pongMessage:
        dependencies.configuration
          .pongMessage ?? "pong",
    });
  }

  public start(): void {
    if (this.running) {
      throw new OkxHeartbeatManagerError(
        "OKX heartbeat manager is already running.",
      );
    }

    if (
      this.connection.getReadyState() !== "open"
    ) {
      throw new OkxHeartbeatManagerError(
        "OKX WebSocket connection must be open before starting heartbeats.",
      );
    }

    this.running = true;
    this.state = "healthy";

    const now = this.readClock();

    this.lastActivityAtMs = now;

    this.intervalHandle =
      this.scheduler.setInterval(
        () => {
          this.tick();
        },
        this.configuration
          .heartbeatIntervalMs,
      );
  }

  public stop(): void {
    if (
      this.intervalHandle !== undefined
    ) {
      this.scheduler.clearInterval(
        this.intervalHandle,
      );

      this.intervalHandle = undefined;
    }

    this.running = false;
    this.state = "stopped";
  }

  public tick(): void {
    if (!this.running) {
      throw new OkxHeartbeatManagerError(
        "OKX heartbeat manager must be running before tick().",
      );
    }

    const now = this.readClock();

    if (
      this.state === "awaiting-pong" &&
      this.lastPingAtMs !== undefined
    ) {
      const elapsedSincePing =
        now - this.lastPingAtMs;

      if (
        elapsedSincePing >=
        this.configuration.pongTimeoutMs
      ) {
        this.state = "timed-out";
        this.missedPongCount += 1;

        return;
      }
    }

    if (
      this.connection.getReadyState() !== "open"
    ) {
      this.state = "timed-out";
      this.missedPongCount += 1;

      return;
    }

    const referenceActivity =
      this.lastActivityAtMs ?? now;

    const idleDuration =
      now - referenceActivity;

    if (
      idleDuration >=
      this.configuration
        .heartbeatIntervalMs
    ) {
      this.sendPing(now);
    }
  }

  public recordActivity(
    timestampMs?: number,
  ): void {
    const timestamp =
      timestampMs ?? this.readClock();

    validateTimestamp(
      timestamp,
      "timestampMs",
    );

    this.lastActivityAtMs = timestamp;

    if (this.state === "idle") {
      this.state = "healthy";
    }
  }

  public recordPong(
    message = "pong",
    timestampMs?: number,
  ): void {
    const normalizedMessage =
      requireNonEmptyString(
        message,
        "message",
      );

    if (
      normalizedMessage !==
      this.configuration.pongMessage
    ) {
      throw new OkxHeartbeatManagerError(
        `Unexpected OKX pong message: "${normalizedMessage}".`,
      );
    }

    const timestamp =
      timestampMs ?? this.readClock();

    validateTimestamp(
      timestamp,
      "timestampMs",
    );

    this.lastPongAtMs = timestamp;
    this.lastActivityAtMs = timestamp;
    this.state = "healthy";
  }

  public handleIncomingMessage(
    message: string,
    timestampMs?: number,
  ): boolean {
    const normalizedMessage =
      requireNonEmptyString(
        message,
        "message",
      );

    if (
      normalizedMessage ===
      this.configuration.pongMessage
    ) {
      this.recordPong(
        normalizedMessage,
        timestampMs,
      );

      return true;
    }

    this.recordActivity(timestampMs);

    return false;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isHealthy(): boolean {
    return (
      this.state === "healthy" ||
      this.state === "awaiting-pong"
    );
  }

  public hasTimedOut(): boolean {
    return this.state === "timed-out";
  }

  public getSnapshot():
    OkxHeartbeatSnapshot {
    return Object.freeze({
      state: this.state,
      running: this.running,
      readyState:
        this.connection.getReadyState(),
      ...(this.lastActivityAtMs !== undefined
        ? {
            lastActivityAtMs:
              this.lastActivityAtMs,
          }
        : {}),
      ...(this.lastPingAtMs !== undefined
        ? {
            lastPingAtMs:
              this.lastPingAtMs,
          }
        : {}),
      ...(this.lastPongAtMs !== undefined
        ? {
            lastPongAtMs:
              this.lastPongAtMs,
          }
        : {}),
      missedPongCount:
        this.missedPongCount,
    });
  }

  private sendPing(
    timestampMs: number,
  ): void {
    this.connection.send(
      this.configuration.pingMessage,
    );

    this.lastPingAtMs = timestampMs;
    this.state = "awaiting-pong";
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

export function createDeterministicOkxHeartbeatScheduler():
  OkxHeartbeatScheduler & {
    readonly runNext: () => void;
    readonly runAll: () => void;
    readonly getScheduledCount: () => number;
    readonly getClearedCount: () => number;
  } {
  const callbacks = new Map<
    number,
    () => void
  >();

  let nextHandle = 1;
  let clearedCount = 0;

  return Object.freeze({
    setInterval(
      callback: () => void,
      intervalMs: number,
    ): number {
      if (typeof callback !== "function") {
        throw new OkxHeartbeatManagerError(
          "callback must be a function.",
        );
      }

      validatePositiveInteger(
        intervalMs,
        "intervalMs",
      );

      const handle = nextHandle;

      nextHandle += 1;
      callbacks.set(handle, callback);

      return handle;
    },

    clearInterval(handle: unknown): void {
      if (
        typeof handle !== "number" ||
        !Number.isInteger(handle)
      ) {
        throw new OkxHeartbeatManagerError(
          "handle must be an integer.",
        );
      }

      if (callbacks.delete(handle)) {
        clearedCount += 1;
      }
    },

    runNext(): void {
      const first =
        callbacks.values().next();

      if (first.done) {
        throw new OkxHeartbeatManagerError(
          "No scheduled heartbeat callback is available.",
        );
      }

      first.value();
    },

    runAll(): void {
      for (const callback of callbacks.values()) {
        callback();
      }
    },

    getScheduledCount(): number {
      return callbacks.size;
    },

    getClearedCount(): number {
      return clearedCount;
    },
  });
}

export function createSystemOkxHeartbeatScheduler():
  OkxHeartbeatScheduler {
  return Object.freeze({
    setInterval(
      callback: () => void,
      intervalMs: number,
    ): ReturnType<typeof setInterval> {
      return setInterval(
        callback,
        intervalMs,
      );
    },

    clearInterval(handle: unknown): void {
      clearInterval(
        handle as ReturnType<typeof setInterval>,
      );
    },
  });
}

function validateDependencies(
  dependencies: OkxHeartbeatManagerDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw new OkxHeartbeatManagerError(
      "dependencies must be an object.",
    );
  }

  if (
    typeof dependencies.connection !==
      "object" ||
    dependencies.connection === null ||
    typeof dependencies.connection
      .getReadyState !== "function" ||
    typeof dependencies.connection.send !==
      "function"
  ) {
    throw new OkxHeartbeatManagerError(
      "connection must implement OkxWebSocketConnection.",
    );
  }

  if (
    typeof dependencies.clock !== "object" ||
    dependencies.clock === null ||
    typeof dependencies.clock.now !==
      "function"
  ) {
    throw new OkxHeartbeatManagerError(
      "clock must implement OkxClock.",
    );
  }

  if (
    typeof dependencies.scheduler !==
      "object" ||
    dependencies.scheduler === null ||
    typeof dependencies.scheduler
      .setInterval !== "function" ||
    typeof dependencies.scheduler
      .clearInterval !== "function"
  ) {
    throw new OkxHeartbeatManagerError(
      "scheduler must implement OkxHeartbeatScheduler.",
    );
  }

  validatePositiveInteger(
    dependencies.configuration
      .heartbeatIntervalMs,
    "heartbeatIntervalMs",
  );

  validatePositiveInteger(
    dependencies.configuration
      .pongTimeoutMs,
    "pongTimeoutMs",
  );

  if (
    dependencies.configuration
      .pongTimeoutMs >
    dependencies.configuration
      .heartbeatIntervalMs
  ) {
    throw new OkxHeartbeatManagerError(
      "pongTimeoutMs must be less than or equal to heartbeatIntervalMs.",
    );
  }

  if (
    dependencies.configuration
      .pingMessage !== undefined
  ) {
    requireNonEmptyString(
      dependencies.configuration
        .pingMessage,
      "pingMessage",
    );
  }

  if (
    dependencies.configuration
      .pongMessage !== undefined
  ) {
    requireNonEmptyString(
      dependencies.configuration
        .pongMessage,
      "pongMessage",
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
    throw new OkxHeartbeatManagerError(
      `${fieldName} must be a positive integer.`,
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
    throw new OkxHeartbeatManagerError(
      `${fieldName} must be a non-negative integer timestamp.`,
    );
  }
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxHeartbeatManagerError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxHeartbeatManagerError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}