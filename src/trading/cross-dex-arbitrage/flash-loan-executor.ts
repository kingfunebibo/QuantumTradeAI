/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic flash-loan execution preparation engine.
 *
 * Responsibilities:
 * - Validate flash-funded arbitrage execution requests.
 * - Resolve and verify the selected flash-liquidity provider.
 * - Encode the provider funding call.
 * - Encode the atomic arbitrage executor payload.
 * - Build simulation requests and unsigned EVM transactions.
 * - Preserve immutable, auditable preparation results.
 *
 * This module does not sign or submit transactions. Signing, simulation,
 * submission, tracking, and replacement remain explicit downstream stages.
 */

import {
  ArbitrageFundingMode,
  type ArbitrageExecutionRequest,
  type ArbitrageLeg,
  type AtomicArbitrageExecutionPayload,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type EvmAddress,
  ExecutionMode,
  type FlashLiquidityProvider,
  type FlashLiquidityQuote,
  type FlashLiquidityRequest,
  FlashLiquidityType,
  type FlashLoanProviderDescriptor,
  type FlashLoanProviderId,
  type GasAmount,
  type HexData,
  type Nonce,
  type SimulationId,
  type TokenAmount,
  type TransactionSimulationRequest,
  TransactionSubmissionMode,
  type UnixTimestampMilliseconds,
  type UnsignedEvmTransaction,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";
import {
  FlashLoanProviderRegistry,
} from "./flash-loan-provider-registry";

export enum FlashLoanExecutorErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_FUNDING_MODE = "INVALID_FUNDING_MODE",
  INVALID_EXECUTION_MODE = "INVALID_EXECUTION_MODE",
  INVALID_ROUTE = "INVALID_ROUTE",
  ROUTE_EXPIRED = "ROUTE_EXPIRED",
  EXECUTION_DEADLINE_EXPIRED = "EXECUTION_DEADLINE_EXPIRED",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  TOKEN_MISMATCH = "TOKEN_MISMATCH",
  AMOUNT_MISMATCH = "AMOUNT_MISMATCH",
  PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND",
  PROVIDER_DISABLED = "PROVIDER_DISABLED",
  PROVIDER_MISMATCH = "PROVIDER_MISMATCH",
  QUOTE_INVALID = "QUOTE_INVALID",
  QUOTE_EXPIRED = "QUOTE_EXPIRED",
  FUNDING_UNAVAILABLE = "FUNDING_UNAVAILABLE",
  FUNDING_ENCODING_FAILED = "FUNDING_ENCODING_FAILED",
  PAYLOAD_ENCODING_FAILED = "PAYLOAD_ENCODING_FAILED",
  NONCE_REQUIRED = "NONCE_REQUIRED",
  GAS_LIMIT_REQUIRED = "GAS_LIMIT_REQUIRED",
  SIMULATION_ID_INVALID = "SIMULATION_ID_INVALID",
}

