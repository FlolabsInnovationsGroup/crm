// Hand-designed test data for the CRM Analytics tool. Every person is here for a stated
// reason and carries the use case IDs it serves (use-cases.json). All names and emails
// are invented. Dates are ages before FIXED_NOW, so results repeat.
//
// History column: the first token is how the person was created, the rest are changes.
//   STAGE@age                timeline row. Age: days (35), 20d33m, 1d12h, or an ISO instant
//   NONE@age                 created with no stage
//   ~STAGE@age               the person changed with no timeline row
//   A@age>>B@age             one timeline row: the CRM merged the second change into it
//   STAGE@age^age            the timeline row arrives late, at the second age
//   STAGE@age^rerun          appears only between a job and its rerun
//   #deleted@age, #restored@age  soft delete and restore
//
// Steps column, calculated by hand: one letter per funnel rank from NEW. R reached next,
// E exited, T timed out, W still inside the window, F final stage. Empty: not in the cohort.
// Stuck column, by hand: days over the limit. "~" means the clock is a lower bound.
export const FIXED_NOW = '2026-11-18T12:00:00.000Z';
export const TRACKING_START = '2026-08-10T12:00:00.000Z';

export const APPLICATION_FORM_NAME = 'Internship Application';
export const OTHER_FORM_NAME = 'Skills survey';

// Sentinels the leak test searches for. Nothing else in the data contains them.
export const NAME_SENTINEL = 'zzsentinel';
export const ANSWER_SENTINEL = 'zzanswer';
export const EMAIL_DOMAIN_SENTINEL = '@example.com';
export const SECOND_WORKSPACE_SENTINEL = 'zzsecond';

// The default config has no reminder and no alias, so the test adds one of each. Nothing
// else in the config changes for the main run.
export const CONFIG_ADDITIONS = [
  { stageKey: 'CONTACTED', rawValue: 'CONTACTED_REMINDER', isReminder: true },
  { stageKey: 'BEFORE_MEETING', rawValue: 'PRE_MEETING', isReminder: false },
];

// Values the config does not know. They exist in the column, so a person can hold them.
export const UNMAPPED_STAGE_VALUES = ['LEGACY_TEST', 'LEGACY_OLD'];
export const UNMAPPED_POSITION_VALUE = 'LEGACY_POSITION';
export const KNOWN_SOURCE_VALUES = ['LINKEDIN', 'REFERRAL', 'WEBSITE', 'UNIVERSITY'];
export const UNKNOWN_SOURCE_VALUE = 'LEGACY_SOURCE';

const SOFTWARE = ['SOFTWARE_DEVELOPMENT_INTERN'];

const person = (key, history, positions, source, steps, stuck, useCases, why) => ({
  key,
  history,
  positions,
  source,
  steps,
  stuck,
  useCases,
  why,
});

