import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
  CoordinatorSymbolReference,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";
import type {
  CoordinatorExchangeAllocation,
  CoordinatorExchangeAllocationResult,
} from "./exchange-allocation-policy";
import type {
  CoordinatorExchangeSelectionResult,
} from "./exchange-selection-policy";

export type CoordinatorExecutionPlanStatus =
  | "READY"
  | "PARTIALLY_READY"
  | "NOT_READY";

export interface CoordinatorExchangeExecutionInstruction {
  readonly instructionIndex: number;
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: string;
  readonly candidate: CoordinatorExchangeCandidate;
  readonly symbol: CoordinatorSymbolReference;
  readonly quantity: number;
  readonly percentage: number;
  readonly priority: number;
  readonly clientOrderId: string | null;
}

export interface CoordinatorExchangeExecutionPlan {
  readonly planId: string;
  readonly requestId: string;
  readonly status: CoordinatorExecutionPlanStatus;
  readonly requestedQuantity: number;
  readonly plannedQuantity: number;
  readonly unplannedQuantity: number;
  readonly instructions:
    readonly CoordinatorExchangeExecutionInstruction[];
  readonly createdAt: number;
  readonly reason: string | null;
}

export interface CoordinatorExecutionPlanIdGenerator {
  next(requestId: string): string;
}

export interface CoordinatorExecutionPlanClock {
  now(): number;
}

export interface CoordinatorExecutionPlanBuilderOptions {
  readonly requireCompleteAllocation?: boolean;
  readonly clientOrderIdPrefix?: string;
}

export class DeterministicCoordinatorExecutionPlanIdGenerator
  implements CoordinatorExecutionPlanIdGenerator
{
  private sequence: number;

  public constructor(
    private readonly prefix = "coordinator-plan",
    initialSequence = 0,
  ) {
    if (
      !Number.isSafeInteger(initialSequence) ||
      initialSequence < 0
    ) {
      throw new Error(
        "initialSequence must be a non-negative safe integer.",
      );
    }

    if (prefix.trim().length === 0) {
      throw new Error("prefix cannot be empty.");
    }

    this.sequence = initialSequence;
  }

  public next(requestId: string): string {
    if (requestId.trim().length === 0) {
      throw new Error("requestId cannot be empty.");
    }

    if (this.sequence >= Number.MAX_SAFE_INTEGER) {
      throw new Error(
        "Execution plan ID sequence has reached its maximum value.",
      );
    }

    this.sequence += 1;

    return [
      this.prefix,
      requestId,
      this.sequence.toString().padStart(12, "0"),
    ].join("-");
  }

  public getCurrentSequence(): number {
    return this.sequence;
  }

  public reset(sequence = 0): void {
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0
    ) {
      throw new Error(
        "sequence must be a non-negative safe integer.",
      );
    }

    this.sequence = sequence;
  }
}

function assertFiniteTimestamp(timestamp: number): void {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error(
      "Execution plan timestamp must be a finite non-negative number.",
    );
  }
}

function assertMatchingRequestIds(
  request: MultiExchangeCoordinatorOrderRequest,
  selection: CoordinatorExchangeSelectionResult,
  allocation: CoordinatorExchangeAllocationResult,
): void {
  if (selection.requestId !== request.requestId) {
    throw new Error(
      "Selection requestId must match the order requestId.",
    );
  }

  if (allocation.requestId !== request.requestId) {
    throw new Error(
      "Allocation requestId must match the order requestId.",
    );
  }
}

function findSelectedCandidate(
  selection: CoordinatorExchangeSelectionResult,
  exchangeId: CoordinatorExchangeId,
): CoordinatorExchangeCandidate | null {
  return (
    selection.selected.find(
      (selectedExchange) =>
        selectedExchange.exchangeId === exchangeId,
    )?.candidate ?? null
  );
}

function createInstructionClientOrderId(
  request: MultiExchangeCoordinatorOrderRequest,
  allocation: CoordinatorExchangeAllocation,
  prefix: string,
): string | null {
  if (request.clientOrderId === null) {
    return null;
  }

  return [
    prefix,
    request.clientOrderId,
    allocation.exchangeId.toLowerCase(),
    allocation.allocationIndex
      .toString()
      .padStart(3, "0"),
  ].join("-");
}

