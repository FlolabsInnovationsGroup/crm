import { isNonEmptyString } from '@sniptt/guards';
import {
  publicFormDefinitionSchema,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

import { createDefaultFormDefinition } from '@/form-builder/utils/createDefaultFormDefinition';

// RAW_JSON fields can come back as a string depending on how they were saved.
export const parseStoredFormDefinition = (
  storedDefinition: unknown,
  fallbackTitle: string,
): PublicFormDefinition => {
  let candidate: unknown = storedDefinition;

  if (isNonEmptyString(storedDefinition)) {
    try {
      candidate = JSON.parse(storedDefinition);
    } catch {
      candidate = null;
    }
  }

  const parsed = publicFormDefinitionSchema.safeParse(candidate);

  return parsed.success
    ? parsed.data
    : createDefaultFormDefinition(fallbackTitle);
};
