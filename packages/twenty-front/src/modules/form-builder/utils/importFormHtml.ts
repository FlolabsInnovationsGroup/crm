import { type PublicFormField } from 'twenty-shared/utils';

import { createFormField } from '@/form-builder/utils/createFormField';

type ImportedForm = { fields: PublicFormField[]; html: string };

const INPUT_TYPE_TO_FIELD_TYPE: Record<string, PublicFormField['type']> = {
  text: 'shortText',
  search: 'shortText',
  email: 'email',
  tel: 'phone',
  number: 'number',
  url: 'url',
  date: 'date',
  time: 'time',
  range: 'slider',
  file: 'file',
  hidden: 'hidden',
};

const IGNORED_INPUT_TYPES = ['submit', 'button', 'reset', 'image', 'password'];

const toFieldId = (raw: string, takenIds: string[]) => {
  const base =
    raw
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^[^a-zA-Z]+/, '')
      .slice(0, 48) || 'field';
  let candidate = base;
  let index = 2;

  while (takenIds.includes(candidate)) {
    candidate = `${base}_${index}`;
    index++;
  }

  return candidate;
};

const findLabelText = (document: Document, element: Element): string => {
  const id = element.getAttribute('id');
  const explicitLabel =
    id === null
      ? undefined
      : [...document.querySelectorAll('label')].find(
          (label) => label.htmlFor === id,
        );
  const text =
    explicitLabel?.textContent ??
    element.closest('label')?.textContent ??
    element.getAttribute('aria-label') ??
    element.getAttribute('placeholder') ??
    element.getAttribute('name') ??
    '';

  return text.replace(/\s+/g, ' ').replace(/\*/g, '').trim();
};

const optionLabelOf = (document: Document, input: Element) =>
  findLabelText(document, input) || (input.getAttribute('value') ?? '');

// Turns a pasted form (HubSpot, Typeform export, hand-written…) into fields
// plus the same markup with inputs renamed to the field ids, ready to style.
export const importFormHtml = (html: string): ImportedForm => {
  const document = new DOMParser().parseFromString(html, 'text/html');

  document
    .querySelectorAll('script, style, link, iframe, object, embed')
    .forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name) || attribute.name === 'action') {
        element.removeAttribute(attribute.name);
      }
    });
  });
  document
    .querySelectorAll(
      'button[type=submit], input[type=submit], input[type=image], input[type=reset], button:not([type])',
    )
    .forEach((element) => element.remove());

  const fields: PublicFormField[] = [];
  const takenIds: string[] = [];
  const renamed = new Map<string, string>();

  const controls = [
    ...document.querySelectorAll('input, select, textarea'),
  ].filter(
    (control) =>
      !IGNORED_INPUT_TYPES.includes(
        (control.getAttribute('type') ?? '').toLowerCase(),
      ),
  );

  for (const control of controls) {
    const originalName =
      control.getAttribute('name') ?? control.getAttribute('id') ?? 'field';

    if (renamed.has(originalName)) {
      control.setAttribute('name', renamed.get(originalName) ?? originalName);
      continue;
    }

    const inputType = (control.getAttribute('type') ?? 'text').toLowerCase();
    const sameNamed = controls.filter(
      (other) =>
        (other.getAttribute('name') ?? other.getAttribute('id')) ===
        originalName,
    );
    const id = toFieldId(originalName, takenIds);
    const base = createFormField('shortText', takenIds);
    let field: PublicFormField = {
      ...base,
      id,
      label: findLabelText(document, control) || originalName,
      required: control.hasAttribute('required'),
      placeholder: control.getAttribute('placeholder') ?? undefined,
    };

    if (control.tagName === 'SELECT') {
      field = {
        ...field,
        type: (control as HTMLSelectElement).multiple
          ? 'multiSelect'
          : 'select',
        choiceDisplay: 'dropdown',
        options: [...control.querySelectorAll('option')]
          .filter(
            (option) =>
              (option.getAttribute('value') ?? option.textContent) !== '',
          )
          .map((option) => ({
            value:
              option.getAttribute('value') ?? option.textContent?.trim() ?? '',
            label: option.textContent?.trim() ?? '',
          })),
      };
    } else if (control.tagName === 'TEXTAREA') {
      field = { ...field, type: 'longText' };
    } else if (
      inputType === 'radio' ||
      (inputType === 'checkbox' && sameNamed.length > 1)
    ) {
      const groupLabel = control
        .closest('fieldset')
        ?.querySelector('legend')
        ?.textContent?.trim();

      field = {
        ...field,
        type: inputType === 'radio' ? 'select' : 'multiSelect',
        choiceDisplay: 'buttons',
        label: groupLabel || originalName,
        options: sameNamed.map((input) => ({
          value: input.getAttribute('value') ?? 'on',
          label: optionLabelOf(document, input),
        })),
      };
    } else if (inputType === 'checkbox') {
      field = { ...field, type: 'checkbox' };
    } else {
      field = {
        ...field,
        type: INPUT_TYPE_TO_FIELD_TYPE[inputType] ?? 'shortText',
      };
    }

    fields.push(field);
    takenIds.push(id);
    renamed.set(originalName, id);
    control.setAttribute('name', id);
  }

  const form = document.querySelector('form');

  return {
    fields,
    html: (form ?? document.body).innerHTML.trim(),
  };
};
