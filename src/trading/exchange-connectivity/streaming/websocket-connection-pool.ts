/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 3:
 * WebSocket Connection Pool
 *
 * This module manages reusable WebSocket connections across multiple
 * exchanges.
 *
 * Responsibilities:
 * - Maintain isolated pools for each exchange
 * - Enforce global and per-exchange connection limits
 * - Lease and release connections deterministically
 * - Reuse idle healthy connections
 * - Create connections through an injected factory
 * - Evict idle or failed connections
 * - Coordinate lifecycle operations with WebSocketManager
 * - Produce immutable pool snapshots
 * - Support deterministic testing through injected clocks
 */

import {
  ManagedWebSocketConnection,
  WebSocketConnectionId,
  WebSocketConnectionState,
  WebSocketExchangeId,
  WebSocketManager,
  WebSocketManagerError,
} from "./websocket-manager";

export type WebSocketConnectionLeaseId = string;

export type WebSocketPoolConnectionStatus =
  | "IDLE"
  | "LEASED"
  | "CONNECTING"
  | "EVICTING"
  | "FAILED"
  | "DISPOSED";

export type WebSocketConnectionEvictionReason =
  | "IDLE_TIMEOUT"
  | "POOL_CAPACITY"
  | "CONNECTION_FAILED"
  | "POOL_DISPOSAL"
  | "MANUAL";

export interface WebSocketConnectionPoolClock {
  now(): number;
}

export interface WebSocketConnectionFactoryContext {
  readonly exchangeId: WebSocketExchangeId;
  readonly connectionId: WebSocketConnectionId;
  readonly endpoint?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WebSocketConnectionFactory {
  create(
    context: WebSocketConnectionFactoryContext,
  ): ManagedWebSocketConnection | Promise<ManagedWebSocketConnection>;
}

export interface WebSocketConnectionLeaseRequest {
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;

  /**
   * When true, an existing idle connection must be reused.
   * The pool will not create a new connection.
   */
  readonly reuseOnly?: boolean;

  /**
   * When true, the leased connection must be connected before the lease is
   * returned.
   *
   * Defaults to true.
   */
  readonly connect?: boolean;
}

export interface WebSocketConnectionLease {
  readonly leaseId: WebSocketConnectionLeaseId;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly acquiredAt: number;
  readonly connection: ManagedWebSocketConnection;
}

export interface WebSocketConnectionPoolOptions {
  /**
   * Maximum number of managed connections across all exchanges.
   */
  readonly maxTotalConnections?: number;

  /**
   * Maximum number of managed connections for one exchange.
   */
  readonly maxConnectionsPerExchange?: number;

  /**
   * Maximum time an unleased connection may remain idle before eviction.
   *
   * Set to zero to disable idle-time eviction.
   */
  readonly idleTimeoutMs?: number;

  /**
   * Whether failed connections should be removed automatically when they are
   * released.
   *
   * Defaults to true.
   */
  readonly evictFailedConnections?: boolean;

  /**
   * Whether a connection should be disconnected when its final lease is
   * released.
   *
   * Defaults to false so idle connections remain available for reuse.
   */
  readonly disconnectOnRelease?: boolean;
}

export interface WebSocketPooledConnectionSnapshot {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint: string;
  readonly connectionState: WebSocketConnectionState;
  readonly poolStatus: WebSocketPoolConnectionStatus;
  readonly createdAt: number;
  readonly lastAcquiredAt?: number;
  readonly lastReleasedAt?: number;
  readonly lastUsedAt: number;
  readonly leaseCount: number;
  readonly activeLeaseIds: readonly WebSocketConnectionLeaseId[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WebSocketExchangePoolSnapshot {
  readonly exchangeId: WebSocketExchangeId;
  readonly connectionCount: number;
  readonly leasedConnectionCount: number;
  readonly idleConnectionCount: number;
  readonly failedConnectionCount: number;
  readonly connections: readonly WebSocketPooledConnectionSnapshot[];
}

export interface WebSocketConnectionPoolSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalConnections: number;
  readonly totalLeases: number;
  readonly leasedConnectionCount: number;
  readonly idleConnectionCount: number;
  readonly failedConnectionCount: number;
  readonly maxTotalConnections: number;
  readonly maxConnectionsPerExchange: number;
  readonly exchanges: readonly WebSocketExchangePoolSnapshot[];
}

export interface WebSocketConnectionEvictionResult {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly reason: WebSocketConnectionEvictionReason;
  readonly evictedAt: number;
}

export interface WebSocketPoolCleanupResult {
  readonly generatedAt: number;
  readonly evictions: readonly WebSocketConnectionEvictionResult[];
  readonly failures: readonly WebSocketPoolOperationFailure[];
}

export interface WebSocketPoolOperationFailure {
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly error: Error;
}

interface MutablePooledConnection {
  readonly connection: ManagedWebSocketConnection;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;

