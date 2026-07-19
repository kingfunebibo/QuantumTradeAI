import type {
  CrossChainIdentifier,
  CrossChainLiquidityGraph,
  CrossChainNetworkId,
} from "./cross-chain-arbitrage-contracts";
import {
  CrossChainValidationError,
  validateCrossChainLiquidityGraph,
} from "./cross-chain-arbitrage-validator";

type CrossChainLiquidityGraphNode =
  CrossChainLiquidityGraph["nodes"][number];

type CrossChainLiquidityGraphEdge =
  CrossChainLiquidityGraph["edges"][number];

export interface CrossChainLiquidityGraphSnapshot {
  readonly version: number;
  readonly graph: CrossChainLiquidityGraph;
}

export interface CrossChainLiquidityGraphBuilderOptions {
  readonly graphId: CrossChainIdentifier;
  readonly initialVersion?: number;
  readonly initialNodes?: readonly CrossChainLiquidityGraphNode[];
  readonly initialEdges?: readonly CrossChainLiquidityGraphEdge[];
  readonly generatedAt?: number;
}

export interface AddLiquidityNodeResult {
  readonly node: CrossChainLiquidityGraphNode;
  readonly replaced: boolean;
  readonly version: number;
}

export interface RemoveLiquidityNodeResult {
  readonly nodeId: CrossChainIdentifier;
  readonly removed: boolean;
  readonly removedEdgeIds: readonly CrossChainIdentifier[];
  readonly version: number;
}

export interface AddLiquidityEdgeResult {
  readonly edge: CrossChainLiquidityGraphEdge;
  readonly replaced: boolean;
  readonly version: number;
}

export interface RemoveLiquidityEdgeResult {
  readonly edgeId: CrossChainIdentifier;
  readonly removed: boolean;
  readonly version: number;
}

export interface CrossChainLiquidityPath {
  readonly nodeIds: readonly CrossChainIdentifier[];
  readonly edgeIds: readonly CrossChainIdentifier[];
  readonly totalEstimatedFeeUsd: string | null;
  readonly totalEstimatedLatencyMilliseconds: number;
  readonly minimumCapacityAtomic: string;
  readonly hopCount: number;
}

export interface CrossChainLiquidityPathSearchRequest {
  readonly sourceNodeId: CrossChainIdentifier;
  readonly destinationNodeId: CrossChainIdentifier;
  readonly maximumHops?: number;
  readonly maximumLatencyMilliseconds?: number;
  readonly maximumFeeUsd?: string;
  readonly minimumCapacityAtomic?: string;
  readonly allowedBridgeIds?: readonly CrossChainIdentifier[];
  readonly allowedVenueIds?: readonly CrossChainIdentifier[];
  readonly includeDisabledEdges?: boolean;
  readonly maximumResults?: number;
}

export class CrossChainLiquidityGraphError extends Error {
  public readonly code: string;
  public readonly referenceId: CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name = "CrossChainLiquidityGraphError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
}

function compareStrings(
  left: string,
  right: string,
): number {
  return left.localeCompare(right);
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_IDENTIFIER",
      `${fieldName} must not be empty.`,
      value,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_INTEGER",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_INTEGER",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertAtomicAmount(
  value: string,
  fieldName: string,
  allowZero = true,
): void {
  if (!/^\d+$/.test(value)) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_ATOMIC_AMOUNT",
      `${fieldName} must be a non-negative integer string.`,
    );
  }

  const amount = BigInt(value);

  if (!allowZero && amount === 0n) {
    throw new CrossChainLiquidityGraphError(
      "ZERO_ATOMIC_AMOUNT",
      `${fieldName} must be greater than zero.`,
    );
  }
}

function assertDecimalAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must be a canonical non-negative decimal string.`,
    );
  }

  if (!Number.isFinite(Number(value))) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must represent a finite number.`,
    );
  }
}

function normalizeDecimal(
  value: number,
): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new CrossChainLiquidityGraphError(
      "INVALID_DECIMAL_RESULT",
      "Calculated decimal result must be finite and non-negative.",
    );
  }

  if (value === 0) {
    return "0";
  }

  return value.toFixed(12).replace(/\.?0+$/, "");
}

