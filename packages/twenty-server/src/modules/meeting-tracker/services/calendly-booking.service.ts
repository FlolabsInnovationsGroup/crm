import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type ActorMetadata, FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { addPersonEmailFiltersToQueryBuilder } from 'src/modules/match-participant/utils/add-person-email-filters-to-query-builder';
import {
  type CalendlyBookingRecord,
  type RecordCalendlyBookingResult,
  type RecordedCalendlyBooking,
} from 'src/modules/meeting-tracker/types/calendly-booking.type';

const CALENDLY_ACTOR: ActorMetadata = {
  source: FieldActorSource.SYSTEM,
  workspaceMemberId: null,
  name: 'Calendly',
  context: {},
};

const formatBookingName = (booking: RecordedCalendlyBooking) =>
  [booking.eventName, booking.inviteeName ?? booking.inviteeEmail]
    .filter(isNonEmptyString)
    .join(' · ') || 'Calendly booking';

// Saving a booking emits a database event, and the booking listener then
// recalculates the person's first meeting.
@Injectable()
export class CalendlyBookingService {
  constructor(private readonly workspaceOrmManager: WorkspaceOrmManager) {}

  async recordBooking(
    workspaceId: string,
    booking: RecordedCalendlyBooking,
  ): Promise<RecordCalendlyBookingResult> {
    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const bookingRepository =
        this.workspaceOrmManager.getRepository<CalendlyBookingRecord>(
          'calendlyBooking',
          { shouldBypassPermissionChecks: true },
        );

      const existing = await bookingRepository.findOne({
        where: { calendlyInviteeUri: booking.calendlyInviteeUri },
        withDeleted: true,
      });

      // Someone deleted this booking on purpose; a later event must not bring it back.
      if (isDefined(existing?.deletedAt)) {
        return { isNew: false, personId: existing.personId };
      }

      // A booking someone linked by hand keeps that person.
      const personId =
        existing?.personId ??
        (await this.findPersonIdByEmail(booking.inviteeEmail));

      const values = {
        name: formatBookingName(booking),
        calendlyInviteeUri: booking.calendlyInviteeUri,
        inviteeEmail: booking.inviteeEmail,
        eventName: booking.eventName,
        hostEmail: booking.hostEmail,
        meetingStartsAt: booking.meetingStartsAt.toISOString(),
        bookedAt: booking.bookedAt?.toISOString() ?? null,
        bookingStatus: booking.status,
        personId,
      };

      if (isDefined(existing)) {
        await bookingRepository.update(existing.id, values);
      } else {
        // Actor name columns are NOT NULL with no DB default.
        await bookingRepository.insert({
          ...values,
          createdBy: CALENDLY_ACTOR,
          updatedBy: CALENDLY_ACTOR,
        });
      }

      return { isNew: !isDefined(existing), personId };
    }, buildSystemAuthContext(workspaceId));
  }

  // Same matching as the payment tracker: any of the person's emails, and the
  // oldest person when several share it.
  private async findPersonIdByEmail(
    email: string | null,
  ): Promise<string | null> {
    if (!isNonEmptyString(email)) {
      return null;
    }

    const personRepository = this.workspaceOrmManager.getRepository('person', {
      shouldBypassPermissionChecks: true,
    });

    const matchingPeople = (await addPersonEmailFiltersToQueryBuilder({
      queryBuilder: personRepository.createQueryBuilder('person'),
      emails: [email.trim().toLowerCase()],
    })
      .orderBy('person.createdAt', 'ASC')
      .getMany()) as { id: string; deletedAt: string | null }[];

    return (
      matchingPeople.find((person) => !isDefined(person.deletedAt))?.id ?? null
    );
  }
}
