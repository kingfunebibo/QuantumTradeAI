import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";

import {
  type BinanceConnectorConfiguration,
} from "./binance-connector-config";

import {
  BinanceRequestSigner,
  type BinanceSigningParameterValue,
  type BinanceSigningParameters,
  createBinanceCanonicalQueryString,
  normalizeBinanceSigningParameters,
} from "./binance-request-signer";

import {
  BinanceRestApiError,
  BinanceRestValidationError,
  type BinanceAccountInformationResponse,
  type BinanceAllOrdersRequest,
  type BinanceAveragePriceResponse,
  type BinanceBookTickerResponse,
  type BinanceCancelAllOrdersRequest,
  type BinanceCancelOrderRequest,
  type BinanceCancelOrderResponse,
  type BinanceExchangeInformationResponse,
  type BinanceKlineInterval,
  type BinanceKlineResponse,
  type BinanceMyTradesRequest,
  type BinanceNewOrderRequest,
  type BinanceOpenOrderResponse,
  type BinanceOpenOrdersRequest,
  type BinanceOrderBookResponse,
  type BinanceOrderResponse,
  type BinancePriceTickerResponse,
  type BinanceQueryOrderRequest,
  type BinanceQueryOrderResponse,
  type BinanceRecentTradeResponse,
  type BinanceRestRequestOptions,
  type BinanceRestResponse,
  type BinanceServerTimeResponse,
  type BinanceTestOrderRequest,
  type BinanceTradeResponse,
  type BinanceTwentyFourHourTickerResponse,
  assertBinanceNonNegativeInteger,
  assertBinancePositiveInteger,
  assertBinanceTimeRange,
  isBinanceApiErrorPayload,
  normalizeBinanceSymbol,
} from "./binance-rest.types";

export interface BinanceRestClientClock {
  now(): number;
}

export interface BinanceRestClientSleeper {
  sleep(delayMs: number): Promise<void>;
}

export interface BinanceRestClientLogger {
  debug?(message: string, context?: Readonly<Record<string, unknown>>): void;
  warn?(message: string, context?: Readonly<Record<string, unknown>>): void;
  error?(message: string, context?: Readonly<Record<string, unknown>>): void;
}

export interface BinanceRestClientDependencies {
  readonly axiosInstance?: AxiosInstance;
  readonly clock?: BinanceRestClientClock;
  readonly sleeper?: BinanceRestClientSleeper;
  readonly logger?: BinanceRestClientLogger;
  readonly random?: () => number;
}

export interface BinanceRequestWeightSnapshot {
  readonly usedWeight1Minute?: number;
  readonly orderCount10Seconds?: number;
  readonly orderCount1Minute?: number;
  readonly updatedAt: number;
}

export interface BinanceOrderBookRequest {
  readonly symbol: string;
  readonly limit?: 5 | 10 | 20 | 50 | 100 | 500 | 1_000 | 5_000;
}

export interface BinanceRecentTradesRequest {
  readonly symbol: string;
  readonly limit?: number;
}

export interface BinanceKlinesRequest {
  readonly symbol: string;
  readonly interval: BinanceKlineInterval;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly timeZone?: string;
  readonly limit?: number;
}

export interface BinanceTickerRequest {
  readonly symbol?: string;
}

export interface BinanceExchangeInformationRequest {
  readonly symbol?: string;
  readonly symbols?: readonly string[];
  readonly permissions?: readonly string[];
  readonly showPermissionSets?: boolean;
  readonly symbolStatus?: string;
}

export class BinanceRestClientConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BinanceRestClientConfigurationError";

    Object.setPrototypeOf(
      this,
      BinanceRestClientConfigurationError.prototype,
    );
  }
}

const DEFAULT_CLOCK: BinanceRestClientClock = Object.freeze({
  now(): number {
    return Date.now();
  },
});

const DEFAULT_SLEEPER: BinanceRestClientSleeper = Object.freeze({
  async sleep(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  },
});

const NOOP_LOGGER: BinanceRestClientLogger = Object.freeze({});

const RETRYABLE_HTTP_STATUS_CODES = new Set([
  408,
  418,
  425,
  429,
  500,
  502,
  503,
  504,
]);

