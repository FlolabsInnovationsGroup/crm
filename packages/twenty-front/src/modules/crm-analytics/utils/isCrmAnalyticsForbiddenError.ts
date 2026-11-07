import { CombinedGraphQLErrors } from '@apollo/client/errors';

export const isCrmAnalyticsForbiddenError = (error: unknown): boolean =>
  CombinedGraphQLErrors.is(error) &&
  error.errors.some(
    (graphQLError) => graphQLError.extensions?.code === 'FORBIDDEN',
  );
