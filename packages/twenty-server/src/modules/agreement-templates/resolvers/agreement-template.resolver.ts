import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Query } from '@nestjs/graphql';

import { IsUUID } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
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
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args() { templateId, personId }: PreviewAgreementArgs,
  ): Promise<AgreementPreviewDTO | null> {
    return this.agreementTemplateService.preview({
      workspaceId: workspace.id,
      templateId,
      personId,
    });
  }
}
