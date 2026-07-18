/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic DEX registry.
 *
 * Responsibilities:
 * - Register and unregister DEX descriptors.
 * - Register and unregister concrete DEX adapters.
 * - Enforce deterministic uniqueness by DEX id and chain.
 * - Provide immutable snapshots and filtered lookup operations.
 * - Resolve adapters by chain, protocol family, and capability.
 * - Validate descriptor consistency without performing network access.
 *
 * This module performs no RPC, wallet, filesystem, clock, or background work.
 */

import {
  type ChainId,
  type DexAdapter,
  type DexDescriptor,
  type DexId,
  DexLiquidityModel,
  DexProtocolFamily,
  FlashLiquidityType,
} from "./cross-dex-arbitrage-contracts";

export enum DexRegistryErrorCode {
  INVALID_DESCRIPTOR = "INVALID_DESCRIPTOR",
  INVALID_ADAPTER = "INVALID_ADAPTER",
  DUPLICATE_DEX_ID = "DUPLICATE_DEX_ID",
  DUPLICATE_CHAIN_NAME = "DUPLICATE_CHAIN_NAME",
  DEX_NOT_FOUND = "DEX_NOT_FOUND",
  ADAPTER_NOT_FOUND = "ADAPTER_NOT_FOUND",
  DESCRIPTOR_ADAPTER_MISMATCH = "DESCRIPTOR_ADAPTER_MISMATCH",
  REGISTRY_FROZEN = "REGISTRY_FROZEN",
}

export class DexRegistryError extends Error {
  public readonly code: DexRegistryErrorCode;
  public readonly dexId?: DexId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;

  public constructor(
    code: DexRegistryErrorCode,
    message: string,
    options: Readonly<{
      dexId?: DexId;
      chainId?: ChainId;
      details?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "DexRegistryError";
    this.code = code;
    this.dexId = options.dexId;
    this.chainId = options.chainId;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface DexRegistryEntry {
  readonly descriptor: DexDescriptor;
  readonly adapter?: DexAdapter;
}

export interface DexRegistrySnapshot {
  readonly size: number;
  readonly adapterCount: number;
  readonly descriptors: readonly DexDescriptor[];
  readonly entries: readonly DexRegistryEntry[];
  readonly frozen: boolean;
}

export interface DexRegistryFilter {
  readonly chainId?: ChainId;
  readonly protocolFamily?: DexProtocolFamily;
  readonly liquidityModel?: DexLiquidityModel;
  readonly enabledOnly?: boolean;
  readonly supportsExactInput?: boolean;
  readonly supportsExactOutput?: boolean;
  readonly supportsMultiHop?: boolean;
  readonly supportsFlashSwap?: boolean;
  readonly supportsFeeOnTransferTokens?: boolean;
  readonly requiresAdapter?: boolean;
}

export interface DexCapabilityQuery {
  readonly chainId?: ChainId;
  readonly exactInput?: boolean;
  readonly exactOutput?: boolean;
  readonly multiHop?: boolean;
  readonly flashLiquidityType?: FlashLiquidityType;
  readonly feeOnTransferTokens?: boolean;
  readonly enabledOnly?: boolean;
  readonly requiresAdapter?: boolean;
}

export interface DexRegistryOptions {
  readonly allowDescriptorWithoutAdapter?: boolean;
  readonly rejectDuplicateNamesPerChain?: boolean;
  readonly freezeAfterConstruction?: boolean;
}

function normalizeText(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      `${field} must be a string.`,
      { details: value },
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      `${field} cannot be empty.`,
      { details: value },
    );
  }

  return normalized;
}

function normalizeDexId(value: DexId | string): DexId {
  return normalizeText(value, "dexId") as DexId;
}

function normalizeChainId(value: ChainId | number): ChainId {
  const numeric = Number(value);

  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      "chainId must be a positive safe integer.",
      { details: value },
    );
  }

  return numeric as ChainId;
}

function normalizeAddressLike(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? undefined : normalized;
}

