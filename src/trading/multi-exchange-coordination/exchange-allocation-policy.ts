import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";
import type {
  CoordinatorExchangeSelectionResult,
  CoordinatorSelectedExchange,
} from "./exchange-selection-policy";

export type CoordinatorAllocationStrategy =
  | "PRIMARY_ONLY"
  | "EQUAL_SPLIT"
  | "WEIGHTED_SPLIT";

export type CoordinatorAllocationStatus =
  | "ALLOCATED"
  | "PARTIALLY_ALLOCATED"
  | "NOT_ALLOCATED";

export interface CoordinatorExchangeAllocation {
  readonly allocationIndex: number;
  readonly exchangeId: CoordinatorExchangeId;
  readonly candidate: CoordinatorExchangeCandidate;
  readonly quantity: number;
  readonly percentage: number;
}

export interface CoordinatorExchangeAllocationOptions {
  readonly strategy?: CoordinatorAllocationStrategy;
  readonly minimumAllocationQuantity?: number;
  readonly quantityPrecision?: number;
}

export interface CoordinatorExchangeAllocationResult {
  readonly status: CoordinatorAllocationStatus;
  readonly requestId: string;
  readonly requestedQuantity: number;
  readonly allocatedQuantity: number;
  readonly unallocatedQuantity: number;
  readonly allocations:
    readonly CoordinatorExchangeAllocation[];
  readonly reason: string | null;
}

const DEFAULT_QUANTITY_PRECISION = 8;

