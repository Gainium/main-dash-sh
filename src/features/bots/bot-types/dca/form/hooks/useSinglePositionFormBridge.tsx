// Wires single position per pair into the bot form shell: whether the backend
// has it, the bot's saved value, the save confirmation that adopts open deals
// (spec 139 §5.1.3). Kept out of the 4k-line form shell so the whole feature
// reads in one place. Backtests need nothing here: the backtester simulates
// single position (§8) from the form's own DCA settings.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { SinglePositionAdoptionDialog } from '@/components/deals/SinglePositionAdoptionDialog';
import {
  useInvalidateSinglePosition,
  useSinglePositionClient,
  useSinglePositionSettings,
} from '@/hooks/useSinglePosition';
import { logger } from '@/lib/loggerInstance';
import {
  buildAdoptionPreview,
  isMultiDealRefusal,
  isTurningSinglePositionOn,
  type AdoptionPreviewRow,
} from '@/lib/singlePosition/singlePosition';
import {
  fetchBotOpenDeals,
  withRestingTpPrices,
  type OpenDealForPreview,
} from '@/lib/singlePosition/singlePositionApi';
import { toast } from '@/lib/toast';
import type { SaveExtraInput } from '@/hooks/bots/dca/useFormHandlers';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';


interface Options {
  /** A regular DCA bot form (not combo, grid, hedge leg or terminal deal). */
  enabled: boolean;
  mode: string;
  botId: string | undefined;
  bot: unknown;
  botSettings: unknown;
  getFormData: () => BotFormData;
  setFormData: React.Dispatch<React.SetStateAction<BotFormData>>;
  setErrors: React.Dispatch<React.SetStateAction<BotFormErrors>>;
  /** Runs the save with the extra top-level input. */
  save: (extra: SaveExtraInput) => void;
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
  return source;
};

export function useSinglePositionFormBridge({
  enabled,
  mode,
  botId,
  bot,
  botSettings,
  getFormData,
  setFormData,
  setErrors,
  save,
}: Options) {
  const isEdit = mode === 'edit' && !!botId;
  const ids = useMemo(() => (isEdit && botId ? [botId] : []), [isEdit, botId]);
  // Fresh on every mount: the settings can change outside this form (another
  // tab, the API, Max), and a cached value would be saved back with the form.
  const { backend, byBot, isFetching } = useSinglePositionSettings(
    ids,
    enabled,
    isEdit
  );
  const supported = enabled && backend === 'new';
  const saved = isEdit && botId && !isFetching ? byBot[botId] : undefined;
  const invalidate = useInvalidateSinglePosition();
  const { make } = useSinglePositionClient();

  // The flag that lets the form show and send the setting.
  useEffect(() => {
    setFormData((prev) =>
      !!prev.singlePositionSupported === supported
        ? prev
        : { ...prev, singlePositionSupported: supported }
    );
  }, [supported, setFormData]);

  // The shared fragments do not carry the new fields (an older backend would
  // reject the bot query), so the saved values are merged into the settings
  // the form initializes from.
  const savedExtra = useMemo<Record<string, unknown> | null>(
    () =>
      saved
        ? {
            singlePosition: saved.singlePosition,
            maxPositionEntries: saved.maxPositionEntries,
          }
        : null,
    [saved]
  );
  const mergedBotSettings = useMemo(
    () => mergeSettings(botSettings, savedExtra),
    [botSettings, savedExtra]
  );
  const mergedBot = useMemo(() => mergeSettings(bot, savedExtra), [bot, savedExtra]);

  // The form initializes from the bot query, which may land before or after
  // this one; the fresh saved values are written into the form once per
  // mount, whichever arrives first.
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!saved || !botId || appliedFor.current === botId) return;
    appliedFor.current = botId;
    setFormData((prev) =>
      prev.dca.singlePosition === saved.singlePosition &&
      prev.dca.maxPositionEntries === saved.maxPositionEntries
        ? prev
        : {
            ...prev,
            dca: {
              ...prev.dca,
              singlePosition: saved.singlePosition,
              maxPositionEntries: saved.maxPositionEntries,
            },
          }
    );
  }, [saved, botId, setFormData]);

  const [rows, setRows] = useState<AdoptionPreviewRow[] | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const checkingRef = useRef(false);

  const loadPreview = useCallback(async (): Promise<AdoptionPreviewRow[]> => {
    if (!botId) return [];
    const formData = getFormData();
    const deals: OpenDealForPreview[] = await fetchBotOpenDeals(make(), botId);
    const nextAssets: Record<string, string> = {};
    for (const deal of deals) {
      if (deal.baseAsset) nextAssets[deal.symbol] = deal.baseAsset;
    }
    setAssets(nextAssets);
    const bot = {
      strategy: formData.dca.strategy,
      tpPerc: formData.dca.tpPerc,
      useTp: formData.dca.useTp,
    };
    // A first pass names the target of each pair; only their resting take
    // profits are loaded (one small orders request per affected pair).
    const targets = buildAdoptionPreview(deals, bot).map((r) => r.targetDealId);
    const withTp = await withRestingTpPrices(
      make(),
      botId,
      deals,
      targets,
      formData.dca.strategy
    );
    return buildAdoptionPreview(withTp, bot);
  }, [botId, getFormData, make]);

  /**
   * Called before an edit save. True when it took the save over (the
   * confirmation is open); false when the save should go ahead as usual.
   */
  const interceptSave = useCallback(async (): Promise<boolean> => {
    if (!supported || !isEdit || checkingRef.current) return false;
    const formData = getFormData();
    if (
      !isTurningSinglePositionOn(saved?.singlePosition, formData.dca.singlePosition)
    ) {
      return false;
    }
    checkingRef.current = true;
    try {
      const preview = await loadPreview();
      if (preview.length === 0) return false;
      setRows(preview);
      return true;
    } catch (error) {
      // Without the preview the user cannot be asked; the server still refuses
      // an adoption that was not confirmed, so let the save run and say so.
      logger.warn('[singlePosition] Could not load open deals for the preview', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, [supported, isEdit, getFormData, saved?.singlePosition, loadPreview]);

  /** A refused save: open the confirmation for a multi-deal refusal, flag the toggle otherwise. */
  const onSaveError = useCallback(
    (message: string) => {
      if (!supported) return;
      const reason = message.replace(/^(Save failed:\s*)/i, '');
      if (isMultiDealRefusal(reason)) {
        void loadPreview()
          .then((preview) => {
            if (preview.length > 0) setRows(preview);
          })
          .catch(() => undefined);
        return;
      }
      if (/single position/i.test(reason)) {
        setErrors((prev) => ({ ...prev, singlePosition: reason }));
      }
    },
    [supported, loadPreview, setErrors]
  );

  const onSaveSuccess = useCallback(() => {
    if (supported) invalidate();
  }, [supported, invalidate]);

  const confirm = useCallback(() => {
    setRows(null);
    save({ adoptOpenDeals: true });
  }, [save]);

  const cancel = useCallback(() => {
    setRows(null);
    // §5.1.3: Cancel leaves the setting off.
    setFormData((prev) =>
      prev.dca.singlePosition
        ? { ...prev, dca: { ...prev.dca, singlePosition: false } }
        : prev
    );
    toast.info('Single position per pair was left off.');
  }, [setFormData]);

  const dialog = (
    <SinglePositionAdoptionDialog
      open={rows !== null}
      rows={rows ?? []}
      baseAssetOf={(pair) => assets[pair]}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );

  return {
    supported,
    botSettings: mergedBotSettings,
    bot: mergedBot,
    interceptSave,
    onSaveError,
    onSaveSuccess,
    dialog,
  };
}
