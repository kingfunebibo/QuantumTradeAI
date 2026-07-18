/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Production-grade deterministic pool discovery orchestration.
 *
 * Responsibilities:
 * - Resolve eligible DEX adapters from the DEX registry.
 * - Execute adapter discovery in deterministic order.
 * - Validate, normalize, deduplicate, and sort discovered pools.
 * - Support bounded concurrency and fail-fast or partial-success modes.
 * - Merge discovered pools into the pool registry.
 * - Preserve incremental block-range discovery metadata.
 * - Return immutable reports suitable for tests, monitoring, and replay.
 *
 * Determinism:
 * - Time is supplied by an injected clock.
 * - DEX execution order and result order are stable.
 * - No random identifiers, timers, filesystem access, or background work.
 */

import {
  type BlockNumber,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type DexAdapter,
  type DexId,
  type DexPoolDescriptor,
  type EvmAddress,
  type PoolDiscoveryRequest,
  type PoolDiscoveryResult,
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
  PoolRegistryError,
  PoolRegistryErrorCode,
} from "./pool-registry";
import {
  createPairKey,
  normalizeEvmAddress,
  normalizeTokenDescriptor,
} from "./token-normalizer";

export enum PoolDiscoveryServiceErrorCode {
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_OPTIONS = "INVALID_OPTIONS",
  NO_ELIGIBLE_DEX = "NO_ELIGIBLE_DEX",
  DEX_NOT_REGISTERED = "DEX_NOT_REGISTERED",
  DEX_DISABLED = "DEX_DISABLED",
  ADAPTER_NOT_REGISTERED = "ADAPTER_NOT_REGISTERED",
  ADAPTER_DISCOVERY_FAILED = "ADAPTER_DISCOVERY_FAILED",
  ADAPTER_RESULT_INVALID = "ADAPTER_RESULT_INVALID",
  CHAIN_MISMATCH = "CHAIN_MISMATCH",
  DEX_MISMATCH = "DEX_MISMATCH",
  TOKEN_FILTER_MISMATCH = "TOKEN_FILTER_MISMATCH",
  BLOCK_RANGE_MISMATCH = "BLOCK_RANGE_MISMATCH",
  DUPLICATE_POOL_ID = "DUPLICATE_POOL_ID",
  DUPLICATE_POOL_ADDRESS = "DUPLICATE_POOL_ADDRESS",
  REGISTRY_UPDATE_FAILED = "REGISTRY_UPDATE_FAILED",
  DISCOVERY_ABORTED = "DISCOVERY_ABORTED",
}

export class PoolDiscoveryServiceError extends Error {
  public readonly code: PoolDiscoveryServiceErrorCode;
  public readonly chainId?: ChainId;
  public readonly dexId?: DexId;
  public readonly poolId?: PoolId;
  public readonly cause?: unknown;
  public readonly details?: unknown;

