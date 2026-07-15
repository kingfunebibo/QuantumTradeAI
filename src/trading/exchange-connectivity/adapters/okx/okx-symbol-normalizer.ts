export type OkxInstrumentType =
  | "SPOT"
  | "MARGIN"
  | "SWAP"
  | "FUTURES"
  | "OPTION";

export interface OkxNormalizedSymbol {
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly okxInstrumentId: string;
  readonly canonicalSymbol: string;
}

export interface OkxDerivativeInstrument {
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly settlementAsset: string;
  readonly instrumentType: Exclude<
    OkxInstrumentType,
    "SPOT" | "MARGIN"
  >;
  readonly contractCode?: string;
}

export class OkxSymbolNormalizationError extends Error {
  public readonly code = "OKX_SYMBOL_NORMALIZATION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxSymbolNormalizationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const ASSET_PATTERN = /^[A-Z0-9]+$/;

export function normalizeCanonicalSymbol(
  symbol: string,
): OkxNormalizedSymbol {
  const normalizedInput = requireNonEmptySymbol(symbol);

  const separator = detectCanonicalSeparator(normalizedInput);

  if (!separator) {
    throw new OkxSymbolNormalizationError(
      `Canonical symbol "${symbol}" must contain "/" or "-".`,
    );
  }

  const parts = normalizedInput.split(separator);

  if (parts.length !== 2) {
    throw new OkxSymbolNormalizationError(
      `Canonical symbol "${symbol}" must contain exactly two assets.`,
    );
  }

  const baseAsset = normalizeAsset(parts[0], "base asset");
  const quoteAsset = normalizeAsset(parts[1], "quote asset");

  validateDistinctAssets(baseAsset, quoteAsset);

  return createNormalizedSymbol(baseAsset, quoteAsset);
}

export function normalizeOkxInstrumentId(
  instrumentId: string,
): OkxNormalizedSymbol {
  const normalizedInput = requireNonEmptySymbol(instrumentId);
  const parts = normalizedInput.split("-");

  if (parts.length !== 2) {
    throw new OkxSymbolNormalizationError(
      `OKX spot instrument ID "${instrumentId}" must contain exactly two assets.`,
    );
  }

  const baseAsset = normalizeAsset(parts[0], "base asset");
  const quoteAsset = normalizeAsset(parts[1], "quote asset");

  validateDistinctAssets(baseAsset, quoteAsset);

  return createNormalizedSymbol(baseAsset, quoteAsset);
}

export function toOkxInstrumentId(symbol: string): string {
  return normalizeCanonicalSymbol(symbol).okxInstrumentId;
}

export function toCanonicalSymbol(instrumentId: string): string {
  return normalizeOkxInstrumentId(instrumentId).canonicalSymbol;
}

export function createOkxSpotInstrumentId(
  baseAsset: string,
  quoteAsset: string,
): string {
  const normalizedBaseAsset = normalizeAsset(
    baseAsset,
    "base asset",
  );

  const normalizedQuoteAsset = normalizeAsset(
    quoteAsset,
    "quote asset",
  );

  validateDistinctAssets(
    normalizedBaseAsset,
    normalizedQuoteAsset,
  );

  return `${normalizedBaseAsset}-${normalizedQuoteAsset}`;
}

export function createCanonicalSymbol(
  baseAsset: string,
  quoteAsset: string,
): string {
  const normalizedBaseAsset = normalizeAsset(
    baseAsset,
    "base asset",
  );

  const normalizedQuoteAsset = normalizeAsset(
    quoteAsset,
    "quote asset",
  );

  validateDistinctAssets(
    normalizedBaseAsset,
    normalizedQuoteAsset,
  );

  return `${normalizedBaseAsset}/${normalizedQuoteAsset}`;
}

export function isValidOkxSpotInstrumentId(
  instrumentId: string,
): boolean {
  try {
    normalizeOkxInstrumentId(instrumentId);

    return true;
  } catch {
    return false;
  }
}

export function isValidCanonicalSymbol(symbol: string): boolean {
  try {
    normalizeCanonicalSymbol(symbol);

    return true;
  } catch {
    return false;
  }
}

export function normalizeOkxDerivativeInstrument(
  instrumentId: string,
  instrumentType: Exclude<
    OkxInstrumentType,
    "SPOT" | "MARGIN"
  >,
): OkxDerivativeInstrument {
  const normalizedInput = requireNonEmptySymbol(instrumentId);
  const parts = normalizedInput.split("-");

  if (parts.length < 3) {
    throw new OkxSymbolNormalizationError(
      `OKX derivative instrument ID "${instrumentId}" must contain at least three segments.`,
    );
  }

  const baseAsset = normalizeAsset(parts[0], "base asset");
  const quoteAsset = normalizeAsset(parts[1], "quote asset");
  const settlementAsset = quoteAsset;

  validateDistinctAssets(baseAsset, quoteAsset);

  const contractSegments = parts.slice(2);

  const contractCode =
    contractSegments.length > 0
      ? contractSegments.join("-")
      : undefined;

  return Object.freeze({
    baseAsset,
    quoteAsset,
    settlementAsset,
    instrumentType,
    contractCode,
  });
}

export function isSupportedOkxInstrumentType(
  value: string,
): value is OkxInstrumentType {
  return (
    value === "SPOT" ||
    value === "MARGIN" ||
    value === "SWAP" ||
    value === "FUTURES" ||
    value === "OPTION"
  );
}

function createNormalizedSymbol(
  baseAsset: string,
  quoteAsset: string,
): OkxNormalizedSymbol {
  return Object.freeze({
    baseAsset,
    quoteAsset,
    okxInstrumentId: `${baseAsset}-${quoteAsset}`,
    canonicalSymbol: `${baseAsset}/${quoteAsset}`,
  });
}

function detectCanonicalSeparator(
  symbol: string,
): "/" | "-" | undefined {
  const containsSlash = symbol.includes("/");
  const containsDash = symbol.includes("-");

  if (containsSlash && containsDash) {
    throw new OkxSymbolNormalizationError(
      `Symbol "${symbol}" cannot mix "/" and "-" separators.`,
    );
  }

  if (containsSlash) {
    return "/";
  }

  if (containsDash) {
    return "-";
  }

  return undefined;
}

function normalizeAsset(
  value: string | undefined,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxSymbolNormalizationError(
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim().toUpperCase();

  if (normalizedValue.length === 0) {
    throw new OkxSymbolNormalizationError(
      `${fieldName} must not be empty.`,
    );
  }

  if (!ASSET_PATTERN.test(normalizedValue)) {
    throw new OkxSymbolNormalizationError(
      `${fieldName} "${value}" contains unsupported characters.`,
    );
  }

  return normalizedValue;
}

function validateDistinctAssets(
  baseAsset: string,
  quoteAsset: string,
): void {
  if (baseAsset === quoteAsset) {
    throw new OkxSymbolNormalizationError(
      "Base asset and quote asset must be different.",
    );
  }
}

function requireNonEmptySymbol(value: string): string {
  if (typeof value !== "string") {
    throw new OkxSymbolNormalizationError(
      "Symbol must be a string.",
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxSymbolNormalizationError(
      "Symbol must not be empty.",
    );
  }

  return normalizedValue.toUpperCase();
}