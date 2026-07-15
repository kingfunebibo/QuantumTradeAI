import {
  OkxRestAdapter,
} from "./okx-rest-adapter";

import {
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  type OkxTimeframe,
} from "./okx-connector-metadata";

import {
  type OkxInstrumentType,
} from "./okx-symbol-normalizer";

export interface OkxServerTimeRecord {
  readonly ts: string;
}

export interface OkxInstrumentRecord {
  readonly instType: string;
  readonly instId: string;
  readonly uly?: string;
  readonly instFamily?: string;
  readonly category?: string;
  readonly baseCcy?: string;
  readonly quoteCcy?: string;
  readonly settleCcy?: string;
  readonly ctVal?: string;
  readonly ctMult?: string;
  readonly ctValCcy?: string;
  readonly optType?: string;
  readonly stk?: string;
  readonly listTime?: string;
  readonly expTime?: string;
  readonly lever?: string;
  readonly tickSz?: string;
  readonly lotSz?: string;
  readonly minSz?: string;
  readonly ctType?: string;
  readonly alias?: string;
  readonly state?: string;
  readonly maxLmtSz?: string;
  readonly maxMktSz?: string;
  readonly maxTwapSz?: string;
  readonly maxIcebergSz?: string;
  readonly maxTriggerSz?: string;
  readonly maxStopSz?: string;
}

export interface OkxTickerRecord {
  readonly instType: string;
  readonly instId: string;
  readonly last: string;
  readonly lastSz: string;
  readonly askPx: string;
  readonly askSz: string;
  readonly bidPx: string;
  readonly bidSz: string;
  readonly open24h: string;
  readonly high24h: string;
  readonly low24h: string;
  readonly volCcy24h: string;
  readonly vol24h: string;
  readonly sodUtc0: string;
  readonly sodUtc8: string;
  readonly ts: string;
}

export interface OkxOrderBookRecord {
  readonly asks: readonly (readonly string[])[];
  readonly bids: readonly (readonly string[])[];
  readonly ts: string;
}

export interface OkxPublicTradeRecord {
  readonly instId: string;
  readonly tradeId: string;
  readonly px: string;
  readonly sz: string;
  readonly side: "buy" | "sell";
  readonly ts: string;
  readonly source?: string;
}

export type OkxCandleRecord = readonly [
  timestamp: string,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  volumeCurrency: string,
  volumeQuoteCurrency: string,
  confirmed: string,
];

export interface OkxFundingRateRecord {
  readonly instType: string;
  readonly instId: string;
  readonly method?: string;
  readonly formulaType?: string;
  readonly fundingRate: string;
  readonly nextFundingRate?: string;
  readonly fundingTime: string;
  readonly nextFundingTime: string;
  readonly minFundingRate?: string;
  readonly maxFundingRate?: string;
  readonly premium?: string;
  readonly settState?: string;
  readonly settFundingRate?: string;
  readonly ts: string;
}

export interface OkxMarkPriceRecord {
  readonly instType: string;
  readonly instId: string;
  readonly markPx: string;
  readonly ts: string;
}

export interface OkxOpenInterestRecord {
  readonly instType: string;
  readonly instId: string;
  readonly oi: string;
  readonly oiCcy: string;
  readonly oiUsd: string;
  readonly ts: string;
}

export interface OkxGetInstrumentsInput {
  readonly instType: OkxInstrumentType;
  readonly uly?: string;
  readonly instFamily?: string;
  readonly instId?: string;
}

export interface OkxGetTickersInput {
  readonly instType: OkxInstrumentType;
  readonly uly?: string;
  readonly instFamily?: string;
}

export interface OkxGetTickerInput {
  readonly instId: string;
}

export interface OkxGetOrderBookInput {
  readonly instId: string;
  readonly sz?: number;
}

export interface OkxGetTradesInput {
  readonly instId: string;
  readonly limit?: number;
}

export interface OkxGetCandlesInput {
  readonly instId: string;
  readonly bar?: OkxTimeframe;
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

export interface OkxGetFundingRateInput {
  readonly instId: string;
}

export interface OkxGetMarkPriceInput {
  readonly instType: Exclude<
    OkxInstrumentType,
    "SPOT" | "MARGIN"
  >;
  readonly instId?: string;
  readonly uly?: string;
  readonly instFamily?: string;
}

export interface OkxGetOpenInterestInput {
  readonly instType: Exclude<
    OkxInstrumentType,
    "SPOT" | "MARGIN"
  >;
  readonly instId?: string;
  readonly uly?: string;
  readonly instFamily?: string;
}

export class OkxPublicMarketApiError extends Error {
  public readonly code = "OKX_PUBLIC_MARKET_API_ERROR" as const;

