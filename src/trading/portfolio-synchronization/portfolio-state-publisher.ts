/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 13: Portfolio State Publisher
 *
 * Provides deterministic immutable portfolio-state publication with:
 *
 * - monotonic version validation
 * - duplicate-publication protection
 * - publication history
 * - portfolio-specific and global subscribers
 * - deterministic subscriber delivery order
 * - configurable history retention
 * - immutable publication results
 */

import type {
  LivePortfolio,
  LivePortfolioMetadata,
} from "./live-portfolio";

export type PortfolioStatePublicationStatus =
  | "PUBLISHED"
  | "DUPLICATE_REJECTED"
  | "STALE_VERSION_REJECTED"
  | "STALE_TIMESTAMP_REJECTED"
  | "SUBSCRIBER_DELIVERY_FAILED";

export type PortfolioStatePublicationIssueSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type PortfolioStatePublicationIssueCode =
  | "DUPLICATE_PUBLICATION"
  | "STALE_PORTFOLIO_VERSION"
  | "STALE_PORTFOLIO_TIMESTAMP"
  | "SUBSCRIBER_FAILURE"
  | "INVALID_PUBLICATION"
  | "HISTORY_LIMIT_REACHED";

export interface PortfolioStatePublicationPolicy {
  readonly rejectDuplicatePublicationIds: boolean;
  readonly requireVersionIncrease: boolean;
  readonly requireUpdatedAtIncrease: boolean;

  readonly stopOnSubscriberFailure: boolean;
  readonly retainFailedPublications: boolean;

  readonly maximumHistoryEntries: number;
}

export interface PortfolioStatePublicationRequest {
  readonly publicationId: string;
  readonly portfolio: LivePortfolio;

  readonly publishedAt: number;
  readonly sequence: number;

  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioStatePublicationIssue {
  readonly issueId: string;

  readonly code: PortfolioStatePublicationIssueCode;
  readonly severity: PortfolioStatePublicationIssueSeverity;

  readonly message: string;

  readonly subscriberId: string | null;

  readonly causeName: string | null;
  readonly causeMessage: string | null;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioStatePublicationRecord {
  readonly publicationId: string;

  readonly portfolioId: string;
  readonly portfolioVersion: number;

  readonly portfolio: LivePortfolio;

  readonly publishedAt: number;
  readonly sequence: number;

  readonly status: PortfolioStatePublicationStatus;

  readonly subscriberCount: number;
  readonly successfulDeliveryCount: number;
  readonly failedDeliveryCount: number;

  readonly issues: readonly PortfolioStatePublicationIssue[];

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioStatePublicationResult {
  readonly accepted: boolean;
  readonly status: PortfolioStatePublicationStatus;

  readonly record: PortfolioStatePublicationRecord;

  readonly latestPortfolio: LivePortfolio | null;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioStateSubscriberContext {
  readonly publicationId: string;

  readonly portfolioId: string;
  readonly portfolioVersion: number;

  readonly publishedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export type PortfolioStateSubscriber = (
  portfolio: LivePortfolio,
  context: PortfolioStateSubscriberContext,
) => void;

export interface PortfolioStateSubscription {
  readonly subscriberId: string;
  readonly portfolioId: string | null;

  unsubscribe(): boolean;
}

export interface PortfolioStatePublisher {
  publish(
    request: PortfolioStatePublicationRequest,
  ): PortfolioStatePublicationResult;

  subscribe(
    subscriberId: string,
    subscriber: PortfolioStateSubscriber,
    portfolioId?: string,
  ): PortfolioStateSubscription;

  unsubscribe(
    subscriberId: string,
  ): boolean;

  getLatest(
    portfolioId: string,
  ): LivePortfolio | null;

  getPublication(
    publicationId: string,
  ): PortfolioStatePublicationRecord | null;

  getHistory(
    portfolioId?: string,
  ): readonly PortfolioStatePublicationRecord[];

  clear(): void;
}

interface RegisteredSubscriber {
  readonly subscriberId: string;
  readonly portfolioId: string | null;
  readonly subscriber: PortfolioStateSubscriber;
  readonly registrationOrder: number;
}

function assertObject(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  if (
    value === null ||
    value === undefined ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${field} must be an object.`);
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
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertNonNegativeFiniteNumber(
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

function assertBoolean(
  value: boolean,
  field: string,
): void {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean.`);
  }
}

function normalizeIdentifier(
  value: string,
  field: string,
): string {
  assertNonEmptyString(
    value,
    field,
  );

  return value.trim();
}

function freezeMetadata(
  metadata: LivePortfolioMetadata | undefined,
): LivePortfolioMetadata {
  if (metadata === undefined) {
    return Object.freeze({});
  }

  const result: Record<
    string,
    string | number | boolean | null
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    assertNonEmptyString(
      key,
      "metadata key",
    );

    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        `metadata.${key} contains an unsupported value.`,
      );
    }

    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `metadata.${key} must be finite.`,
      );
    }

