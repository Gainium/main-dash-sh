// The single list of per-deal actions, and every rule that decides who sees
// them. Row menus, card menus, icon strips and the tables' bulk actions are all
// built from this list, so an action added here shows up everywhere unless a
// surface opts out of it explicitly (see DEAL_ACTION_SURFACES).
//
// Gating rule: an action that does not apply to a deal's kind is hidden; one
// that applies but is blocked by the deal's state is shown disabled, with the
// reason.
import { isComboFundsTarget } from '@/components/deals/actions/bulkAdjustFundsTargets';
import type { BulkAction } from '@/components/ui/data-table/data-table';
import { executeNextDcaBlockedReason } from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';
import {
  ArrowRightLeft,
  BookOpen,
  Edit,
  Eye,
  Handshake,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  DEAL_KINDS,
  dealKindLabel,
  isDealCanceled,
  isDealLive,
  isDealOpen,
  isDealRestartable,
  type DealKind,
  type DealRef,
} from './dealRef';

export type DealActionId =
  | 'merge'
  | 'view'
  | 'journal'
  | 'addFunds'
  | 'reduceFunds'
  | 'edit'
  | 'executeNextDca'
  | 'restart'
  | 'changeDcaLevels'
  | 'moveToTerminal'
  | 'moveToBot'
  | 'restore'
  | 'cancel'
  | 'close';

/** Menus draw a separator between groups. */
export type DealActionGroup = 'inspect' | 'funds' | 'manage' | 'move' | 'end';

export interface DealActionBulk {
  /**
   * `any`: offered when at least one selected deal can take the action, and run
   * on those. `all`: offered only when every selected deal can.
   */
  appliesTo: 'any' | 'all';
  minSelected?: number;
  /** Label in the bulk menu, where it reads for several deals. */
  label?: string;
  /** A rule over the whole selection, on top of the per-deal ones. */
  selection?: (deals: DealRef[]) => boolean;
}

export interface DealActionDef {
  id: DealActionId;
  label: string;
  icon: LucideIcon;
  group: DealActionGroup;
  destructive?: boolean;
  /** False for an action that is offered on a selection only. */
  menu: boolean;
  /** Whether the action applies to this kind of deal at all. */
  visible: (deal: DealRef) => boolean;
  /** Why the deal's state blocks the action, or null when it does not. */
  disabledReason: (deal: DealRef) => string | null;
  bulk?: DealActionBulk;
}

export const NOT_OPEN_REASON = 'Available on open deals only';
export const ENDED_REASON = 'This deal has already ended';
export const NOT_RESTARTABLE_REASON = 'Available on open or errored deals only';
export const NOT_CANCELED_REASON = 'Only canceled deals can be restored';
export const RISK_BASED_REASON =
  'A risk-based deal manages its own DCA levels';
export const NO_BOT_REASON = 'This deal has no bot';

type Check = (deal: DealRef) => string | null;

const firstReason =
  (...checks: Check[]): Check =>
  (deal) => {
    for (const check of checks) {
      const reason = check(deal);
      if (reason) return reason;
    }
    return null;
  };

const kinds =
  (...allowed: DealKind[]) =>
  (deal: DealRef): boolean =>
    allowed.includes(deal.kind);

const anyKind = kinds(...DEAL_KINDS);
const never: Check = () => null;
const needsBot: Check = (deal) => (deal.botId ? null : NO_BOT_REASON);
const needsOpen: Check = (deal) => (isDealOpen(deal) ? null : NOT_OPEN_REASON);
const needsLive: Check = (deal) => (isDealLive(deal) ? null : ENDED_REASON);
/** Not a combo deal: the funds mutations resolve the bot among DCA bots only. */
const takesFunds = (deal: DealRef): boolean =>
  !isComboFundsTarget(dealKindLabel(deal.kind));

/** Merge needs one pair on one exchange; deals of different bots merge too. */
const onePairOneExchange = (deals: DealRef[]): boolean =>
  deals.every(
    (deal) =>
      deal.symbol === deals[0]?.symbol && deal.exchange === deals[0]?.exchange
  );

