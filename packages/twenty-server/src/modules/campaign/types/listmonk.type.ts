// The parts of Listmonk v6.2.0's REST responses the CRM reads.
export type ListmonkCampaign = {
  id: number;
  name: string;
  subject: string;
  from_email: string;
  status: string;
  lists: { id: number; name: string }[] | null;
  to_send: number;
  sent: number;
  views: number;
  clicks: number;
  bounces: number;
  created_at: string;
  started_at: string | null;
};

export type ListmonkCampaignWithContent = ListmonkCampaign & {
  body: string;
  content_type: string;
  messenger: string;
  template_id: number | null;
};

export type ListmonkList = {
  id: number;
  name: string;
  subscriber_count: number;
};

export type ListmonkPage<TItem> = {
  results: TItem[];
};
