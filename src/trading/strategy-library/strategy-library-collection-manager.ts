/**
 * QuantumTradeAI
 * Phase 19 — Professional Trading Strategy Library
 *
 * File:
 * src/trading/strategy-library/strategy-library-collection-manager.ts
 *
 * Purpose:
 * Provides deterministic, immutable collection construction and lifecycle
 * management for strategy-library entries. The manager validates membership
 * against the library registry, normalizes positions, preserves stable order,
 * and optionally persists collections through a collection-capable registry.
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyId,
  type StrategyMetadata,
  type UnixTimestampMilliseconds,
} from "../strategy-framework/strategy-contracts";

import {
  type StrategyLibraryCollection,
  type StrategyLibraryCollectionId,
  type StrategyLibraryCollectionMember,
  type StrategyLibraryCollectionType,
  type StrategyLibraryEntry,
  type StrategyLibraryEntryId,
  type StrategyLibraryRegistryPort,
  type StrategyLibraryTag,
  type StrategyLibraryValidationReport,
  type StrategyLibraryValidatorPort,
} from "./strategy-library-contracts";

/* ========================================================================== *
 * Public contracts
 * ========================================================================== */

export type StrategyLibraryCollectionManagerErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_COLLECTION"
  | "COLLECTION_NOT_FOUND"
  | "COLLECTION_ALREADY_EXISTS"
  | "ENTRY_NOT_FOUND"
  | "MEMBER_ALREADY_EXISTS"
  | "MEMBER_NOT_FOUND"
  | "REGISTRY_COLLECTION_OPERATIONS_UNAVAILABLE";

export class StrategyLibraryCollectionManagerError extends Error {
  public readonly code: StrategyLibraryCollectionManagerErrorCode;
  public readonly collectionId?: StrategyLibraryCollectionId;
  public readonly entryId?: StrategyLibraryEntryId;
  public readonly strategyId?: StrategyId;
  public readonly validationReport?: StrategyLibraryValidationReport;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyLibraryCollectionManagerErrorCode,
    message: string,
    details: {
      readonly collectionId?: StrategyLibraryCollectionId;
      readonly entryId?: StrategyLibraryEntryId;
      readonly strategyId?: StrategyId;
      readonly validationReport?: StrategyLibraryValidationReport;
      readonly metadata?: StrategyMetadata;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "StrategyLibraryCollectionManagerError";
    this.code = code;
    this.collectionId = details.collectionId;
    this.entryId = details.entryId;
    this.strategyId = details.strategyId;
    this.validationReport = details.validationReport;
    this.metadata = immutableCopy(details.metadata ?? EMPTY_STRATEGY_METADATA);
    Object.setPrototypeOf(this, StrategyLibraryCollectionManagerError.prototype);
  }
}

export interface StrategyLibraryCollectionManagerClock {
  now(): UnixTimestampMilliseconds;
}

