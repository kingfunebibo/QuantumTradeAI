import type {
  CoordinatorExchangeHealth,
  CoordinatorExchangeId,
  CoordinatorExchangeMetrics,
  CoordinatorLatencyMetrics,
  CoordinatorQuantityMetrics,
  CoordinatorCounterMetrics,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorClock,
  MultiExchangeCoordinatorHealthStatus,
  MultiExchangeCoordinatorId,
  MultiExchangeCoordinatorInstanceId,
  MultiExchangeCoordinatorMetrics,
  MultiExchangeCoordinatorState,
} from "./coordinator-contracts";

export interface MultiExchangeCoordinatorMetricsIdentity {
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
}

export interface CoordinatorMetricsExecutionObservation {
  readonly exchangeId: CoordinatorExchangeId;
  readonly succeeded: boolean;
  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly rejectedQuantity: number;
  readonly unallocatedQuantity: number;
  readonly latencyMilliseconds: number;
  readonly observedAt?: CoordinatorTimestamp;
}

export interface CoordinatorMetricsExchangeRegistration {
  readonly exchangeId: CoordinatorExchangeId;
  readonly health: CoordinatorExchangeHealth;
}

interface MutableExchangeMetrics {
  exchangeId: CoordinatorExchangeId;
  health: CoordinatorExchangeHealth;
  executionAttempts: number;
  successfulExecutions: number;
  failedExecutions: number;
  filledQuantity: number;
  totalLatencyMilliseconds: number;
  measuredExecutions: number;
  lastExecutionAt: CoordinatorTimestamp | null;
}

function assertNonNegativeFiniteNumber(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be finite.`);
  }

  if (value < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
}

function assertNonNegativeSafeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a safe integer.`);
  }

  if (value < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
}

export class MultiExchangeCoordinatorMetricsTracker {
  private coordinatorState: MultiExchangeCoordinatorState = "CREATED";

  private healthStatus: MultiExchangeCoordinatorHealthStatus =
    "UNKNOWN";

  private activeRequests = 0;

  private activeExecutions = 0;

  private readonly counters: {
    requestsReceived: number;
    requestsCompleted: number;
    requestsPartiallyCompleted: number;
    requestsRejected: number;
    requestsFailed: number;
    executionsStarted: number;
    executionsSucceeded: number;
    executionsPartiallySucceeded: number;
    executionsFailed: number;
    executionAttempts: number;
    retries: number;
    failovers: number;
    quarantines: number;
    recoveries: number;
  } = {
    requestsReceived: 0,
    requestsCompleted: 0,
    requestsPartiallyCompleted: 0,
    requestsRejected: 0,
    requestsFailed: 0,
    executionsStarted: 0,
    executionsSucceeded: 0,
    executionsPartiallySucceeded: 0,
    executionsFailed: 0,
    executionAttempts: 0,
    retries: 0,
    failovers: 0,
    quarantines: 0,
    recoveries: 0,
  };

  private readonly quantities: {
    requestedQuantity: number;
    acceptedQuantity: number;
    filledQuantity: number;
    rejectedQuantity: number;
    unallocatedQuantity: number;
  } = {
    requestedQuantity: 0,
    acceptedQuantity: 0,
    filledQuantity: 0,
    rejectedQuantity: 0,
    unallocatedQuantity: 0,
  };

  private minimumExecutionLatencyMilliseconds: number | null =
    null;

  private maximumExecutionLatencyMilliseconds: number | null =
    null;

  private totalExecutionLatencyMilliseconds = 0;

  private measuredExecutions = 0;

  private readonly exchangeMetrics = new Map<
    CoordinatorExchangeId,
    MutableExchangeMetrics
  >();

  public constructor(
    private readonly identity: MultiExchangeCoordinatorMetricsIdentity,
    private readonly clock: MultiExchangeCoordinatorClock,
  ) {}

  public setCoordinatorState(
    state: MultiExchangeCoordinatorState,
  ): void {
    this.coordinatorState = state;
  }

  public setHealthStatus(
    status: MultiExchangeCoordinatorHealthStatus,
  ): void {
    this.healthStatus = status;
  }

