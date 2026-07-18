/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 14: Portfolio Synchronization Service
 *
 * Provides the public runtime boundary for:
 *
 * - executing deterministic portfolio synchronization
 * - publishing completed portfolio state
 * - querying the latest synchronized portfolio
 * - querying synchronization and publication history
 * - subscribing to published portfolio updates
 * - deterministic duplicate-run protection
 */

import type {
  LivePortfolio,
  LivePortfolioMetadata,
} from "./live-portfolio";

import type {
  PortfolioStatePublicationRecord,
  PortfolioStatePublisher,
  PortfolioStateSubscriber,
  PortfolioStateSubscription,
} from "./portfolio-state-publisher";

import {
  DeterministicPortfolioStatePublisher,
  createDefaultPortfolioStatePublicationPolicy,
} from "./portfolio-state-publisher";

import type {
  PortfolioSynchronizationDependencies,
  PortfolioSynchronizationOrchestrator,
  PortfolioSynchronizationPolicy,
  PortfolioSynchronizationRequest,
  PortfolioSynchronizationResult,
  PortfolioSynchronizationRunStatus,
} from "./portfolio-synchronization-orchestrator";

import {
  DeterministicPortfolioSynchronizationOrchestrator,
  createDefaultPortfolioSynchronizationPolicy,
} from "./portfolio-synchronization-orchestrator";

export type PortfolioSynchronizationServiceStatus =
  | "SYNCHRONIZED"
  | "SYNCHRONIZED_WITH_WARNINGS"
  | "FAILED"
  | "DUPLICATE_RUN_REJECTED"
  | "PUBLICATION_REJECTED";

export type PortfolioSynchronizationServiceIssueCode =
  | "DUPLICATE_RUN"
  | "SYNCHRONIZATION_FAILED"
  | "MISSING_SYNCHRONIZED_PORTFOLIO"
  | "MISSING_PUBLICATION"
  | "PUBLICATION_REJECTED"
  | "INVALID_REQUEST"
  | "UNEXPECTED_ERROR";

export type PortfolioSynchronizationServiceIssueSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export interface PortfolioSynchronizationServicePolicy {
  readonly rejectDuplicateRunIds: boolean;
  readonly retainFailedRuns: boolean;
  readonly maximumRunHistoryEntries: number;
}

export interface PortfolioSynchronizationServiceIssue {
  readonly issueId: string;

  readonly code: PortfolioSynchronizationServiceIssueCode;
  readonly severity: PortfolioSynchronizationServiceIssueSeverity;

  readonly message: string;

  readonly causeName: string | null;
  readonly causeMessage: string | null;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationServiceRequest
extends PortfolioSynchronizationRequest {
  readonly publish?: boolean;
}

export interface PortfolioSynchronizationServiceResult {
  readonly runId: string;
  readonly sequence: number;

  readonly accepted: boolean;
  readonly status: PortfolioSynchronizationServiceStatus;

  readonly synchronization: PortfolioSynchronizationResult | null;
  readonly publication: PortfolioStatePublicationRecord | null;

  readonly latestPortfolio: LivePortfolio | null;

  readonly issues: readonly PortfolioSynchronizationServiceIssue[];

  readonly startedAt: number;
  readonly completedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationService {
  synchronize(
    request: PortfolioSynchronizationServiceRequest,
  ): PortfolioSynchronizationServiceResult;

  getLatestPortfolio(
    portfolioId: string,
  ): LivePortfolio | null;

  getRun(
    runId: string,
  ): PortfolioSynchronizationServiceResult | null;

  getRunHistory(
    portfolioId?: string,
  ): readonly PortfolioSynchronizationServiceResult[];

  getPublicationHistory(
    portfolioId?: string,
  ): readonly PortfolioStatePublicationRecord[];

  subscribe(
    subscriberId: string,
    subscriber: PortfolioStateSubscriber,
    portfolioId?: string,
  ): PortfolioStateSubscription;

  unsubscribe(
    subscriberId: string,
  ): boolean;

  clear(): void;
}

export interface PortfolioSynchronizationServiceDependencies {
  readonly orchestrator: PortfolioSynchronizationOrchestrator;
  readonly publisher: PortfolioStatePublisher;
}

export interface PortfolioSynchronizationServiceFactoryOptions {
  readonly synchronizationDependencies:
    PortfolioSynchronizationDependencies;

  readonly synchronizationPolicy?:
    PortfolioSynchronizationPolicy;

  readonly publicationPolicy?: Parameters<
    typeof createDefaultPortfolioStatePublicationPolicy
  > extends readonly unknown[]
    ? ReturnType<
        typeof createDefaultPortfolioStatePublicationPolicy
      >
    : never;

