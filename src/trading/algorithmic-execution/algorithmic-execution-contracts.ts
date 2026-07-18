export type AlgorithmicExecutionAlgorithm =
  | "TWAP"
  | "VWAP"
  | "ICEBERG"
  | "POV"
  | "ADAPTIVE";

export type AlgorithmicExecutionSide =
  | "BUY"
  | "SELL";

export type AlgorithmicExecutionOrderType =
  | "MARKET"
  | "LIMIT";

export type AlgorithmicExecutionTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "POST_ONLY";

export type AlgorithmicExecutionUrgency =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "IMMEDIATE";

export type AlgorithmicExecutionStatus =
  | "CREATED"
  | "VALIDATED"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type AlgorithmicExecutionSliceStatus =
  | "PENDING"
  | "READY"
  | "SUBMITTING"
  | "SUBMITTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "SKIPPED"
  | "FAILED";

export type AlgorithmicExecutionCompletionReason =
  | "TARGET_QUANTITY_FILLED"
  | "END_TIME_REACHED"
  | "CANCELLED_BY_USER"
  | "INSUFFICIENT_LIQUIDITY"
  | "MAXIMUM_SLIPPAGE_EXCEEDED"
  | "MAXIMUM_DURATION_EXCEEDED"
  | "EXECUTION_FAILED"
  | "NO_REMAINING_QUANTITY";

export type AlgorithmicExecutionPauseReason =
  | "USER_REQUEST"
  | "MARKET_DATA_UNAVAILABLE"
  | "ROUTING_UNAVAILABLE"
  | "RISK_REJECTION"
  | "VOLATILITY_LIMIT"
  | "LIQUIDITY_LIMIT"
  | "PRICE_LIMIT"
  | "SYSTEM_RECOVERY";

export type AlgorithmicExecutionChildOrderStatus =
  | "CREATED"
  | "SUBMITTING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLING"
  | "CANCELLED"
  | "REJECTED"
  | "FAILED";

export type AlgorithmicExecutionEventType =
  | "EXECUTION_CREATED"
  | "EXECUTION_VALIDATED"
  | "EXECUTION_SCHEDULED"
  | "EXECUTION_STARTED"
  | "EXECUTION_PAUSED"
  | "EXECUTION_RESUMED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_CANCELLED"
  | "EXECUTION_FAILED"
  | "SLICE_CREATED"
  | "SLICE_READY"
  | "SLICE_SUBMITTED"
  | "SLICE_PARTIALLY_FILLED"
  | "SLICE_FILLED"
  | "SLICE_CANCELLED"
  | "SLICE_SKIPPED"
  | "SLICE_FAILED"
  | "CHILD_ORDER_CREATED"
  | "CHILD_ORDER_SUBMITTED"
  | "CHILD_ORDER_PARTIALLY_FILLED"
  | "CHILD_ORDER_FILLED"
  | "CHILD_ORDER_CANCELLED"
  | "CHILD_ORDER_REJECTED"
  | "CHILD_ORDER_FAILED"
  | "SCHEDULE_REBUILT"
  | "RECOVERY_STARTED"
  | "RECOVERY_COMPLETED";

export type AlgorithmicExecutionMetadataValue =
  | string
  | number
  | boolean
  | null;

export type AlgorithmicExecutionMetadata =
  Readonly<
    Record<
      string,
      AlgorithmicExecutionMetadataValue
    >
  >;

export interface AlgorithmicExecutionPriceLimit {
  readonly minimumPrice: number | null;
  readonly maximumPrice: number | null;
}

export interface AlgorithmicExecutionSlippageLimit {
  readonly maximumSlippageBps: number | null;
  readonly referencePrice: number | null;
}

export interface AlgorithmicExecutionParticipationLimit {
  readonly minimumParticipationRate: number | null;
  readonly targetParticipationRate: number | null;
  readonly maximumParticipationRate: number | null;
}

export interface AlgorithmicExecutionVenueConstraint {
  readonly exchangeId: string;
  readonly accountId: string | null;

  readonly enabled: boolean;

  readonly maximumQuantity: number | null;
  readonly maximumNotional: number | null;