function assertFinitePositive(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${fieldName} must be a finite positive number.`,
    );
  }
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

function assertQuantityPrecision(
  value: number,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 15
  ) {
    throw new Error(
      "quantityPrecision must be an integer between 0 and 15.",
    );
  }
}

function roundQuantity(
  value: number,
  precision: number,
): number {
  const factor = 10 ** precision;

  return Math.round(
    (value + Number.EPSILON) * factor,
  ) / factor;
}

function sumAllocations(
  allocations:
    readonly CoordinatorExchangeAllocation[],
  precision: number,
): number {
  return roundQuantity(
    allocations.reduce(
      (total, allocation) =>
        total + allocation.quantity,
      0,
    ),
    precision,
  );
}

export class CoordinatorExchangeAllocationPolicy {
  public allocate(
    request: MultiExchangeCoordinatorOrderRequest,
    selection: CoordinatorExchangeSelectionResult,
    options: CoordinatorExchangeAllocationOptions = {},
  ): CoordinatorExchangeAllocationResult {
    assertFinitePositive(
      request.quantity,
      "request.quantity",
    );

    const strategy =
      options.strategy ?? "PRIMARY_ONLY";

    const minimumAllocationQuantity =
      options.minimumAllocationQuantity ?? 0;

    const quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    assertFiniteNonNegative(
      minimumAllocationQuantity,
      "minimumAllocationQuantity",
    );

    assertQuantityPrecision(quantityPrecision);

    if (
      selection.requestId !== request.requestId
    ) {
      throw new Error(
        "Selection requestId must match order requestId.",
      );
    }

    if (selection.selected.length === 0) {
      return Object.freeze({
        status: "NOT_ALLOCATED",
        requestId: request.requestId,
        requestedQuantity: request.quantity,
        allocatedQuantity: 0,
        unallocatedQuantity: request.quantity,
        allocations: Object.freeze([]),
        reason:
          selection.reason ??
          "No exchanges were selected for allocation.",
      });
    }

    const rawAllocations =
      this.calculateRawAllocations(
        request.quantity,
        selection.selected,
        strategy,
        quantityPrecision,
      );

    const filteredAllocations =
      rawAllocations.filter(
        (allocation) =>
          allocation.quantity >=
          minimumAllocationQuantity,
      );

    const allocations = Object.freeze(
      filteredAllocations.map(
        (allocation, index) =>
          Object.freeze({
            ...allocation,
            allocationIndex: index,
          }),
      ),
    );

    const allocatedQuantity = sumAllocations(
      allocations,
      quantityPrecision,
    );

    const unallocatedQuantity = roundQuantity(
      Math.max(
        0,
        request.quantity - allocatedQuantity,
      ),
      quantityPrecision,
    );

    if (allocations.length === 0) {
      return Object.freeze({
        status: "NOT_ALLOCATED",
        requestId: request.requestId,
        requestedQuantity: request.quantity,
        allocatedQuantity: 0,
        unallocatedQuantity: request.quantity,
        allocations,
        reason:
          "All calculated allocations were below the minimum allocation quantity.",
      });
    }

    return Object.freeze({
      status:
        unallocatedQuantity === 0
          ? "ALLOCATED"
          : "PARTIALLY_ALLOCATED",
      requestId: request.requestId,
      requestedQuantity: request.quantity,
      allocatedQuantity,
      unallocatedQuantity,
      allocations,
      reason:
        unallocatedQuantity === 0
          ? null
          : `${unallocatedQuantity} quantity could not be allocated.`,
    });
  }

  private calculateRawAllocations(
    requestedQuantity: number,
    selected:
      readonly CoordinatorSelectedExchange[],
    strategy: CoordinatorAllocationStrategy,
    quantityPrecision: number,
  ): readonly CoordinatorExchangeAllocation[] {
    switch (strategy) {
      case "PRIMARY_ONLY":
        return this.allocatePrimaryOnly(
          requestedQuantity,
          selected[0],
          quantityPrecision,
        );

      case "EQUAL_SPLIT":
        return this.allocateEqually(
          requestedQuantity,
          selected,
          quantityPrecision,
        );

      case "WEIGHTED_SPLIT":
        return this.allocateByWeight(
          requestedQuantity,
          selected,
          quantityPrecision,
        );
    }
  }

  private allocatePrimaryOnly(
    requestedQuantity: number,
    selected:
      CoordinatorSelectedExchange | undefined,
    quantityPrecision: number,
  ): readonly CoordinatorExchangeAllocation[] {
    if (selected === undefined) {
      return Object.freeze([]);
    }

    return Object.freeze([
      Object.freeze({
        allocationIndex: 0,
        exchangeId: selected.exchangeId,
        candidate: selected.candidate,
        quantity: roundQuantity(
          requestedQuantity,
          quantityPrecision,
        ),
        percentage: 100,
      }),
    ]);
  }

  private allocateEqually(
    requestedQuantity: number,
    selected:
      readonly CoordinatorSelectedExchange[],
    quantityPrecision: number,
  ): readonly CoordinatorExchangeAllocation[] {
    const quantityPerExchange = roundQuantity(
      requestedQuantity / selected.length,
      quantityPrecision,
    );

    const allocations =
      selected.map((selectedExchange, index) =>
        Object.freeze({
          allocationIndex: index,
          exchangeId:
            selectedExchange.exchangeId,
          candidate:
            selectedExchange.candidate,
          quantity: quantityPerExchange,
          percentage: roundQuantity(
            100 / selected.length,
            quantityPrecision,
          ),
        }),
      );

    this.applyRemainder(
      allocations,
      requestedQuantity,
      quantityPrecision,
    );

    return Object.freeze(allocations);
  }

  private allocateByWeight(
    requestedQuantity: number,
    selected:
      readonly CoordinatorSelectedExchange[],
    quantityPrecision: number,
  ): readonly CoordinatorExchangeAllocation[] {
    const totalWeight = selected.reduce(
      (total, selectedExchange) =>
        total +
        Math.max(
          0,
          selectedExchange.candidate.weight,
        ),
      0,
    );

    if (totalWeight === 0) {
      return this.allocateEqually(
        requestedQuantity,
        selected,
        quantityPrecision,
      );
    }

    const allocations =
      selected.map((selectedExchange, index) => {
        const normalizedWeight = Math.max(
          0,
          selectedExchange.candidate.weight,
        );

        const percentage =
          normalizedWeight / totalWeight;

        return {
          allocationIndex: index,
          exchangeId:
            selectedExchange.exchangeId,
          candidate:
            selectedExchange.candidate,
          quantity: roundQuantity(
            requestedQuantity * percentage,
            quantityPrecision,
          ),
          percentage: roundQuantity(
            percentage * 100,
            quantityPrecision,
          ),
        };
      });

    this.applyRemainder(
      allocations,
      requestedQuantity,
      quantityPrecision,
    );

    return Object.freeze(
      allocations.map((allocation) =>
        Object.freeze(allocation),
      ),
    );
  }

  private applyRemainder(
    allocations: {
      allocationIndex: number;
      exchangeId: CoordinatorExchangeId;
      candidate: CoordinatorExchangeCandidate;
      quantity: number;
      percentage: number;
    }[],
    requestedQuantity: number,
    quantityPrecision: number,
  ): void {
    const allocatedQuantity = roundQuantity(
      allocations.reduce(
        (total, allocation) =>
          total + allocation.quantity,
        0,
      ),
      quantityPrecision,
    );

    const remainder = roundQuantity(
      requestedQuantity - allocatedQuantity,
      quantityPrecision,
    );

    const primaryAllocation = allocations[0];

    if (
      primaryAllocation !== undefined &&
      remainder !== 0
    ) {
      primaryAllocation.quantity = roundQuantity(
        primaryAllocation.quantity + remainder,
        quantityPrecision,
      );
    }
  }
}

export function createCoordinatorExchangeAllocationPolicy():
  CoordinatorExchangeAllocationPolicy {
  return new CoordinatorExchangeAllocationPolicy();
}