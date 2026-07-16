/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/exchange-discovery.ts
 *
 * Purpose:
 * Provides deterministic exchange discovery across registered connectors,
 * capability profiles, and connector lifecycle state.
 *
 * ExchangeDiscovery does not execute trades or route requests. It identifies
 * eligible exchange candidates that may later be evaluated by connector
 * selection policies and the exchange router.
 */

import {
  ExchangeCapabilityRegistry,
  normalizeCapabilityRequirement,
  profileMatchesRequirement,
  type ExchangeCapabilityProfile,
  type ExchangeCapabilityRegistryContract,
  type ExchangeCapabilityRequirement,
} from "./exchange-capability-registry";

import {
  ExchangeRegistry,
  normalizeExchangeRegistryId,
  type ExchangeRegistryEntry,
} from "./exchange-registry";

import {
  type ConnectorHealthStatus,
  type ConnectorLifecycleSnapshot,
  type ConnectorLifecycleState,
} from "./connector-lifecycle.types";

/**
 * Lifecycle inspection contract required by exchange discovery.
 */
export interface ExchangeDiscoveryLifecycleContract {
  inspect(exchangeId: string): ConnectorLifecycleSnapshot;

  inspectAll(): readonly ConnectorLifecycleSnapshot[];
}

/**
 * Stable exchange-discovery failure categories.
 */
export type ExchangeDiscoveryErrorCode =
  | "INVALID_DISCOVERY_REQUEST"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_PRIORITY"
  | "INVALID_ALLOWED_STATE"
  | "INVALID_ALLOWED_HEALTH"
  | "NO_EXCHANGE_CANDIDATES"
  | "INCONSISTENT_REGISTRY_STATE";

/**
 * Domain-specific exchange-discovery error.
 */
export class ExchangeDiscoveryError extends Error {
  public readonly code: ExchangeDiscoveryErrorCode;

  public readonly exchangeId?: string;

