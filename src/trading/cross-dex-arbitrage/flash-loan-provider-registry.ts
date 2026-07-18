/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic flash-loan and flash-swap provider registry.
 *
 * Responsibilities:
 * - Register provider descriptors and concrete provider adapters.
 * - Enforce deterministic uniqueness and descriptor/provider consistency.
 * - Resolve providers by chain, protocol, liquidity type, token support,
 *   premium, multi-asset capability, and enabled state.
 * - Validate availability and collect quotes without hiding provider failures.
 * - Deterministically select the best valid liquidity quote.
 * - Produce immutable registry snapshots and selection reports.
 *
 * This module performs no RPC, wallet, filesystem, timer, or background work
 * by itself. Network operations occur only when explicitly invoking registered
 * provider adapters through quote or availability methods.
 */

import {
  type BasisPoints,
  type ChainId,
  type CrossDexArbitrageMetadata,
  type EvmAddress,
  type FlashLiquidityProvider,
  type FlashLiquidityQuote,
  type FlashLiquidityRequest,
  FlashLiquidityType,
  type FlashLoanProviderDescriptor,
  type FlashLoanProviderId,
  type FlashLoanProtocol,
  type TokenAmount,
  type TokenDescriptor,
  type UnixTimestampMilliseconds,
  type ValidationIssue,
  type ValidationResult,
  ValidationSeverity,
} from "./cross-dex-arbitrage-contracts";

export enum FlashLoanProviderRegistryErrorCode {
  INVALID_DESCRIPTOR = "INVALID_DESCRIPTOR",
  INVALID_PROVIDER = "INVALID_PROVIDER",
  DUPLICATE_PROVIDER_ID = "DUPLICATE_PROVIDER_ID",
  DUPLICATE_CHAIN_NAME = "DUPLICATE_CHAIN_NAME",
  PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND",
  ADAPTER_NOT_FOUND = "ADAPTER_NOT_FOUND",
  DESCRIPTOR_ADAPTER_MISMATCH = "DESCRIPTOR_ADAPTER_MISMATCH",
  UNSUPPORTED_TOKEN = "UNSUPPORTED_TOKEN",
  UNSUPPORTED_LIQUIDITY_TYPE = "UNSUPPORTED_LIQUIDITY_TYPE",
  NO_ELIGIBLE_PROVIDER = "NO_ELIGIBLE_PROVIDER",
  NO_VALID_QUOTE = "NO_VALID_QUOTE",
  INVALID_REQUEST = "INVALID_REQUEST",
  REGISTRY_FROZEN = "REGISTRY_FROZEN",
}

