import type {
  CoordinatorExchangeCandidate,
  CoordinatorExchangeId,
  CoordinatorSymbol,
  CoordinatorSymbolReference,
  MultiExchangeCoordinatorOrderRequest,
} from "./coordinator-contracts";

export type CoordinatorSymbolCompatibilityStatus =
  | "COMPATIBLE"
  | "UNSUPPORTED"
  | "INVALID_MAPPING";

export interface CoordinatorExchangeSymbolMapping {
  readonly exchangeId: CoordinatorExchangeId;
  readonly requestedSymbol: CoordinatorSymbol;
  readonly normalizedSymbol: CoordinatorSymbol;
  readonly exchangeSymbol: CoordinatorSymbol;
  readonly supported: boolean;
}

export interface CoordinatorSymbolCompatibilityResult {
  readonly exchangeId: CoordinatorExchangeId;
  readonly status: CoordinatorSymbolCompatibilityStatus;
  readonly compatible: boolean;
  readonly symbol: CoordinatorSymbolReference | null;
  readonly reason: string | null;
}

export interface CoordinatorSymbolCompatibilityRegistry {
  resolve(
    exchangeId: CoordinatorExchangeId,
    requestedSymbol: CoordinatorSymbol,
  ): CoordinatorExchangeSymbolMapping | null;
}

function normalizeSymbol(symbol: CoordinatorSymbol): CoordinatorSymbol {
  return symbol.trim().toUpperCase();
}

function assertNonEmptySymbol(
  symbol: CoordinatorSymbol,
  fieldName: string,
): void {
  if (symbol.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
}

export class InMemoryCoordinatorSymbolCompatibilityRegistry
  implements CoordinatorSymbolCompatibilityRegistry
{
  private readonly mappings = new Map<
    string,
    CoordinatorExchangeSymbolMapping
  >();

  public constructor(
    mappings: readonly CoordinatorExchangeSymbolMapping[] = [],
  ) {
    for (const mapping of mappings) {
      this.register(mapping);
    }
  }

  public register(
    mapping: CoordinatorExchangeSymbolMapping,
  ): void {
    assertNonEmptySymbol(mapping.exchangeId, "exchangeId");
    assertNonEmptySymbol(
      mapping.requestedSymbol,
      "requestedSymbol",
    );
    assertNonEmptySymbol(
      mapping.normalizedSymbol,
      "normalizedSymbol",
    );
    assertNonEmptySymbol(
      mapping.exchangeSymbol,
      "exchangeSymbol",
    );

    const normalizedRequestedSymbol = normalizeSymbol(
      mapping.requestedSymbol,
    );

    this.mappings.set(
      this.createKey(
        mapping.exchangeId,
        normalizedRequestedSymbol,
      ),
      Object.freeze({
        exchangeId: mapping.exchangeId,
        requestedSymbol: mapping.requestedSymbol,
        normalizedSymbol: normalizeSymbol(
          mapping.normalizedSymbol,
        ),
        exchangeSymbol: mapping.exchangeSymbol.trim(),
        supported: mapping.supported,
      }),
    );
  }

  public unregister(
    exchangeId: CoordinatorExchangeId,
    requestedSymbol: CoordinatorSymbol,
  ): boolean {
    return this.mappings.delete(
      this.createKey(
        exchangeId,
        normalizeSymbol(requestedSymbol),
      ),
    );
  }

  public resolve(
    exchangeId: CoordinatorExchangeId,
    requestedSymbol: CoordinatorSymbol,
  ): CoordinatorExchangeSymbolMapping | null {
    const mapping = this.mappings.get(
      this.createKey(
        exchangeId,
        normalizeSymbol(requestedSymbol),
      ),
    );

    return mapping ?? null;
  }

  private createKey(
    exchangeId: CoordinatorExchangeId,
    requestedSymbol: CoordinatorSymbol,
  ): string {
    return `${exchangeId.trim().toUpperCase()}::${requestedSymbol}`;
  }
}

export class CoordinatorSymbolCompatibilityMatcher {
  public constructor(
    private readonly registry:
      CoordinatorSymbolCompatibilityRegistry,
  ) {}

  public match(
    request: MultiExchangeCoordinatorOrderRequest,
    exchangeId: CoordinatorExchangeId,
  ): CoordinatorSymbolCompatibilityResult {
    assertNonEmptySymbol(request.symbol, "request.symbol");
    assertNonEmptySymbol(exchangeId, "exchangeId");

    const mapping = this.registry.resolve(
      exchangeId,
      request.symbol,
    );

    if (mapping === null) {
      return Object.freeze({
        exchangeId,
        status: "UNSUPPORTED",
        compatible: false,
        symbol: null,
        reason:
          `Exchange ${exchangeId} has no symbol mapping for ` +
          `${request.symbol}.`,
      });
    }

    if (!mapping.supported) {
      return Object.freeze({
        exchangeId,
        status: "UNSUPPORTED",
        compatible: false,
        symbol: null,
        reason:
          `Exchange ${exchangeId} does not support symbol ` +
          `${request.symbol}.`,
      });
    }

    if (
      mapping.normalizedSymbol.trim().length === 0 ||
      mapping.exchangeSymbol.trim().length === 0
    ) {
      return Object.freeze({
        exchangeId,
        status: "INVALID_MAPPING",
        compatible: false,
        symbol: null,
        reason:
          `Exchange ${exchangeId} contains an invalid symbol ` +
          `mapping for ${request.symbol}.`,
      });
    }

    const symbol: CoordinatorSymbolReference =
      Object.freeze({
        requestedSymbol: request.symbol,
        normalizedSymbol: mapping.normalizedSymbol,
        exchangeSymbol: mapping.exchangeSymbol,
      });

    return Object.freeze({
      exchangeId,
      status: "COMPATIBLE",
      compatible: true,
      symbol,
      reason: null,
    });
  }

  public filterCompatibleCandidates(
    request: MultiExchangeCoordinatorOrderRequest,
    candidates: readonly CoordinatorExchangeCandidate[],
  ): readonly CoordinatorExchangeCandidate[] {
    const compatibleCandidates =
      candidates.flatMap((candidate) => {
        const result = this.match(
          request,
          candidate.exchangeId,
        );

        if (!result.compatible || result.symbol === null) {
          return [];
        }

        return [
          Object.freeze({
            ...candidate,
            symbol: result.symbol,
          }),
        ];
      });

    return Object.freeze(compatibleCandidates);
  }
}

export function createCoordinatorSymbolCompatibilityMatcher(
  registry: CoordinatorSymbolCompatibilityRegistry,
): CoordinatorSymbolCompatibilityMatcher {
  return new CoordinatorSymbolCompatibilityMatcher(registry);
}