  public constructor(
    code: ExchangeDiscoveryErrorCode,
    message: string,
    options: Readonly<{
      exchangeId?: string;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "ExchangeDiscoveryError";
    this.code = code;
    this.exchangeId = options.exchangeId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Optional deterministic priority assigned to one exchange.
 *
 * Larger values rank ahead of smaller values.
 */
export interface ExchangeDiscoveryPriority {
  readonly exchangeId: string;

  readonly priority: number;
}

/**
 * Exchange-discovery request.
 */
export interface ExchangeDiscoveryRequest {
  /**
   * Required exchange capabilities.
   */
  readonly capabilities?: ExchangeCapabilityRequirement;

  /**
   * Restricts discovery to explicitly permitted exchanges.
   *
   * The list is normalized and de-duplicated.
   */
  readonly includeExchangeIds?: readonly string[];

  /**
   * Excludes explicitly prohibited exchanges.
   */
  readonly excludeExchangeIds?: readonly string[];

  /**
   * Preferred exchanges.
   *
   * Preferred exchanges rank ahead of non-preferred exchanges while
   * preserving the supplied preference order.
   */
  readonly preferredExchangeIds?: readonly string[];

  /**
   * Explicit exchange priority overrides.
   *
   * Larger priority values rank first.
   */
  readonly priorities?: readonly ExchangeDiscoveryPriority[];

  /**
   * Permitted lifecycle states.
   *
   * Defaults to RUNNING and DEGRADED.
   */
  readonly allowedLifecycleStates?: readonly ConnectorLifecycleState[];

  /**
   * Permitted health states.
   *
   * Defaults to HEALTHY and DEGRADED.
   */
  readonly allowedHealthStatuses?: readonly ConnectorHealthStatus[];

  /**
   * Whether lifecycle state should be evaluated.
   *
   * Defaults to true.
   */
  readonly requireLifecycleEligibility?: boolean;

  /**
   * Whether every discovered exchange must have a capability profile.
   *
   * Defaults to true.
   */
  readonly requireCapabilityProfile?: boolean;

  /**
   * Whether a connector currently executing a lifecycle operation should be
   * excluded.
   *
   * Defaults to true.
   */
  readonly excludeOperationInProgress?: boolean;

  /**
   * Maximum number of candidates returned.
   *
   * When omitted, all matching candidates are returned.
   */
  readonly limit?: number;
}

/**
 * Immutable discovered exchange candidate.
 */
export interface ExchangeDiscoveryCandidate<
  TConnector extends object,
> {
  readonly exchangeId: string;

  readonly connector: TConnector;

  readonly registryEntry: ExchangeRegistryEntry<TConnector>;

  readonly capabilityProfile?: ExchangeCapabilityProfile;

  readonly lifecycleSnapshot?: ConnectorLifecycleSnapshot;

  /**
   * Explicit deterministic priority.
   */
  readonly priority: number;

  /**
   * Zero-based index in the preferred exchange list.
   *
   * Undefined means the exchange was not explicitly preferred.
   */
  readonly preferenceIndex?: number;

  /**
   * Original deterministic connector registration order.
   */
  readonly registrationSequence: number;

  /**
   * Machine-readable eligibility observations.
   */
  readonly reasons: readonly ExchangeDiscoveryCandidateReason[];
}

/**
 * Reasons describing why a candidate was accepted.
 */
export type ExchangeDiscoveryCandidateReason =
  | "REGISTERED"
  | "CAPABILITIES_MATCHED"
  | "CAPABILITY_PROFILE_NOT_REQUIRED"
  | "LIFECYCLE_ELIGIBLE"
  | "LIFECYCLE_NOT_REQUIRED"
  | "HEALTH_ELIGIBLE"
  | "HEALTH_NOT_REQUIRED"
  | "PREFERRED"
  | "PRIORITY_ASSIGNED";

/**
 * Immutable result returned by exchange discovery.
 */
export interface ExchangeDiscoveryResult<
  TConnector extends object,
> {
  readonly request: NormalizedExchangeDiscoveryRequest;

  readonly candidates: readonly ExchangeDiscoveryCandidate<TConnector>[];

  readonly candidateCount: number;

  readonly evaluatedExchangeCount: number;

  readonly rejectedExchangeCount: number;
}

/**
 * Normalized discovery request used internally and exposed in results.
 */
export interface NormalizedExchangeDiscoveryRequest {
  readonly capabilities: ExchangeCapabilityRequirement;

  readonly includeExchangeIds: readonly string[];

  readonly excludeExchangeIds: readonly string[];

  readonly preferredExchangeIds: readonly string[];

  readonly priorities: readonly ExchangeDiscoveryPriority[];

  readonly allowedLifecycleStates: readonly ConnectorLifecycleState[];

  readonly allowedHealthStatuses: readonly ConnectorHealthStatus[];

  readonly requireLifecycleEligibility: boolean;

  readonly requireCapabilityProfile: boolean;

  readonly excludeOperationInProgress: boolean;

  readonly limit?: number;
}

/**
 * Public exchange-discovery contract.
 */
export interface ExchangeDiscoveryContract<
  TConnector extends object,
> {
  discover(
    request?: ExchangeDiscoveryRequest,
  ): ExchangeDiscoveryResult<TConnector>;

  discoverOne(
    request?: ExchangeDiscoveryRequest,
  ): ExchangeDiscoveryCandidate<TConnector> | undefined;

  requireOne(
    request?: ExchangeDiscoveryRequest,
  ): ExchangeDiscoveryCandidate<TConnector>;

  supports(
    exchangeId: string,
    request?: ExchangeDiscoveryRequest,
  ): boolean;
}

/**
 * Connector registry contract required by discovery.
 */
export interface ExchangeDiscoveryRegistryContract<
  TConnector extends object,
> {
  readonly size: number;

  has(exchangeId: string): boolean;

  getEntry(
    exchangeId: string,
  ): ExchangeRegistryEntry<TConnector> | undefined;

  list(): readonly ExchangeRegistryEntry<TConnector>[];
}

/**
 * Configuration for {@link ExchangeDiscovery}.
 */
export interface ExchangeDiscoveryOptions {
  /**
   * Default lifecycle states used when requests do not provide their own.
   */
  readonly defaultAllowedLifecycleStates?: readonly ConnectorLifecycleState[];

  /**
   * Default health statuses used when requests do not provide their own.
   */
  readonly defaultAllowedHealthStatuses?: readonly ConnectorHealthStatus[];

  /**
   * Whether lifecycle eligibility is required by default.
   */
  readonly requireLifecycleEligibilityByDefault?: boolean;

  /**
   * Whether capability profiles are required by default.
   */
  readonly requireCapabilityProfileByDefault?: boolean;

  /**
   * Whether connectors with active lifecycle operations are excluded by
   * default.
   */
  readonly excludeOperationInProgressByDefault?: boolean;
}

/**
 * Canonical lifecycle states accepted by discovery validation.
 */
const DISCOVERY_LIFECYCLE_STATES =
  Object.freeze<readonly ConnectorLifecycleState[]>([
    "UNINITIALIZED",
    "INITIALIZING",
    "STOPPED",
    "STARTING",
    "RUNNING",
    "DEGRADED",
    "STOPPING",
    "RESTARTING",
    "FAILED",
    "DISPOSED",
  ]);

/**
 * Canonical connector health values accepted by discovery validation.
 */
const DISCOVERY_HEALTH_STATUSES =
  Object.freeze<readonly ConnectorHealthStatus[]>([
    "UNKNOWN",
    "HEALTHY",
    "DEGRADED",
    "UNHEALTHY",
  ]);

/**
 * Deterministic discovery service for registered exchanges.
 */
export class ExchangeDiscovery<
    TConnector extends object,
  >
  implements ExchangeDiscoveryContract<TConnector>
{
  private readonly registry: ExchangeDiscoveryRegistryContract<TConnector>;

  private readonly capabilityRegistry: ExchangeCapabilityRegistryContract;

  private readonly lifecycle?: ExchangeDiscoveryLifecycleContract;

  private readonly defaultAllowedLifecycleStates:
    readonly ConnectorLifecycleState[];

  private readonly defaultAllowedHealthStatuses:
    readonly ConnectorHealthStatus[];

  private readonly requireLifecycleEligibilityByDefault: boolean;

  private readonly requireCapabilityProfileByDefault: boolean;

  private readonly excludeOperationInProgressByDefault: boolean;

  public constructor(
    registry:
      | ExchangeDiscoveryRegistryContract<TConnector>
      | ExchangeRegistry<TConnector>,
    capabilityRegistry:
      | ExchangeCapabilityRegistryContract
      | ExchangeCapabilityRegistry,
    lifecycle?: ExchangeDiscoveryLifecycleContract,
    options: ExchangeDiscoveryOptions = {},
  ) {
    this.registry = registry;
    this.capabilityRegistry = capabilityRegistry;
    this.lifecycle = lifecycle;

    this.defaultAllowedLifecycleStates =
      normalizeLifecycleStates(
        options.defaultAllowedLifecycleStates ?? [
          "RUNNING",
          "DEGRADED",
        ],
      );

    this.defaultAllowedHealthStatuses =
      normalizeHealthStatuses(
        options.defaultAllowedHealthStatuses ?? [
          "HEALTHY",
          "DEGRADED",
        ],
      );

    this.requireLifecycleEligibilityByDefault =
      options.requireLifecycleEligibilityByDefault ??
      true;

    this.requireCapabilityProfileByDefault =
      options.requireCapabilityProfileByDefault ??
      true;

    this.excludeOperationInProgressByDefault =
      options.excludeOperationInProgressByDefault ??
      true;

    if (
      this.requireLifecycleEligibilityByDefault &&
      this.lifecycle === undefined
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_DISCOVERY_REQUEST",
        "A lifecycle inspector is required when lifecycle eligibility is enabled by default.",
      );
    }
  }

  /**
   * Discovers every exchange satisfying the request.
   */
  public discover(
    request: ExchangeDiscoveryRequest = {},
  ): ExchangeDiscoveryResult<TConnector> {
    const normalizedRequest =
      this.normalizeRequest(request);

    const candidates: ExchangeDiscoveryCandidate<TConnector>[] = [];

    let evaluatedExchangeCount = 0;
    let rejectedExchangeCount = 0;

    for (const entry of this.registry.list()) {
      evaluatedExchangeCount += 1;

      const candidate = this.evaluateEntry(
        entry,
        normalizedRequest,
      );

      if (candidate === undefined) {
        rejectedExchangeCount += 1;
        continue;
      }

      candidates.push(candidate);
    }

    candidates.sort(compareDiscoveryCandidates);

    const limitedCandidates =
      normalizedRequest.limit === undefined
        ? candidates
        : candidates.slice(
            0,
            normalizedRequest.limit,
          );

    const frozenCandidates = Object.freeze([
      ...limitedCandidates,
    ]);

    return Object.freeze({
      request: normalizedRequest,
      candidates: frozenCandidates,
      candidateCount: frozenCandidates.length,
      evaluatedExchangeCount,
      rejectedExchangeCount,
    });
  }

  /**
   * Returns the highest-ranked discovered exchange.
   */
  public discoverOne(
    request: ExchangeDiscoveryRequest = {},
  ): ExchangeDiscoveryCandidate<TConnector> | undefined {
    return this.discover({
      ...request,
      limit: 1,
    }).candidates[0];
  }

  /**
   * Returns the highest-ranked exchange or throws when no candidate exists.
   */
  public requireOne(
    request: ExchangeDiscoveryRequest = {},
  ): ExchangeDiscoveryCandidate<TConnector> {
    const candidate =
      this.discoverOne(request);

    if (candidate === undefined) {
      throw new ExchangeDiscoveryError(
        "NO_EXCHANGE_CANDIDATES",
        "No registered exchange satisfies the discovery request.",
      );
    }

    return candidate;
  }

  /**
   * Returns whether one exchange satisfies a discovery request.
   */
  public supports(
    exchangeId: string,
    request: ExchangeDiscoveryRequest = {},
  ): boolean {
    const normalizedExchangeId =
      normalizeDiscoveryExchangeId(
        exchangeId,
      );

    const entry =
      this.registry.getEntry(
        normalizedExchangeId,
      );

    if (entry === undefined) {
      return false;
    }

    const normalizedRequest =
      this.normalizeRequest({
        ...request,
        includeExchangeIds: [
          normalizedExchangeId,
        ],
        limit: 1,
      });

    return (
      this.evaluateEntry(
        entry,
        normalizedRequest,
      ) !== undefined
    );
  }

  private evaluateEntry(
    entry: ExchangeRegistryEntry<TConnector>,
    request: NormalizedExchangeDiscoveryRequest,
  ): ExchangeDiscoveryCandidate<TConnector> | undefined {
    const exchangeId = entry.exchangeId;

    if (
      request.includeExchangeIds.length > 0 &&
      !request.includeExchangeIds.includes(
        exchangeId,
      )
    ) {
      return undefined;
    }

    if (
      request.excludeExchangeIds.includes(
        exchangeId,
      )
    ) {
      return undefined;
    }

    const reasons: ExchangeDiscoveryCandidateReason[] = [
      "REGISTERED",
    ];

    const capabilityProfile =
      this.capabilityRegistry.get(
        exchangeId,
      );

    if (capabilityProfile === undefined) {
      if (request.requireCapabilityProfile) {
        return undefined;
      }

      reasons.push(
        "CAPABILITY_PROFILE_NOT_REQUIRED",
      );
    } else {
      if (
        !profileMatchesRequirement(
          capabilityProfile,
          request.capabilities,
        )
      ) {
        return undefined;
      }

      reasons.push(
        "CAPABILITIES_MATCHED",
      );
    }

    let lifecycleSnapshot:
      | ConnectorLifecycleSnapshot
      | undefined;

    if (request.requireLifecycleEligibility) {
      if (this.lifecycle === undefined) {
        throw new ExchangeDiscoveryError(
          "INVALID_DISCOVERY_REQUEST",
          "Lifecycle eligibility was requested but no lifecycle inspector is configured.",
        );
      }

      try {
        lifecycleSnapshot =
          this.lifecycle.inspect(exchangeId);
      } catch (cause: unknown) {
        throw new ExchangeDiscoveryError(
          "INCONSISTENT_REGISTRY_STATE",
          `Lifecycle state could not be inspected for registered exchange "${exchangeId}".`,
          {
            exchangeId,
            cause,
          },
        );
      }

      if (
        !request.allowedLifecycleStates.includes(
          lifecycleSnapshot.state,
        )
      ) {
        return undefined;
      }

      reasons.push(
        "LIFECYCLE_ELIGIBLE",
      );

      if (
        request.excludeOperationInProgress &&
        lifecycleSnapshot.operationInProgress
      ) {
        return undefined;
      }

      if (
        !request.allowedHealthStatuses.includes(
          lifecycleSnapshot.health.status,
        )
      ) {
        return undefined;
      }

      reasons.push(
        "HEALTH_ELIGIBLE",
      );
    } else {
      reasons.push(
        "LIFECYCLE_NOT_REQUIRED",
        "HEALTH_NOT_REQUIRED",
      );
    }

    const preferenceIndex =
      request.preferredExchangeIds.indexOf(
        exchangeId,
      );

    if (preferenceIndex >= 0) {
      reasons.push("PREFERRED");
    }

    const priority =
      resolveExchangePriority(
        exchangeId,
        request.priorities,
      );

    if (priority !== 0) {
      reasons.push(
        "PRIORITY_ASSIGNED",
      );
    }

    return Object.freeze({
      exchangeId,
      connector: entry.connector,
      registryEntry: entry,
      ...(capabilityProfile === undefined
        ? {}
        : {
            capabilityProfile,
          }),
      ...(lifecycleSnapshot === undefined
        ? {}
        : {
            lifecycleSnapshot,
          }),
      priority,
      ...(preferenceIndex < 0
        ? {}
        : {
            preferenceIndex,
          }),
      registrationSequence:
        entry.registrationSequence,
      reasons: Object.freeze([
        ...reasons,
      ]),
    });
  }

  private normalizeRequest(
    request: ExchangeDiscoveryRequest,
  ): NormalizedExchangeDiscoveryRequest {
    if (
      request === null ||
      typeof request !== "object" ||
      Array.isArray(request)
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_DISCOVERY_REQUEST",
        "Exchange discovery request must be a record object.",
      );
    }

    const requireLifecycleEligibility =
      request.requireLifecycleEligibility ??
      this.requireLifecycleEligibilityByDefault;

    if (
      requireLifecycleEligibility &&
      this.lifecycle === undefined
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_DISCOVERY_REQUEST",
        "Lifecycle eligibility was requested but no lifecycle inspector is configured.",
      );
    }

    const includeExchangeIds =
      normalizeExchangeIdList(
        request.includeExchangeIds,
      );

    const excludeExchangeIds =
      normalizeExchangeIdList(
        request.excludeExchangeIds,
      );

    const conflictingExchangeId =
      includeExchangeIds.find((exchangeId) =>
        excludeExchangeIds.includes(
          exchangeId,
        ),
      );

    if (
      conflictingExchangeId !== undefined
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_DISCOVERY_REQUEST",
        `Exchange "${conflictingExchangeId}" cannot be both included and excluded.`,
        {
          exchangeId:
            conflictingExchangeId,
        },
      );
    }

