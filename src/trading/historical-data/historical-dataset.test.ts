import assert from "node:assert/strict";

import {
  canTransitionHistoricalDatasetStatus,
  createHistoricalDataset,
  HistoricalDatasetDomainError,
  restoreHistoricalDataset,
  transitionHistoricalDatasetStatus,
  validateHistoricalDataset,
} from "./historical-dataset";

import {
  CreateHistoricalDatasetInput,
  HistoricalDataset,
  historicalCount,
  historicalDataSource,
  historicalDatasetId,
  historicalDatasetVersion,
  historicalMarketSymbol,
  historicalTimestamp,
} from "./historical-dataset.types";

function createValidInput(): CreateHistoricalDatasetInput {
  return {
    id: historicalDatasetId(
      "historical-dataset:binance:BTCUSDT:1m:1704067200000",
    ),
    version: historicalDatasetVersion(1),

    source: historicalDataSource("BINANCE"),
    origin: "EXCHANGE_API",
    marketType: "SPOT",

    symbol: historicalMarketSymbol("btc/usdt"),
    timeframe: "1m",

    range: {
      startTime: historicalTimestamp(1_704_067_200_000),
      endTime: historicalTimestamp(1_704_070_740_000),
    },

    recordCount: historicalCount(60),
    createdAt: historicalTimestamp(1_704_071_000_000),

    encoding: "JSON_LINES",
    partitionStrategy: "BY_DAY",

    externalReference: "  binance-btcusdt-1m-2024-01-01  ",
    description: "  Binance BTCUSDT one-minute candles  ",

    attributes: {
      venue: "binance",
      verified: true,
      qualityScore: 99.5,
      nullableValue: null,
      tags: ["spot", "btc", "one-minute"],
      import: {
        sourceFile: "BTCUSDT-1m-2024-01-01.csv",
        compressed: false,
      },
    },
  };
}

function assertThrowsDomainError(
  operation: () => unknown,
  expectedCode: HistoricalDatasetDomainError["code"],
): void {
  assert.throws(
    operation,
    (error: unknown) => {
      assert.ok(
        error instanceof HistoricalDatasetDomainError,
        "Expected HistoricalDatasetDomainError.",
      );

      assert.equal(error.code, expectedCode);

      return true;
    },
  );
}

function testDatasetCreation(): HistoricalDataset {
  const input = createValidInput();
  const dataset = createHistoricalDataset(input);

  assert.equal(dataset.id, input.id);
  assert.equal(dataset.version, input.version);
  assert.equal(dataset.status, "CREATED");

  assert.equal(dataset.metadata.datasetId, input.id);
  assert.equal(dataset.metadata.version, input.version);
  assert.equal(dataset.metadata.source, "binance");
  assert.equal(dataset.metadata.symbol, "BTCUSDT");
  assert.equal(dataset.metadata.timeframe, "1m");
  assert.equal(dataset.metadata.recordCount, 60);

  assert.equal(
    dataset.metadata.externalReference,
    "binance-btcusdt-1m-2024-01-01",
  );

  assert.equal(
    dataset.metadata.description,
    "Binance BTCUSDT one-minute candles",
  );

  assert.equal(
    dataset.metadata.createdAt,
    dataset.metadata.updatedAt,
  );

  assert.equal(dataset.storage.encoding, "JSON_LINES");
  assert.equal(dataset.storage.partitionStrategy, "BY_DAY");
  assert.deepEqual(dataset.storage.partitions, []);

  assert.equal(dataset.checksum, undefined);

  validateHistoricalDataset(dataset);

  return dataset;
}

