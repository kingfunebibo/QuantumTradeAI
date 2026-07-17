/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 3:
 * Live Order Validator
 *
 * Provides deterministic, immutable, policy-driven validation for live orders
 * before routing and exchange submission.
 */

import {
  LiveOrderError,
  validateLiveOrder,
} from "./live-order";

import type {
  LiveOrder,
  LiveOrderExchangeId,
  LiveOrderState,
  LiveOrderTimeInForce,
  LiveOrderType,
} from "./live-order";

import type {
  OrderValidationCode,
  OrderValidationIssue,
  OrderValidationResult,
  OrderValidationSeverity,
} from "./order-types";

/**
 * Clock abstraction used to keep validation deterministic in tests.
 */
export interface OrderValidatorClock {
  now(): number;
}

/**
 * Production implementation of the validator clock.
 */
export class SystemOrderValidatorClock implements OrderValidatorClock {
  public now(): number {
    return Date.now();
  }
}

/**
 * Exchange-specific trading capability description.
 */
export interface OrderValidationExchangeCapabilities {
  readonly exchangeId: LiveOrderExchangeId;

  readonly supportedOrderTypes: readonly LiveOrderType[];

  readonly supportedTimeInForce: readonly LiveOrderTimeInForce[];

  readonly supportsMarketOrders: boolean;

  readonly supportsLimitOrders: boolean;

  readonly supportsStopOrders: boolean;

  readonly supportsStopLimitOrders: boolean;

  readonly supportsTakeProfitOrders: boolean;

  readonly supportsTakeProfitLimitOrders: boolean;

  readonly supportsTrailingStopOrders: boolean;

  readonly supportsReduceOnly: boolean;

  readonly supportsPostOnly: boolean;

  readonly supportsClosePosition: boolean;

  readonly supportsQuoteOrderQuantity: boolean;

  readonly requiresAccountId: boolean;

  readonly tradingEnabled: boolean;

  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Market constraints used to validate quantity and price increments.
 */
export interface OrderValidationMarketRules {
  readonly exchangeId?: LiveOrderExchangeId;

  readonly symbol: string;

  readonly active: boolean;

  readonly tradingEnabled: boolean;

  readonly minimumQuantity?: number;

  readonly maximumQuantity?: number;

  readonly quantityIncrement?: number;

  readonly minimumPrice?: number;

  readonly maximumPrice?: number;

  readonly priceIncrement?: number;

  readonly minimumNotional?: number;

  readonly maximumNotional?: number;

  readonly allowedOrderTypes?: readonly LiveOrderType[];

  readonly allowedTimeInForce?: readonly LiveOrderTimeInForce[];

  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Account state used by pre-trade validation.
 */
export interface OrderValidationAccountSnapshot {
  readonly accountId: string;

  readonly exchangeId?: LiveOrderExchangeId;

  readonly available: boolean;

  readonly tradingEnabled: boolean;

  readonly availableBalance?: number;

  readonly availableQuoteBalance?: number;

  readonly availableBaseBalance?: number;

  readonly maximumOrderNotional?: number;

  readonly maximumOpenOrderCount?: number;

  readonly currentOpenOrderCount?: number;

  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Optional duplicate-detection interface.
 */
export interface OrderDuplicateDetector {
  hasOrderId(orderId: string): boolean;

  hasClientOrderId(clientOrderId: string): boolean;

  hasIdempotencyKey(idempotencyKey: string): boolean;
}

/**
 * Optional risk-validation result supplied by the risk engine.
 */
export interface OrderRiskValidation {
  readonly approved: boolean;

  readonly code?: string;

  readonly reason?: string;

  readonly approvedQuantity?: number;

  readonly approvedNotional?: number;

  readonly validatedAt?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Complete context used during one validation operation.
 */
export interface OrderValidationContext {
  readonly marketRules?: OrderValidationMarketRules;

  readonly account?: OrderValidationAccountSnapshot;

  readonly exchangeCapabilities?: OrderValidationExchangeCapabilities;

  readonly duplicateDetector?: OrderDuplicateDetector;

  readonly riskValidation?: OrderRiskValidation;

  readonly referencePrice?: number;

  readonly allowWarnings?: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Validator configuration.
 */
export interface OrderValidatorOptions {
  /**
   * Whether an exchange must already be selected.
   *
   * This is normally false during initial validation and true before
   * submission.
   */
  readonly requireExchange?: boolean;

  /**
   * Whether an account identifier must be available.
   */
  readonly requireAccount?: boolean;

  /**
   * Whether market rules must be supplied.
   */
  readonly requireMarketRules?: boolean;

  /**
   * Whether exchange capabilities must be supplied.
   */
  readonly requireExchangeCapabilities?: boolean;

  /**
   * Whether risk approval must be supplied.
   */
  readonly requireRiskApproval?: boolean;

  /**
   * Whether validation is restricted to the NEW state.
   */
  readonly requireNewState?: boolean;

  /**
   * Whether an order may be validated again after entering VALIDATED.
   */
  readonly allowRevalidation?: boolean;

  /**
   * Whether expired orders produce an error.
   */
  readonly rejectExpiredOrders?: boolean;

  /**
   * Floating-point tolerance used for increment checks.
   */
  readonly numericTolerance?: number;

  /**
   * Maximum accepted age of a risk decision.
   */
  readonly maximumRiskValidationAgeMs?: number;

  /**
   * Whether an explicitly selected exchange must match every supplied
   * exchange-scoped context object.
   */
  readonly enforceExchangeConsistency?: boolean;
}

/**
 * Fully normalized validator configuration.
 */
interface ResolvedOrderValidatorOptions {
  readonly requireExchange: boolean;

  readonly requireAccount: boolean;

  readonly requireMarketRules: boolean;

  readonly requireExchangeCapabilities: boolean;

  readonly requireRiskApproval: boolean;

  readonly requireNewState: boolean;

  readonly allowRevalidation: boolean;

  readonly rejectExpiredOrders: boolean;

  readonly numericTolerance: number;

  readonly maximumRiskValidationAgeMs?: number;

  readonly enforceExchangeConsistency: boolean;
}

/**
 * Error raised when validation infrastructure is used incorrectly.
 *
 * Invalid orders are represented through OrderValidationResult. This error is
 * reserved for invalid validator configuration, timestamps, or dependencies.
 */
export class OrderValidatorError extends Error {
  public readonly code: string;

  public readonly orderId?: string;

