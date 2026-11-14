import { isNonEmptyString } from '@sniptt/guards';
import {
  type PublicFormAnswers,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

import { getFormResponseValue } from '@/form-builder/utils/getFormResponseValue';
import { NOTIFICATION_DETAIL_FIELD_IDS } from '@/notifications/constants/NotificationDetailFieldIds';

export const getFormSubmissionDetail = (
  definition: PublicFormDefinition,
  answers: PublicFormAnswers,
) =>
  NOTIFICATION_DETAIL_FIELD_IDS.filter((fieldId) => fieldId in answers)
    .map((fieldId) => getFormResponseValue(definition, answers, fieldId))
    .find(isNonEmptyString) ?? '';
