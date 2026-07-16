/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/connector-selection-policy.ts
 *
 * Purpose:
 * Defines deterministic, reusable connector-selection policies that rank
 * exchange discovery candidates before routing and failover.
 */

import type {
  ExchangeDiscoveryCandidate,
} from "./exchange-discovery";

import type {
  UnifiedExchange,
} from "./unified-exchange-interface";

/**
 * Built-in connector-selection policy identifiers.
 */
export type ConnectorSelectionPolicyType =
  | "REGISTRATION_ORDER"
  | "PRIORITY"
  | "PREFERRED"
  | "HEALTH"
  | "LIFECYCLE"
  | "WEIGHTED";

/**
 * Stable connector-selection failure codes.
 */
export type ConnectorSelectionPolicyErrorCode =
  | "INVALID_POLICY"
  | "INVALID_POLICY_TYPE"
  | "INVALID_WEIGHT"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_CANDIDATE"
  | "DUPLICATE_EXCHANGE_WEIGHT";

/**
 * Domain-specific connector-selection policy error.
 */
export class ConnectorSelectionPolicyError extends Error {
  public readonly code: ConnectorSelectionPolicyErrorCode;

  public readonly exchangeId?: string;

  public constructor(
    code: ConnectorSelectionPolicyErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: string;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "ConnectorSelectionPolicyError";
    this.code = code;
    this.exchangeId = options.exchangeId;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Explicit exchange weight.
 *
 * Larger values rank ahead of smaller values.
 */
export interface ConnectorSelectionWeight {
  readonly exchangeId: string;

  readonly weight: number;
}

/**
 * Weighted policy configuration.
 */
export interface WeightedConnectorSelectionPolicyOptions {
  /**
   * Exchange-specific weights.
   */
  readonly exchangeWeights?: readonly ConnectorSelectionWeight[];

  /**
   * Contribution of discovery priority.
   */
  readonly priorityWeight?: number;

  /**
   * Contribution of preferred-list ranking.
   */
  readonly preferenceWeight?: number;

  /**
   * Contribution of connector health.
   */
  readonly healthWeight?: number;

  /**
   * Contribution of lifecycle readiness.
   */
  readonly lifecycleWeight?: number;

  /**
   * Contribution of earlier registration order.
   */
  readonly registrationWeight?: number;
}

/**
 * Immutable selection score breakdown.
 */
export interface ConnectorSelectionScore {
  readonly exchangeId: string;

  readonly totalScore: number;

  readonly exchangeWeightScore: number;

  readonly priorityScore: number;

  readonly preferenceScore: number;

  readonly healthScore: number;

  readonly lifecycleScore: number;

  readonly registrationScore: number;
}

/**
 * Immutable policy evaluation result.
 */
export interface ConnectorSelectionPolicyResult<
  TExchange extends UnifiedExchange,
> {
  readonly policyType: ConnectorSelectionPolicyType;

  readonly candidates: readonly ExchangeDiscoveryCandidate<TExchange>[];

  readonly selectedCandidate?: ExchangeDiscoveryCandidate<TExchange>;

  readonly selectedExchangeId?: string;

  readonly scores: readonly ConnectorSelectionScore[];
}

/**
 * Public connector-selection policy contract.
 */
export interface ConnectorSelectionPolicy<
  TExchange extends UnifiedExchange,
> {
  readonly type: ConnectorSelectionPolicyType;

  evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange>;
}

/**
 * Canonical policy identifiers.
 */
export const CONNECTOR_SELECTION_POLICY_TYPES = [
  "REGISTRATION_ORDER",
  "PRIORITY",
  "PREFERRED",
  "HEALTH",
  "LIFECYCLE",
  "WEIGHTED",
] as const satisfies readonly ConnectorSelectionPolicyType[];

/**
 * Registration-order policy.
 */
export class RegistrationOrderSelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "REGISTRATION_ORDER" as const;

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const ranked = Object.freeze(
      [...normalizedCandidates].sort(
        compareByRegistrationOrder,
      ),
    );

    return createPolicyResult(
      this.type,
      ranked,
      createNeutralScores(ranked),
    );
  }
}

