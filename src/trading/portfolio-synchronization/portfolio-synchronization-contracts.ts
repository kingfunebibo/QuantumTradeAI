/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 2: Portfolio Synchronization Contracts
 *
 * Defines the deterministic contracts shared by portfolio synchronization
 * providers, coordinators, repositories, runtimes, reconciliation engines,
 * event publishers, and production orchestration components.
 */

import type {
  LivePortfolio,
  LivePortfolioAccountType,
  LivePortfolioAssetBalance,
  LivePortfolioCollateral,
  LivePortfolioExchangeAccount,
  LivePortfolioInstrumentType,
  LivePortfolioMarginMode,
  LivePortfolioMetadata,
  LivePortfolioOpenOrderExposure,
  LivePortfolioPosition,
  LivePortfolioPositionMode,
  LivePortfolioPositionSide,
  LivePortfolioSynchronizationStatus,
} from "./live-portfolio";

/**
 * Uniquely identifies one exchange account participating in portfolio
 * synchronization.
 */
export interface PortfolioSynchronizationAccountReference {
  readonly exchangeId: string;
  readonly accountId: string;
  readonly accountType: LivePortfolioAccountType;
}

/**
 * Deterministic synchronization context supplied to every synchronization
 * operation.
 *
 * Time values are injected by the caller. Implementations must not call
 * Date.now() or generate random identifiers internally.
 */
export interface PortfolioSynchronizationContext {
  readonly synchronizationId: string;
  readonly portfolioId: string;
  readonly requestedAt: number;
  readonly effectiveAt: number;
  readonly sequence: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Defines which parts of an exchange account should be synchronized.
 */
export interface PortfolioSynchronizationScope {
  readonly includeBalances: boolean;
  readonly includePositions: boolean;
  readonly includeOpenOrders: boolean;
  readonly includeCollateral: boolean;
  readonly includeMargin: boolean;
}

/**
 * Configuration controlling synchronization behavior.
 */
export interface PortfolioSynchronizationOptions {
  readonly scope: PortfolioSynchronizationScope;

  /**
   * Maximum accepted age of a provider snapshot, in milliseconds.
   */
  readonly maximumSnapshotAgeMs: number;

  /**
   * Whether unavailable optional account sections may be omitted.
   */
  readonly allowPartialSnapshots: boolean;

  /**
   * Whether synchronization should fail when an account returns no balances.
   */
  readonly requireBalances: boolean;

  /**
   * Whether synchronization should fail when an account returns no positions.
   */
  readonly requirePositions: boolean;

  /**
   * Optional deterministic provider timeout budget.
   *
   * This is a contract value only. Implementations remain responsible for
   * enforcing the timeout without introducing nondeterministic state changes.
   */
  readonly providerTimeoutMs: number | null;
}

/**
 * Request to synchronize a complete live portfolio.
 */
export interface PortfolioSynchronizationRequest {
  readonly context: PortfolioSynchronizationContext;
  readonly accounts: readonly PortfolioSynchronizationAccountReference[];
  readonly options: PortfolioSynchronizationOptions;
}

/**
 * Request to synchronize one exchange account.
 */
export interface ExchangeAccountSynchronizationRequest {
  readonly context: PortfolioSynchronizationContext;
  readonly account: PortfolioSynchronizationAccountReference;
  readonly options: PortfolioSynchronizationOptions;
}

/**
 * Raw normalized balance record supplied by an exchange synchronization
 * provider.
 *
 * The exchange-specific adapter must normalize its native response into this
 * structure before the portfolio synchronization subsystem consumes it.
 */
export interface ExchangeBalanceRecord {
  readonly asset: string;
  readonly total: number;
  readonly available: number;
  readonly locked: number;
  readonly borrowed: number;
  readonly interest: number;
  readonly capturedAt: number;
  readonly updatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Raw normalized position record supplied by an exchange synchronization
 * provider.
 */
export interface ExchangePositionRecord {
  readonly positionId: string;
  readonly symbol: string;
  readonly exchangeSymbol: string | null;
  readonly instrumentType: LivePortfolioInstrumentType;

  readonly side: LivePortfolioPositionSide;
  readonly positionMode: LivePortfolioPositionMode;
  readonly marginMode: LivePortfolioMarginMode;

  readonly quantity: number;
  readonly averageEntryPrice: number;

