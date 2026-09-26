import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React from 'react';
import {
  PERSIST_MAX_AGE,
  persister,
  queryClient,
  shouldPersistQuery,
} from './queryClient';

export default function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // Allowlisted, successful queries only (see PERSISTED_QUERY_KEYS);
        // mutations are never persisted.
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistQuery,
          shouldDehydrateMutation: () => false,
        },
        maxAge: PERSIST_MAX_AGE, // if the cache is younger than this, it is reused with stale-while-revalidate
        // Discard the persisted cache whenever the app version changes, so a
        // deploy never resurrects a pre-deploy snapshot (e.g. a stale deal
        // list) during the maxAge window. Falls back to a fixed string when
        // the define is absent (e.g. some test runners).
        buster:
          typeof __APP_CACHE_VERSION__ !== 'undefined'
            ? __APP_CACHE_VERSION__
            : 'dev',
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
