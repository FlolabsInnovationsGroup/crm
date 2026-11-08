import { CombinedGraphQLErrors } from '@apollo/client/errors';

import { isCrmAnalyticsForbiddenError } from '@/crm-analytics/utils/isCrmAnalyticsForbiddenError';

const buildGraphQLError = (code: string) =>
  new CombinedGraphQLErrors({
    errors: [{ message: 'Query failed', extensions: { code } }],
  });

describe('isCrmAnalyticsForbiddenError', () => {
  it('detects a FORBIDDEN GraphQL error', () => {
    expect(isCrmAnalyticsForbiddenError(buildGraphQLError('FORBIDDEN'))).toBe(
      true,
    );
  });

  it('ignores other GraphQL errors', () => {
    expect(
      isCrmAnalyticsForbiddenError(buildGraphQLError('INTERNAL_SERVER_ERROR')),
    ).toBe(false);
  });

  it('ignores anything that is not a GraphQL error', () => {
    expect(isCrmAnalyticsForbiddenError(new Error('FORBIDDEN'))).toBe(false);
    expect(isCrmAnalyticsForbiddenError(undefined)).toBe(false);
  });
});
