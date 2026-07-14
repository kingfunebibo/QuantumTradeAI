/**
 * QuantumTradeAI
 * Historical Data Management & Dataset Infrastructure
 *
 * File:
 * src/trading/historical-data/historical-dataset.types.ts
 *
 * Purpose:
 * Defines the immutable domain types used by the historical dataset subsystem.
 *
 * Design goals:
 * - Deterministic
 * - Immutable
 * - Strongly typed
 * - Exchange agnostic
 * - Multi-symbol
 * - Multi-timeframe
 * - Partition aware
 * - Checksum ready
 * - Streaming ready
 * - Suitable for institutional-grade validation and storage
 */

/**
 * Nominal typing prevents accidentally mixing ordinary strings and numbers
 * with validated historical-data domain values.
 */
declare const historicalDataBrand: unique symbol;

export type HistoricalDataBrand<
  TValue,
  TBrand extends string,
> = TValue & {
  readonly [historicalDataBrand]: TBrand;
};

/**
 * Globally unique dataset identifier.
 *
 * Example:
 * historical-dataset:binance:BTCUSDT:1m:1704067200000:1704153540000
 */
export type HistoricalDatasetId = HistoricalDataBrand<
  string,
  "HistoricalDatasetId"
>;

/**
 * Exchange or external data-source identifier.
 *
 * Examples:
 * binance
 * bybit
 * okx
 * coinbase
 * imported-csv
 */
export type HistoricalDataSource = HistoricalDataBrand<
  string,
  "HistoricalDataSource"
>;

/**
 * Normalized market symbol.
 *
 * Examples:
 * BTCUSDT
 * ETHUSDT
 * SOLUSDT
 */
export type HistoricalMarketSymbol = HistoricalDataBrand<
  string,
  "HistoricalMarketSymbol"
>;

/**
 * Unix timestamp measured in milliseconds.
 */
export type HistoricalTimestamp = HistoricalDataBrand<
  number,
  "HistoricalTimestamp"
>;

/**
 * Positive integer candle sequence number within a dataset.
 *
 * Sequence numbers provide deterministic ordering independently of array
 * position or storage implementation.
 */
export type HistoricalSequence = HistoricalDataBrand<
  number,
  "HistoricalSequence"
>;

/**
 * Non-negative candle price.
 */
export type HistoricalPrice = HistoricalDataBrand<number, "HistoricalPrice">;

/**
 * Non-negative candle volume.
 */
export type HistoricalVolume = HistoricalDataBrand<number, "HistoricalVolume">;

/**
 * Positive integer count.
 */
export type HistoricalCount = HistoricalDataBrand<number, "HistoricalCount">;

/**
 * Dataset version.
 *
 * Versions allow an imported dataset to be replaced or corrected without
 * silently mutating the original dataset identity.
 */
export type HistoricalDatasetVersion = HistoricalDataBrand<
  number,
  "HistoricalDatasetVersion"
>;

/**
 * Dataset checksum value.
 */
export type HistoricalChecksumValue = HistoricalDataBrand<
  string,
  "HistoricalChecksumValue"
>;

/**
 * Dataset partition identifier.
 */
export type HistoricalPartitionId = HistoricalDataBrand<
  string,
  "HistoricalPartitionId"
>;

/**
 * Supported canonical candle timeframes.
 *
 * Additional timeframe support can be introduced without changing the
 * structure of dataset records.
 */
export const HISTORICAL_TIMEFRAMES = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

export type HistoricalTimeframe =
  (typeof HISTORICAL_TIMEFRAMES)[number];

/**
 * Millisecond duration for fixed-duration timeframes.
 *
 * Calendar-month candles are deliberately excluded because their exact
 * duration depends on the calendar month.
 */
export const FIXED_HISTORICAL_TIMEFRAME_MILLISECONDS = {
  "1s": 1_000,
  "5s": 5_000,
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "8h": 8 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
} as const satisfies Readonly<
  Record<Exclude<HistoricalTimeframe, "1M">, number>
>;

/**
 * Dataset lifecycle state.
 *
 * CREATED:
 * Metadata exists, but import has not begun.
 *
 * IMPORTING:
 * Records are being ingested.
 *
 * VALIDATING:
 * Integrity validation is running.
 *
 * READY:
 * Dataset has passed the required validation policy.
 *
 * REJECTED:
 * Dataset failed validation and cannot be used.
 *
 * ARCHIVED:
 * Dataset is retained but unavailable for normal loading.
 */
export const HISTORICAL_DATASET_STATUSES = [
  "CREATED",
  "IMPORTING",
  "VALIDATING",
  "READY",
  "REJECTED",
  "ARCHIVED",
] as const;

