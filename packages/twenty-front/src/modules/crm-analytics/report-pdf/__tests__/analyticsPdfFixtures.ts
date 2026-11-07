import {
  type AnalyticsCategoryRow,
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
  type AnalyticsMovementRow,
  type AnalyticsReport,
  type AnalyticsSeries,
  type AnalyticsTrendMetric,
} from '@/crm-analytics/types/AnalyticsApi';

const BASE = {
  asOf: '2026-11-09T02:30:00.000Z',
  trackingStartedAt: '2026-05-04T00:00:00.000Z',
  reportingTimeZone: 'UTC',
  minimumSample: 30,
};

type FunnelStageInput = [
  stageKey: string,
  label: string,
  entered: number,
  eligible: number,
  reachedNext: number,
  exited: number,
  medianDays: number | null,
  completedStays: number,
];

const STAGE_INPUTS: FunnelStageInput[] = [
  ['NEW', 'New', 412, 340, 278, 18, 2.5, 278],
  ['CONTACTED', 'Contacted', 302, 252, 156, 41, 6, 156],
  ['BEFORE_MEETING', 'Before meeting', 176, 140, 98, 9, 4.5, 98],
  ['SATURDAY_MEETING', 'Saturday meeting', 112, 88, 61, 6, 5, 61],
  ['ATTENDED', 'Attended', 70, 52, 38, 3, 3, 38],
  ['SECOND_MEETING', 'Second meeting', 44, 26, 17, 2, 7.5, 17],
  ['AGREEMENT_SENT', 'Agreement sent', 23, 14, 9, 1, 11.5, 9],
  ['SIGNED', 'Signed', 12, 0, 0, 0, null, 0],
];

const buildFunnelRow = ([
  stageKey,
  label,
  entered,
  eligible,
  reachedNext,
  exited,
  medianDays,
  completedStays,
]: FunnelStageInput): AnalyticsFunnelRow => ({
  stageKey,
  label,
  windowDays: stageKey === 'SIGNED' ? null : 14,
  entered,
  eligible,
  reachedNext,
  timedOut: eligible - reachedNext - exited,
  exited,
  inWindow: entered - eligible,
  stepRate: eligible > 0 ? reachedNext / eligible : null,
  soFarRate: entered > 0 ? reachedNext / entered : null,
  dropOffRate: eligible > 0 ? (eligible - reachedNext) / eligible : null,
  isUnderMinimum: eligible < BASE.minimumSample,
  medianDays,
  completedStays,
});

const buildFunnel = (rows: AnalyticsFunnelRow[]): AnalyticsFunnel => ({
  ...BASE,
  cohortSize: 412,
  cohortExcludedUnmapped: 3,
  overall: {
    finalStageKey: 'SIGNED',
    windowDays: 90,
    eligible: 190,
    reached: 11,
    rate: 11 / 190,
    soFarRate: 12 / 412,
    isUnderMinimum: false,
  },
  rows,
  lowestStepStageKey: 'CONTACTED',
});

const STEP_RATE_SHAPES: [number, number][] = [
  [0.82, 1],
  [0.62, 1],
  [0.7, 0.62],
  [0.69, 0.45],
  [0.73, 0.32],
  [0.65, 0.2],
  [0.64, 0.12],
];

const buildStepRates = (
  rows: AnalyticsFunnelRow[],
  eligibleShare: number,
  rateShift = 0,
) =>
  rows.slice(0, -1).map((row, rowIndex) => {
    const [rate, shape] = STEP_RATE_SHAPES[rowIndex % STEP_RATE_SHAPES.length];
    const eligible = Math.round(row.eligible * eligibleShare * shape);

    return {
      stageKey: row.stageKey,
      eligible,
      rate: eligible > 0 ? Math.min(rate + rateShift, 0.97) : null,
      soFarRate: (rate + rateShift) * (eligible > 0 ? 0.8 : 0.4),
    };
  });

type CategoryInput = {
  key: string;
  label: string;
  parentKey?: string;
  isUnmapped?: boolean;
  people: number;
  activePeople: number;
  newApplications: number | null;
  overallEligible: number;
  overallRate: number | null;
  overallSoFarRate: number | null;
  eligibleShare: number;
  rateShift?: number;
};

