// A difference is never hidden here: this says which way a known one leans, so the
// evaluator starts from a reason, and the check still fails. An evaluator who rules a
// difference fine sets isAccepted, and it is then listed without failing the run.
const NOTES = [];

// Corrected in expected.mjs after comparing, each for its own reason in the contract.
// Listed so an evaluator can overrule the correction.
export const CORRECTED_IN_EXPECTED = [
  'Track and program rows: a person with no position has a NONE track row and no program row. expected.mjs first gave them a NONE program row too; section 6 builds programs from unnest(positions), which yields none.',
  'New applications with only an end date: the span starts at the local date of tracking start. The contract is silent and section 7 types the start as a string, so expected.mjs took the same reading as the product once the first run showed it had none.',
  'A soft-deleted person\'s submission does not count, with or without a person filter; one with no person still does. "Decisions from testing".',
  'Unknown source: the row key is the raw value with isUnmapped true, and filtering uses the raw value. There is no shared UNMAPPED source key. "Decisions from testing", replacing section 1.',
  'Cohort table: rows are cut to the same window as the trend line. "Decisions from testing".',
  'Median days: rounded to one decimal. "Decisions from testing".',
  'Stuck: whole days, so 14 days and 6 hours is not over a 14 day limit until day 15. Funnel windows still compare exact times. "Decisions from testing".',
  'New applications trend: null for a bucket that ends before the local tracking start date, not 0. The bucket holding the tracking start still counts. Backend known fix, from UI review 1.',
  'A TEXT source field has no option list, so no row is marked unmapped there. The contract is silent, so expected.mjs took the same reading as the product once the first run showed it had none. Stage values on a TEXT field still read as unmapped.',
];

export const classifyDifference = ({ checkId, label }) => {
  const text = `${checkId} ${label}`;
  const note = NOTES.find(({ match }) => match.test(text));

  return note === undefined
    ? { suspect: 'not classified yet', why: '', isAccepted: false }
    : { suspect: note.suspect, why: note.why, isAccepted: note.isAccepted };
};