// prettier-ignore
export const MAIN_PEOPLE = [
  // Contract section 9 sample, people A to H. Their source is used by nobody else, so a
  // source filter reproduces the contract's own hand-calculated table.
  person('P001', 'NEW@40 CONTACTED@35', SOFTWARE, 'UNIVERSITY', 'RT', 21, ['UC-01', 'UC-15', 'UC-31', 'UC-54', 'UC-117'], 'Sample A: normal step, then stays at Contacted past the limit'),
  person('P002', 'NEW@40 CONTACTED@20', SOFTWARE, 'UNIVERSITY', 'TT', 6, ['UC-16', 'UC-117'], 'Sample B: late step, timed out at New and still enters Contacted'),
  person('P003', 'NEW@40 NOT_INTERESTED@30', SOFTWARE, 'UNIVERSITY', 'E', null, ['UC-02', 'UC-19', 'UC-117'], 'Sample C: exit inside the window'),
  person('P004', 'NEW@40', SOFTWARE, 'UNIVERSITY', 'T', 26, ['UC-01', 'UC-21', 'UC-30', 'UC-117'], 'Sample D: no move, timed out. Carries the timeline rows that must be ignored'),
  person('P005', 'NEW@5 CONTACTED@1', SOFTWARE, 'UNIVERSITY', 'WW', null, ['UC-36', 'UC-69', 'UC-117'], 'Sample E: too recent at both steps. Submitted twice'),
  person('P006', 'NEW@5', SOFTWARE, 'UNIVERSITY', 'W', null, ['UC-36', 'UC-117'], 'Sample F: too recent, no move'),
  person('P007', 'NEW@40 ATTENDED@35', SOFTWARE, 'UNIVERSITY', 'RRRRT', 21, ['UC-01', 'UC-17', 'UC-117'], 'Sample G: skipped stages count as reached'),
  person('P008', 'NEW@120 CONTACTED@10', SOFTWARE, 'UNIVERSITY', '', null, ['UC-42', 'UC-117'], 'Sample H: imported, moved on the timeline. In movement, never in the cohort'),

  // Overall conversion and its 90 day boundaries.
  person('P009', 'NEW@96 CONTACTED@92 BEFORE_MEETING@88 SATURDAY_MEETING@84 ATTENDED@80 SECOND_MEETING@76 AGREEMENT_SENT@72 SIGNED_PAID@68', ['COMPUTER_VISION_ENGINEERING_INTERN'], 'LINKEDIN', 'RRRRRRRF', null, ['UC-01', 'UC-13', 'UC-38', 'UC-51'], 'Whole pipeline inside every window, old enough for all. Own program isolates it'),
  person('P010', 'NEW@95 AGREEMENT_SENT@70 SIGNED_NON_PAID@60', SOFTWARE, 'LINKEDIN', 'TRRRRRRF', null, ['UC-13', 'UC-17'], 'Signed Non paid counts as the same success. Long skip, late at New'),
  person('P011', 'NEW@99 SIGNED_PAID@9', SOFTWARE, 'LINKEDIN', 'TWWWWWWF', null, ['UC-50'], 'Reaches success exactly 90 days after entering: counts'),
  person('P012', 'NEW@98 SIGNED_NON_PAID@7', SOFTWARE, 'LINKEDIN', 'TWWWWWWF', null, ['UC-50'], 'Reaches success 91 days after entering: does not count'),
  person('P013', 'NEW@90', SOFTWARE, 'LINKEDIN', 'T', 76, ['UC-50'], 'Entered exactly 90 days ago: eligible for overall, never succeeds'),
  person('P014', 'NEW@89 CONTACTED@85 SIGNED_PAID@80', ['MACHINE_LEARNING_ENGINEERING_INTERN'], 'LINKEDIN', 'RRRRRRRF', null, ['UC-37'], 'Too recent for overall though already signed: "so far" only. Own program isolates it'),
  person('P015', 'NEW@92 CONTACTED@88 BEFORE_MEETING@84 NOT_INTERESTED@80', ['FRONT_END_DEVELOPER_INTERN'], 'LINKEDIN', 'RRE', null, ['UC-19', 'UC-38'], 'Old enough for all, exits at a later step. Own program isolates it'),

  // People who only need to fill a main stage nobody else ends on.
  person('P016', 'NEW@70 CONTACTED@66 BEFORE_MEETING@62 SATURDAY_MEETING@58', SOFTWARE, 'LINKEDIN', 'RRRT', 44, ['UC-01'], 'Ends at Saturday meeting'),
  person('P017', 'NEW@72 ATTENDED@60 SECOND_MEETING@50', SOFTWARE, 'LINKEDIN', 'RRRRRT', 36, ['UC-01'], 'Ends at Second meeting'),
  person('P018', 'NEW@74 CONTACTED@70 AGREEMENT_SENT@40', SOFTWARE, 'LINKEDIN', 'RTRRRRT', 26, ['UC-01'], 'Ends at Agreement sent'),

  // Moves.
  person('P019', 'NEW@60 CONTACTED@56 ATTENDED@50 CONTACTED@45', SOFTWARE, 'REFERRAL', 'RRRRT', 31, ['UC-18'], 'Backward move: furthest stays Attended, clock runs from the latest arrival'),
  person('P020', 'NEW@40 NO_ANSWER@20', SOFTWARE, 'REFERRAL', 'T', null, ['UC-02', 'UC-20', 'UC-51'], 'Exit outside the window reads as timed out'),
  person('P021', 'NEW@50 CONTACTED@45 REJECTED_BY_US@40', SOFTWARE, 'REFERRAL', 'RE', null, ['UC-02', 'UC-19'], 'Exit at a later step'),
  person('P022', 'NEW@65 REJECTED_BY_US@60 CONTACTED@50', SOFTWARE, 'REFERRAL', 'ET', 36, ['UC-29'], 'Reopened: the exit counts at New, not at the Contacted entered later'),
  person('P023', 'NEW@70 CONTACTED@65 BEFORE_MEETING@60 SATURDAY_MEETING@55 ATTENDED@50 INTERESTED@3', SOFTWARE, 'REFERRAL', 'RRRRT', null, ['UC-03', 'UC-51'], 'Form reset to Interested after Attended'),
  person('P024', 'INTERESTED@30', SOFTWARE, 'REFERRAL', '', null, ['UC-04'], 'Created at Interested and never moves: active, not in the cohort, not unmapped'),
  person('P025', 'INTERESTED@35 NEW@30', SOFTWARE, 'REFERRAL', 'T', 16, ['UC-04'], 'Created at Interested, enters the funnel at the move, not at creation'),
  person('P026', 'NEW@45 CONTACTED@30 CONTACTED_REMINDER@20', SOFTWARE, 'REFERRAL', 'TT', 16, ['UC-05', 'UC-06'], 'Sits on a reminder: nests under Contacted, the clock did not restart'),
  person('P027', 'NEW@50 CONTACTED@40 CONTACTED_REMINDER@35 BEFORE_MEETING@30', ['QUALITY_ASSURANCE_INTERN'], 'REFERRAL', 'RRT', 16, ['UC-01', 'UC-06'], 'Passes through a reminder: one stay of 10 days. Own program isolates it'),
  person('P028', 'NEW@50 PRE_MEETING@45 ~BEFORE_MEETING@40', SOFTWARE, 'REFERRAL', 'RRT', 31, ['UC-07'], 'Renamed value with an alias: the silent rename makes no reconcile row'),

  // Unmapped, no stage.
  person('P029', 'LEGACY_TEST@30', SOFTWARE, 'WEBSITE', '', null, ['UC-08', 'UC-09'], 'Unmapped from the start'),
  person('P030', 'LEGACY_TEST@40 LEGACY_OLD@20', SOFTWARE, 'WEBSITE', '', null, ['UC-08', 'UC-09'], 'Moves between two unmapped values: every stage unmapped, second raw row'),
  person('P031', 'LEGACY_TEST@40 CONTACTED@30', SOFTWARE, 'WEBSITE', 'RT', 16, ['UC-10'], 'Unmapped start, then mapped: enters the funnel at the move'),
  person('P032', 'NEW@40 LEGACY_TEST@30', SOFTWARE, 'WEBSITE', 'T', null, ['UC-08'], 'Mapped, then unmapped: stays in the cohort, not active, New stay of 10 days'),
  person('P033', 'NONE@30', SOFTWARE, 'WEBSITE', '', null, ['UC-11'], 'No stage: in total contacts, nowhere in the pipeline'),
  person('P034', 'NONE@40 NEW@30', SOFTWARE, 'WEBSITE', 'T', 16, ['UC-12'], 'No stage, then assigned: enters at the assignment'),

  // Exact boundaries.
  person('P035', 'NEW@40 CONTACTED@26', SOFTWARE, 'WEBSITE', 'RT', 12, ['UC-48'], 'Moves exactly at the end of the window: reached'),
  person('P036', 'NEW@40 NOT_INTERESTED@26', SOFTWARE, 'WEBSITE', 'E', null, ['UC-49'], 'Exits exactly at the end of the window: exited'),
  person('P037', 'NEW@14', SOFTWARE, 'WEBSITE', 'T', null, ['UC-40'], 'Exactly at the stuck limit and exactly at the window: eligible, not stuck'),
  person('P038', 'NEW@15', SOFTWARE, 'WEBSITE', 'T', 1, ['UC-39'], 'One day over the stuck limit'),
  person('P039', 'NEW@100', SOFTWARE, 'WEBSITE', 'T', 86, ['UC-45', 'UC-53'], 'Created exactly at tracking start: in the cohort. Longest over the limit'),

  // Imported, created before tracking start.
  person('P040', 'CONTACTED@2026-08-10T11:59:59.000Z', SOFTWARE, null, '', null, ['UC-41', 'UC-46', 'UC-73'], 'Created one second before tracking start: imported, inactive. New submission still counts'),
  person('P041', 'NEW@130 CONTACTED@110', SOFTWARE, null, '', null, ['UC-30', 'UC-41'], 'Its only move is before tracking start, so it is not read: inactive'),
  person('P042', 'NO_ANSWER@125', SOFTWARE, null, '', null, ['UC-52'], 'Imported at an exit: not active, so not inactive'),
  person('P043', 'NEW@130 CONTACTED@100 ~BEFORE_MEETING@30', SOFTWARE, 'LINKEDIN', '', '6~', ['UC-43', 'UC-45'], 'Imported, then moved by reconcile: "at least 20 days". First move exactly at tracking start'),
  person('P044', 'NEW@130 CONTACTED@50 ~BEFORE_MEETING@10m', SOFTWARE, null, '', null, ['UC-44'], 'Imported, silent change too recent to reconcile: clock unknown, not stuck, not inactive'),

  // Reconcile.
  person('P045', 'NEW@50 CONTACTED@45 ~BEFORE_MEETING@25', ['PROMPT_ENGINEER_INTERN'], 'REFERRAL', 'RTT', '6~', ['UC-26', 'UC-106'], 'Reconcile-only change: reached and clock count, durations do not. Own program isolates it'),
  person('P046', 'NEW@40 ~CONTACTED@30', SOFTWARE, 'REFERRAL', 'RT', 26, ['UC-28'], 'Silent change with no transition at all: nothing to compare, no row'),
  person('P047', 'NEW@40 CONTACTED@35 ~BEFORE_MEETING@1d70m', SOFTWARE, 'REFERRAL', 'RTW', null, ['UC-27'], 'Updated 10 minutes before a daily run: skipped then, reconciled by the next one'),
  person('P048', 'NEW@30 CONTACTED@25 ~BEFORE_MEETING@3', SOFTWARE, 'WEBSITE', 'RTW', null, ['UC-26', 'UC-35'], 'Reconciled in the current week: shows in movement, and gives the cursor a newer row to ignore'),

  // Timeline rows the CRM merged in place, around the first two syncs (20d30m and 20d15m).
  person('P049', 'NEW@30 CONTACTED@20d40m>>BEFORE_MEETING@20d35m', SOFTWARE, 'WEBSITE', 'RRT', 6, ['UC-22'], 'A to B to C merged before any sync: one row, B counts as skipped'),
  person('P050', 'NEW@30 CONTACTED@20d33m>>BEFORE_MEETING@20d27m', SOFTWARE, 'WEBSITE', 'RRT', 6, ['UC-23'], 'A to B seen by a sync, then merged to A to C: two rows'),
  person('P051', 'NEW@30 CONTACTED@20d40m>>NEW@20d35m', SOFTWARE, 'WEBSITE', 'T', 16, ['UC-24'], 'A to B to A merged before any sync: a stored no-op that every read ignores'),
  person('P052', 'NEW@30 CONTACTED@20d33m>>NEW@20d27m', SOFTWARE, 'WEBSITE', 'RT', 6, ['UC-25'], 'A to B seen by a sync, then merged to A to A: the backward move is appended'),

  // Late timeline rows around the syncs at 1d105m and 1d90m and the daily at 1d60m.
  person('P053', 'NEW@20 CONTACTED@1d110m', SOFTWARE, 'LINKEDIN', 'TW', null, ['UC-33'], 'Newest row the 1d105m sync reads, so it sets the next sync cursor'),
  person('P054', 'NEW@20 CONTACTED@1d130m^1d100m', SOFTWARE, 'LINKEDIN', 'TW', null, ['UC-33', 'UC-85'], 'Late row inside the 30 minute overlap: the next sync picks it up'),
  person('P055', 'NEW@20 CONTACTED@1d180m^1d100m', SOFTWARE, 'LINKEDIN', 'TW', null, ['UC-34'], 'Late row older than the overlap: only the daily full re-read picks it up'),
  person('P056', 'NEW@20 CONTACTED@1d120m^1d30m', SOFTWARE, 'LINKEDIN', 'TW', null, ['UC-35'], 'Read by the sync after a daily only if reconcile rows did not move the cursor'),

  // Late-night instants: 21:00 and 20:30 UTC are the next local day in Asia/Karachi.
  person('P057', 'NEW@2026-11-03T21:00:00.000Z CONTACTED@2026-11-10T20:30:00.000Z', SOFTWARE, 'LINKEDIN', 'RW', null, ['UC-47'], 'Created, moved and submitted late at night'),

  // Categories.
  person('P058', 'NEW@32 CONTACTED@28', ['FINANCE_INTERN', 'MARKETING_INTERN'], 'REFERRAL', 'RT', 14, ['UC-55', 'UC-59', 'UC-60', 'UC-67'], 'Two positions in one track'),
  person('P059', 'NEW@33 CONTACTED@29', ['AI_AGI_INTERN', 'ROBOTICS_ENGINEERING_INTERN'], 'WEBSITE', 'RT', 15, ['UC-56', 'UC-59', 'UC-70'], 'Two positions across tracks'),
  person('P060', 'NEW@34 CONTACTED@30', ['UI_UX_DESIGN_INTERN', 'NEUROSCIENCE_INTERN', UNMAPPED_POSITION_VALUE], 'LINKEDIN', 'RT', 16, ['UC-56', 'UC-58', 'UC-59'], 'Three positions: two tracks plus an unmapped position'),
  person('P061', 'NEW@35 CONTACTED@31', [UNMAPPED_POSITION_VALUE], UNKNOWN_SOURCE_VALUE, 'RT', 17, ['UC-58', 'UC-64'], 'Unmapped position and unknown source'),
  person('P062', 'NEW@36 CONTACTED@32', [], null, 'RT', 18, ['UC-57', 'UC-65'], 'Empty positions array and no source'),
  person('P063', 'NEW@37', null, 'REFERRAL', 'T', 23, ['UC-57', 'UC-63'], 'NULL positions: same as empty'),

  // Lifecycle.
  person('P064', 'NEW@40 CONTACTED@2 #deleted@1d12h', SOFTWARE, 'LINKEDIN', '', null, ['UC-71', 'UC-74'], 'Soft deleted after a move this week: gone from every count, its transition stays'),
  person('P065', 'NEW@40 CONTACTED@30 #deleted@1d12h #restored@12h', SOFTWARE, 'REFERRAL', 'RT', 16, ['UC-75'], 'Soft deleted and restored: counts drop and return, no new transition'),
  person('P066', 'NEW@0^rerun', ['PODCAST_PRODUCTION_INTERN_POSITION'], 'WEBSITE', 'W', null, ['UC-97'], 'Created between a daily and its rerun, with a new key: the first snapshot of the date stands'),
];

