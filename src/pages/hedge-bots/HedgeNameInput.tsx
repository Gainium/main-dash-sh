import React from 'react';

import { Input } from '@/components/ui/input';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { useHedgeBotForm } from '@/contexts/bots/form/HedgeBotFormProvider';

/**
 * HedgeNameInput — the single "Bot Name" control for a hedge bot.
 *
 * A hedge bot is two leg bots saved under one shared name, so the per-leg
 * name inputs are hidden (BasicSettings gates on `isNestedLeg`) and this
 * one control edits the name for both legs at once. It binds to the outer
 * hedge context (`useHedgeBotForm().hedgeName`), NOT a leg BotFormProvider
 * — so it must be rendered by HedgeBotEditLayout (which lives under the
 * HedgeBotFormProvider) even when it sits inside HedgeFooterShell's
 * throwaway leg provider.
 *
 * Modeled on the leg NameInput visually, minus the field-variable binding
 * and validator alerts (those hang off a leg provider; the shared name has
 * no leg provider and blanks are tolerated — the payload mapper defaults an
 * empty name, matching regular-bot behavior).
 */
export const HedgeNameInput: React.FC = () => {
  const { hedgeName, setHedgeName } = useHedgeBotForm();

  return (
    <SettingsRow
      name="Bot Name"
      tooltip="Name for your hedge bot. Both legs are saved under this name."
      navId="name"
    >
      <Input
        id="hedge-bot-name"
        value={hedgeName}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setHedgeName(event.target.value)
        }
        placeholder="Enter a descriptive bot name"
      />
    </SettingsRow>
  );
};

export default HedgeNameInput;
