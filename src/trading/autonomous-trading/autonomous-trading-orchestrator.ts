/**
 * QuantumTradeAI
 * Milestone 31 — Autonomous AI Trading & Strategy Orchestration
 *
 * File 11: Autonomous trading orchestrator.
 *
 * Responsibilities:
 * - coordinate signal arbitration, consensus, trade approval, position sizing,
 *   and order-intent generation
 * - preserve deterministic correlation and request lineage
 * - stop safely on arbitration, consensus, approval, and sizing rejection
 * - convert pipeline exceptions into immutable failed orchestration results
 * - expose stage timings and explainable pipeline metadata
 */

import {
  EMPTY_AUTONOMOUS_TRADING_METADATA,
  type AutonomousConsensusDecision,
  type AutonomousConsensusRequest,
  type AutonomousOrchestrationRequest,
  type AutonomousOrchestrationResult,
  type AutonomousOrchestrationStage,
  type AutonomousOrderIntent,
  type AutonomousPositionSizingDecision,
  type AutonomousPositionSizingRequest,
  type AutonomousRiskContext,
  type AutonomousSignalArbitrationDecision,
  type AutonomousSignalArbitrationRequest,
  type AutonomousSignalCandidate,
  type AutonomousSignalArbitrationWeights,
  type AutonomousTradeApprovalDecision,
  type AutonomousTradeApprovalRequest,
  type AutonomousTradingClock,
  type AutonomousTradingIdFactory,
  type AutonomousTradingInstrument,
  type AutonomousTradingMetadata,
  type AutonomousTradingSignal,
  type AutonomousTradingTimestamp,
} from "./autonomous-trading-contracts";
import {
  AutonomousTradingContractValidator,
} from "./autonomous-trading-validator";
import {
  AutonomousSignalArbitrationEngine,
} from "./autonomous-signal-arbitration-engine";
import {
  AutonomousConsensusDecisionEngine,
} from "./autonomous-consensus-decision-engine";
import {
  AutonomousTradeApprovalEngine,
} from "./autonomous-trade-approval-engine";
import {
  AutonomousPositionSizingEngine,
} from "./autonomous-position-sizing-engine";
import {
  AutonomousOrderIntentFactory,
  type AutonomousOrderIntentFactoryRequest,
} from "./autonomous-order-intent-factory";

export interface AutonomousTradingOrchestratorContextProvider {
  buildArbitrationCandidates(
    request: AutonomousOrchestrationRequest,
  ): readonly AutonomousSignalCandidate[];

  resolveArbitrationInstrument(
    request: AutonomousOrchestrationRequest,
  ): AutonomousTradingInstrument;

  resolveArbitrationWeights(
    request: AutonomousOrchestrationRequest,
  ): AutonomousSignalArbitrationWeights;

  resolveMinimumWinningScore(
    request: AutonomousOrchestrationRequest,
  ): number;

  resolveMinimumScoreSeparation(
    request: AutonomousOrchestrationRequest,
  ): number;

  resolveMaximumCandidateAgeMs(
    request: AutonomousOrchestrationRequest,
  ): number;

  buildConsensusRequest(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    signal: AutonomousTradingSignal,
    requestedAt: AutonomousTradingTimestamp,
  ): AutonomousConsensusRequest;

