/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic pool state monitoring and registry synchronization.
 */

import {
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexAdapter,
  type DexId,
  type DexPoolDescriptor,
  type DexPoolState,
  type PoolId,
  PoolStatus,
  type UnixTimestampMilliseconds,
} from "./cross-dex-arbitrage-contracts";
import {
  CrossDexArbitrageDexRegistry,
  type DexRegistryEntry,
} from "./dex-registry";
import {
  CrossDexArbitragePoolRegistry,
  type PoolRegistryFilter,
  PoolRegistryError,
} from "./pool-registry";

export enum PoolMonitorErrorCode {
  INVALID_OPTIONS = "INVALID_OPTIONS",
  INVALID_REQUEST = "INVALID_REQUEST",
  NO_POOLS_SELECTED = "NO_POOLS_SELECTED",
  DEX_NOT_REGISTERED = "DEX_NOT_REGISTERED",
  ADAPTER_NOT_REGISTERED = "ADAPTER_NOT_REGISTERED",
  POOL_READ_FAILED = "POOL_READ_FAILED",
  INVALID_POOL_STATE = "INVALID_POOL_STATE",
  POOL_ID_MISMATCH = "POOL_ID_MISMATCH",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  DEX_MISMATCH = "DEX_MISMATCH",
  BLOCK_MISMATCH = "BLOCK_MISMATCH",
  BLOCK_REGRESSION = "BLOCK_REGRESSION",
  OBSERVATION_TIME_REGRESSION = "OBSERVATION_TIME_REGRESSION",
  REGISTRY_UPDATE_FAILED = "REGISTRY_UPDATE_FAILED",
  MONITOR_ABORTED = "MONITOR_ABORTED",
}

export class PoolMonitorError extends Error {
  public readonly code: PoolMonitorErrorCode;
  public readonly poolId?: PoolId;
  public readonly dexId?: DexId;
  public readonly chainId?: ChainId;
  public readonly cause?: unknown;
  public readonly details?: unknown;

