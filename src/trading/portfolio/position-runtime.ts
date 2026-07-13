import {
  randomUUID,
} from "node:crypto";

export interface PositionRuntime {
  now(): number;

  nextPositionId(): string;

  nextClosedTradeId(): string;

  reset(): void;
}

export interface DeterministicPositionRuntimeOptions {
  readonly initialTimestamp?: number;
  readonly positionIdPrefix?: string;
  readonly closedTradeIdPrefix?: string;
}

/**
 * Default runtime used for ordinary production portfolio activity.
 */
export class SystemPositionRuntime
  implements PositionRuntime
{
  public now(): number {
    return Date.now();
  }

  public nextPositionId(): string {
    return randomUUID();
  }

  public nextClosedTradeId(): string {
    return randomUUID();
  }

  public reset(): void {
    // System time and UUID generation have no local state.
  }
}

/**
 * Controlled runtime for deterministic position and trade records.
 *
 * The backtest driver advances this runtime to the current
 * simulation timestamp before processing executions or marks.
 */
export class DeterministicPositionRuntime
  implements PositionRuntime
{
  private readonly initialTimestamp:
    number;

  private readonly positionIdPrefix:
    string;

  private readonly closedTradeIdPrefix:
    string;

  private currentTimestamp: number;

  private nextPositionSequence = 1;
  private nextClosedTradeSequence = 1;

  public constructor(
    options:
      DeterministicPositionRuntimeOptions = {},
  ) {
    this.initialTimestamp =
      options.initialTimestamp ?? 0;

    this.positionIdPrefix =
      this.normalizePrefix(
        options.positionIdPrefix ??
          "BACKTEST-POSITION",
        "Position ID prefix",
      );

    this.closedTradeIdPrefix =
      this.normalizePrefix(
        options.closedTradeIdPrefix ??
          "BACKTEST-CLOSED-TRADE",
        "Closed trade ID prefix",
      );

    this.validateTimestamp(
      this.initialTimestamp,
      "Initial position timestamp",
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
      "Position timestamp",
    );

    if (
      timestamp <
      this.currentTimestamp
    ) {
      throw new Error(
        "Deterministic position time cannot move backwards.",
      );
    }

    this.currentTimestamp =
      timestamp;
  }

  public nextPositionId(): string {
    const id =
      `${this.positionIdPrefix}-${this.nextPositionSequence}`;

    this.nextPositionSequence += 1;

    return id;
  }

  public nextClosedTradeId(): string {
    const id =
      `${this.closedTradeIdPrefix}-${this.nextClosedTradeSequence}`;

    this.nextClosedTradeSequence += 1;

    return id;
  }

  public reset(): void {
    this.currentTimestamp =
      this.initialTimestamp;

    this.nextPositionSequence = 1;
    this.nextClosedTradeSequence = 1;
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