export class FlashLoanExecutorError extends Error {
  public readonly code: FlashLoanExecutorErrorCode;
  public readonly executionId?: string;
  public readonly providerId?: FlashLoanProviderId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: FlashLoanExecutorErrorCode,
    message: string,
    options: Readonly<{
      executionId?: string;
      providerId?: FlashLoanProviderId;
      chainId?: ChainId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "FlashLoanExecutorError";
    this.code = code;
    this.executionId = options.executionId;
    this.providerId = options.providerId;
    this.chainId = options.chainId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface FlashLoanExecutorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface AtomicArbitragePayloadEncoder {
  encode(
    payload: Readonly<{
      executionRequest: ArbitrageExecutionRequest;
      fundingRequest: FlashLiquidityRequest;
      fundingCallData: HexData;
      flashLiquidityQuote: FlashLiquidityQuote;
      minimumProfitAmount: TokenAmount;
      deadlineSeconds: bigint;
      legs: readonly ArbitrageLeg[];
    }>,
  ): Promise<HexData> | HexData;
}

export interface FlashLoanExecutorDependencies {
  readonly providerRegistry: FlashLoanProviderRegistry;
  readonly payloadEncoder: AtomicArbitragePayloadEncoder;
  readonly clock: FlashLoanExecutorClock;
}

export interface FlashLoanExecutorOptions {
  readonly requireAtomicRoute?: boolean;
  readonly requireSimulationForLiveExecution?: boolean;
  readonly requirePrivateSubmissionForLiveExecution?: boolean;
  readonly rejectExpiredQuotes?: boolean;
  readonly rejectFutureQuotes?: boolean;
  readonly maximumQuoteAgeMilliseconds?: number;
  readonly maximumRouteAgeMilliseconds?: number;
  readonly defaultGasLimit?: GasAmount;
  readonly transactionValue?: WeiAmount;
}

export interface FlashLoanExecutionPreparationRequest {
  readonly executionRequest: ArbitrageExecutionRequest;
  readonly flashLiquidityQuote?: FlashLiquidityQuote;
  readonly simulationId?: SimulationId;
  readonly nonce?: Nonce;
  readonly gasLimit?: GasAmount;
  readonly minimumProfitAmount?: TokenAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLoanExecutionPreparationResult {
  readonly executionRequest: ArbitrageExecutionRequest;
  readonly provider: FlashLoanProviderDescriptor;
  readonly fundingRequest: FlashLiquidityRequest;
  readonly fundingCallData: HexData;
  readonly payload: AtomicArbitrageExecutionPayload;
  readonly simulationRequest?: TransactionSimulationRequest;
  readonly unsignedTransaction?: UnsignedEvmTransaction;
  readonly preparedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

interface NormalizedFlashLoanExecutorOptions {
  readonly requireAtomicRoute: boolean;
  readonly requireSimulationForLiveExecution: boolean;
  readonly requirePrivateSubmissionForLiveExecution: boolean;
  readonly rejectExpiredQuotes: boolean;
  readonly rejectFutureQuotes: boolean;
  readonly maximumQuoteAgeMilliseconds: number;
  readonly maximumRouteAgeMilliseconds: number;
  readonly defaultGasLimit?: GasAmount;
  readonly transactionValue: WeiAmount;
}

const ZERO_WEI = 0n as WeiAmount;
const EMPTY_HEX = "0x" as HexData;

const DEFAULT_OPTIONS: NormalizedFlashLoanExecutorOptions =
  Object.freeze({
    requireAtomicRoute: true,
    requireSimulationForLiveExecution: true,
    requirePrivateSubmissionForLiveExecution: false,
    rejectExpiredQuotes: true,
    rejectFutureQuotes: true,
    maximumQuoteAgeMilliseconds: 5_000,
    maximumRouteAgeMilliseconds: 15_000,
    transactionValue: ZERO_WEI,
  });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function normalizeOptions(
  options: FlashLoanExecutorOptions,
): NormalizedFlashLoanExecutorOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(
      merged.maximumQuoteAgeMilliseconds,
    ) ||
    merged.maximumQuoteAgeMilliseconds < 0
  ) {
    throw new FlashLoanExecutorError(
      FlashLoanExecutorErrorCode.INVALID_OPTIONS,
      "maximumQuoteAgeMilliseconds must be a non-negative safe integer.",
      { details: merged.maximumQuoteAgeMilliseconds },
    );
  }

  if (
    !Number.isSafeInteger(
      merged.maximumRouteAgeMilliseconds,
    ) ||
    merged.maximumRouteAgeMilliseconds < 0
  ) {
    throw new FlashLoanExecutorError(
      FlashLoanExecutorErrorCode.INVALID_OPTIONS,
      "maximumRouteAgeMilliseconds must be a non-negative safe integer.",
      { details: merged.maximumRouteAgeMilliseconds },
    );
  }

  if (
    merged.defaultGasLimit !== undefined &&
    (typeof merged.defaultGasLimit !== "bigint" ||
      merged.defaultGasLimit <= 0n)
  ) {
    throw new FlashLoanExecutorError(
      FlashLoanExecutorErrorCode.INVALID_OPTIONS,
      "defaultGasLimit must be a positive bigint.",
      { details: merged.defaultGasLimit },
    );
  }

  if (
    typeof merged.transactionValue !== "bigint" ||
    merged.transactionValue < 0n
  ) {
    throw new FlashLoanExecutorError(
      FlashLoanExecutorErrorCode.INVALID_OPTIONS,
      "transactionValue must be a non-negative bigint.",
      { details: merged.transactionValue },
    );
  }

  return Object.freeze(merged);
}

function normalizeAddress(
  address: EvmAddress,
): string {
  return String(address).trim().toLowerCase();
}

function sameAddress(
  left: EvmAddress,
  right: EvmAddress,
): boolean {
  return normalizeAddress(left) === normalizeAddress(right);
}

function ensureHex(
  value: HexData,
  field: string,
): HexData {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)
  ) {
    throw new FlashLoanExecutorError(
      FlashLoanExecutorErrorCode.PAYLOAD_ENCODING_FAILED,
      `${field} must be even-length hexadecimal data prefixed with 0x.`,
      { details: value },
    );
  }

