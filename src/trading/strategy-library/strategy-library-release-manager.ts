/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-release-manager.ts
 *
 * Purpose:
 * Provides deterministic and immutable lifecycle management for strategy
 * library releases, including creation, modification, publication,
 * withdrawal, supersedence, entry resolution, validation, and registry
 * synchronization.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  EMPTY_STRATEGY_LIBRARY_RELEASES,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryRelease,
  type StrategyLibraryReleaseEntry,
  type StrategyLibraryReleaseId,
  type StrategyLibraryReleaseStatus,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

import {
  StrategyLibraryValidator,
} from "./strategy-library-validator";

/* ============================================================================
 * Error contracts
 * ============================================================================
 */

export type StrategyLibraryReleaseManagerErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_RELEASE"
  | "INVALID_TRANSITION"
  | "RELEASE_NOT_FOUND"
  | "RELEASE_ALREADY_EXISTS"
  | "RELEASE_VERSION_ALREADY_EXISTS"
  | "ENTRY_NOT_FOUND"
  | "ENTRY_ID_MISMATCH"
  | "DUPLICATE_RELEASE_ENTRY"
  | "PUBLISHED_RELEASE_REQUIRED"
  | "SUPERSEDING_RELEASE_REQUIRED"
  | "REGISTRY_OPERATION_FAILED";

export interface StrategyLibraryReleaseManagerErrorDetails {
  readonly releaseId?: StrategyLibraryReleaseId;
  readonly entryId?: StrategyLibraryEntryId;
  readonly validationReport?: StrategyLibraryValidationReport;
  readonly cause?: unknown;
  readonly metadata?: StrategyMetadata;
}

export class StrategyLibraryReleaseManagerError extends Error {
  public readonly code: StrategyLibraryReleaseManagerErrorCode;

  public readonly releaseId?: StrategyLibraryReleaseId;

  public readonly entryId?: StrategyLibraryEntryId;

  public readonly validationReport?: StrategyLibraryValidationReport;

  public readonly cause?: unknown;

  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryReleaseManagerErrorCode,
    message: string,
    details: StrategyLibraryReleaseManagerErrorDetails = {},
  ) {
    super(message);

    this.name = "StrategyLibraryReleaseManagerError";
    this.code = code;
    this.releaseId = details.releaseId;
    this.entryId = details.entryId;
    this.validationReport = details.validationReport;
    this.cause = details.cause;
    this.metadata = immutableCopy(
      details.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    Object.setPrototypeOf(
      this,
      StrategyLibraryReleaseManagerError.prototype,
    );

    Object.freeze(this);
  }
}

/* ============================================================================
 * Registry and clock contracts
 * ============================================================================
 */

export interface StrategyLibraryReleaseRegistry
  extends StrategyLibraryRegistryPort {
  registerRelease(release: StrategyLibraryRelease): void;

  unregisterRelease(
    releaseId: StrategyLibraryReleaseId,
  ): boolean;

  getRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined;

  listReleases(): readonly StrategyLibraryRelease[];
}

export interface StrategyLibraryReleaseClock {
  now(): UnixTimestampMilliseconds;
}

/* ============================================================================
 * Manager input and output contracts
 * ============================================================================
 */

export interface StrategyLibraryReleaseManagerOptions {
  readonly registry: StrategyLibraryReleaseRegistry;

  readonly validator?: StrategyLibraryValidatorPort;

  readonly clock?:
    | StrategyLibraryReleaseClock
    | (() => UnixTimestampMilliseconds);

  readonly allowReleaseReplacement?: boolean;

  readonly requireRegisteredEntries?: boolean;

  readonly rejectDuplicateVersions?: boolean;

  readonly metadata?: StrategyMetadata;
}

export interface StrategyLibraryReleaseEntryInput {
  readonly entryId: StrategyLibraryEntryId;

  readonly checksum?: string;

  readonly notes?: string;
}

export interface StrategyLibraryReleaseCreateInput {
  readonly releaseId: StrategyLibraryReleaseId;

  readonly version: string;

  readonly status?: "PLANNED" | "CANDIDATE";

  readonly entries: readonly StrategyLibraryReleaseEntryInput[];

