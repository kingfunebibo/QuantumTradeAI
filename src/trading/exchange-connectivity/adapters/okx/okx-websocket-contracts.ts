import {
  type OkxApiCredentials,
} from "./okx-connector-config";

export type OkxWebSocketScope =
  | "public"
  | "private"
  | "business";

export type OkxWebSocketOperation =
  | "login"
  | "subscribe"
  | "unsubscribe";

export type OkxWebSocketEvent =
  | "login"
  | "subscribe"
  | "unsubscribe"
  | "error"
  | "notice";

export interface OkxWebSocketChannelArgument {
  readonly channel: string;
  readonly instType?: string;
  readonly instFamily?: string;
  readonly instId?: string;
  readonly uly?: string;
  readonly ccy?: string;
  readonly extraParams?: string;
}

export interface OkxWebSocketLoginArgument {
  readonly apiKey: string;
  readonly passphrase: string;
  readonly timestamp: string;
  readonly sign: string;
}

export interface OkxWebSocketLoginRequest {
  readonly op: "login";
  readonly args: readonly [OkxWebSocketLoginArgument];
}

export interface OkxWebSocketSubscriptionRequest {
  readonly id?: string;
  readonly op: "subscribe" | "unsubscribe";
  readonly args: readonly OkxWebSocketChannelArgument[];
}

export type OkxWebSocketClientRequest =
  | OkxWebSocketLoginRequest
  | OkxWebSocketSubscriptionRequest;

export interface OkxWebSocketEventMessage {
  readonly event: OkxWebSocketEvent;
  readonly code?: string;
  readonly msg?: string;
  readonly connId?: string;
  readonly id?: string;
  readonly arg?: OkxWebSocketChannelArgument;
}

export interface OkxWebSocketPushMessage<TData> {
  readonly arg: OkxWebSocketChannelArgument;
  readonly action?: "snapshot" | "update";
  readonly data: readonly TData[];
}

export interface OkxWebSocketOperationResponse<TData = unknown> {
  readonly id: string;
  readonly op: string;
  readonly code: string;
  readonly msg: string;
  readonly data?: readonly TData[];
  readonly inTime?: string;
  readonly outTime?: string;
}

export interface OkxWebSocketNoticeMessage {
  readonly event: "notice";
  readonly code: string;
  readonly msg: string;
  readonly connId?: string;
}

export interface OkxWebSocketErrorMessage {
  readonly event: "error";
  readonly code: string;
  readonly msg: string;
  readonly connId?: string;
  readonly id?: string;
  readonly arg?: OkxWebSocketChannelArgument;
}

export interface OkxWebSocketConnectionDescriptor {
  readonly scope: OkxWebSocketScope;
  readonly url: string;
  readonly authenticated: boolean;
}

export interface CreateOkxWebSocketLoginRequestInput {
  readonly credentials: OkxApiCredentials;
  readonly timestamp: string;
  readonly signature: string;
}

export interface CreateOkxWebSocketSubscriptionRequestInput {
  readonly operation: "subscribe" | "unsubscribe";
  readonly arguments: readonly OkxWebSocketChannelArgument[];
  readonly requestId?: string;
}

export class OkxWebSocketContractError extends Error {
  public readonly code =
    "OKX_WEBSOCKET_CONTRACT_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxWebSocketContractError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createOkxWebSocketChannelArgument(
  argument: OkxWebSocketChannelArgument,
): OkxWebSocketChannelArgument {
  const channel = requireNonEmptyString(
    argument.channel,
    "channel",
  );

  const normalized = compactOptionalStrings({
    instType: argument.instType,
    instFamily: argument.instFamily,
    instId: argument.instId,
    uly: argument.uly,
    ccy: argument.ccy,
    extraParams: argument.extraParams,
  });

  return Object.freeze({
    channel,
    ...normalized,
  });
}

export function createOkxWebSocketLoginRequest(
  input: CreateOkxWebSocketLoginRequestInput,
): OkxWebSocketLoginRequest {
  const credentials = normalizeCredentials(
    input.credentials,
  );

  const timestamp = normalizeLoginTimestamp(
    input.timestamp,
  );

  const sign = requireNonEmptyString(
    input.signature,
    "signature",
  );

  const argument: OkxWebSocketLoginArgument =
    Object.freeze({
      apiKey: credentials.apiKey,
      passphrase: credentials.passphrase,
      timestamp,
      sign,
    });

  const args: readonly [OkxWebSocketLoginArgument] =
    Object.freeze([argument]);

  return Object.freeze({
    op: "login",
    args,
  });
}

