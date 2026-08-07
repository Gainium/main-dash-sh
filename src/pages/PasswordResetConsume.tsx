import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoLockup } from '@/components/common/LogoLockup';
import { PasswordChecklist } from '@/components/auth/PasswordChecklist';
import { useResetPassword } from '@/hooks/usePasswordReset';
import { RealAuthService } from '@/lib/realAuthService';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';

/**
 * Consumes a password-reset token: lets the user set a new password,
 * then logs them in with the JWT the backend returns.
 */
const PasswordResetConsume: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValid, setPasswordValid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Reset link is missing its token.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!passwordValid) {
      setError('Password does not meet the requirements.');
      return;
    }

    try {
      const { token: jwt } = await resetPassword.mutateAsync({
        token,
        newPassword: password,
      });
      const user = await RealAuthService.getUserInfo(jwt);
      login(jwt, user);
      toast.success('Password updated. You are now signed in.');
      navigate('/overview', { replace: true });
    } catch (err) {
      logger.error('Password reset failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      setError(
        err instanceof Error ? err.message : 'Could not reset your password.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <div className="p-xl">
            <div className="text-center">
              <div className="inline-flex items-center gap-xs">
                <LogoLockup className="w-50 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Choose a new password
              </h1>
              <p className="text-muted-foreground">
                You will be signed in after submitting.
              </p>
            </div>

            {error && (
              <div className="p-md bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-lg">
              <div className="space-y-xs">
                <Label htmlFor="reset-password">New password</Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-xs">
                <Label htmlFor="reset-confirm">Confirm new password</Label>
                <Input
                  id="reset-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-12"
                  required
                />
              </div>

              <PasswordChecklist
                password={password}
                confirmPassword={confirm}
                onChange={setPasswordValid}
              />

              <Button
                type="submit"
                variant="gradient"
                disabled={resetPassword.isPending || !passwordValid}
                className="w-full h-12 font-medium"
              >
                {resetPassword.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Reset password
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PasswordResetConsume;
