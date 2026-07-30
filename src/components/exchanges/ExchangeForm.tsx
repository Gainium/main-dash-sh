import { paidExchanges } from '@/constants/subscription';
import { useWeb3Wallet, type WalletProvider } from '@/hooks/useWeb3Wallet';
import { track as analyticsTrack } from '@/lib/analytics';
import { useEntitlements } from '@/lib/entitlements';
import { Slot } from '@/lib/extensions';
import { useTrial } from '@/lib/trial';
import { toast } from '@/lib/toast';
import { completeHyperliquidSetup } from '@/utils/hyperliquid';
import { isFuturesExchange, showZeroFee } from '@/utils/exchangeUtils';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import logger from '../../lib/loggerInstance';
import {
  CoinbaseKeysType,
  ExchangeEnum,
  OKXSource,
} from '../../types/exchange.types';
import { WalletSelectorDialog } from '../wallets/WalletSelectorDialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { HelpArticlePill } from '../ui/HelpArticlePill';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  coinbaseKeyTypes,
  exchangeProviders,
  getDefaultAccountName,
  getEffectivePaperBrand,
  getExchangeConfig,
  getExchangeHostOptions,
  getPaperAllSubAccounts,
  getPaperSubAccountLabel,
  getPaperTradingAssets,
  getSubAccountTopUpAssets,
  isPaperExchange,
  requiresPassphrase,
  supportsHostSelection,
  supportsKeyTypes,
} from './exchangeConfig';
import { mapProviderToBackend } from '@/hooks/useExchangeMutations';
import type {
  ExchangeConnectionStatus,
  ExchangeFormData,
  ExchangeFormErrors,
  ValidationResult,
} from './types';

