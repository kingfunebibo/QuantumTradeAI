import { createHmac } from "node:crypto";

import {
  requireOkxCredentials,
  type OkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  type OkxClock,
} from "./okx-authentication";

import {
  createOkxWebSocketLoginRequest,
  type OkxWebSocketLoginRequest,
} from "./okx-websocket-contracts";

export const OKX_WEBSOCKET_LOGIN_METHOD = "GET" as const;

export const OKX_WEBSOCKET_LOGIN_REQUEST_PATH =
  "/users/self/verify" as const;

export interface OkxWebSocketSignatureInput {
  readonly timestamp: string;
  readonly secretKey: string;
}

export interface OkxWebSocketAuthenticationInput {
  readonly configuration: OkxConnectorConfiguration;
  readonly clock: OkxClock;
}

export interface OkxAuthenticatedWebSocketLogin {
  readonly timestamp: string;
  readonly prehash: string;
  readonly signature: string;
  readonly request: OkxWebSocketLoginRequest;
}

export class OkxWebSocketAuthenticationError extends Error {
  public readonly code =
    "OKX_WEBSOCKET_AUTHENTICATION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxWebSocketAuthenticationError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function formatOkxWebSocketTimestamp(
  timestampMs: number,
): string {
  validateTimestampMilliseconds(timestampMs);

  return Math.floor(timestampMs / 1_000).toString();
}

export function createOkxWebSocketSignaturePrehash(
  timestamp: string,
): string {
  const normalizedTimestamp =
    normalizeUnixSecondsTimestamp(timestamp);

  return (
    `${normalizedTimestamp}` +
    OKX_WEBSOCKET_LOGIN_METHOD +
    OKX_WEBSOCKET_LOGIN_REQUEST_PATH
  );
}

export function createOkxWebSocketSignature(
  input: OkxWebSocketSignatureInput,
): string {
  const secretKey = requireNonEmptyString(
    input.secretKey,
    "secretKey",
  );

  const prehash =
    createOkxWebSocketSignaturePrehash(
      input.timestamp,
    );

  return createHmac("sha256", secretKey)
    .update(prehash, "utf8")
    .digest("base64");
}

export function authenticateOkxWebSocketLogin(
  input: OkxWebSocketAuthenticationInput,
): OkxAuthenticatedWebSocketLogin {
  validateClock(input.clock);

  const credentials = requireOkxCredentials(
    input.configuration,
  );

  const timestampMs = input.clock.now();

  validateTimestampMilliseconds(timestampMs);

  const timestamp =
    formatOkxWebSocketTimestamp(timestampMs);

  const prehash =
    createOkxWebSocketSignaturePrehash(timestamp);

  const signature =
    createOkxWebSocketSignature({
      timestamp,
      secretKey: credentials.secretKey,
    });

  const request =
    createOkxWebSocketLoginRequest({
      credentials,
      timestamp,
      signature,
    });

  return Object.freeze({
    timestamp,
    prehash,
    signature,
    request,
  });
}

export function isOkxWebSocketTimestamp(
  value: string,
): boolean {
  try {
    normalizeUnixSecondsTimestamp(value);

    return true;
  } catch {
    return false;
  }
}

export function createDeterministicOkxWebSocketClock(
  timestampMs: number,
): OkxClock {
  validateTimestampMilliseconds(timestampMs);

  return Object.freeze({
    now(): number {
      return timestampMs;
    },
  });
}

function normalizeUnixSecondsTimestamp(
  value: string,
): string {
  const normalized = requireNonEmptyString(
    value,
    "timestamp",
  );

  if (!/^\d+$/.test(normalized)) {
    throw new OkxWebSocketAuthenticationError(
      "timestamp must contain Unix epoch seconds.",
    );
  }

  const timestampSeconds = Number(normalized);

  if (
    !Number.isSafeInteger(timestampSeconds) ||
    timestampSeconds < 0
  ) {
    throw new OkxWebSocketAuthenticationError(
      "timestamp must be a non-negative safe integer expressed in seconds.",
    );
  }

  if (timestampSeconds.toString() !== normalized) {
    throw new OkxWebSocketAuthenticationError(
      "timestamp must use canonical Unix epoch seconds.",
    );
  }

  return normalized;
}

function validateClock(clock: OkxClock): void {
  if (
    typeof clock !== "object" ||
    clock === null ||
    typeof clock.now !== "function"
  ) {
    throw new OkxWebSocketAuthenticationError(
      "clock must implement OkxClock.",
    );
  }
}

function validateTimestampMilliseconds(
  timestampMs: number,
): void {
  if (
    !Number.isInteger(timestampMs) ||
    timestampMs < 0
  ) {
    throw new OkxWebSocketAuthenticationError(
      "timestampMs must be a non-negative integer.",
    );
  }

  const maximumTimestamp =
    8_640_000_000_000_000;

  if (timestampMs > maximumTimestamp) {
    throw new OkxWebSocketAuthenticationError(
      "timestampMs exceeds the supported JavaScript date range.",
    );
  }
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxWebSocketAuthenticationError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxWebSocketAuthenticationError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}