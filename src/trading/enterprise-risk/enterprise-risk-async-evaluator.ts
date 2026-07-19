/**
 * QuantumTradeAI
 * Milestone 27 — Enterprise Risk Management & Real-Time Risk Engine
 *
 * File:
 * src/trading/enterprise-risk/enterprise-risk-async-evaluator.ts
 *
 * Purpose:
 * Deterministic asynchronous adapter for the synchronous enterprise-risk
 * evaluator. The adapter preserves decision identity, ordering, and error
 * semantics while exposing the EnterpriseRiskAsyncEvaluator contract.
 */

import {
  EnterpriseRiskAsyncEvaluator,
  EnterpriseRiskDecision,
  EnterpriseRiskEvaluationRequest,
  EnterpriseRiskEvaluator,
} from "./enterprise-risk-contracts";
import { EnterpriseRiskValidationError } from "./enterprise-risk-validator";

export interface EnterpriseRiskAsyncScheduler {
  schedule<T>(operation: () => T): Promise<T>;
}

export interface EnterpriseRiskAsyncEvaluatorOptions {
  readonly scheduler?: EnterpriseRiskAsyncScheduler;
  readonly serializeEvaluations?: boolean;
}

class MicrotaskEnterpriseRiskAsyncScheduler
  implements EnterpriseRiskAsyncScheduler
{
  public schedule<T>(operation: () => T): Promise<T> {
    return Promise.resolve().then(operation);
  }
}

function assertEvaluator(
  evaluator: EnterpriseRiskEvaluator,
): void {
  if (
    typeof evaluator !== "object" ||
    evaluator === null ||
    typeof evaluator.evaluate !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "evaluator",
      "must implement EnterpriseRiskEvaluator.",
    );
  }
}

function assertScheduler(
  scheduler: EnterpriseRiskAsyncScheduler,
): void {
  if (
    typeof scheduler !== "object" ||
    scheduler === null ||
    typeof scheduler.schedule !== "function"
  ) {
    throw new EnterpriseRiskValidationError(
      "options.scheduler",
      "must implement EnterpriseRiskAsyncScheduler.",
    );
  }
}

function assertOptions(
  options: EnterpriseRiskAsyncEvaluatorOptions,
): void {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new EnterpriseRiskValidationError(
      "options",
      "must be a non-null object.",
    );
  }

  if (
    options.serializeEvaluations !== undefined &&
    typeof options.serializeEvaluations !== "boolean"
  ) {
    throw new EnterpriseRiskValidationError(
      "options.serializeEvaluations",
      "must be a boolean.",
    );
  }

  if (options.scheduler !== undefined) {
    assertScheduler(options.scheduler);
  }
}

export class DefaultEnterpriseRiskAsyncEvaluator
  implements EnterpriseRiskAsyncEvaluator
{
  private readonly scheduler: EnterpriseRiskAsyncScheduler;

  private readonly serializeEvaluations: boolean;

  private evaluationTail: Promise<void> =
    Promise.resolve();

  public constructor(
    private readonly evaluator: EnterpriseRiskEvaluator,
    options: EnterpriseRiskAsyncEvaluatorOptions = {},
  ) {
    assertEvaluator(evaluator);
    assertOptions(options);

    this.scheduler =
      options.scheduler ??
      new MicrotaskEnterpriseRiskAsyncScheduler();

    this.serializeEvaluations =
      options.serializeEvaluations ?? true;
  }

  public evaluate(
    request: EnterpriseRiskEvaluationRequest,
  ): Promise<EnterpriseRiskDecision> {
    if (!this.serializeEvaluations) {
      return this.scheduler.schedule(() =>
        this.evaluator.evaluate(request),
      );
    }

    const evaluation = this.evaluationTail.then(
      () =>
        this.scheduler.schedule(() =>
          this.evaluator.evaluate(request),
        ),
      () =>
        this.scheduler.schedule(() =>
          this.evaluator.evaluate(request),
        ),
    );

    this.evaluationTail = evaluation.then(
      () => undefined,
      () => undefined,
    );

    return evaluation;
  }
}

export function createEnterpriseRiskAsyncEvaluator(
  evaluator: EnterpriseRiskEvaluator,
  options: EnterpriseRiskAsyncEvaluatorOptions = {},
): DefaultEnterpriseRiskAsyncEvaluator {
  return new DefaultEnterpriseRiskAsyncEvaluator(
    evaluator,
    options,
  );
}