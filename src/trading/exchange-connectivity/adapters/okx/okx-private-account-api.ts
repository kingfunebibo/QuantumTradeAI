import {
  OkxRestAdapter,
} from "./okx-rest-adapter";

import {
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  type OkxInstrumentType,
} from "./okx-symbol-normalizer";

export type OkxAccountTradingMode =
  | "cash"
  | "cross"
  | "isolated";

export interface OkxBalanceDetailRecord {
  readonly ccy: string;
  readonly eq: string;
  readonly cashBal: string;
  readonly uTime: string;
  readonly isoEq: string;
  readonly availEq: string;
  readonly disEq: string;
  readonly fixedBal: string;
  readonly availBal: string;
  readonly frozenBal: string;
  readonly ordFrozen: string;
  readonly liab: string;
  readonly upl: string;
  readonly uplLiab: string;
  readonly crossLiab: string;
  readonly isoLiab: string;
  readonly mgnRatio: string;
  readonly interest: string;
  readonly twap: string;
  readonly maxLoan: string;
  readonly eqUsd: string;
  readonly borrowFroz: string;
  readonly notionalLever: string;
  readonly stgyEq: string;
  readonly isoUpl: string;
  readonly spotInUseAmt?: string;
  readonly clSpotInUseAmt?: string;
  readonly maxSpotInUse?: string;
  readonly spotIsoBal?: string;
  readonly imr?: string;
  readonly mmr?: string;
  readonly smtSyncEq?: string;
}

export interface OkxBalanceRecord {
  readonly adjEq: string;
  readonly availEq: string;
  readonly borrowFroz: string;
  readonly delta: string;
  readonly imr: string;
  readonly isoEq: string;
  readonly mgnRatio: string;
  readonly mmr: string;
  readonly notionalUsd: string;
  readonly ordFroz: string;
  readonly totalEq: string;
  readonly uTime: string;
  readonly upl: string;
  readonly details: readonly OkxBalanceDetailRecord[];
}

export interface OkxPositionRecord {
  readonly instType: string;
  readonly mgnMode: string;
  readonly posId: string;
  readonly posSide: string;
  readonly pos: string;
  readonly baseBal?: string;
  readonly quoteBal?: string;
  readonly baseBorrowed?: string;
  readonly baseInterest?: string;
  readonly quoteBorrowed?: string;
  readonly quoteInterest?: string;
  readonly posCcy: string;
  readonly availPos: string;
  readonly avgPx: string;
  readonly upl: string;
  readonly uplRatio: string;
  readonly uplLastPx?: string;
  readonly uplRatioLastPx?: string;
  readonly instId: string;
  readonly lever: string;
  readonly liqPx: string;
  readonly markPx: string;
  readonly imr: string;
  readonly margin: string;
  readonly mgnRatio: string;
  readonly mmr: string;
  readonly liab: string;
  readonly liabCcy: string;
  readonly interest: string;
  readonly tradeId: string;
  readonly notionalUsd: string;
  readonly optVal?: string;
  readonly adl: string;
  readonly ccy: string;
  readonly last: string;
  readonly idxPx: string;
  readonly usdPx?: string;
  readonly bePx: string;
  readonly deltaBS?: string;
  readonly deltaPA?: string;
  readonly gammaBS?: string;
  readonly gammaPA?: string;
  readonly thetaBS?: string;
  readonly thetaPA?: string;
  readonly vegaBS?: string;
  readonly vegaPA?: string;
  readonly spotInUseAmt?: string;
  readonly spotInUseCcy?: string;
  readonly bizRefId?: string;
  readonly bizRefType?: string;
  readonly closeOrderAlgo?: readonly unknown[];
  readonly cTime: string;
  readonly uTime: string;
}

export interface OkxAccountConfigurationRecord {
  readonly uid: string;
  readonly mainUid: string;
  readonly acctLv: string;
  readonly posMode: string;
  readonly autoLoan: boolean;
  readonly greeksType: string;
  readonly level: string;
  readonly levelTmp: string;
  readonly ctIsoMode: string;
  readonly mgnIsoMode: string;
  readonly spotOffsetType: string;
  readonly roleType: string;
  readonly traderInsts: readonly string[];
  readonly opAuth: string;
  readonly kycLv: string;
  readonly label: string;
  readonly ip: string;
  readonly perm: string;
  readonly type: string;
}

export interface OkxMaximumOrderSizeRecord {
  readonly instId: string;
  readonly maxBuy: string;
  readonly maxSell: string;
}

export interface OkxMaximumAvailableBalanceRecord {
  readonly instId: string;
  readonly availBuy: string;
  readonly availSell: string;
}

export interface OkxFeeRateRecord {
  readonly category?: string;
  readonly delivery?: string;
  readonly exercise?: string;
  readonly instType: string;
  readonly level: string;
  readonly maker: string;
  readonly taker: string;
  readonly makerU?: string;
  readonly makerUSDC?: string;
  readonly takerU?: string;
  readonly takerUSDC?: string;
  readonly ts: string;
  readonly fiat?: readonly unknown[];
}

export interface OkxGetBalancesInput {
  readonly ccy?: string;
}

