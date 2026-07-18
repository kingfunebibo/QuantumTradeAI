/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic gas-cost estimator for cross-DEX arbitrage routes.
 *
 * Responsibilities:
 * - Estimate route gas from configurable base, leg, DEX, calldata, and funding
 *   overhead profiles.
 * - Support LEGACY, EIP_1559, and PROVIDER_MANAGED gas-price quotes.
 * - Apply deterministic gas-limit and fee safety multipliers.
 * - Convert gas cost into native-currency and optional USD values.
 * - Enforce optional gas-policy ceilings.
 * - Return immutable and auditable component breakdowns.
 *
 * This module performs no RPC calls. Live gas prices and native/USD prices are
 * supplied by upstream providers so estimation remains deterministic in tests.
 */

import {
  type ArbitrageRoute,
  type BasisPoints,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexId,
  type FlashLiquidityQuote,
  FlashLiquidityType,
  type GasAmount,
  type GasCostEstimate,
  type GasManagementPolicy,
  type GasPriceQuote,
  GasPricingMode,
  type TokenAmount,
  type UnixTimestampMilliseconds,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";

export enum GasCostEstimatorErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_ROUTE = "INVALID_ROUTE",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  INVALID_GAS_PRICE = "INVALID_GAS_PRICE",
  GAS_PRICE_EXPIRED = "GAS_PRICE_EXPIRED",
  UNSUPPORTED_PRICING_MODE = "UNSUPPORTED_PRICING_MODE",
  INVALID_NATIVE_PRICE = "INVALID_NATIVE_PRICE",
  GAS_LIMIT_EXCEEDED = "GAS_LIMIT_EXCEEDED",
  GAS_COST_EXCEEDED = "GAS_COST_EXCEEDED",
  ARITHMETIC_OVERFLOW = "ARITHMETIC_OVERFLOW",
}

