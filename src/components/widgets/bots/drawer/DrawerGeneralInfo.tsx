import type { DrawerBot } from '@/types/bots/drawer';
import { Info } from 'lucide-react';
import React, { useMemo } from 'react';
import { ExchangeChip, StrategyChip } from '../../../ui/chip';
import CoinPair from '../../shared/CoinPair';
import { DrawerSection } from './DrawerSection';
import { BotTypesEnum, type DCABot } from '@/types';

export interface DrawerGeneralInfoProps {
  widgetId: string;
  botId?: string;
  botSnapshot?: DrawerBot;
  /** Clicking a pair switches the drawer chart to it (see BotDetailsDrawer). */
  onPairClick?: (symbol: string) => void;
}

export const DrawerGeneralInfo: React.FC<DrawerGeneralInfoProps> = ({
  widgetId,
  botSnapshot,
  onPairClick,
}) => {
  const bot = useMemo(() => botSnapshot, [botSnapshot]);
  const symbols = useMemo(
    () =>
      bot
        ? Array.isArray(bot.symbol)
          ? bot.symbol.map((s) => s.value)
          : [bot.symbol]
        : [],
    [bot]
  );
  if (!bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-general-info"
        title="Basic"
        icon={Info}
        minSize={{ w: 4, h: 3 }}
        maxSize={{ w: 12, h: 6 }}
      >
        <div className="text-center text-muted-foreground">
          No general information available for this bot.
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-general-info"
      title="Basic"
      icon={Info}
      minSize={{ w: 4, h: 3 }}
      maxSize={{ w: 12, h: 6 }}
    >
      <div className="space-y-md">
        {/* Pair/Symbol Information */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Pairs
          </div>
          <CoinPair
            {...(symbols[0] && {
              baseAsset: symbols[0].baseAsset,
              quoteAsset: symbols[0].quoteAsset,
            })}
            {...(!bot.pair && {
              pair: bot.pair,
            })}
            symbols={symbols.map((s) => s.symbol)}
            maxDisplay={5}
            iconSize="md"
            {...(onPairClick ? { onPairClick } : {})}
          />
        </div>

        {/* Exchange and Direction */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Exchange
            </div>
            <ExchangeChip
              exchangeId={bot.exchangeUUID || bot.exchange}
              size="xs"
              chipStyle="solid"
              showIcon={true}
              layout="stacked"
            />
          </div>

          {bot.type !== BotTypesEnum.grid && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Direction
              </div>
              <StrategyChip
                strategy={(bot as DCABot).settings.strategy}
                size="xs"
                chipStyle="solid"
              />
            </div>
          )}
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerGeneralInfo;
