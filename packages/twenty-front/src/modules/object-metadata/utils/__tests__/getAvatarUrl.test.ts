import { CoreObjectNameSingular } from 'twenty-shared/types';
import { getGravatarUrl } from 'twenty-shared/utils';

import { getAvatarUrl } from '@/object-metadata/utils/getAvatarUrl';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

const buildPerson = (fields: Record<string, unknown>) =>
  ({ id: 'person-1', __typename: 'Person', ...fields }) as ObjectRecord;

describe('getAvatarUrl', () => {
  it('uses Gravatar for a person without a photo', () => {
    const person = buildPerson({
      emails: { primaryEmail: 'ada@example.com' },
    });

    expect(getAvatarUrl(CoreObjectNameSingular.Person, person, undefined)).toBe(
      getGravatarUrl('ada@example.com'),
    );
  });

  it('keeps initials for a person without an email', () => {
    expect(
      getAvatarUrl(CoreObjectNameSingular.Person, buildPerson({}), undefined),
    ).toBe('');
  });

  it('does not use Gravatar for other objects', () => {
    const company = buildPerson({ emails: { primaryEmail: 'a@b.co' } });

    expect(
      getAvatarUrl(CoreObjectNameSingular.Company, company, undefined),
    ).toBe('');
  });
});
