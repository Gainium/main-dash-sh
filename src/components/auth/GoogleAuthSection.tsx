import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { Tooltip } from '@/components/ui/tooltip';
import React from 'react';

/**
 * Google auth button with the terms-gating tooltip, as used by both
 * Login and SignUp. The button is disabled until the ToS checkbox is
 * ticked; the tooltip explains why.
 */
const GoogleAuthSection: React.FC<{
  termsAccepted: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
  onOTPRequired: (temporaryToken: string) => void;
}> = ({ termsAccepted, onSuccess, onError, onOTPRequired }) => (
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
      onSuccess={onSuccess}
      onError={onError}
      onOTPRequired={onOTPRequired}
      termsAccepted={termsAccepted}
      disabled={!termsAccepted}
      className="w-full"
    />
  </Tooltip>
);

export default GoogleAuthSection;
