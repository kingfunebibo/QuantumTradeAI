/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Deterministic mock REST transport.
 *
 * This transport is designed for unit and integration tests. It supports:
 * - scripted responses;
 * - scripted failures;
 * - deterministic clock advancement;
 * - immutable request history;
 * - lifecycle validation;
 * - exact request matching;
 * - reusable fallback responses.
 */

import {
  ExchangeRestError,
  type BaseExchangeRestClientClock,
  type BaseExchangeRestTransport,
  type BaseExchangeRestTransportRequest,
  type BaseExchangeRestTransportResponse,
} from "../index";

/**
 * Mock REST transport lifecycle states.
 */
export type DeterministicMockRestTransportState =
  | "CREATED"
  | "READY"
  | "CLOSED"
  | "FAILED";

/**
 * Request matcher used by scripted transport entries.
 */
export interface DeterministicMockRestRequestMatcher {
  readonly method?: BaseExchangeRestTransportRequest["method"];
  readonly url?: string;
  readonly requestId?: string;

  /**
   * Optional predicate for advanced matching.
   *
   * The predicate must be deterministic and side-effect free.
   */
  readonly predicate?: (
    request: BaseExchangeRestTransportRequest,
  ) => boolean;
}

/**
 * Successful scripted transport response.
 */
export interface DeterministicMockRestSuccessScript {
  readonly type: "RESPONSE";
  readonly matcher?: DeterministicMockRestRequestMatcher;
  readonly response: BaseExchangeRestTransportResponse;
  readonly delayMs?: number;
  readonly repeat?: number;
}

/**
 * Scripted transport failure.
 */
export interface DeterministicMockRestFailureScript {
  readonly type: "ERROR";
  readonly matcher?: DeterministicMockRestRequestMatcher;
  readonly error: Error;
  readonly delayMs?: number;
  readonly repeat?: number;
}

/**
 * Union of scripted mock REST outcomes.
 */
export type DeterministicMockRestScript =
  | DeterministicMockRestSuccessScript
  | DeterministicMockRestFailureScript;

/**
 * Immutable mock REST transport configuration.
 */
export interface DeterministicMockRestTransportConfig {
  readonly scripts?: readonly DeterministicMockRestScript[];

  /**
   * Optional response used when no script matches.
   */
  readonly fallbackResponse?: BaseExchangeRestTransportResponse;

  /**
   * Default deterministic delay for initialize().
   */
  readonly initializeDelayMs?: number;

  /**
   * Default deterministic delay for close().
   */
  readonly closeDelayMs?: number;

  /**
   * Whether unmatched requests should throw.
   */
  readonly rejectUnmatchedRequests?: boolean;
}

/**
 * Immutable executed request history entry.
 */
export interface DeterministicMockRestRequestHistoryEntry {
  readonly sequence: number;
  readonly request: BaseExchangeRestTransportRequest;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly outcome: "RESPONSE" | "ERROR";
  readonly statusCode?: number;
  readonly errorName?: string;
  readonly errorMessage?: string;
}

/**
 * Deterministic scripted REST transport.
 */
