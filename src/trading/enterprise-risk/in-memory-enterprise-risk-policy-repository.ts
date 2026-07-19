/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/in-memory-enterprise-risk-policy-repository.ts
 *
 * Purpose:
 * Deterministic in-memory implementation of EnterpriseRiskPolicyRepository.
 * Policies are stored immutably and matched against portfolio, account,
 * strategy, and bot scope with stable specificity-first ordering.
 */

import {
  EnterpriseRiskAccountReference,
  EnterpriseRiskPolicy,
  EnterpriseRiskPolicyRepository,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface MutableEnterpriseRiskPolicyRepository
  extends EnterpriseRiskPolicyRepository {
  getAll(): readonly EnterpriseRiskPolicy[];
  clear(): void;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function assertOptionalNonEmptyString(
  value: unknown,
  field: string,
): void {
  if (value !== undefined) {
    assertNonEmptyString(value, field);
  }
}

function assertNonNegativeFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative finite number.",
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a positive integer.",
    );
  }
}

function deepCloneAndFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        deepCloneAndFreeze(entry),
      ),
    ) as T;
  }

  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    cloned[key] = deepCloneAndFreeze(entry);
  }

  return Object.freeze(cloned) as T;
}

function validateAccountReference(
  account: EnterpriseRiskAccountReference,
): void {
  assertObject(account, "account");

  assertNonEmptyString(
    account.portfolioId,
    "account.portfolioId",
  );

  assertOptionalNonEmptyString(
    account.accountId,
    "account.accountId",
  );

  assertOptionalNonEmptyString(
    account.strategyId,
    "account.strategyId",
  );

  assertOptionalNonEmptyString(
    account.botId,
    "account.botId",
  );
}

function validatePolicy(
  policy: EnterpriseRiskPolicy,
): void {
  assertObject(policy, "policy");

  assertNonEmptyString(
    policy.id,
    "policy.id",
  );

  assertNonEmptyString(
    policy.name,
    "policy.name",
  );

  assertOptionalNonEmptyString(
    policy.description,
    "policy.description",
  );

  assertPositiveInteger(
    policy.version,
    "policy.version",
  );

  if (typeof policy.enabled !== "boolean") {
    throw new EnterpriseRiskValidationError(
      "policy.enabled",
      "must be a boolean.",
    );
  }

  assertOptionalNonEmptyString(
    policy.portfolioId,
    "policy.portfolioId",
  );

  assertOptionalNonEmptyString(
    policy.accountId,
    "policy.accountId",
  );

  assertOptionalNonEmptyString(
    policy.strategyId,
    "policy.strategyId",
  );

  assertOptionalNonEmptyString(
    policy.botId,
    "policy.botId",
  );

  if (!Array.isArray(policy.limits)) {
    throw new EnterpriseRiskValidationError(
      "policy.limits",
      "must be an array.",
    );
  }

  assertNonNegativeFiniteNumber(
    policy.createdAt,
    "policy.createdAt",
  );

  assertNonNegativeFiniteNumber(
    policy.updatedAt,
    "policy.updatedAt",
  );

  if (policy.updatedAt < policy.createdAt) {
    throw new EnterpriseRiskValidationError(
      "policy.updatedAt",
      "must be greater than or equal to policy.createdAt.",
    );
  }
}

function matchesOptionalScope(
  policyValue: string | undefined,
  accountValue: string | undefined,
): boolean {
  return (
    policyValue === undefined ||
    policyValue === accountValue
  );
}

function isApplicable(
  policy: EnterpriseRiskPolicy,
  account: EnterpriseRiskAccountReference,
): boolean {
  return (
    policy.enabled &&
    matchesOptionalScope(
      policy.portfolioId,
      account.portfolioId,
    ) &&
    matchesOptionalScope(
      policy.accountId,
      account.accountId,
    ) &&
    matchesOptionalScope(
      policy.strategyId,
      account.strategyId,
    ) &&
    matchesOptionalScope(
      policy.botId,
      account.botId,
    )
  );
}

function getSpecificity(
  policy: EnterpriseRiskPolicy,
): number {
  return [
    policy.portfolioId,
    policy.accountId,
    policy.strategyId,
    policy.botId,
  ].filter((value) => value !== undefined).length;
}

function comparePolicies(
  left: EnterpriseRiskPolicy,
  right: EnterpriseRiskPolicy,
): number {
  const specificityDifference =
    getSpecificity(right) -
    getSpecificity(left);

  if (specificityDifference !== 0) {
    return specificityDifference;
  }

  if (left.version !== right.version) {
    return right.version - left.version;
  }

  const nameComparison =
    left.name.localeCompare(right.name);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.id.localeCompare(right.id);
}

export class InMemoryEnterpriseRiskPolicyRepository
  implements MutableEnterpriseRiskPolicyRepository
{
  private readonly policies =
    new Map<string, EnterpriseRiskPolicy>();

  public constructor(
    initialPolicies:
      readonly EnterpriseRiskPolicy[] = [],
  ) {
    if (!Array.isArray(initialPolicies)) {
      throw new EnterpriseRiskValidationError(
        "initialPolicies",
        "must be an array.",
      );
    }

    for (const policy of initialPolicies) {
      this.save(policy);
    }
  }

  public getById(
    policyId: string,
  ): EnterpriseRiskPolicy | undefined {
    assertNonEmptyString(
      policyId,
      "policyId",
    );

    const policy =
      this.policies.get(policyId);

    return policy === undefined
      ? undefined
      : deepCloneAndFreeze(policy);
  }

  public getApplicablePolicies(
    account: EnterpriseRiskAccountReference,
  ): readonly EnterpriseRiskPolicy[] {
    validateAccountReference(account);

    return Object.freeze(
      [...this.policies.values()]
        .filter((policy) =>
          isApplicable(policy, account),
        )
        .sort(comparePolicies)
        .map((policy) =>
          deepCloneAndFreeze(policy),
        ),
    );
  }

  public save(
    policy: EnterpriseRiskPolicy,
  ): void {
    validatePolicy(policy);

    this.policies.set(
      policy.id,
      deepCloneAndFreeze(policy),
    );
  }

  public remove(
    policyId: string,
  ): boolean {
    assertNonEmptyString(
      policyId,
      "policyId",
    );

    return this.policies.delete(policyId);
  }

  public getAll():
    readonly EnterpriseRiskPolicy[] {
    return Object.freeze(
      [...this.policies.values()]
        .sort(comparePolicies)
        .map((policy) =>
          deepCloneAndFreeze(policy),
        ),
    );
  }

  public clear(): void {
    this.policies.clear();
  }
}

export function createInMemoryEnterpriseRiskPolicyRepository(
  initialPolicies:
    readonly EnterpriseRiskPolicy[] = [],
): InMemoryEnterpriseRiskPolicyRepository {
  return new InMemoryEnterpriseRiskPolicyRepository(
    initialPolicies,
  );
}