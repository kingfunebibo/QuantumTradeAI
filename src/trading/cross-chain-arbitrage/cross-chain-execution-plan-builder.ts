import type {
  CrossChainIdentifier,
} from "./cross-chain-arbitrage-contracts";
import type {
  DetectedCrossChainArbitrageOpportunity,
} from "./cross-chain-opportunity-detector";

export type CrossChainExecutionStepType =
  | "SOURCE_APPROVAL"
  | "SOURCE_SWAP"
  | "BRIDGE_TRANSFER"
  | "DESTINATION_CLAIM"
  | "DESTINATION_SWAP"
  | "SETTLEMENT_VERIFICATION";

export type CrossChainExecutionStepStatus =
  | "PENDING"
  | "READY"
  | "BLOCKED"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export interface CrossChainExecutionStepTemplate {
  readonly stepType: CrossChainExecutionStepType;
  readonly networkId: CrossChainIdentifier;
  readonly providerId: CrossChainIdentifier | null;
  readonly inputAssetId: CrossChainIdentifier | null;
  readonly outputAssetId: CrossChainIdentifier | null;
  readonly inputAmountAtomic: string | null;
  readonly minimumOutputAmountAtomic: string | null;
  readonly estimatedFeeUsd: string | null;
  readonly estimatedDurationMilliseconds: number;
  readonly requiresConfirmation: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CrossChainExecutionPlanStep {
  readonly stepId: CrossChainIdentifier;
  readonly sequence: number;
  readonly stepType: CrossChainExecutionStepType;
  readonly networkId: CrossChainIdentifier;
  readonly providerId: CrossChainIdentifier | null;
  readonly inputAssetId: CrossChainIdentifier | null;
  readonly outputAssetId: CrossChainIdentifier | null;
  readonly inputAmountAtomic: string | null;
  readonly minimumOutputAmountAtomic: string | null;
  readonly estimatedFeeUsd: string | null;
  readonly estimatedDurationMilliseconds: number;
  readonly requiresConfirmation: boolean;
  readonly dependsOnStepIds: readonly CrossChainIdentifier[];
  readonly status: CrossChainExecutionStepStatus;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainExecutionPlan {
  readonly planId: CrossChainIdentifier;
  readonly opportunityId: CrossChainIdentifier;
  readonly quoteId: CrossChainIdentifier;
  readonly bridgeId: CrossChainIdentifier;
  readonly requestId: CrossChainIdentifier;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly estimatedCompletionAt: number;
  readonly estimatedTotalFeeUsd: string | null;
  readonly estimatedNetProfitUsd: string;
  readonly estimatedNetProfitPercentage: number;
  readonly steps: readonly CrossChainExecutionPlanStep[];
  readonly status: "PLANNED";
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CrossChainExecutionPlanBuildRequest {
  readonly opportunity:
    DetectedCrossChainArbitrageOpportunity;
  readonly stepTemplates:
    readonly CrossChainExecutionStepTemplate[];
  readonly createdAt: number;
  readonly planId?: CrossChainIdentifier;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CrossChainExecutionPlanBuilderOptions {
  readonly planIdFactory?: (
    request: CrossChainExecutionPlanBuildRequest,
  ) => CrossChainIdentifier;
  readonly stepIdFactory?: (
    planId: CrossChainIdentifier,
    sequence: number,
    template: CrossChainExecutionStepTemplate,
  ) => CrossChainIdentifier;
  readonly requireSettlementVerification?: boolean;
}

export class CrossChainExecutionPlanBuilderError
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

    this.name =
      "CrossChainExecutionPlanBuilderError";
    this.code = code;
    this.referenceId = referenceId;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function freezeArray<T>(
  values: readonly T[],
): readonly T[] {
  return Object.freeze([...values]);
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
    throw new CrossChainExecutionPlanBuilderError(
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
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_INTEGER",
      `${fieldName} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_INTEGER",
      `${fieldName} must be a positive integer.`,
    );
  }
}

function assertAtomicAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^\d+$/.test(value)) {
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_ATOMIC_AMOUNT",
      `${fieldName} must be a non-negative integer string.`,
    );
  }
}

function assertDecimalAmount(
  value: string,
  fieldName: string,
): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must be a canonical non-negative decimal string.`,
    );
  }

  if (!Number.isFinite(Number(value))) {
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_DECIMAL_AMOUNT",
      `${fieldName} must represent a finite number.`,
    );
  }
}

function normalizeDecimal(
  value: number,
): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new CrossChainExecutionPlanBuilderError(
      "INVALID_DECIMAL_RESULT",
      "Calculated decimal value must be finite and non-negative.",
    );
  }

  if (value === 0) {
    return "0";
  }

  return value
    .toFixed(12)
    .replace(/\.?0+$/, "");
}

