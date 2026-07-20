/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-state-manager.ts
 *
 * Purpose:
 * Provides deterministic, immutable, versioned strategy state management with
 * optimistic concurrency control, mutation processing, checksums, history, and
 * complete isolation between strategy instances.
 */

import {
  EMPTY_STRATEGY_METADATA,
  INITIAL_STRATEGY_STATE_VERSION,
  StrategyInstanceId,
  StrategyMetadata,
  StrategySerializableArray,
  StrategySerializableObject,
  StrategySerializableValue,
  StrategyStateMutation,
  StrategyStateSnapshot,
  StrategyStateUpdate,
  StrategyStateValue,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

/* ============================================================================
 * Public contracts
 * ============================================================================
 */

export type StrategyStateManagerErrorCode =
  | "INVALID_ARGUMENT"
  | "STATE_ALREADY_EXISTS"
  | "STATE_NOT_FOUND"
  | "STATE_VERSION_CONFLICT"
  | "STATE_CHECKSUM_MISMATCH"
  | "INVALID_MUTATION_PATH"
  | "INVALID_MUTATION_VALUE"
  | "MUTATION_TARGET_NOT_FOUND"
  | "MUTATION_TYPE_MISMATCH"
  | "AMBIGUOUS_STATE_UPDATE"
  | "STATE_HISTORY_NOT_FOUND";

export class StrategyStateManagerError extends Error {
  public readonly code: StrategyStateManagerErrorCode;
  public readonly strategyInstanceId?: StrategyInstanceId;
  public readonly metadata: StrategyMetadata;

  public constructor(
    code: StrategyStateManagerErrorCode,
    message: string,
    strategyInstanceId?: StrategyInstanceId,
    metadata: StrategyMetadata = EMPTY_STRATEGY_METADATA,
  ) {
    super(message);
    this.name = "StrategyStateManagerError";
    this.code = code;
    this.strategyInstanceId = strategyInstanceId;
    this.metadata = metadata;
    Object.setPrototypeOf(this, StrategyStateManagerError.prototype);
  }
}

export interface StrategyStateManagerOptions {
  readonly retainHistory: boolean;
  readonly maximumHistoryEntriesPerInstance: number;
  readonly verifyStoredChecksums: boolean;
  readonly rejectNoopUpdates: boolean;
  readonly maximumPathDepth: number;
}

export const DEFAULT_STRATEGY_STATE_MANAGER_OPTIONS: StrategyStateManagerOptions =
  Object.freeze({
    retainHistory: true,
    maximumHistoryEntriesPerInstance: 1_000,
    verifyStoredChecksums: true,
    rejectNoopUpdates: false,
    maximumPathDepth: 64,
  });

export interface CreateStrategyStateRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly values?: Readonly<Record<string, StrategyStateValue>>;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface ReplaceStrategyStateRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly expectedVersion: number;
  readonly values: Readonly<Record<string, StrategyStateValue>>;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface ApplyStrategyStateUpdateRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly update: StrategyStateUpdate;
  readonly timestamp: UnixTimestampMilliseconds;
}

export interface DeleteStrategyStateRequest {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly expectedVersion?: number;
}

export interface StrategyStateHistoryQuery {
  readonly strategyInstanceId: StrategyInstanceId;
  readonly fromVersion?: number;
  readonly toVersion?: number;
  readonly limit?: number;
}

export interface StrategyStateManager {
  create(request: CreateStrategyStateRequest): StrategyStateSnapshot;
  get(strategyInstanceId: StrategyInstanceId): StrategyStateSnapshot | undefined;
  require(strategyInstanceId: StrategyInstanceId): StrategyStateSnapshot;
  has(strategyInstanceId: StrategyInstanceId): boolean;
  apply(request: ApplyStrategyStateUpdateRequest): StrategyStateSnapshot;
  replace(request: ReplaceStrategyStateRequest): StrategyStateSnapshot;
  delete(request: DeleteStrategyStateRequest): boolean;
  list(): readonly StrategyStateSnapshot[];
  history(query: StrategyStateHistoryQuery): readonly StrategyStateSnapshot[];
  getVersion(
    strategyInstanceId: StrategyInstanceId,
    version: number,
  ): StrategyStateSnapshot | undefined;
  clear(): void;
}