export class GasCostEstimatorError extends Error {
  public readonly code: GasCostEstimatorErrorCode;
  public readonly chainId?: ChainId;
  public readonly routeId?: string;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: GasCostEstimatorErrorCode,
    message: string,
    options: Readonly<{
      chainId?: ChainId;
      routeId?: string;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "GasCostEstimatorError";
    this.code = code;
    this.chainId = options.chainId;
    this.routeId = options.routeId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface GasCostEstimatorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface DexGasProfile {
  readonly dexId: DexId;
  readonly fixedGas: GasAmount;
  readonly perLegGas?: GasAmount;
  readonly perCalldataByteGas?: GasAmount;
  readonly enabled?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityGasProfile {
  readonly liquidityType: FlashLiquidityType;
  readonly fixedGas: GasAmount;
  readonly callbackGas?: GasAmount;
  readonly repaymentGas?: GasAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface GasCostEstimatorOptions {
  readonly baseTransactionGas?: GasAmount;
  readonly atomicExecutorOverheadGas?: GasAmount;
  readonly defaultPerLegGas?: GasAmount;
  readonly defaultPerCalldataByteGas?: GasAmount;
  readonly tokenApprovalGas?: GasAmount;
  readonly tokenTransferGas?: GasAmount;
  readonly settlementGas?: GasAmount;
  readonly gasLimitSafetyMultiplier?: number;
  readonly feeSafetyMultiplier?: number;
  readonly nativeCurrencyDecimals?: number;
  readonly maximumGasPriceAgeMilliseconds?: number;
  readonly rejectFutureGasQuotes?: boolean;
  readonly rejectExpiredGasQuotes?: boolean;
  readonly defaultProviderManagedGasPriceWei?: WeiAmount;
  readonly maximumGasLimit?: GasAmount;
  readonly dexProfiles?: readonly DexGasProfile[];
  readonly flashLiquidityProfiles?: readonly FlashLiquidityGasProfile[];
}

export interface GasCostEstimationRequest {
  readonly route: ArbitrageRoute;
  readonly gasPrice: GasPriceQuote;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly gasPolicy?: GasManagementPolicy;
  readonly nativeCurrencyUsdPrice?: number;
  readonly approvalTransactionCount?: number;
  readonly tokenTransferCount?: number;
  readonly includeSettlementOverhead?: boolean;
  readonly additionalGas?: GasAmount;
  readonly gasLimitSafetyMultiplier?: number;
  readonly feeSafetyMultiplier?: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface GasCostComponent {
  readonly name: string;
  readonly gas: GasAmount;
  readonly source: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface GasPriceResolution {
  readonly mode: GasPricingMode;
  readonly quotedUnitPriceWei: WeiAmount;
  readonly effectiveUnitPriceWei: WeiAmount;
  readonly safetyMultiplier: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DetailedGasCostEstimate extends GasCostEstimate {
  readonly rawGasLimit: GasAmount;
  readonly components: readonly GasCostComponent[];
  readonly priceResolution: GasPriceResolution;
  readonly nativeCurrencyUsdPrice?: number;
  readonly withinPolicy: boolean;
  readonly policyViolations: readonly string[];
  readonly estimatedAtMilliseconds: UnixTimestampMilliseconds;
}

interface NormalizedOptions {
  readonly baseTransactionGas: GasAmount;
  readonly atomicExecutorOverheadGas: GasAmount;
  readonly defaultPerLegGas: GasAmount;
  readonly defaultPerCalldataByteGas: GasAmount;
  readonly tokenApprovalGas: GasAmount;
  readonly tokenTransferGas: GasAmount;
  readonly settlementGas: GasAmount;
  readonly gasLimitSafetyMultiplier: number;
  readonly feeSafetyMultiplier: number;
  readonly nativeCurrencyDecimals: number;
  readonly maximumGasPriceAgeMilliseconds: number;
  readonly rejectFutureGasQuotes: boolean;
  readonly rejectExpiredGasQuotes: boolean;
  readonly defaultProviderManagedGasPriceWei?: WeiAmount;
  readonly maximumGasLimit?: GasAmount;
  readonly dexProfiles: ReadonlyMap<string, DexGasProfile>;
  readonly flashLiquidityProfiles: ReadonlyMap<
    FlashLiquidityType,
    FlashLiquidityGasProfile
  >;
}

const DEFAULT_OPTIONS = Object.freeze({
  baseTransactionGas: 21_000n as GasAmount,
  atomicExecutorOverheadGas: 95_000n as GasAmount,
  defaultPerLegGas: 135_000n as GasAmount,
  defaultPerCalldataByteGas: 16n as GasAmount,
  tokenApprovalGas: 50_000n as GasAmount,
  tokenTransferGas: 35_000n as GasAmount,
  settlementGas: 45_000n as GasAmount,
  gasLimitSafetyMultiplier: 1.2,
  feeSafetyMultiplier: 1.15,
  nativeCurrencyDecimals: 18,
  maximumGasPriceAgeMilliseconds: 15_000,
  rejectFutureGasQuotes: true,
  rejectExpiredGasQuotes: true,
});

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function mergeMetadata(
  ...sources: Array<CrossDexArbitrageMetadata | undefined>
): CrossDexArbitrageMetadata | undefined {
  const present = sources.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  if (present.length === 0) {
    return undefined;
  }

  return Object.freeze(Object.assign({}, ...present));
}

function assertNonNegativeBigInt(
  value: bigint,
  field: string,
): void {
  if (typeof value !== "bigint" || value < 0n) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_OPTIONS,
      `${field} must be a non-negative bigint.`,
      { details: value },
    );
  }
}

function assertPositiveMultiplier(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < 1) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_OPTIONS,
      `${field} must be a finite number greater than or equal to 1.`,
      { details: value },
    );
  }
}

function multiplyBigIntByDecimal(
  value: bigint,
  multiplier: number,
): bigint {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_REQUEST,
      "Multiplier must be a finite non-negative number.",
      { details: multiplier },
    );
  }

  const precision = 1_000_000n;
  const scaled = BigInt(
    Math.ceil(multiplier * Number(precision)),
  );

  return (value * scaled + precision - 1n) / precision;
}

function calldataByteLength(data: string): bigint {
  if (
    typeof data !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)
  ) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_ROUTE,
      "Route calldata must be even-length hexadecimal data prefixed with 0x.",
      { details: data },
    );
  }

  return BigInt((data.length - 2) / 2);
}

function nativeUnitDivisor(decimals: number): number {
  return 10 ** decimals;
}

function asGasAmount(value: bigint): GasAmount {
  return value as GasAmount;
}

function asWeiAmount(value: bigint): WeiAmount {
  return value as WeiAmount;
}

