import { createHmac, timingSafeEqual } from "node:crypto";

export type BinanceSigningPrimitive =
  | string
  | number
  | boolean
  | bigint;

export type BinanceSigningParameterValue =
  | BinanceSigningPrimitive
  | readonly BinanceSigningPrimitive[]
  | null
  | undefined;

export type BinanceSigningParameters = Readonly<
  Record<string, BinanceSigningParameterValue>
>;

export interface BinanceClock {
  now(): number;
}

export interface BinanceRequestSignerOptions {
  readonly apiSecret: string;
  readonly defaultRecvWindowMs?: number;
  readonly clock?: BinanceClock;
}

export interface BinanceSignRequestOptions {
  readonly parameters?: BinanceSigningParameters;

  /**
   * Explicit timestamp for deterministic tests or synchronized requests.
   *
   * When omitted, the configured clock is used.
   */
  readonly timestamp?: number;

  /**
   * Binance receive window in milliseconds.
   *
   * When omitted, the signer's configured default is used.
   */
  readonly recvWindowMs?: number;

  /**
   * Determines whether `recvWindow` should be included in the payload.
   *
   * Defaults to true.
   */
  readonly includeRecvWindow?: boolean;
}

export interface BinanceSignedRequest {
  readonly timestamp: number;
  readonly recvWindowMs?: number;
  readonly parameters: Readonly<Record<string, string>>;
  readonly queryString: string;
  readonly signature: string;
  readonly signedQueryString: string;
}

export class BinanceRequestSigningError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BinanceRequestSigningError";

    Object.setPrototypeOf(
      this,
      BinanceRequestSigningError.prototype,
    );
  }
}

const DEFAULT_RECV_WINDOW_MS = 5_000;
const MAX_RECV_WINDOW_MS = 60_000;

const DEFAULT_CLOCK: BinanceClock = Object.freeze({
  now(): number {
    return Date.now();
  },
});

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BinanceRequestSigningError(
      `${fieldName} must be a non-empty string.`,
    );
  }
}

function assertTimestamp(
  value: number,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BinanceRequestSigningError(
      `${fieldName} must be a non-negative safe integer.`,
    );
  }
}

function assertRecvWindow(
  value: number,
  fieldName: string,
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BinanceRequestSigningError(
      `${fieldName} must be a positive safe integer.`,
    );
  }

  if (value > MAX_RECV_WINDOW_MS) {
    throw new BinanceRequestSigningError(
      `${fieldName} must not exceed ${MAX_RECV_WINDOW_MS} milliseconds.`,
    );
  }
}

function assertValidParameterName(name: string): void {
  if (name.length === 0) {
    throw new BinanceRequestSigningError(
      "Signing parameter names must not be empty.",
    );
  }

  if (name === "signature") {
    throw new BinanceRequestSigningError(
      'The "signature" parameter is reserved and must not be supplied.',
    );
  }
}

function normalizeNumber(
  value: number,
  fieldName: string,
): string {
  if (!Number.isFinite(value)) {
    throw new BinanceRequestSigningError(
      `${fieldName} must contain a finite number.`,
    );
  }

  return String(value);
}

function normalizePrimitive(
  value: BinanceSigningPrimitive,
  fieldName: string,
): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return normalizeNumber(value, fieldName);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return value.toString();
}

function normalizeParameterValue(
  value: BinanceSigningParameterValue,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        normalizePrimitive(
          item,
          `${fieldName}[${index}]`,
        ),
      )
      .join(",");
  }

  return normalizePrimitive(
    value as BinanceSigningPrimitive,
    fieldName,
  );
}

/**
 * Encodes a single Binance request component using RFC 3986-compatible
 * percent encoding.
 *
 * `encodeURIComponent` leaves the characters !'()* unescaped, so they are
 * escaped explicitly to keep signing behavior deterministic.
 */
export function encodeBinanceRequestComponent(
  value: string,
): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Converts signing parameters into an immutable string record.
 *
 * Undefined and null values are omitted. Arrays are represented as
 * comma-separated values.
 */
export function normalizeBinanceSigningParameters(
  parameters: BinanceSigningParameters = {},
): Readonly<Record<string, string>> {
  const normalizedEntries: Array<readonly [string, string]> = [];

  for (const [name, value] of Object.entries(parameters)) {
    assertValidParameterName(name);

    const normalizedValue = normalizeParameterValue(
      value,
      `parameters.${name}`,
    );

    if (normalizedValue === undefined) {
      continue;
    }

    normalizedEntries.push([name, normalizedValue]);
  }

  return Object.freeze(
    Object.fromEntries(normalizedEntries),
  );
}

