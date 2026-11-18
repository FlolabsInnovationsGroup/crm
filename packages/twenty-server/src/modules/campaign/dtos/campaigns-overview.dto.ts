import { Field, ObjectType } from '@nestjs/graphql';

import { CampaignAudienceDTO } from 'src/modules/campaign/dtos/campaign-audience.dto';
import { CampaignDTO } from 'src/modules/campaign/dtos/campaign.dto';

@ObjectType('CampaignsOverview')
export class CampaignsOverviewDTO {
  // False when no campaign server is connected to this CRM.
  @Field()
  isConfigured: boolean;

  @Field(() => [CampaignDTO])
  campaigns: CampaignDTO[];

  @Field(() => [CampaignAudienceDTO])
  audiences: CampaignAudienceDTO[];

  // Only verified domains, so a campaign is never sent unsigned.
  @Field(() => [String])
  fromDomains: string[];
}
