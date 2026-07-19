import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  CrossChainExecutionRuntime,
} from "./cross-chain-execution-state-machine";

export type CrossChainSettlementVerificationStatus =
  | "VERIFIED"
  | "PENDING_CONFIRMATIONS"
  | "OUTPUT_BELOW_MINIMUM"
  | "TRANSACTION_MISSING"
  | "BALANCE_MISMATCH"
  | "RUNTIME_NOT_COMPLETED"
  | "FAILED";

export interface CrossChainSettlementTransactionEvidence {
  readonly stepId: CrossChainIdentifier;
  readonly networkId: CrossChainIdentifier;
  readonly transactionHash: string | null;
  readonly blockNumber: number | null;
  readonly confirmationCount: number;
  readonly successful: boolean;
  readonly observedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CrossChainSettlementBalanceEvidence {
  readonly networkId: CrossChainIdentifier;
  readonly accountId: CrossChainIdentifier;
  readonly assetId: CrossChainIdentifier;
  readonly expectedAmountAtomic: string;
  readonly actualAmountAtomic: string;
  readonly observedAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CrossChainSettlementVerificationPolicy {
  readonly requiredConfirmations: number;
  readonly allowMissingTransactionHash?: boolean;
  readonly allowOverSettlement?: boolean;
  readonly atomicTolerance?: string;
}

export interface CrossChainSettlementVerificationRequest {
  readonly runtime: CrossChainExecutionRuntime;
  readonly transactions:
    readonly CrossChainSettlementTransactionEvidence[];
  readonly balances:
    readonly CrossChainSettlementBalanceEvidence[];
  readonly verifiedAt: number;
  readonly policy:
    CrossChainSettlementVerificationPolicy;
}

export interface CrossChainSettlementTransactionResult {
  readonly stepId: CrossChainIdentifier;
  readonly networkId: CrossChainIdentifier;
  readonly transactionHash: string | null;
  readonly blockNumber: number | null;
  readonly confirmationCount: number;
  readonly requiredConfirmations: number;
  readonly successful: boolean;
  readonly status:
    | "VERIFIED"
    | "PENDING_CONFIRMATIONS"
    | "TRANSACTION_MISSING"
    | "FAILED";
  readonly reasons: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainSettlementBalanceResult {
  readonly networkId: CrossChainIdentifier;
  readonly accountId: CrossChainIdentifier;
  readonly assetId: CrossChainIdentifier;
  readonly expectedAmountAtomic: string;
  readonly actualAmountAtomic: string;
  readonly differenceAtomic: string;
  readonly withinTolerance: boolean;
  readonly status:
    | "VERIFIED"
    | "OUTPUT_BELOW_MINIMUM"
    | "BALANCE_MISMATCH";
  readonly reasons: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainSettlementVerificationResult {
  readonly verificationId: CrossChainIdentifier;
  readonly planId: CrossChainIdentifier;
  readonly opportunityId: CrossChainIdentifier;
  readonly verifiedAt: number;
  readonly status: CrossChainSettlementVerificationStatus;
  readonly transactionResults:
    readonly CrossChainSettlementTransactionResult[];
  readonly balanceResults:
    readonly CrossChainSettlementBalanceResult[];
  readonly reasons: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainSettlementVerifierOptions {
  readonly verificationIdFactory?: (
    request: CrossChainSettlementVerificationRequest,
  ) => CrossChainIdentifier;
}

export class CrossChainSettlementVerificationError
  extends Error {
  public readonly code: string;
  public readonly referenceId:
    CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name =
      "CrossChainSettlementVerificationError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
}

function freezeRecord(
  value:
    Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(value ?? {}),
  });
}

function compareStrings(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainSettlementVerificationError(
      "INVALID_IDENTIFIER",
      `${fieldName} must not be empty.`,
      value,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CrossChainSettlementVerificationError(
      "INVALID_INTEGER",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertAtomicAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^\d+$/.test(value)) {
    throw new CrossChainSettlementVerificationError(
      "INVALID_ATOMIC_AMOUNT",
      `${fieldName} must be a non-negative integer string.`,
    );
  }
}

function absoluteBigInt(
  value: bigint,
): bigint {
  return value < 0n ? -value : value;
}

function signedBigIntString(
  value: bigint,
): string {
  return value.toString();
}

export class DeterministicCrossChainSettlementVerifier {
  private readonly verificationIdFactory: (
    request: CrossChainSettlementVerificationRequest,
  ) => CrossChainIdentifier;

  public constructor(
    options: CrossChainSettlementVerifierOptions = {},
  ) {
    this.verificationIdFactory =
      options.verificationIdFactory ??
      ((request) =>
        [
          "cross-chain-settlement",
          request.runtime.plan.planId,
          request.verifiedAt.toString(),
        ].join(":"));
  }

  public verify(
    request: CrossChainSettlementVerificationRequest,
  ): CrossChainSettlementVerificationResult {
    this.validateRequest(request);

    const verificationId =
      this.verificationIdFactory(request);

    assertNonEmptyString(
      verificationId,
      "verificationId",
    );

    const transactionResults =
      this.verifyTransactions(request);

    const balanceResults =
      this.verifyBalances(request);

    const reasons = new Set<string>();

    if (
      request.runtime.status !== "COMPLETED"
    ) {
      reasons.add("RUNTIME_NOT_COMPLETED");
    }

    for (const result of transactionResults) {
      for (const reason of result.reasons) {
        reasons.add(reason);
      }
    }

    for (const result of balanceResults) {
      for (const reason of result.reasons) {
        reasons.add(reason);
      }
    }

    const status = this.deriveStatus(
      request.runtime,
      transactionResults,
      balanceResults,
    );

    return Object.freeze({
      verificationId,
      planId: request.runtime.plan.planId,
      opportunityId:
        request.runtime.plan.opportunityId,
      verifiedAt: request.verifiedAt,
      status,
      transactionResults:
        freezeArray(transactionResults),
      balanceResults:
        freezeArray(balanceResults),
      reasons: freezeArray(
        [...reasons].sort(compareStrings),
      ),
      metadata: Object.freeze({
        transactionEvidenceCount:
          request.transactions.length,
        balanceEvidenceCount:
          request.balances.length,
        runtimeVersion:
          request.runtime.version,
      }),
    });
  }

  private verifyTransactions(
    request: CrossChainSettlementVerificationRequest,
  ): readonly CrossChainSettlementTransactionResult[] {
    const results =
      request.transactions.map(
        (
          evidence,
        ): CrossChainSettlementTransactionResult => {
          const reasons: string[] = [];

          let status:
            CrossChainSettlementTransactionResult["status"] =
              "VERIFIED";

          if (!evidence.successful) {
            status = "FAILED";
            reasons.push(
              "TRANSACTION_EXECUTION_FAILED",
            );
          } else if (
            evidence.transactionHash === null &&
            request.policy
              .allowMissingTransactionHash !== true
          ) {
            status = "TRANSACTION_MISSING";
            reasons.push(
              "TRANSACTION_HASH_MISSING",
            );
          } else if (
            evidence.confirmationCount <
            request.policy.requiredConfirmations
          ) {
            status = "PENDING_CONFIRMATIONS";
            reasons.push(
              "INSUFFICIENT_CONFIRMATIONS",
            );
          }

          return Object.freeze({
            stepId: evidence.stepId,
            networkId: evidence.networkId,
            transactionHash:
              evidence.transactionHash,
            blockNumber: evidence.blockNumber,
            confirmationCount:
              evidence.confirmationCount,
            requiredConfirmations:
              request.policy
                .requiredConfirmations,
            successful: evidence.successful,
            status,
            reasons: freezeArray(
              reasons.sort(compareStrings),
            ),
            metadata:
              freezeRecord(evidence.metadata),
          });
        },
      );

    return freezeArray(
      [...results].sort((left, right) =>
        compareStrings(
          left.stepId,
          right.stepId,
        ),
      ),
    );
  }

  private verifyBalances(
    request: CrossChainSettlementVerificationRequest,
  ): readonly CrossChainSettlementBalanceResult[] {
    const tolerance = BigInt(
      request.policy.atomicTolerance ?? "0",
    );

    const results =
      request.balances.map(
        (
          evidence,
        ): CrossChainSettlementBalanceResult => {
          const expected = BigInt(
            evidence.expectedAmountAtomic,
          );
          const actual = BigInt(
            evidence.actualAmountAtomic,
          );

          const difference = actual - expected;
          const absoluteDifference =
            absoluteBigInt(difference);

          const allowOverSettlement =
            request.policy.allowOverSettlement ??
            true;

          const withinTolerance =
            allowOverSettlement && actual >= expected
              ? true
              : absoluteDifference <= tolerance;

          const reasons: string[] = [];

          let status:
            CrossChainSettlementBalanceResult["status"] =
              "VERIFIED";

          if (!withinTolerance) {
            if (actual < expected) {
              status = "OUTPUT_BELOW_MINIMUM";
              reasons.push(
                "ACTUAL_BALANCE_BELOW_EXPECTED",
              );
            } else {
              status = "BALANCE_MISMATCH";
              reasons.push(
                "ACTUAL_BALANCE_EXCEEDS_TOLERANCE",
              );
            }
          }

          return Object.freeze({
            networkId: evidence.networkId,
            accountId: evidence.accountId,
            assetId: evidence.assetId,
            expectedAmountAtomic:
              evidence.expectedAmountAtomic,
            actualAmountAtomic:
              evidence.actualAmountAtomic,
            differenceAtomic:
              signedBigIntString(difference),
            withinTolerance,
            status,
            reasons: freezeArray(
              reasons.sort(compareStrings),
            ),
            metadata:
              freezeRecord(evidence.metadata),
          });
        },
      );

    return freezeArray(
      [...results].sort((left, right) => {
        const networkComparison =
          compareStrings(
            left.networkId,
            right.networkId,
          );

        if (networkComparison !== 0) {
          return networkComparison;
        }

        const accountComparison =
          compareStrings(
            left.accountId,
            right.accountId,
          );

        if (accountComparison !== 0) {
          return accountComparison;
        }

        return compareStrings(
          left.assetId,
          right.assetId,
        );
      }),
    );
  }

  private deriveStatus(
    runtime: CrossChainExecutionRuntime,
    transactionResults:
      readonly CrossChainSettlementTransactionResult[],
    balanceResults:
      readonly CrossChainSettlementBalanceResult[],
  ): CrossChainSettlementVerificationStatus {
    if (runtime.status !== "COMPLETED") {
      return "RUNTIME_NOT_COMPLETED";
    }

    if (
      transactionResults.some(
        (result) => result.status === "FAILED",
      )
    ) {
      return "FAILED";
    }

    if (
      transactionResults.some(
        (result) =>
          result.status ===
          "TRANSACTION_MISSING",
      )
    ) {
      return "TRANSACTION_MISSING";
    }

    if (
      transactionResults.some(
        (result) =>
          result.status ===
          "PENDING_CONFIRMATIONS",
      )
    ) {
      return "PENDING_CONFIRMATIONS";
    }

    if (
      balanceResults.some(
        (result) =>
          result.status ===
          "OUTPUT_BELOW_MINIMUM",
      )
    ) {
      return "OUTPUT_BELOW_MINIMUM";
    }

    if (
      balanceResults.some(
        (result) =>
          result.status ===
          "BALANCE_MISMATCH",
      )
    ) {
      return "BALANCE_MISMATCH";
    }

    return "VERIFIED";
  }

  private validateRequest(
    request: CrossChainSettlementVerificationRequest,
  ): void {
    assertNonNegativeInteger(
      request.verifiedAt,
      "request.verifiedAt",
    );

    assertNonNegativeInteger(
      request.policy.requiredConfirmations,
      "request.policy.requiredConfirmations",
    );

    if (
      request.policy.atomicTolerance !==
      undefined
    ) {
      assertAtomicAmount(
        request.policy.atomicTolerance,
        "request.policy.atomicTolerance",
      );
    }

    if (
      request.verifiedAt <
      request.runtime.updatedAt
    ) {
      throw new CrossChainSettlementVerificationError(
        "NON_MONOTONIC_TIMESTAMP",
        "verifiedAt must not be earlier than runtime.updatedAt.",
        request.runtime.plan.planId,
      );
    }

    const knownStepIds = new Set(
      request.runtime.steps.map(
        (step) => step.step.stepId,
      ),
    );

    const seenTransactionStepIds =
      new Set<CrossChainIdentifier>();

    request.transactions.forEach(
      (evidence, index) => {
        assertNonEmptyString(
          evidence.stepId,
          `transactions[${index}].stepId`,
        );
        assertNonEmptyString(
          evidence.networkId,
          `transactions[${index}].networkId`,
        );
        assertNonNegativeInteger(
          evidence.confirmationCount,
          `transactions[${index}].confirmationCount`,
        );
        assertNonNegativeInteger(
          evidence.observedAt,
          `transactions[${index}].observedAt`,
        );

        if (
          evidence.blockNumber !== null
        ) {
          assertNonNegativeInteger(
            evidence.blockNumber,
            `transactions[${index}].blockNumber`,
          );
        }

        if (
          evidence.transactionHash !== null
        ) {
          assertNonEmptyString(
            evidence.transactionHash,
            `transactions[${index}].transactionHash`,
          );
        }

        if (
          !knownStepIds.has(evidence.stepId)
        ) {
          throw new CrossChainSettlementVerificationError(
            "UNKNOWN_STEP_ID",
            `Transaction evidence references unknown step "${evidence.stepId}".`,
            evidence.stepId,
          );
        }

        if (
          seenTransactionStepIds.has(
            evidence.stepId,
          )
        ) {
          throw new CrossChainSettlementVerificationError(
            "DUPLICATE_TRANSACTION_EVIDENCE",
            `Transaction evidence for step "${evidence.stepId}" was provided more than once.`,
            evidence.stepId,
          );
        }

        seenTransactionStepIds.add(
          evidence.stepId,
        );
      },
    );

    const seenBalanceKeys = new Set<string>();

    request.balances.forEach(
      (evidence, index) => {
        assertNonEmptyString(
          evidence.networkId,
          `balances[${index}].networkId`,
        );
        assertNonEmptyString(
          evidence.accountId,
          `balances[${index}].accountId`,
        );
        assertNonEmptyString(
          evidence.assetId,
          `balances[${index}].assetId`,
        );
        assertAtomicAmount(
          evidence.expectedAmountAtomic,
          `balances[${index}].expectedAmountAtomic`,
        );
        assertAtomicAmount(
          evidence.actualAmountAtomic,
          `balances[${index}].actualAmountAtomic`,
        );
        assertNonNegativeInteger(
          evidence.observedAt,
          `balances[${index}].observedAt`,
        );

        const key = [
          evidence.networkId,
          evidence.accountId,
          evidence.assetId,
        ].join(":");

        if (seenBalanceKeys.has(key)) {
          throw new CrossChainSettlementVerificationError(
            "DUPLICATE_BALANCE_EVIDENCE",
            `Duplicate balance evidence "${key}".`,
            key,
          );
        }

        seenBalanceKeys.add(key);
      },
    );
  }
}