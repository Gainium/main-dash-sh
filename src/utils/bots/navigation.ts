import {
  COMBO_BOT_TYPE_ID,
  GRID_BOT_TYPE_ID,
  HEDGE_BOT_TYPE_ID,
  HEDGE_COMBO_BOT_TYPE_ID,
  HEDGE_DCA_BOT_TYPE_ID,
} from '@/features/bots/registry';

const DEFAULT_VIEW_ROUTE = (id: string) => `/bot/view/${id}`;

// The registry IDs are hyphenated (`hedge-dca` / `hedge-combo`), but
// `BotTypesEnum` uses camelCase (`hedgeDca` / `hedgeCombo`) and is what
// most callers thread through `type` props. Register both spellings so
// `buildBotViewRoute` / `buildBotEditRoute` resolve correctly regardless
// of which the caller hands in. Without the aliases, hedge bots fall
// through to the DCA defaults (e.g. `/bot/edit/<id>`).
const VIEW_ROUTE_BUILDERS: Record<string, (id: string) => string> = {
  [GRID_BOT_TYPE_ID]: (id: string) => `/grid/view/${id}`,
  [COMBO_BOT_TYPE_ID]: (id: string) => `/combo/view/${id}`,
  [HEDGE_BOT_TYPE_ID]: (id: string) => `/hedge/bot/view/${id}`,
  [HEDGE_DCA_BOT_TYPE_ID]: (id: string) => `/hedge/bot/view/${id}`,
  [HEDGE_COMBO_BOT_TYPE_ID]: (id: string) => `/hedge/combo/view/${id}`,
  hedgeDca: (id: string) => `/hedge/bot/view/${id}`,
  hedgeCombo: (id: string) => `/hedge/combo/view/${id}`,
};

const DEFAULT_EDIT_ROUTE = (id: string) => `/bot/edit/${id}`;

const EDIT_ROUTE_BUILDERS: Record<string, (id: string) => string> = {
  [GRID_BOT_TYPE_ID]: (id: string) => `/grid/edit/${id}`,
  [COMBO_BOT_TYPE_ID]: (id: string) => `/combo/edit/${id}`,
  [HEDGE_BOT_TYPE_ID]: (id: string) => `/hedge/bot/edit/${id}`,
  [HEDGE_DCA_BOT_TYPE_ID]: (id: string) => `/hedge/bot/edit/${id}`,
  [HEDGE_COMBO_BOT_TYPE_ID]: (id: string) => `/hedge/combo/edit/${id}`,
  hedgeDca: (id: string) => `/hedge/bot/edit/${id}`,
  hedgeCombo: (id: string) => `/hedge/combo/edit/${id}`,
};

/**
 * Build a view route for a bot based on its type ID
 * @param botTypeId - The type ID of the bot (e.g., 'dca', 'grid', 'combo', etc.)
 * @param botId - The unique ID of the bot
 * @returns The view route for the bot (e.g., '/bot/view/123', '/grid/view/456')
 */
export function buildBotViewRoute(
  botTypeId: string | null | undefined,
  botId: string | null | undefined
): string {
  if (!botId) {
    return '/bot';
  }

  const builder = botTypeId ? VIEW_ROUTE_BUILDERS[botTypeId] : undefined;
  return (builder ?? DEFAULT_VIEW_ROUTE)(botId);
}

/**
 * Build a view route from a simple bot type string (e.g., 'combo', 'grid', 'dca')
 * This is useful when you only have the botType string from API response
 * @param botType - The type of the bot as a string
 * @param botId - The unique ID of the bot
 * @returns The view route for the bot
 */
export function buildBotViewRouteFromType(
  botType: string | null | undefined,
  botId: string | null | undefined
): string {
  if (!botId) {
    return '/bot';
  }

  const normalizedType = botType?.toLowerCase() || '';

  if (normalizedType.includes('hedgecombo')) {
    return `/hedge/combo/view/${botId}`;
  }
  if (normalizedType.includes('hedgedca') || normalizedType === 'hedge') {
    return `/hedge/bot/view/${botId}`;
  }
  if (normalizedType.includes('combo')) {
    return `/combo/view/${botId}`;
  }
  if (normalizedType.includes('grid')) {
    return `/grid/view/${botId}`;
  }

  return `/bot/view/${botId}`;
}

export function buildBotEditRoute(
  botTypeId: string | null | undefined,
  botId: string | null | undefined
): string {
  if (!botId) {
    return '/bot';
  }

  const builder = botTypeId ? EDIT_ROUTE_BUILDERS[botTypeId] : undefined;
  return (builder ?? DEFAULT_EDIT_ROUTE)(botId);
}

// Cloning opens the matching *create* page pre-loaded with the source bot's
// settings (`?load=<id>`) rather than immediately creating a copy. This keeps
// the pair/exchange editable before saving — the create form treats `?load=`
// as an unsaved template, so `isExchangeLocked = !!editId` stays false. Every
// bot type routes through here so "Clone" behaves identically everywhere
// (the combo/grid immediate-copy path was the inconsistency this replaces).
const DEFAULT_CLONE_ROUTE = (id: string) => `/bot/new?load=${id}`;

const CLONE_ROUTE_BUILDERS: Record<string, (id: string) => string> = {
  [GRID_BOT_TYPE_ID]: (id: string) => `/grid/new?load=${id}`,
  [COMBO_BOT_TYPE_ID]: (id: string) => `/combo/new?load=${id}`,
  [HEDGE_BOT_TYPE_ID]: (id: string) => `/hedge/bot/new?load=${id}`,
  [HEDGE_DCA_BOT_TYPE_ID]: (id: string) => `/hedge/bot/new?load=${id}`,
  [HEDGE_COMBO_BOT_TYPE_ID]: (id: string) => `/hedge/combo/new?load=${id}`,
  hedgeDca: (id: string) => `/hedge/bot/new?load=${id}`,
  hedgeCombo: (id: string) => `/hedge/combo/new?load=${id}`,
};

/**
 * Build the clone route for a bot based on its type ID. Navigating here opens
 * the create page with the source bot's settings loaded but unsaved, so the
 * user can change the pair/exchange before creating the copy.
 * @param botTypeId - The type ID of the bot ('dca', 'grid', 'combo', 'hedgeDca', …)
 * @param botId - The unique ID of the source bot to clone
 * @returns The pre-filled create route (e.g. '/combo/new?load=123')
 */
export function buildBotCloneRoute(
  botTypeId: string | null | undefined,
  botId: string | null | undefined
): string {
  if (!botId) {
    return '/bot';
  }

  const builder = botTypeId ? CLONE_ROUTE_BUILDERS[botTypeId] : undefined;
  return (builder ?? DEFAULT_CLONE_ROUTE)(botId);
}
