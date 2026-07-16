import {
  BINANCE_CONNECTOR_METADATA,
  type BinanceConnectorMetadata,
} from "./binance-connector-metadata";

import {
  createBinanceConnectorConfiguration,
  type BinanceConnectorConfiguration,
  type CreateBinanceConnectorConfigurationOptions,
} from "./binance-connector-config";

import {
  BinanceRestClient,
  type BinanceRestClientDependencies,
  type BinanceRequestWeightSnapshot,
  type BinanceExchangeInformationRequest,
  type BinanceKlinesRequest,
  type BinanceOrderBookRequest,
  type BinanceRecentTradesRequest,
  type BinanceTickerRequest,
} from "./binance-rest-client";

import {
  BinanceWebSocketClient,
  type BinanceWebSocketClientDependencies,
  type BinanceWebSocketConnectOptions,
  type BinanceWebSocketEventListener,
  type BinanceWebSocketStateListener,
  type BinanceWebSocketErrorListener,
  type BinanceWebSocketCloseListener,
} from "./binance-websocket-client";

import {
  type BinanceAccountInformationResponse,
  type BinanceAllOrdersRequest,
  type BinanceAveragePriceResponse,
  type BinanceBookTickerResponse,
  type BinanceCancelAllOrdersRequest,
  type BinanceCancelOrderRequest,
  type BinanceCancelOrderResponse,
  type BinanceExchangeInformationResponse,
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
  type BinanceServerTimeResponse,
  type BinanceTestOrderRequest,
  type BinanceTradeResponse,
  type BinanceTwentyFourHourTickerResponse,
} from "./binance-rest.types";

import {
  type BinanceWebSocketCommandResponse,
  type BinanceWebSocketConnectionState,
  type BinanceWebSocketHealthSnapshot,
} from "./binance-websocket.types";

export type BinanceConnectorLifecycleState =
  | "CREATED"
  | "INITIALIZING"
  | "READY"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTING"
  | "DISCONNECTED"
  | "FAILED";

export interface BinanceConnectorDependencies {
  readonly rest?: BinanceRestClientDependencies;
  readonly websocket?: BinanceWebSocketClientDependencies;
}

export interface CreateBinanceConnectorOptions {
  readonly configuration?:
    | BinanceConnectorConfiguration
    | CreateBinanceConnectorConfigurationOptions;

  readonly dependencies?: BinanceConnectorDependencies;
}

export interface BinanceConnectorInitializationOptions {
  /**
   * When true, initialization verifies connectivity through Binance REST.
   *
   * Defaults to true.
   */
  readonly verifyRestConnectivity?: boolean;

  /**
   * When true, initialization also fetches exchange information.
   *
   * This provides a stronger readiness check but consumes additional
   * request weight.
   *
   * Defaults to false.
   */
  readonly loadExchangeInformation?: boolean;
}

export interface BinanceConnectorConnectOptions
  extends BinanceWebSocketConnectOptions {
  /**
   * When false, only REST readiness is maintained and no WebSocket
   * connection is opened.
   *
   * Defaults to true.
   */
  readonly connectWebSocket?: boolean;
}

export interface BinanceConnectorHealthSnapshot {
  readonly connectorId: "binance";
  readonly lifecycleState: BinanceConnectorLifecycleState;
  readonly initialized: boolean;
  readonly restReachable: boolean;
  readonly websocket: BinanceWebSocketHealthSnapshot;
  readonly requestWeight?: BinanceRequestWeightSnapshot;
  readonly lastInitializationAt?: number;
  readonly lastRestCheckAt?: number;
  readonly lastFailureAt?: number;
  readonly lastFailureMessage?: string;
  readonly healthy: boolean;
}

export interface BinanceConnectorReadinessSnapshot {
  readonly ready: boolean;
  readonly lifecycleState: BinanceConnectorLifecycleState;
  readonly restReachable: boolean;
  readonly websocketRequired: boolean;
  readonly websocketConnected: boolean;
}

export class BinanceConnectorLifecycleError extends Error {
  public readonly lifecycleState: BinanceConnectorLifecycleState;

  public constructor(
    message: string,
    lifecycleState: BinanceConnectorLifecycleState,
  ) {
    super(message);

    this.name = "BinanceConnectorLifecycleError";
    this.lifecycleState = lifecycleState;

    Object.setPrototypeOf(
      this,
      BinanceConnectorLifecycleError.prototype,
    );
  }
}