const RETRYABLE_BINANCE_ERROR_CODES = new Set([
  -1000,
  -1001,
  -1003,
  -1004,
  -1006,
  -1007,
  -1008,
  -1015,
]);

const ORDER_BOOK_LIMITS = new Set([
  5,
  10,
  20,
  50,
  100,
  500,
  1_000,
  5_000,
]);

function assertNonEmptyString(
  value: string,
  fieldName: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new BinanceRestValidationError(
      `${fieldName} must be a non-empty string.`,
    );
  }
}

function assertTimeout(
  timeoutMs: number,
): void {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  ) {
    throw new BinanceRestValidationError(
      "timeoutMs must be a positive safe integer.",
    );
  }
}

function parseOptionalHeaderInteger(
  headers: Readonly<Record<string, unknown>>,
  headerName: string,
): number | undefined {
  const rawValue =
    headers[headerName] ??
    headers[headerName.toLowerCase()] ??
    headers[headerName.toUpperCase()];

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue)
      ? Math.trunc(rawValue)
      : undefined;
  }

  if (typeof rawValue !== "string") {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : undefined;
}

function normalizeHeaders(
  headers: unknown,
): Readonly<Record<string, string>> {
  if (
    headers === null ||
    typeof headers !== "object"
  ) {
    return Object.freeze({});
  }

  const normalizedHeaders: Record<string, string> = {};

  for (
    const [name, value] of Object.entries(
      headers as Record<string, unknown>,
    )
  ) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      normalizedHeaders[name.toLowerCase()] =
        value.map(String).join(",");
      continue;
    }

    normalizedHeaders[name.toLowerCase()] =
      String(value);
  }

  return Object.freeze(normalizedHeaders);
}

function convertToSigningParameters(
  parameters: Readonly<Record<string, unknown>>,
): BinanceSigningParameters {
  const converted: Record<
    string,
    BinanceSigningParameterValue
  > = {};

  for (const [name, value] of Object.entries(parameters)) {
    if (
      value === undefined ||
      value === null
    ) {
      converted[name] = value;
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      converted[name] = value;
      continue;
    }

    if (Array.isArray(value)) {
      converted[name] = value.map((item) => {
        if (
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean" ||
          typeof item === "bigint"
        ) {
          return item;
        }

        return JSON.stringify(item);
      });

      continue;
    }

    converted[name] = JSON.stringify(value);
  }

  return converted;
}

function createAbortSignal(
  timeoutMs: number,
): {
  readonly signal: AbortSignal;
  readonly clear: () => void;
} {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear(): void {
      clearTimeout(timeout);
    },
  };
}

function sanitizeRequestParameters(
  parameters:
    | Readonly<Record<string, unknown>>
    | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (parameters === undefined) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {
    ...parameters,
  };

  delete sanitized.signature;
  delete sanitized.apiKey;
  delete sanitized.apiSecret;

  return Object.freeze(sanitized);
}

function isAxiosError(
  error: unknown,
): error is AxiosError {
  return axios.isAxiosError(error);
}

function calculateRetryAfterMs(
  error: AxiosError,
  now: number,
): number | undefined {
  const retryAfterHeader =
    error.response?.headers?.["retry-after"];

  if (typeof retryAfterHeader === "number") {
    return retryAfterHeader * 1_000;
  }

  if (typeof retryAfterHeader !== "string") {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfterHeader);

  if (
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0
  ) {
    return retryAfterSeconds * 1_000;
  }

  const retryDate = Date.parse(retryAfterHeader);

  if (Number.isNaN(retryDate)) {
    return undefined;
  }

  return Math.max(0, retryDate - now);
}

function validateLimit(
  limit: number | undefined,
  maximum: number,
  fieldName = "limit",
): void {
  if (limit === undefined) {
    return;
  }

  assertBinancePositiveInteger(
    limit,
    fieldName,
  );

  if (limit > maximum) {
    throw new BinanceRestValidationError(
      `${fieldName} must not exceed ${maximum}.`,
    );
  }
}

