/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic DEX pool registry.
 *
 * Responsibilities:
 * - Register, replace, and remove DEX pool descriptors.
 * - Store the latest deterministic pool state for each pool.
 * - Index pools by chain, DEX, address, pair, token, model, and status.
 * - Enforce canonical token ordering and descriptor consistency.
 * - Filter fresh/stale states using caller-supplied timestamps.
 * - Produce immutable snapshots for discovery and arbitrage engines.
 *
 * This module performs no RPC, wallet, filesystem, or clock access.
 */

import {
  type BlockNumber,
  type ChainId,
  type DexId,
  DexLiquidityModel,
  type DexPoolDescriptor,
  type DexPoolState,
  type EvmAddress,
  type PoolId,
  PoolStatus,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
} from "./cross-dex-arbitrage-contracts";
import {
  areSameToken,
  compareTokenOrder,
  createPairKey,
  normalizeEvmAddress,
  normalizeTokenDescriptor,
} from "./token-normalizer";

export enum PoolRegistryErrorCode {
  INVALID_POOL = "INVALID_POOL",
  INVALID_POOL_STATE = "INVALID_POOL_STATE",
  DUPLICATE_POOL_ID = "DUPLICATE_POOL_ID",
  DUPLICATE_POOL_ADDRESS = "DUPLICATE_POOL_ADDRESS",
  POOL_NOT_FOUND = "POOL_NOT_FOUND",
  POOL_STATE_NOT_FOUND = "POOL_STATE_NOT_FOUND",
  POOL_STATE_MISMATCH = "POOL_STATE_MISMATCH",
  MODEL_STATE_MISMATCH = "MODEL_STATE_MISMATCH",
  TOKEN_PAIR_MISMATCH = "TOKEN_PAIR_MISMATCH",
  STATE_VERSION_REGRESSION = "STATE_VERSION_REGRESSION",
  BLOCK_REGRESSION = "BLOCK_REGRESSION",
  OBSERVATION_TIME_REGRESSION = "OBSERVATION_TIME_REGRESSION",
  REGISTRY_FROZEN = "REGISTRY_FROZEN",
}

export class PoolRegistryError extends Error {
  public readonly code: PoolRegistryErrorCode;
  public readonly poolId?: PoolId;
  public readonly chainId?: ChainId;
  public readonly dexId?: DexId;
  public readonly details?: unknown;

  public constructor(
    code: PoolRegistryErrorCode,
    message: string,
    options: Readonly<{
      poolId?: PoolId;
      chainId?: ChainId;
      dexId?: DexId;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "PoolRegistryError";
    this.code = code;
    this.poolId = options.poolId;
    this.chainId = options.chainId;
    this.dexId = options.dexId;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PoolRegistryEntry {
  readonly pool: DexPoolDescriptor;
  readonly state?: DexPoolState;
}

export interface PoolRegistryFilter {
  readonly chainId?: ChainId;
  readonly dexId?: DexId;
  readonly tokenAddress?: EvmAddress;
  readonly token0Address?: EvmAddress;
  readonly token1Address?: EvmAddress;
  readonly pairKey?: string;
  readonly liquidityModel?: DexLiquidityModel;
  readonly statuses?: readonly PoolStatus[];
  readonly activeOnly?: boolean;
  readonly withStateOnly?: boolean;
  readonly minimumCreatedBlockNumber?: BlockNumber;
  readonly maximumCreatedBlockNumber?: BlockNumber;
}

export interface PoolStateFreshnessFilter {
  readonly nowMilliseconds: UnixTimestampMilliseconds;
  readonly maximumAgeMilliseconds: number;
  readonly includeFutureObservations?: boolean;
}

export interface PoolRegistryOptions {
  readonly rejectDuplicateAddressesPerChain?: boolean;
  readonly rejectBlockRegression?: boolean;
  readonly rejectObservationTimeRegression?: boolean;
  readonly rejectStateVersionRegression?: boolean;
  readonly freezeAfterConstruction?: boolean;
}

export interface PoolRegistrySnapshot {
  readonly poolCount: number;
  readonly stateCount: number;
  readonly pools: readonly DexPoolDescriptor[];
  readonly entries: readonly PoolRegistryEntry[];
  readonly frozen: boolean;
}

function normalizeChainId(value: ChainId | number): ChainId {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "chainId must be a positive safe integer.",
      { details: value },
    );
  }

  return numeric as ChainId;
}

function normalizePoolId(value: PoolId | string): PoolId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.id must be a non-empty string.",
      { details: value },
    );
  }

  return value.trim() as PoolId;
}