  return value.toLowerCase() as HexData;
}

function toDeadlineSeconds(
  deadlineMilliseconds: UnixTimestampMilliseconds,
): bigint {
  return BigInt(
    Math.floor(deadlineMilliseconds / 1_000),
  );
}

function mergeMetadata(
  ...sources: Array<
    CrossDexArbitrageMetadata | undefined
  >
): CrossDexArbitrageMetadata | undefined {
  const defined = sources.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  if (defined.length === 0) {
    return undefined;
  }

  return Object.freeze(
    Object.assign({}, ...defined),
  );
}

export class FlashLoanExecutor {
  private readonly dependencies:
    FlashLoanExecutorDependencies;
  private readonly options:
    NormalizedFlashLoanExecutorOptions;

  public constructor(
    dependencies: FlashLoanExecutorDependencies,
    options: FlashLoanExecutorOptions = {},
  ) {
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      dependencies.providerRegistry === undefined ||
      dependencies.payloadEncoder === undefined ||
      typeof dependencies.payloadEncoder.encode !==
        "function" ||
      dependencies.clock === undefined ||
      typeof dependencies.clock.nowMilliseconds !==
        "function"
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_DEPENDENCIES,
        "providerRegistry, payloadEncoder, and clock dependencies are required.",
      );
    }

    this.dependencies = dependencies;
    this.options = normalizeOptions(options);
  }

  public async prepare(
    request: FlashLoanExecutionPreparationRequest,
  ): Promise<FlashLoanExecutionPreparationResult> {
    const preparedAtMilliseconds =
      this.dependencies.clock.nowMilliseconds();

    this.validatePreparationRequest(
      request,
      preparedAtMilliseconds,
    );

    const executionRequest =
      request.executionRequest;
    const opportunity =
      executionRequest.opportunity;
    const route = opportunity.route;
    const quote =
      request.flashLiquidityQuote ??
      opportunity.flashLiquidityQuote;

    if (quote === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_INVALID,
        "A flash-liquidity quote is required for flash-funded execution.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    this.validateQuote(
      quote,
      executionRequest,
      preparedAtMilliseconds,
    );

    const provider =
      this.resolveProvider(
        quote.provider.id,
        executionRequest,
      );

    const deadlineSeconds =
      toDeadlineSeconds(
        executionRequest.deadlineMilliseconds,
      );

    const minimumProfitAmount =
      request.minimumProfitAmount ??
      opportunity.profitability.netProfitAmount;

    if (
      typeof minimumProfitAmount !== "bigint" ||
      minimumProfitAmount < 0n
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_REQUEST,
        "minimumProfitAmount must be a non-negative bigint.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
          details: minimumProfitAmount,
        },
      );
    }

    const fundingRequest:
      FlashLiquidityRequest = Object.freeze({
        providerId: provider.descriptor.id,
        chainId: opportunity.chainId,
        liquidityType:
          executionRequest.fundingMode ===
          ArbitrageFundingMode.FLASH_SWAP
            ? FlashLiquidityType.FLASH_SWAP
            : FlashLiquidityType.FLASH_LOAN,
        borrowerAddress:
          executionRequest.executorContractAddress,
        asset: route.startToken,
        amount: route.inputAmount,
        callbackData: EMPTY_HEX,
        metadata: mergeMetadata(
          executionRequest.metadata,
          request.metadata,
          Object.freeze({
            executionId:
              String(executionRequest.executionId),
            routeId: String(route.id),
          }),
        ),
      });

    const availability =
      await provider.validateAvailability(
        fundingRequest,
      );

    if (!availability.valid) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.FUNDING_UNAVAILABLE,
        "Selected flash-liquidity provider reported unavailable funding.",
        {
          executionId: executionRequest.executionId,
          providerId: provider.descriptor.id,
          chainId: opportunity.chainId,
          details: availability.issues,
        },
      );
    }

    let fundingCallData: HexData;

    try {
      fundingCallData = ensureHex(
        await provider.encodeFundingCall(
          fundingRequest,
        ),
        "fundingCallData",
      );
    } catch (error) {
      if (error instanceof FlashLoanExecutorError) {
        throw error;
      }

      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.FUNDING_ENCODING_FAILED,
        "Flash-liquidity provider failed to encode the funding call.",
        {
          executionId: executionRequest.executionId,
          providerId: provider.descriptor.id,
          chainId: opportunity.chainId,
          cause: error,
        },
      );
    }

    let encodedCalldata: HexData;

    try {
      encodedCalldata = ensureHex(
        await this.dependencies.payloadEncoder.encode({
          executionRequest,
          fundingRequest,
          fundingCallData,
          flashLiquidityQuote: quote,
          minimumProfitAmount,
          deadlineSeconds,
          legs: route.legs,
        }),
        "encodedCalldata",
      );
    } catch (error) {
      if (error instanceof FlashLoanExecutorError) {
        throw error;
      }

      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.PAYLOAD_ENCODING_FAILED,
        "Atomic arbitrage executor payload encoding failed.",
        {
          executionId: executionRequest.executionId,
          providerId: provider.descriptor.id,
          chainId: opportunity.chainId,
          cause: error,
        },
      );
    }

    const metadata = mergeMetadata(
      executionRequest.metadata,
      request.metadata,
      Object.freeze({
        flashLoanExecutor:
          "prepared",
        providerId:
          String(provider.descriptor.id),
        fundingMode:
          executionRequest.fundingMode,
      }),
    );

    const payload:
      AtomicArbitrageExecutionPayload =
      Object.freeze({
        executionId:
          executionRequest.executionId,
        chainId: opportunity.chainId,
        executorContractAddress:
          executionRequest.executorContractAddress,
        senderAddress:
          executionRequest.senderAddress,
        beneficiaryAddress:
          executionRequest.beneficiaryAddress,
        fundingMode:
          executionRequest.fundingMode,
        fundingAsset: route.startToken,
        fundingAmount: route.inputAmount,
        flashLoanProvider:
          provider.descriptor,
        expectedFinalAmount:
          route.expectedFinalAmount,
        minimumFinalAmount:
          route.minimumFinalAmount,
        minimumProfitAmount,
        deadlineSeconds,
        legs: Object.freeze([
          ...route.legs,
        ]),
        encodedCalldata,
        value:
          this.options.transactionValue,
        metadata,
      });

    const simulationRequest =
      this.buildSimulationRequest(
        request,
        payload,
      );

    const unsignedTransaction =
      this.buildUnsignedTransaction(
        request,
        payload,
      );

    return Object.freeze({
      executionRequest,
      provider: provider.descriptor,
      fundingRequest,
      fundingCallData,
      payload,
      simulationRequest,
      unsignedTransaction,
      preparedAtMilliseconds,
      metadata,
    });
  }

  private resolveProvider(
    providerId: FlashLoanProviderId,
    executionRequest: ArbitrageExecutionRequest,
  ): FlashLiquidityProvider {
    const entry =
      this.dependencies.providerRegistry.getEntry(
        providerId,
      );

    if (entry === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.PROVIDER_NOT_FOUND,
        `Flash-liquidity provider "${providerId}" is not registered.`,
        {
          executionId: executionRequest.executionId,
          providerId,
          chainId:
            executionRequest.opportunity.chainId,
        },
      );
    }

    if (!entry.descriptor.enabled) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.PROVIDER_DISABLED,
        `Flash-liquidity provider "${providerId}" is disabled.`,
        {
          executionId: executionRequest.executionId,
          providerId,
          chainId:
            executionRequest.opportunity.chainId,
        },
      );
    }

    if (entry.provider === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.PROVIDER_NOT_FOUND,
        `Flash-liquidity provider adapter "${providerId}" is unavailable.`,
        {
          executionId: executionRequest.executionId,
          providerId,
          chainId:
            executionRequest.opportunity.chainId,
        },
      );
    }

    return entry.provider;
  }

  private buildSimulationRequest(
    request: FlashLoanExecutionPreparationRequest,
    payload: AtomicArbitrageExecutionPayload,
  ): TransactionSimulationRequest | undefined {
    const executionRequest =
      request.executionRequest;

    if (!executionRequest.simulateBeforeSubmission) {
      return undefined;
    }

    if (request.simulationId === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.SIMULATION_ID_INVALID,
        "simulationId is required when simulateBeforeSubmission is enabled.",
        {
          executionId: executionRequest.executionId,
          chainId: payload.chainId,
        },
      );
    }

    if (
      typeof request.simulationId !== "string" ||
      request.simulationId.trim().length === 0
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.SIMULATION_ID_INVALID,
        "simulationId must be a non-empty string.",
        {
          executionId: executionRequest.executionId,
          chainId: payload.chainId,
          details: request.simulationId,
        },
      );
    }

    return Object.freeze({
      simulationId: request.simulationId,
      chainId: payload.chainId,
      from: payload.senderAddress,
      to: payload.executorContractAddress,
      data: payload.encodedCalldata,
      value: payload.value,
      gasLimit:
        request.gasLimit ??
        executionRequest.gasLimit ??
        this.options.defaultGasLimit,
      gasPricing:
        executionRequest.gasPricing,
      nonce:
        request.nonce ??
        executionRequest.nonce,
      blockNumber:
        executionRequest.opportunity.route
          .blockReference.blockNumber,
      metadata: payload.metadata,
    });
  }

  private buildUnsignedTransaction(
    request: FlashLoanExecutionPreparationRequest,
    payload: AtomicArbitrageExecutionPayload,
  ): UnsignedEvmTransaction | undefined {
    const executionRequest =
      request.executionRequest;

    if (
      executionRequest.executionMode ===
        ExecutionMode.PAPER ||
      executionRequest.submissionMode ===
        TransactionSubmissionMode.PAPER
    ) {
      return undefined;
    }

    const nonce =
      request.nonce ??
      executionRequest.nonce;

    if (nonce === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.NONCE_REQUIRED,
        "A nonce is required to construct a live unsigned transaction.",
        {
          executionId: executionRequest.executionId,
          chainId: payload.chainId,
        },
      );
    }

    const gasLimit =
      request.gasLimit ??
      executionRequest.gasLimit ??
      this.options.defaultGasLimit;

    if (gasLimit === undefined) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.GAS_LIMIT_REQUIRED,
        "A gas limit is required to construct a live unsigned transaction.",
        {
          executionId: executionRequest.executionId,
          chainId: payload.chainId,
        },
      );
    }

    return Object.freeze({
      chainId: payload.chainId,
      from: payload.senderAddress,
      to: payload.executorContractAddress,
      nonce,
      value: payload.value,
      data: payload.encodedCalldata,
      gasLimit,
      gasPricing:
        executionRequest.gasPricing,
      metadata: payload.metadata,
    });
  }

  private validatePreparationRequest(
    request: FlashLoanExecutionPreparationRequest,
    nowMilliseconds:
      UnixTimestampMilliseconds,
  ): void {
    if (
      request === null ||
      typeof request !== "object" ||
      request.executionRequest === undefined
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_REQUEST,
        "executionRequest is required.",
        { details: request },
      );
    }

    const executionRequest =
      request.executionRequest;
    const opportunity =
      executionRequest.opportunity;
    const route = opportunity.route;

    if (
      executionRequest.fundingMode !==
        ArbitrageFundingMode.FLASH_LOAN &&
      executionRequest.fundingMode !==
        ArbitrageFundingMode.FLASH_SWAP
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_FUNDING_MODE,
        "FlashLoanExecutor only supports FLASH_LOAN and FLASH_SWAP funding modes.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
          details:
            executionRequest.fundingMode,
        },
      );
    }

    if (
      this.options.requireAtomicRoute &&
      !route.isAtomic
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_ROUTE,
        "Flash-funded execution requires an atomic route.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
          details: route.id,
        },
      );
    }

    if (
      route.chainId !== opportunity.chainId ||
      route.chainId !==
        executionRequest.gasPricing.chainId
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.CHAIN_MISMATCH,
        "Route, opportunity, and gas pricing must use the same chain.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      route.legs.length === 0 ||
      route.inputAmount <= 0n ||
      route.minimumFinalAmount <= 0n
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_ROUTE,
        "Route must contain legs and positive execution amounts.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      !sameAddress(
        route.startToken.address,
        route.endToken.address,
      )
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.TOKEN_MISMATCH,
        "Flash-funded arbitrage route must return to its funding token.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      route.expiresAtMilliseconds <=
        nowMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.ROUTE_EXPIRED,
        "Arbitrage route has expired.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      nowMilliseconds -
        route.createdAtMilliseconds >
      this.options.maximumRouteAgeMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.ROUTE_EXPIRED,
        "Arbitrage route exceeds the maximum permitted age.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      executionRequest.deadlineMilliseconds <=
        nowMilliseconds ||
      executionRequest.deadlineMilliseconds >
        route.expiresAtMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.EXECUTION_DEADLINE_EXPIRED,
        "Execution deadline must be in the future and cannot exceed route expiry.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      executionRequest.executionMode ===
        ExecutionMode.LIVE &&
      this.options
        .requireSimulationForLiveExecution &&
      !executionRequest.simulateBeforeSubmission
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_EXECUTION_MODE,
        "Live flash-funded execution requires simulation.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      executionRequest.executionMode ===
        ExecutionMode.LIVE &&
      this.options
        .requirePrivateSubmissionForLiveExecution &&
      executionRequest.submissionMode ===
        TransactionSubmissionMode.PUBLIC_MEMPOOL
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.INVALID_EXECUTION_MODE,
        "Live flash-funded execution requires a private submission mode.",
        {
          executionId: executionRequest.executionId,
          chainId: opportunity.chainId,
        },
      );
    }
  }

  private validateQuote(
    quote: FlashLiquidityQuote,
    executionRequest: ArbitrageExecutionRequest,
    nowMilliseconds:
      UnixTimestampMilliseconds,
  ): void {
    const opportunity =
      executionRequest.opportunity;
    const route = opportunity.route;

    if (
      quote.provider.chainId !==
        opportunity.chainId ||
      quote.asset.chainId !==
        opportunity.chainId ||
      quote.blockReference.chainId !==
        opportunity.chainId
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.CHAIN_MISMATCH,
        "Flash-liquidity quote chain does not match the execution chain.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    const expectedLiquidityType =
      executionRequest.fundingMode ===
      ArbitrageFundingMode.FLASH_SWAP
        ? FlashLiquidityType.FLASH_SWAP
        : FlashLiquidityType.FLASH_LOAN;

    if (
      quote.provider.liquidityType !==
      expectedLiquidityType
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.PROVIDER_MISMATCH,
        "Provider liquidity type does not match execution funding mode.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      !sameAddress(
        quote.asset.address,
        route.startToken.address,
      )
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.TOKEN_MISMATCH,
        "Flash-liquidity quote asset does not match the route funding token.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      quote.requestedAmount !==
        route.inputAmount ||
      quote.availableAmount <
        route.inputAmount
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.AMOUNT_MISMATCH,
        "Flash-liquidity quote amount does not satisfy the route input amount.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      quote.totalRepaymentAmount !==
      quote.requestedAmount +
        quote.premiumAmount
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_INVALID,
        "Flash-liquidity quote repayment amount must equal principal plus premium.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      this.options.rejectFutureQuotes &&
      quote.quotedAtMilliseconds >
        nowMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_INVALID,
        "Flash-liquidity quote timestamp is in the future.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      nowMilliseconds -
        quote.quotedAtMilliseconds >
      this.options.maximumQuoteAgeMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_EXPIRED,
        "Flash-liquidity quote exceeds the maximum permitted age.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      this.options.rejectExpiredQuotes &&
      quote.expiresAtMilliseconds <=
        nowMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_EXPIRED,
        "Flash-liquidity quote has expired.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }

    if (
      executionRequest.deadlineMilliseconds >
        quote.expiresAtMilliseconds
    ) {
      throw new FlashLoanExecutorError(
        FlashLoanExecutorErrorCode.QUOTE_EXPIRED,
        "Execution deadline exceeds the flash-liquidity quote expiry.",
        {
          executionId: executionRequest.executionId,
          providerId: quote.provider.id,
          chainId: opportunity.chainId,
        },
      );
    }
  }
}

export function createFlashLoanExecutor(
  dependencies: FlashLoanExecutorDependencies,
  options: FlashLoanExecutorOptions = {},
): FlashLoanExecutor {
  return new FlashLoanExecutor(
    dependencies,
    options,
  );
}