  readonly markPrice: number | null;
  readonly indexPrice: number | null;
  readonly liquidationPrice: number | null;

  readonly contractMultiplier: number;
  readonly leverage: number;

  readonly initialMargin: number;
  readonly maintenanceMargin: number;
  readonly isolatedMargin: number | null;
  readonly collateralAllocated: number;

  readonly realizedPnl: number;
  readonly fundingPnl: number;
  readonly feePnl: number;

  readonly openedAt: number | null;
  readonly capturedAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Raw normalized open-order record used to calculate reserved capital and
 * prospective exposure.
 */
export interface ExchangeOpenOrderRecord {
  readonly orderId: string;
  readonly clientOrderId: string | null;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side: "BUY" | "SELL";
  readonly orderType: string;

  readonly originalQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;

  readonly limitPrice: number | null;
  readonly estimatedPrice: number | null;

  readonly reduceOnly: boolean;

  readonly createdAt: number;
  readonly updatedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Raw normalized collateral record supplied by an exchange synchronization
 * provider.
 */
export interface ExchangeCollateralRecord {
  readonly asset: string;

  readonly totalQuantity: number;
  readonly availableQuantity: number;
  readonly lockedQuantity: number;

  readonly collateralPrice: number | null;
  readonly collateralWeight: number;

  readonly initialMarginContribution: number;
  readonly maintenanceMarginContribution: number;

  readonly capturedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Raw normalized margin data supplied by an exchange synchronization provider.
 */
export interface ExchangeMarginRecord {
  readonly totalCollateralValue: number;
  readonly weightedCollateralValue: number;

  readonly initialMarginRequirement: number;
  readonly maintenanceMarginRequirement: number;

  readonly marginUsed: number;
  readonly availableMargin: number;
  readonly marginBalance: number;

  readonly capturedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Complete normalized exchange-account snapshot returned by a synchronization
 * provider.
 */
export interface ExchangeAccountPortfolioSnapshot {
  readonly snapshotId: string;

  readonly exchangeId: string;
  readonly accountId: string;
  readonly accountType: LivePortfolioAccountType;

  readonly balances: readonly ExchangeBalanceRecord[];
  readonly positions: readonly ExchangePositionRecord[];
  readonly openOrders: readonly ExchangeOpenOrderRecord[];
  readonly collateral: readonly ExchangeCollateralRecord[];
  readonly margin: ExchangeMarginRecord | null;

  readonly capturedAt: number;
  readonly receivedAt: number;
  readonly sequence: number;

  readonly isPartial: boolean;
  readonly unavailableSections: readonly PortfolioSnapshotSection[];

  readonly metadata: LivePortfolioMetadata;
}

export type PortfolioSnapshotSection =
  | "BALANCES"
  | "POSITIONS"
  | "OPEN_ORDERS"
  | "COLLATERAL"
  | "MARGIN";

/**
 * Provider capable of retrieving one normalized exchange-account portfolio
 * snapshot.
 */
export interface ExchangePortfolioSnapshotProvider {
  readonly exchangeId: string;

  synchronizeAccount(
    request: ExchangeAccountSynchronizationRequest,
  ): Promise<ExchangeAccountPortfolioSnapshot>;
}

/**
 * Registry used to resolve exchange portfolio snapshot providers.
 */
export interface ExchangePortfolioSnapshotProviderRegistry {
  register(provider: ExchangePortfolioSnapshotProvider): void;

  unregister(exchangeId: string): boolean;

  has(exchangeId: string): boolean;

  get(exchangeId: string): ExchangePortfolioSnapshotProvider;

  list(): readonly ExchangePortfolioSnapshotProvider[];
}

/**
 * Result status for one exchange-account synchronization operation.
 */
export type ExchangeAccountSynchronizationResultStatus =
  | "SYNCHRONIZED"
  | "PARTIALLY_SYNCHRONIZED"
  | "FAILED"
  | "SKIPPED";

/**
 * Stable failure classifications for deterministic error handling and tests.
 */
export type PortfolioSynchronizationFailureCode =
  | "INVALID_REQUEST"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_FAILED"
  | "PROVIDER_TIMEOUT"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_STALE"
  | "SNAPSHOT_ACCOUNT_MISMATCH"
  | "SNAPSHOT_SEQUENCE_INVALID"
  | "REQUIRED_SECTION_MISSING"
  | "AGGREGATION_FAILED"
  | "RECONCILIATION_FAILED"
  | "REPOSITORY_FAILED"
  | "EVENT_PUBLICATION_FAILED"
  | "SYNCHRONIZATION_ABORTED"
  | "UNKNOWN";

/**
 * Structured deterministic synchronization failure.
 */
export interface PortfolioSynchronizationFailure {
  readonly code: PortfolioSynchronizationFailureCode;
  readonly message: string;