const buildCategoryRow = (
  rows: AnalyticsFunnelRow[],
  {
    key,
    label,
    parentKey,
    isUnmapped = false,
    people,
    activePeople,
    newApplications,
    overallEligible,
    overallRate,
    overallSoFarRate,
    eligibleShare,
    rateShift,
  }: CategoryInput,
): AnalyticsCategoryRow => ({
  key,
  parentKey: parentKey ?? null,
  label,
  isUnmapped,
  people,
  activePeople,
  newApplications,
  cohortSize: Math.round(people * 0.8),
  overallEligible,
  overallRate,
  overallSoFarRate,
  stepRates: buildStepRates(rows, eligibleShare, rateShift),
});

const TRACK_INPUTS: CategoryInput[] = [
  {
    key: 'AI_SOFTWARE',
    label: 'Artificial Intelligence & Software Engineering',
    people: 168,
    activePeople: 121,
    newApplications: 34,
    overallEligible: 72,
    overallRate: 0.083,
    overallSoFarRate: 0.06,
    eligibleShare: 0.4,
    rateShift: 0.06,
  },
  {
    key: 'BUSINESS',
    label: 'Business Management, Growth & Entrepreneurship',
    people: 139,
    activePeople: 96,
    newApplications: 22,
    overallEligible: 58,
    overallRate: 0.11,
    overallSoFarRate: 0.08,
    eligibleShare: 0.32,
    rateShift: -0.07,
  },
  {
    key: 'ROBOTICS',
    label: 'Robotics & Intelligent Systems',
    people: 74,
    activePeople: 52,
    newApplications: 11,
    overallEligible: 24,
    overallRate: 0.125,
    overallSoFarRate: 0.09,
    eligibleShare: 0.16,
    rateShift: 0.14,
  },
  {
    key: 'DESIGN_COMMUNICATION',
    label: 'Design & Technical Communication',
    people: 61,
    activePeople: 40,
    newApplications: 7,
    overallEligible: 0,
    overallRate: null,
    overallSoFarRate: 0.105,
    eligibleShare: 0.09,
    rateShift: -0.02,
  },
  {
    key: 'EMERGING_SCIENCES',
    label: 'Emerging Sciences & Technology',
    people: 38,
    activePeople: 29,
    newApplications: 5,
    overallEligible: 0,
    overallRate: null,
    overallSoFarRate: null,
    eligibleShare: 0.04,
  },
  {
    key: 'NONE',
    label: 'No position',
    people: 12,
    activePeople: 8,
    newApplications: 1,
    overallEligible: 0,
    overallRate: null,
    overallSoFarRate: null,
    eligibleShare: 0,
  },
];

const PROGRAMS_BY_TRACK: Record<string, string[]> = {
  AI_SOFTWARE: [
    'AI/AGI Intern',
    'Computer Vision Engineering Intern',
    'Front End Developer Intern',
    'Machine Learning Engineering Intern',
    'Prompt Engineer Intern',
    'Quality Assurance Intern',
    'Research Associate Intern (Open Source Projects)',
    'Software Development Intern',
  ],
  ROBOTICS: [
    'Control Systems Engineering Intern',
    'Embedded Systems Intern',
    'Human Robot Interaction Intern',
    'Mechatronics Engineering Intern',
    'Product Development Intern (AI and Robotics)',
    'Robotics Engineering Intern',
    'Sensor Integration Intern',
  ],
  BUSINESS: [
    'Business Development and Sales Intern (AI and Robotics)',
    'Digital Marketing Intern',
    'Finance Intern',
    'GTM Engineer (Go To Market Engineer) Intern',
    'GTM Influencer Intern',
    'Hospitality and Tourism Intern',
    'Marketing Intern',
    'Operations Intern',
    'Project Management Intern',
    'SEO Specialist Intern',
    'Social Media Intern',
  ],
  DESIGN_COMMUNICATION: [
    'Content Marketing Intern',
    'Journalism and PR Intern',
    'Podcast Production Intern Position',
    'Technical Writing Intern',
    'UI/UX Design Intern',
  ],
  EMERGING_SCIENCES: [
    'Animal Science and Veterinary Research Intern',
    'Biomedical Engineering Intern',
    'EdTech and Innovation Intern',
    'Ethical and Legal Research Intern',
    'Neuroscience Intern',
    'Quantum Engineer Intern',
    'Space Science Intern',
    'Sport Science Intern',
  ],
};

