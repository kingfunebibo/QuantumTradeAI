import assert from "node:assert/strict";

import {
  ExchangeRegistry,
  ExchangeRegistryError,
  normalizeExchangeRegistryId,
  type ExchangeRegistryEntry,
} from "./exchange-connectivity/management/exchange-registry";

interface TestExchangeConnector {
  readonly name: string;
  readonly environment: "production" | "sandbox";
}

function createConnector(
  name: string,
  environment: TestExchangeConnector["environment"] = "production",
): TestExchangeConnector {
  return Object.freeze({
    name,
    environment,
  });
}

function assertRegistryError(
  operation: () => unknown,
  expectedCode: ExchangeRegistryError["code"],
): ExchangeRegistryError {
  let capturedError: unknown;

  try {
    operation();
  } catch (error: unknown) {
    capturedError = error;
  }

  assert.ok(
    capturedError instanceof ExchangeRegistryError,
    `Expected ExchangeRegistryError but received ${
      capturedError instanceof Error
        ? capturedError.constructor.name
        : typeof capturedError
    }.`,
  );

  assert.equal(capturedError.code, expectedCode);

  return capturedError;
}

function assertEntry<TConnector extends object>(
  entry: ExchangeRegistryEntry<TConnector>,
  expectedExchangeId: string,
  expectedConnector: TConnector,
  expectedSequence: number,
): void {
  assert.equal(entry.exchangeId, expectedExchangeId);
  assert.equal(entry.connector, expectedConnector);
  assert.equal(entry.registrationSequence, expectedSequence);
  assert.ok(Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.metadata));
}

function testIdentifierNormalization(): void {
  assert.equal(normalizeExchangeRegistryId("OKX"), "okx");
  assert.equal(normalizeExchangeRegistryId(" Binance "), "binance");
  assert.equal(normalizeExchangeRegistryId("BYBIT_TESTNET"), "bybit-testnet");
  assert.equal(normalizeExchangeRegistryId("kraken  futures"), "kraken-futures");
  assert.equal(normalizeExchangeRegistryId("coinbase---advanced"), "coinbase-advanced");
  assert.equal(normalizeExchangeRegistryId("exchange:v2"), "exchange:v2");
  assert.equal(normalizeExchangeRegistryId("exchange.v2"), "exchange.v2");

  assertRegistryError(
    () => normalizeExchangeRegistryId(""),
    "INVALID_EXCHANGE_ID",
  );

  assertRegistryError(
    () => normalizeExchangeRegistryId("   "),
    "INVALID_EXCHANGE_ID",
  );

  assertRegistryError(
    () => normalizeExchangeRegistryId("-okx"),
    "INVALID_EXCHANGE_ID",
  );

  assertRegistryError(
    () => normalizeExchangeRegistryId("okx/spot"),
    "INVALID_EXCHANGE_ID",
  );

  assertRegistryError(
    () =>
      normalizeExchangeRegistryId(
        123 as unknown as string,
      ),
    "INVALID_EXCHANGE_ID",
  );
}

function testRegistrationAndResolution(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const okx = createConnector("OKX");
  const binance = createConnector("Binance");
  const bybit = createConnector("Bybit");

  const okxEntry = registry.register({
    exchangeId: " OKX ",
    connector: okx,
    metadata: {
      displayName: "OKX Exchange Connector",
      version: "1.0.0",
      sandbox: false,
      attributes: {
        region: "global",
      },
    },
  });

  const binanceEntry = registry.register({
    exchangeId: "BINANCE",
    connector: binance,
  });

  const bybitEntry = registry.register({
    exchangeId: "bybit",
    connector: bybit,
  });

  assertEntry(okxEntry, "okx", okx, 1);
  assertEntry(binanceEntry, "binance", binance, 2);
  assertEntry(bybitEntry, "bybit", bybit, 3);

  assert.equal(registry.size, 3);
  assert.equal(registry.version, 3);

  assert.equal(registry.get("okx"), okx);
  assert.equal(registry.get(" OKX "), okx);
  assert.equal(registry.get("BINANCE"), binance);
  assert.equal(registry.get("bybit"), bybit);
  assert.equal(registry.get("kraken"), undefined);

  assert.equal(registry.require("okx"), okx);
  assert.equal(registry.requireEntry("binance"), binanceEntry);

  assert.equal(registry.has("OKX"), true);
  assert.equal(registry.has("binance"), true);
  assert.equal(registry.has("kraken"), false);

  assert.deepEqual(registry.listExchangeIds(), [
    "okx",
    "binance",
    "bybit",
  ]);

  assert.deepEqual(registry.list(), [
    okxEntry,
    binanceEntry,
    bybitEntry,
  ]);

  assert.equal(okxEntry.metadata.displayName, "OKX Exchange Connector");
  assert.equal(okxEntry.metadata.version, "1.0.0");
  assert.equal(okxEntry.metadata.sandbox, false);
  assert.deepEqual(okxEntry.metadata.attributes, {
    region: "global",
  });

  assert.ok(Object.isFrozen(okxEntry.metadata.attributes));
  assert.ok(Object.isFrozen(registry.list()));
  assert.ok(Object.isFrozen(registry.listExchangeIds()));
}

