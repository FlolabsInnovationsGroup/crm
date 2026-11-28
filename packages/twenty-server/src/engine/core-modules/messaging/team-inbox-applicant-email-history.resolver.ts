import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Query } from '@nestjs/graphql';

import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { ApplicantEmailHistoryDTO } from 'src/engine/core-modules/messaging/dtos/applicant-email-history.dto';
import { TeamInboxApplicantEmailHistoryService } from 'src/engine/core-modules/messaging/services/team-inbox-applicant-email-history.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';

@ArgsType()
class GetApplicantEmailHistoryArgs {
  @Field(() => String)
  @IsString()
  @MaxLength(320)
  applicantEmail: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsOptional()
  personId?: string | null;
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
@CoreResolver(() => ApplicantEmailHistoryDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class TeamInboxApplicantEmailHistoryResolver {
  constructor(
    private readonly userService: UserService,
    private readonly teamInboxApplicantEmailHistoryService: TeamInboxApplicantEmailHistoryService,
  ) {}

  @Query(() => ApplicantEmailHistoryDTO)
  async getApplicantEmailHistory(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { applicantEmail, personId }: GetApplicantEmailHistoryArgs,
  ): Promise<ApplicantEmailHistoryDTO> {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return { messages: [], isTruncated: false };
    }

    return this.teamInboxApplicantEmailHistoryService.getApplicantEmailHistory({
      workspaceId: workspace.id,
      workspaceMemberId: workspaceMember.id,
      userId: user.id,
      applicantEmail,
      personId: personId ?? null,
    });
  }
}
