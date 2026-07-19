import type {
  CrossChainAssetReference,
  CrossChainBridgeCapabilities,
  CrossChainBridgeDefinition,
  CrossChainBridgeId,
  CrossChainBridgeSecurityModel,
  CrossChainBridgeType,
  CrossChainIdentifier,
  CrossChainNetworkId,
} from "./cross-chain-arbitrage-contracts";
import {
  CrossChainValidationError,
  validateCrossChainBridgeDefinition,
} from "./cross-chain-arbitrage-validator";

export interface CrossChainBridgeCapabilityDescriptor {
  readonly bridgeId: CrossChainBridgeId;
  readonly bridgeName: string;
  readonly bridgeType: CrossChainBridgeType;
  readonly securityModel: CrossChainBridgeSecurityModel;
  readonly enabled: boolean;
  readonly capabilities: CrossChainBridgeCapabilities;
  readonly supportedNetworkIds: readonly CrossChainNetworkId[];
  readonly supportedAssetIds: readonly CrossChainIdentifier[];
  readonly supportedRouteCount: number;
  readonly supportedAssetRouteCount: number;
}

export interface CrossChainBridgeCapabilityRequirement {
  readonly sourceNetworkId?: CrossChainNetworkId;
  readonly destinationNetworkId?: CrossChainNetworkId;
  readonly sourceAssetId?: CrossChainIdentifier;
  readonly destinationAssetId?: CrossChainIdentifier;
  readonly bridgeTypes?: readonly CrossChainBridgeType[];
  readonly securityModels?: readonly CrossChainBridgeSecurityModel[];
  readonly requireEnabled?: boolean;
  readonly requireAtomicExecution?: boolean;
  readonly requireContractCalls?: boolean;
  readonly requireNativeAssets?: boolean;
  readonly requireTokenAssets?: boolean;
  readonly requireGasDrop?: boolean;
  readonly requireRefunds?: boolean;
  readonly requireDestinationClaims?: boolean;
  readonly requireTransactionReplacement?: boolean;
  readonly requireStatusPolling?: boolean;
  readonly requireWebhooks?: boolean;
  readonly requireFinalityProofs?: boolean;
  readonly minimumMaximumRouteHops?: number;
}

export interface CrossChainBridgeCapabilityMatch {
  readonly bridge: CrossChainBridgeDefinition;
  readonly descriptor: CrossChainBridgeCapabilityDescriptor;
  readonly score: number;
  readonly matchedRequirements: readonly string[];
}

export interface CrossChainBridgeCapabilityRegistrySnapshot {
  readonly version: number;
  readonly bridges: readonly CrossChainBridgeDefinition[];
}

export interface CrossChainBridgeCapabilityRegistryOptions {
  readonly initialBridges?: readonly CrossChainBridgeDefinition[];
  readonly allowReplacement?: boolean;
}

export interface RegisterBridgeCapabilityResult {
  readonly descriptor: CrossChainBridgeCapabilityDescriptor;
  readonly version: number;
  readonly replaced: boolean;
}

export interface RemoveBridgeCapabilityResult {
  readonly bridgeId: CrossChainBridgeId;
  readonly removed: boolean;
  readonly version: number;
}

