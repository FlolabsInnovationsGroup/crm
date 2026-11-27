import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Query } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import { ArrayMaxSize, ValidateNested } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { MAX_EMAILS_SENT_TO_APPLICANTS_ITEMS } from 'src/engine/core-modules/messaging/constants/emails-sent-to-applicants.constants';
import { EmailSentToApplicantDTO } from 'src/engine/core-modules/messaging/dtos/email-sent-to-applicant.dto';
import { EmailSentToApplicantItemInput } from 'src/engine/core-modules/messaging/dtos/email-sent-to-applicant-item.input';
import { TeamInboxEmailsSentToApplicantsService } from 'src/engine/core-modules/messaging/services/team-inbox-emails-sent-to-applicants.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';

@ArgsType()
class GetEmailsSentToApplicantsArgs {
  @Field(() => [EmailSentToApplicantItemInput])
  @ArrayMaxSize(MAX_EMAILS_SENT_TO_APPLICANTS_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => EmailSentToApplicantItemInput)
  items: EmailSentToApplicantItemInput[];
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
@CoreResolver(() => EmailSentToApplicantDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class TeamInboxEmailsSentToApplicantsResolver {
  constructor(
    private readonly userService: UserService,
    private readonly teamInboxEmailsSentToApplicantsService: TeamInboxEmailsSentToApplicantsService,
  ) {}

  @Query(() => [EmailSentToApplicantDTO])
  async getEmailsSentToApplicants(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { items }: GetEmailsSentToApplicantsArgs,
  ): Promise<EmailSentToApplicantDTO[]> {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return [];
    }

    return this.teamInboxEmailsSentToApplicantsService.getEmailsSentToApplicants(
      {
        workspaceId: workspace.id,
        workspaceMemberId: workspaceMember.id,
        items,
      },
    );
  }
}
