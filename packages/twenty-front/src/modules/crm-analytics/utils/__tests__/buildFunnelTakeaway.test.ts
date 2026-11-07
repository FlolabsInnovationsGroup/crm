import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelTakeaway } from '@/crm-analytics/utils/buildFunnelTakeaway';

const formatNumber = (value: number) => value.toLocaleString('en-US');

const buildRow = (
  stageKey: string,
  label: string,
  stepRate: number | null,
  isUnderMinimum = false,
): AnalyticsFunnelRow => ({
  stageKey,
  label,
  windowDays: 14,
  entered: 100,
  eligible: 90,
  reachedNext: 30,
  timedOut: 40,
  exited: 20,
  inWindow: 10,
  stepRate,
  soFarRate: null,
  dropOffRate: null,
  isUnderMinimum,
  medianDays: 5,
  completedStays: 30,
});

const buildFunnel = (overrides: Partial<AnalyticsFunnel>): AnalyticsFunnel => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  cohortSize: 200,
  cohortExcludedUnmapped: 0,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 1200,
    reached: 480,
    rate: 0.4,
    soFarRate: null,
    isUnderMinimum: false,
  },
  rows: [
    buildRow('NEW', 'New', 1 / 3),
    buildRow('CONTACTED', 'Contacted', 0.5),
    buildRow('SIGNED', 'Signed', null),
  ],
  lowestStepStageKey: 'NEW',
  ...overrides,
});

describe('buildFunnelTakeaway', () => {
  it('states overall conversion and the lowest step', () => {
    expect(
      buildFunnelTakeaway({ funnel: buildFunnel({}), formatNumber }),
    ).toBe(
      '40% of 1,200 reached Signed. Lowest step: New to Contacted, 33%.',
    );
  });

  it('uses the launch sentence when no one has passed the window', () => {
    const takeaway = buildFunnelTakeaway({
      funnel: buildFunnel({
        cohortSize: 0,
        lowestStepStageKey: null,
        overall: {
          finalStageKey: 'SIGNED',
          windowDays: 90,
          eligible: 0,
          reached: 0,
          rate: null,
          soFarRate: null,
          isUnderMinimum: true,
        },
      }),
      formatNumber,
    });

    expect(takeaway).toBe(
      'Tracking started Oct 27, 2026. Conversion appears once people pass the 90-day window.',
    );
    expect(takeaway).not.toContain('0%');
  });

  it('does not quote an overall rate under the minimum sample', () => {
    const takeaway = buildFunnelTakeaway({
      funnel: buildFunnel({
        lowestStepStageKey: null,
        overall: {
          finalStageKey: 'SIGNED',
          windowDays: 90,
          eligible: 5,
          reached: 2,
          rate: 0.4,
          soFarRate: null,
          isUnderMinimum: true,
        },
      }),
      formatNumber,
    });

    expect(takeaway).toBe(
      'Fewer than 30 people have passed the 90-day window so far.',
    );
  });

  it('does not name a lowest step under the minimum sample', () => {
    const takeaway = buildFunnelTakeaway({
      funnel: buildFunnel({
        rows: [
          buildRow('NEW', 'New', 0.1, true),
          buildRow('SIGNED', 'Signed', null),
        ],
      }),
      formatNumber,
    });

    expect(takeaway).toBe('40% of 1,200 reached Signed.');
  });
});
