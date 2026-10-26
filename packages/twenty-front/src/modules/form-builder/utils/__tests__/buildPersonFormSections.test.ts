import { publicFormDefinitionSchema } from 'twenty-shared/utils';

import { buildPersonFormSections } from '@/form-builder/utils/buildPersonFormSections';

const definition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'Application',
  fields: [
    { id: 'name', type: 'shortText', label: 'Name' },
    { id: 'intro', type: 'paragraph', label: 'Read this' },
    { id: 'page2', type: 'pageBreak', label: 'Your work' },
    {
      id: 'role',
      type: 'select',
      label: 'Role',
      options: [{ value: 'DESIGN', label: 'Design' }],
    },
    { id: 'cv', type: 'file', label: 'CV' },
    { id: 'utm', type: 'hidden', label: 'Source' },
    {
      id: 'portfolio',
      type: 'url',
      label: 'Portfolio',
      visibleWhenGroups: [
        {
          match: 'all',
          conditions: [{ fieldId: 'role', operator: 'equals', value: 'DESIGN' }],
        },
      ],
    },
  ],
});

const labels = { calculated: 'Calculated', otherAnswers: 'Other answers' };

describe('buildPersonFormSections', () => {
  it('lists every question with an empty answer when the form was not answered', () => {
    const sections = buildPersonFormSections({
      definition,
      answers: null,
      attachments: [],
      labels,
    });

    expect(sections.map((section) => section.title)).toEqual([
      null,
      'Your work',
    ]);
    expect(
      sections.flatMap((section) =>
        section.rows.map((row) => [row.label, row.value]),
      ),
    ).toEqual([
      ['Name', null],
      ['Role', null],
      ['CV', null],
      ['Portfolio', null],
    ]);
  });

  it('shows labels for choices, uploaded files and answers to removed questions', () => {
    const sections = buildPersonFormSections({
      definition,
      answers: { name: 'Ada', role: 'DESIGN', utm: 'linkedin', old: 'Yes' },
      attachments: [
        { name: 'CV: ada.pdf', file: [{ label: 'ada.pdf', url: 'https://x/a' }] },
        { name: 'Portfolio: ada.zip', file: null },
      ],
      labels,
    });
    const rows = sections.flatMap((section) => section.rows);

    expect(rows.find((row) => row.id === 'role')?.value).toBe('Design');
    expect(rows.find((row) => row.id === 'cv')?.files).toEqual([
      { name: 'ada.pdf', url: 'https://x/a' },
    ]);
    expect(rows.find((row) => row.id === 'utm')?.value).toBe('linkedin');
    expect(rows.find((row) => row.id === 'portfolio')?.value).toBeNull();
    expect(
      buildPersonFormSections({
        definition,
        answers: { name: 'Ada' },
        attachments: [],
        labels,
      })
        .flatMap((section) => section.rows)
        .map((row) => row.id),
    ).not.toContain('portfolio');
    expect(sections.at(-1)).toMatchObject({
      title: 'Other answers',
      rows: [{ id: 'old', value: 'Yes' }],
    });
  });
});
