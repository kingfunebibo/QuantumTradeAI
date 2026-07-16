/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Deterministic Bybit V5 authentication and request-signing utilities.
 *
 * Bybit REST signing payload:
 *
 *   timestamp + apiKey + receiveWindow + queryString
 *
 * for GET-style requests, or:
 *
 *   timestamp + apiKey + receiveWindow + jsonBody
 *
 * for body-bearing requests.
 *
 * System-generated API keys use HMAC-SHA256 with hexadecimal output.
 * Self-generated RSA keys use RSA-SHA256 with Base64 output.
 */

import {
  createHmac,
  createSign,
} from "node:crypto";

import type {
  BybitApiCredentials,
  BybitSignatureAlgorithm,
} from "./bybit-connector-config";

export type BybitAuthenticatedHttpMethod =
  | "GET"
  | "POST";

export type BybitPrimitiveParameter =
  | string
  | number
  | boolean
  | null
  | undefined;

export type BybitQueryParameters =
  Readonly<
    Record<
      string,
      BybitPrimitiveParameter
    >
  >;

export type BybitJsonObject =
  Readonly<Record<string, unknown>>;

export interface BybitClock {
  now(): number;
}

export interface BybitRestSigningRequest {
  readonly method:
    BybitAuthenticatedHttpMethod;
  readonly credentials:
    BybitApiCredentials;
  readonly receiveWindowMs: number;
  readonly timestampMs?: number;
  readonly query?: BybitQueryParameters;
  readonly body?: BybitJsonObject;
  readonly referralId?: string;
}

export interface BybitRestSignatureResult {
  readonly method:
    BybitAuthenticatedHttpMethod;
  readonly timestampMs: number;
  readonly receiveWindowMs: number;
  readonly queryString: string;
  readonly bodyString: string;
  readonly signingPayload: string;
  readonly signature: string;
  readonly headers:
    Readonly<Record<string, string>>;
}

export interface BybitWebSocketAuthenticationRequest {
  readonly credentials:
    BybitApiCredentials;
  readonly expiresAtMs?: number;
  readonly expiresAfterMs?: number;
}

export interface BybitWebSocketAuthenticationResult {
  readonly expiresAtMs: number;
  readonly signingPayload: string;
  readonly signature: string;
  readonly message: Readonly<{
    readonly op: "auth";
    readonly args:
      readonly [
        string,
        number,
        string,
      ];
  }>;
}

export interface BybitWebSocketTradeHeaderRequest {
  readonly credentials:
    BybitApiCredentials;
  readonly receiveWindowMs: number;
  readonly timestampMs?: number;
  readonly referralId?: string;
}

export interface BybitWebSocketTradeHeaderResult {
  readonly timestampMs: number;
  readonly receiveWindowMs: number;
  readonly signingPayload: string;
  readonly signature: string;
  readonly header:
    Readonly<Record<string, string>>;
}

export class BybitAuthenticationError
  extends Error {
  public readonly code: string;
  public readonly path: string;

  public constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message);

    this.name = "BybitAuthenticationError";
    this.code = code;
    this.path = path;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export class SystemBybitClock
  implements BybitClock {
  public now(): number {
    return Date.now();
  }
}

export class FixedBybitClock
  implements BybitClock {
  public constructor(
    private readonly timestampMs: number,
  ) {
    assertValidTimestamp(
      timestampMs,
      "timestampMs",
    );
  }

  public now(): number {
    return this.timestampMs;
  }
}

export class BybitRequestSigner {
  public constructor(
    private readonly clock:
      BybitClock =
        new SystemBybitClock(),
  ) {}

