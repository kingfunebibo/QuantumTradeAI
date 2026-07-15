import { createHmac } from "node:crypto";

import {
  requireOkxCredentials,
  type OkxApiCredentials,
  type OkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  buildOkxRestRequestPath,
  createOkxRestHeaders,
  serializeOkxRestBody,
  type OkxRestBody,
  type OkxRestHeaders,
  type OkxRestMethod,
  type OkxRestQueryParameters,
  type OkxRestRequest,
} from "./okx-rest-contracts";

export const OKX_ACCESS_KEY_HEADER = "ok-access-key" as const;
export const OKX_ACCESS_SIGN_HEADER = "ok-access-sign" as const;
export const OKX_ACCESS_TIMESTAMP_HEADER =
  "ok-access-timestamp" as const;
export const OKX_ACCESS_PASSPHRASE_HEADER =
  "ok-access-passphrase" as const;
export const OKX_SIMULATED_TRADING_HEADER =
  "x-simulated-trading" as const;

export interface OkxClock {
  now(): number;
}

export interface OkxSignatureInput {
  readonly timestamp: string;
  readonly method: OkxRestMethod;
  readonly requestPath: string;
  readonly body?: OkxRestBody;
  readonly secretKey: string;
}

export interface OkxAuthenticationHeadersInput {
  readonly credentials: OkxApiCredentials;
  readonly timestamp: string;
  readonly signature: string;
  readonly simulatedTrading: boolean;
  readonly additionalHeaders?: OkxRestHeaders;
}

export interface OkxAuthenticatedRequest<
  TBody extends OkxRestBody = null,
> {
  readonly request: OkxRestRequest<TBody>;
  readonly requestPath: string;
  readonly serializedBody: string;
  readonly timestamp: string;
  readonly prehash: string;
  readonly signature: string;
  readonly headers: OkxRestHeaders;
}

export interface AuthenticateOkxRestRequestInput<
  TBody extends OkxRestBody = null,
> {
  readonly configuration: OkxConnectorConfiguration;
  readonly request: OkxRestRequest<TBody>;
  readonly clock?: OkxClock;
}

export class OkxAuthenticationError extends Error {
  public readonly code = "OKX_AUTHENTICATION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxAuthenticationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const SYSTEM_OKX_CLOCK: OkxClock = Object.freeze({
  now(): number {
    return Date.now();
  },
});

export function formatOkxTimestamp(
  timestampMs: number,
): string {
  validateTimestampMilliseconds(timestampMs);

  return new Date(timestampMs).toISOString();
}

export function createOkxSignaturePrehash(
  input: Omit<OkxSignatureInput, "secretKey">,
): string {
  const timestamp = normalizeIsoTimestamp(input.timestamp);
  const method = validateMethod(input.method);
  const requestPath = normalizeRequestPath(input.requestPath);
  const body = serializeOkxRestBody(input.body);

  return `${timestamp}${method}${requestPath}${body}`;
}

export function createOkxSignature(
  input: OkxSignatureInput,
): string {
  const secretKey = requireNonEmptyString(
    input.secretKey,
    "secretKey",
  );

  const prehash = createOkxSignaturePrehash({
    timestamp: input.timestamp,
    method: input.method,
    requestPath: input.requestPath,
    body: input.body,
  });

  return createHmac("sha256", secretKey)
    .update(prehash, "utf8")
    .digest("base64");
}

export function createOkxAuthenticationHeaders(
  input: OkxAuthenticationHeadersInput,
): OkxRestHeaders {
  const credentials = normalizeCredentials(input.credentials);
  const timestamp = normalizeIsoTimestamp(input.timestamp);
  const signature = requireNonEmptyString(
    input.signature,
    "signature",
  );

  const authenticationHeaders: Record<string, string> = {
    [OKX_ACCESS_KEY_HEADER]: credentials.apiKey,
    [OKX_ACCESS_SIGN_HEADER]: signature,
    [OKX_ACCESS_TIMESTAMP_HEADER]: timestamp,
    [OKX_ACCESS_PASSPHRASE_HEADER]: credentials.passphrase,
  };

  if (input.simulatedTrading) {
    authenticationHeaders[OKX_SIMULATED_TRADING_HEADER] = "1";
  }

  return createOkxRestHeaders({
    ...(input.additionalHeaders ?? {}),
    ...authenticationHeaders,
  });
}

export function authenticateOkxRestRequest<
  TBody extends OkxRestBody = null,