  readonly exchangeId: string | null;
  readonly accountId: string | null;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Result for synchronizing a single exchange account.
 */
export interface ExchangeAccountSynchronizationResult {
  readonly synchronizationId: string;
  readonly portfolioId: string;

  readonly exchangeId: string;
  readonly accountId: string;
  readonly accountType: LivePortfolioAccountType;

  readonly status: ExchangeAccountSynchronizationResultStatus;

  readonly snapshot: ExchangeAccountPortfolioSnapshot | null;
  readonly failure: PortfolioSynchronizationFailure | null;

  readonly startedAt: number;
  readonly completedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Normalized portfolio data produced from one exchange account snapshot.
 */
export interface NormalizedExchangePortfolioState {
  readonly exchangeAccount: LivePortfolioExchangeAccount;

  readonly balances: readonly LivePortfolioAssetBalance[];
  readonly positions: readonly LivePortfolioPosition[];
  readonly openOrderExposures: readonly LivePortfolioOpenOrderExposure[];
  readonly collateral: readonly LivePortfolioCollateral[];

  readonly sourceSnapshotId: string;
  readonly capturedAt: number;
  readonly normalizedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Normalizes raw exchange-account snapshots into immutable live portfolio
 * domain objects.
 */
export interface ExchangePortfolioSnapshotNormalizer {
  normalize(
    snapshot: ExchangeAccountPortfolioSnapshot,
    context: PortfolioSynchronizationContext,
  ): NormalizedExchangePortfolioState;
}

/**
 * Input used by the portfolio aggregation engine.
 */
export interface PortfolioAggregationRequest {
  readonly currentPortfolio: LivePortfolio;
  readonly synchronizedAccounts: readonly NormalizedExchangePortfolioState[];
  readonly failedAccounts: readonly ExchangeAccountSynchronizationResult[];
  readonly context: PortfolioSynchronizationContext;
}

/**
 * Output produced by portfolio aggregation before reconciliation and
 * persistence.
 */
export interface PortfolioAggregationResult {
  readonly portfolio: LivePortfolio;

  readonly synchronizedAccountCount: number;
  readonly failedAccountCount: number;
  readonly staleAccountCount: number;

  readonly aggregatedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Aggregates normalized exchange account states into one cross-exchange live
 * portfolio.
 */
export interface PortfolioAggregationEngine {
  aggregate(
    request: PortfolioAggregationRequest,
  ): PortfolioAggregationResult;
}

/**
 * Reconciliation difference category.
 */
export type PortfolioReconciliationDifferenceType =
  | "MISSING_EXCHANGE_ACCOUNT"
  | "UNEXPECTED_EXCHANGE_ACCOUNT"
  | "BALANCE_ADDED"
  | "BALANCE_REMOVED"
  | "BALANCE_CHANGED"
  | "POSITION_OPENED"
  | "POSITION_CLOSED"
  | "POSITION_CHANGED"
  | "OPEN_ORDER_ADDED"
  | "OPEN_ORDER_REMOVED"
  | "OPEN_ORDER_CHANGED"
  | "COLLATERAL_ADDED"
  | "COLLATERAL_REMOVED"
  | "COLLATERAL_CHANGED"
  | "MARGIN_CHANGED"
  | "VALUATION_CHANGED"
  | "EXPOSURE_CHANGED"
  | "PNL_CHANGED";

/**
 * Severity assigned to a reconciliation difference.
 */
export type PortfolioReconciliationDifferenceSeverity =
  | "INFORMATIONAL"
  | "WARNING"
  | "CRITICAL";

/**
 * One deterministic difference between the current portfolio and a newly
 * aggregated portfolio.
 */
export interface PortfolioReconciliationDifference {
  readonly differenceId: string;
  readonly type: PortfolioReconciliationDifferenceType;
  readonly severity: PortfolioReconciliationDifferenceSeverity;

  readonly exchangeId: string | null;
  readonly accountId: string | null;
  readonly entityId: string | null;

