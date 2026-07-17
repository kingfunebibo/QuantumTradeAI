import type {
  MultiExchangeCoordinatorEvent,
  MultiExchangeCoordinatorHealthObserver,
  MultiExchangeCoordinatorHealthSnapshot,
  MultiExchangeCoordinatorMetrics,
  MultiExchangeCoordinatorMetricsObserver,
  MultiExchangeCoordinatorObserver,
} from "./coordinator-contracts";

export type CoordinatorObserverErrorCategory =
  | "EVENT_OBSERVER"
  | "METRICS_OBSERVER"
  | "HEALTH_OBSERVER";

export interface CoordinatorObserverNotificationError {
  readonly category: CoordinatorObserverErrorCategory;
  readonly observer: object;
  readonly error: unknown;
}

export interface CoordinatorObserverNotificationResult {
  readonly notifiedObservers: number;
  readonly failedObservers: number;
  readonly errors: readonly CoordinatorObserverNotificationError[];
}

export interface MultiExchangeCoordinatorObserverRegistryOptions {
  /**
   * When true, observer notification methods throw an aggregate error after
   * all observers have been invoked.
   *
   * When false, failures are captured in the returned notification result.
   */
  readonly throwOnObserverError?: boolean;
}

/**
 * Error raised after observer delivery completes when strict notification
 * behavior is enabled and one or more observers failed.
 */
export class MultiExchangeCoordinatorObserverNotificationError extends Error {
  public constructor(
    public readonly errors:
      readonly CoordinatorObserverNotificationError[],
  ) {
    super(
      `Coordinator observer notification failed for ${errors.length} observer(s).`,
    );

    this.name =
      "MultiExchangeCoordinatorObserverNotificationError";

    Object.setPrototypeOf(
      this,
      MultiExchangeCoordinatorObserverNotificationError.prototype,
    );
  }
}

/**
 * Maintains coordinator observers and delivers events, metrics snapshots, and
 * health snapshots in deterministic registration order.
 *
 * Notification uses a snapshot of each observer set. Observers may therefore
 * safely add or remove observers while a notification cycle is running
 * without altering the current delivery sequence.
 */
export class MultiExchangeCoordinatorObserverRegistry {
  private readonly eventObservers =
    new Set<MultiExchangeCoordinatorObserver>();

  private readonly metricsObservers =
    new Set<MultiExchangeCoordinatorMetricsObserver>();

  private readonly healthObservers =
    new Set<MultiExchangeCoordinatorHealthObserver>();

  private readonly throwOnObserverError: boolean;

  public constructor(
    options: MultiExchangeCoordinatorObserverRegistryOptions = {},
  ) {
    this.throwOnObserverError =
      options.throwOnObserverError ?? false;
  }

  public addObserver(
    observer: MultiExchangeCoordinatorObserver,
  ): boolean {
    this.assertObserver(observer, "observer");

    const sizeBefore = this.eventObservers.size;

    this.eventObservers.add(observer);

    return this.eventObservers.size > sizeBefore;
  }

  public removeObserver(
    observer: MultiExchangeCoordinatorObserver,
  ): boolean {
    return this.eventObservers.delete(observer);
  }

  public addMetricsObserver(
    observer: MultiExchangeCoordinatorMetricsObserver,
  ): boolean {
    this.assertObserver(observer, "metricsObserver");

    const sizeBefore = this.metricsObservers.size;

    this.metricsObservers.add(observer);

    return this.metricsObservers.size > sizeBefore;
  }

  public removeMetricsObserver(
    observer: MultiExchangeCoordinatorMetricsObserver,
  ): boolean {
    return this.metricsObservers.delete(observer);
  }

  public addHealthObserver(
    observer: MultiExchangeCoordinatorHealthObserver,
  ): boolean {
    this.assertObserver(observer, "healthObserver");

    const sizeBefore = this.healthObservers.size;

    this.healthObservers.add(observer);

    return this.healthObservers.size > sizeBefore;
  }

  public removeHealthObserver(
    observer: MultiExchangeCoordinatorHealthObserver,
  ): boolean {
    return this.healthObservers.delete(observer);
  }

  public hasObserver(
    observer: MultiExchangeCoordinatorObserver,
  ): boolean {
    return this.eventObservers.has(observer);
  }

  public hasMetricsObserver(
    observer: MultiExchangeCoordinatorMetricsObserver,
  ): boolean {
    return this.metricsObservers.has(observer);
  }

  public hasHealthObserver(
    observer: MultiExchangeCoordinatorHealthObserver,
  ): boolean {
    return this.healthObservers.has(observer);
  }

  public getObserverCount(): number {
    return this.eventObservers.size;
  }

  public getMetricsObserverCount(): number {
    return this.metricsObservers.size;
  }

  public getHealthObserverCount(): number {
    return this.healthObservers.size;
  }

  public clearObservers(): void {
    this.eventObservers.clear();
  }

  public clearMetricsObservers(): void {
    this.metricsObservers.clear();
  }

  public clearHealthObservers(): void {
    this.healthObservers.clear();
  }

  public clearAll(): void {
    this.clearObservers();
    this.clearMetricsObservers();
    this.clearHealthObservers();
  }

  public async notifyEvent(
    event: MultiExchangeCoordinatorEvent,
  ): Promise<CoordinatorObserverNotificationResult> {
    const observers = Array.from(this.eventObservers);

    return this.notify(
      "EVENT_OBSERVER",
      observers,
      async (observer) => {
        await observer.onEvent(event);
      },
    );
  }

  public async notifyMetrics(
    metrics: MultiExchangeCoordinatorMetrics,
  ): Promise<CoordinatorObserverNotificationResult> {
    const observers = Array.from(this.metricsObservers);

    return this.notify(
      "METRICS_OBSERVER",
      observers,
      async (observer) => {
        await observer.onMetrics(metrics);
      },
    );
  }

  public async notifyHealthChanged(
    health: MultiExchangeCoordinatorHealthSnapshot,
  ): Promise<CoordinatorObserverNotificationResult> {
    const observers = Array.from(this.healthObservers);

    return this.notify(
      "HEALTH_OBSERVER",
      observers,
      async (observer) => {
        await observer.onHealthChanged(health);
      },
    );
  }

  private async notify<TObserver extends object>(
    category: CoordinatorObserverErrorCategory,
    observers: readonly TObserver[],
    notifier: (observer: TObserver) => Promise<void>,
  ): Promise<CoordinatorObserverNotificationResult> {
    const errors: CoordinatorObserverNotificationError[] = [];

    for (const observer of observers) {
      try {
        await notifier(observer);
      } catch (error: unknown) {
        errors.push(
          Object.freeze({
            category,
            observer,
            error,
          }),
        );
      }
    }

    const result = Object.freeze({
      notifiedObservers: observers.length,
      failedObservers: errors.length,
      errors: Object.freeze([...errors]),
    });

    if (
      this.throwOnObserverError &&
      errors.length > 0
    ) {
      throw new MultiExchangeCoordinatorObserverNotificationError(
        result.errors,
      );
    }

    return result;
  }

  private assertObserver(
    observer: object,
    fieldName: string,
  ): void {
    if (
      observer === null ||
      typeof observer !== "object"
    ) {
      throw new TypeError(
        `${fieldName} must be a non-null object.`,
      );
    }
  }
}

export function createMultiExchangeCoordinatorObserverRegistry(
  options: MultiExchangeCoordinatorObserverRegistryOptions = {},
): MultiExchangeCoordinatorObserverRegistry {
  return new MultiExchangeCoordinatorObserverRegistry(
    options,
  );
}