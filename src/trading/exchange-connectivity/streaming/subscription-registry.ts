/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 5:
 * Subscription Registry
 *
 * The subscription registry is the authoritative in-memory catalog for
 * unified streaming subscriptions.
 *
 * Responsibilities:
 * - Register and remove subscriptions
 * - Enforce subscription ID and logical-key uniqueness
 * - Maintain indexes by exchange, connection, channel, symbol, scope and state
 * - Synchronize subscription lifecycle state
 * - Support deterministic ordered queries
 * - Produce immutable snapshots
 * - Provide deterministic testing through an injected clock
 *
 * The registry does not send WebSocket commands or acquire connections.
 * Those responsibilities remain in StreamingSubscriptionManager.
 */

import {
  StreamingChannel,
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSubscriptionId,
  StreamingSymbol,
  UnifiedStreamingSubscription,
  UnifiedStreamingSubscriptionSnapshot,
  UnifiedSubscriptionState,
  UnifiedStreamScope,
  createStreamingSubscriptionKey,
  freezeUnifiedStreamingSubscription,
  normalizeStreamingSymbol,
  validateStreamingChannel,
  validateStreamingConnectionId,
  validateStreamingExchangeId,
  validateStreamingScope,
  validateStreamingSubscriptionId,
  validateUnifiedStreamingSubscription,
  validateUnifiedSubscriptionState,
} from "./unified-streaming-interface";

export interface StreamingSubscriptionRegistryClock {
  now(): number;
}

export interface StreamingSubscriptionRegistration {
  readonly subscription: UnifiedStreamingSubscription;
  readonly connectionId?: StreamingConnectionId;
  readonly state?: UnifiedSubscriptionState;
  readonly failureReason?: string;
}

export interface StreamingSubscriptionStateUpdate {
  readonly state: UnifiedSubscriptionState;
  readonly connectionId?: StreamingConnectionId;
  readonly failureReason?: string;
  readonly occurredAt?: number;
}

export interface StreamingSubscriptionRegistryQuery {
  readonly subscriptionIds?: readonly StreamingSubscriptionId[];
  readonly exchangeIds?: readonly StreamingExchangeId[];
  readonly connectionIds?: readonly StreamingConnectionId[];
  readonly channels?: readonly StreamingChannel[];
  readonly symbols?: readonly StreamingSymbol[];
  readonly scopes?: readonly UnifiedStreamScope[];
  readonly states?: readonly UnifiedSubscriptionState[];

  /**
   * When true, subscriptions without an assigned connection are included when
   * connectionIds is supplied.
   */
  readonly includeUnassignedConnections?: boolean;
}

export interface StreamingSubscriptionRegistrySnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalSubscriptions: number;
  readonly pendingSubscriptions: number;
  readonly subscribingSubscriptions: number;
  readonly activeSubscriptions: number;
  readonly unsubscribingSubscriptions: number;
  readonly inactiveSubscriptions: number;
  readonly failedSubscriptions: number;
  readonly exchangeCount: number;
  readonly connectionCount: number;
  readonly channelCount: number;
  readonly symbolCount: number;
  readonly subscriptions:
    readonly UnifiedStreamingSubscriptionSnapshot[];
}

export interface StreamingSubscriptionRegistryRemovalResult {
  readonly subscriptionId: StreamingSubscriptionId;
  readonly exchangeId: StreamingExchangeId;
  readonly removedAt: number;
  readonly previousState: UnifiedSubscriptionState;
}

export interface StreamingSubscriptionRegistryBulkFailure {
  readonly subscriptionId: StreamingSubscriptionId;
  readonly error: Error;
}

export interface StreamingSubscriptionRegistryBulkResult {
  readonly successfulSubscriptionIds:
    readonly StreamingSubscriptionId[];
  readonly failures:
    readonly StreamingSubscriptionRegistryBulkFailure[];
}

interface MutableRegistryRecord {
  readonly subscription: UnifiedStreamingSubscription;
  readonly subscriptionKey: string;
  readonly createdAt: number;

  connectionId?: StreamingConnectionId;
  state: UnifiedSubscriptionState;
  lastChangedAt: number;
  activatedAt?: number;
  deactivatedAt?: number;
  failureReason?: string;
}

const SYSTEM_CLOCK: StreamingSubscriptionRegistryClock =
  Object.freeze({
    now: (): number => Date.now(),
  });

const EMPTY_RECORD: Readonly<Record<string, unknown>> =
  Object.freeze({});

const ALLOWED_STATE_TRANSITIONS: Readonly<
  Record<
    UnifiedSubscriptionState,
    readonly UnifiedSubscriptionState[]
  >
