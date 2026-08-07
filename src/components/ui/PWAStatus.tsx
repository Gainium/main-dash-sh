import { useNetworkStatus, usePWAInstall, usePWAUpdate } from '@/hooks/usePWA';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Smartphone,
  X,
} from 'lucide-react';
import React from 'react';
import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './card';

interface PWAStatusProps {
  className?: string;
}

export const PWAStatus: React.FC<PWAStatusProps> = ({ className = '' }) => {
  const { updateAvailable, updateInstalled, updateServiceWorker } =
    usePWAUpdate();
  const { showBackOnline, isOffline } = useNetworkStatus();
  const { canInstall, isInstalled, promptInstall, dismissInstall } =
    usePWAInstall();

  // Show install banner when the app can be installed and is not already installed
  const shouldShowInstallBanner = canInstall && !isInstalled;

  // Component status tracking

  return (
    <div
      className={`fixed top-4 right-4 z-50 space-y-sm ${className}`}
    >
      {/* Offline Indicator */}
      {isOffline && (
        <Card className="max-w-sm shadow-lg border-warning/20 bg-warning/10">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium text-warning">
                You are offline - showing cached data
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PWA Install Prompt */}
      {shouldShowInstallBanner && (
        <Card className="max-w-sm shadow-lg border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-5 h-5 text-primary" />
              <span className="text-primary">Install Gainium</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={dismissInstall}
                className="ml-auto h-6 w-6 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
            <CardDescription className="text-sm">
              Install for a better experience with offline support and quick
              access.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-2">
              <Button
                onClick={promptInstall}
                variant="gradient"
                size="sm"
                className="flex-1 font-medium"
              >
                Install Now
              </Button>
              <Button
                onClick={dismissInstall}
                variant="outline"
                size="sm"
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                Not Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Back Online Notification */}
      {showBackOnline && (
        <Card className="max-w-sm shadow-lg border-success/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="font-medium text-success">Back online!</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Available Notification */}
      {updateAvailable && (
        <Card className="max-w-sm shadow-lg border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="w-5 h-5 text-primary" />
              <span className="text-primary">Update Available</span>
            </CardTitle>
            <CardDescription className="text-sm">
              A new version of the app is ready to install.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              onClick={updateServiceWorker}
              variant="gradient"
              size="sm"
              className="w-full font-medium"
            >
              Update Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Update Installed Notification */}
      {updateInstalled && (
        <Card className="max-w-sm shadow-lg border-success/20">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <div>
                <div className="font-medium text-success">App Updated</div>
                <div className="text-sm text-muted-foreground">
                  The app has been updated successfully!
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const OfflineIndicator: React.FC<{ isFromCache?: boolean }> = ({
  isFromCache,
}) => {
  const { isOffline } = useNetworkStatus();

  if (!isOffline && !isFromCache) return null;

  return (
    <Card className="max-w-sm border-warning/20">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <span className="text-sm font-medium">
            {isOffline
              ? 'You are offline - showing cached data'
              : 'Showing cached data'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
