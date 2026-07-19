/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-stress-tester.ts
 *
 * Purpose:
 * Deterministic portfolio stress testing across asset-price shocks,
 * stablecoin depegs, exchange outages, chain outages, volatility,
 * liquidity, and correlation conditions.
 */

import {
  EnterpriseRiskClock,
  EnterpriseRiskIdentifierGenerator,
  EnterpriseRiskMetadata,
  EnterpriseRiskPortfolioSnapshot,
  EnterpriseRiskPositionSnapshot,
  EnterpriseRiskStressResult,
  EnterpriseRiskStressScenario,
  EnterpriseRiskStressTester,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskStressTesterOptions {
  /**
   * Percentage of position notional considered lost when its exchange or
   * chain is unavailable. Must be between 0 and 1.
   *
   * Default: 0.25
   */
  readonly outageLossPercentage?: number;

  /**
   * Marks a position as at risk when its estimated adverse PnL is at least
   * this percentage of position notional. Must be between 0 and 1.
   *
   * Default: 0.10
   */
  readonly positionRiskThresholdPercentage?: number;

  /**
   * Optional floor applied to estimated equity after the scenario.
   *
   * When false, negative stressed equity is preserved.
   *
   * Default: false
   */
  readonly floorEquityAtZero?: boolean;
}

interface NormalizedEnterpriseRiskStressTesterOptions {
  readonly outageLossPercentage: number;
  readonly positionRiskThresholdPercentage: number;
  readonly floorEquityAtZero: boolean;
}

interface PositionStressEvaluation {
  readonly positionId: string;
  readonly estimatedPnlImpact: number;
  readonly projectedMarkPrice: number;
  readonly atRisk: boolean;
  readonly liquidationRisk: boolean;
  readonly exchangeOutage: boolean;
  readonly chainOutage: boolean;
}

function assertObject(
  value: unknown,
  field: string,
): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a finite number.",
    );
  }
}

function assertNonNegativeFiniteNumber(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be non-negative.",
    );
  }
}

function assertPercentage(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value < 0 || value > 1) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be between 0 and 1.",
    );
  }
}

function assertPositiveMultiplier(
  value: unknown,
  field: string,
): asserts value is number {
  assertFiniteNumber(value, field);

  if (value <= 0) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be greater than zero.",
    );
  }
}

function validateStringArray(
  value: readonly string[] | undefined,
  field: string,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be an array.",
    );
  }

  value.forEach((entry, index) => {
    assertNonEmptyString(
      entry,
      `${field}[${index}]`,
    );
  });
}

function validateNumericRecord(
  value: Readonly<Record<string, number>>,
  field: string,
): void {
  assertObject(value, field);

  for (const [key, numericValue] of Object.entries(value)) {
    assertNonEmptyString(key, `${field} key`);
    assertFiniteNumber(
      numericValue,
      `${field}.${key}`,
    );
  }
}

function normalizeOptions(
  options: EnterpriseRiskStressTesterOptions,
): NormalizedEnterpriseRiskStressTesterOptions {
  assertObject(options, "options");

  const outageLossPercentage =
    options.outageLossPercentage ?? 0.25;

  const positionRiskThresholdPercentage =
    options.positionRiskThresholdPercentage ?? 0.10;

  const floorEquityAtZero =
    options.floorEquityAtZero ?? false;

  assertPercentage(
    outageLossPercentage,
    "options.outageLossPercentage",
  );

  assertPercentage(
    positionRiskThresholdPercentage,
    "options.positionRiskThresholdPercentage",
  );

  if (typeof floorEquityAtZero !== "boolean") {
    throw new EnterpriseRiskValidationError(
      "options.floorEquityAtZero",
      "must be a boolean.",
    );
  }

  return Object.freeze({
    outageLossPercentage,
    positionRiskThresholdPercentage,
    floorEquityAtZero,
  });
}

function validatePortfolio(
  portfolio: EnterpriseRiskPortfolioSnapshot,
): void {
  assertObject(portfolio, "portfolio");

  assertNonEmptyString(
    portfolio.portfolioId,
    "portfolio.portfolioId",
  );

  assertNonEmptyString(
    portfolio.reportingCurrency,
    "portfolio.reportingCurrency",
  );

  assertFiniteNumber(
    portfolio.totalEquity,
    "portfolio.totalEquity",
  );

  assertNonNegativeFiniteNumber(
    portfolio.peakEquity,
    "portfolio.peakEquity",
  );

  assertNonNegativeFiniteNumber(
    portfolio.grossExposure,
    "portfolio.grossExposure",
  );

  assertNonNegativeFiniteNumber(
    portfolio.openPositionCount,
    "portfolio.openPositionCount",
  );

  assertNonNegativeFiniteNumber(
    portfolio.observedAt,
    "portfolio.observedAt",
  );

  if (!Array.isArray(portfolio.positions)) {
    throw new EnterpriseRiskValidationError(
      "portfolio.positions",
      "must be an array.",
    );
  }

  portfolio.positions.forEach(
    (position, index) => {
      validatePosition(
        position,
        `portfolio.positions[${index}]`,
      );
    },
  );
}

