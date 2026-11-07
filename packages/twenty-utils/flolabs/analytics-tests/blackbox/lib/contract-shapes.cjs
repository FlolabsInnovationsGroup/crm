'use strict';
// The types of contract section 7 as runtime checks. Objects are exact: a missing or an
// extra key both fail, so the API cannot drift from the contract unnoticed.
const show = (value) => {
  const text = JSON.stringify(value);

  return text === undefined ? 'undefined' : text.slice(0, 80);
};

const string = (value, path, errors) => {
  if (typeof value !== 'string') {
    errors.push(`${path}: expected a string, got ${show(value)}`);
  }
};

const dateTime = (value, path, errors) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(`${path}: expected a timestamp, got ${show(value)}`);
  }
};

const localDate = (value, path, errors) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${path}: expected YYYY-MM-DD, got ${show(value)}`);
  }
};

const boolean = (value, path, errors) => {
  if (typeof value !== 'boolean') {
    errors.push(`${path}: expected a boolean, got ${show(value)}`);
  }
};

const number = (value, path, errors) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path}: expected a number, got ${show(value)}`);
  }
};

const count = (value, path, errors) => {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${path}: expected a whole count, got ${show(value)}`);
  }
};

// Rates are fractions 0 to 1 (contract section 6), never percentages.
const rate = (value, path, errors) => {
  if (typeof value !== 'number' || value < 0 || value > 1) {
    errors.push(`${path}: expected a fraction from 0 to 1, got ${show(value)}`);
  }
};

const literal =
  (...allowed) =>
  (value, path, errors) => {
    if (!allowed.includes(value)) {
      errors.push(`${path}: expected one of ${allowed.join(', ')}, got ${show(value)}`);
    }
  };

const nullable = (inner) => (value, path, errors) => {
  if (value !== null) {
    inner(value, path, errors);
  }
};

// A key the contract marks with ?: it may be absent, but never of the wrong type.
const optional = (inner) => {
  const validate = (value, path, errors) => inner(value, path, errors);

  validate.isOptional = true;

  return validate;
};

const arrayOf = (inner) => (value, path, errors) => {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array, got ${show(value)}`);

    return;
  }

  value.forEach((item, index) => inner(item, `${path}[${index}]`, errors));
};

