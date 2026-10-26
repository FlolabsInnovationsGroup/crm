import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
  type PublicFormDefinition,
} from 'twenty-shared/utils';
import { IconDownload } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { GET_PUBLIC_FORM_STATS } from '@/form-builder/graphql/getPublicFormStats';
import { type FormSubmissionRecord } from '@/form-builder/types/FormSubmissionRecord';
import { buildFormResponsesCsv } from '@/form-builder/utils/buildFormResponsesCsv';
import { getFormResponseColumns } from '@/form-builder/utils/getFormResponseColumns';
import { getFormResponseValue } from '@/form-builder/utils/getFormResponseValue';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const PAGE_SIZE = 50;

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledStats = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(4, minmax(0, 1fr));
`;

const StyledStat = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatValue = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-variant-numeric: tabular-nums;
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledStatLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledFunnel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledFunnelRow = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 96px minmax(0, 1fr) 56px;
`;

const StyledBarTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: ${themeCssVariables.border.radius.sm};
  height: 8px;
  overflow: hidden;
`;

const StyledBar = styled.div`
  background: ${themeCssVariables.color.blue};
  height: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledTableWrapper = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  overflow-x: auto;
`;

const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 100%;

  th,
  td {
    border-bottom: 1px solid ${themeCssVariables.border.color.light};
    max-width: 240px;
    overflow: hidden;
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  th {
    background: ${themeCssVariables.background.secondary};
    color: ${themeCssVariables.font.color.tertiary};
    font-weight: ${themeCssVariables.font.weight.medium};
    position: sticky;
    top: 0;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  margin: ${themeCssVariables.spacing[6]} 0;
  text-align: center;
`;

const toPercent = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : '–';

type FormBuilderResponsesTabProps = {
  formId: string;
  definition: PublicFormDefinition;
};

export const FormBuilderResponsesTab = ({
  formId,
  definition,
}: FormBuilderResponsesTabProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { data: statsData } = useQuery<{
    getPublicFormStats: {
      views: number;
      starts: number;
      stepReaches: number[];
    };
  }>(GET_PUBLIC_FORM_STATS, {
    variables: { formId },
    fetchPolicy: 'cache-and-network',
  });

  const {
    records: submissions,
    totalCount,
    hasNextPage,
    fetchMoreRecords,
    loading,
  } = useFindManyRecords<FormSubmissionRecord & { __typename: string }>({
    objectNameSingular: PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
    filter: { formId: { eq: formId } },
    orderBy: [{ createdAt: 'DescNullsLast' }],
    limit: PAGE_SIZE,
    recordGqlFields: {
      id: true,
      answers: true,
      createdAt: true,
      sourceUrl: true,
      person: {
        id: true,
        name: { firstName: true, lastName: true },
        emails: { primaryEmail: true },
      },
    },
  });

  const columns = getFormResponseColumns(definition);
  const stats = statsData?.getPublicFormStats;
  const submissionCount = totalCount ?? submissions.length;
  const views = stats?.views ?? 0;

  const downloadCsv = () => {
    const csv = buildFormResponsesCsv(definition, submissions, {
      submittedAt: t`Submitted at`,
      source: t`Source page`,
    });
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');

    link.href = url;
    link.download = `${definition.title || 'form'}-responses.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const stepReaches = stats?.stepReaches ?? [];

  return (
    <StyledContainer>
      <StyledStats>
        <StyledStat>
          <StyledStatValue>{views}</StyledStatValue>
          <StyledStatLabel>{t`Views`}</StyledStatLabel>
        </StyledStat>
        <StyledStat>
          <StyledStatValue>{stats?.starts ?? 0}</StyledStatValue>
          <StyledStatLabel>{t`Started`}</StyledStatLabel>
        </StyledStat>
        <StyledStat>
          <StyledStatValue>{submissionCount}</StyledStatValue>
          <StyledStatLabel>{t`Submitted`}</StyledStatLabel>
        </StyledStat>
        <StyledStat>
          <StyledStatValue>{toPercent(submissionCount, views)}</StyledStatValue>
          <StyledStatLabel>{t`Completion rate`}</StyledStatLabel>
        </StyledStat>
      </StyledStats>

      {stepReaches.length > 1 && (
        <StyledFunnel>
          {stepReaches.map((count, index) => (
            <StyledFunnelRow key={index}>
              <span>{t`Step ${index + 1}`}</span>
              <StyledBarTrack>
                <StyledBar
                  style={{
                    width: toPercent(
                      count,
                      Math.max(views, stepReaches[0] ?? 0),
                    ),
                  }}
                />
              </StyledBarTrack>
              <span>{count}</span>
            </StyledFunnelRow>
          ))}
        </StyledFunnel>
      )}
      <StyledHint>
        {t`Views and steps are counted from now on; submissions include every answer received.`}
      </StyledHint>

      <StyledHeader>
        <StyledTitle>{t`Responses`}</StyledTitle>
        <Button
          variant="outline"
          size="sm"
          startIcon={<IconDownload size={14} />}
          disabled={submissions.length === 0}
          onClick={downloadCsv}
        >
          {t`Export CSV`}
        </Button>
      </StyledHeader>

      {submissions.length === 0 ? (
        <StyledEmpty>
          {loading ? t`Loading…` : t`No responses yet.`}
        </StyledEmpty>
      ) : (
        <StyledTableWrapper>
          <StyledTable>
            <thead>
              <tr>
                <th>{t`Submitted`}</th>
                {columns.map((column) => (
                  <th key={column.id} dir="auto">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr
                  key={submission.id}
                  onClick={() =>
                    openRecordInSidePanel({
                      recordId: submission.id,
                      objectNameSingular: PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
                    })
                  }
                >
                  <td>{beautifyPastDateRelativeToNow(submission.createdAt)}</td>
                  {columns.map((column) => (
                    <td key={column.id} dir="auto">
                      {getFormResponseValue(
                        definition,
                        submission.answers ?? {},
                        column.id,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </StyledTable>
        </StyledTableWrapper>
      )}
      {hasNextPage && (
        <>
          <StyledHint>
            {t`The export includes the responses shown here. Load more to include older ones.`}
          </StyledHint>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchMoreRecords()}
            >
              {t`Load more`}
            </Button>
          </div>
        </>
      )}
    </StyledContainer>
  );
};
