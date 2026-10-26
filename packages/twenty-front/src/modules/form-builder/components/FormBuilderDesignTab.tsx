import { styled } from '@linaria/react';
import { i18n } from '@lingui/core';
import { msg, t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_GOOGLE_FONTS,
  PUBLIC_FORM_THEME_PRESETS,
  type PublicFormTheme,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderColorInput } from '@/form-builder/components/FormBuilderColorInput';
import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderSwitchRow } from '@/form-builder/components/FormBuilderSwitchRow';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { FORM_BUILDER_THEME_PRESET_LABELS } from '@/form-builder/constants/FormBuilderThemePresets';

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

const StyledPresets = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(3, minmax(0, 1fr));
`;

const StyledPresetButton = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};

  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledSwatch = styled.span`
  align-items: center;
  border: 1px solid;
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex: none;
  height: 20px;
  justify-content: center;
  width: 28px;
`;

const StyledSwatchDot = styled.span`
  border-radius: 50%;
  height: 10px;
  width: 10px;
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
      <StyledSectionTitle>{t`Themes`}</StyledSectionTitle>
      <StyledPresets>
        {PUBLIC_FORM_THEME_PRESETS.map((preset) => (
          <StyledPresetButton
            key={preset.key}
            type="button"
            onClick={() => update(preset.colors)}
          >
            <StyledSwatch
              style={{
                background: preset.colors.pageBackgroundColor,
                borderColor: preset.colors.borderColor,
              }}
            >
              <StyledSwatchDot
                style={{ background: preset.colors.primaryColor }}
              />
            </StyledSwatch>
            {i18n._(FORM_BUILDER_THEME_PRESET_LABELS[preset.key] ?? msg`Theme`)}
          </StyledPresetButton>
        ))}
      </StyledPresets>

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

      <StyledSectionTitle>{t`Layout`}</StyledSectionTitle>
      <StyledGrid>
        <FormBuilderFieldRow label={t`Style`}>
          <FormBuilderNativeSelect
            value={theme.layout}
            options={[
              { value: 'card', label: t`Card` },
              { value: 'plain', label: t`Plain, no card` },
              { value: 'conversational', label: t`One question per screen` },
            ]}
            onChange={(layout) =>
              update({ layout: layout as PublicFormTheme['layout'] })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Width (px)`}>
          <FormBuilderTextInput
            type="number"
            min={360}
            max={1400}
            dir="ltr"
            value={String(theme.maxWidthPx)}
            onChange={(value) => {
              const width = Number(value);

              if (Number.isFinite(width) && width >= 360 && width <= 1400) {
                update({ maxWidthPx: Math.round(width) });
              }
            }}
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Logo and title`}>
          <FormBuilderNativeSelect
            value={theme.logoAlign === 'center' ? 'center' : 'start'}
            options={[
              { value: 'start', label: t`Aligned to the start` },
              { value: 'center', label: t`Centered` },
            ]}
            onChange={(logoAlign) =>
              update({ logoAlign: logoAlign as PublicFormTheme['logoAlign'] })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Buttons`}>
          <FormBuilderNativeSelect
            value={theme.buttonAlign}
            options={[
              { value: 'start', label: t`Aligned to the start` },
              { value: 'center', label: t`Centered` },
              { value: 'stretch', label: t`Full width` },
            ]}
            onChange={(buttonAlign) =>
              update({
                buttonAlign: buttonAlign as PublicFormTheme['buttonAlign'],
              })
            }
          />
        </FormBuilderFieldRow>
        <FormBuilderSwitchRow
          label={t`Show the title`}
          checked={theme.showTitle}
          onChange={(showTitle) => update({ showTitle })}
        />
        <FormBuilderSwitchRow
          label={t`Progress bar on multi-step forms`}
          checked={theme.showProgressBar}
          onChange={(showProgressBar) => update({ showProgressBar })}
        />
      </StyledGrid>

      <StyledSectionTitle>{t`Images and background`}</StyledSectionTitle>
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
        label={t`Cover image URL`}
        hint={t`A wide banner across the top of the form.`}
      >
        <FormBuilderTextInput
          type="url"
          dir="ltr"
          value={theme.coverImageUrl ?? ''}
          placeholder="https://…"
          onChange={(coverImageUrl) =>
            update({ coverImageUrl: coverImageUrl || undefined })
          }
        />
      </FormBuilderFieldRow>
      <StyledGrid>
        <FormBuilderFieldRow label={t`Page background`}>
          <FormBuilderColorInput
            value={theme.pageBackgroundColor ?? theme.backgroundColor}
            ariaLabel={t`Page background`}
            onChange={(pageBackgroundColor) => update({ pageBackgroundColor })}
          />
        </FormBuilderFieldRow>
        <FormBuilderFieldRow label={t`Background image URL`}>
          <FormBuilderTextInput
            type="url"
            dir="ltr"
            value={theme.backgroundImageUrl ?? ''}
            placeholder="https://…"
            onChange={(backgroundImageUrl) =>
              update({ backgroundImageUrl: backgroundImageUrl || undefined })
            }
          />
        </FormBuilderFieldRow>
      </StyledGrid>
    </StyledContainer>
  );
};