export interface StrategyLibraryCollectionRegistry
  extends StrategyLibraryRegistryPort {
  registerCollection(collection: StrategyLibraryCollection): void;
  unregisterCollection(collectionId: StrategyLibraryCollectionId): boolean;
  getCollection(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined;
  listCollections(): readonly StrategyLibraryCollection[];
}

export interface StrategyLibraryCollectionManagerOptions {
  readonly requireRegisteredEntries: boolean;
  readonly rejectDuplicateMembers: boolean;
  readonly normalizeMemberPositions: boolean;
  readonly persistChangesToRegistry: boolean;
  readonly preserveExistingCreatedAt: boolean;
}

export const DEFAULT_STRATEGY_LIBRARY_COLLECTION_MANAGER_OPTIONS:
  StrategyLibraryCollectionManagerOptions = Object.freeze({
    requireRegisteredEntries: true,
    rejectDuplicateMembers: true,
    normalizeMemberPositions: true,
    persistChangesToRegistry: true,
    preserveExistingCreatedAt: true,
  });

export interface CreateStrategyLibraryCollectionRequest {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly name: string;
  readonly description: string;
  readonly type: StrategyLibraryCollectionType;
  readonly members?: readonly StrategyLibraryCollectionMember[];
  readonly tags?: readonly StrategyLibraryTag[];
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface UpdateStrategyLibraryCollectionRequest {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly name?: string;
  readonly description?: string;
  readonly type?: StrategyLibraryCollectionType;
  readonly tags?: readonly StrategyLibraryTag[];
  readonly timestamp?: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface AddStrategyLibraryCollectionMemberRequest {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly entryId: StrategyLibraryEntryId;
  readonly strategyId?: StrategyId;
  readonly position?: number;
  readonly featured?: boolean;
  readonly reason?: string;
  readonly metadata?: StrategyMetadata;
  readonly timestamp?: UnixTimestampMilliseconds;
}

export interface UpdateStrategyLibraryCollectionMemberRequest {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly entryId: StrategyLibraryEntryId;
  readonly position?: number;
  readonly featured?: boolean;
  readonly reason?: string | null;
  readonly metadata?: StrategyMetadata;
  readonly timestamp?: UnixTimestampMilliseconds;
}

export interface ReorderStrategyLibraryCollectionRequest {
  readonly collectionId: StrategyLibraryCollectionId;
  readonly entryIds: readonly StrategyLibraryEntryId[];
  readonly timestamp?: UnixTimestampMilliseconds;
}

export interface StrategyLibraryCollectionManagerSnapshot {
  readonly capturedAt: UnixTimestampMilliseconds;
  readonly totalCollections: number;
  readonly totalMembers: number;
  readonly collections: readonly StrategyLibraryCollection[];
  readonly metadata: StrategyMetadata;
}

/* ========================================================================== *
 * Deterministic helpers
 * ========================================================================== */

const SYSTEM_CLOCK: StrategyLibraryCollectionManagerClock = Object.freeze({
  now: (): UnixTimestampMilliseconds => Date.now(),
});

function assertTimestamp(value: number, field = "timestamp"): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new StrategyLibraryCollectionManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a finite, non-negative number.`,
    );
  }
}

function normalizeIdentifier(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new StrategyLibraryCollectionManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new StrategyLibraryCollectionManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string.`,
    );
  }
  return normalized;
}

function normalizeText(value: string, field: string): string {
  return normalizeIdentifier(value, field);
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = deepClone(nested);
    }
    return output as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(deepClone(value));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeTags(tags: readonly StrategyLibraryTag[]): readonly StrategyLibraryTag[] {
  const unique = new Map<string, StrategyLibraryTag>();
  for (const tag of tags) {
    const normalized = normalizeIdentifier(tag, "tag");
    unique.set(normalized.toLowerCase(), normalized);
  }
  return Object.freeze([...unique.values()].sort(compareStrings));
}

function normalizeMembers(
  members: readonly StrategyLibraryCollectionMember[],
  rejectDuplicates: boolean,
  normalizePositions: boolean,
): readonly StrategyLibraryCollectionMember[] {
  const byEntryId = new Map<StrategyLibraryEntryId, StrategyLibraryCollectionMember>();

  for (const member of members) {
    const entryId = normalizeIdentifier(member.entryId, "member.entryId");
    const strategyId = normalizeIdentifier(member.strategyId, "member.strategyId");
    if (!Number.isInteger(member.position) || member.position < 0) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        `Member '${entryId}' position must be a non-negative integer.`,
        { entryId, strategyId },
      );
    }
    if (byEntryId.has(entryId) && rejectDuplicates) {
      throw new StrategyLibraryCollectionManagerError(
        "MEMBER_ALREADY_EXISTS",
        `Entry '${entryId}' occurs more than once in the collection.`,
        { entryId, strategyId },
      );
    }
    byEntryId.set(entryId, immutableCopy({
      entryId,
      strategyId,
      position: member.position,
      featured: member.featured,
      ...(normalizeOptionalText(member.reason) === undefined
        ? {}
        : { reason: normalizeOptionalText(member.reason) }),
      metadata: member.metadata ?? EMPTY_STRATEGY_METADATA,
    }));
  }

  const ordered = [...byEntryId.values()].sort((left, right) =>
    left.position - right.position || compareStrings(left.entryId, right.entryId),
  );

  return Object.freeze(ordered.map((member, index) => immutableCopy({
    ...member,
    position: normalizePositions ? index : member.position,
  })));
}