  public constructor(
    code: string,
    message: string,
    options: Readonly<{
      orderId?: string;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "OrderValidatorError";
    this.code = code;
    this.orderId = options.orderId;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

const DEFAULT_OPTIONS: ResolvedOrderValidatorOptions =
  Object.freeze({
    requireExchange: false,
    requireAccount: false,
    requireMarketRules: false,
    requireExchangeCapabilities: false,
    requireRiskApproval: false,
    requireNewState: true,
    allowRevalidation: false,
    rejectExpiredOrders: true,
    numericTolerance: 1e-10,
    maximumRiskValidationAgeMs: undefined,
    enforceExchangeConsistency: true,
  });

const VALIDATABLE_STATES: ReadonlySet<LiveOrderState> =
  new Set<LiveOrderState>([
    "NEW",
    "VALIDATED",
  ]);

const PRICE_REQUIRED_ORDER_TYPES: ReadonlySet<LiveOrderType> =
  new Set<LiveOrderType>([
    "LIMIT",
    "STOP_LIMIT",
    "TAKE_PROFIT_LIMIT",
  ]);

const STOP_PRICE_REQUIRED_ORDER_TYPES: ReadonlySet<LiveOrderType> =
  new Set<LiveOrderType>([
    "STOP",
    "STOP_LIMIT",
    "TAKE_PROFIT",
    "TAKE_PROFIT_LIMIT",
  ]);

const MARKET_LIKE_ORDER_TYPES: ReadonlySet<LiveOrderType> =
  new Set<LiveOrderType>([
    "MARKET",
    "STOP",
    "TAKE_PROFIT",
    "TRAILING_STOP",
  ]);

/**
 * Production-grade live-order validator.
 */
export class OrderValidator {
  private readonly options: ResolvedOrderValidatorOptions;

  private readonly clock: OrderValidatorClock;

  public constructor(
    options: OrderValidatorOptions = {},
    clock: OrderValidatorClock =
      new SystemOrderValidatorClock(),
  ) {
    this.options = resolveOptions(options);

    validateClock(clock);

    this.clock = clock;
  }

  /**
   * Validates one immutable live order.
   *
   * The method never mutates the order or any supplied validation context.
   */
  public validate(
    order: LiveOrder,
    context: OrderValidationContext = {},
  ): OrderValidationResult {
    const validatedAt = validateTimestamp(
      this.clock.now(),
      "clock.now()",
    );

    const issues: OrderValidationIssue[] = [];

    this.validateDomainModel(
      order,
      issues,
    );

    if (!isObject(order)) {
      return createResult(
        issues,
        validatedAt,
      );
    }

    this.validateLifecycle(
      order,
      issues,
    );

    this.validateIdentity(
      order,
      issues,
    );

    this.validateOrderSemantics(
      order,
      issues,
    );

    this.validateExpiration(
      order,
      validatedAt,
      issues,
    );

    this.validateRequiredContext(
      order,
      context,
      issues,
    );

    this.validateExchangeConsistency(
      order,
      context,
      issues,
    );

    this.validateExchangeCapabilities(
      order,
      context.exchangeCapabilities,
      issues,
    );

    this.validateMarketRules(
      order,
      context.marketRules,
      context.referencePrice,
      issues,
    );

    this.validateAccount(
      order,
      context.account,
      context.referencePrice,
      issues,
    );

    this.validateRiskApproval(
      order,
      context.riskValidation,
      validatedAt,
      issues,
    );

    this.validateDuplicates(
      order,
      context.duplicateDetector,
      issues,
    );

    return createResult(
      issues,
      validatedAt,
    );
  }

  /**
   * Validates an order and throws when one or more error-severity issues exist.
   */
  public assertValid(
    order: LiveOrder,
    context: OrderValidationContext = {},
  ): OrderValidationResult {
    const result = this.validate(
      order,
      context,
    );

    const firstError =
      result.issues.find(
        (issue) =>
          issue.severity === "ERROR",
      );

    if (firstError) {
      throw new OrderValidatorError(
        firstError.code,
        firstError.message,
        {
          orderId:
            isObject(order) &&
            typeof order.orderId === "string"
              ? order.orderId
              : undefined,
        },
      );
    }

    return result;
  }

  private validateDomainModel(
    order: LiveOrder,
    issues: OrderValidationIssue[],
  ): void {
    try {
      validateLiveOrder(order);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Live order domain validation failed.";

      addIssue(
        issues,
        "INVALID_ORDER",
        "ERROR",
        undefined,
        message,
        {
          source:
            error instanceof LiveOrderError
              ? "LiveOrderError"
              : "Unknown",
          domainCode:
            error instanceof LiveOrderError
              ? error.code
              : undefined,
        },
      );
    }
  }

  private validateLifecycle(
    order: LiveOrder,
    issues: OrderValidationIssue[],
  ): void {
    if (
      !VALIDATABLE_STATES.has(
        order.state,
      )
    ) {
      addIssue(
        issues,
        "INVALID_ORDER",
        "ERROR",
        "state",
        `Order "${order.orderId}" cannot be validated while in state "${order.state}".`,
        {
          state: order.state,
        },
      );

      return;
    }

    if (
      this.options.requireNewState &&
      order.state !== "NEW"
    ) {
      if (
        !(
          this.options.allowRevalidation &&
          order.state === "VALIDATED"
        )
      ) {
        addIssue(
          issues,
          "INVALID_ORDER",
          "ERROR",
          "state",
          `Order "${order.orderId}" must be in state "NEW" before validation.`,
          {
            state: order.state,
          },
        );
      }
    }

    if (
      order.state === "VALIDATED" &&
      !this.options.allowRevalidation
    ) {
      addIssue(
        issues,
        "INVALID_ORDER",
        "ERROR",
        "state",
        `Order "${order.orderId}" has already been validated.`,
        {
          state: order.state,
          validatedAt: order.validatedAt,
        },
      );
    }
  }

  private validateIdentity(
    order: LiveOrder,
    issues: OrderValidationIssue[],
  ): void {
    validateRequiredTextField(
      order.orderId,
      "orderId",
      "INVALID_ORDER",
      issues,
    );

    validateRequiredTextField(
      order.clientOrderId,
      "clientOrderId",
      "INVALID_ORDER",
      issues,
    );

    validateRequiredTextField(
      order.idempotencyKey,
      "idempotencyKey",
      "INVALID_ORDER",
      issues,
    );

    validateRequiredTextField(
      order.symbol,
      "symbol",
      "INVALID_SYMBOL",
      issues,
    );

    if (
      order.accountId !== undefined &&
      !hasText(order.accountId)
    ) {
      addIssue(
        issues,
        "INVALID_ACCOUNT",
        "ERROR",
        "accountId",
        "Order accountId must not be empty when supplied.",
      );
    }

    if (
      order.exchangeId !== undefined &&
      !hasText(order.exchangeId)
    ) {
      addIssue(
        issues,
        "INVALID_EXCHANGE",
        "ERROR",
        "exchangeId",
        "Order exchangeId must not be empty when supplied.",
      );
    }

    if (
      this.options.requireExchange &&
      order.exchangeId === undefined
    ) {
      addIssue(
        issues,
        "INVALID_EXCHANGE",
        "ERROR",
        "exchangeId",
        `Order "${order.orderId}" requires a selected exchange.`,
      );
    }

    if (
      this.options.requireAccount &&
      order.accountId === undefined
    ) {
      addIssue(
        issues,
        "INVALID_ACCOUNT",
        "ERROR",
        "accountId",
        `Order "${order.orderId}" requires an account identifier.`,
      );
    }
  }

  private validateOrderSemantics(
    order: LiveOrder,
    issues: OrderValidationIssue[],
  ): void {
    if (
      !isPositiveFiniteNumber(
        order.requestedQuantity,
      )
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        "Order quantity must be a positive finite number.",
        {
          value: order.requestedQuantity,
        },
      );
    }

    this.validateOptionalPositiveNumber(
      order.quoteOrderQuantity,
      "quoteOrderQuantity",
      "INVALID_QUANTITY",
      issues,
    );

    this.validateOptionalPositiveNumber(
      order.limitPrice,
      "limitPrice",
      "INVALID_PRICE",
      issues,
    );

    this.validateOptionalPositiveNumber(
      order.stopPrice,
      "stopPrice",
      "INVALID_STOP_PRICE",
      issues,
    );

    this.validateOptionalPositiveNumber(
      order.trailingOffset,
      "trailingOffset",
      "INVALID_STOP_PRICE",
      issues,
    );

    if (
      PRICE_REQUIRED_ORDER_TYPES.has(
        order.type,
      ) &&
      order.limitPrice === undefined
    ) {
      addIssue(
        issues,
        "INVALID_PRICE",
        "ERROR",
        "limitPrice",
        `Order type "${order.type}" requires a limit price.`,
        {
          orderType: order.type,
        },
      );
    }

    if (
      STOP_PRICE_REQUIRED_ORDER_TYPES.has(
        order.type,
      ) &&
      order.stopPrice === undefined
    ) {
      addIssue(
        issues,
        "INVALID_STOP_PRICE",
        "ERROR",
        "stopPrice",
        `Order type "${order.type}" requires a stop price.`,
        {
          orderType: order.type,
        },
      );
    }

    if (
      order.type === "TRAILING_STOP" &&
      order.trailingOffset === undefined
    ) {
      addIssue(
        issues,
        "INVALID_STOP_PRICE",
        "ERROR",
        "trailingOffset",
        "Trailing-stop orders require a trailing offset.",
      );
    }

    if (
      order.type === "MARKET" &&
      order.limitPrice !== undefined
    ) {
      addIssue(
        issues,
        "INVALID_PRICE",
        "ERROR",
        "limitPrice",
        "Market orders cannot define a limit price.",
      );
    }

    if (
      order.type === "MARKET" &&
      order.stopPrice !== undefined
    ) {
      addIssue(
        issues,
        "INVALID_STOP_PRICE",
        "ERROR",
        "stopPrice",
        "Market orders cannot define a stop price.",
      );
    }

    if (
      order.type !== "TRAILING_STOP" &&
      order.trailingOffset !== undefined
    ) {
      addIssue(
        issues,
        "INVALID_STOP_PRICE",
        "ERROR",
        "trailingOffset",
        `Order type "${order.type}" cannot define a trailing offset.`,
      );
    }

    if (
      order.quoteOrderQuantity !== undefined &&
      order.type !== "MARKET"
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "quoteOrderQuantity",
        "Quote-order quantity is only supported for market orders.",
      );
    }

    if (
      order.quoteOrderQuantity !== undefined &&
      order.side !== "BUY"
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "quoteOrderQuantity",
        "Quote-order quantity is only valid for BUY orders.",
      );
    }

    if (
      order.postOnly &&
      order.type !== "LIMIT"
    ) {
      addIssue(
        issues,
        "INVALID_ORDER_TYPE",
        "ERROR",
        "postOnly",
        "Post-only behavior is only valid for limit orders.",
      );
    }

    if (
      order.postOnly &&
      order.timeInForce !== undefined &&
      order.timeInForce !== "POST_ONLY" &&
      order.timeInForce !== "GTC"
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "timeInForce",
        "Post-only orders require POST_ONLY or GTC time in force.",
        {
          timeInForce: order.timeInForce,
        },
      );
    }

