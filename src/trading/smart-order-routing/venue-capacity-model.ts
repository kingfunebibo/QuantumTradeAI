import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorSymbol,
} from "../multi-exchange-coordination/coordinator-contracts";

export type SmartOrderRoutingVenueCapacityStatus =
  | "AVAILABLE"
  | "LIMITED"
  | "UNAVAILABLE";

export type SmartOrderRoutingVenueCapacityConstraint =
  | "NO_LIQUIDITY"
  | "PARTICIPATION_LIMIT"
  | "VENUE_QUANTITY_LIMIT"
  | "MINIMUM_ALLOCATION"
  | "REQUEST_QUANTITY";

export interface SmartOrderRoutingVenueCapacityInput {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;

  readonly requestedQuantity: number;
  readonly availableQuantity: number;

  readonly maximumParticipationRate?: number | null;
  readonly maximumVenueQuantity?: number | null;
  readonly minimumAllocationQuantity?: number | null;

  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueCapacity {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;

  readonly symbol: CoordinatorSymbol;
  readonly exchangeSymbol: string;

  readonly side: CoordinatorOrderSide;

  readonly status: SmartOrderRoutingVenueCapacityStatus;

  readonly requestedQuantity: number;
  readonly availableQuantity: number;

  readonly participationLimitedQuantity: number;
  readonly venueLimitedQuantity: number;
  readonly routableQuantity: number;

  readonly effectiveParticipationRate: number;

  readonly limitingConstraint:
    SmartOrderRoutingVenueCapacityConstraint;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingVenueCapacityModelOptions {
  readonly defaultMaximumParticipationRate?: number;
  readonly defaultMaximumVenueQuantity?: number | null;
  readonly defaultMinimumAllocationQuantity?: number;
  readonly quantityPrecision?: number;
}

const DEFAULT_MAXIMUM_PARTICIPATION_RATE = 1;
const DEFAULT_MINIMUM_ALLOCATION_QUANTITY = 0;
const DEFAULT_QUANTITY_PRECISION = 12;

function mergeMetadata(
  ...sources: readonly (
    | CoordinatorMetadata
    | undefined
  )[]
): CoordinatorMetadata {
  const merged: Record<
    string,
    CoordinatorMetadataValue
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (
      const [key, value]
      of Object.entries(source)
    ) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `${fieldName} must not be empty.`,
    );
  }
}

