import {
  type AlgorithmicExecutionInstruction,
  type AlgorithmicExecutionInstructionValidator,
  type AlgorithmicExecutionValidationIssue,
  type AlgorithmicExecutionValidationResult,
} from "./algorithmic-execution-contracts";

function createIssue(
  field: string,
  code: string,
  message: string,
): AlgorithmicExecutionValidationIssue {
  return Object.freeze({
    field,
    code,
    message,
  });
}

function validateFinitePositive(
  value: number,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    errors.push(
      createIssue(
        field,
        "NOT_FINITE",
        `${field} must be a finite number.`,
      ),
    );

    return;
  }

  if (value <= 0) {
    errors.push(
      createIssue(
        field,
        "NOT_POSITIVE",
        `${field} must be greater than zero.`,
      ),
    );
  }
}

function validateFiniteNonNegative(
  value: number,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (!Number.isFinite(value)) {
    errors.push(
      createIssue(
        field,
        "NOT_FINITE",
        `${field} must be a finite number.`,
      ),
    );

    return;
  }

  if (value < 0) {
    errors.push(
      createIssue(
        field,
        "NEGATIVE_VALUE",
        `${field} cannot be negative.`,
      ),
    );
  }
}

function validateOptionalFinitePositive(
  value: number | null,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (value === null) {
    return;
  }

  validateFinitePositive(
    value,
    field,
    errors,
  );
}

function validateOptionalFiniteNonNegative(
  value: number | null,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (value === null) {
    return;
  }

  validateFiniteNonNegative(
    value,
    field,
    errors,
  );
}

function validateRate(
  value: number | null,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (value === null) {
    return;
  }

  if (!Number.isFinite(value)) {
    errors.push(
      createIssue(
        field,
        "NOT_FINITE",
        `${field} must be a finite number.`,
      ),
    );

    return;
  }

  if (
    value < 0 ||
    value > 1
  ) {
    errors.push(
      createIssue(
        field,
        "OUT_OF_RANGE",
        `${field} must be between 0 and 1.`,
      ),
    );
  }
}

function validateIdentifier(
  value: string,
  field: string,
  errors: AlgorithmicExecutionValidationIssue[],
): void {
  if (value.trim().length === 0) {
    errors.push(
      createIssue(
        field,
        "REQUIRED",
        `${field} is required.`,
      ),
    );
  }
}

export interface AlgorithmicExecutionValidatorOptions {
  readonly minimumExecutionDurationMilliseconds?: number;
  readonly maximumExecutionDurationMilliseconds?: number | null;
  readonly maximumVenueConstraintCount?: number;
  readonly warnOnImmediateLongDurationMilliseconds?: number;
}