function normalizeDexId(value: DexId | string): DexId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.dexId must be a non-empty string.",
      { details: value },
    );
  }

  return value.trim() as DexId;
}

function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeFeeBasisPoints(value: number): number {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0 ||
    numeric > 10_000
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.feeBasisPoints must be between 0 and 10,000.",
      { details: value },
    );
  }

  return numeric;
}

function normalizePoolDescriptor(
  pool: DexPoolDescriptor,
): DexPoolDescriptor {
  if (pool === null || typeof pool !== "object") {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "Pool descriptor must be an object.",
      { details: pool },
    );
  }

  const id = normalizePoolId(pool.id);
  const chainId = normalizeChainId(pool.chainId);
  const dexId = normalizeDexId(pool.dexId);
  const address = normalizeEvmAddress(
    pool.address,
    "pool.address",
  );

  const first = normalizeTokenDescriptor(pool.token0);
  const second = normalizeTokenDescriptor(pool.token1);

  if (
    first.chainId !== chainId ||
    second.chainId !== chainId
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.TOKEN_PAIR_MISMATCH,
      "Both pool tokens must belong to the pool chain.",
      {
        poolId: id,
        chainId,
        dexId,
        details: {
          token0ChainId: first.chainId,
          token1ChainId: second.chainId,
        },
      },
    );
  }

  if (areSameToken(first, second)) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.TOKEN_PAIR_MISMATCH,
      "A pool must contain two distinct tokens.",
      { poolId: id, chainId, dexId },
    );
  }

  const ordered =
    compareTokenOrder(first, second) <= 0;

  const token0 = ordered ? first : second;
  const token1 = ordered ? second : first;

  if (
    !Object.values(DexLiquidityModel).includes(
      pool.liquidityModel,
    )
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.liquidityModel is invalid.",
      {
        poolId: id,
        chainId,
        dexId,
        details: pool.liquidityModel,
      },
    );
  }

  if (!Object.values(PoolStatus).includes(pool.status)) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.status is invalid.",
      {
        poolId: id,
        chainId,
        dexId,
        details: pool.status,
      },
    );
  }

  if (
    pool.tickSpacing !== undefined &&
    (!Number.isInteger(pool.tickSpacing) ||
      pool.tickSpacing <= 0)
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.tickSpacing must be a positive integer when provided.",
      {
        poolId: id,
        chainId,
        dexId,
        details: pool.tickSpacing,
      },
    );
  }

  if (
    pool.createdBlockNumber !== undefined &&
    pool.createdBlockNumber < 0n
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL,
      "pool.createdBlockNumber cannot be negative.",
      {
        poolId: id,
        chainId,
        dexId,
        details: pool.createdBlockNumber,
      },
    );
  }

  return Object.freeze({
    ...pool,
    id,
    chainId,
    dexId,
    address,
    token0,
    token1,
    feeBasisPoints:
      normalizeFeeBasisPoints(
        pool.feeBasisPoints,
      ) as DexPoolDescriptor["feeBasisPoints"],
    poolVersion: normalizeOptionalText(
      pool.poolVersion,
    ),
    metadata:
      pool.metadata === undefined
        ? undefined
        : Object.freeze({ ...pool.metadata }),
  });
}

