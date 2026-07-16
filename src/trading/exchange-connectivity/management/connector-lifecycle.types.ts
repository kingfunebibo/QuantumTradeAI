/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/connector-lifecycle.types.ts
 *
 * Purpose:
 * Defines deterministic lifecycle contracts, state transitions, health models,
 * immutable snapshots, command results, and validation utilities for managed
 * exchange connectors.
 */

/**
 * Supported lifecycle states for managed exchange connectors.
 */
export type ConnectorLifecycleState =
  | "UNINITIALIZED"
  | "INITIALIZING"
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "DEGRADED"
  | "STOPPING"
  | "RESTARTING"
  | "FAILED"
  | "DISPOSED";

/**
 * Lifecycle commands supported by the orchestration layer.
 */
export type ConnectorLifecycleCommand =
  | "INITIALIZE"
  | "START"
  | "STOP"
  | "RESTART"
  | "MARK_DEGRADED"
  | "MARK_RECOVERED"
  | "MARK_FAILED"
  | "DISPOSE";

/**
 * Connector health classifications.
 */
export type ConnectorHealthStatus =
  | "UNKNOWN"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY";

/**
 * Machine-readable reasons for lifecycle transitions.
 */
export type ConnectorLifecycleTransitionReason =
  | "COMMAND"
  | "INITIALIZATION_COMPLETED"
  | "START_COMPLETED"
  | "STOP_COMPLETED"
  | "RESTART_COMPLETED"
  | "HEALTH_DEGRADED"
  | "HEALTH_RECOVERED"
  | "OPERATION_FAILED"
  | "DISPOSAL_COMPLETED"
  | "MANUAL_OVERRIDE";

/**
 * Stable lifecycle error classifications.
 */
export type ConnectorLifecycleErrorCode =
  | "INVALID_EXCHANGE_ID"
  | "INVALID_STATE"
  | "INVALID_TRANSITION"
  | "INVALID_SEQUENCE"
  | "INVALID_TIMESTAMP"
  | "INVALID_HEALTH_STATUS"
  | "INVALID_METADATA"
  | "COMMAND_NOT_ALLOWED"
  | "INITIALIZATION_FAILED"
  | "START_FAILED"
  | "STOP_FAILED"
  | "RESTART_FAILED"
  | "DISPOSAL_FAILED"
  | "CONNECTOR_ALREADY_DISPOSED"
  | "CONNECTOR_NOT_REGISTERED"
  | "LIFECYCLE_OPERATION_IN_PROGRESS";

/**
 * Domain-specific lifecycle failure.
 */
export class ConnectorLifecycleError extends Error {
  public readonly code: ConnectorLifecycleErrorCode;

  public readonly exchangeId?: string;

  public readonly state?: ConnectorLifecycleState;