  readonly createdAt?: UnixTimestampMilliseconds;

  readonly metadata?: StrategyMetadata;
}

export interface StrategyLibraryReleaseUpdateInput {
  readonly version?: string;

  readonly entries?: readonly StrategyLibraryReleaseEntryInput[];

  readonly metadata?: StrategyMetadata;
}

export interface StrategyLibraryReleaseLifecycleReport {
  readonly release: StrategyLibraryRelease;

  readonly previousStatus?: StrategyLibraryReleaseStatus;

  readonly currentStatus: StrategyLibraryReleaseStatus;

  readonly changed: boolean;

  readonly processedAt: UnixTimestampMilliseconds;

  readonly metadata: StrategyMetadata;
}

export interface StrategyLibraryReleaseSnapshot {
  readonly capturedAt: UnixTimestampMilliseconds;

  readonly releases: readonly StrategyLibraryRelease[];

  readonly metadata: StrategyMetadata;
}

/* ============================================================================
 * Lifecycle policy
 * ============================================================================
 */

const TERMINAL_RELEASE_STATUSES:
  ReadonlySet<StrategyLibraryReleaseStatus> =
  new Set<StrategyLibraryReleaseStatus>([
    "WITHDRAWN",
    "SUPERSEDED",
  ]);

const ALLOWED_RELEASE_TRANSITIONS: Readonly<
  Record<
    StrategyLibraryReleaseStatus,
    ReadonlySet<StrategyLibraryReleaseStatus>
  >
> = Object.freeze({
  PLANNED: new Set<StrategyLibraryReleaseStatus>([
    "CANDIDATE",
    "WITHDRAWN",
  ]),

  CANDIDATE: new Set<StrategyLibraryReleaseStatus>([
    "PLANNED",
    "PUBLISHED",
    "WITHDRAWN",
  ]),

  PUBLISHED: new Set<StrategyLibraryReleaseStatus>([
    "WITHDRAWN",
    "SUPERSEDED",
  ]),

  WITHDRAWN: new Set<StrategyLibraryReleaseStatus>(),

  SUPERSEDED: new Set<StrategyLibraryReleaseStatus>(),
});

const DEFAULT_RELEASE_CLOCK:
  StrategyLibraryReleaseClock =
  Object.freeze({
    now: (): UnixTimestampMilliseconds =>
      Date.now() as UnixTimestampMilliseconds,
  });

/* ============================================================================
 * Release manager
 * ============================================================================
 */

export class StrategyLibraryReleaseManager {
  private readonly registry: StrategyLibraryReleaseRegistry;

  private readonly validator: StrategyLibraryValidatorPort;

  private readonly clock: StrategyLibraryReleaseClock;

  private readonly allowReleaseReplacement: boolean;

  private readonly requireRegisteredEntries: boolean;

  private readonly rejectDuplicateVersions: boolean;

  private readonly metadata: StrategyMetadata;

