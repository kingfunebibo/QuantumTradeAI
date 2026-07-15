/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Core exchange connector contracts.
 *
 * This module defines the vendor-neutral interface implemented by every live
 * exchange connector. Exchange-specific implementations such as Bybit, OKX,
 * Binance, or Coinbase must depend on this contract rather than exposing their
 * native SDKs directly to the trading domain.
 */

/**
 * Unique identifier for an exchange connector.
 *
 * Examples:
 * - "bybit"
 * - "okx"
 * - "binance"
 * - "coinbase"
 */
export type ExchangeConnectorId = string;

/**
 * Trading environments supported by an exchange connector.
 */
export type ExchangeEnvironment = "PRODUCTION" | "SANDBOX" | "TEST";

/**
 * High-level market categories that a connector may support.
 *
 * QuantumTradeAI currently prioritizes spot trading, but the contract remains
 * extensible for future derivatives support.
 */
export type ExchangeMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURES"
  | "OPTIONS";

/**
 * Lifecycle states for an exchange connector.
 *
 * State transitions are intentionally explicit so connector behavior can be
 * monitored, validated, and tested deterministically.
 */
export type ExchangeConnectorLifecycleState =
  | "CREATED"
  | "INITIALIZING"
  | "INITIALIZED"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTING"
  | "DISCONNECTED"
  | "FAILED"
  | "DESTROYED";

/**
 * Operational health classifications for an exchange connector.
 */
export type ExchangeConnectorHealthStatus =
  | "UNKNOWN"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY";

/**
 * Supported connector capabilities.
 *
 * Capability discovery prevents application services from assuming that every
 * exchange provides every feature.
 */
export interface ExchangeConnectorCapabilities {
  readonly marketTypes: readonly ExchangeMarketType[];

  readonly supportsPublicRest: boolean;
  readonly supportsPrivateRest: boolean;
  readonly supportsPublicWebSocket: boolean;
  readonly supportsPrivateWebSocket: boolean;

  readonly supportsMarketData: boolean;
  readonly supportsOrderPlacement: boolean;
  readonly supportsOrderCancellation: boolean;
  readonly supportsOrderAmendment: boolean;
  readonly supportsOpenOrders: boolean;
  readonly supportsOrderHistory: boolean;
  readonly supportsTradeHistory: boolean;
  readonly supportsBalances: boolean;
  readonly supportsPositions: boolean;

  readonly supportsClientOrderId: boolean;
  readonly supportsBatchOrders: boolean;
  readonly supportsServerTime: boolean;
  readonly supportsSandbox: boolean;
}

/**
 * Immutable metadata describing a connector implementation.
 */
export interface ExchangeConnectorMetadata {
  readonly id: ExchangeConnectorId;
  readonly exchangeName: string;
  readonly displayName: string;
  readonly implementationVersion: string;
  readonly environment: ExchangeEnvironment;
  readonly capabilities: ExchangeConnectorCapabilities;
}

/**
 * Snapshot of the current connector lifecycle.
 */
export interface ExchangeConnectorStateSnapshot {
  readonly connectorId: ExchangeConnectorId;
  readonly state: ExchangeConnectorLifecycleState;

  /**
   * Monotonically increasing revision controlled by the connector.
   *
   * This allows callers and tests to determine whether the lifecycle state has
   * changed without relying only on timestamps.
   */
  readonly revision: number;

  /**
   * Timestamp supplied by the connector clock.
   *
   * Connector implementations must not call Date.now() directly. A clock
   * dependency will be introduced so lifecycle tests remain deterministic.
   */
  readonly changedAt: number;

  readonly reason?: string;
}

/**
 * Health information exposed by a connector.
 */
export interface ExchangeConnectorHealthSnapshot {
  readonly connectorId: ExchangeConnectorId;
  readonly status: ExchangeConnectorHealthStatus;
  readonly checkedAt: number;

  /**
   * Round-trip latency measured by the connector health monitor.
   */
  readonly latencyMs?: number;

  /**
   * Last successfully observed exchange communication timestamp.
   */
  readonly lastSuccessfulCommunicationAt?: number;

  /**
   * Last connector failure timestamp.
   */
  readonly lastFailureAt?: number;

  /**
   * Machine-readable failure or degradation code.
   */
  readonly code?: string;

  /**
   * Human-readable diagnostic description.
   */
  readonly message?: string;

  /**
   * Additional immutable health details.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Options used when initializing an exchange connector.
 */
export interface ExchangeConnectorInitializationOptions {
  /**
   * Optional deterministic operation timestamp.
   *
   * Tests may provide this value directly. Production lifecycle management can
   * derive it from an injected clock.
   */
  readonly requestedAt?: number;

  /**
   * Forces connector initialization to run again when supported.
   */
  readonly force?: boolean;
}

/**
 * Options used when opening an exchange connection.
 */
export interface ExchangeConnectorConnectOptions {
  readonly requestedAt?: number;

