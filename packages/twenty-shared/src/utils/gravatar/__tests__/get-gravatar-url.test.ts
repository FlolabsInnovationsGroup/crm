import { getGravatarUrl } from '../get-gravatar-url';

describe('getGravatarUrl', () => {
  it('hashes the normalized email with SHA-256', () => {
    // Example from Gravatar's documentation.
    expect(getGravatarUrl(' MyEmailAddress@example.com ')).toBe(
      'https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?d=404&s=200',
    );
  });
});
