import { test, expect, type Page } from '@playwright/test';

import { gql, unwrap } from '../helpers/api';
import { createAndCapture, openBotCreator } from '../helpers/form';

/**
 * End-to-end coverage for CREATE mode of the bot form.
 *
 * Everything else that exercises this form — the 163-field round-trip probe,
 * every unit test, every spec in this directory — runs `mode: 'edit'`. Create
 * runs different machinery (`buildCreatePayload` spreads the raw form slice,
 * `mergeCreatePayload` layers the mapper output over it, `sanitizeValue` drops
 * empties), and `botFormCreateMode.unit.test.ts` now diffs the two payloads at
 * the mapper boundary. This spec covers what a payload diff cannot:
 *
 *   1. That the values a person actually TYPES reach the mapper. The unit test
 *      feeds synthetic form state; only the browser proves the control is bound
 *      to the field the mapper reads.
 *   2. That the wire payload survives `useFormHandlers`. The mapper's output is
 *      not what ships — create sends its payload VERBATIM with no deny-list,
 *      unlike edit, so anything the create schema does not declare fails the
 *      whole mutation.
 *   3. That the backend keeps it. `prepareDCABot` stores a create verbatim
 *      (`settings: { ...settings, type }`) with no defaulting, where edit merges
 *      over the existing settings. A field the create payload omits does not
 *      fall back to anything — it simply does not exist on the new bot.
 *
 * Everything here runs against the PRODUCTION API in paper mode on the demo
 * account. It creates real bots and deletes them in teardown that runs on
 * failure too. It never starts one.
 */

const RUN_ID = `E2E-create-${Date.now()}`;

/**
 * The values this spec types into the form. Each is deliberately distinct from
 * the form's default so a stale default cannot be mistaken for a saved value:
 *   tpPerc default 3, slPerc -10, maxNumberOfOpenDeals 5, ordersCount 8,
 *   useSl false.
 */
const CHOSEN = {
  name: `${RUN_ID}-dca`,
  tpPerc: '4.25',
  slPerc: '-12',
  maxNumberOfOpenDeals: '3',
  ordersCount: '6',
} as const;

/** Every bot this file creates, deleted in afterAll even when a test fails. */
const created: string[] = [];

const deleteBot = async (id: string): Promise<void> => {
  await gql(
    `mutation deleteBot($input: deleteBotInput!) {
      deleteBot(input: $input) { status reason }
    }`,
    { input: { id, type: 'dca' } }
  ).catch(() => undefined);
};

test.afterAll(async () => {
  for (const id of created) await deleteBot(id);

  /**
   * Belt and braces. If a create succeeded but the assertion that records the
   * id did not run — a timeout between the mutation and the push — the id is
   * lost and the bot outlives the run on a real account. Sweep by name too;
   * RUN_ID is unique per run so this can only match this file's bots.
   */
  const list = await gql<{
    dcaBotList?: { data?: { _id: string; settings?: { name?: string } }[] };
  }>(
    `query { dcaBotList(input:{all:true}) { data { _id settings { name } } } }`
  ).catch(() => null);

  for (const bot of list?.dcaBotList?.data ?? []) {
    if (bot.settings?.name?.startsWith(RUN_ID) && !created.includes(bot._id)) {
      await deleteBot(bot._id);
    }
  }
});

/** Fills a controlled text input by CSS selector, replacing whatever is there. */
const setValue = async (
  page: Page,
  selector: string,
  value: string
): Promise<void> => {
  const input = page.locator(selector).first();
  await input.waitFor({ state: 'visible', timeout: 30_000 });
  await input.fill('');
  await input.fill(value);
  await expect(input).toHaveValue(value);
};

