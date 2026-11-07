#!/usr/bin/env node
// Invented applicants for showing the analytics tool. All names are made up and all emails
// are at example.com. Each person draws from their own random stream, so one person's path
// never changes another's, and dates are distances from "now", so the shape repeats on any day.
//   node generate.mjs     prints counts per stage, track, source and week
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const DEMO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(DEMO_ROOT, '..', '..', '..', '..', '..');

export const DEMO_APPLICATION_COUNT = 150;
export const DEMO_WEEKS = 26;
export const DEMO_ID_PREFIX = 'de300001';
export const OTHER_FORM_NAME = 'Skills survey';
export const REMINDER_STAGE_VALUE = 'CONTACTED_REMINDER';
export const UNMAPPED_STAGE_VALUES = ['ON_HOLD', 'WAITLIST'];

// Chosen because every track ends up with signed people and all stages hold someone.
const RANDOM_SEED = 8;
const DAY_MILLISECONDS = 86_400_000;
const STUCK_LIMIT_DAYS = 14;
const OVERALL_WINDOW_DAYS = 90;

// None of them has a real timeline, as after a bulk import. Never moved, so they stay inactive.
const IMPORTED_STAGE_VALUES = [
  'NEW',
  'NEW',
  'CONTACTED',
  'CONTACTED',
  'CONTACTED',
  'BEFORE_MEETING',
  'SATURDAY_MEETING',
  'NO_ANSWER',
];
const CURRENT_REMINDER_COUNT = 4;
const PASS_THROUGH_REMINDER_CHANCE = 0.1;
const SECOND_APPLICATION_CHANCE = 0.06;
const OTHER_FORM_CHANCE = 0.06;
const SECOND_POSITION_CHANCE = 0.14;
const SECOND_POSITION_SAME_TRACK_CHANCE = 0.7;
const EXIT_SHARE_OF_LOSSES = 0.6;
const STALLED_GIVEN_UP_CHANCE = 0.55;

const STEP_RATES = {
  NEW: 0.93,
  CONTACTED: 0.85,
  BEFORE_MEETING: 0.9,
  SATURDAY_MEETING: 0.8,
  ATTENDED: 0.92,
  SECOND_MEETING: 0.86,
  AGREEMENT_SENT: 0.92,
};

const MEDIAN_DAYS = {
  NEW: 3,
  CONTACTED: 5,
  BEFORE_MEETING: 6,
  SATURDAY_MEETING: 7,
  ATTENDED: 4,
  SECOND_MEETING: 8,
  AGREEMENT_SENT: 6,
};

// weakStages give each track its own bad step, so the heatmap has something to say.
const TRACK_PROFILES = {
  AI_SOFTWARE: { share: 0.31, stepFactor: 1.01, pace: 1, weakStages: { ATTENDED: 0.9 } },
  ROBOTICS: { share: 0.16, stepFactor: 1.05, pace: 1.15, weakStages: { AGREEMENT_SENT: 0.82 } },
  BUSINESS: { share: 0.24, stepFactor: 0.96, pace: 0.85, weakStages: { SECOND_MEETING: 0.7 } },
  DESIGN_COMMUNICATION: { share: 0.15, stepFactor: 1.02, pace: 0.9, weakStages: { BEFORE_MEETING: 0.85 } },
  EMERGING_SCIENCES: { share: 0.14, stepFactor: 0.92, pace: 1.3, weakStages: { SATURDAY_MEETING: 0.7 } },
};

const SOURCE_PROFILES = {
  LINKEDIN: { share: 0.3, stepFactor: 1, pace: 1 },
  UNIVERSITY: { share: 0.18, stepFactor: 1.02, pace: 1.05 },
  WEBSITE: { share: 0.2, stepFactor: 0.96, pace: 1 },
  REFERRAL: { share: 0.12, stepFactor: 1.08, pace: 0.8 },
  INSTAGRAM: { share: 0.1, stepFactor: 0.87, pace: 1.1 },
  JOB_BOARD: { share: 0.1, stepFactor: 0.91, pace: 1.15 },
};

