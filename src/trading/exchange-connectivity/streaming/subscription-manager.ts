/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 4:
 * Subscription Manager
 *
 * This module coordinates the lifecycle of unified streaming subscriptions.
 *
 * Responsibilities:
 * - Validate and normalize subscription requests
 * - Prevent duplicate active subscriptions
 * - Acquire and release pooled WebSocket connections
 * - Send subscribe and unsubscribe commands
 * - Track deterministic subscription state transitions
 * - Isolate exchange-specific command encoding behind an adapter
 * - Maintain immutable subscription snapshots
 * - Support retries through explicit retry operations
 * - Support deterministic testing through injected clocks
 */

import {
  WebSocketConnectionLease,
  WebSocketConnectionLeaseId,
  WebSocketConnectionPool,
} from "./websocket-connection-pool";

import {
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSubscriptionId,
  UnifiedStreamingSubscription,
  UnifiedStreamingSubscriptionSnapshot,
  UnifiedSubscriptionResult,
  UnifiedSubscriptionState,
  createStreamingSubscriptionKey,
  freezeUnifiedStreamingSubscription,
  validateUnifiedStreamingSubscription,
} from "./unified-streaming-interface";

import {
  WebSocketMessageKind,
  WebSocketOutboundMessage,
} from "./websocket-manager";

export interface StreamingSubscriptionManagerClock {
  now(): number;
}

export interface StreamingSubscriptionCommandContext {
  readonly subscription: UnifiedStreamingSubscription;
  readonly connectionId: StreamingConnectionId;
  readonly leaseId: WebSocketConnectionLeaseId;
  readonly attempt: number;
}

export interface StreamingSubscriptionCommandAdapter {
  createSubscribeMessage(
    context: StreamingSubscriptionCommandContext,
  ): WebSocketOutboundMessage;

  createUnsubscribeMessage(
    context: StreamingSubscriptionCommandContext,
  ): WebSocketOutboundMessage;
}

export interface StreamingSubscriptionManagerOptions {
  /**
   * Maximum number of subscriptions managed across all exchanges.
   */
  readonly maxSubscriptions?: number;

  /**
   * Maximum number of subscriptions assigned to one physical connection.
   */
  readonly maxSubscriptionsPerConnection?: number;

  /**
   * When true, duplicate active subscriptions are returned as
   * ALREADY_ACTIVE instead of throwing.
   *
   * Defaults to true.
   */
  readonly allowIdempotentSubscribe?: boolean;

  /**
   * When true, unsubscribing an unknown subscription returns NOT_FOUND.
   *
   * Defaults to true.
   */
  readonly allowIdempotentUnsubscribe?: boolean;

  /**
   * Maximum number of explicit retry attempts allowed after failure.
   */
  readonly maxRetryAttempts?: number;
}

export interface StreamingSubscriptionManagerSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalSubscriptions: number;
  readonly pendingSubscriptions: number;
  readonly activeSubscriptions: number;
  readonly inactiveSubscriptions: number;
  readonly failedSubscriptions: number;
  readonly totalConnectionLeases: number;
  readonly subscriptions: readonly UnifiedStreamingSubscriptionSnapshot[];
}

export interface StreamingSubscriptionOperationFailure {
  readonly subscriptionId: StreamingSubscriptionId;
  readonly exchangeId: StreamingExchangeId;
  readonly error: Error;
}

export interface StreamingSubscriptionBulkResult {
  readonly successfulSubscriptionIds:
    readonly StreamingSubscriptionId[];
  readonly failures:
    readonly StreamingSubscriptionOperationFailure[];
}

interface MutableSubscriptionRecord {
  readonly subscription: UnifiedStreamingSubscription;
  readonly subscriptionKey: string;
  readonly createdAt: number;

  state: UnifiedSubscriptionState;
  lastChangedAt: number;
  activatedAt?: number;
  deactivatedAt?: number;
  failureReason?: string;
  connectionId?: StreamingConnectionId;
  leaseId?: WebSocketConnectionLeaseId;
  attempts: number;
}

interface MutableConnectionAssignment {
  readonly connectionId: StreamingConnectionId;
  readonly leaseId: WebSocketConnectionLeaseId;
  readonly exchangeId: StreamingExchangeId;
  readonly subscriptionIds: Set<StreamingSubscriptionId>;
}

