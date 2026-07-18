/**
 * QuantumTradeAI
 * Milestone 24 — Real-Time Portfolio & Position Synchronization
 *
 * Deterministic integration test for:
 *
 * - synchronization service execution
 * - orchestrator result handling
 * - portfolio-state publication
 * - subscriber delivery
 * - latest-state retrieval
 * - run and publication history
 * - duplicate-run rejection
 */

import assert from "node:assert/strict";

import type {
  LivePortfolio,
  LivePortfolioMetadata,
} from "./portfolio-synchronization/live-portfolio";

import {
  DeterministicPortfolioStatePublisher,
  type PortfolioStateSubscriberContext,
} from "./portfolio-synchronization/portfolio-state-publisher";

import type {
  PortfolioSynchronizationOrchestrator,
  PortfolioSynchronizationRequest,
  PortfolioSynchronizationResult,
  PortfolioSynchronizationStageRecord,
} from "./portfolio-synchronization/portfolio-synchronization-orchestrator";

import {
  DeterministicPortfolioSynchronizationService,
  type PortfolioSynchronizationServiceResult,
} from "./portfolio-synchronization/portfolio-synchronization-service";

const STARTED_AT = 1_750_000_000_000;
const SYNCHRONIZED_AT = STARTED_AT + 1_000;
const PUBLISHED_AT = SYNCHRONIZED_AT + 100;

const PORTFOLIO_ID = "portfolio-integration-001";
const OWNER_ID = "owner-integration-001";
const RUN_ID = "portfolio-sync-run-001";
const PUBLICATION_ID = "portfolio-publication-001";
const SUBSCRIBER_ID = "portfolio-subscriber-001";

function freezeMetadata(
  metadata: Record<
    string,
    string | number | boolean | null
  > = {},
): LivePortfolioMetadata {
  return Object.freeze({
    ...metadata,
  });
}

function createPortfolio(
  version: number,
  updatedAt: number,
): LivePortfolio {
  const portfolioFixture = Object.freeze({
    identity: Object.freeze({
      portfolioId: PORTFOLIO_ID,
      ownerId: OWNER_ID,
      name: "QuantumTradeAI Integration Portfolio",
      reportingCurrency: "USD",
    }),

    exchangeAccounts: Object.freeze([]),
    balances: Object.freeze([]),
    positions: Object.freeze([]),
    openOrderExposures: Object.freeze([]),
    collateral: Object.freeze([]),

    margin: Object.freeze({}),
    exposure: Object.freeze({}),
    pnl: Object.freeze({}),
    valuation: Object.freeze({}),
    synchronization: Object.freeze({}),

    createdAt: STARTED_AT,
    updatedAt,
    version,

    metadata: freezeMetadata({
      source: "integration-test",
      version,
    }),
  });

  /*
   * The integration test only exercises service orchestration, publication,
   * subscriptions, history, and duplicate-run handling.
   *
   * Detailed portfolio calculation structures are validated by their
   * dedicated deterministic engine tests.
   */
  return portfolioFixture as unknown as LivePortfolio;
}

function createCompletedStages(
  sourceVersion: number,
  synchronizedVersion: number,
): readonly PortfolioSynchronizationStageRecord[] {
  const stageNames = [
    "VALIDATION",
    "SNAPSHOT_INGESTION",
    "PORTFOLIO_AGGREGATION",
    "UNREALIZED_PNL",
    "REALIZED_PNL",
    "MARGIN_AND_COLLATERAL",
    "EXPOSURE",
    "RECONCILIATION",
    "PUBLICATION",
  ] as const;

  return Object.freeze(
    stageNames.map(
      (
        stage,
        index,
      ): PortfolioSynchronizationStageRecord =>
        Object.freeze({
          stage,
          status: "COMPLETED",

          startedAt:
            STARTED_AT + index,

          completedAt:
            STARTED_AT + index + 1,

          inputPortfolioVersion:
            index === 0
              ? sourceVersion
              : synchronizedVersion,

          outputPortfolioVersion:
            index === 0
              ? sourceVersion
              : synchronizedVersion,

          duration: 1,
          issueCount: 0,

          metadata: freezeMetadata({
            stageIndex: index,
          }),
        }),
    ),
  );
}

