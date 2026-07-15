import {
  createOkxRestFailureResponse,
  createOkxRestHeaders,
  createOkxRestResponseEnvelope,
  createOkxRestSuccessResponse,
  type OkxRestApiError,
  type OkxRestBody,
  type OkxRestFailureResponse,
  type OkxRestHeaders,
  type OkxRestRequest,
  type OkxRestResult,
  type OkxRestSuccessResponse,
} from "./okx-rest-contracts";

export interface OkxRestTransportRequest<
  TBody extends OkxRestBody = null,
> {
  readonly url: string;
  readonly request: OkxRestRequest<TBody>;
  readonly headers: OkxRestHeaders;
  readonly serializedBody: string;
  readonly timeoutMs: number;
}

export interface OkxRestTransportResponseInput<TData> {
  readonly status: number;
  readonly headers?: OkxRestHeaders;
  readonly payload: unknown;
  readonly requestId?: string;
}

export interface OkxRestTransport {
  execute<TData, TBody extends OkxRestBody = null>(
    request: OkxRestTransportRequest<TBody>,
  ): Promise<OkxRestResult<TData>>;
}

export interface OkxRestTransportExecutor {
  execute(
    request: OkxRestTransportRequest<OkxRestBody>,
  ): Promise<OkxRawHttpResponse>;
}

export interface OkxRawHttpResponse {
  readonly status: number;
  readonly headers: OkxRestHeaders;
  readonly body: unknown;
}

export interface OkxRestTransportErrorMapper {
  map(
    error: unknown,
    request: OkxRestTransportRequest<OkxRestBody>,
  ): OkxRestApiError;
}

export interface OkxMockTransportExpectation<
  TData,
  TBody extends OkxRestBody = null,
> {
  readonly match: (
    request: OkxRestTransportRequest<TBody>,
  ) => boolean;
  readonly result: OkxRestResult<TData>;
}