  poolStatus: WebSocketPoolConnectionStatus;
  lastAcquiredAt?: number;
  lastReleasedAt?: number;
  lastUsedAt: number;
  leaseCount: number;
  readonly activeLeaseIds: Set<WebSocketConnectionLeaseId>;
}

interface MutableLeaseRecord {
  readonly leaseId: WebSocketConnectionLeaseId;
  readonly connectionId: WebSocketConnectionId;
  readonly exchangeId: WebSocketExchangeId;
  readonly acquiredAt: number;
}

const DEFAULT_MAX_TOTAL_CONNECTIONS = 100;
const DEFAULT_MAX_CONNECTIONS_PER_EXCHANGE = 10;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

const SYSTEM_CLOCK: WebSocketConnectionPoolClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_METADATA: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Domain error thrown by WebSocketConnectionPool.
 */
export class WebSocketConnectionPoolError extends Error {
  public readonly code: string;
  public readonly connectionId?: WebSocketConnectionId;
  public readonly exchangeId?: WebSocketExchangeId;
  public readonly leaseId?: WebSocketConnectionLeaseId;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly connectionId?: WebSocketConnectionId;
      readonly exchangeId?: WebSocketExchangeId;
      readonly leaseId?: WebSocketConnectionLeaseId;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "WebSocketConnectionPoolError";
    this.code = code;
    this.connectionId = context?.connectionId;
    this.exchangeId = context?.exchangeId;
    this.leaseId = context?.leaseId;
  }
}

/**
 * Deterministic reusable connection pool for exchange WebSocket connections.
 */
export class WebSocketConnectionPool {
  private readonly connections =
    new Map<WebSocketConnectionId, MutablePooledConnection>();

  private readonly connectionsByExchange =
    new Map<WebSocketExchangeId, Set<WebSocketConnectionId>>();

  private readonly leases =
    new Map<WebSocketConnectionLeaseId, MutableLeaseRecord>();

  private readonly pendingAcquisitions =
    new Map<WebSocketExchangeId, Promise<WebSocketConnectionLease>>();

  private readonly manager: WebSocketManager;
  private readonly factory: WebSocketConnectionFactory;
  private readonly clock: WebSocketConnectionPoolClock;

  private readonly maxTotalConnections: number;
  private readonly maxConnectionsPerExchange: number;
  private readonly idleTimeoutMs: number;
  private readonly evictFailedConnections: boolean;
  private readonly disconnectOnRelease: boolean;

  private nextConnectionSequence = 1;
  private nextLeaseSequence = 1;
  private disposed = false;

  public constructor(
    manager: WebSocketManager,
    factory: WebSocketConnectionFactory,
    options: WebSocketConnectionPoolOptions = {},
    clock: WebSocketConnectionPoolClock = SYSTEM_CLOCK,
  ) {
    this.manager = validateManager(manager);
    this.factory = validateFactory(factory);
    this.clock = validateClock(clock);

    this.maxTotalConnections = validatePositiveSafeInteger(
      options.maxTotalConnections ??
        DEFAULT_MAX_TOTAL_CONNECTIONS,
      "maxTotalConnections",
    );

    this.maxConnectionsPerExchange = validatePositiveSafeInteger(
      options.maxConnectionsPerExchange ??
        DEFAULT_MAX_CONNECTIONS_PER_EXCHANGE,
      "maxConnectionsPerExchange",
    );

    if (
      this.maxConnectionsPerExchange >
      this.maxTotalConnections
    ) {
      throw new WebSocketConnectionPoolError(
        "INVALID_POOL_CAPACITY",
        "maxConnectionsPerExchange cannot exceed maxTotalConnections.",
      );
    }

    this.idleTimeoutMs = validateNonNegativeFiniteNumber(
      options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      "idleTimeoutMs",
    );

    this.evictFailedConnections =
      options.evictFailedConnections ?? true;

    this.disconnectOnRelease =
      options.disconnectOnRelease ?? false;
  }

  /**
   * Acquires an existing idle connection or creates a new connection when
   * capacity allows.
   */
  public acquire(
    request: WebSocketConnectionLeaseRequest,
  ): Promise<WebSocketConnectionLease> {
    this.assertActive();

    const normalizedRequest = normalizeLeaseRequest(request);

    const pending = this.pendingAcquisitions.get(
      normalizedRequest.exchangeId,
    );

    if (pending !== undefined) {
      return pending.then(() => this.acquire(normalizedRequest));
    }

    const operation = this.performAcquire(normalizedRequest).finally(
      () => {
        this.pendingAcquisitions.delete(
          normalizedRequest.exchangeId,
        );
      },
    );

    this.pendingAcquisitions.set(
      normalizedRequest.exchangeId,
      operation,
    );

    return operation;
  }