function normalizeOptions(
  options: GasCostEstimatorOptions,
): NormalizedOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  assertNonNegativeBigInt(
    merged.baseTransactionGas,
    "baseTransactionGas",
  );
  assertNonNegativeBigInt(
    merged.atomicExecutorOverheadGas,
    "atomicExecutorOverheadGas",
  );
  assertNonNegativeBigInt(
    merged.defaultPerLegGas,
    "defaultPerLegGas",
  );
  assertNonNegativeBigInt(
    merged.defaultPerCalldataByteGas,
    "defaultPerCalldataByteGas",
  );
  assertNonNegativeBigInt(
    merged.tokenApprovalGas,
    "tokenApprovalGas",
  );
  assertNonNegativeBigInt(
    merged.tokenTransferGas,
    "tokenTransferGas",
  );
  assertNonNegativeBigInt(
    merged.settlementGas,
    "settlementGas",
  );

  assertPositiveMultiplier(
    merged.gasLimitSafetyMultiplier,
    "gasLimitSafetyMultiplier",
  );
  assertPositiveMultiplier(
    merged.feeSafetyMultiplier,
    "feeSafetyMultiplier",
  );

  if (
    !Number.isSafeInteger(merged.nativeCurrencyDecimals) ||
    merged.nativeCurrencyDecimals < 0 ||
    merged.nativeCurrencyDecimals > 30
  ) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_OPTIONS,
      "nativeCurrencyDecimals must be a safe integer between 0 and 30.",
      { details: merged.nativeCurrencyDecimals },
    );
  }

  if (
    !Number.isSafeInteger(
      merged.maximumGasPriceAgeMilliseconds,
    ) ||
    merged.maximumGasPriceAgeMilliseconds < 0
  ) {
    throw new GasCostEstimatorError(
      GasCostEstimatorErrorCode.INVALID_OPTIONS,
      "maximumGasPriceAgeMilliseconds must be a non-negative safe integer.",
      {
        details:
          merged.maximumGasPriceAgeMilliseconds,
      },
    );
  }

  if (
    merged.defaultProviderManagedGasPriceWei !== undefined
  ) {
    assertNonNegativeBigInt(
      merged.defaultProviderManagedGasPriceWei,
      "defaultProviderManagedGasPriceWei",
    );
  }

  if (merged.maximumGasLimit !== undefined) {
    assertNonNegativeBigInt(
      merged.maximumGasLimit,
      "maximumGasLimit",
    );
  }

  const dexProfiles = new Map<string, DexGasProfile>();

  for (const profile of merged.dexProfiles ?? []) {
    assertNonNegativeBigInt(
      profile.fixedGas,
      "dexProfile.fixedGas",
    );

    if (profile.perLegGas !== undefined) {
      assertNonNegativeBigInt(
        profile.perLegGas,
        "dexProfile.perLegGas",
      );
    }

    if (profile.perCalldataByteGas !== undefined) {
      assertNonNegativeBigInt(
        profile.perCalldataByteGas,
        "dexProfile.perCalldataByteGas",
      );
    }

    dexProfiles.set(
      String(profile.dexId),
      Object.freeze({
        ...profile,
        metadata: freezeMetadata(profile.metadata),
      }),
    );
  }

  const flashLiquidityProfiles = new Map<
    FlashLiquidityType,
    FlashLiquidityGasProfile
  >();

  for (
    const profile of
    merged.flashLiquidityProfiles ?? []
  ) {
    assertNonNegativeBigInt(
      profile.fixedGas,
      "flashLiquidityProfile.fixedGas",
    );

    if (profile.callbackGas !== undefined) {
      assertNonNegativeBigInt(
        profile.callbackGas,
        "flashLiquidityProfile.callbackGas",
      );
    }

    if (profile.repaymentGas !== undefined) {
      assertNonNegativeBigInt(
        profile.repaymentGas,
        "flashLiquidityProfile.repaymentGas",
      );
    }

    flashLiquidityProfiles.set(
      profile.liquidityType,
      Object.freeze({
        ...profile,
        metadata: freezeMetadata(profile.metadata),
      }),
    );
  }

  return Object.freeze({
    baseTransactionGas: merged.baseTransactionGas,
    atomicExecutorOverheadGas:
      merged.atomicExecutorOverheadGas,
    defaultPerLegGas: merged.defaultPerLegGas,
    defaultPerCalldataByteGas:
      merged.defaultPerCalldataByteGas,
    tokenApprovalGas: merged.tokenApprovalGas,
    tokenTransferGas: merged.tokenTransferGas,
    settlementGas: merged.settlementGas,
    gasLimitSafetyMultiplier:
      merged.gasLimitSafetyMultiplier,
    feeSafetyMultiplier: merged.feeSafetyMultiplier,
    nativeCurrencyDecimals:
      merged.nativeCurrencyDecimals,
    maximumGasPriceAgeMilliseconds:
      merged.maximumGasPriceAgeMilliseconds,
    rejectFutureGasQuotes:
      merged.rejectFutureGasQuotes,
    rejectExpiredGasQuotes:
      merged.rejectExpiredGasQuotes,
    defaultProviderManagedGasPriceWei:
      merged.defaultProviderManagedGasPriceWei,
    maximumGasLimit: merged.maximumGasLimit,
    dexProfiles,
    flashLiquidityProfiles,
  });
}

