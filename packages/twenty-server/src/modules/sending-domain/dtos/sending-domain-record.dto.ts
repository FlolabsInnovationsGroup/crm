import { Field, ObjectType } from '@nestjs/graphql';

import { type SendingDomainRecordStatus } from 'src/modules/sending-domain/types/sending-domain-status.type';

@ObjectType('SendingDomainRecord')
export class SendingDomainRecordDTO {
  @Field()
  type: string;

  @Field()
  name: string;

  // The name to type at the DNS provider, relative to the registered domain.
  @Field()
  hostLabel: string;

  @Field()
  value: string;

  // A record already published under this name that must be replaced by `value`.
  @Field(() => String, { nullable: true })
  existingValue: string | null;

  @Field(() => String)
  status: SendingDomainRecordStatus;
}
