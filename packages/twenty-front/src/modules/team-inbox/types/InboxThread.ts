import { type TimelineThread } from '~/generated/graphql';

// Fields only the team inbox query asks for.
export type InboxThread = TimelineThread & {
  contactDisplayName?: string | null;
  contactPersonId?: string | null;
};
