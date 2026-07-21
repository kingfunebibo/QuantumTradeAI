/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/institutional-arbitrage-orchestrator.ts
 *
 * Purpose:
 * Deterministic, immutable orchestration of institutional arbitrage discovery,
 * risk assessment, ranking, capital allocation, decisioning, execution
 * planning, signal publication, execution, and settlement verification.
 */

import {
  type ArbitrageCapitalAllocation,
  type ArbitrageDecision,
  type ArbitrageEvaluationResult,
  type ArbitrageExecutionPlan,
  type ArbitrageExecutionResult,
  type ArbitrageId,
  type ArbitrageRiskAssessment,
  type ArbitrageScanResult,
  type ArbitrageSettlementVerification,
  type ArbitrageSignal,
  type ArbitrageTimestamp,
  type ArbitrageVenueHealth,
  type InstitutionalArbitrageCapitalAllocator,
  type InstitutionalArbitrageClock,
  type InstitutionalArbitrageDecisionEngine,
  type InstitutionalArbitrageExecutionPlanner,
  type InstitutionalArbitrageExecutor,
  type InstitutionalArbitrageIdFactory,
  type InstitutionalArbitrageOpportunity,
  type InstitutionalArbitrageOpportunityRanker,
  type InstitutionalArbitrageOpportunitySource,
  type InstitutionalArbitrageOrchestratorRequest,
  type InstitutionalArbitrageOrchestratorResult,
  type InstitutionalArbitrageRiskEvaluator,
  type InstitutionalArbitrageSettlementVerifier,
} from "./institutional-arbitrage-contracts";
import {
  InstitutionalArbitrageValidationError,
  assertInstitutionalArbitrageOpportunity,
  assertInstitutionalArbitrageOrchestratorRequest,
  validateArbitrageCapitalAllocation,
  validateArbitrageDecision,
  validateArbitrageExecutionPlan,
  validateArbitrageExecutionResult,
  validateArbitrageRiskAssessment,
  validateArbitrageSettlementVerification,
  validateArbitrageSignal,
  type ArbitrageValidationIssue,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";
import { ArbitrageCapitalAllocationEngine } from "./arbitrage-capital-allocation-engine";
import { ArbitrageDecisionEngine } from "./arbitrage-decision-engine";
import { ArbitrageExecutionPlanner } from "./arbitrage-execution-planner";
import { ArbitrageOpportunityRankingEngine } from "./arbitrage-opportunity-ranking-engine";
import { ArbitrageRiskAssessmentEngine } from "./arbitrage-risk-assessment-engine";
import { ArbitrageSettlementVerifier } from "./arbitrage-settlement-verifier";
import { ArbitrageSignalPublisher } from "./arbitrage-signal-publisher";

export const INSTITUTIONAL_ARBITRAGE_ORCHESTRATOR_ERROR_CODES = [
  "INVALID_CONFIGURATION",
  "MISSING_OPPORTUNITY_SOURCE",
  "DUPLICATE_OPPORTUNITY_SOURCE",
  "DUPLICATE_OPPORTUNITY",
  "INCONSISTENT_OPPORTUNITY",
  "INVALID_STAGE_OUTPUT",
  "MISSING_ALLOCATION",
  "MISSING_OPPORTUNITY",
  "EXECUTION_FAILURE",
  "SETTLEMENT_FAILURE",
  "SIGNAL_PUBLICATION_FAILURE",
] as const;

export type InstitutionalArbitrageOrchestratorErrorCode =
  (typeof INSTITUTIONAL_ARBITRAGE_ORCHESTRATOR_ERROR_CODES)[number];

export class InstitutionalArbitrageOrchestratorError extends Error {
  public readonly code: InstitutionalArbitrageOrchestratorErrorCode;
  public readonly stage: string;
  public readonly details: Readonly<Record<string, unknown>>;
  public readonly causeValue?: unknown;

  public constructor(
    code: InstitutionalArbitrageOrchestratorErrorCode,
    stage: string,
    message: string,
    details: Readonly<Record<string, unknown>> = Object.freeze({}),
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "InstitutionalArbitrageOrchestratorError";
    this.code = code;
    this.stage = stage;
    this.details = Object.freeze({ ...details });
    this.causeValue = causeValue;
  }
}

export interface InstitutionalArbitrageOrchestratorObserver {
  onStageCompleted?(
    stage: InstitutionalArbitrageOrchestratorStage,
    completedAt: ArbitrageTimestamp,
    diagnostics: readonly string[],
  ): void | Promise<void>;
  onExecutionCompleted?(
    executionResult: ArbitrageExecutionResult,
  ): void | Promise<void>;
  onSettlementVerified?(
    verification: ArbitrageSettlementVerification,
  ): void | Promise<void>;
}

export const INSTITUTIONAL_ARBITRAGE_ORCHESTRATOR_STAGES = [
  "REQUEST_VALIDATION",
  "OPPORTUNITY_SCAN",
  "RISK_ASSESSMENT",
  "OPPORTUNITY_RANKING",
  "CAPITAL_ALLOCATION",
  "DECISION",
  "EXECUTION_PLANNING",
  "SIGNAL_PUBLICATION",
  "EXECUTION",
  "SETTLEMENT_VERIFICATION",
  "RESULT_VALIDATION",
] as const;

export type InstitutionalArbitrageOrchestratorStage =
  (typeof INSTITUTIONAL_ARBITRAGE_ORCHESTRATOR_STAGES)[number];

export interface InstitutionalArbitrageOrchestratorOptions {
  readonly opportunitySources: readonly InstitutionalArbitrageOpportunitySource[];
  readonly executor: InstitutionalArbitrageExecutor;
  readonly riskEvaluator?: InstitutionalArbitrageRiskEvaluator;
  readonly opportunityRanker?: InstitutionalArbitrageOpportunityRanker;
  readonly capitalAllocator?: InstitutionalArbitrageCapitalAllocator;
  readonly decisionEngine?: InstitutionalArbitrageDecisionEngine;
  readonly executionPlanner?: InstitutionalArbitrageExecutionPlanner;
  readonly settlementVerifier?: InstitutionalArbitrageSettlementVerifier;
  readonly signalPublisher?: ArbitrageSignalPublisher;
  readonly clock?: InstitutionalArbitrageClock;
  readonly idFactory?: InstitutionalArbitrageIdFactory;
  readonly observer?: InstitutionalArbitrageOrchestratorObserver;
  readonly validateEveryStage?: boolean;
  readonly continueAfterExecutionFailure?: boolean;
  readonly continueAfterSettlementFailure?: boolean;
  readonly continueAfterSignalPublicationFailure?: boolean;
}

interface ResolvedOptions {
  readonly opportunitySources: readonly InstitutionalArbitrageOpportunitySource[];
  readonly executor: InstitutionalArbitrageExecutor;
  readonly riskEvaluator: InstitutionalArbitrageRiskEvaluator;
  readonly opportunityRanker: InstitutionalArbitrageOpportunityRanker;
  readonly capitalAllocator: InstitutionalArbitrageCapitalAllocator;
  readonly decisionEngine: InstitutionalArbitrageDecisionEngine;
  readonly executionPlanner: InstitutionalArbitrageExecutionPlanner;
  readonly settlementVerifier: InstitutionalArbitrageSettlementVerifier;
  readonly signalPublisher: ArbitrageSignalPublisher;
  readonly clock?: InstitutionalArbitrageClock;
  readonly idFactory: InstitutionalArbitrageIdFactory;
  readonly observer?: InstitutionalArbitrageOrchestratorObserver;
  readonly validateEveryStage: boolean;
  readonly continueAfterExecutionFailure: boolean;
  readonly continueAfterSettlementFailure: boolean;
  readonly continueAfterSignalPublicationFailure: boolean;
}

interface StageTimeline {
  readonly requestValidatedAt: number;
  readonly scanStartedAt: number;
  readonly scanCompletedAt: number;
  readonly riskAssessedAt: number;
  readonly rankedAt: number;
  readonly allocatedAt: number;
  readonly decidedAt: number;
  readonly plannedAt: number;
  readonly signalsPublishedAt: number;
  readonly executedAt: number;
  readonly settlementsVerifiedAt: number;
  readonly completedAt: number;
}

interface ExecutionStageResult {
  readonly results: readonly ArbitrageExecutionResult[];
  readonly verifications: readonly ArbitrageSettlementVerification[];
  readonly diagnostics: readonly string[];
}

const STAGE_INCREMENT_MS = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  if (value instanceof Map) {
    for (const [key, entry] of value.entries()) {
      deepFreeze(key);
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }

  if (value instanceof Set) {
    for (const entry of value.values()) {
      deepFreeze(entry);
    }
    return Object.freeze(value);
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }

  return Object.freeze(value);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort((left, right) => left.localeCompare(right))
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableSerialize(
          (value as Record<string, unknown>)[key],
        )}`,
    )
    .join(",")}}`;
}

