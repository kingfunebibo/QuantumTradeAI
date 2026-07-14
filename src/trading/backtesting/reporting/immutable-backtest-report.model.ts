import {
  BACKTEST_REPORT_SCHEMA_VERSION,
  BacktestReport,
  BacktestReportEnvelope,
} from "./backtest-report.types";
import {
  BacktestReportValidationError,
  BacktestReportValidator,
} from "./backtest-report.validator";

/**
 * Input accepted by the immutable report model.
 *
 * The constructor clones and deep-freezes the supplied report so external
 * references cannot mutate internal state after construction.
 */
export interface ImmutableBacktestReportModelOptions {
  readonly report: BacktestReport;
  readonly validateOnCreate?: boolean;
  readonly validator?: BacktestReportValidator;
}

/**
 * Snapshot returned by the model.
 *
 * Both the envelope and report are deeply immutable.
 */
export interface ImmutableBacktestReportSnapshot {
  readonly envelope: BacktestReportEnvelope;
  readonly report: BacktestReport;
}

/**
 * Error thrown when report state is requested before initialization.
 */
export class BacktestReportNotInitializedError extends Error {
  public constructor() {
    super("Backtest report model is not initialized.");
    this.name = "BacktestReportNotInitializedError";
  }
}

/**
 * Error thrown when a reset operation receives an invalid report.
 */
export class BacktestReportResetError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause: unknown) {
    super(message);
    this.name = "BacktestReportResetError";
    this.cause = cause;
  }
}

/**
 * Immutable in-memory model for deterministic backtest reports.
 *
 * Responsibilities:
 * - clone caller-supplied report state;
 * - validate report state;
 * - create a versioned report envelope;
 * - deeply freeze all nested data;
 * - expose readonly snapshots;
 * - support deterministic reset and reinitialization;
 * - prevent partial mutation.
 */
export class ImmutableBacktestReportModel {
  private readonly validator: BacktestReportValidator;
  private readonly validateOnCreate: boolean;

  private currentEnvelope: BacktestReportEnvelope | null = null;

  public constructor(options: ImmutableBacktestReportModelOptions) {
    this.validator = options.validator ?? new BacktestReportValidator();
    this.validateOnCreate = options.validateOnCreate ?? true;

    this.initialize(options.report);
  }

  /**
   * Returns true when the model currently contains report state.
   */
  public get initialized(): boolean {
    return this.currentEnvelope !== null;
  }

  /**
   * Returns the current immutable report.
   */
  public get report(): BacktestReport {
    return this.requireEnvelope().report;
  }

  /**
   * Returns the current immutable report envelope.
   */
  public get envelope(): BacktestReportEnvelope {
    return this.requireEnvelope();
  }

  /**
   * Returns the report schema version.
   */
  public get schemaVersion(): typeof BACKTEST_REPORT_SCHEMA_VERSION {
    return BACKTEST_REPORT_SCHEMA_VERSION;
  }

  /**
   * Returns the report ID.
   */
  public get reportId(): string {
    return this.report.identity.reportId;
  }

  /**
   * Returns the backtest ID.
   */
  public get backtestId(): string {
    return this.report.identity.backtestId;
  }

  /**
   * Returns the session ID.
   */
  public get sessionId(): string {
    return this.report.identity.sessionId;
  }

  /**
   * Returns the strategy ID.
   */
  public get strategyId(): string {
    return this.report.identity.strategyId;
  }

  /**
   * Returns the report generation timestamp.
   */
  public get generatedAt(): string {
    return this.report.metadata.generatedAt;
  }

  /**
   * Returns a stable immutable snapshot.
   *
   * Because the underlying structure is deeply frozen, returning references is
   * safe and does not permit external mutation.
   */
  public snapshot(): ImmutableBacktestReportSnapshot {
    const envelope = this.requireEnvelope();

    return Object.freeze({
      envelope,
      report: envelope.report,
    });
  }

  /**
   * Replaces the current report atomically.
   *
   * The new report is cloned, optionally validated, and deeply frozen before
   * replacing the existing state. If validation or cloning fails, the original
   * report remains unchanged.
   */
  public reset(report: BacktestReport): ImmutableBacktestReportSnapshot {
    const previousEnvelope = this.currentEnvelope;

    try {
      const nextEnvelope = this.createEnvelope(report);
      this.currentEnvelope = nextEnvelope;
      return this.snapshot();
    } catch (error) {
      this.currentEnvelope = previousEnvelope;

      throw new BacktestReportResetError(
        "Unable to reset immutable backtest report model.",
        error,
      );
    }
  }

