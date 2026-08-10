import { AuthEnvWrapper } from '@/lib/auth';
import { logger } from '@/lib/loggerInstance';
import { queryClient } from '@/lib/queryClient';
import { startSessionWatchdog, useAuthStore } from '@/stores/authStore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';

interface AuthContextType {
  initializeAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const storeInitializeAuth = useAuthStore((s) => s.initializeAuth);

  const initializeAuth = useCallback(async () => {
    // Store previous user state to compare after initialization
    const previousUser = useAuthStore.getState().user;

    await storeInitializeAuth();

    // After initialization, check if the user changed
    const currentUser = useAuthStore.getState().user;

    // If user changed (different user logged in or user logged out),
    // invalidate the cache to prevent data leakage between users
    if (previousUser?.id !== currentUser?.id) {
      logger.info(
        'User changed during auth initialization, clearing query cache'
      );
      queryClient.clear();
    }
  }, [storeInitializeAuth]);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // `initializeAuth` above only runs on mount. The watchdog keeps checking
  // for the rest of the tab's life, so a session that expires (or a boot
  // validation that never got an answer) ends at the login screen instead of
  // leaving every widget to render its own error.
  useEffect(() => startSessionWatchdog(), []);

  // `AuthEnvWrapper` is registered at boot by `main.tsx`. The inner
  // `AuthContext` is mounted the same regardless of which wrapper is used.
  return (
    <AuthEnvWrapper>
      <AuthContext.Provider value={{ initializeAuth }}>
        {children}
      </AuthContext.Provider>
    </AuthEnvWrapper>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export { AuthProvider, useAuth };
