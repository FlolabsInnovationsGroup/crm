import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_GOOGLE_FONTS,
  type PublicFormTheme,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderColorInput } from '@/form-builder/components/FormBuilderColorInput';
import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';

const SYSTEM_FONT_STACK = 'system-ui, -apple-system, Segoe UI, sans-serif';

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

const StyledSectionTitle = styled.h4`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

type ColorKey =
  | 'primaryColor'
  | 'buttonTextColor'
  | 'backgroundColor'
  | 'textColor'
  | 'inputBackgroundColor'
  | 'borderColor';

type FormBuilderDesignTabProps = {
  theme: PublicFormTheme;
  onChange: (theme: PublicFormTheme) => void;
};

export const FormBuilderDesignTab = ({
  theme,
  onChange,
}: FormBuilderDesignTabProps) => {
  const update = (changes: Partial<PublicFormTheme>) =>
    onChange({ ...theme, ...changes });

  const colorRows: { key: ColorKey; label: string }[] = [
    { key: 'primaryColor', label: t`Brand color (buttons, focus)` },
    { key: 'buttonTextColor', label: t`Button text` },
    { key: 'backgroundColor', label: t`Background` },
    { key: 'textColor', label: t`Text` },
    { key: 'inputBackgroundColor', label: t`Field background` },
    { key: 'borderColor', label: t`Field border` },
  ];

  const currentFont =
    PUBLIC_FORM_GOOGLE_FONTS.find(
      (font) => theme.fontFamily.split(',')[0]?.trim() === font,
    ) ?? '';

  return (
    <StyledContainer>
      <StyledSectionTitle>{t`Colors`}</StyledSectionTitle>
      <StyledGrid>
        {colorRows.map(({ key, label }) => (
          <FormBuilderFieldRow key={key} label={label}>
            <FormBuilderColorInput
              value={theme[key]}
              ariaLabel={label}
              onChange={(value) => update({ [key]: value })}
            />
          </FormBuilderFieldRow>
        ))}
      </StyledGrid>

      <StyledSectionTitle>{t`Text and shape`}</StyledSectionTitle>
      <StyledGrid>
        <FormBuilderFieldRow label={t`Font`}>
          <FormBuilderNativeSelect
            value={currentFont}
            options={[
              { value: '', label: t`System default` },
              ...PUBLIC_FORM_GOOGLE_FONTS.map((font) => ({
                value: font,
                label: font,
              })),
            ]}
            onChange={(font) =>
              update({
                fontFamily:
                  font === ''
                    ? SYSTEM_FONT_STACK
                    : `${font}, ${SYSTEM_FONT_STACK}`,
              })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Corner roundness (px)`}>
          <FormBuilderTextInput
            type="number"
            min={0}
            max={32}
            dir="ltr"
            value={String(theme.borderRadiusPx)}
            onChange={(value) => {
              const radius = Number(value);

              if (Number.isFinite(radius)) {
                update({ borderRadiusPx: Math.min(Math.max(radius, 0), 32) });
              }
            }}
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Text direction`}>
          <FormBuilderNativeSelect
            value={theme.direction}
            options={[
              { value: 'ltr', label: t`Left to right` },
              { value: 'rtl', label: t`Right to left (Arabic)` },
            ]}
            onChange={(direction) =>
              update({ direction: direction as PublicFormTheme['direction'] })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Submit button text`}>
          <FormBuilderTextInput
            value={theme.submitButtonLabel}
            onChange={(submitButtonLabel) => update({ submitButtonLabel })}
          />
        </FormBuilderFieldRow>
      </StyledGrid>

      <FormBuilderFieldRow
        label={t`Logo URL`}
        hint={t`An https:// image link. Leave empty for no logo.`}
      >
        <FormBuilderTextInput
          type="url"
          dir="ltr"
          value={theme.logoUrl ?? ''}
          placeholder="https://…"
          onChange={(logoUrl) => update({ logoUrl: logoUrl || undefined })}
        />
      </FormBuilderFieldRow>

      <FormBuilderFieldRow
        label={t`Custom CSS`}
        hint={t`Advanced. Classes: .ff-card, .ff-title, .ff-input, .ff-choice, .ff-submit…`}
      >
        <FormBuilderTextarea
          isMonospace
          maxRows={12}
          value={theme.customCss ?? ''}
          placeholder=".ff-title { letter-spacing: 0; }"
          onChange={(customCss) =>
            update({ customCss: customCss || undefined })
          }
        />
      </FormBuilderFieldRow>
    </StyledContainer>
  );
};
