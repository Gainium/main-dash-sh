import { IS_CLOUD } from '@/config/mode';
import { createDashboardSlug } from '@/stores/multiDashboardStore';
import { BotTypesEnum } from '@/types';
import { getBotTypeIcon } from '@/utils/botUtils';
import {
  BookOpen,
  Building2,
  Bot,
  Braces,
  Home,
  LayoutDashboard,
  Layers,
  ListChecks,
  PieChart,
  Plus,
  Radar,
  ShieldCheck,
  TestTube,
} from 'lucide-react';
import React from 'react';

export interface NavigationItem {
  /** Stable identifier used by edit-mode and persisted user prefs. */
  id?: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
  children?: NavigationItem[];
  isActive?: boolean;
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'pro';
  };
  action?:
    | {
        icon: React.ReactNode;
        href?: string;
        onClick?: () => void;
        title?: string;
      }
    | undefined;
  shortcut?: string;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

/**
 * Routes that only ship in cloud builds. Sh strips items whose `href`
 * matches any of these prefixes before returning the nav sections.
 */
const CLOUD_ONLY_HREF_PREFIXES = [
  '/manual-backtesting',
  '/market-screener',
  '/rulebooks',
  '/journal',
  '/reports',
  '/subscription',
  '/affiliate',
  '/rewards',
  '/community',
  '/help',
];

const isCloudOnlyHref = (href?: string): boolean => {
  if (!href) return false;
  return CLOUD_ONLY_HREF_PREFIXES.some((prefix) => href.startsWith(prefix));
};

const filterCloudOnlyItems = (
  sections: NavigationSection[]
): NavigationSection[] => {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isCloudOnlyHref(item.href)),
    }))
    .filter((section) => section.items.length > 0);
};

