import {
  OkxRestAdapter,
} from "./okx-rest-adapter";

import {
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  type OkxInstrumentType,
} from "./okx-symbol-normalizer";

export type OkxTradeMode =
  | "cash"
  | "cross"
  | "isolated";

export type OkxTradeSide = "buy" | "sell";

export type OkxPositionSide =
  | "long"
  | "short"
  | "net";

export type OkxTradeOrderType =
  | "market"
  | "limit"
  | "post_only"
  | "fok"
  | "ioc"
  | "optimal_limit_ioc";

export type OkxSelfTradePreventionMode =
  | "cancel_maker"
  | "cancel_taker"
  | "cancel_both";

export interface OkxAttachAlgoOrderInput {
  readonly attachAlgoClOrdId?: string;
  readonly tpTriggerPx?: string;
  readonly tpOrdPx?: string;
  readonly slTriggerPx?: string;
  readonly slOrdPx?: string;
  readonly tpTriggerPxType?: "last" | "index" | "mark";
  readonly slTriggerPxType?: "last" | "index" | "mark";
  readonly sz?: string;
  readonly amendPxOnTriggerType?: "0" | "1";
}

export interface OkxPlaceOrderInput {
  readonly instId: string;
  readonly tdMode: OkxTradeMode;
  readonly side: OkxTradeSide;
  readonly ordType: OkxTradeOrderType;
  readonly sz: string;
  readonly ccy?: string;
  readonly clOrdId?: string;
  readonly tag?: string;
  readonly posSide?: OkxPositionSide;
  readonly px?: string;
  readonly reduceOnly?: boolean;
  readonly tgtCcy?: "base_ccy" | "quote_ccy";
  readonly banAmend?: boolean;
  readonly quickMgnType?: string;
  readonly stpMode?: OkxSelfTradePreventionMode;
  readonly attachAlgoOrds?: readonly OkxAttachAlgoOrderInput[];
}

export interface OkxPlaceOrderRecord {
  readonly ordId: string;
  readonly clOrdId: string;
  readonly tag: string;
  readonly ts: string;
  readonly sCode: string;
  readonly sMsg: string;
}

export interface OkxAmendOrderInput {
  readonly instId: string;
  readonly ordId?: string;
  readonly clOrdId?: string;
  readonly reqId?: string;
  readonly cxlOnFail?: boolean;
  readonly newSz?: string;
  readonly newPx?: string;
  readonly attachAlgoOrds?: readonly OkxAttachAlgoOrderInput[];
}

export interface OkxAmendOrderRecord {
  readonly ordId: string;
  readonly clOrdId: string;
  readonly reqId: string;
  readonly ts: string;
  readonly sCode: string;
  readonly sMsg: string;
}

export interface OkxCancelOrderInput {
  readonly instId: string;
  readonly ordId?: string;
  readonly clOrdId?: string;
}

export interface OkxCancelOrderRecord {
  readonly ordId: string;
  readonly clOrdId: string;
  readonly ts: string;
  readonly sCode: string;
  readonly sMsg: string;
}

export interface OkxGetOrderInput {
  readonly instId: string;
  readonly ordId?: string;
  readonly clOrdId?: string;
}