  public registerExchange(
    registration: CoordinatorMetricsExchangeRegistration,
  ): void {
    this.exchangeMetrics.set(registration.exchangeId, {
      exchangeId: registration.exchangeId,
      health: registration.health,
      executionAttempts: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      filledQuantity: 0,
      totalLatencyMilliseconds: 0,
      measuredExecutions: 0,
      lastExecutionAt: null,
    });
  }

  public unregisterExchange(
    exchangeId: CoordinatorExchangeId,
  ): boolean {
    return this.exchangeMetrics.delete(exchangeId);
  }

  public updateExchangeHealth(
    health: CoordinatorExchangeHealth,
  ): void {
    const metrics = this.exchangeMetrics.get(health.exchangeId);

    if (metrics === undefined) {
      this.registerExchange({
        exchangeId: health.exchangeId,
        health,
      });

      return;
    }

    metrics.health = health;
  }

  public recordRequestReceived(): void {
    this.counters.requestsReceived += 1;
    this.activeRequests += 1;
  }

  public recordRequestCompleted(): void {
    this.counters.requestsCompleted += 1;
    this.decrementActiveRequests();
  }

  public recordRequestPartiallyCompleted(): void {
    this.counters.requestsPartiallyCompleted += 1;
    this.decrementActiveRequests();
  }

  public recordRequestRejected(): void {
    this.counters.requestsRejected += 1;
    this.decrementActiveRequests();
  }

  public recordRequestFailed(): void {
    this.counters.requestsFailed += 1;
    this.decrementActiveRequests();
  }

  public recordExecutionStarted(): void {
    this.counters.executionsStarted += 1;
    this.activeExecutions += 1;
  }

  public recordExecutionSucceeded(): void {
    this.counters.executionsSucceeded += 1;
    this.decrementActiveExecutions();
  }

  public recordExecutionPartiallySucceeded(): void {
    this.counters.executionsPartiallySucceeded += 1;
    this.decrementActiveExecutions();
  }

  public recordExecutionFailed(): void {
    this.counters.executionsFailed += 1;
    this.decrementActiveExecutions();
  }

  public recordRetry(): void {
    this.counters.retries += 1;
  }

  public recordFailover(): void {
    this.counters.failovers += 1;
  }

  public recordQuarantine(): void {
    this.counters.quarantines += 1;
  }

  public recordRecovery(): void {
    this.counters.recoveries += 1;
  }

  public recordExecutionObservation(
    observation: CoordinatorMetricsExecutionObservation,
  ): void {
    assertNonNegativeFiniteNumber(
      observation.requestedQuantity,
      "requestedQuantity",
    );
    assertNonNegativeFiniteNumber(
      observation.acceptedQuantity,
      "acceptedQuantity",
    );
    assertNonNegativeFiniteNumber(
      observation.filledQuantity,
      "filledQuantity",
    );
    assertNonNegativeFiniteNumber(
      observation.rejectedQuantity,
      "rejectedQuantity",
    );
    assertNonNegativeFiniteNumber(
      observation.unallocatedQuantity,
      "unallocatedQuantity",
    );
    assertNonNegativeFiniteNumber(
      observation.latencyMilliseconds,
      "latencyMilliseconds",
    );

    const observedAt =
      observation.observedAt ?? this.clock.now();

    assertNonNegativeSafeInteger(observedAt, "observedAt");

    this.counters.executionAttempts += 1;

    this.quantities.requestedQuantity +=
      observation.requestedQuantity;
    this.quantities.acceptedQuantity +=
      observation.acceptedQuantity;
    this.quantities.filledQuantity +=
      observation.filledQuantity;
    this.quantities.rejectedQuantity +=
      observation.rejectedQuantity;
    this.quantities.unallocatedQuantity +=
      observation.unallocatedQuantity;

    this.recordLatency(observation.latencyMilliseconds);

    const metrics = this.exchangeMetrics.get(
      observation.exchangeId,
    );

    if (metrics === undefined) {
      throw new Error(
        `Exchange ${observation.exchangeId} is not registered in coordinator metrics.`,
      );
    }

    metrics.executionAttempts += 1;
    metrics.filledQuantity += observation.filledQuantity;
    metrics.totalLatencyMilliseconds +=
      observation.latencyMilliseconds;
    metrics.measuredExecutions += 1;
    metrics.lastExecutionAt = observedAt;

    if (observation.succeeded) {
      metrics.successfulExecutions += 1;
    } else {
      metrics.failedExecutions += 1;
    }
  }

