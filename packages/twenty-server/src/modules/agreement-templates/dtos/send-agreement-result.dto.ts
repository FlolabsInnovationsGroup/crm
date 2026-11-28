import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('SendAgreementResult')
export class SendAgreementResultDTO {
  @Field(() => UUIDScalarType)
  agreementRequestId: string;

  @Field(() => Boolean)
  emailSent: boolean;

  @Field(() => String, { nullable: true })
  emailError: string | null;
}
