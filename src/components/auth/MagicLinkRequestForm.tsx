import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/tooltip';
import { useRequestMagicLink } from '@/hooks/useMagicLink';
import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';

/**
 * Email → "send magic link" → "check your inbox" state machine, shared
 * by Login (framed inline panel with Cancel) and SignUp (plain, always
 * open). The link itself both signs in existing users and creates
 * accounts for new ones — the consume page handles ToS acceptance.
 */
const MagicLinkRequestForm: React.FC<{
  title: string;
  description?: string;
  submitLabel?: string;
  submitVariant?: 'outline' | 'gradient';
  initialEmail?: string;
  /** When provided, renders a Cancel button and the sent-state Close
   *  dismisses the panel via this callback (Login behavior). Without
   *  it the sent state offers "Use a different email" (SignUp). */
  onCancel?: () => void;
  /** Wrap in the bordered panel style (Login's inline drop-down). */
  framed?: boolean;
  /** When false, disables submit with a ToS tooltip (SignUp gating).
   *  Leave undefined to skip terms gating (Login behavior). */
  termsAccepted?: boolean;
}> = ({
  title,
  description,
  submitLabel = 'Send link',
  submitVariant = 'outline',
  initialEmail = '',
  onCancel,
  framed = false,
  termsAccepted,
}) => {
  const [stage, setStage] = useState<'form' | 'sent'>('form');
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const magicLink = useRequestMagicLink();

  const termsBlocked = termsAccepted === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    try {
      await magicLink.mutateAsync({ email: email.trim() });
      setStage('sent');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to send sign-in link.'
      );
    }
  };

  if (stage === 'sent') {
    return (
      <div className="rounded-lg border border-border bg-muted p-md space-y-xs text-center">
        <p className="text-sm font-medium">Check your inbox</p>
        <p className="text-xs text-muted-foreground">
          We sent a link to {email}. Click it to sign in — or to create
          your account if you&apos;re new. It expires in a few minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              setStage('form');
            }
          }}
          className="text-xs text-primary hover:underline"
        >
          {onCancel ? 'Close' : 'Use a different email'}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        framed
          ? 'space-y-xs rounded-lg border border-border p-md'
          : 'space-y-xs'
      }
    >
      <Label htmlFor="magic-email" className="text-sm font-medium">
        {title}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Input
        id="magic-email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12"
        required
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-xs">
        <Tooltip
          tooltip={
            termsBlocked
              ? 'Please accept the terms and conditions first'
              : undefined
          }
          side="bottom"
          triggerClassName="flex-1"
        >
          <Button
            type="submit"
            variant={submitVariant}
            disabled={magicLink.isPending || termsBlocked}
            className={
              submitVariant === 'gradient'
                ? 'w-full h-12 font-medium'
                : 'w-full'
            }
          >
            {magicLink.isPending && (
              <Loader2 className="w-4 h-4 animate-spin mr-xs" />
            )}
            {submitLabel}
          </Button>
        </Tooltip>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={magicLink.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

export default MagicLinkRequestForm;
