/**
 * QuantumTradeAI
 * Milestone 17 — Bybit Exchange Adapter
 *
 * Bybit connector configuration contracts and deterministic validation.
 *
 * This module defines:
 * - supported Bybit environments;
 * - V5 REST and WebSocket domains;
 * - API credential contracts;
 * - supported product categories;
 * - account and position modes;
 * - immutable default configuration;
 * - deterministic configuration validation;
 * - private-operation credential requirements.
 */

import type {
  ExchangeEnvironment,
  ExchangeMarketType,
} from "../../connectors/exchange-connector";

/**
 * Bybit runtime environment.
 *
 * PRODUCTION:
 *   Real-money mainnet trading.
 *
 * TESTNET:
 *   Bybit testnet environment.
 *
 * DEMO:
 *   Mainnet demo-trading environment.
 *
 * CUSTOM:
 *   Explicit deployment-provided endpoints.
 */
export type BybitEnvironment =
  | "PRODUCTION"
  | "TESTNET"
  | "DEMO"
  | "CUSTOM";

/**
 * Bybit V5 product categories.
 */
export type BybitCategory =
  | "SPOT"
  | "LINEAR"
  | "INVERSE"
  | "OPTION";

/**
 * Supported Bybit account types.
 */
export type BybitAccountType =
  | "UNIFIED"
  | "CONTRACT"
  | "SPOT"
  | "FUND";

/**
 * Supported Bybit position modes.
 */
export type BybitPositionMode =
  | "ONE_WAY"
  | "HEDGE";

/**
 * Supported API-key signature algorithms.
 *
 * HMAC_SHA256 is used for system-generated API keys.
 * RSA_SHA256 is available for self-generated RSA keys.
 */
export type BybitSignatureAlgorithm =
  | "HMAC_SHA256"
  | "RSA_SHA256";

/**
 * Immutable Bybit API credentials.
 */
export interface BybitApiCredentials {
  readonly apiKey: string;

  /**
   * HMAC secret or RSA private key, depending on signatureAlgorithm.
   */
  readonly secretKey: string;

  readonly signatureAlgorithm: BybitSignatureAlgorithm;
}

/**
 * Immutable Bybit REST endpoint configuration.
 */
export interface BybitRestDomainConfig {
  /**
   * Base REST URL without a trailing slash.
   */
  readonly baseUrl: string;
}

/**
 * Public WebSocket endpoints are category-specific in Bybit V5.
 */
export interface BybitPublicWebSocketDomainConfig {
  readonly spotUrl: string;
  readonly linearUrl: string;
  readonly inverseUrl: string;
  readonly optionUrl: string;
}

/**
 * Immutable Bybit WebSocket endpoint configuration.
 */
export interface BybitWebSocketDomainConfig {
  readonly public: BybitPublicWebSocketDomainConfig;

  /**
   * Authenticated account-data stream.
   */
  readonly privateUrl: string;

  /**
   * Authenticated WebSocket order-entry endpoint.
   *
   * Demo trading may not support WebSocket order entry. It is therefore
   * optional at the configuration-contract level.
   */
  readonly tradeUrl?: string;
}

/**
 * Complete endpoint set for one Bybit environment.
 */
export interface BybitDomainConfig {
  readonly environment: BybitEnvironment;
  readonly rest: BybitRestDomainConfig;
  readonly webSocket: BybitWebSocketDomainConfig;
}

/**
 * Immutable Bybit adapter configuration.
 */
export interface BybitConnectorConfig {
  readonly connectorId: string;

  /**
   * Shared SDK environment classification.
   */
  readonly environment: ExchangeEnvironment;

  /**
   * Bybit-specific endpoint environment.
   */
  readonly bybitEnvironment: BybitEnvironment;

  /**
   * CUSTOM environments require explicit domains.
   *
   * Known environments may also supply explicit domains for controlled
   * deployments, proxies, or regional routing.
   */
  readonly domains?: BybitDomainConfig;

  /**
   * Credentials are optional for public-market-data-only operation.
   */
  readonly credentials?: BybitApiCredentials;

  readonly enabledMarketTypes: readonly ExchangeMarketType[];
  readonly enabledCategories: readonly BybitCategory[];

