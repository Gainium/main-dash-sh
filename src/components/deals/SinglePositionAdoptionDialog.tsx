import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ADOPTION_IRREVERSIBLE_SENTENCE,
  adoptionRowTitle,
  formatPreviewNumber,
  type AdoptionPreviewRow,
} from '@/lib/singlePosition/singlePosition';

/** One pair's before → after, as estimated from the deals' own figures. */
export function AdoptionPreviewRows({
  rows,
  baseAssetOf,
}: {
  rows: AdoptionPreviewRow[];
  /** Base asset label per pair, for the size unit. */
  baseAssetOf?: (pair: string) => string | undefined;
}) {
  return (
    <ul className="space-y-md" aria-label="Affected pairs">
      {rows.map((row) => {
        const unit = baseAssetOf?.(row.pair);
        // No TP on either side (the bot closes by webhook / indicator, or the
        // deal has none): leave the row out rather than show dashes.
        const hasTp = row.tpBefore !== null || row.tpAfter !== null;
        return (
          <li key={row.targetDealId} className="text-sm">
            <p className="font-medium text-foreground">{adoptionRowTitle(row)}</p>
            <dl className="mt-xs grid grid-cols-[auto_1fr] gap-x-md gap-y-0.5 text-muted-foreground">
              <dt>Size</dt>
              <dd className="text-foreground">
                {formatPreviewNumber(row.sizeBefore)} →{' '}
                {formatPreviewNumber(row.sizeAfter)}
                {unit ? ` ${unit}` : ''}
              </dd>
              <dt>Average price</dt>
              <dd className="text-foreground">
                {formatPreviewNumber(row.avgBefore)} →{' '}
                {formatPreviewNumber(row.avgAfter)}{' '}
                <span className="text-muted-foreground">(est.)</span>
              </dd>
              {hasTp && (
                <>
                  <dt>Take-profit price</dt>
                  <dd className="text-foreground">
                    {formatPreviewNumber(row.tpBefore)}
                    {row.tpBefore !== null && !row.tpBeforeLive && (
                      <span className="text-muted-foreground"> (est.)</span>
                    )}{' '}
                    → {formatPreviewNumber(row.tpAfter)}
                    {row.tpAfter !== null && (
                      <span className="text-muted-foreground"> (est.)</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

interface SinglePositionAdoptionDialogProps {
  open: boolean;
  rows: AdoptionPreviewRow[];
  title?: string;
  description?: string;
  confirmText?: string;
  pending?: boolean;
  baseAssetOf?: (pair: string) => string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation before deals are folded into one position per pair (turning
 * single position on, or moving / merging a deal into a single-position bot).
 * The figures are estimates from the deals' current average and size; the
 * server recomputes them from the filled orders.
 */
export function SinglePositionAdoptionDialog({
  open,
  rows,
  title = 'Switch to one position per pair',
  description,
  confirmText = 'Confirm',
  pending = false,
  baseAssetOf,
  onConfirm,
  onCancel,
}: SinglePositionAdoptionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              {ADOPTION_IRREVERSIBLE_SENTENCE}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-md">
          <div className="max-h-[50vh] overflow-y-auto">
            <AdoptionPreviewRows
              rows={rows}
              {...(baseAssetOf ? { baseAssetOf } : {})}
            />
          </div>
          <p className="text-sm text-destructive">
            {ADOPTION_IRREVERSIBLE_SENTENCE}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Working…' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SinglePositionAdoptionDialog;