export class GasCostEstimator {
  private readonly clock: GasCostEstimatorClock;
  private readonly options: NormalizedOptions;

  public constructor(
    clock: GasCostEstimatorClock,
    options: GasCostEstimatorOptions = {},
  ) {
    if (
      clock === null ||
      typeof clock !== "object" ||
      typeof clock.nowMilliseconds !== "function"
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_OPTIONS,
        "A clock dependency is required.",
      );
    }

    this.clock = clock;
    this.options = normalizeOptions(options);
  }

  public estimate(
    request: GasCostEstimationRequest,
  ): DetailedGasCostEstimate {
    const estimatedAtMilliseconds =
      this.clock.nowMilliseconds();

    this.validateRequest(
      request,
      estimatedAtMilliseconds,
    );

    const gasLimitSafetyMultiplier =
      request.gasLimitSafetyMultiplier ??
      request.gasPolicy?.gasLimitSafetyMultiplier ??
      this.options.gasLimitSafetyMultiplier;

    const feeSafetyMultiplier =
      request.feeSafetyMultiplier ??
      request.gasPolicy?.feeSafetyMultiplier ??
      this.options.feeSafetyMultiplier;

    assertPositiveMultiplier(
      gasLimitSafetyMultiplier,
      "gasLimitSafetyMultiplier",
    );
    assertPositiveMultiplier(
      feeSafetyMultiplier,
      "feeSafetyMultiplier",
    );

    const components =
      this.buildComponents(request);
    const rawGasLimit = asGasAmount(
      components.reduce(
        (total, component) =>
          total + component.gas,
        0n,
      ),
    );
    const gasLimit = asGasAmount(
      multiplyBigIntByDecimal(
        rawGasLimit,
        gasLimitSafetyMultiplier,
      ),
    );

    if (
      this.options.maximumGasLimit !== undefined &&
      gasLimit > this.options.maximumGasLimit
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.GAS_LIMIT_EXCEEDED,
        "Estimated gas limit exceeds the configured estimator maximum.",
        {
          chainId: request.route.chainId,
          routeId: String(request.route.id),
          details: {
            gasLimit,
            maximumGasLimit:
              this.options.maximumGasLimit,
          },
        },
      );
    }

    const priceResolution =
      this.resolveGasPrice(
        request.gasPrice,
        feeSafetyMultiplier,
      );

    const estimatedCostWei = asWeiAmount(
      gasLimit *
        priceResolution.effectiveUnitPriceWei,
    );

    const estimatedCostNative =
      Number(estimatedCostWei) /
      nativeUnitDivisor(
        this.options.nativeCurrencyDecimals,
      );

    if (!Number.isFinite(estimatedCostNative)) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.ARITHMETIC_OVERFLOW,
        "Estimated native gas cost cannot be represented as a finite number.",
        {
          chainId: request.route.chainId,
          routeId: String(request.route.id),
          details: estimatedCostWei,
        },
      );
    }

    const estimatedCostUsd =
      request.nativeCurrencyUsdPrice === undefined
        ? undefined
        : estimatedCostNative *
          request.nativeCurrencyUsdPrice;

    const policyViolations =
      this.evaluatePolicy(
        request,
        gasLimit,
        estimatedCostWei,
      );

    const metadata = mergeMetadata(
      request.route.metadata,
      request.gasPrice.metadata,
      request.gasPolicy?.metadata,
      request.metadata,
      Object.freeze({
        componentCount: components.length,
        estimator: "deterministic-route-gas",
      }),
    );

    return Object.freeze({
      chainId: request.route.chainId,
      gasLimit,
      pricing: request.gasPrice,
      estimatedCostWei,
      estimatedCostNative,
      estimatedCostUsd,
      safetyMultiplier:
        gasLimitSafetyMultiplier,
      metadata,
      rawGasLimit,
      components: Object.freeze(components),
      priceResolution,
      nativeCurrencyUsdPrice:
        request.nativeCurrencyUsdPrice,
      withinPolicy:
        policyViolations.length === 0,
      policyViolations:
        Object.freeze(policyViolations),
      estimatedAtMilliseconds,
    });
  }

  public requireWithinPolicy(
    request: GasCostEstimationRequest,
  ): DetailedGasCostEstimate {
    const estimate = this.estimate(request);

    if (!estimate.withinPolicy) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.GAS_COST_EXCEEDED,
        "Estimated gas cost violates the configured gas-management policy.",
        {
          chainId: request.route.chainId,
          routeId: String(request.route.id),
          details: estimate.policyViolations,
        },
      );
    }

    return estimate;
  }

  private buildComponents(
    request: GasCostEstimationRequest,
  ): GasCostComponent[] {
    const components: GasCostComponent[] = [];

    const add = (
      name: string,
      gas: GasAmount,
      source: string,
      metadata?: CrossDexArbitrageMetadata,
    ): void => {
      if (gas === 0n) {
        return;
      }

      components.push(
        Object.freeze({
          name,
          gas,
          source,
          metadata: freezeMetadata(metadata),
        }),
      );
    };

    add(
      "base-transaction",
      this.options.baseTransactionGas,
      "estimator-default",
    );
    add(
      "atomic-executor",
      this.options.atomicExecutorOverheadGas,
      "estimator-default",
    );

    for (const leg of request.route.legs) {
      const profile =
        this.options.dexProfiles.get(
          String(leg.dexId),
        );
      const enabled =
        profile?.enabled !== false;

      const fixedGas =
        profile !== undefined && enabled
          ? profile.fixedGas
          : 0n as GasAmount;
      const perLegGas =
        profile !== undefined && enabled
          ? profile.perLegGas ??
            this.options.defaultPerLegGas
          : this.options.defaultPerLegGas;
      const perByteGas =
        profile !== undefined && enabled
          ? profile.perCalldataByteGas ??
            this.options.defaultPerCalldataByteGas
          : this.options.defaultPerCalldataByteGas;
      const bytes = calldataByteLength(
        String(leg.calldata),
      );
      const calldataGas = asGasAmount(
        bytes * perByteGas,
      );

      add(
        `leg-${leg.legIndex}-dex-fixed`,
        fixedGas,
        `dex:${String(leg.dexId)}`,
        profile?.metadata,
      );
      add(
        `leg-${leg.legIndex}-execution`,
        perLegGas,
        `dex:${String(leg.dexId)}`,
        profile?.metadata,
      );
      add(
        `leg-${leg.legIndex}-calldata`,
        calldataGas,
        `dex:${String(leg.dexId)}`,
        Object.freeze({
          calldataBytes: bytes.toString(),
        }),
      );
    }

    if (request.flashLiquidityQuote !== undefined) {
      const liquidityType =
        request.flashLiquidityQuote.provider
          .liquidityType;
      const profile =
        this.options.flashLiquidityProfiles.get(
          liquidityType,
        );

      if (profile !== undefined) {
        add(
          "flash-liquidity-fixed",
          profile.fixedGas,
          `flash:${liquidityType}`,
          profile.metadata,
        );
        add(
          "flash-liquidity-callback",
          profile.callbackGas ?? 0n as GasAmount,
          `flash:${liquidityType}`,
          profile.metadata,
        );
        add(
          "flash-liquidity-repayment",
          profile.repaymentGas ?? 0n as GasAmount,
          `flash:${liquidityType}`,
          profile.metadata,
        );
      }
    }

    const approvals =
      request.approvalTransactionCount ?? 0;
    const transfers =
      request.tokenTransferCount ?? 0;

    if (approvals > 0) {
      add(
        "token-approvals",
        asGasAmount(
          BigInt(approvals) *
            this.options.tokenApprovalGas,
        ),
        "request-count",
        Object.freeze({
          count: approvals,
        }),
      );
    }

    if (transfers > 0) {
      add(
        "token-transfers",
        asGasAmount(
          BigInt(transfers) *
            this.options.tokenTransferGas,
        ),
        "request-count",
        Object.freeze({
          count: transfers,
        }),
      );
    }

    if (request.includeSettlementOverhead) {
      add(
        "settlement",
        this.options.settlementGas,
        "estimator-default",
      );
    }

    if (
      request.additionalGas !== undefined &&
      request.additionalGas > 0n
    ) {
      add(
        "additional-gas",
        request.additionalGas,
        "request",
      );
    }

    return components;
  }

  private resolveGasPrice(
    quote: GasPriceQuote,
    safetyMultiplier: number,
  ): GasPriceResolution {
    let quotedUnitPriceWei: WeiAmount;

    switch (quote.mode) {
      case GasPricingMode.LEGACY: {
        if (
          quote.gasPriceWei === undefined ||
          quote.gasPriceWei <= 0n
        ) {
          throw new GasCostEstimatorError(
            GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
            "LEGACY gas pricing requires a positive gasPriceWei.",
            {
              chainId: quote.chainId,
              details: quote,
            },
          );
        }

        quotedUnitPriceWei =
          quote.gasPriceWei;
        break;
      }

      case GasPricingMode.EIP_1559: {
        if (
          quote.maxFeePerGasWei === undefined ||
          quote.maxFeePerGasWei <= 0n
        ) {
          throw new GasCostEstimatorError(
            GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
            "EIP_1559 pricing requires a positive maxFeePerGasWei.",
            {
              chainId: quote.chainId,
              details: quote,
            },
          );
        }

        if (
          quote.maxPriorityFeePerGasWei !==
            undefined &&
          quote.maxPriorityFeePerGasWei < 0n
        ) {
          throw new GasCostEstimatorError(
            GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
            "maxPriorityFeePerGasWei cannot be negative.",
            {
              chainId: quote.chainId,
              details: quote,
            },
          );
        }

        if (
          quote.baseFeePerGasWei !== undefined &&
          quote.baseFeePerGasWei < 0n
        ) {
          throw new GasCostEstimatorError(
            GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
            "baseFeePerGasWei cannot be negative.",
            {
              chainId: quote.chainId,
              details: quote,
            },
          );
        }

        const computed =
          quote.baseFeePerGasWei !== undefined
            ? quote.baseFeePerGasWei +
              (quote.maxPriorityFeePerGasWei ??
                0n as WeiAmount)
            : quote.maxFeePerGasWei;

        quotedUnitPriceWei =
          computed < quote.maxFeePerGasWei
            ? computed as WeiAmount
            : quote.maxFeePerGasWei;
        break;
      }

      case GasPricingMode.PROVIDER_MANAGED: {
        const providerPrice =
          quote.gasPriceWei ??
          quote.maxFeePerGasWei ??
          this.options
            .defaultProviderManagedGasPriceWei;

        if (
          providerPrice === undefined ||
          providerPrice <= 0n
        ) {
          throw new GasCostEstimatorError(
            GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
            "PROVIDER_MANAGED pricing requires a provider price or configured default.",
            {
              chainId: quote.chainId,
              details: quote,
            },
          );
        }

        quotedUnitPriceWei = providerPrice;
        break;
      }

      default:
        throw new GasCostEstimatorError(
          GasCostEstimatorErrorCode.UNSUPPORTED_PRICING_MODE,
          "Unsupported gas-pricing mode.",
          {
            chainId: quote.chainId,
            details: quote.mode,
          },
        );
    }

    const effectiveUnitPriceWei = asWeiAmount(
      multiplyBigIntByDecimal(
        quotedUnitPriceWei,
        safetyMultiplier,
      ),
    );

    return Object.freeze({
      mode: quote.mode,
      quotedUnitPriceWei,
      effectiveUnitPriceWei,
      safetyMultiplier,
      metadata: freezeMetadata(quote.metadata),
    });
  }

  private evaluatePolicy(
    request: GasCostEstimationRequest,
    gasLimit: GasAmount,
    estimatedCostWei: WeiAmount,
  ): string[] {
    const policy = request.gasPolicy;
    const violations: string[] = [];

    if (policy === undefined) {
      return violations;
    }

    if (!policy.enabled) {
      violations.push(
        "Gas-management policy is disabled.",
      );
    }

    if (policy.chainId !== request.route.chainId) {
      violations.push(
        "Gas-management policy chain does not match the route chain.",
      );
    }

    if (policy.pricingMode !== request.gasPrice.mode) {
      violations.push(
        "Gas-management policy pricing mode does not match the gas quote.",
      );
    }

    if (
      policy.maximumGasCostWei !== undefined &&
      estimatedCostWei >
        policy.maximumGasCostWei
    ) {
      violations.push(
        "Estimated gas cost exceeds maximumGasCostWei.",
      );
    }

    if (
      policy.maximumFeePerGasWei !== undefined
    ) {
      const resolved = this.resolveGasPrice(
        request.gasPrice,
        request.feeSafetyMultiplier ??
          policy.feeSafetyMultiplier,
      );

      if (
        resolved.effectiveUnitPriceWei >
        policy.maximumFeePerGasWei
      ) {
        violations.push(
          "Effective unit gas price exceeds maximumFeePerGasWei.",
        );
      }
    }

    if (
      this.options.maximumGasLimit !== undefined &&
      gasLimit > this.options.maximumGasLimit
    ) {
      violations.push(
        "Estimated gas limit exceeds estimator maximumGasLimit.",
      );
    }

    return violations;
  }

  private validateRequest(
    request: GasCostEstimationRequest,
    nowMilliseconds:
      UnixTimestampMilliseconds,
  ): void {
    if (
      request === null ||
      typeof request !== "object" ||
      request.route === undefined ||
      request.gasPrice === undefined
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_REQUEST,
        "route and gasPrice are required.",
        { details: request },
      );
    }

    const route = request.route;

    if (
      !Number.isSafeInteger(route.chainId) ||
      Number(route.chainId) <= 0
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_ROUTE,
        "Route chainId must be a positive safe integer.",
        {
          routeId: String(route.id),
          details: route.chainId,
        },
      );
    }


    if (
      route.legs.length === 0 ||
      route.inputAmount <= 0n ||
      route.expectedFinalAmount <= 0n ||
      route.minimumFinalAmount <= 0n
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_ROUTE,
        "Route must contain legs and positive amounts.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }

    if (
      request.gasPrice.chainId !== route.chainId
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.CHAIN_MISMATCH,
        "Gas-price quote chain does not match the route chain.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }

    if (
      request.flashLiquidityQuote !== undefined &&
      request.flashLiquidityQuote.provider.chainId !==
        route.chainId
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.CHAIN_MISMATCH,
        "Flash-liquidity quote chain does not match the route chain.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }

    if (
      request.nativeCurrencyUsdPrice !== undefined &&
      (!Number.isFinite(
        request.nativeCurrencyUsdPrice,
      ) ||
        request.nativeCurrencyUsdPrice <= 0)
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_NATIVE_PRICE,
        "nativeCurrencyUsdPrice must be a positive finite number.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
          details:
            request.nativeCurrencyUsdPrice,
        },
      );
    }

    for (const [field, value] of [
      [
        "approvalTransactionCount",
        request.approvalTransactionCount,
      ],
      [
        "tokenTransferCount",
        request.tokenTransferCount,
      ],
    ] as const) {
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value < 0)
      ) {
        throw new GasCostEstimatorError(
          GasCostEstimatorErrorCode.INVALID_REQUEST,
          `${field} must be a non-negative safe integer.`,
          {
            chainId: route.chainId,
            routeId: String(route.id),
            details: value,
          },
        );
      }
    }

    if (request.additionalGas !== undefined) {
      assertNonNegativeBigInt(
        request.additionalGas,
        "additionalGas",
      );
    }

    if (
      this.options.rejectFutureGasQuotes &&
      request.gasPrice.quotedAtMilliseconds >
        nowMilliseconds
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.INVALID_GAS_PRICE,
        "Gas-price quote timestamp is in the future.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }

    if (
      nowMilliseconds -
        request.gasPrice.quotedAtMilliseconds >
      this.options.maximumGasPriceAgeMilliseconds
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.GAS_PRICE_EXPIRED,
        "Gas-price quote exceeds the maximum permitted age.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }

    if (
      this.options.rejectExpiredGasQuotes &&
      request.gasPrice.validUntilMilliseconds !==
        undefined &&
      request.gasPrice.validUntilMilliseconds <=
        nowMilliseconds
    ) {
      throw new GasCostEstimatorError(
        GasCostEstimatorErrorCode.GAS_PRICE_EXPIRED,
        "Gas-price quote has expired.",
        {
          chainId: route.chainId,
          routeId: String(route.id),
        },
      );
    }
  }
}

export function createGasCostEstimator(
  clock: GasCostEstimatorClock,
  options: GasCostEstimatorOptions = {},
): GasCostEstimator {
  return new GasCostEstimator(clock, options);
}