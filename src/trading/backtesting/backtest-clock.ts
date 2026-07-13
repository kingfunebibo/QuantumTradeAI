import { BacktestClock } from "./backtesting.types";

export class DeterministicBacktestClock implements BacktestClock {
  private currentTimestamp: number | null = null;

  public now(): number | null {
    return this.currentTimestamp;
  }

  public advanceTo(timestamp: number): void {
    this.assertValidTimestamp(timestamp);

    if (
      this.currentTimestamp !== null &&
      timestamp < this.currentTimestamp
    ) {
      throw new Error(
        `Backtest clock cannot move backwards from ` +
          `${this.currentTimestamp} to ${timestamp}.`,
      );
    }

    this.currentTimestamp = timestamp;
  }

  public reset(): void {
    this.currentTimestamp = null;
  }

  private assertValidTimestamp(timestamp: number): void {
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
      throw new Error(
        `Backtest timestamp must be a non-negative safe integer. ` +
          `Received: ${timestamp}.`,
      );
    }
  }
}