/* ============================================================================
 * Internal helpers
 * ============================================================================
 */

interface MutableStrategyObject {
  [key: string]: MutableStrategyValue;
}

type MutableStrategyValue =
  | string
  | number
  | boolean
  | null
  | MutableStrategyValue[]
  | MutableStrategyObject;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMutableRecord(value: unknown): value is MutableStrategyObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyIdentifier(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new StrategyStateManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string without leading or trailing whitespace.`,
    );
  }
}

function assertTimestamp(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyStateManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative integer timestamp in milliseconds.`,
    );
  }
}

function assertVersion(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new StrategyStateManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StrategyStateManagerError(
      "INVALID_ARGUMENT",
      `${field} must be a positive integer.`,
    );
  }
}

function cloneMutable(value: StrategySerializableValue): MutableStrategyValue {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneMutable(entry));
  }

  const objectValue = value as StrategySerializableObject;
  const output: MutableStrategyObject = {};
  for (const key of Object.keys(objectValue).sort()) {
    output[key] = cloneMutable(objectValue[key]);
  }
  return output;
}

function cloneMutableRecord(
  values: Readonly<Record<string, StrategyStateValue>>,
): MutableStrategyObject {
  const output: MutableStrategyObject = {};
  for (const key of Object.keys(values).sort()) {
    output[key] = cloneMutable(values[key]);
  }
  return output;
}

function freezeSerializable(value: MutableStrategyValue): StrategySerializableValue {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    const entries = value.map((entry) => freezeSerializable(entry));
    return Object.freeze(entries) as StrategySerializableArray;
  }

  const output: Record<string, StrategySerializableValue> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = freezeSerializable(value[key]);
  }
  return Object.freeze(output) as StrategySerializableObject;
}

function freezeRecord(
  values: MutableStrategyObject,
): Readonly<Record<string, StrategyStateValue>> {
  const output: Record<string, StrategyStateValue> = {};
  for (const key of Object.keys(values).sort()) {
    output[key] = freezeSerializable(values[key]);
  }
  return Object.freeze(output);
}

function cloneMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return freezeRecord(cloneMutableRecord(metadata)) as StrategyMetadata;
}

function stableSerialize(value: StrategySerializableValue): string {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          "Strategy state cannot contain non-finite numbers.",
        );
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
      }
      {
        const objectValue = value as StrategySerializableObject;
        return `{${Object.keys(objectValue)
          .sort()
          .map(
            (key) =>
              `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`,
          )
          .join(",")}}`;
      }
    default:
      throw new StrategyStateManagerError(
        "INVALID_MUTATION_VALUE",
        "Strategy state contains an unsupported value.",
      );
  }
}

function calculateChecksum(
  strategyInstanceId: StrategyInstanceId,
  version: number,
  updatedAt: UnixTimestampMilliseconds,
  values: Readonly<Record<string, StrategyStateValue>>,
): string {
  const serialized = stableSerialize({
    strategyInstanceId,
    version,
    updatedAt,
    values,
  });

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < serialized.length; index += 1) {
    const codePoint = serialized.charCodeAt(index);
    hash ^= BigInt(codePoint & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt((codePoint >>> 8) & 0xff);
    hash = (hash * prime) & mask;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function createSnapshot(
  strategyInstanceId: StrategyInstanceId,
  version: number,
  updatedAt: UnixTimestampMilliseconds,
  values: MutableStrategyObject,
  metadata: StrategyMetadata,
): StrategyStateSnapshot {
  const frozenValues = freezeRecord(values);
  const checksum = calculateChecksum(
    strategyInstanceId,
    version,
    updatedAt,
    frozenValues,
  );

  return Object.freeze({
    strategyInstanceId,
    version,
    updatedAt,
    checksum,
    values: frozenValues,
    metadata: cloneMetadata(metadata),
  });
}

function cloneSnapshot(snapshot: StrategyStateSnapshot): StrategyStateSnapshot {
  return createSnapshot(
    snapshot.strategyInstanceId,
    snapshot.version,
    snapshot.updatedAt,
    cloneMutableRecord(snapshot.values),
    snapshot.metadata,
  );
}

function valuesEqual(
  left: Readonly<Record<string, StrategyStateValue>>,
  right: Readonly<Record<string, StrategyStateValue>>,
): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function parsePath(path: string, maximumPathDepth: number): readonly string[] {
  if (typeof path !== "string" || path.trim().length === 0 || path !== path.trim()) {
    throw new StrategyStateManagerError(
      "INVALID_MUTATION_PATH",
      "State mutation path must be a non-empty string without surrounding whitespace.",
    );
  }

  const segments = path.split(".");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment.trim().length === 0 ||
        segment !== segment.trim() ||
        segment === "__proto__" ||
        segment === "prototype" ||
        segment === "constructor",
    )
  ) {
    throw new StrategyStateManagerError(
      "INVALID_MUTATION_PATH",
      `Invalid strategy state mutation path: ${path}.`,
    );
  }

  if (segments.length > maximumPathDepth) {
    throw new StrategyStateManagerError(
      "INVALID_MUTATION_PATH",
      `State mutation path exceeds the maximum depth of ${maximumPathDepth}.`,
    );
  }

  return Object.freeze(segments);
}

