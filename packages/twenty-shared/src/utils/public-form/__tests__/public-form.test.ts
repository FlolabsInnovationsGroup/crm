import { buildPublicFormRecordValues } from '../build-public-form-record-values';
import { getPublicFormVisibleFieldIds } from '../get-public-form-visible-field-ids';
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

describe('field visibility', () => {
  it('shows a conditional field only when its condition holds', () => {
    expect(
      getPublicFormVisibleFieldIds(definition, { source: 'OTHER' }).has(
        'sourceDetails',
      ),
    ).toBe(true);
    expect(
      getPublicFormVisibleFieldIds(definition, { source: 'LINKEDIN' }).has(
        'sourceDetails',
      ),
    ).toBe(false);
  });

  it('supports empty checks and multi-select answers', () => {
    const teamsDefinition = publicFormDefinitionSchema.parse({
      version: 1,
      title: 'x',
      fields: [
        {
          id: 'teams',
          type: 'multiSelect',
          label: 'Teams',
          options: [
            { value: 'AI', label: 'AI' },
            { value: 'Web', label: 'Web' },
          ],
        },
        { id: 'notes', type: 'shortText', label: 'Notes' },
        {
          id: 'target',
          type: 'shortText',
          label: 'Target',
          visibleWhen: [
            { fieldId: 'teams', operator: 'contains', value: 'ai' },
            { fieldId: 'notes', operator: 'isEmpty' },
          ],
        },
      ],
    });

    expect(
      getPublicFormVisibleFieldIds(teamsDefinition, {
        teams: ['AI', 'Web'],
      }).has('target'),
    ).toBe(true);
    expect(
      getPublicFormVisibleFieldIds(teamsDefinition, {
        teams: ['AI'],
        notes: 'hi',
      }).has('target'),
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
      {
        fieldId: 'sourceDetails',
        code: 'required',
        message: 'This field is required',
      },
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
    ).toEqual([
      {
        fieldId: 'otherOs',
        code: 'required',
        message: 'This field is required',
      },
    ]);
  });
});

describe('logic options', () => {
  const logicDefinition = publicFormDefinitionSchema.parse({
    version: 1,
    title: 'Logic',
    fields: [
      {
        id: 'years',
        type: 'number',
        label: 'Years of experience',
      },
      {
        id: 'track',
        type: 'select',
        label: 'Track',
        options: [
          { value: 'DESIGN', label: 'Design' },
          { value: 'CODE', label: 'Code' },
          { value: 'OTHER', label: 'Other' },
        ],
      },
      {
        id: 'portfolio',
        type: 'url',
        label: 'Portfolio',
        required: true,
        visibleWhenMatch: 'any',
        visibleWhen: [
          { fieldId: 'track', operator: 'equals', value: 'DESIGN' },
          { fieldId: 'years', operator: 'greaterThan', value: '3' },
        ],
      },
      {
        id: 'seniorSection',
        type: 'heading',
        label: 'Senior questions',
        visibleWhen: [
          { fieldId: 'years', operator: 'greaterThan', value: '5' },
        ],
      },
      {
        id: 'leadership',
        type: 'longText',
        label: 'Leadership',
        required: true,
      },
      {
        id: 'codingPage',
        type: 'pageBreak',
        label: 'Coding',
        visibleWhen: [{ fieldId: 'track', operator: 'equals', value: 'CODE' }],
      },
      { id: 'github', type: 'url', label: 'GitHub', required: true },
      { id: 'lastPage', type: 'pageBreak', label: 'Last step' },
      { id: 'notes', type: 'longText', label: 'Notes' },
    ],
  });

  const visibleIds = (answers: Record<string, string>) => [
    ...getPublicFormVisibleFieldIds(logicDefinition, answers),
  ];

  it('shows a field when any condition matches', () => {
    expect(visibleIds({ years: '1', track: 'DESIGN' })).toContain('portfolio');
    expect(visibleIds({ years: '4', track: 'OTHER' })).toContain('portfolio');
    expect(visibleIds({ years: '1', track: 'OTHER' })).not.toContain(
      'portfolio',
    );
  });

  it('compares numbers instead of text', () => {
    expect(visibleIds({ years: '10', track: 'OTHER' })).toContain('portfolio');
  });

  it('hides a whole section with its heading', () => {
    expect(visibleIds({ years: '2' })).not.toContain('leadership');
    expect(visibleIds({ years: '6' })).toContain('leadership');
  });

  it('skips a whole page and starts showing again at the next page', () => {
    const designAnswers = { years: '1', track: 'DESIGN' };

    expect(visibleIds(designAnswers)).not.toContain('github');
    expect(visibleIds(designAnswers)).toContain('notes');
    expect(
      validatePublicFormAnswers(logicDefinition, {
        ...designAnswers,
        portfolio: 'https://example.com',
      }),
    ).toEqual([]);
  });
});