export const getNavigationSections = (
  dashboards?: { id: string; name: string }[],
  currentDashboardId?: string,
  onCreateDashboard?: () => void,
  _onSwitchDashboard?: (id: string) => void,
  readOnly: boolean = false,
  _reports?: { id: string; name: string }[],
  _currentReportId?: string,
  _onCreateReport?: () => void
): NavigationSection[] => {
  // Get bot type icon components
  const DCAIcon = getBotTypeIcon(BotTypesEnum.dca);
  const GridIcon = getBotTypeIcon(BotTypesEnum.grid);
  const ComboIcon = getBotTypeIcon(BotTypesEnum.combo);
  const HedgeDCAIcon = getBotTypeIcon(BotTypesEnum.hedgeDca);
  const HedgeComboIcon = getBotTypeIcon(BotTypesEnum.hedgeCombo);
  const TerminalIcon = getBotTypeIcon(BotTypesEnum.terminal);

  const sections: NavigationSection[] = [
    {
      title: '',
      items: [
        {
          id: 'overview',
          icon: <Home className="w-4 h-4" />,
          label: 'Overview',
          href: '/overview',
          shortcut: 'O',
        },
        {
          id: 'dashboards',
          icon: <LayoutDashboard className="w-4 h-4" />,
          label: 'Dashboards',
          href: '/dashboard',
          ...(dashboards && dashboards.length > 0
            ? {
                children: [
                  ...dashboards.map((dashboard) => ({
                    icon: (
                      <svg viewBox="0 0 8 8" className="w-2 h-2 fill-current">
                        <circle cx="4" cy="4" r="3" />
                      </svg>
                    ),
                    label: dashboard.name,
                    href: `/dashboard/${createDashboardSlug(dashboard.name)}`,
                  })),
                ],
              }
            : {}),
          // Only show create dashboard action in normal mode
          ...(!readOnly && onCreateDashboard
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  onClick: onCreateDashboard,
                  title: 'Create New Dashboard',
                },
              }
            : {}),
        },
        {
          id: 'portfolio',
          icon: <PieChart className="w-4 h-4" />,
          label: 'Portfolio',
          href: '/portfolio',
          children: [
            {
              id: 'exchanges',
              icon: <Building2 className="w-4 h-4" />,
              label: 'Exchanges',
              href: '/exchanges',
            },
          ],
        },
      ],
    },
    {
      title: 'Trading',
      items: [
        {
          id: 'trading',
          icon: <Bot className="w-4 h-4" />,
          label: 'All Trades',
          href: '/trading',
        },
        {
          id: 'terminal',
          icon: <TerminalIcon className="w-4 h-4" />,
          label: 'Terminal',
          href: '/terminal',
          children: [
            {
              id: 'terminal-positions',
              icon: <Layers className="w-4 h-4" />,
              label: 'Positions',
              // Deep link into the terminal's own Exchange Orders panel rather
              // than a second page rendering the same table (V1 had a separate
              // /terminal/positions route; the panel is the same component).
              href: '/terminal?view=positions',
            },
          ],
        },
        {
          id: 'trading-bots',
          icon: <DCAIcon className="w-4 h-4" />,
          label: 'Trading Bots',
          href: '/bot',
          ...(!readOnly
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  href: '/bot/new',
                  title: 'Create New Trading Bot',
                },
              }
            : {}),
        },
        {
          id: 'grid-bots',
          icon: <GridIcon className="w-4 h-4" />,
          label: 'Grid Bots',
          href: '/grid',
          ...(!readOnly
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  href: '/grid/new',
                  title: 'Create New Grid Bot',
                },
              }
            : {}),
        },
        {
          id: 'combo-bots',
          icon: <ComboIcon className="w-4 h-4" />,
          label: 'Combo Bots',
          href: '/combo',
          ...(!readOnly
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  href: '/combo/new',
                  title: 'Create New Combo Bot',
                },
              }
            : {}),
        },
        {
          id: 'hedge-dca-bots',
          icon: <HedgeDCAIcon className="w-3 h-3" />,
          label: 'Hedge DCA Bots',
          href: '/hedge/bot',
          ...(!readOnly
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  href: '/hedge/bot/new',
                  title: 'Create New Hedge DCA Bot',
                },
              }
            : {}),
        },
        {
          id: 'hedge-combo-bots',
          icon: <HedgeComboIcon className="w-3 h-3" />,
          label: 'Hedge Combo Bots',
          href: '/hedge/combo',
          ...(!readOnly
            ? {
                action: {
                  icon: <Plus className="w-3 h-3" />,
                  href: '/hedge/combo/new',
                  title: 'Create New Hedge Combo Bot',
                },
              }
            : {}),
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        {
          id: 'manual-backtesting',
          icon: <TestTube className="w-4 h-4" />,
          label: 'Manual Backtesting',
          href: '/manual-backtesting/sessions',
        },
        {
          id: 'market-screener',
          icon: <Radar className="w-4 h-4" />,
          label: 'Market Screener',
          href: '/market-screener',
        },
        {
          id: 'rulebooks',
          icon: <ListChecks className="w-4 h-4" />,
          label: 'Rulebooks',
          href: '/rulebooks',
          shortcut: 'R',
        },
        {
          id: 'trade-journal',
          icon: <BookOpen className="w-4 h-4" />,
          label: 'Trade Journal',
          href: '/journal',
          shortcut: 'J',
        },
        {
          id: 'global-variables',
          icon: <Braces className="w-4 h-4" />,
          label: 'Global Variables',
          href: '/global-variables',
        },
      ],
    },
    // Self-hosted admin page. Cloud builds get an empty Admin section so
    // we just omit it entirely below.
    ...(IS_CLOUD
      ? []
      : [
          {
            title: 'Admin',
            items: [
              {
                id: 'admin',
                icon: <ShieldCheck className="w-4 h-4" />,
                label: 'Admin',
                href: '/admin',
              },
            ],
          },
        ]),
  ];
  // Help & Resources items have moved to a fixed compact strip
  // rendered at the bottom of the sidebar (see NavigationSidebar.tsx).

  return IS_CLOUD ? sections : filterCloudOnlyItems(sections);
};