function getAtPath(root: MutableStrategyObject, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!isMutableRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function resolveParent(
  root: MutableStrategyObject,
  path: readonly string[],
  createMissing: boolean,
): { readonly parent: MutableStrategyObject; readonly key: string } {
  let current = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const existing = current[segment];

    if (existing === undefined) {
      if (!createMissing) {
        throw new StrategyStateManagerError(
          "MUTATION_TARGET_NOT_FOUND",
          `State mutation parent path does not exist: ${path.slice(0, index + 1).join(".")}.`,
        );
      }
      const child: MutableStrategyObject = {};
      current[segment] = child;
      current = child;
      continue;
    }

    if (!isMutableRecord(existing)) {
      throw new StrategyStateManagerError(
        "MUTATION_TYPE_MISMATCH",
        `State mutation parent is not an object: ${path.slice(0, index + 1).join(".")}.`,
      );
    }

    current = existing;
  }

  return { parent: current, key: path[path.length - 1] };
}

function assertExpectedCurrentValue(
  root: MutableStrategyObject,
  mutation: StrategyStateMutation,
  path: readonly string[],
): void {
  if (mutation.expectedCurrentValue === undefined) {
    return;
  }

  const currentValue = getAtPath(root, path);
  if (currentValue === undefined) {
    throw new StrategyStateManagerError(
      "STATE_VERSION_CONFLICT",
      `Expected value check failed because ${mutation.path} does not exist.`,
    );
  }

  const expected = stableSerialize(mutation.expectedCurrentValue);
  const actual = stableSerialize(freezeSerializable(currentValue as MutableStrategyValue));
  if (actual !== expected) {
    throw new StrategyStateManagerError(
      "STATE_VERSION_CONFLICT",
      `Expected value check failed for ${mutation.path}.`,
    );
  }
}

