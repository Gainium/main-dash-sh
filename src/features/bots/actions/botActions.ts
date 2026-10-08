/**
 * Bot actions registry.
 *
 * The single definition of WHICH actions exist for a bot, in what order, and
 * when each one is shown, disabled (and why), or offered in bulk. Every bot
 * surface — cards, table rows, the detail drawer (⋮ menu and footer), the
 * name-cell icons, the bot form overflow menu, the hedge edit footer and the
 * bulk toolbars — builds its items from here via `buildSurfaceItems` /
 * `buildBotBulkActions`, and runs them through `useBotActions` /
 * `useBulkBotRunner`. A surface only decides which ids it opts OUT of.
 *
 * Gating rule (identical on every surface):
 *   - action not applicable to the bot's kind → hidden;
 *   - start/stop and archive/unarchive are toggle pairs: only the side that
 *     matches the bot's current state is shown;
 *   - applicable but blocked by the bot's status → shown DISABLED with the
 *     reason as its tooltip;
 *   - demo mode / view-only (share link, someone else's bot) → every
 *     mutating action shown DISABLED with the read-only reason.
 *
 * Pure module: no React, no stores, no network — so the parity test can run
 * it directly.
 */
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Copy,
  Edit,
  ExternalLink,
  LineChart,
  MinusCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Share,
  Share2,
  Square,
  Star,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { ComponentType } from 'react';

import {
  getArchiveBlockedReason,
  getDeleteBlockedReason,
  isBotArchivable,
  isBotDeletable,
  isBotRestartable,
} from '@/utils/botStatusUtils';

export type BotKind = 'dca' | 'combo' | 'grid' | 'hedgeDca' | 'hedgeCombo';

export const ALL_BOT_KINDS: readonly BotKind[] = [
  'dca',
  'combo',
  'grid',
  'hedgeDca',
  'hedgeCombo',
];
const STANDARD_KINDS: readonly BotKind[] = ['dca', 'combo', 'grid'];

export const isHedgeKind = (kind: BotKind): boolean =>
  kind === 'hedgeDca' || kind === 'hedgeCombo';

/** Grid stop-dialog context (close options depend on market + position). */
export interface GridStopContext {
  futures: boolean;
  hasOpenPosition: boolean;
  isShort: boolean;
}

/**
 * A bot, normalised for the action layer. Build it with the adapters in
 * `botRef.ts` — never by hand on a surface.
 */
export interface BotRef {
  kind: BotKind;
  /**
   * The id every action targets. For a hedge bot this is the hedge WRAPPER
   * id, never a leg id. Empty for an unsaved bot (the create form).
   */
  id: string;
  name: string;
  status: string;
  /** The bot lives in paper trading. */
  paper: boolean;
  archived: boolean;
  active: boolean;
  /** Open deals (grid: active buy + sell levels; hedge: both legs). */
  activeDeals: number;
  totalValue: number;
  currency: string;
  lastActivity: string;
  /** Present for grid bots only. */
  grid?: GridStopContext;
  /** Raw bot payload — what Share Configuration / Duplicate copy. */
  raw?: unknown;
}

/** Form-only context, set by the bot form surfaces. */
export interface BotFormActionContext {
  mode: 'create' | 'edit';
  /** Reason the grid add/reduce funds actions are unavailable, if any. */
  fundsDisabledReason?: string;
  /** Bot share link currently enabled (checkmark on Share bot access). */
  shareEnabled?: boolean;
}

export interface BotActionContext {
  /** Global demo mode. */
  readOnly: boolean;
  /** Share-link visitor or a bot owned by someone else. */
  viewOnly: boolean;
  starred: boolean;
  /** In-flight actions (spinner + disabled). */
  pending: Partial<Record<BotActionId, boolean>>;
  form?: BotFormActionContext;
}

export const BOT_ACTION_IDS = [
  'openNewTab',
  'star',
  'start',
  'stop',
  'restart',
  'edit',
  'clone',
  'shareConfig',
  'duplicateToOtherMode',
  'archive',
  'unarchive',
  'delete',
  // Form-only actions (surfaces opt in).
  'importExport',
  'resetDefaults',
  'shareAccess',
  'backtest',
  'addFunds',
  'reduceFunds',
] as const;

export type BotActionId = (typeof BOT_ACTION_IDS)[number];

export type BotActionGroup = 'nav' | 'primary' | 'share' | 'manage' | 'form';

