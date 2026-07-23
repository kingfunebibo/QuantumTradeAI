/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-registry.ts
 *
 * Deterministic in-memory registry for multi-agent registrations and health.
 */

import {
  type MultiAgentAvailability,
  type MultiAgentCapability,
  type MultiAgentHealthSnapshot,
  type MultiAgentId,
  type MultiAgentLifecycleState,
  type MultiAgentRegistration,
  type MultiAgentRegistryPort,
  type MultiAgentRole,
  type MultiAgentScore,
  type MultiAgentTimestamp,
  type MultiAgentValidationIssue,
  type MultiAgentValidatorPort,
} from "./ai-multi-agent-contracts";
import { aiMultiAgentValidator } from "./ai-multi-agent-validator";

export type MultiAgentRegistryErrorCode =
  | "INVALID_REGISTRATION"
  | "AGENT_ALREADY_REGISTERED"
  | "AGENT_NOT_FOUND"
  | "INVALID_HEALTH_SNAPSHOT"
  | "INVALID_LIFECYCLE_TRANSITION"
  | "INVALID_AVAILABILITY_TRANSITION"
  | "REGISTRATION_IMMUTABLE_FIELD_CHANGED"
  | "REGISTRY_CAPACITY_EXCEEDED";

export interface MultiAgentRegistryErrorDetails {
  readonly agentId?: MultiAgentId;
  readonly issues?: readonly MultiAgentValidationIssue[];
  readonly fromLifecycleState?: MultiAgentLifecycleState;
  readonly toLifecycleState?: MultiAgentLifecycleState;
  readonly fromAvailability?: MultiAgentAvailability;
  readonly toAvailability?: MultiAgentAvailability;
  readonly capacity?: number;
}

export class MultiAgentRegistryError extends Error {
  public readonly code: MultiAgentRegistryErrorCode;
  public readonly details: MultiAgentRegistryErrorDetails;

  public constructor(
    code: MultiAgentRegistryErrorCode,
    message: string,
    details: MultiAgentRegistryErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentRegistryError";
    this.code = code;
    this.details = deepFreeze(details);
  }
}

export interface MultiAgentRegistryOptions {
  readonly validator?: MultiAgentValidatorPort;
  readonly maximumAgents?: number;
  readonly allowRegistrationReplacement?: boolean;
  readonly requireRegistrationIdentityStability?: boolean;
  readonly initialLifecycleState?: MultiAgentLifecycleState;
  readonly initialAvailability?: MultiAgentAvailability;
  readonly initialReadinessScore?: MultiAgentScore;
  readonly initialReliabilityScore?: MultiAgentScore;
  readonly initialLatencyScore?: MultiAgentScore;
  readonly initialDataFreshnessScore?: MultiAgentScore;
}

export interface MultiAgentRegistrySnapshot {
  readonly registrations: readonly MultiAgentRegistration[];
  readonly health: readonly MultiAgentHealthSnapshot[];
  readonly registeredAgentCount: number;
  readonly healthyAgentCount: number;
  readonly availableAgentCount: number;
  readonly generatedAtMs?: MultiAgentTimestamp;
}

export interface MultiAgentRegistryHealthUpdate {
  readonly lifecycleState?: MultiAgentLifecycleState;
  readonly availability?: MultiAgentAvailability;
  readonly healthy?: boolean;
  readonly readinessScore?: MultiAgentScore;
  readonly reliabilityScore?: MultiAgentScore;
  readonly latencyScore?: MultiAgentScore;
  readonly dataFreshnessScore?: MultiAgentScore;
  readonly lastHeartbeatAtMs?: MultiAgentTimestamp;
  readonly lastSuccessfulTaskAtMs?: MultiAgentTimestamp;
  readonly consecutiveFailures?: number;
  readonly activeTaskCount?: number;
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
  readonly assessedAtMs: MultiAgentTimestamp;
}

