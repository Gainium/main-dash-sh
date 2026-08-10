import AuthPageShell from '@/components/auth/AuthPageShell';
import DiscordLoginButton from '@/components/auth/DiscordLoginButton';
import GoogleAuthSection from '@/components/auth/GoogleAuthSection';
import MagicLinkRequestForm from '@/components/auth/MagicLinkRequestForm';
import TermsCheckbox from '@/components/auth/TermsCheckbox';
import TwoFactorAuth from '@/components/auth/TwoFactorAuth';
import { useAuthCapabilities } from '@/lib/auth';
import { usePostLoginTarget } from '@/hooks/usePostLoginTarget';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/**
 * Cloud-only sign-up page. Same backend flows as Login (Google OAuth +
 * magic link — the link creates the account on first use), but stripped
 * of everything sign-in-specific: no password form, no passkey, no
 * forgot-password. Sign-up wording throughout.
 */
const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const postLoginTarget = usePostLoginTarget();
  const { google: googleEnabled, discord: discordEnabled } =
    useAuthCapabilities();

  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);

  // A Google "sign-up" by an existing user with 2FA enabled still needs
  // the OTP step — same handling as Login.
  const handleGoogleOTPRequired = (token: string) => {
    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }
    setTemporaryToken(token);
    setShowTwoFactor(true);
    setError(null);
  };

  if (showTwoFactor && temporaryToken) {
    return (
      <TwoFactorAuth
        temporaryToken={temporaryToken}
        onBack={() => {
          setShowTwoFactor(false);
          setTemporaryToken(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <AuthPageShell>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Create your account
        </h1>
        <p className="text-muted-foreground">
          Get started free — no password needed
        </p>
      </div>

      {error && (
        <div className="mb-8 p-md bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-center">{error}</p>
        </div>
      )}

      <div className="space-y-lg mb-8">
        <div className="space-y-sm">
          {googleEnabled && (
            <GoogleAuthSection
              termsAccepted={termsAccepted}
              onSuccess={() => {
                if (!termsAccepted) {
                  setError(
                    'Please accept the terms and conditions to continue.'
                  );
                  return;
                }
                navigate(postLoginTarget());
              }}
              onError={setError}
              onOTPRequired={handleGoogleOTPRequired}
            />
          )}
          {discordEnabled && (
            <DiscordLoginButton
              termsAccepted={termsAccepted}
              redirectTo={postLoginTarget()}
              className="w-full h-11"
            />
          )}
        </div>

        {(googleEnabled || discordEnabled) && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or sign up with email
              </span>
            </div>
          </div>
        )}

        <MagicLinkRequestForm
          title="Email"
          description="We'll email you a link that creates your account — no password to remember."
          submitLabel="CONTINUE WITH EMAIL"
          submitVariant="gradient"
          termsAccepted={termsAccepted}
        />
      </div>

      <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} />

      <p className="mt-8 text-sm text-center text-muted-foreground">
        Already have an account?{' '}
        <Link
          to="/login"
          className="text-primary hover:text-primary/80 underline transition-colors"
        >
          Sign in
        </Link>
      </p>
    </AuthPageShell>
  );
};

export default SignUp;
