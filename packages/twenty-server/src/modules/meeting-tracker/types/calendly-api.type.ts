// Only the Calendly API v2 fields the meeting tracker reads.
export type CalendlyInvitee = {
  uri: string;
  email?: string | null;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
  event?: string | null;
};

export type CalendlyScheduledEvent = {
  uri: string;
  name?: string | null;
  status?: string | null;
  start_time?: string | null;
  event_memberships?: { user_email?: string | null }[] | null;
};

export type CalendlyCollection<TItem> = {
  collection: TItem[];
  pagination?: { next_page?: string | null } | null;
};