export type HistoricalDatasetStatus =
  (typeof HISTORICAL_DATASET_STATUSES)[number];

/**
 * Origin of the historical data.
 */
export const HISTORICAL_DATASET_ORIGINS = [
  "EXCHANGE_API",
  "CSV_IMPORT",
  "JSON_IMPORT",
  "DATABASE_IMPORT",
  "STREAM_CAPTURE",
  "GENERATED",
  "UNKNOWN",
] as const;

export type HistoricalDatasetOrigin =
  (typeof HISTORICAL_DATASET_ORIGINS)[number];

/**
 * Market type represented by the dataset.
 */
export const HISTORICAL_MARKET_TYPES = [
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "FUTURES",
  "OPTIONS",
  "INDEX",
  "UNKNOWN",
] as const;

export type HistoricalMarketType =
  (typeof HISTORICAL_MARKET_TYPES)[number];

/**
 * Checksum algorithms supported by the subsystem.
 */
export const HISTORICAL_CHECKSUM_ALGORITHMS = [
  "SHA256",
  "SHA384",
  "SHA512",
] as const;

export type HistoricalChecksumAlgorithm =
  (typeof HISTORICAL_CHECKSUM_ALGORITHMS)[number];

/**
 * How dataset partitions are organized.
 */
export const HISTORICAL_PARTITION_STRATEGIES = [
  "NONE",
  "BY_RECORD_COUNT",
  "BY_DAY",
  "BY_WEEK",
  "BY_MONTH",
  "BY_YEAR",
] as const;

export type HistoricalPartitionStrategy =
  (typeof HISTORICAL_PARTITION_STRATEGIES)[number];

/**
 * Dataset storage encoding.
 */
export const HISTORICAL_DATASET_ENCODINGS = [
  "MEMORY",
  "JSON",
  "JSON_LINES",
  "CSV",
  "PARQUET",
  "DATABASE",
] as const;

export type HistoricalDatasetEncoding =
  (typeof HISTORICAL_DATASET_ENCODINGS)[number];

/**
 * Immutable OHLCV candle stored in a historical dataset.
 *
 * The opening timestamp identifies the candle.
 * The closing timestamp represents the final millisecond covered by it.
 */
export interface HistoricalCandle {
  readonly sequence: HistoricalSequence;

  readonly openTime: HistoricalTimestamp;
  readonly closeTime: HistoricalTimestamp;

  readonly open: HistoricalPrice;
  readonly high: HistoricalPrice;
  readonly low: HistoricalPrice;
  readonly close: HistoricalPrice;

  readonly volume: HistoricalVolume;

  /**
   * Optional quote-asset volume.
   *
   * Example:
   * For BTCUSDT, volume is BTC volume and quoteVolume is USDT volume.
   */
  readonly quoteVolume?: HistoricalVolume;

  /**
   * Optional exchange trade count associated with the candle.
   */
  readonly tradeCount?: HistoricalCount;

  /**
   * Optional taker-buy base-asset volume.
   */
  readonly takerBuyBaseVolume?: HistoricalVolume;

  /**
   * Optional taker-buy quote-asset volume.
   */
  readonly takerBuyQuoteVolume?: HistoricalVolume;

  /**
   * Whether the external data source considers this candle final.
   */
  readonly isClosed: boolean;
}

/**
 * Inclusive dataset time range.
 */
export interface HistoricalDatasetTimeRange {
  readonly startTime: HistoricalTimestamp;
  readonly endTime: HistoricalTimestamp;
}

/**
 * Immutable checksum information.
 */
export interface HistoricalDatasetChecksum {
  readonly algorithm: HistoricalChecksumAlgorithm;
  readonly value: HistoricalChecksumValue;

  /**
   * Timestamp at which the checksum was produced.
   *
   * The checksum operation itself must receive this timestamp from an
   * injectable clock to preserve deterministic execution.
   */
  readonly calculatedAt: HistoricalTimestamp;

  /**
   * Number of records included in the checksum.
   */
  readonly recordCount: HistoricalCount;
}

/**
 * Immutable dataset partition definition.
 */
export interface HistoricalDatasetPartition {
  readonly id: HistoricalPartitionId;
  readonly datasetId: HistoricalDatasetId;

  readonly ordinal: number;
  readonly strategy: HistoricalPartitionStrategy;

  readonly range: HistoricalDatasetTimeRange;

  readonly firstSequence: HistoricalSequence;
  readonly lastSequence: HistoricalSequence;

  readonly recordCount: HistoricalCount;

  /**
   * Storage-relative path or repository-specific partition location.
   */
  readonly location?: string;

