/**
 * QuantumTradeAI
 * Milestone 14 — Exchange Connector SDK Foundation
 *
 * Public module exports.
 *
 * Application services and exchange-specific adapters should import live
 * connectivity contracts through this module rather than depending directly
 * on internal folder paths.
 */

// Connector contracts, configuration, and reusable base implementation
export * from "./connectors/exchange-connector";
export * from "./connectors/exchange-connector-config";
export * from "./connectors/base-exchange-connector";

// REST and WebSocket transport abstractions
export * from "./rest/exchange-rest-client";
export * from "./websocket/exchange-websocket-client";
export * from "./rest/base-exchange-rest-client";
export * from "./websocket/base-exchange-websocket-client";

// Authentication and request signing
export * from "./authentication/exchange-request-signer";

// Resilience infrastructure
export * from "./rate-limiting/exchange-rate-limiter";
export * from "./retry/exchange-retry-policy";

// Health monitoring
export * from "./health/exchange-connector-health-monitor";

// Connector discovery and lifecycle coordination
export * from "./registry/exchange-connector-registry";
export * from "./lifecycle/exchange-connector-lifecycle-manager";

export * from "./errors/exchange-error-normalizer";
export * from "./testing/deterministic-mock-rest-transport";
export * from "./testing/deterministic-mock-websocket-transport";
export * from "./testing/deterministic-mock-websocket-support";