  /**
   * Releases an active lease.
   */
  public async release(
    leaseId: WebSocketConnectionLeaseId,
  ): Promise<void> {
    this.assertActive();

    const normalizedLeaseId = validateIdentifier(
      leaseId,
      "leaseId",
    );

    const lease = this.leases.get(normalizedLeaseId);

    if (lease === undefined) {
      throw new WebSocketConnectionPoolError(
        "LEASE_NOT_FOUND",
        `WebSocket connection lease "${normalizedLeaseId}" was not found.`,
        {
          leaseId: normalizedLeaseId,
        },
      );
    }

    const record = this.connections.get(lease.connectionId);

    if (record === undefined) {
      this.leases.delete(normalizedLeaseId);

      throw new WebSocketConnectionPoolError(
        "LEASE_CONNECTION_NOT_FOUND",
        `Connection "${lease.connectionId}" for lease "${normalizedLeaseId}" was not found.`,
        {
          leaseId: normalizedLeaseId,
          connectionId: lease.connectionId,
          exchangeId: lease.exchangeId,
        },
      );
    }

    record.activeLeaseIds.delete(normalizedLeaseId);
    this.leases.delete(normalizedLeaseId);

    const timestamp = this.now();

    record.lastReleasedAt = timestamp;
    record.lastUsedAt = timestamp;

    if (record.activeLeaseIds.size > 0) {
      record.poolStatus = "LEASED";
      return;
    }

    const connectionState = record.connection.getState();

    if (
      this.evictFailedConnections &&
      connectionState === "FAILED"
    ) {
      await this.evictConnection(
        record.connectionId,
        "CONNECTION_FAILED",
      );

      return;
    }

    if (
      this.disconnectOnRelease &&
      requiresDisconnection(connectionState)
    ) {
      await this.manager.disconnect(
        record.connectionId,
        "Connection returned to WebSocket pool.",
      );
    }

    record.poolStatus = "IDLE";
  }

  /**
   * Releases all active leases associated with a connection.
   */
  public async releaseConnection(
    connectionId: WebSocketConnectionId,
  ): Promise<void> {
    this.assertActive();

    const normalizedConnectionId = validateIdentifier(
      connectionId,
      "connectionId",
    );

    const record = this.getRequiredConnection(
      normalizedConnectionId,
    );

    const leaseIds = [...record.activeLeaseIds].sort();

    for (const leaseId of leaseIds) {
      if (this.leases.has(leaseId)) {
        await this.release(leaseId);
      }
    }
  }

