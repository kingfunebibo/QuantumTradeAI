/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-provider-loader.ts
 *
 * Purpose:
 * Provides deterministic provider registration, ordered loading, duplicate
 * protection, failure isolation, immutable history, and registry integration
 * for strategy-library providers.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  type StrategyLibraryProvider,
  type StrategyLibraryProviderId,
  type StrategyLibraryRegistryPort,
} from "./strategy-library-contracts";

/* ========================================================================== *
 * Contracts
 * ========================================================================== */


export interface StrategyLibraryProviderLoadReport {
  readonly providerId: StrategyLibraryProviderId;
  readonly loadedEntries: number;
  readonly loadedCollections: number;
  readonly loadedReleases: number;
  readonly loadedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryProviderRegistry
  extends StrategyLibraryRegistryPort {
  loadProvider(
    provider: StrategyLibraryProvider,
  ): Promise<StrategyLibraryProviderLoadReport>;
}

export type StrategyLibraryProviderLoaderErrorCode =
  | "INVALID_ARGUMENT"
  | "DUPLICATE_PROVIDER"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_BUSY"
  | "PROVIDER_LOAD_FAILED"
  | "PROVIDER_ALREADY_LOADED";

export class StrategyLibraryProviderLoaderError extends Error {
  public readonly code: StrategyLibraryProviderLoaderErrorCode;
  public readonly providerId?: StrategyLibraryProviderId;
  public readonly cause?: unknown;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryProviderLoaderErrorCode,
    message: string,
    details: {
      readonly providerId?: StrategyLibraryProviderId;
      readonly cause?: unknown;
      readonly metadata?: StrategyMetadata;
    } = {},
  ) {
    super(message);
    this.name = "StrategyLibraryProviderLoaderError";
    this.code = code;
    this.providerId = details.providerId;
    this.cause = details.cause;
    this.metadata = freezeMetadata(details.metadata);
    Object.setPrototypeOf(this, StrategyLibraryProviderLoaderError.prototype);
  }
}

export interface StrategyLibraryProviderLoaderClock {
  now(): UnixTimestampMilliseconds;
}

export type StrategyLibraryProviderLoadStatus =
  | "REGISTERED"
  | "LOADING"
  | "LOADED"
  | "FAILED"
  | "UNREGISTERED";

export interface StrategyLibraryProviderLoaderOptions {
  readonly allowProviderReplacement: boolean;
  readonly rejectReloadOfLoadedProvider: boolean;
  readonly continueAfterLoadFailure: boolean;
  readonly maximumHistoryEntries: number;
  readonly metadata: StrategyMetadata;
}

export const DEFAULT_STRATEGY_LIBRARY_PROVIDER_LOADER_OPTIONS:
  StrategyLibraryProviderLoaderOptions = Object.freeze({
    allowProviderReplacement: false,
    rejectReloadOfLoadedProvider: true,
    continueAfterLoadFailure: false,
    maximumHistoryEntries: 1_000,
    metadata: EMPTY_STRATEGY_METADATA,
  });

export interface StrategyLibraryProviderSnapshot {
  readonly providerId: StrategyLibraryProviderId;
  readonly status: StrategyLibraryProviderLoadStatus;
  readonly registrationSequence: number;
  readonly registeredAt: UnixTimestampMilliseconds;
  readonly lastOperationAt?: UnixTimestampMilliseconds;
  readonly loadedAt?: UnixTimestampMilliseconds;
  readonly loadCount: number;
  readonly lastReport?: StrategyLibraryProviderLoadReport;
  readonly lastError?: Readonly<{
    readonly code: StrategyLibraryProviderLoaderErrorCode;
    readonly message: string;
  }>;
}