  readonly checksum?: HistoricalDatasetChecksum;
}

/**
 * Describes the physical or logical storage layout of the dataset.
 */
export interface HistoricalDatasetStorage {
  readonly encoding: HistoricalDatasetEncoding;
  readonly partitionStrategy: HistoricalPartitionStrategy;

  /**
   * Repository-relative storage location.
   */
  readonly location?: string;

  readonly partitions: readonly HistoricalDatasetPartition[];
}

/**
 * Free-form metadata value constrained to deterministic JSON-compatible
 * structures.
 */
export type HistoricalMetadataPrimitive = string | number | boolean | null;

export type HistoricalMetadataValue =
  | HistoricalMetadataPrimitive
  | readonly HistoricalMetadataValue[]
  | {
      readonly [key: string]: HistoricalMetadataValue;
    };

export type HistoricalMetadataAttributes = Readonly<
  Record<string, HistoricalMetadataValue>
>;

/**
 * Immutable metadata associated with a historical dataset.
 */
export interface HistoricalDatasetMetadata {
  readonly datasetId: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly source: HistoricalDataSource;
  readonly origin: HistoricalDatasetOrigin;
  readonly marketType: HistoricalMarketType;

  readonly symbol: HistoricalMarketSymbol;
  readonly timeframe: HistoricalTimeframe;

  readonly range: HistoricalDatasetTimeRange;
  readonly recordCount: HistoricalCount;

  readonly createdAt: HistoricalTimestamp;
  readonly updatedAt: HistoricalTimestamp;

  /**
   * Optional external source-specific dataset identifier.
   */
  readonly externalReference?: string;

  /**
   * Optional human-readable dataset description.
   */
  readonly description?: string;

  /**
   * Optional immutable custom attributes.
   */
  readonly attributes?: HistoricalMetadataAttributes;
}

/**
 * Core historical dataset aggregate.
 *
 * Models are readonly by contract. Implementations must return new aggregate
 * instances rather than mutating existing ones.
 */
export interface HistoricalDataset {
  readonly id: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;
  readonly status: HistoricalDatasetStatus;

  readonly metadata: HistoricalDatasetMetadata;
  readonly storage: HistoricalDatasetStorage;

  /**
   * Dataset-wide checksum.
   *
   * This can be absent while importing or before checksum calculation.
   */
  readonly checksum?: HistoricalDatasetChecksum;
}

/**
 * A fully materialized dataset containing its candle records.
 *
 * This model should be used only where loading the complete dataset is
 * appropriate. Streaming consumers should operate on asynchronous iterables
 * instead.
 */
export interface LoadedHistoricalDataset {
  readonly dataset: HistoricalDataset;
  readonly candles: readonly HistoricalCandle[];
}

/**
 * Dataset stream record.
 *
 * The partition information allows consumers to retain deterministic storage
 * and replay boundaries while processing records incrementally.
 */
export interface HistoricalDatasetStreamRecord {
  readonly datasetId: HistoricalDatasetId;
  readonly partitionId?: HistoricalPartitionId;
  readonly candle: HistoricalCandle;
}

/**
 * Typed input used when creating a dataset.
 *
 * Generated values such as checksums and storage partitions are deliberately
 * excluded from the creation request.
 */
export interface CreateHistoricalDatasetInput {
  readonly id: HistoricalDatasetId;
  readonly version: HistoricalDatasetVersion;

  readonly source: HistoricalDataSource;
  readonly origin: HistoricalDatasetOrigin;
  readonly marketType: HistoricalMarketType;

  readonly symbol: HistoricalMarketSymbol;
  readonly timeframe: HistoricalTimeframe;

  readonly range: HistoricalDatasetTimeRange;
  readonly recordCount: HistoricalCount;

  readonly createdAt: HistoricalTimestamp;

  readonly encoding: HistoricalDatasetEncoding;
  readonly partitionStrategy: HistoricalPartitionStrategy;

  readonly externalReference?: string;
  readonly description?: string;
  readonly attributes?: HistoricalMetadataAttributes;
}

/**
 * Immutable index key for locating a dataset.
 */
export interface HistoricalDatasetIndexKey {
  readonly source: HistoricalDataSource;
  readonly marketType: HistoricalMarketType;
  readonly symbol: HistoricalMarketSymbol;
  readonly timeframe: HistoricalTimeframe;
  readonly version?: HistoricalDatasetVersion;
}

/**
 * Dataset query used by repositories and loaders.
 */
export interface HistoricalDatasetQuery {
  readonly ids?: readonly HistoricalDatasetId[];

