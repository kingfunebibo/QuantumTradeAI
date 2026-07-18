/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Production-grade transaction simulation orchestration.
 *
 * This module is deterministic with respect to its injected dependencies. It
 * performs no direct RPC, wallet, filesystem, or system-clock access.
 */

import {
  RevertClassification,
  SimulationStatus,
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type EvmAddress,
  type EvmBlockReference,
  type GasAmount,
  type HexData,
  type SimulationId,
  type SimulationLog,
  type TokenAmount,
  type TokenBalanceChange,
  type TransactionSimulationRequest,
  type TransactionSimulationResult,
  type UnixTimestampMilliseconds,
} from "./cross-dex-arbitrage-contracts";

export enum TransactionSimulatorErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  INVALID_ADDRESS = "INVALID_ADDRESS",
  INVALID_CALLDATA = "INVALID_CALLDATA",
  INVALID_GAS_LIMIT = "INVALID_GAS_LIMIT",
  INVALID_TIMEOUT = "INVALID_TIMEOUT",
  BACKEND_FAILURE = "BACKEND_FAILURE",
  MALFORMED_BACKEND_RESULT = "MALFORMED_BACKEND_RESULT",
}

export class TransactionSimulatorError extends Error {
  public readonly code: TransactionSimulatorErrorCode;
  public readonly simulationId?: SimulationId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: TransactionSimulatorErrorCode,
    message: string,
    options: Readonly<{
      simulationId?: SimulationId;
      chainId?: ChainId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "TransactionSimulatorError";
    this.code = code;
    this.simulationId = options.simulationId;
    this.chainId = options.chainId;
    this.details = options.details;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface TransactionSimulationClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface TransactionSimulationBackendRequest {
  readonly request: TransactionSimulationRequest;
  readonly timeoutMilliseconds: number;
  readonly collectLogs: boolean;
  readonly collectBalanceChanges: boolean;
  readonly traceEnabled: boolean;
}

export interface TransactionSimulationBackendResult {
  readonly status: SimulationStatus;
  readonly succeeded: boolean;
  readonly gasUsed?: GasAmount;
  readonly returnData?: HexData;
  readonly logs?: readonly SimulationLog[];
  readonly balanceChanges?: readonly TokenBalanceChange[];
  readonly expectedProfitAmount?: TokenAmount;
  readonly revertData?: HexData;
  readonly revertReason?: string;
  readonly failingLegIndex?: number;
  readonly failingTarget?: EvmAddress;
  readonly blockReference?: EvmBlockReference;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSimulationBackend {
  simulate(
    request: TransactionSimulationBackendRequest,
  ): Promise<TransactionSimulationBackendResult>;
}

export interface RevertAnalysisInput {
  readonly status: SimulationStatus;
  readonly revertData?: HexData;
  readonly revertReason?: string;
  readonly failingLegIndex?: number;
  readonly failingTarget?: EvmAddress;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface TransactionSimulationRevertAnalyzer {
  analyze(input: RevertAnalysisInput): {
    readonly classification: RevertClassification;
    readonly reason?: string;
    readonly selector?: HexData;
    readonly rawData?: HexData;
    readonly failingLegIndex?: number;
    readonly failingTarget?: EvmAddress;
    readonly retryable: boolean;
    readonly metadata?: CrossDexArbitrageMetadata;
  };
}

export interface TransactionSimulatorOptions {
  readonly timeoutMilliseconds?: number;
  readonly maximumGasLimit?: GasAmount;
  readonly requireGasLimit?: boolean;
  readonly collectLogs?: boolean;
  readonly collectBalanceChanges?: boolean;
  readonly traceEnabled?: boolean;
  readonly rejectFutureBlocks?: boolean;
  readonly normalizeBackendErrors?: boolean;
}

interface NormalizedOptions {
  readonly timeoutMilliseconds: number;
  readonly maximumGasLimit?: GasAmount;
  readonly requireGasLimit: boolean;
  readonly collectLogs: boolean;
  readonly collectBalanceChanges: boolean;
  readonly traceEnabled: boolean;
  readonly rejectFutureBlocks: boolean;
  readonly normalizeBackendErrors: boolean;
}

export interface TransactionSimulationValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

const DEFAULT_OPTIONS = Object.freeze({
  timeoutMilliseconds: 15_000,
  requireGasLimit: false,
  collectLogs: true,
  collectBalanceChanges: true,
  traceEnabled: false,
  rejectFutureBlocks: false,
  normalizeBackendErrors: true,
});

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function mergeMetadata(
  ...sources: readonly (
    | CrossDexArbitrageMetadata
    | undefined
  )[]
): CrossDexArbitrageMetadata | undefined {
  const present = sources.filter(
    (
      value,
    ): value is CrossDexArbitrageMetadata =>
      value !== undefined,
  );

  return present.length === 0
    ? undefined
    : Object.freeze(Object.assign({}, ...present));
}

function normalizeOptions(
  options: TransactionSimulatorOptions,
): NormalizedOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(merged.timeoutMilliseconds) ||
    merged.timeoutMilliseconds <= 0
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.INVALID_OPTIONS,
      "timeoutMilliseconds must be a positive safe integer.",
      { details: merged.timeoutMilliseconds },
    );
  }

  if (
    merged.maximumGasLimit !== undefined &&
    merged.maximumGasLimit <= 0n
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.INVALID_OPTIONS,
      "maximumGasLimit must be greater than zero.",
      { details: merged.maximumGasLimit },
    );
  }