  readonly field: string | null;
  readonly previousValue: string | number | boolean | null;
  readonly currentValue: string | number | boolean | null;

  readonly detectedAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Reconciliation request comparing the persisted portfolio with the newly
 * aggregated portfolio.
 */
export interface PortfolioReconciliationRequest {
  readonly currentPortfolio: LivePortfolio;
  readonly synchronizedPortfolio: LivePortfolio;
  readonly context: PortfolioSynchronizationContext;
}

/**
 * Reconciliation output.
 */
export interface PortfolioReconciliationResult {
  readonly reconciledPortfolio: LivePortfolio;
  readonly differences: readonly PortfolioReconciliationDifference[];

  readonly hasDifferences: boolean;
  readonly hasCriticalDifferences: boolean;

  readonly reconciledAt: number;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Reconciles newly synchronized portfolio state against the previously
 * persisted portfolio.
 */
export interface PortfolioReconciliationEngine {
  reconcile(
    request: PortfolioReconciliationRequest,
  ): PortfolioReconciliationResult;
}

/**
 * Persistence contract for immutable live portfolio state.
 */
export interface LivePortfolioRepository {
  save(portfolio: LivePortfolio): Promise<LivePortfolio>;

  findById(portfolioId: string): Promise<LivePortfolio | null>;

  exists(portfolioId: string): Promise<boolean>;

  delete(portfolioId: string): Promise<boolean>;

  list(): Promise<readonly LivePortfolio[]>;
}

/**
 * Portfolio synchronization event type.
 */
export type PortfolioSynchronizationEventType =
  | "PORTFOLIO_SYNCHRONIZATION_REQUESTED"
  | "PORTFOLIO_SYNCHRONIZATION_STARTED"
  | "EXCHANGE_ACCOUNT_SYNCHRONIZATION_STARTED"
  | "EXCHANGE_ACCOUNT_SYNCHRONIZED"
  | "EXCHANGE_ACCOUNT_SYNCHRONIZATION_FAILED"
  | "PORTFOLIO_AGGREGATED"
  | "PORTFOLIO_RECONCILED"
  | "PORTFOLIO_PERSISTED"
  | "PORTFOLIO_SYNCHRONIZATION_COMPLETED"
  | "PORTFOLIO_SYNCHRONIZATION_PARTIALLY_COMPLETED"
  | "PORTFOLIO_SYNCHRONIZATION_FAILED";

/**
 * Immutable event emitted during portfolio synchronization.
 */
export interface PortfolioSynchronizationEvent {
  readonly eventId: string;
  readonly type: PortfolioSynchronizationEventType;

  readonly synchronizationId: string;
  readonly portfolioId: string;

  readonly exchangeId: string | null;
  readonly accountId: string | null;

  readonly occurredAt: number;
  readonly sequence: number;

  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: LivePortfolioMetadata;
}

/**
 * Event repository for synchronization audit history.
 */
export interface PortfolioSynchronizationEventRepository {
  append(
    event: PortfolioSynchronizationEvent,
  ): Promise<PortfolioSynchronizationEvent>;

  appendMany(
    events: readonly PortfolioSynchronizationEvent[],
  ): Promise<readonly PortfolioSynchronizationEvent[]>;

  findByPortfolioId(
    portfolioId: string,
  ): Promise<readonly PortfolioSynchronizationEvent[]>;

  findBySynchronizationId(
    synchronizationId: string,
  ): Promise<readonly PortfolioSynchronizationEvent[]>;

  list(): Promise<readonly PortfolioSynchronizationEvent[]>;

  clear(): Promise<void>;
}

/**
 * Publisher contract for portfolio synchronization events.
 */
export interface PortfolioSynchronizationEventPublisher {
  publish(event: PortfolioSynchronizationEvent): Promise<void>;

  publishMany(
    events: readonly PortfolioSynchronizationEvent[],
  ): Promise<void>;
}

/**
 * Overall portfolio synchronization result status.
 */
export type PortfolioSynchronizationResultStatus =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED";

/**
 * Final result returned by the production synchronization engine.
 */
export interface PortfolioSynchronizationResult {
  readonly synchronizationId: string;
  readonly portfolioId: string;

  readonly status: PortfolioSynchronizationResultStatus;

  readonly portfolio: LivePortfolio | null;

