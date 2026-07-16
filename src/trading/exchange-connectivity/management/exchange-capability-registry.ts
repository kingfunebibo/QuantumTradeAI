/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/exchange-capability-registry.ts
 *
 * Purpose:
 * Maintains deterministic, immutable capability profiles for registered
 * exchanges.
 *
 * The capability registry allows discovery and routing components to determine
 * which exchanges support a requested market type, trading operation, account
 * feature, transport, or order characteristic without coupling themselves to
 * exchange-specific adapter implementations.
 */

import {
  normalizeExchangeRegistryId,
  type ExchangeRegistryId,
} from "./exchange-registry";

/**
 * Market categories supported by exchange connectors.
 */
export type ExchangeMarketType =
  | "SPOT"
  | "MARGIN"
  | "PERPETUAL"
  | "FUTURES"
  | "OPTIONS";

/**
 * Trading operations that may be supported by an exchange.
 */
export type ExchangeTradingCapability =
  | "PLACE_ORDER"
  | "CANCEL_ORDER"
  | "AMEND_ORDER"
  | "CANCEL_ALL_ORDERS"
  | "BATCH_PLACE_ORDERS"
  | "BATCH_CANCEL_ORDERS"
  | "QUERY_ORDER"
  | "QUERY_OPEN_ORDERS"
  | "QUERY_ORDER_HISTORY"
  | "QUERY_TRADE_HISTORY";

/**
 * Public market-data operations that may be supported by an exchange.
 */
export type ExchangeMarketDataCapability =
  | "TICKER"
  | "TICKERS"
  | "ORDER_BOOK"
  | "TRADES"
  | "CANDLES"
  | "INSTRUMENTS"
  | "SERVER_TIME"
  | "FUNDING_RATE"
  | "OPEN_INTEREST"
  | "MARK_PRICE"
  | "INDEX_PRICE";

/**
 * Private account operations that may be supported by an exchange.
 */
export type ExchangeAccountCapability =
  | "ACCOUNT_INFORMATION"
  | "BALANCES"
  | "POSITIONS"
  | "POSITION_HISTORY"
  | "FEE_RATES"
  | "TRANSACTION_HISTORY"
  | "DEPOSIT_HISTORY"
  | "WITHDRAWAL_HISTORY";

/**
 * Realtime transport capabilities.
 */
export type ExchangeRealtimeCapability =
  | "PUBLIC_WEBSOCKET"
  | "PRIVATE_WEBSOCKET"
  | "ORDER_BOOK_STREAM"
  | "TRADE_STREAM"
  | "TICKER_STREAM"
  | "CANDLE_STREAM"
  | "ORDER_STREAM"
  | "POSITION_STREAM"
  | "BALANCE_STREAM";

/**
 * Authentication methods supported by an exchange connector.
 */
export type ExchangeAuthenticationCapability =
  | "API_KEY"
  | "API_SECRET"
  | "PASSPHRASE"
  | "RSA_SIGNATURE"
  | "HMAC_SIGNATURE"
  | "SUBACCOUNT"
  | "DEMO_TRADING";

/**
 * Order types supported by an exchange.
 */
export type ExchangeSupportedOrderType =
  | "MARKET"
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "TAKE_PROFIT_LIMIT"
  | "TRAILING_STOP";

/**
 * Time-in-force values supported by an exchange.
 */
export type ExchangeSupportedTimeInForce =
  | "GTC"
  | "IOC"
  | "FOK"
  | "POST_ONLY";

/**
 * Position modes supported by derivatives exchanges.
 */
export type ExchangePositionMode =
  | "ONE_WAY"
  | "HEDGE";

/**
 * Stable capability-registry failure categories.
 */
export type ExchangeCapabilityRegistryErrorCode =
  | "INVALID_EXCHANGE_ID"
  | "INVALID_CAPABILITY_PROFILE"
  | "INVALID_CAPABILITY_VALUE"
  | "CAPABILITY_PROFILE_ALREADY_REGISTERED"
  | "CAPABILITY_PROFILE_NOT_REGISTERED";

