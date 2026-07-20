/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 3: AI portfolio state analyzer.
 *
 * Converts a validated portfolio snapshot into deterministic, immutable
 * portfolio-state metrics that can be consumed by optimization, allocation,
 * risk-budgeting, drift-detection, and rebalancing components.
 */

import type {
  PortfolioMetadata,
  PortfolioSnapshot,
} from "./ai-portfolio-contracts";

export type PortfolioConcentrationLevel =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL";

export type PortfolioDiversificationLevel =
  | "NONE"
  | "LOW"
  | "MODERATE"
  | "HIGH";

export type PortfolioLiquidityLevel =
  | "UNKNOWN"
  | "LOW"
  | "MODERATE"
  | "HIGH";

export interface PortfolioStateAnalyzerClock {
  now(): number;
}

export interface PortfolioStateAnalyzerOptions {
  readonly monetaryTolerance?: number;
  readonly weightTolerance?: number;
  readonly highConcentrationWeight?: number;
  readonly criticalConcentrationWeight?: number;
  readonly minimumMeaningfulWeight?: number;
  readonly lowDiversificationAssetCount?: number;
  readonly highDiversificationAssetCount?: number;
  readonly includeZeroValueBalances?: boolean;
  readonly includeZeroValuePositions?: boolean;
}

export interface PortfolioAssetState {
  readonly asset: string;
  readonly balanceValue: number;
  readonly positionValue: number;
  readonly grossValue: number;
  readonly netValue: number;
  readonly absoluteNetValue: number;
  readonly portfolioWeight: number;
  readonly grossExposureWeight: number;
  readonly balanceCount: number;
  readonly positionCount: number;
  readonly exchangeIds: readonly string[];
  readonly marketSymbols: readonly string[];
  readonly longNotional: number;
  readonly shortNotional: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly metadata?: PortfolioMetadata;
}

export interface PortfolioExposureState {
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly longExposure: number;
  readonly shortExposure: number;
  readonly grossExposureRatio: number;
  readonly netExposureRatio: number;
  readonly longExposureRatio: number;
  readonly shortExposureRatio: number;
  readonly leverage: number;
  readonly isNetLong: boolean;
  readonly isNetShort: boolean;
  readonly isMarketNeutral: boolean;
}

export interface PortfolioCapitalState {
  readonly totalEquity: number;
  readonly availableCapital: number;
  readonly reservedCapital: number;
  readonly investedCapital: number;
  readonly availableWeight: number;
  readonly reservedWeight: number;
  readonly investedWeight: number;
  readonly capitalReconciliationDifference: number;
  readonly isCapitalReconciled: boolean;
}

export interface PortfolioPerformanceState {
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly dailyPnl?: number;
  readonly pnlToEquityRatio: number;
  readonly unrealizedPnlToEquityRatio: number;
  readonly realizedPnlToEquityRatio: number;
}

export interface PortfolioConcentrationState {
  readonly largestAsset?: string;
  readonly largestAssetWeight: number;
  readonly topThreeAssetWeight: number;
  readonly topFiveAssetWeight: number;
  readonly herfindahlHirschmanIndex: number;
  readonly effectiveAssetCount: number;
  readonly meaningfulAssetCount: number;
  readonly concentrationLevel: PortfolioConcentrationLevel;
  readonly diversificationLevel: PortfolioDiversificationLevel;
}

export interface PortfolioOperationalState {
  readonly balanceCount: number;
  readonly positionCount: number;
  readonly strategyCount: number;
  readonly botCount: number;
  readonly exchangeCount: number;
  readonly assetCount: number;
  readonly activeAssetCount: number;
  readonly marketCount: number;
  readonly liquidityLevel: PortfolioLiquidityLevel;
}

export interface PortfolioStateAnalysis {
  readonly analysisId: string;
  readonly portfolioId: string;
  readonly snapshotId: string;
  readonly baseCurrency: string;
  readonly capturedAt: string;
  readonly analyzedAt: string;
  readonly capital: PortfolioCapitalState;
  readonly exposure: PortfolioExposureState;
  readonly performance: PortfolioPerformanceState;
  readonly concentration: PortfolioConcentrationState;
  readonly operational: PortfolioOperationalState;
  readonly assets: readonly PortfolioAssetState[];
  readonly warnings: readonly string[];
  readonly metadata?: PortfolioMetadata;
}

