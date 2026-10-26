import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, type PublicFormField } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderConditionsEditor } from '@/form-builder/components/FormBuilderConditionsEditor';
import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderOptionsEditor } from '@/form-builder/components/FormBuilderOptionsEditor';
import { FormBuilderSwitchRow } from '@/form-builder/components/FormBuilderSwitchRow';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';

const NO_MAPPING_VALUE = '';

const DECORATIVE_FIELD_TYPES: PublicFormField['type'][] = [
  'heading',
  'paragraph',
  'pageBreak',
];

const PLACEHOLDER_FIELD_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'select',
];

const PREFILLABLE_FIELD_TYPES: PublicFormField['type'][] = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'select',
  'multiSelect',
  'checkbox',
  'hidden',
];

const StyledSettings = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledSection = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding-top: ${themeCssVariables.spacing[4]};
`;

const StyledSectionTitle = styled.h4`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledTwoColumns = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledWarning = styled.p`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledFieldId = styled.code`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
`;

type FormBuilderFieldSettingsProps = {
  field: PublicFormField;
  previousFields: PublicFormField[];
  mappableFields: FormBuilderMappableField[];
  onChange: (field: PublicFormField) => void;
};

export const FormBuilderFieldSettings = ({
  field,
  previousFields,
  mappableFields,
  onChange,
}: FormBuilderFieldSettingsProps) => {
  const update = (changes: Partial<PublicFormField>) =>
    onChange({ ...field, ...changes });

  const compatibleMappableFields = mappableFields.filter((mappableField) =>
    mappableField.compatibleFieldTypes.includes(field.type),
  );
  const mappedField = mappableFields.find(
    (mappableField) => mappableField.value === field.mapTo,
  );
  const crmOptions = mappedField?.options;
  const areOptionValuesLocked = isDefined(crmOptions);
  const unknownOptionValues = areOptionValuesLocked
    ? (field.options ?? []).filter(
        (option) =>
          !crmOptions.some((crmOption) => crmOption.value === option.value),
      )
    : [];

  const handleMappingChange = (mapTo: string) => {
    const nextMappedField = mappableFields.find(
      (mappableField) => mappableField.value === mapTo,
    );

    update({
      mapTo: isNonEmptyString(mapTo) ? mapTo : undefined,
      ...(isDefined(nextMappedField?.options)
        ? { options: nextMappedField.options }
        : {}),
    });
  };

  const isDecorative = DECORATIVE_FIELD_TYPES.includes(field.type);
  const isChoice = field.type === 'select' || field.type === 'multiSelect';

  if (field.type === 'paragraph') {
    return (
      <StyledSettings>
        <FormBuilderFieldRow label={t`Text`}>
          <FormBuilderTextarea
            value={field.description ?? ''}
            onChange={(description) => update({ description })}
          />
        </FormBuilderFieldRow>
        <StyledSection>
          <StyledSectionTitle>{t`Show this block only when`}</StyledSectionTitle>
          <FormBuilderConditionsEditor
            conditions={field.visibleWhen ?? []}
            match={field.visibleWhenMatch}
            previousFields={previousFields}
            onChange={(visibleWhen) => update({ visibleWhen })}
            onMatchChange={(visibleWhenMatch) => update({ visibleWhenMatch })}
          />
        </StyledSection>
      </StyledSettings>
    );
  }

  return (
    <StyledSettings>
      <FormBuilderFieldRow
        label={
          field.type === 'heading'
            ? t`Section title`
            : field.type === 'pageBreak'
              ? t`Page title (optional)`
              : t`Question`
        }
      >
        <FormBuilderTextInput
          value={field.label}
          onChange={(label) => update({ label })}
        />
      </FormBuilderFieldRow>

      {field.type !== 'hidden' && (
        <FormBuilderFieldRow label={isDecorative ? t`Subtitle` : t`Help text`}>
          <FormBuilderTextarea
            value={field.description ?? ''}
            maxRows={4}
            onChange={(description) =>
              update({ description: description || undefined })
            }
          />
        </FormBuilderFieldRow>
      )}

      {PLACEHOLDER_FIELD_TYPES.includes(field.type) && (
        <FormBuilderFieldRow label={t`Placeholder`}>
          <FormBuilderTextInput
            value={field.placeholder ?? ''}
            onChange={(placeholder) =>
              update({ placeholder: placeholder || undefined })
            }
          />
        </FormBuilderFieldRow>
      )}

      {!isDecorative && field.type !== 'hidden' && (
        <StyledTwoColumns>
          <FormBuilderSwitchRow
            label={t`Required`}
            checked={field.required}
            onChange={(required) => update({ required })}
          />
          <FormBuilderNativeSelect
            value={field.width}
            ariaLabel={t`Width`}
            options={[
              { value: 'full', label: t`Full width` },
              { value: 'half', label: t`Half width` },
            ]}
            onChange={(width) =>
              update({ width: width as PublicFormField['width'] })
            }
          />
        </StyledTwoColumns>
      )}

      {isChoice && (
        <StyledSection>
          <StyledSectionTitle>{t`Options`}</StyledSectionTitle>
          <FormBuilderOptionsEditor
            options={field.options ?? []}
            areValuesLocked={areOptionValuesLocked}
            onChange={(options) => update({ options })}
          />
          {unknownOptionValues.length > 0 && (
            <StyledWarning>
              {t`Some options no longer exist in the CRM field. Pick the CRM field again to reload its options.`}
            </StyledWarning>
          )}
        </StyledSection>
      )}

      {!isDecorative && field.type !== 'file' && (
        <StyledSection>
          <StyledSectionTitle>{t`Save the answer to`}</StyledSectionTitle>
          <FormBuilderNativeSelect
            value={field.mapTo ?? NO_MAPPING_VALUE}
            ariaLabel={t`Person field`}
            options={[
              {
                value: NO_MAPPING_VALUE,
                label: t`Only the submission (no person field)`,
              },
              ...compatibleMappableFields.map((mappableField) => ({
                value: mappableField.value,
                label: mappableField.label,
              })),
              ...(isDefined(field.mapTo) && !isDefined(mappedField)
                ? [{ value: field.mapTo, label: field.mapTo }]
                : []),
            ]}
            onChange={handleMappingChange}
          />
          {field.mapTo === 'emails.primaryEmail' && (
            <StyledHint>
              {t`A submission with an email that already exists updates that person instead of creating a new one.`}
            </StyledHint>
          )}
        </StyledSection>
      )}

      {field.type === 'file' && (
        <StyledSection>
          <StyledSectionTitle>{t`Files`}</StyledSectionTitle>
          <StyledTwoColumns>
            <FormBuilderFieldRow
              label={t`Allowed types`}
              hint={t`Comma separated, e.g. pdf, docx`}
            >
              <FormBuilderTextInput
                value={(field.acceptedFileExtensions ?? []).join(', ')}
                dir="ltr"
                onChange={(value) => {
                  const extensions = value
                    .split(',')
                    .map((extension) => extension.trim().replace(/^\./, ''))
                    .filter(isNonEmptyString);

                  update({
                    acceptedFileExtensions:
                      extensions.length > 0 ? extensions : undefined,
                  });
                }}
              />
            </FormBuilderFieldRow>
            <FormBuilderFieldRow label={t`Max size (MB)`} hint={t`Up to 10`}>
              <FormBuilderTextInput
                type="number"
                min={1}
                max={10}
                dir="ltr"
                value={String(field.maxFileSizeMb ?? 10)}
                onChange={(value) => {
                  const size = Number(value);

                  update({
                    maxFileSizeMb:
                      Number.isFinite(size) && size > 0
                        ? Math.min(size, 10)
                        : undefined,
                  });
                }}
              />
            </FormBuilderFieldRow>
          </StyledTwoColumns>
          <StyledHint>{t`Uploaded files are attached to the person.`}</StyledHint>
        </StyledSection>
      )}

      {PREFILLABLE_FIELD_TYPES.includes(field.type) && (
        <StyledSection>
          <StyledSectionTitle>
            {field.type === 'hidden' ? t`Value` : t`Prefill`}
          </StyledSectionTitle>
          <StyledTwoColumns>
            <FormBuilderFieldRow
              label={t`From the link parameter`}
              hint={t`e.g. utm_source in ?utm_source=linkedin`}
            >
              <FormBuilderTextInput
                value={field.prefillQueryParam ?? ''}
                dir="ltr"
                onChange={(prefillQueryParam) =>
                  update({
                    prefillQueryParam: prefillQueryParam.trim() || undefined,
                  })
                }
              />
            </FormBuilderFieldRow>
            <FormBuilderFieldRow label={t`Default value`}>
              <FormBuilderTextInput
                value={field.defaultValue ?? ''}
                onChange={(defaultValue) =>
                  update({ defaultValue: defaultValue || undefined })
                }
              />
            </FormBuilderFieldRow>
          </StyledTwoColumns>
        </StyledSection>
      )}

      {field.type !== 'hidden' && (
        <StyledSection>
          <StyledSectionTitle>
            {field.type === 'pageBreak'
              ? t`Show this page only when`
              : field.type === 'heading'
                ? t`Show this section only when`
                : t`Show this field only when`}
          </StyledSectionTitle>
          {field.type === 'pageBreak' && (
            <StyledHint>
              {t`A hidden page is skipped, with all its questions.`}
            </StyledHint>
          )}
          {field.type === 'heading' && (
            <StyledHint>
              {t`A hidden section hides every question below it, until the next section title or page.`}
            </StyledHint>
          )}
          <FormBuilderConditionsEditor
            conditions={field.visibleWhen ?? []}
            match={field.visibleWhenMatch}
            previousFields={previousFields}
            onChange={(visibleWhen) =>
              update({
                visibleWhen: visibleWhen.length > 0 ? visibleWhen : undefined,
              })
            }
            onMatchChange={(visibleWhenMatch) => update({ visibleWhenMatch })}
          />
        </StyledSection>
      )}

      <StyledFieldId>{t`Field id: ${field.id}`}</StyledFieldId>
    </StyledSettings>
  );
};