/**
 * Explicit-priority policy.
 */
export class PrioritySelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "PRIORITY" as const;

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const ranked = Object.freeze(
      [...normalizedCandidates].sort(
        (left, right) => {
          if (
            left.priority !== right.priority
          ) {
            return (
              right.priority -
              left.priority
            );
          }

          return compareByRegistrationOrder(
            left,
            right,
          );
        },
      ),
    );

    const scores = Object.freeze(
      ranked.map((candidate) =>
        Object.freeze({
          exchangeId:
            candidate.exchangeId,
          totalScore:
            candidate.priority,
          exchangeWeightScore: 0,
          priorityScore:
            candidate.priority,
          preferenceScore: 0,
          healthScore: 0,
          lifecycleScore: 0,
          registrationScore: 0,
        }),
      ),
    );

    return createPolicyResult(
      this.type,
      ranked,
      scores,
    );
  }
}

/**
 * Preferred-exchange policy.
 */
export class PreferredSelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "PREFERRED" as const;

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const ranked = Object.freeze(
      [...normalizedCandidates].sort(
        (left, right) => {
          const leftPreference =
            left.preferenceIndex ??
            Number.MAX_SAFE_INTEGER;

          const rightPreference =
            right.preferenceIndex ??
            Number.MAX_SAFE_INTEGER;

          if (
            leftPreference !==
            rightPreference
          ) {
            return (
              leftPreference -
              rightPreference
            );
          }

          return compareByRegistrationOrder(
            left,
            right,
          );
        },
      ),
    );

    const scores = Object.freeze(
      ranked.map((candidate) => {
        const preferenceScore =
          candidate.preferenceIndex ===
          undefined
            ? 0
            : Math.max(
                1,
                1_000 -
                  candidate.preferenceIndex,
              );

        return Object.freeze({
          exchangeId:
            candidate.exchangeId,
          totalScore:
            preferenceScore,
          exchangeWeightScore: 0,
          priorityScore: 0,
          preferenceScore,
          healthScore: 0,
          lifecycleScore: 0,
          registrationScore: 0,
        });
      }),
    );

    return createPolicyResult(
      this.type,
      ranked,
      scores,
    );
  }
}

/**
 * Health-aware policy.
 */
export class HealthSelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "HEALTH" as const;

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const ranked = Object.freeze(
      [...normalizedCandidates].sort(
        (left, right) => {
          const difference =
            getHealthRank(right) -
            getHealthRank(left);

          if (difference !== 0) {
            return difference;
          }

          return compareByRegistrationOrder(
            left,
            right,
          );
        },
      ),
    );

    const scores = Object.freeze(
      ranked.map((candidate) => {
        const healthScore =
          getHealthRank(candidate);

        return Object.freeze({
          exchangeId:
            candidate.exchangeId,
          totalScore: healthScore,
          exchangeWeightScore: 0,
          priorityScore: 0,
          preferenceScore: 0,
          healthScore,
          lifecycleScore: 0,
          registrationScore: 0,
        });
      }),
    );

    return createPolicyResult(
      this.type,
      ranked,
      scores,
    );
  }
}

/**
 * Lifecycle-readiness policy.
 */
export class LifecycleSelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "LIFECYCLE" as const;

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const ranked = Object.freeze(
      [...normalizedCandidates].sort(
        (left, right) => {
          const difference =
            getLifecycleRank(right) -
            getLifecycleRank(left);

          if (difference !== 0) {
            return difference;
          }

          return compareByRegistrationOrder(
            left,
            right,
          );
        },
      ),
    );

    const scores = Object.freeze(
      ranked.map((candidate) => {
        const lifecycleScore =
          getLifecycleRank(candidate);

        return Object.freeze({
          exchangeId:
            candidate.exchangeId,
          totalScore:
            lifecycleScore,
          exchangeWeightScore: 0,
          priorityScore: 0,
          preferenceScore: 0,
          healthScore: 0,
          lifecycleScore,
          registrationScore: 0,
        });
      }),
    );

    return createPolicyResult(
      this.type,
      ranked,
      scores,
    );
  }
}