function freezeNode(
  node: CrossChainLiquidityGraphNode,
): CrossChainLiquidityGraphNode {
  return Object.freeze({
    ...node,
    network: Object.freeze({
      ...node.network,
    }),
    asset: Object.freeze({
      ...node.asset,
    }),
  });
}

function freezeEdge(
  edge: CrossChainLiquidityGraphEdge,
): CrossChainLiquidityGraphEdge {
  return Object.freeze({
    ...edge,
  });
}

function freezeGraph(
  graph: CrossChainLiquidityGraph,
): CrossChainLiquidityGraph {
  return Object.freeze({
    ...graph,
    nodes: freezeArray(
      graph.nodes.map(freezeNode),
    ),
    edges: freezeArray(
      graph.edges.map(freezeEdge),
    ),
  });
}

function validateNode(
  node: CrossChainLiquidityGraphNode,
): void {
  const graph: CrossChainLiquidityGraph =
    Object.freeze({
      graphId: "node-validation",
      version: 1,
      nodes: Object.freeze([node]),
      edges: Object.freeze([]),
      generatedAt: node.observedAt,
    });

  try {
    validateCrossChainLiquidityGraph(graph);
  } catch (error) {
    if (error instanceof CrossChainValidationError) {
      throw new CrossChainLiquidityGraphError(
        "INVALID_LIQUIDITY_NODE",
        error.message,
        node.nodeId,
      );
    }

    throw error;
  }
}

function validateEdgeAgainstNodes(
  edge: CrossChainLiquidityGraphEdge,
  nodes: ReadonlyMap<
    CrossChainIdentifier,
    CrossChainLiquidityGraphNode
  >,
): void {
  assertNonEmptyString(edge.edgeId, "edge.edgeId");
  assertNonEmptyString(
    edge.sourceNodeId,
    "edge.sourceNodeId",
  );
  assertNonEmptyString(
    edge.destinationNodeId,
    "edge.destinationNodeId",
  );

  if (!nodes.has(edge.sourceNodeId)) {
    throw new CrossChainLiquidityGraphError(
      "SOURCE_NODE_NOT_FOUND",
      `Source node "${edge.sourceNodeId}" is not registered.`,
      edge.sourceNodeId,
    );
  }

  if (!nodes.has(edge.destinationNodeId)) {
    throw new CrossChainLiquidityGraphError(
      "DESTINATION_NODE_NOT_FOUND",
      `Destination node "${edge.destinationNodeId}" is not registered.`,
      edge.destinationNodeId,
    );
  }

  if (
    edge.sourceNodeId ===
    edge.destinationNodeId
  ) {
    throw new CrossChainLiquidityGraphError(
      "SELF_REFERENCING_EDGE",
      "Liquidity edge cannot connect a node to itself.",
      edge.edgeId,
    );
  }

  if (
    edge.bridgeId === null &&
    edge.venueId === null
  ) {
    throw new CrossChainLiquidityGraphError(
      "MISSING_EDGE_PROVIDER",
      "Liquidity edge must define bridgeId or venueId.",
      edge.edgeId,
    );
  }

  assertAtomicAmount(
    edge.capacityAtomic,
    "edge.capacityAtomic",
  );

  if (edge.estimatedFeeUsd !== null) {
    assertDecimalAmount(
      edge.estimatedFeeUsd,
      "edge.estimatedFeeUsd",
    );
  }

  assertNonNegativeInteger(
    edge.estimatedLatencyMilliseconds,
    "edge.estimatedLatencyMilliseconds",
  );
  assertNonNegativeInteger(
    edge.observedAt,
    "edge.observedAt",
  );
}

function comparePaths(
  left: CrossChainLiquidityPath,
  right: CrossChainLiquidityPath,
): number {
  const leftFee =
    left.totalEstimatedFeeUsd === null
      ? Number.POSITIVE_INFINITY
      : Number(left.totalEstimatedFeeUsd);

  const rightFee =
    right.totalEstimatedFeeUsd === null
      ? Number.POSITIVE_INFINITY
      : Number(right.totalEstimatedFeeUsd);

  if (leftFee !== rightFee) {
    return leftFee - rightFee;
  }

  if (
    left.totalEstimatedLatencyMilliseconds !==
    right.totalEstimatedLatencyMilliseconds
  ) {
    return (
      left.totalEstimatedLatencyMilliseconds -
      right.totalEstimatedLatencyMilliseconds
    );
  }

  if (left.hopCount !== right.hopCount) {
    return left.hopCount - right.hopCount;
  }

  const leftCapacity =
    BigInt(left.minimumCapacityAtomic);

  const rightCapacity =
    BigInt(right.minimumCapacityAtomic);

  if (leftCapacity !== rightCapacity) {
    return leftCapacity > rightCapacity ? -1 : 1;
  }

  return left.edgeIds.join("|").localeCompare(
    right.edgeIds.join("|"),
  );
}