/**
 * Who executes an action:
 *  - `runner`: `useBotActions` implements it (navigation or mutation);
 *  - `surface`: it opens a dialog only the surface can render (the form's
 *    import/export, reset, share-access and funds dialogs), so a surface
 *    that shows it must supply the handler (`providesHandlers`).
 */
export type BotActionHandler = 'runner' | 'surface';

export interface BotBulkSpec {
  /**
   * `any`: offered when at least one selected bot is eligible (the others
   * are skipped and the confirm dialog says how many). `all`: offered only
   * when every selected bot is eligible.
   */
  appliesTo: 'any' | 'all';
  /** Per-bot eligibility. Omitted = every bot is eligible. */
  eligible?: (bot: BotRef) => boolean;
}

export interface BotActionDef {
  id: BotActionId;
  label: (bot: BotRef, ctx: BotActionContext) => string;
  pendingLabel?: (bot: BotRef) => string;
  icon: ComponentType<{ className?: string }>;
  group: BotActionGroup;
  kinds: readonly BotKind[];
  /** Locked by demo mode / view-only. */
  mutating: boolean;
  destructive?: boolean;
  /** Lifecycle actions the drawer footer renders as buttons. */
  lifecycle?: boolean;
  handler: BotActionHandler;
  /** Extra visibility rule (kind applicability is checked first). */
  visible?: (bot: BotRef, ctx: BotActionContext) => boolean;
  /** Status-based block; returns the tooltip reason when blocked. */
  blockedReason?: (bot: BotRef, ctx: BotActionContext) => string | undefined;
  bulk?: BotBulkSpec;
}

const saved = (bot: BotRef) => bot.id !== '';

const ARCHIVED_START_REASON = 'Unarchive the bot before starting it.';
const ARCHIVED_EDIT_REASON = 'Unarchive the bot before editing it.';
const RESTART_BLOCKED_REASON = 'Only running bots can be restarted.';
const RESET_BLOCKED_REASON =
  'Reset to defaults is only available while creating a bot.';

export const DEMO_MODE_REASON = 'Not available in demo mode';
export const VIEW_ONLY_REASON = 'Not available in view-only mode';