export interface OkxGetOpenOrdersInput {
  readonly instType?: OkxInstrumentType;
  readonly uly?: string;
  readonly instFamily?: string;
  readonly instId?: string;
  readonly ordType?: string;
  readonly state?: "live" | "partially_filled";
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

export interface OkxGetOrderHistoryInput {
  readonly instType: OkxInstrumentType;
  readonly uly?: string;
  readonly instFamily?: string;
  readonly instId?: string;
  readonly ordType?: string;
  readonly state?:
    | "filled"
    | "canceled"
    | "mmp_canceled";
  readonly category?: string;
  readonly after?: string;
  readonly before?: string;
  readonly begin?: string;
  readonly end?: string;
  readonly limit?: number;
}

export interface OkxGetFillsInput {
  readonly instType?: OkxInstrumentType;
  readonly uly?: string;
  readonly instFamily?: string;
  readonly instId?: string;
  readonly ordId?: string;
  readonly subType?: string;
  readonly after?: string;
  readonly before?: string;
  readonly begin?: string;
  readonly end?: string;
  readonly limit?: number;
}

export interface OkxOrderRecord {
  readonly instType: string;
  readonly instId: string;
  readonly ccy: string;
  readonly ordId: string;
  readonly clOrdId: string;
  readonly tag: string;
  readonly px: string;
  readonly sz: string;
  readonly ordType: string;
  readonly side: string;
  readonly posSide: string;
  readonly tdMode: string;
  readonly accFillSz: string;
  readonly fillPx: string;
  readonly tradeId: string;
  readonly fillSz: string;
  readonly fillTime: string;
  readonly avgPx: string;
  readonly state: string;
  readonly lever: string;
  readonly attachAlgoClOrdId?: string;
  readonly tpTriggerPx?: string;
  readonly tpTriggerPxType?: string;
  readonly tpOrdPx?: string;
  readonly slTriggerPx?: string;
  readonly slTriggerPxType?: string;
  readonly slOrdPx?: string;
  readonly feeCcy: string;
  readonly fee: string;
  readonly rebateCcy: string;
  readonly rebate: string;
  readonly pnl: string;
  readonly source: string;
  readonly category: string;
  readonly reduceOnly: string;
  readonly cancelSource?: string;
  readonly cancelSourceReason?: string;
  readonly quickMgnType?: string;
  readonly stpId?: string;
  readonly stpMode?: string;
  readonly tradeQuoteCcy?: string;
  readonly cTime: string;
  readonly uTime: string;
}

export interface OkxFillRecord {
  readonly instType: string;
  readonly instId: string;
  readonly tradeId: string;
  readonly ordId: string;
  readonly clOrdId: string;
  readonly billId: string;
  readonly tag: string;
  readonly fillPx: string;
  readonly fillSz: string;
  readonly side: string;
  readonly posSide: string;
  readonly execType: string;
  readonly feeCcy: string;
  readonly fee: string;
  readonly ts: string;
  readonly fillPnl: string;
  readonly fillPxVol?: string;
  readonly fillPxUsd?: string;
  readonly fillMarkVol?: string;
  readonly fillFwdPx?: string;
  readonly tradeQuoteCcy?: string;
}

export class OkxPrivateTradingApiError extends Error {
  public readonly code =
    "OKX_PRIVATE_TRADING_API_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxPrivateTradingApiError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxPrivateTradingApi {
  public constructor(
    private readonly restAdapter: OkxRestAdapter,
  ) {
    if (!(restAdapter instanceof OkxRestAdapter)) {
      throw new OkxPrivateTradingApiError(
        "restAdapter must be an OkxRestAdapter.",
      );
    }
  }