    result[key] = value;
  }

  return Object.freeze(result);
}

function mergeMetadata(
  ...sources: readonly (
    | LivePortfolioMetadata
    | undefined
  )[]
): LivePortfolioMetadata {
  const result: Record<
    string,
    string | number | boolean | null
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      result[key] = value;
    }
  }

  return freezeMetadata(
    result,
  );
}

function validatePortfolio(
  portfolio: LivePortfolio,
  field: string,
): void {
  assertObject(
    portfolio,
    field,
  );

  assertObject(
    portfolio.identity,
    `${field}.identity`,
  );

  normalizeIdentifier(
    portfolio.identity.portfolioId,
    `${field}.identity.portfolioId`,
  );

  assertPositiveInteger(
    portfolio.version,
    `${field}.version`,
  );

  assertNonNegativeFiniteNumber(
    portfolio.createdAt,
    `${field}.createdAt`,
  );

  assertNonNegativeFiniteNumber(
    portfolio.updatedAt,
    `${field}.updatedAt`,
  );

  if (
    portfolio.updatedAt <
    portfolio.createdAt
  ) {
    throw new Error(
      `${field}.updatedAt cannot be earlier than createdAt.`,
    );
  }
}

function resolvePolicy(
  policy: PortfolioStatePublicationPolicy,
): PortfolioStatePublicationPolicy {
  assertObject(
    policy,
    "policy",
  );

  assertBoolean(
    policy.rejectDuplicatePublicationIds,
    "policy.rejectDuplicatePublicationIds",
  );

  assertBoolean(
    policy.requireVersionIncrease,
    "policy.requireVersionIncrease",
  );

  assertBoolean(
    policy.requireUpdatedAtIncrease,
    "policy.requireUpdatedAtIncrease",
  );

  assertBoolean(
    policy.stopOnSubscriberFailure,
    "policy.stopOnSubscriberFailure",
  );

  assertBoolean(
    policy.retainFailedPublications,
    "policy.retainFailedPublications",
  );

  assertPositiveInteger(
    policy.maximumHistoryEntries,
    "policy.maximumHistoryEntries",
  );

  return Object.freeze({
    rejectDuplicatePublicationIds:
      policy.rejectDuplicatePublicationIds,

    requireVersionIncrease:
      policy.requireVersionIncrease,

    requireUpdatedAtIncrease:
      policy.requireUpdatedAtIncrease,

    stopOnSubscriberFailure:
      policy.stopOnSubscriberFailure,

    retainFailedPublications:
      policy.retainFailedPublications,

    maximumHistoryEntries:
      policy.maximumHistoryEntries,
  });
}

function createIssueId(
  publicationId: string,
  index: number,
): string {
  return `${publicationId}:issue:${String(
    index + 1,
  ).padStart(6, "0")}`;
}

