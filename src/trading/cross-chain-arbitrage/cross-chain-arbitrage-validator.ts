import {
  CROSS_CHAIN_ASSET_TYPES,
  CROSS_CHAIN_BRIDGE_SECURITY_MODELS,
  CROSS_CHAIN_BRIDGE_TYPES,
  CROSS_CHAIN_EXECUTION_MODES,
  CROSS_CHAIN_EXECUTION_STATUSES,
  CROSS_CHAIN_FAILURE_CATEGORIES,
  CROSS_CHAIN_NETWORK_ENVIRONMENTS,
  CROSS_CHAIN_OPPORTUNITY_STATUSES,
  CROSS_CHAIN_QUOTE_STATUSES,
  CROSS_CHAIN_RECOVERY_ACTIONS,
  CROSS_CHAIN_ROUTE_STEP_TYPES,
  CROSS_CHAIN_SETTLEMENT_STATUSES,
  CROSS_CHAIN_SUPPORTED_NETWORK_FAMILIES,
  CROSS_CHAIN_TRANSACTION_STATUSES,
  type CrossChainAmount,
  type CrossChainArbitrageOpportunity,
  type CrossChainAssetReference,
  type CrossChainBridgeCapabilities,
  type CrossChainBridgeDefinition,
  type CrossChainBridgeQuote,
  type CrossChainBridgeQuoteRequest,
  type CrossChainExecutionCondition,
  type CrossChainExecutionFailure,
  type CrossChainExecutionPlan,
  type CrossChainExecutionRecord,
  type CrossChainFeeEstimate,
  type CrossChainGasEstimate,
  type CrossChainLatencyEstimate,
  type CrossChainLiquidityGraph,
  type CrossChainNetworkReference,
  type CrossChainOpportunityDiscoveryRequest,
  type CrossChainOpportunityLeg,
  type CrossChainOptimizedRoute,
  type CrossChainProfitabilityBreakdown,
  type CrossChainRecoveryPlan,
  type CrossChainRouteConstraint,
  type CrossChainSettlementVerification,
  type CrossChainTransactionInstruction,
  type CrossChainTransactionReference,
} from "./cross-chain-arbitrage-contracts";

export class CrossChainValidationError extends Error {
  public readonly code: string;
  public readonly path: string;

  public constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);

    this.name = "CrossChainValidationError";
    this.code = code;
    this.path = path;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined;

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CrossChainValidationError(code, path, message);
}

function assertObject(
  value: unknown,
  path: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    fail(
      "INVALID_OBJECT",
      path,
      "must be a non-null object.",
    );
  }
}

function assertString(
  value: unknown,
  path: string,
  options: Readonly<{
    allowEmpty?: boolean;
    maximumLength?: number;
  }> = {},
): asserts value is string {
  if (typeof value !== "string") {
    fail(
      "INVALID_STRING",
      path,
      "must be a string.",
    );
  }

  if (options.allowEmpty !== true && value.trim().length === 0) {
    fail(
      "EMPTY_STRING",
      path,
      "must not be empty.",
    );
  }

  if (
    options.maximumLength !== undefined &&
    value.length > options.maximumLength
  ) {
    fail(
      "STRING_TOO_LONG",
      path,
      `must not exceed ${options.maximumLength} characters.`,
    );
  }
}

function assertNullableString(
  value: unknown,
  path: string,
  options: Readonly<{
    allowEmpty?: boolean;
    maximumLength?: number;
  }> = {},
): asserts value is string | null {
  if (value === null) {
    return;
  }

  assertString(value, path, options);
}

function assertBoolean(
  value: unknown,
  path: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    fail(
      "INVALID_BOOLEAN",
      path,
      "must be a boolean.",
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  path: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    fail(
      "INVALID_NUMBER",
      path,
      "must be a finite number.",
    );
  }
}

function assertNonNegativeNumber(
  value: unknown,
  path: string,
): asserts value is number {
  assertFiniteNumber(value, path);

  if (value < 0) {
    fail(
      "NEGATIVE_NUMBER",
      path,
      "must be greater than or equal to zero.",
    );
  }
}

function assertPositiveNumber(
  value: unknown,
  path: string,
): asserts value is number {
  assertFiniteNumber(value, path);

  if (value <= 0) {
    fail(
      "NON_POSITIVE_NUMBER",
      path,
      "must be greater than zero.",
    );
  }
}

function assertInteger(
  value: unknown,
  path: string,
): asserts value is number {
  assertFiniteNumber(value, path);

  if (!Number.isInteger(value)) {
    fail(
      "INVALID_INTEGER",
      path,
      "must be an integer.",
    );
  }
}

function assertNonNegativeInteger(
  value: unknown,
  path: string,
): asserts value is number {
  assertInteger(value, path);

  if (value < 0) {
    fail(
      "NEGATIVE_INTEGER",
      path,
      "must be greater than or equal to zero.",
    );
  }
}

function assertPositiveInteger(
  value: unknown,
  path: string,
): asserts value is number {
  assertInteger(value, path);

  if (value <= 0) {
    fail(
      "NON_POSITIVE_INTEGER",
      path,
      "must be greater than zero.",
    );
  }
}

function assertTimestamp(
  value: unknown,
  path: string,
): asserts value is number {
  assertNonNegativeInteger(value, path);
}

function assertPercentage(
  value: unknown,
  path: string,
): asserts value is number {
  assertFiniteNumber(value, path);

  if (value < 0 || value > 1) {
    fail(
      "INVALID_PERCENTAGE",
      path,
      "must be between 0 and 1 inclusive.",
    );
  }
}

function assertBasisPoints(
  value: unknown,
  path: string,
): asserts value is number {
  assertNonNegativeInteger(value, path);

  if (value > 100_000) {
    fail(
      "INVALID_BASIS_POINTS",
      path,
      "must not exceed 100000 basis points.",
    );
  }
}

function assertArray(
  value: unknown,
  path: string,
): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(
      "INVALID_ARRAY",
      path,
      "must be an array.",
    );
  }
}

function assertNonEmptyArray(
  value: unknown,
  path: string,
): asserts value is readonly unknown[] {
  assertArray(value, path);

  if (value.length === 0) {
    fail(
      "EMPTY_ARRAY",
      path,
      "must contain at least one item.",
    );
  }
}

function assertEnumValue<
  const TValues extends readonly string[],
>(
  value: unknown,
  allowedValues: TValues,
  path: string,
): asserts value is TValues[number] {
  if (
    typeof value !== "string" ||
    !allowedValues.includes(value)
  ) {
    fail(
      "INVALID_ENUM_VALUE",
      path,
      `must be one of: ${allowedValues.join(", ")}.`,
    );
  }
}

function assertAtomicIntegerString(
  value: unknown,
  path: string,
  options: Readonly<{
    allowZero?: boolean;
    allowNegative?: boolean;
  }> = {},
): asserts value is string {
  assertString(value, path);

  const pattern =
    options.allowNegative === true
      ? /^-?\d+$/
      : /^\d+$/;

  if (!pattern.test(value)) {
    fail(
      "INVALID_INTEGER_STRING",
      path,
      "must contain only base-10 integer digits.",
    );
  }

  let parsed: bigint;

  try {
    parsed = BigInt(value);
  } catch {
    fail(
      "INVALID_INTEGER_STRING",
      path,
      "must be representable as a bigint.",
    );
  }

  if (
    options.allowNegative !== true &&
    parsed < 0n
  ) {
    fail(
      "NEGATIVE_INTEGER_STRING",
      path,
      "must not be negative.",
    );
  }

  if (
    options.allowZero !== true &&
    parsed === 0n
  ) {
    fail(
      "ZERO_INTEGER_STRING",
      path,
      "must be greater than zero.",
    );
  }
}

function assertDecimalString(
  value: unknown,
  path: string,
  options: Readonly<{
    allowZero?: boolean;
    allowNegative?: boolean;
  }> = {},
): asserts value is string {
  assertString(value, path);

  const pattern =
    options.allowNegative === true
      ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
      : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

  if (!pattern.test(value)) {
    fail(
      "INVALID_DECIMAL_STRING",
      path,
      "must be a canonical base-10 decimal string.",
    );
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    fail(
      "INVALID_DECIMAL_STRING",
      path,
      "must represent a finite numeric value.",
    );
  }

  if (
    options.allowNegative !== true &&
    parsed < 0
  ) {
    fail(
      "NEGATIVE_DECIMAL_STRING",
      path,
      "must not be negative.",
    );
  }

  if (
    options.allowZero !== true &&
    parsed === 0
  ) {
    fail(
      "ZERO_DECIMAL_STRING",
      path,
      "must be greater than zero.",
    );
  }
}

