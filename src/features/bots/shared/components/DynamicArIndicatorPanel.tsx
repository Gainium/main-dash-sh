/**
 * DynamicArIndicatorPanel — shared "Dynamic ATR/ADR indicators"
 * configuration block used by both TakeProfit and StopLoss settings.
 *
 * Behavior mirrors the original inline block in TakeProfitSettings.tsx
 * (`isDynamicArClose && !isDealEdit` → SettingsRow with Add button,
 * description, IndicatorList, "When indicators trigger close by" Select
 * and the empty-section alert). All section-specific bits (filter,
 * indicator creation, copy text, navigation id) are driven by props.
 *
 * The component owns its own indicator-selector instance and favorites,
 * so callers don't have to pass them in.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DynamicArIndicatorConfig } from '@/components/indicators/DynamicArIndicatorConfig';
import { IndicatorList } from '@/components/indicators/IndicatorList';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  useBotFormState,
} from '@/contexts/bots/form/BotFormProvider';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { useIndicatorSelector } from '@/hooks/useIndicatorSelector';
import {
  CloseConditionEnum,
  CloseDCATypeEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  indicatorsLimit,
  type ExchangeInUser,
} from '@/types';
import {
  DYNAMIC_AR_ALLOWED_TYPES,
  buildIndicatorConfig,
  isCloseIndicatorOfSection,
  isCloseIndicatorUsedByCondition,
  sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { getIndicatorDefaultParams } from '@/types/indicators/indicatorLogic';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import React, { useCallback, useMemo } from 'react';

/**
 * Clamp a free-form dynamic-AR factor input to the [0.1, 10] band the
 * server accepts. Mirrors `sanitizeDynamicArFactor` in TakeProfitSettings.
 */
const sanitizeDynamicArFactor = (
  value: string | number | null | undefined
): string => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '1';
  }
  const clamped = Math.min(Math.max(parsed, 0.1), 10);
  return clamped.toFixed(2);
};

const createIndicatorId = (section: IndicatorSection): string => {
  const prefix =
    section === IndicatorSection.sl ? 'sl-indicator' : 'close-indicator';
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
};

interface DynamicArIndicatorPanelProps {
  /** Which form section this panel manages. Drives both the indicator
   *  filter and the section value stamped onto newly-created records. */
  section: IndicatorSection.tp | IndicatorSection.sl;
  /** Wrap-element class forwarded to SettingsRow (used to dim the row
   *  while a parent gate disables interaction). */
  interactionDisabledClass?: string;
  /** Current exchange — passed through to the per-indicator config so
   *  exchange-specific defaults are picked correctly. */
  currentExchange?: ExchangeInUser | null;
  /** Suppress the whole panel in deal-edit mode. Callers can render the
   *  panel unconditionally and let the prop hide it where appropriate. */
  isDealEdit?: boolean;
}

export const DynamicArIndicatorPanel: React.FC<
  DynamicArIndicatorPanelProps
