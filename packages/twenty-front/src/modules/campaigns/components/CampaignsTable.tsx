import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme';

import { CampaignRowActions } from '@/campaigns/components/CampaignRowActions';
import { CampaignStatusChip } from '@/campaigns/components/CampaignStatusChip';
import { type Campaign } from '@/campaigns/types/Campaign';
import { Table } from '@/ui/layout/table/components/Table';
import { TableCell } from '@/ui/layout/table/components/TableCell';
import { TableHeader } from '@/ui/layout/table/components/TableHeader';
import { TableRow } from '@/ui/layout/table/components/TableRow';

const GRID_COLUMNS =
  'minmax(0, 2fr) 96px minmax(0, 1fr) 80px 64px 64px 72px minmax(260px, 1.4fr)';

const StyledName = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StyledSubject = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

type CampaignsTableProps = {
  campaigns: Campaign[];
  onChanged: () => void;
};

export const CampaignsTable = ({
  campaigns,
  onChanged,
}: CampaignsTableProps) => {
  const { t } = useLingui();

  return (
    <Table>
      <TableRow gridAutoColumns={GRID_COLUMNS}>
        <TableHeader>{t`Campaign`}</TableHeader>
        <TableHeader>{t`Status`}</TableHeader>
        <TableHeader>{t`Audience`}</TableHeader>
        <TableHeader align="right">{t`Sent`}</TableHeader>
        <TableHeader align="right">{t`Opens`}</TableHeader>
        <TableHeader align="right">{t`Clicks`}</TableHeader>
        <TableHeader align="right">{t`Bounces`}</TableHeader>
        <TableHeader />
      </TableRow>
      {campaigns.map((campaign) => (
        <TableRow key={campaign.id} gridAutoColumns={GRID_COLUMNS}>
          <TableCell overflow="hidden">
            <StyledName>
              <span>{campaign.name}</span>
              <StyledSubject>{campaign.subject}</StyledSubject>
            </StyledName>
          </TableCell>
          <TableCell>
            <CampaignStatusChip status={campaign.status} />
          </TableCell>
          <TableCell
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {campaign.listNames.join(', ')}
          </TableCell>
          <TableCell align="right">
            {campaign.sent}/{campaign.toSend}
          </TableCell>
          <TableCell align="right">{campaign.views}</TableCell>
          <TableCell align="right">{campaign.clicks}</TableCell>
          <TableCell align="right">{campaign.bounces}</TableCell>
          <TableCell align="right">
            <CampaignRowActions campaign={campaign} onChanged={onChanged} />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
};
