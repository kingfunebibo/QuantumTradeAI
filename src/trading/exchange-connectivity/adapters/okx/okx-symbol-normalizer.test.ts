import assert from "node:assert/strict";

import {
  OkxSymbolNormalizationError,
  createCanonicalSymbol,
  createOkxSpotInstrumentId,
  isSupportedOkxInstrumentType,
  isValidCanonicalSymbol,
  isValidOkxSpotInstrumentId,
  normalizeCanonicalSymbol,
  normalizeOkxDerivativeInstrument,
  normalizeOkxInstrumentId,
  toCanonicalSymbol,
  toOkxInstrumentId,
} from "./okx-symbol-normalizer";

function testCanonicalSymbolNormalization(): void {
  const normalized = normalizeCanonicalSymbol("btc/usdt");

  assert.deepEqual(normalized, {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    okxInstrumentId: "BTC-USDT",
    canonicalSymbol: "BTC/USDT",
  });

  assert.equal(Object.isFrozen(normalized), true);
}

function testDashSeparatedCanonicalSymbol(): void {
  const normalized = normalizeCanonicalSymbol(" eth-usdc ");

  assert.deepEqual(normalized, {
    baseAsset: "ETH",
    quoteAsset: "USDC",
    okxInstrumentId: "ETH-USDC",
    canonicalSymbol: "ETH/USDC",
  });
}

function testOkxInstrumentNormalization(): void {
  const normalized = normalizeOkxInstrumentId("btc-usdt");

  assert.deepEqual(normalized, {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    okxInstrumentId: "BTC-USDT",
    canonicalSymbol: "BTC/USDT",
  });

  assert.equal(Object.isFrozen(normalized), true);
}

function testSymbolConversionHelpers(): void {
  assert.equal(toOkxInstrumentId("btc/usdt"), "BTC-USDT");
  assert.equal(toOkxInstrumentId("eth-usdc"), "ETH-USDC");

  assert.equal(toCanonicalSymbol("btc-usdt"), "BTC/USDT");
  assert.equal(toCanonicalSymbol("SOL-USDT"), "SOL/USDT");
}

function testSymbolCreationHelpers(): void {
  assert.equal(
    createOkxSpotInstrumentId("btc", "usdt"),
    "BTC-USDT",
  );

  assert.equal(
    createCanonicalSymbol("eth", "usdc"),
    "ETH/USDC",
  );

  assert.equal(
    createOkxSpotInstrumentId("  sol  ", "  usd  "),
    "SOL-USD",
  );
}

function testValidCanonicalSymbols(): void {
  assert.equal(isValidCanonicalSymbol("BTC/USDT"), true);
  assert.equal(isValidCanonicalSymbol("btc-usdt"), true);
  assert.equal(isValidCanonicalSymbol("ETH/USDC"), true);

  assert.equal(isValidCanonicalSymbol("BTCUSDT"), false);
  assert.equal(
    isValidCanonicalSymbol("BTC/USDT/USDC"),
    false,
  );
  assert.equal(
    isValidCanonicalSymbol("BTC-USDT/USDC"),
    false,
  );
  assert.equal(isValidCanonicalSymbol(""), false);
}

function testValidOkxSpotInstrumentIds(): void {
  assert.equal(
    isValidOkxSpotInstrumentId("BTC-USDT"),
    true,
  );

  assert.equal(
    isValidOkxSpotInstrumentId("eth-usdc"),
    true,
  );

  assert.equal(
    isValidOkxSpotInstrumentId("BTC/USDT"),
    false,
  );

  assert.equal(
    isValidOkxSpotInstrumentId("BTC-USDT-SWAP"),
    false,
  );

  assert.equal(isValidOkxSpotInstrumentId("BTC"), false);
  assert.equal(isValidOkxSpotInstrumentId(""), false);
}

function testInvalidCanonicalSeparator(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("BTC-USDT/USDC"),
    (error: unknown) => {
      if (!(error instanceof OkxSymbolNormalizationError)) {
        return false;
      }

      assert.equal(
        error.message,
        'Symbol "BTC-USDT/USDC" cannot mix "/" and "-" separators.',
      );

      assert.equal(
        error.code,
        "OKX_SYMBOL_NORMALIZATION_ERROR",
      );

      return true;
    },
  );
}

function testMissingCanonicalSeparator(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("BTCUSDT"),
    /must contain "\/" or "-"/,
  );
}

function testTooManyCanonicalAssets(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("BTC/USDT/USDC"),
    /must contain exactly two assets/,
  );

  assert.throws(
    () => normalizeCanonicalSymbol("BTC-USDT-USDC"),
    /must contain exactly two assets/,
  );
}

function testInvalidOkxSpotInstrumentIds(): void {
  assert.throws(
    () => normalizeOkxInstrumentId("BTC"),
    /must contain exactly two assets/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId("BTC-USDT-SWAP"),
    /must contain exactly two assets/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId("BTC\/USDT"),
    /must contain exactly two assets/,
  );
}

function testDuplicateAssets(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("BTC/BTC"),
    /Base asset and quote asset must be different/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId("USDT-USDT"),
    /Base asset and quote asset must be different/,
  );

  assert.throws(
    () => createOkxSpotInstrumentId("ETH", "ETH"),
    /Base asset and quote asset must be different/,
  );

  assert.throws(
    () => createCanonicalSymbol("SOL", "SOL"),
    /Base asset and quote asset must be different/,
  );
}