function createIssue(
  publicationId: string,
  index: number,
  input: {
    readonly code: PortfolioStatePublicationIssueCode;
    readonly severity: PortfolioStatePublicationIssueSeverity;
    readonly message: string;

    readonly subscriberId?: string | null;
    readonly cause?: unknown;

    readonly metadata?: LivePortfolioMetadata;
  },
): PortfolioStatePublicationIssue {
  let causeName: string | null = null;
  let causeMessage: string | null = null;

  if (input.cause instanceof Error) {
    causeName =
      input.cause.name;

    causeMessage =
      input.cause.message;
  } else if (input.cause !== undefined) {
    causeName =
      "UnknownError";

    causeMessage =
      String(input.cause);
  }

  return Object.freeze({
    issueId:
      createIssueId(
        publicationId,
        index,
      ),

    code:
      input.code,

    severity:
      input.severity,

    message:
      input.message,

    subscriberId:
      input.subscriberId ??
      null,

    causeName,
    causeMessage,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

function freezeRecord(
  record: PortfolioStatePublicationRecord,
): PortfolioStatePublicationRecord {
  return Object.freeze({
    publicationId:
      record.publicationId,

    portfolioId:
      record.portfolioId,

    portfolioVersion:
      record.portfolioVersion,

    portfolio:
      record.portfolio,

    publishedAt:
      record.publishedAt,

    sequence:
      record.sequence,

    status:
      record.status,

    subscriberCount:
      record.subscriberCount,

    successfulDeliveryCount:
      record.successfulDeliveryCount,

    failedDeliveryCount:
      record.failedDeliveryCount,

    issues:
      Object.freeze([
        ...record.issues,
      ]),

    metadata:
      freezeMetadata(
        record.metadata,
      ),
  });
}

export class DeterministicPortfolioStatePublisher
implements PortfolioStatePublisher {
  private readonly policy:
    PortfolioStatePublicationPolicy;

  private readonly latestByPortfolioId =
    new Map<string, LivePortfolio>();

  private readonly publicationById =
    new Map<
      string,
      PortfolioStatePublicationRecord
    >();

  private readonly history:
    PortfolioStatePublicationRecord[] = [];

  private readonly subscribers =
    new Map<
      string,
      RegisteredSubscriber
    >();

  private subscriberRegistrationSequence = 0;

  public constructor(
    policy: PortfolioStatePublicationPolicy =
      createDefaultPortfolioStatePublicationPolicy(),
  ) {
    this.policy =
      resolvePolicy(
        policy,
      );
  }

  public publish(
    request: PortfolioStatePublicationRequest,
  ): PortfolioStatePublicationResult {
    assertObject(
      request,
      "request",
    );

    const publicationId =
      normalizeIdentifier(
        request.publicationId,
        "request.publicationId",
      );

    validatePortfolio(
      request.portfolio,
      "request.portfolio",
    );

    assertNonNegativeFiniteNumber(
      request.publishedAt,
      "request.publishedAt",
    );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolio.identity.portfolioId,
        "request.portfolio.identity.portfolioId",
      );

    const existingPublication =
      this.publicationById.get(
        publicationId,
      );

    if (
      existingPublication !== undefined &&
      this.policy.rejectDuplicatePublicationIds
    ) {
      const issue =
        createIssue(
          publicationId,
          0,
          {
            code:
              "DUPLICATE_PUBLICATION",

            severity:
              "ERROR",

            message:
              `Publication "${publicationId}" already exists.`,
          },
        );

      const record =
        freezeRecord({
          publicationId,

          portfolioId,
          portfolioVersion:
            request.portfolio.version,

          portfolio:
            request.portfolio,

          publishedAt:
            request.publishedAt,

          sequence:
            request.sequence,

          status:
            "DUPLICATE_REJECTED",

          subscriberCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,

          issues:
            Object.freeze([
              issue,
            ]),

          metadata:
            mergeMetadata(
              request.metadata,
              {
                duplicatePublication:
                  true,
              },
            ),
        });

      return Object.freeze({
        accepted: false,

        status:
          record.status,

        record,

        latestPortfolio:
          this.latestByPortfolioId.get(
            portfolioId,
          ) ??
          null,

        metadata:
          freezeMetadata({
            publicationId,
            portfolioId,
            accepted: false,
          }),
      });
    }

    const latestPortfolio =
      this.latestByPortfolioId.get(
        portfolioId,
      );

    if (
      latestPortfolio !== undefined &&
      this.policy.requireVersionIncrease &&
      request.portfolio.version <=
        latestPortfolio.version
    ) {
      const issue =
        createIssue(
          publicationId,
          0,
          {
            code:
              "STALE_PORTFOLIO_VERSION",

            severity:
              "ERROR",

            message:
              "Published portfolio version must be greater than the latest stored version.",

            metadata: {
              latestVersion:
                latestPortfolio.version,

              receivedVersion:
                request.portfolio.version,
            },
          },
        );

      const record =
        freezeRecord({
          publicationId,

          portfolioId,
          portfolioVersion:
            request.portfolio.version,

          portfolio:
            request.portfolio,

          publishedAt:
            request.publishedAt,

          sequence:
            request.sequence,

          status:
            "STALE_VERSION_REJECTED",

          subscriberCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,

          issues:
            Object.freeze([
              issue,
            ]),

          metadata:
            mergeMetadata(
              request.metadata,
              {
                latestVersion:
                  latestPortfolio.version,

                receivedVersion:
                  request.portfolio.version,
              },
            ),
        });

      this.retainFailedRecord(
        record,
      );

      return Object.freeze({
        accepted: false,

        status:
          record.status,

        record,

        latestPortfolio,

        metadata:
          freezeMetadata({
            publicationId,
            portfolioId,
            accepted: false,
          }),
      });
    }

    if (
      latestPortfolio !== undefined &&
      !this.policy.requireVersionIncrease &&
      request.portfolio.version <
        latestPortfolio.version
    ) {
      const issue =
        createIssue(
          publicationId,
          0,
          {
            code:
              "STALE_PORTFOLIO_VERSION",

            severity:
              "ERROR",

            message:
              "Published portfolio version cannot be lower than the latest stored version.",

            metadata: {
              latestVersion:
                latestPortfolio.version,

              receivedVersion:
                request.portfolio.version,
            },
          },
        );

      const record =
        freezeRecord({
          publicationId,

          portfolioId,
          portfolioVersion:
            request.portfolio.version,

          portfolio:
            request.portfolio,

          publishedAt:
            request.publishedAt,

          sequence:
            request.sequence,

          status:
            "STALE_VERSION_REJECTED",

          subscriberCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,

          issues:
            Object.freeze([
              issue,
            ]),

          metadata:
            freezeMetadata(
              request.metadata,
            ),
        });

      this.retainFailedRecord(
        record,
      );

      return Object.freeze({
        accepted: false,

        status:
          record.status,

        record,

        latestPortfolio,

        metadata:
          freezeMetadata({
            publicationId,
            portfolioId,
            accepted: false,
          }),
      });
    }

    if (
      latestPortfolio !== undefined &&
      this.policy.requireUpdatedAtIncrease &&
      request.portfolio.updatedAt <=
        latestPortfolio.updatedAt
    ) {
      const issue =
        createIssue(
          publicationId,
          0,
          {
            code:
              "STALE_PORTFOLIO_TIMESTAMP",

            severity:
              "ERROR",

            message:
              "Published portfolio updatedAt must be greater than the latest stored timestamp.",

            metadata: {
              latestUpdatedAt:
                latestPortfolio.updatedAt,

              receivedUpdatedAt:
                request.portfolio.updatedAt,
            },
          },
        );

      const record =
        freezeRecord({
          publicationId,

          portfolioId,
          portfolioVersion:
            request.portfolio.version,

          portfolio:
            request.portfolio,

          publishedAt:
            request.publishedAt,

          sequence:
            request.sequence,

          status:
            "STALE_TIMESTAMP_REJECTED",

          subscriberCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,

          issues:
            Object.freeze([
              issue,
            ]),

          metadata:
            freezeMetadata(
              request.metadata,
            ),
        });

      this.retainFailedRecord(
        record,
      );

      return Object.freeze({
        accepted: false,

        status:
          record.status,

        record,

        latestPortfolio,

        metadata:
          freezeMetadata({
            publicationId,
            portfolioId,
            accepted: false,
          }),
      });
    }

    if (
      latestPortfolio !== undefined &&
      !this.policy.requireUpdatedAtIncrease &&
      request.portfolio.updatedAt <
        latestPortfolio.updatedAt
    ) {
      const issue =
        createIssue(
          publicationId,
          0,
          {
            code:
              "STALE_PORTFOLIO_TIMESTAMP",

            severity:
              "ERROR",

            message:
              "Published portfolio updatedAt cannot be earlier than the latest stored timestamp.",

            metadata: {
              latestUpdatedAt:
                latestPortfolio.updatedAt,

              receivedUpdatedAt:
                request.portfolio.updatedAt,
            },
          },
        );

      const record =
        freezeRecord({
          publicationId,

          portfolioId,
          portfolioVersion:
            request.portfolio.version,

          portfolio:
            request.portfolio,

          publishedAt:
            request.publishedAt,

          sequence:
            request.sequence,

          status:
            "STALE_TIMESTAMP_REJECTED",

          subscriberCount: 0,
          successfulDeliveryCount: 0,
          failedDeliveryCount: 0,

          issues:
            Object.freeze([
              issue,
            ]),

          metadata:
            freezeMetadata(
              request.metadata,
            ),
        });

      this.retainFailedRecord(
        record,
      );

      return Object.freeze({
        accepted: false,

        status:
          record.status,

        record,

        latestPortfolio,

        metadata:
          freezeMetadata({
            publicationId,
            portfolioId,
            accepted: false,
          }),
      });
    }

    const matchingSubscribers =
      Array.from(
        this.subscribers.values(),
      )
        .filter(
          subscriber =>
            subscriber.portfolioId === null ||
            subscriber.portfolioId ===
              portfolioId,
        )
        .sort(
          (left, right) =>
            left.registrationOrder -
            right.registrationOrder,
        );

    const issues:
      PortfolioStatePublicationIssue[] = [];

    let successfulDeliveryCount = 0;
    let failedDeliveryCount = 0;

    const subscriberContext:
      PortfolioStateSubscriberContext =
      Object.freeze({
        publicationId,

        portfolioId,
        portfolioVersion:
          request.portfolio.version,

        publishedAt:
          request.publishedAt,

        sequence:
          request.sequence,

        metadata:
          freezeMetadata(
            request.metadata,
          ),
      });

    for (const subscriber of matchingSubscribers) {
      try {
        subscriber.subscriber(
          request.portfolio,
          subscriberContext,
        );

        successfulDeliveryCount += 1;
      } catch (cause) {
        failedDeliveryCount += 1;

        issues.push(
          createIssue(
            publicationId,
            issues.length,
            {
              code:
                "SUBSCRIBER_FAILURE",

              severity:
                "ERROR",

              message:
                `Subscriber "${subscriber.subscriberId}" failed while processing portfolio publication.`,

              subscriberId:
                subscriber.subscriberId,

              cause,

              metadata: {
                portfolioId,
                portfolioVersion:
                  request.portfolio.version,
              },
            },
          ),
        );

        if (
          this.policy.stopOnSubscriberFailure
        ) {
          break;
        }
      }
    }

    const status:
      PortfolioStatePublicationStatus =
      failedDeliveryCount > 0
        ? "SUBSCRIBER_DELIVERY_FAILED"
        : "PUBLISHED";

    const record =
      freezeRecord({
        publicationId,

        portfolioId,
        portfolioVersion:
          request.portfolio.version,

        portfolio:
          request.portfolio,

        publishedAt:
          request.publishedAt,

        sequence:
          request.sequence,

        status,

        subscriberCount:
          matchingSubscribers.length,

        successfulDeliveryCount,
        failedDeliveryCount,

        issues:
          Object.freeze([
            ...issues,
          ]),

        metadata:
          mergeMetadata(
            request.metadata,
            {
              subscriberCount:
                matchingSubscribers.length,

              successfulDeliveryCount,
              failedDeliveryCount,

              portfolioVersion:
                request.portfolio.version,
            },
          ),
      });

    this.latestByPortfolioId.set(
      portfolioId,
      request.portfolio,
    );

    this.publicationById.set(
      publicationId,
      record,
    );

    this.history.push(
      record,
    );

    this.trimHistory();

    return Object.freeze({
      accepted: true,

      status,

      record,

      latestPortfolio:
        request.portfolio,

      metadata:
        freezeMetadata({
          publicationId,
          portfolioId,

          accepted: true,

          portfolioVersion:
            request.portfolio.version,

          subscriberCount:
            matchingSubscribers.length,

          failedDeliveryCount,
        }),
    });
  }

  public subscribe(
    subscriberId: string,
    subscriber: PortfolioStateSubscriber,
    portfolioId?: string,
  ): PortfolioStateSubscription {
    const normalizedSubscriberId =
      normalizeIdentifier(
        subscriberId,
        "subscriberId",
      );

    if (typeof subscriber !== "function") {
      throw new Error(
        "subscriber must be a function.",
      );
    }

    if (
      this.subscribers.has(
        normalizedSubscriberId,
      )
    ) {
      throw new Error(
        `Subscriber "${normalizedSubscriberId}" is already registered.`,
      );
    }

    const normalizedPortfolioId =
      portfolioId === undefined
        ? null
        : normalizeIdentifier(
            portfolioId,
            "portfolioId",
          );

    this.subscriberRegistrationSequence += 1;

    this.subscribers.set(
      normalizedSubscriberId,
      Object.freeze({
        subscriberId:
          normalizedSubscriberId,

        portfolioId:
          normalizedPortfolioId,

        subscriber,

        registrationOrder:
          this.subscriberRegistrationSequence,
      }),
    );

    let active = true;

    return Object.freeze({
      subscriberId:
        normalizedSubscriberId,

      portfolioId:
        normalizedPortfolioId,

      unsubscribe: (): boolean => {
        if (!active) {
          return false;
        }

        active = false;

        return this.unsubscribe(
          normalizedSubscriberId,
        );
      },
    });
  }

  public unsubscribe(
    subscriberId: string,
  ): boolean {
    const normalizedSubscriberId =
      normalizeIdentifier(
        subscriberId,
        "subscriberId",
      );

    return this.subscribers.delete(
      normalizedSubscriberId,
    );
  }

  public getLatest(
    portfolioId: string,
  ): LivePortfolio | null {
    const normalizedPortfolioId =
      normalizeIdentifier(
        portfolioId,
        "portfolioId",
      );

    return (
      this.latestByPortfolioId.get(
        normalizedPortfolioId,
      ) ??
      null
    );
  }

  public getPublication(
    publicationId: string,
  ): PortfolioStatePublicationRecord | null {
    const normalizedPublicationId =
      normalizeIdentifier(
        publicationId,
        "publicationId",
      );

    return (
      this.publicationById.get(
        normalizedPublicationId,
      ) ??
      null
    );
  }

  public getHistory(
    portfolioId?: string,
  ): readonly PortfolioStatePublicationRecord[] {
    if (portfolioId === undefined) {
      return Object.freeze([
        ...this.history,
      ]);
    }

    const normalizedPortfolioId =
      normalizeIdentifier(
        portfolioId,
        "portfolioId",
      );

    return Object.freeze(
      this.history.filter(
        record =>
          record.portfolioId ===
          normalizedPortfolioId,
      ),
    );
  }

  public clear(): void {
    this.latestByPortfolioId.clear();
    this.publicationById.clear();
    this.history.length = 0;
    this.subscribers.clear();

    this.subscriberRegistrationSequence = 0;
  }

  private retainFailedRecord(
    record: PortfolioStatePublicationRecord,
  ): void {
    if (!this.policy.retainFailedPublications) {
      return;
    }

    if (
      !this.publicationById.has(
        record.publicationId,
      )
    ) {
      this.publicationById.set(
        record.publicationId,
        record,
      );
    }

    this.history.push(
      record,
    );

    this.trimHistory();
  }

  private trimHistory(): void {
    const excess =
      this.history.length -
      this.policy.maximumHistoryEntries;

    if (excess <= 0) {
      return;
    }

    const removedRecords =
      this.history.splice(
        0,
        excess,
      );

    for (const removedRecord of removedRecords) {
      const indexedRecord =
        this.publicationById.get(
          removedRecord.publicationId,
        );

      if (indexedRecord === removedRecord) {
        this.publicationById.delete(
          removedRecord.publicationId,
        );
      }
    }
  }
}

export function createPortfolioStatePublisher(
  policy: PortfolioStatePublicationPolicy =
    createDefaultPortfolioStatePublicationPolicy(),
): DeterministicPortfolioStatePublisher {
  return new DeterministicPortfolioStatePublisher(
    policy,
  );
}

export function createDefaultPortfolioStatePublicationPolicy():
PortfolioStatePublicationPolicy {
  return Object.freeze({
    rejectDuplicatePublicationIds: true,

    requireVersionIncrease: true,
    requireUpdatedAtIncrease: false,

    stopOnSubscriberFailure: false,
    retainFailedPublications: true,

    maximumHistoryEntries: 1_000,
  });
}

export function isSuccessfulPortfolioStatePublication(
  result: PortfolioStatePublicationResult,
): boolean {
  assertObject(
    result,
    "result",
  );

  return (
    result.accepted &&
    result.status === "PUBLISHED"
  );
}

export function hasPortfolioStateSubscriberFailures(
  result: PortfolioStatePublicationResult,
): boolean {
  assertObject(
    result,
    "result",
  );

  return (
    result.record.failedDeliveryCount >
    0
  );
}

export function findPortfolioStatePublicationIssue(
  record: PortfolioStatePublicationRecord,
  issueId: string,
): PortfolioStatePublicationIssue | null {
  assertObject(
    record,
    "record",
  );

  const normalizedIssueId =
    normalizeIdentifier(
      issueId,
      "issueId",
    );

  return (
    record.issues.find(
      issue =>
        issue.issueId ===
        normalizedIssueId,
    ) ??
    null
  );
}