export class DeterministicMultiChainLiquidityGraph {
  private readonly nodesById =
    new Map<
      CrossChainIdentifier,
      CrossChainLiquidityGraphNode
    >();

  private readonly edgesById =
    new Map<
      CrossChainIdentifier,
      CrossChainLiquidityGraphEdge
    >();

  private readonly outgoingEdgeIdsByNodeId =
    new Map<
      CrossChainIdentifier,
      Set<CrossChainIdentifier>
    >();

  private readonly incomingEdgeIdsByNodeId =
    new Map<
      CrossChainIdentifier,
      Set<CrossChainIdentifier>
    >();

  private readonly graphId: CrossChainIdentifier;

  private versionValue: number;

  private generatedAtValue: number;

  public constructor(
    options: CrossChainLiquidityGraphBuilderOptions,
  ) {
    assertNonEmptyString(
      options.graphId,
      "options.graphId",
    );

    this.graphId = options.graphId;
    this.versionValue =
      options.initialVersion ?? 0;
    this.generatedAtValue =
      options.generatedAt ?? 0;

    assertNonNegativeInteger(
      this.versionValue,
      "options.initialVersion",
    );
    assertNonNegativeInteger(
      this.generatedAtValue,
      "options.generatedAt",
    );

    const initialNodes =
      options.initialNodes ?? [];

    const initialEdges =
      options.initialEdges ?? [];

    for (const node of initialNodes) {
      this.addNode(node, {
        allowReplacement: false,
        incrementVersion: false,
      });
    }

    for (const edge of initialEdges) {
      this.addEdge(edge, {
        allowReplacement: false,
        incrementVersion: false,
      });
    }

    this.generatedAtValue = Math.max(
      this.generatedAtValue,
      ...initialNodes.map(
        (node) => node.observedAt,
      ),
      ...initialEdges.map(
        (edge) => edge.observedAt,
      ),
    );

    this.validateCurrentGraph();
  }

  public get version(): number {
    return this.versionValue;
  }

  public get generatedAt(): number {
    return this.generatedAtValue;
  }

  public get nodeCount(): number {
    return this.nodesById.size;
  }

  public get edgeCount(): number {
    return this.edgesById.size;
  }

  public addNode(
    node: CrossChainLiquidityGraphNode,
    options: Readonly<{
      allowReplacement?: boolean;
      incrementVersion?: boolean;
    }> = {},
  ): AddLiquidityNodeResult {
    validateNode(node);

    const existing =
      this.nodesById.get(node.nodeId);

    if (
      existing !== undefined &&
      options.allowReplacement !== true
    ) {
      throw new CrossChainLiquidityGraphError(
        "DUPLICATE_NODE",
        `Liquidity node "${node.nodeId}" already exists.`,
        node.nodeId,
      );
    }

    if (existing !== undefined) {
      const connectedEdges =
        this.getConnectedEdges(node.nodeId);

      for (const edge of connectedEdges) {
        const sourceMatches =
          edge.sourceNodeId === node.nodeId;

        const destinationMatches =
          edge.destinationNodeId === node.nodeId;

        if (
          sourceMatches ||
          destinationMatches
        ) {
          validateEdgeAgainstNodes(
            edge,
            new Map([
              ...this.nodesById.entries(),
              [node.nodeId, node],
            ]),
          );
        }
      }
    }

    const immutableNode = freezeNode(node);

    this.nodesById.set(
      immutableNode.nodeId,
      immutableNode,
    );

    this.ensureNodeIndexes(
      immutableNode.nodeId,
    );

    this.generatedAtValue = Math.max(
      this.generatedAtValue,
      immutableNode.observedAt,
    );

    if (options.incrementVersion !== false) {
      this.versionValue += 1;
    }

    return Object.freeze({
      node: immutableNode,
      replaced: existing !== undefined,
      version: this.versionValue,
    });
  }