const EARLY_EXIT_STAGES = new Set(['NEW', 'CONTACTED', 'BEFORE_MEETING']);
const EARLY_EXITS = { NO_ANSWER: 5, NOT_INTERESTED: 3, REJECTED_BY_US: 1 };
const LATE_EXITS = { NOT_INTERESTED: 4, REJECTED_BY_US: 4, NO_ANSWER: 2 };
const GIVEN_UP_EXIT_VALUE = 'NO_ANSWER';

const FIRST_NAMES = [
  'Aisha', 'Ahmed', 'Ali', 'Amara', 'Amir', 'Ana', 'Anika', 'Arjun', 'Asad', 'Ayesha',
  'Bilal', 'Camila', 'Carlos', 'Chloe', 'Daniel', 'Daniyal', 'Elena', 'Emily', 'Ethan', 'Fatima',
  'Felix', 'Hamza', 'Hana', 'Hassan', 'Imran', 'Ines', 'Isabel', 'Jonas', 'Julia', 'Kavya',
  'Kenji', 'Laila', 'Leo', 'Lina', 'Lucas', 'Maha', 'Maria', 'Marcus', 'Maya', 'Mei',
  'Mina', 'Nadia', 'Naveed', 'Nina', 'Noah', 'Omar', 'Priya', 'Rafael', 'Rahul', 'Rania',
  'Rohan', 'Sara', 'Sana', 'Sofia', 'Tariq', 'Usman', 'Yara', 'Yusuf', 'Zainab', 'Zoya',
];

const LAST_NAMES = [
  'Abbasi', 'Ahmad', 'Akhtar', 'Alvarez', 'Anderson', 'Baig', 'Bakker', 'Bhatt', 'Butt', 'Chen',
  'Chaudhry', 'Costa', 'Dar', 'Das', 'Fischer', 'Garcia', 'Ghani', 'Gupta', 'Haider', 'Hashmi',
  'Hussain', 'Ibrahim', 'Iqbal', 'Jansen', 'Javed', 'Kapoor', 'Khalid', 'Khan', 'Kim', 'Kumar',
  'Lee', 'Lopez', 'Malik', 'Martin', 'Mehta', 'Mirza', 'Morales', 'Nair', 'Nasir', 'Nguyen',
  'Novak', 'Okafor', 'Park', 'Patel', 'Qureshi', 'Rahman', 'Rashid', 'Reyes', 'Rossi', 'Saeed',
  'Santos', 'Shah', 'Sharma', 'Siddiqui', 'Silva', 'Tanaka', 'Tariq', 'Weber', 'Yilmaz', 'Zaman',
];

let realCode;

// Positions, tracks and stages come from the product's own config, never a copy of it.
export const readRealCode = () => {
  if (realCode === undefined) {
    const { installLoader } = require('../integration/lib/loader.cjs');
    const loader = installLoader(REPO_ROOT);
    const { CRM_ANALYTICS_CONFIG } = loader.real(
      'src/modules/analytics/constants/crm-analytics-config.constant',
    );

    realCode = { loader, config: CRM_ANALYTICS_CONFIG };
  }

  return realCode;
};

const hashText = (text) => {
  let hash = 2166136261;

  for (const character of text) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }

  return hash >>> 0;
};