    if (
      order.timeInForce === "POST_ONLY" &&
      !order.postOnly
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "timeInForce",
        "POST_ONLY time in force requires postOnly to be enabled.",
      );
    }

    if (
      order.timeInForce === "POST_ONLY" &&
      order.type !== "LIMIT"
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "timeInForce",
        "POST_ONLY time in force is only valid for limit orders.",
      );
    }

    if (
      MARKET_LIKE_ORDER_TYPES.has(
        order.type,
      ) &&
      order.timeInForce === "POST_ONLY"
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "timeInForce",
        `Order type "${order.type}" cannot use POST_ONLY time in force.`,
      );
    }

    if (
      order.timeInForce === "GTD" &&
      order.expiresAt === undefined
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "expiresAt",
        "GTD orders require an expiration timestamp.",
      );
    }

    if (
      order.closePosition &&
      order.reduceOnly === false
    ) {
      addIssue(
        issues,
        "INVALID_ORDER",
        "ERROR",
        "closePosition",
        "Close-position orders must also be reduce-only.",
      );
    }

    if (
      order.closePosition &&
      order.quoteOrderQuantity !== undefined
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "quoteOrderQuantity",
        "Close-position orders cannot define a quote-order quantity.",
      );
    }
  }

  private validateExpiration(
    order: LiveOrder,
    validatedAt: number,
    issues: OrderValidationIssue[],
  ): void {
    if (
      order.expiresAt === undefined
    ) {
      return;
    }

    if (
      !isNonNegativeSafeInteger(
        order.expiresAt,
      )
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "expiresAt",
        "Order expiration must be a non-negative safe-integer timestamp.",
        {
          expiresAt: order.expiresAt,
        },
      );

      return;
    }

    if (
      order.expiresAt <
      order.createdAt
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "expiresAt",
        "Order expiration cannot be earlier than its creation timestamp.",
        {
          createdAt: order.createdAt,
          expiresAt: order.expiresAt,
        },
      );
    }

    if (
      this.options.rejectExpiredOrders &&
      order.expiresAt <= validatedAt
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "expiresAt",
        `Order "${order.orderId}" has expired.`,
        {
          expiresAt: order.expiresAt,
          validatedAt,
        },
      );
    }
  }

  private validateRequiredContext(
    order: LiveOrder,
    context: OrderValidationContext,
    issues: OrderValidationIssue[],
  ): void {
    if (
      this.options.requireMarketRules &&
      context.marketRules === undefined
    ) {
      addIssue(
        issues,
        "MARKET_UNAVAILABLE",
        "ERROR",
        "marketRules",
        `Market rules are required to validate order "${order.orderId}".`,
      );
    }

    if (
      this.options.requireExchangeCapabilities &&
      context.exchangeCapabilities === undefined
    ) {
      addIssue(
        issues,
        "EXCHANGE_UNSUPPORTED",
        "ERROR",
        "exchangeCapabilities",
        `Exchange capabilities are required to validate order "${order.orderId}".`,
      );
    }

    if (
      this.options.requireRiskApproval &&
      context.riskValidation === undefined
    ) {
      addIssue(
        issues,
        "RISK_REJECTED",
        "ERROR",
        "riskValidation",
        `Risk approval is required for order "${order.orderId}".`,
      );
    }

    if (
      this.options.requireAccount &&
      context.account === undefined
    ) {
      addIssue(
        issues,
        "ACCOUNT_UNAVAILABLE",
        "ERROR",
        "account",
        `Account state is required to validate order "${order.orderId}".`,
      );
    }
  }

  private validateExchangeConsistency(
    order: LiveOrder,
    context: OrderValidationContext,
    issues: OrderValidationIssue[],
  ): void {
    if (
      !this.options.enforceExchangeConsistency
    ) {
      return;
    }

    const selectedExchangeId =
      order.exchangeId;

    const contextualExchangeIds:
      readonly Readonly<{
        field: string;
        value?: LiveOrderExchangeId;
      }>[] = [
        {
          field: "marketRules.exchangeId",
          value:
            context.marketRules?.exchangeId,
        },
        {
          field: "account.exchangeId",
          value:
            context.account?.exchangeId,
        },
        {
          field:
            "exchangeCapabilities.exchangeId",
          value:
            context.exchangeCapabilities?.exchangeId,
        },
      ];

    if (
      selectedExchangeId !== undefined
    ) {
      for (
        const contextualExchange
        of contextualExchangeIds
      ) {
        if (
          contextualExchange.value !== undefined &&
          contextualExchange.value !== selectedExchangeId
        ) {
          addIssue(
            issues,
            "INVALID_EXCHANGE",
            "ERROR",
            contextualExchange.field,
            `Exchange "${contextualExchange.value}" does not match order exchange "${selectedExchangeId}".`,
            {
              orderExchangeId:
                selectedExchangeId,
              contextualExchangeId:
                contextualExchange.value,
            },
          );
        }
      }

      return;
    }

    const suppliedExchangeIds =
      contextualExchangeIds
        .map((entry) => entry.value)
        .filter(
          (
            value,
          ): value is LiveOrderExchangeId =>
            value !== undefined,
        );

    const distinctExchangeIds =
      new Set(suppliedExchangeIds);

    if (
      distinctExchangeIds.size > 1
    ) {
      addIssue(
        issues,
        "INVALID_EXCHANGE",
        "ERROR",
        "exchangeId",
        "Validation context contains conflicting exchange identifiers.",
        {
          exchangeIds:
            Object.freeze(
              [...distinctExchangeIds].sort(),
            ),
        },
      );
    }
  }

  private validateExchangeCapabilities(
    order: LiveOrder,
    capabilities:
      | OrderValidationExchangeCapabilities
      | undefined,
    issues: OrderValidationIssue[],
  ): void {
    if (!capabilities) {
      return;
    }

    if (
      !hasText(
        capabilities.exchangeId,
      )
    ) {
      addIssue(
        issues,
        "INVALID_EXCHANGE",
        "ERROR",
        "exchangeCapabilities.exchangeId",
        "Exchange capability exchangeId must not be empty.",
      );
    }

    if (
      !capabilities.tradingEnabled
    ) {
      addIssue(
        issues,
        "TRADING_DISABLED",
        "ERROR",
        "exchangeCapabilities.tradingEnabled",
        `Trading is disabled on exchange "${capabilities.exchangeId}".`,
      );
    }

    if (
      !capabilities.supportedOrderTypes.includes(
        order.type,
      )
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "type",
        `Exchange "${capabilities.exchangeId}" does not support order type "${order.type}".`,
        {
          exchangeId:
            capabilities.exchangeId,
          orderType: order.type,
        },
      );
    }

    if (
      order.timeInForce !== undefined &&
      !capabilities.supportedTimeInForce.includes(
        order.timeInForce,
      )
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "timeInForce",
        `Exchange "${capabilities.exchangeId}" does not support time in force "${order.timeInForce}".`,
        {
          exchangeId:
            capabilities.exchangeId,
          timeInForce:
            order.timeInForce,
        },
      );
    }

    if (
      !this.isOrderTypeCapabilityEnabled(
        order.type,
        capabilities,
      )
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "type",
        `Order type "${order.type}" is disabled by exchange capability configuration.`,
        {
          exchangeId:
            capabilities.exchangeId,
          orderType: order.type,
        },
      );
    }

    if (
      order.reduceOnly &&
      !capabilities.supportsReduceOnly
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "reduceOnly",
        `Exchange "${capabilities.exchangeId}" does not support reduce-only orders.`,
      );
    }

    if (
      order.postOnly &&
      !capabilities.supportsPostOnly
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "postOnly",
        `Exchange "${capabilities.exchangeId}" does not support post-only orders.`,
      );
    }

    if (
      order.closePosition &&
      !capabilities.supportsClosePosition
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "closePosition",
        `Exchange "${capabilities.exchangeId}" does not support close-position orders.`,
      );
    }

    if (
      order.quoteOrderQuantity !== undefined &&
      !capabilities.supportsQuoteOrderQuantity
    ) {
      addIssue(
        issues,
        "CAPABILITY_UNSUPPORTED",
        "ERROR",
        "quoteOrderQuantity",
        `Exchange "${capabilities.exchangeId}" does not support quote-order quantity.`,
      );
    }

    if (
      capabilities.requiresAccountId &&
      order.accountId === undefined
    ) {
      addIssue(
        issues,
        "INVALID_ACCOUNT",
        "ERROR",
        "accountId",
        `Exchange "${capabilities.exchangeId}" requires an account identifier.`,
      );
    }
  }

  private validateMarketRules(
    order: LiveOrder,
    rules:
      | OrderValidationMarketRules
      | undefined,
    referencePrice: number | undefined,
    issues: OrderValidationIssue[],
  ): void {
    if (!rules) {
      return;
    }

    if (
      normalizeComparableText(
        rules.symbol,
      ) !==
      normalizeComparableText(
        order.symbol,
      )
    ) {
      addIssue(
        issues,
        "INVALID_SYMBOL",
        "ERROR",
        "marketRules.symbol",
        `Market rules for "${rules.symbol}" do not match order symbol "${order.symbol}".`,
        {
          orderSymbol: order.symbol,
          marketSymbol: rules.symbol,
        },
      );
    }

    if (!rules.active) {
      addIssue(
        issues,
        "MARKET_UNAVAILABLE",
        "ERROR",
        "marketRules.active",
        `Market "${rules.symbol}" is not active.`,
      );
    }

    if (!rules.tradingEnabled) {
      addIssue(
        issues,
        "TRADING_DISABLED",
        "ERROR",
        "marketRules.tradingEnabled",
        `Trading is disabled for market "${rules.symbol}".`,
      );
    }

    if (
      rules.allowedOrderTypes &&
      !rules.allowedOrderTypes.includes(
        order.type,
      )
    ) {
      addIssue(
        issues,
        "INVALID_ORDER_TYPE",
        "ERROR",
        "type",
        `Order type "${order.type}" is not allowed for market "${rules.symbol}".`,
      );
    }

    if (
      order.timeInForce !== undefined &&
      rules.allowedTimeInForce &&
      !rules.allowedTimeInForce.includes(
        order.timeInForce,
      )
    ) {
      addIssue(
        issues,
        "INVALID_TIME_IN_FORCE",
        "ERROR",
        "timeInForce",
        `Time in force "${order.timeInForce}" is not allowed for market "${rules.symbol}".`,
      );
    }

    validatePositiveConstraint(
      rules.minimumQuantity,
      "marketRules.minimumQuantity",
    );

    validatePositiveConstraint(
      rules.maximumQuantity,
      "marketRules.maximumQuantity",
    );

    validatePositiveConstraint(
      rules.quantityIncrement,
      "marketRules.quantityIncrement",
    );

    validatePositiveConstraint(
      rules.minimumPrice,
      "marketRules.minimumPrice",
    );

    validatePositiveConstraint(
      rules.maximumPrice,
      "marketRules.maximumPrice",
    );

    validatePositiveConstraint(
      rules.priceIncrement,
      "marketRules.priceIncrement",
    );

    validatePositiveConstraint(
      rules.minimumNotional,
      "marketRules.minimumNotional",
    );

    validatePositiveConstraint(
      rules.maximumNotional,
      "marketRules.maximumNotional",
    );

    this.validateQuantityRules(
      order,
      rules,
      issues,
    );

    this.validatePriceRules(
      order,
      rules,
      issues,
    );

    this.validateNotionalRules(
      order,
      rules,
      referencePrice,
      issues,
    );
  }

  private validateQuantityRules(
    order: LiveOrder,
    rules: OrderValidationMarketRules,
    issues: OrderValidationIssue[],
  ): void {
    if (
      rules.minimumQuantity !== undefined &&
      order.requestedQuantity <
        rules.minimumQuantity
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        `Order quantity ${order.requestedQuantity} is below the minimum ${rules.minimumQuantity}.`,
        {
          quantity:
            order.requestedQuantity,
          minimumQuantity:
            rules.minimumQuantity,
        },
      );
    }

    if (
      rules.maximumQuantity !== undefined &&
      order.requestedQuantity >
        rules.maximumQuantity
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        `Order quantity ${order.requestedQuantity} exceeds the maximum ${rules.maximumQuantity}.`,
        {
          quantity:
            order.requestedQuantity,
          maximumQuantity:
            rules.maximumQuantity,
        },
      );
    }

    if (
      rules.quantityIncrement !== undefined &&
      !isIncrementAligned(
        order.requestedQuantity,
        rules.quantityIncrement,
        this.options.numericTolerance,
      )
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        `Order quantity ${order.requestedQuantity} is not aligned to increment ${rules.quantityIncrement}.`,
        {
          quantity:
            order.requestedQuantity,
          quantityIncrement:
            rules.quantityIncrement,
        },
      );
    }
  }

  private validatePriceRules(
    order: LiveOrder,
    rules: OrderValidationMarketRules,
    issues: OrderValidationIssue[],
  ): void {
    const prices:
      readonly Readonly<{
        field: string;
        value?: number;
        code: OrderValidationCode;
      }>[] = [
        {
          field: "limitPrice",
          value: order.limitPrice,
          code: "INVALID_PRICE",
        },
        {
          field: "stopPrice",
          value: order.stopPrice,
          code: "INVALID_STOP_PRICE",
        },
      ];

    for (const price of prices) {
      if (
        price.value === undefined
      ) {
        continue;
      }

      if (
        rules.minimumPrice !== undefined &&
        price.value < rules.minimumPrice
      ) {
        addIssue(
          issues,
          price.code,
          "ERROR",
          price.field,
          `${price.field} ${price.value} is below the minimum price ${rules.minimumPrice}.`,
          {
            value: price.value,
            minimumPrice:
              rules.minimumPrice,
          },
        );
      }

      if (
        rules.maximumPrice !== undefined &&
        price.value > rules.maximumPrice
      ) {
        addIssue(
          issues,
          price.code,
          "ERROR",
          price.field,
          `${price.field} ${price.value} exceeds the maximum price ${rules.maximumPrice}.`,
          {
            value: price.value,
            maximumPrice:
              rules.maximumPrice,
          },
        );
      }

      if (
        rules.priceIncrement !== undefined &&
        !isIncrementAligned(
          price.value,
          rules.priceIncrement,
          this.options.numericTolerance,
        )
      ) {
        addIssue(
          issues,
          price.code,
          "ERROR",
          price.field,
          `${price.field} ${price.value} is not aligned to price increment ${rules.priceIncrement}.`,
          {
            value: price.value,
            priceIncrement:
              rules.priceIncrement,
          },
        );
      }
    }
  }

  private validateNotionalRules(
    order: LiveOrder,
    rules: OrderValidationMarketRules,
    referencePrice: number | undefined,
    issues: OrderValidationIssue[],
  ): void {
    const notional =
      calculateOrderNotional(
        order,
        referencePrice,
      );

    if (notional === undefined) {
      if (
        rules.minimumNotional !== undefined ||
        rules.maximumNotional !== undefined
      ) {
        addIssue(
          issues,
          "INVALID_PRICE",
          "WARNING",
          "referencePrice",
          "Order notional could not be evaluated because no applicable price was available.",
          {
            orderType: order.type,
          },
        );
      }

      return;
    }

    if (
      rules.minimumNotional !== undefined &&
      notional < rules.minimumNotional
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        `Order notional ${notional} is below the minimum ${rules.minimumNotional}.`,
        {
          notional,
          minimumNotional:
            rules.minimumNotional,
        },
      );
    }

    if (
      rules.maximumNotional !== undefined &&
      notional > rules.maximumNotional
    ) {
      addIssue(
        issues,
        "INVALID_QUANTITY",
        "ERROR",
        "requestedQuantity",
        `Order notional ${notional} exceeds the maximum ${rules.maximumNotional}.`,
        {
          notional,
          maximumNotional:
            rules.maximumNotional,
        },
      );
    }
  }

  private validateAccount(
    order: LiveOrder,
    account:
      | OrderValidationAccountSnapshot
      | undefined,
    referencePrice: number | undefined,
    issues: OrderValidationIssue[],
  ): void {
    if (!account) {
      return;
    }

    if (!hasText(account.accountId)) {
      addIssue(
        issues,
        "INVALID_ACCOUNT",
        "ERROR",
        "account.accountId",
        "Account snapshot accountId must not be empty.",
      );
    }

    if (
      order.accountId !== undefined &&
      order.accountId !== account.accountId
    ) {
      addIssue(
        issues,
        "INVALID_ACCOUNT",
        "ERROR",
        "account.accountId",
        `Account "${account.accountId}" does not match order account "${order.accountId}".`,
        {
          orderAccountId:
            order.accountId,
          accountId:
            account.accountId,
        },
      );
    }

    if (!account.available) {
      addIssue(
        issues,
        "ACCOUNT_UNAVAILABLE",
        "ERROR",
        "account.available",
        `Account "${account.accountId}" is unavailable.`,
      );
    }

    if (!account.tradingEnabled) {
      addIssue(
        issues,
        "TRADING_DISABLED",
        "ERROR",
        "account.tradingEnabled",
        `Trading is disabled for account "${account.accountId}".`,
      );
    }

    this.validateAccountNumbers(
      account,
    );

    if (
      account.maximumOpenOrderCount !== undefined &&
      account.currentOpenOrderCount !== undefined &&
      account.currentOpenOrderCount >=
        account.maximumOpenOrderCount
    ) {
      addIssue(
        issues,
        "ACCOUNT_UNAVAILABLE",
        "ERROR",
        "account.currentOpenOrderCount",
        `Account "${account.accountId}" has reached its maximum open-order count.`,
        {
          currentOpenOrderCount:
            account.currentOpenOrderCount,
          maximumOpenOrderCount:
            account.maximumOpenOrderCount,
        },
      );
    }

    const notional =
      calculateOrderNotional(
        order,
        referencePrice,
      );

    if (
      notional !== undefined &&
      account.maximumOrderNotional !== undefined &&
      notional >
        account.maximumOrderNotional
    ) {
      addIssue(
        issues,
        "RISK_REJECTED",
        "ERROR",
        "requestedQuantity",
        `Order notional ${notional} exceeds the account maximum ${account.maximumOrderNotional}.`,
        {
          notional,
          maximumOrderNotional:
            account.maximumOrderNotional,
        },
      );
    }

    if (
      order.reduceOnly ||
      order.closePosition
    ) {
      return;
    }

    if (
      order.side === "BUY"
    ) {
      const requiredQuote =
        order.quoteOrderQuantity ??
        notional;

      const availableQuote =
        account.availableQuoteBalance ??
        account.availableBalance;

      if (
        requiredQuote !== undefined &&
        availableQuote !== undefined &&
        requiredQuote > availableQuote
      ) {
        addIssue(
          issues,
          "INSUFFICIENT_BALANCE",
          "ERROR",
          "account.availableQuoteBalance",
          `Available quote balance ${availableQuote} is insufficient for required amount ${requiredQuote}.`,
          {
            requiredQuote,
            availableQuote,
          },
        );
      }
    } else {
      const availableBase =
        account.availableBaseBalance;

      if (
        availableBase !== undefined &&
        order.requestedQuantity >
          availableBase
      ) {
        addIssue(
          issues,
          "INSUFFICIENT_BALANCE",
          "ERROR",
          "account.availableBaseBalance",
          `Available base balance ${availableBase} is insufficient for quantity ${order.requestedQuantity}.`,
          {
            requiredQuantity:
              order.requestedQuantity,
            availableBase,
          },
        );
      }
    }
  }

  private validateRiskApproval(
    order: LiveOrder,
    riskValidation:
      | OrderRiskValidation
      | undefined,
    validatedAt: number,
    issues: OrderValidationIssue[],
  ): void {
    if (!riskValidation) {
      return;
    }

    if (!riskValidation.approved) {
      addIssue(
        issues,
        "RISK_REJECTED",
        "ERROR",
        "riskValidation",
        riskValidation.reason ??
          "Order was rejected by the risk engine.",
        {
          riskCode:
            riskValidation.code,
          ...riskValidation.metadata,
        },
      );

      return;
    }

    if (
      riskValidation.approvedQuantity !== undefined
    ) {
      if (
        !isPositiveFiniteNumber(
          riskValidation.approvedQuantity,
        )
      ) {
        throw new OrderValidatorError(
          "INVALID_RISK_VALIDATION",
          "Risk-approved quantity must be a positive finite number.",
          {
            orderId: order.orderId,
          },
        );
      }

      if (
        order.requestedQuantity >
        riskValidation.approvedQuantity +
          this.options.numericTolerance
      ) {
        addIssue(
          issues,
          "RISK_REJECTED",
          "ERROR",
          "requestedQuantity",
          `Order quantity ${order.requestedQuantity} exceeds risk-approved quantity ${riskValidation.approvedQuantity}.`,
          {
            requestedQuantity:
              order.requestedQuantity,
            approvedQuantity:
              riskValidation.approvedQuantity,
          },
        );
      }
    }

    if (
      riskValidation.approvedNotional !== undefined &&
      !isPositiveFiniteNumber(
        riskValidation.approvedNotional,
      )
    ) {
      throw new OrderValidatorError(
        "INVALID_RISK_VALIDATION",
        "Risk-approved notional must be a positive finite number.",
        {
          orderId: order.orderId,
        },
      );
    }

    if (
      riskValidation.validatedAt !== undefined
    ) {
      const riskValidatedAt =
        validateTimestamp(
          riskValidation.validatedAt,
          "riskValidation.validatedAt",
        );

      if (
        riskValidatedAt > validatedAt
      ) {
        addIssue(
          issues,
          "RISK_REJECTED",
          "ERROR",
          "riskValidation.validatedAt",
          "Risk validation timestamp cannot be later than order validation time.",
          {
            riskValidatedAt,
            validatedAt,
          },
        );
      }

      const maximumAge =
        this.options.maximumRiskValidationAgeMs;

      if (
        maximumAge !== undefined &&
        validatedAt - riskValidatedAt >
          maximumAge
      ) {
        addIssue(
          issues,
          "RISK_REJECTED",
          "ERROR",
          "riskValidation.validatedAt",
          "Risk validation has expired and must be refreshed.",
          {
            riskValidatedAt,
            validatedAt,
            maximumAgeMs:
              maximumAge,
          },
        );
      }
    }
  }

  private validateDuplicates(
    order: LiveOrder,
    detector:
      | OrderDuplicateDetector
      | undefined,
    issues: OrderValidationIssue[],
  ): void {
    if (!detector) {
      return;
    }

    try {
      if (
        detector.hasOrderId(
          order.orderId,
        )
      ) {
        addIssue(
          issues,
          "DUPLICATE_ORDER",
          "ERROR",
          "orderId",
          `Order identifier "${order.orderId}" already exists.`,
          {
            orderId:
              order.orderId,
          },
        );
      }

      if (
        detector.hasClientOrderId(
          order.clientOrderId,
        )
      ) {
        addIssue(
          issues,
          "DUPLICATE_ORDER",
          "ERROR",
          "clientOrderId",
          `Client order identifier "${order.clientOrderId}" already exists.`,
          {
            clientOrderId:
              order.clientOrderId,
          },
        );
      }

      if (
        detector.hasIdempotencyKey(
          order.idempotencyKey,
        )
      ) {
        addIssue(
          issues,
          "DUPLICATE_ORDER",
          "ERROR",
          "idempotencyKey",
          `Idempotency key "${order.idempotencyKey}" has already been used.`,
          {
            idempotencyKey:
              order.idempotencyKey,
          },
        );
      }
    } catch (error) {
      addIssue(
        issues,
        "INTERNAL_ERROR",
        "ERROR",
        "duplicateDetector",
        "Duplicate-order detection failed.",
        {
          cause:
            error instanceof Error
              ? error.message
              : String(error),
        },
      );
    }
  }

  private validateOptionalPositiveNumber(
    value: number | undefined,
    field: string,
    code: OrderValidationCode,
    issues: OrderValidationIssue[],
  ): void {
    if (value === undefined) {
      return;
    }

    if (!isPositiveFiniteNumber(value)) {
      addIssue(
        issues,
        code,
        "ERROR",
        field,
        `${field} must be a positive finite number.`,
        {
          value,
        },
      );
    }
  }

  private validateAccountNumbers(
    account: OrderValidationAccountSnapshot,
  ): void {
    validateOptionalNonNegativeNumber(
      account.availableBalance,
      "account.availableBalance",
    );

    validateOptionalNonNegativeNumber(
      account.availableQuoteBalance,
      "account.availableQuoteBalance",
    );

    validateOptionalNonNegativeNumber(
      account.availableBaseBalance,
      "account.availableBaseBalance",
    );

    validateOptionalPositiveNumber(
      account.maximumOrderNotional,
      "account.maximumOrderNotional",
    );

    validateOptionalNonNegativeInteger(
      account.maximumOpenOrderCount,
      "account.maximumOpenOrderCount",
    );

    validateOptionalNonNegativeInteger(
      account.currentOpenOrderCount,
      "account.currentOpenOrderCount",
    );
  }

  private isOrderTypeCapabilityEnabled(
    type: LiveOrderType,
    capabilities:
      OrderValidationExchangeCapabilities,
  ): boolean {
    switch (type) {
      case "MARKET":
        return capabilities.supportsMarketOrders;

      case "LIMIT":
        return capabilities.supportsLimitOrders;

      case "STOP":
        return capabilities.supportsStopOrders;

      case "STOP_LIMIT":
        return capabilities.supportsStopLimitOrders;

      case "TAKE_PROFIT":
        return capabilities.supportsTakeProfitOrders;

      case "TAKE_PROFIT_LIMIT":
        return capabilities.supportsTakeProfitLimitOrders;

      case "TRAILING_STOP":
        return capabilities.supportsTrailingStopOrders;

      default: {
        const exhaustiveCheck: never =
          type;

        return exhaustiveCheck;
      }
    }
  }
}