    const limit =
      normalizeDiscoveryLimit(
        request.limit,
      );

    return Object.freeze({
      capabilities:
        normalizeCapabilityRequirement(
          request.capabilities ?? {},
        ),
      includeExchangeIds,
      excludeExchangeIds,
      preferredExchangeIds:
        normalizeExchangeIdList(
          request.preferredExchangeIds,
        ),
      priorities:
        normalizeDiscoveryPriorities(
          request.priorities,
        ),
      allowedLifecycleStates:
        normalizeLifecycleStates(
          request.allowedLifecycleStates ??
            this.defaultAllowedLifecycleStates,
        ),
      allowedHealthStatuses:
        normalizeHealthStatuses(
          request.allowedHealthStatuses ??
            this.defaultAllowedHealthStatuses,
        ),
      requireLifecycleEligibility,
      requireCapabilityProfile:
        request.requireCapabilityProfile ??
        this.requireCapabilityProfileByDefault,
      excludeOperationInProgress:
        request.excludeOperationInProgress ??
        this.excludeOperationInProgressByDefault,
      ...(limit === undefined
        ? {}
        : {
            limit,
          }),
    });
  }
}

/**
 * Normalizes an exchange-discovery request independently of a service
 * instance.
 *
 * This helper uses the production defaults:
 *
 * - RUNNING and DEGRADED lifecycle states;
 * - HEALTHY and DEGRADED health statuses;
 * - lifecycle eligibility required;
 * - capability profiles required;
 * - active lifecycle operations excluded.
 */
