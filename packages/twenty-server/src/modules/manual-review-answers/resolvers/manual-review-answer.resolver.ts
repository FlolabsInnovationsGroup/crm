import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { RecordManualReviewAnswerInput } from 'src/modules/manual-review-answers/dtos/record-manual-review-answer.input';
import { ManualReviewAnswerService } from 'src/modules/manual-review-answers/services/manual-review-answer.service';

// Same access as marking a Needs review card done.
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
@CoreResolver(() => Boolean)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class ManualReviewAnswerResolver {
  constructor(
    private readonly userService: UserService,
    private readonly manualReviewAnswerService: ManualReviewAnswerService,
  ) {}

  @Mutation(() => Boolean)
  async recordManualReviewAnswer(
    @AuthUser() user: AuthContextUser,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('input') input: RecordManualReviewAnswerInput,
  ): Promise<boolean> {
    const workspaceMember = await this.userService.loadWorkspaceMember(
      user,
      workspace,
    );

    if (!workspaceMember) {
      return false;
    }

    try {
      await this.manualReviewAnswerService.recordAnswer({
        workspaceId: workspace.id,
        answeredBy: {
          workspaceMemberId: workspaceMember.id,
          name: [
            workspaceMember.name?.firstName,
            workspaceMember.name?.lastName,
          ]
            .filter(Boolean)
            .join(' '),
        },
        input,
      });
    } catch (error) {
      // Before the setup script creates the object, Done still works and the
      // card only warns that the answer was not saved.
      if (
        error instanceof TwentyOrmException &&
        error.code === TwentyOrmExceptionCode.UNKNOWN_OBJECT
      ) {
        return false;
      }

      throw error;
    }

    return true;
  }
}