>(
  input: AuthenticateOkxRestRequestInput<TBody>,
): OkxAuthenticatedRequest<TBody> {
  if (input.request.authentication !== "private") {
    throw new OkxAuthenticationError(
      "Only private OKX REST requests can be authenticated.",
    );
  }

  const credentials = requireOkxCredentials(
    input.configuration,
  );

  const clock = input.clock ?? SYSTEM_OKX_CLOCK;
  const timestampMs = clock.now();

  validateTimestampMilliseconds(timestampMs);

  const timestamp = formatOkxTimestamp(timestampMs);
  const requestPath = buildOkxRestRequestPath(
    input.request.path,
    input.request.query,
  );

  const serializedBody = serializeOkxRestBody(
    input.request.body,
  );

  const prehash = createOkxSignaturePrehash({
    timestamp,
    method: input.request.method,
    requestPath,
    body: input.request.body,
  });

  const signature = createOkxSignature({
    timestamp,
    method: input.request.method,
    requestPath,
    body: input.request.body,
    secretKey: credentials.secretKey,
  });

  const headers = createOkxAuthenticationHeaders({
    credentials,
    timestamp,
    signature,
    simulatedTrading:
      input.configuration.simulatedTrading,
    additionalHeaders: input.request.headers,
  });

  return Object.freeze({
    request: input.request,
    requestPath,
    serializedBody,
    timestamp,
    prehash,
    signature,
    headers,
  });
}

export function createDeterministicOkxClock(
  timestampMs: number,
): OkxClock {
  validateTimestampMilliseconds(timestampMs);

  return Object.freeze({
    now(): number {
      return timestampMs;
    },
  });
}

export function isOkxIsoTimestamp(
  value: string,
): boolean {
  try {
    normalizeIsoTimestamp(value);

    return true;
  } catch {
    return false;
  }
}

export function hasOkxAuthenticationHeaders(
  headers: OkxRestHeaders,
): boolean {
  return (
    hasNonEmptyHeader(headers, OKX_ACCESS_KEY_HEADER) &&
    hasNonEmptyHeader(headers, OKX_ACCESS_SIGN_HEADER) &&
    hasNonEmptyHeader(
      headers,
      OKX_ACCESS_TIMESTAMP_HEADER,
    ) &&
    hasNonEmptyHeader(
      headers,
      OKX_ACCESS_PASSPHRASE_HEADER,
    )
  );
}

export function isOkxSimulatedTradingRequest(
  headers: OkxRestHeaders,
): boolean {
  return headers[OKX_SIMULATED_TRADING_HEADER] === "1";
}

function normalizeCredentials(
  credentials: OkxApiCredentials,
): OkxApiCredentials {
  return Object.freeze({
    apiKey: requireNonEmptyString(
      credentials.apiKey,
      "credentials.apiKey",
    ),
    secretKey: requireNonEmptyString(
      credentials.secretKey,
      "credentials.secretKey",
    ),
    passphrase: requireNonEmptyString(
      credentials.passphrase,
      "credentials.passphrase",
    ),
  });
}

function normalizeIsoTimestamp(
  value: string,
): string {
  const timestamp = requireNonEmptyString(
    value,
    "timestamp",
  );

  const parsedTimestamp = Date.parse(timestamp);

  if (!Number.isFinite(parsedTimestamp)) {
    throw new OkxAuthenticationError(
      "timestamp must be a valid ISO-8601 timestamp.",
    );
  }

  const canonicalTimestamp =
    new Date(parsedTimestamp).toISOString();

  if (canonicalTimestamp !== timestamp) {
    throw new OkxAuthenticationError(
      "timestamp must use canonical UTC ISO-8601 format.",
    );
  }

  return timestamp;
}

function normalizeRequestPath(
  requestPath: string,
): string {
  const normalizedPath = requireNonEmptyString(
    requestPath,
    "requestPath",
  );

  if (!normalizedPath.startsWith("/api/v5/")) {
    throw new OkxAuthenticationError(
      'requestPath must begin with "/api/v5/".',
    );
  }

  if (normalizedPath.includes("#")) {
    throw new OkxAuthenticationError(
      "requestPath must not contain a URL fragment.",
    );
  }

  return normalizedPath;
}

function validateMethod(
  method: OkxRestMethod,
): OkxRestMethod {
  if (
    method !== "GET" &&
    method !== "POST" &&
    method !== "PUT" &&
    method !== "DELETE"
  ) {
    throw new OkxAuthenticationError(
      `Unsupported OKX authentication method: "${String(method)}".`,
    );
  }

  return method;
}

function validateTimestampMilliseconds(
  timestampMs: number,
): void {
  if (
    !Number.isInteger(timestampMs) ||
    timestampMs < 0
  ) {
    throw new OkxAuthenticationError(
      "timestampMs must be a non-negative integer.",
    );
  }

  const maximumTimestamp = 8_640_000_000_000_000;

  if (timestampMs > maximumTimestamp) {
    throw new OkxAuthenticationError(
      "timestampMs exceeds the supported JavaScript date range.",
    );
  }
}

function hasNonEmptyHeader(
  headers: OkxRestHeaders,
  name: string,
): boolean {
  const value = headers[name];

  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxAuthenticationError(
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxAuthenticationError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalizedValue;
}