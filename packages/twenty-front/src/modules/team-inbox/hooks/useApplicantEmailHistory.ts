import { useQuery } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import { useReplyContext } from '@/activities/emails/hooks/useReplyContext';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_APPLICANT_EMAIL_HISTORY } from '@/team-inbox/graphql/getApplicantEmailHistory';
import { type ApplicantEmailHistoryMessage } from '@/team-inbox/types/ApplicantEmailHistoryMessage';
import { buildApplicantHistoryReplyContext } from '@/team-inbox/utils/buildApplicantHistoryReplyContext';
import { pickApplicantHistoryReplyTarget } from '@/team-inbox/utils/pickApplicantHistoryReplyTarget';

// Every email to or from the applicant across threads, oldest first. The
// server applies the inbox's mailbox sharing rules.
export const useApplicantEmailHistory = ({
  applicantEmail,
  personId,
  ownHandles,
  skip,
}: {
  applicantEmail: string;
  personId: string | null;
  ownHandles: string[];
  skip: boolean;
}) => {
  const apolloCoreClient = useApolloCoreClient();
  const { data, loading, error } = useQuery<{
    getApplicantEmailHistory: {
      messages: ApplicantEmailHistoryMessage[];
      isTruncated: boolean;
    };
  }>(GET_APPLICANT_EMAIL_HISTORY, {
    client: apolloCoreClient,
    variables: { applicantEmail, personId },
    skip,
    fetchPolicy: 'cache-and-network',
  });

  const messages = data?.getApplicantEmailHistory.messages ?? [];
  const replyTarget = skip ? null : pickApplicantHistoryReplyTarget(messages);
  const threadReplyContext = useReplyContext(
    replyTarget?.messageThreadId ?? null,
  );

  return {
    messages,
    isTruncated: data?.getApplicantEmailHistory.isTruncated ?? false,
    isLoading: loading && !isDefined(data),
    hasFailed: isDefined(error),
    replyContext: buildApplicantHistoryReplyContext(
      threadReplyContext,
      replyTarget,
      { applicantEmail, ownHandles },
    ),
  };
};