  public placeOrder(
    input: OkxPlaceOrderInput,
  ): Promise<OkxRestResult<OkxPlaceOrderRecord>> {
    const body = normalizePlaceOrderInput(input);

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/order",
      body,
    });
  }

  public placeBatchOrders(
    inputs: readonly OkxPlaceOrderInput[],
  ): Promise<OkxRestResult<OkxPlaceOrderRecord>> {
    const body = normalizeBatch(
      inputs,
      "orders",
      20,
      normalizePlaceOrderInput,
    );

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/batch-orders",
      body,
    });
  }

  public amendOrder(
    input: OkxAmendOrderInput,
  ): Promise<OkxRestResult<OkxAmendOrderRecord>> {
    const body = normalizeAmendOrderInput(input);

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/amend-order",
      body,
    });
  }

  public amendBatchOrders(
    inputs: readonly OkxAmendOrderInput[],
  ): Promise<OkxRestResult<OkxAmendOrderRecord>> {
    const body = normalizeBatch(
      inputs,
      "orders",
      20,
      normalizeAmendOrderInput,
    );

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/amend-batch-orders",
      body,
    });
  }

  public cancelOrder(
    input: OkxCancelOrderInput,
  ): Promise<OkxRestResult<OkxCancelOrderRecord>> {
    const body = normalizeCancelOrderInput(input);

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/cancel-order",
      body,
    });
  }

  public cancelBatchOrders(
    inputs: readonly OkxCancelOrderInput[],
  ): Promise<OkxRestResult<OkxCancelOrderRecord>> {
    const body = normalizeBatch(
      inputs,
      "orders",
      20,
      normalizeCancelOrderInput,
    );

    return this.restAdapter.executePrivate({
      method: "POST",
      path: "/api/v5/trade/cancel-batch-orders",
      body,
    });
  }

  public getOrder(
    input: OkxGetOrderInput,
  ): Promise<OkxRestResult<OkxOrderRecord>> {
    validateOrderIdentifier(
      input.ordId,
      input.clOrdId,
    );

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/trade/order",
      query: compactQuery({
        instId: requireNonEmptyString(
          input.instId,
          "instId",
        ),
        ordId: normalizeOptionalString(
          input.ordId,
          "ordId",
        ),
        clOrdId: normalizeOptionalString(
          input.clOrdId,
          "clOrdId",
        ),
      }),
    });
  }

  public getOpenOrders(
    input: OkxGetOpenOrdersInput = {},
  ): Promise<OkxRestResult<OkxOrderRecord>> {
    if (input.instType !== undefined) {
      validateInstrumentType(input.instType);
    }

    validateOptionalLimit(
      input.limit,
      "limit",
      1,
      100,
    );

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/trade/orders-pending",
      query: compactQuery({
        instType: input.instType,
        uly: normalizeOptionalString(
          input.uly,
          "uly",
        ),
        instFamily: normalizeOptionalString(
          input.instFamily,
          "instFamily",
        ),
        instId: normalizeOptionalString(
          input.instId,
          "instId",
        ),
        ordType: normalizeOptionalString(
          input.ordType,
          "ordType",
        ),
        state: input.state,
        after: normalizeOptionalString(
          input.after,
          "after",
        ),
        before: normalizeOptionalString(
          input.before,
          "before",
        ),
        limit: input.limit,
      }),
    });
  }

  public getOrderHistory(
    input: OkxGetOrderHistoryInput,
  ): Promise<OkxRestResult<OkxOrderRecord>> {
    validateInstrumentType(input.instType);

    validateOptionalLimit(
      input.limit,
      "limit",
      1,
      100,
    );

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/trade/orders-history",
      query: compactQuery({
        instType: input.instType,
        uly: normalizeOptionalString(
          input.uly,
          "uly",
        ),
        instFamily: normalizeOptionalString(
          input.instFamily,
          "instFamily",
        ),
        instId: normalizeOptionalString(
          input.instId,
          "instId",
        ),
        ordType: normalizeOptionalString(
          input.ordType,
          "ordType",
        ),
        state: input.state,
        category: normalizeOptionalString(
          input.category,
          "category",
        ),
        after: normalizeOptionalString(
          input.after,
          "after",
        ),
        before: normalizeOptionalString(
          input.before,
          "before",
        ),
        begin: normalizeOptionalTimestamp(
          input.begin,
          "begin",
        ),
        end: normalizeOptionalTimestamp(
          input.end,
          "end",
        ),
        limit: input.limit,
      }),
    });
  }

  public getFills(
    input: OkxGetFillsInput = {},
  ): Promise<OkxRestResult<OkxFillRecord>> {
    if (input.instType !== undefined) {
      validateInstrumentType(input.instType);
    }

    validateOptionalLimit(
      input.limit,
      "limit",
      1,
      100,
    );

    return this.restAdapter.executePrivate({
      method: "GET",
      path: "/api/v5/trade/fills",
      query: compactQuery({
        instType: input.instType,
        uly: normalizeOptionalString(
          input.uly,
          "uly",
        ),
        instFamily: normalizeOptionalString(
          input.instFamily,
          "instFamily",
        ),
        instId: normalizeOptionalString(
          input.instId,
          "instId",
        ),
        ordId: normalizeOptionalString(
          input.ordId,
          "ordId",
        ),
        subType: normalizeOptionalString(
          input.subType,
          "subType",
        ),
        after: normalizeOptionalString(
          input.after,
          "after",
        ),
        before: normalizeOptionalString(
          input.before,
          "before",
        ),
        begin: normalizeOptionalTimestamp(
          input.begin,
          "begin",
        ),
        end: normalizeOptionalTimestamp(
          input.end,
          "end",
        ),
        limit: input.limit,
      }),
    });
  }
}

