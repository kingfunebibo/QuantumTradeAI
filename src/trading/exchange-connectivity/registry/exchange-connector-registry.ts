/**
 * QuantumTradeAI
 * Milestone 13 — Live Exchange Connectivity Framework
 *
 * Exchange connector registry contracts.
 *
 * This module defines deterministic registration, lookup, removal,
 * capability filtering, lifecycle visibility, duplicate prevention,
 * immutable snapshots, and registry metrics.
 */

import type {
  ExchangeConnector,
  ExchangeConnectorCapabilities,
  ExchangeConnectorHealthStatus,
  ExchangeConnectorId,
  ExchangeConnectorLifecycleState,
  ExchangeEnvironment,
  ExchangeMarketType,
} from "../connectors/exchange-connector";

/**
 * Registry lifecycle states.
 */
export type ExchangeConnectorRegistryState =
  | "CREATED"
  | "READY"
  | "CLOSING"
  | "CLOSED"
  | "FAILED";

/**
 * Reasons why connector registration may fail.
 */
export type ExchangeConnectorRegistrationRejectionReason =
  | "INVALID_CONNECTOR"
  | "DUPLICATE_CONNECTOR_ID"
  | "REGISTRY_NOT_READY"
  | "REGISTRY_CLOSING"
  | "REGISTRY_CLOSED"
  | "CAPACITY_EXCEEDED"
  | "INTERNAL";

/**
 * Reasons why connector removal may fail.
 */
export type ExchangeConnectorRemovalRejectionReason =
  | "CONNECTOR_NOT_FOUND"
  | "CONNECTOR_ACTIVE"
  | "REGISTRY_NOT_READY"
  | "REGISTRY_CLOSING"
  | "REGISTRY_CLOSED"
  | "INTERNAL";

/**
 * Registry clock abstraction.
 *
 * Implementations must use an injected clock rather than Date.now().
 */
export interface ExchangeConnectorRegistryClock {
  now(): number;
}

/**
 * Immutable registry configuration.
 */
export interface ExchangeConnectorRegistryConfig {
  /**
   * Maximum number of connectors that may be registered.
   */
  readonly maximumConnectors: number;

  /**
   * Whether connector IDs are compared case-sensitively.
   */
  readonly caseSensitiveConnectorIds: boolean;

  /**
   * Whether a connector must be disconnected before it can be removed.
   */
  readonly requireDisconnectedBeforeRemoval: boolean;

  /**
   * Whether connector metadata is validated during registration.
   */
  readonly validateMetadataOnRegistration: boolean;
}

/**
 * Immutable connector registry entry.
 */
export interface ExchangeConnectorRegistryEntry {
  readonly connectorId: ExchangeConnectorId;
  readonly exchangeName: string;
  readonly displayName: string;
  readonly implementationVersion: string;
  readonly environment: ExchangeEnvironment;

  readonly lifecycleState: ExchangeConnectorLifecycleState;
  readonly healthStatus: ExchangeConnectorHealthStatus;

  readonly marketTypes: readonly ExchangeMarketType[];
  readonly capabilities: ExchangeConnectorCapabilities;

  readonly registeredAt: number;
  readonly updatedAt: number;
  readonly revision: number;
}

/**
 * Registry lifecycle snapshot.
 */
export interface ExchangeConnectorRegistryStateSnapshot {
  readonly state: ExchangeConnectorRegistryState;
  readonly revision: number;
  readonly changedAt: number;
  readonly reason?: string;
}

/**
 * Registry snapshot.
 */
export interface ExchangeConnectorRegistrySnapshot {
  readonly capturedAt: number;
  readonly state: ExchangeConnectorRegistryState;
  readonly revision: number;
  readonly connectorCount: number;
  readonly connectors: readonly ExchangeConnectorRegistryEntry[];
}

/**
 * Registry query filters.
 */
export interface ExchangeConnectorRegistryQuery {
  readonly connectorIds?: readonly ExchangeConnectorId[];
  readonly exchangeNames?: readonly string[];
  readonly environments?: readonly ExchangeEnvironment[];
  readonly lifecycleStates?: readonly ExchangeConnectorLifecycleState[];
  readonly healthStatuses?: readonly ExchangeConnectorHealthStatus[];
  readonly marketTypes?: readonly ExchangeMarketType[];

  /**
   * When true, a connector must support every requested market type.
   * When false, supporting any requested market type is sufficient.
   */
  readonly requireAllMarketTypes?: boolean;

  /**
   * Capability requirements.
   *
   * Only capability fields set to true are treated as required.
   */
  readonly requiredCapabilities?: Partial<ExchangeConnectorCapabilities>;
}

