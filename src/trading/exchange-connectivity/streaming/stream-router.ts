/**
 * QuantumTradeAI
 * Milestone 19 — Live Market Data Streaming & WebSocket Orchestration
 *
 * File 6:
 * Stream Router
 *
 * The stream router receives normalized streaming events and dispatches them
 * to matching subscription consumers.
 *
 * Responsibilities:
 * - Validate normalized stream events
 * - Match events to registered subscriptions
 * - Route by exchange, connection, channel, symbol and subscription ID
 * - Preserve deterministic routing and listener order
 * - Prevent duplicate listener delivery
 * - Isolate listener failures
 * - Track routing metrics and failures
 * - Produce immutable routing snapshots
 * - Support deterministic tests through injected clocks
 */

import {
  StreamingChannel,
  StreamingConnectionId,
  StreamingExchangeId,
  StreamingSubscriptionId,
  StreamingSymbol,
  UnifiedStreamEvent,
  UnifiedStreamEventListener,
  UnifiedStreamEventType,
  UnifiedStreamingSubscriptionSnapshot,
  freezeUnifiedStreamEvent,
  normalizeStreamingSymbol,
  validateStreamingChannel,
  validateStreamingConnectionId,
  validateStreamingExchangeId,
  validateStreamingSubscriptionId,
  validateUnifiedStreamEvent,
  validateUnifiedStreamEventType,
} from "./unified-streaming-interface";

import {
  StreamingSubscriptionRegistry,
} from "./subscription-registry";

export type StreamRouteId = string;
export type StreamRouteListenerId = string;

export type StreamRoutingStatus =
  | "ROUTED"
  | "UNMATCHED"
  | "DROPPED"
  | "FAILED";

export type StreamRouteMatchMode =
  | "SUBSCRIPTION"
  | "CONNECTION"
  | "CHANNEL"
  | "SYMBOL"
  | "EVENT_TYPE"
  | "GLOBAL";

export interface StreamRouterClock {
  now(): number;
}

export interface StreamRouteFilter {
  readonly subscriptionIds?: readonly StreamingSubscriptionId[];
  readonly exchangeIds?: readonly StreamingExchangeId[];
  readonly connectionIds?: readonly StreamingConnectionId[];
  readonly channels?: readonly StreamingChannel[];
  readonly symbols?: readonly StreamingSymbol[];
  readonly eventTypes?: readonly UnifiedStreamEventType[];

  /**
   * When true, events without a symbol may match a route with no symbol
   * restriction.
   *
   * Defaults to true.
   */
  readonly includeSymbolLessEvents?: boolean;
}

export interface StreamRouteRegistration {
  readonly routeId: StreamRouteId;
  readonly listener: UnifiedStreamEventListener;
  readonly filter?: StreamRouteFilter;

  /**
   * Lower numeric values execute first.
   *
   * Defaults to 0.
   */
  readonly priority?: number;