function hashDeterministically(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

class DeterministicArbitrageIdFactory
  implements InstitutionalArbitrageIdFactory
{
  public createId(
    namespace: string,
    components: readonly (
      | string
      | number
      | boolean
      | null
      | undefined
    )[],
  ): ArbitrageId {
    const payload = stableSerialize([namespace, ...components]);
    return `${namespace}-${hashDeterministically(payload)}`;
  }
}

function resolveOptions(
  options: InstitutionalArbitrageOrchestratorOptions,
): ResolvedOptions {
  if (!isRecord(options)) {
    throw new InstitutionalArbitrageOrchestratorError(
      "INVALID_CONFIGURATION",
      "CONSTRUCTION",
      "InstitutionalArbitrageOrchestrator options must be an object.",
    );
  }

  if (!Array.isArray(options.opportunitySources)) {
    throw new InstitutionalArbitrageOrchestratorError(
      "INVALID_CONFIGURATION",
      "CONSTRUCTION",
      "options.opportunitySources must be an array.",
    );
  }

  if (!isRecord(options.executor) || typeof options.executor.execute !== "function") {
    throw new InstitutionalArbitrageOrchestratorError(
      "INVALID_CONFIGURATION",
      "CONSTRUCTION",
      "options.executor must implement InstitutionalArbitrageExecutor.",
    );
  }

  const sourceTypes = new Set<string>();
  for (const source of options.opportunitySources) {
    if (!isRecord(source) || typeof source.scan !== "function") {
      throw new InstitutionalArbitrageOrchestratorError(
        "INVALID_CONFIGURATION",
        "CONSTRUCTION",
        "Every opportunity source must implement InstitutionalArbitrageOpportunitySource.",
      );
    }

    const typedSource = source as unknown as InstitutionalArbitrageOpportunitySource;
    if (sourceTypes.has(typedSource.type)) {
      throw new InstitutionalArbitrageOrchestratorError(
        "DUPLICATE_OPPORTUNITY_SOURCE",
        "CONSTRUCTION",
        `Duplicate opportunity source registered for ${typedSource.type}.`,
      );
    }
    sourceTypes.add(typedSource.type);
  }

  return deepFreeze({
    opportunitySources: [...options.opportunitySources].sort((left, right) =>
      left.type.localeCompare(right.type),
    ),
    executor: options.executor,
    riskEvaluator:
      options.riskEvaluator ?? new ArbitrageRiskAssessmentEngine(),
    opportunityRanker:
      options.opportunityRanker ?? new ArbitrageOpportunityRankingEngine(),
    capitalAllocator:
      options.capitalAllocator ?? new ArbitrageCapitalAllocationEngine(),
    decisionEngine: options.decisionEngine ?? new ArbitrageDecisionEngine(),
    executionPlanner:
      options.executionPlanner ?? new ArbitrageExecutionPlanner(),
    settlementVerifier:
      options.settlementVerifier ?? new ArbitrageSettlementVerifier(),
    signalPublisher: options.signalPublisher ?? new ArbitrageSignalPublisher(),
    clock: options.clock,
    idFactory: options.idFactory ?? new DeterministicArbitrageIdFactory(),
    observer: options.observer,
    validateEveryStage: options.validateEveryStage ?? true,
    continueAfterExecutionFailure:
      options.continueAfterExecutionFailure ?? false,
    continueAfterSettlementFailure:
      options.continueAfterSettlementFailure ?? false,
    continueAfterSignalPublicationFailure:
      options.continueAfterSignalPublicationFailure ?? false,
  });
}

function buildTimeline(
  request: InstitutionalArbitrageOrchestratorRequest,
  clock?: InstitutionalArbitrageClock,
): StageTimeline {
  const base = request.context.scanTimestamp;
  const externalNow = clock?.now();

  if (
    externalNow !== undefined &&
    (!Number.isSafeInteger(externalNow) || externalNow < 0)
  ) {
    throw new InstitutionalArbitrageOrchestratorError(
      "INVALID_CONFIGURATION",
      "REQUEST_VALIDATION",
      "The injected clock returned an invalid timestamp.",
      { externalNow },
    );
  }

  const start = externalNow === undefined ? base : Math.max(base, externalNow);
  const at = (offset: number): number => start + offset * STAGE_INCREMENT_MS;

  return Object.freeze({
    requestValidatedAt: at(0),
    scanStartedAt: at(1),
    scanCompletedAt: at(2),
    riskAssessedAt: at(3),
    rankedAt: at(4),
    allocatedAt: at(5),
    decidedAt: at(6),
    plannedAt: at(7),
    signalsPublishedAt: at(8),
    executedAt: at(9),
    settlementsVerifiedAt: at(10),
    completedAt: at(11),
  });
}

function assertValidation(
  result: ArbitrageValidationResult,
  stage: InstitutionalArbitrageOrchestratorStage,
  message: string,
): void {
  if (!result.valid) {
    throw new InstitutionalArbitrageValidationError(
      `${stage}: ${message}`,
      result.issues,
    );
  }
}

function withPath(
  issue: ArbitrageValidationIssue,
  prefix: string,
): ArbitrageValidationIssue {
  return Object.freeze({
    ...issue,
    path: `${prefix}.${issue.path}`,
  });
}

function validateCollection<T>(
  values: readonly T[],
  validator: (value: T) => ArbitrageValidationResult,
  stage: InstitutionalArbitrageOrchestratorStage,
  path: string,
): void {
  const issues = values.flatMap((value, index) =>
    validator(value).issues.map((issue) => withPath(issue, `${path}[${index}]`)),
  );

  if (issues.length > 0) {
    throw new InstitutionalArbitrageValidationError(
      `${stage}: invalid stage output.`,
      issues,
    );
  }
}

function healthyVenueIds(
  venueHealth: readonly ArbitrageVenueHealth[],
): ReadonlySet<string> {
  return new Set(
    venueHealth
      .filter(
        (health) =>
          health.available &&
          health.authenticated &&
          health.marketDataHealthy &&
          health.tradingHealthy &&
          health.depositHealthy &&
          health.withdrawalHealthy,
      )
      .map((health) => health.venueId),
  );
}

function opportunityVenueIds(
  opportunity: InstitutionalArbitrageOpportunity,
): readonly string[] {
  const ids = new Set<string>();
  opportunity.legs.forEach((leg) => ids.add(leg.venue.venueId));
  opportunity.transfers.forEach((transfer) => {
    ids.add(transfer.sourceVenue.venueId);
    ids.add(transfer.destinationVenue.venueId);
  });
  return Object.freeze([...ids].sort((left, right) => left.localeCompare(right)));
}

function cloneOpportunity(
  opportunity: InstitutionalArbitrageOpportunity,
): InstitutionalArbitrageOpportunity {
  return deepFreeze(structuredClone(opportunity));
}

function sortedOpportunities(
  opportunities: readonly InstitutionalArbitrageOpportunity[],
): readonly InstitutionalArbitrageOpportunity[] {
  return deepFreeze(
    [...opportunities]
      .sort((left, right) =>
        left.opportunityId.localeCompare(right.opportunityId),
      )
      .map(cloneOpportunity),
  );
}

function indexByOpportunityId<T extends { readonly opportunityId: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.opportunityId, value]));
}