export function normalizeExchangeDiscoveryRequest(
  request: ExchangeDiscoveryRequest,
): NormalizedExchangeDiscoveryRequest {
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Exchange discovery request must be a record object.",
    );
  }

  const includeExchangeIds =
    normalizeExchangeIdList(
      request.includeExchangeIds,
    );

  const excludeExchangeIds =
    normalizeExchangeIdList(
      request.excludeExchangeIds,
    );

  const conflictingExchangeId =
    includeExchangeIds.find((exchangeId) =>
      excludeExchangeIds.includes(
        exchangeId,
      ),
    );

  if (
    conflictingExchangeId !== undefined
  ) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      `Exchange "${conflictingExchangeId}" cannot be both included and excluded.`,
      {
        exchangeId:
          conflictingExchangeId,
      },
    );
  }

  const limit =
    normalizeDiscoveryLimit(
      request.limit,
    );

  return Object.freeze({
    capabilities:
      normalizeCapabilityRequirement(
        request.capabilities ?? {},
      ),
    includeExchangeIds,
    excludeExchangeIds,
    preferredExchangeIds:
      normalizeExchangeIdList(
        request.preferredExchangeIds,
      ),
    priorities:
      normalizeDiscoveryPriorities(
        request.priorities,
      ),
    allowedLifecycleStates:
      normalizeLifecycleStates(
        request.allowedLifecycleStates ?? [
          "RUNNING",
          "DEGRADED",
        ],
      ),
    allowedHealthStatuses:
      normalizeHealthStatuses(
        request.allowedHealthStatuses ?? [
          "HEALTHY",
          "DEGRADED",
        ],
      ),
    requireLifecycleEligibility:
      request.requireLifecycleEligibility ??
      true,
    requireCapabilityProfile:
      request.requireCapabilityProfile ??
      true,
    excludeOperationInProgress:
      request.excludeOperationInProgress ??
      true,
    ...(limit === undefined
      ? {}
      : {
          limit,
        }),
  });
}

