/**
 * QuantumTradeAI
 * Milestone 20 — Live Order Execution & Trading Engine Integration
 *
 * File 4:
 * Smart Order Router
 *
 * Converts live-order routing commands into deterministic exchange-discovery
 * requests, evaluates eligible exchange candidates, selects the best route,
 * and returns an immutable routing decision.
 */

import type {
  ExchangeCapabilityRequirement,
  ExchangeSupportedTimeInForce,
} from "../exchange-connectivity/management/exchange-capability-registry";

import type {
  ExchangeDiscoveryCandidate,
} from "../exchange-connectivity/management/exchange-discovery";

import type {
  ExchangeRouterContract,
  ExchangeRouterDecision,
  ExchangeRouterRequest,
  ExchangeRoutingStrategy,
} from "../exchange-connectivity/management/exchange-router.types";

import type {
  UnifiedExchange,
} from "../exchange-connectivity/management/unified-exchange-interface";

import {
  validateLiveOrder,
} from "./live-order";

import type {
  LiveOrder,
  LiveOrderExchangeId,
  LiveOrderType,
} from "./live-order";

import type {
  OrderClock,
  OrderIdGenerator,
  OrderRouteCandidate,
  OrderRouteSelection,
  OrderRoutingPreference,
  RouteOrderCommand,
  SmartOrderRouterContract,
} from "./order-types";

/**
 * Stable order-routing error codes.
 */
export type OrderRouterErrorCode =
  | "INVALID_DEPENDENCY"
  | "INVALID_COMMAND"
  | "INVALID_ORDER_STATE"
  | "INVALID_PREFERENCE"
  | "INVALID_EXCHANGE_ID"
  | "INVALID_ROUTE_ID"
  | "INVALID_TIMESTAMP"
  | "INVALID_CANDIDATE"
  | "NO_ROUTE_AVAILABLE"
  | "PREFERRED_EXCHANGE_UNAVAILABLE"
  | "ROUTING_FAILED";

/**
 * Domain-specific smart-order-routing error.
 */
export class OrderRouterError extends Error {
  public readonly code: OrderRouterErrorCode;

  public readonly orderId?: string;

  public readonly exchangeId?: string;

