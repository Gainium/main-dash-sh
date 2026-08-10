import React from 'react';
import { Link } from 'react-router-dom';

import { LogoLockup } from '@/components/common/LogoLockup';

interface SharedPageLayoutProps {
  children: React.ReactNode;
}

/**
 * Minimal layout for share-link viewers.
 *
 * Replaces `MainLayout` whenever `useShareContext().isDemo === true`. It
 * deliberately mounts none of the visitor-specific machinery (sidebar,
 * navbar, Socket, notifications, chat, sessions tracking, demo pill,
 * onboarding) — those leak the visitor's data and bypass the "share view
 * is read-only" invariant.
 *
 * The bar exposes:
 *  - the brand logo (links home),
 *  - a "Shared view · Read only" pill so visitors understand what they
 *    are looking at,
 *  - a "Sign in" link for unauthenticated visitors.
 */
const SharedPageLayout: React.FC<SharedPageLayoutProps> = ({ children }) => (
  <div className="min-h-screen flex flex-col bg-background">
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-md px-md bg-[var(--surface-base)] backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-base)]/85">
      <Link
        to="/"
        aria-label="Gainium home"
        className="flex items-center gap-xs"
      >
        <LogoLockup className="h-7" />
      </Link>

      <span
        className="inline-flex items-center gap-xs rounded-full px-sm py-[2px] text-xs font-medium text-muted-foreground bg-[var(--surface-1)]"
        role="status"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-amber-500"
        />
        Shared view · Read only
      </span>

      <Link
        to="/login"
        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        Sign in
      </Link>
    </header>

    <main className="flex-1 flex flex-col">{children}</main>
  </div>
);

export default SharedPageLayout;
