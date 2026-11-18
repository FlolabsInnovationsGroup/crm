export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'finished';

export type Campaign = {
  id: number;
  name: string;
  subject: string;
  fromEmail: string;
  status: CampaignStatus;
  listNames: string[];
  toSend: number;
  sent: number;
  views: number;
  clicks: number;
  bounces: number;
  createdAt: string;
  startedAt: string | null;
};

export type CampaignAudience = {
  id: number;
  name: string;
  subscriberCount: number;
};

export type CampaignsOverview = {
  isConfigured: boolean;
  campaigns: Campaign[];
  audiences: CampaignAudience[];
  fromDomains: string[];
};
