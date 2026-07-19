import type {
  CrossChainAssetReference,
  CrossChainBridgeDefinition,
  CrossChainBridgeId,
  CrossChainBridgeRegistry,
  CrossChainIdentifier,
  CrossChainNetworkId,
} from "./cross-chain-arbitrage-contracts";
import {
  CrossChainValidationError,
  validateCrossChainBridgeDefinition,
} from "./cross-chain-arbitrage-validator";

export interface CrossChainBridgeRegistrySnapshot {
  readonly version: number;
  readonly bridges: readonly CrossChainBridgeDefinition[];
}

export interface RegisterCrossChainBridgeResult {
  readonly bridge: CrossChainBridgeDefinition;
  readonly version: number;
  readonly replaced: boolean;
}

export interface RemoveCrossChainBridgeResult {
  readonly bridgeId: CrossChainBridgeId;
  readonly removed: boolean;
  readonly version: number;
}

export interface CrossChainBridgeRegistryOptions {
  readonly initialBridges?: readonly CrossChainBridgeDefinition[];
  readonly allowReplacement?: boolean;
}

export class CrossChainBridgeRegistryError extends Error {
  public readonly code: string;
  public readonly bridgeId: CrossChainBridgeId | null;

  public constructor(
    code: string,
    message: string,
    bridgeId: CrossChainBridgeId | null = null,
  ) {
    super(message);

    this.name = "CrossChainBridgeRegistryError";
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

function freezeRecord<
  T extends Readonly<Record<string, unknown>>,
>(value: T): T {
  return Object.freeze({ ...value }) as T;
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
    metadata: freezeRecord(bridge.metadata),
  });
}