// Rows no read may pick up: creation, another field, a linked record, no person. Together
// with P041's move before tracking start, these are the facade's filters.
export const IGNORED_TIMELINE_ROWS = [
  { key: 'creation', personKey: 'P004', age: 40, properties: {}, useCases: ['UC-30'] },
  { key: 'otherField', personKey: 'P004', age: 30, properties: { diff: { jobTitle: { before: 'Intern', after: 'Lead' } } }, useCases: ['UC-30'] },
  { key: 'linkedRecord', personKey: 'P004', age: 29, linkedRecordId: '20202020-0000-4000-8000-00000000abcd', properties: { diff: { stage: { before: 'NEW', after: 'SIGNED_PAID' } } }, useCases: ['UC-30'] },
  { key: 'noPerson', personKey: null, age: 28, properties: { diff: { stage: { before: 'NEW', after: 'SIGNED_PAID' } } }, useCases: ['UC-30'] },
];

// A stage change that also changed the email: only the stage may be copied.
export const EXTRA_DIFF_BY_PERSON = {
  P001: { emails: { before: `${NAME_SENTINEL}.old${EMAIL_DOMAIN_SENTINEL}`, after: `${NAME_SENTINEL}.p001${EMAIL_DOMAIN_SENTINEL}` } },
};

// Default span at FIXED_NOW: current is 2026-11-12 to 2026-11-18, previous is 2026-11-05 to 2026-11-11.
// prettier-ignore
export const MAIN_SUBMISSIONS = [
  { key: 'S01', personKey: 'P006', form: 'application', at: '2', useCases: ['UC-66'] },
  { key: 'S02', personKey: 'P005', form: 'application', at: '4', useCases: ['UC-69'] },
  { key: 'S03', personKey: 'P005', form: 'application', at: '2', useCases: ['UC-69'] },
  { key: 'S04', personKey: 'P001', form: 'application', at: '10', useCases: ['UC-68'] },
  { key: 'S05', personKey: 'P002', form: 'application', at: '2026-11-12T00:00:00.000Z', useCases: ['UC-68'] },
  { key: 'S06', personKey: 'P003', form: 'application', at: '2026-11-11T23:59:59.000Z', useCases: ['UC-68'] },
  { key: 'S07', personKey: 'P058', form: 'other', at: '1', useCases: ['UC-67'] },
  { key: 'S08', personKey: 'P059', form: 'application', at: '3', deletedAge: '2', useCases: ['UC-70'] },
  { key: 'S09', personKey: 'P064', form: 'application', at: '2', useCases: ['UC-71'] },
  { key: 'S10', personKey: 'P057', form: 'application', at: '2026-11-11T19:30:00.000Z', useCases: ['UC-47'] },
  { key: 'S11', personKey: 'P040', form: 'application', at: '3', useCases: ['UC-73'] },
  { key: 'S12', personKey: 'P009', form: 'application', at: '95', useCases: ['UC-95', 'UC-100'] },
  { key: 'S13', personKey: 'P019', form: 'application', at: '60', useCases: ['UC-95'] },
  { key: 'S14', personKey: null, form: 'application', at: '3', useCases: ['UC-121'] },
];

