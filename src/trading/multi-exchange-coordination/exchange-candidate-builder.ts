import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
  CoordinatorSymbolReference,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";
import type {
  CoordinatorCapabilityMatchOptions,
  CoordinatorExchangeCapabilityMatcher,
} from "./exchange-capability-matcher";
import type {
  CoordinatorSymbolCompatibilityMatcher,
} from "./symbol-compatibility";

export type CoordinatorExchangeDescriptor = Omit<
  CoordinatorExchangeCandidate,
  "symbol"
>;

export interface CoordinatorExchangeDescriptorRegistry {
  getAll(): readonly CoordinatorExchangeDescriptor[];

  get(
    exchangeId: CoordinatorExchangeId,
  ): CoordinatorExchangeDescriptor | null;
}

export interface CoordinatorExchangeCandidateBuildOptions
  extends CoordinatorCapabilityMatchOptions {
  readonly allowedExchangeIds?: readonly CoordinatorExchangeId[];
  readonly excludedExchangeIds?: readonly CoordinatorExchangeId[];
  readonly requireHealthyExchange?: boolean;
  readonly requireAvailableExchange?: boolean;
}

export interface CoordinatorExchangeCandidateRejection {
  readonly exchangeId: CoordinatorExchangeId;
  readonly reasons: readonly string[];
}

export interface CoordinatorExchangeCandidateBuildResult {
  readonly candidates: readonly CoordinatorExchangeCandidate[];
  readonly rejections:
    readonly CoordinatorExchangeCandidateRejection[];
}

function normalizeExchangeId(
  exchangeId: CoordinatorExchangeId,
): string {
  return exchangeId.trim().toUpperCase();
}

function uniqueReasons(
  reasons: readonly string[],
): readonly string[] {
  return Object.freeze(Array.from(new Set(reasons)));
}

function containsExchangeId(
  exchangeIds: readonly CoordinatorExchangeId[],
  exchangeId: CoordinatorExchangeId,
): boolean {
  const normalizedExchangeId =
    normalizeExchangeId(exchangeId);

  return exchangeIds.some(
    (candidateExchangeId) =>
      normalizeExchangeId(candidateExchangeId) ===
      normalizedExchangeId,
  );
}

export class InMemoryCoordinatorExchangeDescriptorRegistry
  implements CoordinatorExchangeDescriptorRegistry
{
  private readonly descriptors = new Map<
    string,
    CoordinatorExchangeDescriptor
  >();

  public constructor(
    descriptors:
      readonly CoordinatorExchangeDescriptor[] = [],
  ) {
    for (const descriptor of descriptors) {
      this.register(descriptor);
    }
  }

  public register(
    descriptor: CoordinatorExchangeDescriptor,
  ): void {
    if (descriptor.exchangeId.trim().length === 0) {
      throw new Error("exchangeId cannot be empty.");
    }

    if (
      normalizeExchangeId(
        descriptor.capabilities.exchangeId,
      ) !== normalizeExchangeId(descriptor.exchangeId)
    ) {
      throw new Error(
        "Descriptor exchangeId must match capabilities exchangeId.",
      );
    }

    if (
      normalizeExchangeId(descriptor.health.exchangeId) !==
      normalizeExchangeId(descriptor.exchangeId)
    ) {
      throw new Error(
        "Descriptor exchangeId must match health exchangeId.",
      );
    }

    this.descriptors.set(
      normalizeExchangeId(descriptor.exchangeId),
      Object.freeze({
        ...descriptor,
      }),
    );
  }

  public unregister(
    exchangeId: CoordinatorExchangeId,
  ): boolean {
    return this.descriptors.delete(
      normalizeExchangeId(exchangeId),
    );
  }

  public getAll():
    readonly CoordinatorExchangeDescriptor[] {
    return Object.freeze(
      [...this.descriptors.values()].sort(
        (left, right) => {
          const priorityDifference =
            left.priority - right.priority;

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return normalizeExchangeId(
            left.exchangeId,
          ).localeCompare(
            normalizeExchangeId(right.exchangeId),
          );
        },
      ),
    );
  }

  public get(
    exchangeId: CoordinatorExchangeId,
  ): CoordinatorExchangeDescriptor | null {
    return (
      this.descriptors.get(
        normalizeExchangeId(exchangeId),
      ) ?? null
    );
  }
}

