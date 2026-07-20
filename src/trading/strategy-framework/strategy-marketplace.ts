/**
 * QuantumTradeAI
 * Milestone 29 — Professional Trading Strategy Framework
 *
 * File:
 * src/trading/strategy-framework/strategy-marketplace.ts
 */

import {
  EMPTY_STRATEGY_METADATA,
  type StrategyCapability,
  type StrategyFactory,
  type StrategyId,
  type StrategyManifest,
  type StrategyMarketType,
  type StrategyMetadata,
  type StrategyVersion,
  type UnixTimestampMilliseconds,
} from "./strategy-contracts";

export type StrategyMarketplacePackageId = string;
export type StrategyMarketplacePublisherId = string;
export type StrategyMarketplaceRepositoryId = string;

export type StrategyMarketplacePackageStatus =
  | "INSTALLED"
  | "DISABLED";

export type StrategyMarketplaceAuditAction =
  | "INSTALL"
  | "ENABLE"
  | "DISABLE"
  | "UPGRADE"
  | "UNINSTALL";

export interface StrategyMarketplaceDependency {
  readonly packageId: StrategyMarketplacePackageId;
  readonly minimumVersion?: string;
  readonly maximumVersion?: string;
  readonly optional?: boolean;
}

export interface StrategyMarketplacePermission {
  readonly name: string;
  readonly required: boolean;
  readonly description?: string;
}

export interface StrategyMarketplacePackageDescriptor {
  readonly packageId: StrategyMarketplacePackageId;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly publisherId: StrategyMarketplacePublisherId;
  readonly publisherName: string;
  readonly repositoryId: StrategyMarketplaceRepositoryId;
  readonly checksum?: string;
  readonly signature?: string;
  readonly frameworkMinimumVersion?: string;
  readonly frameworkMaximumVersion?: string;
  readonly dependencies: readonly StrategyMarketplaceDependency[];
  readonly permissions: readonly StrategyMarketplacePermission[];
  readonly tags: readonly string[];
  readonly capabilities: readonly StrategyCapability[];
  readonly supportedMarketTypes: readonly StrategyMarketType[];
  readonly aiEnabled: boolean;
  readonly publishedAt: UnixTimestampMilliseconds;
  readonly metadata: StrategyMetadata;
}

export interface StrategyMarketplacePackage {
  readonly descriptor: StrategyMarketplacePackageDescriptor;
  readonly factories: readonly StrategyFactory[];
}

export interface StrategyMarketplaceSearchQuery {
  readonly text?: string;
  readonly publisherId?: StrategyMarketplacePublisherId;
  readonly tags?: readonly string[];
  readonly capability?: StrategyCapability;
  readonly marketType?: StrategyMarketType;
  readonly aiEnabled?: boolean;
}

export interface StrategyMarketplaceRepository {
  readonly repositoryId: StrategyMarketplaceRepositoryId;

  list(): Promise<readonly StrategyMarketplacePackageDescriptor[]>;

  fetch(
    packageId: StrategyMarketplacePackageId,
    version?: string,
  ): Promise<StrategyMarketplacePackage | undefined>;
}

export interface StrategyMarketplaceIntegrityVerifier {
  verify(
    marketplacePackage: StrategyMarketplacePackage,
  ): Promise<StrategyMarketplaceIntegrityResult>;
}

export interface StrategyMarketplaceIntegrityResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface StrategyMarketplaceRegistry {
  register(factory: StrategyFactory): void;
  unregister(strategyId: StrategyId): boolean;
  has(strategyId: StrategyId): boolean;
  get(strategyId: StrategyId): StrategyFactory | undefined;
  list(): readonly StrategyFactory[];
  unregisterVersion?(
    strategyId: StrategyId,
    strategyVersion: StrategyVersion,
  ): boolean;
}

export interface StrategyMarketplaceOptions {
  readonly frameworkVersion: string;
  readonly trustedPublishers?: readonly StrategyMarketplacePublisherId[];
  readonly requireTrustedPublisher?: boolean;
  readonly requireChecksum?: boolean;
  readonly requireSignature?: boolean;
  readonly maximumAuditEntries?: number;
}

