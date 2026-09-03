// Enhanced balance types for production-ready balance table
// Based on legacy dashboard balance system with bot integration

export interface BotLegendItem {
  id: string;
  name: string;
  type: 'grid' | 'dca' | 'combo';
  amount: string;
  terminal?: boolean;
}

export interface EnhancedBalanceData {
  // Basic token information
  id: string;
  token: string;
  tokenName: string;

  // Exchange information
  exchange?: string;
  exchangeName?: string;
  exchangeUUID?: string;

  // Balance breakdown (core feature from legacy)
  free: number; // Available balance (not in orders)
  used: number; // Balance locked in orders
  total: number; // Total balance (free + used)

  // Bot integration (CRITICAL MISSING FEATURE)
  required: number; // Maximum potential bot usage
  planned: number; // Additional potential usage (required - used)
  freeAndOver: number; // Excess/deficit balance (total - required)
  requiredRatio: number; // Required as percentage of total

  // USD values
  freeUsd: number;
  usedUsd: number;
  totalUsd: number;
  requiredUsd: number;
  plannedUsd: number;
  freeAndOverUsd: number;

  // Price information
  currentPrice: number;
  usdRate: string;
  /**
   * No price source could value this asset - neither the venue's own rate table
   * nor the screener. Distinguishes "we could not price this" from a genuine
   * zero, so the table can say so instead of rendering a confident $0.00.
   */
  priceUnavailable?: boolean;
  /**
   * ISO time of the backend's last write to the underlying balance row(s) —
   * the oldest venue when summed; null when the backend did not send it.
   * Drives the stale-balance marker (`utils/balanceStaleness.ts`).
   */
  updatedAt?: string | null;

  // Asset metadata
  categories?: string[];
  marketCapCategory?: string;

  // Bot legend (CRITICAL MISSING FEATURE)
  legend?: BotLegendItem[];

  // UI helpers
  icon?: string;
  color?: string;
}

// Settings for enhanced balance table
export interface EnhancedBalanceSettings {
  // Aggregate toggle (CRITICAL MISSING FEATURE)
  shouldSumBalance: boolean;

  // Column visibility
  showExchange: boolean;
  showCategories: boolean;
  showMarketCap: boolean;
  showBotUsage: boolean;

  // Filtering
  selectedExchanges: string[];
  selectedCategories: string[];
  selectedMarketCaps: string[];

  // Currency display
  displayCurrency: string;

  // Advanced search (CRITICAL MISSING FEATURE)
  globalSearchTerm: string;

  // Column sorting persistence (CRITICAL MISSING FEATURE)
  persistentSorting: boolean;
}

// Enhanced balance table props
export interface EnhancedBalanceTableProps {
  widgetId?: string;
  data?: EnhancedBalanceData[];
  settings?: Partial<EnhancedBalanceSettings>;
  showPagination?: boolean;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean;
  height?: string | number;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  menuActions?: any;
}

// Balance calculation utilities
import type { Asset } from './index';

export interface BalanceCalculationInput {
  // Portfolio assets from GraphQL
  portfolioAssets: Array<{
    name: string;
    amount: number;
    amountUsd: number;
    // Optional per-exchange breakdown (present in getPortfolioByUser snapshots)
    exchanges?: Array<{
      uuid: string;
      amount?: number;
      amountUsd?: number;
    }>;
  }>;

  // Bot data for usage calculations (Real DCA/Combo bot structure)
  bots?: Array<{
    _id: string;
    exchangeUUID: string;
    status: string;
    settings: {
      name: string;
      strategy?: string;
      type?: string;
      futures?: boolean;
      coinm?: boolean;
    };
    assets?: {
      required?: {
        base?: Array<{ key: string; value: number }>;
        quote?: Array<{ key: string; value: number }>;
      };
      used?: {
        base?: Array<{ key: string; value: number }>;
        quote?: Array<{ key: string; value: number }>;
      };
    };
    usage?: {
      max?: {
        base?: number;
        quote?: number;
      };
      current?: {
        base?: number;
        quote?: number;
      };
    };
    symbol?: Array<{
      key: string;
      value: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
      };
    }>;
    type?: string;
  }>;

  // Exchange data
  exchanges?: Array<{
    id: string;
    name: string;
    uuid?: string;
  }>;

  // Price data
  prices?: Array<{
    symbol: string;
    price: number;
  }>;

  // Optional raw balances (from getBalances) to improve free/used accuracy
  balances?: Asset[];

  // Coin metadata
  coins?: Array<{
    symbol: string;
    categories: string[];
    market_cap_rank: number;
  }>;
}

// Market cap categories (from legacy system)
export const MARKET_CAP_TYPES = [
  { title: 'Large Cap', min: 1, max: 10 },
  { title: 'Mid Cap', min: 11, max: 100 },
  { title: 'Small Cap', min: 101, max: 1000 },
  { title: 'Micro Cap', min: 1001, max: 10000 },
] as const;

export type MarketCapType = (typeof MARKET_CAP_TYPES)[number]['title'];
