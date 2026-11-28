import { normalizeInboxThreadSortDirection } from 'src/engine/core-modules/messaging/utils/normalize-inbox-thread-sort-direction.util';

describe('normalizeInboxThreadSortDirection', () => {
  it('keeps ASC', () => {
    expect(normalizeInboxThreadSortDirection('ASC')).toBe('ASC');
  });

  it('defaults to DESC when unset', () => {
    expect(normalizeInboxThreadSortDirection(undefined)).toBe('DESC');
    expect(normalizeInboxThreadSortDirection(null)).toBe('DESC');
  });

  it('turns an injected value into DESC', () => {
    expect(
      normalizeInboxThreadSortDirection('ASC; DROP TABLE "messageThread"; --'),
    ).toBe('DESC');
    expect(normalizeInboxThreadSortDirection('asc')).toBe('DESC');
    expect(normalizeInboxThreadSortDirection({ toString: () => 'ASC' })).toBe(
      'DESC',
    );
  });
});