> = Object.freeze({
  PENDING: Object.freeze<UnifiedSubscriptionState[]>([
    "SUBSCRIBING",
    "INACTIVE",
    "FAILED",
  ]),

  SUBSCRIBING: Object.freeze<UnifiedSubscriptionState[]>([
    "ACTIVE",
    "INACTIVE",
    "FAILED",
  ]),

  ACTIVE: Object.freeze<UnifiedSubscriptionState[]>([
    "UNSUBSCRIBING",
    "INACTIVE",
    "FAILED",
  ]),

  UNSUBSCRIBING:
    Object.freeze<UnifiedSubscriptionState[]>([
      "ACTIVE",
      "INACTIVE",
      "FAILED",
    ]),

  INACTIVE: Object.freeze<UnifiedSubscriptionState[]>([
    "SUBSCRIBING",
    "FAILED",
  ]),

  FAILED: Object.freeze<UnifiedSubscriptionState[]>([
    "SUBSCRIBING",
    "UNSUBSCRIBING",
    "INACTIVE",
  ]),
});

export class StreamingSubscriptionRegistryError extends Error {
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

    this.name = "StreamingSubscriptionRegistryError";
    this.code = code;
    this.subscriptionId = context?.subscriptionId;
    this.exchangeId = context?.exchangeId;
    this.connectionId = context?.connectionId;
  }
}

/**
 * Deterministic indexed registry for unified streaming subscriptions.
 */
export class StreamingSubscriptionRegistry {
  private readonly records =
    new Map<StreamingSubscriptionId, MutableRegistryRecord>();

  private readonly subscriptionIdByKey =
    new Map<string, StreamingSubscriptionId>();

  private readonly idsByExchange =
    new Map<StreamingExchangeId, Set<StreamingSubscriptionId>>();

  private readonly idsByConnection =
    new Map<StreamingConnectionId, Set<StreamingSubscriptionId>>();

  private readonly idsByChannel =
    new Map<StreamingChannel, Set<StreamingSubscriptionId>>();

  private readonly idsBySymbol =
    new Map<StreamingSymbol, Set<StreamingSubscriptionId>>();

  private readonly idsByScope =
    new Map<UnifiedStreamScope, Set<StreamingSubscriptionId>>();

  private readonly idsByState =
    new Map<UnifiedSubscriptionState, Set<StreamingSubscriptionId>>();

  private readonly clock: StreamingSubscriptionRegistryClock;

  private disposed = false;

  public constructor(
    clock: StreamingSubscriptionRegistryClock = SYSTEM_CLOCK,
  ) {
    this.clock = validateClock(clock);

    for (const state of getSubscriptionStates()) {
      this.idsByState.set(
        state,
        new Set<StreamingSubscriptionId>(),
      );
    }

    this.idsByScope.set(
      "PUBLIC",
      new Set<StreamingSubscriptionId>(),
    );

    this.idsByScope.set(
      "PRIVATE",
      new Set<StreamingSubscriptionId>(),
    );
  }

  /**
   * Registers a subscription and returns its immutable snapshot.
   */
  public register(
    registration: StreamingSubscriptionRegistration,
  ): UnifiedStreamingSubscriptionSnapshot {
    this.assertActive();

    validateRegistration(registration);

    const subscription =
      freezeUnifiedStreamingSubscription(
        registration.subscription,
      );

    const subscriptionId = subscription.subscriptionId;
    const subscriptionKey =
      createStreamingSubscriptionKey(subscription);

    if (this.records.has(subscriptionId)) {
      throw new StreamingSubscriptionRegistryError(
        "DUPLICATE_SUBSCRIPTION_ID",
        `Subscription "${subscriptionId}" is already registered.`,
        {
          subscriptionId,
          exchangeId: subscription.exchangeId,
          connectionId: registration.connectionId,
        },
      );
    }

    const existingSubscriptionId =
      this.subscriptionIdByKey.get(subscriptionKey);

    if (existingSubscriptionId !== undefined) {
      throw new StreamingSubscriptionRegistryError(
        "DUPLICATE_SUBSCRIPTION_KEY",
        `Equivalent subscription "${existingSubscriptionId}" is already registered.`,
        {
          subscriptionId,
          exchangeId: subscription.exchangeId,
          connectionId: registration.connectionId,
        },
      );
    }

    const state = registration.state ?? "PENDING";
    const timestamp = this.now();

    const record: MutableRegistryRecord = {
      subscription,
      subscriptionKey,
      createdAt: timestamp,
      connectionId:
        registration.connectionId === undefined
          ? undefined
          : normalizeConnectionId(
              registration.connectionId,
            ),
      state,
      lastChangedAt: timestamp,
      activatedAt:
        state === "ACTIVE" ? timestamp : undefined,
      deactivatedAt:
        state === "INACTIVE" ? timestamp : undefined,
      failureReason: normalizeFailureReason(
        registration.failureReason,
        state,
      ),
    };

    this.records.set(subscriptionId, record);
    this.subscriptionIdByKey.set(
      subscriptionKey,
      subscriptionId,
    );

    this.addRecordToIndexes(record);

    return createSnapshot(record);
  }

