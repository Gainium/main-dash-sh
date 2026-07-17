/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import type { WidgetMenuActions } from '../../components/widgets/WidgetWrapper';
import type {
  NotificationChannels,
  NotificationType,
} from '../../stores/notificationsSettingsStore';

// Slot adapter — the one extension point shared code uses to render
// host-supplied components. Host apps (e.g. cloud) register components
// at boot from `main.tsx`; unregistered slots render `null`.
//
// Two APIs:
//   • Typed: `Slot` + `registerSlot` — props validated via SlotPropsMap.
//     Preferred for new code.
//   • Loose: `ExtensionSlot` + `registerExtensionSlot` — kept for the
//     existing announcement/survey slot callers; same registry under
//     the hood so registrations are visible across both APIs.

type AnyComponent = React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const slots = new Map<string, AnyComponent>();

// ---------------------------------------------------------------------
// Typed API
// ---------------------------------------------------------------------

/** Standard widget render props. Most slots forward these from the
 *  caller (page or GridLayout) to the registered component. */
export interface WidgetSlotProps {
  widgetId: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  menuActions?: WidgetMenuActions;
}

/**
 * Compile-time prop map. Each entry pairs a slot name with the exact
 * props the registered component receives. Host builds that ship extra
 * slots extend this interface via declaration merging.
 */
export interface SlotPropsMap {
  // Page-level inline renders.
  'overview.onboarding': WidgetSlotProps & {
    visible?: boolean;
    isCollapsible?: boolean;
    variant?: 'widget' | 'panel';
    className?: string;
  };
  'portfolio.marketCapAnalysis': WidgetSlotProps;
  'portfolio.performanceAnalysis': WidgetSlotProps;

  /** Overview-page curated DCA presets strip (Top Strategies). Cloud
   *  fills with `CuratedPresetsStrip`; sh renders nothing. */
  'overview.curatedPresets': WidgetSlotProps & {
    isCollapsible?: boolean;
    allowResize?: boolean;
    /** Pixel value or CSS length applied to the widget wrapper so the
     *  card respects a fixed height in the page grid. */
    height?: string | number;
  };

  // GridLayout widget renders — keyed `widget.<widget-type>`.
  'widget.screener': WidgetSlotProps & {
    maxRows?: number;
    showPagination?: boolean;
  };
  'widget.treemap-market': WidgetSlotProps;
  'widget.treemap-portfolio': WidgetSlotProps;
  'widget.fear-greed-index': WidgetSlotProps;
  'widget.indicator-heatmap-market': WidgetSlotProps;
  'widget.indicator-heatmap-portfolio': WidgetSlotProps;
  'widget.portfolio-market-cap-analysis': WidgetSlotProps;
  'widget.portfolio-performance-analysis': WidgetSlotProps;
  'widget.onboarding-steps': WidgetSlotProps;
  'widget.curated-presets-strip': WidgetSlotProps;

  /**
   * Notification preferences — extra channel columns (Telegram, Email,
   * etc.). The component returns one or more `<th>` elements appended
   * after the "Type" header. Sh renders nothing; cloud's registered
   * component adds its channels.
   */
  'settings.notificationChannels.header': Record<string, unknown>;

  /**
   * Notification preferences — extra channel cells for one row. The
   * component returns one or more `<td>` elements with the same channel
   * order as the matching header slot. Receives the row's notification
   * type, current channel settings, and the setter so registered
   * channels can write back to the store.
   */
  'settings.notificationChannels.cell': {
    type: NotificationType;
    settings: NotificationChannels;
    setSetting: (
      type: NotificationType,
      channel: keyof NotificationChannels,
      enabled: boolean
    ) => void;
  };

  /** Cloud-sync icon button shown in the Navbar desktop row.
   *  Cloud's filler handles its own open-state + free-plan gating. */
  'navbar.syncButtonDesktop': {
    /** Hide on desktop sizes when true (mobile menu takes over). */
    moveToMenu: boolean;
  };

  /** Cloud-sync menu entry inside the Navbar mobile/overflow dropdown.
   *  Cloud's filler handles its own open-state + free-plan gating. */
  'navbar.syncMenuItem': Record<string, unknown>;

  /** App-level sync activity modal (cloud) / nothing (sh). Mounted once
   *  at the bottom of the Navbar tree. */
  'navbar.syncActivityModal': Record<string, unknown>;

  /** Account "danger zone" actions on the Settings page (reset / delete
   *  account). Cloud-managed accounts only — self-hosted users own the
   *  deployment, so sh leaves the slot empty. Mounted at the bottom of
   *  the Personal Data section in core's Settings page. */
  'settings.dangerZone': Record<string, unknown>;

  /** "Connected apps" section on the Settings page — OAuth grants the
   *  user has authorized. Cloud fills with `ConnectedAppsSection`; sh
   *  has no OAuth provider, so it leaves the slot empty. Mounted as the
   *  Connected Apps tab body in core's Settings page. */
  'settings.connectedApps': Record<string, unknown>;

  /** "Saved Data" section on the Settings page — local/remote saved-data
   *  manager (rulebooks, journal, layouts, cached candles, backtests…)
   *  with JSON export/import. Cloud fills with the `SavedDataPage`
   *  (mounted `isEmbedded`); the section is cloud-gated in core's
   *  Settings sidebar, so sh never surfaces it. */
  'settings.savedData': Record<string, unknown>;

  /** Banner shown app-wide when an account-delete request is pending.
   *  Cloud only; sh renders nothing. Mounted once in MainLayout above
   *  the page content. */
  'layout.pendingDeleteBanner': Record<string, unknown>;

