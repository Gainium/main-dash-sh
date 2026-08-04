import {
  GraphQLClient,
  GraphQlQuery,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import { IS_SH } from '@/config/mode';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';

type DeploymentSecurity = {
  /** False when the installation still encrypts under the build's default key. */
  encryptionKeyConfigured: boolean;
};

/**
 * Deployment posture for the current installation.
 *
 * Self-hosted only — on cloud these settings are managed for the user, so the
 * query is never sent. The API returns booleans and nothing else, so there is
 * no sensitive value in the cache or in devtools.
 *
 * Deliberately quiet: it is asked once per session, never polled, and any
 * failure resolves to "nothing to say" rather than an error surface. This
 * drives a recommendation, so being wrong-and-silent beats being noisy.
 */
export function useDeploymentSecurity(): DeploymentSecurity | undefined {
  const { tokens } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['deployment-security'],
    queryFn: async (): Promise<DeploymentSecurity | undefined> => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, tokens?.accessToken);
      const { query } = GraphQlQuery.deploymentSecurity();

      try {
        const response = await client.request<{
          deploymentSecurity: ReturnResult<DeploymentSecurity>;
        }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

        if (response?.deploymentSecurity?.status !== 'OK') return undefined;
        return response.deploymentSecurity.data;
      } catch {
        // An older API predating this query answers with a GraphQL error.
        // That is a normal state during an upgrade, not something to report.
        return undefined;
      }
    },
    enabled: IS_SH && !!tokens?.accessToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data;
}