export class CrossChainBridgeCapabilityRegistryError
  extends Error
{
  public readonly code: string;
  public readonly bridgeId: CrossChainBridgeId | null;

  public constructor(
    code: string,
    message: string,
    bridgeId: CrossChainBridgeId | null = null,
  ) {
    super(message);

    this.name =
      "CrossChainBridgeCapabilityRegistryError";
    this.code = code;
    this.bridgeId = bridgeId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
}

function freezeAssetReference(
  asset: CrossChainAssetReference,
): CrossChainAssetReference {
  return Object.freeze({
    ...asset,
  });
}

function freezeBridgeDefinition(
  bridge: CrossChainBridgeDefinition,
): CrossChainBridgeDefinition {
  return Object.freeze({
    ...bridge,
    networkPairs: freezeArray(
      bridge.networkPairs.map((pair) =>
        Object.freeze({
          ...pair,
        }),
      ),
    ),
    supportedAssets: freezeArray(
      bridge.supportedAssets.map((support) =>
        Object.freeze({
          ...support,
          sourceAsset: freezeAssetReference(
            support.sourceAsset,
          ),
          destinationAsset: freezeAssetReference(
            support.destinationAsset,
          ),
        }),
      ),
    ),
    capabilities: Object.freeze({
      ...bridge.capabilities,
    }),
    metadata: Object.freeze({
      ...bridge.metadata,
    }),
  });
}

function compareStrings(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function supportsNetworkRoute(
  bridge: CrossChainBridgeDefinition,
  sourceNetworkId: CrossChainNetworkId,
  destinationNetworkId: CrossChainNetworkId,
): boolean {
  return bridge.networkPairs.some((pair) => {
    const direct =
      pair.sourceNetworkId === sourceNetworkId &&
      pair.destinationNetworkId ===
        destinationNetworkId;

    const reverse =
      pair.bidirectional &&
      pair.sourceNetworkId ===
        destinationNetworkId &&
      pair.destinationNetworkId === sourceNetworkId;

    return direct || reverse;
  });
}

function supportsAssetRoute(
  bridge: CrossChainBridgeDefinition,
  sourceNetworkId: CrossChainNetworkId,
  sourceAssetId: CrossChainIdentifier,
  destinationNetworkId: CrossChainNetworkId,
  destinationAssetId: CrossChainIdentifier,
): boolean {
  return bridge.supportedAssets.some((support) => {
    const direct =
      support.sourceAsset.networkId ===
        sourceNetworkId &&
      support.sourceAsset.assetId === sourceAssetId &&
      support.destinationAsset.networkId ===
        destinationNetworkId &&
      support.destinationAsset.assetId ===
        destinationAssetId;

    if (direct) {
      return true;
    }

    const reverseRouteSupported =
      bridge.networkPairs.some(
        (pair) =>
          pair.bidirectional &&
          (
            (
              pair.sourceNetworkId ===
                sourceNetworkId &&
              pair.destinationNetworkId ===
                destinationNetworkId
            ) ||
            (
              pair.sourceNetworkId ===
                destinationNetworkId &&
              pair.destinationNetworkId ===
                sourceNetworkId
            )
          ),
      );

    return (
      reverseRouteSupported &&
      support.sourceAsset.networkId ===
        destinationNetworkId &&
      support.sourceAsset.assetId ===
        destinationAssetId &&
      support.destinationAsset.networkId ===
        sourceNetworkId &&
      support.destinationAsset.assetId ===
        sourceAssetId
    );
  });
}

function createDescriptor(
  bridge: CrossChainBridgeDefinition,
): CrossChainBridgeCapabilityDescriptor {
  const networkIds = new Set<CrossChainNetworkId>();
  const assetIds = new Set<CrossChainIdentifier>();

  let supportedRouteCount = 0;
  let supportedAssetRouteCount = 0;

  for (const pair of bridge.networkPairs) {
    networkIds.add(pair.sourceNetworkId);
    networkIds.add(pair.destinationNetworkId);

    supportedRouteCount += pair.bidirectional ? 2 : 1;
  }

  for (const support of bridge.supportedAssets) {
    assetIds.add(support.sourceAsset.assetId);
    assetIds.add(support.destinationAsset.assetId);

    const bidirectional =
      bridge.networkPairs.some(
        (pair) =>
          pair.bidirectional &&
          (
            (
              pair.sourceNetworkId ===
                support.sourceAsset.networkId &&
              pair.destinationNetworkId ===
                support.destinationAsset.networkId
            ) ||
            (
              pair.sourceNetworkId ===
                support.destinationAsset.networkId &&
              pair.destinationNetworkId ===
                support.sourceAsset.networkId
            )
          ),
      );

    supportedAssetRouteCount += bidirectional ? 2 : 1;
  }

  return Object.freeze({
    bridgeId: bridge.bridgeId,
    bridgeName: bridge.name,
    bridgeType: bridge.type,
    securityModel: bridge.securityModel,
    enabled: bridge.enabled,
    capabilities: Object.freeze({
      ...bridge.capabilities,
    }),
    supportedNetworkIds: freezeArray(
      [...networkIds].sort(compareStrings),
    ),
    supportedAssetIds: freezeArray(
      [...assetIds].sort(compareStrings),
    ),
    supportedRouteCount,
    supportedAssetRouteCount,
  });
}

function validateRequirement(
  requirement: CrossChainBridgeCapabilityRequirement,
): void {
  const hasSourceNetwork =
    requirement.sourceNetworkId !== undefined;
  const hasDestinationNetwork =
    requirement.destinationNetworkId !== undefined;

  if (hasSourceNetwork !== hasDestinationNetwork) {
    throw new CrossChainBridgeCapabilityRegistryError(
      "INCOMPLETE_NETWORK_ROUTE",
      "sourceNetworkId and destinationNetworkId must be provided together.",
    );
  }

  const hasSourceAsset =
    requirement.sourceAssetId !== undefined;
  const hasDestinationAsset =
    requirement.destinationAssetId !== undefined;

  if (hasSourceAsset !== hasDestinationAsset) {
    throw new CrossChainBridgeCapabilityRegistryError(
      "INCOMPLETE_ASSET_ROUTE",
      "sourceAssetId and destinationAssetId must be provided together.",
    );
  }

  if (
    hasSourceAsset &&
    (!hasSourceNetwork || !hasDestinationNetwork)
  ) {
    throw new CrossChainBridgeCapabilityRegistryError(
      "MISSING_ASSET_NETWORK_ROUTE",
      "Asset route filtering requires both source and destination network IDs.",
    );
  }

  if (
    requirement.sourceNetworkId !== undefined &&
    requirement.destinationNetworkId !== undefined &&
    requirement.sourceNetworkId ===
      requirement.destinationNetworkId
  ) {
    throw new CrossChainBridgeCapabilityRegistryError(
      "IDENTICAL_NETWORKS",
      "Source and destination network IDs must differ.",
    );
  }

  if (
    requirement.minimumMaximumRouteHops !==
    undefined
  ) {
    if (
      !Number.isInteger(
        requirement.minimumMaximumRouteHops,
      ) ||
      requirement.minimumMaximumRouteHops <= 0
    ) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "INVALID_ROUTE_HOP_REQUIREMENT",
        "minimumMaximumRouteHops must be a positive integer.",
      );
    }
  }

  if (requirement.bridgeTypes !== undefined) {
    const unique = new Set(requirement.bridgeTypes);

    if (unique.size !== requirement.bridgeTypes.length) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "DUPLICATE_BRIDGE_TYPE",
        "bridgeTypes must not contain duplicates.",
      );
    }
  }

  if (requirement.securityModels !== undefined) {
    const unique = new Set(
      requirement.securityModels,
    );

    if (
      unique.size !==
      requirement.securityModels.length
    ) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "DUPLICATE_SECURITY_MODEL",
        "securityModels must not contain duplicates.",
      );
    }
  }
}

