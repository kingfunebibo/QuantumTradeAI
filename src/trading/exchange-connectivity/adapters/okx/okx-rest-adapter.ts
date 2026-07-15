import {
  authenticateOkxRestRequest,
  type OkxClock,
} from "./okx-authentication";

import {
  type OkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  buildOkxRestRequestPath,
  createOkxPublicRestRequest,
  createOkxPrivateRestRequest,
  serializeOkxRestBody,
  type OkxRestBody,
  type OkxRestHeaders,
  type OkxRestQueryParameters,
  type OkxRestRequest,
  type OkxRestResult,
} from "./okx-rest-contracts";

import {
  createOkxRestTransportRequest,
  type OkxRestTransport,
} from "./okx-rest-transport";

export interface OkxRequestIdGenerator {
  nextId(): string;
}

export interface OkxRestAdapterDependencies {
  readonly configuration: OkxConnectorConfiguration;
  readonly transport: OkxRestTransport;
  readonly clock: OkxClock;
  readonly requestIdGenerator: OkxRequestIdGenerator;
}

export interface OkxPublicRestOperationInput<
  TBody extends OkxRestBody = null,
> {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly query?: OkxRestQueryParameters;
  readonly headers?: OkxRestHeaders;
  readonly body?: TBody;
  readonly requestId?: string;
}

export interface OkxPrivateRestOperationInput<
  TBody extends OkxRestBody = null,
> {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly path: string;
  readonly query?: OkxRestQueryParameters;
  readonly headers?: OkxRestHeaders;
  readonly body?: TBody;
  readonly requestId?: string;
}

export interface OkxPreparedRestRequest<
  TBody extends OkxRestBody = null,
> {
  readonly request: OkxRestRequest<TBody>;
  readonly url: string;
  readonly headers: OkxRestHeaders;
  readonly serializedBody: string;
  readonly timeoutMs: number;
}

export class OkxRestAdapterError extends Error {
  public readonly code = "OKX_REST_ADAPTER_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxRestAdapterError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OkxRestAdapter {
  private readonly configuration:
    OkxConnectorConfiguration;

  private readonly transport: OkxRestTransport;

  private readonly clock: OkxClock;

  private readonly requestIdGenerator:
    OkxRequestIdGenerator;

  public constructor(
    dependencies: OkxRestAdapterDependencies,
  ) {
    validateDependencies(dependencies);

    this.configuration = dependencies.configuration;
    this.transport = dependencies.transport;
    this.clock = dependencies.clock;
    this.requestIdGenerator =
      dependencies.requestIdGenerator;
  }

  public async executePublic<
    TData,
    TBody extends OkxRestBody = null,
  >(
    input: OkxPublicRestOperationInput<TBody>,
  ): Promise<OkxRestResult<TData>> {
    const prepared =
      this.preparePublicRequest(input);

    return this.transport.execute<
      TData,
      TBody
    >(
      createOkxRestTransportRequest({
        url: prepared.url,
        request: prepared.request,
        headers: prepared.headers,
        serializedBody:
          prepared.serializedBody,
        timeoutMs: prepared.timeoutMs,
      }),
    );
  }

  public async executePrivate<
    TData,
    TBody extends OkxRestBody = null,
  >(
    input: OkxPrivateRestOperationInput<TBody>,
  ): Promise<OkxRestResult<TData>> {
    const prepared =
      this.preparePrivateRequest(input);

    return this.transport.execute<
      TData,
      TBody
    >(
      createOkxRestTransportRequest({
        url: prepared.url,
        request: prepared.request,
        headers: prepared.headers,
        serializedBody:
          prepared.serializedBody,
        timeoutMs: prepared.timeoutMs,
      }),
    );
  }

  public preparePublicRequest<
    TBody extends OkxRestBody = null,
  >(
    input: OkxPublicRestOperationInput<TBody>,
  ): OkxPreparedRestRequest<TBody> {
    const request = createOkxPublicRestRequest({
      method: input.method,
      path: input.path,
      query: input.query,
      headers: input.headers,
      body: input.body,
      requestId:
        resolveRequestId(
          input.requestId,
          this.requestIdGenerator,
        ),
    });

    const requestPath = buildOkxRestRequestPath(
      request.path,
      request.query,
    );

    const serializedBody =
      serializeOkxRestBody(request.body);

    const headers: OkxRestHeaders =
      Object.freeze({
        ...(request.headers ?? {}),
      });

    return Object.freeze({
      request,
      url: buildAbsoluteOkxUrl(
        this.configuration.rest.baseUrl,
        requestPath,
      ),
      headers,
      serializedBody,
      timeoutMs:
        this.configuration.timeouts
          .requestTimeoutMs,
    });
  }