export interface StrategyMarketplaceInstalledPackage {
  readonly descriptor: StrategyMarketplacePackageDescriptor;
  readonly status: StrategyMarketplacePackageStatus;
  readonly installedAt: UnixTimestampMilliseconds;
  readonly updatedAt: UnixTimestampMilliseconds;
  readonly registeredStrategies: readonly {
    readonly strategyId: StrategyId;
    readonly version: StrategyVersion;
    readonly factoryId: string;
  }[];
}

export interface StrategyMarketplaceAuditEntry {
  readonly sequence: number;
  readonly action: StrategyMarketplaceAuditAction;
  readonly packageId: StrategyMarketplacePackageId;
  readonly fromVersion?: string;
  readonly toVersion?: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly success: boolean;
  readonly message: string;
  readonly metadata: StrategyMetadata;
}

export interface StrategyMarketplaceSnapshot {
  readonly frameworkVersion: string;
  readonly installedPackages:
    readonly StrategyMarketplaceInstalledPackage[];
  readonly auditHistory: readonly StrategyMarketplaceAuditEntry[];
}

export interface StrategyMarketplaceInstallRequest {
  readonly packageId: StrategyMarketplacePackageId;
  readonly version?: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

export interface StrategyMarketplaceUpgradeRequest {
  readonly packageId: StrategyMarketplacePackageId;
  readonly targetVersion?: string;
  readonly timestamp: UnixTimestampMilliseconds;
  readonly metadata?: StrategyMetadata;
}

const DEFAULT_MAXIMUM_AUDIT_ENTRIES = 1_000;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} cannot be empty.`);
  }
}

function assertTimestamp(
  value: UnixTimestampMilliseconds,
  field: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer timestamp.`,
    );
  }
}

function parseVersion(value: string): readonly number[] {
  const normalized = value.trim().replace(/^v/i, "").split("-")[0] ?? "";
  const parts = normalized.split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  return Object.freeze(parts.length === 0 ? [0] : parts);
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }

  return 0;
}

function versionWithinRange(
  version: string,
  minimumVersion?: string,
  maximumVersion?: string,
): boolean {
  if (
    minimumVersion !== undefined &&
    compareVersions(version, minimumVersion) < 0
  ) {
    return false;
  }

  if (
    maximumVersion !== undefined &&
    compareVersions(version, maximumVersion) > 0
  ) {
    return false;
  }

  return true;
}

function freezeMetadata(
  metadata: StrategyMetadata | undefined,
): StrategyMetadata {
  return Object.freeze({
    ...(metadata ?? EMPTY_STRATEGY_METADATA),
  });
}

function freezeDescriptor(
  descriptor: StrategyMarketplacePackageDescriptor,
): StrategyMarketplacePackageDescriptor {
  return Object.freeze({
    ...descriptor,
    dependencies: Object.freeze(
      descriptor.dependencies.map((dependency) =>
        Object.freeze({ ...dependency }),
      ),
    ),
    permissions: Object.freeze(
      descriptor.permissions.map((permission) =>
        Object.freeze({ ...permission }),
      ),
    ),
    tags: Object.freeze([...descriptor.tags]),
    capabilities: Object.freeze([...descriptor.capabilities]),
    supportedMarketTypes: Object.freeze([
      ...descriptor.supportedMarketTypes,
    ]),
    metadata: freezeMetadata(descriptor.metadata),
  });
}

function freezeInstalled(
  installed: StrategyMarketplaceInstalledPackage,
): StrategyMarketplaceInstalledPackage {
  return Object.freeze({
    ...installed,
    descriptor: freezeDescriptor(installed.descriptor),
    registeredStrategies: Object.freeze(
      installed.registeredStrategies.map((strategy) =>
        Object.freeze({ ...strategy }),
      ),
    ),
  });
}

export class StrategyMarketplace {
  private readonly repositories = new Map<
    StrategyMarketplaceRepositoryId,
    StrategyMarketplaceRepository
  >();

  private readonly installed = new Map<
    StrategyMarketplacePackageId,
    StrategyMarketplaceInstalledPackage
  >();

  private readonly activeOperations = new Set<string>();
  private readonly auditHistory: StrategyMarketplaceAuditEntry[] = [];
  private readonly trustedPublishers: ReadonlySet<string>;
  private readonly frameworkVersion: string;
  private readonly requireTrustedPublisher: boolean;
  private readonly requireChecksum: boolean;
  private readonly requireSignature: boolean;
  private readonly maximumAuditEntries: number;
  private auditSequence = 0;

