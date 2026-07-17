/**
 * QuantumTradeAI
 * Milestone 21 — Multi-Exchange Trading Coordinator
 *
 * Phase 1, File 1:
 * Shared coordinator domain contracts.
 *
 * This file intentionally contains no runtime implementation and no imports
 * from unfinished Milestone 21 components. It establishes the stable domain
 * vocabulary used by the coordinator lifecycle, state machine, routing,
 * allocation, failover, monitoring, and deterministic testing subsystems.
 */

export type MultiExchangeCoordinatorId = string;
export type MultiExchangeCoordinatorInstanceId = string;
export type MultiExchangeCoordinatorRequestId = string;
export type MultiExchangeCoordinatorExecutionId = string;
export type MultiExchangeCoordinatorPlanId = string;
export type MultiExchangeCoordinatorAttemptId = string;
export type MultiExchangeCoordinatorEventId = string;
export type MultiExchangeCoordinatorCorrelationId = string;
export type MultiExchangeCoordinatorCausationId = string;

export type CoordinatorExchangeId = string;
export type CoordinatorAccountId = string;
export type CoordinatorSymbol = string;
export type CoordinatorClientOrderId = string;
export type CoordinatorExchangeOrderId = string;

export type CoordinatorTimestamp = number;
export type CoordinatorDurationMilliseconds = number;
export type CoordinatorSequence = number;
export type CoordinatorPercentage = number;
export type CoordinatorWeight = number;

export type CoordinatorMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly CoordinatorMetadataValue[]
  | Readonly<{
      [key: string]: CoordinatorMetadataValue;
    }>;

export type CoordinatorMetadata = Readonly<
  Record<string, CoordinatorMetadataValue>
>;

export type MultiExchangeCoordinatorState =
  | "CREATED"
  | "STARTING"
  | "RUNNING"
  | "DEGRADED"
  | "PAUSING"
  | "PAUSED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED"
  | "DISPOSED";

export type MultiExchangeCoordinatorHealthStatus =
  | "UNKNOWN"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "OFFLINE";

export type MultiExchangeCoordinatorExecutionMode =
  | "SINGLE"
  | "PREFERRED"
  | "BROADCAST"
  | "SPLIT"
  | "WEIGHTED";

export type MultiExchangeCoordinatorRequestStatus =
  | "RECEIVED"
  | "VALIDATING"
  | "PLANNING"
  | "EXECUTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type MultiExchangeCoordinatorExecutionStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN";

export type CoordinatorExchangeAvailability =
  | "AVAILABLE"
  | "DEGRADED"
  | "QUARANTINED"
  | "CIRCUIT_OPEN"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type CoordinatorOrderSide = "BUY" | "SELL";

export type CoordinatorOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_LIMIT";

export type CoordinatorTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "POST_ONLY"
  | "GTD";

export type CoordinatorMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURES"
  | "OPTIONS";

export type CoordinatorCapability =
  | "MARKET_ORDER"
  | "LIMIT_ORDER"
  | "STOP_ORDER"
  | "STOP_LIMIT_ORDER"
  | "TAKE_PROFIT_ORDER"
  | "TAKE_PROFIT_LIMIT_ORDER"
  | "POST_ONLY_ORDER"
  | "REDUCE_ONLY_ORDER"
  | "CANCEL_ORDER"
  | "REPLACE_ORDER"
  | "ORDER_RECONCILIATION"
  | "CLIENT_ORDER_ID"
  | "BATCH_ORDER"
  | "SPOT_TRADING"
  | "MARGIN_TRADING"
  | "PERPETUAL_TRADING"
  | "FUTURES_TRADING"
  | "OPTIONS_TRADING";

export type CoordinatorSelectionReason =
  | "PREFERRED_EXCHANGE"
  | "HIGHEST_PRIORITY"
  | "LOWEST_LATENCY"
  | "BEST_HEALTH"
  | "CAPABILITY_MATCH"
  | "SYMBOL_COMPATIBILITY"
  | "WEIGHTED_ALLOCATION"
  | "FAILOVER"
  | "RECOVERY"
  | "ONLY_AVAILABLE_EXCHANGE";