function cloneDescriptor(
  descriptor: DexDescriptor,
): DexDescriptor {
  validateDescriptor(descriptor);

  return Object.freeze({
    ...descriptor,
    id: normalizeDexId(descriptor.id),
    chainId: normalizeChainId(descriptor.chainId),
    name: normalizeText(descriptor.name, "descriptor.name"),
    factoryAddress: normalizeAddressLike(
      descriptor.factoryAddress,
    ) as DexDescriptor["factoryAddress"],
    routerAddress: normalizeAddressLike(
      descriptor.routerAddress,
    ) as DexDescriptor["routerAddress"],
    quoterAddress: normalizeAddressLike(
      descriptor.quoterAddress,
    ) as DexDescriptor["quoterAddress"],
    positionManagerAddress: normalizeAddressLike(
      descriptor.positionManagerAddress,
    ) as DexDescriptor["positionManagerAddress"],
    vaultAddress: normalizeAddressLike(
      descriptor.vaultAddress,
    ) as DexDescriptor["vaultAddress"],
    feeCollectorAddress: normalizeAddressLike(
      descriptor.feeCollectorAddress,
    ) as DexDescriptor["feeCollectorAddress"],
    supportedFeeTiersBasisPoints: Object.freeze(
      [...descriptor.supportedFeeTiersBasisPoints],
    ),
    metadata:
      descriptor.metadata === undefined
        ? undefined
        : Object.freeze({ ...descriptor.metadata }),
  });
}

function validateDescriptor(
  descriptor: DexDescriptor,
): void {
  if (
    descriptor === null ||
    typeof descriptor !== "object"
  ) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      "DEX descriptor must be an object.",
      { details: descriptor },
    );
  }

  normalizeDexId(descriptor.id);
  normalizeChainId(descriptor.chainId);
  normalizeText(descriptor.name, "descriptor.name");

  if (
    !Object.values(DexProtocolFamily).includes(
      descriptor.protocolFamily,
    )
  ) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      "descriptor.protocolFamily is invalid.",
      {
        dexId: descriptor.id,
        chainId: descriptor.chainId,
        details: descriptor.protocolFamily,
      },
    );
  }

  if (
    !Object.values(DexLiquidityModel).includes(
      descriptor.liquidityModel,
    )
  ) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      "descriptor.liquidityModel is invalid.",
      {
        dexId: descriptor.id,
        chainId: descriptor.chainId,
        details: descriptor.liquidityModel,
      },
    );
  }

  if (
    !Array.isArray(
      descriptor.supportedFeeTiersBasisPoints,
    )
  ) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_DESCRIPTOR,
      "descriptor.supportedFeeTiersBasisPoints must be an array.",
      {
        dexId: descriptor.id,
        chainId: descriptor.chainId,
      },
    );
  }

  for (
    const feeTier of descriptor.supportedFeeTiersBasisPoints
  ) {
    const numeric = Number(feeTier);

    if (
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      numeric > 10_000
    ) {
      throw new DexRegistryError(
        DexRegistryErrorCode.INVALID_DESCRIPTOR,
        "Every supported fee tier must be between 0 and 10,000 basis points.",
        {
          dexId: descriptor.id,
          chainId: descriptor.chainId,
          details: feeTier,
        },
      );
    }
  }
}

function validateAdapter(
  adapter: DexAdapter,
): void {
  if (
    adapter === null ||
    typeof adapter !== "object"
  ) {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_ADAPTER,
      "DEX adapter must be an object.",
      { details: adapter },
    );
  }

  validateDescriptor(adapter.descriptor);

  if (typeof adapter.discoverPools !== "function") {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_ADAPTER,
      "DEX adapter must implement discoverPools().",
      { dexId: adapter.descriptor.id },
    );
  }

  if (typeof adapter.readPoolState !== "function") {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_ADAPTER,
      "DEX adapter must implement readPoolState().",
      { dexId: adapter.descriptor.id },
    );
  }

  if (typeof adapter.quote !== "function") {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_ADAPTER,
      "DEX adapter must implement quote().",
      { dexId: adapter.descriptor.id },
    );
  }

  if (typeof adapter.encodeSwap !== "function") {
    throw new DexRegistryError(
      DexRegistryErrorCode.INVALID_ADAPTER,
      "DEX adapter must implement encodeSwap().",
      { dexId: adapter.descriptor.id },
    );
  }
}

