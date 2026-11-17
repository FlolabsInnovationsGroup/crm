import { isNonEmptyString } from '@sniptt/guards';

// A subject the sender typed, or a reply's "Re:", is kept. One that only
// came from the previous template follows the new one, even when empty.
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
