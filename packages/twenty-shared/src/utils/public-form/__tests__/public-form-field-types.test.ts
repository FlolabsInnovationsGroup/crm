import { buildPublicFormPage } from '../build-public-form-page';
import { buildPublicFormRecordValues } from '../build-public-form-record-values';
import { publicFormDefinitionSchema } from '../public-form-definition-schema';
import { validatePublicFormAnswers } from '../validate-public-form-answers';

const definition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'All types',
  fields: [
    {
      id: 'available',
      type: 'yesNo',
      label: 'Available?',
      required: true,
      mapTo: 'isAvailable',
      options: [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ],
    },
    {
      id: 'stars',
      type: 'rating',
      label: 'Rating',
      scaleMax: 5,
      mapTo: 'rating',
    },
    {
      id: 'nps',
      type: 'scale',
      label: 'Recommend?',
      scaleMin: 0,
      scaleMax: 10,
      minLabel: 'Not likely',
      maxLabel: 'Very likely',
    },
    {
      id: 'hours',
      type: 'slider',
      label: 'Hours',
      scaleMin: 0,
      scaleMax: 40,
      scaleStep: 5,
    },
    { id: 'start', type: 'time', label: 'Start time' },
    {
      id: 'skills',
      type: 'matrix',
      label: 'Skills',
      required: true,
      options: [
        { value: 'react', label: 'React' },
        { value: 'python', label: 'Python' },
      ],
      columns: [
        { value: 'low', label: 'Beginner' },
        { value: 'high', label: 'Expert' },
      ],
      mapTo: 'skillsSummary',
    },
    {
      id: 'home',
      type: 'address',
      label: 'Address',
      required: true,
      mapTo: 'address',
    },
    {
      id: 'terms',
      type: 'consent',
      label: 'I accept the [terms](https://example.com/terms)',
      required: true,
    },
    { id: 'sign', type: 'signature', label: 'Signature' },
  ],
});

const validAnswers = {
  available: 'true',
  stars: '4',
  nps: '9',
  hours: '20',
  start: '09:30',
  skills: ['high', 'low'],
  home: ['1 Nile St', 'Cairo', '', '11511', 'Egypt'],
  terms: true,
};

describe('new field types', () => {
  it('accepts valid answers', () => {
    expect(validatePublicFormAnswers(definition, validAnswers)).toEqual([]);
  });

  it('rejects out-of-range, off-step and incomplete answers', () => {
    const codes = validatePublicFormAnswers(definition, {
      ...validAnswers,
      stars: '6',
      nps: '-1',
      hours: '7',
      start: '25:00',
      skills: ['high', ''],
      home: ['', 'Cairo', '', '', 'Egypt'],
      terms: false,
    }).map((error) => `${error.fieldId}:${error.code}`);

    expect(codes).toEqual([
      'stars:maxValue',
      'nps:minValue',
      'hours:number',
      'start:time',
      'skills:matrix',
      'home:address',
      'terms:required',
    ]);
  });

  it('maps answers to CRM values', () => {
    expect(buildPublicFormRecordValues(definition, validAnswers)).toEqual({
      isAvailable: true,
      rating: 4,
      skillsSummary: 'React: Expert; Python: Beginner',
      address: {
        addressStreet1: '1 Nile St',
        addressCity: 'Cairo',
        addressState: '',
        addressPostcode: '11511',
        addressCountry: 'Egypt',
      },
    });
  });

  it('renders and reads every control in the browser', () => {
    const html = buildPublicFormPage({
      formId: 'form-1',
      definition,
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

    const check = (selector: string) => {
      const input = document.querySelector<HTMLInputElement>(selector);

      if (input === null) throw new Error(`Missing ${selector}`);
      input.checked = true;
    };
    const fill = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement>(selector);

      if (input === null) throw new Error(`Missing ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    check('[name="available"][value="true"]');
    check('[name="stars"][value="4"]');
    check('[name="nps"][value="9"]');
    check('[name="skills__0"][value="high"]');
    check('[name="skills__1"][value="low"]');
    check('[name="terms"]');
    fill('[name="hours"]', '20');
    fill('[name="start"]', '09:30');
    fill('[name="home__street"]', '1 Nile St');
    fill('[name="home__city"]', 'Cairo');
    fill('[name="home__country"]', 'Egypt');

    expect(document.querySelectorAll('.ff-star')).toHaveLength(5);
    expect(document.querySelector('.ff-consent a')?.getAttribute('href')).toBe(
      'https://example.com/terms',
    );
    expect(document.querySelector('.ff-slider-value')?.textContent).toBe('20');

    document
      .getElementById('ff-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(document.getElementById('ff-success')?.hidden).toBe(false);
  });
});
