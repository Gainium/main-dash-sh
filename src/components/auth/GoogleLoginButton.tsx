import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/apiClient';
import { RealAuthService } from '@/lib/realAuthService';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/auth';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import React from 'react';

/** The multicolor Google "G" mark, drawn inline so the custom button
 *  doesn't depend on Google's iframe for its visuals. */
const GoogleGlyph: React.FC = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.28A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 0 0 0 10.78l4.01-3.11Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
    />
  </svg>
);

interface GoogleLoginButtonProps {
  /**
   * Callback function called when login is successful
   */
  onSuccess?: () => void;
  /**
   * Callback function called when login fails
   * @param error - Error message describing the failure
   */
  onError?: (error: string) => void;
  /**
   * Callback function called when 2FA is required
   * @param temporaryToken - Temporary token for 2FA authentication
   */
  onOTPRequired?: (temporaryToken: string) => void;
  /**
   * Custom class name for styling
   */
  className?: string;
  /**
   * Whether to show the Google One Tap prompt
   */
  useOneTap?: boolean;
  /**
   * Whether to enable auto-select for the user
   */
  autoSelect?: boolean;
  /**
   * Whether terms have been accepted
   */
  termsAccepted?: boolean;
  /**
   * Whether the button should be disabled
   */
  disabled?: boolean;
}

interface GoogleJwtPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

interface GoogleAuthResponse {
  accessToken: string;
  user: User;
}

interface OTPRequiredError extends Error {
  temporaryToken?: string;
}

/**
 * Google OAuth login button component
 *
 * This component integrates with Google OAuth2 for authentication.
 * On successful Google authentication, it sends the Google token to the backend
 * `/auth/google` endpoint and handles the response by updating the auth store.
 *
 * @example
 * ```tsx
 * <GoogleLoginButton
 *   onSuccess={() => navigate('/overview')}
 *   onError={(error) => setError(error)}
 * />
 * ```
 */
export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  onSuccess,
  onError,
  onOTPRequired,
  className,
  useOneTap = false,
  autoSelect = false,
  termsAccepted = false,
  disabled = false,
}) => {
  const { login, setLoading } = useAuthStore();

  const handleGoogleSuccess = async (credentialResponse: {
    credential?: string;
  }) => {
    try {
      if (disabled || !termsAccepted) {
        onError?.('Please accept the terms and conditions to continue.');
        return;
      }

      setLoading(true);

      // Validate the credential response
      if (!credentialResponse?.credential) {
        throw new Error('No credential received from Google');
      }

      // Decode the Google JWT to get user info (for validation only)
      let googlePayload: GoogleJwtPayload;
      try {
        googlePayload = jwtDecode<GoogleJwtPayload>(
          credentialResponse.credential
        );
      } catch (decodeError) {
        console.error('Failed to decode Google JWT:', decodeError);
        throw new Error('Invalid Google credential format');
      }

      // Validate essential fields are present
      if (!googlePayload.sub || !googlePayload.email || !googlePayload.name) {
        throw new Error('Missing required user information from Google');
      }

      let authResponse: GoogleAuthResponse;

      // Use real or mock authentication based on environment
      if (
        import.meta.env.MODE === 'development' &&
        import.meta.env.VITE_USE_MOCK_AUTH !== 'false'
      ) {
        // Mock Google authentication for development
        const response = await apiClient.post<GoogleAuthResponse>(
          '/auth/google',
          {
            googleToken: credentialResponse.credential,
          }
        );

        if (!response.data.accessToken || !response.data.user) {
          throw new Error('Invalid response from authentication server');
        }

        authResponse = response.data;
      } else {
        // Real Google authentication using GraphQL
        authResponse = await RealAuthService.loginWithGoogle(
          credentialResponse.credential
        );
      }

      // Update auth state with the tokens and user info from backend
      login(authResponse.accessToken, authResponse.user);

      // Call success callback
      onSuccess?.();
    } catch (error) {
      console.error('Google login failed:', error);

      // Handle OTP_REQUIRED error specially
      if (error instanceof Error && error.message === 'OTP_REQUIRED') {
        const otpError = error as OTPRequiredError;
        if (otpError.temporaryToken && onOTPRequired) {
          onOTPRequired(otpError.temporaryToken);
          return; // Don't call onError, just trigger 2FA flow
        } else {
          onError?.(
            'Two-factor authentication is required, but no temporary token was provided.'
          );
          return;
        }
      }

      // Determine appropriate error message
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = 'Login failed. Please try again.';
      }

      // Call error callback
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    const errorMessage = 'Google login was cancelled or failed';
    console.error(errorMessage);
    onError?.(errorMessage);
  };

  return (
    <div className={className}>
      <div
        className={`relative group ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {/* Visual layer: our own button, styled like the other auth
            rows. The real Google widget sits on top, invisible, and
            captures the click — the backend needs the ID-token
            credential only the GIS button flow returns. */}
        <Button
          type="button"
          variant="outline"
          tabIndex={-1}
          aria-hidden
          className="w-full h-11 pointer-events-none group-hover:bg-accent group-hover:text-accent-foreground"
        >
          <GoogleGlyph />
          <span className="ml-xs">Continue with Google</span>
        </Button>
        <div className="absolute inset-0 opacity-[0.001] overflow-hidden">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            useOneTap={useOneTap}
            auto_select={autoSelect}
            theme="filled_black"
            size="large"
            text="signin_with"
            shape="rectangular"
            logo_alignment="left"
            width="400"
            containerProps={{
              style: {
                height: '100%',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default GoogleLoginButton;
