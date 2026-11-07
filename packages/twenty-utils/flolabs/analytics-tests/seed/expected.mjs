// The expected results, calculated from the seed in plain JavaScript, from contract sections
// 5 and 6 and its "Decisions from testing". Written without reading the product's SQL and
// imports nothing from it, so a match between the two means two separate calculations agree.
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const SYNC_OVERLAP_MINUTES = 30;
const RECONCILE_SKIP_MINUTES = 30;
const REPORTS_PER_RUN = 8;
const MAXIMUM_TREND_BUCKETS = 60;
const DEFAULT_TREND_BUCKETS = { DAY: 30, WEEK: 12, MONTH: 12 };

const NONE_KEY = 'NONE';
const UNMAPPED_KEY = 'UNMAPPED';

export const NO_FILTER = {
  dateFrom: null,
  dateTo: null,
  trackKey: null,
  programKey: null,
  sourceKey: null,
  status: 'ALL',
  period: 'WEEK',
};

const compareNumbers = (first, second) => first - second;

// A median leaves the server rounded to one decimal.
const medianDays = (values) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(compareNumbers);
  const middle = (sorted.length - 1) / 2;
  const exact = (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;

  return Math.round(exact * 10) / 10;
};

const ratio = (top, bottom) => (bottom > 0 ? top / bottom : null);

const withoutEntered = ({ entered, ...overall }) => overall;

const addLocalDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const periodStart = (date, period) => {
  if (period === 'DAY') {
    return date;
  }

  if (period === 'MONTH') {
    return `${date.slice(0, 7)}-01`;
  }

  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();

  return addLocalDays(date, -((dayOfWeek + 6) % 7));
};

const addPeriods = (start, period, count) => {
  if (period === 'DAY') {
    return addLocalDays(start, count);
  }

  if (period === 'WEEK') {
    return addLocalDays(start, count * 7);
  }

  const date = new Date(`${start}T00:00:00.000Z`);

  date.setUTCMonth(date.getUTCMonth() + count);

  return date.toISOString().slice(0, 10);
};

const buildStageIndex = (config) => {
  const stageByRaw = new Map();

  for (const stage of config.stages) {
    for (const { rawValue, isReminder } of stage.rawValues) {
      stageByRaw.set(rawValue, { ...stage, isReminder });
    }
  }

  return {
    stageByRaw,
    funnelStages: config.stages
      .filter((stage) => stage.rank !== null)
      .sort((first, second) => first.rank - second.rank),
    successStage: config.stages.find((stage) => stage.isSuccess) ?? null,
  };
};