function createNameKey(
  chainId: ChainId,
  name: string,
): string {
  return `${chainId}:${name.trim().toLowerCase()}`;
}

function descriptorMatchesFilter(
  descriptor: DexDescriptor,
  hasAdapter: boolean,
  filter: DexRegistryFilter,
): boolean {
  if (
    filter.chainId !== undefined &&
    descriptor.chainId !== filter.chainId
  ) {
    return false;
  }

  if (
    filter.protocolFamily !== undefined &&
    descriptor.protocolFamily !== filter.protocolFamily
  ) {
    return false;
  }

  if (
    filter.liquidityModel !== undefined &&
    descriptor.liquidityModel !== filter.liquidityModel
  ) {
    return false;
  }

  if (
    filter.enabledOnly === true &&
    !descriptor.enabled
  ) {
    return false;
  }

  if (
    filter.supportsExactInput !== undefined &&
    descriptor.supportsExactInput !==
      filter.supportsExactInput
  ) {
    return false;
  }

  if (
    filter.supportsExactOutput !== undefined &&
    descriptor.supportsExactOutput !==
      filter.supportsExactOutput
  ) {
    return false;
  }

  if (
    filter.supportsMultiHop !== undefined &&
    descriptor.supportsMultiHop !==
      filter.supportsMultiHop
  ) {
    return false;
  }

  if (
    filter.supportsFlashSwap !== undefined &&
    descriptor.supportsFlashSwap !==
      filter.supportsFlashSwap
  ) {
    return false;
  }

  if (
    filter.supportsFeeOnTransferTokens !== undefined &&
    descriptor.supportsFeeOnTransferTokens !==
      filter.supportsFeeOnTransferTokens
  ) {
    return false;
  }

  if (
    filter.requiresAdapter === true &&
    !hasAdapter
  ) {
    return false;
  }

  return true;
}

function descriptorSatisfiesCapabilities(
  descriptor: DexDescriptor,
  hasAdapter: boolean,
  query: DexCapabilityQuery,
): boolean {
  if (
    query.chainId !== undefined &&
    descriptor.chainId !== query.chainId
  ) {
    return false;
  }

  if (
    query.enabledOnly !== false &&
    !descriptor.enabled
  ) {
    return false;
  }

  if (
    query.exactInput === true &&
    !descriptor.supportsExactInput
  ) {
    return false;
  }

  if (
    query.exactOutput === true &&
    !descriptor.supportsExactOutput
  ) {
    return false;
  }

  if (
    query.multiHop === true &&
    !descriptor.supportsMultiHop
  ) {
    return false;
  }

  if (
    query.flashLiquidityType ===
      FlashLiquidityType.FLASH_SWAP &&
    !descriptor.supportsFlashSwap
  ) {
    return false;
  }

  if (
    query.feeOnTransferTokens === true &&
    !descriptor.supportsFeeOnTransferTokens
  ) {
    return false;
  }

  if (
    query.requiresAdapter !== false &&
    !hasAdapter
  ) {
    return false;
  }

  return true;
}

export class CrossDexArbitrageDexRegistry {
  private readonly descriptorsById =
    new Map<DexId, DexDescriptor>();

  private readonly adaptersById =
    new Map<DexId, DexAdapter>();

  private readonly dexIdsByChain =
    new Map<ChainId, Set<DexId>>();

  private readonly dexIdByChainAndName =
    new Map<string, DexId>();

  private readonly allowDescriptorWithoutAdapter: boolean;
  private readonly rejectDuplicateNamesPerChain: boolean;
  private frozen = false;

  public constructor(
    entries: readonly DexRegistryEntry[] = [],
    options: DexRegistryOptions = {},
  ) {
    this.allowDescriptorWithoutAdapter =
      options.allowDescriptorWithoutAdapter ?? true;
    this.rejectDuplicateNamesPerChain =
      options.rejectDuplicateNamesPerChain ?? true;

    for (const entry of entries) {
      this.register(entry.descriptor, entry.adapter);
    }

    if (options.freezeAfterConstruction === true) {
      this.freeze();
    }
  }

  public get size(): number {
    return this.descriptorsById.size;
  }

  public get adapterCount(): number {
    return this.adaptersById.size;
  }

  public get isFrozen(): boolean {
    return this.frozen;
  }

