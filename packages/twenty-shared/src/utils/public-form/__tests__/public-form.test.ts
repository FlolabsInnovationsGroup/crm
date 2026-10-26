import { buildPublicFormRecordValues } from '../build-public-form-record-values';
import { isPublicFormFieldVisible } from '../is-public-form-field-visible';
import {
  publicFormDefinitionSchema,
  type PublicFormDefinition,
} from '../public-form-definition-schema';
import { validatePublicFormAnswers } from '../validate-public-form-answers';

const definition: PublicFormDefinition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'Internship application',
  fields: [
    {
      id: 'firstName',
      type: 'shortText',
      label: 'First name',
      required: true,
      mapTo: 'name.firstName',
    },
    {
      id: 'lastName',
      type: 'shortText',
      label: 'Last name',
      mapTo: 'name.lastName',
    },
    {
      id: 'email',
      type: 'email',
      label: 'Email',
      required: true,
      mapTo: 'emails.primaryEmail',
    },
    {
      id: 'source',
      type: 'select',
      label: 'How did you hear about us?',
      required: true,
      options: [
        { value: 'LINKEDIN', label: 'LinkedIn' },
        { value: 'OTHER', label: 'Other' },
      ],
      mapTo: 'applicantSource',
    },
    {
      id: 'sourceDetails',
      type: 'shortText',
      label: 'Please specify',
      required: true,
      mapTo: 'otherSourceDetails',
      visibleWhen: [{ fieldId: 'source', operator: 'equals', value: 'OTHER' }],
    },
    { id: 'intro', type: 'heading', label: 'About you' },
  ],
});

describe('public form definition', () => {
  it('fills theme and settings defaults', () => {
    expect(definition.theme.submitButtonLabel).toBe('Submit');
    expect(definition.settings.successMessage).toContain('Thank you');
  });

  it('rejects colors that are not #RRGGBB', () => {
    expect(
      publicFormDefinitionSchema.safeParse({
        version: 1,
        title: 'x',
        fields: [],
        theme: { primaryColor: 'red' },
      }).success,
    ).toBe(false);
  });
});

describe('isPublicFormFieldVisible', () => {
  const sourceDetails = definition.fields[4];

  it('shows a conditional field only when its condition holds', () => {
    expect(isPublicFormFieldVisible(sourceDetails, { source: 'OTHER' })).toBe(
      true,
    );
    expect(
      isPublicFormFieldVisible(sourceDetails, { source: 'LINKEDIN' }),
    ).toBe(false);
  });

  it('supports empty checks and multi-select answers', () => {
    const field = {
      ...sourceDetails,
      visibleWhen: [
        { fieldId: 'teams', operator: 'contains' as const, value: 'ai' },
        { fieldId: 'notes', operator: 'isEmpty' as const },
      ],
    };

    expect(isPublicFormFieldVisible(field, { teams: ['AI', 'Web'] })).toBe(
      true,
    );
    expect(
      isPublicFormFieldVisible(field, { teams: ['AI'], notes: 'hi' }),
    ).toBe(false);
  });
});

describe('validatePublicFormAnswers', () => {
  it('requires visible required fields only', () => {
    const errors = validatePublicFormAnswers(definition, {
      firstName: 'Ada',
      email: 'ada@example.com',
      source: 'LINKEDIN',
    });

    expect(errors).toEqual([]);
  });

  it('reports missing conditional fields once they become visible', () => {
    const errors = validatePublicFormAnswers(definition, {
      firstName: 'Ada',
      email: 'ada@example.com',
      source: 'OTHER',
    });

    expect(errors).toEqual([
      { fieldId: 'sourceDetails', message: 'This field is required' },
    ]);
  });

  it('checks formats and allowed options', () => {
    const errors = validatePublicFormAnswers(definition, {
      firstName: 'Ada',
      email: 'not-an-email',
      source: 'TIKTOK',
    });

    expect(errors.map((error) => error.fieldId)).toEqual(['email', 'source']);
  });
});

describe('buildPublicFormRecordValues', () => {
  it('maps visible answers onto record fields, merging composite fields', () => {
    expect(
      buildPublicFormRecordValues(definition, {
        firstName: ' Ada ',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        source: 'LINKEDIN',
        sourceDetails: 'ignored because hidden',
      }),
    ).toEqual({
      name: { firstName: 'Ada', lastName: 'Lovelace' },
      emails: { primaryEmail: 'ada@example.com' },
      applicantSource: 'LINKEDIN',
    });
  });

  it('skips empty answers so they never erase existing data', () => {
    expect(
      buildPublicFormRecordValues(definition, {
        firstName: 'Ada',
        lastName: '   ',
        email: 'ada@example.com',
        source: 'LINKEDIN',
      }),
    ).toEqual({
      name: { firstName: 'Ada' },
      emails: { primaryEmail: 'ada@example.com' },
      applicantSource: 'LINKEDIN',
    });
  });
});

describe('chained conditions', () => {
  const chainedDefinition = publicFormDefinitionSchema.parse({
    version: 1,
    title: 'Chained',
    fields: [
      {
        id: 'hasLaptop',
        type: 'select',
        label: 'Do you have a laptop?',
        options: [
          { value: 'YES', label: 'Yes' },
          { value: 'NO', label: 'No' },
        ],
      },
      {
        id: 'laptopOs',
        type: 'select',
        label: 'Which OS?',
        options: [
          { value: 'MAC', label: 'macOS' },
          { value: 'OTHER', label: 'Other' },
        ],
        visibleWhen: [
          { fieldId: 'hasLaptop', operator: 'equals', value: 'YES' },
        ],
      },
      {
        id: 'otherOs',
        type: 'shortText',
        label: 'Which one?',
        required: true,
        mapTo: 'jobTitle',
        visibleWhen: [
          { fieldId: 'laptopOs', operator: 'equals', value: 'OTHER' },
        ],
      },
      { id: 'utm', type: 'hidden', label: 'Source', mapTo: 'city' },
    ],
  });

  it('hides a field whose parent is hidden even if a stale answer remains', () => {
    const answers = { hasLaptop: 'NO', laptopOs: 'OTHER', utm: 'linkedin' };

    expect(validatePublicFormAnswers(chainedDefinition, answers)).toEqual([]);
    expect(buildPublicFormRecordValues(chainedDefinition, answers)).toEqual({
      city: 'linkedin',
    });
  });

  it('requires the grandchild once the whole chain is visible', () => {
    expect(
      validatePublicFormAnswers(chainedDefinition, {
        hasLaptop: 'YES',
        laptopOs: 'OTHER',
      }),
    ).toEqual([{ fieldId: 'otherOs', message: 'This field is required' }]);
  });
});