function normalizePoolState(
  state: DexPoolState,
): DexPoolState {
  if (state === null || typeof state !== "object") {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL_STATE,
      "Pool state must be an object.",
      { details: state },
    );
  }

  const pool = normalizePoolDescriptor(state.pool);

  if (
    state.blockReference.chainId !== pool.chainId
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.POOL_STATE_MISMATCH,
      "Pool state block reference chain does not match the pool chain.",
      {
        poolId: pool.id,
        chainId: pool.chainId,
        dexId: pool.dexId,
      },
    );
  }

  if (
    state.blockReference.blockNumber < 0n
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL_STATE,
      "Pool state block number cannot be negative.",
      { poolId: pool.id },
    );
  }

  if (
    !Number.isFinite(
      state.observedAtMilliseconds,
    ) ||
    state.observedAtMilliseconds < 0
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL_STATE,
      "Pool state observation time must be a non-negative finite number.",
      { poolId: pool.id },
    );
  }

  if (
    typeof state.stateVersion !== "string" ||
    state.stateVersion.trim().length === 0
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.INVALID_POOL_STATE,
      "Pool state version must be a non-empty string.",
      { poolId: pool.id },
    );
  }

  if (
    state.modelState.model !==
    pool.liquidityModel
  ) {
    throw new PoolRegistryError(
      PoolRegistryErrorCode.MODEL_STATE_MISMATCH,
      "Pool state model does not match the pool liquidity model.",
      {
        poolId: pool.id,
        chainId: pool.chainId,
        dexId: pool.dexId,
        details: {
          descriptorModel:
            pool.liquidityModel,
          stateModel: state.modelState.model,
        },
      },
    );
  }

  return Object.freeze({
    ...state,
    pool,
    blockReference: Object.freeze({
      ...state.blockReference,
    }),
    modelState: Object.freeze({
      ...state.modelState,
    }),
    stateVersion: state.stateVersion.trim(),
    metadata:
      state.metadata === undefined
        ? undefined
        : Object.freeze({ ...state.metadata }),
  });
}

function createAddressKey(
  chainId: ChainId,
  address: EvmAddress,
): string {
  return `${chainId}:${normalizeEvmAddress(address)}`;
}

function createDexKey(
  chainId: ChainId,
  dexId: DexId,
): string {
  return `${chainId}:${String(dexId)}`;
}

function createTokenKey(
  chainId: ChainId,
  address: EvmAddress,
): string {
  return `${chainId}:${normalizeEvmAddress(address)}`;
}

function addToIndex<TKey>(
  index: Map<TKey, Set<PoolId>>,
  key: TKey,
  poolId: PoolId,
): void {
  const values = index.get(key) ?? new Set<PoolId>();
  values.add(poolId);
  index.set(key, values);
}

function removeFromIndex<TKey>(
  index: Map<TKey, Set<PoolId>>,
  key: TKey,
  poolId: PoolId,
): void {
  const values = index.get(key);
  values?.delete(poolId);

  if (values !== undefined && values.size === 0) {
    index.delete(key);
  }
}

function comparePools(
  left: DexPoolDescriptor,
  right: DexPoolDescriptor,
): number {
  if (left.chainId !== right.chainId) {
    return Number(left.chainId) -
      Number(right.chainId);
  }

  const dexComparison =
    String(left.dexId).localeCompare(
      String(right.dexId),
    );

  if (dexComparison !== 0) {
    return dexComparison;
  }

  return String(left.id).localeCompare(
    String(right.id),
  );
}

export class CrossDexArbitragePoolRegistry {
  private readonly poolsById =
    new Map<PoolId, DexPoolDescriptor>();

  private readonly statesByPoolId =
    new Map<PoolId, DexPoolState>();

  private readonly poolIdByAddress =
    new Map<string, PoolId>();