const object = (shape) => (value, path, errors) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path}: expected an object, got ${show(value)}`);

    return;
  }

  for (const key of Object.keys(shape)) {
    if (!(key in value)) {
      if (!shape[key].isOptional) {
        errors.push(`${path}.${key}: missing`);
      }
    } else {
      shape[key](value[key], `${path}.${key}`, errors);
    }
  }

  for (const key of Object.keys(value)) {
    if (!(key in shape)) {
      errors.push(`${path}.${key}: not in contract section 7`);
    }
  }
};

const BASE = {
  asOf: dateTime,
  trackingStartedAt: dateTime,
  reportingTimeZone: string,
  minimumSample: count,
};

const STAGE_KIND = literal('MAIN', 'EXIT', 'OTHER');
const FIELD_STATUS = literal('OK', 'MISSING', 'WRONG_TYPE');
const PERIOD = literal('DAY', 'WEEK', 'MONTH');
const TREND_METRIC = literal(
  'NEW_APPLICATIONS',
  'TOTAL_CONTACTS',
  'ACTIVE_PEOPLE',
  'STAGE_COUNT',
  'OVERALL_CONVERSION',
  'DROP_OFF',
  'MEDIAN_DAYS',
);
const OPTION = object({ key: string, label: string });

const STAGE_DEFINITION = object({
  stageKey: string,
  label: string,
  kind: STAGE_KIND,
  rank: nullable(count),
  limitDays: nullable(count),
  windowDays: nullable(count),
  isSuccess: boolean,
});

const META = object({
  ...BASE,
  state: literal('DISABLED', 'NO_STAGE_FIELD', 'NEVER_SYNCED', 'READY'),
  isProvisional: boolean,
  showSignedFigure: boolean,
  sync: object({
    lastSuccessfulSyncAt: nullable(dateTime),
    lastReconciliationAt: nullable(dateTime),
    lastAttemptAt: nullable(dateTime),
    lastAttemptStatus: nullable(literal('OK', 'FAILED', 'SKIPPED')),
    isStale: boolean,
    restoredInLastReconciliation: nullable(count),
  }),
  fields: object({
    stage: FIELD_STATUS,
    isStageAuditLogged: boolean,
    positionsAppliedFor: FIELD_STATUS,
    applicantSource: FIELD_STATUS,
    hasFormSubmissionObject: boolean,
    hasApplicationObject: boolean,
  }),
  stages: arrayOf(STAGE_DEFINITION),
  tracks: arrayOf(OPTION),
  programs: arrayOf(object({ key: string, label: string, trackKey: string })),
  sources: arrayOf(OPTION),
});

const OVERVIEW = object({
  ...BASE,
  importedExcludedByDate: count,
  figures: object({
    totalContacts: count,
    activePeople: count,
    newApplications: nullable(count),
    newApplicationsPrevious: nullable(count),
    newApplicationsFrom: string,
    newApplicationsTo: string,
    importedApplications: nullable(count),
    stuckPeople: count,
    inactivePeople: count,
    signedPeople: nullable(count),
  }),
  stageTotals: arrayOf(
    object({
      rowKey: string,
      label: string,
      rowKind: literal('MAIN', 'NESTED', 'EXIT', 'OTHER', 'UNMAPPED', 'NO_STAGE'),
      parentStageKey: nullable(string),
      count,
      pastLimitCount: nullable(count),
    }),
  ),
  stuck: object({
    rows: arrayOf(
      object({
        personId: string,
        displayName: string,
        stageKey: string,
        stageLabel: string,
        stageEnteredAt: dateTime,
        daysInStage: number,
        daysOverLimit: nullable(number),
        isLowerBound: boolean,
      }),
    ),
    total: count,
    hasLimits: boolean,
  }),
});

const FUNNEL = object({
  ...BASE,
  cohortSize: count,
  cohortExcludedUnmapped: count,
  overall: object({
    finalStageKey: nullable(string),
    windowDays: count,
    eligible: count,
    reached: count,
    rate: nullable(rate),
    soFarRate: nullable(rate),
    isUnderMinimum: boolean,
  }),
  rows: arrayOf(
    object({
      stageKey: string,
      label: string,
      windowDays: nullable(count),
      entered: count,
      eligible: count,
      reachedNext: count,
      timedOut: count,
      exited: count,
      inWindow: count,
      stepRate: nullable(rate),
      soFarRate: nullable(rate),
      dropOffRate: nullable(rate),
      isUnderMinimum: boolean,
      medianDays: nullable(number),
      completedStays: count,
    }),
  ),
  lowestStepStageKey: nullable(string),
});

const CATEGORIES = object({
  ...BASE,
  groupBy: literal('TRACK_PROGRAM', 'SOURCE'),
  distinctPeople: count,
  peopleInSeveral: count,
  peopleInSeveralTracks: count,
  stepStageKeys: arrayOf(string),
  rows: arrayOf(
    object({
      key: string,
      parentKey: nullable(string),
      label: string,
      isUnmapped: boolean,
      people: count,
      activePeople: count,
      newApplications: nullable(count),
      cohortSize: count,
      overallEligible: count,
      overallRate: nullable(rate),
      overallSoFarRate: nullable(rate),
      stepRates: arrayOf(
        object({
          stageKey: string,
          eligible: count,
          rate: nullable(rate),
          soFarRate: nullable(rate),
        }),
      ),
    }),
  ),
});

const COHORT_ROW = object({
  bucketStart: string,
  size: count,
  cells: arrayOf(
    object({
      stageKey: string,
      entered: count,
      eligible: count,
      rate: nullable(rate),
      soFarRate: nullable(rate),
      isMature: boolean,
    }),
  ),
  overallRate: nullable(rate),
  overallSoFarRate: nullable(rate),
});

const MOVEMENT_ROW = object({
  stageKey: string,
  label: string,
  enteredInPeriod: count,
  leftInPeriod: count,
  countNow: count,
});

const TRENDS = object({
  ...BASE,
  metric: TREND_METRIC,
  stageKey: nullable(string),
  period: PERIOD,
  unavailableReason: nullable(
    literal('DAILY_RATE', 'SNAPSHOT_FILTER_COMBINATION', 'NO_SUBMISSION_OBJECT'),
  ),
  series: arrayOf(
    object({
      bucketStart: string,
      value: nullable(number),
      previousValue: nullable(number),
      size: nullable(count),
      previousSize: nullable(count),
      isPartial: boolean,
    }),
  ),
  cohorts: arrayOf(COHORT_ROW),
  movement: object({ from: string, to: string, rows: arrayOf(MOVEMENT_ROW) }),
});

const REPORT_LIST_ITEM_SHAPE = {
  periodType: literal('WEEK', 'MONTH'),
  periodStart: localDate,
  periodEnd: localDate,
  generatedAt: dateTime,
};

const REPORT_LIST = arrayOf(object(REPORT_LIST_ITEM_SHAPE));

const REPORT = object({
  ...REPORT_LIST_ITEM_SHAPE,
  ...BASE,
  isProvisional: optional(boolean),
  payloadVersion: optional(count),
  newApplications: nullable(count),
  newApplicationsPrevious: nullable(count),
  categories: CATEGORIES,
  funnel: FUNNEL,
  movement: arrayOf(MOVEMENT_ROW),
  stuckByStage: arrayOf(object({ stageKey: string, label: string, count })),
  comparisons: arrayOf(
    object({
      metricKey: string,
      label: string,
      current: nullable(number),
      previous: nullable(number),
      isSignificant: boolean,
    }),
  ),
  cohorts: arrayOf(COHORT_ROW),
});

// Returns the list of mismatches, empty when the value matches the contract type.
const check = (shape, value) => {
  const errors = [];

  shape(value, 'payload', errors);

  return errors;
};

module.exports = {
  check,
  META,
  OVERVIEW,
  FUNNEL,
  CATEGORIES,
  TRENDS,
  REPORT_LIST,
  REPORT,
};
