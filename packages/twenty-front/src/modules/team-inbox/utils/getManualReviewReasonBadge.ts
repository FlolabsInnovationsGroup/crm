import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';

import { type TeamInboxReviewItem } from '@/team-inbox/utils/parseTeamInboxReviewItem';

export const getManualReviewReasonBadge = (
  item: TeamInboxReviewItem,
): { label: string; tone: 'warn' | 'quiet' } | null => {
  switch (item.kind) {
    case 'REPLY_TRIAGE': {
      const reason = item.triage?.reason ?? '';

      if (!isNonEmptyString(reason)) {
        return null;
      }

      return reason === 'question'
        ? { label: t`Question`, tone: 'warn' }
        : reason === 'not interested'
          ? { label: t`Not interested`, tone: 'quiet' }
          : { label: reason, tone: 'warn' };
    }
    case 'STUCK_APPLICANT':
      return { label: t`Stuck`, tone: 'warn' };
    case 'FORM_1_APPROVAL':
      return { label: t`Form 1 approval`, tone: 'warn' };
    case 'ORIENTATION_APPROVAL':
      return { label: t`Orientation approval`, tone: 'warn' };
    case 'OTHER':
      return null;
    default:
      return { label: t`Automation issue`, tone: 'warn' };
  }
};
