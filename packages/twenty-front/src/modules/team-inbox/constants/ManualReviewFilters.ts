import { type ManualReviewFilter } from '@/team-inbox/types/ManualReviewFilter';

export const MANUAL_REVIEW_FILTERS: ManualReviewFilter[] = [
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A filter id, not text.
  'ALL',
  'QUESTION',
  'NOT_INTERESTED',
  'APPROVAL',
  'AUTOMATION',
  'EMAILED_SINCE',
  'DONE',
];
