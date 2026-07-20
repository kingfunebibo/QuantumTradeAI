/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 10: Deterministic confidence calibration engine.
 *
 * Responsibilities:
 * - register and manage immutable confidence-calibration profiles
 * - resolve the most appropriate profile deterministically
 * - calibrate raw model confidence using supported calibration methods
 * - enforce model, strategy, regime, and validity constraints
 * - preserve bounded immutable calibration history
 * - expose deterministic runtime metrics and snapshots
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiModelReference,
  type AiStrategyMetadata,
  type AiStrategyTimestamp,
  type ConfidenceCalibrationMethod,
  type ConfidenceCalibrationProfile,
  type ConfidenceCalibrationRequest,
  type ConfidenceCalibrationResult,
  type MarketRegime,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export type ConfidenceCalibrationProfileStatus =
  | "ACTIVE"
  | "NOT_YET_VALID"
  | "EXPIRED";

export interface ConfidenceCalibrationEngineOptions {
  readonly maximumProfiles?: number;
  readonly maximumHistoryEntries?: number;
  readonly rejectExpiredProfiles?: boolean;
  readonly rejectFutureProfiles?: boolean;
  readonly rejectModelMismatch?: boolean;
  readonly clampInputConfidence?: boolean;
  readonly clampOutputConfidence?: boolean;
  readonly epsilon?: number;
  readonly clock?: () => AiStrategyTimestamp;
  readonly validator?: AiStrategyContractValidator;
  readonly metadata?: AiStrategyMetadata;
}

export interface ConfidenceCalibrationProfileQuery {
  readonly profileId?: string;
  readonly strategyId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly method?: ConfidenceCalibrationMethod;
  readonly status?: ConfidenceCalibrationProfileStatus;
  readonly timestamp?: AiStrategyTimestamp;
  readonly limit?: number;
}

export interface ConfidenceCalibrationHistoryQuery {
  readonly requestId?: string;
  readonly profileId?: string;
  readonly method?: ConfidenceCalibrationMethod;
  readonly fromCalibratedAt?: AiStrategyTimestamp;
  readonly toCalibratedAt?: AiStrategyTimestamp;
  readonly minimumRawConfidence?: number;
  readonly maximumRawConfidence?: number;
  readonly minimumCalibratedConfidence?: number;
  readonly maximumCalibratedConfidence?: number;
  readonly limit?: number;
}

export interface ConfidenceCalibrationMetrics {
  readonly registeredProfileCount: number;
  readonly activeProfileCount: number;
  readonly calibrationCount: number;
  readonly uncalibratedCount: number;
  readonly warningCount: number;
  readonly averageRawConfidence: number;
  readonly averageCalibratedConfidence: number;
  readonly averageAbsoluteAdjustment: number;
  readonly maximumAbsoluteAdjustment: number;
  readonly methodCounts: Readonly<Record<ConfidenceCalibrationMethod, number>>;
}

export interface ConfidenceCalibrationEngineSnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly profiles: readonly ConfidenceCalibrationProfile[];
  readonly history: readonly ConfidenceCalibrationResult[];
  readonly metrics: ConfidenceCalibrationMetrics;
  readonly metadata: AiStrategyMetadata;
}

interface ResolvedProfile {
  readonly profile?: ConfidenceCalibrationProfile;
  readonly warnings: readonly string[];
}

interface CalibrationComputation {
  readonly confidence: number;
  readonly warnings: readonly string[];
}

interface IsotonicPoint {
  readonly x: number;
  readonly y: number;
  readonly sequence: number;
}

interface HistogramBin {
  readonly lower: number;
  readonly upper: number;
  readonly value: number;
  readonly sequence: number;
}

const DEFAULT_MAXIMUM_PROFILES = 1_000;
const DEFAULT_MAXIMUM_HISTORY_ENTRIES = 10_000;
const DEFAULT_EPSILON = 1e-12;

const CALIBRATION_METHODS: readonly ConfidenceCalibrationMethod[] =
  Object.freeze([
    "NONE",
    "PLATT_SCALING",
    "ISOTONIC",
    "TEMPERATURE",
    "BETA",
    "HISTOGRAM",
    "CUSTOM",
  ]);