  public constructor(
    code: PoolMonitorErrorCode,
    message: string,
    options: Readonly<{
      poolId?: PoolId;
      dexId?: DexId;
      chainId?: ChainId;
      cause?: unknown;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "PoolMonitorError";
    this.code = code;
    this.poolId = options.poolId;
    this.dexId = options.dexId;
    this.chainId = options.chainId;
    this.cause = options.cause;
    this.details = options.details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PoolMonitorClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface PoolMonitorOptions {
  readonly maximumConcurrency?: number;
  readonly continueOnPoolFailure?: boolean;
  readonly requireAtLeastOneSuccessfulRead?: boolean;
  readonly updatePoolRegistry?: boolean;
  readonly rejectBlockRegression?: boolean;
  readonly rejectObservationTimeRegression?: boolean;
  readonly enforceRequestedBlock?: boolean;
  readonly maximumStateAgeMilliseconds?: number;
  readonly includeDisabledPools?: boolean;
}

export interface PoolMonitorRequest {
  readonly poolIds?: readonly PoolId[];
  readonly chainId?: ChainId;
  readonly dexIds?: readonly DexId[];
  readonly blockNumber?: BlockNumber;
  readonly activeOnly?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export enum PoolMonitoringOutcome {
  UPDATED = "UPDATED",
  UNCHANGED = "UNCHANGED",
  STALE = "STALE",
  FAILED = "FAILED",
}

export interface PoolMonitoringAttempt {
  readonly poolId: PoolId;
  readonly dexId: DexId;
  readonly chainId: ChainId;
  readonly outcome: PoolMonitoringOutcome;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly previousBlockNumber?: BlockNumber;
  readonly observedBlockNumber?: BlockNumber;
  readonly previousStateVersion?: string;
  readonly observedStateVersion?: string;
  readonly registryUpdated: boolean;
  readonly stale: boolean;
  readonly errorCode?: PoolMonitorErrorCode;
  readonly errorMessage?: string;
}

export interface PoolStateChangeEvent {
  readonly poolId: PoolId;
  readonly dexId: DexId;
  readonly chainId: ChainId;
  readonly previousState?: DexPoolState;
  readonly currentState: DexPoolState;
  readonly blockAdvanced: boolean;
  readonly stateVersionChanged: boolean;
  readonly observedAtMilliseconds: UnixTimestampMilliseconds;
}

export interface PoolMonitorSnapshot {
  readonly monitoredPoolCount: number;
  readonly successfulReadCount: number;
  readonly failedReadCount: number;
  readonly updatedStateCount: number;
  readonly unchangedStateCount: number;
  readonly staleStateCount: number;
  readonly attempts: readonly PoolMonitoringAttempt[];
  readonly events: readonly PoolStateChangeEvent[];
  readonly states: readonly DexPoolState[];
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly requestedBlockNumber?: BlockNumber;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PoolMonitorDependencies {
  readonly dexRegistry: CrossDexArbitrageDexRegistry;
  readonly poolRegistry: CrossDexArbitragePoolRegistry;
  readonly clock: PoolMonitorClock;
}

interface ReadOutcome {
  readonly pool: DexPoolDescriptor;
  readonly previousState?: DexPoolState;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly state?: DexPoolState;
  readonly error?: PoolMonitorError;
}

const DEFAULT_OPTIONS: Required<PoolMonitorOptions> = Object.freeze({
  maximumConcurrency: 8,
  continueOnPoolFailure: true,
  requireAtLeastOneSuccessfulRead: true,
  updatePoolRegistry: true,
  rejectBlockRegression: true,
  rejectObservationTimeRegression: true,
  enforceRequestedBlock: true,
  maximumStateAgeMilliseconds: 12_000,
  includeDisabledPools: false,
});

function normalizeOptions(
  options: PoolMonitorOptions,
): Required<PoolMonitorOptions> {
  const merged = { ...DEFAULT_OPTIONS, ...options };

  if (
    !Number.isSafeInteger(merged.maximumConcurrency) ||
    merged.maximumConcurrency <= 0
  ) {
    throw new PoolMonitorError(
      PoolMonitorErrorCode.INVALID_OPTIONS,
      "maximumConcurrency must be a positive safe integer.",
    );
  }

  if (
    !Number.isFinite(merged.maximumStateAgeMilliseconds) ||
    merged.maximumStateAgeMilliseconds < 0
  ) {
    throw new PoolMonitorError(
      PoolMonitorErrorCode.INVALID_OPTIONS,
      "maximumStateAgeMilliseconds must be a non-negative finite number.",
    );
  }

  return Object.freeze(merged);
}

function normalizeRequest(request: PoolMonitorRequest): PoolMonitorRequest {
  if (request === null || typeof request !== "object") {
    throw new PoolMonitorError(
      PoolMonitorErrorCode.INVALID_REQUEST,
      "Pool monitor request must be an object.",
    );
  }

  if (
    request.chainId !== undefined &&
    (!Number.isSafeInteger(Number(request.chainId)) ||
      Number(request.chainId) <= 0)
  ) {
    throw new PoolMonitorError(
      PoolMonitorErrorCode.INVALID_REQUEST,
      "request.chainId must be a positive safe integer.",
    );
  }

  if (
    request.blockNumber !== undefined &&
    (typeof request.blockNumber !== "bigint" || request.blockNumber < 0n)
  ) {
    throw new PoolMonitorError(
      PoolMonitorErrorCode.INVALID_REQUEST,
      "request.blockNumber must be a non-negative bigint.",
    );
  }

  const poolIds = request.poolIds === undefined
    ? undefined
    : Object.freeze(
        [...new Set(request.poolIds.map((id) => {
          if (typeof id !== "string" || id.trim().length === 0) {
            throw new PoolMonitorError(
              PoolMonitorErrorCode.INVALID_REQUEST,
              "Every pool id must be a non-empty string.",
            );
          }
          return id.trim() as PoolId;
        }))].sort((a, b) => String(a).localeCompare(String(b))),
      );

  const dexIds = request.dexIds === undefined
    ? undefined
    : Object.freeze(
        [...new Set(request.dexIds.map((id) => {
          if (typeof id !== "string" || id.trim().length === 0) {
            throw new PoolMonitorError(
              PoolMonitorErrorCode.INVALID_REQUEST,
              "Every DEX id must be a non-empty string.",
            );
          }
          return id.trim() as DexId;
        }))].sort((a, b) => String(a).localeCompare(String(b))),
      );

  return Object.freeze({
    ...request,
    poolIds,
    dexIds,
    metadata: request.metadata === undefined
      ? undefined
      : Object.freeze({ ...request.metadata }),
  });
}

function comparePools(left: DexPoolDescriptor, right: DexPoolDescriptor): number {
  if (left.chainId !== right.chainId) {
    return Number(left.chainId) - Number(right.chainId);
  }
  const dex = String(left.dexId).localeCompare(String(right.dexId));
  return dex !== 0 ? dex : String(left.id).localeCompare(String(right.id));
}

function compareStates(left: DexPoolState, right: DexPoolState): number {
  return comparePools(left.pool, right.pool);
}

function freezeState(state: DexPoolState): DexPoolState {
  return Object.freeze({
    ...state,
    pool: Object.freeze({ ...state.pool }),
    blockReference: Object.freeze({ ...state.blockReference }),
    modelState: Object.freeze({ ...state.modelState }),
    metadata: state.metadata === undefined
      ? undefined
      : Object.freeze({ ...state.metadata }),
  });
}

async function mapWithConcurrency<TInput, TOutput>(
  values: readonly TInput[],
  maximumConcurrency: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
): Promise<readonly TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(maximumConcurrency, values.length) },
      () => worker(),
    ),
  );

  return Object.freeze(results);
}

export class CrossDexArbitragePoolMonitor {
  private readonly dexRegistry: CrossDexArbitrageDexRegistry;
  private readonly poolRegistry: CrossDexArbitragePoolRegistry;
  private readonly clock: PoolMonitorClock;
  private readonly options: Required<PoolMonitorOptions>;

