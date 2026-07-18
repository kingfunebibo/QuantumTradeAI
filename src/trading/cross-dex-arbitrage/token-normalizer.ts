/**
 * QuantumTradeAI
 * Milestone 25 — Cross-DEX Arbitrage & Flash-Loan Execution
 *
 * Deterministic token and token-pair normalization.
 *
 * Responsibilities:
 * - Normalize EVM addresses and token metadata.
 * - Produce stable token identifiers.
 * - Resolve native/wrapped-native relationships.
 * - Compare token identity safely.
 * - Normalize token pairs into canonical token0/token1 ordering.
 * - Produce deterministic pair keys for registries, caches, and routing.
 *
 * This module performs no RPC, wallet, network, filesystem, or clock access.
 */

import {
  type ChainId,
  type EvmAddress,
  type EvmNetworkDescriptor,
  type NormalizedTokenPair,
  type TokenDescriptor,
  type TokenId,
  CROSS_DEX_ARBITRAGE_DEFAULTS,
} from "./cross-dex-arbitrage-contracts";

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_SYMBOL_PATTERN = /^[A-Za-z0-9._+\-]{1,32}$/;
const MAX_TOKEN_NAME_LENGTH = 128;
const MIN_TOKEN_DECIMALS = 0;
const MAX_TOKEN_DECIMALS = 255;

export class CrossDexTokenNormalizationError extends Error {
  public readonly code: CrossDexTokenNormalizationErrorCode;
  public readonly field?: string;
  public readonly value?: unknown;

  public constructor(
    code: CrossDexTokenNormalizationErrorCode,
    message: string,
    options?: Readonly<{
      field?: string;
      value?: unknown;
    }>,
  ) {
    super(message);
    this.name = "CrossDexTokenNormalizationError";
    this.code = code;
    this.field = options?.field;
    this.value = options?.value;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export enum CrossDexTokenNormalizationErrorCode {
  INVALID_CHAIN_ID = "INVALID_CHAIN_ID",
  INVALID_ADDRESS = "INVALID_ADDRESS",
  INVALID_SYMBOL = "INVALID_SYMBOL",
  INVALID_NAME = "INVALID_NAME",
  INVALID_DECIMALS = "INVALID_DECIMALS",
  INVALID_TOKEN_ID = "INVALID_TOKEN_ID",
  INVALID_WRAPPED_TOKEN_ADDRESS = "INVALID_WRAPPED_TOKEN_ADDRESS",
  NATIVE_TOKEN_ADDRESS_MISMATCH = "NATIVE_TOKEN_ADDRESS_MISMATCH",
  WRAPPED_NATIVE_TOKEN_MISMATCH = "WRAPPED_NATIVE_TOKEN_MISMATCH",
  DUPLICATE_PAIR_TOKEN = "DUPLICATE_PAIR_TOKEN",
  CROSS_CHAIN_PAIR = "CROSS_CHAIN_PAIR",
  TOKEN_CHAIN_MISMATCH = "TOKEN_CHAIN_MISMATCH",
}

export interface NormalizeTokenOptions {
  readonly network?: EvmNetworkDescriptor;
  readonly rejectZeroAddressForErc20?: boolean;
  readonly normalizeSymbolToUpperCase?: boolean;
  readonly normalizeCanonicalSymbolToUpperCase?: boolean;
  readonly preserveNameWhitespace?: boolean;
  readonly forceEnabled?: boolean;
}

export interface NormalizeTokenPairOptions {
  readonly network?: EvmNetworkDescriptor;
  readonly tokenOptions?: NormalizeTokenOptions;
  readonly rejectIdenticalTokens?: boolean;
}

export interface TokenIdentity {
  readonly chainId: ChainId;
  readonly address: EvmAddress;
  readonly key: string;
}

export interface TokenNormalizationResult {
  readonly token: TokenDescriptor;
  readonly identity: TokenIdentity;
  readonly changed: boolean;
  readonly changes: readonly string[];
}

export interface TokenPairNormalizationResult {
  readonly pair: NormalizedTokenPair;
  readonly token0Result: TokenNormalizationResult;
  readonly token1Result: TokenNormalizationResult;
  readonly reordered: boolean;
}

export function normalizeChainId(chainId: ChainId | number): ChainId {
  const numericChainId = Number(chainId);

  if (
    !Number.isSafeInteger(numericChainId) ||
    numericChainId <= 0
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_CHAIN_ID,
      "chainId must be a positive safe integer.",
      {
        field: "chainId",
        value: chainId,
      },
    );
  }

  return numericChainId as ChainId;
}

export function normalizeEvmAddress(
  address: EvmAddress | string,
  field = "address",
): EvmAddress {
  if (typeof address !== "string") {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_ADDRESS,
      `${field} must be a string.`,
      {
        field,
        value: address,
      },
    );
  }

