import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import PasskeyLoginButton from '@/components/auth/PasskeyLoginButton';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import TwoFactorAuth from '@/components/auth/TwoFactorAuth';
import { LogoLockup } from '@/components/common/LogoLockup';
import LoggerDrawer from '@/components/dev/LoggerDrawer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip } from '@/components/ui/tooltip';
import { IS_CLOUD } from '@/config/mode';
import { useRequestMagicLink } from '@/hooks/useMagicLink';
import { useRequestPasswordReset } from '@/hooks/usePasswordReset';
import { useAuthCapabilities } from '@/lib/auth';
import { RealAuthService } from '@/lib/realAuthService';
import {
  redirectToV1App,
  setPreferredUiVersion,
} from '@/lib/uiVersionPreference';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/auth';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoginResponse {
  accessToken: string;
  user: User;
}

interface OTPRequiredError extends Error {
  temporaryToken: string;
}

type AuthMode = 'login' | 'register';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, setLoading, isLoading, isAuthenticated } = useAuthStore();

  // Where to land after a successful sign-in. Honors a same-origin `redirectTo`
  // query param (used by the OAuth consent flow to return the user to the
  // consent screen with its params intact); defaults to /overview. Captured
  // once at mount via a ref: a fresh login navigates to the target and the
  // `isAuthenticated` effect below can fire a second time *after* the URL has
  // already changed — reading the live URL there would lose redirectTo and
  // bounce the user to /overview. The ref keeps the original target stable.
  const redirectToRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('redirectTo'),
  );
  const postLoginTarget = (): string => {
    const rt = redirectToRef.current;
    return rt && rt.startsWith('/') ? rt : '/overview';
  };

  // Already signed in? Bounce to overview. Effect (not Navigate) so the
  // existing login flows can still mount briefly and trigger their own
  // navigation when they complete a fresh sign-in.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(postLoginTarget(), { replace: true });
    }
  }, [isAuthenticated, navigate]);
  const { google: googleEnabled, registration: registrationEnabled } =
    useAuthCapabilities();

  // `undefined` while checkUserExist is in flight on first-install builds.
  const [mode, setMode] = useState<AuthMode | undefined>(
    registrationEnabled ? undefined : 'login'
  );
  const [modeError, setModeError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);

  // Magic-link and password-reset inline panels.
  const [magicMode, setMagicMode] = useState<
    'closed' | 'form' | 'sent'
  >('closed');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicError, setMagicError] = useState<string | null>(null);
  const magicLink = useRequestMagicLink();
  const [resetMode, setResetMode] = useState<'closed' | 'form' | 'sent'>(
    'closed'
  );
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const passwordReset = useRequestPasswordReset();

  // Register form state
  const [registerForm, setRegisterForm] = useState({
    licenseKey: '',
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    lastName: '',
    picture: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    weekStart: 'm' as 'm' | 's',
  });
  const [passwordValid, setPasswordValid] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) {
      setError('Avatar must be smaller than 256kB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRegisterForm((prev) => ({
        ...prev,
        picture: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    // `checkUserExist` is a sh-only GraphQL field — cloud's backend
    // doesn't expose it, so guard the probe with both the capability
    // flag and the build-mode flag.
    if (!registrationEnabled || IS_CLOUD) return;
    let cancelled = false;
    RealAuthService.checkUserExist()
      .then((exists) => {
        if (cancelled) return;
        setMode(exists ? 'login' : 'register');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // If the backend probe fails, fall back to login form so the
        // page is still usable. Surface the reason so users can debug
        // their backend URL.
        setModeError(
          err instanceof Error
            ? err.message
            : 'Could not reach backend to check user state.'
        );
        setMode('login');
      });
    return () => {
      cancelled = true;
    };
  }, [registrationEnabled]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }

    try {
      setLoading(true);
      const response: LoginResponse = await RealAuthService.loginWithPassword(
        email,
        password
      );
      login(response.accessToken, response.user);
      navigate(postLoginTarget());
    } catch (error) {
      console.error('Login failed:', error);
      let errorMessage = 'Login failed. Please try again.';
      if (error instanceof Error) {
        if (error.message === 'OTP_REQUIRED') {
          const tempToken = (error as OTPRequiredError).temporaryToken;
          if (tempToken) {
            setTemporaryToken(tempToken);
            setShowTwoFactor(true);
            return;
          } else {
            errorMessage =
              'Two-factor authentication is required, but no temporary token was provided.';
          }
        } else {
          errorMessage = error.message;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }
    if (!passwordValid) {
      setError('Password does not meet the requirements.');
      return;
    }
    if (!registerForm.licenseKey.trim()) {
      setError('License key is required.');
      return;
    }

    try {
      setLoading(true);
      const response = await RealAuthService.registerAccount({
        email: registerForm.email,
        password: registerForm.password,
        licenseKey: registerForm.licenseKey.trim(),
        timezone: registerForm.timezone,
        weekStart: registerForm.weekStart,
        ...(registerForm.name && { name: registerForm.name }),
        ...(registerForm.lastName && { lastName: registerForm.lastName }),
        ...(registerForm.picture && { picture: registerForm.picture }),
      });
      login(response.accessToken, response.user);
      navigate(postLoginTarget());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const updateRegisterField = <K extends keyof typeof registerForm>(
    key: K,
    value: (typeof registerForm)[K]
  ): void => {
    setRegisterForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBackFromTwoFactor = () => {
    setShowTwoFactor(false);
    setTemporaryToken(null);
    setError(null);
  };

  const handleGoogleSuccess = () => {
    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }
    navigate(postLoginTarget());
  };

  const handleGoogleError = (errorMessage: string) => setError(errorMessage);

  const handleGoogleOTPRequired = (temporaryToken: string) => {
    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }
    setTemporaryToken(temporaryToken);
    setShowTwoFactor(true);
    setError(null);
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicError(null);
    if (!magicEmail.trim()) {
      setMagicError('Enter your email.');
      return;
    }
    try {
      await magicLink.mutateAsync({ email: magicEmail.trim() });
      setMagicMode('sent');
    } catch (err) {
      setMagicError(
        err instanceof Error ? err.message : 'Failed to send sign-in link.'
      );
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetEmail.trim()) {
      setResetError('Enter your email.');
      return;
    }
    try {
      await passwordReset.mutateAsync({ email: resetEmail.trim() });
      setResetMode('sent');
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'Failed to send reset email.'
      );
    }
  };

  if (showTwoFactor && temporaryToken) {
    return (
      <TwoFactorAuth
        temporaryToken={temporaryToken}
        onBack={handleBackFromTwoFactor}
      />
    );
  }

  const isRegisterMode = mode === 'register';
  const heading = isRegisterMode
    ? 'Create your account'
    : IS_CLOUD
      ? 'Sign in or sign up'
      : 'Sign in';
  const subheading = isRegisterMode
    ? 'No users exist on this instance yet. Create the first account below.'
    : IS_CLOUD
      ? 'New to Gainium? Continue with Google or an email link — your account is created automatically, no separate sign-up needed.'
      : googleEnabled
        ? 'Choose a provider below, an account will be created if the email was not registered before.'
        : 'Enter your credentials to continue.';

  return (
    <>
      <div className="min-h-screen bg-background flex items-center justify-center p-md relative">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl">
            <div className="p-xl">
              <div className="text-center mb-md">
                <div className="inline-flex items-center gap-xs mb-md">
                  <LogoLockup className="w-50 h-8" />
                </div>
              </div>

              {mode === undefined ? (
                <div className="flex flex-col items-center justify-center py-2xl gap-md text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-sm">Checking backend…</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-foreground mb-xs">
                      {heading}
                    </h1>
                    <p className="text-muted-foreground">{subheading}</p>
                    {modeError && (
                      <p className="mt-xs text-xs text-amber-600 dark:text-amber-400">
                        {modeError}
                      </p>
                    )}
                  </div>

                  {error && (
                    <div className="mb-8 p-md bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-xs">
                      <svg
                        className="w-5 h-5 text-red-500 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 8v4m0 4h.01"
                        />
                      </svg>
                      <p className="text-sm text-center">{error}</p>
                    </div>
                  )}

                  {isRegisterMode ? (
                    <form
                      onSubmit={handleRegisterSubmit}
                      className="space-y-lg"
                    >
                      <div className="space-y-xs">
                        <Label htmlFor="licenseKey">
                          License key{' '}
                          <span className="text-muted-foreground font-normal">
                            (generate at{' '}
                            <a
                              href="https://app.gainium.io/settings/license-key"
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              gainium.io
                            </a>
                            )
                          </span>
                        </Label>
                        <Input
                          id="licenseKey"
                          placeholder="Enter your license key"
                          value={registerForm.licenseKey}
                          onChange={(e) =>
                            updateRegisterField('licenseKey', e.target.value)
                          }
                          className="h-12"
                          required
                        />
                      </div>

                      <div className="space-y-xs">
                        <Label htmlFor="register-email">Email</Label>
                        <Input
                          id="register-email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={registerForm.email}
                          onChange={(e) =>
                            updateRegisterField(
                              'email',
                              e.target.value.toLowerCase()
                            )
                          }
                          className="h-12"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-md">
                        <div className="space-y-xs">
                          <Label htmlFor="register-name">
                            First name
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              (optional)
                            </span>
                          </Label>
                          <Input
                            id="register-name"
                            value={registerForm.name}
                            onChange={(e) =>
                              updateRegisterField('name', e.target.value)
                            }
                            className="h-12"
                          />
                        </div>
                        <div className="space-y-xs">
                          <Label htmlFor="register-lastName">
                            Last name
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              (optional)
                            </span>
                          </Label>
                          <Input
                            id="register-lastName"
                            value={registerForm.lastName}
                            onChange={(e) =>
                              updateRegisterField('lastName', e.target.value)
                            }
                            className="h-12"
                          />
                        </div>
                      </div>

                      <div className="space-y-xs">
                        <Label htmlFor="register-picture">
                          Avatar
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            (optional, max 256kB)
                          </span>
                        </Label>
                        <div className="flex items-center gap-md">
                          {registerForm.picture && (
                            <img
                              src={registerForm.picture}
                              alt="Avatar preview"
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          )}
                          <Input
                            id="register-picture"
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="h-12 file:mr-md file:rounded file:border-0 file:bg-muted file:px-md file:py-xs file:text-sm cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="space-y-xs">
                        <Label htmlFor="register-password">Password</Label>
                        <div className="relative">
                          <Input
                            id="register-password"
                            type={showRegisterPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Create a strong password"
                            value={registerForm.password}
                            onChange={(e) =>
                              updateRegisterField('password', e.target.value)
                            }
                            className="h-12 pr-10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegisterPassword((s) => !s)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showRegisterPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-xs">
                        <Label htmlFor="register-confirm">
                          Confirm password
                        </Label>
                        <Input
                          id="register-confirm"
                          type={showRegisterPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Re-enter your password"
                          value={registerForm.confirmPassword}
                          onChange={(e) =>
                            updateRegisterField(
                              'confirmPassword',
                              e.target.value
                            )
                          }
                          className="h-12"
                          required
                        />
                      </div>

                      <PasswordChecklist
                        password={registerForm.password}
                        confirmPassword={registerForm.confirmPassword}
                        onChange={setPasswordValid}
                      />

                      <div className="space-y-xs">
                        <Label>Week starts on</Label>
                        <div className="flex gap-md text-sm">
                          <label className="flex items-center gap-xs cursor-pointer">
                            <input
                              type="radio"
                              name="weekStart"
                              checked={registerForm.weekStart === 'm'}
                              onChange={() =>
                                updateRegisterField('weekStart', 'm')
                              }
                            />
                            Monday
                          </label>
                          <label className="flex items-center gap-xs cursor-pointer">
                            <input
                              type="radio"
                              name="weekStart"
                              checked={registerForm.weekStart === 's'}
                              onChange={() =>
                                updateRegisterField('weekStart', 's')
                              }
                            />
                            Sunday
                          </label>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Timezone: {registerForm.timezone}
                      </p>

                      <Tooltip
                        tooltip={
                          !termsAccepted
                            ? 'Please accept the terms and conditions first'
                            : !passwordValid
                              ? 'Password does not meet requirements'
                              : undefined
                        }
                        side="bottom"
                        triggerClassName="w-full"
                      >
                        <Button
                          type="submit"
                          variant="gradient"
                          disabled={
                            isLoading ||
                            !termsAccepted ||
                            !passwordValid ||
                            !registerForm.licenseKey.trim()
                          }
                          className="w-full h-12 font-medium"
                        >
                          {isLoading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
                        </Button>
                      </Tooltip>
                    </form>
                  ) : (
                    <div className="space-y-lg mb-8">
                      {googleEnabled && (
                        <div className="flex flex-col items-center gap-md">
                          <div className="w-full max-w-xs">
                            <Tooltip
                              tooltip={
                                !termsAccepted
                                  ? 'Please accept the terms and conditions first'
                                  : undefined
                              }
                              side="top"
                              triggerClassName="w-full"
                            >
                              <GoogleLoginButton
                                onSuccess={handleGoogleSuccess}
                                onError={handleGoogleError}
                                onOTPRequired={handleGoogleOTPRequired}
                                termsAccepted={termsAccepted}
                                disabled={!termsAccepted}
                                className="w-full"
                              />
                            </Tooltip>
                          </div>
                        </div>
                      )}

                      {/* Passwordless options — cloud only. App-sh has no
                          mailer and no passkey backend so the buttons would
                          400 on click. Sh keeps password + signup. */}
                      {IS_CLOUD && magicMode === 'closed' && (
                        <div className="grid grid-cols-2 gap-xs">
                          <PasskeyLoginButton
                            termsAccepted={termsAccepted}
                            onError={(msg) => setError(msg)}
                            compactLabel
                            className="w-full h-11"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setMagicMode('form');
                              setMagicEmail(email);
                              setMagicError(null);
                            }}
                            className="w-full h-11"
                          >
                            <Mail className="w-4 h-4 mr-xs" />
                            Email link
                          </Button>
                        </div>
                      )}
                      {IS_CLOUD && magicMode === 'form' && (
                        <form
                          onSubmit={handleSendMagicLink}
                          className="space-y-xs rounded-lg border border-border p-md"
                        >
                          <Label
                            htmlFor="magic-email"
                            className="text-sm font-medium"
                          >
                            Sign in or sign up with email
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            We&apos;ll email you a link. New to Gainium? The
                            same link creates your account — no Google or
                            password needed.
                          </p>
                          <Input
                            id="magic-email"
                            type="email"
                            placeholder="you@example.com"
                            value={magicEmail}
                            onChange={(e) => setMagicEmail(e.target.value)}
                            className="h-12"
                            required
                          />
                          {magicError && (
                            <p className="text-xs text-red-500">{magicError}</p>
                          )}
                          <div className="flex gap-xs">
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={magicLink.isPending}
                              className="flex-1"
                            >
                              {magicLink.isPending && (
                                <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                              )}
                              Send link
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setMagicMode('closed');
                                setMagicError(null);
                              }}
                              disabled={magicLink.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                      {IS_CLOUD && magicMode === 'sent' && (
                        <div className="rounded-lg border border-border bg-muted p-md space-y-xs text-center">
                          <p className="text-sm font-medium">
                            Check your inbox
                          </p>
                          <p className="text-xs text-muted-foreground">
                            We sent a link to {magicEmail}. Click it to sign
                            in — or to create your account if you&apos;re
                            new. It expires in a few minutes.
                          </p>
                          <button
                            type="button"
                            onClick={() => setMagicMode('closed')}
                            className="text-xs text-primary hover:underline"
                          >
                            Close
                          </button>
                        </div>
                      )}

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            or continue with email
                          </span>
                        </div>
                      </div>

                      <form
                        onSubmit={handlePasswordLogin}
                        className="space-y-lg"
                      >
                        <div className="space-y-xs">
                          <Label htmlFor="email" className="sr-only">
                            Email
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-12"
                            required
                          />
                        </div>

                        <div className="space-y-xs">
                          <Label htmlFor="password" className="sr-only">
                            Password
                          </Label>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? 'text' : 'password'}
                              placeholder="••••••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="h-12 pr-10"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {showPassword ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          {IS_CLOUD && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setResetMode('form');
                                  setResetEmail(email);
                                  setResetError(null);
                                }}
                                className="text-xs text-muted-foreground hover:text-primary transition-colors"
                              >
                                Forgot password?
                              </button>
                            </div>
                          )}
                        </div>

                        <Tooltip
                          tooltip={
                            !termsAccepted
                              ? 'Please accept the terms and conditions first'
                              : undefined
                          }
                          side="bottom"
                          triggerClassName="w-full"
                        >
                          <Button
                            type="submit"
                            variant="gradient"
                            disabled={isLoading || !termsAccepted}
                            className="w-full h-12 font-medium"
                          >
                            {isLoading ? 'SIGNING IN...' : 'SIGN IN'}
                          </Button>
                        </Tooltip>
                      </form>

                      {/* Password-reset panel */}
                      {IS_CLOUD && resetMode === 'form' && (
                        <form
                          onSubmit={handleRequestPasswordReset}
                          className="space-y-xs rounded-lg border border-border p-md"
                        >
                          <Label
                            htmlFor="reset-email"
                            className="text-sm font-medium"
                          >
                            Send a password-reset email
                          </Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="you@example.com"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                            className="h-12"
                            required
                          />
                          {resetError && (
                            <p className="text-xs text-red-500">{resetError}</p>
                          )}
                          <div className="flex gap-xs">
                            <Button
                              type="submit"
                              variant="outline"
                              disabled={passwordReset.isPending}
                              className="flex-1"
                            >
                              {passwordReset.isPending && (
                                <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                              )}
                              Send reset link
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setResetMode('closed');
                                setResetError(null);
                              }}
                              disabled={passwordReset.isPending}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      )}
                      {IS_CLOUD && resetMode === 'sent' && (
                        <div className="rounded-lg border border-border bg-muted p-md space-y-xs text-center">
                          <p className="text-sm font-medium">
                            Reset email sent
                          </p>
                          <p className="text-xs text-muted-foreground">
                            If an account exists for {resetEmail}, we sent a
                            password-reset link. Check your inbox.
                          </p>
                          <button
                            type="button"
                            onClick={() => setResetMode('closed')}
                            className="text-xs text-primary hover:underline"
                          >
                            Close
                          </button>
                        </div>
                      )}

                    </div>
                  )}

                  <div className="mt-10 flex items-start space-x-xs">
                    <Checkbox
                      id="terms"
                      className="mt-0.5 size-5 sm:size-4"
                      checked={termsAccepted}
                      onCheckedChange={(checked) =>
                        setTermsAccepted(checked === true)
                      }
                    />
                    <Label
                      htmlFor="terms"
                      className="text-sm text-muted-foreground leading-relaxed"
                    >
                      Accept{' '}
                      <a
                        href="https://gainium.io/legal/terms-and-conditions"
                        className="text-primary hover:text-primary/80 underline transition-colors"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        terms and conditions
                      </a>
                    </Label>
                  </div>
                </>
              )}
            </div>
          </Card>

          <div className="mt-10 text-center space-y-md">
            <div className="flex justify-center space-x-lg text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">
                Home
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Help
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Academy
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                Blog
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                About Us
              </a>
            </div>
            <div className="flex justify-center text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => {
                  setPreferredUiVersion('v1');
                  redirectToV1App();
                }}
                className="hover:text-foreground transition-colors"
              >
                Switch to V1
              </button>
            </div>
          </div>
        </div>
      </div>
      {import.meta.env.DEV && (
        <div className="fixed inset-y-0 right-0 z-50 pointer-events-none">
          <div className="pointer-events-auto">
            <LoggerDrawer />
          </div>
        </div>
      )}
    </>
  );
};

export default Login;