  /**
   * Removes one unleased connection from the pool.
   */
  public async evictConnection(
    connectionId: WebSocketConnectionId,
    reason: WebSocketConnectionEvictionReason = "MANUAL",
  ): Promise<WebSocketConnectionEvictionResult> {
    this.assertActive();

    const normalizedConnectionId = validateIdentifier(
      connectionId,
      "connectionId",
    );

    validateEvictionReason(reason);

    const record = this.getRequiredConnection(
      normalizedConnectionId,
    );

    if (record.activeLeaseIds.size > 0) {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_HAS_ACTIVE_LEASES",
        `Connection "${normalizedConnectionId}" cannot be evicted while it has active leases.`,
        {
          connectionId: normalizedConnectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    return this.performEviction(record, reason);
  }

  /**
   * Evicts all idle connections that have exceeded the configured idle
   * timeout.
   */
  public async cleanupIdleConnections(): Promise<WebSocketPoolCleanupResult> {
    this.assertActive();

    const generatedAt = this.now();
    const evictions: WebSocketConnectionEvictionResult[] = [];
    const failures: WebSocketPoolOperationFailure[] = [];

    if (this.idleTimeoutMs === 0) {
      return freezeCleanupResult(
        generatedAt,
        evictions,
        failures,
      );
    }

    const candidates = this.getOrderedConnections().filter(
      (record) =>
        record.poolStatus === "IDLE" &&
        record.activeLeaseIds.size === 0 &&
        generatedAt - record.lastUsedAt >= this.idleTimeoutMs,
    );

    for (const candidate of candidates) {
      try {
        const result = await this.performEviction(
          candidate,
          "IDLE_TIMEOUT",
        );

        evictions.push(result);
      } catch (error: unknown) {
        failures.push({
          connectionId: candidate.connectionId,
          exchangeId: candidate.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    return freezeCleanupResult(
      generatedAt,
      evictions,
      failures,
    );
  }

  /**
   * Removes idle connections until the requested free capacity exists.
   */
  public async ensureCapacity(
    requiredSlots = 1,
  ): Promise<WebSocketPoolCleanupResult> {
    this.assertActive();

    const normalizedRequiredSlots = validatePositiveSafeInteger(
      requiredSlots,
      "requiredSlots",
    );

    if (
      normalizedRequiredSlots >
      this.maxTotalConnections
    ) {
      throw new WebSocketConnectionPoolError(
        "CAPACITY_REQUEST_TOO_LARGE",
        `Requested capacity of ${normalizedRequiredSlots} exceeds the pool maximum of ${this.maxTotalConnections}.`,
      );
    }

    const generatedAt = this.now();
    const evictions: WebSocketConnectionEvictionResult[] = [];
    const failures: WebSocketPoolOperationFailure[] = [];

    let availableSlots =
      this.maxTotalConnections - this.connections.size;

    if (availableSlots >= normalizedRequiredSlots) {
      return freezeCleanupResult(
        generatedAt,
        evictions,
        failures,
      );
    }

    const requiredEvictions =
      normalizedRequiredSlots - availableSlots;

    const candidates = this.getIdleEvictionCandidates();

    for (
      let index = 0;
      index < candidates.length &&
      evictions.length < requiredEvictions;
      index += 1
    ) {
      const candidate = candidates[index];

      try {
        const result = await this.performEviction(
          candidate,
          "POOL_CAPACITY",
        );

        evictions.push(result);
      } catch (error: unknown) {
        failures.push({
          connectionId: candidate.connectionId,
          exchangeId: candidate.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    availableSlots =
      this.maxTotalConnections - this.connections.size;

    if (availableSlots < normalizedRequiredSlots) {
      throw new WebSocketConnectionPoolError(
        "POOL_CAPACITY_EXHAUSTED",
        `Unable to free ${normalizedRequiredSlots} connection slot(s).`,
      );
    }

    return freezeCleanupResult(
      generatedAt,
      evictions,
      failures,
    );
  }

  public getLease(
    leaseId: WebSocketConnectionLeaseId,
  ): WebSocketConnectionLease | undefined {
    const normalizedLeaseId = validateIdentifier(
      leaseId,
      "leaseId",
    );

    const lease = this.leases.get(normalizedLeaseId);

    if (lease === undefined) {
      return undefined;
    }

    const record = this.connections.get(lease.connectionId);

    if (record === undefined) {
      return undefined;
    }

    return createLeaseSnapshot(lease, record.connection);
  }

  public getConnection(
    connectionId: WebSocketConnectionId,
  ): ManagedWebSocketConnection | undefined {
    const normalizedConnectionId = validateIdentifier(
      connectionId,
      "connectionId",
    );

    return this.connections.get(
      normalizedConnectionId,
    )?.connection;
  }

  public getConnectionsForExchange(
    exchangeId: WebSocketExchangeId,
  ): readonly ManagedWebSocketConnection[] {
    const normalizedExchangeId = normalizeExchangeId(exchangeId);

    const connectionIds =
      this.connectionsByExchange.get(normalizedExchangeId);

    if (connectionIds === undefined) {
      return Object.freeze([]);
    }

    const connections = [...connectionIds]
      .sort()
      .map((connectionId) =>
        this.connections.get(connectionId),
      )
      .filter(
        (
          record,
        ): record is MutablePooledConnection =>
          record !== undefined,
      )
      .map((record) => record.connection);

    return Object.freeze(connections);
  }

  public getConnectionSnapshot(
    connectionId: WebSocketConnectionId,
  ): WebSocketPooledConnectionSnapshot {
    const normalizedConnectionId = validateIdentifier(
      connectionId,
      "connectionId",
    );

    return createConnectionSnapshot(
      this.getRequiredConnection(normalizedConnectionId),
    );
  }

  public getSnapshot(): WebSocketConnectionPoolSnapshot {
    const records = this.getOrderedConnections();

    const exchangeIds = [
      ...this.connectionsByExchange.keys(),
    ].sort();

    let leasedConnectionCount = 0;
    let idleConnectionCount = 0;
    let failedConnectionCount = 0;

    const exchanges = exchangeIds.map((exchangeId) => {
      const exchangeRecords = records.filter(
        (record) => record.exchangeId === exchangeId,
      );

      let exchangeLeasedCount = 0;
      let exchangeIdleCount = 0;
      let exchangeFailedCount = 0;

      const connections = exchangeRecords.map((record) => {
        if (record.poolStatus === "LEASED") {
          leasedConnectionCount += 1;
          exchangeLeasedCount += 1;
        }

        if (record.poolStatus === "IDLE") {
          idleConnectionCount += 1;
          exchangeIdleCount += 1;
        }

        if (
          record.poolStatus === "FAILED" ||
          record.connection.getState() === "FAILED"
        ) {
          failedConnectionCount += 1;
          exchangeFailedCount += 1;
        }

        return createConnectionSnapshot(record);
      });

      return Object.freeze({
        exchangeId,
        connectionCount: connections.length,
        leasedConnectionCount: exchangeLeasedCount,
        idleConnectionCount: exchangeIdleCount,
        failedConnectionCount: exchangeFailedCount,
        connections: Object.freeze(connections),
      });
    });

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalConnections: records.length,
      totalLeases: this.leases.size,
      leasedConnectionCount,
      idleConnectionCount,
      failedConnectionCount,
      maxTotalConnections: this.maxTotalConnections,
      maxConnectionsPerExchange:
        this.maxConnectionsPerExchange,
      exchanges: Object.freeze(exchanges),
    });
  }

  public get totalConnections(): number {
    return this.connections.size;
  }

  public get totalLeases(): number {
    return this.leases.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Permanently disposes the pool and every managed connection.
   */
  public async dispose(): Promise<WebSocketPoolCleanupResult> {
    if (this.disposed) {
      return freezeCleanupResult(this.now(), [], []);
    }

    const generatedAt = this.now();
    const evictions: WebSocketConnectionEvictionResult[] = [];
    const failures: WebSocketPoolOperationFailure[] = [];

    this.leases.clear();

    const records = this.getOrderedConnections().reverse();

    for (const record of records) {
      record.activeLeaseIds.clear();

      try {
        const result = await this.performEviction(
          record,
          "POOL_DISPOSAL",
        );

        evictions.push(result);
      } catch (error: unknown) {
        failures.push({
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
          error: normalizeError(error),
        });
      }
    }

    this.connections.clear();
    this.connectionsByExchange.clear();
    this.pendingAcquisitions.clear();
    this.disposed = true;

    return freezeCleanupResult(
      generatedAt,
      evictions,
      failures,
    );
  }

  private async performAcquire(
    request: NormalizedLeaseRequest,
  ): Promise<WebSocketConnectionLease> {
    let record = this.selectReusableConnection(request);

    if (record === undefined) {
      if (request.reuseOnly) {
        throw new WebSocketConnectionPoolError(
          "NO_REUSABLE_CONNECTION",
          `No reusable WebSocket connection is available for exchange "${request.exchangeId}".`,
          {
            exchangeId: request.exchangeId,
          },
        );
      }

      await this.ensureCreationCapacity(request.exchangeId);

      record = await this.createConnection(request);
    }

    if (record.poolStatus === "DISPOSED") {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_DISPOSED",
        `Connection "${record.connectionId}" has already been disposed.`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    if (request.connect) {
      const state = record.connection.getState();

      if (state !== "CONNECTED") {
        record.poolStatus = "CONNECTING";

        try {
          await this.manager.connect(record.connectionId);
        } catch (error: unknown) {
          record.poolStatus = "FAILED";

          if (
            this.evictFailedConnections &&
            record.activeLeaseIds.size === 0
          ) {
            try {
              await this.performEviction(
                record,
                "CONNECTION_FAILED",
              );
            } catch {
              // Preserve the original connection failure.
            }
          }

          throw new WebSocketConnectionPoolError(
            "CONNECTION_ACQUIRE_FAILED",
            `Failed to connect pooled WebSocket connection "${record.connectionId}".`,
            {
              connectionId: record.connectionId,
              exchangeId: record.exchangeId,
              cause: error,
            },
          );
        }
      }
    }

    const timestamp = this.now();
    const leaseId = this.createLeaseId(
      request.exchangeId,
    );

    const lease: MutableLeaseRecord = {
      leaseId,
      connectionId: record.connectionId,
      exchangeId: record.exchangeId,
      acquiredAt: timestamp,
    };

    record.activeLeaseIds.add(leaseId);
    record.lastAcquiredAt = timestamp;
    record.lastUsedAt = timestamp;
    record.leaseCount += 1;
    record.poolStatus = "LEASED";

    this.leases.set(leaseId, lease);

    return createLeaseSnapshot(
      lease,
      record.connection,
    );
  }

  private selectReusableConnection(
    request: NormalizedLeaseRequest,
  ): MutablePooledConnection | undefined {
    const connectionIds =
      this.connectionsByExchange.get(request.exchangeId);

    if (connectionIds === undefined) {
      return undefined;
    }

    const candidates = [...connectionIds]
      .map((connectionId) =>
        this.connections.get(connectionId),
      )
      .filter(
        (
          record,
        ): record is MutablePooledConnection =>
          record !== undefined &&
          record.poolStatus === "IDLE" &&
          record.activeLeaseIds.size === 0 &&
          record.connection.getState() !== "DISPOSED" &&
          record.connection.getState() !== "FAILED",
      )
      .filter((record) =>
        request.endpoint === undefined
          ? true
          : record.endpoint === request.endpoint,
      )
      .sort(compareReusableConnections);

    return candidates[0];
  }

  private async ensureCreationCapacity(
    exchangeId: WebSocketExchangeId,
  ): Promise<void> {
    const exchangeConnectionCount =
      this.connectionsByExchange.get(exchangeId)?.size ?? 0;

    if (
      exchangeConnectionCount >=
      this.maxConnectionsPerExchange
    ) {
      const candidate = this.getIdleEvictionCandidates()
        .filter(
          (record) => record.exchangeId === exchangeId,
        )
        .at(0);

      if (candidate === undefined) {
        throw new WebSocketConnectionPoolError(
          "EXCHANGE_POOL_CAPACITY_EXHAUSTED",
          `Exchange "${exchangeId}" has reached its connection limit of ${this.maxConnectionsPerExchange}.`,
          {
            exchangeId,
          },
        );
      }

      await this.performEviction(
        candidate,
        "POOL_CAPACITY",
      );
    }

    if (
      this.connections.size >=
      this.maxTotalConnections
    ) {
      const candidate =
        this.getIdleEvictionCandidates().at(0);

      if (candidate === undefined) {
        throw new WebSocketConnectionPoolError(
          "GLOBAL_POOL_CAPACITY_EXHAUSTED",
          `The WebSocket pool has reached its global connection limit of ${this.maxTotalConnections}.`,
        );
      }

      await this.performEviction(
        candidate,
        "POOL_CAPACITY",
      );
    }
  }

  private async createConnection(
    request: NormalizedLeaseRequest,
  ): Promise<MutablePooledConnection> {
    const connectionId = this.createConnectionId(
      request.exchangeId,
    );

    const context: WebSocketConnectionFactoryContext =
      Object.freeze({
        exchangeId: request.exchangeId,
        connectionId,
        endpoint: request.endpoint,
        metadata: request.metadata,
      });

    let connection: ManagedWebSocketConnection;

    try {
      connection = await this.factory.create(context);
    } catch (error: unknown) {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_FACTORY_FAILED",
        `WebSocket connection factory failed for exchange "${request.exchangeId}".`,
        {
          connectionId,
          exchangeId: request.exchangeId,
          cause: error,
        },
      );
    }

    validateFactoryConnection(connection, context);

    try {
      this.manager.register(connection);
    } catch (error: unknown) {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_REGISTRATION_FAILED",
        `Failed to register pooled WebSocket connection "${connectionId}".`,
        {
          connectionId,
          exchangeId: request.exchangeId,
          cause: error,
        },
      );
    }

    const timestamp = this.now();

    const record: MutablePooledConnection = {
      connection,
      connectionId,
      exchangeId: request.exchangeId,
      endpoint: connection.descriptor.endpoint,
      metadata: Object.freeze({
        ...request.metadata,
        ...(connection.descriptor.metadata ?? {}),
      }),
      createdAt: timestamp,
      poolStatus: "IDLE",
      lastUsedAt: timestamp,
      leaseCount: 0,
      activeLeaseIds:
        new Set<WebSocketConnectionLeaseId>(),
    };

    this.connections.set(connectionId, record);

    let exchangeConnections =
      this.connectionsByExchange.get(request.exchangeId);

    if (exchangeConnections === undefined) {
      exchangeConnections =
        new Set<WebSocketConnectionId>();

      this.connectionsByExchange.set(
        request.exchangeId,
        exchangeConnections,
      );
    }

    exchangeConnections.add(connectionId);

    return record;
  }

  private async performEviction(
    record: MutablePooledConnection,
    reason: WebSocketConnectionEvictionReason,
  ): Promise<WebSocketConnectionEvictionResult> {
    if (record.activeLeaseIds.size > 0) {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_HAS_ACTIVE_LEASES",
        `Connection "${record.connectionId}" cannot be evicted while leased.`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
        },
      );
    }

    record.poolStatus = "EVICTING";

    try {
      const state = record.connection.getState();

      if (requiresDisconnection(state)) {
        await this.manager.disconnect(
          record.connectionId,
          `WebSocket pool eviction: ${reason}.`,
        );
      }

      await this.manager.unregister(record.connectionId, {
        force: true,
        dispose: true,
        reason: `WebSocket pool eviction: ${reason}.`,
      });
    } catch (error: unknown) {
      record.poolStatus = "FAILED";

      throw new WebSocketConnectionPoolError(
        "CONNECTION_EVICTION_FAILED",
        `Failed to evict WebSocket connection "${record.connectionId}".`,
        {
          connectionId: record.connectionId,
          exchangeId: record.exchangeId,
          cause: error,
        },
      );
    }

    record.poolStatus = "DISPOSED";

    this.connections.delete(record.connectionId);

    const exchangeConnections =
      this.connectionsByExchange.get(record.exchangeId);

    exchangeConnections?.delete(record.connectionId);

    if (exchangeConnections?.size === 0) {
      this.connectionsByExchange.delete(record.exchangeId);
    }

    return Object.freeze({
      connectionId: record.connectionId,
      exchangeId: record.exchangeId,
      reason,
      evictedAt: this.now(),
    });
  }

  private getRequiredConnection(
    connectionId: WebSocketConnectionId,
  ): MutablePooledConnection {
    const record = this.connections.get(connectionId);

    if (record === undefined) {
      throw new WebSocketConnectionPoolError(
        "CONNECTION_NOT_FOUND",
        `Pooled WebSocket connection "${connectionId}" was not found.`,
        {
          connectionId,
        },
      );
    }

    return record;
  }

  private getOrderedConnections(): MutablePooledConnection[] {
    return [...this.connections.values()].sort(
      (left, right) => {
        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }

        return left.connectionId.localeCompare(
          right.connectionId,
        );
      },
    );
  }

  private getIdleEvictionCandidates(): MutablePooledConnection[] {
    return this.getOrderedConnections()
      .filter(
        (record) =>
          record.poolStatus === "IDLE" &&
          record.activeLeaseIds.size === 0,
      )
      .sort(compareEvictionCandidates);
  }

  private createConnectionId(
    exchangeId: WebSocketExchangeId,
  ): WebSocketConnectionId {
    const sequence = this.nextConnectionSequence;

    this.nextConnectionSequence += 1;

    return [
      "ws",
      exchangeId.toLowerCase(),
      sequence.toString().padStart(6, "0"),
    ].join("-");
  }

  private createLeaseId(
    exchangeId: WebSocketExchangeId,
  ): WebSocketConnectionLeaseId {
    const sequence = this.nextLeaseSequence;

    this.nextLeaseSequence += 1;

    return [
      "lease",
      exchangeId.toLowerCase(),
      sequence.toString().padStart(8, "0"),
    ].join("-");
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new WebSocketConnectionPoolError(
        "POOL_DISPOSED",
        "The WebSocket connection pool has been disposed.",
      );
    }
  }
}

interface NormalizedLeaseRequest {
  readonly exchangeId: WebSocketExchangeId;
  readonly endpoint?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly reuseOnly: boolean;
  readonly connect: boolean;
}

function normalizeLeaseRequest(
  request: WebSocketConnectionLeaseRequest,
): NormalizedLeaseRequest {
  if (request === null || typeof request !== "object") {
    throw new WebSocketConnectionPoolError(
      "INVALID_LEASE_REQUEST",
      "WebSocket connection lease request must be an object.",
    );
  }

  const exchangeId = normalizeExchangeId(
    request.exchangeId,
  );

  const endpoint =
    request.endpoint === undefined
      ? undefined
      : validateIdentifier(
          request.endpoint,
          "request.endpoint",
        );

  validateOptionalRecord(
    request.metadata,
    "request.metadata",
  );

  if (
    request.reuseOnly !== undefined &&
    typeof request.reuseOnly !== "boolean"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_REUSE_ONLY",
      "request.reuseOnly must be boolean when provided.",
    );
  }

  if (
    request.connect !== undefined &&
    typeof request.connect !== "boolean"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_CONNECT_OPTION",
      "request.connect must be boolean when provided.",
    );
  }

  return Object.freeze({
    exchangeId,
    endpoint,
    metadata:
      request.metadata === undefined
        ? EMPTY_METADATA
        : Object.freeze({ ...request.metadata }),
    reuseOnly: request.reuseOnly ?? false,
    connect: request.connect ?? true,
  });
}

function validateManager(
  manager: WebSocketManager,
): WebSocketManager {
  if (
    manager === null ||
    typeof manager !== "object" ||
    typeof manager.register !== "function" ||
    typeof manager.connect !== "function" ||
    typeof manager.disconnect !== "function" ||
    typeof manager.unregister !== "function"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_WEBSOCKET_MANAGER",
      "A valid WebSocketManager instance is required.",
    );
  }

  return manager;
}

function validateFactory(
  factory: WebSocketConnectionFactory,
): WebSocketConnectionFactory {
  if (
    factory === null ||
    typeof factory !== "object" ||
    typeof factory.create !== "function"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_CONNECTION_FACTORY",
      "WebSocket connection factory must implement create().",
    );
  }

