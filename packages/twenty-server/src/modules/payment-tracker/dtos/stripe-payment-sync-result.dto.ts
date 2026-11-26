import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('StripePaymentSyncResult')
export class StripePaymentSyncResultDTO {
  @Field(() => Int)
  paymentsRead: number;

  @Field(() => Int)
  paymentsAdded: number;

  @Field(() => Int)
  paymentsWithoutPerson: number;
}