export const botActions: readonly BotActionDef[] = [
  {
    id: 'openNewTab',
    label: () => 'Open in new tab',
    icon: ExternalLink,
    group: 'nav',
    kinds: ALL_BOT_KINDS,
    mutating: false,
    handler: 'runner',
    visible: saved,
  },
  {
    id: 'star',
    label: (_bot, ctx) => (ctx.starred ? 'Unstar' : 'Star'),
    icon: Star,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: false,
    handler: 'runner',
    visible: saved,
  },
  {
    id: 'start',
    label: () => 'Start',
    pendingLabel: () => 'Starting…',
    icon: Play,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    lifecycle: true,
    handler: 'runner',
    visible: (bot) => saved(bot) && !bot.active,
    blockedReason: (bot) => (bot.archived ? ARCHIVED_START_REASON : undefined),
    bulk: {
      appliesTo: 'any',
      eligible: (bot) => !bot.active && !bot.archived,
    },
  },
  {
    id: 'stop',
    label: () => 'Stop',
    pendingLabel: () => 'Stopping…',
    icon: Square,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    lifecycle: true,
    handler: 'runner',
    visible: (bot) => saved(bot) && bot.active,
    bulk: { appliesTo: 'any', eligible: (bot) => bot.active },
  },
  {
    id: 'restart',
    label: () => 'Restart',
    pendingLabel: () => 'Restarting…',
    icon: RefreshCw,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    lifecycle: true,
    handler: 'runner',
    visible: saved,
    blockedReason: (bot) =>
      isBotRestartable(bot.status) ? undefined : RESTART_BLOCKED_REASON,
    bulk: {
      appliesTo: 'any',
      eligible: (bot) => isBotRestartable(bot.status),
    },
  },
  {
    id: 'edit',
    label: () => 'Edit',
    icon: Edit,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    lifecycle: true,
    handler: 'runner',
    visible: saved,
    blockedReason: (bot) => (bot.archived ? ARCHIVED_EDIT_REASON : undefined),
    // Bulk edit is not built yet: the toolbar entry says so (product call).
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'clone',
    label: () => 'Clone',
    icon: Copy,
    group: 'primary',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    handler: 'runner',
    visible: saved,
  },
  {
    id: 'shareConfig',
    label: () => 'Share Configuration',
    icon: Share,
    group: 'share',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    handler: 'runner',
    visible: saved,
  },
  {
    // Hedge bots have no paper↔live mapping, so the action is not offered
    // for them (Clone covers copying a hedge bot in the current mode).
    id: 'duplicateToOtherMode',
    label: (bot) => `Duplicate to ${bot.paper ? 'live' : 'paper'}`,
    icon: RefreshCw,
    group: 'share',
    kinds: STANDARD_KINDS,
    mutating: true,
    handler: 'runner',
    visible: saved,
  },
  {
    id: 'archive',
    label: () => 'Archive',
    pendingLabel: () => 'Archiving…',
    icon: Archive,
    group: 'manage',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    handler: 'runner',
    visible: (bot) => saved(bot) && !bot.archived,
    blockedReason: (bot) => getArchiveBlockedReason(bot.status),
    bulk: {
      appliesTo: 'any',
      eligible: (bot) => isBotArchivable(bot.status) && !bot.archived,
    },
  },
  {
    id: 'unarchive',
    label: () => 'Unarchive',
    pendingLabel: () => 'Unarchiving…',
    icon: ArchiveRestore,
    group: 'manage',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    handler: 'runner',
    visible: (bot) => saved(bot) && bot.archived,
    bulk: { appliesTo: 'any', eligible: (bot) => bot.archived },
  },
  {
    id: 'delete',
    label: () => 'Delete',
    pendingLabel: () => 'Deleting…',
    icon: Trash2,
    group: 'manage',
    kinds: ALL_BOT_KINDS,
    mutating: true,
    destructive: true,
    handler: 'runner',
    visible: saved,
    blockedReason: (bot) => getDeleteBlockedReason(bot.status),
    bulk: { appliesTo: 'all', eligible: (bot) => isBotDeletable(bot.status) },
  },
  {
    id: 'importExport',
    label: () => 'Import / Export settings',
    icon: ArrowLeftRight,
    group: 'form',
    kinds: ALL_BOT_KINDS,
    mutating: false,
    handler: 'surface',
    visible: (_bot, ctx) => !!ctx.form,
  },
  {
    id: 'resetDefaults',
    label: () => 'Reset to defaults',
    icon: RotateCcw,
    group: 'form',
    kinds: ALL_BOT_KINDS,
    mutating: false,
    handler: 'surface',
    visible: (_bot, ctx) => !!ctx.form,
    blockedReason: (_bot, ctx) =>
      ctx.form?.mode === 'edit' ? RESET_BLOCKED_REASON : undefined,
  },
  {
    id: 'shareAccess',
    label: () => 'Share bot access',
    icon: Share2,
    group: 'form',
    kinds: STANDARD_KINDS,
    mutating: true,
    handler: 'surface',
    visible: (bot, ctx) => !!ctx.form && saved(bot),
  },
  {
    id: 'backtest',
    label: () => 'Run backtest',
    icon: LineChart,
    group: 'form',
    kinds: STANDARD_KINDS,
    mutating: false,
    handler: 'runner',
    visible: (bot, ctx) => !!ctx.form && saved(bot),
  },
  {
    id: 'addFunds',
    label: () => 'Add funds',
    icon: Wallet,
    group: 'form',
    kinds: ['grid'],
    mutating: true,
    handler: 'surface',
    visible: (bot, ctx) => !!ctx.form && saved(bot),
    blockedReason: (_bot, ctx) => ctx.form?.fundsDisabledReason,
  },
  {
    id: 'reduceFunds',
    label: () => 'Reduce funds',
    icon: MinusCircle,
    group: 'form',
    kinds: ['grid'],
    mutating: true,
    handler: 'surface',
    visible: (bot, ctx) => !!ctx.form && saved(bot),
    blockedReason: (_bot, ctx) => ctx.form?.fundsDisabledReason,
  },
];

const DEF_BY_ID = new Map(botActions.map((def) => [def.id, def]));

export const getBotActionDef = (id: BotActionId): BotActionDef => {
  const def = DEF_BY_ID.get(id);
  if (!def) throw new Error(`Unknown bot action: ${id}`);
  return def;
};

/** Read-only lock reason, or undefined when the viewer may mutate. */
export const readOnlyReason = (ctx: BotActionContext): string | undefined =>
  ctx.readOnly ? DEMO_MODE_REASON : ctx.viewOnly ? VIEW_ONLY_REASON : undefined;

/** Whether the action is shown at all for this bot (ignoring surfaces). */
export const isBotActionVisible = (
  def: BotActionDef,
  bot: BotRef,
  ctx: BotActionContext
): boolean =>
  def.kinds.includes(bot.kind) && (def.visible ? def.visible(bot, ctx) : true);

