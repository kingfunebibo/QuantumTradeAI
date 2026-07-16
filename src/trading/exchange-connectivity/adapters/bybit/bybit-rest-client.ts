/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Typed Bybit V5 REST client foundation.
 *
 * This module provides:
 * - an injectable HTTP transport contract;
 * - a default fetch-based transport;
 * - public and authenticated GET/POST execution;
 * - deterministic signing integration;
 * - Bybit response-envelope validation;
 * - structured API, transport, timeout, and protocol errors;
 * - response-header normalization;
 * - server-time retrieval and parsing.
 */

import {
  BybitRequestSigner,
  canonicalizeBybitJsonBody,
  canonicalizeBybitQuery,
  type BybitClock,
  type BybitJsonObject,
  type BybitQueryParameters,
} from "./bybit-authentication";

import type {
  BybitApiCredentials,
  BybitConnectorConfig,
} from "./bybit-connector-config";

export type BybitHttpMethod =
  | "GET"
  | "POST";

export type BybitHttpHeaders =
  Readonly<Record<string, string>>;

export interface BybitHttpTransportRequest {
  readonly method: BybitHttpMethod;
  readonly url: string;
  readonly headers: BybitHttpHeaders;
  readonly body?: string;
  readonly timeoutMs: number;
}

export interface BybitHttpTransportResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: BybitHttpHeaders;
  readonly body: string;
}

export interface BybitHttpTransport {
  execute(
    request: BybitHttpTransportRequest,
  ): Promise<BybitHttpTransportResponse>;
}

export interface BybitResponseEnvelope<
  TResult = unknown,
> {
  readonly retCode: number;
  readonly retMsg: string;
  readonly result: TResult;
  readonly retExtInfo?: unknown;
  readonly time?: number;
}

export interface BybitRestResponse<
  TResult,
> {
  readonly result: TResult;
  readonly retCode: number;
  readonly retMsg: string;
  readonly retExtInfo?: unknown;
  readonly serverTimeMs?: number;
  readonly status: number;
  readonly headers: BybitHttpHeaders;
}

export interface BybitPublicGetRequest {
  readonly path: string;
  readonly query?: BybitQueryParameters;
  readonly timeoutMs?: number;
  readonly headers?: BybitHttpHeaders;
}

export interface BybitPrivateGetRequest {
  readonly path: string;
  readonly query?: BybitQueryParameters;
  readonly timeoutMs?: number;
  readonly timestampMs?: number;
  readonly headers?: BybitHttpHeaders;
}

export interface BybitPrivatePostRequest {
  readonly path: string;
  readonly body?: BybitJsonObject;
  readonly timeoutMs?: number;
  readonly timestampMs?: number;
  readonly headers?: BybitHttpHeaders;
}

export interface BybitServerTimeResult {
  readonly timeSecond: string;
  readonly timeNano: string;
  readonly serverTimeMs: number;
}

export type BybitRestErrorKind =
  | "VALIDATION"
  | "TRANSPORT"
  | "TIMEOUT"
  | "HTTP"
  | "PROTOCOL"
  | "API";