export class CoordinatorExchangeExecutionPlanBuilder {
  public constructor(
    private readonly clock: CoordinatorExecutionPlanClock,
    private readonly planIdGenerator:
      CoordinatorExecutionPlanIdGenerator,
  ) {}

  public build(
    request: MultiExchangeCoordinatorOrderRequest,
    selection: CoordinatorExchangeSelectionResult,
    allocation: CoordinatorExchangeAllocationResult,
    options: CoordinatorExecutionPlanBuilderOptions = {},
  ): CoordinatorExchangeExecutionPlan {
    assertMatchingRequestIds(
      request,
      selection,
      allocation,
    );

    const createdAt = this.clock.now();

    assertFiniteTimestamp(createdAt);

    const requireCompleteAllocation =
      options.requireCompleteAllocation ?? false;

    const clientOrderIdPrefix =
      options.clientOrderIdPrefix ??
      "coordinated";

    if (clientOrderIdPrefix.trim().length === 0) {
      throw new Error(
        "clientOrderIdPrefix cannot be empty.",
      );
    }

    if (allocation.allocations.length === 0) {
      return Object.freeze({
        planId: this.planIdGenerator.next(
          request.requestId,
        ),
        requestId: request.requestId,
        status: "NOT_READY",
        requestedQuantity: request.quantity,
        plannedQuantity: 0,
        unplannedQuantity: request.quantity,
        instructions: Object.freeze([]),
        createdAt,
        reason:
          allocation.reason ??
          "No exchange allocations were available.",
      });
    }

    if (
      requireCompleteAllocation &&
      allocation.unallocatedQuantity > 0
    ) {
      return Object.freeze({
        planId: this.planIdGenerator.next(
          request.requestId,
        ),
        requestId: request.requestId,
        status: "NOT_READY",
        requestedQuantity: request.quantity,
        plannedQuantity: 0,
        unplannedQuantity: request.quantity,
        instructions: Object.freeze([]),
        createdAt,
        reason:
          "A complete allocation was required, but part of the order quantity remained unallocated.",
      });
    }

    const instructions:
      CoordinatorExchangeExecutionInstruction[] = [];

    for (const exchangeAllocation of allocation.allocations) {
      const selectedCandidate = findSelectedCandidate(
        selection,
        exchangeAllocation.exchangeId,
      );

      if (selectedCandidate === null) {
        throw new Error(
          `Allocation references unselected exchange ${exchangeAllocation.exchangeId}.`,
        );
      }

      instructions.push(
        Object.freeze({
          instructionIndex: instructions.length,
          exchangeId:
            exchangeAllocation.exchangeId,
          accountId:
            selectedCandidate.accountId,
          candidate:
            selectedCandidate,
          symbol:
            selectedCandidate.symbol,
          quantity:
            exchangeAllocation.quantity,
          percentage:
            exchangeAllocation.percentage,
          priority:
            selectedCandidate.priority,
          clientOrderId:
            createInstructionClientOrderId(
              request,
              exchangeAllocation,
              clientOrderIdPrefix,
            ),
        }),
      );
    }

    const frozenInstructions = Object.freeze(
      [...instructions],
    );

    const status: CoordinatorExecutionPlanStatus =
      allocation.unallocatedQuantity === 0
        ? "READY"
        : "PARTIALLY_READY";

    return Object.freeze({
      planId: this.planIdGenerator.next(
        request.requestId,
      ),
      requestId: request.requestId,
      status,
      requestedQuantity: request.quantity,
      plannedQuantity:
        allocation.allocatedQuantity,
      unplannedQuantity:
        allocation.unallocatedQuantity,
      instructions: frozenInstructions,
      createdAt,
      reason:
        status === "READY"
          ? null
          : allocation.reason ??
            "The execution plan covers only part of the requested quantity.",
    });
  }
}

export function createCoordinatorExchangeExecutionPlanBuilder(
  clock: CoordinatorExecutionPlanClock,
  planIdGenerator:
    CoordinatorExecutionPlanIdGenerator =
      new DeterministicCoordinatorExecutionPlanIdGenerator(),
): CoordinatorExchangeExecutionPlanBuilder {
  return new CoordinatorExchangeExecutionPlanBuilder(
    clock,
    planIdGenerator,
  );
}