/**
 * Compares two candidates using deterministic discovery ranking.
 *
 * Ranking order:
 *
 * 1. Explicit numeric priority, descending.
 * 2. Preferred-list position, ascending.
 * 3. Health rank.
 * 4. Lifecycle rank.
 * 5. Registry registration sequence.
 * 6. Exchange identifier.
 */
export function compareDiscoveryCandidates<
  TConnector extends object,
>(
  left: ExchangeDiscoveryCandidate<TConnector>,
  right: ExchangeDiscoveryCandidate<TConnector>,
): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }

  const leftPreference =
    left.preferenceIndex ??
    Number.MAX_SAFE_INTEGER;

  const rightPreference =
    right.preferenceIndex ??
    Number.MAX_SAFE_INTEGER;

  if (
    leftPreference !== rightPreference
  ) {
    return (
      leftPreference -
      rightPreference
    );
  }

  const healthDifference =
    getHealthRank(right.lifecycleSnapshot) -
    getHealthRank(left.lifecycleSnapshot);

  if (healthDifference !== 0) {
    return healthDifference;
  }

  const lifecycleDifference =
    getLifecycleRank(
      right.lifecycleSnapshot,
    ) -
    getLifecycleRank(
      left.lifecycleSnapshot,
    );

  if (lifecycleDifference !== 0) {
    return lifecycleDifference;
  }

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

