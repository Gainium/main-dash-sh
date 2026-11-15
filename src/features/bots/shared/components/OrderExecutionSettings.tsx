import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow, {
  SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import { useExitExecution } from '@/features/bots/shared/hooks/useExitExecution';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import {
  EXECUTION_LIMITS,
  availableExecutionModes,
  availableSliceModes,
  limitTimeoutSupported,
  type ExecutionModeContext,
  fitSliceMode,
  EXECUTION_MODE_DEFAULTS,
  EXECUTION_MODE_LABELS,
  fitExecutionToModes,
  normalizeExecution,
  summarizeExecution,
  triggerFromCloseCondition,
  type ExecutionMode,
  type ExecutionTrigger,
  type ExecutionStage,
  type OrderExecution,
} from '@/types/orderExecution';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { Info } from 'lucide-react';
import React from 'react';

export const ORDER_EXECUTION_HELP_URL = '/help/order-execution';

const STAGE_NAMES: Record<ExecutionStage, string> = {
  entry: 'Base order execution',
  dca: 'DCA order execution',
  tp: 'Take profit execution',
  sl: 'Stop loss execution',
  close: 'Close execution',
};

const STAGE_TOOLTIPS: Record<ExecutionStage, string> = {
  entry:
    'How the base order is placed when a deal starts. Market fills immediately. Limit waits at the price when the deal started. Chasing limit follows the price until it fills. Split order places a large base order in several smaller orders.',
  dca: 'How DCA orders are placed. Market fills when price reaches the DCA level. Limit rests in the order book at the DCA level. Split order places a large DCA order in several smaller orders.',
  tp: 'How the order that closes the deal is placed once take profit triggers. Market fills immediately. Limit waits at the take profit price. Chasing limit follows the price until it fills. Split order closes a large position in several smaller orders.',
  sl: 'How the order that closes the deal is placed once stop loss triggers. Market fills immediately. Chasing limit places a limit at the current price and follows the price until it fills. Split order closes a large position in several smaller orders.',
  close:
    'How the order that closes the deal is placed. Market fills immediately. Chasing limit follows the price until it fills. Split order closes a large position in several smaller orders.',
};

const SLICE_MODE_LABELS = {
  limit: 'Limit at the trigger price',
  chase: 'Chasing limit',
  market: 'Market',
} as const;

const TOOLTIPS = {
  enterMarketTimeout:
    'If the limit order is still not filled after this many seconds, it is cancelled and the rest is executed at market. For an order resting at a price level, the count starts at its first partial fill, so a partly filled order does not stay open forever. 0 keeps the order open until it fills.',
  repriceSec:
    'A chasing limit is cancelled and placed again at the current price at this interval, so it follows the market instead of being left behind.',
  maxChasePerc:
    'The furthest a chasing limit is moved from the price at which the exit triggered. It never follows the price beyond this. 0 means no cap.',
  slices: 'The position is closed in this many equal parts.',
  pace: 'One at a time keeps a single slice on the order book and places the next one after it fills (iceberg). On a timer places a new slice at a fixed interval, whether or not the previous one filled (TWAP).',
  sliceInterval:
    'Time between slices. It gives the order book time to refill before the next slice is placed.',
  sliceMode:
    'How each slice is placed. Nothing rests in the order book before the trigger. With a price-level trigger, limit slices are placed at the trigger price once price reaches it. With a signal trigger or a stop loss, slices start when the trigger fires, as a chasing limit or at market.',
  floorPerc:
    'How far price may move against the exit trigger while slices are still being placed. 0 means no floor.',
  onFloor:
    'What split order does when price moves past the price floor: pause until price comes back, or execute the rest at market.',
};

interface FieldProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, tooltip, children }) => (
  <div className="flex flex-col gap-1 @[420px]:flex-row @[420px]:items-center @[420px]:justify-between @[420px]:gap-sm">
    <div className="flex items-center gap-xs">
      <Label className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {tooltip ? (
        <Tooltip tooltip={tooltip} side="right">
          <InfoIcon />
        </Tooltip>
      ) : null}
    </div>
    <div className="w-full @[420px]:w-44">{children}</div>
  </div>
);

interface NumFieldProps {
  value: number | undefined;
  onChange: (value: number) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
}

const NumField: React.FC<NumFieldProps> = ({
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  disabled,
}) => (
  <NumberInput
    value={value ?? ''}
    onChange={(raw) => {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        onChange(Math.min(max, Math.max(min, n)));
      }
    }}
    min={min}
    max={max}
    step={step}
    showControls={false}
    disabled={disabled}
    className="w-full"
    endAdornment={unitAdornment(unit)}
  />
);

interface ChoiceProps<T extends string> {
  value: T | undefined;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}

