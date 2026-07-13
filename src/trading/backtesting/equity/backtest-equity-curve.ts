import type {
  BacktestEquityCurveMetrics,
  BacktestEquityCurveRecorder,
  BacktestEquityObservation,
  BacktestEquityPoint,
} from "./backtest-equity-curve.types";

export class DeterministicBacktestEquityCurve
  implements BacktestEquityCurveRecorder
{
  private readonly points: BacktestEquityPoint[] = [];

  private lastCandleIndex: number | null = null;
  private lastTimestamp: number | null = null;

  private metrics: BacktestEquityCurveMetrics =
    DeterministicBacktestEquityCurve.createEmptyMetrics();

  public record(
    observation: BacktestEquityObservation,
  ): BacktestEquityPoint {
    this.validateObservation(observation);
    this.validateOrdering(observation);

    const snapshot =
      this.clonePortfolioSnapshot(
        observation.portfolioSnapshot,
      );

    const previousPoint = this.points.at(-1);

    const initialEquity =
      this.points.length === 0
        ? snapshot.equity
        : this.metrics.initialEquity;

    const peakEquity = Math.max(
      this.points.length === 0
        ? snapshot.equity
        : this.metrics.peakEquity,
      snapshot.equity,
    );

    const minimumEquity =
      this.points.length === 0
        ? snapshot.equity
        : Math.min(
            this.metrics.minimumEquity,
            snapshot.equity,
          );

    const totalPnl =
      snapshot.realizedPnl +
      snapshot.unrealizedPnl;

    const absoluteReturn =
      snapshot.equity - initialEquity;

    const returnRate =
      initialEquity === 0
        ? 0
        : absoluteReturn / initialEquity;

    const drawdownAmount =
      peakEquity - snapshot.equity;

    const drawdownRate =
      peakEquity === 0
        ? 0
        : drawdownAmount / peakEquity;

    const previousEquity =
      previousPoint?.equity;

    const profitableObservation =
      previousEquity !== undefined &&
      snapshot.equity > previousEquity;

    const losingObservation =
      previousEquity !== undefined &&
      snapshot.equity < previousEquity;

    const unchangedObservation =
      previousEquity !== undefined &&
      snapshot.equity === previousEquity;

    const point: BacktestEquityPoint =
      Object.freeze({
        sequence: this.points.length + 1,
        candleIndex: observation.candleIndex,
        timestamp: observation.timestamp,
        reason: observation.reason,

        startingCapital:
          snapshot.initialBalance,

        cashBalance:
          snapshot.cashBalance,

        equity:
          snapshot.equity,

        realizedPnl:
          snapshot.realizedPnl,

        unrealizedPnl:
          snapshot.unrealizedPnl,

        totalPnl,

        totalFees:
          snapshot.totalFees,

        absoluteReturn,
        returnRate,

        peakEquity,
        drawdownAmount,
        drawdownRate,

        openPositionCount:
          snapshot.openPositionCount,

        closedTradeCount:
          snapshot.closedTradeCount,

        portfolioSnapshot: snapshot,
      });

    this.points.push(point);

    this.metrics = Object.freeze({
      observations:
        this.metrics.observations + 1,

      initialEquity,
      currentEquity:
        snapshot.equity,

      peakEquity,
      minimumEquity,

      absoluteReturn,
      returnRate,

      currentDrawdownAmount:
        drawdownAmount,

      currentDrawdownRate:
        drawdownRate,

      maximumDrawdownAmount:
        Math.max(
          this.metrics.maximumDrawdownAmount,
          drawdownAmount,
        ),

      maximumDrawdownRate:
        Math.max(
          this.metrics.maximumDrawdownRate,
          drawdownRate,
        ),

      realizedPnl:
        snapshot.realizedPnl,

      unrealizedPnl:
        snapshot.unrealizedPnl,

      totalPnl,

      totalFees:
        snapshot.totalFees,

      profitableObservations:
        this.metrics.profitableObservations +
        (profitableObservation ? 1 : 0),

      losingObservations:
        this.metrics.losingObservations +
        (losingObservation ? 1 : 0),

      unchangedObservations:
        this.metrics.unchangedObservations +
        (unchangedObservation ? 1 : 0),
    });

    this.lastCandleIndex =
      observation.candleIndex;

    this.lastTimestamp =
      observation.timestamp;

    return point;
  }

  public getPoints():
    readonly BacktestEquityPoint[] {
    return Object.freeze([
      ...this.points,
    ]);
  }

  public getLatestPoint():
    BacktestEquityPoint | undefined {
    return this.points.at(-1);
  }

  public getMetrics():
    BacktestEquityCurveMetrics {
    return Object.freeze({
      ...this.metrics,
    });
  }

  public reset(): void {
    this.points.splice(
      0,
      this.points.length,
    );

    this.lastCandleIndex = null;
    this.lastTimestamp = null;

    this.metrics =
      DeterministicBacktestEquityCurve.createEmptyMetrics();
  }

  private validateObservation(
    observation: BacktestEquityObservation,
  ): void {
    if (
      observation === null ||
      typeof observation !== "object"
    ) {
      throw new Error(
        "Backtest equity observation must be an object.",
      );
    }

    if (
      !Number.isSafeInteger(
        observation.candleIndex,
      ) ||
      observation.candleIndex < -1
    ) {
      throw new Error(
        "Backtest equity candle index must be -1 or a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        observation.timestamp,
      ) ||
      observation.timestamp < 0
    ) {
      throw new Error(
        "Backtest equity timestamp must be a non-negative safe integer.",
      );
    }

    if (
      observation.reason !== "INITIAL" &&
      observation.reason !== "CANDLE" &&
      observation.reason !== "EXECUTION" &&
      observation.reason !== "FINAL"
    ) {
      throw new Error(
        "Backtest equity observation reason is invalid.",
      );
    }

    if (
      observation.portfolioSnapshot === null ||
      typeof observation.portfolioSnapshot !==
        "object"
    ) {
      throw new Error(
        "Backtest equity observation requires a portfolio snapshot.",
      );
    }

    this.validateSnapshotNumbers(
      observation.portfolioSnapshot,
    );

    this.validateSnapshotCounts(
      observation.portfolioSnapshot,
    );
  }

  private validateSnapshotNumbers(
    snapshot:
      BacktestEquityObservation["portfolioSnapshot"],
  ): void {
    this.assertFiniteNumber(
      snapshot.initialBalance,
      "Portfolio initial balance",
    );

    this.assertFiniteNumber(
      snapshot.cashBalance,
      "Portfolio cash balance",
    );

    this.assertFiniteNumber(
      snapshot.equity,
      "Portfolio equity",
    );

    this.assertFiniteNumber(
      snapshot.availableBalance,
      "Portfolio available balance",
    );

    this.assertFiniteNumber(
      snapshot.marginUsed,
      "Portfolio margin used",
    );

    this.assertFiniteNumber(
      snapshot.totalExposure,
      "Portfolio total exposure",
    );

    this.assertFiniteNumber(
      snapshot.realizedPnl,
      "Portfolio realized PnL",
    );

    this.assertFiniteNumber(
      snapshot.unrealizedPnl,
      "Portfolio unrealized PnL",
    );

    this.assertFiniteNumber(
      snapshot.totalFees,
      "Portfolio total fees",
    );

    this.assertFiniteNumber(
      snapshot.winRate,
      "Portfolio win rate",
    );

    this.assertFiniteNumber(
      snapshot.returnPercentage,
      "Portfolio return percentage",
    );

    if (snapshot.initialBalance <= 0) {
      throw new Error(
        "Portfolio initial balance must be positive.",
      );
    }

    if (snapshot.equity < 0) {
      throw new Error(
        "Portfolio equity cannot be negative.",
      );
    }

    if (snapshot.marginUsed < 0) {
      throw new Error(
        "Portfolio margin used cannot be negative.",
      );
    }

    if (snapshot.totalExposure < 0) {
      throw new Error(
        "Portfolio total exposure cannot be negative.",
      );
    }

    if (snapshot.totalFees < 0) {
      throw new Error(
        "Portfolio total fees cannot be negative.",
      );
    }
  }

  private validateSnapshotCounts(
    snapshot:
      BacktestEquityObservation["portfolioSnapshot"],
  ): void {
    if (
      !Number.isSafeInteger(
        snapshot.openPositionCount,
      ) ||
      snapshot.openPositionCount < 0
    ) {
      throw new Error(
        "Portfolio open position count must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        snapshot.closedTradeCount,
      ) ||
      snapshot.closedTradeCount < 0
    ) {
      throw new Error(
        "Portfolio closed trade count must be a non-negative safe integer.",
      );
    }

    if (
      !Number.isSafeInteger(
        snapshot.winningTrades,
      ) ||
      snapshot.winningTrades < 0
    ) {
      throw new Error(
        "Portfolio winning trade count must be a non-negative safe integer.",
      );
    }

    if (
      snapshot.winningTrades >
      snapshot.closedTradeCount
    ) {
      throw new Error(
        "Portfolio winning trades cannot exceed closed trades.",
      );
    }
  }

  private validateOrdering(
    observation: BacktestEquityObservation,
  ): void {
    if (
      this.lastTimestamp !== null &&
      observation.timestamp <
        this.lastTimestamp
    ) {
      throw new Error(
        "Backtest equity timestamps cannot move backwards.",
      );
    }

    if (
      this.lastCandleIndex !== null &&
      observation.candleIndex <
        this.lastCandleIndex
    ) {
      throw new Error(
        "Backtest equity candle order cannot move backwards.",
      );
    }

    if (
      observation.reason === "INITIAL" &&
      this.points.length > 0
    ) {
      throw new Error(
        "The initial equity observation must be recorded first.",
      );
    }

    if (
      observation.reason === "INITIAL" &&
      observation.candleIndex !== -1
    ) {
      throw new Error(
        "The initial equity observation must use candle index -1.",
      );
    }

    if (
      observation.reason !== "INITIAL" &&
      observation.candleIndex < 0
    ) {
      throw new Error(
        "Non-initial equity observations require a non-negative candle index.",
      );
    }

    if (
      this.points.length === 0 &&
      observation.reason !== "INITIAL"
    ) {
      throw new Error(
        "The first equity observation must be INITIAL.",
      );
    }

    const latestPoint =
      this.points.at(-1);

    if (
      latestPoint?.reason === "FINAL"
    ) {
      throw new Error(
        "No equity observations may be recorded after the final observation.",
      );
    }
  }

  private clonePortfolioSnapshot(
    snapshot:
      BacktestEquityObservation["portfolioSnapshot"],
  ): BacktestEquityObservation["portfolioSnapshot"] {
    return Object.freeze({
      ...snapshot,
    });
  }

  private assertFiniteNumber(
    value: number,
    label: string,
  ): void {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${label} must be a finite number.`,
      );
    }
  }

  private static createEmptyMetrics():
    BacktestEquityCurveMetrics {
    return Object.freeze({
      observations: 0,

      initialEquity: 0,
      currentEquity: 0,
      peakEquity: 0,
      minimumEquity: 0,

      absoluteReturn: 0,
      returnRate: 0,

      currentDrawdownAmount: 0,
      currentDrawdownRate: 0,

      maximumDrawdownAmount: 0,
      maximumDrawdownRate: 0,

      realizedPnl: 0,
      unrealizedPnl: 0,
      totalPnl: 0,
      totalFees: 0,

      profitableObservations: 0,
      losingObservations: 0,
      unchangedObservations: 0,
    });
  }
}