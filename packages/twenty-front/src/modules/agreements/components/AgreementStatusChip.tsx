import { useLingui } from '@lingui/react/macro';
import { Status } from 'twenty-ui/primitives/data-display';
import { type ThemeColor } from 'twenty-ui/theme';

import { type AgreementRequestStatus } from '@/agreements/types/Agreement';

type AgreementStatusChipProps = {
  status: AgreementRequestStatus | null;
};

export const AgreementStatusChip = ({ status }: AgreementStatusChipProps) => {
  const { t } = useLingui();

  const display: Record<
    AgreementRequestStatus,
    { label: string; color: ThemeColor }
  > = {
    SENT: { label: t`Waiting for the intern`, color: 'blue' },
    APPLICANT_SIGNED: { label: t`Waiting for FloLabs`, color: 'purple' },
    COMPLETED: { label: t`Signed`, color: 'green' },
    REJECTED: { label: t`Declined`, color: 'red' },
    CANCELLED: { label: t`Cancelled`, color: 'gray' },
  };

  if (status === null) {
    return null;
  }

  return <Status color={display[status].color}>{display[status].label}</Status>;
};
