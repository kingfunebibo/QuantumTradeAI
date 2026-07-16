/**
 * QuantumTradeAI
 * Multi-Exchange Management & Routing
 *
 * File:
 * src/trading/exchange-connectivity/management/index.ts
 *
 * Purpose:
 * Exposes the complete multi-exchange management and routing subsystem through
 * a single stable module boundary.
 */

export * from "./exchange-registry";
export * from "./connector-lifecycle.types";
export * from "./connector-lifecycle-manager";
export * from "./exchange-capability-registry";
export * from "./exchange-discovery";
export * from "./unified-exchange-interface";
export * from "./exchange-router.types";
export * from "./exchange-router";
export * from "./connector-selection-policy";
export * from "./automatic-failover";