interface ExchangeFormProps {
  initialData?: Partial<ExchangeFormData> | undefined;
  onSubmit: (data: ExchangeFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean | undefined;
  mode: 'add' | 'edit';
  onModeChange?: (mode: 'paper' | 'live') => void;
  initialTradingMode?: 'paper' | 'live';
  // Live toggles — when provided (edit mode) the hedge / ignoreFees
  // switches commit to the server immediately rather than waiting for
  // the Update Exchange button. Local form state still updates
  // optimistically and reverts on error.
  onHedgeModeChange?: (value: boolean) => Promise<void>;
  onIgnoreFeesChange?: (value: boolean) => Promise<void>;
  hedgeModePending?: boolean;
  ignoreFeesPending?: boolean;
}

const getExchangeHelpPath = (name?: string): string | null => {
  switch (name) {
    case 'binance':
      return '/help/connect-to-binance';
    case 'bybit':
      return '/help/connect-to-bybit';
    case 'kucoin':
      return '/help/connect-to-kucoin';
    case 'okx':
      return '/help/connect-to-okx';
    case 'coinbase':
      return '/help/connect-to-coinbase';
    case 'hyperliquid':
      return '/help/connect-to-hyperliquid';
    case 'bitget':
      return '/help/connect-to-bitget';
    case 'kraken':
      return '/help/connect-to-kraken';
    default:
      return null;
  }
};

const ExchangeForm: React.FC<ExchangeFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  mode,
  onModeChange,
  initialTradingMode = 'paper',
  onHedgeModeChange,
  onIgnoreFeesChange,
  hedgeModePending = false,
  ignoreFeesPending = false,
}) => {
  // Unified entitlements gate. Cloud reads `userProfile.subscription.subscriptionPlanName`
  // against `paidPlans`; sh reads `useLicense().isPremium`. The
  // `useEntitlements` adapter hides the difference — see
  // `lib/entitlements/impl/{cloud,sh}.ts`.
  const { isPaid: isPaidUser } = useEntitlements();

  // Trial gate (cloud-only). When the user is still eligible for a free
  // trial, premium exchanges stay selectable in the dropdown and picking
  // one opens the start-trial prompt instead of being hard-blocked.
  // After the trial is used up (or on sh, where it's always false),
  // premium exchanges revert to the disabled "(upgrade to use)" rows.
  const { available: trialAvailable } = useTrial();

  // Determine initial paper trading mode
  const initialIsPaperTrading =
    initialData?.isPaperTrading ?? initialTradingMode !== 'live';

  // Form state - must be defined before memos that depend on it
  const [formData, setFormData] = useState<ExchangeFormData>(() => {
    // If we have initialData (edit mode), use it directly
    if (initialData && Object.keys(initialData).length > 0) {
      logger.info('ExchangeForm: Initializing with initialData (edit mode)', {
        provider: initialData.provider,
        name: initialData.name,
        isPaperTrading: initialData.isPaperTrading,
        coinToTopUp: initialData.coinToTopUp,
      });

      return {
        name: '',
        provider: initialIsPaperTrading
          ? ExchangeEnum.paperBybitAll
          : ExchangeEnum.bybitAll,
        key: '',
        secret: '',
        passphrase: '',
        keysType: CoinbaseKeysType.legacy,
        okxSource: OKXSource.com,
        bybitHost: 'com',
        isPaperTrading: initialIsPaperTrading,
        stablecoinBalance: '10000',
        coinToTopUp: 'USDT',
        hedgeMode: false,
        ignoreFees: false,
        useApproveBuilderFees: !isPaidUser,
        subaccount: false,
        ...initialData,
      };
    }

    logger.info('ExchangeForm: Initializing with defaults (add mode)');

    // For add mode, start with defaults
    return {
      name: '',
      provider: initialIsPaperTrading
        ? ExchangeEnum.paperBybitAll
        : ExchangeEnum.bybitAll,
      key: '',
      secret: '',
      passphrase: '',
      keysType: CoinbaseKeysType.legacy,
      okxSource: OKXSource.com,
      bybitHost: 'com',
      isPaperTrading: initialIsPaperTrading,
      stablecoinBalance: '10000',
      coinToTopUp: 'USDT',
      hedgeMode: false,
      ignoreFees: false,
      useApproveBuilderFees: !isPaidUser,
      subaccount: false,
    };
  });

  // Track amount to top up for edit mode
  const [topUpAmount, setTopUpAmount] = useState('');

  // Check if current provider is Hyperliquid (live, not paper)
  const isHyperliquid = useMemo(
    () =>
      [
        ExchangeEnum.hyperliquid,
        ExchangeEnum.hyperliquidAll,
        ExchangeEnum.hyperliquidLinear,
      ].includes(formData.provider),
    [formData.provider]
  );

  // Web3 wallet state for Hyperliquid
  const web3Wallet = useWeb3Wallet();
  const [hyperliquidSetupStatus, setHyperliquidSetupStatus] = useState<
    'idle' | 'connecting' | 'approving' | 'success' | 'error'
  >('idle');
  const [hyperliquidError, setHyperliquidError] = useState<string | null>(null);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<WalletProvider[]>(
    []
  );

  // Whether to show manual key entry (false when Hyperliquid + builder fees)
  const showHyperliquidKeys = useMemo(
    () => !(isHyperliquid && formData.useApproveBuilderFees),
    [isHyperliquid, formData.useApproveBuilderFees]
  );

  // Open wallet selector or connect directly if only one wallet
  const handleOpenWalletSelector = useCallback(() => {
    const wallets = web3Wallet.detectWallets();
    setAvailableWallets(wallets);

    if (wallets.length === 1) {
      setupHyperliquidWeb3(wallets[0]);
    } else if (wallets.length > 1) {
      setWalletSelectorOpen(true);
    } else {
      setHyperliquidError(
        'No Web3 wallet detected. Please install MetaMask, Bitget Wallet, OKX Wallet, or another compatible wallet.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [web3Wallet]);

  // Handle Hyperliquid Web3 setup: connect → switch network → approve agent → submit exchange
  const setupHyperliquidWeb3 = useCallback(
    async (selectedWallet?: WalletProvider) => {
      if (!isHyperliquid) return;

      setHyperliquidSetupStatus('connecting');
      setHyperliquidError(null);

      try {
        // Step 1: Connect wallet
        const w = await web3Wallet.connectWallet(selectedWallet);
        if (!w) {
          throw new Error('Failed to connect to the selected Web3 wallet.');
        }
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 2: Ensure we're on Arbitrum Mainnet
        if (!w.isCorrectChain) {
          await web3Wallet.switchToArbitrum();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Step 3: Approve agent & builder fees
        setHyperliquidSetupStatus('approving');

        const ethereumProvider = w.selectedWalletProvider;
        if (!ethereumProvider || !w.signer || !w.account) {
          throw new Error(
            'No Web3 wallet provider available. Please reconnect your wallet.'
          );
        }

        const result = await completeHyperliquidSetup(
          w.signer,
          formData.useApproveBuilderFees
        );

        if (!result.success) {
          throw new Error(
            result.details || result.error || 'Failed to setup Hyperliquid'
          );
        }

        setHyperliquidSetupStatus('success');
        toast.success(
          'Hyperliquid wallet connected and approved successfully!'
        );

        // Submit the exchange with wallet account as key and agent private key as secret
        await onSubmit({
          ...formData,
          key: w.account,
          secret: result.agentPrivateKey || '',
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setHyperliquidError(errorMessage);
        setHyperliquidSetupStatus('error');
      }
    },
    [isHyperliquid, web3Wallet, onSubmit, formData]
  );

  // Sync useApproveBuilderFees when user profile loads/changes
  useEffect(() => {
    if (isHyperliquid) {
      setFormData((prev) => ({
        ...prev,
        useApproveBuilderFees: !isPaidUser,
      }));
    }
  }, [isPaidUser, isHyperliquid]);

  // Available exchanges based on paper trading mode. Also strips
  // Hyperliquid variants when the user doesn't have a premium license.
  const availableExchanges = useMemo(() => {
    return exchangeProviders.filter((config) => {
      // Hide legacy umbrella ids that an explicit SPOT / `SPOT & Futures`
      // variant already covers (de-dupes e.g. "Paper Kraken" vs
      // "Paper Kraken SPOT").
      if (config.hideFromProviderList) return false;
      if (formData.isPaperTrading && !config.isPaperExchange) return false;
      if (!formData.isPaperTrading && config.isPaperExchange) return false;
      return true;
    });
  }, [formData.isPaperTrading]);

  // Whether premium exchanges should be offered behind the start-trial
  // prompt rather than hard-blocked. True only for a free user in live
  // mode who still has a trial available.
  const offerTrialOnPremium =
    !isPaidUser && !formData.isPaperTrading && trialAvailable;

  // Accessible exchanges (non-blocked). Free users in live mode only see
  // free exchanges — UNLESS a trial is still available, in which case
  // premium exchanges remain selectable and picking one opens the
  // start-trial prompt.
  const accessibleExchanges = useMemo(() => {
    const baseExchanges = availableExchanges;

    if (!isPaidUser && !formData.isPaperTrading && !trialAvailable) {
      return baseExchanges.filter(
        (config) => !paidExchanges.includes(config.id)
      );
    }

    return baseExchanges;
  }, [availableExchanges, isPaidUser, formData.isPaperTrading, trialAvailable]);

  // Blocked exchanges (premium exchanges shown disabled with an "upgrade
  // to use" hint). Only populated for a free, live-mode user whose trial
  // is no longer available — otherwise premium exchanges are either
  // fully accessible (paid) or trial-gated inside accessibleExchanges.
  const blockedExchanges = useMemo(() => {
    if (formData.isPaperTrading || isPaidUser || trialAvailable) return [];
    return availableExchanges.filter((config) =>
      paidExchanges.includes(config.id)
    );
  }, [formData.isPaperTrading, isPaidUser, trialAvailable, availableExchanges]);

  // Premium exchange ids that are trial-gated for this user — used to
  // tag their dropdown rows with a "Trial" badge.
  const isTrialGated = useCallback(
    (id: ExchangeEnum) => offerTrialOnPremium && paidExchanges.includes(id),
    [offerTrialOnPremium]
  );

  // Start-trial prompt state. When a trial-gated premium exchange is
  // picked we commit the selection (so the user sees their choice) and
  // open the cloud-supplied dialog. `prevProviderRef` remembers what to
  // fall back to if the user dismisses without starting the trial;
  // `trialStartedRef` suppresses that revert once the trial begins.
  const [trialPromptOpen, setTrialPromptOpen] = useState(false);
  const [trialPromptExchange, setTrialPromptExchange] = useState('');
  const prevProviderRef = useRef<ExchangeEnum | null>(null);
  const trialStartedRef = useRef(false);

  // Set default exchange to Bybit when switching between paper/live modes
  useEffect(() => {
    if (!initialData) {
      const defaultProvider = formData.isPaperTrading
        ? ExchangeEnum.paperBybitAll
        : ExchangeEnum.bybitAll;
      const config = getExchangeConfig(defaultProvider);

      if (config) {
        setFormData((prev) => ({
          ...prev,
          provider: defaultProvider,
          name: getDefaultAccountName(config),
        }));
      }
    }
  }, [formData.isPaperTrading, initialData]);

  const [errors, setErrors] = useState<ExchangeFormErrors>({});
  const [showSecret, setShowSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ExchangeConnectionStatus>({
      isConnecting: false,
      isValidating: false,
    });

  useEffect(() => {
    onModeChange?.(formData.isPaperTrading ? 'paper' : 'live');
  }, [formData.isPaperTrading, onModeChange]);

  // Get current exchange configuration
  const exchangeConfig = useMemo(() => {
    return getExchangeConfig(formData.provider);
  }, [formData.provider]);

  // Get paper trading assets for current exchange. Origin-aware: an OKX
  // account on the Europe origin funds from the `okxEu` lists (no USDT on
  // the EU venue).
  const paperTradingAssets = useMemo(() => {
    if (!exchangeConfig) {
      logger.debug(
        'ExchangeForm: No exchangeConfig, paperTradingAssets will be empty'
      );
      return [];
    }
    const assets = getPaperTradingAssets(
      getEffectivePaperBrand(exchangeConfig.name, formData.okxSource)
    );
    logger.debug('ExchangeForm: Paper trading assets loaded', {
      exchangeName: exchangeConfig.name,
      exchangeId: exchangeConfig.id,
      assetsCount: assets.length,
      assets: assets.map((a) => a.symbol),
    });
    return assets;
  }, [exchangeConfig, formData.okxSource]);

  // A paper `SPOT & Futures` (all) ADD creates one account per market — list
  // them so the form can render an independent funding row for each. Empty
  // for single-market selections, edit mode, and live exchanges. OKX Europe
  // has no inverse product, so its bundle is SPOT + Linear only (matching
  // what the backend actually creates for okxSource=my).
  const paperAllSubAccounts = useMemo(() => {
    if (mode !== 'add' || !formData.isPaperTrading) return [];
    if (exchangeConfig?.category !== 'all') return [];
    const subAccounts = getPaperAllSubAccounts(
      mapProviderToBackend(formData.provider)
    );
    return formData.okxSource === OKXSource.my
      ? subAccounts.filter((id) => id !== ExchangeEnum.paperOkxInverse)
      : subAccounts;
  }, [
    mode,
    formData.isPaperTrading,
    formData.provider,
    formData.okxSource,
    exchangeConfig?.category,
  ]);

  // Per-sub-account funding state for the multi-account case, keyed by the
  // created account's provider id. Seeded from each market's default asset
  // whenever the set of sub-accounts changes (i.e. on provider change).
  const [paperTopUps, setPaperTopUps] = useState<
    Record<string, { asset: string; amount: string }>
  >({});

  useEffect(() => {
    if (paperAllSubAccounts.length === 0 || !exchangeConfig) {
      setPaperTopUps({});
      return;
    }
    const brand = getEffectivePaperBrand(
      exchangeConfig.name,
      formData.okxSource
    );
    const next: Record<string, { asset: string; amount: string }> = {};
    for (const id of paperAllSubAccounts) {
      const first = getSubAccountTopUpAssets(id, brand)[0];
      next[id] = {
        asset: first?.symbol ?? 'USDT',
        amount: first?.defaultBalance ?? '10000',
      };
    }
    setPaperTopUps(next);
  }, [paperAllSubAccounts, exchangeConfig, formData.okxSource]);

  const updatePaperTopUp = (
    id: string,
    patch: Partial<{ asset: string; amount: string }>
  ) => {
    // Radix Select emits a spurious onValueChange('') during mount/hydration
    // before the seeded value registers; ignore it so it doesn't wipe the
    // per-market default asset. A real user selection is never empty.
    if (patch.asset === '') return;
    setPaperTopUps((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setErrors({});
  };

  // Get host options for current exchange
  const hostOptions = useMemo(() => {
    if (!exchangeConfig) return [];
    return getExchangeHostOptions(exchangeConfig.name);
  }, [exchangeConfig]);

  // Update form data
  const updateFormData = (updates: Partial<ExchangeFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    // Clear related errors
    setErrors({});
  };

  // Live toggle handlers — optimistic local update, revert on error.
  // Falls back to plain formData mutation when the live handler is not
  // provided (add mode, or future contexts where the parent prefers to
  // batch hedge / fees with the rest of the submit).
  const handleHedgeToggle = async (checked: boolean) => {
    setFormData((prev) => ({ ...prev, hedgeMode: checked }));
    if (!onHedgeModeChange) return;
    try {
      await onHedgeModeChange(checked);
    } catch {
      setFormData((prev) => ({ ...prev, hedgeMode: !checked }));
    }
  };

  const handleIgnoreFeesToggle = async (checked: boolean) => {
    setFormData((prev) => ({ ...prev, ignoreFees: checked }));
    if (!onIgnoreFeesChange) return;
    try {
      await onIgnoreFeesChange(checked);
    } catch {
      setFormData((prev) => ({ ...prev, ignoreFees: !checked }));
    }
  };

  // Handle provider change
  const handleProviderChange = (provider: ExchangeEnum) => {
    const config = getExchangeConfig(provider);

    if (!config) return;

    // Remember the previous selection before committing, so we can
    // revert if the user dismisses the start-trial prompt.
    const previousProvider = formData.provider;

    const updates: Partial<ExchangeFormData> = {
      provider,
      name: getDefaultAccountName(config),
      isPaperTrading: config.isPaperExchange,
    };

    // Reset exchange-specific settings
    if (!config.requiresPassphrase) {
      updates.passphrase = '';
    }
    if (!config.supportsKeyTypes) {
      updates.keysType = CoinbaseKeysType.legacy;
    }
    if (!config.supportsHostSelection) {
      updates.bybitHost = 'com';
      updates.okxSource = OKXSource.com;
    }

    // Set default paper trading asset (origin-aware: OKX Europe funds from
    // the okxEu lists; the origin survives switches between OKX tiles).
    if (config.isPaperExchange || updates.isPaperTrading) {
      const assets = getPaperTradingAssets(
        getEffectivePaperBrand(
          config.name,
          updates.okxSource ?? formData.okxSource
        )
      );
      if (assets.length > 0) {
        updates.coinToTopUp = assets[0].symbol;
        updates.stablecoinBalance = assets[0].defaultBalance;
      }
    }

    // Reset Hyperliquid-specific settings when switching providers
    const isHyperliquidProvider = [
      ExchangeEnum.hyperliquid,
      ExchangeEnum.hyperliquidAll,
      ExchangeEnum.hyperliquidLinear,
    ].includes(provider);
    if (!isHyperliquidProvider) {
      updates.useApproveBuilderFees = false;
      updates.subaccount = false;
    } else {
      // Default to builder fees for free users, regular for paid users
      updates.useApproveBuilderFees = !isPaidUser;
      updates.subaccount = false;
    }

    updateFormData(updates);

    // Trial-gated premium exchange: commit the selection above, then
    // prompt the user to start their free trial. If they dismiss it
    // without starting, the prompt's onOpenChange reverts to the
    // previous provider.
    if (isTrialGated(provider)) {
      prevProviderRef.current = previousProvider;
      trialStartedRef.current = false;
      setTrialPromptExchange(config.displayName);
      setTrialPromptOpen(true);
    }
  };

  // Revert the dropdown to its pre-prompt selection when the user
  // dismisses the start-trial dialog without starting a trial. Reuse
  // handleProviderChange so all provider-dependent fields reset; the
  // fallback is a non-premium exchange, so it won't reopen the prompt.
  const handleTrialPromptOpenChange = (open: boolean) => {
    setTrialPromptOpen(open);
    if (!open && !trialStartedRef.current && prevProviderRef.current) {
      handleProviderChange(prevProviderRef.current);
      prevProviderRef.current = null;
    }
  };

  // The trial started successfully. Keep the premium selection — once
  // the refreshed user profile lands, `isPaidUser` flips true and the
  // exchange is no longer gated.
  const handleTrialStarted = () => {
    trialStartedRef.current = true;
    prevProviderRef.current = null;
    setTrialPromptOpen(false);
  };

  // Handle paper trading toggle
  const handlePaperTradingToggle = (isPaperTrading: boolean) => {
    const updates: Partial<ExchangeFormData> = { isPaperTrading };

    if (isPaperTrading && paperTradingAssets.length > 0) {
      updates.coinToTopUp = paperTradingAssets[0].symbol;
      updates.stablecoinBalance = paperTradingAssets[0].defaultBalance;
    }

    // Default to Bybit for both paper and live modes
    const defaultProvider = isPaperTrading
      ? ExchangeEnum.paperBybitAll
      : ExchangeEnum.bybitAll;
    const config = getExchangeConfig(defaultProvider);

    if (config) {
      updates.provider = config.id;
      updates.name = getDefaultAccountName(config);
    }

    updateFormData(updates);
  };

  // Form validation
  const validateForm = (): ValidationResult => {
    const newErrors: ExchangeFormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Exchange name is required';
    } else if (formData.name.length < 4 || formData.name.length > 35) {
      newErrors.name = 'Name must be between 4 and 35 characters';
    }

    // Provider validation
    if (!formData.provider) {
      newErrors.provider = 'Please select an exchange';
    }

    // API credentials validation (only for live trading, skip for Hyperliquid with builder fees)
    const isHyperliquidProvider = [
      ExchangeEnum.hyperliquid,
      ExchangeEnum.hyperliquidAll,
      ExchangeEnum.hyperliquidLinear,
    ].includes(formData.provider);
    const skipApiKeysValidation =
      isHyperliquidProvider && formData.useApproveBuilderFees;

    if (
      !formData.isPaperTrading &&
      !isPaperExchange(formData.provider) &&
      !skipApiKeysValidation
    ) {
      if (!formData.key.trim()) {
        newErrors.key = 'API key is required';
      } else {
        const keyValidation = validateApiKeyFormat(
          formData.provider,
          formData.key
        );
        if (!keyValidation.isValid && keyValidation.error) {
          newErrors.key = keyValidation.error;
        }
      }

      // Secret is required when adding, but OPTIONAL when editing. The
      // backend never returns the stored secret, so an edit (e.g. just
      // renaming the exchange) leaves the field blank and the server keeps
      // the existing credential. Mirror main-dash: validate the format only
      // when a secret was actually typed. Same reasoning for the passphrase.
      if (mode === 'edit') {
        if (formData.secret.trim()) {
          const secretValidation = validateApiSecretFormat(
            formData.provider,
            formData.secret
          );
          if (!secretValidation.isValid && secretValidation.error) {
            newErrors.secret = secretValidation.error;
          }
        }
      } else if (!formData.secret.trim()) {
        newErrors.secret = 'API secret is required';
      } else {
        const secretValidation = validateApiSecretFormat(
          formData.provider,
          formData.secret
        );
        if (!secretValidation.isValid && secretValidation.error) {
          newErrors.secret = secretValidation.error;
        }
      }

      // Passphrase validation for exchanges that require it (add mode only —
      // like the secret, it isn't returned for an existing exchange).
      if (
        mode !== 'edit' &&
        requiresPassphrase(formData.provider) &&
        !formData.passphrase?.trim()
      ) {
        newErrors.passphrase = 'Passphrase is required for this exchange';
      }
    }

    // Paper trading validation — every paper account is funded with an
    // asset + starting balance. A `SPOT & Futures` create funds each
    // sub-account independently (one row per market), so validate those
    // rows; single-market selections validate the single asset/balance.
    if (formData.isPaperTrading || isPaperExchange(formData.provider)) {
      if (paperAllSubAccounts.length > 0) {
        const topUpErrors: Record<string, string> = {};
        for (const id of paperAllSubAccounts) {
          const row = paperTopUps[id];
          const amount = parseFloat(row?.amount ?? '');
          if (!row?.asset) {
            topUpErrors[id] = 'Please select an asset';
          } else if (!Number.isFinite(amount) || amount <= 0) {
            topUpErrors[id] = 'Enter a positive amount';
          }
        }
        if (Object.keys(topUpErrors).length > 0) {
          newErrors.paperTopUps = topUpErrors;
        }
      } else {
        if (!formData.coinToTopUp) {
          newErrors.coinToTopUp = 'Please select an asset';
        }

        const balance = parseFloat(formData.stablecoinBalance);
        if (isNaN(balance)) {
          newErrors.stablecoinBalance = 'Balance must be a valid number';
        } else if (balance < 0) {
          newErrors.stablecoinBalance = 'Balance must be a positive number';
        } else if (balance < 100) {
          newErrors.stablecoinBalance =
            'Minimum balance is $100 for meaningful testing';
        } else if (balance > 1000000) {
          newErrors.stablecoinBalance =
            'Maximum balance is $1,000,000 for paper trading';
        }
      }
    }

    setErrors(newErrors);
    return {
      isValid: Object.keys(newErrors).length === 0,
      errors: newErrors,
    };
  };

  // API Key format validation by exchange
  const validateApiKeyFormat = (
    _provider: ExchangeEnum,
    key: string
  ): { isValid: boolean; error?: string | undefined } => {
    const trimmedKey = key.trim();

    /*  switch (provider) {
      case ExchangeEnum.binanceAll:
      case ExchangeEnum.binanceSpot:
      case ExchangeEnum.binanceUsdm:
      case ExchangeEnum.binanceCoinm:
        if (trimmedKey.length !== 64) {
          return {
            isValid: false,
            error: 'Binance API key should be 64 characters long',
          };
        }
        if (!/^[A-Za-z0-9]+$/.test(trimmedKey)) {
          return {
            isValid: false,
            error: 'Binance API key should contain only letters and numbers',
          };
        }
        break;

      case ExchangeEnum.bybit:
        if (trimmedKey.length < 20 || trimmedKey.length > 30) {
          return {
            isValid: false,
            error: 'Bybit API key should be 20-30 characters long',
          };
        }
        break;

      case ExchangeEnum.okx:
        if (trimmedKey.length < 32 || trimmedKey.length > 40) {
          return {
            isValid: false,
            error: 'OKX API key should be 32-40 characters long',
          };
        }
        break;

      case ExchangeEnum.coinbase:
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            trimmedKey
          )
        ) {
          return {
            isValid: false,
            error: 'Coinbase API key should be in UUID format',
          };
        }
        break;

      default:
        if (trimmedKey.length < 10) {
          return {
            isValid: false,
            error: 'API key seems too short (minimum 10 characters)',
          };
        }
        if (trimmedKey.length > 100) {
          return {
            isValid: false,
            error: 'API key seems too long (maximum 100 characters)',
          };
        }
    } */

    return { isValid: trimmedKey.length > 0 };
  };

  // API Secret format validation by exchange
  const validateApiSecretFormat = (
    _provider: ExchangeEnum,
    secret: string
  ): { isValid: boolean; error?: string | undefined } => {
    const trimmedSecret = secret.trim();

    /* switch (provider) {
      case ExchangeEnum.binanceAll:
      case ExchangeEnum.binanceSpot:
      case ExchangeEnum.binanceUsdm:
      case ExchangeEnum.binanceCoinm:
        if (trimmedSecret.length !== 64) {
          return {
            isValid: false,
            error: 'Binance API secret should be 64 characters long',
          };
        }
        if (!/^[A-Za-z0-9+/=]+$/.test(trimmedSecret)) {
          return {
            isValid: false,
            error: 'Binance API secret contains invalid characters',
          };
        }
        break;

      case ExchangeEnum.coinbase:
        if (!/^[A-Za-z0-9+/=]+$/.test(trimmedSecret)) {
          return {
            isValid: false,
            error: 'Coinbase API secret should be base64 encoded',
          };
        }
        if (trimmedSecret.length < 40) {
          return {
            isValid: false,
            error: 'Coinbase API secret seems too short',
          };
        }
        break;

      default:
        if (trimmedSecret.length < 20) {
          return {
            isValid: false,
            error: 'API secret seems too short (minimum 20 characters)',
          };
        }
        if (trimmedSecret.length > 200) {
          return {
            isValid: false,
            error: 'API secret seems too long (maximum 200 characters)',
          };
        }
    } */

    return { isValid: trimmedSecret.length > 0 };
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateForm();
    if (!validation.isValid) {
      return;
    }

    try {
      setConnectionStatus({ isConnecting: true, isValidating: false });

      // For edit mode with paper trading, use topUpAmount if specified.
      // When the user didn't enter a top-up amount, clear the seed
      // value (`'10000'` from the form's initial state) so the update
      // mutation doesn't silently re-credit the paper account every
      // time the user changes an unrelated setting like hedge mode.
      const submissionData = { ...formData };
      if (mode === 'edit' && formData.isPaperTrading) {
        const parsed = parseFloat(topUpAmount);
        submissionData.stablecoinBalance =
          Number.isFinite(parsed) && parsed > 0 ? topUpAmount : '';
      }

      // Independent funding for a paper `SPOT & Futures` create — one entry
      // per created sub-account. Single-market selections leave this unset
      // and keep using coinToTopUp/stablecoinBalance.
      if (paperAllSubAccounts.length > 0) {
        submissionData.paperTopUps = paperAllSubAccounts.map((id) => ({
          provider: id,
          asset: paperTopUps[id]?.asset ?? '',
          amount: paperTopUps[id]?.amount ?? '',
        }));
      }

      // Track top up event for paper trading exchanges
      if (formData.isPaperTrading || isPaperExchange(formData.provider)) {
        analyticsTrack('top_up_initiated', {
          location: 'exchange_form',
          exchange: formData.provider,
          asset: formData.coinToTopUp,
          amount: parseFloat(submissionData.stablecoinBalance),
          mode: mode,
        });
      }

      await onSubmit(submissionData);
    } catch (error) {
      setConnectionStatus({
        isConnecting: false,
        isValidating: false,
        connectionError:
          error instanceof Error ? error.message : 'Connection failed',
      });
    }
  };

  // Initialize paper trading assets for edit mode (only for non-All exchanges)
  useEffect(() => {
    // Only run this for edit mode when we have a provider and are in paper trading mode
    // Skip for "All" exchanges which don't need asset selection
    if (
      mode === 'edit' &&
      formData.isPaperTrading &&
      formData.provider &&
      !formData.provider.includes('All')
    ) {
      logger.debug(
        'ExchangeForm: Initializing paper trading assets for edit mode',
        {
          provider: formData.provider,
          currentCoinToTopUp: formData.coinToTopUp,
        }
      );

      const config = getExchangeConfig(formData.provider);
      if (config) {
        const assets = getPaperTradingAssets(
          getEffectivePaperBrand(config.name, formData.okxSource)
        );
        logger.debug('ExchangeForm: Got paper trading assets', {
          exchangeName: config.name,
          assetsCount: assets.length,
          assets: assets.map((a) => a.symbol),
        });

        // If coinToTopUp is not set or not in the available assets, set it to the first asset
        if (assets.length > 0) {
          const hasValidAsset = assets.some(
            (a) => a.symbol === formData.coinToTopUp
          );
          if (!hasValidAsset || !formData.coinToTopUp) {
            logger.info(
              'ExchangeForm: Setting coinToTopUp to first available asset',
              {
                from: formData.coinToTopUp,
                to: assets[0].symbol,
              }
            );
            setFormData((prev) => ({
              ...prev,
              coinToTopUp: assets[0].symbol,
            }));
          }
        }
      }
    }
  }, [mode, formData.isPaperTrading, formData.provider, formData.coinToTopUp]);

  const isSubmitDisabled =
    isLoading ||
    connectionStatus.isConnecting ||
    connectionStatus.isValidating ||
    hyperliquidSetupStatus === 'connecting' ||
    hyperliquidSetupStatus === 'approving';

  return (
    <form onSubmit={handleSubmit} className="space-y-lg">
      {/* Connection Status Alert */}
      {connectionStatus.connectionError && (
        <div className="flex items-center p-md text-red-800 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/20 dark:border-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
          <p className="text-sm">{connectionStatus.connectionError}</p>
        </div>
      )}

      {/* Paper/Live Switch */}
      <Tabs
        value={formData.isPaperTrading ? 'paper' : 'live'}
        onValueChange={(value) => handlePaperTradingToggle(value === 'paper')}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="paper" disabled={mode === 'edit'}>
            Paper Trading
          </TabsTrigger>
          <TabsTrigger value="live" disabled={mode === 'edit'}>
            Live Trading
          </TabsTrigger>
        </TabsList>

        {/* Exchange Selection and Name - Outside tabs but within Tabs wrapper */}
        <div className="space-y-md mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Exchange Selection */}
            <div className="space-y-xs">
              <Label htmlFor="provider">Exchange</Label>
              <Select
                value={formData.provider}
                onValueChange={(value) => {
                  logger.info('Select value changed to:', value);
                  handleProviderChange(value as ExchangeEnum);
                }}
                disabled={mode === 'edit'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an exchange">
                    {(() => {
                      const config = getExchangeConfig(formData.provider);
                      return config?.displayName || 'Select an exchange';
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {accessibleExchanges.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      <div className="flex items-center gap-xs">
                        <span>{config.displayName}</span>
                        {isTrialGated(config.id) ? (
                          <Badge variant="secondary" className="text-xs">
                            Trial
                          </Badge>
                        ) : (
                          config.popular && (
                            <Badge variant="secondary" className="text-xs">
                              Popular
                            </Badge>
                          )
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {blockedExchanges.map((config) => (
                    <SelectItem key={config.id} value={config.id} disabled>
                      <div className="flex items-center gap-xs">
                        <span className="text-muted-foreground">
                          {config.displayName} (upgrade to use)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.provider && (
                <p className="text-sm text-destructive">{errors.provider}</p>
              )}
              {/* Connect guide — only relevant for live exchanges. Paper
                  exchanges need no API connection, so the "Connect to X"
                  article is hidden there (the paper-trading guide link below
                  covers that flow instead). */}
              {!formData.isPaperTrading &&
                !isPaperExchange(formData.provider) &&
                (() => {
                  const helpPath = getExchangeHelpPath(exchangeConfig?.name);
                  if (!helpPath) {
                    return null;
                  }

                  return (
                    <div className="mt-xs">
                      <HelpArticlePill url={helpPath} />
                    </div>
                  );
                })()}
            </div>

            {/* Exchange Name */}
            <div className="space-y-xs">
              <Label htmlFor="name">Exchange Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                placeholder="Enter a name for this exchange"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>
          </div>

          {/* Independent funding rows — a `SPOT & Futures` create makes one
              paper account per market (SPOT / USDⓈ-M / COIN-M), each funded
              on its own. COIN-M is coin-margined (fund with BTC/ETH). */}
          {formData.isPaperTrading && paperAllSubAccounts.length > 0 && (
            <div className="space-y-md">
              <p className="text-sm text-muted-foreground">
                This creates a separate paper account per market — set the
                funding for each below.
              </p>
              {paperAllSubAccounts.map((id) => {
                const assets = getSubAccountTopUpAssets(
                  id,
                  getEffectivePaperBrand(
                    exchangeConfig?.name ?? 'binance',
                    formData.okxSource
                  )
                );
                const row = paperTopUps[id] ?? { asset: '', amount: '' };
                const rowError = errors.paperTopUps?.[id];
                return (
                  <div key={id} className="space-y-xs">
                    <Label>{getPaperSubAccountLabel(id)}</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                      <Select
                        value={row.asset}
                        onValueChange={(value) =>
                          updatePaperTopUp(id, { asset: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an asset" />
                        </SelectTrigger>
                        <SelectContent>
                          {assets.map((asset) => (
                            <SelectItem key={asset.symbol} value={asset.symbol}>
                              <div className="flex items-center gap-xs">
                                <span className="font-medium">
                                  {asset.symbol}
                                </span>
                                <span className="text-muted-foreground text-sm">
                                  {asset.name}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={row.amount}
                        onChange={(e) =>
                          updatePaperTopUp(id, { amount: e.target.value })
                        }
                        placeholder="0"
                        min="0"
                        step="0.01"
                        aria-label={`Starting ${row.asset} balance`}
                        className={rowError ? 'border-destructive' : ''}
                      />
                    </div>
                    {rowError && (
                      <p className="text-sm text-destructive">{rowError}</p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                <a
                  href="/help/paper-trading-forward-testing"
                  className="text-primary underline hover:text-primary/80"
                >
                  Paper trading guide
                </a>
              </p>
            </div>
          )}

          {/* Asset to Top Up and Token Balance - single-market paper
              selections (and edit mode) keep one asset + balance field. */}
          {formData.isPaperTrading && paperAllSubAccounts.length === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {/* Paper Trading Asset Selection */}
              <div className="space-y-xs">
                <Label htmlFor="coin-to-top-up">Asset to Top Up</Label>
                <Select
                  value={formData.coinToTopUp}
                  onValueChange={(value) =>
                    updateFormData({ coinToTopUp: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an asset" />
                  </SelectTrigger>
                  <SelectContent>
                    {paperTradingAssets.map((asset) => (
                      <SelectItem key={asset.symbol} value={asset.symbol}>
                        <div className="flex items-center gap-xs">
                          <span className="font-medium">{asset.symbol}</span>
                          <span className="text-muted-foreground text-sm">
                            {asset.name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.coinToTopUp && (
                  <p className="text-sm text-destructive">
                    {errors.coinToTopUp}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  <a
                    href="/help/paper-trading-forward-testing"
                    className="text-primary underline hover:text-primary/80"
                  >
                    Paper trading guide
                  </a>
                </p>
              </div>

              {/* Paper Trading Balance - Starting balance for add mode, top-up amount for edit mode */}
              {mode === 'add' ? (
                <div className="space-y-xs">
                  <Label htmlFor="balance">
                    Starting {formData.coinToTopUp} Balance
                  </Label>
                  <Input
                    id="balance"
                    type="number"
                    value={formData.stablecoinBalance}
                    onChange={(e) =>
                      updateFormData({ stablecoinBalance: e.target.value })
                    }
                    placeholder="10000"
                    min="0"
                    step="0.01"
                    className={
                      errors.stablecoinBalance ? 'border-destructive' : ''
                    }
                  />
                  {errors.stablecoinBalance && (
                    <p className="text-sm text-destructive">
                      {errors.stablecoinBalance}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-xs">
                  <Label htmlFor="topup-amount">
                    Amount to Add ({formData.coinToTopUp})
                  </Label>
                  <Input
                    id="topup-amount"
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter amount to top up this exchange
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab Contents for API credentials */}
        <TabsContent value="paper" className="space-y-md mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Placeholder or additional paper trading settings can go here */}
          </div>
        </TabsContent>

        <TabsContent value="live" className="space-y-md mt-4">
          {/* Hyperliquid Integration Type */}
          {isHyperliquid && (
            <div className="space-y-md">
              <div className="space-y-xs">
                <Label>Integration type</Label>
                <div className="flex gap-xs">
                  <Button
                    type="button"
                    variant={
                      !formData.useApproveBuilderFees ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() =>
                      updateFormData({ useApproveBuilderFees: false })
                    }
                    disabled={!isPaidUser}
                  >
                    Regular (for paid users only)
                  </Button>
                  <Button
                    type="button"
                    variant={
                      formData.useApproveBuilderFees ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() =>
                      updateFormData({ useApproveBuilderFees: true })
                    }
                  >
                    Free (approve builder fees)
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                You can use Hyperliquid for unlimited trading. We will add
                builder fees to your trades: 0.07% for spot and 0.045% for
                perpetuals (fee will be added only when fee asset is USDC). No
                credits will be used to run your bots.{' '}
                <a
                  href="/help/unlimited-trading-hyperliquid"
                  className="text-primary underline hover:text-primary/80"
                >
                  Learn more
                </a>
              </p>

              {/* Web3 Wallet Connection — available for both Regular (paid)
                  and Free integration types. Builder fees are only approved
                  in Free mode. */}
              <div className="space-y-sm">
                  <p className="text-sm">
                    Connect your Web3 wallet to automatically set up Hyperliquid
                    trading. This will:
                  </p>
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    <li>
                      Connect to your wallet (MetaMask, Bitget, OKX, etc.)
                    </li>
                    <li>Switch to Arbitrum network</li>
                    <li>Create and approve an agent wallet for trading</li>
                    {formData.useApproveBuilderFees && <li>Approve builder fees</li>}
                  </ul>

                  <div className="flex gap-sm mt-sm">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={handleOpenWalletSelector}
                      disabled={
                        hyperliquidSetupStatus === 'connecting' ||
                        hyperliquidSetupStatus === 'approving' ||
                        hyperliquidSetupStatus === 'success' ||
                        web3Wallet.isLoading
                      }
                    >
                      {hyperliquidSetupStatus === 'connecting' && (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting Wallet...
                        </>
                      )}
                      {hyperliquidSetupStatus === 'approving' && (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Approving Agent...
                        </>
                      )}
                      {hyperliquidSetupStatus === 'success' && '✓ Connected'}
                      {(hyperliquidSetupStatus === 'idle' ||
                        hyperliquidSetupStatus === 'error') &&
                        'Connect Web3 Wallet'}
                    </Button>
                    {web3Wallet.walletState.isConnected && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          web3Wallet.disconnectWallet();
                          setHyperliquidSetupStatus('idle');
                          setHyperliquidError(null);
                        }}
                        disabled={
                          hyperliquidSetupStatus === 'connecting' ||
                          hyperliquidSetupStatus === 'approving'
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>

                  {web3Wallet.error && (
                    <div className="flex items-center p-md text-red-800 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/20 dark:border-red-800 dark:text-red-200">
                      <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
                      <p className="text-sm">{web3Wallet.error}</p>
                    </div>
                  )}
                  {hyperliquidError && (
                    <div className="flex items-center p-md text-red-800 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/20 dark:border-red-800 dark:text-red-200">
                      <AlertCircle className="h-4 w-4 mr-2 shrink-0" />
                      <p className="text-sm">{hyperliquidError}</p>
                    </div>
                  )}
                  {web3Wallet.walletState.isConnected && (
                    <div className="flex items-center p-md text-blue-800 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-200">
                      <p className="text-sm">
                        Connected: {web3Wallet.walletState.account?.slice(0, 6)}
                        ...
                        {web3Wallet.walletState.account?.slice(-4)}
                        {!web3Wallet.walletState.isCorrectChain &&
                          ' (Wrong network - please switch to Arbitrum)'}
                      </p>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* API credentials - hidden for Hyperliquid with builder fees */}
          {showHyperliquidKeys && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {/* API Key */}
              <div className="space-y-xs">
                <Label htmlFor="api-key">
                  {isHyperliquid ? 'Wallet' : 'API Key'}
                </Label>
                <Input
                  id="api-key"
                  name="api-key"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={formData.key}
                  onChange={(e) => updateFormData({ key: e.target.value })}
                  placeholder="Enter your API key"
                  className={errors.key ? 'border-destructive' : ''}
                />
                {errors.key && (
                  <p className="text-sm text-destructive">{errors.key}</p>
                )}
              </div>

              {/* API Secret */}
              <div className="space-y-xs">
                <Label htmlFor="api-secret">
                  {isHyperliquid ? 'Private key' : 'API Secret'}
                </Label>
                <div className="relative">
                  <Input
                    id="api-secret"
                    name="api-secret"
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={formData.secret}
                    onChange={(e) => updateFormData({ secret: e.target.value })}
                    placeholder={
                      mode === 'edit'
                        ? '•••••••••••• — leave blank to keep current'
                        : 'Enter your API secret'
                    }
                    className={`pr-10 ${errors.secret ? 'border-destructive' : ''}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.secret && (
                  <p className="text-sm text-destructive">{errors.secret}</p>
                )}
              </div>

              {/* Passphrase (for exchanges that require it) */}
              {exchangeConfig && requiresPassphrase(formData.provider) && (
                <div className="space-y-xs md:col-span-2">
                  <Label htmlFor="passphrase">Passphrase</Label>
                  <div className="relative">
                    <Input
                      id="passphrase"
                      type={showPassphrase ? 'text' : 'password'}
                      value={formData.passphrase || ''}
                      onChange={(e) =>
                        updateFormData({ passphrase: e.target.value })
                      }
                      placeholder={
                        mode === 'edit'
                          ? '•••••••••••• — leave blank to keep current'
                          : 'Enter your passphrase'
                      }
                      className={`pr-10 ${errors.passphrase ? 'border-destructive' : ''}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                    >
                      {showPassphrase ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.passphrase && (
                    <p className="text-sm text-destructive">
                      {errors.passphrase}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sub-account toggle for Hyperliquid (only when API keys are shown) */}
          {isHyperliquid && showHyperliquidKeys && (
            <div className="flex items-center gap-sm mt-md">
              <Switch
                id="subaccount"
                checked={formData.subaccount || false}
                onCheckedChange={(checked) =>
                  updateFormData({ subaccount: checked })
                }
              />
              <Label htmlFor="subaccount">Sub-account</Label>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Advanced Settings */}
      {exchangeConfig && (
        <div className="space-y-md">
          <h3 className="text-lg font-medium">Advanced Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {/* Coinbase Key Types */}
            {supportsKeyTypes(formData.provider) && (
              <div className="space-y-xs">
                <Label htmlFor="keys-type">Key Type</Label>
                <Select
                  value={formData.keysType || ''}
                  onValueChange={(value) =>
                    updateFormData({ keysType: value as CoinbaseKeysType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {coinbaseKeyTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Host Selection */}
            {supportsHostSelection(formData.provider) &&
              hostOptions.length > 0 && (
                <div className="space-y-xs">
                  <Label htmlFor="host">
                    {exchangeConfig.name === 'okx'
                      ? 'OKX Origin'
                      : 'Bybit Origin'}
                  </Label>
                  <Select
                    value={
                      exchangeConfig.name === 'okx'
                        ? formData.okxSource || ''
                        : formData.bybitHost || ''
                    }
                    onValueChange={(value) => {
                      if (exchangeConfig.name === 'okx') {
                        const updates: Partial<ExchangeFormData> = {
                          okxSource: value as OKXSource,
                        };
                        // OKX Europe (my.okx.com) futures are the linear,
                        // USDC-settled X-Perps — supported on the okxLinear
                        // rail. The EU venue has no coin-margined (inverse)
                        // product, so only correct an Inverse selection to
                        // Linear; Spot/Linear/All stay as picked (the backend
                        // creates the spot + linear legs only for EU).
                        if (value === OKXSource.my) {
                          if (formData.provider === ExchangeEnum.okxInverse) {
                            updates.provider = ExchangeEnum.okxLinear;
                          }
                          if (
                            formData.provider === ExchangeEnum.paperOkxInverse
                          ) {
                            updates.provider = ExchangeEnum.paperOkxLinear;
                          }
                        }
                        // Origin change swaps the funding-asset universe for a
                        // paper add (EU has no USDT) — re-seed the single-account
                        // default so a stale USDT pick can't linger.
                        if (formData.isPaperTrading && exchangeConfig) {
                          const assets = getPaperTradingAssets(
                            getEffectivePaperBrand(
                              exchangeConfig.name,
                              value as OKXSource
                            )
                          );
                          if (assets.length > 0) {
                            updates.coinToTopUp = assets[0].symbol;
                            updates.stablecoinBalance =
                              assets[0].defaultBalance;
                          }
                        }
                        updateFormData(updates);
                      } else {
                        updateFormData({ bybitHost: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hostOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* OKX Europe (my.okx.com) has a restricted product set that
                      differs from the global venue — surface it so EU users aren't
                      confused when the pair list looks different. Informational
                      only; it doesn't block adding the account. */}
                  {exchangeConfig.name === 'okx' &&
                    formData.okxSource === OKXSource.my && (
                      <div className="flex items-start gap-2 rounded-md bg-surface-2 p-sm text-xs text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          OKX Europe offers a restricted product set. Through
                          Gainium you can trade <strong>USDC/EUR spot</strong>{' '}
                          pairs and <strong>X-Perp futures</strong> on EU
                          accounts — USDT pairs and coin-margined (inverse)
                          contracts aren&apos;t available.
                        </span>
                      </div>
                    )}
                </div>
              )}

            {/* Hedge Mode — futures only */}
            {isFuturesExchange(formData.provider) && (
              <div className="flex items-center justify-between md:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="hedge-mode">Hedge Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable hedging for this exchange
                  </p>
                </div>
                <Switch
                  id="hedge-mode"
                  checked={formData.hedgeMode}
                  disabled={hedgeModePending}
                  onCheckedChange={handleHedgeToggle}
                />
              </div>
            )}

            {/* Ignore Fees — only on supported exchanges */}
            {showZeroFee(formData.provider) && (
              <div className="flex items-center justify-between md:col-span-2">
                <div className="space-y-0.5">
                  <Label htmlFor="ignore-fees">Ignore Fees</Label>
                  <p className="text-sm text-muted-foreground">
                    Don't include trading fees in calculations
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <a
                      href="/help/ignore-exchange-fees"
                      className="text-primary underline hover:text-primary/80"
                    >
                      Learn more
                    </a>
                  </p>
                </div>
                <Switch
                  id="ignore-fees"
                  checked={formData.ignoreFees}
                  disabled={ignoreFeesPending}
                  onCheckedChange={handleIgnoreFeesToggle}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form Actions - Hidden when Hyperliquid uses Web3 wallet flow */}
      {showHyperliquidKeys && (
        <div className="flex flex-col sm:flex-row justify-end gap-xs sm:gap-sm pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitDisabled}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full sm:w-auto sm:min-w-[120px] order-1 sm:order-2"
          >
            {connectionStatus.isConnecting
              ? 'Connecting...'
              : connectionStatus.isValidating
                ? 'Validating...'
                : mode === 'edit'
                  ? 'Update Exchange'
                  : 'Add Exchange'}
          </Button>
        </div>
      )}

      {/* WalletSelectorDialog for Hyperliquid */}
      <WalletSelectorDialog
        open={walletSelectorOpen}
        onClose={() => setWalletSelectorOpen(false)}
        onSelectWallet={(wallet) => setupHyperliquidWeb3(wallet)}
        wallets={availableWallets}
      />

      {/* Start-trial prompt (cloud-only). Opens when a trial-eligible
          user picks a premium exchange; sh registers nothing. */}
      <Slot
        name="exchange.trialPrompt"
        open={trialPromptOpen}
        exchangeName={trialPromptExchange}
        onOpenChange={handleTrialPromptOpenChange}
        onTrialStarted={handleTrialStarted}
      />
    </form>
  );
};

export default ExchangeForm;
