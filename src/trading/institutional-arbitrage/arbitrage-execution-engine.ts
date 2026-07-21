/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-execution-engine.ts
 *
 * Purpose:
 * Deterministic, immutable execution of dependency-ordered institutional
 * arbitrage plans through injected trading, transfer, cancellation, and
 * compensation adapters.
 */

import {
  type ArbitrageDecimal,
  type ArbitrageExecutionLegResult,
  type ArbitrageExecutionPlan,
  type ArbitrageExecutionResult,
  type ArbitrageExecutionStatus,
  type ArbitrageId,
  type ArbitrageLeg,
  type ArbitrageLegStatus,
  type ArbitrageMetadata,
  type ArbitrageTimestamp,
  type ArbitrageTransferRequirement,
  type ArbitrageVenueId,
  type InstitutionalArbitrageExecutor,
} from "./institutional-arbitrage-contracts";
import {
  validateArbitrageExecutionPlan,
  validateArbitrageExecutionResult,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
const DEFAULT_CANCELLATION_TIMEOUT_MS = 10_000;
const DEFAULT_COMPENSATION_TIMEOUT_MS = 30_000;
const EPSILON = 1e-8;

export type ArbitrageExecutionEngineErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_OPTION"
  | "INVALID_PLAN"
  | "EXPIRED_PLAN"
  | "UNSUPPORTED_PLAN_STATUS"
  | "MISSING_EXECUTION_ADAPTER"
  | "MISSING_TRANSFER_ADAPTER"
  | "MISSING_CANCELLATION_ADAPTER"
  | "MISSING_COMPENSATION_ADAPTER"
  | "DEPENDENCY_DEADLOCK"
  | "ADAPTER_FAILURE"
  | "INVALID_ADAPTER_RESULT"
  | "INVALID_GENERATED_RESULT";

export class ArbitrageExecutionEngineError extends Error {
  public readonly code: ArbitrageExecutionEngineErrorCode;
  public readonly validationIssues?: ArbitrageValidationResult["issues"];
  public readonly causeValue?: unknown;

  public constructor(
    code: ArbitrageExecutionEngineErrorCode,
    message: string,
    options?: {
      readonly validationIssues?: ArbitrageValidationResult["issues"];
      readonly causeValue?: unknown;
    },
  ) {
    super(message);
    this.name = "ArbitrageExecutionEngineError";
    this.code = code;
    this.validationIssues = options?.validationIssues;
    this.causeValue = options?.causeValue;
  }
}

export interface ArbitrageExecutionClock {
  now(): ArbitrageTimestamp;
}

export interface ArbitrageExecutionTimer {
  delay(milliseconds: number): Promise<void>;
}

export interface ArbitrageExecutionContext {
  readonly executionId: ArbitrageId;
  readonly planId: ArbitrageId;
  readonly opportunityId: ArbitrageId;
  readonly startedAt: ArbitrageTimestamp;
  readonly deadlineAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly reportingAsset: string;
  readonly metadata: ArbitrageMetadata;
}

export type ArbitrageAdapterTerminalStatus =
  | "FILLED"
  | "PARTIALLY_FILLED"
  | "REJECTED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "FAILED";

export interface ArbitrageOrderExecutionRequest {
  readonly executionId: ArbitrageId;
  readonly plan: ArbitrageExecutionPlan;
  readonly leg: ArbitrageLeg;
  readonly dependencyResults: readonly ArbitrageExecutionLegResult[];
  readonly submittedAt: ArbitrageTimestamp;
  readonly deadlineAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageOrderExecutionAdapterResult {
  readonly status: ArbitrageAdapterTerminalStatus;
  readonly submittedQuantity: ArbitrageDecimal;
  readonly filledQuantity: ArbitrageDecimal;
  readonly averageFillPrice?: ArbitrageDecimal;
  readonly actualOutputQuantity?: ArbitrageDecimal;
  readonly actualFees: ArbitrageDecimal;
  readonly grossProfitContribution?: ArbitrageDecimal;
  readonly externalOrderIds?: readonly string[];
  readonly externalTransactionIds?: readonly string[];
  readonly completedAt?: ArbitrageTimestamp;
  readonly failureReason?: string;
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageOrderExecutionAdapter {
  execute(
    request: ArbitrageOrderExecutionRequest,
  ):
    | ArbitrageOrderExecutionAdapterResult
    | Promise<ArbitrageOrderExecutionAdapterResult>;
}

export interface ArbitrageOrderCancellationRequest {
  readonly executionId: ArbitrageId;
  readonly plan: ArbitrageExecutionPlan;
  readonly leg: ArbitrageLeg;
  readonly executionResult: ArbitrageOrderExecutionAdapterResult;
  readonly requestedAt: ArbitrageTimestamp;
  readonly deadlineAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageOrderCancellationResult {
  readonly status: "CANCELLED" | "TIMED_OUT" | "FAILED";
  readonly cancelledQuantity?: ArbitrageDecimal;
  readonly externalOrderIds?: readonly string[];
  readonly completedAt?: ArbitrageTimestamp;
  readonly failureReason?: string;
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageOrderCancellationAdapter {
  cancel(
    request: ArbitrageOrderCancellationRequest,
  ):
    | ArbitrageOrderCancellationResult
    | Promise<ArbitrageOrderCancellationResult>;
}

export interface ArbitrageTransferExecutionRequest {
  readonly executionId: ArbitrageId;
  readonly plan: ArbitrageExecutionPlan;
  readonly transfer: ArbitrageTransferRequirement;
  readonly submittedAt: ArbitrageTimestamp;
  readonly deadlineAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export type ArbitrageTransferExecutionStatus =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "FAILED";

export interface ArbitrageTransferExecutionResult {
  readonly status: ArbitrageTransferExecutionStatus;
  readonly requestedQuantity: ArbitrageDecimal;
  readonly transferredQuantity: ArbitrageDecimal;
  readonly actualFee: ArbitrageDecimal;
  readonly externalTransactionIds?: readonly string[];
  readonly completedAt?: ArbitrageTimestamp;
  readonly failureReason?: string;
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageTransferAdapter {
  executeTransfer(
    request: ArbitrageTransferExecutionRequest,
  ):
    | ArbitrageTransferExecutionResult
    | Promise<ArbitrageTransferExecutionResult>;
}

export interface ArbitrageCompensationRequest {
  readonly executionId: ArbitrageId;
  readonly plan: ArbitrageExecutionPlan;
  readonly leg: ArbitrageLeg;
  readonly originalResult: ArbitrageExecutionLegResult;
  readonly requestedAt: ArbitrageTimestamp;
  readonly deadlineAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageCompensationResult {
  readonly status: "COMPENSATED" | "PARTIALLY_COMPENSATED" | "TIMED_OUT" | "FAILED";
  readonly compensatedQuantity: ArbitrageDecimal;
  readonly actualFees: ArbitrageDecimal;
  readonly grossProfitContribution?: ArbitrageDecimal;
  readonly externalOrderIds?: readonly string[];
  readonly externalTransactionIds?: readonly string[];
  readonly completedAt?: ArbitrageTimestamp;
  readonly failureReason?: string;
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageCompensationAdapter {
  compensate(
    request: ArbitrageCompensationRequest,
  ):
    | ArbitrageCompensationResult
    | Promise<ArbitrageCompensationResult>;
}

export interface ArbitrageExecutionAdapterRegistry {
  getOrderExecutionAdapter(
    venueId: ArbitrageVenueId,
  ): InstitutionalArbitrageOrderExecutionAdapter | undefined;

  getOrderCancellationAdapter?(
    venueId: ArbitrageVenueId,
  ): InstitutionalArbitrageOrderCancellationAdapter | undefined;

  getTransferAdapter?(
    sourceVenueId: ArbitrageVenueId,
    destinationVenueId: ArbitrageVenueId,
  ): InstitutionalArbitrageTransferAdapter | undefined;

  getCompensationAdapter?(
    venueId: ArbitrageVenueId,
  ): InstitutionalArbitrageCompensationAdapter | undefined;
}

export interface ArbitrageExecutionObserver {
  onStatusChanged?(
    status: ArbitrageExecutionStatus,
    context: ArbitrageExecutionContext,
  ): void | Promise<void>;

  onTransferCompleted?(
    transfer: ArbitrageTransferRequirement,
    result: ArbitrageTransferExecutionResult,
    context: ArbitrageExecutionContext,
  ): void | Promise<void>;

  onLegCompleted?(
    leg: ArbitrageLeg,
    result: ArbitrageExecutionLegResult,
    context: ArbitrageExecutionContext,
  ): void | Promise<void>;
}

export interface ArbitrageExecutionEngineOptions {
  readonly clock?: ArbitrageExecutionClock;
  readonly timer?: ArbitrageExecutionTimer;
  readonly observer?: ArbitrageExecutionObserver;
  readonly validateInputs?: boolean;
  readonly decimalPlaces?: number;
  readonly operationTimeoutMs?: number;
  readonly cancellationTimeoutMs?: number;
  readonly compensationTimeoutMs?: number;
  readonly cancelRemainderOnPartialFill?: boolean;
  readonly compensateOnPartialFill?: boolean;
  readonly stopOnTransferFailure?: boolean;
  readonly includeAdapterMetadata?: boolean;
}

interface ResolvedOptions {
  readonly clock: ArbitrageExecutionClock;
  readonly timer: ArbitrageExecutionTimer;
  readonly observer?: ArbitrageExecutionObserver;
  readonly validateInputs: boolean;
  readonly decimalPlaces: number;
  readonly operationTimeoutMs: number;
  readonly cancellationTimeoutMs: number;
  readonly compensationTimeoutMs: number;
  readonly cancelRemainderOnPartialFill: boolean;
  readonly compensateOnPartialFill: boolean;
  readonly stopOnTransferFailure: boolean;
  readonly includeAdapterMetadata: boolean;
}

interface MutableExecutionState {
  status: ArbitrageExecutionStatus;
  readonly legResults: Map<ArbitrageId, ArbitrageExecutionLegResult>;
  readonly grossProfitContributions: Map<ArbitrageId, number>;
  transferFees: number;
  failureReason?: string;
  compensationAttempted: boolean;
  compensationSuccessful: boolean;
  timedOut: boolean;
}

interface TransferRunSummary {
  readonly successful: boolean;
  readonly timedOut: boolean;
  readonly totalFees: number;
  readonly failureReason?: string;
}

class SystemExecutionClock implements ArbitrageExecutionClock {
  public now(): ArbitrageTimestamp {
    return Date.now();
  }
}

class SystemExecutionTimer implements ArbitrageExecutionTimer {
  public delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach((nested) => {
    deepFreeze(nested);
  });

  return value;
}

function assertFinitePositiveInteger(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_OPTION",
      `${name} must be a positive integer.`,
    );
  }
}

function resolveOptions(
  options: ArbitrageExecutionEngineOptions | undefined,
): ResolvedOptions {
  const decimalPlaces = options?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;

  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_OPTION",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }

  const operationTimeoutMs =
    options?.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  const cancellationTimeoutMs =
    options?.cancellationTimeoutMs ?? DEFAULT_CANCELLATION_TIMEOUT_MS;
  const compensationTimeoutMs =
    options?.compensationTimeoutMs ?? DEFAULT_COMPENSATION_TIMEOUT_MS;

  assertFinitePositiveInteger(operationTimeoutMs, "operationTimeoutMs");
  assertFinitePositiveInteger(cancellationTimeoutMs, "cancellationTimeoutMs");
  assertFinitePositiveInteger(compensationTimeoutMs, "compensationTimeoutMs");

  return Object.freeze({
    clock: options?.clock ?? new SystemExecutionClock(),
    timer: options?.timer ?? new SystemExecutionTimer(),
    observer: options?.observer,
    validateInputs: options?.validateInputs ?? true,
    decimalPlaces,
    operationTimeoutMs,
    cancellationTimeoutMs,
    compensationTimeoutMs,
    cancelRemainderOnPartialFill:
      options?.cancelRemainderOnPartialFill ?? true,
    compensateOnPartialFill: options?.compensateOnPartialFill ?? true,
    stopOnTransferFailure: options?.stopOnTransferFailure ?? true,
    includeAdapterMetadata: options?.includeAdapterMetadata ?? true,
  });
}

function round(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function stableHash(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createExecutionId(plan: ArbitrageExecutionPlan): ArbitrageId {
  return `arb-exec-${stableHash(
    `${plan.planId}|${plan.opportunityId}|${plan.createdAt}|${plan.correlationId}`,
  )}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown adapter failure.";
}

function normalizeStrings(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze(
    [...new Set((values ?? []).filter((value) => value.trim().length > 0))].sort(
      (left, right) => left.localeCompare(right),
    ),
  );
}

function mergeMetadata(
  base: ArbitrageMetadata,
  adapter: ArbitrageMetadata | undefined,
  includeAdapterMetadata: boolean,
): ArbitrageMetadata {
  return deepFreeze({
    ...base,
    ...(includeAdapterMetadata && adapter !== undefined
      ? { adapterMetadata: adapter }
      : {}),
  });
}

function ensureNonNegativeFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `${path} must be a finite non-negative number.`,
    );
  }
}

function ensureOptionalPositive(value: number | undefined, path: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `${path} must be a finite positive number when provided.`,
    );
  }
}

function validateOrderAdapterResult(
  result: ArbitrageOrderExecutionAdapterResult,
  leg: ArbitrageLeg,
): void {
  if (result === null || typeof result !== "object") {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Execution adapter returned an invalid result for leg ${leg.legId}.`,
    );
  }

  const statuses: readonly ArbitrageAdapterTerminalStatus[] = Object.freeze([
    "FILLED",
    "PARTIALLY_FILLED",
    "REJECTED",
    "CANCELLED",
    "TIMED_OUT",
    "FAILED",
  ]);

  if (!statuses.includes(result.status)) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Execution adapter returned an unsupported status for leg ${leg.legId}.`,
    );
  }

  ensureNonNegativeFinite(result.submittedQuantity, "submittedQuantity");
  ensureNonNegativeFinite(result.filledQuantity, "filledQuantity");
  ensureNonNegativeFinite(result.actualFees, "actualFees");
  ensureOptionalPositive(result.averageFillPrice, "averageFillPrice");

  if (result.actualOutputQuantity !== undefined) {
    ensureNonNegativeFinite(result.actualOutputQuantity, "actualOutputQuantity");
  }

  if (
    result.grossProfitContribution !== undefined &&
    !Number.isFinite(result.grossProfitContribution)
  ) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      "grossProfitContribution must be finite when provided.",
    );
  }

  if (result.filledQuantity - result.submittedQuantity > EPSILON) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Filled quantity exceeds submitted quantity for leg ${leg.legId}.`,
    );
  }

  if (
    result.status === "FILLED" &&
    result.submittedQuantity - result.filledQuantity > EPSILON
  ) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `FILLED result does not fully fill leg ${leg.legId}.`,
    );
  }
}

function validateTransferAdapterResult(
  result: ArbitrageTransferExecutionResult,
  transfer: ArbitrageTransferRequirement,
): void {
  if (result === null || typeof result !== "object") {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Transfer adapter returned an invalid result for ${transfer.transferId}.`,
    );
  }

  const statuses: readonly ArbitrageTransferExecutionStatus[] = Object.freeze([
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "REJECTED",
    "CANCELLED",
    "TIMED_OUT",
    "FAILED",
  ]);

  if (!statuses.includes(result.status)) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Transfer adapter returned an unsupported status for ${transfer.transferId}.`,
    );
  }

  ensureNonNegativeFinite(result.requestedQuantity, "requestedQuantity");
  ensureNonNegativeFinite(result.transferredQuantity, "transferredQuantity");
  ensureNonNegativeFinite(result.actualFee, "actualFee");

  if (result.transferredQuantity - result.requestedQuantity > EPSILON) {
    throw new ArbitrageExecutionEngineError(
      "INVALID_ADAPTER_RESULT",
      `Transferred quantity exceeds requested quantity for ${transfer.transferId}.`,
    );
  }
}

function operationDeadline(
  now: number,
  executionDeadline: number,
  operationTimeoutMs: number,
): number {
  return Math.min(executionDeadline, now + operationTimeoutMs);
}

async function withDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number,
  options: ResolvedOptions,
): Promise<T> {
  const remaining = deadlineAt - options.clock.now();

  if (remaining <= 0) {
    throw new OperationTimedOutError();
  }

  let completed = false;
  const guardedOperation = operation.then(
    (value) => {
      completed = true;
      return value;
    },
    (error: unknown) => {
      completed = true;
      throw error;
    },
  );

  const timeout = options.timer.delay(remaining).then(() => {
    if (!completed) {
      throw new OperationTimedOutError();
    }

    return new Promise<never>(() => undefined);
  });

  return Promise.race([guardedOperation, timeout]);
}

class OperationTimedOutError extends Error {
  public constructor() {
    super("Operation timed out.");
    this.name = "OperationTimedOutError";
  }
}

function mapAdapterStatus(status: ArbitrageAdapterTerminalStatus): ArbitrageLegStatus {
  return status;
}

function isSuccessfulLegStatus(status: ArbitrageLegStatus): boolean {
  return status === "FILLED" || status === "COMPENSATED";
}

function isFilledOrPartial(status: ArbitrageLegStatus): boolean {
  return status === "FILLED" || status === "PARTIALLY_FILLED";
}

function isFailureStatus(status: ArbitrageLegStatus): boolean {
  return (
    status === "REJECTED" ||
    status === "FAILED" ||
    status === "TIMED_OUT" ||
    status === "CANCELLED"
  );
}

function createPendingResult(leg: ArbitrageLeg): ArbitrageExecutionLegResult {
  return deepFreeze({
    legId: leg.legId,
    status: "PENDING",
    submittedQuantity: 0,
    filledQuantity: 0,
    actualFees: 0,
    externalOrderIds: Object.freeze([]),
    externalTransactionIds: Object.freeze([]),
    metadata: deepFreeze({
      executor: "InstitutionalArbitrageExecutor",
      sequence: leg.sequence,
      pending: true,
    }),
  });
}

function buildLegResult(
  leg: ArbitrageLeg,
  adapterResult: ArbitrageOrderExecutionAdapterResult,
  submittedAt: number,
  completedAt: number,
  options: ResolvedOptions,
  statusOverride?: ArbitrageLegStatus,
  failureReasonOverride?: string,
  additionalMetadata?: ArbitrageMetadata,
): ArbitrageExecutionLegResult {
  const status = statusOverride ?? mapAdapterStatus(adapterResult.status);
  const failureReason = failureReasonOverride ?? adapterResult.failureReason;

  return deepFreeze({
    legId: leg.legId,
    status,
    submittedQuantity: round(
      adapterResult.submittedQuantity,
      options.decimalPlaces,
    ),
    filledQuantity: round(adapterResult.filledQuantity, options.decimalPlaces),
    averageFillPrice:
      adapterResult.averageFillPrice === undefined
        ? undefined
        : round(adapterResult.averageFillPrice, options.decimalPlaces),
    actualOutputQuantity:
      adapterResult.actualOutputQuantity === undefined
        ? undefined
        : round(adapterResult.actualOutputQuantity, options.decimalPlaces),
    actualFees: round(adapterResult.actualFees, options.decimalPlaces),
    submittedAt,
    completedAt,
    externalOrderIds: normalizeStrings(adapterResult.externalOrderIds),
    externalTransactionIds: normalizeStrings(
      adapterResult.externalTransactionIds,
    ),
    failureReason,
    metadata: mergeMetadata(
      {
        executor: "InstitutionalArbitrageExecutor",
        sequence: leg.sequence,
        adapterStatus: adapterResult.status,
        ...(additionalMetadata ?? {}),
      },
      adapterResult.metadata,
      options.includeAdapterMetadata,
    ),
  });
}

function sortLegs(legs: readonly ArbitrageLeg[]): readonly ArbitrageLeg[] {
  return Object.freeze(
    [...legs].sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }

      return left.legId.localeCompare(right.legId);
    }),
  );
}

