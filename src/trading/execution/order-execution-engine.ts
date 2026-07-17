/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 9:
 * Live Order Execution Engine
 *
 * Coordinates the production live-order command handlers behind one typed,
 * deterministic execution boundary.
 */

import type {
  CancelOrderCommand,
  ReconcileOrderCommand,
  ReplaceOrderCommand,
  SubmitOrderCommand,
} from "./order-types";

import type {
  LiveOrderSubmissionResult,
  LiveOrderSubmitterContract,
} from "./order-submitter";

import type {
  LiveOrderCancellationResult,
  LiveOrderCancellerContract,
} from "./order-canceller";

import type {
  LiveOrderReplacementResult,
  LiveOrderReplacerContract,
} from "./order-replacer";

import type {
  LiveOrderReconciliationResult,
  LiveOrderReconcilerContract,
} from "./order-reconciler";

/**
 * Commands accepted by the execution engine.
 */
export type LiveOrderExecutionCommand =
  | SubmitOrderCommand
  | CancelOrderCommand
  | ReplaceOrderCommand
  | ReconcileOrderCommand;

/**
 * Results returned by the execution engine.
 */
export type LiveOrderExecutionResult =
  | LiveOrderSubmissionResult
  | LiveOrderCancellationResult
  | LiveOrderReplacementResult
  | LiveOrderReconciliationResult;

/**
 * Stable engine operation names.
 */
export type LiveOrderExecutionOperation =
  LiveOrderExecutionCommand["operation"];

/**
 * Stable engine error codes.
 */
export type OrderExecutionEngineErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "UNSUPPORTED_OPERATION"
  | "COMMAND_ALREADY_RUNNING"
  | "ENGINE_STOPPED"
  | "EXECUTION_FAILED"
  | "RESULT_CACHE_FAILED"
  | "HISTORY_FAILED";

/**
 * Engine-specific error with stable diagnostics.
 */
export class OrderExecutionEngineError extends Error {
  public readonly code: OrderExecutionEngineErrorCode;

  public readonly commandId?: string;

  public readonly orderId?: string;

  public readonly operation?: string;

  public readonly retryable: boolean;

