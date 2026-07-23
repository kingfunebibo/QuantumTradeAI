/**
 * QuantumTradeAI
 * Milestone 38 — AI Multi-Agent Trading Intelligence & Collaborative Decision System
 *
 * File:
 * src/trading/ai-multi-agent-intelligence/multi-agent-context-builder.ts
 *
 * Deterministic, immutable, replay-safe system-context builder for collaborative
 * multi-agent trading intelligence.
 */

import {
  type MultiAgentContextBuilderPort,
  type MultiAgentFingerprintGenerator,
  type MultiAgentHealthSnapshot,
  type MultiAgentMetadata,
  type MultiAgentRunRequest,
  type MultiAgentSystemContext,
  type MultiAgentTimestamp,
} from "./ai-multi-agent-contracts";

export type MultiAgentContextBuilderErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "STALE_CONTEXT"
  | "FINGERPRINT_MISMATCH";

export interface MultiAgentContextBuilderErrorDetails {
  readonly field?: string;
  readonly requestId?: string;
  readonly contextAgeMs?: number;
  readonly maximumContextAgeMs?: number;
  readonly expectedFingerprint?: string;
  readonly actualFingerprint?: string;
}

export class MultiAgentContextBuilderError extends Error {
  public readonly code: MultiAgentContextBuilderErrorCode;
  public readonly details: MultiAgentContextBuilderErrorDetails;

  public constructor(
    code: MultiAgentContextBuilderErrorCode,
    message: string,
    details: MultiAgentContextBuilderErrorDetails = Object.freeze({}),
  ) {
    super(message);
    this.name = "MultiAgentContextBuilderError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

export interface MultiAgentContextClock {
  now(): MultiAgentTimestamp;
}

export interface MultiAgentContextBuilderOptions {
  readonly clock?: MultiAgentContextClock;
  readonly fingerprintGenerator?: MultiAgentFingerprintGenerator;
  readonly enforceMaximumContextAge?: boolean;
  readonly verifyExistingFingerprint?: boolean;
  readonly rebuildFingerprint?: boolean;
  readonly sortSystemHealthByAgentId?: boolean;
  readonly preserveMetadata?: boolean;
}

interface NormalizedOptions {
  readonly clock: MultiAgentContextClock;
  readonly fingerprintGenerator: MultiAgentFingerprintGenerator;
  readonly enforceMaximumContextAge: boolean;
  readonly verifyExistingFingerprint: boolean;
  readonly rebuildFingerprint: boolean;
  readonly sortSystemHealthByAgentId: boolean;
  readonly preserveMetadata: boolean;
}

const DEFAULT_CLOCK: MultiAgentContextClock = Object.freeze({
  now: () => Date.now() as MultiAgentTimestamp,
});

const DEFAULT_FINGERPRINT_GENERATOR: MultiAgentFingerprintGenerator =
  Object.freeze({
    fingerprint: (value: unknown): string =>
      `mac-${fnv1a64(canonicalJson(value))}`,
  });

export class MultiAgentContextBuilder
  implements MultiAgentContextBuilderPort
{
  private readonly options: NormalizedOptions;

  public constructor(options: MultiAgentContextBuilderOptions = {}) {
    this.options = normalizeOptions(options);
  }

  public build(request: MultiAgentRunRequest): MultiAgentSystemContext {
    validateRequest(request);

    const now = this.options.clock.now();
    assertTimestamp(now, "clock.now()");

    const source = request.context;
    validateContext(source, request.requestId);

    if (this.options.enforceMaximumContextAge) {
      const ageMs = now - source.builtAtMs;

      if (ageMs < 0) {
        throw new MultiAgentContextBuilderError(
          "INVALID_CONTEXT",
          "Context builtAtMs cannot be later than the builder clock.",
          {
            field: "context.builtAtMs",
            requestId: request.requestId,
            contextAgeMs: ageMs,
          },
        );
      }

      if (ageMs > request.configuration.maximumContextAgeMs) {
        throw new MultiAgentContextBuilderError(
          "STALE_CONTEXT",
          `Context age ${ageMs}ms exceeds the configured maximum of ${request.configuration.maximumContextAgeMs}ms.`,
          {
            field: "context.builtAtMs",
            requestId: request.requestId,
            contextAgeMs: ageMs,
            maximumContextAgeMs:
              request.configuration.maximumContextAgeMs,
          },
        );
      }
    }

    const normalizedHealth = normalizeHealth(
      source.systemHealth,
      this.options.sortSystemHealthByAgentId,
    );

    const fingerprintPayload = createFingerprintPayload(
      source,
      normalizedHealth,
      this.options.preserveMetadata,
    );

    const calculatedFingerprint =
      this.options.fingerprintGenerator.fingerprint(
        fingerprintPayload,
      );

    assertNonEmptyString(
      calculatedFingerprint,
      "fingerprintGenerator result",
    );

    if (
      this.options.verifyExistingFingerprint &&
      source.deterministicFingerprint !== calculatedFingerprint
    ) {
      throw new MultiAgentContextBuilderError(
        "FINGERPRINT_MISMATCH",
        "Context deterministic fingerprint does not match its normalized content.",
        {
          field: "context.deterministicFingerprint",
          requestId: request.requestId,
          expectedFingerprint: calculatedFingerprint,
          actualFingerprint: source.deterministicFingerprint,
        },
      );
    }

    const context: MultiAgentSystemContext = {
      market: cloneValue(source.market),
      decisionIntelligence: cloneValue(source.decisionIntelligence),
      metaLearning: cloneValue(source.metaLearning),
      strategyPortfolio: cloneValue(source.strategyPortfolio),
      arbitrage: cloneValue(source.arbitrage),
      portfolio:
        source.portfolio === undefined
          ? undefined
          : cloneValue(source.portfolio),
      systemHealth: normalizedHealth,
      builtAtMs: source.builtAtMs,
      deterministicFingerprint: this.options.rebuildFingerprint
        ? calculatedFingerprint
        : source.deterministicFingerprint,
      metadata:
        this.options.preserveMetadata && source.metadata !== undefined
          ? cloneMetadata(source.metadata)
          : undefined,
    };

    return deepFreeze(context);
  }
}

export function createMultiAgentContextBuilder(
  options: MultiAgentContextBuilderOptions = {},
): MultiAgentContextBuilder {
  return new MultiAgentContextBuilder(options);
}

function normalizeOptions(
  options: MultiAgentContextBuilderOptions,
): NormalizedOptions {
  const normalized: NormalizedOptions = {
    clock: options.clock ?? DEFAULT_CLOCK,
    fingerprintGenerator:
      options.fingerprintGenerator ??
      DEFAULT_FINGERPRINT_GENERATOR,
    enforceMaximumContextAge:
      options.enforceMaximumContextAge ?? true,
    verifyExistingFingerprint:
      options.verifyExistingFingerprint ?? false,
    rebuildFingerprint: options.rebuildFingerprint ?? true,
    sortSystemHealthByAgentId:
      options.sortSystemHealthByAgentId ?? true,
    preserveMetadata: options.preserveMetadata ?? true,
  };

  if (typeof normalized.clock.now !== "function") {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      "clock.now must be a function.",
      { field: "clock.now" },
    );
  }

  if (
    typeof normalized.fingerprintGenerator.fingerprint !==
    "function"
  ) {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      "fingerprintGenerator.fingerprint must be a function.",
      { field: "fingerprintGenerator.fingerprint" },
    );
  }