/**
 * Functional convenience wrapper.
 */
export function validateOrder(
  order: LiveOrder,
  context: OrderValidationContext = {},
  options: OrderValidatorOptions = {},
  clock?: OrderValidatorClock,
): OrderValidationResult {
  return new OrderValidator(
    options,
    clock,
  ).validate(
    order,
    context,
  );
}

/**
 * Functional convenience wrapper that throws on error-severity issues.
 */
export function assertValidOrder(
  order: LiveOrder,
  context: OrderValidationContext = {},
  options: OrderValidatorOptions = {},
  clock?: OrderValidatorClock,
): OrderValidationResult {
  return new OrderValidator(
    options,
    clock,
  ).assertValid(
    order,
    context,
  );
}

/**
 * Creates a deterministic fixed validator clock.
 */
export function createFixedOrderValidatorClock(
  timestamp: number,
): OrderValidatorClock {
  const normalizedTimestamp =
    validateTimestamp(
      timestamp,
      "timestamp",
    );

  return Object.freeze({
    now(): number {
      return normalizedTimestamp;
    },
  });
}

function resolveOptions(
  options: OrderValidatorOptions,
): ResolvedOrderValidatorOptions {
  const numericTolerance: number =
    options.numericTolerance ??
    DEFAULT_OPTIONS.numericTolerance;

  if (
    !Number.isFinite(numericTolerance) ||
    numericTolerance < 0
  ) {
    throw new OrderValidatorError(
      "INVALID_NUMERIC_TOLERANCE",
      "Order validator numeric tolerance must be a non-negative finite number.",
    );
  }

  const maximumRiskValidationAgeMs:
    number | undefined =
      options.maximumRiskValidationAgeMs;

  if (
    maximumRiskValidationAgeMs !== undefined &&
    (
      !Number.isSafeInteger(
        maximumRiskValidationAgeMs,
      ) ||
      maximumRiskValidationAgeMs < 0
    )
  ) {
    throw new OrderValidatorError(
      "INVALID_RISK_VALIDATION_AGE",
      "Maximum risk-validation age must be a non-negative safe integer.",
    );
  }

  const resolved:
    ResolvedOrderValidatorOptions = {
      requireExchange:
        options.requireExchange ??
        DEFAULT_OPTIONS.requireExchange,

      requireAccount:
        options.requireAccount ??
        DEFAULT_OPTIONS.requireAccount,

      requireMarketRules:
        options.requireMarketRules ??
        DEFAULT_OPTIONS.requireMarketRules,

      requireExchangeCapabilities:
        options.requireExchangeCapabilities ??
        DEFAULT_OPTIONS.requireExchangeCapabilities,

      requireRiskApproval:
        options.requireRiskApproval ??
        DEFAULT_OPTIONS.requireRiskApproval,

      requireNewState:
        options.requireNewState ??
        DEFAULT_OPTIONS.requireNewState,

      allowRevalidation:
        options.allowRevalidation ??
        DEFAULT_OPTIONS.allowRevalidation,

      rejectExpiredOrders:
        options.rejectExpiredOrders ??
        DEFAULT_OPTIONS.rejectExpiredOrders,

      numericTolerance,

      maximumRiskValidationAgeMs,

      enforceExchangeConsistency:
        options.enforceExchangeConsistency ??
        DEFAULT_OPTIONS.enforceExchangeConsistency,
  };

  return Object.freeze(resolved);
}

