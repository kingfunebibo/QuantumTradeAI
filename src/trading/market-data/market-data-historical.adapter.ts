import {
  HistoricalCandle,
  historicalCount,
  historicalPrice,
  historicalSequence,
  historicalTimestamp,
  historicalVolume,
} from "../historical-data";

import {
  MarketDataCandle,
  MarketDataHistoricalCandlesRequest,
} from "./market-data-provider.types";

import {
  MarketDataManager,
  MarketDataManagerRequestOptions,
  MarketDataManagerResponse,
} from "./market-data-manager";

/**
 * Input for loading historical candles through the unified market-data
 * manager and converting them into the deterministic historical-data model.
 */
export interface LoadHistoricalCandlesFromMarketDataInput {
  readonly request:
    MarketDataHistoricalCandlesRequest;

  readonly options?:
    MarketDataManagerRequestOptions;

  /**
   * Sequence number assigned to the first returned candle.
   *
   * Default: 0.
   */
  readonly startingSequence?:
    number;
}

/**
 * Result returned by the historical market-data adapter.
 */
export interface HistoricalMarketDataLoadResult {
  readonly candles:
    readonly HistoricalCandle[];

  readonly source:
    MarketDataManagerResponse<
      readonly MarketDataCandle[]
    >;
}

/**
 * Adapter contract used to bridge the unified market-data framework and the
 * deterministic historical-data/backtesting infrastructure.
 */
export interface HistoricalMarketDataAdapter {
  load(
    input:
      LoadHistoricalCandlesFromMarketDataInput,
  ): Promise<
    HistoricalMarketDataLoadResult
  >;

  convert(
    candles:
      readonly MarketDataCandle[],
    startingSequence?:
      number,
  ): readonly HistoricalCandle[];
}

/**
 * Default deterministic historical market-data adapter.
 *
 * Responsibilities:
 *
 * - Load candles through MarketDataManager.
 * - Preserve manager routing and failover metadata.
 * - Validate deterministic ordering.
 * - Convert canonical market-data candles into HistoricalCandle records.
 * - Assign deterministic sequences.
 * - Return immutable defensive results.
 */
export class DefaultHistoricalMarketDataAdapter
  implements HistoricalMarketDataAdapter
{
  private readonly manager:
    MarketDataManager;

  public constructor(
    manager:
      MarketDataManager,
  ) {
    this.manager =
      manager;
  }

  /**
   * Loads candles through the market-data manager and converts them into
   * deterministic historical records.
   */
  public async load(
    input:
      LoadHistoricalCandlesFromMarketDataInput,
  ): Promise<
    HistoricalMarketDataLoadResult
  > {
    validateStartingSequence(
      input.startingSequence,
    );

    const source =
      await this.manager
        .getHistoricalCandles(
          input.request,
          input.options,
        );

    const candles =
      this.convert(
        source.response.data,
        input.startingSequence,
      );

    return Object.freeze({
      candles,
      source,
    });
  }

  /**
   * Converts canonical market-data candles into deterministic historical
   * candles.
   */
  public convert(
    candles:
      readonly MarketDataCandle[],
    startingSequence = 0,
  ): readonly HistoricalCandle[] {
    validateStartingSequence(
      startingSequence,
    );

    validateMarketDataCandleOrdering(
      candles,
    );

    return Object.freeze(
      candles.map(
        (
          candle,
          index,
        ) =>
          convertMarketDataCandle({
            candle,

            sequence:
              startingSequence +
              index,
          }),
      ),
    );
  }
}

/**
 * Converts one canonical market-data candle into a historical candle.
 */
