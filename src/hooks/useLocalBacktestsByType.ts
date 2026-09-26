import { useCallback, useEffect, useMemo, useState } from 'react';

import { BACKTEST_DB_UPDATED_EVENT } from '@/constants/backtest';
import { logger } from '@/lib/loggerInstance';
import type { DCABacktestingResultHistory } from '@/types';
import {
  listLocalBacktestSummaries,
  LOCAL_BACKTEST_LIST_LIMIT,
} from '@/utils/backtest/db';
import { localSummaryToHistory } from '@/utils/backtest/localRows';

export type LocalBacktestEntryType = 'DCA' | 'Combo' | 'Grid';

const normalizeEntryType = (
  raw: string | undefined
): LocalBacktestEntryType | null => {
  if (!raw) return null;
  if (raw === 'DCA' || raw === 'Combo' || raw === 'Grid') return raw;
  // Some older entries may use lowercase or other variants
  const upper = raw.toUpperCase();
  if (upper === 'DCA' || upper === 'COMBO' || upper === 'GRID') {
    return (
      upper === 'COMBO' ? 'Combo' : upper === 'GRID' ? 'Grid' : 'DCA'
    ) as LocalBacktestEntryType;
  }
  return null;
};

export function useLocalBacktestsByType(type: LocalBacktestEntryType) {
  const [entries, setEntries] = useState<DCABacktestingResultHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Summaries only: rows carry the list fields, not the engine result.
      // Opening a row loads its payload (loadLocalBacktestHistory).
      const recent = await listLocalBacktestSummaries('backtest', {
        matches: (summary) => normalizeEntryType(summary.type) === type,
        limit: LOCAL_BACKTEST_LIST_LIMIT,
      });
      const filtered = recent
        .map((summary) =>
          localSummaryToHistory<DCABacktestingResultHistory>(summary)
        )
        .filter((v): v is DCABacktestingResultHistory => !!v)
        .sort((a, b) => (b.time || 0) - (a.time || 0));

      setEntries(filtered);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      logger.error(
        '[useLocalBacktestsByType] Failed to load local backtests',
        err.message
      );
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [type]);

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
