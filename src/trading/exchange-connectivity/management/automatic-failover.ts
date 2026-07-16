/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/automatic-failover.ts
 *
 * Purpose:
 * Implements deterministic exchange failure tracking, cooldown management,
 * recovery eligibility, exclusion filtering, and failover decision support.
 */

import {
  normalizeExchangeRegistryId,
} from "./exchange-registry";

import type {
  ExchangeDiscoveryCandidate,
} from "./exchange-discovery";

import type {
  ExchangeRouterAttempt,
} from "./exchange-router.types";

import type {
  UnifiedExchange,
} from "./unified-exchange-interface";

/**
 * Current failover state assigned to one exchange.
 */
export type AutomaticFailoverExchangeState =
  | "AVAILABLE"
  | "COOLDOWN"
  | "RECOVERING"
  | "DISABLED";

/**
 * Stable automatic-failover error codes.
 */
export type AutomaticFailoverErrorCode =
  | "INVALID_EXCHANGE_ID"
  | "INVALID_CONFIGURATION"
  | "INVALID_TIMESTAMP"
  | "INVALID_ATTEMPT"
  | "EXCHANGE_DISABLED"
  | "NO_FAILOVER_CANDIDATE";

/**
 * Domain-specific automatic-failover error.
 */
export class AutomaticFailoverError extends Error {
  public readonly code: AutomaticFailoverErrorCode;

  public readonly exchangeId?: string;

