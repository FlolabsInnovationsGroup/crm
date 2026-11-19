import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('SendingDomainDnsProvider')
export class SendingDomainDnsProviderDTO {
  @Field()
  name: string;

  @Field(() => String, { nullable: true })
  url: string | null;
}
