import {
  type AlgorithmicExecutionClock,
  type AlgorithmicExecutionEvent,
  type AlgorithmicExecutionEventType,
  type AlgorithmicExecutionIdentifierGenerator,
  type AlgorithmicExecutionMetadata,
  freezeAlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface AlgorithmicExecutionEventFactoryOptions {
  readonly clock:
    AlgorithmicExecutionClock;

  readonly identifierGenerator:
    AlgorithmicExecutionIdentifierGenerator;

  /**
   * Prefix passed to the deterministic identifier generator.
   *
   * Defaults to "algorithmic-execution-event".
   */
  readonly eventIdPrefix?: string;

  /**
   * Initial sequence used for executions that do not yet have
   * a recorded sequence.
   *
   * Defaults to 0.
   */
  readonly initialSequence?: number;
}

export interface CreateAlgorithmicExecutionEventInput {
  readonly executionId: string;

  readonly sliceId?: string | null;

  readonly childOrderId?: string | null;

  readonly type:
    AlgorithmicExecutionEventType;

  /**
   * When null or omitted, the factory clock is used.
   */
  readonly occurredAt?: number | null;

  /**
   * When omitted, the next deterministic sequence for the execution
   * is generated automatically.
   */
  readonly sequence?: number;

  readonly payload?:
    AlgorithmicExecutionMetadata;
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

function assertOptionalNonEmptyString(
  value: string | null | undefined,
  field: string,
): void {
  if (
    value === null ||
    value === undefined
  ) {
    return;
  }

  assertNonEmptyString(
    value,
    field,
  );
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

function assertTimestamp(
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

function cloneEvent(
  event:
    AlgorithmicExecutionEvent,
): AlgorithmicExecutionEvent {
  return Object.freeze({
    ...event,

    payload:
      freezeAlgorithmicExecutionMetadata(
        event.payload,
      ),
  });
}

export class AlgorithmicExecutionEventFactory {
  private readonly clock:
    AlgorithmicExecutionClock;

  private readonly identifierGenerator:
    AlgorithmicExecutionIdentifierGenerator;

  private readonly eventIdPrefix:
    string;

  private readonly initialSequence:
    number;

  private readonly nextSequenceByExecutionId =
    new Map<
      string,
      number
    >();

  public constructor(
    options:
      AlgorithmicExecutionEventFactoryOptions,
  ) {
    if (
      options === null ||
      options === undefined ||
      typeof options !== "object"
    ) {
      throw new Error(
        "options must be provided.",
      );
    }

    if (
      options.clock === null ||
      options.clock === undefined ||
      typeof options.clock.now !==
        "function"
    ) {
      throw new Error(
        "options.clock must implement AlgorithmicExecutionClock.",
      );
    }

    if (
      options.identifierGenerator === null ||
      options.identifierGenerator === undefined ||
      typeof options.identifierGenerator.nextId !==
        "function"
    ) {
      throw new Error(
        [
          "options.identifierGenerator must implement",
          "AlgorithmicExecutionIdentifierGenerator.",
        ].join(" "),
      );
    }

    const eventIdPrefix =
      options.eventIdPrefix ??
      "algorithmic-execution-event";

    const initialSequence =
      options.initialSequence ??
      0;

    assertNonEmptyString(
      eventIdPrefix,
      "options.eventIdPrefix",
    );

    assertNonNegativeInteger(
      initialSequence,
      "options.initialSequence",
    );

    this.clock =
      options.clock;

    this.identifierGenerator =
      options.identifierGenerator;

    this.eventIdPrefix =
      eventIdPrefix.trim();

    this.initialSequence =
      initialSequence;
  }

  public create(
    input:
      CreateAlgorithmicExecutionEventInput,
  ): AlgorithmicExecutionEvent {
    this.assertInput(
      input,
    );

    const executionId =
      input.executionId.trim();

    const sequence =
      input.sequence ??
      this.getNextSequence(
        executionId,
      );

    this.assertSequenceAvailable(
      executionId,
      sequence,
    );

    const occurredAt =
      input.occurredAt ??
      this.clock.now();

    assertTimestamp(
      occurredAt,
      "input.occurredAt",
    );

    const event:
      AlgorithmicExecutionEvent =
      Object.freeze({
        eventId:
          this.identifierGenerator.nextId(
            this.eventIdPrefix,
          ),

        executionId,

        sliceId:
          input.sliceId === undefined
            ? null
            : input.sliceId,

        childOrderId:
          input.childOrderId === undefined
            ? null
            : input.childOrderId,

        type:
          input.type,

        occurredAt,

        sequence,

        payload:
          freezeAlgorithmicExecutionMetadata(
            input.payload,
          ),
      });

    this.nextSequenceByExecutionId.set(
      executionId,
      sequence + 1,
    );

    return cloneEvent(
      event,
    );
  }

  public createExecutionEvent(
    executionId: string,
    type:
      AlgorithmicExecutionEventType,
    payload:
      AlgorithmicExecutionMetadata = {},
    occurredAt: number | null = null,
  ): AlgorithmicExecutionEvent {
    return this.create({
      executionId,
      type,
      occurredAt,
      payload,
    });
  }

  public createSliceEvent(
    executionId: string,
    sliceId: string,
    type:
      AlgorithmicExecutionEventType,
    payload:
      AlgorithmicExecutionMetadata = {},
    occurredAt: number | null = null,
  ): AlgorithmicExecutionEvent {
    return this.create({
      executionId,
      sliceId,
      type,
      occurredAt,
      payload,
    });
  }

  public createChildOrderEvent(
    executionId: string,
    sliceId: string,
    childOrderId: string,
    type:
      AlgorithmicExecutionEventType,
    payload:
      AlgorithmicExecutionMetadata = {},
    occurredAt: number | null = null,
  ): AlgorithmicExecutionEvent {
    return this.create({
      executionId,
      sliceId,
      childOrderId,
      type,
      occurredAt,
      payload,
    });
  }

  public peekNextSequence(
    executionId: string,
  ): number {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    return this.getNextSequence(
      executionId.trim(),
    );
  }

  public setNextSequence(
    executionId: string,
    nextSequence: number,
  ): void {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    assertNonNegativeInteger(
      nextSequence,
      "nextSequence",
    );

    this.nextSequenceByExecutionId.set(
      executionId.trim(),
      nextSequence,
    );
  }

  public synchronizeFromEvents(
    executionId: string,
    events:
      readonly AlgorithmicExecutionEvent[],
  ): number {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    if (
      !Array.isArray(
        events,
      )
    ) {
      throw new Error(
        "events must be an array.",
      );
    }

    const normalizedExecutionId =
      executionId.trim();

    let nextSequence =
      this.initialSequence;

    for (
      const event of
      events
    ) {
      if (
        event.executionId !==
        normalizedExecutionId
      ) {
        throw new Error(
          [
            "All events must belong to execution",
            `${normalizedExecutionId}.`,
          ].join(" "),
        );
      }

      assertNonNegativeInteger(
        event.sequence,
        "event.sequence",
      );

      nextSequence =
        Math.max(
          nextSequence,
          event.sequence + 1,
        );
    }

    this.nextSequenceByExecutionId.set(
      normalizedExecutionId,
      nextSequence,
    );

    return nextSequence;
  }

  public resetExecution(
    executionId: string,
    nextSequence:
      number = this.initialSequence,
  ): void {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    assertNonNegativeInteger(
      nextSequence,
      "nextSequence",
    );

    const normalizedExecutionId =
      executionId.trim();

    if (
      nextSequence ===
      this.initialSequence
    ) {
      this.nextSequenceByExecutionId.delete(
        normalizedExecutionId,
      );

      return;
    }

    this.nextSequenceByExecutionId.set(
      normalizedExecutionId,
      nextSequence,
    );
  }

  public clear(): void {
    this.nextSequenceByExecutionId.clear();
  }

  public trackedExecutionCount():
    number {
    return this.nextSequenceByExecutionId.size;
  }

  private assertInput(
    input:
      CreateAlgorithmicExecutionEventInput,
  ): void {
    if (
      input === null ||
      input === undefined ||
      typeof input !== "object"
    ) {
      throw new Error(
        "input must be provided.",
      );
    }

    assertNonEmptyString(
      input.executionId,
      "input.executionId",
    );

    assertOptionalNonEmptyString(
      input.sliceId,
      "input.sliceId",
    );

    assertOptionalNonEmptyString(
      input.childOrderId,
      "input.childOrderId",
    );

    assertNonEmptyString(
      input.type,
      "input.type",
    );

    if (
      input.sequence !== undefined
    ) {
      assertNonNegativeInteger(
        input.sequence,
        "input.sequence",
      );
    }

    if (
      input.occurredAt !== undefined &&
      input.occurredAt !== null
    ) {
      assertTimestamp(
        input.occurredAt,
        "input.occurredAt",
      );
    }
  }

  private getNextSequence(
    executionId: string,
  ): number {
    return (
      this.nextSequenceByExecutionId.get(
        executionId,
      ) ??
      this.initialSequence
    );
  }

  private assertSequenceAvailable(
    executionId: string,
    sequence: number,
  ): void {
    assertNonNegativeInteger(
      sequence,
      "sequence",
    );

    const expectedSequence =
      this.getNextSequence(
        executionId,
      );

    if (
      sequence <
      expectedSequence
    ) {
      throw new Error(
        [
          `Sequence ${sequence} cannot be used`,
          `for execution ${executionId}.`,
          `The next sequence is ${expectedSequence}.`,
        ].join(" "),
      );
    }
  }
}

export function createAlgorithmicExecutionEventFactory(
  options:
    AlgorithmicExecutionEventFactoryOptions,
): AlgorithmicExecutionEventFactory {
  return new AlgorithmicExecutionEventFactory(
    options,
  );
}