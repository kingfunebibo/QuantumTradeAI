/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/connector-lifecycle-manager.ts
 *
 * Purpose:
 * Implements deterministic lifecycle orchestration for registered exchange
 * connectors.
 */

import {
  ExchangeRegistry,
  normalizeExchangeRegistryId,
} from "./exchange-registry";

import {
  ConnectorLifecycleError,
  SystemConnectorLifecycleClock,
  applyConnectorHealthSnapshot,
  applyConnectorLifecycleTransition,
  clearLifecycleOperationSnapshot,
  createConnectorHealthSnapshot,
  createConnectorLifecycleCommandResult,
  createConnectorLifecycleTransition,
  createInitialConnectorLifecycleSnapshot,
  createLifecycleOperationSnapshot,
  normalizeLifecycleExchangeId,
  type ConnectorHealthSnapshot,
  type ConnectorLifecycleClock,
  type ConnectorLifecycleCommand,
  type ConnectorLifecycleCommandResult,
  type ConnectorLifecycleManagerContract,
  type ConnectorLifecycleSnapshot,
  type ConnectorLifecycleState,
  type ConnectorLifecycleTransition,
  type ConnectorLifecycleTransitionReason,
  type ManagedConnectorLifecycleAdapter,
  type MarkConnectorDegradedInput,
  type MarkConnectorFailedInput,
} from "./connector-lifecycle.types";

/**
 * Configuration for {@link ConnectorLifecycleManager}.
 */
export interface ConnectorLifecycleManagerOptions {
  /**
   * Injectable clock used for deterministic timestamps.
   */
  readonly clock?: ConnectorLifecycleClock;

  /**
   * Whether connectors should automatically be initialized before start.
   *
   * Defaults to true.
   */
  readonly autoInitializeBeforeStart?: boolean;

  /**
   * Whether failed connectors may be restarted.
   *
   * Defaults to true.
   */
  readonly allowRestartFromFailed?: boolean;
}

/**
 * Registry contract required by the lifecycle manager.
 */
export interface ConnectorLifecycleRegistryContract<
  TConnector extends ManagedConnectorLifecycleAdapter,
> {
  readonly size: number;

  get(exchangeId: string): TConnector | undefined;

  require(exchangeId: string): TConnector;

  has(exchangeId: string): boolean;

  listExchangeIds(): readonly string[];
}

/**
 * Internal lifecycle state owned by the manager.
 */
interface ManagedLifecycleRecord {
  readonly snapshot: ConnectorLifecycleSnapshot;

  readonly transitions: readonly ConnectorLifecycleTransition[];
}

/**
 * Context used while executing an asynchronous lifecycle command.
 */
interface LifecycleOperationContext {
  readonly exchangeId: string;

  readonly command: ConnectorLifecycleCommand;

  readonly connector: ManagedConnectorLifecycleAdapter;

  readonly previousSnapshot: ConnectorLifecycleSnapshot;
}

/**
 * Deterministic lifecycle manager for exchange connectors.
 *
 * Responsibilities:
 *
 * - Initialize, start, stop, restart, and dispose connectors.
 * - Maintain immutable lifecycle snapshots.
 * - Produce deterministic transition histories.
 * - Reject overlapping lifecycle operations.
 * - Normalize connector failures into lifecycle domain errors.
 * - Refresh health information without exchange-specific coupling.
 * - Mark connectors degraded, recovered, or failed.
 * - Expose deterministic multi-connector inspection ordering.
 */