function calculateCapabilityScore(
  bridge: CrossChainBridgeDefinition,
  matchedRequirements: readonly string[],
): number {
  const capabilityValues = [
    bridge.capabilities.supportsAtomicExecution,
    bridge.capabilities.supportsContractCalls,
    bridge.capabilities.supportsNativeAssets,
    bridge.capabilities.supportsTokenAssets,
    bridge.capabilities.supportsGasDrop,
    bridge.capabilities.supportsRefunds,
    bridge.capabilities.supportsDestinationClaims,
    bridge.capabilities.supportsTransactionReplacement,
    bridge.capabilities.supportsStatusPolling,
    bridge.capabilities.supportsWebhooks,
    bridge.capabilities.supportsFinalityProofs,
  ];

  const enabledCapabilities =
    capabilityValues.filter(Boolean).length;

  const requirementWeight =
    matchedRequirements.length * 1_000;

  const capabilityWeight =
    enabledCapabilities * 100;

  const routeWeight =
    bridge.capabilities.maximumRouteHops * 10;

  const enabledWeight = bridge.enabled ? 1 : 0;

  return (
    requirementWeight +
    capabilityWeight +
    routeWeight +
    enabledWeight
  );
}

export class DeterministicCrossChainBridgeCapabilityRegistry {
  private readonly bridgesById =
    new Map<
      CrossChainBridgeId,
      CrossChainBridgeDefinition
    >();

  private readonly descriptorsById =
    new Map<
      CrossChainBridgeId,
      CrossChainBridgeCapabilityDescriptor
    >();

  private readonly allowReplacement: boolean;

  private versionValue = 0;