  readonly accountResults:
    readonly ExchangeAccountSynchronizationResult[];

  readonly reconciliation:
    PortfolioReconciliationResult | null;

  readonly failures:
    readonly PortfolioSynchronizationFailure[];

  readonly events:
    readonly PortfolioSynchronizationEvent[];

  readonly startedAt: number;
  readonly completedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

/**
 * Production portfolio synchronization engine contract.
 */
export interface PortfolioSynchronizationEngine {
  synchronize(
    request: PortfolioSynchronizationRequest,
  ): Promise<PortfolioSynchronizationResult>;
}

/**
 * Runtime dependencies used to execute deterministic portfolio
 * synchronization.
 */
export interface PortfolioSynchronizationRuntimeDependencies {
  readonly providerRegistry:
    ExchangePortfolioSnapshotProviderRegistry;

  readonly snapshotNormalizer:
    ExchangePortfolioSnapshotNormalizer;

  readonly aggregationEngine:
    PortfolioAggregationEngine;

  readonly reconciliationEngine:
    PortfolioReconciliationEngine;

  readonly portfolioRepository:
    LivePortfolioRepository;

  readonly eventRepository:
    PortfolioSynchronizationEventRepository;

  readonly eventPublisher:
    PortfolioSynchronizationEventPublisher | null;
}

/**
 * Runtime contract coordinating the synchronization workflow.
 */
export interface PortfolioSynchronizationRuntime {
  execute(
    request: PortfolioSynchronizationRequest,
  ): Promise<PortfolioSynchronizationResult>;
}

/**
 * Coordinator contract for synchronizing multiple exchange accounts.
 */
export interface ExchangeSynchronizationCoordinator {
  synchronizeAccounts(
    request: PortfolioSynchronizationRequest,
  ): Promise<readonly ExchangeAccountSynchronizationResult[]>;
}

/**
 * Result of validating a synchronization request.
 */
export interface PortfolioSynchronizationValidationResult {
  readonly valid: boolean;
  readonly errors: readonly PortfolioSynchronizationValidationError[];
}

/**
 * One deterministic validation error.
 */
export interface PortfolioSynchronizationValidationError {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/**
 * Synchronization request validator.
 */
export interface PortfolioSynchronizationValidator {
  validate(
    request: PortfolioSynchronizationRequest,
  ): PortfolioSynchronizationValidationResult;

  assertValid(
    request: PortfolioSynchronizationRequest,
  ): void;
}

/**
 * Factory input for constructing an exchange account's synchronization status
 * after a provider operation.
 */
export interface CreateSynchronizedExchangeAccountInput {
  readonly account:
    PortfolioSynchronizationAccountReference;

  readonly status:
    LivePortfolioSynchronizationStatus;

  readonly successfulAt: number | null;
  readonly attemptedAt: number;

  readonly failure:
    PortfolioSynchronizationFailure | null;

  readonly metadata:
    LivePortfolioMetadata;
}

/**
 * Deterministic event factory contract.
 *
 * Identifiers and sequence numbers must be supplied by the caller or derived
 * deterministically from the synchronization context.
 */
export interface PortfolioSynchronizationEventFactory {
  create(
    event: PortfolioSynchronizationEvent,
  ): PortfolioSynchronizationEvent;
}

/**
 * Utility contract for checking whether a provider snapshot is stale.
 */
export interface PortfolioSnapshotFreshnessPolicy {
  isStale(
    snapshot: ExchangeAccountPortfolioSnapshot,
    effectiveAt: number,
    maximumSnapshotAgeMs: number,
  ): boolean;
}

/**
 * Default synchronization scope.
 */
export const DEFAULT_PORTFOLIO_SYNCHRONIZATION_SCOPE:
  PortfolioSynchronizationScope = Object.freeze({
    includeBalances: true,
    includePositions: true,
    includeOpenOrders: true,
    includeCollateral: true,
    includeMargin: true,
  });

/**
 * Creates immutable default synchronization options.
 */
export function createDefaultPortfolioSynchronizationOptions():
PortfolioSynchronizationOptions {
  return Object.freeze({
    scope: DEFAULT_PORTFOLIO_SYNCHRONIZATION_SCOPE,
    maximumSnapshotAgeMs: 30_000,
    allowPartialSnapshots: false,
    requireBalances: true,
    requirePositions: false,
    providerTimeoutMs: null,
  });
}