function validatePosition(
  position: EnterpriseRiskPositionSnapshot,
  field: string,
): void {
  assertObject(position, field);

  assertNonEmptyString(
    position.positionId,
    `${field}.positionId`,
  );

  assertNonEmptyString(
    position.portfolioId,
    `${field}.portfolioId`,
  );

  assertNonEmptyString(
    position.symbol,
    `${field}.symbol`,
  );

  assertNonEmptyString(
    position.baseAsset,
    `${field}.baseAsset`,
  );

  assertNonEmptyString(
    position.quoteAsset,
    `${field}.quoteAsset`,
  );

  assertNonNegativeFiniteNumber(
    position.quantity,
    `${field}.quantity`,
  );

  assertNonNegativeFiniteNumber(
    position.markPrice,
    `${field}.markPrice`,
  );

  assertNonNegativeFiniteNumber(
    position.notionalValue,
    `${field}.notionalValue`,
  );

  assertNonNegativeFiniteNumber(
    position.leverage,
    `${field}.leverage`,
  );

  if (position.liquidationPrice !== undefined) {
    assertNonNegativeFiniteNumber(
      position.liquidationPrice,
      `${field}.liquidationPrice`,
    );
  }
}

function validateScenario(
  scenario: EnterpriseRiskStressScenario,
): void {
  assertObject(scenario, "scenario");

  assertNonEmptyString(
    scenario.scenarioId,
    "scenario.scenarioId",
  );

  assertNonEmptyString(
    scenario.name,
    "scenario.name",
  );

  validateNumericRecord(
    scenario.assetPriceShocks,
    "scenario.assetPriceShocks",
  );

  if (scenario.stablecoinDepegs !== undefined) {
    validateNumericRecord(
      scenario.stablecoinDepegs,
      "scenario.stablecoinDepegs",
    );
  }

  if (scenario.volatilityMultiplier !== undefined) {
    assertPositiveMultiplier(
      scenario.volatilityMultiplier,
      "scenario.volatilityMultiplier",
    );
  }

  if (scenario.liquidityMultiplier !== undefined) {
    assertPositiveMultiplier(
      scenario.liquidityMultiplier,
      "scenario.liquidityMultiplier",
    );
  }

  if (scenario.correlationMultiplier !== undefined) {
    assertPositiveMultiplier(
      scenario.correlationMultiplier,
      "scenario.correlationMultiplier",
    );
  }

  validateStringArray(
    scenario.exchangeOutages,
    "scenario.exchangeOutages",
  );

  validateStringArray(
    scenario.chainOutages,
    "scenario.chainOutages",
  );
}

function uniqueSorted(
  values: readonly string[],
): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
}

function cloneMetadata(
  metadata: EnterpriseRiskMetadata | undefined,
): EnterpriseRiskMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...metadata,
  });
}

function getAssetShock(
  position: EnterpriseRiskPositionSnapshot,
  scenario: EnterpriseRiskStressScenario,
): number {
  const directShock =
    scenario.assetPriceShocks[position.baseAsset] ??
    scenario.assetPriceShocks[position.symbol];

  if (directShock !== undefined) {
    return directShock;
  }

  const baseAssetDepeg =
    scenario.stablecoinDepegs?.[position.baseAsset];

  if (baseAssetDepeg !== undefined) {
    return baseAssetDepeg;
  }

  return 0;
}

function getAdverseImpactMultiplier(
  scenario: EnterpriseRiskStressScenario,
): number {
  const volatilityMultiplier =
    scenario.volatilityMultiplier ?? 1;

  const correlationMultiplier =
    scenario.correlationMultiplier ?? 1;

  const liquidityMultiplier =
    scenario.liquidityMultiplier ?? 1;

  /*
   * A liquidity multiplier below 1 represents impaired liquidity.
   * The inverse therefore increases adverse execution impact.
   */
  const liquidityImpactMultiplier =
    liquidityMultiplier < 1
      ? 1 / liquidityMultiplier
      : 1;

  return (
    volatilityMultiplier *
    correlationMultiplier *
    liquidityImpactMultiplier
  );
}

function evaluatePosition(
  position: EnterpriseRiskPositionSnapshot,
  scenario: EnterpriseRiskStressScenario,
  options: NormalizedEnterpriseRiskStressTesterOptions,
): PositionStressEvaluation {
  const exchangeOutage =
    position.exchangeId !== undefined &&
    scenario.exchangeOutages?.includes(
      position.exchangeId,
    ) === true;

  const chainOutage =
    position.chainId !== undefined &&
    scenario.chainOutages?.includes(
      position.chainId,
    ) === true;

  const rawShock = getAssetShock(
    position,
    scenario,
  );

  const projectedMarkPrice = Math.max(
    0,
    position.markPrice * (1 + rawShock),
  );

  const direction =
    position.side === "SHORT"
      ? -1
      : position.side === "LONG"
        ? 1
        : 0;

  let estimatedPnlImpact =
    position.notionalValue *
    rawShock *
    direction;

  if (estimatedPnlImpact < 0) {
    estimatedPnlImpact *=
      getAdverseImpactMultiplier(scenario);
  }

  if (exchangeOutage || chainOutage) {
    estimatedPnlImpact -=
      position.notionalValue *
      options.outageLossPercentage;
  }

  const adverseLoss =
    Math.max(0, -estimatedPnlImpact);

  const atRisk =
    exchangeOutage ||
    chainOutage ||
    adverseLoss >=
      position.notionalValue *
        options.positionRiskThresholdPercentage;

  const liquidationRisk =
    position.liquidationPrice !== undefined &&
    (
      (
        position.side === "LONG" &&
        projectedMarkPrice <=
          position.liquidationPrice
      ) ||
      (
        position.side === "SHORT" &&
        projectedMarkPrice >=
          position.liquidationPrice
      )
    );

  return Object.freeze({
    positionId: position.positionId,
    estimatedPnlImpact,
    projectedMarkPrice,
    atRisk,
    liquidationRisk,
    exchangeOutage,
    chainOutage,
  });
}

