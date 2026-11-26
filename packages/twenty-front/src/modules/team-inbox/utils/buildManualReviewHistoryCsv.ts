import { isNonEmptyString } from '@sniptt/guards';

export type ManualReviewHistoryCsvRow = {
  doneAt: string | null;
  doneByName: string | null;
  applicantEmail: string | null;
  kind: string;
  reason: string | null;
  stage: string | null;
  applicantMessage: string;
  suggestedTemplate: string | null;
  replyText: string | null;
  replySentAt: string | null;
  reviewReceivedAt: string | null;
};

export type ManualReviewHistoryCsvHeaders = Record<
  keyof ManualReviewHistoryCsvRow,
  string
>;

const COLUMNS: (keyof ManualReviewHistoryCsvRow)[] = [
  'doneAt',
  'doneByName',
  'applicantEmail',
  'kind',
  'reason',
  'stage',
  'applicantMessage',
  'suggestedTemplate',
  'replyText',
  'replySentAt',
  'reviewReceivedAt',
];

// Applicants write these cells, so a leading formula character is neutralised
// before Excel or Sheets can run it.
const neutraliseFormula = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

const escapeCsvCell = (value: string | null) => {
  const text = isNonEmptyString(value) ? neutraliseFormula(value) : '';

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildManualReviewHistoryCsv = (
  rows: ManualReviewHistoryCsvRow[],
  headers: ManualReviewHistoryCsvHeaders,
) => {
  const lines = [
    COLUMNS.map((column) => escapeCsvCell(headers[column])),
    ...rows.map((row) => COLUMNS.map((column) => escapeCsvCell(row[column]))),
  ];

  // The byte order mark makes Excel read Arabic text correctly.
  return `﻿${lines.map((line) => line.join(',')).join('\r\n')}`;
};
