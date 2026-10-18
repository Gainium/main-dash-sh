// Hedge start funding preview — the `previewHedgeFunding` read.
//
// Same compatibility rule as `baseFundingApi`: a self-hosted main-app may
// predate the query, and a document naming a field the schema does not know
// fails whole. A schema rejection means the backend is 'old': the start dialog
// then shows no preview but still starts the bot with the chosen actions.
import type { GraphQLClient } from '@/lib/api/GraphQLClient';
import { isSchemaRejection } from '@/lib/largeAccount/largeAccount';

import {
  COMBO_LEG_INPUT_FIELDS,
  withoutComboLegFields,
  type PreviewHedgeFundingLegInput,
} from './hedgeFunding';
import type { BaseFundingBackend } from './baseFundingApi';

export interface PreviewHedgeFundingInput {
  exchangeUUID: string;
  exchange: string;
  pair: string;
  price: number;
  legs: PreviewHedgeFundingLegInput[];
}

export interface HedgeFundingLegPreview {
  side: string;
  action: string;
  /** none: nothing to trade; fund: the bot trades upfront; refuse: not enough. */
  kind: 'none' | 'fund' | 'refuse';
  tradeSide?: 'BUY' | 'SELL' | null;
  tradeBaseQty?: number | null;
  tradeQuote?: number | null;
  raisedToMin?: boolean | null;
  required?: number | null;
  held?: number | null;
  needAsset?: string | null;
  reservedForEntry?: number | null;
  message?: string | null;
}

export interface HedgeFundingPreview {
  baseAsset: string;
  quoteAsset: string;
  freeBase: number;
  freeQuote: number;
  reservedQuote: number;
  reservedBase: number;
  legs: HedgeFundingLegPreview[];
}

export interface HedgeFundingPreviewResult {
  backend: Exclude<BaseFundingBackend, 'unknown'>;
  /** Null when the backend answered without a plan (NOTOK). */
  preview: HedgeFundingPreview | null;
  /** The backend's reason when it answered without a plan. */
  reason?: string | null;
}

export const PREVIEW_HEDGE_FUNDING_QUERY = `query previewHedgeFunding($input: previewHedgeFundingInput!) {
  previewHedgeFunding(input: $input) {
    status
    reason
    data {
      baseAsset quoteAsset freeBase freeQuote reservedQuote reservedBase
      legs {
        side action kind tradeSide tradeBaseQty tradeQuote raisedToMin
        required held needAsset reservedForEntry message
      }
    }
  }
}`;

type PreviewAnswer = {
  previewHedgeFunding?: {
    status?: string;
    reason?: string | null;
    data?: HedgeFundingPreview | null;
  } | null;
};

/**
 * Set once an API has rejected the optional combo leg fields (it predates
 * them): later requests in this session leave them out instead of failing
 * first.
 */
let comboLegFieldsRejected = false;

/** Test hook: forget what the API was found to support. */
export const resetHedgeFundingFieldSupport = () => {
  comboLegFieldsRejected = false;
};

const hasComboLegFields = (input: PreviewHedgeFundingInput) =>
  input.legs.some((leg) =>
    COMBO_LEG_INPUT_FIELDS.some((key) => leg[key] !== undefined)
  );

const stripComboLegFields = (
  input: PreviewHedgeFundingInput
): PreviewHedgeFundingInput => ({
  ...input,
  legs: input.legs.map(withoutComboLegFields),
});

/**
 * The planner's answer for both legs, planned jointly on the shared account.
 * The combo leg fields (`comboGridLevel`, `safetyLevels`, `feeOrder`) are
 * newer than the query: an API that rejects one of them by name is asked
 * again without them (and is not sent them again this session). Throws only
 * on a transport failure, so the caller retries instead of caching 'old'.
 */
export async function fetchHedgeFundingPreview(
  client: GraphQLClient,
  input: PreviewHedgeFundingInput
): Promise<HedgeFundingPreviewResult> {
  const combo = hasComboLegFields(input);
  const withCombo = combo && !comboLegFieldsRejected;
  const send = combo && !withCombo ? stripComboLegFields(input) : input;
  try {
    return await requestHedgeFundingPreview(client, send);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (
      withCombo &&
      isSchemaRejection(message) &&
      COMBO_LEG_INPUT_FIELDS.some((key) => message.includes(key))
    ) {
      comboLegFieldsRejected = true;
      try {
        return await requestHedgeFundingPreview(client, stripComboLegFields(input));
      } catch (retryError) {
        return classifyFailure(retryError);
      }
    }
    return classifyFailure(error);
  }
}

/** A failed request: schema rejection → 'old'; resolver error → no plan. */
function classifyFailure(error: unknown): HedgeFundingPreviewResult {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isSchemaRejection(message)) return { backend: 'old', preview: null };
  if (/^GraphQL errors:/.test(message)) {
    return { backend: 'new', preview: null, reason: message };
  }
  throw error;
}

/** One request; throws whatever the client throws. */
async function requestHedgeFundingPreview(
  client: GraphQLClient,
  input: PreviewHedgeFundingInput
): Promise<HedgeFundingPreviewResult> {
  const answer = await client.request<PreviewAnswer>(
    PREVIEW_HEDGE_FUNDING_QUERY,
    { input }
  );
  const res = answer?.previewHedgeFunding;
  const preview = res && res.status === 'OK' && res.data ? res.data : null;
  return {
    backend: 'new',
    preview,
    ...(preview ? {} : { reason: res?.reason ?? null }),
  };
}