export class DeterministicMockRestTransport
  implements BaseExchangeRestTransport
{
  private state: DeterministicMockRestTransportState =
    "CREATED";

  private readonly scripts: MutableScriptEntry[];
  private readonly history:
    DeterministicMockRestRequestHistoryEntry[] = [];

  private sequence = 0;
  private initializeCalls = 0;
  private closeCalls = 0;

  public constructor(
    private readonly clock: BaseExchangeRestClientClock,
    private readonly config: DeterministicMockRestTransportConfig = {},
  ) {
    validateClock(clock);
    validateConfig(config);

    this.scripts = (config.scripts ?? []).map(
      (script) => ({
        script: freezeScript(script),
        remaining:
          script.repeat === undefined
            ? 1
            : script.repeat,
      }),
    );
  }

  public getState(): DeterministicMockRestTransportState {
    return this.state;
  }

  public getInitializeCallCount(): number {
    return this.initializeCalls;
  }

  public getCloseCallCount(): number {
    return this.closeCalls;
  }

  public getHistory():
    readonly DeterministicMockRestRequestHistoryEntry[] {
    return Object.freeze([...this.history]);
  }

  public enqueue(
    script: DeterministicMockRestScript,
  ): void {
    validateScript(script);

    this.scripts.push({
      script: freezeScript(script),
      remaining:
        script.repeat === undefined
          ? 1
          : script.repeat,
    });
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public async initialize(): Promise<void> {
    if (this.state === "READY") {
      return;
    }

    if (this.state === "CLOSED") {
      throw createMockRestError(
        "MOCK_REST_TRANSPORT_CLOSED",
        "A closed mock REST transport cannot be initialized.",
        false,
        this.clock.now(),
      );
    }

    this.initializeCalls += 1;
    advanceClock(
      this.clock,
      this.config.initializeDelayMs ?? 0,
    );

    this.state = "READY";
  }

  public async execute(
    request: BaseExchangeRestTransportRequest,
  ): Promise<BaseExchangeRestTransportResponse> {
    if (this.state !== "READY") {
      throw createMockRestError(
        "MOCK_REST_TRANSPORT_NOT_READY",
        `Mock REST transport cannot execute while in ${this.state} state.`,
        this.state === "CREATED" ||
          this.state === "FAILED",
        this.clock.now(),
        request.requestId,
      );
    }

    const startedAt = this.clock.now();
    const selected = this.selectScript(request);

    if (!selected) {
      if (this.config.fallbackResponse) {
        const completedAt = this.clock.now();

        this.recordHistory({
          request,
          startedAt,
          completedAt,
          outcome: "RESPONSE",
          statusCode:
            this.config.fallbackResponse.statusCode,
        });

        return freezeResponse(
          this.config.fallbackResponse,
        );
      }

      if (
        this.config.rejectUnmatchedRequests !== false
      ) {
        const error = createMockRestError(
          "MOCK_REST_SCRIPT_NOT_FOUND",
          `No mock REST script matched request '${request.requestId}'.`,
          false,
          startedAt,
          request.requestId,
        );

        this.recordHistory({
          request,
          startedAt,
          completedAt: startedAt,
          outcome: "ERROR",
          errorName: error.name,
          errorMessage: error.message,
        });

        throw error;
      }

      const defaultResponse =
        createDefaultFallbackResponse();

      this.recordHistory({
        request,
        startedAt,
        completedAt: startedAt,
        outcome: "RESPONSE",
        statusCode: defaultResponse.statusCode,
      });

      return defaultResponse;
    }

    const delayMs = selected.script.delayMs ?? 0;

    advanceClock(this.clock, delayMs);

    const completedAt = this.clock.now();

    selected.remaining -= 1;

    if (selected.remaining <= 0) {
      const index = this.scripts.indexOf(selected);

      if (index >= 0) {
        this.scripts.splice(index, 1);
      }
    }

    if (selected.script.type === "ERROR") {
      this.recordHistory({
        request,
        startedAt,
        completedAt,
        outcome: "ERROR",
        errorName: selected.script.error.name,
        errorMessage: selected.script.error.message,
      });

      throw selected.script.error;
    }

    this.recordHistory({
      request,
      startedAt,
      completedAt,
      outcome: "RESPONSE",
      statusCode:
        selected.script.response.statusCode,
    });

    return freezeResponse(
      selected.script.response,
    );
  }

  public async close(): Promise<void> {
    if (this.state === "CLOSED") {
      return;
    }

    this.closeCalls += 1;

    advanceClock(
      this.clock,
      this.config.closeDelayMs ?? 0,
    );

    this.state = "CLOSED";
  }

  private selectScript(
    request: BaseExchangeRestTransportRequest,
  ): MutableScriptEntry | undefined {
    return this.scripts.find((entry) =>
      matchesRequest(
        request,
        entry.script.matcher,
      ),
    );
  }

  private recordHistory(input: {
    readonly request: BaseExchangeRestTransportRequest;
    readonly startedAt: number;
    readonly completedAt: number;
    readonly outcome: "RESPONSE" | "ERROR";
    readonly statusCode?: number;
    readonly errorName?: string;
    readonly errorMessage?: string;
  }): void {
    this.sequence += 1;

    this.history.push(
      Object.freeze({
        sequence: this.sequence,
        request: freezeRequest(input.request),
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        durationMs:
          input.completedAt - input.startedAt,
        outcome: input.outcome,
        statusCode: input.statusCode,
        errorName: input.errorName,
        errorMessage: input.errorMessage,
      }),
    );
  }
}

interface MutableScriptEntry {
  readonly script: DeterministicMockRestScript;
  remaining: number;
}

export function validateDeterministicMockRestTransportConfig(
  config: DeterministicMockRestTransportConfig,
): void {
  validateConfig(config);
}

export function isDeterministicMockRestTransport(
  value: unknown,
): value is DeterministicMockRestTransport {
  return value instanceof DeterministicMockRestTransport;
}

function validateConfig(
  config: DeterministicMockRestTransportConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw createMockRestError(
      "MOCK_REST_CONFIG_REQUIRED",
      "Mock REST transport configuration is required.",
      false,
      0,
    );
  }

  validateOptionalDelay(
    config.initializeDelayMs,
    "initializeDelayMs",
  );

  validateOptionalDelay(
    config.closeDelayMs,
    "closeDelayMs",
  );

  for (const script of config.scripts ?? []) {
    validateScript(script);
  }
}