  public constructor(message: string) {
    super(message);
    this.name = "OkxPublicMarketApiError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxPublicMarketApi {
  public constructor(
    private readonly restAdapter: OkxRestAdapter,
  ) {
    if (!(restAdapter instanceof OkxRestAdapter)) {
      throw new OkxPublicMarketApiError(
        "restAdapter must be an OkxRestAdapter.",
      );
    }
  }

  public getServerTime(): Promise<
    OkxRestResult<OkxServerTimeRecord>
  > {
    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/public/time",
    });
  }

  public getInstruments(
    input: OkxGetInstrumentsInput,
  ): Promise<OkxRestResult<OkxInstrumentRecord>> {
    validateInstrumentType(input.instType);

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/public/instruments",
      query: compactQuery({
        instType: input.instType,
        uly: input.uly,
        instFamily: input.instFamily,
        instId: input.instId,
      }),
    });
  }

  public getTickers(
    input: OkxGetTickersInput,
  ): Promise<OkxRestResult<OkxTickerRecord>> {
    validateInstrumentType(input.instType);

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/market/tickers",
      query: compactQuery({
        instType: input.instType,
        uly: input.uly,
        instFamily: input.instFamily,
      }),
    });
  }

  public getTicker(
    input: OkxGetTickerInput,
  ): Promise<OkxRestResult<OkxTickerRecord>> {
    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/market/ticker",
      query: {
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
      },
    });
  }

  public getOrderBook(
    input: OkxGetOrderBookInput,
  ): Promise<OkxRestResult<OkxOrderBookRecord>> {
    validateOptionalLimit(input.sz, "sz", 1, 400);

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/market/books",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        sz: input.sz,
      }),
    });
  }

  public getTrades(
    input: OkxGetTradesInput,
  ): Promise<OkxRestResult<OkxPublicTradeRecord>> {
    validateOptionalLimit(
      input.limit,
      "limit",
      1,
      500,
    );

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/market/trades",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        limit: input.limit,
      }),
    });
  }

  public getCandles(
    input: OkxGetCandlesInput,
  ): Promise<OkxRestResult<OkxCandleRecord>> {
    validateOptionalLimit(
      input.limit,
      "limit",
      1,
      300,
    );

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/market/candles",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        bar: input.bar,
        after: input.after,
        before: input.before,
        limit: input.limit,
      }),
    });
  }

  public getFundingRate(
    input: OkxGetFundingRateInput,
  ): Promise<OkxRestResult<OkxFundingRateRecord>> {
    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/public/funding-rate",
      query: {
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
      },
    });
  }

  public getMarkPrice(
    input: OkxGetMarkPriceInput,
  ): Promise<OkxRestResult<OkxMarkPriceRecord>> {
    validateDerivativeInstrumentType(
      input.instType,
    );

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/public/mark-price",
      query: compactQuery({
        instType: input.instType,
        instId: input.instId,
        uly: input.uly,
        instFamily: input.instFamily,
      }),
    });
  }

  public getOpenInterest(
    input: OkxGetOpenInterestInput,
  ): Promise<OkxRestResult<OkxOpenInterestRecord>> {
    validateDerivativeInstrumentType(
      input.instType,
    );

    return this.restAdapter.executePublic({
      method: "GET",
      path: "/api/v5/public/open-interest",
      query: compactQuery({
        instType: input.instType,
        instId: input.instId,
        uly: input.uly,
        instFamily: input.instFamily,
      }),
    });
  }
}

function compactQuery(
  query: Readonly<
    Record<
      string,
      string | number | boolean | null | undefined
    >
  >,
): Readonly<
  Record<string, string | number | boolean>
> {
  const compacted: Record<
    string,
    string | number | boolean
  > = {};

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      compacted[key] = value;
    }
  }

  return Object.freeze(compacted);
}

function validateInstrumentType(
  value: OkxInstrumentType,
): void {
  if (
    value !== "SPOT" &&
    value !== "MARGIN" &&
    value !== "SWAP" &&
    value !== "FUTURES" &&
    value !== "OPTION"
  ) {
    throw new OkxPublicMarketApiError(
      `Unsupported OKX instrument type: "${String(value)}".`,
    );
  }
}

function validateDerivativeInstrumentType(
  value: Exclude<
    OkxInstrumentType,
    "SPOT" | "MARGIN"
  >,
): void {
  if (
    value !== "SWAP" &&
    value !== "FUTURES" &&
    value !== "OPTION"
  ) {
    throw new OkxPublicMarketApiError(
      `Unsupported OKX derivative instrument type: "${String(value)}".`,
    );
  }
}

function validateOptionalLimit(
  value: number | undefined,
  fieldName: string,
  minimum: number,
  maximum: number,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new OkxPublicMarketApiError(
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxPublicMarketApiError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxPublicMarketApiError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}