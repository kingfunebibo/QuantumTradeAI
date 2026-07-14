import {
  BacktestReport,
  BacktestReportEnvelope,
} from "./backtest-report.types";
import {
  DeterministicJsonSerializer,
  DeterministicJsonSerializerOptions,
} from "./deterministic-json.serializer";
import {
  ImmutableBacktestReportModel,
  ImmutableBacktestReportSnapshot,
} from "./immutable-backtest-report.model";
import { BacktestReportValidator } from "./backtest-report.validator";

/**
 * Export artifact produced by the deterministic backtest report exporter.
 */
export interface DeterministicBacktestReportExport {
  readonly reportId: string;
  readonly backtestId: string;
  readonly sessionId: string;
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly fileName: string;
  readonly mimeType: "application/json";
  readonly encoding: "utf-8";
  readonly byteLength: number;
  readonly content: string;
}

/**
 * Exporter construction options.
 */
export interface DeterministicBacktestReportExporterOptions {
  readonly report: BacktestReport;
  readonly validator?: BacktestReportValidator;
  readonly serializerOptions?: DeterministicJsonSerializerOptions;
  readonly validateOnCreate?: boolean;
  readonly fileNamePrefix?: string;
}

/**
 * Export-time options.
 */
export interface DeterministicBacktestReportExportOptions {
  /**
   * Optional explicit file name.
   *
   * When omitted, a deterministic file name is generated.
   */
  readonly fileName?: string;

  /**
   * Optional deterministic suffix added before the .json extension.
   */
  readonly suffix?: string;
}

/**
 * Error thrown when report export cannot be completed.
 */
export class DeterministicBacktestReportExportError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause: unknown) {
    super(message);
    this.name = "DeterministicBacktestReportExportError";
    this.cause = cause;
  }
}

/**
 * Production-ready deterministic JSON export service.
 *
 * Responsibilities:
 * - own an immutable backtest report model;
 * - validate report state;
 * - serialize canonical deterministic JSON;
 * - generate deterministic safe file names;
 * - expose immutable snapshots;
 * - support atomic report reset;
 * - avoid direct filesystem dependencies.
 */
export class DeterministicBacktestReportExporter {
  private readonly validator: BacktestReportValidator;
  private readonly serializer: DeterministicJsonSerializer;
  private readonly model: ImmutableBacktestReportModel;
  private readonly fileNamePrefix: string;

  public constructor(options: DeterministicBacktestReportExporterOptions) {
    this.validator = options.validator ?? new BacktestReportValidator();

    this.serializer = new DeterministicJsonSerializer({
      validator: this.validator,
      ...(options.serializerOptions ?? {}),
    });

    this.model = new ImmutableBacktestReportModel({
      report: options.report,
      validator: this.validator,
      validateOnCreate: options.validateOnCreate ?? true,
    });

    this.fileNamePrefix = this.normalizePrefix(
      options.fileNamePrefix ?? "quantumtradeai-backtest-report",
    );
  }

  /**
   * Returns the immutable current report.
   */
  public get report(): BacktestReport {
    return this.model.report;
  }

  /**
   * Returns the immutable current envelope.
   */
  public get envelope(): BacktestReportEnvelope {
    return this.model.envelope;
  }

  /**
   * Returns the current immutable report snapshot.
   */
  public snapshot(): ImmutableBacktestReportSnapshot {
    return this.model.snapshot();
  }

  /**
   * Returns whether the current report validates successfully.
   */
  public isValid(): boolean {
    return this.model.isValid();
  }

  /**
   * Strictly validates the current report.
   */
  public assertValid(): void {
    this.model.assertValid();
  }

  /**
   * Exports the current report envelope as canonical deterministic JSON.
   */
  public export(
    options: DeterministicBacktestReportExportOptions = {},
  ): DeterministicBacktestReportExport {
    try {
      this.model.assertValid();

      const content = this.serializer.serializeEnvelope(this.model.envelope);
      const fileName =
        options.fileName !== undefined
          ? this.normalizeExplicitFileName(options.fileName)
          : this.createDeterministicFileName(options.suffix);

      return Object.freeze({
        reportId: this.model.reportId,
        backtestId: this.model.backtestId,
        sessionId: this.model.sessionId,
        schemaVersion: this.model.schemaVersion,
        generatedAt: this.model.generatedAt,
        fileName,
        mimeType: "application/json",
        encoding: "utf-8",
        byteLength: Buffer.byteLength(content, "utf8"),
        content,
      });
    } catch (error) {
      throw new DeterministicBacktestReportExportError(
        "Unable to export deterministic backtest report.",
        error,
      );
    }
  }

  /**
   * Returns only the deterministic JSON string.
   */
  public exportJson(): string {
    try {
      this.model.assertValid();
      return this.serializer.serializeEnvelope(this.model.envelope);
    } catch (error) {
      throw new DeterministicBacktestReportExportError(
        "Unable to serialize deterministic backtest report JSON.",
        error,
      );
    }
  }

  /**
   * Atomically replaces the current report.
   */
  public reset(report: BacktestReport): ImmutableBacktestReportSnapshot {
    return this.model.reset(report);
  }

  /**
   * Clears the current report state.
   */
  public clear(): void {
    this.model.clear();
  }

  /**
   * Initializes a cleared exporter or replaces current report state.
   */
  public initialize(report: BacktestReport): ImmutableBacktestReportSnapshot {
    return this.model.initialize(report);
  }

  /**
   * Returns whether the current state is deeply frozen.
   */
  public isDeeplyFrozen(): boolean {
    return this.model.isDeeplyFrozen();
  }

  private createDeterministicFileName(suffix?: string): string {
    const segments = [
      this.fileNamePrefix,
      this.sanitizeSegment(this.model.backtestId),
      this.sanitizeSegment(this.model.sessionId),
      this.sanitizeTimestamp(this.model.generatedAt),
    ];

    if (suffix !== undefined && suffix.trim() !== "") {
      segments.push(this.sanitizeSegment(suffix));
    }

    return `${segments.join("-")}.json`;
  }

  private normalizeExplicitFileName(fileName: string): string {
    const trimmed = fileName.trim();

    if (trimmed === "") {
      throw new TypeError("Export file name must not be empty.");
    }

    const withoutExtension = trimmed.toLowerCase().endsWith(".json")
      ? trimmed.slice(0, -5)
      : trimmed;

    const safeName = this.sanitizeSegment(withoutExtension);

    if (safeName === "") {
      throw new TypeError(
        "Export file name must contain at least one valid character.",
      );
    }

    return `${safeName}.json`;
  }

  private normalizePrefix(prefix: string): string {
    const normalized = this.sanitizeSegment(prefix);

    if (normalized === "") {
      throw new TypeError(
        "Backtest report export file name prefix must not be empty.",
      );
    }

    return normalized;
  }

  private sanitizeTimestamp(timestamp: string): string {
    return timestamp
      .replace(/\.\d{3}Z$/, "Z")
      .replace(/:/g, "-")
      .replace(/T/g, "_")
      .replace(/Z$/, "Z");
  }

  private sanitizeSegment(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "");
  }
}