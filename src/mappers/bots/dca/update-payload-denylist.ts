/**
 * The fields a bot-update payload must NOT carry.
 *
 * The bot form is mapped by `mapFormDataToPayload`, which emits every field the
 * form knows about. The GraphQL change-mutations accept a strictly smaller set:
 * `changeDCABotInput` declares 163 fields, `changeComboBotInput` 175. Apollo
 * rejects an undeclared input field outright — `BAD_USER_INPUT`, the whole
 * mutation fails — so the extra keys have to be removed before the call.
 *
 * This is a DENY-list, which is the fragile direction: a new form field that no
 * change-input declares is not stripped by default, and every affected save
 * starts failing. `tests/botSavePayloadSchema.unit.test.ts` is the guard for
 * that — it drives the real mapper, applies these exact lists, and asserts the
 * result is a subset of the declared fields in
 * `tests/fixtures/graphql-bot-input-fields.json`. Add a field here and the
 * guard goes green again; that test failing is the intended way to find out.
 *
 * Lives in one module because there are three call sites that must agree:
 * `useFormHandlers` (dca + combo branches) and `HedgeBotEditLayout` (per leg).
 * They were three hand-maintained copies and had already drifted on
 * `importFrom`.
 */

/**
 * Declared by no change-input at all, so unconditionally unsafe.
 *
 * All six are client-side form state rather than bot settings: `type` selects
 * which form is open, `useMulti` / `useLimitPrice` / `terminalDealType` /
 * `useExperimental` gate UI, and `importFrom` names the preset the form was
 * seeded from. The create path strips `importFrom` separately
 * (`map-form-data-to-payload.ts`); the update path had only been stripping it
 * on the hedge legs.
 */
export const UNDECLARED_BY_ALL_INPUTS = [
  'useMulti',
  'type',
  'useLimitPrice',
  'terminalDealType',
  'useExperimental',
  'importFrom',
] as const;

/**
 * Combo-only settings: declared by `changeComboBotInput` but NOT by
 * `changeDCABotInput`. They ride the shared form section, so a DCA save has to
 * drop them while a combo save keeps them. This asymmetry is the reason the two
 * branches differ, and it is exactly 8 fields wide.
 */
export const DECLARED_BY_COMBO_ONLY = [
  'gridLevel',
  'baseStep',
  'baseGridLevels',
  'useActiveMinigrids',
  'comboActiveMinigrids',
  'feeOrder',
  'comboSlLimit',
  'comboTpLimit',
] as const;

export type UpdatePayloadBotType = 'dca' | 'combo';

export interface StripUndeclaredOptions {
  /** Which change-input the payload is bound for. */
  botType: UpdatePayloadBotType;
  /**
   * Drop `pair` as well.
   *
   * `pair` IS declared by both inputs, so this is a behavioural choice, not a
   * schema one: both resolvers reject a pair change on a non-multi bot with
   * "Cannot change pair for non-multi pairs bot", and that rejection kills
   * every sibling field in the same payload. Callers pass `!useMulti`.
   */
  stripPair: boolean;
}

/** The full list applied for a given bot type — also read by the guard test. */
export const denylistFor = (
  botType: UpdatePayloadBotType,
  stripPair: boolean
): string[] => [
  ...UNDECLARED_BY_ALL_INPUTS,
  ...(botType === 'dca' ? DECLARED_BY_COMBO_ONLY : []),
  ...(stripPair ? ['pair'] : []),
];

/**
 * Remove every field the target change-input will not accept.
 *
 * Returns a new object; the input is not mutated.
 */
export const stripUndeclaredUpdateFields = <T extends Record<string, unknown>>(
  payload: T,
  { botType, stripPair }: StripUndeclaredOptions
): T => {
  const denied = new Set<string>(denylistFor(botType, stripPair));
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !denied.has(key))
  ) as T;
};
