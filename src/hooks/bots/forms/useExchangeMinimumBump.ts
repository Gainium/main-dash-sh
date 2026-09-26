/**
 * useExchangeMinimumBump — silently raise persisted amount fields up to
 * the exchange/pair minimum when a bot form's exchange or pair changes.
 *
 * Bot forms persist last-used settings (investment, base order size,
 * step amount, grid budget, etc.) to local storage. When the user
 * returns or switches exchange/pair, the form rehydrates with those
 * values. If they're now below the exchange's per-pair minimum
 * (notional or quantity), the form would normally surface red
 * validation errors and block save. Instead, this hook bumps them up
 * the first time the exchange/pair pair lands in the precision map.
 *
 * Behavior:
 *  - Bump is one-directional: only RAISES below-min values, never
 *    lowers values that are above the new minimum.
 *  - Runs once per (exchangeUUID, pairKey, botType) combination —
 *    tracked via a sentinel ref so the bump doesn't fire repeatedly on
 *    every render or keystroke. The same sentinel covers initial
 *    hydration AND pair/exchange switches (both produce a new key).
 *  - When the user is actively editing a field below the minimum, the
 *    sentinel for the current pair has already fired, so we leave the
 *    field alone. The bump only fires the FIRST time pair metadata
 *    becomes available for a given pair/exchange.
 *  - Deferred until `pairPrecisionMap` actually has an entry for the
 *    active pair — handles the rehydration race where the form mounts
 *    before pair metadata arrives.
 *  - Reports each bump via an optional `onBump` callback so the form
 *    can surface a quiet helper text ("Adjusted to exchange minimum").
 *
 * Scope by bot type:
 *  - DCA (incl. terminal, hedgeDca leg): `dca.baseOrderSize`,
 *    `dca.orderSize` (when sized in quote/base/usd; percent modes
 *    skipped).
 *  - Combo (incl. hedgeCombo leg): same fields on the `combo` slice.
 *  - Grid: `grid.budget` against minQuoteAmount × levels (one quote
 *    minimum per grid order).
 *
 * Out of scope (intentional): `dca.ordersCount`, `stepScale`,
 * `volumeScale`, `step` — these are scalars, not amounts; the
 * exchange minimum doesn't constrain them. Lot-size step rounding for
 * baseOrderSize/orderSize in `base` mode rounds UP to the next valid
 * step so the bumped value stays exchange-legal.
 */
import { useEffect, useRef } from 'react';