  /**
   * Removes all report state.
   *
   * The model may subsequently be reinitialized with initialize().
   */
  public clear(): void {
    this.currentEnvelope = null;
  }

  /**
   * Initializes a cleared model or replaces existing state atomically.
   */
  public initialize(report: BacktestReport): ImmutableBacktestReportSnapshot {
    const envelope = this.createEnvelope(report);
    this.currentEnvelope = envelope;
    return this.snapshot();
  }

  /**
   * Validates the currently stored envelope.
   *
   * Throws BacktestReportNotInitializedError when the model is empty and
   * BacktestReportValidationError when report validation fails.
   */
  public assertValid(): void {
    this.validator.assertValidEnvelope(this.requireEnvelope());
  }

  /**
   * Returns whether the current report is valid.
   */
  public isValid(): boolean {
    if (this.currentEnvelope === null) {
      return false;
    }

    return this.validator.validateEnvelope(this.currentEnvelope).valid;
  }

  /**
   * Returns whether the entire report graph is deeply frozen.
   */
  public isDeeplyFrozen(): boolean {
    if (this.currentEnvelope === null) {
      return false;
    }

    return this.checkDeepFrozen(this.currentEnvelope, new WeakSet<object>());
  }

  private createEnvelope(report: BacktestReport): BacktestReportEnvelope {
    const clonedReport = this.cloneReport(report);

    const envelope: BacktestReportEnvelope = {
      schemaVersion: BACKTEST_REPORT_SCHEMA_VERSION,
      report: clonedReport,
    };

    if (this.validateOnCreate) {
      this.validator.assertValidEnvelope(envelope);
    }

    return this.deepFreeze(envelope);
  }

  private cloneReport(report: BacktestReport): BacktestReport {
    try {
      return this.cloneJsonCompatible(report);
    } catch (error) {
      if (error instanceof BacktestReportValidationError) {
        throw error;
      }

      throw new TypeError(
        `Unable to clone backtest report: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Creates a structural clone without relying on JSON stringify ordering or
   * losing validated numeric values.
   *
   * Report schemas intentionally exclude Date, bigint, Map, Set, functions,
   * symbols, and undefined.
   */
  private cloneJsonCompatible<T>(value: T): T {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.cloneJsonCompatible(item)) as T;
    }

    if (this.isPlainObject(value)) {
      const clone: Record<string, unknown> = {};

      for (const key of Object.keys(value)) {
        const nestedValue = value[key];

        if (nestedValue === undefined) {
          throw new TypeError(
            `Undefined value is not supported at property "${key}".`,
          );
        }

        clone[key] = this.cloneJsonCompatible(nestedValue);
      }

      return clone as T;
    }

    throw new TypeError(
      `Unsupported report value type: ${Object.prototype.toString.call(value)}.`,
    );
  }

  private deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return value;
    }

    const objectValue = value as object;

    if (visited.has(objectValue)) {
      return value;
    }

    visited.add(objectValue);

    if (Array.isArray(value)) {
      for (const item of value) {
        this.deepFreeze(item, visited);
      }
    } else {
      for (const key of Reflect.ownKeys(objectValue)) {
        const nestedValue = Reflect.get(objectValue, key);
        this.deepFreeze(nestedValue, visited);
      }
    }

    return Object.freeze(value);
  }

  private checkDeepFrozen(
    value: unknown,
    visited: WeakSet<object>,
  ): boolean {
    if (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    ) {
      return true;
    }

    const objectValue = value as object;

    if (visited.has(objectValue)) {
      return true;
    }

    visited.add(objectValue);

    if (!Object.isFrozen(objectValue)) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.checkDeepFrozen(item, visited));
    }

    return Reflect.ownKeys(objectValue).every((key) =>
      this.checkDeepFrozen(Reflect.get(objectValue, key), visited),
    );
  }

  private requireEnvelope(): BacktestReportEnvelope {
    if (this.currentEnvelope === null) {
      throw new BacktestReportNotInitializedError();
    }

    return this.currentEnvelope;
  }

  private isPlainObject(
    value: unknown,
  ): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}