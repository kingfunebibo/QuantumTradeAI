/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-registry.ts
 *
 * Purpose:
 * Provides deterministic, version-aware strategy factory registration with
 * manifest validation, duplicate protection, lifecycle-safe replacement,
 * immutable snapshots, and predictable lookup semantics.
 */

import {
  EMPTY_STRATEGY_METADATA,
  StrategyContractValidator,
  StrategyFactory,
  StrategyFactoryId,
  StrategyId,
  StrategyManifest,
  StrategyMetadata,
  StrategyRegistry,
  StrategyValidationIssue,
  StrategyValidationReport,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

/* ============================================================================
 * Errors and options
 * ============================================================================
 */

export type StrategyRegistryErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_MANIFEST"
  | "DUPLICATE_STRATEGY_VERSION"
  | "DUPLICATE_FACTORY_ID"
  | "STRATEGY_NOT_FOUND"
  | "STRATEGY_VERSION_NOT_FOUND"
  | "FACTORY_NOT_FOUND"
  | "REPLACEMENT_NOT_ALLOWED";

export class StrategyRegistryError extends Error {
  public readonly code: StrategyRegistryErrorCode;
  public readonly strategyId?: StrategyId;
  public readonly strategyVersion?: StrategyVersion;
  public readonly factoryId?: StrategyFactoryId;
  public readonly metadata: StrategyMetadata;
  public readonly validationReport?: StrategyValidationReport;

  public constructor(
    code: StrategyRegistryErrorCode,
    message: string,
    details: {
      readonly strategyId?: StrategyId;
      readonly strategyVersion?: StrategyVersion;
      readonly factoryId?: StrategyFactoryId;
      readonly metadata?: StrategyMetadata;
      readonly validationReport?: StrategyValidationReport;
    } = {},
  ) {
    super(message);
    this.name = "StrategyRegistryError";
    this.code = code;
    this.strategyId = details.strategyId;
    this.strategyVersion = details.strategyVersion;
    this.factoryId = details.factoryId;
    this.metadata = details.metadata ?? EMPTY_STRATEGY_METADATA;
    this.validationReport = details.validationReport;
    Object.setPrototypeOf(this, StrategyRegistryError.prototype);
  }
}

export interface StrategyRegistryClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyRegistryOptions {
  readonly allowVersionReplacement: boolean;
  readonly validateManifests: boolean;
  readonly preserveRegistrationOrder: boolean;
}

export const DEFAULT_STRATEGY_REGISTRY_OPTIONS: StrategyRegistryOptions =
  Object.freeze({
    allowVersionReplacement: false,
    validateManifests: true,
    preserveRegistrationOrder: true,
  });

/* ============================================================================
 * Snapshot contracts
 * ============================================================================
 */

export interface StrategyRegistryEntrySnapshot {
  readonly strategyId: StrategyId;
  readonly strategyVersion: StrategyVersion;
  readonly factoryId: StrategyFactoryId;
  readonly manifest: StrategyManifest;
  readonly registeredAt: UnixTimestampMilliseconds;
  readonly registrationSequence: number;
}

export interface StrategyRegistrySnapshot {
  readonly createdAt: UnixTimestampMilliseconds;
  readonly totalStrategies: number;
  readonly totalVersions: number;
  readonly entries: readonly StrategyRegistryEntrySnapshot[];
}

interface InternalRegistryEntry {
  readonly factory: StrategyFactory;
  readonly registeredAt: UnixTimestampMilliseconds;
  readonly registrationSequence: number;
}

/* ============================================================================
 * Deterministic helpers
 * ============================================================================
 */

const DEFAULT_CLOCK: StrategyRegistryClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

function normalizeRequiredIdentifier(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyRegistryError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return normalized;
}

function compareLexicographically(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function parseVersion(version: StrategyVersion): readonly number[] | undefined {
  const normalized = version.trim().replace(/^v/i, "");
  const core = normalized.split("-", 1)[0];

  if (!/^\d+(?:\.\d+)*$/.test(core)) {
    return undefined;
  }

  return Object.freeze(core.split(".").map((segment) => Number(segment)));
}

export function compareStrategyVersions(
  left: StrategyVersion,
  right: StrategyVersion,
): number {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (parsedLeft !== undefined && parsedRight !== undefined) {
    const length = Math.max(parsedLeft.length, parsedRight.length);

    for (let index = 0; index < length; index += 1) {
      const leftPart = parsedLeft[index] ?? 0;
      const rightPart = parsedRight[index] ?? 0;

      if (leftPart < rightPart) {
        return -1;
      }

      if (leftPart > rightPart) {
        return 1;
      }
    }
  }

  return compareLexicographically(left, right);
}

function cloneMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return deepFreeze(deepClone(metadata)) as StrategyMetadata;
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

function cloneManifest(manifest: StrategyManifest): StrategyManifest {
  return deepFreeze(deepClone(manifest));
}

function createSnapshotEntry(
  entry: InternalRegistryEntry,
): StrategyRegistryEntrySnapshot {
  return deepFreeze({
    strategyId: entry.factory.manifest.strategyId,
    strategyVersion: entry.factory.manifest.version,
    factoryId: entry.factory.factoryId,
    manifest: cloneManifest(entry.factory.manifest),
    registeredAt: entry.registeredAt,
    registrationSequence: entry.registrationSequence,
  });
}

function createBasicValidationReport(
  issues: readonly StrategyValidationIssue[],
  timestamp: UnixTimestampMilliseconds,
): StrategyValidationReport {
  return deepFreeze({
    valid: issues.every((issue) => issue.severity !== "ERROR"),
    issues: [...issues],
    validatedAt: timestamp,
    metadata: cloneMetadata(EMPTY_STRATEGY_METADATA),
  });
}

/* ============================================================================
 * Registry implementation
 * ============================================================================
 */

export class DefaultStrategyRegistry implements StrategyRegistry {
  private readonly entriesByStrategy = new Map<
    StrategyId,
    Map<StrategyVersion, InternalRegistryEntry>
  >();

  private readonly entriesByFactoryId = new Map<
    StrategyFactoryId,
    InternalRegistryEntry
  >();

  private readonly validator?: StrategyContractValidator;
  private readonly clock: StrategyRegistryClock;
  private readonly options: StrategyRegistryOptions;
  private registrationSequence = 0;

  public constructor(
    dependencies: {
      readonly validator?: StrategyContractValidator;
      readonly clock?: StrategyRegistryClock;
      readonly options?: Partial<StrategyRegistryOptions>;
    } = {},
  ) {
    this.validator = dependencies.validator;
    this.clock = dependencies.clock ?? DEFAULT_CLOCK;
    this.options = Object.freeze({
      ...DEFAULT_STRATEGY_REGISTRY_OPTIONS,
      ...dependencies.options,
    });
  }

  public register(factory: StrategyFactory): void {
    this.registerAt(factory, this.clock.now());
  }

  public registerAt(
    factory: StrategyFactory,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    this.assertFactory(factory);
    this.assertTimestamp(timestamp);

    const strategyId = normalizeRequiredIdentifier(
      factory.manifest.strategyId,
      "factory.manifest.strategyId",
    );
    const strategyVersion = normalizeRequiredIdentifier(
      factory.manifest.version,
      "factory.manifest.version",
    );
    const factoryId = normalizeRequiredIdentifier(
      factory.factoryId,
      "factory.factoryId",
    );

    this.validateManifest(factory.manifest, timestamp);

    const existingByFactoryId = this.entriesByFactoryId.get(factoryId);
    const versions = this.entriesByStrategy.get(strategyId);
    const existingVersion = versions?.get(strategyVersion);

    if (
      existingByFactoryId !== undefined &&
      existingByFactoryId.factory !== factory
    ) {
      throw new StrategyRegistryError(
        "DUPLICATE_FACTORY_ID",
        `A strategy factory with factoryId '${factoryId}' is already registered.`,
        { strategyId, strategyVersion, factoryId },
      );
    }

    if (existingVersion !== undefined) {
      if (existingVersion.factory === factory) {
        return;
      }

      if (!this.options.allowVersionReplacement) {
        throw new StrategyRegistryError(
          "DUPLICATE_STRATEGY_VERSION",
          `Strategy '${strategyId}' version '${strategyVersion}' is already registered.`,
          { strategyId, strategyVersion, factoryId },
        );
      }

      this.entriesByFactoryId.delete(existingVersion.factory.factoryId);
    }

    this.registrationSequence += 1;

    const entry: InternalRegistryEntry = Object.freeze({
      factory,
      registeredAt: timestamp,
      registrationSequence: this.registrationSequence,
    });

    const strategyVersions = versions ?? new Map<StrategyVersion, InternalRegistryEntry>();
    strategyVersions.set(strategyVersion, entry);
    this.entriesByStrategy.set(strategyId, strategyVersions);
    this.entriesByFactoryId.set(factoryId, entry);
  }

  public unregister(strategyId: StrategyId): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined) {
      return false;
    }

    for (const entry of versions.values()) {
      this.entriesByFactoryId.delete(entry.factory.factoryId);
    }

    this.entriesByStrategy.delete(normalizedStrategyId);
    return true;
  }

  public unregisterVersion(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const normalizedVersion = normalizeRequiredIdentifier(
      strategyVersion,
      "strategyVersion",
    );
    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined) {
      return false;
    }

    const entry = versions.get(normalizedVersion);

    if (entry === undefined) {
      return false;
    }

    versions.delete(normalizedVersion);
    this.entriesByFactoryId.delete(entry.factory.factoryId);

    if (versions.size === 0) {
      this.entriesByStrategy.delete(normalizedStrategyId);
    }

    return true;
  }

  public unregisterFactory(factoryId: StrategyFactoryId): boolean {
    const normalizedFactoryId = normalizeRequiredIdentifier(
      factoryId,
      "factoryId",
    );
    const entry = this.entriesByFactoryId.get(normalizedFactoryId);

    if (entry === undefined) {
      return false;
    }

    return this.unregisterVersion(
      entry.factory.manifest.strategyId,
      entry.factory.manifest.version,
    );
  }

  public has(strategyId: StrategyId): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    return this.entriesByStrategy.has(normalizedStrategyId);
  }

  public hasVersion(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): boolean {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const normalizedVersion = normalizeRequiredIdentifier(
      strategyVersion,
      "strategyVersion",
    );

    return (
      this.entriesByStrategy
        .get(normalizedStrategyId)
        ?.has(normalizedVersion) ?? false
    );
  }

  public hasFactory(factoryId: StrategyFactoryId): boolean {
    const normalizedFactoryId = normalizeRequiredIdentifier(
      factoryId,
      "factoryId",
    );
    return this.entriesByFactoryId.has(normalizedFactoryId);
  }

  public get(strategyId: StrategyId): StrategyFactory | undefined {
    return this.getLatest(strategyId);
  }

  public getLatest(strategyId: StrategyId): StrategyFactory | undefined {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined || versions.size === 0) {
      return undefined;
    }

    let latest: InternalRegistryEntry | undefined;

    for (const entry of versions.values()) {
      if (
        latest === undefined ||
        compareStrategyVersions(
          entry.factory.manifest.version,
          latest.factory.manifest.version,
        ) > 0
      ) {
        latest = entry;
      }
    }

    return latest?.factory;
  }

  public getRequired(strategyId: StrategyId): StrategyFactory {
    const factory = this.getLatest(strategyId);

    if (factory === undefined) {
      throw new StrategyRegistryError(
        "STRATEGY_NOT_FOUND",
        `Strategy '${strategyId}' is not registered.`,
        { strategyId },
      );
    }

    return factory;
  }

  public getVersion(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): StrategyFactory | undefined {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const normalizedVersion = normalizeRequiredIdentifier(
      strategyVersion,
      "strategyVersion",
    );

    return this.entriesByStrategy
      .get(normalizedStrategyId)
      ?.get(normalizedVersion)?.factory;
  }

  public getRequiredVersion(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): StrategyFactory {
    const factory = this.getVersion(strategyId, strategyVersion);

    if (factory === undefined) {
      throw new StrategyRegistryError(
        "STRATEGY_VERSION_NOT_FOUND",
        `Strategy '${strategyId}' version '${strategyVersion}' is not registered.`,
        { strategyId, strategyVersion },
      );
    }

    return factory;
  }

  public getByFactoryId(
    factoryId: StrategyFactoryId,
  ): StrategyFactory | undefined {
    const normalizedFactoryId = normalizeRequiredIdentifier(
      factoryId,
      "factoryId",
    );
    return this.entriesByFactoryId.get(normalizedFactoryId)?.factory;
  }

  public getRequiredByFactoryId(factoryId: StrategyFactoryId): StrategyFactory {
    const factory = this.getByFactoryId(factoryId);

    if (factory === undefined) {
      throw new StrategyRegistryError(
        "FACTORY_NOT_FOUND",
        `Strategy factory '${factoryId}' is not registered.`,
        { factoryId },
      );
    }

    return factory;
  }

  public list(): readonly StrategyFactory[] {
    const entries = this.listInternalEntries();
    return Object.freeze(entries.map((entry) => entry.factory));
  }

  public listVersions(strategyId: StrategyId): readonly StrategyFactory[] {
    const normalizedStrategyId = normalizeRequiredIdentifier(
      strategyId,
      "strategyId",
    );
    const versions = this.entriesByStrategy.get(normalizedStrategyId);

    if (versions === undefined) {
      return Object.freeze([]);
    }

    return Object.freeze(
      [...versions.values()]
        .sort((left, right) =>
          compareStrategyVersions(
            right.factory.manifest.version,
            left.factory.manifest.version,
          ),
        )
        .map((entry) => entry.factory),
    );
  }

  public listManifests(): readonly StrategyManifest[] {
    return Object.freeze(
      this.listInternalEntries().map((entry) =>
        cloneManifest(entry.factory.manifest),
      ),
    );
  }

  public countStrategies(): number {
    return this.entriesByStrategy.size;
  }

  public countVersions(): number {
    return this.entriesByFactoryId.size;
  }

  public clear(): void {
    this.entriesByStrategy.clear();
    this.entriesByFactoryId.clear();
  }

  public snapshot(
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): StrategyRegistrySnapshot {
    this.assertTimestamp(timestamp);

    return deepFreeze({
      createdAt: timestamp,
      totalStrategies: this.countStrategies(),
      totalVersions: this.countVersions(),
      entries: this.listInternalEntries().map(createSnapshotEntry),
    });
  }

  private listInternalEntries(): readonly InternalRegistryEntry[] {
    const entries = [...this.entriesByFactoryId.values()];

    if (this.options.preserveRegistrationOrder) {
      return entries.sort(
        (left, right) =>
          left.registrationSequence - right.registrationSequence,
      );
    }

    return entries.sort((left, right) => {
      const strategyComparison = compareLexicographically(
        left.factory.manifest.strategyId,
        right.factory.manifest.strategyId,
      );

      if (strategyComparison !== 0) {
        return strategyComparison;
      }

      return compareStrategyVersions(
        right.factory.manifest.version,
        left.factory.manifest.version,
      );
    });
  }

  private validateManifest(
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    if (!this.options.validateManifests) {
      return;
    }

    const report =
      this.validator?.validateManifest(manifest, timestamp) ??
      this.basicManifestValidation(manifest, timestamp);

    if (!report.valid) {
      throw new StrategyRegistryError(
        "INVALID_MANIFEST",
        `Strategy manifest '${manifest.strategyId}' version '${manifest.version}' is invalid.`,
        {
          strategyId: manifest.strategyId,
          strategyVersion: manifest.version,
          factoryId: undefined,
          validationReport: report,
        },
      );
    }
  }

  private basicManifestValidation(
    manifest: StrategyManifest,
    timestamp: UnixTimestampMilliseconds,
  ): StrategyValidationReport {
    const issues: StrategyValidationIssue[] = [];

    const requiredFields: readonly [string, unknown][] = [
      ["strategyId", manifest.strategyId],
      ["name", manifest.name],
      ["description", manifest.description],
      ["version", manifest.version],
      ["author.name", manifest.author?.name],
    ];

    for (const [field, value] of requiredFields) {
      if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(
          deepFreeze({
            severity: "ERROR",
            code: "REQUIRED_FIELD_MISSING",
            field,
            message: `${field} must be a non-empty string.`,
            metadata: cloneMetadata(EMPTY_STRATEGY_METADATA),
          }),
        );
      }
    }

    if (!Number.isFinite(manifest.createdAt) || manifest.createdAt < 0) {
      issues.push(
        deepFreeze({
          severity: "ERROR",
          code: "INVALID_CREATED_AT",
          field: "createdAt",
          message: "createdAt must be a finite, non-negative timestamp.",
          metadata: cloneMetadata(EMPTY_STRATEGY_METADATA),
        }),
      );
    }

    return createBasicValidationReport(issues, timestamp);
  }

  private assertFactory(factory: StrategyFactory): void {
    if (factory === null || typeof factory !== "object") {
      throw new StrategyRegistryError(
        "INVALID_ARGUMENT",
        "factory must be an object.",
      );
    }

    if (factory.manifest === null || typeof factory.manifest !== "object") {
      throw new StrategyRegistryError(
        "INVALID_ARGUMENT",
        "factory.manifest must be an object.",
      );
    }

    if (typeof factory.create !== "function") {
      throw new StrategyRegistryError(
        "INVALID_ARGUMENT",
        "factory.create must be a function.",
      );
    }
  }

  private assertTimestamp(timestamp: UnixTimestampMilliseconds): void {
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new StrategyRegistryError(
        "INVALID_ARGUMENT",
        "timestamp must be a finite, non-negative number.",
      );
    }
  }
}

export function createStrategyRegistry(
  dependencies: {
    readonly validator?: StrategyContractValidator;
    readonly clock?: StrategyRegistryClock;
    readonly options?: Partial<StrategyRegistryOptions>;
  } = {},
): DefaultStrategyRegistry {
  return new DefaultStrategyRegistry(dependencies);
}