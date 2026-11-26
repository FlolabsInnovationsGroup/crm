import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { CalendlyWebhookController } from 'src/modules/meeting-tracker/controllers/calendly-webhook.controller';
import { CalendlyBookingListener } from 'src/modules/meeting-tracker/listeners/calendly-booking.listener';
import { MeetingTrackerListener } from 'src/modules/meeting-tracker/listeners/meeting-tracker.listener';
import { CalendlyBookingResolver } from 'src/modules/meeting-tracker/resolvers/calendly-booking.resolver';
import { MeetingTrackerResolver } from 'src/modules/meeting-tracker/resolvers/meeting-tracker.resolver';
import { CalendlyApiService } from 'src/modules/meeting-tracker/services/calendly-api.service';
import { CalendlyBookingService } from 'src/modules/meeting-tracker/services/calendly-booking.service';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';

@Module({
  imports: [PermissionsModule],
  controllers: [CalendlyWebhookController],
  providers: [
    MeetingTrackerService,
    MeetingTrackerResolver,
    MeetingTrackerListener,
    CalendlyApiService,
    CalendlyBookingService,
    CalendlyBookingResolver,
    CalendlyBookingListener,
  ],
})
export class MeetingTrackerModule {}
