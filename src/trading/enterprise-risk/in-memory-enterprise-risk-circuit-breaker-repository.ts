/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/
 * in-memory-enterprise-risk-circuit-breaker-repository.ts
 *
 * Purpose:
 * Deterministic in-memory implementation of the enterprise-risk
 * circuit-breaker repository contract.
 *
 * Design goals:
 * - Deterministic ordering
 * - Immutable returned values
 * - Defensive copies
 * - Strong runtime validation
 * - Scope-aware applicability filtering
 * - Suitable for tests, simulation, local development, and orchestration
 */

import {
  EnterpriseRiskAccountReference,
  EnterpriseRiskCircuitBreaker,
  EnterpriseRiskCircuitBreakerRepository,
  EnterpriseRiskCircuitBreakerScope,
  EnterpriseRiskCircuitBreakerStatus,
  EnterpriseRiskMarketReference,
  EnterpriseRiskMetadata,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface InMemoryEnterpriseRiskCircuitBreakerRepositoryOptions {
  readonly initialCircuitBreakers?:
    readonly EnterpriseRiskCircuitBreaker[];
}

function assertRecord(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
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
  if (typeof value !== "string") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a string.",
    );
  }

  if (value.trim().length === 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must not be empty.",
    );
  }
}

function assertOptionalNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string | undefined {
  if (value === undefined) {
    return;
  }

  assertNonEmptyString(value, field);
}

function assertNonNegativeInteger(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-negative integer.",
    );
  }
}

function assertBoolean(
  value: unknown,
  field: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a boolean.",
    );
  }
}

function validateScope(
  value: unknown,
  field: string,
): asserts value is EnterpriseRiskCircuitBreakerScope {
  switch (value) {
    case "GLOBAL":
    case "PORTFOLIO":
    case "ACCOUNT":
    case "EXCHANGE":
    case "CHAIN":
    case "ASSET":
    case "SYMBOL":
    case "STRATEGY":
    case "BOT":
      return;

    default:
      throw new EnterpriseRiskValidationError(
        field,
        "contains an unsupported circuit-breaker scope.",
      );
  }
}

function validateStatus(
  value: unknown,
  field: string,
): asserts value is EnterpriseRiskCircuitBreakerStatus {
  switch (value) {
    case "ARMED":
    case "TRIGGERED":
    case "RECOVERING":
    case "DISABLED":
      return;

    default:
      throw new EnterpriseRiskValidationError(
        field,
        "contains an unsupported circuit-breaker status.",
      );
  }
}

function cloneMetadata(
  metadata: EnterpriseRiskMetadata | undefined,
): EnterpriseRiskMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...metadata,
  });
}

function cloneCircuitBreaker(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
): EnterpriseRiskCircuitBreaker {
  return Object.freeze({
    ...circuitBreaker,
    metadata: cloneMetadata(circuitBreaker.metadata),
  });
}