function isResolvedConfiguration(
  value:
    | BinanceConnectorConfiguration
    | CreateBinanceConnectorConfigurationOptions,
): value is BinanceConnectorConfiguration {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate = value as Partial<
    BinanceConnectorConfiguration
  >;

  return (
    typeof candidate.environment === "string" &&
    candidate.endpoints !== undefined &&
    typeof candidate.endpoints.restBaseUrl === "string" &&
    typeof candidate.endpoints.websocketBaseUrl === "string" &&
    typeof candidate.requestTimeoutMs === "number" &&
    typeof candidate.recvWindowMs === "number" &&
    candidate.rateLimit !== undefined &&
    candidate.retry !== undefined &&
    candidate.websocket !== undefined
  );
}

function resolveConfiguration(
  value:
    | BinanceConnectorConfiguration
    | CreateBinanceConnectorConfigurationOptions
    | undefined,
): BinanceConnectorConfiguration {
  if (value === undefined) {
    return createBinanceConnectorConfiguration();
  }

  return isResolvedConfiguration(value)
    ? value
    : createBinanceConnectorConfiguration(value);
}

export class BinanceConnector {
  public readonly metadata: BinanceConnectorMetadata;
  public readonly configuration: BinanceConnectorConfiguration;
  public readonly rest: BinanceRestClient;
  public readonly websocket: BinanceWebSocketClient;

  private lifecycleState: BinanceConnectorLifecycleState =
    "CREATED";

  private initialized = false;
  private restReachable = false;
  private websocketRequired = false;

  private lastInitializationAt: number | undefined;
  private lastRestCheckAt: number | undefined;
  private lastFailureAt: number | undefined;
  private lastFailureMessage: string | undefined;

  private readonly removeWebSocketStateListener: () => void;
  private readonly removeWebSocketErrorListener: () => void;

  public constructor(
    options: CreateBinanceConnectorOptions = {},
  ) {
    this.metadata = BINANCE_CONNECTOR_METADATA;

    this.configuration = resolveConfiguration(
      options.configuration,
    );

    this.rest = new BinanceRestClient(
      this.configuration,
      options.dependencies?.rest,
    );

    this.websocket = new BinanceWebSocketClient(
      this.configuration,
      options.dependencies?.websocket,
    );

    this.removeWebSocketStateListener =
      this.websocket.onStateChange((state) => {
        this.handleWebSocketStateChange(state);
      });

    this.removeWebSocketErrorListener =
      this.websocket.onError((error) => {
        this.recordFailure(error);
      });
  }