/**
 * Ordered as the menus show them. Engine rules each gate mirrors:
 * - funds, execute next DCA: the engine resolves the bot among DCA bots only
 *   (regular, terminal and hedge-DCA legs, never combo) and acts on `open`
 *   deals only;
 * - restart: `open` or `error`, DCA and combo deals including hedge legs;
 * - move to terminal: DCA or combo bot deals only (no grid, no hedge);
 * - restore: canceled DCA, hedge-DCA or terminal deals (the engine restores
 *   by the deal's own bot id; combo deals are not restorable);
 * - cancel: anything the engine still runs (`start`, `open`, `error`);
 *   close by market or limit: `open` only;
 * - merge: DCA deals only, never combo — the engine refuses those.
 */
export const DEAL_ACTIONS: readonly DealActionDef[] = [
  {
    id: 'merge',
    label: 'Merge Deals',
    icon: Handshake,
    group: 'manage',
    menu: false,
    visible: kinds('dca', 'hedgeDca', 'terminal', 'grid'),
    disabledReason: never,
    bulk: { appliesTo: 'all', minSelected: 2, selection: onePairOneExchange },
  },
  {
    id: 'view',
    label: 'View Details',
    icon: Eye,
    group: 'inspect',
    menu: true,
    visible: anyKind,
    disabledReason: never,
  },
  {
    id: 'journal',
    label: 'Add to Journal',
    icon: BookOpen,
    group: 'inspect',
    menu: true,
    visible: anyKind,
    disabledReason: never,
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'addFunds',
    label: 'Add Funds',
    icon: PlusCircle,
    group: 'funds',
    menu: true,
    visible: takesFunds,
    disabledReason: firstReason(needsBot, needsOpen),
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'reduceFunds',
    label: 'Reduce Funds',
    icon: MinusCircle,
    group: 'funds',
    menu: true,
    visible: takesFunds,
    disabledReason: firstReason(needsBot, needsOpen),
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'edit',
    label: 'Edit',
    icon: Edit,
    group: 'manage',
    menu: true,
    visible: anyKind,
    disabledReason: needsOpen,
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'executeNextDca',
    label: 'Execute next DCA',
    icon: Zap,
    group: 'manage',
    menu: true,
    visible: kinds('dca', 'hedgeDca'),
    disabledReason: firstReason(needsBot, executeNextDcaBlockedReason),
  },
  {
    id: 'restart',
    label: 'Restart deal',
    icon: RefreshCw,
    group: 'manage',
    menu: true,
    visible: kinds('dca', 'combo', 'hedgeDca', 'hedgeCombo'),
    disabledReason: firstReason(needsBot, (deal) =>
      isDealRestartable(deal) ? null : NOT_RESTARTABLE_REASON
    ),
    bulk: { appliesTo: 'any', label: 'Restart' },
  },
  {
    id: 'changeDcaLevels',
    label: 'Change DCA levels',
    icon: SlidersHorizontal,
    group: 'manage',
    menu: true,
    visible: kinds('dca', 'combo', 'hedgeDca', 'hedgeCombo'),
    disabledReason: firstReason(needsBot, needsOpen, (deal) =>
      deal.riskBased ? RISK_BASED_REASON : null
    ),
  },
  {
    id: 'moveToTerminal',
    label: 'Move to Terminal',
    icon: ArrowRightLeft,
    group: 'move',
    menu: true,
    // Never a hedge leg's deal: moving one leg's deal out would detach it
    // from its pair, leaving the hedge one-sided.
    visible: kinds('dca', 'combo'),
    disabledReason: firstReason(needsBot, needsOpen),
    bulk: { appliesTo: 'all' },
  },
  {
    id: 'moveToBot',
    label: 'Move to Bot',
    icon: ArrowRightLeft,
    group: 'move',
    menu: true,
    visible: kinds('terminal'),
    disabledReason: firstReason(needsBot, needsOpen),
  },
  {
    id: 'restore',
    label: 'Restore',
    icon: RotateCcw,
    group: 'move',
    menu: true,
    visible: kinds('dca', 'hedgeDca', 'terminal'),
    disabledReason: firstReason(needsBot, (deal) =>
      isDealCanceled(deal) ? null : NOT_CANCELED_REASON
    ),
    bulk: { appliesTo: 'any' },
  },
  {
    id: 'cancel',
    label: 'Cancel deal',
    icon: X,
    group: 'end',
    menu: true,
    visible: anyKind,
    disabledReason: firstReason(needsBot, needsLive),
    bulk: { appliesTo: 'any', label: 'Cancel' },
  },
  {
    id: 'close',
    label: 'Close deal',
    icon: XCircle,
    group: 'end',
    destructive: true,
    menu: true,
    visible: anyKind,
    disabledReason: firstReason(needsBot, needsOpen),
    bulk: { appliesTo: 'any', label: 'Close' },
  },
];

