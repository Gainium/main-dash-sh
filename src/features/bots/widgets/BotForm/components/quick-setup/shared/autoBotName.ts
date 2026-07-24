/**
 * Shared auto-bot-name logic.
 *
 * Two hooks auto-fill a bot's name in Quick mode: `useAutoNameFromPreset`
 * (regular DCA/Combo/Grid, reading `formData.name` from a mounted leg's
 * BotFormProvider) and `useAutoHedgeName` (hedge bots, reading the outer
 * HedgeBotFormProvider's `hedgeName`). Only the *state plumbing* differs —
 * the naming rules must be identical, so they live here and both hooks call
 * `decideAutoBotName`.
 */

/** Escape a label so it can be embedded safely inside a RegExp. */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Local calendar date as `YYYY-MM-DD` (ISO date, no time component). */
export const todayIso = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface AutoBotNameInputs {
  /**
   * Name prefix — the first pair, or `{firstPair} +{n-1}` when several
   * pairs are selected (e.g. `BTCUSDT +4`).
   */
  prefix: string;
  /** The active preset's label, when a preset is selected; else null. */
  presetLabel?: string | null;
  /**
   * Bot type label, always included in the name (e.g. `DCA`, `Grid`,
   * `Hedge DCA`).
   */
  botTypeLabel: string;
}

/**
 * Compose the auto name: `{prefix} {botType} {preset?} {date}`.
 *
 * The bot type is ALWAYS present; the preset label is appended after it
 * only when a preset is active. E.g. `BTCUSDT Hedge DCA Conservative
 * 2026-07-24`, or `BTCUSDT DCA 2026-07-24` with no preset.
 */
export const composeAutoBotName = ({
  prefix,
  presetLabel,
  botTypeLabel,
}: AutoBotNameInputs): string => {
  const middle = presetLabel ? `${botTypeLabel} ${presetLabel}` : botTypeLabel;
  return `${prefix} ${middle} ${todayIso()}`;
};

/**
 * Recognize a name that matches the shape WE would have generated for the
 * current `prefix` / `botTypeLabel` / preset catalog. Used ONLY to adopt a
 * pre-existing auto name on a hook's first run — before it has written
 * anything this mount (e.g. after a remount, which resets `lastAutoName`,
 * or for an auto name generated under an older format).
 *
 * The match is anchored on the CURRENT prefix (`^{prefix} …`), which is the
 * crux of the edit-preservation fix: a genuine auto name for this pair is
 * adopted (so preset/pair changes keep updating it), but a user edit that
 * merely keeps the `{preset} {date}` tail — e.g. `My bot DCA Balanced
 * 2026-07-24` — does NOT start with the current pair and is therefore left
 * alone. The old heuristic only checked the suffix, so any name ending in a
 * known label + date got clobbered on the next remount.
 *
 * This is deliberately NOT consulted once the hook has written a name:
 * within a mount, authorship is tracked exactly via `lastAutoName` (see
 * `decideAutoBotName`).
 */
export const matchesAutoShape = (
  currentName: string,
  prefix: string,
  botTypeLabel: string,
  presetLabels: ReadonlyArray<string>
): boolean => {
  const p = escapeRegExp(prefix);
  const type = escapeRegExp(botTypeLabel);
  const preset = presetLabels.length
    ? `(?:${presetLabels.map(escapeRegExp).join('|')})`
    : null;
  const date = '\\d{4}-\\d{2}-\\d{2}';
  const presetOpt = preset ? `(?: ${preset})?` : '';

  const patterns = [
    // Current format: "{prefix} {botType}[ {preset}] {date}".
    `^${p} ${type}${presetOpt} ${date}$`,
    // Bare current format with no date (defensive): "{prefix} {botType}[ {preset}]".
    `^${p} ${type}${presetOpt}$`,
  ];
  if (preset) {
    // Legacy formats, before the bot type was part of the name:
    //   "{prefix} {preset} {date}" and the older, date-less "{prefix} {preset}".
    patterns.push(`^${p} ${preset} ${date}$`, `^${p} ${preset}$`);
  }

  return patterns.some((re) => new RegExp(re).test(currentName));
};

export interface DecideAutoBotNameInputs extends AutoBotNameInputs {
  /** The current value of the name field. */
  currentName: string;
  /** All preset labels in this bot type's catalog. */
  presetLabels: ReadonlyArray<string>;
  /**
   * The value this hook last auto-wrote, or `null` if it hasn't written
   * anything yet this mount. This is the authorship signal: once set, only
   * an exact match to what we wrote counts as "still ours" — any other
   * value means the user edited the name and we must leave it alone.
   */
  lastAutoName: string | null;
}

export interface AutoBotNameDecision {
  /** The composed auto name for the current inputs. */
  name: string;
  /**
   * Whether the field is currently the auto-namer's to manage. When false,
   * the user has taken the name over and it must not be touched.
   */
  isOurs: boolean;
}

/**
 * Decide the auto name for the current inputs and whether we're allowed to
 * write it. The caller writes `decision.name` iff `decision.isOurs`, and
 * records `decision.name` as its new `lastAutoName` whenever `isOurs` — so
 * the field's authorship stays tracked across preset/pair changes.
 */
export const decideAutoBotName = ({
  prefix,
  presetLabel,
  botTypeLabel,
  currentName,
  presetLabels,
  lastAutoName,
}: DecideAutoBotNameInputs): AutoBotNameDecision => {
  const name = composeAutoBotName({ prefix, presetLabel, botTypeLabel });
  const current = currentName.trim();

  const isOurs =
    // Already exactly what we'd write — ours, nothing to change.
    current === name ||
    (lastAutoName === null
      ? // First run this mount: adopt an empty/default name, or one that
        // matches the shape we'd generate for THIS prefix (survives a
        // remount that reset `lastAutoName` without clobbering user edits).
        current === '' ||
        current === 'New Bot' ||
        matchesAutoShape(current, prefix, botTypeLabel, presetLabels)
      : // We've written before: only the exact value we wrote is still
        // ours. Anything else (incl. the user clearing it) is the user's.
        current === lastAutoName);

  return { name, isOurs };
};
