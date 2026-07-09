/**
 * Hedge Combo bot — edit page.
 *
 * The cross-cutting concerns (premium gate, mode-guard + notFound chrome,
 * TradingTerminalUtilsProvider) are declared once by hedgeComboPageDescriptor
 * and hoisted into BotPageBoundary. This page keeps only its happy-path body:
 * MainLayout + HedgeBotFormProvider + HedgeBotEditLayout, untouched.
 *
 * NOTE: the happy-path title/activePage below are duplicated in the descriptor
 * (which the boundary uses for its premium/notFound branches). Keep them in
 * sync with hedgeComboPageDescriptor.
 *
 * Routes: `/hedge/combo/edit/:id` (mirrors legacy convention).
 */
import { useParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { hedgeComboPageDescriptor } from '@/components/bots/workbench/descriptors';
import MainLayout from '@/components/layout/MainLayout';
import { HedgeBotFormProvider } from '@/contexts/bots/form/HedgeBotFormProvider';
import { BotTypesEnum } from '@/types';
import HedgeBotEditLayout from './HedgeBotEditLayout';

const HedgeComboBotEdit = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <BotPageBoundary descriptor={hedgeComboPageDescriptor} mode="edit">
      <MainLayout
        pageTitle="Hedge Combo Bot — Edit"
        activePage="/hedge/combo/edit"
        fullyScrollable
        navigationBack
      >
        {!id ? (
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
    </BotPageBoundary>
  );
};

export default HedgeComboBotEdit;
