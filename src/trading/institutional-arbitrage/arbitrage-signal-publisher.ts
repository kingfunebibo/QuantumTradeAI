/**
 * QuantumTradeAI
 * Phase 22 — Institutional Arbitrage Platform
 * Milestone 36 — Institutional Arbitrage Platform
 *
 * File:
 * src/trading/institutional-arbitrage/arbitrage-signal-publisher.ts
 *
 * Purpose:
 * Deterministic and immutable signal construction and publication for
 * signal-only cross-DEX and cross-chain institutional arbitrage opportunities.
 */

import {
  type ArbitrageDecision,
  type ArbitrageId,
  type ArbitrageMetadata,
  type ArbitrageMetadataValue,
  type ArbitrageSignal,
  type ArbitrageTimestamp,
  type InstitutionalArbitrageIdFactory,
  type InstitutionalArbitrageOpportunity,
} from "./institutional-arbitrage-contracts";
import {
  assertInstitutionalArbitrageOpportunity,
  validateArbitrageDecision,
  validateArbitrageSignal,
  type ArbitrageValidationResult,
} from "./institutional-arbitrage-validator";

const DEFAULT_DECIMAL_PLACES = 8;
const MAX_DECIMAL_PLACES = 12;
const DEFAULT_MINIMUM_SIGNAL_LIFETIME_MS = 1;

export interface ArbitrageSignalPublication {
  readonly signal: ArbitrageSignal;
  readonly publishedAt: ArbitrageTimestamp;
  readonly publicationId?: string;
  readonly metadata: ArbitrageMetadata;
}

export interface ArbitrageSignalSink {
  publish(
    signal: ArbitrageSignal,
  ):
    | void
    | string
    | ArbitrageSignalPublication
    | Promise<void | string | ArbitrageSignalPublication>;
}

export interface ArbitrageSignalPublisherOptions {
  /** Validate opportunities, decisions, and generated signals. */
  readonly validateInputs?: boolean;

  /** Precision used for deterministic signal monetary fields. */
  readonly decimalPlaces?: number;

  /** Minimum remaining lifetime required at signal generation time. */
  readonly minimumSignalLifetimeMs?: number;

  /** Optional deterministic ID factory shared by the wider platform. */
  readonly idFactory?: InstitutionalArbitrageIdFactory;

  /** Optional injected publication target. */
  readonly sink?: ArbitrageSignalSink;

  /**
   * Permit publication of rejected signal decisions. This is disabled by
   * default and should only be enabled when the configured evaluation policy
   * explicitly permits rejected-signal publication.
   */
  readonly publishRejectedSignals?: boolean;
}

export interface ArbitrageSignalPublicationResult {
  readonly signal?: ArbitrageSignal;
  readonly published: boolean;
  readonly skipped: boolean;
  readonly reason?: string;
  readonly publicationId?: string;
  readonly generatedAt: ArbitrageTimestamp;
  readonly metadata: ArbitrageMetadata;
}

export type ArbitrageSignalPublisherErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_OPTION"
  | "INVALID_TIMESTAMP"
  | "INVALID_OPPORTUNITY"
  | "INVALID_DECISION"
  | "INCONSISTENT_INPUT"
  | "UNSUPPORTED_OPPORTUNITY_TYPE"
  | "INVALID_DECISION_ACTION"
  | "EXPIRED_OPPORTUNITY"
  | "INSUFFICIENT_SIGNAL_LIFETIME"
  | "INVALID_GENERATED_SIGNAL"
  | "PUBLICATION_FAILED";

export class ArbitrageSignalPublisherError extends Error {
  public readonly code: ArbitrageSignalPublisherErrorCode;
  public readonly validationIssues?: ArbitrageValidationResult["issues"];
  public readonly causeValue?: unknown;

  public constructor(
    code: ArbitrageSignalPublisherErrorCode,
    message: string,
    validationIssues?: ArbitrageValidationResult["issues"],
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "ArbitrageSignalPublisherError";
    this.code = code;
    this.validationIssues = validationIssues;
    this.causeValue = causeValue;
  }
}

interface ResolvedOptions {
  readonly validateInputs: boolean;
  readonly decimalPlaces: number;
  readonly minimumSignalLifetimeMs: number;
  readonly idFactory?: InstitutionalArbitrageIdFactory;
  readonly sink?: ArbitrageSignalSink;
  readonly publishRejectedSignals: boolean;
}

type SignalOpportunity = Extract<
  InstitutionalArbitrageOpportunity,
  { readonly type: "CROSS_DEX" | "CROSS_CHAIN" }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_ARGUMENT",
      `${path} must be a finite number.`,
    );
  }
}

