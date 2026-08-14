import { test, expect, type Locator, type Page } from '@playwright/test';

import { gql } from '../helpers/api';
import { captureMutation } from '../helpers/form';

/**
 * Regression for core 5c75abd: DealEditDrawer.tsx builds the editDeal payload
 * from a hand-written `keys` array — the only thing that ever reaches the
 * mutation. `gridLevel` was missing from that array, so a user could change
 * the combo "DCA grid levels" input, click Save Changes, watch the drawer
 * close as if it had saved, and the value never left the browser.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS SPEC FAILS TODAY, ON PURPOSE. Read this before "fixing" it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The fix's premise — "the control IS rendered for any combo bot in this
 * drawer" — is FALSE on this build. Verified by hand on 2026-08-14 against a
 * real open combo deal (demo account 66a7c2e389077cfe78306877, paper KuCoin,
 * bot "combo btc", deal on BTC-USDT): opening the deal-edit drawer through the
 * real UI path renders the four sections `strategy`, `take-profit`,
 * `stop-loss`, `dca` — and the DCA section is the PLAIN-DCA one (Step scale,
 * Volume scale). `#combo-DCA-grid-levels` is absent from the DOM, and the
 * string "grid level" appears nowhere on the page.
 *
 * Root cause, one level up from this spec:
 *
 *   DealEditDrawer derives `botType` from `props.trade?.[0]?.combo`
 *   (DealEditDrawer.tsx, both the `useBotFormMutations` options and the
 *   `BotFormProvider` botType). `DCADeals.combo` is declared optional in
 *   types/index.ts but NOTHING in this codebase ever writes it: the deal
 *   objects handed to the drawer come straight out of `useDcaDeals` /
 *   `useBotSpecificDeals` (see `activeDealsRaw` in OpenOrdersWidget.tsx), and
 *   the only place comboness is derived — `transformDeal` in types/dcaDeal.ts
 *   — computes a LOCAL `combo` from `bot?.type` and projects it onto the
 *   TransformedTrade's `type: 'Combo'` string, never back onto the raw deal.
 *
 *   So `trade[0].combo` is always undefined, `botType` always resolves to
 *   `dca`, `formData.type` is always `'dca'`, and DCASettings.tsx's
 *   `isComboBot = formData.type === 'combo'` branch (which renders
 *   `#combo-DCA-grid-levels`) is dead in this drawer for every deal, combo or
 *   not. The same `formData.type` also picks the mutation in useDealActions.ts
 *   (`type === dca ? changeDCADealSettings : changeComboDealSettings`), so a
 *   combo deal's save currently goes out as the DCA mutation.
 *
 * Reverting 5c75abd would not change this failure, and 5c75abd is not wrong —
 * it is inert until the `combo` propagation above is fixed. That fix is a real
 * behaviour change on live deals (it switches which form slice and which
 * mutation a combo deal edit uses) and is deliberately NOT bundled here.
 *
 * When it is fixed, this spec needs no edit: the precondition assertion below
 * starts passing and the rest of the test — edit, save, assert `gridLevel` on
 * the wire, verify server-side, restore — becomes the real regression test for
 * 5c75abd.
 *
 * It fails rather than skips because a skip reads as "covered" in a list
 * reporter. The previous version of this spec skipped on "no combo bot with an
 * open deal found", which was itself wrong — the account has two such bots.
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
        settings?: { gridLevel?: string };
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

let targetBotId: string | null = null;
let targetDealId: string | null = null;
let targetSymbol = '';
let originalGridLevel: string | null = null;
let searchNote = '';

test.beforeAll(async () => {
  // Find an EXISTING combo bot with an open deal. Never start a bot to make
  // one: a running bot places real (paper) orders, and a deal only exists once
  // the bot's conditions trigger it.
  //
  // Both queries go out with `paper-context: true` (the default in
  // helpers/api.ts). Without that header the account's paper bots come back as
  // `status: OK, data: []`, which reads exactly like "this account has no
  // combo bots" — that is how the earlier version of this spec concluded there
  // was nothing to test.
  const bots = await gql<ComboBotListResult>(
    'query { comboBotList(input:{all:true}) { status data { _id settings { name } } } }'
  );
  const comboBots = bots.comboBotList?.data ?? [];
  searchNote = `checked ${comboBots.length} combo bot(s) on the account`;

  for (const bot of comboBots) {
    const deals = await gql<ComboDealListResult>(
      `query($input: getDcaDealListInput) {
        comboDealList(input: $input) {
          status
          data { result { _id botId status settings { gridLevel } symbol { symbol } } }
        }
      }`,
      { input: { botId: bot._id, status: ['open'] } }
    ).catch(() => null);

    const deal = deals?.comboDealList?.data?.result?.[0];
    if (deal?._id && typeof deal.settings?.gridLevel === 'string') {
      targetBotId = bot._id;
      targetDealId = deal._id;
      targetSymbol = deal.symbol?.symbol ?? '';
      originalGridLevel = deal.settings.gridLevel;
      searchNote += `; using bot ${bot._id} (${bot.settings?.name ?? 'unnamed'}) deal ${deal._id} on ${targetSymbol}, current gridLevel=${originalGridLevel}`;
      break;
    }
  }
});

test.afterAll(async () => {
  // Restore whatever we changed. Runs even when the assertions failed, and is
  // a no-op — it never touches the account — if beforeAll found nothing.
  if (!targetBotId || !targetDealId || originalGridLevel === null) return;
  await gql(CHANGE_COMBO_DEAL_SETTINGS, {
    input: {
      botId: targetBotId,
      dealId: targetDealId,
      settings: { gridLevel: originalGridLevel },
    },
  }).catch(() => undefined);
});

/**
 * Opens the deal-edit drawer the way a user does: bot drawer → Deals tab →
 * table view → the deal row's ⋯ menu → Edit.
 *
 * There is no shortcut. `?editDealId=<id>` looks like a deep link and is even
 * written by OpenOrdersWidget's `openEditInBotDrawer`, but nothing consumes it
 * to OPEN the drawer — BotDetailsDrawer only reads it to suppress its
 * auto-select-latest-deal effect. Navigating straight to it lands on the bot
 * drawer with no Edit Deal drawer, which looks like a broken drawer rather
 * than a wrong assumption.
 */