/**
 * Domain-specific capability-registry error.
 */
export class ExchangeCapabilityRegistryError extends Error {
  public readonly code: ExchangeCapabilityRegistryErrorCode;

  public readonly exchangeId?: ExchangeRegistryId;

  public constructor(
    code: ExchangeCapabilityRegistryErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: ExchangeRegistryId;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "ExchangeCapabilityRegistryError";
    this.code = code;
    this.exchangeId = options.exchangeId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Immutable capability profile associated with one exchange.
 */
export interface ExchangeCapabilityProfile {
  readonly exchangeId: ExchangeRegistryId;

  readonly marketTypes: readonly ExchangeMarketType[];

  readonly trading: readonly ExchangeTradingCapability[];

  readonly marketData: readonly ExchangeMarketDataCapability[];

  readonly account: readonly ExchangeAccountCapability[];

  readonly realtime: readonly ExchangeRealtimeCapability[];

  readonly authentication: readonly ExchangeAuthenticationCapability[];

  readonly orderTypes: readonly ExchangeSupportedOrderType[];

  readonly timeInForce: readonly ExchangeSupportedTimeInForce[];

  readonly positionModes: readonly ExchangePositionMode[];

  /**
   * Whether the exchange supports sandbox, demo, or testnet operation.
   */
  readonly supportsSandbox: boolean;

  /**
   * Whether the connector supports authenticated private operations.
   */
  readonly supportsPrivateApi: boolean;

  /**
   * Optional immutable exchange-specific capability metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Input accepted when registering or replacing a capability profile.
 */
export interface RegisterExchangeCapabilityProfileInput {
  readonly exchangeId: ExchangeRegistryId;

  readonly marketTypes?: readonly ExchangeMarketType[];

  readonly trading?: readonly ExchangeTradingCapability[];

  readonly marketData?: readonly ExchangeMarketDataCapability[];

  readonly account?: readonly ExchangeAccountCapability[];

  readonly realtime?: readonly ExchangeRealtimeCapability[];

  readonly authentication?: readonly ExchangeAuthenticationCapability[];

  readonly orderTypes?: readonly ExchangeSupportedOrderType[];

  readonly timeInForce?: readonly ExchangeSupportedTimeInForce[];

  readonly positionModes?: readonly ExchangePositionMode[];

  readonly supportsSandbox?: boolean;

  readonly supportsPrivateApi?: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Capability requirements used by discovery and routing.
 */
export interface ExchangeCapabilityRequirement {
  readonly marketTypes?: readonly ExchangeMarketType[];

  readonly trading?: readonly ExchangeTradingCapability[];

  readonly marketData?: readonly ExchangeMarketDataCapability[];

  readonly account?: readonly ExchangeAccountCapability[];

  readonly realtime?: readonly ExchangeRealtimeCapability[];

  readonly authentication?: readonly ExchangeAuthenticationCapability[];

  readonly orderTypes?: readonly ExchangeSupportedOrderType[];

  readonly timeInForce?: readonly ExchangeSupportedTimeInForce[];

  readonly positionModes?: readonly ExchangePositionMode[];

  readonly requireSandbox?: boolean;

  readonly requirePrivateApi?: boolean;
}

/**
 * Immutable snapshot of the complete capability registry.
 */
export interface ExchangeCapabilityRegistrySnapshot {
  readonly version: number;

  readonly size: number;

  readonly profiles: readonly ExchangeCapabilityProfile[];
}

/**
 * Public capability-registry contract.
 */
export interface ExchangeCapabilityRegistryContract {
  readonly size: number;

  readonly version: number;

  register(
    input: RegisterExchangeCapabilityProfileInput,
  ): ExchangeCapabilityProfile;

  replace(
    input: RegisterExchangeCapabilityProfileInput,
  ): ExchangeCapabilityProfile;

  unregister(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile;

  get(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile | undefined;

  require(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile;

  has(exchangeId: ExchangeRegistryId): boolean;

  list(): readonly ExchangeCapabilityProfile[];

  listExchangeIds(): readonly ExchangeRegistryId[];

  findMatching(
    requirement: ExchangeCapabilityRequirement,
  ): readonly ExchangeCapabilityProfile[];

  supports(
    exchangeId: ExchangeRegistryId,
    requirement: ExchangeCapabilityRequirement,
  ): boolean;

  snapshot(): ExchangeCapabilityRegistrySnapshot;

  clear(): readonly ExchangeCapabilityProfile[];
}

/**
 * Canonical market-type values.
 */
export const EXCHANGE_MARKET_TYPES = [
  "SPOT",
  "MARGIN",
  "PERPETUAL",
  "FUTURES",
  "OPTIONS",
] as const satisfies readonly ExchangeMarketType[];

/**
 * Canonical trading-capability values.
 */
export const EXCHANGE_TRADING_CAPABILITIES = [
  "PLACE_ORDER",
  "CANCEL_ORDER",
  "AMEND_ORDER",
  "CANCEL_ALL_ORDERS",
  "BATCH_PLACE_ORDERS",
  "BATCH_CANCEL_ORDERS",
  "QUERY_ORDER",
  "QUERY_OPEN_ORDERS",
  "QUERY_ORDER_HISTORY",
  "QUERY_TRADE_HISTORY",
] as const satisfies readonly ExchangeTradingCapability[];

/**
 * Canonical market-data capability values.
 */
export const EXCHANGE_MARKET_DATA_CAPABILITIES = [
  "TICKER",
  "TICKERS",
  "ORDER_BOOK",
  "TRADES",
  "CANDLES",
  "INSTRUMENTS",
  "SERVER_TIME",
  "FUNDING_RATE",
  "OPEN_INTEREST",
  "MARK_PRICE",
  "INDEX_PRICE",
] as const satisfies readonly ExchangeMarketDataCapability[];

/**
 * Canonical account-capability values.
 */
export const EXCHANGE_ACCOUNT_CAPABILITIES = [
  "ACCOUNT_INFORMATION",
  "BALANCES",
  "POSITIONS",
  "POSITION_HISTORY",
  "FEE_RATES",
  "TRANSACTION_HISTORY",
  "DEPOSIT_HISTORY",
  "WITHDRAWAL_HISTORY",
] as const satisfies readonly ExchangeAccountCapability[];

/**
 * Canonical realtime-capability values.
 */
export const EXCHANGE_REALTIME_CAPABILITIES = [
  "PUBLIC_WEBSOCKET",
  "PRIVATE_WEBSOCKET",
  "ORDER_BOOK_STREAM",
  "TRADE_STREAM",
  "TICKER_STREAM",
  "CANDLE_STREAM",
  "ORDER_STREAM",
  "POSITION_STREAM",
  "BALANCE_STREAM",
] as const satisfies readonly ExchangeRealtimeCapability[];

/**
 * Canonical authentication capability values.
 */
export const EXCHANGE_AUTHENTICATION_CAPABILITIES = [
  "API_KEY",
  "API_SECRET",
  "PASSPHRASE",
  "RSA_SIGNATURE",
  "HMAC_SIGNATURE",
  "SUBACCOUNT",
  "DEMO_TRADING",
] as const satisfies readonly ExchangeAuthenticationCapability[];

/**
 * Canonical order-type values.
 */
export const EXCHANGE_SUPPORTED_ORDER_TYPES = [
  "MARKET",
  "LIMIT",
  "STOP",
  "STOP_LIMIT",
  "TAKE_PROFIT",
  "TAKE_PROFIT_LIMIT",
  "TRAILING_STOP",
] as const satisfies readonly ExchangeSupportedOrderType[];

/**
 * Canonical time-in-force values.
 */
export const EXCHANGE_SUPPORTED_TIME_IN_FORCE = [
  "GTC",
  "IOC",
  "FOK",
  "POST_ONLY",
] as const satisfies readonly ExchangeSupportedTimeInForce[];

/**
 * Canonical position-mode values.
 */
export const EXCHANGE_POSITION_MODES = [
  "ONE_WAY",
  "HEDGE",
] as const satisfies readonly ExchangePositionMode[];

/**
 * Deterministic capability registry for managed exchanges.
 */
export class ExchangeCapabilityRegistry
  implements ExchangeCapabilityRegistryContract
{
  private readonly profilesByExchangeId = new Map<
    ExchangeRegistryId,
    ExchangeCapabilityProfile
  >();

  private readonly registrationOrder = new Map<
    ExchangeRegistryId,
    number
  >();

  private nextRegistrationSequence = 1;

  private mutationVersion = 0;

  public get size(): number {
    return this.profilesByExchangeId.size;
  }

  public get version(): number {
    return this.mutationVersion;
  }

  /**
   * Registers a new exchange capability profile.
   */
  public register(
    input: RegisterExchangeCapabilityProfileInput,
  ): ExchangeCapabilityProfile {
    const profile =
      createExchangeCapabilityProfile(input);

    if (
      this.profilesByExchangeId.has(
        profile.exchangeId,
      )
    ) {
      throw new ExchangeCapabilityRegistryError(
        "CAPABILITY_PROFILE_ALREADY_REGISTERED",
        `Capability profile for exchange "${profile.exchangeId}" is already registered.`,
        {
          exchangeId: profile.exchangeId,
        },
      );
    }

    this.profilesByExchangeId.set(
      profile.exchangeId,
      profile,
    );

    this.registrationOrder.set(
      profile.exchangeId,
      this.nextRegistrationSequence,
    );

    this.nextRegistrationSequence += 1;
    this.mutationVersion += 1;

    return profile;
  }

  /**
   * Replaces an existing profile while preserving deterministic list order.
   *
   * If no profile exists, this behaves like register().
   */
  public replace(
    input: RegisterExchangeCapabilityProfileInput,
  ): ExchangeCapabilityProfile {
    const profile =
      createExchangeCapabilityProfile(input);

    if (
      !this.profilesByExchangeId.has(
        profile.exchangeId,
      )
    ) {
      return this.register(input);
    }

    this.profilesByExchangeId.set(
      profile.exchangeId,
      profile,
    );

    this.mutationVersion += 1;

    return profile;
  }

  /**
   * Removes and returns a capability profile.
   */
  public unregister(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile {
    const normalizedExchangeId =
      normalizeCapabilityExchangeId(
        exchangeId,
      );

    const profile =
      this.profilesByExchangeId.get(
        normalizedExchangeId,
      );

    if (profile === undefined) {
      throw new ExchangeCapabilityRegistryError(
        "CAPABILITY_PROFILE_NOT_REGISTERED",
        `Capability profile for exchange "${normalizedExchangeId}" is not registered.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    this.profilesByExchangeId.delete(
      normalizedExchangeId,
    );

    this.registrationOrder.delete(
      normalizedExchangeId,
    );

    this.mutationVersion += 1;

    return profile;
  }

  /**
   * Resolves a profile without throwing when absent.
   */
  public get(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile | undefined {
    const normalizedExchangeId =
      normalizeCapabilityExchangeId(
        exchangeId,
      );

    return this.profilesByExchangeId.get(
      normalizedExchangeId,
    );
  }

  /**
   * Resolves a profile and throws when absent.
   */
  public require(
    exchangeId: ExchangeRegistryId,
  ): ExchangeCapabilityProfile {
    const normalizedExchangeId =
      normalizeCapabilityExchangeId(
        exchangeId,
      );

    const profile =
      this.profilesByExchangeId.get(
        normalizedExchangeId,
      );

    if (profile === undefined) {
      throw new ExchangeCapabilityRegistryError(
        "CAPABILITY_PROFILE_NOT_REGISTERED",
        `Capability profile for exchange "${normalizedExchangeId}" is not registered.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    return profile;
  }

  /**
   * Returns whether a profile is registered.
   */
  public has(
    exchangeId: ExchangeRegistryId,
  ): boolean {
    const normalizedExchangeId =
      normalizeCapabilityExchangeId(
        exchangeId,
      );

    return this.profilesByExchangeId.has(
      normalizedExchangeId,
    );
  }

  /**
   * Returns profiles in deterministic registration order.
   */
  public list(): readonly ExchangeCapabilityProfile[] {
    const profiles = Array.from(
      this.profilesByExchangeId.values(),
    ).sort((left, right) => {
      const leftSequence =
        this.registrationOrder.get(
          left.exchangeId,
        ) ?? Number.MAX_SAFE_INTEGER;

      const rightSequence =
        this.registrationOrder.get(
          right.exchangeId,
        ) ?? Number.MAX_SAFE_INTEGER;

      if (
        leftSequence !== rightSequence
      ) {
        return leftSequence - rightSequence;
      }

      return left.exchangeId.localeCompare(
        right.exchangeId,
      );
    });

    return Object.freeze(profiles);
  }

  /**
   * Returns exchange identifiers in deterministic registration order.
   */
  public listExchangeIds():
    readonly ExchangeRegistryId[] {
    return Object.freeze(
      this.list().map(
        (profile) =>
          profile.exchangeId,
      ),
    );
  }

  /**
   * Finds every profile satisfying all requested capabilities.
   */
  public findMatching(
    requirement: ExchangeCapabilityRequirement,
  ): readonly ExchangeCapabilityProfile[] {
    const normalizedRequirement =
      normalizeCapabilityRequirement(
        requirement,
      );

    return Object.freeze(
      this.list().filter((profile) =>
        profileMatchesRequirement(
          profile,
          normalizedRequirement,
        ),
      ),
    );
  }

  /**
   * Returns whether one exchange satisfies all requested capabilities.
   */
  public supports(
    exchangeId: ExchangeRegistryId,
    requirement: ExchangeCapabilityRequirement,
  ): boolean {
    const profile = this.get(exchangeId);

    if (profile === undefined) {
      return false;
    }

    return profileMatchesRequirement(
      profile,
      normalizeCapabilityRequirement(
        requirement,
      ),
    );
  }

  /**
   * Creates an immutable point-in-time registry snapshot.
   */
  public snapshot(): ExchangeCapabilityRegistrySnapshot {
    return Object.freeze({
      version: this.mutationVersion,
      size: this.size,
      profiles: this.list(),
    });
  }

  /**
   * Clears all profiles.
   *
   * Clearing an empty registry is a no-op and does not increment version.
   */
  public clear(): readonly ExchangeCapabilityProfile[] {
    const removedProfiles = this.list();

    if (removedProfiles.length === 0) {
      return removedProfiles;
    }

    this.profilesByExchangeId.clear();
    this.registrationOrder.clear();
    this.mutationVersion += 1;

    return removedProfiles;
  }
}

/**
 * Creates a normalized immutable capability profile.
 */
export function createExchangeCapabilityProfile(
  input: RegisterExchangeCapabilityProfileInput,
): ExchangeCapabilityProfile {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new ExchangeCapabilityRegistryError(
      "INVALID_CAPABILITY_PROFILE",
      "Exchange capability profile input must be a record object.",
    );
  }

  const exchangeId =
    normalizeCapabilityExchangeId(
      input.exchangeId,
    );

  const metadata =
    input.metadata === undefined
      ? undefined
      : freezeMetadata(input.metadata);

  return Object.freeze({
    exchangeId,
    marketTypes: normalizeCapabilityList(
      input.marketTypes,
      EXCHANGE_MARKET_TYPES,
      "market type",
    ),
    trading: normalizeCapabilityList(
      input.trading,
      EXCHANGE_TRADING_CAPABILITIES,
      "trading capability",
    ),
    marketData: normalizeCapabilityList(
      input.marketData,
      EXCHANGE_MARKET_DATA_CAPABILITIES,
      "market-data capability",
    ),
    account: normalizeCapabilityList(
      input.account,
      EXCHANGE_ACCOUNT_CAPABILITIES,
      "account capability",
    ),
    realtime: normalizeCapabilityList(
      input.realtime,
      EXCHANGE_REALTIME_CAPABILITIES,
      "realtime capability",
    ),
    authentication:
      normalizeCapabilityList(
        input.authentication,
        EXCHANGE_AUTHENTICATION_CAPABILITIES,
        "authentication capability",
      ),
    orderTypes: normalizeCapabilityList(
      input.orderTypes,
      EXCHANGE_SUPPORTED_ORDER_TYPES,
      "order type",
    ),
    timeInForce:
      normalizeCapabilityList(
        input.timeInForce,
        EXCHANGE_SUPPORTED_TIME_IN_FORCE,
        "time-in-force capability",
      ),
    positionModes:
      normalizeCapabilityList(
        input.positionModes,
        EXCHANGE_POSITION_MODES,
        "position mode",
      ),
    supportsSandbox:
      input.supportsSandbox ?? false,
    supportsPrivateApi:
      input.supportsPrivateApi ?? false,
    ...(metadata === undefined
      ? {}
      : {
          metadata,
        }),
  });
}

/**
 * Returns whether a profile satisfies all requested capabilities.
 */
export function profileMatchesRequirement(
  profile: ExchangeCapabilityProfile,
  requirement: ExchangeCapabilityRequirement,
): boolean {
  const normalizedRequirement =
    normalizeCapabilityRequirement(
      requirement,
    );

  return (
    includesAll(
      profile.marketTypes,
      normalizedRequirement.marketTypes,
    ) &&
    includesAll(
      profile.trading,
      normalizedRequirement.trading,
    ) &&
    includesAll(
      profile.marketData,
      normalizedRequirement.marketData,
    ) &&
    includesAll(
      profile.account,
      normalizedRequirement.account,
    ) &&
    includesAll(
      profile.realtime,
      normalizedRequirement.realtime,
    ) &&
    includesAll(
      profile.authentication,
      normalizedRequirement.authentication,
    ) &&
    includesAll(
      profile.orderTypes,
      normalizedRequirement.orderTypes,
    ) &&
    includesAll(
      profile.timeInForce,
      normalizedRequirement.timeInForce,
    ) &&
    includesAll(
      profile.positionModes,
      normalizedRequirement.positionModes,
    ) &&
    (
      normalizedRequirement.requireSandbox !==
        true ||
      profile.supportsSandbox
    ) &&
    (
      normalizedRequirement.requirePrivateApi !==
        true ||
      profile.supportsPrivateApi
    )
  );
}

/**
 * Normalizes a routing or discovery capability requirement.
 */
export function normalizeCapabilityRequirement(
  requirement: ExchangeCapabilityRequirement,
): ExchangeCapabilityRequirement {
  if (
    requirement === null ||
    typeof requirement !== "object" ||
    Array.isArray(requirement)
  ) {
    throw new ExchangeCapabilityRegistryError(
      "INVALID_CAPABILITY_PROFILE",
      "Exchange capability requirement must be a record object.",
    );
  }

  return Object.freeze({
    marketTypes: normalizeCapabilityList(
      requirement.marketTypes,
      EXCHANGE_MARKET_TYPES,
      "market type",
    ),
    trading: normalizeCapabilityList(
      requirement.trading,
      EXCHANGE_TRADING_CAPABILITIES,
      "trading capability",
    ),
    marketData: normalizeCapabilityList(
      requirement.marketData,
      EXCHANGE_MARKET_DATA_CAPABILITIES,
      "market-data capability",
    ),
    account: normalizeCapabilityList(
      requirement.account,
      EXCHANGE_ACCOUNT_CAPABILITIES,
      "account capability",
    ),
    realtime: normalizeCapabilityList(
      requirement.realtime,
      EXCHANGE_REALTIME_CAPABILITIES,
      "realtime capability",
    ),
    authentication:
      normalizeCapabilityList(
        requirement.authentication,
        EXCHANGE_AUTHENTICATION_CAPABILITIES,
        "authentication capability",
      ),
    orderTypes: normalizeCapabilityList(
      requirement.orderTypes,
      EXCHANGE_SUPPORTED_ORDER_TYPES,
      "order type",
    ),
    timeInForce:
      normalizeCapabilityList(
        requirement.timeInForce,
        EXCHANGE_SUPPORTED_TIME_IN_FORCE,
        "time-in-force capability",
      ),
    positionModes:
      normalizeCapabilityList(
        requirement.positionModes,
        EXCHANGE_POSITION_MODES,
        "position mode",
      ),
    requireSandbox:
      requirement.requireSandbox ??
      false,
    requirePrivateApi:
      requirement.requirePrivateApi ??
      false,
  });
}

/**
 * Normalizes and validates an exchange identifier used by capability profiles.
 */
function normalizeCapabilityExchangeId(
  exchangeId: ExchangeRegistryId,
): ExchangeRegistryId {
  try {
    return normalizeExchangeRegistryId(
      exchangeId,
    );
  } catch (cause: unknown) {
    throw new ExchangeCapabilityRegistryError(
      "INVALID_EXCHANGE_ID",
      `Invalid capability-profile exchange identifier "${String(
        exchangeId,
      )}".`,
      {
        cause,
      },
    );
  }
}

/**
 * Validates, de-duplicates, and canonically orders capability values.
 */
function normalizeCapabilityList<
  TValue extends string,
>(
  values: readonly TValue[] | undefined,
  supportedValues: readonly TValue[],
  label: string,
): readonly TValue[] {
  if (values === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(values)) {
    throw new ExchangeCapabilityRegistryError(
      "INVALID_CAPABILITY_PROFILE",
      `Exchange ${label} values must be provided as an array.`,
    );
  }

  /*
   * Runtime array validation widens the inspected element to string.
   * The supported-value set therefore intentionally uses string values.
   * After successful membership validation, the value can safely be restored
   * to the generic TValue subtype.
   */
  const supportedValueSet =
    new Set<string>(supportedValues);

  const uniqueValues =
    new Set<TValue>();

  for (const rawValue of values) {
    if (
      typeof rawValue !== "string" ||
      !supportedValueSet.has(rawValue)
    ) {
      throw new ExchangeCapabilityRegistryError(
        "INVALID_CAPABILITY_VALUE",
        `Unsupported exchange ${label} "${String(
          rawValue,
        )}".`,
      );
    }

    const value = rawValue as TValue;

    uniqueValues.add(value);
  }

  /*
   * Filtering the canonical list guarantees deterministic ordering regardless
   * of the order supplied by the caller.
   */
  const normalizedValues =
    supportedValues.filter((value) =>
      uniqueValues.has(value),
    );

  return Object.freeze([
    ...normalizedValues,
  ]);
}

/**
 * Returns whether every required value exists in the available value list.
 */
function includesAll<
  TValue extends string,
>(
  availableValues: readonly TValue[],
  requiredValues:
    | readonly TValue[]
    | undefined,
): boolean {
  if (
    requiredValues === undefined ||
    requiredValues.length === 0
  ) {
    return true;
  }

  const availableValueSet =
    new Set<TValue>(availableValues);

  return requiredValues.every(
    (value) =>
      availableValueSet.has(value),
  );
}

/**
 * Creates an immutable shallow copy of capability metadata.
 */
function freezeMetadata(
  metadata: Readonly<
    Record<string, unknown>
  >,
): Readonly<Record<string, unknown>> {
  if (
    metadata === null ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new ExchangeCapabilityRegistryError(
      "INVALID_CAPABILITY_PROFILE",
      "Exchange capability metadata must be a record object.",
    );
  }

  return Object.freeze({
    ...metadata,
  });
}