  /**
   * When false, the route is registered but does not receive events.
   *
   * Defaults to true.
   */
  readonly enabled?: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StreamRouteSnapshot {
  readonly routeId: StreamRouteId;
  readonly listenerId: StreamRouteListenerId;
  readonly enabled: boolean;
  readonly priority: number;
  readonly createdAt: number;
  readonly lastChangedAt: number;
  readonly matchedEventCount: number;
  readonly deliveredEventCount: number;
  readonly failedDeliveryCount: number;
  readonly lastMatchedAt?: number;
  readonly lastDeliveredAt?: number;
  readonly lastFailureAt?: number;
  readonly filter: Readonly<{
    readonly subscriptionIds: readonly StreamingSubscriptionId[];
    readonly exchangeIds: readonly StreamingExchangeId[];
    readonly connectionIds: readonly StreamingConnectionId[];
    readonly channels: readonly StreamingChannel[];
    readonly symbols: readonly StreamingSymbol[];
    readonly eventTypes: readonly UnifiedStreamEventType[];
    readonly includeSymbolLessEvents: boolean;
  }>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface StreamRoutingFailure {
  readonly routeId: StreamRouteId;
  readonly listenerId: StreamRouteListenerId;
  readonly eventId: string;
  readonly occurredAt: number;
  readonly error: Error;
}

export interface StreamRoutingResult {
  readonly eventId: string;
  readonly status: StreamRoutingStatus;
  readonly routedAt: number;
  readonly matchedSubscriptionIds:
    readonly StreamingSubscriptionId[];
  readonly matchedRouteIds: readonly StreamRouteId[];
  readonly deliveredRouteIds: readonly StreamRouteId[];
  readonly failures: readonly StreamRoutingFailure[];
  readonly reason?: string;
}

export interface StreamRouterSnapshot {
  readonly generatedAt: number;
  readonly disposed: boolean;
  readonly totalRoutes: number;
  readonly enabledRoutes: number;
  readonly disabledRoutes: number;
  readonly receivedEventCount: number;
  readonly routedEventCount: number;
  readonly unmatchedEventCount: number;
  readonly droppedEventCount: number;
  readonly failedEventCount: number;
  readonly deliveredEventCount: number;
  readonly listenerFailureCount: number;
  readonly routes: readonly StreamRouteSnapshot[];
}

export interface StreamRouterOptions {
  /**
   * When true, listener failures are rethrown after all matching listeners
   * have been attempted.
   *
   * Defaults to false.
   */
  readonly propagateListenerErrors?: boolean;

  /**
   * When true, events without any matching active subscription are dropped
   * before route evaluation.
   *
   * Defaults to true.
   */
  readonly requireActiveSubscription?: boolean;

  /**
   * When true, the event subscriptionId must refer to an active registry
   * subscription when supplied.
   *
   * Defaults to true.
   */
  readonly validateExplicitSubscriptionId?: boolean;
}

interface NormalizedStreamRouteFilter {
  readonly subscriptionIds:
    ReadonlySet<StreamingSubscriptionId>;
  readonly exchangeIds:
    ReadonlySet<StreamingExchangeId>;
  readonly connectionIds:
    ReadonlySet<StreamingConnectionId>;
  readonly channels: ReadonlySet<StreamingChannel>;
  readonly symbols: ReadonlySet<StreamingSymbol>;
  readonly eventTypes: ReadonlySet<UnifiedStreamEventType>;
  readonly includeSymbolLessEvents: boolean;
}

interface MutableStreamRoute {
  readonly routeId: StreamRouteId;
  readonly listenerId: StreamRouteListenerId;
  readonly listener: UnifiedStreamEventListener;
  readonly filter: NormalizedStreamRouteFilter;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;

  enabled: boolean;
  priority: number;
  lastChangedAt: number;
  matchedEventCount: number;
  deliveredEventCount: number;
  failedDeliveryCount: number;
  lastMatchedAt?: number;
  lastDeliveredAt?: number;
  lastFailureAt?: number;
}

const SYSTEM_CLOCK: StreamRouterClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_METADATA: Readonly<Record<string, unknown>> =
  Object.freeze({});

export class StreamRouterError extends Error {
  public readonly code: string;
  public readonly routeId?: StreamRouteId;
  public readonly eventId?: string;
  public readonly subscriptionId?: StreamingSubscriptionId;

  public constructor(
    code: string,
    message: string,
    context?: {
      readonly routeId?: StreamRouteId;
      readonly eventId?: string;
      readonly subscriptionId?: StreamingSubscriptionId;
      readonly cause?: unknown;
    },
  ) {
    super(message, {
      cause: context?.cause,
    });

    this.name = "StreamRouterError";
    this.code = code;
    this.routeId = context?.routeId;
    this.eventId = context?.eventId;
    this.subscriptionId = context?.subscriptionId;
  }
}

/**
 * Deterministic router for normalized exchange streaming events.
 */
export class StreamRouter {
  private readonly routes =
    new Map<StreamRouteId, MutableStreamRoute>();

  private readonly registry: StreamingSubscriptionRegistry;
  private readonly clock: StreamRouterClock;

  private readonly propagateListenerErrors: boolean;
  private readonly requireActiveSubscription: boolean;
  private readonly validateExplicitSubscriptionId: boolean;

  private nextListenerSequence = 1;

  private receivedEventCount = 0;
  private routedEventCount = 0;
  private unmatchedEventCount = 0;
  private droppedEventCount = 0;
  private failedEventCount = 0;
  private deliveredEventCount = 0;
  private listenerFailureCount = 0;
  private disposed = false;

  public constructor(
    registry: StreamingSubscriptionRegistry,
    options: StreamRouterOptions = {},
    clock: StreamRouterClock = SYSTEM_CLOCK,
  ) {
    this.registry = validateRegistry(registry);
    this.clock = validateClock(clock);

    this.propagateListenerErrors =
      options.propagateListenerErrors ?? false;

    this.requireActiveSubscription =
      options.requireActiveSubscription ?? true;

    this.validateExplicitSubscriptionId =
      options.validateExplicitSubscriptionId ?? true;
  }

  /**
   * Registers a route and returns an idempotent unregister function.
   */
  public registerRoute(
    registration: StreamRouteRegistration,
  ): () => void {
    this.assertActive();

    validateRouteRegistration(registration);

    const routeId = normalizeRouteId(registration.routeId);

    if (this.routes.has(routeId)) {
      throw new StreamRouterError(
        "DUPLICATE_ROUTE_ID",
        `Stream route "${routeId}" is already registered.`,
        {
          routeId,
        },
      );
    }

    const timestamp = this.now();

    const route: MutableStreamRoute = {
      routeId,
      listenerId: this.createListenerId(),
      listener: registration.listener,
      filter: normalizeRouteFilter(registration.filter),
      metadata:
        registration.metadata === undefined
          ? EMPTY_METADATA
          : Object.freeze({ ...registration.metadata }),
      createdAt: timestamp,
      enabled: registration.enabled ?? true,
      priority: registration.priority ?? 0,
      lastChangedAt: timestamp,
      matchedEventCount: 0,
      deliveredEventCount: 0,
      failedDeliveryCount: 0,
    };

    this.routes.set(routeId, route);

    let registered = true;

    return (): void => {
      if (!registered) {
        return;
      }

      registered = false;
      this.routes.delete(routeId);
    };
  }

  public removeRoute(routeId: StreamRouteId): void {
    this.assertActive();

    const normalizedRouteId = normalizeRouteId(routeId);

    if (!this.routes.delete(normalizedRouteId)) {
      throw new StreamRouterError(
        "ROUTE_NOT_FOUND",
        `Stream route "${normalizedRouteId}" was not found.`,
        {
          routeId: normalizedRouteId,
        },
      );
    }
  }

  public setRouteEnabled(
    routeId: StreamRouteId,
    enabled: boolean,
  ): StreamRouteSnapshot {
    this.assertActive();

    if (typeof enabled !== "boolean") {
      throw new StreamRouterError(
        "INVALID_ROUTE_ENABLED",
        "Route enabled state must be boolean.",
        {
          routeId,
        },
      );
    }

    const route = this.getRequiredRoute(
      normalizeRouteId(routeId),
    );

    route.enabled = enabled;
    route.lastChangedAt = this.now();

    return createRouteSnapshot(route);
  }

  public setRoutePriority(
    routeId: StreamRouteId,
    priority: number,
  ): StreamRouteSnapshot {
    this.assertActive();

    validatePriority(priority);

    const route = this.getRequiredRoute(
      normalizeRouteId(routeId),
    );

    route.priority = priority;
    route.lastChangedAt = this.now();

    return createRouteSnapshot(route);
  }

  /**
   * Routes one normalized event.
   */
  public async route(
    event: UnifiedStreamEvent,
  ): Promise<StreamRoutingResult> {
    this.assertActive();

    validateUnifiedStreamEvent(event);

    const immutableEvent = freezeUnifiedStreamEvent(event);

    this.receivedEventCount += 1;

    const matchingSubscriptions =
      this.resolveMatchingSubscriptions(immutableEvent);

    if (
      this.requireActiveSubscription &&
      matchingSubscriptions.length === 0
    ) {
      this.droppedEventCount += 1;

      return freezeRoutingResult({
        eventId: immutableEvent.eventId,
        status: "DROPPED",
        routedAt: this.now(),
        matchedSubscriptionIds: [],
        matchedRouteIds: [],
        deliveredRouteIds: [],
        failures: [],
        reason:
          "No active subscription matched the stream event.",
      });
    }

    const matchedSubscriptionIds =
      matchingSubscriptions.map(
        (subscription) => subscription.subscriptionId,
      );

    const matchingRoutes = this.getOrderedRoutes().filter(
      (route) =>
        route.enabled &&
        routeMatchesEvent(
          route,
          immutableEvent,
          matchedSubscriptionIds,
        ),
    );

    if (matchingRoutes.length === 0) {
      this.unmatchedEventCount += 1;

      return freezeRoutingResult({
        eventId: immutableEvent.eventId,
        status: "UNMATCHED",
        routedAt: this.now(),
        matchedSubscriptionIds,
        matchedRouteIds: [],
        deliveredRouteIds: [],
        failures: [],
        reason: "No enabled stream route matched the event.",
      });
    }

    const matchedRouteIds: StreamRouteId[] = [];
    const deliveredRouteIds: StreamRouteId[] = [];
    const failures: StreamRoutingFailure[] = [];

    for (const route of matchingRoutes) {
      const matchedAt = this.now();

      route.matchedEventCount += 1;
      route.lastMatchedAt = matchedAt;
      matchedRouteIds.push(route.routeId);

      try {
        await route.listener(immutableEvent);

        const deliveredAt = this.now();

        route.deliveredEventCount += 1;
        route.lastDeliveredAt = deliveredAt;

        this.deliveredEventCount += 1;

        deliveredRouteIds.push(route.routeId);
      } catch (error: unknown) {
        const failureAt = this.now();
        const normalizedError = normalizeError(error);

        route.failedDeliveryCount += 1;
        route.lastFailureAt = failureAt;

        this.listenerFailureCount += 1;

        failures.push(
          Object.freeze({
            routeId: route.routeId,
            listenerId: route.listenerId,
            eventId: immutableEvent.eventId,
            occurredAt: failureAt,
            error: normalizedError,
          }),
        );
      }
    }

    if (deliveredRouteIds.length > 0) {
      this.routedEventCount += 1;
    }

    if (failures.length > 0) {
      this.failedEventCount += 1;
    }

    if (
      failures.length > 0 &&
      this.propagateListenerErrors
    ) {
      throw new StreamRouterError(
        "STREAM_ROUTE_DELIVERY_FAILED",
        `One or more routes failed while delivering event "${immutableEvent.eventId}".`,
        {
          eventId: immutableEvent.eventId,
          cause: failures[0]?.error,
        },
      );
    }

    return freezeRoutingResult({
      eventId: immutableEvent.eventId,
      status:
        failures.length > 0 && deliveredRouteIds.length === 0
          ? "FAILED"
          : "ROUTED",
      routedAt: this.now(),
      matchedSubscriptionIds,
      matchedRouteIds,
      deliveredRouteIds,
      failures,
      reason:
        failures.length > 0
          ? "One or more route listeners failed."
          : undefined,
    });
  }

  /**
   * Routes events sequentially in their supplied order.
   */
  public async routeAll(
    events: readonly UnifiedStreamEvent[],
  ): Promise<readonly StreamRoutingResult[]> {
    this.assertActive();

    if (!Array.isArray(events)) {
      throw new StreamRouterError(
        "INVALID_EVENT_COLLECTION",
        "events must be an array.",
      );
    }

    const results: StreamRoutingResult[] = [];

    for (const event of events) {
      results.push(await this.route(event));
    }

    return Object.freeze(results);
  }

  public getRoute(
    routeId: StreamRouteId,
  ): StreamRouteSnapshot | undefined {
    const normalizedRouteId = normalizeRouteId(routeId);
    const route = this.routes.get(normalizedRouteId);

    return route === undefined
      ? undefined
      : createRouteSnapshot(route);
  }

  public getRoutes(): readonly StreamRouteSnapshot[] {
    return Object.freeze(
      this.getOrderedRoutes().map((route) =>
        createRouteSnapshot(route),
      ),
    );
  }

  public getSnapshot(): StreamRouterSnapshot {
    const routes = this.getRoutes();

    let enabledRoutes = 0;

    for (const route of routes) {
      if (route.enabled) {
        enabledRoutes += 1;
      }
    }

    return Object.freeze({
      generatedAt: this.now(),
      disposed: this.disposed,
      totalRoutes: routes.length,
      enabledRoutes,
      disabledRoutes: routes.length - enabledRoutes,
      receivedEventCount: this.receivedEventCount,
      routedEventCount: this.routedEventCount,
      unmatchedEventCount: this.unmatchedEventCount,
      droppedEventCount: this.droppedEventCount,
      failedEventCount: this.failedEventCount,
      deliveredEventCount: this.deliveredEventCount,
      listenerFailureCount: this.listenerFailureCount,
      routes,
    });
  }

  public get routeCount(): number {
    return this.routes.size;
  }

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.routes.clear();
    this.disposed = true;
  }

  private resolveMatchingSubscriptions(
    event: UnifiedStreamEvent,
  ): readonly UnifiedStreamingSubscriptionSnapshot[] {
    if (event.subscriptionId !== undefined) {
      const subscription =
        this.registry.get(event.subscriptionId);

      if (subscription === undefined) {
        if (this.validateExplicitSubscriptionId) {
          throw new StreamRouterError(
            "EVENT_SUBSCRIPTION_NOT_FOUND",
            `Event references unknown subscription "${event.subscriptionId}".`,
            {
              eventId: event.eventId,
              subscriptionId: event.subscriptionId,
            },
          );
        }

        return Object.freeze([]);
      }

      if (subscription.state !== "ACTIVE") {
        if (this.validateExplicitSubscriptionId) {
          throw new StreamRouterError(
            "EVENT_SUBSCRIPTION_NOT_ACTIVE",
            `Event references subscription "${event.subscriptionId}" in state "${subscription.state}".`,
            {
              eventId: event.eventId,
              subscriptionId: event.subscriptionId,
            },
          );
        }

        return Object.freeze([]);
      }

      if (!subscriptionMatchesEvent(subscription, event)) {
        throw new StreamRouterError(
          "EVENT_SUBSCRIPTION_MISMATCH",
          `Event "${event.eventId}" does not match subscription "${event.subscriptionId}".`,
          {
            eventId: event.eventId,
            subscriptionId: event.subscriptionId,
          },
        );
      }

      return Object.freeze([subscription]);
    }

    const candidates = this.registry.query({
      exchangeIds: [event.exchangeId],
      connectionIds: [event.connectionId],
      channels: [event.channel],
      states: ["ACTIVE"],
      includeUnassignedConnections: false,
    });

    const matching = candidates.filter(
      (subscription) =>
        subscriptionMatchesEvent(subscription, event),
    );

    return Object.freeze(matching);
  }

  private getRequiredRoute(
    routeId: StreamRouteId,
  ): MutableStreamRoute {
    const route = this.routes.get(routeId);

    if (route === undefined) {
      throw new StreamRouterError(
        "ROUTE_NOT_FOUND",
        `Stream route "${routeId}" was not found.`,
        {
          routeId,
        },
      );
    }

    return route;
  }

  private getOrderedRoutes(): MutableStreamRoute[] {
    return [...this.routes.values()].sort(
      (left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }

        if (left.createdAt !== right.createdAt) {
          return left.createdAt - right.createdAt;
        }

        return left.routeId.localeCompare(right.routeId);
      },
    );
  }

