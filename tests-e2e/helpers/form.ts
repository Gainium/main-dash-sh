import { expect, type Page, type Response } from '@playwright/test';

/**
 * The bot form's real-world mechanics, learned by driving it by hand. Each of
 * these cost a debugging round the first time; they are encoded here so a spec
 * reads as the scenario under test rather than as DOM archaeology.
 */

/**
 * The edit form opens READ-ONLY — "Fields are locked. Press Edit to make
 * changes." Every control is inert until this is clicked, and a spec that skips
 * it silently asserts against a form nobody can type into. (Note that Save
 * still works while locked; it just saves the unchanged values, which makes the
 * mistake look like a passing test.)
 */
export const unlockForm = async (page: Page): Promise<void> => {
  const edit = page.getByRole('button', { name: /^EDIT$/i });
  if (await edit.first().isVisible().catch(() => false)) {
    await edit.first().click();
  }
  await expect(page.getByText(/Fields are locked/i)).toBeHidden({
    timeout: 15_000,
  });
};

/**
 * Several controls live behind a "More Settings" disclosure and are absent from
 * the DOM until it is opened — not merely hidden. Opens every one on the page.
 */
export const expandMoreSettings = async (page: Page): Promise<void> => {
  const more = page.getByRole('button', { name: 'More Settings' });
  const n = await more.count();
  for (let i = 0; i < n; i++) {
    const b = more.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await b.click().catch(() => undefined);
    }
  }
};

/** Waits for the form to hydrate from its query rather than guessing a delay. */
export const waitForBotForm = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole('button', { name: /SAVE SETTINGS/i }).first()
  ).toBeVisible({ timeout: 60_000 });
};

export interface CapturedMutation {
  /** The `input` variable actually put on the wire. */
  input: Record<string, unknown>;
  /** Parsed response body. */
  body: unknown;
  /** The platform status string, if the response carries one. */
  status?: string;
}

const readInput = (postData: string | null): Record<string, unknown> => {
  if (!postData) return {};
  try {
    const parsed = JSON.parse(postData) as {
      variables?: { input?: Record<string, unknown> };
    };
    return parsed.variables?.input ?? {};
  } catch {
    return {};
  }
};

/**
 * Runs `action` and captures the GraphQL call whose body names `operation`.
 *
 * This is the assertion surface that matters most: what the mapper produces is
 * NOT what ships. `useFormHandlers` deletes ~12 fields immediately before the
 * mutation (they are not declared in changeDCABotInput and Apollo rejects
 * undeclared input fields), so only the wire payload proves a field was saved.
 */
export const captureMutation = async (
  page: Page,
  operation: string,
  action: () => Promise<void>
): Promise<CapturedMutation> => {
  const matches = (r: Response): boolean =>
    r.request().method() === 'POST' &&
    (r.request().postData() ?? '').includes(operation);

  const [response] = await Promise.all([
    page.waitForResponse(matches, { timeout: 60_000 }),
    action(),
  ]);

  const input = readInput(response.request().postData());
  const body = (await response.json().catch(() => null)) as unknown;
  const status = (
    body as { data?: Record<string, { status?: string }> } | null
  )?.data?.[operation]?.status;

  return { input, body, status };
};

/**
 * SAVE SETTINGS is disabled while the form is pristine — "No changes to save
 * yet — edit a setting to enable this."
 *
 * So a spec that opens a bot and saves it UNMODIFIED is relying on the form
 * dirtying itself, which it does incidentally and asynchronously once the
 * user-fee / pair-metadata queries settle and write back into form state. That
 * race is real: the same spec passes on a warm run and, on a cold one where
 * `user-fees-storage` hydration times out, sits on a disabled button until the
 * test times out — never reaching its assertions. A green run therefore proved
 * nothing about the assertion below it.
 *
 * This makes it deterministic: type one character into the bot-name field and
 * delete it again. The form is unambiguously dirty, and the value — hence the
 * payload — is byte-identical to what it would otherwise have been.
 */
export const makeFormDirty = async (page: Page): Promise<void> => {
  const name = page.locator('#grid-bot-name');
  await expect(name).toBeEnabled({ timeout: 30_000 });
  const before = await name.inputValue();

  await name.click();
  await name.press('End');
  await name.pressSequentially('x');
  await name.press('Backspace');

  // Restoring the value is what keeps this a no-op edit; assert it rather than
  // assume it, or the spec silently starts renaming the account's bots.
  await expect(name).toHaveValue(before);
  await expect(
    page.getByRole('button', { name: /SAVE SETTINGS/i }).first()
  ).toBeEnabled({ timeout: 30_000 });
};

