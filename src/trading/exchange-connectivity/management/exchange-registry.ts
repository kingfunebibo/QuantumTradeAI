/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/exchange-registry.ts
 *
 * Purpose:
 * Provides the authoritative, deterministic in-memory registry for exchange
 * connectors managed by the multi-exchange orchestration layer.
 *
 * The registry intentionally does not control connector lifecycle operations.
 * Starting, stopping, reconnecting, monitoring, and failing over connectors are
 * responsibilities of higher-level management services.
 */

/**
 * Canonical identifier used to address an exchange connector.
 *
 * Identifiers are normalized before storage so callers may safely use values
 * such as "OKX", "okx", or " okx " without producing separate registrations.
 */
export type ExchangeRegistryId = string;

/**
 * Optional metadata associated with a registered connector.
 *
 * The registry treats metadata as descriptive information only. Connector
 * capability evaluation and routing decisions will be handled by dedicated
 * Milestone 18 components.
 */
export interface ExchangeRegistryMetadata {
  /**
   * Human-readable connector name.
   *
   * Example:
   * "OKX Exchange Connector"
   */
  readonly displayName?: string;

  /**
   * Connector implementation or API version.
   *
   * Example:
   * "1.0.0"
   */
  readonly version?: string;

  /**
   * Whether the connector is intended for testnet or sandbox environments.
   */
  readonly sandbox?: boolean;

  /**
   * Additional immutable metadata owned by the caller.
   */
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Input required to register an exchange connector.
 */
export interface RegisterExchangeConnectorInput<TConnector extends object> {
  /**
   * Canonical exchange identifier.
   *
   * Examples:
   * "okx"
   * "binance"
   * "bybit"
   */
  readonly exchangeId: ExchangeRegistryId;

  /**
   * Concrete exchange connector instance.
   */
  readonly connector: TConnector;

  /**
   * Optional descriptive metadata.
   */
  readonly metadata?: ExchangeRegistryMetadata;
}

/**
 * Immutable representation of a registered exchange connector.
 */
export interface ExchangeRegistryEntry<TConnector extends object> {
  /**
   * Normalized exchange identifier.
   */
  readonly exchangeId: ExchangeRegistryId;

  /**
   * Registered connector instance.
   */
  readonly connector: TConnector;

  /**
   * Immutable descriptive metadata.
   */
  readonly metadata: Readonly<ExchangeRegistryMetadata>;

  /**
   * Deterministic sequence assigned when the connector is registered.
   *
   * Sequence values are local to this registry instance and are not based on
   * wall-clock time.
   */
  readonly registrationSequence: number;
}

/**
 * Immutable point-in-time view of the registry.
 */
export interface ExchangeRegistrySnapshot<TConnector extends object> {
  /**
   * Registry mutation version.
   *
   * The version increases after every successful state-changing operation.
   */
  readonly version: number;

  /**
   * Number of currently registered connectors.
   */
  readonly size: number;

  /**
   * Entries ordered by deterministic registration sequence.
   */
  readonly entries: readonly ExchangeRegistryEntry<TConnector>[];
}

/**
 * Supported registry failure categories.
 */
export type ExchangeRegistryErrorCode =
  | "INVALID_EXCHANGE_ID"
  | "INVALID_CONNECTOR"
  | "EXCHANGE_ALREADY_REGISTERED"
  | "EXCHANGE_NOT_REGISTERED"
  | "CONNECTOR_ALREADY_REGISTERED";

/**
 * Domain-specific error raised by the exchange registry.
 */
export class ExchangeRegistryError extends Error {
  public readonly code: ExchangeRegistryErrorCode;

  public readonly exchangeId?: ExchangeRegistryId;

