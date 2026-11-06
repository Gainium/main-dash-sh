import { useState } from 'react';
import { Loader2, Monitor, ShieldCheck, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import {
  useForgetDevice,
  useKnownDevices,
  type KnownDevice,
} from '@/hooks/useKnownDevices';
import { toast } from '@/lib/toast';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : null);

function DeviceRow({
  device,
  onForget,
  forgetting,
}: {
  device: KnownDevice;
  onForget: (d: KnownDevice) => void;
  forgetting: boolean;
}) {
  const mobile = !!device.device && /iOS|Android/i.test(device.device);
  const lastSeen = fmt(device.lastSeen);
  const meta = [
    device.location,
    device.ip,
    lastSeen ? `Last used ${lastSeen}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center justify-between gap-md py-sm">
      <div className="flex items-center gap-sm min-w-0">
        {mobile ? (
          <Smartphone className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <Monitor className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-xs">
            {device.device || 'Unknown device'}
            {device.current && (
              <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                (this device)
              </span>
            )}
          </p>
          {meta && (
            <p className="text-xs text-muted-foreground truncate">{meta}</p>
          )}
        </div>
      </div>
      {!device.current && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={forgetting}
          onClick={() => onForget(device)}
        >
          {forgetting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Forget'}
        </Button>
      )}
    </div>
  );
}

/**
 * Known devices — the browsers this account has signed in from. A password
 * sign-in from any other browser needs a code emailed to the account.
 * Forgetting a device also ends its sessions. Cloud edition only: the
 * self-hosted API has no device history.
 */
const KnownDevicesCard: React.FC = () => {
  const { data: devices = [], isLoading } = useKnownDevices();
  const forget = useForgetDevice();
  const [pending, setPending] = useState<KnownDevice | null>(null);

  const handleForget = () => {
    if (!pending) return;
    forget.mutate(pending.id, {
      onSuccess: () => toast.success('Device forgotten'),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : 'Could not forget device'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-xs text-primary">
          <ShieldCheck className="w-4 h-4" />
          Known devices
          <Tooltip tooltip="Browsers that have signed in to your account. Signing in with your password from any other browser needs a code we email you. Forget a device you don't recognise: it is signed out and needs the code next time.">
            <InfoIcon />
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-sm text-sm text-muted-foreground py-md">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground py-md">
            No known devices.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {devices.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                onForget={setPending}
                forgetting={forget.isPending && forget.variables === d.id}
              />
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title="Forget this device?"
        description="It is signed out and needs an emailed code to sign in with your password again."
        confirmText="Forget"
        variant="destructive"
        onConfirm={handleForget}
      />
    </Card>
  );
};

export default KnownDevicesCard;