function assertNullableDecimalString(
  value: unknown,
  path: string,
  options: Readonly<{
    allowZero?: boolean;
    allowNegative?: boolean;
  }> = {},
): asserts value is string | null {
  if (value === null) {
    return;
  }

  assertDecimalString(value, path, options);
}

function assertUniqueStrings(
  values: readonly string[],
  path: string,
): void {
  const unique = new Set(values);

  if (unique.size !== values.length) {
    fail(
      "DUPLICATE_VALUE",
      path,
      "must not contain duplicate values.",
    );
  }
}

function assertUniqueBy<T>(
  values: readonly T[],
  selector: (value: T) => Primitive,
  path: string,
): void {
  const seen = new Set<Primitive>();

  for (const value of values) {
    const selected = selector(value);

    if (seen.has(selected)) {
      fail(
        "DUPLICATE_VALUE",
        path,
        `contains duplicate value "${String(selected)}".`,
      );
    }

    seen.add(selected);
  }
}

function assertChronologicalOrder(
  earlier: number,
  later: number,
  earlierPath: string,
  laterPath: string,
): void {
  if (later < earlier) {
    fail(
      "INVALID_TIME_ORDER",
      laterPath,
      `must be greater than or equal to ${earlierPath}.`,
    );
  }
}

function assertReadonlyRecord(
  value: unknown,
  path: string,
): void {
  assertObject(value, path);

  for (const [key, item] of Object.entries(value)) {
    assertString(key, `${path}.key`);

    if (
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean" &&
      item !== null
    ) {
      fail(
        "INVALID_METADATA_VALUE",
        `${path}.${key}`,
        "must be a string, number, boolean, or null.",
      );
    }

    if (
      typeof item === "number" &&
      !Number.isFinite(item)
    ) {
      fail(
        "INVALID_METADATA_NUMBER",
        `${path}.${key}`,
        "must be finite.",
      );
    }
  }
}

export function validateCrossChainNetworkReference(
  network: CrossChainNetworkReference,
  path = "network",
): void {
  assertObject(network, path);
  assertString(network.networkId, `${path}.networkId`);
  assertString(network.chainId, `${path}.chainId`);
  assertString(network.name, `${path}.name`);
  assertEnumValue(
    network.family,
    CROSS_CHAIN_SUPPORTED_NETWORK_FAMILIES,
    `${path}.family`,
  );
  assertEnumValue(
    network.environment,
    CROSS_CHAIN_NETWORK_ENVIRONMENTS,
    `${path}.environment`,
  );
  assertString(
    network.nativeAssetSymbol,
    `${path}.nativeAssetSymbol`,
  );
}

export function validateCrossChainAssetReference(
  asset: CrossChainAssetReference,
  path = "asset",
): void {
  assertObject(asset, path);
  assertString(asset.networkId, `${path}.networkId`);
  assertString(asset.assetId, `${path}.assetId`);
  assertString(asset.symbol, `${path}.symbol`);
  assertString(asset.name, `${path}.name`);
  assertEnumValue(
    asset.type,
    CROSS_CHAIN_ASSET_TYPES,
    `${path}.type`,
  );
  assertNonNegativeInteger(
    asset.decimals,
    `${path}.decimals`,
  );

  if (asset.decimals > 255) {
    fail(
      "INVALID_DECIMALS",
      `${path}.decimals`,
      "must not exceed 255.",
    );
  }

  assertNullableString(
    asset.contractAddress,
    `${path}.contractAddress`,
  );
  assertNullableString(
    asset.canonicalAssetId,
    `${path}.canonicalAssetId`,
  );
}

export function validateCrossChainAmount(
  amount: CrossChainAmount,
  path = "amount",
  options: Readonly<{
    allowZero?: boolean;
  }> = {},
): void {
  assertObject(amount, path);
  validateCrossChainAssetReference(
    amount.asset,
    `${path}.asset`,
  );
  assertAtomicIntegerString(
    amount.atomicAmount,
    `${path}.atomicAmount`,
    {
      allowZero: options.allowZero,
    },
  );
  assertDecimalString(
    amount.decimalAmount,
    `${path}.decimalAmount`,
    {
      allowZero: options.allowZero,
    },
  );
}

export function validateCrossChainGasEstimate(
  estimate: CrossChainGasEstimate,
  path = "gasEstimate",
): void {
  assertObject(estimate, path);
  assertString(estimate.networkId, `${path}.networkId`);
  assertAtomicIntegerString(
    estimate.gasLimit,
    `${path}.gasLimit`,
  );

  if (estimate.maxFeePerGasAtomic !== null) {
    assertAtomicIntegerString(
      estimate.maxFeePerGasAtomic,
      `${path}.maxFeePerGasAtomic`,
      { allowZero: true },
    );
  }

  if (estimate.maxPriorityFeePerGasAtomic !== null) {
    assertAtomicIntegerString(
      estimate.maxPriorityFeePerGasAtomic,
      `${path}.maxPriorityFeePerGasAtomic`,
      { allowZero: true },
    );
  }

  if (estimate.legacyGasPriceAtomic !== null) {
    assertAtomicIntegerString(
      estimate.legacyGasPriceAtomic,
      `${path}.legacyGasPriceAtomic`,
      { allowZero: true },
    );
  }

  assertAtomicIntegerString(
    estimate.estimatedNativeFeeAtomic,
    `${path}.estimatedNativeFeeAtomic`,
    { allowZero: true },
  );
  assertDecimalString(
    estimate.estimatedNativeFeeDecimal,
    `${path}.estimatedNativeFeeDecimal`,
    { allowZero: true },
  );
  assertNullableDecimalString(
    estimate.estimatedUsdFee,
    `${path}.estimatedUsdFee`,
    { allowZero: true },
  );

  if (
    estimate.maxFeePerGasAtomic !== null &&
    estimate.legacyGasPriceAtomic !== null
  ) {
    fail(
      "CONFLICTING_GAS_PRICING",
      path,
      "cannot define both EIP-1559 and legacy gas pricing.",
    );
  }
}

export function validateCrossChainFeeEstimate(
  estimate: CrossChainFeeEstimate,
  path = "feeEstimate",
): void {
  assertObject(estimate, path);

  if (estimate.sourceNetworkFee !== null) {
    validateCrossChainGasEstimate(
      estimate.sourceNetworkFee,
      `${path}.sourceNetworkFee`,
    );
  }

  if (estimate.destinationNetworkFee !== null) {
    validateCrossChainGasEstimate(
      estimate.destinationNetworkFee,
      `${path}.destinationNetworkFee`,
    );
  }

  const collections = [
    ["bridgeFees", estimate.bridgeFees],
    ["protocolFees", estimate.protocolFees],
    ["liquidityProviderFees", estimate.liquidityProviderFees],
  ] as const;

  for (const [collectionName, collection] of collections) {
    assertArray(collection, `${path}.${collectionName}`);

    collection.forEach((component, index) => {
      const componentPath =
        `${path}.${collectionName}[${index}]`;

      assertObject(component, componentPath);
      assertString(component.code, `${componentPath}.code`);
      assertString(
        component.description,
        `${componentPath}.description`,
      );
      validateCrossChainAmount(
        component.amount,
        `${componentPath}.amount`,
        { allowZero: true },
      );
      assertNullableDecimalString(
        component.usdValue,
        `${componentPath}.usdValue`,
        { allowZero: true },
      );
    });

    assertUniqueBy(
      collection,
      (component) => component.code,
      `${path}.${collectionName}`,
    );
  }

  assertNullableDecimalString(
    estimate.totalFeeUsd,
    `${path}.totalFeeUsd`,
    { allowZero: true },
  );
  assertTimestamp(
    estimate.calculatedAt,
    `${path}.calculatedAt`,
  );
}