export interface StrategyLibraryProviderHistoryEntry {
  readonly sequence: number;
  readonly providerId: StrategyLibraryProviderId;
  readonly previousStatus?: StrategyLibraryProviderLoadStatus;
  readonly status: StrategyLibraryProviderLoadStatus;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly errorCode?: StrategyLibraryProviderLoaderErrorCode;
  readonly message?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryProviderLoaderSnapshot {
  readonly capturedAt: UnixTimestampMilliseconds;
  readonly totalProviders: number;
  readonly loadedProviders: number;
  readonly failedProviders: number;
  readonly providers: readonly StrategyLibraryProviderSnapshot[];
  readonly history: readonly StrategyLibraryProviderHistoryEntry[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryProviderBatchLoadFailure {
  readonly providerId: StrategyLibraryProviderId;
  readonly error: StrategyLibraryProviderLoaderError;
}

export interface StrategyLibraryProviderBatchLoadResult {
  readonly attemptedProviders: number;
  readonly loaded: readonly StrategyLibraryProviderLoadReport[];
  readonly failures: readonly StrategyLibraryProviderBatchLoadFailure[];
}

interface InternalProviderRecord {
  readonly provider: StrategyLibraryProvider;
  readonly providerId: StrategyLibraryProviderId;
  readonly registrationSequence: number;
  readonly registeredAt: UnixTimestampMilliseconds;
  status: StrategyLibraryProviderLoadStatus;
  lastOperationAt?: UnixTimestampMilliseconds;
  loadedAt?: UnixTimestampMilliseconds;
  loadCount: number;
  lastReport?: StrategyLibraryProviderLoadReport;
  lastError?: StrategyLibraryProviderLoaderError;
}

const DEFAULT_CLOCK: StrategyLibraryProviderLoaderClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

/* ========================================================================== *
 * Immutable helpers
 * ========================================================================== */

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Readonly<Record<string, unknown>>,
    )) {
      output[key] = deepClone(nestedValue);
    }

    return output as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(
      value as Readonly<Record<string, unknown>>,
    )) {
      deepFreeze(nestedValue);
    }

    Object.freeze(value);
  }

  return value;
}

function freezeMetadata(metadata?: StrategyMetadata): StrategyMetadata {
  return metadata === undefined
    ? EMPTY_STRATEGY_METADATA
    : deepFreeze(deepClone(metadata));
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

function normalizeIdentifier(value: string, fieldName: string): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryProviderLoaderError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryProviderLoaderError(
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
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new StrategyLibraryProviderLoaderError(
      "INVALID_ARGUMENT",
      `${fieldName} must be a finite, non-negative timestamp.`,
    );
  }
}

function cloneLoadReport(
  report: StrategyLibraryProviderLoadReport,
): StrategyLibraryProviderLoadReport {
  return deepFreeze(deepClone(report));
}

interface RegistryLikeError {
  readonly code: string;
  readonly message: string;
  readonly metadata?: StrategyMetadata;
}

function isRegistryLikeError(error: unknown): error is RegistryLikeError {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const candidate = error as Readonly<Record<string, unknown>>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.metadata === undefined ||
      (candidate.metadata !== null && typeof candidate.metadata === "object"))
  );
}

/* ========================================================================== *
 * Loader implementation
 * ========================================================================== */

export class StrategyLibraryProviderLoader {
  private readonly registry: StrategyLibraryProviderRegistry;
  private readonly clock: StrategyLibraryProviderLoaderClock;
  private readonly options: StrategyLibraryProviderLoaderOptions;
  private readonly providers = new Map<
    StrategyLibraryProviderId,
    InternalProviderRecord
  >();
  private readonly operationLocks = new Set<StrategyLibraryProviderId>();
  private readonly historyEntries: StrategyLibraryProviderHistoryEntry[] = [];
  private registrationSequence = 0;
  private historySequence = 0;

  public constructor(dependencies: {
    readonly registry: StrategyLibraryProviderRegistry;
    readonly clock?: StrategyLibraryProviderLoaderClock;
    readonly options?: Partial<StrategyLibraryProviderLoaderOptions>;
    readonly providers?: readonly StrategyLibraryProvider[];
  }) {
    if (
      dependencies === undefined ||
      dependencies.registry === null ||
      typeof dependencies.registry !== "object" ||
      typeof dependencies.registry.loadProvider !== "function"
    ) {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "A StrategyLibraryRegistry instance is required.",
      );
    }

