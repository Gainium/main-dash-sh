import ExchangeIcon from '@/components/widgets/shared/ExchangeIcon';
import { Celebration } from '@/components/onboarding/Celebration';
import type { ExchangeInUser } from '@/types/exchange.types';
import {
  formatExchangeProvider,
  getProviderIcon,
} from '@/utils/exchangeUtils';
import { Bot, Check } from 'lucide-react';
import React from 'react';

interface ExchangeAddedCelebrationProps {
  open: boolean;
  /** Every exchange the backend created — an "All" provider returns several. */
  exchanges: ExchangeInUser[];
  /** Dismiss without going anywhere. */
  onClose: () => void;
  /** Primary CTA — opens the new-bot wizard. */
  onCreateBot: () => void;
}

const isPaperProvider = (provider: string): boolean =>
  provider.toLowerCase().includes('paper');

/**
 * Success moment for "exchange connected". Connecting an account is the step
 * that turns a browsing user into a trading one, so it gets the same
 * confetti + next-step treatment as creating a bot — and the next step it
 * offers is exactly that: create a bot.
 */
const ExchangeAddedCelebration: React.FC<ExchangeAddedCelebrationProps> = ({
  open,
  exchanges,
  onClose,
  onCreateBot,
}) => {
  const count = exchanges.length;
  const first = exchanges[0];
  const isPaper = first ? isPaperProvider(first.provider.toString()) : false;

  const title =
    count > 1 ? `🎉 ${count} accounts connected!` : '🎉 Exchange connected!';

  const description = isPaper
    ? 'Your paper account is funded and ready. Spin up a bot to see the strategy run — no real funds at risk.'
    : 'Your account is linked and balances are syncing. The next step is putting it to work with a bot.';

  return (
    <Celebration
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      primaryAction={{
        label: 'Create a bot',
        onClick: onCreateBot,
      }}
      secondaryAction={{
        label: 'Not now',
        variant: 'outline',
      }}
    >
      <div className="flex flex-col gap-xs rounded-lg bg-foreground/[0.04] p-sm">
        {exchanges.map((exchange) => {
          const [brand, type] = formatExchangeProvider(
            exchange.provider.toString()
          ).split('\n');

          return (
            <div key={exchange.uuid} className="flex items-center gap-sm">
              <ExchangeIcon
                icon={getProviderIcon(exchange.provider.toString())}
                size="w-8 h-8"
              />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">
                  {exchange.name || brand}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {brand}
                  {type ? ` · ${type}` : ''}
                </div>
              </div>
              <Check className="h-4 w-4 shrink-0 text-success" />
            </div>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-xs text-xs text-muted-foreground">
        <Bot className="h-3.5 w-3.5 shrink-0" />
        Bots trade on this account — pick a strategy to get started.
      </p>
    </Celebration>
  );
};

export default ExchangeAddedCelebration;
export type { ExchangeAddedCelebrationProps };
