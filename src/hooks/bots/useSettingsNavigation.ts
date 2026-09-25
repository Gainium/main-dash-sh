import { logger } from '@/lib/loggerInstance';

/**
 * All valid navigation IDs in the bot form.
 */
export const SETTINGS_NAV_IDS = {
  name: 'name',
  pair: 'pair',
  baseOrderSize: 'baseOrderSize',
  baseOrderType: 'baseOrderType',
  direction: 'direction',
  profitCurrency: 'profitCurrency',
  riskReduction: 'risk-reduction',
  reinvest: 'reinvest',
  enterMarketTimeout: 'enter-market-timeout',
  skipBalanceCheck: 'skip-balance-check',
  leverage: 'leverage',
  marginType: 'margin-type',
  startPrice: 'start-price',
  dealStartCondition: 'deal-start-condition',
  marketConditions: 'market-conditions',
  cooldown: 'cooldown',
  maxActiveDeals: 'max-active-deals',
  takeProfit: 'take-profit',
  takeProfitAdvanced: 'take-profit-advanced',
  trailingDeviation: 'trailing-deviation',
  stopLoss: 'stop-loss',
  stopLossAdvanced: 'stop-loss-advanced',
  dcaSettings: 'dca-settings',
  dcaAdvanced: 'dca-advanced',
  maxSafetyOrders: 'max-safety-orders',
  safetyOrderSize: 'safety-order-size',
  safetyOrderVolumeScale: 'safety-order-volume-scale',
  safetyOrderStepScale: 'safety-order-step-scale',
  priceDeviation: 'price-deviation',
  stopPrice: 'stop-price',
  stopAfterOpen: 'stop-after-open',
  stopAfterClosed: 'stop-after-closed',
  stopAfterWin: 'stop-after-win',
  stopAfterLoss: 'stop-after-loss',
  stopAfterConsecutiveWin: 'stop-after-consecutive-win',
  stopAfterConsecutiveLoss: 'stop-after-consecutive-loss',
  stopAfterProfit: 'stop-after-profit',
  rrSlFixedValue: 'rrSlFixedValue',
  riskAmount: 'risk-amount',
  riskTpRatio: 'riskTpRatio',
  riskSlRange: 'risk-sl-range',
  positionSizeLimits: 'position-size-limits',
  advancedSettings: 'advanced-settings',
  // Grid-specific navigation ids. Quick mode in particular collapses
  // several manual-mode fields (topPrice, lowPrice, levels, gridStep)
  // onto a single "Risk profile" row. The router below maps those
  // field-level ids to a row the user can actually act on.
  budget: 'budget',
  topPrice: 'topPrice',
  lowPrice: 'lowPrice',
  levels: 'levels',
  gridStep: 'gridStep',
  gridType: 'gridType',
  riskReward: 'risk-reward',
  tpSl: 'tpSl',
  sl: 'sl',
} as const;

export type SettingsNavId =
  (typeof SETTINGS_NAV_IDS)[keyof typeof SETTINGS_NAV_IDS];

/**
 * Human-readable labels for navIds - used to find elements by visible text
 */
const NAV_ID_LABELS: Record<string, string[]> = {
  baseOrderSize: ['Base Order Size', 'Base order size', 'base order'],
  baseOrderType: ['Base Order Type', 'Order Type'],
  direction: ['Direction', 'Bot Direction'],
  profitCurrency: ['Profit Currency'],
  'risk-reduction': ['Risk Reduction'],
  reinvest: ['Reinvest', 'Re-invest'],
  'enter-market-timeout': ['Enter Market Timeout'],
  leverage: ['Leverage'],
  'margin-type': ['Margin Type'],
  pair: ['Trading Pairs', 'Trading Pair', 'Pair', 'Symbol'],
  name: ['Bot Name', 'Name'],
  'take-profit': ['Take Profit'],
  'stop-loss': ['Stop Loss'],
  'max-safety-orders': ['Max Safety Orders', 'Safety Orders'],
  'safety-order-size': ['Safety Order Size', 'Order Size'],
  cooldown: ['Cooldown'],
  'max-active-deals': ['Max Active Deals', 'Active Deals'],
  // Grid mappings — label fallbacks find the row by the parenthesized
  // header text ("Budget (USDT)" etc).
  budget: ['Budget', 'Budget (quote)', 'Budget, quote'],
  topPrice: ['Top price', 'Top price (quote)'],
  lowPrice: ['Low price', 'Low price (quote)'],
  levels: ['Grid levels'],
  gridStep: ['Grid step (%)'],
  gridType: ['Grid type'],
  'risk-reward': ['Risk profile', 'Risk reward', 'Risk Reward'],
  tpSl: ['Take Profit', 'Take profit'],
  sl: ['Stop Loss', 'Stop loss'],
  'start-price': ['Start price', 'Activation price'],
};