const DEFAULT_MAX_SUBSCRIPTIONS = 10_000;
const DEFAULT_MAX_SUBSCRIPTIONS_PER_CONNECTION = 100;
const DEFAULT_MAX_RETRY_ATTEMPTS = 3;

const SYSTEM_CLOCK: StreamingSubscriptionManagerClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const EMPTY_RECORD: Readonly<Record<string, unknown>> =
  Object.freeze({});

const VALID_MESSAGE_KINDS: readonly WebSocketMessageKind[] =
  Object.freeze<WebSocketMessageKind[]>([
    "TEXT",
    "BINARY",
    "JSON",
    "PING",
    "PONG",
    "UNKNOWN",
  ]);

export class StreamingSubscriptionManagerError extends Error {
  public readonly code: string;
  public readonly subscriptionId?: StreamingSubscriptionId;
  public readonly exchangeId?: StreamingExchangeId;
  public readonly connectionId?: StreamingConnectionId;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly subscriptionId?: StreamingSubscriptionId;
      readonly exchangeId?: StreamingExchangeId;
      readonly connectionId?: StreamingConnectionId;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "StreamingSubscriptionManagerError";
    this.code = code;
    this.subscriptionId = context?.subscriptionId;
    this.exchangeId = context?.exchangeId;
    this.connectionId = context?.connectionId;
  }
}

/**
 * Coordinates unified subscription state across pooled WebSocket
 * connections.
 */
export class StreamingSubscriptionManager {
  private readonly subscriptions =
    new Map<StreamingSubscriptionId, MutableSubscriptionRecord>();

  private readonly subscriptionIdsByKey =
    new Map<string, StreamingSubscriptionId>();

  private readonly assignmentsByConnection =
    new Map<StreamingConnectionId, MutableConnectionAssignment>();

  private readonly activeOperations =
    new Map<StreamingSubscriptionId, Promise<UnifiedSubscriptionResult>>();

  private readonly pool: WebSocketConnectionPool;
  private readonly commandAdapter: StreamingSubscriptionCommandAdapter;
  private readonly clock: StreamingSubscriptionManagerClock;

  private readonly maxSubscriptions: number;
  private readonly maxSubscriptionsPerConnection: number;
  private readonly allowIdempotentSubscribe: boolean;
  private readonly allowIdempotentUnsubscribe: boolean;
  private readonly maxRetryAttempts: number;

  private disposed = false;

  public constructor(
    pool: WebSocketConnectionPool,
    commandAdapter: StreamingSubscriptionCommandAdapter,
    options: StreamingSubscriptionManagerOptions = {},
    clock: StreamingSubscriptionManagerClock = SYSTEM_CLOCK,
  ) {
    this.pool = validateConnectionPool(pool);
    this.commandAdapter = validateCommandAdapter(commandAdapter);
    this.clock = validateClock(clock);

    this.maxSubscriptions = validatePositiveSafeInteger(
      options.maxSubscriptions ?? DEFAULT_MAX_SUBSCRIPTIONS,
      "maxSubscriptions",
    );

    this.maxSubscriptionsPerConnection =
      validatePositiveSafeInteger(
        options.maxSubscriptionsPerConnection ??
          DEFAULT_MAX_SUBSCRIPTIONS_PER_CONNECTION,
        "maxSubscriptionsPerConnection",
      );

    this.allowIdempotentSubscribe =
      options.allowIdempotentSubscribe ?? true;

    this.allowIdempotentUnsubscribe =
      options.allowIdempotentUnsubscribe ?? true;

    this.maxRetryAttempts = validatePositiveSafeInteger(
      options.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS,
      "maxRetryAttempts",
    );
  }

  /**
   * Subscribes to a unified market-data stream.
   */
  public subscribe(
    subscription: UnifiedStreamingSubscription,
  ): Promise<UnifiedSubscriptionResult> {
    this.assertActive();

    validateUnifiedStreamingSubscription(subscription);

    const normalizedSubscription =
      freezeUnifiedStreamingSubscription(subscription);

    const subscriptionId =
      normalizedSubscription.subscriptionId;

    const existingOperation =
      this.activeOperations.get(subscriptionId);

    if (existingOperation !== undefined) {
      return existingOperation;
    }

    const operation = this.performSubscribe(
      normalizedSubscription,
    ).finally(() => {
      this.activeOperations.delete(subscriptionId);
    });

    this.activeOperations.set(subscriptionId, operation);

    return operation;
  }

