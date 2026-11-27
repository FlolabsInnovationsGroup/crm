import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { IconSend, IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { AgreementStatusChip } from '@/agreements/components/AgreementStatusChip';
import {
  RESEND_AGREEMENT_EMAIL,
  SYNC_AGREEMENT_REQUEST,
} from '@/agreements/graphql/agreementMutations';
import { useAgreementMutation } from '@/agreements/hooks/useAgreementMutation';
import { type AgreementRequest } from '@/agreements/types/Agreement';
import { getAgreementPersonLabel } from '@/agreements/utils/getAgreementPersonLabel';
import { Table } from '@/ui/layout/table/components/Table';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const GRID_COLUMNS =
  'minmax(0, 1.2fr) minmax(0, 1.5fr) 168px 112px minmax(240px, 1fr)';

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
`;

const StyledLink = styled(Link)`
  color: ${themeCssVariables.font.color.primary};
  overflow: hidden;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`;

type AgreementRequestRowActionsProps = {
  request: AgreementRequest;
  onChanged: () => void;
};

const AgreementRequestRowActions = ({
  request,
  onChanged,
}: AgreementRequestRowActionsProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const variables = { agreementRequestId: request.id };
  const resend = useAgreementMutation<{ resendAgreementEmail: string }>(
    RESEND_AGREEMENT_EMAIL,
  );
  const sync = useAgreementMutation<{ syncAgreementRequest: string | null }>(
    SYNC_AGREEMENT_REQUEST,
  );
  const isWaiting =
    request.status === 'SENT' || request.status === 'APPLICANT_SIGNED';

  const handleResend = async () => {
    const result = await resend.run(variables);

    if (result !== null) {
      const recipient = result.resendAgreementEmail;

      enqueueToast({
        status: 'success',
        children: t`Link sent again to ${recipient}.`,
      });
    }
  };

  const handleSync = async () => {
    if ((await sync.run(variables)) !== null) {
      onChanged();
    }
  };

  return (
    <StyledActions>
      {isWaiting && (
        <Button
          size="sm"
          variant="ghost"
          startIcon={<IconSend />}
          loading={resend.loading}
          onClick={handleResend}
        >{t`Resend email`}</Button>
      )}
      {request.status !== 'COMPLETED' && (
        <Button
          size="sm"
          variant="ghost"
          startIcon={<IconRefresh />}
          loading={sync.loading}
          onClick={handleSync}
        >{t`Check status`}</Button>
      )}
    </StyledActions>
  );
};

type AgreementRequestsTableProps = {
  requests: AgreementRequest[];
  onChanged: () => void;
};

export const AgreementRequestsTable = ({
  requests,
  onChanged,
}: AgreementRequestsTableProps) => {
  const { t } = useLingui();

  return (
    <Table>
      <TableRow gridAutoColumns={GRID_COLUMNS}>
        <TableHeader>{t`Person`}</TableHeader>
        <TableHeader>{t`Documents`}</TableHeader>
        <TableHeader>{t`Status`}</TableHeader>
        <TableHeader>{t`Sent`}</TableHeader>
        <TableHeader />
      </TableRow>
      {requests.map((request) => (
        <TableRow key={request.id} gridAutoColumns={GRID_COLUMNS}>
          <TableCell overflow="hidden">
            {request.person !== null ? (
              <StyledLink
                to={getAppPath(AppPath.RecordShowPage, {
                  objectNameSingular: 'person',
                  objectRecordId: request.person.id,
                })}
              >
                {getAgreementPersonLabel(request.person)}
              </StyledLink>
            ) : (
              t`Deleted person`
            )}
          </TableCell>
          <TableCell
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {(request.documents ?? '').split('\n').join(', ')}
          </TableCell>
          <TableCell>
            <AgreementStatusChip status={request.status} />
          </TableCell>
          <TableCell>
            {request.sentAt !== null
              ? beautifyPastDateRelativeToNow(request.sentAt)
              : '—'}
          </TableCell>
          <TableCell align="right">
            <AgreementRequestRowActions
              request={request}
              onChanged={onChanged}
            />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
};