export interface MultiAgentRegistryQuery {
  readonly roles?: readonly MultiAgentRole[];
  readonly capabilities?: readonly MultiAgentCapability[];
  readonly lifecycleStates?: readonly MultiAgentLifecycleState[];
  readonly availabilities?: readonly MultiAgentAvailability[];
  readonly healthyOnly?: boolean;
  readonly deterministicOnly?: boolean;
  readonly replaySafeOnly?: boolean;
  readonly minimumReadinessScore?: MultiAgentScore;
  readonly minimumReliabilityScore?: MultiAgentScore;
}

const DEFAULT_OPTIONS: Required<
  Omit<MultiAgentRegistryOptions, "validator" | "maximumAgents">
> & {
  readonly maximumAgents: number;
} = Object.freeze({
  maximumAgents: 256,
  allowRegistrationReplacement: false,
  requireRegistrationIdentityStability: true,
  initialLifecycleState: "REGISTERED",
  initialAvailability: "UNKNOWN",
  initialReadinessScore: 0,
  initialReliabilityScore: 1,
  initialLatencyScore: 1,
  initialDataFreshnessScore: 0,
});

const LIFECYCLE_TRANSITIONS: Readonly<
  Record<MultiAgentLifecycleState, readonly MultiAgentLifecycleState[]>
> = Object.freeze({
  REGISTERED: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "INITIALIZING",
    "SUSPENDED",
    "RETIRED",
    "FAILED",
  ]),
  INITIALIZING: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "READY",
    "DEGRADED",
    "FAILED",
    "SUSPENDED",
    "RETIRED",
  ]),
  READY: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "ACTIVE",
    "DEGRADED",
    "QUARANTINED",
    "SUSPENDED",
    "FAILED",
    "RETIRED",
  ]),
  ACTIVE: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "READY",
    "DEGRADED",
    "QUARANTINED",
    "SUSPENDED",
    "FAILED",
    "RETIRED",
  ]),
  DEGRADED: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "READY",
    "ACTIVE",
    "QUARANTINED",
    "SUSPENDED",
    "FAILED",
    "RETIRED",
  ]),
  QUARANTINED: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "INITIALIZING",
    "READY",
    "SUSPENDED",
    "FAILED",
    "RETIRED",
  ]),
  SUSPENDED: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "INITIALIZING",
    "READY",
    "QUARANTINED",
    "FAILED",
    "RETIRED",
  ]),
  FAILED: Object.freeze<readonly MultiAgentLifecycleState[]>([
    "INITIALIZING",
    "QUARANTINED",
    "SUSPENDED",
    "RETIRED",
  ]),
  RETIRED: Object.freeze<readonly MultiAgentLifecycleState[]>([]),
});

const AVAILABILITY_TRANSITIONS: Readonly<
  Record<MultiAgentAvailability, readonly MultiAgentAvailability[]>
> = Object.freeze({
  AVAILABLE: Object.freeze<readonly MultiAgentAvailability[]>([
    "BUSY",
    "RATE_LIMITED",
    "UNAVAILABLE",
    "UNKNOWN",
  ]),
  BUSY: Object.freeze<readonly MultiAgentAvailability[]>([
    "AVAILABLE",
    "RATE_LIMITED",
    "UNAVAILABLE",
    "UNKNOWN",
  ]),
  RATE_LIMITED: Object.freeze<readonly MultiAgentAvailability[]>([
    "AVAILABLE",
    "BUSY",
    "UNAVAILABLE",
    "UNKNOWN",
  ]),
  UNAVAILABLE: Object.freeze<readonly MultiAgentAvailability[]>([
    "AVAILABLE",
    "RATE_LIMITED",
    "UNKNOWN",
  ]),
  UNKNOWN: Object.freeze<readonly MultiAgentAvailability[]>([
    "AVAILABLE",
    "BUSY",
    "RATE_LIMITED",
    "UNAVAILABLE",
  ]),
});

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (!isObject(value) || Object.isFrozen(value)) {
    return value;
  }

  const objectValue = value as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(objectValue)) {
    const child = objectValue[key];
    if (isObject(child)) {
      deepFreeze(child);
    }
  }

  return Object.freeze(value);
}