/**
 * Scroll to element and highlight it
 */
function scrollToElement(element: HTMLElement, navId: string): void {
  logger.debugCategory(
    'SettingsNavigation',
    `Scrolling to element for: ${navId}`,
    {
      tagName: element.tagName,
      className: element.className.slice(0, 100),
    }
  );

  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  requestAnimationFrame(() => {
    element.focus?.();
    element.classList.add('settings-nav-highlight');
    setTimeout(() => {
      element.classList.remove('settings-nav-highlight');
    }, 2000);
  });
}

/**
 * Navigate to a settings element by its navId.
 * Uses multiple strategies to find the element.
 */
export function navigateToSetting(navId: string): boolean {
  if (!navId) {
    logger.warnCategory('SettingsNavigation', 'No navId provided');
    return false;
  }

  logger.debugCategory('SettingsNavigation', `Navigating to: ${navId}`);

  // Strategy 1: Find by data-settings-nav-id attribute
  const byAttr = document.querySelector(`[data-settings-nav-id="${navId}"]`);
  if (byAttr instanceof HTMLElement) {
    scrollToElement(byAttr, navId);
    return true;
  }

  // Strategy 2: Find by data-settings-nav-name attribute
  const labels = NAV_ID_LABELS[navId] || [];
  for (const label of labels) {
    const byName = document.querySelector(
      `[data-settings-nav-name="${label}"]`
    );
    if (byName instanceof HTMLElement) {
      scrollToElement(byName, navId);
      return true;
    }
  }

  // Strategy 3: Search for label text inside cards
  for (const label of labels) {
    const labelLower = label.toLowerCase();

    // Find all cards and check if any contain a label with matching text
    const cards = document.querySelectorAll('[data-slot="card"]');
    for (const card of cards) {
      // Look for label elements inside the card
      const cardLabels = card.querySelectorAll('label');
      for (const cardLabel of cardLabels) {
        const text = cardLabel.textContent?.trim().toLowerCase() || '';
        if (text === labelLower || text.includes(labelLower)) {
          if (card instanceof HTMLElement) {
            scrollToElement(card, navId);
            return true;
          }
        }
      }
    }
  }

  // Strategy 4: Find section by ID and scroll to it
  const sectionMap: Record<string, string> = {
    baseOrderSize: 'strategy',
    baseOrderType: 'strategy',
    direction: 'strategy',
    leverage: 'strategy',
    profitCurrency: 'strategy',
    pair: 'basic',
    name: 'basic',
    'take-profit': 'take-profit',
    'stop-loss': 'stop-loss',
    'dca-settings': 'dca',
    cooldown: 'deal-start',
    // Grid manual-mode section routing.
    budget: 'grid-budget',
    topPrice: 'grid-range',
    lowPrice: 'grid-range',
    levels: 'grid-range',
    gridStep: 'grid-range',
    gridType: 'grid-range',
    startPrice: 'strategy',
    tpSl: 'take-profit',
    sl: 'stop-loss',
  };

  const sectionId = sectionMap[navId];
  if (sectionId) {
    const section = document.querySelector(
      `#section-${sectionId}, [data-section-id="${sectionId}"]`
    );
    if (section instanceof HTMLElement) {
      logger.debugCategory(
        'SettingsNavigation',
        `Using section fallback: ${sectionId}`
      );
      scrollToElement(section, navId);
      return true;
    }
  }

  // Strategy 5: Quick-mode grid fallback. In Quick mode, range fields
  // (topPrice/lowPrice/levels/gridStep) don't exist as discrete rows —
  // they're synthesised from the "Risk profile" preset. Redirect any
  // alert pointing at those fields to the Risk profile row so the user
  // lands somewhere they can actually fix the issue.
  const RISK_PROFILE_NAV_IDS = new Set([
    'topPrice',
    'lowPrice',
    'levels',
    'gridStep',
    'gridType',
  ]);
  if (RISK_PROFILE_NAV_IDS.has(navId)) {
    const riskRow = document.querySelector(
      '[data-settings-nav-id="risk-reward"]'
    );
    if (riskRow instanceof HTMLElement) {
      logger.debugCategory(
        'SettingsNavigation',
        `Quick-mode grid fallback for ${navId} → risk-reward row`
      );
      scrollToElement(riskRow, navId);
      return true;
    }
  }

  logger.warnCategory(
    'SettingsNavigation',
    `Element not found for navId: ${navId}`
  );
  return false;
}

/**
 * Hook to get the navigation function.
 */
export function useNavigateToSetting() {
  return (navId: string | undefined): boolean => {
    if (!navId) return false;
    return navigateToSetting(navId);
  };
}