  public signRestRequest(
    request: BybitRestSigningRequest,
  ): BybitRestSignatureResult {
    validateCredentials(
      request.credentials,
    );

    assertReceiveWindow(
      request.receiveWindowMs,
    );

    const timestampMs =
      resolveTimestamp(
        request.timestampMs,
        this.clock,
      );

    const queryString =
      canonicalizeBybitQuery(
        request.query,
      );

    const bodyString =
      canonicalizeBybitJsonBody(
        request.body,
      );

    if (
      request.method === "GET" &&
      bodyString.length > 0
    ) {
      throw new BybitAuthenticationError(
        "BYBIT_GET_BODY_UNSUPPORTED",
        "body",
        "Authenticated Bybit GET requests must not include a JSON body.",
      );
    }

    if (
      request.method === "POST" &&
      queryString.length > 0
    ) {
      throw new BybitAuthenticationError(
        "BYBIT_POST_QUERY_UNSUPPORTED",
        "query",
        "Authenticated Bybit POST requests must sign the JSON body rather than a query string.",
      );
    }

    const requestPayload =
      request.method === "GET"
        ? queryString
        : bodyString;

    const signingPayload =
      createBybitRestSigningPayload({
        timestampMs,
        apiKey:
          request.credentials.apiKey,
        receiveWindowMs:
          request.receiveWindowMs,
        requestPayload,
      });

    const signature =
      signBybitPayload(
        signingPayload,
        request.credentials,
      );

    const headers:
      Record<string, string> = {
        "X-BAPI-API-KEY":
          request.credentials.apiKey,
        "X-BAPI-TIMESTAMP":
          String(timestampMs),
        "X-BAPI-RECV-WINDOW":
          String(
            request.receiveWindowMs,
          ),
        "X-BAPI-SIGN":
          signature,
      };

    if (
      request.referralId &&
      request.referralId.trim().length > 0
    ) {
      headers["X-Referer"] =
        request.referralId.trim();
    }

    return Object.freeze({
      method: request.method,
      timestampMs,
      receiveWindowMs:
        request.receiveWindowMs,
      queryString,
      bodyString,
      signingPayload,
      signature,
      headers:
        Object.freeze({ ...headers }),
    });
  }

  public createWebSocketAuthentication(
    request:
      BybitWebSocketAuthenticationRequest,
  ): BybitWebSocketAuthenticationResult {
    validateCredentials(
      request.credentials,
    );

    const expiresAtMs =
      resolveWebSocketExpiration(
        request,
        this.clock,
      );

    const signingPayload =
      createBybitWebSocketSigningPayload(
        expiresAtMs,
      );

    const signature =
      signBybitPayload(
        signingPayload,
        request.credentials,
      );

    return Object.freeze({
      expiresAtMs,
      signingPayload,
      signature,
      message: Object.freeze({
        op: "auth" as const,
        args: Object.freeze([
          request.credentials.apiKey,
          expiresAtMs,
          signature,
        ]) as readonly [
          string,
          number,
          string,
        ],
      }),
    });
  }

  public createWebSocketTradeHeaders(
    request:
      BybitWebSocketTradeHeaderRequest,
  ): BybitWebSocketTradeHeaderResult {
    validateCredentials(
      request.credentials,
    );

    assertReceiveWindow(
      request.receiveWindowMs,
    );

    const timestampMs =
      resolveTimestamp(
        request.timestampMs,
        this.clock,
      );

    const signingPayload =
      createBybitRestSigningPayload({
        timestampMs,
        apiKey:
          request.credentials.apiKey,
        receiveWindowMs:
          request.receiveWindowMs,
        requestPayload: "",
      });

    const signature =
      signBybitPayload(
        signingPayload,
        request.credentials,
      );

    const header:
      Record<string, string> = {
        "X-BAPI-API-KEY":
          request.credentials.apiKey,
        "X-BAPI-TIMESTAMP":
          String(timestampMs),
        "X-BAPI-RECV-WINDOW":
          String(
            request.receiveWindowMs,
          ),
        "X-BAPI-SIGN":
          signature,
      };

    if (
      request.referralId &&
      request.referralId.trim().length > 0
    ) {
      header.Referer =
        request.referralId.trim();
    }

    return Object.freeze({
      timestampMs,
      receiveWindowMs:
        request.receiveWindowMs,
      signingPayload,
      signature,
      header:
        Object.freeze({ ...header }),
    });
  }
}

