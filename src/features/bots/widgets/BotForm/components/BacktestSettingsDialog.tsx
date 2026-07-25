import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import logger from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useBacktestPeriodStore } from '@/stores/backtestPeriodStore';
import {
  ExchangeIntervals,
  intervalMap,
  intervals,
  type BacktestProgress,
  type Period,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { Edit2, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export type BacktestConfig = {
  mode: 'local' | 'server';
  timeframe: ExchangeIntervals;
  startDate: string;
  endDate: string;
  initialBalance?: number;
  slippagePercent?: number;
  userFee?: string | number;
  RFR?: string;
  MAR?: string;
  periodId?: string;
  saveNew?: boolean;
  newName?: string;
};

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
// Custom periods carry a time-of-day (parity with the legacy dashboard's
// date+time picker), stored as a `YYYY-MM-DDTHH:mm` datetime-local string.
const formatLocalDateTime = (d: Date) => {
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatLocalDate(d)}T${hh}:${min}`;
};
const parseLocalDateTime = (s: string) => {
  if (!s) return new Date('');
  const [datePart, timePart = '00:00'] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, min] = timePart.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, min || 0);
};

export const BacktestSettingsDialog: React.FC<{
  open: boolean;
  initialData?: Partial<BacktestConfig>;
  onClose: () => void;
  onRun: (cfg: BacktestConfig) => Promise<void> | void;
  formData: BotFormData;
  getAutoPeriod?: (
    interval?: ExchangeIntervals
  ) => { from: number; to: number } | undefined;
  backtestProgress?: BacktestProgress | null;
  onCancelLocal?: () => void;
  /**
   * When true, the mode toggle is hidden and the dialog runs only in
   * local mode. Used by hedge bots — server-side backtest doesn't
   * support hedge (no payload variant in `requestServerSideBacktest`),
   * so hedge must always run locally via @gainium/backtester.
   */
  forceLocalMode?: boolean;
}> = ({
  open,
  initialData,
  onClose,
  onRun,
  formData,
  getAutoPeriod,
  backtestProgress,
  onCancelLocal,
  forceLocalMode = false,
}) => {
  const [mode, setMode] = useState<'local' | 'server'>(
    forceLocalMode ? 'local' : (initialData?.mode ?? 'local')
  );
  const [timeframe, setTimeframe] = useState<ExchangeIntervals>(
    (initialData?.timeframe as ExchangeIntervals) ?? ExchangeIntervals.oneH
  );
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '');
  const [endDate, setEndDate] = useState(initialData?.endDate ?? '');
  const [slippagePercent, setSlippagePercent] = useState(
    initialData?.slippagePercent ?? 0
  );
  const [running, setRunning] = useState(false);
  const [userFee, setUserFee] = useState<string | number>(
    (initialData?.userFee as string | number) ??
      formData?.userFee?.takerCommission ??
      0
  );

  useEffect(() => {
    if (
      formData?.userFee?.takerCommission !== undefined &&
      formData?.userFee?.takerCommission !== null
    ) {
      setUserFee(formData.userFee.takerCommission);
    }
  }, [formData.userFee]);
  const [RFR, setRFR] = useState(initialData?.RFR ?? '2');
  const [MAR, setMAR] = useState(initialData?.MAR ?? '7');
  const [periodId, setPeriodId] = useState<string>(
    initialData?.periodId ?? 'auto'
  );
  const [saveNew, setSaveNew] = useState<boolean>(
    initialData?.saveNew ?? false
  );
  const [newName, setNewName] = useState<string>(initialData?.newName ?? '');
  /* const [localAvailable, setLocalAvailable] = useState<boolean | null>(null); */
  /* const [backtesterImportKeys, setBacktesterImportKeys] = useState<
    string[] | null
  >(null);
  const [backtesterCandidateKey, setBacktesterCandidateKey] = useState<
    string | null
  >(null); */

  // Period store
  const {
    periods,
    loading: periodsLoading,
    loadPeriods,
    addPeriod,
    updatePeriod,
    deletePeriod,
    lastSelectedPeriodId,
    setLastSelectedPeriodId,
  } = useBacktestPeriodStore();

  // Saved periods live on the user's account. Fetch them the first time the
  // dialog is opened rather than on mount — this component is mounted with
  // every bot form, open or not.
  useEffect(() => {
    if (open) {
      void loadPeriods();
    }
  }, [open, loadPeriods]);

  // Period manager state
  const [showPeriodManager, setShowPeriodManager] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Period | null>(null);
  const [deletingPeriod, setDeletingPeriod] = useState<Period | null>(null);
  const [editName, setEditName] = useState('');
  const [editFrom, setEditFrom] = useState<number>(0);
  const [editTo, setEditTo] = useState<number>(0);

  // Load last selected period on mount
  useEffect(() => {
    if (lastSelectedPeriodId && !initialData?.periodId) {
      const period = periods.find((p) => p.uuid === lastSelectedPeriodId);
      if (period) {
        setPeriodId(lastSelectedPeriodId);
        setStartDate(formatLocalDateTime(new Date(period.from)));
        setEndDate(formatLocalDateTime(new Date(period.to)));
      }
    }
  }, [lastSelectedPeriodId, periods, initialData?.periodId]);


  // Detect availability of local backtester on mount
  /* useEffect(() => {
    const checkAvailability = async () => {
      const importPaths = [
        '@gainium/backtester/dist/dca',
        '@gainium/backtester/dist/dca/index',
        '@gainium/backtester/dist/dca/index.js',
        '@gainium/backtester/dca',
        '@gainium/backtester',
        '@/lib/backtesterWrapper',
      ];
      let pkg: any = null;
      // Try wrapper first as a statically-resolvable path (letting Vite handle the alias)
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const wrapperPkg = await import('@/lib/backtesterWrapper');
        if (wrapperPkg) {
          pkg = wrapperPkg;
        }
      } catch (err) {
        // ignore wrapper failures silently so detection remains unobtrusive
      }
      for (const p of importPaths) {
        // Try a normal dynamic import which allows bundlers to include it; if it fails, try Function import
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        let maybePkg: any = null;
        try {
          maybePkg = await import( p);
          // succeeded
        } catch (err1) {
          // dynamic import failed for this path — ignore and try next
          try {
            maybePkg = await new Function(`return import("${p}")`)();
            // succeeded via Function import
          } catch (err2) {
            // new Function import failed — path not available
          }
        }

        if (!maybePkg) {
          continue;
        }
        pkg = maybePkg;
        // import succeeded for path
        break;
      }

      try {
        // Heuristics: find candidate exports that expose 'test' or 'run' (no logging)
        const findCandidate = (p: any) => {
          if (!p) return null;
          const candidates: Array<{ key: string | 'default'; val: any }> = [];
          if (p.default) candidates.push({ key: 'default', val: p.default });
          Object.keys(p).forEach((k) => candidates.push({ key: k, val: p[k] }));
          for (const c of candidates) {
            const v = c.val;
            if (!v) continue;
            if (typeof v === 'function') {
              const proto = (v as any).prototype || {};
              if (
                typeof proto.test === 'function' ||
                typeof proto.run === 'function'
              ) {
                return { key: c.key, val: v };
              }
            }
            if (typeof v === 'object' && v !== null) {
              if (typeof v.test === 'function' || typeof v.run === 'function') {
                return { key: c.key, val: v };
              }
            }
          }
          return null;
        };
        const found = findCandidate(pkg);
        const Backtester = found?.val;
        setBacktesterCandidateKey(found?.key ?? null);
        setBacktesterImportKeys(pkg ? Object.keys(pkg) : null);
        setLocalAvailable(!!Backtester);
        if (!Backtester && mode === 'local') {
          // logger.info('[backtester] Falling back to server mode (local import not resolved)')
          setMode('server');
        }
      } catch (err) {
        // detection errors are non-fatal; keep the available flag false
        setLocalAvailable(false);
      }
    };

    checkAvailability();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); */

  // Local available changes handled silently to avoid noisy logs

  const selectedPeriod = useMemo(() => {
    if (periodId === 'auto' || periodId === 'custom') return null;
    return periods.find((p) => p.uuid === periodId);
  }, [periodId, periods]);

  const handlePeriodChange = (newPeriodId: string) => {
    // Sentinel option: open the saved-periods manager without changing
    // the current selection.
    if (newPeriodId === '__manage__') {
      setShowPeriodManager(true);
      return;
    }

    setPeriodId(newPeriodId);
    setLastSelectedPeriodId(newPeriodId);

    if (newPeriodId === 'custom') {
      // Keep current dates
    } else if (newPeriodId !== 'auto') {
      const period = periods.find((p) => p.uuid === newPeriodId);
      if (period) {
        setStartDate(formatLocalDateTime(new Date(period.from)));
        setEndDate(formatLocalDateTime(new Date(period.to)));
      }
    }
  };

  const handleEditPeriod = (period: Period) => {
    setEditingPeriod(period);
    setEditName(period.name);
    setEditFrom(period.from);
    setEditTo(period.to);
  };

  const handleUpdatePeriod = async () => {
    if (!editingPeriod) return;
    if (!editName.trim()) {
      toast.error('Please enter a period name');
      return;
    }
    if (editFrom >= editTo) {
      toast.error('Start date must be before end date');
      return;
    }

    try {
      await updatePeriod(editingPeriod.uuid, {
        name: editName,
        from: editFrom,
        to: editTo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update period: ${message}`);
      return;
    }
    setEditingPeriod(null);
    toast.success(`Period "${editName}" updated`);
  };

  const handleDeletePeriod = async () => {
    if (!deletingPeriod) return;
    try {
      await deletePeriod(deletingPeriod.uuid);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to delete period: ${message}`);
      return;
    }
    if (periodId === deletingPeriod.uuid) {
      setPeriodId('auto');
      setLastSelectedPeriodId('auto');
    }
    setDeletingPeriod(null);
    toast.success(`Period "${deletingPeriod.name}" deleted`);
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    try {
      // logger.info('[backtester] Run initiated', { mode, timeframe, startDate, endDate, slippagePercent, userFee })
      // If saving new period, save it first.
      //
      // `resolvedPeriodId` (not the `periodId` state) is what gets handed to
      // `onRun`: `setPeriodId` won't have applied by the time we call it, so
      // reading the state here would send 'custom' and the caller would drop
      // the period name — the run that creates a period would be the one run
      // that shows up unnamed in the results list. Legacy does the same thing
      // with its local `up` variable.
      let resolvedPeriodId = periodId;
      if (saveNew && periodId === 'custom' && newName.trim()) {
        const from = parseLocalDateTime(startDate).getTime();
        const to = parseLocalDateTime(endDate).getTime();
        try {
          const newPeriod = await addPeriod({ name: newName, from, to });
          if (newPeriod) {
            resolvedPeriodId = newPeriod.uuid;
            setPeriodId(newPeriod.uuid);
            setLastSelectedPeriodId(newPeriod.uuid);
            setSaveNew(false);
            setNewName('');
          }
        } catch (err) {
          // Saving the period is a side quest — surface it, but still run the
          // backtest the user actually asked for.
          const message = err instanceof Error ? err.message : String(err);
          toast.error(`Failed to save period: ${message}`);
        }
      }

      await onRun({
        mode,
        timeframe,
        startDate,
        endDate,
        slippagePercent,
        userFee,
        RFR,
        MAR,
        periodId: resolvedPeriodId,
        saveNew,
        newName,
      });
    } catch (err) {
      // logger.error('[backtester] Backtest run error', { error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) })
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Backtest failed: ${message}`);
    }
    setRunning(false);
    onClose();
  };

  const periodDays = useMemo(() => {
    if (!selectedPeriod) return 0;
    return Math.floor(
      (selectedPeriod.to - selectedPeriod.from) / (24 * 60 * 60 * 1000)
    );
  }, [selectedPeriod]);

  const autoPeriod = useMemo(() => {
    return getAutoPeriod ? getAutoPeriod(timeframe) : undefined;
  }, [getAutoPeriod, timeframe]);

  return (
    <>
      {/* Period Manager Dialog */}
      <Dialog open={showPeriodManager} onOpenChange={setShowPeriodManager}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Saved Periods</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-muted-foreground">
              Note that the actual backtesting period might be slightly modified
              to accommodate the chosen timeframe.
            </p>
            {periods.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {periodsLoading ? 'Loading saved periods…' : 'No saved periods yet'}
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-xs">Name</th>
                    <th className="text-left p-xs">From</th>
                    <th className="text-left p-xs">To</th>
                    <th className="text-right p-xs">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr
                      key={period.uuid}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="p-xs">{period.name}</td>
                      <td className="p-xs">
                        {new Date(period.from).toLocaleDateString()}
                      </td>
                      <td className="p-xs">
                        {new Date(period.to).toLocaleDateString()}
                      </td>
                      <td className="p-xs text-right space-x-xs">
                        <button
                          className="inline-flex items-center text-primary hover:text-primary/80 transition-colors"
                          onClick={() => handleEditPeriod(period)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          className="inline-flex items-center text-destructive hover:text-destructive/80 transition-colors"
                          onClick={() => setDeletingPeriod(period)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPeriodManager(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Period Dialog */}
      <Dialog
        open={!!editingPeriod}
        onOpenChange={(open) => !open && setEditingPeriod(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Period</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-sm">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start date &amp; time</Label>
                <input
                  type="datetime-local"
                  value={formatLocalDateTime(new Date(editFrom))}
                  onChange={(e) => {
                    setEditFrom(parseLocalDateTime(e.target.value).getTime());
                  }}
                  className="h-9 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End date &amp; time</Label>
                <input
                  type="datetime-local"
                  value={formatLocalDateTime(new Date(editTo))}
                  onChange={(e) => {
                    setEditTo(parseLocalDateTime(e.target.value).getTime());
                  }}
                  className="h-9 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              {editFrom >= editTo && (
                <p className="text-xs text-destructive">
                  Start date must be before end date
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingPeriod(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleUpdatePeriod}
              disabled={editFrom >= editTo || !editName.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingPeriod}
        onOpenChange={(open) => !open && setDeletingPeriod(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Are you sure you want to delete period{' '}
              <strong>{deletingPeriod?.name}</strong>?
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingPeriod(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeletePeriod}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Backtest Configuration Dialog */}
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Backtest settings</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-md">
              {/* Settings Row 1: Exchange, Sortino, Period */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                {/* Exchange settings */}
                <div className="space-y-sm">
                  <h3 className="font-semibold text-sm">Exchange settings</h3>

                  <div className="space-y-1">
                    <Label className="text-xs">Exchange Fee</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={
                        userFee === '' || userFee === null
                          ? ''
                          : // Stored as decimal (e.g. 0.001 = 0.1%); display
                            // in percent. Round to 4 decimal percent places
                            // to avoid float artifacts (0.0008 * 100 ≠ 0.08).
                            +(Number(userFee) * 100).toFixed(4)
                      }
                      onChange={(e) =>
                        setUserFee(
                          e.target.value === ''
                            ? ''
                            : Number(e.target.value) / 100
                        )
                      }
                      endAdornment="%"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Slippage</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={slippagePercent}
                      onChange={(e) =>
                        setSlippagePercent(Number(e.target.value))
                      }
                      endAdornment="%"
                    />
                  </div>
                </div>

                {/* Sortino Ratio Calculation */}
                <div className="space-y-sm">
                  <h3 className="font-semibold text-sm">
                    Sortino Ratio Calculation
                  </h3>

                  <div className="space-y-1">
                    <Label className="text-xs">Risk free rate</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={RFR}
                      onChange={(e) => setRFR(e.target.value)}
                      endAdornment="%"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Minimum acceptable return</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={MAR}
                      onChange={(e) => setMAR(e.target.value)}
                      endAdornment="%"
                    />
                  </div>
                </div>

                {/* Period settings */}
                <div className="space-y-sm">
                  <h3 className="font-semibold text-sm">Period settings</h3>

                  <div className="space-y-1">
                    <Label className="text-xs">Candle timeframe</Label>
                    <Select
                      value={timeframe}
                      onValueChange={(value) =>
                        setTimeframe(value as ExchangeIntervals)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        {intervals.map((interval) => (
                          <SelectItem key={interval} value={interval}>
                            {intervalMap[interval]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Period</Label>
                    <Select value={periodId} onValueChange={handlePeriodChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        {periods.map((period) => (
                          <SelectItem key={period.uuid} value={period.uuid}>
                            {period.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom</SelectItem>
                        {periods.length > 0 && (
                          <SelectItem value="__manage__">
                            Manage periods…
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {selectedPeriod && (
                <div className="text-xs text-muted-foreground bg-muted/30 p-xs rounded">
                  From {new Date(selectedPeriod.from).toLocaleString()} to{' '}
                  {new Date(selectedPeriod.to).toLocaleString()} ({periodDays}{' '}
                  {periodDays === 1 ? 'day' : 'days'})
                </div>
              )}

              {periodId === 'auto' &&
                autoPeriod &&
                autoPeriod.from &&
                autoPeriod.to && (
                  <div className="text-xs text-muted-foreground bg-muted/30 p-xs rounded">
                    From {new Date(autoPeriod.from * 1000).toLocaleDateString()}{' '}
                    12:00 AM to{' '}
                    {new Date(autoPeriod.to * 1000).toLocaleDateString()} 11:59
                    PM (
                    {Math.floor(
                      (autoPeriod.to - autoPeriod.from) / (24 * 60 * 60)
                    )}{' '}
                    {Math.floor(
                      (autoPeriod.to - autoPeriod.from) / (24 * 60 * 60)
                    ) === 1
                      ? 'day'
                      : 'days'}
                    )
                  </div>
                )}

              {/* Custom Period Settings */}
              {periodId === 'custom' && (
                <div className="space-y-sm border-t pt-3">
                  <h3 className="font-semibold text-sm">Custom Period</h3>

                  <div className="grid grid-cols-2 gap-sm">
                    <div className="space-y-1">
                      <Label className="text-xs">Start date &amp; time</Label>
                      <input
                        type="datetime-local"
                        value={startDate}
                        max={formatLocalDateTime(new Date())}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-9 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">End date &amp; time</Label>
                      <input
                        type="datetime-local"
                        value={endDate}
                        max={formatLocalDateTime(new Date())}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-9 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {startDate &&
                    endDate &&
                    parseLocalDateTime(startDate) >
                      parseLocalDateTime(endDate) && (
                      <p className="text-xs text-destructive">
                        Start date must be before end date
                      </p>
                    )}

                  <div className="flex items-center gap-xs">
                    <Checkbox
                      checked={saveNew}
                      onCheckedChange={(checked) =>
                        setSaveNew(checked as boolean)
                      }
                    />
                    <Label className="text-xs">Save this period</Label>
                  </div>

                  {saveNew && (
                    <div className="space-y-1">
                      <Label className="text-xs">Period name</Label>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g., Bull run 2024"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Backtest Type and Action */}
              <div className="border-t pt-4 flex items-center justify-between gap-md">
                <div className="flex items-center gap-md">
                  {forceLocalMode ? (
                    <span className="text-xs text-muted-foreground">
                      Runs locally in your browser.
                    </span>
                  ) : (
                    <>
                      <span className="text-xs font-medium">
                        Backtest type:
                      </span>
                      <RadioGroup
                        value={mode}
                        onValueChange={(value) => {
                          logger.info(
                            '[backtester] User selected backtest mode',
                            {
                              mode: value,
                            }
                          );
                          setMode(value as 'local' | 'server');
                        }}
                      >
                        <div className="flex items-center gap-md">
                          <div className="flex items-center gap-xs">
                            <RadioGroupItem
                              value="local"
                              id="backtest-local"
                            />
                            <Label
                              htmlFor="backtest-local"
                              className="text-xs cursor-pointer"
                            >
                              Client Side
                            </Label>
                          </div>
                          <div className="flex items-center gap-xs">
                            <RadioGroupItem
                              value="server"
                              id="backtest-server"
                            />
                            <Label
                              htmlFor="backtest-server"
                              className="text-xs cursor-pointer"
                            >
                              Server Side
                            </Label>
                          </div>
                        </div>
                      </RadioGroup>
                    </>
                  )}
                </div>
                <Button
                  variant="gradient"
                  size="default"
                  onClick={handleRun}
                  disabled={
                    running ||
                    (startDate !== '' &&
                      endDate !== '' &&
                      parseLocalDateTime(startDate) >
                        parseLocalDateTime(endDate))
                  }
                >
                  {running ? 'Running...' : 'START TEST'}
                </Button>
              </div>

              {/* Info Message */}
              <div className="text-xs text-muted-foreground bg-muted/30 p-sm rounded">
                {mode === 'local' && (
                  <>
                    Backtesting is performed on your device. Backtesting
                    processing speed depends on your device's performance. If
                    your backtest freezes, try on a smaller period. Also, Chrome
                    browser is the fastest among all browsers tested.
                    {' '}
                    <a
                      href="/help/backtesting-trading-bots"
                      className="text-primary underline hover:text-primary/80"
                    >
                      Learn more
                    </a>
                  </>
                )}
                {mode === 'server' && (
                  <>
                    The backtest will be run on our server and we will notify
                    you of the results (on app and via email) when ready.
                    {' '}
                    <a
                      href="/help/strategy-vs-random-scatterplot"
                      className="text-primary underline hover:text-primary/80"
                    >
                      Strategy vs random
                    </a>
                  </>
                )}
              </div>
              {/* Local availability message */}
              {/* {localAvailable === false ? (
                <>
                  <div className="text-xs text-danger mt-2 flex items-center gap-xs">
                    <div>
                      [backtester] Local backtest not available on this build
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        logger.info('[backtester] User clicked retry check');
                        (async () => {
                          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                          // @ts-ignore
                          const pkg = await new Function(
                            'return import("@gainium/backtester/dist/dca")'
                          )().catch(() => null);
                          const Backtester =
                            pkg?.default ||
                            pkg?.DCABacktester ||
                            pkg?.DCABacktesting ||
                            pkg?.DCABacktester?.default ||
                            pkg?.DCABacktesting?.default
                          logger.debug('[backtester] Retry import result', { pkg })
                          setLocalAvailable(!!Backtester)
                          if (!!Backtester) {
                            toast.success('Local backtester is now available')
                          } else {
                            toast.error(
                              'Local backtester still not available. Try running fullInit and reinstalling dependencies.'
                            );
                          }
                        })();
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                  {backtesterImportKeys ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Detected export keys: {backtesterImportKeys.join(', ')}
                    </p>
                  ) : null}
                  {backtesterCandidateKey ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Detected candidate export: {backtesterCandidateKey}
                    </p>
                  ) : null}
                </>
              ) : null} */}

              {/* Client-side backtest progress */}
              {backtestProgress ? (
                <div className="border-t pt-3 mt-3">
                  <div className="flex items-center gap-sm">
                    <div className="flex-1">
                      <div className="text-xs font-medium mb-1">
                        Backtest progress
                      </div>
                      {(() => {
                        const p = backtestProgress.progress ?? 0;
                        const normalized =
                          p <= 1 ? Math.round(p * 100) : Math.round(p);
                        return (
                          <ProgressBar
                            value={normalized}
                            size="md"
                            showPercentage
                            variant="primary"
                          />
                        );
                      })()}
                      <div className="text-xs text-muted-foreground mt-2">
                        {backtestProgress.text}
                      </div>
                    </div>
                    <div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          logger.info(
                            '[backtester] User clicked cancel local backtest'
                          );
                          onCancelLocal?.();
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BacktestSettingsDialog;
