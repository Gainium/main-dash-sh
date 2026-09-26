import { useCallback, useEffect, useMemo, useState } from 'react';

import { BACKTEST_DB_UPDATED_EVENT } from '@/constants/backtest';
import { logger } from '@/lib/loggerInstance';
import type { GRIDBacktestingResultHistory } from '@/types';
import {
  listLocalBacktestSummaries,
  LOCAL_BACKTEST_LIST_LIMIT,
} from '@/utils/backtest/db';
import { localSummaryToHistory } from '@/utils/backtest/localRows';

export function useLocalGridBacktests() {
  const [entries, setEntries] = useState<GRIDBacktestingResultHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Summaries only — see useLocalBacktestsByType.
      const recent = await listLocalBacktestSummaries('backtest', {
        matches: (summary) => (summary.type || '').toLowerCase() === 'grid',
        limit: LOCAL_BACKTEST_LIST_LIMIT,
      });
      const filtered = recent
        .map((summary) =>
          localSummaryToHistory<GRIDBacktestingResultHistory>(summary)
        )
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