  /**
   * Unsubscribes an existing unified subscription.
   */
  public unsubscribe(
    subscriptionId: StreamingSubscriptionId,
  ): Promise<UnifiedSubscriptionResult> {
    this.assertActive();

    const normalizedSubscriptionId = validateIdentifier(
      subscriptionId,
      "subscriptionId",
    );

    const existingOperation =
      this.activeOperations.get(normalizedSubscriptionId);

    if (existingOperation !== undefined) {
      return existingOperation.then(() =>
        this.unsubscribe(normalizedSubscriptionId),
      );
    }

    const operation = this.performUnsubscribe(
      normalizedSubscriptionId,
    ).finally(() => {
      this.activeOperations.delete(normalizedSubscriptionId);
    });

    this.activeOperations.set(
      normalizedSubscriptionId,
      operation,
    );

    return operation;
  }

  /**
   * Retries a failed or inactive subscription.
   */
  public retry(
    subscriptionId: StreamingSubscriptionId,
  ): Promise<UnifiedSubscriptionResult> {
    this.assertActive();

    const normalizedSubscriptionId = validateIdentifier(
      subscriptionId,
      "subscriptionId",
    );

    const record = this.getRequiredSubscription(
      normalizedSubscriptionId,
    );

    if (
      record.state !== "FAILED" &&
      record.state !== "INACTIVE"
    ) {
      throw new StreamingSubscriptionManagerError(
        "SUBSCRIPTION_NOT_RETRYABLE",
        `Subscription "${normalizedSubscriptionId}" cannot be retried from state "${record.state}".`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
          connectionId: record.connectionId,
        },
      );
    }

