import {
  type AlgorithmicExecutionClock,
  type AlgorithmicExecutionIdentifierGenerator,
} from "./algorithmic-execution-contracts";

export interface DeterministicAlgorithmicExecutionClockOptions {
  /**
   * Initial timestamp returned by now().
   */
  readonly initialTime?: number;

  /**
   * Automatic increment applied after each call to now().
   *
   * Defaults to 0, meaning time remains fixed until manually advanced.
   */
  readonly tickMilliseconds?: number;
}

export interface DeterministicAlgorithmicExecutionIdentifierGeneratorOptions {
  /**
   * Initial numeric sequence.
   *
   * The first generated identifier uses this value.
   */
  readonly initialSequence?: number;

  /**
   * Number of digits used to pad generated sequence values.
   */
  readonly sequencePadding?: number;

  /**
   * Separator placed between the prefix and numeric sequence.
   */
  readonly separator?: string;
}

export interface DeterministicAlgorithmicExecutionRuntimeOptions {
  readonly clock?:
    DeterministicAlgorithmicExecutionClockOptions;

  readonly identifierGenerator?:
    DeterministicAlgorithmicExecutionIdentifierGeneratorOptions;
}

function assertFiniteNonNegativeNumber(
  value: number,
  field: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative finite number.`,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  field: string,
): void {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${field} must be a positive integer.`,
    );
  }
}

function assertNonEmptyString(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} must be a non-empty string.`,
    );
  }
}

export class DeterministicAlgorithmicExecutionClock
implements AlgorithmicExecutionClock {
  private currentTime: number;

  private readonly tickMilliseconds:
    number;

  public constructor(
    options:
      DeterministicAlgorithmicExecutionClockOptions = {},
  ) {
    const initialTime =
      options.initialTime ??
      0;

    const tickMilliseconds =
      options.tickMilliseconds ??
      0;

    assertFiniteNonNegativeNumber(
      initialTime,
      "options.initialTime",
    );

    assertFiniteNonNegativeNumber(
      tickMilliseconds,
      "options.tickMilliseconds",
    );

    this.currentTime =
      initialTime;

    this.tickMilliseconds =
      tickMilliseconds;
  }

  public now(): number {
    const value =
      this.currentTime;

    this.currentTime +=
      this.tickMilliseconds;

    return value;
  }

  public peek(): number {
    return this.currentTime;
  }

  public setTime(
    timestamp: number,
  ): void {
    assertFiniteNonNegativeNumber(
      timestamp,
      "timestamp",
    );

    this.currentTime =
      timestamp;
  }

  public advanceBy(
    milliseconds: number,
  ): number {
    assertFiniteNonNegativeNumber(
      milliseconds,
      "milliseconds",
    );

    this.currentTime +=
      milliseconds;

    return this.currentTime;
  }

  public advanceTo(
    timestamp: number,
  ): number {
    assertFiniteNonNegativeNumber(
      timestamp,
      "timestamp",
    );

    if (
      timestamp <
      this.currentTime
    ) {
      throw new Error(
        [
          "timestamp cannot be earlier than",
          `the current time ${this.currentTime}.`,
        ].join(" "),
      );
    }

    this.currentTime =
      timestamp;

    return this.currentTime;
  }

  public reset(
    timestamp = 0,
  ): void {
    assertFiniteNonNegativeNumber(
      timestamp,
      "timestamp",
    );

    this.currentTime =
      timestamp;
  }
}

export class DeterministicAlgorithmicExecutionIdentifierGenerator
implements AlgorithmicExecutionIdentifierGenerator {
  private sequence: number;

  private readonly sequencePadding:
    number;

  private readonly separator:
    string;

  public constructor(
    options:
      DeterministicAlgorithmicExecutionIdentifierGeneratorOptions = {},
  ) {
    const initialSequence =
      options.initialSequence ??
      1;

    const sequencePadding =
      options.sequencePadding ??
      6;

    const separator =
      options.separator ??
      "-";

    assertNonNegativeInteger(
      initialSequence,
      "options.initialSequence",
    );

    assertPositiveInteger(
      sequencePadding,
      "options.sequencePadding",
    );

    if (
      typeof separator !==
      "string"
    ) {
      throw new Error(
        "options.separator must be a string.",
      );
    }

    this.sequence =
      initialSequence;

    this.sequencePadding =
      sequencePadding;

    this.separator =
      separator;
  }

  public nextId(
    prefix: string,
  ): string {
    assertNonEmptyString(
      prefix,
      "prefix",
    );

    const normalizedPrefix =
      prefix.trim();

    const currentSequence =
      this.sequence;

    this.sequence += 1;

    return [
      normalizedPrefix,
      String(
        currentSequence,
      ).padStart(
        this.sequencePadding,
        "0",
      ),
    ].join(
      this.separator,
    );
  }

  public peekNextSequence(): number {
    return this.sequence;
  }

  public setNextSequence(
    sequence: number,
  ): void {
    assertNonNegativeInteger(
      sequence,
      "sequence",
    );

    this.sequence =
      sequence;
  }

  public reset(
    sequence = 1,
  ): void {
    assertNonNegativeInteger(
      sequence,
      "sequence",
    );

    this.sequence =
      sequence;
  }
}

export class DeterministicAlgorithmicExecutionRuntime {
  public readonly clock:
    DeterministicAlgorithmicExecutionClock;

  public readonly identifierGenerator:
    DeterministicAlgorithmicExecutionIdentifierGenerator;

  public constructor(
    options:
      DeterministicAlgorithmicExecutionRuntimeOptions = {},
  ) {
    this.clock =
      new DeterministicAlgorithmicExecutionClock(
        options.clock,
      );

    this.identifierGenerator =
      new DeterministicAlgorithmicExecutionIdentifierGenerator(
        options.identifierGenerator,
      );
  }

  public now(): number {
    return this.clock.now();
  }

  public nextId(
    prefix: string,
  ): string {
    return this.identifierGenerator.nextId(
      prefix,
    );
  }

  public reset(
    input: {
      readonly timestamp?: number;
      readonly sequence?: number;
    } = {},
  ): void {
    this.clock.reset(
      input.timestamp ??
      0,
    );

    this.identifierGenerator.reset(
      input.sequence ??
      1,
    );
  }
}

export function createDeterministicAlgorithmicExecutionClock(
  options:
    DeterministicAlgorithmicExecutionClockOptions = {},
): DeterministicAlgorithmicExecutionClock {
  return new DeterministicAlgorithmicExecutionClock(
    options,
  );
}

export function createDeterministicAlgorithmicExecutionIdentifierGenerator(
  options:
    DeterministicAlgorithmicExecutionIdentifierGeneratorOptions = {},
): DeterministicAlgorithmicExecutionIdentifierGenerator {
  return new DeterministicAlgorithmicExecutionIdentifierGenerator(
    options,
  );
}

export function createDeterministicAlgorithmicExecutionRuntime(
  options:
    DeterministicAlgorithmicExecutionRuntimeOptions = {},
): DeterministicAlgorithmicExecutionRuntime {
  return new DeterministicAlgorithmicExecutionRuntime(
    options,
  );
}