import type React from 'react';

/** A hook an edition overlay can attach to a nav entry to hide it at runtime. */
export type NavVisibilityHook = () => boolean;

const useAlwaysVisible: NavVisibilityHook = () => true;

/**
 * Renders `children` unless the entry's `useIsVisible` hook says no.
 *
 * The hook is called unconditionally inside this component (one component per
 * entry), so registering it on a nav item never changes the hook order of the
 * sidebar that renders the list. Entries without a hook are always visible.
 */
export const NavVisibilityGate: React.FC<{
  useIsVisible?: NavVisibilityHook | undefined;
  children: React.ReactNode;
}> = ({ useIsVisible, children }) => {
  const useVisible = useIsVisible ?? useAlwaysVisible;
  return useVisible() ? <>{children}</> : null;
};