function cloneMetadataValue<TValue>(value: TValue): TValue {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneMetadataValue(entry)) as TValue;
  }

  if (isObject(value)) {
    const copy: Record<PropertyKey, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      copy[key] = cloneMetadataValue(value[key]);
    }
    return copy as TValue;
  }

  return value;
}

function immutableCopy<TValue>(value: TValue): TValue {
  return deepFreeze(cloneMetadataValue(value));
}

function assertNonEmptyText(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new MultiAgentRegistryError(
      "INVALID_HEALTH_SNAPSHOT",
      `${fieldName} must be a non-empty string.`,
    );
  }
}

function assertNormalizedScore(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new MultiAgentRegistryError(
      "INVALID_HEALTH_SNAPSHOT",
      `${fieldName} must be a finite number between 0 and 1 inclusive.`,
    );
  }
}

function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new MultiAgentRegistryError(
      "INVALID_HEALTH_SNAPSHOT",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertNonNegativeTimestamp(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new MultiAgentRegistryError(
      "INVALID_HEALTH_SNAPSHOT",
      `${fieldName} must be a finite non-negative timestamp.`,
    );
  }
}

function compareRegistrations(
  left: MultiAgentRegistration,
  right: MultiAgentRegistration,
): number {
  return left.identity.agentId.localeCompare(right.identity.agentId);
}

function compareHealth(
  left: MultiAgentHealthSnapshot,
  right: MultiAgentHealthSnapshot,
): number {
  return left.agentId.localeCompare(right.agentId);
}

function uniqueSortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right),
    ),
  );
}

function hasCapability(
  registration: MultiAgentRegistration,
  capability: MultiAgentCapability,
): boolean {
  return registration.capabilities.some(
    (declaration) =>
      declaration.enabled && declaration.capability === capability,
  );
}

function lifecycleAllowsHealth(
  lifecycleState: MultiAgentLifecycleState,
  healthy: boolean,
): boolean {
  if (
    lifecycleState === "FAILED" ||
    lifecycleState === "RETIRED" ||
    lifecycleState === "QUARANTINED"
  ) {
    return !healthy;
  }

  return true;
}

function lifecycleAllowsAvailability(
  lifecycleState: MultiAgentLifecycleState,
  availability: MultiAgentAvailability,
): boolean {
  if (
    lifecycleState === "FAILED" ||
    lifecycleState === "RETIRED" ||
    lifecycleState === "SUSPENDED" ||
    lifecycleState === "QUARANTINED"
  ) {
    return availability === "UNAVAILABLE" || availability === "UNKNOWN";
  }

  if (lifecycleState === "REGISTERED" || lifecycleState === "INITIALIZING") {
    return availability !== "BUSY";
  }

  return true;
}

function buildInitialHealth(
  registration: MultiAgentRegistration,
  options: typeof DEFAULT_OPTIONS,
): MultiAgentHealthSnapshot {
  const lifecycleState = options.initialLifecycleState;
  const availability = lifecycleAllowsAvailability(
    lifecycleState,
    options.initialAvailability,
  )
    ? options.initialAvailability
    : "UNKNOWN";

  const healthy = lifecycleAllowsHealth(lifecycleState, true);

  return immutableCopy({
    agentId: registration.identity.agentId,
    lifecycleState,
    availability,
    healthy,
    readinessScore: options.initialReadinessScore,
    reliabilityScore: options.initialReliabilityScore,
    latencyScore: options.initialLatencyScore,
    dataFreshnessScore: options.initialDataFreshnessScore,
    consecutiveFailures: 0,
    activeTaskCount: 0,
    warnings: Object.freeze([]),
    errors: Object.freeze([]),
    assessedAtMs: registration.registeredAtMs,
  });
}

export class MultiAgentRegistry implements MultiAgentRegistryPort {
  private readonly registrations = new Map<
    MultiAgentId,
    MultiAgentRegistration
  >();

  private readonly healthSnapshots = new Map<
    MultiAgentId,
    MultiAgentHealthSnapshot
  >();

  private readonly validator: MultiAgentValidatorPort;
  private readonly options: typeof DEFAULT_OPTIONS;

