import { getAgreementValues } from 'src/modules/agreement-templates/utils/get-agreement-values.util';

const person = {
  id: 'person-id',
  name: { firstName: 'Ada', lastName: 'Lovelace' },
  emails: { primaryEmail: 'ada@gmail.com' },
  city: 'London',
  state: null,
  country: 'United Kingdom',
  candidateLocation: 'Somewhere else',
  paymentPlan: 'SCHOLARSHIP_MONTHLY_FEE',
  paymentAgreedAmount: { amountMicros: 1_200_000_000, currencyCode: 'USD' },
};

describe('getAgreementValues', () => {
  it('reads the placeholders from the person', () => {
    expect(
      getAgreementValues(person, new Date('2026-11-27T10:00:00Z')),
    ).toEqual({
      fullName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@gmail.com',
      address: 'London, United Kingdom',
      city: 'London',
      country: 'United Kingdom',
      paymentPlan: 'Scholarship + monthly fee',
      agreedAmount: '$1,200.00',
      date: '27 November 2026',
    });
  });

  it('falls back to the location typed in the application and leaves the rest empty', () => {
    const values = getAgreementValues(
      {
        ...person,
        city: null,
        country: null,
        paymentPlan: null,
        paymentAgreedAmount: null,
      },
      new Date('2026-11-27T10:00:00Z'),
    );

    expect(values.address).toBe('Somewhere else');
    expect(values.paymentPlan).toBeNull();
    expect(values.agreedAmount).toBeNull();
  });

  it('reads the amount stored as text and skips a malformed currency', () => {
    const today = new Date('2026-11-27T10:00:00Z');

    expect(
      getAgreementValues(
        {
          ...person,
          paymentAgreedAmount: {
            amountMicros: '500000000',
            currencyCode: 'EUR',
          },
        },
        today,
      ).agreedAmount,
    ).toBe('€500.00');
    expect(
      getAgreementValues(
        {
          ...person,
          paymentAgreedAmount: { amountMicros: 1, currencyCode: 'US$' },
        },
        today,
      ).agreedAmount,
    ).toBeNull();
  });
});