/**
 * Composite weighted policy.
 */
export class WeightedConnectorSelectionPolicy<
    TExchange extends UnifiedExchange,
  >
  implements ConnectorSelectionPolicy<TExchange>
{
  public readonly type =
    "WEIGHTED" as const;

  private readonly exchangeWeights:
    ReadonlyMap<string, number>;

  private readonly priorityWeight: number;

  private readonly preferenceWeight: number;

  private readonly healthWeight: number;

  private readonly lifecycleWeight: number;

  private readonly registrationWeight: number;

  public constructor(
    options:
      WeightedConnectorSelectionPolicyOptions =
      {},
  ) {
    this.exchangeWeights =
      normalizeExchangeWeights(
        options.exchangeWeights,
      );

    this.priorityWeight =
      normalizeWeight(
        options.priorityWeight ?? 1,
        "priorityWeight",
      );

    this.preferenceWeight =
      normalizeWeight(
        options.preferenceWeight ?? 1,
        "preferenceWeight",
      );

    this.healthWeight =
      normalizeWeight(
        options.healthWeight ?? 1,
        "healthWeight",
      );

    this.lifecycleWeight =
      normalizeWeight(
        options.lifecycleWeight ?? 1,
        "lifecycleWeight",
      );

    this.registrationWeight =
      normalizeWeight(
        options.registrationWeight ?? 1,
        "registrationWeight",
      );
  }

  public evaluate(
    candidates: readonly ExchangeDiscoveryCandidate<TExchange>[],
  ): ConnectorSelectionPolicyResult<TExchange> {
    const normalizedCandidates =
      normalizeCandidates(candidates);

    const scored = normalizedCandidates.map(
      (candidate) => {
        const score =
          this.calculateScore(candidate);

        return Object.freeze({
          candidate,
          score,
        });
      },
    );

    scored.sort((left, right) => {
      if (
        left.score.totalScore !==
        right.score.totalScore
      ) {
        return (
          right.score.totalScore -
          left.score.totalScore
        );
      }

      return compareByRegistrationOrder(
        left.candidate,
        right.candidate,
      );
    });

    const ranked = Object.freeze(
      scored.map(
        (entry) =>
          entry.candidate,
      ),
    );

    const scores = Object.freeze(
      scored.map(
        (entry) =>
          entry.score,
      ),
    );

    return createPolicyResult(
      this.type,
      ranked,
      scores,
    );
  }

  private calculateScore(
    candidate: ExchangeDiscoveryCandidate<TExchange>,
  ): ConnectorSelectionScore {
    const exchangeWeightScore =
      this.exchangeWeights.get(
        candidate.exchangeId,
      ) ?? 0;

    const priorityScore =
      candidate.priority *
      this.priorityWeight;

    const preferenceScore =
      (
        candidate.preferenceIndex ===
        undefined
          ? 0
          : Math.max(
              1,
              1_000 -
                candidate.preferenceIndex,
            )
      ) *
      this.preferenceWeight;

    const healthScore =
      getHealthRank(candidate) *
      this.healthWeight;

    const lifecycleScore =
      getLifecycleRank(candidate) *
      this.lifecycleWeight;

    const registrationScore =
      (
        1 /
        Math.max(
          1,
          candidate.registrationSequence,
        )
      ) *
      this.registrationWeight;

    return Object.freeze({
      exchangeId:
        candidate.exchangeId,
      totalScore:
        exchangeWeightScore +
        priorityScore +
        preferenceScore +
        healthScore +
        lifecycleScore +
        registrationScore,
      exchangeWeightScore,
      priorityScore,
      preferenceScore,
      healthScore,
      lifecycleScore,
      registrationScore,
    });
  }
}

/**
 * Creates one of the built-in policies.
 */
