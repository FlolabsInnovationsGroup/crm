import {
  getCalendarEventIdsWithChangedTiming,
  getPersonIdsFromParticipantEvents,
  getPersonIdsWithChangedApplicationDate,
} from 'src/modules/meeting-tracker/utils/get-person-ids-from-meeting-events.util';

describe('meeting event helpers', () => {
  it('recalculates both people when a guest is linked to someone else', () => {
    expect(
      getPersonIdsFromParticipantEvents([
        {
          recordId: 'participant',
          properties: {
            before: { personId: 'old-person' },
            after: { personId: 'new-person' },
          },
        },
        { recordId: 'unmatched', properties: { after: { personId: null } } },
      ]),
    ).toEqual(['old-person', 'new-person']);
  });

  it('only follows calendar events whose time or cancellation changed', () => {
    expect(
      getCalendarEventIdsWithChangedTiming([
        { recordId: 'moved', properties: { updatedFields: ['startsAt'] } },
        { recordId: 'renamed', properties: { updatedFields: ['title'] } },
        {
          recordId: 'cancelled',
          properties: { updatedFields: ['isCanceled'] },
        },
      ]),
    ).toEqual(['moved', 'cancelled']);
  });

  it('only follows people whose application date changed', () => {
    expect(
      getPersonIdsWithChangedApplicationDate([
        {
          recordId: 'applied-again',
          properties: { updatedFields: ['applicationDate'] },
        },
        {
          recordId: 'meeting-written',
          properties: { updatedFields: ['daysToMeeting'] },
        },
      ]),
    ).toEqual(['applied-again']);
  });
});