function normalizeExchangeIdList(
  exchangeIds:
    | readonly string[]
    | undefined,
): readonly string[] {
  if (exchangeIds === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(exchangeIds)) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Exchange identifier filters must be arrays.",
    );
  }

  const normalizedIds: string[] = [];
  const seenIds = new Set<string>();

  for (const exchangeId of exchangeIds) {
    const normalizedExchangeId =
      normalizeDiscoveryExchangeId(
        exchangeId,
      );

    if (
      seenIds.has(
        normalizedExchangeId,
      )
    ) {
      continue;
    }

    seenIds.add(
      normalizedExchangeId,
    );

    normalizedIds.push(
      normalizedExchangeId,
    );
  }

  return Object.freeze(
    normalizedIds,
  );
}

function normalizeDiscoveryExchangeId(
  exchangeId: string,
): string {
  try {
    return normalizeExchangeRegistryId(
      exchangeId,
    );
  } catch (cause: unknown) {
    throw new ExchangeDiscoveryError(
      "INVALID_EXCHANGE_ID",
      `Invalid discovery exchange identifier "${String(
        exchangeId,
      )}".`,
      {
        cause,
      },
    );
  }
}

function normalizeDiscoveryPriorities(
  priorities:
    | readonly ExchangeDiscoveryPriority[]
    | undefined,
): readonly ExchangeDiscoveryPriority[] {
  if (priorities === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(priorities)) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Exchange discovery priorities must be provided as an array.",
    );
  }

  const prioritiesByExchangeId =
    new Map<string, number>();

  for (const input of priorities) {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_PRIORITY",
        "Each exchange discovery priority must be a record object.",
      );
    }

    const exchangeId =
      normalizeDiscoveryExchangeId(
        input.exchangeId,
      );

    if (
      !Number.isFinite(
        input.priority,
      )
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_PRIORITY",
        `Priority for exchange "${exchangeId}" must be a finite number.`,
        {
          exchangeId,
        },
      );
    }

    prioritiesByExchangeId.set(
      exchangeId,
      input.priority,
    );
  }

  const normalizedPriorities =
    Array.from(
      prioritiesByExchangeId.entries(),
    )
      .map(
        ([exchangeId, priority]) =>
          Object.freeze({
            exchangeId,
            priority,
          }),
      )
      .sort((left, right) =>
        left.exchangeId.localeCompare(
          right.exchangeId,
        ),
      );

  return Object.freeze(
    normalizedPriorities,
  );
}