  public constructor(
    code: PoolDiscoveryServiceErrorCode,
    message: string,
    options: Readonly<{
      chainId?: ChainId;
      dexId?: DexId;
      poolId?: PoolId;
      cause?: unknown;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "PoolDiscoveryServiceError";
    this.code = code;
    this.chainId = options.chainId;
    this.dexId = options.dexId;
    this.poolId = options.poolId;
    this.cause = options.cause;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PoolDiscoveryClock {
  nowMilliseconds(): UnixTimestampMilliseconds;
}

export interface PoolDiscoveryServiceOptions {
  readonly maximumConcurrency?: number;
  readonly continueOnDexFailure?: boolean;
  readonly requireAtLeastOneSuccessfulDex?: boolean;
  readonly includeDisabledDexes?: boolean;
  readonly registerDiscoveredPools?: boolean;
  readonly replaceExistingPools?: boolean;
  readonly rejectConflictingDuplicates?: boolean;
  readonly enforceRequestedTokenFilter?: boolean;
  readonly enforceResultBlockRange?: boolean;
}

export interface NormalizedPoolDiscoveryRequest {
  readonly chainId: ChainId;
  readonly dexIds?: readonly DexId[];
  readonly tokenAddresses?: readonly EvmAddress[];
  readonly fromBlockNumber?: BlockNumber;
  readonly toBlockNumber?: BlockNumber;
  readonly includeDisabledPools: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface DexPoolDiscoveryAttempt {
  readonly dexId: DexId;
  readonly chainId: ChainId;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly success: boolean;
  readonly discoveredPoolCount: number;
  readonly acceptedPoolCount: number;
  readonly rejectedPoolCount: number;
  readonly duplicatePoolCount: number;
  readonly scannedFromBlockNumber?: BlockNumber;
  readonly scannedToBlockNumber?: BlockNumber;
  readonly errorCode?: PoolDiscoveryServiceErrorCode;
  readonly errorMessage?: string;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface RejectedDiscoveredPool {
  readonly dexId: DexId;
  readonly poolId?: PoolId;
  readonly address?: EvmAddress;
  readonly code: PoolDiscoveryServiceErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export interface PoolDiscoveryServiceReport {
  readonly request: NormalizedPoolDiscoveryRequest;
  readonly result: PoolDiscoveryResult;
  readonly attempts: readonly DexPoolDiscoveryAttempt[];
  readonly rejectedPools: readonly RejectedDiscoveredPool[];
  readonly successfulDexCount: number;
  readonly failedDexCount: number;
  readonly discoveredPoolCount: number;
  readonly acceptedPoolCount: number;
  readonly duplicatePoolCount: number;
  readonly registeredPoolCount: number;
  readonly replacedPoolCount: number;
  readonly unchangedPoolCount: number;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface PoolDiscoveryServiceDependencies {
  readonly dexRegistry: CrossDexArbitrageDexRegistry;
  readonly poolRegistry: CrossDexArbitragePoolRegistry;
  readonly clock: PoolDiscoveryClock;
}

interface AdapterDiscoveryOutcome {
  readonly entry: DexRegistryEntry;
  readonly startedAtMilliseconds: UnixTimestampMilliseconds;
  readonly completedAtMilliseconds: UnixTimestampMilliseconds;
  readonly result?: PoolDiscoveryResult;
  readonly error?: PoolDiscoveryServiceError;
}

interface AcceptedPool {
  readonly pool: DexPoolDescriptor;
  readonly sourceDexId: DexId;
}

interface MergeCounters {
  registered: number;
  replaced: number;
  unchanged: number;
}

const DEFAULT_OPTIONS: Required<PoolDiscoveryServiceOptions> =
  Object.freeze({
    maximumConcurrency: 4,
    continueOnDexFailure: true,
    requireAtLeastOneSuccessfulDex: true,
    includeDisabledDexes: false,
    registerDiscoveredPools: true,
    replaceExistingPools: true,
    rejectConflictingDuplicates: true,
    enforceRequestedTokenFilter: true,
    enforceResultBlockRange: true,
  });

function normalizeChainId(value: ChainId | number): ChainId {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_REQUEST,
      "request.chainId must be a positive safe integer.",
      { details: value },
    );
  }

  return numeric as ChainId;
}

function normalizeDexId(value: DexId | string): DexId {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_REQUEST,
      "Every requested DEX id must be a non-empty string.",
      { details: value },
    );
  }

  return value.trim() as DexId;
}

function normalizeBlockNumber(
  value: BlockNumber | undefined,
  field: string,
): BlockNumber | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "bigint" || value < 0n) {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_REQUEST,
      `${field} must be a non-negative bigint.`,
      { details: value },
    );
  }

  return value;
}

function normalizeRequest(
  request: PoolDiscoveryRequest,
): NormalizedPoolDiscoveryRequest {
  if (request === null || typeof request !== "object") {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_REQUEST,
      "Pool discovery request must be an object.",
      { details: request },
    );
  }

  const chainId = normalizeChainId(request.chainId);
  const fromBlockNumber = normalizeBlockNumber(
    request.fromBlockNumber,
    "request.fromBlockNumber",
  );
  const toBlockNumber = normalizeBlockNumber(
    request.toBlockNumber,
    "request.toBlockNumber",
  );

  if (
    fromBlockNumber !== undefined &&
    toBlockNumber !== undefined &&
    fromBlockNumber > toBlockNumber
  ) {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_REQUEST,
      "request.fromBlockNumber cannot exceed request.toBlockNumber.",
      { chainId },
    );
  }

  const dexIds =
    request.dexIds === undefined
      ? undefined
      : Object.freeze(
          [...new Set(request.dexIds.map(normalizeDexId))].sort(
            (left, right) =>
              String(left).localeCompare(String(right)),
          ),
        );

  const tokenAddresses =
    request.tokenAddresses === undefined
      ? undefined
      : Object.freeze(
          [
            ...new Set(
              request.tokenAddresses.map((address) =>
                normalizeEvmAddress(address),
              ),
            ),
          ].sort((left, right) =>
            String(left).localeCompare(String(right)),
          ),
        );

  return Object.freeze({
    chainId,
    dexIds,
    tokenAddresses,
    fromBlockNumber,
    toBlockNumber,
    includeDisabledPools:
      request.includeDisabledPools ?? false,
    metadata:
      request.metadata === undefined
        ? undefined
        : Object.freeze({ ...request.metadata }),
  });
}