  public constructor(
    code: OrderExecutionEngineErrorCode,
    message: string,
    options: Readonly<{
      commandId?: string;
      orderId?: string;
      operation?: string;
      retryable?: boolean;
      cause?: unknown;
    }> = {},
  ) {
    super(message, { cause: options.cause });

    this.name = "OrderExecutionEngineError";
    this.code = code;
    this.commandId = options.commandId;
    this.orderId = options.orderId;
    this.operation = options.operation;
    this.retryable = options.retryable ?? false;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Minimal clock contract kept local so the engine remains independent from
 * transport implementation details.
 */
export interface OrderExecutionEngineClock {
  now(): number;
}

/**
 * Optional durable command-result cache.
 *
 * The engine uses this for idempotency. A repeated commandId returns the
 * previously completed immutable result rather than executing twice.
 */
export interface OrderExecutionResultStore {
  findByCommandId(
    commandId: string,
  ): Promise<LiveOrderExecutionResult | undefined>;

  save(
    commandId: string,
    result: LiveOrderExecutionResult,
  ): Promise<void>;
}

/**
 * Optional execution-history sink.
 */
export interface OrderExecutionHistoryStore {
  append(
    entry: OrderExecutionHistoryEntry,
  ): Promise<void>;
}

/**
 * Optional observer for engine-level lifecycle notifications.
 */
export interface OrderExecutionEngineObserver {
  onStarted?(
    context: OrderExecutionStartedContext,
  ): void | Promise<void>;

  onCompleted?(
    context: OrderExecutionCompletedContext,
  ): void | Promise<void>;

  onFailed?(
    context: OrderExecutionFailedContext,
  ): void | Promise<void>;
}

/**
 * Immutable history entry generated for each execution attempt.
 */
export interface OrderExecutionHistoryEntry {
  readonly commandId: string;
  readonly orderId: string;
  readonly operation: LiveOrderExecutionOperation;
  readonly status: "COMPLETED" | "FAILED";
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly fromCache: boolean;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OrderExecutionStartedContext {
  readonly command: LiveOrderExecutionCommand;
  readonly commandId: string;
  readonly orderId: string;
  readonly operation: LiveOrderExecutionOperation;
  readonly startedAt: number;
}

export interface OrderExecutionCompletedContext
  extends OrderExecutionStartedContext {
  readonly completedAt: number;
  readonly durationMs: number;
  readonly fromCache: boolean;
  readonly result: LiveOrderExecutionResult;
}

export interface OrderExecutionFailedContext
  extends OrderExecutionStartedContext {
  readonly completedAt: number;
  readonly durationMs: number;
  readonly error: unknown;
}

/**
 * Runtime metrics exposed by the engine.
 */
export interface OrderExecutionEngineMetrics {
  readonly state: OrderExecutionEngineState;
  readonly acceptedCommands: number;
  readonly completedCommands: number;
  readonly failedCommands: number;
  readonly cacheHits: number;
  readonly inFlightCommands: number;
  readonly inFlightOrders: number;
  readonly lastStartedAt?: number;
  readonly lastCompletedAt?: number;
  readonly lastFailureAt?: number;
}

/**
 * Engine lifecycle state.
 */
export type OrderExecutionEngineState =
  | "RUNNING"
  | "DRAINING"
  | "STOPPED";

/**
 * Execution-engine configuration.
 */
export interface LiveOrderExecutionEngineOptions {
  /**
   * Serialize commands that target the same order.
   */
  readonly serializePerOrder?: boolean;

  /**
   * Return completed results by commandId when possible.
   */
  readonly enableIdempotency?: boolean;

  /**
   * Reject a duplicate commandId while its first execution is still running.
   * When false, duplicate callers share the same in-flight promise.
   */
  readonly rejectConcurrentDuplicateCommands?: boolean;

  /**
   * Record successful and failed attempts in the history store.
   */
  readonly recordHistory?: boolean;

  /**
   * Observer failures are ignored when true.
   */
  readonly ignoreObserverErrors?: boolean;

  /**
   * History-store failures are ignored when true.
   */
  readonly ignoreHistoryErrors?: boolean;

  /**
   * Result-store failures are ignored when true.
   */
  readonly ignoreResultStoreErrors?: boolean;

  /**
   * Additional metadata written to history entries.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedLiveOrderExecutionEngineOptions {
  readonly serializePerOrder: boolean;
  readonly enableIdempotency: boolean;
  readonly rejectConcurrentDuplicateCommands: boolean;
  readonly recordHistory: boolean;
  readonly ignoreObserverErrors: boolean;
  readonly ignoreHistoryErrors: boolean;
  readonly ignoreResultStoreErrors: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Dependencies used by the engine.
 */
export interface LiveOrderExecutionEngineDependencies {
  readonly submitter: LiveOrderSubmitterContract;
  readonly canceller: LiveOrderCancellerContract;
  readonly replacer: LiveOrderReplacerContract;
  readonly reconciler: LiveOrderReconcilerContract;
  readonly clock?: OrderExecutionEngineClock;
  readonly resultStore?: OrderExecutionResultStore;
  readonly historyStore?: OrderExecutionHistoryStore;
  readonly observer?: OrderExecutionEngineObserver;
}

/**
 * Public engine contract.
 */
export interface LiveOrderExecutionEngineContract {
  execute<TCommand extends LiveOrderExecutionCommand>(
    command: TCommand,
  ): Promise<ResultForCommand<TCommand>>;

  submit(
    command: SubmitOrderCommand,
  ): Promise<LiveOrderSubmissionResult>;

  cancel(
    command: CancelOrderCommand,
  ): Promise<LiveOrderCancellationResult>;

  replace(
    command: ReplaceOrderCommand,
  ): Promise<LiveOrderReplacementResult>;

  reconcile(
    command: ReconcileOrderCommand,
  ): Promise<LiveOrderReconciliationResult>;

  getMetrics(): OrderExecutionEngineMetrics;

  getState(): OrderExecutionEngineState;

  drain(): Promise<void>;

  stop(): Promise<void>;

  start(): void;
}

/**
 * Resolves a command to its exact result type.
 */
export type ResultForCommand<
  TCommand extends LiveOrderExecutionCommand,
> =
  TCommand extends SubmitOrderCommand
    ? LiveOrderSubmissionResult
    : TCommand extends CancelOrderCommand
      ? LiveOrderCancellationResult
      : TCommand extends ReplaceOrderCommand
        ? LiveOrderReplacementResult
        : TCommand extends ReconcileOrderCommand
          ? LiveOrderReconciliationResult
          : never;

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const DEFAULT_OPTIONS: ResolvedLiveOrderExecutionEngineOptions =
  Object.freeze({
    serializePerOrder: true,
    enableIdempotency: true,
    rejectConcurrentDuplicateCommands: false,
    recordHistory: true,
    ignoreObserverErrors: true,
    ignoreHistoryErrors: false,
    ignoreResultStoreErrors: false,
    metadata: EMPTY_METADATA,
  });

/**
 * Production clock.
 */
export class SystemOrderExecutionEngineClock
  implements OrderExecutionEngineClock
{
  public now(): number {
    return Date.now();
  }
}

/**
 * In-memory idempotency store suitable for deterministic tests and local
 * deployments.
 */
export class InMemoryOrderExecutionResultStore
  implements OrderExecutionResultStore
{
  private readonly results =
    new Map<string, LiveOrderExecutionResult>();

  public async findByCommandId(
    commandId: string,
  ): Promise<LiveOrderExecutionResult | undefined> {
    return this.results.get(
      normalizeIdentifier(
        commandId,
        "commandId",
      ),
    );
  }

  public async save(
    commandId: string,
    result: LiveOrderExecutionResult,
  ): Promise<void> {
    this.results.set(
      normalizeIdentifier(
        commandId,
        "commandId",
      ),
      result,
    );
  }

  public clear(): void {
    this.results.clear();
  }

  public get size(): number {
    return this.results.size;
  }
}

/**
 * In-memory append-only execution history.
 */
export class InMemoryOrderExecutionHistoryStore
  implements OrderExecutionHistoryStore
{
  private readonly entries:
    OrderExecutionHistoryEntry[] = [];

  public async append(
    entry: OrderExecutionHistoryEntry,
  ): Promise<void> {
    this.entries.push(
      freezeHistoryEntry(entry),
    );
  }

  public getAll():
    readonly OrderExecutionHistoryEntry[] {
    return Object.freeze([
      ...this.entries,
    ]);
  }

  public clear(): void {
    this.entries.length = 0;
  }

  public get size(): number {
    return this.entries.length;
  }
}

/**
 * Production orchestration engine.
 */
export class LiveOrderExecutionEngine
  implements LiveOrderExecutionEngineContract
{
  private readonly submitter:
    LiveOrderSubmitterContract;

  private readonly canceller:
    LiveOrderCancellerContract;

  private readonly replacer:
    LiveOrderReplacerContract;

  private readonly reconciler:
    LiveOrderReconcilerContract;

  private readonly clock:
    OrderExecutionEngineClock;

  private readonly resultStore?:
    OrderExecutionResultStore;

  private readonly historyStore?:
    OrderExecutionHistoryStore;

  private readonly observer?:
    OrderExecutionEngineObserver;

  private readonly options:
    ResolvedLiveOrderExecutionEngineOptions;

  private state:
    OrderExecutionEngineState = "RUNNING";

  private readonly inFlightByCommandId =
    new Map<
      string,
      Promise<LiveOrderExecutionResult>
    >();

  private readonly orderTails =
    new Map<string, Promise<void>>();

  private acceptedCommands = 0;

  private completedCommands = 0;

  private failedCommands = 0;

  private cacheHits = 0;

  private lastStartedAt?: number;

  private lastCompletedAt?: number;

  private lastFailureAt?: number;

  public constructor(
    dependencies:
      LiveOrderExecutionEngineDependencies,
    options:
      LiveOrderExecutionEngineOptions = {},
  ) {
    validateDependencies(dependencies);

    const clock =
      dependencies.clock ??
      new SystemOrderExecutionEngineClock();

    validateClock(clock);

    if (dependencies.resultStore !== undefined) {
      validateResultStore(
        dependencies.resultStore,
      );
    }

    if (dependencies.historyStore !== undefined) {
      validateHistoryStore(
        dependencies.historyStore,
      );
    }

    if (dependencies.observer !== undefined) {
      validateObserver(
        dependencies.observer,
      );
    }

    this.submitter = dependencies.submitter;
    this.canceller = dependencies.canceller;
    this.replacer = dependencies.replacer;
    this.reconciler = dependencies.reconciler;
    this.clock = clock;
    this.resultStore =
      dependencies.resultStore;
    this.historyStore =
      dependencies.historyStore;
    this.observer =
      dependencies.observer;
    this.options =
      resolveOptions(options);
  }

  public async execute<
    TCommand extends LiveOrderExecutionCommand,
  >(
    command: TCommand,
  ): Promise<ResultForCommand<TCommand>> {
    validateCommand(command);

    if (this.state !== "RUNNING") {
      throw new OrderExecutionEngineError(
        "ENGINE_STOPPED",
        `Order execution engine is ${this.state.toLowerCase()} and cannot accept new commands.`,
        {
          commandId:
            command.context.commandId,
          orderId:
            resolveCommandOrderId(command),
          operation:
            command.operation,
          retryable:
            this.state === "DRAINING",
        },
      );
    }

    const commandId =
      normalizeIdentifier(
        command.context.commandId,
        "command.context.commandId",
      );

    const orderId =
      resolveCommandOrderId(command);

    const existing =
      this.inFlightByCommandId.get(
        commandId,
      );

    if (existing !== undefined) {
      if (
        this.options
          .rejectConcurrentDuplicateCommands
      ) {
        throw new OrderExecutionEngineError(
          "COMMAND_ALREADY_RUNNING",
          `Command "${commandId}" is already running.`,
          {
            commandId,
            orderId,
            operation:
              command.operation,
            retryable: true,
          },
        );
      }

      return existing as Promise<
        ResultForCommand<TCommand>
      >;
    }

    const execution = this.executeIdempotently(
      command,
      commandId,
      orderId,
    );

    this.inFlightByCommandId.set(
      commandId,
      execution,
    );

    try {
      return await execution as
        ResultForCommand<TCommand>;
    } finally {
      this.inFlightByCommandId.delete(
        commandId,
      );
    }
  }

  public submit(
    command: SubmitOrderCommand,
  ): Promise<LiveOrderSubmissionResult> {
    return this.execute(command);
  }

  public cancel(
    command: CancelOrderCommand,
  ): Promise<LiveOrderCancellationResult> {
    return this.execute(command);
  }

  public replace(
    command: ReplaceOrderCommand,
  ): Promise<LiveOrderReplacementResult> {
    return this.execute(command);
  }

  public reconcile(
    command: ReconcileOrderCommand,
  ): Promise<LiveOrderReconciliationResult> {
    return this.execute(command);
  }

  public getMetrics():
    OrderExecutionEngineMetrics {
    return Object.freeze({
      state: this.state,
      acceptedCommands:
        this.acceptedCommands,
      completedCommands:
        this.completedCommands,
      failedCommands:
        this.failedCommands,
      cacheHits:
        this.cacheHits,
      inFlightCommands:
        this.inFlightByCommandId.size,
      inFlightOrders:
        this.orderTails.size,
      ...(this.lastStartedAt === undefined
        ? {}
        : {
            lastStartedAt:
              this.lastStartedAt,
          }),
      ...(this.lastCompletedAt === undefined
        ? {}
        : {
            lastCompletedAt:
              this.lastCompletedAt,
          }),
      ...(this.lastFailureAt === undefined
        ? {}
        : {
            lastFailureAt:
              this.lastFailureAt,
          }),
    });
  }

  public getState():
    OrderExecutionEngineState {
    return this.state;
  }

  /**
   * Stops accepting new commands and waits for all active commands.
   */
  public async drain(): Promise<void> {
    if (this.state === "STOPPED") {
      return;
    }

    this.state = "DRAINING";

    await Promise.allSettled([
      ...this.inFlightByCommandId.values(),
    ]);

    this.state = "STOPPED";
  }

  /**
   * Alias for graceful draining.
   */
  public async stop(): Promise<void> {
    await this.drain();
  }

  /**
   * Starts or restarts an idle engine.
   */
  public start(): void {
    if (
      this.inFlightByCommandId.size > 0 ||
      this.orderTails.size > 0
    ) {
      throw new OrderExecutionEngineError(
        "ENGINE_STOPPED",
        "Cannot start the execution engine while commands are still draining.",
        {
          retryable: true,
        },
      );
    }

    this.state = "RUNNING";
  }

  private async executeIdempotently(
    command: LiveOrderExecutionCommand,
    commandId: string,
    orderId: string,
  ): Promise<LiveOrderExecutionResult> {
    if (
      this.options.enableIdempotency &&
      this.resultStore !== undefined
    ) {
      const cached =
        await this.readCachedResult(
          commandId,
          orderId,
          command.operation,
        );

      if (cached !== undefined) {
        this.cacheHits += 1;

        const now = this.now();

        await this.notifyCompleted({
          command,
          commandId,
          orderId,
          operation:
            command.operation,
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          fromCache: true,
          result: cached,
        });

        return cached;
      }
    }

    const work = (): Promise<
      LiveOrderExecutionResult
    > => this.executeCore(
      command,
      commandId,
      orderId,
    );

    if (!this.options.serializePerOrder) {
      return work();
    }

    return this.enqueueByOrder(
      orderId,
      work,
    );
  }

  private async executeCore(
    command: LiveOrderExecutionCommand,
    commandId: string,
    orderId: string,
  ): Promise<LiveOrderExecutionResult> {
    const startedAt = this.now();

    this.acceptedCommands += 1;
    this.lastStartedAt = startedAt;

    const startedContext:
      OrderExecutionStartedContext =
      Object.freeze({
        command,
        commandId,
        orderId,
        operation:
          command.operation,
        startedAt,
      });

    await this.notifyStarted(
      startedContext,
    );

    try {
      const result =
        await this.dispatch(command);

      const completedAt =
        Math.max(
          startedAt,
          this.now(),
        );

      if (
        this.options.enableIdempotency &&
        this.resultStore !== undefined
      ) {
        await this.saveCachedResult(
          commandId,
          orderId,
          command.operation,
          result,
        );
      }

      this.completedCommands += 1;
      this.lastCompletedAt =
        completedAt;

      const completedContext:
        OrderExecutionCompletedContext =
        Object.freeze({
          ...startedContext,
          completedAt,
          durationMs:
            completedAt - startedAt,
          fromCache: false,
          result,
        });

      await this.recordHistoryEntry(
        createSuccessHistoryEntry(
          completedContext,
          this.options.metadata,
        ),
      );

      await this.notifyCompleted(
        completedContext,
      );

      return result;
    } catch (cause: unknown) {
      const completedAt =
        Math.max(
          startedAt,
          this.now(),
        );

      this.failedCommands += 1;
      this.lastFailureAt =
        completedAt;

      const failureContext:
        OrderExecutionFailedContext =
        Object.freeze({
          ...startedContext,
          completedAt,
          durationMs:
            completedAt - startedAt,
          error: cause,
        });

      await this.recordHistoryEntry(
        createFailureHistoryEntry(
          failureContext,
          this.options.metadata,
        ),
      );

      await this.notifyFailed(
        failureContext,
      );

      throw normalizeEngineFailure(
        cause,
        commandId,
        orderId,
        command.operation,
      );
    }
  }

  private dispatch(
    command: LiveOrderExecutionCommand,
  ): Promise<LiveOrderExecutionResult> {
    switch (command.operation) {
      case "SUBMIT":
        return this.submitter.submit(
          command as SubmitOrderCommand,
        );

      case "CANCEL":
        return this.canceller.cancel(
          command as CancelOrderCommand,
        );

      case "REPLACE":
        return this.replacer.replace(
          command as ReplaceOrderCommand,
        );

      case "RECONCILE":
        return this.reconciler.reconcile(
          command as ReconcileOrderCommand,
        );

      default:
        return assertNeverOperation(command);
    }
  }

  private async enqueueByOrder(
    orderId: string,
    work: () => Promise<
      LiveOrderExecutionResult
    >,
  ): Promise<LiveOrderExecutionResult> {
    const previous =
      this.orderTails.get(orderId) ??
      Promise.resolve();

    let release!: () => void;

    const tail = new Promise<void>(
      (resolve) => {
        release = resolve;
      },
    );

    const chained =
      previous
        .catch(() => undefined)
        .then(() => tail);

    this.orderTails.set(
      orderId,
      chained,
    );

    await previous.catch(
      () => undefined,
    );

    try {
      return await work();
    } finally {
      release();

      if (
        this.orderTails.get(orderId) ===
        chained
      ) {
        this.orderTails.delete(orderId);
      }
    }
  }

  private async readCachedResult(
    commandId: string,
    orderId: string,
    operation: string,
  ): Promise<
    LiveOrderExecutionResult | undefined
  > {
    try {
      return await this.resultStore
        ?.findByCommandId(commandId);
    } catch (cause: unknown) {
      if (
        this.options
          .ignoreResultStoreErrors
      ) {
        return undefined;
      }

      throw new OrderExecutionEngineError(
        "RESULT_CACHE_FAILED",
        `Failed to read cached result for command "${commandId}".`,
        {
          commandId,
          orderId,
          operation,
          retryable: true,
          cause,
        },
      );
    }
  }

  private async saveCachedResult(
    commandId: string,
    orderId: string,
    operation: string,
    result: LiveOrderExecutionResult,
  ): Promise<void> {
    try {
      await this.resultStore?.save(
        commandId,
        result,
      );
    } catch (cause: unknown) {
      if (
        this.options
          .ignoreResultStoreErrors
      ) {
        return;
      }

      throw new OrderExecutionEngineError(
        "RESULT_CACHE_FAILED",
        `Failed to persist cached result for command "${commandId}".`,
        {
          commandId,
          orderId,
          operation,
          retryable: true,
          cause,
        },
      );
    }
  }

  private async recordHistoryEntry(
    entry: OrderExecutionHistoryEntry,
  ): Promise<void> {
    if (
      !this.options.recordHistory ||
      this.historyStore === undefined
    ) {
      return;
    }

    try {
      await this.historyStore.append(
        entry,
      );
    } catch (cause: unknown) {
      if (
        this.options.ignoreHistoryErrors
      ) {
        return;
      }

      throw new OrderExecutionEngineError(
        "HISTORY_FAILED",
        `Failed to append execution history for command "${entry.commandId}".`,
        {
          commandId:
            entry.commandId,
          orderId:
            entry.orderId,
          operation:
            entry.operation,
          retryable: true,
          cause,
        },
      );
    }
  }

  private async notifyStarted(
    context:
      OrderExecutionStartedContext,
  ): Promise<void> {
    await this.invokeObserver(
      () =>
        this.observer?.onStarted?.(
          context,
        ),
      context.commandId,
      context.orderId,
      context.operation,
    );
  }

  private async notifyCompleted(
    context:
      OrderExecutionCompletedContext,
  ): Promise<void> {
    await this.invokeObserver(
      () =>
        this.observer?.onCompleted?.(
          context,
        ),
      context.commandId,
      context.orderId,
      context.operation,
    );
  }

  private async notifyFailed(
    context:
      OrderExecutionFailedContext,
  ): Promise<void> {
    await this.invokeObserver(
      () =>
        this.observer?.onFailed?.(
          context,
        ),
      context.commandId,
      context.orderId,
      context.operation,
    );
  }

  private async invokeObserver(
    invocation:
      () => void | Promise<void> | undefined,
    commandId: string,
    orderId: string,
    operation: string,
  ): Promise<void> {
    if (this.observer === undefined) {
      return;
    }

    try {
      await invocation();
    } catch (cause: unknown) {
      if (
        this.options.ignoreObserverErrors
      ) {
        return;
      }

      throw new OrderExecutionEngineError(
        "EXECUTION_FAILED",
        `Execution-engine observer failed for command "${commandId}".`,
        {
          commandId,
          orderId,
          operation,
          retryable: false,
          cause,
        },
      );
    }
  }

  private now(): number {
    return normalizeTimestamp(
      this.clock.now(),
      "orderExecutionEngine.clock.now()",
    );
  }
}

function resolveCommandOrderId(
  command: LiveOrderExecutionCommand,
): string {
  if (command.operation === "SUBMIT") {
    if (!isRecord(command.order)) {
      throw new OrderExecutionEngineError(
        "INVALID_COMMAND",
        "Submit command must contain an order record.",
        {
          commandId:
            command.context?.commandId,
          operation:
            command.operation,
        },
      );
    }

    return normalizeIdentifier(
      command.order.orderId,
      "command.order.orderId",
    );
  }

  return normalizeIdentifier(
    command.orderId,
    "command.orderId",
  );
}

function assertNeverOperation(
  command: never,
): Promise<never> {
  return Promise.reject(
    new OrderExecutionEngineError(
      "UNSUPPORTED_OPERATION",
      "Unsupported order execution operation.",
      {
        operation: String(command),
      },
    ),
  );
}

function validateCommand(
  command: LiveOrderExecutionCommand,
): void {
  if (!isRecord(command)) {
    throw new OrderExecutionEngineError(
      "INVALID_COMMAND",
      "Order execution command must be a record object.",
    );
  }

  const operation =
    normalizeIdentifier(
      command.operation,
      "command.operation",
    );

  if (
    operation !== "SUBMIT" &&
    operation !== "CANCEL" &&
    operation !== "REPLACE" &&
    operation !== "RECONCILE"
  ) {
    throw new OrderExecutionEngineError(
      "UNSUPPORTED_OPERATION",
      `Unsupported order execution operation "${operation}".`,
      {
        operation,
      },
    );
  }

  const orderId =
    resolveCommandOrderId(command);

  if (!isRecord(command.context)) {
    throw new OrderExecutionEngineError(
      "INVALID_COMMAND",
      "command.context must be a record object.",
      {
        orderId,
        operation,
      },
    );
  }

  normalizeIdentifier(
    command.context.commandId,
    "command.context.commandId",
  );

  normalizeIdentifier(
    command.context.correlationId,
    "command.context.correlationId",
  );

  normalizeTimestamp(
    command.context.initiatedAt,
    "command.context.initiatedAt",
  );
}

function validateDependencies(
  dependencies:
    LiveOrderExecutionEngineDependencies,
): void {
  if (!isRecord(dependencies)) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "Execution-engine dependencies must be a record object.",
    );
  }

  if (
    !isRecord(dependencies.submitter) ||
    typeof dependencies.submitter.submit !==
      "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "submitter must provide submit().",
    );
  }

  if (
    !isRecord(dependencies.canceller) ||
    typeof dependencies.canceller.cancel !==
      "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "canceller must provide cancel().",
    );
  }

