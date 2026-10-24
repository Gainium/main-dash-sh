/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_REAL_AUTH: string;
  readonly VITE_USE_MOCK_AUTH: string;
  readonly VITE_API_ENDPOINT: string;
  /** Self-hosted admin API base URL. Unset in cloud builds and in dev
   *  unless docker-sh is running locally. See pages/admin. */
  readonly VITE_ADMIN_API_URL: string;
  /** Content API base URL. Defaults to https://content.gainium.io. */
  readonly VITE_CONTENT_API_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_CLIENT_SECRET: string;
  readonly VITE_LOG_LEVEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version injected at build time (vite `define`). Used as the React
 *  Query persisted-cache buster so each release drops the prior cache. */
declare const __APP_CACHE_VERSION__: string;

// PWA types
declare module 'virtual:pwa-register/react' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined
    ) => void;
    onRegisterError?: (error: any) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, (value: boolean) => void];
    offlineReady: [boolean, (value: boolean) => void];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