// Rows of the imported Applications object. They have no usable date, so only a total reads them.
export const MAIN_APPLICATIONS = [
  { key: 'A01', isDeleted: false, useCases: ['UC-72'] },
  { key: 'A02', isDeleted: false, useCases: ['UC-72'] },
  { key: 'A03', isDeleted: true, useCases: ['UC-72'] },
];

// The jobs the main workspace goes through, in order. Each row of data becomes visible
// when the clock passes it, so a sync can run between two changes the CRM merges.
export const MAIN_JOB_PLAN = [
  { id: 'firstSync', job: 'sync', age: '20d30m' },
  { id: 'secondSync', job: 'sync', age: '20d15m' },
  { id: 'firstDaily', job: 'daily', age: '20d' },
  { id: 'lateRowSync', job: 'sync', age: '1d105m' },
  { id: 'overlapSync', job: 'sync', age: '1d90m' },
  { id: 'secondDaily', job: 'daily', age: '1d60m' },
  { id: 'cursorSync', job: 'sync', age: '15m' },
  { id: 'thirdDaily', job: 'daily', age: '1m' },
  { id: 'rerunSync', job: 'sync', age: '0', isRerun: true },
  { id: 'rerunDaily', job: 'daily', age: '0', isRerun: true },
];

// Runs while the main workspace waits, so a missing workspace filter would move its cursor.
export const SECOND_WORKSPACE_SYNC_AGE = '1d95m';

