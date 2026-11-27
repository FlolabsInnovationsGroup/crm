import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Int, Query } from '@nestjs/graphql';

import { isString } from '@sniptt/guards';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PermissionFlagType } from 'twenty-shared/constants';

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
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';

@ArgsType()
class GetApplicantReplyStateArgs {
  @Field(() => String)
  @Transform(({ value }) => (isString(value) ? value.trim() : value))
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

  // n8n calls this with its API key right before sending a reminder; the
  // key's role needs the Workflows permission.
  @Query(() => ApplicantReplyStateDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKFLOWS))
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

  // Lists applicants by name, so admins only.
  @Query(() => [ApplicantRemindedAfterReplyDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.WORKSPACE))
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
