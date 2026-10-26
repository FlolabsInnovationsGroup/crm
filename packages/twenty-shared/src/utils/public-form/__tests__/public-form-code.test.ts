import {
  buildPublicFormContentSecurityPolicy,
  buildPublicFormFieldsMarkup,
  buildPublicFormPage,
} from '../build-public-form-page';
import {
  publicFormDefinitionSchema,
  type PublicFormDefinitionInput,
} from '../public-form-definition-schema';

const fields: PublicFormDefinitionInput['fields'] = [
  { id: 'intro', type: 'heading', label: 'About you' },
  { id: 'name', type: 'shortText', label: 'Name', required: true },
  { id: 'email', type: 'email', label: 'Email', required: true },
  { id: 'source', type: 'hidden', label: 'Source' },
];

const loadPage = (input: Partial<PublicFormDefinitionInput>) => {
  const definition = publicFormDefinitionSchema.parse({
    version: 1,
    title: 'Code',
    fields,
    ...input,
  });
  const html = buildPublicFormPage({
    formId: 'form-1',
    definition,
    submitUrl: '/forms/x/form-1',
    isEmbedded: false,
    nonce: 'nonce',
    isPreview: true,
  });
  const scripts = [
    ...html.matchAll(/<script nonce="nonce">([\s\S]*?)<\/script>/g),
  ].map((match) => match[1] ?? '');

  document.documentElement.innerHTML = html
    .replace(/^<!doctype html>\s*<html[^>]*>/i, '')
    .replace(/<\/html>\s*$/i, '');
  (window as unknown as { CSS: { escape: (value: string) => string } }).CSS = {
    escape: (value: string) => value,
  };
  scripts.forEach((script) => new Function(script)());
};

const submit = () =>
  document
    .getElementById('ff-form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

describe('form layouts and custom code', () => {
  it('shows one question per screen in the conversational layout', () => {
    loadPage({ theme: { layout: 'conversational' } });

    const steps = document.querySelectorAll('.ff-step');

    expect(steps).toHaveLength(2);
    expect(steps[0]?.textContent).toContain('About you');
    expect(steps[0]?.textContent).toContain('Name');
    expect(
      (document.getElementById('ff-progress-bar') as HTMLElement).hidden,
    ).toBe(false);
  });

  it('runs hand-written markup with the same validation and custom script', () => {
    loadPage({
      code: {
        html: '<label>Your name <input name="name" class="mine"></label><span data-error-for="name"></span><input name="email" type="email">',
        js: 'window.flolabsForm.ready = true; window.addEventListener("flolabs:submitted", function (event) { window.lastAnswers = event.detail.answers; });',
      },
    });

    expect(
      (window as unknown as { flolabsForm: { ready: boolean } }).flolabsForm
        .ready,
    ).toBe(true);

    submit();
    expect(document.querySelector('[data-error-for="name"]')?.textContent).toBe(
      'This field is required',
    );

    (document.querySelector('[name=name]') as HTMLInputElement).value = 'Ada';
    (document.querySelector('[name=email]') as HTMLInputElement).value =
      'ada@example.com';
    submit();

    expect((window as unknown as { lastAnswers: unknown }).lastAnswers).toEqual(
      {
        name: 'Ada',
        email: 'ada@example.com',
      },
    );
  });

  it('keeps a stray closing tag in custom code from breaking out', () => {
    const definition = publicFormDefinitionSchema.parse({
      version: 1,
      title: 'x',
      fields,
      code: { js: 'var text = "</script><script>alert(1)</script>";' },
    });
    const html = buildPublicFormPage({
      formId: 'f',
      definition,
      submitUrl: '/s',
      isEmbedded: false,
      nonce: 'n',
    });

    expect(html).not.toContain('"</script><script>alert(1)');
  });

  it('isolates the page in a sandbox and exposes the generated markup', () => {
    expect(buildPublicFormContentSecurityPolicy('n')).toContain(
      'sandbox allow-scripts',
    );
    expect(
      buildPublicFormFieldsMarkup(
        publicFormDefinitionSchema.parse({ version: 1, title: 'x', fields }),
      ),
    ).toContain('name="email"');
  });

  it('shows images, links and a review page before sending', () => {
    loadPage({
      fields: [
        { id: 'cover', type: 'image', label: 'FloLabs', imageUrl: 'https://x.test/a.png' },
        {
          id: 'intro',
          type: 'paragraph',
          label: '',
          description: 'Watch [the video](https://x.test/v) or https://x.test/w.',
        },
        { id: 'p2', type: 'pageBreak', label: '' },
        { id: 'name', type: 'shortText', label: 'Name', required: true },
      ],
      settings: { showReviewStep: true, startButtonLabel: 'Get Started' },
    });

    expect(document.querySelector('.ff-image')?.getAttribute('src')).toBe(
      'https://x.test/a.png',
    );
    expect(
      [...document.querySelectorAll('.ff-paragraph a')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['https://x.test/v', 'https://x.test/w']);
    expect(document.getElementById('ff-next')?.textContent).toBe('Get Started');

    submit();
    (document.querySelector('[name=name]') as HTMLInputElement).value = 'Ada';
    submit();

    const review = document.getElementById('ff-review') as HTMLElement;

    expect(review.hidden).toBe(false);
    expect(review.textContent).toContain('Ada');
    expect((document.getElementById('ff-success') as HTMLElement).hidden).toBe(
      true,
    );

    submit();
    expect((document.getElementById('ff-success') as HTMLElement).hidden).toBe(
      false,
    );
  });

  it('follows the device dark mode when asked, keeping buttons visible', () => {
    const pageFor = (colorScheme: 'light' | 'auto') =>
      buildPublicFormPage({
        formId: 'f',
        definition: publicFormDefinitionSchema.parse({
          version: 1,
          title: 'x',
          fields,
          theme: { colorScheme, primaryColor: '#111111' },
        }),
        submitUrl: '/forms/w/f',
        isEmbedded: false,
        nonce: 'n',
      });

    expect(pageFor('light')).not.toContain('prefers-color-scheme:dark');
    expect(pageFor('auto')).toContain(
      '@media (prefers-color-scheme:dark){:root{color-scheme:dark;--ff-primary:#ececf4',
    );
    expect(pageFor('auto')).toContain('"eventsUrl":"/forms/w/f/events"');
  });
});