// mulberry32
const createRandom = (streamName) => {
  let state = (RANDOM_SEED ^ hashText(streamName)) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);

    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const pickWeighted = (random, weights) => {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = random() * total;

  for (const [value, weight] of entries) {
    remaining -= weight;

    if (remaining <= 0) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
};

const pickFrom = (random, values) => values[Math.floor(random() * values.length)];

const drawLogNormal = (random, median, spread) => {
  const normal =
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());

  return median * Math.exp(spread * normal);
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const buildId = (group, number) =>
  `${DEMO_ID_PREFIX}-${String(group).padStart(4, '0')}-4000-8000-${String(number).padStart(12, '0')}`;

// Busier toward now. The last two weeks stay smooth, so last week lands near 12 at the
// default size whatever the earlier noise does.
const buildWeeklyCounts = (size) => {
  const random = createRandom('weekly-noise');
  const weights = Array.from({ length: DEMO_WEEKS }, (_, week) => {
    const noise = week >= DEMO_WEEKS - 2 ? 1 : 0.7 + random() * 0.6;

    return (3.5 + 9 * (week / (DEMO_WEEKS - 1)) ** 2) * noise;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => (weight * size) / total);
  const counts = exact.map(Math.floor);
  const byLargestRemainder = exact
    .map((value, week) => ({ week, remainder: value - Math.floor(value) }))
    .sort((first, second) => second.remainder - first.remainder);
  const missing = size - counts.reduce((sum, count) => sum + count, 0);

  for (const { week } of byLargestRemainder.slice(0, missing)) {
    counts[week] += 1;
  }

  return counts;
};

const buildEntryTimes = ({ size, nowMs }) => {
  const entryTimes = [];

  buildWeeklyCounts(size).forEach((count, week) => {
    const weekStartMs = nowMs - (DEMO_WEEKS - week) * 7 * DAY_MILLISECONDS;

    for (let slot = 0; slot < count; slot += 1) {
      const random = createRandom(`entry-${week}-${slot}`);

      entryTimes.push(weekStartMs + Math.floor(random() * 7 * DAY_MILLISECONDS));
    }
  });

  return entryTimes.sort((first, second) => first - second);
};

// Popular programs come first in a track, so program bars are not all equal.
const pickProgram = (random, track) =>
  pickWeighted(
    random,
    Object.fromEntries(
      track.positions.map((position, index) => [
        position,
        1 / (1 + ((index + hashText(track.trackKey)) % track.positions.length)),
      ]),
    ),
  );

const pickPositions = (random, config) => {
  const trackKey = pickWeighted(
    random,
    Object.fromEntries(
      config.tracks.map((track) => [track.trackKey, TRACK_PROFILES[track.trackKey]?.share ?? 0.1]),
    ),
  );
  const track = config.tracks.find((candidate) => candidate.trackKey === trackKey);
  const first = pickProgram(random, track);

  if (random() >= SECOND_POSITION_CHANCE) {
    return { trackKey, positions: [first] };
  }

  const otherTracks = config.tracks.filter((candidate) => candidate.trackKey !== trackKey);
  const secondTrack =
    random() < SECOND_POSITION_SAME_TRACK_CHANCE ? track : pickFrom(random, otherTracks);
  const second = pickProgram(random, secondTrack);

  return { trackKey, positions: second === first ? [first] : [first, second] };
};

// Between 0.93 and 1.07, fixed per program.
const computeProgramFactor = (position) => 0.93 + 0.14 * (hashText(position) / 4294967295);

// One person's moves, stopped at now. A step draws its outcome, then how long it took.
const simulatePath = ({ random, createdAtMs, nowMs, funnel, trackKey, source, position, progress }) => {
  const track = TRACK_PROFILES[trackKey];
  const sourceProfile = SOURCE_PROFILES[source];
  const newerGroupFactor = 0.97 + 0.06 * progress;
  const changes = [];
  let currentStage = funnel[0].rawValue;
  let enteredAtMs = createdAtMs;

  const addChange = (after, atMs) => {
    changes.push({ before: currentStage, after, atMs });
    currentStage = after;
    enteredAtMs = atMs;
  };

  for (let index = 0; index < funnel.length - 1; index += 1) {
    const { stageKey } = funnel[index];
    const moveChance = clamp(
      STEP_RATES[stageKey] *
        track.stepFactor *
        (track.weakStages[stageKey] ?? 1) *
        sourceProfile.stepFactor *
        computeProgramFactor(position) *
        newerGroupFactor,
      0.05,
      0.97,
    );
    const outcome = random();
    const days = clamp(
      drawLogNormal(random, MEDIAN_DAYS[stageKey] * track.pace * sourceProfile.pace, 0.45),
      0.3,
      45,
    );
    const atMs = enteredAtMs + Math.floor(days * DAY_MILLISECONDS);

    if (atMs > nowMs) {
      return changes;
    }

    if (outcome < moveChance) {
      if (stageKey === 'CONTACTED' && random() < PASS_THROUGH_REMINDER_CHANCE) {
        const reminderAtMs = enteredAtMs + Math.floor(((atMs - enteredAtMs) * 2) / 3);

        addChange(REMINDER_STAGE_VALUE, reminderAtMs);
      }

      addChange(
        index === funnel.length - 2
          ? pickFrom(random, funnel[index + 1].rawValues)
          : funnel[index + 1].rawValue,
        atMs,
      );

      continue;
    }

    if (random() < EXIT_SHARE_OF_LOSSES) {
      addChange(
        pickWeighted(random, EARLY_EXIT_STAGES.has(stageKey) ? EARLY_EXITS : LATE_EXITS),
        atMs,
      );

      return changes;
    }

    // Stalled: no move at all. Most are closed as no answer later, the rest stay stuck.
    const givenUpAtMs = enteredAtMs + Math.floor((20 + random() * 25) * DAY_MILLISECONDS);

    if (random() < STALLED_GIVEN_UP_CHANCE && givenUpAtMs <= nowMs) {
      addChange(GIVEN_UP_EXIT_VALUE, givenUpAtMs);
    }

    return changes;
  }

  return changes;
};

const lastOf = (values) => values[values.length - 1];

// A person sitting on a reminder is rare by chance, so a few are placed by hand.
const placeCurrentReminders = ({ people, nowMs, count }) => {
  const candidates = people.filter(
    (person) =>
      !person.isImported &&
      person.stage === 'CONTACTED' &&
      nowMs - (lastOf(person.changes)?.atMs ?? person.createdAtMs) > 2 * DAY_MILLISECONDS,
  );
  const stride = Math.max(1, Math.floor(candidates.length / count));

  candidates
    .filter((_, index) => index % stride === 0)
    .slice(0, count)
    .forEach((person) => {
      const enteredAtMs = lastOf(person.changes)?.atMs ?? person.createdAtMs;

      person.changes.push({
        before: person.stage,
        after: REMINDER_STAGE_VALUE,
        atMs: enteredAtMs + Math.floor((nowMs - enteredAtMs) / 2),
      });
      person.stage = REMINDER_STAGE_VALUE;
    });
};

const assertValuesAreReal = ({ config, stageValues, positions, sources }) => {
  const known = new Set(config.stages.flatMap((stage) => stage.rawValues.map(({ rawValue }) => rawValue)));
  const knownPositions = new Set(config.tracks.flatMap((track) => track.positions));
  const unknownStages = stageValues.filter(
    (value) => !known.has(value) && value !== REMINDER_STAGE_VALUE && !UNMAPPED_STAGE_VALUES.includes(value),
  );
  const unknownPositions = positions.filter((value) => !knownPositions.has(value));
  const notUnmapped = UNMAPPED_STAGE_VALUES.filter((value) => known.has(value));
  const unknownProfiles = config.tracks.filter((track) => TRACK_PROFILES[track.trackKey] === undefined);

  if (
    unknownStages.length > 0 ||
    unknownPositions.length > 0 ||
    notUnmapped.length > 0 ||
    unknownProfiles.length > 0
  ) {
    throw new Error(
      `The demo no longer matches the config: ${JSON.stringify({ unknownStages, unknownPositions, notUnmapped, unknownProfiles, sources })}`,
    );
  }
};

const toEmailPart = (name) => name.toLowerCase().replace(/[^a-z]/g, '');

const buildNamedPerson = ({ number, random }) => {
  const firstName = pickFrom(random, FIRST_NAMES);
  const lastName = pickFrom(random, LAST_NAMES);

  return {
    id: buildId(0, number),
    firstName,
    lastName,
    // The number keeps it unique, because the email column has a unique index.
    email: `${toEmailPart(firstName)}.${toEmailPart(lastName)}.${number}@example.com`,
  };
};

export const buildDemo = ({
  nowIso = new Date().toISOString(),
  size = DEMO_APPLICATION_COUNT,
  config = readRealCode().config,
} = {}) => {
  const nowMs = Date.parse(nowIso);
  const firstEntryMs = nowMs - DEMO_WEEKS * 7 * DAY_MILLISECONDS;
  const trackingStartMs = firstEntryMs - (firstEntryMs % DAY_MILLISECONDS);
  const funnel = config.stages
    .filter((stage) => stage.rank !== null)
    .sort((first, second) => first.rank - second.rank)
    .map((stage) => ({
      stageKey: stage.stageKey,
      rawValue: stage.rawValues[0].rawValue,
      rawValues: stage.rawValues.map(({ rawValue }) => rawValue),
    }));
  const entryTimes = buildEntryTimes({ size, nowMs });
  const unmappedIndexes = new Map([
    [Math.floor(size * 0.35), UNMAPPED_STAGE_VALUES[0]],
    [Math.floor(size * 0.7), UNMAPPED_STAGE_VALUES[1]],
  ]);

  const applicants = entryTimes.map((createdAtMs, index) => {
    const number = index + 1;
    const random = createRandom(`person-${number}`);
    const named = buildNamedPerson({ number, random });
    const { trackKey, positions } = pickPositions(random, config);
    const source = pickWeighted(
      random,
      Object.fromEntries(Object.entries(SOURCE_PROFILES).map(([value, { share }]) => [value, share])),
    );
    const unmappedValue = unmappedIndexes.get(index);
    const simulated = simulatePath({
      random,
      createdAtMs,
      nowMs,
      funnel,
      trackKey,
      source,
      position: positions[0],
      progress: index / size,
    });
    // One created on an unmapped value, one moved to it after contact.
    const isCreatedUnmapped = unmappedValue === UNMAPPED_STAGE_VALUES[1];
    const changes =
      unmappedValue === undefined || isCreatedUnmapped
        ? isCreatedUnmapped
          ? []
          : simulated
        : [
            { before: funnel[0].rawValue, after: funnel[1].rawValue, atMs: createdAtMs + 3 * DAY_MILLISECONDS },
            { before: funnel[1].rawValue, after: unmappedValue, atMs: createdAtMs + 9 * DAY_MILLISECONDS },
          ];
    const initialStage = isCreatedUnmapped ? unmappedValue : funnel[0].rawValue;

    return {
      ...named,
      number,
      createdAtMs,
      initialStage,
      stage: lastOf(changes)?.after ?? initialStage,
      positions,
      trackKey,
      source,
      isImported: false,
      changes,
    };
  });

  const imported = IMPORTED_STAGE_VALUES.map((stage, index) => {
    const number = size + index + 1;
    const random = createRandom(`imported-${index}`);
    const named = buildNamedPerson({ number, random });
    const { trackKey, positions } = pickPositions(random, config);

    return {
      ...named,
      number,
      createdAtMs: trackingStartMs - Math.floor((3 + random() * 40) * DAY_MILLISECONDS),
      initialStage: stage,
      stage,
      positions,
      trackKey,
      source: null,
      isImported: true,
      changes: [],
    };
  });

  placeCurrentReminders({ people: applicants, nowMs, count: CURRENT_REMINDER_COUNT });

  const people = [...applicants, ...imported];
  let timelineNumber = 0;
  const nextTimelineId = () => {
    timelineNumber += 1;

    return buildId(1, timelineNumber);
  };

  for (const person of people) {
    person.updatedAtMs = lastOf(person.changes)?.atMs ?? person.createdAtMs;
    person.creationRowId = nextTimelineId();

    for (const change of person.changes) {
      change.id = nextTimelineId();
    }
  }

  const forms = {
    application: { id: buildId(3, 1), name: config.applicationFormNames[0] },
    other: { id: buildId(3, 2), name: OTHER_FORM_NAME },
  };
  const submissions = [];
  const addSubmission = (form, person, submittedAtMs) => {
    if (submittedAtMs <= nowMs) {
      submissions.push({
        id: buildId(2, submissions.length + 1),
        formId: form.id,
        formName: form.name,
        personId: person.id,
        name: `${form.name} · ${person.email}`,
        submittedAtMs,
        answers: { motivation: 'Invented demo answer' },
      });
    }
  };

  for (const person of applicants) {
    const random = createRandom(`submissions-${person.number}`);
    const secondAfterMs = Math.floor((3 + random() * 37) * DAY_MILLISECONDS);
    const otherAfterMs = Math.floor((1 + random() * 19) * DAY_MILLISECONDS);

    addSubmission(forms.application, person, person.createdAtMs);

    if (random() < SECOND_APPLICATION_CHANCE) {
      addSubmission(forms.application, person, person.createdAtMs + secondAfterMs);
    }

    if (random() < OTHER_FORM_CHANCE) {
      addSubmission(forms.other, person, person.createdAtMs + otherAfterMs);
    }
  }

  assertValuesAreReal({
    config,
    stageValues: [...new Set(people.flatMap((person) => [person.initialStage, ...person.changes.map((change) => change.after)]))],
    positions: [...new Set(people.flatMap((person) => person.positions))],
    sources: [...new Set(people.map((person) => person.source))],
  });

  return { nowMs, trackingStartMs, forms, people, submissions };
};

const countBy = (values) => {
  const counts = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
};

// Rough numbers for checking the shape of the data. The product's metrics are the real ones.
export const summarizeDemo = (demo, config = readRealCode().config) => {
  const { nowMs, trackingStartMs, people, submissions, forms } = demo;
  const kindByRaw = new Map(
    config.stages.flatMap((stage) => stage.rawValues.map(({ rawValue }) => [rawValue, stage])),
  );
  const successValues = new Set(config.stages.filter((stage) => stage.isSuccess).flatMap((stage) => stage.rawValues.map(({ rawValue }) => rawValue)));
  const trackByPosition = new Map(config.tracks.flatMap((track) => track.positions.map((position) => [position, track.trackKey])));
  const tracked = people.filter((person) => !person.isImported);
  const applications = submissions.filter((submission) => submission.formId === forms.application.id);
  const weekOf = (atMs) => DEMO_WEEKS - 1 - Math.floor((nowMs - atMs) / (7 * DAY_MILLISECONDS));
  const applicationsPerWeek = Array(DEMO_WEEKS).fill(0);

  for (const submission of applications) {
    applicationsPerWeek[clamp(weekOf(submission.submittedAtMs), 0, DEMO_WEEKS - 1)] += 1;
  }

  const clockStartOf = (person) => {
    const moves = person.changes.filter((change) => change.after !== REMINDER_STAGE_VALUE);

    return lastOf(moves)?.atMs ?? person.createdAtMs;
  };
  const stageOfPerson = (person) => kindByRaw.get(person.stage);
  const stuck = tracked.filter((person) => {
    const stage = person.stage === REMINDER_STAGE_VALUE ? kindByRaw.get('CONTACTED') : stageOfPerson(person);

    return (
      stage?.kind === 'MAIN' &&
      !stage.isSuccess &&
      Math.floor((nowMs - clockStartOf(person)) / DAY_MILLISECONDS) > STUCK_LIMIT_DAYS
    );
  });
  const old = tracked.filter(
    (person) => nowMs - person.createdAtMs >= OVERALL_WINDOW_DAYS * DAY_MILLISECONDS,
  );
  const signedInWindow = (person) =>
    person.changes.some(
      (change) =>
        successValues.has(change.after) &&
        change.atMs - person.createdAtMs <= OVERALL_WINDOW_DAYS * DAY_MILLISECONDS,
    );
  const rateBy = (keyOf) =>
    Object.fromEntries(
      [...new Set(old.flatMap(keyOf))].sort().map((key) => {
        const group = old.filter((person) => keyOf(person).includes(key));
        const signed = group.filter(signedInWindow).length;

        return [key, `${signed} of ${group.length}`];
      }),
    );
  const tracksOf = (person) => [...new Set(person.positions.map((position) => trackByPosition.get(position)))];

  return {
    people: people.length,
    imported: people.length - tracked.length,
    trackingStart: new Date(trackingStartMs).toISOString(),
    applications: applications.length,
    otherFormSubmissions: submissions.length - applications.length,
    applicationsPerWeek,
    lastSevenDaysApplications: applications.filter((submission) => nowMs - submission.submittedAtMs < 7 * DAY_MILLISECONDS).length,
    stages: countBy(people.map((person) => person.stage)),
    tracks: countBy(people.flatMap(tracksOf)),
    sources: countBy(people.map((person) => person.source ?? 'NONE')),
    positionsInUse: new Set(people.flatMap((person) => person.positions)).size,
    peopleInSeveralPositions: people.filter((person) => person.positions.length > 1).length,
    stuck: stuck.length,
    timelineChanges: people.reduce((sum, person) => sum + person.changes.length, 0),
    oldEnoughForOverall: old.length,
    signedInWindow: old.filter(signedInWindow).length,
    overallByTrack: rateBy(tracksOf),
    overallBySource: rateBy((person) => [person.source]),
  };
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(summarizeDemo(buildDemo()), null, 2));
}
