import { useMutation } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { SET_INBOX_THREAD_CLOSED } from '@/team-inbox/graphql/inboxThreadClosed';

export const useInboxThreadClosed = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();

  const [setInboxThreadClosedMutation] = useMutation(SET_INBOX_THREAD_CLOSED, {
    client: apolloCoreClient,
    refetchQueries: ['GetInboxThreads', 'GetInboxUnreadCount'],
    awaitRefetchQueries: true,
  });

  const setThreadClosed = async (
    messageThreadId: string,
    isClosed: boolean,
  ) => {
    try {
      await setInboxThreadClosedMutation({
        variables: { messageThreadId, isClosed },
      });

      return true;
    } catch {
      enqueueToast({
        status: 'error',
        children: isClosed
          ? t`Could not close this conversation. Please try again.`
          : t`Could not reopen this conversation. Please try again.`,
      });

      return false;
    }
  };

  return { setThreadClosed };
};
