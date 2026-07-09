import { useEffect, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import BotNotFoundNotice from '@/components/bots/BotNotFoundNotice';
import { BotPageContextProvider } from '@/components/bots/workbench/BotPageContext';
import type { BotPageBoundaryDescriptor } from '@/components/bots/workbench/descriptors/types';
import MainLayout from '@/components/layout/MainLayout';
import { PremiumUpgrade } from '@/components/license/PremiumUpgrade';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { useIsReadOnly } from '@/lib/demoMode';
import { useLicense } from '@/lib/license';

interface BotPageBoundaryProps {
  /** The boundary slice of a page contract (full BotPageDescriptor is assignable). */
  descriptor: BotPageBoundaryDescriptor;
  mode: 'create' | 'edit';
  /** The page widget → <BotWorkbench …/>. */
  children: ReactNode;
}

/**
 * Hoists the cross-cutting bot-page concerns out of the six thin page
 * widgets and declares them once, driven by the descriptor:
 *   - supplies TradingTerminalUtilsProvider (BotWorkbench consumes it),
 *   - runs useBotModeGuard in EDIT and short-circuits to the not-found
 *     chrome when the bot exists in neither mode,
 *   - resets the descriptor's store singletons on unmount,
 *   - fires the EDIT-only read-only (demo) redirect,
 *   - gates behind the premium upgrade card when the descriptor opts in.
 *
 * Every hook is called unconditionally, in a fixed order independent of
 * `mode`, `premium`, `hasBotId`, or the guard result — only effect bodies and
 * the guard's `enabled` flag are conditional. This keeps Rules-of-Hooks
 * satisfied while the render decision below swaps the body.
 */
export function BotPageBoundary({
  descriptor,
  mode,
  children,
}: BotPageBoundaryProps) {
  const { id } = useParams<{ id: string }>();
  const safeBotId = id ?? '';
  const hasBotId = Boolean(id);
  const isEdit = mode === 'edit';

  const { isPremium } = useLicense();
  const isReadOnly = useIsReadOnly();
  const navigate = useNavigate();

  // Called in BOTH modes so the hook is never conditionally mounted. In
  // create, enabled:false makes it return {ok, notFound:false, isResolving:
  // false} after running its own internal hooks as no-ops (no new request).
  const guard = useBotModeGuard(
    isEdit ? safeBotId : undefined,
    descriptor.botType,
    { enabled: isEdit && hasBotId && (descriptor.guardEnabled ?? true) }
  );

  // Store resets on unmount — descriptor-driven. `descriptor` is a module
  // constant, so the deps array is effectively stable.
  useEffect(() => {
    return () => {
      descriptor.resetStores?.forEach((s) => s.reset());
    };
  }, [descriptor]);

  // EDIT-only read-only redirect (grid). Fires independently of the guard,
  // matching the current GridBotEdit behavior.
  useEffect(() => {
    if (isEdit && descriptor.editReadOnlyRedirect && isReadOnly) {
      navigate(descriptor.editReadOnlyRedirect, { replace: true });
    }
  }, [isEdit, descriptor.editReadOnlyRedirect, isReadOnly, navigate]);

  const ctx = {
    botType: descriptor.botType,
    botId: safeBotId,
    mode,
    notFound: guard.notFound,
    isResolving: guard.isResolving,
  };

  let body: ReactNode;
  if (descriptor.premium && !isPremium) {
    body = (
      <MainLayout
        pageTitle={descriptor.titles[mode]}
        activePage={descriptor.activePage[mode]}
        navigationBack
      >
        <PremiumUpgrade
          feature={descriptor.premium.feature}
          {...(() => {
            const d = descriptor.premium.description;
            const resolved = typeof d === 'string' ? d : d?.[mode];
            return resolved ? { description: resolved } : {};
          })()}
          {...(descriptor.premium.ctaHref
            ? { ctaHref: descriptor.premium.ctaHref }
            : {})}
          {...(descriptor.premium.ctaLabel
            ? { ctaLabel: descriptor.premium.ctaLabel }
            : {})}
        />
      </MainLayout>
    );
  } else if (isEdit && hasBotId && guard.notFound) {
    // Reproduces byte-for-byte what BotWorkbench's edit branch rendered for
    // notFound before Phase 5 moved it up a level.
    body = (
      <MainLayout
        pageTitle={descriptor.titles.edit}
        activePage={descriptor.activePage.edit}
        fullyScrollable
        navigationBack
      >
        <BotNotFoundNotice
          backTo={descriptor.basePath}
          backLabel={descriptor.listLabel}
          botId={safeBotId}
        />
      </MainLayout>
    );
  } else {
    body = children;
  }

  return (
    <TradingTerminalUtilsProvider>
      <BotPageContextProvider value={ctx}>{body}</BotPageContextProvider>
    </TradingTerminalUtilsProvider>
  );
}

export default BotPageBoundary;
