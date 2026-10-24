import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';

/**
 * Shown when a Google/Discord sign-in names an email with no Gainium
 * account. Nothing is created until the user confirms: `onCreate`
 * retries the same provider sign-in with account creation allowed.
 */
const AccountNotFound: React.FC<{
  onCreate: () => Promise<void>;
  onBack: () => void;
}> = ({ onCreate, onBack }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    setIsCreating(true);
    try {
      await onCreate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create your account.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-lg text-center">
      <div className="space-y-xs">
        <h1 className="text-2xl font-bold text-foreground">
          Account not found. Want to create a new one?
        </h1>
        <p className="text-muted-foreground">
          It seems no account was registered with these details.
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        type="button"
        variant="gradient"
        onClick={handleCreate}
        disabled={isCreating}
        className="w-full h-12 font-medium"
      >
        {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
        Create new account
      </Button>

      <p className="text-sm text-muted-foreground">
        Or{' '}
        <button
          type="button"
          onClick={onBack}
          disabled={isCreating}
          className="text-primary hover:underline"
        >
          log in
        </button>{' '}
        with another method
      </p>
    </div>
  );
};

export default AccountNotFound;