  public constructor(
    options: CrossChainBridgeCapabilityRegistryOptions = {},
  ) {
    this.allowReplacement =
      options.allowReplacement ?? false;

    for (const bridge of options.initialBridges ?? []) {
      this.register(bridge, {
        allowReplacement: false,
      });
    }
  }

  public get version(): number {
    return this.versionValue;
  }

  public get size(): number {
    return this.bridgesById.size;
  }

  public register(
    bridge: CrossChainBridgeDefinition,
    options: Readonly<{
      allowReplacement?: boolean;
    }> = {},
  ): RegisterBridgeCapabilityResult {
    try {
      validateCrossChainBridgeDefinition(bridge);
    } catch (error) {
      if (error instanceof CrossChainValidationError) {
        throw new CrossChainBridgeCapabilityRegistryError(
          "INVALID_BRIDGE_DEFINITION",
          error.message,
          bridge.bridgeId,
        );
      }

      throw error;
    }

    const existing = this.bridgesById.get(
      bridge.bridgeId,
    );

    const replacementAllowed =
      options.allowReplacement ??
      this.allowReplacement;

    if (
      existing !== undefined &&
      !replacementAllowed
    ) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "DUPLICATE_BRIDGE",
        `Bridge "${bridge.bridgeId}" is already registered.`,
        bridge.bridgeId,
      );
    }

    const immutableBridge =
      freezeBridgeDefinition(bridge);

    const descriptor =
      createDescriptor(immutableBridge);

    this.bridgesById.set(
      immutableBridge.bridgeId,
      immutableBridge,
    );
    this.descriptorsById.set(
      immutableBridge.bridgeId,
      descriptor,
    );
    this.versionValue += 1;

    return Object.freeze({
      descriptor,
      version: this.versionValue,
      replaced: existing !== undefined,
    });
  }

  public registerMany(
    bridges: readonly CrossChainBridgeDefinition[],
    options: Readonly<{
      allowReplacement?: boolean;
    }> = {},
  ): readonly RegisterBridgeCapabilityResult[] {
    const bridgeIds = new Set<CrossChainBridgeId>();

    for (const bridge of bridges) {
      if (bridgeIds.has(bridge.bridgeId)) {
        throw new CrossChainBridgeCapabilityRegistryError(
          "DUPLICATE_BATCH_BRIDGE",
          `Bridge "${bridge.bridgeId}" appears more than once in the batch.`,
          bridge.bridgeId,
        );
      }

      bridgeIds.add(bridge.bridgeId);
      validateCrossChainBridgeDefinition(bridge);
    }

    const snapshot = this.snapshot();

    try {
      return freezeArray(
        bridges.map((bridge) =>
          this.register(bridge, options),
        ),
      );
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  public remove(
    bridgeId: CrossChainBridgeId,
  ): RemoveBridgeCapabilityResult {
    const removed =
      this.bridgesById.delete(bridgeId);

    this.descriptorsById.delete(bridgeId);

    if (removed) {
      this.versionValue += 1;
    }

    return Object.freeze({
      bridgeId,
      removed,
      version: this.versionValue,
    });
  }

  public clear(): number {
    if (this.bridgesById.size === 0) {
      return this.versionValue;
    }

    this.bridgesById.clear();
    this.descriptorsById.clear();
    this.versionValue += 1;

    return this.versionValue;
  }

  public hasBridge(
    bridgeId: CrossChainBridgeId,
  ): boolean {
    return this.bridgesById.has(bridgeId);
  }

  public getBridge(
    bridgeId: CrossChainBridgeId,
  ): CrossChainBridgeDefinition | undefined {
    return this.bridgesById.get(bridgeId);
  }

  public requireBridge(
    bridgeId: CrossChainBridgeId,
  ): CrossChainBridgeDefinition {
    const bridge = this.getBridge(bridgeId);

    if (bridge === undefined) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "BRIDGE_NOT_FOUND",
        `Bridge "${bridgeId}" is not registered.`,
        bridgeId,
      );
    }

    return bridge;
  }

  public getDescriptor(
    bridgeId: CrossChainBridgeId,
  ):
    | CrossChainBridgeCapabilityDescriptor
    | undefined {
    return this.descriptorsById.get(bridgeId);
  }

  public requireDescriptor(
    bridgeId: CrossChainBridgeId,
  ): CrossChainBridgeCapabilityDescriptor {
    const descriptor =
      this.getDescriptor(bridgeId);

    if (descriptor === undefined) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "BRIDGE_CAPABILITY_NOT_FOUND",
        `Capability descriptor for bridge "${bridgeId}" is not registered.`,
        bridgeId,
      );
    }

    return descriptor;
  }

  public listDescriptors():
    readonly CrossChainBridgeCapabilityDescriptor[] {
    return freezeArray(
      [...this.descriptorsById.values()].sort(
        (left, right) =>
          compareStrings(
            left.bridgeId,
            right.bridgeId,
          ),
      ),
    );
  }

  public findMatchingBridges(
    requirement: CrossChainBridgeCapabilityRequirement,
  ): readonly CrossChainBridgeCapabilityMatch[] {
    validateRequirement(requirement);

    const matches: CrossChainBridgeCapabilityMatch[] =
      [];

    const sortedBridges = [
      ...this.bridgesById.values(),
    ].sort((left, right) =>
      compareStrings(
        left.bridgeId,
        right.bridgeId,
      ),
    );

    for (const bridge of sortedBridges) {
      const matchedRequirements: string[] = [];

      if (
        requirement.requireEnabled !== false &&
        !bridge.enabled
      ) {
        continue;
      }

      if (requirement.requireEnabled !== undefined) {
        if (
          requirement.requireEnabled !==
          bridge.enabled
        ) {
          continue;
        }

        matchedRequirements.push("enabled");
      }

      if (
        requirement.bridgeTypes !== undefined &&
        !requirement.bridgeTypes.includes(bridge.type)
      ) {
        continue;
      }

      if (requirement.bridgeTypes !== undefined) {
        matchedRequirements.push("bridgeType");
      }

      if (
        requirement.securityModels !== undefined &&
        !requirement.securityModels.includes(
          bridge.securityModel,
        )
      ) {
        continue;
      }

      if (
        requirement.securityModels !== undefined
      ) {
        matchedRequirements.push("securityModel");
      }

      if (
        requirement.sourceNetworkId !== undefined &&
        requirement.destinationNetworkId !==
          undefined
      ) {
        if (
          !supportsNetworkRoute(
            bridge,
            requirement.sourceNetworkId,
            requirement.destinationNetworkId,
          )
        ) {
          continue;
        }

        matchedRequirements.push("networkRoute");
      }

      if (
        requirement.sourceNetworkId !== undefined &&
        requirement.destinationNetworkId !==
          undefined &&
        requirement.sourceAssetId !== undefined &&
        requirement.destinationAssetId !== undefined
      ) {
        if (
          !supportsAssetRoute(
            bridge,
            requirement.sourceNetworkId,
            requirement.sourceAssetId,
            requirement.destinationNetworkId,
            requirement.destinationAssetId,
          )
        ) {
          continue;
        }

        matchedRequirements.push("assetRoute");
      }

      const booleanRequirements = [
        [
          "atomicExecution",
          requirement.requireAtomicExecution,
          bridge.capabilities.supportsAtomicExecution,
        ],
        [
          "contractCalls",
          requirement.requireContractCalls,
          bridge.capabilities.supportsContractCalls,
        ],
        [
          "nativeAssets",
          requirement.requireNativeAssets,
          bridge.capabilities.supportsNativeAssets,
        ],
        [
          "tokenAssets",
          requirement.requireTokenAssets,
          bridge.capabilities.supportsTokenAssets,
        ],
        [
          "gasDrop",
          requirement.requireGasDrop,
          bridge.capabilities.supportsGasDrop,
        ],
        [
          "refunds",
          requirement.requireRefunds,
          bridge.capabilities.supportsRefunds,
        ],
        [
          "destinationClaims",
          requirement.requireDestinationClaims,
          bridge.capabilities
            .supportsDestinationClaims,
        ],
        [
          "transactionReplacement",
          requirement.requireTransactionReplacement,
          bridge.capabilities
            .supportsTransactionReplacement,
        ],
        [
          "statusPolling",
          requirement.requireStatusPolling,
          bridge.capabilities.supportsStatusPolling,
        ],
        [
          "webhooks",
          requirement.requireWebhooks,
          bridge.capabilities.supportsWebhooks,
        ],
        [
          "finalityProofs",
          requirement.requireFinalityProofs,
          bridge.capabilities.supportsFinalityProofs,
        ],
      ] as const;

      let rejected = false;

      for (const [
        requirementName,
        requiredValue,
        actualValue,
      ] of booleanRequirements) {
        if (requiredValue === undefined) {
          continue;
        }

        if (requiredValue !== actualValue) {
          rejected = true;
          break;
        }

        matchedRequirements.push(requirementName);
      }

      if (rejected) {
        continue;
      }

      if (
        requirement.minimumMaximumRouteHops !==
          undefined &&
        bridge.capabilities.maximumRouteHops <
          requirement.minimumMaximumRouteHops
      ) {
        continue;
      }

      if (
        requirement.minimumMaximumRouteHops !==
        undefined
      ) {
        matchedRequirements.push("maximumRouteHops");
      }

      const descriptor =
        this.requireDescriptor(bridge.bridgeId);

      matches.push(
        Object.freeze({
          bridge,
          descriptor,
          score: calculateCapabilityScore(
            bridge,
            matchedRequirements,
          ),
          matchedRequirements: freezeArray(
            matchedRequirements.sort(compareStrings),
          ),
        }),
      );
    }

    matches.sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return compareStrings(
        left.bridge.bridgeId,
        right.bridge.bridgeId,
      );
    });

    return freezeArray(matches);
  }

  public findAtomicBridges(
    sourceNetworkId?: CrossChainNetworkId,
    destinationNetworkId?: CrossChainNetworkId,
  ): readonly CrossChainBridgeCapabilityMatch[] {
    return this.findMatchingBridges({
      sourceNetworkId,
      destinationNetworkId,
      requireEnabled: true,
      requireAtomicExecution: true,
    });
  }

  public findRefundableBridges(
    sourceNetworkId?: CrossChainNetworkId,
    destinationNetworkId?: CrossChainNetworkId,
  ): readonly CrossChainBridgeCapabilityMatch[] {
    return this.findMatchingBridges({
      sourceNetworkId,
      destinationNetworkId,
      requireEnabled: true,
      requireRefunds: true,
    });
  }

  public findFinalityProofBridges(
    sourceNetworkId?: CrossChainNetworkId,
    destinationNetworkId?: CrossChainNetworkId,
  ): readonly CrossChainBridgeCapabilityMatch[] {
    return this.findMatchingBridges({
      sourceNetworkId,
      destinationNetworkId,
      requireEnabled: true,
      requireFinalityProofs: true,
    });
  }

  public snapshot():
    CrossChainBridgeCapabilityRegistrySnapshot {
    return Object.freeze({
      version: this.versionValue,
      bridges: freezeArray(
        [...this.bridgesById.values()].sort(
          (left, right) =>
            compareStrings(
              left.bridgeId,
              right.bridgeId,
            ),
        ),
      ),
    });
  }

  public restore(
    snapshot: CrossChainBridgeCapabilityRegistrySnapshot,
  ): void {
    if (
      !Number.isInteger(snapshot.version) ||
      snapshot.version < 0
    ) {
      throw new CrossChainBridgeCapabilityRegistryError(
        "INVALID_SNAPSHOT_VERSION",
        "Snapshot version must be a non-negative integer.",
      );
    }

    const bridgeIds = new Set<CrossChainBridgeId>();
    const immutableBridges: CrossChainBridgeDefinition[] =
      [];

    for (const bridge of snapshot.bridges) {
      validateCrossChainBridgeDefinition(bridge);

      if (bridgeIds.has(bridge.bridgeId)) {
        throw new CrossChainBridgeCapabilityRegistryError(
          "DUPLICATE_SNAPSHOT_BRIDGE",
          `Snapshot contains duplicate bridge "${bridge.bridgeId}".`,
          bridge.bridgeId,
        );
      }

      bridgeIds.add(bridge.bridgeId);
      immutableBridges.push(
        freezeBridgeDefinition(bridge),
      );
    }

    this.bridgesById.clear();
    this.descriptorsById.clear();

    for (const bridge of immutableBridges) {
      this.bridgesById.set(
        bridge.bridgeId,
        bridge,
      );
      this.descriptorsById.set(
        bridge.bridgeId,
        createDescriptor(bridge),
      );
    }

    this.versionValue = snapshot.version;
  }
}