  const trimmed = address.trim();

  if (!EVM_ADDRESS_PATTERN.test(trimmed)) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_ADDRESS,
      `${field} must be a valid 20-byte hexadecimal EVM address.`,
      {
        field,
        value: address,
      },
    );
  }

  return trimmed.toLowerCase() as EvmAddress;
}

export function isValidEvmAddress(
  address: unknown,
): address is EvmAddress {
  return (
    typeof address === "string" &&
    EVM_ADDRESS_PATTERN.test(address.trim())
  );
}

export function isZeroAddress(
  address: EvmAddress | string,
): boolean {
  return (
    normalizeEvmAddress(address) ===
    CROSS_DEX_ARBITRAGE_DEFAULTS.zeroAddress
  );
}

export function createTokenId(
  chainId: ChainId | number,
  address: EvmAddress | string,
): TokenId {
  const normalizedChainId = normalizeChainId(chainId);
  const normalizedAddress = normalizeEvmAddress(address);

  return `${normalizedChainId}:${normalizedAddress}` as TokenId;
}

export function createTokenIdentity(
  token: Pick<TokenDescriptor, "chainId" | "address">,
): TokenIdentity {
  const chainId = normalizeChainId(token.chainId);
  const address = normalizeEvmAddress(token.address);

  return Object.freeze({
    chainId,
    address,
    key: `${chainId}:${address}`,
  });
}

export function normalizeTokenDescriptor(
  token: TokenDescriptor,
  options: NormalizeTokenOptions = {},
): TokenDescriptor {
  return normalizeTokenDescriptorWithResult(token, options).token;
}

export function normalizeTokenDescriptorWithResult(
  token: TokenDescriptor,
  options: NormalizeTokenOptions = {},
): TokenNormalizationResult {
  const changes: string[] = [];

  const chainId = normalizeChainId(token.chainId);
  if (chainId !== token.chainId) {
    changes.push("chainId");
  }

  validateNetworkChain(chainId, options.network);

  const address = normalizeEvmAddress(
    token.address,
    "token.address",
  );
  if (address !== token.address) {
    changes.push("address");
  }

  const symbol = normalizeTokenSymbol(
    token.symbol,
    options.normalizeSymbolToUpperCase ?? true,
  );
  if (symbol !== token.symbol) {
    changes.push("symbol");
  }

  const name = normalizeTokenName(
    token.name,
    options.preserveNameWhitespace ?? false,
  );
  if (name !== token.name) {
    changes.push("name");
  }

  const decimals = normalizeTokenDecimals(token.decimals);

  const canonicalSymbol =
    token.canonicalSymbol === undefined
      ? undefined
      : normalizeTokenSymbol(
          token.canonicalSymbol,
          options.normalizeCanonicalSymbolToUpperCase ?? true,
          "token.canonicalSymbol",
        );

  if (canonicalSymbol !== token.canonicalSymbol) {
    changes.push("canonicalSymbol");
  }

  const wrappedTokenAddress =
    token.wrappedTokenAddress === undefined
      ? undefined
      : normalizeEvmAddress(
          token.wrappedTokenAddress,
          "token.wrappedTokenAddress",
        );

  if (wrappedTokenAddress !== token.wrappedTokenAddress) {
    changes.push("wrappedTokenAddress");
  }

  validateNativeTokenRules(
    {
      ...token,
      chainId,
      address,
      wrappedTokenAddress,
    },
    options.network,
    options.rejectZeroAddressForErc20 ?? true,
  );

  const id = createTokenId(chainId, address);
  if (id !== token.id) {
    changes.push("id");
  }

  const enabled = options.forceEnabled ?? token.enabled;
  if (enabled !== token.enabled) {
    changes.push("enabled");
  }

  const normalized: TokenDescriptor = Object.freeze({
    ...token,
    id,
    chainId,
    address,
    symbol,
    name,
    decimals,
    wrappedTokenAddress,
    canonicalSymbol,
    coingeckoId: normalizeOptionalText(
      token.coingeckoId,
      "token.coingeckoId",
    ),
    enabled,
    metadata:
      token.metadata === undefined
        ? undefined
        : Object.freeze({ ...token.metadata }),
  });

  return Object.freeze({
    token: normalized,
    identity: createTokenIdentity(normalized),
    changed: changes.length > 0,
    changes: Object.freeze([...changes]),
  });
}

