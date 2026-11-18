import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { SendingDomainListDTO } from 'src/modules/sending-domain/dtos/sending-domain-list.dto';
import { SendingDomainDTO } from 'src/modules/sending-domain/dtos/sending-domain.dto';
import { SendingDomainService } from 'src/modules/sending-domain/services/sending-domain.service';

// The service also limits this to the one workspace named in the server's env.
@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: false,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@CoreResolver(() => SendingDomainDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class SendingDomainResolver {
  constructor(private readonly sendingDomainService: SendingDomainService) {}

  @Query(() => SendingDomainListDTO)
  async getSendingDomains(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<SendingDomainListDTO> {
    return this.sendingDomainService.listSendingDomains(workspace.id);
  }

  @Mutation(() => SendingDomainDTO)
  async addSendingDomain(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('domain', { type: () => String }) domain: string,
  ): Promise<SendingDomainDTO> {
    return this.sendingDomainService.addSendingDomain(workspace.id, domain);
  }

  @Mutation(() => Boolean)
  async removeSendingDomain(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('domain', { type: () => String }) domain: string,
  ): Promise<boolean> {
    return this.sendingDomainService.removeSendingDomain(workspace.id, domain);
  }
}