  public constructor(
    dependencies: PoolMonitorDependencies,
    options: PoolMonitorOptions = {},
  ) {
    if (dependencies === null || typeof dependencies !== "object") {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_OPTIONS,
        "Pool monitor dependencies must be provided.",
      );
    }
    if (typeof dependencies.clock?.nowMilliseconds !== "function") {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_OPTIONS,
        "A deterministic pool monitor clock is required.",
      );
    }

    this.dexRegistry = dependencies.dexRegistry;
    this.poolRegistry = dependencies.poolRegistry;
    this.clock = dependencies.clock;
    this.options = normalizeOptions(options);
  }

  public async refresh(
    request: PoolMonitorRequest = {},
  ): Promise<PoolMonitorSnapshot> {
    const normalizedRequest = normalizeRequest(request);
    const startedAtMilliseconds = this.clock.nowMilliseconds();
    const pools = this.selectPools(normalizedRequest);

    if (pools.length === 0) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.NO_POOLS_SELECTED,
        "No registered pools matched the monitoring request.",
      );
    }

    const outcomes = await mapWithConcurrency(
      pools,
      this.options.maximumConcurrency,
      (pool) => this.readPool(pool, normalizedRequest.blockNumber),
    );

    const failures = outcomes.filter((outcome) => outcome.error !== undefined);
    if (failures.length > 0 && !this.options.continueOnPoolFailure) {
      const first = failures[0];
      throw new PoolMonitorError(
        PoolMonitorErrorCode.MONITOR_ABORTED,
        `Pool monitoring aborted after pool "${first.pool.id}" failed.`,
        {
          poolId: first.pool.id,
          dexId: first.pool.dexId,
          chainId: first.pool.chainId,
          cause: first.error,
        },
      );
    }

    const successes = outcomes.filter(
      (outcome): outcome is ReadOutcome & { readonly state: DexPoolState } =>
        outcome.state !== undefined,
    );

    if (this.options.requireAtLeastOneSuccessfulRead && successes.length === 0) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.POOL_READ_FAILED,
        "All selected pool state reads failed.",
        { details: failures.map((item) => item.error?.message) },
      );
    }

    const attempts: PoolMonitoringAttempt[] = [];
    const events: PoolStateChangeEvent[] = [];
    const states: DexPoolState[] = [];
    let updatedStateCount = 0;
    let unchangedStateCount = 0;
    let staleStateCount = 0;

    for (const outcome of outcomes) {
      if (outcome.error !== undefined || outcome.state === undefined) {
        attempts.push(Object.freeze({
          poolId: outcome.pool.id,
          dexId: outcome.pool.dexId,
          chainId: outcome.pool.chainId,
          outcome: PoolMonitoringOutcome.FAILED,
          startedAtMilliseconds: outcome.startedAtMilliseconds,
          completedAtMilliseconds: outcome.completedAtMilliseconds,
          previousBlockNumber: outcome.previousState?.blockReference.blockNumber,
          previousStateVersion: outcome.previousState?.stateVersion,
          registryUpdated: false,
          stale: false,
          errorCode: outcome.error?.code,
          errorMessage: outcome.error?.message,
        }));
        continue;
      }

      const state = outcome.state;
      const previous = outcome.previousState;
      const stale =
        Number(outcome.completedAtMilliseconds) -
          Number(state.observedAtMilliseconds) >
        this.options.maximumStateAgeMilliseconds;
      const changed =
        previous === undefined ||
        previous.stateVersion !== state.stateVersion ||
        previous.blockReference.blockNumber !== state.blockReference.blockNumber;

      let registryUpdated = false;
      if (this.options.updatePoolRegistry) {
        try {
          this.poolRegistry.setState(state);
          registryUpdated = true;
        } catch (error) {
          throw new PoolMonitorError(
            PoolMonitorErrorCode.REGISTRY_UPDATE_FAILED,
            `Failed to update state for pool "${state.pool.id}".`,
            {
              poolId: state.pool.id,
              dexId: state.pool.dexId,
              chainId: state.pool.chainId,
              cause: error,
            },
          );
        }
      }

      states.push(state);
      if (stale) staleStateCount += 1;
      if (changed) updatedStateCount += 1;
      else unchangedStateCount += 1;

      if (changed) {
        events.push(Object.freeze({
          poolId: state.pool.id,
          dexId: state.pool.dexId,
          chainId: state.pool.chainId,
          previousState: previous,
          currentState: state,
          blockAdvanced:
            previous === undefined ||
            state.blockReference.blockNumber > previous.blockReference.blockNumber,
          stateVersionChanged:
            previous === undefined ||
            state.stateVersion !== previous.stateVersion,
          observedAtMilliseconds: state.observedAtMilliseconds,
        }));
      }

      attempts.push(Object.freeze({
        poolId: state.pool.id,
        dexId: state.pool.dexId,
        chainId: state.pool.chainId,
        outcome: stale
          ? PoolMonitoringOutcome.STALE
          : changed
            ? PoolMonitoringOutcome.UPDATED
            : PoolMonitoringOutcome.UNCHANGED,
        startedAtMilliseconds: outcome.startedAtMilliseconds,
        completedAtMilliseconds: outcome.completedAtMilliseconds,
        previousBlockNumber: previous?.blockReference.blockNumber,
        observedBlockNumber: state.blockReference.blockNumber,
        previousStateVersion: previous?.stateVersion,
        observedStateVersion: state.stateVersion,
        registryUpdated,
        stale,
      }));
    }

    const completedAtMilliseconds = this.clock.nowMilliseconds();

    return Object.freeze({
      monitoredPoolCount: pools.length,
      successfulReadCount: successes.length,
      failedReadCount: failures.length,
      updatedStateCount,
      unchangedStateCount,
      staleStateCount,
      attempts: Object.freeze(attempts),
      events: Object.freeze(events),
      states: Object.freeze(states.sort(compareStates)),
      startedAtMilliseconds,
      completedAtMilliseconds,
      requestedBlockNumber: normalizedRequest.blockNumber,
      metadata: normalizedRequest.metadata,
    });
  }

  public async refreshPool(
    poolId: PoolId,
    blockNumber?: BlockNumber,
  ): Promise<PoolMonitoringAttempt> {
    const snapshot = await this.refresh({
      poolIds: Object.freeze([poolId]),
      blockNumber,
    });
    return snapshot.attempts[0];
  }

  private selectPools(request: PoolMonitorRequest): readonly DexPoolDescriptor[] {
    if (request.poolIds !== undefined) {
      return Object.freeze(
        request.poolIds
          .map((id) => this.poolRegistry.requirePool(id))
          .filter((pool) => this.matchesRequest(pool, request))
          .sort(comparePools),
      );
    }

    const filter: PoolRegistryFilter = {
      chainId: request.chainId,
      activeOnly: request.activeOnly ?? !this.options.includeDisabledPools,
    };

    return Object.freeze(
      this.poolRegistry
        .listPools(filter)
        .filter((pool) => this.matchesRequest(pool, request))
        .sort(comparePools),
    );
  }

  private matchesRequest(
    pool: DexPoolDescriptor,
    request: PoolMonitorRequest,
  ): boolean {
    if (request.chainId !== undefined && pool.chainId !== request.chainId) {
      return false;
    }
    if (request.dexIds !== undefined && !request.dexIds.includes(pool.dexId)) {
      return false;
    }
    if (
      !this.options.includeDisabledPools &&
      (pool.status === PoolStatus.DISABLED || pool.status === PoolStatus.UNSUPPORTED)
    ) {
      return false;
    }
    if (request.activeOnly === true && pool.status !== PoolStatus.ACTIVE) {
      return false;
    }
    return true;
  }

  private async readPool(
    pool: DexPoolDescriptor,
    requestedBlockNumber?: BlockNumber,
  ): Promise<ReadOutcome> {
    const startedAtMilliseconds = this.clock.nowMilliseconds();
    const previousState = this.poolRegistry.getState(pool.id);

    try {
      const entry = this.dexRegistry.getEntry(pool.dexId);
      if (entry === undefined) {
        throw new PoolMonitorError(
          PoolMonitorErrorCode.DEX_NOT_REGISTERED,
          `DEX "${pool.dexId}" is not registered.`,
          { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
        );
      }
      if (entry.adapter === undefined) {
        throw new PoolMonitorError(
          PoolMonitorErrorCode.ADAPTER_NOT_REGISTERED,
          `DEX "${pool.dexId}" has no registered adapter.`,
          { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
        );
      }

      const state = freezeState(
        await (entry.adapter as DexAdapter).readPoolState(
          pool,
          requestedBlockNumber,
        ),
      );
      this.validateState(pool, state, previousState, requestedBlockNumber);

      return Object.freeze({
        pool,
        previousState,
        startedAtMilliseconds,
        completedAtMilliseconds: this.clock.nowMilliseconds(),
        state,
      });
    } catch (error) {
      const normalized = error instanceof PoolMonitorError
        ? error
        : new PoolMonitorError(
            PoolMonitorErrorCode.POOL_READ_FAILED,
            error instanceof Error
              ? error.message
              : `Failed to read pool "${pool.id}" state.`,
            {
              poolId: pool.id,
              dexId: pool.dexId,
              chainId: pool.chainId,
              cause: error,
            },
          );

      return Object.freeze({
        pool,
        previousState,
        startedAtMilliseconds,
        completedAtMilliseconds: this.clock.nowMilliseconds(),
        error: normalized,
      });
    }
  }

  private validateState(
    pool: DexPoolDescriptor,
    state: DexPoolState,
    previousState: DexPoolState | undefined,
    requestedBlockNumber: BlockNumber | undefined,
  ): void {
    if (state === null || typeof state !== "object") {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_POOL_STATE,
        `Adapter returned an invalid state for pool "${pool.id}".`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (state.pool.id !== pool.id) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.POOL_ID_MISMATCH,
        `Returned state pool id does not match "${pool.id}".`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (
      state.pool.chainId !== pool.chainId ||
      state.blockReference.chainId !== pool.chainId
    ) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.CHAIN_MISMATCH,
        `Returned state chain does not match pool "${pool.id}".`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (state.pool.dexId !== pool.dexId) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.DEX_MISMATCH,
        `Returned state DEX does not match pool "${pool.id}".`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (
      this.options.enforceRequestedBlock &&
      requestedBlockNumber !== undefined &&
      state.blockReference.blockNumber !== requestedBlockNumber
    ) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.BLOCK_MISMATCH,
        `Returned state block does not match the requested block for pool "${pool.id}".`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (
      previousState !== undefined &&
      this.options.rejectBlockRegression &&
      state.blockReference.blockNumber < previousState.blockReference.blockNumber
    ) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.BLOCK_REGRESSION,
        `Pool "${pool.id}" state block regressed.`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (
      previousState !== undefined &&
      this.options.rejectObservationTimeRegression &&
      state.observedAtMilliseconds < previousState.observedAtMilliseconds
    ) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.OBSERVATION_TIME_REGRESSION,
        `Pool "${pool.id}" observation time regressed.`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
    if (typeof state.stateVersion !== "string" || state.stateVersion.trim() === "") {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_POOL_STATE,
        `Pool "${pool.id}" state version must be non-empty.`,
        { poolId: pool.id, dexId: pool.dexId, chainId: pool.chainId },
      );
    }
  }
}

export function createPoolMonitor(
  dependencies: PoolMonitorDependencies,
  options: PoolMonitorOptions = {},
): CrossDexArbitragePoolMonitor {
  return new CrossDexArbitragePoolMonitor(dependencies, options);
}

export class FixedPoolMonitorClock implements PoolMonitorClock {
  private current: UnixTimestampMilliseconds;

  public constructor(initialMilliseconds: UnixTimestampMilliseconds) {
    if (!Number.isFinite(initialMilliseconds) || initialMilliseconds < 0) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_OPTIONS,
        "Fixed pool monitor clock value must be non-negative and finite.",
      );
    }
    this.current = initialMilliseconds;
  }

  public nowMilliseconds(): UnixTimestampMilliseconds {
    return this.current;
  }

  public set(value: UnixTimestampMilliseconds): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_OPTIONS,
        "Fixed pool monitor clock value must be non-negative and finite.",
      );
    }
    this.current = value;
  }

  public advance(milliseconds: number): UnixTimestampMilliseconds {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new PoolMonitorError(
        PoolMonitorErrorCode.INVALID_OPTIONS,
        "Clock advancement must be non-negative and finite.",
      );
    }
    this.current = (Number(this.current) + milliseconds) as UnixTimestampMilliseconds;
    return this.current;
  }
}