  public constructor(
    private readonly registry: StrategyMarketplaceRegistry,
    private readonly integrityVerifier: StrategyMarketplaceIntegrityVerifier,
    options: StrategyMarketplaceOptions,
  ) {
    assertNonEmpty(options.frameworkVersion, "frameworkVersion");

    this.frameworkVersion = options.frameworkVersion;
    this.trustedPublishers = new Set(
      options.trustedPublishers ?? [],
    );
    this.requireTrustedPublisher =
      options.requireTrustedPublisher ?? false;
    this.requireChecksum = options.requireChecksum ?? false;
    this.requireSignature = options.requireSignature ?? false;
    this.maximumAuditEntries =
      options.maximumAuditEntries ??
      DEFAULT_MAXIMUM_AUDIT_ENTRIES;

    if (
      !Number.isInteger(this.maximumAuditEntries) ||
      this.maximumAuditEntries <= 0
    ) {
      throw new Error(
        "maximumAuditEntries must be a positive integer.",
      );
    }
  }

  public addRepository(
    repository: StrategyMarketplaceRepository,
  ): void {
    assertNonEmpty(repository.repositoryId, "repositoryId");

    if (this.repositories.has(repository.repositoryId)) {
      throw new Error(
        `Repository '${repository.repositoryId}' is already registered.`,
      );
    }

    this.repositories.set(repository.repositoryId, repository);
  }

  public removeRepository(
    repositoryId: StrategyMarketplaceRepositoryId,
  ): boolean {
    return this.repositories.delete(repositoryId);
  }

