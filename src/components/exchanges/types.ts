import type {
  CoinbaseKeysType,
  ExchangeEnum,
  ExchangeInUser,
  OKXSource,
} from '../../types/exchange.types';

// Exchange dialog mode
export type ExchangeDialogMode = 'add' | 'edit';

// Exchange dialog props
export interface ExchangeDialogProps {
  open: boolean;
  onClose: () => void;
  mode: ExchangeDialogMode;
  exchangeData?: ExchangeInUser | undefined;
  onSuccess: (exchange: ExchangeInUser) => void;
  onModeChange?: (mode: 'paper' | 'live') => void;
  initialTradingMode?: 'paper' | 'live';
}

// Exchange form data structure
export interface ExchangeFormData {
  // Basic Information
  name: string;
  provider: ExchangeEnum;

  // Authentication
  key: string;
  secret: string;
  passphrase?: string;

  // Exchange-specific settings
  keysType?: CoinbaseKeysType | undefined;
  okxSource?: OKXSource | undefined;
  bybitHost?: string | undefined;

  // Paper trading settings
  isPaperTrading: boolean;
  stablecoinBalance: string;
  coinToTopUp: string;
  // Independent per-sub-account funding for a `SPOT & Futures` (all) paper
  // create. When set, each entry funds the created account whose provider
  // matches `provider`. Empty/undefined for single-market selections, which
  // keep using stablecoinBalance/coinToTopUp.
  paperTopUps?: { provider: ExchangeEnum; asset: string; amount: string }[];

  // Hyperliquid-specific settings
  useApproveBuilderFees?: boolean;
  subaccount?: boolean;

  // Advanced settings
  hedgeMode: boolean;
  ignoreFees: boolean;
}

// Exchange form validation errors
export interface ExchangeFormErrors {
  name?: string;
  provider?: string;
  key?: string;
  secret?: string;
  passphrase?: string;
  stablecoinBalance?: string;
  coinToTopUp?: string;
  // Per-sub-account funding errors for a `SPOT & Futures` paper create,
  // keyed by the sub-account provider id.
  paperTopUps?: Record<string, string>;
}

// Exchange provider configuration
export interface ExchangeProviderConfig {
  id: ExchangeEnum;
  name: string;
  displayName: string;
  requiresPassphrase: boolean;
  supportsKeyTypes: boolean;
  supportsHostSelection: boolean;
  supportsPaperTrading: boolean;
  isPaperExchange: boolean;
  category: 'spot' | 'futures' | 'all';
  popular?: boolean;
  // Legacy "umbrella" provider id kept for backward-compat lookup/display
  // of already-saved accounts, but hidden from the add-exchange dropdown
  // because an explicit SPOT / `SPOT & Futures` variant of the same
  // exchange already covers it (e.g. bare `paperKraken` duplicates
  // `paperKrakenSpot`). Lookups via getExchangeConfig still resolve it.
  hideFromProviderList?: boolean;
}

// Paper trading asset options
export interface PaperTradingAsset {
  symbol: string;
  name: string;
  defaultBalance: string;
}

// Exchange host options (for Bybit, OKX)
export interface ExchangeHostOption {
  value: string;
  label: string;
  url: string;
}

// Form validation result
export interface ValidationResult {
  isValid: boolean;
  errors: ExchangeFormErrors;
}

// Exchange connection status
export interface ExchangeConnectionStatus {
  isConnecting: boolean;
  isValidating: boolean;
  connectionError?: string;
  validationError?: string;
}