  public constructor(
    code: OrderRouterErrorCode,
    message: string,
    options: Readonly<{
      orderId?: string;
      exchangeId?: string;
      cause?: unknown;
    }> = {},
  ) {
    super(message, {
      cause: options.cause,
    });

    this.name = "OrderRouterError";
    this.code = code;
    this.orderId = options.orderId;
    this.exchangeId = options.exchangeId;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

/**
 * Optional exchange-specific estimates used for smart route scoring.
 */
export interface OrderRouteCandidateEstimate {
  readonly connectionId?: string;

  readonly supported?: boolean;

  readonly healthy?: boolean;

  readonly available?: boolean;

  readonly estimatedPrice?: number;

  readonly estimatedFee?: number;

  readonly estimatedLatencyMs?: number;

  readonly availableQuantity?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Supplies optional market, fee, latency, liquidity, and availability data for
 * one exchange candidate.
 */
export interface OrderRouteCandidateEstimator<
  TExchange extends UnifiedExchange =
    UnifiedExchange,
> {
  estimate(
    command: RouteOrderCommand,
    candidate: ExchangeDiscoveryCandidate<TExchange>,
  ):
    | OrderRouteCandidateEstimate
    | Promise<OrderRouteCandidateEstimate>;
}

/**
 * Optional policy used to override the built-in deterministic scoring model.
 */
export interface OrderRouteScoringPolicy {
  score(
    command: RouteOrderCommand,
    candidate: Readonly<{
      exchangeId: LiveOrderExchangeId;
      supported: boolean;
      healthy: boolean;
      available: boolean;
      estimatedPrice?: number;
      estimatedFee?: number;
      estimatedLatencyMs?: number;
      availableQuantity?: number;
      preference: OrderRoutingPreference;
      preferredExchangeId?: LiveOrderExchangeId;
      candidateIndex: number;
    }>,
  ): number;
}

/**
 * Smart-order-router configuration.
 */
export interface SmartOrderRouterOptions {
  /**
   * Preference applied when the command contains no routing preferences.
   */
  readonly defaultPreference?: OrderRoutingPreference;

  /**
   * Whether every command must contain at least one explicit preference.
   */
  readonly requireExplicitPreference?: boolean;

  /**
   * Whether PREFERRED_EXCHANGE must fail when the preferred exchange is not
   * available.
   */
  readonly strictPreferredExchange?: boolean;

  /**
   * Whether an order already containing an exchangeId should automatically use
   * that exchange as its preferred exchange.
   */
  readonly respectOrderExchangeId?: boolean;

  /**
   * Whether estimated liquidity must cover the order quantity.
   */
  readonly requireSufficientLiquidity?: boolean;

  /**
   * Whether warning-level candidate limitations may remain routable.
   */
  readonly allowPartiallyQualifiedCandidates?: boolean;

  /**
   * Minimum allowed candidate score.
   */
  readonly minimumCandidateScore?: number;

  /**
   * Metadata added to every route selection.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface ResolvedSmartOrderRouterOptions {
  readonly defaultPreference: OrderRoutingPreference;

  readonly requireExplicitPreference: boolean;

  readonly strictPreferredExchange: boolean;

  readonly respectOrderExchangeId: boolean;

  readonly requireSufficientLiquidity: boolean;

  readonly allowPartiallyQualifiedCandidates: boolean;

  readonly minimumCandidateScore: number;

  readonly metadata: Readonly<Record<string, unknown>>;
}

interface EvaluatedCandidate<
  TExchange extends UnifiedExchange,
> {
  readonly source: ExchangeDiscoveryCandidate<TExchange>;

  readonly routeCandidate: OrderRouteCandidate;

  readonly candidateIndex: number;
}

const EMPTY_METADATA: Readonly<
  Record<string, unknown>
> = Object.freeze({});

const ROUTABLE_STATES = new Set([
  "VALIDATED",
  "ROUTING",
  "RECOVERING",
] as const);

const ORDER_ROUTING_PREFERENCES =
  Object.freeze([
    "BEST_PRICE",
    "LOWEST_FEE",
    "LOWEST_LATENCY",
    "HIGHEST_LIQUIDITY",
    "PREFERRED_EXCHANGE",
    "FAILOVER",
    "DETERMINISTIC",
  ] as const satisfies readonly OrderRoutingPreference[]);

const DEFAULT_OPTIONS:
  ResolvedSmartOrderRouterOptions =
  Object.freeze({
    defaultPreference: "DETERMINISTIC",
    requireExplicitPreference: false,
    strictPreferredExchange: true,
    respectOrderExchangeId: true,
    requireSufficientLiquidity: true,
    allowPartiallyQualifiedCandidates: false,
    minimumCandidateScore:
      Number.NEGATIVE_INFINITY,
    metadata: EMPTY_METADATA,
  });

/**
 * Production system clock for order routing.
 */
export class SystemOrderRouterClock
  implements OrderClock
{
  public now(): number {
    return Date.now();
  }
}

/**
 * Default smart-order-router implementation.
 */
export class SmartOrderRouter<
    TExchange extends UnifiedExchange =
      UnifiedExchange,
  >
  implements SmartOrderRouterContract
{
  private readonly exchangeRouter:
    ExchangeRouterContract<TExchange>;

  private readonly idGenerator:
    OrderIdGenerator;

  private readonly clock:
    OrderClock;

  private readonly estimator?:
    OrderRouteCandidateEstimator<TExchange>;

  private readonly scoringPolicy?:
    OrderRouteScoringPolicy;

  private readonly options:
    ResolvedSmartOrderRouterOptions;

  public constructor(
    exchangeRouter:
      ExchangeRouterContract<TExchange>,
    idGenerator: OrderIdGenerator,
    options: SmartOrderRouterOptions = {},
    dependencies: Readonly<{
      clock?: OrderClock;
      estimator?:
        OrderRouteCandidateEstimator<TExchange>;
      scoringPolicy?:
        OrderRouteScoringPolicy;
    }> = {},
  ) {
    validateExchangeRouter(
      exchangeRouter,
    );

    validateIdGenerator(
      idGenerator,
    );

    const clock =
      dependencies.clock ??
      new SystemOrderRouterClock();

    validateClock(clock);

    if (
      dependencies.estimator !== undefined
    ) {
      validateEstimator(
        dependencies.estimator,
      );
    }

    if (
      dependencies.scoringPolicy !==
      undefined
    ) {
      validateScoringPolicy(
        dependencies.scoringPolicy,
      );
    }

    this.exchangeRouter =
      exchangeRouter;

    this.idGenerator =
      idGenerator;

    this.clock =
      clock;

    this.estimator =
      dependencies.estimator;

    this.scoringPolicy =
      dependencies.scoringPolicy;

    this.options =
      resolveOptions(options);
  }

  /**
   * Selects one immutable exchange route for a live order.
   */
  public async selectRoute(
    command: RouteOrderCommand,
  ): Promise<OrderRouteSelection> {
    validateRouteCommand(
      command,
      this.options,
    );

    const selectedAt =
      this.now();

    const preferences =
      resolvePreferences(
        command.preferences,
        this.options,
      );

    const preferredExchangeId =
      resolvePreferredExchangeId(
        command,
        this.options,
      );

    const primaryPreference =
      preferences[0] ??
      this.options.defaultPreference;

    const exchangeRouterRequest =
      createExchangeRouterRequest(
        command,
        preferences,
        preferredExchangeId,
        selectedAt,
      );

    let decision:
      ExchangeRouterDecision<TExchange>;

    try {
      decision =
        this.exchangeRouter.select(
          exchangeRouterRequest,
        );
    } catch (cause: unknown) {
      throw new OrderRouterError(
        "ROUTING_FAILED",
        `Exchange discovery failed for order "${command.order.orderId}".`,
        {
          orderId:
            command.order.orderId,
          cause,
        },
      );
    }

    const evaluatedCandidates =
      await this.evaluateCandidates(
        command,
        decision,
        primaryPreference,
        preferredExchangeId,
      );

    const rankedCandidates =
      rankCandidates(
        evaluatedCandidates,
        primaryPreference,
        command.order,
      );

    const routeCandidates =
      Object.freeze(
        rankedCandidates.map(
          (candidate) =>
            candidate.routeCandidate,
        ),
      );

    const selectedCandidate =
      rankedCandidates.find(
        (candidate) =>
          isSelectableCandidate(
            candidate.routeCandidate,
            this.options,
          ),
      );

    if (
      selectedCandidate === undefined
    ) {
      throw new OrderRouterError(
        "NO_ROUTE_AVAILABLE",
        `No eligible exchange route is available for order "${command.order.orderId}".`,
        {
          orderId:
            command.order.orderId,
        },
      );
    }

    if (
      primaryPreference ===
        "PREFERRED_EXCHANGE" &&
      this.options
        .strictPreferredExchange &&
      preferredExchangeId !== undefined &&
      selectedCandidate.routeCandidate
        .exchangeId !==
        preferredExchangeId
    ) {
      throw new OrderRouterError(
        "PREFERRED_EXCHANGE_UNAVAILABLE",
        `Preferred exchange "${preferredExchangeId}" is unavailable for order "${command.order.orderId}".`,
        {
          orderId:
            command.order.orderId,
          exchangeId:
            preferredExchangeId,
        },
      );
    }

    const routeId =
      normalizeGeneratedIdentifier(
        this.idGenerator.nextRouteId(),
        "routeId",
      );

    const selectionMetadata =
      freezeRecord({
        ...this.options.metadata,
        orderId:
          command.order.orderId,
        commandId:
          command.context.commandId,
        correlationId:
          command.context.correlationId,
        preference:
          primaryPreference,
        exchangeRouterOutcome:
          decision.outcome,
        exchangeRouterReason:
          decision.reason,
        evaluatedCandidateCount:
          routeCandidates.length,
        selectedCandidateIndex:
          selectedCandidate
            .candidateIndex,
        requestedPreferences:
          Object.freeze([
            ...preferences,
          ]),
      });

    return freezeRouteSelection({
      routeId,
      exchangeId:
        selectedCandidate
          .routeCandidate.exchangeId,
      connectionId:
        selectedCandidate
          .routeCandidate.connectionId,
      score:
        selectedCandidate
          .routeCandidate.score,
      selectedAt,
      preference:
        primaryPreference,
      reason:
        createSelectionReason(
          selectedCandidate
            .routeCandidate,
          primaryPreference,
          preferredExchangeId,
        ),
      candidates:
        routeCandidates,
      metadata:
        selectionMetadata,
    });
  }

  private async evaluateCandidates(
    command: RouteOrderCommand,
    decision:
      ExchangeRouterDecision<TExchange>,
    preference:
      OrderRoutingPreference,
    preferredExchangeId:
      | LiveOrderExchangeId
      | undefined,
  ): Promise<
    readonly EvaluatedCandidate<TExchange>[]
  > {
    const evaluated:
      EvaluatedCandidate<TExchange>[] =
      [];

    for (
      let candidateIndex = 0;
      candidateIndex <
      decision.candidates.length;
      candidateIndex += 1
    ) {
      const candidate =
        decision.candidates[
          candidateIndex
        ];

      if (
        candidate === undefined
      ) {
        continue;
      }

      const estimate =
        await this.estimateCandidate(
          command,
          candidate,
        );

      const routeCandidate =
        this.createRouteCandidate(
          command,
          candidate,
          estimate,
          preference,
          preferredExchangeId,
          candidateIndex,
        );

      evaluated.push(
        Object.freeze({
          source: candidate,
          routeCandidate,
          candidateIndex,
        }),
      );
    }

    return Object.freeze(evaluated);
  }

  private async estimateCandidate(
    command: RouteOrderCommand,
    candidate:
      ExchangeDiscoveryCandidate<TExchange>,
  ): Promise<OrderRouteCandidateEstimate> {
    if (
      this.estimator === undefined
    ) {
      return EMPTY_METADATA;
    }

    let estimate:
      OrderRouteCandidateEstimate;

    try {
      estimate =
        await this.estimator.estimate(
          command,
          candidate,
        );
    } catch (cause: unknown) {
      throw new OrderRouterError(
        "ROUTING_FAILED",
        `Route estimation failed for exchange "${candidate.exchangeId}".`,
        {
          orderId:
            command.order.orderId,
          exchangeId:
            candidate.exchangeId,
          cause,
        },
      );
    }

    validateCandidateEstimate(
      estimate,
      candidate.exchangeId,
    );

    return estimate;
  }

  private createRouteCandidate(
    command: RouteOrderCommand,
    candidate:
      ExchangeDiscoveryCandidate<TExchange>,
    estimate:
      OrderRouteCandidateEstimate,
    preference:
      OrderRoutingPreference,
    preferredExchangeId:
      | LiveOrderExchangeId
      | undefined,
    candidateIndex: number,
  ): OrderRouteCandidate {
    const exchangeId =
      normalizeExchangeId(
        candidate.exchangeId,
      );

    const supported =
      estimate.supported ?? true;

    const healthy =
      estimate.healthy ??
      deriveCandidateHealth(
        candidate,
      );

    const available =
      estimate.available ??
      deriveCandidateAvailability(
        candidate,
      );

    const rejectionReasons:
      string[] = [];

    if (!supported) {
      rejectionReasons.push(
        "Exchange does not support the requested order.",
      );
    }

    if (!healthy) {
      rejectionReasons.push(
        "Exchange connector is not healthy.",
      );
    }

    if (!available) {
      rejectionReasons.push(
        "Exchange connector is not available.",
      );
    }

    if (
      command.excludedExchangeIds.includes(
        exchangeId,
      )
    ) {
      rejectionReasons.push(
        "Exchange was explicitly excluded by the route command.",
      );
    }

    if (
      this.options
        .requireSufficientLiquidity &&
      estimate.availableQuantity !==
        undefined &&
      estimate.availableQuantity <
        command.order
          .remainingQuantity
    ) {
      rejectionReasons.push(
        "Available exchange liquidity is below the remaining order quantity.",
      );
    }

    const provisionalCandidate =
      Object.freeze({
        exchangeId,
        supported,
        healthy,
        available,
        estimatedPrice:
          estimate.estimatedPrice,
        estimatedFee:
          estimate.estimatedFee,
        estimatedLatencyMs:
          estimate.estimatedLatencyMs,
        availableQuantity:
          estimate.availableQuantity,
        preference,
        preferredExchangeId,
        candidateIndex,
      });

    const score =
      this.scoringPolicy === undefined
        ? calculateCandidateScore(
            command,
            provisionalCandidate,
          )
        : normalizeScore(
            this.scoringPolicy.score(
              command,
              provisionalCandidate,
            ),
            exchangeId,
          );

    if (
      score <
      this.options.minimumCandidateScore
    ) {
      rejectionReasons.push(
        `Candidate score ${score} is below minimum score ${this.options.minimumCandidateScore}.`,
      );
    }

    const candidateMetadata =
      freezeRecord({
        ...extractCandidateMetadata(
          candidate,
        ),
        ...(
          estimate.metadata ??
          EMPTY_METADATA
        ),
        candidateIndex,
        registrationSequence:
          readFiniteNumber(
            candidate,
            "registrationSequence",
          ),
        priority:
          readFiniteNumber(
            candidate,
            "priority",
          ),
      });

    return freezeRouteCandidate({
      exchangeId,
      connectionId:
        normalizeOptionalIdentifier(
          estimate.connectionId,
          "connectionId",
        ),
      supported,
      healthy,
      available,
      score,
      estimatedPrice:
        estimate.estimatedPrice,
      estimatedFee:
        estimate.estimatedFee,
      estimatedLatencyMs:
        estimate.estimatedLatencyMs,
      availableQuantity:
        estimate.availableQuantity,
      rejectionReasons:
        Object.freeze(
          rejectionReasons,
        ),
      metadata:
        candidateMetadata,
    });
  }

  private now(): number {
    return normalizeTimestamp(
      this.clock.now(),
      "orderRouter.clock.now()",
    );
  }
}

/**
 * Creates an ExchangeRouter request from one order-routing command.
 */
export function createOrderExchangeRouterRequest(
  command: RouteOrderCommand,
  options: SmartOrderRouterOptions = {},
  requestedAt?: number,
): ExchangeRouterRequest {
  const resolvedOptions =
    resolveOptions(options);

  validateRouteCommand(
    command,
    resolvedOptions,
  );

  const preferences =
    resolvePreferences(
      command.preferences,
      resolvedOptions,
    );

  const preferredExchangeId =
    resolvePreferredExchangeId(
      command,
      resolvedOptions,
    );

  const timestamp =
    requestedAt ??
    command.context.initiatedAt;

  return createExchangeRouterRequest(
    command,
    preferences,
    preferredExchangeId,
    normalizeTimestamp(
      timestamp,
      "requestedAt",
    ),
  );
}

/**
 * Applies a route selection to an immutable live order.
 *
 * The returned object is suitable for passing to applyLiveOrderRouting().
 */
export function createLiveOrderRoutingDecision(
  selection: OrderRouteSelection,
): Readonly<{
  exchangeId: LiveOrderExchangeId;
  connectionId?: string;
  routeId: string;
  selectedAt: number;
  score: number;
  reason: string;
  metadata: Readonly<Record<string, unknown>>;
}> {
  validateRouteSelection(selection);

  return Object.freeze({
    exchangeId:
      selection.exchangeId,
    ...(selection.connectionId ===
    undefined
      ? {}
      : {
          connectionId:
            selection.connectionId,
        }),
    routeId:
      selection.routeId,
    selectedAt:
      selection.selectedAt,
    score:
      selection.score,
    reason:
      selection.reason,
    metadata:
      freezeRecord({
        ...selection.metadata,
        preference:
          selection.preference,
        candidateCount:
          selection.candidates.length,
      }),
  });
}

/**
 * Built-in deterministic candidate score.
 */
export function calculateOrderRouteScore(
  command: RouteOrderCommand,
  candidate: Readonly<{
    exchangeId: LiveOrderExchangeId;
    supported: boolean;
    healthy: boolean;
    available: boolean;
    estimatedPrice?: number;
    estimatedFee?: number;
    estimatedLatencyMs?: number;
    availableQuantity?: number;
    preference: OrderRoutingPreference;
    preferredExchangeId?: LiveOrderExchangeId;
    candidateIndex: number;
  }>,
): number {
  return calculateCandidateScore(
    command,
    candidate,
  );
}

function createExchangeRouterRequest(
  command: RouteOrderCommand,
  preferences:
    readonly OrderRoutingPreference[],
  preferredExchangeId:
    | LiveOrderExchangeId
    | undefined,
  requestedAt: number,
): ExchangeRouterRequest {
  const primaryPreference =
    preferences[0] ??
    "DETERMINISTIC";

  const includeExchangeIds =
    resolveIncludedExchangeIds(
      command,
      preferredExchangeId,
      primaryPreference,
    );

  const excludedExchangeIds =
    normalizeExchangeIds(
      command.excludedExchangeIds,
      "excludedExchangeIds",
    );

  const preferredExchangeIds =
    preferredExchangeId === undefined
      ? undefined
      : Object.freeze([
          preferredExchangeId,
        ]);

  const discovery = {
    ...(includeExchangeIds ===
    undefined
      ? {}
      : {
          includeExchangeIds,
        }),
    ...(excludedExchangeIds.length ===
    0
      ? {}
      : {
          excludeExchangeIds:
            excludedExchangeIds,
        }),
    ...(preferredExchangeIds ===
    undefined
      ? {}
      : {
          preferredExchangeIds,
        }),
  };

  return Object.freeze({
    operation: "PLACE_ORDER",
    strategy:
      mapPreferenceToExchangeStrategy(
        primaryPreference,
      ),
    capabilities:
      createOrderCapabilityRequirement(
        command.order,
      ),
    discovery,
    retryPolicy: {
      maxAttempts:
        primaryPreference === "FAILOVER"
          ? 3
          : 1,
    },
    failoverPolicy: {
      enabled:
        primaryPreference === "FAILOVER",
      maximumExchangeAttempts:
        primaryPreference === "FAILOVER"
          ? 3
          : 1,
      retryCurrentExchangeFirst: false,
      failoverOnNonRetryableError: false,
    },
    requestId:
      command.context.requestId ??
      command.context.commandId,
    requestedAt,
    metadata:
      freezeRecord({
        orderId:
          command.order.orderId,
        clientOrderId:
          command.order.clientOrderId,
        symbol:
          command.order.symbol,
        orderType:
          command.order.type,
        side:
          command.order.side,
        preferences:
          Object.freeze([
            ...preferences,
          ]),
        correlationId:
          command.context.correlationId,
      }),
  });
}

function createOrderCapabilityRequirement(
  order: LiveOrder,
): ExchangeCapabilityRequirement {
  const exchangeTimeInForce =
    mapLiveTimeInForceToExchange(
      order.timeInForce,
    );

  const requirement:
    ExchangeCapabilityRequirement = {
      trading:
        Object.freeze([
          "PLACE_ORDER",
        ]),
      requirePrivateApi:
        true,
      orderTypes:
        Object.freeze([
          order.type,
        ]),
      ...(exchangeTimeInForce ===
      undefined
        ? {}
        : {
            timeInForce:
              Object.freeze([
                exchangeTimeInForce,
              ]),
          }),
  };

  return Object.freeze(
    requirement,
  );
}

function mapLiveTimeInForceToExchange(
  value: LiveOrder["timeInForce"],
): ExchangeSupportedTimeInForce | undefined {
  switch (value) {
    case "GTC":
    case "IOC":
    case "FOK":
    case "POST_ONLY":
      return value;

    case "GTD":
    case undefined:
      return undefined;

    default: {
      const exhaustiveCheck: never =
        value;

      return exhaustiveCheck;
    }
  }
}

function mapPreferenceToExchangeStrategy(
  preference: OrderRoutingPreference,
): ExchangeRoutingStrategy {
  switch (preference) {
    case "PREFERRED_EXCHANGE":
      return "PREFERRED";

    case "FAILOVER":
      return "HEALTH_AWARE";

    case "LOWEST_LATENCY":
      return "HEALTH_AWARE";

    case "DETERMINISTIC":
      return "PRIORITY";

    case "BEST_PRICE":
    case "LOWEST_FEE":
    case "HIGHEST_LIQUIDITY":
      return "FIRST_MATCH";

    default: {
      const exhaustiveCheck: never =
        preference;

      return exhaustiveCheck;
    }
  }
}

function calculateCandidateScore(
  command: RouteOrderCommand,
  candidate: Readonly<{
    exchangeId: LiveOrderExchangeId;
    supported: boolean;
    healthy: boolean;
    available: boolean;
    estimatedPrice?: number;
    estimatedFee?: number;
    estimatedLatencyMs?: number;
    availableQuantity?: number;
    preference: OrderRoutingPreference;
    preferredExchangeId?: LiveOrderExchangeId;
    candidateIndex: number;
  }>,
): number {
  let score = 1_000;

  if (!candidate.supported) {
    score -= 1_000_000;
  }

  if (!candidate.healthy) {
    score -= 500_000;
  }

  if (!candidate.available) {
    score -= 500_000;
  }

  if (
    command.excludedExchangeIds.includes(
      candidate.exchangeId,
    )
  ) {
    score -= 1_000_000;
  }

  if (
    candidate.preferredExchangeId !==
      undefined &&
    candidate.exchangeId ===
      candidate.preferredExchangeId
  ) {
    score += 100_000;
  }

  switch (candidate.preference) {
    case "BEST_PRICE": {
      if (
        candidate.estimatedPrice !==
        undefined
      ) {
        score +=
          command.order.side === "BUY"
            ? -candidate.estimatedPrice
            : candidate.estimatedPrice;
      }

      break;
    }

    case "LOWEST_FEE": {
      if (
        candidate.estimatedFee !==
        undefined
      ) {
        score -=
          candidate.estimatedFee *
          10_000;
      }

      break;
    }

    case "LOWEST_LATENCY": {
      if (
        candidate.estimatedLatencyMs !==
        undefined
      ) {
        score -=
          candidate.estimatedLatencyMs;
      }

      break;
    }

    case "HIGHEST_LIQUIDITY": {
      if (
        candidate.availableQuantity !==
        undefined
      ) {
        score +=
          candidate.availableQuantity;
      }

      break;
    }

    case "PREFERRED_EXCHANGE":
    case "FAILOVER":
    case "DETERMINISTIC":
      break;

    default: {
      const exhaustiveCheck: never =
        candidate.preference;

      return exhaustiveCheck;
    }
  }

  /*
   * Earlier candidates win deterministic ties.
   */
  score -=
    candidate.candidateIndex *
    0.000001;

  return normalizeScore(
    score,
    candidate.exchangeId,
  );
}

function rankCandidates<
  TExchange extends UnifiedExchange,
>(
  candidates:
    readonly EvaluatedCandidate<TExchange>[],
  preference: OrderRoutingPreference,
  order: LiveOrder,
): readonly EvaluatedCandidate<TExchange>[] {
  const ranked = [
    ...candidates,
  ];

  ranked.sort(
    (left, right) => {
      const selectabilityDifference =
        Number(
          isBaseSelectable(
            right.routeCandidate,
          ),
        ) -
        Number(
          isBaseSelectable(
            left.routeCandidate,
          ),
        );

      if (
        selectabilityDifference !== 0
      ) {
        return selectabilityDifference;
      }

      if (
        preference ===
          "BEST_PRICE" &&
        left.routeCandidate
          .estimatedPrice !== undefined &&
        right.routeCandidate
          .estimatedPrice !== undefined
      ) {
        const priceDifference =
          order.side === "BUY"
            ? left.routeCandidate
                .estimatedPrice -
              right.routeCandidate
                .estimatedPrice
            : right.routeCandidate
                .estimatedPrice -
              left.routeCandidate
                .estimatedPrice;

        if (priceDifference !== 0) {
          return priceDifference;
        }
      }

      if (
        right.routeCandidate.score !==
        left.routeCandidate.score
      ) {
        return (
          right.routeCandidate.score -
          left.routeCandidate.score
        );
      }

      const exchangeDifference =
        left.routeCandidate.exchangeId
          .localeCompare(
            right.routeCandidate
              .exchangeId,
          );

      if (exchangeDifference !== 0) {
        return exchangeDifference;
      }

      return (
        left.candidateIndex -
        right.candidateIndex
      );
    },
  );

  return Object.freeze(ranked);
}

function isSelectableCandidate(
  candidate: OrderRouteCandidate,
  options:
    ResolvedSmartOrderRouterOptions,
): boolean {
  if (
    !candidate.supported ||
    !candidate.healthy ||
    !candidate.available
  ) {
    return false;
  }

  if (
    candidate.score <
    options.minimumCandidateScore
  ) {
    return false;
  }

  if (
    !options
      .allowPartiallyQualifiedCandidates &&
    candidate.rejectionReasons.length > 0
  ) {
    return false;
  }

  return true;
}

function isBaseSelectable(
  candidate: OrderRouteCandidate,
): boolean {
  return (
    candidate.supported &&
    candidate.healthy &&
    candidate.available &&
    candidate.rejectionReasons.length ===
      0
  );
}

function createSelectionReason(
  candidate: OrderRouteCandidate,
  preference: OrderRoutingPreference,
  preferredExchangeId:
    | LiveOrderExchangeId
    | undefined,
): string {
  if (
    preference ===
      "PREFERRED_EXCHANGE" &&
    preferredExchangeId !== undefined
  ) {
    return `Selected preferred exchange "${candidate.exchangeId}" for live-order execution.`;
  }

  return (
    `Selected exchange "${candidate.exchangeId}" using ` +
    `routing preference "${preference}" with score ${candidate.score}.`
  );
}

function resolveIncludedExchangeIds(
  command: RouteOrderCommand,
  preferredExchangeId:
    | LiveOrderExchangeId
    | undefined,
  preference: OrderRoutingPreference,
): readonly LiveOrderExchangeId[] | undefined {
  if (
    preference ===
      "PREFERRED_EXCHANGE" &&
    preferredExchangeId !== undefined
  ) {
    return Object.freeze([
      preferredExchangeId,
    ]);
  }

  if (
    command.order.exchangeId !==
      undefined
  ) {
    return Object.freeze([
      normalizeExchangeId(
        command.order.exchangeId,
      ),
    ]);
  }

  return undefined;
}

function resolvePreferredExchangeId(
  command: RouteOrderCommand,
  options:
    ResolvedSmartOrderRouterOptions,
):
  | LiveOrderExchangeId
  | undefined {
  if (
    command.preferredExchangeId !==
      undefined
  ) {
    return normalizeExchangeId(
      command.preferredExchangeId,
    );
  }

  if (
    options.respectOrderExchangeId &&
    command.order.exchangeId !==
      undefined
  ) {
    return normalizeExchangeId(
      command.order.exchangeId,
    );
  }

  return undefined;
}

function resolvePreferences(
  preferences:
    readonly OrderRoutingPreference[],
  options:
    ResolvedSmartOrderRouterOptions,
): readonly OrderRoutingPreference[] {
  if (!Array.isArray(preferences)) {
    throw new OrderRouterError(
      "INVALID_PREFERENCE",
      "Order routing preferences must be an array.",
    );
  }

  if (
    options.requireExplicitPreference &&
    preferences.length === 0
  ) {
    throw new OrderRouterError(
      "INVALID_PREFERENCE",
      "At least one explicit order-routing preference is required.",
    );
  }

  const normalized:
    OrderRoutingPreference[] = [];

  for (const preference of preferences) {
    if (
      !isOrderRoutingPreference(
        preference,
      )
    ) {
      throw new OrderRouterError(
        "INVALID_PREFERENCE",
        `Unsupported order-routing preference "${String(
          preference,
        )}".`,
      );
    }

    if (
      !normalized.includes(
        preference,
      )
    ) {
      normalized.push(
        preference,
      );
    }
  }

  if (normalized.length === 0) {
    normalized.push(
      options.defaultPreference,
    );
  }

  return Object.freeze(normalized);
}

function validateRouteCommand(
  command: RouteOrderCommand,
  options:
    ResolvedSmartOrderRouterOptions,
): void {
  if (!isRecord(command)) {
    throw new OrderRouterError(
      "INVALID_COMMAND",
      "Route-order command must be a record object.",
    );
  }

  if (command.operation !== "ROUTE") {
    throw new OrderRouterError(
      "INVALID_COMMAND",
      `Expected ROUTE operation but received "${String(
        command.operation,
      )}".`,
    );
  }

  validateLiveOrder(
    command.order,
  );

  if (
    !ROUTABLE_STATES.has(
      command.order.state as
        | "VALIDATED"
        | "ROUTING"
        | "RECOVERING",
    )
  ) {
    throw new OrderRouterError(
      "INVALID_ORDER_STATE",
      `Order "${command.order.orderId}" cannot be routed while in state "${command.order.state}".`,
      {
        orderId:
          command.order.orderId,
      },
    );
  }

  normalizeGeneratedIdentifier(
    command.context.commandId,
    "command.context.commandId",
  );

  normalizeGeneratedIdentifier(
    command.context.correlationId,
    "command.context.correlationId",
  );

  normalizeTimestamp(
    command.context.initiatedAt,
    "command.context.initiatedAt",
  );

  resolvePreferences(
    command.preferences,
    options,
  );

  normalizeExchangeIds(
    command.excludedExchangeIds,
    "excludedExchangeIds",
  );

  if (
    command.preferredExchangeId !==
      undefined
  ) {
    const preferred =
      normalizeExchangeId(
        command.preferredExchangeId,
      );

    if (
      command.excludedExchangeIds.includes(
        preferred,
      )
    ) {
      throw new OrderRouterError(
        "INVALID_COMMAND",
        `Preferred exchange "${preferred}" cannot also be excluded.`,
        {
          orderId:
            command.order.orderId,
          exchangeId:
            preferred,
        },
      );
    }
  }
}

function validateRouteSelection(
  selection: OrderRouteSelection,
): void {
  if (!isRecord(selection)) {
    throw new OrderRouterError(
      "INVALID_COMMAND",
      "Order route selection must be a record object.",
    );
  }

  normalizeGeneratedIdentifier(
    selection.routeId,
    "selection.routeId",
  );

  normalizeExchangeId(
    selection.exchangeId,
  );

  normalizeTimestamp(
    selection.selectedAt,
    "selection.selectedAt",
  );

  normalizeScore(
    selection.score,
    selection.exchangeId,
  );

  if (
    !isOrderRoutingPreference(
      selection.preference,
    )
  ) {
    throw new OrderRouterError(
      "INVALID_PREFERENCE",
      `Unsupported route-selection preference "${String(
        selection.preference,
      )}".`,
    );
  }

  if (
    typeof selection.reason !==
      "string" ||
    selection.reason.trim().length ===
      0
  ) {
    throw new OrderRouterError(
      "INVALID_COMMAND",
      "Route-selection reason must not be empty.",
    );
  }

  if (
    !Array.isArray(
      selection.candidates,
    )
  ) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      "Route-selection candidates must be an array.",
    );
  }
}

function validateCandidateEstimate(
  estimate:
    OrderRouteCandidateEstimate,
  exchangeId: string,
): void {
  if (!isRecord(estimate)) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      `Route estimate for exchange "${exchangeId}" must be a record object.`,
      {
        exchangeId,
      },
    );
  }