function validateOrderIdentification(
  orderId: number | undefined,
  clientOrderId: string | undefined,
): void {
  if (
    orderId === undefined &&
    clientOrderId === undefined
  ) {
    throw new BinanceRestValidationError(
      "Either orderId or origClientOrderId must be provided.",
    );
  }

  if (orderId !== undefined) {
    assertBinancePositiveInteger(
      orderId,
      "orderId",
    );
  }

  if (clientOrderId !== undefined) {
    assertNonEmptyString(
      clientOrderId,
      "origClientOrderId",
    );
  }
}

function normalizeOrderParameters(
  request: BinanceNewOrderRequest,
): Readonly<Record<string, unknown>> {
  const symbol = normalizeBinanceSymbol(
    request.symbol,
  );

  assertNonEmptyString(
    request.side,
    "side",
  );
  assertNonEmptyString(
    request.type,
    "type",
  );

  const normalized: Record<string, unknown> = {
    ...request,
    symbol,
  };

  return Object.freeze(normalized);
}

export class BinanceRestClient {
  private readonly configuration: BinanceConnectorConfiguration;
  private readonly httpClient: AxiosInstance;
  private readonly signer?: BinanceRequestSigner;
  private readonly clock: BinanceRestClientClock;
  private readonly sleeper: BinanceRestClientSleeper;
  private readonly logger: BinanceRestClientLogger;
  private readonly random: () => number;

  private requestWeightSnapshot:
    | BinanceRequestWeightSnapshot
    | undefined;

  public constructor(
    configuration: BinanceConnectorConfiguration,
    dependencies: BinanceRestClientDependencies = {},
  ) {
    if (
      configuration === null ||
      typeof configuration !== "object"
    ) {
      throw new BinanceRestClientConfigurationError(
        "Binance connector configuration is required.",
      );
    }

    this.configuration = configuration;
    this.clock =
      dependencies.clock ?? DEFAULT_CLOCK;
    this.sleeper =
      dependencies.sleeper ?? DEFAULT_SLEEPER;
    this.logger =
      dependencies.logger ?? NOOP_LOGGER;
    this.random =
      dependencies.random ?? Math.random;

    this.httpClient =
      dependencies.axiosInstance ??
      axios.create({
        baseURL:
          configuration.endpoints.restBaseUrl,
        timeout:
          configuration.requestTimeoutMs,
        validateStatus: () => true,
      });

    if (configuration.credentials !== undefined) {
      this.signer = new BinanceRequestSigner({
        apiSecret:
          configuration.credentials.apiSecret,
        defaultRecvWindowMs:
          configuration.recvWindowMs,
        clock: this.clock,
      });
    }
  }

  public getRequestWeightSnapshot():
    | BinanceRequestWeightSnapshot
    | undefined {
    return this.requestWeightSnapshot;
  }