export class BybitRestError
  extends Error {
  public readonly kind:
    BybitRestErrorKind;

  public readonly code: string;
  public readonly path?: string;
  public readonly status?: number;
  public readonly retCode?: number;
  public readonly retMsg?: string;
  public readonly responseBody?: string;
  public readonly cause?: unknown;

  public constructor(
    input: Readonly<{
      readonly kind:
        BybitRestErrorKind;
      readonly code: string;
      readonly message: string;
      readonly path?: string;
      readonly status?: number;
      readonly retCode?: number;
      readonly retMsg?: string;
      readonly responseBody?: string;
      readonly cause?: unknown;
    }>,
  ) {
    super(input.message);

    this.name = "BybitRestError";
    this.kind = input.kind;
    this.code = input.code;
    this.path = input.path;
    this.status = input.status;
    this.retCode = input.retCode;
    this.retMsg = input.retMsg;
    this.responseBody =
      input.responseBody;
    this.cause = input.cause;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export class FetchBybitHttpTransport
  implements BybitHttpTransport {
  public async execute(
    request: BybitHttpTransportRequest,
  ): Promise<BybitHttpTransportResponse> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        request.timeoutMs,
      );

    try {
      const response =
        await fetch(request.url, {
          method: request.method,
          headers: {
            ...request.headers,
          },
          body: request.body,
          signal: controller.signal,
        });

      const headers:
        Record<string, string> = {};

      response.headers.forEach(
        (value, key) => {
          headers[key.toLowerCase()] =
            value;
        },
      );

      return Object.freeze({
        status: response.status,
        statusText:
          response.statusText,
        headers:
          Object.freeze(headers),
        body: await response.text(),
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        throw new BybitRestError({
          kind: "TIMEOUT",
          code:
            "BYBIT_HTTP_REQUEST_TIMEOUT",
          message:
            `Bybit HTTP request timed out after ${request.timeoutMs} ms.`,
          cause: error,
        });
      }

      if (
        error instanceof
        BybitRestError
      ) {
        throw error;
      }

      throw new BybitRestError({
        kind: "TRANSPORT",
        code:
          "BYBIT_HTTP_TRANSPORT_ERROR",
        message:
          "Bybit HTTP transport failed.",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class BybitRestClient {
  private readonly signer:
    BybitRequestSigner;

  public constructor(
    private readonly config:
      BybitConnectorConfig,
    private readonly transport:
      BybitHttpTransport =
        new FetchBybitHttpTransport(),
    clock?: BybitClock,
  ) {
    this.signer =
      new BybitRequestSigner(clock);

    assertClientConfiguration(
      config,
    );
  }

  public async publicGet<TResult>(
    request: BybitPublicGetRequest,
  ): Promise<
    BybitRestResponse<TResult>
  > {
    const path =
      normalizePath(request.path);

    const queryString =
      canonicalizeBybitQuery(
        request.query,
      );

    const url =
      buildRequestUrl(
        this.getBaseUrl(),
        path,
        queryString,
      );

    return this.execute<TResult>({
      method: "GET",
      url,
      timeoutMs:
        request.timeoutMs ??
        this.config.requestTimeoutMs,
      headers: mergeHeaders(
        {
          Accept:
            "application/json",
        },
        request.headers,
      ),
    });
  }

  public async privateGet<TResult>(
    request: BybitPrivateGetRequest,
  ): Promise<
    BybitRestResponse<TResult>
  > {
    const credentials =
      this.requireCredentials();

    const path =
      normalizePath(request.path);

    const signed =
      this.signer.signRestRequest({
        method: "GET",
        credentials,
        receiveWindowMs:
          this.config.receiveWindowMs,
        timestampMs:
          request.timestampMs,
        query: request.query,
      });

    const url =
      buildRequestUrl(
        this.getBaseUrl(),
        path,
        signed.queryString,
      );

    return this.execute<TResult>({
      method: "GET",
      url,
      timeoutMs:
        request.timeoutMs ??
        this.config.requestTimeoutMs,
      headers: mergeHeaders(
        {
          Accept:
            "application/json",
          ...signed.headers,
        },
        request.headers,
      ),
    });
  }

  public async privatePost<TResult>(
    request: BybitPrivatePostRequest,
  ): Promise<
    BybitRestResponse<TResult>
  > {
    const credentials =
      this.requireCredentials();

    const path =
      normalizePath(request.path);

    const signed =
      this.signer.signRestRequest({
        method: "POST",
        credentials,
        receiveWindowMs:
          this.config.receiveWindowMs,
        timestampMs:
          request.timestampMs,
        body: request.body,
      });

    const url =
      buildRequestUrl(
        this.getBaseUrl(),
        path,
        "",
      );

    return this.execute<TResult>({
      method: "POST",
      url,
      body:
        signed.bodyString.length > 0
          ? signed.bodyString
          : undefined,
      timeoutMs:
        request.timeoutMs ??
        this.config.requestTimeoutMs,
      headers: mergeHeaders(
        {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          ...signed.headers,
        },
        request.headers,
      ),
    });
  }

  public async getServerTime():
    Promise<BybitServerTimeResult> {
    const response =
      await this.publicGet<{
        readonly timeSecond: string;
        readonly timeNano: string;
      }>({
        path: "/v5/market/time",
      });

    const timeSecond =
      response.result.timeSecond;

    const timeNano =
      response.result.timeNano;

    if (
      typeof timeSecond !== "string" ||
      !/^\d+$/.test(timeSecond)
    ) {
      throw new BybitRestError({
        kind: "PROTOCOL",
        code:
          "BYBIT_SERVER_TIME_SECONDS_INVALID",
        message:
          "Bybit server-time response contains an invalid timeSecond value.",
      });
    }

    if (
      typeof timeNano !== "string" ||
      !/^\d+$/.test(timeNano)
    ) {
      throw new BybitRestError({
        kind: "PROTOCOL",
        code:
          "BYBIT_SERVER_TIME_NANO_INVALID",
        message:
          "Bybit server-time response contains an invalid timeNano value.",
      });
    }

    const serverTimeMs =
      Number(
        BigInt(timeNano) /
        BigInt(1_000_000),
      );

    if (
      !Number.isSafeInteger(
        serverTimeMs,
      )
    ) {
      throw new BybitRestError({
        kind: "PROTOCOL",
        code:
          "BYBIT_SERVER_TIME_OUT_OF_RANGE",
        message:
          "Bybit server time is outside the JavaScript safe-integer range.",
      });
    }

    return Object.freeze({
      timeSecond,
      timeNano,
      serverTimeMs,
    });
  }

  private async execute<TResult>(
    request:
      BybitHttpTransportRequest,
  ): Promise<
    BybitRestResponse<TResult>
  > {
    let response:
      BybitHttpTransportResponse;

    try {
      response =
        await this.transport.execute(
          Object.freeze({
            ...request,
            headers:
              Object.freeze({
                ...request.headers,
              }),
          }),
        );
    } catch (error: unknown) {
      if (
        error instanceof
        BybitRestError
      ) {
        throw error;
      }

      throw new BybitRestError({
        kind: "TRANSPORT",
        code:
          "BYBIT_HTTP_TRANSPORT_ERROR",
        message:
          "Bybit HTTP transport failed.",
        cause: error,
      });
    }

    if (
      !Number.isInteger(
        response.status,
      ) ||
      response.status < 100 ||
      response.status > 599
    ) {
      throw new BybitRestError({
        kind: "PROTOCOL",
        code:
          "BYBIT_HTTP_STATUS_INVALID",
        message:
          "Bybit HTTP transport returned an invalid status code.",
        status: response.status,
        responseBody:
          response.body,
      });
    }

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      throw new BybitRestError({
        kind: "HTTP",
        code:
          "BYBIT_HTTP_STATUS_ERROR",
        message:
          `Bybit HTTP request failed with status ${response.status}.`,
        status: response.status,
        responseBody:
          response.body,
      });
    }

    const envelope =
      parseBybitResponseEnvelope<TResult>(
        response.body,
      );

    if (envelope.retCode !== 0) {
      throw new BybitRestError({
        kind: "API",
        code:
          "BYBIT_API_ERROR",
        message:
          `Bybit API rejected the request: ${envelope.retMsg}.`,
        status: response.status,
        retCode: envelope.retCode,
        retMsg: envelope.retMsg,
        responseBody:
          response.body,
      });
    }

    return Object.freeze({
      result: envelope.result,
      retCode: envelope.retCode,
      retMsg: envelope.retMsg,
      retExtInfo:
        envelope.retExtInfo,
      serverTimeMs:
        envelope.time,
      status: response.status,
      headers:
        Object.freeze({
          ...response.headers,
        }),
    });
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.config.domains?.rest
        .baseUrl;

    if (!baseUrl) {
      throw new BybitRestError({
        kind: "VALIDATION",
        code:
          "BYBIT_REST_BASE_URL_REQUIRED",
        message:
          "Bybit REST base URL is required.",
        path:
          "config.domains.rest.baseUrl",
      });
    }

    return removeTrailingSlashes(
      baseUrl,
    );
  }

  private requireCredentials():
    BybitApiCredentials {
    const credentials =
      this.config.credentials;

    if (!credentials) {
      throw new BybitRestError({
        kind: "VALIDATION",
        code:
          "BYBIT_PRIVATE_CREDENTIALS_REQUIRED",
        message:
          "Bybit credentials are required for private REST requests.",
        path:
          "config.credentials",
      });
    }

    return credentials;
  }
}

export function parseBybitResponseEnvelope<
  TResult,
>(
  body: string,
): BybitResponseEnvelope<TResult> {
  let value: unknown;

  try {
    value = JSON.parse(body);
  } catch (error: unknown) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_JSON_INVALID",
      message:
        "Bybit response body is not valid JSON.",
      responseBody: body,
      cause: error,
    });
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_ENVELOPE_INVALID",
      message:
        "Bybit response must be a JSON object.",
      responseBody: body,
    });
  }

  const envelope =
    value as Record<string, unknown>;

  if (
    !Number.isInteger(
      envelope.retCode,
    )
  ) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_RETCODE_INVALID",
      message:
        "Bybit response retCode must be an integer.",
      responseBody: body,
    });
  }

  if (
    typeof envelope.retMsg !==
    "string"
  ) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_RETMSG_INVALID",
      message:
        "Bybit response retMsg must be a string.",
      responseBody: body,
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      envelope,
      "result",
    )
  ) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_RESULT_MISSING",
      message:
        "Bybit response result field is missing.",
      responseBody: body,
    });
  }

  if (
    envelope.time !== undefined &&
    (
      !Number.isSafeInteger(
        envelope.time,
      ) ||
      (
        envelope.time as number
      ) < 0
    )
  ) {
    throw new BybitRestError({
      kind: "PROTOCOL",
      code:
        "BYBIT_RESPONSE_TIME_INVALID",
      message:
        "Bybit response time must be a non-negative safe integer when present.",
      responseBody: body,
    });
  }

  return Object.freeze({
    retCode:
      envelope.retCode as number,
    retMsg:
      envelope.retMsg as string,
    result:
      envelope.result as TResult,
    retExtInfo:
      envelope.retExtInfo,
    time:
      envelope.time as
        | number
        | undefined,
  });
}