  return Object.freeze(normalized);
}

function validateRequest(request: MultiAgentRunRequest): void {
  if (request === null || typeof request !== "object") {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      "Run request must be an object.",
      { field: "request" },
    );
  }

  assertNonEmptyString(request.requestId, "request.requestId");
  assertTimestamp(request.requestedAtMs, "request.requestedAtMs");

  if (
    request.configuration === null ||
    typeof request.configuration !== "object"
  ) {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      "request.configuration must be an object.",
      {
        field: "request.configuration",
        requestId: request.requestId,
      },
    );
  }

  assertNonNegativeFinite(
    request.configuration.maximumContextAgeMs,
    "request.configuration.maximumContextAgeMs",
  );

  if (
    request.context === null ||
    typeof request.context !== "object"
  ) {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      "request.context must be an object.",
      {
        field: "request.context",
        requestId: request.requestId,
      },
    );
  }
}

function validateContext(
  context: MultiAgentSystemContext,
  requestId: string,
): void {
  assertTimestamp(context.builtAtMs, "context.builtAtMs");
  assertNonEmptyString(
    context.deterministicFingerprint,
    "context.deterministicFingerprint",
  );

  const requiredSections = [
    ["market", context.market],
    ["decisionIntelligence", context.decisionIntelligence],
    ["metaLearning", context.metaLearning],
    ["strategyPortfolio", context.strategyPortfolio],
    ["arbitrage", context.arbitrage],
  ] as const;

  for (const [field, value] of requiredSections) {
    if (value === null || typeof value !== "object") {
      throw new MultiAgentContextBuilderError(
        "INVALID_CONTEXT",
        `context.${field} must be an object.`,
        {
          field: `context.${field}`,
          requestId,
        },
      );
    }
  }

  if (!Array.isArray(context.systemHealth)) {
    throw new MultiAgentContextBuilderError(
      "INVALID_CONTEXT",
      "context.systemHealth must be an array.",
      {
        field: "context.systemHealth",
        requestId,
      },
    );
  }

  const agentIds = new Set<string>();

  for (const [index, health] of context.systemHealth.entries()) {
    assertNonEmptyString(
      health.agentId,
      `context.systemHealth[${index}].agentId`,
    );

    if (agentIds.has(health.agentId)) {
      throw new MultiAgentContextBuilderError(
        "INVALID_CONTEXT",
        `Duplicate health snapshot for agent "${health.agentId}".`,
        {
          field: `context.systemHealth[${index}].agentId`,
          requestId,
        },
      );
    }

    agentIds.add(health.agentId);
    assertTimestamp(
      health.assessedAtMs,
      `context.systemHealth[${index}].assessedAtMs`,
    );
  }

  if (!Array.isArray(context.market.reports)) {
    invalidArray("context.market.reports", requestId);
  }

  if (!Array.isArray(context.market.markets)) {
    invalidArray("context.market.markets", requestId);
  }

  if (!Array.isArray(context.market.riskSignals)) {
    invalidArray("context.market.riskSignals", requestId);
  }

  assertTimestamp(
    context.market.generatedAtMs,
    "context.market.generatedAtMs",
  );

  if (!Array.isArray(context.decisionIntelligence.candidatePool)) {
    invalidArray(
      "context.decisionIntelligence.candidatePool",
      requestId,
    );
  }

  if (!Array.isArray(context.metaLearning.strategyDescriptors)) {
    invalidArray(
      "context.metaLearning.strategyDescriptors",
      requestId,
    );
  }

  if (!Array.isArray(context.metaLearning.adaptiveWeights)) {
    invalidArray(
      "context.metaLearning.adaptiveWeights",
      requestId,
    );
  }

  if (!Array.isArray(context.metaLearning.reinforcementStates)) {
    invalidArray(
      "context.metaLearning.reinforcementStates",
      requestId,
    );
  }

  if (!Array.isArray(context.strategyPortfolio.candidates)) {
    invalidArray(
      "context.strategyPortfolio.candidates",
      requestId,
    );
  }

  if (!Array.isArray(context.arbitrage.decisions)) {
    invalidArray("context.arbitrage.decisions", requestId);
  }

  if (!Array.isArray(context.arbitrage.signals)) {
    invalidArray("context.arbitrage.signals", requestId);
  }

  if (context.portfolio !== undefined) {
    assertNonEmptyString(
      context.portfolio.portfolioId,
      "context.portfolio.portfolioId",
    );
    assertTimestamp(
      context.portfolio.asOfMs,
      "context.portfolio.asOfMs",
    );
  }
}

