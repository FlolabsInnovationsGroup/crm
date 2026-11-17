import { isNonEmptyString } from '@sniptt/guards';

// Typed subjects and a reply's "Re:" stay, so replies keep Gmail threading.
export const getSubjectAfterTemplateChange = ({
  currentSubject,
  previousTemplateSubject,
  templateSubject,
}: {
  currentSubject: string;
  previousTemplateSubject: string | null;
  templateSubject: string;
}) =>
  !isNonEmptyString(currentSubject.trim()) ||
  currentSubject === previousTemplateSubject
    ? templateSubject
    : currentSubject;