  return factory;
}

function validateClock(
  clock: WebSocketConnectionPoolClock,
): WebSocketConnectionPoolClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_CLOCK",
      "WebSocket connection pool clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function validateFactoryConnection(
  connection: ManagedWebSocketConnection,
  context: WebSocketConnectionFactoryContext,
): void {
  if (connection === null || typeof connection !== "object") {
    throw new WebSocketConnectionPoolError(
      "INVALID_FACTORY_CONNECTION",
      "WebSocket connection factory must return a managed connection.",
      {
        connectionId: context.connectionId,
        exchangeId: context.exchangeId,
      },
    );
  }

  if (
    connection.descriptor.connectionId !==
    context.connectionId
  ) {
    throw new WebSocketConnectionPoolError(
      "FACTORY_CONNECTION_ID_MISMATCH",
      `Factory returned connection ID "${connection.descriptor.connectionId}" instead of "${context.connectionId}".`,
      {
        connectionId: context.connectionId,
        exchangeId: context.exchangeId,
      },
    );
  }

  if (
    normalizeExchangeId(
      connection.descriptor.exchangeId,
    ) !== context.exchangeId
  ) {
    throw new WebSocketConnectionPoolError(
      "FACTORY_EXCHANGE_ID_MISMATCH",
      `Factory returned exchange ID "${connection.descriptor.exchangeId}" instead of "${context.exchangeId}".`,
      {
        connectionId: context.connectionId,
        exchangeId: context.exchangeId,
      },
    );
  }
}

