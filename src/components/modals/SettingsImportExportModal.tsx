import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Upload,
} from 'lucide-react';
import { InlineError } from '@/components/ui/inline-error';
import React, { useCallback, useState } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';

interface ImportData {
  version?: string;
  type?: string;
  name?: string;
  exportedAt?: string;
  settings: Record<string, unknown>;
}

export interface SettingsImportExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSettings?: Record<string, unknown>;
  onImport: (settings: Record<string, unknown>) => void | Promise<void>;
  onExport?: (settings: Record<string, unknown>) => void;
  settingsType: 'bot' | 'preset' | 'global';
  itemName?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeImportData = (
  input: unknown
): { data: ImportData | null; errors: string[] } => {
  const errors: string[] = [];

  if (!isRecord(input)) {
    errors.push('Invalid JSON format: must be an object');
    return { data: null, errors };
  }

  if ('settings' in input) {
    const wrappedSettings = input['settings'];
    if (!isRecord(wrappedSettings)) {
      errors.push('Invalid "settings" field in JSON data');
      return { data: null, errors };
    }

    return {
      data: {
        version:
          typeof input['version'] === 'string' ? input['version'] : undefined,
        type: typeof input['type'] === 'string' ? input['type'] : undefined,
        name: typeof input['name'] === 'string' ? input['name'] : undefined,
        exportedAt:
          typeof input['exportedAt'] === 'string'
            ? input['exportedAt']
            : undefined,
        settings: wrappedSettings,
      },
      errors,
    };
  }

  // Legacy format: raw settings object.
  return {
    data: {
      settings: input,
      name: typeof input['name'] === 'string' ? input['name'] : undefined,
    },
    errors,
  };
};

export const SettingsImportExportModal: React.FC<
  SettingsImportExportModalProps
