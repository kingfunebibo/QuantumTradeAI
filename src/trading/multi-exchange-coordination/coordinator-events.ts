import type {
  CoordinatorEventType,
  CoordinatorMetadata,
  CoordinatorSequence,
  MultiExchangeCoordinatorCausationId,
  MultiExchangeCoordinatorClock,
  MultiExchangeCoordinatorCorrelationId,
  MultiExchangeCoordinatorEvent,
  MultiExchangeCoordinatorEventId,
  MultiExchangeCoordinatorId,
  MultiExchangeCoordinatorInstanceId,
} from "./coordinator-contracts";

export interface MultiExchangeCoordinatorEventFactoryIdentity {
  readonly coordinatorId: MultiExchangeCoordinatorId;
  readonly instanceId: MultiExchangeCoordinatorInstanceId;
}

export interface MultiExchangeCoordinatorEventInput<TPayload> {
  readonly eventType: CoordinatorEventType;
  readonly payload: TPayload;
  readonly correlationId?: MultiExchangeCoordinatorCorrelationId | null;
  readonly causationId?: MultiExchangeCoordinatorCausationId | null;
  readonly metadata?: CoordinatorMetadata;
}

export interface MultiExchangeCoordinatorEventIdGenerator {
  nextId(
    sequence: CoordinatorSequence,
  ): MultiExchangeCoordinatorEventId;
}

export interface MultiExchangeCoordinatorSequenceGenerator {
  current(): CoordinatorSequence;
  next(): CoordinatorSequence;
  reset(sequence?: CoordinatorSequence): CoordinatorSequence;
}

export class MultiExchangeCoordinatorSequenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MultiExchangeCoordinatorSequenceError";

    Object.setPrototypeOf(
      this,
      MultiExchangeCoordinatorSequenceError.prototype,
    );
  }
}

function assertValidSequence(
  sequence: CoordinatorSequence,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(sequence)) {
    throw new MultiExchangeCoordinatorSequenceError(
      `${fieldName} must be a safe integer.`,
    );
  }

  if (sequence < 0) {
    throw new MultiExchangeCoordinatorSequenceError(
      `${fieldName} cannot be negative.`,
    );
  }
}

export class DeterministicMultiExchangeCoordinatorSequenceGenerator
  implements MultiExchangeCoordinatorSequenceGenerator
{
  private sequence: CoordinatorSequence;

  public constructor(initialSequence: CoordinatorSequence = 0) {
    assertValidSequence(initialSequence, "initialSequence");

    this.sequence = initialSequence;
  }

  public current(): CoordinatorSequence {
    return this.sequence;
  }

  public next(): CoordinatorSequence {
    if (this.sequence === Number.MAX_SAFE_INTEGER) {
      throw new MultiExchangeCoordinatorSequenceError(
        "Coordinator event sequence has reached the maximum safe integer.",
      );
    }

    this.sequence += 1;

    return this.sequence;
  }

  public reset(
    sequence: CoordinatorSequence = 0,
  ): CoordinatorSequence {
    assertValidSequence(sequence, "sequence");

    this.sequence = sequence;

    return this.sequence;
  }
}

export class DeterministicMultiExchangeCoordinatorEventIdGenerator
  implements MultiExchangeCoordinatorEventIdGenerator
{
  public constructor(
    private readonly prefix = "coordinator-event",
  ) {
    if (prefix.trim().length === 0) {
      throw new Error(
        "Coordinator event ID prefix cannot be empty.",
      );
    }
  }

  public nextId(
    sequence: CoordinatorSequence,
  ): MultiExchangeCoordinatorEventId {
    assertValidSequence(sequence, "sequence");

    return `${this.prefix}-${sequence.toString().padStart(12, "0")}`;
  }
}

export class MultiExchangeCoordinatorEventFactory {
  public constructor(
    private readonly identity:
      MultiExchangeCoordinatorEventFactoryIdentity,
    private readonly clock: MultiExchangeCoordinatorClock,
    private readonly sequenceGenerator:
      MultiExchangeCoordinatorSequenceGenerator =
        new DeterministicMultiExchangeCoordinatorSequenceGenerator(),
    private readonly eventIdGenerator:
      MultiExchangeCoordinatorEventIdGenerator =
        new DeterministicMultiExchangeCoordinatorEventIdGenerator(),
  ) {
    if (identity.coordinatorId.trim().length === 0) {
      throw new Error("coordinatorId cannot be empty.");
    }

    if (identity.instanceId.trim().length === 0) {
      throw new Error("instanceId cannot be empty.");
    }
  }

  public create<TPayload>(
    input: MultiExchangeCoordinatorEventInput<TPayload>,
  ): MultiExchangeCoordinatorEvent<TPayload> {
    const sequence = this.sequenceGenerator.next();
    const occurredAt = this.clock.now();

    if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) {
      throw new Error(
        "Coordinator event timestamp must be a non-negative safe integer.",
      );
    }

    return Object.freeze({
      eventId: this.eventIdGenerator.nextId(sequence),
      eventType: input.eventType,
      coordinatorId: this.identity.coordinatorId,
      instanceId: this.identity.instanceId,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      sequence,
      occurredAt,
      payload: input.payload,
      metadata: Object.freeze({
        ...(input.metadata ?? {}),
      }),
    });
  }

  public getCurrentSequence(): CoordinatorSequence {
    return this.sequenceGenerator.current();
  }
}

export function createMultiExchangeCoordinatorEventFactory(
  identity: MultiExchangeCoordinatorEventFactoryIdentity,
  clock: MultiExchangeCoordinatorClock,
  sequenceGenerator:
    MultiExchangeCoordinatorSequenceGenerator =
      new DeterministicMultiExchangeCoordinatorSequenceGenerator(),
  eventIdGenerator:
    MultiExchangeCoordinatorEventIdGenerator =
      new DeterministicMultiExchangeCoordinatorEventIdGenerator(),
): MultiExchangeCoordinatorEventFactory {
  return new MultiExchangeCoordinatorEventFactory(
    identity,
    clock,
    sequenceGenerator,
    eventIdGenerator,
  );
}