export class OkxRestTransportError extends Error {
  public readonly code = "OKX_REST_TRANSPORT_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxRestTransportError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DefaultOkxRestTransport
  implements OkxRestTransport
{
  public constructor(
    private readonly executor: OkxRestTransportExecutor,
    private readonly errorMapper: OkxRestTransportErrorMapper,
  ) {
    validateExecutor(executor);
    validateErrorMapper(errorMapper);
  }

  public async execute<
    TData,
    TBody extends OkxRestBody = null,
  >(
    request: OkxRestTransportRequest<TBody>,
  ): Promise<OkxRestResult<TData>> {
    const validatedRequest =
      createOkxRestTransportRequest(request);

    try {
      const rawResponse =
        await this.executor.execute(
          validatedRequest as OkxRestTransportRequest<OkxRestBody>,
        );

      return createOkxRestTransportResult<TData>({
        status: rawResponse.status,
        headers: rawResponse.headers,
        payload: rawResponse.body,
        requestId:
          validatedRequest.request.requestId,
      });
    } catch (error: unknown) {
      const mappedError = this.errorMapper.map(
        error,
        validatedRequest as OkxRestTransportRequest<OkxRestBody>,
      );

      return createOkxRestFailureResponse({
        status: mappedError.status ?? 500,
        headers: {},
        envelope: {
          code: mappedError.code,
          msg: mappedError.message,
          data: [],
        },
        error: mappedError,
      });
    }
  }
}

export class DeterministicOkxMockTransport
  implements OkxRestTransport
{
  private readonly expectations: Array<
    OkxMockTransportExpectation<
      unknown,
      OkxRestBody
    >
  >;

  private executionCount = 0;

  public constructor(
    expectations: readonly OkxMockTransportExpectation<
      unknown,
      OkxRestBody
    >[],
  ) {
    if (!Array.isArray(expectations)) {
      throw new OkxRestTransportError(
        "expectations must be an array.",
      );
    }

    this.expectations = expectations.map(
      (expectation, index) =>
        createMockExpectation(
          expectation,
          index,
        ),
    );
  }

  public async execute<
    TData,
    TBody extends OkxRestBody = null,
  >(
    request: OkxRestTransportRequest<TBody>,
  ): Promise<OkxRestResult<TData>> {
    const validatedRequest =
      createOkxRestTransportRequest(request);

    const expectation =
      this.expectations[this.executionCount];

    if (!expectation) {
      throw new OkxRestTransportError(
        `No deterministic OKX mock expectation exists for execution ${this.executionCount}.`,
      );
    }

    const matches = expectation.match(
      validatedRequest as OkxRestTransportRequest<OkxRestBody>,
    );

    if (!matches) {
      throw new OkxRestTransportError(
        `Deterministic OKX mock expectation ${this.executionCount} did not match the request.`,
      );
    }

    this.executionCount += 1;

    return expectation.result as OkxRestResult<TData>;
  }

  public getExecutionCount(): number {
    return this.executionCount;
  }

  public getRemainingExpectationCount(): number {
    return (
      this.expectations.length -
      this.executionCount
    );
  }

  public assertAllExpectationsConsumed(): void {
    const remaining =
      this.getRemainingExpectationCount();

    if (remaining !== 0) {
      throw new OkxRestTransportError(
        `${remaining} deterministic OKX mock expectation(s) were not consumed.`,
      );
    }
  }
}

export function createOkxRestTransportRequest<
  TBody extends OkxRestBody = null,
>(
  input: OkxRestTransportRequest<TBody>,
): OkxRestTransportRequest<TBody> {
  const url = normalizeAbsoluteHttpUrl(input.url);

  if (
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs <= 0
  ) {
    throw new OkxRestTransportError(
      "timeoutMs must be a positive integer.",
    );
  }

  if (typeof input.serializedBody !== "string") {
    throw new OkxRestTransportError(
      "serializedBody must be a string.",
    );
  }

  const headers = createOkxRestHeaders(
    input.headers,
  );

  return Object.freeze({
    url,
    request: input.request,
    headers,
    serializedBody: input.serializedBody,
    timeoutMs: input.timeoutMs,
  });
}

export function createOkxRawHttpResponse(
  input: OkxRawHttpResponse,
): OkxRawHttpResponse {
  validateHttpStatus(input.status);

  return Object.freeze({
    status: input.status,
    headers: createOkxRestHeaders(
      input.headers,
    ),
    body: input.body,
  });
}

export function createOkxRestTransportResult<TData>(
  input: OkxRestTransportResponseInput<TData>,
): OkxRestResult<TData> {
  validateHttpStatus(input.status);

  const headers = createOkxRestHeaders(
    input.headers ?? {},
  );

  const envelope =
    parseOkxRestResponseEnvelope<TData>(
      input.payload,
    );

  if (
    input.status >= 200 &&
    input.status <= 299 &&
    envelope.code === "0"
  ) {
    return createOkxRestSuccessResponse({
      status: input.status,
      headers,
      envelope,
    });
  }

  return createOkxRestFailureResponse({
    status: input.status,
    headers,
    envelope,
    error: {
      name: "OkxRestApiError",
      code: envelope.code,
      message:
        envelope.msg.length > 0
          ? envelope.msg
          : `OKX REST request failed with code ${envelope.code}.`,
      status: input.status,
      requestId: input.requestId,
      retryable:
        isRetryableHttpStatus(input.status),
    },
  });
}

export function parseOkxRestResponseEnvelope<TData>(
  payload: unknown,
) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new OkxRestTransportError(
      "OKX REST response payload must be an object.",
    );
  }

  const record = payload as Record<
    string,
    unknown
  >;

  if (typeof record.code !== "string") {
    throw new OkxRestTransportError(
      "OKX REST response payload code must be a string.",
    );
  }

  if (typeof record.msg !== "string") {
    throw new OkxRestTransportError(
      "OKX REST response payload msg must be a string.",
    );
  }

  if (!Array.isArray(record.data)) {
    throw new OkxRestTransportError(
      "OKX REST response payload data must be an array.",
    );
  }

  if (
    record.inTime !== undefined &&
    typeof record.inTime !== "string"
  ) {
    throw new OkxRestTransportError(
      "OKX REST response payload inTime must be a string when provided.",
    );
  }

  if (
    record.outTime !== undefined &&
    typeof record.outTime !== "string"
  ) {
    throw new OkxRestTransportError(
      "OKX REST response payload outTime must be a string when provided.",
    );
  }

  return createOkxRestResponseEnvelope<TData>({
    code: record.code,
    msg: record.msg,
    data: record.data as readonly TData[],
    ...(record.inTime !== undefined
      ? { inTime: record.inTime }
      : {}),
    ...(record.outTime !== undefined
      ? { outTime: record.outTime }
      : {}),
  });
}