function invalidArray(field: string, requestId: string): never {
  throw new MultiAgentContextBuilderError(
    "INVALID_CONTEXT",
    `${field} must be an array.`,
    { field, requestId },
  );
}

function normalizeHealth(
  health: readonly MultiAgentHealthSnapshot[],
  sortByAgentId: boolean,
): readonly MultiAgentHealthSnapshot[] {
  const cloned = health.map((snapshot) => cloneValue(snapshot));

  if (sortByAgentId) {
    cloned.sort((left, right) =>
      compareText(left.agentId, right.agentId),
    );
  }

  return deepFreeze(cloned);
}

function createFingerprintPayload(
  context: MultiAgentSystemContext,
  systemHealth: readonly MultiAgentHealthSnapshot[],
  preserveMetadata: boolean,
): unknown {
  return {
    market: context.market,
    decisionIntelligence: context.decisionIntelligence,
    metaLearning: context.metaLearning,
    strategyPortfolio: context.strategyPortfolio,
    arbitrage: context.arbitrage,
    portfolio: context.portfolio,
    systemHealth,
    builtAtMs: context.builtAtMs,
    metadata:
      preserveMetadata && context.metadata !== undefined
        ? context.metadata
        : undefined,
  };
}

function cloneMetadata(
  metadata: MultiAgentMetadata,
): MultiAgentMetadata {
  return cloneValue(metadata);
}

function cloneValue<T>(value: T): T {
  return deepFreeze(cloneUnknown(value)) as T;
}

function cloneUnknown(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneUnknown(item));
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value === "object") {
    const clone: Record<string, unknown> = {};
    const record = value as Readonly<Record<string, unknown>>;

    for (const key of Object.keys(record).sort(compareText)) {
      clone[key] = cloneUnknown(record[key]);
    }

    return clone;
  }

  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? JSON.stringify(value)
      : JSON.stringify(String(value));
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "bigint") {
    return JSON.stringify(value.toString());
  }

  if (value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalJson(item))
      .join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareText)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
      );

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MultiAgentContextBuilderError(
      "INVALID_CONTEXT",
      `${field} must be a non-empty string.`,
      { field },
    );
  }
}

function assertTimestamp(
  value: unknown,
  field: string,
): asserts value is MultiAgentTimestamp {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MultiAgentContextBuilderError(
      "INVALID_CONTEXT",
      `${field} must be a non-negative safe-integer timestamp.`,
      { field },
    );
  }
}

function assertNonNegativeFinite(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new MultiAgentContextBuilderError(
      "INVALID_REQUEST",
      `${field} must be a non-negative finite number.`,
      { field },
    );
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(
  value: T,
  seen: Set<object> = new Set(),
): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return value;
  }

  seen.add(value as object);

  for (const key of Reflect.ownKeys(value as object)) {
    const propertyValue = (
      value as Record<PropertyKey, unknown>
    )[key];

    if (
      propertyValue !== null &&
      (typeof propertyValue === "object" ||
        typeof propertyValue === "function")
    ) {
      deepFreeze(propertyValue, seen);
    }
  }

  return Object.freeze(value);
}