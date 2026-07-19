/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk-event-dispatcher.test.ts
 *
 * Purpose:
 * Deterministic tests for enterprise-risk event dispatching.
 */

import {
  createEnterpriseRiskEventDispatcher,
  type EnterpriseRiskEvent,
  type EnterpriseRiskEventDispatchError,
  type EnterpriseRiskEventSubscriber,
  type EnterpriseRiskDispatcherEventType,
} from "./enterprise-risk";

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message} Expected ${String(expected)}, received ${String(actual)}.`,
    );
  }
}

function createEvent(
  eventId: string,
  eventType:
    EnterpriseRiskDispatcherEventType,
): EnterpriseRiskEvent {
  return {
    eventId,
    eventType,
    severity: "HIGH",
    message: `Risk event ${eventId}`,
    occurredAt: 1_000,
    portfolioId: "portfolio-a",
    metadata: {
      source: "dispatcher-test",
    },
  } as EnterpriseRiskEvent;
}

function testDeterministicDeliveryOrder(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  const deliveries: string[] = [];

  dispatcher.subscribe({
    id: "subscriber-c",
    handle: () => {
      deliveries.push("subscriber-c");
    },
  });

  dispatcher.subscribe({
    id: "subscriber-a",
    handle: () => {
      deliveries.push("subscriber-a");
    },
  });

  dispatcher.subscribe({
    id: "subscriber-b",
    handle: () => {
      deliveries.push("subscriber-b");
    },
  });

  dispatcher.publish(
    createEvent(
      "event-order",
      "LIMIT_BREACHED",
    ),
  );

  assertEqual(
    deliveries.join(","),
    [
      "subscriber-a",
      "subscriber-b",
      "subscriber-c",
    ].join(","),
    "Subscribers should receive events in stable ID order.",
  );
}

function testEventTypeFiltering(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  const deliveries: string[] = [];

  dispatcher.subscribe({
    id: "limit-only",
    eventTypes: [
      "LIMIT_BREACHED",
    ],
    handle: () => {
      deliveries.push("limit-only");
    },
  });

  dispatcher.subscribe({
    id: "all-events",
    handle: () => {
      deliveries.push("all-events");
    },
  });

  dispatcher.publish(
    createEvent(
      "event-filtered",
      "RISK_EVALUATED",
    ),
  );

  assertEqual(
    deliveries.join(","),
    "all-events",
    "Filtered subscribers should only receive matching event types.",
  );
}

function testEmptyEventFilterReceivesAllEvents(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  let deliveryCount = 0;

  dispatcher.subscribe({
    id: "empty-filter",
    eventTypes: [],
    handle: () => {
      deliveryCount += 1;
    },
  });

  dispatcher.publish(
    createEvent(
      "event-empty-filter",
      "RISK_EVALUATED",
    ),
  );

  assertEqual(
    deliveryCount,
    1,
    "An empty event-type filter should receive all events.",
  );
}

function testSubscriptionManagement(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  dispatcher.subscribe({
    id: "subscriber-b",
    handle: () => undefined,
  });

  dispatcher.subscribe({
    id: "subscriber-a",
    handle: () => undefined,
  });

  assertCondition(
    dispatcher.hasSubscriber(
      "subscriber-a",
    ),
    "The dispatcher should report an active subscriber.",
  );

  assertEqual(
    dispatcher
      .getSubscriberIds()
      .join(","),
    "subscriber-a,subscriber-b",
    "Subscriber IDs should be returned in stable sorted order.",
  );

  assertEqual(
    dispatcher.unsubscribe(
      "subscriber-a",
    ),
    true,
    "Unsubscribing an existing subscriber should return true.",
  );

  assertEqual(
    dispatcher.unsubscribe(
      "subscriber-a",
    ),
    false,
    "Unsubscribing a missing subscriber should return false.",
  );

  dispatcher.clearSubscribers();

  assertEqual(
    dispatcher.getSubscriberIds().length,
    0,
    "Clearing subscribers should remove all subscriptions.",
  );
}

function testDuplicateSubscriberReplacement(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  const deliveries: string[] = [];

  dispatcher.subscribe({
    id: "replaceable",
    handle: () => {
      deliveries.push("original");
    },
  });

  dispatcher.subscribe({
    id: "replaceable",
    handle: () => {
      deliveries.push("replacement");
    },
  });

  dispatcher.publish(
    createEvent(
      "event-replacement",
      "LIMIT_WARNING",
    ),
  );

  assertEqual(
    deliveries.join(","),
    "replacement",
    "A duplicate subscriber ID should replace the previous subscriber.",
  );
}

function testSubscriberErrorsAreIsolatedByDefault(): void {
  const dispatchErrors:
    EnterpriseRiskEventDispatchError[] =
    [];

  const dispatcher =
    createEnterpriseRiskEventDispatcher({
      onSubscriberError: (error) => {
        dispatchErrors.push(error);
      },
    });

  const deliveries: string[] = [];

  dispatcher.subscribe({
    id: "subscriber-a-failing",
    handle: () => {
      throw new Error(
        "Expected subscriber failure.",
      );
    },
  });

  dispatcher.subscribe({
    id: "subscriber-b-healthy",
    handle: () => {
      deliveries.push(
        "subscriber-b-healthy",
      );
    },
  });

  dispatcher.publish(
    createEvent(
      "event-error-isolation",
      "LIMIT_BREACHED",
    ),
  );

  assertEqual(
    deliveries.join(","),
    "subscriber-b-healthy",
    "A failing subscriber should not block later subscribers by default.",
  );

  assertEqual(
    dispatchErrors.length,
    1,
    "The error callback should receive one dispatch error.",
  );

  assertEqual(
    dispatchErrors[0]?.subscriberId,
    "subscriber-a-failing",
    "The dispatch error should identify the failing subscriber.",
  );

  assertEqual(
    dispatchErrors[0]?.eventId,
    "event-error-isolation",
    "The dispatch error should identify the event.",
  );
}

function testStopOnSubscriberError(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher({
      stopOnSubscriberError: true,
    });

  let laterSubscriberCalled = false;

  dispatcher.subscribe({
    id: "subscriber-a-failing",
    handle: () => {
      throw new Error(
        "Expected stop error.",
      );
    },
  });

  dispatcher.subscribe({
    id: "subscriber-b-later",
    handle: () => {
      laterSubscriberCalled = true;
    },
  });

  let thrown: unknown;

  try {
    dispatcher.publish(
      createEvent(
        "event-stop",
        "CIRCUIT_BREAKER_TRIGGERED",
      ),
    );
  } catch (error) {
    thrown = error;
  }

  assertCondition(
    thrown instanceof Error,
    "The dispatcher should rethrow when stopOnSubscriberError is enabled.",
  );

  assertEqual(
    laterSubscriberCalled,
    false,
    "Later subscribers should not run after a stop-on-error failure.",
  );
}

function testDeliveredEventIsImmutable(): void {
  const dispatcher =
    createEnterpriseRiskEventDispatcher();

  let deliveredEvent:
    EnterpriseRiskEvent | undefined;

  const subscriber:
    EnterpriseRiskEventSubscriber = {
    id: "immutability-check",
    handle: (event) => {
      deliveredEvent = event;
    },
  };

  dispatcher.subscribe(subscriber);

  const originalEvent =
    createEvent(
      "event-immutable",
      "RISK_EVALUATED",
    );

  dispatcher.publish(originalEvent);

  assertCondition(
    deliveredEvent !== undefined,
    "The subscriber should receive the event.",
  );

  assertCondition(
    Object.isFrozen(deliveredEvent),
    "The delivered event should be frozen.",
  );

  assertCondition(
    deliveredEvent.metadata === undefined ||
      Object.isFrozen(
        deliveredEvent.metadata,
      ),
    "Nested event metadata should be frozen.",
  );

  assertCondition(
    deliveredEvent !== originalEvent,
    "The dispatcher should deliver a cloned event.",
  );
}

function run(): void {
  testDeterministicDeliveryOrder();
  testEventTypeFiltering();
  testEmptyEventFilterReceivesAllEvents();
  testSubscriptionManagement();
  testDuplicateSubscriberReplacement();
  testSubscriberErrorsAreIsolatedByDefault();
  testStopOnSubscriberError();
  testDeliveredEventIsImmutable();

  console.log(
    "All enterprise-risk event dispatcher tests passed successfully.",
  );
}

run();