function assertTimestamp(value: number, path: string): void {
  assertFiniteNumber(value, path);

  if (!Number.isInteger(value) || value < 0) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_TIMESTAMP",
      `${path} must be a non-negative integer timestamp.`,
    );
  }
}

function resolveOptions(
  options: ArbitrageSignalPublisherOptions,
): ResolvedOptions {
  const decimalPlaces = options.decimalPlaces ?? DEFAULT_DECIMAL_PLACES;
  const minimumSignalLifetimeMs =
    options.minimumSignalLifetimeMs ?? DEFAULT_MINIMUM_SIGNAL_LIFETIME_MS;

  if (
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > MAX_DECIMAL_PLACES
  ) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_OPTION",
      `decimalPlaces must be an integer between 0 and ${MAX_DECIMAL_PLACES}.`,
    );
  }

  if (
    !Number.isInteger(minimumSignalLifetimeMs) ||
    minimumSignalLifetimeMs < 1
  ) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_OPTION",
      "minimumSignalLifetimeMs must be a positive integer.",
    );
  }

  if (
    options.idFactory !== undefined &&
    typeof options.idFactory.createId !== "function"
  ) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_OPTION",
      "idFactory must expose a createId function.",
    );
  }

  if (
    options.sink !== undefined &&
    typeof options.sink.publish !== "function"
  ) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_OPTION",
      "sink must expose a publish function.",
    );
  }

  return Object.freeze({
    validateInputs: options.validateInputs ?? true,
    decimalPlaces,
    minimumSignalLifetimeMs,
    idFactory: options.idFactory,
    sink: options.sink,
    publishRejectedSignals: options.publishRejectedSignals ?? false,
  });
}

function roundDeterministically(value: number, decimalPlaces: number): number {
  assertFiniteNumber(value, "value");

  if (value === 0) {
    return 0;
  }

  const factor = 10 ** decimalPlaces;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(value[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function hashDeterministically(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createSignalId(
  opportunity: SignalOpportunity,
  decision: ArbitrageDecision,
  generatedAt: ArbitrageTimestamp,
  idFactory?: InstitutionalArbitrageIdFactory,
): ArbitrageId {
  const components = Object.freeze([
    opportunity.opportunityId,
    decision.decisionId,
    opportunity.type,
    generatedAt,
    opportunity.version,
    opportunity.sourceSequence,
  ] as const);

  if (idFactory !== undefined) {
    const id = idFactory.createId("arbitrage-signal", components);

    if (typeof id !== "string" || id.trim().length === 0) {
      throw new ArbitrageSignalPublisherError(
        "INVALID_GENERATED_SIGNAL",
        "The injected ID factory returned an invalid signal ID.",
      );
    }

    return id;
  }

  return `arb-signal-${hashDeterministically(stableSerialize(components))}`;
}

function deepFreezeMetadataValue(
  value: ArbitrageMetadataValue,
): ArbitrageMetadataValue {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) => deepFreezeMetadataValue(entry)),
    );
  }

  if (isRecord(value)) {
    const result: Record<string, ArbitrageMetadataValue> = {};

    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      result[key] = deepFreezeMetadataValue(
        value[key] as ArbitrageMetadataValue,
      );
    }

    return Object.freeze(result);
  }

  return value;
}

function deepFreezeMetadata(metadata: ArbitrageMetadata): ArbitrageMetadata {
  const result: Record<string, ArbitrageMetadataValue> = {};

  for (const key of Object.keys(metadata).sort((a, b) => a.localeCompare(b))) {
    result[key] = deepFreezeMetadataValue(metadata[key]);
  }

  return Object.freeze(result);
}

function isSignalOpportunity(
  opportunity: InstitutionalArbitrageOpportunity,
): opportunity is SignalOpportunity {
  return opportunity.type === "CROSS_DEX" || opportunity.type === "CROSS_CHAIN";
}

function assertDecisionConsistency(
  opportunity: SignalOpportunity,
  decision: ArbitrageDecision,
  publishRejectedSignals: boolean,
): void {
  if (decision.opportunityId !== opportunity.opportunityId) {
    throw new ArbitrageSignalPublisherError(
      "INCONSISTENT_INPUT",
      "The decision opportunityId does not match the opportunity.",
    );
  }

  if (decision.automationMode !== "SIGNAL_ONLY") {
    throw new ArbitrageSignalPublisherError(
      "INCONSISTENT_INPUT",
      "Signal-only opportunities require a SIGNAL_ONLY decision automation mode.",
    );
  }

  if (decision.correlationId !== opportunity.correlationId) {
    throw new ArbitrageSignalPublisherError(
      "INCONSISTENT_INPUT",
      "The decision correlationId does not match the opportunity.",
    );
  }

  if (decision.traceId !== opportunity.traceId) {
    throw new ArbitrageSignalPublisherError(
      "INCONSISTENT_INPUT",
      "The decision traceId does not match the opportunity.",
    );
  }

  const publishable =
    decision.action === "PUBLISH_SIGNAL" ||
    (publishRejectedSignals && decision.action === "REJECT");

  if (!publishable) {
    throw new ArbitrageSignalPublisherError(
      "INVALID_DECISION_ACTION",
      `Decision action ${decision.action} cannot produce an arbitrage signal.`,
    );
  }
}