export class CoordinatorExchangeCandidateBuilder {
  public constructor(
    private readonly descriptorRegistry:
      CoordinatorExchangeDescriptorRegistry,
    private readonly capabilityMatcher:
      CoordinatorExchangeCapabilityMatcher,
    private readonly symbolMatcher:
      CoordinatorSymbolCompatibilityMatcher,
  ) {}

  public build(
    request: MultiExchangeCoordinatorOrderRequest,
    options:
      CoordinatorExchangeCandidateBuildOptions = {},
  ): CoordinatorExchangeCandidateBuildResult {
    const candidates: CoordinatorExchangeCandidate[] = [];
    const rejections:
      CoordinatorExchangeCandidateRejection[] = [];

    for (
      const descriptor of
      this.descriptorRegistry.getAll()
    ) {
      const rejectionReasons: string[] = [];

      if (
        options.allowedExchangeIds !== undefined &&
        !containsExchangeId(
          options.allowedExchangeIds,
          descriptor.exchangeId,
        )
      ) {
        rejectionReasons.push(
          `Exchange ${descriptor.exchangeId} is not in the allowed exchange list.`,
        );
      }

      if (
        options.excludedExchangeIds !== undefined &&
        containsExchangeId(
          options.excludedExchangeIds,
          descriptor.exchangeId,
        )
      ) {
        rejectionReasons.push(
          `Exchange ${descriptor.exchangeId} is excluded.`,
        );
      }

      if (
        options.requireHealthyExchange !== false &&
        descriptor.health.status !== "HEALTHY"
      ) {
        rejectionReasons.push(
          `Exchange ${descriptor.exchangeId} is not healthy.`,
        );
      }

      if (
        options.requireAvailableExchange !== false &&
        descriptor.health.availability !== "AVAILABLE"
      ) {
        rejectionReasons.push(
          `Exchange ${descriptor.exchangeId} is unavailable.`,
        );
      }

      const capabilityResult =
        this.capabilityMatcher.match(
          request,
          descriptor.capabilities,
          options,
        );

      for (
        const mismatch of
        capabilityResult.mismatches
      ) {
        rejectionReasons.push(mismatch.message);
      }

      const symbolResult = this.symbolMatcher.match(
        request,
        descriptor.exchangeId,
      );

      if (
        !symbolResult.compatible ||
        symbolResult.symbol === null
      ) {
        rejectionReasons.push(
          symbolResult.reason ??
            `Exchange ${descriptor.exchangeId} has an incompatible symbol.`,
        );
      }

      const uniqueRejectionReasons =
        uniqueReasons(rejectionReasons);

      if (
        uniqueRejectionReasons.length > 0 ||
        symbolResult.symbol === null
      ) {
        rejections.push(
          Object.freeze({
            exchangeId: descriptor.exchangeId,
            reasons: uniqueRejectionReasons,
          }),
        );

        continue;
      }

      candidates.push(
        this.createCandidate(
          descriptor,
          symbolResult.symbol,
        ),
      );
    }

    return Object.freeze({
      candidates: Object.freeze([...candidates]),
      rejections: Object.freeze([...rejections]),
    });
  }

  private createCandidate(
    descriptor: CoordinatorExchangeDescriptor,
    symbol: CoordinatorSymbolReference,
  ): CoordinatorExchangeCandidate {
    return Object.freeze({
      ...descriptor,
      symbol,
    });
  }
}

export function createCoordinatorExchangeCandidateBuilder(
  descriptorRegistry:
    CoordinatorExchangeDescriptorRegistry,
  capabilityMatcher:
    CoordinatorExchangeCapabilityMatcher,
  symbolMatcher:
    CoordinatorSymbolCompatibilityMatcher,
): CoordinatorExchangeCandidateBuilder {
  return new CoordinatorExchangeCandidateBuilder(
    descriptorRegistry,
    capabilityMatcher,
    symbolMatcher,
  );
}