import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Query } from '@nestjs/graphql';

import { IsUUID } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { AgreementPreviewDTO } from 'src/modules/agreement-templates/dtos/agreement-preview.dto';
import { AgreementTemplateService } from 'src/modules/agreement-templates/services/agreement-template.service';

@ArgsType()
class PreviewAgreementArgs {
  @Field(() => UUIDScalarType)
  @IsUUID()
  templateId: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  personId: string;
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
@CoreResolver(() => AgreementPreviewDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class AgreementTemplateResolver {
  constructor(
    private readonly agreementTemplateService: AgreementTemplateService,
  ) {}

  @Query(() => AgreementPreviewDTO, { nullable: true })
  async previewAgreement(
    @Args() { templateId, personId }: PreviewAgreementArgs,
  ): Promise<AgreementPreviewDTO | null> {
    try {
      return await this.agreementTemplateService.preview({
        authContext: getWorkspaceAuthContext(),
        templateId,
        personId,
      });
    } catch (error) {
      if (
        error instanceof TwentyOrmException &&
        error.code === TwentyOrmExceptionCode.UNKNOWN_OBJECT
      ) {
        throw new UserInputError(
          'Agreement templates are not set up yet. Run setup-agreement-templates.mjs first.',
        );
      }

      throw error;
    }
  }
}