function compareReusableConnections(
  left: MutablePooledConnection,
  right: MutablePooledConnection,
): number {
  if (left.lastUsedAt !== right.lastUsedAt) {
    return left.lastUsedAt - right.lastUsedAt;
  }

  if (left.leaseCount !== right.leaseCount) {
    return left.leaseCount - right.leaseCount;
  }

  return left.connectionId.localeCompare(
    right.connectionId,
  );
}

function compareEvictionCandidates(
  left: MutablePooledConnection,
  right: MutablePooledConnection,
): number {
  const leftFailed =
    left.connection.getState() === "FAILED" ? 0 : 1;

  const rightFailed =
    right.connection.getState() === "FAILED" ? 0 : 1;

  if (leftFailed !== rightFailed) {
    return leftFailed - rightFailed;
  }

  if (left.lastUsedAt !== right.lastUsedAt) {
    return left.lastUsedAt - right.lastUsedAt;
  }

  return left.connectionId.localeCompare(
    right.connectionId,
  );
}

function createLeaseSnapshot(
  lease: MutableLeaseRecord,
  connection: ManagedWebSocketConnection,
): WebSocketConnectionLease {
  return Object.freeze({
    leaseId: lease.leaseId,
    connectionId: lease.connectionId,
    exchangeId: lease.exchangeId,
    acquiredAt: lease.acquiredAt,
    connection,
  });
}

