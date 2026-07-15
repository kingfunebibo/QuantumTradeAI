/**
 * OKX REST API contracts.
 *
 * This module defines transport-independent request, response, header,
 * query-parameter, and error-envelope models for the OKX V5 adapter.
 *
 * It contains no HTTP implementation, request signing, retry behavior,
 * rate limiting, or network state.
 */

export type OkxRestMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE";

export type OkxRestAuthentication =
  | "public"
  | "private";

export type OkxRestResponseCode = string;

export type OkxRestPrimitive =
  | string
  | number
  | boolean;

export type OkxRestQueryValue =
  | OkxRestPrimitive
  | null
  | undefined;

export type OkxRestQueryParameters = Readonly<
  Record<string, OkxRestQueryValue>
>;

export type OkxRestHeaderValue = string;

export type OkxRestHeaders = Readonly<
  Record<string, OkxRestHeaderValue>
>;

export type OkxRestBody =
  | Readonly<Record<string, unknown>>
  | readonly unknown[]
  | string
  | null;

export interface OkxRestRequest<TBody extends OkxRestBody = null> {
  readonly method: OkxRestMethod;
  readonly path: string;
  readonly authentication: OkxRestAuthentication;
  readonly query?: OkxRestQueryParameters;
  readonly headers?: OkxRestHeaders;
  readonly body?: TBody;
  readonly requestId?: string;
}

export interface OkxRestResponseEnvelope<TData> {
  readonly code: OkxRestResponseCode;
  readonly msg: string;
  readonly data: readonly TData[];
  readonly inTime?: string;
  readonly outTime?: string;
}

export interface OkxRestTransportResponse<TData> {
  readonly status: number;
  readonly headers: OkxRestHeaders;
  readonly envelope: OkxRestResponseEnvelope<TData>;
}

export interface OkxRestSuccessResponse<TData>
  extends OkxRestTransportResponse<TData> {
  readonly ok: true;
}

export interface OkxRestFailureResponse<TData = unknown>
  extends OkxRestTransportResponse<TData> {
  readonly ok: false;
  readonly error: OkxRestApiError;
}

export type OkxRestResult<TData> =
  | OkxRestSuccessResponse<TData>
  | OkxRestFailureResponse;

export interface OkxRestApiError {
  readonly name: "OkxRestApiError";
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly method?: OkxRestMethod;
  readonly path?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
}

export interface CreateOkxRestApiErrorInput {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly method?: OkxRestMethod;
  readonly path?: string;
  readonly retryable?: boolean;
  readonly cause?: unknown;
}

export interface OkxRestPagination {
  readonly after?: string;
  readonly before?: string;
  readonly limit?: number;
}

export interface OkxRestTimestampedRecord {
  readonly ts: string;
}

export interface OkxRestRequestContext {
  readonly requestId: string;
  readonly method: OkxRestMethod;
  readonly path: string;
  readonly authentication: OkxRestAuthentication;
  readonly createdAt: number;
}

export interface CreateOkxRestRequestContextInput {
  readonly requestId: string;
  readonly method: OkxRestMethod;
  readonly path: string;
  readonly authentication: OkxRestAuthentication;
  readonly createdAt: number;
}

