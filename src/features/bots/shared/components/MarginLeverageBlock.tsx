/**
 * MarginLeverageBlock — shared "Margin & Leverage" section for any bot form
 * (DCA, Combo, Grid) that operates on a futures exchange.
 *
 * Self-contained: reads everything from BotFormProvider + BotFormQueryProvider
 * via selectors, runs its own getLeverageBracket query, derives the per-pair
 * leverage cap and renders the same Margin Type selector + leverage
 * input/slider that lived inline in DCA's StrategySettings.tsx.
 *
 * Drop it inside a <SettingsRow name="Margin & Leverage" colSpan="full">.
 * Returns null when `futures=false` (so callers don't have to guard).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Label } from '@/components/ui/label';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import MarginTypeSelector from '@/components/widgets/bots/MarginTypeSelector';
import LeverageSlider from '@/components/widgets/shared/LeverageSlider';
import {
  useBotFormFieldLock,
  useBotFormSelector,
  useBotFormState,
} from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { useUIStore } from '@/stores/uiStore';
import {
  BotMarginTypeEnum,
  type ComboBot,
  type DCABot,
  type LeverageBracket,
} from '@/types';
import type { GridBot } from '@/types/gridBot';
import type { TradingPair } from '@/hooks/useTradingPairs';

interface MarginLeverageBlockProps {
  /**
   * Optional bot record. Used only to read `dealsInBot.active` so the margin
   * controls can lock once a bot has live deals. Safe to omit on create-mode.
   */
  bot?: DCABot | ComboBot | GridBot | null;
}

const resolveSelectedPairs = (
  pair: unknown,
  pairMetadata: Record<string, TradingPair> | undefined
): TradingPair[] => {
  if (!pairMetadata) return [];
  const pairs = (Array.isArray(pair) ? pair : pair ? [pair] : []).filter(
    (entry): entry is string => typeof entry === 'string' && !!entry
  );
  const result: TradingPair[] = [];
  for (const key of pairs) {
    const normalized = key.replace(/[\s\-/]/g, '').toUpperCase();
    const found =
      pairMetadata[normalized] ??
      pairMetadata[key] ??
      Object.values(pairMetadata).find((meta) => meta.pair === key);
    if (found) result.push(found);
  }
  return result;
};