  return Object.freeze({
    timeoutMilliseconds: merged.timeoutMilliseconds,
    maximumGasLimit: merged.maximumGasLimit,
    requireGasLimit: merged.requireGasLimit,
    collectLogs: merged.collectLogs,
    collectBalanceChanges:
      merged.collectBalanceChanges,
    traceEnabled: merged.traceEnabled,
    rejectFutureBlocks: merged.rejectFutureBlocks,
    normalizeBackendErrors:
      merged.normalizeBackendErrors,
  });
}

function isAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value);
}

function isHexData(value: string): boolean {
  return HEX_DATA_PATTERN.test(value);
}

function selectorFromData(
  data: HexData | undefined,
): HexData | undefined {
  if (
    data === undefined ||
    String(data).length < 10
  ) {
    return undefined;
  }

  return String(data).slice(0, 10) as HexData;
}

function cloneLog(log: SimulationLog): SimulationLog {
  return Object.freeze({
    address: log.address,
    topics: Object.freeze([...log.topics]),
    data: log.data,
    logIndex: log.logIndex,
  });
}

function cloneBalanceChange(
  change: TokenBalanceChange,
): TokenBalanceChange {
  return Object.freeze({
    token: Object.freeze({
      ...change.token,
      metadata: freezeMetadata(
        change.token.metadata,
      ),
    }),
    account: change.account,
    amountBefore: change.amountBefore,
    amountAfter: change.amountAfter,
    signedDelta: change.signedDelta,
  });
}

function cloneBlockReference(
  block: EvmBlockReference | undefined,
): EvmBlockReference | undefined {
  return block === undefined
    ? undefined
    : Object.freeze({ ...block });
}

function assertBackendResult(
  value: TransactionSimulationBackendResult,
  request: TransactionSimulationRequest,
): void {
  if (
    value === null ||
    typeof value !== "object" ||
    !Object.values(SimulationStatus).includes(
      value.status,
    ) ||
    typeof value.succeeded !== "boolean"
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.MALFORMED_BACKEND_RESULT,
      "Simulation backend returned a malformed result.",
      {
        simulationId: request.simulationId,
        chainId: request.chainId,
        details: value,
      },
    );
  }

  if (
    value.succeeded &&
    value.status !== SimulationStatus.SUCCEEDED
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.MALFORMED_BACKEND_RESULT,
      "A successful backend result must use SUCCEEDED status.",
      {
        simulationId: request.simulationId,
        chainId: request.chainId,
        details: value,
      },
    );
  }

  if (
    value.gasUsed !== undefined &&
    value.gasUsed < 0n
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.MALFORMED_BACKEND_RESULT,
      "Backend gasUsed cannot be negative.",
      {
        simulationId: request.simulationId,
        chainId: request.chainId,
        details: value.gasUsed,
      },
    );
  }

  if (
    value.returnData !== undefined &&
    !isHexData(String(value.returnData))
  ) {
    throw new TransactionSimulatorError(
      TransactionSimulatorErrorCode.MALFORMED_BACKEND_RESULT,
      "Backend returnData must be valid even-length hex data.",
      {
        simulationId: request.simulationId,
        chainId: request.chainId,
      },
    );
  }
}