function normalizeOptions(
  options: PoolDiscoveryServiceOptions,
): Required<PoolDiscoveryServiceOptions> {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  if (
    !Number.isSafeInteger(merged.maximumConcurrency) ||
    merged.maximumConcurrency <= 0
  ) {
    throw new PoolDiscoveryServiceError(
      PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
      "maximumConcurrency must be a positive safe integer.",
      { details: merged.maximumConcurrency },
    );
  }

  return Object.freeze(merged);
}

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function clonePool(
  pool: DexPoolDescriptor,
): DexPoolDescriptor {
  const token0 = normalizeTokenDescriptor(pool.token0);
  const token1 = normalizeTokenDescriptor(pool.token1);

  return Object.freeze({
    ...pool,
    address: normalizeEvmAddress(pool.address),
    token0,
    token1,
    poolVersion: pool.poolVersion?.trim(),
    metadata: freezeMetadata(pool.metadata),
  });
}

function comparePools(
  left: DexPoolDescriptor,
  right: DexPoolDescriptor,
): number {
  if (left.chainId !== right.chainId) {
    return Number(left.chainId) - Number(right.chainId);
  }

  const dexComparison = String(left.dexId).localeCompare(
    String(right.dexId),
  );

  if (dexComparison !== 0) {
    return dexComparison;
  }

  const addressComparison = String(left.address).localeCompare(
    String(right.address),
  );

  if (addressComparison !== 0) {
    return addressComparison;
  }

  return String(left.id).localeCompare(String(right.id));
}

function createPoolAddressKey(
  chainId: ChainId,
  address: EvmAddress,
): string {
  return `${chainId}:${normalizeEvmAddress(address)}`;
}

function arePoolDescriptorsEquivalent(
  left: DexPoolDescriptor,
  right: DexPoolDescriptor,
): boolean {
  return (
    left.id === right.id &&
    left.chainId === right.chainId &&
    left.dexId === right.dexId &&
    normalizeEvmAddress(left.address) ===
      normalizeEvmAddress(right.address) &&
    createPairKey(left.token0, left.token1) ===
      createPairKey(right.token0, right.token1) &&
    left.liquidityModel === right.liquidityModel &&
    Number(left.feeBasisPoints) === Number(right.feeBasisPoints) &&
    left.tickSpacing === right.tickSpacing &&
    left.poolVersion === right.poolVersion &&
    left.createdBlockNumber === right.createdBlockNumber &&
    left.status === right.status
  );
}

function poolMatchesTokenFilter(
  pool: DexPoolDescriptor,
  tokenAddresses: readonly EvmAddress[],
): boolean {
  const allowed = new Set(
    tokenAddresses.map((address) =>
      String(normalizeEvmAddress(address)),
    ),
  );

  return (
    allowed.has(String(normalizeEvmAddress(pool.token0.address))) ||
    allowed.has(String(normalizeEvmAddress(pool.token1.address)))
  );
}

function normalizeAdapterError(
  error: unknown,
  chainId: ChainId,
  dexId: DexId,
): PoolDiscoveryServiceError {
  if (error instanceof PoolDiscoveryServiceError) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : "DEX adapter pool discovery failed.";

  return new PoolDiscoveryServiceError(
    PoolDiscoveryServiceErrorCode.ADAPTER_DISCOVERY_FAILED,
    message,
    {
      chainId,
      dexId,
      cause: error,
    },
  );
}

async function mapWithConcurrency<TInput, TOutput>(
  values: readonly TInput[],
  maximumConcurrency: number,
  mapper: (
    value: TInput,
    index: number,
  ) => Promise<TOutput>,
): Promise<readonly TOutput[]> {
  if (values.length === 0) {
    return Object.freeze([]);
  }

  const output = new Array<TOutput>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) {
        return;
      }

      output[index] = await mapper(values[index], index);
    }
  }

  const workerCount = Math.min(
    maximumConcurrency,
    values.length,
  );

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  return Object.freeze(output);
}