  public constructor(options: MultiAgentRegistryOptions = {}) {
    const maximumAgents = options.maximumAgents ?? DEFAULT_OPTIONS.maximumAgents;

    if (!Number.isInteger(maximumAgents) || maximumAgents <= 0) {
      throw new RangeError("maximumAgents must be a positive integer.");
    }

    const initialReadinessScore =
      options.initialReadinessScore ??
      DEFAULT_OPTIONS.initialReadinessScore;
    const initialReliabilityScore =
      options.initialReliabilityScore ??
      DEFAULT_OPTIONS.initialReliabilityScore;
    const initialLatencyScore =
      options.initialLatencyScore ?? DEFAULT_OPTIONS.initialLatencyScore;
    const initialDataFreshnessScore =
      options.initialDataFreshnessScore ??
      DEFAULT_OPTIONS.initialDataFreshnessScore;

    assertNormalizedScore(
      initialReadinessScore,
      "initialReadinessScore",
    );
    assertNormalizedScore(
      initialReliabilityScore,
      "initialReliabilityScore",
    );
    assertNormalizedScore(initialLatencyScore, "initialLatencyScore");
    assertNormalizedScore(
      initialDataFreshnessScore,
      "initialDataFreshnessScore",
    );

    this.validator = options.validator ?? aiMultiAgentValidator;
    this.options = Object.freeze({
      maximumAgents,
      allowRegistrationReplacement:
        options.allowRegistrationReplacement ??
        DEFAULT_OPTIONS.allowRegistrationReplacement,
      requireRegistrationIdentityStability:
        options.requireRegistrationIdentityStability ??
        DEFAULT_OPTIONS.requireRegistrationIdentityStability,
      initialLifecycleState:
        options.initialLifecycleState ??
        DEFAULT_OPTIONS.initialLifecycleState,
      initialAvailability:
        options.initialAvailability ??
        DEFAULT_OPTIONS.initialAvailability,
      initialReadinessScore,
      initialReliabilityScore,
      initialLatencyScore,
      initialDataFreshnessScore,
    });
  }

  public register(registration: MultiAgentRegistration): void {
    const validation = this.validator.validateRegistration(registration);
    const agentId = registration.identity.agentId;

    if (!validation.valid) {
      throw new MultiAgentRegistryError(
        "INVALID_REGISTRATION",
        `Registration for agent "${agentId}" is invalid.`,
        {
          agentId,
          issues: validation.issues,
        },
      );
    }

    const existing = this.registrations.get(agentId);

    if (existing !== undefined && !this.options.allowRegistrationReplacement) {
      throw new MultiAgentRegistryError(
        "AGENT_ALREADY_REGISTERED",
        `Agent "${agentId}" is already registered.`,
        { agentId },
      );
    }

    if (
      existing === undefined &&
      this.registrations.size >= this.options.maximumAgents
    ) {
      throw new MultiAgentRegistryError(
        "REGISTRY_CAPACITY_EXCEEDED",
        `Registry capacity of ${this.options.maximumAgents} agents has been reached.`,
        {
          agentId,
          capacity: this.options.maximumAgents,
        },
      );
    }

    if (
      existing !== undefined &&
      this.options.requireRegistrationIdentityStability
    ) {
      this.assertStableIdentity(existing, registration);
    }

    const storedRegistration = immutableCopy(registration);
    this.registrations.set(agentId, storedRegistration);

    if (existing === undefined) {
      this.healthSnapshots.set(
        agentId,
        buildInitialHealth(storedRegistration, this.options),
      );
    }
  }

  public unregister(agentId: MultiAgentId): void {
    this.assertAgentId(agentId);

    if (!this.registrations.has(agentId)) {
      throw new MultiAgentRegistryError(
        "AGENT_NOT_FOUND",
        `Agent "${agentId}" is not registered.`,
        { agentId },
      );
    }

    this.registrations.delete(agentId);
    this.healthSnapshots.delete(agentId);
  }

  public get(
    agentId: MultiAgentId,
  ): MultiAgentRegistration | undefined {
    this.assertAgentId(agentId);
    return this.registrations.get(agentId);
  }

