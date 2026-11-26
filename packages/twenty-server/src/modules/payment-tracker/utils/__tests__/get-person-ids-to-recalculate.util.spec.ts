import {
  getPersonIdsAffectedByPaymentEvents,
  getPersonIdsOfPayments,
  getPersonIdsWithChangedAgreement,
} from 'src/modules/payment-tracker/utils/get-person-ids-to-recalculate.util';

describe('getPersonIdsAffectedByPaymentEvents', () => {
  it('recalculates both people when a payment is moved', () => {
    expect(
      getPersonIdsAffectedByPaymentEvents([
        {
          properties: {
            before: { personId: 'old' },
            after: { personId: 'new' },
            updatedFields: ['personId'],
          },
        },
      ]),
    ).toEqual(['old', 'new']);
  });

  it('ignores edits that do not change totals', () => {
    expect(
      getPersonIdsAffectedByPaymentEvents([
        {
          properties: {
            before: { personId: 'person' },
            after: { personId: 'person' },
            updatedFields: ['description'],
          },
        },
      ]),
    ).toEqual([]);
  });

  it('counts new payments, which have no list of updated fields', () => {
    expect(
      getPersonIdsAffectedByPaymentEvents([
        { properties: { after: { personId: 'person' } } },
        { properties: { after: { personId: null } } },
      ]),
    ).toEqual(['person']);
  });
});

describe('getPersonIdsWithChangedAgreement', () => {
  it('reacts only to plan or agreed amount changes', () => {
    expect(
      getPersonIdsWithChangedAgreement([
        {
          recordId: 'a',
          properties: { updatedFields: ['paymentAgreedAmount'] },
        },
        { recordId: 'b', properties: { updatedFields: ['paymentPaidAmount'] } },
        {
          recordId: 'c',
          properties: { updatedFields: ['paymentPlan', 'city'] },
        },
      ]),
    ).toEqual(['a', 'c']);
  });
});

describe('getPersonIdsOfPayments', () => {
  it('recalculates the person of a deleted payment whatever field changed', () => {
    expect(
      getPersonIdsOfPayments([
        {
          properties: {
            before: { personId: 'person' },
            after: { personId: 'person' },
            updatedFields: ['deletedAt'],
          },
        },
      ]),
    ).toEqual(['person']);
  });
});
