import { randomUUID } from "node:crypto";

export interface SignalRuntime {
  now(): number;
  generateId(): string;
}

export class SystemSignalRuntime
  implements SignalRuntime
{
  public now(): number {
    return Date.now();
  }

  public generateId(): string {
    return randomUUID();
  }
}

export interface DeterministicSignalRuntimeOptions {
  readonly initialTimestamp?: number;
  readonly idPrefix?: string;
  readonly initialSequence?: number;
}

export class DeterministicSignalRuntime
  implements SignalRuntime
{
  private currentTimestamp: number;
  private nextSequence: number;

  private readonly idPrefix: string;
  private readonly initialTimestamp: number;
  private readonly initialSequence: number;

  public constructor(
    options: DeterministicSignalRuntimeOptions = {},
  ) {
    this.initialTimestamp =
      options.initialTimestamp ?? 0;

    this.initialSequence =
      options.initialSequence ?? 1;

    this.idPrefix =
      options.idPrefix?.trim() ||
      "BT-SIGNAL";

    this.validateTimestamp(
      this.initialTimestamp,
    );

    this.validateSequence(
      this.initialSequence,
    );

    this.currentTimestamp =
      this.initialTimestamp;

    this.nextSequence =
      this.initialSequence;
  }

  public now(): number {
    return this.currentTimestamp;
  }

  public generateId(): string {
    const id =
      `${this.idPrefix}-${this.nextSequence}`;

    this.nextSequence += 1;

    return id;
  }

  public advanceTo(timestamp: number): void {
    this.validateTimestamp(timestamp);

    if (timestamp < this.currentTimestamp) {
      throw new Error(
        "Deterministic signal runtime cannot move backwards " +
          `from ${this.currentTimestamp} to ${timestamp}.`,
      );
    }

    this.currentTimestamp = timestamp;
  }

  public reset(): void {
    this.currentTimestamp =
      this.initialTimestamp;

    this.nextSequence =
      this.initialSequence;
  }

  private validateTimestamp(
    timestamp: number,
  ): void {
    if (
      !Number.isSafeInteger(timestamp) ||
      timestamp < 0
    ) {
      throw new Error(
        "Deterministic signal timestamp must be a " +
          "non-negative safe integer.",
      );
    }
  }

  private validateSequence(
    sequence: number,
  ): void {
    if (
      !Number.isSafeInteger(sequence) ||
      sequence <= 0
    ) {
      throw new Error(
        "Deterministic signal sequence must be a " +
          "positive safe integer.",
      );
    }
  }
}