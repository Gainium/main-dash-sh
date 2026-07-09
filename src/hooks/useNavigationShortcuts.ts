import { SHORTCUT_DEFAULTS, SHORTCUT_IDS } from '@/config/shortcuts';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcutManager';
import { usePaperContext } from '@/hooks/usePaperContext';
import { useSplitPanelShortcuts } from '@/hooks/useSplitPanelShortcuts';
import {
  getDashboardPathByName,
  getDashboardShortcutId,
} from '@/lib/dashboardShortcuts';
import { useGlobalSearchStore } from '@/stores/globalSearchStore';
import { useMultiDashboardStore } from '@/stores/multiDashboardStore';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { useShortcutStore, type ShortcutConfig } from '@/stores/shortcutStore';
import { useSplitPanelShortcutStore } from '@/stores/splitPanelShortcutStore';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Hook that initializes and manages all navigation shortcuts
 */
export function useNavigationShortcuts() {
  const navigate = useNavigate();
  const { toggleTradingMode } = usePaperContext();
  const { toggleNotificationsPanel } = useNotificationsStore();
  const { toggleSearch } = useGlobalSearchStore();

  // Use getState to avoid re-render loops when registering
  const bulkRegisterShortcuts =
    useShortcutStore.getState().bulkRegisterShortcuts;
  const registerShortcut = useShortcutStore.getState().registerShortcut;

  // Keep latest function refs without re-triggering effects
  const navRef = useRef(navigate);
  const toggleTradingModeRef = useRef(toggleTradingMode);
  const toggleNotificationsPanelRef = useRef(toggleNotificationsPanel);
  const toggleSearchRef = useRef(toggleSearch);

  useEffect(() => {
    navRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    toggleTradingModeRef.current = toggleTradingMode;
  }, [toggleTradingMode]);

  useEffect(() => {
    toggleNotificationsPanelRef.current = toggleNotificationsPanel;
  }, [toggleNotificationsPanel]);

  useEffect(() => {
    toggleSearchRef.current = toggleSearch;
  }, [toggleSearch]);

  const initializedRef = useRef(false);

  // Initialize split panel shortcuts
  useSplitPanelShortcuts();

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    // Define all shortcuts via central defaults (both navigation and managers)
    const allShortcuts: Omit<ShortcutConfig, 'action'>[] = SHORTCUT_DEFAULTS;

    // Define actions for each shortcut
    const actions: Record<string, () => void> = {
      // Manager actions
      // Note: Widgets/Layout managers were consolidated into Dashboard Manager.
      [SHORTCUT_IDS.ManagerDashboard]: () => {
        window.dispatchEvent(
          new CustomEvent('openDashboardManager', {
            detail: { action: 'toggle' },
          })
        );
      },
      [SHORTCUT_IDS.ActionNotifications]: () =>
        toggleNotificationsPanelRef.current(),
      [SHORTCUT_IDS.ActionChat]: () => {
        window.dispatchEvent(
          new CustomEvent('toggleAiChat', {
            detail: { action: 'toggle' },
          })
        );
      },
      [SHORTCUT_IDS.ManagerShortcuts]: () => {
        window.dispatchEvent(
          new CustomEvent('toggleShortcutManager', {
            detail: { action: 'toggle' },
          })
        );
      },
      [SHORTCUT_IDS.ManagerGlobalSearch]: () => toggleSearchRef.current(),
      // Panel control actions (handled by the split panel shortcut system)
      // These are registered to show in the shortcut manager UI
      [SHORTCUT_IDS.PanelExpandLeft]: () =>
        useSplitPanelShortcutStore.getState().handleHorizontalArrow('left'),
      [SHORTCUT_IDS.PanelExpandRight]: () =>
        useSplitPanelShortcutStore.getState().handleHorizontalArrow('right'),
      [SHORTCUT_IDS.PanelExpandUp]: () =>
        useSplitPanelShortcutStore.getState().handleVerticalArrow('up'),
      [SHORTCUT_IDS.PanelExpandDown]: () =>
        useSplitPanelShortcutStore.getState().handleVerticalArrow('down'),
      // Navigation actions
      [SHORTCUT_IDS.NavTradingTerminal]: () => navRef.current('/terminal'),
      [SHORTCUT_IDS.NavDashboard]: () => navRef.current('/dashboard'),
      [SHORTCUT_IDS.NavOverview]: () => navRef.current('/overview'),
      [SHORTCUT_IDS.NavHedgeDcaBots]: () => navRef.current('/hedge/bot'),
      [SHORTCUT_IDS.NavHedgeComboBots]: () => navRef.current('/hedge/combo'),
      [SHORTCUT_IDS.NavTradingBots]: () => navRef.current('/bot'),
      [SHORTCUT_IDS.NavComboBots]: () => navRef.current('/combo'),
      [SHORTCUT_IDS.NavGridBots]: () => navRef.current('/grid'),
      [SHORTCUT_IDS.NavRulebooks]: () => navRef.current('/rulebooks'),
      [SHORTCUT_IDS.NavManualBacktesting]: () =>
        navRef.current('/manual-backtesting/sessions'),
      [SHORTCUT_IDS.NavSettings]: () => navRef.current('/settings'),
      [SHORTCUT_IDS.NavPortfolio]: () => navRef.current('/portfolio'),
      [SHORTCUT_IDS.NavTrades]: () => navRef.current('/trading'),
      [SHORTCUT_IDS.NavJournal]: () => navRef.current('/journal'),
      [SHORTCUT_IDS.NavReports]: () => navRef.current('/reports'),
      [SHORTCUT_IDS.NavExchanges]: () => navRef.current('/exchanges'),
      [SHORTCUT_IDS.NewDcaBot]: () => navRef.current('/bot/new'),
      [SHORTCUT_IDS.NewComboBot]: () => navRef.current('/combo/new'),
      [SHORTCUT_IDS.NewGridBot]: () => navRef.current('/grid/new'),
      [SHORTCUT_IDS.NewHedgeDcaBot]: () => navRef.current('/hedge/bot/new'),
      [SHORTCUT_IDS.NewHedgeComboBot]: () =>
        navRef.current('/hedge/combo/new'),
      [SHORTCUT_IDS.ActionToggleTradingMode]: () =>
        toggleTradingModeRef.current(),
    };

    // Register all defaults in one go, idempotently
    bulkRegisterShortcuts(allShortcuts, actions);

    // Re-register any persisted custom navigation shortcuts (they persist as metadata: path)
    // so we can restore actions after a reload (actions are not persisted)
    const persistedShortcuts = useShortcutStore.getState().shortcuts;
    Object.values(persistedShortcuts).forEach((sc) => {
      if (sc.path && sc.action == null) {
        // Register a fresh action that navigates to the path
        registerShortcut({
          ...sc,
          action: () => navRef.current(sc.path as string),
        } as ShortcutConfig);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamically register per-dashboard navigation shortcuts
  const dashboards = useMultiDashboardStore((s) => s.dashboards);
  useEffect(() => {
    if (!dashboards || dashboards.length === 0) return;
    const { shortcuts } = useShortcutStore.getState();
    dashboards.forEach((d) => {
      const id = getDashboardShortcutId(d.id);
      const label = d.name;
      const description = `Go to ${d.name}`;
      // Use a harmless defaultKey, user can set via recorder; disabled by default
      const defaultKey = {
        key: 'g',
        modifiers: { cmd: false, ctrl: false, alt: false, shift: false },
      };
      if (shortcuts[id]) {
        // Update label/description/action without touching enabled/currentKey
        registerShortcut({
          ...shortcuts[id],
          id,
          label,
          description,
          defaultKey: shortcuts[id].defaultKey || defaultKey,
          action: () => navRef.current(getDashboardPathByName(d.name)),
          path: getDashboardPathByName(d.name),
        } as ShortcutConfig);
        return;
      }
      registerShortcut({
        id,
        label,
        description,
        defaultKey,
        currentKey: defaultKey,
        enabled: false,
        category: 'dashboards',
        action: () => navRef.current(getDashboardPathByName(d.name)),
        path: getDashboardPathByName(d.name),
        deleted: false,
      });
    });
  }, [dashboards, registerShortcut]);

  // Derive from store via selector to avoid missing initial bulkRegister update on reload
  const shortcutsObj = useShortcutStore((s) => s.shortcuts);
  const keyboardShortcuts = useMemo(() => {
    const all = Object.values(shortcutsObj);
    return all
      .filter(
        (s) =>
          s.enabled &&
          !s.deleted &&
          (s.category !== 'managers' ||
            s.id === SHORTCUT_IDS.ManagerShortcuts ||
            s.id === SHORTCUT_IDS.ManagerGlobalSearch)
      )
      .flatMap((s) => {
        // Persisted state (localStorage) can carry a shortcut from an older
        // build or a partial write that is missing `currentKey`; fall back to
        // `defaultKey`, and skip entirely if neither has a usable key. Without
        // this guard a single malformed record throws
        // "Cannot read properties of undefined (reading 'key')" here and, since
        // this hook runs in <App>, white-screens the whole dashboard.
        const activeKey = s.currentKey ?? s.defaultKey;
        if (!activeKey?.key) return [];
        const modifiers = activeKey.modifiers ?? {};
        return [
          {
            key: activeKey.key.toLowerCase(),
            modifiers: {
              cmd: modifiers.cmd || false,
              ctrl: modifiers.ctrl || false,
              shift: modifiers.shift || false,
              alt: modifiers.alt || false,
            },
            callback: s.action,
            priority: 80,
            enabled: true,
            // Allow these shortcuts to fire even while inputs are focused:
            // - GlobalSearch: re-pressing should close it.
            // - ActionChat: users typing into the Max chat input still need
            //   the toggle shortcut to work so they can close/reopen the
            //   panel without having to click out of the input first.
            allowInInputs:
              s.id === SHORTCUT_IDS.ManagerGlobalSearch ||
              s.id === SHORTCUT_IDS.ActionChat,
          },
        ];
      });
  }, [shortcutsObj]);

  // Register with keyboard shortcut manager
  useKeyboardShortcuts(keyboardShortcuts, 'navigation-shortcuts');
}