  readonly sources?: readonly HistoricalDataSource[];
  readonly marketTypes?: readonly HistoricalMarketType[];
  readonly symbols?: readonly HistoricalMarketSymbol[];
  readonly timeframes?: readonly HistoricalTimeframe[];
  readonly statuses?: readonly HistoricalDatasetStatus[];
  readonly origins?: readonly HistoricalDatasetOrigin[];

  /**
   * Returns datasets whose time ranges overlap this range.
   */
  readonly overlappingRange?: HistoricalDatasetTimeRange;

  /**
   * Optional exact version constraint.
   */
  readonly version?: HistoricalDatasetVersion;

  /**
   * Maximum number of results.
   */
  readonly limit?: number;

  /**
   * Deterministic pagination offset.
   */
  readonly offset?: number;
}

/**
 * Sort fields supported by dataset repositories.
 */
export const HISTORICAL_DATASET_SORT_FIELDS = [
  "CREATED_AT",
  "UPDATED_AT",
  "START_TIME",
  "END_TIME",
  "RECORD_COUNT",
  "VERSION",
] as const;

export type HistoricalDatasetSortField =
  (typeof HISTORICAL_DATASET_SORT_FIELDS)[number];

export type HistoricalDatasetSortDirection = "ASC" | "DESC";

export interface HistoricalDatasetSort {
  readonly field: HistoricalDatasetSortField;
  readonly direction: HistoricalDatasetSortDirection;
}

/**
 * Paginated repository result.
 */
export interface HistoricalDatasetPage {
  readonly items: readonly HistoricalDataset[];
  readonly total: HistoricalCount;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

/**
 * Public primitive factory helpers.
 *
 * Full semantic validation will be centralized in a later domain factory and
 * validator file. These helpers perform only minimal runtime checks so unsafe
 * casts are not spread throughout the codebase.
 */

export function historicalDatasetId(
  value: string,
): HistoricalDatasetId {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(
      "Historical dataset ID must be a non-empty string.",
    );
  }

  return normalized as HistoricalDatasetId;
}

export function historicalDataSource(
  value: string,
): HistoricalDataSource {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new TypeError(
      "Historical data source must be a non-empty string.",
    );
  }

  return normalized as HistoricalDataSource;
}

export function historicalMarketSymbol(
  value: string,
): HistoricalMarketSymbol {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (normalized.length === 0) {
    throw new TypeError(
      "Historical market symbol must contain letters or numbers.",
    );
  }

  return normalized as HistoricalMarketSymbol;
}

export function historicalTimestamp(
  value: number,
): HistoricalTimestamp {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      "Historical timestamp must be a non-negative safe integer.",
    );
  }

  return value as HistoricalTimestamp;
}

export function historicalSequence(
  value: number,
): HistoricalSequence {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      "Historical sequence must be a non-negative safe integer.",
    );
  }

  return value as HistoricalSequence;
}

export function historicalPrice(value: number): HistoricalPrice {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(
      "Historical price must be a finite non-negative number.",
    );
  }

  return value as HistoricalPrice;
}

export function historicalVolume(
  value: number,
): HistoricalVolume {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(
      "Historical volume must be a finite non-negative number.",
    );
  }

  return value as HistoricalVolume;
}

export function historicalCount(value: number): HistoricalCount {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      "Historical count must be a non-negative safe integer.",
    );
  }

  return value as HistoricalCount;
}

export function historicalDatasetVersion(
  value: number,
): HistoricalDatasetVersion {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      "Historical dataset version must be a positive safe integer.",
    );
  }

  return value as HistoricalDatasetVersion;
}

export function historicalChecksumValue(
  value: string,
): HistoricalChecksumValue {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new TypeError(
      "Historical checksum value must be a non-empty string.",
    );
  }

  return normalized as HistoricalChecksumValue;
}

export function historicalPartitionId(
  value: string,
): HistoricalPartitionId {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(
      "Historical partition ID must be a non-empty string.",
    );
  }

  return normalized as HistoricalPartitionId;
}

/**
 * Type guard for supported historical timeframes.
 */
export function isHistoricalTimeframe(
  value: string,
): value is HistoricalTimeframe {
  return (HISTORICAL_TIMEFRAMES as readonly string[]).includes(value);
}

/**
 * Returns the fixed duration of a timeframe in milliseconds.
 *
 * Calendar-month candles return undefined because their duration varies.
 */
export function getHistoricalTimeframeMilliseconds(
  timeframe: HistoricalTimeframe,
): number | undefined {
  if (timeframe === "1M") {
    return undefined;
  }

  return FIXED_HISTORICAL_TIMEFRAME_MILLISECONDS[timeframe];
}