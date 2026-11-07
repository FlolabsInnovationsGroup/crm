export type AnalyticsPeriod = 'DAY' | 'WEEK' | 'MONTH';
export type AnalyticsStatusFilter = 'ALL' | 'ACTIVE' | 'SUCCESS' | 'EXITED' | 'UNMAPPED' | 'NO_STAGE';
export type AnalyticsPageState = 'DISABLED' | 'NO_STAGE_FIELD' | 'NEVER_SYNCED' | 'READY';
export type AnalyticsFieldStatus = 'OK' | 'MISSING' | 'WRONG_TYPE';
export type AnalyticsStageKind = 'MAIN' | 'EXIT' | 'OTHER';
export type AnalyticsCategoryGroupBy = 'TRACK_PROGRAM' | 'SOURCE';
export type AnalyticsTrendMetric = 'NEW_APPLICATIONS' | 'TOTAL_CONTACTS' | 'ACTIVE_PEOPLE' | 'STAGE_COUNT' | 'OVERALL_CONVERSION' | 'DROP_OFF' | 'MEDIAN_DAYS';
export type AnalyticsReportPeriodType = 'WEEK' | 'MONTH';

export type AnalyticsFilter = {
  dateFrom: string | null; // YYYY-MM-DD local, inclusive
  dateTo: string | null; // YYYY-MM-DD local, inclusive
  trackKey: string | null;
  programKey: string | null;
  sourceKey: string | null;
  status: AnalyticsStatusFilter;
  period: AnalyticsPeriod;
};

export type AnalyticsBase = {
  asOf: string;
  trackingStartedAt: string;
  reportingTimeZone: string;
  minimumSample: number;
};

export type AnalyticsOption = { key: string; label: string };
export type AnalyticsProgramOption = AnalyticsOption & { trackKey: string };

export type AnalyticsStageDefinition = {
  stageKey: string;
  label: string;
  kind: AnalyticsStageKind;
  rank: number | null;
  limitDays: number | null;
  windowDays: number | null;
  isSuccess: boolean;
};

export type AnalyticsSyncState = {
  lastSuccessfulSyncAt: string | null;
  lastReconciliationAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: 'OK' | 'FAILED' | 'SKIPPED' | null;
  isStale: boolean;
  restoredInLastReconciliation: number | null;
};

export type AnalyticsMeta = AnalyticsBase & {
  state: AnalyticsPageState;
  isProvisional: boolean;
  showSignedFigure: boolean;
  sync: AnalyticsSyncState;
  fields: {
    stage: AnalyticsFieldStatus;
    isStageAuditLogged: boolean;
    positionsAppliedFor: AnalyticsFieldStatus;
    applicantSource: AnalyticsFieldStatus;
    hasFormSubmissionObject: boolean;
    hasApplicationObject: boolean;
  };
  stages: AnalyticsStageDefinition[];
  tracks: AnalyticsOption[];
  programs: AnalyticsProgramOption[];
  sources: AnalyticsOption[];
};

export type AnalyticsStageTotalRow = {
  rowKey: string;
  label: string;
  rowKind: 'MAIN' | 'NESTED' | 'EXIT' | 'OTHER' | 'UNMAPPED' | 'NO_STAGE';
  parentStageKey: string | null;
  count: number;
  pastLimitCount: number | null;
};

export type AnalyticsStuckRow = {
  personId: string;
  displayName: string;
  stageKey: string;
  stageLabel: string;
  stageEnteredAt: string;
  daysInStage: number;
  daysOverLimit: number | null;
  isLowerBound: boolean;
};

export type AnalyticsOverview = AnalyticsBase & {
  importedExcludedByDate: number;
  figures: {
    totalContacts: number;
    activePeople: number;
    newApplications: number | null;
    newApplicationsPrevious: number | null;
    newApplicationsFrom: string;
    newApplicationsTo: string;
    importedApplications: number | null;
    stuckPeople: number;
    inactivePeople: number;
    signedPeople: number | null;
  };
  stageTotals: AnalyticsStageTotalRow[];
  stuck: { rows: AnalyticsStuckRow[]; total: number; hasLimits: boolean };
};