  private createListenerId(): StreamRouteListenerId {
    const sequence = this.nextListenerSequence;

    this.nextListenerSequence += 1;

    return `stream-listener-${sequence
      .toString()
      .padStart(8, "0")}`;
  }

  private now(): number {
    const timestamp = this.clock.now();

    validateTimestamp(timestamp, "clock.now()");

    return timestamp;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new StreamRouterError(
        "STREAM_ROUTER_DISPOSED",
        "The stream router has been disposed.",
      );
    }
  }
}

function subscriptionMatchesEvent(
  subscription: UnifiedStreamingSubscriptionSnapshot,
  event: UnifiedStreamEvent,
): boolean {
  if (
    subscription.exchangeId !==
    normalizeExchangeId(event.exchangeId)
  ) {
    return false;
  }

  if (
    subscription.connectionId !== undefined &&
    subscription.connectionId !== event.connectionId
  ) {
    return false;
  }

  if (
    subscription.channel !== normalizeChannel(event.channel)
  ) {
    return false;
  }

  if (subscription.symbol !== undefined) {
    if (event.symbol === undefined) {
      return false;
    }

    if (
      subscription.symbol !==
      normalizeStreamingSymbol(event.symbol)
    ) {
      return false;
    }
  }

  return true;
}

function routeMatchesEvent(
  route: MutableStreamRoute,
  event: UnifiedStreamEvent,
  matchedSubscriptionIds:
    readonly StreamingSubscriptionId[],
): boolean {
  const filter = route.filter;

  if (
    filter.subscriptionIds.size > 0 &&
    !matchedSubscriptionIds.some((subscriptionId) =>
      filter.subscriptionIds.has(subscriptionId),
    )
  ) {
    return false;
  }

  if (
    filter.exchangeIds.size > 0 &&
    !filter.exchangeIds.has(
      normalizeExchangeId(event.exchangeId),
    )
  ) {
    return false;
  }

  if (
    filter.connectionIds.size > 0 &&
    !filter.connectionIds.has(event.connectionId)
  ) {
    return false;
  }

  if (
    filter.channels.size > 0 &&
    !filter.channels.has(normalizeChannel(event.channel))
  ) {
    return false;
  }

  if (filter.symbols.size > 0) {
    if (event.symbol === undefined) {
      return filter.includeSymbolLessEvents;
    }

    if (
      !filter.symbols.has(
        normalizeStreamingSymbol(event.symbol),
      )
    ) {
      return false;
    }
  }

  if (
    filter.eventTypes.size > 0 &&
    !filter.eventTypes.has(event.type)
  ) {
    return false;
  }

  return true;
}

