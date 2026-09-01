import { useEffect, useMemo, useState } from 'react';

import {
  useBotFormState,
  type BotFormStateContextValue,
} from '@/contexts/bots/form/BotFormProvider';
import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import type { GridLeverageState } from '@/types/bots/grid/data';
import type { BotFormData } from '@/types/bots/form';
import type { GridBot } from '@/types/gridBot';
import type { TradingPair } from '@/hooks/useTradingPairs';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import type { Prices } from '@/types';
import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { extractPairAssets } from '@/utils/pairs';

interface ParsedPair {
  raw: string;
  baseAsset: string;
  quoteAsset: string;
}

// The grid form used to carry its own pair parser: a short KNOWN_QUOTES list
// and, when nothing matched, `slice(-3)`. Any symbol whose quote is not in
// that list fell through to the slice, which is how an OKX X-Perp pair
// (`ARB-USD_UM_XPERP`) became base `ARB-USD_UM_XP` / quote `ERP` and every
// field in the form ended up labelled "ERP" — investment, range, balance.
// `extractPairAssets` is the shared resolver the rest of the app already
// uses: it understands slash- and dash-separated symbols, the X-Perp
// contract-family suffix, and the concatenated form.
const extractPair = (pair: BotFormData['pair']): ParsedPair => {
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

  const { baseAsset, quoteAsset } = extractPairAssets(sanitized);
  return { raw: sanitized, baseAsset, quoteAsset };
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
  const formState = useBotFormState();
  const gridPage = useOptionalGridPageContext();

  const primaryPair = useMemo(
    () => extractPair(formState.formData.pair),
    [formState.formData.pair]
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

  useEffect(() => {
    exampleOrdersStore.setContext({ inputLatestPrice: latestPrice });
  }, [latestPrice]);

  useEffect(() => {
    exampleOrdersStore.setContext({ usdPrice: usdPrice });
  }, [usdPrice]);

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