export class ConnectorLifecycleManager<
    TConnector extends ManagedConnectorLifecycleAdapter,
  >
  implements ConnectorLifecycleManagerContract
{
  private readonly registry: ConnectorLifecycleRegistryContract<TConnector>;

  private readonly clock: ConnectorLifecycleClock;

  private readonly autoInitializeBeforeStart: boolean;

  private readonly allowRestartFromFailed: boolean;

  private readonly records = new Map<
    string,
    ManagedLifecycleRecord
  >();

  private readonly activeOperations = new Map<
    string,
    Promise<ConnectorLifecycleCommandResult>
  >();

  public constructor(
    registry:
      | ConnectorLifecycleRegistryContract<TConnector>
      | ExchangeRegistry<TConnector>,
    options: ConnectorLifecycleManagerOptions = {},
  ) {
    this.registry = registry;

    this.clock =
      options.clock ??
      new SystemConnectorLifecycleClock();

    this.autoInitializeBeforeStart =
      options.autoInitializeBeforeStart ??
      true;

    this.allowRestartFromFailed =
      options.allowRestartFromFailed ??
      true;
  }

  /**
   * Initializes a registered connector.
   */
  public async initialize(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.executeExclusive(
      normalizedExchangeId,
      "INITIALIZE",
      async (context) =>
        this.initializeInternal(context),
    );
  }

  /**
   * Starts a registered connector.
   */
  public async start(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.executeExclusive(
      normalizedExchangeId,
      "START",
      async (context) =>
        this.startInternal(context),
    );
  }

  /**
   * Stops a registered connector.
   */
  public async stop(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.executeExclusive(
      normalizedExchangeId,
      "STOP",
      async (context) =>
        this.stopInternal(context),
    );
  }

  /**
   * Restarts a registered connector.
   */
  public async restart(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.executeExclusive(
      normalizedExchangeId,
      "RESTART",
      async (context) =>
        this.restartInternal(context),
    );
  }

  /**
   * Permanently disposes a registered connector.
   */
  public async dispose(
    exchangeId: string,
  ): Promise<ConnectorLifecycleCommandResult> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.executeExclusive(
      normalizedExchangeId,
      "DISPOSE",
      async (context) =>
        this.disposeInternal(context),
    );
  }

  /**
   * Marks a running connector as degraded.
   */
  public markDegraded(
    exchangeId: string,
    input: MarkConnectorDegradedInput,
  ): ConnectorLifecycleCommandResult {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    const previousSnapshot =
      this.requireSnapshot(
        normalizedExchangeId,
      );

    this.assertNoOperationInProgress(
      normalizedExchangeId,
      previousSnapshot,
    );

    if (
      previousSnapshot.state ===
      "DEGRADED"
    ) {
      const health =
        createConnectorHealthSnapshot({
          status: "DEGRADED",
          observedAt: this.now(),
          reason: input.reason,
          diagnostics:
            input.diagnostics,
        });

      const currentSnapshot =
        applyConnectorHealthSnapshot(
          previousSnapshot,
          health,
        );

      this.storeSnapshot(
        normalizedExchangeId,
        currentSnapshot,
      );

      return createConnectorLifecycleCommandResult(
        {
          command:
            "MARK_DEGRADED",
          outcome: "NO_CHANGE",
          previousSnapshot,
          currentSnapshot,
        },
      );
    }

    if (
      previousSnapshot.state !==
      "RUNNING"
    ) {
      throw this.commandNotAllowed(
        normalizedExchangeId,
        "MARK_DEGRADED",
        previousSnapshot.state,
      );
    }

    const health =
      createConnectorHealthSnapshot({
        status: "DEGRADED",
        observedAt: this.now(),
        reason: input.reason,
        diagnostics:
          input.diagnostics,
      });

    const transition =
      this.createTransition(
        previousSnapshot,
        "DEGRADED",
        "MARK_DEGRADED",
        "HEALTH_DEGRADED",
        {
          reason: input.reason,
        },
      );

    const currentSnapshot =
      applyConnectorLifecycleTransition(
        previousSnapshot,
        transition,
        health,
      );

    this.appendTransition(
      normalizedExchangeId,
      currentSnapshot,
      transition,
    );

    return createConnectorLifecycleCommandResult(
      {
        command:
          "MARK_DEGRADED",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions: [transition],
      },
    );
  }

  /**
   * Marks a degraded connector as recovered.
   */
  public markRecovered(
    exchangeId: string,
  ): ConnectorLifecycleCommandResult {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    const previousSnapshot =
      this.requireSnapshot(
        normalizedExchangeId,
      );

    this.assertNoOperationInProgress(
      normalizedExchangeId,
      previousSnapshot,
    );

    if (
      previousSnapshot.state ===
      "RUNNING"
    ) {
      const health =
        createConnectorHealthSnapshot({
          status: "HEALTHY",
          observedAt: this.now(),
        });

      const currentSnapshot =
        applyConnectorHealthSnapshot(
          previousSnapshot,
          health,
        );

      this.storeSnapshot(
        normalizedExchangeId,
        currentSnapshot,
      );

      return createConnectorLifecycleCommandResult(
        {
          command:
            "MARK_RECOVERED",
          outcome: "NO_CHANGE",
          previousSnapshot,
          currentSnapshot,
        },
      );
    }

    if (
      previousSnapshot.state !==
      "DEGRADED"
    ) {
      throw this.commandNotAllowed(
        normalizedExchangeId,
        "MARK_RECOVERED",
        previousSnapshot.state,
      );
    }

    const health =
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: this.now(),
      });

    const transition =
      this.createTransition(
        previousSnapshot,
        "RUNNING",
        "MARK_RECOVERED",
        "HEALTH_RECOVERED",
      );

    const currentSnapshot =
      applyConnectorLifecycleTransition(
        previousSnapshot,
        transition,
        health,
      );

    this.appendTransition(
      normalizedExchangeId,
      currentSnapshot,
      transition,
    );

    return createConnectorLifecycleCommandResult(
      {
        command:
          "MARK_RECOVERED",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions: [transition],
      },
    );
  }

  /**
   * Marks a connector as failed.
   */
  public markFailed(
    exchangeId: string,
    input: MarkConnectorFailedInput,
  ): ConnectorLifecycleCommandResult {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    const previousSnapshot =
      this.requireSnapshot(
        normalizedExchangeId,
      );

    this.assertNoOperationInProgress(
      normalizedExchangeId,
      previousSnapshot,
    );

    if (
      previousSnapshot.state ===
      "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${normalizedExchangeId}" is already disposed.`,
        {
          exchangeId:
            normalizedExchangeId,
          state:
            previousSnapshot.state,
          cause: input.cause,
        },
      );
    }

    if (
      previousSnapshot.state ===
      "FAILED"
    ) {
      const health =
        createConnectorHealthSnapshot({
          status: "UNHEALTHY",
          observedAt: this.now(),
          reason: input.reason,
          diagnostics:
            input.diagnostics,
        });

      const currentSnapshot =
        applyConnectorHealthSnapshot(
          previousSnapshot,
          health,
        );

      this.storeSnapshot(
        normalizedExchangeId,
        currentSnapshot,
      );

      return createConnectorLifecycleCommandResult(
        {
          command:
            "MARK_FAILED",
          outcome: "NO_CHANGE",
          previousSnapshot,
          currentSnapshot,
        },
      );
    }

    const health =
      createConnectorHealthSnapshot({
        status: "UNHEALTHY",
        observedAt: this.now(),
        reason: input.reason,
        diagnostics:
          input.diagnostics,
      });

    const transition =
      this.createTransition(
        previousSnapshot,
        "FAILED",
        "MARK_FAILED",
        "OPERATION_FAILED",
        {
          reason: input.reason,
        },
      );

    const currentSnapshot =
      applyConnectorLifecycleTransition(
        previousSnapshot,
        transition,
        health,
      );

    this.appendTransition(
      normalizedExchangeId,
      currentSnapshot,
      transition,
    );

    return createConnectorLifecycleCommandResult(
      {
        command:
          "MARK_FAILED",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions: [transition],
      },
    );
  }

  /**
   * Returns the current lifecycle snapshot for one connector.
   */
  public inspect(
    exchangeId: string,
  ): ConnectorLifecycleSnapshot {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.requireSnapshot(
      normalizedExchangeId,
    );
  }

  /**
   * Returns all snapshots in deterministic registry order.
   */
  public inspectAll():
    readonly ConnectorLifecycleSnapshot[] {
    const snapshots =
      this.registry
        .listExchangeIds()
        .map((exchangeId) =>
          this.requireSnapshot(exchangeId),
        );

    return Object.freeze(snapshots);
  }

  /**
   * Refreshes connector health.
   */
  public async refreshHealth(
    exchangeId: string,
  ): Promise<ConnectorLifecycleSnapshot> {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    const connector =
      this.registry.require(
        normalizedExchangeId,
      );

    const snapshot =
      this.requireSnapshot(
        normalizedExchangeId,
      );

    this.assertNoOperationInProgress(
      normalizedExchangeId,
      snapshot,
    );

    if (
      snapshot.state === "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${normalizedExchangeId}" is already disposed.`,
        {
          exchangeId:
            normalizedExchangeId,
          state: snapshot.state,
        },
      );
    }

    if (
      connector.getHealth === undefined
    ) {
      const unknownHealth =
        createConnectorHealthSnapshot({
          status: "UNKNOWN",
          observedAt: this.now(),
          reason:
            "Connector does not provide runtime health information.",
        });

      const currentSnapshot =
        applyConnectorHealthSnapshot(
          snapshot,
          unknownHealth,
        );

      this.storeSnapshot(
        normalizedExchangeId,
        currentSnapshot,
      );

      return currentSnapshot;
    }

    let healthResult: Awaited<
      ReturnType<
        NonNullable<
          ManagedConnectorLifecycleAdapter["getHealth"]
        >
      >
    >;

    try {
      healthResult =
        await connector.getHealth();
    } catch (cause: unknown) {
      const failedHealth =
        createConnectorHealthSnapshot({
          status: "UNHEALTHY",
          observedAt: this.now(),
          reason:
            "Connector health inspection failed.",
          diagnostics: {
            error:
              cause instanceof Error
                ? cause.message
                : String(cause),
          },
        });

      const currentSnapshot =
        applyConnectorHealthSnapshot(
          snapshot,
          failedHealth,
        );

      this.storeSnapshot(
        normalizedExchangeId,
        currentSnapshot,
      );

      return currentSnapshot;
    }

    const health =
      createConnectorHealthSnapshot({
        status: healthResult.status,
        observedAt: this.now(),
        reason:
          healthResult.reason,
        diagnostics:
          healthResult.diagnostics,
      });

    const currentSnapshot =
      applyConnectorHealthSnapshot(
        snapshot,
        health,
      );

    this.storeSnapshot(
      normalizedExchangeId,
      currentSnapshot,
    );

    return currentSnapshot;
  }

  /**
   * Returns immutable transition history.
   */
  public getTransitionHistory(
    exchangeId: string,
  ): readonly ConnectorLifecycleTransition[] {
    const normalizedExchangeId =
      this.normalizeAndRequireRegistered(
        exchangeId,
      );

    return this.requireRecord(
      normalizedExchangeId,
    ).transitions;
  }

  private async initializeInternal(
    context: LifecycleOperationContext,
  ): Promise<ConnectorLifecycleCommandResult> {
    const {
      exchangeId,
      connector,
    } = context;

    const previousSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      previousSnapshot.state ===
        "STOPPED" ||
      previousSnapshot.state ===
        "RUNNING" ||
      previousSnapshot.state ===
        "DEGRADED"
    ) {
      return this.noChangeResult(
        "INITIALIZE",
        previousSnapshot,
      );
    }

    if (
      previousSnapshot.state ===
      "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${exchangeId}" is already disposed.`,
        {
          exchangeId,
          state:
            previousSnapshot.state,
        },
      );
    }

    if (
      previousSnapshot.state !==
        "UNINITIALIZED" &&
      previousSnapshot.state !==
        "FAILED"
    ) {
      throw this.commandNotAllowed(
        exchangeId,
        "INITIALIZE",
        previousSnapshot.state,
      );
    }

    const transitions:
      ConnectorLifecycleTransition[] = [];

    let currentSnapshot =
      this.transitionAndStore(
        previousSnapshot,
        "INITIALIZING",
        "INITIALIZE",
        "COMMAND",
        transitions,
      );

    try {
      await connector.initialize();
    } catch (cause: unknown) {
      currentSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "INITIALIZE",
          "INITIALIZATION_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "INITIALIZATION_FAILED",
        `Connector "${exchangeId}" initialization failed.`,
        {
          exchangeId,
          state:
            currentSnapshot.state,
          cause,
        },
      );
    }

    const healthy =
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: this.now(),
      });

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "STOPPED",
        "INITIALIZE",
        "INITIALIZATION_COMPLETED",
        transitions,
        healthy,
      );

    return createConnectorLifecycleCommandResult(
      {
        command: "INITIALIZE",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions,
      },
    );
  }

  private async startInternal(
    context: LifecycleOperationContext,
  ): Promise<ConnectorLifecycleCommandResult> {
    const {
      exchangeId,
      connector,
    } = context;

    const originalSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      originalSnapshot.state ===
        "RUNNING" ||
      originalSnapshot.state ===
        "DEGRADED"
    ) {
      return this.noChangeResult(
        "START",
        originalSnapshot,
      );
    }

    if (
      originalSnapshot.state ===
      "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${exchangeId}" is already disposed.`,
        {
          exchangeId,
          state:
            originalSnapshot.state,
        },
      );
    }

    const transitions:
      ConnectorLifecycleTransition[] = [];

    let currentSnapshot =
      originalSnapshot;

    if (
      currentSnapshot.state ===
      "UNINITIALIZED"
    ) {
      if (
        !this.autoInitializeBeforeStart
      ) {
        throw this.commandNotAllowed(
          exchangeId,
          "START",
          currentSnapshot.state,
        );
      }

      currentSnapshot =
        this.transitionAndStore(
          currentSnapshot,
          "INITIALIZING",
          "START",
          "COMMAND",
          transitions,
        );

      try {
        await connector.initialize();
      } catch (cause: unknown) {
        currentSnapshot =
          this.transitionFailureAndStore(
            currentSnapshot,
            "START",
            "INITIALIZATION_FAILED",
            cause,
            transitions,
          );

        throw new ConnectorLifecycleError(
          "INITIALIZATION_FAILED",
          `Connector "${exchangeId}" initialization failed during startup.`,
          {
            exchangeId,
            state:
              currentSnapshot.state,
            cause,
          },
        );
      }

      currentSnapshot =
        this.transitionAndStore(
          currentSnapshot,
          "STOPPED",
          "START",
          "INITIALIZATION_COMPLETED",
          transitions,
        );
    }

    if (
      currentSnapshot.state !==
        "STOPPED" &&
      currentSnapshot.state !==
        "FAILED"
    ) {
      throw this.commandNotAllowed(
        exchangeId,
        "START",
        currentSnapshot.state,
      );
    }

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "STARTING",
        "START",
        "COMMAND",
        transitions,
      );

    try {
      await connector.start();
    } catch (cause: unknown) {
      currentSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "START",
          "START_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "START_FAILED",
        `Connector "${exchangeId}" startup failed.`,
        {
          exchangeId,
          state:
            currentSnapshot.state,
          cause,
        },
      );
    }

    const healthy =
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: this.now(),
      });

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "RUNNING",
        "START",
        "START_COMPLETED",
        transitions,
        healthy,
      );

    return createConnectorLifecycleCommandResult(
      {
        command: "START",
        outcome: "COMPLETED",
        previousSnapshot:
          originalSnapshot,
        currentSnapshot,
        transitions,
      },
    );
  }

  private async stopInternal(
    context: LifecycleOperationContext,
  ): Promise<ConnectorLifecycleCommandResult> {
    const {
      exchangeId,
      connector,
    } = context;

    const previousSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      previousSnapshot.state ===
        "UNINITIALIZED" ||
      previousSnapshot.state ===
        "STOPPED"
    ) {
      return this.noChangeResult(
        "STOP",
        previousSnapshot,
      );
    }

    if (
      previousSnapshot.state ===
      "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${exchangeId}" is already disposed.`,
        {
          exchangeId,
          state:
            previousSnapshot.state,
        },
      );
    }

    if (
      previousSnapshot.state !==
        "RUNNING" &&
      previousSnapshot.state !==
        "DEGRADED" &&
      previousSnapshot.state !==
        "FAILED"
    ) {
      throw this.commandNotAllowed(
        exchangeId,
        "STOP",
        previousSnapshot.state,
      );
    }

    const transitions:
      ConnectorLifecycleTransition[] = [];

    let currentSnapshot =
      this.transitionAndStore(
        previousSnapshot,
        "STOPPING",
        "STOP",
        "COMMAND",
        transitions,
      );

    try {
      await connector.stop();
    } catch (cause: unknown) {
      currentSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "STOP",
          "STOP_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "STOP_FAILED",
        `Connector "${exchangeId}" shutdown failed.`,
        {
          exchangeId,
          state:
            currentSnapshot.state,
          cause,
        },
      );
    }

    const stoppedHealth =
      createConnectorHealthSnapshot({
        status: "UNKNOWN",
        observedAt: this.now(),
        reason:
          "Connector is stopped.",
      });

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "STOPPED",
        "STOP",
        "STOP_COMPLETED",
        transitions,
        stoppedHealth,
      );

    return createConnectorLifecycleCommandResult(
      {
        command: "STOP",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions,
      },
    );
  }

  private async restartInternal(
    context: LifecycleOperationContext,
  ): Promise<ConnectorLifecycleCommandResult> {
    const {
      exchangeId,
      connector,
    } = context;

    const previousSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      previousSnapshot.state ===
      "DISPOSED"
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_ALREADY_DISPOSED",
        `Connector "${exchangeId}" is already disposed.`,
        {
          exchangeId,
          state:
            previousSnapshot.state,
        },
      );
    }

    if (
      previousSnapshot.state ===
        "FAILED" &&
      !this.allowRestartFromFailed
    ) {
      throw this.commandNotAllowed(
        exchangeId,
        "RESTART",
        previousSnapshot.state,
      );
    }

    if (
      previousSnapshot.state ===
      "UNINITIALIZED"
    ) {
      return this.startInternal(context);
    }

    if (
      previousSnapshot.state !==
        "RUNNING" &&
      previousSnapshot.state !==
        "DEGRADED" &&
      previousSnapshot.state !==
        "FAILED" &&
      previousSnapshot.state !==
        "STOPPED"
    ) {
      throw this.commandNotAllowed(
        exchangeId,
        "RESTART",
        previousSnapshot.state,
      );
    }

    if (
      previousSnapshot.state ===
      "STOPPED"
    ) {
      return this.startInternal(context);
    }

    const transitions:
      ConnectorLifecycleTransition[] = [];

    let currentSnapshot =
      this.transitionAndStore(
        previousSnapshot,
        "RESTARTING",
        "RESTART",
        "COMMAND",
        transitions,
      );

    try {
      await connector.stop();
    } catch (cause: unknown) {
      currentSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "RESTART",
          "RESTART_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "RESTART_FAILED",
        `Connector "${exchangeId}" failed while stopping during restart.`,
        {
          exchangeId,
          state:
            currentSnapshot.state,
          cause,
        },
      );
    }

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "STOPPED",
        "RESTART",
        "STOP_COMPLETED",
        transitions,
      );

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "STARTING",
        "RESTART",
        "COMMAND",
        transitions,
      );

    try {
      await connector.start();
    } catch (cause: unknown) {
      currentSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "RESTART",
          "RESTART_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "RESTART_FAILED",
        `Connector "${exchangeId}" failed while starting during restart.`,
        {
          exchangeId,
          state:
            currentSnapshot.state,
          cause,
        },
      );
    }

    const healthy =
      createConnectorHealthSnapshot({
        status: "HEALTHY",
        observedAt: this.now(),
      });

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "RUNNING",
        "RESTART",
        "RESTART_COMPLETED",
        transitions,
        healthy,
      );

    return createConnectorLifecycleCommandResult(
      {
        command: "RESTART",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions,
      },
    );
  }

  private async disposeInternal(
    context: LifecycleOperationContext,
  ): Promise<ConnectorLifecycleCommandResult> {
    const {
      exchangeId,
      connector,
    } = context;

    const previousSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      previousSnapshot.state ===
      "DISPOSED"
    ) {
      return this.noChangeResult(
        "DISPOSE",
        previousSnapshot,
      );
    }

    const transitions:
      ConnectorLifecycleTransition[] = [];

    let currentSnapshot =
      previousSnapshot;

    if (
      currentSnapshot.state ===
        "RUNNING" ||
      currentSnapshot.state ===
        "DEGRADED" ||
      currentSnapshot.state ===
        "FAILED"
    ) {
      currentSnapshot =
        this.transitionAndStore(
          currentSnapshot,
          "STOPPING",
          "DISPOSE",
          "COMMAND",
          transitions,
        );

      try {
        await connector.stop();
      } catch (cause: unknown) {
        currentSnapshot =
          this.transitionFailureAndStore(
            currentSnapshot,
            "DISPOSE",
            "DISPOSAL_FAILED",
            cause,
            transitions,
          );

        throw new ConnectorLifecycleError(
          "DISPOSAL_FAILED",
          `Connector "${exchangeId}" could not be stopped before disposal.`,
          {
            exchangeId,
            state:
              currentSnapshot.state,
            cause,
          },
        );
      }

      currentSnapshot =
        this.transitionAndStore(
          currentSnapshot,
          "STOPPED",
          "DISPOSE",
          "STOP_COMPLETED",
          transitions,
        );
    }

    try {
      await connector.dispose();
    } catch (cause: unknown) {
      const failureSnapshot =
        this.transitionFailureAndStore(
          currentSnapshot,
          "DISPOSE",
          "DISPOSAL_FAILED",
          cause,
          transitions,
        );

      throw new ConnectorLifecycleError(
        "DISPOSAL_FAILED",
        `Connector "${exchangeId}" disposal failed.`,
        {
          exchangeId,
          state:
            failureSnapshot.state,
          cause,
        },
      );
    }

    const disposedHealth =
      createConnectorHealthSnapshot({
        status: "UNKNOWN",
        observedAt: this.now(),
        reason:
          "Connector is disposed.",
      });

    currentSnapshot =
      this.transitionAndStore(
        currentSnapshot,
        "DISPOSED",
        "DISPOSE",
        "DISPOSAL_COMPLETED",
        transitions,
        disposedHealth,
      );

    return createConnectorLifecycleCommandResult(
      {
        command: "DISPOSE",
        outcome: "COMPLETED",
        previousSnapshot,
        currentSnapshot,
        transitions,
      },
    );
  }

  private executeExclusive(
    exchangeId: string,
    command: ConnectorLifecycleCommand,
    operation: (
      context: LifecycleOperationContext,
    ) => Promise<ConnectorLifecycleCommandResult>,
  ): Promise<ConnectorLifecycleCommandResult> {
    const existingOperation =
      this.activeOperations.get(
        exchangeId,
      );

    if (
      existingOperation !== undefined
    ) {
      throw new ConnectorLifecycleError(
        "LIFECYCLE_OPERATION_IN_PROGRESS",
        `Connector "${exchangeId}" already has an active lifecycle operation.`,
        {
          exchangeId,
          state:
            this.requireSnapshot(
              exchangeId,
            ).state,
        },
      );
    }

    const connector =
      this.registry.require(exchangeId);

    const previousSnapshot =
      this.requireSnapshot(exchangeId);

    if (
      previousSnapshot.operationInProgress
    ) {
      throw new ConnectorLifecycleError(
        "LIFECYCLE_OPERATION_IN_PROGRESS",
        `Connector "${exchangeId}" already has an active lifecycle operation.`,
        {
          exchangeId,
          state:
            previousSnapshot.state,
        },
      );
    }

    const operationSnapshot =
      createLifecycleOperationSnapshot(
        previousSnapshot,
        command,
      );

    this.storeSnapshot(
      exchangeId,
      operationSnapshot,
    );

    const operationPromise =
      operation({
        exchangeId,
        command,
        connector,
        previousSnapshot,
      }).finally(() => {
        this.activeOperations.delete(
          exchangeId,
        );

        const currentSnapshot =
          this.requireSnapshot(
            exchangeId,
          );

        if (
          currentSnapshot.operationInProgress
        ) {
          this.storeSnapshot(
            exchangeId,
            clearLifecycleOperationSnapshot(
              currentSnapshot,
            ),
          );
        }
      });

    this.activeOperations.set(
      exchangeId,
      operationPromise,
    );

    return operationPromise;
  }

  /**
   * Applies and stores a lifecycle transition while preserving an active
   * asynchronous operation marker.
   *
   * applyConnectorLifecycleTransition() clears transient operation fields
   * because it creates a completed state-transition snapshot. However, the
   * surrounding lifecycle command may still be awaiting connector work.
   *
   * Therefore, when the source snapshot has an active operation, this method
   * restores that operation marker until executeExclusive() reaches its
   * finally block.
   */
  private transitionAndStore(
    snapshot: ConnectorLifecycleSnapshot,
    to: ConnectorLifecycleState,
    command: ConnectorLifecycleCommand,
    reason: ConnectorLifecycleTransitionReason,
    transitions: ConnectorLifecycleTransition[],
    health?: ConnectorHealthSnapshot,
    metadata?: Readonly<
      Record<string, unknown>
    >,
  ): ConnectorLifecycleSnapshot {
    const transition =
      this.createTransition(
        snapshot,
        to,
        command,
        reason,
        metadata,
      );

    const transitionedSnapshot =
      applyConnectorLifecycleTransition(
        snapshot,
        transition,
        health,
      );

    const currentSnapshot =
      snapshot.operationInProgress &&
      snapshot.activeCommand !== undefined
        ? createLifecycleOperationSnapshot(
            transitionedSnapshot,
            snapshot.activeCommand,
          )
        : transitionedSnapshot;

    transitions.push(transition);

    this.appendTransition(
      snapshot.exchangeId,
      currentSnapshot,
      transition,
    );

    return currentSnapshot;
  }

  private transitionFailureAndStore(
    snapshot: ConnectorLifecycleSnapshot,
    command: ConnectorLifecycleCommand,
    errorCode:
      | "INITIALIZATION_FAILED"
      | "START_FAILED"
      | "STOP_FAILED"
      | "RESTART_FAILED"
      | "DISPOSAL_FAILED",
    cause: unknown,
    transitions: ConnectorLifecycleTransition[],
  ): ConnectorLifecycleSnapshot {
    if (
      snapshot.state === "FAILED"
    ) {
      return snapshot;
    }

    const failureHealth =
      createConnectorHealthSnapshot({
        status: "UNHEALTHY",
        observedAt: this.now(),
        reason:
          cause instanceof Error
            ? cause.message
            : String(cause),
        diagnostics: {
          errorCode,
        },
      });

    return this.transitionAndStore(
      snapshot,
      "FAILED",
      command,
      "OPERATION_FAILED",
      transitions,
      failureHealth,
      {
        errorCode,
      },
    );
  }

  private createTransition(
    snapshot: ConnectorLifecycleSnapshot,
    to: ConnectorLifecycleState,
    command: ConnectorLifecycleCommand,
    reason: ConnectorLifecycleTransitionReason,
    metadata?: Readonly<
      Record<string, unknown>
    >,
  ): ConnectorLifecycleTransition {
    return createConnectorLifecycleTransition(
      {
        exchangeId:
          snapshot.exchangeId,
        from: snapshot.state,
        to,
        command,
        reason,
        sequence:
          snapshot.transitionSequence +
          1,
        transitionedAt: this.now(),
        metadata,
      },
    );
  }

  private appendTransition(
    exchangeId: string,
    snapshot: ConnectorLifecycleSnapshot,
    transition: ConnectorLifecycleTransition,
  ): void {
    const currentRecord =
      this.requireRecord(exchangeId);

    const transitions =
      Object.freeze([
        ...currentRecord.transitions,
        transition,
      ]);

    this.records.set(
      exchangeId,
      Object.freeze({
        snapshot,
        transitions,
      }),
    );
  }

  private storeSnapshot(
    exchangeId: string,
    snapshot: ConnectorLifecycleSnapshot,
  ): void {
    const currentRecord =
      this.requireRecord(exchangeId);

    this.records.set(
      exchangeId,
      Object.freeze({
        snapshot,
        transitions:
          currentRecord.transitions,
      }),
    );
  }

  private requireSnapshot(
    exchangeId: string,
  ): ConnectorLifecycleSnapshot {
    return this.requireRecord(
      exchangeId,
    ).snapshot;
  }

  private requireRecord(
    exchangeId: string,
  ): ManagedLifecycleRecord {
    const normalizedExchangeId =
      normalizeLifecycleExchangeId(
        exchangeId,
      );

    const existingRecord =
      this.records.get(
        normalizedExchangeId,
      );

    if (
      existingRecord !== undefined
    ) {
      return existingRecord;
    }

    this.normalizeAndRequireRegistered(
      normalizedExchangeId,
    );

    const snapshot =
      createInitialConnectorLifecycleSnapshot(
        normalizedExchangeId,
        this.now(),
      );

    const record =
      Object.freeze({
        snapshot,
        transitions:
          Object.freeze<
            readonly ConnectorLifecycleTransition[]
          >([]),
      });

    this.records.set(
      normalizedExchangeId,
      record,
    );

    return record;
  }

  private noChangeResult(
    command: ConnectorLifecycleCommand,
    snapshot: ConnectorLifecycleSnapshot,
  ): ConnectorLifecycleCommandResult {
    return createConnectorLifecycleCommandResult(
      {
        command,
        outcome: "NO_CHANGE",
        previousSnapshot: snapshot,
        currentSnapshot: snapshot,
      },
    );
  }

  private assertNoOperationInProgress(
    exchangeId: string,
    snapshot: ConnectorLifecycleSnapshot,
  ): void {
    if (
      snapshot.operationInProgress ||
      this.activeOperations.has(
        exchangeId,
      )
    ) {
      throw new ConnectorLifecycleError(
        "LIFECYCLE_OPERATION_IN_PROGRESS",
        `Connector "${exchangeId}" already has an active lifecycle operation.`,
        {
          exchangeId,
          state: snapshot.state,
        },
      );
    }
  }

  private normalizeAndRequireRegistered(
    exchangeId: string,
  ): string {
    let normalizedExchangeId: string;

    try {
      normalizedExchangeId =
        normalizeExchangeRegistryId(
          exchangeId,
        );
    } catch (cause: unknown) {
      throw new ConnectorLifecycleError(
        "INVALID_EXCHANGE_ID",
        `Invalid connector exchange identifier "${String(
          exchangeId,
        )}".`,
        {
          cause,
        },
      );
    }

    if (
      !this.registry.has(
        normalizedExchangeId,
      )
    ) {
      throw new ConnectorLifecycleError(
        "CONNECTOR_NOT_REGISTERED",
        `Connector "${normalizedExchangeId}" is not registered.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    return normalizedExchangeId;
  }

  private commandNotAllowed(
    exchangeId: string,
    command: ConnectorLifecycleCommand,
    state: ConnectorLifecycleState,
  ): ConnectorLifecycleError {
    return new ConnectorLifecycleError(
      "COMMAND_NOT_ALLOWED",
      `Lifecycle command "${command}" is not allowed for connector "${exchangeId}" while in state "${state}".`,
      {
        exchangeId,
        state,
      },
    );
  }

  private now(): number {
    const value = this.clock.now();

    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      throw new ConnectorLifecycleError(
        "INVALID_TIMESTAMP",
        "Lifecycle clock must return a finite, non-negative timestamp.",
      );
    }

    return value;
  }
}