const buildProgramInputs = (): CategoryInput[] =>
  Object.entries(PROGRAMS_BY_TRACK).flatMap(([trackKey, labels]) =>
    labels.map((label, labelIndex) => {
      const people = Math.max(
        3,
        58 - ((labelIndex * 13 + label.length * 3) % 56),
      );
      const overallEligible = Math.round(people * 0.45);

      return {
        key: `${trackKey}_${labelIndex}`,
        label,
        parentKey: trackKey,
        people,
        activePeople: Math.round(people * 0.7),
        newApplications: Math.round(people * 0.2),
        overallEligible,
        overallRate:
          overallEligible >= 4 ? 0.03 + ((labelIndex * 7) % 11) / 100 : null,
        overallSoFarRate: overallEligible >= 4 ? 0.05 : null,
        eligibleShare: people / 412,
        rateShift: ((labelIndex % 5) - 2) * 0.05,
      };
    }),
  );

const MOVEMENT_INPUTS: [string, string, number, number, number][] = [
  ['NEW', 'New', 86, 72, 71],
  ['CONTACTED', 'Contacted', 64, 58, 94],
  ['BEFORE_MEETING', 'Before meeting', 41, 37, 56],
  ['SATURDAY_MEETING', 'Saturday meeting', 28, 31, 39],
  ['ATTENDED', 'Attended', 19, 17, 23],
  ['SECOND_MEETING', 'Second meeting', 12, 9, 18],
  ['AGREEMENT_SENT', 'Agreement sent', 6, 4, 11],
  ['SIGNED', 'Signed', 3, 0, 12],
  ['NO_ANSWER', 'No answer', 22, 3, 61],
  ['NOT_INTERESTED', 'Not interested', 11, 1, 38],
  ['REJECTED_BY_US', 'Rejected by us', 7, 0, 24],
  ['INTERESTED', 'Interested', 0, 0, 15],
];

const buildMovement = (): AnalyticsMovementRow[] =>
  MOVEMENT_INPUTS.map(
    ([stageKey, label, enteredInPeriod, leftInPeriod, countNow]) => ({
      stageKey,
      label,
      enteredInPeriod,
      leftInPeriod,
      countNow,
    }),
  );

const PREVIOUS_ENTERED: Record<string, number> = {
  NEW: 61,
  CONTACTED: 71,
  BEFORE_MEETING: 33,
  SATURDAY_MEETING: 26,
  ATTENDED: 21,
  SECOND_MEETING: 10,
  AGREEMENT_SENT: 5,
  SIGNED: 2,
  NO_ANSWER: 18,
  NOT_INTERESTED: 9,
  REJECTED_BY_US: 8,
  INTERESTED: 1,
};

const buildComparisons = (movement: AnalyticsMovementRow[]) => [
  {
    metricKey: 'NEW_APPLICATIONS',
    label: 'New applications',
    current: 86,
    previous: 61,
    isSignificant: true,
  },
  ...movement.map(({ stageKey, label, enteredInPeriod }) => {
    const previous = PREVIOUS_ENTERED[stageKey] ?? 0;

    return {
      metricKey: `ENTERED_${stageKey}`,
      label: `Entered ${label}`,
      current: enteredInPeriod,
      previous,
      isSignificant:
        enteredInPeriod >= BASE.minimumSample &&
        previous >= BASE.minimumSample &&
        Math.abs(enteredInPeriod - previous) / previous >= 0.2,
    };
  }),
];

const buildSeries = (
  metric: AnalyticsTrendMetric,
  bucketStarts: string[],
  getValue: (index: number) => number | null,
  getSize: (index: number) => number | null,
  previousShift: number,
): AnalyticsSeries => ({
  metric,
  // As the server stores it: a drop-off line always belongs to the entry step.
  stageKey: metric === 'DROP_OFF' ? 'NEW' : null,
  groupKey: null,
  groupLabel: null,
  unavailableReason: null,
  points: bucketStarts.map((bucketStart, index) => {
    const value = getValue(index);

    return {
      bucketStart,
      value,
      previousValue:
        value === null ? null : Math.max(0, value * (1 - previousShift)),
      size: getSize(index),
      previousSize: getSize(index),
      isPartial: false,
    };
  }),
});

