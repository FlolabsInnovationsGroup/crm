// A difference is never hidden here: this says which way a known one leans, so the
// evaluator starts from a reason, and the check still fails. An evaluator who rules a
// difference fine sets isAccepted, and it is then listed without failing the run.
const NOTES = [
  {
    match: /^D-1 /,
    suspect: 'contract ambiguity',
    why: 'Section 6 says percentile_cont(0.5) of days and no precision. The product rounds to one decimal in JavaScript (roundDays). All other medians are compared at one decimal.',
    isAccepted: false,
  },
  {
    match: /source UNMAPPED|TOP\/UNMAPPED|TOP\/LEGACY_SOURCE|UNMAPPED row/,
    suspect: 'contract ambiguity',
    why: 'Section 1 sends unknown sources to key UNMAPPED. Sections 5 and 6 read source by value and section 8 shows "Unmapped: {raw}". The product keeps the raw key with isUnmapped true, so sourceKey UNMAPPED finds nobody.',
    isAccepted: false,
  },
  {
    match: /partDayOverLimit/,
    suspect: 'contract ambiguity',
    why: 'Section 6 says "days in stage over the limit" and does not say whole days. The product floors the days first, so 14 days and 6 hours is not stuck until day 15. Windows, by contrast, compare exact times.',
    isAccepted: false,
  },
  {
    match: /cohorts\.2026-08-1[07]/,
    suspect: 'contract ambiguity',
    why: 'Section 6 gives 12 weeks as the trend line window and no window for the cohort table. The product cuts cohort rows to the trend window, so application weeks older than that are not shown.',
    isAccepted: false,
  },
];

// Corrected in expected.mjs after comparing, each for its own reason in the contract.
// Listed so an evaluator can overrule the correction.
export const CORRECTED_IN_EXPECTED = [
  'Track and program rows: a person with no position has a NONE track row and no program row. expected.mjs first gave them a NONE program row too; section 6 builds programs from unnest(positions), which yields none.',
  'A soft-deleted person\'s submission: expected.mjs first counted it when no person filter was set, reading the section 4 relation alone. Section 6 says deletedAt IS NULL everywhere, and integration check T8 settles it.',
  'New applications with only an end date: the span starts at the local date of tracking start. The contract is silent and section 7 types the start as a string, so expected.mjs took the same reading as the product once the first run showed it had none.',
];

export const classifyDifference = ({ checkId, label }) => {
  const text = `${checkId} ${label}`;
  const note = NOTES.find(({ match }) => match.test(text));

  return note === undefined
    ? { suspect: 'not classified yet', why: '', isAccepted: false }
    : { suspect: note.suspect, why: note.why, isAccepted: note.isAccepted };
};
