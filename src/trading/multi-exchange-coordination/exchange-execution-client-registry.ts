import type {
  CoordinatorExchangeId,
} from "./coordinator-contracts";
import type {
  CoordinatorExchangeExecutionClient,
  CoordinatorExchangeExecutionClientRegistry,
} from "./coordinated-execution-contracts";

function normalizeExchangeId(
  exchangeId: CoordinatorExchangeId,
): string {
  return exchangeId.trim().toUpperCase();
}

function assertExchangeId(
  exchangeId: CoordinatorExchangeId,
): void {
  if (exchangeId.trim().length === 0) {
    throw new Error(
      "exchangeId must not be empty.",
    );
  }
}

function assertClient(
  client: CoordinatorExchangeExecutionClient,
): void {
  if (
    client === null ||
    typeof client !== "object"
  ) {
    throw new Error(
      "execution client must be an object.",
    );
  }

  assertExchangeId(client.exchangeId);

  if (typeof client.submit !== "function") {
    throw new Error(
      `Execution client ${client.exchangeId} must define submit().`,
    );
  }
}

/**
 * Deterministic in-memory registry for exchange execution clients.
 *
 * Exchange identifiers are matched case-insensitively while the registered
 * client retains its original exchangeId value.
 */
export class InMemoryCoordinatorExchangeExecutionClientRegistry
  implements CoordinatorExchangeExecutionClientRegistry
{
  private readonly clients =
    new Map<
      string,
      CoordinatorExchangeExecutionClient
    >();

  public constructor(
    initialClients:
      readonly CoordinatorExchangeExecutionClient[] = [],
  ) {
    for (const client of initialClients) {
      this.register(client);
    }
  }

  public register(
    client: CoordinatorExchangeExecutionClient,
  ): void {
    assertClient(client);

    const key = normalizeExchangeId(
      client.exchangeId,
    );

    if (this.clients.has(key)) {
      throw new Error(
        `Execution client already registered for exchange ${client.exchangeId}.`,
      );
    }

    this.clients.set(
      key,
      client,
    );
  }

  public replace(
    client: CoordinatorExchangeExecutionClient,
  ): void {
    assertClient(client);

    const key = normalizeExchangeId(
      client.exchangeId,
    );

    this.clients.set(
      key,
      client,
    );
  }

  public unregister(
    exchangeId: CoordinatorExchangeId,
  ): boolean {
    assertExchangeId(exchangeId);

    return this.clients.delete(
      normalizeExchangeId(exchangeId),
    );
  }

  public resolve(
    exchangeId: CoordinatorExchangeId,
  ): CoordinatorExchangeExecutionClient | null {
    assertExchangeId(exchangeId);

    return (
      this.clients.get(
        normalizeExchangeId(exchangeId),
      ) ?? null
    );
  }

  public has(
    exchangeId: CoordinatorExchangeId,
  ): boolean {
    assertExchangeId(exchangeId);

    return this.clients.has(
      normalizeExchangeId(exchangeId),
    );
  }

  public list():
    readonly CoordinatorExchangeExecutionClient[] {
    return Object.freeze(
      Array.from(this.clients.values()),
    );
  }

  public get size(): number {
    return this.clients.size;
  }

  public clear(): void {
    this.clients.clear();
  }
}

export function createCoordinatorExchangeExecutionClientRegistry(
  initialClients:
    readonly CoordinatorExchangeExecutionClient[] = [],
): InMemoryCoordinatorExchangeExecutionClientRegistry {
  return new InMemoryCoordinatorExchangeExecutionClientRegistry(
    initialClients,
  );
}