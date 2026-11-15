import { logger } from '@/lib/loggerInstance';
import { BotTypesEnum, type Bot, type ComboBot, type DCABot } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import { buildBotEditRoute } from '@/utils/bots/navigation';
import { Maximize2 } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import ReadOnlyBotForm from '@/features/bots/widgets/BotForm/ReadOnlyBotForm';
import { DrawerSection } from './DrawerSection';
import { useDrawerSectionFullscreen } from './useDrawerSectionFullscreen';

const LOG_PREFIX = 'DrawerBotSettings';

interface DrawerBotSettingsProps {
  widgetId: string;
  botId: string;
  bot?: DrawerBot;
}

/**
 * Resolve the concrete BotTypesEnum from the DrawerBot.
 *
 * DrawerBot carries a `type` field that may be a BotTypesEnum value or a
 * legacy string.  We normalise it here so we can pass it to ReadOnlyBotForm.
 */
const resolveBotType = (bot: DrawerBot): BotTypesEnum => {
  const raw = bot.type as string;

  if (raw === BotTypesEnum.grid || raw === 'grid') return BotTypesEnum.grid;
  if (raw === BotTypesEnum.combo || raw === 'combo') return BotTypesEnum.combo;

  // DCA is the default / most common type
  return BotTypesEnum.dca;
};

const DrawerBotSettings: React.FC<DrawerBotSettingsProps> = ({
  widgetId,
  bot,
}) => {
  const navigate = useNavigate();
  const { isFullscreen, enterFullscreen } =
    useDrawerSectionFullscreen(widgetId);

  const botType = useMemo(
    () => (bot ? resolveBotType(bot) : BotTypesEnum.dca),
    [bot]
  );

  if (!bot) {
    logger.warnCategory(LOG_PREFIX, 'Bot data not available');
    return (
      <Card position={1} className="p-md">
        <div className="text-sm text-muted-foreground text-center py-8">
          Bot data not available
        </div>
      </Card>
    );
  }

  const handleEdit = () => {
    const editPath = buildBotEditRoute(bot.type, bot.id);
    logger.infoCategory(LOG_PREFIX, 'Navigating to edit bot', {
      botId: bot.id,
      path: editPath,
    });
    navigate(editPath);
  };

  // DrawerSection (a headerless WidgetWrapper) names the widget in the
  // full-screen view; `bare` keeps the title off the tab body (the tab bar
  // right above already says "Settings"). With `fill` the wrapper's own
  // scroller is the one the form scrolls in, so the sticky section nav sticks
  // to it, and the full-screen control lives in that nav row instead of a
  // strip reserved above it. The nav sits outside the read-only form's
  // disabled <fieldset>, so the button stays clickable.
  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-bot-settings"
      title="Settings"
      bare
      fill
    >
      <ReadOnlyBotForm
        bot={bot as unknown as DCABot | ComboBot | Bot}
        botType={botType}
        showNavigation
        onEditClick={handleEdit}
        navigationActions={
          isFullscreen ? undefined : (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={enterFullscreen}
              title="Enter fullscreen"
              aria-label="Enter fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          )
        }
      />
    </DrawerSection>
  );
};

export default DrawerBotSettings;