  public constructor(
    options: StrategyLibraryReleaseManagerOptions,
  ) {
    if (!isObject(options)) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "options must be an object.",
      );
    }

    if (!isReleaseRegistry(options.registry)) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "options.registry must implement strategy library release operations.",
      );
    }

    this.registry = options.registry;

    this.validator =
      options.validator ??
      new StrategyLibraryValidator();

    this.clock = resolveClock(options.clock);

    this.allowReleaseReplacement =
      options.allowReleaseReplacement ?? false;

    this.requireRegisteredEntries =
      options.requireRegisteredEntries ?? true;

    this.rejectDuplicateVersions =
      options.rejectDuplicateVersions ?? true;

    this.metadata = immutableCopy(
      options.metadata ?? EMPTY_STRATEGY_METADATA,
    );
  }

  public create(
    input: StrategyLibraryReleaseCreateInput,
  ): StrategyLibraryRelease {
    if (!isObject(input)) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "input must be an object.",
        { metadata: this.metadata },
      );
    }

    const releaseId = normalizeIdentifier(
      input.releaseId,
      "input.releaseId",
    );

    const version = normalizeVersion(input.version);

    const createdAt =
      input.createdAt ?? this.now();

    assertTimestamp(
      createdAt,
      "input.createdAt",
    );

    const existing =
      this.registry.getRelease(releaseId);

    if (
      existing !== undefined &&
      !this.allowReleaseReplacement
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "RELEASE_ALREADY_EXISTS",
        `Strategy library release '${releaseId}' already exists.`,
        {
          releaseId,
          metadata: this.metadata,
        },
      );
    }

    this.assertVersionAvailable(
      version,
      releaseId,
    );

    const release =
      deepFreeze<StrategyLibraryRelease>({
        releaseId,
        version,
        status: input.status ?? "PLANNED",
        entries: this.buildEntries(input.entries),
        createdAt,
        metadata: immutableCopy(
          input.metadata ?? this.metadata,
        ),
      });

    this.assertValid(release);

    if (existing === undefined) {
      this.register(release);
    } else {
      this.replace(releaseId, release);
    }

    return release;
  }

 public update(
  releaseId: StrategyLibraryReleaseId,
  update: StrategyLibraryReleaseUpdateInput,
): StrategyLibraryRelease {
  if (
    typeof update !== "object" ||
    update === null ||
    Array.isArray(update)
  ) {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      "update must be an object.",
      { metadata: this.metadata },
    );
  }

  const current =
    this.requireMutableRelease(releaseId);

  const version =
    update.version === undefined
      ? current.version
      : normalizeVersion(update.version);

  this.assertVersionAvailable(
    version,
    current.releaseId,
  );

  const updateEntries =
    update.entries;

  const entries:
    readonly StrategyLibraryReleaseEntry[] =
    updateEntries === undefined
      ? current.entries
      : this.buildEntries(updateEntries);

  const updateMetadata =
    update.metadata;

  const metadata: StrategyMetadata =
    updateMetadata === undefined
      ? current.metadata
      : immutableCopy(updateMetadata);

  const updated =
    deepFreeze<StrategyLibraryRelease>({
      ...current,
      version,
      entries,
      metadata,
    });

  this.assertValid(updated);

  this.replace(
    current.releaseId,
    updated,
  );

  return updated;
}

  public addEntry(
    releaseId: StrategyLibraryReleaseId,
    input: StrategyLibraryReleaseEntryInput,
  ): StrategyLibraryRelease {
    const current =
      this.requireMutableRelease(releaseId);

    const releaseEntry =
      this.buildEntry(input);

    const duplicate =
      current.entries.some(
        (entry) =>
          releaseEntryIdentity(entry) ===
          releaseEntryIdentity(releaseEntry),
      );

    if (duplicate) {
      throw new StrategyLibraryReleaseManagerError(
        "DUPLICATE_RELEASE_ENTRY",
        `Release '${current.releaseId}' already contains entry '${releaseEntry.entryId}'.`,
        {
          releaseId: current.releaseId,
          entryId: releaseEntry.entryId,
          metadata: this.metadata,
        },
      );
    }

    return this.replaceEntries(
      current,
      [
        ...current.entries,
        releaseEntry,
      ],
    );
  }

  public removeEntry(
    releaseId: StrategyLibraryReleaseId,
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryRelease {
    const current =
      this.requireMutableRelease(releaseId);

    const normalizedEntryId =
      normalizeIdentifier(
        entryId,
        "entryId",
      );

    const entries =
      current.entries.filter(
        (entry) =>
          entry.entryId !== normalizedEntryId,
      );

    if (
      entries.length ===
      current.entries.length
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "ENTRY_NOT_FOUND",
        `Entry '${normalizedEntryId}' was not found in release '${current.releaseId}'.`,
        {
          releaseId: current.releaseId,
          entryId: normalizedEntryId,
          metadata: this.metadata,
        },
      );
    }

    return this.replaceEntries(
      current,
      entries,
    );
  }

  public promoteToCandidate(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryReleaseLifecycleReport {
    return this.transition(
      releaseId,
      "CANDIDATE",
    );
  }

  public revertToPlanned(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryReleaseLifecycleReport {
    return this.transition(
      releaseId,
      "PLANNED",
    );
  }

  public publish(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryReleaseLifecycleReport {
    const release =
      this.requireRelease(releaseId);

    if (release.entries.length === 0) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_RELEASE",
        `Release '${release.releaseId}' cannot be published without entries.`,
        {
          releaseId: release.releaseId,
          metadata: this.metadata,
        },
      );
    }

    this.assertEntriesResolvable(
      release.entries,
    );

    return this.transition(
      release.releaseId,
      "PUBLISHED",
    );
  }

  public withdraw(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryReleaseLifecycleReport {
    return this.transition(
      releaseId,
      "WITHDRAWN",
    );
  }

  public supersede(
    releaseId: StrategyLibraryReleaseId,
    supersedingReleaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryReleaseLifecycleReport {
    const release =
      this.requireRelease(releaseId);

    const supersedingRelease =
      this.requireRelease(
        supersedingReleaseId,
      );

    if (
      release.status !== "PUBLISHED"
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "PUBLISHED_RELEASE_REQUIRED",
        `Release '${release.releaseId}' must be published before it can be superseded.`,
        {
          releaseId: release.releaseId,
          metadata: this.metadata,
        },
      );
    }

    if (
      supersedingRelease.status !==
      "PUBLISHED"
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "SUPERSEDING_RELEASE_REQUIRED",
        `Superseding release '${supersedingRelease.releaseId}' must be published.`,
        {
          releaseId:
            supersedingRelease.releaseId,
          metadata: this.metadata,
        },
      );
    }

    if (
      release.releaseId ===
      supersedingRelease.releaseId
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "A release cannot supersede itself.",
        {
          releaseId: release.releaseId,
          metadata: this.metadata,
        },
      );
    }

    return this.transition(
      release.releaseId,
      "SUPERSEDED",
    );
  }

  public transition(
    releaseId: StrategyLibraryReleaseId,
    nextStatus: StrategyLibraryReleaseStatus,
  ): StrategyLibraryReleaseLifecycleReport {
    const current =
      this.requireRelease(releaseId);

    if (current.status === nextStatus) {
      return deepFreeze({
        release: current,
        previousStatus: current.status,
        currentStatus: current.status,
        changed: false,
        processedAt: this.now(),
        metadata: this.metadata,
      });
    }

    const allowedTransitions =
      ALLOWED_RELEASE_TRANSITIONS[
        current.status
      ];

    if (
      !allowedTransitions.has(nextStatus)
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_TRANSITION",
        `Release '${current.releaseId}' cannot transition from '${current.status}' to '${nextStatus}'.`,
        {
          releaseId: current.releaseId,
          metadata: this.metadata,
        },
      );
    }

    const timestamp = this.now();

    const next =
      deepFreeze<StrategyLibraryRelease>({
        ...current,

        status: nextStatus,

        ...(nextStatus === "PUBLISHED"
          ? {
              publishedAt: timestamp,
            }
          : {}),

        ...(nextStatus === "SUPERSEDED"
          ? {
              supersededAt: timestamp,
            }
          : {}),
      });

    this.assertValid(next);

    this.replace(
      current.releaseId,
      next,
    );

    return deepFreeze({
      release: next,
      previousStatus: current.status,
      currentStatus: next.status,
      changed: true,
      processedAt: timestamp,
      metadata: this.metadata,
    });
  }

  public get(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease | undefined {
    return this.registry.getRelease(
      normalizeIdentifier(
        releaseId,
        "releaseId",
      ),
    );
  }

  public require(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease {
    return this.requireRelease(releaseId);
  }

  public list():
    readonly StrategyLibraryRelease[] {
    const releases =
      this.registry.listReleases();

    if (releases.length === 0) {
      return EMPTY_STRATEGY_LIBRARY_RELEASES;
    }

    return Object.freeze(
      [...releases].sort(compareReleases),
    );
  }

  public listByStatus(
    status: StrategyLibraryReleaseStatus,
  ): readonly StrategyLibraryRelease[] {
    return Object.freeze(
      this.list().filter(
        (release) =>
          release.status === status,
      ),
    );
  }

  public latestPublished():
    StrategyLibraryRelease | undefined {
    const published =
      this.listByStatus("PUBLISHED");

    if (published.length === 0) {
      return undefined;
    }

    return [...published].sort(
      (
        left,
        right,
      ) => {
        const leftTimestamp =
          left.publishedAt ??
          left.createdAt;

        const rightTimestamp =
          right.publishedAt ??
          right.createdAt;

        if (
          leftTimestamp !==
          rightTimestamp
        ) {
          return (
            rightTimestamp -
            leftTimestamp
          );
        }

        return right.releaseId.localeCompare(
          left.releaseId,
        );
      },
    )[0];
  }

  public delete(
    releaseId: StrategyLibraryReleaseId,
  ): boolean {
    return this.registry.unregisterRelease(
      normalizeIdentifier(
        releaseId,
        "releaseId",
      ),
    );
  }

  public snapshot():
    StrategyLibraryReleaseSnapshot {
    return deepFreeze({
      capturedAt: this.now(),
      releases: this.list(),
      metadata: this.metadata,
    });
  }

  private replaceEntries(
    current: StrategyLibraryRelease,
    entries:
      readonly StrategyLibraryReleaseEntry[],
  ): StrategyLibraryRelease {
    const next =
      deepFreeze<StrategyLibraryRelease>({
        ...current,
        entries: Object.freeze([
          ...entries,
        ]),
      });

    this.assertValid(next);

    this.replace(
      current.releaseId,
      next,
    );

    return next;
  }

  private buildEntries(
    inputs:
      readonly StrategyLibraryReleaseEntryInput[],
  ):
    readonly StrategyLibraryReleaseEntry[] {
    if (!Array.isArray(inputs)) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "release entries must be an array.",
        { metadata: this.metadata },
      );
    }

    const entries =
      inputs.map(
        (input) =>
          this.buildEntry(input),
      );

    const identities =
      new Set<string>();

    for (const entry of entries) {
      const identity =
        releaseEntryIdentity(entry);

      if (identities.has(identity)) {
        throw new StrategyLibraryReleaseManagerError(
          "DUPLICATE_RELEASE_ENTRY",
          `Duplicate release entry '${entry.entryId}'.`,
          {
            entryId: entry.entryId,
            metadata: this.metadata,
          },
        );
      }

      identities.add(identity);
    }

    return Object.freeze(entries);
  }

  private buildEntry(
    input: StrategyLibraryReleaseEntryInput,
  ): StrategyLibraryReleaseEntry {
    if (!isObject(input)) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_ARGUMENT",
        "release entry input must be an object.",
        { metadata: this.metadata },
      );
    }

    const entryId =
      normalizeIdentifier(
        input.entryId,
        "releaseEntry.entryId",
      );

    const libraryEntry =
      this.findEntry(entryId);

    if (libraryEntry === undefined) {
      throw new StrategyLibraryReleaseManagerError(
        "ENTRY_NOT_FOUND",
        `Strategy library entry '${entryId}' was not found.`,
        {
          entryId,
          metadata: this.metadata,
        },
      );
    }

    return deepFreeze({
      entryId:
        libraryEntry.entryId,

      strategyId:
        libraryEntry.strategyId,

      strategyVersion:
        libraryEntry.strategyVersion,

      ...(input.checksum === undefined
        ? {}
        : {
            checksum:
              normalizeOptionalText(
                input.checksum,
                "checksum",
              ),
          }),

      ...(input.notes === undefined
        ? {}
        : {
            notes:
              normalizeOptionalText(
                input.notes,
                "notes",
              ),
          }),
    });
  }

  private findEntry(
    entryId: StrategyLibraryEntryId,
  ): StrategyLibraryEntry | undefined {
    return this.registry
      .list()
      .find(
        (entry) =>
          entry.entryId === entryId,
      );
  }

  private assertEntriesResolvable(
    entries:
      readonly StrategyLibraryReleaseEntry[],
  ): void {
    if (!this.requireRegisteredEntries) {
      return;
    }

    for (
      const releaseEntry of entries
    ) {
      const libraryEntry =
        this.findEntry(
          releaseEntry.entryId,
        );

      if (libraryEntry === undefined) {
        throw new StrategyLibraryReleaseManagerError(
          "ENTRY_NOT_FOUND",
          `Strategy library entry '${releaseEntry.entryId}' was not found.`,
          {
            entryId:
              releaseEntry.entryId,
            metadata: this.metadata,
          },
        );
      }

      if (
        libraryEntry.strategyId !==
          releaseEntry.strategyId ||
        libraryEntry.strategyVersion !==
          releaseEntry.strategyVersion
      ) {
        throw new StrategyLibraryReleaseManagerError(
          "ENTRY_ID_MISMATCH",
          `Release entry '${releaseEntry.entryId}' does not match its registered strategy identity.`,
          {
            entryId:
              releaseEntry.entryId,
            metadata: this.metadata,
          },
        );
      }
    }
  }

  private assertVersionAvailable(
    version: string,
    releaseId: StrategyLibraryReleaseId,
  ): void {
    if (!this.rejectDuplicateVersions) {
      return;
    }

    const duplicate =
      this.registry
        .listReleases()
        .find(
          (release) =>
            release.releaseId !==
              releaseId &&
            release.version === version,
        );

    if (duplicate !== undefined) {
      throw new StrategyLibraryReleaseManagerError(
        "RELEASE_VERSION_ALREADY_EXISTS",
        `Release version '${version}' is already used by release '${duplicate.releaseId}'.`,
        {
          releaseId:
            duplicate.releaseId,
          metadata: this.metadata,
        },
      );
    }
  }

  private assertValid(
    release: StrategyLibraryRelease,
  ): void {
    this.assertEntriesResolvable(
      release.entries,
    );

    const report =
      this.validator.validateRelease(
        release,
      );

    if (!report.valid) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_RELEASE",
        `Strategy library release '${release.releaseId}' is invalid.`,
        {
          releaseId:
            release.releaseId,
          validationReport: report,
          metadata: this.metadata,
        },
      );
    }
  }

  private register(
    release: StrategyLibraryRelease,
  ): void {
    try {
      this.registry.registerRelease(
        release,
      );
    } catch (cause) {
      throw new StrategyLibraryReleaseManagerError(
        "REGISTRY_OPERATION_FAILED",
        `Failed to register strategy library release '${release.releaseId}'.`,
        {
          releaseId:
            release.releaseId,
          cause,
          metadata: this.metadata,
        },
      );
    }
  }

  private replace(
    releaseId: StrategyLibraryReleaseId,
    release: StrategyLibraryRelease,
  ): void {
    const previous =
      this.registry.getRelease(
        releaseId,
      );

    try {
      if (previous !== undefined) {
        this.registry.unregisterRelease(
          releaseId,
        );
      }

      this.registry.registerRelease(
        release,
      );
    } catch (cause) {
      if (previous !== undefined) {
        try {
          this.registry.unregisterRelease(
            releaseId,
          );

          this.registry.registerRelease(
            previous,
          );
        } catch {
          // Preserve the original registry error.
        }
      }

      throw new StrategyLibraryReleaseManagerError(
        "REGISTRY_OPERATION_FAILED",
        `Failed to replace strategy library release '${releaseId}'.`,
        {
          releaseId,
          cause,
          metadata: this.metadata,
        },
      );
    }
  }

  private requireMutableRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease {
    const release =
      this.requireRelease(releaseId);

    if (
      release.status === "PUBLISHED" ||
      TERMINAL_RELEASE_STATUSES.has(
        release.status,
      )
    ) {
      throw new StrategyLibraryReleaseManagerError(
        "INVALID_TRANSITION",
        `Release '${release.releaseId}' is immutable in status '${release.status}'.`,
        {
          releaseId:
            release.releaseId,
          metadata: this.metadata,
        },
      );
    }

    return release;
  }

  private requireRelease(
    releaseId: StrategyLibraryReleaseId,
  ): StrategyLibraryRelease {
    const normalizedReleaseId =
      normalizeIdentifier(
        releaseId,
        "releaseId",
      );

    const release =
      this.registry.getRelease(
        normalizedReleaseId,
      );

    if (release === undefined) {
      throw new StrategyLibraryReleaseManagerError(
        "RELEASE_NOT_FOUND",
        `Strategy library release '${normalizedReleaseId}' was not found.`,
        {
          releaseId:
            normalizedReleaseId,
          metadata: this.metadata,
        },
      );
    }

    return release;
  }

  private now():
    UnixTimestampMilliseconds {
    const timestamp =
      this.clock.now();

    assertTimestamp(
      timestamp,
      "clock.now()",
    );

    return timestamp;
  }
}