function testDuplicateExchangeRejection(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const firstConnector = createConnector("OKX Primary");
  const secondConnector = createConnector("OKX Secondary");

  registry.register({
    exchangeId: "okx",
    connector: firstConnector,
  });

  const versionBeforeFailure = registry.version;
  const sizeBeforeFailure = registry.size;
  const snapshotBeforeFailure = registry.snapshot();

  const error = assertRegistryError(
    () =>
      registry.register({
        exchangeId: " OKX ",
        connector: secondConnector,
      }),
    "EXCHANGE_ALREADY_REGISTERED",
  );

  assert.equal(error.exchangeId, "okx");
  assert.equal(registry.version, versionBeforeFailure);
  assert.equal(registry.size, sizeBeforeFailure);
  assert.deepEqual(registry.snapshot(), snapshotBeforeFailure);
  assert.equal(registry.require("okx"), firstConnector);
}

function testDuplicateConnectorInstanceRejection(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();
  const sharedConnector = createConnector("Shared Connector");

  registry.register({
    exchangeId: "okx",
    connector: sharedConnector,
  });

  const error = assertRegistryError(
    () =>
      registry.register({
        exchangeId: "binance",
        connector: sharedConnector,
      }),
    "CONNECTOR_ALREADY_REGISTERED",
  );

  assert.equal(error.exchangeId, "binance");
  assert.equal(registry.size, 1);
  assert.equal(registry.version, 1);
  assert.equal(registry.has("binance"), false);
}

function testOptionalDuplicateConnectorInstances(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>({
    enforceUniqueConnectorInstances: false,
  });

  const sharedConnector = createConnector("Shared Connector");

  registry.register({
    exchangeId: "okx",
    connector: sharedConnector,
  });

  registry.register({
    exchangeId: "binance",
    connector: sharedConnector,
  });

  assert.equal(registry.size, 2);
  assert.equal(registry.require("okx"), sharedConnector);
  assert.equal(registry.require("binance"), sharedConnector);
}

function testRequiredResolutionFailure(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const connectorError = assertRegistryError(
    () => registry.require("kraken"),
    "EXCHANGE_NOT_REGISTERED",
  );

  const entryError = assertRegistryError(
    () => registry.requireEntry("kraken"),
    "EXCHANGE_NOT_REGISTERED",
  );

  assert.equal(connectorError.exchangeId, "kraken");
  assert.equal(entryError.exchangeId, "kraken");
  assert.equal(registry.size, 0);
  assert.equal(registry.version, 0);
}

function testReplacementPreservesOrder(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const originalOkx = createConnector("OKX Original");
  const binance = createConnector("Binance");
  const replacementOkx = createConnector("OKX Replacement");

  const originalEntry = registry.register({
    exchangeId: "okx",
    connector: originalOkx,
    metadata: {
      version: "1.0.0",
    },
  });

  registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  const replacementEntry = registry.replace({
    exchangeId: "OKX",
    connector: replacementOkx,
    metadata: {
      version: "2.0.0",
    },
  });

  assert.equal(
    replacementEntry.registrationSequence,
    originalEntry.registrationSequence,
  );

  assert.equal(replacementEntry.connector, replacementOkx);
  assert.equal(replacementEntry.metadata.version, "2.0.0");
  assert.equal(registry.require("okx"), replacementOkx);
  assert.equal(registry.version, 3);

  assert.deepEqual(registry.listExchangeIds(), [
    "okx",
    "binance",
  ]);

  assertRegistryError(
    () =>
      registry.register({
        exchangeId: "bybit",
        connector: replacementOkx,
      }),
    "CONNECTOR_ALREADY_REGISTERED",
  );

  registry.register({
    exchangeId: "bybit",
    connector: originalOkx,
  });

  assert.equal(registry.require("bybit"), originalOkx);
}

function testReplacementCreatesMissingRegistration(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();
  const connector = createConnector("Kraken");

  const entry = registry.replace({
    exchangeId: "kraken",
    connector,
  });

  assertEntry(entry, "kraken", connector, 1);
  assert.equal(registry.size, 1);
  assert.equal(registry.version, 1);
}

