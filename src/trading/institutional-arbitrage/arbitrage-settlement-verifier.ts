/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-settlement-verifier.ts
 *
 * Purpose:
 * Deterministic, immutable settlement verification for completed institutional
 * arbitrage executions using injected expected-asset and actual-asset providers.
 */

import {
  type ArbitrageAsset,
  type ArbitrageDecimal,
  type ArbitrageExecutionResult,
  type ArbitrageId,
  type ArbitrageMetadata,
  type ArbitrageSettlementStatus,
  type ArbitrageSettlementVerification,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageSettlementVerifier,
} from "./institutional-arbitrage-contracts";
import {
  validateArbitrageExecutionResult,
  validateArbitrageSettlementVerification,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;
const DEFAULT_ABSOLUTE_TOLERANCE = 1e-8;
const DEFAULT_RELATIVE_TOLERANCE = 1e-8;
const METADATA_EXPECTED_ASSETS_KEY = "expectedSettlementAssets";
const METADATA_ACTUAL_ASSETS_KEY = "actualSettlementAssets";

export type ArbitrageSettlementVerifierErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_OPTION"
  | "INVALID_EXECUTION_RESULT"
  | "INVALID_VERIFICATION_TIMESTAMP"
  | "MISSING_EXPECTED_ASSET_PROVIDER"
  | "MISSING_ACTUAL_ASSET_PROVIDER"
  | "PROVIDER_FAILURE"
  | "INVALID_PROVIDER_RESULT"
  | "INVALID_GENERATED_VERIFICATION";

export class ArbitrageSettlementVerifierError extends Error {
  public readonly code: ArbitrageSettlementVerifierErrorCode;
  public readonly validationIssues?: ArbitrageValidationResult["issues"];
  public readonly causeValue?: unknown;

  public constructor(
    code: ArbitrageSettlementVerifierErrorCode,
    message: string,
    options?: {
      readonly validationIssues?: ArbitrageValidationResult["issues"];
      readonly causeValue?: unknown;
    },
  ) {
    super(message);
    this.name = "ArbitrageSettlementVerifierError";
    this.code = code;
    this.validationIssues = options?.validationIssues;
    this.causeValue = options?.causeValue;
  }
}

export interface ArbitrageSettlementExpectedAssetsRequest {
  readonly executionResult: ArbitrageExecutionResult;
  readonly verifiedAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageSettlementExpectedAssetsResult {
  readonly expectedAssets: Readonly<Record<ArbitrageAsset, ArbitrageDecimal>>;
  readonly expectedProfit?: ArbitrageDecimal;
  readonly reportingAsset?: ArbitrageAsset;
  readonly notes?: readonly string[];
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageExpectedAssetsProvider {
  resolveExpectedAssets(
    request: ArbitrageSettlementExpectedAssetsRequest,
  ):
    | ArbitrageSettlementExpectedAssetsResult
    | Promise<ArbitrageSettlementExpectedAssetsResult>;
}

export interface ArbitrageSettlementActualAssetsRequest {
  readonly executionResult: ArbitrageExecutionResult;
  readonly expectedAssets: Readonly<Record<ArbitrageAsset, ArbitrageDecimal>>;
  readonly verifiedAt: ArbitrageTimestamp;
  readonly correlationId: string;
  readonly traceId: string;
  readonly metadata: ArbitrageMetadata;
}

export type ArbitrageSettlementObservationStatus =
  | "OBSERVED"
  | "PENDING"
  | "CONFIRMING"
  | "FAILED"
  | "TIMED_OUT";

export interface ArbitrageSettlementActualAssetsResult {
  readonly status: ArbitrageSettlementObservationStatus;
  readonly actualAssets: Readonly<Record<ArbitrageAsset, ArbitrageDecimal>>;
  readonly realizedProfit?: ArbitrageDecimal;
  readonly notes?: readonly string[];
  readonly metadata?: ArbitrageMetadata;
}

export interface InstitutionalArbitrageActualAssetsProvider {
  observeActualAssets(
    request: ArbitrageSettlementActualAssetsRequest,
  ):
    | ArbitrageSettlementActualAssetsResult
    | Promise<ArbitrageSettlementActualAssetsResult>;
}

export interface ArbitrageSettlementVerifierObserver {
  onVerificationStarted?(
    executionResult: ArbitrageExecutionResult,
    verifiedAt: ArbitrageTimestamp,
  ): void | Promise<void>;

  onVerificationCompleted?(
    verification: ArbitrageSettlementVerification,
  ): void | Promise<void>;
}

export interface ArbitrageSettlementVerifierOptions {
  readonly decimalPlaces?: number;
  readonly absoluteTolerance?: number;
  readonly relativeTolerance?: number;
  readonly validateInputs?: boolean;
  readonly requireCompletedExecution?: boolean;
  readonly expectedAssetsProvider?: InstitutionalArbitrageExpectedAssetsProvider;
  readonly actualAssetsProvider?: InstitutionalArbitrageActualAssetsProvider;
  readonly observer?: ArbitrageSettlementVerifierObserver;
  readonly metadata?: ArbitrageMetadata;
}

interface ResolvedOptions {
  readonly decimalPlaces: number;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
  readonly validateInputs: boolean;
  readonly requireCompletedExecution: boolean;
  readonly expectedAssetsProvider?: InstitutionalArbitrageExpectedAssetsProvider;
  readonly actualAssetsProvider?: InstitutionalArbitrageActualAssetsProvider;
  readonly observer?: ArbitrageSettlementVerifierObserver;
  readonly metadata: ArbitrageMetadata;
}

interface ExpectedResolution {
  readonly assets: Readonly<Record<string, number>>;
  readonly expectedProfit: number;
  readonly reportingAsset: string;
  readonly notes: readonly string[];
  readonly metadata: ArbitrageMetadata;
  readonly source: "PROVIDER" | "METADATA" | "EXECUTION_RESULT";
}

interface ActualResolution {
  readonly status: ArbitrageSettlementObservationStatus;
  readonly assets: Readonly<Record<string, number>>;
  readonly realizedProfit: number;
  readonly notes: readonly string[];
  readonly metadata: ArbitrageMetadata;
  readonly source: "PROVIDER" | "METADATA" | "EXECUTION_RESULT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((entry) => deepFreeze(entry));
    return Object.freeze(value) as T;
  }

  if (isRecord(value)) {
    Object.values(value).forEach((entry) => deepFreeze(entry));
    return Object.freeze(value) as T;
  }

  return value;
}

function roundDeterministically(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertFiniteNumber(
  value: unknown,
  name: string,
  minimum?: number,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ArbitrageSettlementVerifierError(
      "INVALID_OPTION",
      `${name} must be a finite number.`,
    );
  }

  if (minimum !== undefined && value < minimum) {
    throw new ArbitrageSettlementVerifierError(
      "INVALID_OPTION",
      `${name} must be greater than or equal to ${minimum}.`,
    );
  }
}

function assertTimestamp(value: unknown, name: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ArbitrageSettlementVerifierError(
      "INVALID_VERIFICATION_TIMESTAMP",
      `${name} must be a non-negative integer timestamp.`,
    );
  }
}

function normalizeStringArray(
  value: readonly string[] | undefined,
): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(
    value
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim()),
  );
}