const DEFAULT_METHOD_COUNTS: Readonly<
  Record<ConfidenceCalibrationMethod, number>
> = Object.freeze({
  NONE: 0,
  PLATT_SCALING: 0,
  ISOTONIC: 0,
  TEMPERATURE: 0,
  BETA: 0,
  HISTOGRAM: 0,
  CUSTOM: 0,
});

function assertNonEmptyString(value: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
}

function assertFiniteNumber(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
}

function assertPositiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${path} must be a positive integer.`);
  }
}

function assertProbability(value: number, path: string): void {
  assertFiniteNumber(value, path);
  if (value < 0 || value > 1) {
    throw new RangeError(`${path} must be between zero and one.`);
  }
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const cloned: Record<string, string | number | boolean | null | readonly (
    string | number | boolean | null
  )[]> = {};

  for (const [key, value] of Object.entries(metadata)) {
    cloned[key] = Array.isArray(value)
      ? Object.freeze([...value])
      : value;
  }

  return Object.freeze(cloned);
}

function cloneModel(reference: AiModelReference): AiModelReference {
  return Object.freeze({
    providerId: reference.providerId,
    modelId: reference.modelId,
    modelVersion: reference.modelVersion,
  });
}

function cloneProfile(
  profile: ConfidenceCalibrationProfile,
): ConfidenceCalibrationProfile {
  return Object.freeze({
    profileId: profile.profileId,
    strategyId: profile.strategyId,
    model: cloneModel(profile.model),
    method: profile.method,
    trainedAt: profile.trainedAt,
    validFrom: profile.validFrom,
    validUntil: profile.validUntil,
    sampleCount: profile.sampleCount,
    expectedCalibrationError: profile.expectedCalibrationError,
    parameters: Object.freeze({ ...profile.parameters }),
    metadata: cloneMetadata(profile.metadata),
  });
}

function cloneResult(
  result: ConfidenceCalibrationResult,
): ConfidenceCalibrationResult {
  return Object.freeze({
    requestId: result.requestId,
    rawConfidence: result.rawConfidence,
    calibratedConfidence: result.calibratedConfidence,
    method: result.method,
    profileId: result.profileId,
    warnings: Object.freeze([...result.warnings]),
    calibratedAt: result.calibratedAt,
    metadata: cloneMetadata(result.metadata),
  });
}

function sameModel(
  left: AiModelReference,
  right: AiModelReference,
): boolean {
  return (
    left.providerId === right.providerId &&
    left.modelId === right.modelId &&
    left.modelVersion === right.modelVersion
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }

  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function profileStatus(
  profile: ConfidenceCalibrationProfile,
  timestamp: AiStrategyTimestamp,
): ConfidenceCalibrationProfileStatus {
  if (timestamp < profile.validFrom) {
    return "NOT_YET_VALID";
  }
  if (
    profile.validUntil !== undefined &&
    timestamp > profile.validUntil
  ) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

function compareProfiles(
  left: ConfidenceCalibrationProfile,
  right: ConfidenceCalibrationProfile,
): number {
  if (left.validFrom !== right.validFrom) {
    return right.validFrom - left.validFrom;
  }
  if (left.trainedAt !== right.trainedAt) {
    return right.trainedAt - left.trainedAt;
  }
  if (left.sampleCount !== right.sampleCount) {
    return right.sampleCount - left.sampleCount;
  }
  return left.profileId.localeCompare(right.profileId);
}

function compareResults(
  left: ConfidenceCalibrationResult,
  right: ConfidenceCalibrationResult,
): number {
  if (left.calibratedAt !== right.calibratedAt) {
    return left.calibratedAt - right.calibratedAt;
  }
  return left.requestId.localeCompare(right.requestId);
}

export class ConfidenceCalibrationEngine {
  private readonly options: Required<
    Omit<ConfidenceCalibrationEngineOptions, "metadata">
  > & {
    readonly metadata: AiStrategyMetadata;
  };

  private readonly profiles = new Map<
    string,
    ConfidenceCalibrationProfile
  >();

  private readonly history: ConfidenceCalibrationResult[] = [];

  public constructor(options: ConfidenceCalibrationEngineOptions = {}) {
    const maximumProfiles =
      options.maximumProfiles ?? DEFAULT_MAXIMUM_PROFILES;
    const maximumHistoryEntries =
      options.maximumHistoryEntries ??
      DEFAULT_MAXIMUM_HISTORY_ENTRIES;
    const epsilon = options.epsilon ?? DEFAULT_EPSILON;

    assertPositiveInteger(maximumProfiles, "options.maximumProfiles");
    assertPositiveInteger(
      maximumHistoryEntries,
      "options.maximumHistoryEntries",
    );
    assertFiniteNumber(epsilon, "options.epsilon");
    if (epsilon <= 0 || epsilon >= 0.5) {
      throw new RangeError(
        "options.epsilon must be greater than zero and less than 0.5.",
      );
    }

    this.options = Object.freeze({
      maximumProfiles,
      maximumHistoryEntries,
      rejectExpiredProfiles: options.rejectExpiredProfiles ?? false,
      rejectFutureProfiles: options.rejectFutureProfiles ?? false,
      rejectModelMismatch: options.rejectModelMismatch ?? true,
      clampInputConfidence: options.clampInputConfidence ?? false,
      clampOutputConfidence: options.clampOutputConfidence ?? true,
      epsilon,
      clock: options.clock ?? (() => Date.now()),
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      metadata: cloneMetadata(options.metadata),
    });
  }

  public registerProfile(
    profile: ConfidenceCalibrationProfile,
    replace = false,
  ): ConfidenceCalibrationProfile {
    this.options.validator.assertValid(
      this.options.validator.validateCalibrationProfile(profile),
      "Confidence calibration profile validation failed.",
    );

    const existing = this.profiles.get(profile.profileId);
    if (existing !== undefined && !replace) {
      throw new Error(
        `Confidence calibration profile '${profile.profileId}' is already registered.`,
      );
    }

    if (
      existing === undefined &&
      this.profiles.size >= this.options.maximumProfiles
    ) {
      throw new Error(
        `Confidence calibration profile capacity of ${this.options.maximumProfiles} has been reached.`,
      );
    }

    this.validateMethodParameters(profile);
    const frozen = cloneProfile(profile);
    this.profiles.set(frozen.profileId, frozen);
    return frozen;
  }

  public registerProfiles(
    profiles: readonly ConfidenceCalibrationProfile[],
    replace = false,
  ): readonly ConfidenceCalibrationProfile[] {
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (seen.has(profile.profileId)) {
        throw new Error(
          `Duplicate confidence calibration profile '${profile.profileId}' was supplied.`,
        );
      }
      seen.add(profile.profileId);
    }

    const previous = new Map(this.profiles);
    try {
      return Object.freeze(
        profiles.map((profile) => this.registerProfile(profile, replace)),
      );
    } catch (error) {
      this.profiles.clear();
      for (const [profileId, profile] of previous) {
        this.profiles.set(profileId, profile);
      }
      throw error;
    }
  }

  public unregisterProfile(profileId: string): boolean {
    assertNonEmptyString(profileId, "profileId");
    return this.profiles.delete(profileId);
  }

  public hasProfile(profileId: string): boolean {
    assertNonEmptyString(profileId, "profileId");
    return this.profiles.has(profileId);
  }

  public getProfile(
    profileId: string,
  ): ConfidenceCalibrationProfile | undefined {
    assertNonEmptyString(profileId, "profileId");
    return this.profiles.get(profileId);
  }

  public listProfiles(
    query: ConfidenceCalibrationProfileQuery = {},
  ): readonly ConfidenceCalibrationProfile[] {
    const timestamp = query.timestamp ?? this.options.clock();
    const limit = query.limit ?? this.options.maximumProfiles;
    assertPositiveInteger(limit, "query.limit");

    return Object.freeze(
      [...this.profiles.values()]
        .filter((profile) => {
          if (
            query.profileId !== undefined &&
            profile.profileId !== query.profileId
          ) {
            return false;
          }
          if (
            query.strategyId !== undefined &&
            profile.strategyId !== query.strategyId
          ) {
            return false;
          }
          if (
            query.providerId !== undefined &&
            profile.model.providerId !== query.providerId
          ) {
            return false;
          }
          if (
            query.modelId !== undefined &&
            profile.model.modelId !== query.modelId
          ) {
            return false;
          }
          if (
            query.modelVersion !== undefined &&
            profile.model.modelVersion !== query.modelVersion
          ) {
            return false;
          }
          if (
            query.method !== undefined &&
            profile.method !== query.method
          ) {
            return false;
          }
          if (
            query.status !== undefined &&
            profileStatus(profile, timestamp) !== query.status
          ) {
            return false;
          }
          return true;
        })
        .sort(compareProfiles)
        .slice(0, limit),
    );
  }

  public calibrate(
    request: ConfidenceCalibrationRequest,
  ): ConfidenceCalibrationResult {
    this.validateRequest(request);

    const calibratedAt = this.options.clock();
    const normalizedRawConfidence = this.normalizeRawConfidence(
      request.rawConfidence,
    );
    const resolution = this.resolveProfile(request);

    if (resolution.profile === undefined) {
      return this.recordResult({
        requestId: request.requestId,
        rawConfidence: request.rawConfidence,
        calibratedConfidence: normalizedRawConfidence,
        method: "NONE",
        warnings: resolution.warnings,
        calibratedAt,
        metadata: cloneMetadata(request.metadata),
      });
    }

    const computation = this.compute(
      normalizedRawConfidence,
      resolution.profile,
      request.regime,
    );
    const calibratedConfidence = this.normalizeOutputConfidence(
      computation.confidence,
    );

    return this.recordResult({
      requestId: request.requestId,
      rawConfidence: request.rawConfidence,
      calibratedConfidence,
      method: resolution.profile.method,
      profileId: resolution.profile.profileId,
      warnings: Object.freeze([
        ...resolution.warnings,
        ...computation.warnings,
      ]),
      calibratedAt,
      metadata: cloneMetadata(request.metadata),
    });
  }

  public queryHistory(
    query: ConfidenceCalibrationHistoryQuery = {},
  ): readonly ConfidenceCalibrationResult[] {
    const limit = query.limit ?? this.options.maximumHistoryEntries;
    assertPositiveInteger(limit, "query.limit");

    if (
      query.fromCalibratedAt !== undefined &&
      query.toCalibratedAt !== undefined &&
      query.fromCalibratedAt > query.toCalibratedAt
    ) {
      throw new RangeError(
        "query.fromCalibratedAt cannot exceed query.toCalibratedAt.",
      );
    }

    return Object.freeze(
      this.history
        .filter((result) => {
          if (
            query.requestId !== undefined &&
            result.requestId !== query.requestId
          ) {
            return false;
          }
          if (
            query.profileId !== undefined &&
            result.profileId !== query.profileId
          ) {
            return false;
          }
          if (
            query.method !== undefined &&
            result.method !== query.method
          ) {
            return false;
          }
          if (
            query.fromCalibratedAt !== undefined &&
            result.calibratedAt < query.fromCalibratedAt
          ) {
            return false;
          }
          if (
            query.toCalibratedAt !== undefined &&
            result.calibratedAt > query.toCalibratedAt
          ) {
            return false;
          }
          if (
            query.minimumRawConfidence !== undefined &&
            result.rawConfidence < query.minimumRawConfidence
          ) {
            return false;
          }
          if (
            query.maximumRawConfidence !== undefined &&
            result.rawConfidence > query.maximumRawConfidence
          ) {
            return false;
          }
          if (
            query.minimumCalibratedConfidence !== undefined &&
            result.calibratedConfidence <
              query.minimumCalibratedConfidence
          ) {
            return false;
          }
          if (
            query.maximumCalibratedConfidence !== undefined &&
            result.calibratedConfidence >
              query.maximumCalibratedConfidence
          ) {
            return false;
          }
          return true;
        })
        .sort(compareResults)
        .slice(-limit),
    );
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public metrics(
    timestamp: AiStrategyTimestamp = this.options.clock(),
  ): ConfidenceCalibrationMetrics {
    assertFiniteNumber(timestamp, "timestamp");

    const methodCounts: Record<ConfidenceCalibrationMethod, number> = {
      ...DEFAULT_METHOD_COUNTS,
    };

    let rawTotal = 0;
    let calibratedTotal = 0;
    let absoluteAdjustmentTotal = 0;
    let maximumAbsoluteAdjustment = 0;
    let warningCount = 0;

    for (const result of this.history) {
      methodCounts[result.method] += 1;
      rawTotal += result.rawConfidence;
      calibratedTotal += result.calibratedConfidence;
      warningCount += result.warnings.length;

      const adjustment = Math.abs(
        result.calibratedConfidence - result.rawConfidence,
      );
      absoluteAdjustmentTotal += adjustment;
      maximumAbsoluteAdjustment = Math.max(
        maximumAbsoluteAdjustment,
        adjustment,
      );
    }

    const count = this.history.length;
    return Object.freeze({
      registeredProfileCount: this.profiles.size,
      activeProfileCount: [...this.profiles.values()].filter(
        (profile) => profileStatus(profile, timestamp) === "ACTIVE",
      ).length,
      calibrationCount: count,
      uncalibratedCount: methodCounts.NONE,
      warningCount,
      averageRawConfidence: count === 0 ? 0 : rawTotal / count,
      averageCalibratedConfidence:
        count === 0 ? 0 : calibratedTotal / count,
      averageAbsoluteAdjustment:
        count === 0 ? 0 : absoluteAdjustmentTotal / count,
      maximumAbsoluteAdjustment,
      methodCounts: Object.freeze(methodCounts),
    });
  }

  public snapshot(): ConfidenceCalibrationEngineSnapshot {
    const capturedAt = this.options.clock();
    return Object.freeze({
      capturedAt,
      profiles: Object.freeze(
        [...this.profiles.values()].sort(compareProfiles),
      ),
      history: Object.freeze([...this.history].sort(compareResults)),
      metrics: this.metrics(capturedAt),
      metadata: this.options.metadata,
    });
  }

  private validateRequest(
    request: ConfidenceCalibrationRequest,
  ): void {
    assertNonEmptyString(request.requestId, "request.requestId");
    assertFiniteNumber(
      request.rawConfidence,
      "request.rawConfidence",
    );
    assertNonEmptyString(
      request.model.providerId,
      "request.model.providerId",
    );
    assertNonEmptyString(
      request.model.modelId,
      "request.model.modelId",
    );
    assertNonEmptyString(
      request.model.modelVersion,
      "request.model.modelVersion",
    );
    assertFiniteNumber(request.timestamp, "request.timestamp");

    if (!this.options.clampInputConfidence) {
      assertProbability(
        request.rawConfidence,
        "request.rawConfidence",
      );
    }

    if (request.profile !== undefined) {
      this.options.validator.assertValid(
        this.options.validator.validateCalibrationProfile(
          request.profile,
        ),
        "Confidence calibration request profile validation failed.",
      );
      this.validateMethodParameters(request.profile);
    }
  }

  private normalizeRawConfidence(rawConfidence: number): number {
    return this.options.clampInputConfidence
      ? clamp(rawConfidence, 0, 1)
      : rawConfidence;
  }

  private normalizeOutputConfidence(confidence: number): number {
    if (!Number.isFinite(confidence)) {
      throw new Error(
        "Confidence calibration produced a non-finite value.",
      );
    }

    if (this.options.clampOutputConfidence) {
      return clamp(confidence, 0, 1);
    }

    assertProbability(confidence, "calibratedConfidence");
    return confidence;
  }

  private resolveProfile(
    request: ConfidenceCalibrationRequest,
  ): ResolvedProfile {
    const warnings: string[] = [];

    if (request.profile !== undefined) {
      const accepted = this.acceptProfile(
        request.profile,
        request,
        warnings,
      );
      return Object.freeze({
        profile: accepted ? cloneProfile(request.profile) : undefined,
        warnings: Object.freeze(warnings),
      });
    }

    const candidates = [...this.profiles.values()]
      .filter((profile) => sameModel(profile.model, request.model))
      .filter((profile) => {
        const status = profileStatus(profile, request.timestamp);
        return status === "ACTIVE";
      })
      .sort(compareProfiles);

    const profile = candidates[0];
    if (profile === undefined) {
      warnings.push(
        `No active confidence calibration profile was found for model '${request.model.providerId}/${request.model.modelId}@${request.model.modelVersion}'.`,
      );
    }

    return Object.freeze({
      profile,
      warnings: Object.freeze(warnings),
    });
  }

  private acceptProfile(
    profile: ConfidenceCalibrationProfile,
    request: ConfidenceCalibrationRequest,
    warnings: string[],
  ): boolean {
    if (!sameModel(profile.model, request.model)) {
      const message =
        `Calibration profile '${profile.profileId}' does not match ` +
        `request model '${request.model.providerId}/${request.model.modelId}@${request.model.modelVersion}'.`;

      if (this.options.rejectModelMismatch) {
        throw new Error(message);
      }
      warnings.push(message);
      return false;
    }

    const status = profileStatus(profile, request.timestamp);
    if (status === "NOT_YET_VALID") {
      const message =
        `Calibration profile '${profile.profileId}' is not valid until ${profile.validFrom}.`;
      if (this.options.rejectFutureProfiles) {
        throw new Error(message);
      }
      warnings.push(message);
      return false;
    }

    if (status === "EXPIRED") {
      const message =
        `Calibration profile '${profile.profileId}' expired at ${profile.validUntil}.`;
      if (this.options.rejectExpiredProfiles) {
        throw new Error(message);
      }
      warnings.push(message);
      return false;
    }

    return true;
  }

  private compute(
    rawConfidence: number,
    profile: ConfidenceCalibrationProfile,
    regime: MarketRegime | undefined,
  ): CalibrationComputation {
    const regimeAdjustment = this.regimeAdjustment(
      profile,
      regime,
    );
    const warnings: string[] = [];

    let confidence: number;
    switch (profile.method) {
      case "NONE":
        confidence = rawConfidence;
        break;
      case "PLATT_SCALING":
        confidence = this.plattScale(
          rawConfidence,
          profile.parameters,
        );
        break;
      case "ISOTONIC":
        confidence = this.isotonicScale(
          rawConfidence,
          profile.parameters,
        );
        break;
      case "TEMPERATURE":
        confidence = this.temperatureScale(
          rawConfidence,
          profile.parameters,
        );
        break;
      case "BETA":
        confidence = this.betaScale(
          rawConfidence,
          profile.parameters,
        );
        break;
      case "HISTOGRAM":
        confidence = this.histogramScale(
          rawConfidence,
          profile.parameters,
        );
        break;
      case "CUSTOM":
        confidence = this.customScale(
          rawConfidence,
          profile.parameters,
        );
        warnings.push(
          "CUSTOM calibration uses the deterministic affine-logistic parameter contract.",
        );
        break;
      default:
        confidence = this.assertNever(profile.method);
    }

    if (regimeAdjustment !== 0) {
      confidence += regimeAdjustment;
      warnings.push(
        `Applied regime confidence adjustment ${regimeAdjustment} for '${regime}'.`,
      );
    }

    return Object.freeze({
      confidence,
      warnings: Object.freeze(warnings),
    });
  }

  private plattScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const slope = parameters.slope ?? parameters.a ?? 1;
    const intercept = parameters.intercept ?? parameters.b ?? 0;
    return sigmoid(
      slope * this.logit(confidence) + intercept,
    );
  }

  private temperatureScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const temperature = parameters.temperature ?? 1;
    return sigmoid(this.logit(confidence) / temperature);
  }

  private betaScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const bounded = clamp(
      confidence,
      this.options.epsilon,
      1 - this.options.epsilon,
    );
    const alpha = parameters.alpha ?? parameters.a ?? 1;
    const beta = parameters.beta ?? parameters.b ?? 1;
    const intercept = parameters.intercept ?? parameters.c ?? 0;

    return sigmoid(
      alpha * Math.log(bounded) -
        beta * Math.log(1 - bounded) +
        intercept,
    );
  }

  private isotonicScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const points = this.isotonicPoints(parameters);
    if (points.length === 0) {
      return confidence;
    }
    if (confidence <= points[0]!.x) {
      return points[0]!.y;
    }
    if (confidence >= points[points.length - 1]!.x) {
      return points[points.length - 1]!.y;
    }

    for (let index = 1; index < points.length; index += 1) {
      const right = points[index]!;
      const left = points[index - 1]!;
      if (confidence <= right.x) {
        const width = right.x - left.x;
        if (width <= this.options.epsilon) {
          return right.y;
        }
        const ratio = (confidence - left.x) / width;
        return left.y + ratio * (right.y - left.y);
      }
    }

    return confidence;
  }

  private histogramScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const bins = this.histogramBins(parameters);
    const matching = bins.find(
      (bin, index) =>
        confidence >= bin.lower &&
        (confidence < bin.upper ||
          (index === bins.length - 1 && confidence <= bin.upper)),
    );
    return matching?.value ?? confidence;
  }

  private customScale(
    confidence: number,
    parameters: Readonly<Record<string, number>>,
  ): number {
    const slope = parameters.slope ?? 1;
    const intercept = parameters.intercept ?? 0;
    const power = parameters.power ?? 1;
    const offset = parameters.offset ?? 0;

    const powered = Math.pow(
      clamp(confidence, 0, 1),
      power,
    );
    return sigmoid(slope * this.logit(powered) + intercept) + offset;
  }

  private regimeAdjustment(
    profile: ConfidenceCalibrationProfile,
    regime: MarketRegime | undefined,
  ): number {
    if (regime === undefined) {
      return 0;
    }

    const direct = profile.parameters[`regime.${regime}`];
    const underscored =
      profile.parameters[`regime_${regime.toLowerCase()}`];
    return direct ?? underscored ?? 0;
  }

  private logit(probability: number): number {
    const bounded = clamp(
      probability,
      this.options.epsilon,
      1 - this.options.epsilon,
    );
    return Math.log(bounded / (1 - bounded));
  }

  private isotonicPoints(
    parameters: Readonly<Record<string, number>>,
  ): readonly IsotonicPoint[] {
    const pointMap = new Map<
      number,
      Partial<Pick<IsotonicPoint, "x" | "y">>
    >();

    for (const [key, value] of Object.entries(parameters)) {
      const match = /^(?:point\.)?(\d+)\.(x|y)$/.exec(key);
      if (match === null) {
        continue;
      }
      const sequence = Number(match[1]);
      const coordinate = match[2] as "x" | "y";
      const current = pointMap.get(sequence) ?? {};
      pointMap.set(sequence, {
        ...current,
        [coordinate]: value,
      });
    }

    return Object.freeze(
      [...pointMap.entries()]
        .filter(
          (
            entry,
          ): entry is [
            number,
            Required<Pick<IsotonicPoint, "x" | "y">>,
          ] =>
            entry[1].x !== undefined &&
            entry[1].y !== undefined,
        )
        .map(([sequence, point]) =>
          Object.freeze({
            x: point.x,
            y: point.y,
            sequence,
          }),
        )
        .sort((left, right) => {
          if (left.x !== right.x) {
            return left.x - right.x;
          }
          return left.sequence - right.sequence;
        }),
    );
  }

  private histogramBins(
    parameters: Readonly<Record<string, number>>,
  ): readonly HistogramBin[] {
    const binMap = new Map<
      number,
      Partial<Pick<HistogramBin, "lower" | "upper" | "value">>
    >();

    for (const [key, value] of Object.entries(parameters)) {
      const match =
        /^(?:bin\.)?(\d+)\.(lower|upper|value)$/.exec(key);
      if (match === null) {
        continue;
      }
      const sequence = Number(match[1]);
      const field = match[2] as "lower" | "upper" | "value";
      const current = binMap.get(sequence) ?? {};
      binMap.set(sequence, {
        ...current,
        [field]: value,
      });
    }

    return Object.freeze(
      [...binMap.entries()]
        .filter(
          (
            entry,
          ): entry is [
            number,
            Required<
              Pick<HistogramBin, "lower" | "upper" | "value">
            >,
          ] =>
            entry[1].lower !== undefined &&
            entry[1].upper !== undefined &&
            entry[1].value !== undefined,
        )
        .map(([sequence, bin]) =>
          Object.freeze({
            lower: bin.lower,
            upper: bin.upper,
            value: bin.value,
            sequence,
          }),
        )
        .sort((left, right) => {
          if (left.lower !== right.lower) {
            return left.lower - right.lower;
          }
          return left.sequence - right.sequence;
        }),
    );
  }

  private validateMethodParameters(
    profile: ConfidenceCalibrationProfile,
  ): void {
    for (const [key, value] of Object.entries(profile.parameters)) {
      assertNonEmptyString(key, "profile.parameters key");
      assertFiniteNumber(
        value,
        `profile.parameters.${key}`,
      );
    }

    switch (profile.method) {
      case "NONE":
        return;
      case "PLATT_SCALING":
        return;
      case "TEMPERATURE": {
        const temperature = profile.parameters.temperature ?? 1;
        if (temperature <= 0) {
          throw new RangeError(
            "TEMPERATURE calibration requires parameters.temperature to be greater than zero.",
          );
        }
        return;
      }
      case "BETA":
        return;
      case "ISOTONIC": {
        const points = this.isotonicPoints(profile.parameters);
        if (points.length < 2) {
          throw new RangeError(
            "ISOTONIC calibration requires at least two points using '<index>.x' and '<index>.y' parameters.",
          );
        }
        let previousY = -Infinity;
        for (const point of points) {
          assertProbability(point.x, "isotonic point x");
          assertProbability(point.y, "isotonic point y");
          if (point.y < previousY) {
            throw new RangeError(
              "ISOTONIC calibration point y-values must be monotonically non-decreasing.",
            );
          }
          previousY = point.y;
        }
        return;
      }
      case "HISTOGRAM": {
        const bins = this.histogramBins(profile.parameters);
        if (bins.length === 0) {
          throw new RangeError(
            "HISTOGRAM calibration requires at least one bin using '<index>.lower', '<index>.upper', and '<index>.value' parameters.",
          );
        }
        let previousUpper = -Infinity;
        for (const bin of bins) {
          assertProbability(bin.lower, "histogram bin lower");
          assertProbability(bin.upper, "histogram bin upper");
          assertProbability(bin.value, "histogram bin value");
          if (bin.lower >= bin.upper) {
            throw new RangeError(
              "Each HISTOGRAM calibration bin lower bound must be less than its upper bound.",
            );
          }
          if (bin.lower < previousUpper) {
            throw new RangeError(
              "HISTOGRAM calibration bins must not overlap.",
            );
          }
          previousUpper = bin.upper;
        }
        return;
      }
      case "CUSTOM": {
        const power = profile.parameters.power ?? 1;
        if (power <= 0) {
          throw new RangeError(
            "CUSTOM calibration parameters.power must be greater than zero.",
          );
        }
        return;
      }
      default:
        this.assertNever(profile.method);
    }
  }

  private recordResult(
    result: ConfidenceCalibrationResult,
  ): ConfidenceCalibrationResult {
    const frozen = cloneResult(result);
    this.history.push(frozen);

    if (this.history.length > this.options.maximumHistoryEntries) {
      this.history.splice(
        0,
        this.history.length - this.options.maximumHistoryEntries,
      );
    }

    return frozen;
  }

  private assertNever(value: never): never {
    throw new Error(
      `Unsupported confidence calibration method '${String(value)}'.`,
    );
  }
}

export function createConfidenceCalibrationEngine(
  options: ConfidenceCalibrationEngineOptions = {},
): ConfidenceCalibrationEngine {
  return new ConfidenceCalibrationEngine(options);
}

export function listSupportedConfidenceCalibrationMethods():
  readonly ConfidenceCalibrationMethod[] {
  return CALIBRATION_METHODS;
}