function validateScript(
  script: DeterministicMockRestScript,
): void {
  if (
    typeof script !== "object" ||
    script === null
  ) {
    throw createMockRestError(
      "INVALID_MOCK_REST_SCRIPT",
      "Mock REST scripts must be non-null objects.",
      false,
      0,
    );
  }

  validateOptionalDelay(
    script.delayMs,
    "script.delayMs",
  );

  if (
    script.repeat !== undefined &&
    (!Number.isInteger(script.repeat) ||
      script.repeat <= 0)
  ) {
    throw createMockRestError(
      "INVALID_MOCK_REST_REPEAT",
      "Mock REST script repeat must be an integer greater than zero.",
      false,
      0,
    );
  }

  if (script.matcher?.predicate !== undefined &&
      typeof script.matcher.predicate !== "function") {
    throw createMockRestError(
      "INVALID_MOCK_REST_PREDICATE",
      "Mock REST matcher predicate must be a function.",
      false,
      0,
    );
  }

  if (
    script.type === "RESPONSE" &&
    (
      !Number.isInteger(
        script.response.statusCode,
      ) ||
      script.response.statusCode < 100 ||
      script.response.statusCode > 599
    )
  ) {
    throw createMockRestError(
      "INVALID_MOCK_REST_STATUS",
      "Mock REST response status code must be between 100 and 599.",
      false,
      0,
    );
  }

  if (
    script.type === "ERROR" &&
    !(script.error instanceof Error)
  ) {
    throw createMockRestError(
      "INVALID_MOCK_REST_ERROR",
      "Mock REST error script requires an Error instance.",
      false,
      0,
    );
  }
}

function validateClock(
  clock: BaseExchangeRestClientClock,
): void {
  if (
    typeof clock !== "object" ||
    clock === null ||
    typeof clock.now !== "function"
  ) {
    throw createMockRestError(
      "MOCK_REST_CLOCK_REQUIRED",
      "Mock REST transport requires a valid clock.",
      false,
      0,
    );
  }
}

function validateOptionalDelay(
  value: number | undefined,
  path: string,
): void {
  if (
    value !== undefined &&
    (
      !Number.isFinite(value) ||
      value < 0
    )
  ) {
    throw createMockRestError(
      "INVALID_MOCK_REST_DELAY",
      `${path} must be finite and non-negative.`,
      false,
      0,
    );
  }
}

function matchesRequest(
  request: BaseExchangeRestTransportRequest,
  matcher:
    | DeterministicMockRestRequestMatcher
    | undefined,
): boolean {
  if (!matcher) {
    return true;
  }

  if (
    matcher.method !== undefined &&
    matcher.method !== request.method
  ) {
    return false;
  }

  if (
    matcher.url !== undefined &&
    matcher.url !== request.url
  ) {
    return false;
  }

  if (
    matcher.requestId !== undefined &&
    matcher.requestId !== request.requestId
  ) {
    return false;
  }

  if (
    matcher.predicate &&
    !matcher.predicate(request)
  ) {
    return false;
  }

  return true;
}

function advanceClock(
  clock: BaseExchangeRestClientClock,
  delayMs: number,
): void {
  if (delayMs === 0) {
    return;
  }

  const mutableClock = clock as BaseExchangeRestClientClock & {
    advance?: (milliseconds: number) => void;
  };

  if (typeof mutableClock.advance !== "function") {
    throw createMockRestError(
      "MOCK_REST_CLOCK_NOT_ADVANCEABLE",
      "Mock REST transport delays require a clock with an advance(milliseconds) method.",
      false,
      clock.now(),
    );
  }

  mutableClock.advance(delayMs);
}

function freezeScript(
  script: DeterministicMockRestScript,
): DeterministicMockRestScript {
  if (script.type === "ERROR") {
    return Object.freeze({
      ...script,
      matcher: script.matcher
        ? Object.freeze({ ...script.matcher })
        : undefined,
    });
  }

  return Object.freeze({
    ...script,
    matcher: script.matcher
      ? Object.freeze({ ...script.matcher })
      : undefined,
    response: freezeResponse(script.response),
  });
}

function freezeRequest(
  request: BaseExchangeRestTransportRequest,
): BaseExchangeRestTransportRequest {
  return Object.freeze({
    ...request,
    headers: Object.freeze({
      ...request.headers,
    }),
  });
}

function freezeResponse(
  response: BaseExchangeRestTransportResponse,
): BaseExchangeRestTransportResponse {
  return Object.freeze({
    ...response,
    headers: response.headers
      ? Object.freeze({ ...response.headers })
      : undefined,
  });
}

function createDefaultFallbackResponse():
  BaseExchangeRestTransportResponse {
  return Object.freeze({
    statusCode: 200,
    statusText: "OK",
    headers: Object.freeze({
      "content-type": "application/json",
    }),
    data: Object.freeze({}),
  });
}

function createMockRestError(
  code: string,
  message: string,
  retryable: boolean,
  occurredAt: number,
  requestId?: string,
): ExchangeRestError {
  return new ExchangeRestError({
    category: "INTERNAL",
    code,
    message,
    requestId,
    retryable,
    occurredAt,
  });
}