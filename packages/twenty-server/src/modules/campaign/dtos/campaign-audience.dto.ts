import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('CampaignAudience')
export class CampaignAudienceDTO {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field(() => Int)
  subscriberCount: number;
}
