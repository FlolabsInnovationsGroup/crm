import { type StoredDate } from 'src/modules/meeting-tracker/types/meeting-tracker-record.type';

export type CalendlyBookingStatus = 'ACTIVE' | 'CANCELED';

// One invitee on one Calendly event, as read back from the Calendly API.
export type RecordedCalendlyBooking = {
  calendlyInviteeUri: string;
  inviteeEmail: string | null;
  inviteeName: string | null;
  eventName: string | null;
  meetingStartsAt: Date;
  bookedAt: Date | null;
  status: CalendlyBookingStatus;
  hostEmail: string | null;
};

export type CalendlyBookingRecord = {
  id: string;
  personId: string | null;
  calendlyInviteeUri: string;
  meetingStartsAt: StoredDate;
  bookedAt: StoredDate;
  bookingStatus: CalendlyBookingStatus | null;
  deletedAt?: StoredDate;
};

export type RecordCalendlyBookingResult = {
  isNew: boolean;
  personId: string | null;
};