  /** Scheduled-maintenance warning banner. Cloud only — a self-hosted
   *  operator is their own platform operator and has no one scheduling
   *  maintenance for them, so sh renders nothing. Mounted once in
   *  MainLayout above the page content. */
  'layout.maintenanceBanner': Record<string, unknown>;

  /** Detached Max chat panel. Cloud's filler renders a floating
   *  panel (desktop) / bottom sheet (mobile) that hosts the real
   *  ChatCore plus the first-run onboarding walkthrough overlays.
   *  Sh renders nothing. Mounted once in MainLayout right after the
   *  pending-delete banner so it sits above the page content. */
  'max.detachedPanel': Record<string, unknown>;

  /**
   * Start-trial prompt shown when a free, trial-eligible user picks a
   * premium exchange in the connect-exchange form. Core owns the open
   * state (and reverts the dropdown selection if the user dismisses
   * without starting); cloud's filler renders the marketing dialog and
   * runs the `updateUserSubscriptionPlan('trial')` mutation, then calls
   * `onTrialStarted` once the user's plan refreshes. Sh registers
   * nothing — premium exchanges stay hard-blocked there, so the slot
   * never opens.
   */
  'exchange.trialPrompt': {
    open: boolean;
    /** Display name of the premium exchange that triggered the prompt. */
    exchangeName: string;
    onOpenChange: (open: boolean) => void;
    onTrialStarted: () => void;
  };

  /** Headless trigger mounted on the bot creation form. Cloud's
   *  filler checks `sessionStorage.maxBotFormTourPending` on mount and,
   *  if true, opens the Max panel and runs the bot-form spotlight tour.
   *  Sh renders nothing. */
  'bot.formMounted': Record<string, unknown>;

  /** Headless trigger mounted on the bot listing page. Cloud's filler
   *  checks `sessionStorage.maxBotListTourPending` on mount and, if true,
   *  opens the Max panel and runs the bot-list spotlight tour.
   *  Sh renders nothing. */
  'bot.listMounted': Record<string, unknown>;

  /** "From Template" step of the NewBotWizard. Cloud's filler renders
   *  curated DCA presets (Top Strategies), stages `botConfig`, and
   *  navigates to /bot/new — then calls `onClose` so the wizard
   *  dismisses. Sh registers nothing and the step shows an empty
   *  state. `selectedType` is the bot type chosen in step 0, so the
   *  filler can scope the offered templates. */
  'newBot.templates': {
    selectedType: string | null;
    onClose: () => void;
  };

  /**
   * "More strategies" preview at the bottom of each bot form's Quick
   * Setup. Cloud's filler queries the curated-presets leaderboard for
   * the form's bot type and shows the top two cards with a "Show all"
   * button. Sh registers nothing and the section is hidden.
   *
   * `botType` is the form's current bot type ('dca' | 'combo' | 'grid');
   * the filler scopes its leaderboard query off it. `onShowAll` opens
   * the all-strategies panel — wired by BotForm to swap the form body
   * for `bots.all-strategies.body` and the header for
   * `bots.all-strategies.header`.
   */
  'bots.quick-setup.more-strategies': {
    botType: string;
    onShowAll: () => void;
  };

  /**
   * Header bar shown when the all-strategies panel is open inside a
   * bot form. Cloud's filler renders a Back button + the leaderboard
   * row count. Sh registers nothing; the all-strategies panel is
   * cloud-only and never opens in sh (no "More strategies" trigger).
   */
  'bots.all-strategies.header': {
    botType: string;
    onBack: () => void;
  };

  /**
   * Body of the all-strategies panel. Cloud's filler renders the
   * filterable curated-presets table; clicking a row stages
   * `botConfig` in sessionStorage and reloads the bot form. Sh
   * registers nothing.
   */
  'bots.all-strategies.body': {
    botType: string;
  };
}

export type SlotName = keyof SlotPropsMap;

/**
 * Register a component for a named slot. Must run before the first
 * render. Subsequent registrations replace the previous component.
 */
export function registerSlot<K extends SlotName>(
  name: K,
  Component: React.ComponentType<SlotPropsMap[K]>
): void {
  slots.set(name, Component as AnyComponent);
}

/**
 * Render whatever is registered for the slot. When the slot is empty
 * (e.g. sh build without that registration), returns `null` and the
 * surrounding layout collapses around it.
 */
export function Slot<K extends SlotName>(
  props: { name: K } & SlotPropsMap[K]
): React.ReactElement | null {
  const { name, ...rest } = props;
  const Component = slots.get(name);
  if (!Component) return null;
  // `rest` matches `SlotPropsMap[K]` at the call site (TS validates the
  // generic against the concrete K), but the generic `Omit<...>` here
  // can't prove it — bounce through `unknown` to satisfy the cast.
  // eslint-disable-next-line react-hooks/static-components
  return <Component {...(rest as unknown as SlotPropsMap[K])} />;
}

// ---------------------------------------------------------------------
// Loose API (back-compat for announcement / survey slots)
// ---------------------------------------------------------------------

type SlotComponent = React.ComponentType<Record<string, unknown>>;
const Noop: SlotComponent = () => null;

export function registerExtensionSlot(
  name: string,
  Component: SlotComponent
): void {
  slots.set(name, Component);
}

interface ExtensionSlotProps {
  /** Slot identifier. Convention: `<page>.<purpose>`. */
  name: string;
  [prop: string]: unknown;
}

export const ExtensionSlot: React.FC<ExtensionSlotProps> = ({
  name,
  ...props
}) => {
  const Component = slots.get(name) ?? Noop;
  // eslint-disable-next-line react-hooks/static-components
  return <Component {...props} />;
};

export type { SlotComponent };