function testDatasetDeepImmutability(
  dataset: HistoricalDataset,
): void {
  assert.equal(Object.isFrozen(dataset), true);
  assert.equal(Object.isFrozen(dataset.metadata), true);
  assert.equal(Object.isFrozen(dataset.metadata.range), true);
  assert.equal(Object.isFrozen(dataset.storage), true);
  assert.equal(
    Object.isFrozen(dataset.storage.partitions),
    true,
  );

  assert.ok(dataset.metadata.attributes);
  assert.equal(
    Object.isFrozen(dataset.metadata.attributes),
    true,
  );

  const tags = dataset.metadata.attributes.tags;
  assert.ok(Array.isArray(tags));
  assert.equal(Object.isFrozen(tags), true);

  const importMetadata = dataset.metadata.attributes.import;
  assert.equal(typeof importMetadata, "object");
  assert.notEqual(importMetadata, null);
  assert.equal(Object.isFrozen(importMetadata), true);

  assert.throws(() => {
    (
      dataset as unknown as {
        status: string;
      }
    ).status = "READY";
  }, TypeError);

  assert.throws(() => {
    (
      dataset.metadata as unknown as {
        description: string;
      }
    ).description = "mutated";
  }, TypeError);

  assert.throws(() => {
    (
      dataset.storage.partitions as unknown as unknown[]
    ).push({});
  }, TypeError);
}

function testDefensiveMetadataCopy(): void {
  const input = createValidInput();

  const mutableAttributes = input.attributes as {
    venue: string;
    tags: string[];
    import: {
      sourceFile: string;
      compressed: boolean;
    };
  };

  const dataset = createHistoricalDataset(input);

  mutableAttributes.venue = "modified";
  mutableAttributes.tags.push("modified");
  mutableAttributes.import.sourceFile = "modified.csv";

  assert.ok(dataset.metadata.attributes);

  assert.equal(
    dataset.metadata.attributes.venue,
    "binance",
  );

  assert.deepEqual(
    dataset.metadata.attributes.tags,
    ["spot", "btc", "one-minute"],
  );

  assert.deepEqual(
    dataset.metadata.attributes.import,
    {
      sourceFile: "BTCUSDT-1m-2024-01-01.csv",
      compressed: false,
    },
  );
}

function testDatasetRestoration(
  original: HistoricalDataset,
): HistoricalDataset {
  const restored = restoreHistoricalDataset({
    dataset: original,
  });

  assert.deepEqual(restored, original);
  assert.notEqual(restored, original);
  assert.notEqual(restored.metadata, original.metadata);
  assert.notEqual(restored.storage, original.storage);

  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.metadata), true);
  assert.equal(Object.isFrozen(restored.storage), true);

  validateHistoricalDataset(restored);

  return restored;
}

function testLifecycleTransitions(
  original: HistoricalDataset,
): void {
  assert.equal(
    canTransitionHistoricalDatasetStatus(
      "CREATED",
      "IMPORTING",
    ),
    true,
  );

  assert.equal(
    canTransitionHistoricalDatasetStatus(
      "CREATED",
      "READY",
    ),
    false,
  );

  assert.equal(
    canTransitionHistoricalDatasetStatus(
      "ARCHIVED",
      "IMPORTING",
    ),
    false,
  );

  const importing = transitionHistoricalDatasetStatus({
    dataset: original,
    nextStatus: "IMPORTING",
    updatedAt: historicalTimestamp(1_704_071_000_001),
  });

  assert.equal(importing.status, "IMPORTING");
  assert.equal(original.status, "CREATED");

  assert.equal(
    importing.metadata.updatedAt,
    1_704_071_000_001,
  );

  assert.notEqual(importing, original);
  assert.notEqual(importing.metadata, original.metadata);

  const validating = transitionHistoricalDatasetStatus({
    dataset: importing,
    nextStatus: "VALIDATING",
    updatedAt: historicalTimestamp(1_704_071_000_002),
  });

  assert.equal(validating.status, "VALIDATING");

  const ready = transitionHistoricalDatasetStatus({
    dataset: validating,
    nextStatus: "READY",
    updatedAt: historicalTimestamp(1_704_071_000_003),
  });

  assert.equal(ready.status, "READY");

  const archived = transitionHistoricalDatasetStatus({
    dataset: ready,
    nextStatus: "ARCHIVED",
    updatedAt: historicalTimestamp(1_704_071_000_004),
  });

  assert.equal(archived.status, "ARCHIVED");

  assertThrowsDomainError(
    () => {
      transitionHistoricalDatasetStatus({
        dataset: original,
        nextStatus: "READY",
        updatedAt: historicalTimestamp(
          1_704_071_000_001,
        ),
      });
    },
    "INVALID_STATUS_TRANSITION",
  );

  assertThrowsDomainError(
    () => {
      transitionHistoricalDatasetStatus({
        dataset: importing,
        nextStatus: "VALIDATING",
        updatedAt: historicalTimestamp(
          1_704_070_999_999,
        ),
      });
    },
    "INVALID_TIMESTAMP_ORDER",
  );
}