export class OkxRestContractError extends Error {
  public readonly code = "OKX_REST_CONTRACT_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxRestContractError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createOkxRestRequest<
  TBody extends OkxRestBody = null,
>(
  request: OkxRestRequest<TBody>,
): OkxRestRequest<TBody> {
  validateOkxRestMethod(request.method);

  const path = normalizeOkxRestPath(request.path);
  const authentication = validateOkxRestAuthentication(
    request.authentication,
  );

  if (
    request.method === "GET" &&
    request.body !== undefined &&
    request.body !== null
  ) {
    throw new OkxRestContractError(
      "OKX GET requests must not contain a request body.",
    );
  }

  const query = request.query
    ? createOkxRestQueryParameters(request.query)
    : undefined;

  const headers = request.headers
    ? createOkxRestHeaders(request.headers)
    : undefined;

  const requestId =
    request.requestId === undefined
      ? undefined
      : requireNonEmptyString(
          request.requestId,
          "requestId",
        );

  return Object.freeze({
    method: request.method,
    path,
    authentication,
    ...(query ? { query } : {}),
    ...(headers ? { headers } : {}),
    ...(request.body !== undefined
      ? { body: freezeRestBody(request.body) }
      : {}),
    ...(requestId ? { requestId } : {}),
  });
}

export function createOkxPublicRestRequest<
  TBody extends OkxRestBody = null,
>(
  request: Omit<
    OkxRestRequest<TBody>,
    "authentication"
  >,
): OkxRestRequest<TBody> {
  return createOkxRestRequest({
    ...request,
    authentication: "public",
  });
}

export function createOkxPrivateRestRequest<
  TBody extends OkxRestBody = null,
>(
  request: Omit<
    OkxRestRequest<TBody>,
    "authentication"
  >,
): OkxRestRequest<TBody> {
  return createOkxRestRequest({
    ...request,
    authentication: "private",
  });
}

export function createOkxRestResponseEnvelope<TData>(
  envelope: OkxRestResponseEnvelope<TData>,
): OkxRestResponseEnvelope<TData> {
  const code = requireNonEmptyString(
    envelope.code,
    "response.code",
  );

  if (typeof envelope.msg !== "string") {
    throw new OkxRestContractError(
      "response.msg must be a string.",
    );
  }

  if (!Array.isArray(envelope.data)) {
    throw new OkxRestContractError(
      "response.data must be an array.",
    );
  }

  const inTime =
    envelope.inTime === undefined
      ? undefined
      : requireTimestampString(
          envelope.inTime,
          "response.inTime",
        );

  const outTime =
    envelope.outTime === undefined
      ? undefined
      : requireTimestampString(
          envelope.outTime,
          "response.outTime",
        );

  return Object.freeze({
    code,
    msg: envelope.msg,
    data: Object.freeze([...envelope.data]),
    ...(inTime ? { inTime } : {}),
    ...(outTime ? { outTime } : {}),
  });
}

export function isOkxRestResponseSuccessful(
  envelope: OkxRestResponseEnvelope<unknown>,
): boolean {
  return envelope.code === "0";
}

export function createOkxRestSuccessResponse<TData>(
  response: Omit<
    OkxRestSuccessResponse<TData>,
    "ok"
  >,
): OkxRestSuccessResponse<TData> {
  validateHttpStatus(response.status);

  const envelope = createOkxRestResponseEnvelope(
    response.envelope,
  );

  if (!isOkxRestResponseSuccessful(envelope)) {
    throw new OkxRestContractError(
      `Cannot create a successful OKX response from code "${envelope.code}".`,
    );
  }

  return Object.freeze({
    ok: true,
    status: response.status,
    headers: createOkxRestHeaders(response.headers),
    envelope,
  });
}

export function createOkxRestFailureResponse(
  response: Omit<
    OkxRestFailureResponse,
    "ok"
  >,
): OkxRestFailureResponse {
  validateHttpStatus(response.status);

  const envelope = createOkxRestResponseEnvelope(
    response.envelope,
  );

  const error = createOkxRestApiError(response.error);

  return Object.freeze({
    ok: false,
    status: response.status,
    headers: createOkxRestHeaders(response.headers),
    envelope,
    error,
  });
}

export function createOkxRestApiError(
  input: CreateOkxRestApiErrorInput,
): OkxRestApiError {
  const code = requireNonEmptyString(
    input.code,
    "error.code",
  );

  const message = requireNonEmptyString(
    input.message,
    "error.message",
  );

  if (input.status !== undefined) {
    validateHttpStatus(input.status);
  }

  const requestId =
    input.requestId === undefined
      ? undefined
      : requireNonEmptyString(
          input.requestId,
          "error.requestId",
        );

  const path =
    input.path === undefined
      ? undefined
      : normalizeOkxRestPath(input.path);

  if (input.method !== undefined) {
    validateOkxRestMethod(input.method);
  }

  return Object.freeze({
    name: "OkxRestApiError",
    code,
    message,
    retryable: input.retryable ?? false,
    ...(input.status !== undefined
      ? { status: input.status }
      : {}),
    ...(requestId ? { requestId } : {}),
    ...(input.method ? { method: input.method } : {}),
    ...(path ? { path } : {}),
    ...(input.cause !== undefined
      ? { cause: input.cause }
      : {}),
  });
}

export function createOkxRestRequestContext(
  input: CreateOkxRestRequestContextInput,
): OkxRestRequestContext {
  const requestId = requireNonEmptyString(
    input.requestId,
    "requestContext.requestId",
  );

  validateOkxRestMethod(input.method);

  const path = normalizeOkxRestPath(input.path);

  const authentication = validateOkxRestAuthentication(
    input.authentication,
  );

  if (
    !Number.isInteger(input.createdAt) ||
    input.createdAt < 0
  ) {
    throw new OkxRestContractError(
      "requestContext.createdAt must be a non-negative integer timestamp.",
    );
  }

  return Object.freeze({
    requestId,
    method: input.method,
    path,
    authentication,
    createdAt: input.createdAt,
  });
}

export function createOkxRestQueryParameters(
  query: OkxRestQueryParameters,
): OkxRestQueryParameters {
  const normalizedEntries: Array<
    readonly [string, OkxRestQueryValue]
  > = [];

  for (const [rawKey, value] of Object.entries(query)) {
    const key = requireNonEmptyString(
      rawKey,
      "query parameter name",
    );

    validateQueryValue(value, key);

    if (value !== undefined && value !== null) {
      normalizedEntries.push(
        Object.freeze([key, value] as const),
      );
    }
  }

  normalizedEntries.sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return Object.freeze(
    Object.fromEntries(normalizedEntries),
  );
}

export function createOkxRestHeaders(
  headers: OkxRestHeaders,
): OkxRestHeaders {
  const normalizedEntries: Array<
    readonly [string, string]
  > = [];

  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = requireNonEmptyString(
      rawName,
      "header name",
    ).toLowerCase();

    const value = requireNonEmptyString(
      rawValue,
      `header "${name}"`,
    );

    normalizedEntries.push(
      Object.freeze([name, value] as const),
    );
  }