export function convertMarketDataCandle(
  input: Readonly<{
    candle:
      MarketDataCandle;

    sequence:
      number;
  }>,
): HistoricalCandle {
  validateStartingSequence(
    input.sequence,
  );

  validateMarketDataCandleForHistoricalUse(
    input.candle,
  );

  return Object.freeze({
    sequence:
      historicalSequence(
        input.sequence,
      ),

    openTime:
      historicalTimestamp(
        Number(
          input.candle.openTime,
        ),
      ),

    closeTime:
      historicalTimestamp(
        Number(
          input.candle.closeTime,
        ),
      ),

    open:
      historicalPrice(
        Number(
          input.candle.open,
        ),
      ),

    high:
      historicalPrice(
        Number(
          input.candle.high,
        ),
      ),

    low:
      historicalPrice(
        Number(
          input.candle.low,
        ),
      ),

    close:
      historicalPrice(
        Number(
          input.candle.close,
        ),
      ),

    volume:
      historicalVolume(
        Number(
          input.candle.volume,
        ),
      ),

    ...(input.candle
      .quoteVolume === undefined
      ? {}
      : {
          quoteVolume:
            historicalVolume(
              Number(
                input.candle
                  .quoteVolume,
              ),
            ),
        }),

    ...(input.candle
      .tradeCount === undefined
      ? {}
      : {
          tradeCount:
            historicalCount(
              Number(
                input.candle
                  .tradeCount,
              ),
            ),
        }),

    ...(input.candle
      .takerBuyBaseVolume ===
    undefined
      ? {}
      : {
          takerBuyBaseVolume:
            historicalVolume(
              Number(
                input.candle
                  .takerBuyBaseVolume,
              ),
            ),
        }),

    ...(input.candle
      .takerBuyQuoteVolume ===
    undefined
      ? {}
      : {
          takerBuyQuoteVolume:
            historicalVolume(
              Number(
                input.candle
                  .takerBuyQuoteVolume,
              ),
            ),
        }),

    isClosed:
      input.candle.isClosed,
  });
}

/**
 * Validates deterministic candle ordering.
 */
function validateMarketDataCandleOrdering(
  candles:
    readonly MarketDataCandle[],
): void {
  for (
    let index = 0;
    index < candles.length;
    index += 1
  ) {
    const current =
      candles[index];

    if (current === undefined) {
      continue;
    }

    validateMarketDataCandleForHistoricalUse(
      current,
    );

    if (index === 0) {
      continue;
    }

    const previous =
      candles[index - 1];

    if (previous === undefined) {
      continue;
    }

    if (
      Number(
        current.openTime,
      ) <=
      Number(
        previous.openTime,
      )
    ) {
      throw new Error(
        [
          "Market-data candles must be ordered by strictly increasing",
          `open time. Invalid record index: ${index}.`,
        ].join(" "),
      );
    }
  }
}

/**
 * Validates one candle before conversion.
 */
function validateMarketDataCandleForHistoricalUse(
  candle:
    MarketDataCandle,
): void {
  if (
    Number(
      candle.closeTime,
    ) <
    Number(
      candle.openTime,
    )
  ) {
    throw new Error(
      "Market-data candle close time must not be earlier than open time.",
    );
  }

  if (
    Number(candle.high) <
      Number(candle.low) ||
    Number(candle.open) <
      Number(candle.low) ||
    Number(candle.open) >
      Number(candle.high) ||
    Number(candle.close) <
      Number(candle.low) ||
    Number(candle.close) >
      Number(candle.high)
  ) {
    throw new Error(
      "Market-data candle contains an invalid OHLC range.",
    );
  }

  if (
    !Number.isFinite(
      Number(candle.volume),
    ) ||
    Number(candle.volume) <
      0
  ) {
    throw new Error(
      "Market-data candle volume must be finite and non-negative.",
    );
  }

  if (
    typeof candle.isClosed !==
    "boolean"
  ) {
    throw new Error(
      "Market-data candle isClosed must be boolean.",
    );
  }
}

/**
 * Validates deterministic sequence configuration.
 */
function validateStartingSequence(
  value:
    number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value < 0
  ) {
    throw new Error(
      "Historical market-data starting sequence must be a non-negative safe integer.",
    );
  }
}