export type CoordinatorRejectionCode =
  | "COORDINATOR_NOT_RUNNING"
  | "COORDINATOR_PAUSED"
  | "INVALID_REQUEST"
  | "INVALID_QUANTITY"
  | "INVALID_PRICE"
  | "INVALID_SYMBOL"
  | "INVALID_ACCOUNT"
  | "INVALID_EXECUTION_MODE"
  | "NO_EXCHANGES_REGISTERED"
  | "NO_COMPATIBLE_EXCHANGE"
  | "NO_HEALTHY_EXCHANGE"
  | "CAPABILITY_UNAVAILABLE"
  | "SYMBOL_UNSUPPORTED"
  | "PREFERRED_EXCHANGE_UNAVAILABLE"
  | "ALLOCATION_FAILED"
  | "EXECUTION_REJECTED"
  | "EXECUTION_FAILED"
  | "REQUEST_CANCELLED"
  | "DUPLICATE_REQUEST"
  | "INTERNAL_ERROR";

export type CoordinatorFailureCode =
  | "VALIDATION_FAILED"
  | "PLANNING_FAILED"
  | "ROUTING_FAILED"
  | "SUBMISSION_FAILED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "AUTHENTICATION_FAILED"
  | "EXCHANGE_REJECTED"
  | "EXCHANGE_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "CIRCUIT_OPEN"
  | "EXCHANGE_QUARANTINED"
  | "RETRY_EXHAUSTED"
  | "FAILOVER_EXHAUSTED"
  | "RECONCILIATION_FAILED"
  | "CANCELLATION_FAILED"
  | "UNKNOWN_EXECUTION_STATE"
  | "INTERNAL_ERROR";

export type CoordinatorEventType =
  | "COORDINATOR_CREATED"
  | "COORDINATOR_STARTING"
  | "COORDINATOR_STARTED"
  | "COORDINATOR_DEGRADED"
  | "COORDINATOR_PAUSING"
  | "COORDINATOR_PAUSED"
  | "COORDINATOR_RESUMED"
  | "COORDINATOR_STOPPING"
  | "COORDINATOR_STOPPED"
  | "COORDINATOR_FAILED"
  | "COORDINATOR_DISPOSED"
  | "REQUEST_RECEIVED"
  | "REQUEST_VALIDATED"
  | "REQUEST_REJECTED"
  | "PLAN_CREATED"
  | "EXCHANGE_SELECTED"
  | "EXECUTION_STARTED"
  | "EXECUTION_ATTEMPT_STARTED"
  | "EXECUTION_ATTEMPT_SUCCEEDED"
  | "EXECUTION_ATTEMPT_FAILED"
  | "FAILOVER_STARTED"
  | "FAILOVER_COMPLETED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_PARTIALLY_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXCHANGE_QUARANTINED"
  | "EXCHANGE_RECOVERED"
  | "HEALTH_CHANGED"
  | "METRICS_UPDATED";

export interface MultiExchangeCoordinatorClock {
  now(): CoordinatorTimestamp;
}

export interface MultiExchangeCoordinatorIdentity {
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
  readonly name: string;
  readonly version: string;
}

export interface MultiExchangeCoordinatorLifecycleSnapshot {
  readonly state: MultiExchangeCoordinatorState;
  readonly previousState: MultiExchangeCoordinatorState | null;
  readonly stateChangedAt: CoordinatorTimestamp;
  readonly startedAt: CoordinatorTimestamp | null;
  readonly pausedAt: CoordinatorTimestamp | null;
  readonly stoppedAt: CoordinatorTimestamp | null;
  readonly failureReason: string | null;
}

export interface CoordinatorExchangeReference {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
}

export interface CoordinatorSymbolReference {
  readonly requestedSymbol: CoordinatorSymbol;
  readonly normalizedSymbol: CoordinatorSymbol;
  readonly exchangeSymbol: CoordinatorSymbol;
}

export interface CoordinatorExchangeCapabilities {
  readonly exchangeId: CoordinatorExchangeId;
  readonly capabilities: readonly CoordinatorCapability[];
  readonly marketTypes: readonly CoordinatorMarketType[];
  readonly supportedOrderTypes: readonly CoordinatorOrderType[];
  readonly supportedTimeInForce: readonly CoordinatorTimeInForce[];
  readonly supportsReduceOnly: boolean;
  readonly supportsPostOnly: boolean;
  readonly supportsClientOrderId: boolean;
  readonly supportsOrderReplacement: boolean;
}

