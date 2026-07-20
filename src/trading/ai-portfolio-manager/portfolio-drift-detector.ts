/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * File 4: Portfolio drift detector.
 *
 * Deterministically compares current allocation weights against desired target
 * weights, classifies allocation drift, and reports whether rebalancing is
 * required.
 */

import {
  PortfolioDriftSeverity,
  type PortfolioAllocationTarget,
  type PortfolioDriftDetector,
  type PortfolioDriftReport,
  type PortfolioDriftTarget,
  type PortfolioIdentifier,
  type PortfolioMetadata,
  type PortfolioSnapshotIdentifier,
  type Timestamp,
} from "./ai-portfolio-contracts";

export interface PortfolioDriftDetectorClock {
  now(): number;
}

export interface PortfolioDriftThresholds {
  readonly minor: number;
  readonly moderate: number;
  readonly major: number;
  readonly critical: number;
}

export interface PortfolioDriftDetectorOptions {
  /**
   * Default absolute-weight drift threshold used to determine whether a target
   * exceeds its permitted allocation drift.
   */
  readonly defaultThreshold?: number;

  /**
   * Severity thresholds based on absolute weight drift.
   */
  readonly severityThresholds?: Partial<PortfolioDriftThresholds>;

  /**
   * When true, disabled allocation targets remain visible in the report.
   * Disabled targets never require rebalancing.
   */
  readonly includeDisabledTargets?: boolean;

  /**
   * Numerical tolerance used for comparisons and zero checks.
   */
  readonly weightTolerance?: number;

  /**
   * When true, duplicate targetType/targetId pairs are rejected.
   */
  readonly rejectDuplicateTargets?: boolean;

  /**
   * When true, a target whose current weight violates its configured
   * minimumWeight or maximumWeight requires rebalancing even when its ordinary
   * drift is within the default threshold.
   */
  readonly enforceTargetBounds?: boolean;

  /**
   * Optional metadata copied into the generated report.
   */
  readonly metadata?: PortfolioMetadata;
}

interface ResolvedPortfolioDriftDetectorOptions {
  readonly defaultThreshold: number;
  readonly severityThresholds: PortfolioDriftThresholds;
  readonly includeDisabledTargets: boolean;
  readonly weightTolerance: number;
  readonly rejectDuplicateTargets: boolean;
  readonly enforceTargetBounds: boolean;
  readonly metadata?: PortfolioMetadata;
}

interface EvaluatedTarget {
  readonly driftTarget: PortfolioDriftTarget;
  readonly priorityScore: number;
}

const SYSTEM_CLOCK: PortfolioDriftDetectorClock = Object.freeze({
  now: (): number => Date.now(),
});

const DEFAULT_SEVERITY_THRESHOLDS: PortfolioDriftThresholds =
  Object.freeze({
    minor: 0.01,
    moderate: 0.03,
    major: 0.07,
    critical: 0.15,
  });

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonNegativeNumber(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value < 0) {
    throw new RangeError(
      `${field} must be greater than or equal to zero.`,
    );
  }
}

