import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { IconChevronDown, IconDownload } from 'twenty-ui/icon';

import { TeamInboxMenu } from '@/team-inbox/components/TeamInboxMenu';
import { MANUAL_REVIEW_HISTORY_PERIODS } from '@/team-inbox/constants/ManualReviewHistoryPeriods';
import { type ManualReviewHistoryPeriod } from '@/team-inbox/types/ManualReviewHistoryPeriod';

const StyledBar = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;
`;

const StyledChipButton = styled.button`
  align-items: center;
  background: var(--fl-chip);
  border: none;
  border-radius: 8px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 13px;
  gap: 6px;
  padding: 7px 10px;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

type TeamInboxReviewHistoryBarProps = {
  period: ManualReviewHistoryPeriod;
  isExporting: boolean;
  onPeriodChange: (period: ManualReviewHistoryPeriod) => void;
  onExport: () => void;
};

export const TeamInboxReviewHistoryBar = ({
  period,
  isExporting,
  onPeriodChange,
  onExport,
}: TeamInboxReviewHistoryBarProps) => {
  const periodLabels: Record<ManualReviewHistoryPeriod, string> = {
    TODAY: t`Today`,
    LAST_7_DAYS: t`Last 7 days`,
    LAST_30_DAYS: t`Last 30 days`,
  };

  return (
    <StyledBar>
      <TeamInboxMenu
        dropdownId="team-inbox-review-history-period"
        placement="bottom-end"
        selectedValue={period}
        items={MANUAL_REVIEW_HISTORY_PERIODS.map((value) => ({
          value,
          label: periodLabels[value],
        }))}
        onSelect={(value) => {
          const selectedPeriod = MANUAL_REVIEW_HISTORY_PERIODS.find(
            (candidate) => candidate === value,
          );

          if (isDefined(selectedPeriod)) {
            onPeriodChange(selectedPeriod);
          }
        }}
        trigger={
          <StyledChipButton type="button" title={t`Period`}>
            <span>{periodLabels[period]}</span>
            <IconChevronDown size={14} />
          </StyledChipButton>
        }
      />
      <StyledChipButton type="button" disabled={isExporting} onClick={onExport}>
        <IconDownload size={14} />
        <span>{isExporting ? t`Exporting…` : t`Export CSV`}</span>
      </StyledChipButton>
    </StyledBar>
  );
};
