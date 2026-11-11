import type { PeriodValue } from '@/components/ui/PeriodDatePicker';

/**
 * Creation time of a saved bot, in ms. DCA / combo / hedge bots carry the
 * backend's `created` (ISO string); the mapped grid list shape carries a
 * numeric `createdAt`. Returns null when neither parses, so callers keep
 * their own default window.
 */
export const botStartTime = (
  bot: { created?: unknown; createdAt?: unknown } | null | undefined
): number | null => {
  if (!bot) return null;
  for (const raw of [bot.created, bot.createdAt]) {
    if (raw == null || raw === '') continue;
    const ms =
      typeof raw === 'number'
        ? raw
        : raw instanceof Date
          ? raw.getTime()
          : typeof raw === 'string'
            ? /^\d+$/.test(raw)
              ? Number(raw)
              : Date.parse(raw)
            : NaN;
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
};

/**
 * The backtest window for an existing bot: its start up to `now`, so a test
 * of new settings covers the same market the bot has actually traded (V1
 * opened the bot's backtest on created → updated; `now` is used instead
 * because `updated` cuts a running bot short). A start in the future (clock
 * skew) or missing yields null — the caller keeps its default.
 */
export const botStartBacktestPeriod = (
  startMs: number | null | undefined,
  now: number
): PeriodValue | null => {
  if (startMs == null || !Number.isFinite(startMs) || startMs >= now) {
    return null;
  }
  return { from: new Date(startMs), to: new Date(now) };
};
