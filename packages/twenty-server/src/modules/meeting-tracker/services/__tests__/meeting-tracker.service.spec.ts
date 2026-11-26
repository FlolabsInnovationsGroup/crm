import { Test } from '@nestjs/testing';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';

describe('MeetingTrackerService', () => {
  const personRepository = { find: jest.fn(), update: jest.fn() };
  const participantRepository = { find: jest.fn() };
  const eventRepository = { find: jest.fn() };
  const repositories: Record<string, unknown> = {
    person: personRepository,
    calendarEventParticipant: participantRepository,
    calendarEvent: eventRepository,
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) => repositories[name]),
  };

  let service: MeetingTrackerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        MeetingTrackerService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(MeetingTrackerService);
  });

  it('writes the first meeting found in the synced calendars', async () => {
    personRepository.find.mockResolvedValue([
      {
        id: 'applicant',
        applicationDate: '2026-11-02T10:00:00Z',
        firstMeetingAt: null,
        meetingBookedAt: null,
        daysToMeeting: null,
      },
    ]);
    participantRepository.find.mockResolvedValue([
      { personId: 'applicant', calendarEventId: 'interview' },
    ]);
    eventRepository.find.mockResolvedValue([
      {
        id: 'interview',
        startsAt: '2026-11-09T14:00:00Z',
        externalCreatedAt: '2026-11-04T08:00:00Z',
        createdAt: '2026-11-04T08:05:00Z',
        isCanceled: false,
      },
    ]);

    const result = await service.recalculatePeople('workspace-id', [
      'applicant',
    ]);

    expect(result).toEqual({ peopleChecked: 1, peopleWithMeeting: 1 });
    expect(personRepository.update).toHaveBeenCalledWith('applicant', {
      firstMeetingAt: '2026-11-09T14:00:00.000Z',
      meetingBookedAt: '2026-11-04T08:00:00.000Z',
      daysToMeeting: 7,
    });
  });

  it('clears the meeting when it is cancelled and leaves unchanged people alone', async () => {
    personRepository.find.mockResolvedValue([
      {
        id: 'cancelled',
        applicationDate: '2026-11-02T10:00:00Z',
        firstMeetingAt: '2026-11-09T14:00:00Z',
        meetingBookedAt: '2026-11-04T08:00:00Z',
        daysToMeeting: 7,
      },
      {
        id: 'never-booked',
        applicationDate: '2026-11-02T10:00:00Z',
        firstMeetingAt: null,
        meetingBookedAt: null,
        daysToMeeting: null,
      },
    ]);
    participantRepository.find.mockResolvedValue([
      { personId: 'cancelled', calendarEventId: 'interview' },
    ]);
    eventRepository.find.mockResolvedValue([
      {
        id: 'interview',
        startsAt: '2026-11-09T14:00:00Z',
        externalCreatedAt: null,
        createdAt: '2026-11-04T08:05:00Z',
        isCanceled: true,
      },
    ]);

    await service.recalculatePeople('workspace-id', [
      'cancelled',
      'never-booked',
    ]);

    expect(personRepository.update).toHaveBeenCalledTimes(1);
    expect(personRepository.update).toHaveBeenCalledWith('cancelled', {
      firstMeetingAt: null,
      meetingBookedAt: null,
      daysToMeeting: null,
    });
  });
});