  /**
   * Registers several subscriptions sequentially in deterministic order.
   */
  public registerAll(
    registrations:
      readonly StreamingSubscriptionRegistration[],
  ): StreamingSubscriptionRegistryBulkResult {
    this.assertActive();

    if (!Array.isArray(registrations)) {
      throw new StreamingSubscriptionRegistryError(
        "INVALID_REGISTRATION_COLLECTION",
        "registrations must be an array.",
      );
    }

    const orderedRegistrations = [...registrations].sort(
      (left, right) =>
        left.subscription.subscriptionId.localeCompare(
          right.subscription.subscriptionId,
        ),
    );

    const successfulSubscriptionIds:
      StreamingSubscriptionId[] = [];

    const failures:
      StreamingSubscriptionRegistryBulkFailure[] = [];

    for (const registration of orderedRegistrations) {
      try {
        const snapshot = this.register(registration);

        successfulSubscriptionIds.push(
          snapshot.subscriptionId,
        );
      } catch (error: unknown) {
        failures.push({
          subscriptionId:
            registration.subscription.subscriptionId,
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
   * Updates the lifecycle state and optional connection assignment.
   */
  public updateState(
    subscriptionId: StreamingSubscriptionId,
    update: StreamingSubscriptionStateUpdate,
  ): UnifiedStreamingSubscriptionSnapshot {
    this.assertActive();

    const normalizedSubscriptionId =
      normalizeSubscriptionId(subscriptionId);

    validateStateUpdate(update);

    const record = this.getRequiredRecord(
      normalizedSubscriptionId,
    );

    assertValidTransition(record.state, update.state);

    const occurredAt =
      update.occurredAt ?? this.now();

    validateTimestamp(
      occurredAt,
      "update.occurredAt",
    );

    if (occurredAt < record.lastChangedAt) {
      throw new StreamingSubscriptionRegistryError(
        "NON_MONOTONIC_STATE_TIMESTAMP",
        `State update timestamp ${occurredAt} is earlier than the previous state timestamp ${record.lastChangedAt}.`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
          connectionId: record.connectionId,
        },
      );
    }

    const previousState = record.state;
    const previousConnectionId = record.connectionId;

    const nextConnectionId =
      update.connectionId === undefined
        ? record.connectionId
        : normalizeConnectionId(update.connectionId);

    if (
      update.state === "ACTIVE" &&
      nextConnectionId === undefined
    ) {
      throw new StreamingSubscriptionRegistryError(
        "ACTIVE_SUBSCRIPTION_REQUIRES_CONNECTION",
        `Subscription "${normalizedSubscriptionId}" cannot become active without a connection assignment.`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
        },
      );
    }

    if (previousState !== update.state) {
      this.idsByState
        .get(previousState)
        ?.delete(normalizedSubscriptionId);

      this.idsByState
        .get(update.state)
        ?.add(normalizedSubscriptionId);
    }

    if (previousConnectionId !== nextConnectionId) {
      if (previousConnectionId !== undefined) {
        removeFromIndex(
          this.idsByConnection,
          previousConnectionId,
          normalizedSubscriptionId,
        );
      }

      if (nextConnectionId !== undefined) {
        addToIndex(
          this.idsByConnection,
          nextConnectionId,
          normalizedSubscriptionId,
        );
      }
    }

    record.state = update.state;
    record.connectionId = nextConnectionId;
    record.lastChangedAt = occurredAt;

    if (update.state === "ACTIVE") {
      record.activatedAt = occurredAt;
      record.deactivatedAt = undefined;
      record.failureReason = undefined;
    } else if (update.state === "INACTIVE") {
      record.deactivatedAt = occurredAt;
      record.failureReason = undefined;
    } else if (update.state === "FAILED") {
      record.failureReason = normalizeFailureReason(
        update.failureReason,
        update.state,
      );
    } else {
      record.failureReason = undefined;
    }

    return createSnapshot(record);
  }

  /**
   * Assigns or clears the connection associated with a subscription.
   */
  public assignConnection(
    subscriptionId: StreamingSubscriptionId,
    connectionId: StreamingConnectionId | undefined,
  ): UnifiedStreamingSubscriptionSnapshot {
    this.assertActive();

    const normalizedSubscriptionId =
      normalizeSubscriptionId(subscriptionId);

    const record = this.getRequiredRecord(
      normalizedSubscriptionId,
    );

    const previousConnectionId = record.connectionId;

    const normalizedConnectionId =
      connectionId === undefined
        ? undefined
        : normalizeConnectionId(connectionId);

    if (
      record.state === "ACTIVE" &&
      normalizedConnectionId === undefined
    ) {
      throw new StreamingSubscriptionRegistryError(
        "ACTIVE_SUBSCRIPTION_CONNECTION_REQUIRED",
        `Cannot clear the connection from active subscription "${normalizedSubscriptionId}".`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
          connectionId: previousConnectionId,
        },
      );
    }

    if (previousConnectionId === normalizedConnectionId) {
      return createSnapshot(record);
    }

    if (previousConnectionId !== undefined) {
      removeFromIndex(
        this.idsByConnection,
        previousConnectionId,
        normalizedSubscriptionId,
      );
    }

    if (normalizedConnectionId !== undefined) {
      addToIndex(
        this.idsByConnection,
        normalizedConnectionId,
        normalizedSubscriptionId,
      );
    }

    record.connectionId = normalizedConnectionId;
    record.lastChangedAt = this.now();

    return createSnapshot(record);
  }

  /**
   * Removes a subscription from all indexes.
   */
  public remove(
    subscriptionId: StreamingSubscriptionId,
  ): StreamingSubscriptionRegistryRemovalResult {
    this.assertActive();

    const normalizedSubscriptionId =
      normalizeSubscriptionId(subscriptionId);

    const record = this.getRequiredRecord(
      normalizedSubscriptionId,
    );

    if (
      record.state === "ACTIVE" ||
      record.state === "SUBSCRIBING" ||
      record.state === "UNSUBSCRIBING"
    ) {
      throw new StreamingSubscriptionRegistryError(
        "SUBSCRIPTION_STILL_ACTIVE",
        `Subscription "${normalizedSubscriptionId}" must be inactive or failed before removal.`,
        {
          subscriptionId: normalizedSubscriptionId,
          exchangeId: record.subscription.exchangeId,
          connectionId: record.connectionId,
        },
      );
    }

    this.removeRecordFromIndexes(record);

    this.records.delete(normalizedSubscriptionId);

    this.subscriptionIdByKey.delete(
      record.subscriptionKey,
    );

    return Object.freeze({
      subscriptionId: normalizedSubscriptionId,
      exchangeId: record.subscription.exchangeId,
      removedAt: this.now(),
      previousState: record.state,
    });
  }

  /**
   * Removes every inactive subscription.
   */
  public removeInactive():
    StreamingSubscriptionRegistryBulkResult {
    this.assertActive();

    const subscriptionIds = this.getIdsForState(
      "INACTIVE",
    );

    const successfulSubscriptionIds:
      StreamingSubscriptionId[] = [];

    const failures:
      StreamingSubscriptionRegistryBulkFailure[] = [];

    for (const subscriptionId of subscriptionIds) {
      try {
        this.remove(subscriptionId);
        successfulSubscriptionIds.push(subscriptionId);
      } catch (error: unknown) {
        failures.push({
          subscriptionId,
          error: normalizeError(error),
        });
      }
    }

    return freezeBulkResult(
      successfulSubscriptionIds,
      failures,
    );
  }

  public has(
    subscriptionId: StreamingSubscriptionId,
  ): boolean {
    const normalizedSubscriptionId =
      normalizeSubscriptionId(subscriptionId);

    return this.records.has(normalizedSubscriptionId);
  }

  public hasEquivalent(
    subscription: UnifiedStreamingSubscription,
  ): boolean {
    validateUnifiedStreamingSubscription(subscription);

    const normalizedSubscription =
      freezeUnifiedStreamingSubscription(subscription);

    const key =
      createStreamingSubscriptionKey(
        normalizedSubscription,
      );

    return this.subscriptionIdByKey.has(key);
  }

  public get(
    subscriptionId: StreamingSubscriptionId,
  ): UnifiedStreamingSubscriptionSnapshot | undefined {
    const normalizedSubscriptionId =
      normalizeSubscriptionId(subscriptionId);

    const record = this.records.get(
      normalizedSubscriptionId,
    );

    return record === undefined
      ? undefined
      : createSnapshot(record);
  }

  public getByKey(
    subscription: Pick<
      UnifiedStreamingSubscription,
      "exchangeId" | "scope" | "channel" | "symbol"
    >,
  ): UnifiedStreamingSubscriptionSnapshot | undefined {
    const key = createStreamingSubscriptionKey(
      subscription,
    );

    const subscriptionId =
      this.subscriptionIdByKey.get(key);

    if (subscriptionId === undefined) {
      return undefined;
    }

    const record = this.records.get(subscriptionId);

    return record === undefined
      ? undefined
      : createSnapshot(record);
  }

  public getAll():
    readonly UnifiedStreamingSubscriptionSnapshot[] {
    return Object.freeze(
      this.getOrderedRecords().map((record) =>
        createSnapshot(record),
      ),
    );
  }

  public query(
    query: StreamingSubscriptionRegistryQuery = {},
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    validateQuery(query);

    const normalizedQuery = normalizeQuery(query);

    const matchingRecords = this.getOrderedRecords().filter(
      (record) => recordMatchesQuery(record, normalizedQuery),
    );

    return Object.freeze(
      matchingRecords.map((record) =>
        createSnapshot(record),
      ),
    );
  }

  public getForExchange(
    exchangeId: StreamingExchangeId,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedExchangeId =
      normalizeExchangeId(exchangeId);

    return this.getSnapshotsByIds(
      this.idsByExchange.get(normalizedExchangeId),
    );
  }

  public getForConnection(
    connectionId: StreamingConnectionId,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedConnectionId =
      normalizeConnectionId(connectionId);

    return this.getSnapshotsByIds(
      this.idsByConnection.get(normalizedConnectionId),
    );
  }

  public getForChannel(
    channel: StreamingChannel,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedChannel =
      normalizeChannel(channel);

    return this.getSnapshotsByIds(
      this.idsByChannel.get(normalizedChannel),
    );
  }

  public getForSymbol(
    symbol: StreamingSymbol,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    const normalizedSymbol =
      normalizeStreamingSymbol(symbol);

    return this.getSnapshotsByIds(
      this.idsBySymbol.get(normalizedSymbol),
    );
  }

  public getForScope(
    scope: UnifiedStreamScope,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    validateStreamingScope(scope);

    return this.getSnapshotsByIds(
      this.idsByScope.get(scope),
    );
  }

  public getForState(
    state: UnifiedSubscriptionState,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    validateUnifiedSubscriptionState(state);

    return this.getSnapshotsByIds(
      this.idsByState.get(state),
    );
  }

  public getSnapshot():
    StreamingSubscriptionRegistrySnapshot {
    const subscriptions = this.getAll();

    let pendingSubscriptions = 0;
    let subscribingSubscriptions = 0;
    let activeSubscriptions = 0;
    let unsubscribingSubscriptions = 0;
    let inactiveSubscriptions = 0;
    let failedSubscriptions = 0;

    for (const subscription of subscriptions) {
      switch (subscription.state) {
        case "PENDING":
          pendingSubscriptions += 1;
          break;

        case "SUBSCRIBING":
          subscribingSubscriptions += 1;
          break;

        case "ACTIVE":
          activeSubscriptions += 1;
          break;

        case "UNSUBSCRIBING":
          unsubscribingSubscriptions += 1;
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
      subscribingSubscriptions,
      activeSubscriptions,
      unsubscribingSubscriptions,
      inactiveSubscriptions,
      failedSubscriptions,
      exchangeCount: countPopulatedIndexes(
        this.idsByExchange,
      ),
      connectionCount: countPopulatedIndexes(
        this.idsByConnection,
      ),
      channelCount: countPopulatedIndexes(
        this.idsByChannel,
      ),
      symbolCount: countPopulatedIndexes(
        this.idsBySymbol,
      ),
      subscriptions,
    });
  }

  public get size(): number {
    return this.records.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Clears all registry state and permanently disposes the registry.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.records.clear();
    this.subscriptionIdByKey.clear();
    this.idsByExchange.clear();
    this.idsByConnection.clear();
    this.idsByChannel.clear();
    this.idsBySymbol.clear();
    this.idsByScope.clear();
    this.idsByState.clear();

    this.disposed = true;
  }

  private addRecordToIndexes(
    record: MutableRegistryRecord,
  ): void {
    const subscriptionId =
      record.subscription.subscriptionId;

    addToIndex(
      this.idsByExchange,
      record.subscription.exchangeId,
      subscriptionId,
    );

    addToIndex(
      this.idsByChannel,
      record.subscription.channel,
      subscriptionId,
    );

    addToIndex(
      this.idsByScope,
      record.subscription.scope,
      subscriptionId,
    );

    addToIndex(
      this.idsByState,
      record.state,
      subscriptionId,
    );

    if (record.connectionId !== undefined) {
      addToIndex(
        this.idsByConnection,
        record.connectionId,
        subscriptionId,
      );
    }

    if (record.subscription.symbol !== undefined) {
      addToIndex(
        this.idsBySymbol,
        record.subscription.symbol,
        subscriptionId,
      );
    }
  }

  private removeRecordFromIndexes(
    record: MutableRegistryRecord,
  ): void {
    const subscriptionId =
      record.subscription.subscriptionId;

    removeFromIndex(
      this.idsByExchange,
      record.subscription.exchangeId,
      subscriptionId,
    );

    removeFromIndex(
      this.idsByChannel,
      record.subscription.channel,
      subscriptionId,
    );

    removeFromIndex(
      this.idsByScope,
      record.subscription.scope,
      subscriptionId,
    );

    removeFromIndex(
      this.idsByState,
      record.state,
      subscriptionId,
    );

    if (record.connectionId !== undefined) {
      removeFromIndex(
        this.idsByConnection,
        record.connectionId,
        subscriptionId,
      );
    }

    if (record.subscription.symbol !== undefined) {
      removeFromIndex(
        this.idsBySymbol,
        record.subscription.symbol,
        subscriptionId,
      );
    }
  }

  private getRequiredRecord(
    subscriptionId: StreamingSubscriptionId,
  ): MutableRegistryRecord {
    const record = this.records.get(subscriptionId);

    if (record === undefined) {
      throw new StreamingSubscriptionRegistryError(
        "SUBSCRIPTION_NOT_FOUND",
        `Subscription "${subscriptionId}" was not found.`,
        {
          subscriptionId,
        },
      );
    }

    return record;
  }

  private getOrderedRecords():
    MutableRegistryRecord[] {
    return [...this.records.values()].sort(
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

  private getSnapshotsByIds(
    subscriptionIds:
      | ReadonlySet<StreamingSubscriptionId>
      | undefined,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    if (
      subscriptionIds === undefined ||
      subscriptionIds.size === 0
    ) {
      return Object.freeze([]);
    }

    const records = [...subscriptionIds]
      .map((subscriptionId) =>
        this.records.get(subscriptionId),
      )
      .filter(
        (
          record,
        ): record is MutableRegistryRecord =>
          record !== undefined,
      )
      .sort(compareRecords);

    return Object.freeze(
      records.map((record) =>
        createSnapshot(record),
      ),
    );
  }

  private getIdsForState(
    state: UnifiedSubscriptionState,
  ): StreamingSubscriptionId[] {
    return [
      ...(this.idsByState.get(state) ?? []),
    ].sort();
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new StreamingSubscriptionRegistryError(
        "REGISTRY_DISPOSED",
        "The streaming subscription registry has been disposed.",
      );
    }
  }
}

interface NormalizedRegistryQuery {
  readonly subscriptionIds?:
    ReadonlySet<StreamingSubscriptionId>;
  readonly exchangeIds?:
    ReadonlySet<StreamingExchangeId>;
  readonly connectionIds?:
    ReadonlySet<StreamingConnectionId>;
  readonly channels?: ReadonlySet<StreamingChannel>;
  readonly symbols?: ReadonlySet<StreamingSymbol>;
  readonly scopes?: ReadonlySet<UnifiedStreamScope>;
  readonly states?:
    ReadonlySet<UnifiedSubscriptionState>;
  readonly includeUnassignedConnections: boolean;
}

function validateRegistration(
  registration: StreamingSubscriptionRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_REGISTRATION",
      "Subscription registration must be an object.",
    );
  }

  validateUnifiedStreamingSubscription(
    registration.subscription,
  );

  if (registration.connectionId !== undefined) {
    validateStreamingConnectionId(
      registration.connectionId,
    );
  }

  if (registration.state !== undefined) {
    validateUnifiedSubscriptionState(
      registration.state,
    );
  }

  const state = registration.state ?? "PENDING";

  if (
    state === "ACTIVE" &&
    registration.connectionId === undefined
  ) {
    throw new StreamingSubscriptionRegistryError(
      "ACTIVE_SUBSCRIPTION_REQUIRES_CONNECTION",
      "An active subscription registration requires a connectionId.",
      {
        subscriptionId:
          registration.subscription.subscriptionId,
        exchangeId:
          registration.subscription.exchangeId,
      },
    );
  }

  normalizeFailureReason(
    registration.failureReason,
    state,
  );
}

function validateStateUpdate(
  update: StreamingSubscriptionStateUpdate,
): void {
  if (update === null || typeof update !== "object") {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_STATE_UPDATE",
      "Subscription state update must be an object.",
    );
  }

