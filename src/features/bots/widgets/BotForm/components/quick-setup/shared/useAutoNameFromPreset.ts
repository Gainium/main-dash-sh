import { useEffect, useRef } from 'react';

import {
  useBotFormState,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';

import { decideAutoBotName } from './autoBotName';

interface UseAutoNameFromPresetArgs {
  /** 'create' | 'edit' — only auto-fill in create mode. */
  mode: string;
  /** First pair in the bot's pair list (used as the name prefix). */
  firstPair: string;
  /**
   * Number of pairs selected. When > 1 the prefix becomes
   * `{firstPair} +{n-1}` (e.g. `BTCUSDT +4`) to signal a multi-pair bot.
   * Defaults to 1 (single pair). Only DCA Quick mode ever passes > 1.
   */
  pairCount?: number;
  /** The currently-active preset (provides the suffix label, when set). */
  activePreset: { label: string } | null | undefined;
  /**
   * All preset labels in this bot type's catalog. Used to detect names
   * that look auto-generated so we don't clobber user-typed names.
   */
  presetLabels: ReadonlyArray<string>;
  /**
   * Bot type label — always included in the name (e.g. 'DCA', 'Combo',
   * 'Grid'), with the active preset label appended after it when set.
   */
  botTypeLabel: string;
}

/**
 * Auto-fills `formData.name` with `{prefix} {botType} {preset?} {date}` —
 * the bot type is always present, the active preset label is appended after
 * it when one is selected, and today's ISO date closes the name. The prefix
 * is the first pair, or `{firstPair} +{n-1}` when several pairs are
 * selected. E.g. `BTCUSDT DCA Conservative 2026-07-01`, `BTCUSDT DCA
 * 2026-07-01`, or `BTCUSDT +4 Grid Mid-term 2026-07-01`.
 *
 * Once the user edits the name, we stop touching it: authorship is tracked
 * via the `lastAutoName` ref (the value we last wrote), so any value that
 * doesn't match what we wrote is treated as the user's and left alone —
 * including edits to the pair prefix and clearing the field. See
 * `decideAutoBotName` for the full rule.
 */
export const useAutoNameFromPreset = ({
  mode,
  firstPair,
  pairCount = 1,
  activePreset,
  presetLabels,
  botTypeLabel,
}: UseAutoNameFromPresetArgs): void => {
  const { formData, updateFormData } = useBotFormState();
  // The value we last auto-wrote, or null before our first write this mount.
  const lastAutoName = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'create') return;
    if (!firstPair) return;
    // `formData.name` is usually a string, but imported settings (the
    // envelope `form` branch of the import dialog) can inject a non-string
    // value straight into form state. Coerce before use so a numeric name
    // doesn't crash the form ("(name ?? '').trim is not a function").
    const currentName = String(formData.name ?? '');

    const prefix = pairCount > 1 ? `${firstPair} +${pairCount - 1}` : firstPair;
    const { name, isOurs } = decideAutoBotName({
      prefix,
      presetLabel: activePreset?.label ?? null,
      botTypeLabel,
      currentName,
      presetLabels,
      lastAutoName: lastAutoName.current,
    });
    if (!isOurs) return;

    // Record authorship even when the value already matches, so the ref
    // tracks the field from its very first (possibly pre-seeded) value.
    lastAutoName.current = name;
    if (currentName.trim() !== name) {
      updateFormData('name' as Fields, name);
    }
  }, [
    activePreset,
    firstPair,
    pairCount,
    mode,
    formData.name,
    presetLabels,
    botTypeLabel,
    updateFormData,
  ]);
};
