/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-plugin-loader.ts
 *
 * Purpose:
 * Provides deterministic strategy plugin discovery, compatibility validation,
 * dependency verification, registry integration, safe unloading, immutable
 * snapshots, and provider-independent plugin lifecycle management.
 */

import {
  EMPTY_STRATEGY_METADATA,
  StrategyContractValidator,
  StrategyFactory,
  StrategyFactoryId,
  StrategyId,
  StrategyMetadata,
  StrategyValidationReport,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";
import {
  DefaultStrategyRegistry,
  StrategyRegistryError,
} from "./strategy-registry";

/* ============================================================================
 * Plugin contracts
 * ============================================================================
 */

export type StrategyPluginId = string;
export type StrategyPluginVersion = string;
export type StrategyFrameworkVersion = string;
export type StrategyPluginSourceId = string;

export type StrategyPluginStatus =
  | "DISCOVERED"
  | "VALIDATING"
  | "LOADING"
  | "LOADED"
  | "UNLOADING"
  | "UNLOADED"
  | "FAILED";

export interface StrategyPluginDependency {
  readonly pluginId: StrategyPluginId;
  readonly versionRange?: string;
  readonly optional?: boolean;
}

export interface StrategyPluginDescriptor {
  readonly pluginId: StrategyPluginId;
  readonly version: StrategyPluginVersion;
  readonly name: string;
  readonly description?: string;
  readonly provider?: string;
  readonly frameworkVersionRange?: string;
  readonly dependencies: readonly StrategyPluginDependency[];
  readonly tags: readonly string[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyPlugin {
  readonly descriptor: StrategyPluginDescriptor;
  readonly factories: readonly StrategyFactory[];

  onLoad?(context: StrategyPluginLoadContext): Promise<void> | void;
  onUnload?(context: StrategyPluginUnloadContext): Promise<void> | void;
}

export interface StrategyPluginLoadContext {
  readonly pluginId: StrategyPluginId;
  readonly pluginVersion: StrategyPluginVersion;
  readonly frameworkVersion: StrategyFrameworkVersion;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPluginUnloadContext {
  readonly pluginId: StrategyPluginId;
  readonly pluginVersion: StrategyPluginVersion;
  readonly frameworkVersion: StrategyFrameworkVersion;
  readonly unloadedAt: UnixTimestampMilliseconds;
  readonly reason: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPluginCandidate {
  readonly sourceId: StrategyPluginSourceId;
  readonly load: () => Promise<StrategyPlugin> | StrategyPlugin;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPluginProvider {
  readonly providerId: string;
  discover(): Promise<readonly StrategyPluginCandidate[]>;
}

/* ============================================================================
 * Errors, options, and dependencies
 * ============================================================================
 */

export type StrategyPluginLoaderErrorCode =
  | "INVALID_ARGUMENT"
  | "DUPLICATE_PLUGIN"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_BUSY"
  | "PLUGIN_VALIDATION_FAILED"
  | "FRAMEWORK_VERSION_INCOMPATIBLE"
  | "DEPENDENCY_NOT_FOUND"
  | "DEPENDENCY_VERSION_INCOMPATIBLE"
  | "DEPENDENCY_IN_USE"
  | "DUPLICATE_FACTORY"
  | "REGISTRATION_FAILED"
  | "LOAD_HOOK_FAILED"
  | "UNLOAD_HOOK_FAILED"
  | "DISCOVERY_FAILED"
  | "PROVIDER_NOT_FOUND";

export class StrategyPluginLoaderError extends Error {
  public readonly code: StrategyPluginLoaderErrorCode;
  public readonly pluginId?: StrategyPluginId;
  public readonly pluginVersion?: StrategyPluginVersion;
  public readonly sourceId?: StrategyPluginSourceId;
  public readonly cause?: unknown;
  public readonly validationReports: readonly StrategyValidationReport[];
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyPluginLoaderErrorCode,
    message: string,
    details: {
      readonly pluginId?: StrategyPluginId;
      readonly pluginVersion?: StrategyPluginVersion;
      readonly sourceId?: StrategyPluginSourceId;
      readonly cause?: unknown;
      readonly validationReports?: readonly StrategyValidationReport[];
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyPluginLoaderError";
    this.code = code;
    this.pluginId = details.pluginId;
    this.pluginVersion = details.pluginVersion;
    this.sourceId = details.sourceId;
    this.cause = details.cause;
    this.validationReports = Object.freeze([
      ...(details.validationReports ?? []),
    ]);
    this.metadata = details.metadata ?? EMPTY_STRATEGY_METADATA;
    Object.setPrototypeOf(this, StrategyPluginLoaderError.prototype);
  }
}

export interface StrategyPluginLoaderClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyPluginLoaderOptions {
  readonly frameworkVersion: StrategyFrameworkVersion;
  readonly validateManifests: boolean;
  readonly invokeLifecycleHooks: boolean;
  readonly allowPluginReplacement: boolean;
  readonly continueDiscoveryAfterFailure: boolean;
  readonly maximumHistoryEntries: number;
}

export const DEFAULT_STRATEGY_PLUGIN_LOADER_OPTIONS: StrategyPluginLoaderOptions =
  Object.freeze({
    frameworkVersion: "1.0.0",
    validateManifests: true,
    invokeLifecycleHooks: true,
    allowPluginReplacement: false,
    continueDiscoveryAfterFailure: false,
    maximumHistoryEntries: 1_000,
  });

/* ============================================================================
 * Snapshots and operation results
 * ============================================================================
 */

export interface StrategyPluginFactorySnapshot {
  readonly factoryId: StrategyFactoryId;
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
}

export interface StrategyLoadedPluginSnapshot {
  readonly pluginId: StrategyPluginId;
  readonly pluginVersion: StrategyPluginVersion;
  readonly descriptor: StrategyPluginDescriptor;
  readonly status: StrategyPluginStatus;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly loadSequence: number;
  readonly factories: readonly StrategyPluginFactorySnapshot[];
}

export interface StrategyPluginLoaderSnapshot {
  readonly createdAt: UnixTimestampMilliseconds;
  readonly frameworkVersion: StrategyFrameworkVersion;
  readonly totalLoadedPlugins: number;
  readonly totalRegisteredFactories: number;
  readonly plugins: readonly StrategyLoadedPluginSnapshot[];
}

export interface StrategyPluginHistoryEntry {
  readonly operationId: string;
  readonly sequence: number;
  readonly pluginId: StrategyPluginId;
  readonly pluginVersion?: StrategyPluginVersion;
  readonly previousStatus?: StrategyPluginStatus;
  readonly status: StrategyPluginStatus;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly reason?: string;
  readonly errorCode?: StrategyPluginLoaderErrorCode;
  readonly metadata: StrategyMetadata;
}

export interface StrategyPluginLoadResult {
  readonly loaded: boolean;
  readonly plugin: StrategyLoadedPluginSnapshot;
}

export interface StrategyPluginDiscoveryFailure {
  readonly sourceId: StrategyPluginSourceId;
  readonly error: StrategyPluginLoaderError;
}

export interface StrategyPluginDiscoveryResult {
  readonly providerId: string;
  readonly discoveredCandidates: number;
  readonly loadedPlugins: readonly StrategyLoadedPluginSnapshot[];
  readonly failures: readonly StrategyPluginDiscoveryFailure[];
}

/* ============================================================================
 * Internal state
 * ============================================================================
 */

interface InternalLoadedPlugin {
  readonly plugin: StrategyPlugin;
  readonly descriptor: StrategyPluginDescriptor;
  status: StrategyPluginStatus;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly loadSequence: number;
  readonly registeredFactories: readonly StrategyFactory[];
}

const DEFAULT_CLOCK: StrategyPluginLoaderClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

/* ============================================================================
 * Deterministic helpers
 * ============================================================================
 */

function normalizeIdentifier(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new StrategyPluginLoaderError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyPluginLoaderError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return normalized;
}

function assertTimestamp(
  timestamp: UnixTimestampMilliseconds,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new StrategyPluginLoaderError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a non-negative safe integer timestamp.`,
    );
  }
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      output[key] = deepClone(nestedValue);
    }

    return output as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nestedValue);
    }

    Object.freeze(value);
  }

  return value;
}

function cloneMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return deepFreeze(deepClone(metadata));
}

function cloneDescriptor(
  descriptor: StrategyPluginDescriptor,
): StrategyPluginDescriptor {
  return deepFreeze(deepClone(descriptor));
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

interface ParsedVersion {
  readonly components: readonly number[];
  readonly prerelease?: string;
}

function parseVersion(value: string): ParsedVersion | undefined {
  const normalized = value.trim().replace(/^v/i, "");
  const match = /^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);

  if (match === null) {
    return undefined;
  }

  return Object.freeze({
    components: Object.freeze(match[1].split(".").map(Number)),
    prerelease: match[2],
  });
}

export function comparePluginVersions(left: string, right: string): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (parsedLeft === undefined || parsedRight === undefined) {
    return compareText(left, right);
  }

  const length = Math.max(
    parsedLeft.components.length,
    parsedRight.components.length,
  );

  for (let index = 0; index < length; index += 1) {
    const leftComponent = parsedLeft.components[index] ?? 0;
    const rightComponent = parsedRight.components[index] ?? 0;

    if (leftComponent !== rightComponent) {
      return leftComponent < rightComponent ? -1 : 1;
    }
  }

  if (parsedLeft.prerelease === parsedRight.prerelease) {
    return 0;
  }

  if (parsedLeft.prerelease === undefined) {
    return 1;
  }

  if (parsedRight.prerelease === undefined) {
    return -1;
  }

  return compareText(parsedLeft.prerelease, parsedRight.prerelease);
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const match = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(comparator.trim());

  if (match === null) {
    return false;
  }

  const operator = match[1] ?? "=";
  const expected = match[2].trim();
  const comparison = comparePluginVersions(version, expected);

  switch (operator) {
    case ">=":
      return comparison >= 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case "<":
      return comparison < 0;
    case "=":
      return comparison === 0;
    case "^": {
      const current = parseVersion(version);
      const minimum = parseVersion(expected);
      return (
        current !== undefined &&
        minimum !== undefined &&
        comparison >= 0 &&
        (current.components[0] ?? 0) === (minimum.components[0] ?? 0)
      );
    }
    case "~": {
      const current = parseVersion(version);
      const minimum = parseVersion(expected);
      return (
        current !== undefined &&
        minimum !== undefined &&
        comparison >= 0 &&
        (current.components[0] ?? 0) === (minimum.components[0] ?? 0) &&
        (current.components[1] ?? 0) === (minimum.components[1] ?? 0)
      );
    }
    default:
      return false;
  }
}

export function satisfiesPluginVersionRange(
  version: string,
  versionRange?: string,
): boolean {
  if (versionRange === undefined || versionRange.trim().length === 0) {
    return true;
  }

  const alternatives = versionRange
    .split("||")
    .map((alternative) => alternative.trim())
    .filter((alternative) => alternative.length > 0);

  return alternatives.some((alternative) => {
    const comparators = alternative
      .split(/\s+/)
      .map((comparator) => comparator.trim())
      .filter((comparator) => comparator.length > 0);

    return comparators.every((comparator) =>
      satisfiesComparator(version, comparator),
    );
  });
}

function pluginKey(pluginId: StrategyPluginId): string {
  return normalizeIdentifier(pluginId, "pluginId");
}

/* ============================================================================
 * Loader implementation
 * ============================================================================
 */

export class DefaultStrategyPluginLoader {
  private readonly registry: DefaultStrategyRegistry;
  private readonly validator?: StrategyContractValidator;
  private readonly clock: StrategyPluginLoaderClock;
  private readonly options: StrategyPluginLoaderOptions;
  private readonly providers = new Map<string, StrategyPluginProvider>();
  private readonly loadedPlugins = new Map<StrategyPluginId, InternalLoadedPlugin>();
  private readonly operationLocks = new Set<StrategyPluginId>();
  private readonly historyEntries: StrategyPluginHistoryEntry[] = [];
  private sequence = 0;
  private historySequence = 0;

  public constructor(dependencies: {
    readonly registry: DefaultStrategyRegistry;
    readonly validator?: StrategyContractValidator;
    readonly clock?: StrategyPluginLoaderClock;
    readonly options?: Partial<StrategyPluginLoaderOptions>;
    readonly providers?: readonly StrategyPluginProvider[];
  }) {
    if (dependencies === undefined || dependencies.registry === undefined) {
      throw new StrategyPluginLoaderError(
        "INVALID_ARGUMENT",
        "A strategy registry is required.",
      );
    }

    this.registry = dependencies.registry;
    this.validator = dependencies.validator;
    this.clock = dependencies.clock ?? DEFAULT_CLOCK;
    this.options = Object.freeze({
      ...DEFAULT_STRATEGY_PLUGIN_LOADER_OPTIONS,
      ...dependencies.options,
    });

    if (
      !Number.isSafeInteger(this.options.maximumHistoryEntries) ||
      this.options.maximumHistoryEntries < 1
    ) {
      throw new StrategyPluginLoaderError(
        "INVALID_ARGUMENT",
        "maximumHistoryEntries must be a positive safe integer.",
      );
    }

    for (const provider of dependencies.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  public registerProvider(provider: StrategyPluginProvider): void {
    if (provider === undefined || typeof provider.discover !== "function") {
      throw new StrategyPluginLoaderError(
        "INVALID_ARGUMENT",
        "provider must define a discover function.",
      );
    }

    const providerId = normalizeIdentifier(provider.providerId, "providerId");

    if (this.providers.has(providerId)) {
      throw new StrategyPluginLoaderError(
        "INVALID_ARGUMENT",
        `Plugin provider '${providerId}' is already registered.`,
      );
    }

    this.providers.set(providerId, provider);
  }

  public unregisterProvider(providerId: string): boolean {
    return this.providers.delete(
      normalizeIdentifier(providerId, "providerId"),
    );
  }

  public listProviders(): readonly StrategyPluginProvider[] {
    return Object.freeze(
      [...this.providers.values()].sort((left, right) =>
        compareText(left.providerId, right.providerId),
      ),
    );
  }

  public async discoverAndLoad(
    providerId: string,
  ): Promise<StrategyPluginDiscoveryResult> {
    const normalizedProviderId = normalizeIdentifier(providerId, "providerId");
    const provider = this.providers.get(normalizedProviderId);

    if (provider === undefined) {
      throw new StrategyPluginLoaderError(
        "PROVIDER_NOT_FOUND",
        `Plugin provider '${normalizedProviderId}' is not registered.`,
      );
    }

    let candidates: readonly StrategyPluginCandidate[];

    try {
      candidates = await provider.discover();
    } catch (error) {
      throw new StrategyPluginLoaderError(
        "DISCOVERY_FAILED",
        `Plugin discovery failed for provider '${normalizedProviderId}'.`,
        { cause: error },
      );
    }

    const orderedCandidates = [...candidates].sort((left, right) =>
      compareText(left.sourceId, right.sourceId),
    );
    const loaded: StrategyLoadedPluginSnapshot[] = [];
    const failures: StrategyPluginDiscoveryFailure[] = [];

    for (const candidate of orderedCandidates) {
      const sourceId = normalizeIdentifier(candidate.sourceId, "sourceId");

      try {
        const plugin = await candidate.load();
        const result = await this.load(plugin);
        loaded.push(result.plugin);
      } catch (error) {
        const normalizedError =
          error instanceof StrategyPluginLoaderError
            ? error
            : new StrategyPluginLoaderError(
                "DISCOVERY_FAILED",
                `Failed to load plugin candidate '${sourceId}'.`,
                { sourceId, cause: error },
              );

        failures.push(
          deepFreeze({
            sourceId,
            error: normalizedError,
          }),
        );

        if (!this.options.continueDiscoveryAfterFailure) {
          break;
        }
      }
    }

    return deepFreeze({
      providerId: normalizedProviderId,
      discoveredCandidates: orderedCandidates.length,
      loadedPlugins: loaded,
      failures,
    });
  }

  public async load(plugin: StrategyPlugin): Promise<StrategyPluginLoadResult> {
    this.assertPlugin(plugin);

    const pluginId = pluginKey(plugin.descriptor.pluginId);
    const pluginVersion = normalizeIdentifier(
      plugin.descriptor.version,
      "plugin.descriptor.version",
    );

    return this.withPluginLock(pluginId, async () => {
      const existing = this.loadedPlugins.get(pluginId);

      if (existing !== undefined) {
        if (
          existing.descriptor.version === pluginVersion &&
          existing.plugin === plugin
        ) {
          return deepFreeze({ loaded: false, plugin: this.toSnapshot(existing) });
        }

        if (!this.options.allowPluginReplacement) {
          throw new StrategyPluginLoaderError(
            "DUPLICATE_PLUGIN",
            `Plugin '${pluginId}' is already loaded.`,
            { pluginId, pluginVersion },
          );
        }

        await this.unloadInternal(existing, "plugin replacement", true);
      }

      const timestamp = this.clock.now();
      assertTimestamp(timestamp, "clock.now()");
      this.recordHistory(pluginId, pluginVersion, undefined, "VALIDATING", timestamp);

      const reports = this.validatePlugin(plugin, timestamp);
      this.validateFrameworkCompatibility(plugin.descriptor);
      this.validateDependencies(plugin.descriptor);
      this.validateFactoryUniqueness(plugin);

      this.recordHistory(
        pluginId,
        pluginVersion,
        "VALIDATING",
        "LOADING",
        timestamp,
      );

      const registered: StrategyFactory[] = [];

      try {
        for (const factory of this.sortFactories(plugin.factories)) {
          this.registry.registerAt(factory, timestamp);
          registered.push(factory);
        }
      } catch (error) {
        this.rollbackFactories(registered);
        const normalized = new StrategyPluginLoaderError(
          "REGISTRATION_FAILED",
          `Failed to register factories for plugin '${pluginId}'.`,
          {
            pluginId,
            pluginVersion,
            cause: error,
            validationReports: reports,
          },
        );
        this.recordFailure(pluginId, pluginVersion, "LOADING", timestamp, normalized);
        throw normalized;
      }

      if (this.options.invokeLifecycleHooks && plugin.onLoad !== undefined) {
        try {
          await plugin.onLoad(
            deepFreeze({
              pluginId,
              pluginVersion,
              frameworkVersion: this.options.frameworkVersion,
              loadedAt: timestamp,
              metadata: cloneMetadata(plugin.descriptor.metadata),
            }),
          );
        } catch (error) {
          this.rollbackFactories(registered);
          const normalized = new StrategyPluginLoaderError(
            "LOAD_HOOK_FAILED",
            `Load hook failed for plugin '${pluginId}'.`,
            { pluginId, pluginVersion, cause: error },
          );
          this.recordFailure(pluginId, pluginVersion, "LOADING", timestamp, normalized);
          throw normalized;
        }
      }

      this.sequence += 1;
      const entry: InternalLoadedPlugin = {
        plugin,
        descriptor: cloneDescriptor(plugin.descriptor),
        status: "LOADED",
        loadedAt: timestamp,
        loadSequence: this.sequence,
        registeredFactories: Object.freeze([...registered]),
      };

      this.loadedPlugins.set(pluginId, entry);
      this.recordHistory(pluginId, pluginVersion, "LOADING", "LOADED", timestamp);

      return deepFreeze({ loaded: true, plugin: this.toSnapshot(entry) });
    });
  }

  public async unload(
    pluginId: StrategyPluginId,
    reason = "plugin unload requested",
  ): Promise<boolean> {
    const normalizedPluginId = pluginKey(pluginId);

    return this.withPluginLock(normalizedPluginId, async () => {
      const entry = this.loadedPlugins.get(normalizedPluginId);

      if (entry === undefined) {
        return false;
      }

      await this.unloadInternal(entry, reason, false);
      return true;
    });
  }

  public async unloadAll(reason = "plugin loader shutdown"): Promise<void> {
    const pluginIds = [...this.loadedPlugins.values()]
      .sort((left, right) => right.loadSequence - left.loadSequence)
      .map((entry) => entry.descriptor.pluginId);

    for (const pluginId of pluginIds) {
      await this.unload(pluginId, reason);
    }
  }

  public has(pluginId: StrategyPluginId): boolean {
    return this.loadedPlugins.has(pluginKey(pluginId));
  }

  public get(
    pluginId: StrategyPluginId,
  ): StrategyLoadedPluginSnapshot | undefined {
    const entry = this.loadedPlugins.get(pluginKey(pluginId));
    return entry === undefined ? undefined : this.toSnapshot(entry);
  }

  public getRequired(pluginId: StrategyPluginId): StrategyLoadedPluginSnapshot {
    const plugin = this.get(pluginId);

    if (plugin === undefined) {
      throw new StrategyPluginLoaderError(
        "PLUGIN_NOT_FOUND",
        `Plugin '${pluginId}' is not loaded.`,
        { pluginId },
      );
    }

    return plugin;
  }

  public list(): readonly StrategyLoadedPluginSnapshot[] {
    return Object.freeze(
      [...this.loadedPlugins.values()]
        .sort((left, right) => left.loadSequence - right.loadSequence)
        .map((entry) => this.toSnapshot(entry)),
    );
  }

  public history(): readonly StrategyPluginHistoryEntry[] {
    return deepFreeze(deepClone(this.historyEntries));
  }

  public snapshot(
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): StrategyPluginLoaderSnapshot {
    assertTimestamp(timestamp, "timestamp");
    const plugins = this.list();

    return deepFreeze({
      createdAt: timestamp,
      frameworkVersion: this.options.frameworkVersion,
      totalLoadedPlugins: plugins.length,
      totalRegisteredFactories: plugins.reduce(
        (total, plugin) => total + plugin.factories.length,
        0,
      ),
      plugins,
    });
  }

  private async unloadInternal(
    entry: InternalLoadedPlugin,
    reason: string,
    replacement: boolean,
  ): Promise<void> {
    const pluginId = entry.descriptor.pluginId;
    const pluginVersion = entry.descriptor.version;
    const timestamp = this.clock.now();
    assertTimestamp(timestamp, "clock.now()");

    entry.status = "UNLOADING";
    this.recordHistory(
      pluginId,
      pluginVersion,
      "LOADED",
      "UNLOADING",
      timestamp,
      reason,
    );

    if (this.hasRequiredDependent(pluginId, replacement)) {
      entry.status = "LOADED";
      throw new StrategyPluginLoaderError(
        "DEPENDENCY_IN_USE",
        `Plugin '${pluginId}' is required by another loaded plugin.`,
        { pluginId, pluginVersion },
      );
    }

    if (this.options.invokeLifecycleHooks && entry.plugin.onUnload !== undefined) {
      try {
        await entry.plugin.onUnload(
          deepFreeze({
            pluginId,
            pluginVersion,
            frameworkVersion: this.options.frameworkVersion,
            unloadedAt: timestamp,
            reason,
            metadata: cloneMetadata(entry.descriptor.metadata),
          }),
        );
      } catch (error) {
        entry.status = "LOADED";
        const normalized = new StrategyPluginLoaderError(
          "UNLOAD_HOOK_FAILED",
          `Unload hook failed for plugin '${pluginId}'.`,
          { pluginId, pluginVersion, cause: error },
        );
        this.recordFailure(
          pluginId,
          pluginVersion,
          "UNLOADING",
          timestamp,
          normalized,
        );
        throw normalized;
      }
    }

    for (const factory of [...entry.registeredFactories].reverse()) {
      this.registry.unregisterFactory(factory.factoryId);
    }

    entry.status = "UNLOADED";
    this.loadedPlugins.delete(pluginId);
    this.recordHistory(
      pluginId,
      pluginVersion,
      "UNLOADING",
      "UNLOADED",
      timestamp,
      reason,
    );
  }

  private validatePlugin(
    plugin: StrategyPlugin,
    timestamp: UnixTimestampMilliseconds,
  ): readonly StrategyValidationReport[] {
    const descriptor = plugin.descriptor;
    normalizeIdentifier(descriptor.pluginId, "descriptor.pluginId");
    normalizeIdentifier(descriptor.version, "descriptor.version");
    normalizeIdentifier(descriptor.name, "descriptor.name");

    if (!Array.isArray(plugin.factories) || plugin.factories.length === 0) {
      throw new StrategyPluginLoaderError(
        "PLUGIN_VALIDATION_FAILED",
        `Plugin '${descriptor.pluginId}' must expose at least one strategy factory.`,
        { pluginId: descriptor.pluginId, pluginVersion: descriptor.version },
      );
    }

    const reports: StrategyValidationReport[] = [];

    if (this.options.validateManifests) {
      if (this.validator === undefined) {
        throw new StrategyPluginLoaderError(
          "PLUGIN_VALIDATION_FAILED",
          "Manifest validation is enabled, but no validator was supplied.",
          { pluginId: descriptor.pluginId, pluginVersion: descriptor.version },
        );
      }

      for (const factory of plugin.factories) {
        const report = this.validator.validateManifest(factory.manifest, timestamp);
        reports.push(report);

        if (!report.valid) {
          throw new StrategyPluginLoaderError(
            "PLUGIN_VALIDATION_FAILED",
            `Manifest validation failed for factory '${factory.factoryId}'.`,
            {
              pluginId: descriptor.pluginId,
              pluginVersion: descriptor.version,
              validationReports: reports,
            },
          );
        }
      }
    }

    return Object.freeze(reports);
  }

  private validateFrameworkCompatibility(
    descriptor: StrategyPluginDescriptor,
  ): void {
    if (
      !satisfiesPluginVersionRange(
        this.options.frameworkVersion,
        descriptor.frameworkVersionRange,
      )
    ) {
      throw new StrategyPluginLoaderError(
        "FRAMEWORK_VERSION_INCOMPATIBLE",
        `Plugin '${descriptor.pluginId}' requires framework version '${descriptor.frameworkVersionRange}', but '${this.options.frameworkVersion}' is running.`,
        { pluginId: descriptor.pluginId, pluginVersion: descriptor.version },
      );
    }
  }

  private validateDependencies(descriptor: StrategyPluginDescriptor): void {
    for (const dependency of descriptor.dependencies) {
      const dependencyId = pluginKey(dependency.pluginId);
      const loadedDependency = this.loadedPlugins.get(dependencyId);

      if (loadedDependency === undefined) {
        if (dependency.optional === true) {
          continue;
        }

        throw new StrategyPluginLoaderError(
          "DEPENDENCY_NOT_FOUND",
          `Plugin '${descriptor.pluginId}' requires plugin '${dependencyId}'.`,
          { pluginId: descriptor.pluginId, pluginVersion: descriptor.version },
        );
      }

      if (
        !satisfiesPluginVersionRange(
          loadedDependency.descriptor.version,
          dependency.versionRange,
        )
      ) {
        throw new StrategyPluginLoaderError(
          "DEPENDENCY_VERSION_INCOMPATIBLE",
          `Plugin '${descriptor.pluginId}' requires '${dependencyId}' version '${dependency.versionRange}', but '${loadedDependency.descriptor.version}' is loaded.`,
          { pluginId: descriptor.pluginId, pluginVersion: descriptor.version },
        );
      }
    }
  }

  private validateFactoryUniqueness(plugin: StrategyPlugin): void {
    const factoryIds = new Set<StrategyFactoryId>();
    const strategyVersions = new Set<string>();

    for (const factory of plugin.factories) {
      const factoryId = normalizeIdentifier(factory.factoryId, "factory.factoryId");
      const strategyId = normalizeIdentifier(
        factory.manifest.strategyId,
        "factory.manifest.strategyId",
      );
      const strategyVersion = normalizeIdentifier(
        factory.manifest.version,
        "factory.manifest.version",
      );
      const strategyVersionKey = `${strategyId}\u0000${strategyVersion}`;

      if (factoryIds.has(factoryId) || this.registry.hasFactory(factoryId)) {
        throw new StrategyPluginLoaderError(
          "DUPLICATE_FACTORY",
          `Factory '${factoryId}' is duplicated or already registered.`,
          {
            pluginId: plugin.descriptor.pluginId,
            pluginVersion: plugin.descriptor.version,
          },
        );
      }

      if (
        strategyVersions.has(strategyVersionKey) ||
        this.registry.hasVersion(strategyId, strategyVersion)
      ) {
        throw new StrategyPluginLoaderError(
          "DUPLICATE_FACTORY",
          `Strategy '${strategyId}' version '${strategyVersion}' is duplicated or already registered.`,
          {
            pluginId: plugin.descriptor.pluginId,
            pluginVersion: plugin.descriptor.version,
          },
        );
      }

      factoryIds.add(factoryId);
      strategyVersions.add(strategyVersionKey);
    }
  }

  private sortFactories(
    factories: readonly StrategyFactory[],
  ): readonly StrategyFactory[] {
    return Object.freeze(
      [...factories].sort((left, right) => {
        const strategyComparison = compareText(
          left.manifest.strategyId,
          right.manifest.strategyId,
        );

        if (strategyComparison !== 0) {
          return strategyComparison;
        }

        const versionComparison = comparePluginVersions(
          left.manifest.version,
          right.manifest.version,
        );

        if (versionComparison !== 0) {
          return versionComparison;
        }

        return compareText(left.factoryId, right.factoryId);
      }),
    );
  }

  private rollbackFactories(factories: readonly StrategyFactory[]): void {
    for (const factory of [...factories].reverse()) {
      try {
        this.registry.unregisterFactory(factory.factoryId);
      } catch (error) {
        if (!(error instanceof StrategyRegistryError)) {
          throw error;
        }
      }
    }
  }

  private hasRequiredDependent(
    pluginId: StrategyPluginId,
    replacement: boolean,
  ): boolean {
    if (replacement) {
      return false;
    }

    for (const entry of this.loadedPlugins.values()) {
      if (entry.descriptor.pluginId === pluginId) {
        continue;
      }

      if (
        entry.descriptor.dependencies.some(
          (dependency) =>
            dependency.pluginId === pluginId && dependency.optional !== true,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private toSnapshot(
    entry: InternalLoadedPlugin,
  ): StrategyLoadedPluginSnapshot {
    return deepFreeze({
      pluginId: entry.descriptor.pluginId,
      pluginVersion: entry.descriptor.version,
      descriptor: cloneDescriptor(entry.descriptor),
      status: entry.status,
      loadedAt: entry.loadedAt,
      loadSequence: entry.loadSequence,
      factories: entry.registeredFactories.map((factory) =>
        deepFreeze({
          factoryId: factory.factoryId,
          strategyId: factory.manifest.strategyId,
          strategyVersion: factory.manifest.version,
        }),
      ),
    });
  }

  private async withPluginLock<T>(
    pluginId: StrategyPluginId,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.operationLocks.has(pluginId)) {
      throw new StrategyPluginLoaderError(
        "PLUGIN_BUSY",
        `Plugin '${pluginId}' already has an operation in progress.`,
        { pluginId },
      );
    }

    this.operationLocks.add(pluginId);

    try {
      return await operation();
    } finally {
      this.operationLocks.delete(pluginId);
    }
  }

  private recordFailure(
    pluginId: StrategyPluginId,
    pluginVersion: StrategyPluginVersion,
    previousStatus: StrategyPluginStatus,
    timestamp: UnixTimestampMilliseconds,
    error: StrategyPluginLoaderError,
  ): void {
    this.recordHistory(
      pluginId,
      pluginVersion,
      previousStatus,
      "FAILED",
      timestamp,
      error.message,
      error.code,
    );
  }

  private recordHistory(
    pluginId: StrategyPluginId,
    pluginVersion: StrategyPluginVersion | undefined,
    previousStatus: StrategyPluginStatus | undefined,
    status: StrategyPluginStatus,
    timestamp: UnixTimestampMilliseconds,
    reason?: string,
    errorCode?: StrategyPluginLoaderErrorCode,
  ): void {
    this.historySequence += 1;

    this.historyEntries.push(
      deepFreeze({
        operationId: `strategy-plugin-operation-${this.historySequence}`,
        sequence: this.historySequence,
        pluginId,
        pluginVersion,
        previousStatus,
        status,
        timestamp,
        reason,
        errorCode,
        metadata: cloneMetadata(EMPTY_STRATEGY_METADATA),
      }),
    );

    const overflow =
      this.historyEntries.length - this.options.maximumHistoryEntries;

    if (overflow > 0) {
      this.historyEntries.splice(0, overflow);
    }
  }

  private assertPlugin(plugin: StrategyPlugin): void {
    if (
      plugin === undefined ||
      plugin === null ||
      typeof plugin !== "object" ||
      plugin.descriptor === undefined
    ) {
      throw new StrategyPluginLoaderError(
        "INVALID_ARGUMENT",
        "plugin and plugin.descriptor are required.",
      );
    }
  }
}