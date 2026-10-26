import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import {
  PUBLIC_FORM_DRAFT_STATUS,
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_PUBLISHED_STATUS,
  publicFormDefinitionSchema,
  type PublicFormDefinition,
} from 'twenty-shared/utils';
import { useToast } from 'twenty-ui/components/feedback';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { FormBuilderCodeTab } from '@/form-builder/components/FormBuilderCodeTab';
import { FormBuilderDesignTab } from '@/form-builder/components/FormBuilderDesignTab';
import { FormBuilderFieldsTab } from '@/form-builder/components/FormBuilderFieldsTab';
import { FormBuilderLogicTab } from '@/form-builder/components/FormBuilderLogicTab';
import { FormBuilderResponsesTab } from '@/form-builder/components/FormBuilderResponsesTab';
import { FormBuilderPreview } from '@/form-builder/components/FormBuilderPreview';
import { FormBuilderSettingsTab } from '@/form-builder/components/FormBuilderSettingsTab';
import { FormBuilderShareTab } from '@/form-builder/components/FormBuilderShareTab';
import { useFormBuilderFocusHandlers } from '@/form-builder/hooks/useFormBuilderFocusHandlers';
import { type FormBuilderMappableField } from '@/form-builder/types/FormBuilderMappableField';
import { type FormBuilderRecord } from '@/form-builder/types/FormBuilderRecord';
import { type FormBuilderTab } from '@/form-builder/types/FormBuilderTab';
import { removeDanglingLogicConditions } from '@/form-builder/utils/removeDanglingLogicConditions';
import { buildFormShareLinks } from '@/form-builder/utils/buildFormShareLinks';
import { parseStoredFormDefinition } from '@/form-builder/utils/parseStoredFormDefinition';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const StyledEditor = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
`;

const StyledPanel = styled.div`
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex: 0 0 min(560px, 48%);
  flex-direction: column;
  min-height: 0;
`;

const StyledPanelHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledNameInput = styled.input`
  background: transparent;
  border: 1px solid transparent;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  min-width: 0;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &:hover,
  &:focus {
    border-color: ${themeCssVariables.border.color.medium};
    outline: none;
  }
