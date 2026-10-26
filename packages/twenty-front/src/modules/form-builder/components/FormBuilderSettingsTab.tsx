import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { type PublicFormDefinition } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

type FormBuilderSettingsTabProps = {
  definition: PublicFormDefinition;
  onChange: (definition: PublicFormDefinition) => void;
};

export const FormBuilderSettingsTab = ({
  definition,
  onChange,
}: FormBuilderSettingsTabProps) => {
  const { settings } = definition;
  const [phoneCountryDraft, setPhoneCountryDraft] = useState(
    settings.defaultPhoneCountryCode ?? '',
  );

  const updateSettings = (changes: Partial<PublicFormDefinition['settings']>) =>
    onChange({ ...definition, settings: { ...settings, ...changes } });

  return (
    <StyledContainer>
      <FormBuilderFieldRow
        label={t`Title shown to visitors`}
        hint={t`The form name in the list stays internal.`}
      >
        <FormBuilderTextInput
          value={definition.title}
          onChange={(title) => onChange({ ...definition, title })}
        />
      </FormBuilderFieldRow>
      <FormBuilderFieldRow label={t`Introduction`}>
        <FormBuilderTextarea
          value={definition.description ?? ''}
          onChange={(description) =>
            onChange({ ...definition, description: description || undefined })
          }
        />
      </FormBuilderFieldRow>
      <FormBuilderFieldRow label={t`Message after submitting`}>
        <FormBuilderTextarea
          value={settings.successMessage}
          onChange={(successMessage) => updateSettings({ successMessage })}
        />
      </FormBuilderFieldRow>
      <FormBuilderFieldRow
        label={t`Redirect after submitting`}
        hint={t`Optional. Visitors go to this page instead of seeing the message.`}
      >
        <FormBuilderTextInput
          type="url"
          dir="ltr"
          value={settings.redirectUrl ?? ''}
          placeholder="https://…"
          onChange={(redirectUrl) =>
            updateSettings({ redirectUrl: redirectUrl || undefined })
          }
        />
      </FormBuilderFieldRow>
      <StyledGrid>
        <FormBuilderFieldRow
          label={t`Language of built-in texts`}
          hint={t`Error messages and "Sending…".`}
        >
          <FormBuilderNativeSelect
            value={settings.language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ar', label: 'العربية' },
            ]}
            onChange={(language) =>
              updateSettings({
                language:
                  language as PublicFormDefinition['settings']['language'],
              })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow
          label={t`Default phone country`}
          hint={t`Two letters, e.g. EG. Used for numbers typed without +.`}
        >
          <FormBuilderTextInput
            dir="ltr"
            value={phoneCountryDraft}
            placeholder="EG"
            onChange={(value) => {
              const countryCode = value.trim().toUpperCase().slice(0, 2);

              setPhoneCountryDraft(countryCode);

              updateSettings({
                defaultPhoneCountryCode:
                  countryCode.length === 2 ? countryCode : undefined,
              });
            }}
          />
        </FormBuilderFieldRow>
      </StyledGrid>
    </StyledContainer>
  );
};
