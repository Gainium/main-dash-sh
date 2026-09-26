import { useCallback, useEffect, useMemo, useState } from 'react';

import { BACKTEST_DB_UPDATED_EVENT } from '@/constants/backtest';
import { logger } from '@/lib/loggerInstance';
import type { GRIDBacktestingResultHistory, StoreBacktest } from '@/types';
import { getRecentFull, LOCAL_BACKTEST_LIST_LIMIT } from '@/utils/backtest/db';

const parseTimeFromId = (id: string): number | undefined => {
  const match = id.match(/(\d+)$/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const mapStoreEntryToHistory = (
  entry: StoreBacktest
): GRIDBacktestingResultHistory | null => {
  const parsed =
    typeof entry.data === 'string' ? safeParseJson(entry.data) : null;
  const base = (
    parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;

  const time =
    (base['time'] as number | undefined) ??
    parseTimeFromId(entry.id) ??
    Date.now();

  const history: Record<string, unknown> = {
    ...base,
    _id: (base['_id'] as string | undefined) ?? entry.id,
    time,
    exchange: (base['exchange'] as unknown) ?? entry.exchange,
    exchangeUUID: (base['exchangeUUID'] as string | undefined) ?? '',
    symbol: (base['symbol'] as string | undefined) ?? entry.symbol,
    baseAsset: (base['baseAsset'] as string | undefined) ?? entry.baseAsset,
    quoteAsset: (base['quoteAsset'] as string | undefined) ?? entry.quoteAsset,
    userId: (base['userId'] as string | undefined) ?? 'local',
    savePermanent: (base['savePermanent'] as boolean | undefined) ?? false,
    serverSide: (base['serverSide'] as boolean | undefined) ?? false,
  };

  if (!history['financial']) {
    return null;
  }

  return history as unknown as GRIDBacktestingResultHistory;
};

export function useLocalGridBacktests() {
  const [entries, setEntries] = useState<GRIDBacktestingResultHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const recent = await getRecentFull(
        (entry) => (entry.type || '').toLowerCase() === 'grid',
        LOCAL_BACKTEST_LIST_LIMIT
      );
      const filtered = recent
        .map(mapStoreEntryToHistory)
        .filter((v): v is GRIDBacktestingResultHistory => !!v)
        .sort((a, b) => (b.time || 0) - (a.time || 0));
      setEntries(filtered);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      logger.error(
        '[useLocalGridBacktests] Failed to load local grid backtests',
        err.message
      );
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void load();
    };
    window.addEventListener(BACKTEST_DB_UPDATED_EVENT, handler);
    return () => window.removeEventListener(BACKTEST_DB_UPDATED_EVENT, handler);
  }, [load]);

  const ids = useMemo(() => new Set(entries.map((b) => b._id)), [entries]);

  return { backtests: entries, ids, isLoading, error, refetch: load };
}