  public constructor(
    code: ExchangeRegistryErrorCode,
    message: string,
    exchangeId?: ExchangeRegistryId,
  ) {
    super(message);

    this.name = "ExchangeRegistryError";
    this.code = code;
    this.exchangeId = exchangeId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Configuration for {@link ExchangeRegistry}.
 */
export interface ExchangeRegistryOptions {
  /**
   * When enabled, the same connector object cannot be registered under more
   * than one exchange identifier.
   *
   * Defaults to true because registering one stateful connector instance under
   * multiple exchanges can create ambiguous lifecycle and routing behaviour.
   */
  readonly enforceUniqueConnectorInstances?: boolean;
}

/**
 * Contract exposed by the exchange registry.
 */
export interface ExchangeRegistryContract<TConnector extends object> {
  readonly size: number;

  readonly version: number;

  register(
    input: RegisterExchangeConnectorInput<TConnector>,
  ): ExchangeRegistryEntry<TConnector>;

  replace(
    input: RegisterExchangeConnectorInput<TConnector>,
  ): ExchangeRegistryEntry<TConnector>;

  unregister(exchangeId: ExchangeRegistryId): ExchangeRegistryEntry<TConnector>;

  get(exchangeId: ExchangeRegistryId): TConnector | undefined;

  getEntry(
    exchangeId: ExchangeRegistryId,
  ): ExchangeRegistryEntry<TConnector> | undefined;

  require(exchangeId: ExchangeRegistryId): TConnector;

  requireEntry(
    exchangeId: ExchangeRegistryId,
  ): ExchangeRegistryEntry<TConnector>;

  has(exchangeId: ExchangeRegistryId): boolean;

  list(): readonly ExchangeRegistryEntry<TConnector>[];

  listExchangeIds(): readonly ExchangeRegistryId[];

  snapshot(): ExchangeRegistrySnapshot<TConnector>;

  clear(): readonly ExchangeRegistryEntry<TConnector>[];
}

/**
 * Deterministic registry containing the exchange connectors available to the
 * QuantumTradeAI orchestration layer.
 *
 * Design guarantees:
 *
 * - Exchange identifiers are normalized consistently.
 * - Duplicate identifiers are rejected.
 * - Connector instances may optionally be unique across registrations.
 * - Registration order is deterministic and independent of system time.
 * - Returned registry entries, metadata, lists, and snapshots are immutable.
 * - Failed operations never partially mutate registry state.
 *
 * @typeParam TConnector
 * The common connector contract or compatible connector union registered by
 * the application.
 */
export class ExchangeRegistry<TConnector extends object>
  implements ExchangeRegistryContract<TConnector>
{
  private readonly entriesByExchangeId = new Map<
    ExchangeRegistryId,
    ExchangeRegistryEntry<TConnector>
  >();

  private readonly exchangeIdByConnector = new Map<
    TConnector,
    ExchangeRegistryId
  >();

  private readonly enforceUniqueConnectorInstances: boolean;

  private nextRegistrationSequence = 1;

  private mutationVersion = 0;

  public constructor(options: ExchangeRegistryOptions = {}) {
    this.enforceUniqueConnectorInstances =
      options.enforceUniqueConnectorInstances ?? true;
  }

  /**
   * Number of currently registered connectors.
   */
  public get size(): number {
    return this.entriesByExchangeId.size;
  }

  /**
   * Current deterministic mutation version.
   */
  public get version(): number {
    return this.mutationVersion;
  }

  /**
   * Registers a connector.
   *
   * @throws ExchangeRegistryError
   * If the exchange identifier is invalid, the connector is invalid, the
   * exchange is already registered, or the connector instance is already
   * assigned to another exchange.
   */
  public register(
    input: RegisterExchangeConnectorInput<TConnector>,
  ): ExchangeRegistryEntry<TConnector> {
    const validatedInput = this.validateRegistrationInput(input);
    const { exchangeId, connector, metadata } = validatedInput;

    if (this.entriesByExchangeId.has(exchangeId)) {
      throw new ExchangeRegistryError(
        "EXCHANGE_ALREADY_REGISTERED",
        `Exchange connector "${exchangeId}" is already registered.`,
        exchangeId,
      );
    }

    this.assertConnectorInstanceAvailable(connector, exchangeId);

    const entry = this.createEntry(
      exchangeId,
      connector,
      metadata,
      this.nextRegistrationSequence,
    );

    this.entriesByExchangeId.set(exchangeId, entry);

    if (this.enforceUniqueConnectorInstances) {
      this.exchangeIdByConnector.set(connector, exchangeId);
    }

    this.nextRegistrationSequence += 1;
    this.mutationVersion += 1;

    return entry;
  }

  /**
   * Replaces the connector registered under an exchange identifier.
   *
   * Replacement preserves the original registration sequence so deterministic
   * list ordering remains stable.
   *
   * When no connector exists for the identifier, this method behaves like
   * {@link register}.
   */
  public replace(
    input: RegisterExchangeConnectorInput<TConnector>,
  ): ExchangeRegistryEntry<TConnector> {
    const validatedInput = this.validateRegistrationInput(input);
    const { exchangeId, connector, metadata } = validatedInput;

    const currentEntry = this.entriesByExchangeId.get(exchangeId);

    if (currentEntry === undefined) {
      return this.register(validatedInput);
    }

    this.assertConnectorInstanceAvailable(
      connector,
      exchangeId,
      currentEntry.connector,
    );

    const replacement = this.createEntry(
      exchangeId,
      connector,
      metadata,
      currentEntry.registrationSequence,
    );

    this.entriesByExchangeId.set(exchangeId, replacement);

    if (this.enforceUniqueConnectorInstances) {
      this.exchangeIdByConnector.delete(currentEntry.connector);
      this.exchangeIdByConnector.set(connector, exchangeId);
    }

    this.mutationVersion += 1;

    return replacement;
  }

  /**
   * Removes and returns a registered connector entry.
   *
   * @throws ExchangeRegistryError
   * If the exchange is not registered.
   */
  public unregister(
    exchangeId: ExchangeRegistryId,
  ): ExchangeRegistryEntry<TConnector> {
    const normalizedExchangeId = normalizeExchangeRegistryId(exchangeId);
    const existingEntry =
      this.entriesByExchangeId.get(normalizedExchangeId);

    if (existingEntry === undefined) {
      throw new ExchangeRegistryError(
        "EXCHANGE_NOT_REGISTERED",
        `Exchange connector "${normalizedExchangeId}" is not registered.`,
        normalizedExchangeId,
      );
    }

    this.entriesByExchangeId.delete(normalizedExchangeId);

    if (this.enforceUniqueConnectorInstances) {
      this.exchangeIdByConnector.delete(existingEntry.connector);
    }

    this.mutationVersion += 1;

    return existingEntry;
  }

  /**
   * Resolves a connector without throwing when it is absent.
   */
  public get(exchangeId: ExchangeRegistryId): TConnector | undefined {
    return this.getEntry(exchangeId)?.connector;
  }

  /**
   * Resolves an immutable registry entry without throwing when it is absent.
   */
  public getEntry(
    exchangeId: ExchangeRegistryId,
  ): ExchangeRegistryEntry<TConnector> | undefined {
    const normalizedExchangeId = normalizeExchangeRegistryId(exchangeId);

    return this.entriesByExchangeId.get(normalizedExchangeId);
  }

  /**
   * Resolves a connector and throws when it is absent.
   */
  public require(exchangeId: ExchangeRegistryId): TConnector {
    return this.requireEntry(exchangeId).connector;
  }

  /**
   * Resolves an immutable registry entry and throws when it is absent.
   */
  public requireEntry(
    exchangeId: ExchangeRegistryId,
  ): ExchangeRegistryEntry<TConnector> {
    const normalizedExchangeId = normalizeExchangeRegistryId(exchangeId);
    const entry = this.entriesByExchangeId.get(normalizedExchangeId);

    if (entry === undefined) {
      throw new ExchangeRegistryError(
        "EXCHANGE_NOT_REGISTERED",
        `Exchange connector "${normalizedExchangeId}" is not registered.`,
        normalizedExchangeId,
      );
    }

    return entry;
  }

  /**
   * Returns whether an exchange identifier is registered.
   */
  public has(exchangeId: ExchangeRegistryId): boolean {
    const normalizedExchangeId = normalizeExchangeRegistryId(exchangeId);

    return this.entriesByExchangeId.has(normalizedExchangeId);
  }

  /**
   * Returns an immutable list ordered by registration sequence.
   */
  public list(): readonly ExchangeRegistryEntry<TConnector>[] {
    const entries = Array.from(this.entriesByExchangeId.values()).sort(
      compareRegistryEntries,
    );

    return Object.freeze(entries);
  }

  /**
   * Returns the normalized registered exchange identifiers in deterministic
   * registration order.
   */
  public listExchangeIds(): readonly ExchangeRegistryId[] {
    return Object.freeze(
      this.list().map((entry) => entry.exchangeId),
    );
  }

  /**
   * Creates an immutable point-in-time registry snapshot.
   */
  public snapshot(): ExchangeRegistrySnapshot<TConnector> {
    return Object.freeze({
      version: this.mutationVersion,
      size: this.size,
      entries: this.list(),
    });
  }

  /**
   * Removes every registered connector and returns the removed entries in
   * deterministic registration order.
   *
   * Clearing an already empty registry is a no-op and does not increment the
   * mutation version.
   */
  public clear(): readonly ExchangeRegistryEntry<TConnector>[] {
    const removedEntries = this.list();

    if (removedEntries.length === 0) {
      return removedEntries;
    }

    this.entriesByExchangeId.clear();
    this.exchangeIdByConnector.clear();
    this.mutationVersion += 1;

    return removedEntries;
  }

  private validateRegistrationInput(
    input: RegisterExchangeConnectorInput<TConnector>,
  ): Readonly<{
    exchangeId: ExchangeRegistryId;
    connector: TConnector;
    metadata: Readonly<ExchangeRegistryMetadata>;
  }> {
    if (input === null || typeof input !== "object") {
      throw new ExchangeRegistryError(
        "INVALID_CONNECTOR",
        "Exchange registration input must be an object.",
      );
    }

    const exchangeId = normalizeExchangeRegistryId(input.exchangeId);
    const connector = input.connector;

    if (
      connector === null ||
      (typeof connector !== "object" && typeof connector !== "function")
    ) {
      throw new ExchangeRegistryError(
        "INVALID_CONNECTOR",
        `Connector registered for exchange "${exchangeId}" must be a non-null object.`,
        exchangeId,
      );
    }

    return Object.freeze({
      exchangeId,
      connector,
      metadata: freezeMetadata(input.metadata),
    });
  }

  private assertConnectorInstanceAvailable(
    connector: TConnector,
    requestedExchangeId: ExchangeRegistryId,
    connectorBeingReplaced?: TConnector,
  ): void {
    if (!this.enforceUniqueConnectorInstances) {
      return;
    }

    if (connector === connectorBeingReplaced) {
      return;
    }

    const registeredExchangeId =
      this.exchangeIdByConnector.get(connector);

    if (
      registeredExchangeId !== undefined &&
      registeredExchangeId !== requestedExchangeId
    ) {
      throw new ExchangeRegistryError(
        "CONNECTOR_ALREADY_REGISTERED",
        `Connector instance is already registered under exchange "${registeredExchangeId}".`,
        requestedExchangeId,
      );
    }
  }

  private createEntry(
    exchangeId: ExchangeRegistryId,
    connector: TConnector,
    metadata: Readonly<ExchangeRegistryMetadata>,
    registrationSequence: number,
  ): ExchangeRegistryEntry<TConnector> {
    return Object.freeze({
      exchangeId,
      connector,
      metadata,
      registrationSequence,
    });
  }
}

/**
 * Normalizes and validates an exchange registry identifier.
 *
 * Normalization rules:
 *
 * - Leading and trailing whitespace is removed.
 * - The identifier is converted to lowercase.
 * - Internal whitespace and underscores are converted to hyphens.
 * - Consecutive hyphens are collapsed.
 * - Only lowercase letters, digits, dots, colons, and hyphens are accepted.
 *
 * @throws ExchangeRegistryError
 * If the identifier is empty or contains unsupported characters.
 */
export function normalizeExchangeRegistryId(
  exchangeId: ExchangeRegistryId,
): ExchangeRegistryId {
  if (typeof exchangeId !== "string") {
    throw new ExchangeRegistryError(
      "INVALID_EXCHANGE_ID",
      "Exchange identifier must be a string.",
    );
  }

  const normalizedExchangeId = exchangeId
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/-+/gu, "-");

  if (normalizedExchangeId.length === 0) {
    throw new ExchangeRegistryError(
      "INVALID_EXCHANGE_ID",
      "Exchange identifier cannot be empty.",
    );
  }

  if (!/^[a-z0-9][a-z0-9.:-]*$/u.test(normalizedExchangeId)) {
    throw new ExchangeRegistryError(
      "INVALID_EXCHANGE_ID",
      `Exchange identifier "${exchangeId}" contains unsupported characters.`,
      normalizedExchangeId,
    );
  }

  return normalizedExchangeId;
}

function freezeMetadata(
  metadata: ExchangeRegistryMetadata | undefined,
): Readonly<ExchangeRegistryMetadata> {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  if (metadata === null || typeof metadata !== "object") {
    throw new ExchangeRegistryError(
      "INVALID_CONNECTOR",
      "Exchange registry metadata must be an object when provided.",
    );
  }

  const attributes =
    metadata.attributes === undefined
      ? undefined
      : Object.freeze({ ...metadata.attributes });

  return Object.freeze({
    ...(metadata.displayName === undefined
      ? {}
      : { displayName: metadata.displayName }),
    ...(metadata.version === undefined
      ? {}
      : { version: metadata.version }),
    ...(metadata.sandbox === undefined
      ? {}
      : { sandbox: metadata.sandbox }),
    ...(attributes === undefined ? {} : { attributes }),
  });
}

function compareRegistryEntries<TConnector extends object>(
  left: ExchangeRegistryEntry<TConnector>,
  right: ExchangeRegistryEntry<TConnector>,
): number {
  if (left.registrationSequence !== right.registrationSequence) {
    return left.registrationSequence - right.registrationSequence;
  }

  return left.exchangeId.localeCompare(right.exchangeId);
}