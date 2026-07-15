import {
  type OkxClock,
} from "./okx-authentication";

import {
  createOkxConnectorConfiguration,
  type OkxConnectorConfiguration,
} from "./okx-connector-config";

import {
  createFetchOkxRestTransportExecutor,
  type OkxFetchLike,
} from "./okx-http-executor";

import {
  OkxPrivateAccountApi,
} from "./okx-private-account-api";

import {
  OkxPrivateTradingApi,
} from "./okx-private-trading-api";

import {
  OkxPublicMarketApi,
} from "./okx-public-market-api";

import {
  OkxReconnectManager,
  createSystemOkxReconnectScheduler,
  type OkxReconnectConfiguration,
  type OkxReconnectScheduler,
} from "./okx-reconnect-manager";

import {
  OkxRestAdapter,
  createSequentialOkxRequestIdGenerator,
  type OkxRequestIdGenerator,
} from "./okx-rest-adapter";

import {
  DefaultOkxRestTransport,
  createDefaultOkxRestTransportErrorMapper,
  type OkxRestTransport,
} from "./okx-rest-transport";

import {
  OkxHeartbeatManager,
  createSystemOkxHeartbeatScheduler,
  type OkxHeartbeatConfiguration,
  type OkxHeartbeatScheduler,
} from "./okx-heartbeat-manager";

import {
  OkxWebSocketClient,
  createSequentialOkxWebSocketRequestIdGenerator,
  type OkxWebSocketEndpointConfiguration,
  type OkxWebSocketMessageHandlers,
  type OkxWebSocketRequestIdGenerator,
} from "./okx-websocket-client";

import {
  createDefaultOkxWebSocketFactory,
  DefaultOkxWebSocketTransport,
  type OkxWebSocketFactory,
  type OkxWebSocketTransport,
} from "./okx-websocket-transport";

export interface OkxConnectorRuntimeOptions {
  readonly configuration?: Parameters<
    typeof createOkxConnectorConfiguration
  >[0];
  readonly clock?: OkxClock;
  readonly fetchImplementation?: OkxFetchLike;
  readonly webSocketFactory?: OkxWebSocketFactory;
  readonly restTransport?: OkxRestTransport;
  readonly webSocketTransport?: OkxWebSocketTransport;
  readonly restRequestIdGenerator?: OkxRequestIdGenerator;
  readonly webSocketRequestIdGenerator?: OkxWebSocketRequestIdGenerator;
  readonly webSocketEndpoints?: OkxWebSocketEndpointConfiguration;
  readonly publicWebSocketHandlers?: OkxWebSocketMessageHandlers;
  readonly privateWebSocketHandlers?: OkxWebSocketMessageHandlers;
  readonly businessWebSocketHandlers?: OkxWebSocketMessageHandlers;
  readonly heartbeatScheduler?: OkxHeartbeatScheduler;
  readonly reconnectScheduler?: OkxReconnectScheduler;
  readonly heartbeatConfiguration?: OkxHeartbeatConfiguration;
  readonly reconnectConfiguration?: OkxReconnectConfiguration;
}

export interface OkxConnectorRestApis {
  readonly adapter: OkxRestAdapter;
  readonly publicMarket: OkxPublicMarketApi;
  readonly privateAccount: OkxPrivateAccountApi;
  readonly privateTrading: OkxPrivateTradingApi;
}

export interface OkxConnectorWebSocketClients {
  readonly public: OkxWebSocketClient;
  readonly private: OkxWebSocketClient;
  readonly business: OkxWebSocketClient;
}

export interface OkxConnectorComposition {
  readonly configuration: OkxConnectorConfiguration;
  readonly rest: OkxConnectorRestApis;
  readonly websocket: OkxConnectorWebSocketClients;

  createPublicHeartbeatManager(): OkxHeartbeatManager;
  createPrivateHeartbeatManager(): OkxHeartbeatManager;
  createBusinessHeartbeatManager(): OkxHeartbeatManager;

  createPublicReconnectManager(): OkxReconnectManager;
  createPrivateReconnectManager(): OkxReconnectManager;
  createBusinessReconnectManager(): OkxReconnectManager;
}

