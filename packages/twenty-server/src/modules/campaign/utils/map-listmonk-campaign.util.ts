import { type CampaignDTO } from 'src/modules/campaign/dtos/campaign.dto';
import { type CampaignStatus } from 'src/modules/campaign/types/campaign-status.type';
import { type ListmonkCampaign } from 'src/modules/campaign/types/listmonk.type';

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  'draft',
  'scheduled',
  'running',
  'paused',
  'cancelled',
  'finished',
];

const isCampaignStatus = (status: string): status is CampaignStatus =>
  CAMPAIGN_STATUSES.includes(status as CampaignStatus);

export const mapListmonkCampaign = (
  campaign: ListmonkCampaign,
): CampaignDTO => ({
  id: campaign.id,
  name: campaign.name,
  subject: campaign.subject,
  fromEmail: campaign.from_email,
  status: isCampaignStatus(campaign.status) ? campaign.status : 'draft',
  listNames: (campaign.lists ?? []).map((list) => list.name),
  toSend: campaign.to_send,
  sent: campaign.sent,
  views: campaign.views,
  clicks: campaign.clicks,
  bounces: campaign.bounces,
  createdAt: campaign.created_at,
  startedAt: campaign.started_at,
});