// Small separate setups, one for each state a workspace can be in. Field presence is what
// differs; people are only there so a state has something to read.
// prettier-ignore
export const OTHER_WORKSPACES = {
  second: {
    number: 2,
    fields: { personFields: 'FULL', forms: 'FULL', withApplication: false },
    people: [
      person('W2-1', 'NEW@40 CONTACTED@35', SOFTWARE, 'LINKEDIN', 'RT', 21, ['UC-85'], 'Same shape as main data, must stay out of main numbers'),
      person('W2-2', 'NEW@5 CONTACTED@1d96m', SOFTWARE, 'LINKEDIN', 'WW', null, ['UC-85'], 'Its row is newer than the main workspace cursor when the main sync runs'),
      person('W2-3', 'NEW@120 SIGNED_PAID@50', SOFTWARE, 'REFERRAL', '', null, ['UC-85'], 'Imported and signed, a total only this workspace has'),
    ],
    submissions: [{ key: 'S01', personKey: 'W2-1', form: 'application', at: '2', useCases: ['UC-85'] }],
  },
  noStageField: {
    number: 3,
    fields: { personFields: 'NONE', forms: 'NONE', withApplication: false },
    people: [person('W3-1', 'NONE@10', null, null, '', null, ['UC-79'], 'Person in a workspace with no Stage field')],
  },
  wrongStageType: {
    number: 4,
    fields: { personFields: 'WRONG_TYPE', forms: 'NONE', withApplication: false },
    people: [person('W4-1', 'NONE@10', null, null, '', null, ['UC-80'], 'Stage exists with a wrong type')],
  },
  textFields: {
    number: 5,
    fields: { personFields: 'TEXT', forms: 'NONE', withApplication: false },
    people: [
      person('W5-1', 'NEW@10', null, 'LINKEDIN', 'W', null, ['UC-81'], 'Stage and source are TEXT, which is accepted'),
      person('W5-2', 'NOT_A_STAGE@10', null, 'NOT_A_SOURCE', '', null, ['UC-81'], 'Free text outside the config reads as unmapped'),
    ],
  },
  noPositionOrSourceField: {
    number: 6,
    fields: { personFields: 'FULL', removedFields: ['positionsAppliedFor', 'applicantSource'], forms: 'NONE', withApplication: false },
    people: [person('W6-1', 'NEW@20 CONTACTED@18', null, null, 'RT', 4, ['UC-82'], 'Funnel works, categories only have NONE')],
  },
  noForms: {
    number: 7,
    fields: { personFields: 'FULL', forms: 'NONE', withApplication: false },
    people: [person('W7-1', 'NEW@10', SOFTWARE, 'LINKEDIN', 'W', null, ['UC-83', 'UC-89'], 'New applications are null, not 0')],
  },
  halfBuiltForms: {
    number: 8,
    fields: { personFields: 'FULL', forms: 'HALF_BUILT', withApplication: false },
    people: [person('W8-1', 'NEW@10', SOFTWARE, 'LINKEDIN', 'W', null, ['UC-84'], 'Form objects exist without the fields the relation reads')],
  },
  noPeople: {
    number: 9,
    fields: { personFields: 'FULL', forms: 'FULL', withApplication: false },
    people: [],
    setupUseCases: ['UC-86'],
  },
  // Apart from the main people, so one open question does not move every stuck total there.
  partDayOverLimit: {
    number: 10,
    fields: { personFields: 'FULL', forms: 'NONE', withApplication: false },
    people: [person('W10-1', 'NEW@14d6h', SOFTWARE, 'LINKEDIN', 'T', 0, ['UC-120'], 'Over the limit by six hours: is that stuck?')],
  },
};

