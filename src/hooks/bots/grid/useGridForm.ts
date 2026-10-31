import { useContext, useEffect, useMemo, useState } from 'react';

import {
  useTrackedBotFormState,
  type BotFormStateContextValue,
} from '@/contexts/bots/form/BotFormProvider';
import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { BotFormQueryContext } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import type { GridLeverageState } from '@/types/bots/grid/data';
import type { BotFormData } from '@/types/bots/form';
import type { GridBot } from '@/types/gridBot';
import type { TradingPair } from '@/hooks/useTradingPairs';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import type { Prices } from '@/types';
import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { normalizePairKey, resolvePairAssets } from '@/utils/pairs';

interface ParsedPair {
  raw: string;
  baseAsset: string;
  quoteAsset: string;
}

// The pair's own metadata names its assets; `resolvePairAssets` uses it when
// it is loaded and otherwise splits only a symbol it can split unambiguously.
// A concatenated symbol like `QNTUSD` (QNT/USD or QN/TUSD) comes back blank
// until the metadata arrives, so the form never asks for a TUSD balance.
const extractPair = (
  pair: BotFormData['pair'],
  lookups: Array<Record<string, TradingPair> | null | undefined>
): ParsedPair => {
  if (!Array.isArray(pair) || pair.length === 0) {
    return { raw: '', baseAsset: '', quoteAsset: '' };
  }

  const raw = pair[0];
  if (!raw) {
    return { raw: '', baseAsset: '', quoteAsset: '' };
  }

  const sanitized = raw.trim().toUpperCase();
  if (!sanitized) {
    return { raw: '', baseAsset: '', quoteAsset: '' };
  }

  const key = normalizePairKey(sanitized);
  const metadata = lookups.map((map) => map?.[key]).find(Boolean);
  const { baseAsset, quoteAsset } = resolvePairAssets(sanitized, metadata);
  return {
    raw: sanitized,
    baseAsset: baseAsset.toUpperCase(),
    quoteAsset: quoteAsset.toUpperCase(),
  };
};

export interface GridFormContext {
  formState: BotFormStateContextValue;
  primaryPair: ParsedPair;
  baseAsset: string;
  quoteAsset: string;
  leverage: GridLeverageState;
  bot: GridBot | null;
  exchangeLabel: string;
  latestPrice: number | undefined;
  usdPrice: number | undefined;
}

const DEFAULT_LEVERAGE_STATE: GridLeverageState = {
  brackets: [],
  isLoading: false,
};

const normalizeAsset = (asset?: string) =>
  asset?.toUpperCase?.().trim() || undefined;

export const useGridForm = (): GridFormContext => {
  // Tracked: grid sections re-render only for the fields they read.
  const formState = useTrackedBotFormState();
  const gridPage = useOptionalGridPageContext();
  const queryByPair = useContext(BotFormQueryContext)?.pairMetadata?.byPair;
  const formPairMetadata = formState.formData.pairMetadata;

  const primaryPair = useMemo(
    () => extractPair(formState.formData.pair, [queryByPair, formPairMetadata]),
    [formState.formData.pair, queryByPair, formPairMetadata]
  );
  const leverageState = gridPage?.state.leverage ?? DEFAULT_LEVERAGE_STATE;
  const bot = (gridPage?.state.bot as GridBot | undefined) ?? null;
  const exchangeLabel =
    typeof bot?.exchange === 'string' && bot.exchange.trim().length > 0
      ? bot.exchange
      : '';

  const selectedPairs = useMemo(() => {
    const metadata = formState.formData.pairMetadata ?? {};
    const rawPairs = Array.isArray(formState.formData.pair)
      ? formState.formData.pair
      : [];

    const unique = new Map<string, TradingPair>();
    rawPairs.forEach((pairKey) => {
      const normalized = pairKey?.toUpperCase?.();
      if (!normalized) {
        return;
      }
      const pairMetadata = metadata[normalized];
      if (!pairMetadata) {
        return;
      }
      const identifier = `${pairMetadata.exchange}_${pairMetadata.pair}`;
      if (!unique.has(identifier)) {
        unique.set(identifier, pairMetadata);
      }
    });

    return Array.from(unique.values());
  }, [formState.formData.pairMetadata, formState.formData.pair]);

  const [prices, setPrices] = useState<Prices>([]);

  useEffect(() => {
    const unsubscribe = getLatestPrices((d) => setPrices(d.data ?? []), false);
    return () => {
      unsubscribe();
    };
  }, [setPrices]);

  const activePair = useMemo(() => selectedPairs[0], [selectedPairs]);

  const fallbackPrice = useMemo(() => {
    if (!activePair) {
      return undefined;
    }

    try {
      const localPrices = getLocalPrices();
      const targetSymbol = activePair.pair?.toUpperCase?.();
      if (!Array.isArray(localPrices) || !targetSymbol) {
        return undefined;
      }

      const match = localPrices.find((price) => {
        const symbolMatches = price.symbol?.toUpperCase?.() === targetSymbol;
        const exchangeMatches = price.exchange
          ? price.exchange === activePair.exchange
          : true;
        return symbolMatches && exchangeMatches;
      });

      return match?.price;
    } catch {
      return undefined;
    }
  }, [activePair]);

  const quoteAsset = useMemo(() => {
    const asset = normalizeAsset(activePair?.quoteAsset?.name);
    return asset || undefined;
  }, [activePair?.quoteAsset?.name]);

  const latestPrice = useMemo(() => {
    if (!activePair) {
      return fallbackPrice;
    }

    const update = prices.find(
      (p) =>
        p.symbol === activePair?.pair && p.exchange === activePair?.exchange
    );
    return typeof update?.price === 'number' ? update.price : fallbackPrice;
  }, [activePair, prices, fallbackPrice]);

  const usdPrice = useMemo(
    () => findUSDRate(quoteAsset || 'USDT', prices ?? [], activePair?.exchange),
    [quoteAsset, prices, activePair?.exchange]
  );

  // A read-only settings view (the bot drawer's Settings tab) must not touch
  // the shared store: each setContext recomputes `orders` from the form
  // context, which this mode never seeds, and that wipes the bot's live grid
  // lines the drawer put on the chart. Same guard as useDcaTradingContext.
  const isSkipExampleOrders = formState.mode === 'settings-readonly';

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({ inputLatestPrice: latestPrice });
  }, [latestPrice, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({ usdPrice: usdPrice });
  }, [usdPrice, isSkipExampleOrders]);

  return useMemo(
    () => ({
      formState,
      primaryPair,
      baseAsset: primaryPair.baseAsset,
      quoteAsset: primaryPair.quoteAsset,
      leverage: leverageState,
      bot,
      exchangeLabel,
      latestPrice,
      usdPrice,
    }),
    [
      formState,
      primaryPair,
      leverageState,
      bot,
      exchangeLabel,
      latestPrice,
      usdPrice,
    ]
  );
};