/**
 * Successful connector registration.
 */
export interface ExchangeConnectorRegisteredResult {
  readonly status: "REGISTERED";
  readonly connectorId: ExchangeConnectorId;
  readonly registeredAt: number;
  readonly registryRevision: number;
  readonly entry: ExchangeConnectorRegistryEntry;
}

/**
 * Rejected connector registration.
 */
export interface ExchangeConnectorRegistrationRejectedResult {
  readonly status: "REJECTED";
  readonly connectorId?: ExchangeConnectorId;
  readonly rejectedAt: number;
  readonly reason: ExchangeConnectorRegistrationRejectionReason;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Registration result.
 */
export type ExchangeConnectorRegistrationResult =
  | ExchangeConnectorRegisteredResult
  | ExchangeConnectorRegistrationRejectedResult;

/**
 * Successful connector removal.
 */
export interface ExchangeConnectorRemovedResult {
  readonly status: "REMOVED";
  readonly connectorId: ExchangeConnectorId;
  readonly removedAt: number;
  readonly registryRevision: number;
  readonly previousEntry: ExchangeConnectorRegistryEntry;
}

/**
 * Rejected connector removal.
 */
export interface ExchangeConnectorRemovalRejectedResult {
  readonly status: "REJECTED";
  readonly connectorId: ExchangeConnectorId;
  readonly rejectedAt: number;
  readonly reason: ExchangeConnectorRemovalRejectionReason;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Connector removal result.
 */
export type ExchangeConnectorRemovalResult =
  | ExchangeConnectorRemovedResult
  | ExchangeConnectorRemovalRejectedResult;

/**
 * Connector registry metrics.
 */
export interface ExchangeConnectorRegistryMetrics {
  readonly capturedAt: number;

  readonly registeredConnectorCount: number;
  readonly healthyConnectorCount: number;
  readonly degradedConnectorCount: number;
  readonly unhealthyConnectorCount: number;
  readonly unknownHealthConnectorCount: number;

  readonly connectedConnectorCount: number;
  readonly disconnectedConnectorCount: number;
  readonly failedConnectorCount: number;
  readonly destroyedConnectorCount: number;

  readonly productionConnectorCount: number;
  readonly sandboxConnectorCount: number;
  readonly testConnectorCount: number;

  readonly totalRegistrations: number;
  readonly totalRegistrationRejections: number;
  readonly totalRemovals: number;
  readonly totalRemovalRejections: number;
  readonly totalLookups: number;
  readonly failedLookups: number;

  readonly lastRegistrationAt?: number;
  readonly lastRemovalAt?: number;
  readonly lastLookupAt?: number;
}

/**
 * Registry lifecycle result.
 */
export interface ExchangeConnectorRegistryLifecycleResult {
  readonly previousState: ExchangeConnectorRegistryState;
  readonly currentState: ExchangeConnectorRegistryState;
  readonly changed: boolean;
  readonly completedAt: number;
  readonly revision: number;
}

/**
 * Registry close options.
 */
export interface ExchangeConnectorRegistryCloseOptions {
  /**
   * Whether registered connectors should be disconnected before closure.
   */
  readonly disconnectConnectors?: boolean;

  /**
   * Whether registered connectors should be destroyed before closure.
   */
  readonly destroyConnectors?: boolean;

  /**
   * Whether registry closure should stop on the first connector failure.
   */
  readonly stopOnFailure?: boolean;

  readonly requestedAt?: number;
  readonly reason?: string;
}

/**
 * Registry close result.
 */
export interface ExchangeConnectorRegistryCloseResult
  extends ExchangeConnectorRegistryLifecycleResult {
  readonly disconnectedConnectorCount: number;
  readonly destroyedConnectorCount: number;
  readonly failedConnectorIds: readonly ExchangeConnectorId[];
}

/**
 * Registry error categories.
 */
export type ExchangeConnectorRegistryErrorCategory =
  | "VALIDATION"
  | "CONFIGURATION"
  | "STATE"
  | "REGISTRATION"
  | "REMOVAL"
  | "LOOKUP"
  | "LIFECYCLE"
  | "INTERNAL";

/**
 * Immutable registry error details.
 */
export interface ExchangeConnectorRegistryErrorDetails {
  readonly category: ExchangeConnectorRegistryErrorCategory;
  readonly code: string;
  readonly message: string;

  readonly connectorId?: ExchangeConnectorId;

  readonly retryable: boolean;
  readonly occurredAt: number;