  validateUnifiedSubscriptionState(update.state);

  if (update.connectionId !== undefined) {
    validateStreamingConnectionId(
      update.connectionId,
    );
  }

  if (update.occurredAt !== undefined) {
    validateTimestamp(
      update.occurredAt,
      "update.occurredAt",
    );
  }

  normalizeFailureReason(
    update.failureReason,
    update.state,
  );
}

function validateQuery(
  query: StreamingSubscriptionRegistryQuery,
): void {
  if (query === null || typeof query !== "object") {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_REGISTRY_QUERY",
      "Subscription registry query must be an object.",
    );
  }

  validateOptionalArray(
    query.subscriptionIds,
    "query.subscriptionIds",
  );

  validateOptionalArray(
    query.exchangeIds,
    "query.exchangeIds",
  );

  validateOptionalArray(
    query.connectionIds,
    "query.connectionIds",
  );

  validateOptionalArray(
    query.channels,
    "query.channels",
  );

  validateOptionalArray(
    query.symbols,
    "query.symbols",
  );

  validateOptionalArray(
    query.scopes,
    "query.scopes",
  );

  validateOptionalArray(
    query.states,
    "query.states",
  );

  if (
    query.includeUnassignedConnections !== undefined &&
    typeof query.includeUnassignedConnections !== "boolean"
  ) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_INCLUDE_UNASSIGNED",
      "includeUnassignedConnections must be boolean when provided.",
    );
  }
}

