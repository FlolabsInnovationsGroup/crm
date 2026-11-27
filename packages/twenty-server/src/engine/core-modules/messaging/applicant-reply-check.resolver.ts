import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Int, Query } from '@nestjs/graphql';

import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { MAX_REMINDED_AFTER_REPLY_DAYS } from 'src/engine/core-modules/messaging/constants/applicant-reply-check.constants';
import { ApplicantRemindedAfterReplyDTO } from 'src/engine/core-modules/messaging/dtos/applicant-reminded-after-reply.dto';
import { ApplicantReplyStateDTO } from 'src/engine/core-modules/messaging/dtos/applicant-reply-state.dto';
import { ApplicantReplyCheckService } from 'src/engine/core-modules/messaging/services/applicant-reply-check.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';

@ArgsType()
class GetApplicantReplyStateArgs {
  @Field(() => String)
  @IsEmail()
  email: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  since?: Date | null;
}

@ArgsType()
class FindApplicantsRemindedAfterReplyArgs {
  @Field(() => Int, { defaultValue: 30 })
  @IsInt()
  @Min(1)
  @Max(MAX_REMINDED_AFTER_REPLY_DAYS)
  days: number;
}

// n8n calls this with its API key right before sending a reminder.
@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: true,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: true,
    oauthClient: false,
    application: false,
  }),
  CustomPermissionGuard,
)
@CoreResolver(() => ApplicantReplyStateDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class ApplicantReplyCheckResolver {
  constructor(
    private readonly applicantReplyCheckService: ApplicantReplyCheckService,
  ) {}

  @Query(() => ApplicantReplyStateDTO)
  async getApplicantReplyState(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { email, since }: GetApplicantReplyStateArgs,
  ): Promise<ApplicantReplyStateDTO> {
    return this.applicantReplyCheckService.getReplyState({
      workspaceId: workspace.id,
      email,
      since: since ?? null,
    });
  }

  @Query(() => [ApplicantRemindedAfterReplyDTO])
  async findApplicantsRemindedAfterReply(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { days }: FindApplicantsRemindedAfterReplyArgs,
  ): Promise<ApplicantRemindedAfterReplyDTO[]> {
    return this.applicantReplyCheckService.findRemindedAfterReply({
      workspaceId: workspace.id,
      days,
    });
  }
}