  buildRiskContext(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousRiskContext;

  buildPositionSizingRequest(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    approval: AutonomousTradeApprovalDecision,
    signal: AutonomousTradingSignal,
    requestedAt: AutonomousTradingTimestamp,
  ): AutonomousPositionSizingRequest;

  buildOrderIntentRequest(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    approval: AutonomousTradeApprovalDecision,
    sizing: AutonomousPositionSizingDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousOrderIntentFactoryRequest;
}

export interface AutonomousTradingOrchestratorDependencies {
  readonly arbitrationEngine: AutonomousSignalArbitrationEngine;
  readonly consensusEngine: AutonomousConsensusDecisionEngine;
  readonly approvalEngine: AutonomousTradeApprovalEngine;
  readonly positionSizingEngine: AutonomousPositionSizingEngine;
  readonly orderIntentFactory: AutonomousOrderIntentFactory;
  readonly contextProvider: AutonomousTradingOrchestratorContextProvider;
}

export interface AutonomousTradingOrchestratorOptions {
  readonly maximumRequestAgeMs?: number;
  readonly rejectFutureRequests?: boolean;
  readonly rejectMixedInstruments?: boolean;
  readonly rejectMixedCorrelationIds?: boolean;
  readonly throwOnPipelineFailure?: boolean;
  readonly includeFailureStack?: boolean;
  readonly maximumRetainedResults?: number;
  readonly numericalTolerance?: number;
}

interface ResolvedAutonomousTradingOrchestratorOptions {
  readonly maximumRequestAgeMs: number;
  readonly rejectFutureRequests: boolean;
  readonly rejectMixedInstruments: boolean;
  readonly rejectMixedCorrelationIds: boolean;
  readonly throwOnPipelineFailure: boolean;
  readonly includeFailureStack: boolean;
  readonly maximumRetainedResults: number;
  readonly numericalTolerance: number;
}

interface PipelineState {
  arbitration?: AutonomousSignalArbitrationDecision;
  consensus?: AutonomousConsensusDecision;
  approval?: AutonomousTradeApprovalDecision;
  sizing?: AutonomousPositionSizingDecision;
  orderIntent?: AutonomousOrderIntent;
}

interface StageTiming {
  readonly stage: AutonomousOrchestrationStage;
  readonly startedAt: AutonomousTradingTimestamp;
  readonly completedAt: AutonomousTradingTimestamp;
  readonly latencyMs: number;
}

const DEFAULT_OPTIONS: Readonly<ResolvedAutonomousTradingOrchestratorOptions> =
  Object.freeze({
    maximumRequestAgeMs: 60_000,
    rejectFutureRequests: true,
    rejectMixedInstruments: true,
    rejectMixedCorrelationIds: true,
    throwOnPipelineFailure: false,
    includeFailureStack: false,
    maximumRetainedResults: 1_000,
    numericalTolerance: 1e-9,
  });

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function freezeMetadata(
  metadata: AutonomousTradingMetadata | undefined,
): AutonomousTradingMetadata {
  if (metadata === undefined) {
    return EMPTY_AUTONOMOUS_TRADING_METADATA;
  }

  const copy: Record<string, AutonomousTradingMetadata[string]> = {};
  for (const [key, value] of Object.entries(metadata)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(copy);
}

function freezeResult(
  result: AutonomousOrchestrationResult,
): AutonomousOrchestrationResult {
  return Object.freeze({
    ...result,
    metadata: freezeMetadata(result.metadata),
  });
}

function freezeTiming(timing: StageTiming): StageTiming {
  return Object.freeze({ ...timing });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown autonomous orchestration failure.";
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export class AutonomousTradingOrchestrator {
  private readonly clock: AutonomousTradingClock;
  private readonly idFactory: AutonomousTradingIdFactory;
  private readonly validator: AutonomousTradingContractValidator;
  private readonly dependencies: AutonomousTradingOrchestratorDependencies;
  private readonly options: ResolvedAutonomousTradingOrchestratorOptions;
  private readonly retainedResults: AutonomousOrchestrationResult[] = [];
  private orchestrationSequence = 0;

  public constructor(
    clock: AutonomousTradingClock,
    idFactory: AutonomousTradingIdFactory,
    dependencies: AutonomousTradingOrchestratorDependencies,
    validator = new AutonomousTradingContractValidator(),
    options: AutonomousTradingOrchestratorOptions = {},
  ) {
    if (!clock || typeof clock.now !== "function") {
      throw new TypeError("clock must implement now().");
    }
    if (!idFactory || typeof idFactory.create !== "function") {
      throw new TypeError("idFactory must implement create().");
    }

    this.assertDependencies(dependencies);

    const resolved: ResolvedAutonomousTradingOrchestratorOptions = {
      maximumRequestAgeMs:
        options.maximumRequestAgeMs ?? DEFAULT_OPTIONS.maximumRequestAgeMs,
      rejectFutureRequests:
        options.rejectFutureRequests ?? DEFAULT_OPTIONS.rejectFutureRequests,
      rejectMixedInstruments:
        options.rejectMixedInstruments ??
        DEFAULT_OPTIONS.rejectMixedInstruments,
      rejectMixedCorrelationIds:
        options.rejectMixedCorrelationIds ??
        DEFAULT_OPTIONS.rejectMixedCorrelationIds,
      throwOnPipelineFailure:
        options.throwOnPipelineFailure ??
        DEFAULT_OPTIONS.throwOnPipelineFailure,
      includeFailureStack:
        options.includeFailureStack ?? DEFAULT_OPTIONS.includeFailureStack,
      maximumRetainedResults:
        options.maximumRetainedResults ??
        DEFAULT_OPTIONS.maximumRetainedResults,
      numericalTolerance:
        options.numericalTolerance ?? DEFAULT_OPTIONS.numericalTolerance,
    };

    assertNonNegativeFinite(
      resolved.maximumRequestAgeMs,
      "maximumRequestAgeMs",
    );
    assertNonNegativeInteger(
      resolved.maximumRetainedResults,
      "maximumRetainedResults",
    );
    assertPositiveFinite(resolved.numericalTolerance, "numericalTolerance");

    this.clock = clock;
    this.idFactory = idFactory;
    this.dependencies = dependencies;
    this.validator = validator;
    this.options = Object.freeze(resolved);
  }

  public orchestrate(
    request: AutonomousOrchestrationRequest,
  ): AutonomousOrchestrationResult {
    const startedAt = this.clock.now();
    assertNonNegativeFinite(startedAt, "clock.now()");

    const orchestrationId = this.idFactory.create(
      "autonomous-orchestration",
      startedAt,
      this.orchestrationSequence++,
    );
    const timings: StageTiming[] = [];
    const state: PipelineState = {};

    try {
      this.measureStage("RECEIVED", timings, () => {
        const validation = this.validator.validateOrchestrationRequest(request);
        this.validator.assertValid(
          validation,
          "Autonomous orchestration request is invalid.",
        );
      });

      this.measureStage("VALIDATED", timings, () => {
        this.validateRequestSemantics(request, startedAt);
      });

      const arbitration = this.measureStage(
        "ARBITRATED",
        timings,
        () => this.runArbitration(request, startedAt),
      );
      state.arbitration = arbitration;

      if (
        arbitration.outcome !== "SELECTED" ||
        arbitration.selectedSignal === undefined
      ) {
        return this.complete(
          orchestrationId,
          request,
          "REJECTED",
          state,
          `Orchestration stopped during arbitration: ${arbitration.reason}`,
          startedAt,
          timings,
          {
            terminalStage: "ARBITRATED",
            arbitrationOutcome: arbitration.outcome,
          },
        );
      }

      const signal = arbitration.selectedSignal;

      const consensus = this.measureStage(
        "CONSENSUS",
        timings,
        () => this.runConsensus(request, arbitration, signal),
      );
      state.consensus = consensus;

      if (!consensus.approved) {
        return this.complete(
          orchestrationId,
          request,
          "REJECTED",
          state,
          `Orchestration stopped because consensus rejected the signal: ${consensus.reason}`,
          startedAt,
          timings,
          {
            terminalStage: "CONSENSUS",
            consensusApproved: false,
          },
        );
      }

      const approval = this.measureStage(
        "RISK_APPROVED",
        timings,
        () => this.runApproval(request, arbitration, consensus, signal),
      );
      state.approval = approval;

      if (
        approval.status !== "APPROVED" &&
        approval.status !== "REDUCED"
      ) {
        return this.complete(
          orchestrationId,
          request,
          "REJECTED",
          state,
          `Orchestration stopped during trade approval: ${approval.reason}`,
          startedAt,
          timings,
          {
            terminalStage: "RISK_APPROVED",
            approvalStatus: approval.status,
          },
        );
      }

      const sizing = this.measureStage(
        "SIZED",
        timings,
        () =>
          this.runPositionSizing(
            request,
            arbitration,
            consensus,
            approval,
            signal,
          ),
      );
      state.sizing = sizing;

      if (
        sizing.quantity <= this.options.numericalTolerance ||
        sizing.notional <= this.options.numericalTolerance
      ) {
        return this.complete(
          orchestrationId,
          request,
          "REJECTED",
          state,
          `Orchestration stopped because position sizing produced no executable quantity: ${sizing.reason}`,
          startedAt,
          timings,
          {
            terminalStage: "SIZED",
            sizingConstrained: sizing.constrained,
          },
        );
      }

      const orderIntent = this.measureStage(
        "ORDER_INTENT_CREATED",
        timings,
        () =>
          this.runOrderIntentCreation(
            request,
            arbitration,
            consensus,
            approval,
            sizing,
            signal,
          ),
      );
      state.orderIntent = orderIntent;

      return this.complete(
        orchestrationId,
        request,
        "ORDER_INTENT_CREATED",
        state,
        `Autonomous orchestration completed successfully with order intent ${orderIntent.intentId}.`,
        startedAt,
        timings,
        {
          terminalStage: "ORDER_INTENT_CREATED",
          selectedSignalId: signal.signalId,
          strategyId: signal.strategyId,
          orderIntentId: orderIntent.intentId,
        },
      );
    } catch (error) {
      if (this.options.throwOnPipelineFailure) {
        throw error;
      }

      const failureMetadata: Record<
        string,
        AutonomousTradingMetadata[string]
      > = {
        terminalStage: this.resolveLastCompletedStage(timings),
        errorName: errorName(error),
        errorMessage: errorMessage(error),
      };

      if (
        this.options.includeFailureStack &&
        error instanceof Error &&
        error.stack !== undefined
      ) {
        failureMetadata.errorStack = error.stack;
      }

      return this.complete(
        orchestrationId,
        request,
        "FAILED",
        state,
        `Autonomous orchestration failed: ${errorMessage(error)}`,
        startedAt,
        timings,
        failureMetadata,
      );
    }
  }

  public getRecentResults(): readonly AutonomousOrchestrationResult[] {
    return Object.freeze([...this.retainedResults]);
  }

  public getResult(
    orchestrationId: string,
  ): AutonomousOrchestrationResult | undefined {
    return this.retainedResults.find(
      (result) => result.orchestrationId === orchestrationId,
    );
  }

  public clearResults(): void {
    this.retainedResults.length = 0;
  }

  private runArbitration(
    request: AutonomousOrchestrationRequest,
    requestedAt: AutonomousTradingTimestamp,
  ): AutonomousSignalArbitrationDecision {
    const provider = this.dependencies.contextProvider;
    const arbitrationRequest: AutonomousSignalArbitrationRequest =
      Object.freeze({
        requestId: `${request.requestId}:arbitration`,
        correlationId: request.correlationId,
        instrument: provider.resolveArbitrationInstrument(request),
        candidates: Object.freeze([
          ...provider.buildArbitrationCandidates(request),
        ]),
        weights: Object.freeze({
          ...provider.resolveArbitrationWeights(request),
        }),
        minimumWinningScore:
          provider.resolveMinimumWinningScore(request),
        minimumScoreSeparation:
          provider.resolveMinimumScoreSeparation(request),
        maximumCandidateAgeMs:
          provider.resolveMaximumCandidateAgeMs(request),
        requestedAt,
        metadata: freezeMetadata({
          orchestrationRequestId: request.requestId,
          sourceSignalCount: request.signals.length,
          ...request.metadata,
        }),
      });

    return this.dependencies.arbitrationEngine.arbitrate(
      arbitrationRequest,
    );
  }

  private runConsensus(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousConsensusDecision {
    const consensusRequest =
      this.dependencies.contextProvider.buildConsensusRequest(
        request,
        arbitration,
        signal,
        this.clock.now(),
      );

    this.assertPipelineRequestIdentity(
      consensusRequest.correlationId,
      request.correlationId,
      "Consensus request",
    );

    if (consensusRequest.signal.signalId !== signal.signalId) {
      throw new Error(
        "Consensus request signal must match the arbitrated signal.",
      );
    }

    return this.dependencies.consensusEngine.decide(consensusRequest);
  }

  private runApproval(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousTradeApprovalDecision {
    const riskContext =
      this.dependencies.contextProvider.buildRiskContext(
        request,
        arbitration,
        consensus,
        signal,
      );

    const approvalRequest: AutonomousTradeApprovalRequest =
      Object.freeze({
        requestId: `${request.requestId}:approval`,
        correlationId: request.correlationId,
        signal,
        consensus,
        riskContext,
        requestedAt: this.clock.now(),
        metadata: freezeMetadata({
          orchestrationRequestId: request.requestId,
          arbitrationDecisionId: arbitration.decisionId,
          consensusDecisionId: consensus.decisionId,
          ...request.metadata,
        }),
      });

    return this.dependencies.approvalEngine.approve(approvalRequest);
  }

  private runPositionSizing(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    approval: AutonomousTradeApprovalDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousPositionSizingDecision {
    const sizingRequest =
      this.dependencies.contextProvider.buildPositionSizingRequest(
        request,
        arbitration,
        consensus,
        approval,
        signal,
        this.clock.now(),
      );

    this.assertPipelineRequestIdentity(
      sizingRequest.correlationId,
      request.correlationId,
      "Position sizing request",
    );

    if (sizingRequest.signal.signalId !== signal.signalId) {
      throw new Error(
        "Position sizing request signal must match the arbitrated signal.",
      );
    }

    if (sizingRequest.approval.decisionId !== approval.decisionId) {
      throw new Error(
        "Position sizing request approval must match the pipeline approval.",
      );
    }

    return this.dependencies.positionSizingEngine.size(sizingRequest);
  }

  private runOrderIntentCreation(
    request: AutonomousOrchestrationRequest,
    arbitration: AutonomousSignalArbitrationDecision,
    consensus: AutonomousConsensusDecision,
    approval: AutonomousTradeApprovalDecision,
    sizing: AutonomousPositionSizingDecision,
    signal: AutonomousTradingSignal,
  ): AutonomousOrderIntent {
    const factoryRequest =
      this.dependencies.contextProvider.buildOrderIntentRequest(
        request,
        arbitration,
        consensus,
        approval,
        sizing,
        signal,
      );

    this.assertPipelineRequestIdentity(
      factoryRequest.correlationId,
      request.correlationId,
      "Order intent factory request",
    );

    if (factoryRequest.signal.signalId !== signal.signalId) {
      throw new Error(
        "Order intent factory request signal must match the arbitrated signal.",
      );
    }

    if (factoryRequest.approval.decisionId !== approval.decisionId) {
      throw new Error(
        "Order intent factory request approval must match the pipeline approval.",
      );
    }

    if (factoryRequest.sizing.decisionId !== sizing.decisionId) {
      throw new Error(
        "Order intent factory request sizing must match the pipeline sizing decision.",
      );
    }

    return this.dependencies.orderIntentFactory.create(factoryRequest);
  }

  private validateRequestSemantics(
    request: AutonomousOrchestrationRequest,
    startedAt: AutonomousTradingTimestamp,
  ): void {
    const age = startedAt - request.requestedAt;

    if (age < 0 && this.options.rejectFutureRequests) {
      throw new Error(
        "Orchestration request timestamp cannot be in the future.",
      );
    }

    if (age > this.options.maximumRequestAgeMs) {
      throw new Error(
        `Orchestration request is stale by ${age.toFixed(0)}ms.`,
      );
    }

    if (request.signals.length === 0) {
      throw new Error(
        "Orchestration request must contain at least one signal.",
      );
    }

    if (this.options.rejectMixedCorrelationIds) {
      for (const signal of request.signals) {
        const signalCorrelationId = signal.metadata.correlationId;
        if (
          typeof signalCorrelationId === "string" &&
          signalCorrelationId !== request.correlationId
        ) {
          throw new Error(
            `Signal ${signal.signalId} has a mismatched correlationId.`,
          );
        }
      }
    }

    if (this.options.rejectMixedInstruments) {
      const firstInstrument = request.signals[0].instrument;
      for (const signal of request.signals.slice(1)) {
        if (
          !this.instrumentsMatch(
            firstInstrument,
            signal.instrument,
          )
        ) {
          throw new Error(
            "Orchestration request cannot mix signals for different instruments.",
          );
        }
      }
    }
  }

  private complete(
    orchestrationId: string,
    request: AutonomousOrchestrationRequest,
    stage: AutonomousOrchestrationStage,
    state: PipelineState,
    reason: string,
    startedAt: AutonomousTradingTimestamp,
    timings: readonly StageTiming[],
    additionalMetadata: Readonly<
      Record<string, AutonomousTradingMetadata[string]>
    >,
  ): AutonomousOrchestrationResult {
    const completedAt = this.clock.now();
    assertNonNegativeFinite(completedAt, "clock.now()");

    const latencyMs = Math.max(0, completedAt - startedAt);
    const timingMetadata = timings.map(
      (timing) =>
        `${timing.stage}:${timing.latencyMs.toFixed(3)}`,
    );

    const result = freezeResult({
      orchestrationId,
      requestId: request.requestId,
      correlationId: request.correlationId,
      stage,
      arbitration: state.arbitration,
      consensus: state.consensus,
      approval: state.approval,
      sizing: state.sizing,
      orderIntent: state.orderIntent,
      reason,
      startedAt,
      completedAt,
      latencyMs,
      metadata: freezeMetadata({
        sourceSignalCount: request.signals.length,
        portfolioSnapshotId: request.portfolio.snapshotId,
        stageTimingCount: timings.length,
        stageTimings: Object.freeze(timingMetadata),
        ...request.metadata,
        ...additionalMetadata,
      }),
    });

    const validation = this.validator.validateOrchestrationResult(result);
    this.validator.assertValid(
      validation,
      "Generated autonomous orchestration result is invalid.",
    );

    this.retainResult(result);
    return result;
  }

  private measureStage<T>(
    stage: AutonomousOrchestrationStage,
    timings: StageTiming[],
    operation: () => T,
  ): T {
    const stageStartedAt = this.clock.now();
    assertNonNegativeFinite(stageStartedAt, "clock.now()");

    try {
      return operation();
    } finally {
      const stageCompletedAt = this.clock.now();
      assertNonNegativeFinite(stageCompletedAt, "clock.now()");

      timings.push(
        freezeTiming({
          stage,
          startedAt: stageStartedAt,
          completedAt: stageCompletedAt,
          latencyMs: Math.max(
            0,
            stageCompletedAt - stageStartedAt,
          ),
        }),
      );
    }
  }

  private retainResult(result: AutonomousOrchestrationResult): void {
    if (this.options.maximumRetainedResults === 0) {
      return;
    }

    this.retainedResults.push(result);

    while (
      this.retainedResults.length >
      this.options.maximumRetainedResults
    ) {
      this.retainedResults.shift();
    }
  }

  private resolveLastCompletedStage(
    timings: readonly StageTiming[],
  ): AutonomousOrchestrationStage {
    return timings.length === 0
      ? "RECEIVED"
      : timings[timings.length - 1].stage;
  }

  private assertPipelineRequestIdentity(
    actualCorrelationId: string,
    expectedCorrelationId: string,
    label: string,
  ): void {
    if (actualCorrelationId !== expectedCorrelationId) {
      throw new Error(
        `${label} correlationId must match the orchestration request.`,
      );
    }
  }

  private instrumentsMatch(
    left: AutonomousTradingInstrument,
    right: AutonomousTradingInstrument,
  ): boolean {
    return (
      left.exchangeId === right.exchangeId &&
      left.normalizedSymbol === right.normalizedSymbol &&
      left.marketType === right.marketType
    );
  }

  private assertDependencies(
    dependencies: AutonomousTradingOrchestratorDependencies,
  ): void {
    if (!dependencies || typeof dependencies !== "object") {
      throw new TypeError("dependencies must be an object.");
    }

    if (
      !dependencies.arbitrationEngine ||
      typeof dependencies.arbitrationEngine.arbitrate !== "function"
    ) {
      throw new TypeError(
        "dependencies.arbitrationEngine must implement arbitrate().",
      );
    }

    if (
      !dependencies.consensusEngine ||
      typeof dependencies.consensusEngine.decide !== "function"
    ) {
      throw new TypeError(
        "dependencies.consensusEngine must implement decide().",
      );
    }

    if (
      !dependencies.approvalEngine ||
      typeof dependencies.approvalEngine.approve !== "function"
    ) {
      throw new TypeError(
        "dependencies.approvalEngine must implement approve().",
      );
    }

    if (
      !dependencies.positionSizingEngine ||
      typeof dependencies.positionSizingEngine.size !== "function"
    ) {
      throw new TypeError(
        "dependencies.positionSizingEngine must implement size().",
      );
    }

    if (
      !dependencies.orderIntentFactory ||
      typeof dependencies.orderIntentFactory.create !== "function"
    ) {
      throw new TypeError(
        "dependencies.orderIntentFactory must implement create().",
      );
    }

    const provider = dependencies.contextProvider;
    if (!provider || typeof provider !== "object") {
      throw new TypeError(
        "dependencies.contextProvider must be an object.",
      );
    }

    const requiredMethods: readonly (
      keyof AutonomousTradingOrchestratorContextProvider
    )[] = Object.freeze([
      "buildArbitrationCandidates",
      "resolveArbitrationInstrument",
      "resolveArbitrationWeights",
      "resolveMinimumWinningScore",
      "resolveMinimumScoreSeparation",
      "resolveMaximumCandidateAgeMs",
      "buildConsensusRequest",
      "buildRiskContext",
      "buildPositionSizingRequest",
      "buildOrderIntentRequest",
    ]);

    for (const method of requiredMethods) {
      if (typeof provider[method] !== "function") {
        throw new TypeError(
          `dependencies.contextProvider must implement ${String(method)}().`,
        );
      }
    }
  }
}

export function createAutonomousTradingOrchestrator(
  clock: AutonomousTradingClock,
  idFactory: AutonomousTradingIdFactory,
  dependencies: AutonomousTradingOrchestratorDependencies,
  validator = new AutonomousTradingContractValidator(),
  options: AutonomousTradingOrchestratorOptions = {},
): AutonomousTradingOrchestrator {
  return new AutonomousTradingOrchestrator(
    clock,
    idFactory,
    dependencies,
    validator,
    options,
  );
}