function normalizeQuery(
  query: StreamingSubscriptionRegistryQuery,
): NormalizedRegistryQuery {
  const subscriptionIds = normalizeSet(
    query.subscriptionIds,
    normalizeSubscriptionId,
  );

  const exchangeIds = normalizeSet(
    query.exchangeIds,
    normalizeExchangeId,
  );

  const connectionIds = normalizeSet(
    query.connectionIds,
    normalizeConnectionId,
  );

  const channels = normalizeSet(
    query.channels,
    normalizeChannel,
  );

  const symbols = normalizeSet(
    query.symbols,
    normalizeStreamingSymbol,
  );

  const scopes =
    query.scopes === undefined
      ? undefined
      : new Set(
          query.scopes.map((scope) => {
            validateStreamingScope(scope);
            return scope;
          }),
        );

  const states =
    query.states === undefined
      ? undefined
      : new Set(
          query.states.map((state) => {
            validateUnifiedSubscriptionState(state);
            return state;
          }),
        );

  return Object.freeze({
    subscriptionIds,
    exchangeIds,
    connectionIds,
    channels,
    symbols,
    scopes,
    states,
    includeUnassignedConnections:
      query.includeUnassignedConnections ?? false,
  });
}

function recordMatchesQuery(
  record: MutableRegistryRecord,
  query: NormalizedRegistryQuery,
): boolean {
  if (
    query.subscriptionIds !== undefined &&
    !query.subscriptionIds.has(
      record.subscription.subscriptionId,
    )
  ) {
    return false;
  }

  if (
    query.exchangeIds !== undefined &&
    !query.exchangeIds.has(
      record.subscription.exchangeId,
    )
  ) {
    return false;
  }

  if (query.connectionIds !== undefined) {
    if (record.connectionId === undefined) {
      if (!query.includeUnassignedConnections) {
        return false;
      }
    } else if (
      !query.connectionIds.has(record.connectionId)
    ) {
      return false;
    }
  }

  if (
    query.channels !== undefined &&
    !query.channels.has(record.subscription.channel)
  ) {
    return false;
  }

  if (query.symbols !== undefined) {
    if (
      record.subscription.symbol === undefined ||
      !query.symbols.has(record.subscription.symbol)
    ) {
      return false;
    }
  }

  if (
    query.scopes !== undefined &&
    !query.scopes.has(record.subscription.scope)
  ) {
    return false;
  }

  if (
    query.states !== undefined &&
    !query.states.has(record.state)
  ) {
    return false;
  }

  return true;
}