function buildBaseMetadata(
  opportunity: SignalOpportunity,
  decision: ArbitrageDecision,
): ArbitrageMetadata {
  return deepFreezeMetadata({
    publisher: "ArbitrageSignalPublisher",
    publisherVersion: 1,
    decisionId: decision.decisionId,
    decisionAction: decision.action,
    decisionReason: decision.reason,
    automationMode: opportunity.automationMode,
    strategyId: opportunity.strategyId,
    portfolioId: opportunity.portfolioId,
    reportingAsset: opportunity.reportingAsset,
    sourceSequence: opportunity.sourceSequence,
    opportunityVersion: opportunity.version,
    correlationId: opportunity.correlationId,
    traceId: opportunity.traceId,
    rejectedSignal: decision.action === "REJECT",
  });
}

function createSignal(
  opportunity: SignalOpportunity,
  decision: ArbitrageDecision,
  generatedAt: ArbitrageTimestamp,
  options: ResolvedOptions,
): ArbitrageSignal {
  const round = (value: number): number =>
    roundDeterministically(value, options.decimalPlaces);

  const common = {
    signalId: createSignalId(
      opportunity,
      decision,
      generatedAt,
      options.idFactory,
    ),
    opportunityId: opportunity.opportunityId,
    expectedProfit: round(opportunity.profitEstimate.expectedNetProfit),
    expectedNetReturnPercentage: round(
      opportunity.profitEstimate.netReturnPercentage,
    ),
    gasCost: round(opportunity.profitEstimate.expectedGasCost),
    bridgeFee: round(opportunity.profitEstimate.expectedBridgeCost),
    slippageCost: round(opportunity.profitEstimate.expectedSlippageCost),
    confidence: round(opportunity.confidence),
    manualApprovalRequired: true as const,
    generatedAt,
    expiresAt: opportunity.expiresAt,
    metadata: buildBaseMetadata(opportunity, decision),
  };

  if (opportunity.type === "CROSS_DEX") {
    return Object.freeze({
      ...common,
      type: "CROSS_DEX" as const,
      gasCost: round(opportunity.details.expectedGasCost),
      slippageCost: round(opportunity.details.expectedSlippageCost),
      liquidity: round(opportunity.details.availableLiquidity),
      chainRiskScore: round(decision.riskAssessment.overallRiskScore),
    });
  }

  const chainRiskScore = Math.max(
    opportunity.details.sourceChainRiskScore,
    opportunity.details.destinationChainRiskScore,
  );

  return Object.freeze({
    ...common,
    type: "CROSS_CHAIN" as const,
    bridgeFee: round(opportunity.details.expectedBridgeFee),
    liquidity: round(opportunity.details.quantity),
    chainRiskScore: round(chainRiskScore),
    bridgeRiskScore: round(opportunity.details.bridgeRiskScore),
    expectedSettlementTimeMs:
      opportunity.details.expectedSettlementTimeMs,
  });
}

function normalizePublication(
  publication: void | string | ArbitrageSignalPublication,
  signal: ArbitrageSignal,
  generatedAt: ArbitrageTimestamp,
): ArbitrageSignalPublicationResult {
  if (typeof publication === "string") {
    return Object.freeze({
      signal,
      published: true,
      skipped: false,
      publicationId: publication,
      generatedAt,
      metadata: deepFreezeMetadata({
        sinkInvoked: true,
        publicationResponseType: "STRING",
      }),
    });
  }

  if (isRecord(publication)) {
    const publicationId =
      typeof publication.publicationId === "string"
        ? publication.publicationId
        : undefined;

    return Object.freeze({
      signal,
      published: true,
      skipped: false,
      publicationId,
      generatedAt,
      metadata: deepFreezeMetadata({
        sinkInvoked: true,
        publicationResponseType: "PUBLICATION",
      }),
    });
  }

  return Object.freeze({
    signal,
    published: true,
    skipped: false,
    generatedAt,
    metadata: deepFreezeMetadata({
      sinkInvoked: true,
      publicationResponseType: "VOID",
    }),
  });
}