const buildTrendSeries = (
  bucketStarts: string[],
  scale: number,
): AnalyticsSeries[] => {
  const lastRateIndex = bucketStarts.length - 4;

  return [
    buildSeries(
      'NEW_APPLICATIONS',
      bucketStarts,
      (index) => Math.round((22 + index * 5 + ((index * 7) % 9) * 3) * scale),
      () => null,
      0.18,
    ),
    buildSeries(
      'OVERALL_CONVERSION',
      bucketStarts,
      (index) => (index <= lastRateIndex ? 0.04 + index * 0.005 : null),
      (index) => 22 + index * 6,
      0.12,
    ),
    buildSeries(
      'DROP_OFF',
      bucketStarts,
      (index) =>
        index <= lastRateIndex + 2
          ? 0.42 - index * 0.012 + ((index * 3) % 5) / 100
          : null,
      (index) => 18 + index * 7,
      -0.06,
    ),
  ];
};

const WEEK_BUCKETS = [
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
];

const MONTH_BUCKETS = [
  '2026-05-01',
  '2026-06-01',
  '2026-07-01',
  '2026-08-01',
  '2026-09-01',
  '2026-10-01',
];

const buildStuckByStage = () => [
  { stageKey: 'NEW', label: 'New', count: 9 },
  { stageKey: 'CONTACTED', label: 'Contacted', count: 18 },
  { stageKey: 'BEFORE_MEETING', label: 'Before meeting', count: 6 },
  { stageKey: 'SATURDAY_MEETING', label: 'Saturday meeting', count: 3 },
  { stageKey: 'ATTENDED', label: 'Attended', count: 1 },
  { stageKey: 'SECOND_MEETING', label: 'Second meeting', count: 0 },
  { stageKey: 'AGREEMENT_SENT', label: 'Agreement sent', count: 0 },
];

const buildCategories = (
  funnelRows: AnalyticsFunnelRow[],
  inputs: CategoryInput[],
) => ({
  ...BASE,
  groupBy: 'TRACK_PROGRAM' as const,
  distinctPeople: 462,
  peopleInSeveral: 31,
  peopleInSeveralTracks: 18,
  stepStageKeys: funnelRows.map(({ stageKey }) => stageKey),
  rows: inputs.map((input) => buildCategoryRow(funnelRows, input)),
});

export const buildWeeklyReportFixture = (): AnalyticsReport => {
  const funnelRows = STAGE_INPUTS.map(buildFunnelRow);
  const movement = buildMovement();

  return {
    ...BASE,
    periodType: 'WEEK',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-09',
    generatedAt: BASE.asOf,
    isProvisional: true,
    payloadVersion: 1,
    newApplications: 86,
    newApplicationsPrevious: 61,
    categories: buildCategories(funnelRows, TRACK_INPUTS),
    funnel: buildFunnel(funnelRows),
    movement,
    stuckByStage: buildStuckByStage(),
    comparisons: buildComparisons(movement),
    cohorts: [],
    trendSeries: buildTrendSeries(WEEK_BUCKETS, 1),
  };
};

export const buildMonthlyReportFixture = (): AnalyticsReport => {
  const funnelRows = STAGE_INPUTS.map(buildFunnelRow);
  const movement = buildMovement();

  return {
    ...BASE,
    periodType: 'MONTH',
    periodStart: '2026-10-01',
    periodEnd: '2026-11-01',
    generatedAt: '2026-11-01T02:30:00.000Z',
    isProvisional: false,
    payloadVersion: 1,
    newApplications: 342,
    newApplicationsPrevious: 287,
    categories: buildCategories(funnelRows, [
      ...TRACK_INPUTS,
      ...buildProgramInputs(),
    ]),
    funnel: buildFunnel(funnelRows),
    movement,
    stuckByStage: buildStuckByStage(),
    comparisons: buildComparisons(movement),
    cohorts: MONTH_BUCKETS.map((bucketStart, bucketIndex) => {
      const maturity = 1 - bucketIndex * 0.2;
      const size = [46, 58, 71, 84, 97, 112][bucketIndex];

      return {
        bucketStart,
        size,
        cells: funnelRows.slice(0, -1).map((row, rowIndex) => {
          const entered = Math.round((size * row.entered) / 412);
          const isMature = rowIndex + bucketIndex < 5;
          const rate = STEP_RATE_SHAPES[rowIndex][0] + bucketIndex * 0.015;

          return {
            stageKey: row.stageKey,
            entered,
            eligible: isMature ? entered : Math.round(entered * 0.4),
            rate: isMature ? rate : null,
            soFarRate: rate * 0.7 * maturity,
            isMature,
          };
        }),
        overallRate: bucketIndex < 3 ? 0.05 + bucketIndex * 0.012 : null,
        overallSoFarRate: bucketIndex < 5 ? 0.03 : null,
      };
    }),
    trendSeries: buildTrendSeries(MONTH_BUCKETS, 4),
  };
};

