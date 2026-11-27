import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useSearchParams } from 'react-router-dom';
import { Section } from 'twenty-ui/components/layout';
import { IconSignature } from 'twenty-ui/icon';
import { themeCssVariables, useTheme } from 'twenty-ui/theme';

import { AgreementRequestsTable } from '@/agreements/components/AgreementRequestsTable';
import { AgreementSendForm } from '@/agreements/components/AgreementSendForm';
import {
  useAgreementPerson,
  useAgreementRequests,
} from '@/agreements/hooks/useAgreementData';
import { useAreAgreementsSetUp } from '@/agreements/hooks/useAreAgreementsSetUp';
import { ToastOnQueryErrorEffect } from '@/apollo/components/ToastOnQueryErrorEffect';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[6]};
`;

export const AgreementsPage = () => {
  const theme = useTheme();
  const isSetUp = useAreAgreementsSetUp();
  const [searchParams] = useSearchParams();
  const initialPerson = useAgreementPerson(searchParams.get('personId'));
  const { requests, loading, error, refetch } = useAgreementRequests();

  const handleChanged = () => {
    refetch().catch(() => undefined);
  };

  return (
    <>
      <PageTitle title={t`Agreements`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconSignature
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Agreements`}
          />
        }
      >
        <ToastOnQueryErrorEffect error={error} />
        <StyledContent>
          {!isSetUp && (
            <Section.Root>
              <Section.Header
                title={t`Agreements are not set up`}
                description={t`An administrator needs to run the agreement setup first.`}
              />
            </Section.Root>
          )}
          {isSetUp && (
            <AgreementSendForm
              key={initialPerson?.id ?? 'no-person'}
              initialPerson={initialPerson}
              onSent={handleChanged}
            />
          )}
          {isSetUp && (
            <Section.Root>
              <Section.Header
                title={t`Recent agreements`}
                description={t`The 50 most recent. Signed files are attached to the person.`}
              />
              {loading && requests.length === 0 ? (
                <span>{t`Loading…`}</span>
              ) : requests.length > 0 ? (
                <AgreementRequestsTable
                  requests={requests}
                  onChanged={handleChanged}
                />
              ) : (
                <span>{t`Nothing sent yet.`}</span>
              )}
            </Section.Root>
          )}
        </StyledContent>
      </PageCardLayout>
    </>
  );
};
