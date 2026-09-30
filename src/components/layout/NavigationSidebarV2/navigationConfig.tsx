import {
  BarChart2,
  BookOpen,
  Braces,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  TestTube2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { IS_CLOUD } from '@/config/mode';
import { BotTypesEnum } from '@/types';
import { getBotTypeIcon } from '@/utils/botUtils';
import type { NavigationGroup } from './types';

// Bot-type icons sourced from the single source of truth so the sidebar
// stays in sync with chips, bottom nav, EntityChip, etc.
const DcaIcon = getBotTypeIcon(BotTypesEnum.dca);
const GridIcon = getBotTypeIcon(BotTypesEnum.grid);
const ComboIcon = getBotTypeIcon(BotTypesEnum.combo);
const HedgeDcaIcon = getBotTypeIcon(BotTypesEnum.hedgeDca);
const HedgeComboIcon = getBotTypeIcon(BotTypesEnum.hedgeCombo);
const TerminalIcon = getBotTypeIcon(BotTypesEnum.terminal);

// Items keyed off cloud-only routes (Reports, Trade Journal, Rulebooks,
// Manual Backtesting). The matching pages are not shipped in sh, so
// these IDs are filtered out of `NAVIGATION_GROUPS` below.
const CLOUD_ONLY_NAV_IDS = new Set<string>([
  'backtesting',
  'rulebooks',
  'journal',
  'reports',
]);

const ALL_NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'home',
    label: 'Overview',
    icon: <Home />,
    href: '/',
  },
  {
    id: 'trading',
    label: 'Trading',
    icon: <TrendingUp />, // trading overview
    href: '/trading',
    hasSecondaryPanel: true,
    panelType: 'trading',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: <TerminalIcon />, // trading terminal — custom bot-type icon
    href: '/terminal',
  },
  {
    id: 'dcaBots',
    label: 'Trading Bots',
    icon: <DcaIcon />,
    href: '/bot',
    hasSecondaryPanel: true,
    panelType: 'dcaBots',
  },
  {
    id: 'comboBots',
    label: 'Combo Bots',
    icon: <ComboIcon />,
    href: '/combo',
    hasSecondaryPanel: true,
    panelType: 'comboBots',
  },
  {
    id: 'gridBots',
    label: 'Grid Bots',
    icon: <GridIcon />,
    href: '/grid',
    hasSecondaryPanel: true,
    panelType: 'gridBots',
  },
  {
    id: 'hedgeDcaBots',
    label: 'Hedge DCA Bots',
    icon: <HedgeDcaIcon />,
    href: '/hedge/bot',
  },
  {
    id: 'hedgeComboBots',
    label: 'Hedge Combo Bots',
    icon: <HedgeComboIcon />,
    href: '/hedge/combo',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: <Wallet />, // portfolio
    href: '/portfolio',
    hasSecondaryPanel: true,
    panelType: 'portfolio',
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    icon: <LayoutDashboard />, // dashboards
    href: '/dashboard',
    hasSecondaryPanel: true,
    panelType: 'dashboards',
  },
  // Items that live in More by default
  {
    id: 'backtesting',
    label: 'Manual Backtesting',
    icon: <TestTube2 />,
    href: '/manual-backtesting/sessions',
  },
  {
    id: 'rulebooks',
    label: 'Rulebooks',
    icon: <BookOpen />,
    href: '/rulebooks',
  },
  {
    id: 'journal',
    label: 'Journal',
    icon: <FileText />,
    href: '/journal',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <BarChart2 />,
    href: '/reports',
    hasSecondaryPanel: true,
    panelType: 'reports',
  },
  {
    id: 'globalVariables',
    label: 'Global Variables',
    icon: <Braces />,
    href: '/global-variables',
  },
  {
    id: 'help',
    label: 'Help',
    icon: <HelpCircle />, // help
    hasSecondaryPanel: true,
    panelType: 'help',
    href: '/help',
  },
  {
    id: 'more',
    label: 'More',
    icon: <MoreHorizontal />, // triggers More panel
    hasSecondaryPanel: true,
    panelType: 'more',
  },
  {
    id: 'logout',
    label: 'Logout',
    icon: <LogOut />,
    href: '/logout', // Will be handled specially in the component
  },
];

export const NAVIGATION_GROUPS: NavigationGroup[] = IS_CLOUD
  ? ALL_NAVIGATION_GROUPS
  : ALL_NAVIGATION_GROUPS.filter((item) => !CLOUD_ONLY_NAV_IDS.has(item.id));

/**
 * Let an edition overlay add its own groups (e.g. cloud-only pages) at boot.
 * Inserted before the group with id `before`, or ahead of the More/Logout
 * entries when it is absent. Consumers read `NAVIGATION_GROUPS` at render
 * time, so registering from `main.tsx` is early enough.
 */
export const registerNavigationGroup = (
  group: NavigationGroup,
  options: { before: string }
) => {
  const index = NAVIGATION_GROUPS.findIndex((g) => g.id === options.before);
  const fallback = NAVIGATION_GROUPS.findIndex((g) => g.id === 'more');
  NAVIGATION_GROUPS.splice(
    index >= 0 ? index : fallback >= 0 ? fallback : NAVIGATION_GROUPS.length,
    0,
    group
  );
};

// By default, these items are visible in the left panel (all others go to More)
export const DEFAULT_VISIBLE_NAV_IDS = [
  'home',
  'trading',
  'terminal',
  'portfolio',
  'dashboards',
  'more',
];

export default NAVIGATION_GROUPS;
