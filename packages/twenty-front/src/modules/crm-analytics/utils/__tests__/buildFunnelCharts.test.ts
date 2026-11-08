import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelAnswerCards } from '@/crm-analytics/utils/buildFunnelAnswerCards';
import {
  buildFunnelChartSteps,
  buildStageDurationRows,
  buildStageOutcomeRows,
  buildStepConversionColumns,
} from '@/crm-analytics/utils/buildFunnelCharts';

const formatNumber = (value: number, options?: { decimals?: number }) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: options?.decimals ?? 0,
    maximumFractionDigits: options?.decimals ?? 0,
  });

const buildRow = (
  stageKey: string,
  label: string,
  overrides: Partial<AnalyticsFunnelRow> = {},
): AnalyticsFunnelRow => ({
  stageKey,
  label,
  windowDays: 14,
  entered: 120,
  eligible: 100,
  reachedNext: 60,
  timedOut: 30,
  exited: 10,
  inWindow: 20,
  stepRate: 0.6,
  soFarRate: 0.7,
  dropOffRate: 0.4,
  isUnderMinimum: false,
  medianDays: 5,
  completedStays: 40,
  ...overrides,
});

const SIGNED_ROW = buildRow('SIGNED', 'Signed', {
  eligible: 0,
  reachedNext: 0,
  timedOut: 0,
  exited: 0,
  inWindow: 0,
  stepRate: null,
  soFarRate: null,
  dropOffRate: null,
  isUnderMinimum: true,
  medianDays: null,
  completedStays: 0,
});

const buildFunnel = (
  rows: AnalyticsFunnelRow[],
  overrides: Partial<AnalyticsFunnel> = {},
): AnalyticsFunnel => ({
  asOf: '2026-11-07T10:00:00.000Z',
  trackingStartedAt: '2026-10-27T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
  cohortSize: 120,
  cohortExcludedUnmapped: 0,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 80,
    reached: 8,
    rate: 0.1,
    soFarRate: 0.12,
    isUnderMinimum: false,
  },
  rows,
  lowestStepStageKey: null,
  ...overrides,
});

describe('buildFunnelAnswerCards', () => {
  it('names real stages and numbers', () => {
    const [overall, biggestDrop, slowest] = buildFunnelAnswerCards({
      funnel: buildFunnel([
        buildRow('NEW', 'New'),
        buildRow('CONTACTED', 'Contacted', {
          reachedNext: 25,
          stepRate: 0.25,
          dropOffRate: 0.75,
          medianDays: 12.5,
        }),
        SIGNED_ROW,
      ]),
      formatNumber,
    });

    expect(overall.value).toBe('10%');
    expect(overall.isLighter).toBe(false);
    expect(overall.detail).toBe(
      '8 of 80 people reached Signed within 90 days.',
    );
    expect(biggestDrop.value).toBe('75%');
    expect(biggestDrop.detail).toBe(
      'From Contacted to Signed. 75 of 100 people did not move on within 14 days.',
    );
    expect(slowest.value).toBe('12.5 days');
    expect(slowest.detail).toBe(
      'Typical stay in Contacted, from 40 finished stays.',
    );
  });

  // The server's lowest step skips the first step whenever a later one has enough people.
  it('finds the biggest drop itself rather than trusting the lowest step', () => {
    const [, biggestDrop] = buildFunnelAnswerCards({
      funnel: buildFunnel(
        [
          buildRow('NEW', 'New', {
            reachedNext: 10,
            stepRate: 0.1,
            dropOffRate: 0.9,
          }),
          buildRow('CONTACTED', 'Contacted'),
          SIGNED_ROW,
        ],
        { lowestStepStageKey: 'CONTACTED' },
      ),
      formatNumber,
    });

    expect(biggestDrop.value).toBe('90%');
    expect(biggestDrop.detail).toContain('From New to Contacted');
  });

  it('never names a drop or a slowest stage from too few people', () => {
    const [, biggestDrop, slowest] = buildFunnelAnswerCards({
      funnel: buildFunnel([
        buildRow('NEW', 'New', {
          eligible: 6,
          reachedNext: 1,
          isUnderMinimum: true,
          dropOffRate: 0.83,
          completedStays: 4,
        }),
        SIGNED_ROW,
      ]),
      formatNumber,
    });

    expect(biggestDrop.value).toBeNull();
    expect(slowest.value).toBeNull();
  });

  it('shows no value for an overall conversion nobody can know yet', () => {
    const [overall] = buildFunnelAnswerCards({
      funnel: buildFunnel([buildRow('NEW', 'New'), SIGNED_ROW], {
        overall: {
          finalStageKey: 'SIGNED',
          windowDays: 90,
          eligible: 0,
          reached: 0,
          rate: null,
          soFarRate: 0,
          isUnderMinimum: true,
        },
      }),
      formatNumber,
    });

    expect(overall.value).toBeNull();
    expect(overall.detail).toBe('Shows once people have had 90 days to reach the end.');
  });

  it('says so far for an overall conversion still in progress', () => {
    const [overall] = buildFunnelAnswerCards({
      funnel: buildFunnel([buildRow('NEW', 'New'), SIGNED_ROW], {
        overall: {
          finalStageKey: 'SIGNED',
          windowDays: 90,
          eligible: 0,
          reached: 0,
          rate: null,
          soFarRate: 0.12,
          isUnderMinimum: true,
        },
      }),
      formatNumber,
    });

    expect(overall.value).toBe('12% so far');
    expect(overall.isLighter).toBe(true);
  });
});