export class DefaultEnterpriseRiskStressTester
  implements EnterpriseRiskStressTester
{
  private readonly options:
    NormalizedEnterpriseRiskStressTesterOptions;

  public constructor(
    private readonly clock: EnterpriseRiskClock,
    private readonly identifierGenerator:
      EnterpriseRiskIdentifierGenerator,
    options: EnterpriseRiskStressTesterOptions = {},
  ) {
    if (
      typeof clock !== "object" ||
      clock === null ||
      typeof clock.now !== "function"
    ) {
      throw new EnterpriseRiskValidationError(
        "clock",
        "must implement EnterpriseRiskClock.",
      );
    }

    if (
      typeof identifierGenerator !== "object" ||
      identifierGenerator === null ||
      typeof identifierGenerator.generate !==
        "function"
    ) {
      throw new EnterpriseRiskValidationError(
        "identifierGenerator",
        "must implement EnterpriseRiskIdentifierGenerator.",
      );
    }

    this.options = normalizeOptions(options);
  }

  public evaluate(
    portfolio: EnterpriseRiskPortfolioSnapshot,
    scenario: EnterpriseRiskStressScenario,
  ): EnterpriseRiskStressResult {
    validatePortfolio(portfolio);
    validateScenario(scenario);

    const calculatedAt = this.clock.now();

    assertNonNegativeFiniteNumber(
      calculatedAt,
      "clock.now()",
    );

    const evaluations = portfolio.positions.map(
      (position) =>
        evaluatePosition(
          position,
          scenario,
          this.options,
        ),
    );

    const estimatedPnlImpact =
      evaluations.reduce(
        (total, evaluation) =>
          total +
          evaluation.estimatedPnlImpact,
        0,
      );

    const rawEstimatedEquityAfterScenario =
      portfolio.totalEquity +
      estimatedPnlImpact;

    const estimatedEquityAfterScenario =
      this.options.floorEquityAtZero
        ? Math.max(
            0,
            rawEstimatedEquityAfterScenario,
          )
        : rawEstimatedEquityAfterScenario;

    const estimatedDrawdown = Math.max(
      0,
      portfolio.peakEquity -
        estimatedEquityAfterScenario,
    );

    const estimatedDrawdownPercentage =
      portfolio.peakEquity > 0
        ? estimatedDrawdown /
          portfolio.peakEquity
        : 0;

    const positionsAtRisk = uniqueSorted(
      evaluations
        .filter(
          (evaluation) => evaluation.atRisk,
        )
        .map(
          (evaluation) =>
            evaluation.positionId,
        ),
    );

    const liquidationRisks = uniqueSorted(
      evaluations
        .filter(
          (evaluation) =>
            evaluation.liquidationRisk,
        )
        .map(
          (evaluation) =>
            evaluation.positionId,
        ),
    );

    return Object.freeze({
      resultId:
        this.identifierGenerator.generate(
          "enterprise-risk-stress-result",
        ),
      scenarioId: scenario.scenarioId,
      portfolioId: portfolio.portfolioId,
      estimatedPnlImpact,
      estimatedEquityAfterScenario,
      estimatedDrawdown,
      estimatedDrawdownPercentage,
      positionsAtRisk,
      breachedLimits: Object.freeze([]),
      liquidationRisks,
      calculatedAt,
      metadata: Object.freeze({
        scenarioName: scenario.name,
        reportingCurrency:
          portfolio.reportingCurrency,
        evaluatedPositionCount:
          portfolio.positions.length,
        outagePositionCount:
          evaluations.filter(
            (evaluation) =>
              evaluation.exchangeOutage ||
              evaluation.chainOutage,
          ).length,
        source: "default-enterprise-risk-stress-tester",
        ...(cloneMetadata(scenario.metadata) ?? {}),
      }),
    });
  }
}

export function createEnterpriseRiskStressTester(
  clock: EnterpriseRiskClock,
  identifierGenerator:
    EnterpriseRiskIdentifierGenerator,
  options: EnterpriseRiskStressTesterOptions = {},
): DefaultEnterpriseRiskStressTester {
  return new DefaultEnterpriseRiskStressTester(
    clock,
    identifierGenerator,
    options,
  );
}