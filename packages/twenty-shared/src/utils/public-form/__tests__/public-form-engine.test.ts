import { buildPublicFormPage } from '../build-public-form-page';
import {
  publicFormDefinitionSchema,
  type PublicFormDefinitionInput,
} from '../public-form-definition-schema';
import {
  createPublicFormEngine,
  PUBLIC_FORM_ENGINE as engine,
  type PublicFormEngine,
} from '../public-form-engine';
import { validatePublicFormAnswers } from '../validate-public-form-answers';

const parse = (input: Omit<PublicFormDefinitionInput, 'version' | 'title'>) =>
  publicFormDefinitionSchema.parse({ version: 1, title: 'Form', ...input });

const applicationForm = parse({
  fields: [
    { id: 'name', type: 'shortText', label: 'Name', required: true },
    {
      id: 'experience',
      type: 'select',
      label: 'Worked before?',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    { id: 'years', type: 'number', label: 'Years' },
    {
      id: 'skills',
      type: 'multiSelect',
      label: 'Skills',
      options: [
        { value: 'react', label: 'React' },
        { value: 'python', label: 'Python' },
        { value: 'figma', label: 'Figma' },
      ],
      validation: { maxLength: 2 },
    },
    {
      id: 'company',
      type: 'shortText',
      label: 'Company for {{name}}',
      requiredWhenGroups: [
        {
          match: 'all',
          conditions: [
            { fieldId: 'experience', operator: 'equals', value: 'yes' },
          ],
        },
      ],
    },
    {
      id: 'senior',
      type: 'shortText',
      label: 'Lead experience',
      visibleWhenGroups: [
        {
          match: 'all',
          conditions: [
            { fieldId: 'score', operator: 'greaterOrEqual', value: '30' },
          ],
        },
        {
          match: 'all',
          conditions: [
            { fieldId: 'skills', operator: 'contains', value: 'figma' },
            { fieldId: 'experience', operator: 'equals', value: 'yes' },
          ],
        },
      ],
    },
  ],
  variables: [
    {
      id: 'score',
      label: 'Score',
      formula:
        '{years} * 10 + if({experience} = "yes", 5, 0) + len({skills}) * 2',
    },
    { id: 'grade', label: 'Grade', formula: '{score} >= 30 ? "A" : "B"' },
  ],
  endings: [
    {
      id: 'strong',
      label: 'Strong',
      when: [
        {
          match: 'all',
          conditions: [{ fieldId: 'grade', operator: 'equals', value: 'A' }],
        },
      ],
      message: 'Great fit, {{name}}!',
      redirectUrl: 'https://example.com/next?name={{name}}',
    },
    { id: 'default', label: 'Everyone else', message: 'Thanks {{name}}' },
  ],
});

describe('public form engine', () => {
  it('computes variables in order from visible answers', () => {
    const evaluation = engine.evaluate(applicationForm, {
      name: 'Ada',
      experience: 'yes',
      years: '2',
      skills: ['react', 'python'],
    });

    expect(evaluation.variables).toEqual({ score: 29, grade: 'B' });
  });

  it('combines condition groups with OR and conditions with AND', () => {
    const visibleFor = (answers: Record<string, string | string[]>) =>
      engine.evaluate(applicationForm, answers).visible.senior === true;

    expect(visibleFor({ years: '3' })).toBe(true);
    expect(visibleFor({ skills: ['figma'], experience: 'yes' })).toBe(true);
    expect(visibleFor({ skills: ['figma'], experience: 'no' })).toBe(false);
  });

  it('makes a field required only when its conditions hold', () => {
    const company = applicationForm.fields[4];

    expect(
      engine.isFieldRequired(
        company,
        engine.evaluate(applicationForm, { experience: 'yes' }),
      ),
    ).toBe(true);
    expect(
      validatePublicFormAnswers(applicationForm, {
        name: 'Ada',
        experience: 'no',
      }),
    ).toEqual([]);
    expect(
      validatePublicFormAnswers(applicationForm, {
        name: 'Ada',
        experience: 'yes',
      }).map((error) => error.fieldId),
    ).toEqual(['company']);
  });

  it('applies validation rules with readable messages', () => {
    const errors = validatePublicFormAnswers(applicationForm, {
      name: 'Ada',
      skills: ['react', 'python', 'figma'],
    });

    expect(errors).toEqual([
      {
        fieldId: 'skills',
        code: 'maxSelections',
        params: { n: '2' },
        message: 'Choose at most 2 options',
      },
    ]);
  });

  it('uses a custom message for patterns', () => {
    const form = parse({
      fields: [
        {
          id: 'code',
          type: 'shortText',
          label: 'Code',
          validation: { pattern: '^FL-\\d{4}$', patternMessage: 'Use FL-1234' },
        },
      ],
    });

    expect(validatePublicFormAnswers(form, { code: 'FL-12' })[0]?.message).toBe(
      'Use FL-1234',
    );
    expect(validatePublicFormAnswers(form, { code: 'FL-1234' })).toEqual([]);
  });

  it('pipes answers into texts using option labels', () => {
    const evaluation = engine.evaluate(applicationForm, {
      name: 'Ada & co',
      experience: 'yes',
    });

    expect(
      engine.interpolate(
        '{{name}} said {{experience}}',
        applicationForm,
        evaluation,
      ),
    ).toBe('Ada & co said Yes');
    expect(
      engine.interpolate(
        'https://x.test/?n={{name}}',
        applicationForm,
        evaluation,
        encodeURIComponent,
      ),
    ).toBe('https://x.test/?n=Ada%20%26%20co');
  });

  it('picks the first ending whose conditions hold', () => {
    const endingFor = (years: string) =>
      engine.findEnding(
        applicationForm,
        engine.evaluate(applicationForm, { name: 'Ada', years }),
      )?.id;

    expect(endingFor('5')).toBe('strong');
    expect(endingFor('1')).toBe('default');
  });

  it('evaluates formulas safely', () => {
    const form = parse({
      fields: [{ id: 'a', type: 'number', label: 'A' }],
      variables: [
        { id: 'divided', label: 'x', formula: '10 / {a}' },
        { id: 'rounded', label: 'x', formula: 'round(2 / 3, 2)' },
        { id: 'text', label: 'x', formula: 'concat(upper("a"), "-", {a})' },
        { id: 'logic', label: 'x', formula: 'not ({a} > 1 and {a} < 3)' },
      ],
    });

    expect(engine.evaluate(form, { a: '0' }).variables).toEqual({
      divided: 0,
      rounded: 0.67,
      text: 'A-0',
      logic: true,
    });
    expect(engine.evaluate(form, { a: '2' }).variables.logic).toBe(false);
  });

  it('rejects broken formulas, unknown references and bad patterns', () => {
    const issuesOf = (
      input: Omit<PublicFormDefinitionInput, 'version' | 'title'>,
    ) => {
      const result = publicFormDefinitionSchema.safeParse({
        version: 1,
        title: 'Form',
        ...input,
      });

      return result.success
        ? []
        : result.error.issues.map((issue) => issue.message);
    };

    expect(
      issuesOf({
        fields: [],
        variables: [{ id: 'v', label: 'v', formula: '1 +' }],
      }),
    ).toHaveLength(1);
    expect(
      issuesOf({
        fields: [],
        variables: [{ id: 'v', label: 'v', formula: '{nope}' }],
      }),
    ).toEqual(['Unknown or later reference "{nope}"']);
    expect(
      issuesOf({
        fields: [
          {
            id: 'a',
            type: 'shortText',
            label: 'A',
            validation: { pattern: '(' },
          },
        ],
      }),
    ).toEqual(['Invalid regular expression']);
    expect(
      issuesOf({
        fields: [],
        variables: [{ id: 'v', label: 'v', formula: 'eval(1)' }],
      }),
    ).toEqual(['Unknown function "eval"']);
  });

  it('behaves the same once serialized for the browser', () => {
    const browserEngine = new Function(
      `return (${createPublicFormEngine.toString()})();`,
    )() as PublicFormEngine;
    const answers = {
      name: 'Ada',
      experience: 'yes',
      years: '3',
      skills: ['figma'],
    };

    expect(browserEngine.evaluate(applicationForm, answers)).toEqual(
      engine.evaluate(applicationForm, answers),
    );
  });
});

describe('public form page script', () => {
  const loadPage = () => {
    const html = buildPublicFormPage({
      formId: 'form-1',
      definition: applicationForm,
      submitUrl: '/forms/x/form-1',
      isEmbedded: false,
      nonce: 'nonce',
      isPreview: true,
    });
    const scriptStart = html.indexOf('<script nonce="nonce">') + 22;
    const script = html.slice(
      scriptStart,
      html.indexOf('</script>', scriptStart),
    );

    document.documentElement.innerHTML = html
      .replace(/^<!doctype html>\s*<html[^>]*>/i, '')
      .replace(/<\/html>\s*$/i, '');
    (window as unknown as { CSS: { escape: (value: string) => string } }).CSS =
      {
        escape: (value: string) => value,
      };
    new Function(script)();
  };

  const type = (fieldId: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(
      `[data-field-id="${fieldId}"] input`,
    );

    if (input === null) throw new Error(`No input for ${fieldId}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const choose = (fieldId: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(
      `[data-field-id="${fieldId}"] input[value="${value}"]`,
    );

    if (input === null) throw new Error(`No option ${value}`);
    input.checked = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const submit = () =>
    document
      .getElementById('ff-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  it('pipes answers, toggles conditional requirement and shows the matching ending', () => {
    loadPage();

    type('name', 'Ada');
    expect(
      document.querySelector('[data-field-id="company"] .ff-label')
        ?.textContent,
    ).toContain('Company for Ada');

    const companyMark = document.querySelector<HTMLElement>(
      '[data-field-id="company"] [data-required-when]',
    );

    expect(companyMark?.hidden).toBe(true);
    choose('experience', 'yes');
    expect(companyMark?.hidden).toBe(false);

    submit();
    expect(
      document.querySelector('[data-field-id="company"] .ff-error')
        ?.textContent,
    ).toBe('This field is required');

    type('company', 'FloLabs');
    type('years', '1');
    submit();

    expect(document.getElementById('ff-success-message')?.textContent).toBe(
      'Thanks Ada',
    );
  });
});