  private readonly poolIdsByChain =
    new Map<ChainId, Set<PoolId>>();

  private readonly poolIdsByDex =
    new Map<string, Set<PoolId>>();

  private readonly poolIdsByPair =
    new Map<string, Set<PoolId>>();

  private readonly poolIdsByToken =
    new Map<string, Set<PoolId>>();

  private readonly rejectDuplicateAddressesPerChain: boolean;
  private readonly rejectBlockRegression: boolean;
  private readonly rejectObservationTimeRegression: boolean;
  private readonly rejectStateVersionRegression: boolean;
  private frozen = false;

  public constructor(
    entries: readonly PoolRegistryEntry[] = [],
    options: PoolRegistryOptions = {},
  ) {
    this.rejectDuplicateAddressesPerChain =
      options.rejectDuplicateAddressesPerChain ?? true;
    this.rejectBlockRegression =
      options.rejectBlockRegression ?? true;
    this.rejectObservationTimeRegression =
      options.rejectObservationTimeRegression ?? true;
    this.rejectStateVersionRegression =
      options.rejectStateVersionRegression ?? false;

    for (const entry of entries) {
      this.register(entry.pool, entry.state);
    }

    if (options.freezeAfterConstruction === true) {
      this.freeze();
    }
  }

  public get size(): number {
    return this.poolsById.size;
  }

  public get stateCount(): number {
    return this.statesByPoolId.size;
  }

  public get isFrozen(): boolean {
    return this.frozen;
  }

  public freeze(): void {
    this.frozen = true;
  }

