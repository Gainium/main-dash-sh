import { Activity, AlertTriangle, Shield, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
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
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface DeleteConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  itemName: string;
  itemType: 'bot' | 'deal' | 'preset' | 'other';
  destructiveAction?: boolean;
  requireConfirmation?: boolean;
  additionalInfo?: {
    activeDeals?: number;
    totalValue?: number;
    currency?: string;
    lastActivity?: string;
  };
  isLoading?: boolean;
  /**
   * Bulk mode: number of items being deleted. Hides the single "Name" row
   * (the title/description carry the count) and pluralises the copy.
   */
  bulkCount?: number;
}

export const DeleteConfirmationModal: React.FC<
  DeleteConfirmationModalProps
> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemName,
  itemType,
  destructiveAction = true,
  requireConfirmation = true,
  additionalInfo,
  isLoading = false,
  bulkCount,
}) => {
  const isBulk = bulkCount !== undefined;
  const plural = isBulk && bulkCount !== 1;
  const [confirmationText, setConfirmationText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset confirmation text when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setConfirmationText('');
      setIsSubmitting(false);
    }
  }, [open]);

  // Determine confirmation requirement
  const confirmationRequired = requireConfirmation && destructiveAction;
  const expectedConfirmation = 'DELETE';
  const isConfirmationValid =
    !confirmationRequired || confirmationText === expectedConfirmation;

  // Handle confirmation
  const handleConfirm = async () => {
    if (!isConfirmationValid) return;

    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Delete operation failed:', error);
      // Error handling is done by the parent component
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get icon based on item type
  const getIcon = () => {
    switch (itemType) {
      case 'bot':
        return <Activity className="w-5 h-5 text-white" />;
      case 'deal':
        return <Activity className="w-5 h-5 text-white" />;
      default:
        return <Trash2 className="w-5 h-5 text-white" />;
    }
  };

  // Get warning message based on item type
  const getWarningMessage = () => {
    switch (itemType) {
      case 'bot':
        return plural
          ? 'This will permanently delete these bots and all their associated data, including deal history, performance metrics, and configuration settings.'
          : 'This will permanently delete the bot and all its associated data, including deal history, performance metrics, and configuration settings.';
      case 'deal':
        return 'This will permanently close the deal and may result in losses if the position is not profitable.';
      default:
        return 'This action cannot be undone.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            {getIcon()}
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 space-y-md sm:space-y-5">
          {/* Item Information (single item only) */}
          {!isBulk && (
            <Card className="p-sm bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {itemType.charAt(0).toUpperCase() + itemType.slice(1)} Name:
                </span>
                <span className="font-medium text-sm">{itemName}</span>
              </div>
            </Card>
          )}

          {/* Additional Information */}
          {additionalInfo && (
            <Card className="p-sm border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
              <div className="space-y-xs">
                {additionalInfo.activeDeals !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-amber-700 dark:text-amber-300">
                      Active Deals:
                    </span>
                    <Badge
                      variant="outline"
                      className="text-amber-800 dark:text-amber-200"
                    >
                      {additionalInfo.activeDeals}
                    </Badge>
                  </div>
                )}
                {additionalInfo.totalValue !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-amber-700 dark:text-amber-300">
                      Total Value:
                    </span>
                    <span className="font-medium text-amber-900 dark:text-amber-100">
                      {additionalInfo.totalValue.toLocaleString()}{' '}
                      {additionalInfo.currency || 'USD'}
                    </span>
                  </div>
                )}
                {additionalInfo.lastActivity && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-amber-700 dark:text-amber-300">
                      Last Activity:
                    </span>
                    <span className="font-medium text-amber-900 dark:text-amber-100">
                      {additionalInfo.lastActivity}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Warning */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> {getWarningMessage()}
            </AlertDescription>
          </Alert>

          {/* Confirmation Input */}
          {confirmationRequired && (
            <div className="space-y-sm">
              <Label className="text-sm font-medium">
                Type{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                  {expectedConfirmation}
                </code>{' '}
                to confirm:
              </Label>
              <Input
                type="text"
                placeholder={`Type ${expectedConfirmation} to confirm`}
                value={confirmationText}
                onChange={(e) =>
                  setConfirmationText(e.target.value.toUpperCase())
                }
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
          )}

          {/* Safety Notice */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              This action is permanent and cannot be undone. Make sure you have
              backed up any important data.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-sm">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
            className="w-full sm:w-auto text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmationValid || isSubmitting || isLoading}
            className="w-full sm:w-auto text-sm"
            autoFocus
          >
            {isSubmitting || isLoading ? (
              <>
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-pulse" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Delete {itemType.charAt(0).toUpperCase() + itemType.slice(1)}
                {plural ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmationModal;
