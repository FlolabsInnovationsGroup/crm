import { getPublicFormVisibleFieldIds } from '../get-public-form-visible-field-ids';
import {
  publicFormDefinitionSchema,
  type PublicFormAnswers,
} from '../public-form-definition-schema';
import { PUBLIC_FORM_VISIBILITY_SCRIPT } from '../public-form-visibility-script';

type BrowserVisibility = (
  definition: unknown,
  answers: PublicFormAnswers,
) => Record<string, true>;

// oxlint-disable-next-line no-new-func
const browserVisibleFieldIds = new Function(
  `${PUBLIC_FORM_VISIBILITY_SCRIPT}; return flolabsVisibleFieldIds;`,
)() as BrowserVisibility;

const definition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'Parity',
  fields: [
    { id: 'years', type: 'number', label: 'Years' },
    {
      id: 'track',
      type: 'select',
      label: 'Track',
      options: [
        { value: 'DESIGN', label: 'Design' },
        { value: 'CODE', label: 'Code' },
      ],
    },
    { id: 'agree', type: 'checkbox', label: 'Agree' },
    {
      id: 'skills',
      type: 'multiSelect',
      label: 'Skills',
      options: [
        { value: 'FIGMA', label: 'Figma' },
        { value: 'REACT', label: 'React' },
      ],
    },
    {
      id: 'either',
      type: 'shortText',
      label: 'Either',
      visibleWhenMatch: 'any',
      visibleWhen: [
        { fieldId: 'track', operator: 'equals', value: 'design' },
        { fieldId: 'years', operator: 'lessThan', value: '2' },
      ],
    },
    {
      id: 'section',
      type: 'heading',
      label: 'Section',
      visibleWhen: [{ fieldId: 'agree', operator: 'isNotEmpty' }],
    },
    {
      id: 'inSection',
      type: 'shortText',
      label: 'In section',
      visibleWhen: [{ fieldId: 'skills', operator: 'contains', value: 'rea' }],
    },
    {
      id: 'page',
      type: 'pageBreak',
      label: 'Page',
      visibleWhen: [{ fieldId: 'years', operator: 'greaterThan', value: '9' }],
    },
    { id: 'onPage', type: 'shortText', label: 'On page' },
    {
      id: 'dependsOnHidden',
      type: 'shortText',
      label: 'Depends on hidden',
      visibleWhen: [{ fieldId: 'inSection', operator: 'isEmpty' }],
    },
  ],
});

const ANSWER_SETS: PublicFormAnswers[] = [
  {},
  { years: '1' },
  { years: '10', track: 'CODE' },
  { years: '3', track: 'DESIGN', agree: true, skills: ['REACT'] },
  { years: '12', agree: false, skills: ['FIGMA'], inSection: 'x' },
  { years: 'abc', track: 'CODE', agree: true, skills: [] },
  { years: '9', agree: true, skills: ['FIGMA', 'REACT'], inSection: '' },
];

describe('browser visibility script', () => {
  it.each(ANSWER_SETS)('matches the shared rules for %j', (answers) => {
    expect(
      Object.keys(browserVisibleFieldIds(definition, answers)).sort(),
    ).toEqual([...getPublicFormVisibleFieldIds(definition, answers)].sort());
  });
});
