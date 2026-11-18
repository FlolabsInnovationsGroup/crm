export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'finished';

export type CampaignStatusChange = 'running' | 'paused' | 'cancelled';