function createConnectionSnapshot(
  record: MutablePooledConnection,
): WebSocketPooledConnectionSnapshot {
  return Object.freeze({
    connectionId: record.connectionId,
    exchangeId: record.exchangeId,
    endpoint: record.endpoint,
    connectionState: record.connection.getState(),
    poolStatus: record.poolStatus,
    createdAt: record.createdAt,
    lastAcquiredAt: record.lastAcquiredAt,
    lastReleasedAt: record.lastReleasedAt,
    lastUsedAt: record.lastUsedAt,
    leaseCount: record.leaseCount,
    activeLeaseIds: Object.freeze(
      [...record.activeLeaseIds].sort(),
    ),
    metadata: Object.freeze({ ...record.metadata }),
  });
}

function freezeCleanupResult(
  generatedAt: number,
  evictions: WebSocketConnectionEvictionResult[],
  failures: WebSocketPoolOperationFailure[],
): WebSocketPoolCleanupResult {
  return Object.freeze({
    generatedAt,
    evictions: Object.freeze(
      evictions.map((eviction) =>
        Object.freeze({ ...eviction }),
      ),
    ),
    failures: Object.freeze(
      failures.map((failure) =>
        Object.freeze({ ...failure }),
      ),
    ),
  });
}

function normalizeExchangeId(
  exchangeId: WebSocketExchangeId,
): WebSocketExchangeId {
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
    throw new WebSocketConnectionPoolError(
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
    throw new WebSocketConnectionPoolError(
      "INVALID_POSITIVE_INTEGER",
      `${field} must be a positive safe integer.`,
    );
  }

  return value;
}

