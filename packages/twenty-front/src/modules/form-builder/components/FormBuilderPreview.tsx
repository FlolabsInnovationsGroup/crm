import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import {
  buildPublicFormPage,
  publicFormDefinitionSchema,
  type PublicFormDefinition,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';
import { useDebounce } from 'use-debounce';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';

const PREVIEW_DEBOUNCE_MS = 250;

const StyledContainer = styled.div`
  background: ${themeCssVariables.background.secondary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledToolbar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledToolbarSelect = styled.div`
  width: 140px;
`;

const StyledFrameArea = styled.div`
  display: flex;
  flex: 1;
  justify-content: center;
  min-height: 0;
  overflow: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledFrame = styled.iframe<{ width: string }>`
  background: white;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  height: 100%;
  min-height: 600px;
  width: ${({ width }) => width};
`;

const StyledInvalid = styled.div`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
`;

type PreviewDevice = 'desktop' | 'mobile';

type FormBuilderPreviewProps = {
  formId: string;
  definition: PublicFormDefinition;
};

// The preview renders the exact public page; submitting validates the
// answers and shows the success state without sending anything.
export const FormBuilderPreview = ({
  formId,
  definition,
}: FormBuilderPreviewProps) => {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [debouncedDefinition] = useDebounce(definition, PREVIEW_DEBOUNCE_MS);

  const parsedDefinition = useMemo(
    () => publicFormDefinitionSchema.safeParse(debouncedDefinition),
    [debouncedDefinition],
  );

  const [lastValidDocument, setLastValidDocument] = useState<string | null>(
    null,
  );

  const previewDocument = useMemo(
    () =>
      parsedDefinition.success
        ? buildPublicFormPage({
            formId,
            definition: parsedDefinition.data,
            submitUrl: '#',
            isEmbedded: false,
            isPreview: true,
            nonce: 'preview',
          })
        : null,
    [formId, parsedDefinition],
  );

  if (previewDocument !== null && previewDocument !== lastValidDocument) {
    setLastValidDocument(previewDocument);
  }

  const issueMessage = parsedDefinition.success
    ? null
    : (parsedDefinition.error.issues[0]?.message ?? null);

  return (
    <StyledContainer>
      <StyledToolbar>
        <span>{t`Live preview`}</span>
        {issueMessage !== null && (
          <StyledInvalid>{t`Needs a fix before saving: ${issueMessage}`}</StyledInvalid>
        )}
        <StyledToolbarSelect>
          <FormBuilderNativeSelect
            value={device}
            ariaLabel={t`Preview size`}
            options={[
              { value: 'desktop', label: t`Desktop` },
              { value: 'mobile', label: t`Phone` },
            ]}
            onChange={(value) => setDevice(value as PreviewDevice)}
          />
        </StyledToolbarSelect>
      </StyledToolbar>
      <StyledFrameArea>
        <StyledFrame
          title={t`Form preview`}
          sandbox="allow-scripts allow-forms"
          width={device === 'mobile' ? '390px' : '100%'}
          srcDoc={previewDocument ?? lastValidDocument ?? ''}
        />
      </StyledFrameArea>
    </StyledContainer>
  );
};