  public freeze(): void {
    this.frozen = true;
  }

  public register(
    descriptor: DexDescriptor,
    adapter?: DexAdapter,
  ): DexRegistryEntry {
    this.assertMutable();

    const normalizedDescriptor =
      cloneDescriptor(descriptor);

    if (
      this.descriptorsById.has(normalizedDescriptor.id)
    ) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DUPLICATE_DEX_ID,
        `DEX id "${normalizedDescriptor.id}" is already registered.`,
        {
          dexId: normalizedDescriptor.id,
          chainId: normalizedDescriptor.chainId,
        },
      );
    }

    const nameKey = createNameKey(
      normalizedDescriptor.chainId,
      normalizedDescriptor.name,
    );

    if (
      this.rejectDuplicateNamesPerChain &&
      this.dexIdByChainAndName.has(nameKey)
    ) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DUPLICATE_CHAIN_NAME,
        `A DEX named "${normalizedDescriptor.name}" is already registered on chain ${normalizedDescriptor.chainId}.`,
        {
          dexId: normalizedDescriptor.id,
          chainId: normalizedDescriptor.chainId,
        },
      );
    }

    if (
      adapter === undefined &&
      !this.allowDescriptorWithoutAdapter
    ) {
      throw new DexRegistryError(
        DexRegistryErrorCode.ADAPTER_NOT_FOUND,
        "This registry requires an adapter for every descriptor.",
        {
          dexId: normalizedDescriptor.id,
          chainId: normalizedDescriptor.chainId,
        },
      );
    }

    if (adapter !== undefined) {
      validateAdapter(adapter);
      this.assertDescriptorAdapterMatch(
        normalizedDescriptor,
        adapter,
      );
    }

    this.descriptorsById.set(
      normalizedDescriptor.id,
      normalizedDescriptor,
    );

    if (adapter !== undefined) {
      this.adaptersById.set(
        normalizedDescriptor.id,
        adapter,
      );
    }

    const chainSet =
      this.dexIdsByChain.get(
        normalizedDescriptor.chainId,
      ) ?? new Set<DexId>();

    chainSet.add(normalizedDescriptor.id);
    this.dexIdsByChain.set(
      normalizedDescriptor.chainId,
      chainSet,
    );

    this.dexIdByChainAndName.set(
      nameKey,
      normalizedDescriptor.id,
    );

    return Object.freeze({
      descriptor: normalizedDescriptor,
      adapter,
    });
  }

  public registerAdapter(
    adapter: DexAdapter,
  ): DexRegistryEntry {
    this.assertMutable();
    validateAdapter(adapter);

    const id = normalizeDexId(
      adapter.descriptor.id,
    );

    const existing =
      this.descriptorsById.get(id);

    if (existing === undefined) {
      return this.register(
        adapter.descriptor,
        adapter,
      );
    }

    this.assertDescriptorAdapterMatch(
      existing,
      adapter,
    );

    this.adaptersById.set(id, adapter);

    return Object.freeze({
      descriptor: existing,
      adapter,
    });
  }

  public replaceAdapter(
    adapter: DexAdapter,
  ): DexRegistryEntry {
    this.assertMutable();
    validateAdapter(adapter);

    const id = normalizeDexId(
      adapter.descriptor.id,
    );

    const descriptor =
      this.descriptorsById.get(id);

    if (descriptor === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DEX_NOT_FOUND,
        `Cannot replace adapter because DEX "${id}" is not registered.`,
        { dexId: id },
      );
    }

    this.assertDescriptorAdapterMatch(
      descriptor,
      adapter,
    );

    this.adaptersById.set(id, adapter);

    return Object.freeze({
      descriptor,
      adapter,
    });
  }

  public unregister(
    dexId: DexId | string,
  ): DexRegistryEntry {
    this.assertMutable();

    const id = normalizeDexId(dexId);
    const descriptor =
      this.descriptorsById.get(id);

    if (descriptor === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DEX_NOT_FOUND,
        `DEX "${id}" is not registered.`,
        { dexId: id },
      );
    }

    const adapter = this.adaptersById.get(id);

    this.descriptorsById.delete(id);
    this.adaptersById.delete(id);

    const chainSet =
      this.dexIdsByChain.get(
        descriptor.chainId,
      );

    chainSet?.delete(id);

    if (chainSet !== undefined && chainSet.size === 0) {
      this.dexIdsByChain.delete(
        descriptor.chainId,
      );
    }

    this.dexIdByChainAndName.delete(
      createNameKey(
        descriptor.chainId,
        descriptor.name,
      ),
    );

    return Object.freeze({
      descriptor,
      adapter,
    });
  }

  public unregisterAdapter(
    dexId: DexId | string,
  ): DexAdapter {
    this.assertMutable();

    const id = normalizeDexId(dexId);
    const adapter =
      this.adaptersById.get(id);

    if (adapter === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.ADAPTER_NOT_FOUND,
        `No adapter is registered for DEX "${id}".`,
        { dexId: id },
      );
    }

    this.adaptersById.delete(id);
    return adapter;
  }

  public has(
    dexId: DexId | string,
  ): boolean {
    return this.descriptorsById.has(
      normalizeDexId(dexId),
    );
  }

  public hasAdapter(
    dexId: DexId | string,
  ): boolean {
    return this.adaptersById.has(
      normalizeDexId(dexId),
    );
  }

  public getDescriptor(
    dexId: DexId | string,
  ): DexDescriptor | undefined {
    return this.descriptorsById.get(
      normalizeDexId(dexId),
    );
  }

  public requireDescriptor(
    dexId: DexId | string,
  ): DexDescriptor {
    const id = normalizeDexId(dexId);
    const descriptor =
      this.descriptorsById.get(id);

    if (descriptor === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DEX_NOT_FOUND,
        `DEX "${id}" is not registered.`,
        { dexId: id },
      );
    }

    return descriptor;
  }

  public getAdapter(
    dexId: DexId | string,
  ): DexAdapter | undefined {
    return this.adaptersById.get(
      normalizeDexId(dexId),
    );
  }

  public requireAdapter(
    dexId: DexId | string,
  ): DexAdapter {
    const id = normalizeDexId(dexId);
    const adapter =
      this.adaptersById.get(id);

    if (adapter === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.ADAPTER_NOT_FOUND,
        `No adapter is registered for DEX "${id}".`,
        { dexId: id },
      );
    }

    return adapter;
  }

  public getEntry(
    dexId: DexId | string,
  ): DexRegistryEntry | undefined {
    const id = normalizeDexId(dexId);
    const descriptor =
      this.descriptorsById.get(id);

    if (descriptor === undefined) {
      return undefined;
    }

    return Object.freeze({
      descriptor,
      adapter: this.adaptersById.get(id),
    });
  }

  public requireEntry(
    dexId: DexId | string,
  ): DexRegistryEntry {
    const entry = this.getEntry(dexId);

    if (entry === undefined) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DEX_NOT_FOUND,
        `DEX "${normalizeDexId(dexId)}" is not registered.`,
        { dexId: normalizeDexId(dexId) },
      );
    }

    return entry;
  }

  public findByChainAndName(
    chainId: ChainId | number,
    name: string,
  ): DexRegistryEntry | undefined {
    const normalizedChainId =
      normalizeChainId(chainId);

    const id = this.dexIdByChainAndName.get(
      createNameKey(
        normalizedChainId,
        normalizeText(name, "name"),
      ),
    );

    return id === undefined
      ? undefined
      : this.getEntry(id);
  }

  public listDescriptors(
    filter: DexRegistryFilter = {},
  ): readonly DexDescriptor[] {
    const normalizedFilter =
      this.normalizeFilter(filter);

    return Object.freeze(
      [...this.descriptorsById.values()]
        .filter((descriptor) =>
          descriptorMatchesFilter(
            descriptor,
            this.adaptersById.has(descriptor.id),
            normalizedFilter,
          ),
        )
        .sort(compareDexDescriptors),
    );
  }

  public listEntries(
    filter: DexRegistryFilter = {},
  ): readonly DexRegistryEntry[] {
    return Object.freeze(
      this.listDescriptors(filter).map(
        (descriptor) =>
          Object.freeze({
            descriptor,
            adapter:
              this.adaptersById.get(
                descriptor.id,
              ),
          }),
      ),
    );
  }

  public listAdapters(
    filter: DexRegistryFilter = {},
  ): readonly DexAdapter[] {
    return Object.freeze(
      this.listDescriptors({
        ...filter,
        requiresAdapter: true,
      }).map((descriptor) =>
        this.requireAdapter(descriptor.id),
      ),
    );
  }

  public listByChain(
    chainId: ChainId | number,
    options: Readonly<{
      enabledOnly?: boolean;
      requiresAdapter?: boolean;
    }> = {},
  ): readonly DexRegistryEntry[] {
    return this.listEntries({
      chainId: normalizeChainId(chainId),
      enabledOnly: options.enabledOnly,
      requiresAdapter:
        options.requiresAdapter,
    });
  }

  public findCapable(
    query: DexCapabilityQuery = {},
  ): readonly DexRegistryEntry[] {
    const normalizedQuery:
      DexCapabilityQuery = {
        ...query,
        chainId:
          query.chainId === undefined
            ? undefined
            : normalizeChainId(
                query.chainId,
              ),
      };

    return Object.freeze(
      [...this.descriptorsById.values()]
        .filter((descriptor) =>
          descriptorSatisfiesCapabilities(
            descriptor,
            this.adaptersById.has(descriptor.id),
            normalizedQuery,
          ),
        )
        .sort(compareDexDescriptors)
        .map((descriptor) =>
          Object.freeze({
            descriptor,
            adapter:
              this.adaptersById.get(
                descriptor.id,
              ),
          }),
        ),
    );
  }

  public snapshot(): DexRegistrySnapshot {
    const descriptors = this.listDescriptors();
    const entries = Object.freeze(
      descriptors.map((descriptor) =>
        Object.freeze({
          descriptor,
          adapter:
            this.adaptersById.get(
              descriptor.id,
            ),
        }),
      ),
    );

    return Object.freeze({
      size: descriptors.length,
      adapterCount: this.adaptersById.size,
      descriptors,
      entries,
      frozen: this.frozen,
    });
  }

  public clear(): void {
    this.assertMutable();

    this.descriptorsById.clear();
    this.adaptersById.clear();
    this.dexIdsByChain.clear();
    this.dexIdByChainAndName.clear();
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new DexRegistryError(
        DexRegistryErrorCode.REGISTRY_FROZEN,
        "The DEX registry is frozen and cannot be modified.",
      );
    }
  }

  private assertDescriptorAdapterMatch(
    descriptor: DexDescriptor,
    adapter: DexAdapter,
  ): void {
    const adapterDescriptor =
      cloneDescriptor(adapter.descriptor);

    const matches =
      descriptor.id === adapterDescriptor.id &&
      descriptor.chainId ===
        adapterDescriptor.chainId &&
      descriptor.protocolFamily ===
        adapterDescriptor.protocolFamily &&
      descriptor.liquidityModel ===
        adapterDescriptor.liquidityModel;

    if (!matches) {
      throw new DexRegistryError(
        DexRegistryErrorCode.DESCRIPTOR_ADAPTER_MISMATCH,
        "The adapter descriptor does not match the registered DEX descriptor.",
        {
          dexId: descriptor.id,
          chainId: descriptor.chainId,
          details: {
            registered: descriptor,
            adapter: adapterDescriptor,
          },
        },
      );
    }
  }

  private normalizeFilter(
    filter: DexRegistryFilter,
  ): DexRegistryFilter {
    return {
      ...filter,
      chainId:
        filter.chainId === undefined
          ? undefined
          : normalizeChainId(filter.chainId),
    };
  }
}

export function compareDexDescriptors(
  left: DexDescriptor,
  right: DexDescriptor,
): number {
  if (left.chainId !== right.chainId) {
    return Number(left.chainId) -
      Number(right.chainId);
  }

  const nameComparison =
    left.name.localeCompare(right.name);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return String(left.id).localeCompare(
    String(right.id),
  );
}

export function createDexRegistry(
  entries: readonly DexRegistryEntry[] = [],
  options: DexRegistryOptions = {},
): CrossDexArbitrageDexRegistry {
  return new CrossDexArbitrageDexRegistry(
    entries,
    options,
  );
}