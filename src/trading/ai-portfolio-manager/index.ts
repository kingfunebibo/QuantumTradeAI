/**
 * QuantumTradeAI
 * Milestone 32 — AI Portfolio Manager & Dynamic Portfolio Optimization
 *
 * Public export surface for the complete AI Portfolio Manager subsystem.
 *
 * The domain contract named AIPortfolioManager remains available from
 * ai-portfolio-contracts. The concrete implementation class is exported as
 * AIPortfolioManagerEngine to avoid a TypeScript barrel-export collision.
 */

export * from "./ai-portfolio-contracts";
export * from "./ai-portfolio-validator";
export * from "./ai-portfolio-state-analyzer";
export * from "./portfolio-drift-detector";
export * from "./risk-budget-allocator";
export * from "./portfolio-correlation-engine";
export * from "./portfolio-optimization-engine";
export * from "./capital-allocation-engine";
export * from "./rebalance-planner";
export * from "./portfolio-explainability-engine";

export {
  AIPortfolioManager as AIPortfolioManagerEngine,
  DeterministicAIPortfolioManager,
  evaluateAIPortfolio,
} from "./ai-portfolio-manager";

export type {
  AIPortfolioManagerClock,
  AIPortfolioManagerDependencies,
  AIPortfolioManagerOptions,
} from "./ai-portfolio-manager";