import { isNonEmptyString } from '@sniptt/guards';

import {
  type CalendlyInvitee,
  type CalendlyScheduledEvent,
} from 'src/modules/meeting-tracker/types/calendly-api.type';
import { type RecordedCalendlyBooking } from 'src/modules/meeting-tracker/types/calendly-booking.type';

const toDate = (value: string | null | undefined): Date | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const toTrimmedOrNull = (value: string | null | undefined) =>
  isNonEmptyString(value?.trim()) ? value.trim() : null;

// A rescheduled booking cancels the old invitee and creates a new one, so
// either status being canceled means this meeting will not happen.
export const toRecordedCalendlyBooking = (
  invitee: CalendlyInvitee,
  event: CalendlyScheduledEvent,
): RecordedCalendlyBooking | null => {
  const meetingStartsAt = toDate(event.start_time);

  if (meetingStartsAt === null) {
    return null;
  }

  const isCanceled =
    invitee.status === 'canceled' || event.status === 'canceled';

  return {
    calendlyInviteeUri: invitee.uri,
    inviteeEmail: toTrimmedOrNull(invitee.email)?.toLowerCase() ?? null,
    inviteeName: toTrimmedOrNull(invitee.name),
    eventName: toTrimmedOrNull(event.name),
    meetingStartsAt,
    bookedAt: toDate(invitee.created_at),
    status: isCanceled ? 'CANCELED' : 'ACTIVE',
    hostEmail: toTrimmedOrNull(event.event_memberships?.[0]?.user_email),
  };
};
