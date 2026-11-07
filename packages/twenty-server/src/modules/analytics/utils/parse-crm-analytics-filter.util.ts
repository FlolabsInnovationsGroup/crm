import { isNonEmptyString } from '@sniptt/guards';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type CrmAnalyticsFilterInput } from 'src/modules/analytics/dtos/crm-analytics-filter.input';
import {
  type AnalyticsCategoryGroupBy,
  type AnalyticsFilter,
  type AnalyticsPeriod,
  type AnalyticsReportPeriodType,
  type AnalyticsStatusFilter,
  type AnalyticsTrendMetric,
} from 'src/modules/analytics/types/analytics-api.type';

const MAXIMUM_VALUE_LENGTH = 200;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Far older dates pass as real here, but Postgres rejects them or their previous period.
const MINIMUM_LOCAL_DATE = '2000-01-01';

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
  if (!isRealLocalDate(value) || value < MINIMUM_LOCAL_DATE) {
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
