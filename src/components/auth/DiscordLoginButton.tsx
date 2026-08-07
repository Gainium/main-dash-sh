import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import React from 'react';

/** Discord brand mark, inline so no asset dependency. */
const DiscordGlyph: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#5865F2"
      d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
    />
  </svg>
);

/**
 * "Continue with Discord" row. Redirects to Discord's OAuth2
 * implicit-grant authorize URL; the /auth/discord callback page
 * consumes the access token from the URL fragment and exchanges it
 * for a Gainium JWT via the shared oauth mutation.
 */
const DiscordLoginButton: React.FC<{
  termsAccepted: boolean;
  className?: string;
  /** Post-login destination, forwarded through the OAuth `state`. */
  redirectTo?: string | null;
}> = ({ termsAccepted, className, redirectTo }) => {
  const clientId = import.meta.env['VITE_DISCORD_CLIENT_ID'] as
    | string
    | undefined;
  if (!clientId) return null;

  const handleClick = () => {
    // CSRF nonce, verified by the callback page. The post-login
    // redirect rides along inside the same state payload.
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('discord-oauth-nonce', nonce);
    const state = btoa(
      JSON.stringify({ n: nonce, r: redirectTo || undefined })
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${window.location.origin}/auth/discord`,
      response_type: 'token',
      scope: 'identify email',
      state,
    });
    window.location.assign(
      `https://discord.com/oauth2/authorize?${params.toString()}`
    );
  };

  return (
    <Tooltip
      tooltip={
        !termsAccepted
          ? 'Please accept the terms and conditions first'
          : undefined
      }
      side="top"
      triggerClassName="w-full"
    >
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={!termsAccepted}
        className={className}
      >
        <DiscordGlyph />
        <span className="">Continue with Discord</span>
      </Button>
    </Tooltip>
  );
};

export default DiscordLoginButton;