  public getLifecycleState():
    BinanceConnectorLifecycleState {
    return this.lifecycleState;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public isConnected(): boolean {
    if (!this.initialized || !this.restReachable) {
      return false;
    }

    return (
      !this.websocketRequired ||
      this.websocket.isConnected()
    );
  }

  public getReadinessSnapshot():
    BinanceConnectorReadinessSnapshot {
    const websocketConnected =
      this.websocket.isConnected();

    return Object.freeze({
      ready:
        this.initialized &&
        this.restReachable &&
        (
          !this.websocketRequired ||
          websocketConnected
        ),
      lifecycleState: this.lifecycleState,
      restReachable: this.restReachable,
      websocketRequired:
        this.websocketRequired,
      websocketConnected,
    });
  }

  public getHealthSnapshot():
    BinanceConnectorHealthSnapshot {
    const websocketHealth =
      this.websocket.getHealthSnapshot();

    const healthy =
      this.initialized &&
      this.restReachable &&
      (
        !this.websocketRequired ||
        websocketHealth.healthy
      ) &&
      this.lifecycleState !== "FAILED";

    return Object.freeze({
      connectorId: "binance",
      lifecycleState:
        this.lifecycleState,
      initialized:
        this.initialized,
      restReachable:
        this.restReachable,
      websocket:
        websocketHealth,
      requestWeight:
        this.rest.getRequestWeightSnapshot(),
      lastInitializationAt:
        this.lastInitializationAt,
      lastRestCheckAt:
        this.lastRestCheckAt,
      lastFailureAt:
        this.lastFailureAt,
      lastFailureMessage:
        this.lastFailureMessage,
      healthy,
    });
  }

  public async initialize(
    options:
      BinanceConnectorInitializationOptions = {},
  ): Promise<void> {
    if (
      this.lifecycleState === "INITIALIZING"
    ) {
      throw new BinanceConnectorLifecycleError(
        "Binance connector initialization is already in progress.",
        this.lifecycleState,
      );
    }

    if (
      this.lifecycleState === "CONNECTING" ||
      this.lifecycleState === "DISCONNECTING"
    ) {
      throw new BinanceConnectorLifecycleError(
        `Cannot initialize Binance connector while it is ${this.lifecycleState.toLowerCase()}.`,
        this.lifecycleState,
      );
    }

    this.transitionState("INITIALIZING");

    const verifyRestConnectivity =
      options.verifyRestConnectivity ?? true;

    try {
      if (verifyRestConnectivity) {
        await this.checkRestConnectivity();
      } else {
        this.restReachable = true;
      }

      if (
        options.loadExchangeInformation === true
      ) {
        await this.rest.getExchangeInformation();
      }

      this.initialized = true;
      this.lastInitializationAt = Date.now();
      this.clearFailure();

      this.transitionState("READY");
    } catch (error) {
      this.initialized = false;
      this.restReachable = false;

      this.recordFailure(error);
      this.transitionState("FAILED");

      throw error;
    }
  }

  public async connect(
    options:
      BinanceConnectorConnectOptions = {},
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (
      this.lifecycleState === "CONNECTING"
    ) {
      return;
    }

    if (
      this.lifecycleState === "DISCONNECTING"
    ) {
      throw new BinanceConnectorLifecycleError(
        "Cannot connect Binance connector while disconnection is in progress.",
        this.lifecycleState,
      );
    }

    const connectWebSocket =
      options.connectWebSocket ?? true;

    this.websocketRequired =
      connectWebSocket;

    if (!connectWebSocket) {
      this.transitionState("CONNECTED");
      return;
    }

    this.transitionState("CONNECTING");

    try {
      await this.websocket.connect({
        streams: options.streams,
        combined: options.combined,
      });

      /*
       * WebSocket opening is asynchronous. The state listener moves the
       * connector to CONNECTED when the transport reports CONNECTED.
       */
      if (this.websocket.isConnected()) {
        this.transitionState("CONNECTED");
      }
    } catch (error) {
      this.recordFailure(error);
      this.transitionState("FAILED");

      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (
      this.lifecycleState === "DISCONNECTED"
    ) {
      return;
    }

    this.transitionState("DISCONNECTING");

    try {
      await this.websocket.disconnect();

      this.websocketRequired = false;
      this.transitionState("DISCONNECTED");
    } catch (error) {
      this.recordFailure(error);
      this.transitionState("FAILED");

      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.disconnect();
    } finally {
      this.removeWebSocketStateListener();
      this.removeWebSocketErrorListener();

      this.initialized = false;
      this.restReachable = false;
      this.websocketRequired = false;

      this.transitionState("DISCONNECTED");
    }
  }

  public async checkRestConnectivity():
    Promise<BinanceServerTimeResponse> {
    try {
      await this.rest.ping();

      const serverTime =
        await this.rest.getServerTime();

      this.restReachable = true;
      this.lastRestCheckAt = Date.now();

      return serverTime;
    } catch (error) {
      this.restReachable = false;
      this.lastRestCheckAt = Date.now();

      this.recordFailure(error);

      throw error;
    }
  }

  public onWebSocketEvent(
    listener: BinanceWebSocketEventListener,
  ): () => void {
    return this.websocket.onEvent(listener);
  }

  public onWebSocketStateChange(
    listener: BinanceWebSocketStateListener,
  ): () => void {
    return this.websocket.onStateChange(
      listener,
    );
  }

  public onWebSocketError(
    listener: BinanceWebSocketErrorListener,
  ): () => void {
    return this.websocket.onError(listener);
  }

  public onWebSocketClose(
    listener: BinanceWebSocketCloseListener,
  ): () => void {
    return this.websocket.onClose(listener);
  }

  public async subscribe(
    streams: readonly string[],
  ): Promise<BinanceWebSocketCommandResponse> {
    this.assertWebSocketConnected();

    return this.websocket.subscribe(streams);
  }

  public async unsubscribe(
    streams: readonly string[],
  ): Promise<BinanceWebSocketCommandResponse> {
    this.assertWebSocketConnected();

    return this.websocket.unsubscribe(streams);
  }

  public async getServerTime():
    Promise<BinanceServerTimeResponse> {
    return this.rest.getServerTime();
  }

  public async getExchangeInformation(
    request: BinanceExchangeInformationRequest = {},
  ): Promise<BinanceExchangeInformationResponse> {
    return this.rest.getExchangeInformation(
      request,
    );
  }

  public async getOrderBook(
    request: BinanceOrderBookRequest,
  ): Promise<BinanceOrderBookResponse> {
    return this.rest.getOrderBook(request);
  }

  public async getRecentTrades(
    request: BinanceRecentTradesRequest,
  ): Promise<
    readonly BinanceRecentTradeResponse[]
  > {
    return this.rest.getRecentTrades(request);
  }

  public async getKlines(
    request: BinanceKlinesRequest,
  ): Promise<readonly BinanceKlineResponse[]> {
    return this.rest.getKlines(request);
  }

  public async getAveragePrice(
    symbol: string,
  ): Promise<BinanceAveragePriceResponse> {
    return this.rest.getAveragePrice(symbol);
  }

  public async getPriceTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinancePriceTickerResponse
    | readonly BinancePriceTickerResponse[]
  > {
    return this.rest.getPriceTicker(request);
  }

  public async getBookTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinanceBookTickerResponse
    | readonly BinanceBookTickerResponse[]
  > {
    return this.rest.getBookTicker(request);
  }

  public async getTwentyFourHourTicker(
    request: BinanceTickerRequest = {},
  ): Promise<
    | BinanceTwentyFourHourTickerResponse
    | readonly BinanceTwentyFourHourTickerResponse[]
  > {
    return this.rest.getTwentyFourHourTicker(
      request,
    );
  }

  public async getAccountInformation():
    Promise<BinanceAccountInformationResponse> {
    this.assertCredentialsConfigured();

    return this.rest.getAccountInformation();
  }

  public async createOrder(
    request: BinanceNewOrderRequest,
  ): Promise<BinanceOrderResponse> {
    this.assertCredentialsConfigured();

    return this.rest.createOrder(request);
  }

  public async testOrder(
    request: BinanceTestOrderRequest,
  ): Promise<Record<string, unknown>> {
    this.assertCredentialsConfigured();

    return this.rest.testOrder(request);
  }

  public async queryOrder(
    request: BinanceQueryOrderRequest,
  ): Promise<BinanceQueryOrderResponse> {
    this.assertCredentialsConfigured();

    return this.rest.queryOrder(request);
  }

  public async cancelOrder(
    request: BinanceCancelOrderRequest,
  ): Promise<BinanceCancelOrderResponse> {
    this.assertCredentialsConfigured();

    return this.rest.cancelOrder(request);
  }

  public async cancelAllOrders(
    request: BinanceCancelAllOrdersRequest,
  ): Promise<
    readonly (
      | BinanceCancelOrderResponse
      | Record<string, unknown>
    )[]
  > {
    this.assertCredentialsConfigured();

    return this.rest.cancelAllOrders(request);
  }

  public async getOpenOrders(
    request: BinanceOpenOrdersRequest = {},
  ): Promise<
    readonly BinanceOpenOrderResponse[]
  > {
    this.assertCredentialsConfigured();

    return this.rest.getOpenOrders(request);
  }

  public async getAllOrders(
    request: BinanceAllOrdersRequest,
  ): Promise<
    readonly BinanceQueryOrderResponse[]
  > {
    this.assertCredentialsConfigured();

    return this.rest.getAllOrders(request);
  }

  public async getMyTrades(
    request: BinanceMyTradesRequest,
  ): Promise<readonly BinanceTradeResponse[]> {
    this.assertCredentialsConfigured();

    return this.rest.getMyTrades(request);
  }

  private assertCredentialsConfigured(): void {
    if (
      this.configuration.credentials ===
      undefined
    ) {
      throw new BinanceConnectorLifecycleError(
        "Binance API credentials are required for private account and trading operations.",
        this.lifecycleState,
      );
    }
  }

  private assertWebSocketConnected(): void {
    if (!this.websocket.isConnected()) {
      throw new BinanceConnectorLifecycleError(
        "Binance WebSocket must be connected before managing subscriptions.",
        this.lifecycleState,
      );
    }
  }

  private handleWebSocketStateChange(
    state: BinanceWebSocketConnectionState,
  ): void {
    switch (state) {
      case "CONNECTED":
        if (
          this.initialized &&
          this.restReachable
        ) {
          this.transitionState("CONNECTED");
        }

        break;

      case "CONNECTING":
      case "RECONNECTING":
        if (this.websocketRequired) {
          this.transitionState("CONNECTING");
        }

        break;

      case "CLOSING":
        this.transitionState("DISCONNECTING");
        break;

      case "CLOSED":
      case "DISCONNECTED":
        if (
          this.lifecycleState !==
          "DISCONNECTING"
        ) {
          this.transitionState("DISCONNECTED");
        }

        break;

      case "FAILED":
        this.transitionState("FAILED");
        break;
    }
  }

  private recordFailure(error: unknown): void {
    this.lastFailureAt = Date.now();

    this.lastFailureMessage =
      error instanceof Error
        ? error.message
        : String(error);
  }

  private clearFailure(): void {
    this.lastFailureAt = undefined;
    this.lastFailureMessage = undefined;
  }

  private transitionState(
    state: BinanceConnectorLifecycleState,
  ): void {
    this.lifecycleState = state;
  }
}

export function createBinanceConnector(
  options: CreateBinanceConnectorOptions = {},
): BinanceConnector {
  return new BinanceConnector(options);
}