import type { ExchangeEnum } from '@/types/exchange.types';
import type { RowPosition } from '@/features/trading-terminal/components/exchangeOrderColumns';
import { isCoinmExchange } from '@/utils/exchangeUtils';

import { balanceBasisFor } from './balanceBasis';

/**
 * Pure numbers behind the Portfolio page's futures card: per-account wallet /
 * unrealized PnL / equity, and net exposure per base asset.
 *
 * `null` means "can't state this honestly" and renders as "—": a partial sum
 * looks confident and is wrong.
 */

export type FuturesAccountInput = {
  id: string;
  name: string;
  provider: ExchangeEnum | string;
  /** Stored balance in USD, as the Accounts panel shows it. */
  balance?: number | null | undefined;
};

/** The subset of a terminal `RowPosition` the summary reads. */
export type FuturesPositionInput = Pick<
  RowPosition,
  | 'exchangeUUID'
  | 'exchange'
  | 'side'
  | 'quantity'
  | 'baseAssetName'
  | 'quoteAssetName'
  | 'markPrice'
  | 'pnl'
  | 'symbolFull'
>;

export type FuturesAccountRow = {
  id: string;
  name: string;
  provider: ExchangeEnum | string;
  wallet: number | null;
  upnl: number | null;
  equity: number | null;
};

export type ExposureRow = { asset: string; net: number };

export type FuturesSummary = {
  rows: FuturesAccountRow[];
  total: { wallet: number | null; upnl: number | null; equity: number | null };
  exposure: {
    top: ExposureRow[];
    other: { count: number; net: number; rows: ExposureRow[] } | null;
  };
  openPositions: number;
};

export const EXPOSURE_TOP_N = 5;

/** Quote assets counted 1:1 as USD. Anything else is treated as unpriced. */
const USD_LIKE_QUOTES = new Set(['USD', 'USDT', 'USDC', 'USDH', 'FDUSD', 'BUSD']);

const quoteOf = (p: FuturesPositionInput) =>
  (p.quoteAssetName ?? p.symbolFull?.quoteAsset?.name ?? '').toUpperCase();

/** Unrealized PnL in USD, or null when it can't be valued. */
function positionUpnl(p: FuturesPositionInput): number | null {
  if (!p.pnl || !USD_LIKE_QUOTES.has(quoteOf(p))) return null;
  return p.pnl.pnlQuote;
}

/** Signed notional at mark in USD (long +, short −), or null when unpriced. */
function positionNotional(p: FuturesPositionInput): number | null {
  if (!USD_LIKE_QUOTES.has(quoteOf(p))) return null;
  const qty = Math.abs(Number(p.quantity));
  if (!Number.isFinite(qty) || qty === 0) return null;
  const sign = String(p.side).toUpperCase() === 'SHORT' ? -1 : 1;
  if (isCoinmExchange(p.exchange)) {
    // Inverse sizes count contracts; the contract's USD value is the
    // notional, the same reading `addSymbolToPositions` uses for P&L.
    const contractSize = Number(p.symbolFull?.quoteAsset?.minAmount ?? 1);
    return sign * qty * (contractSize > 0 ? contractSize : 1);
  }
  if (!p.markPrice || !(p.markPrice > 0)) return null;
  return sign * qty * p.markPrice;
}

const sumOrNull = (values: Array<number | null>) =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((s, v) => s + (v as number), 0);

export function summarizeFutures({
  accounts,
  positions,
  positionsKnown = true,
}: {
  accounts: FuturesAccountInput[];
  positions: FuturesPositionInput[];
  /**
   * False while positions are loading or failed to load: unrealized PnL is
   * then unknown (not zero), so only the balance's own basis column shows.
   */
  positionsKnown?: boolean;
}): FuturesSummary {
  const rows: FuturesAccountRow[] = accounts.map((a) => {
    const own = positions.filter((p) => p.exchangeUUID === a.id);
    const upnl = positionsKnown ? sumOrNull(own.map(positionUpnl)) : null;
    const reported =
      typeof a.balance === 'number' && Number.isFinite(a.balance)
        ? a.balance
        : null;
    const basis = balanceBasisFor(a.provider);

    let wallet: number | null = null;
    let equity: number | null = null;
    if (reported !== null && basis === 'wallet') {
      wallet = reported;
      equity = upnl === null ? null : reported + upnl;
    } else if (reported !== null && basis === 'equity') {
      equity = reported;
      wallet = upnl === null ? null : reported - upnl;
    }
    return { id: a.id, name: a.name, provider: a.provider, wallet, upnl, equity };
  });

  const total = {
    wallet: sumOrNull(rows.map((r) => r.wallet)),
    upnl: sumOrNull(rows.map((r) => r.upnl)),
    equity: sumOrNull(rows.map((r) => r.equity)),
  };

  const accountIds = new Set(accounts.map((a) => a.id));
  const netByAsset = new Map<string, number>();
  let openPositions = 0;
  for (const p of positionsKnown ? positions : []) {
    if (!accountIds.has(p.exchangeUUID)) continue;
    openPositions += 1;
    const notional = positionNotional(p);
    if (notional === null) continue;
    const asset = (p.baseAssetName ?? p.symbolFull?.baseAsset?.name ?? '').toUpperCase();
    if (!asset) continue;
    netByAsset.set(asset, (netByAsset.get(asset) ?? 0) + notional);
  }

  const sorted = [...netByAsset.entries()]
    .map(([asset, net]) => ({ asset, net }))
    .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
  const top = sorted.slice(0, EXPOSURE_TOP_N);
  const rest = sorted.slice(EXPOSURE_TOP_N);

  return {
    rows,
    total,
    exposure: {
      top,
      other: rest.length
        ? {
            count: rest.length,
            net: rest.reduce((s, r) => s + r.net, 0),
            rows: rest,
          }
        : null,
    },
    openPositions,
  };
}