  readonly servicePolicy?:
    PortfolioSynchronizationServicePolicy;
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
    throw new Error(
      `${field} must be a non-empty string.`,
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

function assertBoolean(
  value: boolean,
  field: string,
): void {
  if (typeof value !== "boolean") {
    throw new Error(
      `${field} must be a boolean.`,
    );
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
  const merged: Record<
    string,
    string | number | boolean | null
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }

  return freezeMetadata(
    merged,
  );
}

function resolvePolicy(
  policy: PortfolioSynchronizationServicePolicy,
): PortfolioSynchronizationServicePolicy {
  assertObject(
    policy,
    "policy",
  );

  assertBoolean(
    policy.rejectDuplicateRunIds,
    "policy.rejectDuplicateRunIds",
  );

  assertBoolean(
    policy.retainFailedRuns,
    "policy.retainFailedRuns",
  );

  assertPositiveInteger(
    policy.maximumRunHistoryEntries,
    "policy.maximumRunHistoryEntries",
  );

  return Object.freeze({
    rejectDuplicateRunIds:
      policy.rejectDuplicateRunIds,

    retainFailedRuns:
      policy.retainFailedRuns,

    maximumRunHistoryEntries:
      policy.maximumRunHistoryEntries,
  });
}

function validateDependencies(
  dependencies: PortfolioSynchronizationServiceDependencies,
): void {
  assertObject(
    dependencies,
    "dependencies",
  );

  assertObject(
    dependencies.orchestrator,
    "dependencies.orchestrator",
  );

  if (
    typeof dependencies.orchestrator.synchronize !==
    "function"
  ) {
    throw new Error(
      "dependencies.orchestrator.synchronize must be a function.",
    );
  }

  assertObject(
    dependencies.publisher,
    "dependencies.publisher",
  );

  const publisherMethods: readonly (
    keyof PortfolioStatePublisher
  )[] = [
    "publish",
    "subscribe",
    "unsubscribe",
    "getLatest",
    "getPublication",
    "getHistory",
    "clear",
  ];

  for (const method of publisherMethods) {
    if (
      typeof dependencies.publisher[method] !==
      "function"
    ) {
      throw new Error(
        `dependencies.publisher.${method} must be a function.`,
      );
    }
  }
}

function createIssueId(
  runId: string,
  index: number,
): string {
  return `${runId}:service-issue:${String(
    index + 1,
  ).padStart(6, "0")}`;
}

function createIssue(
  runId: string,
  index: number,
  input: {
    readonly code:
      PortfolioSynchronizationServiceIssueCode;

    readonly severity:
      PortfolioSynchronizationServiceIssueSeverity;

    readonly message: string;

    readonly cause?: unknown;
    readonly metadata?: LivePortfolioMetadata;
  },
): PortfolioSynchronizationServiceIssue {
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
        runId,
        index,
      ),

    code:
      input.code,

    severity:
      input.severity,

    message:
      input.message,

    causeName,
    causeMessage,

    metadata:
      freezeMetadata(
        input.metadata,
      ),
  });
}

function createFallbackRunId(
  request: PortfolioSynchronizationServiceRequest,
): string {
  return [
    "portfolio-sync-service",
    request.portfolio.identity.portfolioId,
    request.sequence,
    request.startedAt,
  ].join(":");
}

function determineServiceStatus(
  synchronizationStatus:
    PortfolioSynchronizationRunStatus,
): PortfolioSynchronizationServiceStatus {
  switch (synchronizationStatus) {
    case "COMPLETED":
      return "SYNCHRONIZED";

    case "COMPLETED_WITH_WARNINGS":
      return "SYNCHRONIZED_WITH_WARNINGS";

    case "FAILED":
      return "FAILED";
  }
}

function freezeResult(
  result: PortfolioSynchronizationServiceResult,
): PortfolioSynchronizationServiceResult {
  return Object.freeze({
    runId:
      result.runId,

    sequence:
      result.sequence,

    accepted:
      result.accepted,

    status:
      result.status,

    synchronization:
      result.synchronization,

    publication:
      result.publication,

    latestPortfolio:
      result.latestPortfolio,

    issues:
      Object.freeze([
        ...result.issues,
      ]),

    startedAt:
      result.startedAt,

    completedAt:
      result.completedAt,

    metadata:
      freezeMetadata(
        result.metadata,
      ),
  });
}

export class DeterministicPortfolioSynchronizationService
implements PortfolioSynchronizationService {
  private readonly orchestrator:
    PortfolioSynchronizationOrchestrator;

  private readonly publisher:
    PortfolioStatePublisher;

  private readonly policy:
    PortfolioSynchronizationServicePolicy;

  private readonly runById =
    new Map<
      string,
      PortfolioSynchronizationServiceResult
    >();

  private readonly runHistory:
    PortfolioSynchronizationServiceResult[] = [];

  public constructor(
    dependencies: PortfolioSynchronizationServiceDependencies,
    policy: PortfolioSynchronizationServicePolicy =
      createDefaultPortfolioSynchronizationServicePolicy(),
  ) {
    validateDependencies(
      dependencies,
    );

    this.orchestrator =
      dependencies.orchestrator;

    this.publisher =
      dependencies.publisher;

    this.policy =
      resolvePolicy(
        policy,
      );
  }

  public synchronize(
    request: PortfolioSynchronizationServiceRequest,
  ): PortfolioSynchronizationServiceResult {
    assertObject(
      request,
      "request",
    );

    assertObject(
      request.portfolio,
      "request.portfolio",
    );

    assertObject(
      request.portfolio.identity,
      "request.portfolio.identity",
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolio.identity.portfolioId,
        "request.portfolio.identity.portfolioId",
      );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    assertNonNegativeFiniteNumber(
      request.startedAt,
      "request.startedAt",
    );

    assertNonNegativeFiniteNumber(
      request.synchronizedAt,
      "request.synchronizedAt",
    );

    if (
      request.publish !== undefined
    ) {
      assertBoolean(
        request.publish,
        "request.publish",
      );
    }

    const requestedRunId =
      request.runId === undefined
        ? createFallbackRunId(
            request,
          )
        : normalizeIdentifier(
            request.runId,
            "request.runId",
          );

    const existingRun =
      this.runById.get(
        requestedRunId,
      );

    if (
      existingRun !== undefined &&
      this.policy.rejectDuplicateRunIds
    ) {
      const issue =
        createIssue(
          requestedRunId,
          0,
          {
            code:
              "DUPLICATE_RUN",

            severity:
              "ERROR",

            message:
              `Synchronization run "${requestedRunId}" already exists.`,

            metadata: {
              portfolioId,
              sequence:
                request.sequence,
            },
          },
        );

      return freezeResult({
        runId:
          requestedRunId,

        sequence:
          request.sequence,

        accepted: false,

        status:
          "DUPLICATE_RUN_REJECTED",

        synchronization:
          null,

        publication:
          null,

        latestPortfolio:
          this.publisher.getLatest(
            portfolioId,
          ),

        issues:
          Object.freeze([
            issue,
          ]),

        startedAt:
          request.startedAt,

        completedAt:
          request.synchronizedAt,

        metadata:
          mergeMetadata(
            request.metadata,
            {
              portfolioId,
              duplicateRun:
                true,
            },
          ),
      });
    }

    const issues:
      PortfolioSynchronizationServiceIssue[] = [];

    let synchronization:
      PortfolioSynchronizationResult | null =
      null;

    try {
      synchronization =
        this.orchestrator.synchronize({
          portfolio:
            request.portfolio,

          snapshots:
            request.snapshots,

          startedAt:
            request.startedAt,

          synchronizedAt:
            request.synchronizedAt,

          sequence:
            request.sequence,

          runId:
            requestedRunId,

          metadata:
            request.metadata,
        });
    } catch (cause) {
      issues.push(
        createIssue(
          requestedRunId,
          issues.length,
          {
            code:
              "UNEXPECTED_ERROR",

            severity:
              "CRITICAL",

            message:
              "Portfolio synchronization orchestration threw an unexpected error.",

            cause,

            metadata: {
              portfolioId,
              sequence:
                request.sequence,
            },
          },
        ),
      );

      const failedResult =
        freezeResult({
          runId:
            requestedRunId,

          sequence:
            request.sequence,

          accepted: false,

          status:
            "FAILED",

          synchronization:
            null,

          publication:
            null,

          latestPortfolio:
            this.publisher.getLatest(
              portfolioId,
            ),

          issues:
            Object.freeze([
              ...issues,
            ]),

          startedAt:
            request.startedAt,

          completedAt:
            request.synchronizedAt,

          metadata:
            mergeMetadata(
              request.metadata,
              {
                portfolioId,
                orchestrationFailed:
                  true,
              },
            ),
        });

      this.retainRun(
        failedResult,
      );

      return failedResult;
    }

    if (
      synchronization.status === "FAILED"
    ) {
      issues.push(
        createIssue(
          requestedRunId,
          issues.length,
          {
            code:
              "SYNCHRONIZATION_FAILED",

            severity:
              "ERROR",

            message:
              "Portfolio synchronization did not complete successfully.",

            metadata: {
              portfolioId,
              synchronizationStatus:
                synchronization.status,

              synchronizationIssueCount:
                synchronization.issues.length,
            },
          },
        ),
      );
    }

    const synchronizedPortfolio =
      synchronization.synchronizedPortfolio;

    if (
      synchronization.status !== "FAILED" &&
      synchronizedPortfolio === null
    ) {
      issues.push(
        createIssue(
          requestedRunId,
          issues.length,
          {
            code:
              "MISSING_SYNCHRONIZED_PORTFOLIO",

            severity:
              "CRITICAL",

            message:
              "The synchronization completed without returning a synchronized portfolio.",

            metadata: {
              portfolioId,
              synchronizationStatus:
                synchronization.status,
            },
          },
        ),
      );
    }

    let publication:
      PortfolioStatePublicationRecord | null =
      null;

    const shouldPublish =
      request.publish !== false;

    if (
      shouldPublish &&
      synchronization.status !== "FAILED" &&
      synchronizedPortfolio !== null
    ) {
      const orchestratorPublication =
        synchronization.publication;

      if (
        orchestratorPublication === null
      ) {
        issues.push(
          createIssue(
            requestedRunId,
            issues.length,
            {
              code:
                "MISSING_PUBLICATION",

              severity:
                "ERROR",

              message:
                "The synchronization completed without an orchestrator publication.",

              metadata: {
                portfolioId,
                sequence:
                  request.sequence,
              },
            },
          ),
        );
      } else {
        const publicationResult =
          this.publisher.publish({
            publicationId:
              orchestratorPublication.publicationId,

            portfolio:
              orchestratorPublication.portfolio,

            publishedAt:
              orchestratorPublication.publishedAt,

            sequence:
              orchestratorPublication.sequence,

            metadata:
              mergeMetadata(
                orchestratorPublication.metadata,
                request.metadata,
                {
                  synchronizationRunId:
                    requestedRunId,
                },
              ),
          });

        publication =
          publicationResult.record;

        if (!publicationResult.accepted) {
          issues.push(
            createIssue(
              requestedRunId,
              issues.length,
              {
                code:
                  "PUBLICATION_REJECTED",

                severity:
                  "ERROR",

                message:
                  "The synchronized portfolio was rejected by the state publisher.",

                metadata: {
                  portfolioId,
                  publicationId:
                    publication.publicationId,

                  publicationStatus:
                    publication.status,
                },
              },
            ),
          );
        }
      }
    }

    const hasCriticalIssue =
      issues.some(
        issue =>
          issue.severity === "CRITICAL",
      );

    const publicationRejected =
      issues.some(
        issue =>
          issue.code ===
          "PUBLICATION_REJECTED",
      );

    let status:
      PortfolioSynchronizationServiceStatus;

    if (
      hasCriticalIssue ||
      synchronization.status === "FAILED"
    ) {
      status =
        "FAILED";
    } else if (publicationRejected) {
      status =
        "PUBLICATION_REJECTED";
    } else {
      status =
        determineServiceStatus(
          synchronization.status,
        );
    }

    const accepted =
      status === "SYNCHRONIZED" ||
      status === "SYNCHRONIZED_WITH_WARNINGS";

    const latestPortfolio =
      this.publisher.getLatest(
        portfolioId,
      ) ??
      synchronizedPortfolio;

    const result =
      freezeResult({
        runId:
          synchronization.runId,

        sequence:
          synchronization.sequence,

        accepted,

        status,

        synchronization,

        publication,

        latestPortfolio,

        issues:
          Object.freeze([
            ...issues,
          ]),

        startedAt:
          synchronization.startedAt,

        completedAt:
          synchronization.completedAt,

        metadata:
          mergeMetadata(
            request.metadata,
            synchronization.metadata,
            {
              portfolioId,

              synchronizationStatus:
                synchronization.status,

              serviceStatus:
                status,

              published:
                publication !== null,

              publishRequested:
                shouldPublish,

              serviceIssueCount:
                issues.length,
            },
          ),
      });

    this.retainRun(
      result,
    );

    return result;
  }

  public getLatestPortfolio(
    portfolioId: string,
  ): LivePortfolio | null {
    const normalizedPortfolioId =
      normalizeIdentifier(
        portfolioId,
        "portfolioId",
      );

    return this.publisher.getLatest(
      normalizedPortfolioId,
    );
  }

  public getRun(
    runId: string,
  ): PortfolioSynchronizationServiceResult | null {
    const normalizedRunId =
      normalizeIdentifier(
        runId,
        "runId",
      );

    return (
      this.runById.get(
        normalizedRunId,
      ) ??
      null
    );
  }

  public getRunHistory(
    portfolioId?: string,
  ): readonly PortfolioSynchronizationServiceResult[] {
    if (portfolioId === undefined) {
      return Object.freeze([
        ...this.runHistory,
      ]);
    }

    const normalizedPortfolioId =
      normalizeIdentifier(
        portfolioId,
        "portfolioId",
      );

    return Object.freeze(
      this.runHistory.filter(
        result =>
          result.synchronization
            ?.sourcePortfolio
            .identity
            .portfolioId ===
          normalizedPortfolioId,
      ),
    );
  }

  public getPublicationHistory(
    portfolioId?: string,
  ): readonly PortfolioStatePublicationRecord[] {
    return this.publisher.getHistory(
      portfolioId,
    );
  }

  public subscribe(
    subscriberId: string,
    subscriber: PortfolioStateSubscriber,
    portfolioId?: string,
  ): PortfolioStateSubscription {
    return this.publisher.subscribe(
      subscriberId,
      subscriber,
      portfolioId,
    );
  }

  public unsubscribe(
    subscriberId: string,
  ): boolean {
    return this.publisher.unsubscribe(
      subscriberId,
    );
  }

  public clear(): void {
    this.runById.clear();
    this.runHistory.length = 0;

    this.publisher.clear();
  }

  private retainRun(
    result: PortfolioSynchronizationServiceResult,
  ): void {
    if (
      result.status === "FAILED" &&
      !this.policy.retainFailedRuns
    ) {
      return;
    }

    this.runById.set(
      result.runId,
      result,
    );

    this.runHistory.push(
      result,
    );

    this.trimRunHistory();
  }

  private trimRunHistory(): void {
    const excess =
      this.runHistory.length -
      this.policy.maximumRunHistoryEntries;

    if (excess <= 0) {
      return;
    }

    const removedRuns =
      this.runHistory.splice(
        0,
        excess,
      );

    for (const removedRun of removedRuns) {
      const indexedRun =
        this.runById.get(
          removedRun.runId,
        );

      if (indexedRun === removedRun) {
        this.runById.delete(
          removedRun.runId,
        );
      }
    }
  }
}

export function createPortfolioSynchronizationService(
  dependencies: PortfolioSynchronizationServiceDependencies,
  policy: PortfolioSynchronizationServicePolicy =
    createDefaultPortfolioSynchronizationServicePolicy(),
): DeterministicPortfolioSynchronizationService {
  return new DeterministicPortfolioSynchronizationService(
    dependencies,
    policy,
  );
}

export function createPortfolioSynchronizationRuntime(
  options: PortfolioSynchronizationServiceFactoryOptions,
): DeterministicPortfolioSynchronizationService {
  assertObject(
    options,
    "options",
  );

  const orchestrator =
    new DeterministicPortfolioSynchronizationOrchestrator(
      options.synchronizationDependencies,
      options.synchronizationPolicy ??
        createDefaultPortfolioSynchronizationPolicy(),
    );

  const publisher =
    new DeterministicPortfolioStatePublisher(
      options.publicationPolicy ??
        createDefaultPortfolioStatePublicationPolicy(),
    );

  return new DeterministicPortfolioSynchronizationService(
    {
      orchestrator,
      publisher,
    },
    options.servicePolicy ??
      createDefaultPortfolioSynchronizationServicePolicy(),
  );
}

export function createDefaultPortfolioSynchronizationServicePolicy():
PortfolioSynchronizationServicePolicy {
  return Object.freeze({
    rejectDuplicateRunIds: true,
    retainFailedRuns: true,
    maximumRunHistoryEntries: 1_000,
  });
}

export function isSuccessfulPortfolioSynchronizationServiceResult(
  result: PortfolioSynchronizationServiceResult,
): boolean {
  assertObject(
    result,
    "result",
  );

  return (
    result.accepted &&
    (
      result.status === "SYNCHRONIZED" ||
      result.status ===
        "SYNCHRONIZED_WITH_WARNINGS"
    )
  );
}

export function findPortfolioSynchronizationServiceIssue(
  result: PortfolioSynchronizationServiceResult,
  issueId: string,
): PortfolioSynchronizationServiceIssue | null {
  assertObject(
    result,
    "result",
  );

  const normalizedIssueId =
    normalizeIdentifier(
      issueId,
      "issueId",
    );

  return (
    result.issues.find(
      issue =>
        issue.issueId ===
        normalizedIssueId,
    ) ??
    null
  );
}