import type { BotFormData } from '@/types/bots/form';

/**
 * A hedge leg's freshest formData for the mode on screen. Quick mode's legs
 * publish into the quick ref, Manual's into the form ref, and a leg that is
 * not mounted falls back to its seed. The other mode's ref keeps its last
 * value after that mode's legs unmount, so it is never read.
 */
export const pickLegFormData = (
  hedgeMode: 'quick' | 'manual',
  refs: {
    quick: BotFormData | null;
    manual: BotFormData | null;
    seed: Partial<BotFormData> | undefined;
  }
): BotFormData | null =>
  (hedgeMode === 'quick' ? refs.quick : refs.manual) ??
  ((refs.seed as BotFormData | undefined) ?? null);
