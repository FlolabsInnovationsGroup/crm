import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { SenderConnectedAccountDTO } from 'src/engine/metadata-modules/connected-account/dtos/sender-connected-account.dto';
import { TeamMailboxDTO } from 'src/engine/metadata-modules/connected-account/dtos/team-mailbox.dto';
import { ConnectedAccountGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/connected-account/interceptors/connected-account-graphql-api-exception.interceptor';
import { TeamMailboxService } from 'src/engine/metadata-modules/connected-account/services/team-mailbox.service';

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
)
@UseInterceptors(ConnectedAccountGraphqlApiExceptionInterceptor)
@MetadataResolver(() => TeamMailboxDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
export class TeamMailboxResolver {
  constructor(private readonly teamMailboxService: TeamMailboxService) {}

  @Query(() => [SenderConnectedAccountDTO])
  @UseGuards(NoPermissionGuard)
  async mySenderConnectedAccounts(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<SenderConnectedAccountDTO[]> {
    return this.teamMailboxService.findSenderAccounts({
      workspaceId: workspace.id,
      userWorkspaceId,
      workspaceMemberId,
    });
  }

  @Query(() => [TeamMailboxDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKSPACE_MEMBERS))
  async teamMailboxes(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TeamMailboxDTO[]> {
    return this.teamMailboxService.findTeamMailboxes(workspace.id);
  }

  @Mutation(() => TeamMailboxDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKSPACE_MEMBERS))
  async setTeamMailboxMembers(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('connectedAccountId', { type: () => UUIDScalarType })
    connectedAccountId: string,
    @Args('workspaceMemberIds', { type: () => [UUIDScalarType] })
    workspaceMemberIds: string[],
  ): Promise<TeamMailboxDTO> {
    return this.teamMailboxService.setTeamMailboxMembers({
      workspaceId: workspace.id,
      connectedAccountId,
      workspaceMemberIds,
    });
  }
}
