import { publicFormDefinitionSchema } from 'twenty-shared/utils';

import { buildPublicFormPage } from 'src/modules/public-form/utils/build-public-form-page.util';

const buildPage = (overrides: Record<string, unknown> = {}) =>
  buildPublicFormPage({
    formId: 'form-1',
    submitUrl: '/forms/workspace-1/form-1',
    isEmbedded: false,
    nonce: 'nonce-1',
    definition: publicFormDefinitionSchema.parse({
      version: 1,
      title: 'Apply <now>',
      fields: [
        {
          id: 'track',
          type: 'select',
          label: 'Track',
          options: [{ value: 'DESIGN', label: 'Design </script>' }],
        },
      ],
      ...overrides,
    }),
  });

describe('buildPublicFormPage', () => {
  it('escapes user text in markup and in the embedded definition', () => {
    const page = buildPage();

    expect(page).toContain('<title>Apply &lt;now&gt;</title>');
    expect(page).toContain('Design &lt;/script&gt;');
    expect(page.match(/<\/script>/g)).toHaveLength(3);
  });

  it('only runs the nonced script and cannot be broken out of by custom CSS', () => {
    const page = buildPage({
      theme: { customCss: '</style><script>alert(1)</script>' },
    });

    expect(page).toContain('<script nonce="nonce-1">');
    expect(page).not.toContain('</style><script>alert(1)');
  });

  it('sets language and direction from the definition', () => {
    const page = buildPage({
      theme: { direction: 'rtl' },
      settings: { language: 'ar' },
    });

    expect(page).toContain('<html lang="ar" dir="rtl">');
  });
});
