import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  CrossChainBridgeQuoteAggregationRequest,
  CrossChainBridgeQuoteAggregationResult,
  DeterministicCrossChainBridgeQuoteAggregator,
} from "./bridge-quote-aggregator";
import type {
  CrossChainArbitrageDetectionRequest,
  CrossChainArbitrageDetectionResult,
  DeterministicCrossChainArbitrageOpportunityDetector,
} from "./cross-chain-opportunity-detector";
import type {
  CrossChainExecutionPlan,
  CrossChainExecutionPlanBuildRequest,
  DeterministicCrossChainExecutionPlanBuilder,
} from "./cross-chain-execution-plan-builder";
import {
  DeterministicCrossChainExecutionStateMachine,
  type CrossChainExecutionRuntime,
  type CrossChainExecutionRuntimeSnapshot,
} from "./cross-chain-execution-state-machine";
import type {
  CrossChainSettlementVerificationRequest,
  CrossChainSettlementVerificationResult,
  DeterministicCrossChainSettlementVerifier,
} from "./cross-chain-settlement-verifier";
import type {
  CrossChainRecoveryPlan,
  CrossChainRecoveryPlanningRequest,
  DeterministicCrossChainRecoveryPlanner,
} from "./cross-chain-recovery-planner";

export type CrossChainArbitrageEngineSessionStatus =
  | "CREATED"
  | "QUOTES_AGGREGATED"
  | "OPPORTUNITIES_DETECTED"
  | "PLAN_BUILT"
  | "EXECUTION_ACTIVE"
  | "EXECUTION_COMPLETED"
  | "SETTLEMENT_VERIFIED"
  | "RECOVERY_REQUIRED"
  | "CLOSED";

export interface CrossChainArbitrageEngineSession {
  readonly sessionId: CrossChainIdentifier;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status:
    CrossChainArbitrageEngineSessionStatus;
  readonly quoteAggregation:
    CrossChainBridgeQuoteAggregationResult | null;
  readonly opportunityDetection:
    CrossChainArbitrageDetectionResult | null;
  readonly executionPlan:
    CrossChainExecutionPlan | null;
  readonly executionRuntime:
    CrossChainExecutionRuntime | null;
  readonly settlement:
    CrossChainSettlementVerificationResult | null;
  readonly recoveryPlan:
    CrossChainRecoveryPlan | null;
  readonly version: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainArbitrageEngineSnapshot {
  readonly session:
    CrossChainArbitrageEngineSession;
  readonly executionRuntimeSnapshot:
    CrossChainExecutionRuntimeSnapshot | null;
}

export interface CrossChainArbitrageEngineOptions {
  readonly quoteAggregator:
    DeterministicCrossChainBridgeQuoteAggregator;
  readonly opportunityDetector:
    DeterministicCrossChainArbitrageOpportunityDetector;
  readonly executionPlanBuilder:
    DeterministicCrossChainExecutionPlanBuilder;
  readonly settlementVerifier:
    DeterministicCrossChainSettlementVerifier;
  readonly recoveryPlanner:
    DeterministicCrossChainRecoveryPlanner;
  readonly sessionIdFactory?: (
    createdAt: number,
  ) => CrossChainIdentifier;
}

export interface CreateCrossChainArbitrageSessionRequest {
  readonly createdAt: number;
  readonly sessionId?: CrossChainIdentifier;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class CrossChainArbitrageEngineError
  extends Error {
  public readonly code: string;
  public readonly referenceId:
    CrossChainIdentifier | null;

  public constructor(
    code: string,
    message: string,
    referenceId: CrossChainIdentifier | null = null,
  ) {
    super(message);

    this.name = "CrossChainArbitrageEngineError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeRecord(
  value:
    Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(value ?? {}),
  });
}

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new CrossChainArbitrageEngineError(
      "INVALID_IDENTIFIER",
      `${fieldName} must not be empty.`,
      value,
    );
  }
}