function normalizePlaceOrderInput(
  input: OkxPlaceOrderInput,
): Readonly<Record<string, unknown>> {
  validateTradeMode(input.tdMode);
  validateTradeSide(input.side);
  validateOrderType(input.ordType);

  const size = normalizePositiveNumericString(
    input.sz,
    "sz",
  );

  const price = normalizeOptionalPositiveNumericString(
    input.px,
    "px",
  );

  if (
    input.ordType !== "market" &&
    price === undefined
  ) {
    throw new OkxPrivateTradingApiError(
      "px is required for non-market orders.",
    );
  }

  const attachAlgoOrds =
    input.attachAlgoOrds === undefined
      ? undefined
      : Object.freeze(
          input.attachAlgoOrds.map(
            normalizeAttachAlgoOrder,
          ),
        );

  return Object.freeze({
    instId: requireNonEmptyString(
      input.instId,
      "instId",
    ),
    tdMode: input.tdMode,
    side: input.side,
    ordType: input.ordType,
    sz: size,
    ...(normalizeOptionalString(
      input.ccy,
      "ccy",
    ) !== undefined
      ? {
          ccy: normalizeOptionalString(
            input.ccy,
            "ccy",
          ),
        }
      : {}),
    ...(normalizeOptionalString(
      input.clOrdId,
      "clOrdId",
    ) !== undefined
      ? {
          clOrdId: normalizeOptionalString(
            input.clOrdId,
            "clOrdId",
          ),
        }
      : {}),
    ...(normalizeOptionalString(
      input.tag,
      "tag",
    ) !== undefined
      ? {
          tag: normalizeOptionalString(
            input.tag,
            "tag",
          ),
        }
      : {}),
    ...(input.posSide !== undefined
      ? {
          posSide: validatePositionSide(
            input.posSide,
          ),
        }
      : {}),
    ...(price !== undefined ? { px: price } : {}),
    ...(input.reduceOnly !== undefined
      ? { reduceOnly: input.reduceOnly }
      : {}),
    ...(input.tgtCcy !== undefined
      ? { tgtCcy: input.tgtCcy }
      : {}),
    ...(input.banAmend !== undefined
      ? { banAmend: input.banAmend }
      : {}),
    ...(normalizeOptionalString(
      input.quickMgnType,
      "quickMgnType",
    ) !== undefined
      ? {
          quickMgnType: normalizeOptionalString(
            input.quickMgnType,
            "quickMgnType",
          ),
        }
      : {}),
    ...(input.stpMode !== undefined
      ? {
          stpMode: validateStpMode(
            input.stpMode,
          ),
        }
      : {}),
    ...(attachAlgoOrds !== undefined
      ? { attachAlgoOrds }
      : {}),
  });
}

function normalizeAmendOrderInput(
  input: OkxAmendOrderInput,
): Readonly<Record<string, unknown>> {
  validateOrderIdentifier(
    input.ordId,
    input.clOrdId,
  );

  const newSize =
    normalizeOptionalPositiveNumericString(
      input.newSz,
      "newSz",
    );

  const newPrice =
    normalizeOptionalPositiveNumericString(
      input.newPx,
      "newPx",
    );

  if (
    newSize === undefined &&
    newPrice === undefined &&
    input.attachAlgoOrds === undefined
  ) {
    throw new OkxPrivateTradingApiError(
      "At least one amendment field is required.",
    );
  }

  const attachAlgoOrds =
    input.attachAlgoOrds === undefined
      ? undefined
      : Object.freeze(
          input.attachAlgoOrds.map(
            normalizeAttachAlgoOrder,
          ),
        );

  return Object.freeze({
    instId: requireNonEmptyString(
      input.instId,
      "instId",
    ),
    ...(normalizeOptionalString(
      input.ordId,
      "ordId",
    ) !== undefined
      ? {
          ordId: normalizeOptionalString(
            input.ordId,
            "ordId",
          ),
        }
      : {}),
    ...(normalizeOptionalString(
      input.clOrdId,
      "clOrdId",
    ) !== undefined
      ? {
          clOrdId: normalizeOptionalString(
            input.clOrdId,
            "clOrdId",
          ),
        }
      : {}),
    ...(normalizeOptionalString(
      input.reqId,
      "reqId",
    ) !== undefined
      ? {
          reqId: normalizeOptionalString(
            input.reqId,
            "reqId",
          ),
        }
      : {}),
    ...(input.cxlOnFail !== undefined
      ? { cxlOnFail: input.cxlOnFail }
      : {}),
    ...(newSize !== undefined
      ? { newSz: newSize }
      : {}),
    ...(newPrice !== undefined
      ? { newPx: newPrice }
      : {}),
    ...(attachAlgoOrds !== undefined
      ? { attachAlgoOrds }
      : {}),
  });
}

function normalizeCancelOrderInput(
  input: OkxCancelOrderInput,
): Readonly<Record<string, unknown>> {
  validateOrderIdentifier(
    input.ordId,
    input.clOrdId,
  );

  return Object.freeze({
    instId: requireNonEmptyString(
      input.instId,
      "instId",
    ),
    ...(normalizeOptionalString(
      input.ordId,
      "ordId",
    ) !== undefined
      ? {
          ordId: normalizeOptionalString(
            input.ordId,
            "ordId",
          ),
        }
      : {}),
    ...(normalizeOptionalString(
      input.clOrdId,
      "clOrdId",
    ) !== undefined
      ? {
          clOrdId: normalizeOptionalString(
            input.clOrdId,
            "clOrdId",
          ),
        }
      : {}),
  });
}

