import { useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_ACTION_TYPES,
  type PublicFormAction,
  type PublicFormDefinition,
} from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { currentWorkspaceMembersState } from '@/auth/states/currentWorkspaceMembersState';
import { FormBuilderActionSettings } from '@/form-builder/components/FormBuilderActionSettings';
import { FormBuilderConditionGroupsEditor } from '@/form-builder/components/FormBuilderConditionGroupsEditor';
import { FormBuilderLogicCard } from '@/form-builder/components/FormBuilderLogicCard';
import { FORM_BUILDER_ACTION_LABELS as ACTION_LABELS } from '@/form-builder/constants/FormBuilderActionLabels';
import { type FormBuilderConditionSource } from '@/form-builder/types/FormBuilderConditionSource';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';
import { createFormAction } from '@/form-builder/utils/createFormAction';
import { getUniqueLogicId } from '@/form-builder/utils/getUniqueLogicId';
import { GET_INBOX_MAILBOXES } from '@/team-inbox/graphql/getInboxMailboxes';
import { type InboxMailbox } from '@/team-inbox/types/InboxMailbox';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { getWorkspaceMemberNameOrEmail } from '@/workspace-member/utils/getWorkspaceMemberNameOrEmail';

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledAddRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

type FormBuilderActionsEditorProps = {
  definition: PublicFormDefinition;
  mappableFields: FormBuilderMappableField[];
  sources: FormBuilderConditionSource[];
  onChange: (actions: PublicFormAction[]) => void;
};

export const FormBuilderActionsEditor = ({
  definition,
  mappableFields,
  sources,
  onChange,
}: FormBuilderActionsEditorProps) => {
  const actions = definition.actions ?? [];
  const currentWorkspaceMembers = useAtomStateValue(
    currentWorkspaceMembersState,
  );
  const { data: mailboxData } = useQuery<{ getInboxMailboxes: InboxMailbox[] }>(
    GET_INBOX_MAILBOXES,
  );

  const mailboxes = (mailboxData?.getInboxMailboxes ?? [])
    .filter(
      (mailbox, index, all) =>
        all.findIndex(
          (other) => other.connectedAccountId === mailbox.connectedAccountId,
        ) === index,
    )
    .map((mailbox) => ({
      value: mailbox.connectedAccountId,
      label: mailbox.handle,
    }));
  const members = currentWorkspaceMembers.map((member) => ({
    value: member.id,
    label: getWorkspaceMemberNameOrEmail(member),
  }));

  const updateAction = (actionIndex: number, action: PublicFormAction) =>
    onChange(
      actions.map((current, index) =>
        index === actionIndex ? action : current,
      ),
    );

  return (
    <StyledList>
      {actions.map((action, index) => (
        <FormBuilderLogicCard
          key={action.id}
          title={i18n._(ACTION_LABELS[action.type])}
          onRemove={() =>
            onChange(actions.filter((_, otherIndex) => otherIndex !== index))
          }
        >
          <FormBuilderConditionGroupsEditor
            groups={action.when ?? []}
            groupsMatch={action.whenMatch}
            sources={sources}
            addLabel={t`Only when…`}
            emptyHint={t`Add questions to run this step for some answers only.`}
            onChange={(groups, whenMatch) =>
              updateAction(index, {
                ...action,
                when: groups.length > 0 ? groups : undefined,
                whenMatch,
              })
            }
          />
          <FormBuilderActionSettings
            action={action}
            fields={definition.fields}
            mappableFields={mappableFields}
            mailboxes={mailboxes}
            members={members}
            onChange={(nextAction) => updateAction(index, nextAction)}
          />
        </FormBuilderLogicCard>
      ))}
      <StyledHint>
        {t`Runs after every submission, in this order. Texts can include answers with the field id between double braces.`}
      </StyledHint>
      <StyledAddRow>
        {PUBLIC_FORM_ACTION_TYPES.map((type) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            startIcon={<IconPlus size={14} />}
            onClick={() =>
              onChange([
                ...actions,
                createFormAction(
                  type,
                  getUniqueLogicId(
                    'action',
                    actions.map((action) => action.id),
                  ),
                  definition.title,
                ),
              ])
            }
          >
            {i18n._(ACTION_LABELS[type])}
          </Button>
        ))}
      </StyledAddRow>
    </StyledList>
  );
};
