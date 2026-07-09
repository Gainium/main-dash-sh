/**
 * Hedge Combo bot — new (create) page.
 *
 * The cross-cutting concerns (premium gate, TradingTerminalUtilsProvider) are
 * declared once by hedgeComboPageDescriptor and hoisted into BotPageBoundary.
 * Create mode runs no guard (inert). This page keeps only its happy-path body:
 * MainLayout + HedgeBotFormProvider + HedgeBotEditLayout, untouched.
 *
 * NOTE: the happy-path title/activePage below are duplicated in the descriptor
 * (which the boundary uses for its premium branch). Keep them in sync with
 * hedgeComboPageDescriptor.
 *
 * Routes: `/hedge/combo/new` (mirrors legacy convention).
 */
import { useSearchParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { hedgeComboPageDescriptor } from '@/components/bots/workbench/descriptors';
import MainLayout from '@/components/layout/MainLayout';
import { HedgeBotFormProvider } from '@/contexts/bots/form/HedgeBotFormProvider';
import { BotTypesEnum } from '@/types';
import HedgeBotEditLayout from './HedgeBotEditLayout';

const HedgeComboBotNew = () => {
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load') ?? undefined;
  return (
    <BotPageBoundary descriptor={hedgeComboPageDescriptor} mode="create">
      <MainLayout
        pageTitle="Hedge Combo Bot — New"
        activePage="/hedge/combo/new"
        fullyScrollable
        navigationBack
      >
        <HedgeBotFormProvider
          mode="create"
          botType={BotTypesEnum.hedgeCombo}
          {...(loadFromBotId ? { botId: loadFromBotId } : {})}
        >
          <HedgeBotEditLayout />
        </HedgeBotFormProvider>
      </MainLayout>
    </BotPageBoundary>
  );
};

export default HedgeComboBotNew;