export function validateCrossChainLatencyEstimate(
  estimate: CrossChainLatencyEstimate,
  path = "latencyEstimate",
): void {
  assertObject(estimate, path);
  assertNonNegativeInteger(
    estimate.minimumMilliseconds,
    `${path}.minimumMilliseconds`,
  );
  assertNonNegativeInteger(
    estimate.expectedMilliseconds,
    `${path}.expectedMilliseconds`,
  );
  assertNonNegativeInteger(
    estimate.maximumMilliseconds,
    `${path}.maximumMilliseconds`,
  );
  assertNonNegativeInteger(
    estimate.sourceConfirmationMilliseconds,
    `${path}.sourceConfirmationMilliseconds`,
  );
  assertNonNegativeInteger(
    estimate.bridgeProcessingMilliseconds,
    `${path}.bridgeProcessingMilliseconds`,
  );
  assertNonNegativeInteger(
    estimate.destinationConfirmationMilliseconds,
    `${path}.destinationConfirmationMilliseconds`,
  );
  assertPercentage(
    estimate.confidence,
    `${path}.confidence`,
  );
  assertTimestamp(
    estimate.calculatedAt,
    `${path}.calculatedAt`,
  );

  if (
    estimate.minimumMilliseconds >
    estimate.expectedMilliseconds
  ) {
    fail(
      "INVALID_LATENCY_RANGE",
      `${path}.expectedMilliseconds`,
      "must be greater than or equal to minimumMilliseconds.",
    );
  }

  if (
    estimate.expectedMilliseconds >
    estimate.maximumMilliseconds
  ) {
    fail(
      "INVALID_LATENCY_RANGE",
      `${path}.maximumMilliseconds`,
      "must be greater than or equal to expectedMilliseconds.",
    );
  }
}

export function validateCrossChainBridgeCapabilities(
  capabilities: CrossChainBridgeCapabilities,
  path = "capabilities",
): void {
  assertObject(capabilities, path);

  const booleanProperties = [
    "supportsAtomicExecution",
    "supportsContractCalls",
    "supportsNativeAssets",
    "supportsTokenAssets",
    "supportsGasDrop",
    "supportsRefunds",
    "supportsDestinationClaims",
    "supportsTransactionReplacement",
    "supportsStatusPolling",
    "supportsWebhooks",
    "supportsFinalityProofs",
  ] as const;

  for (const property of booleanProperties) {
    assertBoolean(
      capabilities[property],
      `${path}.${property}`,
    );
  }

  assertPositiveInteger(
    capabilities.maximumRouteHops,
    `${path}.maximumRouteHops`,
  );
}

export function validateCrossChainBridgeDefinition(
  bridge: CrossChainBridgeDefinition,
  path = "bridge",
): void {
  assertObject(bridge, path);
  assertString(bridge.bridgeId, `${path}.bridgeId`);
  assertString(bridge.name, `${path}.name`);
  assertEnumValue(
    bridge.type,
    CROSS_CHAIN_BRIDGE_TYPES,
    `${path}.type`,
  );
  assertEnumValue(
    bridge.securityModel,
    CROSS_CHAIN_BRIDGE_SECURITY_MODELS,
    `${path}.securityModel`,
  );
  assertBoolean(bridge.enabled, `${path}.enabled`);

  assertNonEmptyArray(
    bridge.networkPairs,
    `${path}.networkPairs`,
  );

  bridge.networkPairs.forEach((pair, index) => {
    const pairPath = `${path}.networkPairs[${index}]`;

    assertObject(pair, pairPath);
    assertString(
      pair.sourceNetworkId,
      `${pairPath}.sourceNetworkId`,
    );
    assertString(
      pair.destinationNetworkId,
      `${pairPath}.destinationNetworkId`,
    );
    assertBoolean(
      pair.bidirectional,
      `${pairPath}.bidirectional`,
    );

    if (
      pair.sourceNetworkId ===
      pair.destinationNetworkId
    ) {
      fail(
        "IDENTICAL_NETWORK_PAIR",
        pairPath,
        "source and destination networks must differ.",
      );
    }
  });

  assertUniqueBy(
    bridge.networkPairs,
    (pair) =>
      `${pair.sourceNetworkId}:${pair.destinationNetworkId}`,
    `${path}.networkPairs`,
  );

  assertNonEmptyArray(
    bridge.supportedAssets,
    `${path}.supportedAssets`,
  );

  bridge.supportedAssets.forEach((support, index) => {
    const supportPath =
      `${path}.supportedAssets[${index}]`;

    assertObject(support, supportPath);
    validateCrossChainAssetReference(
      support.sourceAsset,
      `${supportPath}.sourceAsset`,
    );
    validateCrossChainAssetReference(
      support.destinationAsset,
      `${supportPath}.destinationAsset`,
    );

    if (support.minimumAmountAtomic !== null) {
      assertAtomicIntegerString(
        support.minimumAmountAtomic,
        `${supportPath}.minimumAmountAtomic`,
      );
    }

    if (support.maximumAmountAtomic !== null) {
      assertAtomicIntegerString(
        support.maximumAmountAtomic,
        `${supportPath}.maximumAmountAtomic`,
      );
    }

    if (support.dailyLimitAtomic !== null) {
      assertAtomicIntegerString(
        support.dailyLimitAtomic,
        `${supportPath}.dailyLimitAtomic`,
      );
    }

    assertBoolean(
      support.requiresDestinationClaim,
      `${supportPath}.requiresDestinationClaim`,
    );

    if (
      support.sourceAsset.networkId ===
      support.destinationAsset.networkId
    ) {
      fail(
        "IDENTICAL_ASSET_NETWORK",
        supportPath,
        "source and destination assets must belong to different networks.",
      );
    }

    if (
      support.minimumAmountAtomic !== null &&
      support.maximumAmountAtomic !== null &&
      BigInt(support.minimumAmountAtomic) >
        BigInt(support.maximumAmountAtomic)
    ) {
      fail(
        "INVALID_AMOUNT_RANGE",
        `${supportPath}.maximumAmountAtomic`,
        "must be greater than or equal to minimumAmountAtomic.",
      );
    }
  });

  assertUniqueBy(
    bridge.supportedAssets,
    (support) =>
      [
        support.sourceAsset.networkId,
        support.sourceAsset.assetId,
        support.destinationAsset.networkId,
        support.destinationAsset.assetId,
      ].join(":"),
    `${path}.supportedAssets`,
  );

  validateCrossChainBridgeCapabilities(
    bridge.capabilities,
    `${path}.capabilities`,
  );
  assertReadonlyRecord(
    bridge.metadata,
    `${path}.metadata`,
  );
}