    if (record.attempts >= this.maxRetryAttempts) {
      throw new StreamingSubscriptionManagerError(
        "MAX_RETRY_ATTEMPTS_EXCEEDED",
        `Subscription "${normalizedSubscriptionId}" has reached the maximum retry count of ${this.maxRetryAttempts}.`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
          connectionId: record.connectionId,
        },
      );
    }

    return this.subscribe(record.subscription);
  }

  /**
   * Subscribes multiple requests sequentially in deterministic order.
   */
  public async subscribeAll(
    subscriptions: readonly UnifiedStreamingSubscription[],
  ): Promise<StreamingSubscriptionBulkResult> {
    this.assertActive();

    if (!Array.isArray(subscriptions)) {
      throw new StreamingSubscriptionManagerError(
        "INVALID_SUBSCRIPTION_COLLECTION",
        "subscriptions must be an array.",
      );
    }

    const orderedSubscriptions = [...subscriptions].sort(
      (left, right) =>
        left.subscriptionId.localeCompare(
          right.subscriptionId,
        ),
    );

    const successfulSubscriptionIds:
      StreamingSubscriptionId[] = [];

    const failures:
      StreamingSubscriptionOperationFailure[] = [];

    for (const subscription of orderedSubscriptions) {
      try {
        const result = await this.subscribe(subscription);

        if (
          result.status === "ACCEPTED" ||
          result.status === "ALREADY_ACTIVE"
        ) {
          successfulSubscriptionIds.push(
            result.subscriptionId,
          );
        } else {
          failures.push({
            subscriptionId: result.subscriptionId,
            exchangeId: result.exchangeId,
            error: new StreamingSubscriptionManagerError(
              "SUBSCRIPTION_NOT_ACCEPTED",
              result.reason ??
                `Subscription "${result.subscriptionId}" was not accepted.`,
              {
                subscriptionId: result.subscriptionId,
                exchangeId: result.exchangeId,
                connectionId: result.connectionId,
              },
            ),
          });
        }
      } catch (error: unknown) {
        failures.push({
          subscriptionId: subscription.subscriptionId,
          exchangeId: subscription.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    return freezeBulkResult(
      successfulSubscriptionIds,
      failures,
    );
  }

  /**
   * Unsubscribes every currently registered subscription.
   */
  public async unsubscribeAll(): Promise<StreamingSubscriptionBulkResult> {
    this.assertActive();

    const successfulSubscriptionIds:
      StreamingSubscriptionId[] = [];

    const failures:
      StreamingSubscriptionOperationFailure[] = [];

    const subscriptionIds = [
      ...this.subscriptions.keys(),
    ].sort();

    for (const subscriptionId of subscriptionIds) {
      const record = this.subscriptions.get(subscriptionId);

      if (record === undefined) {
        continue;
      }

      try {
        const result = await this.unsubscribe(subscriptionId);

        if (
          result.status === "ACCEPTED" ||
          result.status === "NOT_FOUND"
        ) {
          successfulSubscriptionIds.push(subscriptionId);
        } else {
          failures.push({
            subscriptionId,
            exchangeId: record.subscription.exchangeId,
            error: new StreamingSubscriptionManagerError(
              "UNSUBSCRIPTION_NOT_ACCEPTED",
              result.reason ??
                `Unsubscription "${subscriptionId}" was not accepted.`,
              {
                subscriptionId,
                exchangeId: record.subscription.exchangeId,
                connectionId: result.connectionId,
              },
            ),
          });
        }
      } catch (error: unknown) {
        failures.push({
          subscriptionId,
          exchangeId: record.subscription.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    return freezeBulkResult(
      successfulSubscriptionIds,
      failures,
    );
  }

  public getSubscription(
    subscriptionId: StreamingSubscriptionId,
  ): UnifiedStreamingSubscriptionSnapshot | undefined {
    const normalizedSubscriptionId = validateIdentifier(
      subscriptionId,
      "subscriptionId",
    );

    const record =
      this.subscriptions.get(normalizedSubscriptionId);

    if (record === undefined) {
      return undefined;
    }

    return createSubscriptionSnapshot(record);
  }

  public getSubscriptions():
    readonly UnifiedStreamingSubscriptionSnapshot[] {
    return Object.freeze(
      this.getOrderedSubscriptionRecords().map((record) =>
        createSubscriptionSnapshot(record),
      ),
    );
  }

  public getSubscriptionsForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return Object.freeze(
      this.getOrderedSubscriptionRecords()
        .filter(
          (record) =>
            record.subscription.exchangeId ===
            normalizedExchangeId,
        )
        .map((record) =>
          createSubscriptionSnapshot(record),
        ),
    );
  }

  public getSubscriptionsForConnection(
    connectionId: StreamingConnectionId,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedConnectionId = validateIdentifier(
      connectionId,
      "connectionId",
    );

    const assignment =
      this.assignmentsByConnection.get(
        normalizedConnectionId,
      );

    if (assignment === undefined) {
      return Object.freeze([]);
    }

    return Object.freeze(
      [...assignment.subscriptionIds]
        .sort()
        .map((subscriptionId) =>
          this.subscriptions.get(subscriptionId),
        )
        .filter(
          (
            record,
          ): record is MutableSubscriptionRecord =>
            record !== undefined,
        )
        .map((record) =>
          createSubscriptionSnapshot(record),
        ),
    );
  }

  public getSnapshot(): StreamingSubscriptionManagerSnapshot {
    const subscriptions = this.getSubscriptions();

    let pendingSubscriptions = 0;
    let activeSubscriptions = 0;
    let inactiveSubscriptions = 0;
    let failedSubscriptions = 0;

    for (const subscription of subscriptions) {
      switch (subscription.state) {
        case "PENDING":
        case "SUBSCRIBING":
        case "UNSUBSCRIBING":
          pendingSubscriptions += 1;
          break;

        case "ACTIVE":
          activeSubscriptions += 1;
          break;

        case "INACTIVE":
          inactiveSubscriptions += 1;
          break;

        case "FAILED":
          failedSubscriptions += 1;
          break;

        default:
          assertNever(subscription.state);
      }
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalSubscriptions: subscriptions.length,
      pendingSubscriptions,
      activeSubscriptions,
      inactiveSubscriptions,
      failedSubscriptions,
      totalConnectionLeases:
        this.assignmentsByConnection.size,
      subscriptions,
    });
  }

  public get totalSubscriptions(): number {
    return this.subscriptions.size;
  }

  public get activeSubscriptions(): number {
    let count = 0;

    for (const record of this.subscriptions.values()) {
      if (record.state === "ACTIVE") {
        count += 1;
      }
    }

    return count;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Unsubscribes all active streams and releases all connection leases.
   */
  public async dispose(): Promise<StreamingSubscriptionBulkResult> {
    if (this.disposed) {
      return freezeBulkResult([], []);
    }

    const successfulSubscriptionIds:
      StreamingSubscriptionId[] = [];

    const failures:
      StreamingSubscriptionOperationFailure[] = [];

    const records =
      this.getOrderedSubscriptionRecords().reverse();

    for (const record of records) {
      const subscriptionId =
        record.subscription.subscriptionId;

      try {
        if (
          record.state === "ACTIVE" ||
          record.state === "FAILED" ||
          record.state === "INACTIVE"
        ) {
          await this.performUnsubscribe(subscriptionId);
        }

        successfulSubscriptionIds.push(subscriptionId);
      } catch (error: unknown) {
        failures.push({
          subscriptionId,
          exchangeId: record.subscription.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    const assignments = [
      ...this.assignmentsByConnection.values(),
    ].sort((left, right) =>
      left.connectionId.localeCompare(right.connectionId),
    );

    for (const assignment of assignments) {
      try {
        await this.pool.release(assignment.leaseId);
      } catch {
        // Individual release failures are already represented through
        // affected subscription operations.
      }
    }

    this.subscriptions.clear();
    this.subscriptionIdsByKey.clear();
    this.assignmentsByConnection.clear();
    this.activeOperations.clear();
    this.disposed = true;

    return freezeBulkResult(
      successfulSubscriptionIds,
      failures,
    );
  }

  private async performSubscribe(
    subscription: UnifiedStreamingSubscription,
  ): Promise<UnifiedSubscriptionResult> {
    const subscriptionId = subscription.subscriptionId;
    const subscriptionKey =
      createStreamingSubscriptionKey(subscription);

    const existingRecord =
      this.subscriptions.get(subscriptionId);

    if (existingRecord !== undefined) {
      if (existingRecord.state === "ACTIVE") {
        if (!this.allowIdempotentSubscribe) {
          throw new StreamingSubscriptionManagerError(
            "SUBSCRIPTION_ALREADY_ACTIVE",
            `Subscription "${subscriptionId}" is already active.`,
            {
              subscriptionId,
              exchangeId: subscription.exchangeId,
              connectionId: existingRecord.connectionId,
            },
          );
        }

        return this.createResult(
          "SUBSCRIBE",
          "ALREADY_ACTIVE",
          existingRecord,
          "Subscription is already active.",
        );
      }

      if (
        existingRecord.state === "SUBSCRIBING" ||
        existingRecord.state === "UNSUBSCRIBING"
      ) {
        throw new StreamingSubscriptionManagerError(
          "SUBSCRIPTION_OPERATION_IN_PROGRESS",
          `Subscription "${subscriptionId}" has an operation in progress.`,
          {
            subscriptionId,
            exchangeId: subscription.exchangeId,
            connectionId: existingRecord.connectionId,
          },
        );
      }
    }

    const duplicateSubscriptionId =
      this.subscriptionIdsByKey.get(subscriptionKey);

    if (
      duplicateSubscriptionId !== undefined &&
      duplicateSubscriptionId !== subscriptionId
    ) {
      const duplicateRecord =
        this.subscriptions.get(duplicateSubscriptionId);

      if (
        duplicateRecord !== undefined &&
        duplicateRecord.state === "ACTIVE"
      ) {
        if (this.allowIdempotentSubscribe) {
          return Object.freeze({
            operation: "SUBSCRIBE",
            status: "ALREADY_ACTIVE",
            subscriptionId:
              duplicateRecord.subscription.subscriptionId,
            exchangeId:
              duplicateRecord.subscription.exchangeId,
            connectionId: duplicateRecord.connectionId,
            occurredAt: this.now(),
            reason:
              "An equivalent subscription is already active.",
          });
        }

        throw new StreamingSubscriptionManagerError(
          "DUPLICATE_SUBSCRIPTION",
          `Equivalent subscription "${duplicateSubscriptionId}" is already active.`,
          {
            subscriptionId,
            exchangeId: subscription.exchangeId,
            connectionId: duplicateRecord.connectionId,
          },
        );
      }
    }

    if (
      existingRecord === undefined &&
      this.subscriptions.size >= this.maxSubscriptions
    ) {
      throw new StreamingSubscriptionManagerError(
        "SUBSCRIPTION_CAPACITY_EXHAUSTED",
        `Subscription manager has reached its maximum capacity of ${this.maxSubscriptions}.`,
        {
          subscriptionId,
          exchangeId: subscription.exchangeId,
        },
      );
    }

    const timestamp = this.now();

    const record =
      existingRecord ??
      this.createSubscriptionRecord(
        subscription,
        subscriptionKey,
        timestamp,
      );

    record.state = "SUBSCRIBING";
    record.lastChangedAt = timestamp;
    record.failureReason = undefined;
    record.attempts += 1;

    if (existingRecord === undefined) {
      this.subscriptions.set(subscriptionId, record);
      this.subscriptionIdsByKey.set(
        subscriptionKey,
        subscriptionId,
      );
    }

    let assignment:
      | MutableConnectionAssignment
      | undefined;

    try {
      assignment = await this.resolveConnectionAssignment(
        subscription.exchangeId,
      );

      record.connectionId = assignment.connectionId;
      record.leaseId = assignment.leaseId;

      const context: StreamingSubscriptionCommandContext =
        Object.freeze({
          subscription,
          connectionId: assignment.connectionId,
          leaseId: assignment.leaseId,
          attempt: record.attempts,
        });

      const message =
        this.commandAdapter.createSubscribeMessage(context);

      validateOutboundMessage(message);

      const connection = this.pool.getConnection(
        assignment.connectionId,
      );

      if (connection === undefined) {
        throw new StreamingSubscriptionManagerError(
          "ASSIGNED_CONNECTION_NOT_FOUND",
          `Assigned connection "${assignment.connectionId}" was not found.`,
          {
            subscriptionId,
            exchangeId: subscription.exchangeId,
            connectionId: assignment.connectionId,
          },
        );
      }

      await connection.send(message);

      assignment.subscriptionIds.add(subscriptionId);

      const activatedAt = this.now();

      record.state = "ACTIVE";
      record.lastChangedAt = activatedAt;
      record.activatedAt = activatedAt;
      record.deactivatedAt = undefined;
      record.failureReason = undefined;

      return this.createResult(
        "SUBSCRIBE",
        "ACCEPTED",
        record,
      );
    } catch (error: unknown) {
      const failureTimestamp = this.now();

      record.state = "FAILED";
      record.lastChangedAt = failureTimestamp;
      record.failureReason =
        normalizeError(error).message;

      if (
        assignment !== undefined &&
        assignment.subscriptionIds.size === 0
      ) {
        await this.releaseAssignmentIfUnused(
          assignment.connectionId,
        );
      }

      return this.createResult(
        "SUBSCRIBE",
        "FAILED",
        record,
        record.failureReason,
      );
    }
  }

  private async performUnsubscribe(
    subscriptionId: StreamingSubscriptionId,
  ): Promise<UnifiedSubscriptionResult> {
    const record =
      this.subscriptions.get(subscriptionId);

    if (record === undefined) {
      if (!this.allowIdempotentUnsubscribe) {
        throw new StreamingSubscriptionManagerError(
          "SUBSCRIPTION_NOT_FOUND",
          `Subscription "${subscriptionId}" was not found.`,
          {
            subscriptionId,
          },
        );
      }

      return Object.freeze({
        operation: "UNSUBSCRIBE",
        status: "NOT_FOUND",
        subscriptionId,
        exchangeId: "UNKNOWN",
        occurredAt: this.now(),
        reason: "Subscription was not found.",
      });
    }

    if (record.state === "INACTIVE") {
      return this.createResult(
        "UNSUBSCRIBE",
        "ACCEPTED",
        record,
        "Subscription is already inactive.",
      );
    }

    const timestamp = this.now();

    record.state = "UNSUBSCRIBING";
    record.lastChangedAt = timestamp;
    record.failureReason = undefined;

    try {
      if (
        record.connectionId !== undefined &&
        record.leaseId !== undefined
      ) {
        const connection = this.pool.getConnection(
          record.connectionId,
        );

        if (connection !== undefined) {
          const context: StreamingSubscriptionCommandContext =
            Object.freeze({
              subscription: record.subscription,
              connectionId: record.connectionId,
              leaseId: record.leaseId,
              attempt: record.attempts,
            });

          const message =
            this.commandAdapter.createUnsubscribeMessage(
              context,
            );

          validateOutboundMessage(message);

          await connection.send(message);
        }

        const assignment =
          this.assignmentsByConnection.get(
            record.connectionId,
          );

        assignment?.subscriptionIds.delete(
          subscriptionId,
        );
      }

      const deactivatedAt = this.now();

      record.state = "INACTIVE";
      record.lastChangedAt = deactivatedAt;
      record.deactivatedAt = deactivatedAt;
      record.failureReason = undefined;

      const connectionId = record.connectionId;

      if (connectionId !== undefined) {
        await this.releaseAssignmentIfUnused(connectionId);
      }

      return this.createResult(
        "UNSUBSCRIBE",
        "ACCEPTED",
        record,
      );
    } catch (error: unknown) {
      const normalizedError = normalizeError(error);

      record.state = "FAILED";
      record.lastChangedAt = this.now();
      record.failureReason = normalizedError.message;

      return this.createResult(
        "UNSUBSCRIBE",
        "FAILED",
        record,
        normalizedError.message,
      );
    }
  }

  private async resolveConnectionAssignment(
    exchangeId: StreamingExchangeId,
  ): Promise<MutableConnectionAssignment> {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    const reusableAssignment = [
      ...this.assignmentsByConnection.values(),
    ]
      .filter(
        (assignment) =>
          assignment.exchangeId === normalizedExchangeId &&
          assignment.subscriptionIds.size <
            this.maxSubscriptionsPerConnection,
      )
      .sort(compareAssignments)[0];

    if (reusableAssignment !== undefined) {
      return reusableAssignment;
    }

    const lease = await this.pool.acquire({
      exchangeId: normalizedExchangeId,
      connect: true,
    });

    const assignment: MutableConnectionAssignment = {
      connectionId: lease.connectionId,
      leaseId: lease.leaseId,
      exchangeId: lease.exchangeId,
      subscriptionIds:
        new Set<StreamingSubscriptionId>(),
    };

    this.assignmentsByConnection.set(
      assignment.connectionId,
      assignment,
    );

    return assignment;
  }

  private async releaseAssignmentIfUnused(
    connectionId: StreamingConnectionId,
  ): Promise<void> {
    const assignment =
      this.assignmentsByConnection.get(connectionId);

    if (
      assignment === undefined ||
      assignment.subscriptionIds.size > 0
    ) {
      return;
    }

    this.assignmentsByConnection.delete(connectionId);

    await this.pool.release(assignment.leaseId);
  }

  private createSubscriptionRecord(
    subscription: UnifiedStreamingSubscription,
    subscriptionKey: string,
    timestamp: number,
  ): MutableSubscriptionRecord {
    return {
      subscription,
      subscriptionKey,
      createdAt: timestamp,
      state: "PENDING",
      lastChangedAt: timestamp,
      attempts: 0,
    };
  }

  private createResult(
    operation: "SUBSCRIBE" | "UNSUBSCRIBE",
    status:
      | "ACCEPTED"
      | "REJECTED"
      | "ALREADY_ACTIVE"
      | "NOT_FOUND"
      | "FAILED",
    record: MutableSubscriptionRecord,
    reason?: string,
  ): UnifiedSubscriptionResult {
    return Object.freeze({
      operation,
      status,
      subscriptionId:
        record.subscription.subscriptionId,
      exchangeId: record.subscription.exchangeId,
      connectionId: record.connectionId,
      occurredAt: this.now(),
      reason,
    });
  }

  private getRequiredSubscription(
    subscriptionId: StreamingSubscriptionId,
  ): MutableSubscriptionRecord {
    const record = this.subscriptions.get(subscriptionId);

    if (record === undefined) {
      throw new StreamingSubscriptionManagerError(
        "SUBSCRIPTION_NOT_FOUND",
        `Subscription "${subscriptionId}" was not found.`,
        {
          subscriptionId,
        },
      );
    }

    return record;
  }

  private getOrderedSubscriptionRecords():
    MutableSubscriptionRecord[] {
    return [...this.subscriptions.values()].sort(
      (left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }

        return left.subscription.subscriptionId.localeCompare(
          right.subscription.subscriptionId,
        );
      },
    );
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new StreamingSubscriptionManagerError(
        "SUBSCRIPTION_MANAGER_DISPOSED",
        "The streaming subscription manager has been disposed.",
      );
    }
  }
}

function createSubscriptionSnapshot(
  record: MutableSubscriptionRecord,
): UnifiedStreamingSubscriptionSnapshot {
  return Object.freeze({
    subscriptionId:
      record.subscription.subscriptionId,
    exchangeId: record.subscription.exchangeId,
    connectionId: record.connectionId,
    channel: record.subscription.channel,
    symbol: record.subscription.symbol,
    scope: record.subscription.scope,
    state: record.state,
    createdAt: record.createdAt,
    lastChangedAt: record.lastChangedAt,
    activatedAt: record.activatedAt,
    deactivatedAt: record.deactivatedAt,
    failureReason: record.failureReason,
    parameters: Object.freeze({
      ...(record.subscription.parameters ??
        EMPTY_RECORD),
    }),
    metadata: Object.freeze({
      ...(record.subscription.metadata ??
        EMPTY_RECORD),
    }),
  });
}

function compareAssignments(
  left: MutableConnectionAssignment,
  right: MutableConnectionAssignment,
): number {
  if (
    left.subscriptionIds.size !==
    right.subscriptionIds.size
  ) {
    return (
      left.subscriptionIds.size -
      right.subscriptionIds.size
    );
  }

  return left.connectionId.localeCompare(
    right.connectionId,
  );
}

function validateConnectionPool(
  pool: WebSocketConnectionPool,
): WebSocketConnectionPool {
  if (
    pool === null ||
    typeof pool !== "object" ||
    typeof pool.acquire !== "function" ||
    typeof pool.release !== "function" ||
    typeof pool.getConnection !== "function"
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_CONNECTION_POOL",
      "A valid WebSocketConnectionPool instance is required.",
    );
  }

  return pool;
}

function validateCommandAdapter(
  adapter: StreamingSubscriptionCommandAdapter,
): StreamingSubscriptionCommandAdapter {
  if (
    adapter === null ||
    typeof adapter !== "object" ||
    typeof adapter.createSubscribeMessage !== "function" ||
    typeof adapter.createUnsubscribeMessage !== "function"
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_COMMAND_ADAPTER",
      "Subscription command adapter must implement subscribe and unsubscribe message creation.",
    );
  }

  return adapter;
}

function validateClock(
  clock: StreamingSubscriptionManagerClock,
): StreamingSubscriptionManagerClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_CLOCK",
      "Streaming subscription manager clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function validateOutboundMessage(
  message: WebSocketOutboundMessage,
): void {
  if (message === null || typeof message !== "object") {
    throw new StreamingSubscriptionManagerError(
      "INVALID_SUBSCRIPTION_COMMAND",
      "Subscription command must be a WebSocket outbound message.",
    );
  }

  if (!VALID_MESSAGE_KINDS.includes(message.kind)) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_SUBSCRIPTION_COMMAND_KIND",
      `Unsupported subscription command message kind "${String(
        message.kind,
      )}".`,
    );
  }

  if (
    message.channel !== undefined &&
    (typeof message.channel !== "string" ||
      message.channel.trim().length === 0)
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_SUBSCRIPTION_COMMAND_CHANNEL",
      "Subscription command channel must be a non-empty string when provided.",
    );
  }
}

function freezeBulkResult(
  successfulSubscriptionIds:
    StreamingSubscriptionId[],
  failures: StreamingSubscriptionOperationFailure[],
): StreamingSubscriptionBulkResult {
  return Object.freeze({
    successfulSubscriptionIds: Object.freeze([
      ...successfulSubscriptionIds,
    ]),
    failures: Object.freeze(
      failures.map((failure) =>
        Object.freeze({
          ...failure,
        }),
      ),
    ),
  });
}

function normalizeExchangeId(
  exchangeId: StreamingExchangeId,
): StreamingExchangeId {
  return validateIdentifier(
    exchangeId,
    "exchangeId",
  ).toUpperCase();
}

function validateIdentifier(
  value: string,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function validatePositiveSafeInteger(
  value: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new StreamingSubscriptionManagerError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(
      "Unknown streaming subscription manager error.",
    );
  }
}

function assertNever(value: never): never {
  throw new StreamingSubscriptionManagerError(
    "UNSUPPORTED_SUBSCRIPTION_STATE",
    `Unsupported subscription state "${String(value)}".`,
  );
}