/**
 * Produces a deterministic canonical query string.
 *
 * Parameter names are sorted lexicographically so equivalent input objects
 * always generate the same payload and signature regardless of insertion
 * order.
 */
export function createBinanceCanonicalQueryString(
  parameters: Readonly<Record<string, string>>,
): string {
  return Object.entries(parameters)
    .sort(([leftName], [rightName]) =>
      leftName.localeCompare(rightName),
    )
    .map(
      ([name, value]) =>
        `${encodeBinanceRequestComponent(name)}=${encodeBinanceRequestComponent(
          value,
        )}`,
    )
    .join("&");
}

/**
 * Generates a lowercase hexadecimal HMAC-SHA256 signature.
 */
export function createBinanceHmacSha256Signature(
  payload: string,
  apiSecret: string,
): string {
  assertNonEmptyString(apiSecret, "apiSecret");

  if (typeof payload !== "string") {
    throw new BinanceRequestSigningError(
      "payload must be a string.",
    );
  }

  return createHmac("sha256", apiSecret)
    .update(payload, "utf8")
    .digest("hex");
}

/**
 * Compares two hexadecimal signatures without using normal string equality.
 */
export function verifyBinanceHmacSha256Signature(
  expectedSignature: string,
  actualSignature: string,
): boolean {
  if (
    !/^[a-fA-F0-9]{64}$/.test(expectedSignature) ||
    !/^[a-fA-F0-9]{64}$/.test(actualSignature)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "hex",
  );
  const actualBuffer = Buffer.from(
    actualSignature,
    "hex",
  );

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    actualBuffer,
  );
}

export class BinanceRequestSigner {
  private readonly apiSecret: string;
  private readonly defaultRecvWindowMs: number;
  private readonly clock: BinanceClock;

  public constructor(
    options: BinanceRequestSignerOptions,
  ) {
    if (
      options === null ||
      typeof options !== "object"
    ) {
      throw new BinanceRequestSigningError(
        "Binance request signer options are required.",
      );
    }

    assertNonEmptyString(
      options.apiSecret,
      "apiSecret",
    );

    const defaultRecvWindowMs =
      options.defaultRecvWindowMs ??
      DEFAULT_RECV_WINDOW_MS;

    assertRecvWindow(
      defaultRecvWindowMs,
      "defaultRecvWindowMs",
    );

    if (
      options.clock !== undefined &&
      (options.clock === null ||
        typeof options.clock.now !== "function")
    ) {
      throw new BinanceRequestSigningError(
        "clock must provide a now() method.",
      );
    }

    this.apiSecret = options.apiSecret;
    this.defaultRecvWindowMs =
      defaultRecvWindowMs;
    this.clock = options.clock ?? DEFAULT_CLOCK;
  }

  /**
   * Signs an authenticated Binance REST request.
   *
   * The method does not mutate the caller's input object.
   */
  public signRequest(
    options: BinanceSignRequestOptions = {},
  ): BinanceSignedRequest {
    const timestamp =
      options.timestamp ?? this.clock.now();

    assertTimestamp(timestamp, "timestamp");

    const includeRecvWindow =
      options.includeRecvWindow ?? true;

    const recvWindowMs = includeRecvWindow
      ? options.recvWindowMs ??
        this.defaultRecvWindowMs
      : undefined;

    if (recvWindowMs !== undefined) {
      assertRecvWindow(
        recvWindowMs,
        "recvWindowMs",
      );
    }

    const normalizedParameters =
      normalizeBinanceSigningParameters(
        options.parameters,
      );

    const completeParameters: Record<string, string> = {
      ...normalizedParameters,
      timestamp: String(timestamp),
    };

    if (recvWindowMs !== undefined) {
      completeParameters.recvWindow =
        String(recvWindowMs);
    }

    const immutableParameters = Object.freeze({
      ...completeParameters,
    });

    const queryString =
      createBinanceCanonicalQueryString(
        immutableParameters,
      );

    const signature =
      createBinanceHmacSha256Signature(
        queryString,
        this.apiSecret,
      );

    return Object.freeze({
      timestamp,
      recvWindowMs,
      parameters: immutableParameters,
      queryString,
      signature,
      signedQueryString: `${queryString}&signature=${signature}`,
    });
  }

  /**
   * Signs an already constructed payload.
   *
   * This is useful when a REST transport must sign a query string and body
   * combination exactly as it will be transmitted.
   */
  public signPayload(payload: string): string {
    return createBinanceHmacSha256Signature(
      payload,
      this.apiSecret,
    );
  }

  public verifyPayloadSignature(
    payload: string,
    signature: string,
  ): boolean {
    const expectedSignature =
      this.signPayload(payload);

    return verifyBinanceHmacSha256Signature(
      expectedSignature,
      signature,
    );
  }
}