import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, ArgsType, Field, Query } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import { ArrayMaxSize, ValidateNested } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ManualReviewHistoryEntryDTO } from 'src/engine/core-modules/messaging/dtos/manual-review-history-entry.dto';
import { ManualReviewHistoryItemInput } from 'src/engine/core-modules/messaging/dtos/manual-review-history-item.input';
import {
  MAX_MANUAL_REVIEW_HISTORY_ITEMS,
  TeamInboxManualReviewHistoryService,
} from 'src/engine/core-modules/messaging/services/team-inbox-manual-review-history.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';

@ArgsType()
class GetManualReviewHistoryArgs {
  @Field(() => [ManualReviewHistoryItemInput])
  @ArrayMaxSize(MAX_MANUAL_REVIEW_HISTORY_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ManualReviewHistoryItemInput)
  items: ManualReviewHistoryItemInput[];
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
@CoreResolver(() => ManualReviewHistoryEntryDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
export class TeamInboxManualReviewHistoryResolver {
  constructor(
    private readonly userService: UserService,
    private readonly teamInboxManualReviewHistoryService: TeamInboxManualReviewHistoryService,
  ) {}

  @Query(() => [ManualReviewHistoryEntryDTO])
  async getManualReviewHistory(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { items }: GetManualReviewHistoryArgs,
  ): Promise<ManualReviewHistoryEntryDTO[]> {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return [];
    }

    return this.teamInboxManualReviewHistoryService.getHistory({
      workspaceId: workspace.id,
      items,
    });
  }
}
