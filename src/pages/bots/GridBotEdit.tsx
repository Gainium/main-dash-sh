import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BotWorkbench } from '@/components/bots/workbench/BotWorkbench';
import { gridPageDescriptor } from '@/components/bots/workbench/descriptors';
import { TradingTerminalUtilsProvider } from '@/context/TradingTerminalUtilsContext';
import { GridPageProvider } from '@/contexts/bots/grid/GridPageProvider';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { useIsReadOnly } from '@/lib/demoMode';
import { BotTypesEnum } from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

const GridBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  // Read-only (demo) users can't edit grid bots — bounce back to the list.
  const isReadOnly = useIsReadOnly();
  useEffect(() => {
    if (isReadOnly) {
      navigate('/grid', { replace: true });
    }
  }, [isReadOnly, navigate]);

  // Keep this bot's real paper/live mode authoritative over the global toggle
  // so a refresh doesn't flip it. Thread 4872.
  const modeGuard = useBotModeGuard(safeBotId, BotTypesEnum.grid, {
    enabled: hasBotId,
  });

  // Grid resets only example orders on unmount (no indicators).
  useEffect(() => {
    return () => {
      exampleOrdersStore.reset();
    };
  }, []);

  return (
    <BotWorkbench
      descriptor={gridPageDescriptor}
      mode="edit"
      botId={safeBotId}
      hasBotId={hasBotId}
      notFound={modeGuard.notFound}
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

const GridBotEdit = () => {
  return (
    <TradingTerminalUtilsProvider>
      <GridBotEditWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default GridBotEdit;