describe('buildFunnelChartSteps', () => {
  it('counts people reached and reports the step rate, not a ratio of counts', () => {
    const [newStep] = buildFunnelChartSteps({
      funnel: buildFunnel([
        buildRow('NEW', 'New'),
        buildRow('CONTACTED', 'Contacted', { entered: 90 }),
      ]),
      formatNumber,
    });

    expect(newStep.count).toBe(120);
    expect(newStep.moveOnLabel).toBe('60%');
    expect(newStep.isMoveOnMuted).toBe(false);
    expect(newStep.moveOnTooltip?.title).toBe('New to Contacted');
    expect(newStep.moveOnTooltip?.rows).toContainEqual({
      label: 'Moved on',
      value: '60 of 100 people',
    });
  });

  it('draws a small group lighter with its count in the tooltip', () => {
    const [newStep] = buildFunnelChartSteps({
      funnel: buildFunnel([
        buildRow('NEW', 'New', {
          eligible: 14,
          reachedNext: 6,
          stepRate: 0.43,
          isUnderMinimum: true,
        }),
        SIGNED_ROW,
      ]),
      formatNumber,
    });

    expect(newStep.isMoveOnMuted).toBe(true);
    expect(newStep.moveOnTooltip?.rows).toContainEqual({
      label: 'Moved on',
      value: '6 of 14 people',
    });
  });

  it('gives the last stage no tooltip for moving on, since it has no next step', () => {
    const steps = buildFunnelChartSteps({
      funnel: buildFunnel([buildRow('NEW', 'New'), SIGNED_ROW]),
      formatNumber,
    });

    expect(steps[1].moveOnTooltip).toBeUndefined();
  });

  it('shows no percent when a step is unknown', () => {
    const [newStep] = buildFunnelChartSteps({
      funnel: buildFunnel([
        buildRow('NEW', 'New', {
          eligible: 0,
          reachedNext: 0,
          stepRate: null,
          soFarRate: 0,
        }),
        SIGNED_ROW,
      ]),
      formatNumber,
    });

    expect(newStep.moveOnLabel).toBeNull();
  });
});

describe('buildStepConversionColumns', () => {
  it('leaves the final stage out and draws nothing for an unknown step', () => {
    const columns = buildStepConversionColumns({
      funnel: buildFunnel([
        buildRow('NEW', 'New'),
        buildRow('CONTACTED', 'Contacted', {
          eligible: 0,
          reachedNext: 0,
          stepRate: null,
          soFarRate: null,
        }),
        buildRow('MEETING', 'Meeting', {
          eligible: 0,
          reachedNext: 0,
          stepRate: null,
          soFarRate: 0.2,
        }),
        SIGNED_ROW,
      ]),
      formatNumber,
    });

    expect(columns.map(({ key }) => key)).toEqual([
      'NEW',
      'CONTACTED',
      'MEETING',
    ]);
    expect(columns[0].segments[0].value).toBe(0.6);
    expect(columns[1].segments).toEqual([]);
    expect(columns[2].valueLabel).toBe('20% so far');
    expect(columns[2].isSmallSample).toBe(true);
  });
});

describe('buildStageOutcomeRows', () => {
  it('draws a stage under the minimum sample lighter', () => {
    const [smallRow] = buildStageOutcomeRows(
      buildFunnel([buildRow('NEW', 'New', { entered: 3 }), SIGNED_ROW]),
    );
    const [largeRow] = buildStageOutcomeRows(
      buildFunnel([buildRow('NEW', 'New'), SIGNED_ROW]),
    );

    expect(smallRow.isSmallSample).toBe(true);
    expect(largeRow.isSmallSample).toBe(false);
  });

  it('splits everyone who entered into the four outcomes', () => {
    const [newRow] = buildStageOutcomeRows(
      buildFunnel([buildRow('NEW', 'New'), SIGNED_ROW]),
    );

    expect(newRow.segments.map(({ label, value }) => [label, value])).toEqual([
      ['Moved on', 60],
      ['Stalled', 30],
      ['Left', 10],
      ['Still in progress', 20],
    ]);
    expect(newRow.segments.reduce((sum, { value }) => sum + value, 0)).toBe(
      120,
    );
  });

  it('draws nothing for a stage nobody reached', () => {
    const [newRow] = buildStageOutcomeRows(
      buildFunnel([buildRow('NEW', 'New', { entered: 0 }), SIGNED_ROW]),
    );

    expect(newRow.segments).toEqual([]);
  });
});

describe('buildStageDurationRows', () => {
  it('marks the stage limit and lightens a small group', () => {
    const [newRow, contactedRow] = buildStageDurationRows({
      funnel: buildFunnel([
        buildRow('NEW', 'New', { medianDays: 4.5 }),
        buildRow('CONTACTED', 'Contacted', { completedStays: 3 }),
        SIGNED_ROW,
      ]),
      stages: [{ stageKey: 'NEW', limitDays: 14 }],
      formatNumber,
    });

    expect(newRow.valueLabel).toBe('4.5 days');
    expect(newRow.tickValue).toBe(14);
    expect(newRow.isSmallSample).toBe(false);
    expect(contactedRow.tickValue).toBeUndefined();
    expect(contactedRow.isSmallSample).toBe(true);
  });

  it('shows no bar when the median is unknown', () => {
    const [newRow] = buildStageDurationRows({
      funnel: buildFunnel([
        buildRow('NEW', 'New', { medianDays: null, completedStays: 0 }),
        SIGNED_ROW,
      ]),
      stages: [],
      formatNumber,
    });

    expect(newRow.segments).toEqual([]);
    expect(newRow.valueLabel).toBeUndefined();
  });
});