function normalizeAttachAlgoOrder(
  input: OkxAttachAlgoOrderInput,
): Readonly<Record<string, unknown>> {
  const normalized = compactQuery({
    attachAlgoClOrdId: normalizeOptionalString(
      input.attachAlgoClOrdId,
      "attachAlgoClOrdId",
    ),
    tpTriggerPx: normalizeOptionalNumericString(
      input.tpTriggerPx,
      "tpTriggerPx",
    ),
    tpOrdPx: normalizeOptionalNumericString(
      input.tpOrdPx,
      "tpOrdPx",
    ),
    slTriggerPx: normalizeOptionalNumericString(
      input.slTriggerPx,
      "slTriggerPx",
    ),
    slOrdPx: normalizeOptionalNumericString(
      input.slOrdPx,
      "slOrdPx",
    ),
    tpTriggerPxType: input.tpTriggerPxType,
    slTriggerPxType: input.slTriggerPxType,
    sz: normalizeOptionalPositiveNumericString(
      input.sz,
      "attachAlgoOrds.sz",
    ),
    amendPxOnTriggerType:
      input.amendPxOnTriggerType,
  });

  if (Object.keys(normalized).length === 0) {
    throw new OkxPrivateTradingApiError(
      "Attached algo order must contain at least one field.",
    );
  }

  return normalized;
}

function normalizeBatch<TInput>(
  inputs: readonly TInput[],
  fieldName: string,
  maximum: number,
  normalizer: (
    input: TInput,
  ) => Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(inputs)) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must be an array.`,
    );
  }

  if (
    inputs.length === 0 ||
    inputs.length > maximum
  ) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must contain between 1 and ${maximum} entries.`,
    );
  }

  return Object.freeze(
    inputs.map(normalizer),
  );
}

function validateOrderIdentifier(
  ordId: string | undefined,
  clOrdId: string | undefined,
): void {
  const normalizedOrderId =
    normalizeOptionalString(ordId, "ordId");

  const normalizedClientOrderId =
    normalizeOptionalString(
      clOrdId,
      "clOrdId",
    );

  if (
    normalizedOrderId === undefined &&
    normalizedClientOrderId === undefined
  ) {
    throw new OkxPrivateTradingApiError(
      "Either ordId or clOrdId is required.",
    );
  }
}

function validateTradeMode(
  value: OkxTradeMode,
): void {
  if (
    value !== "cash" &&
    value !== "cross" &&
    value !== "isolated"
  ) {
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX trading mode: "${String(value)}".`,
    );
  }
}

function validateTradeSide(
  value: OkxTradeSide,
): void {
  if (value !== "buy" && value !== "sell") {
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX trade side: "${String(value)}".`,
    );
  }
}

function validateOrderType(
  value: OkxTradeOrderType,
): void {
  const supported: readonly OkxTradeOrderType[] = [
    "market",
    "limit",
    "post_only",
    "fok",
    "ioc",
    "optimal_limit_ioc",
  ];

  if (!supported.includes(value)) {
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX order type: "${String(value)}".`,
    );
  }
}

function validatePositionSide(
  value: OkxPositionSide,
): OkxPositionSide {
  if (
    value !== "long" &&
    value !== "short" &&
    value !== "net"
  ) {
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX position side: "${String(value)}".`,
    );
  }

  return value;
}

function validateStpMode(
  value: OkxSelfTradePreventionMode,
): OkxSelfTradePreventionMode {
  if (
    value !== "cancel_maker" &&
    value !== "cancel_taker" &&
    value !== "cancel_both"
  ) {
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX STP mode: "${String(value)}".`,
    );
  }

  return value;
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
    throw new OkxPrivateTradingApiError(
      `Unsupported OKX instrument type: "${String(value)}".`,
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
    throw new OkxPrivateTradingApiError(
      `${fieldName} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
}

function normalizeOptionalTimestamp(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  const normalized =
    normalizeOptionalString(value, fieldName);

  if (normalized === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must contain a numeric timestamp.`,
    );
  }

  return normalized;
}

function normalizePositiveNumericString(
  value: string,
  fieldName: string,
): string {
  const normalized = requireNonEmptyString(
    value,
    fieldName,
  );

  const numericValue = Number(normalized);

  if (
    !Number.isFinite(numericValue) ||
    numericValue <= 0
  ) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must be a positive numeric string.`,
    );
  }

  return normalized;
}

function normalizeOptionalPositiveNumericString(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizePositiveNumericString(
    value,
    fieldName,
  );
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

  if (!Number.isFinite(Number(normalized))) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must be a numeric string.`,
    );
  }

  return normalized;
}

function normalizeOptionalString(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(
    value,
    fieldName,
  );
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

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxPrivateTradingApiError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}