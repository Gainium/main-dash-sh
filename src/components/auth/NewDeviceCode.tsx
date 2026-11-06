import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { logger } from '@/lib/loggerInstance';
import { RealAuthService } from '@/lib/realAuthService';
import type { User } from '@/types/auth';
import { ArrowLeft, Mail } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface NewDeviceCodeProps {
  challengeId: string;
  email: string;
  onSuccess: (accessToken: string, user: User) => void;
  onBack: () => void;
}

/**
 * Shown after a correct password from a browser this account has not used
 * before. The server emailed a 6-digit code; the session is issued only when
 * this browser sends it back.
 */
const NewDeviceCode: React.FC<NewDeviceCodeProps> = ({
  challengeId,
  email,
  onSuccess,
  onBack,
}) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== 6 || isSubmitting) return;
      try {
        setIsSubmitting(true);
        setError(null);
        const { accessToken, user } = await RealAuthService.confirmNewDevice(
          challengeId,
          value
        );
        onSuccess(accessToken, user);
      } catch (err) {
        logger.error('New-device code rejected:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'The code is incorrect or has expired'
        );
        setCode('');
        inputRef.current?.focus();
      } finally {
        setIsSubmitting(false);
      }
    },
    [challengeId, isSubmitting, onSuccess]
  );

  const handleChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(null);
    if (digits.length === 6) void submit(digits);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <div className="p-xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Check your email
              </h1>
              <p className="text-muted-foreground">
                Enter the code sent to{' '}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-6 p-md bg-red-500/10 border border-red-500/30 rounded-lg"
              >
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-xs">
              <Label htmlFor="newDeviceCode" className="sr-only">
                Sign-in code
              </Label>
              <Input
                ref={inputRef}
                id="newDeviceCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => handleChange(e.target.value)}
                className="h-12 text-center text-2xl font-mono tracking-widest"
                maxLength={6}
                disabled={isSubmitting}
              />
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <Button
                variant="ghost"
                onClick={onBack}
                className="w-full"
                disabled={isSubmitting}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to login
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default NewDeviceCode;
