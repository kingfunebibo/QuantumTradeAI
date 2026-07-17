import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorSymbol,
  CoordinatorTimestamp,
} from "../multi-exchange-coordination/coordinator-contracts";
import type {
  SmartOrderRoutingLiquidityLevel,
  SmartOrderRoutingLiquiditySnapshot,
} from "./smart-order-routing-contracts";

export interface SmartOrderRoutingAggregatedLiquiditySource {
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly exchangeSymbol: string;

  readonly price: number;
  readonly availableQuantity: number;

  readonly capturedAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingAggregatedLiquidityLevel {
  readonly price: number;
  readonly quantity: number;

  readonly cumulativeQuantity: number;
  readonly cumulativeNotional: number;

  readonly sources:
    readonly SmartOrderRoutingAggregatedLiquiditySource[];

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingAggregatedLiquidityBook {
  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;

  readonly levels:
    readonly SmartOrderRoutingAggregatedLiquidityLevel[];

  readonly venueCount: number;
  readonly sourceCount: number;

  readonly totalQuantity: number;
  readonly totalNotional: number;

  readonly bestPrice: number | null;
  readonly worstPrice: number | null;

  readonly capturedAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;

  readonly metadata: CoordinatorMetadata;
}

export interface SmartOrderRoutingAggregatedLiquidityBookInput {
  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;

  readonly snapshots:
    readonly SmartOrderRoutingLiquiditySnapshot[];

  readonly capturedAt?: CoordinatorTimestamp;
  readonly metadata?: CoordinatorMetadata;
}

export interface SmartOrderRoutingAggregatedLiquidityBookBuilderOptions {
  readonly pricePrecision?: number;
  readonly quantityPrecision?: number;
}

interface MutableAggregatedLevel {
  readonly price: number;
  quantity: number;

  readonly sources:
    SmartOrderRoutingAggregatedLiquiditySource[];
}

const DEFAULT_PRICE_PRECISION = 12;
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

function assertPositiveIntegerPrecision(
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
  const factor = 10 ** precision;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function getExpectedLiquiditySide(
  side: CoordinatorOrderSide,
): "BID" | "ASK" {
  return side === "BUY"
    ? "ASK"
    : "BID";
}

function validateSnapshot(
  input: SmartOrderRoutingAggregatedLiquidityBookInput,
  snapshot: SmartOrderRoutingLiquiditySnapshot,
  index: number,
): void {
  if (
    snapshot.symbol !==
    input.symbol
  ) {
    throw new Error(
      `snapshots[${index}].symbol does not match the aggregated book symbol.`,
    );
  }

  const expectedSide =
    getExpectedLiquiditySide(
      input.side,
    );

  if (
    snapshot.side !==
    expectedSide
  ) {
    throw new Error(
      `snapshots[${index}].side must be ${expectedSide} for a ${input.side} routing book.`,
    );
  }

  assertNonEmptyString(
    snapshot.exchangeId,
    `snapshots[${index}].exchangeId`,
  );

  assertNonEmptyString(
    snapshot.accountId,
    `snapshots[${index}].accountId`,
  );

  assertNonEmptyString(
    snapshot.exchangeSymbol,
    `snapshots[${index}].exchangeSymbol`,
  );

  assertFiniteNonNegative(
    snapshot.capturedAt,
    `snapshots[${index}].capturedAt`,
  );

  if (
    snapshot.expiresAt !== null
  ) {
    assertFiniteNonNegative(
      snapshot.expiresAt,
      `snapshots[${index}].expiresAt`,
    );

    if (
      snapshot.expiresAt <
      snapshot.capturedAt
    ) {
      throw new Error(
        `snapshots[${index}].expiresAt cannot be earlier than capturedAt.`,
      );
    }
  }
}

function isExpired(
  snapshot: SmartOrderRoutingLiquiditySnapshot,
  capturedAt: CoordinatorTimestamp,
): boolean {
  return (
    snapshot.expiresAt !== null &&
    snapshot.expiresAt <
      capturedAt
  );
}

function comparePrices(
  side: CoordinatorOrderSide,
  left: number,
  right: number,
): number {
  return side === "BUY"
    ? left - right
    : right - left;
}

function calculateBookExpiry(
  snapshots:
    readonly SmartOrderRoutingLiquiditySnapshot[],
): CoordinatorTimestamp | null {
  const expiries =
    snapshots
      .map(
        (snapshot) =>
          snapshot.expiresAt,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  if (expiries.length === 0) {
    return null;
  }

  return Math.min(...expiries);
}

function buildSource(
  snapshot: SmartOrderRoutingLiquiditySnapshot,
  level: SmartOrderRoutingLiquidityLevel,
  quantityPrecision: number,
): SmartOrderRoutingAggregatedLiquiditySource {
  return Object.freeze({
    exchangeId:
      snapshot.exchangeId,

    accountId:
      snapshot.accountId,

    exchangeSymbol:
      snapshot.exchangeSymbol,

    price: level.price,

    availableQuantity:
      roundValue(
        level.quantity,
        quantityPrecision,
      ),

    capturedAt:
      snapshot.capturedAt,

    expiresAt:
      snapshot.expiresAt,

    metadata: mergeMetadata(
      snapshot.metadata,
      Object.freeze({
        originalLevelQuantity:
          level.quantity,
      }),
    ),
  });
}

export class SmartOrderRoutingAggregatedLiquidityBookBuilder {
  private readonly pricePrecision:
    number;

  private readonly quantityPrecision:
    number;

  public constructor(
    options:
      SmartOrderRoutingAggregatedLiquidityBookBuilderOptions =
        {},
  ) {
    this.pricePrecision =
      options.pricePrecision ??
      DEFAULT_PRICE_PRECISION;

    this.quantityPrecision =
      options.quantityPrecision ??
      DEFAULT_QUANTITY_PRECISION;

    assertPositiveIntegerPrecision(
      this.pricePrecision,
      "pricePrecision",
    );

    assertPositiveIntegerPrecision(
      this.quantityPrecision,
      "quantityPrecision",
    );
  }

  public build(
    input: SmartOrderRoutingAggregatedLiquidityBookInput,
  ): SmartOrderRoutingAggregatedLiquidityBook {
    assertNonEmptyString(
      input.symbol,
      "symbol",
    );

    const capturedAt =
      input.capturedAt ??
      this.resolveCapturedAt(
        input.snapshots,
      );

    assertFiniteNonNegative(
      capturedAt,
      "capturedAt",
    );

    const activeSnapshots =
      input.snapshots.filter(
        (snapshot, index) => {
          validateSnapshot(
            input,
            snapshot,
            index,
          );

          return !isExpired(
            snapshot,
            capturedAt,
          );
        },
      );

    const levelsByPrice =
      new Map<
        number,
        MutableAggregatedLevel
      >();

    for (
      const snapshot
      of activeSnapshots
    ) {
      for (
        const level
        of snapshot.levels
      ) {
        if (
          level.quantity <= 0
        ) {
          continue;
        }

        const normalizedPrice =
          roundValue(
            level.price,
            this.pricePrecision,
          );

        const normalizedQuantity =
          roundValue(
            level.quantity,
            this.quantityPrecision,
          );

        if (
          normalizedQuantity <= 0
        ) {
          continue;
        }

        const source =
          buildSource(
            snapshot,
            {
              ...level,
              price:
                normalizedPrice,
              quantity:
                normalizedQuantity,
            },
            this.quantityPrecision,
          );

        const existing =
          levelsByPrice.get(
            normalizedPrice,
          );

        if (existing === undefined) {
          levelsByPrice.set(
            normalizedPrice,
            {
              price:
                normalizedPrice,

              quantity:
                normalizedQuantity,

              sources: [
                source,
              ],
            },
          );

          continue;
        }

        existing.quantity =
          roundValue(
            existing.quantity +
              normalizedQuantity,
            this.quantityPrecision,
          );

        existing.sources.push(
          source,
        );
      }
    }

    const sortedLevels =
      [...levelsByPrice.values()]
        .sort(
          (left, right) =>
            comparePrices(
              input.side,
              left.price,
              right.price,
            ),
        );

    let cumulativeQuantity = 0;
    let cumulativeNotional = 0;
    let sourceCount = 0;

    const levels:
      SmartOrderRoutingAggregatedLiquidityLevel[] =
      [];

    for (
      const level
      of sortedLevels
    ) {
      cumulativeQuantity =
        roundValue(
          cumulativeQuantity +
            level.quantity,
          this.quantityPrecision,
        );

      cumulativeNotional =
        roundValue(
          cumulativeNotional +
            level.price *
              level.quantity,
          this.pricePrecision,
        );

      sourceCount +=
        level.sources.length;

      const sources =
        Object.freeze(
          [...level.sources].sort(
            (left, right) => {
              const exchangeComparison =
                left.exchangeId.localeCompare(
                  right.exchangeId,
                );

              if (
                exchangeComparison !== 0
              ) {
                return exchangeComparison;
              }

              return left.accountId.localeCompare(
                right.accountId,
              );
            },
          ),
        );

      levels.push(
        Object.freeze({
          price:
            level.price,

          quantity:
            level.quantity,

          cumulativeQuantity,

          cumulativeNotional,

          sources,

          metadata: mergeMetadata(
            Object.freeze({
              sourceCount:
                sources.length,
            }),
          ),
        }),
      );
    }

    const bestPrice =
      levels[0]?.price ??
      null;

    const worstPrice =
      levels.length > 0
        ? levels[
            levels.length - 1
          ]?.price ?? null
        : null;

    const venueKeys =
      new Set(
        activeSnapshots.map(
          (snapshot) =>
            [
              snapshot.exchangeId,
              snapshot.accountId,
            ].join(":"),
        ),
      );

    return Object.freeze({
      symbol: input.symbol,
      side: input.side,

      levels:
        Object.freeze(levels),

      venueCount:
        venueKeys.size,

      sourceCount,

      totalQuantity:
        cumulativeQuantity,

      totalNotional:
        cumulativeNotional,

      bestPrice,

      worstPrice,

      capturedAt,

      expiresAt:
        calculateBookExpiry(
          activeSnapshots,
        ),

      metadata: mergeMetadata(
        input.metadata,
        Object.freeze({
          suppliedSnapshotCount:
            input.snapshots.length,

          activeSnapshotCount:
            activeSnapshots.length,

          expiredSnapshotCount:
            input.snapshots.length -
            activeSnapshots.length,

          priceLevelCount:
            levels.length,
        }),
      ),
    });
  }

  private resolveCapturedAt(
    snapshots:
      readonly SmartOrderRoutingLiquiditySnapshot[],
  ): CoordinatorTimestamp {
    if (
      snapshots.length === 0
    ) {
      return 0;
    }

    return Math.max(
      ...snapshots.map(
        (snapshot) =>
          snapshot.capturedAt,
      ),
    );
  }
}

export function createSmartOrderRoutingAggregatedLiquidityBookBuilder(
  options:
    SmartOrderRoutingAggregatedLiquidityBookBuilderOptions =
      {},
): SmartOrderRoutingAggregatedLiquidityBookBuilder {
  return new SmartOrderRoutingAggregatedLiquidityBookBuilder(
    options,
  );
}