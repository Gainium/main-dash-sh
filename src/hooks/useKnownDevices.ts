import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';

/**
 * A device the account has signed in from before. Password sign-ins from a
 * device that is not on this list need a code emailed to the account (cloud
 * edition). The device cookie itself never reaches the client.
 */
export interface KnownDevice {
  id: string;
  device: string | null;
  ip: string | null;
  location: string | null;
  /** Sign-in method last used on it: 'web' (password), 'email', 'google', … */
  type: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** True for the browser making this request — it can't be forgotten. */
  current: boolean;
}

const endpoint = () =>
  import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

const KNOWN_DEVICES_QUERY = `query knownDevices {
  knownDevices {
    status
    reason
    data {
      id
      device
      ip
      location
      type
      firstSeen
      lastSeen
      current
    }
  }
}`;

const FORGET_DEVICE_MUTATION = `mutation forgetDevice($input: forgetDeviceInput!) {
  forgetDevice(input: $input) {
    status
    reason
  }
}`;

/** Remembered devices for the signed-in account (cloud API only). */
export function useKnownDevices(enabled = true) {
  const { tokens } = useAuthStore();
  const token = tokens?.accessToken;

  return useQuery({
    queryKey: ['knownDevices'],
    enabled: enabled && !!token,
    queryFn: async (): Promise<KnownDevice[]> => {
      if (!token) throw new Error('No authentication token available');
      const client = new GraphQLClient(endpoint(), token, true);
      const result = await client.request<{
        knownDevices: ReturnResult<KnownDevice[]>;
      }>(KNOWN_DEVICES_QUERY);
      if (result.knownDevices.status !== 'OK') {
        throw new Error(result.knownDevices.reason || 'Failed to load devices');
      }
      return result.knownDevices.data ?? [];
    },
  });
}

/** Forgets one device; its sessions end and its next sign-in needs a code. */
export function useForgetDevice() {
  const { tokens } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const token = tokens?.accessToken;
      if (!token) throw new Error('No authentication token available');
      const client = new GraphQLClient(endpoint(), token, true);
      const result = await client.request<{
        forgetDevice: ReturnResult<null>;
      }>(FORGET_DEVICE_MUTATION, { input: { id } });
      if (result.forgetDevice.status !== 'OK') {
        throw new Error(result.forgetDevice.reason || 'Failed to forget device');
      }
      return result.forgetDevice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knownDevices'] });
      queryClient.invalidateQueries({ queryKey: ['activeSessions'] });
    },
    onError: (error) => {
      logger.error('Failed to forget device', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}
