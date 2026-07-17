import type {
  CoordinatorAccountId,
  CoordinatorExchangeId,
  CoordinatorMetadata,
  CoordinatorMetadataValue,
  CoordinatorOrderSide,
  CoordinatorOrderType,
  CoordinatorSymbol,
  CoordinatorTimeInForce,
  CoordinatorTimestamp,
  MultiExchangeCoordinatorExecutionId,
  MultiExchangeCoordinatorOrderRequest,
  MultiExchangeCoordinatorPlanId,
  MultiExchangeCoordinatorRequestId,
} from "./coordinator-contracts";
import {
  createCoordinatorExchangeExecutionCommand,
  type CoordinatorExchangeExecutionCommand,
} from "./coordinated-execution-contracts";

/**
 * Minimal structural contract required from an execution-plan instruction.
 *
 * Keeping this interface local allows the mapper to work with the existing
 * execution-plan implementation without coupling it to a specific plan class.
 */
export interface CoordinatorExecutionPlanInstructionSource {
  readonly instructionId: string;
  readonly exchangeId: CoordinatorExchangeId;
  readonly accountId: CoordinatorAccountId;
  readonly exchangeSymbol: string;
  readonly quantity: number;
  readonly price: number | null;
  readonly stopPrice: number | null;
  readonly timeInForce: CoordinatorTimeInForce | null;
  readonly reduceOnly: boolean;
  readonly postOnly: boolean;
  readonly clientOrderId: string | null;
  readonly metadata?: CoordinatorMetadata;
}

/**
 * Minimal execution-plan context needed to build a normalized exchange
 * execution command.
 */
export interface CoordinatorExecutionPlanCommandContext {
  readonly executionId: MultiExchangeCoordinatorExecutionId;
  readonly planId: MultiExchangeCoordinatorPlanId;
  readonly requestId: MultiExchangeCoordinatorRequestId;
  readonly symbol: CoordinatorSymbol;
  readonly side: CoordinatorOrderSide;
  readonly orderType: CoordinatorOrderType;
  readonly createdAt: CoordinatorTimestamp;
  readonly expiresAt: CoordinatorTimestamp | null;
  readonly metadata?: CoordinatorMetadata;
}

export interface CoordinatorExecutionCommandMappingInput {
  readonly context: CoordinatorExecutionPlanCommandContext;
  readonly instruction: CoordinatorExecutionPlanInstructionSource;
  readonly metadata?: CoordinatorMetadata;
}

function mergeMetadata(
  ...sources: readonly (
    | CoordinatorMetadata
    | undefined
  )[]
): CoordinatorMetadata {
  const merged: Record<
    string,
    CoordinatorMetadataValue
  > = {};

  for (const source of sources) {
    if (source === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }

  return Object.freeze(merged);
}

function assertNonEmpty(
  value: string,
  fieldName: string,
): void {
  if (value.trim().length === 0) {
    throw new Error(
      `${fieldName} must not be empty.`,
    );
  }
}

/**
 * Maps one execution-plan instruction into a normalized exchange command.
 */
export class CoordinatorExchangeExecutionCommandMapper {
  public map(
    input: CoordinatorExecutionCommandMappingInput,
  ): CoordinatorExchangeExecutionCommand {
    const {
      context,
      instruction,
    } = input;

    assertNonEmpty(
      context.executionId,
      "executionId",
    );

    assertNonEmpty(
      context.planId,
      "planId",
    );

    assertNonEmpty(
      context.requestId,
      "requestId",
    );

    assertNonEmpty(
      context.symbol,
      "symbol",
    );

    assertNonEmpty(
      instruction.instructionId,
      "instructionId",
    );

    assertNonEmpty(
      instruction.exchangeId,
      "exchangeId",
    );

    assertNonEmpty(
      instruction.accountId,
      "accountId",
    );

    assertNonEmpty(
      instruction.exchangeSymbol,
      "exchangeSymbol",
    );

    return createCoordinatorExchangeExecutionCommand({
      executionId: context.executionId,
      planId: context.planId,
      requestId: context.requestId,
      instructionId:
        instruction.instructionId,

      exchangeId:
        instruction.exchangeId,
      accountId:
        instruction.accountId,

      symbol: context.symbol,
      exchangeSymbol:
        instruction.exchangeSymbol,

      side: context.side,
      orderType: context.orderType,
      quantity: instruction.quantity,
      price: instruction.price,
      stopPrice: instruction.stopPrice,
      timeInForce:
        instruction.timeInForce,

      reduceOnly:
        instruction.reduceOnly,
      postOnly:
        instruction.postOnly,
      clientOrderId:
        instruction.clientOrderId,

      createdAt: context.createdAt,
      expiresAt: context.expiresAt,

      metadata: mergeMetadata(
        context.metadata,
        instruction.metadata,
        input.metadata,
      ),
    });
  }

  /**
   * Maps every instruction while preserving the original deterministic order.
   */
  public mapMany(
    context: CoordinatorExecutionPlanCommandContext,
    instructions:
      readonly CoordinatorExecutionPlanInstructionSource[],
    metadata?: CoordinatorMetadata,
  ): readonly CoordinatorExchangeExecutionCommand[] {
    return Object.freeze(
      instructions.map(
        (instruction) =>
          this.map({
            context,
            instruction,
            metadata,
          }),
      ),
    );
  }

  /**
   * Creates command context from the original coordinator request.
   */
  public createContextFromRequest(
    executionId: MultiExchangeCoordinatorExecutionId,
    planId: MultiExchangeCoordinatorPlanId,
    request: MultiExchangeCoordinatorOrderRequest,
    createdAt: CoordinatorTimestamp,
    metadata: CoordinatorMetadata = Object.freeze({}),
  ): CoordinatorExecutionPlanCommandContext {
    return Object.freeze({
      executionId,
      planId,
      requestId: request.requestId,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType,
      createdAt,
      expiresAt: request.expiresAt,
      metadata: mergeMetadata(
        request.metadata,
        metadata,
      ),
    });
  }
}

export function createCoordinatorExchangeExecutionCommandMapper():
  CoordinatorExchangeExecutionCommandMapper {
  return new CoordinatorExchangeExecutionCommandMapper();
}