export class DefaultTransactionSimulationRevertAnalyzer
  implements TransactionSimulationRevertAnalyzer
{
  public analyze(input: RevertAnalysisInput) {
    const reason = input.revertReason?.trim();
    const normalized = reason?.toLowerCase() ?? "";
    let classification =
      RevertClassification.UNKNOWN_CONTRACT_REVERT;
    let retryable = false;

    if (input.status === SimulationStatus.RPC_ERROR) {
      classification =
        RevertClassification.RPC_FAILURE;
      retryable = true;
    } else if (
      normalized.includes("slippage") ||
      normalized.includes("too little received")
    ) {
      classification = RevertClassification.SLIPPAGE;
      retryable = true;
    } else if (
      normalized.includes("insufficient output") ||
      normalized.includes("minimum amount")
    ) {
      classification =
        RevertClassification.INSUFFICIENT_OUTPUT;
      retryable = true;
    } else if (
      normalized.includes("insufficient input")
    ) {
      classification =
        RevertClassification.INSUFFICIENT_INPUT;
    } else if (
      normalized.includes("insufficient balance")
    ) {
      classification =
        RevertClassification.INSUFFICIENT_BALANCE;
    } else if (
      normalized.includes("allowance")
    ) {
      classification =
        RevertClassification.INSUFFICIENT_ALLOWANCE;
    } else if (
      normalized.includes("deadline") ||
      normalized.includes("expired")
    ) {
      classification =
        RevertClassification.EXPIRED_DEADLINE;
      retryable = true;
    } else if (
      normalized.includes("flash") &&
      normalized.includes("repay")
    ) {
      classification =
        RevertClassification.FLASH_LOAN_REPAYMENT_FAILED;
    } else if (
      normalized.includes("flash") &&
      normalized.includes("callback")
    ) {
      classification =
        RevertClassification.FLASH_LOAN_CALLBACK_FAILED;
    } else if (
      normalized.includes("out of gas") ||
      normalized.includes("gas exhausted")
    ) {
      classification =
        RevertClassification.GAS_EXHAUSTED;
      retryable = true;
    } else if (
      normalized.includes("nonce")
    ) {
      classification =
        RevertClassification.NONCE_CONFLICT;
      retryable = true;
    } else if (
      normalized.includes("paused")
    ) {
      classification =
        RevertClassification.CONTRACT_PAUSED;
    } else if (
      normalized.includes("unauthorized") ||
      normalized.includes("not authorized")
    ) {
      classification =
        RevertClassification.UNAUTHORIZED_EXECUTOR;
    } else if (
      normalized.includes("transfer")
    ) {
      classification =
        RevertClassification.TOKEN_TRANSFER_FAILED;
    } else if (
      normalized.includes("calldata") ||
      normalized.includes("selector")
    ) {
      classification =
        RevertClassification.INVALID_CALLDATA;
    } else if (
      normalized.includes("liquidity")
    ) {
      classification =
        RevertClassification.POOL_LIQUIDITY_CHANGED;
      retryable = true;
    }

    return Object.freeze({
      classification,
      reason:
        reason === undefined || reason.length === 0
          ? undefined
          : reason,
      selector: selectorFromData(input.revertData),
      rawData: input.revertData,
      failingLegIndex: input.failingLegIndex,
      failingTarget: input.failingTarget,
      retryable,
      metadata: freezeMetadata(input.metadata),
    });
  }
}

