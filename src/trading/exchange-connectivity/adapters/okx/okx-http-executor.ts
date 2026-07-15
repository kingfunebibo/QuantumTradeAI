import {
  createOkxRestHeaders,
  type OkxRestBody,
  type OkxRestHeaders,
} from "./okx-rest-contracts";

import {
  OkxRestTransportError,
  createOkxRawHttpResponse,
  type OkxRawHttpResponse,
  type OkxRestTransportExecutor,
  type OkxRestTransportRequest,
} from "./okx-rest-transport";

export interface OkxFetchLike {
  (
    input: string,
    init: OkxFetchRequestInit,
  ): Promise<OkxFetchResponse>;
}

export interface OkxFetchRequestInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

export interface OkxFetchResponse {
  readonly status: number;
  readonly headers: OkxFetchHeaders;
  text(): Promise<string>;
}

export interface OkxFetchHeaders {
  forEach(
    callback: (
      value: string,
      key: string,
    ) => void,
  ): void;
}

export interface OkxFetchExecutorConfiguration {
  readonly fetchImplementation?: OkxFetchLike;
}

export class OkxHttpExecutorError extends Error {
  public readonly code = "OKX_HTTP_EXECUTOR_ERROR" as const;

  public readonly retryable: boolean;
  public readonly cause?: unknown;

  public constructor(
    message: string,
    options: {
      readonly retryable: boolean;
      readonly cause?: unknown;
    },
  ) {
    super(message);

    this.name = "OkxHttpExecutorError";
    this.retryable = options.retryable;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FetchOkxRestTransportExecutor
  implements OkxRestTransportExecutor
{
  private readonly fetchImplementation: OkxFetchLike;

  public constructor(
    configuration: OkxFetchExecutorConfiguration = {},
  ) {
    this.fetchImplementation =
      configuration.fetchImplementation ??
      getGlobalFetchImplementation();
  }

  public async execute(
    request: OkxRestTransportRequest<OkxRestBody>,
  ): Promise<OkxRawHttpResponse> {
    const abortController = new AbortController();

    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, request.timeoutMs);

    try {
      const response =
        await this.fetchImplementation(
          request.url,
          createFetchRequestInit(
            request,
            abortController.signal,
          ),
        );

      const responseText = await response.text();

      return createOkxRawHttpResponse({
        status: response.status,
        headers: extractFetchHeaders(
          response.headers,
        ),
        body: parseOkxHttpResponseBody(
          responseText,
        ),
      });
    } catch (error: unknown) {
      if (
        abortController.signal.aborted ||
        isAbortError(error)
      ) {
        throw new OkxHttpExecutorError(
          `OKX REST request timed out after ${request.timeoutMs}ms.`,
          {
            retryable: true,
            cause: error,
          },
        );
      }

      if (error instanceof OkxHttpExecutorError) {
        throw error;
      }

      throw new OkxHttpExecutorError(
        createNetworkFailureMessage(error),
        {
          retryable: true,
          cause: error,
        },
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createFetchOkxRestTransportExecutor(
  configuration: OkxFetchExecutorConfiguration = {},
): OkxRestTransportExecutor {
  return new FetchOkxRestTransportExecutor(
    configuration,
  );
}

export function createFetchRequestInit(
  request: OkxRestTransportRequest<OkxRestBody>,
  signal: AbortSignal,
): OkxFetchRequestInit {
  const method = request.request.method;

  const headers: Record<string, string> = {
    ...request.headers,
  };

  const hasBody =
    request.serializedBody.length > 0;

  if (
    hasBody &&
    headers["content-type"] === undefined
  ) {
    headers["content-type"] = "application/json";
  }

  return Object.freeze({
    method,
    headers: createOkxRestHeaders(headers),
    ...(hasBody
      ? { body: request.serializedBody }
      : {}),
    signal,
  });
}

export function extractFetchHeaders(
  headers: OkxFetchHeaders,
): OkxRestHeaders {
  if (
    typeof headers !== "object" ||
    headers === null ||
    typeof headers.forEach !== "function"
  ) {
    throw new OkxHttpExecutorError(
      "Fetch response headers must implement forEach().",
      {
        retryable: false,
      },
    );
  }

  const extracted: Record<string, string> = {};

  headers.forEach((value, key) => {
    extracted[key] = value;
  });

  return createOkxRestHeaders(extracted);
}

export function parseOkxHttpResponseBody(
  responseText: string,
): unknown {
  if (typeof responseText !== "string") {
    throw new OkxHttpExecutorError(
      "Fetch response body must be a string.",
      {
        retryable: false,
      },
    );
  }

  if (responseText.trim().length === 0) {
    return Object.freeze({
      code: "OKX_EMPTY_RESPONSE",
      msg: "OKX returned an empty response body.",
      data: Object.freeze([]),
    });
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch (error: unknown) {
    throw new OkxHttpExecutorError(
      "OKX REST response body was not valid JSON.",
      {
        retryable: false,
        cause: error,
      },
    );
  }
}

export function isAbortError(
  error: unknown,
): boolean {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const candidate = error as {
    readonly name?: unknown;
    readonly code?: unknown;
  };

  return (
    candidate.name === "AbortError" ||
    candidate.code === "ABORT_ERR"
  );
}

function getGlobalFetchImplementation():
  OkxFetchLike {
  const globalFetch = globalThis.fetch;

  if (typeof globalFetch !== "function") {
    throw new OkxRestTransportError(
      "Global fetch is unavailable. Provide a fetchImplementation.",
    );
  }

  return async (
    input: string,
    init: OkxFetchRequestInit,
  ): Promise<OkxFetchResponse> => {
    return globalFetch(
      input,
      init as RequestInit,
    ) as Promise<OkxFetchResponse>;
  };
}

function createNetworkFailureMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim().length > 0
  ) {
    return `OKX REST network request failed: ${error.message}`;
  }

  return "OKX REST network request failed.";
}