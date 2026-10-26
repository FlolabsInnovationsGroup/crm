import { useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  GET_NOTIFICATION_FORM_SUBMISSIONS,
  GET_NOTIFICATION_TASKS,
} from '@/notifications/graphql/notificationQueries';
import { buildNotificationItems } from '@/notifications/utils/buildNotificationItems';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

const POLL_INTERVAL_MS = 60_000;
const FEED_PAGE_SIZE = 15;

type Connection<TNode> = { edges: { node: TNode }[] };

export const useNotificationFeed = () => {
  const apolloCoreClient = useApolloCoreClient();
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasFormSubmissions = objectMetadataItems.some(
    (item) => item.nameSingular === 'formSubmission' && item.isActive,
  );

  // Polling pauses while the tab is hidden.
  const pollingOptions = {
    client: apolloCoreClient,
    pollInterval: POLL_INTERVAL_MS,
    skipPollAttempt: () => document.hidden,
  };

  const { data: inboxData } = useQuery<{
    getInboxThreads: TimelineThreadsWithTotal;
  }>(GET_INBOX_THREADS, {
    ...pollingOptions,
    variables: { page: 1, pageSize: FEED_PAGE_SIZE, direction: 'INCOMING' },
  });

  const { data: formData } = useQuery<{
    formSubmissions: Connection<{
      id: string;
      name: string | null;
      createdAt: string;
    }>;
  }>(GET_NOTIFICATION_FORM_SUBMISSIONS, {
    ...pollingOptions,
    skip: !hasFormSubmissions,
  });

  const { data: taskData } = useQuery<{
    tasks: Connection<{ id: string; title: string | null; createdAt: string }>;
  }>(GET_NOTIFICATION_TASKS, {
    ...pollingOptions,
    skip: !isDefined(currentWorkspaceMember?.id),
    variables: { assigneeId: currentWorkspaceMember?.id },
  });

  return buildNotificationItems({
    incomingThreads: (inboxData?.getInboxThreads.timelineThreads ?? []).map(
      (thread) => ({
        id: thread.id,
        subject: thread.subject,
        lastMessageReceivedAt: thread.lastMessageReceivedAt,
        firstParticipant: { displayName: thread.firstParticipant.displayName },
      }),
    ),
    formSubmissions: (formData?.formSubmissions.edges ?? []).map(
      ({ node }) => ({
        id: node.id,
        createdAt: node.createdAt,
        label: node.name ?? '',
      }),
    ),
    tasks: (taskData?.tasks.edges ?? []).map(({ node }) => ({
      id: node.id,
      createdAt: node.createdAt,
      label: node.title ?? '',
    })),
    labels: {
      formSubmission: t`New form submission`,
      task: t`Task assigned to you`,
    },
  });
};