function normalizeLifecycleStates(
  states:
    | readonly ConnectorLifecycleState[]
    | undefined,
): readonly ConnectorLifecycleState[] {
  if (states === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(states)) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Allowed lifecycle states must be provided as an array.",
    );
  }

  const stateSet =
    new Set<ConnectorLifecycleState>();

  for (const state of states) {
    if (
      !DISCOVERY_LIFECYCLE_STATES.includes(
        state,
      )
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_ALLOWED_STATE",
        `Unsupported discovery lifecycle state "${String(
          state,
        )}".`,
      );
    }

    stateSet.add(state);
  }

  return Object.freeze(
    DISCOVERY_LIFECYCLE_STATES.filter(
      (state) =>
        stateSet.has(state),
    ),
  );
}

function normalizeHealthStatuses(
  statuses:
    | readonly ConnectorHealthStatus[]
    | undefined,
): readonly ConnectorHealthStatus[] {
  if (statuses === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(statuses)) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Allowed health statuses must be provided as an array.",
    );
  }

  const statusSet =
    new Set<ConnectorHealthStatus>();

  for (const status of statuses) {
    if (
      !DISCOVERY_HEALTH_STATUSES.includes(
        status,
      )
    ) {
      throw new ExchangeDiscoveryError(
        "INVALID_ALLOWED_HEALTH",
        `Unsupported discovery health status "${String(
          status,
        )}".`,
      );
    }

    statusSet.add(status);
  }

  return Object.freeze(
    DISCOVERY_HEALTH_STATUSES.filter(
      (status) =>
        statusSet.has(status),
    ),
  );
}

function normalizeDiscoveryLimit(
  limit: number | undefined,
): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    throw new ExchangeDiscoveryError(
      "INVALID_DISCOVERY_REQUEST",
      "Exchange discovery limit must be a positive integer.",
    );
  }

  return limit;
}

function resolveExchangePriority(
  exchangeId: string,
  priorities:
    readonly ExchangeDiscoveryPriority[],
): number {
  return (
    priorities.find(
      (priority) =>
        priority.exchangeId ===
        exchangeId,
    )?.priority ?? 0
  );
}

function getHealthRank(
  snapshot:
    | ConnectorLifecycleSnapshot
    | undefined,
): number {
  switch (
    snapshot?.health.status
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

function getLifecycleRank(
  snapshot:
    | ConnectorLifecycleSnapshot
    | undefined,
): number {
  switch (snapshot?.state) {
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