/** A resolved, render-ready action item. */
export interface BotActionItem {
  id: BotActionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  group: BotActionGroup;
  lifecycle: boolean;
  destructive: boolean;
  pending: boolean;
  disabled: boolean;
  /** Tooltip explaining why the item is disabled. */
  disabledReason?: string;
  /** On/off state (Star: starred; Share bot access: link enabled). */
  checked?: boolean;
}

export const resolveBotAction = (
  def: BotActionDef,
  bot: BotRef,
  ctx: BotActionContext
): BotActionItem => {
  const pending = !!ctx.pending[def.id];
  const reason =
    (def.mutating ? readOnlyReason(ctx) : undefined) ??
    def.blockedReason?.(bot, ctx);
  return {
    id: def.id,
    label: pending && def.pendingLabel ? def.pendingLabel(bot) : def.label(bot, ctx),
    icon: def.icon,
    group: def.group,
    lifecycle: !!def.lifecycle,
    destructive: !!def.destructive,
    pending,
    disabled: pending || !!reason,
    ...(reason ? { disabledReason: reason } : {}),
    ...(def.id === 'shareAccess'
      ? { checked: !!ctx.form?.shareEnabled }
      : def.id === 'star'
        ? { checked: ctx.starred }
        : {}),
  };
};

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export type BotActionSurfaceId =
  | 'card'
  | 'tableRow'
  | 'hedgeCard'
  | 'hedgeRow'
  | 'drawerMenu'
  | 'drawerFooter'
  | 'nameCell'
  | 'form'
  | 'hedgeForm';

export interface BotActionSurface {
  /**
   * Ids this surface deliberately does not render. Everything else the
   * registry shows for a bot appears here, so a new registry action shows
   * up on every surface unless the surface opts out explicitly.
   */
  exclude: readonly BotActionId[];
  /** `surface`-handled actions this surface supplies a handler for. */
  providesHandlers?: readonly BotActionId[];
  /** Render order override (ids not listed keep registry order, after). */
  order?: readonly BotActionId[];
}

const FORM_ONLY: readonly BotActionId[] = [
  'importExport',
  'resetDefaults',
  'shareAccess',
  'backtest',
  'addFunds',
  'reduceFunds',
];

/** Menus on cards/rows: the inline "open in new tab" icon sits beside them. */
const MENU_EXCLUDE: readonly BotActionId[] = ['openNewTab', ...FORM_ONLY];

export const BOT_ACTION_SURFACES: Record<BotActionSurfaceId, BotActionSurface> =
  {
    card: { exclude: MENU_EXCLUDE },
    tableRow: { exclude: MENU_EXCLUDE },
    hedgeCard: { exclude: MENU_EXCLUDE },
    hedgeRow: { exclude: MENU_EXCLUDE },
    // The drawer footer renders the lifecycle actions as buttons.
    drawerMenu: {
      exclude: [...MENU_EXCLUDE, 'start', 'stop', 'restart', 'edit'],
    },
    drawerFooter: {
      exclude: [
        'openNewTab',
        'star',
        'clone',
        'shareConfig',
        'duplicateToOtherMode',
        'archive',
        'unarchive',
        'delete',
        ...FORM_ONLY,
      ],
    },
    nameCell: {
      exclude: [
        'start',
        'stop',
        'restart',
        'edit',
        'clone',
        'shareConfig',
        'duplicateToOtherMode',
        'archive',
        'unarchive',
        'delete',
        ...FORM_ONLY,
      ],
    },
    // The form's own footer carries Start/Stop and Save, so its overflow
    // menu only adds the bot-level operations below.
    form: {
      exclude: [
        'openNewTab',
        'star',
        'start',
        'stop',
        'restart',
        'edit',
        'shareConfig',
        'duplicateToOtherMode',
        'delete',
      ],
      providesHandlers: [
        'importExport',
        'resetDefaults',
        'shareAccess',
        'addFunds',
        'reduceFunds',
      ],
      order: [
        'importExport',
        'resetDefaults',
        'shareAccess',
        'clone',
        'backtest',
        'archive',
        'unarchive',
        'addFunds',
        'reduceFunds',
      ],
    },
    hedgeForm: {
      exclude: [
        'openNewTab',
        'star',
        'start',
        'stop',
        'restart',
        'edit',
        'clone',
        'shareConfig',
        'duplicateToOtherMode',
        'archive',
        'unarchive',
        'delete',
        'shareAccess',
        'backtest',
        'addFunds',
        'reduceFunds',
      ],
      providesHandlers: ['importExport', 'resetDefaults'],
    },
  };