export const buildEmptyReportFixture = (): AnalyticsReport => {
  const emptyFunnelRows = STAGE_INPUTS.map(
    ([stageKey, label]): FunnelStageInput => [
      stageKey,
      label,
      0,
      0,
      0,
      0,
      null,
      0,
    ],
  ).map(buildFunnelRow);

  return {
    ...BASE,
    trackingStartedAt: '2026-11-02T00:00:00.000Z',
    periodType: 'WEEK',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-09',
    generatedAt: BASE.asOf,
    isProvisional: true,
    payloadVersion: 1,
    newApplications: null,
    newApplicationsPrevious: null,
    categories: {
      ...BASE,
      groupBy: 'TRACK_PROGRAM',
      distinctPeople: 0,
      peopleInSeveral: 0,
      peopleInSeveralTracks: 0,
      stepStageKeys: [],
      rows: [],
    },
    funnel: {
      ...buildFunnel(emptyFunnelRows),
      cohortSize: 0,
      cohortExcludedUnmapped: 0,
      overall: {
        finalStageKey: 'SIGNED',
        windowDays: 90,
        eligible: 0,
        reached: 0,
        rate: null,
        soFarRate: null,
        isUnderMinimum: true,
      },
      lowestStepStageKey: null,
    },
    movement: [],
    stuckByStage: [],
    comparisons: [],
    cohorts: [],
  };
};

// People exist but nobody has had a full window yet: the normal state just after launch.
export const buildNoRatesReportFixture = (): AnalyticsReport => {
  const monthly = buildMonthlyReportFixture();

  return {
    ...monthly,
    funnel: {
      ...monthly.funnel,
      rows: monthly.funnel.rows.map((row) => ({
        ...row,
        stepRate: null,
        soFarRate: null,
        dropOffRate: null,
        eligible: 0,
        reachedNext: 0,
        timedOut: 0,
        exited: 0,
        inWindow: row.entered,
        medianDays: null,
        completedStays: 0,
      })),
      overall: {
        ...monthly.funnel.overall,
        rate: null,
        soFarRate: null,
        eligible: 0,
        reached: 0,
      },
      lowestStepStageKey: null,
    },
    categories: {
      ...monthly.categories,
      rows: monthly.categories.rows.map((row) => ({
        ...row,
        overallRate: null,
        overallSoFarRate: null,
        overallEligible: 0,
        stepRates: row.stepRates.map((stepRate) => ({
          ...stepRate,
          rate: null,
          soFarRate: null,
          eligible: 0,
        })),
      })),
    },
    cohorts: monthly.cohorts.map((cohort) => ({
      ...cohort,
      overallRate: null,
      overallSoFarRate: null,
      cells: cohort.cells.map((cell) => ({
        ...cell,
        rate: null,
        soFarRate: null,
        eligible: 0,
        isMature: false,
      })),
    })),
  };
};

const LONG_STAGE_SUFFIX =
  ' and waiting for the countersigned copy to come back';