  public constructor(
    code: AutomaticFailoverErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: string;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "AutomaticFailoverError";
    this.code = code;
    this.exchangeId = options.exchangeId;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Automatic failover configuration.
 */
export interface AutomaticFailoverOptions {
  /**
   * Consecutive failures required before cooldown begins.
   *
   * Defaults to 1.
   */
  readonly failureThreshold?: number;

  /**
   * Base cooldown duration.
   *
   * Defaults to 30 seconds.
   */
  readonly cooldownMs?: number;

  /**
   * Multiplier applied for repeated cooldown cycles.
   *
   * Defaults to 2.
   */
  readonly cooldownBackoffMultiplier?: number;

  /**
   * Maximum cooldown duration.
   *
   * Defaults to 15 minutes.
   */
  readonly maximumCooldownMs?: number;

  /**
   * Successful recovery observations required before availability resumes.
   *
   * Defaults to 1.
   */
  readonly recoverySuccessThreshold?: number;

  /**
   * Whether non-retryable failures count toward the failure threshold.
   *
   * Defaults to true.
   */
  readonly countNonRetryableFailures?: boolean;
}

/**
 * Deterministic clock used by failover state.
 */
export interface AutomaticFailoverClock {
  now(): number;
}

/**
 * Production failover clock.
 */
export class SystemAutomaticFailoverClock
  implements AutomaticFailoverClock
{
  public now(): number {
    return Date.now();
  }
}

/**
 * Immutable per-exchange failover snapshot.
 */
export interface AutomaticFailoverExchangeSnapshot {
  readonly exchangeId: string;

  readonly state: AutomaticFailoverExchangeState;

  readonly consecutiveFailures: number;

  readonly totalFailures: number;

  readonly consecutiveRecoverySuccesses: number;

  readonly cooldownCycle: number;

  readonly cooldownStartedAt?: number;

  readonly cooldownUntil?: number;

  readonly lastFailureAt?: number;

  readonly lastSuccessAt?: number;

  readonly lastErrorCode?: string;

  readonly lastErrorMessage?: string;

  readonly manuallyDisabled: boolean;
}

/**
 * Immutable complete failover snapshot.
 */
export interface AutomaticFailoverSnapshot {
  readonly version: number;

  readonly exchanges: readonly AutomaticFailoverExchangeSnapshot[];
}

/**
 * Result returned after recording an execution attempt.
 */
export interface AutomaticFailoverAttemptResult {
  readonly previousSnapshot: AutomaticFailoverExchangeSnapshot;

  readonly currentSnapshot: AutomaticFailoverExchangeSnapshot;

  readonly enteredCooldown: boolean;

  readonly recovered: boolean;
}

/**
 * Failover candidate-selection result.
 */
export interface AutomaticFailoverDecision<
  TExchange extends UnifiedExchange,
> {
  readonly selectedCandidate?: ExchangeDiscoveryCandidate<TExchange>;

  readonly selectedExchangeId?: string;

  readonly candidates: readonly ExchangeDiscoveryCandidate<TExchange>[];

  readonly excludedExchangeIds: readonly string[];

  readonly decidedAt: number;

  readonly reason: string;
}

/**
 * Public automatic-failover contract.
 */
export interface AutomaticFailoverContract {
  recordAttempt(
    attempt: ExchangeRouterAttempt,
  ): AutomaticFailoverAttemptResult;

  recordSuccess(
    exchangeId: string,
    observedAt?: number,
  ): AutomaticFailoverAttemptResult;

  recordFailure(
    exchangeId: string,
    input?: Readonly<{
      retryable?: boolean;
      errorCode?: string;
      errorMessage?: string;
      observedAt?: number;
    }>,
  ): AutomaticFailoverAttemptResult;

  inspect(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot;

  inspectAll():
    readonly AutomaticFailoverExchangeSnapshot[];

  snapshot(): AutomaticFailoverSnapshot;

  isAvailable(
    exchangeId: string,
    observedAt?: number,
  ): boolean;

  getExcludedExchangeIds(
    observedAt?: number,
  ): readonly string[];

  disable(exchangeId: string):
    AutomaticFailoverExchangeSnapshot;

  enable(exchangeId: string):
    AutomaticFailoverExchangeSnapshot;

  beginRecovery(
    exchangeId: string,
    observedAt?: number,
  ): AutomaticFailoverExchangeSnapshot;

  reset(exchangeId: string):
    AutomaticFailoverExchangeSnapshot;

  resetAll():
    readonly AutomaticFailoverExchangeSnapshot[];
}

/**
 * Deterministic automatic-failover manager.
 */
export class AutomaticFailoverManager
  implements AutomaticFailoverContract
{
  private readonly clock: AutomaticFailoverClock;

  private readonly failureThreshold: number;

  private readonly cooldownMs: number;

  private readonly cooldownBackoffMultiplier: number;

  private readonly maximumCooldownMs: number;

  private readonly recoverySuccessThreshold: number;

  private readonly countNonRetryableFailures: boolean;

  private readonly records =
    new Map<
      string,
      AutomaticFailoverExchangeSnapshot
    >();

  private mutationVersion = 0;

  public constructor(
    options: AutomaticFailoverOptions = {},
    clock: AutomaticFailoverClock =
      new SystemAutomaticFailoverClock(),
  ) {
    this.failureThreshold =
      normalizePositiveInteger(
        options.failureThreshold ?? 1,
        "failureThreshold",
      );

    this.cooldownMs =
      normalizeNonNegativeFiniteNumber(
        options.cooldownMs ?? 30_000,
        "cooldownMs",
      );

    this.cooldownBackoffMultiplier =
      normalizePositiveFiniteNumber(
        options.cooldownBackoffMultiplier ?? 2,
        "cooldownBackoffMultiplier",
      );

    this.maximumCooldownMs =
      normalizeNonNegativeFiniteNumber(
        options.maximumCooldownMs ??
          15 * 60_000,
        "maximumCooldownMs",
      );

    if (
      this.maximumCooldownMs <
      this.cooldownMs
    ) {
      throw new AutomaticFailoverError(
        "INVALID_CONFIGURATION",
        "maximumCooldownMs cannot be lower than cooldownMs.",
      );
    }

    this.recoverySuccessThreshold =
      normalizePositiveInteger(
        options.recoverySuccessThreshold ?? 1,
        "recoverySuccessThreshold",
      );

    this.countNonRetryableFailures =
      options.countNonRetryableFailures ??
      true;

    this.clock = clock;
  }

  public recordAttempt(
    attempt: ExchangeRouterAttempt,
  ): AutomaticFailoverAttemptResult {
    if (
      attempt === null ||
      typeof attempt !== "object" ||
      Array.isArray(attempt)
    ) {
      throw new AutomaticFailoverError(
        "INVALID_ATTEMPT",
        "Router attempt must be a record object.",
      );
    }

    assertTimestamp(
      attempt.completedAt,
      "Attempt completion timestamp",
    );

    if (
      attempt.outcome === "SUCCEEDED"
    ) {
      return this.recordSuccess(
        attempt.exchangeId,
        attempt.completedAt,
      );
    }

    if (
      attempt.outcome === "FAILED"
    ) {
      return this.recordFailure(
        attempt.exchangeId,
        {
          retryable:
            attempt.retryable,
          errorCode:
            attempt.errorCode,
          errorMessage:
            attempt.errorMessage,
          observedAt:
            attempt.completedAt,
        },
      );
    }

    const snapshot =
      this.requireRecord(
        attempt.exchangeId,
      );

    return Object.freeze({
      previousSnapshot: snapshot,
      currentSnapshot: snapshot,
      enteredCooldown: false,
      recovered: false,
    });
  }

  public recordSuccess(
    exchangeId: string,
    observedAt?: number,
  ): AutomaticFailoverAttemptResult {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const timestamp =
      observedAt ?? this.now();

    assertTimestamp(
      timestamp,
      "Success timestamp",
    );

    const previousSnapshot =
      this.requireRecord(
        normalizedExchangeId,
      );

    if (
      previousSnapshot.manuallyDisabled
    ) {
      throw new AutomaticFailoverError(
        "EXCHANGE_DISABLED",
        `Exchange "${normalizedExchangeId}" is manually disabled.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    const recoverySuccesses =
      previousSnapshot.state ===
        "RECOVERING"
        ? previousSnapshot
            .consecutiveRecoverySuccesses +
          1
        : 0;

    const recovered =
      previousSnapshot.state ===
        "RECOVERING" &&
      recoverySuccesses >=
        this.recoverySuccessThreshold;

    const currentSnapshot =
      recovered
        ? createSnapshot({
            ...previousSnapshot,
            state: "AVAILABLE",
            consecutiveFailures: 0,
            consecutiveRecoverySuccesses: 0,
            lastSuccessAt: timestamp,
            cooldownStartedAt: undefined,
            cooldownUntil: undefined,
            lastErrorCode: undefined,
            lastErrorMessage: undefined,
          })
        : createSnapshot({
            ...previousSnapshot,
            state:
              previousSnapshot.state ===
                "RECOVERING"
                ? "RECOVERING"
                : "AVAILABLE",
            consecutiveFailures: 0,
            consecutiveRecoverySuccesses:
              recoverySuccesses,
            lastSuccessAt: timestamp,
            ...(previousSnapshot.state ===
            "AVAILABLE"
              ? {
                  cooldownStartedAt:
                    undefined,
                  cooldownUntil:
                    undefined,
                  lastErrorCode:
                    undefined,
                  lastErrorMessage:
                    undefined,
                }
              : {}),
          });

    this.store(
      normalizedExchangeId,
      currentSnapshot,
    );

    return Object.freeze({
      previousSnapshot,
      currentSnapshot,
      enteredCooldown: false,
      recovered,
    });
  }

  public recordFailure(
    exchangeId: string,
    input: Readonly<{
      retryable?: boolean;
      errorCode?: string;
      errorMessage?: string;
      observedAt?: number;
    }> = {},
  ): AutomaticFailoverAttemptResult {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const timestamp =
      input.observedAt ?? this.now();

    assertTimestamp(
      timestamp,
      "Failure timestamp",
    );

    const previousSnapshot =
      this.requireRecord(
        normalizedExchangeId,
      );

    if (
      previousSnapshot.manuallyDisabled
    ) {
      throw new AutomaticFailoverError(
        "EXCHANGE_DISABLED",
        `Exchange "${normalizedExchangeId}" is manually disabled.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    const shouldCountFailure =
      input.retryable !== false ||
      this.countNonRetryableFailures;

    const consecutiveFailures =
      shouldCountFailure
        ? previousSnapshot
            .consecutiveFailures + 1
        : previousSnapshot
            .consecutiveFailures;

    const totalFailures =
      shouldCountFailure
        ? previousSnapshot.totalFailures +
          1
        : previousSnapshot.totalFailures;

    const enteredCooldown =
      shouldCountFailure &&
      consecutiveFailures >=
        this.failureThreshold;

    const nextCooldownCycle =
      enteredCooldown
        ? previousSnapshot.cooldownCycle +
          1
        : previousSnapshot.cooldownCycle;

    const cooldownDuration =
      enteredCooldown
        ? calculateCooldownDuration(
            this.cooldownMs,
            this.cooldownBackoffMultiplier,
            this.maximumCooldownMs,
            nextCooldownCycle,
          )
        : undefined;

    const currentSnapshot =
      createSnapshot({
        ...previousSnapshot,
        state:
          enteredCooldown
            ? "COOLDOWN"
            : previousSnapshot.state,
        consecutiveFailures,
        totalFailures,
        consecutiveRecoverySuccesses: 0,
        cooldownCycle:
          nextCooldownCycle,
        lastFailureAt: timestamp,
        lastErrorCode:
          input.errorCode,
        lastErrorMessage:
          input.errorMessage,
        ...(enteredCooldown
          ? {
              cooldownStartedAt:
                timestamp,
              cooldownUntil:
                timestamp +
                (cooldownDuration ?? 0),
            }
          : {}),
      });

    this.store(
      normalizedExchangeId,
      currentSnapshot,
    );

    return Object.freeze({
      previousSnapshot,
      currentSnapshot,
      enteredCooldown,
      recovered: false,
    });
  }

  public inspect(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot {
    return this.refreshState(
      normalizeFailoverExchangeId(
        exchangeId,
      ),
      this.now(),
    );
  }

  public inspectAll():
    readonly AutomaticFailoverExchangeSnapshot[] {
    const timestamp = this.now();

    return Object.freeze(
      Array.from(
        this.records.keys(),
      )
        .sort((left, right) =>
          left.localeCompare(right),
        )
        .map((exchangeId) =>
          this.refreshState(
            exchangeId,
            timestamp,
          ),
        ),
    );
  }

  public snapshot(): AutomaticFailoverSnapshot {
    return Object.freeze({
      version: this.mutationVersion,
      exchanges: this.inspectAll(),
    });
  }

  public isAvailable(
    exchangeId: string,
    observedAt?: number,
  ): boolean {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const timestamp =
      observedAt ?? this.now();

    const snapshot =
      this.refreshState(
        normalizedExchangeId,
        timestamp,
      );

    return snapshot.state ===
      "AVAILABLE";
  }

  public getExcludedExchangeIds(
    observedAt?: number,
  ): readonly string[] {
    const timestamp =
      observedAt ?? this.now();

    const excluded =
      Array.from(
        this.records.keys(),
      )
        .sort((left, right) =>
          left.localeCompare(right),
        )
        .filter((exchangeId) => {
          const snapshot =
            this.refreshState(
              exchangeId,
              timestamp,
            );

          return (
            snapshot.state ===
              "COOLDOWN" ||
            snapshot.state ===
              "RECOVERING" ||
            snapshot.state ===
              "DISABLED"
          );
        });

    return Object.freeze(excluded);
  }

  public disable(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const previousSnapshot =
      this.requireRecord(
        normalizedExchangeId,
      );

    const currentSnapshot =
      createSnapshot({
        ...previousSnapshot,
        state: "DISABLED",
        manuallyDisabled: true,
        consecutiveRecoverySuccesses: 0,
      });

    this.store(
      normalizedExchangeId,
      currentSnapshot,
    );

    return currentSnapshot;
  }

  public enable(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const previousSnapshot =
      this.requireRecord(
        normalizedExchangeId,
      );

    const currentSnapshot =
      createSnapshot({
        ...previousSnapshot,
        state: "AVAILABLE",
        manuallyDisabled: false,
        consecutiveFailures: 0,
        consecutiveRecoverySuccesses: 0,
        cooldownStartedAt: undefined,
        cooldownUntil: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      });

    this.store(
      normalizedExchangeId,
      currentSnapshot,
    );

    return currentSnapshot;
  }

  public beginRecovery(
    exchangeId: string,
    observedAt?: number,
  ): AutomaticFailoverExchangeSnapshot {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const timestamp =
      observedAt ?? this.now();

    assertTimestamp(
      timestamp,
      "Recovery timestamp",
    );

    const previousSnapshot =
      this.refreshState(
        normalizedExchangeId,
        timestamp,
      );

    if (
      previousSnapshot.manuallyDisabled
    ) {
      throw new AutomaticFailoverError(
        "EXCHANGE_DISABLED",
        `Exchange "${normalizedExchangeId}" is manually disabled.`,
        {
          exchangeId:
            normalizedExchangeId,
        },
      );
    }

    const currentSnapshot =
      createSnapshot({
        ...previousSnapshot,
        state: "RECOVERING",
        consecutiveRecoverySuccesses: 0,
        cooldownStartedAt: undefined,
        cooldownUntil: undefined,
      });

    this.store(
      normalizedExchangeId,
      currentSnapshot,
    );

    return currentSnapshot;
  }

  public reset(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot {
    const normalizedExchangeId =
      normalizeFailoverExchangeId(
        exchangeId,
      );

    const snapshot =
      createInitialSnapshot(
        normalizedExchangeId,
      );

    this.store(
      normalizedExchangeId,
      snapshot,
    );

    return snapshot;
  }

  public resetAll():
    readonly AutomaticFailoverExchangeSnapshot[] {
    const exchangeIds =
      Array.from(
        this.records.keys(),
      ).sort((left, right) =>
        left.localeCompare(right),
      );

    const resetSnapshots =
      exchangeIds.map((exchangeId) => {
        const snapshot =
          createInitialSnapshot(
            exchangeId,
          );

        this.store(
          exchangeId,
          snapshot,
        );

        return snapshot;
      });

    return Object.freeze(
      resetSnapshots,
    );
  }

  private refreshState(
    exchangeId: string,
    observedAt: number,
  ): AutomaticFailoverExchangeSnapshot {
    assertTimestamp(
      observedAt,
      "Failover observation timestamp",
    );

    const snapshot =
      this.requireRecord(
        exchangeId,
      );

    if (
      snapshot.state !== "COOLDOWN" ||
      snapshot.cooldownUntil ===
        undefined ||
      observedAt <
        snapshot.cooldownUntil
    ) {
      return snapshot;
    }

    const recoveringSnapshot =
      createSnapshot({
        ...snapshot,
        state: "RECOVERING",
        consecutiveRecoverySuccesses: 0,
        cooldownStartedAt: undefined,
        cooldownUntil: undefined,
      });

    this.store(
      exchangeId,
      recoveringSnapshot,
    );

    return recoveringSnapshot;
  }

  private requireRecord(
    exchangeId: string,
  ): AutomaticFailoverExchangeSnapshot {
    const existing =
      this.records.get(exchangeId);

    if (existing !== undefined) {
      return existing;
    }

    const snapshot =
      createInitialSnapshot(exchangeId);

    this.records.set(
      exchangeId,
      snapshot,
    );

    return snapshot;
  }

  private store(
    exchangeId: string,
    snapshot: AutomaticFailoverExchangeSnapshot,
  ): void {
    this.records.set(
      exchangeId,
      snapshot,
    );

    this.mutationVersion += 1;
  }

  private now(): number {
    const value =
      this.clock.now();

    assertTimestamp(
      value,
      "Failover clock timestamp",
    );

    return value;
  }
}

/**
 * Filters and ranks candidates for automatic failover.
 */
export function createAutomaticFailoverDecision<
  TExchange extends UnifiedExchange,
>(
  candidates:
    readonly ExchangeDiscoveryCandidate<TExchange>[],
  failover:
    AutomaticFailoverContract,
  observedAt?: number,
): AutomaticFailoverDecision<TExchange> {
  if (!Array.isArray(candidates)) {
    throw new AutomaticFailoverError(
      "INVALID_CONFIGURATION",
      "Failover candidates must be provided as an array.",
    );
  }

  const excludedExchangeIds =
    failover.getExcludedExchangeIds(
      observedAt,
    );

  const eligibleCandidates =
    Object.freeze(
      candidates.filter(
        (candidate) =>
          !excludedExchangeIds.includes(
            candidate.exchangeId,
          ),
      ),
    );

  const selectedCandidate =
    eligibleCandidates[0];

  const decidedAt =
    observedAt ?? Date.now();

  assertTimestamp(
    decidedAt,
    "Failover decision timestamp",
  );

  return Object.freeze({
    ...(selectedCandidate === undefined
      ? {}
      : {
          selectedCandidate,
          selectedExchangeId:
            selectedCandidate.exchangeId,
        }),
    candidates:
      eligibleCandidates,
    excludedExchangeIds,
    decidedAt,
    reason:
      selectedCandidate === undefined
        ? "No failover candidate is currently eligible."
        : `Selected failover exchange "${selectedCandidate.exchangeId}".`,
  });
}

/**
 * Calculates deterministic cooldown duration.
 */
export function calculateCooldownDuration(
  baseCooldownMs: number,
  multiplier: number,
  maximumCooldownMs: number,
  cooldownCycle: number,
): number {
  normalizeNonNegativeFiniteNumber(
    baseCooldownMs,
    "baseCooldownMs",
  );

  normalizePositiveFiniteNumber(
    multiplier,
    "multiplier",
  );

  normalizeNonNegativeFiniteNumber(
    maximumCooldownMs,
    "maximumCooldownMs",
  );

  normalizePositiveInteger(
    cooldownCycle,
    "cooldownCycle",
  );

  const exponent =
    Math.max(
      0,
      cooldownCycle - 1,
    );

  return Math.min(
    baseCooldownMs *
      multiplier ** exponent,
    maximumCooldownMs,
  );
}

function createInitialSnapshot(
  exchangeId: string,
): AutomaticFailoverExchangeSnapshot {
  return createSnapshot({
    exchangeId,
    state: "AVAILABLE",
    consecutiveFailures: 0,
    totalFailures: 0,
    consecutiveRecoverySuccesses: 0,
    cooldownCycle: 0,
    manuallyDisabled: false,
  });
}

function createSnapshot(
  input: AutomaticFailoverExchangeSnapshot,
): AutomaticFailoverExchangeSnapshot {
  return Object.freeze({
    exchangeId:
      input.exchangeId,
    state: input.state,
    consecutiveFailures:
      input.consecutiveFailures,
    totalFailures:
      input.totalFailures,
    consecutiveRecoverySuccesses:
      input.consecutiveRecoverySuccesses,
    cooldownCycle:
      input.cooldownCycle,
    ...(input.cooldownStartedAt ===
    undefined
      ? {}
      : {
          cooldownStartedAt:
            input.cooldownStartedAt,
        }),
    ...(input.cooldownUntil ===
    undefined
      ? {}
      : {
          cooldownUntil:
            input.cooldownUntil,
        }),
    ...(input.lastFailureAt ===
    undefined
      ? {}
      : {
          lastFailureAt:
            input.lastFailureAt,
        }),
    ...(input.lastSuccessAt ===
    undefined
      ? {}
      : {
          lastSuccessAt:
            input.lastSuccessAt,
        }),
    ...(input.lastErrorCode ===
    undefined
      ? {}
      : {
          lastErrorCode:
            input.lastErrorCode,
        }),
    ...(input.lastErrorMessage ===
    undefined
      ? {}
      : {
          lastErrorMessage:
            input.lastErrorMessage,
        }),
    manuallyDisabled:
      input.manuallyDisabled,
  });
}

function normalizeFailoverExchangeId(
  exchangeId: string,
): string {
  try {
    return normalizeExchangeRegistryId(
      exchangeId,
    );
  } catch (cause: unknown) {
    throw new AutomaticFailoverError(
      "INVALID_EXCHANGE_ID",
      `Invalid failover exchange identifier "${String(
        exchangeId,
      )}".`,
      {
        cause,
      },
    );
  }
}

function assertTimestamp(
  value: number,
  label: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new AutomaticFailoverError(
      "INVALID_TIMESTAMP",
      `${label} must be a finite, non-negative number.`,
    );
  }
}

function normalizePositiveInteger(
  value: number,
  label: string,
): number {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new AutomaticFailoverError(
      "INVALID_CONFIGURATION",
      `${label} must be a positive integer.`,
    );
  }

  return value;
}

function normalizePositiveFiniteNumber(
  value: number,
  label: string,
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new AutomaticFailoverError(
      "INVALID_CONFIGURATION",
      `${label} must be a finite positive number.`,
    );
  }

  return value;
}

function normalizeNonNegativeFiniteNumber(
  value: number,
  label: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new AutomaticFailoverError(
      "INVALID_CONFIGURATION",
      `${label} must be a finite non-negative number.`,
    );
  }

  return value;
}