class DeterministicIntegrationOrchestrator
  implements PortfolioSynchronizationOrchestrator
{
  public invocationCount = 0;

  public synchronize(
    request: PortfolioSynchronizationRequest,
  ): PortfolioSynchronizationResult {
    this.invocationCount += 1;

    assert.equal(
      request.runId,
      RUN_ID,
    );

    assert.equal(
      request.sequence,
      1,
    );

    assert.equal(
      request.startedAt,
      STARTED_AT,
    );

    assert.equal(
      request.synchronizedAt,
      SYNCHRONIZED_AT,
    );

    assert.equal(
      request.portfolio.identity.portfolioId,
      PORTFOLIO_ID,
    );

    assert.equal(
      request.snapshots.length,
      1,
    );

    const synchronizedPortfolio =
      createPortfolio(
        request.portfolio.version + 1,
        SYNCHRONIZED_AT,
      );

    return Object.freeze({
      runId: RUN_ID,
      sequence: request.sequence,

      status: "COMPLETED",

      sourcePortfolio:
        request.portfolio,

      synchronizedPortfolio,

      publication: Object.freeze({
        publicationId:
          PUBLICATION_ID,

        portfolio:
          synchronizedPortfolio,

        publishedAt:
          PUBLISHED_AT,

        sequence:
          request.sequence,

        metadata:
          freezeMetadata({
            publicationSource:
              "integration-orchestrator",
          }),
      }),

      reconciliation: Object.freeze({
        matched: true,
        criticalMismatch: false,

        differenceCount: 0,
        warningCount: 0,
        errorCount: 0,
        criticalCount: 0,

        metadata:
          freezeMetadata({
            reconciled: true,
          }),
      }),

      stages:
        createCompletedStages(
          request.portfolio.version,
          synchronizedPortfolio.version,
        ),

      issues:
        Object.freeze([]),

      startedAt:
        request.startedAt,

      completedAt:
        PUBLISHED_AT,

      metadata:
        freezeMetadata({
          orchestrator:
            "deterministic-integration",
        }),
    });
  }
}

function assertSuccessfulResult(
  result: PortfolioSynchronizationServiceResult,
): void {
  assert.equal(
    result.accepted,
    true,
  );

  assert.equal(
    result.status,
    "SYNCHRONIZED",
  );

  assert.equal(
    result.runId,
    RUN_ID,
  );

  assert.equal(
    result.sequence,
    1,
  );

  assert.notEqual(
    result.synchronization,
    null,
  );

  assert.notEqual(
    result.publication,
    null,
  );

  assert.notEqual(
    result.latestPortfolio,
    null,
  );

  assert.equal(
    result.latestPortfolio?.identity.portfolioId,
    PORTFOLIO_ID,
  );

  assert.equal(
    result.latestPortfolio?.version,
    2,
  );

  assert.equal(
    result.publication?.publicationId,
    PUBLICATION_ID,
  );

  assert.equal(
    result.publication?.status,
    "PUBLISHED",
  );

  assert.equal(
    result.publication?.subscriberCount,
    1,
  );

  assert.equal(
    result.publication?.successfulDeliveryCount,
    1,
  );

  assert.equal(
    result.publication?.failedDeliveryCount,
    0,
  );

  assert.equal(
    result.issues.length,
    0,
  );
}