function validateClock(
  clock: OrderValidatorClock,
): void {
  if (
    !isObject(clock) ||
    typeof clock.now !== "function"
  ) {
    throw new OrderValidatorError(
      "INVALID_ORDER_VALIDATOR_CLOCK",
      "Order validator clock must provide a now() function.",
    );
  }
}

function createResult(
  issues: readonly OrderValidationIssue[],
  validatedAt: number,
): OrderValidationResult {
  const frozenIssues =
    Object.freeze(
      issues
        .map((issue) =>
          freezeIssue(issue),
        )
        .sort(compareIssues),
    );

  return Object.freeze({
    valid:
      !frozenIssues.some(
        (issue) =>
          issue.severity === "ERROR",
      ),
    issues: frozenIssues,
    validatedAt,
  });
}

function freezeIssue(
  issue: OrderValidationIssue,
): OrderValidationIssue {
  return Object.freeze({
    code: issue.code,
    severity: issue.severity,
    field: issue.field,
    message: issue.message,
    metadata:
      freezeRecord(issue.metadata),
  });
}

function addIssue(
  issues: OrderValidationIssue[],
  code: OrderValidationCode,
  severity: OrderValidationSeverity,
  field: string | undefined,
  message: string,
  metadata:
    Readonly<Record<string, unknown>> =
      EMPTY_METADATA,
): void {
  const normalizedMessage =
    message.trim();

  if (!normalizedMessage) {
    throw new OrderValidatorError(
      "INVALID_VALIDATION_ISSUE",
      "Order validation issue message must not be empty.",
    );
  }

  issues.push(
    Object.freeze({
      code,
      severity,
      field,
      message: normalizedMessage,
      metadata:
        freezeRecord(metadata),
    }),
  );
}