function isCollectionRegistry(
  registry: StrategyLibraryRegistryPort,
): registry is StrategyLibraryCollectionRegistry {
  const candidate = registry as Partial<StrategyLibraryCollectionRegistry>;
  return typeof candidate.registerCollection === "function" &&
    typeof candidate.unregisterCollection === "function" &&
    typeof candidate.getCollection === "function" &&
    typeof candidate.listCollections === "function";
}

/* ========================================================================== *
 * Manager implementation
 * ========================================================================== */

export class StrategyLibraryCollectionManager {
  private readonly registry: StrategyLibraryRegistryPort;
  private readonly validator?: StrategyLibraryValidatorPort;
  private readonly clock: StrategyLibraryCollectionManagerClock;
  private readonly options: StrategyLibraryCollectionManagerOptions;
  private readonly collections = new Map<
    StrategyLibraryCollectionId,
    StrategyLibraryCollection
  >();

  public constructor(dependencies: {
    readonly registry: StrategyLibraryRegistryPort;
    readonly validator?: StrategyLibraryValidatorPort;
    readonly clock?: StrategyLibraryCollectionManagerClock;
    readonly options?: Partial<StrategyLibraryCollectionManagerOptions>;
  }) {
    if (dependencies === null || typeof dependencies !== "object") {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "dependencies must be an object.",
      );
    }
    if (dependencies.registry === null || typeof dependencies.registry !== "object") {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "dependencies.registry must be provided.",
      );
    }

    this.registry = dependencies.registry;
    this.validator = dependencies.validator;
    this.clock = dependencies.clock ?? SYSTEM_CLOCK;
    this.options = Object.freeze({
      ...DEFAULT_STRATEGY_LIBRARY_COLLECTION_MANAGER_OPTIONS,
      ...dependencies.options,
    });

    if (isCollectionRegistry(this.registry)) {
      for (const collection of this.registry.listCollections()) {
        this.collections.set(collection.collectionId, immutableCopy(collection));
      }
    }
  }

  public create(
    request: CreateStrategyLibraryCollectionRequest,
  ): StrategyLibraryCollection {
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp);
    const collectionId = normalizeIdentifier(request.collectionId, "collectionId");

    if (this.collections.has(collectionId)) {
      throw new StrategyLibraryCollectionManagerError(
        "COLLECTION_ALREADY_EXISTS",
        `Collection '${collectionId}' already exists.`,
        { collectionId },
      );
    }

    const members = normalizeMembers(
      request.members ?? [],
      this.options.rejectDuplicateMembers,
      this.options.normalizeMemberPositions,
    );
    this.assertRegisteredMembers(members);

    const collection = immutableCopy<StrategyLibraryCollection>({
      collectionId,
      name: normalizeText(request.name, "name"),
      description: normalizeText(request.description, "description"),
      type: request.type,
      members,
      tags: normalizeTags(request.tags ?? []),
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: request.metadata ?? EMPTY_STRATEGY_METADATA,
    });

    this.commit(collection, false);
    return collection;
  }

  public register(collection: StrategyLibraryCollection): StrategyLibraryCollection {
    const normalized = this.normalizeCollection(collection);
    if (this.collections.has(normalized.collectionId)) {
      throw new StrategyLibraryCollectionManagerError(
        "COLLECTION_ALREADY_EXISTS",
        `Collection '${normalized.collectionId}' already exists.`,
        { collectionId: normalized.collectionId },
      );
    }
    this.commit(normalized, false);
    return normalized;
  }

  public update(
    request: UpdateStrategyLibraryCollectionRequest,
  ): StrategyLibraryCollection {
    const current = this.getRequired(request.collectionId);
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp);
    if (timestamp < current.createdAt) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "updatedAt cannot precede createdAt.",
        { collectionId: current.collectionId },
      );
    }

    const updated = immutableCopy<StrategyLibraryCollection>({
      ...current,
      ...(request.name === undefined ? {} : { name: normalizeText(request.name, "name") }),
      ...(request.description === undefined
        ? {}
        : { description: normalizeText(request.description, "description") }),
      ...(request.type === undefined ? {} : { type: request.type }),
      ...(request.tags === undefined ? {} : { tags: normalizeTags(request.tags) }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      createdAt: this.options.preserveExistingCreatedAt
        ? current.createdAt
        : Math.min(current.createdAt, timestamp),
      updatedAt: timestamp,
    });

    this.commit(updated, true);
    return updated;
  }

  public addMember(
    request: AddStrategyLibraryCollectionMemberRequest,
  ): StrategyLibraryCollection {
    const collection = this.getRequired(request.collectionId);
    const entryId = normalizeIdentifier(request.entryId, "entryId");
    if (collection.members.some((member) => member.entryId === entryId)) {
      throw new StrategyLibraryCollectionManagerError(
        "MEMBER_ALREADY_EXISTS",
        `Entry '${entryId}' already belongs to collection '${collection.collectionId}'.`,
        { collectionId: collection.collectionId, entryId },
      );
    }

    const entry = this.findEntry(entryId);
    if (entry === undefined && this.options.requireRegisteredEntries) {
      throw new StrategyLibraryCollectionManagerError(
        "ENTRY_NOT_FOUND",
        `Entry '${entryId}' is not registered.`,
        { collectionId: collection.collectionId, entryId },
      );
    }

    const suppliedStrategyId = request.strategyId === undefined
      ? undefined
      : normalizeIdentifier(request.strategyId, "strategyId");
    const strategyId = entry?.strategyId ?? suppliedStrategyId;
    if (strategyId === undefined) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "strategyId is required when the entry cannot be resolved from the registry.",
        { collectionId: collection.collectionId, entryId },
      );
    }
    if (entry !== undefined && suppliedStrategyId !== undefined && entry.strategyId !== suppliedStrategyId) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        `strategyId '${suppliedStrategyId}' does not match entry '${entryId}'.`,
        { collectionId: collection.collectionId, entryId, strategyId: suppliedStrategyId },
      );
    }

    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp);
    const requestedPosition = request.position ?? collection.members.length;
    if (!Number.isInteger(requestedPosition) || requestedPosition < 0) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "position must be a non-negative integer.",
        { collectionId: collection.collectionId, entryId },
      );
    }

    const insertionIndex = Math.min(requestedPosition, collection.members.length);
    const members = [...collection.members];
    members.splice(insertionIndex, 0, {
      entryId,
      strategyId,
      position: insertionIndex,
      featured: request.featured ?? false,
      ...(normalizeOptionalText(request.reason) === undefined
        ? {}
        : { reason: normalizeOptionalText(request.reason) }),
      metadata: request.metadata ?? EMPTY_STRATEGY_METADATA,
    });

    return this.replaceMembers(collection, members, timestamp);
  }

  public updateMember(
    request: UpdateStrategyLibraryCollectionMemberRequest,
  ): StrategyLibraryCollection {
    const collection = this.getRequired(request.collectionId);
    const entryId = normalizeIdentifier(request.entryId, "entryId");
    const index = collection.members.findIndex((member) => member.entryId === entryId);
    if (index < 0) {
      throw new StrategyLibraryCollectionManagerError(
        "MEMBER_NOT_FOUND",
        `Entry '${entryId}' does not belong to collection '${collection.collectionId}'.`,
        { collectionId: collection.collectionId, entryId },
      );
    }

    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp);
    const current = collection.members[index];
    const requestedPosition = request.position ?? current.position;
    if (!Number.isInteger(requestedPosition) || requestedPosition < 0) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "position must be a non-negative integer.",
        { collectionId: collection.collectionId, entryId },
      );
    }

    const nextMember: StrategyLibraryCollectionMember = {
      ...current,
      position: requestedPosition,
      ...(request.featured === undefined ? {} : { featured: request.featured }),
      ...(request.reason === undefined
        ? {}
        : request.reason === null || request.reason.trim().length === 0
          ? { reason: undefined }
          : { reason: request.reason.trim() }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    };

    const members = collection.members.filter((member) => member.entryId !== entryId);
    members.splice(Math.min(requestedPosition, members.length), 0, nextMember);
    return this.replaceMembers(collection, members, timestamp);
  }

  public removeMember(
    collectionId: StrategyLibraryCollectionId,
    entryId: StrategyLibraryEntryId,
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): StrategyLibraryCollection {
    const collection = this.getRequired(collectionId);
    const normalizedEntryId = normalizeIdentifier(entryId, "entryId");
    const members = collection.members.filter(
      (member) => member.entryId !== normalizedEntryId,
    );
    if (members.length === collection.members.length) {
      throw new StrategyLibraryCollectionManagerError(
        "MEMBER_NOT_FOUND",
        `Entry '${normalizedEntryId}' does not belong to collection '${collection.collectionId}'.`,
        { collectionId: collection.collectionId, entryId: normalizedEntryId },
      );
    }
    assertTimestamp(timestamp);
    return this.replaceMembers(collection, members, timestamp);
  }

  public reorder(
    request: ReorderStrategyLibraryCollectionRequest,
  ): StrategyLibraryCollection {
    const collection = this.getRequired(request.collectionId);
    const normalizedIds = request.entryIds.map((entryId) =>
      normalizeIdentifier(entryId, "entryId"),
    );
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "entryIds must not contain duplicates.",
        { collectionId: collection.collectionId },
      );
    }
    const existingIds = new Set(collection.members.map((member) => member.entryId));
    if (normalizedIds.length !== existingIds.size || normalizedIds.some((id) => !existingIds.has(id))) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "entryIds must contain every existing member exactly once.",
        { collectionId: collection.collectionId },
      );
    }
    const byId = new Map(collection.members.map((member) => [member.entryId, member]));
    const members = normalizedIds.map((entryId, position) => ({
      ...byId.get(entryId)!,
      position,
    }));
    const timestamp = request.timestamp ?? this.clock.now();
    assertTimestamp(timestamp);
    return this.replaceMembers(collection, members, timestamp);
  }

  public setFeatured(
    collectionId: StrategyLibraryCollectionId,
    entryId: StrategyLibraryEntryId,
    featured: boolean,
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): StrategyLibraryCollection {
    return this.updateMember({ collectionId, entryId, featured, timestamp });
  }

  public delete(collectionId: StrategyLibraryCollectionId): boolean {
    const normalized = normalizeIdentifier(collectionId, "collectionId");
    const existed = this.collections.delete(normalized);
    if (!existed) {
      return false;
    }
    if (this.options.persistChangesToRegistry) {
      const registry = this.requireCollectionRegistry();
      registry.unregisterCollection(normalized);
    }
    return true;
  }

  public has(collectionId: StrategyLibraryCollectionId): boolean {
    return this.collections.has(normalizeIdentifier(collectionId, "collectionId"));
  }

  public get(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection | undefined {
    return this.collections.get(normalizeIdentifier(collectionId, "collectionId"));
  }

  public getRequired(
    collectionId: StrategyLibraryCollectionId,
  ): StrategyLibraryCollection {
    const normalized = normalizeIdentifier(collectionId, "collectionId");
    const collection = this.collections.get(normalized);
    if (collection === undefined) {
      throw new StrategyLibraryCollectionManagerError(
        "COLLECTION_NOT_FOUND",
        `Collection '${normalized}' was not found.`,
        { collectionId: normalized },
      );
    }
    return collection;
  }

  public list(): readonly StrategyLibraryCollection[] {
    return Object.freeze(
      [...this.collections.values()].sort((left, right) =>
        compareStrings(left.collectionId, right.collectionId),
      ),
    );
  }

  public listByType(
    type: StrategyLibraryCollectionType,
  ): readonly StrategyLibraryCollection[] {
    return Object.freeze(this.list().filter((collection) => collection.type === type));
  }

  public listContainingEntry(
    entryId: StrategyLibraryEntryId,
  ): readonly StrategyLibraryCollection[] {
    const normalized = normalizeIdentifier(entryId, "entryId");
    return Object.freeze(
      this.list().filter((collection) =>
        collection.members.some((member) => member.entryId === normalized),
      ),
    );
  }

  public snapshot(
    timestamp: UnixTimestampMilliseconds = this.clock.now(),
  ): StrategyLibraryCollectionManagerSnapshot {
    assertTimestamp(timestamp);
    const collections = this.list();
    return immutableCopy({
      capturedAt: timestamp,
      totalCollections: collections.length,
      totalMembers: collections.reduce(
        (total, collection) => total + collection.members.length,
        0,
      ),
      collections,
      metadata: EMPTY_STRATEGY_METADATA,
    });
  }

  public synchronizeFromRegistry(): readonly StrategyLibraryCollection[] {
    const registry = this.requireCollectionRegistry();
    this.collections.clear();
    for (const collection of registry.listCollections()) {
      const normalized = this.normalizeCollection(collection);
      this.collections.set(normalized.collectionId, normalized);
    }
    return this.list();
  }

  private normalizeCollection(
    collection: StrategyLibraryCollection,
  ): StrategyLibraryCollection {
    assertTimestamp(collection.createdAt, "collection.createdAt");
    assertTimestamp(collection.updatedAt, "collection.updatedAt");
    if (collection.updatedAt < collection.createdAt) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "collection.updatedAt cannot precede collection.createdAt.",
        { collectionId: collection.collectionId },
      );
    }
    const members = normalizeMembers(
      collection.members,
      this.options.rejectDuplicateMembers,
      this.options.normalizeMemberPositions,
    );
    this.assertRegisteredMembers(members);
    return immutableCopy({
      ...collection,
      collectionId: normalizeIdentifier(collection.collectionId, "collection.collectionId"),
      name: normalizeText(collection.name, "collection.name"),
      description: normalizeText(collection.description, "collection.description"),
      members,
      tags: normalizeTags(collection.tags),
      metadata: collection.metadata ?? EMPTY_STRATEGY_METADATA,
    });
  }

  private replaceMembers(
    collection: StrategyLibraryCollection,
    members: readonly StrategyLibraryCollectionMember[],
    timestamp: UnixTimestampMilliseconds,
  ): StrategyLibraryCollection {
    if (timestamp < collection.createdAt) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_ARGUMENT",
        "updatedAt cannot precede createdAt.",
        { collectionId: collection.collectionId },
      );
    }
    const normalizedMembers = normalizeMembers(
      members,
      this.options.rejectDuplicateMembers,
      this.options.normalizeMemberPositions,
    );
    this.assertRegisteredMembers(normalizedMembers);
    const updated = immutableCopy<StrategyLibraryCollection>({
      ...collection,
      members: normalizedMembers,
      updatedAt: timestamp,
    });
    this.commit(updated, true);
    return updated;
  }

  private commit(
    collection: StrategyLibraryCollection,
    replacing: boolean,
  ): void {
    this.validate(collection);
    if (this.options.persistChangesToRegistry) {
      const registry = this.requireCollectionRegistry();
      if (replacing && registry.getCollection(collection.collectionId) !== undefined) {
        registry.unregisterCollection(collection.collectionId);
      }
      registry.registerCollection(collection);
    }
    this.collections.set(collection.collectionId, collection);
  }

  private validate(collection: StrategyLibraryCollection): void {
    const report = this.validator?.validateCollection(collection);
    if (report !== undefined && !report.valid) {
      throw new StrategyLibraryCollectionManagerError(
        "INVALID_COLLECTION",
        `Collection '${collection.collectionId}' failed validation.`,
        { collectionId: collection.collectionId, validationReport: report },
      );
    }
  }

  private assertRegisteredMembers(
    members: readonly StrategyLibraryCollectionMember[],
  ): void {
    if (!this.options.requireRegisteredEntries) {
      return;
    }
    for (const member of members) {
      const entry = this.findEntry(member.entryId);
      if (entry === undefined) {
        throw new StrategyLibraryCollectionManagerError(
          "ENTRY_NOT_FOUND",
          `Entry '${member.entryId}' is not registered.`,
          { entryId: member.entryId, strategyId: member.strategyId },
        );
      }
      if (entry.strategyId !== member.strategyId) {
        throw new StrategyLibraryCollectionManagerError(
          "INVALID_ARGUMENT",
          `Member strategyId '${member.strategyId}' does not match entry '${member.entryId}'.`,
          { entryId: member.entryId, strategyId: member.strategyId },
        );
      }
    }
  }

  private findEntry(entryId: StrategyLibraryEntryId): StrategyLibraryEntry | undefined {
    return this.registry.list().find((entry) => entry.entryId === entryId);
  }

  private requireCollectionRegistry(): StrategyLibraryCollectionRegistry {
    if (!isCollectionRegistry(this.registry)) {
      throw new StrategyLibraryCollectionManagerError(
        "REGISTRY_COLLECTION_OPERATIONS_UNAVAILABLE",
        "The configured registry does not expose collection operations.",
      );
    }
    return this.registry;
  }
}

export function createStrategyLibraryCollectionManager(
  dependencies: ConstructorParameters<typeof StrategyLibraryCollectionManager>[0],
): StrategyLibraryCollectionManager {
  return new StrategyLibraryCollectionManager(dependencies);
}