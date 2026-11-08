import { type AnalyticsStageDefinition } from 'src/modules/analytics/types/analytics-api.type';

export type CrmAnalyticsStageConfig = AnalyticsStageDefinition & {
  rawValues: { rawValue: string; isReminder: boolean }[];
};

export type CrmAnalyticsTrackConfig = {
  trackKey: string;
  label: string;
  positions: string[];
};

export type CrmAnalyticsConfig = {
  isProvisional: boolean;
  showSignedFigure: boolean;
  reportingTimeZone: string;
  trackingStartAt: string;
  overallWindowDays: number;
  minimumSample: number;
  // 0.2 is 20%
  significantChangeRatio: number;
  syncOverlapMinutes: number;
  staleAfterMinutes: number;
  runningLimitMinutes: number;
  applicationFormNames: string[];
  applicationObjectNameSingular: string;
  stages: CrmAnalyticsStageConfig[];
  tracks: CrmAnalyticsTrackConfig[];
};

const STEP_WINDOW_DAYS = 14;
const STUCK_LIMIT_DAYS = 14;

// Provisional until recruiting confirms it. Raw values stay stored untouched, so
// changing this mapping rewrites no history. A reminder or a renamed value is one
// more rawValues entry on its parent; any raw value not listed shows as Unmapped.
export const CRM_ANALYTICS_CONFIG: CrmAnalyticsConfig = {
  isProvisional: true,
  showSignedFigure: false,
  reportingTimeZone: 'UTC',
  trackingStartAt: '2026-10-27T00:00:00.000Z',
  overallWindowDays: 90,
  minimumSample: 30,
  significantChangeRatio: 0.2,
  syncOverlapMinutes: 30,
  staleAfterMinutes: 60,
  runningLimitMinutes: 30,
  applicationFormNames: ['Internship Application'],
  applicationObjectNameSingular: 'application',
  stages: [
    {
      stageKey: 'NEW',
      label: 'New',
      kind: 'MAIN',
      rank: 0,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'NEW', isReminder: false }],
    },
    {
      stageKey: 'CONTACTED',
      label: 'Contacted',
      kind: 'MAIN',
      rank: 1,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'CONTACTED', isReminder: false }],
    },
    {
      stageKey: 'BEFORE_MEETING',
      label: 'Before meeting',
      kind: 'MAIN',
      rank: 2,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'BEFORE_MEETING', isReminder: false }],
    },
    {
      stageKey: 'SATURDAY_MEETING',
      label: 'Saturday meeting',
      kind: 'MAIN',
      rank: 3,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'SATURDAY_MEETING', isReminder: false }],
    },
    {
      stageKey: 'ATTENDED',
      label: 'Attended',
      kind: 'MAIN',
      rank: 4,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'ATTENDED', isReminder: false }],
    },
    {
      stageKey: 'SECOND_MEETING',
      label: 'Second meeting',
      kind: 'MAIN',
      rank: 5,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'SECOND_MEETING', isReminder: false }],
    },
    {
      stageKey: 'AGREEMENT_SENT',
      label: 'Agreement sent',
      kind: 'MAIN',
      rank: 6,
      limitDays: STUCK_LIMIT_DAYS,
      windowDays: STEP_WINDOW_DAYS,
      isSuccess: false,
      rawValues: [{ rawValue: 'AGREEMENT_SENT', isReminder: false }],
    },
    {
      stageKey: 'SIGNED',
      label: 'Signed',
      kind: 'MAIN',
      rank: 7,
      limitDays: null,
      windowDays: null,
      isSuccess: true,
      rawValues: [
        { rawValue: 'SIGNED_PAID', isReminder: false },
        { rawValue: 'SIGNED_NON_PAID', isReminder: false },
      ],
    },
    {
      stageKey: 'NO_ANSWER',
      label: 'No answer',
      kind: 'EXIT',
      rank: null,
      limitDays: null,
      windowDays: null,
      isSuccess: false,
      rawValues: [{ rawValue: 'NO_ANSWER', isReminder: false }],
    },
    {
      stageKey: 'NOT_INTERESTED',
      label: 'Not interested',
      kind: 'EXIT',
      rank: null,
      limitDays: null,
      windowDays: null,
      isSuccess: false,
      rawValues: [{ rawValue: 'NOT_INTERESTED', isReminder: false }],
    },
    {
      stageKey: 'REJECTED_BY_US',
      label: 'Rejected by us',
      kind: 'EXIT',
      rank: null,
      limitDays: null,
      windowDays: null,
      isSuccess: false,
      rawValues: [{ rawValue: 'REJECTED_BY_US', isReminder: false }],
    },
    // Follow-up forms reset people to this, so it must not count as a funnel step.
    {
      stageKey: 'INTERESTED',
      label: 'Interested',
      kind: 'OTHER',
      rank: null,
      limitDays: null,
      windowDays: null,
      isSuccess: false,
      rawValues: [{ rawValue: 'INTERESTED', isReminder: false }],
    },
  ],
  tracks: [
    {
      trackKey: 'AI_SOFTWARE',
      label: 'Artificial Intelligence & Software Engineering',
      positions: [
        'AI_AGI_INTERN',
        'COMPUTER_VISION_ENGINEERING_INTERN',
        'FRONT_END_DEVELOPER_INTERN',
        'MACHINE_LEARNING_ENGINEERING_INTERN',
        'PROMPT_ENGINEER_INTERN',
        'QUALITY_ASSURANCE_INTERN',
        'RESEARCH_ASSOCIATE_INTERN_OPEN_SOURCE_PROJECTS',
        'SOFTWARE_DEVELOPMENT_INTERN',
      ],
    },
    {
      trackKey: 'ROBOTICS',
      label: 'Robotics & Intelligent Systems',
      positions: [
        'CONTROL_SYSTEMS_ENGINEERING_INTERN',
        'EMBEDDED_SYSTEMS_INTERN',
        'HUMAN_ROBOT_INTERACTION_INTERN',
        'MECHATRONICS_ENGINEERING_INTERN',
        'PRODUCT_DEVELOPMENT_INTERN_AI_AND_ROBOTICS',
        'ROBOTICS_ENGINEERING_INTERN',
        'SENSOR_INTEGRATION_INTERN',
      ],
    },
    {
      trackKey: 'BUSINESS',
      label: 'Business Management, Growth & Entrepreneurship',
      positions: [
        'BUSINESS_DEVELOPMENT_AND_SALES_INTERN_AI_AND_ROBOTICS',
        'DIGITAL_MARKETING_INTERN',
        'FINANCE_INTERN',
        'GTM_ENGINEER_GO_TO_MARKET_ENGINEER_INTERN',
        'GTM_INFLUENCER_INTERN',
        'HOSPITALITY_AND_TOURISM_INTERN',
        'MARKETING_INTERN',
        'OPERATIONS_INTERN',
        'PROJECT_MANAGEMENT_INTERN',
        'SEO_SPECIALIST_INTERN',
        'SOCIAL_MEDIA_INTERN',
      ],
    },
    {
      trackKey: 'DESIGN_COMMUNICATION',
      label: 'Design & Technical Communication',
      positions: [
        'CONTENT_MARKETING_INTERN',
        'JOURNALISM_AND_PR_INTERN',
        'PODCAST_PRODUCTION_INTERN_POSITION',
        'TECHNICAL_WRITING_INTERN',
        'UI_UX_DESIGN_INTERN',
      ],
    },
    {
      trackKey: 'EMERGING_SCIENCES',
      label: 'Emerging Sciences & Technology',
      positions: [
        'ANIMAL_SCIENCE_AND_VETERINARY_RESEARCH_INTERN',
        'BIOMEDICAL_ENGINEERING_INTERN',
        'EDTECH_AND_INNOVATION_INTERN',
        'ETHICAL_AND_LEGAL_RESEARCH_INTERN',
        'NEUROSCIENCE_INTERN',
        'QUANTUM_ENGINEER_INTERN',
        'SPACE_SCIENCE_INTERN',
        'SPORT_SCIENCE_INTERN',
      ],
    },
  ],
};
