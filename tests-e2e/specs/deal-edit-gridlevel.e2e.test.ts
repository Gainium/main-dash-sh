import { test, expect, type Locator, type Page } from '@playwright/test';

import { gql } from '../helpers/api';
import { captureMutation } from '../helpers/form';

/**
 * Covers the combo deal-edit drawer end to end, and pins two decisions that
 * previous rounds got wrong in opposite directions.
 *
 * 1. THE DRAWER MUST USE THE COMBO MUTATION (core 3e92dd6).
 *    DealEditDrawer used to derive its bot type from `props.trade?.[0]?.combo`,
 *    a field nothing in the codebase ever writes — `transformDeal`
 *    (types/dcaDeal.ts) projects comboness onto `TransformedTrade.type`
 *    instead. So `formData.type` was always `'dca'`, and `useDealActions` picks
 *    the mutation from that same value: every combo deal save went out as
 *    `changeDCADealSettings`, which reads `dcaDealsDb` and returned
 *    `entityNotFound('Deal')`. Combo deals were not partially broken to edit,
 *    they were uneditable. The drawer now takes the type from its caller.
 *
 * 2. DCA GRID LEVELS ARE READ-ONLY HERE (legacy parity).
 *    Legacy main-dash disables both the slider and the input under
 *    `props.isDealEdit && combo` (DcaModeSettings.tsx). The redesign briefly
 *    diverged and left it editable; it no longer does. `gridLevel` stays in
 *    DealEditDrawer's `keys` array on purpose — see the comment there — so
 *    re-enabling the control can't silently make it unsaveable again.
 *
 * The drawer is reached by deep link: `/combo/view/<botId>?tab=deals&
 * editDealId=<dealId>`. That link is consumed by DrawerDealsTable's
 * search-param effect, which opens the edit drawer and then strips both params.
 * (An earlier version of this file asserted the opposite — "nothing consumes it
 * to OPEN the drawer". That was wrong, and wrong for a reason worth recording:
 * DrawerDealsTable.tsx contained literal NUL bytes, so `grep` treated the whole
 * 3.4k-line file as binary and silently reported no matches for every symbol in
 * it. Verified by hand on 2026-08-14 before this rewrite.)
 */

interface ComboBotListResult {
  comboBotList?: {
    status?: string;
    data?: { _id: string; settings?: { name?: string } }[];
  };
}

interface ComboDealListResult {
  comboDealList?: {
    status?: string;
    data?: {
      result?: {
        _id: string;
        botId?: string;
        status?: string;
        // `gridLevel` comes back as a String and `ordersCount` as a number —
        // the deal settings type is not uniform, so don't tighten either of
        // these without checking the API first.
        settings?: { gridLevel?: string; ordersCount?: number | string };
        symbol?: { symbol?: string };
      }[];
    };
  };
}

const CHANGE_COMBO_DEAL_SETTINGS = `mutation changeComboDealSettings($input: comboDealSettingsInput!) {
  changeComboDealSettings(input: $input) {
    status
    reason
    data
  }
}`;

const DEAL_QUERY = `query($input: getDcaDealListInput) {
  comboDealList(input: $input) {
    status
    data { result { _id botId status settings { gridLevel ordersCount } symbol { symbol } } }
  }
}`;

let targetBotId: string | null = null;
let targetDealId: string | null = null;
let targetSymbol = '';
let originalGridLevel: string | null = null;
let originalOrdersCount: string | null = null;
let searchNote = '';

test.beforeAll(async () => {
  // Find an EXISTING combo bot with an open deal. Never start a bot to make
  // one: a running bot places real (paper) orders, and a deal only exists once
  // the bot's conditions trigger it.
  //
  // Both queries go out with `paper-context: true` (the default in
  // helpers/api.ts). Without that header the account's paper bots come back as
  // `status: OK, data: []`, which reads exactly like "this account has no
  // combo bots" — that is how an earlier version of this spec concluded there
  // was nothing to test.
  const bots = await gql<ComboBotListResult>(
    'query { comboBotList(input:{all:true}) { status data { _id settings { name } } } }'
  );
  const comboBots = bots.comboBotList?.data ?? [];
  searchNote = `checked ${comboBots.length} combo bot(s) on the account`;

  for (const bot of comboBots) {
    const deals = await gql<ComboDealListResult>(DEAL_QUERY, {
      input: { botId: bot._id, status: ['open'] },
    }).catch(() => null);

    const deal = deals?.comboDealList?.data?.result?.[0];
    if (
      deal?._id &&
      typeof deal.settings?.gridLevel === 'string' &&
      deal.settings?.ordersCount != null
    ) {
      targetBotId = bot._id;
      targetDealId = deal._id;
      targetSymbol = deal.symbol?.symbol ?? '';
      originalGridLevel = deal.settings.gridLevel;
      originalOrdersCount = String(deal.settings.ordersCount);
      searchNote += `; using bot ${bot._id} (${bot.settings?.name ?? 'unnamed'}) deal ${deal._id} on ${targetSymbol}, gridLevel=${originalGridLevel}, ordersCount=${originalOrdersCount}`;
      break;
    }
  }
});

test.afterAll(async () => {
  // Restore whatever we changed. Runs even when the assertions failed, and is
  // a no-op — it never touches the account — if beforeAll found nothing.
  if (!targetBotId || !targetDealId || originalOrdersCount === null) return;
  await gql(CHANGE_COMBO_DEAL_SETTINGS, {
    input: {
      botId: targetBotId,
      dealId: targetDealId,
      settings: { ordersCount: originalOrdersCount },
    },
  }).catch(() => undefined);
});

