import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Query } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { PublicFormStatsDTO } from 'src/modules/public-form/dtos/public-form-stats.dto';
import { PublicFormStatsService } from 'src/modules/public-form/services/public-form-stats.service';

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
@CoreResolver(() => PublicFormStatsDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
export class PublicFormStatsResolver {
  constructor(
    private readonly publicFormStatsService: PublicFormStatsService,
  ) {}

  @Query(() => PublicFormStatsDTO)
  async getPublicFormStats(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('formId', { type: () => UUIDScalarType }) formId: string,
  ): Promise<PublicFormStatsDTO> {
    return this.publicFormStatsService.getStats(workspace.id, formId);
  }
}