function applyMutation(
  root: MutableStrategyObject,
  mutation: StrategyStateMutation,
  maximumPathDepth: number,
): void {
  const path = parsePath(mutation.path, maximumPathDepth);
  assertExpectedCurrentValue(root, mutation, path);

  switch (mutation.operation) {
    case "SET": {
      if (mutation.value === undefined) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          `SET mutation requires a value for ${mutation.path}.`,
        );
      }
      const { parent, key } = resolveParent(root, path, true);
      parent[key] = cloneMutable(mutation.value);
      return;
    }

    case "DELETE": {
      const { parent, key } = resolveParent(root, path, false);
      if (!Object.prototype.hasOwnProperty.call(parent, key)) {
        throw new StrategyStateManagerError(
          "MUTATION_TARGET_NOT_FOUND",
          `Cannot delete missing state path ${mutation.path}.`,
        );
      }
      delete parent[key];
      return;
    }

    case "CLEAR": {
      const { parent, key } = resolveParent(root, path, false);
      if (!Object.prototype.hasOwnProperty.call(parent, key)) {
        throw new StrategyStateManagerError(
          "MUTATION_TARGET_NOT_FOUND",
          `Cannot clear missing state path ${mutation.path}.`,
        );
      }
      const target = parent[key];
      if (Array.isArray(target)) {
        parent[key] = [];
        return;
      }
      if (isMutableRecord(target)) {
        parent[key] = {};
        return;
      }
      throw new StrategyStateManagerError(
        "MUTATION_TYPE_MISMATCH",
        `CLEAR mutation requires an array or object at ${mutation.path}.`,
      );
    }

    case "INCREMENT": {
      if (typeof mutation.value !== "number" || !Number.isFinite(mutation.value)) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          `INCREMENT mutation requires a finite number for ${mutation.path}.`,
        );
      }
      const { parent, key } = resolveParent(root, path, false);
      const currentValue = parent[key];
      if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
        throw new StrategyStateManagerError(
          "MUTATION_TYPE_MISMATCH",
          `INCREMENT mutation requires an existing finite number at ${mutation.path}.`,
        );
      }
      const incremented = currentValue + mutation.value;
      if (!Number.isFinite(incremented)) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          `INCREMENT mutation produced a non-finite number at ${mutation.path}.`,
        );
      }
      parent[key] = incremented;
      return;
    }

    case "APPEND": {
      if (mutation.value === undefined) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          `APPEND mutation requires a value for ${mutation.path}.`,
        );
      }
      const { parent, key } = resolveParent(root, path, false);
      const currentValue = parent[key];
      if (!Array.isArray(currentValue)) {
        throw new StrategyStateManagerError(
          "MUTATION_TYPE_MISMATCH",
          `APPEND mutation requires an existing array at ${mutation.path}.`,
        );
      }
      currentValue.push(cloneMutable(mutation.value));
      return;
    }

    case "MERGE": {
      if (!isRecord(mutation.value)) {
        throw new StrategyStateManagerError(
          "INVALID_MUTATION_VALUE",
          `MERGE mutation requires an object value for ${mutation.path}.`,
        );
      }
      const { parent, key } = resolveParent(root, path, false);
      const currentValue = parent[key];
      if (!isMutableRecord(currentValue)) {
        throw new StrategyStateManagerError(
          "MUTATION_TYPE_MISMATCH",
          `MERGE mutation requires an existing object at ${mutation.path}.`,
        );
      }
      for (const mergeKey of Object.keys(mutation.value).sort()) {
        currentValue[mergeKey] = cloneMutable(
          mutation.value[mergeKey] as StrategySerializableValue,
        );
      }
      return;
    }

    default: {
      const exhaustiveOperation: never = mutation.operation;
      throw new StrategyStateManagerError(
        "INVALID_ARGUMENT",
        `Unsupported state mutation operation: ${String(exhaustiveOperation)}.`,
      );
    }
  }
}

/* ============================================================================
 * In-memory deterministic implementation
 * ============================================================================
 */

export class InMemoryStrategyStateManager implements StrategyStateManager {
  public readonly options: StrategyStateManagerOptions;

  private readonly currentStates = new Map<
    StrategyInstanceId,
    StrategyStateSnapshot
  >();

  private readonly stateHistory = new Map<
    StrategyInstanceId,
    StrategyStateSnapshot[]
  >();

  public constructor(options: Partial<StrategyStateManagerOptions> = {}) {
    const resolved: StrategyStateManagerOptions = Object.freeze({
      ...DEFAULT_STRATEGY_STATE_MANAGER_OPTIONS,
      ...options,
    });

    assertPositiveInteger(
      resolved.maximumHistoryEntriesPerInstance,
      "maximumHistoryEntriesPerInstance",
    );
    assertPositiveInteger(resolved.maximumPathDepth, "maximumPathDepth");

    this.options = resolved;
  }

  public create(request: CreateStrategyStateRequest): StrategyStateSnapshot {
    assertNonEmptyIdentifier(request.strategyInstanceId, "strategyInstanceId");
    assertTimestamp(request.timestamp, "timestamp");

    if (this.currentStates.has(request.strategyInstanceId)) {
      throw new StrategyStateManagerError(
        "STATE_ALREADY_EXISTS",
        `Strategy state already exists for ${request.strategyInstanceId}.`,
        request.strategyInstanceId,
      );
    }

    const snapshot = createSnapshot(
      request.strategyInstanceId,
      INITIAL_STRATEGY_STATE_VERSION,
      request.timestamp,
      cloneMutableRecord(request.values ?? {}),
      request.metadata ?? EMPTY_STRATEGY_METADATA,
    );

    this.store(snapshot);
    return cloneSnapshot(snapshot);
  }