> = ({
  open,
  onOpenChange,
  currentSettings = {},
  onImport,
  onExport,
  settingsType,
  itemName,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setImportText('');
      setErrors([]);
      setSuccessMessage('');
      setIsProcessing(false);
      setIsDragging(false);
    }
  }, [open]);

  // Generate export JSON
  const exportJson = React.useMemo(() => {
    const exportData = {
      version: '1.0',
      type: settingsType,
      name: itemName || `${settingsType}_settings`,
      exportedAt: new Date().toISOString(),
      settings: currentSettings,
    };
    return JSON.stringify(exportData, null, 2);
  }, [currentSettings, settingsType, itemName]);

  // Validate import JSON
  const validateImportJson = useCallback(
    (
      jsonString: string
    ): { isValid: boolean; data?: ImportData; errors: string[] } => {
      const errors: string[] = [];

      if (!jsonString.trim()) {
        errors.push('Please enter JSON data to import');
        return { isValid: false, errors };
      }

      try {
        const parsed = JSON.parse(jsonString);
        const normalized = normalizeImportData(parsed);

        errors.push(...normalized.errors);

        if (!normalized.data) {
          return { isValid: false, errors };
        }

        const data = normalized.data;

        // Basic structure validation
        // Type validation for wrapped payloads (legacy raw settings don't carry bot payload type)
        if (data.type && data.type !== settingsType) {
          errors.push(
            `Settings type mismatch: expected "${settingsType}", got "${data.type}"`
          );
        }

        // Version check (optional)
        if (data.version && data.version !== '1.0') {
          errors.push(
            `Unsupported version: ${data.version}. This may cause compatibility issues.`
          );
        }

        return { isValid: errors.length === 0, data, errors };
      } catch (error) {
        errors.push(
          `Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return { isValid: false, errors };
      }
    },
    [settingsType]
  );

  // Handle export
  const handleExport = useCallback(() => {
    try {
      // Copy to clipboard
      navigator.clipboard.writeText(exportJson);
      setSuccessMessage('Settings copied to clipboard!');

      // Also trigger download
      const blob = new Blob([exportJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${itemName || settingsType}_settings_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Call optional export handler
      if (onExport) {
        onExport(currentSettings);
      }

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (_error) {
      setErrors(['Failed to export settings. Please try again.']);
    }
  }, [exportJson, itemName, settingsType, currentSettings, onExport]);

  // Handle import
  const handleImport = async () => {
    const validation = validateImportJson(importText);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsProcessing(true);
    setErrors([]);

    try {
      await onImport((validation.data as ImportData).settings);
      setSuccessMessage('Settings imported successfully!');
      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (_error) {
      setErrors([
        'Failed to import settings. Please check the format and try again.',
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportText(content);
      setErrors([]);
    };
    reader.onerror = () => {
      setErrors(['Failed to read file. Please try again.']);
    };
    reader.readAsText(file);
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportText(content);
      setErrors([]);
    };
    reader.onerror = () => {
      setErrors(['Failed to read file. Please try again.']);
    };
    reader.readAsText(file);
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

  // Copy export text to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setSuccessMessage('Copied to clipboard!');
      setTimeout(() => setSuccessMessage(''), 2000);
    } catch (_error) {
      setErrors(['Failed to copy to clipboard']);
    }
  };

  const importValidation = React.useMemo(() => {
    if (!importText) {
      return null;
    }

    return validateImportJson(importText);
  }, [importText, validateImportJson]);

  const importPreviewData =
    importValidation && importValidation.isValid && importValidation.data
      ? (importValidation.data as ImportData)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            {settingsType.charAt(0).toUpperCase() + settingsType.slice(1)}{' '}
            Settings
          </DialogTitle>
          <DialogDescription className="text-sm">
            Export current settings or import settings from a JSON file
            {itemName && ` for "${itemName}"`}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as 'export' | 'import')
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="export"
                className="flex items-center gap-xs text-xs sm:text-sm"
              >
                <Download className="w-3 h-3 sm:w-4 sm:h-4" />
                Export
              </TabsTrigger>
              <TabsTrigger
                value="import"
                className="flex items-center gap-xs text-xs sm:text-sm"
              >
                <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                Import
              </TabsTrigger>
            </TabsList>

            <TabsContent value="export" className="space-y-md mt-4">
              <Card className="p-sm">
                <div className="space-y-sm">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Current Settings (JSON)
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyToClipboard}
                      className="flex items-center gap-xs text-xs sm:text-sm"
                    >
                      <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    value={exportJson}
                    readOnly
                    className="min-h-[300px] font-mono text-xs"
                    placeholder="Settings will appear here..."
                  />
                </div>
              </Card>

              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  These settings can be imported into any compatible{' '}
                  {settingsType}. Save this JSON to a file for backup or
                  sharing.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="import" className="space-y-md mt-4">
              <Card className="p-sm">
                <div className="space-y-sm">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Import Settings (JSON)
                    </Label>
                  </div>
                  <div
                    className={`rounded-xl border border-dashed min-h-[140px] p-8 flex flex-col items-center justify-center text-center gap-sm cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-muted/40 hover:border-primary hover:bg-muted/50'
                    }`}
                    onClick={() =>
                      document.getElementById('file-upload')?.click()
                    }
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <FolderOpen className="w-6 h-6" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        Drag &amp; drop JSON file here
                      </p>
                      <p className="text-xs text-muted-foreground">
                        or click to browse
                      </p>
                    </div>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                  <Textarea
                    value={importText}
                    onChange={(e) => {
                      setImportText(e.target.value);
                      setErrors([]);
                    }}
                    className="min-h-[300px] font-mono text-xs"
                    placeholder="Paste JSON settings here or use 'Load File' button..."
                  />
                </div>
              </Card>

              {/* Validation Preview */}
              {importText && (
                <Card className="p-sm">
                  <div className="text-sm">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Preview:
                    </Label>
                    {importPreviewData && (
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name:</span>
                          <span>{importPreviewData.name || 'Unnamed'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span>{importPreviewData.type || 'Unknown'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Version:
                          </span>
                          <span>{importPreviewData.version || 'Unknown'}</span>
                        </div>
                        {importPreviewData.exportedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Exported:
                            </span>
                            <span>
                              {new Date(
                                importPreviewData.exportedAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> Importing settings will replace all
                  current {settingsType} settings. Make sure to export your
                  current settings first if you want to keep them.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          {/* Success Message */}
          {successMessage && (
            <div className="px-6">
              <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
                  {successMessage}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="px-6">
              <InlineError>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </InlineError>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-sm">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto text-sm"
          >
            Close
          </Button>
          {activeTab === 'export' ? (
            <Button
              onClick={handleExport}
              className="w-full sm:w-auto flex items-center gap-xs text-sm"
            >
              <Download className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Export & Download</span>
              <span className="sm:hidden">Export</span>
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={!importText.trim() || isProcessing}
              className="w-full sm:w-auto flex items-center gap-xs text-sm"
            >
              {isProcessing ? (
                <>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Import Settings</span>
                  <span className="sm:hidden">Import</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsImportExportModal;