function testReplacementWithSameConnector(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();
  const connector = createConnector("OKX");

  const originalEntry = registry.register({
    exchangeId: "okx",
    connector,
    metadata: {
      version: "1.0.0",
    },
  });

  const replacementEntry = registry.replace({
    exchangeId: "okx",
    connector,
    metadata: {
      version: "1.1.0",
    },
  });

  assert.equal(
    replacementEntry.registrationSequence,
    originalEntry.registrationSequence,
  );

  assert.equal(replacementEntry.connector, connector);
  assert.equal(replacementEntry.metadata.version, "1.1.0");
  assert.equal(registry.version, 2);
}

function testUnregister(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const okx = createConnector("OKX");
  const binance = createConnector("Binance");

  const okxEntry = registry.register({
    exchangeId: "okx",
    connector: okx,
  });

  registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  const removedEntry = registry.unregister(" OKX ");

  assert.equal(removedEntry, okxEntry);
  assert.equal(registry.size, 1);
  assert.equal(registry.version, 3);
  assert.equal(registry.has("okx"), false);
  assert.equal(registry.get("okx"), undefined);
  assert.deepEqual(registry.listExchangeIds(), ["binance"]);

  assertRegistryError(
    () => registry.unregister("okx"),
    "EXCHANGE_NOT_REGISTERED",
  );

  registry.register({
    exchangeId: "bybit",
    connector: okx,
  });

  assert.equal(registry.require("bybit"), okx);
}

function testSnapshotImmutabilityAndIsolation(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const okx = createConnector("OKX");
  const binance = createConnector("Binance");

  registry.register({
    exchangeId: "okx",
    connector: okx,
  });

  const snapshot = registry.snapshot();

  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.entries));
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.size, 1);
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.exchangeId),
    ["okx"],
  );

  registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.size, 1);
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.exchangeId),
    ["okx"],
  );

  const currentSnapshot = registry.snapshot();

  assert.equal(currentSnapshot.version, 2);
  assert.equal(currentSnapshot.size, 2);
  assert.deepEqual(
    currentSnapshot.entries.map((entry) => entry.exchangeId),
    ["okx", "binance"],
  );
}

function testClear(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  const okx = createConnector("OKX");
  const binance = createConnector("Binance");

  const okxEntry = registry.register({
    exchangeId: "okx",
    connector: okx,
  });

  const binanceEntry = registry.register({
    exchangeId: "binance",
    connector: binance,
  });

  const removedEntries = registry.clear();

  assert.deepEqual(removedEntries, [
    okxEntry,
    binanceEntry,
  ]);

  assert.ok(Object.isFrozen(removedEntries));
  assert.equal(registry.size, 0);
  assert.equal(registry.version, 3);
  assert.deepEqual(registry.list(), []);
  assert.deepEqual(registry.listExchangeIds(), []);

  const versionAfterFirstClear = registry.version;
  const secondClearResult = registry.clear();

  assert.deepEqual(secondClearResult, []);
  assert.equal(registry.version, versionAfterFirstClear);

  registry.register({
    exchangeId: "bybit",
    connector: okx,
  });

  assert.equal(registry.require("bybit"), okx);
  assert.equal(
    registry.requireEntry("bybit").registrationSequence,
    3,
  );
}

function testInvalidRegistrationInput(): void {
  const registry = new ExchangeRegistry<TestExchangeConnector>();

  assertRegistryError(
    () =>
      registry.register(
        null as unknown as {
          readonly exchangeId: string;
          readonly connector: TestExchangeConnector;
        },
      ),
    "INVALID_CONNECTOR",
  );

  assertRegistryError(
    () =>
      registry.register({
        exchangeId: "okx",
        connector: null as unknown as TestExchangeConnector,
      }),
    "INVALID_CONNECTOR",
  );

  assertRegistryError(
    () =>
      registry.register({
        exchangeId: "",
        connector: createConnector("Invalid"),
      }),
    "INVALID_EXCHANGE_ID",
  );

  assertRegistryError(
    () =>
      registry.register({
        exchangeId: "okx",
        connector: createConnector("OKX"),
        metadata: null as unknown as {
          readonly displayName?: string;
        },
      }),
    "INVALID_CONNECTOR",
  );

  assert.equal(registry.size, 0);
  assert.equal(registry.version, 0);
}

function runExchangeRegistryTests(): void {
  testIdentifierNormalization();
  testRegistrationAndResolution();
  testDuplicateExchangeRejection();
  testDuplicateConnectorInstanceRejection();
  testOptionalDuplicateConnectorInstances();
  testRequiredResolutionFailure();
  testReplacementPreservesOrder();
  testReplacementCreatesMissingRegistration();
  testReplacementWithSameConnector();
  testUnregister();
  testSnapshotImmutabilityAndIsolation();
  testClear();
  testInvalidRegistrationInput();

  console.log(
    "All deterministic exchange registry tests passed successfully.",
  );
}

runExchangeRegistryTests();