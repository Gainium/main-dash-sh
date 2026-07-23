import type { ReactNode } from 'react';

// Auth adapter contract. The shared core (`AuthContext`, Login page,
// ProtectedRoute, `useAuthStore`) is platform-agnostic — it uses the
// same `login(token, user)` / `logout()` interface regardless of build.
// The bits that the host app configures are:
//   - the React-tree wrapping that brings in platform SDKs;
//   - which login UIs the Login page should render.
//
// `AuthEnvProvider` covers the first; `AuthCapabilities` covers the
// second. Both are registered once at boot in `main.tsx`.

/** Wraps the app subtree with whatever provider context the chosen
 *  auth flow needs. Falls back to a pass-through fragment. */
export type AuthEnvProvider = React.FC<{ children: ReactNode }>;

export interface AuthCapabilities {
  /** True when this build supports Google OAuth login.
   *  The Login page reads this to decide whether to render the
   *  Google button + the "or continue with email" divider. */
  google: boolean;
  /** True when this build supports Discord OAuth login (cloud only —
   *  needs VITE_DISCORD_CLIENT_ID and the backend oauth mutation's
   *  discord branch). Optional so existing adapter registrations
   *  keep compiling; absent means disabled. */
  discord?: boolean;
  /** True when this build expects a first-install registration flow.
   *  The Login page reads this to render the register form
   *  branch (calls `checkUserExist`, asks for license key, etc). */
  registration: boolean;
}
