import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useBotFormState } from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import getLatestPrices from '@/helper/price';
import { useBalanceStore } from '@/stores/live';
import {
  BotOrderSideEnum,
  BuyTypeEnum,
  ExchangeEnum,
  StrategyEnum,
  type Bot,
  type Prices,
} from '@/types';
import {
  createGridBotOrders,
  defaultContext,
  getEstimateGridBalance,
} from '@/utils/bots/dca/example-orders-core';
import { math } from '@/utils/math';
import { PlayCircle, ShieldAlert } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GridBot } from '@/types/gridBot';

export type StartDialogType = 'update' | 'start';

type BotActions =
  | 'proceed'
  | 'buyForAll'
  | 'buyForActive'
  | 'diff'
  | 'sellDiff';

export type PrepareStarDialog = {
  textNow: string;
  textTotal: string;
  baseBalance: string;
  quoteBalance: string;
  orderSwapNowInMainAsset: number;
  orderSwapNowInSecondaryAsset: number;
  orderSwapTotalInMainAsset: number;
  orderSwapTotalInSecondaryAsset: number;
  estimatedMainAssetNow: number;
  estimatedMainAssetActive: number;
  estimatedSecondaryNow: number;
  estimatedMainAssetTotal: number;
  estimatedSecondaryAssetTotal: number;
  show: boolean;
  currentSell: number;
  allSell: number;
  actions: Set<BotActions>;
  type: StartDialogType;
  diffMainAsset: number;
  diffSecondaryAsset: number;
  notEnoughBalance: boolean;
  mainAsset: string;
  secondaryAsset: string;
};

export interface GridStartBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    buyType: BuyTypeEnum,
    buyCount?: string,
    buyAmount?: number
  ) => void;
  isProcessing?: boolean;
  update?: boolean;
}

const defaultPrepareDialog: PrepareStarDialog = {
  textNow: '',
  textTotal: '',
  baseBalance: '',
  quoteBalance: '',
  orderSwapNowInMainAsset: 0,
  orderSwapNowInSecondaryAsset: 0,
  orderSwapTotalInMainAsset: 0,
  orderSwapTotalInSecondaryAsset: 0,
  estimatedMainAssetNow: 0,
  estimatedMainAssetActive: 0,
  estimatedSecondaryNow: 0,
  estimatedMainAssetTotal: 0,
  estimatedSecondaryAssetTotal: 0,
  show: false,
  currentSell: 0,
  allSell: 0,
  actions: new Set(),
  type: 'start',
  diffMainAsset: 0,
  diffSecondaryAsset: 0,
  notEnoughBalance: false,
  mainAsset: '',
  secondaryAsset: '',
};

const defaultSelectedIndex = BuyTypeEnum.all;

const indexesWeights: { [key in BotActions]: number } = {
  buyForActive: 5,
  buyForAll: 4,
  proceed: 3,
  diff: 2,
  sellDiff: 1,
};

const actionToBuyTypeEnum: { [key in BotActions]: BuyTypeEnum } = {
  buyForActive: BuyTypeEnum.X,
  buyForAll: BuyTypeEnum.all,
  proceed: BuyTypeEnum.proceed,
  diff: BuyTypeEnum.diff,
  sellDiff: BuyTypeEnum.sellDiff,
};

/**
 * A single "label … value" line used inside an asset card. Label is muted,
 * value is emphasised and right-aligned so amounts line up column-wise.
 */
const InfoRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-md">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="shrink-0 text-xs font-semibold tabular-nums text-card-foreground">
      {value}
    </span>
  </div>
);

/**
 * Groups one asset's free balance (prominent) with its required-amount rows
 * (secondary), so "what you have" vs "what's needed" reads at a glance.
 */