function createSnapshot(
  record: MutableRegistryRecord,
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

function assertValidTransition(
  currentState: UnifiedSubscriptionState,
  nextState: UnifiedSubscriptionState,
): void {
  if (currentState === nextState) {
    return;
  }

  const allowedStates =
    ALLOWED_STATE_TRANSITIONS[currentState];

  if (!allowedStates.includes(nextState)) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_STATE_TRANSITION",
      `Invalid subscription state transition from "${currentState}" to "${nextState}".`,
    );
  }
}

function addToIndex<TKey>(
  index: Map<TKey, Set<StreamingSubscriptionId>>,
  key: TKey,
  subscriptionId: StreamingSubscriptionId,
): void {
  let subscriptionIds = index.get(key);

  if (subscriptionIds === undefined) {
    subscriptionIds =
      new Set<StreamingSubscriptionId>();

    index.set(key, subscriptionIds);
  }

  subscriptionIds.add(subscriptionId);
}

function removeFromIndex<TKey>(
  index: Map<TKey, Set<StreamingSubscriptionId>>,
  key: TKey,
  subscriptionId: StreamingSubscriptionId,
): void {
  const subscriptionIds = index.get(key);

  if (subscriptionIds === undefined) {
    return;
  }

  subscriptionIds.delete(subscriptionId);

  if (subscriptionIds.size === 0) {
    index.delete(key);
  }
}

