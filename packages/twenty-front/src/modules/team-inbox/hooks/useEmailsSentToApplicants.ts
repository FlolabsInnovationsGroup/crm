import { useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_EMAILS_SENT_TO_APPLICANTS } from '@/team-inbox/graphql/getEmailsSentToApplicants';
import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';
import { type EmailSentToApplicantItem } from '@/team-inbox/types/EmailSentToApplicantItem';

// The server accepts this many cards per request.
const MAX_ITEMS = 500;

// Keyed by the card's review thread. The server picks the newest email our
// mailboxes sent each applicant after their card, leaving out drafts,
// campaigns and mailboxes this member cannot read.
export const useEmailsSentToApplicants = (
  items: EmailSentToApplicantItem[],
) => {
  const apolloCoreClient = useApolloCoreClient();
  const sortedItems = items
    .slice(0, MAX_ITEMS)
    .sort((first, second) =>
      first.messageThreadId.localeCompare(second.messageThreadId),
    );

  const { data, previousData, loading, error } = useQuery<{
    getEmailsSentToApplicants: EmailSentToApplicant[];
  }>(GET_EMAILS_SENT_TO_APPLICANTS, {
    client: apolloCoreClient,
    variables: { items: sortedItems },
    skip: sortedItems.length === 0,
    // A reply sent outside the card must show without the card list changing.
    fetchPolicy: 'cache-and-network',
  });

  // The last answer stays on screen while a new page of cards is checked.
  const emails = (data ?? previousData)?.getEmailsSentToApplicants ?? [];

  return {
    emailsByThreadId: new Map(
      emails.map((email) => [email.messageThreadId, email]),
    ),
    loading: loading && sortedItems.length > 0,
    hasLoaded: sortedItems.length === 0 || isDefined(data ?? previousData),
    hasFailed: isDefined(error),
  };
};