  public async search(
    query: StrategyMarketplaceSearchQuery = {},
  ): Promise<readonly StrategyMarketplacePackageDescriptor[]> {
    const descriptors = (
      await Promise.all(
        [...this.repositories.values()]
          .sort((left, right) =>
            left.repositoryId.localeCompare(right.repositoryId),
          )
          .map((repository) => repository.list()),
      )
    ).flat();

    const normalizedText = query.text?.trim().toLowerCase();
    const requiredTags = new Set(
      (query.tags ?? []).map((tag) => tag.toLowerCase()),
    );

    const filtered = descriptors.filter((descriptor) => {
      if (
        query.publisherId !== undefined &&
        descriptor.publisherId !== query.publisherId
      ) {
        return false;
      }

      if (
        query.capability !== undefined &&
        !descriptor.capabilities.includes(query.capability)
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
        query.aiEnabled !== undefined &&
        descriptor.aiEnabled !== query.aiEnabled
      ) {
        return false;
      }

      const descriptorTags = new Set(
        descriptor.tags.map((tag) => tag.toLowerCase()),
      );

      for (const tag of requiredTags) {
        if (!descriptorTags.has(tag)) {
          return false;
        }
      }

      if (normalizedText !== undefined && normalizedText.length > 0) {
        const haystack = [
          descriptor.packageId,
          descriptor.displayName,
          descriptor.description,
          descriptor.publisherName,
          ...descriptor.tags,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedText)) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((left, right) => {
      const packageComparison = left.packageId.localeCompare(
        right.packageId,
      );

      return packageComparison !== 0
        ? packageComparison
        : compareVersions(right.version, left.version);
    });

    return Object.freeze(filtered.map(freezeDescriptor));
  }

  public async install(
    request: StrategyMarketplaceInstallRequest,
  ): Promise<StrategyMarketplaceInstalledPackage> {
    assertNonEmpty(request.packageId, "packageId");
    assertTimestamp(request.timestamp, "timestamp");

    return this.withOperation(
      `install:${request.packageId}`,
      async () => {
        if (this.installed.has(request.packageId)) {
          throw new Error(
            `Package '${request.packageId}' is already installed.`,
          );
        }

        const marketplacePackage = await this.fetchPackage(
          request.packageId,
          request.version,
        );

        try {
          await this.validatePackage(marketplacePackage);
          this.validateDependencies(marketplacePackage.descriptor);
          this.registerFactories(marketplacePackage.factories);

          const installed = freezeInstalled({
            descriptor: freezeDescriptor(
              marketplacePackage.descriptor,
            ),
            status: "INSTALLED",
            installedAt: request.timestamp,
            updatedAt: request.timestamp,
            registeredStrategies: marketplacePackage.factories.map(
              (factory) =>
                Object.freeze({
                  strategyId: factory.manifest.strategyId,
                  version: factory.manifest.version,
                  factoryId: factory.factoryId,
                }),
            ),
          });

          this.installed.set(request.packageId, installed);
          this.audit(
            "INSTALL",
            request.packageId,
            undefined,
            installed.descriptor.version,
            request.timestamp,
            true,
            "Package installed successfully.",
            request.metadata,
          );

          return installed;
        } catch (error) {
          this.rollbackFactories(marketplacePackage.factories);
          this.audit(
            "INSTALL",
            request.packageId,
            undefined,
            marketplacePackage.descriptor.version,
            request.timestamp,
            false,
            error instanceof Error
              ? error.message
              : "Package installation failed.",
            request.metadata,
          );
          throw error;
        }
      },
    );
  }

  public enable(
    packageId: StrategyMarketplacePackageId,
    timestamp: UnixTimestampMilliseconds,
    metadata?: StrategyMetadata,
  ): StrategyMarketplaceInstalledPackage {
    assertTimestamp(timestamp, "timestamp");
    const current = this.requireInstalled(packageId);

    if (current.status === "INSTALLED") {
      return current;
    }

    throw new Error(
      `Package '${packageId}' cannot be enabled because its factories are not available for re-registration. Reinstall the package instead.`,
    );
  }

  public disable(
    packageId: StrategyMarketplacePackageId,
    timestamp: UnixTimestampMilliseconds,
    metadata?: StrategyMetadata,
  ): StrategyMarketplaceInstalledPackage {
    assertTimestamp(timestamp, "timestamp");
    const current = this.requireInstalled(packageId);

    if (current.status === "DISABLED") {
      return current;
    }

    for (const strategy of current.registeredStrategies) {
      this.unregisterStrategyVersion(
        strategy.strategyId,
        strategy.version,
      );
    }

    const disabled = freezeInstalled({
      ...current,
      status: "DISABLED",
      updatedAt: timestamp,
    });

    this.installed.set(packageId, disabled);
    this.audit(
      "DISABLE",
      packageId,
      current.descriptor.version,
      current.descriptor.version,
      timestamp,
      true,
      "Package disabled successfully.",
      metadata,
    );

    return disabled;
  }

  public async upgrade(
    request: StrategyMarketplaceUpgradeRequest,
  ): Promise<StrategyMarketplaceInstalledPackage> {
    assertTimestamp(request.timestamp, "timestamp");
    const current = this.requireInstalled(request.packageId);

    return this.withOperation(
      `upgrade:${request.packageId}`,
      async () => {
        const nextPackage = await this.fetchPackage(
          request.packageId,
          request.targetVersion,
        );

        if (
          compareVersions(
            nextPackage.descriptor.version,
            current.descriptor.version,
          ) <= 0
        ) {
          throw new Error(
            `Upgrade version '${nextPackage.descriptor.version}' must be newer than '${current.descriptor.version}'.`,
          );
        }

        await this.validatePackage(nextPackage);
        this.validateDependencies(nextPackage.descriptor);

        for (const strategy of current.registeredStrategies) {
          this.unregisterStrategyVersion(
            strategy.strategyId,
            strategy.version,
          );
        }

        try {
          this.registerFactories(nextPackage.factories);

          const upgraded = freezeInstalled({
            descriptor: freezeDescriptor(nextPackage.descriptor),
            status: "INSTALLED",
            installedAt: current.installedAt,
            updatedAt: request.timestamp,
            registeredStrategies: nextPackage.factories.map(
              (factory) =>
                Object.freeze({
                  strategyId: factory.manifest.strategyId,
                  version: factory.manifest.version,
                  factoryId: factory.factoryId,
                }),
            ),
          });

          this.installed.set(request.packageId, upgraded);
          this.audit(
            "UPGRADE",
            request.packageId,
            current.descriptor.version,
            upgraded.descriptor.version,
            request.timestamp,
            true,
            "Package upgraded successfully.",
            request.metadata,
          );

          return upgraded;
        } catch (error) {
          this.rollbackFactories(nextPackage.factories);
          this.audit(
            "UPGRADE",
            request.packageId,
            current.descriptor.version,
            nextPackage.descriptor.version,
            request.timestamp,
            false,
            error instanceof Error
              ? error.message
              : "Package upgrade failed.",
            request.metadata,
          );
          throw error;
        }
      },
    );
  }

  public uninstall(
    packageId: StrategyMarketplacePackageId,
    timestamp: UnixTimestampMilliseconds,
    metadata?: StrategyMetadata,
  ): boolean {
    assertTimestamp(timestamp, "timestamp");
    const current = this.installed.get(packageId);

    if (current === undefined) {
      return false;
    }

    for (const dependent of this.installed.values()) {
      if (dependent.descriptor.packageId === packageId) {
        continue;
      }

      const blockingDependency =
        dependent.descriptor.dependencies.find(
          (dependency) =>
            dependency.packageId === packageId &&
            dependency.optional !== true,
        );

      if (blockingDependency !== undefined) {
        throw new Error(
          `Package '${packageId}' is required by '${dependent.descriptor.packageId}'.`,
        );
      }
    }

    for (const strategy of current.registeredStrategies) {
      this.unregisterStrategyVersion(
        strategy.strategyId,
        strategy.version,
      );
    }

    this.installed.delete(packageId);
    this.audit(
      "UNINSTALL",
      packageId,
      current.descriptor.version,
      undefined,
      timestamp,
      true,
      "Package uninstalled successfully.",
      metadata,
    );

    return true;
  }

  public getInstalled(
    packageId: StrategyMarketplacePackageId,
  ): StrategyMarketplaceInstalledPackage | undefined {
    const installed = this.installed.get(packageId);
    return installed === undefined
      ? undefined
      : freezeInstalled(installed);
  }

  public listInstalled():
    readonly StrategyMarketplaceInstalledPackage[] {
    return Object.freeze(
      [...this.installed.values()]
        .sort((left, right) =>
          left.descriptor.packageId.localeCompare(
            right.descriptor.packageId,
          ),
        )
        .map(freezeInstalled),
    );
  }

  public snapshot(): StrategyMarketplaceSnapshot {
    return Object.freeze({
      frameworkVersion: this.frameworkVersion,
      installedPackages: this.listInstalled(),
      auditHistory: Object.freeze(
        this.auditHistory.map((entry) =>
          Object.freeze({
            ...entry,
            metadata: freezeMetadata(entry.metadata),
          }),
        ),
      ),
    });
  }

  private async fetchPackage(
    packageId: StrategyMarketplacePackageId,
    version?: string,
  ): Promise<StrategyMarketplacePackage> {
    const repositories = [...this.repositories.values()].sort(
      (left, right) =>
        left.repositoryId.localeCompare(right.repositoryId),
    );

    for (const repository of repositories) {
      const marketplacePackage = await repository.fetch(
        packageId,
        version,
      );

      if (marketplacePackage !== undefined) {
        return marketplacePackage;
      }
    }

    throw new Error(
      `Package '${packageId}'${version ? ` version '${version}'` : ""} was not found.`,
    );
  }

  private async validatePackage(
    marketplacePackage: StrategyMarketplacePackage,
  ): Promise<void> {
    const descriptor = marketplacePackage.descriptor;

    assertNonEmpty(descriptor.packageId, "descriptor.packageId");
    assertNonEmpty(descriptor.version, "descriptor.version");
    assertNonEmpty(descriptor.publisherId, "descriptor.publisherId");

    if (
      !versionWithinRange(
        this.frameworkVersion,
        descriptor.frameworkMinimumVersion,
        descriptor.frameworkMaximumVersion,
      )
    ) {
      throw new Error(
        `Package '${descriptor.packageId}' version '${descriptor.version}' is not compatible with framework '${this.frameworkVersion}'.`,
      );
    }

    if (
      this.requireTrustedPublisher &&
      !this.trustedPublishers.has(descriptor.publisherId)
    ) {
      throw new Error(
        `Publisher '${descriptor.publisherId}' is not trusted.`,
      );
    }

    if (
      this.requireChecksum &&
      (descriptor.checksum === undefined ||
        descriptor.checksum.trim().length === 0)
    ) {
      throw new Error(
        `Package '${descriptor.packageId}' does not provide a checksum.`,
      );
    }

    if (
      this.requireSignature &&
      (descriptor.signature === undefined ||
        descriptor.signature.trim().length === 0)
    ) {
      throw new Error(
        `Package '${descriptor.packageId}' does not provide a signature.`,
      );
    }

    if (marketplacePackage.factories.length === 0) {
      throw new Error(
        `Package '${descriptor.packageId}' does not contain any strategy factories.`,
      );
    }

    const factoryIds = new Set<string>();
    const strategyVersions = new Set<string>();

    for (const factory of marketplacePackage.factories) {
      const manifest: StrategyManifest = factory.manifest;
      const strategyVersionKey =
        `${manifest.strategyId}::${manifest.version}`;

      if (factoryIds.has(factory.factoryId)) {
        throw new Error(
          `Package '${descriptor.packageId}' contains duplicate factoryId '${factory.factoryId}'.`,
        );
      }

      if (strategyVersions.has(strategyVersionKey)) {
        throw new Error(
          `Package '${descriptor.packageId}' contains duplicate strategy version '${strategyVersionKey}'.`,
        );
      }

      factoryIds.add(factory.factoryId);
      strategyVersions.add(strategyVersionKey);
    }

    const verification =
      await this.integrityVerifier.verify(marketplacePackage);

    if (!verification.valid) {
      throw new Error(
        verification.reason ??
          `Integrity verification failed for '${descriptor.packageId}'.`,
      );
    }
  }

  private validateDependencies(
    descriptor: StrategyMarketplacePackageDescriptor,
  ): void {
    for (const dependency of descriptor.dependencies) {
      const installed = this.installed.get(dependency.packageId);

      if (installed === undefined) {
        if (dependency.optional === true) {
          continue;
        }

        throw new Error(
          `Required dependency '${dependency.packageId}' is not installed.`,
        );
      }

      if (
        !versionWithinRange(
          installed.descriptor.version,
          dependency.minimumVersion,
          dependency.maximumVersion,
        )
      ) {
        throw new Error(
          `Dependency '${dependency.packageId}' version '${installed.descriptor.version}' is outside the required range.`,
        );
      }
    }
  }

  private registerFactories(
    factories: readonly StrategyFactory[],
  ): void {
    const registered: StrategyFactory[] = [];

    try {
      for (const factory of [...factories].sort((left, right) =>
        left.factoryId.localeCompare(right.factoryId),
      )) {
        this.registry.register(factory);
        registered.push(factory);
      }
    } catch (error) {
      this.rollbackFactories(registered);
      throw error;
    }
  }

  private rollbackFactories(
    factories: readonly StrategyFactory[],
  ): void {
    for (const factory of [...factories].reverse()) {
      this.unregisterStrategyVersion(
        factory.manifest.strategyId,
        factory.manifest.version,
      );
    }
  }

  private unregisterStrategyVersion(
    strategyId: StrategyId,
    version: StrategyVersion,
  ): void {
    if (this.registry.unregisterVersion !== undefined) {
      this.registry.unregisterVersion(strategyId, version);
      return;
    }

    this.registry.unregister(strategyId);
  }

  private requireInstalled(
    packageId: StrategyMarketplacePackageId,
  ): StrategyMarketplaceInstalledPackage {
    assertNonEmpty(packageId, "packageId");
    const installed = this.installed.get(packageId);

    if (installed === undefined) {
      throw new Error(
        `Package '${packageId}' is not installed.`,
      );
    }

    return installed;
  }

  private async withOperation<T>(
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.activeOperations.has(operationKey)) {
      throw new Error(
        `Marketplace operation '${operationKey}' is already active.`,
      );
    }

    this.activeOperations.add(operationKey);

    try {
      return await operation();
    } finally {
      this.activeOperations.delete(operationKey);
    }
  }

  private audit(
    action: StrategyMarketplaceAuditAction,
    packageId: StrategyMarketplacePackageId,
    fromVersion: string | undefined,
    toVersion: string | undefined,
    timestamp: UnixTimestampMilliseconds,
    success: boolean,
    message: string,
    metadata?: StrategyMetadata,
  ): void {
    this.auditSequence += 1;

    this.auditHistory.push(
      Object.freeze({
        sequence: this.auditSequence,
        action,
        packageId,
        fromVersion,
        toVersion,
        timestamp,
        success,
        message,
        metadata: freezeMetadata(metadata),
      }),
    );

    const overflow =
      this.auditHistory.length - this.maximumAuditEntries;

    if (overflow > 0) {
      this.auditHistory.splice(0, overflow);
    }
  }
}

export default StrategyMarketplace;