export type AnalyticsFunnelRow = {
  stageKey: string;
  label: string;
  windowDays: number | null;
  entered: number;
  eligible: number;
  reachedNext: number;
  timedOut: number;
  exited: number;
  inWindow: number;
  stepRate: number | null;
  soFarRate: number | null;
  dropOffRate: number | null;
  isUnderMinimum: boolean;
  medianDays: number | null;
  completedStays: number;
};

export type AnalyticsOverallConversion = {
  finalStageKey: string | null;
  windowDays: number;
  eligible: number;
  reached: number;
  rate: number | null;
  soFarRate: number | null;
  isUnderMinimum: boolean;
};

export type AnalyticsFunnel = AnalyticsBase & {
  cohortSize: number;
  cohortExcludedUnmapped: number;
  overall: AnalyticsOverallConversion;
  rows: AnalyticsFunnelRow[];
  lowestStepStageKey: string | null;
};

export type AnalyticsStepRate = {
  stageKey: string;
  eligible: number;
  rate: number | null;
  soFarRate: number | null;
};

export type AnalyticsCategoryRow = {
  key: string;
  parentKey: string | null;
  label: string;
  isUnmapped: boolean;
  people: number;
  activePeople: number;
  newApplications: number | null;
  cohortSize: number;
  overallEligible: number;
  overallRate: number | null;
  overallSoFarRate: number | null;
  stepRates: AnalyticsStepRate[];
};

export type AnalyticsCategories = AnalyticsBase & {
  groupBy: AnalyticsCategoryGroupBy;
  distinctPeople: number;
  peopleInSeveral: number;
  peopleInSeveralTracks: number;
  stepStageKeys: string[];
  rows: AnalyticsCategoryRow[];
};

export type AnalyticsTrendPoint = {
  bucketStart: string;
  value: number | null;
  previousValue: number | null;
  size: number | null;
  previousSize: number | null;
  isPartial: boolean;
};

export type AnalyticsCohortCell = {
  stageKey: string;
  entered: number;
  eligible: number;
  rate: number | null;
  soFarRate: number | null;
  isMature: boolean;
};

export type AnalyticsCohortRow = {
  bucketStart: string;
  size: number;
  cells: AnalyticsCohortCell[];
  overallRate: number | null;
  overallSoFarRate: number | null;
};

export type AnalyticsMovementRow = {
  stageKey: string;
  label: string;
  enteredInPeriod: number;
  leftInPeriod: number;
  countNow: number;
};

export type AnalyticsTrends = AnalyticsBase & {
  metric: AnalyticsTrendMetric;
  stageKey: string | null;
  period: AnalyticsPeriod;
  unavailableReason: 'DAILY_RATE' | 'SNAPSHOT_FILTER_COMBINATION' | 'NO_SUBMISSION_OBJECT' | null;
  series: AnalyticsTrendPoint[];
  cohorts: AnalyticsCohortRow[];
  movement: { from: string; to: string; rows: AnalyticsMovementRow[] };
};

export type AnalyticsReportListItem = {
  periodType: AnalyticsReportPeriodType;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
};

export type AnalyticsReportComparison = {
  metricKey: string;
  label: string;
  current: number | null;
  previous: number | null;
  isSignificant: boolean;
};

export type AnalyticsReport = AnalyticsReportListItem & AnalyticsBase & {
  isProvisional?: boolean;
  payloadVersion?: number;
  newApplications: number | null;
  newApplicationsPrevious: number | null;
  categories: AnalyticsCategories;
  funnel: AnalyticsFunnel;
  movement: AnalyticsMovementRow[];
  stuckByStage: { stageKey: string; label: string; count: number }[];
  comparisons: AnalyticsReportComparison[];
  cohorts: AnalyticsCohortRow[];
};