// Use cases proved by the plan and the checks rather than by one row, each with the setup
// that serves it. The coverage check reads this next to the people's own tags.
export const SETUP_USE_CASES = {
  'UC-14': 'All main people: stage totals must add up',
  'UC-32': 'MAIN_JOB_PLAN: rerunSync and rerunDaily',
  'UC-61': 'MAIN_PEOPLE: most people are in SOFTWARE_DEVELOPMENT_INTERN, enough for the minimum sample',
  'UC-62': 'MAIN_PEOPLE: NEW and CONTACTED reach the minimum, later steps do not',
  'UC-76': 'Every person: invented sentinel name',
  'UC-77': 'Every person: invented sentinel email at example.com',
  'UC-78': 'Every submission: sentinel answer',
  'UC-87': 'OTHER_WORKSPACES.second, switched off and on again',
  'UC-88': 'Main workspace before firstSync',
  'UC-90': 'MAIN_PEOPLE: active, success, exit, unmapped and no stage people',
  'UC-91': 'P059 is the only person in ROBOTICS',
  'UC-92': 'P058 is the only person in FINANCE_INTERN',
  'UC-93': 'Sources spread over MAIN_PEOPLE',
  'UC-94': 'Ten people created in September, six imported',
  'UC-96': 'MAIN_JOB_PLAN: three daily runs',
  'UC-98': 'OTHER_WORKSPACES.second, daily at 20:00 UTC in Asia/Karachi',
  'UC-99': 'MAIN_JOB_PLAN: snapshots on 2026-10-29, 2026-11-17 and 2026-11-18',
  'UC-101': 'P009 to P013 and P039 are the only mature overall cohorts',
  'UC-102': 'Completed New stays of MAIN_PEOPLE',
  'UC-103': 'MAIN_PEOPLE by application week and month',
  'UC-104': 'Moves and reconciles in the current week',
  'UC-105': 'Track and source filters together',
  'UC-107': 'MAIN_JOB_PLAN: tracking start 100 days back gives 15 finished periods',
  'UC-108': 'MAIN_JOB_PLAN: reports built by firstDaily',
  'UC-109': 'Week of 2026-11-09',
  'UC-110': 'Months of 2026-09 and 2026-10',
  'UC-111': 'Week of 2026-11-09 against the week before',
  'UC-112': 'MAIN_JOB_PLAN and a later clock on OTHER_WORKSPACES.second',
  'UC-113': 'Two old log rows inserted after firstSync',
  'UC-114': 'firstSync',
  'UC-115': 'OTHER_WORKSPACES.second with a bad tracking start value',
  'UC-116': 'Five signed people',
  'UC-118': 'load.mjs guards',
  'UC-119': 'MAIN_PEOPLE read with no stage limit in the config',
  'UC-122': 'The field options written by the table setup',
};