`;

const StyledStatus = styled.span<{ isPublished: boolean }>`
  background: ${({ isPublished }) =>
    isPublished
      ? themeCssVariables.background.transparent.success
      : themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  flex: none;
  font-size: ${themeCssVariables.font.size.xs};
  padding: 2px ${themeCssVariables.spacing[2]};
`;

const StyledTabs = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  padding: 0 ${themeCssVariables.spacing[3]};
`;

const StyledTab = styled.button<{ isActive: boolean }>`
  background: none;
  border: none;
  border-bottom: 2px solid
    ${({ isActive }) =>
      isActive ? themeCssVariables.font.color.primary : 'transparent'};
  color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[2]};
`;

const StyledTabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[4]};
`;

type FormBuilderEditorProps = {
  form: FormBuilderRecord;
  mappableFields: FormBuilderMappableField[];
  onDirtyChange: (isDirty: boolean) => void;
};

export const FormBuilderEditor = ({
  form,
  mappableFields,
  onDirtyChange,
}: FormBuilderEditorProps) => {
  const { enqueueToast } = useToast();
  const { updateOneRecord } = useUpdateOneRecord();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const focusHandlers = useFormBuilderFocusHandlers();

  const savedName = form.name ?? '';
  const savedDefinition = useMemo(
    () => parseStoredFormDefinition(form.definition, savedName),
    [form.definition, savedName],
  );

  const [name, setName] = useState(savedName);
  const [definition, setDefinition] =
    useState<PublicFormDefinition>(savedDefinition);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ name: savedName, definition: savedDefinition }),
  );
  const [activeTab, setActiveTab] = useState<FormBuilderTab>('fields');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isPublished = form.status === PUBLIC_FORM_PUBLISHED_STATUS;
  const isDirty = JSON.stringify({ name, definition }) !== savedSnapshot;

  const updateDraft = (
    nextName: string,
    changedDefinition: PublicFormDefinition,
  ) => {
    const nextDefinition = removeDanglingLogicConditions(changedDefinition);

    setName(nextName);
    setDefinition(nextDefinition);
    onDirtyChange(
      JSON.stringify({ name: nextName, definition: nextDefinition }) !==
        savedSnapshot,
    );
  };

  // The public title follows the name until it is edited on its own.
  const handleNameChange = (nextName: string) =>
    updateDraft(
      nextName,
      definition.title === name
        ? { ...definition, title: nextName }
        : definition,
    );

  const save = async (status?: string) => {
    const parsed = publicFormDefinitionSchema.safeParse(definition);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const issuePath = issue?.path.join('.') ?? '';
      const issueMessage = issue?.message ?? '';

      enqueueToast({
        status: 'error',
        children: t`The form can't be saved: ${issuePath} ${issueMessage}`,
      });

      return;
    }

    setIsSaving(true);

    try {
      await updateOneRecord({
        objectNameSingular: PUBLIC_FORM_OBJECT_NAME,
        idToUpdate: form.id,
        updateOneRecordInput: {
          name: name.trim() || parsed.data.title,
          definition: parsed.data,
          ...(status ? { status } : {}),
        },
      });

      setSavedSnapshot(JSON.stringify({ name, definition }));
      onDirtyChange(false);
      enqueueToast({
        status: 'success',
        children:
          status === PUBLIC_FORM_PUBLISHED_STATUS
            ? t`Form published`
            : status === PUBLIC_FORM_DRAFT_STATUS
              ? t`Form unpublished`
              : t`Form saved`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const shareLinks = buildFormShareLinks({
    serverBaseUrl: REACT_APP_SERVER_BASE_URL,
    workspaceId: currentWorkspace?.id ?? '',
    formId: form.id,
    title: definition.title,
  });

  const tabs: { id: FormBuilderTab; label: string }[] = [
    { id: 'fields', label: t`Fields` },
    { id: 'logic', label: t`Logic` },
    { id: 'design', label: t`Design` },
    { id: 'code', label: t`Code` },
    { id: 'settings', label: t`Settings` },
    { id: 'share', label: t`Share` },
    { id: 'responses', label: t`Responses` },
  ];

  return (
    <StyledEditor
      onFocusCapture={focusHandlers.onFocusCapture}
      onBlurCapture={focusHandlers.onBlurCapture}
    >
      <StyledPanel>
        <StyledPanelHeader>
          <StyledNameInput
            value={name}
            aria-label={t`Form name`}
            dir="auto"
            onChange={(event) => handleNameChange(event.target.value)}
          />
          <StyledStatus isPublished={isPublished}>
            {isPublished ? t`Published` : t`Draft`}
          </StyledStatus>
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={() => save()}
          >
            {isDirty ? t`Save` : t`Saved`}
          </Button>
          <Button
            variant="solid"
            color={isPublished ? 'neutral' : 'accent'}
            size="sm"
            loading={isSaving}
            onClick={() =>
              save(
                isPublished
                  ? PUBLIC_FORM_DRAFT_STATUS
                  : PUBLIC_FORM_PUBLISHED_STATUS,
              )
            }
          >
            {isPublished ? t`Unpublish` : t`Publish`}
          </Button>
        </StyledPanelHeader>
        <StyledTabs role="tablist">
          {tabs.map((tab) => (
            <StyledTab
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </StyledTab>
          ))}
        </StyledTabs>
        <StyledTabContent>
          {activeTab === 'fields' && (
            <FormBuilderFieldsTab
              fields={definition.fields}
              variables={definition.variables ?? []}
              mappableFields={mappableFields}
              selectedFieldId={selectedFieldId}
              onSelectField={setSelectedFieldId}
              onChange={(fields) =>
                updateDraft(name, { ...definition, fields })
              }
            />
          )}
          {activeTab === 'logic' && (
            <FormBuilderLogicTab
              definition={definition}
              mappableFields={mappableFields}
              onChange={(nextDefinition) => updateDraft(name, nextDefinition)}
            />
          )}
          {activeTab === 'design' && (
            <FormBuilderDesignTab
              theme={definition.theme}
              onChange={(theme) => updateDraft(name, { ...definition, theme })}
            />
          )}
          {activeTab === 'code' && (
            <FormBuilderCodeTab
              definition={definition}
              onChange={(nextDefinition) => updateDraft(name, nextDefinition)}
            />
          )}
          {activeTab === 'settings' && (
            <FormBuilderSettingsTab
              definition={definition}
              onChange={(nextDefinition) => updateDraft(name, nextDefinition)}
            />
          )}
          {activeTab === 'responses' && (
            <FormBuilderResponsesTab formId={form.id} definition={definition} />
          )}
          {activeTab === 'share' && (
            <FormBuilderShareTab
              isPublished={isPublished}
              hasUnsavedChanges={isDirty}
              links={shareLinks}
            />
          )}
        </StyledTabContent>
      </StyledPanel>
      <FormBuilderPreview formId={form.id} definition={definition} />
    </StyledEditor>
  );
};