function validateRouteRegistration(
  registration: StreamRouteRegistration,
): void {
  if (
    registration === null ||
    typeof registration !== "object"
  ) {
    throw new StreamRouterError(
      "INVALID_ROUTE_REGISTRATION",
      "Stream route registration must be an object.",
    );
  }

  normalizeRouteId(registration.routeId);

  if (typeof registration.listener !== "function") {
    throw new StreamRouterError(
      "INVALID_ROUTE_LISTENER",
      "Stream route listener must be a function.",
      {
        routeId: registration.routeId,
      },
    );
  }

  if (registration.priority !== undefined) {
    validatePriority(registration.priority);
  }

  if (
    registration.enabled !== undefined &&
    typeof registration.enabled !== "boolean"
  ) {
    throw new StreamRouterError(
      "INVALID_ROUTE_ENABLED",
      "Stream route enabled must be boolean when provided.",
      {
        routeId: registration.routeId,
      },
    );
  }

  validateRouteFilter(registration.filter);
  validateOptionalRecord(
    registration.metadata,
    "registration.metadata",
  );
}

function validateRouteFilter(
  filter: StreamRouteFilter | undefined,
): void {
  if (filter === undefined) {
    return;
  }

  if (
    filter === null ||
    typeof filter !== "object"
  ) {
    throw new StreamRouterError(
      "INVALID_ROUTE_FILTER",
      "Stream route filter must be an object.",
    );
  }

  validateOptionalArray(
    filter.subscriptionIds,
    "filter.subscriptionIds",
  );

  validateOptionalArray(
    filter.exchangeIds,
    "filter.exchangeIds",
  );

  validateOptionalArray(
    filter.connectionIds,
    "filter.connectionIds",
  );

  validateOptionalArray(
    filter.channels,
    "filter.channels",
  );

  validateOptionalArray(
    filter.symbols,
    "filter.symbols",
  );

  validateOptionalArray(
    filter.eventTypes,
    "filter.eventTypes",
  );

  if (
    filter.includeSymbolLessEvents !== undefined &&
    typeof filter.includeSymbolLessEvents !== "boolean"
  ) {
    throw new StreamRouterError(
      "INVALID_INCLUDE_SYMBOL_LESS_EVENTS",
      "includeSymbolLessEvents must be boolean when provided.",
    );
  }
}

