import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

import { type FormSubmissionRecord } from '@/form-builder/types/FormSubmissionRecord';
import { getFormResponseColumns } from '@/form-builder/utils/getFormResponseColumns';
import { getFormResponseValue } from '@/form-builder/utils/getFormResponseValue';

const escapeCsvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const buildFormResponsesCsv = (
  definition: PublicFormDefinition,
  submissions: FormSubmissionRecord[],
  headers: { submittedAt: string; source: string },
) => {
  const columns = getFormResponseColumns(definition);
  const rows = [
    [
      headers.submittedAt,
      ...columns.map((column) => column.label),
      headers.source,
    ],
    ...submissions.map((submission) => {
      const answers: PublicFormAnswers = submission.answers ?? {};

      return [
        submission.createdAt,
        ...columns.map((column) =>
          getFormResponseValue(definition, answers, column.id),
        ),
        submission.sourceUrl ?? '',
      ];
    }),
  ];

  // The byte order mark makes Excel read Arabic text correctly.
  return `﻿${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
};
