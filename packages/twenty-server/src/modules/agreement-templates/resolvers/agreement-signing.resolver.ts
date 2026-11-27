import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, ArgsType, Field, Mutation } from '@nestjs/graphql';

import { ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';
import { AGREEMENT_DOCUMENT_MAX_COUNT } from 'src/modules/agreement-templates/constants/agreement-signing.constants';
import { SendAgreementResultDTO } from 'src/modules/agreement-templates/dtos/send-agreement-result.dto';
import {
  AgreementSigningError,
  AgreementSigningService,
} from 'src/modules/agreement-templates/services/agreement-signing.service';

@ArgsType()
class SendAgreementArgs {
  @Field(() => UUIDScalarType)
  @IsUUID()
  personId: string;

  @Field(() => [UUIDScalarType])
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(AGREEMENT_DOCUMENT_MAX_COUNT)
  templateIds: string[];
}

@ArgsType()
class AgreementRequestArgs {
  @Field(() => UUIDScalarType)
  @IsUUID()
  agreementRequestId: string;
}

const toGraphqlError = (error: unknown): unknown => {
  if (error instanceof AgreementSigningError) {
    return new UserInputError(error.message);
  }

  if (
    error instanceof TwentyOrmException &&
    error.code === TwentyOrmExceptionCode.UNKNOWN_OBJECT
  ) {
    return new UserInputError(
      'Agreement requests are not set up yet. Run setup-agreement-templates.mjs first.',
    );
  }

  return error;
};

// Permissions come from the records: the caller must be able to read the
// person and templates and create Agreement requests.
@UseGuards(
  AuthPrincipalGuard({
    userSession: {
      standard: true,
      impersonated: false,
      playground: true,
      workspaceAgnostic: false,
    },
    apiKey: false,
    oauthClient: false,
    application: false,
  }),
  CustomPermissionGuard,
)
@CoreResolver(() => SendAgreementResultDTO)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UsePipes(ResolverValidationPipe)
export class AgreementSigningResolver {
  constructor(
    private readonly agreementSigningService: AgreementSigningService,
  ) {}

  @Mutation(() => SendAgreementResultDTO)
  async sendAgreement(
    @Args() { personId, templateIds }: SendAgreementArgs,
  ): Promise<SendAgreementResultDTO> {
    const authContext = getWorkspaceAuthContext();

    try {
      return await this.agreementSigningService.sendAgreement({
        authContext,
        workspaceId: authContext.workspace.id,
        personId,
        templateIds,
      });
    } catch (error) {
      throw toGraphqlError(error);
    }
  }

  @Mutation(() => String, { nullable: true })
  async syncAgreementRequest(
    @Args() { agreementRequestId }: AgreementRequestArgs,
  ): Promise<string | null> {
    const authContext = getWorkspaceAuthContext();

    try {
      return await this.agreementSigningService.syncAgreementRequest({
        authContext,
        workspaceId: authContext.workspace.id,
        agreementRequestId,
      });
    } catch (error) {
      throw toGraphqlError(error);
    }
  }

  @Mutation(() => String)
  async resendAgreementEmail(
    @Args() { agreementRequestId }: AgreementRequestArgs,
  ): Promise<string> {
    const authContext = getWorkspaceAuthContext();

    try {
      return await this.agreementSigningService.resendAgreementEmail({
        authContext,
        workspaceId: authContext.workspace.id,
        agreementRequestId,
      });
    } catch (error) {
      throw toGraphqlError(error);
    }
  }
}