/** The items a surface renders for a bot, in render order. */
export const buildSurfaceItems = (
  surfaceId: BotActionSurfaceId,
  bot: BotRef,
  ctx: BotActionContext
): BotActionItem[] => {
  const surface = BOT_ACTION_SURFACES[surfaceId];
  const items = botActions
    .filter(
      (def) =>
        !surface.exclude.includes(def.id) && isBotActionVisible(def, bot, ctx)
    )
    .map((def) => resolveBotAction(def, bot, ctx));
  const order = surface.order;
  if (!order) return items;
  const rank = (id: BotActionId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
};

// ---------------------------------------------------------------------------
// Status dialog choice
// ---------------------------------------------------------------------------

export type BotStatusDialog =
  | 'confirm'
  | 'gridStart'
  | 'gridStop'
  | 'closeOptions'
  | 'none';

/**
 * Which dialog a start/stop opens.
 *  - `confirm` flow (cards, rows, drawer): one confirmation modal that also
 *    carries the close options (grid ones for grid bots).
 *  - `form` flow (the bot form footer): grid bots get the dedicated grid
 *    start dialog (balance check + buy type) / grid stop dialog; other bots
 *    get the close-options dialog only when stopping with open deals.
 */
export const chooseStatusDialog = (
  bot: Pick<BotRef, 'kind' | 'active' | 'activeDeals'>,
  flow: 'confirm' | 'form'
): BotStatusDialog => {
  if (flow === 'confirm') return 'confirm';
  if (bot.kind === 'grid') return bot.active ? 'gridStop' : 'gridStart';
  if (bot.active && bot.activeDeals > 0) return 'closeOptions';
  return 'none';
};

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export const BOT_BULK_ACTION_IDS: readonly BotActionId[] = botActions
  .filter((def) => def.bulk)
  .map((def) => def.id);

export const isBulkEligible = (def: BotActionDef, bot: BotRef): boolean =>
  def.kinds.includes(bot.kind) && (def.bulk?.eligible?.(bot) ?? true);

/** Whether a bulk action is offered for a selection. */
export const isBulkActionOffered = (
  def: BotActionDef,
  bots: readonly BotRef[]
): boolean => {
  if (!def.bulk || bots.length === 0) return false;
  return def.bulk.appliesTo === 'all'
    ? bots.every((bot) => isBulkEligible(def, bot))
    : bots.some((bot) => isBulkEligible(def, bot));
};

/** The selected bots a bulk action runs on (ineligible ones are skipped). */
export const bulkTargets = (
  id: BotActionId,
  bots: readonly BotRef[]
): BotRef[] => {
  const def = getBotActionDef(id);
  return bots.filter((bot) => isBulkEligible(def, bot));
};

const BULK_LABEL_BOT: BotRef = {
  kind: 'dca',
  id: '',
  name: '',
  status: '',
  paper: false,
  archived: false,
  active: false,
  activeDeals: 0,
  totalValue: 0,
  currency: '',
  lastActivity: '',
};

/** Same shape as the data table's `BulkAction`, plus a disabled tooltip. */
export interface BotBulkActionItem<T> {
  id: BotActionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  destructive: boolean;
  disabled: boolean;
  disabledReason?: string;
  shouldShow: (rows: T[]) => boolean;
  onAction: (rows: T[]) => void;
}

/**
 * Bulk toolbar actions from the registry's `bulk` metadata. `toRef` maps a
 * table row to its BotRef; `onAction` receives the action id and the
 * selected bots (the runner filters eligibility itself).
 */
export function buildBotBulkActions<T>(params: {
  toRef: (row: T) => BotRef;
  ctx: Pick<BotActionContext, 'readOnly' | 'viewOnly'>;
  onAction: (id: BotActionId, bots: BotRef[]) => void;
}): BotBulkActionItem<T>[] {
  const { toRef, ctx, onAction } = params;
  const bulkCtx: BotActionContext = { ...ctx, starred: false, pending: {} };
  const lockReason = readOnlyReason(bulkCtx);
  return botActions
    .filter((def) => def.bulk)
    .map((def) => ({
      id: def.id,
      // Bulk labels are static (no per-bot wording).
      label: def.label(BULK_LABEL_BOT, bulkCtx),
      icon: def.icon,
      destructive: !!def.destructive,
      disabled: def.mutating && !!lockReason,
      ...(def.mutating && lockReason ? { disabledReason: lockReason } : {}),
      shouldShow: (rows: T[]) => isBulkActionOffered(def, rows.map(toRef)),
      onAction: (rows: T[]) => onAction(def.id, rows.map(toRef)),
    }));
}