export function normalizeTokenPair(
  tokenA: TokenDescriptor,
  tokenB: TokenDescriptor,
  options: NormalizeTokenPairOptions = {},
): NormalizedTokenPair {
  return normalizeTokenPairWithResult(
    tokenA,
    tokenB,
    options,
  ).pair;
}

export function normalizeTokenPairWithResult(
  tokenA: TokenDescriptor,
  tokenB: TokenDescriptor,
  options: NormalizeTokenPairOptions = {},
): TokenPairNormalizationResult {
  const tokenOptions: NormalizeTokenOptions = {
    ...options.tokenOptions,
    network: options.network ?? options.tokenOptions?.network,
  };

  const first = normalizeTokenDescriptorWithResult(
    tokenA,
    tokenOptions,
  );
  const second = normalizeTokenDescriptorWithResult(
    tokenB,
    tokenOptions,
  );

  if (first.token.chainId !== second.token.chainId) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.CROSS_CHAIN_PAIR,
      "A normalized token pair cannot contain tokens from different chains.",
      {
        field: "tokenPair.chainId",
        value: {
          tokenAChainId: first.token.chainId,
          tokenBChainId: second.token.chainId,
        },
      },
    );
  }

  const rejectIdenticalTokens =
    options.rejectIdenticalTokens ?? true;

  if (
    rejectIdenticalTokens &&
    areSameToken(first.token, second.token)
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.DUPLICATE_PAIR_TOKEN,
      "A token pair must contain two distinct token addresses.",
      {
        field: "tokenPair",
        value: first.identity.key,
      },
    );
  }

  const comparison = compareTokenOrder(
    first.token,
    second.token,
  );

  const token0 = comparison <= 0 ? first.token : second.token;
  const token1 = comparison <= 0 ? second.token : first.token;

  const pair: NormalizedTokenPair = Object.freeze({
    chainId: token0.chainId,
    token0,
    token1,
    pairKey: createPairKey(token0, token1),
  });

  return Object.freeze({
    pair,
    token0Result: comparison <= 0 ? first : second,
    token1Result: comparison <= 0 ? second : first,
    reordered: comparison > 0,
  });
}

export function createPairKey(
  tokenA: Pick<TokenDescriptor, "chainId" | "address">,
  tokenB: Pick<TokenDescriptor, "chainId" | "address">,
): string {
  const chainA = normalizeChainId(tokenA.chainId);
  const chainB = normalizeChainId(tokenB.chainId);

  if (chainA !== chainB) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.CROSS_CHAIN_PAIR,
      "Cannot create a pair key for tokens on different chains.",
      {
        field: "tokenPair.chainId",
        value: {
          tokenAChainId: chainA,
          tokenBChainId: chainB,
        },
      },
    );
  }

  const addressA = normalizeEvmAddress(tokenA.address);
  const addressB = normalizeEvmAddress(tokenB.address);

  if (addressA === addressB) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.DUPLICATE_PAIR_TOKEN,
      "Cannot create a pair key from the same token address twice.",
      {
        field: "tokenPair.addresses",
        value: addressA,
      },
    );
  }

  const [token0Address, token1Address] =
    addressA.localeCompare(addressB) <= 0
      ? [addressA, addressB]
      : [addressB, addressA];

  return `${chainA}:${token0Address}:${token1Address}`;
}

