import { useAPIKeysOperations } from '@/hooks/useAPIKeys';
import { useUserSettingsOperations } from '@/hooks/useUserSettings';
import { toast } from '@/lib/toast';
import {
  Check,
  Copy,
  Edit,
  Key as KeyIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { InfoIcon, Tooltip } from '../ui/tooltip';

type APIKey = {
  _id: string;
  secret?: string;
  created: string;
  expired: string;
  permission: 'read' | 'write';
  name?: string;
  paperContext?: boolean | null;
  botId?: string | null;
};

type EditState =
  | { mode: 'name'; key: APIKey; value: string }
  | { mode: 'botId'; key: APIKey; value: string }
  | null;

type ConfirmState =
  | { mode: 'delete'; key: APIKey }
  | { mode: 'renew'; key: APIKey }
  | null;

const formatDate = (s: string) => {
  try {
    const d = new Date(s);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return s;
  }
};

const maskKey = (k: string) =>
  k.length <= 8 ? k : `${k.substring(0, 2)}••••${k.substring(k.length - 6)}`;

const APIKeysSection = () => {
  const { user, isLoading } = useUserSettingsOperations();
  const apiKeysOps = useAPIKeysOperations();
  const apiKeys: APIKey[] = (user?.apiKeys ?? []) as APIKey[];

  const [edit, setEdit] = useState<EditState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const newKey = apiKeysOps.newAPIKey as APIKey | undefined;
  const showNewKeyDialog = !!newKey;

  useEffect(() => {
    if (apiKeysOps.createError) {
      toast.error(
        `Failed to create API key: ${apiKeysOps.createError.message}`,
      );
    }
  }, [apiKeysOps.createError]);

  useEffect(() => {
    if (apiKeysOps.renewError) {
      toast.error(`Failed to renew: ${apiKeysOps.renewError.message}`);
    }
  }, [apiKeysOps.renewError]);

  useEffect(() => {
    if (apiKeysOps.deleteError) {
      toast.error(`Failed to delete: ${apiKeysOps.deleteError.message}`);
    }
  }, [apiKeysOps.deleteError]);

  const copy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const onSaveEdit = () => {
    if (!edit) return;
    if (edit.mode === 'name') {
      apiKeysOps.changeName({ key: edit.key._id, name: edit.value.trim() });
    } else {
      apiKeysOps.changeBotId({
        key: edit.key._id,
        botId: edit.value.trim() || null,
      });
    }
    setEdit(null);
  };

  const onConfirmAction = () => {
    if (!confirm) return;
    if (confirm.mode === 'delete') {
      apiKeysOps.deleteAPIKeys({ key: confirm.key._id });
    } else {
      apiKeysOps.renewAPIKeys({ key: confirm.key._id });
    }
    setConfirm(null);
  };

  const busy =
    apiKeysOps.isRenewing ||
    apiKeysOps.isDeleting ||
    apiKeysOps.isChangingPermission ||
    apiKeysOps.isChangingName ||
    apiKeysOps.isChangingPaperContext ||
    apiKeysOps.isChangingBotId;

  return (
    <div className="p-sm max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-xs text-primary">
              API keys
              {(isLoading || busy) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </span>
            <Button
              size="sm"
              onClick={() => apiKeysOps.createAPIKeys()}
              disabled={apiKeysOps.isCreating}
            >
              {apiKeysOps.isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add API key
            </Button>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            API keys let external apps act on your account. The secret is shown
            only once — copy it somewhere safe.
          </p>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="rounded-md bg-muted px-md py-xl text-center">
              <KeyIcon className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground">
                Click <span className="font-medium">Add API key</span> to
                create your first one.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md bg-muted">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-md py-sm text-left font-medium">Key</th>
                    <th className="px-md py-sm text-left font-medium">Name</th>
                    <th className="px-md py-sm text-left font-medium">
                      Permission
                    </th>
                    <th className="px-md py-sm text-left font-medium">
                      <span className="flex items-center gap-xs">
                        Mode
                        <Tooltip tooltip="Restrict this key to paper or real trading (v2 API). Leave as Any to allow both.">
                          <InfoIcon />
                        </Tooltip>
                      </span>
                    </th>
                    <th className="px-md py-sm text-left font-medium">
                      <span className="flex items-center gap-xs">
                        Bot ID
                        <Tooltip tooltip="Restrict this key to a specific bot ID (v2 API). Leave empty for all bots.">
                          <InfoIcon />
                        </Tooltip>
                      </span>
                    </th>
                    <th className="px-md py-sm text-left font-medium">
                      Created
                    </th>
                    <th className="px-md py-sm text-left font-medium">
                      Expires
                    </th>
                    <th className="px-md py-sm text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((apiKey) => (
                    <tr
                      key={apiKey._id}
                      className="border-t border-border/50 align-middle"
                    >
                      <td className="px-md py-sm font-mono text-xs">
                        {maskKey(apiKey._id)}
                      </td>
                      <td className="px-md py-sm">
                        <button
                          type="button"
                          className="group inline-flex items-center gap-xs text-left hover:text-primary"
                          onClick={() =>
                            setEdit({
                              mode: 'name',
                              key: apiKey,
                              value: apiKey.name ?? '',
                            })
                          }
                        >
                          <span className="text-sm">
                            {apiKey.name || (
                              <span className="text-muted-foreground italic">
                                Unnamed
                              </span>
                            )}
                          </span>
                          <Edit className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </td>
                      <td className="px-md py-sm">
                        <Select
                          value={apiKey.permission}
                          onValueChange={(value) =>
                            apiKeysOps.changePermission({
                              key: apiKey._id,
                              permission: value as 'read' | 'write',
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read">Read</SelectItem>
                            <SelectItem value="write">Write</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-md py-sm">
                        <Select
                          value={
                            apiKey.paperContext === true
                              ? 'true'
                              : apiKey.paperContext === false
                                ? 'false'
                                : 'any'
                          }
                          onValueChange={(value) =>
                            apiKeysOps.changePaperContext({
                              key: apiKey._id,
                              paperContext:
                                value === 'true'
                                  ? true
                                  : value === 'false'
                                    ? false
                                    : null,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any</SelectItem>
                            <SelectItem value="true">Paper</SelectItem>
                            <SelectItem value="false">Real</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-md py-sm">
                        <button
                          type="button"
                          className="group inline-flex items-center gap-xs text-left hover:text-primary"
                          onClick={() =>
                            setEdit({
                              mode: 'botId',
                              key: apiKey,
                              value: apiKey.botId ?? '',
                            })
                          }
                        >
                          <span className="font-mono text-xs">
                            {apiKey.botId ? `${apiKey.botId.slice(0, 8)}…` : '—'}
                          </span>
                          <Edit className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-xs text-muted-foreground">
                        {formatDate(apiKey.created)}
                      </td>
                      <td className="whitespace-nowrap px-md py-sm text-xs text-muted-foreground">
                        {formatDate(apiKey.expired)}
                      </td>
                      <td className="px-md py-sm text-right">
                        <div className="flex items-center justify-end gap-xs">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setConfirm({ mode: 'renew', key: apiKey })
                            }
                            disabled={apiKeysOps.isRenewing}
                            title="Renew API key"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() =>
                              setConfirm({ mode: 'delete', key: apiKey })
                            }
                            disabled={apiKeysOps.isDeleting}
                            title="Delete API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!edit}
        onOpenChange={(v) => !v && setEdit(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.mode === 'name' ? 'Rename API key' : 'Restrict to bot ID'}
            </DialogTitle>
            <DialogDescription>
              {edit?.mode === 'name'
                ? 'Give this key a memorable name. Leave blank to clear.'
                : 'Restrict this key to a specific bot ID (v2 API). Leave blank to allow all bots.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-xs">
            <Label htmlFor="api-edit-input">
              {edit?.mode === 'name' ? 'Name' : 'Bot ID'}
            </Label>
            <Input
              id="api-edit-input"
              autoFocus
              value={edit?.value ?? ''}
              onChange={(e) =>
                setEdit((prev) =>
                  prev ? { ...prev, value: e.target.value } : prev,
                )
              }
              placeholder={edit?.mode === 'name' ? 'My trading bot' : ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={onSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle
              className={confirm?.mode === 'delete' ? 'text-destructive' : ''}
            >
              {confirm?.mode === 'delete' ? 'Delete API key' : 'Renew API key'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.mode === 'delete'
                ? 'This API key will be permanently revoked. Any integration using it will stop working immediately.'
                : "We'll issue a new secret for this key. The previous secret will continue to work briefly; update your integrations as soon as possible."}
            </DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="rounded-md bg-muted p-sm font-mono text-xs">
              {confirm.key.name || 'Unnamed'} · {maskKey(confirm.key._id)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={
                confirm?.mode === 'delete' ? 'destructive' : 'default'
              }
              onClick={onConfirmAction}
            >
              {confirm?.mode === 'delete' ? 'Delete' : 'Renew'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showNewKeyDialog}
        onOpenChange={(v) => !v && apiKeysOps.resetCreate()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-xs">
              <Check className="h-5 w-5 text-success" />
              New API key created
            </DialogTitle>
            <DialogDescription>
              Save the secret now — you won't be able to see it again.
            </DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Key</Label>
                <div className="mt-0.5 flex items-center gap-xs">
                  <div className="flex-1 overflow-x-auto rounded-md bg-muted p-xs font-mono text-xs">
                    {newKey._id}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copy(newKey._id, 'id')}
                    title="Copy key"
                  >
                    {copiedField === 'id' ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              {newKey.secret && (
                <div>
                  <Label className="text-xs text-muted-foreground">Secret</Label>
                  <div className="mt-0.5 flex items-center gap-xs">
                    <div className="flex-1 overflow-x-auto rounded-md bg-muted p-xs font-mono text-xs">
                      {newKey.secret}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        newKey.secret && copy(newKey.secret, 'secret')
                      }
                      title="Copy secret"
                    >
                      {copiedField === 'secret' ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => apiKeysOps.resetCreate()}>I've saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default APIKeysSection;
