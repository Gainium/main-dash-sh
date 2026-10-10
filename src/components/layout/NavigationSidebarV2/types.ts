export type SecondaryPanel =
  | 'dashboards'
  | 'more'
  | 'help'
  | 'trading'
  | 'dcaBots'
  | 'comboBots'
  | 'gridBots'
  | 'portfolio'
  | 'backtesting'
  | 'rulebooks'
  | 'journal'
  | 'reports';

export interface NavigationGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  hasSecondaryPanel?: boolean;
  panelType?: SecondaryPanel;
  badge?: {
    text: string;
    variant?: 'default' | 'pro' | 'beta';
  };
  /**
   * Optional runtime visibility (a React hook, called once per render of the
   * entry). Returns false to hide the entry everywhere the sidebar lists it.
   * Omitted = always visible.
   */
  useIsVisible?: () => boolean;
}
