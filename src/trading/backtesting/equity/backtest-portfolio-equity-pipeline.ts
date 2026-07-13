import type {
  PortfolioSnapshot,
} from "../../portfolio";

import type {
  BacktestSession,
} from "../session";

import type {
  BacktestEquityCurveMetrics,
  BacktestEquityCurveRecorder,
  BacktestEquityPoint,
  BacktestPortfolioEquityMetrics,
  BacktestPortfolioMarkRequest,
  BacktestPortfolioMarkResult,
  BacktestPortfolioValuationSource,
} from "./backtest-equity-curve.types";

const PORTFOLIO_EQUITY_METRIC_PREFIX =
  "portfolioEquity";

export class BacktestPortfolioEquityPipeline {
  private initialized = false;
  private finalized = false;

  private lastCandleIndex: number | null = null;
  private lastTimestamp: number | null = null;

  private metrics: BacktestPortfolioEquityMetrics =
    BacktestPortfolioEquityPipeline.createEmptyMetrics();

  public constructor(
    private readonly portfolio:
      BacktestPortfolioValuationSource,

    private readonly equityCurve:
      BacktestEquityCurveRecorder,

    private readonly session?: BacktestSession,
  ) {
    this.validateDependencies();
  }

  /**
   * Records the portfolio state before historical candle
   * processing begins.
   */
  public initialize(
    timestamp: number,
  ): BacktestEquityPoint {
    this.validateTimestamp(
      timestamp,
      "Initial portfolio-equity timestamp",
    );

    if (this.initialized) {
      throw new Error(
        "Backtest portfolio-equity pipeline is already initialized.",
      );
    }

    if (this.finalized) {
      throw new Error(
        "A finalized portfolio-equity pipeline cannot be initialized.",
      );
    }

    const snapshot =
      this.portfolio.getSnapshot();

    this.validatePortfolioSnapshot(snapshot);

    const point = this.equityCurve.record({
      candleIndex: -1,
      timestamp,
      reason: "INITIAL",
      portfolioSnapshot: snapshot,
    });

    this.initialized = true;
    this.lastCandleIndex = -1;
    this.lastTimestamp = timestamp;

    this.refreshMetrics();
    this.recordSessionState(point);

    return point;
  }

  /**
   * Records the portfolio state immediately after an
   * accepted execution has updated the portfolio.
   *
   * The production execution pipeline remains responsible
   * for processing the fill. This method only observes the
   * resulting portfolio snapshot.
   */
  public recordExecution(
    candleIndex: number,
    timestamp: number,
  ): BacktestEquityPoint {
    this.validateOperationalState();
    this.validateCandleIndex(candleIndex);
    this.validateTimestamp(
      timestamp,
      "Execution equity timestamp",
    );

    this.validateOrdering(
      candleIndex,
      timestamp,
    );

    const snapshot =
      this.portfolio.getSnapshot();

    this.validatePortfolioSnapshot(snapshot);

    const point = this.equityCurve.record({
      candleIndex,
      timestamp,
      reason: "EXECUTION",
      portfolioSnapshot: snapshot,
    });

    this.lastCandleIndex = candleIndex;
    this.lastTimestamp = timestamp;

    this.metrics = {
      ...this.metrics,
      executionObservations:
        this.metrics.executionObservations + 1,
    };

    this.refreshMetrics();
    this.recordSessionState(point);

    return point;
  }