  validateOptionalBoolean(
    estimate.supported,
    "estimate.supported",
    exchangeId,
  );

  validateOptionalBoolean(
    estimate.healthy,
    "estimate.healthy",
    exchangeId,
  );

  validateOptionalBoolean(
    estimate.available,
    "estimate.available",
    exchangeId,
  );

  validateOptionalPositiveNumber(
    estimate.estimatedPrice,
    "estimate.estimatedPrice",
    exchangeId,
  );

  validateOptionalNonNegativeNumber(
    estimate.estimatedFee,
    "estimate.estimatedFee",
    exchangeId,
  );

  validateOptionalNonNegativeNumber(
    estimate.estimatedLatencyMs,
    "estimate.estimatedLatencyMs",
    exchangeId,
  );

  validateOptionalNonNegativeNumber(
    estimate.availableQuantity,
    "estimate.availableQuantity",
    exchangeId,
  );

  normalizeOptionalIdentifier(
    estimate.connectionId,
    "estimate.connectionId",
  );
}

function resolveOptions(
  options: SmartOrderRouterOptions,
): ResolvedSmartOrderRouterOptions {
  const defaultPreference:
    OrderRoutingPreference =
    options.defaultPreference ??
    DEFAULT_OPTIONS.defaultPreference;

  if (
    !isOrderRoutingPreference(
      defaultPreference,
    )
  ) {
    throw new OrderRouterError(
      "INVALID_PREFERENCE",
      `Unsupported default routing preference "${String(
        defaultPreference,
      )}".`,
    );
  }

  const minimumCandidateScore:
    number =
    options.minimumCandidateScore ??
    DEFAULT_OPTIONS
      .minimumCandidateScore;

  if (
    Number.isNaN(
      minimumCandidateScore,
    )
  ) {
    throw new OrderRouterError(
      "INVALID_COMMAND",
      "Minimum candidate score must be a number.",
    );
  }

  const requireExplicitPreference:
    boolean =
    options.requireExplicitPreference ??
    DEFAULT_OPTIONS
      .requireExplicitPreference;

  const strictPreferredExchange:
    boolean =
    options.strictPreferredExchange ??
    DEFAULT_OPTIONS
      .strictPreferredExchange;

  const respectOrderExchangeId:
    boolean =
    options.respectOrderExchangeId ??
    DEFAULT_OPTIONS
      .respectOrderExchangeId;

  const requireSufficientLiquidity:
    boolean =
    options.requireSufficientLiquidity ??
    DEFAULT_OPTIONS
      .requireSufficientLiquidity;

  const allowPartiallyQualifiedCandidates:
    boolean =
    options
      .allowPartiallyQualifiedCandidates ??
    DEFAULT_OPTIONS
      .allowPartiallyQualifiedCandidates;

  const metadata:
    Readonly<Record<string, unknown>> =
    options.metadata ??
    EMPTY_METADATA;

  const resolved:
    ResolvedSmartOrderRouterOptions = {
      defaultPreference,
      requireExplicitPreference,
      strictPreferredExchange,
      respectOrderExchangeId,
      requireSufficientLiquidity,
      allowPartiallyQualifiedCandidates,
      minimumCandidateScore,
      metadata:
        freezeRecord(metadata),
  };

  return Object.freeze(
    resolved,
  );
}