  public async request<
    TResponse,
    TParameters extends Record<string, unknown> =
      Record<string, unknown>,
  >(
    options: BinanceRestRequestOptions<TParameters>,
  ): Promise<BinanceRestResponse<TResponse>> {
    this.validateRequestOptions(options);

    const timeoutMs =
      options.timeoutMs ??
      this.configuration.requestTimeoutMs;

    assertTimeout(timeoutMs);

    const parameters =
      options.parameters ?? ({} as TParameters);

    const requestParameters =
      this.prepareRequestParameters(
        options.security,
        parameters,
      );

    const requestUrl =
      this.createRequestUrl(
        options.path,
        requestParameters.queryString,
      );

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (
      options.security === "API_KEY" ||
      options.security === "SIGNED"
    ) {
      const credentials =
        this.configuration.credentials;

      if (credentials === undefined) {
        throw new BinanceRestClientConfigurationError(
          `Binance credentials are required for ${options.security} requests.`,
        );
      }

      headers["X-MBX-APIKEY"] =
        credentials.apiKey;
    }

    let attempt = 0;

    while (true) {
      try {
        await this.applyLocalRateLimitThrottle();

        const response =
          await this.executeHttpRequest<TResponse>({
            method: options.method,
            url: requestUrl,
            headers,
            timeoutMs,
          });

        this.updateRequestWeightSnapshot(
          response.headers,
        );

        if (
          response.status >= 200 &&
          response.status < 300
        ) {
          return this.createRestResponse(response);
        }

        const error =
          this.createApiError(
            options,
            response.status,
            response.data,
          );

        if (
          attempt <
            this.configuration.retry.maxRetries &&
          this.isRetryableResponse(
            response.status,
            response.data,
          )
        ) {
          const retryDelay =
            this.calculateRetryDelay(
              attempt,
              undefined,
            );

          this.logger.warn?.(
            "Retrying Binance REST request after an unsuccessful response.",
            {
              method: options.method,
              path: options.path,
              status: response.status,
              attempt: attempt + 1,
              delayMs: retryDelay,
            },
          );

          attempt += 1;
          await this.sleeper.sleep(retryDelay);
          continue;
        }

        throw error;
      } catch (error) {
        if (error instanceof BinanceRestApiError) {
          throw error;
        }

        if (
          attempt <
            this.configuration.retry.maxRetries &&
          this.isRetryableTransportError(error)
        ) {
          const retryAfterMs =
            isAxiosError(error)
              ? calculateRetryAfterMs(
                  error,
                  this.clock.now(),
                )
              : undefined;

          const retryDelay =
            this.calculateRetryDelay(
              attempt,
              retryAfterMs,
            );

          this.logger.warn?.(
            "Retrying Binance REST request after a transport failure.",
            {
              method: options.method,
              path: options.path,
              attempt: attempt + 1,
              delayMs: retryDelay,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );

          attempt += 1;
          await this.sleeper.sleep(retryDelay);
          continue;
        }

        throw this.convertTransportError(
          error,
          options,
        );
      }
    }
  }

  public async ping(): Promise<void> {
    await this.request<Record<string, never>>({
      method: "GET",
      path: "/api/v3/ping",
      security: "NONE",
    });
  }

  public async getServerTime():
    Promise<BinanceServerTimeResponse> {
    const response =
      await this.request<BinanceServerTimeResponse>({
        method: "GET",
        path: "/api/v3/time",
        security: "NONE",
      });

    return response.data;
  }

  public async getExchangeInformation(
    request: BinanceExchangeInformationRequest = {},
  ): Promise<BinanceExchangeInformationResponse> {
    if (
      request.symbol !== undefined &&
      request.symbols !== undefined
    ) {
      throw new BinanceRestValidationError(
        "symbol and symbols cannot be used together.",
      );
    }

    const parameters: Record<string, unknown> = {
      ...request,
      symbol:
        request.symbol === undefined
          ? undefined
          : normalizeBinanceSymbol(
              request.symbol,
            ),
      symbols:
        request.symbols === undefined
          ? undefined
          : JSON.stringify(
              request.symbols.map(
                normalizeBinanceSymbol,
              ),
            ),
      permissions:
        request.permissions === undefined
          ? undefined
          : JSON.stringify(
              request.permissions,
            ),
    };

    const response =
      await this.request<
        BinanceExchangeInformationResponse,
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/exchangeInfo",
        security: "NONE",
        parameters,
      });