const MILLISECONDS_BY_UNIT = { d: 86_400_000, h: 3_600_000, m: 60_000 };

// Whatever the "now" of a run, an age keeps its distance from it. An ISO instant is read
// as its distance from FIXED_NOW, so the late-night cases stay late at night under it.
export const parseAge = (text) => {
  const value = String(text);

  if (value.includes('T')) {
    return Date.parse(FIXED_NOW) - Date.parse(value);
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value) * MILLISECONDS_BY_UNIT.d;
  }

  const parts = [...value.matchAll(/(\d+)([dhm])/g)];

  if (parts.length === 0 || parts.map((part) => part[0]).join('') !== value) {
    throw new Error(`Bad age in the seed: "${value}"`);
  }

  return parts.reduce(
    (total, [, amount, unit]) => total + Number(amount) * MILLISECONDS_BY_UNIT[unit],
    0,
  );
};

const SIMPLE_TOKEN = /^([A-Z_]+)@([^\^>]+)(?:\^(.+))?$/;

const parseStageToken = (token) => {
  const match = SIMPLE_TOKEN.exec(token);

  if (match === null) {
    throw new Error(`Bad history token in the seed: "${token}"`);
  }

  const [, stage, age, arrival] = match;

  return { stage, age: parseAge(age), arrival };
};

const parseHistory = (history, nowMs) => {
  const [creationToken, ...tokens] = history.split(' ');
  const creation = parseStageToken(creationToken);
  const parsed = {
    createdAt: nowMs - creation.age,
    initialRaw: creation.stage === 'NONE' ? null : creation.stage,
    isCreatedOnRerun: creation.arrival === 'rerun',
    changes: [],
    timelineRows: [],
    lifecycle: [],
  };

  let currentRaw = parsed.initialRaw;

  for (const token of tokens) {
    if (token.startsWith('#')) {
      const [event, age] = token.slice(1).split('@');

      parsed.lifecycle.push({
        at: nowMs - parseAge(age),
        isDeleted: event === 'deleted',
      });
    } else if (token.startsWith('~')) {
      const { stage, age } = parseStageToken(token.slice(1));

      parsed.changes.push({ at: nowMs - age, to: stage });
      currentRaw = stage;
    } else {
      const [first, merged] = token.split('>>').map(parseStageToken);
      const firstAt = nowMs - first.age;
      const row = {
        before: currentRaw,
        after: first.stage,
        happensAt: firstAt,
        updatedAt: firstAt,
        visibleAt: first.arrival === undefined ? firstAt : nowMs - parseAge(first.arrival),
      };

      parsed.changes.push({ at: firstAt, to: first.stage });
      currentRaw = first.stage;

      if (merged !== undefined) {
        const mergedAt = nowMs - merged.age;

        row.merge = { after: merged.stage, updatedAt: mergedAt };
        parsed.changes.push({ at: mergedAt, to: merged.stage });
        currentRaw = merged.stage;
      }

      parsed.timelineRows.push(row);
    }
  }

  return parsed;
};

