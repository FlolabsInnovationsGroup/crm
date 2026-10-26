import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_PUBLISHED_STATUS,
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
} from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { useAttachments } from '@/activities/files/hooks/useAttachments';
import { PersonFormItem } from '@/form-builder/components/PersonFormItem';
import { type FormBuilderRecord } from '@/form-builder/types/FormBuilderRecord';
import { type FormSubmissionRecord } from '@/form-builder/types/FormSubmissionRecord';
import { parseStoredFormDefinition } from '@/form-builder/utils/parseStoredFormDefinition';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { WidgetHeaderCountEffect } from '@/page-layout/widgets/components/WidgetHeaderCountEffect';
import { AnimatedPlaceholder } from '@/ui/feedback/empty-state/components/AnimatedPlaceholder/AnimatedPlaceholder';
import { EmptyState } from '@/ui/feedback/empty-state/components/EmptyState';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  overflow: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

export const PersonFormsCard = () => {
  const targetRecord = useTargetRecord();
  const { attachments } = useAttachments(targetRecord);

  const { records: forms, loading: formsLoading } =
    useFindManyRecords<FormBuilderRecord>({
      objectNameSingular: PUBLIC_FORM_OBJECT_NAME,
      orderBy: [{ createdAt: 'AscNullsLast' }],
      limit: 100,
      recordGqlFields: { id: true, name: true, status: true, definition: true },
    });

  const { records: submissions, loading: submissionsLoading } =
    useFindManyRecords<FormSubmissionRecord & { __typename: string }>({
      objectNameSingular: PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
      filter: { personId: { eq: targetRecord.id } },
      orderBy: [{ createdAt: 'DescNullsLast' }],
      limit: 200,
      recordGqlFields: {
        id: true,
        formId: true,
        answers: true,
        createdAt: true,
        submittedAt: true,
        sourceUrl: true,
      },
    });

  // Drafts appear only once this person has answered them.
  const items = forms
    .map((form) => ({
      form,
      submissions: submissions.filter(
        (submission) => submission.formId === form.id,
      ),
    }))
    .filter(
      ({ form, submissions: formSubmissions }) =>
        form.status === PUBLIC_FORM_PUBLISHED_STATUS ||
        formSubmissions.length > 0,
    )
    .sort(
      (first, second) =>
        Number(second.submissions.length > 0) -
        Number(first.submissions.length > 0),
    );

  const answeredCount = items.filter(
    (item) => item.submissions.length > 0,
  ).length;

  if ((formsLoading || submissionsLoading) && items.length === 0) {
    return <SkeletonLoader />;
  }

  if (items.length === 0) {
    return (
      <EmptyState.Root>
        <AnimatedPlaceholder type="noRecord" />
        <EmptyState.Content>
          <EmptyState.Title>{t`No forms yet`}</EmptyState.Title>
          <EmptyState.Description>
            {t`Published forms and this person's answers will appear here.`}
          </EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <>
      <WidgetHeaderCountEffect count={answeredCount} />
      <StyledList>
        {items.map(({ form, submissions: formSubmissions }) => (
          <PersonFormItem
            key={form.id}
            formName={form.name ?? t`Untitled form`}
            definition={parseStoredFormDefinition(
              form.definition,
              form.name ?? '',
            )}
            submissions={formSubmissions}
            attachments={attachments}
          />
        ))}
      </StyledList>
    </>
  );
};
