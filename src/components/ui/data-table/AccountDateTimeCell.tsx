import { useAccountTimeZone } from '@/hooks/useAccountTimeZone';

/**
 * A date cell rendered in the ACCOUNT's timezone, so the day shown is the day
 * the column's `filterType: 'date'` filter matches on.
 *
 * It exists as a component because some column sets are built by PLAIN
 * FUNCTIONS rather than inside a component (the trading terminal's order /
 * position columns, the manual-backtesting trade columns). TanStack calls a
 * `cell` renderer as a function, not as a component, so a hook cannot run in an
 * inline arrow there — it has to be an element the table renders.
 *
 * Renders nothing for a value that is missing or unparseable, which is what the
 * call sites already did.
 */
export function AccountDateTimeCell({
  value,
}: {
  value: string | number | Date | null | undefined;
}) {
  const accountTimeZone = useAccountTimeZone();
  if (value === null || value === undefined || value === '') return <>—</>;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <>—</>;
  return <>{date.toLocaleString(undefined, { timeZone: accountTimeZone })}</>;
}