function validateNonNegativeFiniteNumber(
  value: number,
  field: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_NON_NEGATIVE_NUMBER",
      `${field} must be a finite non-negative number.`,
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
    throw new WebSocketConnectionPoolError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validateOptionalRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value))
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function validateEvictionReason(
  reason: WebSocketConnectionEvictionReason,
): void {
  if (
    reason !== "IDLE_TIMEOUT" &&
    reason !== "POOL_CAPACITY" &&
    reason !== "CONNECTION_FAILED" &&
    reason !== "POOL_DISPOSAL" &&
    reason !== "MANUAL"
  ) {
    throw new WebSocketConnectionPoolError(
      "INVALID_EVICTION_REASON",
      `Unsupported eviction reason "${String(reason)}".`,
    );
  }
}

function requiresDisconnection(
  state: WebSocketConnectionState,
): boolean {
  return (
    state === "CONNECTING" ||
    state === "CONNECTED" ||
    state === "DISCONNECTING" ||
    state === "RECONNECTING" ||
    state === "FAILED"
  );
}

function normalizeError(error: unknown): Error {
  if (
    error instanceof WebSocketConnectionPoolError ||
    error instanceof WebSocketManagerError ||
    error instanceof Error
  ) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(
      "Unknown WebSocket connection pool error.",
    );
  }
}