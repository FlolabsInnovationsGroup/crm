import {
  formatValueForCSV,
  sanitizeValueForCSVExport,
} from 'twenty-shared/utils';

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

const toCsvCell = (value: string | null) =>
  formatValueForCSV(sanitizeValueForCSVExport(value));

export const buildManualReviewHistoryCsv = (
  rows: ManualReviewHistoryCsvRow[],
  headers: ManualReviewHistoryCsvHeaders,
) => {
  const lines = [
    COLUMNS.map((column) => toCsvCell(headers[column])),
    ...rows.map((row) => COLUMNS.map((column) => toCsvCell(row[column]))),
  ];

  // The byte order mark makes Excel read Arabic text correctly.
  return `\uFEFF${lines.map((line) => line.join(',')).join('\r\n')}`;
};