function compareIssues(
  left: OrderValidationIssue,
  right: OrderValidationIssue,
): number {
  const severityDifference =
    severityRank(left.severity) -
    severityRank(right.severity);

  if (severityDifference !== 0) {
    return severityDifference;
  }

  const fieldDifference =
    (left.field ?? "").localeCompare(
      right.field ?? "",
    );

  if (fieldDifference !== 0) {
    return fieldDifference;
  }

  const codeDifference =
    left.code.localeCompare(
      right.code,
    );

  if (codeDifference !== 0) {
    return codeDifference;
  }

  return left.message.localeCompare(
    right.message,
  );
}

function severityRank(
  severity: OrderValidationSeverity,
): number {
  switch (severity) {
    case "ERROR":
      return 0;

    case "WARNING":
      return 1;

    case "INFO":
      return 2;

    default: {
      const exhaustiveCheck: never =
        severity;

      return exhaustiveCheck;
    }
  }
}

function validateRequiredTextField(
  value: string,
  field: string,
  code: OrderValidationCode,
  issues: OrderValidationIssue[],
): void {
  if (!hasText(value)) {
    addIssue(
      issues,
      code,
      "ERROR",
      field,
      `${field} must not be empty.`,
    );
  }
}

function calculateOrderNotional(
  order: LiveOrder,
  referencePrice: number | undefined,
): number | undefined {
  if (
    order.quoteOrderQuantity !== undefined
  ) {
    return normalizeFloatingPoint(
      order.quoteOrderQuantity,
    );
  }

  const price =
    order.limitPrice ??
    order.stopPrice ??
    referencePrice;

  if (
    price === undefined ||
    !isPositiveFiniteNumber(price) ||
    !isPositiveFiniteNumber(
      order.requestedQuantity,
    )
  ) {
    return undefined;
  }

  return normalizeFloatingPoint(
    order.requestedQuantity * price,
  );
}

