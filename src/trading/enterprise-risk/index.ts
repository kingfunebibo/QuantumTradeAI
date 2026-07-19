/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/index.ts
 *
 * Purpose:
 * Public export surface for the complete enterprise-risk subsystem.
 *
 * Note:
 * The in-memory event publisher and event dispatcher both define an
 * EnterpriseRiskEventType helper alias. The publisher alias remains the
 * canonical public export, while the dispatcher alias is re-exported under
 * EnterpriseRiskDispatcherEventType to avoid a TypeScript export collision.
 */

export * from "./enterprise-risk-contracts";
export * from "./enterprise-risk-validator";
export * from "./enterprise-risk-limit-evaluator";
export * from "./enterprise-risk-circuit-breaker-manager";
export * from "./in-memory-enterprise-risk-circuit-breaker-repository";
export * from "./in-memory-enterprise-risk-event-publisher";
export * from "./enterprise-risk-stress-tester";
export * from "./enterprise-risk-evaluator";
export * from "./enterprise-risk-async-evaluator";
export * from "./in-memory-enterprise-risk-snapshot-provider";
export * from "./in-memory-enterprise-risk-policy-repository";
export * from "./enterprise-risk-monitor";
export * from "./enterprise-risk-real-time-monitor";

export {
  DefaultEnterpriseRiskEventDispatcher,
  createEnterpriseRiskEventDispatcher,
} from "./enterprise-risk-event-dispatcher";

export type {
  EnterpriseRiskEventSubscriber,
  EnterpriseRiskEventDispatchError,
  EnterpriseRiskEventDispatcherOptions,
  EnterpriseRiskEventDispatcher,
  EnterpriseRiskEventType as EnterpriseRiskDispatcherEventType,
} from "./enterprise-risk-event-dispatcher";

export * from "./enterprise-risk-portfolio-aggregator";
export * from "./enterprise-risk-audit-log";
export * from "./enterprise-risk-audit-subscriber";