function validateOrchestratorResult(
  result: InstitutionalArbitrageOrchestratorResult,
): void {
  const issues: ArbitrageValidationIssue[] = [];

  if (result.correlationId !== result.scanResult.context.correlationId) {
    issues.push({
      path: "result.correlationId",
      code: "INCONSISTENT",
      message: "Result correlationId must match scan context correlationId.",
    });
  }

  if (result.traceId !== result.scanResult.context.traceId) {
    issues.push({
      path: "result.traceId",
      code: "INCONSISTENT",
      message: "Result traceId must match scan context traceId.",
    });
  }

  if (result.evaluationResult.correlationId !== result.correlationId) {
    issues.push({
      path: "result.evaluationResult.correlationId",
      code: "INCONSISTENT",
      message: "Evaluation correlationId must match orchestrator result.",
    });
  }

  if (result.evaluationResult.traceId !== result.traceId) {
    issues.push({
      path: "result.evaluationResult.traceId",
      code: "INCONSISTENT",
      message: "Evaluation traceId must match orchestrator result.",
    });
  }

  if (result.completedAt < result.evaluationResult.evaluatedAt) {
    issues.push({
      path: "result.completedAt",
      code: "INVALID_ORDER",
      message: "Result completion cannot precede evaluation.",
    });
  }

  const decisionIds = new Set(
    result.evaluationResult.decisions.map((decision) => decision.decisionId),
  );
  const opportunityIds = new Set(
    result.scanResult.opportunities.map(
      (opportunity) => opportunity.opportunityId,
    ),
  );

  result.executionPlans.forEach((plan, index) => {
    if (!opportunityIds.has(plan.opportunityId)) {
      issues.push({
        path: `result.executionPlans[${index}].opportunityId`,
        code: "MISSING_DEPENDENCY",
        message: "Execution plan references an unknown opportunity.",
      });
    }
    if (!decisionIds.has(plan.decisionId)) {
      issues.push({
        path: `result.executionPlans[${index}].decisionId`,
        code: "MISSING_DEPENDENCY",
        message: "Execution plan references an unknown decision.",
      });
    }
  });

  result.publishedSignals.forEach((signal, index) => {
    if (!opportunityIds.has(signal.opportunityId)) {
      issues.push({
        path: `result.publishedSignals[${index}].opportunityId`,
        code: "MISSING_DEPENDENCY",
        message: "Published signal references an unknown opportunity.",
      });
    }
  });

  if (issues.length > 0) {
    throw new InstitutionalArbitrageValidationError(
      "Invalid institutional arbitrage orchestrator result.",
      Object.freeze(issues),
    );
  }
}

