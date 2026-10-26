import { Module } from '@nestjs/common';

import { UserVarsModule } from 'src/engine/core-modules/user/user-vars/user-vars.module';
import { NotificationsSeenResolver } from 'src/modules/notifications-seen/resolvers/notifications-seen.resolver';

@Module({
  imports: [UserVarsModule],
  providers: [NotificationsSeenResolver],
})
export class NotificationsSeenModule {}
