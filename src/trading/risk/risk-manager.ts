import type {
  ApprovedTrade,
  RiskDecision,
  RiskManagerOptions,
  RiskRequest,
} from "./risk.types";

export class RiskManager {
  private readonly riskPerTrade: number;
  private readonly maximumAccountRisk: number;
  private readonly maximumLeverage: number;
  private readonly maximumPositionNotional: number;
  private readonly minimumPositionNotional: number;
  private readonly minimumQuantity: number;
  private readonly quantityStep: number;

  constructor(
    options: RiskManagerOptions = {},
  ) {
    this.riskPerTrade =
      options.riskPerTrade ?? 0.01;

    this.maximumAccountRisk =
      options.maximumAccountRisk ?? 0.05;

    this.maximumLeverage =
      options.maximumLeverage ?? 3;

    this.maximumPositionNotional =
      options.maximumPositionNotional ??
      Number.POSITIVE_INFINITY;

    this.minimumPositionNotional =
      options.minimumPositionNotional ?? 5;

    this.minimumQuantity =
      options.minimumQuantity ?? 0.000001;

    this.quantityStep =
      options.quantityStep ?? 0.000001;

    this.validateOptions();
  }

  evaluate(
    request: RiskRequest,
  ): RiskDecision {
    this.validateRequest(request);

    const {
      signal,
      account,
      stopLossPrice,
    } = request;

    const leverage =
      request.leverage ?? 1;

    if (leverage > this.maximumLeverage) {
      return {
        approved: false,
        reason:
          `Requested leverage ${leverage} exceeds the maximum permitted leverage ${this.maximumLeverage}.`,
      };
    }

    const riskPerUnit = Math.abs(
      signal.price - stopLossPrice,
    );

    if (riskPerUnit === 0) {
      return {
        approved: false,
        reason:
          "Stop-loss price must differ from the entry price.",
      };
    }

    if (
      signal.action === "BUY" &&
      stopLossPrice >= signal.price
    ) {
      return {
        approved: false,
        reason:
          "BUY stop-loss price must be below the entry price.",
      };
    }

    if (
      signal.action === "SELL" &&
      stopLossPrice <= signal.price
    ) {
      return {
        approved: false,
        reason:
          "SELL stop-loss price must be above the entry price.",
      };
    }

    const maximumRiskAmount =
      account.balance *
      this.riskPerTrade;

    const remainingRiskCapacity =
      account.balance *
        this.maximumAccountRisk -
      account.openRisk;

    const riskAmount = Math.min(
      maximumRiskAmount,
      remainingRiskCapacity,
    );

    if (riskAmount <= 0) {
      return {
        approved: false,
        reason:
          "The account has no remaining risk capacity.",
      };
    }

    const rawQuantity =
      riskAmount / riskPerUnit;

    const quantity =
      this.roundDownToStep(
        rawQuantity,
        this.quantityStep,
      );

    if (quantity < this.minimumQuantity) {
      return {
        approved: false,
        reason:
          `Calculated quantity ${quantity} is below the minimum quantity ${this.minimumQuantity}.`,
      };
    }

    const positionNotional =
      quantity * signal.price;

    if (
      positionNotional <
      this.minimumPositionNotional
    ) {
      return {
        approved: false,
        reason:
          `Calculated position notional ${positionNotional} is below the minimum ${this.minimumPositionNotional}.`,
      };
    }

    if (
      positionNotional >
      this.maximumPositionNotional
    ) {
      return {
        approved: false,
        reason:
          `Calculated position notional ${positionNotional} exceeds the maximum ${this.maximumPositionNotional}.`,
      };
    }

    const marginRequired =
      positionNotional / leverage;

    if (
      marginRequired >
      account.availableEquity
    ) {
      return {
        approved: false,
        reason:
          `Required margin ${marginRequired} exceeds available equity ${account.availableEquity}.`,
      };
    }

    const actualRiskAmount =
      quantity * riskPerUnit;

    const accountRiskAfterTrade =
      account.openRisk +
      actualRiskAmount;

    const approvedTrade: ApprovedTrade = {
      signalId: signal.id,
      strategyId: signal.strategyId,
      symbol: signal.symbol,
      timeframe: signal.timeframe,
      side: signal.action,
      entryPrice: signal.price,
      stopLossPrice,
      quantity,
      leverage,
      positionNotional,
      marginRequired,
      riskAmount: actualRiskAmount,
      riskPerUnit,
      accountRiskAfterTrade,
      approvedAt: Date.now(),
      metadata: {
        ...signal.metadata,
        signalConfidence:
          signal.confidence,
        signalGeneratedAt:
          signal.generatedAt,
      },
    };

    return {
      approved: true,
      reason:
        "Trade passed all configured risk controls.",
      trade: approvedTrade,
    };
  }

