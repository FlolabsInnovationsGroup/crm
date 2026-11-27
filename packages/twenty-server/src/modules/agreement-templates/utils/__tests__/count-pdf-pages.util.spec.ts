import { countPdfPages } from 'src/modules/agreement-templates/utils/count-pdf-pages.util';

describe('countPdfPages', () => {
  it('reads the page tree count', () => {
    expect(
      countPdfPages(
        Buffer.from(
          '%PDF-1.3\n2 0 obj\n<< /Type /Pages /Count 4 /Kids [3 0 R] >>\nendobj\n',
          'latin1',
        ),
      ),
    ).toBe(4);
  });

  it('ignores a /Count outside the page tree, such as in the title', () => {
    expect(
      countPdfPages(
        Buffer.from(
          '1 0 obj\n<< /Title (NDA /Count 9) >>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Count 2\n/Kids [3 0 R 4 0 R]\n>>\nendobj\n',
          'latin1',
        ),
      ),
    ).toBe(2);
  });

  it('refuses a buffer that is not a PDF', () => {
    expect(() => countPdfPages(Buffer.from('not a pdf'))).toThrow();
  });
});