  public constructor(
    code: ConnectorLifecycleErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: string;
      state?: ConnectorLifecycleState;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "ConnectorLifecycleError";
    this.code = code;
    this.exchangeId = options.exchangeId;
    this.state = options.state;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Immutable health observation for a managed connector.
 */
export interface ConnectorHealthSnapshot {
  readonly status: ConnectorHealthStatus;

  /**
   * Deterministic timestamp supplied by the lifecycle clock.
   */
  readonly observedAt: number;

  readonly reason?: string;

  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable lifecycle state transition.
 */
export interface ConnectorLifecycleTransition {
  readonly exchangeId: string;

  readonly from: ConnectorLifecycleState;

  readonly to: ConnectorLifecycleState;

  readonly command?: ConnectorLifecycleCommand;

  readonly reason: ConnectorLifecycleTransitionReason;

  /**
   * Monotonically increasing sequence local to one connector lifecycle.
   */
  readonly sequence: number;

  /**
   * Deterministic transition timestamp.
   */
  readonly transitionedAt: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable lifecycle state snapshot.
 */
export interface ConnectorLifecycleSnapshot {
  readonly exchangeId: string;

  readonly state: ConnectorLifecycleState;

  /**
   * Increases after every successful state transition.
   */
  readonly version: number;

  readonly transitionSequence: number;

  readonly lastTransitionAt?: number;

  readonly health: ConnectorHealthSnapshot;

  readonly lastTransition?: ConnectorLifecycleTransition;

  readonly operationInProgress: boolean;

  readonly activeCommand?: ConnectorLifecycleCommand;
}

/**
 * Classification returned after evaluating a lifecycle command.
 */
export type ConnectorLifecycleCommandOutcome =
  | "COMPLETED"
  | "NO_CHANGE";

/**
 * Immutable lifecycle command result.
 */
export interface ConnectorLifecycleCommandResult {
  readonly command: ConnectorLifecycleCommand;

  readonly outcome: ConnectorLifecycleCommandOutcome;

  readonly previousSnapshot: ConnectorLifecycleSnapshot;

  readonly currentSnapshot: ConnectorLifecycleSnapshot;

  /**
   * A restart or recovery operation may produce multiple transitions.
   */
  readonly transitions: readonly ConnectorLifecycleTransition[];
}

/**
 * Input used to mark a running connector as degraded.
 */
export interface MarkConnectorDegradedInput {
  readonly reason: string;

  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

/**
 * Input used to mark a connector as failed.
 */
export interface MarkConnectorFailedInput {
  readonly reason: string;

  readonly cause?: unknown;

  readonly diagnostics?: Readonly<Record<string, unknown>>;
}

/**
 * Minimum lifecycle operations required from a managed connector.
 *
 * Existing exchange connectors may implement this interface directly or be
 * wrapped by a thin lifecycle adapter.
 */
export interface ManagedConnectorLifecycleAdapter {
  initialize(): Promise<void>;

  start(): Promise<void>;

  stop(): Promise<void>;

  dispose(): Promise<void>;

  getHealth?(): Promise<
    Readonly<{
      readonly status: ConnectorHealthStatus;
      readonly reason?: string;
      readonly diagnostics?: Readonly<Record<string, unknown>>;
    }>
  >;
}

/**
 * Injectable lifecycle clock.
 *
 * Deterministic tests should supply a controlled implementation.
 */
export interface ConnectorLifecycleClock {
  now(): number;
}

/**
 * Default production lifecycle clock.
 */
export class SystemConnectorLifecycleClock
  implements ConnectorLifecycleClock
{
  public now(): number {
    return Date.now();
  }
}

/**
 * Public lifecycle manager contract.
 */
export interface ConnectorLifecycleManagerContract {
  initialize(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult>;

  start(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult>;

  stop(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult>;

  restart(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult>;

  dispose(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult>;

  markDegraded(
    exchangeId: string,
    input: MarkConnectorDegradedInput,
  ): ConnectorLifecycleCommandResult;

  markRecovered(
    exchangeId: string,
  ): ConnectorLifecycleCommandResult;

  markFailed(
    exchangeId: string,
    input: MarkConnectorFailedInput,
  ): ConnectorLifecycleCommandResult;

  inspect(exchangeId: string): ConnectorLifecycleSnapshot;

  inspectAll(): readonly ConnectorLifecycleSnapshot[];

  refreshHealth(
    exchangeId: string,
  ): Promise<ConnectorLifecycleSnapshot>;
}

/**
 * Canonical lifecycle state values.
 */
export const CONNECTOR_LIFECYCLE_STATES = [
  "UNINITIALIZED",
  "INITIALIZING",
  "STOPPED",
  "STARTING",
  "RUNNING",
  "DEGRADED",
  "STOPPING",
  "RESTARTING",
  "FAILED",
  "DISPOSED",
] as const satisfies readonly ConnectorLifecycleState[];

/**
 * Canonical lifecycle command values.
 */
export const CONNECTOR_LIFECYCLE_COMMANDS = [
  "INITIALIZE",
  "START",
  "STOP",
  "RESTART",
  "MARK_DEGRADED",
  "MARK_RECOVERED",
  "MARK_FAILED",
  "DISPOSE",
] as const satisfies readonly ConnectorLifecycleCommand[];

/**
 * Explicit deterministic lifecycle transition map.
 *
 * The `satisfies` operator validates that every lifecycle state is represented
 * and every transition target is a supported ConnectorLifecycleState while
 * preserving literal array types.
 */
export const CONNECTOR_LIFECYCLE_TRANSITIONS = {
  UNINITIALIZED: [
    "INITIALIZING",
    "FAILED",
    "DISPOSED",
  ],
  INITIALIZING: [
    "STOPPED",
    "FAILED",
    "DISPOSED",
  ],
  STOPPED: [
    "STARTING",
    "FAILED",
    "DISPOSED",
  ],
  STARTING: [
    "RUNNING",
    "FAILED",
    "STOPPING",
  ],
  RUNNING: [
    "DEGRADED",
    "STOPPING",
    "RESTARTING",
    "FAILED",
  ],
  DEGRADED: [
    "RUNNING",
    "STOPPING",
    "RESTARTING",
    "FAILED",
  ],
  STOPPING: [
    "STOPPED",
    "FAILED",
    "DISPOSED",
  ],
  RESTARTING: [
    "STOPPED",
    "STARTING",
    "RUNNING",
    "FAILED",
  ],
  FAILED: [
    "INITIALIZING",
    "STARTING",
    "STOPPING",
    "RESTARTING",
    "DISPOSED",
  ],
  DISPOSED: [],
} as const satisfies Readonly<
  Record<
    ConnectorLifecycleState,
    readonly ConnectorLifecycleState[]
  >
>;

/**
 * Returns whether a value is a supported lifecycle state.
 */
export function isConnectorLifecycleState(
  value: unknown,
): value is ConnectorLifecycleState {
  return (
    typeof value === "string" &&
    (
      CONNECTOR_LIFECYCLE_STATES as readonly string[]
    ).includes(value)
  );
}

/**
 * Returns whether a value is a supported lifecycle command.
 */
export function isConnectorLifecycleCommand(
  value: unknown,
): value is ConnectorLifecycleCommand {
  return (
    typeof value === "string" &&
    (
      CONNECTOR_LIFECYCLE_COMMANDS as readonly string[]
    ).includes(value)
  );
}

/**
 * Returns whether a value is a supported health status.
 */
export function isConnectorHealthStatus(
  value: unknown,
): value is ConnectorHealthStatus {
  return (
    value === "UNKNOWN" ||
    value === "HEALTHY" ||
    value === "DEGRADED" ||
    value === "UNHEALTHY"
  );
}

/**
 * Returns whether a direct lifecycle transition is permitted.
 */
export function canTransitionConnectorLifecycle(
  from: ConnectorLifecycleState,
  to: ConnectorLifecycleState,
): boolean {
  const permittedTransitions:
    readonly ConnectorLifecycleState[] =
      CONNECTOR_LIFECYCLE_TRANSITIONS[from];

  return permittedTransitions.includes(to);
}

/**
 * Validates a direct lifecycle transition.
 */
export function assertConnectorLifecycleTransition(
  from: ConnectorLifecycleState,
  to: ConnectorLifecycleState,
): void {
  if (!isConnectorLifecycleState(from)) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported connector lifecycle state "${String(from)}".`,
    );
  }

  if (!isConnectorLifecycleState(to)) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported connector lifecycle state "${String(to)}".`,
    );
  }

  if (!canTransitionConnectorLifecycle(from, to)) {
    throw new ConnectorLifecycleError(
      "INVALID_TRANSITION",
      `Connector lifecycle transition from "${from}" to "${to}" is not allowed.`,
      {
        state: from,
      },
    );
  }
}

/**
 * Creates an immutable connector health snapshot.
 */
export function createConnectorHealthSnapshot(
  input: Readonly<{
    status: ConnectorHealthStatus;
    observedAt: number;
    reason?: string;
    diagnostics?: Readonly<Record<string, unknown>>;
  }>,
): ConnectorHealthSnapshot {
  assertFiniteNonNegativeTimestamp(input.observedAt);

  if (!isConnectorHealthStatus(input.status)) {
    throw new ConnectorLifecycleError(
      "INVALID_HEALTH_STATUS",
      `Unsupported connector health status "${String(input.status)}".`,
    );
  }

  const reason = normalizeOptionalText(input.reason);

  const diagnostics =
    input.diagnostics === undefined
      ? undefined
      : freezeRecord(input.diagnostics);

  return Object.freeze({
    status: input.status,
    observedAt: input.observedAt,
    ...(reason === undefined ? {} : { reason }),
    ...(diagnostics === undefined ? {} : { diagnostics }),
  });
}

/**
 * Creates the initial lifecycle snapshot for a connector.
 */
export function createInitialConnectorLifecycleSnapshot(
  exchangeId: string,
  observedAt: number,
): ConnectorLifecycleSnapshot {
  const normalizedExchangeId =
    normalizeLifecycleExchangeId(exchangeId);

  return Object.freeze({
    exchangeId: normalizedExchangeId,
    state: "UNINITIALIZED",
    version: 0,
    transitionSequence: 0,
    health: createConnectorHealthSnapshot({
      status: "UNKNOWN",
      observedAt,
    }),
    operationInProgress: false,
  });
}

/**
 * Creates an immutable lifecycle transition.
 */
export function createConnectorLifecycleTransition(
  input: Readonly<{
    exchangeId: string;
    from: ConnectorLifecycleState;
    to: ConnectorLifecycleState;
    reason: ConnectorLifecycleTransitionReason;
    sequence: number;
    transitionedAt: number;
    command?: ConnectorLifecycleCommand;
    metadata?: Readonly<Record<string, unknown>>;
  }>,
): ConnectorLifecycleTransition {
  const exchangeId =
    normalizeLifecycleExchangeId(input.exchangeId);

  assertConnectorLifecycleTransition(
    input.from,
    input.to,
  );

  assertPositiveInteger(
    input.sequence,
    "Transition sequence",
  );

  assertFiniteNonNegativeTimestamp(
    input.transitionedAt,
  );

  if (
    input.command !== undefined &&
    !isConnectorLifecycleCommand(input.command)
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported connector lifecycle command "${String(
        input.command,
      )}".`,
      {
        exchangeId,
        state: input.from,
      },
    );
  }

  const metadata =
    input.metadata === undefined
      ? undefined
      : freezeRecord(input.metadata);

  return Object.freeze({
    exchangeId,
    from: input.from,
    to: input.to,
    reason: input.reason,
    sequence: input.sequence,
    transitionedAt: input.transitionedAt,
    ...(input.command === undefined
      ? {}
      : { command: input.command }),
    ...(metadata === undefined
      ? {}
      : { metadata }),
  });
}

/**
 * Applies a validated transition to a lifecycle snapshot.
 */
export function applyConnectorLifecycleTransition(
  snapshot: ConnectorLifecycleSnapshot,
  transition: ConnectorLifecycleTransition,
  health?: ConnectorHealthSnapshot,
): ConnectorLifecycleSnapshot {
  if (snapshot.exchangeId !== transition.exchangeId) {
    throw new ConnectorLifecycleError(
      "INVALID_EXCHANGE_ID",
      `Transition exchange "${transition.exchangeId}" does not match snapshot exchange "${snapshot.exchangeId}".`,
      {
        exchangeId: transition.exchangeId,
        state: snapshot.state,
      },
    );
  }

  if (snapshot.state !== transition.from) {
    throw new ConnectorLifecycleError(
      "INVALID_TRANSITION",
      `Transition expected connector state "${transition.from}" but the snapshot is "${snapshot.state}".`,
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  assertConnectorLifecycleTransition(
    transition.from,
    transition.to,
  );

  const expectedSequence =
    snapshot.transitionSequence + 1;

  if (transition.sequence !== expectedSequence) {
    throw new ConnectorLifecycleError(
      "INVALID_SEQUENCE",
      `Transition sequence must be ${expectedSequence}, received ${transition.sequence}.`,
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  if (
    snapshot.lastTransitionAt !== undefined &&
    transition.transitionedAt <
      snapshot.lastTransitionAt
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_TIMESTAMP",
      "Lifecycle transition timestamps must be monotonically non-decreasing.",
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  return Object.freeze({
    exchangeId: snapshot.exchangeId,
    state: transition.to,
    version: snapshot.version + 1,
    transitionSequence: transition.sequence,
    lastTransitionAt: transition.transitionedAt,
    health: health ?? snapshot.health,
    lastTransition: transition,
    operationInProgress: false,
  });
}

/**
 * Creates a snapshot representing an active lifecycle operation.
 *
 * This does not increment lifecycle version or transition sequence because no
 * state transition has completed yet.
 */
export function createLifecycleOperationSnapshot(
  snapshot: ConnectorLifecycleSnapshot,
  command: ConnectorLifecycleCommand,
): ConnectorLifecycleSnapshot {
  if (!isConnectorLifecycleCommand(command)) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported connector lifecycle command "${String(command)}".`,
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  if (snapshot.operationInProgress) {
    throw new ConnectorLifecycleError(
      "LIFECYCLE_OPERATION_IN_PROGRESS",
      `Connector "${snapshot.exchangeId}" already has an active lifecycle operation.`,
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  return Object.freeze({
    ...snapshot,
    operationInProgress: true,
    activeCommand: command,
  });
}

/**
 * Clears operation-in-progress information without changing lifecycle state.
 */
export function clearLifecycleOperationSnapshot(
  snapshot: ConnectorLifecycleSnapshot,
): ConnectorLifecycleSnapshot {
  return Object.freeze({
    exchangeId: snapshot.exchangeId,
    state: snapshot.state,
    version: snapshot.version,
    transitionSequence: snapshot.transitionSequence,
    ...(snapshot.lastTransitionAt === undefined
      ? {}
      : {
          lastTransitionAt:
            snapshot.lastTransitionAt,
        }),
    health: snapshot.health,
    ...(snapshot.lastTransition === undefined
      ? {}
      : {
          lastTransition:
            snapshot.lastTransition,
        }),
    operationInProgress: false,
  });
}

/**
 * Replaces the health observation without changing lifecycle version or state.
 */
export function applyConnectorHealthSnapshot(
  snapshot: ConnectorLifecycleSnapshot,
  health: ConnectorHealthSnapshot,
): ConnectorLifecycleSnapshot {
  if (
    health.observedAt <
    snapshot.health.observedAt
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_TIMESTAMP",
      "Connector health timestamps must be monotonically non-decreasing.",
      {
        exchangeId: snapshot.exchangeId,
        state: snapshot.state,
      },
    );
  }

  return Object.freeze({
    exchangeId: snapshot.exchangeId,
    state: snapshot.state,
    version: snapshot.version,
    transitionSequence:
      snapshot.transitionSequence,
    ...(snapshot.lastTransitionAt === undefined
      ? {}
      : {
          lastTransitionAt:
            snapshot.lastTransitionAt,
        }),
    health,
    ...(snapshot.lastTransition === undefined
      ? {}
      : {
          lastTransition:
            snapshot.lastTransition,
        }),
    operationInProgress:
      snapshot.operationInProgress,
    ...(snapshot.activeCommand === undefined
      ? {}
      : {
          activeCommand:
            snapshot.activeCommand,
        }),
  });
}

/**
 * Creates an immutable lifecycle command result.
 */
export function createConnectorLifecycleCommandResult(
  input: Readonly<{
    command: ConnectorLifecycleCommand;
    outcome: ConnectorLifecycleCommandOutcome;
    previousSnapshot: ConnectorLifecycleSnapshot;
    currentSnapshot: ConnectorLifecycleSnapshot;
    transitions?: readonly ConnectorLifecycleTransition[];
  }>,
): ConnectorLifecycleCommandResult {
  if (!isConnectorLifecycleCommand(input.command)) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported connector lifecycle command "${String(
        input.command,
      )}".`,
    );
  }

  if (
    input.outcome !== "COMPLETED" &&
    input.outcome !== "NO_CHANGE"
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_STATE",
      `Unsupported lifecycle command outcome "${String(
        input.outcome,
      )}".`,
    );
  }

  if (
    input.previousSnapshot.exchangeId !==
    input.currentSnapshot.exchangeId
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_EXCHANGE_ID",
      "Lifecycle command snapshots must belong to the same exchange.",
      {
        exchangeId:
          input.currentSnapshot.exchangeId,
        state:
          input.currentSnapshot.state,
      },
    );
  }

  const transitions = Object.freeze([
    ...(input.transitions ?? []),
  ]);

  for (const transition of transitions) {
    if (
      transition.exchangeId !==
      input.currentSnapshot.exchangeId
    ) {
      throw new ConnectorLifecycleError(
        "INVALID_EXCHANGE_ID",
        "Lifecycle command transitions must belong to the command exchange.",
        {
          exchangeId:
            transition.exchangeId,
          state:
            input.currentSnapshot.state,
        },
      );
    }
  }

  if (
    input.outcome === "NO_CHANGE" &&
    transitions.length > 0
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_TRANSITION",
      "A NO_CHANGE lifecycle command result cannot contain transitions.",
      {
        exchangeId:
          input.currentSnapshot.exchangeId,
        state:
          input.currentSnapshot.state,
      },
    );
  }

  return Object.freeze({
    command: input.command,
    outcome: input.outcome,
    previousSnapshot:
      input.previousSnapshot,
    currentSnapshot:
      input.currentSnapshot,
    transitions,
  });
}

/**
 * Normalizes and validates exchange identifiers used by lifecycle records.
 */
export function normalizeLifecycleExchangeId(
  exchangeId: string,
): string {
  if (typeof exchangeId !== "string") {
    throw new ConnectorLifecycleError(
      "INVALID_EXCHANGE_ID",
      "Lifecycle exchange identifier must be a string.",
    );
  }

  const normalizedExchangeId = exchangeId
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/-+/gu, "-");

  if (normalizedExchangeId.length === 0) {
    throw new ConnectorLifecycleError(
      "INVALID_EXCHANGE_ID",
      "Lifecycle exchange identifier cannot be empty.",
    );
  }

  if (
    !/^[a-z0-9][a-z0-9.:-]*$/u.test(
      normalizedExchangeId,
    )
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_EXCHANGE_ID",
      `Invalid lifecycle exchange identifier "${exchangeId}".`,
    );
  }

  return normalizedExchangeId;
}

function assertPositiveInteger(
  value: number,
  label: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_SEQUENCE",
      `${label} must be a positive integer.`,
    );
  }
}

function assertFiniteNonNegativeTimestamp(
  value: number,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_TIMESTAMP",
      "Lifecycle timestamps must be finite, non-negative numbers.",
    );
  }
}

function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length === 0
    ? undefined
    : normalizedValue;
}

function freezeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new ConnectorLifecycleError(
      "INVALID_METADATA",
      "Lifecycle metadata and diagnostics must be record objects.",
    );
  }

  return Object.freeze({
    ...value,
  });
}