function normalizeRouteFilter(
  filter: StreamRouteFilter | undefined,
): NormalizedStreamRouteFilter {
  validateRouteFilter(filter);

  return Object.freeze({
    subscriptionIds: new Set(
      (filter?.subscriptionIds ?? []).map(
        normalizeSubscriptionId,
      ),
    ),

    exchangeIds: new Set(
      (filter?.exchangeIds ?? []).map(
        normalizeExchangeId,
      ),
    ),

    connectionIds: new Set(
      (filter?.connectionIds ?? []).map(
        normalizeConnectionId,
      ),
    ),

    channels: new Set(
      (filter?.channels ?? []).map(normalizeChannel),
    ),

    symbols: new Set(
      (filter?.symbols ?? []).map(
        normalizeStreamingSymbol,
      ),
    ),

    eventTypes: new Set(
      (filter?.eventTypes ?? []).map((eventType) => {
        validateUnifiedStreamEventType(eventType);
        return eventType;
      }),
    ),

    includeSymbolLessEvents:
      filter?.includeSymbolLessEvents ?? true,
  });
}

function createRouteSnapshot(
  route: MutableStreamRoute,
): StreamRouteSnapshot {
  return Object.freeze({
    routeId: route.routeId,
    listenerId: route.listenerId,
    enabled: route.enabled,
    priority: route.priority,
    createdAt: route.createdAt,
    lastChangedAt: route.lastChangedAt,
    matchedEventCount: route.matchedEventCount,
    deliveredEventCount: route.deliveredEventCount,
    failedDeliveryCount: route.failedDeliveryCount,
    lastMatchedAt: route.lastMatchedAt,
    lastDeliveredAt: route.lastDeliveredAt,
    lastFailureAt: route.lastFailureAt,
    filter: Object.freeze({
      subscriptionIds: Object.freeze(
        [...route.filter.subscriptionIds].sort(),
      ),
      exchangeIds: Object.freeze(
        [...route.filter.exchangeIds].sort(),
      ),
      connectionIds: Object.freeze(
        [...route.filter.connectionIds].sort(),
      ),
      channels: Object.freeze(
        [...route.filter.channels].sort(),
      ),
      symbols: Object.freeze(
        [...route.filter.symbols].sort(),
      ),
      eventTypes: Object.freeze(
        [...route.filter.eventTypes].sort(),
      ),
      includeSymbolLessEvents:
        route.filter.includeSymbolLessEvents,
    }),
    metadata: Object.freeze({ ...route.metadata }),
  });
}

