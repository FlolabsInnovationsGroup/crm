import { UseFilters, UseGuards } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthPrincipalGuard } from 'src/engine/guards/auth-principal.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { StripePaymentSyncResultDTO } from 'src/modules/payment-tracker/dtos/stripe-payment-sync-result.dto';
import { PaymentTrackerStripeService } from 'src/modules/payment-tracker/services/payment-tracker-stripe.service';
import { PaymentTrackerService } from 'src/modules/payment-tracker/services/payment-tracker.service';
import { getPaymentTrackerConfig } from 'src/modules/payment-tracker/utils/get-payment-tracker-config.util';

const MAX_SYNC_DAYS = 400;

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
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@CoreResolver(() => StripePaymentSyncResultDTO)
@UseFilters(
  AuthGraphqlApiExceptionFilter,
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class PaymentTrackerResolver {
  constructor(
    private readonly paymentTrackerStripeService: PaymentTrackerStripeService,
    private readonly paymentTrackerService: PaymentTrackerService,
  ) {}

  // Brings in payments made before the webhook existed, or missed while the
  // server was down. Running it again only updates what is already there.
  @Mutation(() => StripePaymentSyncResultDTO)
  async syncStripePayments(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('since', { type: () => Date }) since: Date,
  ): Promise<StripePaymentSyncResultDTO> {
    const config = getPaymentTrackerConfig();

    if (!isDefined(config) || config.workspaceId !== workspace.id) {
      throw new UserInputError(
        'Payment tracking is not set up for this workspace',
      );
    }

    const earliest = new Date(Date.now() - MAX_SYNC_DAYS * 24 * 60 * 60 * 1000);
    const from = since < earliest ? earliest : since;

    const result = {
      paymentsRead: 0,
      paymentsAdded: 0,
      paymentsWithoutPerson: 0,
    };

    for await (const payment of this.paymentTrackerStripeService.listPaymentsSince(
      from,
    )) {
      const { isNew, personId } =
        await this.paymentTrackerService.recordPayment(workspace.id, payment);

      result.paymentsRead += 1;
      result.paymentsAdded += isNew ? 1 : 0;
      result.paymentsWithoutPerson += isDefined(personId) ? 0 : 1;
    }

    return result;
  }
}