function isIncrementAligned(
  value: number,
  increment: number,
  tolerance: number,
): boolean {
  if (
    !isPositiveFiniteNumber(
      increment,
    )
  ) {
    return false;
  }

  const quotient =
    value / increment;

  const nearestInteger =
    Math.round(quotient);

  const difference =
    Math.abs(
      quotient - nearestInteger,
    );

  const scaledTolerance =
    Math.max(
      tolerance,
      Number.EPSILON *
        Math.max(
          1,
          Math.abs(quotient),
        ) *
        16,
    );

  return difference <= scaledTolerance;
}

function normalizeFloatingPoint(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(
    value.toPrecision(15),
  );
}

function validatePositiveConstraint(
  value: number | undefined,
  field: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!isPositiveFiniteNumber(value)) {
    throw new OrderValidatorError(
      "INVALID_MARKET_RULES",
      `${field} must be a positive finite number.`,
    );
  }
}

function validateOptionalPositiveNumber(
  value: number | undefined,
  field: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!isPositiveFiniteNumber(value)) {
    throw new OrderValidatorError(
      "INVALID_VALIDATION_CONTEXT",
      `${field} must be a positive finite number.`,
    );
  }
}

function validateOptionalNonNegativeNumber(
  value: number | undefined,
  field: string,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new OrderValidatorError(
      "INVALID_VALIDATION_CONTEXT",
      `${field} must be a non-negative finite number.`,
    );
  }
}

function validateOptionalNonNegativeInteger(
  value: number | undefined,
  field: string,
): void {
  if (value === undefined) {
    return;
  }

  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new OrderValidatorError(
      "INVALID_VALIDATION_CONTEXT",
      `${field} must be a non-negative safe integer.`,
    );
  }
}

function validateTimestamp(
  value: number,
  field: string,
): number {
  if (!isNonNegativeSafeInteger(value)) {
    throw new OrderValidatorError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }

  return value;
}

function isPositiveFiniteNumber(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );
}

function isNonNegativeSafeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function hasText(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function normalizeComparableText(
  value: string,
): string {
  return value
    .trim()
    .toUpperCase();
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function freezeRecord(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result:
    Record<string, unknown> = {};

  for (
    const key of Object.keys(
      source,
    ).sort()
  ) {
    result[key] =
      freezeUnknown(source[key]);
  }

  return Object.freeze(result);
}

function freezeUnknown(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        freezeUnknown(entry),
      ),
    );
  }

  if (isObject(value)) {
    return freezeRecord(value);
  }

  return value;
}