export function createBybitRestSigningPayload(
  input: Readonly<{
    readonly timestampMs: number;
    readonly apiKey: string;
    readonly receiveWindowMs: number;
    readonly requestPayload: string;
  }>,
): string {
  assertValidTimestamp(
    input.timestampMs,
    "timestampMs",
  );

  assertNonEmptyString(
    input.apiKey,
    "apiKey",
    "BYBIT_API_KEY_REQUIRED",
  );

  assertReceiveWindow(
    input.receiveWindowMs,
  );

  if (
    typeof input.requestPayload !==
    "string"
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_REQUEST_PAYLOAD_INVALID",
      "requestPayload",
      "Bybit request payload must be a string.",
    );
  }

  return (
    String(input.timestampMs) +
    input.apiKey +
    String(input.receiveWindowMs) +
    input.requestPayload
  );
}

export function createBybitWebSocketSigningPayload(
  expiresAtMs: number,
): string {
  assertValidTimestamp(
    expiresAtMs,
    "expiresAtMs",
  );

  return `GET/realtime${expiresAtMs}`;
}

export function signBybitPayload(
  payload: string,
  credentials: BybitApiCredentials,
): string {
  validateCredentials(credentials);

  if (typeof payload !== "string") {
    throw new BybitAuthenticationError(
      "BYBIT_SIGNING_PAYLOAD_INVALID",
      "payload",
      "Bybit signing payload must be a string.",
    );
  }

  switch (
    credentials.signatureAlgorithm
  ) {
    case "HMAC_SHA256":
      return createHmac(
        "sha256",
        credentials.secretKey,
      )
        .update(payload, "utf8")
        .digest("hex");

    case "RSA_SHA256":
      return createSign("RSA-SHA256")
        .update(payload, "utf8")
        .end()
        .sign(
          credentials.secretKey,
          "base64",
        );

    default:
      return assertNeverSignatureAlgorithm(
        credentials.signatureAlgorithm,
      );
  }
}

export function canonicalizeBybitQuery(
  query?: BybitQueryParameters,
): string {
  if (!query) {
    return "";
  }

  const entries =
    Object.entries(query)
      .filter(
        (
          entry,
        ): entry is [
          string,
          Exclude<
            BybitPrimitiveParameter,
            null | undefined
          >,
        ] =>
          entry[1] !== undefined &&
          entry[1] !== null,
      )
      .sort(([left], [right]) =>
        left.localeCompare(right),
      );

  return entries
    .map(([key, value]) => {
      assertNonEmptyString(
        key,
        "query key",
        "BYBIT_QUERY_KEY_REQUIRED",
      );

      return (
        `${encodeURIComponent(key)}=` +
        `${encodeURIComponent(
          serializePrimitive(value),
        )}`
      );
    })
    .join("&");
}

export function canonicalizeBybitJsonBody(
  body?: BybitJsonObject,
): string {
  if (!body) {
    return "";
  }

  return stableJsonStringify(body);
}

export function stableJsonStringify(
  value: unknown,
): string {
  return JSON.stringify(
    normalizeJsonValue(value),
  );
}

function normalizeJsonValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new BybitAuthenticationError(
        "BYBIT_JSON_NUMBER_INVALID",
        "body",
        "Bybit JSON body must not contain non-finite numbers.",
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeJsonValue,
    );
  }

  if (typeof value === "object") {
    const objectValue =
      value as Record<string, unknown>;

    const normalized:
      Record<string, unknown> = {};

    for (
      const key of
      Object.keys(objectValue).sort()
    ) {
      const child =
        objectValue[key];

      if (child !== undefined) {
        normalized[key] =
          normalizeJsonValue(child);
      }
    }

    return normalized;
  }

  throw new BybitAuthenticationError(
    "BYBIT_JSON_VALUE_UNSUPPORTED",
    "body",
    `Unsupported Bybit JSON value type: ${typeof value}.`,
  );
}

