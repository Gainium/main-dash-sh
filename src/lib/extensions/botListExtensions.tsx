/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BotTypesEnum } from '@/types';

// Bot list extensions — name-cell badges and extra list filters for the bot
// tables. Unregistered (the default) ⇒ nothing renders and no rows are
// filtered.

// ---------------------------------------------------------------------
// Name badges
// ---------------------------------------------------------------------

export interface BotNameBadgeProps {
  botId: string;
  botType: BotTypesEnum;
}

const badges: Array<{
  key: string;
  Component: React.ComponentType<BotNameBadgeProps>;
}> = [];

/** Register (or replace, by `key`) a badge rendered after a bot's name. */
export function registerBotNameBadge(
  key: string,
  Component: React.ComponentType<BotNameBadgeProps>
): void {
  const index = badges.findIndex((b) => b.key === key);
  if (index >= 0) badges[index] = { key, Component };
  else badges.push({ key, Component });
}

/** Every registered badge for one bot. */
export const BotNameBadges: React.FC<BotNameBadgeProps> = (props) => {
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map(({ key, Component }) => (
        <Component key={key} {...props} />
      ))}
    </>
  );
};

// ---------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------

export interface BotListFilter {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Bot types whose list shows this filter. */
  botTypes: readonly BotTypesEnum[];
  /**
   * Hook returning a row predicate, or `null` while unavailable (the toggle
   * is then hidden). Registered once at boot and called on every render of
   * every list page, so it must obey the rules of hooks.
   */
  useMatcher: (botType: BotTypesEnum) => ((botId: string) => boolean) | null;
}

const filters: BotListFilter[] = [];

const functionIds = new WeakMap<object, number>();
let nextFunctionId = 1;
function functionId(fn: object): number {
  let id = functionIds.get(fn);
  if (id === undefined) {
    id = nextFunctionId++;
    functionIds.set(fn, id);
  }
  return id;
}

/** Register (or replace, by `key`) a bot list filter. Call at boot. */
export function registerBotListFilter(filter: BotListFilter): void {
  const index = filters.findIndex((f) => f.key === filter.key);
  if (index >= 0) filters[index] = filter;
  else filters.push(filter);
}

export interface BotListFilterToggle {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | undefined;
  active: boolean;
  toggle: () => void;
}

export interface BotListFiltersResult {
  /** Toggles for the filters available on this list. */
  toggles: BotListFilterToggle[];
  /** Narrows `rows` to those every active filter accepts. */
  apply: <T>(rows: T[], getId: (row: T) => string) => T[];
}

/** Filter state + matchers for one bot list page. */
export function useBotListFilters(botType: BotTypesEnum): BotListFiltersResult {
  const [activeKeys, setActiveKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const matchers = filters.map((filter) =>
    // Registered once at boot — stable order, so a fixed hook list.
    filter.useMatcher(botType)
  );

  const toggleKey = useCallback((key: string) => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const available = filters
    .map((filter, i) => ({ filter, matcher: matchers[i] }))
    .filter(
      ({ filter, matcher }) => matcher && filter.botTypes.includes(botType)
    );

  const toggles: BotListFilterToggle[] = available.map(({ filter }) => ({
    key: filter.key,
    label: filter.label,
    icon: filter.icon,
    active: activeKeys.has(filter.key),
    toggle: () => toggleKey(filter.key),
  }));

  const activeMatchers = available
    .filter(({ filter }) => activeKeys.has(filter.key))
    .map(({ matcher }) => matcher as (botId: string) => boolean);
  // Identity signature of the active matchers: a matcher is a new function
  // whenever its data changes, so this changes exactly when `apply` must.
  const signature = activeMatchers.map(functionId).join(',');
  const matchersRef = useRef(activeMatchers);
  matchersRef.current = activeMatchers;

  const apply = useMemo(
    () =>
      signature === ''
        ? <T,>(rows: T[]): T[] => rows
        : <T,>(rows: T[], getId: (row: T) => string): T[] => {
            const current = matchersRef.current;
            return rows.filter((row) => current.every((m) => m(getId(row))));
          },
    [signature]
  );

  return { toggles, apply };
}

interface BotListFilterButtonsProps {
  toggles: BotListFilterToggle[];
  compact?: boolean;
}

/** Toolbar toggle buttons for `useBotListFilters().toggles`. */
export const BotListFilterButtons: React.FC<BotListFilterButtonsProps> = ({
  toggles,
  compact = false,
}) => (
  <>
    {toggles.map(({ key, label, icon: Icon, active, toggle }) => (
      <Button
        key={key}
        variant={active ? 'default' : 'ghost'}
        size={compact && Icon ? 'icon' : 'sm'}
        onClick={toggle}
        className={compact && Icon ? 'h-9 w-9' : 'h-9 gap-2 px-3'}
        title={active ? `Show all bots` : `Show only: ${label}`}
        aria-pressed={active}
        aria-label={label}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {!(compact && Icon) && <span>{label}</span>}
      </Button>
    ))}
  </>
);