export class FlashLoanProviderRegistryError extends Error {
  public readonly code: FlashLoanProviderRegistryErrorCode;
  public readonly providerId?: FlashLoanProviderId;
  public readonly chainId?: ChainId;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  public constructor(
    code: FlashLoanProviderRegistryErrorCode,
    message: string,
    options: Readonly<{
      providerId?: FlashLoanProviderId;
      chainId?: ChainId;
      details?: unknown;
      cause?: unknown;
    }> = {},
  ) {
    super(message);
    this.name = "FlashLoanProviderRegistryError";
    this.code = code;
    this.providerId = options.providerId;
    this.chainId = options.chainId;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface FlashLoanProviderRegistryEntry {
  readonly descriptor: FlashLoanProviderDescriptor;
  readonly provider?: FlashLiquidityProvider;
}

export interface FlashLoanProviderRegistrySnapshot {
  readonly size: number;
  readonly adapterCount: number;
  readonly descriptors: readonly FlashLoanProviderDescriptor[];
  readonly entries: readonly FlashLoanProviderRegistryEntry[];
  readonly frozen: boolean;
}

export interface FlashLoanProviderRegistryOptions {
  readonly allowDescriptorWithoutProvider?: boolean;
  readonly rejectDuplicateNamesPerChain?: boolean;
  readonly freezeAfterConstruction?: boolean;
  readonly requireEnabledProviderForResolution?: boolean;
}

export interface FlashLoanProviderFilter {
  readonly chainId?: ChainId;
  readonly protocol?: FlashLoanProtocol;
  readonly liquidityType?: FlashLiquidityType;
  readonly tokenAddress?: EvmAddress;
  readonly maximumPremiumBasisPoints?: BasisPoints;
  readonly supportsMultiAsset?: boolean;
  readonly enabledOnly?: boolean;
  readonly requiresAdapter?: boolean;
}

export interface FlashLoanProviderSelectionRequest {
  readonly chainId: ChainId;
  readonly asset: TokenDescriptor;
  readonly amount: TokenAmount;
  readonly liquidityType?: FlashLiquidityType;
  readonly preferredProtocols?: readonly FlashLoanProtocol[];
  readonly excludedProviderIds?: readonly FlashLoanProviderId[];
  readonly maximumPremiumBasisPoints?: BasisPoints;
  readonly requireMultiAssetSupport?: boolean;
  readonly requireEnabled?: boolean;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLoanProviderCandidate {
  readonly descriptor: FlashLoanProviderDescriptor;
  readonly provider: FlashLiquidityProvider;
  readonly preferenceIndex: number;
}

export interface FlashLoanProviderSelectionResult {
  readonly request: FlashLoanProviderSelectionRequest;
  readonly candidates: readonly FlashLoanProviderCandidate[];
  readonly selected?: FlashLoanProviderCandidate;
  readonly rejectedProviderIds: readonly FlashLoanProviderId[];
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityQuoteCandidate {
  readonly descriptor: FlashLoanProviderDescriptor;
  readonly quote?: FlashLiquidityQuote;
  readonly validation?: ValidationResult;
  readonly valid: boolean;
  readonly rejectionReasons: readonly string[];
  readonly error?: unknown;
}

export interface FlashLiquidityQuoteSelectionRequest {
  readonly request: Omit<FlashLiquidityRequest, "providerId">;
  readonly preferredProtocols?: readonly FlashLoanProtocol[];
  readonly excludedProviderIds?: readonly FlashLoanProviderId[];
  readonly maximumPremiumBasisPoints?: BasisPoints;
  readonly requireMultiAssetSupport?: boolean;
  readonly requireAvailabilityValidation?: boolean;
  readonly nowMilliseconds?: UnixTimestampMilliseconds;
  readonly metadata?: CrossDexArbitrageMetadata;
}

export interface FlashLiquidityQuoteSelectionResult {
  readonly request: FlashLiquidityQuoteSelectionRequest;
  readonly candidates: readonly FlashLiquidityQuoteCandidate[];
  readonly selected?: FlashLiquidityQuoteCandidate;
  readonly evaluatedProviderCount: number;
  readonly validQuoteCount: number;
  readonly metadata?: CrossDexArbitrageMetadata;
}

interface NormalizedRegistryOptions {
  readonly allowDescriptorWithoutProvider: boolean;
  readonly rejectDuplicateNamesPerChain: boolean;
  readonly freezeAfterConstruction: boolean;
  readonly requireEnabledProviderForResolution: boolean;
}

const DEFAULT_OPTIONS: NormalizedRegistryOptions =
  Object.freeze({
    allowDescriptorWithoutProvider: true,
    rejectDuplicateNamesPerChain: true,
    freezeAfterConstruction: false,
    requireEnabledProviderForResolution: true,
  });

function freezeMetadata(
  metadata: CrossDexArbitrageMetadata | undefined,
): CrossDexArbitrageMetadata | undefined {
  return metadata === undefined
    ? undefined
    : Object.freeze({ ...metadata });
}

function normalizeText(
  value: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new FlashLoanProviderRegistryError(
      FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
      `${field} must be a string.`,
      { details: value },
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new FlashLoanProviderRegistryError(
      FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
      `${field} cannot be empty.`,
      { details: value },
    );
  }

  return normalized;
}

function normalizeAddress(
  value: EvmAddress,
  field: string,
): EvmAddress {
  const normalized = normalizeText(
    value,
    field,
  ).toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new FlashLoanProviderRegistryError(
      FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
      `${field} must be a valid 20-byte EVM address.`,
      { details: value },
    );
  }

  return normalized as EvmAddress;
}

function tokenAddressKey(
  address: EvmAddress,
): string {
  return String(address).toLowerCase();
}

function providerNameKey(
  descriptor: FlashLoanProviderDescriptor,
): string {
  return `${Number(descriptor.chainId)}:${descriptor.name
    .trim()
    .toLowerCase()}`;
}

function descriptorSort(
  left: FlashLoanProviderDescriptor,
  right: FlashLoanProviderDescriptor,
): number {
  if (left.chainId !== right.chainId) {
    return Number(left.chainId) -
      Number(right.chainId);
  }

  if (
    left.premiumBasisPoints !==
    right.premiumBasisPoints
  ) {
    return (
      left.premiumBasisPoints -
      right.premiumBasisPoints
    );
  }

  const protocolComparison =
    String(left.protocol).localeCompare(
      String(right.protocol),
    );

  if (protocolComparison !== 0) {
    return protocolComparison;
  }

  return String(left.id).localeCompare(
    String(right.id),
  );
}

function cloneDescriptor(
  descriptor: FlashLoanProviderDescriptor,
): FlashLoanProviderDescriptor {
  return Object.freeze({
    ...descriptor,
    providerAddress: normalizeAddress(
      descriptor.providerAddress,
      "descriptor.providerAddress",
    ),
    callbackSelector:
      descriptor.callbackSelector,
    supportedTokenAddresses:
      descriptor.supportedTokenAddresses ===
      undefined
        ? undefined
        : Object.freeze(
            descriptor.supportedTokenAddresses.map(
              (address) =>
                normalizeAddress(
                  address,
                  "descriptor.supportedTokenAddresses[]",
                ),
            ),
          ),
    metadata: freezeMetadata(
      descriptor.metadata,
    ),
  });
}

function hasErrorIssues(
  validation: ValidationResult,
): boolean {
  return validation.issues.some(
    (issue: ValidationIssue) =>
      issue.severity === ValidationSeverity.ERROR ||
      issue.severity === ValidationSeverity.FATAL,
  );
}

function validationReasons(
  validation: ValidationResult,
): readonly string[] {
  return Object.freeze(
    validation.issues.map(
      (issue: ValidationIssue) =>
        `${issue.code}: ${issue.message}`,
    ),
  );
}

export class FlashLoanProviderRegistry {
  private readonly entries =
    new Map<
      FlashLoanProviderId,
      FlashLoanProviderRegistryEntry
    >();

  private readonly options: NormalizedRegistryOptions;
  private frozen = false;

  public constructor(
    initialEntries:
      readonly FlashLoanProviderRegistryEntry[] = [],
    options: FlashLoanProviderRegistryOptions = {},
  ) {
    this.options = Object.freeze({
      ...DEFAULT_OPTIONS,
      ...options,
    });

    for (const entry of initialEntries) {
      this.registerEntry(entry);
    }

    if (this.options.freezeAfterConstruction) {
      this.freeze();
    }
  }

  public get size(): number {
    return this.entries.size;
  }

  public get adapterCount(): number {
    let count = 0;

    for (const entry of this.entries.values()) {
      if (entry.provider !== undefined) {
        count += 1;
      }
    }

    return count;
  }

  public get isFrozen(): boolean {
    return this.frozen;
  }

  public registerDescriptor(
    descriptor: FlashLoanProviderDescriptor,
  ): FlashLoanProviderDescriptor {
    this.assertMutable();

    const normalized =
      this.validateAndCloneDescriptor(
        descriptor,
      );

    this.assertUniqueDescriptor(normalized);

    this.entries.set(
      normalized.id,
      Object.freeze({
        descriptor: normalized,
      }),
    );

    return normalized;
  }

  public registerProvider(
    provider: FlashLiquidityProvider,
  ): FlashLoanProviderRegistryEntry {
    this.assertMutable();
    this.validateProvider(provider);

    const descriptor =
      this.validateAndCloneDescriptor(
        provider.descriptor,
      );

    const existing = this.entries.get(
      descriptor.id,
    );

    if (existing !== undefined) {
      this.assertDescriptorMatches(
        existing.descriptor,
        descriptor,
      );

      const updated =
        Object.freeze({
          descriptor: existing.descriptor,
          provider,
        });

      this.entries.set(
        descriptor.id,
        updated,
      );

      return updated;
    }

    this.assertUniqueDescriptor(descriptor);

    const entry =
      Object.freeze({
        descriptor,
        provider,
      });

    this.entries.set(descriptor.id, entry);

    return entry;
  }

  public registerEntry(
    entry: FlashLoanProviderRegistryEntry,
  ): FlashLoanProviderRegistryEntry {
    if (
      entry === null ||
      typeof entry !== "object"
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_PROVIDER,
        "Registry entry must be an object.",
        { details: entry },
      );
    }

    if (entry.provider !== undefined) {
      return this.registerProvider(
        entry.provider,
      );
    }

    if (
      !this.options.allowDescriptorWithoutProvider
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.ADAPTER_NOT_FOUND,
        "Descriptor-only registration is disabled.",
        {
          providerId: entry.descriptor.id,
          chainId: entry.descriptor.chainId,
        },
      );
    }

    const descriptor =
      this.registerDescriptor(
        entry.descriptor,
      );

    return Object.freeze({ descriptor });
  }

  public unregister(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderRegistryEntry {
    this.assertMutable();

    const existing = this.entries.get(providerId);

    if (existing === undefined) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.PROVIDER_NOT_FOUND,
        `Flash liquidity provider "${providerId}" is not registered.`,
        { providerId },
      );
    }

    this.entries.delete(providerId);

    return existing;
  }