  normalizedEntries.sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return Object.freeze(
    Object.fromEntries(normalizedEntries),
  );
}

export function normalizeOkxRestPath(path: string): string {
  const normalizedPath = requireNonEmptyString(
    path,
    "path",
  );

  if (!normalizedPath.startsWith("/")) {
    throw new OkxRestContractError(
      'OKX REST path must begin with "/".',
    );
  }

  if (!normalizedPath.startsWith("/api/v5/")) {
    throw new OkxRestContractError(
      'OKX REST path must begin with "/api/v5/".',
    );
  }

  if (
    normalizedPath.includes("?") ||
    normalizedPath.includes("#")
  ) {
    throw new OkxRestContractError(
      "OKX REST path must not contain query parameters or fragments.",
    );
  }

  if (normalizedPath.includes("//")) {
    throw new OkxRestContractError(
      "OKX REST path must not contain duplicate slashes.",
    );
  }

  return normalizedPath;
}

export function serializeOkxRestQuery(
  query: OkxRestQueryParameters | undefined,
): string {
  if (!query) {
    return "";
  }

  const normalizedQuery =
    createOkxRestQueryParameters(query);

  const entries = Object.entries(normalizedQuery);

  if (entries.length === 0) {
    return "";
  }

  const parameters = new URLSearchParams();

  for (const [key, value] of entries) {
    if (value !== undefined && value !== null) {
      parameters.append(key, String(value));
    }
  }

  return parameters.toString();
}

export function buildOkxRestRequestPath(
  path: string,
  query?: OkxRestQueryParameters,
): string {
  const normalizedPath = normalizeOkxRestPath(path);
  const serializedQuery = serializeOkxRestQuery(query);

  return serializedQuery.length > 0
    ? `${normalizedPath}?${serializedQuery}`
    : normalizedPath;
}

export function serializeOkxRestBody(
  body: OkxRestBody | undefined,
): string {
  if (body === undefined || body === null) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body);
}

export function isOkxRestMethod(
  value: string,
): value is OkxRestMethod {
  return (
    value === "GET" ||
    value === "POST" ||
    value === "PUT" ||
    value === "DELETE"
  );
}

export function isOkxPrivateRestRequest<
  TBody extends OkxRestBody,
>(
  request: OkxRestRequest<TBody>,
): boolean {
  return request.authentication === "private";
}

function validateOkxRestMethod(
  method: string,
): asserts method is OkxRestMethod {
  if (!isOkxRestMethod(method)) {
    throw new OkxRestContractError(
      `Unsupported OKX REST method: "${method}".`,
    );
  }
}

function validateOkxRestAuthentication(
  authentication: string,
): OkxRestAuthentication {
  if (
    authentication !== "public" &&
    authentication !== "private"
  ) {
    throw new OkxRestContractError(
      `Unsupported OKX REST authentication mode: "${authentication}".`,
    );
  }

  return authentication;
}

function validateQueryValue(
  value: OkxRestQueryValue,
  key: string,
): void {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return;
  }

  throw new OkxRestContractError(
    `Query parameter "${key}" must be a finite primitive value.`,
  );
}

function validateHttpStatus(status: number): void {
  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    throw new OkxRestContractError(
      "HTTP status must be an integer between 100 and 599.",
    );
  }
}

function requireTimestampString(
  value: string,
  fieldName: string,
): string {
  const normalizedValue = requireNonEmptyString(
    value,
    fieldName,
  );

  if (!/^\d+$/.test(normalizedValue)) {
    throw new OkxRestContractError(
      `${fieldName} must contain a numeric timestamp.`,
    );
  }

  return normalizedValue;
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxRestContractError(
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxRestContractError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalizedValue;
}

function freezeRestBody<TBody extends OkxRestBody>(
  body: TBody,
): TBody {
  if (body === null || typeof body === "string") {
    return body;
  }

  if (Array.isArray(body)) {
    return Object.freeze([...body]) as TBody;
  }

  const objectBody =
    body as Readonly<Record<string, unknown>>;

  return Object.freeze({
    ...objectBody,
  }) as TBody;
}