  readonly accountType: BybitAccountType;
  readonly positionMode: BybitPositionMode;

  readonly enablePrivateRest: boolean;
  readonly enablePrivateWebSocket: boolean;
  readonly enableOrderManagement: boolean;
  readonly enableWebSocketOrderEntry: boolean;

  /**
   * Bybit private REST requests include a receive-window header.
   */
  readonly receiveWindowMs: number;

  readonly requestTimeoutMs: number;
  readonly connectionTimeoutMs: number;
  readonly shutdownTimeoutMs: number;

  readonly maximumClockDriftMs: number;
  readonly serverTimeSynchronizationEnabled: boolean;
}

/**
 * Structured configuration-validation issue.
 */
export interface BybitConnectorConfigIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

/**
 * Immutable configuration-validation result.
 */
export interface BybitConnectorConfigValidationResult {
  readonly valid: boolean;
  readonly issues: readonly BybitConnectorConfigIssue[];
}

/**
 * Structured Bybit configuration error.
 */
export class BybitConnectorConfigError extends Error {
  public readonly code: string;
  public readonly path: string;

  public constructor(issue: BybitConnectorConfigIssue) {
    super(issue.message);

    this.name = "BybitConnectorConfigError";
    this.code = issue.code;
    this.path = issue.path;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Known Bybit V5 endpoint profiles.
 *
 * CUSTOM intentionally has no default and must be supplied explicitly.
 */
export const BYBIT_DEFAULT_DOMAINS: Readonly<
  Record<
    Exclude<BybitEnvironment, "CUSTOM">,
    BybitDomainConfig
  >
> = Object.freeze({
  PRODUCTION: freezeBybitDomains({
    environment: "PRODUCTION",
    rest: {
      baseUrl: "https://api.bybit.com",
    },
    webSocket: {
      public: {
        spotUrl:
          "wss://stream.bybit.com/v5/public/spot",
        linearUrl:
          "wss://stream.bybit.com/v5/public/linear",
        inverseUrl:
          "wss://stream.bybit.com/v5/public/inverse",
        optionUrl:
          "wss://stream.bybit.com/v5/public/option",
      },
      privateUrl:
        "wss://stream.bybit.com/v5/private",
      tradeUrl:
        "wss://stream.bybit.com/v5/trade",
    },
  }),

  TESTNET: freezeBybitDomains({
    environment: "TESTNET",
    rest: {
      baseUrl: "https://api-testnet.bybit.com",
    },
    webSocket: {
      public: {
        spotUrl:
          "wss://stream-testnet.bybit.com/v5/public/spot",
        linearUrl:
          "wss://stream-testnet.bybit.com/v5/public/linear",
        inverseUrl:
          "wss://stream-testnet.bybit.com/v5/public/inverse",
        optionUrl:
          "wss://stream-testnet.bybit.com/v5/public/option",
      },
      privateUrl:
        "wss://stream-testnet.bybit.com/v5/private",
      tradeUrl:
        "wss://stream-testnet.bybit.com/v5/trade",
    },
  }),

  DEMO: freezeBybitDomains({
    environment: "DEMO",
    rest: {
      baseUrl: "https://api-demo.bybit.com",
    },
    webSocket: {
      /*
       * Bybit demo trading uses mainnet public market data.
       */
      public: {
        spotUrl:
          "wss://stream.bybit.com/v5/public/spot",
        linearUrl:
          "wss://stream.bybit.com/v5/public/linear",
        inverseUrl:
          "wss://stream.bybit.com/v5/public/inverse",
        optionUrl:
          "wss://stream.bybit.com/v5/public/option",
      },
      privateUrl:
        "wss://stream-demo.bybit.com/v5/private",

      /*
       * WebSocket order entry is intentionally omitted because Bybit's
       * mainnet demo service does not support WebSocket Trade.
       */
      tradeUrl: undefined,
    },
  }),
});

/**
 * Creates the production-oriented default Bybit configuration.
 *
 * The default configuration supports public spot market data only.
 * Private operations remain disabled until credentials are explicitly
 * supplied and the corresponding feature flags are enabled.
 */
export function createDefaultBybitConnectorConfig(
  connectorId = "bybit",
  bybitEnvironment: BybitEnvironment = "PRODUCTION",
): BybitConnectorConfig {
  return freezeBybitConnectorConfig({
    connectorId,
    environment:
      mapBybitEnvironmentToExchangeEnvironment(
        bybitEnvironment,
      ),
    bybitEnvironment,
    domains:
      bybitEnvironment === "CUSTOM"
        ? undefined
        : resolveBybitDomains(bybitEnvironment),
    credentials: undefined,
    enabledMarketTypes: ["SPOT"],
    enabledCategories: ["SPOT"],
    accountType: "UNIFIED",
    positionMode: "ONE_WAY",
    enablePrivateRest: false,
    enablePrivateWebSocket: false,
    enableOrderManagement: false,
    enableWebSocketOrderEntry: false,
    receiveWindowMs: 5_000,
    requestTimeoutMs: 15_000,
    connectionTimeoutMs: 10_000,
    shutdownTimeoutMs: 10_000,
    maximumClockDriftMs: 1_000,
    serverTimeSynchronizationEnabled: true,
  });
}

/**
 * Creates a complete immutable Bybit connector configuration by merging
 * partial overrides with deterministic defaults.
 */
export function createBybitConnectorConfiguration(
  overrides: Partial<BybitConnectorConfig> = {},
): BybitConnectorConfig {
  const bybitEnvironment =
    overrides.bybitEnvironment ??
    "PRODUCTION";

  const defaults =
    createDefaultBybitConnectorConfig(
      overrides.connectorId ?? "bybit",
      bybitEnvironment,
    );

  const configuration =
    freezeBybitConnectorConfig({
      ...defaults,
      ...overrides,
      connectorId:
        overrides.connectorId ??
        defaults.connectorId,
      environment:
        overrides.environment ??
        mapBybitEnvironmentToExchangeEnvironment(
          bybitEnvironment,
        ),
      bybitEnvironment,
      domains:
        overrides.domains ??
        (
          bybitEnvironment === "CUSTOM"
            ? undefined
            : resolveBybitDomains(
                bybitEnvironment,
              )
        ),
      credentials:
        overrides.credentials
          ? freezeBybitCredentials(
              overrides.credentials,
            )
          : undefined,
      enabledMarketTypes:
        overrides.enabledMarketTypes ??
        defaults.enabledMarketTypes,
      enabledCategories:
        overrides.enabledCategories ??
        defaults.enabledCategories,
    });

  assertValidBybitConnectorConfig(configuration);

  return configuration;
}

/**
 * Resolves the effective domain set.
 */
export function resolveBybitDomains(
  environment: BybitEnvironment,
  explicitDomains?: BybitDomainConfig,
): BybitDomainConfig {
  if (explicitDomains) {
    validateBybitDomainConfig(explicitDomains);

    if (
      environment !== "CUSTOM" &&
      explicitDomains.environment !== environment
    ) {
      throw new BybitConnectorConfigError({
        code:
          "BYBIT_DOMAIN_ENVIRONMENT_MISMATCH",
        path: "domains.environment",
        message:
          "Explicit Bybit domain environment must match the connector environment.",
      });
    }

    return freezeBybitDomains(explicitDomains);
  }

  if (environment === "CUSTOM") {
    throw new BybitConnectorConfigError({
      code: "BYBIT_CUSTOM_DOMAINS_REQUIRED",
      path: "domains",
      message:
        "CUSTOM Bybit environment requires explicit domain configuration.",
    });
  }

  return BYBIT_DEFAULT_DOMAINS[environment];
}

/**
 * Resolves the category-specific public WebSocket URL.
 */
export function resolveBybitPublicWebSocketUrl(
  domains: BybitDomainConfig,
  category: BybitCategory,
): string {
  switch (category) {
    case "SPOT":
      return domains.webSocket.public.spotUrl;

    case "LINEAR":
      return domains.webSocket.public.linearUrl;

    case "INVERSE":
      return domains.webSocket.public.inverseUrl;

    case "OPTION":
      return domains.webSocket.public.optionUrl;

    default:
      return assertNeverBybitCategory(category);
  }
}

/**
 * Returns whether any configured feature requires authentication.
 */
export function requiresBybitCredentials(
  config: BybitConnectorConfig,
): boolean {
  return (
    config.enablePrivateRest ||
    config.enablePrivateWebSocket ||
    config.enableOrderManagement ||
    config.enableWebSocketOrderEntry
  );
}

/**
 * Validates a complete Bybit connector configuration.
 */
export function validateBybitConnectorConfig(
  config: BybitConnectorConfig,
): BybitConnectorConfigValidationResult {
  const issues: BybitConnectorConfigIssue[] = [];

  if (
    typeof config !== "object" ||
    config === null
  ) {
    return Object.freeze({
      valid: false,
      issues: Object.freeze([
        Object.freeze({
          code: "BYBIT_CONFIG_REQUIRED",
          path: "config",
          message:
            "Bybit connector configuration is required.",
        }),
      ]),
    });
  }

  addRequiredStringIssue(
    issues,
    config.connectorId,
    "connectorId",
    "BYBIT_CONNECTOR_ID_REQUIRED",
  );

  if (
    !isBybitEnvironment(
      config.bybitEnvironment,
    )
  ) {
    issues.push({
      code:
        "BYBIT_ENVIRONMENT_UNSUPPORTED",
      path: "bybitEnvironment",
      message:
        "Bybit environment is unsupported.",
    });
  }

  if (
    config.bybitEnvironment === "CUSTOM" &&
    !config.domains
  ) {
    issues.push({
      code:
        "BYBIT_CUSTOM_DOMAINS_REQUIRED",
      path: "domains",
      message:
        "CUSTOM Bybit environment requires explicit domain configuration.",
    });
  }

  if (config.domains) {
    try {
      validateBybitDomainConfig(
        config.domains,
      );

      if (
        config.bybitEnvironment !== "CUSTOM" &&
        config.domains.environment !==
          config.bybitEnvironment
      ) {
        issues.push({
          code:
            "BYBIT_DOMAIN_ENVIRONMENT_MISMATCH",
          path: "domains.environment",
          message:
            "Bybit domain environment must match the connector environment.",
        });
      }
    } catch (error: unknown) {
      if (
        error instanceof
        BybitConnectorConfigError
      ) {
        issues.push({
          code: error.code,
          path: error.path,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }

  if (
    !Array.isArray(
      config.enabledMarketTypes,
    ) ||
    config.enabledMarketTypes.length === 0
  ) {
    issues.push({
      code:
        "BYBIT_MARKET_TYPES_REQUIRED",
      path: "enabledMarketTypes",
      message:
        "At least one exchange market type must be enabled.",
    });
  } else {
    addDuplicateIssue(
      issues,
      config.enabledMarketTypes,
      "enabledMarketTypes",
      "BYBIT_DUPLICATE_MARKET_TYPES",
    );
  }

  if (
    !Array.isArray(
      config.enabledCategories,
    ) ||
    config.enabledCategories.length === 0
  ) {
    issues.push({
      code:
        "BYBIT_CATEGORIES_REQUIRED",
      path: "enabledCategories",
      message:
        "At least one Bybit product category must be enabled.",
    });
  } else {
    addDuplicateIssue(
      issues,
      config.enabledCategories,
      "enabledCategories",
      "BYBIT_DUPLICATE_CATEGORIES",
    );

    for (
      const category of
      config.enabledCategories
    ) {
      if (!isBybitCategory(category)) {
        issues.push({
          code:
            "BYBIT_CATEGORY_UNSUPPORTED",
          path: "enabledCategories",
          message:
            `Unsupported Bybit category: ${String(category)}.`,
        });
      }
    }
  }

  validatePositiveNumber(
    issues,
    config.receiveWindowMs,
    "receiveWindowMs",
    "BYBIT_INVALID_RECEIVE_WINDOW",
  );

  if (
    Number.isFinite(
      config.receiveWindowMs,
    ) &&
    (
      config.receiveWindowMs < 1 ||
      config.receiveWindowMs > 60_000
    )
  ) {
    issues.push({
      code:
        "BYBIT_RECEIVE_WINDOW_OUT_OF_RANGE",
      path: "receiveWindowMs",
      message:
        "receiveWindowMs must be between 1 and 60000 milliseconds.",
    });
  }

  validatePositiveNumber(
    issues,
    config.requestTimeoutMs,
    "requestTimeoutMs",
    "BYBIT_INVALID_REQUEST_TIMEOUT",
  );

  validatePositiveNumber(
    issues,
    config.connectionTimeoutMs,
    "connectionTimeoutMs",
    "BYBIT_INVALID_CONNECTION_TIMEOUT",
  );

  validatePositiveNumber(
    issues,
    config.shutdownTimeoutMs,
    "shutdownTimeoutMs",
    "BYBIT_INVALID_SHUTDOWN_TIMEOUT",
  );

  validateNonNegativeNumber(
    issues,
    config.maximumClockDriftMs,
    "maximumClockDriftMs",
    "BYBIT_INVALID_MAXIMUM_CLOCK_DRIFT",
  );

  if (
    requiresBybitCredentials(config)
  ) {
    if (!config.credentials) {
      issues.push({
        code:
          "BYBIT_CREDENTIALS_REQUIRED",
        path: "credentials",
        message:
          "Bybit credentials are required when private operations are enabled.",
      });
    } else {
      validateBybitCredentials(
        config.credentials,
        issues,
      );
    }
  } else if (config.credentials) {
    validateBybitCredentials(
      config.credentials,
      issues,
    );
  }

  if (
    config.enableOrderManagement &&
    !config.enablePrivateRest
  ) {
    issues.push({
      code:
        "BYBIT_ORDER_MANAGEMENT_REQUIRES_PRIVATE_REST",
      path: "enableOrderManagement",
      message:
        "Bybit order management requires private REST access.",
    });
  }

  if (
    config.enableWebSocketOrderEntry &&
    !config.enablePrivateWebSocket
  ) {
    issues.push({
      code:
        "BYBIT_WS_ORDER_ENTRY_REQUIRES_PRIVATE_WS",
      path:
        "enableWebSocketOrderEntry",
      message:
        "Bybit WebSocket order entry requires private WebSocket access.",
    });
  }

  if (
    config.enableWebSocketOrderEntry &&
    !config.enableOrderManagement
  ) {
    issues.push({
      code:
        "BYBIT_WS_ORDER_ENTRY_REQUIRES_ORDER_MANAGEMENT",
      path:
        "enableWebSocketOrderEntry",
      message:
        "Bybit WebSocket order entry requires order management to be enabled.",
    });
  }

  if (
    config.enableWebSocketOrderEntry &&
    !config.domains?.webSocket.tradeUrl
  ) {
    issues.push({
      code:
        "BYBIT_WS_TRADE_ENDPOINT_REQUIRED",
      path:
        "domains.webSocket.tradeUrl",
      message:
        "WebSocket order entry requires a configured Bybit trade endpoint.",
    });
  }

  if (
    config.bybitEnvironment === "DEMO" &&
    config.enableWebSocketOrderEntry
  ) {
    issues.push({
      code:
        "BYBIT_DEMO_WS_ORDER_ENTRY_UNSUPPORTED",
      path:
        "enableWebSocketOrderEntry",
      message:
        "Bybit demo trading does not support WebSocket order entry.",
    });
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(
      issues.map((issue) =>
        Object.freeze({ ...issue }),
      ),
    ),
  });
}

/**
 * Throws the first structured issue when configuration is invalid.
 */
export function assertValidBybitConnectorConfig(
  config: BybitConnectorConfig,
): void {
  const result =
    validateBybitConnectorConfig(config);

  if (!result.valid) {
    const firstIssue = result.issues[0];

    if (!firstIssue) {
      throw new BybitConnectorConfigError({
        code:
          "BYBIT_UNKNOWN_CONFIG_ERROR",
        path: "config",
        message:
          "Bybit connector configuration is invalid.",
      });
    }

    throw new BybitConnectorConfigError(
      firstIssue,
    );
  }
}

/**
 * Validates a domain configuration and throws a structured error when invalid.
 */
export function validateBybitDomainConfig(
  domains: BybitDomainConfig,
): void {
  if (
    typeof domains !== "object" ||
    domains === null
  ) {
    throw new BybitConnectorConfigError({
      code:
        "BYBIT_DOMAIN_CONFIG_REQUIRED",
      path: "domains",
      message:
        "Bybit domain configuration is required.",
    });
  }

  if (
    !isBybitEnvironment(
      domains.environment,
    )
  ) {
    throw new BybitConnectorConfigError({
      code:
        "BYBIT_DOMAIN_ENVIRONMENT_UNSUPPORTED",
      path: "domains.environment",
      message:
        "Bybit domain environment is unsupported.",
    });
  }

  validateAbsoluteUrl(
    domains.rest.baseUrl,
    "domains.rest.baseUrl",
    ["https:"],
    false,
  );

  validateAbsoluteUrl(
    domains.webSocket.public.spotUrl,
    "domains.webSocket.public.spotUrl",
    ["wss:"],
    true,
  );

  validateAbsoluteUrl(
    domains.webSocket.public.linearUrl,
    "domains.webSocket.public.linearUrl",
    ["wss:"],
    true,
  );

  validateAbsoluteUrl(
    domains.webSocket.public.inverseUrl,
    "domains.webSocket.public.inverseUrl",
    ["wss:"],
    true,
  );

  validateAbsoluteUrl(
    domains.webSocket.public.optionUrl,
    "domains.webSocket.public.optionUrl",
    ["wss:"],
    true,
  );

  validateAbsoluteUrl(
    domains.webSocket.privateUrl,
    "domains.webSocket.privateUrl",
    ["wss:"],
    true,
  );

  if (domains.webSocket.tradeUrl) {
    validateAbsoluteUrl(
      domains.webSocket.tradeUrl,
      "domains.webSocket.tradeUrl",
      ["wss:"],
      true,
    );
  }
}

/**
 * Maps the adapter environment to the shared connector environment.
 */
export function mapBybitEnvironmentToExchangeEnvironment(
  environment: BybitEnvironment,
): ExchangeEnvironment {
  switch (environment) {
    case "PRODUCTION":
      return "PRODUCTION";

    case "TESTNET":
    case "DEMO":
      return "TEST";

    case "CUSTOM":
      return "TEST";

    default:
      return assertNeverBybitEnvironment(
        environment,
      );
  }
}

function validateBybitCredentials(
  credentials: BybitApiCredentials,
  issues: BybitConnectorConfigIssue[],
): void {
  addRequiredStringIssue(
    issues,
    credentials.apiKey,
    "credentials.apiKey",
    "BYBIT_API_KEY_REQUIRED",
  );

  addRequiredStringIssue(
    issues,
    credentials.secretKey,
    "credentials.secretKey",
    "BYBIT_SECRET_KEY_REQUIRED",
  );

  if (
    credentials.signatureAlgorithm !==
      "HMAC_SHA256" &&
    credentials.signatureAlgorithm !==
      "RSA_SHA256"
  ) {
    issues.push({
      code:
        "BYBIT_SIGNATURE_ALGORITHM_UNSUPPORTED",
      path:
        "credentials.signatureAlgorithm",
      message:
        "Bybit signature algorithm must be HMAC_SHA256 or RSA_SHA256.",
    });
  }
}

function freezeBybitConnectorConfig(
  config: BybitConnectorConfig,
): BybitConnectorConfig {
  return Object.freeze({
    ...config,
    domains: config.domains
      ? freezeBybitDomains(config.domains)
      : undefined,
    credentials: config.credentials
      ? freezeBybitCredentials(
          config.credentials,
        )
      : undefined,
    enabledMarketTypes: Object.freeze([
      ...config.enabledMarketTypes,
    ]),
    enabledCategories: Object.freeze([
      ...config.enabledCategories,
    ]),
  });
}

function freezeBybitCredentials(
  credentials: BybitApiCredentials,
): BybitApiCredentials {
  return Object.freeze({
    apiKey: credentials.apiKey,
    secretKey: credentials.secretKey,
    signatureAlgorithm:
      credentials.signatureAlgorithm,
  });
}

function freezeBybitDomains(
  domains: BybitDomainConfig,
): BybitDomainConfig {
  return Object.freeze({
    environment: domains.environment,
    rest: Object.freeze({
      baseUrl:
        removeTrailingSlashes(
          domains.rest.baseUrl,
        ),
    }),
    webSocket: Object.freeze({
      public: Object.freeze({
        spotUrl:
          removeTrailingSlashes(
            domains.webSocket.public.spotUrl,
          ),
        linearUrl:
          removeTrailingSlashes(
            domains.webSocket.public.linearUrl,
          ),
        inverseUrl:
          removeTrailingSlashes(
            domains.webSocket.public.inverseUrl,
          ),
        optionUrl:
          removeTrailingSlashes(
            domains.webSocket.public.optionUrl,
          ),
      }),
      privateUrl:
        removeTrailingSlashes(
          domains.webSocket.privateUrl,
        ),
      tradeUrl:
        domains.webSocket.tradeUrl
          ? removeTrailingSlashes(
              domains.webSocket.tradeUrl,
            )
          : undefined,
    }),
  });
}

function addRequiredStringIssue(
  issues: BybitConnectorConfigIssue[],
  value: string,
  path: string,
  code: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    issues.push({
      code,
      path,
      message:
        `${path} must be a non-empty string.`,
    });
  }
}

function addDuplicateIssue<T>(
  issues: BybitConnectorConfigIssue[],
  values: readonly T[],
  path: string,
  code: string,
): void {
  const uniqueValues = new Set(values);

  if (
    uniqueValues.size !== values.length
  ) {
    issues.push({
      code,
      path,
      message:
        `${path} must not contain duplicate values.`,
    });
  }
}

function validatePositiveNumber(
  issues: BybitConnectorConfigIssue[],
  value: number,
  path: string,
  code: string,
): void {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    issues.push({
      code,
      path,
      message:
        `${path} must be a finite number greater than zero.`,
    });
  }
}

function validateNonNegativeNumber(
  issues: BybitConnectorConfigIssue[],
  value: number,
  path: string,
  code: string,
): void {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    issues.push({
      code,
      path,
      message:
        `${path} must be finite and non-negative.`,
    });
  }
}

function validateAbsoluteUrl(
  value: string,
  path: string,
  allowedProtocols: readonly string[],
  allowPath: boolean,
): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new BybitConnectorConfigError({
      code: "BYBIT_INVALID_DOMAIN_URL",
      path,
      message:
        `${path} must be a valid absolute URL.`,
    });
  }

