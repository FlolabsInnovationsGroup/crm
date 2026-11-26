import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { GET_INBOX_THREADS } from '@/team-inbox/graphql/getInboxThreads';
import { GET_MANUAL_REVIEW_HISTORY } from '@/team-inbox/graphql/getManualReviewHistory';
import { type InboxThread } from '@/team-inbox/types/InboxThread';
import { type ManualReviewHistoryEntry } from '@/team-inbox/types/ManualReviewHistoryEntry';
import { buildManualReviewHistoryCsv } from '@/team-inbox/utils/buildManualReviewHistoryCsv';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import {
  parseTeamInboxReviewItem,
  type TeamInboxReviewKind,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { suggestInboxTemplate } from '@/team-inbox/utils/suggestInboxTemplate';
import { toManualReviewHistoryCsvRow } from '@/team-inbox/utils/toManualReviewHistoryCsvRow';
import { type TimelineThreadsWithTotal } from '~/generated/graphql';

// The server's page and batch limits.
const THREADS_PAGE_SIZE = 50;
const HISTORY_BATCH_SIZE = 200;
const MAX_EXPORTED_THREADS = 5000;

type NamedTemplate = { id: string; name: string | null };

export const useManualReviewHistoryExport = (templates: NamedTemplate[]) => {
  const apolloCoreClient = useApolloCoreClient();
  const { enqueueToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const kindLabels: Record<TeamInboxReviewKind, string> = {
    REPLY_TRIAGE: t`Applicant reply`,
    STUCK_APPLICANT: t`Stuck applicant`,
    FORM_1_APPROVAL: t`Form 1 approval`,
    ORIENTATION_APPROVAL: t`Orientation approval`,
    AUTOMATION_NEEDS_ATTENTION: t`Automation issue`,
    AUTOMATION_SENT_NOT_UPDATED: t`Automation issue`,
    AUTOMATION_FIRST_EMAIL_FAILED: t`Automation issue`,
    OTHER: t`Other`,
  };

  const fetchDoneThreads = async (since: string) => {
    const threads: InboxThread[] = [];

    for (let page = 1; threads.length < MAX_EXPORTED_THREADS; page++) {
      const { data } = await apolloCoreClient.query<{
        getInboxThreads: Omit<TimelineThreadsWithTotal, 'timelineThreads'> & {
          timelineThreads: InboxThread[];
        };
      }>({
        query: GET_INBOX_THREADS,
        variables: {
          page,
          pageSize: THREADS_PAGE_SIZE,
          manualReview: true,
          manualReviewDoneSince: since,
        },
        fetchPolicy: 'network-only',
      });

      const pageThreads = data?.getInboxThreads.timelineThreads ?? [];

      threads.push(...pageThreads);

      if (
        pageThreads.length < THREADS_PAGE_SIZE ||
        threads.length >= (data?.getInboxThreads.totalNumberOfThreads ?? 0)
      ) {
        break;
      }
    }

    return threads;
  };

  const fetchHistory = async (
    items: { messageThreadId: string; applicantEmail: string | null }[],
  ) => {
    const entries = new Map<string, ManualReviewHistoryEntry>();

    for (let start = 0; start < items.length; start += HISTORY_BATCH_SIZE) {
      const { data } = await apolloCoreClient.query<{
        getManualReviewHistory: ManualReviewHistoryEntry[];
      }>({
        query: GET_MANUAL_REVIEW_HISTORY,
        variables: { items: items.slice(start, start + HISTORY_BATCH_SIZE) },
        fetchPolicy: 'network-only',
      });

      for (const entry of data?.getManualReviewHistory ?? []) {
        entries.set(entry.messageThreadId, entry);
      }
    }

    return entries;
  };

  const exportHistory = async (since: string) => {
    setIsExporting(true);

    try {
      const threads = await fetchDoneThreads(since);
      const reviewItems = threads.map((thread) => ({
        thread,
        item: parseTeamInboxReviewItem(thread.subject, thread.lastMessageBody),
      }));
      const history = await fetchHistory(
        reviewItems.map(({ thread, item }) => ({
          messageThreadId: thread.id,
          applicantEmail: item.applicantEmail,
        })),
      );

      const csv = buildManualReviewHistoryCsv(
        reviewItems.map(({ thread, item }) =>
          toManualReviewHistoryCsvRow({
            thread,
            item,
            kindLabel: kindLabels[item.kind],
            entry: history.get(thread.id),
            suggestedTemplateName: isDefined(item.triage)
              ? (suggestInboxTemplate({
                  reason: item.triage.reason,
                  replyText: parseManualReviewBody(thread.lastMessageBody)
                    .reply,
                  templates,
                })?.name ?? null)
              : null,
          }),
        ),
        {
          doneAt: t`Marked done at`,
          doneByName: t`Marked done by`,
          applicantEmail: t`Applicant email`,
          kind: t`Type`,
          reason: t`Reason`,
          stage: t`Stage`,
          applicantMessage: t`Their message`,
          suggestedTemplate: t`Suggested template`,
          replyText: t`Our reply`,
          replySentAt: t`Reply sent at`,
          reviewReceivedAt: t`Review email received at`,
        },
      );

      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      );
      const link = document.createElement('a');

      link.href = url;
      link.download = `needs-review-history-${since.slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      enqueueToast({
        status: 'error',
        children: t`Could not export the history. Please try again.`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return { exportHistory, isExporting };
};