  /**
   * Maximum time the lifecycle manager should permit the connection attempt to
   * remain active.
   */
  readonly timeoutMs?: number;

  /**
   * Whether private authenticated channels should be opened.
   */
  readonly includePrivateChannels?: boolean;
}

/**
 * Options used when closing an exchange connection.
 */
export interface ExchangeConnectorDisconnectOptions {
  readonly requestedAt?: number;

  /**
   * When true, the connector should stop accepting new operations and allow
   * active operations to finish where possible.
   */
  readonly graceful?: boolean;

  /**
   * Maximum duration allowed for graceful shutdown.
   */
  readonly timeoutMs?: number;

  readonly reason?: string;
}

/**
 * Result produced by lifecycle operations.
 */
export interface ExchangeConnectorLifecycleResult {
  readonly connectorId: ExchangeConnectorId;
  readonly previousState: ExchangeConnectorLifecycleState;
  readonly currentState: ExchangeConnectorLifecycleState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Context attached to operations executed through a connector.
 *
 * The context is transport-independent and can later be passed into REST,
 * WebSocket, retry, rate-limiting, logging, and tracing components.
 */
export interface ExchangeConnectorOperationContext {
  /**
   * Unique ID for this logical operation.
   */
  readonly operationId: string;

  /**
   * Optional ID shared by related operations.
   */
  readonly correlationId?: string;

  /**
   * Optional parent operation for nested workflows.
   */
  readonly causationId?: string;

  /**
   * Deterministic operation creation timestamp.
   */
  readonly createdAt: number;

  /**
   * Absolute operation deadline.
   */
  readonly deadlineAt?: number;

  /**
   * Optional immutable metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Core contract implemented by every live exchange connector.
 *
 * This interface deliberately excludes exchange-specific order, account, and
 * market-data operations. Those responsibilities will be introduced through
 * narrower capability interfaces following the Interface Segregation
 * Principle.
 */
export interface ExchangeConnector {
  /**
   * Returns immutable connector metadata.
   */
  getMetadata(): ExchangeConnectorMetadata;

  /**
   * Returns the latest connector lifecycle snapshot.
   */
  getState(): ExchangeConnectorStateSnapshot;

  /**
   * Returns the latest known health snapshot.
   *
   * This method must not implicitly perform network I/O. Active health checking
   * will be provided through a dedicated health-monitoring contract.
   */
  getHealth(): ExchangeConnectorHealthSnapshot;

  /**
   * Performs connector-local initialization.
   *
   * Typical responsibilities include:
   * - configuration validation;
   * - credential validation;
   * - transport construction;
   * - request signer initialization;
   * - rate limiter initialization.
   *
   * Initialization should be idempotent unless force is explicitly supported.
   */
  initialize(
    options?: ExchangeConnectorInitializationOptions,
  ): Promise<ExchangeConnectorLifecycleResult>;

  /**
   * Opens the connector's required network transports.
   */
  connect(
    options?: ExchangeConnectorConnectOptions,
  ): Promise<ExchangeConnectorLifecycleResult>;

  /**
   * Closes active transports and stops new exchange operations.
   */
  disconnect(
    options?: ExchangeConnectorDisconnectOptions,
  ): Promise<ExchangeConnectorLifecycleResult>;

  /**
   * Permanently releases connector resources.
   *
   * A destroyed connector must not reconnect unless the concrete implementation
   * explicitly documents reusable destruction semantics.
   */
  destroy(
    options?: ExchangeConnectorDisconnectOptions,
  ): Promise<ExchangeConnectorLifecycleResult>;
}

/**
 * Runtime type guard for connector lifecycle states.
 */
export function isExchangeConnectorLifecycleState(
  value: unknown,
): value is ExchangeConnectorLifecycleState {
  return (
    value === "CREATED" ||
    value === "INITIALIZING" ||
    value === "INITIALIZED" ||
    value === "CONNECTING" ||
    value === "CONNECTED" ||
    value === "DISCONNECTING" ||
    value === "DISCONNECTED" ||
    value === "FAILED" ||
    value === "DESTROYED"
  );
}

/**
 * Runtime type guard for connector health states.
 */
export function isExchangeConnectorHealthStatus(
  value: unknown,
): value is ExchangeConnectorHealthStatus {
  return (
    value === "UNKNOWN" ||
    value === "HEALTHY" ||
    value === "DEGRADED" ||
    value === "UNHEALTHY"
  );
}

/**
 * Determines whether a connector state permits live exchange operations.
 */
export function isExchangeConnectorOperational(
  state: ExchangeConnectorLifecycleState,
): boolean {
  return state === "CONNECTED";
}

/**
 * Determines whether the connector has reached a terminal lifecycle state.
 */
export function isExchangeConnectorTerminal(
  state: ExchangeConnectorLifecycleState,
): boolean {
  return state === "DESTROYED";
}