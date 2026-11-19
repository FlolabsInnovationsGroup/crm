import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { emailSchema } from 'twenty-shared/utils';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type CampaignDTO } from 'src/modules/campaign/dtos/campaign.dto';
import { type CampaignsOverviewDTO } from 'src/modules/campaign/dtos/campaigns-overview.dto';
import { type CreateCampaignInput } from 'src/modules/campaign/dtos/create-campaign.input';
import { ListmonkClientService } from 'src/modules/campaign/services/listmonk-client.service';
import { type CampaignStatusChange } from 'src/modules/campaign/types/campaign-status.type';
import {
  type ListmonkCampaign,
  type ListmonkCampaignWithContent,
  type ListmonkList,
  type ListmonkPage,
} from 'src/modules/campaign/types/listmonk.type';
import { buildCampaignFromAddress } from 'src/modules/campaign/utils/build-campaign-from-address.util';
import { mapListmonkCampaign } from 'src/modules/campaign/utils/map-listmonk-campaign.util';
import { SendingDomainService } from 'src/modules/sending-domain/services/sending-domain.service';
import { isFlolabsMailWorkspace } from 'src/modules/sending-domain/utils/is-flolabs-mail-workspace.util';

@Injectable()
export class CampaignService {
  constructor(
    private readonly listmonkClientService: ListmonkClientService,
    private readonly sendingDomainService: SendingDomainService,
  ) {}

  async getOverview(workspaceId: string): Promise<CampaignsOverviewDTO> {
    if (!this.isAvailable(workspaceId)) {
      return {
        isConfigured: false,
        campaigns: [],
        audiences: [],
        fromDomains: [],
      };
    }

    const [campaigns, lists, fromDomains] = await Promise.all([
      this.listmonkClientService.request<ListmonkPage<ListmonkCampaign>>({
        method: 'GET',
        path: '/api/campaigns?per_page=all&order_by=created_at&order=desc&no_body=true',
      }),
      this.listmonkClientService.request<ListmonkPage<ListmonkList>>({
        method: 'GET',
        path: '/api/lists?per_page=all&order_by=name&order=asc&status=active',
      }),
      this.getVerifiedDomains(workspaceId),
    ]);

    return {
      isConfigured: true,
      campaigns: campaigns.results.map(mapListmonkCampaign),
      audiences: lists.results.map((list) => ({
        id: list.id,
        name: list.name,
        subscriberCount: list.subscriber_count,
      })),
      fromDomains,
    };
  }

  async createCampaign(
    workspaceId: string,
    input: CreateCampaignInput,
  ): Promise<CampaignDTO> {
    this.assertAvailable(workspaceId);

    const verifiedDomains = await this.getVerifiedDomains(workspaceId);

    if (!verifiedDomains.includes(input.fromDomain)) {
      throw new UserInputError(`${input.fromDomain} is not verified`, {
        userFriendlyMessage: msg`${input.fromDomain} is not a verified sending domain. Check it in Settings > Sending domains.`,
      });
    }

    const fromEmail = buildCampaignFromAddress(input);

    if (fromEmail === null) {
      throw new UserInputError('Invalid from address', {
        userFriendlyMessage: msg`Use a sender name and an address part with letters, digits, dots, dashes or underscores.`,
      });
    }

    const campaign = await this.listmonkClientService.request<ListmonkCampaign>(
      {
        method: 'POST',
        path: '/api/campaigns',
        body: {
          name: input.name.trim(),
          subject: input.subject.trim(),
          from_email: fromEmail,
          lists: input.audienceIds,
          type: 'regular',
          messenger: 'email',
          content_type: 'markdown',
          body: input.body,
        },
      },
    );

    return mapListmonkCampaign(campaign);
  }

  async sendTest({
    workspaceId,
    campaignId,
    recipientEmail,
    recipientName,
  }: {
    workspaceId: string;
    campaignId: number;
    recipientEmail: string;
    recipientName: string;
  }): Promise<boolean> {
    this.assertAvailable(workspaceId);

    if (!emailSchema.safeParse(recipientEmail).success) {
      throw new UserInputError(
        `"${recipientEmail}" is not a valid email address`,
        {
          userFriendlyMessage: msg`"${recipientEmail}" is not a valid email address.`,
        },
      );
    }

    const campaign =
      await this.listmonkClientService.request<ListmonkCampaignWithContent>({
        method: 'GET',
        path: `/api/campaigns/${campaignId}`,
      });

    // Listmonk only sends tests to existing subscribers; one with no list gets
    // no campaign. 409 means the person is already a subscriber.
    await this.listmonkClientService.request({
      method: 'POST',
      path: '/api/subscribers',
      body: {
        email: recipientEmail,
        name: recipientName,
        status: 'enabled',
        lists: [],
      },
      ignoredErrorStatuses: [409],
    });

    await this.listmonkClientService.request({
      method: 'POST',
      path: `/api/campaigns/${campaignId}/test`,
      body: {
        name: campaign.name,
        subject: campaign.subject,
        from_email: campaign.from_email,
        body: campaign.body,
        content_type: campaign.content_type,
        messenger: campaign.messenger,
        template_id: campaign.template_id,
        lists: (campaign.lists ?? []).map((list) => list.id),
        subscribers: [recipientEmail],
      },
    });

    return true;
  }

  async changeStatus(
    workspaceId: string,
    campaignId: number,
    status: CampaignStatusChange,
  ): Promise<CampaignDTO> {
    this.assertAvailable(workspaceId);

    const campaign = await this.listmonkClientService.request<ListmonkCampaign>(
      {
        method: 'PUT',
        path: `/api/campaigns/${campaignId}/status`,
        body: { status },
      },
    );

    return mapListmonkCampaign(campaign);
  }

  async deleteDraft(workspaceId: string, campaignId: number): Promise<boolean> {
    this.assertAvailable(workspaceId);

    const campaign = await this.listmonkClientService.request<ListmonkCampaign>(
      { method: 'GET', path: `/api/campaigns/${campaignId}` },
    );

    if (campaign.status !== 'draft') {
      throw new UserInputError('Only drafts can be deleted', {
        userFriendlyMessage: msg`Only draft campaigns can be deleted. Cancel a running one instead.`,
      });
    }

    await this.listmonkClientService.request({
      method: 'DELETE',
      path: `/api/campaigns/${campaignId}`,
    });

    return true;
  }

  private async getVerifiedDomains(workspaceId: string): Promise<string[]> {
    const { domains } =
      await this.sendingDomainService.listSendingDomains(workspaceId);

    return domains
      .filter((domain) => domain.status === 'verified')
      .map((domain) => domain.domain);
  }

  private isAvailable(workspaceId: string): boolean {
    return (
      isFlolabsMailWorkspace(workspaceId) &&
      this.listmonkClientService.isConfigured()
    );
  }

  private assertAvailable(workspaceId: string): void {
    if (!this.isAvailable(workspaceId)) {
      throw new UserInputError('Campaigns are not set up', {
        userFriendlyMessage: msg`Campaigns are not set up on this server.`,
      });
    }
  }
}