function freezeRouteCandidate(
  candidate: OrderRouteCandidate,
): OrderRouteCandidate {
  return Object.freeze({
    exchangeId:
      candidate.exchangeId,
    ...(candidate.connectionId ===
    undefined
      ? {}
      : {
          connectionId:
            candidate.connectionId,
        }),
    supported:
      candidate.supported,
    healthy:
      candidate.healthy,
    available:
      candidate.available,
    score:
      candidate.score,
    ...(candidate.estimatedPrice ===
    undefined
      ? {}
      : {
          estimatedPrice:
            candidate.estimatedPrice,
        }),
    ...(candidate.estimatedFee ===
    undefined
      ? {}
      : {
          estimatedFee:
            candidate.estimatedFee,
        }),
    ...(candidate.estimatedLatencyMs ===
    undefined
      ? {}
      : {
          estimatedLatencyMs:
            candidate.estimatedLatencyMs,
        }),
    ...(candidate.availableQuantity ===
    undefined
      ? {}
      : {
          availableQuantity:
            candidate.availableQuantity,
        }),
    rejectionReasons:
      Object.freeze([
        ...candidate
          .rejectionReasons,
      ]),
    metadata:
      freezeRecord(
        candidate.metadata,
      ),
  });
}

function freezeRouteSelection(
  selection: OrderRouteSelection,
): OrderRouteSelection {
  return Object.freeze({
    routeId:
      selection.routeId,
    exchangeId:
      selection.exchangeId,
    ...(selection.connectionId ===
    undefined
      ? {}
      : {
          connectionId:
            selection.connectionId,
        }),
    score:
      selection.score,
    selectedAt:
      selection.selectedAt,
    preference:
      selection.preference,
    reason:
      selection.reason,
    candidates:
      Object.freeze(
        selection.candidates.map(
          freezeRouteCandidate,
        ),
      ),
    metadata:
      freezeRecord(
        selection.metadata,
      ),
  });
}