export interface CoordinatorExchangeHealth {
  readonly exchangeId: CoordinatorExchangeId;
  readonly status: MultiExchangeCoordinatorHealthStatus;
  readonly availability: CoordinatorExchangeAvailability;
  readonly observedAt: CoordinatorTimestamp;
  readonly lastSuccessfulRequestAt: CoordinatorTimestamp | null;
  readonly lastFailedRequestAt: CoordinatorTimestamp | null;
  readonly consecutiveFailures: number;
  readonly latencyMilliseconds: number | null;
  readonly errorRate: CoordinatorPercentage | null;
  readonly reason: string | null;
}

export interface CoordinatorExchangeCandidate {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly priority: number;
  readonly weight: CoordinatorWeight;
  readonly preferred: boolean;
  readonly capabilities: CoordinatorExchangeCapabilities;
  readonly health: CoordinatorExchangeHealth;
  readonly symbol: CoordinatorSymbolReference;
  readonly selectionScore: number;
  readonly selectionReasons: readonly CoordinatorSelectionReason[];
}

export interface MultiExchangeCoordinatorOrderRequest {
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly correlationId: MultiExchangeCoordinatorCorrelationId;
  readonly causationId: MultiExchangeCoordinatorCausationId | null;
  readonly executionMode: MultiExchangeCoordinatorExecutionMode;
  readonly accountId: CoordinatorAccountId;
  readonly symbol: CoordinatorSymbol;
  readonly marketType: CoordinatorMarketType;
  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;
  readonly quantity: number;
  readonly price: number | null;
  readonly stopPrice: number | null;
  readonly timeInForce: CoordinatorTimeInForce | null;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly preferredExchangeId: CoordinatorExchangeId | null;
  readonly eligibleExchangeIds: readonly CoordinatorExchangeId[] | null;
  readonly excludedExchangeIds: readonly CoordinatorExchangeId[];
  readonly clientOrderId: CoordinatorClientOrderId | null;
  readonly expiresAt: CoordinatorTimestamp | null;
  readonly createdAt: CoordinatorTimestamp;
  readonly metadata: CoordinatorMetadata;
}

export interface CoordinatorValidationIssue {
  readonly code: CoordinatorRejectionCode;
  readonly field: string | null;
  readonly message: string;
}

export interface CoordinatorValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CoordinatorValidationIssue[];
  readonly validatedAt: CoordinatorTimestamp;
}

export interface CoordinatorAllocation {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly symbol: CoordinatorSymbolReference;
  readonly quantity: number;
  readonly percentage: CoordinatorPercentage;
  readonly weight: CoordinatorWeight;
  readonly priority: number;
  readonly sequence: CoordinatorSequence;
  readonly reason: CoordinatorSelectionReason;
}

export interface MultiExchangeCoordinatorExecutionPlan {
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly mode: MultiExchangeCoordinatorExecutionMode;
  readonly requestedQuantity: number;
  readonly allocatedQuantity: number;
  readonly unallocatedQuantity: number;
  readonly candidates: readonly CoordinatorExchangeCandidate[];
  readonly allocations: readonly CoordinatorAllocation[];
  readonly createdAt: CoordinatorTimestamp;
  readonly metadata: CoordinatorMetadata;
}

export interface CoordinatorExecutionAttempt {
  readonly attemptId: MultiExchangeCoordinatorAttemptId;
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly sequence: CoordinatorSequence;
  readonly quantity: number;
  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp | null;
  readonly durationMilliseconds: CoordinatorDurationMilliseconds | null;
  readonly clientOrderId: CoordinatorClientOrderId | null;
  readonly exchangeOrderId: CoordinatorExchangeOrderId | null;
  readonly status: MultiExchangeCoordinatorExecutionStatus;
  readonly failure: CoordinatorExecutionFailure | null;
  readonly metadata: CoordinatorMetadata;
}

export interface CoordinatorExecutionFailure {
  readonly code: CoordinatorFailureCode;
  readonly message: string;
  readonly exchangeId: CoordinatorExchangeId | null;
  readonly retryable: boolean;
  readonly failoverAllowed: boolean;
  readonly occurredAt: CoordinatorTimestamp;
  readonly cause: unknown;
  readonly metadata: CoordinatorMetadata;
}