  readonly priority: number | null;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionInstruction {
  readonly executionId: string;

  readonly algorithm:
    AlgorithmicExecutionAlgorithm;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side:
    AlgorithmicExecutionSide;

  readonly orderType:
    AlgorithmicExecutionOrderType;

  readonly timeInForce:
    AlgorithmicExecutionTimeInForce;

  readonly totalQuantity: number;

  readonly limitPrice: number | null;

  readonly startTime: number;
  readonly endTime: number;

  readonly urgency:
    AlgorithmicExecutionUrgency;

  readonly allowPartialCompletion: boolean;

  readonly minimumChildOrderQuantity:
    number | null;

  readonly maximumChildOrderQuantity:
    number | null;

  readonly minimumSliceIntervalMilliseconds:
    number | null;

  readonly maximumSliceIntervalMilliseconds:
    number | null;

  readonly maximumActiveChildOrders:
    number;

  readonly priceLimit:
    AlgorithmicExecutionPriceLimit;

  readonly slippageLimit:
    AlgorithmicExecutionSlippageLimit;

  readonly participationLimit:
    AlgorithmicExecutionParticipationLimit;

  readonly venueConstraints:
    readonly AlgorithmicExecutionVenueConstraint[];

  readonly createdAt: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionValidationIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export interface AlgorithmicExecutionValidationResult {
  readonly valid: boolean;

  readonly errors:
    readonly AlgorithmicExecutionValidationIssue[];

  readonly warnings:
    readonly AlgorithmicExecutionValidationIssue[];
}

export interface AlgorithmicExecutionSlice {
  readonly sliceId: string;
  readonly executionId: string;

  readonly sequence: number;

  readonly scheduledAt: number;
  readonly expiresAt: number | null;

  readonly targetQuantity: number;

  readonly minimumQuantity: number | null;
  readonly maximumQuantity: number | null;

  readonly status:
    AlgorithmicExecutionSliceStatus;

  readonly submittedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;

  readonly averageFillPrice: number | null;

  readonly childOrderIds:
    readonly string[];

  readonly createdAt: number;
  readonly updatedAt: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionSchedule {
  readonly scheduleId: string;
  readonly executionId: string;

  readonly algorithm:
    AlgorithmicExecutionAlgorithm;

  readonly startTime: number;
  readonly endTime: number;

  readonly targetQuantity: number;

  readonly slices:
    readonly AlgorithmicExecutionSlice[];

  readonly totalScheduledQuantity: number;

  readonly createdAt: number;
  readonly version: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionFill {
  readonly fillId: string;

  readonly executionId: string;
  readonly sliceId: string;
  readonly childOrderId: string;

  readonly exchangeId: string;
  readonly accountId: string | null;

  readonly exchangeOrderId: string | null;
  readonly exchangeTradeId: string | null;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side:
    AlgorithmicExecutionSide;

  readonly quantity: number;
  readonly price: number;
  readonly notional: number;

  readonly fee: number;
  readonly feeAsset: string | null;

  readonly occurredAt: number;
  readonly receivedAt: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionChildOrder {
  readonly childOrderId: string;

  readonly executionId: string;
  readonly sliceId: string;

  readonly clientOrderId: string;

  readonly exchangeId: string;
  readonly accountId: string | null;

  readonly exchangeOrderId: string | null;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side:
    AlgorithmicExecutionSide;

  readonly orderType:
    AlgorithmicExecutionOrderType;

  readonly timeInForce:
    AlgorithmicExecutionTimeInForce;

  readonly quantity: number;
  readonly limitPrice: number | null;

  readonly status:
    AlgorithmicExecutionChildOrderStatus;

  readonly submittedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;

  readonly averageFillPrice: number | null;

  readonly createdAt: number;
  readonly submittedAt: number | null;
  readonly completedAt: number | null;
  readonly updatedAt: number;

  readonly failureCode: string | null;
  readonly failureMessage: string | null;

  readonly fills:
    readonly AlgorithmicExecutionFill[];

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionProgress {
  readonly executionId: string;

  readonly targetQuantity: number;
  readonly scheduledQuantity: number;
  readonly submittedQuantity: number;
  readonly filledQuantity: number;
  readonly remainingQuantity: number;

  readonly completionRatio: number;

  readonly elapsedMilliseconds: number;
  readonly remainingMilliseconds: number;

  readonly scheduledSliceCount: number;
  readonly completedSliceCount: number;
  readonly failedSliceCount: number;

  readonly activeChildOrderCount: number;
  readonly completedChildOrderCount: number;
  readonly failedChildOrderCount: number;

  readonly averageFillPrice: number | null;
  readonly filledNotional: number;

  readonly estimatedArrivalPrice: number | null;
  readonly implementationShortfallBps: number | null;

  readonly updatedAt: number;
}

export interface AlgorithmicExecutionState {
  readonly executionId: string;

  readonly instruction:
    AlgorithmicExecutionInstruction;

  readonly status:
    AlgorithmicExecutionStatus;

  readonly schedule:
    AlgorithmicExecutionSchedule | null;

  readonly childOrders:
    readonly AlgorithmicExecutionChildOrder[];

  readonly fills:
    readonly AlgorithmicExecutionFill[];

  readonly progress:
    AlgorithmicExecutionProgress;

  readonly pauseReason:
    AlgorithmicExecutionPauseReason | null;

  readonly completionReason:
    AlgorithmicExecutionCompletionReason | null;

  readonly failureCode: string | null;
  readonly failureMessage: string | null;

  readonly createdAt: number;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly updatedAt: number;

  readonly version: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionEvent {
  readonly eventId: string;

  readonly executionId: string;
  readonly sliceId: string | null;
  readonly childOrderId: string | null;

  readonly type:
    AlgorithmicExecutionEventType;

  readonly occurredAt: number;

  readonly sequence: number;

  readonly payload:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionMarketSnapshot {
  readonly symbol: string;

  readonly bestBid: number | null;
  readonly bestAsk: number | null;
  readonly midPrice: number | null;

  readonly lastPrice: number | null;

  readonly bidQuantity: number;
  readonly askQuantity: number;

  readonly recentMarketVolume: number;
  readonly recentMarketBuyVolume: number;
  readonly recentMarketSellVolume: number;

  readonly volatilityBps: number | null;
  readonly spreadBps: number | null;

  readonly capturedAt: number;
  readonly expiresAt: number | null;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionVolumeProfilePoint {
  readonly intervalStart: number;
  readonly intervalEnd: number;

  readonly expectedVolume: number;
  readonly expectedVolumeRatio: number;
}

export interface AlgorithmicExecutionVolumeProfile {
  readonly profileId: string;

  readonly symbol: string;

  readonly startTime: number;
  readonly endTime: number;

  readonly points:
    readonly AlgorithmicExecutionVolumeProfilePoint[];

  readonly totalExpectedVolume: number;

  readonly createdAt: number;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionScheduleContext {
  readonly instruction:
    AlgorithmicExecutionInstruction;

  readonly marketSnapshot:
    AlgorithmicExecutionMarketSnapshot | null;

  readonly volumeProfile:
    AlgorithmicExecutionVolumeProfile | null;

  readonly currentTime: number;
}

export interface AlgorithmicExecutionScheduler {
  createSchedule(
    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule;

  rebuildSchedule(
    state:
      AlgorithmicExecutionState,

    context:
      AlgorithmicExecutionScheduleContext,
  ): AlgorithmicExecutionSchedule;
}

export interface AlgorithmicExecutionInstructionValidator {
  validate(
    instruction:
      AlgorithmicExecutionInstruction,
  ): AlgorithmicExecutionValidationResult;
}

export interface AlgorithmicExecutionClock {
  now(): number;
}

export interface AlgorithmicExecutionIdentifierGenerator {
  nextId(prefix: string): string;
}

export interface AlgorithmicExecutionStateRepository {
  save(
    state:
      AlgorithmicExecutionState,
  ): Promise<void>;

  findByExecutionId(
    executionId: string,
  ): Promise<
    AlgorithmicExecutionState | null
  >;

  delete(
    executionId: string,
  ): Promise<void>;
}

export interface AlgorithmicExecutionEventRepository {
  append(
    event:
      AlgorithmicExecutionEvent,
  ): Promise<void>;

  findByExecutionId(
    executionId: string,
  ): Promise<
    readonly AlgorithmicExecutionEvent[]
  >;
}

export interface AlgorithmicExecutionChildOrderSubmission {
  readonly childOrderId: string;
  readonly executionId: string;
  readonly sliceId: string;

  readonly clientOrderId: string;

  readonly symbol: string;
  readonly exchangeSymbol: string | null;

  readonly side:
    AlgorithmicExecutionSide;

  readonly orderType:
    AlgorithmicExecutionOrderType;

  readonly timeInForce:
    AlgorithmicExecutionTimeInForce;

  readonly quantity: number;
  readonly limitPrice: number | null;

  readonly preferredExchangeIds:
    readonly string[];

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionChildOrderSubmissionResult {
  readonly accepted: boolean;

  readonly exchangeId: string | null;
  readonly accountId: string | null;

  readonly exchangeOrderId: string | null;

  readonly submittedAt: number | null;

  readonly rejectionCode: string | null;
  readonly rejectionMessage: string | null;

  readonly metadata:
    AlgorithmicExecutionMetadata;
}

export interface AlgorithmicExecutionChildOrderGateway {
  submit(
    submission:
      AlgorithmicExecutionChildOrderSubmission,
  ): Promise<
    AlgorithmicExecutionChildOrderSubmissionResult
  >;

  cancel(
    childOrder:
      AlgorithmicExecutionChildOrder,
  ): Promise<void>;
}

export interface AlgorithmicExecutionMarketDataProvider {
  getSnapshot(
    symbol: string,
  ): Promise<
    AlgorithmicExecutionMarketSnapshot | null
  >;
}

export interface AlgorithmicExecutionVolumeProfileProvider {
  getVolumeProfile(
    symbol: string,
    startTime: number,
    endTime: number,
  ): Promise<
    AlgorithmicExecutionVolumeProfile | null
  >;
}

export interface AlgorithmicExecutionCreateRequest {
  readonly instruction:
    AlgorithmicExecutionInstruction;
}

export interface AlgorithmicExecutionCreateResult {
  readonly created: boolean;

  readonly state:
    AlgorithmicExecutionState | null;

  readonly validation:
    AlgorithmicExecutionValidationResult;
}

export interface AlgorithmicExecutionStartRequest {
  readonly executionId: string;
  readonly startedAt: number | null;
}

export interface AlgorithmicExecutionPauseRequest {
  readonly executionId: string;

  readonly reason:
    AlgorithmicExecutionPauseReason;

  readonly pausedAt: number | null;
}

export interface AlgorithmicExecutionResumeRequest {
  readonly executionId: string;
  readonly resumedAt: number | null;
}

export interface AlgorithmicExecutionCancelRequest {
  readonly executionId: string;
  readonly cancelledAt: number | null;
}

export interface AlgorithmicExecutionProcessRequest {
  readonly executionId: string;
  readonly currentTime: number | null;
}

export interface AlgorithmicExecutionProcessResult {
  readonly state:
    AlgorithmicExecutionState;

  readonly submittedChildOrders:
    readonly AlgorithmicExecutionChildOrder[];

  readonly emittedEvents:
    readonly AlgorithmicExecutionEvent[];
}

export function createEmptyAlgorithmicExecutionMetadata():
  AlgorithmicExecutionMetadata {
  return Object.freeze({});
}

export function freezeAlgorithmicExecutionMetadata(
  metadata:
    AlgorithmicExecutionMetadata | undefined,
): AlgorithmicExecutionMetadata {
  if (metadata === undefined) {
    return createEmptyAlgorithmicExecutionMetadata();
  }

  return Object.freeze({
    ...metadata,
  });
}

export function clampAlgorithmicExecutionRatio(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  );
}

export function calculateAlgorithmicExecutionNotional(
  quantity: number,
  price: number,
): number {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(price)
  ) {
    return 0;
  }

  return quantity * price;
}

export function calculateAlgorithmicExecutionRemainingQuantity(
  targetQuantity: number,
  filledQuantity: number,
): number {
  if (
    !Number.isFinite(targetQuantity) ||
    !Number.isFinite(filledQuantity)
  ) {
    return 0;
  }

  return Math.max(
    0,
    targetQuantity -
      filledQuantity,
  );
}

export function createInitialAlgorithmicExecutionProgress(
  input: {
    readonly executionId: string;

    readonly targetQuantity: number;

    readonly startTime: number;
    readonly endTime: number;

    readonly currentTime: number;
  },
): AlgorithmicExecutionProgress {
  const elapsedMilliseconds =
    Math.max(
      0,
      input.currentTime -
        input.startTime,
    );

  const remainingMilliseconds =
    Math.max(
      0,
      input.endTime -
        input.currentTime,
    );

  return Object.freeze({
    executionId:
      input.executionId,

    targetQuantity:
      input.targetQuantity,

    scheduledQuantity: 0,
    submittedQuantity: 0,
    filledQuantity: 0,

    remainingQuantity:
      input.targetQuantity,

    completionRatio: 0,

    elapsedMilliseconds,
    remainingMilliseconds,

    scheduledSliceCount: 0,
    completedSliceCount: 0,
    failedSliceCount: 0,

    activeChildOrderCount: 0,
    completedChildOrderCount: 0,
    failedChildOrderCount: 0,

    averageFillPrice: null,
    filledNotional: 0,

    estimatedArrivalPrice: null,
    implementationShortfallBps: null,

    updatedAt:
      input.currentTime,
  });
}