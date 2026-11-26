import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { MeetingTrackerListener } from 'src/modules/meeting-tracker/listeners/meeting-tracker.listener';
import { MeetingTrackerResolver } from 'src/modules/meeting-tracker/resolvers/meeting-tracker.resolver';
import { MeetingTrackerService } from 'src/modules/meeting-tracker/services/meeting-tracker.service';

@Module({
  imports: [PermissionsModule],
  providers: [
    MeetingTrackerService,
    MeetingTrackerResolver,
    MeetingTrackerListener,
  ],
})
export class MeetingTrackerModule {}
