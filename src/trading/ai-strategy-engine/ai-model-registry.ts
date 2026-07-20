/**
 * QuantumTradeAI
 * Milestone 30 — AI Strategy Engine & Intelligent Signal Generation
 *
 * File 8: Production-grade deterministic AI model registry.
 */

import {
  EMPTY_AI_STRATEGY_METADATA,
  type AiModelDescriptor,
  type AiModelFamily,
  type AiModelLifecycleStatus,
  type AiModelProvider,
  type AiModelReference,
  type AiModelRuntimeConfiguration,
  type AiModelTask,
  type AiProviderHealth,
  type AiProviderSnapshot,
  type AiStrategyMarketType,
  type AiStrategyMetadata,
  type AiStrategyTimeframe,
  type AiStrategyTimestamp,
} from "./ai-strategy-contracts";
import {
  AiStrategyContractValidator,
  createAiStrategyContractValidator,
} from "./ai-strategy-validator";

export type AiModelRegistryEventType =
  | "PROVIDER_REGISTERED"
  | "PROVIDER_REPLACED"
  | "PROVIDER_UNREGISTERED"
  | "PROVIDER_HEALTH_UPDATED"
  | "MODEL_REGISTERED"
  | "MODEL_REPLACED"
  | "MODEL_STATUS_CHANGED"
  | "MODEL_UNREGISTERED"
  | "DEFAULT_MODEL_SET"
  | "DEFAULT_MODEL_CLEARED"
  | "STRATEGY_MODEL_BOUND"
  | "STRATEGY_MODEL_UNBOUND"
  | "PROVIDER_MODELS_SYNCHRONIZED";

export interface AiModelRegistryOptions {
  readonly allowProviderReplacement?: boolean;
  readonly allowModelReplacement?: boolean;
  readonly retainModelsAfterProviderRemoval?: boolean;
  readonly maximumAuditEntries?: number;
  readonly clock?: () => AiStrategyTimestamp;
  readonly idFactory?: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator?: AiStrategyContractValidator;
  readonly metadata?: AiStrategyMetadata;
}

export interface AiRegisteredProvider {
  readonly provider: AiModelProvider;
  readonly registeredAt: AiStrategyTimestamp;
  readonly updatedAt: AiStrategyTimestamp;
  readonly health?: AiProviderHealth;
  readonly metadata: AiStrategyMetadata;
}

export interface AiRegisteredModel {
  readonly descriptor: AiModelDescriptor;
  readonly registeredAt: AiStrategyTimestamp;
  readonly updatedAt: AiStrategyTimestamp;
  readonly source: "MANUAL" | "PROVIDER_DISCOVERY";
  readonly metadata: AiStrategyMetadata;
}

