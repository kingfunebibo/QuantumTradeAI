import {
  type AlgorithmicExecutionState,
  type AlgorithmicExecutionStateRepository,
} from "./algorithmic-execution-contracts";

export interface InMemoryAlgorithmicExecutionRepositoryOptions {
  /**
   * Existing states used to initialize the repository.
   */
  readonly initialStates?:
    readonly AlgorithmicExecutionState[];

  /**
   * When enabled, saving an older state version over a newer version fails.
   */
  readonly enforceMonotonicVersions?: boolean;

  /**
   * When enabled, saving two different states with the same version fails.
   */
  readonly rejectConflictingVersions?: boolean;
}

function assertNonEmptyString(
  value: string,
  field: string,
): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${field} must be a non-empty string.`,
    );
  }
}

function assertState(
  state: AlgorithmicExecutionState,
): void {
  if (
    state === null ||
    state === undefined ||
    typeof state !== "object"
  ) {
    throw new Error(
      "state must be an AlgorithmicExecutionState object.",
    );
  }

  assertNonEmptyString(
    state.executionId,
    "state.executionId",
  );

  if (
    state.instruction === null ||
    state.instruction === undefined ||
    typeof state.instruction !== "object"
  ) {
    throw new Error(
      "state.instruction must be an object.",
    );
  }

  if (
    state.instruction.executionId !==
    state.executionId
  ) {
    throw new Error(
      [
        "state.instruction.executionId must match",
        "state.executionId.",
      ].join(" "),
    );
  }

  if (
    !Number.isInteger(
      state.version,
    ) ||
    state.version < 0
  ) {
    throw new Error(
      "state.version must be a non-negative integer.",
    );
  }

  if (
    !Number.isFinite(
      state.createdAt,
    ) ||
    state.createdAt < 0
  ) {
    throw new Error(
      "state.createdAt must be a non-negative finite number.",
    );
  }

  if (
    !Number.isFinite(
      state.updatedAt,
    ) ||
    state.updatedAt < 0
  ) {
    throw new Error(
      "state.updatedAt must be a non-negative finite number.",
    );
  }

  if (
    state.updatedAt <
    state.createdAt
  ) {
    throw new Error(
      "state.updatedAt cannot be earlier than state.createdAt.",
    );
  }
}

function cloneMetadata<
  T extends Readonly<
    Record<
      string,
      string | number | boolean | null
    >
  >,
>(
  metadata: T,
): T {
  return Object.freeze({
    ...metadata,
  }) as T;
}

function cloneState(
  state: AlgorithmicExecutionState,
): AlgorithmicExecutionState {
  const instruction =
    Object.freeze({
      ...state.instruction,

      priceLimit:
        Object.freeze({
          ...state.instruction
            .priceLimit,
        }),

      slippageLimit:
        Object.freeze({
          ...state.instruction
            .slippageLimit,
        }),

      participationLimit:
        Object.freeze({
          ...state.instruction
            .participationLimit,
        }),

      venueConstraints:
        Object.freeze(
          state.instruction
            .venueConstraints
            .map(
              (
                constraint,
              ) =>
                Object.freeze({
                  ...constraint,

                  metadata:
                    cloneMetadata(
                      constraint.metadata,
                    ),
                }),
            ),
        ),

      metadata:
        cloneMetadata(
          state.instruction
            .metadata,
        ),
    });

  const schedule =
    state.schedule === null
      ? null
      : Object.freeze({
          ...state.schedule,

          slices:
            Object.freeze(
              state.schedule.slices.map(
                (
                  slice,
                ) =>
                  Object.freeze({
                    ...slice,

                    childOrderIds:
                      Object.freeze([
                        ...slice
                          .childOrderIds,
                      ]),

                    metadata:
                      cloneMetadata(
                        slice.metadata,
                      ),
                  }),
              ),
            ),

          metadata:
            cloneMetadata(
              state.schedule.metadata,
            ),
        });

  const childOrders =
    Object.freeze(
      state.childOrders.map(
        (
          childOrder,
        ) =>
          Object.freeze({
            ...childOrder,

            fills:
              Object.freeze(
                childOrder.fills.map(
                  (
                    fill,
                  ) =>
                    Object.freeze({
                      ...fill,

                      metadata:
                        cloneMetadata(
                          fill.metadata,
                        ),
                    }),
                ),
              ),

            metadata:
              cloneMetadata(
                childOrder.metadata,
              ),
          }),
      ),
    );

  const fills =
    Object.freeze(
      state.fills.map(
        (
          fill,
        ) =>
          Object.freeze({
            ...fill,

            metadata:
              cloneMetadata(
                fill.metadata,
              ),
          }),
      ),
    );

  const progress =
    Object.freeze({
      ...state.progress,
    });

  return Object.freeze({
    ...state,

    instruction,
    schedule,
    childOrders,
    fills,
    progress,

    metadata:
      cloneMetadata(
        state.metadata,
      ),
  });
}

function statesAreEquivalent(
  left: AlgorithmicExecutionState,
  right: AlgorithmicExecutionState,
): boolean {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  );
}

export class InMemoryAlgorithmicExecutionRepository
implements AlgorithmicExecutionStateRepository {
  private readonly states =
    new Map<
      string,
      AlgorithmicExecutionState
    >();

  private readonly enforceMonotonicVersions:
    boolean;

  private readonly rejectConflictingVersions:
    boolean;

  public constructor(
    options:
      InMemoryAlgorithmicExecutionRepositoryOptions = {},
  ) {
    this.enforceMonotonicVersions =
      options.enforceMonotonicVersions ??
      true;

    this.rejectConflictingVersions =
      options.rejectConflictingVersions ??
      true;

    const initialStates =
      options.initialStates ??
      [];

    for (
      const state of
      initialStates
    ) {
      this.saveInitialState(
        state,
      );
    }
  }

  public async save(
    state:
      AlgorithmicExecutionState,
  ): Promise<void> {
    assertState(
      state,
    );

    const existing =
      this.states.get(
        state.executionId,
      );

    if (
      existing !== undefined
    ) {
      this.assertValidVersionUpdate(
        existing,
        state,
      );
    }

    this.states.set(
      state.executionId,
      cloneState(
        state,
      ),
    );
  }

  public async findByExecutionId(
    executionId: string,
  ): Promise<
    AlgorithmicExecutionState | null
  > {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    const state =
      this.states.get(
        executionId,
      );

    if (
      state === undefined
    ) {
      return null;
    }

    return cloneState(
      state,
    );
  }

  public async delete(
    executionId: string,
  ): Promise<void> {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    this.states.delete(
      executionId,
    );
  }

  public has(
    executionId: string,
  ): boolean {
    assertNonEmptyString(
      executionId,
      "executionId",
    );

    return this.states.has(
      executionId,
    );
  }

  public size(): number {
    return this.states.size;
  }

  public listExecutionIds():
    readonly string[] {
    return Object.freeze(
      Array.from(
        this.states.keys(),
      ).sort(
        (
          left,
          right,
        ) =>
          left.localeCompare(
            right,
          ),
      ),
    );
  }

  public listStates():
    readonly AlgorithmicExecutionState[] {
    const states =
      Array.from(
        this.states.values(),
      )
        .sort(
          (
            left,
            right,
          ) => {
            if (
              left.createdAt !==
              right.createdAt
            ) {
              return (
                left.createdAt -
                right.createdAt
              );
            }

            return left.executionId.localeCompare(
              right.executionId,
            );
          },
        )
        .map(
          (
            state,
          ) =>
            cloneState(
              state,
            ),
        );

    return Object.freeze(
      states,
    );
  }

  public clear(): void {
    this.states.clear();
  }

  private saveInitialState(
    state:
      AlgorithmicExecutionState,
  ): void {
    assertState(
      state,
    );

    if (
      this.states.has(
        state.executionId,
      )
    ) {
      throw new Error(
        [
          "Duplicate initial algorithmic execution state",
          `for executionId ${state.executionId}.`,
        ].join(" "),
      );
    }

    this.states.set(
      state.executionId,
      cloneState(
        state,
      ),
    );
  }

  private assertValidVersionUpdate(
    existing:
      AlgorithmicExecutionState,
    incoming:
      AlgorithmicExecutionState,
  ): void {
    if (
      this.enforceMonotonicVersions &&
      incoming.version <
        existing.version
    ) {
      throw new Error(
        [
          "Cannot save algorithmic execution state",
          `${incoming.executionId} at version`,
          `${incoming.version} because version`,
          `${existing.version} is already stored.`,
        ].join(" "),
      );
    }

    if (
      this.rejectConflictingVersions &&
      incoming.version ===
        existing.version &&
      !statesAreEquivalent(
        existing,
        incoming,
      )
    ) {
      throw new Error(
        [
          "Cannot save conflicting algorithmic execution state",
          `${incoming.executionId} at version`,
          `${incoming.version}.`,
        ].join(" "),
      );
    }
  }
}

export function createInMemoryAlgorithmicExecutionRepository(
  options:
    InMemoryAlgorithmicExecutionRepositoryOptions = {},
): AlgorithmicExecutionStateRepository {
  return new InMemoryAlgorithmicExecutionRepository(
    options,
  );
}