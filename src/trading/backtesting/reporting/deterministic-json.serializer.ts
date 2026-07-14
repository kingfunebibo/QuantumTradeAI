import {
  BacktestReport,
  BacktestReportEnvelope,
  BacktestReportJsonValue,
} from "./backtest-report.types";
import {
  BacktestReportValidationError,
  BacktestReportValidator,
} from "./backtest-report.validator";

/**
 * Options controlling deterministic JSON serialization.
 */
export interface DeterministicJsonSerializerOptions {
  /**
   * Number of spaces used for indentation.
   *
   * Use 0 for compact JSON.
   */
  readonly indentation?: number;

  /**
   * Whether report validation should run before serialization.
   */
  readonly validateBeforeSerialize?: boolean;

  /**
   * Optional validator dependency.
   */
  readonly validator?: BacktestReportValidator;

  /**
   * Whether a trailing newline should be appended.
   */
  readonly trailingNewline?: boolean;
}

/**
 * Error thrown when deterministic JSON serialization fails.
 */
export class DeterministicJsonSerializationError extends Error {
  public readonly path: string;
  public readonly cause: unknown;

  public constructor(message: string, path: string, cause?: unknown) {
    super(message);
    this.name = "DeterministicJsonSerializationError";
    this.path = path;
    this.cause = cause;
  }
}

/**
 * Canonical deterministic JSON serializer.
 *
 * Guarantees:
 * - object keys are sorted lexicographically;
 * - arrays preserve source order;
 * - only JSON-safe values are accepted;
 * - non-finite numbers are rejected;
 * - unsupported values are rejected;
 * - repeated serialization of equivalent input produces identical output.
 */
export class DeterministicJsonSerializer {
  private readonly indentation: number;
  private readonly validateBeforeSerialize: boolean;
  private readonly validator: BacktestReportValidator;
  private readonly trailingNewline: boolean;

  public constructor(options: DeterministicJsonSerializerOptions = {}) {
    this.indentation = this.normalizeIndentation(options.indentation ?? 2);
    this.validateBeforeSerialize = options.validateBeforeSerialize ?? true;
    this.validator = options.validator ?? new BacktestReportValidator();
    this.trailingNewline = options.trailingNewline ?? false;
  }

  /**
   * Serializes a complete report envelope deterministically.
   */
  public serializeEnvelope(envelope: BacktestReportEnvelope): string {
    if (this.validateBeforeSerialize) {
      this.validator.assertValidEnvelope(envelope);
    }

    return this.serializeValue(envelope);
  }

  /**
   * Serializes a report deterministically.
   */
  public serializeReport(report: BacktestReport): string {
    if (this.validateBeforeSerialize) {
      this.validator.assertValidReport(report);
    }

    return this.serializeValue(report);
  }

  /**
   * Serializes an arbitrary report-compatible JSON value.
   */
  public serializeJsonValue(value: BacktestReportJsonValue): string {
    return this.serializeValue(value);
  }

  /**
   * Returns a deeply canonicalized JSON-compatible value.
   *
   * Object keys are inserted in lexicographic order. Arrays retain their
   * original order.
   */
  public canonicalize<T extends BacktestReportJsonValue>(value: T): T {
    return this.canonicalizeValue(value, "$") as T;
  }

  /**
   * Produces a deterministic compact representation independent of the
   * configured pretty-print indentation.
   */
  public serializeCompact(value: BacktestReportJsonValue): string {
    const canonical = this.canonicalizeValue(value, "$");

    try {
      return JSON.stringify(canonical);
    } catch (error) {
      throw new DeterministicJsonSerializationError(
        "Unable to serialize canonical JSON value.",
        "$",
        error,
      );
    }
  }

  private serializeValue(value: unknown): string {
    const canonical = this.canonicalizeUnknown(value, "$");

    let serialized: string;

    try {
      serialized =
        this.indentation === 0
          ? JSON.stringify(canonical)
          : JSON.stringify(canonical, null, this.indentation);
    } catch (error) {
      if (error instanceof BacktestReportValidationError) {
        throw error;
      }

      throw new DeterministicJsonSerializationError(
        "Unable to serialize deterministic JSON.",
        "$",
        error,
      );
    }

    return this.trailingNewline ? `${serialized}\n` : serialized;
  }

  private canonicalizeUnknown(value: unknown, path: string): unknown {
    if (value === null) {
      return null;
    }

    if (typeof value === "string" || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new DeterministicJsonSerializationError(
          "Non-finite numbers are not supported.",
          path,
          value,
        );
      }

      return Object.is(value, -0) ? 0 : value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.canonicalizeUnknown(item, `${path}[${index}]`),
      );
    }

    if (this.isPlainObject(value)) {
      const canonical: Record<string, unknown> = {};
      const keys = Object.keys(value).sort((left, right) =>
        left.localeCompare(right, "en"),
      );

      for (const key of keys) {
        const nestedValue = value[key];
        const nestedPath = this.appendPath(path, key);

        if (nestedValue === undefined) {
          throw new DeterministicJsonSerializationError(
            "Undefined values are not supported.",
            nestedPath,
            nestedValue,
          );
        }

        canonical[key] = this.canonicalizeUnknown(nestedValue, nestedPath);
      }

      return canonical;
    }

    throw new DeterministicJsonSerializationError(
      `Unsupported value type: ${Object.prototype.toString.call(value)}.`,
      path,
      value,
    );
  }

  private canonicalizeValue(
    value: BacktestReportJsonValue,
    path: string,
  ): BacktestReportJsonValue {
    return this.canonicalizeUnknown(value, path) as BacktestReportJsonValue;
  }

  private appendPath(path: string, key: string): string {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
      ? `${path}.${key}`
      : `${path}[${JSON.stringify(key)}]`;
  }

  private normalizeIndentation(indentation: number): number {
    if (!Number.isInteger(indentation)) {
      throw new RangeError("JSON indentation must be an integer.");
    }

    if (indentation < 0 || indentation > 10) {
      throw new RangeError(
        "JSON indentation must be between 0 and 10 spaces.",
      );
    }

    return indentation;
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