  public attachProvider(
    providerId: FlashLoanProviderId,
    provider: FlashLiquidityProvider,
  ): FlashLoanProviderRegistryEntry {
    this.assertMutable();
    this.validateProvider(provider);

    const existing = this.requireEntry(
      providerId,
    );

    if (
      provider.descriptor.id !== providerId
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.DESCRIPTOR_ADAPTER_MISMATCH,
        "Provider adapter ID does not match requested registry entry.",
        {
          providerId,
          chainId:
            existing.descriptor.chainId,
          details: provider.descriptor.id,
        },
      );
    }

    const normalized =
      this.validateAndCloneDescriptor(
        provider.descriptor,
      );

    this.assertDescriptorMatches(
      existing.descriptor,
      normalized,
    );

    const updated =
      Object.freeze({
        descriptor: existing.descriptor,
        provider,
      });

    this.entries.set(providerId, updated);

    return updated;
  }

  public detachProvider(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderRegistryEntry {
    this.assertMutable();

    const existing = this.requireEntry(
      providerId,
    );

    if (existing.provider === undefined) {
      return existing;
    }

    if (
      !this.options.allowDescriptorWithoutProvider
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.ADAPTER_NOT_FOUND,
        "Provider cannot be detached because descriptor-only entries are disabled.",
        {
          providerId,
          chainId:
            existing.descriptor.chainId,
        },
      );
    }

    const updated =
      Object.freeze({
        descriptor: existing.descriptor,
      });

    this.entries.set(providerId, updated);

    return updated;
  }

  public freeze(): void {
    this.frozen = true;
  }

  public has(
    providerId: FlashLoanProviderId,
  ): boolean {
    return this.entries.has(providerId);
  }

  public getEntry(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderRegistryEntry | undefined {
    return this.entries.get(providerId);
  }

  public requireEntry(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderRegistryEntry {
    const entry = this.entries.get(providerId);

    if (entry === undefined) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.PROVIDER_NOT_FOUND,
        `Flash liquidity provider "${providerId}" is not registered.`,
        { providerId },
      );
    }

    return entry;
  }

  public getDescriptor(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderDescriptor | undefined {
    return this.entries.get(providerId)
      ?.descriptor;
  }

  public requireDescriptor(
    providerId: FlashLoanProviderId,
  ): FlashLoanProviderDescriptor {
    return this.requireEntry(providerId)
      .descriptor;
  }

  public getProvider(
    providerId: FlashLoanProviderId,
  ): FlashLiquidityProvider | undefined {
    return this.entries.get(providerId)
      ?.provider;
  }

  public requireProvider(
    providerId: FlashLoanProviderId,
  ): FlashLiquidityProvider {
    const entry = this.requireEntry(
      providerId,
    );

    if (entry.provider === undefined) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.ADAPTER_NOT_FOUND,
        `Provider adapter "${providerId}" is not registered.`,
        {
          providerId,
          chainId:
            entry.descriptor.chainId,
        },
      );
    }

    if (
      this.options
        .requireEnabledProviderForResolution &&
      !entry.descriptor.enabled
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.NO_ELIGIBLE_PROVIDER,
        `Provider "${providerId}" is disabled.`,
        {
          providerId,
          chainId:
            entry.descriptor.chainId,
        },
      );
    }

    return entry.provider;
  }

  public list(
    filter: FlashLoanProviderFilter = {},
  ): readonly FlashLoanProviderDescriptor[] {
    const values = [...this.entries.values()]
      .filter((entry) =>
        this.matchesFilter(entry, filter),
      )
      .map((entry) => entry.descriptor)
      .sort(descriptorSort);

    return Object.freeze(values);
  }

  public listEntries(
    filter: FlashLoanProviderFilter = {},
  ): readonly FlashLoanProviderRegistryEntry[] {
    const values = [...this.entries.values()]
      .filter((entry) =>
        this.matchesFilter(entry, filter),
      )
      .sort((left, right) =>
        descriptorSort(
          left.descriptor,
          right.descriptor,
        ),
      );

    return Object.freeze(values);
  }

  public snapshot(): FlashLoanProviderRegistrySnapshot {
    const entries = this.listEntries();
    const descriptors = Object.freeze(
      entries.map(
        (entry) => entry.descriptor,
      ),
    );

    return Object.freeze({
      size: this.size,
      adapterCount: this.adapterCount,
      descriptors,
      entries,
      frozen: this.frozen,
    });
  }

  public supportsToken(
    providerId: FlashLoanProviderId,
    token: TokenDescriptor | EvmAddress,
  ): boolean {
    const descriptor =
      this.requireDescriptor(providerId);
    const address =
      typeof token === "string"
        ? token
        : token.address;

    if (
      descriptor.supportedTokenAddresses ===
      undefined
    ) {
      return true;
    }

    const key = tokenAddressKey(address);

    return descriptor.supportedTokenAddresses.some(
      (supported) =>
        tokenAddressKey(supported) === key,
    );
  }

  public selectCandidates(
    request: FlashLoanProviderSelectionRequest,
  ): FlashLoanProviderSelectionResult {
    this.validateSelectionRequest(request);

    const excluded = new Set(
      request.excludedProviderIds ?? [],
    );
    const preferredProtocols =
      request.preferredProtocols ?? [];
    const rejectedProviderIds:
      FlashLoanProviderId[] = [];

    const candidates: FlashLoanProviderCandidate[] =
      [];

    for (const entry of this.entries.values()) {
      const descriptor = entry.descriptor;

      const eligible =
        descriptor.chainId === request.chainId &&
        entry.provider !== undefined &&
        !excluded.has(descriptor.id) &&
        (request.requireEnabled ?? true
          ? descriptor.enabled
          : true) &&
        (request.liquidityType === undefined ||
          descriptor.liquidityType ===
            request.liquidityType) &&
        (request.maximumPremiumBasisPoints ===
          undefined ||
          descriptor.premiumBasisPoints <=
            request.maximumPremiumBasisPoints) &&
        (request.requireMultiAssetSupport !==
          true ||
          descriptor.supportsMultiAsset) &&
        this.supportsDescriptorToken(
          descriptor,
          request.asset.address,
        );

      if (!eligible) {
        rejectedProviderIds.push(
          descriptor.id,
        );
        continue;
      }

      const preferenceIndex =
        preferredProtocols.length === 0
          ? Number.MAX_SAFE_INTEGER
          : preferredProtocols.indexOf(
              descriptor.protocol,
            );

      candidates.push(
        Object.freeze({
          descriptor,
          provider: entry.provider!,
          preferenceIndex:
            preferenceIndex < 0
              ? Number.MAX_SAFE_INTEGER
              : preferenceIndex,
        }),
      );
    }

    candidates.sort((left, right) => {
      if (
        left.preferenceIndex !==
        right.preferenceIndex
      ) {
        return (
          left.preferenceIndex -
          right.preferenceIndex
        );
      }

      return descriptorSort(
        left.descriptor,
        right.descriptor,
      );
    });

    return Object.freeze({
      request: Object.freeze({
        ...request,
        preferredProtocols:
          request.preferredProtocols ===
          undefined
            ? undefined
            : Object.freeze([
                ...request.preferredProtocols,
              ]),
        excludedProviderIds:
          request.excludedProviderIds ===
          undefined
            ? undefined
            : Object.freeze([
                ...request.excludedProviderIds,
              ]),
        metadata: freezeMetadata(
          request.metadata,
        ),
      }),
      candidates: Object.freeze(candidates),
      selected: candidates[0],
      rejectedProviderIds: Object.freeze(
        rejectedProviderIds.sort(
          (left, right) =>
            String(left).localeCompare(
              String(right),
            ),
        ),
      ),
      metadata: freezeMetadata(
        request.metadata,
      ),
    });
  }

  public async selectBestQuote(
    selection:
      FlashLiquidityQuoteSelectionRequest,
  ): Promise<FlashLiquidityQuoteSelectionResult> {
    const candidateSelection =
      this.selectCandidates({
        chainId: selection.request.chainId,
        asset: selection.request.asset,
        amount: selection.request.amount,
        liquidityType:
          selection.request.liquidityType,
        preferredProtocols:
          selection.preferredProtocols,
        excludedProviderIds:
          selection.excludedProviderIds,
        maximumPremiumBasisPoints:
          selection.maximumPremiumBasisPoints,
        requireMultiAssetSupport:
          selection.requireMultiAssetSupport,
        requireEnabled: true,
        metadata: selection.metadata,
      });

    const nowMilliseconds =
      selection.nowMilliseconds;

    if (
      nowMilliseconds !== undefined &&
      (!Number.isFinite(nowMilliseconds) ||
        nowMilliseconds < 0)
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "nowMilliseconds must be a non-negative finite timestamp.",
        { details: nowMilliseconds },
      );
    }

    const candidates:
      FlashLiquidityQuoteCandidate[] = [];

    for (const candidate of candidateSelection.candidates) {
      const request: FlashLiquidityRequest =
        Object.freeze({
          ...selection.request,
          providerId:
            candidate.descriptor.id,
          metadata: freezeMetadata(
            selection.request.metadata,
          ),
        });

      let validation:
        ValidationResult | undefined;

      try {
        if (
          selection.requireAvailabilityValidation ??
          true
        ) {
          validation =
            await candidate.provider.validateAvailability(
              request,
            );

          if (
            !validation.valid ||
            hasErrorIssues(validation)
          ) {
            candidates.push(
              Object.freeze({
                descriptor:
                  candidate.descriptor,
                validation,
                valid: false,
                rejectionReasons:
                  validationReasons(validation),
              }),
            );
            continue;
          }
        }

        const quote =
          await candidate.provider.quote(
            request,
          );
        const reasons =
          this.validateQuote(
            quote,
            request,
            nowMilliseconds,
          );

        candidates.push(
          Object.freeze({
            descriptor:
              candidate.descriptor,
            quote,
            validation,
            valid: reasons.length === 0,
            rejectionReasons:
              Object.freeze(reasons),
          }),
        );
      } catch (error) {
        candidates.push(
          Object.freeze({
            descriptor:
              candidate.descriptor,
            validation,
            valid: false,
            rejectionReasons:
              Object.freeze([
                error instanceof Error
                  ? error.message
                  : "Provider quote failed.",
              ]),
            error,
          }),
        );
      }
    }

    const validCandidates = candidates
      .filter(
        (
          candidate,
        ): candidate is FlashLiquidityQuoteCandidate & {
          readonly quote: FlashLiquidityQuote;
        } =>
          candidate.valid &&
          candidate.quote !== undefined,
      )
      .sort((left, right) =>
        this.compareQuoteCandidates(
          left,
          right,
          selection.preferredProtocols ??
            [],
        ),
      );

    return Object.freeze({
      request: Object.freeze({
        ...selection,
        preferredProtocols:
          selection.preferredProtocols ===
          undefined
            ? undefined
            : Object.freeze([
                ...selection.preferredProtocols,
              ]),
        excludedProviderIds:
          selection.excludedProviderIds ===
          undefined
            ? undefined
            : Object.freeze([
                ...selection.excludedProviderIds,
              ]),
        metadata: freezeMetadata(
          selection.metadata,
        ),
      }),
      candidates: Object.freeze(candidates),
      selected: validCandidates[0],
      evaluatedProviderCount:
        candidates.length,
      validQuoteCount:
        validCandidates.length,
      metadata: freezeMetadata(
        selection.metadata,
      ),
    });
  }

  public async requireBestQuote(
    selection:
      FlashLiquidityQuoteSelectionRequest,
  ): Promise<FlashLiquidityQuote> {
    const result =
      await this.selectBestQuote(selection);

    if (
      result.selected?.quote === undefined
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.NO_VALID_QUOTE,
        "No registered provider returned a valid flash-liquidity quote.",
        {
          chainId:
            selection.request.chainId,
          details: result.candidates,
        },
      );
    }

    return result.selected.quote;
  }

  private validateAndCloneDescriptor(
    descriptor: FlashLoanProviderDescriptor,
  ): FlashLoanProviderDescriptor {
    if (
      descriptor === null ||
      typeof descriptor !== "object"
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
        "Provider descriptor must be an object.",
        { details: descriptor },
      );
    }

    normalizeText(
      descriptor.id,
      "descriptor.id",
    );
    normalizeText(
      descriptor.name,
      "descriptor.name",
    );

    if (
      !Number.isSafeInteger(
        descriptor.chainId,
      ) ||
      Number(descriptor.chainId) <= 0
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
        "descriptor.chainId must be a positive safe integer.",
        {
          providerId: descriptor.id,
          details: descriptor.chainId,
        },
      );
    }

    if (
      !Object.values(
        FlashLiquidityType,
      ).includes(descriptor.liquidityType)
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
        "descriptor.liquidityType is invalid.",
        {
          providerId: descriptor.id,
          chainId: descriptor.chainId,
          details:
            descriptor.liquidityType,
        },
      );
    }

    if (
      !Number.isSafeInteger(
        descriptor.premiumBasisPoints,
      ) ||
      descriptor.premiumBasisPoints < 0
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
        "descriptor.premiumBasisPoints must be a non-negative safe integer.",
        {
          providerId: descriptor.id,
          chainId: descriptor.chainId,
          details:
            descriptor.premiumBasisPoints,
        },
      );
    }

    if (
      typeof descriptor.supportsMultiAsset !==
        "boolean" ||
      typeof descriptor.enabled !== "boolean"
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_DESCRIPTOR,
        "Descriptor capability flags must be booleans.",
        {
          providerId: descriptor.id,
          chainId: descriptor.chainId,
        },
      );
    }

    return cloneDescriptor(descriptor);
  }

  private validateProvider(
    provider: FlashLiquidityProvider,
  ): void {
    if (
      provider === null ||
      typeof provider !== "object" ||
      provider.descriptor === undefined ||
      typeof provider.quote !== "function" ||
      typeof provider.encodeFundingCall !==
        "function" ||
      typeof provider.validateAvailability !==
        "function"
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_PROVIDER,
        "Provider adapter must implement descriptor, quote, encodeFundingCall, and validateAvailability.",
        { details: provider },
      );
    }
  }

  private assertUniqueDescriptor(
    descriptor: FlashLoanProviderDescriptor,
  ): void {
    if (this.entries.has(descriptor.id)) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.DUPLICATE_PROVIDER_ID,
        `Provider ID "${descriptor.id}" is already registered.`,
        {
          providerId: descriptor.id,
          chainId: descriptor.chainId,
        },
      );
    }

    if (
      this.options.rejectDuplicateNamesPerChain
    ) {
      const key =
        providerNameKey(descriptor);

      for (const entry of this.entries.values()) {
        if (
          providerNameKey(
            entry.descriptor,
          ) === key
        ) {
          throw new FlashLoanProviderRegistryError(
            FlashLoanProviderRegistryErrorCode.DUPLICATE_CHAIN_NAME,
            `Provider name "${descriptor.name}" is already registered on chain ${descriptor.chainId}.`,
            {
              providerId: descriptor.id,
              chainId: descriptor.chainId,
            },
          );
        }
      }
    }
  }

  private assertDescriptorMatches(
    registered: FlashLoanProviderDescriptor,
    supplied: FlashLoanProviderDescriptor,
  ): void {
    const mismatches: string[] = [];

    if (registered.id !== supplied.id) {
      mismatches.push("id");
    }

    if (
      registered.chainId !== supplied.chainId
    ) {
      mismatches.push("chainId");
    }

    if (
      registered.protocol !== supplied.protocol
    ) {
      mismatches.push("protocol");
    }

    if (
      registered.liquidityType !==
      supplied.liquidityType
    ) {
      mismatches.push("liquidityType");
    }

    if (
      tokenAddressKey(
        registered.providerAddress,
      ) !==
      tokenAddressKey(
        supplied.providerAddress,
      )
    ) {
      mismatches.push("providerAddress");
    }

    if (mismatches.length > 0) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.DESCRIPTOR_ADAPTER_MISMATCH,
        `Provider descriptor does not match registered descriptor: ${mismatches.join(", ")}.`,
        {
          providerId: registered.id,
          chainId: registered.chainId,
          details: mismatches,
        },
      );
    }
  }

  private assertMutable(): void {
    if (this.frozen) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.REGISTRY_FROZEN,
        "Flash-loan provider registry is frozen.",
      );
    }
  }

  private matchesFilter(
    entry: FlashLoanProviderRegistryEntry,
    filter: FlashLoanProviderFilter,
  ): boolean {
    const descriptor = entry.descriptor;

    if (
      filter.chainId !== undefined &&
      descriptor.chainId !== filter.chainId
    ) {
      return false;
    }

    if (
      filter.protocol !== undefined &&
      descriptor.protocol !== filter.protocol
    ) {
      return false;
    }

    if (
      filter.liquidityType !== undefined &&
      descriptor.liquidityType !==
        filter.liquidityType
    ) {
      return false;
    }

    if (
      filter.maximumPremiumBasisPoints !==
        undefined &&
      descriptor.premiumBasisPoints >
        filter.maximumPremiumBasisPoints
    ) {
      return false;
    }

    if (
      filter.supportsMultiAsset !==
        undefined &&
      descriptor.supportsMultiAsset !==
        filter.supportsMultiAsset
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
      filter.requiresAdapter === true &&
      entry.provider === undefined
    ) {
      return false;
    }

    if (
      filter.tokenAddress !== undefined &&
      !this.supportsDescriptorToken(
        descriptor,
        filter.tokenAddress,
      )
    ) {
      return false;
    }

    return true;
  }

  private supportsDescriptorToken(
    descriptor: FlashLoanProviderDescriptor,
    address: EvmAddress,
  ): boolean {
    if (
      descriptor.supportedTokenAddresses ===
      undefined
    ) {
      return true;
    }

    const key = tokenAddressKey(address);

    return descriptor.supportedTokenAddresses.some(
      (supported) =>
        tokenAddressKey(supported) === key,
    );
  }

  private validateSelectionRequest(
    request: FlashLoanProviderSelectionRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "Provider selection request must be an object.",
        { details: request },
      );
    }

    if (
      !Number.isSafeInteger(request.chainId) ||
      Number(request.chainId) <= 0
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "request.chainId must be a positive safe integer.",
        { details: request.chainId },
      );
    }

    if (
      request.asset.chainId !==
      request.chainId
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "Selection asset chain does not match request chain.",
        { chainId: request.chainId },
      );
    }

    if (
      typeof request.amount !== "bigint" ||
      request.amount <= 0n
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "request.amount must be a positive bigint.",
        {
          chainId: request.chainId,
          details: request.amount,
        },
      );
    }

    if (
      request.maximumPremiumBasisPoints !==
        undefined &&
      (!Number.isSafeInteger(
        request.maximumPremiumBasisPoints,
      ) ||
        request.maximumPremiumBasisPoints < 0)
    ) {
      throw new FlashLoanProviderRegistryError(
        FlashLoanProviderRegistryErrorCode.INVALID_REQUEST,
        "maximumPremiumBasisPoints must be a non-negative safe integer.",
        {
          chainId: request.chainId,
          details:
            request.maximumPremiumBasisPoints,
        },
      );
    }
  }

  private validateQuote(
    quote: FlashLiquidityQuote,
    request: FlashLiquidityRequest,
    nowMilliseconds:
      UnixTimestampMilliseconds | undefined,
  ): readonly string[] {
    const reasons: string[] = [];

    if (
      quote.provider.id !==
      request.providerId
    ) {
      reasons.push(
        "Quote provider ID does not match request provider ID.",
      );
    }

    if (
      quote.provider.chainId !==
        request.chainId ||
      quote.blockReference.chainId !==
        request.chainId ||
      quote.asset.chainId !== request.chainId
    ) {
      reasons.push(
        "Quote chain does not match request chain.",
      );
    }

    if (
      tokenAddressKey(
        quote.asset.address,
      ) !==
      tokenAddressKey(
        request.asset.address,
      )
    ) {
      reasons.push(
        "Quote asset does not match requested asset.",
      );
    }

    if (
      quote.requestedAmount !==
      request.amount
    ) {
      reasons.push(
        "Quote requested amount does not match request amount.",
      );
    }

    if (
      quote.availableAmount <
      request.amount
    ) {
      reasons.push(
        "Provider has insufficient available liquidity.",
      );
    }

    if (
      quote.premiumAmount < 0n ||
      quote.totalRepaymentAmount <
        request.amount
    ) {
      reasons.push(
        "Quote premium or repayment amount is invalid.",
      );
    }

    if (
      quote.premiumBasisPoints < 0
    ) {
      reasons.push(
        "Quote premium basis points cannot be negative.",
      );
    }

    if (
      quote.expiresAtMilliseconds <=
      quote.quotedAtMilliseconds
    ) {
      reasons.push(
        "Quote expiry must be after quote timestamp.",
      );
    }

    if (
      nowMilliseconds !== undefined &&
      quote.expiresAtMilliseconds <=
        nowMilliseconds
    ) {
      reasons.push(
        "Quote is already expired.",
      );
    }

    return Object.freeze(reasons);
  }

  private compareQuoteCandidates(
    left: FlashLiquidityQuoteCandidate & {
      readonly quote: FlashLiquidityQuote;
    },
    right: FlashLiquidityQuoteCandidate & {
      readonly quote: FlashLiquidityQuote;
    },
    preferredProtocols:
      readonly FlashLoanProtocol[],
  ): number {
    const leftPreference =
      preferredProtocols.indexOf(
        left.descriptor.protocol,
      );
    const rightPreference =
      preferredProtocols.indexOf(
        right.descriptor.protocol,
      );

    const normalizedLeftPreference =
      leftPreference < 0
        ? Number.MAX_SAFE_INTEGER
        : leftPreference;
    const normalizedRightPreference =
      rightPreference < 0
        ? Number.MAX_SAFE_INTEGER
        : rightPreference;

    if (
      normalizedLeftPreference !==
      normalizedRightPreference
    ) {
      return (
        normalizedLeftPreference -
        normalizedRightPreference
      );
    }

    if (
      left.quote.totalRepaymentAmount !==
      right.quote.totalRepaymentAmount
    ) {
      return left.quote.totalRepaymentAmount <
        right.quote.totalRepaymentAmount
        ? -1
        : 1;
    }

    if (
      left.quote.premiumAmount !==
      right.quote.premiumAmount
    ) {
      return left.quote.premiumAmount <
        right.quote.premiumAmount
        ? -1
        : 1;
    }

    if (
      left.quote.availableAmount !==
      right.quote.availableAmount
    ) {
      return left.quote.availableAmount >
        right.quote.availableAmount
        ? -1
        : 1;
    }

    if (
      left.quote.expiresAtMilliseconds !==
      right.quote.expiresAtMilliseconds
    ) {
      return (
        right.quote.expiresAtMilliseconds -
        left.quote.expiresAtMilliseconds
      );
    }

    return descriptorSort(
      left.descriptor,
      right.descriptor,
    );
  }
}

export function createFlashLoanProviderRegistry(
  initialEntries:
    readonly FlashLoanProviderRegistryEntry[] = [],
  options: FlashLoanProviderRegistryOptions = {},
): FlashLoanProviderRegistry {
  return new FlashLoanProviderRegistry(
    initialEntries,
    options,
  );
}