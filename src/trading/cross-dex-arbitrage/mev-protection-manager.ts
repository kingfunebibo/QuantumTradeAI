/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic MEV-protection policy, relay selection, submission, and
 * failover orchestration.
 *
 * This module performs no direct RPC, wallet, network, filesystem, or clock
 * access. All side effects are delegated to injected interfaces.
 */

import {
  TransactionSubmissionMode,
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type PrivateTransactionPreferences,
  type SignedEvmTransaction,
  type SubmissionId,
  type TransactionHash,
  type TransactionSubmissionRequest,
  type TransactionSubmissionResult,
  type UnixTimestampMilliseconds,
  type WeiAmount,
} from "./cross-dex-arbitrage-contracts";

export enum MevProtectionRiskLevel {
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum MevProtectionDecision {
  PUBLIC_ALLOWED = "PUBLIC_ALLOWED",
  PRIVATE_PREFERRED = "PRIVATE_PREFERRED",
  PRIVATE_REQUIRED = "PRIVATE_REQUIRED",
  REJECTED = "REJECTED",
}

export enum MevRelayKind {
  PRIVATE_TRANSACTION = "PRIVATE_TRANSACTION",
  BUILDER_BUNDLE = "BUILDER_BUNDLE",
  PRIVATE_RPC = "PRIVATE_RPC",
}

export enum MevRelayHealth {
  HEALTHY = "HEALTHY",
  DEGRADED = "DEGRADED",
  UNAVAILABLE = "UNAVAILABLE",
  DISABLED = "DISABLED",
}

export enum MevProtectionErrorCode {
  INVALID_DEPENDENCIES = "INVALID_DEPENDENCIES",
  INVALID_CONFIGURATION = "INVALID_CONFIGURATION",
  INVALID_REQUEST = "INVALID_REQUEST",
  UNSUPPORTED_CHAIN = "UNSUPPORTED_CHAIN",
  PRIVATE_SUBMISSION_REQUIRED = "PRIVATE_SUBMISSION_REQUIRED",
  NO_ELIGIBLE_RELAY = "NO_ELIGIBLE_RELAY",
  RELAY_SUBMISSION_FAILED = "RELAY_SUBMISSION_FAILED",
  ALL_RELAYS_FAILED = "ALL_RELAYS_FAILED",
  PUBLIC_FALLBACK_FORBIDDEN = "PUBLIC_FALLBACK_FORBIDDEN",
  MALFORMED_RELAY_RESULT = "MALFORMED_RELAY_RESULT",
}

export class MevProtectionError extends Error {
  public readonly code: MevProtectionErrorCode;
  public readonly submissionId?: SubmissionId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: MevProtectionErrorCode,
    message: string,
    options: Readonly<{
      submissionId?: SubmissionId;
      chainId?: ChainId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "MevProtectionError";
    this.code = code;
    this.submissionId = options.submissionId;
    this.chainId = options.chainId;
    this.details = options.details;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface MevProtectionClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface MevRelayDescriptor {
  readonly id: string;
  readonly name: string;
  readonly kind: MevRelayKind;
  readonly supportedChainIds: readonly ChainId[];
  readonly priority: number;
  readonly enabled: boolean;
  readonly supportsReplacement: boolean;
  readonly supportsBuilderSelection: boolean;
  readonly maximumTargetBlockDistance?: number;
  readonly fixedSubmissionCostWei?: WeiAmount;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevRelayState {
  readonly descriptor: MevRelayDescriptor;
  readonly health: MevRelayHealth;
  readonly successCount: number;
  readonly failureCount: number;
  readonly consecutiveFailures: number;
  readonly averageLatencyMilliseconds?: number;
  readonly lastSuccessAtMilliseconds?: UnixTimestampMilliseconds;
  readonly lastFailureAtMilliseconds?: UnixTimestampMilliseconds;
  readonly cooldownUntilMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevRelaySubmissionContext {
  readonly request: TransactionSubmissionRequest;
  readonly targetBlockNumber?: BlockNumber;
  readonly timeoutMilliseconds: number;
  readonly attemptNumber: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevRelaySubmissionResponse {
  readonly accepted: boolean;
  readonly transactionHash?: TransactionHash;
  readonly relayBundleHash?: string;
  readonly providerRequestId?: string;
  readonly targetBlockNumber?: BlockNumber;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryable?: boolean;
  readonly latencyMilliseconds?: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevRelay {
  readonly descriptor: MevRelayDescriptor;

  getState(): MevRelayState;

  submit(
    context: MevRelaySubmissionContext,
  ): Promise<MevRelaySubmissionResponse>;
}

export interface PublicTransactionSubmitter {
  submit(
    request: TransactionSubmissionRequest,
  ): Promise<TransactionSubmissionResult>;
}

export interface MevRiskAssessmentInput {
  readonly chainId: ChainId;
  readonly signedTransaction: SignedEvmTransaction;
  readonly expectedProfitWei?: WeiAmount;
  readonly maximumExtractableValueWei?: WeiAmount;
  readonly estimatedPriceImpactBasisPoints?: bigint;
  readonly estimatedSlippageBasisPoints?: bigint;
  readonly routeLegCount?: number;
  readonly usesFlashLiquidity?: boolean;
  readonly opportunityAgeMilliseconds?: number;
  readonly publicMempoolRequested?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevRiskAssessment {
  readonly riskLevel: MevProtectionRiskLevel;
  readonly decision: MevProtectionDecision;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly recommendedSubmissionMode: TransactionSubmissionMode;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevProtectionRequest {
  readonly submissionId: SubmissionId;
  readonly signedTransaction: SignedEvmTransaction;
  readonly requestedMode: TransactionSubmissionMode;
  readonly privatePreferences?: PrivateTransactionPreferences;
  readonly riskInput?: Omit<
    MevRiskAssessmentInput,
    "chainId" | "signedTransaction" | "publicMempoolRequested"
  >;
  readonly targetBlockNumber?: BlockNumber;
  readonly allowPublicFallback?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevProtectionAttempt {
  readonly relayId?: string;
  readonly relayName?: string;
  readonly mode: TransactionSubmissionMode;
  readonly attemptNumber: number;
  readonly accepted: boolean;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly latencyMilliseconds: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryable: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevProtectionResult {
  readonly submission: TransactionSubmissionResult;
  readonly assessment: MevRiskAssessment;
  readonly protected: boolean;
  readonly selectedRelayId?: string;
  readonly attempts: readonly MevProtectionAttempt[];
  readonly publicFallbackUsed: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface MevProtectionManagerOptions {
  readonly timeoutMilliseconds?: number;
  readonly maximumRelayAttempts?: number;
  readonly maximumConsecutiveRelayFailures?: number;
  readonly relayCooldownMilliseconds?: number;
  readonly publicFallbackEnabled?: boolean;
  readonly privateSubmissionProfitThresholdWei?: WeiAmount;
  readonly privateSubmissionMevThresholdWei?: WeiAmount;
  readonly highPriceImpactBasisPoints?: bigint;
  readonly highSlippageBasisPoints?: bigint;
  readonly maximumOpportunityAgeMilliseconds?: number;
  readonly preferBundlesForFlashLiquidity?: boolean;
}

interface NormalizedOptions {
  readonly timeoutMilliseconds: number;
  readonly maximumRelayAttempts: number;
  readonly maximumConsecutiveRelayFailures: number;
  readonly relayCooldownMilliseconds: number;
  readonly publicFallbackEnabled: boolean;
  readonly privateSubmissionProfitThresholdWei: WeiAmount;
  readonly privateSubmissionMevThresholdWei: WeiAmount;
  readonly highPriceImpactBasisPoints: bigint;
  readonly highSlippageBasisPoints: bigint;
  readonly maximumOpportunityAgeMilliseconds: number;
  readonly preferBundlesForFlashLiquidity: boolean;
}

const DEFAULT_OPTIONS = Object.freeze({
  timeoutMilliseconds: 12_000,
  maximumRelayAttempts: 3,
  maximumConsecutiveRelayFailures: 3,
  relayCooldownMilliseconds: 30_000,
  publicFallbackEnabled: false,
  privateSubmissionProfitThresholdWei: 0n as WeiAmount,
  privateSubmissionMevThresholdWei: 0n as WeiAmount,
  highPriceImpactBasisPoints: 100n,
  highSlippageBasisPoints: 100n,
  maximumOpportunityAgeMilliseconds: 15_000,
  preferBundlesForFlashLiquidity: true,
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
  options: MevProtectionManagerOptions,
): NormalizedOptions {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const positiveSafeIntegers: ReadonlyArray<
    readonly [string, number]
  > = [
    ["timeoutMilliseconds", merged.timeoutMilliseconds],
    ["maximumRelayAttempts", merged.maximumRelayAttempts],
    [
      "maximumConsecutiveRelayFailures",
      merged.maximumConsecutiveRelayFailures,
    ],
    [
      "relayCooldownMilliseconds",
      merged.relayCooldownMilliseconds,
    ],
    [
      "maximumOpportunityAgeMilliseconds",
      merged.maximumOpportunityAgeMilliseconds,
    ],
  ];

  for (const [name, value] of positiveSafeIntegers) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_CONFIGURATION,
        `${name} must be a positive safe integer.`,
        { details: value },
      );
    }
  }

  if (
    merged.privateSubmissionProfitThresholdWei < 0n ||
    merged.privateSubmissionMevThresholdWei < 0n ||
    merged.highPriceImpactBasisPoints < 0n ||
    merged.highSlippageBasisPoints < 0n
  ) {
    throw new MevProtectionError(
      MevProtectionErrorCode.INVALID_CONFIGURATION,
      "MEV protection thresholds cannot be negative.",
    );
  }

  return Object.freeze({
    timeoutMilliseconds: merged.timeoutMilliseconds,
    maximumRelayAttempts: merged.maximumRelayAttempts,
    maximumConsecutiveRelayFailures:
      merged.maximumConsecutiveRelayFailures,
    relayCooldownMilliseconds:
      merged.relayCooldownMilliseconds,
    publicFallbackEnabled:
      merged.publicFallbackEnabled,
    privateSubmissionProfitThresholdWei:
      merged.privateSubmissionProfitThresholdWei,
    privateSubmissionMevThresholdWei:
      merged.privateSubmissionMevThresholdWei,
    highPriceImpactBasisPoints:
      merged.highPriceImpactBasisPoints,
    highSlippageBasisPoints:
      merged.highSlippageBasisPoints,
    maximumOpportunityAgeMilliseconds:
      merged.maximumOpportunityAgeMilliseconds,
    preferBundlesForFlashLiquidity:
      merged.preferBundlesForFlashLiquidity,
  });
}

function modeForRelay(
  relay: MevRelayDescriptor,
): TransactionSubmissionMode {
  switch (relay.kind) {
    case MevRelayKind.BUILDER_BUNDLE:
      return TransactionSubmissionMode.BUILDER_BUNDLE;
    case MevRelayKind.PRIVATE_RPC:
      return TransactionSubmissionMode.RPC_PRIVATE_TRANSACTION;
    case MevRelayKind.PRIVATE_TRANSACTION:
      return TransactionSubmissionMode.PRIVATE_RELAY;
  }
}

function validateRelayDescriptor(
  descriptor: MevRelayDescriptor,
): void {
  if (descriptor.id.trim().length === 0) {
    throw new MevProtectionError(
      MevProtectionErrorCode.INVALID_CONFIGURATION,
      "Relay id cannot be empty.",
    );
  }

  if (descriptor.name.trim().length === 0) {
    throw new MevProtectionError(
      MevProtectionErrorCode.INVALID_CONFIGURATION,
      `Relay ${descriptor.id} must have a name.`,
    );
  }

  if (
    !Number.isSafeInteger(descriptor.priority) ||
    descriptor.priority < 0
  ) {
    throw new MevProtectionError(
      MevProtectionErrorCode.INVALID_CONFIGURATION,
      `Relay ${descriptor.id} priority must be a non-negative safe integer.`,
    );
  }

  if (descriptor.supportedChainIds.length === 0) {
    throw new MevProtectionError(
      MevProtectionErrorCode.INVALID_CONFIGURATION,
      `Relay ${descriptor.id} must support at least one chain.`,
    );
  }
}

function clonePrivatePreferences(
  preferences: PrivateTransactionPreferences | undefined,
): PrivateTransactionPreferences | undefined {
  if (preferences === undefined) {
    return undefined;
  }

  return Object.freeze({
    maximumBlockNumber: preferences.maximumBlockNumber,
    minimumTimestampSeconds:
      preferences.minimumTimestampSeconds,
    maximumTimestampSeconds:
      preferences.maximumTimestampSeconds,
    allowReverts: preferences.allowReverts,
    replacementUuid: preferences.replacementUuid,
    builderNames:
      preferences.builderNames === undefined
        ? undefined
        : Object.freeze([...preferences.builderNames]),
    metadata: freezeMetadata(preferences.metadata),
  });
}

function buildSubmissionRequest(
  request: MevProtectionRequest,
  mode: TransactionSubmissionMode,
  metadata?: CrossDexArbitrageMetadata,
): TransactionSubmissionRequest {
  return Object.freeze({
    submissionId: request.submissionId,
    mode,
    signedTransaction: request.signedTransaction,
    privatePreferences:
      mode === TransactionSubmissionMode.PUBLIC_MEMPOOL ||
      mode === TransactionSubmissionMode.PAPER
        ? undefined
        : clonePrivatePreferences(
            request.privatePreferences,
          ),
    metadata: mergeMetadata(
      request.metadata,
      metadata,
    ),
  });
}

function assertRelayResponse(
  response: MevRelaySubmissionResponse,
  relay: MevRelayDescriptor,
  request: MevProtectionRequest,
): void {
  if (
    response === null ||
    typeof response !== "object" ||
    typeof response.accepted !== "boolean"
  ) {
    throw new MevProtectionError(
      MevProtectionErrorCode.MALFORMED_RELAY_RESULT,
      `Relay ${relay.id} returned a malformed response.`,
      {
        submissionId: request.submissionId,
        chainId:
          request.signedTransaction.transaction.chainId,
        details: response,
      },
    );
  }

  if (
    response.accepted &&
    response.transactionHash === undefined &&
    response.relayBundleHash === undefined &&
    response.providerRequestId === undefined
  ) {
    throw new MevProtectionError(
      MevProtectionErrorCode.MALFORMED_RELAY_RESULT,
      `Relay ${relay.id} accepted the request without an identifier.`,
      {
        submissionId: request.submissionId,
        chainId:
          request.signedTransaction.transaction.chainId,
        details: response,
      },
    );
  }
}

export class DefaultMevRiskAssessor {
  public constructor(
    private readonly options: NormalizedOptions,
  ) {}

  public assess(
    input: MevRiskAssessmentInput,
  ): MevRiskAssessment {
    const reasons: string[] = [];
    let score = 0;

    const expectedProfitWei =
      input.expectedProfitWei ?? (0n as WeiAmount);
    const extractableValueWei =
      input.maximumExtractableValueWei ??
      (0n as WeiAmount);
    const priceImpact =
      input.estimatedPriceImpactBasisPoints ?? 0n;
    const slippage =
      input.estimatedSlippageBasisPoints ?? 0n;
    const routeLegCount = input.routeLegCount ?? 1;
    const opportunityAge =
      input.opportunityAgeMilliseconds ?? 0;

    if (
      expectedProfitWei >=
      this.options.privateSubmissionProfitThresholdWei
    ) {
      score += 25;
      reasons.push(
        "Expected profit meets the private-submission threshold.",
      );
    }

    if (
      extractableValueWei >=
      this.options.privateSubmissionMevThresholdWei
    ) {
      score += 30;
      reasons.push(
        "Estimated extractable value meets the private-submission threshold.",
      );
    }

    if (
      priceImpact >=
      this.options.highPriceImpactBasisPoints
    ) {
      score += 20;
      reasons.push(
        "Estimated price impact is elevated.",
      );
    }

    if (
      slippage >=
      this.options.highSlippageBasisPoints
    ) {
      score += 15;
      reasons.push(
        "Configured or estimated slippage is elevated.",
      );
    }

    if (routeLegCount >= 3) {
      score += 10;
      reasons.push(
        "The route has multiple observable execution legs.",
      );
    }

    if (input.usesFlashLiquidity === true) {
      score += 20;
      reasons.push(
        "Flash liquidity increases atomic execution sensitivity.",
      );
    }

    if (
      opportunityAge >=
      this.options.maximumOpportunityAgeMilliseconds
    ) {
      score += 15;
      reasons.push(
        "The opportunity is close to or beyond its maximum safe age.",
      );
    }

    if (input.publicMempoolRequested === true) {
      score += 10;
      reasons.push(
        "Public mempool submission exposes the transaction before inclusion.",
      );
    }

    score = Math.min(score, 100);

    let riskLevel: MevProtectionRiskLevel;
    let decision: MevProtectionDecision;

    if (score >= 75) {
      riskLevel = MevProtectionRiskLevel.CRITICAL;
      decision = MevProtectionDecision.PRIVATE_REQUIRED;
    } else if (score >= 50) {
      riskLevel = MevProtectionRiskLevel.HIGH;
      decision = MevProtectionDecision.PRIVATE_REQUIRED;
    } else if (score >= 25) {
      riskLevel = MevProtectionRiskLevel.MODERATE;
      decision = MevProtectionDecision.PRIVATE_PREFERRED;
    } else {
      riskLevel = MevProtectionRiskLevel.LOW;
      decision = MevProtectionDecision.PUBLIC_ALLOWED;
    }

    const recommendedSubmissionMode =
      input.usesFlashLiquidity === true &&
      this.options.preferBundlesForFlashLiquidity
        ? TransactionSubmissionMode.BUILDER_BUNDLE
        : decision ===
            MevProtectionDecision.PUBLIC_ALLOWED
          ? TransactionSubmissionMode.PUBLIC_MEMPOOL
          : TransactionSubmissionMode.PRIVATE_RELAY;

    return Object.freeze({
      riskLevel,
      decision,
      score,
      reasons: Object.freeze(reasons),
      recommendedSubmissionMode,
      metadata: mergeMetadata(
        input.metadata,
        Object.freeze({
          mevRiskScore: score,
          routeLegCount,
          usesFlashLiquidity:
            input.usesFlashLiquidity ?? false,
        }),
      ),
    });
  }
}

export class MevProtectionManager {
  private readonly options: NormalizedOptions;
  private readonly relays: readonly MevRelay[];
  private readonly riskAssessor: DefaultMevRiskAssessor;

  public constructor(
    relays: readonly MevRelay[],
    private readonly publicSubmitter: PublicTransactionSubmitter,
    private readonly clock: MevProtectionClock,
    options: MevProtectionManagerOptions = {},
  ) {
    if (!Array.isArray(relays)) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_DEPENDENCIES,
        "relays must be an array.",
      );
    }

    if (
      publicSubmitter === null ||
      typeof publicSubmitter !== "object" ||
      typeof publicSubmitter.submit !== "function"
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_DEPENDENCIES,
        "A public transaction submitter is required.",
      );
    }

    if (
      clock === null ||
      typeof clock !== "object" ||
      typeof clock.nowMilliseconds !== "function"
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_DEPENDENCIES,
        "A deterministic clock is required.",
      );
    }

    const seenRelayIds = new Set<string>();

    for (const relay of relays) {
      if (
        relay === null ||
        typeof relay !== "object" ||
        typeof relay.submit !== "function" ||
        typeof relay.getState !== "function"
      ) {
        throw new MevProtectionError(
          MevProtectionErrorCode.INVALID_DEPENDENCIES,
          "Each relay must implement submit() and getState().",
        );
      }

      validateRelayDescriptor(relay.descriptor);

      if (seenRelayIds.has(relay.descriptor.id)) {
        throw new MevProtectionError(
          MevProtectionErrorCode.INVALID_CONFIGURATION,
          `Duplicate relay id: ${relay.descriptor.id}.`,
        );
      }

      seenRelayIds.add(relay.descriptor.id);
    }

    this.options = normalizeOptions(options);
    this.relays = Object.freeze([...relays]);
    this.riskAssessor = new DefaultMevRiskAssessor(
      this.options,
    );
  }

  public assess(
    request: MevProtectionRequest,
  ): MevRiskAssessment {
    this.validateRequest(request);

    return this.riskAssessor.assess({
      chainId:
        request.signedTransaction.transaction.chainId,
      signedTransaction: request.signedTransaction,
      expectedProfitWei:
        request.riskInput?.expectedProfitWei,
      maximumExtractableValueWei:
        request.riskInput?.maximumExtractableValueWei,
      estimatedPriceImpactBasisPoints:
        request.riskInput
          ?.estimatedPriceImpactBasisPoints,
      estimatedSlippageBasisPoints:
        request.riskInput
          ?.estimatedSlippageBasisPoints,
      routeLegCount: request.riskInput?.routeLegCount,
      usesFlashLiquidity:
        request.riskInput?.usesFlashLiquidity,
      opportunityAgeMilliseconds:
        request.riskInput
          ?.opportunityAgeMilliseconds,
      publicMempoolRequested:
        request.requestedMode ===
        TransactionSubmissionMode.PUBLIC_MEMPOOL,
      metadata: mergeMetadata(
        request.metadata,
        request.riskInput?.metadata,
      ),
    });
  }

  public async submit(
    request: MevProtectionRequest,
  ): Promise<MevProtectionResult> {
    this.validateRequest(request);

    const assessment = this.assess(request);

    if (
      assessment.decision ===
      MevProtectionDecision.REJECTED
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "MEV protection policy rejected the submission.",
        {
          submissionId: request.submissionId,
          chainId:
            request.signedTransaction.transaction.chainId,
          details: assessment,
        },
      );
    }

    const requestedPublic =
      request.requestedMode ===
      TransactionSubmissionMode.PUBLIC_MEMPOOL;

    const privateRequired =
      assessment.decision ===
      MevProtectionDecision.PRIVATE_REQUIRED;

    if (requestedPublic && privateRequired) {
      return this.submitPrivately(
        request,
        assessment,
      );
    }

    if (
      request.requestedMode ===
        TransactionSubmissionMode.PAPER ||
      (requestedPublic &&
        assessment.decision ===
          MevProtectionDecision.PUBLIC_ALLOWED)
    ) {
      return this.submitPublicly(
        request,
        assessment,
        false,
        [],
      );
    }

    return this.submitPrivately(
      request,
      assessment,
    );
  }

  private async submitPrivately(
    request: MevProtectionRequest,
    assessment: MevRiskAssessment,
  ): Promise<MevProtectionResult> {
    const chainId =
      request.signedTransaction.transaction.chainId;
    const eligibleRelays =
      this.selectEligibleRelays(
        chainId,
        request,
        assessment,
      );
    const attempts: MevProtectionAttempt[] = [];

    if (eligibleRelays.length === 0) {
      return this.handlePrivateFailure(
        request,
        assessment,
        attempts,
        MevProtectionErrorCode.NO_ELIGIBLE_RELAY,
        "No eligible MEV relay is available.",
      );
    }

    const maximumAttempts = Math.min(
      this.options.maximumRelayAttempts,
      eligibleRelays.length,
    );

    for (
      let index = 0;
      index < maximumAttempts;
      index += 1
    ) {
      const relay = eligibleRelays[index];
      const attemptNumber = index + 1;
      const startedAtMilliseconds =
        this.clock.nowMilliseconds();
      let response: MevRelaySubmissionResponse;

      try {
        response = await relay.submit(
          Object.freeze({
            request: buildSubmissionRequest(
              request,
              modeForRelay(relay.descriptor),
              Object.freeze({
                mevProtected: true,
                relayId: relay.descriptor.id,
              }),
            ),
            targetBlockNumber:
              request.targetBlockNumber,
            timeoutMilliseconds:
              this.options.timeoutMilliseconds,
            attemptNumber,
            metadata: mergeMetadata(
              request.metadata,
              relay.descriptor.metadata,
            ),
          }),
        );

        assertRelayResponse(
          response,
          relay.descriptor,
          request,
        );
      } catch (cause) {
        const completedAtMilliseconds =
          this.clock.nowMilliseconds();

        attempts.push(
          Object.freeze({
            relayId: relay.descriptor.id,
            relayName: relay.descriptor.name,
            mode: modeForRelay(relay.descriptor),
            attemptNumber,
            accepted: false,
            startedAtMilliseconds,
            completedAtMilliseconds,
            latencyMilliseconds: Math.max(
              0,
              Number(completedAtMilliseconds) -
                Number(startedAtMilliseconds),
            ),
            errorCode:
              cause instanceof MevProtectionError
                ? cause.code
                : MevProtectionErrorCode.RELAY_SUBMISSION_FAILED,
            errorMessage:
              cause instanceof Error
                ? cause.message
                : "Relay submission failed.",
            retryable: true,
            metadata: freezeMetadata(
              relay.descriptor.metadata,
            ),
          }),
        );

        continue;
      }

      const completedAtMilliseconds =
        this.clock.nowMilliseconds();
      const latencyMilliseconds =
        response.latencyMilliseconds ??
        Math.max(
          0,
          Number(completedAtMilliseconds) -
            Number(startedAtMilliseconds),
        );

      attempts.push(
        Object.freeze({
          relayId: relay.descriptor.id,
          relayName: relay.descriptor.name,
          mode: modeForRelay(relay.descriptor),
          attemptNumber,
          accepted: response.accepted,
          startedAtMilliseconds,
          completedAtMilliseconds,
          latencyMilliseconds,
          errorCode: response.errorCode,
          errorMessage: response.errorMessage,
          retryable: response.retryable ?? false,
          metadata: mergeMetadata(
            relay.descriptor.metadata,
            response.metadata,
          ),
        }),
      );

      if (response.accepted) {
        const submission: TransactionSubmissionResult =
          Object.freeze({
            submissionId: request.submissionId,
            mode: modeForRelay(relay.descriptor),
            accepted: true,
            transactionHash:
              response.transactionHash,
            relayBundleHash:
              response.relayBundleHash,
            providerRequestId:
              response.providerRequestId,
            submittedAtMilliseconds:
              completedAtMilliseconds,
            targetBlockNumber:
              response.targetBlockNumber ??
              request.targetBlockNumber,
            metadata: mergeMetadata(
              request.metadata,
              response.metadata,
              Object.freeze({
                mevProtected: true,
                relayId: relay.descriptor.id,
                relayAttemptCount:
                  attempts.length,
              }),
            ),
          });

        return Object.freeze({
          submission,
          assessment,
          protected: true,
          selectedRelayId: relay.descriptor.id,
          attempts: Object.freeze([...attempts]),
          publicFallbackUsed: false,
          metadata: mergeMetadata(
            request.metadata,
            Object.freeze({
              mevProtectionDecision:
                assessment.decision,
              mevRiskLevel: assessment.riskLevel,
              mevRiskScore: assessment.score,
            }),
          ),
        });
      }

      if (response.retryable === false) {
        break;
      }
    }

    return this.handlePrivateFailure(
      request,
      assessment,
      attempts,
      MevProtectionErrorCode.ALL_RELAYS_FAILED,
      "All eligible MEV relay submissions failed.",
    );
  }

  private async handlePrivateFailure(
    request: MevProtectionRequest,
    assessment: MevRiskAssessment,
    attempts: readonly MevProtectionAttempt[],
    errorCode: MevProtectionErrorCode,
    message: string,
  ): Promise<MevProtectionResult> {
    const fallbackAllowed =
      this.options.publicFallbackEnabled &&
      request.allowPublicFallback === true &&
      assessment.decision !==
        MevProtectionDecision.PRIVATE_REQUIRED;

    if (!fallbackAllowed) {
      throw new MevProtectionError(
        assessment.decision ===
          MevProtectionDecision.PRIVATE_REQUIRED
          ? MevProtectionErrorCode.PUBLIC_FALLBACK_FORBIDDEN
          : errorCode,
        message,
        {
          submissionId: request.submissionId,
          chainId:
            request.signedTransaction.transaction.chainId,
          details: Object.freeze({
            attempts: attempts.length,
            assessment,
          }),
        },
      );
    }

    return this.submitPublicly(
      request,
      assessment,
      true,
      attempts,
    );
  }

  private async submitPublicly(
    request: MevProtectionRequest,
    assessment: MevRiskAssessment,
    publicFallbackUsed: boolean,
    existingAttempts: readonly MevProtectionAttempt[],
  ): Promise<MevProtectionResult> {
    const startedAtMilliseconds =
      this.clock.nowMilliseconds();
    const publicRequest = buildSubmissionRequest(
      request,
      request.requestedMode ===
        TransactionSubmissionMode.PAPER
        ? TransactionSubmissionMode.PAPER
        : TransactionSubmissionMode.PUBLIC_MEMPOOL,
      Object.freeze({
        mevProtected: false,
        publicFallbackUsed,
      }),
    );

    const submission =
      await this.publicSubmitter.submit(publicRequest);
    const completedAtMilliseconds =
      this.clock.nowMilliseconds();

    if (
      submission.submissionId !==
      request.submissionId
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "Public submitter returned a mismatched submissionId.",
        {
          submissionId: request.submissionId,
          chainId:
            request.signedTransaction.transaction.chainId,
          details: submission,
        },
      );
    }

    const publicAttempt: MevProtectionAttempt =
      Object.freeze({
        mode: publicRequest.mode,
        attemptNumber: existingAttempts.length + 1,
        accepted: submission.accepted,
        startedAtMilliseconds,
        completedAtMilliseconds,
        latencyMilliseconds: Math.max(
          0,
          Number(completedAtMilliseconds) -
            Number(startedAtMilliseconds),
        ),
        errorCode: submission.errorCode,
        errorMessage: submission.errorMessage,
        retryable: false,
        metadata: freezeMetadata(
          submission.metadata,
        ),
      });

    return Object.freeze({
      submission: Object.freeze({
        ...submission,
        metadata: mergeMetadata(
          request.metadata,
          submission.metadata,
          Object.freeze({
            mevProtected: false,
            publicFallbackUsed,
          }),
        ),
      }),
      assessment,
      protected: false,
      attempts: Object.freeze([
        ...existingAttempts,
        publicAttempt,
      ]),
      publicFallbackUsed,
      metadata: mergeMetadata(
        request.metadata,
        Object.freeze({
          mevProtectionDecision:
            assessment.decision,
          mevRiskLevel: assessment.riskLevel,
          mevRiskScore: assessment.score,
        }),
      ),
    });
  }

  private selectEligibleRelays(
    chainId: ChainId,
    request: MevProtectionRequest,
    assessment: MevRiskAssessment,
  ): readonly MevRelay[] {
    const now = this.clock.nowMilliseconds();
    const preferredMode =
      request.requestedMode ===
        TransactionSubmissionMode.PUBLIC_MEMPOOL
        ? assessment.recommendedSubmissionMode
        : request.requestedMode;

    return Object.freeze(
      this.relays
        .filter((relay) => {
          const descriptor = relay.descriptor;
          const state = relay.getState();

          if (
            !descriptor.enabled ||
            !descriptor.supportedChainIds.includes(
              chainId,
            )
          ) {
            return false;
          }

          if (
            state.health === MevRelayHealth.DISABLED ||
            state.health ===
              MevRelayHealth.UNAVAILABLE
          ) {
            return false;
          }

          if (
            state.cooldownUntilMilliseconds !==
              undefined &&
            state.cooldownUntilMilliseconds > now
          ) {
            return false;
          }

          if (
            state.consecutiveFailures >=
            this.options
              .maximumConsecutiveRelayFailures
          ) {
            return false;
          }

          if (
            request.privatePreferences
              ?.replacementUuid !== undefined &&
            !descriptor.supportsReplacement
          ) {
            return false;
          }

          if (
            request.privatePreferences
              ?.builderNames !== undefined &&
            request.privatePreferences.builderNames
              .length > 0 &&
            !descriptor.supportsBuilderSelection
          ) {
            return false;
          }

          if (
            request.targetBlockNumber !== undefined &&
            descriptor.maximumTargetBlockDistance !==
              undefined
          ) {
            const maximumBlockNumber =
              request.privatePreferences
                ?.maximumBlockNumber;

            if (
              maximumBlockNumber !== undefined &&
              maximumBlockNumber -
                request.targetBlockNumber >
                BigInt(
                  descriptor.maximumTargetBlockDistance,
                )
            ) {
              return false;
            }
          }

          return true;
        })
        .sort((left, right) => {
          const leftPreferred =
            modeForRelay(left.descriptor) ===
            preferredMode;
          const rightPreferred =
            modeForRelay(right.descriptor) ===
            preferredMode;

          if (leftPreferred !== rightPreferred) {
            return leftPreferred ? -1 : 1;
          }

          const leftState = left.getState();
          const rightState = right.getState();

          if (leftState.health !== rightState.health) {
            return leftState.health ===
              MevRelayHealth.HEALTHY
              ? -1
              : 1;
          }

          if (
            left.descriptor.priority !==
            right.descriptor.priority
          ) {
            return (
              left.descriptor.priority -
              right.descriptor.priority
            );
          }

          if (
            leftState.consecutiveFailures !==
            rightState.consecutiveFailures
          ) {
            return (
              leftState.consecutiveFailures -
              rightState.consecutiveFailures
            );
          }

          return left.descriptor.id.localeCompare(
            right.descriptor.id,
          );
        }),
    );
  }

  private validateRequest(
    request: MevProtectionRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "MEV protection request is required.",
      );
    }

    const transaction =
      request.signedTransaction?.transaction;

    if (
      transaction === undefined ||
      transaction.chainId === undefined
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "A signed EVM transaction is required.",
        {
          submissionId: request.submissionId,
        },
      );
    }

    if (
      !Object.values(
        TransactionSubmissionMode,
      ).includes(request.requestedMode)
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "requestedMode is invalid.",
        {
          submissionId: request.submissionId,
          chainId: transaction.chainId,
        },
      );
    }