const AssetSummaryCard: React.FC<{
  free: React.ReactNode;
  children?: React.ReactNode;
}> = ({ free, children }) => (
  <div className="rounded-lg border border-border/60 bg-muted/5 p-md">
    <div className="flex items-baseline justify-between gap-md">
      <span className="text-sm text-muted-foreground">Free balance</span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-card-foreground">
        {free}
      </span>
    </div>
    {children && (
      <div className="mt-sm space-y-xs border-t border-border/40 pt-sm">
        {children}
      </div>
    )}
  </div>
);

export const GridStartBotDialog: React.FC<GridStartBotDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
  update,
}) => {
  const [startDialog, setStartDialog] =
    useState<PrepareStarDialog>(defaultPrepareDialog);
  const [selectedIndex, setSelectedIndex] =
    React.useState<BuyTypeEnum>(defaultSelectedIndex);
  const [latestPrices, setLatestPrices] = useState<Prices>([]);

  const { formData, errors } = useBotFormState();
  const { currentExchange } = useBotFormQuery();
  const { bot } = useBotFormQuery();

  const balances = useBalanceStore((state) => state.balances);

  useEffect(() => {
    const unsubscribe = getLatestPrices((prices) => {
      setLatestPrices(prices.data ?? []);
    }, false);

    return () => {
      unsubscribe();
    };
  }, []);

  const latestPrice = useMemo(() => {
    return (
      latestPrices.find(
        (p) =>
          p.symbol === [formData.pair].flat()[0] &&
          p.exchange === currentExchange?.provider
      )?.price || 0
    );
  }, [latestPrices, currentExchange, formData.pair]);

  const settings = useMemo(() => formData.grid, [formData.grid]);
  const isShort = useMemo(
    () => settings.strategy === StrategyEnum.short,
    [settings.strategy]
  );

  const symbol = useMemo(() => {
    const pair = [formData.pair].flat()[0];
    const b = bot as GridBot | undefined;
    return formData.pairMetadata[pair]
      ? { ...formData.pairMetadata[pair], maxOrders: 200 }
      : b?.symbol
        ? {
            pair,
            exchange: b.exchange as ExchangeEnum,
            baseAsset: {
              name: b.symbol.baseAsset,
              minAmount: 0,
              maxAmount: Infinity,
              step: 0.00000001,
            },
            quoteAsset: {
              name: b.symbol.quoteAsset,
              minAmount: 0,
            },
            priceAssetPrecision: 8,
            crossAvailable: false,
            maxOrders: 200,
          }
        : {
            pair,
            exchange: (b?.exchange as ExchangeEnum) || ExchangeEnum.binance,
            baseAsset: {
              name: '',
              minAmount: 0,
              maxAmount: Infinity,
              step: 0.00000001,
            },
            quoteAsset: {
              name: '',
              minAmount: 0,
            },
            priceAssetPrecision: 8,
            crossAvailable: false,
            maxOrders: 200,
          };
  }, [formData.pairMetadata, formData.pair, bot]);

  const baseName = useMemo(
    () => symbol?.baseAsset.name ?? '',
    [symbol?.baseAsset.name]
  );
  const quoteName = useMemo(
    () => symbol?.quoteAsset.name ?? '',
    [symbol?.quoteAsset.name]
  );

  const precision = useMemo(
    () => ({
      base: 8,
      quote: 8,
    }),
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const b = bot as Bot;
    const lp =
      settings.startPrice &&
      settings.startPrice !== '' &&
      settings.startPrice !== '0' &&
      settings.useStartPrice
        ? +settings.startPrice
        : latestPrice;
    const startPrice =
      settings.startPrice &&
      settings.startPrice !== '' &&
      settings.startPrice !== '0' &&
      settings.useStartPrice
        ? +settings.startPrice
        : (b.initialPrice ?? lp);

    const userBalances = (balances ?? []).filter(
      (b) =>
        [baseName, quoteName].includes(b.asset) &&
        b.exchangeUUID === formData.exchangeUUID
    );
    const lockedBaseBalance = `${userBalances.find((b) => b.asset === baseName)?.locked || 0}`;
    const lockedQuoteBalance = `${userBalances.find((b) => b.asset === quoteName)?.locked || 0}`;
    let baseBalance = `${userBalances.find((b) => b.asset === baseName)?.free || 0}`;
    baseBalance = `${math.round(parseFloat(baseBalance), precision.base)}`;
    let quoteBalance = `${userBalances.find((b) => b.asset === quoteName)?.free || 0}`;
    quoteBalance = `${math.round(parseFloat(quoteBalance), precision.quote)}`;
    const newGrids =
      createGridBotOrders(
        {
          all: false,
          nosplice: false,
          withoutErrorCheck: true,
          initialPrice: startPrice,
        },
        {
          ...defaultContext,
          gridSettings: settings,
          symbol,
          inputLatestPrice: latestPrice,
          errors,
          userFee: formData.userFee?.makerCommission || 0,
        }
      ) || [];
    let allNewGrids = newGrids;
    const estimateBalanceNow = getEstimateGridBalance(
      newGrids,
      { ...settings, pair: symbol.pair, name: '' },
      symbol
    ) || {
      base: 0,
      quote: 0,
    };

    estimateBalanceNow.base = math.round(
      estimateBalanceNow.base,
      precision.base
    );
    estimateBalanceNow.quote = math.round(
      estimateBalanceNow.quote,
      precision.quote
    );
    if (update && symbol) {
      const orders = createGridBotOrders(
        {
          all: true,
          nosplice: false,
          withoutErrorCheck: true,
          initialPrice: startPrice,
        },
        {
          ...defaultContext,
          gridSettings: settings,
          symbol,
          inputLatestPrice: lp,
          errors,
          userFee: formData.userFee?.makerCommission || 0,
        }
      );
      const base = orders
        .filter((o) => o.side === BotOrderSideEnum.sell)
        .reduce((acc, o) => acc + o.qty, 0);
      const quote = orders
        .filter((o) => o.side === BotOrderSideEnum.buy)
        .reduce((acc, o) => acc + o.qty * o.price, 0);
      baseBalance = `${math.round(
        parseFloat(baseBalance) + Math.min(+lockedBaseBalance, base),
        precision.base
      )}`;
      quoteBalance = `${math.round(
        parseFloat(quoteBalance) + Math.min(+lockedQuoteBalance, quote),
        precision.base
      )}`;
    }

    const mainAsset = !isShort ? baseName : quoteName;
    const secondaryAsset = !isShort ? quoteName : baseName;
    let estimateBalanceTotal = estimateBalanceNow;
    let orderSwapNowInMainAsset = !isShort
      ? math.round(estimateBalanceNow.base, precision.base, false, true)
      : math.round(estimateBalanceNow.quote, precision.quote, false, true);

    let orderSwapNowInSecondaryAsset = !isShort
      ? math.round(orderSwapNowInMainAsset * lp, precision.quote)
      : math.round(orderSwapNowInMainAsset / lp, precision.base);
    let orderSwapTotalInMainAsset = orderSwapNowInMainAsset;
    let orderSwapTotalInSecondaryAsset = orderSwapNowInSecondaryAsset;
    if (settings.useOrderInAdvance) {
      allNewGrids = createGridBotOrders(
        {
          all: true,
          nosplice: false,
          withoutErrorCheck: true,
          initialPrice: startPrice,
        },
        {
          ...defaultContext,
          gridSettings: settings,
          symbol,
          inputLatestPrice: lp,
          errors,
          userFee: formData.userFee?.makerCommission || 0,
        }
      );
      estimateBalanceTotal = getEstimateGridBalance(
        allNewGrids,
        { ...settings, pair: symbol.pair, name: '' },
        symbol
      ) || {
        base: 0,
        quote: 0,
      };
      estimateBalanceTotal.base = math.round(
        estimateBalanceTotal.base,
        precision.base
      );
      estimateBalanceTotal.quote = math.round(
        estimateBalanceTotal.quote,
        precision.quote
      );
      orderSwapTotalInMainAsset = !isShort
        ? math.round(estimateBalanceTotal.base, precision.base, false, true)
        : math.round(estimateBalanceTotal.quote, precision.quote, false, true);
      orderSwapTotalInSecondaryAsset = !isShort
        ? math.round(orderSwapTotalInMainAsset * lp, precision.quote)
        : math.round(orderSwapTotalInMainAsset / lp, precision.base);
    }
    let textNow = '';
    let textTotal = '';
    const minAmount = !isShort
      ? symbol?.quoteAsset.minAmount || 0
      : symbol?.baseAsset.minAmount || 0;
    if (
      orderSwapNowInSecondaryAsset > 0 &&
      orderSwapNowInSecondaryAsset < minAmount
    ) {
      const missedQty = !isShort
        ? math.round(
            estimateBalanceNow.base - parseFloat(baseBalance),
            precision.base
          )
        : math.round(
            estimateBalanceNow.quote - parseFloat(quoteBalance),
            precision.quote
          );
      textNow = `(missing quantity is ${missedQty} ${mainAsset} (${orderSwapNowInSecondaryAsset} ${secondaryAsset}), but minimum order amount is ${minAmount} ${secondaryAsset},`;
      orderSwapNowInMainAsset = !isShort
        ? math.round(minAmount / lp, precision.base, false, true)
        : math.round(minAmount * lp, precision.quote, false, true);
      orderSwapNowInSecondaryAsset = !isShort
        ? math.round(orderSwapNowInMainAsset * lp, precision.quote)
        : math.round(orderSwapNowInMainAsset / lp, precision.base);
      textNow = `${textNow} so order will be placed for ${orderSwapNowInMainAsset} ${mainAsset} (${orderSwapNowInSecondaryAsset} ${secondaryAsset})).`;
    }
    if (
      orderSwapNowInMainAsset > 0 &&
      orderSwapNowInSecondaryAsset < minAmount
    ) {
      const missedQty = !isShort
        ? math.round(estimateBalanceTotal.base - parseFloat(baseBalance), 10)
        : math.round(estimateBalanceTotal.quote - parseFloat(quoteBalance), 10);
      textTotal = `(missing quantity is ${missedQty} ${mainAsset} (${orderSwapNowInSecondaryAsset} ${secondaryAsset}), but minimum order amount is ${minAmount} ${secondaryAsset},`;
      orderSwapNowInMainAsset = !isShort
        ? math.round(minAmount / lp, precision.base, false, true)
        : math.round(minAmount * lp, precision.quote, false, true);
      orderSwapNowInSecondaryAsset = !isShort
        ? math.round(orderSwapNowInMainAsset * lp, precision.quote)
        : math.round(orderSwapNowInMainAsset / lp, precision.base);
      textTotal = `${textTotal} so order will be placed for ${orderSwapNowInMainAsset} ${mainAsset} (${orderSwapNowInSecondaryAsset} ${secondaryAsset})).`;
    }
    const confirmDialog: PrepareStarDialog = {
      textNow,
      textTotal,
      baseBalance,
      quoteBalance,
      orderSwapNowInMainAsset,
      orderSwapNowInSecondaryAsset,
      orderSwapTotalInMainAsset,
      orderSwapTotalInSecondaryAsset,
      estimatedMainAssetNow: !isShort
        ? estimateBalanceNow.base
        : estimateBalanceNow.quote,
      estimatedSecondaryNow: !isShort
        ? estimateBalanceNow.quote
        : estimateBalanceNow.base,
      estimatedMainAssetTotal: !isShort
        ? estimateBalanceTotal.base
        : estimateBalanceTotal.quote,
      estimatedSecondaryAssetTotal: !isShort
        ? estimateBalanceTotal.quote
        : estimateBalanceTotal.base,
      allSell: allNewGrids.filter((g) => g.side === (!isShort ? 'SELL' : 'BUY'))
        .length,
      currentSell: newGrids.filter(
        (g) => g.side === (!isShort ? 'SELL' : 'BUY')
      ).length,
      estimatedMainAssetActive: !isShort
        ? estimateBalanceNow.base
        : estimateBalanceNow.quote,
      actions: new Set() as PrepareStarDialog['actions'],
      type: update
        ? ('update' as StartDialogType)
        : ('start' as StartDialogType),
      diffMainAsset: 0,
      diffSecondaryAsset: 0,
      notEnoughBalance: false,
      show: true,
      mainAsset,
      secondaryAsset,
    };
    const secondaryAssetBalance = !isShort
      ? +confirmDialog.quoteBalance
      : +confirmDialog.baseBalance;
    const mainAssetBalance = !isShort
      ? +confirmDialog.baseBalance
      : +confirmDialog.quoteBalance;
    if (bot) {
      const diffMainAsset =
        confirmDialog.estimatedMainAssetTotal - mainAssetBalance; /*  *
          (1 - (userFee ?? 0)) */

      const diffSecondaryAsset = !isShort
        ? diffMainAsset * lp
        : diffMainAsset / lp;
      if (
        diffMainAsset > 0 &&
        diffSecondaryAsset < secondaryAssetBalance &&
        mainAssetBalance > 0
      ) {
        confirmDialog.actions.add('diff');
        confirmDialog.diffMainAsset = math.round(
          diffMainAsset,
          !isShort ? precision.base : precision.quote
        );
        confirmDialog.diffSecondaryAsset = math.round(
          diffSecondaryAsset,
          !isShort ? precision.quote : precision.base
        );
      }
      if (
        diffMainAsset < 0 &&
        diffSecondaryAsset < secondaryAssetBalance &&
        secondaryAssetBalance > 0
      ) {
        confirmDialog.actions.add('sellDiff');
        confirmDialog.diffMainAsset = math.round(
          -1 * diffMainAsset,
          !isShort ? precision.base : precision.quote
        );
        confirmDialog.diffSecondaryAsset = math.round(
          -1 * diffSecondaryAsset,
          !isShort ? precision.quote : precision.base
        );
      }
    }
    if (
      secondaryAssetBalance >= confirmDialog.estimatedSecondaryNow &&
      mainAssetBalance >= confirmDialog.estimatedMainAssetActive
    ) {
      confirmDialog.actions.add('proceed');
    }
    if (
      secondaryAssetBalance >=
        confirmDialog.orderSwapTotalInSecondaryAsset +
          confirmDialog.estimatedSecondaryNow &&
      confirmDialog.orderSwapTotalInSecondaryAsset > 0
    ) {
      confirmDialog.actions.add('buyForAll');
    }
    if (confirmDialog.actions.has('sellDiff')) {
      confirmDialog.actions.add('proceed');
    }
    /* if (bot.settings.useOrderInAdvance && bot.settings.ordersInAdvance) {
        if (
          secondaryAssetBalance >=
            confirmDialog.orderSwapNowInSecondaryAsset +
              confirmDialog.estimatedSecondaryNow &&
          confirmDialog.orderSwapNowInSecondaryAsset > 0
        ) {
          confirmDialog.actions.add('buyForActive')
        }

        setSellOrders(`${confirmDialog.currentSell}`)
        _setSellOrders(`${confirmDialog.currentSell}`)
      } */
    let index = BuyTypeEnum.proceed;

    if (confirmDialog.actions.has('diff')) {
      index = BuyTypeEnum.diff;
    }
    if (confirmDialog.actions.has('sellDiff')) {
      index = BuyTypeEnum.sellDiff;
    }
    /* if (confirmDialog.actions.has('buyForActive')) {
        index = BuyTypeEnum.X
      } */
    if (confirmDialog.actions.has('buyForAll')) {
      index = BuyTypeEnum.all;
    }
    if (settings.skipBalanceCheck && confirmDialog.actions.size === 0) {
      confirmDialog.actions.add('proceed');
    }
    if (confirmDialog.actions.has('proceed')) {
      index = BuyTypeEnum.proceed;
    }
    confirmDialog.notEnoughBalance =
      !settings.skipBalanceCheck &&
      (confirmDialog.estimatedSecondaryNow !== 0 ||
        confirmDialog.estimatedSecondaryAssetTotal !== 0) &&
      confirmDialog.estimatedSecondaryNow +
        (confirmDialog.orderSwapNowInSecondaryAsset > 0 &&
        confirmDialog.orderSwapNowInMainAsset > mainAssetBalance
          ? confirmDialog.orderSwapNowInSecondaryAsset
          : 0) >
        secondaryAssetBalance &&
      !confirmDialog.actions.has('diff');
    setSelectedIndex(index);
    setStartDialog(confirmDialog);
  }, [
    latestPrice,
    formData.grid,
    formData.userFee,
    formData.exchangeUUID,
    balances,
    bot,
    errors,
    update,
    open,
    settings,
    isShort,
    baseName,
    quoteName,
    symbol,
    precision,
  ]);

  const secondaryAsset = useMemo(
    () => (!isShort ? quoteName : baseName),
    [isShort, quoteName, baseName]
  );

  const mainAsset = useMemo(
    () => (!isShort ? baseName : quoteName),
    [isShort, quoteName, baseName]
  );

  const notEnoughBalance = useMemo(
    () => startDialog.notEnoughBalance,
    [startDialog.notEnoughBalance]
  );

  const notEnoughForAll = useMemo(
    () =>
      startDialog.estimatedSecondaryAssetTotal >
        (!isShort
          ? parseFloat(startDialog.quoteBalance)
          : parseFloat(startDialog.baseBalance)) &&
      !startDialog.actions.has('sellDiff'),
    [
      isShort,
      startDialog.estimatedSecondaryAssetTotal,
      startDialog.baseBalance,
      startDialog.quoteBalance,
      startDialog.actions,
    ]
  );

  const showWarning = useMemo(
    () => notEnoughBalance || notEnoughForAll,
    [notEnoughBalance, notEnoughForAll]
  );

  const minimumAmount = useMemo(
    () =>
      math.round(
        startDialog.estimatedSecondaryNow +
          Math.max(startDialog.orderSwapNowInSecondaryAsset, 0),
        !isShort ? precision.quote : precision.base
      ),
    [
      startDialog.estimatedSecondaryNow,
      startDialog.orderSwapNowInSecondaryAsset,
      isShort,
      precision.base,
      precision.quote,
    ]
  );

  const mainBalance = useMemo(
    () => (!isShort ? startDialog.baseBalance : startDialog.quoteBalance),
    [isShort, startDialog.baseBalance, startDialog.quoteBalance]
  );

  const oppositeAction = useMemo(() => (!isShort ? 'Sell' : 'Buy'), [isShort]);

  const secondaryBalance = useMemo(
    () => (!isShort ? startDialog.quoteBalance : startDialog.baseBalance),
    [isShort, startDialog.quoteBalance, startDialog.baseBalance]
  );

  const action = useMemo(() => (!isShort ? 'Buy' : 'Sell'), [isShort]);

  const options = useMemo(
    () => ({
      [BuyTypeEnum.X]: `${action} for ${
        /* bot?.settings.useOrderInAdvance ? `${sellOrders} orders only` :  */ ''
      } (${startDialog.orderSwapNowInSecondaryAsset} ${secondaryAsset})`,
      [BuyTypeEnum.all]: `${action} for all orders (${startDialog.orderSwapTotalInSecondaryAsset} ${secondaryAsset})`,
      [BuyTypeEnum.proceed]: 'Use existing balance',
      [BuyTypeEnum.diff]: `${action} difference ${startDialog.diffMainAsset} ${mainAsset} (${startDialog.diffSecondaryAsset} ${secondaryAsset})`,
      [BuyTypeEnum.sellDiff]: `${oppositeAction} difference ${startDialog.diffMainAsset} ${mainAsset} (${startDialog.diffSecondaryAsset} ${secondaryAsset})`,
    }),
    [
      /*  sellOrders, */
      mainAsset,
      secondaryAsset,
      startDialog,
      /* bot?.settings.useOrderInAdvance, */
      action,
      oppositeAction,
    ]
  );

  const actions = useMemo(
    () =>
      [...startDialog.actions].sort(
        (a, b) => indexesWeights[b] - indexesWeights[a]
      ),
    [startDialog.actions]
  );

  const handleConfirm = useCallback(() => {
    onConfirm(
      selectedIndex,
      '',
      !isShort ? startDialog.diffMainAsset : startDialog.diffSecondaryAsset
    );
  }, [
    onConfirm,
    selectedIndex,
    isShort,
    startDialog.diffMainAsset,
    startDialog.diffSecondaryAsset,
  ]);

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <PlayCircle className="h-5 w-5 text-success" />
            {startDialog.type === 'start'
              ? `Start bot confirmation`
              : `Update bot confirmation`}
          </DialogTitle>
          {!formData.grid.futures && (
            <DialogDescription className="text-sm text-muted-foreground">
              Choose how the bot should handle base and quote assets.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-md">
          {/* Balance Information Section — one card per asset */}
          {!settings?.futures && (
            <div className="space-y-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {mainAsset}
              </p>
              <AssetSummaryCard free={`${mainBalance} ${mainAsset}`}>
                <InfoRow
                  label={`Required to place ${
                    formData.grid.useOrderInAdvance ? 'active ' : ''
                  }${oppositeAction.toLowerCase()} orders`}
                  value={`${startDialog.estimatedMainAssetActive} ${mainAsset}`}
                />
                {formData.grid.useOrderInAdvance && (
                  <InfoRow
                    label={`Required to place all ${oppositeAction.toLowerCase()} orders`}
                    value={`${startDialog.estimatedMainAssetTotal} ${mainAsset}`}
                  />
                )}
                {startDialog.textNow !== '' && (
                  <p className="pt-xs text-xs text-destructive">
                    {startDialog.textNow}
                  </p>
                )}
                {formData.grid.useOrderInAdvance &&
                  startDialog.textTotal !== '' && (
                    <p className="pt-xs text-xs text-destructive">
                      {startDialog.textTotal}
                    </p>
                  )}
              </AssetSummaryCard>
            </div>
          )}

          {/* Secondary Asset Balance */}
          {!settings?.futures ? (
            <div className="space-y-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {secondaryAsset}
              </p>
              <AssetSummaryCard free={`${secondaryBalance} ${secondaryAsset}`}>
                <InfoRow
                  label={`Required to place ${
                    formData.grid.useOrderInAdvance ? 'active ' : ''
                  }${action.toLowerCase()} orders`}
                  value={`${startDialog.estimatedSecondaryNow} ${secondaryAsset}`}
                />
                {formData.grid.useOrderInAdvance && (
                  <InfoRow
                    label={`Required to place all ${action.toLowerCase()} orders`}
                    value={`${startDialog.estimatedSecondaryAssetTotal} ${secondaryAsset}`}
                  />
                )}
              </AssetSummaryCard>
            </div>
          ) : (
            <div className="space-y-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {settings.coinm ? baseName : quoteName}
              </p>
              <AssetSummaryCard
                free={`${
                  settings.coinm
                    ? startDialog.baseBalance
                    : startDialog.quoteBalance
                } ${settings.coinm ? baseName : quoteName}`}
              >
                <InfoRow
                  label={`Required to place ${
                    formData.grid.useOrderInAdvance ? 'active ' : ''
                  }orders`}
                  value={`${
                    settings.coinm
                      ? startDialog.estimatedMainAssetNow
                      : startDialog.estimatedSecondaryNow
                  } ${settings.coinm ? baseName : quoteName}`}
                />
                {formData.grid.useOrderInAdvance && (
                  <InfoRow
                    label="Required to place all orders"
                    value={`${
                      settings.coinm
                        ? startDialog.estimatedMainAssetTotal
                        : startDialog.estimatedSecondaryAssetTotal
                    } ${settings.coinm ? baseName : quoteName}`}
                  />
                )}
              </AssetSummaryCard>
            </div>
          )}

          {/* Action Selection Cards */}
          {!settings?.futures &&
            startDialog.actions.size > 0 &&
            !startDialog.notEnoughBalance && (
              <div className="border-t border-border/50 pt-md">
                <p className="mb-sm text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  How to fund {startDialog.mainAsset}
                </p>
                <div className="space-y-sm">
                  {actions.map((action) => {
                    const buyTypeEnum = actionToBuyTypeEnum[action];
                    const isSelected = selectedIndex === buyTypeEnum;
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => setSelectedIndex(buyTypeEnum)}
                        className={cn(
                          'w-full text-left rounded-xl border border-border/60 bg-muted/5 p-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary/50',
                          isSelected
                            ? 'ring-2 ring-primary/80 bg-primary/5 border-primary/50 shadow-lg'
                            : 'hover:bg-muted/20'
                        )}
                        disabled={isProcessing}
                      >
                        <div className="font-medium text-sm sm:text-base text-card-foreground">
                          {options[buyTypeEnum]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Additional balance warnings */}
          {settings?.useOrderInAdvance &&
            startDialog.orderSwapTotalInMainAsset > 0 &&
            startDialog.orderSwapTotalInMainAsset >
              (settings.strategy === StrategyEnum.short
                ? +startDialog.quoteBalance
                : +startDialog.baseBalance) &&
            startDialog.orderSwapNowInMainAsset <
              (settings.strategy === StrategyEnum.short
                ? +startDialog.quoteBalance
                : +startDialog.baseBalance) &&
            selectedIndex === BuyTypeEnum.proceed && (
              <Alert className="border-destructive/40 bg-destructive/10">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">
                  If you use current {mainAsset} balance, you might need add{' '}
                  {math.round(
                    startDialog.orderSwapTotalInMainAsset -
                      (settings.strategy === StrategyEnum.short
                        ? +startDialog.quoteBalance
                        : +startDialog.baseBalance),
                    10
                  )}{' '}
                  {mainAsset} later.
                </AlertDescription>
              </Alert>
            )}

          {/* Start Price Warning */}
          {!startDialog.notEnoughBalance &&
            settings?.useStartPrice &&
            settings?.startPrice && (
              <Alert className="border-border/50 bg-muted/15">
                <AlertDescription className="text-xs sm:text-sm">
                  This action will apply when the start price is reached
                </AlertDescription>
              </Alert>
            )}

          {/* Main Warning - Balance Issues */}
          {showWarning && (
            <Alert className="border-destructive/40 bg-destructive/10">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs sm:text-sm">
                {notEnoughBalance ? (
                  !settings.futures ? (
                    <>
                      You cannot proceed as your {secondaryAsset} balance not
                      enough to place buy orders and buy {mainAsset}. Minimum
                      amount is {minimumAmount} {secondaryAsset}.
                    </>
                  ) : (
                    <>
                      You cannot proceed as your {secondaryAsset} balance not
                      enough to place orders. Minimum amount is {minimumAmount}{' '}
                      {secondaryAsset}.
                    </>
                  )
                ) : (
                  <>
                    Your {secondaryAsset} balance is not enough to place all
                    orders. You might need to add{' '}
                    {math.round(
                      startDialog.estimatedSecondaryAssetTotal -
                        (!isShort
                          ? parseFloat(startDialog.quoteBalance)
                          : parseFloat(startDialog.baseBalance)),
                      10
                    )}{' '}
                    {secondaryAsset} later.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              isProcessing ||
              startDialog.actions.size === 0 ||
              startDialog.notEnoughBalance
            }
            className="w-full sm:w-auto"
            onClick={handleConfirm}
          >
            {isProcessing ? 'Starting…' : 'Start bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GridStartBotDialog;
