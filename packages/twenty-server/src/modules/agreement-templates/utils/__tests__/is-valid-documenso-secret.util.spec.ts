import { isValidDocumensoSecret } from 'src/modules/agreement-templates/utils/is-valid-documenso-secret.util';

describe('isValidDocumensoSecret', () => {
  it('accepts only the exact secret', () => {
    expect(isValidDocumensoSecret('s3cret', 's3cret')).toBe(true);
    expect(isValidDocumensoSecret('s3cret ', 's3cret')).toBe(false);
    expect(isValidDocumensoSecret('other!', 's3cret')).toBe(false);
    expect(isValidDocumensoSecret('', 's3cret')).toBe(false);
  });
});