export const buildLongLabelReportFixture = (): AnalyticsReport => {
  const weekly = buildWeeklyReportFixture();
  const stretchLabel = (label: string, index: number) =>
    index % 2 === 0 ? `${label}${LONG_STAGE_SUFFIX}` : label;
  const funnelRows = weekly.funnel.rows.map((row, rowIndex) => ({
    ...row,
    label: stretchLabel(row.label, rowIndex),
    stepRate: rowIndex % 3 === 0 ? null : row.stepRate,
    soFarRate: rowIndex % 3 === 0 ? null : row.soFarRate,
    eligible: rowIndex % 3 === 0 ? 0 : row.eligible,
    reachedNext: rowIndex % 3 === 0 ? 0 : row.reachedNext,
    timedOut: rowIndex % 3 === 0 ? 0 : row.timedOut,
    exited: rowIndex % 3 === 0 ? 0 : row.exited,
    inWindow: rowIndex % 3 === 0 ? row.entered : row.inWindow,
    medianDays: rowIndex % 3 === 0 ? null : row.medianDays,
    dropOffRate: rowIndex % 3 === 0 ? null : row.dropOffRate,
  }));

  return {
    ...weekly,
    funnel: {
      ...weekly.funnel,
      rows: funnelRows,
      overall: {
        ...weekly.funnel.overall,
        rate: null,
        soFarRate: null,
        eligible: 0,
        reached: 0,
      },
      lowestStepStageKey: null,
    },
    categories: {
      ...weekly.categories,
      rows: weekly.categories.rows.map((row, rowIndex) => ({
        ...row,
        label:
          rowIndex % 2 === 0
            ? `${row.label} (including the partner programs run with external universities)`
            : row.label,
        isUnmapped: rowIndex === 3,
        overallRate: null,
        overallSoFarRate: null,
        overallEligible: 0,
        stepRates: row.stepRates.map((stepRate) => ({
          ...stepRate,
          rate: null,
          soFarRate: null,
          eligible: 0,
        })),
      })),
    },
    movement: weekly.movement.map((row, rowIndex) => ({
      ...row,
      label: stretchLabel(row.label, rowIndex),
    })),
    stuckByStage: weekly.stuckByStage.map((row, rowIndex) => ({
      ...row,
      label: stretchLabel(row.label, rowIndex),
    })),
    comparisons: weekly.comparisons.map((row) => ({
      ...row,
      label: `${row.label}${LONG_STAGE_SUFFIX}`,
      metricKey: `LONG_${row.metricKey}`,
    })),
    trendSeries: undefined,
  };
};

const STRESS_STAGE_COUNT = 22;
const STRESS_MONTH_COUNT = 40;

// Far beyond today's configuration, to prove long charts and tables still break cleanly.
export const buildOversizedReportFixture = (): AnalyticsReport => {
  const monthly = buildMonthlyReportFixture();
  const stageInputs = Array.from(
    { length: STRESS_STAGE_COUNT },
    (_, stageIndex): FunnelStageInput => {
      const entered = 900 - stageIndex * 40;

      return [
        `STAGE_${stageIndex}`,
        `Stage number ${stageIndex + 1}`,
        entered,
        entered - 20,
        entered - 60,
        5,
        stageIndex + 1.5,
        entered - 60,
      ];
    },
  );
  const funnelRows = stageInputs.map(buildFunnelRow);
  const movement = stageInputs.map(([stageKey, label, entered]) => ({
    stageKey,
    label,
    enteredInPeriod: Math.round(entered / 10),
    leftInPeriod: Math.round(entered / 12),
    countNow: entered,
  }));
  const programRows = Array.from(
    { length: 34 },
    (_, programIndex): AnalyticsCategoryRow =>
      buildCategoryRow(funnelRows, {
        key: `AI_PROGRAM_${programIndex}`,
        label: `Program number ${programIndex + 1}`,
        parentKey: 'AI_SOFTWARE',
        people: 40 + programIndex,
        activePeople: 20 + programIndex,
        newApplications: programIndex,
        overallEligible: 35,
        overallRate: 0.1,
        overallSoFarRate: 0.08,
        eligibleShare: 0.05,
      }),
  );

  return {
    ...monthly,
    funnel: {
      ...buildFunnel(funnelRows),
      overall: { ...monthly.funnel.overall, finalStageKey: 'STAGE_21' },
      lowestStepStageKey: 'STAGE_3',
    },
    categories: {
      ...buildCategories(funnelRows, TRACK_INPUTS),
      rows: [...buildCategories(funnelRows, TRACK_INPUTS).rows, ...programRows],
    },
    movement,
    comparisons: buildComparisons(movement),
    stuckByStage: stageInputs.map(([stageKey, label], stageIndex) => ({
      stageKey,
      label,
      count: stageIndex,
    })),
    cohorts: Array.from({ length: STRESS_MONTH_COUNT }, (_, monthIndex) => ({
      bucketStart: `${2024 + Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}-01`,
      size: 40,
      cells: funnelRows.slice(0, -1).map(({ stageKey }) => ({
        stageKey,
        entered: 40,
        eligible: 40,
        rate: 0.5,
        soFarRate: 0.4,
        isMature: true,
      })),
      overallRate: 0.1,
      overallSoFarRate: 0.08,
    })),
  };
};