  readonly causeName?: string;
  readonly causeMessage?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Error thrown by connector registry infrastructure.
 */
export class ExchangeConnectorRegistryError extends Error {
  public readonly details: ExchangeConnectorRegistryErrorDetails;

  public constructor(details: ExchangeConnectorRegistryErrorDetails) {
    super(details.message);

    this.name = "ExchangeConnectorRegistryError";
    this.details = Object.freeze({
      ...details,
      metadata: details.metadata
        ? Object.freeze({ ...details.metadata })
        : undefined,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get category(): ExchangeConnectorRegistryErrorCategory {
    return this.details.category;
  }

  public get code(): string {
    return this.details.code;
  }

  public get retryable(): boolean {
    return this.details.retryable;
  }

  public get connectorId(): ExchangeConnectorId | undefined {
    return this.details.connectorId;
  }

  public toJSON(): ExchangeConnectorRegistryErrorDetails {
    return this.details;
  }
}

/**
 * Core connector registry contract.
 */
export interface ExchangeConnectorRegistry {
  /**
   * Returns the registry lifecycle state.
   */
  getState(): ExchangeConnectorRegistryStateSnapshot;

  /**
   * Returns an immutable registry snapshot.
   */
  getSnapshot(): ExchangeConnectorRegistrySnapshot;

  /**
   * Returns registry metrics.
   */
  getMetrics(): ExchangeConnectorRegistryMetrics;

  /**
   * Initializes the registry.
   *
   * Initialization should be idempotent.
   */
  initialize(): Promise<ExchangeConnectorRegistryLifecycleResult>;

  /**
   * Registers a connector.
   */
  register(
    connector: ExchangeConnector,
  ): ExchangeConnectorRegistrationResult;

  /**
   * Returns a connector by ID.
   */
  get(
    connectorId: ExchangeConnectorId,
  ): ExchangeConnector | undefined;

  /**
   * Returns whether a connector ID is registered.
   */
  has(connectorId: ExchangeConnectorId): boolean;

  /**
   * Returns all registered connector instances.
   */
  getAll(): readonly ExchangeConnector[];

  /**
   * Returns immutable registry entries.
   */
  getEntries(): readonly ExchangeConnectorRegistryEntry[];

  /**
   * Queries connectors using immutable filters.
   */
  find(
    query: ExchangeConnectorRegistryQuery,
  ): readonly ExchangeConnector[];

  /**
   * Queries immutable connector entries.
   */
  findEntries(
    query: ExchangeConnectorRegistryQuery,
  ): readonly ExchangeConnectorRegistryEntry[];

  /**
   * Refreshes cached metadata, lifecycle, and health information.
   */
  refresh(
    connectorId?: ExchangeConnectorId,
  ): readonly ExchangeConnectorRegistryEntry[];

  /**
   * Removes a connector from the registry.
   */
  remove(
    connectorId: ExchangeConnectorId,
  ): ExchangeConnectorRemovalResult;

  /**
   * Closes the registry.
   */
  close(
    options?: ExchangeConnectorRegistryCloseOptions,
  ): Promise<ExchangeConnectorRegistryCloseResult>;
}

/**
 * Validates connector registry configuration.
 */
export function validateExchangeConnectorRegistryConfig(
  config: ExchangeConnectorRegistryConfig,
): void {
  if (
    !Number.isInteger(config.maximumConnectors) ||
    config.maximumConnectors <= 0
  ) {
    throw createConfigError(
      "INVALID_MAXIMUM_CONNECTORS",
      "maximumConnectors must be an integer greater than zero.",
    );
  }
}

/**
 * Validates a connector before registration.
 */
export function validateExchangeConnectorForRegistration(
  connector: ExchangeConnector,
): void {
  if (
    typeof connector !== "object" ||
    connector === null
  ) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "INVALID_CONNECTOR",
      message: "Connector must be a non-null object.",
      retryable: false,
      occurredAt: 0,
    });
  }

  const metadata = connector.getMetadata();
  const state = connector.getState();
  const health = connector.getHealth();

  requireNonEmptyString(metadata.id, "metadata.id");
  requireNonEmptyString(
    metadata.exchangeName,
    "metadata.exchangeName",
  );
  requireNonEmptyString(
    metadata.displayName,
    "metadata.displayName",
  );
  requireNonEmptyString(
    metadata.implementationVersion,
    "metadata.implementationVersion",
  );

  if (metadata.capabilities.marketTypes.length === 0) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "CONNECTOR_MARKET_TYPES_REQUIRED",
      message:
        "Connector capabilities must contain at least one market type.",
      connectorId: metadata.id,
      retryable: false,
      occurredAt: normalizeTimestamp(state.changedAt),
    });
  }