export class InstitutionalArbitrageOrchestrator {
  private readonly options: ResolvedOptions;

  public constructor(options: InstitutionalArbitrageOrchestratorOptions) {
    this.options = resolveOptions(options);
  }

  public async orchestrate(
    request: InstitutionalArbitrageOrchestratorRequest,
  ): Promise<InstitutionalArbitrageOrchestratorResult> {
    assertInstitutionalArbitrageOrchestratorRequest(request);
    const immutableRequest = deepFreeze(structuredClone(request));
    const timeline = buildTimeline(immutableRequest, this.options.clock);
    const diagnostics: string[] = [];

    await this.notify(
      "REQUEST_VALIDATION",
      timeline.requestValidatedAt,
      Object.freeze(["Institutional arbitrage request validated."]),
    );

    const scanResult = await this.scan(
      immutableRequest,
      timeline,
      diagnostics,
    );
    const riskAssessments = this.assessRisk(
      scanResult.opportunities,
      immutableRequest,
      timeline.riskAssessedAt,
    );
    const rankedOpportunities = this.options.opportunityRanker.rank(
      scanResult.opportunities,
      riskAssessments,
      timeline.rankedAt,
    );

    await this.notify(
      "OPPORTUNITY_RANKING",
      timeline.rankedAt,
      Object.freeze([
        `Ranked ${rankedOpportunities.length} opportunity candidate(s).`,
      ]),
    );

    const allocations = this.options.capitalAllocator.allocate(
      rankedOpportunities,
      immutableRequest.context,
      immutableRequest.configuration.evaluationPolicy,
      timeline.allocatedAt,
    );
    this.validateAllocations(allocations);

    await this.notify(
      "CAPITAL_ALLOCATION",
      timeline.allocatedAt,
      Object.freeze([
        `Created ${allocations.length} capital allocation(s).`,
      ]),
    );

    const decisions = this.options.decisionEngine.decide(
      rankedOpportunities,
      allocations,
      immutableRequest.configuration.evaluationPolicy,
      timeline.decidedAt,
    );
    this.validateDecisions(decisions);

    await this.notify(
      "DECISION",
      timeline.decidedAt,
      Object.freeze([`Created ${decisions.length} decision(s).`]),
    );

    const evaluationResult: ArbitrageEvaluationResult = deepFreeze({
      evaluationId: this.options.idFactory.createId("arb-evaluation", [
        immutableRequest.context.portfolioId,
        immutableRequest.context.sourceSequence,
        immutableRequest.context.correlationId,
        timeline.rankedAt,
      ]),
      rankedOpportunities: deepFreeze([...rankedOpportunities]),
      decisions: deepFreeze([...decisions]),
      evaluatedAt: timeline.decidedAt,
      correlationId: immutableRequest.context.correlationId,
      traceId: immutableRequest.context.traceId,
      diagnostics: deepFreeze([
        `${scanResult.opportunities.length} opportunity candidate(s) scanned.`,
        `${rankedOpportunities.length} opportunity candidate(s) ranked.`,
        `${allocations.length} capital allocation(s) created.`,
        `${decisions.length} decision(s) produced.`,
      ]),
    });

    const executionPlans = this.createExecutionPlans(
      scanResult.opportunities,
      decisions,
      allocations,
      timeline.plannedAt,
    );

    await this.notify(
      "EXECUTION_PLANNING",
      timeline.plannedAt,
      Object.freeze([
        `Created ${executionPlans.length} executable plan(s).`,
      ]),
    );

    const publishedSignals = await this.publishSignals(
      scanResult.opportunities,
      decisions,
      timeline.signalsPublishedAt,
      diagnostics,
    );

    const executionStage = await this.executeAndVerify(
      executionPlans,
      timeline,
    );
    diagnostics.push(...executionStage.diagnostics);

    const result: InstitutionalArbitrageOrchestratorResult = deepFreeze({
      scanResult,
      evaluationResult,
      executionPlans,
      publishedSignals,
      completedAt: timeline.completedAt,
      correlationId: immutableRequest.context.correlationId,
      traceId: immutableRequest.context.traceId,
      diagnostics: deepFreeze([
        ...diagnostics,
        `Execution completed for ${executionStage.results.length} plan(s).`,
        `Settlement verified for ${executionStage.verifications.length} execution result(s).`,
        "Institutional arbitrage orchestration completed deterministically.",
      ]),
    });

    if (this.options.validateEveryStage) {
      validateCollection(
        result.executionPlans,
        validateArbitrageExecutionPlan,
        "RESULT_VALIDATION",
        "result.executionPlans",
      );
      validateCollection(
        result.publishedSignals,
        validateArbitrageSignal,
        "RESULT_VALIDATION",
        "result.publishedSignals",
      );
      validateOrchestratorResult(result);
    }

    await this.notify(
      "RESULT_VALIDATION",
      timeline.completedAt,
      result.diagnostics,
    );

    return result;
  }

