import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { CampaignDTO } from 'src/modules/campaign/dtos/campaign.dto';
import { CampaignsOverviewDTO } from 'src/modules/campaign/dtos/campaigns-overview.dto';
import { CreateCampaignInput } from 'src/modules/campaign/dtos/create-campaign.input';
import { CampaignService } from 'src/modules/campaign/services/campaign.service';

// Sending reaches real inboxes, so it takes the workspace-settings permission
// until the CRM has a campaign permission of its own.
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
@CoreResolver(() => CampaignDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class CampaignResolver {
  constructor(private readonly campaignService: CampaignService) {}

  @Query(() => CampaignsOverviewDTO)
  async getCampaignsOverview(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<CampaignsOverviewDTO> {
    return this.campaignService.getOverview(workspace.id);
  }

  @Mutation(() => CampaignDTO)
  async createCampaign(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: CreateCampaignInput,
  ): Promise<CampaignDTO> {
    return this.campaignService.createCampaign(workspace.id, input);
  }

  @Mutation(() => Boolean)
  async sendCampaignTest(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: AuthContextUser,
    @Args('campaignId', { type: () => Int }) campaignId: number,
    @Args('email', { type: () => String, nullable: true })
    email?: string | null,
  ): Promise<boolean> {
    return this.campaignService.sendTest({
      workspaceId: workspace.id,
      campaignId,
      requestedEmail: email,
      user,
    });
  }

  @Mutation(() => CampaignDTO)
  async startCampaign(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('campaignId', { type: () => Int }) campaignId: number,
  ): Promise<CampaignDTO> {
    return this.campaignService.changeStatus(
      workspace.id,
      campaignId,
      'running',
    );
  }

  @Mutation(() => CampaignDTO)
  async pauseCampaign(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('campaignId', { type: () => Int }) campaignId: number,
  ): Promise<CampaignDTO> {
    return this.campaignService.changeStatus(
      workspace.id,
      campaignId,
      'paused',
    );
  }

  @Mutation(() => CampaignDTO)
  async cancelCampaign(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('campaignId', { type: () => Int }) campaignId: number,
  ): Promise<CampaignDTO> {
    return this.campaignService.changeStatus(
      workspace.id,
      campaignId,
      'cancelled',
    );
  }

  @Mutation(() => Boolean)
  async deleteCampaignDraft(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('campaignId', { type: () => Int }) campaignId: number,
  ): Promise<boolean> {
    return this.campaignService.deleteDraft(workspace.id, campaignId);
  }
}