function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CrossChainArbitrageEngineError(
      "INVALID_TIMESTAMP",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function freezeSession(
  session: CrossChainArbitrageEngineSession,
): CrossChainArbitrageEngineSession {
  return Object.freeze({
    ...session,
    metadata: freezeRecord(session.metadata),
  });
}

export class DeterministicCrossChainArbitrageEngine {
  private readonly quoteAggregator:
    DeterministicCrossChainBridgeQuoteAggregator;

  private readonly opportunityDetector:
    DeterministicCrossChainArbitrageOpportunityDetector;

  private readonly executionPlanBuilder:
    DeterministicCrossChainExecutionPlanBuilder;

  private readonly settlementVerifier:
    DeterministicCrossChainSettlementVerifier;

  private readonly recoveryPlanner:
    DeterministicCrossChainRecoveryPlanner;

  private readonly sessionIdFactory: (
    createdAt: number,
  ) => CrossChainIdentifier;

  private sessionValue:
    CrossChainArbitrageEngineSession | null = null;

  private executionStateMachine:
    DeterministicCrossChainExecutionStateMachine | null =
      null;

  public constructor(
    options: CrossChainArbitrageEngineOptions,
  ) {
    this.quoteAggregator =
      options.quoteAggregator;
    this.opportunityDetector =
      options.opportunityDetector;
    this.executionPlanBuilder =
      options.executionPlanBuilder;
    this.settlementVerifier =
      options.settlementVerifier;
    this.recoveryPlanner =
      options.recoveryPlanner;
    this.sessionIdFactory =
      options.sessionIdFactory ??
      ((createdAt) =>
        [
          "cross-chain-session",
          createdAt.toString(),
        ].join(":"));
  }

  public get session():
    CrossChainArbitrageEngineSession | null {
    return this.sessionValue;
  }

  public createSession(
    request: CreateCrossChainArbitrageSessionRequest,
  ): CrossChainArbitrageEngineSession {
    assertNonNegativeInteger(
      request.createdAt,
      "request.createdAt",
    );

    const sessionId =
      request.sessionId ??
      this.sessionIdFactory(request.createdAt);

    assertNonEmptyString(
      sessionId,
      "sessionId",
    );

    this.executionStateMachine = null;

    this.sessionValue = freezeSession({
      sessionId,
      createdAt: request.createdAt,
      updatedAt: request.createdAt,
      status: "CREATED",
      quoteAggregation: null,
      opportunityDetection: null,
      executionPlan: null,
      executionRuntime: null,
      settlement: null,
      recoveryPlan: null,
      version: 0,
      metadata: freezeRecord(request.metadata),
    });

    return this.sessionValue;
  }

  public aggregateQuotes(
    request: CrossChainBridgeQuoteAggregationRequest,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();
    this.assertSessionMutable(session);

    const result =
      this.quoteAggregator.aggregate(request);

    this.assertMonotonicTimestamp(
      result.generatedAt,
      session.updatedAt,
      "quoteAggregation.generatedAt",
    );

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: result.generatedAt,
      status: "QUOTES_AGGREGATED",
      quoteAggregation: result,
      opportunityDetection: null,
      executionPlan: null,
      executionRuntime: null,
      settlement: null,
      recoveryPlan: null,
      version: session.version + 1,
    });

    this.executionStateMachine = null;

    return this.sessionValue;
  }

  public detectOpportunities(
    request: Omit<
      CrossChainArbitrageDetectionRequest,
      "aggregation"
    >,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();

    if (session.quoteAggregation === null) {
      throw new CrossChainArbitrageEngineError(
        "QUOTE_AGGREGATION_REQUIRED",
        "Quotes must be aggregated before opportunity detection.",
        session.sessionId,
      );
    }

    this.assertSessionMutable(session);

    const result =
      this.opportunityDetector.detect({
        ...request,
        aggregation:
          session.quoteAggregation,
      });

    this.assertMonotonicTimestamp(
      result.generatedAt,
      session.updatedAt,
      "opportunityDetection.generatedAt",
    );

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: result.generatedAt,
      status: "OPPORTUNITIES_DETECTED",
      opportunityDetection: result,
      executionPlan: null,
      executionRuntime: null,
      settlement: null,
      recoveryPlan: null,
      version: session.version + 1,
    });

    this.executionStateMachine = null;

    return this.sessionValue;
  }

  public buildExecutionPlan(
    request: Omit<
      CrossChainExecutionPlanBuildRequest,
      "opportunity"
    > & {
      readonly opportunityId?: CrossChainIdentifier;
    },
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();

    if (
      session.opportunityDetection === null
    ) {
      throw new CrossChainArbitrageEngineError(
        "OPPORTUNITY_DETECTION_REQUIRED",
        "Opportunities must be detected before building an execution plan.",
        session.sessionId,
      );
    }

    this.assertSessionMutable(session);

    const opportunity =
      request.opportunityId === undefined
        ? session.opportunityDetection
            .bestOpportunity
        : session.opportunityDetection
            .opportunities.find(
              (candidate) =>
                candidate.opportunityId ===
                request.opportunityId,
            ) ?? null;

    if (opportunity === null) {
      throw new CrossChainArbitrageEngineError(
        "OPPORTUNITY_NOT_FOUND",
        "No matching actionable opportunity is available.",
        request.opportunityId ?? null,
      );
    }

    const plan =
      this.executionPlanBuilder.build({
        ...request,
        opportunity,
      });

    this.assertMonotonicTimestamp(
      plan.createdAt,
      session.updatedAt,
      "executionPlan.createdAt",
    );

    this.executionStateMachine =
      new DeterministicCrossChainExecutionStateMachine(
        plan,
      );

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: plan.createdAt,
      status: "PLAN_BUILT",
      executionPlan: plan,
      executionRuntime:
        this.executionStateMachine.runtime,
      settlement: null,
      recoveryPlan: null,
      version: session.version + 1,
    });

    return this.sessionValue;
  }

  public updateExecutionRuntime(
    updatedAt: number,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();
    const machine =
      this.requireExecutionStateMachine();

    assertNonNegativeInteger(
      updatedAt,
      "updatedAt",
    );

    this.assertMonotonicTimestamp(
      updatedAt,
      session.updatedAt,
      "updatedAt",
    );

    const runtime = machine.runtime;

    const status:
      CrossChainArbitrageEngineSessionStatus =
      runtime.status === "COMPLETED"
        ? "EXECUTION_COMPLETED"
        : runtime.status === "FAILED" ||
            runtime.status === "EXPIRED" ||
            runtime.status === "CANCELLED"
          ? "RECOVERY_REQUIRED"
          : "EXECUTION_ACTIVE";

    this.sessionValue = freezeSession({
      ...session,
      updatedAt,
      status,
      executionRuntime: runtime,
      version: session.version + 1,
    });

    return this.sessionValue;
  }

  public executionMachine():
    DeterministicCrossChainExecutionStateMachine {
    return this.requireExecutionStateMachine();
  }

  public verifySettlement(
    request: Omit<
      CrossChainSettlementVerificationRequest,
      "runtime"
    >,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();
    const machine =
      this.requireExecutionStateMachine();

    const result =
      this.settlementVerifier.verify({
        ...request,
        runtime: machine.runtime,
      });

    this.assertMonotonicTimestamp(
      result.verifiedAt,
      session.updatedAt,
      "settlement.verifiedAt",
    );

    const status:
      CrossChainArbitrageEngineSessionStatus =
      result.status === "VERIFIED"
        ? "SETTLEMENT_VERIFIED"
        : "RECOVERY_REQUIRED";

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: result.verifiedAt,
      status,
      executionRuntime: machine.runtime,
      settlement: result,
      recoveryPlan: null,
      version: session.version + 1,
    });

    return this.sessionValue;
  }

  public planRecovery(
    request: Omit<
      CrossChainRecoveryPlanningRequest,
      "runtime" | "settlement"
    >,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();
    const machine =
      this.requireExecutionStateMachine();

    const recoveryPlan =
      this.recoveryPlanner.plan({
        ...request,
        runtime: machine.runtime,
        settlement: session.settlement,
      });

    this.assertMonotonicTimestamp(
      recoveryPlan.createdAt,
      session.updatedAt,
      "recoveryPlan.createdAt",
    );

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: recoveryPlan.createdAt,
      status:
        recoveryPlan.status === "NOT_REQUIRED"
          ? "SETTLEMENT_VERIFIED"
          : "RECOVERY_REQUIRED",
      executionRuntime: machine.runtime,
      recoveryPlan,
      version: session.version + 1,
    });

    return this.sessionValue;
  }

  public close(
    closedAt: number,
  ): CrossChainArbitrageEngineSession {
    const session = this.requireSession();

    assertNonNegativeInteger(
      closedAt,
      "closedAt",
    );

    this.assertMonotonicTimestamp(
      closedAt,
      session.updatedAt,
      "closedAt",
    );

    this.sessionValue = freezeSession({
      ...session,
      updatedAt: closedAt,
      status: "CLOSED",
      executionRuntime:
        this.executionStateMachine?.runtime ??
        session.executionRuntime,
      version: session.version + 1,
    });

    return this.sessionValue;
  }

  public snapshot():
    CrossChainArbitrageEngineSnapshot {
    const session = this.requireSession();

    return Object.freeze({
      session,
      executionRuntimeSnapshot:
        this.executionStateMachine?.snapshot() ??
        null,
    });
  }

  public restore(
    snapshot: CrossChainArbitrageEngineSnapshot,
  ): CrossChainArbitrageEngineSession {
    this.validateSession(snapshot.session);

    if (
      snapshot.executionRuntimeSnapshot ===
      null
    ) {
      this.executionStateMachine = null;
    } else {
      if (
        snapshot.session.executionPlan === null
      ) {
        throw new CrossChainArbitrageEngineError(
          "MISSING_EXECUTION_PLAN",
          "Snapshot contains execution runtime state without an execution plan.",
          snapshot.session.sessionId,
        );
      }

      const machine =
        new DeterministicCrossChainExecutionStateMachine(
          snapshot.session.executionPlan,
        );

      machine.restore(
        snapshot.executionRuntimeSnapshot,
      );

      this.executionStateMachine = machine;
    }

    this.sessionValue =
      freezeSession(snapshot.session);

    return this.sessionValue;
  }

  private requireSession():
    CrossChainArbitrageEngineSession {
    if (this.sessionValue === null) {
      throw new CrossChainArbitrageEngineError(
        "SESSION_NOT_CREATED",
        "A cross-chain arbitrage engine session has not been created.",
      );
    }

    return this.sessionValue;
  }

  private requireExecutionStateMachine():
    DeterministicCrossChainExecutionStateMachine {
    if (this.executionStateMachine === null) {
      throw new CrossChainArbitrageEngineError(
        "EXECUTION_STATE_MACHINE_NOT_CREATED",
        "An execution plan must be built before accessing execution state.",
        this.sessionValue?.sessionId ?? null,
      );
    }

    return this.executionStateMachine;
  }

  private assertSessionMutable(
    session: CrossChainArbitrageEngineSession,
  ): void {
    if (session.status === "CLOSED") {
      throw new CrossChainArbitrageEngineError(
        "SESSION_CLOSED",
        "The cross-chain arbitrage engine session is closed.",
        session.sessionId,
      );
    }
  }

  private assertMonotonicTimestamp(
    value: number,
    previousValue: number,
    fieldName: string,
  ): void {
    assertNonNegativeInteger(
      value,
      fieldName,
    );

    if (value < previousValue) {
      throw new CrossChainArbitrageEngineError(
        "NON_MONOTONIC_TIMESTAMP",
        `${fieldName} must not be earlier than the session updatedAt timestamp.`,
        this.sessionValue?.sessionId ?? null,
      );
    }
  }

  private validateSession(
    session: CrossChainArbitrageEngineSession,
  ): void {
    assertNonEmptyString(
      session.sessionId,
      "session.sessionId",
    );
    assertNonNegativeInteger(
      session.createdAt,
      "session.createdAt",
    );
    assertNonNegativeInteger(
      session.updatedAt,
      "session.updatedAt",
    );
    assertNonNegativeInteger(
      session.version,
      "session.version",
    );

    if (
      session.updatedAt < session.createdAt
    ) {
      throw new CrossChainArbitrageEngineError(
        "INVALID_SESSION_TIMESTAMP",
        "session.updatedAt must not be earlier than session.createdAt.",
        session.sessionId,
      );
    }

    if (
      session.executionRuntime !== null &&
      session.executionPlan === null
    ) {
      throw new CrossChainArbitrageEngineError(
        "RUNTIME_WITHOUT_PLAN",
        "Session execution runtime requires an execution plan.",
        session.sessionId,
      );
    }
  }
}