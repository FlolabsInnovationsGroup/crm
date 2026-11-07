// Found by mutation/run.mjs: no unit test failed when the minimum sample moved by one.
import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsFacadeService } from 'src/modules/analytics/facade/crm-analytics-facade.service';
import { type CrmAnalyticsDatabaseService } from 'src/modules/analytics/services/crm-analytics-database.service';
import { CrmAnalyticsMetricsService } from 'src/modules/analytics/services/crm-analytics-metrics.service';
import { type CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';
import { type AnalyticsFilter } from 'src/modules/analytics/types/analytics-api.type';
import {
  type CrmAnalyticsCrmState,
  type CrmAnalyticsSqlRunner,
} from 'src/modules/analytics/types/crm-analytics-crm-state.type';

const WORKSPACE_ID = '20202020-0000-4000-8000-000000000001';
const MINIMUM = CRM_ANALYTICS_CONFIG.minimumSample;

const DEFAULT_FILTER: AnalyticsFilter = {
  dateFrom: null,
  dateTo: null,
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
  period: 'WEEK',
};

const RANKED_STAGE_KEYS = CRM_ANALYTICS_CONFIG.stages
  .filter((stage) => stage.rank !== null)
  .map((stage) => stage.stageKey);

const buildStep = (stageKey: string, eligible: number) => ({
  stage_key: stageKey,
  entered: eligible,
  eligible,
  reached_next: Math.floor(eligible / 2),
  exited: 0,
  reached_so_far: Math.floor(eligible / 2),
});

const computeFunnel = async (eligibleByStage: Record<string, number>) => {
  const run: CrmAnalyticsSqlRunner = async (sql) => {
    if (sql.includes('to_regclass')) {
      return [
        {
          as_of: new Date('2026-11-07T12:00:00.000Z'),
          local_today: '2026-11-07',
          has_storage: true,
        },
      ];
    }

    return /''::text AS group_key[\s\S]*overall_total a/.test(sql)
      ? [
          {
            group_key: '',
            entered: 400,
            eligible: 0,
            reached: 0,
            reached_so_far: 0,
            steps: Object.entries(eligibleByStage).map(([stageKey, eligible]) =>
              buildStep(stageKey, eligible),
            ),
          },
        ]
      : [];
  };
  const facadeService = new CrmAnalyticsFacadeService({} as never, {} as never);

  jest.spyOn(facadeService, 'getCrmState').mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    stage: { status: 'OK', isAuditLogged: true, options: [] },
    positionsAppliedFor: { status: 'OK', options: [] },
    applicantSource: { status: 'OK', options: [] },
    hasFormSubmissionObject: true,
    hasApplicationObject: true,
  } as CrmAnalyticsCrmState);

  const service = new CrmAnalyticsMetricsService(
    {
      runPageTransaction: async (
        _workspaceId: string,
        work: (runner: CrmAnalyticsSqlRunner) => unknown,
      ) => work(run),
    } as unknown as CrmAnalyticsDatabaseService,
    facadeService,
    {
      isDisabled: async () => false,
      getTrackingStart: async () => '2026-08-01T00:00:00.000Z',
    } as unknown as CrmAnalyticsSettingsService,
  );

  return service.getFunnel({
    workspaceId: WORKSPACE_ID,
    filter: DEFAULT_FILTER,
  });
};

describe('the minimum sample, at its edge', () => {
  const [firstStage, secondStage] = RANKED_STAGE_KEYS;

  it('exactly the minimum is enough', async () => {
    const funnel = await computeFunnel({ [firstStage]: MINIMUM });

    expect(funnel?.rows.find(({ stageKey }) => stageKey === firstStage)?.isUnderMinimum).toBe(
      false,
    );
  });

  it('one under the minimum is not', async () => {
    const funnel = await computeFunnel({ [firstStage]: MINIMUM - 1 });

    expect(funnel?.rows.find(({ stageKey }) => stageKey === firstStage)?.isUnderMinimum).toBe(
      true,
    );
  });

  it('a step at exactly the minimum can be the lowest step', async () => {
    const funnel = await computeFunnel({
      [firstStage]: 400,
      [secondStage]: MINIMUM,
    });

    expect(funnel?.lowestStepStageKey).toBe(secondStage);
  });

  it('a step one under it cannot', async () => {
    const funnel = await computeFunnel({
      [firstStage]: 400,
      [secondStage]: MINIMUM - 1,
    });

    expect(funnel?.lowestStepStageKey).toBe(firstStage);
  });
});