  public list(): readonly MultiAgentRegistration[] {
    return Object.freeze(
      [...this.registrations.values()].sort(compareRegistrations),
    );
  }

  public health(
    agentId: MultiAgentId,
  ): MultiAgentHealthSnapshot | undefined {
    this.assertAgentId(agentId);
    return this.healthSnapshots.get(agentId);
  }

  public require(agentId: MultiAgentId): MultiAgentRegistration {
    const registration = this.get(agentId);

    if (registration === undefined) {
      throw new MultiAgentRegistryError(
        "AGENT_NOT_FOUND",
        `Agent "${agentId}" is not registered.`,
        { agentId },
      );
    }

    return registration;
  }

  public requireHealth(agentId: MultiAgentId): MultiAgentHealthSnapshot {
    this.require(agentId);
    const snapshot = this.healthSnapshots.get(agentId);

    if (snapshot === undefined) {
      throw new MultiAgentRegistryError(
        "INVALID_HEALTH_SNAPSHOT",
        `Agent "${agentId}" does not have a health snapshot.`,
        { agentId },
      );
    }

    return snapshot;
  }

  public contains(agentId: MultiAgentId): boolean {
    this.assertAgentId(agentId);
    return this.registrations.has(agentId);
  }

  public size(): number {
    return this.registrations.size;
  }

  public isEmpty(): boolean {
    return this.registrations.size === 0;
  }

  public clear(): void {
    this.registrations.clear();
    this.healthSnapshots.clear();
  }

  public replace(registration: MultiAgentRegistration): void {
    const agentId = registration.identity.agentId;

    if (!this.registrations.has(agentId)) {
      throw new MultiAgentRegistryError(
        "AGENT_NOT_FOUND",
        `Agent "${agentId}" is not registered.`,
        { agentId },
      );
    }

    const validation = this.validator.validateRegistration(registration);

    if (!validation.valid) {
      throw new MultiAgentRegistryError(
        "INVALID_REGISTRATION",
        `Replacement registration for agent "${agentId}" is invalid.`,
        {
          agentId,
          issues: validation.issues,
        },
      );
    }

    const existing = this.require(agentId);

    if (this.options.requireRegistrationIdentityStability) {
      this.assertStableIdentity(existing, registration);
    }

    this.registrations.set(agentId, immutableCopy(registration));
  }

  public updateHealth(
    agentId: MultiAgentId,
    update: MultiAgentRegistryHealthUpdate,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);
    this.validateHealthUpdate(agentId, current, update);

    const lifecycleState = update.lifecycleState ?? current.lifecycleState;
    const availability = update.availability ?? current.availability;
    const healthy = update.healthy ?? current.healthy;

    if (!lifecycleAllowsHealth(lifecycleState, healthy)) {
      throw new MultiAgentRegistryError(
        "INVALID_HEALTH_SNAPSHOT",
        `Lifecycle state "${lifecycleState}" cannot be marked healthy.`,
        { agentId },
      );
    }

    if (!lifecycleAllowsAvailability(lifecycleState, availability)) {
      throw new MultiAgentRegistryError(
        "INVALID_HEALTH_SNAPSHOT",
        `Availability "${availability}" is incompatible with lifecycle state "${lifecycleState}".`,
        { agentId },
      );
    }

    const next: MultiAgentHealthSnapshot = immutableCopy({
      agentId,
      lifecycleState,
      availability,
      healthy,
      readinessScore: update.readinessScore ?? current.readinessScore,
      reliabilityScore:
        update.reliabilityScore ?? current.reliabilityScore,
      latencyScore: update.latencyScore ?? current.latencyScore,
      dataFreshnessScore:
        update.dataFreshnessScore ?? current.dataFreshnessScore,
      ...(update.lastHeartbeatAtMs !== undefined
        ? { lastHeartbeatAtMs: update.lastHeartbeatAtMs }
        : current.lastHeartbeatAtMs !== undefined
          ? { lastHeartbeatAtMs: current.lastHeartbeatAtMs }
          : {}),
      ...(update.lastSuccessfulTaskAtMs !== undefined
        ? { lastSuccessfulTaskAtMs: update.lastSuccessfulTaskAtMs }
        : current.lastSuccessfulTaskAtMs !== undefined
          ? { lastSuccessfulTaskAtMs: current.lastSuccessfulTaskAtMs }
          : {}),
      consecutiveFailures:
        update.consecutiveFailures ?? current.consecutiveFailures,
      activeTaskCount: update.activeTaskCount ?? current.activeTaskCount,
      warnings:
        update.warnings === undefined
          ? current.warnings
          : uniqueSortedStrings(update.warnings),
      errors:
        update.errors === undefined
          ? current.errors
          : uniqueSortedStrings(update.errors),
      assessedAtMs: update.assessedAtMs,
    });

