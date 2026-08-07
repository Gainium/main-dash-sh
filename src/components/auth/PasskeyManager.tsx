import React, { useState } from 'react';
import { Check, Fingerprint, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  isWebAuthnSupported,
  useListPasskeys,
  useRegisterPasskey,
  useRenamePasskey,
  useRevokePasskey,
} from '@/hooks/useWebAuthn';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

interface PasskeyRowProps {
  credentialId: string;
  label?: string | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
  onRename: (credentialId: string, label: string) => Promise<void>;
  onRevoke: (credentialId: string) => Promise<void>;
  renaming: boolean;
  revoking: boolean;
}

const PasskeyRow: React.FC<PasskeyRowProps> = ({
  credentialId,
  label,
  createdAt,
  lastUsedAt,
  onRename,
  onRevoke,
  renaming,
  revoking,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label || '');

  const startEdit = () => {
    setDraft(label || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    const next = draft.trim();
    if (!next) return;
    if (next === (label || '')) {
      setEditing(false);
      return;
    }
    await onRename(credentialId, next);
    setEditing(false);
  };

  return (
    <li className="flex items-center justify-between gap-md rounded-lg bg-muted/40 p-md shadow-sm ring-1 ring-border/40 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-md min-w-0 flex-1">
        <Fingerprint className="w-5 h-5 text-white shrink-0" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') setEditing(false);
              }}
              disabled={renaming}
              className="h-8 text-sm"
            />
          ) : (
            <p className="text-sm font-medium truncate">
              {label || 'Unnamed passkey'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Added {formatDate(createdAt)}
            {lastUsedAt ? ` · Last used ${formatDate(lastUsedAt)}` : ''}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-xs shrink-0">
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={saveEdit}
              disabled={renaming || !draft.trim()}
              aria-label="Save name"
            >
              {renaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={renaming}
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={startEdit}
              aria-label={`Rename ${label || 'passkey'}`}
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevoke(credentialId)}
              disabled={revoking}
              aria-label={`Remove ${label || 'passkey'}`}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
};

/**
 * Lists registered passkeys and lets the user add, rename, or revoke them.
 * Renders nothing when the browser lacks WebAuthn support.
 */
const PasskeyManager: React.FC = () => {
  const supported = isWebAuthnSupported();
  const list = useListPasskeys();
  const register = useRegisterPasskey();
  const rename = useRenamePasskey();
  const revoke = useRevokePasskey();

  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        This browser does not support passkeys. Try a recent version of Chrome,
        Safari, Firefox, or Edge on a device with biometrics or a security key.
      </p>
    );
  }

  const handleAdd = async () => {
    setError(null);
    try {
      const args = label.trim() ? { label: label.trim() } : {};
      await register.mutateAsync(args);
      toast.success('Passkey added');
      setLabel('');
      setShowAddForm(false);
    } catch (err) {
      logger.error('Passkey add failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      setError(err instanceof Error ? err.message : 'Failed to add passkey');
    }
  };

  const handleRename = async (credentialId: string, newLabel: string) => {
    setError(null);
    try {
      await rename.mutateAsync({ credentialId, label: newLabel });
      toast.success('Passkey renamed');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to rename passkey',
      );
    }
  };

  const handleRevoke = async (credentialId: string) => {
    setError(null);
    try {
      await revoke.mutateAsync({ credentialId });
      toast.success('Passkey removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove passkey');
    }
  };

  const passkeys = list.data ?? [];

  return (
    <div className="space-y-sm">
      <p className="text-sm text-muted-foreground">
        Passkeys let you sign in with biometrics or a hardware security key
        instead of a password.
      </p>

      {list.isLoading && (
        <div className="flex items-center gap-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading passkeys…</span>
        </div>
      )}

      {!list.isLoading && passkeys.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No passkeys registered yet.
        </p>
      )}

      {passkeys.length > 0 && (
        <ul className="grid gap-sm sm:grid-cols-2">
          {passkeys.map((pk) => (
            <PasskeyRow
              key={pk.credentialId}
              credentialId={pk.credentialId}
              label={pk.label}
              createdAt={pk.createdAt}
              lastUsedAt={pk.lastUsedAt}
              onRename={handleRename}
              onRevoke={handleRevoke}
              renaming={rename.isPending}
              revoking={revoke.isPending}
            />
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {showAddForm ? (
        <div className="space-y-xs">
          <Label htmlFor="passkey-label" className="text-sm">
            Passkey name (optional)
          </Label>
          <Input
            id="passkey-label"
            value={label}
            placeholder="e.g. MacBook Touch ID"
            onChange={(e) => setLabel(e.target.value)}
            disabled={register.isPending}
          />
          <div className="flex gap-xs">
            <Button
              onClick={handleAdd}
              disabled={register.isPending}
              className="flex-1"
            >
              {register.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Add passkey
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddForm(false);
                setLabel('');
                setError(null);
              }}
              disabled={register.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          onClick={() => setShowAddForm(true)}
          disabled={register.isPending}
        >
          <Fingerprint className="w-4 h-4 text-white" />
          Add a new passkey
        </Button>
      )}
    </div>
  );
};

export default PasskeyManager;
