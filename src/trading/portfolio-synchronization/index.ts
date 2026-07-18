/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Public export surface for the portfolio synchronization subsystem.
 *
 * Modules containing contract names that overlap with the foundational
 * synchronization contracts are exported through namespaces to prevent
 * TypeScript export collisions.
 */

export * from "./live-portfolio";
export * from "./portfolio-synchronization-contracts";

export * from "./exchange-balance-snapshot";
export * from "./position-snapshot";

export * from "./portfolio-aggregation-engine";
export * from "./cross-exchange-holdings-aggregator";

export * from "./realized-pnl-engine";
export * from "./margin-collateral-engine";
export * from "./exposure-calculator";

export * as portfolioReconciliation from "./portfolio-reconciliation";

export * as portfolioSynchronizationOrchestrator from
  "./portfolio-synchronization-orchestrator";

export * from "./portfolio-state-publisher";
export * from "./portfolio-synchronization-service";