  if (
    !isRecord(dependencies.replacer) ||
    typeof dependencies.replacer.replace !==
      "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "replacer must provide replace().",
    );
  }

  if (
    !isRecord(dependencies.reconciler) ||
    typeof dependencies.reconciler.reconcile !==
      "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "reconciler must provide reconcile().",
    );
  }
}

function validateClock(
  clock: OrderExecutionEngineClock,
): void {
  if (
    !isRecord(clock) ||
    typeof clock.now !== "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "Execution-engine clock must provide now().",
    );
  }
}

function validateResultStore(
  store: OrderExecutionResultStore,
): void {
  if (
    !isRecord(store) ||
    typeof store.findByCommandId !==
      "function" ||
    typeof store.save !== "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "Result store must provide findByCommandId() and save().",
    );
  }
}

function validateHistoryStore(
  store: OrderExecutionHistoryStore,
): void {
  if (
    !isRecord(store) ||
    typeof store.append !== "function"
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "History store must provide append().",
    );
  }
}

function validateObserver(
  observer: OrderExecutionEngineObserver,
): void {
  if (!isRecord(observer)) {
    throw new OrderExecutionEngineError(
      "INVALID_DEPENDENCY",
      "Execution-engine observer must be a record object.",
    );
  }

  for (
    const key of [
      "onStarted",
      "onCompleted",
      "onFailed",
    ] as const
  ) {
    const value = observer[key];

    if (
      value !== undefined &&
      typeof value !== "function"
    ) {
      throw new OrderExecutionEngineError(
        "INVALID_DEPENDENCY",
        `observer.${key} must be a function when provided.`,
      );
    }
  }
}