test('a DCA bot created through the form ships the typed settings, and the created bot has them', async ({
  page,
}) => {
  await openBotCreator(page, '/bot/new');

  // --- type the settings -------------------------------------------------
  await setValue(page, '#grid-bot-name', CHOSEN.name);
  await setValue(page, '#max-open-deals', CHOSEN.maxNumberOfOpenDeals);
  await setValue(page, '#dca-orders', CHOSEN.ordersCount);
  await setValue(
    page,
    '#section-take-profit input[placeholder="1.0"]',
    CHOSEN.tpPerc
  );

  // Stop loss is off by default: toggling it is what makes slPerc reachable,
  // and a gate + its gated value is the pairing the create path handles
  // differently from edit (sanitizeValue drops an empty gated field, and the
  // raw base layer is what ships in its place).
  const slToggle = page.locator('#toggle-stop-loss');
  await expect(slToggle).not.toBeChecked();
  await slToggle.click();
  await expect(slToggle).toBeChecked();
  await setValue(
    page,
    '#section-stop-loss input[placeholder="-1.0"]',
    CHOSEN.slPerc
  );

  // --- create, and read what actually went on the wire -------------------
  const sent = await createAndCapture(page, 'createDCABot');
  expect(sent.status, JSON.stringify(sent.body).slice(0, 600)).toBe('OK');

  const botId = (
    sent.body as { data?: { createDCABot?: { data?: { _id?: string } } } }
  )?.data?.createDCABot?.data?._id;
  expect(botId, 'createDCABot returned OK without an id').toMatch(
    /^[a-f0-9]{24}$/
  );
  created.push(botId as string);

  const input = sent.input;

  // The typed values, on the wire.
  //
  // The percentages are compared numerically: the take-profit mapper writes
  // `target` to three decimals, so 4.25 legitimately arrives as "4.250". A
  // string compare there asserts the formatter, not the value.
  expect(input['name']).toBe(CHOSEN.name);
  expect(Number(input['tpPerc'])).toBe(Number(CHOSEN.tpPerc));
  expect(Number(input['slPerc'])).toBe(Number(CHOSEN.slPerc));
  expect(input['useSl']).toBe(true);
  expect(String(input['maxNumberOfOpenDeals'])).toBe(
    CHOSEN.maxNumberOfOpenDeals
  );
  expect(String(input['ordersCount'])).toBe(CHOSEN.ordersCount);

  // The create envelope. Edit has no counterpart for any of these, so create
  // is the only thing that ever sets them — an empty baseAsset/quoteAsset is
  // the mapper's own documented failure mode.
  expect(String(input['exchange'])).toMatch(/^paper/i);
  expect(input['exchangeUUID']).toBeTruthy();
  expect(Array.isArray(input['pair']) && input['pair'].length).toBeTruthy();
  expect(
    Array.isArray(input['baseAsset']) && input['baseAsset'].length
  ).toBeTruthy();
  expect(
    Array.isArray(input['quoteAsset']) && input['quoteAsset'].length
  ).toBeTruthy();

  // Placeholders, not the raw form entries: `buildCreatePayload` destructures
  // indicators/indicatorGroups out precisely so the unserialized catalog
  // defaults cannot ship.
  expect(input['indicators']).toEqual([]);
  expect(input['indicatorGroups']).toEqual([]);

  // Client-only state that must never reach the create schema. Unlike edit,
  // create has no deny-list in useFormHandlers — the mapper's own strip is the
  // only thing standing between these and a BAD_USER_INPUT on every create.
  for (const clientOnly of ['useExperimental', 'avgPrice']) {
    expect(input, `${clientOnly} must not reach createDCABot`).not.toHaveProperty(
      clientOnly
    );
  }

  // --- and the bot the backend actually stored ---------------------------
  // A create is stored verbatim, so this is not a formality: it is the only
  // check that the payload the form built is the bot the user ends up with.
  const stored = await gql<{
    dcaBotList?: {
      data?: {
        _id: string;
        status?: string;
        settings?: Record<string, unknown>;
      }[];
    };
  }>(
    `query { dcaBotList(input:{all:true}) {
        data { _id status settings {
          name tpPerc slPerc useSl ordersCount maxNumberOfOpenDeals pair useMulti
        } }
      } }`
  );

  const bot = stored.dcaBotList?.data?.find((b) => b._id === botId);
  expect(bot, 'the created bot is not in the paper bot list').toBeDefined();

  const s = (bot?.settings ?? {}) as Record<string, unknown>;
  expect(s['name']).toBe(CHOSEN.name);
  expect(Number(s['tpPerc'])).toBe(Number(CHOSEN.tpPerc));
  expect(Number(s['slPerc'])).toBe(Number(CHOSEN.slPerc));
  expect(s['useSl']).toBe(true);
  expect(String(s['ordersCount'])).toBe(CHOSEN.ordersCount);
  expect(String(s['maxNumberOfOpenDeals'])).toBe(CHOSEN.maxNumberOfOpenDeals);
});