export const MarginLeverageBlock: React.FC<MarginLeverageBlockProps> = ({
  bot = null,
}) => {
  const futures = useBotFormSelector('futures');
  const leverage = useBotFormSelector('leverage');
  const marginType = useBotFormSelector('marginType');
  const formPair = useBotFormSelector('pair');
  const formPairMetadata = useBotFormSelector('pairMetadata');
  const formExchangeUUID = useBotFormSelector('exchangeUUID');

  const { exchanges } = useBotFormQuery();
  const { updateFormData } = useBotFormState();
  const isFieldLocked = useBotFormFieldLock();
  const isLiveTrading = useUIStore((state) => state.isLiveTrading);
  const isPaperTrading = !isLiveTrading;

  const futuresEnabled = Boolean(futures);
  // `dealsInBot` lives on DCA/Combo bots; grid bots use a different schema
  // and simply report 0 active deals here.
  const activeDealsCount =
    (bot as { dealsInBot?: { active?: number } } | null)?.dealsInBot?.active ??
    0;

  const resolvedExchangeUuid = useMemo(() => {
    if (typeof formExchangeUUID !== 'string' || !formExchangeUUID.trim()) {
      return null;
    }
    const trimmed = formExchangeUUID.trim();
    if (!Array.isArray(exchanges) || exchanges.length === 0) return trimmed;
    return exchanges.find((ex) => ex.uuid === trimmed)?.uuid ?? trimmed;
  }, [exchanges, formExchangeUUID]);

  const selectedPairs = useMemo(
    () =>
      resolveSelectedPairs(
        formPair,
        formPairMetadata as Record<string, TradingPair> | undefined
      ),
    [formPair, formPairMetadata]
  );

  const shouldFetchLeverage = useMemo(
    () => futuresEnabled && !isPaperTrading && Boolean(resolvedExchangeUuid),
    [futuresEnabled, isPaperTrading, resolvedExchangeUuid]
  );

  const leverageQueryInput = useMemo(
    () => botQueries.getLeverageBracket({ uuid: resolvedExchangeUuid ?? '' }),
    [resolvedExchangeUuid]
  );

  const leverageQuery = useGraphQL<LeverageBracket[]>(
    'getLeverageBracket',
    leverageQueryInput,
    {
      enabled: shouldFetchLeverage && Boolean(resolvedExchangeUuid),
      staleTime: 5 * 60 * 1000,
    }
  );

  const leverageFetchState = useMemo(() => {
    if (!shouldFetchLeverage) {
      return {
        brackets: [] as LeverageBracket[],
        isLoading: false,
        error: null as string | null,
      };
    }
    const response = leverageQuery.data;
    const brackets =
      response?.status === 'OK' && Array.isArray(response.data)
        ? response.data
        : ([] as LeverageBracket[]);
    const errorMessage =
      response?.status === 'NOTOK'
        ? (response.reason ?? 'Failed to fetch leverage brackets.')
        : (leverageQuery.error?.message ?? null);
    return {
      brackets,
      isLoading: leverageQuery.isLoading || leverageQuery.isFetching,
      error: errorMessage,
    };
  }, [
    leverageQuery.data,
    leverageQuery.error,
    leverageQuery.isFetching,
    leverageQuery.isLoading,
    shouldFetchLeverage,
  ]);

  const leverageCapsBySymbol = useMemo(() => {
    if (!leverageFetchState.brackets.length) return null;
    const map = new Map<string, number>();
    for (const bracket of leverageFetchState.brackets) {
      if (!bracket?.symbol) continue;
      if (!Number.isFinite(bracket.leverage) || bracket.leverage <= 0) continue;
      const key = bracket.symbol.toUpperCase();
      const existing = map.get(key);
      map.set(
        key,
        typeof existing === 'number'
          ? Math.min(existing, bracket.leverage)
          : bracket.leverage
      );
    }
    return map;
  }, [leverageFetchState.brackets]);

  const crossSupportedByPairs = useMemo(() => {
    if (!selectedPairs.length) return true;
    return selectedPairs.every((pair) => pair.crossAvailable !== false);
  }, [selectedPairs]);

  const availableMarginTypes = useMemo(() => {
    const types: BotMarginTypeEnum[] = [BotMarginTypeEnum.isolated];
    if (crossSupportedByPairs && !isPaperTrading) {
      types.push(BotMarginTypeEnum.cross);
    }
    return types;
  }, [crossSupportedByPairs, isPaperTrading]);

  const rawMaxLeverage = useMemo(() => {
    if (!futuresEnabled) return 1;
    if (!selectedPairs.length) return 125;
    const caps = selectedPairs
      .map((pair) => {
        const symbol = pair?.pair?.toUpperCase?.();
        if (symbol && leverageCapsBySymbol?.has(symbol)) {
          const cap = leverageCapsBySymbol.get(symbol);
          if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
            return cap;
          }
        }
        const candidate = (pair as { maxLeverage?: number }).maxLeverage;
        return typeof candidate === 'number' &&
          Number.isFinite(candidate) &&
          candidate > 0
          ? candidate
          : null;
      })
      .filter((value): value is number => value !== null);
    return caps.length > 0 ? Math.min(...caps) : 125;
  }, [futuresEnabled, leverageCapsBySymbol, selectedPairs]);

  const maxLeverage = useMemo(
    () => Math.max(1, rawMaxLeverage),
    [rawMaxLeverage]
  );

  const normalizedLeverage = useMemo(() => {
    const parsed = Number(leverage);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(Math.round(parsed), 1), maxLeverage);
  }, [leverage, maxLeverage]);

  const marginControlsLocked = useMemo(
    () =>
      futuresEnabled &&
      (isFieldLocked('marginType') ||
        isFieldLocked('leverage') ||
        activeDealsCount > 0),
    [activeDealsCount, futuresEnabled, isFieldLocked]
  );

  const [leverageInputValue, setLeverageInputValue] = useState<string>(() =>
    String(normalizedLeverage)
  );

  useEffect(() => {
    setLeverageInputValue(String(normalizedLeverage));
  }, [normalizedLeverage]);

  const leverageExceedsMax = useMemo(() => {
    const parsed = Number(leverageInputValue);
    return Number.isFinite(parsed) && parsed > maxLeverage;
  }, [leverageInputValue, maxLeverage]);

  const leverageControlsDisabled = useMemo(
    () =>
      marginControlsLocked ||
      (shouldFetchLeverage && leverageFetchState.isLoading),
    [marginControlsLocked, shouldFetchLeverage, leverageFetchState.isLoading]
  );

  const marginNotices = useMemo(() => {
    if (!futuresEnabled) return [] as string[];
    const notices: string[] = [];
    if (isPaperTrading) {
      notices.push('Cross margin is not available while paper trading.');
    }
    if (!crossSupportedByPairs) {
      notices.push('Cross margin type is not available for selected symbols.');
    }
    if (shouldFetchLeverage && leverageFetchState.isLoading) {
      notices.push('Fetching leverage limits from your exchange…');
    }
    if (shouldFetchLeverage && leverageFetchState.error) {
      notices.push(leverageFetchState.error);
    }
    if (leverageExceedsMax) {
      notices.push(
        `Leverage cannot be higher than ${maxLeverage}x for the selected symbols.`
      );
    }
    if (marginControlsLocked) {
      notices.push(
        activeDealsCount > 0
          ? 'Margin settings are locked while the bot has active deals.'
          : 'Margin settings are currently locked by your configuration.'
      );
    }
    return notices;
  }, [
    activeDealsCount,
    crossSupportedByPairs,
    futuresEnabled,
    isPaperTrading,
    leverageExceedsMax,
    leverageFetchState.error,
    leverageFetchState.isLoading,
    marginControlsLocked,
    maxLeverage,
    shouldFetchLeverage,
  ]);

  const handleMarginTypeChange = useCallback(
    (next: BotMarginTypeEnum) => {
      if (marginControlsLocked) return;
      updateFormData('marginType', next);
    },
    [marginControlsLocked, updateFormData]
  );

  const handleLeverageChange = useCallback(
    (value: number) => {
      if (leverageControlsDisabled) return;
      if (!Number.isFinite(value)) return;
      const clamped = Math.min(Math.max(Math.round(value), 1), maxLeverage);
      setLeverageInputValue(String(clamped));
      updateFormData('leverage', clamped);
    },
    [leverageControlsDisabled, maxLeverage, updateFormData]
  );

  const handleLeverageInputChange = useCallback(
    (value: number | string) => {
      if (leverageControlsDisabled) return;
      if (typeof value === 'number') {
        const clamped = Math.min(Math.max(Math.round(value), 1), maxLeverage);
        setLeverageInputValue(String(clamped));
        updateFormData('leverage', clamped);
        return;
      }
      setLeverageInputValue(value);
    },
    [leverageControlsDisabled, maxLeverage, updateFormData]
  );

  const handleLeverageInputBlur = useCallback(() => {
    if (leverageControlsDisabled) return;
    const parsed = Number(leverageInputValue);
    if (!Number.isFinite(parsed)) {
      setLeverageInputValue(String(normalizedLeverage));
      return;
    }
    const clamped = Math.min(Math.max(Math.round(parsed), 1), maxLeverage);
    setLeverageInputValue(String(clamped));
    updateFormData('leverage', clamped);
  }, [
    leverageControlsDisabled,
    leverageInputValue,
    maxLeverage,
    normalizedLeverage,
    updateFormData,
  ]);

  if (!futuresEnabled) return null;

  return (
    <div className="space-y-md rounded-lg bg-muted p-md">
      <div className="space-y-xs">
        <div className="flex items-center gap-xs">
          <Label>Margin Type</Label>
          <Tooltip tooltip="Select how leverage is applied to your futures position.">
            <InfoIcon />
          </Tooltip>
        </div>
        <MarginTypeSelector
          marginType={marginType}
          onMarginTypeChange={handleMarginTypeChange}
          availableTypes={availableMarginTypes}
          disabled={availableMarginTypes.length <= 1 || marginControlsLocked}
        />
        {marginNotices.length > 0 && (
          <div className="space-y-xs">
            {marginNotices.map((notice) => (
              <SettingsAlert key={notice} variant="warning" title={notice} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-xs">
        <div className="flex items-center gap-xs">
          <Label>Leverage</Label>
          <Tooltip tooltip="Set the leverage multiplier for your futures position. Higher leverage increases both potential profit and risk.">
            <InfoIcon />
          </Tooltip>
        </div>
        <LeverageSlider
          value={normalizedLeverage}
          onChange={handleLeverageChange}
          inputValue={leverageInputValue}
          onInputChange={handleLeverageInputChange}
          onInputBlur={handleLeverageInputBlur}
          min={1}
          max={maxLeverage}
          disabled={leverageControlsDisabled}
        />
        <p className="text-xs text-muted-foreground">
          Max available leverage: {maxLeverage}×
        </p>
      </div>
    </div>
  );
};

export default MarginLeverageBlock;