export function buildRequestUrl(
  baseUrl: string,
  path: string,
  queryString: string,
): string {
  const normalizedBaseUrl =
    removeTrailingSlashes(
      baseUrl,
    );

  const normalizedPath =
    normalizePath(path);

  return queryString.length > 0
    ? `${normalizedBaseUrl}${normalizedPath}?${queryString}`
    : `${normalizedBaseUrl}${normalizedPath}`;
}

export function normalizePath(
  path: string,
): string {
  if (
    typeof path !== "string" ||
    path.trim().length === 0
  ) {
    throw new BybitRestError({
      kind: "VALIDATION",
      code:
        "BYBIT_REQUEST_PATH_REQUIRED",
      message:
        "Bybit request path must be a non-empty string.",
      path: "path",
    });
  }

  const trimmed =
    path.trim();

  if (
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    throw new BybitRestError({
      kind: "VALIDATION",
      code:
        "BYBIT_REQUEST_PATH_INVALID",
      message:
        "Bybit request path must not contain a query string or fragment.",
      path: "path",
    });
  }

  return trimmed.startsWith("/")
    ? trimmed
    : `/${trimmed}`;
}

function assertClientConfiguration(
  config: BybitConnectorConfig,
): void {
  if (
    typeof config !== "object" ||
    config === null
  ) {
    throw new BybitRestError({
      kind: "VALIDATION",
      code:
        "BYBIT_CLIENT_CONFIG_REQUIRED",
      message:
        "Bybit REST client configuration is required.",
      path: "config",
    });
  }

  if (
    !Number.isInteger(
      config.requestTimeoutMs,
    ) ||
    config.requestTimeoutMs <= 0
  ) {
    throw new BybitRestError({
      kind: "VALIDATION",
      code:
        "BYBIT_REQUEST_TIMEOUT_INVALID",
      message:
        "Bybit request timeout must be a positive integer.",
      path:
        "config.requestTimeoutMs",
    });
  }

  if (
    !config.domains?.rest.baseUrl
  ) {
    throw new BybitRestError({
      kind: "VALIDATION",
      code:
        "BYBIT_REST_BASE_URL_REQUIRED",
      message:
        "Bybit REST base URL is required.",
      path:
        "config.domains.rest.baseUrl",
    });
  }
}

function mergeHeaders(
  defaults: Readonly<
    Record<string, string>
  >,
  overrides?:
    Readonly<
      Record<string, string>
    >,
): BybitHttpHeaders {
  return Object.freeze({
    ...defaults,
    ...(overrides ?? {}),
  });
}

function removeTrailingSlashes(
  value: string,
): string {
  return value.replace(/\/+$/, "");
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}