export class CrossDexArbitragePoolDiscoveryService {
  private readonly dexRegistry: CrossDexArbitrageDexRegistry;
  private readonly poolRegistry: CrossDexArbitragePoolRegistry;
  private readonly clock: PoolDiscoveryClock;
  private readonly options: Required<PoolDiscoveryServiceOptions>;

  public constructor(
    dependencies: PoolDiscoveryServiceDependencies,
    options: PoolDiscoveryServiceOptions = {},
  ) {
    if (
      dependencies === null ||
      typeof dependencies !== "object"
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
        "Pool discovery service dependencies must be provided.",
      );
    }

    if (
      typeof dependencies.clock?.nowMilliseconds !== "function"
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
        "A deterministic discovery clock is required.",
      );
    }

    this.dexRegistry = dependencies.dexRegistry;
    this.poolRegistry = dependencies.poolRegistry;
    this.clock = dependencies.clock;
    this.options = normalizeOptions(options);
  }

  public async discover(
    request: PoolDiscoveryRequest,
  ): Promise<PoolDiscoveryServiceReport> {
    const normalizedRequest = normalizeRequest(request);
    const startedAtMilliseconds =
      this.clock.nowMilliseconds();

    const eligibleEntries = this.resolveEligibleDexes(
      normalizedRequest,
    );

    if (eligibleEntries.length === 0) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.NO_ELIGIBLE_DEX,
        `No eligible DEX adapters are available on chain ${normalizedRequest.chainId}.`,
        { chainId: normalizedRequest.chainId },
      );
    }

    const outcomes = await mapWithConcurrency(
      eligibleEntries,
      this.options.maximumConcurrency,
      async (entry) =>
        this.discoverFromAdapter(
          entry,
          normalizedRequest,
        ),
    );

    const failures = outcomes.filter(
      (outcome) => outcome.error !== undefined,
    );

    if (
      failures.length > 0 &&
      !this.options.continueOnDexFailure
    ) {
      const firstFailure = failures[0].error!;

      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.DISCOVERY_ABORTED,
        `Pool discovery aborted after DEX "${firstFailure.dexId}" failed.`,
        {
          chainId: normalizedRequest.chainId,
          dexId: firstFailure.dexId,
          cause: firstFailure,
        },
      );
    }

    const successfulOutcomes = outcomes.filter(
      (
        outcome,
      ): outcome is AdapterDiscoveryOutcome & {
        readonly result: PoolDiscoveryResult;
      } => outcome.result !== undefined,
    );

    if (
      this.options.requireAtLeastOneSuccessfulDex &&
      successfulOutcomes.length === 0
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.ADAPTER_DISCOVERY_FAILED,
        "All eligible DEX pool discovery attempts failed.",
        {
          chainId: normalizedRequest.chainId,
          details: failures.map((failure) => ({
            dexId: failure.entry.descriptor.id,
            error: failure.error?.message,
          })),
        },
      );
    }

    const {
      acceptedPools,
      rejectedPools,
      duplicatePoolCount,
      attemptCounters,
    } = this.validateAndDeduplicate(
      successfulOutcomes,
      normalizedRequest,
    );

    const mergeCounters: MergeCounters = {
      registered: 0,
      replaced: 0,
      unchanged: 0,
    };

    if (this.options.registerDiscoveredPools) {
      this.mergeIntoPoolRegistry(
        acceptedPools,
        mergeCounters,
      );
    }

    const completedAtMilliseconds =
      this.clock.nowMilliseconds();

    const attempts = Object.freeze(
      outcomes.map((outcome) => {
        const dexId = outcome.entry.descriptor.id;
        const counters = attemptCounters.get(dexId) ?? {
          accepted: 0,
          rejected: 0,
          duplicate: 0,
        };

        return Object.freeze({
          dexId,
          chainId: normalizedRequest.chainId,
          startedAtMilliseconds:
            outcome.startedAtMilliseconds,
          completedAtMilliseconds:
            outcome.completedAtMilliseconds,
          success: outcome.result !== undefined,
          discoveredPoolCount:
            outcome.result?.pools.length ?? 0,
          acceptedPoolCount: counters.accepted,
          rejectedPoolCount: counters.rejected,
          duplicatePoolCount: counters.duplicate,
          scannedFromBlockNumber:
            outcome.result?.scannedFromBlockNumber,
          scannedToBlockNumber:
            outcome.result?.scannedToBlockNumber,
          errorCode: outcome.error?.code,
          errorMessage: outcome.error?.message,
          metadata: freezeMetadata(
            outcome.result?.metadata,
          ),
        });
      }),
    );

    const pools = Object.freeze(
      acceptedPools
        .map((item) => item.pool)
        .sort(comparePools),
    );

    const scannedFromBlockNumber =
      this.selectMinimumBlock(
        successfulOutcomes
          .map(
            (outcome) =>
              outcome.result.scannedFromBlockNumber,
          )
          .filter(
            (
              value,
            ): value is BlockNumber =>
              value !== undefined,
          ),
      ) ?? normalizedRequest.fromBlockNumber;

    const scannedToBlockNumber =
      this.selectMaximumBlock(
        successfulOutcomes
          .map(
            (outcome) =>
              outcome.result.scannedToBlockNumber,
          )
          .filter(
            (
              value,
            ): value is BlockNumber =>
              value !== undefined,
          ),
      ) ?? normalizedRequest.toBlockNumber;

    const result: PoolDiscoveryResult = Object.freeze({
      chainId: normalizedRequest.chainId,
      pools,
      scannedFromBlockNumber,
      scannedToBlockNumber,
      discoveredAtMilliseconds:
        completedAtMilliseconds,
      metadata: Object.freeze({
        successfulDexCount:
          successfulOutcomes.length,
        failedDexCount: failures.length,
        duplicatePoolCount,
      }),
    });

    return Object.freeze({
      request: normalizedRequest,
      result,
      attempts,
      rejectedPools: Object.freeze(rejectedPools),
      successfulDexCount:
        successfulOutcomes.length,
      failedDexCount: failures.length,
      discoveredPoolCount: outcomes.reduce(
        (total, outcome) =>
          total +
          (outcome.result?.pools.length ?? 0),
        0,
      ),
      acceptedPoolCount: pools.length,
      duplicatePoolCount,
      registeredPoolCount:
        mergeCounters.registered,
      replacedPoolCount: mergeCounters.replaced,
      unchangedPoolCount: mergeCounters.unchanged,
      startedAtMilliseconds,
      completedAtMilliseconds,
      metadata: Object.freeze({
        requestedDexCount:
          normalizedRequest.dexIds?.length ??
          eligibleEntries.length,
        eligibleDexCount: eligibleEntries.length,
      }),
    });
  }

  private resolveEligibleDexes(
    request: NormalizedPoolDiscoveryRequest,
  ): readonly DexRegistryEntry[] {
    if (request.dexIds !== undefined) {
      return Object.freeze(
        request.dexIds.map((dexId) => {
          const entry = this.dexRegistry.getEntry(dexId);

          if (entry === undefined) {
            throw new PoolDiscoveryServiceError(
              PoolDiscoveryServiceErrorCode.DEX_NOT_REGISTERED,
              `Requested DEX "${dexId}" is not registered.`,
              {
                chainId: request.chainId,
                dexId,
              },
            );
          }

          if (
            entry.descriptor.chainId !==
            request.chainId
          ) {
            throw new PoolDiscoveryServiceError(
              PoolDiscoveryServiceErrorCode.CHAIN_MISMATCH,
              `DEX "${dexId}" is registered on chain ${entry.descriptor.chainId}, not ${request.chainId}.`,
              {
                chainId: request.chainId,
                dexId,
              },
            );
          }

          if (
            !entry.descriptor.enabled &&
            !this.options.includeDisabledDexes
          ) {
            throw new PoolDiscoveryServiceError(
              PoolDiscoveryServiceErrorCode.DEX_DISABLED,
              `Requested DEX "${dexId}" is disabled.`,
              {
                chainId: request.chainId,
                dexId,
              },
            );
          }

          if (entry.adapter === undefined) {
            throw new PoolDiscoveryServiceError(
              PoolDiscoveryServiceErrorCode.ADAPTER_NOT_REGISTERED,
              `Requested DEX "${dexId}" has no registered adapter.`,
              {
                chainId: request.chainId,
                dexId,
              },
            );
          }

          return entry;
        }),
      );
    }

    return Object.freeze(
      [
        ...this.dexRegistry.listEntries({
          chainId: request.chainId,
          enabledOnly:
            !this.options.includeDisabledDexes,
          requiresAdapter: true,
        }),
      ].sort((left, right) =>
        String(left.descriptor.id).localeCompare(
          String(right.descriptor.id),
        ),
      ),
    );
  }

  private async discoverFromAdapter(
    entry: DexRegistryEntry,
    request: NormalizedPoolDiscoveryRequest,
  ): Promise<AdapterDiscoveryOutcome> {
    const adapter = entry.adapter as DexAdapter;
    const startedAtMilliseconds =
      this.clock.nowMilliseconds();

    try {
      const adapterRequest: PoolDiscoveryRequest =
        Object.freeze({
          chainId: request.chainId,
          dexIds: Object.freeze([
            entry.descriptor.id,
          ]),
          tokenAddresses:
            request.tokenAddresses,
          fromBlockNumber:
            request.fromBlockNumber,
          toBlockNumber:
            request.toBlockNumber,
          includeDisabledPools:
            request.includeDisabledPools,
          metadata: request.metadata,
        });

      const result = await adapter.discoverPools(
        adapterRequest,
      );

      this.validateAdapterResult(
        result,
        entry.descriptor.id,
        request,
      );

      return Object.freeze({
        entry,
        startedAtMilliseconds,
        completedAtMilliseconds:
          this.clock.nowMilliseconds(),
        result: Object.freeze({
          ...result,
          pools: Object.freeze([...result.pools]),
          metadata: freezeMetadata(result.metadata),
        }),
      });
    } catch (error) {
      return Object.freeze({
        entry,
        startedAtMilliseconds,
        completedAtMilliseconds:
          this.clock.nowMilliseconds(),
        error: normalizeAdapterError(
          error,
          request.chainId,
          entry.descriptor.id,
        ),
      });
    }
  }

  private validateAdapterResult(
    result: PoolDiscoveryResult,
    dexId: DexId,
    request: NormalizedPoolDiscoveryRequest,
  ): void {
    if (result === null || typeof result !== "object") {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.ADAPTER_RESULT_INVALID,
        `DEX "${dexId}" returned an invalid pool discovery result.`,
        {
          chainId: request.chainId,
          dexId,
          details: result,
        },
      );
    }

    if (result.chainId !== request.chainId) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.CHAIN_MISMATCH,
        `DEX "${dexId}" returned a result for chain ${result.chainId}.`,
        {
          chainId: request.chainId,
          dexId,
        },
      );
    }

    if (!Array.isArray(result.pools)) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.ADAPTER_RESULT_INVALID,
        `DEX "${dexId}" returned a non-array pools value.`,
        {
          chainId: request.chainId,
          dexId,
        },
      );
    }

    if (
      this.options.enforceResultBlockRange &&
      request.fromBlockNumber !== undefined &&
      result.scannedFromBlockNumber !== undefined &&
      result.scannedFromBlockNumber <
        request.fromBlockNumber
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.BLOCK_RANGE_MISMATCH,
        `DEX "${dexId}" scanned before the requested starting block.`,
        {
          chainId: request.chainId,
          dexId,
        },
      );
    }

    if (
      this.options.enforceResultBlockRange &&
      request.toBlockNumber !== undefined &&
      result.scannedToBlockNumber !== undefined &&
      result.scannedToBlockNumber >
        request.toBlockNumber
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.BLOCK_RANGE_MISMATCH,
        `DEX "${dexId}" scanned beyond the requested ending block.`,
        {
          chainId: request.chainId,
          dexId,
        },
      );
    }
  }

  private validateAndDeduplicate(
    outcomes: readonly (AdapterDiscoveryOutcome & {
      readonly result: PoolDiscoveryResult;
    })[],
    request: NormalizedPoolDiscoveryRequest,
  ): Readonly<{
    acceptedPools: readonly AcceptedPool[];
    rejectedPools: RejectedDiscoveredPool[];
    duplicatePoolCount: number;
    attemptCounters: Map<
      DexId,
      {
        accepted: number;
        rejected: number;
        duplicate: number;
      }
    >;
  }> {
    const acceptedById =
      new Map<PoolId, AcceptedPool>();
    const acceptedByAddress =
      new Map<string, AcceptedPool>();
    const rejectedPools: RejectedDiscoveredPool[] = [];
    const attemptCounters = new Map<
      DexId,
      {
        accepted: number;
        rejected: number;
        duplicate: number;
      }
    >();
    let duplicatePoolCount = 0;

    for (const outcome of outcomes) {
      const dexId = outcome.entry.descriptor.id;
      const counters = {
        accepted: 0,
        rejected: 0,
        duplicate: 0,
      };
      attemptCounters.set(dexId, counters);

      for (const rawPool of outcome.result.pools) {
        try {
          const pool = clonePool(rawPool);

          this.validateDiscoveredPool(
            pool,
            dexId,
            request,
          );

          const addressKey = createPoolAddressKey(
            pool.chainId,
            pool.address,
          );
          const byId = acceptedById.get(pool.id);
          const byAddress =
            acceptedByAddress.get(addressKey);
          const duplicate = byId ?? byAddress;

          if (duplicate !== undefined) {
            duplicatePoolCount += 1;
            counters.duplicate += 1;

            if (
              this.options.rejectConflictingDuplicates &&
              !arePoolDescriptorsEquivalent(
                duplicate.pool,
                pool,
              )
            ) {
              throw new PoolDiscoveryServiceError(
                byId !== undefined
                  ? PoolDiscoveryServiceErrorCode.DUPLICATE_POOL_ID
                  : PoolDiscoveryServiceErrorCode.DUPLICATE_POOL_ADDRESS,
                `Conflicting duplicate pool "${pool.id}" was returned by DEX "${dexId}".`,
                {
                  chainId: request.chainId,
                  dexId,
                  poolId: pool.id,
                  details: {
                    accepted: duplicate.pool,
                    duplicate: pool,
                  },
                },
              );
            }

            continue;
          }

          const accepted = Object.freeze({
            pool,
            sourceDexId: dexId,
          });

          acceptedById.set(pool.id, accepted);
          acceptedByAddress.set(
            addressKey,
            accepted,
          );
          counters.accepted += 1;
        } catch (error) {
          const normalized =
            error instanceof PoolDiscoveryServiceError
              ? error
              : new PoolDiscoveryServiceError(
                  PoolDiscoveryServiceErrorCode.ADAPTER_RESULT_INVALID,
                  error instanceof Error
                    ? error.message
                    : "Discovered pool validation failed.",
                  {
                    chainId: request.chainId,
                    dexId,
                    cause: error,
                  },
                );

          counters.rejected += 1;
          rejectedPools.push(
            Object.freeze({
              dexId,
              poolId:
                rawPool &&
                typeof rawPool === "object"
                  ? rawPool.id
                  : undefined,
              address:
                rawPool &&
                typeof rawPool === "object"
                  ? rawPool.address
                  : undefined,
              code: normalized.code,
              message: normalized.message,
              details: normalized.details,
            }),
          );
        }
      }
    }

    return Object.freeze({
      acceptedPools: Object.freeze(
        [...acceptedById.values()].sort(
          (left, right) =>
            comparePools(left.pool, right.pool),
        ),
      ),
      rejectedPools,
      duplicatePoolCount,
      attemptCounters,
    });
  }

  private validateDiscoveredPool(
    pool: DexPoolDescriptor,
    sourceDexId: DexId,
    request: NormalizedPoolDiscoveryRequest,
  ): void {
    if (pool.chainId !== request.chainId) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.CHAIN_MISMATCH,
        `Pool "${pool.id}" belongs to chain ${pool.chainId}, not ${request.chainId}.`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }

    if (pool.dexId !== sourceDexId) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.DEX_MISMATCH,
        `Pool "${pool.id}" declares DEX "${pool.dexId}" but was returned by "${sourceDexId}".`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }

    if (
      !request.includeDisabledPools &&
      (pool.status === PoolStatus.DISABLED ||
        pool.status === PoolStatus.UNSUPPORTED)
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.ADAPTER_RESULT_INVALID,
        `Pool "${pool.id}" is disabled or unsupported and was not requested.`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }

    if (
      this.options.enforceRequestedTokenFilter &&
      request.tokenAddresses !== undefined &&
      request.tokenAddresses.length > 0 &&
      !poolMatchesTokenFilter(
        pool,
        request.tokenAddresses,
      )
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.TOKEN_FILTER_MISMATCH,
        `Pool "${pool.id}" does not contain a requested token.`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }

    if (
      request.fromBlockNumber !== undefined &&
      pool.createdBlockNumber !== undefined &&
      pool.createdBlockNumber <
        request.fromBlockNumber
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.BLOCK_RANGE_MISMATCH,
        `Pool "${pool.id}" was created before the requested discovery range.`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }

    if (
      request.toBlockNumber !== undefined &&
      pool.createdBlockNumber !== undefined &&
      pool.createdBlockNumber >
        request.toBlockNumber
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.BLOCK_RANGE_MISMATCH,
        `Pool "${pool.id}" was created after the requested discovery range.`,
        {
          chainId: request.chainId,
          dexId: sourceDexId,
          poolId: pool.id,
        },
      );
    }
  }

  private mergeIntoPoolRegistry(
    acceptedPools: readonly AcceptedPool[],
    counters: MergeCounters,
  ): void {
    for (const accepted of acceptedPools) {
      const existing = this.poolRegistry.getPool(
        accepted.pool.id,
      );

      try {
        if (existing === undefined) {
          this.poolRegistry.register(
            accepted.pool,
          );
          counters.registered += 1;
          continue;
        }

        if (
          arePoolDescriptorsEquivalent(
            existing,
            accepted.pool,
          )
        ) {
          counters.unchanged += 1;
          continue;
        }

        if (!this.options.replaceExistingPools) {
          counters.unchanged += 1;
          continue;
        }

        this.poolRegistry.replacePool(
          accepted.pool,
        );
        counters.replaced += 1;
      } catch (error) {
        if (
          error instanceof PoolRegistryError &&
          error.code ===
            PoolRegistryErrorCode.DUPLICATE_POOL_ADDRESS
        ) {
          throw new PoolDiscoveryServiceError(
            PoolDiscoveryServiceErrorCode.DUPLICATE_POOL_ADDRESS,
            error.message,
            {
              chainId: accepted.pool.chainId,
              dexId: accepted.sourceDexId,
              poolId: accepted.pool.id,
              cause: error,
            },
          );
        }

        throw new PoolDiscoveryServiceError(
          PoolDiscoveryServiceErrorCode.REGISTRY_UPDATE_FAILED,
          `Failed to merge discovered pool "${accepted.pool.id}" into the pool registry.`,
          {
            chainId: accepted.pool.chainId,
            dexId: accepted.sourceDexId,
            poolId: accepted.pool.id,
            cause: error,
          },
        );
      }
    }
  }

  private selectMinimumBlock(
    values: readonly BlockNumber[],
  ): BlockNumber | undefined {
    if (values.length === 0) {
      return undefined;
    }

    return values.reduce((minimum, current) =>
      current < minimum ? current : minimum,
    );
  }

  private selectMaximumBlock(
    values: readonly BlockNumber[],
  ): BlockNumber | undefined {
    if (values.length === 0) {
      return undefined;
    }

    return values.reduce((maximum, current) =>
      current > maximum ? current : maximum,
    );
  }
}

