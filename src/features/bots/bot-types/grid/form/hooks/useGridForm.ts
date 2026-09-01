import { useMemo } from 'react';

import {
  useBotFormState,
  type BotFormStateContextValue,
} from '@/contexts/bots/form/BotFormProvider';
import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import type { GridLeverageState } from '@/types/bots/grid/data';
import type { BotFormData } from '@/types/bots/form';
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
const extractPair = (pairs: BotFormData['pair']): ParsedPair => {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return { raw: '', baseAsset: '', quoteAsset: '' };
  }

  const raw = pairs[0];
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
}

const DEFAULT_LEVERAGE_STATE: GridLeverageState = {
  brackets: [],
  isLoading: false,
};

export const useGridForm = (): GridFormContext => {
  const formState = useBotFormState();
  const gridPage = useOptionalGridPageContext();

  const primaryPair = useMemo(
    () => extractPair(formState.formData.pair),
    [formState.formData.pair]
  );
  const leverageState = gridPage?.state.leverage ?? DEFAULT_LEVERAGE_STATE;

  return useMemo(
    () => ({
      formState,
      primaryPair,
      baseAsset: primaryPair.baseAsset,
      quoteAsset: primaryPair.quoteAsset,
      leverage: leverageState,
    }),
    [formState, primaryPair, leverageState]
  );
};
