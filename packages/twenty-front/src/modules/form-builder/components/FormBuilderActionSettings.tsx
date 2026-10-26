import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  type PublicFormAction,
  type PublicFormField,
} from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderFieldRow } from '@/form-builder/components/FormBuilderFieldRow';
import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { FormBuilderPersonValueRow } from '@/form-builder/components/FormBuilderPersonValueRow';
import { FormBuilderTextarea } from '@/form-builder/components/FormBuilderTextarea';
import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';

const DEFAULT_OPTION = '';

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

export type FormBuilderSelectChoice = { value: string; label: string };

type FormBuilderActionSettingsProps = {
  action: PublicFormAction;
  fields: PublicFormField[];
  mappableFields: FormBuilderMappableField[];
  mailboxes: FormBuilderSelectChoice[];
  members: FormBuilderSelectChoice[];
  onChange: (action: PublicFormAction) => void;
};

export const FormBuilderActionSettings = ({
  action,
  fields,
  mappableFields,
  mailboxes,
  members,
  onChange,
}: FormBuilderActionSettingsProps) => {
  const renderMailboxSelect = (
    connectedAccountId: string | undefined,
    onSelect: (connectedAccountId: string | undefined) => void,
  ) => (
    <FormBuilderFieldRow label={t`Send from`}>
      <FormBuilderNativeSelect
        value={connectedAccountId ?? DEFAULT_OPTION}
        ariaLabel={t`Send from`}
        options={[
          { value: DEFAULT_OPTION, label: t`The first connected mailbox` },
          ...mailboxes,
        ]}
        onChange={(value) => onSelect(value || undefined)}
      />
    </FormBuilderFieldRow>
  );

  switch (action.type) {
    case 'setPersonValues': {
      const settableFields = mappableFields.filter(
        (field) => !field.value.startsWith('emails.'),
      );

      return (
        <>
          {action.values.map((entry, index) => (
            <FormBuilderPersonValueRow
              key={index}
              entry={entry}
              settableFields={settableFields}
              onChange={(nextEntry) =>
                onChange({
                  ...action,
                  values: action.values.map((current, currentIndex) =>
                    currentIndex === index ? nextEntry : current,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...action,
                  values: action.values.filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                })
              }
            />
          ))}
          <StyledHint>
            {t`Values can include answers, e.g. the field id between double braces.`}
          </StyledHint>
          <div>
            <Button
              variant="ghost"
              size="sm"
              startIcon={<IconPlus size={14} />}
              disabled={settableFields.length === 0}
              onClick={() => {
                const firstField = settableFields[0];

                if (firstField === undefined) {
                  return;
                }

                onChange({
                  ...action,
                  values: [
                    ...action.values,
                    {
                      mapTo: firstField.value,
                      value: firstField.options?.[0]?.value ?? '',
                    },
                  ],
                });
              }}
            >
              {t`Add a field to set`}
            </Button>
          </div>
        </>
      );
    }
    case 'createTask':
      return (
        <>
          <FormBuilderFieldRow label={t`Task title`}>
            <FormBuilderTextInput
              value={action.title}
              onChange={(title) => onChange({ ...action, title })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow
            label={t`Notes`}
            hint={t`The answers are added below automatically.`}
          >
            <FormBuilderTextarea
              value={action.body ?? ''}
              onChange={(body) =>
                onChange({ ...action, body: body || undefined })
              }
            />
          </FormBuilderFieldRow>
          <StyledGrid>
            <FormBuilderFieldRow label={t`Assign to`}>
              <FormBuilderNativeSelect
                value={action.assigneeId ?? DEFAULT_OPTION}
                ariaLabel={t`Assign to`}
                options={[
                  { value: DEFAULT_OPTION, label: t`Nobody` },
                  ...members,
                ]}
                onChange={(assigneeId) =>
                  onChange({ ...action, assigneeId: assigneeId || undefined })
                }
              />
            </FormBuilderFieldRow>
            <FormBuilderFieldRow label={t`Due in (days)`}>
              <FormBuilderTextInput
                type="number"
                min={0}
                max={365}
                dir="ltr"
                value={
                  action.dueInDays === undefined ? '' : String(action.dueInDays)
                }
                onChange={(value) => {
                  const days = Number(value);

                  onChange({
                    ...action,
                    dueInDays:
                      value.trim() !== '' && Number.isInteger(days) && days >= 0
                        ? Math.min(days, 365)
                        : undefined,
                  });
                }}
              />
            </FormBuilderFieldRow>
          </StyledGrid>
        </>
      );
    case 'notifyTeam':
      return (
        <>
          <FormBuilderFieldRow
            label={t`Send to`}
            hint={t`Comma separated emails`}
          >
            <FormBuilderTextInput
              dir="ltr"
              value={action.to}
              onChange={(to) => onChange({ ...action, to })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow label={t`Subject`}>
            <FormBuilderTextInput
              value={action.subject}
              onChange={(subject) => onChange({ ...action, subject })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow
            label={t`Message`}
            hint={t`All answers and a link to the person are added below.`}
          >
            <FormBuilderTextarea
              value={action.message ?? ''}
              onChange={(message) =>
                onChange({ ...action, message: message || undefined })
              }
            />
          </FormBuilderFieldRow>
          {renderMailboxSelect(
            action.connectedAccountId,
            (connectedAccountId) => onChange({ ...action, connectedAccountId }),
          )}
        </>
      );
    case 'autoReply':
      return (
        <>
          <FormBuilderFieldRow label={t`Send to`}>
            <FormBuilderNativeSelect
              value={action.emailFieldId ?? DEFAULT_OPTION}
              ariaLabel={t`Send to`}
              options={[
                { value: DEFAULT_OPTION, label: t`The person's email` },
                ...fields
                  .filter((field) => field.type === 'email')
                  .map((field) => ({
                    value: field.id,
                    label: field.label || field.id,
                  })),
              ]}
              onChange={(emailFieldId) =>
                onChange({ ...action, emailFieldId: emailFieldId || undefined })
              }
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow label={t`Subject`}>
            <FormBuilderTextInput
              value={action.subject}
              onChange={(subject) => onChange({ ...action, subject })}
            />
          </FormBuilderFieldRow>
          <FormBuilderFieldRow label={t`Message`}>
            <FormBuilderTextarea
              value={action.body}
              onChange={(body) => onChange({ ...action, body })}
            />
          </FormBuilderFieldRow>
          {renderMailboxSelect(
            action.connectedAccountId,
            (connectedAccountId) => onChange({ ...action, connectedAccountId }),
          )}
        </>
      );
  }
};
