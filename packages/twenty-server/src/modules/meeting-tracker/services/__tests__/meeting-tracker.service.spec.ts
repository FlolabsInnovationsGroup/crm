import { Test } from '@nestjs/testing';

import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';

const applicant = (overrides: Record<string, unknown> = {}) => ({
  id: 'applicant',
  applicationDate: '2026-11-02T10:00:00Z',
  firstMeetingAt: null,
  meetingBookedAt: null,
  daysToMeeting: null,
  firstMeetingEventId: null,
  ...overrides,
});

const calendarEvent = (
  id: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  startsAt: '2026-11-09T14:00:00Z',
  externalCreatedAt: '2026-11-04T08:00:00Z',
  createdAt: '2026-11-04T08:05:00Z',
  isCanceled: false,
  isFullDay: false,
  ...overrides,
});

describe('MeetingTrackerService', () => {
  const personRepository = { find: jest.fn(), update: jest.fn() };
  const participantRepository = { find: jest.fn() };
  const eventRepository = { find: jest.fn() };
  const bookingRepository = { find: jest.fn() };
  const repositories: Record<string, unknown> = {
    person: personRepository,
    calendarEventParticipant: participantRepository,
    calendarEvent: eventRepository,
    calendlyBooking: bookingRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  };

  let service: MeetingTrackerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    workspaceOrmManager.getRepository.mockImplementation(
      (name: string) => repositories[name],
    );
    bookingRepository.find.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        MeetingTrackerService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(MeetingTrackerService);
  });

  it('writes the first meeting the applicant was invited to', async () => {
    personRepository.find.mockResolvedValue([applicant()]);
    participantRepository.find.mockResolvedValue([
      {
        personId: 'applicant',
        calendarEventId: 'interview',
        responseStatus: 'ACCEPTED',
      },
    ]);
    eventRepository.find.mockResolvedValue([calendarEvent('interview')]);

    const result = await service.recalculatePeople('workspace-id', [
      'applicant',
    ]);

    expect(result).toEqual({ peopleChecked: 1, peopleWithMeeting: 1 });
    expect(personRepository.update).toHaveBeenCalledWith('applicant', {
      firstMeetingAt: '2026-11-09T14:00:00.000Z',
      meetingBookedAt: '2026-11-04T08:00:00.000Z',
      daysToMeeting: 7,
      firstMeetingEventId: 'interview',
    });
  });

  it('does not count invitations the applicant declined', async () => {
    personRepository.find.mockResolvedValue([applicant()]);
    participantRepository.find.mockResolvedValue([
      {
        personId: 'applicant',
        calendarEventId: 'declined',
        responseStatus: 'DECLINED',
      },
      {
        personId: 'applicant',
        calendarEventId: 'later',
        responseStatus: 'NEEDS_ACTION',
      },
    ]);
    eventRepository.find.mockResolvedValue([
      calendarEvent('later', {
        startsAt: '2026-11-12T14:00:00Z',
        externalCreatedAt: '',
      }),
    ]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(personRepository.update).toHaveBeenCalledWith(
      'applicant',
      expect.objectContaining({
        firstMeetingEventId: 'later',
        daysToMeeting: 10,
        // An empty external date falls back to when the CRM saw the event.
        meetingBookedAt: '2026-11-04T08:05:00.000Z',
      }),
    );
  });

  it('clears the meeting once its event is gone and leaves unchanged people alone', async () => {
    personRepository.find.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        'firstMeetingEventId' in where
          ? [{ id: 'applicant' }]
          : [
              applicant({
                firstMeetingAt: '2026-11-09T14:00:00Z',
                meetingBookedAt: '2026-11-04T08:00:00Z',
                daysToMeeting: 7,
                firstMeetingEventId: 'cancelled-interview',
              }),
            ],
    );
    participantRepository.find.mockResolvedValue([]);

    await service.recalculatePeopleWhoseMeetingWasRemoved('workspace-id', [
      'cancelled-interview',
    ]);

    expect(personRepository.update).toHaveBeenCalledWith('applicant', {
      firstMeetingAt: null,
      meetingBookedAt: null,
      daysToMeeting: null,
      firstMeetingEventId: null,
    });

    personRepository.update.mockClear();
    // Empty text fields come back from the ORM as ''.
    personRepository.find.mockResolvedValue([
      applicant({ firstMeetingEventId: '' }),
    ]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(personRepository.update).not.toHaveBeenCalled();
  });

  it('only looks at guests who are not team members', async () => {
    personRepository.find.mockResolvedValue([applicant()]);
    participantRepository.find.mockResolvedValue([]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(participantRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isOrganizer: false,
          workspaceMemberId: expect.anything(),
        }),
      }),
    );
  });

  it('counts a Calendly booking and skips cancelled ones', async () => {
    personRepository.find.mockResolvedValue([applicant()]);
    participantRepository.find.mockResolvedValue([]);
    bookingRepository.find.mockResolvedValue([
      {
        id: 'cancelled-booking',
        personId: 'applicant',
        meetingStartsAt: '2026-11-05T09:00:00Z',
        bookedAt: '2026-11-03T12:00:00Z',
        bookingStatus: 'CANCELED',
      },
      {
        id: 'booking',
        personId: 'applicant',
        meetingStartsAt: '2026-11-06T09:00:00Z',
        bookedAt: '2026-11-03T12:30:00Z',
        bookingStatus: 'ACTIVE',
      },
    ]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(personRepository.update).toHaveBeenCalledWith('applicant', {
      firstMeetingAt: '2026-11-06T09:00:00.000Z',
      meetingBookedAt: '2026-11-03T12:30:00.000Z',
      daysToMeeting: 4,
      firstMeetingEventId: 'booking',
    });
  });

  it('keeps counting calendar meetings before the bookings object exists', async () => {
    workspaceOrmManager.getRepository.mockImplementation((name: string) => {
      if (name === 'calendlyBooking') {
        throw new TwentyOrmException(
          'Object calendlyBooking not found',
          TwentyOrmExceptionCode.UNKNOWN_OBJECT,
        );
      }

      return repositories[name];
    });
    personRepository.find.mockResolvedValue([applicant()]);
    participantRepository.find.mockResolvedValue([
      {
        personId: 'applicant',
        calendarEventId: 'interview',
        responseStatus: 'ACCEPTED',
      },
    ]);
    eventRepository.find.mockResolvedValue([calendarEvent('interview')]);

    const result = await service.recalculatePeople('workspace-id', [
      'applicant',
    ]);

    expect(result).toEqual({ peopleChecked: 1, peopleWithMeeting: 1 });
  });

  it('reads dates the database returns as Date objects', async () => {
    personRepository.find.mockResolvedValue([
      applicant({
        applicationDate: new Date('2026-11-02T10:00:00Z'),
        firstMeetingEventId: '',
      }),
    ]);
    participantRepository.find.mockResolvedValue([
      {
        personId: 'applicant',
        calendarEventId: 'interview',
        responseStatus: 'ACCEPTED',
      },
    ]);
    eventRepository.find.mockResolvedValue([
      calendarEvent('interview', {
        startsAt: new Date('2026-11-09T14:00:00Z'),
        externalCreatedAt: new Date('2026-11-04T08:00:00Z'),
        createdAt: new Date('2026-11-04T08:05:00Z'),
      }),
    ]);
    bookingRepository.find.mockResolvedValue([
      {
        id: 'booking',
        personId: 'applicant',
        meetingStartsAt: new Date('2026-11-12T09:00:00Z'),
        bookedAt: new Date('2026-11-05T12:00:00Z'),
        bookingStatus: 'ACTIVE',
      },
    ]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(personRepository.update).toHaveBeenCalledWith('applicant', {
      firstMeetingAt: '2026-11-09T14:00:00.000Z',
      meetingBookedAt: '2026-11-04T08:00:00.000Z',
      daysToMeeting: 7,
      firstMeetingEventId: 'interview',
    });
  });

  it('leaves a person alone when the stored Date values already match', async () => {
    personRepository.find.mockResolvedValue([
      applicant({
        applicationDate: new Date('2026-11-02T10:00:00Z'),
        firstMeetingAt: new Date('2026-11-12T09:00:00Z'),
        meetingBookedAt: new Date('2026-11-05T12:00:00Z'),
        daysToMeeting: 10,
        firstMeetingEventId: 'booking',
      }),
    ]);
    participantRepository.find.mockResolvedValue([]);
    bookingRepository.find.mockResolvedValue([
      {
        id: 'booking',
        personId: 'applicant',
        meetingStartsAt: new Date('2026-11-12T09:00:00Z'),
        bookedAt: new Date('2026-11-05T12:00:00Z'),
        bookingStatus: 'ACTIVE',
      },
    ]);

    await service.recalculatePeople('workspace-id', ['applicant']);

    expect(personRepository.update).not.toHaveBeenCalled();
  });
});