  /**
   * Updates the production portfolio with the latest market
   * price and records a deterministic mark-to-market point.
   */
  public markToMarket(
    request: BacktestPortfolioMarkRequest,
  ): BacktestPortfolioMarkResult {
    this.validateOperationalState();
    this.validateMarkRequest(request);

    const reason =
      request.reason ?? "CANDLE";

    if (reason === "FINAL") {
      return this.finalizeFromMark(request);
    }

    this.validateOrdering(
      request.candleIndex,
      request.timestamp,
    );

    this.portfolio.updateMarketPrice(
      request.symbol,
      request.marketPrice,
    );

    const snapshot =
      this.portfolio.getSnapshot();

    this.validatePortfolioSnapshot(snapshot);

    const point = this.equityCurve.record({
      candleIndex: request.candleIndex,
      timestamp: request.timestamp,
      reason: "CANDLE",
      portfolioSnapshot: snapshot,
    });

    this.lastCandleIndex =
      request.candleIndex;

    this.lastTimestamp =
      request.timestamp;

    this.metrics = {
      ...this.metrics,
      marks:
        this.metrics.marks + 1,

      candleObservations:
        this.metrics.candleObservations + 1,
    };

    this.refreshMetrics();
    this.recordSessionState(point);

    return Object.freeze({
      candleIndex:
        request.candleIndex,

      timestamp:
        request.timestamp,

      symbol:
        request.symbol.trim().toUpperCase(),

      marketPrice:
        request.marketPrice,

      portfolioSnapshot:
        point.portfolioSnapshot,

      equityPoint:
        point,
    });
  }

  /**
   * Records the final portfolio state without applying
   * another market-price update.
   */
  public finalize(
    candleIndex: number,
    timestamp: number,
  ): BacktestEquityPoint {
    this.validateOperationalState();
    this.validateCandleIndex(candleIndex);
    this.validateTimestamp(
      timestamp,
      "Final equity timestamp",
    );

    this.validateOrdering(
      candleIndex,
      timestamp,
    );

    const snapshot =
      this.portfolio.getSnapshot();

    this.validatePortfolioSnapshot(snapshot);

    const point = this.equityCurve.record({
      candleIndex,
      timestamp,
      reason: "FINAL",
      portfolioSnapshot: snapshot,
    });

    this.finalized = true;
    this.lastCandleIndex = candleIndex;
    this.lastTimestamp = timestamp;

    this.metrics = {
      ...this.metrics,
      finalObservations:
        this.metrics.finalObservations + 1,
    };

    this.refreshMetrics();
    this.recordSessionState(point);

    return point;
  }

  public getMetrics():
    BacktestPortfolioEquityMetrics {
    return Object.freeze({
      ...this.metrics,
    });
  }

  public getEquityMetrics():
    BacktestEquityCurveMetrics {
    return this.equityCurve.getMetrics();
  }

  public getPoints():
    readonly BacktestEquityPoint[] {
    return this.equityCurve.getPoints();
  }