const openDealEditDrawer = async (
  page: Page,
  botId: string,
  symbol: string
): Promise<Locator> => {
  await page.goto(`/combo/view/${botId}`, { waitUntil: 'domcontentloaded' });

  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Deals', exact: true }).click();

  // Wait for the deals panel to actually mount before touching its controls.
  // The panel swaps its toolbar in as the deals query resolves, and a click
  // fired at the toggle before then lands on a button that is replaced a
  // moment later — the view silently stays in cards and the row lookup below
  // fails with "element(s) not found", which reads like a bad selector.
  const base = symbol.split('-')[0] ?? symbol;
  await expect(drawer.getByText(base, { exact: false }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Card-vs-table is persisted per user, so the drawer may already be in table
  // view. The toggle names itself after the view it switches TO: "Table" while
  // showing cards, "Cards" while showing the table.
  const toTable = drawer.getByRole('button', { name: 'Table', exact: true });
  if (await toTable.first().isVisible().catch(() => false)) {
    await toTable.first().click();
  }

  const row = drawer.locator('tr').filter({ hasText: base });
  await expect(row.first()).toBeVisible({ timeout: 60_000 });

  // The row menu is a Radix dropdown trigger — it opens on pointerdown, which
  // a real Playwright click delivers (an element.click() from page.evaluate
  // does not).
  await row.first().getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Edit Deal' })).toBeVisible({
    timeout: 30_000,
  });
  return drawer;
};

test('editing DCA grid levels in the deal-edit drawer reaches the editDeal mutation', async ({
  page,
}) => {
  expect(
    targetDealId,
    `no combo bot with an OPEN deal on this account, so the deal-edit drawer cannot be exercised at all (${searchNote}). ` +
      `This is a fixture problem, not the defect under test: find or wait for an open combo deal. ` +
      `Do NOT start a bot to create one — a running bot places real orders.`
  ).not.toBeNull();

  const botId = targetBotId as string;
  const dealId = targetDealId as string;
  const original = originalGridLevel as string;
  const newGridLevel = original === '7' ? '9' : '7';

  await openDealEditDrawer(page, botId, targetSymbol);

  // ── The precondition that 5c75abd assumed, and that this build does not
  // meet. See the header comment for the full trace. Everything below this
  // line is the actual regression test and is unreachable until it passes.
  const gridInput = page.locator('#combo-DCA-grid-levels');
  const gridInputAppeared = await gridInput
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!gridInputAppeared) {
    const sections = await page
      .locator('[data-section-id]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-section-id')));
    const dcaOnlyFieldVisible = await page
      .getByText('Volume scale', { exact: true })
      .isVisible()
      .catch(() => false);

    expect(
      gridInputAppeared,
      `The combo "DCA grid levels" control (#combo-DCA-grid-levels) is not in the drawer for combo deal ${dealId} ` +
        `on bot ${botId}. Sections rendered: [${sections.join(', ')}]. ` +
        `Plain-DCA-only "Volume scale" field visible: ${dcaOnlyFieldVisible}.\n\n` +
        `This is the KNOWN PRECONDITION DEFECT, not a flake and not a selector problem: ` +
        `DealEditDrawer derives its botType from trade[0].combo, and nothing in this codebase ever ` +
        `sets .combo on a deal object (transformDeal in types/dcaDeal.ts derives comboness onto ` +
        `TransformedTrade.type instead), so formData.type is always 'dca' and DCASettings' isComboBot ` +
        `branch never renders here. Until that is fixed, core 5c75abd (gridLevel added to ` +
        `DealEditDrawer's keys array) is correct but inert, and the combo grid level cannot be ` +
        `changed from the UI at all.`
    ).toBe(true);
    return;
  }

  // Guard against a vacuous pass: the field must be seeded from the deal's
  // CURRENT stored value, proving we are editing the real deal and not a blank
  // default form.
  await expect(gridInput).toHaveValue(String(parseInt(original, 10)));

  await gridInput.fill(newGridLevel);
  await gridInput.blur();
  // Still showing our edit after blur. If it were not, the save below would
  // quietly ship the old value and the wire assertion could pass by accident.
  await expect(gridInput).toHaveValue(newGridLevel);

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
  // The exact assertion that fails if core 5c75abd is reverted: `gridLevel`
  // drops out of DealEditDrawer's hand-written `keys` array, so `settings`
  // carries every other changed field except this one.
  expect(input.settings).toHaveProperty('gridLevel', newGridLevel);

  // Server-side too — the captured request body proves the browser sent it,
  // this proves it landed.
  await expect
    .poll(
      async () => {
        const check = await gql<ComboDealListResult>(
          `query($input: getDcaDealListInput) {
            comboDealList(input: $input) {
              data { result { _id settings { gridLevel } } }
            }
          }`,
          { input: { botId, status: ['open'] } }
        );
        return check.comboDealList?.data?.result?.find((d) => d._id === dealId)
          ?.settings?.gridLevel;
      },
      { timeout: 20_000, message: 'server-side gridLevel never updated' }
    )
    .toBe(newGridLevel);
});
