import { isNonEmptyString } from '@sniptt/guards';

type EmailTemplateRecipient = {
  firstName?: string | null;
  lastName?: string | null;
};

const FIRST_NAME_FALLBACK = 'there';

export const fillEmailTemplateVariables = (
  content: string,
  recipient: EmailTemplateRecipient,
): string => {
  const firstName = isNonEmptyString(recipient.firstName?.trim())
    ? recipient.firstName.trim()
    : FIRST_NAME_FALLBACK;
  const lastName = recipient.lastName?.trim() ?? '';

  return content
    .replace(/{{\s*firstName\s*}}/gi, firstName)
    .replace(/{{\s*lastName\s*}}/gi, lastName);
};
