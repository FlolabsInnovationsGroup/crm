import { t } from '@lingui/core/macro';
import {
  type PublicFormAction,
  type PublicFormActionType,
} from 'twenty-shared/utils';

export const createFormAction = (
  type: PublicFormActionType,
  id: string,
  formTitle: string,
): PublicFormAction => {
  const base = { id, whenMatch: 'any' as const };

  switch (type) {
    case 'setPersonValues':
      return { ...base, type, values: [] };
    case 'createTask':
      return {
        ...base,
        type,
        title: t`Follow up with the new applicant`,
        dueInDays: 2,
      };
    case 'notifyTeam':
      return {
        ...base,
        type,
        to: '',
        subject: t`New submission: ${formTitle}`,
      };
    case 'autoReply':
      return {
        ...base,
        type,
        subject: t`We received your answers`,
        body: t`Thank you! We received your answers and will get back to you soon.`,
      };
  }
};
