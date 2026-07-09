/**
 * Hedge DCA bot — new (create) page.
 *
 * The cross-cutting concerns (premium gate, TradingTerminalUtilsProvider) are
 * declared once by hedgeDcaPageDescriptor and hoisted into BotPageBoundary.
 * Create mode runs no guard (inert). This page keeps only its happy-path body:
 * MainLayout + HedgeBotFormProvider + HedgeBotEditLayout, untouched.
 *
 * NOTE: the happy-path title/activePage below are duplicated in the descriptor
 * (which the boundary uses for its premium branch). Keep them in sync with
 * hedgeDcaPageDescriptor.
 *
 * Routes: `/hedge/bot/new` (mirrors legacy convention).
 */
import { useSearchParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { hedgeDcaPageDescriptor } from '@/components/bots/workbench/descriptors';
import MainLayout from '@/components/layout/MainLayout';
import { HedgeBotFormProvider } from '@/contexts/bots/form/HedgeBotFormProvider';
import { BotTypesEnum } from '@/types';
import HedgeBotEditLayout from './HedgeBotEditLayout';

const HedgeDcaBotNew = () => {
  const [searchParams] = useSearchParams();
  // The legacy "load from template" flow used `?load=<botId>` to seed defaults.
  // We honor the same shape so existing share/template links keep working.
  const loadFromBotId = searchParams.get('load') ?? undefined;
  return (
    <BotPageBoundary descriptor={hedgeDcaPageDescriptor} mode="create">
      <MainLayout
        pageTitle="Hedge DCA Bot — New"
        activePage="/hedge/bot/new"
        fullyScrollable
        navigationBack
      >
        <HedgeBotFormProvider
          mode="create"
          botType={BotTypesEnum.hedgeDca}
          {...(loadFromBotId ? { botId: loadFromBotId } : {})}
        >
          <HedgeBotEditLayout />
        </HedgeBotFormProvider>
      </MainLayout>
    </BotPageBoundary>
  );
};

export default HedgeDcaBotNew;