function sortTransfers(
  transfers: readonly ArbitrageTransferRequirement[],
): readonly ArbitrageTransferRequirement[] {
  return Object.freeze(
    [...transfers].sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }

      return left.transferId.localeCompare(right.transferId);
    }),
  );
}

function completedDependencies(
  leg: ArbitrageLeg,
  results: ReadonlyMap<ArbitrageId, ArbitrageExecutionLegResult>,
): readonly ArbitrageExecutionLegResult[] | undefined {
  const dependencies: ArbitrageExecutionLegResult[] = [];

  for (const dependencyId of leg.dependencyLegIds) {
    const result = results.get(dependencyId);

    if (result === undefined || !isSuccessfulLegStatus(result.status)) {
      return undefined;
    }

    dependencies.push(result);
  }

  return Object.freeze(dependencies);
}

function determineFinalStatus(state: MutableExecutionState): ArbitrageExecutionStatus {
  if (state.compensationAttempted) {
    return state.compensationSuccessful ? "COMPENSATED" : "FAILED";
  }

  if (state.timedOut) {
    return "TIMED_OUT";
  }

  const statuses = [...state.legResults.values()].map((result) => result.status);

  if (statuses.length > 0 && statuses.every((status) => status === "FILLED")) {
    return "COMPLETED";
  }

  if (statuses.some((status) => status === "PARTIALLY_FILLED")) {
    return "PARTIALLY_FILLED";
  }

  if (statuses.some((status) => status === "CANCELLED")) {
    return "CANCELLED";
  }

  return "FAILED";
}