export function createConnectorSelectionPolicy<
  TExchange extends UnifiedExchange,
>(
  type: ConnectorSelectionPolicyType,
  weightedOptions?:
    WeightedConnectorSelectionPolicyOptions,
): ConnectorSelectionPolicy<TExchange> {
  if (
    !isConnectorSelectionPolicyType(
      type,
    )
  ) {
    throw new ConnectorSelectionPolicyError(
      "INVALID_POLICY_TYPE",
      `Unsupported connector-selection policy type "${String(
        type,
      )}".`,
    );
  }

  switch (type) {
    case "REGISTRATION_ORDER":
      return new RegistrationOrderSelectionPolicy<TExchange>();

    case "PRIORITY":
      return new PrioritySelectionPolicy<TExchange>();

    case "PREFERRED":
      return new PreferredSelectionPolicy<TExchange>();

    case "HEALTH":
      return new HealthSelectionPolicy<TExchange>();

    case "LIFECYCLE":
      return new LifecycleSelectionPolicy<TExchange>();

    case "WEIGHTED":
      return new WeightedConnectorSelectionPolicy<TExchange>(
        weightedOptions,
      );

    default:
      throw new ConnectorSelectionPolicyError(
        "INVALID_POLICY_TYPE",
        `Unsupported connector-selection policy type "${String(
          type,
        )}".`,
      );
  }
}

/**
 * Returns whether a value is a built-in policy type.
 */
export function isConnectorSelectionPolicyType(
  value: unknown,
): value is ConnectorSelectionPolicyType {
  return (
    typeof value === "string" &&
    (
      CONNECTOR_SELECTION_POLICY_TYPES as readonly string[]
    ).includes(value)
  );
}

function createPolicyResult<
  TExchange extends UnifiedExchange,
>(
  policyType: ConnectorSelectionPolicyType,
  candidates:
    readonly ExchangeDiscoveryCandidate<TExchange>[],
  scores:
    readonly ConnectorSelectionScore[],
): ConnectorSelectionPolicyResult<TExchange> {
  const selectedCandidate =
    candidates[0];

  return Object.freeze({
    policyType,
    candidates,
    ...(selectedCandidate === undefined
      ? {}
      : {
          selectedCandidate,
          selectedExchangeId:
            selectedCandidate.exchangeId,
        }),
    scores,
  });
}

function normalizeCandidates<
  TExchange extends UnifiedExchange,
>(
  candidates:
    readonly ExchangeDiscoveryCandidate<TExchange>[],
): readonly ExchangeDiscoveryCandidate<TExchange>[] {
  if (!Array.isArray(candidates)) {
    throw new ConnectorSelectionPolicyError(
      "INVALID_POLICY",
      "Connector-selection candidates must be provided as an array.",
    );
  }

  const seenExchangeIds =
    new Set<string>();

  const normalized:
    ExchangeDiscoveryCandidate<TExchange>[] =
    [];

  for (const candidate of candidates) {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_CANDIDATE",
        "Every connector-selection candidate must be a record object.",
      );
    }

    if (
      typeof candidate.exchangeId !==
        "string" ||
      candidate.exchangeId.trim().length ===
        0
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_EXCHANGE_ID",
        "Connector-selection candidates require a non-empty exchange identifier.",
      );
    }

    if (
      !Number.isInteger(
        candidate.registrationSequence,
      ) ||
      candidate.registrationSequence <= 0
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_CANDIDATE",
        `Candidate "${candidate.exchangeId}" has an invalid registration sequence.`,
        {
          exchangeId:
            candidate.exchangeId,
        },
      );
    }

    if (
      !Number.isFinite(
        candidate.priority,
      )
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_CANDIDATE",
        `Candidate "${candidate.exchangeId}" has an invalid priority.`,
        {
          exchangeId:
            candidate.exchangeId,
        },
      );
    }

    if (
      seenExchangeIds.has(
        candidate.exchangeId,
      )
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_CANDIDATE",
        `Duplicate connector-selection candidate "${candidate.exchangeId}".`,
        {
          exchangeId:
            candidate.exchangeId,
        },
      );
    }

    seenExchangeIds.add(
      candidate.exchangeId,
    );

    normalized.push(candidate);
  }

  return Object.freeze([
    ...normalized,
  ]);
}