export class CrossDexTransactionSimulator {
  private readonly options: NormalizedOptions;

  public constructor(
    private readonly backend: TransactionSimulationBackend,
    private readonly clock: TransactionSimulationClock,
    private readonly revertAnalyzer: TransactionSimulationRevertAnalyzer =
      new DefaultTransactionSimulationRevertAnalyzer(),
    options: TransactionSimulatorOptions = {},
  ) {
    if (
      backend === null ||
      typeof backend !== "object" ||
      typeof backend.simulate !== "function"
    ) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.INVALID_DEPENDENCIES,
        "A transaction simulation backend is required.",
      );
    }

    if (
      clock === null ||
      typeof clock !== "object" ||
      typeof clock.nowMilliseconds !== "function"
    ) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.INVALID_DEPENDENCIES,
        "A deterministic simulation clock is required.",
      );
    }

    if (
      revertAnalyzer === null ||
      typeof revertAnalyzer !== "object" ||
      typeof revertAnalyzer.analyze !== "function"
    ) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.INVALID_DEPENDENCIES,
        "A revert analyzer is required.",
      );
    }

    this.options = normalizeOptions(options);
  }

  public validate(
    request: TransactionSimulationRequest,
  ): TransactionSimulationValidation {
    const issues: string[] = [];

    if (
      request === null ||
      typeof request !== "object"
    ) {
      return Object.freeze({
        valid: false,
        issues: Object.freeze([
          "Simulation request is required.",
        ]),
      });
    }

    if (
      !Number.isSafeInteger(Number(request.chainId)) ||
      Number(request.chainId) <= 0
    ) {
      issues.push(
        "chainId must be a positive safe integer.",
      );
    }

    if (!isAddress(String(request.from))) {
      issues.push(
        "from must be a valid EVM address.",
      );
    }

    if (!isAddress(String(request.to))) {
      issues.push("to must be a valid EVM address.");
    }

    if (!isHexData(String(request.data))) {
      issues.push(
        "data must be valid even-length hex data.",
      );
    }

    if (request.value < 0n) {
      issues.push("value cannot be negative.");
    }

    if (
      this.options.requireGasLimit &&
      request.gasLimit === undefined
    ) {
      issues.push("gasLimit is required.");
    }

    if (
      request.gasLimit !== undefined &&
      request.gasLimit <= 0n
    ) {
      issues.push(
        "gasLimit must be greater than zero.",
      );
    }

    if (
      request.gasLimit !== undefined &&
      this.options.maximumGasLimit !== undefined &&
      request.gasLimit >
        this.options.maximumGasLimit
    ) {
      issues.push(
        "gasLimit exceeds the configured maximum.",
      );
    }

    if (
      request.gasPricing !== undefined &&
      request.gasPricing.chainId !== request.chainId
    ) {
      issues.push(
        "gasPricing chainId must match request chainId.",
      );
    }

    if (
      request.nonce !== undefined &&
      request.nonce < 0n
    ) {
      issues.push("nonce cannot be negative.");
    }

    if (
      request.blockNumber !== undefined &&
      request.blockNumber < 0n
    ) {
      issues.push(
        "blockNumber cannot be negative.",
      );
    }

    return Object.freeze({
      valid: issues.length === 0,
      issues: Object.freeze(issues),
    });
  }

  public async simulate(
    request: TransactionSimulationRequest,
  ): Promise<TransactionSimulationResult> {
    const validation = this.validate(request);

    if (!validation.valid) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.INVALID_REQUEST,
        "Transaction simulation request is invalid.",
        {
          simulationId: request.simulationId,
          chainId: request.chainId,
          details: validation.issues,
        },
      );
    }

    let backendResult: TransactionSimulationBackendResult;

    try {
      backendResult = await this.backend.simulate(
        Object.freeze({
          request,
          timeoutMilliseconds:
            this.options.timeoutMilliseconds,
          collectLogs: this.options.collectLogs,
          collectBalanceChanges:
            this.options.collectBalanceChanges,
          traceEnabled: this.options.traceEnabled,
        }),
      );
    } catch (cause) {
      if (!this.options.normalizeBackendErrors) {
        throw cause;
      }

      backendResult = Object.freeze({
        status: SimulationStatus.RPC_ERROR,
        succeeded: false,
        revertReason:
          cause instanceof Error
            ? cause.message
            : "Transaction simulation backend failed.",
        metadata: Object.freeze({
          backendFailure: true,
        }),
      });
    }

    assertBackendResult(backendResult, request);

    if (
      backendResult.blockReference !== undefined &&
      backendResult.blockReference.chainId !==
        request.chainId
    ) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.CHAIN_MISMATCH,
        "Simulation block reference chain does not match request chain.",
        {
          simulationId: request.simulationId,
          chainId: request.chainId,
          details: backendResult.blockReference,
        },
      );
    }

    if (
      backendResult.gasUsed !== undefined &&
      request.gasLimit !== undefined &&
      backendResult.gasUsed > request.gasLimit
    ) {
      backendResult = Object.freeze({
        ...backendResult,
        status: SimulationStatus.REVERTED,
        succeeded: false,
        revertReason:
          "Simulation gas usage exceeds the requested gas limit.",
      });
    }

    const simulatedAtMilliseconds =
      this.clock.nowMilliseconds();

    const revertAnalysis = backendResult.succeeded
      ? undefined
      : this.revertAnalyzer.analyze({
          status: backendResult.status,
          revertData: backendResult.revertData,
          revertReason: backendResult.revertReason,
          failingLegIndex:
            backendResult.failingLegIndex,
          failingTarget:
            backendResult.failingTarget,
          metadata: backendResult.metadata,
        });

    return Object.freeze({
      simulationId: request.simulationId,
      status: backendResult.status,
      succeeded: backendResult.succeeded,
      gasUsed: backendResult.gasUsed,
      returnData: backendResult.returnData,
      logs: Object.freeze(
        (this.options.collectLogs
          ? backendResult.logs ?? []
          : []
        ).map(cloneLog),
      ),
      balanceChanges: Object.freeze(
        (this.options.collectBalanceChanges
          ? backendResult.balanceChanges ?? []
          : []
        ).map(cloneBalanceChange),
      ),
      expectedProfitAmount:
        backendResult.expectedProfitAmount,
      revertAnalysis,
      blockReference: cloneBlockReference(
        backendResult.blockReference,
      ),
      simulatedAtMilliseconds,
      metadata: mergeMetadata(
        request.metadata,
        backendResult.metadata,
        Object.freeze({
          simulator: "transaction-simulator",
          timeoutMilliseconds:
            this.options.timeoutMilliseconds,
          traceEnabled: this.options.traceEnabled,
        }),
      ),
    });
  }

  public async simulateOrThrow(
    request: TransactionSimulationRequest,
  ): Promise<TransactionSimulationResult> {
    const result = await this.simulate(request);

    if (!result.succeeded) {
      throw new TransactionSimulatorError(
        TransactionSimulatorErrorCode.BACKEND_FAILURE,
        result.revertAnalysis?.reason ??
          "Transaction simulation did not succeed.",
        {
          simulationId: request.simulationId,
          chainId: request.chainId,
          details: result.revertAnalysis,
        },
      );
    }

    return result;
  }
}

export function createCrossDexTransactionSimulator(
  backend: TransactionSimulationBackend,
  clock: TransactionSimulationClock,
  options: TransactionSimulatorOptions = {},
  revertAnalyzer: TransactionSimulationRevertAnalyzer =
    new DefaultTransactionSimulationRevertAnalyzer(),
): CrossDexTransactionSimulator {
  return new CrossDexTransactionSimulator(
    backend,
    clock,
    revertAnalyzer,
    options,
  );
}

/**
 * Compatibility alias for consumers that prefer the milestone file name.
 */
export {
  CrossDexTransactionSimulator as TransactionSimulatorService,
};