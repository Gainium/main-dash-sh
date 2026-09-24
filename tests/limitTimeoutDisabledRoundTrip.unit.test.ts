import { test, expect } from '@playwright/test';

import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { BotTypesEnum } from '@/types';

/**
 * Editing an unrelated field (maxNumberOfOpenDeals) on a bot whose Enter
 * Market Timeout toggle is OFF wrote `limitTimeout: "0"` back to the bot:
 * the edit loader rewrote the stored seconds to '0' whenever the toggle was
 * off, while the new-bot form defaults to '20'. The loader must keep the
 * stored value, and fall back to the same default as the new-bot form.
 */
for (const type of [BotTypesEnum.dca, BotTypesEnum.combo]) {
  const section = type === BotTypesEnum.combo ? 'combo' : 'dca';

  test(`${section}: disabled limitTimeout keeps its stored seconds on load`, () => {
    const { formData } = mapBotSettingsToFormData(type, {
      limitTimeout: '20',
      useLimitTimeout: false,
    });
    expect(formData[section].limitTimeout).toBe('20');
    expect(formData[section].useLimitTimeout).toBe(false);
  });

  test(`${section}: missing limitTimeout loads the new-bot default`, () => {
    const { formData } = mapBotSettingsToFormData(type, {});
    expect(formData[section].limitTimeout).toBe(DCA_FORM_DEFAULTS.limitTimeout);
    expect(formData[section].useLimitTimeout).toBe(false);
  });

  test(`${section}: enabled limitTimeout still loads`, () => {
    const { formData } = mapBotSettingsToFormData(type, {
      limitTimeout: '45',
      useLimitTimeout: true,
    });
    expect(formData[section].limitTimeout).toBe('45');
    expect(formData[section].useLimitTimeout).toBe(true);
  });
}
