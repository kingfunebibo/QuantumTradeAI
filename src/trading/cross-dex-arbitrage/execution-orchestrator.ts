/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Central deterministic execution orchestrator for atomic cross-DEX arbitrage.
 *
 * The orchestrator coordinates validation, gas estimation, profitability
 * enforcement, payload preparation, simulation, signing, and MEV-aware
 * submission. It performs no direct RPC, wallet, filesystem, or clock access.
 */

import {
  ArbitrageExecutionStatus,
  ArbitrageFundingMode,
  ExecutionMode,
  SimulationStatus,
  TransactionSubmissionMode,
  type ArbitrageExecution,
  type ArbitrageExecutionFinancialResult,
  type ArbitrageExecutionId,
  type ArbitrageExecutionRequest,
  type ArbitrageProfitability,
  type AtomicArbitrageExecutionPayload,
  type CrossDexArbitrageMetadata,
  type GasAmount,
  type GasCostEstimate,
  type Nonce,
  type SignedEvmTransaction,
  type SimulationId,
  type TokenAmount,
  type TransactionSigner,
  type TransactionSimulationRequest,
  type TransactionSimulationResult,
  type TransactionSubmissionResult,
  type UnixTimestampMilliseconds,
  type UnsignedEvmTransaction,
  type ValidationIssue,
  type ValidationResult,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";
import {
  type DetailedGasCostEstimate,
  type GasCostEstimationRequest,
  GasCostEstimator,
} from "./gas-cost-estimator";
import {
  type DetailedArbitrageProfitability,
  type ProfitabilityCalculationRequest,
  ProfitabilityCalculator,
} from "./profitability-calculator";
import {
  FlashLoanExecutor,
  type FlashLoanExecutionPreparationRequest,
  type FlashLoanExecutionPreparationResult,
} from "./flash-loan-executor";
import {
  CrossDexTransactionSimulator,
} from "./transaction-simulator";
import {
  MevProtectionManager,
  type MevProtectionRequest,
  type MevProtectionResult,
} from "./mev-protection-manager";

export enum ExecutionOrchestratorErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  OPPORTUNITY_EXPIRED = "OPPORTUNITY_EXPIRED",
  DEADLINE_EXPIRED = "DEADLINE_EXPIRED",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  FUNDING_MODE_MISMATCH = "FUNDING_MODE_MISMATCH",
  PROFITABILITY_REJECTED = "PROFITABILITY_REJECTED",
  PREPARATION_FAILED = "PREPARATION_FAILED",
  SIMULATION_REQUIRED = "SIMULATION_REQUIRED",
  SIMULATION_FAILED = "SIMULATION_FAILED",
  SIGNING_FAILED = "SIGNING_FAILED",
  SUBMISSION_FAILED = "SUBMISSION_FAILED",
  SUBMISSION_REJECTED = "SUBMISSION_REJECTED",
  PAPER_EXECUTION_FAILED = "PAPER_EXECUTION_FAILED",
  EXECUTION_FAILED = "EXECUTION_FAILED",
}

