import { UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { ConnectedAccountGraphqlApiExceptionInterceptor } from 'src/engine/metadata-modules/connected-account/interceptors/connected-account-graphql-api-exception.interceptor';
import { TeamMailboxSignatureService } from 'src/engine/metadata-modules/connected-account/services/team-mailbox-signature.service';

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
@MetadataResolver()
@UseFilters(AuthGraphqlApiExceptionFilter)
export class TeamMailboxSignatureResolver {
  constructor(
    private readonly teamMailboxSignatureService: TeamMailboxSignatureService,
  ) {}

  // Any member may read it: it goes out at the bottom of every reply anyway.
  @Query(() => String, { nullable: true })
  @UseGuards(NoPermissionGuard)
  async teamMailboxSignature(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('connectedAccountId', { type: () => UUIDScalarType })
    connectedAccountId: string,
  ): Promise<string | null> {
    return this.teamMailboxSignatureService.getSignature({
      workspaceId: workspace.id,
      connectedAccountId,
    });
  }

  @Mutation(() => String, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKSPACE_MEMBERS))
  async setTeamMailboxSignature(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('connectedAccountId', { type: () => UUIDScalarType })
    connectedAccountId: string,
    @Args('signature', { type: () => String })
    signature: string,
  ): Promise<string | null> {
    return this.teamMailboxSignatureService.setSignature({
      workspaceId: workspace.id,
      connectedAccountId,
      signature,
    });
  }
}
