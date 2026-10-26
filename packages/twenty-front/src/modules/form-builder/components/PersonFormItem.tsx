import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { type PublicFormDefinition } from 'twenty-shared/utils';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/icon';
import { themeCssVariables } from 'twenty-ui/theme';

import { FormBuilderNativeSelect } from '@/form-builder/components/FormBuilderNativeSelect';
import { type FormSubmissionRecord } from '@/form-builder/types/FormSubmissionRecord';
import {
  buildPersonFormSections,
  type PersonFormAttachment,
} from '@/form-builder/utils/buildPersonFormSections';
import { beautifyExactDateTime } from '~/utils/date-utils';

const StyledItem = styled.section`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  flex-shrink: 0;
  overflow: hidden;
`;

const StyledHeader = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: none;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  text-align: start;
  width: 100%;
`;

const StyledTitle = styled.span`
  flex: 1;
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  min-width: 0;
`;

const StyledStatus = styled.span<{ isAnswered: boolean }>`
  color: ${({ isAnswered }) =>
    isAnswered
      ? themeCssVariables.color.green
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  white-space: nowrap;
`;

const StyledBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledSubmissionPicker = styled.div`
  max-width: 280px;
`;

const StyledSectionTitle = styled.h4`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0 0 ${themeCssVariables.spacing[2]};
  padding-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledRows = styled.dl`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  margin: 0;
`;

const StyledQuestion = styled.dt`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin-bottom: ${themeCssVariables.spacing[1]};
`;

const StyledAnswer = styled.dd<{ isEmpty: boolean }>`
  color: ${({ isEmpty }) =>
    isEmpty
      ? themeCssVariables.font.color.light
      : themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-style: ${({ isEmpty }) => (isEmpty ? 'italic' : 'normal')};
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;

  a {
    color: ${themeCssVariables.color.blue};
  }
`;

type PersonFormItemProps = {
  formName: string;
  definition: PublicFormDefinition;
  submissions: FormSubmissionRecord[];
  attachments: PersonFormAttachment[];
};

export const PersonFormItem = ({
  formName,
  definition,
  submissions,
  attachments,
}: PersonFormItemProps) => {
  const isAnswered = submissions.length > 0;
  // Answers can load after the form list, so the default follows them.
  const [isOpenOverride, setIsOpenOverride] = useState<boolean | null>(null);
  const isOpen = isOpenOverride ?? isAnswered;
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(
    submissions[0]?.id ?? '',
  );
  const submission =
    submissions.find((candidate) => candidate.id === selectedSubmissionId) ??
    submissions[0];

  const sections = buildPersonFormSections({
    definition,
    answers: submission?.answers ?? null,
    attachments,
    labels: { calculated: t`Calculated`, otherAnswers: t`Other answers` },
  });

  const submittedAt = submission
    ? beautifyExactDateTime(submission.submittedAt ?? submission.createdAt)
    : '';
  const ChevronIcon = isOpen ? IconChevronDown : IconChevronRight;

  return (
    <StyledItem>
      <StyledHeader
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpenOverride(!isOpen)}
      >
        <ChevronIcon size={16} />
        <StyledTitle dir="auto">{formName}</StyledTitle>
        <StyledStatus isAnswered={isAnswered}>
          {isAnswered ? t`Answered ${submittedAt}` : t`Not answered yet`}
        </StyledStatus>
      </StyledHeader>
      {isOpen && (
        <StyledBody>
          {submissions.length > 1 && (
            <StyledSubmissionPicker>
              <FormBuilderNativeSelect
                ariaLabel={t`Answer`}
                value={submission?.id ?? ''}
                options={submissions.map((candidate, index) => ({
                  value: candidate.id,
                  label: t`Answer ${submissions.length - index}: ${beautifyExactDateTime(
                    candidate.submittedAt ?? candidate.createdAt,
                  )}`,
                }))}
                onChange={setSelectedSubmissionId}
              />
            </StyledSubmissionPicker>
          )}
          {sections.map((section) => (
            <div key={section.id}>
              {section.title !== null && (
                <StyledSectionTitle dir="auto">{section.title}</StyledSectionTitle>
              )}
              <StyledRows>
                {section.rows.map((row) => {
                  const isEmpty = row.value === null && row.files.length === 0;

                  return (
                    <div key={row.id}>
                      <StyledQuestion dir="auto">{row.label}</StyledQuestion>
                      <StyledAnswer dir="auto" isEmpty={isEmpty}>
                        {row.files.length > 0
                          ? row.files.map((file, index) => (
                              <span key={`${file.name}-${index}`}>
                                {index > 0 && ', '}
                                {file.url ? (
                                  <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {file.name}
                                  </a>
                                ) : (
                                  file.name
                                )}
                              </span>
                            ))
                          : (row.value ?? t`No answer`)}
                      </StyledAnswer>
                    </div>
                  );
                })}
              </StyledRows>
            </div>
          ))}
        </StyledBody>
      )}
    </StyledItem>
  );
};
