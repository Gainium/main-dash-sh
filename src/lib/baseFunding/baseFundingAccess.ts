// Base funding access — whether the session user may use base funding (the
// Base funding setting, the funding previews and the hedge start dialog).
//
// The backend decides per user (`baseFundingAccess { available }`). An API
// that predates the query rejects it as an unknown field; that, a resolver
// error, a NOTOK-shaped answer or anything but `available: true` means not
// available, and the dashboard behaves as it did before base funding.
import type { GraphQLClient } from '@/lib/api/GraphQLClient';
import { isSchemaRejection } from '@/lib/largeAccount/largeAccount';

export const BASE_FUNDING_ACCESS_QUERY = `query baseFundingAccess {
  baseFundingAccess { available }
}`;

type AccessAnswer = {
  baseFundingAccess?: { available?: boolean | null } | null;
};

/**
 * True only when the backend says so. Throws only on a transport failure
 * (no GraphQL answer at all), so the caller can ask again later instead of
 * keeping a "no" it never received.
 */
export async function fetchBaseFundingAccess(
  client: Pick<GraphQLClient, 'request'>
): Promise<boolean> {
  try {
    const answer = await client.request<AccessAnswer>(BASE_FUNDING_ACCESS_QUERY);
    return answer?.baseFundingAccess?.available === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    // Schema rejection (an older API) or a resolver error: an answer, "no".
    if (isSchemaRejection(message) || /^GraphQL errors:/.test(message)) {
      return false;
    }
    throw error;
  }
}
