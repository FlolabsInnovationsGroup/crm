import { type PublicFormEngineError } from './public-form-engine';
import { type PublicFormPageMessages } from './public-form-page-messages';

export const formatPublicFormError = (
  error: PublicFormEngineError,
  messages: PublicFormPageMessages,
): string => {
  if (error.message !== undefined && error.message !== '') {
    return error.message;
  }

  const template =
    (messages as Record<string, string>)[error.code] ?? messages.genericError;

  return template.replace('{n}', error.params?.n ?? '');
};
