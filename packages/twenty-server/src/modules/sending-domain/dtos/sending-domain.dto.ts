import { Field, ObjectType } from '@nestjs/graphql';

import { SendingDomainDnsProviderDTO } from 'src/modules/sending-domain/dtos/sending-domain-dns-provider.dto';
import { SendingDomainRecordDTO } from 'src/modules/sending-domain/dtos/sending-domain-record.dto';
import { type SendingDomainStatus } from 'src/modules/sending-domain/types/sending-domain-status.type';

@ObjectType('SendingDomain')
export class SendingDomainDTO {
  @Field()
  domain: string;

  @Field(() => String)
  status: SendingDomainStatus;

  // Set in the mail server's .env, so it cannot be removed from the CRM.
  @Field()
  isFixed: boolean;

  @Field(() => SendingDomainDnsProviderDTO, { nullable: true })
  dnsProvider: SendingDomainDnsProviderDTO | null;

  @Field(() => [SendingDomainRecordDTO])
  records: SendingDomainRecordDTO[];
}
