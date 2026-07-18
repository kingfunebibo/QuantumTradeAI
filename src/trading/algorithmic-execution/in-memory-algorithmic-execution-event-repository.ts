import {
  type AlgorithmicExecutionEvent,
  type AlgorithmicExecutionEventRepository,
  type AlgorithmicExecutionMetadata,
} from "./algorithmic-execution-contracts";

export interface InMemoryAlgorithmicExecutionEventRepositoryOptions {
  /**
   * Existing events used to initialize the repository.
   */
  readonly initialEvents?:
    readonly AlgorithmicExecutionEvent[];

  /**
   * Prevents two events from using the same event ID.
   */
  readonly rejectDuplicateEventIds?: boolean;

  /**
   * Prevents two different events within one execution from using
   * the same sequence number.
   */
  readonly rejectDuplicateSequences?: boolean;

  /**
   * Prevents newly appended events from using a sequence lower than
   * the highest sequence already stored for the execution.
   */
  readonly enforceMonotonicSequences?: boolean;
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
  value: string | null,
  field: string,
): void {
  if (value === null) {
    return;
  }

  assertNonEmptyString(
    value,
    field,
  );
}

function assertMetadata(
  metadata: AlgorithmicExecutionMetadata,
  field: string,
): void {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new Error(
      `${field} must be an object.`,
    );
  }

  for (
    const [
      key,
      value,
    ] of Object.entries(
      metadata,
    )
  ) {
    assertNonEmptyString(
      key,
      `${field} key`,
    );

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        [
          `${field}.${key} must be`,
          "a string, number, boolean, or null.",
        ].join(" "),
      );
    }

    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `${field}.${key} must be finite.`,
      );
    }
  }
}

function assertEvent(
  event: AlgorithmicExecutionEvent,
): void {
  if (
    event === null ||
    event === undefined ||
    typeof event !== "object"
  ) {
    throw new Error(
      "event must be an AlgorithmicExecutionEvent object.",
    );
  }

  assertNonEmptyString(
    event.eventId,
    "event.eventId",
  );

  assertNonEmptyString(
    event.executionId,
    "event.executionId",
  );

  assertOptionalNonEmptyString(
    event.sliceId,
    "event.sliceId",
  );

  assertOptionalNonEmptyString(
    event.childOrderId,
    "event.childOrderId",
  );

  assertNonEmptyString(
    event.type,
    "event.type",
  );

  if (
    !Number.isFinite(
      event.occurredAt,
    ) ||
    event.occurredAt < 0
  ) {
    throw new Error(
      "event.occurredAt must be a non-negative finite number.",
    );
  }

  if (
    !Number.isInteger(
      event.sequence,
    ) ||
    event.sequence < 0
  ) {
    throw new Error(
      "event.sequence must be a non-negative integer.",
    );
  }

  assertMetadata(
    event.payload,
    "event.payload",
  );
}

function cloneMetadata(
  metadata: AlgorithmicExecutionMetadata,
): AlgorithmicExecutionMetadata {
  return Object.freeze({
    ...metadata,
  });
}

function cloneEvent(
  event: AlgorithmicExecutionEvent,
): AlgorithmicExecutionEvent {
  return Object.freeze({
    ...event,

    payload:
      cloneMetadata(
        event.payload,
      ),
  });
}

function eventsAreEquivalent(
  left: AlgorithmicExecutionEvent,
  right: AlgorithmicExecutionEvent,
): boolean {
  return (
    left.eventId ===
      right.eventId &&
    left.executionId ===
      right.executionId &&
    left.sliceId ===
      right.sliceId &&
    left.childOrderId ===
      right.childOrderId &&
    left.type ===
      right.type &&
    left.occurredAt ===
      right.occurredAt &&
    left.sequence ===
      right.sequence &&
    JSON.stringify(
      left.payload,
    ) ===
      JSON.stringify(
        right.payload,
      )
  );
}