function assertUnitInterval(value: number, field: string): void {
  assertFiniteNumber(value, field);

  if (value < 0 || value > 1) {
    throw new RangeError(
      `${field} must be between 0 and 1 inclusive.`,
    );
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function resolveOptions(
  options: PortfolioDriftDetectorOptions | undefined,
): ResolvedPortfolioDriftDetectorOptions {
  const thresholds: PortfolioDriftThresholds = Object.freeze({
    minor:
      options?.severityThresholds?.minor ??
      DEFAULT_SEVERITY_THRESHOLDS.minor,
    moderate:
      options?.severityThresholds?.moderate ??
      DEFAULT_SEVERITY_THRESHOLDS.moderate,
    major:
      options?.severityThresholds?.major ??
      DEFAULT_SEVERITY_THRESHOLDS.major,
    critical:
      options?.severityThresholds?.critical ??
      DEFAULT_SEVERITY_THRESHOLDS.critical,
  });

  assertUnitInterval(thresholds.minor, "severityThresholds.minor");
  assertUnitInterval(
    thresholds.moderate,
    "severityThresholds.moderate",
  );
  assertUnitInterval(thresholds.major, "severityThresholds.major");
  assertUnitInterval(
    thresholds.critical,
    "severityThresholds.critical",
  );

  if (thresholds.moderate < thresholds.minor) {
    throw new RangeError(
      "severityThresholds.moderate cannot be lower than minor.",
    );
  }

  if (thresholds.major < thresholds.moderate) {
    throw new RangeError(
      "severityThresholds.major cannot be lower than moderate.",
    );
  }

  if (thresholds.critical < thresholds.major) {
    throw new RangeError(
      "severityThresholds.critical cannot be lower than major.",
    );
  }

  const resolved: ResolvedPortfolioDriftDetectorOptions = {
    defaultThreshold: options?.defaultThreshold ?? thresholds.moderate,
    severityThresholds: thresholds,
    includeDisabledTargets: options?.includeDisabledTargets ?? false,
    weightTolerance: options?.weightTolerance ?? 1e-8,
    rejectDuplicateTargets:
      options?.rejectDuplicateTargets ?? true,
    enforceTargetBounds: options?.enforceTargetBounds ?? true,
    metadata:
      options?.metadata === undefined
        ? undefined
        : Object.freeze({ ...options.metadata }),
  };

  assertUnitInterval(
    resolved.defaultThreshold,
    "options.defaultThreshold",
  );
  assertNonNegativeNumber(
    resolved.weightTolerance,
    "options.weightTolerance",
  );

  return Object.freeze(resolved);
}

function round(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toPrecision(15));
}

function severityRank(severity: PortfolioDriftSeverity): number {
  switch (severity) {
    case PortfolioDriftSeverity.CRITICAL:
      return 4;
    case PortfolioDriftSeverity.MAJOR:
      return 3;
    case PortfolioDriftSeverity.MODERATE:
      return 2;
    case PortfolioDriftSeverity.MINOR:
      return 1;
    case PortfolioDriftSeverity.NONE:
    default:
      return 0;
  }
}

function maximumSeverity(
  left: PortfolioDriftSeverity,
  right: PortfolioDriftSeverity,
): PortfolioDriftSeverity {
  return severityRank(right) > severityRank(left) ? right : left;
}

function classifySeverity(
  absoluteDrift: number,
  thresholds: PortfolioDriftThresholds,
  tolerance: number,
): PortfolioDriftSeverity {
  if (absoluteDrift + tolerance >= thresholds.critical) {
    return PortfolioDriftSeverity.CRITICAL;
  }

  if (absoluteDrift + tolerance >= thresholds.major) {
    return PortfolioDriftSeverity.MAJOR;
  }

  if (absoluteDrift + tolerance >= thresholds.moderate) {
    return PortfolioDriftSeverity.MODERATE;
  }

  if (absoluteDrift + tolerance >= thresholds.minor) {
    return PortfolioDriftSeverity.MINOR;
  }

  return PortfolioDriftSeverity.NONE;
}

function deriveTargetWeight(target: PortfolioAllocationTarget): number {
  if (
    target.minimumWeight !== undefined &&
    target.maximumWeight !== undefined
  ) {
    return (target.minimumWeight + target.maximumWeight) / 2;
  }

  if (target.minimumWeight !== undefined) {
    return target.minimumWeight;
  }

  if (target.maximumWeight !== undefined) {
    return target.maximumWeight;
  }

  return target.currentWeight;
}

function deriveThreshold(
  target: PortfolioAllocationTarget,
  options: ResolvedPortfolioDriftDetectorOptions,
): number {
  if (
    target.minimumWeight !== undefined &&
    target.maximumWeight !== undefined
  ) {
    const targetWeight =
      (target.minimumWeight + target.maximumWeight) / 2;
    const lowerDistance = targetWeight - target.minimumWeight;
    const upperDistance = target.maximumWeight - targetWeight;

    return Math.max(
      options.weightTolerance,
      Math.min(lowerDistance, upperDistance),
    );
  }

  return options.defaultThreshold;
}

function isOutsideConfiguredBounds(
  target: PortfolioAllocationTarget,
  tolerance: number,
): boolean {
  if (
    target.minimumWeight !== undefined &&
    target.currentWeight + tolerance < target.minimumWeight
  ) {
    return true;
  }

  if (
    target.maximumWeight !== undefined &&
    target.currentWeight - tolerance > target.maximumWeight
  ) {
    return true;
  }

  return false;
}

function targetKey(target: PortfolioAllocationTarget): string {
  return `${String(target.targetType)}:${target.targetId}`;
}

function validateTargets(
  targets: readonly PortfolioAllocationTarget[],
  options: ResolvedPortfolioDriftDetectorOptions,
): void {
  if (!Array.isArray(targets)) {
    throw new TypeError("targets must be an array.");
  }

  const seen = new Set<string>();

  targets.forEach((target, index) => {
    const field = `targets[${index}]`;

    assertNonEmptyString(target.targetId, `${field}.targetId`);
    assertUnitInterval(target.currentWeight, `${field}.currentWeight`);
    assertNonNegativeNumber(
      target.currentCapital,
      `${field}.currentCapital`,
    );

    if (target.minimumWeight !== undefined) {
      assertUnitInterval(
        target.minimumWeight,
        `${field}.minimumWeight`,
      );
    }

    if (target.maximumWeight !== undefined) {
      assertUnitInterval(
        target.maximumWeight,
        `${field}.maximumWeight`,
      );
    }

    if (
      target.minimumWeight !== undefined &&
      target.maximumWeight !== undefined &&
      target.maximumWeight < target.minimumWeight
    ) {
      throw new RangeError(
        `${field}.maximumWeight cannot be lower than minimumWeight.`,
      );
    }

    if (target.minimumCapital !== undefined) {
      assertNonNegativeNumber(
        target.minimumCapital,
        `${field}.minimumCapital`,
      );
    }

    if (target.maximumCapital !== undefined) {
      assertNonNegativeNumber(
        target.maximumCapital,
        `${field}.maximumCapital`,
      );
    }

    if (
      target.minimumCapital !== undefined &&
      target.maximumCapital !== undefined &&
      target.maximumCapital < target.minimumCapital
    ) {
      throw new RangeError(
        `${field}.maximumCapital cannot be lower than minimumCapital.`,
      );
    }

    if (options.rejectDuplicateTargets) {
      const key = targetKey(target);

      if (seen.has(key)) {
        throw new Error(`Duplicate portfolio allocation target: ${key}.`);
      }

      seen.add(key);
    }
  });
}

function evaluateTarget(
  target: PortfolioAllocationTarget,
  options: ResolvedPortfolioDriftDetectorOptions,
): EvaluatedTarget {
  const targetWeight = deriveTargetWeight(target);
  const actualWeight = target.currentWeight;
  const signedDrift = actualWeight - targetWeight;
  const absoluteDrift = Math.abs(signedDrift);
  const relativeDrift =
    Math.abs(targetWeight) <= options.weightTolerance
      ? undefined
      : absoluteDrift / Math.abs(targetWeight);
  const threshold = deriveThreshold(target, options);
  const outsideBounds =
    options.enforceTargetBounds &&
    isOutsideConfiguredBounds(target, options.weightTolerance);

  const exceedsThreshold =
    target.enabled &&
    (outsideBounds ||
      absoluteDrift >
        threshold + options.weightTolerance);

  let severity = classifySeverity(
    absoluteDrift,
    options.severityThresholds,
    options.weightTolerance,
  );

  if (!target.enabled || !exceedsThreshold) {
    severity = PortfolioDriftSeverity.NONE;
  } else if (
    outsideBounds &&
    severityRank(severity) <
      severityRank(PortfolioDriftSeverity.MODERATE)
  ) {
    severity = PortfolioDriftSeverity.MODERATE;
  }

  const priorityScore =
    severityRank(severity) * 1_000_000 +
    absoluteDrift * 10_000 +
    (relativeDrift ?? 0);

  const metadata: PortfolioMetadata = Object.freeze({
    ...(target.metadata ?? {}),
    signedDrift: round(signedDrift),
    direction:
      signedDrift > options.weightTolerance
        ? "OVERWEIGHT"
        : signedDrift < -options.weightTolerance
          ? "UNDERWEIGHT"
          : "ON_TARGET",
    outsideConfiguredBounds: outsideBounds,
    enabled: target.enabled,
    priorityScore: round(priorityScore),
  });

  return Object.freeze({
    priorityScore,
    driftTarget: Object.freeze({
      targetType: target.targetType,
      targetId: target.targetId,
      targetWeight: round(targetWeight),
      actualWeight: round(actualWeight),
      absoluteDrift: round(absoluteDrift),
      relativeDrift:
        relativeDrift === undefined
          ? undefined
          : round(relativeDrift),
      threshold: round(threshold),
      exceedsThreshold,
      severity,
      metadata,
    }),
  });
}

function buildDetectedAt(
  detectedAt: Timestamp | undefined,
  clock: PortfolioDriftDetectorClock,
): Timestamp {
  if (detectedAt !== undefined) {
    assertNonEmptyString(detectedAt, "detectedAt");

    if (!Number.isFinite(Date.parse(detectedAt))) {
      throw new RangeError(
        "detectedAt must be a valid ISO-8601 timestamp.",
      );
    }

    return detectedAt;
  }

  const milliseconds = clock.now();
  assertFiniteNumber(milliseconds, "clock.now()");

  return new Date(milliseconds).toISOString();
}

export function detectPortfolioDrift(
  portfolioId: PortfolioIdentifier,
  snapshotId: PortfolioSnapshotIdentifier,
  targets: readonly PortfolioAllocationTarget[],
  detectedAt?: Timestamp,
  options?: PortfolioDriftDetectorOptions,
  clock: PortfolioDriftDetectorClock = SYSTEM_CLOCK,
): PortfolioDriftReport {
  assertNonEmptyString(portfolioId, "portfolioId");
  assertNonEmptyString(snapshotId, "snapshotId");

  if (typeof clock?.now !== "function") {
    throw new TypeError("clock must provide a now() function.");
  }

  const resolved = resolveOptions(options);
  validateTargets(targets, resolved);

  const evaluated = targets
    .filter(
      (target) =>
        target.enabled || resolved.includeDisabledTargets,
    )
    .map((target) => evaluateTarget(target, resolved))
    .sort((left, right) => {
      const priorityDifference =
        right.priorityScore - left.priorityScore;

      if (
        Math.abs(priorityDifference) >
        resolved.weightTolerance
      ) {
        return priorityDifference;
      }

      const typeDifference = String(
        left.driftTarget.targetType,
      ).localeCompare(String(right.driftTarget.targetType));

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return left.driftTarget.targetId.localeCompare(
        right.driftTarget.targetId,
      );
    });

  const driftTargets = Object.freeze(
    evaluated.map((item) => item.driftTarget),
  );

  const totalAbsoluteDrift = driftTargets.reduce(
    (sum, target) => sum + target.absoluteDrift,
    0,
  );

  const maximumTargetDrift = driftTargets.reduce(
    (maximum, target) =>
      Math.max(maximum, target.absoluteDrift),
    0,
  );

  const averageTargetDrift =
    driftTargets.length === 0
      ? 0
      : totalAbsoluteDrift / driftTargets.length;

  let reportSeverity = PortfolioDriftSeverity.NONE;

  for (const target of driftTargets) {
    reportSeverity = maximumSeverity(
      reportSeverity,
      target.severity,
    );
  }

  const rebalanceRequired = driftTargets.some(
    (target) => target.exceedsThreshold,
  );

  const reportMetadata: PortfolioMetadata = Object.freeze({
    ...(resolved.metadata ?? {}),
    evaluatedTargetCount: driftTargets.length,
    enabledTargetCount: targets.filter((target) => target.enabled)
      .length,
    exceededTargetCount: driftTargets.filter(
      (target) => target.exceedsThreshold,
    ).length,
    disabledTargetCount: targets.filter(
      (target) => !target.enabled,
    ).length,
    defaultThreshold: resolved.defaultThreshold,
  });

  return Object.freeze({
    portfolioId,
    snapshotId,
    totalAbsoluteDrift: round(totalAbsoluteDrift),
    maximumTargetDrift: round(maximumTargetDrift),
    averageTargetDrift: round(averageTargetDrift),
    severity: reportSeverity,
    rebalanceRequired,
    targets: driftTargets,
    detectedAt: buildDetectedAt(detectedAt, clock),
    metadata: reportMetadata,
  });
}

export class DeterministicPortfolioDriftDetector
  implements PortfolioDriftDetector
{
  private readonly options: PortfolioDriftDetectorOptions;
  private readonly clock: PortfolioDriftDetectorClock;

  public constructor(
    options: PortfolioDriftDetectorOptions = Object.freeze({}),
    clock: PortfolioDriftDetectorClock = SYSTEM_CLOCK,
  ) {
    resolveOptions(options);

    if (typeof clock?.now !== "function") {
      throw new TypeError("clock must provide a now() function.");
    }

    this.options = Object.freeze({
      ...options,
      severityThresholds:
        options.severityThresholds === undefined
          ? undefined
          : Object.freeze({
              ...options.severityThresholds,
            }),
      metadata:
        options.metadata === undefined
          ? undefined
          : Object.freeze({ ...options.metadata }),
    });
    this.clock = clock;
  }

  public detect(
    portfolioId: PortfolioIdentifier,
    snapshotId: PortfolioSnapshotIdentifier,
    targets: readonly PortfolioAllocationTarget[],
    detectedAt?: Timestamp,
  ): PortfolioDriftReport {
    return detectPortfolioDrift(
      portfolioId,
      snapshotId,
      targets,
      detectedAt,
      this.options,
      this.clock,
    );
  }
}

/**
 * Alias retained for callers that prefer the subsystem naming convention.
 */
export class AIPortfolioDriftDetector extends DeterministicPortfolioDriftDetector {}