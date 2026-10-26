import { UseFilters, UseGuards } from '@nestjs/common';
import { Mutation, Query } from '@nestjs/graphql';

import { isDefined } from 'twenty-shared/utils';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NotificationsSeenStateDTO } from 'src/modules/notifications-seen/dtos/notifications-seen-state.dto';

const NOTIFICATIONS_SEEN_KEY = 'NOTIFICATIONS_SEEN';

@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: true,
      playground: false,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  CustomPermissionGuard,
)
@CoreResolver(() => NotificationsSeenStateDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
export class NotificationsSeenResolver {
  constructor(
    private readonly userVarsService: UserVarsService<{
      [NOTIFICATIONS_SEEN_KEY]: NotificationsSeenStateDTO;
    }>,
  ) {}

  @Query(() => NotificationsSeenStateDTO)
  async getNotificationsSeenState(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<NotificationsSeenStateDTO> {
    const stored = await this.userVarsService.get({
      userId: user.id,
      workspaceId: workspace.id,
      key: NOTIFICATIONS_SEEN_KEY,
    });

    return {
      seenAt: stored?.seenAt ?? null,
      previousSeenAt: stored?.previousSeenAt ?? null,
    };
  }

  @Mutation(() => NotificationsSeenStateDTO)
  async markNotificationsSeen(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<NotificationsSeenStateDTO> {
    const previous = await this.getNotificationsSeenState(user, workspace);
    const next: NotificationsSeenStateDTO = {
      seenAt: new Date().toISOString(),
      previousSeenAt: isDefined(previous.seenAt) ? previous.seenAt : null,
    };

    await this.userVarsService.set({
      userId: user.id,
      workspaceId: workspace.id,
      key: NOTIFICATIONS_SEEN_KEY,
      value: next,
    });

    return next;
  }
}