function resolveOptions(
  options:
    LiveOrderExecutionEngineOptions,
): ResolvedLiveOrderExecutionEngineOptions {
  return Object.freeze({
    serializePerOrder:
      options.serializePerOrder ??
      DEFAULT_OPTIONS.serializePerOrder,
    enableIdempotency:
      options.enableIdempotency ??
      DEFAULT_OPTIONS.enableIdempotency,
    rejectConcurrentDuplicateCommands:
      options
        .rejectConcurrentDuplicateCommands ??
      DEFAULT_OPTIONS
        .rejectConcurrentDuplicateCommands,
    recordHistory:
      options.recordHistory ??
      DEFAULT_OPTIONS.recordHistory,
    ignoreObserverErrors:
      options.ignoreObserverErrors ??
      DEFAULT_OPTIONS.ignoreObserverErrors,
    ignoreHistoryErrors:
      options.ignoreHistoryErrors ??
      DEFAULT_OPTIONS.ignoreHistoryErrors,
    ignoreResultStoreErrors:
      options.ignoreResultStoreErrors ??
      DEFAULT_OPTIONS
        .ignoreResultStoreErrors,
    metadata: freezeRecord(
      options.metadata ??
      EMPTY_METADATA,
    ),
  });
}

function createSuccessHistoryEntry(
  context:
    OrderExecutionCompletedContext,
  metadata:
    Readonly<Record<string, unknown>>,
): OrderExecutionHistoryEntry {
  return freezeHistoryEntry({
    commandId:
      context.commandId,
    orderId:
      context.orderId,
    operation:
      context.operation,
    status: "COMPLETED",
    startedAt:
      context.startedAt,
    completedAt:
      context.completedAt,
    durationMs:
      context.durationMs,
    fromCache:
      context.fromCache,
    metadata,
  });
}