function deriveCandidateHealth(
  candidate: unknown,
): boolean {
  const lifecycleSnapshot =
    readRecord(
      candidate,
      "lifecycleSnapshot",
    );

  const health =
    readRecord(
      lifecycleSnapshot,
      "health",
    );

  const status =
    readString(
      health,
      "status",
    );

  if (status === undefined) {
    return true;
  }

  return (
    status === "HEALTHY" ||
    status === "DEGRADED"
  );
}

function deriveCandidateAvailability(
  candidate: unknown,
): boolean {
  const lifecycleSnapshot =
    readRecord(
      candidate,
      "lifecycleSnapshot",
    );

  const state =
    readString(
      lifecycleSnapshot,
      "state",
    );

  if (state === undefined) {
    return true;
  }

  return (
    state === "RUNNING" ||
    state === "STARTED"
  );
}

function extractCandidateMetadata(
  candidate: unknown,
): Readonly<Record<string, unknown>> {
  const registryEntry =
    readRecord(
      candidate,
      "registryEntry",
    );

  const metadata =
    readRecord(
      registryEntry,
      "metadata",
    );

  return metadata ??
    EMPTY_METADATA;
}

function normalizeExchangeIds(
  exchangeIds:
    readonly LiveOrderExchangeId[],
  field: string,
): readonly LiveOrderExchangeId[] {
  if (!Array.isArray(exchangeIds)) {
    throw new OrderRouterError(
      "INVALID_EXCHANGE_ID",
      `${field} must be an array.`,
    );
  }

  const normalized:
    LiveOrderExchangeId[] = [];

  for (const exchangeId of exchangeIds) {
    const value =
      normalizeExchangeId(
        exchangeId,
      );

    if (!normalized.includes(value)) {
      normalized.push(value);
    }
  }

  return Object.freeze(normalized);
}

