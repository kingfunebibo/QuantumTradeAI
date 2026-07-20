import {
  EMPTY_STRATEGY_METADATA,
  StrategyCorrelationId,
  StrategyDirection,
  StrategyEvaluationId,
  StrategyInstrument,
  StrategyMetadata,
  StrategyOrderIntent,
  StrategyOrderIntentId,
  StrategyOrderSide,
  StrategySignal,
  StrategySignalAction,
  StrategySignalId,
  StrategyVersion,
  UnixTimestampMilliseconds,
} from "./strategy-contracts";

export type StrategyCompositionConflictPolicy =
  | "HOLD_ON_CONFLICT"
  | "HIGHEST_WEIGHT"
  | "HIGHEST_CONFIDENCE"
  | "PRIORITY"
  | "NET_SCORE";

export type StrategyCompositionOrderPolicy =
  | "NONE"
  | "WINNING_SIDE_ONLY"
  | "AGGREGATE_WINNING_SIDE";

export interface StrategyCompositionMember {
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly version?: StrategyVersion;
  readonly weight: number;
  readonly priority: number;
  readonly enabled: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionPolicy {
  readonly minimumConsensusRatio: number;
  readonly minimumParticipationWeight: number;
  readonly minimumComposedConfidence: number;
  readonly maximumComposedConfidence: number;
  readonly conflictPolicy: StrategyCompositionConflictPolicy;
  readonly orderPolicy: StrategyCompositionOrderPolicy;
  readonly maximumOrderQuantity?: number;
  readonly maximumOrderNotional?: number;
  readonly maximumAbsoluteNetScore?: number;
  readonly includeHoldSignals: boolean;
  readonly preserveWinningEvidence: boolean;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionInput {
  readonly compositionId: string;
  readonly evaluationId: StrategyEvaluationId;
  readonly correlationId: StrategyCorrelationId;
  readonly composedStrategyId: string;
  readonly composedStrategyInstanceId: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly instrument: StrategyInstrument;
  readonly members: readonly StrategyCompositionMember[];
  readonly signals: readonly StrategySignal[];
  readonly orderIntents: readonly StrategyOrderIntent[];
  readonly policy: StrategyCompositionPolicy;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionContribution {
  readonly strategyId: string;
  readonly strategyInstanceId: string;
  readonly signalId: StrategySignalId;
  readonly action: StrategySignalAction;
  readonly direction: StrategyDirection;
  readonly memberWeight: number;
  readonly confidence: number;
  readonly weightedScore: number;
  readonly priority: number;
  readonly included: boolean;
  readonly exclusionReason?: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionVoteSummary {
  readonly buyWeight: number;
  readonly sellWeight: number;
  readonly holdWeight: number;
  readonly closeWeight: number;
  readonly reduceWeight: number;
  readonly reverseWeight: number;
  readonly positiveScore: number;
  readonly negativeScore: number;
  readonly netScore: number;
  readonly participatingWeight: number;
  readonly totalEnabledWeight: number;
  readonly consensusRatio: number;
}

export interface StrategyCompositionDiagnostic {
  readonly code: string;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionResult {
  readonly compositionId: string;
  readonly evaluationId: StrategyEvaluationId;
  readonly correlationId: StrategyCorrelationId;
  readonly composedStrategyId: string;
  readonly composedStrategyInstanceId: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly action: StrategySignalAction;
  readonly direction: StrategyDirection;
  readonly confidence: number;
  readonly score: number;
  readonly consensusRatio: number;
  readonly signal?: StrategySignal;
  readonly orderIntent?: StrategyOrderIntent;
  readonly contributions: readonly StrategyCompositionContribution[];
  readonly voteSummary: StrategyCompositionVoteSummary;
  readonly diagnostics: readonly StrategyCompositionDiagnostic[];
  readonly metadata: StrategyMetadata;
}

export interface StrategyCompositionSnapshot {
  readonly totalCompositions: number;
  readonly totalSignalsProduced: number;
  readonly totalOrderIntentsProduced: number;
  readonly totalConflicts: number;
  readonly lastCompositionId?: string;
  readonly updatedAt?: UnixTimestampMilliseconds;
}

export interface StrategyCompositionEngineOptions {
  readonly historyLimit?: number;
  readonly defaultPolicy?: Partial<StrategyCompositionPolicy>;
}

const DEFAULT_POLICY: StrategyCompositionPolicy = Object.freeze({
  minimumConsensusRatio: 0.5,
  minimumParticipationWeight: 0,
  minimumComposedConfidence: 0,
  maximumComposedConfidence: 1,
  conflictPolicy: "NET_SCORE",
  orderPolicy: "AGGREGATE_WINNING_SIDE",
  includeHoldSignals: false,
  preserveWinningEvidence: true,
  metadata: EMPTY_STRATEGY_METADATA,
});

const EPSILON = 1e-12;

function assertFiniteNumber(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} cannot be empty.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}

function sameInstrument(left: StrategyInstrument, right: StrategyInstrument): boolean {
  return (
    left.exchangeId === right.exchangeId &&
    left.symbol === right.symbol &&
    left.marketType === right.marketType
  );
}

function actionPolarity(action: StrategySignalAction): number {
  switch (action) {
    case "BUY":
      return 1;
    case "SELL":
      return -1;
    case "REVERSE":
      return 0;
    case "CLOSE":
    case "REDUCE":
    case "HOLD":
      return 0;
  }
}

function actionToDirection(
  action: StrategySignalAction,
  winningSignal?: StrategySignal,
): StrategyDirection {
  switch (action) {
    case "BUY":
      return "LONG";
    case "SELL":
      return "SHORT";
    case "CLOSE":
    case "HOLD":
      return "FLAT";
    case "REDUCE":
    case "REVERSE":
      return winningSignal?.direction ?? "FLAT";
  }
}

function actionToSide(action: StrategySignalAction): StrategyOrderSide | undefined {
  if (action === "BUY") {
    return "BUY";
  }
  if (action === "SELL") {
    return "SELL";
  }
  return undefined;
}

function deterministicHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mergePolicy(
  policy: StrategyCompositionPolicy,
  defaults?: Partial<StrategyCompositionPolicy>,
): StrategyCompositionPolicy {
  return deepFreeze({
    ...DEFAULT_POLICY,
    ...defaults,
    ...policy,
    metadata: policy.metadata ?? defaults?.metadata ?? DEFAULT_POLICY.metadata,
  });
}

function validatePolicy(policy: StrategyCompositionPolicy): void {
  assertFiniteNumber(policy.minimumConsensusRatio, "minimumConsensusRatio");
  assertFiniteNumber(
    policy.minimumParticipationWeight,
    "minimumParticipationWeight",
  );
  assertFiniteNumber(
    policy.minimumComposedConfidence,
    "minimumComposedConfidence",
  );
  assertFiniteNumber(
    policy.maximumComposedConfidence,
    "maximumComposedConfidence",
  );

  if (policy.minimumConsensusRatio < 0 || policy.minimumConsensusRatio > 1) {
    throw new Error("minimumConsensusRatio must be between 0 and 1.");
  }
  if (policy.minimumParticipationWeight < 0) {
    throw new Error("minimumParticipationWeight cannot be negative.");
  }
  if (
    policy.minimumComposedConfidence < 0 ||
    policy.maximumComposedConfidence > 1 ||
    policy.minimumComposedConfidence > policy.maximumComposedConfidence
  ) {
    throw new Error("Composed-confidence bounds are invalid.");
  }
  if (
    policy.maximumOrderQuantity !== undefined &&
    (!Number.isFinite(policy.maximumOrderQuantity) ||
      policy.maximumOrderQuantity <= 0)
  ) {
    throw new Error("maximumOrderQuantity must be greater than zero.");
  }
  if (
    policy.maximumOrderNotional !== undefined &&
    (!Number.isFinite(policy.maximumOrderNotional) ||
      policy.maximumOrderNotional <= 0)
  ) {
    throw new Error("maximumOrderNotional must be greater than zero.");
  }
}

function validateInput(input: StrategyCompositionInput): void {
  assertNonEmpty(input.compositionId, "compositionId");
  assertNonEmpty(input.evaluationId, "evaluationId");
  assertNonEmpty(input.correlationId, "correlationId");
  assertNonEmpty(input.composedStrategyId, "composedStrategyId");
  assertNonEmpty(
    input.composedStrategyInstanceId,
    "composedStrategyInstanceId",
  );
  assertFiniteNumber(input.timestamp, "timestamp");

  const identities = new Set<string>();
  for (const member of input.members) {
    assertNonEmpty(member.strategyId, "member.strategyId");
    assertNonEmpty(member.strategyInstanceId, "member.strategyInstanceId");
    assertFiniteNumber(member.weight, "member.weight");
    assertFiniteNumber(member.priority, "member.priority");
    if (member.weight < 0) {
      throw new Error("member.weight cannot be negative.");
    }
    const identity = `${member.strategyId}\u0000${member.strategyInstanceId}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate composition member: ${member.strategyId}/${member.strategyInstanceId}.`);
    }
    identities.add(identity);
  }

  for (const signal of input.signals) {
    if (!sameInstrument(signal.instrument, input.instrument)) {
      throw new Error(`Signal ${signal.signalId} targets a different instrument.`);
    }
  }

  for (const intent of input.orderIntents) {
    if (!sameInstrument(intent.instrument, input.instrument)) {
      throw new Error(
        `Order intent ${intent.orderIntentId} targets a different instrument.`,
      );
    }
  }
}

function memberKey(strategyId: string, instanceId: string): string {
  return `${strategyId}\u0000${instanceId}`;
}

function compareContributions(
  left: StrategyCompositionContribution,
  right: StrategyCompositionContribution,
): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  if (Math.abs(left.weightedScore) !== Math.abs(right.weightedScore)) {
    return Math.abs(right.weightedScore) - Math.abs(left.weightedScore);
  }
  if (left.strategyId !== right.strategyId) {
    return left.strategyId.localeCompare(right.strategyId);
  }
  return left.strategyInstanceId.localeCompare(right.strategyInstanceId);
}

export class StrategyCompositionEngine {
  private readonly historyLimit: number;
  private readonly defaultPolicy?: Partial<StrategyCompositionPolicy>;
  private readonly history: StrategyCompositionResult[] = [];
  private totalCompositions = 0;
  private totalSignalsProduced = 0;
  private totalOrderIntentsProduced = 0;
  private totalConflicts = 0;
  private lastCompositionId?: string;
  private updatedAt?: UnixTimestampMilliseconds;

