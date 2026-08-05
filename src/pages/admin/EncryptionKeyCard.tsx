import { KeyRound, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AdminGeneratedEncryptionKey } from '@/lib/api/adminClient';
import { toast } from '@/lib/toast';

import {
  useEncryptionKeyStatus,
  useGenerateEncryptionKey,
} from './useAdminApi';

const DOCS_URL =
  'https://github.com/Gainium/docker-sh/blob/main/DEPLOYMENT.md#encryption-key';

/**
 * Offers to give this installation an encryption key of its own.
 *
 * Generating one is a single line in `.env`, and the operator can do it on
 * the host with `./setupEncryptKey.sh`. This exists because the ones who most
 * need it are the ones who will never read that far — so the recommendation
 * is put where they already are, with the work already done.
 *
 * It renders nothing at all once a key is configured. There is no "manage" or
 * "rotate" here on purpose: replacing a key that is already protecting data is
 * a planned operation with a migration attached, not a button.
 */
export function EncryptionKeyCard() {
  const { data } = useEncryptionKeyStatus();
  const generate = useGenerateEncryptionKey();
  const [generated, setGenerated] = useState<AdminGeneratedEncryptionKey | null>(
    null
  );
  const [saved, setSaved] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');

  const handleGenerate = useCallback(() => {
    generate.mutate(undefined, {
      onSuccess: (result) => {
        setSaved(false);
        setCopyLabel('Copy');
        setGenerated(result);
      },
      onError: (err) => toast.error(err.message),
    });
  }, [generate]);

  const handleCopy = useCallback(async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.key);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 1500);
    } catch {
      toast.error('Unable to copy. Select the key and copy it manually.');
    }
  }, [generated]);

  // `undefined` while loading, and on an admin-sh that predates the route.
  // Nothing to say in either case.
  if (!data || data.configured) return null;

  return (
    <>
      <Card compact className="p-md">
        <div className="flex items-start gap-sm">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <div className="text-sm font-semibold">Encryption key</div>
            <p className="text-xs text-muted-foreground">
              The exchange API credentials your users store are encrypted with
              the key that ships in the build, which is the same in every
              installation. Giving this one a key of its own is recommended —{' '}
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
              >
                what this protects
              </a>
              .
            </p>
            {!data.canGenerate ? (
              <p className="text-xs text-muted-foreground">
                Run{' '}
                <span className="font-mono">./setupEncryptKey.sh</span> on the
                host instead — admin-sh cannot reach{' '}
                <span className="font-mono">.env</span> from here.
              </p>
            ) : null}
          </div>
          {data.canGenerate ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating
                </>
              ) : (
                'Generate key'
              )}
            </Button>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={generated !== null}
        // Only closable through the button below, so the key cannot be
        // dismissed by a stray click before it has been read.
        onOpenChange={(open) => {
          if (!open && saved) setGenerated(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-xs text-base">
              <KeyRound className="h-4 w-4" />
              Save this key
            </DialogTitle>
            <DialogDescription>
              Keep a copy somewhere outside this host. Without it, the exchange
              credentials encrypted under it cannot be recovered by anyone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-md">
            <div className="flex items-center gap-sm">
              <code className="flex-1 break-all rounded-lg bg-inner-container p-sm font-mono text-xs">
                {generated?.key}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={handleCopy}
              >
                {copyLabel}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              It has also been written to{' '}
              <span className="font-mono">{generated?.envFilePath}</span>, so
              it is not lost if you close this. Keep it with your database
              backups — a backup you cannot decrypt is not a backup.
            </p>
            <p className="text-xs text-muted-foreground">
              The stack picks the key up the next time it is recreated. Run{' '}
              <span className="font-mono">{generated?.applyCommand}</span> when
              it suits you; credentials already stored are re-encrypted
              afterwards on their own.
            </p>
            <label className="flex items-start gap-sm text-xs">
              <Checkbox
                checked={saved}
                onCheckedChange={(v) => setSaved(v === true)}
                className="mt-0.5"
              />
              <span>I have saved a copy of this key.</span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button
              size="sm"
              disabled={!saved}
              onClick={() => setGenerated(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EncryptionKeyCard;
