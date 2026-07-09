/**
 * Hedge Combo bot — edit page.
 *
 * Step B.1 (current): skeleton scaffold to validate routing + provider mount.
 * Step B.2 will mount two BotFormProvider trees (long + short combo legs).
 *
 * Routes: `/hedge/combo/edit/:id` (mirrors legacy convention).
 */
import { useParams } from 'react-router-dom';

import BotNotFoundNotice from '@/components/bots/BotNotFoundNotice';
import { PremiumUpgrade } from '@/components/license/PremiumUpgrade';
import MainLayout from '@/components/layout/MainLayout';
import { HedgeBotFormProvider } from '@/contexts/bots/form/HedgeBotFormProvider';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { useLicense } from '@/lib/license';
import { BotTypesEnum } from '@/types';
import HedgeBotEditLayout from './HedgeBotEditLayout';

const HedgeComboBotEditWidget = () => {
  // Premium gate via the license adapter.
  const { isPremium } = useLicense();
  const { id } = useParams<{ id: string }>();
  const hasBotId = !!id;

  // Keep this hedge bot's real paper/live mode authoritative over the global
  // toggle so opening/refreshing it in the wrong mode doesn't query an empty
  // collection and silently render a blank form with no exchange detected
  // (community thread 4893 — the hedge-bot instance of thread 4872). Regular
  // combo/grid/dca edit pages already do this; hedge was the last gap.
  const modeGuard = useBotModeGuard(id ?? '', BotTypesEnum.hedgeCombo, {
    enabled: hasBotId,
  });

  if (!isPremium) {
    return (
      <MainLayout
        pageTitle="Hedge Combo Bot — Edit"
        activePage="/hedge/combo/edit"
        navigationBack
      >
        <PremiumUpgrade
          feature="Hedge combo bots"
          description="Editing hedge bots requires a premium license."
        />
      </MainLayout>
    );
  }

  if (modeGuard.notFound) {
    return (
      <MainLayout
        pageTitle="Hedge Combo Bot — Edit"
        activePage="/hedge/combo/edit"
        navigationBack
      >
        <BotNotFoundNotice
          backTo="/hedge/combo"
          backLabel="hedge combo bots"
          botId={id}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      pageTitle="Hedge Combo Bot — Edit"
      activePage="/hedge/combo/edit"
      fullyScrollable
      navigationBack
    >
      {!hasBotId ? (
        <div className="p-lg">
          <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
            No hedge bot ID provided.
          </div>
        </div>
      ) : (
        <HedgeBotFormProvider
          mode="edit"
          botType={BotTypesEnum.hedgeCombo}
          botId={id}
        >
          <HedgeBotEditLayout />
        </HedgeBotFormProvider>
      )}
    </MainLayout>
  );
};

const HedgeComboBotEdit = () => (
  <TradingTerminalUtilsProvider>
    <HedgeComboBotEditWidget />
  </TradingTerminalUtilsProvider>
);

export default HedgeComboBotEdit;