  public async run(
    request: InstitutionalArbitrageOrchestratorRequest,
  ): Promise<InstitutionalArbitrageOrchestratorResult> {
    return this.orchestrate(request);
  }

  private async scan(
    request: InstitutionalArbitrageOrchestratorRequest,
    timeline: StageTimeline,
    diagnostics: string[],
  ): Promise<ArbitrageScanResult> {
    const enabledTypes = new Set(request.context.enabledTypes);
    const sources = this.options.opportunitySources.filter((source) =>
      enabledTypes.has(source.type),
    );

    for (const type of request.context.enabledTypes) {
      if (!sources.some((source) => source.type === type)) {
        throw new InstitutionalArbitrageOrchestratorError(
          "MISSING_OPPORTUNITY_SOURCE",
          "OPPORTUNITY_SCAN",
          `No opportunity source is registered for enabled arbitrage type ${type}.`,
          { type },
        );
      }
    }

    const permittedVenueIds = new Set(request.context.venueIds);
    const healthyIds = healthyVenueIds(request.venueHealth);
    const eligibleSnapshots = request.marketSnapshots.filter(
      (snapshot) =>
        permittedVenueIds.has(snapshot.venue.venueId) &&
        healthyIds.has(snapshot.venue.venueId),
    );

    const collected: InstitutionalArbitrageOpportunity[] = [];
    for (const source of sources) {
      const scanned = await source.scan(request.context, eligibleSnapshots);
      if (!Array.isArray(scanned)) {
        throw new InstitutionalArbitrageOrchestratorError(
          "INVALID_STAGE_OUTPUT",
          "OPPORTUNITY_SCAN",
          `Opportunity source ${source.type} returned a non-array result.`,
        );
      }
      collected.push(...scanned);
    }

    const unique = new Map<string, InstitutionalArbitrageOpportunity>();
    let rejectedCandidateCount = 0;

    for (const opportunity of sortedOpportunities(collected)) {
      if (unique.has(opportunity.opportunityId)) {
        throw new InstitutionalArbitrageOrchestratorError(
          "DUPLICATE_OPPORTUNITY",
          "OPPORTUNITY_SCAN",
          `Duplicate opportunityId ${opportunity.opportunityId} was emitted.`,
        );
      }

      if (!enabledTypes.has(opportunity.type)) {
        throw new InstitutionalArbitrageOrchestratorError(
          "INCONSISTENT_OPPORTUNITY",
          "OPPORTUNITY_SCAN",
          `Source emitted disabled arbitrage type ${opportunity.type}.`,
          { opportunityId: opportunity.opportunityId },
        );
      }

      if (opportunity.portfolioId !== request.context.portfolioId) {
        throw new InstitutionalArbitrageOrchestratorError(
          "INCONSISTENT_OPPORTUNITY",
          "OPPORTUNITY_SCAN",
          `Opportunity ${opportunity.opportunityId} targets a different portfolio.`,
        );
      }

      const venuesAvailable = opportunityVenueIds(opportunity).every(
        (venueId) => permittedVenueIds.has(venueId) && healthyIds.has(venueId),
      );
      if (!venuesAvailable) {
        rejectedCandidateCount += 1;
        continue;
      }

      if (this.options.validateEveryStage) {
        assertInstitutionalArbitrageOpportunity(
          opportunity,
          timeline.scanCompletedAt,
        );
      }
      unique.set(opportunity.opportunityId, opportunity);
    }

    const opportunities = sortedOpportunities([...unique.values()]);
    const scanDiagnostics = deepFreeze([
      `${sources.length} opportunity source(s) executed in deterministic type order.`,
      `${eligibleSnapshots.length} of ${request.marketSnapshots.length} market snapshot(s) were eligible after venue-health filtering.`,
      `${opportunities.length} unique opportunity candidate(s) accepted.`,
      `${rejectedCandidateCount} candidate(s) rejected because required venues were unavailable.`,
    ]);
    diagnostics.push(...scanDiagnostics);

    const result: ArbitrageScanResult = deepFreeze({
      scanId: this.options.idFactory.createId("arb-scan", [
        request.context.portfolioId,
        request.context.sourceSequence,
        request.context.correlationId,
        timeline.scanStartedAt,
      ]),
      context: request.context,
      opportunities,
      startedAt: timeline.scanStartedAt,
      completedAt: timeline.scanCompletedAt,
      marketSnapshotsProcessed: eligibleSnapshots.length,
      rejectedCandidateCount,
      diagnostics: scanDiagnostics,
    });

    await this.notify(
      "OPPORTUNITY_SCAN",
      timeline.scanCompletedAt,
      scanDiagnostics,
    );
    return result;
  }

