import { isNonEmptyString } from '@sniptt/guards';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CRM_ANALYTICS_SERIES_LIMITS } from 'src/modules/analytics/constants/crm-analytics-series-limits.constant';
import { CRM_ANALYTICS_SERIES_STAGES } from 'src/modules/analytics/constants/crm-analytics-series-stages.constant';
import { type CrmAnalyticsFilterInput } from 'src/modules/analytics/dtos/crm-analytics-filter.input';
import { type CrmAnalyticsSeriesRequestInput } from 'src/modules/analytics/dtos/crm-analytics-series-request.input';
import {
  type AnalyticsCategoryGroupBy,
  type AnalyticsFilter,
  type AnalyticsPeriod,
  type AnalyticsReportPeriodType,
  type AnalyticsSeriesGroupBy,
  type AnalyticsSeriesRequest,
  type AnalyticsStatusFilter,
  type AnalyticsTrendMetric,
} from 'src/modules/analytics/types/analytics-api.type';

const MAXIMUM_VALUE_LENGTH = 200;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Far older dates pass as real here, but Postgres rejects them or their previous period.
const MINIMUM_LOCAL_DATE = '2000-01-01';
// A range this far ahead would push its equal-length previous period past what Postgres parses.
const MAXIMUM_LOCAL_DATE = '2100-12-31';

const STATUS_FILTERS: AnalyticsStatusFilter[] = [
  'ALL',
  'ACTIVE',
  'SUCCESS',
  'EXITED',
  'UNMAPPED',
  'NO_STAGE',
];
const PERIODS: AnalyticsPeriod[] = ['DAY', 'WEEK', 'MONTH'];
const GROUP_BYS: AnalyticsCategoryGroupBy[] = ['TRACK_PROGRAM', 'SOURCE'];
const TREND_METRICS: AnalyticsTrendMetric[] = [
  'NEW_APPLICATIONS',
  'TOTAL_CONTACTS',
  'ACTIVE_PEOPLE',
  'STAGE_COUNT',
  'OVERALL_CONVERSION',
  'DROP_OFF',
  'MEDIAN_DAYS',
];
const REPORT_PERIOD_TYPES: AnalyticsReportPeriodType[] = ['WEEK', 'MONTH'];
const SERIES_GROUP_BYS: AnalyticsSeriesGroupBy[] = [
  'NONE',
  'TRACK',
  'SOURCE',
  'STAGE',
];
const STAGE_TREND_METRICS: AnalyticsTrendMetric[] = [
  'STAGE_COUNT',
  'DROP_OFF',
  'MEDIAN_DAYS',
];

// Fixed for a request whatever the filter, so a filter change cannot start rejecting it.
const SERIES_COUNT_BY_GROUP_BY: Record<AnalyticsSeriesGroupBy, number> = {
  NONE: 1,
  TRACK: CRM_ANALYTICS_CONFIG.tracks.length,
  SOURCE: CRM_ANALYTICS_SERIES_LIMITS.topSources,
  STAGE: CRM_ANALYTICS_SERIES_STAGES.length,
};

const parseLiteral = <TLiteral extends string>(
  value: string,
  allowedValues: TLiteral[],
  name: string,
): TLiteral => {
  const allowedValue = allowedValues.find((candidate) => candidate === value);

  if (!isDefined(allowedValue)) {
    throw new UserInputError(`Invalid analytics ${name}`);
  }

  return allowedValue;
};

const parseOptionalKey = (
  value: string | null | undefined,
  name: string,
): string | null => {
  if (!isDefined(value)) {
    return null;
  }

  // Postgres rejects a null byte in a text parameter with a server error.
  if (
    !isNonEmptyString(value) ||
    value.length > MAXIMUM_VALUE_LENGTH ||
    value.includes('\0')
  ) {
    throw new UserInputError(`Invalid analytics ${name}`);
  }

  return value;
};

const isRealLocalDate = (value: string): boolean => {
  if (!LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }

  try {
    Temporal.PlainDate.from(value, { overflow: 'reject' });

    return true;
  } catch {
    return false;
  }
};

export const parseCrmAnalyticsLocalDate = (
  value: string,
  name: string,
): string => {
  if (
    !isRealLocalDate(value) ||
    value < MINIMUM_LOCAL_DATE ||
    value > MAXIMUM_LOCAL_DATE
  ) {
    throw new UserInputError(`Invalid analytics ${name}`);
  }

  return value;
};

const parseOptionalLocalDate = (
  value: string | null | undefined,
  name: string,
): string | null =>
  isDefined(value) ? parseCrmAnalyticsLocalDate(value, name) : null;

export const parseCrmAnalyticsFilter = (
  input: CrmAnalyticsFilterInput | null | undefined,
): AnalyticsFilter => {
  const dateFrom = parseOptionalLocalDate(input?.dateFrom, 'dateFrom');
  const dateTo = parseOptionalLocalDate(input?.dateTo, 'dateTo');

  if (isDefined(dateFrom) && isDefined(dateTo) && dateFrom > dateTo) {
    throw new UserInputError('Invalid analytics date range');
  }

  return {
    dateFrom,
    dateTo,
    trackKey: parseOptionalKey(input?.trackKey, 'trackKey'),
    programKey: parseOptionalKey(input?.programKey, 'programKey'),
    sourceKey: parseOptionalKey(input?.sourceKey, 'sourceKey'),
    status: parseLiteral(input?.status ?? 'ALL', STATUS_FILTERS, 'status'),
    period: parseLiteral(input?.period ?? 'WEEK', PERIODS, 'period'),
  };
};

export const parseCrmAnalyticsGroupBy = (
  value: string,
): AnalyticsCategoryGroupBy => parseLiteral(value, GROUP_BYS, 'groupBy');

export const parseCrmAnalyticsTrendMetric = (
  value: string,
): AnalyticsTrendMetric => parseLiteral(value, TREND_METRICS, 'metric');

export const parseCrmAnalyticsStageKey = (
  value: string | null | undefined,
): string | null => parseOptionalKey(value, 'stageKey');

export const parseCrmAnalyticsReportPeriodType = (
  value: string,
): AnalyticsReportPeriodType =>
  parseLiteral(value, REPORT_PERIOD_TYPES, 'periodType');

const parseSeriesRequest = (
  input: CrmAnalyticsSeriesRequestInput,
): AnalyticsSeriesRequest => {
  const metric = parseCrmAnalyticsTrendMetric(input.metric);
  const stageKey = parseCrmAnalyticsStageKey(input.stageKey);
  const groupBy = parseLiteral(input.groupBy, SERIES_GROUP_BYS, 'groupBy');

  if (
    groupBy === 'STAGE' &&
    (isDefined(stageKey) || !STAGE_TREND_METRICS.includes(metric))
  ) {
    throw new UserInputError('Invalid analytics stage grouping');
  }

  return { metric, stageKey, groupBy };
};

export const parseCrmAnalyticsSeriesRequests = (
  inputs: CrmAnalyticsSeriesRequestInput[],
): AnalyticsSeriesRequest[] => {
  const requests = inputs.map(parseSeriesRequest);
  const seriesCount = requests.reduce(
    (total, { groupBy }) => total + SERIES_COUNT_BY_GROUP_BY[groupBy],
    0,
  );

  if (seriesCount > CRM_ANALYTICS_SERIES_LIMITS.maximumSeries) {
    throw new UserInputError('Too many analytics series requested');
  }

  return requests;
};