  public preparePrivateRequest<
    TBody extends OkxRestBody = null,
  >(
    input: OkxPrivateRestOperationInput<TBody>,
  ): OkxPreparedRestRequest<TBody> {
    const request = createOkxPrivateRestRequest({
      method: input.method,
      path: input.path,
      query: input.query,
      headers: input.headers,
      body: input.body,
      requestId:
        resolveRequestId(
          input.requestId,
          this.requestIdGenerator,
        ),
    });

    const authenticated =
      authenticateOkxRestRequest({
        configuration: this.configuration,
        request,
        clock: this.clock,
      });

    return Object.freeze({
      request,
      url: buildAbsoluteOkxUrl(
        this.configuration.rest.baseUrl,
        authenticated.requestPath,
      ),
      headers: authenticated.headers,
      serializedBody:
        authenticated.serializedBody,
      timeoutMs:
        this.configuration.timeouts
          .requestTimeoutMs,
    });
  }

  public getConfiguration():
    OkxConnectorConfiguration {
    return this.configuration;
  }
}

export function createDeterministicOkxRequestIdGenerator(
  ids: readonly string[],
): OkxRequestIdGenerator {
  if (!Array.isArray(ids)) {
    throw new OkxRestAdapterError(
      "ids must be an array.",
    );
  }

  if (ids.length === 0) {
    throw new OkxRestAdapterError(
      "ids must contain at least one request ID.",
    );
  }

  const normalizedIds = ids.map(
    (id, index) =>
      requireNonEmptyString(
        id,
        `ids[${index}]`,
      ),
  );

  let index = 0;

  return Object.freeze({
    nextId(): string {
      const currentIndex = Math.min(
        index,
        normalizedIds.length - 1,
      );

      const value =
        normalizedIds[currentIndex];

      index += 1;

      return value;
    },
  });
}

export function createSequentialOkxRequestIdGenerator(
  prefix = "okx-request",
  startAt = 1,
): OkxRequestIdGenerator {
  const normalizedPrefix = requireNonEmptyString(
    prefix,
    "prefix",
  );

  if (
    !Number.isInteger(startAt) ||
    startAt < 0
  ) {
    throw new OkxRestAdapterError(
      "startAt must be a non-negative integer.",
    );
  }

  let sequence = startAt;

  return Object.freeze({
    nextId(): string {
      const id =
        `${normalizedPrefix}-${sequence}`;

      sequence += 1;

      return id;
    },
  });
}

export function buildAbsoluteOkxUrl(
  baseUrl: string,
  requestPath: string,
): string {
  const normalizedBaseUrl =
    normalizeBaseUrl(baseUrl);

  const normalizedRequestPath =
    requireNonEmptyString(
      requestPath,
      "requestPath",
    );

  if (!normalizedRequestPath.startsWith("/")) {
    throw new OkxRestAdapterError(
      'requestPath must begin with "/".',
    );
  }

  return `${normalizedBaseUrl}${normalizedRequestPath}`;
}

function resolveRequestId(
  requestId: string | undefined,
  generator: OkxRequestIdGenerator,
): string {
  if (requestId !== undefined) {
    return requireNonEmptyString(
      requestId,
      "requestId",
    );
  }

  return requireNonEmptyString(
    generator.nextId(),
    "generated requestId",
  );
}

function validateDependencies(
  dependencies: OkxRestAdapterDependencies,
): void {
  if (
    typeof dependencies !== "object" ||
    dependencies === null
  ) {
    throw new OkxRestAdapterError(
      "dependencies must be an object.",
    );
  }

  if (
    typeof dependencies.configuration !==
      "object" ||
    dependencies.configuration === null
  ) {
    throw new OkxRestAdapterError(
      "configuration is required.",
    );
  }

  if (
    typeof dependencies.transport !==
      "object" ||
    dependencies.transport === null ||
    typeof dependencies.transport.execute !==
      "function"
  ) {
    throw new OkxRestAdapterError(
      "transport must implement OkxRestTransport.",
    );
  }

  if (
    typeof dependencies.clock !== "object" ||
    dependencies.clock === null ||
    typeof dependencies.clock.now !==
      "function"
  ) {
    throw new OkxRestAdapterError(
      "clock must implement OkxClock.",
    );
  }

  if (
    typeof dependencies.requestIdGenerator !==
      "object" ||
    dependencies.requestIdGenerator === null ||
    typeof dependencies.requestIdGenerator
      .nextId !== "function"
  ) {
    throw new OkxRestAdapterError(
      "requestIdGenerator must implement OkxRequestIdGenerator.",
    );
  }
}

function normalizeBaseUrl(
  baseUrl: string,
): string {
  const normalizedValue =
    requireNonEmptyString(
      baseUrl,
      "baseUrl",
    );

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new OkxRestAdapterError(
      "baseUrl must be a valid absolute URL.",
    );
  }

  if (
    url.protocol !== "https:" &&
    url.protocol !== "http:"
  ) {
    throw new OkxRestAdapterError(
      "baseUrl must use the HTTP or HTTPS protocol.",
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxRestAdapterError(
      `${fieldName} must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new OkxRestAdapterError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalizedValue;
}