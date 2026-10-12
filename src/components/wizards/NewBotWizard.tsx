import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Slot } from '@/lib/extensions';
import { logger } from '@/lib/loggerInstance';
import type { BotTypesEnum } from '@/types';
import { BOT_TYPE_CONFIG, getBotTypeRoute } from '@/utils/botUtils';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BOT_TYPE_ANIMATIONS } from './BotAnimations';

interface NewBotWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Hide bot types that should NOT appear in the new-bot wizard option list.
// Signal bot infrastructure (types, registry entries, icons, etc.) is kept
// intact elsewhere; this just hides the option from the create-bot picker.
const HIDDEN_BOT_TYPES = new Set<string>([
  'signal',
  'terminal',
  'hedgeDca',
  'hedgeCombo',
]);

const botTypes = (
  Object.keys(BOT_TYPE_CONFIG) as Array<BotTypesEnum | string>
).filter((t) => !HIDDEN_BOT_TYPES.has(t));

const botDescriptions: Record<string, string> = {
  dca: 'Supercharged dollar-cost averaging strategy with a wide range of advanced settings.',
  grid: 'Capitalize on every market price movement by adapting to any price level range.',
  combo:
    'Blend DCA and grid strategies under one configuration for the best of both.',
  hedgeDca: 'DCA strategy with hedge protection against market downturns.',
  hedgeCombo: 'Combo strategy with hedge protection against market downturns.',
  signal: 'Execute your strategy using webhook signals from any source.',
  terminal: 'Advanced terminal for manual trading and strategy execution.',
};

export const NewBotWizard: React.FC<NewBotWizardProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(0);
      setSelectedType(null);
    }, 200);
  };

  const handleCreateScratch = () => {
    if (!selectedType) return;

    try {
      sessionStorage.setItem(
        'botConfig',
        JSON.stringify({ type: selectedType, manual: true })
      );
    } catch (err) {
      logger.error('[NewBotWizard] Failed to stage bot config for create', {
        err,
      });
    }

    close();
    navigate(`${getBotTypeRoute(selectedType)}/new`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl !max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create Bot</DialogTitle>
        </DialogHeader>
        <DialogBody className="overflow-auto px-6 py-6 pb-24">
          {step === 0 && (
            <div className="flex flex-col gap-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg">
                {botTypes.map((t) => {
                  const config =
                    BOT_TYPE_CONFIG[t as keyof typeof BOT_TYPE_CONFIG];
                  if (!config) return null;
                  const Icon = config.icon;
                  const Animation = BOT_TYPE_ANIMATIONS[t];

                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedType(t)}
                      className={`group flex flex-col gap-md p-md rounded-lg border text-left transition-colors bg-inner-container
                      ${selectedType === t ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/50'}
                      `}
                    >
                      <div className="flex items-center justify-center rounded-md overflow-hidden w-full aspect-[16/9] bg-muted">
                        {Animation ? (
                          <Animation className="w-full h-full" />
                        ) : (
                          <Icon className="h-10 w-10" />
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-semibold">
                          {config.label}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {botDescriptions[t] || 'Bot type'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* buttons moved to footer */}
            </div>
          )}

          {step === 1 && (
            <Slot
              name="newBot.templates"
              selectedType={selectedType}
              onClose={close}
            />
          )}
        </DialogBody>
        <DialogFooter className="flex items-center gap-xs sticky bottom-0 bg-card z-10 px-6 py-4 border-t">
          <div className="flex items-center gap-xs">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-xs">
            {step === 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={!selectedType}
                >
                  From Template
                </Button>
                <Button
                  variant="default"
                  onClick={() => handleCreateScratch()}
                  disabled={!selectedType}
                >
                  From Scratch
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewBotWizard;