function normalizeAssetMap(
  value: unknown,
  decimalPlaces: number,
  sourceName: string,
): Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    throw new ArbitrageSettlementVerifierError(
      "INVALID_PROVIDER_RESULT",
      `${sourceName} must be an asset-to-quantity record.`,
    );
  }

  const normalized: Record<string, number> = {};

  Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([asset, quantity]) => {
      const normalizedAsset = asset.trim();

      if (normalizedAsset.length === 0) {
        throw new ArbitrageSettlementVerifierError(
          "INVALID_PROVIDER_RESULT",
          `${sourceName} contains an empty asset identifier.`,
        );
      }

      if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
        throw new ArbitrageSettlementVerifierError(
          "INVALID_PROVIDER_RESULT",
          `${sourceName}.${normalizedAsset} must be a finite number.`,
        );
      }

      normalized[normalizedAsset] = roundDeterministically(
        quantity,
        decimalPlaces,
      );
    });

  return deepFreeze(normalized);
}

function readMetadataAssetMap(
  metadata: ArbitrageMetadata,
  key: string,
  decimalPlaces: number,
): Readonly<Record<string, number>> | undefined {
  const value = metadata[key];
  return isRecord(value)
    ? normalizeAssetMap(value, decimalPlaces, `metadata.${key}`)
    : undefined;
}