  if (
    !allowedProtocols.includes(
      parsed.protocol,
    )
  ) {
    throw new BybitConnectorConfigError({
      code:
        "BYBIT_INVALID_DOMAIN_PROTOCOL",
      path,
      message:
        `${path} must use one of: ${allowedProtocols.join(", ")}.`,
    });
  }

  if (
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new BybitConnectorConfigError({
      code:
        "BYBIT_DOMAIN_QUERY_OR_FRAGMENT_INVALID",
      path,
      message:
        `${path} must not contain a query string or fragment.`,
    });
  }

  if (
    !allowPath &&
    parsed.pathname !== "/"
  ) {
    throw new BybitConnectorConfigError({
      code:
        "BYBIT_REST_DOMAIN_BASE_PATH_INVALID",
      path,
      message:
        `${path} must not contain a path.`,
    });
  }
}

function removeTrailingSlashes(
  value: string,
): string {
  return value.replace(/\/+$/, "");
}

function isBybitEnvironment(
  value: unknown,
): value is BybitEnvironment {
  return (
    value === "PRODUCTION" ||
    value === "TESTNET" ||
    value === "DEMO" ||
    value === "CUSTOM"
  );
}

function isBybitCategory(
  value: unknown,
): value is BybitCategory {
  return (
    value === "SPOT" ||
    value === "LINEAR" ||
    value === "INVERSE" ||
    value === "OPTION"
  );
}

function assertNeverBybitEnvironment(
  value: never,
): never {
  throw new BybitConnectorConfigError({
    code:
      "BYBIT_ENVIRONMENT_UNSUPPORTED",
    path: "bybitEnvironment",
    message:
      `Unsupported Bybit environment: ${String(value)}.`,
  });
}

function assertNeverBybitCategory(
  value: never,
): never {
  throw new BybitConnectorConfigError({
    code: "BYBIT_CATEGORY_UNSUPPORTED",
    path: "category",
    message:
      `Unsupported Bybit category: ${String(value)}.`,
  });
}