    this.registry = dependencies.registry;
    this.clock = dependencies.clock ?? DEFAULT_CLOCK;
    this.options = deepFreeze({
      ...DEFAULT_STRATEGY_LIBRARY_PROVIDER_LOADER_OPTIONS,
      ...dependencies.options,
      metadata: freezeMetadata(
        dependencies.options?.metadata ??
          DEFAULT_STRATEGY_LIBRARY_PROVIDER_LOADER_OPTIONS.metadata,
      ),
    });

    if (
      !Number.isSafeInteger(this.options.maximumHistoryEntries) ||
      this.options.maximumHistoryEntries < 1
    ) {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "maximumHistoryEntries must be a positive safe integer.",
      );
    }

    for (const provider of dependencies.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  public registerProvider(provider: StrategyLibraryProvider): void {
    this.registerProviderAt(provider, this.now());
  }

  public registerProviderAt(
    provider: StrategyLibraryProvider,
    timestamp: UnixTimestampMilliseconds,
  ): void {
    this.assertProvider(provider);
    assertTimestamp(timestamp, "timestamp");

    const providerId = normalizeIdentifier(
      provider.providerId,
      "provider.providerId",
    );
    const existing = this.providers.get(providerId);

    if (existing !== undefined) {
      if (existing.provider === provider) {
        return;
      }

      if (!this.options.allowProviderReplacement) {
        throw new StrategyLibraryProviderLoaderError(
          "DUPLICATE_PROVIDER",
          `Strategy library provider '${providerId}' is already registered.`,
          { providerId },
        );
      }

      if (this.operationLocks.has(providerId)) {
        throw new StrategyLibraryProviderLoaderError(
          "PROVIDER_BUSY",
          `Strategy library provider '${providerId}' is currently busy.`,
          { providerId },
        );
      }
    }

    this.registrationSequence += 1;

    const record: InternalProviderRecord = {
      provider,
      providerId,
      registrationSequence: this.registrationSequence,
      registeredAt: timestamp,
      status: "REGISTERED",
      loadCount: 0,
    };

    this.providers.set(providerId, record);
    this.recordTransition(record, existing?.status, "REGISTERED", timestamp);
  }

  public unregisterProvider(providerId: StrategyLibraryProviderId): boolean {
    const normalizedProviderId = normalizeIdentifier(providerId, "providerId");

    if (this.operationLocks.has(normalizedProviderId)) {
      throw new StrategyLibraryProviderLoaderError(
        "PROVIDER_BUSY",
        `Strategy library provider '${normalizedProviderId}' is currently busy.`,
        { providerId: normalizedProviderId },
      );
    }

    const record = this.providers.get(normalizedProviderId);

    if (record === undefined) {
      return false;
    }

    const timestamp = this.now();
    this.providers.delete(normalizedProviderId);
    this.recordTransition(
      record,
      record.status,
      "UNREGISTERED",
      timestamp,
    );
    return true;
  }

  public hasProvider(providerId: StrategyLibraryProviderId): boolean {
    return this.providers.has(normalizeIdentifier(providerId, "providerId"));
  }

  public getProvider(
    providerId: StrategyLibraryProviderId,
  ): StrategyLibraryProvider | undefined {
    return this.providers.get(normalizeIdentifier(providerId, "providerId"))
      ?.provider;
  }

  public listProviders(): readonly StrategyLibraryProvider[] {
    return Object.freeze(
      this.listInternalRecords().map((record) => record.provider),
    );
  }

  public getProviderSnapshot(
    providerId: StrategyLibraryProviderId,
  ): StrategyLibraryProviderSnapshot | undefined {
    const record = this.providers.get(
      normalizeIdentifier(providerId, "providerId"),
    );

    return record === undefined ? undefined : this.toSnapshot(record);
  }

  public listProviderSnapshots(): readonly StrategyLibraryProviderSnapshot[] {
    return Object.freeze(
      this.listInternalRecords().map((record) => this.toSnapshot(record)),
    );
  }

  public async loadProvider(
    providerId: StrategyLibraryProviderId,
  ): Promise<StrategyLibraryProviderLoadReport> {
    const normalizedProviderId = normalizeIdentifier(providerId, "providerId");
    const record = this.providers.get(normalizedProviderId);

    if (record === undefined) {
      throw new StrategyLibraryProviderLoaderError(
        "PROVIDER_NOT_FOUND",
        `Strategy library provider '${normalizedProviderId}' is not registered.`,
        { providerId: normalizedProviderId },
      );
    }

    return this.withProviderLock(normalizedProviderId, async () => {
      if (
        this.options.rejectReloadOfLoadedProvider &&
        record.status === "LOADED"
      ) {
        throw new StrategyLibraryProviderLoaderError(
          "PROVIDER_ALREADY_LOADED",
          `Strategy library provider '${normalizedProviderId}' is already loaded.`,
          { providerId: normalizedProviderId },
        );
      }

      const startedAt = this.now();
      const previousStatus = record.status;
      record.status = "LOADING";
      record.lastOperationAt = startedAt;
      record.lastError = undefined;
      this.recordTransition(record, previousStatus, "LOADING", startedAt);

      try {
        const report = await this.registry.loadProvider(record.provider);
        const completedAt = this.now();

        record.status = "LOADED";
        record.lastOperationAt = completedAt;
        record.loadedAt = report.loadedAt;
        record.loadCount += 1;
        record.lastReport = cloneLoadReport(report);
        record.lastError = undefined;
        this.recordTransition(record, "LOADING", "LOADED", completedAt);

        return cloneLoadReport(report);
      } catch (error) {
        const completedAt = this.now();
        const normalized = this.normalizeLoadError(normalizedProviderId, error);

        record.status = "FAILED";
        record.lastOperationAt = completedAt;
        record.lastError = normalized;
        this.recordTransition(
          record,
          "LOADING",
          "FAILED",
          completedAt,
          normalized,
        );

        throw normalized;
      }
    });
  }

  public async loadAll(): Promise<StrategyLibraryProviderBatchLoadResult> {
    const loaded: StrategyLibraryProviderLoadReport[] = [];
    const failures: StrategyLibraryProviderBatchLoadFailure[] = [];
    const records = this.listInternalRecords();

    for (const record of records) {
      try {
        loaded.push(await this.loadProvider(record.providerId));
      } catch (error) {
        const normalized =
          error instanceof StrategyLibraryProviderLoaderError
            ? error
            : this.normalizeLoadError(record.providerId, error);

        failures.push(
          deepFreeze({
            providerId: record.providerId,
            error: normalized,
          }),
        );

        if (!this.options.continueAfterLoadFailure) {
          break;
        }
      }
    }

    return deepFreeze({
      attemptedProviders: loaded.length + failures.length,
      loaded,
      failures,
    });
  }

  public clearHistory(): void {
    this.historyEntries.length = 0;
  }

  public snapshot(
    timestamp: UnixTimestampMilliseconds = this.now(),
  ): StrategyLibraryProviderLoaderSnapshot {
    assertTimestamp(timestamp, "timestamp");

    const providers = this.listProviderSnapshots();

    return deepFreeze({
      capturedAt: timestamp,
      totalProviders: providers.length,
      loadedProviders: providers.filter(
        (provider) => provider.status === "LOADED",
      ).length,
      failedProviders: providers.filter(
        (provider) => provider.status === "FAILED",
      ).length,
      providers,
      history: this.historyEntries.map((entry) => deepFreeze(deepClone(entry))),
      metadata: this.options.metadata,
    });
  }

  private listInternalRecords(): readonly InternalProviderRecord[] {
    return [...this.providers.values()].sort(
      (left, right) =>
        left.registrationSequence - right.registrationSequence ||
        compareText(left.providerId, right.providerId),
    );
  }

  private toSnapshot(
    record: InternalProviderRecord,
  ): StrategyLibraryProviderSnapshot {
    const lastError =
      record.lastError === undefined
        ? undefined
        : deepFreeze({
            code: record.lastError.code,
            message: record.lastError.message,
          });

    return deepFreeze({
      providerId: record.providerId,
      status: record.status,
      registrationSequence: record.registrationSequence,
      registeredAt: record.registeredAt,
      lastOperationAt: record.lastOperationAt,
      loadedAt: record.loadedAt,
      loadCount: record.loadCount,
      lastReport:
        record.lastReport === undefined
          ? undefined
          : cloneLoadReport(record.lastReport),
      lastError,
    });
  }

  private recordTransition(
    record: InternalProviderRecord,
    previousStatus: StrategyLibraryProviderLoadStatus | undefined,
    status: StrategyLibraryProviderLoadStatus,
    timestamp: UnixTimestampMilliseconds,
    error?: StrategyLibraryProviderLoaderError,
  ): void {
    this.historySequence += 1;

    this.historyEntries.push(
      deepFreeze({
        sequence: this.historySequence,
        providerId: record.providerId,
        previousStatus,
        status,
        timestamp,
        errorCode: error?.code,
        message: error?.message,
        metadata: this.options.metadata,
      }),
    );

    const excess =
      this.historyEntries.length - this.options.maximumHistoryEntries;

    if (excess > 0) {
      this.historyEntries.splice(0, excess);
    }
  }

  private normalizeLoadError(
    providerId: StrategyLibraryProviderId,
    error: unknown,
  ): StrategyLibraryProviderLoaderError {
    if (error instanceof StrategyLibraryProviderLoaderError) {
      return error;
    }

    if (isRegistryLikeError(error)) {
      return new StrategyLibraryProviderLoaderError(
        error.code === "PROVIDER_ALREADY_LOADED"
          ? "PROVIDER_ALREADY_LOADED"
          : "PROVIDER_LOAD_FAILED",
        error.message,
        {
          providerId,
          cause: error,
          metadata: error.metadata,
        },
      );
    }

    return new StrategyLibraryProviderLoaderError(
      "PROVIDER_LOAD_FAILED",
      `Failed to load strategy library provider '${providerId}'.`,
      { providerId, cause: error },
    );
  }

  private assertProvider(provider: StrategyLibraryProvider): void {
    if (provider === null || typeof provider !== "object") {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "provider must be an object.",
      );
    }

    normalizeIdentifier(provider.providerId, "provider.providerId");

    if (typeof provider.listEntries !== "function") {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "provider.listEntries must be a function.",
        { providerId: provider.providerId },
      );
    }

    if (
      provider.listCollections !== undefined &&
      typeof provider.listCollections !== "function"
    ) {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "provider.listCollections must be a function when provided.",
        { providerId: provider.providerId },
      );
    }

    if (
      provider.listReleases !== undefined &&
      typeof provider.listReleases !== "function"
    ) {
      throw new StrategyLibraryProviderLoaderError(
        "INVALID_ARGUMENT",
        "provider.listReleases must be a function when provided.",
        { providerId: provider.providerId },
      );
    }
  }

  private now(): UnixTimestampMilliseconds {
    const timestamp = this.clock.now();
    assertTimestamp(timestamp, "clock.now()");
    return timestamp;
  }

  private async withProviderLock<T>(
    providerId: StrategyLibraryProviderId,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.operationLocks.has(providerId)) {
      throw new StrategyLibraryProviderLoaderError(
        "PROVIDER_BUSY",
        `Strategy library provider '${providerId}' is currently busy.`,
        { providerId },
      );
    }

    this.operationLocks.add(providerId);

    try {
      return await operation();
    } finally {
      this.operationLocks.delete(providerId);
    }
  }
}

/* ========================================================================== *
 * Factory
 * ========================================================================== */

export function createStrategyLibraryProviderLoader(dependencies: {
  readonly registry: StrategyLibraryProviderRegistry;
  readonly clock?: StrategyLibraryProviderLoaderClock;
  readonly options?: Partial<StrategyLibraryProviderLoaderOptions>;
  readonly providers?: readonly StrategyLibraryProvider[];
}): StrategyLibraryProviderLoader {
  return new StrategyLibraryProviderLoader(dependencies);
}

export default StrategyLibraryProviderLoader;