import {
  buildEmptyReportFixture,
  buildWeeklyReportFixture,
} from '@/crm-analytics/report-pdf/__tests__/analyticsPdfFixtures';
import { buildAnalyticsPdfAnswers } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfAnswers';
import { buildAnalyticsPdfKeyFigures } from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfKeyFigures';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';

const getAnswer = (report: AnalyticsReport, key: string) =>
  buildAnalyticsPdfAnswers(report).find((answer) => answer.key === key)?.answer;

const getFigure = (report: AnalyticsReport, key: string) =>
  buildAnalyticsPdfKeyFigures(report).find((figure) => figure.key === key);

describe('buildAnalyticsPdfAnswers', () => {
  it('names real stages and numbers from the report', () => {
    const report = buildWeeklyReportFixture();

    expect(getAnswer(report, 'OVERALL')).toBe(
      '6% of 190 people reached Signed within 90 days. All applications since tracking start.',
    );
    expect(getAnswer(report, 'LOWEST_STEP')).toBe(
      'Contacted to Before meeting: 62% moved on, of 252 people.',
    );
    expect(getAnswer(report, 'SLOWEST_STAGE')).toBe(
      'Contacted: a median of 6 days, from 156 completed stays.',
    );
    expect(getAnswer(report, 'STUCK')).toBe(
      '37 people past their stage limit, most in Contacted: 18.',
    );
  });

  it('asks the question the lowest step actually answers', () => {
    const question = buildAnalyticsPdfAnswers(buildWeeklyReportFixture()).find(
      ({ key }) => key === 'LOWEST_STEP',
    )?.question;

    expect(question).toBe('Which step has the lowest conversion?');
  });

  it('never names the last stage as slowest, because its chart leaves that stage out', () => {
    const report = buildWeeklyReportFixture();
    const lastIndex = report.funnel.rows.length - 1;
    const rows = report.funnel.rows.map((row, rowIndex) =>
      rowIndex === lastIndex
        ? { ...row, medianDays: 500, completedStays: 500 }
        : row,
    );

    expect(
      getAnswer(
        { ...report, funnel: { ...report.funnel, rows } },
        'SLOWEST_STAGE',
      ),
    ).toBe('Contacted: a median of 6 days, from 156 completed stays.');
  });

  it('says one sentence when the largest track also converts best', () => {
    const report = buildWeeklyReportFixture();
    const rows = report.categories.rows.map((row) =>
      row.key === 'AI_SOFTWARE' ? { ...row, overallRate: 0.4 } : row,
    );

    expect(
      getAnswer(
        { ...report, categories: { ...report.categories, rows } },
        'TRACKS',
      ),
    ).toBe(
      'Artificial Intelligence & Software Engineering is largest, with 168 people, and converts best: 40% of 72 people.',
    );
  });

  it('does not compare a small group with the firm ones', () => {
    const report = buildWeeklyReportFixture();

    expect(getAnswer(report, 'TRACKS')).toContain(
      'Business Management, Growth & Entrepreneurship converts best: 11% of 58 people.',
    );
  });

  it('stays honest when a report has no data yet', () => {
    const report = buildEmptyReportFixture();

    expect(getAnswer(report, 'OVERALL')).toBe(
      'Too early to tell: people need 90 days to count.',
    );
    expect(getAnswer(report, 'LOWEST_STEP')).toBe(
      'Not enough people have passed a step to compare them yet.',
    );
    expect(getAnswer(report, 'STUCK')).toBe(
      'No one is past their stage limit.',
    );
  });
});

describe('buildAnalyticsPdfKeyFigures', () => {
  it('prints the change in new applications against the previous period', () => {
    expect(
      getFigure(buildWeeklyReportFixture(), 'NEW_APPLICATIONS')?.detail,
    ).toBe('+25 against the previous period, 61.');
  });

  it('says what the whole-history and current figures cover', () => {
    const report = buildWeeklyReportFixture();

    expect(getFigure(report, 'OVERALL_CONVERSION')?.detail).toContain(
      'All applications since tracking start.',
    );
    expect(getFigure(report, 'PAST_STAGE_LIMIT')?.detail).toContain(
      'When this report was generated.',
    );
  });

  it('prints a dash for unknown figures', () => {
    const report = buildEmptyReportFixture();

    expect(getFigure(report, 'NEW_APPLICATIONS')?.value).toBe('–');
    expect(getFigure(report, 'OVERALL_CONVERSION')?.value).toBe('–');
  });

  it('does not compare with a period before tracking started', () => {
    const report = {
      ...buildWeeklyReportFixture(),
      trackingStartedAt: '2026-11-01T00:00:00.000Z',
    };

    expect(getFigure(report, 'NEW_APPLICATIONS')?.detail).toBe(
      'No earlier period to compare with yet.',
    );
  });
});
