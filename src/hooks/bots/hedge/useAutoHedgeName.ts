import { useEffect, useRef } from 'react';

import { decideAutoBotName } from '@/features/bots/widgets/BotForm/components/quick-setup/shared/autoBotName';

/**
 * useAutoHedgeName — hedge-level counterpart to `useAutoNameFromPreset`.
 *
 * The regular auto-name hook sources everything from a mounted leg's
 * BotFormProvider (`useBotFormState`), which throws outside a leg. A hedge
 * bot's name lives on the outer HedgeBotFormProvider and must auto-fill
 * even when no leg is mounted (e.g. the Hedge tab), so this hook takes all
 * of its inputs as arguments and reads/writes the hedge-scoped
 * `hedgeName` / `setHedgeName` instead.
 *
 * The naming rules are identical to the regular hook and shared via
 * `decideAutoBotName`: in create mode only, when the long leg's pair is
 * known, it composes `{longLegPair} {botType} {preset?} {date}` and writes
 * it — but only while the name is still the auto-namer's (blank, the bare
 * `New Bot` default, or the exact value we last wrote). Anything the user
 * typed is left untouched.
 */

interface UseAutoHedgeNameArgs {
  /** 'create' | 'edit' — only auto-fill in create mode. */
  mode: string;
  /**
   * The long leg's selected pair, published only by the long leg. Null
   * until the long leg has been visited (Manual) or mounted (Quick); the
   * name stays blank until then.
   */
  longLegPair: string | null;
  /**
   * Number of pairs on the long leg. When > 1 the prefix becomes
   * `{longLegPair} +{n-1}` (e.g. `BTCUSDT +4`), matching the regular
   * bots' multi-pair naming. Defaults to 1 (single pair).
   */
  longLegPairCount?: number;
  /** The currently-selected hedge preset (Quick), or null (Manual). */
  activePreset: { label: string } | null | undefined;
  /** All hedge preset labels, used to detect auto-generated names. */
  presetLabels: ReadonlyArray<string>;
  /**
   * Hedge bot type label used when no preset is active (e.g. 'Hedge DCA',
   * 'Hedge Combo').
   */
  botTypeLabel: string;
  /** Current shared hedge name. */
  hedgeName: string;
  /** Setter for the shared hedge name. */
  setHedgeName: (next: string) => void;
}

export const useAutoHedgeName = ({
  mode,
  longLegPair,
  longLegPairCount = 1,
  activePreset,
  presetLabels,
  botTypeLabel,
  hedgeName,
  setHedgeName,
}: UseAutoHedgeNameArgs): void => {
  // The value we last auto-wrote, or null before our first write this mount.
  const lastAutoName = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'create') return;
    if (!longLegPair) return;
    const currentName = hedgeName ?? '';

    const prefix =
      longLegPairCount > 1
        ? `${longLegPair} +${longLegPairCount - 1}`
        : longLegPair;
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
      setHedgeName(name);
    }
  }, [
    mode,
    longLegPair,
    longLegPairCount,
    activePreset,
    presetLabels,
    botTypeLabel,
    hedgeName,
    setHedgeName,
  ]);
};