function resolveTimestamp(
  timestampMs: number | undefined,
  clock: BybitClock,
): number {
  const resolved =
    timestampMs ?? clock.now();

  assertValidTimestamp(
    resolved,
    "timestampMs",
  );

  return resolved;
}

function resolveWebSocketExpiration(
  request:
    BybitWebSocketAuthenticationRequest,
  clock: BybitClock,
): number {
  if (
    request.expiresAtMs !== undefined &&
    request.expiresAfterMs !== undefined
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_WS_EXPIRATION_AMBIGUOUS",
      "expiresAtMs",
      "Specify either expiresAtMs or expiresAfterMs, not both.",
    );
  }

  if (
    request.expiresAtMs !== undefined
  ) {
    assertValidTimestamp(
      request.expiresAtMs,
      "expiresAtMs",
    );

    return request.expiresAtMs;
  }

  const expiresAfterMs =
    request.expiresAfterMs ?? 10_000;

  if (
    !Number.isInteger(expiresAfterMs) ||
    expiresAfterMs <= 0
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_WS_EXPIRATION_OFFSET_INVALID",
      "expiresAfterMs",
      "expiresAfterMs must be a positive integer.",
    );
  }

  const currentTimestamp =
    clock.now();

  assertValidTimestamp(
    currentTimestamp,
    "clock.now()",
  );

  return currentTimestamp +
    expiresAfterMs;
}

function validateCredentials(
  credentials: BybitApiCredentials,
): void {
  if (
    typeof credentials !== "object" ||
    credentials === null
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_CREDENTIALS_REQUIRED",
      "credentials",
      "Bybit credentials are required.",
    );
  }

  assertNonEmptyString(
    credentials.apiKey,
    "credentials.apiKey",
    "BYBIT_API_KEY_REQUIRED",
  );

  assertNonEmptyString(
    credentials.secretKey,
    "credentials.secretKey",
    "BYBIT_SECRET_KEY_REQUIRED",
  );

  if (
    credentials.signatureAlgorithm !==
      "HMAC_SHA256" &&
    credentials.signatureAlgorithm !==
      "RSA_SHA256"
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_SIGNATURE_ALGORITHM_UNSUPPORTED",
      "credentials.signatureAlgorithm",
      "Bybit signature algorithm must be HMAC_SHA256 or RSA_SHA256.",
    );
  }
}

function assertReceiveWindow(
  receiveWindowMs: number,
): void {
  if (
    !Number.isInteger(
      receiveWindowMs,
    ) ||
    receiveWindowMs < 1 ||
    receiveWindowMs > 60_000
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_RECEIVE_WINDOW_INVALID",
      "receiveWindowMs",
      "Bybit receiveWindowMs must be an integer between 1 and 60000.",
    );
  }
}

function assertValidTimestamp(
  value: number,
  path: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_TIMESTAMP_INVALID",
      path,
      `${path} must be a non-negative safe integer.`,
    );
  }
}

function assertNonEmptyString(
  value: string,
  path: string,
  code: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new BybitAuthenticationError(
      code,
      path,
      `${path} must be a non-empty string.`,
    );
  }
}

function serializePrimitive(
  value:
    Exclude<
      BybitPrimitiveParameter,
      null | undefined
    >,
): string {
  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    throw new BybitAuthenticationError(
      "BYBIT_QUERY_NUMBER_INVALID",
      "query",
      "Bybit query parameters must not contain non-finite numbers.",
    );
  }

  return String(value);
}

function assertNeverSignatureAlgorithm(
  value: never,
): never {
  throw new BybitAuthenticationError(
    "BYBIT_SIGNATURE_ALGORITHM_UNSUPPORTED",
    "credentials.signatureAlgorithm",
    `Unsupported Bybit signature algorithm: ${String(value)}.`,
  );
}