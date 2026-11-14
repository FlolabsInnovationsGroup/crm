import { UseGuards, UseFilters } from '@nestjs/common';
import { Args, ArgsType, Field, Int, Mutation, Query } from '@nestjs/graphql';

import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsOptional,
  Max,
  MaxLength,
} from 'class-validator';
import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { TIMELINE_THREADS_MAX_PAGE_SIZE } from 'src/engine/core-modules/messaging/constants/messaging.constants';
import { InboxMailboxDTO } from 'src/engine/core-modules/messaging/dtos/inbox-mailbox.dto';
import { DismissReconnectAccountBannerInput } from 'src/engine/core-modules/messaging/dtos/dismiss-reconnect-account-banner.input';
import { TimelineThreadsWithTotalDTO } from 'src/engine/core-modules/messaging/dtos/timeline-threads-with-total.dto';
import { GetMessagesService } from 'src/engine/core-modules/messaging/services/get-messages.service';
import { TeamInboxContactService } from 'src/engine/core-modules/messaging/services/team-inbox-contact.service';
import { TeamInboxClosedService } from 'src/engine/core-modules/messaging/services/team-inbox-closed.service';
import { TeamInboxManualReviewService } from 'src/engine/core-modules/messaging/services/team-inbox-manual-review.service';
import { TeamInboxReadStateService } from 'src/engine/core-modules/messaging/services/team-inbox-read-state.service';
import { TimelineMessagingService } from 'src/engine/core-modules/messaging/services/timeline-messaging.service';
import { isTeamInboxThreadRead } from 'src/engine/core-modules/messaging/utils/team-inbox-read-state.util';
import { type InboxThreadDirection } from 'src/engine/core-modules/messaging/types/inbox-thread-filter.type';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { AccountsToReconnectService } from 'src/modules/connected-account/services/accounts-to-reconnect.service';

@ArgsType()
class GetTimelineThreadsFromObjectRecordArgs {
  @Field(() => String)
  objectNameSingular: string;

  @Field(() => UUIDScalarType)
  recordId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_THREADS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetInboxThreadsArgs {
  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_THREADS_MAX_PAGE_SIZE)
  pageSize: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsIn(['INCOMING', 'OUTGOING'])
  direction?: InboxThreadDirection;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  messageChannelId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(200)
  searchTerm?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  manualReview?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

@ArgsType()
class SetInboxThreadClosedArgs {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => Boolean)
  @IsBoolean()
  isClosed: boolean;
}

@ArgsType()
class SetManualReviewDoneArgs {
  @Field(() => UUIDScalarType)
  messageThreadId: string;

  @Field(() => Boolean)
  @IsBoolean()
  isDone: boolean;
}

@ArgsType()
class MarkInboxThreadsReadArgs {
  @Field(() => [UUIDScalarType])
  @ArrayMaxSize(200)
  messageThreadIds: string[];
}

@ArgsType()
class MarkInboxThreadUnreadArgs {
  @Field(() => UUIDScalarType)
  messageThreadId: string;
}

@ArgsType()
class GetTimelineThreadsFromPersonIdArgs {
  @Field(() => UUIDScalarType)
  personId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_THREADS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetTimelineThreadsFromCompanyIdArgs {
  @Field(() => UUIDScalarType)
  companyId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_THREADS_MAX_PAGE_SIZE)
  pageSize: number;
}

@ArgsType()
class GetTimelineThreadsFromOpportunityIdArgs {
  @Field(() => UUIDScalarType)
  opportunityId: string;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  @Max(TIMELINE_THREADS_MAX_PAGE_SIZE)
  pageSize: number;
}

