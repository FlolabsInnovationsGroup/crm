import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { CalendlyBookingSyncResultDTO } from 'src/modules/meeting-tracker/dtos/calendly-booking-sync-result.dto';
import { CalendlyApiService } from 'src/modules/meeting-tracker/services/calendly-api.service';
import { CalendlyBookingService } from 'src/modules/meeting-tracker/services/calendly-booking.service';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';
import { getCalendlyConfig } from 'src/modules/meeting-tracker/utils/get-calendly-config.util';

// Matches the payment sync: a little over a year of history is enough.
const MAX_SYNC_DAYS = 400;

@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@CoreResolver(() => CalendlyBookingSyncResultDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class CalendlyBookingResolver {
  constructor(
    private readonly calendlyApiService: CalendlyApiService,
    private readonly calendlyBookingService: CalendlyBookingService,
    private readonly meetingTrackerService: MeetingTrackerService,
  ) {}

  // Brings in meetings booked before the webhook existed, or missed while the
  // server was down. Running it again only updates what is already there.
  @Mutation(() => CalendlyBookingSyncResultDTO)
  async syncCalendlyBookings(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('since', { type: () => Date }) since: Date,
  ): Promise<CalendlyBookingSyncResultDTO> {
    const config = getCalendlyConfig();

    if (!isDefined(config) || config.workspaceId !== workspace.id) {
      throw new UserInputError('Calendly is not set up for this workspace');
    }

    const earliest = new Date(Date.now() - MAX_SYNC_DAYS * 24 * 60 * 60 * 1000);
    const from = since < earliest ? earliest : since;

    const result = {
      bookingsRead: 0,
      bookingsAdded: 0,
      bookingsWithoutPerson: 0,
    };
    const personIds = new Set<string>();

    for await (const booking of this.calendlyApiService.listBookingsSince(
      from,
    )) {
      const { isNew, personId } =
        await this.calendlyBookingService.recordBooking(workspace.id, booking);

      result.bookingsRead += 1;
      result.bookingsAdded += isNew ? 1 : 0;

      if (isDefined(personId)) {
        personIds.add(personId);
      } else {
        result.bookingsWithoutPerson += 1;
      }
    }

    // Unchanged bookings emit no events, so a re-run repairs meetings here.
    await this.meetingTrackerService.recalculatePeople(workspace.id, [
      ...personIds,
    ]);

    return result;
  }
}
