import { toRecordedCalendlyBooking } from 'src/modules/meeting-tracker/utils/to-recorded-calendly-booking.util';

const event = {
  uri: 'https://api.calendly.com/scheduled_events/EVENT',
  name: 'Interview',
  status: 'active',
  start_time: '2026-11-30T15:00:00.000000Z',
  event_memberships: [{ user_email: 'hr.team@example.com' }],
};

const invitee = {
  uri: 'https://api.calendly.com/scheduled_events/EVENT/invitees/INVITEE',
  email: ' Ada@Example.com ',
  name: 'Ada Lovelace',
  status: 'active',
  created_at: '2026-11-26T10:00:00.000000Z',
  event: event.uri,
};

describe('toRecordedCalendlyBooking', () => {
  it('reads the meeting, booking time and normalised email', () => {
    expect(toRecordedCalendlyBooking(invitee, event)).toEqual({
      calendlyInviteeUri: invitee.uri,
      inviteeEmail: 'ada@example.com',
      inviteeName: 'Ada Lovelace',
      eventName: 'Interview',
      meetingStartsAt: new Date('2026-11-30T15:00:00Z'),
      bookedAt: new Date('2026-11-26T10:00:00Z'),
      status: 'ACTIVE',
      hostEmail: 'hr.team@example.com',
    });
  });

  it('marks the booking cancelled when the invitee or the event is', () => {
    expect(
      toRecordedCalendlyBooking({ ...invitee, status: 'canceled' }, event)
        ?.status,
    ).toBe('CANCELED');
    expect(
      toRecordedCalendlyBooking(invitee, { ...event, status: 'canceled' })
        ?.status,
    ).toBe('CANCELED');
  });

  it('skips an event without a start time', () => {
    expect(
      toRecordedCalendlyBooking(invitee, { ...event, start_time: null }),
    ).toBeNull();
  });
});