export class AlgorithmicExecutionValidator
implements AlgorithmicExecutionInstructionValidator {
  private readonly minimumExecutionDurationMilliseconds:
    number;

  private readonly maximumExecutionDurationMilliseconds:
    number | null;

  private readonly maximumVenueConstraintCount:
    number;

  private readonly warnOnImmediateLongDurationMilliseconds:
    number;

  public constructor(
    options:
      AlgorithmicExecutionValidatorOptions = {},
  ) {
    this.minimumExecutionDurationMilliseconds =
      options.minimumExecutionDurationMilliseconds ??
      1;

    this.maximumExecutionDurationMilliseconds =
      options.maximumExecutionDurationMilliseconds ??
      null;

    this.maximumVenueConstraintCount =
      options.maximumVenueConstraintCount ??
      100;

    this.warnOnImmediateLongDurationMilliseconds =
      options.warnOnImmediateLongDurationMilliseconds ??
      60_000;

    if (
      !Number.isFinite(
        this.minimumExecutionDurationMilliseconds,
      ) ||
      this.minimumExecutionDurationMilliseconds <= 0
    ) {
      throw new Error(
        "minimumExecutionDurationMilliseconds must be a positive finite number.",
      );
    }

    if (
      this.maximumExecutionDurationMilliseconds !== null &&
      (
        !Number.isFinite(
          this.maximumExecutionDurationMilliseconds,
        ) ||
        this.maximumExecutionDurationMilliseconds <= 0
      )
    ) {
      throw new Error(
        "maximumExecutionDurationMilliseconds must be null or a positive finite number.",
      );
    }

    if (
      this.maximumExecutionDurationMilliseconds !== null &&
      this.maximumExecutionDurationMilliseconds <
        this.minimumExecutionDurationMilliseconds
    ) {
      throw new Error(
        "maximumExecutionDurationMilliseconds cannot be less than minimumExecutionDurationMilliseconds.",
      );
    }

    if (
      !Number.isInteger(
        this.maximumVenueConstraintCount,
      ) ||
      this.maximumVenueConstraintCount < 0
    ) {
      throw new Error(
        "maximumVenueConstraintCount must be a non-negative integer.",
      );
    }

    if (
      !Number.isFinite(
        this.warnOnImmediateLongDurationMilliseconds,
      ) ||
      this.warnOnImmediateLongDurationMilliseconds < 0
    ) {
      throw new Error(
        "warnOnImmediateLongDurationMilliseconds must be a non-negative finite number.",
      );
    }
  }

  public validate(
    instruction:
      AlgorithmicExecutionInstruction,
  ): AlgorithmicExecutionValidationResult {
    const errors:
      AlgorithmicExecutionValidationIssue[] = [];

    const warnings:
      AlgorithmicExecutionValidationIssue[] = [];

    validateIdentifier(
      instruction.executionId,
      "executionId",
      errors,
    );

    validateIdentifier(
      instruction.symbol,
      "symbol",
      errors,
    );

    if (
      instruction.exchangeSymbol !== null &&
      instruction.exchangeSymbol.trim().length === 0
    ) {
      errors.push(
        createIssue(
          "exchangeSymbol",
          "EMPTY_VALUE",
          "exchangeSymbol must be null or a non-empty string.",
        ),
      );
    }

    validateFinitePositive(
      instruction.totalQuantity,
      "totalQuantity",
      errors,
    );

    validateOptionalFinitePositive(
      instruction.limitPrice,
      "limitPrice",
      errors,
    );

    if (
      instruction.orderType === "LIMIT" &&
      instruction.limitPrice === null
    ) {
      errors.push(
        createIssue(
          "limitPrice",
          "REQUIRED_FOR_LIMIT_ORDER",
          "limitPrice is required for LIMIT orders.",
        ),
      );
    }

    if (
      instruction.orderType === "MARKET" &&
      instruction.limitPrice !== null
    ) {
      warnings.push(
        createIssue(
          "limitPrice",
          "IGNORED_FOR_MARKET_ORDER",
          "limitPrice is normally ignored for MARKET orders.",
        ),
      );
    }

    validateFiniteNonNegative(
      instruction.startTime,
      "startTime",
      errors,
    );

    validateFiniteNonNegative(
      instruction.endTime,
      "endTime",
      errors,
    );

    if (
      Number.isFinite(
        instruction.startTime,
      ) &&
      Number.isFinite(
        instruction.endTime,
      )
    ) {
      if (
        instruction.endTime <=
        instruction.startTime
      ) {
        errors.push(
          createIssue(
            "endTime",
            "INVALID_TIME_RANGE",
            "endTime must be greater than startTime.",
          ),
        );
      } else {
        const duration =
          instruction.endTime -
          instruction.startTime;

        if (
          duration <
          this.minimumExecutionDurationMilliseconds
        ) {
          errors.push(
            createIssue(
              "endTime",
              "DURATION_TOO_SHORT",
              "Execution duration is shorter than the configured minimum.",
            ),
          );
        }

        if (
          this.maximumExecutionDurationMilliseconds !== null &&
          duration >
            this.maximumExecutionDurationMilliseconds
        ) {
          errors.push(
            createIssue(
              "endTime",
              "DURATION_TOO_LONG",
              "Execution duration exceeds the configured maximum.",
            ),
          );
        }

        if (
          instruction.urgency === "IMMEDIATE" &&
          duration >
            this.warnOnImmediateLongDurationMilliseconds
        ) {
          warnings.push(
            createIssue(
              "urgency",
              "IMMEDIATE_WITH_LONG_DURATION",
              "IMMEDIATE urgency is combined with a relatively long execution window.",
            ),
          );
        }
      }
    }

    validateOptionalFinitePositive(
      instruction.minimumChildOrderQuantity,
      "minimumChildOrderQuantity",
      errors,
    );

    validateOptionalFinitePositive(
      instruction.maximumChildOrderQuantity,
      "maximumChildOrderQuantity",
      errors,
    );

    if (
      instruction.minimumChildOrderQuantity !== null &&
      instruction.maximumChildOrderQuantity !== null &&
      instruction.minimumChildOrderQuantity >
        instruction.maximumChildOrderQuantity
    ) {
      errors.push(
        createIssue(
          "minimumChildOrderQuantity",
          "MINIMUM_EXCEEDS_MAXIMUM",
          "minimumChildOrderQuantity cannot exceed maximumChildOrderQuantity.",
        ),
      );
    }

    if (
      instruction.minimumChildOrderQuantity !== null &&
      Number.isFinite(
        instruction.totalQuantity,
      ) &&
      instruction.minimumChildOrderQuantity >
        instruction.totalQuantity
    ) {
      errors.push(
        createIssue(
          "minimumChildOrderQuantity",
          "EXCEEDS_TOTAL_QUANTITY",
          "minimumChildOrderQuantity cannot exceed totalQuantity.",
        ),
      );
    }

    if (
      instruction.maximumChildOrderQuantity !== null &&
      Number.isFinite(
        instruction.totalQuantity,
      ) &&
      instruction.maximumChildOrderQuantity >
        instruction.totalQuantity
    ) {
      warnings.push(
        createIssue(
          "maximumChildOrderQuantity",
          "EXCEEDS_TOTAL_QUANTITY",
          "maximumChildOrderQuantity exceeds totalQuantity and will not constrain execution.",
        ),
      );
    }

    validateOptionalFinitePositive(
      instruction.minimumSliceIntervalMilliseconds,
      "minimumSliceIntervalMilliseconds",
      errors,
    );

    validateOptionalFinitePositive(
      instruction.maximumSliceIntervalMilliseconds,
      "maximumSliceIntervalMilliseconds",
      errors,
    );

    if (
      instruction.minimumSliceIntervalMilliseconds !== null &&
      instruction.maximumSliceIntervalMilliseconds !== null &&
      instruction.minimumSliceIntervalMilliseconds >
        instruction.maximumSliceIntervalMilliseconds
    ) {
      errors.push(
        createIssue(
          "minimumSliceIntervalMilliseconds",
          "MINIMUM_EXCEEDS_MAXIMUM",
          "minimumSliceIntervalMilliseconds cannot exceed maximumSliceIntervalMilliseconds.",
        ),
      );
    }

    if (
      !Number.isInteger(
        instruction.maximumActiveChildOrders,
      ) ||
      instruction.maximumActiveChildOrders <= 0
    ) {
      errors.push(
        createIssue(
          "maximumActiveChildOrders",
          "INVALID_COUNT",
          "maximumActiveChildOrders must be a positive integer.",
        ),
      );
    }

    validateOptionalFinitePositive(
      instruction.priceLimit.minimumPrice,
      "priceLimit.minimumPrice",
      errors,
    );

    validateOptionalFinitePositive(
      instruction.priceLimit.maximumPrice,
      "priceLimit.maximumPrice",
      errors,
    );

    if (
      instruction.priceLimit.minimumPrice !== null &&
      instruction.priceLimit.maximumPrice !== null &&
      instruction.priceLimit.minimumPrice >
        instruction.priceLimit.maximumPrice
    ) {
      errors.push(
        createIssue(
          "priceLimit.minimumPrice",
          "MINIMUM_EXCEEDS_MAXIMUM",
          "priceLimit.minimumPrice cannot exceed priceLimit.maximumPrice.",
        ),
      );
    }

    validateOptionalFiniteNonNegative(
      instruction.slippageLimit.maximumSlippageBps,
      "slippageLimit.maximumSlippageBps",
      errors,
    );

    validateOptionalFinitePositive(
      instruction.slippageLimit.referencePrice,
      "slippageLimit.referencePrice",
      errors,
    );

    if (
      instruction.slippageLimit.maximumSlippageBps !== null &&
      instruction.slippageLimit.referencePrice === null
    ) {
      errors.push(
        createIssue(
          "slippageLimit.referencePrice",
          "REFERENCE_PRICE_REQUIRED",
          "A reference price is required when maximumSlippageBps is configured.",
        ),
      );
    }

    validateRate(
      instruction.participationLimit.minimumParticipationRate,
      "participationLimit.minimumParticipationRate",
      errors,
    );

    validateRate(
      instruction.participationLimit.targetParticipationRate,
      "participationLimit.targetParticipationRate",
      errors,
    );

    validateRate(
      instruction.participationLimit.maximumParticipationRate,
      "participationLimit.maximumParticipationRate",
      errors,
    );

    const minimumParticipationRate =
      instruction.participationLimit
        .minimumParticipationRate;

    const targetParticipationRate =
      instruction.participationLimit
        .targetParticipationRate;

    const maximumParticipationRate =
      instruction.participationLimit
        .maximumParticipationRate;

    if (
      minimumParticipationRate !== null &&
      targetParticipationRate !== null &&
      minimumParticipationRate >
        targetParticipationRate
    ) {
      errors.push(
        createIssue(
          "participationLimit.minimumParticipationRate",
          "MINIMUM_EXCEEDS_TARGET",
          "minimumParticipationRate cannot exceed targetParticipationRate.",
        ),
      );
    }

    if (
      targetParticipationRate !== null &&
      maximumParticipationRate !== null &&
      targetParticipationRate >
        maximumParticipationRate
    ) {
      errors.push(
        createIssue(
          "participationLimit.targetParticipationRate",
          "TARGET_EXCEEDS_MAXIMUM",
          "targetParticipationRate cannot exceed maximumParticipationRate.",
        ),
      );
    }

    if (
      minimumParticipationRate !== null &&
      maximumParticipationRate !== null &&
      minimumParticipationRate >
        maximumParticipationRate
    ) {
      errors.push(
        createIssue(
          "participationLimit.minimumParticipationRate",
          "MINIMUM_EXCEEDS_MAXIMUM",
          "minimumParticipationRate cannot exceed maximumParticipationRate.",
        ),
      );
    }

    if (
      instruction.algorithm === "POV" &&
      targetParticipationRate === null
    ) {
      errors.push(
        createIssue(
          "participationLimit.targetParticipationRate",
          "REQUIRED_FOR_POV",
          "targetParticipationRate is required for POV execution.",
        ),
      );
    }

    if (
      instruction.algorithm === "ICEBERG" &&
      instruction.maximumChildOrderQuantity === null
    ) {
      errors.push(
        createIssue(
          "maximumChildOrderQuantity",
          "REQUIRED_FOR_ICEBERG",
          "maximumChildOrderQuantity is required for ICEBERG execution.",
        ),
      );
    }

    if (
      instruction.venueConstraints.length >
      this.maximumVenueConstraintCount
    ) {
      errors.push(
        createIssue(
          "venueConstraints",
          "TOO_MANY_VENUES",
          "venueConstraints exceeds the configured maximum count.",
        ),
      );
    }

    const venueKeys =
      new Set<string>();

    instruction.venueConstraints.forEach(
      (
        venue,
        index,
      ) => {
        const prefix =
          `venueConstraints[${index}]`;

        validateIdentifier(
          venue.exchangeId,
          `${prefix}.exchangeId`,
          errors,
        );

        if (
          venue.accountId !== null &&
          venue.accountId.trim().length === 0
        ) {
          errors.push(
            createIssue(
              `${prefix}.accountId`,
              "EMPTY_VALUE",
              "accountId must be null or a non-empty string.",
            ),
          );
        }

        validateOptionalFinitePositive(
          venue.maximumQuantity,
          `${prefix}.maximumQuantity`,
          errors,
        );

        validateOptionalFinitePositive(
          venue.maximumNotional,
          `${prefix}.maximumNotional`,
          errors,
        );

        if (
          venue.priority !== null &&
          (
            !Number.isInteger(
              venue.priority,
            ) ||
            venue.priority < 0
          )
        ) {
          errors.push(
            createIssue(
              `${prefix}.priority`,
              "INVALID_PRIORITY",
              "priority must be null or a non-negative integer.",
            ),
          );
        }

        const venueKey =
          `${venue.exchangeId.trim()}::${venue.accountId ?? ""}`;

        if (
          venueKeys.has(
            venueKey,
          )
        ) {
          errors.push(
            createIssue(
              prefix,
              "DUPLICATE_VENUE_CONSTRAINT",
              "Duplicate venue constraint detected.",
            ),
          );
        } else {
          venueKeys.add(
            venueKey,
          );
        }
      },
    );

    if (
      instruction.venueConstraints.length > 0 &&
      instruction.venueConstraints.every(
        (venue) =>
          !venue.enabled,
      )
    ) {
      errors.push(
        createIssue(
          "venueConstraints",
          "NO_ENABLED_VENUES",
          "At least one venue constraint must be enabled.",
        ),
      );
    }

    return Object.freeze({
      valid:
        errors.length === 0,

      errors:
        Object.freeze(
          [...errors],
        ),

      warnings:
        Object.freeze(
          [...warnings],
        ),
    });
  }
}

export function createAlgorithmicExecutionValidator(
  options:
    AlgorithmicExecutionValidatorOptions = {},
): AlgorithmicExecutionInstructionValidator {
  return new AlgorithmicExecutionValidator(
    options,
  );
}