interface MutableAssetAccumulator {
  asset: string;
  balanceValue: number;
  positionValue: number;
  grossValue: number;
  netValue: number;
  balanceCount: number;
  positionCount: number;
  exchangeIds: Set<string>;
  marketSymbols: Set<string>;
  longNotional: number;
  shortNotional: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

interface ResolvedPortfolioStateAnalyzerOptions {
  readonly monetaryTolerance: number;
  readonly weightTolerance: number;
  readonly highConcentrationWeight: number;
  readonly criticalConcentrationWeight: number;
  readonly minimumMeaningfulWeight: number;
  readonly lowDiversificationAssetCount: number;
  readonly highDiversificationAssetCount: number;
  readonly includeZeroValueBalances: boolean;
  readonly includeZeroValuePositions: boolean;
}

const SYSTEM_CLOCK: PortfolioStateAnalyzerClock = Object.freeze({
  now: (): number => Date.now(),
});

const EMPTY_METADATA: PortfolioMetadata = Object.freeze({});

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function assertNonNegativeNumber(value: number, name: string): void {
  assertFiniteNumber(value, name);

  if (value < 0) {
    throw new RangeError(`${name} must be greater than or equal to zero.`);
  }
}

function assertUnitInterval(value: number, name: string): void {
  assertFiniteNumber(value, name);

  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  assertNonNegativeNumber(value, name);

  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer.`);
  }
}

function resolveOptions(
  options: PortfolioStateAnalyzerOptions | undefined,
): ResolvedPortfolioStateAnalyzerOptions {
  const resolved: ResolvedPortfolioStateAnalyzerOptions = {
    monetaryTolerance: options?.monetaryTolerance ?? 1e-8,
    weightTolerance: options?.weightTolerance ?? 1e-8,
    highConcentrationWeight: options?.highConcentrationWeight ?? 0.35,
    criticalConcentrationWeight:
      options?.criticalConcentrationWeight ?? 0.60,
    minimumMeaningfulWeight:
      options?.minimumMeaningfulWeight ?? 0.01,
    lowDiversificationAssetCount:
      options?.lowDiversificationAssetCount ?? 3,
    highDiversificationAssetCount:
      options?.highDiversificationAssetCount ?? 8,
    includeZeroValueBalances:
      options?.includeZeroValueBalances ?? false,
    includeZeroValuePositions:
      options?.includeZeroValuePositions ?? false,
  };

  assertNonNegativeNumber(
    resolved.monetaryTolerance,
    "options.monetaryTolerance",
  );
  assertNonNegativeNumber(
    resolved.weightTolerance,
    "options.weightTolerance",
  );
  assertUnitInterval(
    resolved.highConcentrationWeight,
    "options.highConcentrationWeight",
  );
  assertUnitInterval(
    resolved.criticalConcentrationWeight,
    "options.criticalConcentrationWeight",
  );
  assertUnitInterval(
    resolved.minimumMeaningfulWeight,
    "options.minimumMeaningfulWeight",
  );
  assertNonNegativeInteger(
    resolved.lowDiversificationAssetCount,
    "options.lowDiversificationAssetCount",
  );
  assertNonNegativeInteger(
    resolved.highDiversificationAssetCount,
    "options.highDiversificationAssetCount",
  );

  if (
    resolved.criticalConcentrationWeight <
    resolved.highConcentrationWeight
  ) {
    throw new RangeError(
      "options.criticalConcentrationWeight cannot be lower than " +
        "options.highConcentrationWeight.",
    );
  }

  if (
    resolved.highDiversificationAssetCount <
    resolved.lowDiversificationAssetCount
  ) {
    throw new RangeError(
      "options.highDiversificationAssetCount cannot be lower than " +
        "options.lowDiversificationAssetCount.",
    );
  }

  return Object.freeze(resolved);
}

function safeRatio(
  numerator: number,
  denominator: number,
  tolerance: number,
): number {
  if (Math.abs(denominator) <= tolerance) {
    return 0;
  }

  return numerator / denominator;
}

function rounded(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toPrecision(15));
}

function cloneMetadata(
  metadata: PortfolioMetadata | undefined,
): PortfolioMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  return Object.freeze({ ...metadata });
}

function deterministicAnalysisId(snapshot: PortfolioSnapshot): string {
  return [
    "portfolio-state",
    snapshot.portfolioId,
    snapshot.snapshotId,
    snapshot.capturedAt,
  ]
    .join(":")
    .replace(/[^a-zA-Z0-9:_-]/g, "_");
}

function createAccumulator(asset: string): MutableAssetAccumulator {
  return {
    asset,
    balanceValue: 0,
    positionValue: 0,
    grossValue: 0,
    netValue: 0,
    balanceCount: 0,
    positionCount: 0,
    exchangeIds: new Set<string>(),
    marketSymbols: new Set<string>(),
    longNotional: 0,
    shortNotional: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
  };
}

function getAccumulator(
  accumulators: Map<string, MutableAssetAccumulator>,
  asset: string,
): MutableAssetAccumulator {
  const existing = accumulators.get(asset);

  if (existing !== undefined) {
    return existing;
  }

  const created = createAccumulator(asset);
  accumulators.set(asset, created);
  return created;
}

function calculateConcentrationLevel(
  largestWeight: number,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioConcentrationLevel {
  if (largestWeight >= options.criticalConcentrationWeight) {
    return "CRITICAL";
  }

  if (largestWeight >= options.highConcentrationWeight) {
    return "HIGH";
  }

  if (largestWeight >= options.highConcentrationWeight * 0.6) {
    return "MODERATE";
  }

  return "LOW";
}

function calculateDiversificationLevel(
  meaningfulAssetCount: number,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioDiversificationLevel {
  if (meaningfulAssetCount === 0) {
    return "NONE";
  }

  if (meaningfulAssetCount <= options.lowDiversificationAssetCount) {
    return "LOW";
  }

  if (meaningfulAssetCount >= options.highDiversificationAssetCount) {
    return "HIGH";
  }

  return "MODERATE";
}

function calculateLiquidityLevel(
  availableWeight: number,
): PortfolioLiquidityLevel {
  if (!Number.isFinite(availableWeight)) {
    return "UNKNOWN";
  }

  if (availableWeight >= 0.25) {
    return "HIGH";
  }

  if (availableWeight >= 0.10) {
    return "MODERATE";
  }

  return "LOW";
}

function freezeStrings(values: Iterable<string>): readonly string[] {
  return Object.freeze([...values].sort((left, right) =>
    left.localeCompare(right),
  ));
}

function buildAssetStates(
  snapshot: PortfolioSnapshot,
  options: ResolvedPortfolioStateAnalyzerOptions,
): readonly PortfolioAssetState[] {
  const accumulators = new Map<string, MutableAssetAccumulator>();

  for (const balance of snapshot.balances) {
    const include =
      options.includeZeroValueBalances ||
      Math.abs(balance.marketValue) > options.monetaryTolerance;

    if (!include) {
      continue;
    }

    const accumulator = getAccumulator(accumulators, balance.asset);

    accumulator.balanceValue += balance.marketValue;
    accumulator.grossValue += Math.abs(balance.marketValue);
    accumulator.netValue += balance.marketValue;
    accumulator.balanceCount += 1;
  }

  for (const position of snapshot.positions) {
    const signedPositionValue =
      position.side === "SHORT"
        ? -Math.abs(position.marketValue)
        : Math.abs(position.marketValue);

    const include =
      options.includeZeroValuePositions ||
      Math.abs(position.notionalValue) > options.monetaryTolerance ||
      Math.abs(position.marketValue) > options.monetaryTolerance;

    if (!include) {
      continue;
    }

    const accumulator = getAccumulator(
      accumulators,
      position.baseAsset,
    );

    accumulator.positionValue += signedPositionValue;
    accumulator.grossValue += Math.abs(position.notionalValue);
    accumulator.netValue += signedPositionValue;
    accumulator.positionCount += 1;
    accumulator.exchangeIds.add(position.exchangeId);
    accumulator.marketSymbols.add(position.marketSymbol);
    accumulator.realizedPnl += position.realizedPnl;
    accumulator.unrealizedPnl += position.unrealizedPnl;

    if (position.side === "SHORT") {
      accumulator.shortNotional += Math.abs(position.notionalValue);
    } else {
      accumulator.longNotional += Math.abs(position.notionalValue);
    }
  }

  const denominator =
    Math.abs(snapshot.totalEquity) > options.monetaryTolerance
      ? Math.abs(snapshot.totalEquity)
      : accumulators.size > 0
        ? [...accumulators.values()].reduce(
            (sum, item) => sum + Math.abs(item.netValue),
            0,
          )
        : 0;

  const grossDenominator =
    snapshot.grossExposure > options.monetaryTolerance
      ? snapshot.grossExposure
      : [...accumulators.values()].reduce(
          (sum, item) => sum + item.grossValue,
          0,
        );

  const states = [...accumulators.values()]
    .map((item): PortfolioAssetState =>
      Object.freeze({
        asset: item.asset,
        balanceValue: rounded(item.balanceValue),
        positionValue: rounded(item.positionValue),
        grossValue: rounded(item.grossValue),
        netValue: rounded(item.netValue),
        absoluteNetValue: rounded(Math.abs(item.netValue)),
        portfolioWeight: rounded(
          safeRatio(
            Math.abs(item.netValue),
            denominator,
            options.monetaryTolerance,
          ),
        ),
        grossExposureWeight: rounded(
          safeRatio(
            item.grossValue,
            grossDenominator,
            options.monetaryTolerance,
          ),
        ),
        balanceCount: item.balanceCount,
        positionCount: item.positionCount,
        exchangeIds: freezeStrings(item.exchangeIds),
        marketSymbols: freezeStrings(item.marketSymbols),
        longNotional: rounded(item.longNotional),
        shortNotional: rounded(item.shortNotional),
        realizedPnl: rounded(item.realizedPnl),
        unrealizedPnl: rounded(item.unrealizedPnl),
      }),
    )
    .sort((left, right) => {
      const weightDifference =
        right.portfolioWeight - left.portfolioWeight;

      if (Math.abs(weightDifference) > options.weightTolerance) {
        return weightDifference;
      }

      return left.asset.localeCompare(right.asset);
    });

  return Object.freeze(states);
}

function buildCapitalState(
  snapshot: PortfolioSnapshot,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioCapitalState {
  const reconciledCapital =
    snapshot.availableCapital +
    snapshot.reservedCapital +
    snapshot.investedCapital;

  const reconciliationDifference =
    snapshot.totalEquity - reconciledCapital;

  return Object.freeze({
    totalEquity: rounded(snapshot.totalEquity),
    availableCapital: rounded(snapshot.availableCapital),
    reservedCapital: rounded(snapshot.reservedCapital),
    investedCapital: rounded(snapshot.investedCapital),
    availableWeight: rounded(
      safeRatio(
        snapshot.availableCapital,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    reservedWeight: rounded(
      safeRatio(
        snapshot.reservedCapital,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    investedWeight: rounded(
      safeRatio(
        snapshot.investedCapital,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    capitalReconciliationDifference: rounded(
      reconciliationDifference,
    ),
    isCapitalReconciled:
      Math.abs(reconciliationDifference) <=
      options.monetaryTolerance,
  });
}

function buildExposureState(
  snapshot: PortfolioSnapshot,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioExposureState {
  const leverage =
    snapshot.leverage ??
    safeRatio(
      snapshot.grossExposure,
      snapshot.totalEquity,
      options.monetaryTolerance,
    );

  return Object.freeze({
    grossExposure: rounded(snapshot.grossExposure),
    netExposure: rounded(snapshot.netExposure),
    longExposure: rounded(snapshot.longExposure),
    shortExposure: rounded(snapshot.shortExposure),
    grossExposureRatio: rounded(
      safeRatio(
        snapshot.grossExposure,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    netExposureRatio: rounded(
      safeRatio(
        snapshot.netExposure,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    longExposureRatio: rounded(
      safeRatio(
        snapshot.longExposure,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    shortExposureRatio: rounded(
      safeRatio(
        snapshot.shortExposure,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    leverage: rounded(leverage),
    isNetLong: snapshot.netExposure > options.monetaryTolerance,
    isNetShort: snapshot.netExposure < -options.monetaryTolerance,
    isMarketNeutral:
      Math.abs(snapshot.netExposure) <= options.monetaryTolerance,
  });
}

function buildPerformanceState(
  snapshot: PortfolioSnapshot,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioPerformanceState {
  const totalPnl = snapshot.realizedPnl + snapshot.unrealizedPnl;

  return Object.freeze({
    realizedPnl: rounded(snapshot.realizedPnl),
    unrealizedPnl: rounded(snapshot.unrealizedPnl),
    totalPnl: rounded(totalPnl),
    dailyPnl:
      snapshot.dailyPnl === undefined
        ? undefined
        : rounded(snapshot.dailyPnl),
    pnlToEquityRatio: rounded(
      safeRatio(
        totalPnl,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    unrealizedPnlToEquityRatio: rounded(
      safeRatio(
        snapshot.unrealizedPnl,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
    realizedPnlToEquityRatio: rounded(
      safeRatio(
        snapshot.realizedPnl,
        snapshot.totalEquity,
        options.monetaryTolerance,
      ),
    ),
  });
}

function buildConcentrationState(
  assets: readonly PortfolioAssetState[],
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioConcentrationState {
  const weights = assets
    .map((asset) => Math.max(0, asset.portfolioWeight))
    .sort((left, right) => right - left);

  const largestAsset = assets[0]?.asset;
  const largestAssetWeight = weights[0] ?? 0;
  const topThreeAssetWeight = weights
    .slice(0, 3)
    .reduce((sum, weight) => sum + weight, 0);
  const topFiveAssetWeight = weights
    .slice(0, 5)
    .reduce((sum, weight) => sum + weight, 0);
  const herfindahlHirschmanIndex = weights.reduce(
    (sum, weight) => sum + weight * weight,
    0,
  );
  const effectiveAssetCount =
    herfindahlHirschmanIndex > options.weightTolerance
      ? 1 / herfindahlHirschmanIndex
      : 0;
  const meaningfulAssetCount = weights.filter(
    (weight) =>
      weight + options.weightTolerance >=
      options.minimumMeaningfulWeight,
  ).length;

  return Object.freeze({
    largestAsset,
    largestAssetWeight: rounded(largestAssetWeight),
    topThreeAssetWeight: rounded(topThreeAssetWeight),
    topFiveAssetWeight: rounded(topFiveAssetWeight),
    herfindahlHirschmanIndex: rounded(
      herfindahlHirschmanIndex,
    ),
    effectiveAssetCount: rounded(effectiveAssetCount),
    meaningfulAssetCount,
    concentrationLevel: calculateConcentrationLevel(
      largestAssetWeight,
      options,
    ),
    diversificationLevel: calculateDiversificationLevel(
      meaningfulAssetCount,
      options,
    ),
  });
}

function buildOperationalState(
  snapshot: PortfolioSnapshot,
  assets: readonly PortfolioAssetState[],
  capital: PortfolioCapitalState,
  options: ResolvedPortfolioStateAnalyzerOptions,
): PortfolioOperationalState {
  const markets = new Set<string>();

  for (const position of snapshot.positions) {
    if (
      options.includeZeroValuePositions ||
      Math.abs(position.marketValue) > options.monetaryTolerance ||
      Math.abs(position.notionalValue) > options.monetaryTolerance
    ) {
      markets.add(position.marketSymbol);
    }
  }

  const exchangeIds = new Set<string>();

  for (const exposure of snapshot.exchangeExposures) {
    exchangeIds.add(exposure.exchangeId);
  }

  for (const position of snapshot.positions) {
    exchangeIds.add(position.exchangeId);
  }

  return Object.freeze({
    balanceCount: snapshot.balances.length,
    positionCount: snapshot.positions.length,
    strategyCount: snapshot.strategyExposures.length,
    botCount: snapshot.botExposures.length,
    exchangeCount: exchangeIds.size,
    assetCount: assets.length,
    activeAssetCount: assets.filter(
      (asset) =>
        asset.portfolioWeight + options.weightTolerance >=
        options.minimumMeaningfulWeight,
    ).length,
    marketCount: markets.size,
    liquidityLevel: calculateLiquidityLevel(
      capital.availableWeight,
    ),
  });
}

function buildWarnings(
  snapshot: PortfolioSnapshot,
  capital: PortfolioCapitalState,
  exposure: PortfolioExposureState,
  concentration: PortfolioConcentrationState,
  operational: PortfolioOperationalState,
  options: ResolvedPortfolioStateAnalyzerOptions,
): readonly string[] {
  const warnings: string[] = [];

  if (!capital.isCapitalReconciled) {
    warnings.push(
      "Portfolio capital components do not reconcile with total equity.",
    );
  }

  if (concentration.concentrationLevel === "CRITICAL") {
    warnings.push(
      "Portfolio asset concentration is at a critical level.",
    );
  } else if (concentration.concentrationLevel === "HIGH") {
    warnings.push(
      "Portfolio asset concentration is high.",
    );
  }

  if (
    concentration.diversificationLevel === "NONE" ||
    concentration.diversificationLevel === "LOW"
  ) {
    warnings.push(
      "Portfolio diversification is below the preferred operating range.",
    );
  }

  if (operational.liquidityLevel === "LOW") {
    warnings.push(
      "Available capital is low relative to total portfolio equity.",
    );
  }

  if (exposure.leverage > 1 + options.weightTolerance) {
    warnings.push(
      "Portfolio gross exposure exceeds total equity.",
    );
  }

  if (
    snapshot.marginUtilization !== undefined &&
    snapshot.marginUtilization >= 0.8
  ) {
    warnings.push(
      "Portfolio margin utilization is elevated.",
    );
  }

  if (
    snapshot.totalEquity <= options.monetaryTolerance
  ) {
    warnings.push(
      "Portfolio equity is zero or below the configured tolerance.",
    );
  }

  return Object.freeze(warnings);
}

export function analyzePortfolioState(
  snapshot: PortfolioSnapshot,
  options?: PortfolioStateAnalyzerOptions,
  clock: PortfolioStateAnalyzerClock = SYSTEM_CLOCK,
): PortfolioStateAnalysis {
  const resolved = resolveOptions(options);

  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  const analyzedAtMilliseconds = clock.now();
  assertFiniteNumber(analyzedAtMilliseconds, "clock.now()");

  const assets = buildAssetStates(snapshot, resolved);
  const capital = buildCapitalState(snapshot, resolved);
  const exposure = buildExposureState(snapshot, resolved);
  const performance = buildPerformanceState(snapshot, resolved);
  const concentration = buildConcentrationState(assets, resolved);
  const operational = buildOperationalState(
    snapshot,
    assets,
    capital,
    resolved,
  );
  const warnings = buildWarnings(
    snapshot,
    capital,
    exposure,
    concentration,
    operational,
    resolved,
  );

  return Object.freeze({
    analysisId: deterministicAnalysisId(snapshot),
    portfolioId: snapshot.portfolioId,
    snapshotId: snapshot.snapshotId,
    baseCurrency: snapshot.baseCurrency,
    capturedAt: snapshot.capturedAt,
    analyzedAt: new Date(analyzedAtMilliseconds).toISOString(),
    capital,
    exposure,
    performance,
    concentration,
    operational,
    assets,
    warnings,
    metadata: cloneMetadata(snapshot.metadata ?? EMPTY_METADATA),
  });
}

export class AIPortfolioStateAnalyzer {
  private readonly options: PortfolioStateAnalyzerOptions;
  private readonly clock: PortfolioStateAnalyzerClock;

  public constructor(
    options: PortfolioStateAnalyzerOptions = Object.freeze({}),
    clock: PortfolioStateAnalyzerClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({ ...options });
    this.clock = clock;
  }

  public analyze(
    snapshot: PortfolioSnapshot,
  ): PortfolioStateAnalysis {
    return analyzePortfolioState(
      snapshot,
      this.options,
      this.clock,
    );
  }
}