const ACTIONS_BY_ID = new Map(DEAL_ACTIONS.map((action) => [action.id, action]));

export function getDealAction(id: DealActionId): DealActionDef {
  const action = ACTIONS_BY_ID.get(id);
  if (!action) {
    throw new Error(`Unknown deal action: ${id}`);
  }
  return action;
}

// ---------------------------------------------------------------------------
// Surfaces. Each place that renders a deal's actions is declared here with the
// actions it leaves out; it cannot pick actions any other way.
// ---------------------------------------------------------------------------

export interface DealActionSurface {
  /** Menu actions this surface does not offer, and why lives beside it. */
  exclude: readonly DealActionId[];
}

export const DEAL_ACTION_SURFACES = {
  /** Trades/deals table rows: a row click already opens the deal's details. */
  tradesTable: { exclude: ['view'] },
  /** Deal cards (every card view, the dashboard's top deals included). */
  tradeCard: { exclude: [] },
  /** Bot drawer deals table rows. */
  drawerTable: { exclude: [] },
  /**
   * Bot-page deal history: a compact icon strip on lightweight rows that are
   * not trade rows, so nothing that needs the full trade (details, journal,
   * the edit drawer, the DCA level dialogs) and no moves.
   */
  dealHistory: {
    exclude: [
      'view',
      'journal',
      'edit',
      'executeNextDca',
      'changeDcaLevels',
      'moveToTerminal',
      'moveToBot',
    ],
  },
} as const satisfies Record<string, DealActionSurface>;

export type DealActionSurfaceId = keyof typeof DEAL_ACTION_SURFACES;

export interface DealActionItem {
  id: DealActionId;
  label: string;
  icon: LucideIcon;
  group: DealActionGroup;
  destructive: boolean;
  disabledReason: string | null;
}

/** The menu items one surface shows for one deal, in registry order. */
export function getDealActionItems(
  deal: DealRef,
  surfaceId: DealActionSurfaceId
): DealActionItem[] {
  const exclude: readonly DealActionId[] =
    DEAL_ACTION_SURFACES[surfaceId].exclude;
  return DEAL_ACTIONS.filter(
    (action) =>
      action.menu && !exclude.includes(action.id) && action.visible(deal)
  ).map((action) => ({
    id: action.id,
    label: action.label,
    icon: action.icon,
    group: action.group,
    destructive: !!action.destructive,
    disabledReason: action.disabledReason(deal),
  }));
}

/**
 * The deals of a selection a bulk action runs on, or null when the action is
 * not offered for that selection.
 */
export function dealsForBulkAction(
  action: DealActionDef,
  deals: DealRef[]
): DealRef[] | null {
  const bulk = action.bulk;
  if (!bulk || deals.length < (bulk.minSelected ?? 1)) {
    return null;
  }
  const usable = deals.filter(
    (deal) => action.visible(deal) && action.disabledReason(deal) === null
  );
  if (usable.length === 0) {
    return null;
  }
  if (bulk.appliesTo === 'all' && usable.length !== deals.length) {
    return null;
  }
  if (bulk.selection && !bulk.selection(usable)) {
    return null;
  }
  return usable;
}

/**
 * The deal tables' bulk actions, derived from the registry's `bulk` metadata.
 * `run` receives only the selected deals the action can take, and how many
 * selected deals were left out.
 */
export function buildDealBulkActions<T>(options: {
  toDeal: (row: T) => DealRef;
  run: (
    id: DealActionId,
    deals: DealRef[],
    options: { skipped: number }
  ) => void;
}): BulkAction<T>[] {
  const { toDeal, run } = options;
  return DEAL_ACTIONS.filter((action) => action.bulk).map((action) => ({
    id: action.id,
    label: action.bulk?.label ?? action.label,
    icon: action.icon,
    ...(action.destructive ? { destructive: true } : {}),
    shouldShow: (rows: T[]) =>
      dealsForBulkAction(action, rows.map(toDeal)) !== null,
    onAction: (rows: T[]) => {
      const deals = dealsForBulkAction(action, rows.map(toDeal));
      if (deals) {
        run(action.id, deals, { skipped: rows.length - deals.length });
      }
    },
  }));
}
