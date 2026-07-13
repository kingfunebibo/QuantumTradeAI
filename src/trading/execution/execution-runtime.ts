import {
  randomUUID,
} from "node:crypto";

export interface ExecutionRuntime {
  now(): number;

  nextOrderId(): string;

  nextFillId(): string;

  reset(): void;
}

export interface DeterministicExecutionRuntimeOptions {
  readonly initialTimestamp?: number;
  readonly orderIdPrefix?: string;
  readonly fillIdPrefix?: string;
}

/**
 * Default runtime used outside deterministic simulations.
 */
export class SystemExecutionRuntime
  implements ExecutionRuntime
{
  public now(): number {
    return Date.now();
  }

  public nextOrderId(): string {
    return randomUUID();
  }

  public nextFillId(): string {
    return randomUUID();
  }

  public reset(): void {
    // The system clock and UUID generator have no mutable
    // state that needs to be reset.
  }
}

/**
 * Explicitly controlled runtime for deterministic backtests.
 *
 * The simulation driver must call advanceTo() before executing
 * orders for a candle.
 */
export class DeterministicExecutionRuntime
  implements ExecutionRuntime
{
  private readonly initialTimestamp:
    number;

  private readonly orderIdPrefix:
    string;

  private readonly fillIdPrefix:
    string;

  private currentTimestamp: number;

  private nextOrderSequence = 1;
  private nextFillSequence = 1;

  public constructor(
    options:
      DeterministicExecutionRuntimeOptions = {},
  ) {
    this.initialTimestamp =
      options.initialTimestamp ?? 0;

    this.orderIdPrefix =
      this.normalizePrefix(
        options.orderIdPrefix ??
          "BACKTEST-ORDER",
        "Order ID prefix",
      );

    this.fillIdPrefix =
      this.normalizePrefix(
        options.fillIdPrefix ??
          "BACKTEST-FILL",
        "Fill ID prefix",
      );

    this.validateTimestamp(
      this.initialTimestamp,
      "Initial execution timestamp",
    );

    this.currentTimestamp =
      this.initialTimestamp;
  }

  public now(): number {
    return this.currentTimestamp;
  }

  public advanceTo(
    timestamp: number,
  ): void {
    this.validateTimestamp(
      timestamp,
      "Execution timestamp",
    );

    if (
      timestamp <
      this.currentTimestamp
    ) {
      throw new Error(
        "Deterministic execution time cannot move backwards.",
      );
    }

    this.currentTimestamp =
      timestamp;
  }

  public nextOrderId(): string {
    const id =
      `${this.orderIdPrefix}-${this.nextOrderSequence}`;

    this.nextOrderSequence += 1;

    return id;
  }

  public nextFillId(): string {
    const id =
      `${this.fillIdPrefix}-${this.nextFillSequence}`;

    this.nextFillSequence += 1;

    return id;
  }

  public reset(): void {
    this.currentTimestamp =
      this.initialTimestamp;

    this.nextOrderSequence = 1;
    this.nextFillSequence = 1;
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

  private normalizePrefix(
    prefix: string,
    label: string,
  ): string {
    if (typeof prefix !== "string") {
      throw new Error(
        `${label} must be a string.`,
      );
    }

    const normalizedPrefix =
      prefix.trim();

    if (
      normalizedPrefix.length === 0
    ) {
      throw new Error(
        `${label} must be non-empty.`,
      );
    }

    return normalizedPrefix;
  }
}