function compareEvents(
  left: AlgorithmicExecutionEvent,
  right: AlgorithmicExecutionEvent,
): number {
  if (
    left.sequence !==
    right.sequence
  ) {
    return (
      left.sequence -
      right.sequence
    );
  }

  if (
    left.occurredAt !==
    right.occurredAt
  ) {
    return (
      left.occurredAt -
      right.occurredAt
    );
  }

  return left.eventId.localeCompare(
    right.eventId,
  );
}

export class InMemoryAlgorithmicExecutionEventRepository
implements AlgorithmicExecutionEventRepository {
  private readonly eventsByExecutionId =
    new Map<
      string,
      AlgorithmicExecutionEvent[]
    >();

  private readonly eventsByEventId =
    new Map<
      string,
      AlgorithmicExecutionEvent
    >();

  private readonly rejectDuplicateEventIds:
    boolean;

  private readonly rejectDuplicateSequences:
    boolean;

  private readonly enforceMonotonicSequences:
    boolean;

  public constructor(
    options:
      InMemoryAlgorithmicExecutionEventRepositoryOptions = {},
  ) {
    this.rejectDuplicateEventIds =
      options.rejectDuplicateEventIds ??
      true;

    this.rejectDuplicateSequences =
      options.rejectDuplicateSequences ??
      true;

    this.enforceMonotonicSequences =
      options.enforceMonotonicSequences ??
      true;

    const initialEvents =
      options.initialEvents ??
      [];

    for (
      const event of
      initialEvents
    ) {
      this.appendInitialEvent(
        event,
      );
    }
  }

  public async append(
    event:
      AlgorithmicExecutionEvent,
  ): Promise<void> {
    assertEvent(
      event,
    );

    const existingByEventId =
      this.eventsByEventId.get(
        event.eventId,
      );

    if (
      existingByEventId !==
      undefined
    ) {
      if (
        eventsAreEquivalent(
          existingByEventId,
          event,
        )
      ) {
        return;
      }

      if (
        this.rejectDuplicateEventIds
      ) {
        throw new Error(
          [
            "An algorithmic execution event",
            `with eventId ${event.eventId}`,
            "already exists.",
          ].join(" "),
        );
      }
    }

    const existingEvents =
      this.eventsByExecutionId.get(
        event.executionId,
      ) ??
      [];

    this.assertSequenceRules(
      event,
      existingEvents,
    );

    const storedEvent =
      cloneEvent(
        event,
      );

    const updatedEvents =
      [
        ...existingEvents,
        storedEvent,
      ].sort(
        compareEvents,
      );

    this.eventsByExecutionId.set(
      event.executionId,
      updatedEvents,
    );

    this.eventsByEventId.set(
      event.eventId,
      storedEvent,
    );
  }

  public async findByExecutionId(
    executionId: string,
  ): Promise<
    readonly AlgorithmicExecutionEvent[]
  > {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    const events =
      this.eventsByExecutionId.get(
        executionId,
      );

    if (
      events === undefined
    ) {
      return Object.freeze([]);
    }

    return Object.freeze(
      events.map(
        (
          event,
        ) =>
          cloneEvent(
            event,
          ),
      ),
    );
  }

  public findByEventId(
    eventId: string,
  ): AlgorithmicExecutionEvent | null {
    assertNonEmptyString(
      eventId,
      "eventId",
    );

    const event =
      this.eventsByEventId.get(
        eventId,
      );

    if (
      event === undefined
    ) {
      return null;
    }

    return cloneEvent(
      event,
    );
  }

  public hasEvent(
    eventId: string,
  ): boolean {
    assertNonEmptyString(
      eventId,
      "eventId",
    );

    return this.eventsByEventId.has(
      eventId,
    );
  }

  public countByExecutionId(
    executionId: string,
  ): number {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    return (
      this.eventsByExecutionId.get(
        executionId,
      )?.length ??
      0
    );
  }

  public listExecutionIds():
    readonly string[] {
    return Object.freeze(
      Array.from(
        this.eventsByExecutionId.keys(),
      ).sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      ),
    );
  }

  public listAllEvents():
    readonly AlgorithmicExecutionEvent[] {
    const events =
      Array.from(
        this.eventsByExecutionId.values(),
      )
        .flat()
        .sort(
          (
            left,
            right,
          ) => {
            const executionComparison =
              left.executionId.localeCompare(
                right.executionId,
              );

            if (
              executionComparison !==
              0
            ) {
              return executionComparison;
            }

            return compareEvents(
              left,
              right,
            );
          },
        )
        .map(
          (
            event,
          ) =>
            cloneEvent(
              event,
            ),
        );

    return Object.freeze(
      events,
    );
  }

  public deleteByExecutionId(
    executionId: string,
  ): void {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    const events =
      this.eventsByExecutionId.get(
        executionId,
      );

    if (
      events === undefined
    ) {
      return;
    }

    for (
      const event of
      events
    ) {
      this.eventsByEventId.delete(
        event.eventId,
      );
    }

    this.eventsByExecutionId.delete(
      executionId,
    );
  }

  public clear(): void {
    this.eventsByExecutionId.clear();
    this.eventsByEventId.clear();
  }

  public size(): number {
    return this.eventsByEventId.size;
  }

  private appendInitialEvent(
    event:
      AlgorithmicExecutionEvent,
  ): void {
    assertEvent(
      event,
    );

    const existingByEventId =
      this.eventsByEventId.get(
        event.eventId,
      );

    if (
      existingByEventId !==
      undefined
    ) {
      throw new Error(
        [
          "Duplicate initial algorithmic execution event",
          `with eventId ${event.eventId}.`,
        ].join(" "),
      );
    }

    const existingEvents =
      this.eventsByExecutionId.get(
        event.executionId,
      ) ??
      [];

    this.assertSequenceRules(
      event,
      existingEvents,
    );

    const storedEvent =
      cloneEvent(
        event,
      );

    const updatedEvents =
      [
        ...existingEvents,
        storedEvent,
      ].sort(
        compareEvents,
      );

    this.eventsByExecutionId.set(
      event.executionId,
      updatedEvents,
    );

    this.eventsByEventId.set(
      event.eventId,
      storedEvent,
    );
  }

  private assertSequenceRules(
    event:
      AlgorithmicExecutionEvent,
    existingEvents:
      readonly AlgorithmicExecutionEvent[],
  ): void {
    const conflictingSequence =
      existingEvents.find(
        (
          existingEvent,
        ) =>
          existingEvent.sequence ===
          event.sequence,
      );

    if (
      conflictingSequence !==
        undefined &&
      this.rejectDuplicateSequences &&
      !eventsAreEquivalent(
        conflictingSequence,
        event,
      )
    ) {
      throw new Error(
        [
          "Execution",
          event.executionId,
          "already contains an event",
          `at sequence ${event.sequence}.`,
        ].join(" "),
      );
    }

    if (
      !this.enforceMonotonicSequences ||
      existingEvents.length === 0
    ) {
      return;
    }

    const highestSequence =
      existingEvents.reduce(
        (
          highest,
          existingEvent,
        ) =>
          Math.max(
            highest,
            existingEvent.sequence,
          ),
        -1,
      );

    if (
      event.sequence <
      highestSequence
    ) {
      throw new Error(
        [
          "Cannot append event",
          event.eventId,
          `at sequence ${event.sequence}`,
          "because execution",
          event.executionId,
          "already contains sequence",
          `${highestSequence}.`,
        ].join(" "),
      );
    }
  }
}

export function createInMemoryAlgorithmicExecutionEventRepository(
  options:
    InMemoryAlgorithmicExecutionEventRepositoryOptions = {},
): AlgorithmicExecutionEventRepository {
  return new InMemoryAlgorithmicExecutionEventRepository(
    options,
  );
}