  public get(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyStateSnapshot | undefined {
    assertNonEmptyIdentifier(strategyInstanceId, "strategyInstanceId");
    const snapshot = this.currentStates.get(strategyInstanceId);
    if (snapshot === undefined) {
      return undefined;
    }
    this.verifyChecksum(snapshot);
    return cloneSnapshot(snapshot);
  }

  public require(strategyInstanceId: StrategyInstanceId): StrategyStateSnapshot {
    const snapshot = this.get(strategyInstanceId);
    if (snapshot === undefined) {
      throw new StrategyStateManagerError(
        "STATE_NOT_FOUND",
        `Strategy state was not found for ${strategyInstanceId}.`,
        strategyInstanceId,
      );
    }
    return snapshot;
  }

  public has(strategyInstanceId: StrategyInstanceId): boolean {
    assertNonEmptyIdentifier(strategyInstanceId, "strategyInstanceId");
    return this.currentStates.has(strategyInstanceId);
  }

  public apply(request: ApplyStrategyStateUpdateRequest): StrategyStateSnapshot {
    assertNonEmptyIdentifier(request.strategyInstanceId, "strategyInstanceId");
    assertTimestamp(request.timestamp, "timestamp");
    assertVersion(request.update.expectedVersion, "update.expectedVersion");

    const current = this.requireStored(request.strategyInstanceId);
    this.verifyChecksum(current);
    this.assertExpectedVersion(
      request.strategyInstanceId,
      current.version,
      request.update.expectedVersion,
    );

    const hasReplacement = request.update.replaceState !== undefined;
    const hasMutations = request.update.mutations.length > 0;

    if (hasReplacement && hasMutations) {
      throw new StrategyStateManagerError(
        "AMBIGUOUS_STATE_UPDATE",
        "A strategy state update cannot contain both replaceState and mutations.",
        request.strategyInstanceId,
      );
    }

    let nextValues: MutableStrategyObject;
    if (hasReplacement) {
      nextValues = cloneMutableRecord(request.update.replaceState ?? {});
    } else {
      nextValues = cloneMutableRecord(current.values);
      for (const mutation of request.update.mutations) {
        applyMutation(nextValues, mutation, this.options.maximumPathDepth);
      }
    }

    const frozenCandidate = freezeRecord(nextValues);
    if (this.options.rejectNoopUpdates && valuesEqual(current.values, frozenCandidate)) {
      throw new StrategyStateManagerError(
        "INVALID_ARGUMENT",
        "The strategy state update does not change the current state.",
        request.strategyInstanceId,
      );
    }

    const snapshot = createSnapshot(
      request.strategyInstanceId,
      current.version + 1,
      request.timestamp,
      cloneMutableRecord(frozenCandidate),
      request.update.metadata,
    );

    this.store(snapshot);
    return cloneSnapshot(snapshot);
  }

  public replace(request: ReplaceStrategyStateRequest): StrategyStateSnapshot {
    return this.apply({
      strategyInstanceId: request.strategyInstanceId,
      timestamp: request.timestamp,
      update: Object.freeze({
        expectedVersion: request.expectedVersion,
        mutations: Object.freeze([]),
        replaceState: request.values,
        metadata: request.metadata ?? EMPTY_STRATEGY_METADATA,
      }),
    });
  }

  public delete(request: DeleteStrategyStateRequest): boolean {
    assertNonEmptyIdentifier(request.strategyInstanceId, "strategyInstanceId");
    const current = this.currentStates.get(request.strategyInstanceId);
    if (current === undefined) {
      return false;
    }

    if (request.expectedVersion !== undefined) {
      assertVersion(request.expectedVersion, "expectedVersion");
      this.assertExpectedVersion(
        request.strategyInstanceId,
        current.version,
        request.expectedVersion,
      );
    }

    this.currentStates.delete(request.strategyInstanceId);
    this.stateHistory.delete(request.strategyInstanceId);
    return true;
  }

  public list(): readonly StrategyStateSnapshot[] {
    const snapshots = [...this.currentStates.values()]
      .sort((left, right) =>
        left.strategyInstanceId.localeCompare(right.strategyInstanceId),
      )
      .map((snapshot) => {
        this.verifyChecksum(snapshot);
        return cloneSnapshot(snapshot);
      });

    return Object.freeze(snapshots);
  }

  public history(
    query: StrategyStateHistoryQuery,
  ): readonly StrategyStateSnapshot[] {
    assertNonEmptyIdentifier(query.strategyInstanceId, "strategyInstanceId");

    if (query.fromVersion !== undefined) {
      assertVersion(query.fromVersion, "fromVersion");
    }
    if (query.toVersion !== undefined) {
      assertVersion(query.toVersion, "toVersion");
    }
    if (
      query.fromVersion !== undefined &&
      query.toVersion !== undefined &&
      query.fromVersion > query.toVersion
    ) {
      throw new StrategyStateManagerError(
        "INVALID_ARGUMENT",
        "fromVersion cannot exceed toVersion.",
        query.strategyInstanceId,
      );
    }
    if (query.limit !== undefined) {
      assertPositiveInteger(query.limit, "limit");
    }

    const entries = this.stateHistory.get(query.strategyInstanceId);
    if (entries === undefined) {
      return Object.freeze([]);
    }

    const filtered = entries
      .filter(
        (snapshot) =>
          (query.fromVersion === undefined || snapshot.version >= query.fromVersion) &&
          (query.toVersion === undefined || snapshot.version <= query.toVersion),
      )
      .slice(0, query.limit)
      .map((snapshot) => {
        this.verifyChecksum(snapshot);
        return cloneSnapshot(snapshot);
      });

    return Object.freeze(filtered);
  }

  public getVersion(
    strategyInstanceId: StrategyInstanceId,
    version: number,
  ): StrategyStateSnapshot | undefined {
    assertNonEmptyIdentifier(strategyInstanceId, "strategyInstanceId");
    assertVersion(version, "version");

    const entries = this.stateHistory.get(strategyInstanceId);
    const snapshot = entries?.find((entry) => entry.version === version);
    if (snapshot === undefined) {
      return undefined;
    }

    this.verifyChecksum(snapshot);
    return cloneSnapshot(snapshot);
  }

  public clear(): void {
    this.currentStates.clear();
    this.stateHistory.clear();
  }

  private requireStored(
    strategyInstanceId: StrategyInstanceId,
  ): StrategyStateSnapshot {
    const snapshot = this.currentStates.get(strategyInstanceId);
    if (snapshot === undefined) {
      throw new StrategyStateManagerError(
        "STATE_NOT_FOUND",
        `Strategy state was not found for ${strategyInstanceId}.`,
        strategyInstanceId,
      );
    }
    return snapshot;
  }

  private assertExpectedVersion(
    strategyInstanceId: StrategyInstanceId,
    actualVersion: number,
    expectedVersion: number,
  ): void {
    if (actualVersion !== expectedVersion) {
      throw new StrategyStateManagerError(
        "STATE_VERSION_CONFLICT",
        `Strategy state version conflict for ${strategyInstanceId}: expected ${expectedVersion}, actual ${actualVersion}.`,
        strategyInstanceId,
      );
    }
  }

  private verifyChecksum(snapshot: StrategyStateSnapshot): void {
    if (!this.options.verifyStoredChecksums) {
      return;
    }

    const expected = calculateChecksum(
      snapshot.strategyInstanceId,
      snapshot.version,
      snapshot.updatedAt,
      snapshot.values,
    );

    if (snapshot.checksum !== expected) {
      throw new StrategyStateManagerError(
        "STATE_CHECKSUM_MISMATCH",
        `Strategy state checksum mismatch for ${snapshot.strategyInstanceId} at version ${snapshot.version}.`,
        snapshot.strategyInstanceId,
      );
    }
  }

  private store(snapshot: StrategyStateSnapshot): void {
    this.currentStates.set(snapshot.strategyInstanceId, snapshot);

    if (!this.options.retainHistory) {
      return;
    }

    const entries = this.stateHistory.get(snapshot.strategyInstanceId) ?? [];
    entries.push(snapshot);

    if (entries.length > this.options.maximumHistoryEntriesPerInstance) {
      entries.splice(
        0,
        entries.length - this.options.maximumHistoryEntriesPerInstance,
      );
    }

    this.stateHistory.set(snapshot.strategyInstanceId, entries);
  }
}

export function createInMemoryStrategyStateManager(
  options: Partial<StrategyStateManagerOptions> = {},
): StrategyStateManager {
  return new InMemoryStrategyStateManager(options);
}