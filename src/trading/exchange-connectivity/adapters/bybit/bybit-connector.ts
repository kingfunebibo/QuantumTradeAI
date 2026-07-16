/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Unified Bybit connector.
 *
 * This class composes:
 * - immutable connector configuration;
 * - static exchange metadata;
 * - the Bybit REST client;
 * - public, private, and trade WebSocket client factories;
 * - deterministic lifecycle state management;
 * - connector health and capability snapshots.
 */

import {
  BYBIT_CONNECTOR_METADATA,
  getBybitConnectorMetadata,
  type BybitConnectorMetadata,
} from "./bybit-connector-metadata";

import {
  createBybitConnectorConfiguration,
  requiresBybitCredentials,
  type BybitCategory,
  type BybitConnectorConfig,
} from "./bybit-connector-config";

import {
  BybitRestClient,
  type BybitHttpTransport,
} from "./bybit-rest-client";

import {
  BybitWebSocketClient,
  type BybitWebSocketConnectionOptions,
  type BybitWebSocketEventHandlers,
  type BybitWebSocketRequestIdGenerator,
  type BybitWebSocketTransport,
} from "./bybit-websocket-client";

import type {
  BybitClock,
} from "./bybit-authentication";

export type BybitConnectorLifecycleState =
  | "CREATED"
  | "INITIALIZED"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "FAILED";

export interface BybitConnectorDependencies {
  readonly restTransport?:
    BybitHttpTransport;
  readonly clock?: BybitClock;
}

export interface BybitWebSocketFactoryDependencies {
  readonly transport:
    BybitWebSocketTransport;
  readonly handlers?:
    BybitWebSocketEventHandlers;
  readonly requestIdGenerator?:
    BybitWebSocketRequestIdGenerator;
  readonly heartbeatIntervalMs?: number;
  readonly reconnectEnabled?: boolean;
  readonly maximumReconnectAttempts?: number;
  readonly autoAuthenticate?: boolean;
}

export interface BybitConnectorHealthSnapshot {
  readonly connectorId: string;
  readonly exchangeId: "bybit";
  readonly state:
    BybitConnectorLifecycleState;
  readonly healthy: boolean;
  readonly initialized: boolean;
  readonly running: boolean;
  readonly privateFeaturesConfigured: boolean;
  readonly restAvailable: boolean;
  readonly publicWebSocketAvailable: boolean;
  readonly privateWebSocketAvailable: boolean;
  readonly tradeWebSocketAvailable: boolean;
  readonly failureReason?: string;
}

export interface BybitConnectorSnapshot {
  readonly connectorId: string;
  readonly state:
    BybitConnectorLifecycleState;
  readonly configuration:
    BybitConnectorConfig;
  readonly metadata:
    BybitConnectorMetadata;
  readonly health:
    BybitConnectorHealthSnapshot;
}

