import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { getLocalPrices } from '@/helper/price';
import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { round } from '@/utils/bots/grid/math';
import { DollarSign } from 'lucide-react';
import React, { useMemo } from 'react';
import { ProfitLossPercChip } from '../../../ui/chip/ProfitLossPercChip';
import { DrawerSection } from './DrawerSection';

// ---------- local helpers ----------

const formatPrice = (
  value: number | undefined | null,
  quoteAsset: string
): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 10,
  })} ${quoteAsset}`;
};

const formatValue = (value: number, prefix = ''): string => {
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value < 0) return `-${prefix}${formatted}`;
  return `${prefix}${formatted}`;
};

const formatBalance = (
  value: number,
  asset: string,
  maximumFractionDigits = 6
): string => {
  return `${round(value, maximumFractionDigits).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })} ${asset}`;
};

// ---------- row component ----------

interface FundsRowProps {
  label: string;
  tooltip?: string;
  tooltipUrl?: string;
  children: React.ReactNode;
}

const FundsRow: React.FC<FundsRowProps> = ({
  label,
  tooltip,
  tooltipUrl,
  children,
}) => (
  <div className="flex items-start justify-between py-1.5">
    <span className="text-xs text-muted-foreground whitespace-nowrap mr-2 flex items-center gap-1">
      {label}
      {tooltip && (
        <Tooltip tooltip={tooltip} tooltipURL={tooltipUrl} side="top">
          <InfoIcon />
        </Tooltip>
      )}
    </span>
    <div className="text-right text-sm font-medium text-foreground">
      {children}
    </div>
  </div>
);

// ---------- calcValue (mirrors legacy utils.ts) ----------

type CalcCurrency = 'base' | 'quote' | 'usd';
type CalcFund = 'current' | 'initial';

const calcValue = (
  price: number,
  currency: CalcCurrency,
  bot: GridBot,
  fund: CalcFund,
  usdRate: number
): number => {
  const profitCurrency = bot.settings?.profitCurrency;
  const isClosed = bot.status === 'closed' || bot.status === 'archive';

  const profitValue = isClosed
    ? (bot.profit?.total ?? 0)
    : bot.profit?.freeTotal || bot.profit?.total || 0;

  const balances =
    fund === 'initial'
      ? {
          base: bot.initialBalances?.base ?? 0,
          quote: bot.initialBalances?.quote ?? 0,
        }
      : {
          base:
            (bot.currentBalances?.base ?? 0) +
            (profitCurrency === 'base' ? profitValue : 0),
          quote:
            (bot.currentBalances?.quote ?? 0) +
            (profitCurrency === 'quote' ? profitValue : 0),
        };

  switch (currency) {
    case 'base':
      return price > 0 ? balances.base + balances.quote / price : balances.base;
    case 'usd':
      return (balances.base * price + balances.quote) * usdRate;
    case 'quote':
    default:
      return balances.base * price + balances.quote;
  }
};

// ---------- main widget ----------

export interface DrawerGridFundsOverviewProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

const DrawerGridFundsOverview: React.FC<DrawerGridFundsOverviewProps> = ({
  widgetId,
  bot: botProp,
}) => {
  const gridBot = botProp as unknown as GridBot | undefined;

  const baseAsset = gridBot?.symbol?.baseAsset ?? 'BASE';
  const quoteAsset = gridBot?.symbol?.quoteAsset ?? 'QUOTE';

  // Compute all legacy fields using LIVE prices (matching legacy botContent.tsx)
  const data = useMemo(() => {
    if (!gridBot) return null;

    const isClosed =
      gridBot.status === 'closed' || gridBot.status === 'archive';

    // --- resolve LIVE market price (legacy: latestPrice from websocket) ---
    const latestPrices = getLocalPrices();
    const livePriceEntry = latestPrices.find(
      (p) =>
        p.symbol === gridBot.settings?.pair && p.exchange === gridBot.exchange
    );
    const latestPrice =
      livePriceEntry?.price ?? gridBot.lastPrice ?? gridBot.initialPrice ?? 0;

    // Legacy: priceToUse = closed ? (bot.lastPrice || latestPrice) : latestPrice
    const priceToUse = isClosed
      ? gridBot.lastPrice || latestPrice
      : latestPrice;

    // --- resolve LIVE USD rate (legacy: findUSDRate from live prices) ---
    const liveUsdRate =
      latestPrices.length > 0
        ? findUSDRate(
            gridBot.symbol?.quoteAsset ?? '',
            latestPrices,
            gridBot.exchange
          )
        : (gridBot.usdRate ?? 1);

    // Legacy: initial funds use bot.usdRate (stored at creation), current funds use live usdRate
    const storedUsdRate = gridBot.usdRate ?? 1;

    // --- initial funds ---
    const initialBase = gridBot.initialBalances?.base ?? 0;
    const initialQuote = gridBot.initialBalances?.quote ?? 0;

    // initialFunds.value = calcValue(bot.initialPrice, 'usd', bot, 'initial', bot.usdRate)
    const initialValueAtStart = calcValue(
      gridBot.initialPrice ?? 0,
      'usd',
      gridBot,
      'initial',
      storedUsdRate
    );

    // initialFunds.valueChange = calcValue(priceToUse, 'usd', bot, 'initial', bot.usdRate) - initialFunds.value
    const initialValueNow = calcValue(
      priceToUse,
      'usd',
      gridBot,
      'initial',
      storedUsdRate
    );
    const initialValueChange = round(initialValueNow - initialValueAtStart, 2);
    const initialValueChangePerc =
      initialValueAtStart !== 0
        ? round(
            ((initialValueNow - initialValueAtStart) / initialValueAtStart) *
              100,
            2
          )
        : 0;

    // --- current funds ---
    // currentFunds.value = calcValue(priceToUse, 'usd', bot, 'current', usdRate)  ← LIVE usdRate
    const currentValueUsd = calcValue(
      priceToUse,
      'usd',
      gridBot,
      'current',
      liveUsdRate
    );

    // --- total P&L ---
    // currentFunds.valueChange = currentFunds.value - initialFunds.value
    const totalPnL = round(currentValueUsd - initialValueAtStart, 2);
    const valueChangePerc =
      initialValueAtStart !== 0
        ? round(
            ((currentValueUsd - initialValueAtStart) / initialValueAtStart) *
              100,
            2
          )
        : 0;

    // --- current balances (with profit added to profitCurrency side, for display) ---
    const profitValue = isClosed
      ? (gridBot.profit?.total ?? 0)
      : gridBot.profit?.freeTotal || gridBot.profit?.total || 0;
    const currentBase =
      (gridBot.currentBalances?.base ?? 0) +
      (gridBot.settings?.profitCurrency === 'base' ? profitValue : 0);
    const currentQuote =
      (gridBot.currentBalances?.quote ?? 0) +
      (gridBot.settings?.profitCurrency === 'quote' ? profitValue : 0);

    // --- bot profit (USD mode) ---
    const botProfitTotalUsd = gridBot.profit?.totalUsd ?? 0;
    const botProfitPerc =
      initialValueAtStart !== 0
        ? round((botProfitTotalUsd / initialValueAtStart) * 100, 2)
        : 0;

    // --- bot free profit ---
    const botFreeProfitUsd = isClosed
      ? (gridBot.profit?.totalUsd ?? 0)
      : gridBot.profit?.freeTotalUsd || gridBot.profit?.totalUsd || 0;
    const botFreeProfitPerc =
      initialValueAtStart !== 0
        ? round((botFreeProfitUsd / initialValueAtStart) * 100, 2)
        : 0;

    // --- break even price ---
    const breakEvenPrice = gridBot.avgPrice ?? 0;

    // --- botProfitPnlUsd (legacy: formatted free/total profit in USD) ---
    const botProfitPnlUsdRaw = isClosed
      ? (gridBot.profit?.totalUsd ?? 0)
      : gridBot.profit?.freeTotalUsd || gridBot.profit?.totalUsd || 0;

    return {
      // current
      lastPrice: priceToUse,
      breakEvenPrice,
      botProfitUsd: round(botProfitTotalUsd, 2),
      botProfitPerc,
      botFreeProfitUsd: round(botFreeProfitUsd, 2),
      botFreeProfitPerc,
      currentBase,
      currentQuote,
      currentValueUsd: round(currentValueUsd, 2),
      botProfitPnlUsd: round(botProfitPnlUsdRaw, 2),
      totalPnL,
      valueChangePerc,
      isClosed,
      // initial
      initialPrice: gridBot.initialPrice ?? 0,
      initialBase,
      initialQuote,
      initialValueUsd: round(initialValueAtStart, 2),
      initialValueChange,
      initialValueChangePerc,
    };
  }, [gridBot]);

  if (!gridBot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-grid-funds-overview"
        title="Funds Overview"
        icon={DollarSign}
        minSize={{ w: 6, h: 4 }}
        maxSize={{ w: 12, h: 10 }}
      >
        <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
          Bot data unavailable
        </div>
      </DrawerSection>
    );
  }

  if (!data) return null;

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-grid-funds-overview"
      title="Funds Overview"
      icon={DollarSign}
      minSize={{ w: 6, h: 4 }}
      maxSize={{ w: 12, h: 10 }}
    >
      {/* Spot: two cards side-by-side (container-query responsive) */}
      {!gridBot.settings?.futures && (
        <div className="@container">
          <div className="grid grid-cols-1 @[400px]:grid-cols-2 gap-3">
            {/* Current Funds Card */}
            <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  Current Funds
                  <Tooltip
                    tooltip="The present value of your funds managed by the grid bot. This includes any profits or losses incurred since the inception of the bot."
                    tooltipURL="/help/initial-current-funds-grid"
                    side="top"
                  >
                    <InfoIcon />
                  </Tooltip>
                </p>
                <ProfitLossPercChip value={data.valueChangePerc} size="sm" />
              </div>
              <div className="divide-y divide-border/20">
                <FundsRow
                  label="Last Price"
                  tooltip="The price at which the bot last made a transaction."
                >
                  {formatPrice(data.lastPrice, quoteAsset)}
                </FundsRow>
                <FundsRow
                  label="Break Even"
                  tooltip="The price at which your initial value equals the current value of the bot."
                  tooltipUrl="/help/breakeven-price-grid"
                >
                  {data.breakEvenPrice === 0
                    ? `∞ ${quoteAsset}`
                    : data.breakEvenPrice < 0
                      ? `0 ${quoteAsset}`
                      : formatPrice(data.breakEvenPrice, quoteAsset)}
                </FundsRow>
                <FundsRow
                  label="Bot Profit"
                  tooltip="The bot's total realized P&L."
                >
                  <span className="flex items-center gap-1.5 justify-end flex-wrap">
                    <span
                      className={
                        data.botProfitUsd > 0
                          ? 'text-profit'
                          : data.botProfitUsd < 0
                            ? 'text-loss'
                            : ''
                      }
                    >
                      {formatValue(data.botProfitUsd, '$')} USD
                    </span>
                    <ProfitLossPercChip value={data.botProfitPerc} size="xs" />
                  </span>
                </FundsRow>
                {!data.isClosed && (
                  <FundsRow
                    label="Free Profit"
                    tooltip="The portion of profit generated by a grid bot that is readily available in your balance and is not earmarked for re-creating a grid order."
                    tooltipUrl="/help/free-profit-grid-bots"
                  >
                    <span className="flex items-center gap-1.5 justify-end flex-wrap">
                      <span
                        className={
                          data.botFreeProfitUsd > 0
                            ? 'text-profit'
                            : data.botFreeProfitUsd < 0
                              ? 'text-loss'
                              : ''
                        }
                      >
                        {formatValue(data.botFreeProfitUsd, '$')} USD
                      </span>
                      <ProfitLossPercChip
                        value={data.botFreeProfitPerc}
                        size="xs"
                      />
                    </span>
                  </FundsRow>
                )}
                <FundsRow label="Balances">
                  <div className="space-y-0.5">
                    <div>{formatBalance(data.currentBase, baseAsset)}</div>
                    <div>{formatBalance(data.currentQuote, quoteAsset)}</div>
                  </div>
                </FundsRow>
                <FundsRow
                  label="Value"
                  tooltip="The fiat value of the funds that the bot holds, including profit and excluding exchange fee."
                >
                  {formatValue(data.currentValueUsd, '$')} USD
                </FundsRow>
                <FundsRow
                  label="Net PnL"
                  tooltip="Everything this bot has made: what it holds now minus what it started with — booked grid profit plus the change in value of the inventory it still holds."
                >
                  <span
                    className={
                      data.totalPnL < 0
                        ? 'text-loss'
                        : data.totalPnL > 0
                          ? 'text-profit'
                          : ''
                    }
                  >
                    {formatValue(data.totalPnL, '$')} USD
                  </span>
                </FundsRow>
              </div>
            </div>

            {/* Initial Funds Card */}
            <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  Initial Funds
                  <Tooltip
                    tooltip="The value change of the initial funds at the current rates (i.e. buy and hold extrapolation)."
                    tooltipURL="/help/initial-current-funds-grid"
                    side="top"
                  >
                    <InfoIcon />
                  </Tooltip>
                </p>
                <ProfitLossPercChip
                  value={data.initialValueChangePerc}
                  size="sm"
                />
              </div>
              <div className="divide-y divide-border/20">
                <FundsRow
                  label="Initial Price"
                  tooltip="The price of the token at the start of the bot."
                >
                  {formatPrice(data.initialPrice, quoteAsset)}
                </FundsRow>
                <FundsRow label="Balances">
                  <div className="space-y-0.5">
                    <div>{formatBalance(data.initialBase, baseAsset)}</div>
                    <div>{formatBalance(data.initialQuote, quoteAsset)}</div>
                  </div>
                </FundsRow>
                <FundsRow
                  label="Value"
                  tooltip="The fiat value of the funds that the bot holds, including profit and excluding exchange fee."
                >
                  <span>{formatValue(data.initialValueUsd, '$')} USD</span>
                </FundsRow>
                <FundsRow
                  label="Value change"
                  tooltip="What the funds you started with would be worth now if you had simply held them, against what they were worth at the start. This is the market's move on your starting balances — the bot's own result is Net PnL above."
                >
                  <span
                    className={
                      data.initialValueChange < 0
                        ? 'text-loss'
                        : data.initialValueChange > 0
                          ? 'text-profit'
                          : ''
                    }
                  >
                    {formatValue(data.initialValueChange, '$')} USD
                  </span>
                </FundsRow>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Futures section */}
      {gridBot.settings?.futures && (
        <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Futures Position
            </p>
            <ProfitLossPercChip value={data.valueChangePerc} size="sm" />
          </div>
          <div className="divide-y divide-border/20">
            <FundsRow
              label="Last Price"
              tooltip="The last price at which the bot last transacted for this position."
            >
              {formatPrice(data.lastPrice, quoteAsset)}
            </FundsRow>
            <FundsRow
              label="Realized Profit"
              tooltip="The bot's total realized P&L."
            >
              <span className="flex items-center gap-1.5 justify-end">
                <span
                  className={
                    data.botProfitUsd > 0
                      ? 'text-profit'
                      : data.botProfitUsd < 0
                        ? 'text-loss'
                        : ''
                  }
                >
                  {formatValue(data.botProfitUsd, '$')} USD
                </span>
                <ProfitLossPercChip value={data.botProfitPerc} size="xs" />
              </span>
            </FundsRow>
            {(gridBot.settings as { leverage?: number }).leverage && (
              <FundsRow label="Leverage">
                {(gridBot.settings as { leverage?: number }).leverage}x
              </FundsRow>
            )}
          </div>
        </div>
      )}
    </DrawerSection>
  );
};

export default DrawerGridFundsOverview;
