import { getAgreementPeopleFilter } from '@/agreements/utils/getAgreementPeopleFilter';

describe('getAgreementPeopleFilter', () => {
  it('matches names and emails, with LIKE wildcards taken literally', () => {
    expect(getAgreementPeopleFilter(' ada_l% ')).toEqual({
      or: [
        { name: { firstName: { ilike: '%ada\\_l\\%%' } } },
        { name: { lastName: { ilike: '%ada\\_l\\%%' } } },
        { emails: { primaryEmail: { ilike: '%ada\\_l\\%%' } } },
      ],
    });
  });
});
