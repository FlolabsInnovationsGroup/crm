import { Field, ObjectType } from '@nestjs/graphql';

import { SendingDomainDTO } from 'src/modules/sending-domain/dtos/sending-domain.dto';

@ObjectType('SendingDomainList')
export class SendingDomainListDTO {
  // False when this server has no campaigns mail stack connected.
  @Field()
  isConfigured: boolean;

  @Field(() => [SendingDomainDTO])
  domains: SendingDomainDTO[];
}