  private assessRisk(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    request: InstitutionalArbitrageOrchestratorRequest,
    assessedAt: number,
  ): ReadonlyMap<ArbitrageId, ArbitrageRiskAssessment> {
    const assessments = new Map<ArbitrageId, ArbitrageRiskAssessment>();

    for (const opportunity of opportunities) {
      const assessment = this.options.riskEvaluator.assess(
        opportunity,
        request.configuration.evaluationPolicy,
        assessedAt,
      );
      if (assessment.opportunityId !== opportunity.opportunityId) {
        throw new InstitutionalArbitrageOrchestratorError(
          "INVALID_STAGE_OUTPUT",
          "RISK_ASSESSMENT",
          `Risk assessment does not match opportunity ${opportunity.opportunityId}.`,
        );
      }
      if (this.options.validateEveryStage) {
        assertValidation(
          validateArbitrageRiskAssessment(assessment),
          "RISK_ASSESSMENT",
          `Invalid risk assessment for ${opportunity.opportunityId}.`,
        );
      }
      assessments.set(opportunity.opportunityId, deepFreeze(assessment));
    }

    void this.notify(
      "RISK_ASSESSMENT",
      assessedAt,
      Object.freeze([`Assessed risk for ${assessments.size} opportunity candidate(s).`]),
    );
    return assessments;
  }