function assertFiniteNonNegative(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} must be a finite non-negative number.`,
    );
  }
}

function assertOptionalFiniteNonNegative(
  value: number | null | undefined,
  fieldName: string,
): void {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  assertFiniteNonNegative(
    value,
    fieldName,
  );
}

function assertParticipationRate(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(
      `${fieldName} must be a finite number between 0 and 1.`,
    );
  }
}

function assertOptionalParticipationRate(
  value: number | null | undefined,
  fieldName: string,
): void {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  assertParticipationRate(
    value,
    fieldName,
  );
}

function assertPrecision(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 18
  ) {
    throw new Error(
      `${fieldName} must be an integer between 0 and 18.`,
    );
  }
}

function roundValue(
  value: number,
  precision: number,
): number {
  const factor =
    10 ** precision;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function calculateEffectiveParticipationRate(
  routableQuantity: number,
  availableQuantity: number,
): number {
  if (
    availableQuantity <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    routableQuantity /
      availableQuantity,
  );
}

export class SmartOrderRoutingVenueCapacityModel {
  private readonly defaultMaximumParticipationRate:
    number;

  private readonly defaultMaximumVenueQuantity:
    number | null;

  private readonly defaultMinimumAllocationQuantity:
    number;

  private readonly quantityPrecision:
    number;

  public constructor(
    options:
      SmartOrderRoutingVenueCapacityModelOptions =
        {},
  ) {
    this.defaultMaximumParticipationRate =
      options.defaultMaximumParticipationRate ??
      DEFAULT_MAXIMUM_PARTICIPATION_RATE;

    this.defaultMaximumVenueQuantity =
      options.defaultMaximumVenueQuantity ??
      null;

    this.defaultMinimumAllocationQuantity =
      options.defaultMinimumAllocationQuantity ??
      DEFAULT_MINIMUM_ALLOCATION_QUANTITY;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    assertParticipationRate(
      this.defaultMaximumParticipationRate,
      "defaultMaximumParticipationRate",
    );

    assertOptionalFiniteNonNegative(
      this.defaultMaximumVenueQuantity,
      "defaultMaximumVenueQuantity",
    );

    assertFiniteNonNegative(
      this.defaultMinimumAllocationQuantity,
      "defaultMinimumAllocationQuantity",
    );

    assertPrecision(
      this.quantityPrecision,
      "quantityPrecision",
    );
  }

  public calculateCapacity(
    input: SmartOrderRoutingVenueCapacityInput,
  ): SmartOrderRoutingVenueCapacity {
    this.validateInput(
      input,
    );

    const maximumParticipationRate =
      input.maximumParticipationRate ??
      this.defaultMaximumParticipationRate;

    const maximumVenueQuantity =
      input.maximumVenueQuantity ??
      this.defaultMaximumVenueQuantity;

    const minimumAllocationQuantity =
      input.minimumAllocationQuantity ??
      this.defaultMinimumAllocationQuantity;

    const participationLimitedQuantity =
      roundValue(
        input.availableQuantity *
          maximumParticipationRate,
        this.quantityPrecision,
      );

    const venueLimitedQuantity =
      maximumVenueQuantity === null
        ? participationLimitedQuantity
        : roundValue(
            Math.min(
              participationLimitedQuantity,
              maximumVenueQuantity,
            ),
            this.quantityPrecision,
          );

    let routableQuantity =
      roundValue(
        Math.min(
          input.requestedQuantity,
          venueLimitedQuantity,
        ),
        this.quantityPrecision,
      );

    let limitingConstraint:
      SmartOrderRoutingVenueCapacityConstraint;

    if (
      input.availableQuantity <= 0 ||
      maximumParticipationRate <= 0
    ) {
      routableQuantity = 0;
      limitingConstraint =
        "NO_LIQUIDITY";
    } else if (
      routableQuantity <
      minimumAllocationQuantity
    ) {
      routableQuantity = 0;
      limitingConstraint =
        "MINIMUM_ALLOCATION";
    } else if (
      input.requestedQuantity <=
      venueLimitedQuantity
    ) {
      limitingConstraint =
        "REQUEST_QUANTITY";
    } else if (
      maximumVenueQuantity !== null &&
      maximumVenueQuantity <=
        participationLimitedQuantity
    ) {
      limitingConstraint =
        "VENUE_QUANTITY_LIMIT";
    } else {
      limitingConstraint =
        "PARTICIPATION_LIMIT";
    }

    const status =
      this.resolveStatus(
        routableQuantity,
        input.requestedQuantity,
      );

    const effectiveParticipationRate =
      calculateEffectiveParticipationRate(
        routableQuantity,
        input.availableQuantity,
      );

    return Object.freeze({
      exchangeId:
        input.exchangeId,

      accountId:
        input.accountId,

      symbol:
        input.symbol,

      exchangeSymbol:
        input.exchangeSymbol,

      side:
        input.side,

      status,

      requestedQuantity:
        roundValue(
          input.requestedQuantity,
          this.quantityPrecision,
        ),

      availableQuantity:
        roundValue(
          input.availableQuantity,
          this.quantityPrecision,
        ),

      participationLimitedQuantity,

      venueLimitedQuantity,

      routableQuantity,

      effectiveParticipationRate,

      limitingConstraint,

      metadata: mergeMetadata(
        input.metadata,
        Object.freeze({
          capacityModel:
            "DETERMINISTIC_VENUE_CAPACITY",

          maximumParticipationRate,

          maximumVenueQuantity:
            maximumVenueQuantity ??
            "UNLIMITED",

          minimumAllocationQuantity,

          quantityPrecision:
            this.quantityPrecision,
        }),
      ),
    });
  }

  public calculateCapacities(
    inputs:
      readonly SmartOrderRoutingVenueCapacityInput[],
  ): readonly SmartOrderRoutingVenueCapacity[] {
    return Object.freeze(
      inputs.map(
        (input) =>
          this.calculateCapacity(
            input,
          ),
      ),
    );
  }

  public calculateTotalRoutableQuantity(
    inputs:
      readonly SmartOrderRoutingVenueCapacityInput[],
  ): number {
    const capacities =
      this.calculateCapacities(
        inputs,
      );

    return roundValue(
      capacities.reduce(
        (
          total,
          capacity,
        ) =>
          total +
          capacity.routableQuantity,
        0,
      ),
      this.quantityPrecision,
    );
  }

  private resolveStatus(
    routableQuantity: number,
    requestedQuantity: number,
  ): SmartOrderRoutingVenueCapacityStatus {
    if (
      routableQuantity <= 0
    ) {
      return "UNAVAILABLE";
    }

    if (
      routableQuantity <
      requestedQuantity
    ) {
      return "LIMITED";
    }

    return "AVAILABLE";
  }

  private validateInput(
    input: SmartOrderRoutingVenueCapacityInput,
  ): void {
    assertNonEmptyString(
      input.exchangeId,
      "exchangeId",
    );

    assertNonEmptyString(
      input.accountId,
      "accountId",
    );

    assertNonEmptyString(
      input.symbol,
      "symbol",
    );

    assertNonEmptyString(
      input.exchangeSymbol,
      "exchangeSymbol",
    );

    assertFiniteNonNegative(
      input.requestedQuantity,
      "requestedQuantity",
    );

    assertFiniteNonNegative(
      input.availableQuantity,
      "availableQuantity",
    );

    assertOptionalParticipationRate(
      input.maximumParticipationRate,
      "maximumParticipationRate",
    );

    assertOptionalFiniteNonNegative(
      input.maximumVenueQuantity,
      "maximumVenueQuantity",
    );

    assertOptionalFiniteNonNegative(
      input.minimumAllocationQuantity,
      "minimumAllocationQuantity",
    );
  }
}

export function createSmartOrderRoutingVenueCapacityModel(
  options:
    SmartOrderRoutingVenueCapacityModelOptions =
      {},
): SmartOrderRoutingVenueCapacityModel {
  return new SmartOrderRoutingVenueCapacityModel(
    options,
  );
}