  public constructor(options: StrategyCompositionEngineOptions = {}) {
    const historyLimit = options.historyLimit ?? 100;
    if (!Number.isInteger(historyLimit) || historyLimit < 0) {
      throw new Error("historyLimit must be a non-negative integer.");
    }
    this.historyLimit = historyLimit;
    this.defaultPolicy = options.defaultPolicy;
  }

  public compose(input: StrategyCompositionInput): StrategyCompositionResult {
    validateInput(input);
    const policy = mergePolicy(input.policy, this.defaultPolicy);
    validatePolicy(policy);

    const diagnostics: StrategyCompositionDiagnostic[] = [];
    const members = new Map(
      input.members.map((member) => [
        memberKey(member.strategyId, member.strategyInstanceId),
        member,
      ]),
    );

    const enabledWeight = input.members
      .filter((member) => member.enabled)
      .reduce((sum, member) => sum + member.weight, 0);

    const contributions: StrategyCompositionContribution[] = input.signals.map(
      (signal) => {
        const member = members.get(
          memberKey(signal.strategyId, signal.strategyInstanceId),
        );
        let included = true;
        let exclusionReason: string | undefined;

        if (member === undefined) {
          included = false;
          exclusionReason = "UNREGISTERED_MEMBER";
        } else if (!member.enabled) {
          included = false;
          exclusionReason = "MEMBER_DISABLED";
        } else if (signal.action === "HOLD" && !policy.includeHoldSignals) {
          included = false;
          exclusionReason = "HOLD_EXCLUDED_BY_POLICY";
        } else if (
          signal.validity.validUntil !== undefined &&
          signal.validity.validUntil < input.timestamp
        ) {
          included = false;
          exclusionReason = "SIGNAL_EXPIRED";
        }

        const memberWeight = member?.weight ?? 0;
        const polarity = actionPolarity(signal.action);
        const weightedScore = included
          ? memberWeight * clamp(signal.confidence, 0, 1) * polarity
          : 0;

        return deepFreeze({
          strategyId: signal.strategyId,
          strategyInstanceId: signal.strategyInstanceId,
          signalId: signal.signalId,
          action: signal.action,
          direction: signal.direction,
          memberWeight,
          confidence: signal.confidence,
          weightedScore,
          priority: member?.priority ?? Number.MIN_SAFE_INTEGER,
          included,
          exclusionReason,
          metadata: signal.metadata,
        });
      },
    );

    const included = contributions.filter((item) => item.included);
    const participatingWeight = included.reduce(
      (sum, item) => sum + item.memberWeight,
      0,
    );

    const weightFor = (action: StrategySignalAction): number =>
      included
        .filter((item) => item.action === action)
        .reduce((sum, item) => sum + item.memberWeight * item.confidence, 0);

    const positiveScore = included
      .filter((item) => item.weightedScore > 0)
      .reduce((sum, item) => sum + item.weightedScore, 0);
    const negativeScore = included
      .filter((item) => item.weightedScore < 0)
      .reduce((sum, item) => sum + Math.abs(item.weightedScore), 0);
    const rawNetScore = positiveScore - negativeScore;
    const netScore =
      policy.maximumAbsoluteNetScore === undefined
        ? rawNetScore
        : clamp(
            rawNetScore,
            -policy.maximumAbsoluteNetScore,
            policy.maximumAbsoluteNetScore,
          );

    const actionWeights = new Map<StrategySignalAction, number>([
      ["BUY", weightFor("BUY")],
      ["SELL", weightFor("SELL")],
      ["HOLD", weightFor("HOLD")],
      ["CLOSE", weightFor("CLOSE")],
      ["REDUCE", weightFor("REDUCE")],
      ["REVERSE", weightFor("REVERSE")],
    ]);

    const sortedActions = [...actionWeights.entries()].sort((left, right) => {
      if (Math.abs(left[1] - right[1]) > EPSILON) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    });

    const highestAction = sortedActions[0]?.[0] ?? "HOLD";
    const highestWeight = sortedActions[0]?.[1] ?? 0;
    const secondWeight = sortedActions[1]?.[1] ?? 0;
    const conflict = highestWeight > 0 && Math.abs(highestWeight - secondWeight) <= EPSILON;

    let action = this.resolveAction(
      policy.conflictPolicy,
      included,
      highestAction,
      netScore,
      conflict,
    );

    if (conflict) {
      this.totalConflicts += 1;
      diagnostics.push({
        code: "COMPOSITION_CONFLICT",
        severity: "WARNING",
        message: "Multiple actions received equal weighted support.",
        metadata: EMPTY_STRATEGY_METADATA,
      });
    }

    const winningWeight = actionWeights.get(action) ?? 0;
    const consensusRatio =
      participatingWeight <= EPSILON ? 0 : winningWeight / participatingWeight;

    if (participatingWeight < policy.minimumParticipationWeight) {
      action = "HOLD";
      diagnostics.push({
        code: "INSUFFICIENT_PARTICIPATION",
        severity: "WARNING",
        message: "Participating strategy weight is below the configured minimum.",
        metadata: EMPTY_STRATEGY_METADATA,
      });
    } else if (consensusRatio < policy.minimumConsensusRatio) {
      action = "HOLD";
      diagnostics.push({
        code: "INSUFFICIENT_CONSENSUS",
        severity: "WARNING",
        message: "Strategy consensus is below the configured minimum.",
        metadata: EMPTY_STRATEGY_METADATA,
      });
    }

    const winningContributions = included
      .filter((item) => item.action === action)
      .sort(compareContributions);
    const winningSignal = this.findSignal(input.signals, winningContributions[0]);

    const weightedConfidenceDenominator = winningContributions.reduce(
      (sum, item) => sum + item.memberWeight,
      0,
    );
    const weightedConfidenceNumerator = winningContributions.reduce(
      (sum, item) => sum + item.memberWeight * item.confidence,
      0,
    );
    const confidence = clamp(
      weightedConfidenceDenominator <= EPSILON
        ? 0
        : weightedConfidenceNumerator / weightedConfidenceDenominator,
      policy.minimumComposedConfidence,
      policy.maximumComposedConfidence,
    );

    const scoreDenominator = Math.max(enabledWeight, EPSILON);
    const normalizedScore = clamp(netScore / scoreDenominator, -1, 1);
    const direction = actionToDirection(action, winningSignal);

    const signal =
      action === "HOLD" && !policy.includeHoldSignals
        ? undefined
        : this.createComposedSignal(
            input,
            action,
            direction,
            confidence,
            normalizedScore,
            winningSignal,
            winningContributions,
            policy,
          );

    const orderIntent = this.createComposedOrderIntent(
      input,
      action,
      signal,
      winningContributions,
      policy,
    );

    const voteSummary: StrategyCompositionVoteSummary = deepFreeze({
      buyWeight: actionWeights.get("BUY") ?? 0,
      sellWeight: actionWeights.get("SELL") ?? 0,
      holdWeight: actionWeights.get("HOLD") ?? 0,
      closeWeight: actionWeights.get("CLOSE") ?? 0,
      reduceWeight: actionWeights.get("REDUCE") ?? 0,
      reverseWeight: actionWeights.get("REVERSE") ?? 0,
      positiveScore,
      negativeScore,
      netScore,
      participatingWeight,
      totalEnabledWeight: enabledWeight,
      consensusRatio,
    });

    const result: StrategyCompositionResult = deepFreeze({
      compositionId: input.compositionId,
      evaluationId: input.evaluationId,
      correlationId: input.correlationId,
      composedStrategyId: input.composedStrategyId,
      composedStrategyInstanceId: input.composedStrategyInstanceId,
      timestamp: input.timestamp,
      action,
      direction,
      confidence,
      score: normalizedScore,
      consensusRatio,
      signal,
      orderIntent,
      contributions: [...contributions].sort(compareContributions),
      voteSummary,
      diagnostics,
      metadata: input.metadata,
    });

    this.record(result);
    return result;
  }