  public getMetrics(): MultiExchangeCoordinatorMetrics {
    return Object.freeze({
      coordinatorId: this.identity.coordinatorId,
      instanceId: this.identity.instanceId,
      state: this.coordinatorState,
      healthStatus: this.healthStatus,
      counters: this.createCounterMetrics(),
      quantities: this.createQuantityMetrics(),
      latency: this.createLatencyMetrics(),
      exchanges: Object.freeze(
        Array.from(this.exchangeMetrics.values())
          .sort((left, right) =>
            left.exchangeId.localeCompare(right.exchangeId),
          )
          .map((metrics) =>
            this.createExchangeMetrics(metrics),
          ),
      ),
      activeRequests: this.activeRequests,
      activeExecutions: this.activeExecutions,
      collectedAt: this.clock.now(),
    });
  }

  private recordLatency(latencyMilliseconds: number): void {
    this.minimumExecutionLatencyMilliseconds =
      this.minimumExecutionLatencyMilliseconds === null
        ? latencyMilliseconds
        : Math.min(
            this.minimumExecutionLatencyMilliseconds,
            latencyMilliseconds,
          );

    this.maximumExecutionLatencyMilliseconds =
      this.maximumExecutionLatencyMilliseconds === null
        ? latencyMilliseconds
        : Math.max(
            this.maximumExecutionLatencyMilliseconds,
            latencyMilliseconds,
          );

    this.totalExecutionLatencyMilliseconds +=
      latencyMilliseconds;
    this.measuredExecutions += 1;
  }

  private decrementActiveRequests(): void {
    if (this.activeRequests > 0) {
      this.activeRequests -= 1;
    }
  }

  private decrementActiveExecutions(): void {
    if (this.activeExecutions > 0) {
      this.activeExecutions -= 1;
    }
  }

  private createCounterMetrics(): CoordinatorCounterMetrics {
    return Object.freeze({
      ...this.counters,
    });
  }

  private createQuantityMetrics(): CoordinatorQuantityMetrics {
    return Object.freeze({
      ...this.quantities,
    });
  }

  private createLatencyMetrics(): CoordinatorLatencyMetrics {
    return Object.freeze({
      minimumExecutionLatencyMilliseconds:
        this.minimumExecutionLatencyMilliseconds,
      maximumExecutionLatencyMilliseconds:
        this.maximumExecutionLatencyMilliseconds,
      averageExecutionLatencyMilliseconds:
        this.measuredExecutions === 0
          ? null
          : this.totalExecutionLatencyMilliseconds /
            this.measuredExecutions,
      totalExecutionLatencyMilliseconds:
        this.totalExecutionLatencyMilliseconds,
      measuredExecutions: this.measuredExecutions,
    });
  }

  private createExchangeMetrics(
    metrics: MutableExchangeMetrics,
  ): CoordinatorExchangeMetrics {
    return Object.freeze({
      exchangeId: metrics.exchangeId,
      health: metrics.health,
      executionAttempts: metrics.executionAttempts,
      successfulExecutions: metrics.successfulExecutions,
      failedExecutions: metrics.failedExecutions,
      filledQuantity: metrics.filledQuantity,
      averageLatencyMilliseconds:
        metrics.measuredExecutions === 0
          ? null
          : metrics.totalLatencyMilliseconds /
            metrics.measuredExecutions,
      lastExecutionAt: metrics.lastExecutionAt,
    });
  }
}

export function createMultiExchangeCoordinatorMetricsTracker(
  identity: MultiExchangeCoordinatorMetricsIdentity,
  clock: MultiExchangeCoordinatorClock,
): MultiExchangeCoordinatorMetricsTracker {
  return new MultiExchangeCoordinatorMetricsTracker(
    identity,
    clock,
  );
}