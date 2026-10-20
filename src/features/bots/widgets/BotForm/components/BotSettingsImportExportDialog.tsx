import {
  ArrowDownToLine,
  ClipboardCopy,
  RotateCcw,
  Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import type { BotFormMode } from '@/contexts/bots/form/BotFormProvider';

export interface BotSettingsImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botTypeLabel: string;
  mode: BotFormMode;
  initialJson?: string;
  onImport: (payload: { raw: string; parsed: unknown }) => Promise<void> | void;
  onExport: () => Promise<string> | string;
}

type ImportStatus =
  | { type: 'idle'; message?: string }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

const emptyStatus: ImportStatus = { type: 'idle' };

const getDownloadFileName = (botTypeLabel: string, mode: BotFormMode) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const normalizedType = botTypeLabel.toLowerCase().replace(/\s+/g, '-');
  const suffix = mode === 'create' ? 'draft' : 'current';
  return `gainium-${normalizedType}-bot-settings-${suffix}-${timestamp}.json`;
};

export const BotSettingsImportExportDialog: React.FC<
  BotSettingsImportExportDialogProps
> = ({
  open,
  onOpenChange,
  botTypeLabel,
  mode,
  initialJson,
  onImport,
  onExport,
}) => {
  const [jsonText, setJsonText] = useState<string>(initialJson ?? '');
  const [status, setStatus] = useState<ImportStatus>(emptyStatus);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setJsonText(initialJson ?? '');
    setStatus(emptyStatus);
    setIsDragging(false);
  }, [open, initialJson]);

  const placeholder = useMemo(
    () =>
      `{
  "name": "My ${botTypeLabel} Bot",
  "pair": ["BTC_USDT"]
}`,
    [botTypeLabel]
  );

  const handleImport = async () => {
    const trimmed = jsonText.trim();

    if (!trimmed) {
      setStatus({
        type: 'error',
        message: 'Paste or load bot settings before importing.',
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      console.error(
        '[BotSettingsImportExportDialog] Invalid JSON payload',
        error
      );
      setStatus({
        type: 'error',
        message: 'The provided JSON is invalid. Fix the syntax and try again.',
      });
      return;
    }

    try {
      setIsImporting(true);
      await onImport({ raw: trimmed, parsed });
      setStatus({
        type: 'success',
        message:
          'Settings imported. Review the form before saving to confirm the changes.',
      });
      toast.success('Settings imported. Review the form before saving.');
    } catch (error) {
      console.error(
        '[BotSettingsImportExportDialog] Import handler failed',
        error
      );
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Import failed. Check the payload and try again.';
      setStatus({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const exportResult = await onExport();
      const formatted = formatJson(exportResult);
      setJsonText(formatted);
      setStatus({
        type: 'success',
        message:
          'Latest settings exported into the editor. You can copy, download, or edit them.',
      });
      toast.success('Current settings copied into the editor.');
    } catch (error) {
      console.error(
        '[BotSettingsImportExportDialog] Export handler failed',
        error
      );
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to export the current settings. Please try again.';
      setStatus({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    if (!jsonText.trim()) {
      toast.info('Nothing to copy yet. Export or paste settings first.');
      return;
    }

    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success('JSON copied to clipboard.');
    } catch (error) {
      console.error(
        '[BotSettingsImportExportDialog] Clipboard copy failed',
        error
      );
      toast.error('Unable to copy to clipboard. Copy manually instead.');
    }
  };

  const handleDownload = () => {
    if (!jsonText.trim()) {
      toast.info('Nothing to download yet. Export or paste settings first.');
      return;
    }

    try {
      const blob = new Blob([jsonText], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getDownloadFileName(botTypeLabel, mode);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('JSON downloaded successfully.');
    } catch (error) {
      console.error('[BotSettingsImportExportDialog] Download failed', error);
      toast.error('Failed to download the JSON file.');
    }
  };

  const handleReset = () => {
    setJsonText(initialJson ?? '');
    setStatus(emptyStatus);
  };

  const handleFileSelection = async (file?: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setJsonText(text);
      setStatus({
        type: 'success',
        message: `Loaded "${file.name}". Review the payload before importing.`,
      });
    } catch (error) {
      console.error(
        '[BotSettingsImportExportDialog] Failed to read file',
        error
      );
      setStatus({
        type: 'error',
        message: 'Unable to read the selected file. Try another JSON file.',
      });
    }
  };

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (
    event
  ) => {
    const file = event.target.files?.[0];
    void handleFileSelection(file);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    void handleFileSelection(file);
  };

  const handleDragOver: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const dropZoneClasses = useMemo(() => {
    const base =
      'flex min-h-[160px] flex-col items-center justify-center gap-sm rounded-xl border border-dashed transition-colors p-8 text-center cursor-pointer bg-muted/40 dark:bg-muted/20';

    if (isDragging) {
      return `${base} border-primary bg-primary/10 text-primary`;
    }

    return `${base} border-border hover:border-primary hover:bg-muted/50`;
  }, [isDragging]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] overflow-hidden">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="text-lg font-semibold">
            Import &amp; Export {botTypeLabel} Settings
          </DialogTitle>
          <DialogDescription className="sr-only">
            Upload, paste, or export JSON to transfer bot configuration.
            Imported values override the current form — review changes before
            saving.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-lg py-5">
          <Button
            variant="ghost"
            type="button"
            className={dropZoneClasses}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) =>
              handleDragOver(e as unknown as React.DragEvent<HTMLDivElement>)
            }
            onDragLeave={(e) =>
              handleDragLeave(e as unknown as React.DragEvent<HTMLDivElement>)
            }
            onDrop={(e) =>
              handleDrop(e as unknown as React.DragEvent<HTMLDivElement>)
            }
          >
            <Upload className="w-8 h-8" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Drag &amp; drop your JSON file here
              </p>
              <p className="text-xs text-muted-foreground">
                or click to browse and select a file
              </p>
            </div>
            <Badge variant="secondary" className="uppercase tracking-wide">
              .json only
            </Badge>
            <Input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </Button>

          <div className="space-y-xs">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="bot-import-json">
                JSON payload
              </label>
              <div className="flex items-center gap-xs text-xs text-muted-foreground">
                <span>
                  {jsonText.trim()
                    ? `${jsonText.split('\n').length} lines`
                    : 'Paste or load settings'}
                </span>
              </div>
            </div>
            <Textarea
              id="bot-import-json"
              placeholder={placeholder}
              value={jsonText}
              onChange={(event) => setJsonText(event.target.value)}
              className="min-h-[260px] font-mono text-xs rounded-lg border bg-background"
              spellCheck={false}
            />
            {status.type !== 'idle' && (
              <p
                className={
                  status.type === 'error'
                    ? 'text-sm text-destructive'
                    : 'text-sm text-muted-foreground'
                }
              >
                {status.message}
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-xs order-2 sm:order-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!jsonText.trim()}
            >
              <ClipboardCopy className="w-4 h-4 mr-2" /> Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!jsonText.trim()}
            >
              <ArrowDownToLine className="w-4 h-4 mr-2" /> Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={!initialJson && !jsonText}
            >
              <RotateCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
          </div>

          <div className="flex flex-wrap gap-xs order-1 sm:order-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleExport}
              disabled={isExporting}
            >
              Export current
            </Button>
            <Button type="button" onClick={handleImport} disabled={isImporting}>
              {isImporting ? 'Importing…' : 'Import JSON'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const formatJson = (value: string): string => {
  if (!value.trim()) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    console.warn(
      '[BotSettingsImportExportDialog] Failed to format JSON export',
      error
    );
    return value;
  }
};

export default BotSettingsImportExportDialog;
