import type {
  CoordinatorCapability,
  CoordinatorExchangeCandidate,
  CoordinatorExchangeCapabilities,
  CoordinatorMarketType,
  CoordinatorOrderType,
  CoordinatorTimeInForce,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";

export type CoordinatorCapabilityMismatchCode =
  | "MARKET_TYPE_UNSUPPORTED"
  | "ORDER_TYPE_UNSUPPORTED"
  | "TIME_IN_FORCE_UNSUPPORTED"
  | "REDUCE_ONLY_UNSUPPORTED"
  | "POST_ONLY_UNSUPPORTED"
  | "CLIENT_ORDER_ID_UNSUPPORTED"
  | "ORDER_REPLACEMENT_UNSUPPORTED"
  | "REQUIRED_CAPABILITY_MISSING";

export interface CoordinatorCapabilityMismatch {
  readonly code: CoordinatorCapabilityMismatchCode;
  readonly capability: CoordinatorCapability | null;
  readonly message: string;
}

export interface CoordinatorCapabilityMatchResult {
  readonly matched: boolean;
  readonly exchangeId: string;
  readonly requiredCapabilities: readonly CoordinatorCapability[];
  readonly supportedCapabilities: readonly CoordinatorCapability[];
  readonly missingCapabilities: readonly CoordinatorCapability[];
  readonly mismatches: readonly CoordinatorCapabilityMismatch[];
}

export interface CoordinatorCapabilityMatchOptions {
  readonly requireClientOrderIdSupport?: boolean;
  readonly requireOrderReplacementSupport?: boolean;
  readonly additionalRequiredCapabilities?:
    readonly CoordinatorCapability[];
}

const ORDER_TYPE_CAPABILITY_MAP = {
  MARKET: "MARKET_ORDER",
  LIMIT: "LIMIT_ORDER",
  STOP: "STOP_ORDER",
  STOP_LIMIT: "STOP_LIMIT_ORDER",
  TAKE_PROFIT: "TAKE_PROFIT_ORDER",
  TAKE_PROFIT_LIMIT: "TAKE_PROFIT_LIMIT_ORDER",
} as const satisfies Readonly<
  Record<CoordinatorOrderType, CoordinatorCapability>
>;

const MARKET_TYPE_CAPABILITY_MAP = {
  SPOT: "SPOT_TRADING",
  MARGIN: "MARGIN_TRADING",
  PERPETUAL: "PERPETUAL_TRADING",
  FUTURES: "FUTURES_TRADING",
  OPTIONS: "OPTIONS_TRADING",
} as const satisfies Readonly<
  Record<CoordinatorMarketType, CoordinatorCapability>
>;

function uniqueCapabilities(
  capabilities: readonly CoordinatorCapability[],
): readonly CoordinatorCapability[] {
  return Object.freeze(Array.from(new Set(capabilities)));
}

function includesCapability(
  capabilities: readonly CoordinatorCapability[],
  capability: CoordinatorCapability,
): boolean {
  return capabilities.includes(capability);
}

function includesMarketType(
  marketTypes: readonly CoordinatorMarketType[],
  marketType: CoordinatorMarketType,
): boolean {
  return marketTypes.includes(marketType);
}

function includesOrderType(
  orderTypes: readonly CoordinatorOrderType[],
  orderType: CoordinatorOrderType,
): boolean {
  return orderTypes.includes(orderType);
}

function includesTimeInForce(
  supportedTimeInForce: readonly CoordinatorTimeInForce[],
  timeInForce: CoordinatorTimeInForce,
): boolean {
  return supportedTimeInForce.includes(timeInForce);
}

export class CoordinatorExchangeCapabilityMatcher {
  public getRequiredCapabilities(
    request: MultiExchangeCoordinatorOrderRequest,
    options: CoordinatorCapabilityMatchOptions = {},
  ): readonly CoordinatorCapability[] {
    const requiredCapabilities: CoordinatorCapability[] = [
      ORDER_TYPE_CAPABILITY_MAP[request.orderType],
      MARKET_TYPE_CAPABILITY_MAP[request.marketType],
    ];

    if (request.postOnly) {
      requiredCapabilities.push("POST_ONLY_ORDER");
    }

    if (request.reduceOnly) {
      requiredCapabilities.push("REDUCE_ONLY_ORDER");
    }

    if (
      request.clientOrderId !== null ||
      options.requireClientOrderIdSupport === true
    ) {
      requiredCapabilities.push("CLIENT_ORDER_ID");
    }

    if (options.requireOrderReplacementSupport === true) {
      requiredCapabilities.push("REPLACE_ORDER");
    }

    requiredCapabilities.push(
      ...(options.additionalRequiredCapabilities ?? []),
    );

    return uniqueCapabilities(requiredCapabilities);
  }

  public match(
    request: MultiExchangeCoordinatorOrderRequest,
    exchangeCapabilities: CoordinatorExchangeCapabilities,
    options: CoordinatorCapabilityMatchOptions = {},
  ): CoordinatorCapabilityMatchResult {
    const requiredCapabilities =
      this.getRequiredCapabilities(request, options);

    const missingCapabilities =
      requiredCapabilities.filter(
        (capability) =>
          !includesCapability(
            exchangeCapabilities.capabilities,
            capability,
          ),
      );

    const mismatches: CoordinatorCapabilityMismatch[] = [];

    if (
      !includesMarketType(
        exchangeCapabilities.marketTypes,
        request.marketType,
      )
    ) {
      mismatches.push(
        Object.freeze({
          code: "MARKET_TYPE_UNSUPPORTED",
          capability:
            MARKET_TYPE_CAPABILITY_MAP[request.marketType],
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            `${request.marketType} trading.`,
        }),
      );
    }

    if (
      !includesOrderType(
        exchangeCapabilities.supportedOrderTypes,
        request.orderType,
      )
    ) {
      mismatches.push(
        Object.freeze({
          code: "ORDER_TYPE_UNSUPPORTED",
          capability:
            ORDER_TYPE_CAPABILITY_MAP[request.orderType],
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            `${request.orderType} orders.`,
        }),
      );
    }

    if (
      request.timeInForce !== null &&
      !includesTimeInForce(
        exchangeCapabilities.supportedTimeInForce,
        request.timeInForce,
      )
    ) {
      mismatches.push(
        Object.freeze({
          code: "TIME_IN_FORCE_UNSUPPORTED",
          capability: null,
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            `time-in-force ${request.timeInForce}.`,
        }),
      );
    }

    if (
      request.reduceOnly &&
      !exchangeCapabilities.supportsReduceOnly
    ) {
      mismatches.push(
        Object.freeze({
          code: "REDUCE_ONLY_UNSUPPORTED",
          capability: "REDUCE_ONLY_ORDER",
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            "reduce-only orders.",
        }),
      );
    }

    if (
      request.postOnly &&
      !exchangeCapabilities.supportsPostOnly
    ) {
      mismatches.push(
        Object.freeze({
          code: "POST_ONLY_UNSUPPORTED",
          capability: "POST_ONLY_ORDER",
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            "post-only orders.",
        }),
      );
    }

    if (
      (request.clientOrderId !== null ||
        options.requireClientOrderIdSupport === true) &&
      !exchangeCapabilities.supportsClientOrderId
    ) {
      mismatches.push(
        Object.freeze({
          code: "CLIENT_ORDER_ID_UNSUPPORTED",
          capability: "CLIENT_ORDER_ID",
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            "client-generated order IDs.",
        }),
      );
    }

    if (
      options.requireOrderReplacementSupport === true &&
      !exchangeCapabilities.supportsOrderReplacement
    ) {
      mismatches.push(
        Object.freeze({
          code: "ORDER_REPLACEMENT_UNSUPPORTED",
          capability: "REPLACE_ORDER",
          message:
            `Exchange ${exchangeCapabilities.exchangeId} does not support ` +
            "order replacement.",
        }),
      );
    }

    for (const capability of missingCapabilities) {
      const alreadyRepresented = mismatches.some(
        (mismatch) => mismatch.capability === capability,
      );

      if (!alreadyRepresented) {
        mismatches.push(
          Object.freeze({
            code: "REQUIRED_CAPABILITY_MISSING",
            capability,
            message:
              `Exchange ${exchangeCapabilities.exchangeId} is missing ` +
              `required capability ${capability}.`,
          }),
        );
      }
    }

    return Object.freeze({
      matched:
        missingCapabilities.length === 0 &&
        mismatches.length === 0,
      exchangeId: exchangeCapabilities.exchangeId,
      requiredCapabilities,
      supportedCapabilities: Object.freeze([
        ...exchangeCapabilities.capabilities,
      ]),
      missingCapabilities: Object.freeze([
        ...missingCapabilities,
      ]),
      mismatches: Object.freeze([...mismatches]),
    });
  }

  public filterCompatibleCandidates(
    request: MultiExchangeCoordinatorOrderRequest,
    candidates: readonly CoordinatorExchangeCandidate[],
    options: CoordinatorCapabilityMatchOptions = {},
  ): readonly CoordinatorExchangeCandidate[] {
    return Object.freeze(
      candidates.filter((candidate) =>
        this.match(
          request,
          candidate.capabilities,
          options,
        ).matched,
      ),
    );
  }
}

export function createCoordinatorExchangeCapabilityMatcher():
  CoordinatorExchangeCapabilityMatcher {
  return new CoordinatorExchangeCapabilityMatcher();
}