function validateStepTemplate(
  template: CrossChainExecutionStepTemplate,
  index: number,
): void {
  assertNonEmptyString(
    template.stepType,
    `stepTemplates[${index}].stepType`,
  );
  assertNonEmptyString(
    template.networkId,
    `stepTemplates[${index}].networkId`,
  );

  if (template.providerId !== null) {
    assertNonEmptyString(
      template.providerId,
      `stepTemplates[${index}].providerId`,
    );
  }

  if (template.inputAssetId !== null) {
    assertNonEmptyString(
      template.inputAssetId,
      `stepTemplates[${index}].inputAssetId`,
    );
  }

  if (template.outputAssetId !== null) {
    assertNonEmptyString(
      template.outputAssetId,
      `stepTemplates[${index}].outputAssetId`,
    );
  }

  if (template.inputAmountAtomic !== null) {
    assertAtomicAmount(
      template.inputAmountAtomic,
      `stepTemplates[${index}].inputAmountAtomic`,
    );
  }

  if (
    template.minimumOutputAmountAtomic !== null
  ) {
    assertAtomicAmount(
      template.minimumOutputAmountAtomic,
      `stepTemplates[${index}].minimumOutputAmountAtomic`,
    );
  }

  if (template.estimatedFeeUsd !== null) {
    assertDecimalAmount(
      template.estimatedFeeUsd,
      `stepTemplates[${index}].estimatedFeeUsd`,
    );
  }

  assertNonNegativeInteger(
    template.estimatedDurationMilliseconds,
    `stepTemplates[${index}].estimatedDurationMilliseconds`,
  );
}

function determineInitialStatus(
  sequence: number,
): CrossChainExecutionStepStatus {
  return sequence === 1 ? "READY" : "BLOCKED";
}

export class DeterministicCrossChainExecutionPlanBuilder {
  private readonly planIdFactory: (
    request: CrossChainExecutionPlanBuildRequest,
  ) => CrossChainIdentifier;

  private readonly stepIdFactory: (
    planId: CrossChainIdentifier,
    sequence: number,
    template: CrossChainExecutionStepTemplate,
  ) => CrossChainIdentifier;

  private readonly requireSettlementVerification:
    boolean;

  public constructor(
    options:
      CrossChainExecutionPlanBuilderOptions = {},
  ) {
    this.planIdFactory =
      options.planIdFactory ??
      ((request) =>
        [
          "cross-chain-plan",
          request.opportunity.opportunityId,
          request.createdAt.toString(),
        ].join(":"));

    this.stepIdFactory =
      options.stepIdFactory ??
      ((planId, sequence, template) =>
        [
          planId,
          sequence.toString().padStart(3, "0"),
          template.stepType,
        ].join(":"));

    this.requireSettlementVerification =
      options.requireSettlementVerification ??
      true;
  }

  public build(
    request: CrossChainExecutionPlanBuildRequest,
  ): CrossChainExecutionPlan {
    this.validateBuildRequest(request);

    const planId =
      request.planId ??
      this.planIdFactory(request);

    assertNonEmptyString(planId, "planId");

    const seenStepIds =
      new Set<CrossChainIdentifier>();

    const steps: CrossChainExecutionPlanStep[] =
      [];

    let totalDurationMilliseconds = 0;
    let totalFeeUsd = 0;
    let allFeesKnown = true;

    request.stepTemplates.forEach(
      (template, index) => {
        validateStepTemplate(template, index);

        const sequence = index + 1;
        assertPositiveInteger(
          sequence,
          "step.sequence",
        );

        const stepId =
          this.stepIdFactory(
            planId,
            sequence,
            template,
          );

        assertNonEmptyString(
          stepId,
          `stepTemplates[${index}].stepId`,
        );

        if (seenStepIds.has(stepId)) {
          throw new CrossChainExecutionPlanBuilderError(
            "DUPLICATE_STEP_ID",
            `Step ID "${stepId}" was generated more than once.`,
            stepId,
          );
        }

        seenStepIds.add(stepId);

        totalDurationMilliseconds +=
          template.estimatedDurationMilliseconds;

        if (template.estimatedFeeUsd === null) {
          allFeesKnown = false;
        } else {
          totalFeeUsd += Number(
            template.estimatedFeeUsd,
          );
        }

        const dependsOnStepIds =
          sequence === 1
            ? Object.freeze([])
            : Object.freeze([
                steps[sequence - 2].stepId,
              ]);

        steps.push(
          Object.freeze({
            stepId,
            sequence,
            stepType: template.stepType,
            networkId: template.networkId,
            providerId: template.providerId,
            inputAssetId:
              template.inputAssetId,
            outputAssetId:
              template.outputAssetId,
            inputAmountAtomic:
              template.inputAmountAtomic,
            minimumOutputAmountAtomic:
              template.minimumOutputAmountAtomic,
            estimatedFeeUsd:
              template.estimatedFeeUsd,
            estimatedDurationMilliseconds:
              template
                .estimatedDurationMilliseconds,
            requiresConfirmation:
              template.requiresConfirmation,
            dependsOnStepIds,
            status:
              determineInitialStatus(sequence),
            metadata:
              freezeRecord(template.metadata),
          }),
        );
      },
    );

    if (
      this.requireSettlementVerification &&
      !steps.some(
        (step) =>
          step.stepType ===
          "SETTLEMENT_VERIFICATION",
      )
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "MISSING_SETTLEMENT_VERIFICATION",
        "Execution plan must include a SETTLEMENT_VERIFICATION step.",
        planId,
      );
    }

