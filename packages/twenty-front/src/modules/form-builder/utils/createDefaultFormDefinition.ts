import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_DEFINITION_VERSION,
  publicFormDefinitionSchema,
  type PublicFormDefinition,
} from 'twenty-shared/utils';

export const createDefaultFormDefinition = (
  title: string,
): PublicFormDefinition =>
  publicFormDefinitionSchema.parse({
    version: PUBLIC_FORM_DEFINITION_VERSION,
    title,
    fields: [
      {
        id: 'firstName',
        type: 'shortText',
        label: t`First name`,
        required: true,
        width: 'half',
        mapTo: 'name.firstName',
      },
      {
        id: 'lastName',
        type: 'shortText',
        label: t`Last name`,
        required: true,
        width: 'half',
        mapTo: 'name.lastName',
      },
      {
        id: 'email',
        type: 'email',
        label: t`Email`,
        required: true,
        mapTo: 'emails.primaryEmail',
      },
    ],
  });
