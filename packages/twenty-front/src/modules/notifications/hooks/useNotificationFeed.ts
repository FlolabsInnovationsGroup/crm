import { useQuery } from '@apollo/client/react';
import { t } from '@lingui/core/macro';
import { type PublicFormAnswers, isDefined } from 'twenty-shared/utils';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import {
  GET_NOTIFICATION_FORM_DEFINITIONS,
  GET_NOTIFICATION_FORM_SUBMISSIONS,
  GET_NOTIFICATION_TASKS,
} from '@/notifications/graphql/notificationQueries';
import { type FormBuilderRecord } from '@/form-builder/types/FormBuilderRecord';
import { parseStoredFormDefinition } from '@/form-builder/utils/parseStoredFormDefinition';
import { buildNotificationItems } from '@/notifications/utils/buildNotificationItems';
import { getFormSubmissionDetail } from '@/notifications/utils/getFormSubmissionDetail';
import { getThreadContactName } from '@/team-inbox/utils/getThreadContactName';
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
      formId: string | null;
      answers: PublicFormAnswers | null;
    }>;
  }>(GET_NOTIFICATION_FORM_SUBMISSIONS, {
    ...pollingOptions,
    skip: !hasFormSubmissions,
  });

  const submissionFormIds = [
    ...new Set(
      (formData?.formSubmissions.edges ?? [])
        .map(({ node }) => node.formId)
        .filter(isDefined),
    ),
  ].sort();

  // Sorted ids keep the variables stable, so polling does not refetch the
  // definitions. A plain query, because this hook runs before metadata loads.
  const { data: formDefinitionData } = useQuery<{
    crmForms: Connection<FormBuilderRecord>;
  }>(GET_NOTIFICATION_FORM_DEFINITIONS, {
    client: apolloCoreClient,
    variables: { formIds: submissionFormIds },
    skip: submissionFormIds.length === 0,
  });

  const forms = (formDefinitionData?.crmForms.edges ?? []).map(
    ({ node }) => node,
  );

  const definitionByFormId = new Map(
    forms.map((form) => [
      form.id,
      parseStoredFormDefinition(form.definition, form.name ?? ''),
    ]),
  );

  const getSubmissionDetail = (
    formId: string | null,
    answers: PublicFormAnswers | null,
  ) => {
    const definition = isDefined(formId)
      ? definitionByFormId.get(formId)
      : undefined;

    return isDefined(definition) && isDefined(answers)
      ? getFormSubmissionDetail(definition, answers)
      : '';
  };

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
        contactName: getThreadContactName(thread),
      }),
    ),
    formSubmissions: (formData?.formSubmissions.edges ?? []).map(
      ({ node }) => ({
        id: node.id,
        createdAt: node.createdAt,
        label: node.name ?? '',
        detail: getSubmissionDetail(node.formId, node.answers),
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