  public register(
    pool: DexPoolDescriptor,
    state?: DexPoolState,
  ): PoolRegistryEntry {
    this.assertMutable();

    const normalized =
      normalizePoolDescriptor(pool);

    if (this.poolsById.has(normalized.id)) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.DUPLICATE_POOL_ID,
        `Pool "${normalized.id}" is already registered.`,
        {
          poolId: normalized.id,
          chainId: normalized.chainId,
          dexId: normalized.dexId,
        },
      );
    }

    const addressKey = createAddressKey(
      normalized.chainId,
      normalized.address,
    );

    if (
      this.rejectDuplicateAddressesPerChain &&
      this.poolIdByAddress.has(addressKey)
    ) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.DUPLICATE_POOL_ADDRESS,
        `Pool address "${normalized.address}" is already registered on chain ${normalized.chainId}.`,
        {
          poolId: normalized.id,
          chainId: normalized.chainId,
          dexId: normalized.dexId,
        },
      );
    }

    this.poolsById.set(normalized.id, normalized);
    this.poolIdByAddress.set(
      addressKey,
      normalized.id,
    );

    addToIndex(
      this.poolIdsByChain,
      normalized.chainId,
      normalized.id,
    );

    addToIndex(
      this.poolIdsByDex,
      createDexKey(
        normalized.chainId,
        normalized.dexId,
      ),
      normalized.id,
    );

    addToIndex(
      this.poolIdsByPair,
      createPairKey(
        normalized.token0,
        normalized.token1,
      ),
      normalized.id,
    );

    addToIndex(
      this.poolIdsByToken,
      createTokenKey(
        normalized.chainId,
        normalized.token0.address,
      ),
      normalized.id,
    );

    addToIndex(
      this.poolIdsByToken,
      createTokenKey(
        normalized.chainId,
        normalized.token1.address,
      ),
      normalized.id,
    );

    if (state !== undefined) {
      this.setState(state);
    }

    return Object.freeze({
      pool: normalized,
      state: this.statesByPoolId.get(
        normalized.id,
      ),
    });
  }

  public upsert(
    pool: DexPoolDescriptor,
    state?: DexPoolState,
  ): PoolRegistryEntry {
    const existing = this.getPool(pool.id);

    if (existing === undefined) {
      return this.register(pool, state);
    }

    this.replacePool(pool);

    if (state !== undefined) {
      this.setState(state);
    }

    return this.requireEntry(pool.id);
  }

  public replacePool(
    pool: DexPoolDescriptor,
  ): DexPoolDescriptor {
    this.assertMutable();

    const normalized =
      normalizePoolDescriptor(pool);
    const previous =
      this.requirePool(normalized.id);

    if (
      previous.chainId !== normalized.chainId ||
      previous.address !== normalized.address
    ) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_STATE_MISMATCH,
        "A pool replacement cannot change chainId or address.",
        {
          poolId: normalized.id,
          details: {
            previous,
            replacement: normalized,
          },
        },
      );
    }

    const previousPairKey = createPairKey(
      previous.token0,
      previous.token1,
    );
    const nextPairKey = createPairKey(
      normalized.token0,
      normalized.token1,
    );

    if (previousPairKey !== nextPairKey) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.TOKEN_PAIR_MISMATCH,
        "A pool replacement cannot change its token pair.",
        { poolId: normalized.id },
      );
    }

    if (previous.dexId !== normalized.dexId) {
      removeFromIndex(
        this.poolIdsByDex,
        createDexKey(
          previous.chainId,
          previous.dexId,
        ),
        previous.id,
      );
      addToIndex(
        this.poolIdsByDex,
        createDexKey(
          normalized.chainId,
          normalized.dexId,
        ),
        normalized.id,
      );
    }

    this.poolsById.set(
      normalized.id,
      normalized,
    );

    const existingState =
      this.statesByPoolId.get(normalized.id);

    if (existingState !== undefined) {
      this.statesByPoolId.set(
        normalized.id,
        Object.freeze({
          ...existingState,
          pool: normalized,
        }),
      );
    }

    return normalized;
  }

  public setState(
    state: DexPoolState,
  ): DexPoolState {
    this.assertMutable();

    const normalized = normalizePoolState(state);
    const registered = this.requirePool(
      normalized.pool.id,
    );

    this.assertStateMatchesPool(
      registered,
      normalized,
    );

    const previous =
      this.statesByPoolId.get(registered.id);

    if (previous !== undefined) {
      if (
        this.rejectBlockRegression &&
        normalized.blockReference.blockNumber <
          previous.blockReference.blockNumber
      ) {
        throw new PoolRegistryError(
          PoolRegistryErrorCode.BLOCK_REGRESSION,
          "Pool state block number cannot move backwards.",
          {
            poolId: registered.id,
            details: {
              previous:
                previous.blockReference.blockNumber,
              next:
                normalized.blockReference.blockNumber,
            },
          },
        );
      }

      if (
        this.rejectObservationTimeRegression &&
        normalized.observedAtMilliseconds <
          previous.observedAtMilliseconds
      ) {
        throw new PoolRegistryError(
          PoolRegistryErrorCode.OBSERVATION_TIME_REGRESSION,
          "Pool state observation time cannot move backwards.",
          { poolId: registered.id },
        );
      }

      if (
        this.rejectStateVersionRegression &&
        normalized.stateVersion.localeCompare(
          previous.stateVersion,
        ) < 0
      ) {
        throw new PoolRegistryError(
          PoolRegistryErrorCode.STATE_VERSION_REGRESSION,
          "Pool state version cannot regress.",
          { poolId: registered.id },
        );
      }
    }

    const stored = Object.freeze({
      ...normalized,
      pool: registered,
    });

    this.statesByPoolId.set(
      registered.id,
      stored,
    );

    return stored;
  }

  public removeState(
    poolId: PoolId | string,
  ): DexPoolState {
    this.assertMutable();

    const id = normalizePoolId(poolId);
    const state =
      this.statesByPoolId.get(id);

    if (state === undefined) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_STATE_NOT_FOUND,
        `No state is registered for pool "${id}".`,
        { poolId: id },
      );
    }

    this.statesByPoolId.delete(id);
    return state;
  }

  public unregister(
    poolId: PoolId | string,
  ): PoolRegistryEntry {
    this.assertMutable();

    const id = normalizePoolId(poolId);
    const pool = this.requirePool(id);
    const state = this.statesByPoolId.get(id);

    this.poolsById.delete(id);
    this.statesByPoolId.delete(id);
    this.poolIdByAddress.delete(
      createAddressKey(
        pool.chainId,
        pool.address,
      ),
    );

    removeFromIndex(
      this.poolIdsByChain,
      pool.chainId,
      id,
    );

    removeFromIndex(
      this.poolIdsByDex,
      createDexKey(
        pool.chainId,
        pool.dexId,
      ),
      id,
    );

    removeFromIndex(
      this.poolIdsByPair,
      createPairKey(
        pool.token0,
        pool.token1,
      ),
      id,
    );

    removeFromIndex(
      this.poolIdsByToken,
      createTokenKey(
        pool.chainId,
        pool.token0.address,
      ),
      id,
    );

    removeFromIndex(
      this.poolIdsByToken,
      createTokenKey(
        pool.chainId,
        pool.token1.address,
      ),
      id,
    );

    return Object.freeze({ pool, state });
  }

  public has(
    poolId: PoolId | string,
  ): boolean {
    return this.poolsById.has(
      normalizePoolId(poolId),
    );
  }

  public getPool(
    poolId: PoolId | string,
  ): DexPoolDescriptor | undefined {
    return this.poolsById.get(
      normalizePoolId(poolId),
    );
  }

  public requirePool(
    poolId: PoolId | string,
  ): DexPoolDescriptor {
    const id = normalizePoolId(poolId);
    const pool = this.poolsById.get(id);

    if (pool === undefined) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_NOT_FOUND,
        `Pool "${id}" is not registered.`,
        { poolId: id },
      );
    }

    return pool;
  }

  public getState(
    poolId: PoolId | string,
  ): DexPoolState | undefined {
    return this.statesByPoolId.get(
      normalizePoolId(poolId),
    );
  }

  public requireState(
    poolId: PoolId | string,
  ): DexPoolState {
    const id = normalizePoolId(poolId);
    const state =
      this.statesByPoolId.get(id);

    if (state === undefined) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_STATE_NOT_FOUND,
        `No state is registered for pool "${id}".`,
        { poolId: id },
      );
    }

    return state;
  }

  public getEntry(
    poolId: PoolId | string,
  ): PoolRegistryEntry | undefined {
    const pool = this.getPool(poolId);

    if (pool === undefined) {
      return undefined;
    }

    return Object.freeze({
      pool,
      state: this.statesByPoolId.get(
        pool.id,
      ),
    });
  }

  public requireEntry(
    poolId: PoolId | string,
  ): PoolRegistryEntry {
    const entry = this.getEntry(poolId);

    if (entry === undefined) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_NOT_FOUND,
        `Pool "${normalizePoolId(poolId)}" is not registered.`,
        { poolId: normalizePoolId(poolId) },
      );
    }

    return entry;
  }

  public findByAddress(
    chainId: ChainId | number,
    address: EvmAddress | string,
  ): PoolRegistryEntry | undefined {
    const id = this.poolIdByAddress.get(
      createAddressKey(
        normalizeChainId(chainId),
        normalizeEvmAddress(address),
      ),
    );

    return id === undefined
      ? undefined
      : this.getEntry(id);
  }

  public listPools(
    filter: PoolRegistryFilter = {},
  ): readonly DexPoolDescriptor[] {
    const normalizedFilter =
      this.normalizeFilter(filter);

    return Object.freeze(
      [...this.poolsById.values()]
        .filter((pool) =>
          this.matchesFilter(
            pool,
            normalizedFilter,
          ),
        )
        .sort(comparePools),
    );
  }

  public listEntries(
    filter: PoolRegistryFilter = {},
  ): readonly PoolRegistryEntry[] {
    return Object.freeze(
      this.listPools(filter).map((pool) =>
        Object.freeze({
          pool,
          state:
            this.statesByPoolId.get(pool.id),
        }),
      ),
    );
  }

  public listStates(
    filter: PoolRegistryFilter = {},
  ): readonly DexPoolState[] {
    return Object.freeze(
      this.listPools({
        ...filter,
        withStateOnly: true,
      }).map((pool) =>
        this.requireState(pool.id),
      ),
    );
  }

  public listByPair(
    tokenA: Pick<
      TokenDescriptor,
      "chainId" | "address"
    >,
    tokenB: Pick<
      TokenDescriptor,
      "chainId" | "address"
    >,
    options: Readonly<{
      dexId?: DexId;
      activeOnly?: boolean;
      withStateOnly?: boolean;
    }> = {},
  ): readonly PoolRegistryEntry[] {
    const pairKey = createPairKey(
      tokenA as TokenDescriptor,
      tokenB as TokenDescriptor,
    );

    return this.listEntries({
      pairKey,
      dexId: options.dexId,
      activeOnly: options.activeOnly,
      withStateOnly:
        options.withStateOnly,
    });
  }

  public listFreshStates(
    freshness: PoolStateFreshnessFilter,
    filter: PoolRegistryFilter = {},
  ): readonly DexPoolState[] {
    const now = Number(
      freshness.nowMilliseconds,
    );
    const maximumAge =
      freshness.maximumAgeMilliseconds;

    if (
      !Number.isFinite(now) ||
      !Number.isFinite(maximumAge) ||
      maximumAge < 0
    ) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.INVALID_POOL_STATE,
        "Freshness values must be finite and maximumAgeMilliseconds cannot be negative.",
      );
    }

    return Object.freeze(
      this.listStates(filter).filter((state) => {
        const age =
          now -
          Number(
            state.observedAtMilliseconds,
          );

        if (
          age < 0 &&
          freshness.includeFutureObservations !==
            true
        ) {
          return false;
        }

        return age <= maximumAge;
      }),
    );
  }

  public listStaleStates(
    freshness: PoolStateFreshnessFilter,
    filter: PoolRegistryFilter = {},
  ): readonly DexPoolState[] {
    const freshIds = new Set(
      this.listFreshStates(
        freshness,
        filter,
      ).map((state) => state.pool.id),
    );

    return Object.freeze(
      this.listStates(filter).filter(
        (state) =>
          !freshIds.has(state.pool.id),
      ),
    );
  }

  public snapshot(): PoolRegistrySnapshot {
    const pools = this.listPools();
    const entries = Object.freeze(
      pools.map((pool) =>
        Object.freeze({
          pool,
          state:
            this.statesByPoolId.get(pool.id),
        }),
      ),
    );

    return Object.freeze({
      poolCount: pools.length,
      stateCount: this.statesByPoolId.size,
      pools,
      entries,
      frozen: this.frozen,
    });
  }

  public clear(): void {
    this.assertMutable();

    this.poolsById.clear();
    this.statesByPoolId.clear();
    this.poolIdByAddress.clear();
    this.poolIdsByChain.clear();
    this.poolIdsByDex.clear();
    this.poolIdsByPair.clear();
    this.poolIdsByToken.clear();
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.REGISTRY_FROZEN,
        "The pool registry is frozen and cannot be modified.",
      );
    }
  }

  private assertStateMatchesPool(
    pool: DexPoolDescriptor,
    state: DexPoolState,
  ): void {
    const statePool = state.pool;

    const matches =
      pool.id === statePool.id &&
      pool.chainId === statePool.chainId &&
      pool.dexId === statePool.dexId &&
      pool.address === statePool.address &&
      createPairKey(
        pool.token0,
        pool.token1,
      ) ===
        createPairKey(
          statePool.token0,
          statePool.token1,
        ) &&
      pool.liquidityModel ===
        statePool.liquidityModel;

    if (!matches) {
      throw new PoolRegistryError(
        PoolRegistryErrorCode.POOL_STATE_MISMATCH,
        "The pool state descriptor does not match the registered pool.",
        {
          poolId: pool.id,
          chainId: pool.chainId,
          dexId: pool.dexId,
          details: {
            registered: pool,
            state: statePool,
          },
        },
      );
    }
  }

  private normalizeFilter(
    filter: PoolRegistryFilter,
  ): PoolRegistryFilter {
    return {
      ...filter,
      chainId:
        filter.chainId === undefined
          ? undefined
          : normalizeChainId(
              filter.chainId,
            ),
      dexId:
        filter.dexId === undefined
          ? undefined
          : normalizeDexId(filter.dexId),
      tokenAddress:
        filter.tokenAddress === undefined
          ? undefined
          : normalizeEvmAddress(
              filter.tokenAddress,
            ),
      token0Address:
        filter.token0Address === undefined
          ? undefined
          : normalizeEvmAddress(
              filter.token0Address,
            ),
      token1Address:
        filter.token1Address === undefined
          ? undefined
          : normalizeEvmAddress(
              filter.token1Address,
            ),
      pairKey:
        filter.pairKey?.trim(),
      statuses:
        filter.statuses === undefined
          ? undefined
          : Object.freeze(
              [...filter.statuses],
            ),
    };
  }

  private matchesFilter(
    pool: DexPoolDescriptor,
    filter: PoolRegistryFilter,
  ): boolean {
    if (
      filter.chainId !== undefined &&
      pool.chainId !== filter.chainId
    ) {
      return false;
    }

    if (
      filter.dexId !== undefined &&
      pool.dexId !== filter.dexId
    ) {
      return false;
    }

    if (
      filter.liquidityModel !== undefined &&
      pool.liquidityModel !==
        filter.liquidityModel
    ) {
      return false;
    }

    if (
      filter.activeOnly === true &&
      pool.status !== PoolStatus.ACTIVE
    ) {
      return false;
    }

    if (
      filter.withStateOnly === true &&
      !this.statesByPoolId.has(pool.id)
    ) {
      return false;
    }

    if (
      filter.statuses !== undefined &&
      !filter.statuses.includes(pool.status)
    ) {
      return false;
    }

    if (
      filter.minimumCreatedBlockNumber !== undefined &&
      (pool.createdBlockNumber === undefined ||
        pool.createdBlockNumber <
          filter.minimumCreatedBlockNumber)
    ) {
      return false;
    }

    if (
      filter.maximumCreatedBlockNumber !== undefined &&
      (pool.createdBlockNumber === undefined ||
        pool.createdBlockNumber >
          filter.maximumCreatedBlockNumber)
    ) {
      return false;
    }

    const token0 =
      normalizeEvmAddress(pool.token0.address);
    const token1 =
      normalizeEvmAddress(pool.token1.address);

    if (
      filter.tokenAddress !== undefined &&
      token0 !== filter.tokenAddress &&
      token1 !== filter.tokenAddress
    ) {
      return false;
    }

    if (
      filter.token0Address !== undefined &&
      token0 !== filter.token0Address
    ) {
      return false;
    }

    if (
      filter.token1Address !== undefined &&
      token1 !== filter.token1Address
    ) {
      return false;
    }

    if (
      filter.pairKey !== undefined &&
      createPairKey(
        pool.token0,
        pool.token1,
      ) !== filter.pairKey
    ) {
      return false;
    }

    return true;
  }
}

export function createPoolRegistry(
  entries: readonly PoolRegistryEntry[] = [],
  options: PoolRegistryOptions = {},
): CrossDexArbitragePoolRegistry {
  return new CrossDexArbitragePoolRegistry(
    entries,
    options,
  );
}