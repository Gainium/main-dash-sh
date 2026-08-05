import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  adminApi,
  isAdminApiConfigured,
  type AdminContainer,
  type AdminDiagnostics,
  type AdminEncryptionKeyStatus,
  type AdminExchangesResponse,
  type AdminGeneratedEncryptionKey,
  type AdminUpdate,
  type AdminUpgradeResult,
} from '@/lib/api/adminClient';

// All admin queries share a single root key. Invalidating ['admin']
// refetches every admin panel.
const ROOT_KEY = ['admin'] as const;

export function useAdminContainers(): UseQueryResult<AdminContainer[]> {
  return useQuery({
    queryKey: [...ROOT_KEY, 'containers'],
    queryFn: adminApi.listContainers,
    enabled: isAdminApiConfigured(),
    // No background polling — the operator triggers refresh via the
    // Refresh button or via container actions (which invalidate the
    // query on mutate success). Polling every few seconds hammers the
    // docker socket + spams admin-sh logs for little benefit.
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

type ContainerAction = 'start' | 'stop' | 'restart';

export function useAdminContainerAction(): UseMutationResult<
  void,
  Error,
  { name: string; action: ContainerAction }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, action }) => {
      const fn =
        action === 'start'
          ? adminApi.startContainer
          : action === 'stop'
            ? adminApi.stopContainer
            : adminApi.restartContainer;
      await fn(name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'containers'] }),
  });
}

export function useAdminExchanges(): UseQueryResult<AdminExchangesResponse> {
  return useQuery({
    queryKey: [...ROOT_KEY, 'exchanges'],
    queryFn: adminApi.getExchanges,
    enabled: isAdminApiConfigured(),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useAdminSetExchanges(): UseMutationResult<
  void,
  Error,
  string[] | null
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled) => {
      await adminApi.setExchanges(enabled);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'exchanges'] }),
  });
}

export function useAdminDiagnostics(
  windowMs?: number
): UseQueryResult<AdminDiagnostics> {
  return useQuery({
    queryKey: [...ROOT_KEY, 'diagnostics', windowMs ?? 'default'],
    queryFn: () => adminApi.getDiagnostics(windowMs),
    enabled: isAdminApiConfigured(),
    // The snapshot runs a live ~2.5s feed probe on the server, so it's
    // relatively expensive — don't auto-poll; the operator hits Refresh.
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
}

export function useAdminUpdates(): UseQueryResult<AdminUpdate[]> {
  return useQuery({
    queryKey: [...ROOT_KEY, 'updates'],
    queryFn: adminApi.listUpdates,
    enabled: isAdminApiConfigured(),
    // Hitting the registry is slow + costs API quota; only refresh on
    // mount + manual refetch.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useAdminUpgrade(): UseMutationResult<
  { results: AdminUpgradeResult[] },
  Error,
  { service: string; tag: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ service, tag }) => adminApi.upgrade(service, tag),
    onSuccess: (data) => {
      // An admin-sh self-upgrade is still in flight when the POST returns
      // (admin-sh restarts itself) — refetching now would just hit the
      // dying container. The UpdatesTab poller invalidates once the
      // self-upgrade reconciles. For every other service the recreate is
      // already done, so refresh immediately.
      const pendingSelf = data.results.some((r) => r.selfUpgrade?.pending);
      if (!pendingSelf) qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useEncryptionKeyStatus(): UseQueryResult<AdminEncryptionKeyStatus> {
  return useQuery({
    queryKey: [...ROOT_KEY, 'encryption-key'],
    queryFn: adminApi.getEncryptionKeyStatus,
    enabled: isAdminApiConfigured(),
    // Deployment configuration — it only changes when someone changes it,
    // and the mutation below invalidates this when they do.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // An older admin-sh has no such route. That is a "we don't know", not
    // an error worth a retry loop or a red panel.
    retry: false,
  });
}

export function useGenerateEncryptionKey(): UseMutationResult<
  AdminGeneratedEncryptionKey,
  Error,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.generateEncryptionKey(),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...ROOT_KEY, 'encryption-key'] }),
  });
}