function createFailureHistoryEntry(
  context:
    OrderExecutionFailedContext,
  metadata:
    Readonly<Record<string, unknown>>,
): OrderExecutionHistoryEntry {
  const error =
    readErrorDetails(context.error);

  return freezeHistoryEntry({
    commandId:
      context.commandId,
    orderId:
      context.orderId,
    operation:
      context.operation,
    status: "FAILED",
    startedAt:
      context.startedAt,
    completedAt:
      context.completedAt,
    durationMs:
      context.durationMs,
    fromCache: false,
    ...(error.code === undefined
      ? {}
      : {
          errorCode:
            error.code,
        }),
    errorMessage:
      error.message,
    metadata,
  });
}

function freezeHistoryEntry(
  entry: OrderExecutionHistoryEntry,
): OrderExecutionHistoryEntry {
  return Object.freeze({
    commandId:
      normalizeIdentifier(
        entry.commandId,
        "history.commandId",
      ),
    orderId:
      normalizeIdentifier(
        entry.orderId,
        "history.orderId",
      ),
    operation:
      entry.operation,
    status:
      entry.status,
    startedAt:
      normalizeTimestamp(
        entry.startedAt,
        "history.startedAt",
      ),
    completedAt:
      normalizeTimestamp(
        entry.completedAt,
        "history.completedAt",
      ),
    durationMs:
      validateNonNegativeNumber(
        entry.durationMs,
        "history.durationMs",
      ),
    fromCache:
      entry.fromCache,
    ...(entry.errorCode === undefined
      ? {}
      : {
          errorCode:
            entry.errorCode,
        }),
    ...(entry.errorMessage === undefined
      ? {}
      : {
          errorMessage:
            entry.errorMessage,
        }),
    metadata:
      freezeRecord(entry.metadata),
  });
}

