import { test, expect } from '@playwright/test';

import { fetchBaseFundingAccess } from '@/lib/baseFunding/baseFundingAccess';

const client = (answer: () => unknown) => ({
  request: async <T>() => answer() as T,
});

test.describe('base funding access (beta gate)', () => {
  test('available only when the API says so', async () => {
    expect(
      await fetchBaseFundingAccess(client(() => ({ baseFundingAccess: { available: true } })))
    ).toBe(true);
    expect(
      await fetchBaseFundingAccess(client(() => ({ baseFundingAccess: { available: false } })))
    ).toBe(false);
    expect(await fetchBaseFundingAccess(client(() => ({ baseFundingAccess: null })))).toBe(false);
  });

  test('an API without the query means not available', async () => {
    const unknownField = client(() => {
      throw new Error(
        'HTTP error! status: 400 - Cannot query field "baseFundingAccess" on type "Query".'
      );
    });
    expect(await fetchBaseFundingAccess(unknownField)).toBe(false);
  });

  test('a resolver error means not available; a transport failure is thrown', async () => {
    expect(
      await fetchBaseFundingAccess(
        client(() => {
          throw new Error('GraphQL errors: Internal server error');
        })
      )
    ).toBe(false);
    await expect(
      fetchBaseFundingAccess(
        client(() => {
          throw new Error('Failed to fetch');
        })
      )
    ).rejects.toThrow('Failed to fetch');
  });
});
