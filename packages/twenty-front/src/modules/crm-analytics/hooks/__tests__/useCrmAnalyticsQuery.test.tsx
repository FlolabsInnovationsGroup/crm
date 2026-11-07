import { gql } from '@apollo/client';
import { MockedProvider } from '@apollo/client/testing/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';

const QUERY = gql`
  query TestCrmAnalytics($key: String) {
    testCrmAnalytics(key: $key) {
      payload
    }
  }
`;

const successMock = (key: string, value: number) => ({
  request: { query: QUERY, variables: { key } },
  result: {
    data: {
      testCrmAnalytics: {
        __typename: 'CrmAnalyticsPayload',
        payload: { value },
      },
    },
  },
});

const failureMock = (key: string) => ({
  request: { query: QUERY, variables: { key } },
  error: new Error('Analytics is busy'),
});

const renderQuery = (mocks: ReturnType<typeof successMock | typeof failureMock>[]) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={createStore()}>
      <MockedProvider mocks={mocks}>{children}</MockedProvider>
    </JotaiProvider>
  );

  return renderHook(
    ({ queryKey }: { queryKey: string }) =>
      useCrmAnalyticsQuery<{ value: number }>({
        query: QUERY,
        rootField: 'testCrmAnalytics',
        variables: { key: queryKey },
      }),
    { wrapper, initialProps: { queryKey: 'first' } },
  );
};

describe('useCrmAnalyticsQuery', () => {
  it('keeps the last result while a new filter loads', async () => {
    const { result, rerender } = renderQuery([
      successMock('first', 1),
      successMock('second', 2),
    ]);

    await waitFor(() => expect(result.current.payload).toEqual({ value: 1 }));

    rerender({ queryKey: 'second' });

    expect(result.current.payload).toEqual({ value: 1 });
    expect(result.current.isRefetching).toBe(true);

    await waitFor(() => expect(result.current.payload).toEqual({ value: 2 }));
  });

  it('does not pass the old filter off as the new one after a failed read', async () => {
    const { result, rerender } = renderQuery([
      successMock('first', 1),
      failureMock('second'),
    ]);

    await waitFor(() => expect(result.current.payload).toEqual({ value: 1 }));

    rerender({ queryKey: 'second' });

    await waitFor(() => expect(result.current.error).toBeDefined());

    expect(result.current.payload).toBeUndefined();
    expect(result.current.isFirstLoad).toBe(false);
  });

  it('keeps its numbers when a refetch of the same filter fails', async () => {
    const { result } = renderQuery([
      successMock('first', 1),
      failureMock('first'),
    ]);

    await waitFor(() => expect(result.current.payload).toEqual({ value: 1 }));

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.error).toBeDefined());

    expect(result.current.payload).toEqual({ value: 1 });
  });
});
