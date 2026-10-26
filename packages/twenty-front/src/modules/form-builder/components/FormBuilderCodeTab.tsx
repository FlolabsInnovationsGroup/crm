import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import {
  buildPublicFormFieldsMarkup,
  type PublicFormDefinition,
} from 'twenty-shared/utils';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { importFormHtml } from '@/form-builder/utils/importFormHtml';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
`;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledText = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledList = styled.ul`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding-inline-start: ${themeCssVariables.spacing[4]};

  code {
    font-size: ${themeCssVariables.font.size.xs};
  }
`;

const StyledButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledStatus = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

type FormBuilderCodeTabProps = {
  definition: PublicFormDefinition;
  onChange: (definition: PublicFormDefinition) => void;
};

export const FormBuilderCodeTab = ({
  definition,
  onChange,
}: FormBuilderCodeTabProps) => {
  const [importDraft, setImportDraft] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const code = definition.code ?? {};

  const updateCode = (
    changes: Partial<NonNullable<PublicFormDefinition['code']>>,
  ) => {
    const nextCode = { ...code, ...changes };
    const hasCode =
      isNonEmptyString(nextCode.html) || isNonEmptyString(nextCode.js);

    onChange({ ...definition, code: hasCode ? nextCode : undefined });
  };

  const handleImport = () => {
    const imported = importFormHtml(importDraft);

    if (imported.fields.length === 0) {
      setImportStatus(t`No inputs were found in this code.`);

      return;
    }

    onChange({
      ...definition,
      fields: imported.fields,
      code: { ...code, html: imported.html },
    });
    setImportDraft('');
    setImportStatus(
      t`Imported ${imported.fields.length} fields. Check them in the Fields tab and pick where each answer is saved.`,
    );
  };

  return (
    <StyledContainer>
      <StyledSection>
        <StyledTitle>{t`Your own HTML`}</StyledTitle>
        <StyledText>
          {t`Replaces the generated fields with your markup. Logic, validation, emails and the CRM keep working.`}
        </StyledText>
        <StyledList>
          <li>{t`Give every input the name of its field id.`}</li>
          <li>
            {t`Wrap a question in an element with data-field-id to show or hide it with conditions.`}
          </li>
          <li>{t`Add an element with data-error-for to show its error message.`}</li>
          <li>{t`The Back, Next and Submit buttons are added for you.`}</li>
        </StyledList>
        <StyledButtons>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateCode({ html: buildPublicFormFieldsMarkup(definition) })
            }
          >
            {t`Start from the current fields`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!isNonEmptyString(code.html)}
            onClick={() => updateCode({ html: undefined })}
          >
            {t`Use the generated fields again`}
          </Button>
        </StyledButtons>
        <FormBuilderTextarea
          isMonospace
          maxRows={24}
          ariaLabel={t`HTML`}
          value={code.html ?? ''}
          placeholder={'<div data-field-id="email">…</div>'}
          onChange={(html) => updateCode({ html: html || undefined })}
        />
      </StyledSection>

      <StyledSection>
        <StyledTitle>{t`CSS`}</StyledTitle>
        <StyledText>
          {t`Applies to generated and custom markup. Classes include .ff-card, .ff-title, .ff-input, .ff-choice and .ff-submit.`}
        </StyledText>
        <FormBuilderTextarea
          isMonospace
          maxRows={20}
          ariaLabel={t`CSS`}
          value={definition.theme.customCss ?? ''}
          placeholder=".ff-title { letter-spacing: 0; }"
          onChange={(customCss) =>
            onChange({
              ...definition,
              theme: { ...definition.theme, customCss: customCss || undefined },
            })
          }
        />
      </StyledSection>

      <StyledSection>
        <StyledTitle>{t`JavaScript`}</StyledTitle>
        <StyledText>
          {t`Runs on the form page after it loads, isolated from the CRM. window.flolabsForm gives the answers; listen to the flolabs:submitted and flolabs:step events.`}
        </StyledText>
        <FormBuilderTextarea
          isMonospace
          maxRows={20}
          ariaLabel={t`JavaScript`}
          value={code.js ?? ''}
          placeholder={
            "window.addEventListener('flolabs:submitted', (event) => console.log(event.detail));"
          }
          onChange={(js) => updateCode({ js: js || undefined })}
        />
      </StyledSection>

      <StyledSection>
        <StyledTitle>{t`Import a form`}</StyledTitle>
        <StyledText>
          {t`Paste the HTML of an existing form. Its inputs become fields and its markup becomes your HTML. This replaces the current fields.`}
        </StyledText>
        <FormBuilderFieldRow label={t`Form code`}>
          <FormBuilderTextarea
            isMonospace
            maxRows={12}
            ariaLabel={t`Form code`}
            value={importDraft}
            placeholder={'<form>…</form>'}
            onChange={setImportDraft}
          />
        </FormBuilderFieldRow>
        <StyledButtons>
          <Button
            variant="solid"
            size="sm"
            disabled={!isNonEmptyString(importDraft.trim())}
            onClick={handleImport}
          >
            {t`Import and replace fields`}
          </Button>
        </StyledButtons>
        {isNonEmptyString(importStatus) && (
          <StyledStatus>{importStatus}</StyledStatus>
        )}
      </StyledSection>
    </StyledContainer>
  );
};
