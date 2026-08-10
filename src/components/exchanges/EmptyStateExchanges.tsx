import { Plus } from 'lucide-react';
import React from 'react';
import { Button } from '../ui/button';

export interface EmptyStateExchangesProps {
  className?: string;
  onAddExchange?: () => void;
}

const EmptyStateExchanges: React.FC<EmptyStateExchangesProps> = ({
  className = '',
  onAddExchange,
}) => {
  return (
    <div className={`col-span-full p-sm ${className}`}>
      <div className="flex flex-col items-center justify-center gap-md py-16">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground">
          <Plus className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-semibold">No exchanges connected</h3>
        <p className="text-sm text-muted-foreground max-w-xl text-center">
          Connect your first exchange to sync balances and begin trading. You
          can add live or paper trading accounts.
        </p>
        <div className="mt-4">
          <Button onClick={onAddExchange} variant="default" size="xl">
            <Plus className="w-5 h-5 mr-2" /> Connect an exchange
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmptyStateExchanges;