  private validateOptions(): void {
    this.validateRatio(
      this.riskPerTrade,
      "Risk per trade",
    );

    this.validateRatio(
      this.maximumAccountRisk,
      "Maximum account risk",
    );

    if (
      this.riskPerTrade >
      this.maximumAccountRisk
    ) {
      throw new Error(
        "Risk per trade cannot exceed maximum account risk.",
      );
    }

    if (
      !Number.isFinite(
        this.maximumLeverage,
      ) ||
      this.maximumLeverage < 1
    ) {
      throw new Error(
        "Maximum leverage must be a finite number greater than or equal to 1.",
      );
    }

    if (
      this.maximumPositionNotional <= 0 ||
      Number.isNaN(
        this.maximumPositionNotional,
      )
    ) {
      throw new Error(
        "Maximum position notional must be greater than zero.",
      );
    }

    if (
      !Number.isFinite(
        this.minimumPositionNotional,
      ) ||
      this.minimumPositionNotional < 0
    ) {
      throw new Error(
        "Minimum position notional must be a non-negative finite number.",
      );
    }

    if (
      this.minimumPositionNotional >
      this.maximumPositionNotional
    ) {
      throw new Error(
        "Minimum position notional cannot exceed maximum position notional.",
      );
    }

    if (
      !Number.isFinite(
        this.minimumQuantity,
      ) ||
      this.minimumQuantity <= 0
    ) {
      throw new Error(
        "Minimum quantity must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        this.quantityStep,
      ) ||
      this.quantityStep <= 0
    ) {
      throw new Error(
        "Quantity step must be a positive finite number.",
      );
    }
  }

  private validateRequest(
    request: RiskRequest,
  ): void {
    const {
      signal,
      account,
      stopLossPrice,
    } = request;

    if (!signal.id.trim()) {
      throw new Error(
        "Risk request signal ID cannot be empty.",
      );
    }

    if (!signal.symbol.trim()) {
      throw new Error(
        "Risk request symbol cannot be empty.",
      );
    }

    if (
      !Number.isFinite(signal.price) ||
      signal.price <= 0
    ) {
      throw new Error(
        "Risk request entry price must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(stopLossPrice) ||
      stopLossPrice <= 0
    ) {
      throw new Error(
        "Risk request stop-loss price must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(account.balance) ||
      account.balance <= 0
    ) {
      throw new Error(
        "Account balance must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        account.availableEquity,
      ) ||
      account.availableEquity < 0
    ) {
      throw new Error(
        "Available equity must be a non-negative finite number.",
      );
    }

    if (
      account.availableEquity >
      account.balance
    ) {
      throw new Error(
        "Available equity cannot exceed account balance.",
      );
    }

    if (
      !Number.isFinite(account.openRisk) ||
      account.openRisk < 0
    ) {
      throw new Error(
        "Open risk must be a non-negative finite number.",
      );
    }

    const leverage =
      request.leverage ?? 1;

    if (
      !Number.isFinite(leverage) ||
      leverage < 1
    ) {
      throw new Error(
        "Requested leverage must be a finite number greater than or equal to 1.",
      );
    }
  }

  private validateRatio(
    value: number,
    label: string,
  ): void {
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 1
    ) {
      throw new Error(
        `${label} must be greater than 0 and less than or equal to 1.`,
      );
    }
  }

  private roundDownToStep(
    value: number,
    step: number,
  ): number {
    const precision =
      this.getDecimalPlaces(step);

    const steppedValue =
      Math.floor(
        (value + Number.EPSILON) /
          step,
      ) * step;

    return Number(
      steppedValue.toFixed(precision),
    );
  }

  private getDecimalPlaces(
    value: number,
  ): number {
    const stringValue =
      value.toString();

    if (
      stringValue.includes("e-")
    ) {
      return Number(
        stringValue.split("e-")[1],
      );
    }

    return (
      stringValue.split(".")[1]
        ?.length ?? 0
    );
  }
}