import { isNonEmptyString } from '@sniptt/guards';
import {
  PUBLIC_FORM_ENGINE,
  type PublicFormAnswers,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

import { getFormResponseValue } from '@/form-builder/utils/getFormResponseValue';

export type PersonFormFile = { name: string; url?: string };

export type PersonFormRow = {
  id: string;
  label: string;
  value: string | null;
  files: PersonFormFile[];
};

export type PersonFormSection = {
  id: string;
  title: string | null;
  rows: PersonFormRow[];
};

export type PersonFormAttachment = {
  name: string;
  file: { label: string; url?: string }[] | null;
};

const DECORATIVE_TYPES = ['paragraph', 'image'];
const FILE_TYPES = ['file', 'signature'];

const hasAnswer = (answers: PublicFormAnswers, id: string) => {
  const answer = answers[id];

  return Array.isArray(answer)
    ? answer.some((part) => isNonEmptyString(String(part).trim()))
    : answer !== undefined && answer !== null && String(answer).trim() !== '';
};

// Uploads are stored as person attachments named "<question>: <file name>".
const getUploadedFiles = (
  label: string,
  attachments: PersonFormAttachment[],
): PersonFormFile[] =>
  attachments
    .filter((attachment) => attachment.name.startsWith(`${label}: `))
    .map((attachment) => ({
      name: attachment.name.slice(label.length + 2),
      url: attachment.file?.[0]?.url,
    }));

export const buildPersonFormSections = ({
  definition,
  answers,
  attachments,
  labels,
}: {
  definition: PublicFormDefinition;
  answers: PublicFormAnswers | null;
  attachments: PersonFormAttachment[];
  labels: { calculated: string; otherAnswers: string };
}): PersonFormSection[] => {
  const storedAnswers = answers ?? {};
  const sections: PersonFormSection[] = [{ id: 'start', title: null, rows: [] }];
  const knownIds = new Set<string>();
  // Once answered, questions the person never saw (other branches) are left out.
  const visible =
    answers === null
      ? null
      : PUBLIC_FORM_ENGINE.evaluate(definition, storedAnswers).visible;

  const answerOf = (id: string) =>
    hasAnswer(storedAnswers, id)
      ? getFormResponseValue(definition, storedAnswers, id) || null
      : null;

  for (const field of definition.fields) {
    knownIds.add(field.id);

    if (field.type === 'heading' || field.type === 'pageBreak') {
      if (isNonEmptyString(field.label)) {
        sections.push({ id: field.id, title: field.label, rows: [] });
      }
      continue;
    }

    if (
      DECORATIVE_TYPES.includes(field.type) ||
      (visible !== null && visible[field.id] !== true)
    ) {
      continue;
    }

    if (field.type === 'hidden' && !hasAnswer(storedAnswers, field.id)) {
      continue;
    }

    const isFileField = FILE_TYPES.includes(field.type);

    sections[sections.length - 1]?.rows.push({
      id: field.id,
      label: field.label || field.id,
      value: isFileField ? null : answerOf(field.id),
      files:
        isFileField && answers !== null
          ? getUploadedFiles(field.label, attachments)
          : [],
    });
  }

  const calculatedRows = (definition.variables ?? [])
    .map((variable) => {
      knownIds.add(variable.id);

      return {
        id: variable.id,
        label: variable.label || variable.id,
        value: answerOf(variable.id),
        files: [],
      };
    })
    .filter((row) => row.value !== null);

  if (calculatedRows.length > 0) {
    sections.push({
      id: 'calculated',
      title: labels.calculated,
      rows: calculatedRows,
    });
  }

  // Questions removed from the form since this answer was given.
  const otherRows = Object.keys(storedAnswers)
    .filter((id) => !knownIds.has(id) && hasAnswer(storedAnswers, id))
    .map((id) => {
      const answer = storedAnswers[id];

      return {
        id,
        label: id,
        value: Array.isArray(answer) ? answer.join(', ') : String(answer),
        files: [],
      };
    });

  if (otherRows.length > 0) {
    sections.push({ id: 'other', title: labels.otherAnswers, rows: otherRows });
  }

  return sections.filter((section) => section.rows.length > 0);
};