  public getLatestPoint():
    BacktestEquityPoint | undefined {
    return this.equityCurve.getLatestPoint();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isFinalized(): boolean {
    return this.finalized;
  }

  public reset(): void {
    this.equityCurve.reset();

    this.initialized = false;
    this.finalized = false;

    this.lastCandleIndex = null;
    this.lastTimestamp = null;

    this.metrics =
      BacktestPortfolioEquityPipeline
        .createEmptyMetrics();

    this.recordAllSessionMetrics();
  }

  private finalizeFromMark(
    request: BacktestPortfolioMarkRequest,
  ): BacktestPortfolioMarkResult {
    this.validateOrdering(
      request.candleIndex,
      request.timestamp,
    );

    this.portfolio.updateMarketPrice(
      request.symbol,
      request.marketPrice,
    );

    const snapshot =
      this.portfolio.getSnapshot();

    this.validatePortfolioSnapshot(snapshot);

    const point = this.equityCurve.record({
      candleIndex: request.candleIndex,
      timestamp: request.timestamp,
      reason: "FINAL",
      portfolioSnapshot: snapshot,
    });

    this.finalized = true;
    this.lastCandleIndex =
      request.candleIndex;

    this.lastTimestamp =
      request.timestamp;

    this.metrics = {
      ...this.metrics,

      marks:
        this.metrics.marks + 1,

      finalObservations:
        this.metrics.finalObservations + 1,
    };

    this.refreshMetrics();
    this.recordSessionState(point);

    return Object.freeze({
      candleIndex:
        request.candleIndex,

      timestamp:
        request.timestamp,

      symbol:
        request.symbol.trim().toUpperCase(),

      marketPrice:
        request.marketPrice,

      portfolioSnapshot:
        point.portfolioSnapshot,

      equityPoint:
        point,
    });
  }

  private refreshMetrics(): void {
    const equityMetrics =
      this.equityCurve.getMetrics();

    this.metrics = Object.freeze({
      ...this.metrics,

      currentEquity:
        equityMetrics.currentEquity,

      peakEquity:
        equityMetrics.peakEquity,

      totalPnl:
        equityMetrics.totalPnl,

      returnRate:
        equityMetrics.returnRate,

      maximumDrawdownAmount:
        equityMetrics.maximumDrawdownAmount,

      maximumDrawdownRate:
        equityMetrics.maximumDrawdownRate,
    });

    this.recordAllSessionMetrics();
  }

  private recordSessionState(
    point: BacktestEquityPoint,
  ): void {
    if (this.session === undefined) {
      return;
    }

    this.session.recordEvent(
      `${PORTFOLIO_EQUITY_METRIC_PREFIX}.${point.reason.toLowerCase()}`,
      {
        sequence: point.sequence,
        candleIndex: point.candleIndex,
        timestamp: point.timestamp,
        reason: point.reason,

        equity: point.equity,
        cashBalance: point.cashBalance,

        realizedPnl: point.realizedPnl,
        unrealizedPnl: point.unrealizedPnl,
        totalPnl: point.totalPnl,
        totalFees: point.totalFees,

        absoluteReturn:
          point.absoluteReturn,

        returnRate:
          point.returnRate,

        peakEquity:
          point.peakEquity,

        drawdownAmount:
          point.drawdownAmount,

        drawdownRate:
          point.drawdownRate,

        openPositionCount:
          point.openPositionCount,

        closedTradeCount:
          point.closedTradeCount,
      },
    );
  }

  private recordAllSessionMetrics(): void {
    if (this.session === undefined) {
      return;
    }

    for (
      const [name, value]
      of Object.entries(this.metrics)
    ) {
      this.session.setMetric(
        `${PORTFOLIO_EQUITY_METRIC_PREFIX}.${name}`,
        value,
      );
    }

    const equityMetrics =
      this.equityCurve.getMetrics();

    for (
      const [name, value]
      of Object.entries(equityMetrics)
    ) {
      this.session.setMetric(
        `${PORTFOLIO_EQUITY_METRIC_PREFIX}.equity.${name}`,
        value,
      );
    }
  }

  private validateOperationalState(): void {
    if (!this.initialized) {
      throw new Error(
        "Backtest portfolio-equity pipeline must be initialized first.",
      );
    }

    if (this.finalized) {
      throw new Error(
        "Backtest portfolio-equity pipeline is already finalized.",
      );
    }
  }

  private validateMarkRequest(
    request: BacktestPortfolioMarkRequest,
  ): void {
    if (
      request === null ||
      typeof request !== "object"
    ) {
      throw new Error(
        "Backtest portfolio mark request must be an object.",
      );
    }

    this.validateCandleIndex(
      request.candleIndex,
    );

    this.validateTimestamp(
      request.timestamp,
      "Portfolio mark timestamp",
    );

    if (
      typeof request.symbol !== "string" ||
      request.symbol.trim().length === 0
    ) {
      throw new Error(
        "Portfolio mark symbol must be non-empty.",
      );
    }

    if (
      !Number.isFinite(
        request.marketPrice,
      ) ||
      request.marketPrice <= 0
    ) {
      throw new Error(
        "Portfolio mark price must be a positive finite number.",
      );
    }

    if (
      request.reason !== undefined &&
      request.reason !== "CANDLE" &&
      request.reason !== "FINAL"
    ) {
      throw new Error(
        "Portfolio mark reason must be CANDLE or FINAL.",
      );
    }
  }

  private validateOrdering(
    candleIndex: number,
    timestamp: number,
  ): void {
    if (
      this.lastCandleIndex !== null &&
      candleIndex <
        this.lastCandleIndex
    ) {
      throw new Error(
        "Backtest portfolio-equity candle order cannot move backwards.",
      );
    }

    if (
      this.lastTimestamp !== null &&
      timestamp <
        this.lastTimestamp
    ) {
      throw new Error(
        "Backtest portfolio-equity time cannot move backwards.",
      );
    }
  }

  private validatePortfolioSnapshot(
    snapshot: PortfolioSnapshot,
  ): void {
    if (
      snapshot === null ||
      typeof snapshot !== "object"
    ) {
      throw new Error(
        "Portfolio valuation source returned an invalid snapshot.",
      );
    }

    const numericFields: readonly [
      keyof PortfolioSnapshot,
      number,
    ][] = [
      ["initialBalance", snapshot.initialBalance],
      ["cashBalance", snapshot.cashBalance],
      ["equity", snapshot.equity],
      ["availableBalance", snapshot.availableBalance],
      ["marginUsed", snapshot.marginUsed],
      ["totalExposure", snapshot.totalExposure],
      ["unrealizedPnl", snapshot.unrealizedPnl],
      ["realizedPnl", snapshot.realizedPnl],
      ["totalFees", snapshot.totalFees],
      ["openPositionCount", snapshot.openPositionCount],
      ["closedTradeCount", snapshot.closedTradeCount],
      ["winningTrades", snapshot.winningTrades],
      ["losingTrades", snapshot.losingTrades],
      ["winRate", snapshot.winRate],
      ["returnPercentage", snapshot.returnPercentage],
    ];

    for (const [name, value] of numericFields) {
      if (!Number.isFinite(value)) {
        throw new Error(
          `Portfolio snapshot field "${String(name)}" must be finite.`,
        );
      }
    }
  }

  private validateCandleIndex(
    candleIndex: number,
  ): void {
    if (
      !Number.isSafeInteger(candleIndex) ||
      candleIndex < 0
    ) {
      throw new Error(
        "Portfolio-equity candle index must be a non-negative safe integer.",
      );
    }
  }

  private validateTimestamp(
    timestamp: number,
    label: string,
  ): void {
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0
    ) {
      throw new Error(
        `${label} must be a non-negative safe integer.`,
      );
    }
  }

