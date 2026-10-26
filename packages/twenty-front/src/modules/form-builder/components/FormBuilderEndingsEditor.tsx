import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type PublicFormEnding } from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderConditionGroupsEditor } from '@/form-builder/components/FormBuilderConditionGroupsEditor';
import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderLogicCard } from '@/form-builder/components/FormBuilderLogicCard';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';
import { getUniqueLogicId } from '@/form-builder/utils/getUniqueLogicId';
import { moveItem } from '@/form-builder/utils/moveItem';

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

type FormBuilderEndingsEditorProps = {
  endings: PublicFormEnding[];
  sources: FormBuilderConditionSource[];
  onChange: (endings: PublicFormEnding[]) => void;
};

export const FormBuilderEndingsEditor = ({
  endings,
  sources,
  onChange,
}: FormBuilderEndingsEditorProps) => {
  const updateEnding = (
    endingIndex: number,
    changes: Partial<PublicFormEnding>,
  ) =>
    onChange(
      endings.map((ending, index) =>
        index === endingIndex ? { ...ending, ...changes } : ending,
      ),
    );

  const handleAdd = () =>
    onChange([
      ...endings,
      {
        id: getUniqueLogicId(
          'ending',
          endings.map((ending) => ending.id),
        ),
        label: t`Ending ${endings.length + 1}`,
        whenMatch: 'any',
        message: '',
      },
    ]);

  return (
    <StyledList>
      {endings.map((ending, index) => (
        <FormBuilderLogicCard
          key={ending.id}
          title={ending.label || ending.id}
          isFirst={index === 0}
          isLast={index === endings.length - 1}
          onMove={(direction) => onChange(moveItem(endings, index, direction))}
          onRemove={() =>
            onChange(endings.filter((_, otherIndex) => otherIndex !== index))
          }
        >
          <FormBuilderFieldRow label={t`Name (internal)`}>
            <FormBuilderTextInput
              value={ending.label}
              onChange={(label) => updateEnding(index, { label })}
            />
          </FormBuilderFieldRow>
          <FormBuilderConditionGroupsEditor
            groups={ending.when ?? []}
            groupsMatch={ending.whenMatch}
            sources={sources}
            addLabel={t`Only when…`}
            emptyHint={t`Add questions to show this ending for some answers.`}
            onChange={(groups, whenMatch) =>
              updateEnding(index, {
                when: groups.length > 0 ? groups : undefined,
                whenMatch,
              })
            }
          />
          <FormBuilderFieldRow label={t`Message`}>
            <FormBuilderTextarea
              value={ending.message ?? ''}
              onChange={(message) =>
                updateEnding(index, { message: message || undefined })
              }
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow
            label={t`Or send visitors to`}
            hint={t`A link starting with https://. Answers can be added to it.`}
          >
            <FormBuilderTextInput
              type="url"
              dir="ltr"
              value={ending.redirectUrl ?? ''}
              onChange={(redirectUrl) =>
                updateEnding(index, {
                  redirectUrl: redirectUrl.trim() || undefined,
                })
              }
            />
          </FormBuilderFieldRow>
        </FormBuilderLogicCard>
      ))}
      <StyledHint>
        {t`The first ending whose conditions are true is shown. An ending without conditions matches everyone, so keep it last. With no ending, the message from Settings is shown.`}
      </StyledHint>
      <div>
        <Button
          variant="ghost"
          size="sm"
          startIcon={<IconPlus size={14} />}
          onClick={handleAdd}
        >
          {t`Add ending`}
        </Button>
      </div>
    </StyledList>
  );
};
