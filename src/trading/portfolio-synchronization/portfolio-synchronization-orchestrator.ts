/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Part 12: Portfolio Synchronization Orchestrator
 *
 * Coordinates deterministic portfolio synchronization stages without coupling
 * the orchestration layer to concrete exchange adapters or calculation engines.
 *
 * Concrete snapshot ingestion, aggregation, PnL, margin, exposure, and
 * reconciliation implementations are supplied through immutable dependencies.
 */

import type {
  LivePortfolio,
  LivePortfolioMetadata,
} from "./live-portfolio";

export type PortfolioSynchronizationStage =
  | "VALIDATION"
  | "SNAPSHOT_INGESTION"
  | "PORTFOLIO_AGGREGATION"
  | "UNREALIZED_PNL"
  | "REALIZED_PNL"
  | "MARGIN_AND_COLLATERAL"
  | "EXPOSURE"
  | "RECONCILIATION"
  | "PUBLICATION";

export type PortfolioSynchronizationRunStatus =
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "FAILED";

export type PortfolioSynchronizationStageStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED";

export type PortfolioSynchronizationIssueSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export type PortfolioSynchronizationIssueCode =
  | "INVALID_REQUEST"
  | "INVALID_PORTFOLIO"
  | "STALE_INPUT"
  | "STAGE_FAILURE"
  | "STAGE_RETURNED_INVALID_PORTFOLIO"
  | "PORTFOLIO_ID_CHANGED"
  | "OWNER_ID_CHANGED"
  | "REPORTING_CURRENCY_CHANGED"
  | "VERSION_REGRESSION"
  | "UPDATED_AT_REGRESSION"
  | "RECONCILIATION_MISMATCH"
  | "PUBLICATION_FAILURE"
  | "UNEXPECTED_ERROR";

export interface PortfolioSynchronizationSnapshotEnvelope {
  readonly snapshotId: string;

  readonly exchangeId: string;
  readonly accountId: string;

  readonly capturedAt: number;
  readonly receivedAt: number;