function normalizeEngineFailure(
  cause: unknown,
  commandId: string,
  orderId: string,
  operation: string,
): OrderExecutionEngineError {
  if (
    cause instanceof
    OrderExecutionEngineError
  ) {
    return cause;
  }

  const details =
    readErrorDetails(cause);

  return new OrderExecutionEngineError(
    "EXECUTION_FAILED",
    `Order command "${commandId}" failed during ${operation}: ${details.message}`,
    {
      commandId,
      orderId,
      operation,
      retryable:
        details.retryable,
      cause,
    },
  );
}

function readErrorDetails(
  cause: unknown,
): Readonly<{
  code?: string;
  message: string;
  retryable: boolean;
}> {
  if (isRecord(cause)) {
    const code =
      readString(cause, "code");

    const message =
      readString(cause, "message") ??
      "Unknown execution failure.";

    const retryable =
      typeof cause.retryable === "boolean"
        ? cause.retryable
        : false;

    return Object.freeze({
      ...(code === undefined
        ? {}
        : { code }),
      message,
      retryable,
    });
  }

  if (cause instanceof Error) {
    return Object.freeze({
      message: cause.message,
      retryable: false,
    });
  }

  return Object.freeze({
    message:
      typeof cause === "string"
        ? cause
        : "Unknown execution failure.",
    retryable: false,
  });
}

function normalizeIdentifier(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeTimestamp(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_COMMAND",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }

  return value;
}

function validateNonNegativeNumber(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new OrderExecutionEngineError(
      "INVALID_COMMAND",
      `${field} must be a finite non-negative number.`,
    );
  }

  return value;
}

function readString(
  source:
    Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = source[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized =
    value.trim();

  return normalized.length === 0
    ? undefined
    : normalized;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function freezeRecord(
  source:
    Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result:
    Record<string, unknown> = {};

  for (
    const key of
      Object.keys(source).sort()
  ) {
    const value = source[key];

    if (value !== undefined) {
      result[key] =
        freezeUnknown(value);
    }
  }

  return Object.freeze(result);
}

function freezeUnknown(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(freezeUnknown),
    );
  }

  if (isRecord(value)) {
    return freezeRecord(value);
  }

  return value;
}