/**
 * The fields `useFormHandlers` deletes from every UPDATE because
 * `changeDCABotInput` does not declare them. Create is their only writer — set
 * one wrong and no later save can correct it — and nothing covered them before
 * this file. Split out from the test above so a failure here is legible as
 * "create is not sending X" rather than as part of a long scenario.
 */
test('the create mutation carries the fields no update is allowed to send', async ({
  page,
}) => {
  await openBotCreator(page, '/bot/new');
  await setValue(page, '#grid-bot-name', `${RUN_ID}-denylist`);

  const sent = await createAndCapture(page, 'createDCABot');
  expect(sent.status, JSON.stringify(sent.body).slice(0, 600)).toBe('OK');

  const botId = (
    sent.body as { data?: { createDCABot?: { data?: { _id?: string } } } }
  )?.data?.createDCABot?.data?._id;
  if (botId) created.push(botId);

  const missing = [
    'useMulti',
    'useLimitPrice',
    'type',
    'terminalDealType',
    'feeOrder',
  ].filter((k) => !(k in sent.input));

  expect(
    missing,
    `create is the only path that can set these and it is not sending them: ${missing.join(', ')}`
  ).toEqual([]);
});

/**
 * Deleting is part of the contract this file depends on: if delete stopped
 * working, teardown would silently leak bots onto a real account and every
 * later run would start dirtier. Asserting it once keeps that failure loud.
 */
test('a created bot can be deleted', async () => {
  const created2 = await gql<{
    createDCABot?: { status?: string; reason?: string | null; data?: { _id: string } };
  }>(
    `mutation createDCABot($input: createDCABotInput!) {
      createDCABot(input: $input) { status reason data { _id } }
    }`,
    {
      input: {
        name: `${RUN_ID}-teardown`,
        exchange: 'paperKucoin',
        exchangeUUID: 'de9c0a53-30b5-4607-817f-0a1ce155579d',
        pair: ['BTC-USDT'],
        baseAsset: ['BTC'],
        quoteAsset: ['USDT'],
        strategy: 'LONG',
        profitCurrency: 'base',
        baseOrderSize: '10',
        useLimitPrice: false,
        startOrderType: 'LIMIT',
        startCondition: 'ASAP',
        tpPerc: '3',
        slPerc: '-10',
        orderFixedIn: 'quote',
        orderSize: '10',
        step: '1',
        ordersCount: 5,
        activeOrdersCount: 1,
        volumeScale: '1',
        stepScale: '1',
        minimumDeviation: '1',
        useTp: true,
        useSl: false,
        useSmartOrders: false,
        useDca: false,
        indicators: [],
        indicatorGroups: [],
      },
    }
  );

  const id = unwrap(created2.createDCABot, 'createDCABot')._id;
  await deleteBot(id);

  const after = await gql<{ dcaBotList?: { data?: { _id: string }[] } }>(
    `query { dcaBotList(input:{all:true}) { data { _id } } }`
  );
  expect(after.dcaBotList?.data?.some((b) => b._id === id)).toBe(false);
});
