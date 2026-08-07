import { LogoLockup } from '@/components/common/LogoLockup';
import LoggerDrawer from '@/components/dev/LoggerDrawer';
import { Card } from '@/components/ui/card';
import {
  redirectToV1App,
  setPreferredUiVersion,
} from '@/lib/uiVersionPreference';
import React from 'react';

/**
 * Shared frame for the unauthenticated auth pages (Login, SignUp):
 * centered card with the logo, the marketing footer links, the
 * "Switch to V1" escape hatch, and the dev logger drawer. Page
 * content (headings, forms, terms) renders as children inside the card.
 */
const AuthPageShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <>
    <div className="min-h-screen bg-background flex items-center justify-center p-md relative">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <div className="p-xl">
            <div className="text-center">
              <div className="inline-flex items-center gap-xs">
                <LogoLockup className="w-50 h-8" />
              </div>
            </div>
            {children}
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

export default AuthPageShell;
