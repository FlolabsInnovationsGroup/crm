import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { buildAnalyticsReportAnswers } from '@/crm-analytics/utils/buildAnalyticsReportAnswers';

const buildOverallCard = (overall: Partial<AnalyticsReport['funnel']['overall']>) =>
  buildAnalyticsReportAnswers({
    report: {
      comparisons: [],
      newApplications: null,
      newApplicationsPrevious: null,
      funnel: {
        overall: {
          windowDays: 90,
          eligible: 100,
          rate: 0.25,
          soFarRate: null,
          isUnderMinimum: false,
          ...overall,
        },
      },
    } as unknown as AnalyticsReport,
    isPreviousPeriodTracked: true,
    formatNumber: (value) => String(value),
  }).find(({ key }) => key === 'overall-conversion');

describe('buildAnalyticsReportAnswers', () => {
  it('draws a measured rate at full strength', () => {
    expect(buildOverallCard({})).toMatchObject({
      value: '25%',
      isLighter: false,
    });
  });

  it('draws a small sample lighter', () => {
    expect(
      buildOverallCard({ eligible: 12, isUnderMinimum: true }),
    ).toMatchObject({ value: '25%', isLighter: true });
  });

  it('draws a rate still in progress lighter', () => {
    expect(
      buildOverallCard({ eligible: 0, rate: null, soFarRate: 0.1 }),
    ).toMatchObject({ value: '10% so far', isLighter: true });
  });
});
