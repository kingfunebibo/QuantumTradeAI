/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-event-dispatcher.ts
 *
 * Purpose:
 * Deterministic in-process event dispatcher for enterprise-risk events.
 * Supports ordered subscriptions, event-type filtering, subscriber removal,
 * immutable event delivery, and configurable subscriber-error handling.
 */

import {
  EnterpriseRiskEvent,
  EnterpriseRiskEventPublisher,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export type EnterpriseRiskEventType =
  EnterpriseRiskEvent["eventType"];

export interface EnterpriseRiskEventSubscriber {
  readonly id: string;
  readonly eventTypes?:
    readonly EnterpriseRiskEventType[];

  handle(event: EnterpriseRiskEvent): void;
}

export interface EnterpriseRiskEventDispatchError {
  readonly subscriberId: string;
  readonly eventId: string;
  readonly eventType: EnterpriseRiskEventType;
  readonly error: unknown;
}

export interface EnterpriseRiskEventDispatcherOptions {
  readonly stopOnSubscriberError?: boolean;
  readonly onSubscriberError?: (
    error: EnterpriseRiskEventDispatchError,
  ) => void;
}

export interface EnterpriseRiskEventDispatcher
  extends EnterpriseRiskEventPublisher {
  subscribe(
    subscriber: EnterpriseRiskEventSubscriber,
  ): void;

  unsubscribe(subscriberId: string): boolean;

  hasSubscriber(subscriberId: string): boolean;

  getSubscriberIds(): readonly string[];

  clearSubscribers(): void;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-null object.",
    );
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new EnterpriseRiskValidationError(
      field,
      "must be a non-empty string.",
    );
  }
}

function deepCloneAndFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) =>
        deepCloneAndFreeze(entry),
      ),
    ) as T;
  }

  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(
    value as Readonly<Record<string, unknown>>,
  )) {
    cloned[key] = deepCloneAndFreeze(entry);
  }

  return Object.freeze(cloned) as T;
}

function validateSubscriber(
  subscriber: EnterpriseRiskEventSubscriber,
): void {
  assertObject(
    subscriber,
    "subscriber",
  );

  assertNonEmptyString(
    subscriber.id,
    "subscriber.id",
  );

  if (
    typeof subscriber.handle !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "subscriber.handle",
      "must be a function.",
    );
  }

  if (subscriber.eventTypes !== undefined) {
    if (!Array.isArray(subscriber.eventTypes)) {
      throw new EnterpriseRiskValidationError(
        "subscriber.eventTypes",
        "must be an array.",
      );
    }

    for (
      let index = 0;
      index < subscriber.eventTypes.length;
      index += 1
    ) {
      assertNonEmptyString(
        subscriber.eventTypes[index],
        `subscriber.eventTypes[${index}]`,
      );
    }
  }
}

function validateEvent(
  event: EnterpriseRiskEvent,
): void {
  assertObject(event, "event");

  assertNonEmptyString(
    event.eventId,
    "event.eventId",
  );

  assertNonEmptyString(
    event.eventType,
    "event.eventType",
  );

  assertNonEmptyString(
    event.severity,
    "event.severity",
  );

  assertNonEmptyString(
    event.message,
    "event.message",
  );

  if (
    typeof event.occurredAt !== "number" ||
    !Number.isFinite(event.occurredAt) ||
    event.occurredAt < 0
  ) {
    throw new EnterpriseRiskValidationError(
      "event.occurredAt",
      "must be a non-negative finite number.",
    );
  }
}

function shouldDeliver(
  subscriber: EnterpriseRiskEventSubscriber,
  event: EnterpriseRiskEvent,
): boolean {
  return (
    subscriber.eventTypes === undefined ||
    subscriber.eventTypes.length === 0 ||
    subscriber.eventTypes.includes(
      event.eventType,
    )
  );
}

export class DefaultEnterpriseRiskEventDispatcher
  implements EnterpriseRiskEventDispatcher
{
  private readonly subscribers =
    new Map<
      string,
      EnterpriseRiskEventSubscriber
    >();

  private readonly stopOnSubscriberError:
    boolean;

  private readonly onSubscriberError:
    | ((
        error:
          EnterpriseRiskEventDispatchError,
      ) => void)
    | undefined;

  public constructor(
    options:
      EnterpriseRiskEventDispatcherOptions = {},
  ) {
    assertObject(options, "options");

    if (
      options.stopOnSubscriberError !== undefined &&
      typeof options.stopOnSubscriberError !==
        "boolean"
    ) {
      throw new EnterpriseRiskValidationError(
        "options.stopOnSubscriberError",
        "must be a boolean.",
      );
    }

    if (
      options.onSubscriberError !== undefined &&
      typeof options.onSubscriberError !==
        "function"
    ) {
      throw new EnterpriseRiskValidationError(
        "options.onSubscriberError",
        "must be a function.",
      );
    }

    this.stopOnSubscriberError =
      options.stopOnSubscriberError ?? false;

    this.onSubscriberError =
      options.onSubscriberError as
        | ((
            error:
              EnterpriseRiskEventDispatchError,
          ) => void)
        | undefined;
  }

  public subscribe(
    subscriber: EnterpriseRiskEventSubscriber,
  ): void {
    validateSubscriber(subscriber);

    const immutableSubscriber =
      Object.freeze({
        id: subscriber.id,
        ...(subscriber.eventTypes === undefined
          ? {}
          : {
              eventTypes: Object.freeze([
                ...subscriber.eventTypes,
              ]),
            }),
        handle: subscriber.handle,
      });

    this.subscribers.set(
      subscriber.id,
      immutableSubscriber,
    );
  }

  public unsubscribe(
    subscriberId: string,
  ): boolean {
    assertNonEmptyString(
      subscriberId,
      "subscriberId",
    );

    return this.subscribers.delete(
      subscriberId,
    );
  }

  public hasSubscriber(
    subscriberId: string,
  ): boolean {
    assertNonEmptyString(
      subscriberId,
      "subscriberId",
    );

    return this.subscribers.has(
      subscriberId,
    );
  }

  public getSubscriberIds():
    readonly string[] {
    return Object.freeze(
      [...this.subscribers.keys()].sort(
        (left, right) =>
          left.localeCompare(right),
      ),
    );
  }

  public clearSubscribers(): void {
    this.subscribers.clear();
  }

  public publish(
    event: EnterpriseRiskEvent,
  ): void {
    validateEvent(event);

    const immutableEvent =
      deepCloneAndFreeze(event);

    const orderedSubscribers =
      [...this.subscribers.values()].sort(
        (left, right) =>
          left.id.localeCompare(right.id),
      );

    for (
      const subscriber of orderedSubscribers
    ) {
      if (
        !shouldDeliver(
          subscriber,
          immutableEvent,
        )
      ) {
        continue;
      }

      try {
        subscriber.handle(
          deepCloneAndFreeze(
            immutableEvent,
          ),
        );
      } catch (error) {
        const dispatchError =
          deepCloneAndFreeze({
            subscriberId: subscriber.id,
            eventId:
              immutableEvent.eventId,
            eventType:
              immutableEvent.eventType,
            error,
          } satisfies EnterpriseRiskEventDispatchError);

        this.onSubscriberError?.(
          dispatchError,
        );

        if (
          this.stopOnSubscriberError
        ) {
          throw error;
        }
      }
    }
  }
}

export function createEnterpriseRiskEventDispatcher(
  options:
    EnterpriseRiskEventDispatcherOptions = {},
): DefaultEnterpriseRiskEventDispatcher {
  return new DefaultEnterpriseRiskEventDispatcher(
    options,
  );
}