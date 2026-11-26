import { Test } from '@nestjs/testing';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { CalendlyBookingService } from 'src/modules/meeting-tracker/services/calendly-booking.service';
import { type RecordedCalendlyBooking } from 'src/modules/meeting-tracker/types/calendly-booking.type';

const getMany = jest.fn();

jest.mock(
  'src/modules/match-participant/utils/add-person-email-filters-to-query-builder',
  () => ({
    addPersonEmailFiltersToQueryBuilder: () => ({
      orderBy: () => ({ getMany }),
    }),
  }),
);

const booking: RecordedCalendlyBooking = {
  calendlyInviteeUri:
    'https://api.calendly.com/scheduled_events/EVENT/invitees/INVITEE',
  inviteeEmail: 'ada@example.com',
  inviteeName: 'Ada Lovelace',
  eventName: 'Interview',
  meetingStartsAt: new Date('2026-11-30T15:00:00Z'),
  bookedAt: new Date('2026-11-26T10:00:00Z'),
  status: 'ACTIVE',
  hostEmail: 'hr.team@example.com',
};

describe('CalendlyBookingService', () => {
  const bookingRepository = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((name: string) =>
      name === 'calendlyBooking'
        ? bookingRepository
        : { createQueryBuilder: jest.fn() },
    ),
  };

  let service: CalendlyBookingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    getMany.mockResolvedValue([{ id: 'ada', deletedAt: null }]);

    const module = await Test.createTestingModule({
      providers: [
        CalendlyBookingService,
        { provide: WorkspaceOrmManager, useValue: workspaceOrmManager },
      ],
    }).compile();

    service = module.get(CalendlyBookingService);
  });

  it('saves a new booking for the person with that email, as Calendly', async () => {
    bookingRepository.findOne.mockResolvedValue(null);

    const result = await service.recordBooking('workspace-id', booking);

    expect(result).toEqual({ isNew: true, personId: 'ada' });
    expect(bookingRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Interview · Ada Lovelace',
        personId: 'ada',
        bookingStatus: 'ACTIVE',
        meetingStartsAt: '2026-11-30T15:00:00.000Z',
        createdBy: expect.objectContaining({ name: 'Calendly' }),
        updatedBy: expect.objectContaining({ name: 'Calendly' }),
      }),
    );
  });

  it('keeps a person linked by hand when the booking changes', async () => {
    bookingRepository.findOne.mockResolvedValue({
      id: 'existing',
      personId: 'linked-by-hand',
      deletedAt: null,
    });

    await service.recordBooking('workspace-id', {
      ...booking,
      status: 'CANCELED',
    });

    expect(getMany).not.toHaveBeenCalled();
    expect(bookingRepository.update).toHaveBeenCalledWith(
      'existing',
      expect.objectContaining({
        personId: 'linked-by-hand',
        bookingStatus: 'CANCELED',
      }),
    );
  });

  it('does not bring back a booking someone deleted', async () => {
    bookingRepository.findOne.mockResolvedValue({
      id: 'existing',
      personId: 'ada',
      deletedAt: '2026-11-27T00:00:00Z',
    });

    await service.recordBooking('workspace-id', booking);

    expect(bookingRepository.update).not.toHaveBeenCalled();
    expect(bookingRepository.insert).not.toHaveBeenCalled();
  });
});
