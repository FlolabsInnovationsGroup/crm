import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicantReplyCheckResolver } from 'src/engine/core-modules/messaging/applicant-reply-check.resolver';
import { ApplicantReplyCheckService } from 'src/engine/core-modules/messaging/services/applicant-reply-check.service';
import { FileUrlModule } from 'src/engine/core-modules/file/file-url/file-url.module';
import { GetMessagesService } from 'src/engine/core-modules/messaging/services/get-messages.service';
import { TeamInboxEmailsSentToApplicantsService } from 'src/engine/core-modules/messaging/services/team-inbox-emails-sent-to-applicants.service';
import { TeamInboxContactService } from 'src/engine/core-modules/messaging/services/team-inbox-contact.service';
import { TeamInboxClosedService } from 'src/engine/core-modules/messaging/services/team-inbox-closed.service';
import { TeamInboxManualReviewHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { TeamInboxManualReviewService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review.service';
import { TeamInboxReadStateService } from 'src/engine/core-modules/messaging/services/team-inbox-read-state.service';
import { TimelineMessagingService } from 'src/engine/core-modules/messaging/services/timeline-messaging.service';
import { TeamInboxEmailsSentToApplicantsResolver } from 'src/engine/core-modules/messaging/team-inbox-emails-sent-to-applicants.resolver';
import { TeamInboxManualReviewHistoryResolver } from 'src/engine/core-modules/messaging/team-inbox-manual-review-history.resolver';
import { TimelineMessagingResolver } from 'src/engine/core-modules/messaging/timeline-messaging.resolver';
import { RelatedPersonIdsModule } from 'src/engine/core-modules/related-person-ids/related-person-ids.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserVarsModule } from 'src/engine/core-modules/user/user-vars/user-vars.module';
import { UserModule } from 'src/engine/core-modules/user/user.module';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ConnectedAccountModule } from 'src/modules/connected-account/connected-account.module';
import { TargetModule } from 'src/engine/core-modules/target/target.module';

@Module({
  imports: [
    FileUrlModule,
    UserModule,
    UserVarsModule,
    ConnectedAccountModule,
    PermissionsModule,
    RelatedPersonIdsModule,
    TargetModule,
    TypeOrmModule.forFeature([
      MessageChannelEntity,
      ConnectedAccountEntity,
      UserWorkspaceEntity,
    ]),
  ],
  exports: [],
  providers: [
    TimelineMessagingResolver,
    TimelineMessagingService,
    GetMessagesService,
    TeamInboxReadStateService,
    TeamInboxManualReviewService,
    TeamInboxManualReviewHistoryService,
    TeamInboxManualReviewHistoryResolver,
    TeamInboxEmailsSentToApplicantsService,
    TeamInboxEmailsSentToApplicantsResolver,
    ApplicantReplyCheckService,
    ApplicantReplyCheckResolver,
    TeamInboxClosedService,
    TeamInboxContactService,
  ],
})
export class TimelineMessagingModule {}
