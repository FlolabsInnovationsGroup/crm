import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { CampaignResolver } from 'src/modules/campaign/resolvers/campaign.resolver';
import { CampaignService } from 'src/modules/campaign/services/campaign.service';
import { ListmonkClientService } from 'src/modules/campaign/services/listmonk-client.service';
import { SendingDomainModule } from 'src/modules/sending-domain/sending-domain.module';

@Module({
  imports: [PermissionsModule, SendingDomainModule],
  providers: [ListmonkClientService, CampaignService, CampaignResolver],
})
export class CampaignModule {}
