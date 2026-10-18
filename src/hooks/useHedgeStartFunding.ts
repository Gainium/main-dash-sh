// React bindings for the hedge start dialog (spot hedge legs, main-app spec
// 044 phase 3): each leg's ladder totals, read off the same example orders the
// bot form renders, and the joint funding preview of both legs.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useSinglePositionClient } from '@/hooks/useSinglePosition';
import { buildBotProjectionContext } from '@/hooks/bots/dca/useBotDcaProjection';
import {
  comboLegSettings,
  sumHedgeLegOrders,
  type HedgeComboLegSettings,
  type HedgeLegOrderTotals,
  type HedgeLegSide,
  type HedgeStartLeg,
} from '@/lib/baseFunding/hedgeFunding';
import {
  fetchHedgeFundingPreview,
  type HedgeFundingPreview,
  type PreviewHedgeFundingInput,
} from '@/lib/baseFunding/hedgeFundingApi';
import type { BaseFundingBackend } from '@/lib/baseFunding/baseFundingApi';
import {
  createComboOrders,
  createDCAOrders,
  resolveSettingsVars,
} from '@/utils/bots/dca/example-orders-core';
import { BotTypesEnum } from '@/types';

export const HEDGE_FUNDING_PREVIEW_QUERY_KEY = 'hedgeFundingPreview';

/** A leg's ladder sums, plus a combo leg's planner settings. */
export interface HedgeLegLadder extends HedgeLegOrderTotals {
  combo?: HedgeComboLegSettings;
}

/**
 * A leg's ladder totals at `price`, from `createDCAOrders` /
 * `createComboOrders` — the generators behind the bot form's order table and
 * the drawer's DCA projection.
 */
export async function computeHedgeLegTotals(
  leg: HedgeStartLeg,
  combo: boolean,
  price: number
): Promise<HedgeLegLadder | null> {
  const context = buildBotProjectionContext({
    type: combo ? BotTypesEnum.combo : BotTypesEnum.dca,
    _id: leg.id || leg.side,
    pair: leg.pair,
    exchange: leg.exchange,
    settings: leg.settings,
    vars: leg.vars,
  });
  if (!context || !(price > 0)) return null;
  const generate = combo ? createComboOrders : createDCAOrders;
  const orders = await generate({}, { ...context, inputLatestPrice: price });
  const totals = sumHedgeLegOrders(orders);
  if (!combo) return totals;
  // gridLevel / feeOrder as the ladder reads them: variable bindings resolved.
  const resolved = context.settings
    ? await resolveSettingsVars(context.settings, context.botVars)
    : null;
  return { ...totals, combo: comboLegSettings(resolved) };
}

/** Ladder totals per leg side; a leg is absent until its price is known. */
export function useHedgeLegTotals(
  legs: readonly HedgeStartLeg[],
  combo: boolean,
  priceOf: (leg: HedgeStartLeg) => number,
  active: boolean
): Partial<Record<HedgeLegSide, HedgeLegLadder>> {
  const [totals, setTotals] = useState<
    Partial<Record<HedgeLegSide, HedgeLegLadder>>
  >({});
  // Prices rounded so a tick does not regenerate the ladders.
  const key = legs
    .map((leg) => `${leg.id}:${leg.side}:${Number(priceOf(leg).toPrecision(4))}`)
    .join('|');

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void Promise.all(
      legs.map(async (leg) => {
        try {
          return [leg.side, await computeHedgeLegTotals(leg, combo, priceOf(leg))] as const;
        } catch {
          return [leg.side, null] as const;
        }
      })
    ).then((entries) => {
      if (!alive) return;
      const next: Partial<Record<HedgeLegSide, HedgeLegLadder>> = {};
      for (const [side, value] of entries) if (value) next[side] = value;
      setTotals(next);
    });
    return () => {
      alive = false;
    };
    // `key` carries the legs and their rounded prices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, combo, active]);

  return totals;
}

/** Quantities rounded into the key so a price tick does not refetch. */
const keyOf = (input: PreviewHedgeFundingInput) => [
  input.exchangeUUID,
  input.pair,
  Number(input.price.toPrecision(4)),
  ...input.legs.map(
    (leg) =>
      `${leg.side}:${leg.action}:${leg.useDca ? 1 : 0}:${Number(
        leg.baseOrderQty.toPrecision(6)
      )}:${Number(leg.safetyQty.toPrecision(6))}:${Number(
        leg.safetyQuote.toPrecision(6)
      )}:${leg.comboGridLevel ?? ''}:${leg.safetyLevels ?? ''}:${
        leg.feeOrder === undefined ? '' : leg.feeOrder ? 1 : 0
      }`
  ),
];

export interface UseHedgeFundingPreviewResult {
  /** 'unknown' while the first answer is pending or the request failed. */
  backend: BaseFundingBackend;
  preview: HedgeFundingPreview | null;
  isFetching: boolean;
  /**
   * The answer on screen is for the current input: not a previous input's
   * kept while the new one loads, and not an error.
   */
  current: boolean;
  /** Why there is no plan: NOTOK reason, resolver or transport error. */
  failure: string | null;
}

/**
 * What the bot would trade, reserve or refuse for each leg (null input:
 * nothing to preview). A preview, not a promise — the engine re-plans when
 * the deals open.
 */
export function useHedgeFundingPreview(
  input: PreviewHedgeFundingInput | null
): UseHedgeFundingPreviewResult {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const valid =
    !!input &&
    !!input.exchangeUUID &&
    !!input.pair &&
    input.price > 0 &&
    input.legs.length > 0 &&
    input.legs.every(
      (leg) =>
        Number.isFinite(leg.baseOrderQty) &&
        Number.isFinite(leg.safetyQty) &&
        Number.isFinite(leg.safetyQuote)
    );
  const q = useQuery({
    queryKey: [
      HEDGE_FUNDING_PREVIEW_QUERY_KEY,
      paperContext,
      ...(valid && input ? keyOf(input) : []),
    ],
    enabled: enabled && valid,
    retry: false,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchHedgeFundingPreview(make(), input as PreviewHedgeFundingInput),
  });
  const failure = q.isError
    ? 'The funding estimate is unavailable.'
    : q.data && !q.data.preview && q.data.backend === 'new'
      ? q.data.reason || 'The funding estimate is unavailable.'
      : null;
  return {
    backend: q.data?.backend ?? 'unknown',
    preview: valid ? (q.data?.preview ?? null) : null,
    isFetching: q.isFetching,
    current: valid && q.isSuccess && !q.isPlaceholderData && !q.isFetching,
    failure: valid && !q.isPlaceholderData ? failure : null,
  };
}