export function validateCrossChainLiquidityGraph(
  graph: CrossChainLiquidityGraph,
  path = "liquidityGraph",
): void {
  assertObject(graph, path);
  assertString(graph.graphId, `${path}.graphId`);
  assertPositiveInteger(graph.version, `${path}.version`);
  assertArray(graph.nodes, `${path}.nodes`);
  assertArray(graph.edges, `${path}.edges`);
  assertTimestamp(graph.generatedAt, `${path}.generatedAt`);

  graph.nodes.forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`;

    assertObject(node, nodePath);
    assertString(node.nodeId, `${nodePath}.nodeId`);
    validateCrossChainNetworkReference(
      node.network,
      `${nodePath}.network`,
    );
    validateCrossChainAssetReference(
      node.asset,
      `${nodePath}.asset`,
    );
    assertAtomicIntegerString(
      node.availableLiquidityAtomic,
      `${nodePath}.availableLiquidityAtomic`,
      { allowZero: true },
    );
    assertDecimalString(
      node.availableLiquidityDecimal,
      `${nodePath}.availableLiquidityDecimal`,
      { allowZero: true },
    );
    assertNullableDecimalString(
      node.usdValue,
      `${nodePath}.usdValue`,
      { allowZero: true },
    );
    assertTimestamp(
      node.observedAt,
      `${nodePath}.observedAt`,
    );

    if (
      node.network.networkId !==
      node.asset.networkId
    ) {
      fail(
        "NETWORK_ASSET_MISMATCH",
        nodePath,
        "network and asset network IDs must match.",
      );
    }
  });

  assertUniqueBy(
    graph.nodes,
    (node) => node.nodeId,
    `${path}.nodes`,
  );

  const nodeIds = new Set(
    graph.nodes.map((node) => node.nodeId),
  );

  graph.edges.forEach((edge, index) => {
    const edgePath = `${path}.edges[${index}]`;

    assertObject(edge, edgePath);
    assertString(edge.edgeId, `${edgePath}.edgeId`);
    assertString(
      edge.sourceNodeId,
      `${edgePath}.sourceNodeId`,
    );
    assertString(
      edge.destinationNodeId,
      `${edgePath}.destinationNodeId`,
    );
    assertNullableString(
      edge.bridgeId,
      `${edgePath}.bridgeId`,
    );
    assertNullableString(
      edge.venueId,
      `${edgePath}.venueId`,
    );
    assertAtomicIntegerString(
      edge.capacityAtomic,
      `${edgePath}.capacityAtomic`,
      { allowZero: true },
    );
    assertNullableDecimalString(
      edge.estimatedFeeUsd,
      `${edgePath}.estimatedFeeUsd`,
      { allowZero: true },
    );
    assertNonNegativeInteger(
      edge.estimatedLatencyMilliseconds,
      `${edgePath}.estimatedLatencyMilliseconds`,
    );
    assertBoolean(edge.enabled, `${edgePath}.enabled`);
    assertTimestamp(
      edge.observedAt,
      `${edgePath}.observedAt`,
    );

    if (!nodeIds.has(edge.sourceNodeId)) {
      fail(
        "UNKNOWN_SOURCE_NODE",
        `${edgePath}.sourceNodeId`,
        "must reference an existing liquidity node.",
      );
    }

    if (!nodeIds.has(edge.destinationNodeId)) {
      fail(
        "UNKNOWN_DESTINATION_NODE",
        `${edgePath}.destinationNodeId`,
        "must reference an existing liquidity node.",
      );
    }

    if (
      edge.sourceNodeId ===
      edge.destinationNodeId
    ) {
      fail(
        "SELF_REFERENCING_EDGE",
        edgePath,
        "source and destination nodes must differ.",
      );
    }

    if (
      edge.bridgeId === null &&
      edge.venueId === null
    ) {
      fail(
        "MISSING_EDGE_PROVIDER",
        edgePath,
        "must define either bridgeId or venueId.",
      );
    }
  });

  assertUniqueBy(
    graph.edges,
    (edge) => edge.edgeId,
    `${path}.edges`,
  );
}

export function validateCrossChainBridgeQuoteRequest(
  request: CrossChainBridgeQuoteRequest,
  path = "quoteRequest",
): void {
  assertObject(request, path);
  assertString(request.requestId, `${path}.requestId`);
  assertString(request.bridgeId, `${path}.bridgeId`);
  validateCrossChainNetworkReference(
    request.sourceNetwork,
    `${path}.sourceNetwork`,
  );
  validateCrossChainNetworkReference(
    request.destinationNetwork,
    `${path}.destinationNetwork`,
  );
  validateCrossChainAmount(
    request.sourceAmount,
    `${path}.sourceAmount`,
  );
  validateCrossChainAssetReference(
    request.destinationAsset,
    `${path}.destinationAsset`,
  );
  assertString(
    request.senderAddress,
    `${path}.senderAddress`,
  );
  assertString(
    request.recipientAddress,
    `${path}.recipientAddress`,
  );
  assertBasisPoints(
    request.maximumSlippageBps,
    `${path}.maximumSlippageBps`,
  );
  assertTimestamp(
    request.requestedAt,
    `${path}.requestedAt`,
  );
  assertTimestamp(
    request.deadline,
    `${path}.deadline`,
  );

  if (
    request.sourceNetwork.networkId ===
    request.destinationNetwork.networkId
  ) {
    fail(
      "IDENTICAL_NETWORKS",
      path,
      "source and destination networks must differ.",
    );
  }

  if (
    request.sourceAmount.asset.networkId !==
    request.sourceNetwork.networkId
  ) {
    fail(
      "SOURCE_ASSET_NETWORK_MISMATCH",
      `${path}.sourceAmount.asset.networkId`,
      "must match sourceNetwork.networkId.",
    );
  }

  if (
    request.destinationAsset.networkId !==
    request.destinationNetwork.networkId
  ) {
    fail(
      "DESTINATION_ASSET_NETWORK_MISMATCH",
      `${path}.destinationAsset.networkId`,
      "must match destinationNetwork.networkId.",
    );
  }

  assertChronologicalOrder(
    request.requestedAt,
    request.deadline,
    `${path}.requestedAt`,
    `${path}.deadline`,
  );
}

export function validateCrossChainBridgeQuote(
  quote: CrossChainBridgeQuote,
  path = "quote",
): void {
  assertObject(quote, path);
  assertString(quote.quoteId, `${path}.quoteId`);
  assertString(quote.requestId, `${path}.requestId`);
  assertString(quote.bridgeId, `${path}.bridgeId`);
  assertEnumValue(
    quote.status,
    CROSS_CHAIN_QUOTE_STATUSES,
    `${path}.status`,
  );
  validateCrossChainAmount(
    quote.sourceAmount,
    `${path}.sourceAmount`,
  );
  validateCrossChainAmount(
    quote.estimatedDestinationAmount,
    `${path}.estimatedDestinationAmount`,
    { allowZero: true },
  );
  validateCrossChainAmount(
    quote.minimumDestinationAmount,
    `${path}.minimumDestinationAmount`,
    { allowZero: true },
  );
  validateCrossChainFeeEstimate(
    quote.feeEstimate,
    `${path}.feeEstimate`,
  );
  validateCrossChainLatencyEstimate(
    quote.latencyEstimate,
    `${path}.latencyEstimate`,
  );
  assertTimestamp(
    quote.validFrom,
    `${path}.validFrom`,
  );
  assertTimestamp(
    quote.expiresAt,
    `${path}.expiresAt`,
  );
  assertNullableString(
    quote.providerReference,
    `${path}.providerReference`,
  );
  assertReadonlyRecord(
    quote.metadata,
    `${path}.metadata`,
  );

  assertChronologicalOrder(
    quote.validFrom,
    quote.expiresAt,
    `${path}.validFrom`,
    `${path}.expiresAt`,
  );

  if (
    quote.estimatedDestinationAmount.asset.assetId !==
    quote.minimumDestinationAmount.asset.assetId
  ) {
    fail(
      "DESTINATION_ASSET_MISMATCH",
      path,
      "estimated and minimum destination amounts must use the same asset.",
    );
  }

  if (
    BigInt(quote.minimumDestinationAmount.atomicAmount) >
    BigInt(quote.estimatedDestinationAmount.atomicAmount)
  ) {
    fail(
      "INVALID_MINIMUM_OUTPUT",
      `${path}.minimumDestinationAmount.atomicAmount`,
      "must not exceed estimatedDestinationAmount.atomicAmount.",
    );
  }
}

export function validateCrossChainProfitabilityBreakdown(
  profitability: CrossChainProfitabilityBreakdown,
  path = "profitability",
): void {
  assertObject(profitability, path);

  assertDecimalString(
    profitability.initialCapitalUsd,
    `${path}.initialCapitalUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.grossProceedsUsd,
    `${path}.grossProceedsUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.grossProfitUsd,
    `${path}.grossProfitUsd`,
    {
      allowZero: true,
      allowNegative: true,
    },
  );
  assertDecimalString(
    profitability.sourceTradingFeesUsd,
    `${path}.sourceTradingFeesUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.bridgeFeesUsd,
    `${path}.bridgeFeesUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.destinationTradingFeesUsd,
    `${path}.destinationTradingFeesUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.networkFeesUsd,
    `${path}.networkFeesUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.slippageCostUsd,
    `${path}.slippageCostUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.riskBufferUsd,
    `${path}.riskBufferUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    profitability.netProfitUsd,
    `${path}.netProfitUsd`,
    {
      allowZero: true,
      allowNegative: true,
    },
  );
  assertInteger(
    profitability.returnOnCapitalBps,
    `${path}.returnOnCapitalBps`,
  );

  if (profitability.annualizedReturnBps !== null) {
    assertInteger(
      profitability.annualizedReturnBps,
      `${path}.annualizedReturnBps`,
    );
  }

  assertBoolean(
    profitability.profitable,
    `${path}.profitable`,
  );
  assertTimestamp(
    profitability.calculatedAt,
    `${path}.calculatedAt`,
  );

  const netProfit = Number(
    profitability.netProfitUsd,
  );

  if (
    profitability.profitable !==
    (netProfit > 0)
  ) {
    fail(
      "PROFITABILITY_FLAG_MISMATCH",
      `${path}.profitable`,
      "must match whether netProfitUsd is greater than zero.",
    );
  }
}

export function validateCrossChainOpportunityLeg(
  leg: CrossChainOpportunityLeg,
  path = "leg",
): void {
  assertObject(leg, path);
  assertString(leg.legId, `${path}.legId`);
  assertNonNegativeInteger(
    leg.sequence,
    `${path}.sequence`,
  );
  assertEnumValue(
    leg.type,
    CROSS_CHAIN_ROUTE_STEP_TYPES,
    `${path}.type`,
  );
  assertString(
    leg.sourceNetworkId,
    `${path}.sourceNetworkId`,
  );
  assertString(
    leg.destinationNetworkId,
    `${path}.destinationNetworkId`,
  );
  assertNullableString(
    leg.venueId,
    `${path}.venueId`,
  );
  assertNullableString(
    leg.bridgeId,
    `${path}.bridgeId`,
  );
  validateCrossChainAmount(
    leg.inputAmount,
    `${path}.inputAmount`,
  );
  validateCrossChainAmount(
    leg.expectedOutputAmount,
    `${path}.expectedOutputAmount`,
    { allowZero: true },
  );
  validateCrossChainAmount(
    leg.minimumOutputAmount,
    `${path}.minimumOutputAmount`,
    { allowZero: true },
  );
  assertNullableDecimalString(
    leg.expectedFeeUsd,
    `${path}.expectedFeeUsd`,
    { allowZero: true },
  );
  assertNonNegativeInteger(
    leg.expectedLatencyMilliseconds,
    `${path}.expectedLatencyMilliseconds`,
  );

  if (
    BigInt(leg.minimumOutputAmount.atomicAmount) >
    BigInt(leg.expectedOutputAmount.atomicAmount)
  ) {
    fail(
      "INVALID_MINIMUM_OUTPUT",
      `${path}.minimumOutputAmount.atomicAmount`,
      "must not exceed expectedOutputAmount.atomicAmount.",
    );
  }

  if (
    leg.type === "BRIDGE_TRANSFER" &&
    leg.bridgeId === null
  ) {
    fail(
      "MISSING_BRIDGE_ID",
      `${path}.bridgeId`,
      "is required for BRIDGE_TRANSFER legs.",
    );
  }

  if (
    (leg.type === "SOURCE_SWAP" ||
      leg.type === "DESTINATION_SWAP") &&
    leg.venueId === null
  ) {
    fail(
      "MISSING_VENUE_ID",
      `${path}.venueId`,
      "is required for swap legs.",
    );
  }
}

export function validateCrossChainArbitrageOpportunity(
  opportunity: CrossChainArbitrageOpportunity,
  path = "opportunity",
): void {
  assertObject(opportunity, path);
  assertString(
    opportunity.opportunityId,
    `${path}.opportunityId`,
  );
  assertEnumValue(
    opportunity.status,
    CROSS_CHAIN_OPPORTUNITY_STATUSES,
    `${path}.status`,
  );
  validateCrossChainNetworkReference(
    opportunity.sourceNetwork,
    `${path}.sourceNetwork`,
  );
  validateCrossChainNetworkReference(
    opportunity.destinationNetwork,
    `${path}.destinationNetwork`,
  );
  validateCrossChainAmount(
    opportunity.inputAmount,
    `${path}.inputAmount`,
  );
  validateCrossChainAmount(
    opportunity.expectedFinalAmount,
    `${path}.expectedFinalAmount`,
    { allowZero: true },
  );
  assertNonEmptyArray(
    opportunity.legs,
    `${path}.legs`,
  );

  opportunity.legs.forEach((leg, index) => {
    validateCrossChainOpportunityLeg(
      leg,
      `${path}.legs[${index}]`,
    );
  });

  assertUniqueBy(
    opportunity.legs,
    (leg) => leg.legId,
    `${path}.legs`,
  );

  opportunity.legs.forEach((leg, index) => {
    if (leg.sequence !== index) {
      fail(
        "INVALID_LEG_SEQUENCE",
        `${path}.legs[${index}].sequence`,
        `must equal its zero-based position ${index}.`,
      );
    }
  });

  assertArray(
    opportunity.bridgeQuotes,
    `${path}.bridgeQuotes`,
  );

  opportunity.bridgeQuotes.forEach((quote, index) => {
    validateCrossChainBridgeQuote(
      quote,
      `${path}.bridgeQuotes[${index}]`,
    );
  });

  assertUniqueBy(
    opportunity.bridgeQuotes,
    (quote) => quote.quoteId,
    `${path}.bridgeQuotes`,
  );

  validateCrossChainProfitabilityBreakdown(
    opportunity.profitability,
    `${path}.profitability`,
  );
  assertPercentage(
    opportunity.confidence,
    `${path}.confidence`,
  );
  assertTimestamp(
    opportunity.discoveredAt,
    `${path}.discoveredAt`,
  );
  assertTimestamp(
    opportunity.expiresAt,
    `${path}.expiresAt`,
  );
  assertReadonlyRecord(
    opportunity.metadata,
    `${path}.metadata`,
  );

  if (
    opportunity.sourceNetwork.networkId ===
    opportunity.destinationNetwork.networkId
  ) {
    fail(
      "IDENTICAL_NETWORKS",
      path,
      "source and destination networks must differ.",
    );
  }

  if (
    opportunity.inputAmount.asset.networkId !==
    opportunity.sourceNetwork.networkId
  ) {
    fail(
      "SOURCE_ASSET_NETWORK_MISMATCH",
      `${path}.inputAmount.asset.networkId`,
      "must match sourceNetwork.networkId.",
    );
  }

  if (
    opportunity.expectedFinalAmount.asset.networkId !==
    opportunity.destinationNetwork.networkId
  ) {
    fail(
      "DESTINATION_ASSET_NETWORK_MISMATCH",
      `${path}.expectedFinalAmount.asset.networkId`,
      "must match destinationNetwork.networkId.",
    );
  }

  assertChronologicalOrder(
    opportunity.discoveredAt,
    opportunity.expiresAt,
    `${path}.discoveredAt`,
    `${path}.expiresAt`,
  );
}

export function validateCrossChainRouteConstraint(
  constraint: CrossChainRouteConstraint,
  path = "constraint",
): void {
  assertObject(constraint, path);
  assertArray(
    constraint.allowedBridgeIds,
    `${path}.allowedBridgeIds`,
  );
  assertArray(
    constraint.deniedBridgeIds,
    `${path}.deniedBridgeIds`,
  );
  assertArray(
    constraint.allowedNetworkIds,
    `${path}.allowedNetworkIds`,
  );

  constraint.allowedBridgeIds.forEach((value, index) => {
    assertString(
      value,
      `${path}.allowedBridgeIds[${index}]`,
    );
  });

  constraint.deniedBridgeIds.forEach((value, index) => {
    assertString(
      value,
      `${path}.deniedBridgeIds[${index}]`,
    );
  });

  constraint.allowedNetworkIds.forEach((value, index) => {
    assertString(
      value,
      `${path}.allowedNetworkIds[${index}]`,
    );
  });

  assertUniqueStrings(
    constraint.allowedBridgeIds,
    `${path}.allowedBridgeIds`,
  );
  assertUniqueStrings(
    constraint.deniedBridgeIds,
    `${path}.deniedBridgeIds`,
  );
  assertUniqueStrings(
    constraint.allowedNetworkIds,
    `${path}.allowedNetworkIds`,
  );

  const denied = new Set(
    constraint.deniedBridgeIds,
  );

  for (const bridgeId of constraint.allowedBridgeIds) {
    if (denied.has(bridgeId)) {
      fail(
        "CONFLICTING_BRIDGE_CONSTRAINT",
        path,
        `bridge "${bridgeId}" cannot be both allowed and denied.`,
      );
    }
  }

  assertPositiveInteger(
    constraint.maximumBridgeHops,
    `${path}.maximumBridgeHops`,
  );
  assertPositiveInteger(
    constraint.maximumTotalLatencyMilliseconds,
    `${path}.maximumTotalLatencyMilliseconds`,
  );
  assertNullableDecimalString(
    constraint.maximumTotalFeeUsd,
    `${path}.maximumTotalFeeUsd`,
    { allowZero: true },
  );
  assertDecimalString(
    constraint.minimumNetProfitUsd,
    `${path}.minimumNetProfitUsd`,
    {
      allowZero: true,
      allowNegative: true,
    },
  );
  assertInteger(
    constraint.minimumReturnOnCapitalBps,
    `${path}.minimumReturnOnCapitalBps`,
  );
  assertBoolean(
    constraint.requireAtomicExecution,
    `${path}.requireAtomicExecution`,
  );
  assertBoolean(
    constraint.requireRefundSupport,
    `${path}.requireRefundSupport`,
  );
  assertBoolean(
    constraint.requireFinalityProofs,
    `${path}.requireFinalityProofs`,
  );
}

export function validateCrossChainOpportunityDiscoveryRequest(
  request: CrossChainOpportunityDiscoveryRequest,
  path = "discoveryRequest",
): void {
  assertObject(request, path);
  assertString(request.requestId, `${path}.requestId`);
  assertNonEmptyArray(
    request.sourceNetworks,
    `${path}.sourceNetworks`,
  );
  assertNonEmptyArray(
    request.destinationNetworks,
    `${path}.destinationNetworks`,
  );
  assertNonEmptyArray(
    request.candidateAssets,
    `${path}.candidateAssets`,
  );

  request.sourceNetworks.forEach((network, index) => {
    validateCrossChainNetworkReference(
      network,
      `${path}.sourceNetworks[${index}]`,
    );
  });

  request.destinationNetworks.forEach(
    (network, index) => {
      validateCrossChainNetworkReference(
        network,
        `${path}.destinationNetworks[${index}]`,
      );
    },
  );

  request.candidateAssets.forEach((asset, index) => {
    validateCrossChainAssetReference(
      asset,
      `${path}.candidateAssets[${index}]`,
    );
  });

  assertUniqueBy(
    request.sourceNetworks,
    (network) => network.networkId,
    `${path}.sourceNetworks`,
  );
  assertUniqueBy(
    request.destinationNetworks,
    (network) => network.networkId,
    `${path}.destinationNetworks`,
  );
  assertUniqueBy(
    request.candidateAssets,
    (asset) => `${asset.networkId}:${asset.assetId}`,
    `${path}.candidateAssets`,
  );

  validateCrossChainAmount(
    request.capitalAmount,
    `${path}.capitalAmount`,
  );
  validateCrossChainRouteConstraint(
    request.constraints,
    `${path}.constraints`,
  );
  assertTimestamp(
    request.requestedAt,
    `${path}.requestedAt`,
  );
}

export function validateCrossChainOptimizedRoute(
  route: CrossChainOptimizedRoute,
  path = "route",
): void {
  assertObject(route, path);
  assertString(route.routeId, `${path}.routeId`);
  assertString(
    route.opportunityId,
    `${path}.opportunityId`,
  );
  assertEnumValue(
    route.executionMode,
    CROSS_CHAIN_EXECUTION_MODES,
    `${path}.executionMode`,
  );
  assertNonEmptyArray(route.legs, `${path}.legs`);

  route.legs.forEach((leg, index) => {
    validateCrossChainOpportunityLeg(
      leg,
      `${path}.legs[${index}]`,
    );

    if (leg.sequence !== index) {
      fail(
        "INVALID_LEG_SEQUENCE",
        `${path}.legs[${index}].sequence`,
        `must equal its zero-based position ${index}.`,
      );
    }
  });

  assertUniqueBy(
    route.legs,
    (leg) => leg.legId,
    `${path}.legs`,
  );

  assertArray(
    route.selectedQuotes,
    `${path}.selectedQuotes`,
  );

  route.selectedQuotes.forEach((quote, index) => {
    validateCrossChainBridgeQuote(
      quote,
      `${path}.selectedQuotes[${index}]`,
    );
  });

  assertUniqueBy(
    route.selectedQuotes,
    (quote) => quote.quoteId,
    `${path}.selectedQuotes`,
  );

  validateCrossChainProfitabilityBreakdown(
    route.profitability,
    `${path}.profitability`,
  );
  assertNonNegativeInteger(
    route.totalExpectedLatencyMilliseconds,
    `${path}.totalExpectedLatencyMilliseconds`,
  );
  assertBoolean(
    route.atomicExecutionAvailable,
    `${path}.atomicExecutionAvailable`,
  );
  assertFiniteNumber(
    route.optimizationScore,
    `${path}.optimizationScore`,
  );
  assertTimestamp(
    route.createdAt,
    `${path}.createdAt`,
  );
  assertTimestamp(
    route.expiresAt,
    `${path}.expiresAt`,
  );

  assertChronologicalOrder(
    route.createdAt,
    route.expiresAt,
    `${path}.createdAt`,
    `${path}.expiresAt`,
  );

  if (
    route.executionMode === "ATOMIC" &&
    !route.atomicExecutionAvailable
  ) {
    fail(
      "ATOMIC_EXECUTION_UNAVAILABLE",
      `${path}.executionMode`,
      "cannot be ATOMIC when atomicExecutionAvailable is false.",
    );
  }
}

export function validateCrossChainTransactionInstruction(
  instruction: CrossChainTransactionInstruction,
  path = "instruction",
): void {
  assertObject(instruction, path);
  assertString(
    instruction.instructionId,
    `${path}.instructionId`,
  );
  assertNonNegativeInteger(
    instruction.sequence,
    `${path}.sequence`,
  );
  assertString(
    instruction.networkId,
    `${path}.networkId`,
  );
  assertEnumValue(
    instruction.type,
    CROSS_CHAIN_ROUTE_STEP_TYPES,
    `${path}.type`,
  );
  assertString(
    instruction.fromAddress,
    `${path}.fromAddress`,
  );
  assertString(
    instruction.toAddress,
    `${path}.toAddress`,
  );
  assertAtomicIntegerString(
    instruction.valueAtomic,
    `${path}.valueAtomic`,
    { allowZero: true },
  );
  assertNullableString(
    instruction.data,
    `${path}.data`,
    {
      allowEmpty: true,
    },
  );

  if (instruction.gasEstimate !== null) {
    validateCrossChainGasEstimate(
      instruction.gasEstimate,
      `${path}.gasEstimate`,
    );

    if (
      instruction.gasEstimate.networkId !==
      instruction.networkId
    ) {
      fail(
        "GAS_NETWORK_MISMATCH",
        `${path}.gasEstimate.networkId`,
        "must match instruction.networkId.",
      );
    }
  }

  assertArray(
    instruction.dependsOnInstructionIds,
    `${path}.dependsOnInstructionIds`,
  );

  instruction.dependsOnInstructionIds.forEach(
    (dependencyId, index) => {
      assertString(
        dependencyId,
        `${path}.dependsOnInstructionIds[${index}]`,
      );
    },
  );

  assertUniqueStrings(
    instruction.dependsOnInstructionIds,
    `${path}.dependsOnInstructionIds`,
  );

  if (
    instruction.dependsOnInstructionIds.includes(
      instruction.instructionId,
    )
  ) {
    fail(
      "SELF_DEPENDENCY",
      `${path}.dependsOnInstructionIds`,
      "must not reference its own instructionId.",
    );
  }

  assertReadonlyRecord(
    instruction.metadata,
    `${path}.metadata`,
  );
}

export function validateCrossChainExecutionCondition(
  condition: CrossChainExecutionCondition,
  path = "condition",
): void {
  assertObject(condition, path);
  assertString(
    condition.conditionId,
    `${path}.conditionId`,
  );
  assertString(
    condition.description,
    `${path}.description`,
  );
  assertBoolean(
    condition.required,
    `${path}.required`,
  );

  assertEnumValue(
    condition.checkType,
    [
      "BALANCE",
      "ALLOWANCE",
      "PRICE",
      "LIQUIDITY",
      "BRIDGE_AVAILABILITY",
      "PROFITABILITY",
      "FINALITY",
      "DEADLINE",
    ] as const,
    `${path}.checkType`,
  );

  assertReadonlyRecord(
    condition.parameters,
    `${path}.parameters`,
  );
}

export function validateCrossChainExecutionPlan(
  plan: CrossChainExecutionPlan,
  path = "plan",
): void {
  assertObject(plan, path);
  assertString(plan.planId, `${path}.planId`);
  assertString(
    plan.opportunityId,
    `${path}.opportunityId`,
  );
  assertString(plan.routeId, `${path}.routeId`);
  assertEnumValue(
    plan.executionMode,
    CROSS_CHAIN_EXECUTION_MODES,
    `${path}.executionMode`,
  );
  assertNonEmptyArray(
    plan.instructions,
    `${path}.instructions`,
  );

  plan.instructions.forEach((instruction, index) => {
    validateCrossChainTransactionInstruction(
      instruction,
      `${path}.instructions[${index}]`,
    );

    if (instruction.sequence !== index) {
      fail(
        "INVALID_INSTRUCTION_SEQUENCE",
        `${path}.instructions[${index}].sequence`,
        `must equal its zero-based position ${index}.`,
      );
    }
  });

  assertUniqueBy(
    plan.instructions,
    (instruction) => instruction.instructionId,
    `${path}.instructions`,
  );

  const instructionIds = new Set(
    plan.instructions.map(
      (instruction) => instruction.instructionId,
    ),
  );

  plan.instructions.forEach((instruction, index) => {
    for (
      const dependencyId of
      instruction.dependsOnInstructionIds
    ) {
      if (!instructionIds.has(dependencyId)) {
        fail(
          "UNKNOWN_INSTRUCTION_DEPENDENCY",
          `${path}.instructions[${index}].dependsOnInstructionIds`,
          `references unknown instruction "${dependencyId}".`,
        );
      }

      const dependency = plan.instructions.find(
        (candidate) =>
          candidate.instructionId === dependencyId,
      );

      if (
        dependency !== undefined &&
        dependency.sequence >= instruction.sequence
      ) {
        fail(
          "INVALID_INSTRUCTION_DEPENDENCY_ORDER",
          `${path}.instructions[${index}].dependsOnInstructionIds`,
          `dependency "${dependencyId}" must precede the instruction.`,
        );
      }
    }
  });

  assertArray(
    plan.preconditions,
    `${path}.preconditions`,
  );

  plan.preconditions.forEach((condition, index) => {
    validateCrossChainExecutionCondition(
      condition,
      `${path}.preconditions[${index}]`,
    );
  });

  assertUniqueBy(
    plan.preconditions,
    (condition) => condition.conditionId,
    `${path}.preconditions`,
  );

  validateCrossChainProfitabilityBreakdown(
    plan.profitability,
    `${path}.profitability`,
  );

  assertObject(
    plan.senderAddresses,
    `${path}.senderAddresses`,
  );

  for (const [networkId, address] of Object.entries(
    plan.senderAddresses,
  )) {
    assertString(
      networkId,
      `${path}.senderAddresses.key`,
    );
    assertString(
      address,
      `${path}.senderAddresses.${networkId}`,
    );
  }

  assertObject(
    plan.recipientAddresses,
    `${path}.recipientAddresses`,
  );

  for (const [networkId, address] of Object.entries(
    plan.recipientAddresses,
  )) {
    assertString(
      networkId,
      `${path}.recipientAddresses.key`,
    );
    assertString(
      address,
      `${path}.recipientAddresses.${networkId}`,
    );
  }

  assertTimestamp(
    plan.createdAt,
    `${path}.createdAt`,
  );
  assertTimestamp(
    plan.expiresAt,
    `${path}.expiresAt`,
  );
  assertReadonlyRecord(
    plan.metadata,
    `${path}.metadata`,
  );

  assertChronologicalOrder(
    plan.createdAt,
    plan.expiresAt,
    `${path}.createdAt`,
    `${path}.expiresAt`,
  );
}

export function validateCrossChainTransactionReference(
  transaction: CrossChainTransactionReference,
  path = "transaction",
): void {
  assertObject(transaction, path);
  assertString(
    transaction.instructionId,
    `${path}.instructionId`,
  );
  assertString(
    transaction.networkId,
    `${path}.networkId`,
  );
  assertString(
    transaction.transactionHash,
    `${path}.transactionHash`,
  );
  assertNullableString(
    transaction.nonce,
    `${path}.nonce`,
  );

  if (transaction.nonce !== null) {
    assertAtomicIntegerString(
      transaction.nonce,
      `${path}.nonce`,
      { allowZero: true },
    );
  }

  assertEnumValue(
    transaction.status,
    CROSS_CHAIN_TRANSACTION_STATUSES,
    `${path}.status`,
  );
  assertTimestamp(
    transaction.submittedAt,
    `${path}.submittedAt`,
  );

  if (transaction.confirmedAt !== null) {
    assertTimestamp(
      transaction.confirmedAt,
      `${path}.confirmedAt`,
    );
    assertChronologicalOrder(
      transaction.submittedAt,
      transaction.confirmedAt,
      `${path}.submittedAt`,
      `${path}.confirmedAt`,
    );
  }

  if (transaction.finalizedAt !== null) {
    assertTimestamp(
      transaction.finalizedAt,
      `${path}.finalizedAt`,
    );

    const finalityBase =
      transaction.confirmedAt ??
      transaction.submittedAt;

    assertChronologicalOrder(
      finalityBase,
      transaction.finalizedAt,
      transaction.confirmedAt === null
        ? `${path}.submittedAt`
        : `${path}.confirmedAt`,
      `${path}.finalizedAt`,
    );
  }

  assertNullableString(
    transaction.blockNumber,
    `${path}.blockNumber`,
  );

  if (transaction.blockNumber !== null) {
    assertAtomicIntegerString(
      transaction.blockNumber,
      `${path}.blockNumber`,
      { allowZero: true },
    );
  }

  assertNullableString(
    transaction.blockHash,
    `${path}.blockHash`,
  );
  assertNullableString(
    transaction.failureReason,
    `${path}.failureReason`,
  );
}

export function validateCrossChainExecutionFailure(
  failure: CrossChainExecutionFailure,
  path = "failure",
): void {
  assertObject(failure, path);
  assertString(
    failure.failureId,
    `${path}.failureId`,
  );
  assertEnumValue(
    failure.category,
    CROSS_CHAIN_FAILURE_CATEGORIES,
    `${path}.category`,
  );
  assertString(failure.message, `${path}.message`);
  assertBoolean(
    failure.retryable,
    `${path}.retryable`,
  );
  assertNullableString(
    failure.failedInstructionId,
    `${path}.failedInstructionId`,
  );
  assertNullableString(
    failure.networkId,
    `${path}.networkId`,
  );
  assertNullableString(
    failure.bridgeId,
    `${path}.bridgeId`,
  );
  assertNullableString(
    failure.transactionHash,
    `${path}.transactionHash`,
  );
  assertTimestamp(
    failure.occurredAt,
    `${path}.occurredAt`,
  );
  assertReadonlyRecord(
    failure.metadata,
    `${path}.metadata`,
  );
}

export function validateCrossChainRecoveryPlan(
  recoveryPlan: CrossChainRecoveryPlan,
  path = "recoveryPlan",
): void {
  assertObject(recoveryPlan, path);
  assertString(
    recoveryPlan.recoveryPlanId,
    `${path}.recoveryPlanId`,
  );
  assertString(
    recoveryPlan.executionId,
    `${path}.executionId`,
  );
  assertEnumValue(
    recoveryPlan.action,
    CROSS_CHAIN_RECOVERY_ACTIONS,
    `${path}.action`,
  );
  validateCrossChainExecutionFailure(
    recoveryPlan.failure,
    `${path}.failure`,
  );
  assertArray(
    recoveryPlan.instructions,
    `${path}.instructions`,
  );

  recoveryPlan.instructions.forEach(
    (instruction, index) => {
      validateCrossChainTransactionInstruction(
        instruction,
        `${path}.instructions[${index}]`,
      );
    },
  );

  assertBoolean(
    recoveryPlan.automaticExecutionAllowed,
    `${path}.automaticExecutionAllowed`,
  );
  assertPositiveInteger(
    recoveryPlan.maximumAttempts,
    `${path}.maximumAttempts`,
  );
  assertNonNegativeInteger(
    recoveryPlan.retryDelayMilliseconds,
    `${path}.retryDelayMilliseconds`,
  );
  assertTimestamp(
    recoveryPlan.createdAt,
    `${path}.createdAt`,
  );

  if (recoveryPlan.expiresAt !== null) {
    assertTimestamp(
      recoveryPlan.expiresAt,
      `${path}.expiresAt`,
    );
    assertChronologicalOrder(
      recoveryPlan.createdAt,
      recoveryPlan.expiresAt,
      `${path}.createdAt`,
      `${path}.expiresAt`,
    );
  }

  if (
    recoveryPlan.action === "NONE" &&
    recoveryPlan.instructions.length > 0
  ) {
    fail(
      "UNEXPECTED_RECOVERY_INSTRUCTIONS",
      `${path}.instructions`,
      "must be empty when recovery action is NONE.",
    );
  }
}

export function validateCrossChainSettlementVerification(
  settlement: CrossChainSettlementVerification,
  path = "settlement",
): void {
  assertObject(settlement, path);
  assertString(
    settlement.verificationId,
    `${path}.verificationId`,
  );
  assertString(
    settlement.executionId,
    `${path}.executionId`,
  );
  assertEnumValue(
    settlement.status,
    CROSS_CHAIN_SETTLEMENT_STATUSES,
    `${path}.status`,
  );
  validateCrossChainAmount(
    settlement.expectedFinalAmount,
    `${path}.expectedFinalAmount`,
    { allowZero: true },
  );

  if (settlement.actualFinalAmount !== null) {
    validateCrossChainAmount(
      settlement.actualFinalAmount,
      `${path}.actualFinalAmount`,
      { allowZero: true },
    );
  }

  assertNullableString(
    settlement.amountDifferenceAtomic,
    `${path}.amountDifferenceAtomic`,
  );

  if (settlement.amountDifferenceAtomic !== null) {
    assertAtomicIntegerString(
      settlement.amountDifferenceAtomic,
      `${path}.amountDifferenceAtomic`,
      {
        allowZero: true,
        allowNegative: true,
      },
    );
  }

  assertBoolean(
    settlement.sourceTransactionsFinalized,
    `${path}.sourceTransactionsFinalized`,
  );
  assertBoolean(
    settlement.destinationTransactionsFinalized,
    `${path}.destinationTransactionsFinalized`,
  );
  assertBoolean(
    settlement.bridgeTransferVerified,
    `${path}.bridgeTransferVerified`,
  );

  if (settlement.finalityProofVerified !== null) {
    assertBoolean(
      settlement.finalityProofVerified,
      `${path}.finalityProofVerified`,
    );
  }

  assertTimestamp(
    settlement.verifiedAt,
    `${path}.verifiedAt`,
  );
  assertNullableString(
    settlement.failureReason,
    `${path}.failureReason`,
  );
  assertReadonlyRecord(
    settlement.metadata,
    `${path}.metadata`,
  );

  if (
    settlement.status === "VERIFIED" &&
    settlement.actualFinalAmount === null
  ) {
    fail(
      "MISSING_ACTUAL_FINAL_AMOUNT",
      `${path}.actualFinalAmount`,
      "is required for VERIFIED settlement.",
    );
  }

  if (
    settlement.status === "VERIFIED" &&
    settlement.failureReason !== null
  ) {
    fail(
      "UNEXPECTED_FAILURE_REASON",
      `${path}.failureReason`,
      "must be null for VERIFIED settlement.",
    );
  }

  if (
    (settlement.status === "FAILED" ||
      settlement.status === "MISMATCH") &&
    settlement.failureReason === null
  ) {
    fail(
      "MISSING_FAILURE_REASON",
      `${path}.failureReason`,
      "is required for failed or mismatched settlement.",
    );
  }
}

export function validateCrossChainExecutionRecord(
  execution: CrossChainExecutionRecord,
  path = "execution",
): void {
  assertObject(execution, path);
  assertString(
    execution.executionId,
    `${path}.executionId`,
  );
  validateCrossChainExecutionPlan(
    execution.plan,
    `${path}.plan`,
  );
  assertEnumValue(
    execution.status,
    CROSS_CHAIN_EXECUTION_STATUSES,
    `${path}.status`,
  );
  assertArray(
    execution.transactions,
    `${path}.transactions`,
  );

  execution.transactions.forEach(
    (transaction, index) => {
      validateCrossChainTransactionReference(
        transaction,
        `${path}.transactions[${index}]`,
      );
    },
  );

  assertUniqueBy(
    execution.transactions,
    (transaction) =>
      `${transaction.networkId}:${transaction.transactionHash}`,
    `${path}.transactions`,
  );

  assertArray(
    execution.bridgeTransfers,
    `${path}.bridgeTransfers`,
  );

  execution.bridgeTransfers.forEach(
    (transfer, index) => {
      const transferPath =
        `${path}.bridgeTransfers[${index}]`;

      assertObject(transfer, transferPath);
      assertString(
        transfer.bridgeId,
        `${transferPath}.bridgeId`,
      );
      assertString(
        transfer.quoteId,
        `${transferPath}.quoteId`,
      );
      assertNullableString(
        transfer.providerTransferId,
        `${transferPath}.providerTransferId`,
      );
      assertString(
        transfer.sourceTransactionHash,
        `${transferPath}.sourceTransactionHash`,
      );
      assertNullableString(
        transfer.destinationTransactionHash,
        `${transferPath}.destinationTransactionHash`,
      );
      assertString(
        transfer.sourceNetworkId,
        `${transferPath}.sourceNetworkId`,
      );
      assertString(
        transfer.destinationNetworkId,
        `${transferPath}.destinationNetworkId`,
      );
      validateCrossChainAmount(
        transfer.sourceAmount,
        `${transferPath}.sourceAmount`,
      );
      validateCrossChainAmount(
        transfer.expectedDestinationAmount,
        `${transferPath}.expectedDestinationAmount`,
        { allowZero: true },
      );

      if (
        transfer.receivedDestinationAmount !== null
      ) {
        validateCrossChainAmount(
          transfer.receivedDestinationAmount,
          `${transferPath}.receivedDestinationAmount`,
          { allowZero: true },
        );
      }

      assertTimestamp(
        transfer.initiatedAt,
        `${transferPath}.initiatedAt`,
      );

      if (transfer.completedAt !== null) {
        assertTimestamp(
          transfer.completedAt,
          `${transferPath}.completedAt`,
        );
        assertChronologicalOrder(
          transfer.initiatedAt,
          transfer.completedAt,
          `${transferPath}.initiatedAt`,
          `${transferPath}.completedAt`,
        );
      }
    },
  );

  if (execution.settlement !== null) {
    validateCrossChainSettlementVerification(
      execution.settlement,
      `${path}.settlement`,
    );

    if (
      execution.settlement.executionId !==
      execution.executionId
    ) {
      fail(
        "SETTLEMENT_EXECUTION_MISMATCH",
        `${path}.settlement.executionId`,
        "must match execution.executionId.",
      );
    }
  }

  if (execution.failure !== null) {
    validateCrossChainExecutionFailure(
      execution.failure,
      `${path}.failure`,
    );
  }

  if (execution.recoveryPlan !== null) {
    validateCrossChainRecoveryPlan(
      execution.recoveryPlan,
      `${path}.recoveryPlan`,
    );

    if (
      execution.recoveryPlan.executionId !==
      execution.executionId
    ) {
      fail(
        "RECOVERY_EXECUTION_MISMATCH",
        `${path}.recoveryPlan.executionId`,
        "must match execution.executionId.",
      );
    }
  }

  assertTimestamp(
    execution.startedAt,
    `${path}.startedAt`,
  );
  assertTimestamp(
    execution.updatedAt,
    `${path}.updatedAt`,
  );

  assertChronologicalOrder(
    execution.startedAt,
    execution.updatedAt,
    `${path}.startedAt`,
    `${path}.updatedAt`,
  );

  if (execution.completedAt !== null) {
    assertTimestamp(
      execution.completedAt,
      `${path}.completedAt`,
    );
    assertChronologicalOrder(
      execution.startedAt,
      execution.completedAt,
      `${path}.startedAt`,
      `${path}.completedAt`,
    );
  }

  assertPositiveInteger(
    execution.version,
    `${path}.version`,
  );
  assertReadonlyRecord(
    execution.metadata,
    `${path}.metadata`,
  );

  const terminalStatuses = new Set([
    "COMPLETED",
    "RECOVERED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
  ]);

  if (
    terminalStatuses.has(execution.status) &&
    execution.completedAt === null
  ) {
    fail(
      "MISSING_COMPLETION_TIMESTAMP",
      `${path}.completedAt`,
      "is required for terminal execution statuses.",
    );
  }

  if (
    !terminalStatuses.has(execution.status) &&
    execution.completedAt !== null
  ) {
    fail(
      "UNEXPECTED_COMPLETION_TIMESTAMP",
      `${path}.completedAt`,
      "must be null for non-terminal execution statuses.",
    );
  }

  if (
    execution.status === "FAILED" &&
    execution.failure === null
  ) {
    fail(
      "MISSING_EXECUTION_FAILURE",
      `${path}.failure`,
      "is required when execution status is FAILED.",
    );
  }

  if (
    execution.status === "COMPLETED" &&
    execution.settlement?.status !== "VERIFIED"
  ) {
    fail(
      "UNVERIFIED_COMPLETION",
      `${path}.settlement`,
      "must be VERIFIED when execution status is COMPLETED.",
    );
  }
}