export interface CoordinatorExchangeExecutionResult {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice: number | null;
  readonly clientOrderId: CoordinatorClientOrderId | null;
  readonly exchangeOrderId: CoordinatorExchangeOrderId | null;
  readonly status: MultiExchangeCoordinatorExecutionStatus;
  readonly attempts: readonly CoordinatorExecutionAttempt[];
  readonly failure: CoordinatorExecutionFailure | null;
  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;
  readonly durationMilliseconds: CoordinatorDurationMilliseconds;
  readonly metadata: CoordinatorMetadata;
}

export interface MultiExchangeCoordinatorExecutionSummary {
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly planId: MultiExchangeCoordinatorPlanId | null;
  readonly mode: MultiExchangeCoordinatorExecutionMode;
  readonly status: MultiExchangeCoordinatorExecutionStatus;
  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;
  readonly averageFillPrice: number | null;
  readonly successfulExchangeIds: readonly CoordinatorExchangeId[];
  readonly failedExchangeIds: readonly CoordinatorExchangeId[];
  readonly results: readonly CoordinatorExchangeExecutionResult[];
  readonly failure: CoordinatorExecutionFailure | null;
  readonly startedAt: CoordinatorTimestamp;
  readonly completedAt: CoordinatorTimestamp;
  readonly durationMilliseconds: CoordinatorDurationMilliseconds;
  readonly metadata: CoordinatorMetadata;
}

export interface CoordinatorRequestRecord {
  readonly request: MultiExchangeCoordinatorOrderRequest;
  readonly status: MultiExchangeCoordinatorRequestStatus;
  readonly validation: CoordinatorValidationResult | null;
  readonly plan: MultiExchangeCoordinatorExecutionPlan | null;
  readonly summary: MultiExchangeCoordinatorExecutionSummary | null;
  readonly receivedAt: CoordinatorTimestamp;
  readonly updatedAt: CoordinatorTimestamp;
}

export interface CoordinatorCounterMetrics {
  readonly requestsReceived: number;
  readonly requestsCompleted: number;
  readonly requestsPartiallyCompleted: number;
  readonly requestsRejected: number;
  readonly requestsFailed: number;
  readonly executionsStarted: number;
  readonly executionsSucceeded: number;
  readonly executionsPartiallySucceeded: number;
  readonly executionsFailed: number;
  readonly executionAttempts: number;
  readonly retries: number;
  readonly failovers: number;
  readonly quarantines: number;
  readonly recoveries: number;
}

export interface CoordinatorQuantityMetrics {
  readonly requestedQuantity: number;
  readonly acceptedQuantity: number;
  readonly filledQuantity: number;
  readonly rejectedQuantity: number;
  readonly unallocatedQuantity: number;
}

export interface CoordinatorLatencyMetrics {
  readonly minimumExecutionLatencyMilliseconds: number | null;
  readonly maximumExecutionLatencyMilliseconds: number | null;
  readonly averageExecutionLatencyMilliseconds: number | null;
  readonly totalExecutionLatencyMilliseconds: number;
  readonly measuredExecutions: number;
}

export interface CoordinatorExchangeMetrics {
  readonly exchangeId: CoordinatorExchangeId;
  readonly health: CoordinatorExchangeHealth;
  readonly executionAttempts: number;
  readonly successfulExecutions: number;
  readonly failedExecutions: number;
  readonly filledQuantity: number;
  readonly averageLatencyMilliseconds: number | null;
  readonly lastExecutionAt: CoordinatorTimestamp | null;
}

export interface MultiExchangeCoordinatorMetrics {
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
  readonly state: MultiExchangeCoordinatorState;
  readonly healthStatus: MultiExchangeCoordinatorHealthStatus;
  readonly counters: CoordinatorCounterMetrics;
  readonly quantities: CoordinatorQuantityMetrics;
  readonly latency: CoordinatorLatencyMetrics;
  readonly exchanges: readonly CoordinatorExchangeMetrics[];
  readonly activeRequests: number;
  readonly activeExecutions: number;
  readonly collectedAt: CoordinatorTimestamp;
}

export interface MultiExchangeCoordinatorHealthSnapshot {
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
  readonly coordinatorState: MultiExchangeCoordinatorState;
  readonly status: MultiExchangeCoordinatorHealthStatus;
  readonly exchanges: readonly CoordinatorExchangeHealth[];
  readonly healthyExchangeCount: number;
  readonly degradedExchangeCount: number;
  readonly unhealthyExchangeCount: number;
  readonly unavailableExchangeCount: number;
  readonly observedAt: CoordinatorTimestamp;
  readonly reason: string | null;
}