    if (
      request.requestedMode ===
        TransactionSubmissionMode.PUBLIC_MEMPOOL &&
      request.privatePreferences !== undefined
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "Private transaction preferences cannot accompany a public-mempool request.",
        {
          submissionId: request.submissionId,
          chainId: transaction.chainId,
        },
      );
    }

    if (
      request.targetBlockNumber !== undefined &&
      request.targetBlockNumber < 0n
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "targetBlockNumber cannot be negative.",
        {
          submissionId: request.submissionId,
          chainId: transaction.chainId,
        },
      );
    }

    const age =
      request.riskInput
        ?.opportunityAgeMilliseconds;

    if (
      age !== undefined &&
      (!Number.isSafeInteger(age) || age < 0)
    ) {
      throw new MevProtectionError(
        MevProtectionErrorCode.INVALID_REQUEST,
        "opportunityAgeMilliseconds must be a non-negative safe integer.",
        {
          submissionId: request.submissionId,
          chainId: transaction.chainId,
        },
      );
    }
  }
}

export function createMevProtectionManager(
  relays: readonly MevRelay[],
  publicSubmitter: PublicTransactionSubmitter,
  clock: MevProtectionClock,
  options: MevProtectionManagerOptions = {},
): MevProtectionManager {
  return new MevProtectionManager(
    relays,
    publicSubmitter,
    clock,
    options,
  );
}

export {
  MevProtectionManager as CrossDexMevProtectionManager,
};