    const bridgeTransferCount =
      steps.filter(
        (step) =>
          step.stepType === "BRIDGE_TRANSFER",
      ).length;

    if (bridgeTransferCount !== 1) {
      throw new CrossChainExecutionPlanBuilderError(
        "INVALID_BRIDGE_TRANSFER_COUNT",
        "Execution plan must contain exactly one BRIDGE_TRANSFER step.",
        planId,
      );
    }

    const settlementIndex =
      steps.findIndex(
        (step) =>
          step.stepType ===
          "SETTLEMENT_VERIFICATION",
      );

    if (
      settlementIndex !== -1 &&
      settlementIndex !== steps.length - 1
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "INVALID_SETTLEMENT_POSITION",
        "SETTLEMENT_VERIFICATION must be the final execution step.",
        steps[settlementIndex].stepId,
      );
    }

    const estimatedCompletionAt =
      request.createdAt +
      totalDurationMilliseconds;

    if (
      estimatedCompletionAt >
      request.opportunity.expiresAt
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "PLAN_EXCEEDS_OPPORTUNITY_LIFETIME",
        "Estimated plan completion occurs after the opportunity expires.",
        request.opportunity.opportunityId,
      );
    }

    const plan:
      CrossChainExecutionPlan =
      Object.freeze({
        planId,
        opportunityId:
          request.opportunity.opportunityId,
        quoteId:
          request.opportunity.quoteId,
        bridgeId:
          request.opportunity.bridgeId,
        requestId:
          request.opportunity.requestId,
        createdAt: request.createdAt,
        expiresAt:
          request.opportunity.expiresAt,
        estimatedCompletionAt,
        estimatedTotalFeeUsd:
          allFeesKnown
            ? normalizeDecimal(totalFeeUsd)
            : null,
        estimatedNetProfitUsd:
          request.opportunity.netProfitUsd,
        estimatedNetProfitPercentage:
          request.opportunity
            .netProfitPercentage,
        steps: freezeArray(steps),
        status: "PLANNED",
        metadata:
          freezeRecord(request.metadata),
      });

    return plan;
  }

  private validateBuildRequest(
    request: CrossChainExecutionPlanBuildRequest,
  ): void {
    assertNonNegativeInteger(
      request.createdAt,
      "request.createdAt",
    );

    if (
      request.opportunity.status !==
      "ACTIONABLE"
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "OPPORTUNITY_NOT_ACTIONABLE",
        `Opportunity "${request.opportunity.opportunityId}" is not actionable.`,
        request.opportunity.opportunityId,
      );
    }

    if (
      request.createdAt <
      request.opportunity.observedAt
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "PLAN_CREATED_BEFORE_OBSERVATION",
        "createdAt must not be earlier than the opportunity observation time.",
        request.opportunity.opportunityId,
      );
    }

    if (
      request.createdAt >=
      request.opportunity.expiresAt
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "OPPORTUNITY_EXPIRED",
        "Cannot build an execution plan for an expired opportunity.",
        request.opportunity.opportunityId,
      );
    }

    if (request.stepTemplates.length === 0) {
      throw new CrossChainExecutionPlanBuilderError(
        "EMPTY_EXECUTION_PLAN",
        "stepTemplates must contain at least one step.",
        request.opportunity.opportunityId,
      );
    }

    assertNonEmptyString(
      request.opportunity.opportunityId,
      "opportunity.opportunityId",
    );
    assertNonEmptyString(
      request.opportunity.quoteId,
      "opportunity.quoteId",
    );
    assertNonEmptyString(
      request.opportunity.bridgeId,
      "opportunity.bridgeId",
    );
    assertNonEmptyString(
      request.opportunity.requestId,
      "opportunity.requestId",
    );

    assertDecimalAmount(
      request.opportunity.netProfitUsd,
      "opportunity.netProfitUsd",
    );

    if (
      !Number.isFinite(
        request.opportunity
          .netProfitPercentage,
      )
    ) {
      throw new CrossChainExecutionPlanBuilderError(
        "INVALID_NET_PROFIT_PERCENTAGE",
        "opportunity.netProfitPercentage must be finite.",
        request.opportunity.opportunityId,
      );
    }

    if (request.planId !== undefined) {
      assertNonEmptyString(
        request.planId,
        "request.planId",
      );
    }
  }
}