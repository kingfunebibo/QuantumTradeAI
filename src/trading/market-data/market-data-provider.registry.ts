import {
  MarketDataError,
  MarketDataProviderId,
} from "./market-data-provider.types";

import {
  MarketDataProvider,
  MarketDataProviderLookup,
  MarketDataProviderRegistry,
} from "./market-data-provider";

/**
 * Deterministic in-memory market-data provider registry.
 *
 * Guarantees:
 *
 * - Provider identifiers are unique.
 * - Duplicate registration is rejected.
 * - Replacement is explicit.
 * - Lookups are strongly typed.
 * - Provider listings are returned in deterministic identifier order.
 * - Returned collections are immutable defensive copies.
 */
export class InMemoryMarketDataProviderRegistry
  implements MarketDataProviderRegistry
{
  private readonly providers =
    new Map<
      MarketDataProviderId,
      MarketDataProvider
    >();

  /**
   * Registers a provider.
   *
   * Throws when another provider with the same identifier is already
   * registered.
   */
  public register(
    provider: MarketDataProvider,
  ): void {
    const providerId =
      provider.getId();

    if (
      this.providers.has(
        providerId,
      )
    ) {
      throw new MarketDataError(
        "PROVIDER_ALREADY_REGISTERED",
        [
          `Market-data provider "${providerId}"`,
          "is already registered.",
        ].join(" "),
        {
          providerId,
          exchange:
            provider
              .getDescriptor()
              .exchange,
        },
      );
    }

    this.providers.set(
      providerId,
      provider,
    );
  }

  /**
   * Registers or replaces a provider with the same identifier.
   */
  public replace(
    provider: MarketDataProvider,
  ): void {
    this.providers.set(
      provider.getId(),
      provider,
    );
  }

  /**
   * Removes one provider.
   *
   * Returns true when a provider was removed.
   */
  public remove(
    lookup: MarketDataProviderLookup,
  ): boolean {
    return this.providers.delete(
      lookup.providerId,
    );
  }

  /**
   * Returns a provider by identifier.
   */
  public get(
    lookup: MarketDataProviderLookup,
  ): MarketDataProvider | undefined {
    return this.providers.get(
      lookup.providerId,
    );
  }

  /**
   * Returns a provider or throws when it is not registered.
   */
  public require(
    lookup: MarketDataProviderLookup,
  ): MarketDataProvider {
    const provider =
      this.get(lookup);

    if (provider === undefined) {
      throw new MarketDataError(
        "PROVIDER_NOT_FOUND",
        [
          `Market-data provider "${lookup.providerId}"`,
          "is not registered.",
        ].join(" "),
        {
          providerId:
            lookup.providerId,
        },
      );
    }

    return provider;
  }

  /**
   * Returns whether a provider is registered.
   */
  public has(
    lookup: MarketDataProviderLookup,
  ): boolean {
    return this.providers.has(
      lookup.providerId,
    );
  }

  /**
   * Lists providers in deterministic identifier order.
   */
  public list(): readonly MarketDataProvider[] {
    return Object.freeze(
      [...this.providers.values()]
        .sort(compareProviders),
    );
  }

  /**
   * Returns the number of registered providers.
   */
  public count(): number {
    return this.providers.size;
  }

  /**
   * Removes all providers.
   */
  public clear(): void {
    this.providers.clear();
  }
}

/**
 * Compares providers by their canonical identifier.
 */
function compareProviders(
  left: MarketDataProvider,
  right: MarketDataProvider,
): number {
  return String(
    left.getId(),
  ).localeCompare(
    String(
      right.getId(),
    ),
  );
}