  private validateDependencies(): void {
    if (
      this.portfolio === null ||
      typeof this.portfolio !== "object" ||
      typeof this.portfolio.updateMarketPrice !==
        "function" ||
      typeof this.portfolio.getSnapshot !==
        "function"
    ) {
      throw new Error(
        "Backtest portfolio-equity pipeline requires a valid portfolio valuation source.",
      );
    }

    if (
      this.equityCurve === null ||
      typeof this.equityCurve !== "object" ||
      typeof this.equityCurve.record !==
        "function" ||
      typeof this.equityCurve.getPoints !==
        "function" ||
      typeof this.equityCurve.getLatestPoint !==
        "function" ||
      typeof this.equityCurve.getMetrics !==
        "function" ||
      typeof this.equityCurve.reset !==
        "function"
    ) {
      throw new Error(
        "Backtest portfolio-equity pipeline requires a valid equity-curve recorder.",
      );
    }

    if (
      this.session !== undefined &&
      (
        this.session === null ||
        typeof this.session !== "object" ||
        typeof this.session.recordEvent !==
          "function" ||
        typeof this.session.setMetric !==
          "function"
      )
    ) {
      throw new Error(
        "Backtest portfolio-equity pipeline session is invalid.",
      );
    }
  }

  private static createEmptyMetrics():
    BacktestPortfolioEquityMetrics {
    return Object.freeze({
      marks: 0,
      executionObservations: 0,
      candleObservations: 0,
      finalObservations: 0,

      currentEquity: 0,
      peakEquity: 0,
      totalPnl: 0,
      returnRate: 0,

      maximumDrawdownAmount: 0,
      maximumDrawdownRate: 0,
    });
  }
}