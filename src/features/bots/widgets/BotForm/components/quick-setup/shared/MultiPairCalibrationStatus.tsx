/* eslint-disable spacing/no-hardcoded-font-size */
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import type { MarketStats, MultiPairStatsResult } from '@/utils/marketStats';

interface RecalculateButtonProps {
  isMultiPair: boolean;
  multiPairLoading: boolean;
  submittedSymbols: string[] | null;
  pairList: ReadonlyArray<string>;
  recalculateDisabled: boolean;
  onRecalculate: () => void;
}

/**
 * The "Recalculate across pairs" button. Passed as `trailing` to the
 * Risk-profile SettingsRow. Renders nothing when the bot only has a
 * single pair.
 */
export const RecalculateAcrossPairsButton: React.FC<RecalculateButtonProps> = ({
  isMultiPair,
  multiPairLoading,
  submittedSymbols,
  pairList,
  recalculateDisabled,
  onRecalculate,
}) => {
  if (!isMultiPair) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onRecalculate}
      disabled={recalculateDisabled}
      className="h-7 text-xs"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${multiPairLoading ? 'animate-spin' : ''}`}
      />
      {multiPairLoading
        ? `Calibrating ${submittedSymbols?.length ?? pairList.length} pairs…`
        : 'Recalculate across pairs'}
    </Button>
  );
};

interface MultiPairCalibrationStatusProps {
  firstPair: string;
  pairList: ReadonlyArray<string>;
  isMultiPair: boolean;
  isStale: boolean;
  submittedSymbols: string[] | null;
  multiPairActive: boolean;
  multiPairResult: MultiPairStatsResult | null;
  marketStats: MarketStats | null | undefined;
  marketStatsLoading: boolean;
}

/**
 * Explanatory paragraph + tooltip + stale/tip lines that sit above
 * the preset picker on the Risk-profile SettingsRow. Pure
 * presentational — the consumer owns all state and supplies the
 * matching `RecalculateAcrossPairsButton` as the row's trailing slot.
 */
export const MultiPairCalibrationStatus: React.FC<
  MultiPairCalibrationStatusProps
> = ({
  firstPair,
  pairList,
  isMultiPair,
  isStale,
  submittedSymbols,
  multiPairActive,
  multiPairResult,
  marketStats,
  marketStatsLoading,
}) => {
  return (
    <>
      {firstPair && (
        <div className="flex items-start gap-xs text-[11px] text-muted-foreground">
          <p className="min-w-0 flex-1">
            {marketStatsLoading
              ? submittedSymbols !== null
                ? `Loading 1-year price history for ${submittedSymbols.length} pairs…`
                : `Loading 1-year price history for ${firstPair}…`
              : multiPairActive && multiPairResult?.stats
                ? `Calibrated across ${multiPairResult.included.length} of ${multiPairResult.total} pairs (worst-of) — worst dip ${multiPairResult.stats.drawdowns.fullPeriodMax.toFixed(0)}%, typical month ${multiPairResult.stats.drawdowns.month.p50.toFixed(0)}%.${multiPairResult.skipped.length > 0 ? ` ${multiPairResult.skipped.length} skipped — not enough history.` : ''}`
                : marketStats?.hasFullYear &&
                    marketStats.drawdowns.month.sampleCount > 0
                  ? `Calibrated to ${firstPair} — ${marketStats.drawdowns.month.sampleCount} monthly windows analyzed, worst dip ${marketStats.drawdowns.fullPeriodMax.toFixed(0)}%, typical month ${marketStats.drawdowns.month.p50.toFixed(0)}%.`
                  : `Using default values — less than 1 year of ${firstPair} history available.`}
          </p>
          {multiPairActive && multiPairResult && (
            <Tooltip
              side="left"
              tooltip={[
                multiPairResult.included.length > 0
                  ? `Used in calibration (${multiPairResult.included.length}):\n${multiPairResult.included.map((s) => `  • ${s}`).join('\n')}`
                  : null,
                multiPairResult.skipped.length > 0
                  ? `Skipped — not enough history (${multiPairResult.skipped.length}):\n${multiPairResult.skipped.map((s) => `  • ${s}`).join('\n')}`
                  : null,
              ]
                .filter(Boolean)
                .join('\n\n')}
            >
              <InfoIcon />
            </Tooltip>
          )}
        </div>
      )}
      {isMultiPair && submittedSymbols === null && (
        <p className="text-[11px] text-muted-foreground">
          Calibration uses only {firstPair}. Click "Recalculate across pairs" to
          size the ladder for the worst of all {pairList.length} pairs.
        </p>
      )}
      {isMultiPair && submittedSymbols !== null && isStale && (
        <p className="text-[11px] text-amber-500">
          Pair set changed since last calibration — click "Recalculate across
          pairs" to refresh.
        </p>
      )}
      {isMultiPair && submittedSymbols !== null && !isStale && (
        <p className="text-[11px] text-muted-foreground">
          Tip: fewer pairs allow finer calibration to each coin.
        </p>
      )}
    </>
  );
};