@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: true,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  CustomPermissionGuard,
)
@CoreResolver(() => TimelineThreadsWithTotalDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
export class TimelineMessagingResolver {
  constructor(
    private readonly getMessagesFromPersonIdsService: GetMessagesService,
    private readonly timelineMessagingService: TimelineMessagingService,
    private readonly userService: UserService,
    private readonly accountsToReconnectService: AccountsToReconnectService,
    private readonly teamInboxReadStateService: TeamInboxReadStateService,
    private readonly teamInboxManualReviewService: TeamInboxManualReviewService,
    private readonly teamInboxClosedService: TeamInboxClosedService,
    private readonly teamInboxContactService: TeamInboxContactService,
  ) {}

  @Query(() => TimelineThreadsWithTotalDTO)
  async getTimelineThreadsFromObjectRecord(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args()
    {
      objectNameSingular,
      recordId,
      page,
      pageSize,
    }: GetTimelineThreadsFromObjectRecordArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }

    return this.getMessagesFromPersonIdsService.getMessagesFromObjectRecord(
      workspaceMember.id,
      objectNameSingular,
      recordId,
      workspace.id,
      page,
      pageSize,
    );
  }

  // FloLabs team inbox: every mailbox's threads, newest first. Thread
  // visibility still follows each mailbox's sharing setting.
  @Query(() => TimelineThreadsWithTotalDTO)
  async getInboxThreads(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args()
    {
      page,
      pageSize,
      direction,
      messageChannelId,
      searchTerm,
      unreadOnly,
      manualReview,
      closed,
    }: GetInboxThreadsArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }

    // Unset `closed` (notifications, applicant lookup) keeps closed threads.
    const isClosedFilterApplied = isDefined(closed) && manualReview !== true;

    const [readState, closedThreadIds] = await Promise.all([
      this.teamInboxReadStateService.getState({
        userId: user.id,
        workspaceId: workspace.id,
      }),
      isClosedFilterApplied
        ? this.teamInboxClosedService.getClosedThreadIds(workspace.id)
        : [],
    ]);

    const result = await this.getMessagesFromPersonIdsService.getInboxThreads(
      workspaceMember.id,
      workspace.id,
      page,
      pageSize,
      {
        direction,
        messageChannelId,
        searchTerm,
        unreadFor: unreadOnly === true ? readState : undefined,
        manualReview:
          manualReview === true
            ? {
                doneThreadIds:
                  await this.teamInboxManualReviewService.getDoneThreadIds(
                    workspace.id,
                  ),
              }
            : undefined,
        closed: isClosedFilterApplied
          ? { threadIds: closedThreadIds, only: closed === true }
          : undefined,
      },
    );

    const threadIds = result.timelineThreads.map((thread) => thread.id);

    const [lastIncomingAtByThreadId, contactByThreadId] = await Promise.all([
      this.timelineMessagingService.getLastIncomingAtByThreadId(
        threadIds,
        workspace.id,
      ),
      this.teamInboxContactService.getContactByThreadId(
        threadIds,
        workspace.id,
      ),
    ]);

    return {
      ...result,
      timelineThreads: result.timelineThreads.map((thread) => ({
        ...thread,
        contactDisplayName: contactByThreadId[thread.id]?.name ?? null,
        contactPersonId: contactByThreadId[thread.id]?.personId ?? null,
        read: isTeamInboxThreadRead(
          readState,
          thread.id,
          lastIncomingAtByThreadId[thread.id] ?? null,
        ),
      })),
    };
  }

  @Query(() => Int)
  async getInboxUnreadCount(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return 0;
    }

    const [readState, closedThreadIds] = await Promise.all([
      this.teamInboxReadStateService.getState({
        userId: user.id,
        workspaceId: workspace.id,
      }),
      this.teamInboxClosedService.getClosedThreadIds(workspace.id),
    ]);

    const { totalNumberOfThreads } =
      await this.getMessagesFromPersonIdsService.getInboxThreads(
        workspaceMember.id,
        workspace.id,
        1,
        1,
        {
          unreadFor: readState,
          closed: { threadIds: closedThreadIds, only: false },
        },
      );

    return totalNumberOfThreads;
  }

  @Query(() => Int)
  async getManualReviewCount(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return 0;
    }

    const { totalNumberOfThreads } =
      await this.getMessagesFromPersonIdsService.getInboxThreads(
        workspaceMember.id,
        workspace.id,
        1,
        1,
        {
          manualReview: {
            doneThreadIds:
              await this.teamInboxManualReviewService.getDoneThreadIds(
                workspace.id,
              ),
          },
        },
      );

    return totalNumberOfThreads;
  }

  @Mutation(() => Boolean)
  async setManualReviewDone(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { messageThreadId, isDone }: SetManualReviewDoneArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return false;
    }

    await this.teamInboxManualReviewService.setDone({
      workspaceId: workspace.id,
      messageThreadId,
      isDone,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async setInboxThreadClosed(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { messageThreadId, isClosed }: SetInboxThreadClosedArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    // The UUID scalar skips validation for inline literals.
    if (!workspaceMember || !isValidUuid(messageThreadId)) {
      return false;
    }

    await this.teamInboxClosedService.setClosed({
      workspaceId: workspace.id,
      messageThreadId,
      isClosed,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async markInboxThreadsRead(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { messageThreadIds }: MarkInboxThreadsReadArgs,
  ) {
    await this.teamInboxReadStateService.markRead(
      { userId: user.id, workspaceId: workspace.id },
      messageThreadIds,
    );

    return true;
  }

  @Mutation(() => Boolean)
  async markInboxThreadUnread(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { messageThreadId }: MarkInboxThreadUnreadArgs,
  ) {
    await this.teamInboxReadStateService.markUnread(
      { userId: user.id, workspaceId: workspace.id },
      messageThreadId,
    );

    return true;
  }

  @Mutation(() => Boolean)
  async markAllInboxThreadsRead(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    await this.teamInboxReadStateService.markAllRead({
      userId: user.id,
      workspaceId: workspace.id,
    });

    return true;
  }

  @Query(() => [InboxMailboxDTO])
  async getInboxMailboxes(@AuthWorkspace() workspace: WorkspaceEntity) {
    return this.timelineMessagingService.getInboxMailboxes(workspace.id);
  }

  @Query(() => TimelineThreadsWithTotalDTO, {
    deprecationReason: 'Use getTimelineThreadsFromObjectRecord instead',
  })
  async getTimelineThreadsFromPersonId(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { personId, page, pageSize }: GetTimelineThreadsFromPersonIdArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }

    return this.getMessagesFromPersonIdsService.getMessagesFromObjectRecord(
      workspaceMember.id,
      CoreObjectNameSingular.Person,
      personId,
      workspace.id,
      page,
      pageSize,
    );
  }

  @Query(() => TimelineThreadsWithTotalDTO, {
    deprecationReason: 'Use getTimelineThreadsFromObjectRecord instead',
  })
  async getTimelineThreadsFromCompanyId(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { companyId, page, pageSize }: GetTimelineThreadsFromCompanyIdArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }

    return this.getMessagesFromPersonIdsService.getMessagesFromObjectRecord(
      workspaceMember.id,
      CoreObjectNameSingular.Company,
      companyId,
      workspace.id,
      page,
      pageSize,
    );
  }

  @Query(() => TimelineThreadsWithTotalDTO, {
    deprecationReason: 'Use getTimelineThreadsFromObjectRecord instead',
  })
  async getTimelineThreadsFromOpportunityId(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args()
    { opportunityId, page, pageSize }: GetTimelineThreadsFromOpportunityIdArgs,
  ) {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return;
    }

    return this.getMessagesFromPersonIdsService.getMessagesFromObjectRecord(
      workspaceMember.id,
      CoreObjectNameSingular.Opportunity,
      opportunityId,
      workspace.id,
      page,
      pageSize,
    );
  }

  @UseGuards(SettingsPermissionGuard(PermissionFlagType.CONNECTED_ACCOUNTS))
  @Mutation(() => Boolean)
  async dismissReconnectAccountBanner(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { connectedAccountId }: DismissReconnectAccountBannerInput,
  ): Promise<boolean> {
    await this.accountsToReconnectService.removeAccountToReconnect(
      user.id,
      workspace.id,
      connectedAccountId,
    );

    return true;
  }
}
