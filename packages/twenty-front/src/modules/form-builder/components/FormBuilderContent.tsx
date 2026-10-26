import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppPath, CoreObjectNameSingular } from 'twenty-shared/types';
import {
  isDefined,
  PUBLIC_FORM_DRAFT_STATUS,
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_PUBLISHED_STATUS,
} from 'twenty-shared/utils';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderEditor } from '@/form-builder/components/FormBuilderEditor';
import { type FormBuilderRecord } from '@/form-builder/types/FormBuilderRecord';
import { createDefaultFormDefinition } from '@/form-builder/utils/createDefaultFormDefinition';
import { getFormBuilderMappableFields } from '@/form-builder/utils/getFormBuilderMappableFields';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useNavigateApp } from '~/hooks/useNavigateApp';

const StyledLayout = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
`;

const StyledSidebar = styled.nav`
  border-right: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex: 0 0 220px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[2]};
`;

const StyledFormItem = styled.button<{ isActive: boolean }>`
  align-items: center;
  background: ${({ isActive }) =>
    isActive ? themeCssVariables.background.transparent.medium : 'none'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]};
  text-align: start;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledFormName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDot = styled.span<{ isPublished: boolean }>`
  background: ${({ isPublished }) =>
    isPublished
      ? themeCssVariables.color.green
      : themeCssVariables.border.color.strong};
  border-radius: 50%;
  flex: none;
  height: 8px;
  width: 8px;
`;

const StyledEmpty = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: center;
`;

export const FormBuilderContent = () => {
  const { formId } = useParams<{ formId?: string }>();
  const navigate = useNavigateApp();
  const [isDirty, setIsDirty] = useState(false);

  const { records: forms, loading } = useFindManyRecords<FormBuilderRecord>({
    objectNameSingular: PUBLIC_FORM_OBJECT_NAME,
    orderBy: [{ createdAt: 'DescNullsLast' }],
    recordGqlFields: {
      id: true,
      name: true,
      status: true,
      definition: true,
      createdAt: true,
    },
    limit: 200,
  });

  const { createOneRecord, loading: isCreating } =
    useCreateOneRecord<FormBuilderRecord>({
      objectNameSingular: PUBLIC_FORM_OBJECT_NAME,
    });

  const { objectMetadataItem: personObjectMetadataItem } =
    useObjectMetadataItem({
      objectNameSingular: CoreObjectNameSingular.Person,
    });

  const mappableFields = useMemo(
    () => getFormBuilderMappableFields(personObjectMetadataItem.fields),
    [personObjectMetadataItem.fields],
  );

  const selectedForm =
    forms.find((form) => form.id === formId) ??
    (isDefined(formId) ? undefined : forms[0]);

  const confirmLeavingUnsavedChanges = () =>
    !isDirty ||
    window.confirm(t`You have unsaved changes. Leave without saving?`);

  const openForm = (nextFormId: string) => {
    if (nextFormId === selectedForm?.id || !confirmLeavingUnsavedChanges()) {
      return;
    }

    setIsDirty(false);
    navigate(AppPath.FormBuilder, { formId: nextFormId });
  };

  const handleCreateForm = async () => {
    if (!confirmLeavingUnsavedChanges()) {
      return;
    }

    const title = t`New form`;
    const createdForm = await createOneRecord({
      name: title,
      status: PUBLIC_FORM_DRAFT_STATUS,
      definition: createDefaultFormDefinition(title),
    });

    setIsDirty(false);
    navigate(AppPath.FormBuilder, { formId: createdForm.id });
  };

  return (
    <StyledLayout>
      <StyledSidebar aria-label={t`Forms`}>
        <Button
          variant="outline"
          size="sm"
          fullWidth
          loading={isCreating}
          startIcon={<IconPlus size={14} />}
          onClick={handleCreateForm}
        >
          {t`New form`}
        </Button>
        {forms.map((form) => (
          <StyledFormItem
            key={form.id}
            type="button"
            isActive={form.id === selectedForm?.id}
            onClick={() => openForm(form.id)}
          >
            <StyledFormName dir="auto">
              {form.name || t`Untitled`}
            </StyledFormName>
            <StyledDot
              isPublished={form.status === PUBLIC_FORM_PUBLISHED_STATUS}
              title={
                form.status === PUBLIC_FORM_PUBLISHED_STATUS
                  ? t`Published`
                  : t`Draft`
              }
            />
          </StyledFormItem>
        ))}
      </StyledSidebar>
      {isDefined(selectedForm) ? (
        <FormBuilderEditor
          key={selectedForm.id}
          form={selectedForm}
          mappableFields={mappableFields}
          onDirtyChange={setIsDirty}
        />
      ) : (
        <StyledEmpty>
          {loading ? null : (
            <>
              <span>
                {forms.length === 0
                  ? t`No forms yet. Build one to collect applications or leads.`
                  : t`This form doesn't exist anymore.`}
              </span>
              <Button
                variant="solid"
                color="accent"
                startIcon={<IconPlus size={14} />}
                onClick={handleCreateForm}
              >
                {t`New form`}
              </Button>
            </>
          )}
        </StyledEmpty>
      )}
    </StyledLayout>
  );
};