    this.healthSnapshots.set(agentId, next);
    return next;
  }

  public transitionLifecycle(
    agentId: MultiAgentId,
    lifecycleState: MultiAgentLifecycleState,
    assessedAtMs: MultiAgentTimestamp,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);

    if (lifecycleState !== current.lifecycleState) {
      const allowed = LIFECYCLE_TRANSITIONS[current.lifecycleState];

      if (!allowed.includes(lifecycleState)) {
        throw new MultiAgentRegistryError(
          "INVALID_LIFECYCLE_TRANSITION",
          `Invalid lifecycle transition for agent "${agentId}": ${current.lifecycleState} -> ${lifecycleState}.`,
          {
            agentId,
            fromLifecycleState: current.lifecycleState,
            toLifecycleState: lifecycleState,
          },
        );
      }
    }

    const terminalOrRestricted =
      lifecycleState === "FAILED" ||
      lifecycleState === "RETIRED" ||
      lifecycleState === "QUARANTINED" ||
      lifecycleState === "SUSPENDED";

    return this.updateHealth(agentId, {
      lifecycleState,
      availability: terminalOrRestricted
        ? "UNAVAILABLE"
        : current.availability,
      healthy: terminalOrRestricted ? false : current.healthy,
      assessedAtMs,
    });
  }

  public transitionAvailability(
    agentId: MultiAgentId,
    availability: MultiAgentAvailability,
    assessedAtMs: MultiAgentTimestamp,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);

    if (availability !== current.availability) {
      const allowed = AVAILABILITY_TRANSITIONS[current.availability];

      if (!allowed.includes(availability)) {
        throw new MultiAgentRegistryError(
          "INVALID_AVAILABILITY_TRANSITION",
          `Invalid availability transition for agent "${agentId}": ${current.availability} -> ${availability}.`,
          {
            agentId,
            fromAvailability: current.availability,
            toAvailability: availability,
          },
        );
      }
    }

    return this.updateHealth(agentId, {
      availability,
      assessedAtMs,
    });
  }

  public recordHeartbeat(
    agentId: MultiAgentId,
    heartbeatAtMs: MultiAgentTimestamp,
    readinessScore?: MultiAgentScore,
    dataFreshnessScore?: MultiAgentScore,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);

    return this.updateHealth(agentId, {
      lastHeartbeatAtMs: heartbeatAtMs,
      readinessScore: readinessScore ?? current.readinessScore,
      dataFreshnessScore:
        dataFreshnessScore ?? current.dataFreshnessScore,
      healthy:
        current.lifecycleState !== "FAILED" &&
        current.lifecycleState !== "RETIRED" &&
        current.lifecycleState !== "QUARANTINED",
      assessedAtMs: heartbeatAtMs,
    });
  }

  public recordTaskStarted(
    agentId: MultiAgentId,
    assessedAtMs: MultiAgentTimestamp,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);

    return this.updateHealth(agentId, {
      activeTaskCount: current.activeTaskCount + 1,
      availability: "BUSY",
      lifecycleState:
        current.lifecycleState === "READY"
          ? "ACTIVE"
          : current.lifecycleState,
      assessedAtMs,
    });
  }

  public recordTaskSucceeded(
    agentId: MultiAgentId,
    completedAtMs: MultiAgentTimestamp,
    reliabilityScore?: MultiAgentScore,
  ): MultiAgentHealthSnapshot {
    const current = this.requireHealth(agentId);
    const activeTaskCount = Math.max(0, current.activeTaskCount - 1);

    return this.updateHealth(agentId, {
      lastSuccessfulTaskAtMs: completedAtMs,
      consecutiveFailures: 0,
      activeTaskCount,
      reliabilityScore:
        reliabilityScore ?? current.reliabilityScore,
      healthy: true,
      availability: activeTaskCount === 0 ? "AVAILABLE" : "BUSY",
      lifecycleState:
        activeTaskCount === 0 && current.lifecycleState === "ACTIVE"
          ? "READY"
          : current.lifecycleState,
      errors: Object.freeze([]),
      assessedAtMs: completedAtMs,
    });
  }

  public recordTaskFailed(
    agentId: MultiAgentId,
    failedAtMs: MultiAgentTimestamp,
    error: string,
    reliabilityScore?: MultiAgentScore,
  ): MultiAgentHealthSnapshot {
    assertNonEmptyText(error, "error");

    const current = this.requireHealth(agentId);
    const consecutiveFailures = current.consecutiveFailures + 1;
    const activeTaskCount = Math.max(0, current.activeTaskCount - 1);

    return this.updateHealth(agentId, {
      consecutiveFailures,
      activeTaskCount,
      reliabilityScore:
        reliabilityScore ?? current.reliabilityScore,
      healthy: false,
      availability: "UNAVAILABLE",
      lifecycleState:
        current.lifecycleState === "RETIRED"
          ? "RETIRED"
          : consecutiveFailures >= 3
            ? "FAILED"
            : "DEGRADED",
      errors: uniqueSortedStrings([...current.errors, error]),
      assessedAtMs: failedAtMs,
    });
  }

  public query(
    query: MultiAgentRegistryQuery = {},
  ): readonly MultiAgentRegistration[] {
    this.validateQuery(query);

    const roles =
      query.roles === undefined ? undefined : new Set(query.roles);
    const capabilities =
      query.capabilities === undefined
        ? undefined
        : new Set(query.capabilities);
    const lifecycleStates =
      query.lifecycleStates === undefined
        ? undefined
        : new Set(query.lifecycleStates);
    const availabilities =
      query.availabilities === undefined
        ? undefined
        : new Set(query.availabilities);

    const matches = this.list().filter((registration) => {
      const health = this.healthSnapshots.get(registration.identity.agentId);

      if (health === undefined) {
        return false;
      }

      if (roles !== undefined && !roles.has(registration.identity.role)) {
        return false;
      }

      if (
        capabilities !== undefined &&
        ![...capabilities].every((capability) =>
          hasCapability(registration, capability),
        )
      ) {
        return false;
      }

      if (
        lifecycleStates !== undefined &&
        !lifecycleStates.has(health.lifecycleState)
      ) {
        return false;
      }

      if (
        availabilities !== undefined &&
        !availabilities.has(health.availability)
      ) {
        return false;
      }

      if (query.healthyOnly === true && !health.healthy) {
        return false;
      }

      if (
        query.deterministicOnly === true &&
        !registration.deterministic
      ) {
        return false;
      }

      if (query.replaySafeOnly === true && !registration.replaySafe) {
        return false;
      }

      if (
        query.minimumReadinessScore !== undefined &&
        health.readinessScore < query.minimumReadinessScore
      ) {
        return false;
      }

      if (
        query.minimumReliabilityScore !== undefined &&
        health.reliabilityScore < query.minimumReliabilityScore
      ) {
        return false;
      }

      return true;
    });

    return Object.freeze(matches);
  }

  public listHealth(): readonly MultiAgentHealthSnapshot[] {
    return Object.freeze(
      [...this.healthSnapshots.values()].sort(compareHealth),
    );
  }

  public snapshot(
    generatedAtMs?: MultiAgentTimestamp,
  ): MultiAgentRegistrySnapshot {
    if (generatedAtMs !== undefined) {
      assertNonNegativeTimestamp(generatedAtMs, "generatedAtMs");
    }

    const registrations = this.list();
    const health = this.listHealth();

    return immutableCopy({
      registrations,
      health,
      registeredAgentCount: registrations.length,
      healthyAgentCount: health.filter((snapshot) => snapshot.healthy).length,
      availableAgentCount: health.filter(
        (snapshot) => snapshot.availability === "AVAILABLE",
      ).length,
      ...(generatedAtMs === undefined ? {} : { generatedAtMs }),
    });
  }

  private assertAgentId(agentId: MultiAgentId): void {
    assertNonEmptyText(agentId, "agentId");
  }

  private assertStableIdentity(
    existing: MultiAgentRegistration,
    replacement: MultiAgentRegistration,
  ): void {
    const changed =
      existing.identity.agentId !== replacement.identity.agentId ||
      existing.identity.role !== replacement.identity.role ||
      existing.identity.modelType !== replacement.identity.modelType;

    if (changed) {
      throw new MultiAgentRegistryError(
        "REGISTRATION_IMMUTABLE_FIELD_CHANGED",
        `Replacement registration for agent "${existing.identity.agentId}" changes an immutable identity field.`,
        { agentId: existing.identity.agentId },
      );
    }
  }

  private validateHealthUpdate(
    agentId: MultiAgentId,
    current: MultiAgentHealthSnapshot,
    update: MultiAgentRegistryHealthUpdate,
  ): void {
    assertNonNegativeTimestamp(update.assessedAtMs, "assessedAtMs");

    if (update.assessedAtMs < current.assessedAtMs) {
      throw new MultiAgentRegistryError(
        "INVALID_HEALTH_SNAPSHOT",
        `Health assessment for agent "${agentId}" cannot move backward in time.`,
        { agentId },
      );
    }

    const scores = [
      ["readinessScore", update.readinessScore],
      ["reliabilityScore", update.reliabilityScore],
      ["latencyScore", update.latencyScore],
      ["dataFreshnessScore", update.dataFreshnessScore],
    ] as const;

    for (const [name, value] of scores) {
      if (value !== undefined) {
        assertNormalizedScore(value, name);
      }
    }

    if (update.consecutiveFailures !== undefined) {
      assertNonNegativeInteger(
        update.consecutiveFailures,
        "consecutiveFailures",
      );
    }

    if (update.activeTaskCount !== undefined) {
      assertNonNegativeInteger(update.activeTaskCount, "activeTaskCount");
    }

    if (update.lastHeartbeatAtMs !== undefined) {
      assertNonNegativeTimestamp(
        update.lastHeartbeatAtMs,
        "lastHeartbeatAtMs",
      );

      if (update.lastHeartbeatAtMs > update.assessedAtMs) {
        throw new MultiAgentRegistryError(
          "INVALID_HEALTH_SNAPSHOT",
          "lastHeartbeatAtMs cannot be later than assessedAtMs.",
          { agentId },
        );
      }
    }

    if (update.lastSuccessfulTaskAtMs !== undefined) {
      assertNonNegativeTimestamp(
        update.lastSuccessfulTaskAtMs,
        "lastSuccessfulTaskAtMs",
      );

      if (update.lastSuccessfulTaskAtMs > update.assessedAtMs) {
        throw new MultiAgentRegistryError(
          "INVALID_HEALTH_SNAPSHOT",
          "lastSuccessfulTaskAtMs cannot be later than assessedAtMs.",
          { agentId },
        );
      }
    }

    for (const warning of update.warnings ?? []) {
      assertNonEmptyText(warning, "warnings[]");
    }

    for (const error of update.errors ?? []) {
      assertNonEmptyText(error, "errors[]");
    }
  }

  private validateQuery(query: MultiAgentRegistryQuery): void {
    if (query.minimumReadinessScore !== undefined) {
      assertNormalizedScore(
        query.minimumReadinessScore,
        "minimumReadinessScore",
      );
    }

    if (query.minimumReliabilityScore !== undefined) {
      assertNormalizedScore(
        query.minimumReliabilityScore,
        "minimumReliabilityScore",
      );
    }
  }
}

export function createMultiAgentRegistry(
  options: MultiAgentRegistryOptions = {},
): MultiAgentRegistry {
  return new MultiAgentRegistry(options);
}