export interface MultiExchangeCoordinatorEvent<TPayload = unknown> {
  readonly eventId: MultiExchangeCoordinatorEventId;
  readonly eventType: CoordinatorEventType;
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
  readonly correlationId: MultiExchangeCoordinatorCorrelationId | null;
  readonly causationId: MultiExchangeCoordinatorCausationId | null;
  readonly sequence: CoordinatorSequence;
  readonly occurredAt: CoordinatorTimestamp;
  readonly payload: TPayload;
  readonly metadata: CoordinatorMetadata;
}

export interface MultiExchangeCoordinatorObserver {
  onEvent(event: MultiExchangeCoordinatorEvent): void | Promise<void>;
}

export interface MultiExchangeCoordinatorMetricsObserver {
  onMetrics(metrics: MultiExchangeCoordinatorMetrics): void | Promise<void>;
}

export interface MultiExchangeCoordinatorHealthObserver {
  onHealthChanged(
    health: MultiExchangeCoordinatorHealthSnapshot,
  ): void | Promise<void>;
}

export interface MultiExchangeCoordinatorConfiguration {
  readonly identity: MultiExchangeCoordinatorIdentity;
  readonly defaultExecutionMode: MultiExchangeCoordinatorExecutionMode;
  readonly preferredExchangeId: CoordinatorExchangeId | null;
  readonly minimumHealthyExchanges: number;
  readonly maximumConcurrentExecutions: number;
  readonly requestTimeoutMilliseconds: CoordinatorDurationMilliseconds;
  readonly exchangeTimeoutMilliseconds: CoordinatorDurationMilliseconds;
  readonly allowDegradedExchanges: boolean;
  readonly allowPartialExecution: boolean;
  readonly requireFullAllocation: boolean;
  readonly metadata: CoordinatorMetadata;
}

export interface MultiExchangeCoordinatorSnapshot {
  readonly identity: MultiExchangeCoordinatorIdentity;
  readonly lifecycle: MultiExchangeCoordinatorLifecycleSnapshot;
  readonly health: MultiExchangeCoordinatorHealthSnapshot;
  readonly metrics: MultiExchangeCoordinatorMetrics;
  readonly activeRequestIds: readonly MultiExchangeCoordinatorRequestId[];
  readonly activeExecutionIds: readonly MultiExchangeCoordinatorExecutionId[];
  readonly capturedAt: CoordinatorTimestamp;
}

export interface MultiExchangeCoordinatorLifecycle {
  getState(): MultiExchangeCoordinatorState;

  start(): Promise<MultiExchangeCoordinatorLifecycleSnapshot>;

  pause(): Promise<MultiExchangeCoordinatorLifecycleSnapshot>;

  resume(): Promise<MultiExchangeCoordinatorLifecycleSnapshot>;

  stop(): Promise<MultiExchangeCoordinatorLifecycleSnapshot>;

  dispose(): Promise<MultiExchangeCoordinatorLifecycleSnapshot>;
}

export interface MultiExchangeCoordinator {
  readonly identity: MultiExchangeCoordinatorIdentity;

  getConfiguration(): MultiExchangeCoordinatorConfiguration;

  getLifecycleSnapshot(): MultiExchangeCoordinatorLifecycleSnapshot;

  getHealthSnapshot(): MultiExchangeCoordinatorHealthSnapshot;

  getMetrics(): MultiExchangeCoordinatorMetrics;

  getSnapshot(): MultiExchangeCoordinatorSnapshot;

  getRequest(
    requestId: MultiExchangeCoordinatorRequestId,
  ): CoordinatorRequestRecord | null;

  execute(
    request: MultiExchangeCoordinatorOrderRequest,
  ): Promise<MultiExchangeCoordinatorExecutionSummary>;

  cancel(
    requestId: MultiExchangeCoordinatorRequestId,
    reason?: string,
  ): Promise<boolean>;

  addObserver(observer: MultiExchangeCoordinatorObserver): void;

  removeObserver(observer: MultiExchangeCoordinatorObserver): void;

  addMetricsObserver(observer: MultiExchangeCoordinatorMetricsObserver): void;

  removeMetricsObserver(observer: MultiExchangeCoordinatorMetricsObserver): void;

  addHealthObserver(observer: MultiExchangeCoordinatorHealthObserver): void;

  removeHealthObserver(observer: MultiExchangeCoordinatorHealthObserver): void;
}