/* ============================================================================
 * Factory
 * ============================================================================
 */

export function createStrategyLibraryReleaseManager(
  options: StrategyLibraryReleaseManagerOptions,
): StrategyLibraryReleaseManager {
  return new StrategyLibraryReleaseManager(
    options,
  );
}

/* ============================================================================
 * Internal helpers
 * ============================================================================
 */

function isReleaseRegistry(
  value: unknown,
): value is StrategyLibraryReleaseRegistry {
  return (
    isObject(value) &&
    typeof value.register === "function" &&
    typeof value.registerMany === "function" &&
    typeof value.unregister === "function" &&
    typeof value.has === "function" &&
    typeof value.get === "function" &&
    typeof value.list === "function" &&
    typeof value.query === "function" &&
    typeof value.snapshot === "function" &&
    typeof value.registerRelease === "function" &&
    typeof value.unregisterRelease === "function" &&
    typeof value.getRelease === "function" &&
    typeof value.listReleases === "function"
  );
}

function resolveClock(
  clock:
    | StrategyLibraryReleaseClock
    | (() => UnixTimestampMilliseconds)
    | undefined,
): StrategyLibraryReleaseClock {
  if (clock === undefined) {
    return DEFAULT_RELEASE_CLOCK;
  }

  if (typeof clock === "function") {
    return Object.freeze({
      now: clock,
    });
  }

  if (
    isObject(clock) &&
    typeof clock.now === "function"
  ) {
    return clock;
  }

  throw new StrategyLibraryReleaseManagerError(
    "INVALID_ARGUMENT",
    "clock must be a function or an object exposing now().",
  );
}