const toPersonRecord = (row, { workspaceNumber, personNumber, sentinel, nowMs }) => ({
  ...row,
  id: `5eed${String(workspaceNumber).padStart(4, '0')}-0000-4000-8000-${String(personNumber).padStart(12, '0')}`,
  firstName: sentinel[0].toUpperCase() + sentinel.slice(1),
  lastName: row.key,
  email: `${sentinel}.${row.key.toLowerCase()}${EMAIL_DOMAIN_SENTINEL}`,
  ...parseHistory(row.history, nowMs),
});

const buildWorkspace = ({ number, people, submissions = [], applications = [], ignoredRows = [], extraDiffByPerson = {}, sentinel, nowMs, fields, setupUseCases = [] }) => {
  const records = people.map((row, index) =>
    toPersonRecord(row, {
      workspaceNumber: number,
      personNumber: index + 1,
      sentinel,
      nowMs,
    }),
  );
  const idOf = (personKey) => records.find((record) => record.key === personKey).id;
  const rowId = (group, index) =>
    `5eed${String(number).padStart(4, '0')}-000${group}-4000-8000-${String(index + 1).padStart(12, '0')}`;
  let timelineIndex = 0;

  for (const record of records) {
    for (const row of record.timelineRows) {
      row.id = rowId(1, timelineIndex);
      row.personKey = record.key;
      row.personId = record.id;
      row.extraDiff = extraDiffByPerson[record.key];
      timelineIndex += 1;
    }
  }

  return {
    number,
    workspaceId: `20202020-5eed-4000-8000-${String(number).padStart(12, '0')}`,
    fields,
    setupUseCases,
    people: records,
    ignoredRows: ignoredRows.map((row, index) => ({
      ...row,
      id: rowId(5, index),
      personId: row.personKey === null ? null : idOf(row.personKey),
      at: nowMs - parseAge(row.age),
    })),
    forms: {
      application: { id: rowId(3, 0), name: APPLICATION_FORM_NAME },
      other: { id: rowId(3, 1), name: OTHER_FORM_NAME },
    },
    submissions: submissions.map((row, index) => ({
      ...row,
      id: rowId(2, index),
      personId: row.personKey === null ? null : idOf(row.personKey),
      submittedAt: nowMs - parseAge(row.at),
      deletedAt: row.deletedAge === undefined ? null : nowMs - parseAge(row.deletedAge),
      answers: { whyJoin: `${ANSWER_SENTINEL}-${row.key}` },
    })),
    applications: applications.map((row, index) => ({
      ...row,
      id: rowId(4, index),
    })),
  };
};

export const buildSeed = (nowIso = FIXED_NOW) => {
  const nowMs = Date.parse(nowIso);

  return {
    nowMs,
    trackingStartMs: nowMs - (Date.parse(FIXED_NOW) - Date.parse(TRACKING_START)),
    jobPlan: MAIN_JOB_PLAN.map((step) => ({ ...step, at: nowMs - parseAge(step.age) })),
    secondWorkspaceSyncAt: nowMs - parseAge(SECOND_WORKSPACE_SYNC_AGE),
    workspaces: {
      main: buildWorkspace({
        number: 1,
        people: MAIN_PEOPLE,
        submissions: MAIN_SUBMISSIONS,
        applications: MAIN_APPLICATIONS,
        ignoredRows: IGNORED_TIMELINE_ROWS,
        extraDiffByPerson: EXTRA_DIFF_BY_PERSON,
        sentinel: NAME_SENTINEL,
        nowMs,
        fields: { personFields: 'FULL', forms: 'FULL', withApplication: true },
      }),
      ...Object.fromEntries(
        Object.entries(OTHER_WORKSPACES).map(([name, workspace]) => [
          name,
          buildWorkspace({
            ...workspace,
            sentinel: name === 'second' ? SECOND_WORKSPACE_SENTINEL : NAME_SENTINEL,
            nowMs,
          }),
        ]),
      ),
    },
  };
};