export interface AiStrategyModelBinding {
  readonly bindingId: string;
  readonly strategyId: string;
  readonly purpose: string;
  readonly model: AiModelReference;
  readonly runtimeConfiguration?: AiModelRuntimeConfiguration;
  readonly priority: number;
  readonly enabled: boolean;
  readonly createdAt: AiStrategyTimestamp;
  readonly updatedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface AiDefaultModelKey {
  readonly task: AiModelTask;
  readonly family?: AiModelFamily;
  readonly marketType?: AiStrategyMarketType;
  readonly timeframe?: AiStrategyTimeframe;
}

export interface AiDefaultModelAssignment {
  readonly key: AiDefaultModelKey;
  readonly model: AiModelReference;
  readonly assignedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRegistryQuery {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly families?: readonly AiModelFamily[];
  readonly tasks?: readonly AiModelTask[];
  readonly lifecycleStatuses?: readonly AiModelLifecycleStatus[];
  readonly marketType?: AiStrategyMarketType;
  readonly timeframe?: AiStrategyTimeframe;
  readonly deterministic?: boolean;
  readonly supportsSeed?: boolean;
  readonly requiredFeatures?: readonly string[];
  readonly includeUnavailableProviders?: boolean;
}

export interface AiModelResolutionRequest {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly strategyId?: string;
  readonly purpose?: string;
  readonly task?: AiModelTask;
  readonly preferredFamilies?: readonly AiModelFamily[];
  readonly marketType?: AiStrategyMarketType;
  readonly timeframe?: AiStrategyTimeframe;
  readonly requiredFeatures?: readonly string[];
  readonly requireDeterministic?: boolean;
  readonly requireSeedSupport?: boolean;
  readonly allowedStatuses?: readonly AiModelLifecycleStatus[];
}

export interface AiModelResolutionResult {
  readonly resolved: boolean;
  readonly model?: AiModelDescriptor;
  readonly runtimeConfiguration?: AiModelRuntimeConfiguration;
  readonly source:
    | "EXPLICIT"
    | "STRATEGY_BINDING"
    | "DEFAULT"
    | "BEST_MATCH"
    | "NONE";
  readonly score: number;
  readonly reasons: readonly string[];
  readonly resolvedAt: AiStrategyTimestamp;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRegistryAuditEntry {
  readonly auditId: string;
  readonly eventType: AiModelRegistryEventType;
  readonly timestamp: AiStrategyTimestamp;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly strategyId?: string;
  readonly entityId?: string;
  readonly message: string;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRegistryMetrics {
  readonly providerCount: number;
  readonly healthyProviderCount: number;
  readonly degradedProviderCount: number;
  readonly unavailableProviderCount: number;
  readonly modelCount: number;
  readonly activeModelCount: number;
  readonly readyModelCount: number;
  readonly degradedModelCount: number;
  readonly suspendedModelCount: number;
  readonly retiredModelCount: number;
  readonly strategyBindingCount: number;
  readonly defaultAssignmentCount: number;
  readonly auditEntryCount: number;
}

export interface AiModelRegistrySnapshot {
  readonly capturedAt: AiStrategyTimestamp;
  readonly providers: readonly AiProviderSnapshot[];
  readonly models: readonly AiModelDescriptor[];
  readonly bindings: readonly AiStrategyModelBinding[];
  readonly defaults: readonly AiDefaultModelAssignment[];
  readonly auditHistory: readonly AiModelRegistryAuditEntry[];
  readonly metrics: AiModelRegistryMetrics;
  readonly metadata: AiStrategyMetadata;
}

export interface AiModelRegistry {
  registerProvider(provider: AiModelProvider): AiProviderSnapshot;
  unregisterProvider(providerId: string): boolean;
  getProvider(providerId: string): AiModelProvider | undefined;
  getProviderSnapshot(providerId: string): AiProviderSnapshot | undefined;
  listProviders(): readonly AiProviderSnapshot[];
  updateProviderHealth(
    providerId: string,
    health: AiProviderHealth,
  ): AiProviderSnapshot;
  refreshProviderHealth(providerId: string): Promise<AiProviderSnapshot>;
  refreshAllProviderHealth(): Promise<readonly AiProviderSnapshot[]>;

  registerModel(
    descriptor: AiModelDescriptor,
    source?: AiRegisteredModel["source"],
  ): AiModelDescriptor;
  unregisterModel(reference: AiModelReference): boolean;
  changeModelStatus(
    reference: AiModelReference,
    status: AiModelLifecycleStatus,
  ): AiModelDescriptor;
  getModel(reference: AiModelReference): AiModelDescriptor | undefined;
  queryModels(query?: AiModelRegistryQuery): readonly AiModelDescriptor[];
  synchronizeProviderModels(
    providerId: string,
  ): Promise<readonly AiModelDescriptor[]>;

  setDefaultModel(
    key: AiDefaultModelKey,
    model: AiModelReference,
    metadata?: AiStrategyMetadata,
  ): AiDefaultModelAssignment;
  clearDefaultModel(key: AiDefaultModelKey): boolean;
  listDefaultModels(): readonly AiDefaultModelAssignment[];

  bindStrategyModel(
    binding: Omit<
      AiStrategyModelBinding,
      "bindingId" | "createdAt" | "updatedAt"
    > & { readonly bindingId?: string },
  ): AiStrategyModelBinding;
  unbindStrategyModel(
    strategyId: string,
    purpose: string,
    model?: AiModelReference,
  ): number;
  listStrategyBindings(
    strategyId?: string,
    purpose?: string,
  ): readonly AiStrategyModelBinding[];

  resolveModel(
    request: AiModelResolutionRequest,
  ): AiModelResolutionResult;
  snapshot(): AiModelRegistrySnapshot;
}

interface ResolvedOptions {
  readonly allowProviderReplacement: boolean;
  readonly allowModelReplacement: boolean;
  readonly retainModelsAfterProviderRemoval: boolean;
  readonly maximumAuditEntries: number;
  readonly clock: () => AiStrategyTimestamp;
  readonly idFactory: (
    prefix: string,
    timestamp: AiStrategyTimestamp,
    sequence: number,
  ) => string;
  readonly validator: AiStrategyContractValidator;
  readonly metadata: AiStrategyMetadata;
}

const DEFAULT_MAXIMUM_AUDIT_ENTRIES = 20_000;
const DEFAULT_ALLOWED_RESOLUTION_STATUSES: readonly AiModelLifecycleStatus[] =
  Object.freeze(["ACTIVE", "READY"]);

function defaultClock(): AiStrategyTimestamp {
  return Date.now();
}

function defaultIdFactory(
  prefix: string,
  timestamp: AiStrategyTimestamp,
  sequence: number,
): string {
  return `${prefix}-${timestamp}-${sequence}`;
}

function assertNonEmptyString(value: string, name: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function cloneMetadata(
  metadata: AiStrategyMetadata | undefined,
): AiStrategyMetadata {
  if (metadata === undefined) {
    return EMPTY_AI_STRATEGY_METADATA;
  }

  const output: Record<
    string,
    string | number | boolean | null | readonly (
      | string
      | number
      | boolean
      | null
    )[]
  > = {};

  for (const [key, value] of Object.entries(metadata)) {
    output[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }

  return Object.freeze(output);
}

function cloneHealth(
  health: AiProviderHealth | undefined,
): AiProviderHealth | undefined {
  return health === undefined
    ? undefined
    : Object.freeze({
        ...health,
        metadata: cloneMetadata(health.metadata),
      });
}

function cloneDescriptor(
  descriptor: AiModelDescriptor,
): AiModelDescriptor {
  return Object.freeze({
    ...descriptor,
    supportedMarketTypes: Object.freeze([
      ...descriptor.supportedMarketTypes,
    ]),
    supportedTimeframes: Object.freeze([
      ...descriptor.supportedTimeframes,
    ]),
    requiredFeatures: Object.freeze([...descriptor.requiredFeatures]),
    optionalFeatures: Object.freeze([...descriptor.optionalFeatures]),
    metadata: cloneMetadata(descriptor.metadata),
  });
}

function cloneRuntimeConfiguration(
  configuration: AiModelRuntimeConfiguration | undefined,
): AiModelRuntimeConfiguration | undefined {
  return configuration === undefined
    ? undefined
    : Object.freeze({
        ...configuration,
        parameters: Object.freeze({ ...configuration.parameters }),
        metadata: cloneMetadata(configuration.metadata),
      });
}

function cloneReference(reference: AiModelReference): AiModelReference {
  return Object.freeze({ ...reference });
}

function cloneBinding(
  binding: AiStrategyModelBinding,
): AiStrategyModelBinding {
  return Object.freeze({
    ...binding,
    model: cloneReference(binding.model),
    runtimeConfiguration: cloneRuntimeConfiguration(
      binding.runtimeConfiguration,
    ),
    metadata: cloneMetadata(binding.metadata),
  });
}

function cloneDefaultKey(key: AiDefaultModelKey): AiDefaultModelKey {
  return Object.freeze({ ...key });
}

function cloneDefaultAssignment(
  assignment: AiDefaultModelAssignment,
): AiDefaultModelAssignment {
  return Object.freeze({
    ...assignment,
    key: cloneDefaultKey(assignment.key),
    model: cloneReference(assignment.model),
    metadata: cloneMetadata(assignment.metadata),
  });
}

function cloneAuditEntry(
  entry: AiModelRegistryAuditEntry,
): AiModelRegistryAuditEntry {
  return Object.freeze({
    ...entry,
    metadata: cloneMetadata(entry.metadata),
  });
}

function modelKey(reference: AiModelReference): string {
  return [
    reference.providerId,
    reference.modelId,
    reference.modelVersion,
  ].join("::");
}

function descriptorKey(descriptor: AiModelDescriptor): string {
  return modelKey(descriptor);
}

function defaultKey(key: AiDefaultModelKey): string {
  return [
    key.task,
    key.family ?? "*",
    key.marketType ?? "*",
    key.timeframe ?? "*",
  ].join("::");
}

function compareDescriptors(
  left: AiModelDescriptor,
  right: AiModelDescriptor,
): number {
  const provider = left.providerId.localeCompare(right.providerId);
  if (provider !== 0) {
    return provider;
  }
  const model = left.modelId.localeCompare(right.modelId);
  if (model !== 0) {
    return model;
  }
  return left.modelVersion.localeCompare(right.modelVersion);
}

function compareBindings(
  left: AiStrategyModelBinding,
  right: AiStrategyModelBinding,
): number {
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  const strategy = left.strategyId.localeCompare(right.strategyId);
  if (strategy !== 0) {
    return strategy;
  }
  const purpose = left.purpose.localeCompare(right.purpose);
  if (purpose !== 0) {
    return purpose;
  }
  return left.bindingId.localeCompare(right.bindingId);
}

function includesEvery(
  available: readonly string[],
  required: readonly string[] | undefined,
): boolean {
  return (
    required === undefined ||
    required.every((entry) => available.includes(entry))
  );
}

function exactReference(
  descriptor: AiModelDescriptor,
  request: {
    readonly providerId?: string;
    readonly modelId?: string;
    readonly modelVersion?: string;
  },
): boolean {
  return (
    (request.providerId === undefined ||
      descriptor.providerId === request.providerId) &&
    (request.modelId === undefined ||
      descriptor.modelId === request.modelId) &&
    (request.modelVersion === undefined ||
      descriptor.modelVersion === request.modelVersion)
  );
}

export class DeterministicAiModelRegistry
  implements AiModelRegistry
{
  private readonly options: ResolvedOptions;
  private readonly providers = new Map<string, AiRegisteredProvider>();
  private readonly models = new Map<string, AiRegisteredModel>();
  private readonly defaults = new Map<
    string,
    AiDefaultModelAssignment
  >();
  private readonly bindings = new Map<
    string,
    AiStrategyModelBinding
  >();
  private readonly auditHistory: AiModelRegistryAuditEntry[] = [];
  private sequence = 0;

  public constructor(options: AiModelRegistryOptions = {}) {
    const maximumAuditEntries =
      options.maximumAuditEntries ?? DEFAULT_MAXIMUM_AUDIT_ENTRIES;
    assertPositiveInteger(maximumAuditEntries, "maximumAuditEntries");

    this.options = Object.freeze({
      allowProviderReplacement:
        options.allowProviderReplacement ?? false,
      allowModelReplacement: options.allowModelReplacement ?? true,
      retainModelsAfterProviderRemoval:
        options.retainModelsAfterProviderRemoval ?? false,
      maximumAuditEntries,
      clock: options.clock ?? defaultClock,
      idFactory: options.idFactory ?? defaultIdFactory,
      validator:
        options.validator ?? createAiStrategyContractValidator(),
      metadata: cloneMetadata(options.metadata),
    });
  }

  public registerProvider(
    provider: AiModelProvider,
  ): AiProviderSnapshot {
    this.validateProvider(provider);
    const timestamp = this.options.clock();
    const existing = this.providers.get(provider.providerId);

    if (
      existing !== undefined &&
      !this.options.allowProviderReplacement
    ) {
      throw new Error(
        `AI model provider '${provider.providerId}' is already registered.`,
      );
    }

    const record: AiRegisteredProvider = Object.freeze({
      provider,
      registeredAt: existing?.registeredAt ?? timestamp,
      updatedAt: timestamp,
      health: cloneHealth(existing?.health),
      metadata: cloneMetadata(provider.metadata),
    });
    this.providers.set(provider.providerId, record);

    this.audit(
      existing === undefined
        ? "PROVIDER_REGISTERED"
        : "PROVIDER_REPLACED",
      {
        providerId: provider.providerId,
        message:
          existing === undefined
            ? `Registered AI model provider '${provider.providerId}'.`
            : `Replaced AI model provider '${provider.providerId}'.`,
      },
    );

    return this.toProviderSnapshot(record);
  }

  public unregisterProvider(providerId: string): boolean {
    assertNonEmptyString(providerId, "providerId");
    const removed = this.providers.delete(providerId);

    if (!removed) {
      return false;
    }

    if (!this.options.retainModelsAfterProviderRemoval) {
      for (const [key, model] of this.models) {
        if (model.descriptor.providerId === providerId) {
          this.models.delete(key);
          this.removeReferencesToModel(model.descriptor);
        }
      }
    }

    this.audit("PROVIDER_UNREGISTERED", {
      providerId,
      message: `Unregistered AI model provider '${providerId}'.`,
    });
    return true;
  }

  public getProvider(
    providerId: string,
  ): AiModelProvider | undefined {
    assertNonEmptyString(providerId, "providerId");
    return this.providers.get(providerId)?.provider;
  }

  public getProviderSnapshot(
    providerId: string,
  ): AiProviderSnapshot | undefined {
    assertNonEmptyString(providerId, "providerId");
    const record = this.providers.get(providerId);
    return record === undefined
      ? undefined
      : this.toProviderSnapshot(record);
  }

  public listProviders(): readonly AiProviderSnapshot[] {
    return Object.freeze(
      [...this.providers.values()]
        .sort((left, right) =>
          left.provider.providerId.localeCompare(
            right.provider.providerId,
          ),
        )
        .map((record) => this.toProviderSnapshot(record)),
    );
  }

  public updateProviderHealth(
    providerId: string,
    health: AiProviderHealth,
  ): AiProviderSnapshot {
    assertNonEmptyString(providerId, "providerId");
    const current = this.requireProviderRecord(providerId);
    this.validateProviderHealth(providerId, health);
    const timestamp = this.options.clock();

    const updated: AiRegisteredProvider = Object.freeze({
      ...current,
      updatedAt: timestamp,
      health: cloneHealth(health),
    });
    this.providers.set(providerId, updated);

    this.audit("PROVIDER_HEALTH_UPDATED", {
      providerId,
      message: `Provider '${providerId}' health updated to '${health.status}'.`,
      metadata: {
        healthStatus: health.status,
        checkedAt: health.checkedAt,
      },
    });

    return this.toProviderSnapshot(updated);
  }

  public async refreshProviderHealth(
    providerId: string,
  ): Promise<AiProviderSnapshot> {
    const record = this.requireProviderRecord(providerId);
    const timestamp = this.options.clock();
    const health =
      record.provider.healthCheck === undefined
        ? Object.freeze({
            providerId,
            status: "HEALTHY" as const,
            checkedAt: timestamp,
            message:
              "Provider does not expose a health check; registration presence was used.",
            metadata: EMPTY_AI_STRATEGY_METADATA,
          })
        : await record.provider.healthCheck();

    return this.updateProviderHealth(providerId, health);
  }

  public async refreshAllProviderHealth(): Promise<
    readonly AiProviderSnapshot[]
  > {
    const providerIds = [...this.providers.keys()].sort();
    const snapshots = await Promise.all(
      providerIds.map((providerId) =>
        this.refreshProviderHealth(providerId),
      ),
    );
    return Object.freeze(snapshots);
  }

  public registerModel(
    descriptor: AiModelDescriptor,
    source: AiRegisteredModel["source"] = "MANUAL",
  ): AiModelDescriptor {
    this.validateDescriptor(descriptor);

    if (!this.providers.has(descriptor.providerId)) {
      throw new Error(
        `Cannot register model for unknown provider '${descriptor.providerId}'.`,
      );
    }

    const key = descriptorKey(descriptor);
    const existing = this.models.get(key);
    if (
      existing !== undefined &&
      !this.options.allowModelReplacement
    ) {
      throw new Error(
        `AI model '${key}' is already registered.`,
      );
    }

    const timestamp = this.options.clock();
    const cloned = cloneDescriptor(descriptor);
    this.models.set(
      key,
      Object.freeze({
        descriptor: cloned,
        registeredAt: existing?.registeredAt ?? timestamp,
        updatedAt: timestamp,
        source,
        metadata: cloneMetadata(descriptor.metadata),
      }),
    );

    this.audit(
      existing === undefined ? "MODEL_REGISTERED" : "MODEL_REPLACED",
      {
        providerId: descriptor.providerId,
        modelId: descriptor.modelId,
        modelVersion: descriptor.modelVersion,
        entityId: key,
        message:
          existing === undefined
            ? `Registered AI model '${key}'.`
            : `Replaced AI model '${key}'.`,
        metadata: { source },
      },
    );

    return cloned;
  }

  public unregisterModel(reference: AiModelReference): boolean {
    this.validateReference(reference);
    const key = modelKey(reference);
    const existing = this.models.get(key);
    if (existing === undefined) {
      return false;
    }

    this.models.delete(key);
    this.removeReferencesToModel(existing.descriptor);
    this.audit("MODEL_UNREGISTERED", {
      providerId: reference.providerId,
      modelId: reference.modelId,
      modelVersion: reference.modelVersion,
      entityId: key,
      message: `Unregistered AI model '${key}'.`,
    });
    return true;
  }

  public changeModelStatus(
    reference: AiModelReference,
    status: AiModelLifecycleStatus,
  ): AiModelDescriptor {
    const key = modelKey(reference);
    const existing = this.requireModelRecord(reference);
    const descriptor = cloneDescriptor({
      ...existing.descriptor,
      lifecycleStatus: status,
    });
    this.models.set(
      key,
      Object.freeze({
        ...existing,
        descriptor,
        updatedAt: this.options.clock(),
      }),
    );

    this.audit("MODEL_STATUS_CHANGED", {
      providerId: reference.providerId,
      modelId: reference.modelId,
      modelVersion: reference.modelVersion,
      entityId: key,
      message: `Changed AI model '${key}' status to '${status}'.`,
      metadata: {
        previousStatus: existing.descriptor.lifecycleStatus,
        newStatus: status,
      },
    });

    return descriptor;
  }

  public getModel(
    reference: AiModelReference,
  ): AiModelDescriptor | undefined {
    this.validateReference(reference);
    return this.models.get(modelKey(reference))?.descriptor;
  }

  public queryModels(
    query: AiModelRegistryQuery = {},
  ): readonly AiModelDescriptor[] {
    const models = [...this.models.values()]
      .map((entry) => entry.descriptor)
      .filter((descriptor) => {
        if (!exactReference(descriptor, query)) {
          return false;
        }
        if (
          query.families !== undefined &&
          !query.families.includes(descriptor.family)
        ) {
          return false;
        }
        if (
          query.tasks !== undefined &&
          !query.tasks.includes(descriptor.task)
        ) {
          return false;
        }
        if (
          query.lifecycleStatuses !== undefined &&
          !query.lifecycleStatuses.includes(
            descriptor.lifecycleStatus,
          )
        ) {
          return false;
        }
        if (
          query.marketType !== undefined &&
          !descriptor.supportedMarketTypes.includes(query.marketType)
        ) {
          return false;
        }
        if (
          query.timeframe !== undefined &&
          !descriptor.supportedTimeframes.includes(query.timeframe)
        ) {
          return false;
        }
        if (
          query.deterministic !== undefined &&
          descriptor.deterministic !== query.deterministic
        ) {
          return false;
        }
        if (
          query.supportsSeed !== undefined &&
          descriptor.supportsSeed !== query.supportsSeed
        ) {
          return false;
        }
        if (
          !includesEvery(
            [
              ...descriptor.requiredFeatures,
              ...descriptor.optionalFeatures,
            ],
            query.requiredFeatures,
          )
        ) {
          return false;
        }
        if (
          query.includeUnavailableProviders !== true &&
          !this.isProviderAvailable(descriptor.providerId)
        ) {
          return false;
        }
        return true;
      })
      .sort(compareDescriptors);

    return Object.freeze(models);
  }

  public async synchronizeProviderModels(
    providerId: string,
  ): Promise<readonly AiModelDescriptor[]> {
    const provider = this.requireProviderRecord(providerId).provider;
    const discovered = await provider.listModels();
    const discoveredKeys = new Set<string>();

    for (const descriptor of discovered) {
      if (descriptor.providerId !== providerId) {
        throw new Error(
          `Provider '${providerId}' returned model '${descriptor.modelId}' with mismatched providerId '${descriptor.providerId}'.`,
        );
      }
      const registered = this.registerModel(
        descriptor,
        "PROVIDER_DISCOVERY",
      );
      discoveredKeys.add(descriptorKey(registered));
    }

    for (const [key, record] of this.models) {
      if (
        record.descriptor.providerId === providerId &&
        record.source === "PROVIDER_DISCOVERY" &&
        !discoveredKeys.has(key)
      ) {
        this.models.delete(key);
        this.removeReferencesToModel(record.descriptor);
      }
    }

    this.audit("PROVIDER_MODELS_SYNCHRONIZED", {
      providerId,
      message: `Synchronized ${discovered.length} models from provider '${providerId}'.`,
      metadata: { discoveredModelCount: discovered.length },
    });

    return this.queryModels({
      providerId,
      includeUnavailableProviders: true,
    });
  }

  public setDefaultModel(
    key: AiDefaultModelKey,
    model: AiModelReference,
    metadata?: AiStrategyMetadata,
  ): AiDefaultModelAssignment {
    this.validateDefaultKey(key);
    const descriptor = this.requireModelRecord(model).descriptor;
    this.ensureDefaultCompatibility(key, descriptor);
    const timestamp = this.options.clock();

    const assignment = cloneDefaultAssignment({
      key: cloneDefaultKey(key),
      model: cloneReference(model),
      assignedAt: timestamp,
      metadata: cloneMetadata(metadata),
    });
    this.defaults.set(defaultKey(key), assignment);

    this.audit("DEFAULT_MODEL_SET", {
      providerId: model.providerId,
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      entityId: defaultKey(key),
      message: `Assigned '${modelKey(model)}' as default model for '${defaultKey(key)}'.`,
    });

    return assignment;
  }

  public clearDefaultModel(key: AiDefaultModelKey): boolean {
    this.validateDefaultKey(key);
    const removed = this.defaults.delete(defaultKey(key));
    if (removed) {
      this.audit("DEFAULT_MODEL_CLEARED", {
        entityId: defaultKey(key),
        message: `Cleared default model for '${defaultKey(key)}'.`,
      });
    }
    return removed;
  }

  public listDefaultModels(): readonly AiDefaultModelAssignment[] {
    return Object.freeze(
      [...this.defaults.values()]
        .sort((left, right) =>
          defaultKey(left.key).localeCompare(defaultKey(right.key)),
        )
        .map(cloneDefaultAssignment),
    );
  }

  public bindStrategyModel(
    binding: Omit<
      AiStrategyModelBinding,
      "bindingId" | "createdAt" | "updatedAt"
    > & { readonly bindingId?: string },
  ): AiStrategyModelBinding {
    assertNonEmptyString(binding.strategyId, "binding.strategyId");
    assertNonEmptyString(binding.purpose, "binding.purpose");
    if (!Number.isInteger(binding.priority)) {
      throw new RangeError("binding.priority must be an integer.");
    }
    this.requireModelRecord(binding.model);

    if (binding.runtimeConfiguration !== undefined) {
      const validation =
        this.options.validator.validateModelRuntimeConfiguration(
          binding.runtimeConfiguration,
        );
      this.options.validator.assertValid(
        validation,
        "Strategy model runtime configuration validation failed.",
      );
      this.ensureRuntimeMatchesReference(
        binding.runtimeConfiguration,
        binding.model,
      );
    }

    const timestamp = this.options.clock();
    const bindingId =
      binding.bindingId ??
      this.nextId("strategy-model-binding", timestamp);
    assertNonEmptyString(bindingId, "binding.bindingId");
    const existing = this.bindings.get(bindingId);

    const registered = cloneBinding({
      ...binding,
      bindingId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      metadata: cloneMetadata(binding.metadata),
    });
    this.bindings.set(bindingId, registered);

    this.audit("STRATEGY_MODEL_BOUND", {
      providerId: binding.model.providerId,
      modelId: binding.model.modelId,
      modelVersion: binding.model.modelVersion,
      strategyId: binding.strategyId,
      entityId: bindingId,
      message: `Bound model '${modelKey(binding.model)}' to strategy '${binding.strategyId}' for '${binding.purpose}'.`,
    });

    return registered;
  }

  public unbindStrategyModel(
    strategyId: string,
    purpose: string,
    model?: AiModelReference,
  ): number {
    assertNonEmptyString(strategyId, "strategyId");
    assertNonEmptyString(purpose, "purpose");
    if (model !== undefined) {
      this.validateReference(model);
    }

    let removed = 0;
    for (const [bindingId, binding] of this.bindings) {
      const modelMatches =
        model === undefined ||
        modelKey(binding.model) === modelKey(model);
      if (
        binding.strategyId === strategyId &&
        binding.purpose === purpose &&
        modelMatches
      ) {
        this.bindings.delete(bindingId);
        removed += 1;
        this.audit("STRATEGY_MODEL_UNBOUND", {
          providerId: binding.model.providerId,
          modelId: binding.model.modelId,
          modelVersion: binding.model.modelVersion,
          strategyId,
          entityId: bindingId,
          message: `Removed strategy model binding '${bindingId}'.`,
        });
      }
    }
    return removed;
  }

  public listStrategyBindings(
    strategyId?: string,
    purpose?: string,
  ): readonly AiStrategyModelBinding[] {
    return Object.freeze(
      [...this.bindings.values()]
        .filter(
          (binding) =>
            (strategyId === undefined ||
              binding.strategyId === strategyId) &&
            (purpose === undefined ||
              binding.purpose === purpose),
        )
        .sort(compareBindings)
        .map(cloneBinding),
    );
  }

  public resolveModel(
    request: AiModelResolutionRequest,
  ): AiModelResolutionResult {
    const resolvedAt = this.options.clock();
    const reasons: string[] = [];
    const allowedStatuses =
      request.allowedStatuses ?? DEFAULT_ALLOWED_RESOLUTION_STATUSES;

    if (
      request.providerId !== undefined ||
      request.modelId !== undefined ||
      request.modelVersion !== undefined
    ) {
      const explicit = this.findBestCandidate(
        this.queryModels({
          providerId: request.providerId,
          modelId: request.modelId,
          modelVersion: request.modelVersion,
          includeUnavailableProviders: false,
        }),
        request,
        allowedStatuses,
      );
      if (explicit !== undefined) {
        reasons.push("Resolved from the explicit model selector.");
        return this.resolution(
          explicit,
          undefined,
          "EXPLICIT",
          this.scoreModel(explicit, request),
          reasons,
          resolvedAt,
        );
      }
      reasons.push("No eligible model matched the explicit selector.");
    }

    if (request.strategyId !== undefined) {
      const bindings = this.listStrategyBindings(
        request.strategyId,
        request.purpose,
      ).filter((binding) => binding.enabled);

      for (const binding of bindings) {
        const descriptor = this.getModel(binding.model);
        if (
          descriptor !== undefined &&
          this.modelEligible(
            descriptor,
            request,
            allowedStatuses,
          )
        ) {
          reasons.push(
            `Resolved from strategy binding '${binding.bindingId}'.`,
          );
          return this.resolution(
            descriptor,
            binding.runtimeConfiguration,
            "STRATEGY_BINDING",
            1_000_000 + binding.priority,
            reasons,
            resolvedAt,
          );
        }
      }
      reasons.push("No eligible strategy binding was found.");
    }

    if (request.task !== undefined) {
      const assignments = this.matchingDefaults(request);
      for (const assignment of assignments) {
        const descriptor = this.getModel(assignment.model);
        if (
          descriptor !== undefined &&
          this.modelEligible(
            descriptor,
            request,
            allowedStatuses,
          )
        ) {
          reasons.push(
            `Resolved from default assignment '${defaultKey(assignment.key)}'.`,
          );
          return this.resolution(
            descriptor,
            undefined,
            "DEFAULT",
            100_000 + this.defaultSpecificity(assignment.key),
            reasons,
            resolvedAt,
          );
        }
      }
      reasons.push("No eligible default assignment was found.");
    }

    const candidate = this.findBestCandidate(
      this.queryModels({
        tasks:
          request.task === undefined
            ? undefined
            : [request.task],
        marketType: request.marketType,
        timeframe: request.timeframe,
        requiredFeatures: request.requiredFeatures,
        includeUnavailableProviders: false,
      }),
      request,
      allowedStatuses,
    );

    if (candidate !== undefined) {
      reasons.push("Resolved from deterministic best-match scoring.");
      return this.resolution(
        candidate,
        undefined,
        "BEST_MATCH",
        this.scoreModel(candidate, request),
        reasons,
        resolvedAt,
      );
    }

    reasons.push("No eligible AI model could be resolved.");
    return Object.freeze({
      resolved: false,
      source: "NONE",
      score: 0,
      reasons: Object.freeze(reasons),
      resolvedAt,
      metadata: this.options.metadata,
    });
  }

  public snapshot(): AiModelRegistrySnapshot {
    const providers = this.listProviders();
    const models = this.queryModels({
      includeUnavailableProviders: true,
    });
    const bindings = this.listStrategyBindings();
    const defaults = this.listDefaultModels();
    const auditHistory = Object.freeze(
      this.auditHistory.map(cloneAuditEntry),
    );

    return Object.freeze({
      capturedAt: this.options.clock(),
      providers,
      models,
      bindings,
      defaults,
      auditHistory,
      metrics: this.calculateMetrics(
        providers,
        models,
        bindings,
        defaults,
      ),
      metadata: this.options.metadata,
    });
  }

  private validateProvider(provider: AiModelProvider): void {
    assertNonEmptyString(provider.providerId, "provider.providerId");
    assertNonEmptyString(provider.displayName, "provider.displayName");
    if (typeof provider.listModels !== "function") {
      throw new TypeError("provider.listModels must be a function.");
    }
    if (typeof provider.infer !== "function") {
      throw new TypeError("provider.infer must be a function.");
    }
    if (
      provider.healthCheck !== undefined &&
      typeof provider.healthCheck !== "function"
    ) {
      throw new TypeError(
        "provider.healthCheck must be a function when provided.",
      );
    }
  }

  private validateProviderHealth(
    providerId: string,
    health: AiProviderHealth,
  ): void {
    if (health.providerId !== providerId) {
      throw new Error(
        `Provider health providerId '${health.providerId}' does not match '${providerId}'.`,
      );
    }
    if (!Number.isFinite(health.checkedAt) || health.checkedAt < 0) {
      throw new RangeError(
        "health.checkedAt must be a non-negative finite timestamp.",
      );
    }
    if (
      health.latencyMs !== undefined &&
      (!Number.isFinite(health.latencyMs) || health.latencyMs < 0)
    ) {
      throw new RangeError(
        "health.latencyMs must be non-negative when provided.",
      );
    }
  }

  private validateDescriptor(
    descriptor: AiModelDescriptor,
  ): void {
    const validation =
      this.options.validator.validateModelDescriptor(descriptor);
    this.options.validator.assertValid(
      validation,
      "AI model descriptor validation failed.",
    );
  }

  private validateReference(reference: AiModelReference): void {
    assertNonEmptyString(reference.providerId, "reference.providerId");
    assertNonEmptyString(reference.modelId, "reference.modelId");
    assertNonEmptyString(
      reference.modelVersion,
      "reference.modelVersion",
    );
  }

  private validateDefaultKey(key: AiDefaultModelKey): void {
    assertNonEmptyString(key.task, "key.task");
  }

  private requireProviderRecord(
    providerId: string,
  ): AiRegisteredProvider {
    assertNonEmptyString(providerId, "providerId");
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      throw new Error(
        `AI model provider '${providerId}' is not registered.`,
      );
    }
    return provider;
  }

  private requireModelRecord(
    reference: AiModelReference,
  ): AiRegisteredModel {
    this.validateReference(reference);
    const record = this.models.get(modelKey(reference));
    if (record === undefined) {
      throw new Error(
        `AI model '${modelKey(reference)}' is not registered.`,
      );
    }
    return record;
  }

  private toProviderSnapshot(
    record: AiRegisteredProvider,
  ): AiProviderSnapshot {
    const modelCount = [...this.models.values()].filter(
      (model) =>
        model.descriptor.providerId === record.provider.providerId,
    ).length;

    return Object.freeze({
      providerId: record.provider.providerId,
      displayName: record.provider.displayName,
      registeredAt: record.registeredAt,
      modelCount,
      health: cloneHealth(record.health),
      metadata: cloneMetadata(record.metadata),
    });
  }

  private isProviderAvailable(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    return (
      provider !== undefined &&
      provider.health?.status !== "UNAVAILABLE"
    );
  }

  private ensureDefaultCompatibility(
    key: AiDefaultModelKey,
    descriptor: AiModelDescriptor,
  ): void {
    if (descriptor.task !== key.task) {
      throw new Error(
        `Model task '${descriptor.task}' does not match default task '${key.task}'.`,
      );
    }
    if (
      key.family !== undefined &&
      descriptor.family !== key.family
    ) {
      throw new Error(
        `Model family '${descriptor.family}' does not match default family '${key.family}'.`,
      );
    }
    if (
      key.marketType !== undefined &&
      !descriptor.supportedMarketTypes.includes(key.marketType)
    ) {
      throw new Error(
        `Model does not support market type '${key.marketType}'.`,
      );
    }
    if (
      key.timeframe !== undefined &&
      !descriptor.supportedTimeframes.includes(key.timeframe)
    ) {
      throw new Error(
        `Model does not support timeframe '${key.timeframe}'.`,
      );
    }
  }

  private ensureRuntimeMatchesReference(
    runtime: AiModelRuntimeConfiguration,
    reference: AiModelReference,
  ): void {
    if (
      runtime.providerId !== reference.providerId ||
      runtime.modelId !== reference.modelId ||
      (runtime.modelVersion !== undefined &&
        runtime.modelVersion !== reference.modelVersion)
    ) {
      throw new Error(
        "Runtime configuration does not match the strategy model reference.",
      );
    }
  }

  private removeReferencesToModel(
    descriptor: AiModelDescriptor,
  ): void {
    const key = descriptorKey(descriptor);
    for (const [assignmentKey, assignment] of this.defaults) {
      if (modelKey(assignment.model) === key) {
        this.defaults.delete(assignmentKey);
      }
    }
    for (const [bindingId, binding] of this.bindings) {
      if (modelKey(binding.model) === key) {
        this.bindings.delete(bindingId);
      }
    }
  }

  private matchingDefaults(
    request: AiModelResolutionRequest,
  ): readonly AiDefaultModelAssignment[] {
    return [...this.defaults.values()]
      .filter((assignment) => {
        const key = assignment.key;
        return (
          key.task === request.task &&
          (key.marketType === undefined ||
            key.marketType === request.marketType) &&
          (key.timeframe === undefined ||
            key.timeframe === request.timeframe) &&
          (key.family === undefined ||
            request.preferredFamilies === undefined ||
            request.preferredFamilies.includes(key.family))
        );
      })
      .sort((left, right) => {
        const specificity =
          this.defaultSpecificity(right.key) -
          this.defaultSpecificity(left.key);
        return specificity !== 0
          ? specificity
          : defaultKey(left.key).localeCompare(defaultKey(right.key));
      });
  }

  private defaultSpecificity(key: AiDefaultModelKey): number {
    return (
      (key.family === undefined ? 0 : 1) +
      (key.marketType === undefined ? 0 : 1) +
      (key.timeframe === undefined ? 0 : 1)
    );
  }

  private findBestCandidate(
    candidates: readonly AiModelDescriptor[],
    request: AiModelResolutionRequest,
    allowedStatuses: readonly AiModelLifecycleStatus[],
  ): AiModelDescriptor | undefined {
    return candidates
      .filter((descriptor) =>
        this.modelEligible(descriptor, request, allowedStatuses),
      )
      .sort((left, right) => {
        const score =
          this.scoreModel(right, request) -
          this.scoreModel(left, request);
        return score !== 0
          ? score
          : compareDescriptors(left, right);
      })[0];
  }

  private modelEligible(
    descriptor: AiModelDescriptor,
    request: AiModelResolutionRequest,
    allowedStatuses: readonly AiModelLifecycleStatus[],
  ): boolean {
    return (
      allowedStatuses.includes(descriptor.lifecycleStatus) &&
      this.isProviderAvailable(descriptor.providerId) &&
      (request.task === undefined ||
        descriptor.task === request.task) &&
      (request.marketType === undefined ||
        descriptor.supportedMarketTypes.includes(
          request.marketType,
        )) &&
      (request.timeframe === undefined ||
        descriptor.supportedTimeframes.includes(
          request.timeframe,
        )) &&
      (request.requireDeterministic !== true ||
        descriptor.deterministic) &&
      (request.requireSeedSupport !== true ||
        descriptor.supportsSeed) &&
      includesEvery(
        [
          ...descriptor.requiredFeatures,
          ...descriptor.optionalFeatures,
        ],
        request.requiredFeatures,
      )
    );
  }

  private scoreModel(
    descriptor: AiModelDescriptor,
    request: AiModelResolutionRequest,
  ): number {
    let score = 0;

    if (descriptor.lifecycleStatus === "ACTIVE") {
      score += 1_000;
    } else if (descriptor.lifecycleStatus === "READY") {
      score += 800;
    } else if (descriptor.lifecycleStatus === "DEGRADED") {
      score += 100;
    }
    if (descriptor.deterministic) {
      score += 100;
    }
    if (descriptor.supportsSeed) {
      score += 50;
    }
    if (descriptor.supportsBatching) {
      score += 10;
    }
    if (request.task === descriptor.task) {
      score += 500;
    }
    if (
      request.preferredFamilies !== undefined
    ) {
      const familyIndex =
        request.preferredFamilies.indexOf(descriptor.family);
      if (familyIndex >= 0) {
        score += 300 - familyIndex;
      }
    }
    if (
      request.marketType !== undefined &&
      descriptor.supportedMarketTypes.includes(request.marketType)
    ) {
      score += 200;
    }
    if (
      request.timeframe !== undefined &&
      descriptor.supportedTimeframes.includes(request.timeframe)
    ) {
      score += 200;
    }
    if (request.requiredFeatures !== undefined) {
      score += request.requiredFeatures.length * 5;
    }

    return score;
  }

  private resolution(
    descriptor: AiModelDescriptor,
    runtimeConfiguration: AiModelRuntimeConfiguration | undefined,
    source: AiModelResolutionResult["source"],
    score: number,
    reasons: readonly string[],
    resolvedAt: AiStrategyTimestamp,
  ): AiModelResolutionResult {
    return Object.freeze({
      resolved: true,
      model: cloneDescriptor(descriptor),
      runtimeConfiguration: cloneRuntimeConfiguration(
        runtimeConfiguration,
      ),
      source,
      score,
      reasons: Object.freeze([...reasons]),
      resolvedAt,
      metadata: this.options.metadata,
    });
  }

  private calculateMetrics(
    providers: readonly AiProviderSnapshot[],
    models: readonly AiModelDescriptor[],
    bindings: readonly AiStrategyModelBinding[],
    defaults: readonly AiDefaultModelAssignment[],
  ): AiModelRegistryMetrics {
    return Object.freeze({
      providerCount: providers.length,
      healthyProviderCount: providers.filter(
        (provider) => provider.health?.status === "HEALTHY",
      ).length,
      degradedProviderCount: providers.filter(
        (provider) => provider.health?.status === "DEGRADED",
      ).length,
      unavailableProviderCount: providers.filter(
        (provider) => provider.health?.status === "UNAVAILABLE",
      ).length,
      modelCount: models.length,
      activeModelCount: models.filter(
        (model) => model.lifecycleStatus === "ACTIVE",
      ).length,
      readyModelCount: models.filter(
        (model) => model.lifecycleStatus === "READY",
      ).length,
      degradedModelCount: models.filter(
        (model) => model.lifecycleStatus === "DEGRADED",
      ).length,
      suspendedModelCount: models.filter(
        (model) => model.lifecycleStatus === "SUSPENDED",
      ).length,
      retiredModelCount: models.filter(
        (model) => model.lifecycleStatus === "RETIRED",
      ).length,
      strategyBindingCount: bindings.length,
      defaultAssignmentCount: defaults.length,
      auditEntryCount: this.auditHistory.length,
    });
  }

  private audit(
    eventType: AiModelRegistryEventType,
    input: {
      readonly providerId?: string;
      readonly modelId?: string;
      readonly modelVersion?: string;
      readonly strategyId?: string;
      readonly entityId?: string;
      readonly message: string;
      readonly metadata?: AiStrategyMetadata;
    },
  ): void {
    const timestamp = this.options.clock();
    this.auditHistory.push(
      cloneAuditEntry({
        auditId: this.nextId("ai-model-registry-audit", timestamp),
        eventType,
        timestamp,
        providerId: input.providerId,
        modelId: input.modelId,
        modelVersion: input.modelVersion,
        strategyId: input.strategyId,
        entityId: input.entityId,
        message: input.message,
        metadata: cloneMetadata(input.metadata),
      }),
    );

    while (
      this.auditHistory.length > this.options.maximumAuditEntries
    ) {
      this.auditHistory.shift();
    }
  }

  private nextId(
    prefix: string,
    timestamp: AiStrategyTimestamp,
  ): string {
    this.sequence += 1;
    return this.options.idFactory(prefix, timestamp, this.sequence);
  }
}

export function createDeterministicAiModelRegistry(
  options: AiModelRegistryOptions = {},
): DeterministicAiModelRegistry {
  return new DeterministicAiModelRegistry(options);
}