export function createPoolDiscoveryService(
  dependencies: PoolDiscoveryServiceDependencies,
  options: PoolDiscoveryServiceOptions = {},
): CrossDexArbitragePoolDiscoveryService {
  return new CrossDexArbitragePoolDiscoveryService(
    dependencies,
    options,
  );
}

export class FixedPoolDiscoveryClock
  implements PoolDiscoveryClock
{
  private current: UnixTimestampMilliseconds;

  public constructor(
    initialMilliseconds: UnixTimestampMilliseconds,
  ) {
    if (
      !Number.isFinite(initialMilliseconds) ||
      initialMilliseconds < 0
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
        "Fixed discovery clock initial value must be non-negative and finite.",
      );
    }

    this.current = initialMilliseconds;
  }

  public nowMilliseconds(): UnixTimestampMilliseconds {
    return this.current;
  }

  public set(
    value: UnixTimestampMilliseconds,
  ): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
        "Fixed discovery clock value must be non-negative and finite.",
      );
    }

    this.current = value;
  }

  public advance(
    milliseconds: number,
  ): UnixTimestampMilliseconds {
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds < 0
    ) {
      throw new PoolDiscoveryServiceError(
        PoolDiscoveryServiceErrorCode.INVALID_OPTIONS,
        "Clock advancement must be non-negative and finite.",
      );
    }

    this.current = (Number(this.current) +
      milliseconds) as UnixTimestampMilliseconds;

    return this.current;
  }
}