  readonly snapshotType: string;
  readonly payload: unknown;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationContext {
  readonly runId: string;
  readonly sequence: number;

  readonly startedAt: number;
  readonly synchronizedAt: number;

  readonly sourcePortfolio: LivePortfolio;

  readonly snapshots: readonly PortfolioSynchronizationSnapshotEnvelope[];

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationIssue {
  readonly issueId: string;

  readonly code: PortfolioSynchronizationIssueCode;
  readonly severity: PortfolioSynchronizationIssueSeverity;

  readonly stage: PortfolioSynchronizationStage;
  readonly message: string;

  readonly causeName: string | null;
  readonly causeMessage: string | null;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationStageRecord {
  readonly stage: PortfolioSynchronizationStage;
  readonly status: PortfolioSynchronizationStageStatus;

  readonly startedAt: number | null;
  readonly completedAt: number | null;

  readonly inputPortfolioVersion: number | null;
  readonly outputPortfolioVersion: number | null;

  readonly duration: number | null;

  readonly issueCount: number;
  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationReconciliationDecision {
  readonly matched: boolean;
  readonly criticalMismatch: boolean;

  readonly differenceCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly criticalCount: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationPublication {
  readonly publicationId: string;

  readonly portfolio: LivePortfolio;

  readonly publishedAt: number;
  readonly sequence: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationRequest {
  readonly portfolio: LivePortfolio;

  readonly snapshots: readonly PortfolioSynchronizationSnapshotEnvelope[];

  readonly startedAt: number;
  readonly synchronizedAt: number;
  readonly sequence: number;

  readonly runId?: string;
  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationResult {
  readonly runId: string;
  readonly sequence: number;

  readonly status: PortfolioSynchronizationRunStatus;

  readonly sourcePortfolio: LivePortfolio;
  readonly synchronizedPortfolio: LivePortfolio | null;

  readonly publication: PortfolioSynchronizationPublication | null;

  readonly reconciliation:
    PortfolioSynchronizationReconciliationDecision | null;

  readonly stages: readonly PortfolioSynchronizationStageRecord[];
  readonly issues: readonly PortfolioSynchronizationIssue[];

  readonly startedAt: number;
  readonly completedAt: number;

  readonly metadata: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationStageInput {
  readonly context: PortfolioSynchronizationContext;
  readonly portfolio: LivePortfolio;
}

export interface PortfolioSnapshotIngestionOutput {
  readonly portfolio: LivePortfolio;
  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioReconciliationStageOutput {
  readonly portfolio: LivePortfolio;

  readonly decision: PortfolioSynchronizationReconciliationDecision;

  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioPublicationStageOutput {
  readonly publication: PortfolioSynchronizationPublication;

  readonly metadata?: LivePortfolioMetadata;
}

export interface PortfolioSynchronizationDependencies {
  readonly ingestSnapshots: (
    input: PortfolioSynchronizationStageInput,
  ) => PortfolioSnapshotIngestionOutput;

  readonly aggregatePortfolio: (
    input: PortfolioSynchronizationStageInput,
  ) => LivePortfolio;

  readonly calculateUnrealizedPnl: (
    input: PortfolioSynchronizationStageInput,
  ) => LivePortfolio;

  readonly calculateRealizedPnl: (
    input: PortfolioSynchronizationStageInput,
  ) => LivePortfolio;

  readonly calculateMarginAndCollateral: (
    input: PortfolioSynchronizationStageInput,
  ) => LivePortfolio;

  readonly calculateExposure: (
    input: PortfolioSynchronizationStageInput,
  ) => LivePortfolio;

  readonly reconcilePortfolio: (
    input: PortfolioSynchronizationStageInput,
  ) => PortfolioReconciliationStageOutput;

  readonly publishPortfolio: (
    input: PortfolioSynchronizationStageInput,
  ) => PortfolioPublicationStageOutput;
}

export interface PortfolioSynchronizationPolicy {
  readonly failOnWarning: boolean;
  readonly failOnReconciliationMismatch: boolean;

  readonly allowEmptySnapshots: boolean;
  readonly rejectStaleSnapshots: boolean;

  readonly maximumSnapshotAge: number;
  readonly maximumFutureClockSkew: number;

  readonly requireVersionIncrease: boolean;
  readonly requireUpdatedAtIncrease: boolean;
}

export interface PortfolioSynchronizationOrchestrator {
  synchronize(
    request: PortfolioSynchronizationRequest,
  ): PortfolioSynchronizationResult;
}

interface MutableStageRecord {
  readonly stage: PortfolioSynchronizationStage;

  status: PortfolioSynchronizationStageStatus;

  startedAt: number | null;
  completedAt: number | null;

  inputPortfolioVersion: number | null;
  outputPortfolioVersion: number | null;

  issueCount: number;

  metadata: LivePortfolioMetadata;
}

interface StageExecutionResult<T> {
  readonly succeeded: boolean;
  readonly value: T | null;
  readonly issue: PortfolioSynchronizationIssue | null;
}

const STAGE_ORDER: readonly PortfolioSynchronizationStage[] =
  Object.freeze([
    "VALIDATION",
    "SNAPSHOT_INGESTION",
    "PORTFOLIO_AGGREGATION",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "MARGIN_AND_COLLATERAL",
    "EXPOSURE",
    "RECONCILIATION",
    "PUBLICATION",
  ]);

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

function assertFiniteNumber(
  value: number,
  field: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `${field} must be a finite number.`,
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

function normalizeCurrency(
  value: string,
  field: string,
): string {
  return normalizeIdentifier(
    value,
    field,
  ).toUpperCase();
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
  policy: PortfolioSynchronizationPolicy,
): PortfolioSynchronizationPolicy {
  assertObject(
    policy,
    "policy",
  );

  assertBoolean(
    policy.failOnWarning,
    "policy.failOnWarning",
  );

  assertBoolean(
    policy.failOnReconciliationMismatch,
    "policy.failOnReconciliationMismatch",
  );

  assertBoolean(
    policy.allowEmptySnapshots,
    "policy.allowEmptySnapshots",
  );

  assertBoolean(
    policy.rejectStaleSnapshots,
    "policy.rejectStaleSnapshots",
  );

  assertNonNegativeFiniteNumber(
    policy.maximumSnapshotAge,
    "policy.maximumSnapshotAge",
  );

  assertNonNegativeFiniteNumber(
    policy.maximumFutureClockSkew,
    "policy.maximumFutureClockSkew",
  );

  assertBoolean(
    policy.requireVersionIncrease,
    "policy.requireVersionIncrease",
  );

  assertBoolean(
    policy.requireUpdatedAtIncrease,
    "policy.requireUpdatedAtIncrease",
  );

  return Object.freeze({
    failOnWarning:
      policy.failOnWarning,

    failOnReconciliationMismatch:
      policy.failOnReconciliationMismatch,

    allowEmptySnapshots:
      policy.allowEmptySnapshots,

    rejectStaleSnapshots:
      policy.rejectStaleSnapshots,

    maximumSnapshotAge:
      policy.maximumSnapshotAge,

    maximumFutureClockSkew:
      policy.maximumFutureClockSkew,

    requireVersionIncrease:
      policy.requireVersionIncrease,

    requireUpdatedAtIncrease:
      policy.requireUpdatedAtIncrease,
  });
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

  normalizeIdentifier(
    portfolio.identity.ownerId,
    `${field}.identity.ownerId`,
  );

  normalizeCurrency(
    portfolio.identity.reportingCurrency,
    `${field}.identity.reportingCurrency`,
  );

  assertNonNegativeFiniteNumber(
    portfolio.createdAt,
    `${field}.createdAt`,
  );

  assertNonNegativeFiniteNumber(
    portfolio.updatedAt,
    `${field}.updatedAt`,
  );

  assertPositiveInteger(
    portfolio.version,
    `${field}.version`,
  );

  if (
    portfolio.updatedAt <
    portfolio.createdAt
  ) {
    throw new Error(
      `${field}.updatedAt cannot be earlier than createdAt.`,
    );
  }

  if (!Array.isArray(portfolio.exchangeAccounts)) {
    throw new Error(
      `${field}.exchangeAccounts must be an array.`,
    );
  }

  if (!Array.isArray(portfolio.balances)) {
    throw new Error(
      `${field}.balances must be an array.`,
    );
  }

  if (!Array.isArray(portfolio.positions)) {
    throw new Error(
      `${field}.positions must be an array.`,
    );
  }

  if (!Array.isArray(portfolio.openOrderExposures)) {
    throw new Error(
      `${field}.openOrderExposures must be an array.`,
    );
  }

  if (!Array.isArray(portfolio.collateral)) {
    throw new Error(
      `${field}.collateral must be an array.`,
    );
  }

  assertObject(
    portfolio.margin,
    `${field}.margin`,
  );

  assertObject(
    portfolio.exposure,
    `${field}.exposure`,
  );

  assertObject(
    portfolio.pnl,
    `${field}.pnl`,
  );

  assertObject(
    portfolio.valuation,
    `${field}.valuation`,
  );

  assertObject(
    portfolio.synchronization,
    `${field}.synchronization`,
  );
}

function validateSnapshot(
  snapshot: PortfolioSynchronizationSnapshotEnvelope,
  index: number,
): void {
  const prefix =
    `request.snapshots[${index}]`;

  assertObject(
    snapshot,
    prefix,
  );

  normalizeIdentifier(
    snapshot.snapshotId,
    `${prefix}.snapshotId`,
  );

  normalizeIdentifier(
    snapshot.exchangeId,
    `${prefix}.exchangeId`,
  );

  normalizeIdentifier(
    snapshot.accountId,
    `${prefix}.accountId`,
  );

  normalizeIdentifier(
    snapshot.snapshotType,
    `${prefix}.snapshotType`,
  );

  assertNonNegativeFiniteNumber(
    snapshot.capturedAt,
    `${prefix}.capturedAt`,
  );

  assertNonNegativeFiniteNumber(
    snapshot.receivedAt,
    `${prefix}.receivedAt`,
  );

  if (
    snapshot.receivedAt <
    snapshot.capturedAt
  ) {
    throw new Error(
      `${prefix}.receivedAt cannot be earlier than capturedAt.`,
    );
  }

  freezeMetadata(
    snapshot.metadata,
  );
}

function validateDependencies(
  dependencies: PortfolioSynchronizationDependencies,
): void {
  assertObject(
    dependencies,
    "dependencies",
  );

  const entries: readonly [
    keyof PortfolioSynchronizationDependencies,
    unknown,
  ][] = [
    [
      "ingestSnapshots",
      dependencies.ingestSnapshots,
    ],
    [
      "aggregatePortfolio",
      dependencies.aggregatePortfolio,
    ],
    [
      "calculateUnrealizedPnl",
      dependencies.calculateUnrealizedPnl,
    ],
    [
      "calculateRealizedPnl",
      dependencies.calculateRealizedPnl,
    ],
    [
      "calculateMarginAndCollateral",
      dependencies.calculateMarginAndCollateral,
    ],
    [
      "calculateExposure",
      dependencies.calculateExposure,
    ],
    [
      "reconcilePortfolio",
      dependencies.reconcilePortfolio,
    ],
    [
      "publishPortfolio",
      dependencies.publishPortfolio,
    ],
  ];

  for (const [name, value] of entries) {
    if (typeof value !== "function") {
      throw new Error(
        `dependencies.${name} must be a function.`,
      );
    }
  }
}

function createRunId(
  portfolioId: string,
  sequence: number,
  startedAt: number,
): string {
  return [
    "portfolio-sync",
    portfolioId,
    sequence,
    startedAt,
  ].join(":");
}

function createIssueId(
  runId: string,
  index: number,
): string {
  return `${runId}:issue:${String(
    index + 1,
  ).padStart(6, "0")}`;
}

function createMutableStageRecords():
Map<PortfolioSynchronizationStage, MutableStageRecord> {
  const records =
    new Map<
      PortfolioSynchronizationStage,
      MutableStageRecord
    >();

  for (const stage of STAGE_ORDER) {
    records.set(
      stage,
      {
        stage,

        status: "PENDING",

        startedAt: null,
        completedAt: null,

        inputPortfolioVersion: null,
        outputPortfolioVersion: null,

        issueCount: 0,

        metadata:
          Object.freeze({}),
      },
    );
  }

  return records;
}

function createIssue(
  runId: string,
  index: number,
  input: {
    readonly code: PortfolioSynchronizationIssueCode;
    readonly severity: PortfolioSynchronizationIssueSeverity;
    readonly stage: PortfolioSynchronizationStage;
    readonly message: string;
    readonly cause?: unknown;
    readonly metadata?: LivePortfolioMetadata;
  },
): PortfolioSynchronizationIssue {
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

    stage:
      input.stage,

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

function markStageRunning(
  record: MutableStageRecord,
  startedAt: number,
  portfolioVersion: number,
): void {
  record.status =
    "RUNNING";

  record.startedAt =
    startedAt;

  record.inputPortfolioVersion =
    portfolioVersion;
}

function markStageCompleted(
  record: MutableStageRecord,
  completedAt: number,
  portfolioVersion: number,
  metadata?: LivePortfolioMetadata,
): void {
  record.status =
    "COMPLETED";

  record.completedAt =
    completedAt;

  record.outputPortfolioVersion =
    portfolioVersion;

  record.metadata =
    freezeMetadata(
      metadata,
    );
}

function markStageFailed(
  record: MutableStageRecord,
  completedAt: number,
): void {
  record.status =
    "FAILED";

  record.completedAt =
    completedAt;

  record.issueCount += 1;
}

function markRemainingStagesSkipped(
  records: ReadonlyMap<
    PortfolioSynchronizationStage,
    MutableStageRecord
  >,
  failedStage: PortfolioSynchronizationStage,
): void {
  const failedIndex =
    STAGE_ORDER.indexOf(
      failedStage,
    );

  for (
    let index = failedIndex + 1;
    index < STAGE_ORDER.length;
    index += 1
  ) {
    const stage =
      STAGE_ORDER[index];

    if (stage === undefined) {
      continue;
    }

    const record =
      records.get(stage);

    if (
      record !== undefined &&
      record.status === "PENDING"
    ) {
      record.status =
        "SKIPPED";
    }
  }
}

function freezeStageRecords(
  records: ReadonlyMap<
    PortfolioSynchronizationStage,
    MutableStageRecord
  >,
): readonly PortfolioSynchronizationStageRecord[] {
  return Object.freeze(
    STAGE_ORDER.map(stage => {
      const record =
        records.get(stage);

      if (record === undefined) {
        throw new Error(
          `Missing stage record for ${stage}.`,
        );
      }

      const duration =
        record.startedAt !== null &&
        record.completedAt !== null
          ? record.completedAt -
            record.startedAt
          : null;

      return Object.freeze({
        stage:
          record.stage,

        status:
          record.status,

        startedAt:
          record.startedAt,

        completedAt:
          record.completedAt,

        inputPortfolioVersion:
          record.inputPortfolioVersion,

        outputPortfolioVersion:
          record.outputPortfolioVersion,

        duration,

        issueCount:
          record.issueCount,

        metadata:
          record.metadata,
      });
    }),
  );
}

function validatePortfolioTransition(
  source: LivePortfolio,
  next: LivePortfolio,
  policy: PortfolioSynchronizationPolicy,
): void {
  validatePortfolio(
    next,
    "stage output portfolio",
  );

  if (
    next.identity.portfolioId !==
    source.identity.portfolioId
  ) {
    throw new Error(
      "A synchronization stage changed the portfolio identifier.",
    );
  }

  if (
    next.identity.ownerId !==
    source.identity.ownerId
  ) {
    throw new Error(
      "A synchronization stage changed the portfolio owner identifier.",
    );
  }

  if (
    normalizeCurrency(
      next.identity.reportingCurrency,
      "next.identity.reportingCurrency",
    ) !==
    normalizeCurrency(
      source.identity.reportingCurrency,
      "source.identity.reportingCurrency",
    )
  ) {
    throw new Error(
      "A synchronization stage changed the reporting currency.",
    );
  }

  if (
    policy.requireVersionIncrease &&
    next.version <= source.version
  ) {
    throw new Error(
      "A synchronization stage must increase the portfolio version.",
    );
  }

  if (
    !policy.requireVersionIncrease &&
    next.version < source.version
  ) {
    throw new Error(
      "A synchronization stage cannot decrease the portfolio version.",
    );
  }

  if (
    policy.requireUpdatedAtIncrease &&
    next.updatedAt <= source.updatedAt
  ) {
    throw new Error(
      "A synchronization stage must increase portfolio.updatedAt.",
    );
  }

  if (
    !policy.requireUpdatedAtIncrease &&
    next.updatedAt < source.updatedAt
  ) {
    throw new Error(
      "A synchronization stage cannot decrease portfolio.updatedAt.",
    );
  }
}

function executeStage<T>(
  runId: string,
  issueIndex: number,
  stage: PortfolioSynchronizationStage,
  record: MutableStageRecord,
  portfolio: LivePortfolio,
  stageTime: number,
  operation: () => T,
): StageExecutionResult<T> {
  markStageRunning(
    record,
    stageTime,
    portfolio.version,
  );

  try {
    const value =
      operation();

    return Object.freeze({
      succeeded: true,
      value,
      issue: null,
    });
  } catch (cause) {
    markStageFailed(
      record,
      stageTime,
    );

    return Object.freeze({
      succeeded: false,
      value: null,

      issue:
        createIssue(
          runId,
          issueIndex,
          {
            code:
              stage === "PUBLICATION"
                ? "PUBLICATION_FAILURE"
                : "STAGE_FAILURE",

            severity:
              "CRITICAL",

            stage,

            message:
              `Portfolio synchronization stage ${stage} failed.`,

            cause,
          },
        ),
    });
  }
}

function determineRunStatus(
  issues: readonly PortfolioSynchronizationIssue[],
  policy: PortfolioSynchronizationPolicy,
): PortfolioSynchronizationRunStatus {
  const hasFailure =
    issues.some(
      issue =>
        issue.severity === "ERROR" ||
        issue.severity === "CRITICAL",
    );

  if (hasFailure) {
    return "FAILED";
  }

  const hasWarning =
    issues.some(
      issue =>
        issue.severity === "WARNING",
    );

  if (
    hasWarning &&
    policy.failOnWarning
  ) {
    return "FAILED";
  }

  if (hasWarning) {
    return "COMPLETED_WITH_WARNINGS";
  }

  return "COMPLETED";
}

function validateReconciliationDecision(
  decision: PortfolioSynchronizationReconciliationDecision,
): void {
  assertObject(
    decision,
    "reconciliation decision",
  );

  assertBoolean(
    decision.matched,
    "reconciliation decision.matched",
  );

  assertBoolean(
    decision.criticalMismatch,
    "reconciliation decision.criticalMismatch",
  );

  assertNonNegativeFiniteNumber(
    decision.differenceCount,
    "reconciliation decision.differenceCount",
  );

  assertNonNegativeFiniteNumber(
    decision.warningCount,
    "reconciliation decision.warningCount",
  );

  assertNonNegativeFiniteNumber(
    decision.errorCount,
    "reconciliation decision.errorCount",
  );

  assertNonNegativeFiniteNumber(
    decision.criticalCount,
    "reconciliation decision.criticalCount",
  );

  freezeMetadata(
    decision.metadata,
  );
}

export class DeterministicPortfolioSynchronizationOrchestrator
implements PortfolioSynchronizationOrchestrator {
  private readonly dependencies:
    PortfolioSynchronizationDependencies;

  private readonly policy:
    PortfolioSynchronizationPolicy;

  public constructor(
    dependencies: PortfolioSynchronizationDependencies,
    policy: PortfolioSynchronizationPolicy =
      createDefaultPortfolioSynchronizationPolicy(),
  ) {
    validateDependencies(
      dependencies,
    );

    this.dependencies =
      Object.freeze({
        ingestSnapshots:
          dependencies.ingestSnapshots,

        aggregatePortfolio:
          dependencies.aggregatePortfolio,

        calculateUnrealizedPnl:
          dependencies.calculateUnrealizedPnl,

        calculateRealizedPnl:
          dependencies.calculateRealizedPnl,

        calculateMarginAndCollateral:
          dependencies.calculateMarginAndCollateral,

        calculateExposure:
          dependencies.calculateExposure,

        reconcilePortfolio:
          dependencies.reconcilePortfolio,

        publishPortfolio:
          dependencies.publishPortfolio,
      });

    this.policy =
      resolvePolicy(
        policy,
      );
  }

  public synchronize(
    request: PortfolioSynchronizationRequest,
  ): PortfolioSynchronizationResult {
    assertObject(
      request,
      "request",
    );

    validatePortfolio(
      request.portfolio,
      "request.portfolio",
    );

    if (!Array.isArray(request.snapshots)) {
      throw new Error(
        "request.snapshots must be an array.",
      );
    }

    assertNonNegativeFiniteNumber(
      request.startedAt,
      "request.startedAt",
    );

    assertNonNegativeFiniteNumber(
      request.synchronizedAt,
      "request.synchronizedAt",
    );

    assertPositiveInteger(
      request.sequence,
      "request.sequence",
    );

    if (
      request.synchronizedAt <
      request.startedAt
    ) {
      throw new Error(
        "request.synchronizedAt cannot be earlier than request.startedAt.",
      );
    }

    if (
      !this.policy.allowEmptySnapshots &&
      request.snapshots.length === 0
    ) {
      throw new Error(
        "At least one synchronization snapshot is required.",
      );
    }

    request.snapshots.forEach(
      validateSnapshot,
    );

    const portfolioId =
      normalizeIdentifier(
        request.portfolio.identity.portfolioId,
        "request.portfolio.identity.portfolioId",
      );

    const runId =
      request.runId === undefined
        ? createRunId(
            portfolioId,
            request.sequence,
            request.startedAt,
          )
        : normalizeIdentifier(
            request.runId,
            "request.runId",
          );

    const stageRecords =
      createMutableStageRecords();

    const mutableIssues:
      PortfolioSynchronizationIssue[] = [];

    const validationRecord =
      stageRecords.get(
        "VALIDATION",
      );

    if (validationRecord === undefined) {
      throw new Error(
        "Validation stage record is missing.",
      );
    }

    markStageRunning(
      validationRecord,
      request.startedAt,
      request.portfolio.version,
    );

    const snapshotIds =
      new Set<string>();

    for (
      let index = 0;
      index < request.snapshots.length;
      index += 1
    ) {
      const snapshot =
        request.snapshots[index];

      if (snapshot === undefined) {
        continue;
      }

      if (
        snapshotIds.has(
          snapshot.snapshotId,
        )
      ) {
        throw new Error(
          `Duplicate snapshot identifier "${snapshot.snapshotId}".`,
        );
      }

      snapshotIds.add(
        snapshot.snapshotId,
      );

      if (
        snapshot.capturedAt >
        request.synchronizedAt +
          this.policy.maximumFutureClockSkew
      ) {
        throw new Error(
          `Snapshot "${snapshot.snapshotId}" exceeds the allowed future clock skew.`,
        );
      }

      const snapshotAge =
        request.synchronizedAt -
        snapshot.capturedAt;

      if (
        this.policy.rejectStaleSnapshots &&
        snapshotAge >
          this.policy.maximumSnapshotAge
      ) {
        mutableIssues.push(
          createIssue(
            runId,
            mutableIssues.length,
            {
              code:
                "STALE_INPUT",

              severity:
                "ERROR",

              stage:
                "VALIDATION",

              message:
                `Snapshot "${snapshot.snapshotId}" is stale.`,

              metadata: {
                snapshotId:
                  snapshot.snapshotId,

                snapshotAge,

                maximumSnapshotAge:
                  this.policy.maximumSnapshotAge,
              },
            },
          ),
        );

        validationRecord.issueCount += 1;
      }
    }

    markStageCompleted(
      validationRecord,
      request.startedAt,
      request.portfolio.version,
      {
        snapshotCount:
          request.snapshots.length,

        issueCount:
          validationRecord.issueCount,
      },
    );

    const validationFailed =
      mutableIssues.some(
        issue =>
          issue.stage === "VALIDATION" &&
          (
            issue.severity === "ERROR" ||
            issue.severity === "CRITICAL"
          ),
      );

    if (validationFailed) {
      markRemainingStagesSkipped(
        stageRecords,
        "VALIDATION",
      );

      return Object.freeze({
        runId,
        sequence:
          request.sequence,

        status:
          "FAILED",

        sourcePortfolio:
          request.portfolio,

        synchronizedPortfolio:
          null,

        publication:
          null,

        reconciliation:
          null,

        stages:
          freezeStageRecords(
            stageRecords,
          ),

        issues:
          Object.freeze([
            ...mutableIssues,
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
              snapshotCount:
                request.snapshots.length,

              failedStage:
                "VALIDATION",
            },
          ),
      });
    }

    const context:
      PortfolioSynchronizationContext =
      Object.freeze({
        runId,
        sequence:
          request.sequence,

        startedAt:
          request.startedAt,

        synchronizedAt:
          request.synchronizedAt,

        sourcePortfolio:
          request.portfolio,

        snapshots:
          Object.freeze([
            ...request.snapshots,
          ]),

        metadata:
          freezeMetadata(
            request.metadata,
          ),
      });

    let currentPortfolio =
      request.portfolio;

    let reconciliation:
      PortfolioSynchronizationReconciliationDecision | null =
      null;

    let publication:
      PortfolioSynchronizationPublication | null =
      null;

    const runPortfolioStage = (
      stage: PortfolioSynchronizationStage,
      operation: (
        input: PortfolioSynchronizationStageInput,
      ) => LivePortfolio,
    ): boolean => {
      const record =
        stageRecords.get(stage);

      if (record === undefined) {
        throw new Error(
          `Stage record ${stage} is missing.`,
        );
      }

      const result =
        executeStage(
          runId,
          mutableIssues.length,
          stage,
          record,
          currentPortfolio,
          request.synchronizedAt,
          () =>
            operation({
              context,
              portfolio:
                currentPortfolio,
            }),
        );

      if (
        !result.succeeded ||
        result.value === null
      ) {
        if (result.issue !== null) {
          mutableIssues.push(
            result.issue,
          );
        }

        markRemainingStagesSkipped(
          stageRecords,
          stage,
        );

        return false;
      }

      try {
        validatePortfolioTransition(
          currentPortfolio,
          result.value,
          this.policy,
        );
      } catch (cause) {
        markStageFailed(
          record,
          request.synchronizedAt,
        );

        mutableIssues.push(
          createIssue(
            runId,
            mutableIssues.length,
            {
              code:
                "STAGE_RETURNED_INVALID_PORTFOLIO",

              severity:
                "CRITICAL",

              stage,

              message:
                `Stage ${stage} returned an invalid portfolio transition.`,

              cause,
            },
          ),
        );

        markRemainingStagesSkipped(
          stageRecords,
          stage,
        );

        return false;
      }

      currentPortfolio =
        result.value;

      markStageCompleted(
        record,
        request.synchronizedAt,
        currentPortfolio.version,
      );

      return true;
    };

    const ingestionRecord =
      stageRecords.get(
        "SNAPSHOT_INGESTION",
      );

    if (ingestionRecord === undefined) {
      throw new Error(
        "Snapshot ingestion stage record is missing.",
      );
    }

    const ingestionResult =
      executeStage(
        runId,
        mutableIssues.length,
        "SNAPSHOT_INGESTION",
        ingestionRecord,
        currentPortfolio,
        request.synchronizedAt,
        () =>
          this.dependencies.ingestSnapshots({
            context,
            portfolio:
              currentPortfolio,
          }),
      );

    if (
      !ingestionResult.succeeded ||
      ingestionResult.value === null
    ) {
      if (ingestionResult.issue !== null) {
        mutableIssues.push(
          ingestionResult.issue,
        );
      }

      markRemainingStagesSkipped(
        stageRecords,
        "SNAPSHOT_INGESTION",
      );
    } else {
      try {
        validatePortfolioTransition(
          currentPortfolio,
          ingestionResult.value.portfolio,
          this.policy,
        );

        currentPortfolio =
          ingestionResult.value.portfolio;

        markStageCompleted(
          ingestionRecord,
          request.synchronizedAt,
          currentPortfolio.version,
          ingestionResult.value.metadata,
        );
      } catch (cause) {
        markStageFailed(
          ingestionRecord,
          request.synchronizedAt,
        );

        mutableIssues.push(
          createIssue(
            runId,
            mutableIssues.length,
            {
              code:
                "STAGE_RETURNED_INVALID_PORTFOLIO",

              severity:
                "CRITICAL",

              stage:
                "SNAPSHOT_INGESTION",

              message:
                "Snapshot ingestion returned an invalid portfolio transition.",

              cause,
            },
          ),
        );

        markRemainingStagesSkipped(
          stageRecords,
          "SNAPSHOT_INGESTION",
        );
      }
    }

    const ingestionSucceeded =
      ingestionRecord.status ===
      "COMPLETED";

    const aggregationSucceeded =
      ingestionSucceeded &&
      runPortfolioStage(
        "PORTFOLIO_AGGREGATION",
        this.dependencies.aggregatePortfolio,
      );

    const unrealizedSucceeded =
      aggregationSucceeded &&
      runPortfolioStage(
        "UNREALIZED_PNL",
        this.dependencies.calculateUnrealizedPnl,
      );

    const realizedSucceeded =
      unrealizedSucceeded &&
      runPortfolioStage(
        "REALIZED_PNL",
        this.dependencies.calculateRealizedPnl,
      );

    const marginSucceeded =
      realizedSucceeded &&
      runPortfolioStage(
        "MARGIN_AND_COLLATERAL",
        this.dependencies.calculateMarginAndCollateral,
      );

    const exposureSucceeded =
      marginSucceeded &&
      runPortfolioStage(
        "EXPOSURE",
        this.dependencies.calculateExposure,
      );

    if (exposureSucceeded) {
      const record =
        stageRecords.get(
          "RECONCILIATION",
        );

      if (record === undefined) {
        throw new Error(
          "Reconciliation stage record is missing.",
        );
      }

      const result =
        executeStage(
          runId,
          mutableIssues.length,
          "RECONCILIATION",
          record,
          currentPortfolio,
          request.synchronizedAt,
          () =>
            this.dependencies.reconcilePortfolio({
              context,
              portfolio:
                currentPortfolio,
            }),
        );

      if (
        !result.succeeded ||
        result.value === null
      ) {
        if (result.issue !== null) {
          mutableIssues.push(
            result.issue,
          );
        }

        markRemainingStagesSkipped(
          stageRecords,
          "RECONCILIATION",
        );
      } else {
        try {
          validatePortfolioTransition(
            currentPortfolio,
            result.value.portfolio,
            this.policy,
          );

          validateReconciliationDecision(
            result.value.decision,
          );

          currentPortfolio =
            result.value.portfolio;

          reconciliation =
            Object.freeze({
              matched:
                result.value.decision.matched,

              criticalMismatch:
                result.value.decision.criticalMismatch,

              differenceCount:
                result.value.decision.differenceCount,

              warningCount:
                result.value.decision.warningCount,

              errorCount:
                result.value.decision.errorCount,

              criticalCount:
                result.value.decision.criticalCount,

              metadata:
                freezeMetadata(
                  result.value.decision.metadata,
                ),
            });

          if (!reconciliation.matched) {
            const severity:
              PortfolioSynchronizationIssueSeverity =
              reconciliation.criticalMismatch
                ? "CRITICAL"
                : "WARNING";

            mutableIssues.push(
              createIssue(
                runId,
                mutableIssues.length,
                {
                  code:
                    "RECONCILIATION_MISMATCH",

                  severity,

                  stage:
                    "RECONCILIATION",

                  message:
                    "Portfolio reconciliation reported differences.",

                  metadata: {
                    differenceCount:
                      reconciliation.differenceCount,

                    warningCount:
                      reconciliation.warningCount,

                    errorCount:
                      reconciliation.errorCount,

                    criticalCount:
                      reconciliation.criticalCount,
                  },
                },
              ),
            );

            record.issueCount += 1;
          }

          markStageCompleted(
            record,
            request.synchronizedAt,
            currentPortfolio.version,
            result.value.metadata,
          );

          if (
            !reconciliation.matched &&
            this.policy.failOnReconciliationMismatch
          ) {
            record.status =
              "FAILED";

            markRemainingStagesSkipped(
              stageRecords,
              "RECONCILIATION",
            );
          }
        } catch (cause) {
          markStageFailed(
            record,
            request.synchronizedAt,
          );

          mutableIssues.push(
            createIssue(
              runId,
              mutableIssues.length,
              {
                code:
                  "STAGE_RETURNED_INVALID_PORTFOLIO",

                severity:
                  "CRITICAL",

                stage:
                  "RECONCILIATION",

                message:
                  "Reconciliation returned an invalid result.",

                cause,
              },
            ),
          );

          markRemainingStagesSkipped(
            stageRecords,
            "RECONCILIATION",
          );
        }
      }
    }

    const reconciliationRecord =
      stageRecords.get(
        "RECONCILIATION",
      );

    if (
      reconciliationRecord !== undefined &&
      reconciliationRecord.status === "COMPLETED"
    ) {
      const record =
        stageRecords.get(
          "PUBLICATION",
        );

      if (record === undefined) {
        throw new Error(
          "Publication stage record is missing.",
        );
      }

      const result =
        executeStage(
          runId,
          mutableIssues.length,
          "PUBLICATION",
          record,
          currentPortfolio,
          request.synchronizedAt,
          () =>
            this.dependencies.publishPortfolio({
              context,
              portfolio:
                currentPortfolio,
            }),
        );

      if (
        !result.succeeded ||
        result.value === null
      ) {
        if (result.issue !== null) {
          mutableIssues.push(
            result.issue,
          );
        }
      } else {
        try {
          assertObject(
            result.value.publication,
            "publication",
          );

          normalizeIdentifier(
            result.value.publication.publicationId,
            "publication.publicationId",
          );

          validatePortfolio(
            result.value.publication.portfolio,
            "publication.portfolio",
          );

          assertNonNegativeFiniteNumber(
            result.value.publication.publishedAt,
            "publication.publishedAt",
          );

          assertPositiveInteger(
            result.value.publication.sequence,
            "publication.sequence",
          );

          if (
            result.value.publication.sequence !==
            request.sequence
          ) {
            throw new Error(
              "Publication sequence does not match the synchronization sequence.",
            );
          }

          if (
            result.value.publication.portfolio.identity.portfolioId !==
            portfolioId
          ) {
            throw new Error(
              "Publication portfolio identifier does not match the synchronized portfolio.",
            );
          }

          publication =
            Object.freeze({
              publicationId:
                result.value.publication.publicationId,

              portfolio:
                result.value.publication.portfolio,

              publishedAt:
                result.value.publication.publishedAt,

              sequence:
                result.value.publication.sequence,

              metadata:
                freezeMetadata(
                  result.value.publication.metadata,
                ),
            });

          currentPortfolio =
            publication.portfolio;

          markStageCompleted(
            record,
            publication.publishedAt,
            currentPortfolio.version,
            result.value.metadata,
          );
        } catch (cause) {
          markStageFailed(
            record,
            request.synchronizedAt,
          );

          mutableIssues.push(
            createIssue(
              runId,
              mutableIssues.length,
              {
                code:
                  "PUBLICATION_FAILURE",

                severity:
                  "CRITICAL",

                stage:
                  "PUBLICATION",

                message:
                  "Portfolio publication returned an invalid result.",

                cause,
              },
            ),
          );
        }
      }
    }

    const completedAt =
      publication?.publishedAt ??
      request.synchronizedAt;

    const issues =
      Object.freeze([
        ...mutableIssues,
      ]);

    const status =
      determineRunStatus(
        issues,
        this.policy,
      );

    return Object.freeze({
      runId,
      sequence:
        request.sequence,

      status,

      sourcePortfolio:
        request.portfolio,

      synchronizedPortfolio:
        status === "FAILED" &&
        publication === null
          ? null
          : currentPortfolio,

      publication,
      reconciliation,

      stages:
        freezeStageRecords(
          stageRecords,
        ),

      issues,

      startedAt:
        request.startedAt,

      completedAt,

      metadata:
        mergeMetadata(
          request.metadata,
          {
            portfolioId,
            sourceVersion:
              request.portfolio.version,

            synchronizedVersion:
              currentPortfolio.version,

            snapshotCount:
              request.snapshots.length,

            issueCount:
              issues.length,

            published:
              publication !== null,

            reconciled:
              reconciliation !== null,

            status,
          },
        ),
    });
  }
}

export function createPortfolioSynchronizationOrchestrator(
  dependencies: PortfolioSynchronizationDependencies,
  policy: PortfolioSynchronizationPolicy =
    createDefaultPortfolioSynchronizationPolicy(),
): DeterministicPortfolioSynchronizationOrchestrator {
  return new DeterministicPortfolioSynchronizationOrchestrator(
    dependencies,
    policy,
  );
}

export function createDefaultPortfolioSynchronizationPolicy():
PortfolioSynchronizationPolicy {
  return Object.freeze({
    failOnWarning: false,
    failOnReconciliationMismatch: true,

    allowEmptySnapshots: false,
    rejectStaleSnapshots: true,

    maximumSnapshotAge: 60_000,
    maximumFutureClockSkew: 5_000,

    requireVersionIncrease: false,
    requireUpdatedAtIncrease: false,
  });
}

export function findPortfolioSynchronizationStage(
  result: PortfolioSynchronizationResult,
  stage: PortfolioSynchronizationStage,
): PortfolioSynchronizationStageRecord | null {
  assertObject(
    result,
    "result",
  );

  return (
    result.stages.find(
      record =>
        record.stage === stage,
    ) ??
    null
  );
}

export function findPortfolioSynchronizationIssue(
  result: PortfolioSynchronizationResult,
  issueId: string,
): PortfolioSynchronizationIssue | null {
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

export function hasPortfolioSynchronizationFailed(
  result: PortfolioSynchronizationResult,
): boolean {
  assertObject(
    result,
    "result",
  );

  return result.status === "FAILED";
}

export function wasPortfolioPublished(
  result: PortfolioSynchronizationResult,
): boolean {
  assertObject(
    result,
    "result",
  );

  return result.publication !== null;
}