function normalizeExchangeId(
  value: unknown,
): LiveOrderExchangeId {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderRouterError(
      "INVALID_EXCHANGE_ID",
      "Exchange identifier must be a non-empty string.",
    );
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeGeneratedIdentifier(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new OrderRouterError(
      field === "routeId"
        ? "INVALID_ROUTE_ID"
        : "INVALID_COMMAND",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeOptionalIdentifier(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeGeneratedIdentifier(
    value,
    field,
  );
}

function normalizeTimestamp(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new OrderRouterError(
      "INVALID_TIMESTAMP",
      `${field} must be a non-negative safe-integer timestamp.`,
    );
  }

  return value;
}

function normalizeScore(
  value: unknown,
  exchangeId: string,
): number {
  if (
    typeof value !== "number" ||
    Number.isNaN(value)
  ) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      `Candidate score for exchange "${exchangeId}" must be a number.`,
      {
        exchangeId,
      },
    );
  }

  return value;
}

function validateOptionalBoolean(
  value: unknown,
  field: string,
  exchangeId: string,
): void {
  if (
    value !== undefined &&
    typeof value !== "boolean"
  ) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      `${field} must be boolean when supplied.`,
      {
        exchangeId,
      },
    );
  }
}

function validateOptionalPositiveNumber(
  value: unknown,
  field: string,
  exchangeId: string,
): void {
  if (value === undefined) {
    return;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      `${field} must be a positive finite number.`,
      {
        exchangeId,
      },
    );
  }
}