  requireUniqueValues(
    metadata.capabilities.marketTypes,
    "metadata.capabilities.marketTypes",
    metadata.id,
  );

  if (state.connectorId !== metadata.id) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "CONNECTOR_STATE_ID_MISMATCH",
      message:
        "Connector state ID must match connector metadata ID.",
      connectorId: metadata.id,
      retryable: false,
      occurredAt: normalizeTimestamp(state.changedAt),
    });
  }

  if (health.connectorId !== metadata.id) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "CONNECTOR_HEALTH_ID_MISMATCH",
      message:
        "Connector health ID must match connector metadata ID.",
      connectorId: metadata.id,
      retryable: false,
      occurredAt: normalizeTimestamp(health.checkedAt),
    });
  }
}

/**
 * Creates an immutable registry entry from a connector.
 */
export function createExchangeConnectorRegistryEntry(
  connector: ExchangeConnector,
  registeredAt: number,
  updatedAt: number = registeredAt,
  revision = 1,
): ExchangeConnectorRegistryEntry {
  validateExchangeConnectorForRegistration(connector);

  if (
    !Number.isInteger(revision) ||
    revision <= 0
  ) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "INVALID_ENTRY_REVISION",
      message:
        "Connector registry entry revision must be an integer greater than zero.",
      connectorId: connector.getMetadata().id,
      retryable: false,
      occurredAt: normalizeTimestamp(updatedAt),
    });
  }

  if (
    !Number.isFinite(registeredAt) ||
    registeredAt < 0 ||
    !Number.isFinite(updatedAt) ||
    updatedAt < registeredAt
  ) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "INVALID_ENTRY_TIMESTAMPS",
      message:
        "Registry entry timestamps must be finite, non-negative, and chronologically valid.",
      connectorId: connector.getMetadata().id,
      retryable: false,
      occurredAt: normalizeTimestamp(updatedAt),
    });
  }

  const metadata = connector.getMetadata();
  const state = connector.getState();
  const health = connector.getHealth();

  return Object.freeze({
    connectorId: metadata.id,
    exchangeName: metadata.exchangeName,
    displayName: metadata.displayName,
    implementationVersion: metadata.implementationVersion,
    environment: metadata.environment,
    lifecycleState: state.state,
    healthStatus: health.status,
    marketTypes: Object.freeze([
      ...metadata.capabilities.marketTypes,
    ]),
    capabilities: freezeCapabilities(
      metadata.capabilities,
    ),
    registeredAt,
    updatedAt,
    revision,
  });
}

/**
 * Normalizes connector IDs according to registry configuration.
 */
export function normalizeExchangeConnectorRegistryId(
  connectorId: ExchangeConnectorId,
  caseSensitive: boolean,
): string {
  const normalized = connectorId.trim();

  return caseSensitive
    ? normalized
    : normalized.toLowerCase();
}

/**
 * Returns true when a registry entry matches a query.
 */
