import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';
import { themeCssVariables } from 'twenty-ui/theme';

import { PREVIEW_AGREEMENT } from '@/agreements/graphql/agreementQueries';
import { type AgreementPreview as AgreementPreviewResult } from '@/agreements/types/Agreement';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

const StyledPreview = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledTitle = styled.span`
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledText = styled.pre`
  color: ${themeCssVariables.font.color.secondary};
  font-family: inherit;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
`;

const StyledMissing = styled.span`
  color: ${themeCssVariables.color.red};
`;

type AgreementPreviewProps = {
  templateId: string;
  personId: string;
};

export const AgreementPreview = ({
  templateId,
  personId,
}: AgreementPreviewProps) => {
  const { t } = useLingui();
  const apolloCoreClient = useApolloCoreClient();
  const { data, loading, error } = useQuery<{
    previewAgreement: AgreementPreviewResult | null;
  }>(PREVIEW_AGREEMENT, {
    client: apolloCoreClient,
    variables: { templateId, personId },
    fetchPolicy: 'network-only',
  });

  if (loading) {
    return <StyledPreview>{t`Preparing the preview…`}</StyledPreview>;
  }

  const preview = data?.previewAgreement;

  if (error !== undefined || preview === null || preview === undefined) {
    return (
      <StyledPreview>
        <StyledMissing>
          {error?.message ??
            t`This template could not be prepared for this person.`}
        </StyledMissing>
      </StyledPreview>
    );
  }

  const missing = preview.missingPlaceholders
    .map((key) => `{{${key}}}`)
    .join(', ');

  return (
    <StyledPreview>
      <StyledTitle>{preview.templateName ?? t`Untitled template`}</StyledTitle>
      {preview.missingPlaceholders.length > 0 && (
        <StyledMissing>
          {t`Still empty: ${missing}. Fill these in on the person, then come back.`}
        </StyledMissing>
      )}
      <StyledText>{preview.text}</StyledText>
    </StyledPreview>
  );
};
