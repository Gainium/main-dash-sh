import { useParams } from 'react-router-dom';

import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { gridPageDescriptor } from '@/components/bots/workbench/descriptors';
import { GridPageProvider } from '@/contexts/bots/grid/GridPageProvider';

const GridBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  return (
    <BotWorkbench
      descriptor={gridPageDescriptor}
      mode="edit"
      botId={safeBotId}
      hasBotId={hasBotId}
      // Grid's backtest table is Delete-only — no "Load in settings" action.
      onLoadBacktestIntoForm={() => {}}
      // Grid form sections consume useGridPageContext().
      contentWrapper={(node) => (
        <GridPageProvider options={{ botId: safeBotId }}>
          {node}
        </GridPageProvider>
      )}
    />
  );
};

const GridBotEdit = () => (
  <BotPageBoundary descriptor={gridPageDescriptor} mode="edit">
    <GridBotEditWidget />
  </BotPageBoundary>
);

export default GridBotEdit;
