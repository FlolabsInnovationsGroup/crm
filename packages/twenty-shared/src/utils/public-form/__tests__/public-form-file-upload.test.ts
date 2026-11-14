import { buildPublicFormPage } from '../build-public-form-page';
import { publicFormDefinitionSchema } from '../public-form-definition-schema';
import { PUBLIC_FORM_PAGE_MESSAGES } from '../public-form-page-messages';

const SUBMIT_URL = '/forms/workspace-1/form-1';

const definition = publicFormDefinitionSchema.parse({
  version: 1,
  title: 'Internship application',
  fields: [
    { id: 'email', type: 'email', label: 'Email', required: true },
    {
      id: 'cv',
      type: 'file',
      label: 'CV',
      required: true,
      acceptedFileExtensions: ['pdf'],
    },
  ],
});

const fetchMock = jest.fn();

const renderForm = () => {
  const html = buildPublicFormPage({
    formId: 'form-1',
    definition,
    submitUrl: SUBMIT_URL,
    isEmbedded: false,
    nonce: 'nonce',
  });
  const scriptStart = html.indexOf('<script nonce="nonce">') + 22;
  const script = html.slice(
    scriptStart,
    html.indexOf('</script>', scriptStart),
  );

  document.documentElement.innerHTML = html
    .replace(/^<!doctype html>\s*<html[^>]*>/i, '')
    .replace(/<\/html>\s*$/i, '');
  (window as unknown as { CSS: { escape: (value: string) => string } }).CSS = {
    escape: (value: string) => value,
  };
  new Function(script)();
};

const fillEmail = () => {
  const input = document.querySelector<HTMLInputElement>('[name="email"]');

  if (input === null) throw new Error('Missing email input');
  input.value = 'ada@example.com';
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const chooseFile = (file: File) => {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');

  if (input === null) throw new Error('Missing file input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const submit = () =>
  document
    .getElementById('ff-form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

const waitFor = async (check: () => boolean, timeoutMs = 4000) => {
  const startedAt = Date.now();

  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const submitCalls = () =>
  fetchMock.mock.calls.filter(([url]) => url === SUBMIT_URL);

const okResponse = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
  });

describe('public form file upload', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (window as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it('tells the applicant at once when the chosen file cannot be read', async () => {
    renderForm();
    const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });

    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('NotReadableError')),
    });
    fetchMock.mockReturnValue(okResponse());
    chooseFile(file);

    await waitFor(
      () =>
        document.querySelector('[data-field-id="cv"] .ff-error')
          ?.textContent === PUBLIC_FORM_PAGE_MESSAGES.en.fileUnreadable,
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith(`${SUBMIT_URL}/client-errors?stage=file-read`),
      ),
    ).toBe(true);
  });

  it('retries once with the same id and the in-memory copy of the file', async () => {
    renderForm();
    fillEmail();
    chooseFile(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
    fetchMock.mockImplementation((url: string) =>
      url === SUBMIT_URL && submitCalls().length === 1
        ? Promise.reject(new TypeError('Load failed'))
        : okResponse(),
    );

    submit();

    await waitFor(
      () => document.getElementById('ff-success')?.hidden === false,
    );
    const [first, second] = submitCalls().map(
      ([, init]) => (init as { body: FormData }).body,
    );

    expect(submitCalls()).toHaveLength(2);
    expect(second.get('clientSubmissionId')).toBe(
      first.get('clientSubmissionId'),
    );
    expect((second.get('file:cv') as File).name).toBe('cv.pdf');
  });

  it('explains what to do when the connection keeps failing', async () => {
    renderForm();
    fillEmail();
    chooseFile(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
    fetchMock.mockImplementation((url: string) =>
      url === SUBMIT_URL
        ? Promise.reject(new TypeError('Load failed'))
        : okResponse(),
    );

    submit();

    await waitFor(
      () =>
        document.getElementById('ff-form-error')?.textContent ===
        PUBLIC_FORM_PAGE_MESSAGES.en.connectionFailed,
    );
    expect(submitCalls()).toHaveLength(2);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith(`${SUBMIT_URL}/client-errors?stage=submit`),
      ),
    ).toBe(true);
  });
});