function sumLegFees(
  results: ReadonlyMap<ArbitrageId, ArbitrageExecutionLegResult>,
): number {
  return [...results.values()].reduce(
    (total, result) => total + result.actualFees,
    0,
  );
}

function immutableContext(
  plan: ArbitrageExecutionPlan,
  executionId: string,
  startedAt: number,
  deadlineAt: number,
): ArbitrageExecutionContext {
  return deepFreeze({
    executionId,
    planId: plan.planId,
    opportunityId: plan.opportunityId,
    startedAt,
    deadlineAt,
    correlationId: plan.correlationId,
    traceId: plan.traceId,
    reportingAsset: plan.capitalAllocation.reportingAsset,
    metadata: deepFreeze({
      executor: "InstitutionalArbitrageExecutor",
      planStatus: plan.status,
    }),
  });
}

export class InstitutionalArbitrageExecutorImpl
  implements InstitutionalArbitrageExecutor
{
  private readonly registry: ArbitrageExecutionAdapterRegistry;
  private readonly options: ResolvedOptions;

  public constructor(
    registry: ArbitrageExecutionAdapterRegistry,
    options?: ArbitrageExecutionEngineOptions,
  ) {
    if (registry === null || typeof registry !== "object") {
      throw new ArbitrageExecutionEngineError(
        "INVALID_ARGUMENT",
        "An execution adapter registry is required.",
      );
    }

    if (typeof registry.getOrderExecutionAdapter !== "function") {
      throw new ArbitrageExecutionEngineError(
        "INVALID_ARGUMENT",
        "The adapter registry must implement getOrderExecutionAdapter().",
      );
    }

    this.registry = registry;
    this.options = resolveOptions(options);
  }

  public async execute(
    plan: ArbitrageExecutionPlan,
  ): Promise<ArbitrageExecutionResult> {
    this.assertExecutablePlan(plan);

    const startedAt = this.options.clock.now();

    if (startedAt >= plan.expiresAt) {
      throw new ArbitrageExecutionEngineError(
        "EXPIRED_PLAN",
        `Execution plan ${plan.planId} has expired.`,
      );
    }

    const executionId = createExecutionId(plan);
    const deadlineAt = Math.min(
      plan.expiresAt,
      startedAt + plan.maximumExecutionDurationMs,
    );
    const context = immutableContext(
      plan,
      executionId,
      startedAt,
      deadlineAt,
    );
    const state: MutableExecutionState = {
      status: "PREPARING",
      legResults: new Map(),
      grossProfitContributions: new Map(),
      transferFees: 0,
      compensationAttempted: false,
      compensationSuccessful: false,
      timedOut: false,
    };

    for (const leg of sortLegs(plan.legs)) {
      state.legResults.set(leg.legId, createPendingResult(leg));
    }

    await this.changeStatus(state, "PREPARING", context);

    try {
      const transferSummary = await this.executeTransfers(
        plan,
        context,
        deadlineAt,
      );
      state.transferFees = transferSummary.totalFees;

      if (!transferSummary.successful && this.options.stopOnTransferFailure) {
        state.failureReason = transferSummary.failureReason;
        state.timedOut = transferSummary.timedOut;
      } else {
        await this.executeLegs(plan, context, deadlineAt, state);
      }
    } catch (error: unknown) {
      state.failureReason = errorMessage(error);
      state.timedOut = error instanceof OperationTimedOutError;
    }

    const partialExecution = [...state.legResults.values()].some(
      (result) => result.filledQuantity > 0,
    );
    const executionIncomplete = [...state.legResults.values()].some(
      (result) => result.status !== "FILLED",
    );

    if (
      plan.rollbackRequiredOnPartialFailure &&
      partialExecution &&
      executionIncomplete
    ) {
      await this.compensate(plan, context, deadlineAt, state);
    }

    state.status = determineFinalStatus(state);
    await this.changeStatus(state, state.status, context);

    return this.buildAndValidateResult(
      plan,
      context,
      state,
      startedAt,
      this.options.clock.now(),
    );
  }

  private assertExecutablePlan(plan: ArbitrageExecutionPlan): void {
    if (plan === null || typeof plan !== "object") {
      throw new ArbitrageExecutionEngineError(
        "INVALID_ARGUMENT",
        "Execution plan is required.",
      );
    }

    if (this.options.validateInputs) {
      const validation = validateArbitrageExecutionPlan(plan);

      if (!validation.valid) {
        throw new ArbitrageExecutionEngineError(
          "INVALID_PLAN",
          "Invalid arbitrage execution plan.",
          { validationIssues: validation.issues },
        );
      }
    }

    const executableStatuses: readonly ArbitrageExecutionStatus[] =
      Object.freeze(["PREPARING", "CAPITAL_RESERVED", "NOT_STARTED"]);

    if (!executableStatuses.includes(plan.status)) {
      throw new ArbitrageExecutionEngineError(
        "UNSUPPORTED_PLAN_STATUS",
        `Plan status ${plan.status} is not executable.`,
      );
    }
  }

  private async executeTransfers(
    plan: ArbitrageExecutionPlan,
    context: ArbitrageExecutionContext,
    executionDeadline: number,
  ): Promise<TransferRunSummary> {
    let totalFees = 0;

    for (const transfer of sortTransfers(plan.transfers)) {
      if (this.options.clock.now() >= executionDeadline) {
        return deepFreeze({
          successful: false,
          timedOut: true,
          totalFees: round(totalFees, this.options.decimalPlaces),
          failureReason: `Execution timed out before transfer ${transfer.transferId}.`,
        });
      }

      const adapter = this.registry.getTransferAdapter?.(
        transfer.sourceVenue.venueId,
        transfer.destinationVenue.venueId,
      );

      if (adapter === undefined) {
        return deepFreeze({
          successful: false,
          timedOut: false,
          totalFees: round(totalFees, this.options.decimalPlaces),
          failureReason:
            `No transfer adapter is registered for ` +
            `${transfer.sourceVenue.venueId} -> ${transfer.destinationVenue.venueId}.`,
        });
      }

      const submittedAt = this.options.clock.now();
      const deadlineAt = operationDeadline(
        submittedAt,
        executionDeadline,
        Math.min(this.options.operationTimeoutMs, transfer.maximumDurationMs),
      );

      let result: ArbitrageTransferExecutionResult;

      try {
        result = await withDeadline(
          Promise.resolve(
            adapter.executeTransfer(
              deepFreeze({
                executionId: context.executionId,
                plan,
                transfer,
                submittedAt,
                deadlineAt,
                correlationId: context.correlationId,
                traceId: context.traceId,
                metadata: deepFreeze({
                  executor: "InstitutionalArbitrageExecutor",
                  transferSequence: transfer.sequence,
                }),
              }),
            ),
          ),
          deadlineAt,
          this.options,
        );
      } catch (error: unknown) {
        return deepFreeze({
          successful: false,
          timedOut: error instanceof OperationTimedOutError,
          totalFees: round(totalFees, this.options.decimalPlaces),
          failureReason:
            error instanceof OperationTimedOutError
              ? `Transfer ${transfer.transferId} timed out.`
              : `Transfer ${transfer.transferId} failed: ${errorMessage(error)}`,
        });
      }

      validateTransferAdapterResult(result, transfer);
      totalFees += result.actualFee;
      await this.options.observer?.onTransferCompleted?.(
        transfer,
        deepFreeze({ ...result }),
        context,
      );

      if (result.status !== "COMPLETED") {
        return deepFreeze({
          successful: false,
          timedOut: result.status === "TIMED_OUT",
          totalFees: round(totalFees, this.options.decimalPlaces),
          failureReason:
            result.failureReason ??
            `Transfer ${transfer.transferId} ended with status ${result.status}.`,
        });
      }
    }

    return deepFreeze({
      successful: true,
      timedOut: false,
      totalFees: round(totalFees, this.options.decimalPlaces),
    });
  }

  private async executeLegs(
    plan: ArbitrageExecutionPlan,
    context: ArbitrageExecutionContext,
    executionDeadline: number,
    state: MutableExecutionState,
  ): Promise<void> {
    const pending = new Map(
      sortLegs(plan.legs).map((leg) => [leg.legId, leg] as const),
    );

    await this.changeStatus(state, "SUBMITTING", context);

    while (pending.size > 0 && state.failureReason === undefined) {
      if (this.options.clock.now() >= executionDeadline) {
        state.timedOut = true;
        state.failureReason = "Maximum execution duration exceeded.";
        break;
      }

      let progressed = false;

      for (const leg of sortLegs([...pending.values()])) {
        const dependencies = completedDependencies(leg, state.legResults);

        if (dependencies === undefined) {
          continue;
        }

        progressed = true;
        pending.delete(leg.legId);

        const result = await this.executeSingleLeg(
          plan,
          leg,
          dependencies,
          context,
          executionDeadline,
        );
        state.legResults.set(leg.legId, result.legResult);
        state.grossProfitContributions.set(
          leg.legId,
          result.grossProfitContribution,
        );
        await this.options.observer?.onLegCompleted?.(
          leg,
          result.legResult,
          context,
        );

        if (result.legResult.status === "PARTIALLY_FILLED") {
          await this.changeStatus(state, "PARTIALLY_FILLED", context);

          if (this.options.compensateOnPartialFill) {
            state.failureReason =
              result.legResult.failureReason ??
              `Leg ${leg.legId} was only partially filled.`;
            break;
          }
        }

        if (isFailureStatus(result.legResult.status)) {
          state.timedOut = result.legResult.status === "TIMED_OUT";
          state.failureReason =
            result.legResult.failureReason ??
            `Leg ${leg.legId} ended with status ${result.legResult.status}.`;
          break;
        }
      }

      if (!progressed && pending.size > 0) {
        state.failureReason =
          "Dependency deadlock prevented remaining arbitrage legs from executing.";
        break;
      }
    }
  }

  private async executeSingleLeg(
    plan: ArbitrageExecutionPlan,
    leg: ArbitrageLeg,
    dependencyResults: readonly ArbitrageExecutionLegResult[],
    context: ArbitrageExecutionContext,
    executionDeadline: number,
  ): Promise<{
    readonly legResult: ArbitrageExecutionLegResult;
    readonly grossProfitContribution: number;
  }> {
    const adapter = this.registry.getOrderExecutionAdapter(leg.venue.venueId);

    if (adapter === undefined) {
      const now = this.options.clock.now();
      return deepFreeze({
        legResult: deepFreeze({
          legId: leg.legId,
          status: "FAILED",
          submittedQuantity: 0,
          filledQuantity: 0,
          actualFees: 0,
          submittedAt: now,
          completedAt: now,
          externalOrderIds: Object.freeze([]),
          externalTransactionIds: Object.freeze([]),
          failureReason: `No execution adapter is registered for venue ${leg.venue.venueId}.`,
          metadata: deepFreeze({
            executor: "InstitutionalArbitrageExecutor",
            missingAdapter: true,
          }),
        }),
        grossProfitContribution: 0,
      });
    }

    const submittedAt = this.options.clock.now();
    const deadlineAt = operationDeadline(
      submittedAt,
      executionDeadline,
      Math.min(this.options.operationTimeoutMs, leg.latency.maximumPermittedLatencyMs),
    );
    let adapterResult: ArbitrageOrderExecutionAdapterResult;

    try {
      adapterResult = await withDeadline(
        Promise.resolve(
          adapter.execute(
            deepFreeze({
              executionId: context.executionId,
              plan,
              leg,
              dependencyResults,
              submittedAt,
              deadlineAt,
              correlationId: context.correlationId,
              traceId: context.traceId,
              metadata: deepFreeze({
                executor: "InstitutionalArbitrageExecutor",
                legSequence: leg.sequence,
              }),
            }),
          ),
        ),
        deadlineAt,
        this.options,
      );
    } catch (error: unknown) {
      const completedAt = this.options.clock.now();
      const timedOut = error instanceof OperationTimedOutError;
      return deepFreeze({
        legResult: deepFreeze({
          legId: leg.legId,
          status: timedOut ? "TIMED_OUT" : "FAILED",
          submittedQuantity: leg.inputQuantity,
          filledQuantity: 0,
          actualFees: 0,
          submittedAt,
          completedAt,
          externalOrderIds: Object.freeze([]),
          externalTransactionIds: Object.freeze([]),
          failureReason: timedOut
            ? `Leg ${leg.legId} timed out.`
            : `Leg ${leg.legId} failed: ${errorMessage(error)}`,
          metadata: deepFreeze({
            executor: "InstitutionalArbitrageExecutor",
            adapterException: !timedOut,
          }),
        }),
        grossProfitContribution: 0,
      });
    }

    validateOrderAdapterResult(adapterResult, leg);
    let finalAdapterResult = adapterResult;
    let statusOverride: ArbitrageLegStatus | undefined;
    let failureReasonOverride: string | undefined;
    let cancellationMetadata: ArbitrageMetadata | undefined;

    if (
      adapterResult.status === "PARTIALLY_FILLED" &&
      this.options.cancelRemainderOnPartialFill
    ) {
      const cancellation = await this.cancelRemainder(
        plan,
        leg,
        adapterResult,
        context,
        executionDeadline,
      );
      cancellationMetadata = cancellation.metadata;

      if (cancellation.status === "CANCELLED") {
        statusOverride = "PARTIALLY_FILLED";
        failureReasonOverride =
          adapterResult.failureReason ??
          `Leg ${leg.legId} partially filled; remaining quantity was cancelled.`;
      } else if (cancellation.status === "TIMED_OUT") {
        statusOverride = "TIMED_OUT";
        failureReasonOverride =
          cancellation.failureReason ??
          `Cancellation timed out for partially filled leg ${leg.legId}.`;
      } else {
        statusOverride = "FAILED";
        failureReasonOverride =
          cancellation.failureReason ??
          `Cancellation failed for partially filled leg ${leg.legId}.`;
      }

      finalAdapterResult = {
        ...adapterResult,
        externalOrderIds: normalizeStrings([
          ...(adapterResult.externalOrderIds ?? []),
          ...(cancellation.externalOrderIds ?? []),
        ]),
      };
    }

    const completedAt = Math.max(
      submittedAt,
      finalAdapterResult.completedAt ?? this.options.clock.now(),
    );
    const legResult = buildLegResult(
      leg,
      finalAdapterResult,
      submittedAt,
      completedAt,
      this.options,
      statusOverride,
      failureReasonOverride,
      cancellationMetadata === undefined
        ? undefined
        : { cancellation: cancellationMetadata },
    );

    return deepFreeze({
      legResult,
      grossProfitContribution: round(
        finalAdapterResult.grossProfitContribution ?? 0,
        this.options.decimalPlaces,
      ),
    });
  }

  private async cancelRemainder(
    plan: ArbitrageExecutionPlan,
    leg: ArbitrageLeg,
    executionResult: ArbitrageOrderExecutionAdapterResult,
    context: ArbitrageExecutionContext,
    executionDeadline: number,
  ): Promise<ArbitrageOrderCancellationResult> {
    const adapter = this.registry.getOrderCancellationAdapter?.(
      leg.venue.venueId,
    );

    if (adapter === undefined) {
      return deepFreeze({
        status: "FAILED",
        failureReason: `No cancellation adapter is registered for venue ${leg.venue.venueId}.`,
        metadata: deepFreeze({ missingCancellationAdapter: true }),
      });
    }

    const requestedAt = this.options.clock.now();
    const deadlineAt = operationDeadline(
      requestedAt,
      executionDeadline,
      this.options.cancellationTimeoutMs,
    );

    try {
      const result = await withDeadline(
        Promise.resolve(
          adapter.cancel(
            deepFreeze({
              executionId: context.executionId,
              plan,
              leg,
              executionResult,
              requestedAt,
              deadlineAt,
              correlationId: context.correlationId,
              traceId: context.traceId,
              metadata: deepFreeze({
                executor: "InstitutionalArbitrageExecutor",
                reason: "PARTIAL_FILL_REMAINDER",
              }),
            }),
          ),
        ),
        deadlineAt,
        this.options,
      );

      ensureOptionalNonNegative(result.cancelledQuantity, "cancelledQuantity");
      return deepFreeze({
        ...result,
        externalOrderIds: normalizeStrings(result.externalOrderIds),
        metadata: deepFreeze({ ...(result.metadata ?? {}) }),
      });
    } catch (error: unknown) {
      return deepFreeze({
        status: error instanceof OperationTimedOutError ? "TIMED_OUT" : "FAILED",
        completedAt: this.options.clock.now(),
        failureReason:
          error instanceof OperationTimedOutError
            ? `Cancellation timed out for leg ${leg.legId}.`
            : `Cancellation failed for leg ${leg.legId}: ${errorMessage(error)}`,
        metadata: deepFreeze({ adapterException: true }),
      });
    }
  }

  private async compensate(
    plan: ArbitrageExecutionPlan,
    context: ArbitrageExecutionContext,
    executionDeadline: number,
    state: MutableExecutionState,
  ): Promise<void> {
    state.compensationAttempted = true;
    state.compensationSuccessful = true;
    await this.changeStatus(state, "COMPENSATING", context);

    const executedLegs = sortLegs(plan.legs)
      .filter((leg) => {
        const result = state.legResults.get(leg.legId);
        return result !== undefined && result.filledQuantity > 0;
      })
      .reverse();

    for (const leg of executedLegs) {
      const originalResult = state.legResults.get(leg.legId);

      if (originalResult === undefined) {
        continue;
      }

      const adapter = this.registry.getCompensationAdapter?.(
        leg.venue.venueId,
      );

      if (adapter === undefined) {
        state.compensationSuccessful = false;
        state.failureReason = appendReason(
          state.failureReason,
          `No compensation adapter is registered for venue ${leg.venue.venueId}.`,
        );
        state.legResults.set(
          leg.legId,
          deepFreeze({
            ...originalResult,
            status: "FAILED",
            completedAt: this.options.clock.now(),
            failureReason: appendReason(
              originalResult.failureReason,
              "Compensation adapter is unavailable.",
            ),
            metadata: deepFreeze({
              ...originalResult.metadata,
              compensationAttempted: true,
              compensationSucceeded: false,
            }),
          }),
        );
        continue;
      }

      const requestedAt = this.options.clock.now();
      const deadlineAt = operationDeadline(
        requestedAt,
        executionDeadline,
        this.options.compensationTimeoutMs,
      );

      try {
        const result = await withDeadline(
          Promise.resolve(
            adapter.compensate(
              deepFreeze({
                executionId: context.executionId,
                plan,
                leg,
                originalResult,
                requestedAt,
                deadlineAt,
                correlationId: context.correlationId,
                traceId: context.traceId,
                metadata: deepFreeze({
                  executor: "InstitutionalArbitrageExecutor",
                  compensationOrder: "REVERSE_DEPENDENCY_ORDER",
                }),
              }),
            ),
          ),
          deadlineAt,
          this.options,
        );

        ensureNonNegativeFinite(result.compensatedQuantity, "compensatedQuantity");
        ensureNonNegativeFinite(result.actualFees, "actualFees");

        if (
          result.grossProfitContribution !== undefined &&
          !Number.isFinite(result.grossProfitContribution)
        ) {
          throw new ArbitrageExecutionEngineError(
            "INVALID_ADAPTER_RESULT",
            "Compensation grossProfitContribution must be finite.",
          );
        }

        const compensated =
          result.status === "COMPENSATED" &&
          result.compensatedQuantity + EPSILON >= originalResult.filledQuantity;
        state.compensationSuccessful =
          state.compensationSuccessful && compensated;
        state.grossProfitContributions.set(
          `compensation:${leg.legId}`,
          round(
            result.grossProfitContribution ?? 0,
            this.options.decimalPlaces,
          ),
        );
        state.legResults.set(
          leg.legId,
          deepFreeze({
            ...originalResult,
            status: compensated ? "COMPENSATED" : "FAILED",
            actualFees: round(
              originalResult.actualFees + result.actualFees,
              this.options.decimalPlaces,
            ),
            completedAt: Math.max(
              requestedAt,
              result.completedAt ?? this.options.clock.now(),
            ),
            externalOrderIds: normalizeStrings([
              ...originalResult.externalOrderIds,
              ...(result.externalOrderIds ?? []),
            ]),
            externalTransactionIds: normalizeStrings([
              ...originalResult.externalTransactionIds,
              ...(result.externalTransactionIds ?? []),
            ]),
            failureReason: compensated
              ? originalResult.failureReason
              : appendReason(
                  originalResult.failureReason,
                  result.failureReason ?? "Compensation was incomplete.",
                ),
            metadata: mergeMetadata(
              {
                ...originalResult.metadata,
                compensationAttempted: true,
                compensationSucceeded: compensated,
                compensatedQuantity: round(
                  result.compensatedQuantity,
                  this.options.decimalPlaces,
                ),
              },
              result.metadata,
              this.options.includeAdapterMetadata,
            ),
          }),
        );

        if (!compensated) {
          state.failureReason = appendReason(
            state.failureReason,
            result.failureReason ?? `Compensation failed for leg ${leg.legId}.`,
          );
        }
      } catch (error: unknown) {
        state.compensationSuccessful = false;
        state.failureReason = appendReason(
          state.failureReason,
          `Compensation failed for leg ${leg.legId}: ${errorMessage(error)}`,
        );
        state.legResults.set(
          leg.legId,
          deepFreeze({
            ...originalResult,
            status: "FAILED",
            completedAt: this.options.clock.now(),
            failureReason: appendReason(
              originalResult.failureReason,
              error instanceof OperationTimedOutError
                ? "Compensation timed out."
                : `Compensation failed: ${errorMessage(error)}`,
            ),
            metadata: deepFreeze({
              ...originalResult.metadata,
              compensationAttempted: true,
              compensationSucceeded: false,
            }),
          }),
        );
      }
    }
  }

  private buildAndValidateResult(
    plan: ArbitrageExecutionPlan,
    context: ArbitrageExecutionContext,
    state: MutableExecutionState,
    startedAt: number,
    completedAt: number,
  ): ArbitrageExecutionResult {
    const legResults = Object.freeze(
      sortLegs(plan.legs).map((leg) => {
        const result = state.legResults.get(leg.legId);

        if (result === undefined) {
          throw new ArbitrageExecutionEngineError(
            "INVALID_GENERATED_RESULT",
            `Missing execution result for leg ${leg.legId}.`,
          );
        }

        return result;
      }),
    );
    const grossProfit = round(
      [...state.grossProfitContributions.values()].reduce(
        (total, value) => total + value,
        0,
      ),
      this.options.decimalPlaces,
    );
    const totalFees = round(
      sumLegFees(state.legResults) + state.transferFees,
      this.options.decimalPlaces,
    );
    const realizedNetProfit = round(
      grossProfit - totalFees,
      this.options.decimalPlaces,
    );
    const terminalStatus = state.status;
    const result: ArbitrageExecutionResult = deepFreeze({
      executionId: context.executionId,
      planId: plan.planId,
      opportunityId: plan.opportunityId,
      status: terminalStatus,
      legResults,
      startedAt,
      completedAt: Math.max(startedAt, completedAt),
      grossProfit,
      totalFees,
      realizedNetProfit,
      reportingAsset: plan.capitalAllocation.reportingAsset,
      failureReason:
        terminalStatus === "COMPLETED" ? undefined : state.failureReason,
      correlationId: plan.correlationId,
      traceId: plan.traceId,
      metadata: deepFreeze({
        executor: "InstitutionalArbitrageExecutor",
        executorVersion: 1,
        planStatusAtStart: plan.status,
        transferCount: plan.transfers.length,
        legCount: plan.legs.length,
        successfulLegCount: legResults.filter((entry) => entry.status === "FILLED")
          .length,
        partialLegCount: legResults.filter(
          (entry) => entry.status === "PARTIALLY_FILLED",
        ).length,
        compensationAttempted: state.compensationAttempted,
        compensationSuccessful: state.compensationSuccessful,
        timedOut: state.timedOut,
        transferFees: round(state.transferFees, this.options.decimalPlaces),
      }),
    });
    const validation = validateArbitrageExecutionResult(result);

    if (!validation.valid) {
      throw new ArbitrageExecutionEngineError(
        "INVALID_GENERATED_RESULT",
        "Generated arbitrage execution result is invalid.",
        { validationIssues: validation.issues },
      );
    }

    return result;
  }

  private async changeStatus(
    state: MutableExecutionState,
    status: ArbitrageExecutionStatus,
    context: ArbitrageExecutionContext,
  ): Promise<void> {
    state.status = status;
    await this.options.observer?.onStatusChanged?.(status, context);
  }
}

function ensureOptionalNonNegative(
  value: number | undefined,
  path: string,
): void {
  if (value !== undefined) {
    ensureNonNegativeFinite(value, path);
  }
}

function appendReason(
  existing: string | undefined,
  next: string,
): string {
  return existing === undefined || existing.trim().length === 0
    ? next
    : `${existing} ${next}`;
}

/**
 * Canonical Milestone 36 executor name.
 *
 * The implementation suffix remains exported for consumers that prefer an
 * explicit concrete-class name, while this alias matches the roadmap contract.
 */
export { InstitutionalArbitrageExecutorImpl as InstitutionalArbitrageExecutor };