export class BybitConnectorError
  extends Error {
  public readonly code: string;
  public readonly state:
    BybitConnectorLifecycleState;
  public readonly cause?: unknown;

  public constructor(
    input: Readonly<{
      readonly code: string;
      readonly message: string;
      readonly state:
        BybitConnectorLifecycleState;
      readonly cause?: unknown;
    }>,
  ) {
    super(input.message);

    this.name = "BybitConnectorError";
    this.code = input.code;
    this.state = input.state;
    this.cause = input.cause;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

export class BybitConnector {
  private readonly configuration:
    BybitConnectorConfig;

  private readonly metadata:
    BybitConnectorMetadata;

  private readonly restClient:
    BybitRestClient;

  private state:
    BybitConnectorLifecycleState =
      "CREATED";

  private failureReason:
    string | undefined;

  public constructor(
    config:
      Partial<BybitConnectorConfig> = {},
    dependencies:
      BybitConnectorDependencies = {},
  ) {
    this.configuration =
      createBybitConnectorConfiguration(
        config,
      );

    this.metadata =
      getBybitConnectorMetadata();

    this.restClient =
      new BybitRestClient(
        this.configuration,
        dependencies.restTransport,
        dependencies.clock,
      );
  }

  public initialize(): void {
    if (
      this.state !== "CREATED" &&
      this.state !== "STOPPED"
    ) {
      throw this.createStateError(
        "BYBIT_CONNECTOR_INITIALIZE_INVALID_STATE",
        "Bybit connector can only be initialized from CREATED or STOPPED state.",
      );
    }

    this.failureReason = undefined;
    this.state = "INITIALIZED";
  }

  public start(): void {
    if (
      this.state !== "INITIALIZED"
    ) {
      throw this.createStateError(
        "BYBIT_CONNECTOR_START_INVALID_STATE",
        "Bybit connector can only be started from INITIALIZED state.",
      );
    }

    this.state = "RUNNING";
  }

  public stop(): void {
    if (
      this.state === "STOPPED"
    ) {
      return;
    }

    if (
      this.state !== "RUNNING" &&
      this.state !== "INITIALIZED" &&
      this.state !== "FAILED"
    ) {
      throw this.createStateError(
        "BYBIT_CONNECTOR_STOP_INVALID_STATE",
        "Bybit connector can only be stopped from RUNNING, INITIALIZED, or FAILED state.",
      );
    }

    this.state = "STOPPING";
    this.state = "STOPPED";
  }

  public fail(
    reason: string,
    cause?: unknown,
  ): never {
    const normalizedReason =
      normalizeFailureReason(reason);

    this.failureReason =
      normalizedReason;

    this.state = "FAILED";

    throw new BybitConnectorError({
      code:
        "BYBIT_CONNECTOR_FAILED",
      message: normalizedReason,
      state: this.state,
      cause,
    });
  }

  public getConfiguration():
    BybitConnectorConfig {
    return this.configuration;
  }

  public getMetadata():
    BybitConnectorMetadata {
    return this.metadata;
  }

  public getRestClient():
    BybitRestClient {
    return this.restClient;
  }

  public createPublicWebSocketClient(
    category: BybitCategory,
    dependencies:
      BybitWebSocketFactoryDependencies,
  ): BybitWebSocketClient {
    this.assertUsable();

    return this.createWebSocketClient(
      {
        mode: "PUBLIC",
        category,
        autoAuthenticate: false,
      },
      dependencies,
    );
  }

  public createPrivateWebSocketClient(
    dependencies:
      BybitWebSocketFactoryDependencies,
  ): BybitWebSocketClient {
    this.assertUsable();

    if (
      !this.configuration
        .enablePrivateWebSocket
    ) {
      throw this.createStateError(
        "BYBIT_PRIVATE_WEBSOCKET_DISABLED",
        "Private Bybit WebSocket access is disabled by configuration.",
      );
    }

    if (
      !this.configuration.credentials
    ) {
      throw this.createStateError(
        "BYBIT_PRIVATE_WEBSOCKET_CREDENTIALS_REQUIRED",
        "Private Bybit WebSocket access requires configured credentials.",
      );
    }

    return this.createWebSocketClient(
      {
        mode: "PRIVATE",
        autoAuthenticate:
          dependencies
            .autoAuthenticate ??
          true,
      },
      dependencies,
    );
  }

  public createTradeWebSocketClient(
    dependencies:
      BybitWebSocketFactoryDependencies,
  ): BybitWebSocketClient {
    this.assertUsable();

    if (
      !this.configuration
        .enableWebSocketOrderEntry
    ) {
      throw this.createStateError(
        "BYBIT_TRADE_WEBSOCKET_DISABLED",
        "Bybit WebSocket order entry is disabled by configuration.",
      );
    }

    if (
      !this.configuration.credentials
    ) {
      throw this.createStateError(
        "BYBIT_TRADE_WEBSOCKET_CREDENTIALS_REQUIRED",
        "Bybit trade WebSocket access requires configured credentials.",
      );
    }

    return this.createWebSocketClient(
      {
        mode: "TRADE",
        autoAuthenticate:
          dependencies
            .autoAuthenticate ??
          false,
      },
      dependencies,
    );
  }

  public getHealthSnapshot():
    BybitConnectorHealthSnapshot {
    const initialized =
      this.state === "INITIALIZED" ||
      this.state === "RUNNING" ||
      this.state === "STOPPING" ||
      this.state === "STOPPED";

    const running =
      this.state === "RUNNING";

    const healthy =
      this.state !== "FAILED";

    return Object.freeze({
      connectorId:
        this.configuration
          .connectorId,
      exchangeId: "bybit",
      state: this.state,
      healthy,
      initialized,
      running,
      privateFeaturesConfigured:
        requiresBybitCredentials(
          this.configuration,
        ),
      restAvailable:
        Boolean(
          this.configuration
            .domains?.rest.baseUrl,
        ),
      publicWebSocketAvailable:
        Boolean(
          this.configuration
            .domains?.webSocket
            .public.spotUrl,
        ),
      privateWebSocketAvailable:
        Boolean(
          this.configuration
            .domains?.webSocket
            .privateUrl,
        ),
      tradeWebSocketAvailable:
        Boolean(
          this.configuration
            .domains?.webSocket
            .tradeUrl,
        ),
      failureReason:
        this.failureReason,
    });
  }

  public getSnapshot():
    BybitConnectorSnapshot {
    return Object.freeze({
      connectorId:
        this.configuration
          .connectorId,
      state: this.state,
      configuration:
        this.configuration,
      metadata:
        this.metadata,
      health:
        this.getHealthSnapshot(),
    });
  }

  public isRunning(): boolean {
    return this.state === "RUNNING";
  }

  public isHealthy(): boolean {
    return this.state !== "FAILED";
  }

  private createWebSocketClient(
    baseOptions:
      BybitWebSocketConnectionOptions,
    dependencies:
      BybitWebSocketFactoryDependencies,
  ): BybitWebSocketClient {
    return new BybitWebSocketClient(
      this.configuration,
      dependencies.transport,
      Object.freeze({
        ...baseOptions,
        heartbeatIntervalMs:
          dependencies
            .heartbeatIntervalMs,
        reconnectEnabled:
          dependencies
            .reconnectEnabled,
        maximumReconnectAttempts:
          dependencies
            .maximumReconnectAttempts,
      }),
      dependencies.handlers,
      undefined,
      dependencies
        .requestIdGenerator,
    );
  }

  private assertUsable(): void {
    if (
      this.state !== "INITIALIZED" &&
      this.state !== "RUNNING"
    ) {
      throw this.createStateError(
        "BYBIT_CONNECTOR_NOT_READY",
        "Bybit connector must be initialized before clients can be created.",
      );
    }
  }

  private createStateError(
    code: string,
    message: string,
  ): BybitConnectorError {
    return new BybitConnectorError({
      code,
      message,
      state: this.state,
    });
  }
}

export function createBybitConnector(
  config:
    Partial<BybitConnectorConfig> = {},
  dependencies:
    BybitConnectorDependencies = {},
): BybitConnector {
  return new BybitConnector(
    config,
    dependencies,
  );
}

export function getStaticBybitConnectorMetadata():
  BybitConnectorMetadata {
  return BYBIT_CONNECTOR_METADATA;
}

function normalizeFailureReason(
  reason: string,
): string {
  if (
    typeof reason !== "string" ||
    reason.trim().length === 0
  ) {
    return (
      "Bybit connector entered a failed state."
    );
  }

  return reason.trim();
}