  public getSnapshot(): StrategyCompositionSnapshot {
    return deepFreeze({
      totalCompositions: this.totalCompositions,
      totalSignalsProduced: this.totalSignalsProduced,
      totalOrderIntentsProduced: this.totalOrderIntentsProduced,
      totalConflicts: this.totalConflicts,
      lastCompositionId: this.lastCompositionId,
      updatedAt: this.updatedAt,
    });
  }

  public getHistory(limit?: number): readonly StrategyCompositionResult[] {
    const effectiveLimit = limit ?? this.history.length;
    if (!Number.isInteger(effectiveLimit) || effectiveLimit < 0) {
      throw new Error("History limit must be a non-negative integer.");
    }
    return deepFreeze(this.history.slice(-effectiveLimit));
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  private resolveAction(
    policy: StrategyCompositionConflictPolicy,
    contributions: readonly StrategyCompositionContribution[],
    highestAction: StrategySignalAction,
    netScore: number,
    conflict: boolean,
  ): StrategySignalAction {
    if (contributions.length === 0) {
      return "HOLD";
    }

    if (conflict && policy === "HOLD_ON_CONFLICT") {
      return "HOLD";
    }

    if (policy === "NET_SCORE") {
      if (netScore > EPSILON) {
        return "BUY";
      }
      if (netScore < -EPSILON) {
        return "SELL";
      }
      return highestAction;
    }

    if (policy === "PRIORITY") {
      return [...contributions].sort(compareContributions)[0]?.action ?? "HOLD";
    }

    if (policy === "HIGHEST_CONFIDENCE") {
      return [...contributions].sort((left, right) => {
        if (left.confidence !== right.confidence) {
          return right.confidence - left.confidence;
        }
        return compareContributions(left, right);
      })[0]?.action ?? "HOLD";
    }

    return highestAction;
  }

  private findSignal(
    signals: readonly StrategySignal[],
    contribution?: StrategyCompositionContribution,
  ): StrategySignal | undefined {
    if (contribution === undefined) {
      return undefined;
    }
    return signals.find((signal) => signal.signalId === contribution.signalId);
  }

  private createComposedSignal(
    input: StrategyCompositionInput,
    action: StrategySignalAction,
    direction: StrategyDirection,
    confidence: number,
    score: number,
    winningSignal: StrategySignal | undefined,
    winningContributions: readonly StrategyCompositionContribution[],
    policy: StrategyCompositionPolicy,
  ): StrategySignal {
    const identity = deterministicHash(
      `${input.compositionId}|${input.evaluationId}|${action}|signal`,
    );
    const evidence = policy.preserveWinningEvidence
      ? winningContributions.flatMap((contribution) => {
          const source = this.findSignal(input.signals, contribution);
          return source?.evidence ?? [];
        })
      : [];

    return deepFreeze({
      signalId: `composition-signal-${identity}` as StrategySignalId,
      evaluationId: input.evaluationId,
      strategyId: input.composedStrategyId,
      strategyInstanceId: input.composedStrategyInstanceId,
      correlationId: input.correlationId,
      instrument: input.instrument,
      action,
      direction,
      confidence,
      score,
      referencePrice:
        winningSignal?.referencePrice ??
        this.resolveReferencePrice(input.signals),
      targetPrice: winningSignal?.targetPrice,
      stopLossPrice: winningSignal?.stopLossPrice,
      takeProfitPrice: winningSignal?.takeProfitPrice,
      suggestedQuantity: this.aggregateSuggestedQuantity(
        input.signals,
        winningContributions,
      ),
      suggestedNotional: this.aggregateSuggestedNotional(
        input.signals,
        winningContributions,
      ),
      suggestedRiskAmount: winningSignal?.suggestedRiskAmount,
      suggestedLeverage: winningSignal?.suggestedLeverage,
      reason: `Composed ${action} decision from ${winningContributions.length} contributing strategies.`,
      evidence,
      validity: {
        generatedAt: input.timestamp,
        validFrom: input.timestamp,
        validUntil: this.minimumValidUntil(input.signals, winningContributions),
      },
      tags: ["strategy-composition", `composition:${input.compositionId}`],
      metadata: input.metadata,
    });
  }

  private createComposedOrderIntent(
    input: StrategyCompositionInput,
    action: StrategySignalAction,
    signal: StrategySignal | undefined,
    winningContributions: readonly StrategyCompositionContribution[],
    policy: StrategyCompositionPolicy,
  ): StrategyOrderIntent | undefined {
    if (policy.orderPolicy === "NONE" || signal === undefined) {
      return undefined;
    }

    const side = actionToSide(action);
    if (side === undefined) {
      return undefined;
    }

    const winningIds = new Set(
      winningContributions.map((item) => item.strategyInstanceId),
    );
    const candidateIntents = input.orderIntents.filter(
      (intent) => intent.side === side && winningIds.has(intent.strategyInstanceId),
    );
    if (candidateIntents.length === 0) {
      return undefined;
    }

    const selected = [...candidateIntents].sort((left, right) =>
      left.orderIntentId.localeCompare(right.orderIntentId),
    );
    const representative = selected[0];
    if (representative === undefined) {
      return undefined;
    }

    let quantity =
      policy.orderPolicy === "WINNING_SIDE_ONLY"
        ? representative.quantity
        : selected.reduce((sum, intent) => sum + intent.quantity, 0);

    if (policy.maximumOrderQuantity !== undefined) {
      quantity = Math.min(quantity, policy.maximumOrderQuantity);
    }

    const price = representative.limitPrice ?? signal.referencePrice;
    if (policy.maximumOrderNotional !== undefined && price > 0) {
      quantity = Math.min(quantity, policy.maximumOrderNotional / price);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return undefined;
    }

    const identity = deterministicHash(
      `${input.compositionId}|${input.evaluationId}|${side}|order`,
    );

    return deepFreeze({
      ...representative,
      orderIntentId: `composition-order-${identity}` as StrategyOrderIntentId,
      signalId: signal.signalId,
      evaluationId: input.evaluationId,
      strategyId: input.composedStrategyId,
      strategyInstanceId: input.composedStrategyInstanceId,
      correlationId: input.correlationId,
      instrument: input.instrument,
      quantity,
      reason: `Composed ${side} order from ${selected.length} contributing strategy intents.`,
      tags: [
        ...new Set([
          ...representative.tags,
          "strategy-composition",
          `composition:${input.compositionId}`,
        ]),
      ],
      metadata: input.metadata,
    });
  }

  private resolveReferencePrice(signals: readonly StrategySignal[]): number {
    const prices = signals
      .map((signal) => signal.referencePrice)
      .filter((price) => Number.isFinite(price) && price > 0);
    if (prices.length === 0) {
      return 0;
    }
    return prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  private aggregateSuggestedQuantity(
    signals: readonly StrategySignal[],
    contributions: readonly StrategyCompositionContribution[],
  ): number | undefined {
    const ids = new Set(contributions.map((item) => item.signalId));
    const values = signals
      .filter((signal) => ids.has(signal.signalId))
      .map((signal) => signal.suggestedQuantity)
      .filter((value): value is number => value !== undefined);
    return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0);
  }

  private aggregateSuggestedNotional(
    signals: readonly StrategySignal[],
    contributions: readonly StrategyCompositionContribution[],
  ): number | undefined {
    const ids = new Set(contributions.map((item) => item.signalId));
    const values = signals
      .filter((signal) => ids.has(signal.signalId))
      .map((signal) => signal.suggestedNotional)
      .filter((value): value is number => value !== undefined);
    return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0);
  }

  private minimumValidUntil(
    signals: readonly StrategySignal[],
    contributions: readonly StrategyCompositionContribution[],
  ): UnixTimestampMilliseconds | undefined {
    const ids = new Set(contributions.map((item) => item.signalId));
    const values = signals
      .filter((signal) => ids.has(signal.signalId))
      .map((signal) => signal.validity.validUntil)
      .filter(
        (value): value is UnixTimestampMilliseconds => value !== undefined,
      );
    return values.length === 0 ? undefined : Math.min(...values);
  }

  private record(result: StrategyCompositionResult): void {
    this.totalCompositions += 1;
    this.totalSignalsProduced += result.signal === undefined ? 0 : 1;
    this.totalOrderIntentsProduced += result.orderIntent === undefined ? 0 : 1;
    this.lastCompositionId = result.compositionId;
    this.updatedAt = result.timestamp;

    if (this.historyLimit > 0) {
      this.history.push(result);
      if (this.history.length > this.historyLimit) {
        this.history.splice(0, this.history.length - this.historyLimit);
      }
    }
  }
}