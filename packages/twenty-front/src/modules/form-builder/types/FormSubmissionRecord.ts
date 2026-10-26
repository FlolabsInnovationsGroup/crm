import { type PublicFormAnswers } from 'twenty-shared/utils';

export type FormSubmissionRecord = {
  id: string;
  answers: PublicFormAnswers | null;
  createdAt: string;
  sourceUrl: string | null;
  person: {
    id: string;
    name: { firstName: string; lastName: string } | null;
    emails: { primaryEmail: string } | null;
  } | null;
};