export function createStaticOkxRestTransportExecutor(
  responses: readonly OkxRawHttpResponse[],
): OkxRestTransportExecutor {
  if (!Array.isArray(responses)) {
    throw new OkxRestTransportError(
      "responses must be an array.",
    );
  }

  if (responses.length === 0) {
    throw new OkxRestTransportError(
      "responses must contain at least one response.",
    );
  }

  const normalizedResponses = responses.map(
    (response) =>
      createOkxRawHttpResponse(response),
  );

  let index = 0;

  return Object.freeze({
    async execute(): Promise<OkxRawHttpResponse> {
      const currentIndex = Math.min(
        index,
        normalizedResponses.length - 1,
      );

      const response =
        normalizedResponses[currentIndex];

      index += 1;

      return response;
    },
  });
}

export function createThrowingOkxRestTransportExecutor(
  errors: readonly unknown[],
): OkxRestTransportExecutor {
  if (!Array.isArray(errors)) {
    throw new OkxRestTransportError(
      "errors must be an array.",
    );
  }

  if (errors.length === 0) {
    throw new OkxRestTransportError(
      "errors must contain at least one value.",
    );
  }

  let index = 0;

  return Object.freeze({
    async execute(): Promise<OkxRawHttpResponse> {
      const currentIndex = Math.min(
        index,
        errors.length - 1,
      );

      const error = errors[currentIndex];

      index += 1;

      throw error;
    },
  });
}

export function createDefaultOkxRestTransportErrorMapper():
  OkxRestTransportErrorMapper {
  return Object.freeze({
    map(
      error: unknown,
      request: OkxRestTransportRequest<OkxRestBody>,
    ): OkxRestApiError {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown OKX REST transport failure.";

      return Object.freeze({
        name: "OkxRestApiError",
        code: "OKX_TRANSPORT_FAILURE",
        message,
        status: 503,
        requestId:
          request.request.requestId,
        method: request.request.method,
        path: request.request.path,
        retryable: true,
        cause: error,
      });
    },
  });
}

export function isRetryableHttpStatus(
  status: number,
): boolean {
  validateHttpStatus(status);

  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function createMockExpectation(
  expectation: OkxMockTransportExpectation<
    unknown,
    OkxRestBody
  >,
  index: number,
): OkxMockTransportExpectation<
  unknown,
  OkxRestBody
> {
  if (
    typeof expectation !== "object" ||
    expectation === null
  ) {
    throw new OkxRestTransportError(
      `expectations[${index}] must be an object.`,
    );
  }

  if (typeof expectation.match !== "function") {
    throw new OkxRestTransportError(
      `expectations[${index}].match must be a function.`,
    );
  }

  if (
    typeof expectation.result !== "object" ||
    expectation.result === null
  ) {
    throw new OkxRestTransportError(
      `expectations[${index}].result must be an OKX REST result.`,
    );
  }

  return Object.freeze({
    match: expectation.match,
    result: expectation.result,
  });
}

function normalizeAbsoluteHttpUrl(
  value: string,
): string {
  if (typeof value !== "string") {
    throw new OkxRestTransportError(
      "url must be a string.",
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxRestTransportError(
      "url must not be empty.",
    );
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new OkxRestTransportError(
      "url must be a valid absolute URL.",
    );
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new OkxRestTransportError(
      "url must use the HTTP or HTTPS protocol.",
    );
  }

  return url.toString();
}

function validateExecutor(
  executor: OkxRestTransportExecutor,
): void {
  if (
    typeof executor !== "object" ||
    executor === null ||
    typeof executor.execute !== "function"
  ) {
    throw new OkxRestTransportError(
      "executor must implement OkxRestTransportExecutor.",
    );
  }
}

function validateErrorMapper(
  errorMapper: OkxRestTransportErrorMapper,
): void {
  if (
    typeof errorMapper !== "object" ||
    errorMapper === null ||
    typeof errorMapper.map !== "function"
  ) {
    throw new OkxRestTransportError(
      "errorMapper must implement OkxRestTransportErrorMapper.",
    );
  }
}

function validateHttpStatus(status: number): void {
  if (
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599
  ) {
    throw new OkxRestTransportError(
      "HTTP status must be an integer between 100 and 599.",
    );
  }
}