const Choice = <T extends string>({
  value,
  options,
  onChange,
  disabled,
}: ChoiceProps<T>) => (
  <Select
    value={value}
    onValueChange={(v) => onChange(v as T)}
    disabled={disabled}
  >
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export interface OrderExecutionSettingsProps {
  stage: ExecutionStage;
  value: OrderExecution;
  onChange: (value: OrderExecution) => void;
  /** Overrides the row title (e.g. inside a dialog). */
  name?: string;
  disabled?: boolean;
  className?: string;
  colSpan?: 1 | 2 | 3 | 'full';
  /** What starts the exit; changes when a limit order is placed. */
  trigger?: ExecutionTrigger;
  /** Bot facts that narrow the offered modes to what the engine executes. */
  modeContext?: ExecutionModeContext;
  /** Render without the SettingsRow wrapper (dialogs supply their own). */
  bare?: boolean;
}

/**
 * The one control for how an exit order executes. Used by take profit,
 * stop loss, manual close and bot stop so all of them behave and read the same.
 */
export const OrderExecutionSettings: React.FC<OrderExecutionSettingsProps> = ({
  stage,
  value,
  onChange,
  name,
  disabled,
  className,
  colSpan,
  trigger = 'level',
  modeContext = {},
  bare,
}) => {
  const modes = availableExecutionModes(stage, trigger, modeContext);
  const showTimeout = limitTimeoutSupported(stage, trigger, modeContext);
  const fitted = fitSliceMode(
    normalizeExecution(fitExecutionToModes(value, modes)),
    trigger,
    stage
  );
  // A chasing stop loss must end at market: without a timeout, a fast drop past
  // the max chase would leave the position open.
  const current =
    stage === 'sl' && fitted.mode === 'chase' && !(fitted.timeoutSec ?? 0)
      ? {
          ...fitted,
          timeoutSec: EXECUTION_MODE_DEFAULTS.chase.timeoutSec ?? 35,
        }
      : fitted;
  const timeoutMin = stage === 'sl' ? 1 : EXECUTION_LIMITS.timeoutSec.min;
  const set = (patch: Partial<OrderExecution>) =>
    onChange({ ...current, ...patch });

  const setMode = (mode: ExecutionMode) => {
    if (mode === current.mode) {
      return;
    }
    // Keep chase parameters when moving between chase and split.
    const carry =
      current.mode === 'chase' || current.mode === 'split'
        ? {
            repriceSec: current.repriceSec,
            maxChasePerc: current.maxChasePerc,
          }
        : {};
    // A stop loss must not stall in a falling market: finish at market by default.
    const stageDefaults = {
      ...(stage === 'sl' && mode === 'split'
        ? { onFloor: 'market' as const }
        : {}),
      ...(mode === 'split'
        ? { sliceMode: availableSliceModes(trigger, stage)[0] }
        : {}),
    };
    onChange(
      normalizeExecution({
        ...EXECUTION_MODE_DEFAULTS[mode],
        ...stageDefaults,
        ...carry,
        mode,
      })
    );
  };

  const enterMarketTimeoutField = (
    <Field label="Enter market timeout" tooltip={TOOLTIPS.enterMarketTimeout}>
      <NumField
        value={current.timeoutSec}
        onChange={(v) => set({ timeoutSec: v })}
        unit="sec"
        {...EXECUTION_LIMITS.timeoutSec}
        min={timeoutMin}
        disabled={disabled}
      />
    </Field>
  );

  const chaseFields = (
    <>
      <Field label="Re-price every" tooltip={TOOLTIPS.repriceSec}>
        <NumField
          value={current.repriceSec}
          onChange={(v) => set({ repriceSec: v })}
          unit="sec"
          {...EXECUTION_LIMITS.repriceSec}
          disabled={disabled}
        />
      </Field>
      <Field label="Max chase" tooltip={TOOLTIPS.maxChasePerc}>
        <NumField
          value={current.maxChasePerc}
          onChange={(v) => set({ maxChasePerc: v })}
          unit="%"
          step={0.05}
          {...EXECUTION_LIMITS.maxChasePerc}
          disabled={disabled}
        />
      </Field>
    </>
  );

  const splitFields = (
    <>
      <SettingsAlert
        variant="warning"
        title="Only for large orders on low-liquidity pairs"
        description="Split order is slower than a single order. Use it only when your position is large compared with the order book, where one order would fill far from the trigger price."
      />
      <Field label="Slices" tooltip={TOOLTIPS.slices}>
        <NumField
          value={current.slices}
          onChange={(v) => set({ slices: Math.round(v) })}
          unit="slices"
          {...EXECUTION_LIMITS.slices}
          disabled={disabled}
        />
      </Field>
      <Field label="Pace" tooltip={TOOLTIPS.pace}>
        <Choice
          value={current.pace}
          options={[
            { value: 'iceberg', label: 'One at a time' },
            { value: 'twap', label: 'On a timer' },
          ]}
          onChange={(v) => set({ pace: v })}
          disabled={disabled}
        />
      </Field>
      <Field
        label={current.pace === 'twap' ? 'Interval' : 'Pause between slices'}
        tooltip={TOOLTIPS.sliceInterval}
      >
        <NumField
          value={current.sliceIntervalSec}
          onChange={(v) => set({ sliceIntervalSec: v })}
          unit="sec"
          {...EXECUTION_LIMITS.sliceIntervalSec}
          disabled={disabled}
        />
      </Field>
      <Field label="Each slice" tooltip={TOOLTIPS.sliceMode}>
        <Choice
          value={current.sliceMode}
          options={availableSliceModes(trigger, stage).map((m) => ({
            value: m,
            label: SLICE_MODE_LABELS[m],
          }))}
          onChange={(v) => set({ sliceMode: v })}
          disabled={disabled}
        />
      </Field>
      {current.sliceMode === 'chase' ? chaseFields : null}
      <Field label="Price floor" tooltip={TOOLTIPS.floorPerc}>
        <NumField
          value={current.floorPerc}
          onChange={(v) => set({ floorPerc: v })}
          unit="%"
          step={0.1}
          {...EXECUTION_LIMITS.floorPerc}
          disabled={disabled}
        />
      </Field>
      {(current.floorPerc ?? 0) > 0 ? (
        <Field label="Past the floor" tooltip={TOOLTIPS.onFloor}>
          <Choice
            value={current.onFloor}
            options={[
              { value: 'pause', label: 'Pause and wait' },
              { value: 'market', label: 'Execute the rest at market' },
            ]}
            onChange={(v) => set({ onFloor: v })}
            disabled={disabled}
          />
        </Field>
      ) : null}
    </>
  );

  const body = (
    <div className="@container space-y-sm">
      <Tabs
        value={current.mode}
        onValueChange={(v) => {
          if (!disabled) {
            setMode(v as ExecutionMode);
          }
        }}
      >
        <TabsList className="w-full" fullWidth>
          {modes.map((m) => (
            <TabsTrigger key={m} value={m} disabled={disabled}>
              {EXECUTION_MODE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {current.mode !== 'market' &&
      !(current.mode === 'limit' && !showTimeout) ? (
        <SettingsRowSurface
          tone="faint"
          spacing="sm"
          padding="sm"
          className="max-w-xl"
        >
          {current.mode === 'limit' && showTimeout
            ? enterMarketTimeoutField
            : null}
          {current.mode === 'chase' ? (
            <>
              {chaseFields}
              {enterMarketTimeoutField}
            </>
          ) : null}
          {current.mode === 'split' ? splitFields : null}
        </SettingsRowSurface>
      ) : null}
      <div
        data-slot="execution-summary"
        className="flex max-w-xl gap-xs rounded-lg border border-border/60 bg-muted/10 p-sm text-xs text-muted-foreground"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          {summarizeExecution(stage, current, trigger).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );

  if (bare) {
    return body;
  }

  return (
    <SettingsRow
      name={name ?? STAGE_NAMES[stage]}
      tooltip={STAGE_TOOLTIPS[stage]}
      tooltipURL={ORDER_EXECUTION_HELP_URL}
      {...(colSpan ? { colSpan } : {})}
      className={className}
      contentClassName="space-y-xs"
    >
      {body}
    </SettingsRow>
  );
};

export default OrderExecutionSettings;

interface ExitExecutionRowProps {
  stage: 'entry' | 'dca' | 'tp' | 'sl';
  isCombo: boolean;
  /** Overrides the trigger read from the form (entry / dca pass their own). */
  trigger?: ExecutionTrigger;
  disabled?: boolean;
  className?: string;
  colSpan?: 1 | 2 | 3 | 'full';
}

/** OrderExecutionSettings bound to the bot form's execution for a stage. */
export const ExitExecutionRow: React.FC<ExitExecutionRowProps> = ({
  stage,
  isCombo,
  trigger: triggerOverride,
  disabled,
  className,
  colSpan,
}) => {
  const [value, setValue] = useExitExecution(stage, isCombo);
  const tpCondition = useBotFormSelector('dealCloseCondition');
  const slCondition = useBotFormSelector('dealCloseConditionSL');
  const useMultiTp = useBotFormSelector('useMultiTp');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const trigger =
    triggerOverride ??
    (stage === 'tp'
      ? triggerFromCloseCondition(tpCondition)
      : stage === 'sl'
        ? triggerFromCloseCondition(slCondition)
        : stage === 'dca'
          ? 'level'
          : 'start');
  return (
    <OrderExecutionSettings
      stage={stage}
      trigger={trigger}
      modeContext={{
        isCombo,
        multiTarget: stage === 'tp' && !!useMultiTp,
        entrySplitBlocked:
          !!useRiskReward || (`${strategy}` === 'SHORT' && !futures),
      }}
      value={value}
      onChange={setValue}
      disabled={disabled}
      className={className}
      {...(colSpan ? { colSpan } : {})}
    />
  );
};