export class OkxConnectorCompositionError extends Error {
  public readonly code =
    "OKX_CONNECTOR_COMPOSITION_ERROR" as const;

  public constructor(message: string) {
    super(message);

    this.name = "OkxConnectorCompositionError";

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createOkxConnectorComposition(
  options: OkxConnectorRuntimeOptions = {},
): OkxConnectorComposition {
  const configuration =
    createOkxConnectorConfiguration(
      options.configuration,
    );

  const clock =
    options.clock ??
    createSystemOkxClock();

  const restTransport =
    options.restTransport ??
    createProductionRestTransport(
      options.fetchImplementation,
    );

  const restRequestIdGenerator =
    options.restRequestIdGenerator ??
    createSequentialOkxRequestIdGenerator(
      "okx-rest",
      1,
    );

  const restAdapter = new OkxRestAdapter({
    configuration,
    transport: restTransport,
    clock,
    requestIdGenerator:
      restRequestIdGenerator,
  });

  const publicMarket =
    new OkxPublicMarketApi(restAdapter);

  const privateAccount =
    new OkxPrivateAccountApi(restAdapter);

  const privateTrading =
    new OkxPrivateTradingApi(restAdapter);

  const webSocketTransport =
    options.webSocketTransport ??
    new DefaultOkxWebSocketTransport(
      options.webSocketFactory ??
      createDefaultOkxWebSocketFactory(),
    );

  const webSocketEndpoints =
    options.webSocketEndpoints ??
    resolveOkxWebSocketEndpoints(
      configuration,
    );

  const webSocketRequestIdGenerator =
    options.webSocketRequestIdGenerator ??
    createSequentialOkxWebSocketRequestIdGenerator(
      "okx-ws",
      1,
    );

  const publicWebSocket =
    new OkxWebSocketClient(
      "public",
      {
        configuration,
        endpoints:
          webSocketEndpoints,
        transport:
          webSocketTransport,
        clock,
        requestIdGenerator:
          webSocketRequestIdGenerator,
      },
      options.publicWebSocketHandlers,
    );

  const privateWebSocket =
    new OkxWebSocketClient(
      "private",
      {
        configuration,
        endpoints:
          webSocketEndpoints,
        transport:
          webSocketTransport,
        clock,
        requestIdGenerator:
          webSocketRequestIdGenerator,
      },
      options.privateWebSocketHandlers,
    );

  const businessWebSocket =
    new OkxWebSocketClient(
      "business",
      {
        configuration,
        endpoints:
          webSocketEndpoints,
        transport:
          webSocketTransport,
        clock,
        requestIdGenerator:
          webSocketRequestIdGenerator,
      },
      options.businessWebSocketHandlers,
    );

  const heartbeatScheduler =
    options.heartbeatScheduler ??
    createSystemOkxHeartbeatScheduler();

  const reconnectScheduler =
    options.reconnectScheduler ??
    createSystemOkxReconnectScheduler();

  const heartbeatConfiguration =
    options.heartbeatConfiguration ??
    Object.freeze({
      heartbeatIntervalMs: 25_000,
      pongTimeoutMs: 5_000,
      pingMessage: "ping",
      pongMessage: "pong",
    });

  const reconnectConfiguration =
    options.reconnectConfiguration ??
    Object.freeze({
      initialDelayMs: 1_000,
      maximumDelayMs: 30_000,
      multiplier: 2,
      maximumAttempts: 10,
    });

  return Object.freeze({
    configuration,

    rest: Object.freeze({
      adapter: restAdapter,
      publicMarket,
      privateAccount,
      privateTrading,
    }),

    websocket: Object.freeze({
      public: publicWebSocket,
      private: privateWebSocket,
      business: businessWebSocket,
    }),

    createPublicHeartbeatManager():
      OkxHeartbeatManager {
      return createHeartbeatManager(
        publicWebSocket,
        clock,
        heartbeatScheduler,
        heartbeatConfiguration,
      );
    },

    createPrivateHeartbeatManager():
      OkxHeartbeatManager {
      return createHeartbeatManager(
        privateWebSocket,
        clock,
        heartbeatScheduler,
        heartbeatConfiguration,
      );
    },

    createBusinessHeartbeatManager():
      OkxHeartbeatManager {
      return createHeartbeatManager(
        businessWebSocket,
        clock,
        heartbeatScheduler,
        heartbeatConfiguration,
      );
    },

    createPublicReconnectManager():
      OkxReconnectManager {
      return createReconnectManager(
        publicWebSocket,
        clock,
        reconnectScheduler,
        reconnectConfiguration,
      );
    },

    createPrivateReconnectManager():
      OkxReconnectManager {
      return createReconnectManager(
        privateWebSocket,
        clock,
        reconnectScheduler,
        reconnectConfiguration,
      );
    },

    createBusinessReconnectManager():
      OkxReconnectManager {
      return createReconnectManager(
        businessWebSocket,
        clock,
        reconnectScheduler,
        reconnectConfiguration,
      );
    },
  });
}

export function resolveOkxWebSocketEndpoints(
  configuration: OkxConnectorConfiguration,
): OkxWebSocketEndpointConfiguration {
  const websocket =
    configuration.websocket;

  if (
    typeof websocket !== "object" ||
    websocket === null
  ) {
    throw new OkxConnectorCompositionError(
      "configuration.websocket is required.",
    );
  }

  const publicUrl =
    requireNonEmptyString(
      websocket.publicUrl,
      "configuration.websocket.publicUrl",
    );

  const privateUrl =
    requireNonEmptyString(
      websocket.privateUrl,
      "configuration.websocket.privateUrl",
    );

  const businessUrl =
    requireNonEmptyString(
      websocket.businessUrl,
      "configuration.websocket.businessUrl",
    );

  return Object.freeze({
    publicUrl,
    privateUrl,
    businessUrl,
  });
}

export function createSystemOkxClock():
  OkxClock {
  return Object.freeze({
    now(): number {
      return Date.now();
    },
  });
}

function createProductionRestTransport(
  fetchImplementation:
    | OkxFetchLike
    | undefined,
): OkxRestTransport {
  const executor =
    createFetchOkxRestTransportExecutor({
      ...(fetchImplementation !==
      undefined
        ? { fetchImplementation }
        : {}),
    });

  return new DefaultOkxRestTransport(
    executor,
    createDefaultOkxRestTransportErrorMapper(),
  );
}

function createHeartbeatManager(
  client: OkxWebSocketClient,
  clock: OkxClock,
  scheduler: OkxHeartbeatScheduler,
  configuration: OkxHeartbeatConfiguration,
): OkxHeartbeatManager {
  return new OkxHeartbeatManager({
    connection:
      getClientConnection(client),
    clock,
    scheduler,
    configuration,
  });
}

function createReconnectManager(
  client: OkxWebSocketClient,
  clock: OkxClock,
  scheduler: OkxReconnectScheduler,
  configuration: OkxReconnectConfiguration,
): OkxReconnectManager {
  return new OkxReconnectManager({
    clock,
    scheduler,
    configuration,

    reconnect(): void {
      if (
        client.getState() !== "closed" &&
        client.getState() !== "failed"
      ) {
        throw new OkxConnectorCompositionError(
          `Cannot reconnect OKX WebSocket client from state "${client.getState()}".`,
        );
      }

      client.connect();
    },
  });
}

function getClientConnection(
  client: OkxWebSocketClient,
): NonNullable<
  ReturnType<OkxWebSocketClient["getConnection"]>
> {
  const connection =
    client.getConnection();

  if (connection === undefined) {
    throw new OkxConnectorCompositionError(
      "WebSocket client must be connected before creating a heartbeat manager.",
    );
  }

  return connection;
}

function requireNonEmptyString(
  value: string,
  fieldName: string,
): string {
  if (typeof value !== "string") {
    throw new OkxConnectorCompositionError(
      `${fieldName} must be a string.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length === 0
  ) {
    throw new OkxConnectorCompositionError(
      `${fieldName} must not be empty.`,
    );
  }

  return normalized;
}