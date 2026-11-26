import { isDefined } from 'twenty-shared/utils';

type RecordEvent<TRecord> = {
  recordId: string;
  properties: {
    before?: TRecord;
    after?: TRecord;
    updatedFields?: string[];
  };
};

const unique = (ids: (string | null | undefined)[]) =>
  [...new Set(ids)].filter((id): id is string => isDefined(id));

// A guest moved from one person to another changes both people's meetings.
export const getPersonIdsFromParticipantEvents = (
  events: RecordEvent<{ personId?: string | null }>[],
) =>
  unique(
    events.flatMap(({ properties }) => [
      properties.before?.personId,
      properties.after?.personId,
    ]),
  );

const EVENT_FIELDS_AFFECTING_MEETINGS = [
  'startsAt',
  'isCanceled',
  'externalCreatedAt',
];

export const getCalendarEventIdsWithChangedTiming = (
  events: RecordEvent<object>[],
) =>
  unique(
    events
      .filter(
        ({ properties }) =>
          !isDefined(properties.updatedFields) ||
          properties.updatedFields.some((field) =>
            EVENT_FIELDS_AFFECTING_MEETINGS.includes(field),
          ),
      )
      .map(({ recordId }) => recordId),
  );

export const getPersonIdsWithChangedApplicationDate = (
  events: RecordEvent<object>[],
) =>
  unique(
    events
      .filter(({ properties }) =>
        (properties.updatedFields ?? []).includes('applicationDate'),
      )
      .map(({ recordId }) => recordId),
  );