function normalizeExchangeWeights(
  weights:
    | readonly ConnectorSelectionWeight[]
    | undefined,
): ReadonlyMap<string, number> {
  if (weights === undefined) {
    return new Map<string, number>();
  }

  if (!Array.isArray(weights)) {
    throw new ConnectorSelectionPolicyError(
      "INVALID_POLICY",
      "Exchange weights must be provided as an array.",
    );
  }

  const normalized =
    new Map<string, number>();

  for (const entry of weights) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_POLICY",
        "Each exchange weight must be a record object.",
      );
    }

    const exchangeId =
      entry.exchangeId.trim().toLowerCase();

    if (exchangeId.length === 0) {
      throw new ConnectorSelectionPolicyError(
        "INVALID_EXCHANGE_ID",
        "Exchange weight identifiers cannot be empty.",
      );
    }

    if (normalized.has(exchangeId)) {
      throw new ConnectorSelectionPolicyError(
        "DUPLICATE_EXCHANGE_WEIGHT",
        `Duplicate exchange weight for "${exchangeId}".`,
        {
          exchangeId,
        },
      );
    }

    normalized.set(
      exchangeId,
      normalizeWeight(
        entry.weight,
        `weight for ${exchangeId}`,
      ),
    );
  }

  return normalized;
}

function normalizeWeight(
  value: number,
  label: string,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new ConnectorSelectionPolicyError(
      "INVALID_WEIGHT",
      `${label} must be a finite, non-negative number.`,
    );
  }

  return value;
}

function createNeutralScores<
  TExchange extends UnifiedExchange,
>(
  candidates:
    readonly ExchangeDiscoveryCandidate<TExchange>[],
): readonly ConnectorSelectionScore[] {
  return Object.freeze(
    candidates.map((candidate) =>
      Object.freeze({
        exchangeId:
          candidate.exchangeId,
        totalScore: 0,
        exchangeWeightScore: 0,
        priorityScore: 0,
        preferenceScore: 0,
        healthScore: 0,
        lifecycleScore: 0,
        registrationScore: 0,
      }),
    ),
  );
}

function compareByRegistrationOrder<
  TExchange extends UnifiedExchange,
>(
  left:
    ExchangeDiscoveryCandidate<TExchange>,
  right:
    ExchangeDiscoveryCandidate<TExchange>,
): number {
  if (
    left.registrationSequence !==
    right.registrationSequence
  ) {
    return (
      left.registrationSequence -
      right.registrationSequence
    );
  }

  return left.exchangeId.localeCompare(
    right.exchangeId,
  );
}

function getHealthRank<
  TExchange extends UnifiedExchange,
>(
  candidate:
    ExchangeDiscoveryCandidate<TExchange>,
): number {
  switch (
    candidate.lifecycleSnapshot
      ?.health.status
  ) {
    case "HEALTHY":
      return 4;

    case "DEGRADED":
      return 3;

    case "UNKNOWN":
      return 2;

    case "UNHEALTHY":
      return 1;

    default:
      return 0;
  }
}

function getLifecycleRank<
  TExchange extends UnifiedExchange,
>(
  candidate:
    ExchangeDiscoveryCandidate<TExchange>,
): number {
  switch (
    candidate.lifecycleSnapshot?.state
  ) {
    case "RUNNING":
      return 10;

    case "DEGRADED":
      return 9;

    case "STARTING":
      return 8;

    case "RESTARTING":
      return 7;

    case "STOPPED":
      return 6;

    case "INITIALIZING":
      return 5;

    case "STOPPING":
      return 4;

    case "UNINITIALIZED":
      return 3;

    case "FAILED":
      return 2;

    case "DISPOSED":
      return 1;

    default:
      return 0;
  }
}