    return response.data;
  }

  public async getOrderBook(
    request: BinanceOrderBookRequest,
  ): Promise<BinanceOrderBookResponse> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    if (
      request.limit !== undefined &&
      !ORDER_BOOK_LIMITS.has(
        request.limit,
      )
    ) {
      throw new BinanceRestValidationError(
        "Order-book limit must be one of 5, 10, 20, 50, 100, 500, 1000, or 5000.",
      );
    }

    const response =
      await this.request<
        BinanceOrderBookResponse,
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/depth",
        security: "NONE",
        parameters: {
          symbol,
          limit: request.limit,
        },
      });

    return response.data;
  }

  public async getRecentTrades(
    request: BinanceRecentTradesRequest,
  ): Promise<readonly BinanceRecentTradeResponse[]> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    validateLimit(request.limit, 1_000);

    const response =
      await this.request<
        readonly BinanceRecentTradeResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/trades",
        security: "NONE",
        parameters: {
          symbol,
          limit: request.limit,
        },
      });

    return response.data;
  }

  public async getKlines(
    request: BinanceKlinesRequest,
  ): Promise<readonly BinanceKlineResponse[]> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    assertNonEmptyString(
      request.interval,
      "interval",
    );

    assertBinanceTimeRange(
      request.startTime,
      request.endTime,
    );

    validateLimit(request.limit, 1_000);

    if (request.timeZone !== undefined) {
      assertNonEmptyString(
        request.timeZone,
        "timeZone",
      );
    }

    const response =
      await this.request<
        readonly BinanceKlineResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/klines",
        security: "NONE",
        parameters: {
          symbol,
          interval: request.interval,
          startTime: request.startTime,
          endTime: request.endTime,
          timeZone: request.timeZone,
          limit: request.limit,
        },
      });

    return response.data;
  }

  public async getAveragePrice(
    symbol: string,
  ): Promise<BinanceAveragePriceResponse> {
    const response =
      await this.request<
        BinanceAveragePriceResponse,
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/avgPrice",
        security: "NONE",
        parameters: {
          symbol:
            normalizeBinanceSymbol(symbol),
        },
      });

    return response.data;
  }

  public async getPriceTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinancePriceTickerResponse
    | readonly BinancePriceTickerResponse[]
  > {
    const response =
      await this.request<
        | BinancePriceTickerResponse
        | readonly BinancePriceTickerResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/ticker/price",
        security: "NONE",
        parameters: {
          symbol:
            request.symbol === undefined
              ? undefined
              : normalizeBinanceSymbol(
                  request.symbol,
                ),
        },
      });

    return response.data;
  }

  public async getBookTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinanceBookTickerResponse
    | readonly BinanceBookTickerResponse[]
  > {
    const response =
      await this.request<
        | BinanceBookTickerResponse
        | readonly BinanceBookTickerResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/ticker/bookTicker",
        security: "NONE",
        parameters: {
          symbol:
            request.symbol === undefined
              ? undefined
              : normalizeBinanceSymbol(
                  request.symbol,
                ),
        },
      });

    return response.data;
  }

  public async getTwentyFourHourTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinanceTwentyFourHourTickerResponse
    | readonly BinanceTwentyFourHourTickerResponse[]
  > {
    const response =
      await this.request<
        | BinanceTwentyFourHourTickerResponse
        | readonly BinanceTwentyFourHourTickerResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/ticker/24hr",
        security: "NONE",
        parameters: {
          symbol:
            request.symbol === undefined
              ? undefined
              : normalizeBinanceSymbol(
                  request.symbol,
                ),
        },
      });

    return response.data;
  }

  public async getAccountInformation():
    Promise<BinanceAccountInformationResponse> {
    const response =
      await this.request<
        BinanceAccountInformationResponse
      >({
        method: "GET",
        path: "/api/v3/account",
        security: "SIGNED",
      });

    return response.data;
  }

  public async createOrder(
    request: BinanceNewOrderRequest,
  ): Promise<BinanceOrderResponse> {
    const response =
      await this.request<
        BinanceOrderResponse,
        Record<string, unknown>
      >({
        method: "POST",
        path: "/api/v3/order",
        security: "SIGNED",
        parameters:
          normalizeOrderParameters(
            request,
          ),
      });

    return response.data;
  }

  public async testOrder(
    request: BinanceTestOrderRequest,
  ): Promise<Record<string, unknown>> {
    const response =
      await this.request<
        Record<string, unknown>,
        Record<string, unknown>
      >({
        method: "POST",
        path: "/api/v3/order/test",
        security: "SIGNED",
        parameters:
          normalizeOrderParameters(
            request,
          ),
      });

    return response.data;
  }

  public async queryOrder(
    request: BinanceQueryOrderRequest,
  ): Promise<BinanceQueryOrderResponse> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    validateOrderIdentification(
      request.orderId,
      request.origClientOrderId,
    );

    const response =
      await this.request<
        BinanceQueryOrderResponse,
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/order",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol,
        },
      });

    return response.data;
  }

  public async cancelOrder(
    request: BinanceCancelOrderRequest,
  ): Promise<BinanceCancelOrderResponse> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    validateOrderIdentification(
      request.orderId,
      request.origClientOrderId,
    );

    const response =
      await this.request<
        BinanceCancelOrderResponse,
        Record<string, unknown>
      >({
        method: "DELETE",
        path: "/api/v3/order",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol,
        },
      });

    return response.data;
  }

  public async cancelAllOrders(
    request: BinanceCancelAllOrdersRequest,
  ): Promise<
    readonly (
      | BinanceCancelOrderResponse
      | Record<string, unknown>
    )[]
  > {
    const response =
      await this.request<
        readonly (
          | BinanceCancelOrderResponse
          | Record<string, unknown>
        )[],
        Record<string, unknown>
      >({
        method: "DELETE",
        path: "/api/v3/openOrders",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol:
            normalizeBinanceSymbol(
              request.symbol,
            ),
        },
      });

    return response.data;
  }

  public async getOpenOrders(
    request: BinanceOpenOrdersRequest = {},
  ): Promise<readonly BinanceOpenOrderResponse[]> {
    const response =
      await this.request<
        readonly BinanceOpenOrderResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/openOrders",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol:
            request.symbol === undefined
              ? undefined
              : normalizeBinanceSymbol(
                  request.symbol,
                ),
        },
      });

    return response.data;
  }

  public async getAllOrders(
    request: BinanceAllOrdersRequest,
  ): Promise<readonly BinanceQueryOrderResponse[]> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    assertBinanceTimeRange(
      request.startTime,
      request.endTime,
    );

    if (request.orderId !== undefined) {
      assertBinanceNonNegativeInteger(
        request.orderId,
        "orderId",
      );
    }

    validateLimit(request.limit, 1_000);

    const response =
      await this.request<
        readonly BinanceQueryOrderResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/allOrders",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol,
        },
      });

    return response.data;
  }

  public async getMyTrades(
    request: BinanceMyTradesRequest,
  ): Promise<readonly BinanceTradeResponse[]> {
    const symbol = normalizeBinanceSymbol(
      request.symbol,
    );

    assertBinanceTimeRange(
      request.startTime,
      request.endTime,
    );

    if (request.orderId !== undefined) {
      assertBinanceNonNegativeInteger(
        request.orderId,
        "orderId",
      );
    }

    if (request.fromId !== undefined) {
      assertBinanceNonNegativeInteger(
        request.fromId,
        "fromId",
      );
    }

    validateLimit(request.limit, 1_000);

    const response =
      await this.request<
        readonly BinanceTradeResponse[],
        Record<string, unknown>
      >({
        method: "GET",
        path: "/api/v3/myTrades",
        security: "SIGNED",
        parameters: {
          ...request,
          symbol,
        },
      });

    return response.data;
  }

  private validateRequestOptions<
    TParameters extends Record<string, unknown>,
  >(
    options: BinanceRestRequestOptions<TParameters>,
  ): void {
    if (
      options === null ||
      typeof options !== "object"
    ) {
      throw new BinanceRestValidationError(
        "Binance REST request options are required.",
      );
    }

    assertNonEmptyString(
      options.path,
      "path",
    );

    if (!options.path.startsWith("/")) {
      throw new BinanceRestValidationError(
        "Binance REST request path must begin with '/'.",
      );
    }

    if (
      options.method !== "GET" &&
      options.method !== "POST" &&
      options.method !== "PUT" &&
      options.method !== "DELETE"
    ) {
      throw new BinanceRestValidationError(
        `Unsupported Binance HTTP method: ${String(
          options.method,
        )}.`,
      );
    }

    if (
      options.security !== "NONE" &&
      options.security !== "API_KEY" &&
      options.security !== "SIGNED"
    ) {
      throw new BinanceRestValidationError(
        `Unsupported Binance request security type: ${String(
          options.security,
        )}.`,
      );
    }
  }

  private prepareRequestParameters(
    security: "NONE" | "API_KEY" | "SIGNED",
    parameters: Readonly<Record<string, unknown>>,
  ): {
    readonly parameters: Readonly<
      Record<string, string>
    >;
    readonly queryString: string;
  } {
    const signingParameters =
      convertToSigningParameters(parameters);

    if (security === "SIGNED") {
      if (this.signer === undefined) {
        throw new BinanceRestClientConfigurationError(
          "Binance credentials are required for signed requests.",
        );
      }

      const suppliedRecvWindow =
        typeof parameters.recvWindow === "number"
          ? parameters.recvWindow
          : undefined;

      const signedRequest =
        this.signer.signRequest({
          parameters: signingParameters,
          recvWindowMs:
            suppliedRecvWindow,
        });

      return {
        parameters:
          signedRequest.parameters,
        queryString:
          signedRequest.signedQueryString,
      };
    }

    const normalizedParameters =
      normalizeBinanceSigningParameters(
        signingParameters,
      );

    return {
      parameters:
        normalizedParameters,
      queryString:
        createBinanceCanonicalQueryString(
          normalizedParameters,
        ),
    };
  }

  private createRequestUrl(
    path: string,
    queryString: string,
  ): string {
    if (queryString.length === 0) {
      return path;
    }

    return `${path}?${queryString}`;
  }

  private async executeHttpRequest<TResponse>(
    options: {
      readonly method:
        | "GET"
        | "POST"
        | "PUT"
        | "DELETE";
      readonly url: string;
      readonly headers: Readonly<
        Record<string, string>
      >;
      readonly timeoutMs: number;
    },
  ): Promise<AxiosResponse<TResponse>> {
    const abort =
      createAbortSignal(options.timeoutMs);

    try {
      const requestConfig: AxiosRequestConfig = {
        method: options.method,
        url: options.url,
        headers: options.headers,
        timeout: options.timeoutMs,
        signal: abort.signal,
        validateStatus: () => true,
      };

      this.logger.debug?.(
        "Sending Binance REST request.",
        {
          method: options.method,
          url: options.url,
        },
      );

      return await this.httpClient.request<
        TResponse
      >(requestConfig);
    } finally {
      abort.clear();
    }
  }

  private createRestResponse<TResponse>(
    response: AxiosResponse<TResponse>,
  ): BinanceRestResponse<TResponse> {
    const headers = normalizeHeaders(
      response.headers,
    );

    return Object.freeze({
      status: response.status,
      data: response.data,
      headers,
      requestWeight:
        parseOptionalHeaderInteger(
          headers,
          "x-mbx-used-weight-1m",
        ),
      orderCount10Seconds:
        parseOptionalHeaderInteger(
          headers,
          "x-mbx-order-count-10s",
        ),
      orderCount1Minute:
        parseOptionalHeaderInteger(
          headers,
          "x-mbx-order-count-1m",
        ),
    });
  }

  private updateRequestWeightSnapshot(
    headers: unknown,
  ): void {
    const normalizedHeaders =
      normalizeHeaders(headers);

    const usedWeight1Minute =
      parseOptionalHeaderInteger(
        normalizedHeaders,
        "x-mbx-used-weight-1m",
      );

    const orderCount10Seconds =
      parseOptionalHeaderInteger(
        normalizedHeaders,
        "x-mbx-order-count-10s",
      );

    const orderCount1Minute =
      parseOptionalHeaderInteger(
        normalizedHeaders,
        "x-mbx-order-count-1m",
      );

    if (
      usedWeight1Minute === undefined &&
      orderCount10Seconds === undefined &&
      orderCount1Minute === undefined
    ) {
      return;
    }

    this.requestWeightSnapshot =
      Object.freeze({
        usedWeight1Minute,
        orderCount10Seconds,
        orderCount1Minute,
        updatedAt: this.clock.now(),
      });
  }

  private async applyLocalRateLimitThrottle():
    Promise<void> {
    const snapshot =
      this.requestWeightSnapshot;

    if (
      snapshot?.usedWeight1Minute === undefined
    ) {
      return;
    }

    const threshold =
      this.configuration.rateLimit
        .maxRequestWeight *
      this.configuration.rateLimit
        .throttleThreshold;

    if (
      snapshot.usedWeight1Minute <
      threshold
    ) {
      return;
    }

    const elapsed =
      this.clock.now() -
      snapshot.updatedAt;

    const remainingInterval =
      this.configuration.rateLimit
        .intervalMs -
      elapsed;

    if (remainingInterval <= 0) {
      return;
    }

    this.logger.warn?.(
      "Throttling Binance REST request because the local request-weight threshold was reached.",
      {
        usedWeight1Minute:
          snapshot.usedWeight1Minute,
        threshold,
        delayMs: remainingInterval,
      },
    );

    await this.sleeper.sleep(
      remainingInterval,
    );
  }

  private createApiError<
    TParameters extends Record<string, unknown>,
  >(
    options: BinanceRestRequestOptions<TParameters>,
    status: number,
    responseBody: unknown,
  ): BinanceRestApiError {
    const code =
      isBinanceApiErrorPayload(responseBody)
        ? responseBody.code
        : undefined;

    const message =
      isBinanceApiErrorPayload(responseBody)
        ? responseBody.msg
        : `Binance REST request failed with HTTP status ${status}.`;

    return new BinanceRestApiError(
      message,
      {
        method: options.method,
        path: options.path,
        status,
        code,
        responseBody,
        requestParameters:
          sanitizeRequestParameters(
            options.parameters,
          ),
      },
    );
  }

  private convertTransportError<
    TParameters extends Record<string, unknown>,
  >(
    error: unknown,
    options: BinanceRestRequestOptions<TParameters>,
  ): BinanceRestApiError {
    if (isAxiosError(error)) {
      const status =
        error.response?.status;
      const responseBody =
        error.response?.data;

      if (status !== undefined) {
        return this.createApiError(
          options,
          status,
          responseBody,
        );
      }

      const message =
        error.code === "ECONNABORTED" ||
        error.code === "ERR_CANCELED"
          ? `Binance REST request timed out: ${options.method} ${options.path}.`
          : `Binance REST transport failure: ${error.message}`;

      return new BinanceRestApiError(
        message,
        {
          method: options.method,
          path: options.path,
          responseBody,
          requestParameters:
            sanitizeRequestParameters(
              options.parameters,
            ),
        },
      );
    }

    return new BinanceRestApiError(
      error instanceof Error
        ? error.message
        : "Unknown Binance REST transport failure.",
      {
        method: options.method,
        path: options.path,
        requestParameters:
          sanitizeRequestParameters(
            options.parameters,
          ),
      },
    );
  }

  private isRetryableResponse(
    status: number,
    responseBody: unknown,
  ): boolean {
    if (
      RETRYABLE_HTTP_STATUS_CODES.has(status)
    ) {
      return true;
    }

    return (
      isBinanceApiErrorPayload(
        responseBody,
      ) &&
      RETRYABLE_BINANCE_ERROR_CODES.has(
        responseBody.code,
      )
    );
  }

  private isRetryableTransportError(
    error: unknown,
  ): boolean {
    if (!isAxiosError(error)) {
      return false;
    }

    if (
      error.response?.status !== undefined
    ) {
      return RETRYABLE_HTTP_STATUS_CODES.has(
        error.response.status,
      );
    }

    return (
      error.code === "ECONNABORTED" ||
      error.code === "ERR_CANCELED" ||
      error.code === "ECONNRESET" ||
      error.code === "ECONNREFUSED" ||
      error.code === "EAI_AGAIN" ||
      error.code === "ENETUNREACH" ||
      error.code === "ETIMEDOUT" ||
      error.response === undefined
    );
  }

  private calculateRetryDelay(
    retryIndex: number,
    retryAfterMs: number | undefined,
  ): number {
    if (
      retryAfterMs !== undefined &&
      retryAfterMs >= 0
    ) {
      return Math.min(
        retryAfterMs,
        this.configuration.retry
          .maxDelayMs,
      );
    }

    const exponentialDelay =
      this.configuration.retry
        .initialDelayMs *
      this.configuration.retry
        .backoffMultiplier **
        retryIndex;

    const boundedDelay = Math.min(
      exponentialDelay,
      this.configuration.retry
        .maxDelayMs,
    );

    /*
     * Jitter is intentionally injectable through `random` so tests can
     * produce deterministic retry timing.
     */
    const jitterMultiplier =
      0.75 + this.random() * 0.25;

    return Math.max(
      1,
      Math.round(
        boundedDelay *
          jitterMultiplier,
      ),
    );
  }
}