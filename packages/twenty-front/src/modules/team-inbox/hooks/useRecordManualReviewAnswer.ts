import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_MANUAL_REVIEW_HISTORY } from '@/team-inbox/graphql/getManualReviewHistory';
import { RECORD_MANUAL_REVIEW_ANSWER } from '@/team-inbox/graphql/recordManualReviewAnswer';
import { type ManualReviewHistoryEntry } from '@/team-inbox/types/ManualReviewHistoryEntry';
import { type ManualReviewAnswerContext } from '@/team-inbox/utils/buildManualReviewAnswerContext';

// Saving the answer never undoes the Done itself; a failure only warns.
export const useRecordManualReviewAnswer = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();
  const [recordAnswerMutation] = useMutation(RECORD_MANUAL_REVIEW_ANSWER, {
    client: apolloCoreClient,
  });

  const record = async (
    context: ManualReviewAnswerContext,
    {
      answer,
      templateName,
      source,
    }: {
      answer: string | null;
      templateName: string | null;
      source: 'REPLY_FROM_CARD' | 'MARKED_DONE';
    },
  ) => {
    try {
      await recordAnswerMutation({
        variables: {
          input: {
            reviewThreadId: context.reviewThreadId,
            applicantEmail: context.applicantEmail,
            question: context.question,
            category: context.category,
            answer,
            templateName,
            source,
          },
        },
      });
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Marked done, but the answer could not be saved to Manual review answers.`,
      });
    }
  };

  const recordFromReply = (
    context: ManualReviewAnswerContext,
    answer: string,
    templateName: string | null,
  ) => record(context, { answer, templateName, source: 'REPLY_FROM_CARD' });

  // A card marked done by hand takes the reply our mailboxes sent the
  // applicant before Done, the same way the history export finds it.
  const recordFromDone = async (context: ManualReviewAnswerContext) => {
    let answer: string | null = null;

    try {
      const { data } = await apolloCoreClient.query<{
        getManualReviewHistory: ManualReviewHistoryEntry[];
      }>({
        query: GET_MANUAL_REVIEW_HISTORY,
        variables: {
          items: [
            {
              messageThreadId: context.reviewThreadId,
              applicantEmail: context.applicantEmail,
            },
          ],
        },
        fetchPolicy: 'network-only',
      });

      answer = data?.getManualReviewHistory[0]?.replyText ?? null;
    } catch {
      answer = null;
    }

    await record(context, {
      answer,
      templateName: null,
      source: 'MARKED_DONE',
    });
  };

  return { recordFromReply, recordFromDone };
};