/** Clicks the visible save button. There are several in the DOM; most are not. */
export const saveSettings = async (page: Page): Promise<void> => {
  const buttons = page.getByRole('button', { name: /SAVE SETTINGS/i });
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      return;
    }
  }
  throw new Error('no visible SAVE SETTINGS button');
};

/** Save and capture in one step — the shape nearly every spec wants. */
export const saveAndCapture = async (
  page: Page,
  operation: string
): Promise<CapturedMutation> =>
  captureMutation(page, operation, () => saveSettings(page));

/** Opens a bot's edit form, hydrated and unlocked, ready to interact with. */
export const openBotEditor = async (
  page: Page,
  path: string
): Promise<void> => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitForBotForm(page);
  await unlockForm(page);
};

/* ------------------------------------------------------------------ *
 * Create mode
 *
 * The create form is a different screen from the edit form, not the same
 * one with a different verb, so none of the helpers above fit it: there is
 * no lock to release (a new bot has nothing to protect), the primary button
 * says CREATE BOT rather than SAVE SETTINGS, and it opens on a Quick-setup
 * wizard that exposes a handful of fields instead of the full form.
 * ------------------------------------------------------------------ */

/**
 * The form persists a draft to localStorage under
 * `gainium:bot-form-draft:v1:<type>:create:new` and rehydrates from it on the
 * next visit. That is right for a user who navigated away mid-setup and wrong
 * for a spec: run two of these back to back and the second one starts from the
 * first one's edits, so it passes while asserting values it never set.
 *
 * Registered as an init script so it runs before the app boots on EVERY
 * navigation in the page — clearing after `goto` would race the rehydrate.
 */
export const clearBotFormDrafts = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('gainium:bot-form-draft:')) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      /* storage unavailable — nothing to clear */
    }
  });
};

/**
 * Switches the create form from Quick setup to the full Manual form.
 *
 * Quick mode is the default and only renders a subset of the controls, so a
 * spec that skips this can only reach the handful of fields the wizard shows.
 */
export const switchToManualMode = async (page: Page): Promise<void> => {
  const manual = page.getByRole('tab', { name: 'Manual' });
  await manual.waitFor({ state: 'visible', timeout: 60_000 });
  await manual.click();
  // The section accordions only exist in the manual form.
  await page.locator('#section-take-profit').waitFor({ timeout: 30_000 });
};

/** Waits for the create form to be interactive. */
export const waitForBotCreateForm = async (page: Page): Promise<void> => {
  await expect(
    page.getByRole('button', { name: /CREATE BOT/i }).first()
  ).toBeVisible({ timeout: 60_000 });
};

/** Opens the new-bot form on the full manual view, with no draft carried in. */
export const openBotCreator = async (
  page: Page,
  path: string
): Promise<void> => {
  await clearBotFormDrafts(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitForBotCreateForm(page);
  await switchToManualMode(page);
};

/**
 * Clicks the CREATE BOT button the user can actually see.
 *
 * There are three in the DOM and Playwright calls all three visible: the two
 * decoys belong to a responsive toolbar that is parked OFF-CANVAS at
 * x ≈ -9790, which is not `display:none` and not zero-sized, so
 * `isVisible()` is true for them. Clicking one dispatches happily and does
 * nothing — the spec then sits waiting for a mutation that was never going to
 * fire and dies on the response timeout rather than on the click, which reads
 * like a backend problem and is not one. Selecting on the bounding box being
 * inside the viewport is what distinguishes the real button from the decoys.
 */
export const createBot = async (page: Page): Promise<void> => {
  const buttons = page.getByRole('button', { name: /CREATE BOT/i });
  const n = await buttons.count();
  const viewport = page.viewportSize();

  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;

    const box = await b.boundingBox().catch(() => null);
    if (!box) continue;
    if (box.x < 0 || box.y < 0) continue;
    if (viewport && (box.x > viewport.width || box.y > viewport.height)) {
      continue;
    }

    await b.click();
    return;
  }
  throw new Error('no on-screen CREATE BOT button');
};

/** Create and capture in one step. */
export const createAndCapture = async (
  page: Page,
  operation: string
): Promise<CapturedMutation> =>
  captureMutation(page, operation, () => createBot(page));