function validateCircuitBreaker(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  field: string,
): void {
  assertRecord(circuitBreaker, field);

  assertNonEmptyString(
    circuitBreaker.id,
    `${field}.id`,
  );

  validateScope(
    circuitBreaker.scope,
    `${field}.scope`,
  );

  validateStatus(
    circuitBreaker.status,
    `${field}.status`,
  );

  if (circuitBreaker.scope === "GLOBAL") {
    if (circuitBreaker.scopeId !== undefined) {
      throw new EnterpriseRiskValidationError(
        `${field}.scopeId`,
        "must be omitted when scope is GLOBAL.",
      );
    }
  } else {
    assertNonEmptyString(
      circuitBreaker.scopeId,
      `${field}.scopeId`,
    );
  }

  assertOptionalNonEmptyString(
    circuitBreaker.reason,
    `${field}.reason`,
  );

  if (circuitBreaker.triggeredAt !== undefined) {
    assertNonNegativeInteger(
      circuitBreaker.triggeredAt,
      `${field}.triggeredAt`,
    );
  }

  if (
    circuitBreaker.recoveryEligibleAt !== undefined
  ) {
    assertNonNegativeInteger(
      circuitBreaker.recoveryEligibleAt,
      `${field}.recoveryEligibleAt`,
    );
  }

  assertBoolean(
    circuitBreaker.manuallyTriggered,
    `${field}.manuallyTriggered`,
  );

  if (
    circuitBreaker.triggeredAt !== undefined &&
    circuitBreaker.recoveryEligibleAt !== undefined &&
    circuitBreaker.recoveryEligibleAt <
      circuitBreaker.triggeredAt
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.recoveryEligibleAt`,
      "must not be earlier than triggeredAt.",
    );
  }

  if (
    (circuitBreaker.status === "TRIGGERED" ||
      circuitBreaker.status === "RECOVERING") &&
    circuitBreaker.triggeredAt === undefined
  ) {
    throw new EnterpriseRiskValidationError(
      `${field}.triggeredAt`,
      `is required when status is ${circuitBreaker.status}.`,
    );
  }
}

function validateAccountReference(
  account: EnterpriseRiskAccountReference,
): void {
  assertRecord(account, "account");

  assertNonEmptyString(
    account.portfolioId,
    "account.portfolioId",
  );

  assertOptionalNonEmptyString(
    account.accountId,
    "account.accountId",
  );

  assertOptionalNonEmptyString(
    account.userId,
    "account.userId",
  );

  assertOptionalNonEmptyString(
    account.workspaceId,
    "account.workspaceId",
  );

  assertOptionalNonEmptyString(
    account.walletId,
    "account.walletId",
  );

  assertOptionalNonEmptyString(
    account.botId,
    "account.botId",
  );

  assertOptionalNonEmptyString(
    account.strategyId,
    "account.strategyId",
  );
}

function validateMarketReference(
  market: EnterpriseRiskMarketReference,
): void {
  assertRecord(market, "market");

  assertNonEmptyString(
    market.symbol,
    "market.symbol",
  );

  assertNonEmptyString(
    market.baseAsset,
    "market.baseAsset",
  );

  assertNonEmptyString(
    market.quoteAsset,
    "market.quoteAsset",
  );

  assertOptionalNonEmptyString(
    market.exchangeId,
    "market.exchangeId",
  );

  assertOptionalNonEmptyString(
    market.chainId,
    "market.chainId",
  );

  assertOptionalNonEmptyString(
    market.venueId,
    "market.venueId",
  );
}

function isActive(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
): boolean {
  return circuitBreaker.status !== "DISABLED";
}

function isApplicableToAccount(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  account: EnterpriseRiskAccountReference,
): boolean {
  switch (circuitBreaker.scope) {
    case "GLOBAL":
      return true;

    case "PORTFOLIO":
      return (
        circuitBreaker.scopeId ===
        account.portfolioId
      );

    case "ACCOUNT":
      return (
        account.accountId !== undefined &&
        circuitBreaker.scopeId === account.accountId
      );

    case "STRATEGY":
      return (
        account.strategyId !== undefined &&
        circuitBreaker.scopeId ===
          account.strategyId
      );

    case "BOT":
      return (
        account.botId !== undefined &&
        circuitBreaker.scopeId === account.botId
      );

    case "EXCHANGE":
    case "CHAIN":
    case "ASSET":
    case "SYMBOL":
      return false;
  }
}

function isApplicableToMarket(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  market: EnterpriseRiskMarketReference | undefined,
): boolean {
  if (market === undefined) {
    return false;
  }

  switch (circuitBreaker.scope) {
    case "EXCHANGE":
      return (
        market.exchangeId !== undefined &&
        circuitBreaker.scopeId === market.exchangeId
      );

    case "CHAIN":
      return (
        market.chainId !== undefined &&
        circuitBreaker.scopeId === market.chainId
      );

    case "ASSET":
      return (
        circuitBreaker.scopeId === market.baseAsset ||
        circuitBreaker.scopeId === market.quoteAsset
      );

    case "SYMBOL":
      return circuitBreaker.scopeId === market.symbol;

    case "GLOBAL":
    case "PORTFOLIO":
    case "ACCOUNT":
    case "STRATEGY":
    case "BOT":
      return false;
  }
}

function isApplicable(
  circuitBreaker: EnterpriseRiskCircuitBreaker,
  account: EnterpriseRiskAccountReference,
  market: EnterpriseRiskMarketReference | undefined,
): boolean {
  if (!isActive(circuitBreaker)) {
    return false;
  }

  return (
    isApplicableToAccount(circuitBreaker, account) ||
    isApplicableToMarket(circuitBreaker, market)
  );
}

function sortCircuitBreakers(
  circuitBreakers:
    readonly EnterpriseRiskCircuitBreaker[],
): readonly EnterpriseRiskCircuitBreaker[] {
  return Object.freeze(
    [...circuitBreakers].sort((left, right) => {
      const scopeComparison =
        left.scope.localeCompare(right.scope);

      if (scopeComparison !== 0) {
        return scopeComparison;
      }

      const scopeIdComparison =
        (left.scopeId ?? "").localeCompare(
          right.scopeId ?? "",
        );

      if (scopeIdComparison !== 0) {
        return scopeIdComparison;
      }

      return left.id.localeCompare(right.id);
    }),
  );
}

export class InMemoryEnterpriseRiskCircuitBreakerRepository
  implements EnterpriseRiskCircuitBreakerRepository
{
  private readonly circuitBreakers =
    new Map<string, EnterpriseRiskCircuitBreaker>();

  public constructor(
    options?:
      InMemoryEnterpriseRiskCircuitBreakerRepositoryOptions,
  ) {
    if (
      options !== undefined &&
      (typeof options !== "object" ||
        options === null ||
        Array.isArray(options))
    ) {
      throw new EnterpriseRiskValidationError(
        "options",
        "must be a non-null object.",
      );
    }

    const initialCircuitBreakers =
      options?.initialCircuitBreakers ?? [];

    if (!Array.isArray(initialCircuitBreakers)) {
      throw new EnterpriseRiskValidationError(
        "options.initialCircuitBreakers",
        "must be an array.",
      );
    }

    initialCircuitBreakers.forEach(
      (circuitBreaker, index) => {
        validateCircuitBreaker(
          circuitBreaker,
          `options.initialCircuitBreakers[${index}]`,
        );

        if (
          this.circuitBreakers.has(
            circuitBreaker.id,
          )
        ) {
          throw new EnterpriseRiskValidationError(
            `options.initialCircuitBreakers[${index}].id`,
            `contains duplicate identifier ${circuitBreaker.id}.`,
          );
        }

        this.circuitBreakers.set(
          circuitBreaker.id,
          cloneCircuitBreaker(circuitBreaker),
        );
      },
    );
  }

  public getById(
    circuitBreakerId: string,
  ): EnterpriseRiskCircuitBreaker | undefined {
    assertNonEmptyString(
      circuitBreakerId,
      "circuitBreakerId",
    );

    const circuitBreaker =
      this.circuitBreakers.get(circuitBreakerId);

    return circuitBreaker === undefined
      ? undefined
      : cloneCircuitBreaker(circuitBreaker);
  }

  public getActive():
    readonly EnterpriseRiskCircuitBreaker[] {
    const activeCircuitBreakers = [
      ...this.circuitBreakers.values(),
    ]
      .filter(isActive)
      .map(cloneCircuitBreaker);

    return sortCircuitBreakers(
      activeCircuitBreakers,
    );
  }

  public getApplicable(
    account: EnterpriseRiskAccountReference,
    market?: EnterpriseRiskMarketReference,
  ): readonly EnterpriseRiskCircuitBreaker[] {
    validateAccountReference(account);

    if (market !== undefined) {
      validateMarketReference(market);
    }

    const applicableCircuitBreakers = [
      ...this.circuitBreakers.values(),
    ]
      .filter((circuitBreaker) =>
        isApplicable(
          circuitBreaker,
          account,
          market,
        ),
      )
      .map(cloneCircuitBreaker);

    return sortCircuitBreakers(
      applicableCircuitBreakers,
    );
  }

  public save(
    circuitBreaker: EnterpriseRiskCircuitBreaker,
  ): void {
    validateCircuitBreaker(
      circuitBreaker,
      "circuitBreaker",
    );

    this.circuitBreakers.set(
      circuitBreaker.id,
      cloneCircuitBreaker(circuitBreaker),
    );
  }

  public remove(
    circuitBreakerId: string,
  ): boolean {
    assertNonEmptyString(
      circuitBreakerId,
      "circuitBreakerId",
    );

    return this.circuitBreakers.delete(
      circuitBreakerId,
    );
  }

  public clear(): void {
    this.circuitBreakers.clear();
  }

  public size(): number {
    return this.circuitBreakers.size;
  }

  public getAll():
    readonly EnterpriseRiskCircuitBreaker[] {
    return sortCircuitBreakers(
      [...this.circuitBreakers.values()].map(
        cloneCircuitBreaker,
      ),
    );
  }
}