/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-audit-subscriber.ts
 *
 * Purpose:
 * Adapter that connects the enterprise-risk event dispatcher to the
 * enterprise-risk audit log. Every subscribed event is recorded
 * automatically with deterministic filtering and immutable delivery.
 */

import {
  EnterpriseRiskEvent,
} from "./enterprise-risk-contracts";
import {
  EnterpriseRiskAuditLog,
} from "./enterprise-risk-audit-log";
import {
  EnterpriseRiskEventSubscriber,
  EnterpriseRiskEventType,
} from "./enterprise-risk-event-dispatcher";
import {
  EnterpriseRiskValidationError,
} from "./enterprise-risk-validator";

export interface EnterpriseRiskAuditSubscriberOptions {
  readonly subscriberId?: string;
  readonly eventTypes?:
    readonly EnterpriseRiskEventType[];
}

export interface EnterpriseRiskAuditSubscriber
  extends EnterpriseRiskEventSubscriber {
  readonly id: string;
  readonly eventTypes?:
    readonly EnterpriseRiskEventType[];

  handle(event: EnterpriseRiskEvent): void;
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

function validateAuditLog(
  auditLog: EnterpriseRiskAuditLog,
): void {
  assertObject(auditLog, "auditLog");

  if (
    typeof auditLog.appendEvent !==
    "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "auditLog.appendEvent",
      "must be a function.",
    );
  }
}

function validateEventTypes(
  eventTypes:
    readonly EnterpriseRiskEventType[]
    | undefined,
): void {
  if (eventTypes === undefined) {
    return;
  }

  if (!Array.isArray(eventTypes)) {
    throw new EnterpriseRiskValidationError(
      "options.eventTypes",
      "must be an array.",
    );
  }

  for (
    let index = 0;
    index < eventTypes.length;
    index += 1
  ) {
    assertNonEmptyString(
      eventTypes[index],
      `options.eventTypes[${index}]`,
    );
  }
}

export class DefaultEnterpriseRiskAuditSubscriber
  implements EnterpriseRiskAuditSubscriber
{
  public readonly id: string;

  public readonly eventTypes:
    | readonly EnterpriseRiskEventType[]
    | undefined;

  private readonly auditLog:
    EnterpriseRiskAuditLog;

  public constructor(
    auditLog: EnterpriseRiskAuditLog,
    options:
      EnterpriseRiskAuditSubscriberOptions = {},
  ) {
    validateAuditLog(auditLog);
    assertObject(options, "options");

    const subscriberId =
      options.subscriberId ??
      "enterprise-risk-audit-log";

    assertNonEmptyString(
      subscriberId,
      "options.subscriberId",
    );

    const eventTypes =
      options.eventTypes as
        | readonly EnterpriseRiskEventType[]
        | undefined;

    validateEventTypes(eventTypes);

    this.auditLog = auditLog;
    this.id = subscriberId;
    this.eventTypes =
      eventTypes === undefined
        ? undefined
        : Object.freeze(
            [...eventTypes],
          );
  }

  /**
   * Arrow-function property deliberately preserves the subscriber instance
   * binding when the dispatcher stores and invokes this callback separately.
   */
  public readonly handle = (
    event: EnterpriseRiskEvent,
  ): void => {
    assertObject(event, "event");

    this.auditLog.appendEvent(event);
  };
}

export function createEnterpriseRiskAuditSubscriber(
  auditLog: EnterpriseRiskAuditLog,
  options:
    EnterpriseRiskAuditSubscriberOptions = {},
): DefaultEnterpriseRiskAuditSubscriber {
  return new DefaultEnterpriseRiskAuditSubscriber(
    auditLog,
    options,
  );
}