// One workspace, simulated through its job plan as contract section 5 describes. Pass a
// different timeZone or minimumSample to get the numbers for that setting.
export const createExpectedWorkspace = ({
  workspace,
  jobs,
  config,
  nowMs,
  trackingStartMs,
  knownSources,
  timeZone = config.reportingTimeZone,
  minimumSample = config.minimumSample,
}) => {
  const { stageByRaw, funnelStages, successStage } = buildStageIndex(config);
  const stepStages = funnelStages.filter((stage) => stage.windowDays !== null);
  const trackByPosition = new Map(
    config.tracks.flatMap((track) =>
      track.positions.map((position) => [position, track.trackKey]),
    ),
  );
  const { personFields, forms, withApplication, removedFields = [] } = workspace.fields;
  const hasStageField = personFields === 'FULL' || personFields === 'TEXT';
  const hasPositionField =
    personFields === 'FULL' && !removedFields.includes('positionsAppliedFor');
  const hasSourceField =
    (personFields === 'FULL' || personFields === 'TEXT') &&
    !removedFields.includes('applicantSource');
  const hasFormObjects = forms === 'FULL';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDate = (ms) => dateFormatter.format(new Date(ms));
  const isInRange = (ms, from, to) => {
    const date = localDate(ms);

    return (from === null || date >= from) && (to === null || date <= to);
  };

  const keyOfRaw = (raw) => stageByRaw.get(raw)?.stageKey ?? null;

  const stateAt = (person, asOf) => {
    let raw = hasStageField ? person.initialRaw : null;
    let updatedAt = person.createdAt;
    let isDeleted = false;

    if (hasStageField) {
      for (const change of person.changes) {
        if (change.at <= asOf) {
          raw = change.to;
          updatedAt = change.at;
        }
      }
    }

    for (const event of person.lifecycle) {
      if (event.at <= asOf) {
        isDeleted = event.isDeleted;
      }
    }

    const stage = stageByRaw.get(raw);
    const kind = stage?.kind ?? null;
    const isSuccess = stage?.isSuccess === true;

    return {
      person,
      key: person.key,
      id: person.id,
      createdAt: person.createdAt,
      raw,
      updatedAt,
      isDeleted,
      positions: hasPositionField ? (person.positions ?? []) : [],
      source: hasSourceField ? person.source : null,
      currentKey: stage?.stageKey ?? null,
      currentRank: stage?.rank ?? null,
      kind,
      isSuccess,
      limitDays: stage?.limitDays ?? null,
      isActive: (kind === 'MAIN' || kind === 'OTHER') && !isSuccess,
      isUnmapped: raw !== null && stage === undefined,
    };
  };

  const peopleAt = (asOf, { includeRerun = true } = {}) =>
    workspace.people
      .filter(
        (person) =>
          person.createdAt <= asOf && (includeRerun || !person.isCreatedOnRerun),
      )
      .map((person) => stateAt(person, asOf))
      .filter((state) => !state.isDeleted);

  const stored = [];
  const snapshots = new Map();
  const builtReports = new Map();
  const jobLog = [];

  const listTimelineVersions = (asOf) => {
    const versions = [];

    for (const person of workspace.people) {
      for (const row of person.timelineRows) {
        if (row.visibleAt <= asOf && person.createdAt <= asOf) {
          const isMerged = row.merge !== undefined && row.merge.updatedAt <= asOf;

          versions.push({
            sourceId: row.id,
            personKey: person.key,
            before: row.before,
            after: isMerged ? row.merge.after : row.after,
            happensAt: row.happensAt,
            updatedAt: isMerged ? row.merge.updatedAt : row.updatedAt,
          });
        }
      }
    }

    return versions;
  };

  // Ignored rows are not listed: each fails one facade filter, and the test proves it.
  const readTimeline = (at, lowerBound) => {
    let insertedCount = 0;

    for (const version of listTimelineVersions(at)) {
      if (version.updatedAt < lowerBound || version.happensAt < trackingStartMs) {
        continue;
      }

      const seen = stored
        .filter(
          (row) => row.sourceId === version.sourceId && row.origin === 'timeline',
        )
        .sort((first, second) => second.sourceUpdatedAt - first.sourceUpdatedAt);

      if (seen.length === 0) {
        stored.push({
          sourceId: version.sourceId,
          personKey: version.personKey,
          from: version.before,
          to: version.after,
          happenedAt: version.happensAt,
          sourceUpdatedAt: version.updatedAt,
          origin: 'timeline',
          storedAt: at,
        });
        insertedCount += 1;
      } else if (
        seen[0].to !== version.after &&
        !seen.some((row) => row.sourceUpdatedAt === version.updatedAt)
      ) {
        stored.push({
          sourceId: version.sourceId,
          personKey: version.personKey,
          from: seen[0].to,
          to: version.after,
          happenedAt: version.updatedAt,
          sourceUpdatedAt: version.updatedAt,
          origin: 'timeline',
          storedAt: at,
        });
        insertedCount += 1;
      }
    }

    return insertedCount;
  };

  const reconcile = (at, includeRerun) => {
    let restoredCount = 0;

    for (const state of peopleAt(at, { includeRerun })) {
      const rows = stored
        .filter((row) => row.personKey === state.key)
        .sort(
          (first, second) =>
            second.happenedAt - first.happenedAt ||
            second.sourceUpdatedAt - first.sourceUpdatedAt,
        );

      if (rows.length === 0) {
        continue;
      }

      const last = rows[0];
      const isOldEnough = state.updatedAt < at - RECONCILE_SKIP_MINUTES * MINUTE_MS;

      if (
        isOldEnough &&
        (keyOfRaw(last.to) ?? last.to) !== (keyOfRaw(state.raw) ?? state.raw)
      ) {
        stored.push({
          sourceId: null,
          personKey: state.key,
          from: last.to,
          to: state.raw,
          happenedAt: at,
          sourceUpdatedAt: at,
          origin: 'reconcile',
          storedAt: at,
        });
        restoredCount += 1;
      }
    }

    return restoredCount;
  };

  const tracksOf = (state) =>
    state.positions.length === 0
      ? [NONE_KEY]
      : [
          ...new Set(
            state.positions.map(
              (position) => trackByPosition.get(position) ?? UNMAPPED_KEY,
            ),
          ),
        ];
  const programsOf = (state) =>
    state.positions.length === 0 ? [NONE_KEY] : state.positions;
  // An unknown source keeps its raw value as the key, so the row names what needs mapping.
  const sourceCategoryOf = (state) => state.source ?? NONE_KEY;
  // knownSources is null for a TEXT source: with no option list, no value can be unknown.
  const isUnmappedCategory = ({ key, parentKey }, groupBy) => {
    if (groupBy !== 'SOURCE') {
      return key === UNMAPPED_KEY || parentKey === UNMAPPED_KEY;
    }

    return knownSources !== null && key !== NONE_KEY && !knownSources.includes(key);
  };

  const buildSnapshotRows = (people) => {
    const counts = new Map();
    const add = (dimension, key, stage) => {
      const rowKey = `${dimension}|${key}|${stage}`;

      counts.set(rowKey, (counts.get(rowKey) ?? 0) + 1);
    };

    for (const state of people) {
      const stage = state.raw ?? '';

      add('all', '', stage);
      add('source', state.source ?? NONE_KEY, stage);

      for (const program of programsOf(state)) {
        add('position', program, stage);
      }

      for (const track of tracksOf(state)) {
        add('track', track, stage);
      }
    }

    return counts;
  };

  const firstFullLocalDate = () => {
    const date = localDate(trackingStartMs);
    const midnight = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(trackingStartMs));

    return midnight === '00:00:00' ? date : addLocalDays(date, 1);
  };

  const listFinishedPeriods = (at) => {
    const today = localDate(at);
    const firstDate = firstFullLocalDate();
    const periods = [];

    for (const periodType of ['WEEK', 'MONTH']) {
      let start = periodStart(firstDate, periodType);

      if (start !== firstDate) {
        start = addPeriods(start, periodType, 1);
      }

      let end = addPeriods(start, periodType, 1);

      while (end <= today) {
        periods.push({ periodType, periodStart: start, periodEnd: end });
        start = end;
        end = addPeriods(start, periodType, 1);
      }
    }

    return periods.sort((first, second) =>
      first.periodEnd.localeCompare(second.periodEnd),
    );
  };

  for (const step of jobs) {
    if (!hasStageField) {
      jobLog.push({ ...step, status: 'skipped' });
      continue;
    }

    if (step.job === 'sync') {
      const timelineRows = stored.filter((row) => row.origin === 'timeline');
      const lowerBound =
        timelineRows.length === 0
          ? trackingStartMs
          : Math.max(...timelineRows.map((row) => row.sourceUpdatedAt)) -
            SYNC_OVERLAP_MINUTES * MINUTE_MS;

      jobLog.push({
        ...step,
        status: 'ok',
        processedCount: readTimeline(step.at, lowerBound),
      });
      continue;
    }

    const processedCount = readTimeline(step.at, trackingStartMs);
    const restoredCount = reconcile(step.at, step.isRerun === true);
    const people = peopleAt(step.at, { includeRerun: step.isRerun === true });
    const date = localDate(step.at);
    let consistency = 'NOT_RUN';

    if (!snapshots.has(date) && people.length > 0) {
      snapshots.set(date, buildSnapshotRows(people));
      consistency = 'OK';
    }

    const missing = listFinishedPeriods(step.at)
      .filter(
        (period) =>
          !builtReports.has(`${period.periodType}:${period.periodStart}`),
      )
      .slice(0, REPORTS_PER_RUN);

    for (const period of missing) {
      builtReports.set(`${period.periodType}:${period.periodStart}`, {
        ...period,
        generatedAt: step.at,
      });
    }

    jobLog.push({
      ...step,
      status: 'ok',
      processedCount,
      restoredCount,
      consistency,
      liveTotal: people.length,
      reportsBuilt: missing.length,
    });
  }

  const validTransitionsAt = (asOf) => {
    const byPerson = new Map();

    for (const row of stored) {
      if (
        row.storedAt <= asOf &&
        row.happenedAt >= trackingStartMs &&
        row.from !== row.to
      ) {
        const fromStage = stageByRaw.get(row.from);
        const toStage = stageByRaw.get(row.to);
        const list = byPerson.get(row.personKey) ?? [];

        list.push({
          ...row,
          fromKey: fromStage?.stageKey ?? null,
          fromRank: fromStage?.rank ?? null,
          toKey: toStage?.stageKey ?? null,
          toRank: toStage?.rank ?? null,
          toKind: toStage?.kind ?? null,
        });
        byPerson.set(row.personKey, list);
      }
    }

    for (const list of byPerson.values()) {
      list.sort(
        (first, second) =>
          first.happenedAt - second.happenedAt ||
          first.sourceUpdatedAt - second.sourceUpdatedAt,
      );
    }

    return byPerson;
  };

  const matchesPersonFilter = (state, filter) => {
    if (filter.trackKey !== null && !tracksOf(state).includes(filter.trackKey)) {
      return false;
    }

    if (filter.programKey !== null && !programsOf(state).includes(filter.programKey)) {
      return false;
    }

    if (filter.sourceKey !== null && sourceCategoryOf(state) !== filter.sourceKey) {
      return false;
    }

    switch (filter.status) {
      case 'ACTIVE':
        return state.isActive;
      case 'SUCCESS':
        return state.isSuccess;
      case 'EXITED':
        return state.kind === 'EXIT';
      case 'UNMAPPED':
        return state.isUnmapped;
      case 'NO_STAGE':
        return state.raw === null;
      default:
        return true;
    }
  };

  const hasPersonFilter = (filter) =>
    filter.trackKey !== null ||
    filter.programKey !== null ||
    filter.sourceKey !== null ||
    filter.status !== 'ALL';

  const hasDateFilter = (filter) =>
    filter.dateFrom !== null || filter.dateTo !== null;

  const buildJourney = (state, transitions) => {
    const first = transitions[0];
    const initialKey = first === undefined ? state.currentKey : first.fromKey;
    const initialRank = first === undefined ? state.currentRank : first.fromRank;
    const arrivals = [];

    if (initialRank !== null) {
      arrivals.push({ rank: initialRank, at: state.createdAt });
    }

    for (const transition of transitions) {
      if (transition.toRank !== null) {
        arrivals.push({ rank: transition.toRank, at: transition.happenedAt });
      }
    }

    const steps = new Map();

    for (const stage of funnelStages) {
      const reached = arrivals.filter((arrival) => arrival.rank >= stage.rank);

      if (reached.length > 0) {
        const later = reached.filter((arrival) => arrival.rank > stage.rank);

        steps.set(stage.stageKey, {
          enteredAt: Math.min(...reached.map((arrival) => arrival.at)),
          nextAt:
            later.length === 0
              ? null
              : Math.min(...later.map((arrival) => arrival.at)),
        });
      }
    }

    return { state, transitions, initialKey, initialRank, arrivals, steps };
  };

  // A stay opens at each row where the stage key changes, so a reminder stays inside it.
  const buildStays = ({ state, transitions, initialKey }) => {
    const kept = [{ at: state.createdAt, key: initialKey, origin: 'created' }];

    for (const transition of transitions) {
      if (transition.toKey !== kept.at(-1).key) {
        kept.push({
          at: transition.happenedAt,
          key: transition.toKey,
          origin: transition.origin,
        });
      }
    }

    const stays = [];

    for (let index = 0; index + 1 < kept.length; index += 1) {
      const start = kept[index];
      const end = kept[index + 1];

      if (start.origin !== 'reconcile' && end.origin !== 'reconcile') {
        stays.push({
          stageKey: start.key,
          days: (end.at - start.at) / DAY_MS,
          endedAt: end.at,
        });
      }
    }

    return stays;
  };

  const classifyStep = (journey, stage, asOf) => {
    const step = journey.steps.get(stage.stageKey);

    if (step === undefined) {
      return null;
    }

    if (stage.windowDays === null) {
      return 'F';
    }

    const windowEnd = step.enteredAt + stage.windowDays * DAY_MS;

    if (windowEnd > asOf) {
      return 'W';
    }

    if (step.nextAt !== null && step.nextAt <= windowEnd) {
      return 'R';
    }

    const hasExited = journey.transitions.some(
      (transition) =>
        transition.toKind === 'EXIT' &&
        transition.happenedAt >= step.enteredAt &&
        transition.happenedAt <= windowEnd,
    );

    return hasExited ? 'E' : 'T';
  };

  const buildCohort = ({ filter, dateFrom, dateTo, asOf }) => {
    const transitions = validTransitionsAt(asOf);

    return peopleAt(asOf)
      .filter(
        (state) =>
          matchesPersonFilter(state, filter) &&
          state.createdAt >= trackingStartMs &&
          isInRange(state.createdAt, dateFrom, dateTo),
      )
      .map((state) => buildJourney(state, transitions.get(state.key) ?? []));
  };

  const countStep = (journeys, stage, asOf) => {
    const outcomes = journeys
      .map((journey) => classifyStep(journey, stage, asOf))
      .filter((outcome) => outcome !== null);
    const count = (letter) =>
      outcomes.filter((outcome) => outcome === letter).length;
    const hasNext = journeys.filter((journey) => {
      const step = journey.steps.get(stage.stageKey);

      return step !== undefined && step.nextAt !== null;
    }).length;

    return {
      entered: outcomes.length,
      eligible: count('R') + count('E') + count('T'),
      reachedNext: count('R'),
      exited: count('E'),
      timedOut: count('T'),
      inWindow: count('W'),
      hasNext,
    };
  };

  const computeOverall = (journeys, asOf) => {
    if (successStage === null) {
      return {
        finalStageKey: null,
        windowDays: config.overallWindowDays,
        eligible: 0,
        reached: 0,
        rate: null,
        soFarRate: null,
        isUnderMinimum: true,
      };
    }

    const windowMs = config.overallWindowDays * DAY_MS;
    const entries = journeys.filter((journey) => journey.arrivals.length > 0);
    const successAt = (journey) => {
      const arrivals = journey.arrivals.filter(
        (arrival) => arrival.rank === successStage.rank,
      );

      return arrivals.length === 0
        ? null
        : Math.min(...arrivals.map((arrival) => arrival.at));
    };
    const enteredAt = (journey) =>
      Math.min(...journey.arrivals.map((arrival) => arrival.at));
    const eligible = entries.filter(
      (journey) => enteredAt(journey) + windowMs <= asOf,
    );
    const reached = eligible.filter((journey) => {
      const at = successAt(journey);

      return at !== null && at <= enteredAt(journey) + windowMs;
    });
    const reachedSoFar = entries.filter((journey) => successAt(journey) !== null);

    return {
      finalStageKey: successStage.stageKey,
      windowDays: config.overallWindowDays,
      entered: entries.length,
      eligible: eligible.length,
      reached: reached.length,
      rate: ratio(reached.length, eligible.length),
      soFarRate: ratio(reachedSoFar.length, entries.length),
      isUnderMinimum: eligible.length < minimumSample,
    };
  };

  const computeFunnel = ({ filter = NO_FILTER, dateFrom = filter.dateFrom, dateTo = filter.dateTo, asOf = nowMs } = {}) => {
    const journeys = buildCohort({ filter, dateFrom, dateTo, asOf });
    const rows = {};
    const staysByStage = new Map();

    for (const journey of journeys) {
      for (const stay of buildStays(journey)) {
        const list = staysByStage.get(stay.stageKey) ?? [];

        list.push(stay.days);
        staysByStage.set(stay.stageKey, list);
      }
    }

    for (const stage of funnelStages) {
      const counts = countStep(journeys, stage, asOf);
      const stays = staysByStage.get(stage.stageKey) ?? [];
      const isFinal = stage.windowDays === null;

      rows[stage.stageKey] = {
        windowDays: stage.windowDays,
        entered: counts.entered,
        eligible: counts.eligible,
        reachedNext: counts.reachedNext,
        timedOut: counts.timedOut,
        exited: counts.exited,
        inWindow: counts.inWindow,
        stepRate: isFinal ? null : ratio(counts.reachedNext, counts.eligible),
        soFarRate: isFinal ? null : ratio(counts.hasNext, counts.entered),
        dropOffRate: isFinal
          ? null
          : ratio(counts.eligible - counts.reachedNext, counts.eligible),
        medianDays: medianDays(stays),
        completedStays: stays.length,
        ...(isFinal ? {} : { isUnderMinimum: counts.eligible < minimumSample }),
      };
    }

    const qualifying = stepStages.filter(
      (stage) => rows[stage.stageKey].eligible >= minimumSample,
    );
    const candidates =
      qualifying.length > 1
        ? qualifying.filter((stage) => stage.rank !== funnelStages[0].rank)
        : qualifying;
    const lowest = candidates.reduce(
      (best, stage) =>
        best === null ||
        rows[stage.stageKey].stepRate < rows[best.stageKey].stepRate
          ? stage
          : best,
      null,
    );

    const cohortExcludedUnmapped = journeys.filter((journey) => {
      if (journey.arrivals.length > 0) {
        return false;
      }

      const seen = [
        journey.state.raw,
        ...journey.transitions.flatMap((transition) => [
          transition.from,
          transition.to,
        ]),
      ].filter((raw) => raw !== null);

      return seen.length > 0 && seen.every((raw) => !stageByRaw.has(raw));
    }).length;

    return {
      cohortSize: journeys.filter((journey) => journey.arrivals.length > 0).length,
      cohortExcludedUnmapped,
      overall: withoutEntered(computeOverall(journeys, asOf)),
      rows,
      lowestStepStageKey: lowest?.stageKey ?? null,
    };
  };

  const listSubmissions = () =>
    hasFormObjects
      ? workspace.submissions.filter(
          (submission) => submission.form === 'application',
        )
      : [];

  const isSubmissionLiveAt = (submission, asOf) =>
    submission.submittedAt <= asOf &&
    (submission.deletedAt === null || submission.deletedAt > asOf);

  // Deleted means out everywhere, so a deleted person's submission never counts. One with
  // no linked person has nobody to delete: it counts until a person filter joins on it.
  const countSubmissions = ({ from, to, filter, asOf, personMatches = null }) => {
    const peopleById = new Map(peopleAt(asOf).map((state) => [state.id, state]));
    const usesPeople = hasPersonFilter(filter) || personMatches !== null;

    return listSubmissions().filter((submission) => {
      if (
        !isSubmissionLiveAt(submission, asOf) ||
        !isInRange(submission.submittedAt, from, to)
      ) {
        return false;
      }

      const state = peopleById.get(submission.personId);

      if (submission.personId !== null && state === undefined) {
        return false;
      }

      if (!usesPeople) {
        return true;
      }

      return (
        state !== undefined &&
        matchesPersonFilter(state, filter) &&
        (personMatches === null || personMatches(state))
      );
    }).length;
  };

  const resolveSubmissionRanges = (filter, asOf) => {
    const today = localDate(asOf);
    const to = filter.dateTo ?? today;
    const from = hasDateFilter(filter)
      ? (filter.dateFrom ?? localDate(trackingStartMs))
      : addLocalDays(today, -6);
    const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

    return {
      current: { from, to },
      previous: { from: addLocalDays(from, -days), to: addLocalDays(from, -1) },
    };
  };

  const clockOf = (state, transitions) => {
    const matching = transitions.filter(
      (transition) =>
        transition.toKey === state.currentKey &&
        transition.fromKey !== state.currentKey,
    );
    const latest = matching.at(-1);

    if (latest !== undefined) {
      return {
        enteredAt: latest.happenedAt,
        isLowerBound: latest.origin === 'reconcile',
      };
    }

    return state.createdAt >= trackingStartMs
      ? { enteredAt: state.createdAt, isLowerBound: false }
      : null;
  };

  const describeClock = (state, transitionsByPerson, asOf) => {
    const transitions = transitionsByPerson.get(state.key) ?? [];
    const isInactive =
      state.createdAt < trackingStartMs &&
      state.isActive &&
      transitions.length === 0;
    const clock = clockOf(state, transitions);
    // Whole days, as the table shows them. Funnel windows keep comparing exact times.
    const days =
      clock === null ? null : Math.floor((asOf - clock.enteredAt) / DAY_MS);
    const isStuck =
      state.isActive &&
      !isInactive &&
      state.limitDays !== null &&
      days !== null &&
      days > state.limitDays;

    return {
      isInactive,
      isStuck,
      days,
      isLowerBound: clock?.isLowerBound ?? false,
      enteredAt: clock?.enteredAt ?? null,
    };
  };

  const currentStateScope = (filter, asOf) =>
    peopleAt(asOf).filter(
      (state) =>
        matchesPersonFilter(state, filter) &&
        (!hasDateFilter(filter) ||
          (state.createdAt >= trackingStartMs &&
            isInRange(state.createdAt, filter.dateFrom, filter.dateTo))),
    );

  const computeStageTotals = (scope, clocks) => {
    const rows = {};
    const stuckOf = (states) =>
      states.filter((state) => clocks.get(state.key).isStuck).length;

    for (const stage of config.stages) {
      const states = scope.filter((state) => state.currentKey === stage.stageKey);

      rows[stage.stageKey] = {
        rowKind: stage.kind,
        count: states.length,
        pastLimitCount: stage.limitDays === null ? null : stuckOf(states),
      };

      if (stage.rawValues.length > 1) {
        for (const { rawValue } of stage.rawValues) {
          rows[`${stage.stageKey}/${rawValue}`] = {
            rowKind: 'NESTED',
            count: states.filter((state) => state.raw === rawValue).length,
          };
        }
      }
    }

    for (const state of scope.filter((candidate) => candidate.isUnmapped)) {
      const rowKey = `${UNMAPPED_KEY}/${state.raw}`;

      rows[rowKey] ??= { rowKind: 'UNMAPPED', count: 0, pastLimitCount: null };
      rows[rowKey].count += 1;
    }

    rows.NO_STAGE = {
      rowKind: 'NO_STAGE',
      count: scope.filter((state) => state.raw === null).length,
      pastLimitCount: null,
    };

    return rows;
  };

  const computeOverview = ({ filter = NO_FILTER, asOf = nowMs } = {}) => {
    const scope = currentStateScope(filter, asOf);
    const transitionsByPerson = validTransitionsAt(asOf);
    const clocks = new Map(
      scope.map((state) => [
        state.key,
        describeClock(state, transitionsByPerson, asOf),
      ]),
    );
    const ranges = resolveSubmissionRanges(filter, asOf);
    const stuckStates = scope.filter((state) => clocks.get(state.key).isStuck);
    const hasLimits = config.stages.some((stage) => stage.limitDays !== null);
    // With no limit anywhere, the list falls back to the longest stays.
    const listedStates = hasLimits
      ? stuckStates
      : scope.filter((state) => {
          const clock = clocks.get(state.key);

          return state.isActive && !clock.isInactive && clock.days !== null;
        });

    return {
      importedExcludedByDate: hasDateFilter(filter)
        ? peopleAt(asOf).filter(
            (state) =>
              matchesPersonFilter(state, filter) &&
              state.createdAt < trackingStartMs,
          ).length
        : 0,
      figures: {
        totalContacts: scope.length,
        activePeople: scope.filter((state) => state.isActive).length,
        newApplications: hasFormObjects
          ? countSubmissions({ ...ranges.current, filter, asOf })
          : null,
        newApplicationsPrevious: hasFormObjects
          ? countSubmissions({ ...ranges.previous, filter, asOf })
          : null,
        newApplicationsFrom: ranges.current.from,
        newApplicationsTo: ranges.current.to,
        importedApplications: withApplication
          ? workspace.applications.filter((row) => !row.isDeleted).length
          : null,
        stuckPeople: stuckStates.length,
        inactivePeople: scope.filter((state) => clocks.get(state.key).isInactive)
          .length,
        signedPeople: config.showSignedFigure
          ? scope.filter((state) => state.isSuccess).length
          : null,
      },
      stageTotals: computeStageTotals(scope, clocks),
      stuck: {
        total: listedStates.length,
        hasLimits,
        rows: Object.fromEntries(
          listedStates.map((state) => {
            const clock = clocks.get(state.key);

            return [
              state.id,
              {
                personKey: state.key,
                displayName: `${state.person.firstName} ${state.person.lastName}`,
                stageKey: state.currentKey,
                stageEnteredAt: new Date(clock.enteredAt).toISOString(),
                daysInStage: clock.days,
                daysOverLimit: hasLimits ? clock.days - state.limitDays : null,
                isLowerBound: clock.isLowerBound,
              },
            ];
          }),
        ),
      },
    };
  };

  // Programs come from unnest(positions), so a person with none has a track row only.
  const categoryKeys = (state, groupBy) =>
    groupBy === 'SOURCE'
      ? [{ key: sourceCategoryOf(state), parentKey: null }]
      : [
          ...tracksOf(state).map((key) => ({ key, parentKey: null })),
          ...state.positions.map((key) => ({
            key,
            parentKey: trackByPosition.get(key) ?? UNMAPPED_KEY,
          })),
        ];

  const computeCategories = ({
    groupBy,
    filter = NO_FILTER,
    peopleFrom = filter.dateFrom,
    peopleTo = filter.dateTo,
    submissionRange,
    cohortFrom = filter.dateFrom,
    cohortTo = filter.dateTo,
    asOf = nowMs,
  }) => {
    const peopleFilter = { ...filter, dateFrom: peopleFrom, dateTo: peopleTo };
    const scope = currentStateScope(peopleFilter, asOf);
    const allMatching = peopleAt(asOf).filter((state) =>
      matchesPersonFilter(state, filter),
    );
    const journeys = buildCohort({ filter, dateFrom: cohortFrom, dateTo: cohortTo, asOf });
    const range = submissionRange ?? resolveSubmissionRanges(filter, asOf).current;
    const rowIds = new Map();

    for (const state of [...allMatching, ...journeys.map((journey) => journey.state)]) {
      for (const { key, parentKey } of categoryKeys(state, groupBy)) {
        rowIds.set(`${parentKey ?? 'TOP'}/${key}`, { key, parentKey });
      }
    }

    const belongs = (state, { key, parentKey }) =>
      categoryKeys(state, groupBy).some(
        (candidate) => candidate.key === key && candidate.parentKey === parentKey,
      );
    const rows = {};

    for (const [rowId, category] of rowIds) {
      const inRow = scope.filter((state) => belongs(state, category));
      const rowJourneys = journeys.filter((journey) =>
        belongs(journey.state, category),
      );
      const overall = computeOverall(rowJourneys, asOf);
      const personMatches = (state) => belongs(state, category);

      rows[rowId] = {
        isUnmapped: isUnmappedCategory(category, groupBy),
        people: inRow.length,
        activePeople: inRow.filter((state) => state.isActive).length,
        newApplications: hasFormObjects
          ? countSubmissions({ ...range, filter, asOf, personMatches })
          : null,
        cohortSize: rowJourneys.filter((journey) => journey.arrivals.length > 0).length,
        overallEligible: overall.eligible,
        overallRate: overall.rate,
        overallSoFarRate: overall.soFarRate,
        stepRates: Object.fromEntries(
          stepStages.map((stage) => {
            const counts = countStep(rowJourneys, stage, asOf);

            return [
              stage.stageKey,
              {
                eligible: counts.eligible,
                rate: ratio(counts.reachedNext, counts.eligible),
                soFarRate: ratio(counts.hasNext, counts.entered),
              },
            ];
          }),
        ),
      };
    }

    const inSeveral =
      groupBy === 'SOURCE'
        ? 0
        : scope.filter((state) => state.positions.length >= 2).length;
    const inSeveralTracks =
      groupBy === 'SOURCE'
        ? 0
        : scope.filter((state) => tracksOf(state).length >= 2).length;

    return {
      groupBy,
      distinctPeople: scope.length,
      peopleInSeveral: inSeveral,
      peopleInSeveralTracks: inSeveralTracks,
      stepStageKeys: stepStages.map((stage) => stage.stageKey),
      rows,
    };
  };

  const computeMovement = ({ from, to, filter = NO_FILTER, asOf = nowMs }) => {
    const scope = peopleAt(asOf).filter((state) =>
      matchesPersonFilter(state, filter),
    );
    const scopeKeys = new Set(scope.map((state) => state.key));
    const moves = [...validTransitionsAt(asOf).values()]
      .flat()
      .filter(
        (transition) =>
          scopeKeys.has(transition.personKey) &&
          isInRange(transition.happenedAt, from, to),
      );

    return Object.fromEntries(
      config.stages.map((stage) => [
        stage.stageKey,
        {
          enteredInPeriod: moves.filter(
            (move) => move.toKey === stage.stageKey && move.fromKey !== stage.stageKey,
          ).length,
          leftInPeriod: moves.filter(
            (move) => move.fromKey === stage.stageKey && move.toKey !== stage.stageKey,
          ).length,
          countNow: scope.filter((state) => state.currentKey === stage.stageKey).length,
        },
      ]),
    );
  };

  const computeCohortRows = ({ period, filter = NO_FILTER, dateFrom = filter.dateFrom, dateTo = filter.dateTo, asOf = nowMs }) => {
    const journeys = buildCohort({ filter, dateFrom, dateTo, asOf }).filter(
      (journey) => journey.arrivals.length > 0,
    );
    const byBucket = new Map();

    for (const journey of journeys) {
      const bucket = periodStart(localDate(journey.state.createdAt), period);
      const list = byBucket.get(bucket) ?? [];

      list.push(journey);
      byBucket.set(bucket, list);
    }

    const rows = {};

    for (const [bucketStart, bucketJourneys] of byBucket) {
      const overall = computeOverall(bucketJourneys, asOf);
      const isOverallMature = overall.eligible === overall.entered;

      rows[bucketStart] = {
        size: bucketJourneys.length,
        overallRate: isOverallMature ? overall.rate : null,
        overallSoFarRate: overall.soFarRate,
        cells: Object.fromEntries(
          stepStages.map((stage) => {
            const counts = countStep(bucketJourneys, stage, asOf);
            const isMature = counts.eligible === counts.entered;

            return [
              stage.stageKey,
              {
                entered: counts.entered,
                eligible: counts.eligible,
                rate: isMature ? ratio(counts.reachedNext, counts.eligible) : null,
                soFarRate: ratio(counts.hasNext, counts.entered),
                ...(counts.entered > 0 ? { isMature } : {}),
              },
            ];
          }),
        ),
      };
    }

    return rows;
  };

  const buildBuckets = ({ dateFrom, dateTo, period, today }) => {
    const lastDate = dateTo !== null && dateTo < today ? dateTo : today;
    const lastBucket = periodStart(lastDate, period);
    const firstBucket =
      dateFrom !== null
        ? periodStart(dateFrom, period)
        : addPeriods(lastBucket, period, 1 - DEFAULT_TREND_BUCKETS[period]);
    const starts = [];

    for (
      let bucket = lastBucket;
      bucket >= firstBucket && starts.length < MAXIMUM_TREND_BUCKETS;
      bucket = addPeriods(bucket, period, -1)
    ) {
      starts.unshift(bucket);
    }

    return starts.map((start) => ({
      bucketStart: start,
      previousBucketStart: addPeriods(start, period, -starts.length),
      isPartial: start === periodStart(today, period),
    }));
  };

  const snapshotDimensions = (filter) => [
    ...(filter.trackKey !== null ? [{ dimension: 'track', key: filter.trackKey }] : []),
    ...(filter.programKey !== null ? [{ dimension: 'position', key: filter.programKey }] : []),
    ...(filter.sourceKey !== null ? [{ dimension: 'source', key: filter.sourceKey }] : []),
  ];

  const snapshotValue = ({ bucketStart, period, metric, stageKey, filter }) => {
    const bucketEnd = addPeriods(bucketStart, period, 1);
    const dates = [...snapshots.keys()]
      .filter((date) => date >= bucketStart && date < bucketEnd)
      .sort();
    const lastDate = dates.at(-1);

    if (lastDate === undefined) {
      return null;
    }

    const dimension = snapshotDimensions(filter)[0] ?? { dimension: 'all', key: '' };
    let total = 0;

    for (const [rowKey, count] of snapshots.get(lastDate)) {
      const [rowDimension, key, raw] = rowKey.split('|');

      if (rowDimension !== dimension.dimension || key !== dimension.key) {
        continue;
      }

      const stage = stageByRaw.get(raw);
      const kind = stage?.kind ?? null;
      const isActive = (kind === 'MAIN' || kind === 'OTHER') && stage?.isSuccess !== true;

      if (metric === 'ACTIVE_PEOPLE' && !isActive) {
        continue;
      }

      if (metric === 'STAGE_COUNT' && stage?.stageKey !== stageKey) {
        continue;
      }

      const matchesStatus = {
        ALL: true,
        ACTIVE: isActive,
        SUCCESS: stage?.isSuccess === true,
        EXITED: kind === 'EXIT',
        UNMAPPED: raw !== '' && stage === undefined,
        NO_STAGE: raw === '',
      }[filter.status];

      if (matchesStatus) {
        total += count;
      }
    }

    return total;
  };

  const rateValue = ({ bucketStart, period, metric, stageKey, filter, asOf }) => {
    const journeys = buildCohort({
      filter,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      asOf,
    }).filter(
      (journey) =>
        journey.arrivals.length > 0 &&
        periodStart(localDate(journey.state.createdAt), period) === bucketStart,
    );

    if (metric === 'OVERALL_CONVERSION') {
      const overall = computeOverall(journeys, asOf);

      return overall.entered > 0 && overall.eligible === overall.entered
        ? overall.rate
        : null;
    }

    const stage = funnelStages.find((candidate) => candidate.stageKey === stageKey);
    const counts = countStep(journeys, stage, asOf);

    return counts.entered > 0 && counts.eligible === counts.entered
      ? ratio(counts.eligible - counts.reachedNext, counts.eligible)
      : null;
  };

  const medianValue = ({ bucketStart, period, stageKey, filter, asOf }) => {
    const bucketEnd = addPeriods(bucketStart, period, 1);
    const stays = buildCohort({
      filter,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      asOf,
    })
      .flatMap((journey) => buildStays(journey))
      .filter((stay) => {
        const endDate = localDate(stay.endedAt);

        return (
          (stageKey === null || stay.stageKey === stageKey) &&
          endDate >= bucketStart &&
          endDate < bucketEnd
        );
      })
      .map((stay) => stay.days);

    return medianDays(stays);
  };

  const computeTrends = ({ metric, stageKey = null, filter = NO_FILTER, asOf = nowMs }) => {
    const { period } = filter;
    const today = localDate(asOf);
    const isSnapshotMetric = ['TOTAL_CONTACTS', 'ACTIVE_PEOPLE', 'STAGE_COUNT'].includes(metric);
    let unavailableReason = null;

    if (['OVERALL_CONVERSION', 'DROP_OFF'].includes(metric) && period === 'DAY') {
      unavailableReason = 'DAILY_RATE';
    } else if (isSnapshotMetric && snapshotDimensions(filter).length > 1) {
      unavailableReason = 'SNAPSHOT_FILTER_COMBINATION';
    } else if (metric === 'NEW_APPLICATIONS' && !hasFormObjects) {
      unavailableReason = 'NO_SUBMISSION_OBJECT';
    }

    const buckets = buildBuckets({
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      period,
      today,
    });

    const valueOf = (bucketStart) => {
      switch (metric) {
        case 'NEW_APPLICATIONS': {
          const lastDay = addLocalDays(addPeriods(bucketStart, period, 1), -1);

          // A bucket over before tracking began is unknown, not a known zero.
          return lastDay < localDate(trackingStartMs)
            ? null
            : countSubmissions({ from: bucketStart, to: lastDay, filter, asOf });
        }
        case 'OVERALL_CONVERSION':
        case 'DROP_OFF':
          return rateValue({ bucketStart, period, metric, stageKey, filter, asOf });
        case 'MEDIAN_DAYS':
          return medianValue({ bucketStart, period, stageKey, filter, asOf });
        default:
          return snapshotValue({ bucketStart, period, metric, stageKey, filter });
      }
    };

    const series =
      unavailableReason !== null
        ? {}
        : Object.fromEntries(
            buckets.map(({ bucketStart, previousBucketStart, isPartial }) => [
              bucketStart,
              {
                value: valueOf(bucketStart),
                previousValue: valueOf(previousBucketStart),
                isPartial,
              },
            ]),
          );

    // The cohort table covers the same window as the trend line.
    const cohortsInWindow = () => {
      const rows = computeCohortRows({ period, filter, asOf });

      return Object.fromEntries(
        buckets
          .filter(({ bucketStart }) => rows[bucketStart] !== undefined)
          .map(({ bucketStart }) => [bucketStart, rows[bucketStart]]),
      );
    };

    const movementFrom = filter.dateFrom ?? periodStart(today, period);
    const movementTo =
      filter.dateTo ?? addLocalDays(addPeriods(periodStart(today, period), period, 1), -1);

    return {
      metric,
      unavailableReason,
      series,
      movement: {
        from: movementFrom,
        rows: computeMovement({ from: movementFrom, to: movementTo, filter, asOf }),
      },
      ...(period === 'DAY' ? {} : { cohorts: cohortsInWindow() }),
    };
  };

  const computeReport = ({ periodType, periodStart: start }) => {
    const built = builtReports.get(`${periodType}:${start}`);
    const asOf = built.generatedAt;
    const lastDay = addLocalDays(built.periodEnd, -1);
    const previousStart = addPeriods(start, periodType, -1);
    const previousLastDay = addLocalDays(start, -1);
    const movement = computeMovement({ from: start, to: lastDay, asOf });
    const previousMovement = computeMovement({
      from: previousStart,
      to: previousLastDay,
      asOf,
    });
    const newApplications = hasFormObjects
      ? countSubmissions({ from: start, to: lastDay, filter: NO_FILTER, asOf })
      : null;
    const newApplicationsPrevious = hasFormObjects
      ? countSubmissions({
          from: previousStart,
          to: previousLastDay,
          filter: NO_FILTER,
          asOf,
        })
      : null;
    const transitionsByPerson = validTransitionsAt(asOf);
    const stuckByStage = {};

    for (const state of peopleAt(asOf)) {
      if (describeClock(state, transitionsByPerson, asOf).isStuck) {
        stuckByStage[state.currentKey] = (stuckByStage[state.currentKey] ?? 0) + 1;
      }
    }

    const isSignificant = (current, previous) =>
      current !== null &&
      previous !== null &&
      current >= minimumSample &&
      previous >= minimumSample &&
      Math.abs(current - previous) / previous >= config.significantChangeRatio;

    return {
      generatedAt: built.generatedAt,
      periodEnd: built.periodEnd,
      newApplications,
      newApplicationsPrevious,
      movement,
      stuckByStage,
      funnel: computeFunnel({ filter: NO_FILTER, dateFrom: null, dateTo: lastDay, asOf }),
      categories: computeCategories({
        groupBy: 'TRACK_PROGRAM',
        filter: NO_FILTER,
        peopleFrom: null,
        peopleTo: null,
        submissionRange: { from: start, to: lastDay },
        cohortFrom: null,
        cohortTo: lastDay,
        asOf,
      }),
      comparisons: {
        NEW_APPLICATIONS: {
          current: newApplications,
          previous: newApplicationsPrevious,
          isSignificant: isSignificant(newApplications, newApplicationsPrevious),
        },
        ...Object.fromEntries(
          Object.entries(movement).map(([stageKey, row]) => [
            `ENTERED_${stageKey}`,
            {
              current: row.enteredInPeriod,
              previous: previousMovement[stageKey].enteredInPeriod,
              isSignificant: isSignificant(
                row.enteredInPeriod,
                previousMovement[stageKey].enteredInPeriod,
              ),
            },
          ]),
        ),
      },
      cohorts:
        periodType === 'MONTH'
          ? computeCohortRows({
              period: 'MONTH',
              filter: NO_FILTER,
              dateFrom: null,
              dateTo: lastDay,
              asOf,
            })
          : {},
    };
  };

  const personSteps = (asOf) => {
    const transitions = validTransitionsAt(asOf);

    return Object.fromEntries(
      peopleAt(asOf)
        .filter((state) => state.createdAt >= trackingStartMs)
        .map((state) => {
          const journey = buildJourney(state, transitions.get(state.key) ?? []);
          const letters = funnelStages
            .map((stage) => classifyStep(journey, stage, asOf))
            .filter((letter) => letter !== null)
            .join('');

          return [state.key, letters];
        }),
    );
  };

  return {
    localDate,
    storedTransitions: () => stored.map((row) => ({ ...row })),
    snapshotRows: () =>
      Object.fromEntries(
        [...snapshots].map(([date, counts]) => [date, Object.fromEntries(counts)]),
      ),
    builtReports: () => [...builtReports.values()],
    jobLog: () => jobLog.map((row) => ({ ...row })),
    computeOverview,
    computeFunnel,
    computeCategories,
    computeTrends,
    computeMovement,
    computeReport,
    personSteps,
  };
};