function freezeRoutingResult(input: {
  readonly eventId: string;
  readonly status: StreamRoutingStatus;
  readonly routedAt: number;
  readonly matchedSubscriptionIds:
    readonly StreamingSubscriptionId[];
  readonly matchedRouteIds: readonly StreamRouteId[];
  readonly deliveredRouteIds: readonly StreamRouteId[];
  readonly failures: readonly StreamRoutingFailure[];
  readonly reason?: string;
}): StreamRoutingResult {
  return Object.freeze({
    eventId: input.eventId,
    status: input.status,
    routedAt: input.routedAt,
    matchedSubscriptionIds: Object.freeze([
      ...input.matchedSubscriptionIds,
    ]),
    matchedRouteIds: Object.freeze([
      ...input.matchedRouteIds,
    ]),
    deliveredRouteIds: Object.freeze([
      ...input.deliveredRouteIds,
    ]),
    failures: Object.freeze(
      input.failures.map((failure) =>
        Object.freeze({ ...failure }),
      ),
    ),
    reason: input.reason,
  });
}

function validateRegistry(
  registry: StreamingSubscriptionRegistry,
): StreamingSubscriptionRegistry {
  if (
    registry === null ||
    typeof registry !== "object" ||
    typeof registry.get !== "function" ||
    typeof registry.query !== "function"
  ) {
    throw new StreamRouterError(
      "INVALID_SUBSCRIPTION_REGISTRY",
      "A valid StreamingSubscriptionRegistry instance is required.",
    );
  }

  return registry;
}