export function createOkxWebSocketSubscriptionRequest(
  input: CreateOkxWebSocketSubscriptionRequestInput,
): OkxWebSocketSubscriptionRequest {
  if (
    input.operation !== "subscribe" &&
    input.operation !== "unsubscribe"
  ) {
    throw new OkxWebSocketContractError(
      `Unsupported OKX WebSocket operation: "${String(input.operation)}".`,
    );
  }

  if (!Array.isArray(input.arguments)) {
    throw new OkxWebSocketContractError(
      "arguments must be an array.",
    );
  }

  if (input.arguments.length === 0) {
    throw new OkxWebSocketContractError(
      "arguments must contain at least one channel argument.",
    );
  }

  const args = Object.freeze(
    input.arguments.map(
      createOkxWebSocketChannelArgument,
    ),
  );

  const requestId =
    input.requestId === undefined
      ? undefined
      : requireNonEmptyString(
          input.requestId,
          "requestId",
        );

  return Object.freeze({
    ...(requestId !== undefined
      ? { id: requestId }
      : {}),
    op: input.operation,
    args,
  });
}

export function createOkxWebSocketConnectionDescriptor(
  descriptor: OkxWebSocketConnectionDescriptor,
): OkxWebSocketConnectionDescriptor {
  validateScope(descriptor.scope);

  const url = normalizeWebSocketUrl(
    descriptor.url,
  );

  if (
    descriptor.scope === "public" &&
    descriptor.authenticated
  ) {
    throw new OkxWebSocketContractError(
      "Public OKX WebSocket connections must not be marked authenticated.",
    );
  }

  return Object.freeze({
    scope: descriptor.scope,
    url,
    authenticated: descriptor.authenticated,
  });
}

export function parseOkxWebSocketMessage(
  rawMessage: string,
): unknown {
  const normalized = requireNonEmptyString(
    rawMessage,
    "rawMessage",
  );

  try {
    return JSON.parse(normalized) as unknown;
  } catch (error: unknown) {
    throw new OkxWebSocketContractError(
      "OKX WebSocket message must contain valid JSON.",
    );
  }
}

export function isOkxWebSocketEventMessage(
  value: unknown,
): value is OkxWebSocketEventMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.event === "string" &&
    isSupportedEvent(value.event)
  );
}

export function isOkxWebSocketPushMessage<TData = unknown>(
  value: unknown,
): value is OkxWebSocketPushMessage<TData> {
  if (!isRecord(value)) {
    return false;
  }

  if (!isRecord(value.arg)) {
    return false;
  }

  if (
    typeof value.arg.channel !== "string" ||
    value.arg.channel.trim().length === 0
  ) {
    return false;
  }

  if (!Array.isArray(value.data)) {
    return false;
  }

  if (
    value.action !== undefined &&
    value.action !== "snapshot" &&
    value.action !== "update"
  ) {
    return false;
  }

  return true;
}

export function isOkxWebSocketOperationResponse(
  value: unknown,
): value is OkxWebSocketOperationResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.op === "string" &&
    typeof value.code === "string" &&
    typeof value.msg === "string" &&
    (
      value.data === undefined ||
      Array.isArray(value.data)
    )
  );
}

export function isOkxWebSocketErrorMessage(
  value: unknown,
): value is OkxWebSocketErrorMessage {
  return (
    isOkxWebSocketEventMessage(value) &&
    value.event === "error" &&
    typeof value.code === "string" &&
    typeof value.msg === "string"
  );
}

export function isOkxWebSocketNoticeMessage(
  value: unknown,
): value is OkxWebSocketNoticeMessage {
  return (
    isOkxWebSocketEventMessage(value) &&
    value.event === "notice" &&
    typeof value.code === "string" &&
    typeof value.msg === "string"
  );
}

export function serializeOkxWebSocketRequest(
  request: OkxWebSocketClientRequest,
): string {
  return JSON.stringify(request);
}

export function createOkxWebSocketEventMessage(
  message: OkxWebSocketEventMessage,
): OkxWebSocketEventMessage {
  if (!isSupportedEvent(message.event)) {
    throw new OkxWebSocketContractError(
      `Unsupported OKX WebSocket event: "${String(message.event)}".`,
    );
  }

  const arg =
    message.arg === undefined
      ? undefined
      : createOkxWebSocketChannelArgument(
          message.arg,
        );

  return Object.freeze({
    event: message.event,
    ...(message.code !== undefined
      ? {
          code: requireNonEmptyString(
            message.code,
            "code",
          ),
        }
      : {}),
    ...(message.msg !== undefined
      ? { msg: message.msg }
      : {}),
    ...(message.connId !== undefined
      ? {
          connId: requireNonEmptyString(
            message.connId,
            "connId",
          ),
        }
      : {}),
    ...(message.id !== undefined
      ? {
          id: requireNonEmptyString(
            message.id,
            "id",
          ),
        }
      : {}),
    ...(arg !== undefined ? { arg } : {}),
  });
}

