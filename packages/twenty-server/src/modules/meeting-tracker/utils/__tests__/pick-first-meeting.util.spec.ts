import { pickFirstMeeting } from 'src/modules/meeting-tracker/utils/pick-first-meeting.util';

const meeting = (
  startsAt: string | null,
  overrides: Partial<{ bookedAt: string | null; isCanceled: boolean }> = {},
) => ({
  startsAt,
  bookedAt: overrides.bookedAt ?? null,
  isCanceled: overrides.isCanceled ?? false,
});

describe('pickFirstMeeting', () => {
  it('counts whole days from the application to the first meeting', () => {
    expect(
      pickFirstMeeting({
        applicationDate: '2026-11-02T22:30:00Z',
        meetings: [
          meeting('2026-11-12T15:00:00Z', { bookedAt: '2026-11-05T09:00:00Z' }),
          meeting('2026-11-10T09:00:00Z', { bookedAt: '2026-11-04T09:00:00Z' }),
        ],
      }),
    ).toEqual({
      meetingAt: new Date('2026-11-10T09:00:00Z'),
      bookedAt: new Date('2026-11-04T09:00:00Z'),
      daysToMeeting: 8,
    });
  });

  it('ignores cancelled meetings and meetings from an earlier application', () => {
    expect(
      pickFirstMeeting({
        applicationDate: '2026-11-02T10:00:00Z',
        meetings: [
          meeting('2026-10-20T09:00:00Z'),
          meeting('2026-11-05T09:00:00Z', { isCanceled: true }),
          meeting('2026-11-09T09:00:00Z'),
        ],
      })?.meetingAt,
    ).toEqual(new Date('2026-11-09T09:00:00Z'));
  });

  it('counts a meeting on the application day as day 0', () => {
    expect(
      pickFirstMeeting({
        applicationDate: '2026-11-02T08:00:00Z',
        meetings: [meeting('2026-11-02T07:00:00Z')],
      })?.daysToMeeting,
    ).toBe(0);
  });

  it('gives nothing without an application date or a usable meeting', () => {
    expect(
      pickFirstMeeting({
        applicationDate: null,
        meetings: [meeting('2026-11-09T09:00:00Z')],
      }),
    ).toBeNull();
    expect(
      pickFirstMeeting({
        applicationDate: '2026-11-02T10:00:00Z',
        meetings: [
          meeting(null),
          meeting('2026-11-04T09:00:00Z', { isCanceled: true }),
        ],
      }),
    ).toBeNull();
  });
});
