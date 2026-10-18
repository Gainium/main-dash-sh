// Wires base funding (short spot DCA / combo) into the bot form shell: whether
// the backend has it, and the bot's saved value, merged into the settings the
// form initializes from. Same shape as `useSinglePositionFormBridge`, whose
// output it takes. The shared fragments do not carry the field (an older
// backend would reject the bot query), hence the separate read.
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';

import { useBaseFundingSettings } from '@/hooks/useBaseFunding';
import type { BaseFundingBotKind } from '@/lib/baseFunding/baseFundingApi';
import type { BotFormData } from '@/types/bots/form';

interface Options {
  /** A regular DCA or combo bot form (not grid, hedge leg or terminal deal). */
  enabled: boolean;
  kind: BaseFundingBotKind;
  mode: string;
  botId: string | undefined;
  bot: unknown;
  botSettings: unknown;
  setFormData: Dispatch<SetStateAction<BotFormData>>;
}

const mergeSettings = (
  source: unknown,
  extra: Record<string, unknown> | null
): unknown => {
  if (!extra || !source || typeof source !== 'object') return source;
  const record = source as { settings?: unknown };
  if (record.settings && typeof record.settings === 'object') {
    return { ...record, settings: { ...(record.settings as object), ...extra } };
  }
  return { ...(source as object), ...extra };
};

export function useBaseFundingFormBridge({
  enabled,
  kind,
  mode,
  botId,
  bot,
  botSettings,
  setFormData,
}: Options) {
  const isEdit = mode === 'edit' && !!botId;
  const { backend, settings, isFetching } = useBaseFundingSettings(
    isEdit ? botId : undefined,
    kind,
    enabled,
    isEdit
  );
  const supported = enabled && backend === 'new';
  const saved = isEdit && !isFetching ? settings?.baseFunding : undefined;

  // The flag that lets the form show and send the setting.
  useEffect(() => {
    setFormData((prev) =>
      !!prev.baseFundingSupported === supported
        ? prev
        : { ...prev, baseFundingSupported: supported }
    );
  }, [supported, setFormData]);

  const savedExtra = useMemo<Record<string, unknown> | null>(
    () => (saved ? { baseFunding: saved } : null),
    [saved]
  );
  const mergedBotSettings = useMemo(
    () => mergeSettings(botSettings, savedExtra),
    [botSettings, savedExtra]
  );
  const mergedBot = useMemo(
    () => mergeSettings(bot, savedExtra),
    [bot, savedExtra]
  );

  // The bot query may land before or after this one; the saved value is
  // written into the form once per mount, whichever arrives first.
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!saved || !botId || appliedFor.current === botId) return;
    appliedFor.current = botId;
    setFormData((prev) =>
      prev[kind].baseFunding === saved
        ? prev
        : { ...prev, [kind]: { ...prev[kind], baseFunding: saved } }
    );
  }, [saved, botId, kind, setFormData]);

  return { supported, bot: mergedBot, botSettings: mergedBotSettings };
}