export interface OkxGetPositionsInput {
  readonly instType?: OkxInstrumentType;
  readonly instId?: string;
  readonly posId?: string;
}

export interface OkxGetMaximumOrderSizeInput {
  readonly instId: string;
  readonly tdMode: OkxAccountTradingMode;
  readonly ccy?: string;
  readonly px?: string;
  readonly leverage?: string;
  readonly unSpotOffset?: boolean;
}

export interface OkxGetMaximumAvailableBalanceInput {
  readonly instId: string;
  readonly tdMode: OkxAccountTradingMode;
  readonly ccy?: string;
  readonly reduceOnly?: boolean;
  readonly unSpotOffset?: boolean;
  readonly quickMgnType?: string;
}

export interface OkxGetFeeRatesInput {
  readonly instType: OkxInstrumentType;
  readonly instId?: string;
  readonly uly?: string;
  readonly category?: string;
  readonly instFamily?: string;
}

export class OkxPrivateAccountApiError extends Error {
  public readonly code =
    "OKX_PRIVATE_ACCOUNT_API_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxPrivateAccountApiError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxPrivateAccountApi {
  public constructor(
    private readonly restAdapter: OkxRestAdapter,
  ) {
    if (!(restAdapter instanceof OkxRestAdapter)) {
      throw new OkxPrivateAccountApiError(
        "restAdapter must be an OkxRestAdapter.",
      );
    }
  }

  public getBalances(
    input: OkxGetBalancesInput = {},
  ): Promise<OkxRestResult<OkxBalanceRecord>> {
    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/balance",
      query: compactQuery({
        ccy: normalizeOptionalString(
          input.ccy,
          "ccy",
        ),
      }),
    });
  }

  public getPositions(
    input: OkxGetPositionsInput = {},
  ): Promise<OkxRestResult<OkxPositionRecord>> {
    if (input.instType !== undefined) {
      validateInstrumentType(input.instType);
    }

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/positions",
      query: compactQuery({
        instType: input.instType,
        instId: normalizeOptionalString(
          input.instId,
          "instId",
        ),
        posId: normalizeOptionalString(
          input.posId,
          "posId",
        ),
      }),
    });
  }

  public getAccountConfiguration(): Promise<
    OkxRestResult<OkxAccountConfigurationRecord>
  > {
    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/config",
    });
  }

  public getMaximumOrderSize(
    input: OkxGetMaximumOrderSizeInput,
  ): Promise<OkxRestResult<OkxMaximumOrderSizeRecord>> {
    validateTradingMode(input.tdMode);

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/max-size",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        tdMode: input.tdMode,
        ccy: normalizeOptionalString(
          input.ccy,
          "ccy",
        ),
        px: normalizeOptionalNumericString(
          input.px,
          "px",
        ),
        leverage: normalizeOptionalNumericString(
          input.leverage,
          "leverage",
        ),
        unSpotOffset: input.unSpotOffset,
      }),
    });
  }

  public getMaximumAvailableBalance(
    input: OkxGetMaximumAvailableBalanceInput,
  ): Promise<
    OkxRestResult<OkxMaximumAvailableBalanceRecord>
  > {
    validateTradingMode(input.tdMode);

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/max-avail-size",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        tdMode: input.tdMode,
        ccy: normalizeOptionalString(
          input.ccy,
          "ccy",
        ),
        reduceOnly: input.reduceOnly,
        unSpotOffset: input.unSpotOffset,
        quickMgnType: normalizeOptionalString(
          input.quickMgnType,
          "quickMgnType",
        ),
      }),
    });
  }

  public getFeeRates(
    input: OkxGetFeeRatesInput,
  ): Promise<OkxRestResult<OkxFeeRateRecord>> {
    validateInstrumentType(input.instType);

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/account/trade-fee",
      query: compactQuery({
        instType: input.instType,
        instId: normalizeOptionalString(
          input.instId,
          "instId",
        ),
        uly: normalizeOptionalString(
          input.uly,
          "uly",
        ),
        category: normalizeOptionalString(
          input.category,
          "category",
        ),
        instFamily: normalizeOptionalString(
          input.instFamily,
          "instFamily",
        ),
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
    throw new OkxPrivateAccountApiError(
      `Unsupported OKX instrument type: "${String(value)}".`,
    );
  }
}

function validateTradingMode(
  value: OkxAccountTradingMode,
): void {
  if (
    value !== "cash" &&
    value !== "cross" &&
    value !== "isolated"
  ) {
    throw new OkxPrivateAccountApiError(
      `Unsupported OKX trading mode: "${String(value)}".`,
    );
  }
}

function normalizeOptionalString(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(value, fieldName);
}

function normalizeOptionalNumericString(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = requireNonEmptyString(
    value,
    fieldName,
  );

  const numericValue = Number(normalized);

  if (
    !Number.isFinite(numericValue) ||
    numericValue < 0
  ) {
    throw new OkxPrivateAccountApiError(
      `${fieldName} must be a non-negative numeric string.`,
    );
  }

  return normalized;
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxPrivateAccountApiError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxPrivateAccountApiError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}