import {
  useBotFormContext,
  useBotFormStoreApi,
  useBotFormStoreSelector,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  aggregatePrecisionConstraints,
  type AggregatedPrecision,
} from '@/features/bots/shared/utils/order-guard';
import logger from '@/lib/loggerInstance';
import { BotTypesEnum, OrderSizeTypeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export interface ExchangeMinimumBumpEvent {
  /** Form field that was bumped (e.g. 'baseOrderSize', 'budget'). */
  field: string;
  /** The original below-minimum value. */
  from: number;
  /** The new value (== exchange minimum, step-rounded up). */
  to: number;
  /** Unit label for display (e.g. 'USDT', 'BTC'). */
  unit?: string;
}

export interface UseExchangeMinimumBumpOptions {
  /**
   * Called once per bumped field. The same field may be reported
   * multiple times across different pair/exchange transitions.
   */
  onBump?: (event: ExchangeMinimumBumpEvent) => void;
}

/** Round `value` UP to the next multiple of `step`. */
const ceilToStep = (value: number, step: number | null | undefined): number => {
  if (!step || !Number.isFinite(step) || step <= 0) {
    return value;
  }
  return Math.ceil(value / step) * step;
};

/** Parse a string|number into a number, returning 0 for empty/invalid. */
const toNum = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Resolve the per-order minimum for a DCA/combo amount field given the
 * active `orderSizeType`. Returns `{ min, step, unit }` or null when
 * the unit is percent/free (no exchange minimum applies).
 */
const resolveDcaMinimum = (
  orderSizeType: OrderSizeTypeEnum | undefined,
  precision: AggregatedPrecision | null,
  assets: { base?: string; quote?: string }
): { min: number; step: number | null; unit?: string } | null => {
  if (!precision) {
    return null;
  }

  switch (orderSizeType) {
    case OrderSizeTypeEnum.quote:
    case OrderSizeTypeEnum.usd: {
      const min = precision.minQuoteAmount;
      if (typeof min !== 'number' || min <= 0) {
        return null;
      }
      return { min, step: null, unit: assets.quote };
    }
    case OrderSizeTypeEnum.base: {
      const min = precision.minBaseAmount;
      if (typeof min !== 'number' || min <= 0) {
        return null;
      }
      return { min, step: precision.baseStep, unit: assets.base };
    }
    case OrderSizeTypeEnum.percFree:
    case OrderSizeTypeEnum.percTotal:
    default:
      // Percent-of-balance modes are not constrained by the exchange's
      // per-order notional minimum at form-edit time.
      return null;
  }
};

export const useExchangeMinimumBump = (
  options?: UseExchangeMinimumBumpOptions
): void => {
  // Subscribe only to what decides WHETHER a bump pass runs (the sentinel
  // inputs + precision data). The amounts are read from the store when the
  // pass runs, so typing an amount does not re-render the form shell.
  const { setFormData, mode, setErrors } = useBotFormContext();
  const store = useBotFormStoreApi();
  const formType = useBotFormTopLevelSelector('type');
  const formPair = useBotFormTopLevelSelector('pair');
  const formExchangeUUID = useBotFormTopLevelSelector('exchangeUUID');
  const formPairPrecisionMap = useBotFormTopLevelSelector('pairPrecisionMap');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const dcaOrderSizeType = useBotFormStoreSelector(
    (s) => s.formData.dca?.orderSizeType
  );
  const comboOrderSizeType = useBotFormStoreSelector(
    (s) => s.formData.combo?.orderSizeType
  );
  const { currentExchange } = useBotFormQuery();

  // Sentinel key: bump fires once per unique combination of
  // (exchange, primary pair, botType, orderSizeType). A change to any
  // of these resets the sentinel and a new pass runs as soon as
  // precision data for the active pair arrives.
  const lastSentinelRef = useRef<string | null>(null);

  // Read-only mode and edit mode: don't touch fields the user already
  // committed to. The fix targets the create flow. Hedge legs mount
  // with `isNestedLeg=true` but they still want the bump — they
  // rehydrate from staged formData seeds that share the same below-min
  // hazard.
  const skip = mode !== 'create';

  useEffect(() => {
    if (skip) {
      return;
    }

    const formData = store.getState().formData;
    const botType = formData.type;
    const pair = formData.pair;
    const primaryPair = Array.isArray(pair) ? pair[0] : pair;
    const exchangeUUID =
      typeof formData.exchangeUUID === 'string' ? formData.exchangeUUID : '';

    if (!primaryPair || !exchangeUUID) {
      return;
    }

    const pairList = Array.isArray(pair) ? pair : [pair];
    const precisionMap = formData.pairPrecisionMap ?? {};
    if (Object.keys(precisionMap).length === 0) {
      // pair metadata hasn't arrived yet — defer.
      return;
    }

    const precision = aggregatePrecisionConstraints(pairList, precisionMap);
    if (!precision) {
      return;
    }
    const hasAnyMin =
      (precision.minQuoteAmount ?? 0) > 0 || (precision.minBaseAmount ?? 0) > 0;
    if (!hasAnyMin) {
      return;
    }

    const orderSizeType =
      botType === BotTypesEnum.combo
        ? formData.combo?.orderSizeType
        : formData.dca?.orderSizeType;

    const sentinel = [
      exchangeUUID,
      primaryPair,
      botType,
      botType === BotTypesEnum.grid ? '-' : String(orderSizeType ?? '-'),
    ].join('::');

    if (lastSentinelRef.current === sentinel) {
      return;
    }

    // Mark the sentinel BEFORE invoking setFormData so we don't fire
    // again on the next render that the bump itself triggers.
    lastSentinelRef.current = sentinel;

    if (botType === BotTypesEnum.dca || botType === BotTypesEnum.combo) {
      const slice: 'dca' | 'combo' =
        botType === BotTypesEnum.combo ? 'combo' : 'dca';
      const assets = {
        base: undefined as string | undefined,
        quote: undefined as string | undefined,
      };
      // Pull base/quote labels from the precisionMap key if possible.
      const firstMeta =
        (formData.pairMetadata ?? {})[primaryPair as string] ??
        Object.values(formData.pairMetadata ?? {})[0];
      if (firstMeta) {
        assets.base = firstMeta.baseAsset?.name;
        assets.quote = firstMeta.quoteAsset?.name;
      }

      const minInfo = resolveDcaMinimum(
        orderSizeType as OrderSizeTypeEnum | undefined,
        precision,
        assets
      );
      if (!minInfo) {
        return;
      }

      const baseOrderSize =
        botType === BotTypesEnum.combo
          ? formData.combo?.baseOrderSize
          : formData.dca?.baseOrderSize;
      const useDca =
        botType === BotTypesEnum.combo
          ? formData.combo?.useDca
          : formData.dca?.useDca;
      const orderSize =
        botType === BotTypesEnum.combo
          ? formData.combo?.orderSize
          : formData.dca?.orderSize;

      const bumps: Array<{
        field: 'baseOrderSize' | 'orderSize';
        from: number;
        to: number;
      }> = [];

      const baseOrderNum = toNum(baseOrderSize);
      if (baseOrderNum > 0 && baseOrderNum < minInfo.min) {
        const bumped = ceilToStep(minInfo.min, minInfo.step);
        bumps.push({
          field: 'baseOrderSize',
          from: baseOrderNum,
          to: bumped,
        });
      }

      // Only bump the DCA safety-order size when DCA is actually used —
      // otherwise the field is hidden and we'd be touching dead state.
      if (useDca) {
        const orderSizeNum = toNum(orderSize);
        if (orderSizeNum > 0 && orderSizeNum < minInfo.min) {
          const bumped = ceilToStep(minInfo.min, minInfo.step);
          bumps.push({
            field: 'orderSize',
            from: orderSizeNum,
            to: bumped,
          });
        }
      }

      if (bumps.length === 0) {
        return;
      }

      logger.info('[useExchangeMinimumBump] Bumping fields', {
        botType,
        slice,
        exchangeUUID,
        pair: primaryPair,
        orderSizeType,
        min: minInfo.min,
        bumps,
      });

      setFormData((prev) => {
        const next = { ...prev };
        const prevSlice = (next[slice] ?? {}) as
          | BotFormData['dca']
          | BotFormData['combo'];
        const merged: typeof prevSlice = { ...prevSlice };
        for (const bump of bumps) {
          (merged as Record<string, unknown>)[bump.field] = String(bump.to);
        }
        (next as Record<string, unknown>)[slice] = merged;
        return next;
      });

      // Pre-emptively clear any existing below-min errors on the
      // bumped fields so the validation effect doesn't get a chance
      // to render a red flash between this commit and the next.
      setErrors((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const bump of bumps) {
          if (bump.field in next) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (next as Record<string, unknown>)[bump.field];
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      if (options?.onBump) {
        for (const bump of bumps) {
          options.onBump({
            field: bump.field,
            from: bump.from,
            to: bump.to,
            ...(minInfo.unit ? { unit: minInfo.unit } : {}),
          });
        }
      }
      return;
    }

    if (botType === BotTypesEnum.grid) {
      // Grid budget must support `levels` orders, each ≥ minQuoteAmount.
      const _budget = formData.grid?.budget;
      const _levels = formData.grid?.levels;
      const budget = toNum(_budget);
      const levels = Math.max(1, Math.floor(toNum(_levels)) || 1);
      const minQuote = precision.minQuoteAmount;
      if (!(typeof minQuote === 'number' && minQuote > 0)) {
        return;
      }
      const minBudget = minQuote * levels;
      if (budget <= 0 || budget >= minBudget) {
        return;
      }
      const firstMeta =
        (formData.pairMetadata ?? {})[primaryPair as string] ??
        Object.values(formData.pairMetadata ?? {})[0];
      const unit = firstMeta?.quoteAsset?.name;

      logger.info('[useExchangeMinimumBump] Bumping grid budget', {
        exchangeUUID,
        pair: primaryPair,
        from: budget,
        to: minBudget,
        levels,
        minQuote,
      });

      setFormData((prev) => ({
        ...prev,
        grid: {
          ...prev.grid,
          budget: minBudget,
        },
      }));

      setErrors((prev) => {
        if (!('budget' in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete (next as Record<string, unknown>)['budget'];
        return next;
      });

      if (options?.onBump) {
        options.onBump({
          field: 'budget',
          from: budget,
          to: minBudget,
          ...(unit ? { unit } : {}),
        });
      }
    }
    // Amounts (baseOrderSize / orderSize / useDca / budget / levels) are not
    // dependencies on purpose: a pass acts only when the sentinel below
    // changes, and the sentinel is made of the values listed here.
  }, [
    skip,
    store,
    formType,
    formPair,
    formExchangeUUID,
    formPairPrecisionMap,
    formPairMetadata,
    dcaOrderSizeType,
    comboOrderSizeType,
    setFormData,
    setErrors,
    options,
    currentExchange?.uuid,
  ]);
};