function compareStrings(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function createRouteKey(
  sourceNetworkId: CrossChainNetworkId,
  destinationNetworkId: CrossChainNetworkId,
): string {
  return `${sourceNetworkId}->${destinationNetworkId}`;
}

function createAssetRouteKey(
  sourceNetworkId: CrossChainNetworkId,
  sourceAssetId: CrossChainIdentifier,
  destinationNetworkId: CrossChainNetworkId,
  destinationAssetId: CrossChainIdentifier,
): string {
  return [
    sourceNetworkId,
    sourceAssetId,
    destinationNetworkId,
    destinationAssetId,
  ].join("->");
}

function supportsNetworkRoute(
  bridge: CrossChainBridgeDefinition,
  sourceNetworkId: CrossChainNetworkId,
  destinationNetworkId: CrossChainNetworkId,
): boolean {
  return bridge.networkPairs.some((pair) => {
    if (
      pair.sourceNetworkId === sourceNetworkId &&
      pair.destinationNetworkId === destinationNetworkId
    ) {
      return true;
    }

    return (
      pair.bidirectional &&
      pair.sourceNetworkId === destinationNetworkId &&
      pair.destinationNetworkId === sourceNetworkId
    );
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
    if (
      support.sourceAsset.networkId === sourceNetworkId &&
      support.sourceAsset.assetId === sourceAssetId &&
      support.destinationAsset.networkId ===
        destinationNetworkId &&
      support.destinationAsset.assetId ===
        destinationAssetId
    ) {
      return true;
    }

    const reversePair = bridge.networkPairs.some(
      (pair) =>
        pair.bidirectional &&
        pair.sourceNetworkId === destinationNetworkId &&
        pair.destinationNetworkId === sourceNetworkId,
    );

    return (
      reversePair &&
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

export class DeterministicCrossChainBridgeRegistry
  implements CrossChainBridgeRegistry
{
  private readonly bridgesById =
    new Map<CrossChainBridgeId, CrossChainBridgeDefinition>();

  private readonly bridgeIdsByRoute =
    new Map<string, Set<CrossChainBridgeId>>();

  private readonly bridgeIdsByAssetRoute =
    new Map<string, Set<CrossChainBridgeId>>();

  private readonly allowReplacement: boolean;

  private versionValue = 0;

  public constructor(
    options: CrossChainBridgeRegistryOptions = {},
  ) {
    this.allowReplacement =
      options.allowReplacement ?? false;

    const initialBridges = options.initialBridges ?? [];

    for (const bridge of initialBridges) {
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
  ): RegisterCrossChainBridgeResult {
    try {
      validateCrossChainBridgeDefinition(bridge);
    } catch (error) {
      if (error instanceof CrossChainValidationError) {
        throw new CrossChainBridgeRegistryError(
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
      throw new CrossChainBridgeRegistryError(
        "DUPLICATE_BRIDGE",
        `Bridge "${bridge.bridgeId}" is already registered.`,
        bridge.bridgeId,
      );
    }

    if (existing !== undefined) {
      this.removeIndexes(existing);
    }

    const immutableBridge =
      freezeBridgeDefinition(bridge);

    this.bridgesById.set(
      immutableBridge.bridgeId,
      immutableBridge,
    );
    this.addIndexes(immutableBridge);
    this.versionValue += 1;

    return Object.freeze({
      bridge: immutableBridge,
      version: this.versionValue,
      replaced: existing !== undefined,
    });
  }

  public registerMany(
    bridges: readonly CrossChainBridgeDefinition[],
    options: Readonly<{
      allowReplacement?: boolean;
    }> = {},
  ): readonly RegisterCrossChainBridgeResult[] {
    const seen = new Set<CrossChainBridgeId>();

    for (const bridge of bridges) {
      if (seen.has(bridge.bridgeId)) {
        throw new CrossChainBridgeRegistryError(
          "DUPLICATE_BATCH_BRIDGE",
          `Bridge "${bridge.bridgeId}" appears more than once in the registration batch.`,
          bridge.bridgeId,
        );
      }

      seen.add(bridge.bridgeId);
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
  ): RemoveCrossChainBridgeResult {
    const existing = this.bridgesById.get(bridgeId);

    if (existing === undefined) {
      return Object.freeze({
        bridgeId,
        removed: false,
        version: this.versionValue,
      });
    }

    this.removeIndexes(existing);
    this.bridgesById.delete(bridgeId);
    this.versionValue += 1;

    return Object.freeze({
      bridgeId,
      removed: true,
      version: this.versionValue,
    });
  }

  public clear(): number {
    if (this.bridgesById.size === 0) {
      return this.versionValue;
    }

    this.bridgesById.clear();
    this.bridgeIdsByRoute.clear();
    this.bridgeIdsByAssetRoute.clear();
    this.versionValue += 1;

    return this.versionValue;
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
      throw new CrossChainBridgeRegistryError(
        "BRIDGE_NOT_FOUND",
        `Bridge "${bridgeId}" is not registered.`,
        bridgeId,
      );
    }

    return bridge;
  }

  public hasBridge(
    bridgeId: CrossChainBridgeId,
  ): boolean {
    return this.bridgesById.has(bridgeId);
  }

  public listBridges():
    readonly CrossChainBridgeDefinition[] {
    return freezeArray(
      [...this.bridgesById.values()].sort(
        (left, right) =>
          compareStrings(
            left.bridgeId,
            right.bridgeId,
          ),
      ),
    );
  }

  public listEnabledBridges():
    readonly CrossChainBridgeDefinition[] {
    return freezeArray(
      this.listBridges().filter(
        (bridge) => bridge.enabled,
      ),
    );
  }

  public listDisabledBridges():
    readonly CrossChainBridgeDefinition[] {
    return freezeArray(
      this.listBridges().filter(
        (bridge) => !bridge.enabled,
      ),
    );
  }

  public findBridgesForRoute(
    sourceNetworkId: CrossChainNetworkId,
    destinationNetworkId: CrossChainNetworkId,
    sourceAssetId?: CrossChainIdentifier,
    destinationAssetId?: CrossChainIdentifier,
  ): readonly CrossChainBridgeDefinition[] {
    if (
      sourceNetworkId.trim().length === 0 ||
      destinationNetworkId.trim().length === 0
    ) {
      throw new CrossChainBridgeRegistryError(
        "INVALID_NETWORK_ID",
        "Source and destination network IDs must not be empty.",
      );
    }

    if (
      sourceNetworkId === destinationNetworkId
    ) {
      return Object.freeze([]);
    }

    if (
      (sourceAssetId === undefined) !==
      (destinationAssetId === undefined)
    ) {
      throw new CrossChainBridgeRegistryError(
        "INCOMPLETE_ASSET_ROUTE",
        "Both sourceAssetId and destinationAssetId must be provided together.",
      );
    }

    const bridgeIds =
      sourceAssetId !== undefined &&
      destinationAssetId !== undefined
        ? this.bridgeIdsByAssetRoute.get(
            createAssetRouteKey(
              sourceNetworkId,
              sourceAssetId,
              destinationNetworkId,
              destinationAssetId,
            ),
          )
        : this.bridgeIdsByRoute.get(
            createRouteKey(
              sourceNetworkId,
              destinationNetworkId,
            ),
          );

    if (bridgeIds === undefined) {
      return Object.freeze([]);
    }

    const bridges = [...bridgeIds]
      .map((bridgeId) =>
        this.bridgesById.get(bridgeId),
      )
      .filter(
        (
          bridge,
        ): bridge is CrossChainBridgeDefinition =>
          bridge !== undefined &&
          bridge.enabled,
      )
      .filter((bridge) => {
        if (
          !supportsNetworkRoute(
            bridge,
            sourceNetworkId,
            destinationNetworkId,
          )
        ) {
          return false;
        }

        if (
          sourceAssetId === undefined ||
          destinationAssetId === undefined
        ) {
          return true;
        }

        return supportsAssetRoute(
          bridge,
          sourceNetworkId,
          sourceAssetId,
          destinationNetworkId,
          destinationAssetId,
        );
      })
      .sort((left, right) =>
        compareStrings(
          left.bridgeId,
          right.bridgeId,
        ),
      );

    return freezeArray(bridges);
  }

  public snapshot():
    CrossChainBridgeRegistrySnapshot {
    return Object.freeze({
      version: this.versionValue,
      bridges: this.listBridges(),
    });
  }

  public restore(
    snapshot: CrossChainBridgeRegistrySnapshot,
  ): void {
    if (
      !Number.isInteger(snapshot.version) ||
      snapshot.version < 0
    ) {
      throw new CrossChainBridgeRegistryError(
        "INVALID_SNAPSHOT_VERSION",
        "Registry snapshot version must be a non-negative integer.",
      );
    }

    const immutableBridges =
      snapshot.bridges.map((bridge) => {
        validateCrossChainBridgeDefinition(bridge);
        return freezeBridgeDefinition(bridge);
      });

    const uniqueBridgeIds = new Set(
      immutableBridges.map(
        (bridge) => bridge.bridgeId,
      ),
    );

    if (
      uniqueBridgeIds.size !==
      immutableBridges.length
    ) {
      throw new CrossChainBridgeRegistryError(
        "DUPLICATE_SNAPSHOT_BRIDGE",
        "Registry snapshot contains duplicate bridge IDs.",
      );
    }

    this.bridgesById.clear();
    this.bridgeIdsByRoute.clear();
    this.bridgeIdsByAssetRoute.clear();

    for (const bridge of immutableBridges) {
      this.bridgesById.set(
        bridge.bridgeId,
        bridge,
      );
      this.addIndexes(bridge);
    }

    this.versionValue = snapshot.version;
  }

  private addIndexes(
    bridge: CrossChainBridgeDefinition,
  ): void {
    for (const pair of bridge.networkPairs) {
      this.addRouteIndex(
        pair.sourceNetworkId,
        pair.destinationNetworkId,
        bridge.bridgeId,
      );

      if (pair.bidirectional) {
        this.addRouteIndex(
          pair.destinationNetworkId,
          pair.sourceNetworkId,
          bridge.bridgeId,
        );
      }
    }

    for (const support of bridge.supportedAssets) {
      this.addAssetRouteIndex(
        support.sourceAsset.networkId,
        support.sourceAsset.assetId,
        support.destinationAsset.networkId,
        support.destinationAsset.assetId,
        bridge.bridgeId,
      );

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

      if (bidirectional) {
        this.addAssetRouteIndex(
          support.destinationAsset.networkId,
          support.destinationAsset.assetId,
          support.sourceAsset.networkId,
          support.sourceAsset.assetId,
          bridge.bridgeId,
        );
      }
    }
  }

  private removeIndexes(
    bridge: CrossChainBridgeDefinition,
  ): void {
    for (const pair of bridge.networkPairs) {
      this.removeRouteIndex(
        pair.sourceNetworkId,
        pair.destinationNetworkId,
        bridge.bridgeId,
      );

      if (pair.bidirectional) {
        this.removeRouteIndex(
          pair.destinationNetworkId,
          pair.sourceNetworkId,
          bridge.bridgeId,
        );
      }
    }

    for (const support of bridge.supportedAssets) {
      this.removeAssetRouteIndex(
        support.sourceAsset.networkId,
        support.sourceAsset.assetId,
        support.destinationAsset.networkId,
        support.destinationAsset.assetId,
        bridge.bridgeId,
      );

      this.removeAssetRouteIndex(
        support.destinationAsset.networkId,
        support.destinationAsset.assetId,
        support.sourceAsset.networkId,
        support.sourceAsset.assetId,
        bridge.bridgeId,
      );
    }
  }

  private addRouteIndex(
    sourceNetworkId: CrossChainNetworkId,
    destinationNetworkId: CrossChainNetworkId,
    bridgeId: CrossChainBridgeId,
  ): void {
    const key = createRouteKey(
      sourceNetworkId,
      destinationNetworkId,
    );

    const bridgeIds =
      this.bridgeIdsByRoute.get(key) ??
      new Set<CrossChainBridgeId>();

    bridgeIds.add(bridgeId);
    this.bridgeIdsByRoute.set(key, bridgeIds);
  }

  private removeRouteIndex(
    sourceNetworkId: CrossChainNetworkId,
    destinationNetworkId: CrossChainNetworkId,
    bridgeId: CrossChainBridgeId,
  ): void {
    const key = createRouteKey(
      sourceNetworkId,
      destinationNetworkId,
    );

    const bridgeIds =
      this.bridgeIdsByRoute.get(key);

    if (bridgeIds === undefined) {
      return;
    }

    bridgeIds.delete(bridgeId);

    if (bridgeIds.size === 0) {
      this.bridgeIdsByRoute.delete(key);
    }
  }

  private addAssetRouteIndex(
    sourceNetworkId: CrossChainNetworkId,
    sourceAssetId: CrossChainIdentifier,
    destinationNetworkId: CrossChainNetworkId,
    destinationAssetId: CrossChainIdentifier,
    bridgeId: CrossChainBridgeId,
  ): void {
    const key = createAssetRouteKey(
      sourceNetworkId,
      sourceAssetId,
      destinationNetworkId,
      destinationAssetId,
    );

    const bridgeIds =
      this.bridgeIdsByAssetRoute.get(key) ??
      new Set<CrossChainBridgeId>();

    bridgeIds.add(bridgeId);
    this.bridgeIdsByAssetRoute.set(
      key,
      bridgeIds,
    );
  }

  private removeAssetRouteIndex(
    sourceNetworkId: CrossChainNetworkId,
    sourceAssetId: CrossChainIdentifier,
    destinationNetworkId: CrossChainNetworkId,
    destinationAssetId: CrossChainIdentifier,
    bridgeId: CrossChainBridgeId,
  ): void {
    const key = createAssetRouteKey(
      sourceNetworkId,
      sourceAssetId,
      destinationNetworkId,
      destinationAssetId,
    );

    const bridgeIds =
      this.bridgeIdsByAssetRoute.get(key);

    if (bridgeIds === undefined) {
      return;
    }

    bridgeIds.delete(bridgeId);

    if (bridgeIds.size === 0) {
      this.bridgeIdsByAssetRoute.delete(key);
    }
  }
}