/**
 * Opens the deal-edit drawer via the `?editDealId=` deep link — the same link
 * OpenOrdersWidget's `openEditInBotDrawer` builds when a deal isn't in its own
 * loaded pool. Using it here means this spec also covers that link.
 *
 * The other route is the one a user takes from inside the drawer: Deals tab →
 * table view → the row's ⋯ menu → Edit. That path needs a real pointer click
 * (the Radix trigger opens on pointerdown) and a card-vs-table toggle whose
 * label depends on persisted user state, so it is far more flake-prone; the
 * deep link exercises the same `onEditDeal` handler.
 */
const openDealEditDrawer = async (
  page: Page,
  botId: string,
  dealId: string
): Promise<Locator> => {
  await page.goto(`/combo/view/${botId}?tab=deals&editDealId=${dealId}`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByRole('heading', { name: 'Edit Deal' })).toBeVisible({
    timeout: 60_000,
  });
  return page.getByRole('dialog').last();
};

const requireFixture = (): void => {
  expect(
    targetDealId,
    `no combo bot with an OPEN deal on this account, so the deal-edit drawer cannot be exercised at all (${searchNote}). ` +
      `This is a fixture problem, not the defect under test: find or wait for an open combo deal. ` +
      `Do NOT start a bot to create one — a running bot places real orders.`
  ).not.toBeNull();
};

test('the combo deal-edit drawer renders DCA grid levels seeded and read-only', async ({
  page,
}) => {
  requireFixture();
  const botId = targetBotId as string;
  const dealId = targetDealId as string;
  const original = originalGridLevel as string;

  await openDealEditDrawer(page, botId, dealId);

  // Present at all — this is the combo DCA section, which only renders when
  // `formData.type === 'combo'`. If the bot type regresses to DCA (defect 1 in
  // the header), the input disappears entirely and this fails first.
  const gridInput = page.locator('#combo-DCA-grid-levels');
  await expect(gridInput).toBeVisible({ timeout: 30_000 });

  // Seeded from the deal's CURRENT stored value, not a blank default form —
  // otherwise "it rendered" would prove nothing about which deal we opened.
  await expect(gridInput).toHaveValue(String(parseInt(original, 10)));

  // Legacy parity: read-only while editing a deal.
  await expect(gridInput).toBeDisabled();
});

test('saving a combo deal goes out as changeComboDealSettings and omits gridLevel', async ({
  page,
}) => {
  requireFixture();
  const botId = targetBotId as string;
  const dealId = targetDealId as string;
  const original = originalOrdersCount as string;
  const next = String((parseInt(original, 10) || 8) === 7 ? 9 : 7);

  await openDealEditDrawer(page, botId, dealId);

  // `ordersCount` is the probe rather than `gridLevel` precisely because
  // gridLevel is read-only now: we still need SOME change to enable the save
  // button and put a settings object on the wire.
  const ordersInput = page.locator('#dca-orders');
  await expect(ordersInput).toBeVisible({ timeout: 30_000 });
  await expect(ordersInput).toHaveValue(String(parseInt(original, 10)));
  await ordersInput.fill(next);
  await ordersInput.blur();
  await expect(ordersInput).toHaveValue(next);

  const saveButton = page.getByRole('button', { name: /^Save Changes$/i });
  await expect(saveButton).toBeEnabled();

  // Matched on the shared suffix, not a full operation name: which mutation
  // goes out is itself derived from formData.type in useDealActions.ts, and a
  // combo deal must use changeComboDealSettings — asserted below rather than
  // assumed, so a regression there fails here instead of timing out.
  const saved = await captureMutation(page, 'DealSettings', async () => {
    await saveButton.click();
  });

  const operation = Object.keys(
    (saved.body as { data?: Record<string, unknown> } | null)?.data ?? {}
  )[0];
  expect(operation, JSON.stringify(saved.body).slice(0, 400)).toBe(
    'changeComboDealSettings'
  );
  expect(
    (saved.body as { data: Record<string, { status?: string }> }).data[
      operation as string
    ]?.status,
    JSON.stringify(saved.body).slice(0, 400)
  ).toBe('OK');

  const input = saved.input as {
    botId?: string;
    dealId?: string;
    settings?: Record<string, unknown>;
  };
  expect(input.botId).toBe(botId);
  expect(input.dealId).toBe(dealId);
  // Compared as strings: the form ships this field as text while the API
  // returns it as a number.
  expect(String(input.settings?.['ordersCount'])).toBe(next);
  // Read-only means it can never differ from the original, so the differ must
  // never put it on the wire. If the control is re-enabled this flips, and the
  // header comment plus DealEditDrawer's `keys` entry explain what to do.
  expect(input.settings).not.toHaveProperty('gridLevel');

  // Server-side too — the captured request body proves the browser sent it,
  // this proves it landed.
  await expect
    .poll(
      async () => {
        const check = await gql<ComboDealListResult>(DEAL_QUERY, {
          input: { botId, status: ['open'] },
        });
        const stored = check.comboDealList?.data?.result?.find(
          (d) => d._id === dealId
        )?.settings?.ordersCount;
        return stored == null ? undefined : String(stored);
      },
      { timeout: 20_000, message: 'server-side ordersCount never updated' }
    )
    .toBe(next);
});