export function createOkxWebSocketPushMessage<TData>(
  message: OkxWebSocketPushMessage<TData>,
): OkxWebSocketPushMessage<TData> {
  const arg = createOkxWebSocketChannelArgument(
    message.arg,
  );

  if (!Array.isArray(message.data)) {
    throw new OkxWebSocketContractError(
      "data must be an array.",
    );
  }

  if (
    message.action !== undefined &&
    message.action !== "snapshot" &&
    message.action !== "update"
  ) {
    throw new OkxWebSocketContractError(
      `Unsupported OKX WebSocket action: "${String(message.action)}".`,
    );
  }

  return Object.freeze({
    arg,
    ...(message.action !== undefined
      ? { action: message.action }
      : {}),
    data: Object.freeze([...message.data]),
  });
}

export function createOkxWebSocketOperationResponse<TData>(
  response: OkxWebSocketOperationResponse<TData>,
): OkxWebSocketOperationResponse<TData> {
  const id = requireNonEmptyString(
    response.id,
    "id",
  );

  const op = requireNonEmptyString(
    response.op,
    "op",
  );

  const code = requireNonEmptyString(
    response.code,
    "code",
  );

  if (typeof response.msg !== "string") {
    throw new OkxWebSocketContractError(
      "msg must be a string.",
    );
  }

  if (
    response.data !== undefined &&
    !Array.isArray(response.data)
  ) {
    throw new OkxWebSocketContractError(
      "data must be an array when provided.",
    );
  }

  const inTime =
    response.inTime === undefined
      ? undefined
      : requireNumericTimestamp(
          response.inTime,
          "inTime",
        );

  const outTime =
    response.outTime === undefined
      ? undefined
      : requireNumericTimestamp(
          response.outTime,
          "outTime",
        );

  return Object.freeze({
    id,
    op,
    code,
    msg: response.msg,
    ...(response.data !== undefined
      ? {
          data: Object.freeze([
            ...response.data,
          ]),
        }
      : {}),
    ...(inTime !== undefined
      ? { inTime }
      : {}),
    ...(outTime !== undefined
      ? { outTime }
      : {}),
  });
}

export function isOkxWebSocketScope(
  value: string,
): value is OkxWebSocketScope {
  return (
    value === "public" ||
    value === "private" ||
    value === "business"
  );
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

function normalizeLoginTimestamp(
  timestamp: string,
): string {
  const normalized = requireNonEmptyString(
    timestamp,
    "timestamp",
  );

  if (!/^\d+$/.test(normalized)) {
    throw new OkxWebSocketContractError(
      "timestamp must contain Unix epoch seconds.",
    );
  }

  return normalized;
}

function compactOptionalStrings(
  values: Readonly<
    Record<string, string | undefined>
  >,
): Readonly<Record<string, string>> {
  const compacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      compacted[key] = requireNonEmptyString(
        value,
        key,
      );
    }
  }

  return Object.freeze(compacted);
}

function normalizeWebSocketUrl(
  value: string,
): string {
  const normalized = requireNonEmptyString(
    value,
    "url",
  );

  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new OkxWebSocketContractError(
      "url must be a valid absolute URL.",
    );
  }

  if (
    url.protocol !== "ws:" &&
    url.protocol !== "wss:"
  ) {
    throw new OkxWebSocketContractError(
      "url must use the WS or WSS protocol.",
    );
  }

  return url.toString();
}

function validateScope(
  scope: OkxWebSocketScope,
): void {
  if (!isOkxWebSocketScope(scope)) {
    throw new OkxWebSocketContractError(
      `Unsupported OKX WebSocket scope: "${String(scope)}".`,
    );
  }
}

function isSupportedEvent(
  value: string,
): value is OkxWebSocketEvent {
  return (
    value === "login" ||
    value === "subscribe" ||
    value === "unsubscribe" ||
    value === "error" ||
    value === "notice"
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requireNumericTimestamp(
  value: string,
  fieldName: string,
): string {
  const normalized = requireNonEmptyString(
    value,
    fieldName,
  );

  if (!/^\d+$/.test(normalized)) {
    throw new OkxWebSocketContractError(
      `${fieldName} must contain a numeric timestamp.`,
    );
  }

  return normalized;
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxWebSocketContractError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new OkxWebSocketContractError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}