  private validateAllocations(
    allocations: readonly ArbitrageCapitalAllocation[],
  ): void {
    if (!this.options.validateEveryStage) {
      return;
    }
    validateCollection(
      allocations,
      validateArbitrageCapitalAllocation,
      "CAPITAL_ALLOCATION",
      "allocations",
    );
  }

  private validateDecisions(decisions: readonly ArbitrageDecision[]): void {
    if (!this.options.validateEveryStage) {
      return;
    }
    validateCollection(
      decisions,
      validateArbitrageDecision,
      "DECISION",
      "decisions",
    );
  }

  private createExecutionPlans(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    decisions: readonly ArbitrageDecision[],
    allocations: readonly ArbitrageCapitalAllocation[],
    createdAt: number,
  ): readonly ArbitrageExecutionPlan[] {
    const opportunitiesById = indexByOpportunityId(opportunities);
    const allocationsById = indexByOpportunityId(allocations);
    const plans: ArbitrageExecutionPlan[] = [];

    for (const decision of [...decisions].sort((left, right) =>
      left.opportunityId.localeCompare(right.opportunityId),
    )) {
      if (decision.action !== "EXECUTE") {
        continue;
      }

      const opportunity = opportunitiesById.get(decision.opportunityId);
      if (opportunity === undefined) {
        throw new InstitutionalArbitrageOrchestratorError(
          "MISSING_OPPORTUNITY",
          "EXECUTION_PLANNING",
          `Missing opportunity for executable decision ${decision.decisionId}.`,
        );
      }

      const allocation = allocationsById.get(decision.opportunityId);
      if (allocation === undefined) {
        throw new InstitutionalArbitrageOrchestratorError(
          "MISSING_ALLOCATION",
          "EXECUTION_PLANNING",
          `Missing capital allocation for executable decision ${decision.decisionId}.`,
        );
      }

      const plan = this.options.executionPlanner.createPlan(
        opportunity,
        decision,
        allocation,
        createdAt,
      );
      if (this.options.validateEveryStage) {
        assertValidation(
          validateArbitrageExecutionPlan(plan),
          "EXECUTION_PLANNING",
          `Invalid execution plan ${plan.planId}.`,
        );
      }
      plans.push(deepFreeze(plan));
    }

    return deepFreeze(
      plans.sort((left, right) => left.planId.localeCompare(right.planId)),
    );
  }

  private async publishSignals(
    opportunities: readonly InstitutionalArbitrageOpportunity[],
    decisions: readonly ArbitrageDecision[],
    generatedAt: number,
    diagnostics: string[],
  ): Promise<readonly ArbitrageSignal[]> {
    const opportunitiesById = indexByOpportunityId(opportunities);
    const signals: ArbitrageSignal[] = [];

    for (const decision of [...decisions].sort((left, right) =>
      left.opportunityId.localeCompare(right.opportunityId),
    )) {
      if (decision.action !== "PUBLISH_SIGNAL") {
        continue;
      }

      const opportunity = opportunitiesById.get(decision.opportunityId);
      if (opportunity === undefined) {
        throw new InstitutionalArbitrageOrchestratorError(
          "MISSING_OPPORTUNITY",
          "SIGNAL_PUBLICATION",
          `Missing opportunity for signal decision ${decision.decisionId}.`,
        );
      }

      try {
        const publication = await this.options.signalPublisher.publish(
          opportunity,
          decision,
          generatedAt,
        );
        if (publication.signal === undefined) {
          throw new InstitutionalArbitrageOrchestratorError(
            "INVALID_STAGE_OUTPUT",
            "SIGNAL_PUBLICATION",
            `Signal publisher returned no signal for opportunity ${opportunity.opportunityId}.`,
          );
        }
        const signal = publication.signal;
        if (this.options.validateEveryStage) {
          assertValidation(
            validateArbitrageSignal(signal),
            "SIGNAL_PUBLICATION",
            `Invalid published signal ${signal.signalId}.`,
          );
        }
        signals.push(deepFreeze(signal));
        diagnostics.push(
          publication.published
            ? `Signal ${signal.signalId} was delivered to its configured sink.`
            : `Signal ${signal.signalId} was created without external sink delivery.`,
        );
      } catch (error: unknown) {
        if (!this.options.continueAfterSignalPublicationFailure) {
          throw new InstitutionalArbitrageOrchestratorError(
            "SIGNAL_PUBLICATION_FAILURE",
            "SIGNAL_PUBLICATION",
            `Signal publication failed for opportunity ${opportunity.opportunityId}.`,
            { opportunityId: opportunity.opportunityId },
            error,
          );
        }
        diagnostics.push(
          `Signal publication failed for opportunity ${opportunity.opportunityId}; orchestration continued by policy.`,
        );
      }
    }

    const immutableSignals = deepFreeze(
      signals.sort((left, right) => left.signalId.localeCompare(right.signalId)),
    );
    await this.notify(
      "SIGNAL_PUBLICATION",
      generatedAt,
      Object.freeze([`Created ${immutableSignals.length} signal(s).`]),
    );
    return immutableSignals;
  }

