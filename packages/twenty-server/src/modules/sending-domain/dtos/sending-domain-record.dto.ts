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

  @Field(() => String)
  status: SendingDomainRecordStatus;
}