function normalizeIdentifier(
  value: unknown,
  path: string,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `${path} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `${path} must not be empty.`,
    );
  }

  return normalized;
}

function normalizeVersion(
  value: unknown,
): string {
  const normalized =
    normalizeIdentifier(
      value,
      "version",
    );

  if (
    !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(
      normalized,
    )
  ) {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `Release version '${normalized}' contains unsupported characters.`,
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  path: string,
): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `${path} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `${path} must not be empty when provided.`,
    );
  }

  return normalized;
}

function assertTimestamp(
  value: unknown,
  path: string,
): asserts value is UnixTimestampMilliseconds {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new StrategyLibraryReleaseManagerError(
      "INVALID_ARGUMENT",
      `${path} must be a non-negative safe integer timestamp.`,
    );
  }
}

function releaseEntryIdentity(
  entry: StrategyLibraryReleaseEntry,
): string {
  return [
    entry.entryId,
    entry.strategyId,
    entry.strategyVersion,
  ].join("\u0000");
}

function compareReleases(
  left: StrategyLibraryRelease,
  right: StrategyLibraryRelease,
): number {
  if (
    left.createdAt !== right.createdAt
  ) {
    return (
      left.createdAt -
      right.createdAt
    );
  }

  const versionOrder =
    left.version.localeCompare(
      right.version,
    );

  if (versionOrder !== 0) {
    return versionOrder;
  }

  return left.releaseId.localeCompare(
    right.releaseId,
  );
}

function isObject(
  value: unknown,
): value is Record<
  PropertyKey,
  unknown
> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function immutableCopy<T>(
  value: T,
): T {
  return deepFreeze(
    cloneValue(value),
  );
}

function cloneValue<T>(
  value: T,
): T {
  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        cloneValue(item),
    ) as unknown as T;
  }

  if (isObject(value)) {
    const clone:
      Record<PropertyKey, unknown> = {};

    for (
      const key of Reflect.ownKeys(value)
    ) {
      clone[key] =
        cloneValue(value[key]);
    }

    return clone as unknown as T;
  }

  return value;
}

function deepFreeze<T>(
  value: T,
): T {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (
    const key of Reflect.ownKeys(value)
  ) {
    deepFreeze(
      (
        value as Record<
          PropertyKey,
          unknown
        >
      )[key],
    );
  }

  return value;
}