export function matchesExchangeConnectorRegistryQuery(
  entry: ExchangeConnectorRegistryEntry,
  query: ExchangeConnectorRegistryQuery,
  caseSensitiveConnectorIds = true,
): boolean {
  if (
    query.connectorIds &&
    !query.connectorIds.some(
      (connectorId) =>
        normalizeExchangeConnectorRegistryId(
          connectorId,
          caseSensitiveConnectorIds,
        ) ===
        normalizeExchangeConnectorRegistryId(
          entry.connectorId,
          caseSensitiveConnectorIds,
        ),
    )
  ) {
    return false;
  }

  if (
    query.exchangeNames &&
    !query.exchangeNames.includes(entry.exchangeName)
  ) {
    return false;
  }

  if (
    query.environments &&
    !query.environments.includes(entry.environment)
  ) {
    return false;
  }

  if (
    query.lifecycleStates &&
    !query.lifecycleStates.includes(entry.lifecycleState)
  ) {
    return false;
  }

  if (
    query.healthStatuses &&
    !query.healthStatuses.includes(entry.healthStatus)
  ) {
    return false;
  }

  if (
    query.marketTypes &&
    query.marketTypes.length > 0
  ) {
    const matchesMarketTypes =
      query.requireAllMarketTypes === true
        ? query.marketTypes.every((marketType) =>
            entry.marketTypes.includes(marketType),
          )
        : query.marketTypes.some((marketType) =>
            entry.marketTypes.includes(marketType),
          );

    if (!matchesMarketTypes) {
      return false;
    }
  }

  if (
    query.requiredCapabilities &&
    !matchesRequiredCapabilities(
      entry.capabilities,
      query.requiredCapabilities,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Sorts connector registry entries deterministically.
 */
export function sortExchangeConnectorRegistryEntries(
  entries: readonly ExchangeConnectorRegistryEntry[],
): readonly ExchangeConnectorRegistryEntry[] {
  return Object.freeze(
    [...entries].sort((left, right) =>
      left.connectorId.localeCompare(right.connectorId),
    ),
  );
}

/**
 * Returns true when a lifecycle state permits safe connector removal.
 */
export function isExchangeConnectorRemovableState(
  state: ExchangeConnectorLifecycleState,
): boolean {
  return (
    state === "CREATED" ||
    state === "INITIALIZED" ||
    state === "DISCONNECTED" ||
    state === "FAILED" ||
    state === "DESTROYED"
  );
}

/**
 * Returns true when the registry can accept operations.
 */
export function isExchangeConnectorRegistryOperational(
  state: ExchangeConnectorRegistryState,
): boolean {
  return state === "READY";
}

/**
 * Returns true when the registry is terminal.
 */
export function isExchangeConnectorRegistryTerminal(
  state: ExchangeConnectorRegistryState,
): boolean {
  return state === "CLOSED";
}

/**
 * Runtime type guard for registry states.
 */
export function isExchangeConnectorRegistryState(
  value: unknown,
): value is ExchangeConnectorRegistryState {
  return (
    value === "CREATED" ||
    value === "READY" ||
    value === "CLOSING" ||
    value === "CLOSED" ||
    value === "FAILED"
  );
}

/**
 * Runtime type guard for registration results.
 */
export function isExchangeConnectorRegistrationResult(
  value: unknown,
): value is ExchangeConnectorRegistrationResult {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    value.status === "REGISTERED" ||
    value.status === "REJECTED"
  );
}

/**
 * Runtime type guard for connector removal results.
 */
export function isExchangeConnectorRemovalResult(
  value: unknown,
): value is ExchangeConnectorRemovalResult {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    value.status === "REMOVED" ||
    value.status === "REJECTED"
  );
}

/**
 * Runtime type guard for registry errors.
 */
export function isExchangeConnectorRegistryError(
  value: unknown,
): value is ExchangeConnectorRegistryError {
  return value instanceof ExchangeConnectorRegistryError;
}

function matchesRequiredCapabilities(
  capabilities: ExchangeConnectorCapabilities,
  required: Partial<ExchangeConnectorCapabilities>,
): boolean {
  const booleanKeys: readonly (
    keyof ExchangeConnectorCapabilities
  )[] = [
    "supportsPublicRest",
    "supportsPrivateRest",
    "supportsPublicWebSocket",
    "supportsPrivateWebSocket",
    "supportsMarketData",
    "supportsOrderPlacement",
    "supportsOrderCancellation",
    "supportsOrderAmendment",
    "supportsOpenOrders",
    "supportsOrderHistory",
    "supportsTradeHistory",
    "supportsBalances",
    "supportsPositions",
    "supportsClientOrderId",
    "supportsBatchOrders",
    "supportsServerTime",
    "supportsSandbox",
  ];

  for (const key of booleanKeys) {
    if (
      required[key] === true &&
      capabilities[key] !== true
    ) {
      return false;
    }
  }

  if (
    required.marketTypes &&
    !required.marketTypes.every((marketType) =>
      capabilities.marketTypes.includes(marketType),
    )
  ) {
    return false;
  }

  return true;
}

function freezeCapabilities(
  capabilities: ExchangeConnectorCapabilities,
): ExchangeConnectorCapabilities {
  return Object.freeze({
    ...capabilities,
    marketTypes: Object.freeze([
      ...capabilities.marketTypes,
    ]),
  });
}

function requireNonEmptyString(
  value: string,
  path: string,
): void {
  if (!value.trim()) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "REQUIRED_VALUE_MISSING",
      message: `${path} must not be empty.`,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function requireUniqueValues<T>(
  values: readonly T[],
  path: string,
  connectorId?: ExchangeConnectorId,
): void {
  if (new Set(values).size !== values.length) {
    throw new ExchangeConnectorRegistryError({
      category: "VALIDATION",
      code: "DUPLICATE_VALUES",
      message: `${path} must not contain duplicate values.`,
      connectorId,
      retryable: false,
      occurredAt: 0,
    });
  }
}

function createConfigError(
  code: string,
  message: string,
): ExchangeConnectorRegistryError {
  return new ExchangeConnectorRegistryError({
    category: "CONFIGURATION",
    code,
    message,
    retryable: false,
    occurredAt: 0,
  });
}

function normalizeTimestamp(
  value: number,
): number {
  return Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}