function validateOptionalNonNegativeNumber(
  value: unknown,
  field: string,
  exchangeId: string,
): void {
  if (value === undefined) {
    return;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new OrderRouterError(
      "INVALID_CANDIDATE",
      `${field} must be a non-negative finite number.`,
      {
        exchangeId,
      },
    );
  }
}

function validateExchangeRouter(
  router: unknown,
): asserts router is ExchangeRouterContract<UnifiedExchange> {
  if (
    !isRecord(router) ||
    typeof router.select !==
      "function" ||
    typeof router.route !==
      "function"
  ) {
    throw new OrderRouterError(
      "INVALID_DEPENDENCY",
      "Exchange router must provide select() and route() functions.",
    );
  }
}

function validateIdGenerator(
  generator: unknown,
): asserts generator is OrderIdGenerator {
  if (
    !isRecord(generator) ||
    typeof generator.nextRouteId !==
      "function"
  ) {
    throw new OrderRouterError(
      "INVALID_DEPENDENCY",
      "Order ID generator must provide nextRouteId().",
    );
  }
}

function validateClock(
  clock: unknown,
): asserts clock is OrderClock {
  if (
    !isRecord(clock) ||
    typeof clock.now !== "function"
  ) {
    throw new OrderRouterError(
      "INVALID_DEPENDENCY",
      "Order router clock must provide now().",
    );
  }
}