function createVerificationId(
  executionId: string,
  verifiedAt: number,
): string {
  return `arbitrage-settlement:${executionId}:${verifiedAt}`;
}

function resolveOptions(
  options: ArbitrageSettlementVerifierOptions | undefined,
): ResolvedOptions {
  const decimalPlaces = options?.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
  const absoluteTolerance =
    options?.absoluteTolerance ?? DEFAULT_ABSOLUTE_TOLERANCE;
  const relativeTolerance =
    options?.relativeTolerance ?? DEFAULT_RELATIVE_TOLERANCE;

  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageSettlementVerifierError(
      "INVALID_OPTION",
      `decimalPlaces must be an integer from 0 through ${MAX_DECIMAL_PLACES}.`,
    );
  }

  assertFiniteNumber(absoluteTolerance, "absoluteTolerance", 0);
  assertFiniteNumber(relativeTolerance, "relativeTolerance", 0);

  return deepFreeze({
    decimalPlaces,
    absoluteTolerance,
    relativeTolerance,
    validateInputs: options?.validateInputs ?? true,
    requireCompletedExecution: options?.requireCompletedExecution ?? true,
    expectedAssetsProvider: options?.expectedAssetsProvider,
    actualAssetsProvider: options?.actualAssetsProvider,
    observer: options?.observer,
    metadata: deepFreeze({ ...(options?.metadata ?? {}) }),
  });
}

function isExecutionComplete(result: ArbitrageExecutionResult): boolean {
  return (
    result.completedAt !== undefined ||
    [
      "COMPLETED",
      "CANCELLED",
      "FAILED",
      "TIMED_OUT",
      "COMPENSATED",
    ].includes(result.status)
  );
}

function withinTolerance(
  expected: number,
  actual: number,
  absoluteTolerance: number,
  relativeTolerance: number,
): boolean {
  const difference = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), Math.abs(actual), 1);
  return difference <= Math.max(absoluteTolerance, relativeTolerance * scale);
}

function calculateDiscrepancies(
  expectedAssets: Readonly<Record<string, number>>,
  actualAssets: Readonly<Record<string, number>>,
  options: ResolvedOptions,
): Readonly<Record<string, number>> {
  const assets = [...new Set([
    ...Object.keys(expectedAssets),
    ...Object.keys(actualAssets),
  ])].sort((left, right) => left.localeCompare(right));

  const discrepancies: Record<string, number> = {};

  assets.forEach((asset) => {
    const expected = expectedAssets[asset] ?? 0;
    const actual = actualAssets[asset] ?? 0;
    discrepancies[asset] = withinTolerance(
      expected,
      actual,
      options.absoluteTolerance,
      options.relativeTolerance,
    )
      ? 0
      : roundDeterministically(actual - expected, options.decimalPlaces);
  });

  return deepFreeze(discrepancies);
}

function determineStatus(
  observationStatus: ArbitrageSettlementObservationStatus,
  discrepancies: Readonly<Record<string, number>>,
  executionResult: ArbitrageExecutionResult,
): ArbitrageSettlementStatus {
  if (observationStatus === "FAILED") {
    return "FAILED";
  }

  if (observationStatus === "TIMED_OUT") {
    return "TIMED_OUT";
  }

  if (observationStatus === "PENDING") {
    return "PENDING";
  }

  if (observationStatus === "CONFIRMING") {
    return "CONFIRMING";
  }

  return Object.values(discrepancies).some((quantity) => quantity !== 0)
    ? "MISMATCH"
    : "VERIFIED";
}