  private async executeAndVerify(
    plans: readonly ArbitrageExecutionPlan[],
    timeline: StageTimeline,
  ): Promise<ExecutionStageResult> {
    const results: ArbitrageExecutionResult[] = [];
    const verifications: ArbitrageSettlementVerification[] = [];
    const diagnostics: string[] = [];

    for (const plan of plans) {
      let executionResult: ArbitrageExecutionResult;
      try {
        executionResult = await this.options.executor.execute(plan);
        if (this.options.validateEveryStage) {
          assertValidation(
            validateArbitrageExecutionResult(executionResult),
            "EXECUTION",
            `Invalid execution result for plan ${plan.planId}.`,
          );
        }
        if (executionResult.planId !== plan.planId) {
          throw new InstitutionalArbitrageOrchestratorError(
            "INVALID_STAGE_OUTPUT",
            "EXECUTION",
            `Execution result planId does not match ${plan.planId}.`,
          );
        }
        executionResult = deepFreeze(executionResult);
        results.push(executionResult);
        await this.options.observer?.onExecutionCompleted?.(executionResult);
      } catch (error: unknown) {
        if (!this.options.continueAfterExecutionFailure) {
          throw new InstitutionalArbitrageOrchestratorError(
            "EXECUTION_FAILURE",
            "EXECUTION",
            `Execution failed for plan ${plan.planId}.`,
            { planId: plan.planId },
            error,
          );
        }
        diagnostics.push(
          `Execution failed for plan ${plan.planId}; orchestration continued by policy.`,
        );
        continue;
      }

      try {
        const verification = await this.options.settlementVerifier.verify(
          executionResult,
          timeline.settlementsVerifiedAt,
        );
        if (this.options.validateEveryStage) {
          assertValidation(
            validateArbitrageSettlementVerification(verification),
            "SETTLEMENT_VERIFICATION",
            `Invalid settlement verification for execution ${executionResult.executionId}.`,
          );
        }
        if (verification.executionId !== executionResult.executionId) {
          throw new InstitutionalArbitrageOrchestratorError(
            "INVALID_STAGE_OUTPUT",
            "SETTLEMENT_VERIFICATION",
            "Settlement verification references a different execution result.",
          );
        }
        const immutableVerification = deepFreeze(verification);
        verifications.push(immutableVerification);
        await this.options.observer?.onSettlementVerified?.(
          immutableVerification,
        );
      } catch (error: unknown) {
        if (!this.options.continueAfterSettlementFailure) {
          throw new InstitutionalArbitrageOrchestratorError(
            "SETTLEMENT_FAILURE",
            "SETTLEMENT_VERIFICATION",
            `Settlement verification failed for execution ${executionResult.executionId}.`,
            { executionId: executionResult.executionId },
            error,
          );
        }
        diagnostics.push(
          `Settlement verification failed for execution ${executionResult.executionId}; orchestration continued by policy.`,
        );
      }
    }

    await this.notify(
      "EXECUTION",
      timeline.executedAt,
      Object.freeze([`Executed ${results.length} plan(s).`]),
    );
    await this.notify(
      "SETTLEMENT_VERIFICATION",
      timeline.settlementsVerifiedAt,
      Object.freeze([
        `Verified settlement for ${verifications.length} execution result(s).`,
      ]),
    );

    return deepFreeze({ results, verifications, diagnostics });
  }

  private async notify(
    stage: InstitutionalArbitrageOrchestratorStage,
    completedAt: number,
    diagnostics: readonly string[],
  ): Promise<void> {
    await this.options.observer?.onStageCompleted?.(
      stage,
      completedAt,
      deepFreeze([...diagnostics]),
    );
  }
}

export function createInstitutionalArbitrageOrchestrator(
  options: InstitutionalArbitrageOrchestratorOptions,
): InstitutionalArbitrageOrchestrator {
  return new InstitutionalArbitrageOrchestrator(options);
}

export default InstitutionalArbitrageOrchestrator;