export function compareTokenOrder(
  tokenA: Pick<TokenDescriptor, "chainId" | "address">,
  tokenB: Pick<TokenDescriptor, "chainId" | "address">,
): number {
  const chainA = normalizeChainId(tokenA.chainId);
  const chainB = normalizeChainId(tokenB.chainId);

  if (chainA !== chainB) {
    return chainA - chainB;
  }

  const addressA = normalizeEvmAddress(tokenA.address);
  const addressB = normalizeEvmAddress(tokenB.address);

  return addressA.localeCompare(addressB);
}

export function areSameToken(
  tokenA: Pick<TokenDescriptor, "chainId" | "address">,
  tokenB: Pick<TokenDescriptor, "chainId" | "address">,
): boolean {
  return (
    normalizeChainId(tokenA.chainId) ===
      normalizeChainId(tokenB.chainId) &&
    normalizeEvmAddress(tokenA.address) ===
      normalizeEvmAddress(tokenB.address)
  );
}

export function areEquivalentSymbols(
  tokenA: Pick<TokenDescriptor, "symbol" | "canonicalSymbol">,
  tokenB: Pick<TokenDescriptor, "symbol" | "canonicalSymbol">,
): boolean {
  const symbolA = (
    tokenA.canonicalSymbol ?? tokenA.symbol
  ).trim().toUpperCase();

  const symbolB = (
    tokenB.canonicalSymbol ?? tokenB.symbol
  ).trim().toUpperCase();

  return symbolA === symbolB;
}

export function isWrappedNativeToken(
  token: TokenDescriptor,
  network: EvmNetworkDescriptor,
): boolean {
  validateNetworkChain(token.chainId, network);

  return (
    normalizeEvmAddress(token.address) ===
    normalizeEvmAddress(network.wrappedNativeTokenAddress)
  );
}

export function isNativeOrWrappedNativeToken(
  token: TokenDescriptor,
  network: EvmNetworkDescriptor,
): boolean {
  return token.isNative || isWrappedNativeToken(token, network);
}

export function resolveExecutionTokenAddress(
  token: TokenDescriptor,
  network?: EvmNetworkDescriptor,
): EvmAddress {
  const normalized = normalizeTokenDescriptor(token, {
    network,
  });

  if (!normalized.isNative) {
    return normalized.address;
  }

  if (normalized.wrappedTokenAddress !== undefined) {
    return normalized.wrappedTokenAddress;
  }

  if (network !== undefined) {
    return normalizeEvmAddress(
      network.wrappedNativeTokenAddress,
      "network.wrappedNativeTokenAddress",
    );
  }

  throw new CrossDexTokenNormalizationError(
    CrossDexTokenNormalizationErrorCode.INVALID_WRAPPED_TOKEN_ADDRESS,
    "A native token requires a wrapped-token address for DEX execution.",
    {
      field: "token.wrappedTokenAddress",
      value: normalized.symbol,
    },
  );
}

export function sortTokens(
  tokens: readonly TokenDescriptor[],
  options: NormalizeTokenOptions = {},
): readonly TokenDescriptor[] {
  const normalized = tokens.map((token) =>
    normalizeTokenDescriptor(token, options),
  );

  return Object.freeze(
    normalized.sort(compareTokenOrder),
  );
}

export function deduplicateTokens(
  tokens: readonly TokenDescriptor[],
  options: NormalizeTokenOptions = {},
): readonly TokenDescriptor[] {
  const byIdentity = new Map<string, TokenDescriptor>();

  for (const token of tokens) {
    const normalized = normalizeTokenDescriptor(
      token,
      options,
    );
    const identity = createTokenIdentity(normalized);

    if (!byIdentity.has(identity.key)) {
      byIdentity.set(identity.key, normalized);
    }
  }

  return Object.freeze(
    [...byIdentity.values()].sort(compareTokenOrder),
  );
}

export function createTokenLookup(
  tokens: readonly TokenDescriptor[],
  options: NormalizeTokenOptions = {},
): ReadonlyMap<string, TokenDescriptor> {
  const lookup = new Map<string, TokenDescriptor>();

  for (const token of deduplicateTokens(tokens, options)) {
    const identity = createTokenIdentity(token);
    lookup.set(identity.key, token);
  }

  return lookup;
}