export class ArbitrageSignalPublisher {
  private readonly options: ResolvedOptions;

  public constructor(options: ArbitrageSignalPublisherOptions = {}) {
    this.options = resolveOptions(options);
  }

  /**
   * Constructs a validated immutable signal without invoking the configured
   * publication sink.
   */
  public create(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    generatedAt: ArbitrageTimestamp,
  ): ArbitrageSignal {
    assertTimestamp(generatedAt, "generatedAt");

    if (this.options.validateInputs) {
      assertInstitutionalArbitrageOpportunity(opportunity, generatedAt);

      const decisionValidation = validateArbitrageDecision(decision);
      if (!decisionValidation.valid) {
        throw new ArbitrageSignalPublisherError(
          "INVALID_DECISION",
          "Invalid arbitrage decision.",
          decisionValidation.issues,
        );
      }
    }

    if (!isSignalOpportunity(opportunity)) {
      throw new ArbitrageSignalPublisherError(
        "UNSUPPORTED_OPPORTUNITY_TYPE",
        `Only CROSS_DEX and CROSS_CHAIN opportunities may produce signals; received ${opportunity.type}.`,
      );
    }

    assertDecisionConsistency(
      opportunity,
      decision,
      this.options.publishRejectedSignals,
    );

    if (generatedAt >= opportunity.expiresAt) {
      throw new ArbitrageSignalPublisherError(
        "EXPIRED_OPPORTUNITY",
        "The opportunity expired before signal generation.",
      );
    }

    if (
      opportunity.expiresAt - generatedAt <
      this.options.minimumSignalLifetimeMs
    ) {
      throw new ArbitrageSignalPublisherError(
        "INSUFFICIENT_SIGNAL_LIFETIME",
        "The remaining opportunity lifetime is shorter than the configured minimum signal lifetime.",
      );
    }

    const signal = createSignal(
      opportunity,
      decision,
      generatedAt,
      this.options,
    );
    const validation = validateArbitrageSignal(signal);

    if (!validation.valid) {
      throw new ArbitrageSignalPublisherError(
        "INVALID_GENERATED_SIGNAL",
        "The generated arbitrage signal is invalid.",
        validation.issues,
      );
    }

    return signal;
  }

  /**
   * Constructs and publishes a signal. When no sink is configured, creation is
   * still considered successful and the result indicates that publication was
   * skipped rather than falsely claiming external delivery.
   */
  public async publish(
    opportunity: InstitutionalArbitrageOpportunity,
    decision: ArbitrageDecision,
    generatedAt: ArbitrageTimestamp,
  ): Promise<ArbitrageSignalPublicationResult> {
    const signal = this.create(opportunity, decision, generatedAt);

    if (this.options.sink === undefined) {
      return Object.freeze({
        signal,
        published: false,
        skipped: true,
        reason: "No arbitrage signal sink is configured.",
        generatedAt,
        metadata: deepFreezeMetadata({
          sinkInvoked: false,
          publicationResponseType: "NONE",
        }),
      });
    }

    try {
      const publication = await this.options.sink.publish(signal);
      return normalizePublication(publication, signal, generatedAt);
    } catch (error: unknown) {
      throw new ArbitrageSignalPublisherError(
        "PUBLICATION_FAILED",
        error instanceof Error
          ? `Arbitrage signal publication failed: ${error.message}`
          : "Arbitrage signal publication failed.",
        undefined,
        error,
      );
    }
  }

  /**
   * Deterministically publishes a batch in opportunityId order. The returned
   * collection is deeply immutable at the collection and entry levels.
   */
  public async publishBatch(
    inputs: readonly {
      readonly opportunity: InstitutionalArbitrageOpportunity;
      readonly decision: ArbitrageDecision;
    }[],
    generatedAt: ArbitrageTimestamp,
  ): Promise<readonly ArbitrageSignalPublicationResult[]> {
    assertTimestamp(generatedAt, "generatedAt");

    const sortedInputs = [...inputs].sort((left, right) => {
      const opportunityComparison =
        left.opportunity.opportunityId.localeCompare(
          right.opportunity.opportunityId,
        );

      if (opportunityComparison !== 0) {
        return opportunityComparison;
      }

      return left.decision.decisionId.localeCompare(
        right.decision.decisionId,
      );
    });

    const results: ArbitrageSignalPublicationResult[] = [];

    for (const input of sortedInputs) {
      results.push(
        await this.publish(
          input.opportunity,
          input.decision,
          generatedAt,
        ),
      );
    }

    return Object.freeze(results);
  }
}