function normalizeFailureReason(
  failureReason: string | undefined,
  state: UnifiedSubscriptionState,
): string | undefined {
  if (state === "FAILED") {
    if (
      typeof failureReason !== "string" ||
      failureReason.trim().length === 0
    ) {
      throw new StreamingSubscriptionRegistryError(
        "FAILED_STATE_REQUIRES_REASON",
        "A failed subscription requires a non-empty failure reason.",
      );
    }

    return failureReason.trim();
  }

  if (failureReason !== undefined) {
    if (
      typeof failureReason !== "string" ||
      failureReason.trim().length === 0
    ) {
      throw new StreamingSubscriptionRegistryError(
        "INVALID_FAILURE_REASON",
        "failureReason must be a non-empty string when provided.",
      );
    }

    throw new StreamingSubscriptionRegistryError(
      "UNEXPECTED_FAILURE_REASON",
      `failureReason cannot be supplied for state "${state}".`,
    );
  }

  return undefined;
}

function normalizeSubscriptionId(
  subscriptionId: StreamingSubscriptionId,
): StreamingSubscriptionId {
  validateStreamingSubscriptionId(subscriptionId);

  return subscriptionId.trim();
}

function normalizeExchangeId(
  exchangeId: StreamingExchangeId,
): StreamingExchangeId {
  validateStreamingExchangeId(exchangeId);

  return exchangeId.trim().toUpperCase();
}