function normalizeTokenSymbol(
  symbol: string,
  uppercase: boolean,
  field = "token.symbol",
): string {
  if (typeof symbol !== "string") {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_SYMBOL,
      `${field} must be a string.`,
      {
        field,
        value: symbol,
      },
    );
  }

  const trimmed = symbol.trim();

  if (!TOKEN_SYMBOL_PATTERN.test(trimmed)) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_SYMBOL,
      `${field} must contain 1 to 32 supported symbol characters.`,
      {
        field,
        value: symbol,
      },
    );
  }

  return uppercase ? trimmed.toUpperCase() : trimmed;
}

function normalizeTokenName(
  name: string,
  preserveWhitespace: boolean,
): string {
  if (typeof name !== "string") {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_NAME,
      "token.name must be a string.",
      {
        field: "token.name",
        value: name,
      },
    );
  }

  const normalized = preserveWhitespace
    ? name.trim()
    : name.trim().replace(/\s+/g, " ");

  if (
    normalized.length === 0 ||
    normalized.length > MAX_TOKEN_NAME_LENGTH
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_NAME,
      `token.name must contain between 1 and ${MAX_TOKEN_NAME_LENGTH} characters.`,
      {
        field: "token.name",
        value: name,
      },
    );
  }

  return normalized;
}

function normalizeTokenDecimals(
  decimals: number,
): number {
  if (
    !Number.isInteger(decimals) ||
    decimals < MIN_TOKEN_DECIMALS ||
    decimals > MAX_TOKEN_DECIMALS
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_DECIMALS,
      `token.decimals must be an integer between ${MIN_TOKEN_DECIMALS} and ${MAX_TOKEN_DECIMALS}.`,
      {
        field: "token.decimals",
        value: decimals,
      },
    );
  }

  return decimals;
}

function normalizeOptionalText(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_TOKEN_ID,
      `${field} must be a string when provided.`,
      {
        field,
        value,
      },
    );
  }

  const normalized = value.trim();

  return normalized.length === 0
    ? undefined
    : normalized;
}

function validateNetworkChain(
  chainId: ChainId,
  network?: EvmNetworkDescriptor,
): void {
  if (network === undefined) {
    return;
  }

  const networkChainId = normalizeChainId(network.chainId);

  if (chainId !== networkChainId) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.TOKEN_CHAIN_MISMATCH,
      "The token chainId does not match the supplied network descriptor.",
      {
        field: "token.chainId",
        value: {
          tokenChainId: chainId,
          networkChainId,
        },
      },
    );
  }
}

function validateNativeTokenRules(
  token: Pick<
    TokenDescriptor,
    | "chainId"
    | "address"
    | "isNative"
    | "wrappedTokenAddress"
  >,
  network: EvmNetworkDescriptor | undefined,
  rejectZeroAddressForErc20: boolean,
): void {
  const zeroAddress =
    CROSS_DEX_ARBITRAGE_DEFAULTS.zeroAddress as EvmAddress;
  const tokenAddress = normalizeEvmAddress(token.address);

  if (
    !token.isNative &&
    rejectZeroAddressForErc20 &&
    tokenAddress === zeroAddress
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.NATIVE_TOKEN_ADDRESS_MISMATCH,
      "A non-native ERC-20 token cannot use the zero address.",
      {
        field: "token.address",
        value: token.address,
      },
    );
  }

  if (
    token.wrappedTokenAddress !== undefined &&
    normalizeEvmAddress(token.wrappedTokenAddress) === zeroAddress
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_WRAPPED_TOKEN_ADDRESS,
      "token.wrappedTokenAddress cannot be the zero address.",
      {
        field: "token.wrappedTokenAddress",
        value: token.wrappedTokenAddress,
      },
    );
  }

  if (
    token.isNative &&
    token.wrappedTokenAddress !== undefined &&
    normalizeEvmAddress(token.wrappedTokenAddress) === tokenAddress
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.INVALID_WRAPPED_TOKEN_ADDRESS,
      "A native token and its wrapped token must use different addresses.",
      {
        field: "token.wrappedTokenAddress",
        value: token.wrappedTokenAddress,
      },
    );
  }

  if (network === undefined) {
    return;
  }

  const networkWrappedAddress = normalizeEvmAddress(
    network.wrappedNativeTokenAddress,
    "network.wrappedNativeTokenAddress",
  );

  if (
    token.isNative &&
    token.wrappedTokenAddress !== undefined &&
    normalizeEvmAddress(token.wrappedTokenAddress) !==
      networkWrappedAddress
  ) {
    throw new CrossDexTokenNormalizationError(
      CrossDexTokenNormalizationErrorCode.WRAPPED_NATIVE_TOKEN_MISMATCH,
      "The token wrapped address does not match the network wrapped-native token.",
      {
        field: "token.wrappedTokenAddress",
        value: {
          tokenWrappedAddress: token.wrappedTokenAddress,
          networkWrappedAddress,
        },
      },
    );
  }
}