function validateEstimator(
  estimator: unknown,
): asserts estimator is
  OrderRouteCandidateEstimator<UnifiedExchange> {
  if (
    !isRecord(estimator) ||
    typeof estimator.estimate !==
      "function"
  ) {
    throw new OrderRouterError(
      "INVALID_DEPENDENCY",
      "Candidate estimator must provide estimate().",
    );
  }
}

function validateScoringPolicy(
  policy: unknown,
): asserts policy is OrderRouteScoringPolicy {
  if (
    !isRecord(policy) ||
    typeof policy.score !==
      "function"
  ) {
    throw new OrderRouterError(
      "INVALID_DEPENDENCY",
      "Route-scoring policy must provide score().",
    );
  }
}

function isOrderRoutingPreference(
  value: unknown,
): value is OrderRoutingPreference {
  return (
    typeof value === "string" &&
    (
      ORDER_ROUTING_PREFERENCES as
        readonly string[]
    ).includes(value)
  );
}

function readRecord(
  source: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];

  return isRecord(value)
    ? value
    : undefined;
}

function readString(
  source: unknown,
  key: string,
): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];

  return typeof value === "string"
    ? value
    : undefined;
}

function readFiniteNumber(
  source: unknown,
  key: string,
): number | undefined {
  if (!isRecord(source)) {
    return undefined;
  }

  const value = source[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : undefined;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function freezeRecord(
  source: Readonly<
    Record<string, unknown>
  >,
): Readonly<Record<string, unknown>> {
  const result:
    Record<string, unknown> = {};

  for (
    const key of Object.keys(
      source,
    ).sort()
  ) {
    const value =
      source[key];

    if (value !== undefined) {
      result[key] =
        freezeUnknown(value);
    }
  }

  return Object.freeze(result);
}

function freezeUnknown(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map(
        freezeUnknown,
      ),
    );
  }

  if (isRecord(value)) {
    return freezeRecord(value);
  }

  return value;
}