export class ArbitrageSettlementVerifier
  implements InstitutionalArbitrageSettlementVerifier
{
  private readonly options: ResolvedOptions;

  public constructor(options?: ArbitrageSettlementVerifierOptions) {
    this.options = resolveOptions(options);
  }

  public async verify(
    executionResult: ArbitrageExecutionResult,
    verifiedAt: ArbitrageTimestamp,
  ): Promise<ArbitrageSettlementVerification> {
    assertTimestamp(verifiedAt, "verifiedAt");

    if (this.options.validateInputs) {
      const validation = validateArbitrageExecutionResult(executionResult);
      if (!validation.valid) {
        throw new ArbitrageSettlementVerifierError(
          "INVALID_EXECUTION_RESULT",
          "Invalid arbitrage execution result.",
          { validationIssues: validation.issues },
        );
      }
    }

    if (
      executionResult.completedAt !== undefined &&
      verifiedAt < executionResult.completedAt
    ) {
      throw new ArbitrageSettlementVerifierError(
        "INVALID_VERIFICATION_TIMESTAMP",
        "verifiedAt cannot precede execution completion.",
      );
    }

    if (
      this.options.requireCompletedExecution &&
      !isExecutionComplete(executionResult)
    ) {
      throw new ArbitrageSettlementVerifierError(
        "INVALID_EXECUTION_RESULT",
        "Settlement verification requires a terminal execution result.",
      );
    }

    await this.options.observer?.onVerificationStarted?.(
      executionResult,
      verifiedAt,
    );

    const expected = await this.resolveExpected(executionResult, verifiedAt);
    const actual = await this.resolveActual(
      executionResult,
      verifiedAt,
      expected.assets,
    );
    const discrepancies = calculateDiscrepancies(
      expected.assets,
      actual.assets,
      this.options,
    );
    const status = determineStatus(
      actual.status,
      discrepancies,
      executionResult,
    );

    const notes = Object.freeze([
      ...expected.notes,
      ...actual.notes,
      `Expected asset source: ${expected.source}.`,
      `Actual asset source: ${actual.source}.`,
      ...(status === "MISMATCH"
        ? ["One or more settlement asset balances exceeded tolerance."]
        : []),
    ]);

    const verification: ArbitrageSettlementVerification = deepFreeze({
      verificationId: createVerificationId(
        executionResult.executionId,
        verifiedAt,
      ),
      executionId: executionResult.executionId,
      status,
      expectedAssets: expected.assets,
      actualAssets: actual.assets,
      discrepancies,
      expectedProfit: roundDeterministically(
        expected.expectedProfit,
        this.options.decimalPlaces,
      ),
      realizedProfit: roundDeterministically(
        actual.realizedProfit,
        this.options.decimalPlaces,
      ),
      reportingAsset: expected.reportingAsset,
      verifiedAt,
      notes,
      metadata: deepFreeze({
        verifier: "ArbitrageSettlementVerifier",
        verifierVersion: 1,
        executionStatus: executionResult.status,
        expectedAssetSource: expected.source,
        actualAssetSource: actual.source,
        absoluteTolerance: this.options.absoluteTolerance,
        relativeTolerance: this.options.relativeTolerance,
        decimalPlaces: this.options.decimalPlaces,
        expectedProviderMetadata: expected.metadata,
        actualProviderMetadata: actual.metadata,
        ...this.options.metadata,
      }),
    });

    const validation = validateArbitrageSettlementVerification(verification);
    if (!validation.valid) {
      throw new ArbitrageSettlementVerifierError(
        "INVALID_GENERATED_VERIFICATION",
        "Generated settlement verification is invalid.",
        { validationIssues: validation.issues },
      );
    }

    await this.options.observer?.onVerificationCompleted?.(verification);
    return verification;
  }

  private async resolveExpected(
    executionResult: ArbitrageExecutionResult,
    verifiedAt: number,
  ): Promise<ExpectedResolution> {
    if (this.options.expectedAssetsProvider !== undefined) {
      try {
        const result = await this.options.expectedAssetsProvider.resolveExpectedAssets(
          deepFreeze({
            executionResult,
            verifiedAt,
            correlationId: executionResult.correlationId,
            traceId: executionResult.traceId,
            metadata: this.options.metadata,
          }),
        );

        return deepFreeze({
          assets: normalizeAssetMap(
            result.expectedAssets,
            this.options.decimalPlaces,
            "expectedAssetsProvider.expectedAssets",
          ),
          expectedProfit:
            result.expectedProfit ?? executionResult.realizedNetProfit,
          reportingAsset:
            result.reportingAsset ?? executionResult.reportingAsset,
          notes: normalizeStringArray(result.notes),
          metadata: deepFreeze({ ...(result.metadata ?? {}) }),
          source: "PROVIDER" as const,
        });
      } catch (error) {
        if (error instanceof ArbitrageSettlementVerifierError) {
          throw error;
        }
        throw new ArbitrageSettlementVerifierError(
          "PROVIDER_FAILURE",
          "Expected-assets provider failed.",
          { causeValue: error },
        );
      }
    }

    const metadataAssets = readMetadataAssetMap(
      executionResult.metadata,
      METADATA_EXPECTED_ASSETS_KEY,
      this.options.decimalPlaces,
    );

    if (metadataAssets !== undefined) {
      return deepFreeze({
        assets: metadataAssets,
        expectedProfit: executionResult.realizedNetProfit,
        reportingAsset: executionResult.reportingAsset,
        notes: Object.freeze([]),
        metadata: deepFreeze({}),
        source: "METADATA" as const,
      });
    }

    if (this.options.actualAssetsProvider === undefined) {
      return deepFreeze({
        assets: deepFreeze({
          [executionResult.reportingAsset]: roundDeterministically(
            executionResult.realizedNetProfit,
            this.options.decimalPlaces,
          ),
        }),
        expectedProfit: executionResult.realizedNetProfit,
        reportingAsset: executionResult.reportingAsset,
        notes: Object.freeze([
          "Expected assets defaulted to realized net profit in the reporting asset.",
        ]),
        metadata: deepFreeze({}),
        source: "EXECUTION_RESULT" as const,
      });
    }

    throw new ArbitrageSettlementVerifierError(
      "MISSING_EXPECTED_ASSET_PROVIDER",
      "Expected settlement assets are unavailable. Inject an expected-assets provider or include expectedSettlementAssets in execution metadata.",
    );
  }

  private async resolveActual(
    executionResult: ArbitrageExecutionResult,
    verifiedAt: number,
    expectedAssets: Readonly<Record<string, number>>,
  ): Promise<ActualResolution> {
    if (this.options.actualAssetsProvider !== undefined) {
      try {
        const result = await this.options.actualAssetsProvider.observeActualAssets(
          deepFreeze({
            executionResult,
            expectedAssets,
            verifiedAt,
            correlationId: executionResult.correlationId,
            traceId: executionResult.traceId,
            metadata: this.options.metadata,
          }),
        );

        return deepFreeze({
          status: result.status,
          assets: normalizeAssetMap(
            result.actualAssets,
            this.options.decimalPlaces,
            "actualAssetsProvider.actualAssets",
          ),
          realizedProfit:
            result.realizedProfit ?? executionResult.realizedNetProfit,
          notes: normalizeStringArray(result.notes),
          metadata: deepFreeze({ ...(result.metadata ?? {}) }),
          source: "PROVIDER" as const,
        });
      } catch (error) {
        if (error instanceof ArbitrageSettlementVerifierError) {
          throw error;
        }
        throw new ArbitrageSettlementVerifierError(
          "PROVIDER_FAILURE",
          "Actual-assets provider failed.",
          { causeValue: error },
        );
      }
    }

    const metadataAssets = readMetadataAssetMap(
      executionResult.metadata,
      METADATA_ACTUAL_ASSETS_KEY,
      this.options.decimalPlaces,
    );

    if (metadataAssets !== undefined) {
      return deepFreeze({
        status: "OBSERVED" as const,
        assets: metadataAssets,
        realizedProfit: executionResult.realizedNetProfit,
        notes: Object.freeze([]),
        metadata: deepFreeze({}),
        source: "METADATA" as const,
      });
    }

    if (this.options.expectedAssetsProvider === undefined) {
      return deepFreeze({
        status: "OBSERVED" as const,
        assets: expectedAssets,
        realizedProfit: executionResult.realizedNetProfit,
        notes: Object.freeze([
          "Actual assets defaulted to expected assets because no external settlement observer was configured.",
        ]),
        metadata: deepFreeze({}),
        source: "EXECUTION_RESULT" as const,
      });
    }

    throw new ArbitrageSettlementVerifierError(
      "MISSING_ACTUAL_ASSET_PROVIDER",
      "Actual settlement assets are unavailable. Inject an actual-assets provider or include actualSettlementAssets in execution metadata.",
    );
  }
}

export default ArbitrageSettlementVerifier;