export class CrossDexArbitrageTokenNormalizer {
  private readonly networkByChainId:
    ReadonlyMap<number, EvmNetworkDescriptor>;

  public constructor(
    networks: readonly EvmNetworkDescriptor[] = [],
  ) {
    const networkMap =
      new Map<number, EvmNetworkDescriptor>();

    for (const network of networks) {
      const chainId = normalizeChainId(network.chainId);

      if (networkMap.has(chainId)) {
        throw new CrossDexTokenNormalizationError(
          CrossDexTokenNormalizationErrorCode.INVALID_CHAIN_ID,
          `Duplicate network descriptor for chainId ${chainId}.`,
          {
            field: "networks",
            value: chainId,
          },
        );
      }

      networkMap.set(
        chainId,
        Object.freeze({
          ...network,
          chainId,
          wrappedNativeTokenAddress: normalizeEvmAddress(
            network.wrappedNativeTokenAddress,
            "network.wrappedNativeTokenAddress",
          ),
          metadata:
            network.metadata === undefined
              ? undefined
              : Object.freeze({ ...network.metadata }),
        }),
      );
    }

    this.networkByChainId = networkMap;
  }

  public normalizeToken(
    token: TokenDescriptor,
    options: Omit<NormalizeTokenOptions, "network"> = {},
  ): TokenDescriptor {
    return normalizeTokenDescriptor(token, {
      ...options,
      network: this.networkByChainId.get(
        normalizeChainId(token.chainId),
      ),
    });
  }

  public normalizeTokenWithResult(
    token: TokenDescriptor,
    options: Omit<NormalizeTokenOptions, "network"> = {},
  ): TokenNormalizationResult {
    return normalizeTokenDescriptorWithResult(token, {
      ...options,
      network: this.networkByChainId.get(
        normalizeChainId(token.chainId),
      ),
    });
  }

  public normalizePair(
    tokenA: TokenDescriptor,
    tokenB: TokenDescriptor,
    options: Omit<
      NormalizeTokenPairOptions,
      "network" | "tokenOptions"
    > & {
      readonly tokenOptions?: Omit<
        NormalizeTokenOptions,
        "network"
      >;
    } = {},
  ): NormalizedTokenPair {
    const chainId = normalizeChainId(tokenA.chainId);
    const network = this.networkByChainId.get(chainId);

    return normalizeTokenPair(tokenA, tokenB, {
      ...options,
      network,
      tokenOptions: {
        ...options.tokenOptions,
        network,
      },
    });
  }

  public deduplicate(
    tokens: readonly TokenDescriptor[],
    options: Omit<NormalizeTokenOptions, "network"> = {},
  ): readonly TokenDescriptor[] {
    const output = new Map<string, TokenDescriptor>();

    for (const token of tokens) {
      const normalized = this.normalizeToken(
        token,
        options,
      );
      const identity = createTokenIdentity(normalized);

      if (!output.has(identity.key)) {
        output.set(identity.key, normalized);
      }
    }

    return Object.freeze(
      [...output.values()].sort(compareTokenOrder),
    );
  }

  public getNetwork(
    chainId: ChainId | number,
  ): EvmNetworkDescriptor | undefined {
    return this.networkByChainId.get(
      normalizeChainId(chainId),
    );
  }

  public isSupportedChain(
    chainId: ChainId | number,
  ): boolean {
    return this.networkByChainId.has(
      normalizeChainId(chainId),
    );
  }
}