function validateClock(
  clock: StreamRouterClock,
): StreamRouterClock {
  if (
    clock === null ||
    typeof clock !== "object" ||
    typeof clock.now !== "function"
  ) {
    throw new StreamRouterError(
      "INVALID_CLOCK",
      "Stream router clock must implement now().",
    );
  }

  validateTimestamp(clock.now(), "clock.now()");

  return clock;
}

function normalizeRouteId(
  routeId: StreamRouteId,
): StreamRouteId {
  return validateIdentifier(routeId, "routeId");
}

function normalizeSubscriptionId(
  subscriptionId: StreamingSubscriptionId,
): StreamingSubscriptionId {
  validateStreamingSubscriptionId(subscriptionId);

  return subscriptionId.trim();
}

function normalizeExchangeId(
  exchangeId: StreamingExchangeId,
): StreamingExchangeId {
  validateStreamingExchangeId(exchangeId);

  return exchangeId.trim().toUpperCase();
}

function normalizeConnectionId(
  connectionId: StreamingConnectionId,
): StreamingConnectionId {
  validateStreamingConnectionId(connectionId);

  return connectionId.trim();
}

function normalizeChannel(
  channel: StreamingChannel,
): StreamingChannel {
  validateStreamingChannel(channel);

  return channel.trim().toUpperCase();
}

function validateIdentifier(
  value: string,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new StreamRouterError(
      "INVALID_IDENTIFIER",
      `${field} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function validatePriority(priority: number): void {
  if (
    !Number.isSafeInteger(priority)
  ) {
    throw new StreamRouterError(
      "INVALID_ROUTE_PRIORITY",
      "Route priority must be a safe integer.",
    );
  }
}

function validateTimestamp(
  timestamp: number,
  field: string,
): void {
  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0
  ) {
    throw new StreamRouterError(
      "INVALID_TIMESTAMP",
      `${field} must be a finite non-negative number.`,
    );
  }
}

function validateOptionalArray(
  value: readonly unknown[] | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    !Array.isArray(value)
  ) {
    throw new StreamRouterError(
      "INVALID_FILTER_ARRAY",
      `${field} must be an array when provided.`,
    );
  }
}

function validateOptionalRecord(
  value: Readonly<Record<string, unknown>> | undefined,
  field: string,
): void {
  if (
    value !== undefined &&
    (value === null ||
      typeof value !== "object" ||
      Array.isArray(value))
  ) {
    throw new StreamRouterError(
      "INVALID_RECORD",
      `${field} must be an object when provided.`,
    );
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Unknown stream router error.");
  }
}