function testEmptySymbols(): void {
  assert.throws(
    () => normalizeCanonicalSymbol(""),
    /Symbol must not be empty/,
  );

  assert.throws(
    () => normalizeCanonicalSymbol("   "),
    /Symbol must not be empty/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId(""),
    /Symbol must not be empty/,
  );
}

function testEmptyAssets(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("/USDT"),
    /base asset must not be empty/,
  );

  assert.throws(
    () => normalizeCanonicalSymbol("BTC/"),
    /quote asset must not be empty/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId("-USDT"),
    /base asset must not be empty/,
  );

  assert.throws(
    () => normalizeOkxInstrumentId("BTC-"),
    /quote asset must not be empty/,
  );
}

function testUnsupportedAssetCharacters(): void {
  assert.throws(
    () => normalizeCanonicalSymbol("BTC.C/USDT"),
    /contains unsupported characters/,
  );

  assert.throws(
    () => normalizeCanonicalSymbol("BTC_/USDT"),
    /contains unsupported characters/,
  );

  assert.throws(
    () => createOkxSpotInstrumentId("BTC$", "USDT"),
    /contains unsupported characters/,
  );
}

function testDerivativeSwapNormalization(): void {
  const derivative = normalizeOkxDerivativeInstrument(
    "BTC-USDT-SWAP",
    "SWAP",
  );

  assert.deepEqual(derivative, {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    instrumentType: "SWAP",
    contractCode: "SWAP",
  });

  assert.equal(Object.isFrozen(derivative), true);
}

function testDerivativeFuturesNormalization(): void {
  const derivative = normalizeOkxDerivativeInstrument(
    "BTC-USDT-260925",
    "FUTURES",
  );

  assert.deepEqual(derivative, {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settlementAsset: "USDT",
    instrumentType: "FUTURES",
    contractCode: "260925",
  });
}

function testDerivativeOptionNormalization(): void {
  const derivative = normalizeOkxDerivativeInstrument(
    "BTC-USD-260925-50000-C",
    "OPTION",
  );

  assert.deepEqual(derivative, {
    baseAsset: "BTC",
    quoteAsset: "USD",
    settlementAsset: "USD",
    instrumentType: "OPTION",
    contractCode: "260925-50000-C",
  });
}

function testInvalidDerivativeInstrument(): void {
  assert.throws(
    () =>
      normalizeOkxDerivativeInstrument(
        "BTC-USDT",
        "SWAP",
      ),
    /must contain at least three segments/,
  );

  assert.throws(
    () =>
      normalizeOkxDerivativeInstrument(
        "BTC-BTC-SWAP",
        "SWAP",
      ),
    /Base asset and quote asset must be different/,
  );
}

function testInstrumentTypeGuard(): void {
  assert.equal(isSupportedOkxInstrumentType("SPOT"), true);
  assert.equal(isSupportedOkxInstrumentType("MARGIN"), true);
  assert.equal(isSupportedOkxInstrumentType("SWAP"), true);
  assert.equal(isSupportedOkxInstrumentType("FUTURES"), true);
  assert.equal(isSupportedOkxInstrumentType("OPTION"), true);

  assert.equal(isSupportedOkxInstrumentType("spot"), false);
  assert.equal(
    isSupportedOkxInstrumentType("PERPETUAL"),
    false,
  );
  assert.equal(isSupportedOkxInstrumentType(""), false);
}

function testDeterministicNormalization(): void {
  const inputs = [
    "BTC/USDT",
    "eth-usdc",
    "SOL/USD",
  ];

  const firstPass = inputs.map((symbol) =>
    normalizeCanonicalSymbol(symbol),
  );

  const secondPass = inputs.map((symbol) =>
    normalizeCanonicalSymbol(symbol),
  );

  assert.deepEqual(firstPass, secondPass);

  for (
    let index = 0;
    index < firstPass.length;
    index += 1
  ) {
    assert.notEqual(firstPass[index], secondPass[index]);
    assert.deepEqual(firstPass[index], secondPass[index]);
  }
}

function runOkxSymbolNormalizerTests(): void {
  testCanonicalSymbolNormalization();
  testDashSeparatedCanonicalSymbol();
  testOkxInstrumentNormalization();
  testSymbolConversionHelpers();
  testSymbolCreationHelpers();
  testValidCanonicalSymbols();
  testValidOkxSpotInstrumentIds();
  testInvalidCanonicalSeparator();
  testMissingCanonicalSeparator();
  testTooManyCanonicalAssets();
  testInvalidOkxSpotInstrumentIds();
  testDuplicateAssets();
  testEmptySymbols();
  testEmptyAssets();
  testUnsupportedAssetCharacters();
  testDerivativeSwapNormalization();
  testDerivativeFuturesNormalization();
  testDerivativeOptionNormalization();
  testInvalidDerivativeInstrument();
  testInstrumentTypeGuard();
  testDeterministicNormalization();

  console.log(
    "All OKX symbol normalizer tests passed successfully.",
  );
}

runOkxSymbolNormalizerTests();