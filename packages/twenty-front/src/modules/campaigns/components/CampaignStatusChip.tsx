import { useLingui } from '@lingui/react/macro';
import { Status } from 'twenty-ui/primitives/data-display';
import { type ThemeColor } from 'twenty-ui/theme';

import { type CampaignStatus } from '@/campaigns/types/Campaign';

type CampaignStatusChipProps = {
  status: CampaignStatus;
};

export const CampaignStatusChip = ({ status }: CampaignStatusChipProps) => {
  const { t } = useLingui();

  const display: Record<CampaignStatus, { label: string; color: ThemeColor }> =
    {
      draft: { label: t`Draft`, color: 'gray' },
      scheduled: { label: t`Scheduled`, color: 'blue' },
      running: { label: t`Sending`, color: 'orange' },
      paused: { label: t`Paused`, color: 'yellow' },
      cancelled: { label: t`Cancelled`, color: 'red' },
      finished: { label: t`Sent`, color: 'green' },
    };

  return <Status color={display[status].color}>{display[status].label}</Status>;
};