  public addNodes(
    nodes: readonly CrossChainLiquidityGraphNode[],
    options: Readonly<{
      allowReplacement?: boolean;
    }> = {},
  ): readonly AddLiquidityNodeResult[] {
    const snapshot = this.snapshot();

    try {
      const results = nodes.map((node) =>
        this.addNode(node, {
          allowReplacement:
            options.allowReplacement,
        }),
      );

      return freezeArray(results);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  public removeNode(
    nodeId: CrossChainIdentifier,
  ): RemoveLiquidityNodeResult {
    assertNonEmptyString(nodeId, "nodeId");

    if (!this.nodesById.has(nodeId)) {
      return Object.freeze({
        nodeId,
        removed: false,
        removedEdgeIds: Object.freeze([]),
        version: this.versionValue,
      });
    }

    const connectedEdges =
      this.getConnectedEdges(nodeId);

    const removedEdgeIds = connectedEdges
      .map((edge) => edge.edgeId)
      .sort(compareStrings);

    for (const edgeId of removedEdgeIds) {
      this.removeEdgeInternal(edgeId);
    }

    this.nodesById.delete(nodeId);
    this.outgoingEdgeIdsByNodeId.delete(nodeId);
    this.incomingEdgeIdsByNodeId.delete(nodeId);
    this.versionValue += 1;

    return Object.freeze({
      nodeId,
      removed: true,
      removedEdgeIds:
        freezeArray(removedEdgeIds),
      version: this.versionValue,
    });
  }

  public addEdge(
    edge: CrossChainLiquidityGraphEdge,
    options: Readonly<{
      allowReplacement?: boolean;
      incrementVersion?: boolean;
    }> = {},
  ): AddLiquidityEdgeResult {
    validateEdgeAgainstNodes(
      edge,
      this.nodesById,
    );

    const existing =
      this.edgesById.get(edge.edgeId);

    if (
      existing !== undefined &&
      options.allowReplacement !== true
    ) {
      throw new CrossChainLiquidityGraphError(
        "DUPLICATE_EDGE",
        `Liquidity edge "${edge.edgeId}" already exists.`,
        edge.edgeId,
      );
    }

    if (existing !== undefined) {
      this.removeEdgeIndexes(existing);
    }

    const immutableEdge = freezeEdge(edge);

    this.edgesById.set(
      immutableEdge.edgeId,
      immutableEdge,
    );
    this.addEdgeIndexes(immutableEdge);

    this.generatedAtValue = Math.max(
      this.generatedAtValue,
      immutableEdge.observedAt,
    );

    if (options.incrementVersion !== false) {
      this.versionValue += 1;
    }

    return Object.freeze({
      edge: immutableEdge,
      replaced: existing !== undefined,
      version: this.versionValue,
    });
  }

  public addEdges(
    edges: readonly CrossChainLiquidityGraphEdge[],
    options: Readonly<{
      allowReplacement?: boolean;
    }> = {},
  ): readonly AddLiquidityEdgeResult[] {
    const snapshot = this.snapshot();

    try {
      const results = edges.map((edge) =>
        this.addEdge(edge, {
          allowReplacement:
            options.allowReplacement,
        }),
      );

      return freezeArray(results);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  public removeEdge(
    edgeId: CrossChainIdentifier,
  ): RemoveLiquidityEdgeResult {
    assertNonEmptyString(edgeId, "edgeId");

    const removed =
      this.removeEdgeInternal(edgeId);

    if (removed) {
      this.versionValue += 1;
    }

    return Object.freeze({
      edgeId,
      removed,
      version: this.versionValue,
    });
  }

  public getNode(
    nodeId: CrossChainIdentifier,
  ): CrossChainLiquidityGraphNode | undefined {
    return this.nodesById.get(nodeId);
  }

  public requireNode(
    nodeId: CrossChainIdentifier,
  ): CrossChainLiquidityGraphNode {
    const node = this.getNode(nodeId);

    if (node === undefined) {
      throw new CrossChainLiquidityGraphError(
        "NODE_NOT_FOUND",
        `Liquidity node "${nodeId}" was not found.`,
        nodeId,
      );
    }

    return node;
  }

  public getEdge(
    edgeId: CrossChainIdentifier,
  ): CrossChainLiquidityGraphEdge | undefined {
    return this.edgesById.get(edgeId);
  }

  public requireEdge(
    edgeId: CrossChainIdentifier,
  ): CrossChainLiquidityGraphEdge {
    const edge = this.getEdge(edgeId);

    if (edge === undefined) {
      throw new CrossChainLiquidityGraphError(
        "EDGE_NOT_FOUND",
        `Liquidity edge "${edgeId}" was not found.`,
        edgeId,
      );
    }

    return edge;
  }

  public listNodes():
    readonly CrossChainLiquidityGraphNode[] {
    return freezeArray(
      [...this.nodesById.values()].sort(
        (left, right) =>
          compareStrings(
            left.nodeId,
            right.nodeId,
          ),
      ),
    );
  }

  public listEdges():
    readonly CrossChainLiquidityGraphEdge[] {
    return freezeArray(
      [...this.edgesById.values()].sort(
        (left, right) =>
          compareStrings(
            left.edgeId,
            right.edgeId,
          ),
      ),
    );
  }

  public listNodesForNetwork(
    networkId: CrossChainNetworkId,
  ): readonly CrossChainLiquidityGraphNode[] {
    assertNonEmptyString(
      networkId,
      "networkId",
    );

    return freezeArray(
      this.listNodes().filter(
        (node) =>
          node.network.networkId === networkId,
      ),
    );
  }

  public listNodesForAsset(
    networkId: CrossChainNetworkId,
    assetId: CrossChainIdentifier,
  ): readonly CrossChainLiquidityGraphNode[] {
    assertNonEmptyString(
      networkId,
      "networkId",
    );
    assertNonEmptyString(assetId, "assetId");

    return freezeArray(
      this.listNodes().filter(
        (node) =>
          node.asset.networkId === networkId &&
          node.asset.assetId === assetId,
      ),
    );
  }

  public getOutgoingEdges(
    nodeId: CrossChainIdentifier,
  ): readonly CrossChainLiquidityGraphEdge[] {
    this.requireNode(nodeId);

    const edgeIds =
      this.outgoingEdgeIdsByNodeId.get(nodeId);

    if (edgeIds === undefined) {
      return Object.freeze([]);
    }

    return freezeArray(
      [...edgeIds]
        .map((edgeId) =>
          this.edgesById.get(edgeId),
        )
        .filter(
          (
            edge,
          ): edge is CrossChainLiquidityGraphEdge =>
            edge !== undefined,
        )
        .sort((left, right) =>
          compareStrings(
            left.edgeId,
            right.edgeId,
          ),
        ),
    );
  }

  public getIncomingEdges(
    nodeId: CrossChainIdentifier,
  ): readonly CrossChainLiquidityGraphEdge[] {
    this.requireNode(nodeId);

    const edgeIds =
      this.incomingEdgeIdsByNodeId.get(nodeId);

    if (edgeIds === undefined) {
      return Object.freeze([]);
    }

    return freezeArray(
      [...edgeIds]
        .map((edgeId) =>
          this.edgesById.get(edgeId),
        )
        .filter(
          (
            edge,
          ): edge is CrossChainLiquidityGraphEdge =>
            edge !== undefined,
        )
        .sort((left, right) =>
          compareStrings(
            left.edgeId,
            right.edgeId,
          ),
        ),
    );
  }

  public getConnectedEdges(
    nodeId: CrossChainIdentifier,
  ): readonly CrossChainLiquidityGraphEdge[] {
    const edges = new Map<
      CrossChainIdentifier,
      CrossChainLiquidityGraphEdge
    >();

    for (const edge of this.getOutgoingEdges(nodeId)) {
      edges.set(edge.edgeId, edge);
    }

    for (const edge of this.getIncomingEdges(nodeId)) {
      edges.set(edge.edgeId, edge);
    }

    return freezeArray(
      [...edges.values()].sort(
        (left, right) =>
          compareStrings(
            left.edgeId,
            right.edgeId,
          ),
      ),
    );
  }

  public findPaths(
    request: CrossChainLiquidityPathSearchRequest,
  ): readonly CrossChainLiquidityPath[] {
    this.validatePathSearchRequest(request);

    this.requireNode(request.sourceNodeId);
    this.requireNode(request.destinationNodeId);

    if (
      request.sourceNodeId ===
      request.destinationNodeId
    ) {
      return Object.freeze([]);
    }

    const maximumHops =
      request.maximumHops ?? 4;

    const maximumResults =
      request.maximumResults ?? 25;

    const maximumLatency =
      request.maximumLatencyMilliseconds ??
      Number.MAX_SAFE_INTEGER;

    const maximumFee =
      request.maximumFeeUsd === undefined
        ? Number.POSITIVE_INFINITY
        : Number(request.maximumFeeUsd);

    const minimumCapacity =
      request.minimumCapacityAtomic === undefined
        ? 0n
        : BigInt(
            request.minimumCapacityAtomic,
          );

    const allowedBridgeIds =
      request.allowedBridgeIds === undefined
        ? null
        : new Set(request.allowedBridgeIds);

    const allowedVenueIds =
      request.allowedVenueIds === undefined
        ? null
        : new Set(request.allowedVenueIds);

    const results: CrossChainLiquidityPath[] =
      [];

    interface SearchState {
      readonly currentNodeId: CrossChainIdentifier;
      readonly nodeIds: readonly CrossChainIdentifier[];
      readonly edgeIds: readonly CrossChainIdentifier[];
      readonly totalFee: number;
      readonly feeKnown: boolean;
      readonly totalLatency: number;
      readonly minimumCapacity: bigint | null;
    }

    const stack: SearchState[] = [
      {
        currentNodeId: request.sourceNodeId,
        nodeIds: Object.freeze([
          request.sourceNodeId,
        ]),
        edgeIds: Object.freeze([]),
        totalFee: 0,
        feeKnown: true,
        totalLatency: 0,
        minimumCapacity: null,
      },
    ];

    while (stack.length > 0) {
      const state = stack.pop();

      if (state === undefined) {
        break;
      }

      if (state.edgeIds.length >= maximumHops) {
        continue;
      }

      const outgoingEdges =
        this.getOutgoingEdges(
          state.currentNodeId,
        )
          .filter(
            (edge) =>
              request.includeDisabledEdges === true ||
              edge.enabled,
          )
          .filter((edge) => {
            if (
              allowedBridgeIds !== null &&
              edge.bridgeId !== null &&
              !allowedBridgeIds.has(edge.bridgeId)
            ) {
              return false;
            }

            if (
              allowedVenueIds !== null &&
              edge.venueId !== null &&
              !allowedVenueIds.has(edge.venueId)
            ) {
              return false;
            }

            if (
              allowedBridgeIds !== null &&
              edge.bridgeId === null
            ) {
              return false;
            }

            if (
              allowedVenueIds !== null &&
              edge.venueId === null
            ) {
              return false;
            }

            return true;
          })
          .sort((left, right) =>
            compareStrings(
              right.edgeId,
              left.edgeId,
            ),
          );

      for (const edge of outgoingEdges) {
        if (
          state.nodeIds.includes(
            edge.destinationNodeId,
          )
        ) {
          continue;
        }

        const edgeCapacity =
          BigInt(edge.capacityAtomic);

        const nextMinimumCapacity =
          state.minimumCapacity === null
            ? edgeCapacity
            : state.minimumCapacity < edgeCapacity
              ? state.minimumCapacity
              : edgeCapacity;

        if (
          nextMinimumCapacity <
          minimumCapacity
        ) {
          continue;
        }

        const edgeFeeKnown =
          edge.estimatedFeeUsd !== null;

        const nextFeeKnown =
          state.feeKnown && edgeFeeKnown;

        const nextFee =
          state.totalFee +
          (
            edge.estimatedFeeUsd === null
              ? 0
              : Number(edge.estimatedFeeUsd)
          );

        if (
          nextFeeKnown &&
          nextFee > maximumFee
        ) {
          continue;
        }

        const nextLatency =
          state.totalLatency +
          edge.estimatedLatencyMilliseconds;

        if (nextLatency > maximumLatency) {
          continue;
        }

        const nextNodeIds = freezeArray([
          ...state.nodeIds,
          edge.destinationNodeId,
        ]);

        const nextEdgeIds = freezeArray([
          ...state.edgeIds,
          edge.edgeId,
        ]);

        if (
          edge.destinationNodeId ===
          request.destinationNodeId
        ) {
          const path: CrossChainLiquidityPath =
            Object.freeze({
              nodeIds: nextNodeIds,
              edgeIds: nextEdgeIds,
              totalEstimatedFeeUsd:
                nextFeeKnown
                  ? normalizeDecimal(nextFee)
                  : null,
              totalEstimatedLatencyMilliseconds:
                nextLatency,
              minimumCapacityAtomic:
                nextMinimumCapacity.toString(),
              hopCount: nextEdgeIds.length,
            });

          results.push(path);
          continue;
        }

        stack.push({
          currentNodeId:
            edge.destinationNodeId,
          nodeIds: nextNodeIds,
          edgeIds: nextEdgeIds,
          totalFee: nextFee,
          feeKnown: nextFeeKnown,
          totalLatency: nextLatency,
          minimumCapacity:
            nextMinimumCapacity,
        });
      }
    }

    results.sort(comparePaths);

    return freezeArray(
      results.slice(0, maximumResults),
    );
  }

  public buildGraph():
    CrossChainLiquidityGraph {
    return freezeGraph({
      graphId: this.graphId,
      version: this.versionValue,
      nodes: this.listNodes(),
      edges: this.listEdges(),
      generatedAt: this.generatedAtValue,
    });
  }

  public snapshot():
    CrossChainLiquidityGraphSnapshot {
    return Object.freeze({
      version: this.versionValue,
      graph: this.buildGraph(),
    });
  }

  public restore(
    snapshot: CrossChainLiquidityGraphSnapshot,
  ): void {
    assertNonNegativeInteger(
      snapshot.version,
      "snapshot.version",
    );

    try {
      validateCrossChainLiquidityGraph(
        snapshot.graph,
      );
    } catch (error) {
      if (error instanceof CrossChainValidationError) {
        throw new CrossChainLiquidityGraphError(
          "INVALID_GRAPH_SNAPSHOT",
          error.message,
        );
      }

      throw error;
    }

    if (
      snapshot.graph.graphId !== this.graphId
    ) {
      throw new CrossChainLiquidityGraphError(
        "GRAPH_ID_MISMATCH",
        `Snapshot graph ID "${snapshot.graph.graphId}" does not match "${this.graphId}".`,
        snapshot.graph.graphId,
      );
    }

    this.nodesById.clear();
    this.edgesById.clear();
    this.outgoingEdgeIdsByNodeId.clear();
    this.incomingEdgeIdsByNodeId.clear();

    for (const node of snapshot.graph.nodes) {
      const immutableNode = freezeNode(node);

      this.nodesById.set(
        immutableNode.nodeId,
        immutableNode,
      );
      this.ensureNodeIndexes(
        immutableNode.nodeId,
      );
    }

    for (const edge of snapshot.graph.edges) {
      validateEdgeAgainstNodes(
        edge,
        this.nodesById,
      );

      const immutableEdge = freezeEdge(edge);

      this.edgesById.set(
        immutableEdge.edgeId,
        immutableEdge,
      );
      this.addEdgeIndexes(immutableEdge);
    }

    this.versionValue = snapshot.version;
    this.generatedAtValue =
      snapshot.graph.generatedAt;

    this.validateCurrentGraph();
  }

  public clear(
    generatedAt = this.generatedAtValue,
  ): number {
    assertNonNegativeInteger(
      generatedAt,
      "generatedAt",
    );

    if (
      this.nodesById.size === 0 &&
      this.edgesById.size === 0
    ) {
      this.generatedAtValue = generatedAt;
      return this.versionValue;
    }

    this.nodesById.clear();
    this.edgesById.clear();
    this.outgoingEdgeIdsByNodeId.clear();
    this.incomingEdgeIdsByNodeId.clear();
    this.generatedAtValue = generatedAt;
    this.versionValue += 1;

    return this.versionValue;
  }

  private ensureNodeIndexes(
    nodeId: CrossChainIdentifier,
  ): void {
    if (
      !this.outgoingEdgeIdsByNodeId.has(nodeId)
    ) {
      this.outgoingEdgeIdsByNodeId.set(
        nodeId,
        new Set<CrossChainIdentifier>(),
      );
    }

    if (
      !this.incomingEdgeIdsByNodeId.has(nodeId)
    ) {
      this.incomingEdgeIdsByNodeId.set(
        nodeId,
        new Set<CrossChainIdentifier>(),
      );
    }
  }

  private addEdgeIndexes(
    edge: CrossChainLiquidityGraphEdge,
  ): void {
    this.ensureNodeIndexes(edge.sourceNodeId);
    this.ensureNodeIndexes(
      edge.destinationNodeId,
    );

    this.outgoingEdgeIdsByNodeId
      .get(edge.sourceNodeId)
      ?.add(edge.edgeId);

    this.incomingEdgeIdsByNodeId
      .get(edge.destinationNodeId)
      ?.add(edge.edgeId);
  }

  private removeEdgeIndexes(
    edge: CrossChainLiquidityGraphEdge,
  ): void {
    this.outgoingEdgeIdsByNodeId
      .get(edge.sourceNodeId)
      ?.delete(edge.edgeId);

    this.incomingEdgeIdsByNodeId
      .get(edge.destinationNodeId)
      ?.delete(edge.edgeId);
  }

  private removeEdgeInternal(
    edgeId: CrossChainIdentifier,
  ): boolean {
    const edge = this.edgesById.get(edgeId);

    if (edge === undefined) {
      return false;
    }

    this.removeEdgeIndexes(edge);
    this.edgesById.delete(edgeId);

    return true;
  }

  private validatePathSearchRequest(
    request: CrossChainLiquidityPathSearchRequest,
  ): void {
    assertNonEmptyString(
      request.sourceNodeId,
      "request.sourceNodeId",
    );
    assertNonEmptyString(
      request.destinationNodeId,
      "request.destinationNodeId",
    );

    if (request.maximumHops !== undefined) {
      assertPositiveInteger(
        request.maximumHops,
        "request.maximumHops",
      );
    }

    if (
      request.maximumLatencyMilliseconds !==
      undefined
    ) {
      assertNonNegativeInteger(
        request.maximumLatencyMilliseconds,
        "request.maximumLatencyMilliseconds",
      );
    }

    if (
      request.maximumFeeUsd !== undefined
    ) {
      assertDecimalAmount(
        request.maximumFeeUsd,
        "request.maximumFeeUsd",
      );
    }

    if (
      request.minimumCapacityAtomic !==
      undefined
    ) {
      assertAtomicAmount(
        request.minimumCapacityAtomic,
        "request.minimumCapacityAtomic",
      );
    }

    if (
      request.maximumResults !== undefined
    ) {
      assertPositiveInteger(
        request.maximumResults,
        "request.maximumResults",
      );
    }

    if (
      request.allowedBridgeIds !== undefined
    ) {
      const unique = new Set(
        request.allowedBridgeIds,
      );

      if (
        unique.size !==
        request.allowedBridgeIds.length
      ) {
        throw new CrossChainLiquidityGraphError(
          "DUPLICATE_ALLOWED_BRIDGE",
          "allowedBridgeIds must not contain duplicates.",
        );
      }

      for (
        const bridgeId of
        request.allowedBridgeIds
      ) {
        assertNonEmptyString(
          bridgeId,
          "request.allowedBridgeIds",
        );
      }
    }

    if (
      request.allowedVenueIds !== undefined
    ) {
      const unique = new Set(
        request.allowedVenueIds,
      );

      if (
        unique.size !==
        request.allowedVenueIds.length
      ) {
        throw new CrossChainLiquidityGraphError(
          "DUPLICATE_ALLOWED_VENUE",
          "allowedVenueIds must not contain duplicates.",
        );
      }

      for (
        const venueId of
        request.allowedVenueIds
      ) {
        assertNonEmptyString(
          venueId,
          "request.allowedVenueIds",
        );
      }
    }
  }

  private validateCurrentGraph(): void {
    try {
      validateCrossChainLiquidityGraph(
        this.buildGraph(),
      );
    } catch (error) {
      if (error instanceof CrossChainValidationError) {
        throw new CrossChainLiquidityGraphError(
          "INVALID_LIQUIDITY_GRAPH",
          error.message,
        );
      }

      throw error;
    }
  }
}