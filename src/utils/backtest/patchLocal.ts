import { dispatchBacktestDbEvent } from '@/constants/backtest';
import { logger } from '@/lib/loggerInstance';

import { getById, getHedgeById, save, saveHedge } from './db';

/**
 * Patch this browser's IndexedDB copy of a backtest in place so it matches
 * a change already saved on the server (or, for a browser-only row, the only
 * copy there is). `patch` mutates the parsed payload and returns false when
 * nothing changed. No-op if there is no local copy.
 */
export const patchLocalBacktest = async (
  id: string,
  hedge: boolean,
  patch: (payload: Record<string, unknown>) => boolean
): Promise<void> => {
  try {
    const entry = hedge
      ? await getHedgeById(id, true)
      : await getById(id, true);
    if (!entry?.data) return;

    const parsed = JSON.parse(entry.data) as Record<string, unknown>;
    if (!patch(parsed)) return;
    const data = JSON.stringify(parsed);
    const next = { ...entry, data, size: data.length };

    if (hedge) {
      await saveHedge(next as Parameters<typeof saveHedge>[0]);
    } else {
      await save(next as Parameters<typeof save>[0]);
    }
    dispatchBacktestDbEvent();
  } catch (e) {
    logger.warn('[patchLocalBacktest] Could not patch local copy', {
      id,
      error: (e as Error)?.message,
    });
  }
};