function testCreationValidation(): void {
  assertThrowsDomainError(
    () => {
      createHistoricalDataset({
        ...createValidInput(),
        range: {
          startTime: historicalTimestamp(
            1_704_070_740_000,
          ),
          endTime: historicalTimestamp(
            1_704_067_200_000,
          ),
        },
      });
    },
    "INVALID_TIME_RANGE",
  );

  assertThrowsDomainError(
    () => {
      createHistoricalDataset({
        ...createValidInput(),
        description: "   ",
      });
    },
    "INVALID_DESCRIPTION",
  );

  assertThrowsDomainError(
    () => {
      createHistoricalDataset({
        ...createValidInput(),
        externalReference: "   ",
      });
    },
    "INVALID_EXTERNAL_REFERENCE",
  );

  assertThrowsDomainError(
    () => {
      createHistoricalDataset({
        ...createValidInput(),
        attributes: {
          invalidNumber: Number.NaN,
        },
      });
    },
    "INVALID_METADATA_ATTRIBUTE",
  );

  assertThrowsDomainError(
    () => {
      createHistoricalDataset({
        ...createValidInput(),
        attributes: {
          "   ": "invalid-key",
        },
      });
    },
    "INVALID_METADATA_ATTRIBUTE",
  );
}

function testAggregateValidation(
  validDataset: HistoricalDataset,
): void {
  const mismatchedIdDataset = {
    ...validDataset,
    metadata: {
      ...validDataset.metadata,
      datasetId: historicalDatasetId(
        "historical-dataset:different",
      ),
    },
  } satisfies HistoricalDataset;

  assertThrowsDomainError(
    () => {
      validateHistoricalDataset(mismatchedIdDataset);
    },
    "INVALID_METADATA_ATTRIBUTE",
  );

  const mismatchedVersionDataset = {
    ...validDataset,
    metadata: {
      ...validDataset.metadata,
      version: historicalDatasetVersion(2),
    },
  } satisfies HistoricalDataset;

  assertThrowsDomainError(
    () => {
      validateHistoricalDataset(
        mismatchedVersionDataset,
      );
    },
    "INVALID_VERSION",
  );

  const invalidTimestampDataset = {
    ...validDataset,
    metadata: {
      ...validDataset.metadata,
      updatedAt: historicalTimestamp(
        Number(validDataset.metadata.createdAt) - 1,
      ),
    },
  } satisfies HistoricalDataset;

  assertThrowsDomainError(
    () => {
      validateHistoricalDataset(
        invalidTimestampDataset,
      );
    },
    "INVALID_TIMESTAMP_ORDER",
  );
}

function runHistoricalDatasetTests(): void {
  console.log(
    "Running historical dataset domain tests...",
  );

  const created = testDatasetCreation();

  testDatasetDeepImmutability(created);
  testDefensiveMetadataCopy();

  const restored = testDatasetRestoration(created);

  testLifecycleTransitions(restored);
  testCreationValidation();
  testAggregateValidation(created);

  console.log(
    "All historical dataset domain tests passed successfully.",
  );
}

runHistoricalDatasetTests();