export class ExecutionOrchestratorError extends Error {
  public readonly code: ExecutionOrchestratorErrorCode;
  public readonly executionId?: ArbitrageExecutionId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: ExecutionOrchestratorErrorCode,
    message: string,
    options: Readonly<{
      executionId?: ArbitrageExecutionId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "ExecutionOrchestratorError";
    this.code = code;
    this.executionId = options.executionId;
    this.details = options.details;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ExecutionOrchestratorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface CrossDexExecutionValidator {
  validateExecutionRequest(
    request: ArbitrageExecutionRequest,
  ): ValidationResult;
}

export interface WalletExecutionPreparationRequest {
  readonly executionRequest: ArbitrageExecutionRequest;
  readonly simulationId?: SimulationId;
  readonly nonce?: Nonce;
  readonly gasLimit?: GasAmount;
  readonly minimumProfitAmount?: TokenAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface WalletExecutionPreparationResult {
  readonly payload: AtomicArbitrageExecutionPayload;
  readonly simulationRequest?: TransactionSimulationRequest;
  readonly unsignedTransaction: UnsignedEvmTransaction;
  readonly preparedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface WalletExecutionPreparer {
  prepare(
    request: WalletExecutionPreparationRequest,
  ): Promise<WalletExecutionPreparationResult>;
}

export interface ExecutionAuditEvent {
  readonly sequence: number;
  readonly executionId: ArbitrageExecutionId;
  readonly status: ArbitrageExecutionStatus;
  readonly occurredAtMilliseconds: UnixTimestampMilliseconds;
  readonly message: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionAuditSink {
  record(event: ExecutionAuditEvent): void | Promise<void>;
}

export interface ExecutionOrchestratorOptions {
  readonly requireSimulationForLiveExecution?: boolean;
  readonly rejectExpiredOpportunity?: boolean;
  readonly rejectExpiredDeadline?: boolean;
  readonly requireProfitableResult?: boolean;
  readonly useMevProtectionForPrivateModes?: boolean;
  readonly allowPublicFallback?: boolean;
  readonly defaultGasCostAmountOverride?: TokenAmount;
  readonly defaultInputTokenUsdPrice?: number;
  readonly defaultNativeCurrencyUsdPrice?: number;
  readonly mevProtectionCostAmount?: TokenAmount;
  readonly mevProtectionCostWei?: WeiAmount;
  readonly mevProtectionCostUsd?: number;
}

export interface ExecutionOrchestrationRequest {
  readonly executionRequest: ArbitrageExecutionRequest;
  readonly simulationId?: SimulationId;
  readonly nonce?: Nonce;
  readonly gasEstimation?: Omit<
    GasCostEstimationRequest,
    "route" | "gasPrice" | "flashLiquidityQuote"
  >;
  readonly profitability?: Omit<
    ProfitabilityCalculationRequest,
    "route" | "fundingMode" | "gasEstimate" | "flashLiquidityQuote"
  >;
  readonly mevProtection?: Omit<
    MevProtectionRequest,
    "submissionId" | "signedTransaction" | "requestedMode"
  >;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface ExecutionOrchestrationResult {
  readonly execution: ArbitrageExecution;
  readonly gasEstimate: DetailedGasCostEstimate;
  readonly profitability: DetailedArbitrageProfitability;
  readonly mevProtection?: MevProtectionResult;
  readonly auditTrail: readonly ExecutionAuditEvent[];
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

interface NormalizedOptions {
  readonly requireSimulationForLiveExecution: boolean;
  readonly rejectExpiredOpportunity: boolean;
  readonly rejectExpiredDeadline: boolean;
  readonly requireProfitableResult: boolean;
  readonly useMevProtectionForPrivateModes: boolean;
  readonly allowPublicFallback: boolean;
  readonly defaultGasCostAmountOverride?: TokenAmount;
  readonly defaultInputTokenUsdPrice?: number;
  readonly defaultNativeCurrencyUsdPrice?: number;
  readonly mevProtectionCostAmount?: TokenAmount;
  readonly mevProtectionCostWei?: WeiAmount;
  readonly mevProtectionCostUsd?: number;
}

interface PreparedExecution {
  readonly payload: AtomicArbitrageExecutionPayload;
  readonly simulationRequest?: TransactionSimulationRequest;
  readonly unsignedTransaction?: UnsignedEvmTransaction;
}

const DEFAULT_OPTIONS: NormalizedOptions = Object.freeze({
  requireSimulationForLiveExecution: true,
  rejectExpiredOpportunity: true,
  rejectExpiredDeadline: true,
  requireProfitableResult: true,
  useMevProtectionForPrivateModes: true,
  allowPublicFallback: false,
});

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
  options: ExecutionOrchestratorOptions,
): NormalizedOptions {
  const normalized = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const nonNegativeBigints: ReadonlyArray<
    readonly [string, bigint | undefined]
  > = [
    [
      "defaultGasCostAmountOverride",
      normalized.defaultGasCostAmountOverride,
    ],
    [
      "mevProtectionCostAmount",
      normalized.mevProtectionCostAmount,
    ],
    [
      "mevProtectionCostWei",
      normalized.mevProtectionCostWei,
    ],
  ];

  for (const [name, value] of nonNegativeBigints) {
    if (value !== undefined && value < 0n) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.INVALID_OPTIONS,
        `${name} cannot be negative.`,
        { details: value },
      );
    }
  }

  const prices: ReadonlyArray<
    readonly [string, number | undefined]
  > = [
    [
      "defaultInputTokenUsdPrice",
      normalized.defaultInputTokenUsdPrice,
    ],
    [
      "defaultNativeCurrencyUsdPrice",
      normalized.defaultNativeCurrencyUsdPrice,
    ],
  ];

  for (const [name, value] of prices) {
    if (
      value !== undefined &&
      (!Number.isFinite(value) || value <= 0)
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.INVALID_OPTIONS,
        `${name} must be a positive finite number.`,
        { details: value },
      );
    }
  }

  if (
    normalized.mevProtectionCostUsd !== undefined &&
    (!Number.isFinite(normalized.mevProtectionCostUsd) ||
      normalized.mevProtectionCostUsd < 0)
  ) {
    throw new ExecutionOrchestratorError(
      ExecutionOrchestratorErrorCode.INVALID_OPTIONS,
      "mevProtectionCostUsd must be a non-negative finite number.",
    );
  }

  return Object.freeze(normalized);
}

function isFlashFundingMode(
  mode: ArbitrageFundingMode,
): boolean {
  return (
    mode === ArbitrageFundingMode.FLASH_LOAN ||
    mode === ArbitrageFundingMode.FLASH_SWAP ||
    mode === ArbitrageFundingMode.AUTO
  );
}

function buildFinancialResult(
  request: ArbitrageExecutionRequest,
  profitability: ArbitrageProfitability,
): ArbitrageExecutionFinancialResult {
  return Object.freeze({
    fundingToken: request.opportunity.route.startToken,
    fundingAmount: request.opportunity.route.inputAmount,
    finalAmount: profitability.netOutputAmount,
    grossProfitAmount: profitability.grossProfitAmount,
    flashLoanPremiumAmount:
      profitability.costs.flashLoanPremiumAmount,
    gasCostWei: profitability.costs.gasCostWei,
    gasCostInFundingToken:
      profitability.costs.gasCostUsd === undefined
        ? undefined
        : undefined,
    netProfitAmount: profitability.netProfitAmount,
    netProfitUsd: profitability.netProfitUsd,
    netProfitBasisPoints:
      profitability.netProfitBasisPoints,
    profitable: profitability.profitable,
  });
}

export class ExecutionOrchestrator {
  private readonly options: NormalizedOptions;

  public constructor(
    private readonly validator: CrossDexExecutionValidator,
    private readonly gasEstimator: GasCostEstimator,
    private readonly profitabilityCalculator: ProfitabilityCalculator,
    private readonly flashLoanExecutor: FlashLoanExecutor,
    private readonly walletPreparer: WalletExecutionPreparer,
    private readonly simulator: CrossDexTransactionSimulator,
    private readonly signer: TransactionSigner,
    private readonly mevProtectionManager: MevProtectionManager,
    private readonly clock: ExecutionOrchestratorClock,
    private readonly auditSink?: ExecutionAuditSink,
    options: ExecutionOrchestratorOptions = {},
  ) {
    const dependencies: ReadonlyArray<
      readonly [string, unknown, string]
    > = [
      ["validator", validator, "validateExecutionRequest"],
      ["gasEstimator", gasEstimator, "estimate"],
      [
        "profitabilityCalculator",
        profitabilityCalculator,
        "calculate",
      ],
      ["flashLoanExecutor", flashLoanExecutor, "prepare"],
      ["walletPreparer", walletPreparer, "prepare"],
      ["simulator", simulator, "simulate"],
      ["signer", signer, "sign"],
      [
        "mevProtectionManager",
        mevProtectionManager,
        "submit",
      ],
      ["clock", clock, "nowMilliseconds"],
    ];

    for (const [name, dependency, method] of dependencies) {
      if (
        dependency === null ||
        typeof dependency !== "object" ||
        typeof (dependency as Record<string, unknown>)[method] !==
          "function"
      ) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.INVALID_DEPENDENCIES,
          `${name} must implement ${method}().`,
        );
      }
    }

    this.options = normalizeOptions(options);
  }

  public async execute(
    input: ExecutionOrchestrationRequest,
  ): Promise<ExecutionOrchestrationResult> {
    this.validateInput(input);

    const request = input.executionRequest;
    const now = this.clock.nowMilliseconds();
    const auditTrail: ExecutionAuditEvent[] = [];
    let sequence = 0;

    const record = async (
      status: ArbitrageExecutionStatus,
      message: string,
      metadata?: CrossDexArbitrageMetadata,
    ): Promise<void> => {
      sequence += 1;
      const event: ExecutionAuditEvent = Object.freeze({
        sequence,
        executionId: request.executionId,
        status,
        occurredAtMilliseconds:
          this.clock.nowMilliseconds(),
        message,
        metadata: freezeMetadata(metadata),
      });

      auditTrail.push(event);
      await this.auditSink?.record(event);
    };

    let status = ArbitrageExecutionStatus.CREATED;
    let payload: AtomicArbitrageExecutionPayload | undefined;
    let simulation: TransactionSimulationResult | undefined;
    let unsignedTransaction: UnsignedEvmTransaction | undefined;
    let signedTransaction: SignedEvmTransaction | undefined;
    let submission: TransactionSubmissionResult | undefined;
    let mevProtection: MevProtectionResult | undefined;

    await record(status, "Execution orchestration created.");

    try {
      status = ArbitrageExecutionStatus.VALIDATING;
      await record(status, "Validating execution request.");

      const validation =
        this.validator.validateExecutionRequest(request);

      if (!validation.valid) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.VALIDATION_FAILED,
          "Execution request validation failed.",
          {
            executionId: request.executionId,
            details: validation.issues,
          },
        );
      }

      this.enforceTemporalValidity(request, now);

      const gasEstimate = this.gasEstimator.estimate({
        route: request.opportunity.route,
        gasPrice: request.gasPricing,
        flashLiquidityQuote:
          request.opportunity.flashLiquidityQuote,
        nativeCurrencyUsdPrice:
          input.gasEstimation?.nativeCurrencyUsdPrice ??
          this.options.defaultNativeCurrencyUsdPrice,
        approvalTransactionCount:
          input.gasEstimation?.approvalTransactionCount,
        tokenTransferCount:
          input.gasEstimation?.tokenTransferCount,
        includeSettlementOverhead:
          input.gasEstimation?.includeSettlementOverhead,
        additionalGas: input.gasEstimation?.additionalGas,
        gasLimitSafetyMultiplier:
          input.gasEstimation?.gasLimitSafetyMultiplier,
        feeSafetyMultiplier:
          input.gasEstimation?.feeSafetyMultiplier,
        gasPolicy: input.gasEstimation?.gasPolicy,
        metadata: mergeMetadata(
          request.metadata,
          input.metadata,
          input.gasEstimation?.metadata,
        ),
      });

      const profitability =
        this.profitabilityCalculator.calculate({
          route: request.opportunity.route,
          fundingMode: request.fundingMode,
          gasEstimate,
          flashLiquidityQuote:
            request.opportunity.flashLiquidityQuote,
          inputTokenUsdPrice:
            input.profitability?.inputTokenUsdPrice ??
            this.options.defaultInputTokenUsdPrice,
          tokenUsdValuations:
            input.profitability?.tokenUsdValuations,
          dexFeeAmountOverride:
            input.profitability?.dexFeeAmountOverride,
          slippageCostAmountOverride:
            input.profitability?.slippageCostAmountOverride,
          priceImpactCostAmountOverride:
            input.profitability?.priceImpactCostAmountOverride,
          gasCostAmountOverride:
            input.profitability?.gasCostAmountOverride ??
            this.options.defaultGasCostAmountOverride,
          mevProtectionCostAmount:
            input.profitability?.mevProtectionCostAmount ??
            this.options.mevProtectionCostAmount,
          mevProtectionCostWei:
            input.profitability?.mevProtectionCostWei ??
            this.options.mevProtectionCostWei,
          mevProtectionCostUsd:
            input.profitability?.mevProtectionCostUsd ??
            this.options.mevProtectionCostUsd,
          additionalCostAmount:
            input.profitability?.additionalCostAmount,
          additionalCostUsd:
            input.profitability?.additionalCostUsd,
          thresholds: input.profitability?.thresholds,
          metadata: mergeMetadata(
            request.metadata,
            input.metadata,
            input.profitability?.metadata,
          ),
        });

      if (
        this.options.requireProfitableResult &&
        !profitability.profitable
      ) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.PROFITABILITY_REJECTED,
          "Execution was rejected by the profitability policy.",
          {
            executionId: request.executionId,
            details: profitability,
          },
        );
      }

      const prepared = await this.prepareExecution(
        input,
        gasEstimate,
        profitability,
      );

      payload = prepared.payload;
      unsignedTransaction = prepared.unsignedTransaction;

      const simulationRequired =
        request.simulateBeforeSubmission ||
        (request.executionMode === ExecutionMode.LIVE &&
          this.options.requireSimulationForLiveExecution);

      if (simulationRequired) {
        if (prepared.simulationRequest === undefined) {
          throw new ExecutionOrchestratorError(
            ExecutionOrchestratorErrorCode.SIMULATION_REQUIRED,
            "Simulation is required but no simulation request was prepared.",
            { executionId: request.executionId },
          );
        }

        status = ArbitrageExecutionStatus.SIMULATING;
        await record(status, "Simulating atomic execution.");

        simulation = await this.simulator.simulate(
          prepared.simulationRequest,
        );

        if (!simulation.succeeded) {
          status = ArbitrageExecutionStatus.SIMULATION_FAILED;
          await record(
            status,
            "Atomic execution simulation failed.",
            simulation.metadata,
          );

          throw new ExecutionOrchestratorError(
            ExecutionOrchestratorErrorCode.SIMULATION_FAILED,
            "Atomic execution simulation failed.",
            {
              executionId: request.executionId,
              details: simulation.revertAnalysis ?? simulation,
            },
          );
        }

        status = ArbitrageExecutionStatus.SIMULATION_SUCCEEDED;
        await record(
          status,
          "Atomic execution simulation succeeded.",
          simulation.metadata,
        );
      }

      if (request.executionMode === ExecutionMode.PAPER) {
        status = ArbitrageExecutionStatus.PAPER_EXECUTED;
        await record(status, "Paper arbitrage execution completed.");

        const execution = this.buildExecution({
          request,
          status,
          payload,
          simulation,
          unsignedTransaction,
          profitability,
          createdAtMilliseconds: now,
          updatedAtMilliseconds: this.clock.nowMilliseconds(),
          validationIssues: validation.issues,
          metadata: mergeMetadata(
            request.metadata,
            input.metadata,
            Object.freeze({ paperExecution: true }),
          ),
        });

        return Object.freeze({
          execution,
          gasEstimate,
          profitability,
          auditTrail: Object.freeze([...auditTrail]),
          completedAtMilliseconds:
            this.clock.nowMilliseconds(),
          metadata: mergeMetadata(request.metadata, input.metadata),
        });
      }

      if (unsignedTransaction === undefined) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.PREPARATION_FAILED,
          "Live execution requires an unsigned transaction.",
          { executionId: request.executionId },
        );
      }

      status = ArbitrageExecutionStatus.SIGNING;
      await record(status, "Signing atomic execution transaction.");

      try {
        signedTransaction = await this.signer.sign(
          unsignedTransaction,
        );
      } catch (cause) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.SIGNING_FAILED,
          "Transaction signing failed.",
          {
            executionId: request.executionId,
            cause,
          },
        );
      }

      status = ArbitrageExecutionStatus.SUBMITTING;
      await record(status, "Submitting atomic execution transaction.");

      mevProtection = await this.mevProtectionManager.submit({
        submissionId: String(request.executionId) as never,
        signedTransaction,
        requestedMode: request.submissionMode,
        privatePreferences:
          input.mevProtection?.privatePreferences,
        riskInput: input.mevProtection?.riskInput,
        targetBlockNumber:
          input.mevProtection?.targetBlockNumber,
        allowPublicFallback:
          input.mevProtection?.allowPublicFallback ??
          this.options.allowPublicFallback,
        metadata: mergeMetadata(
          request.metadata,
          input.metadata,
          input.mevProtection?.metadata,
        ),
      });

      submission = mevProtection.submission;

      if (!submission.accepted) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.SUBMISSION_REJECTED,
          submission.errorMessage ??
            "Transaction submission was rejected.",
          {
            executionId: request.executionId,
            details: submission,
          },
        );
      }

      status = ArbitrageExecutionStatus.SUBMITTED;
      await record(
        status,
        "Atomic execution transaction was accepted.",
        submission.metadata,
      );

      const execution = this.buildExecution({
        request,
        status,
        payload,
        simulation,
        unsignedTransaction,
        signedTransaction,
        submission,
        profitability,
        createdAtMilliseconds: now,
        updatedAtMilliseconds: this.clock.nowMilliseconds(),
        submittedAtMilliseconds:
          submission.submittedAtMilliseconds,
        validationIssues: validation.issues,
        metadata: mergeMetadata(
          request.metadata,
          input.metadata,
          mevProtection.metadata,
        ),
      });

      return Object.freeze({
        execution,
        gasEstimate,
        profitability,
        mevProtection,
        auditTrail: Object.freeze([...auditTrail]),
        completedAtMilliseconds:
          this.clock.nowMilliseconds(),
        metadata: mergeMetadata(request.metadata, input.metadata),
      });
    } catch (cause) {
      status = ArbitrageExecutionStatus.FAILED;
      await record(
        status,
        cause instanceof Error
          ? cause.message
          : "Execution orchestration failed.",
      );

      if (cause instanceof ExecutionOrchestratorError) {
        throw cause;
      }

      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.EXECUTION_FAILED,
        cause instanceof Error
          ? cause.message
          : "Execution orchestration failed.",
        {
          executionId: request.executionId,
          cause,
          details: Object.freeze({
            status,
            auditTrail: Object.freeze([...auditTrail]),
          }),
        },
      );
    }
  }

  private async prepareExecution(
    input: ExecutionOrchestrationRequest,
    gasEstimate: GasCostEstimate,
    profitability: ArbitrageProfitability,
  ): Promise<PreparedExecution> {
    const request = input.executionRequest;
    const simulationId =
      input.simulationId ??
      (`simulation:${String(request.executionId)}` as SimulationId);
    const gasLimit =
      request.gasLimit ?? gasEstimate.gasLimit;

    if (isFlashFundingMode(request.fundingMode)) {
      let prepared: FlashLoanExecutionPreparationResult;

      try {
        prepared = await this.flashLoanExecutor.prepare({
          executionRequest: request,
          flashLiquidityQuote:
            request.opportunity.flashLiquidityQuote,
          simulationId,
          nonce: input.nonce ?? request.nonce,
          gasLimit,
          minimumProfitAmount:
            profitability.netProfitAmount,
          metadata: mergeMetadata(request.metadata, input.metadata),
        } satisfies FlashLoanExecutionPreparationRequest);
      } catch (cause) {
        throw new ExecutionOrchestratorError(
          ExecutionOrchestratorErrorCode.PREPARATION_FAILED,
          "Flash-funded execution preparation failed.",
          {
            executionId: request.executionId,
            cause,
          },
        );
      }

      return Object.freeze({
        payload: prepared.payload,
        simulationRequest: prepared.simulationRequest,
        unsignedTransaction: prepared.unsignedTransaction,
      });
    }

    if (
      request.fundingMode !== ArbitrageFundingMode.WALLET &&
      request.fundingMode !== ArbitrageFundingMode.PAPER
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.FUNDING_MODE_MISMATCH,
        `Unsupported funding mode: ${request.fundingMode}.`,
        { executionId: request.executionId },
      );
    }

    try {
      const prepared = await this.walletPreparer.prepare({
        executionRequest: request,
        simulationId,
        nonce: input.nonce ?? request.nonce,
        gasLimit,
        minimumProfitAmount: profitability.netProfitAmount,
        metadata: mergeMetadata(request.metadata, input.metadata),
      });

      return Object.freeze({
        payload: prepared.payload,
        simulationRequest: prepared.simulationRequest,
        unsignedTransaction: prepared.unsignedTransaction,
      });
    } catch (cause) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.PREPARATION_FAILED,
        "Wallet-funded execution preparation failed.",
        {
          executionId: request.executionId,
          cause,
        },
      );
    }
  }

  private enforceTemporalValidity(
    request: ArbitrageExecutionRequest,
    now: UnixTimestampMilliseconds,
  ): void {
    if (
      request.opportunity.chainId !==
      request.opportunity.route.chainId
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.CHAIN_MISMATCH,
        "Opportunity and route chain identifiers do not match.",
        { executionId: request.executionId },
      );
    }

    if (
      this.options.rejectExpiredOpportunity &&
      request.opportunity.expiresAtMilliseconds <= now
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.OPPORTUNITY_EXPIRED,
        "Arbitrage opportunity has expired.",
        { executionId: request.executionId },
      );
    }

    if (
      this.options.rejectExpiredDeadline &&
      request.deadlineMilliseconds <= now
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.DEADLINE_EXPIRED,
        "Execution deadline has expired.",
        { executionId: request.executionId },
      );
    }
  }

  private validateInput(
    input: ExecutionOrchestrationRequest,
  ): void {
    if (
      input === null ||
      typeof input !== "object" ||
      input.executionRequest === undefined
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.INVALID_REQUEST,
        "An execution orchestration request is required.",
      );
    }

    const request = input.executionRequest;

    if (
      request.executionMode === ExecutionMode.PAPER &&
      request.submissionMode !== TransactionSubmissionMode.PAPER
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.INVALID_REQUEST,
        "Paper execution requires PAPER submission mode.",
        { executionId: request.executionId },
      );
    }

    if (
      request.executionMode === ExecutionMode.LIVE &&
      request.submissionMode === TransactionSubmissionMode.PAPER
    ) {
      throw new ExecutionOrchestratorError(
        ExecutionOrchestratorErrorCode.INVALID_REQUEST,
        "Live execution cannot use PAPER submission mode.",
        { executionId: request.executionId },
      );
    }
  }

  private buildExecution(input: Readonly<{
    request: ArbitrageExecutionRequest;
    status: ArbitrageExecutionStatus;
    payload?: AtomicArbitrageExecutionPayload;
    simulation?: TransactionSimulationResult;
    unsignedTransaction?: UnsignedEvmTransaction;
    signedTransaction?: SignedEvmTransaction;
    submission?: TransactionSubmissionResult;
    profitability: ArbitrageProfitability;
    createdAtMilliseconds: UnixTimestampMilliseconds;
    updatedAtMilliseconds: UnixTimestampMilliseconds;
    submittedAtMilliseconds?: UnixTimestampMilliseconds;
    validationIssues: readonly ValidationIssue[];
    metadata?: CrossDexArbitrageMetadata;
  }>): ArbitrageExecution {
    return Object.freeze({
      id: input.request.executionId,
      opportunityId: input.request.opportunity.id,
      chainId: input.request.opportunity.chainId,
      request: input.request,
      status: input.status,
      payload: input.payload,
      simulation: input.simulation,
      unsignedTransaction: input.unsignedTransaction,
      signedTransaction: input.signedTransaction,
      submission: input.submission,
      financialResult: buildFinancialResult(
        input.request,
        input.profitability,
      ),
      revertAnalysis: input.simulation?.revertAnalysis,
      validationIssues: Object.freeze([
        ...input.validationIssues,
      ]),
      createdAtMilliseconds: input.createdAtMilliseconds,
      updatedAtMilliseconds: input.updatedAtMilliseconds,
      submittedAtMilliseconds:
        input.submittedAtMilliseconds,
      metadata: freezeMetadata(input.metadata),
    });
  }
}

export function createExecutionOrchestrator(
  validator: CrossDexExecutionValidator,
  gasEstimator: GasCostEstimator,
  profitabilityCalculator: ProfitabilityCalculator,
  flashLoanExecutor: FlashLoanExecutor,
  walletPreparer: WalletExecutionPreparer,
  simulator: CrossDexTransactionSimulator,
  signer: TransactionSigner,
  mevProtectionManager: MevProtectionManager,
  clock: ExecutionOrchestratorClock,
  auditSink?: ExecutionAuditSink,
  options: ExecutionOrchestratorOptions = {},
): ExecutionOrchestrator {
  return new ExecutionOrchestrator(
    validator,
    gasEstimator,
    profitabilityCalculator,
    flashLoanExecutor,
    walletPreparer,
    simulator,
    signer,
    mevProtectionManager,
    clock,
    auditSink,
    options,
  );
}

export {
  ExecutionOrchestrator as CrossDexExecutionOrchestrator,
};