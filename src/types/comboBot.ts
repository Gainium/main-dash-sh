// Types for real Combo Bot data from GraphQL API

export interface ComboBotSymbol {
  key: string;
  value: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

export interface ComboBotSettings {
  name: string;
  pair: string[];
  strategy: string;
  type: string;
  futures: boolean;
  coinm: boolean;
}

export interface ComboBotProfit {
  totalUsd: number;
}

export interface ComboBotDeals {
  active: number;
  all: number;
}

export interface ComboBotWorkingShift {
  start: number;
  end?: number;
}

export interface ComboBotAssets {
  used: {
    base: Array<{ key: string; value: number }>;
    quote: Array<{ key: string; value: number }>;
  };
  required: {
    base: Array<{ key: string; value: number }>;
    quote: Array<{ key: string; value: number }>;
  };
}

export interface ComboBotUsage {
  current: {
    base: number;
    quote: number;
  };
  currentUsd?: number; // Add this field for the USD value
  max: {
    base: number;
    quote: number;
  };
}

export interface ComboBotBalances {
  base: Array<{ key: string; value: number }>;
  quote: Array<{ key: string; value: number }>;
}

export interface ComboBotChartData {
  equity: number;
  time: number;
}

export interface ComboBotStats {
  chart: ComboBotChartData[];
}

export interface ComboBot {
  _id: string;
  cost?: number;
  status: string;
  statusReason?: unknown;
  settings: ComboBotSettings;
  symbol: ComboBotSymbol[];
  exchange: string;
  exchangeUUID: string;
  profit: ComboBotProfit;
  unrealizedProfit?: number;
  dealsInBot: ComboBotDeals;
  workingShift: ComboBotWorkingShift[];
  assets: ComboBotAssets;
  usage: ComboBotUsage;
  public?: unknown;
  currentBalances: ComboBotBalances;
  initialBalances: ComboBotBalances;
  created: string;
  stats: ComboBotStats;
}

export interface ComboBotListResponse {
  status: string;
  reason?: unknown;
  total: number;
  data: ComboBot[];
}