function runPortfolioSynchronizationIntegrationTest(): void {
  const sourcePortfolio =
    createPortfolio(
      1,
      STARTED_AT,
    );

  const orchestrator =
    new DeterministicIntegrationOrchestrator();

  const publisher =
    new DeterministicPortfolioStatePublisher({
      rejectDuplicatePublicationIds: true,

      requireVersionIncrease: true,
      requireUpdatedAtIncrease: true,

      stopOnSubscriberFailure: false,
      retainFailedPublications: true,

      maximumHistoryEntries: 100,
    });

  const service =
    new DeterministicPortfolioSynchronizationService(
      {
        orchestrator,
        publisher,
      },
      {
        rejectDuplicateRunIds: true,
        retainFailedRuns: true,
        maximumRunHistoryEntries: 100,
      },
    );

  const deliveredPortfolios:
    LivePortfolio[] = [];

  const deliveredContexts:
    PortfolioStateSubscriberContext[] = [];

  const subscription =
    service.subscribe(
      SUBSCRIBER_ID,
      (
        portfolio,
        context,
      ): void => {
        deliveredPortfolios.push(
          portfolio,
        );

        deliveredContexts.push(
          context,
        );
      },
      PORTFOLIO_ID,
    );

  assert.equal(
    subscription.subscriberId,
    SUBSCRIBER_ID,
  );

  assert.equal(
    subscription.portfolioId,
    PORTFOLIO_ID,
  );

  const result =
    service.synchronize({
      runId: RUN_ID,

      portfolio:
        sourcePortfolio,

      snapshots: Object.freeze([
        Object.freeze({
          snapshotId:
            "snapshot-integration-001",

          exchangeId:
            "exchange-integration",

          accountId:
            "account-integration",

          capturedAt:
            STARTED_AT + 500,

          receivedAt:
            STARTED_AT + 600,

          snapshotType:
            "PORTFOLIO",

          payload: Object.freeze({
            deterministic: true,
          }),

          metadata:
            freezeMetadata({
              snapshot:
                "integration",
            }),
        }),
      ]),

      startedAt:
        STARTED_AT,

      synchronizedAt:
        SYNCHRONIZED_AT,

      sequence: 1,
      publish: true,

      metadata:
        freezeMetadata({
          test:
            "portfolio-synchronization-integration",
        }),
    });

  assertSuccessfulResult(
    result,
  );

  assert.equal(
    orchestrator.invocationCount,
    1,
  );

  assert.equal(
    deliveredPortfolios.length,
    1,
  );

  assert.equal(
    deliveredContexts.length,
    1,
  );

  assert.equal(
    deliveredPortfolios[0]?.version,
    2,
  );

  assert.equal(
    deliveredContexts[0]?.publicationId,
    PUBLICATION_ID,
  );

  assert.equal(
    deliveredContexts[0]?.portfolioId,
    PORTFOLIO_ID,
  );

  assert.equal(
    deliveredContexts[0]?.portfolioVersion,
    2,
  );

  assert.equal(
    deliveredContexts[0]?.sequence,
    1,
  );

  const latestPortfolio =
    service.getLatestPortfolio(
      PORTFOLIO_ID,
    );

  assert.notEqual(
    latestPortfolio,
    null,
  );

  assert.equal(
    latestPortfolio?.version,
    2,
  );

  assert.equal(
    latestPortfolio?.updatedAt,
    SYNCHRONIZED_AT,
  );

  const storedRun =
    service.getRun(
      RUN_ID,
    );

  assert.notEqual(
    storedRun,
    null,
  );

  assert.equal(
    storedRun,
    result,
  );

  const runHistory =
    service.getRunHistory(
      PORTFOLIO_ID,
    );

  assert.equal(
    runHistory.length,
    1,
  );

  assert.equal(
    runHistory[0]?.runId,
    RUN_ID,
  );

  const publicationHistory =
    service.getPublicationHistory(
      PORTFOLIO_ID,
    );

  assert.equal(
    publicationHistory.length,
    1,
  );

  assert.equal(
    publicationHistory[0]?.publicationId,
    PUBLICATION_ID,
  );

  const duplicateResult =
    service.synchronize({
      runId: RUN_ID,

      portfolio:
        sourcePortfolio,

      snapshots: Object.freeze([]),

      startedAt:
        STARTED_AT,

      synchronizedAt:
        SYNCHRONIZED_AT,

      sequence: 1,
      publish: true,

      metadata:
        freezeMetadata({
          duplicate:
            true,
        }),
    });

  assert.equal(
    duplicateResult.accepted,
    false,
  );

  assert.equal(
    duplicateResult.status,
    "DUPLICATE_RUN_REJECTED",
  );

  assert.equal(
    duplicateResult.synchronization,
    null,
  );

  assert.equal(
    duplicateResult.publication,
    null,
  );

  assert.equal(
    duplicateResult.issues.length,
    1,
  );

  assert.equal(
    duplicateResult.issues[0]?.code,
    "DUPLICATE_RUN",
  );

  assert.equal(
    orchestrator.invocationCount,
    1,
  );

  assert.equal(
    service.getRunHistory(
      PORTFOLIO_ID,
    ).length,
    1,
  );

  assert.equal(
    service.getPublicationHistory(
      PORTFOLIO_ID,
    ).length,
    1,
  );

  assert.equal(
    subscription.unsubscribe(),
    true,
  );

  assert.equal(
    subscription.unsubscribe(),
    false,
  );

  assert.equal(
    service.unsubscribe(
      SUBSCRIBER_ID,
    ),
    false,
  );

  service.clear();

  assert.equal(
    service.getLatestPortfolio(
      PORTFOLIO_ID,
    ),
    null,
  );

  assert.equal(
    service.getRun(
      RUN_ID,
    ),
    null,
  );

  assert.equal(
    service.getRunHistory().length,
    0,
  );

  assert.equal(
    service.getPublicationHistory().length,
    0,
  );

  console.log(
    "All portfolio synchronization integration tests passed successfully.",
  );
}

runPortfolioSynchronizationIntegrationTest();