function normalizeConnectionId(
  connectionId: StreamingConnectionId,
): StreamingConnectionId {
  validateStreamingConnectionId(connectionId);

  return connectionId.trim();
}

function normalizeChannel(
  channel: StreamingChannel,
): StreamingChannel {
  validateStreamingChannel(channel);

  return channel.trim().toUpperCase();
}

function normalizeSet<TInput, TOutput>(
  values: readonly TInput[] | undefined,
  normalizer: (value: TInput) => TOutput,
): ReadonlySet<TOutput> | undefined {
  if (values === undefined) {
    return undefined;
  }

  return new Set(values.map(normalizer));
}

function validateOptionalArray(
  value: readonly unknown[] | undefined,
  field: string,
): void {
  if (value !== undefined && !Array.isArray(value)) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_QUERY_ARRAY",
      `${field} must be an array when provided.`,
    );
  }
}

function validateClock(
  clock: StreamingSubscriptionRegistryClock,
): StreamingSubscriptionRegistryClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_CLOCK",
      "Streaming subscription registry clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new StreamingSubscriptionRegistryError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function compareRecords(
  left: MutableRegistryRecord,
  right: MutableRegistryRecord,
): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.subscription.subscriptionId.localeCompare(
    right.subscription.subscriptionId,
  );
}

function countPopulatedIndexes<TKey>(
  index: ReadonlyMap<
    TKey,
    ReadonlySet<StreamingSubscriptionId>
  >,
): number {
  let count = 0;

  for (const subscriptionIds of index.values()) {
    if (subscriptionIds.size > 0) {
      count += 1;
    }
  }

  return count;
}

function getSubscriptionStates():
  readonly UnifiedSubscriptionState[] {
  return Object.freeze<UnifiedSubscriptionState[]>([
    "PENDING",
    "SUBSCRIBING",
    "ACTIVE",
    "UNSUBSCRIBING",
    "INACTIVE",
    "FAILED",
  ]);
}

function freezeBulkResult(
  successfulSubscriptionIds:
    StreamingSubscriptionId[],
  failures:
    StreamingSubscriptionRegistryBulkFailure[],
): StreamingSubscriptionRegistryBulkResult {
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
      "Unknown streaming subscription registry error.",
    );
  }
}

function assertNever(value: never): never {
  throw new StreamingSubscriptionRegistryError(
    "UNSUPPORTED_SUBSCRIPTION_STATE",
    `Unsupported subscription state "${String(value)}".`,
  );
}