> = ({
  section,
  interactionDisabledClass,
  currentExchange,
  isDealEdit = false,
}) => {
  const indicators = useBotFormSelector('indicators');
  const closeDealType = useBotFormSelector('closeDealType');
  const { updateFormData } = useBotFormState();

  // Indicator-picker plumbing — pre-filter the type list to ATR/ADR.
  const { openSelector, selector } = useIndicatorSelector(
    DYNAMIC_AR_ALLOWED_TYPES
  );
  const {
    favorites: favoriteIndicatorTypes,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();

  // This section's close-deal indicators that dynamic AR can actually USE —
  // the same pair of rules validation and the payload mapper apply. Switching
  // close condition is deliberately lossless, so the section may still hold
  // the Indicators tab's grouped entries; matching on action+section alone
  // listed those here too, under a mode that never reads them.
  const closeIndicators = useMemo<IndicatorConfig[]>(
    () =>
      indicators.filter(
        (i) =>
          isCloseIndicatorOfSection(i, section) &&
          isCloseIndicatorUsedByCondition(i, CloseConditionEnum.dynamicAr)
      ),
    [indicators, section]
  );

  const indicatorLimitReached = useMemo(
    () => indicators.length >= indicatorsLimit,
    [indicators.length]
  );

  // ─── Per-section copy ───────────────────────────────────────────
  const isTp = section === IndicatorSection.tp;
  const target = isTp ? 'take profit' : 'stop loss';
  const emptyState = `No ATR/ADR indicators configured. Add ATR or ADR to enable dynamic ${target}.`;
  const missingAlertDescription = `Dynamic ATR/ADR requires at least one ATR or ADR indicator. Add an indicator to compute ${target} distance.`;
  const tooltip = `Use ATR or ADR indicators to drive dynamic ${target}. Each indicator multiplies its value by the configured factor.`;
  const navId = isTp ? 'take-profit-advanced' : 'stop-loss-advanced';

  // ─── Handlers ──────────────────────────────────────────────────
  const launchSelector = useCallback(
    (onSelect: (type: IndicatorEnum) => void) => {
      openSelector({
        allowedActions: [IndicatorAction.closeDeal],
        favorites: favoriteIndicatorTypes,
        onToggleFavorite: (type, next) => toggleFavorite(type, next),
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
        title: 'Select ATR/ADR indicator',
        description: 'Dynamic ATR/ADR requires ATR or ADR indicators.',
        onSelect,
      });
    },
    [
      favoriteIndicatorTypes,
      favoritesMutating,
      isIndicatorMutating,
      openSelector,
      toggleFavorite,
    ]
  );

  const handleAddIndicator = useCallback(() => {
    if (indicatorLimitReached) {
      return;
    }
    launchSelector((type) => {
      if (!DYNAMIC_AR_ALLOWED_TYPES.includes(type)) {
        return;
      }
      const defaults = getIndicatorDefaultParams(
        type,
        IndicatorAction.closeDeal,
        section
      );
      const sanitized = sanitizeIndicatorParams(
        (defaults ?? {}) as IndicatorParamsState
      );
      const params: IndicatorParamsState = {
        ...sanitized,
        dynamicArFactor: sanitized['dynamicArFactor'] ?? '1',
      };
      const newIndicator = buildIndicatorConfig(type, params, {
        uuid: createIndicatorId(section),
        keepConditionBars: '0',
        indicatorAction: IndicatorAction.closeDeal,
        section,
      });
      updateFormData('indicators', [
        ...indicators,
        { ...newIndicator, ...params },
      ]);
    });
  }, [
    indicatorLimitReached,
    indicators,
    launchSelector,
    section,
    updateFormData,
  ]);

  const handleRemoveIndicator = useCallback(
    (id: string) => {
      updateFormData(
        'indicators',
        indicators.filter((i) => i.uuid !== id)
      );
    },
    [indicators, updateFormData]
  );

  const handleSelectIndicatorType = useCallback(
    (indicator: IndicatorConfig) => {
      launchSelector((type) => {
        if (!DYNAMIC_AR_ALLOWED_TYPES.includes(type)) {
          return;
        }
        const defaults = getIndicatorDefaultParams(
          type,
          IndicatorAction.closeDeal,
          section
        );
        const sanitized = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );
        const params: IndicatorParamsState = {
          ...sanitized,
          dynamicArFactor:
            sanitized['dynamicArFactor'] ??
            ((indicator ?? {}) as IndicatorParamsState)['dynamicArFactor'] ??
            '1',
        };
        const nextIndicator = buildIndicatorConfig(type, params, {
          uuid: indicator.uuid,
          keepConditionBars: indicator.keepConditionBars ?? '0',
          indicatorAction: IndicatorAction.closeDeal,
          section,
        });
        updateFormData(
          'indicators',
          indicators.map((candidate) =>
            candidate.uuid === indicator.uuid
              ? { ...candidate, ...nextIndicator, ...params }
              : candidate
          )
        );
      });
    },
    [indicators, launchSelector, section, updateFormData]
  );

  const handleChangeIndicatorParams = useCallback(
    (id: string, params: IndicatorParamsState) => {
      const sanitized = sanitizeIndicatorParams(params);
      updateFormData(
        'indicators',
        // SettingsIndicators stores params flat on the indicator object
        // (not under `.params`). Match the same shape TP's handlers use.
        indicators.map((indicator) =>
          indicator.uuid === id ? { ...indicator, ...sanitized } : indicator
        )
      );
    },
    [indicators, updateFormData]
  );

  const handleDynamicArFactorChange = useCallback(
    (id: string, value: string | number | null | undefined) => {
      const sanitized = sanitizeDynamicArFactor(value);
      updateFormData(
        'indicators',
        indicators.map((indicator) =>
          indicator.uuid === id
            ? { ...indicator, dynamicArFactor: sanitized }
            : indicator
        )
      );
    },
    [indicators, updateFormData]
  );

  const renderExtras = useCallback(
    (indicator: IndicatorConfig) => {
      // Only ATR/ADR reach the list, so every card gets the factor config.
      return (
        <DynamicArIndicatorConfig
          indicator={indicator}
          action={IndicatorAction.closeDeal}
          exchange={currentExchange?.provider}
          onChangeParams={(next) =>
            handleChangeIndicatorParams(indicator.uuid, next)
          }
          onChangeFactor={(value) =>
            handleDynamicArFactorChange(indicator.uuid, value)
          }
        />
      );
    },
    [
      currentExchange?.provider,
      handleChangeIndicatorParams,
      handleDynamicArFactorChange,
    ]
  );

  // ─── Close-deal-type options (Limit / Market) ──────────────────
  const closeDealTypeOptions = useMemo<
    Array<{ value: CloseDCATypeEnum; label: string; description: string }>
  >(
    () => [
      { value: CloseDCATypeEnum.closeByLimit, label: 'Limit', description: '' },
      {
        value: CloseDCATypeEnum.closeByMarket,
        label: 'Market',
        description: '',
      },
    ],
    []
  );

  if (isDealEdit) {
    return null;
  }

  return (
    <>
      <SettingsRow
        name="Dynamic ATR/ADR indicators"
        navId={navId}
        tooltip={tooltip}
        colSpan="full"
        {...(interactionDisabledClass
          ? { className: interactionDisabledClass }
          : {})}
        contentClassName="space-y-md"
        trailing={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddIndicator}
            disabled={indicatorLimitReached}
            title={
              indicatorLimitReached
                ? `Maximum of ${indicatorsLimit} indicators reached across the bot`
                : undefined
            }
          >
            Add indicator
          </Button>
        }
      >
        <IndicatorList
          indicators={closeIndicators}
          onRemove={handleRemoveIndicator}
          onSelectType={handleSelectIndicatorType}
          renderExtras={renderExtras}
          emptyState={emptyState}
        />

        <div className="space-y-xs">
          <Label
            htmlFor={`close-deal-type-dynamic-${section}`}
            className="text-sm"
          >
            When indicators trigger close by
          </Label>
          <Select
            value={closeDealType ?? CloseDCATypeEnum.closeByLimit}
            onValueChange={(value) =>
              updateFormData('closeDealType', value as CloseDCATypeEnum)
            }
          >
            <SelectTrigger
              id={`close-deal-type-dynamic-${section}`}
              className="w-full @[500px]:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {closeDealTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground/80">
                      {option.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {closeIndicators.length === 0 ? (
          <Alert
            variant="destructive"
            className="border-destructive/40 bg-destructive/10"
          >
            <AlertTitle className="text-sm font-semibold">
              Add an ATR or ADR indicator
            </AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              {missingAlertDescription}
            </AlertDescription>
          </Alert>
        ) : null}
      </SettingsRow>

      {selector}
    </>
  );
};

export default DynamicArIndicatorPanel;
