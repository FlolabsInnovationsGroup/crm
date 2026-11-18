import { Field, Int, ObjectType } from '@nestjs/graphql';

import { type CampaignStatus } from 'src/modules/campaign/types/campaign-status.type';

@ObjectType('Campaign')
export class CampaignDTO {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  subject: string;

  @Field()
  fromEmail: string;

  @Field(() => String)
  status: CampaignStatus;

  @Field(() => [String])
  listNames: string[];

  @Field(() => Int)
  toSend: number;

  @Field(() => Int)
  sent: number;

  @Field(() => Int)
  views: number;

  @Field(() => Int)
  clicks: number;

  @Field(() => Int)
  bounces: number;

  @Field()
  createdAt: string;

  @Field(() => String, { nullable: true })
  startedAt: string | null;
}
