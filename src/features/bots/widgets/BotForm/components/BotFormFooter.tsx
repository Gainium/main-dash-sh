import { track as posthogEvent } from '@/lib/analytics'
import {
  ArrowRight,
  BookmarkIcon,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Loader2,
  Lock,
  MoreVertical,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Unlock,
  X,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  PeriodDatePicker,
  type PeriodValue,
} from '@/components/ui/PeriodDatePicker'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { BacktestConfig } from './BacktestSettingsDialog'
import { useBotFormPreloadStore } from '@/stores/botFormPreloadStore'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { type PanelMenuConfig } from '@/components/bots/panels/PanelContainer'
import { Button } from '@/components/ui/button'
import {
  ResponsiveButtonRow,
  type OverflowMenuItem,
  type ResponsiveButtonConfig,
  type ResponsiveButtonRenderProps,
} from '@/components/ui/ResponsiveButtonRow'
import {
  useBotFormEditing,
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider'
import {
  CloseOptionsDialog,
  type CloseTypeOption,
} from '@/features/bots/shared/runtime/dialogs'
import { isReadOnly } from '@/lib/demoMode'
import { IS_CLOUD } from '@/config/mode'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/lib/toast'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { cn } from '@/lib/utils'
import type { BotTemplate } from '@/stores/botTemplatesStore'
import {
  BotTypesEnum,
  BuyTypeEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  DCATypeEnum,
  type BotStatus,
  type DCABot,
  type ExchangeInUser,
  ExchangeIntervals,
} from '@/types'
import type { BotFormData, BotFormErrors } from '@/types/bots'
import { calculateCost } from '@/utils/bots/credits'
import CoinIcon from '@/components/widgets/shared/CoinIcon'
import { useBotDealCapital } from '@/hooks/bots/dca/useBotDealCapital'
import { useDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext'
import { useVerifyTerminalBalance } from '@/hooks/bots/dca/useVerifyTerminalBalance'
import { BotFormSaveTemplateDialog } from './BotFormSaveTemplateDialog'
import GridStartBotDialog from '@/features/bots/shared/runtime/dialogs/GridStartBotDialog'
import GridStopBotDialog from '@/features/bots/shared/runtime/dialogs/GridStopBotDialog'

export interface ToggleStatusPayload {
  nextStatus: BotStatus
  closeType?: CloseDCATypeEnum
  buyType?: BuyTypeEnum
  buyCount?: string
  buyAmount?: number
  cancelPartiallyFilled?: boolean
  closeGridType?: CloseGRIDTypeEnum
}

export interface BotFormFooterProps {
  mode: BotFormMode
  errors: BotFormErrors
  submitLabel: string
  submitDisabled: boolean
  submitIsPending: boolean
  onSubmit: () => void | Promise<void>
  onToggleStatus?: ((payload: ToggleStatusPayload) => void) | undefined
  toggleDisabled?: boolean
  togglePending?: boolean
  botStatus?: string | null
  bot?: DCABot | null
  showErrorSummary?: boolean
  menuConfig?: PanelMenuConfig | null
  showCredits?: boolean
  formData: BotFormData
  botType: BotTypesEnum
  currentExchange: ExchangeInUser | null
  onBacktest?: (formData?: BotFormData) => void
  /**
   * Optional direct backtest runner. When provided, the compact
   * Backtest button in the footer skips the settings dialog and calls
   * this with the picked period + timeframe. The "More" button still
   * opens the full dialog via `onBacktest`.
   */
  onRunBacktestDirect?: (
    cfg: import('./BacktestSettingsDialog').BacktestConfig,
  ) => void | Promise<void>
  /** Live backtest progress for the inline progress bar. */
  backtestProgress?: import('@/types').BacktestProgress | null
  /** Cancel an in-progress local backtest. */
  onCancelBacktest?: () => void
  backtestPending?: boolean
  /**
   * Headline numbers for the "done" state. When non-null (and no run is in
   * progress), the backtest box morphs from the run controls into a
   * "VIEW RESULTS" summary chip showing net %, win rate, and deal count.
   * Cleared (back to `null`) on the next run so it never shows stale data.
   */
  backtestSummary?: {
    netPerc: number
    winRate: number
    deals: number
  } | null
  /** Open the full-screen results modal (the "done" chip's click handler). */
  onViewResults?: () => void
  /**
   * Dismiss the "done" chip and restore the backtest run controls so the
   * user can run another backtest. Clears `backtestSummary` upstream.
   */
  onDismissResults?: () => void
  onLoadTemplate?: (template: BotTemplate) => void
  compactThreshold?: number
  /**
   * When true, the templates dropdown ("Save as preset" / load) is not
   * rendered. Used by hedge bots, which don't yet have template support.
   */
  hideTemplates?: boolean
  /**
   * Multiplier applied to the calculated credits. Used by hedge bots so the
   * footer reports the combined cost of long + short legs (×2) rather than
   * one leg's cost.
   */
  creditsMultiplier?: number
  /**
   * Override the active-deals count the stop-confirmation dialog gates on.
   * The footer normally reads `bot?.dealsInBot?.active`; for hedge bots
   * `bot` is the leg, but a hedge stop affects both legs so the layout
   * passes the summed count.
   */
  activeDealsOverride?: number
}

const ACTIVE_STATUSES = new Set(['error', 'open', 'range', 'monitoring'])

/**
 * Button priority constants for ResponsiveButtonRow.
 * Higher number = higher priority (compacts last).
 * Lower number = lower priority (compacts first).
 */
// eslint-disable-next-line react-refresh/only-export-components
export const BUTTON_PRIORITIES = {
  /** Credits cost chip - lowest priority, compacts first, sits far left */
  CREDITS: 1,
  /** Total-funds chip - low priority, compacts early, sits left */
  FUNDS: 2,
  /** Templates menu - lower priority, compacts early */
  TEMPLATES: 2,
  /** Backtest button - medium priority */
  BACKTEST: 3,
  /** Start/Stop toggle - high priority, compacts late */
  TOGGLE: 4,
  /** Edit toggle - high priority, compacts late */
  EDIT: 5,
  /** Primary action (Save/Create) - highest priority, can compact but is fullwidth */
  SUBMIT: 6,
} as const

interface BacktestPeriodChipProps {
  isCompact: boolean
  disabled: boolean
  label: string
  value: PeriodValue | null
  onApply: (value: PeriodValue | null) => void
  onReset: () => void
}

const BacktestPeriodChip: React.FC<BacktestPeriodChipProps> = ({
  isCompact,
  disabled,
  label,
  value,
  onApply,
  onReset,
}) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          disabled={disabled}
          aria-label='Choose backtest period'
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md bg-card text-xs font-medium tabular-nums text-foreground shadow-sm transition-colors hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-50',
            isCompact ? 'w-8 justify-center px-0' : 'px-2',
            open && 'ring-1 ring-border',
          )}
        >
          <CalendarRange className='h-3.5 w-3.5 opacity-70' />
          {!isCompact && (
            <>
              <span>{label}</span>
              <ChevronDown className='h-3 w-3 opacity-60' />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <PeriodDatePicker value={value} onApply={onApply} onReset={onReset} />
      </PopoverContent>
    </Popover>
  )
}

interface BacktestCandleChipProps {
  isCompact: boolean
  disabled: boolean
  value: ExchangeIntervals
  options: Array<{ value: ExchangeIntervals; label: string }>
  onChange: (value: ExchangeIntervals) => void
}

const BacktestCandleChip: React.FC<BacktestCandleChipProps> = ({
  isCompact,
  disabled,
  value,
  options,
  onChange,
}) => {
  const [open, setOpen] = useState(false)
  const label = options.find((o) => o.value === value)?.label ?? value
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          disabled={disabled}
          aria-label='Candle timeframe'
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md bg-card text-xs font-medium tabular-nums text-foreground shadow-sm transition-colors hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-50',
            isCompact ? 'w-8 justify-center px-0' : 'px-2',
            open && 'ring-1 ring-border',
          )}
        >
          <Clock className='h-3.5 w-3.5 opacity-70' />
          {!isCompact && (
            <>
              <span>{label}</span>
              <ChevronDown className='h-3 w-3 opacity-60' />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-32 p-1'>
        {options.map((opt) => (
          <button
            key={opt.value}
            type='button'
            onClick={() => {
              onChange(opt.value)
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-sm px-sm py-1.5 text-left text-xs hover:bg-muted',
              opt.value === value &&
                'bg-muted/60 font-semibold text-foreground',
            )}
          >
            <span>{opt.label}</span>
            {opt.value === value && <span className='text-primary'>●</span>}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

const candleOptions: Array<{ value: ExchangeIntervals; label: string }> = [
  { value: ExchangeIntervals.oneM, label: '1m' },
  { value: ExchangeIntervals.fiveM, label: '5m' },
  { value: ExchangeIntervals.fifteenM, label: '15m' },
  { value: ExchangeIntervals.thirtyM, label: '30m' },
  { value: ExchangeIntervals.oneH, label: '1h' },
  { value: ExchangeIntervals.fourH, label: '4h' },
  { value: ExchangeIntervals.oneD, label: '1d' },
]

const trimZeros = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)

/** Format a plain number, trimming trailing zeros (e.g. 250.50 → "250.5"). */
const fmtNumber = (n: number, maxDecimals: number) =>
  trimZeros(n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals }))

/** Base assets (BTC, ETH …) get more decimals than quote/stable amounts. */
const amountDecimals = (n: number, isBase: boolean) => {
  const abs = Math.abs(n)
  return isBase ? (abs >= 1000 ? 2 : abs >= 1 ? 4 : 8) : 2
}

/** Amount without a currency symbol (chip face shows the asset icon). */
const fmtAmount = (n: number, isBase: boolean) =>
  fmtNumber(n, amountDecimals(n, isBase))

/** Amount with its asset symbol — used inside the breakdown popover. */
const fmtCurrency = (
  n: number,
  currency: string | undefined,
  isBase: boolean,
) => `${fmtAmount(n, isBase)}${currency ? ` ${currency}` : ''}`

/**
 * Shared chip trigger styling for the credits / capital chips — matches the
 * `ghost` button variant (translucent foreground fill, no border/shadow).
 */
const chipButtonClass = (isCompact: boolean, open: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1 rounded-lg text-xs font-medium tabular-nums text-foreground transition-all duration-200 bg-foreground/8 dark:bg-foreground/10 hover:bg-foreground/12 dark:hover:bg-foreground/14 active:bg-foreground/16 dark:active:bg-foreground/18',
    isCompact ? 'w-8 justify-center px-0' : 'px-2',
    open && 'ring-1 ring-border',
  )

interface ChipRow {
  label: string
  value: string
}

/** One safety order in the funds popover's itemized DCA breakdown. */
interface DcaStepRow {
  /** e.g. "DCA 1 (2%)". */
  label: string
  /** Formatted amount with its asset symbol. */
  value: string
}

/** Grouped DCA section: a heading, the per-order rows, and a subtotal. */
interface DcaBreakdown {
  /** e.g. "DCA orders (×3 deals)". */
  heading: string
  steps: DcaStepRow[]
  /** Formatted "Total DCA orders" amount. */
  totalValue: string
}

interface CreditsChipProps {
  isCompact: boolean
  credits: {
    base: number
    pairs: number
    indicators: number
    deals: number
    total: number
  }
  affiliate: boolean
}

/**
 * Standalone credits chip for the save row. Mirrors the backtest chips'
 * look (h-8, card surface) and reveals the credit breakdown on hover/focus
 * via a popover — the "why does it cost this much" explainer that used to
 * be hidden behind the in-button adornment. Credits can be fractional
 * (e.g. +0.5 per extra pair), so amounts are shown with decimals.
 */
const CreditsChip: React.FC<CreditsChipProps> = ({
  isCompact,
  credits,
  affiliate,
}) => {
  const [open, setOpen] = useState(false)
  const total =
    credits.base + credits.pairs + credits.indicators + credits.deals
  const totalLabel = fmtNumber(total, 2)
  const rows = [
    { label: 'Base cost', value: credits.base },
    { label: 'Extra pairs', value: credits.pairs },
    { label: 'Indicators', value: credits.indicators },
    { label: 'Extra deals', value: credits.deals },
  ].filter((r) => r.value > 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={`${totalLabel} credits`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={chipButtonClass(isCompact, open)}
        >
          <Coins className='h-3.5 w-3.5 text-warning' />
          {!isCompact && <span>{totalLabel}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='top'
        className='w-56 p-2 text-xs'
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className='mb-1.5 font-semibold text-foreground'>Credits cost</div>
        {affiliate ? (
          <p className='text-muted-foreground'>
            Free — this exchange is an affiliate partner.
          </p>
        ) : (
          <div className='space-y-1'>
            {(rows.length > 0
              ? rows
              : [{ label: 'Base cost', value: credits.base }]
            ).map((r) => (
              <div key={r.label} className='flex items-center justify-between'>
                <span className='text-muted-foreground'>{r.label}</span>
                <span className='tabular-nums'>{fmtNumber(r.value, 2)}</span>
              </div>
            ))}
            <div className='mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold text-foreground'>
              <span>Total</span>
              <span className='tabular-nums'>{totalLabel}</span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface FundsInfo {
  /** Popover heading. */
  title: string
  /** Deposit-currency asset symbol, rendered as the chip's token icon. */
  symbol: string | undefined
  /** Whole-bot total as a bare number (no symbol) for the chip face. */
  amountLabel: string
  /** Whole-bot total with its asset symbol, for the popover total row. */
  totalLabel: string
  /** Component rows that sum to the total (in the deposit currency). */
  rows: ChipRow[]
  /** Itemized DCA section, rendered below `rows`. Null when no safety orders. */
  dca: DcaBreakdown | null
  /** Formatted available balance, or null when it can't be resolved. */
  availableLabel: string | null
  /** Share of available balance this bot needs (null when unknown). */
  pctRequired: number | null
  /** True when the bot needs more than the available balance. */
  overspend: boolean
}

/**
 * Standalone "capital required" chip for the save row. Matches the
 * Investment field's format — the asset's token icon then the amount, no
 * currency text — and reveals a funds breakdown on hover/focus. The
 * displayed currency follows the deposit side: base coin for spot short /
 * COIN-M futures, quote otherwise.
 */
const FundsChip: React.FC<{ isCompact: boolean; info: FundsInfo }> = ({
  isCompact,
  info,
}) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={`Capital required: ${info.totalLabel}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={chipButtonClass(isCompact, open)}
        >
          <CoinIcon symbol={info.symbol || 'USDT'} size='w-4 h-4' />
          {!isCompact && <span>{info.amountLabel}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='top'
        className='w-60 p-2 text-xs'
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className='mb-1.5 font-semibold text-foreground'>{info.title}</div>
        <div className='space-y-1'>
          {info.rows.map((r) => (
            <div
              key={r.label}
              className='flex items-center justify-between gap-4'
            >
              <span className='text-muted-foreground'>{r.label}</span>
              <span className='tabular-nums'>{r.value}</span>
            </div>
          ))}
          {info.dca && (
            <div className='space-y-1'>
              <div className='text-muted-foreground'>{info.dca.heading}</div>
              <div className='max-h-44 space-y-0.5 overflow-y-auto pl-2 pr-1'>
                {info.dca.steps.map((s) => (
                  <div
                    key={s.label}
                    className='flex items-center justify-between gap-4'
                  >
                    <span className='text-muted-foreground'>{s.label}</span>
                    <span className='tabular-nums'>{s.value}</span>
                  </div>
                ))}
              </div>
              <div className='flex items-center justify-between gap-4 font-medium text-foreground'>
                <span>Total DCA orders</span>
                <span className='tabular-nums'>{info.dca.totalValue}</span>
              </div>
            </div>
          )}
          <div className='mt-1 flex items-center justify-between gap-4 border-t border-border pt-1 font-semibold text-foreground'>
            <span>Total needed</span>
            <span className='tabular-nums'>{info.totalLabel}</span>
          </div>
          {info.availableLabel && (
            <div className='flex items-center justify-between gap-4 pt-0.5'>
              <span className='text-muted-foreground'>Available</span>
              <span className='tabular-nums'>{info.availableLabel}</span>
            </div>
          )}
          {info.pctRequired != null && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-muted-foreground'>% of available</span>
              <span
                className={cn(
                  'tabular-nums',
                  info.overspend && 'text-destructive',
                )}
              >
                {fmtNumber(info.pctRequired, 1)}%
              </span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * "Done" state for the backtest box: a full-width summary chip that replaces
 * the run controls once a local DCA backtest has completed. Shows the
 * headline net %, win rate, and deal count, and opens the full results modal
 * on click. Styled per DESIGN_SYSTEM §3 — a soft `bg-primary/10` fill with a
 * `ring-1 ring-primary/30` (NOT a border); net % is tinted profit/loss.
 */
const ViewResultsButton: React.FC<{
  summary: { netPerc: number; winRate: number; deals: number }
  onClick?: () => void
  onDismiss?: () => void
}> = ({ summary, onClick, onDismiss }) => {
  const up = summary.netPerc >= 0
  return (
    // Card is a plain <div> so we can nest two real buttons (View / Dismiss)
    // without invalid button-in-button nesting.
    <div className='group flex w-full items-center gap-2 rounded-lg bg-primary/10 px-2 py-1.5 ring-1 ring-primary/30 transition-colors hover:bg-primary/15'>
      {/* main summary area opens the results modal */}
      <button
        type='button'
        onClick={onClick}
        aria-label='View backtest results'
        className='flex min-w-0 flex-1 items-center gap-2 text-left'
      >
        {/* profit-circle check badge */}
        <span className='grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-profit text-white'>
          <Check className='h-3.5 w-3.5' strokeWidth={3} />
        </span>
        {/* stacked eyebrow + headline numbers */}
        <span className='flex min-w-0 flex-col leading-tight'>
          <span className='text-xs font-semibold uppercase leading-none tracking-wider text-muted-foreground'>
            Backtest complete
          </span>
          <span className='truncate text-xs font-medium tabular-nums text-foreground'>
            <span className={up ? 'text-profit' : 'text-loss'}>
              {up ? '+' : ''}
              {fmtNumber(summary.netPerc, 2)}%
            </span>
            {' · '}
            {fmtNumber(summary.winRate, 0)}% win
            {' · '}
            {summary.deals} {summary.deals === 1 ? 'deal' : 'deals'}
          </span>
        </span>
        {/* right affordance */}
        <span className='ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold uppercase text-primary'>
          View results
          <ArrowRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
        </span>
      </button>
      {/* quiet dismiss — restores the run controls for another backtest */}
      {onDismiss ? (
        <button
          type='button'
          onClick={onDismiss}
          aria-label='Dismiss results'
          className='grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      ) : null}
    </div>
  )
}

export const BotFormFooter: React.FC<BotFormFooterProps> = React.memo(
  ({
    onBacktest,
    formData,
    currentExchange,
    botType,
    mode,
    errors,
    submitLabel,
    submitDisabled,
    submitIsPending,
    onSubmit,
    onToggleStatus,
    toggleDisabled,
    togglePending,
    botStatus,
    bot,
    showErrorSummary = true,
    menuConfig,
    showCredits = false,
    backtestPending = false,
    onLoadTemplate,
    compactThreshold,
    hideTemplates = false,
    creditsMultiplier = 1,
    activeDealsOverride,
    onRunBacktestDirect,
    backtestProgress,
    onCancelBacktest,
    backtestSummary,
    onViewResults,
    onDismissResults,
  }) => {
    const indicators = useBotFormSelector('indicators', [])
    const maxNumberOfOpenDeals = useBotFormSelector('maxNumberOfOpenDeals')
    const type = useBotFormSelector('type')
    const credits = useMemo(() => {
      const computed = calculateCost({
        botType,
        pairs: formData.pair.length,
        indicators: indicators.length,
        deals: +(maxNumberOfOpenDeals ?? '0'),
        // Terminal deals cost a flat `terminalCost` (10) on the backend. The
        // `type` selector doesn't reliably resolve to `terminal` for the
        // place-order flow, so key off the authoritative `formData.terminal`
        // flag to match what the backend actually charges.
        type: formData.terminal ? DCATypeEnum.terminal : type,
        affiliate: !!currentExchange?.affiliate,
      })
      if (creditsMultiplier === 1) return computed
      return {
        base: computed.base * creditsMultiplier,
        indicators: computed.indicators * creditsMultiplier,
        pairs: computed.pairs * creditsMultiplier,
        deals: computed.deals * creditsMultiplier,
        total: computed.total * creditsMultiplier,
      }
    }, [
      botType,
      formData.pair.length,
      formData.terminal,
      indicators.length,
      maxNumberOfOpenDeals,
      type,
      currentExchange?.affiliate,
      creditsMultiplier,
    ])
    const { isEditLocked, toggleEditing } = useBotFormEditing()
    const readOnly = isReadOnly()
    const hasErrors = Object.keys(errors).length > 0
    const shouldDisplayErrorSummary = showErrorSummary && hasErrors

    // Insufficient-credits guard. Creating a bot/terminal deal locks *bot
    // credits*, so the backend rejects the request when the user can't cover the
    // cost — block the submit up front with an explanatory tooltip. Bot credits
    // live in the `subscription.credits` bucket (`balance` minus already-`locked`
    // by running bots), matching legacy main-dash's bot-create gate. This is a
    // DIFFERENT pool from the consumable `user.credits` bucket
    // (`paid`/`subscription.amount`/`blocked`), which only funds server-side
    // backtests and AI — using that bucket here wrongly blocked creation for
    // users who had bot credits but no consumable balance. Credits are a
    // cloud-only concept (sh has no billing), and only `create` consumes new
    // credits — editing an existing bot doesn't. Affiliate exchanges cost 0, so
    // `credits.total` is already 0 there and never trips this.
    const user = useAuthStore((s) => s.user)
    const availableCredits =
      Number(user?.subscription?.credits?.balance ?? 0) -
      Number(user?.subscription?.credits?.locked ?? 0)
    const insufficientCredits =
      IS_CLOUD &&
      mode === 'create' &&
      !!user &&
      credits.total > 0 &&
      credits.total > availableCredits
    const submitTitle = readOnly
      ? 'Saving bots is not available in demo mode'
      : insufficientCredits
        ? `Not enough credits — this bot costs ${fmtNumber(
            credits.total,
            2,
          )} credits but you only have ${fmtNumber(
            availableCredits,
            2,
          )} available.`
        : undefined

    const normalizedStatus = useMemo(
      () => (botStatus ? botStatus.toLowerCase() : undefined),
      [botStatus],
    )

    const isBotActive = useMemo(
      () => (normalizedStatus ? ACTIVE_STATUSES.has(normalizedStatus) : false),
      [normalizedStatus],
    )

    const activeDeals = activeDealsOverride ?? bot?.dealsInBot?.active ?? 0

    const [stopDialogOpen, setStopDialogOpen] = useState(false)
    const [startDialogOpen, setStartDialogOpen] = useState(false)
    const [stopGridDialogOpen, setStopGridDialogOpen] = useState(false)
    const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)

    // "Capital required" chip. Funds to fully fund the whole bot:
    //   - grid: the configured budget (already a whole-bot figure)
    //   - dca/combo/hedge: per-deal capital × max open deals (totalPerBot),
    //     ×creditsMultiplier so hedge reports both legs like the credits do.
    // The displayed currency follows the deposit side — base coin for spot
    // short / COIN-M futures, quote otherwise. Percentage-sized orders can't
    // be expressed as an absolute amount, so the chip is hidden in that case
    // (fundsInfo is null). The read-only mode flag suppresses the context's
    // example-order side effects so this second consumer doesn't fight the
    // form's own trading context.
    const budget = useBotFormSelector('budget')
    const dcaTradingContext = useDcaTradingContext(formData, {
      mode: 'settings-readonly',
    })
    // Whole-bot capital, derived from the same example-orders deal summary the
    // DCA overview "Total Funds" tile uses — so the chip and the tile agree even
    // when the order size is referenced in the base currency.
    const dealCapital = useBotDealCapital(formData, dcaTradingContext, {
      creditsMultiplier: creditsMultiplier || 1,
    })
    const fundsInfo = useMemo<FundsInfo | null>(() => {
      const quote = dcaTradingContext.quoteAsset

      // Grid: the budget is the whole-bot investment, denominated in quote.
      if (botType === BotTypesEnum.grid) {
        const b = Number(budget)
        if (!Number.isFinite(b) || b <= 0) return null
        const available = dcaTradingContext.aggregatedBalances?.quote?.free ?? 0
        const pct = available > 0 ? (b / available) * 100 : null
        return {
          title: 'Capital required',
          symbol: quote,
          amountLabel: fmtAmount(b, false),
          totalLabel: fmtCurrency(b, quote, false),
          rows: [
            { label: 'Grid investment', value: fmtCurrency(b, quote, false) },
          ],
          dca: null,
          availableLabel:
            available > 0 ? fmtCurrency(available, quote, false) : null,
          pctRequired: pct,
          overspend: pct != null && pct > 100,
        }
      }

      if (!dealCapital) return null

      const {
        useBase,
        currency: displayCurrency,
        maxDeals,
        total,
        baseOrders,
        dcaOrders,
        dcaSteps,
        availableBalance,
        pctRequired,
        overspend,
      } = dealCapital

      const rows: ChipRow[] = []
      if (baseOrders > 0) {
        rows.push({
          label: `Base orders (×${maxDeals} deals)`,
          value: fmtCurrency(baseOrders, displayCurrency, useBase),
        })
      }

      // Itemized DCA section: one row per safety order with its deviation and
      // amount, plus a subtotal. Falls back to nothing when there are no
      // safety orders (e.g. base-order-only setups).
      const dca: DcaBreakdown | null =
        dcaOrders > 0 && dcaSteps.length > 0
          ? {
              heading: `DCA orders (×${maxDeals} deals)`,
              steps: dcaSteps.map((s) => ({
                label: `DCA ${s.index}${s.deviation ? ` (${s.deviation})` : ''}`,
                value: fmtCurrency(s.amount, displayCurrency, useBase),
              })),
              totalValue: fmtCurrency(dcaOrders, displayCurrency, useBase),
            }
          : null

      const availableLabel =
        availableBalance > 0
          ? fmtCurrency(availableBalance, displayCurrency, useBase)
          : null

      return {
        title: 'Capital required',
        symbol: displayCurrency,
        amountLabel: fmtAmount(total, useBase),
        totalLabel: fmtCurrency(total, displayCurrency, useBase),
        rows,
        dca,
        availableLabel,
        pctRequired,
        overspend,
      }
    }, [botType, budget, dcaTradingContext, dealCapital])

    // Legacy parity (terminal/index.tsx `addNewBot` lines 4219-4225): before
    // placing a terminal order / importing a deal, verify the account can fund
    // it. Without this the request goes through, `createDCABot` returns OK, the
    // success toast fires, and the deal then fails asynchronously in the engine
    // ("Not enough balance to start new deal") — a false success. Block up front
    // with the legacy message instead. Only gates terminal creates; regular bot
    // creation and edits are unaffected.
    const terminalBalanceSufficient = useVerifyTerminalBalance(
      formData,
      dcaTradingContext,
    )

    const handleSubmit = useCallback(() => {
      if (
        mode === 'create' &&
        formData.terminal &&
        !terminalBalanceSufficient
      ) {
        toast.error('Not enough assets to place order')
        return
      }
      void onSubmit()
    }, [onSubmit, mode, formData.terminal, terminalBalanceSufficient])

    // Backtest handler - track bot backtests with PostHog
    const handleBacktest = useCallback(
      (data?: BotFormData) => {
        try {
          const normalizedBotType =
            botType === BotTypesEnum.hedgeDca
              ? 'hedge dca'
              : botType === BotTypesEnum.hedgeCombo
                ? 'hedge combo'
                : botType

          const pairsValue = (data?.pair ?? formData.pair) as string | string[]
          const pairsCount = Array.isArray(pairsValue) ? pairsValue.length : 1
          const primaryPair = Array.isArray(pairsValue)
            ? (pairsValue[0] ?? '')
            : (pairsValue ?? '')

          const useMulti =
            botType === BotTypesEnum.combo
              ? Boolean(data?.combo?.useMulti ?? formData.combo?.useMulti)
              : Boolean(data?.dca?.useMulti ?? formData.dca?.useMulti)

          const isPaper =
            Boolean(currentExchange?.provider) &&
            String(currentExchange?.provider).startsWith('paper')

          posthogEvent('bot_backtest_run', {
            bot_type: normalizedBotType,
            exchange: currentExchange?.provider ?? null,
            has_recording: false,
            is_multi_pair: Boolean(useMulti),
            is_paper: Boolean(isPaper),
            pair: primaryPair,
            pairs: pairsCount,
            indicators: indicators.length,
          })
        } catch {
          // swallow errors to avoid interfering with UI
        }

        void onBacktest?.(data)
      },
      [botType, formData, indicators.length, onBacktest, currentExchange],
    )
    const isGridBot = useMemo(() => botType === BotTypesEnum.grid, [botType])
    const handleToggle = useCallback(() => {
      if (!onToggleStatus) {
        return
      }

      if (isGridBot && !isBotActive) {
        setStartDialogOpen(true)
        return
      }

      if (isGridBot && isBotActive) {
        setStopGridDialogOpen(true)
        return
      }

      if (isBotActive && activeDeals > 0) {
        setStopDialogOpen(true)
        return
      }

      onToggleStatus({
        nextStatus: isBotActive ? 'closed' : 'open',
      })
    }, [onToggleStatus, isBotActive, activeDeals, isGridBot])

    const handleStopConfirm = useCallback(
      (closeType: CloseTypeOption) => {
        setStopDialogOpen(false)
        onToggleStatus?.({ nextStatus: 'closed', closeType })
      },
      [onToggleStatus],
    )

    const handleEditToggle = useCallback(() => {
      toggleEditing()
    }, [toggleEditing])

    const editButtonLabel = isEditLocked ? 'EDIT' : 'CANCEL'
    const EditIcon = isEditLocked ? Unlock : Lock
    const isEditButtonDisabled = submitIsPending || togglePending

    const startButtonLabel = isBotActive
      ? 'STOP'
      : normalizedStatus === 'paused'
        ? 'RESUME'
        : 'START'

    // Use button size variants instead of hard-coded sizing classes

    const isTerminal = useMemo(() => !!formData.terminal, [formData.terminal])
    // Build button configurations for ResponsiveButtonRow

    const buttonConfigs = useMemo((): ResponsiveButtonConfig[] => {
      const configs: ResponsiveButtonConfig[] = []

      // Submit button (Save/Create) - show in create mode, or in edit mode when actively editing
      const showSubmit = mode === 'create' || (mode === 'edit' && !isEditLocked)
      if (showSubmit) {
        configs.push({
          id: 'submit',
          priority: BUTTON_PRIORITIES.SUBMIT,
          fullContent: () => (
            <Button
              type='button'
              data-tour='botForm.launchButton'
              aria-busy={submitIsPending}
              onClick={handleSubmit}
              disabled={
                submitDisabled ||
                readOnly ||
                shouldDisplayErrorSummary ||
                insufficientCredits
              }
              aria-label={submitLabel}
              fullwidth
              className={cn(
                'gradient-brand hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl duration-200 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase',
                mode === 'create' && 'fx-glow',
              )}
              title={submitTitle}
            >
              {submitIsPending ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  <span className='truncate'>{submitLabel}</span>
                </>
              ) : readOnly ? (
                `${submitLabel} (DEMO)`
              ) : (
                <div className='flex items-center justify-center w-full gap-xs'>
                  {mode === 'create' ? (
                    <Plus className='w-4 h-4 shrink-0' />
                  ) : (
                    <Save className='w-4 h-4 shrink-0' />
                  )}
                  <span className='truncate'>{submitLabel}</span>
                </div>
              )}
            </Button>
          ),
          compactContent: (
            <Button
              type='button'
              data-tour='botForm.launchButton'
              aria-busy={submitIsPending}
              onClick={handleSubmit}
              disabled={
                submitDisabled ||
                readOnly ||
                shouldDisplayErrorSummary ||
                insufficientCredits
              }
              aria-label={submitLabel}
              size='icon'
              className={cn(
                'gradient-brand hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl duration-200 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase',
                mode === 'create' && 'fx-glow',
              )}
              title={submitTitle}
            >
              {submitIsPending ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : mode === 'create' ? (
                <Plus className='w-4 h-4' />
              ) : (
                <Save className='w-4 h-4' />
              )}
              <span className='sr-only'>{submitLabel}</span>
            </Button>
          ),
          // Submit button should never overflow - it's the primary action
          neverOverflow: true,
        })
      }

      // Backtest is rendered as its own labeled row above the button row
      // (see footer JSX below), so it's not in configs here.

      // Credits cost chip (far left) — replaces the in-button adornment.
      // Hover reveals the per-component breakdown.
      if (mode === 'create' && showCredits) {
        configs.push({
          id: 'credits',
          priority: BUTTON_PRIORITIES.CREDITS,
          fullContent: ({ isCompact }: ResponsiveButtonRenderProps) => (
            <CreditsChip
              isCompact={isCompact}
              credits={credits}
              affiliate={!!currentExchange?.affiliate}
            />
          ),
          compactContent: (
            <CreditsChip
              isCompact
              credits={credits}
              affiliate={!!currentExchange?.affiliate}
            />
          ),
        })
      }

      // Capital-required chip (left). Hidden when the amount can't be
      // expressed as an absolute figure (e.g. percentage-sized orders).
      if (mode === 'create' && fundsInfo) {
        configs.push({
          id: 'funds',
          priority: BUTTON_PRIORITIES.FUNDS,
          fullContent: ({ isCompact }: ResponsiveButtonRenderProps) => (
            <FundsChip isCompact={isCompact} info={fundsInfo} />
          ),
          compactContent: <FundsChip isCompact info={fundsInfo} />,
        })
      }

      // "Save as template" now lives in the overflow (⋮) menu — see
      // combinedOverflowMenuItems below — instead of a dedicated bookmark
      // button, so the save row mirrors the backtest row above it.

      // Edit button - shown in edit mode
      if (mode === 'edit') {
        configs.push({
          id: 'edit',
          priority: BUTTON_PRIORITIES.EDIT,
          fullContent: (
            <Button
              type='button'
              variant={isEditLocked ? 'default' : 'secondary'}
              onClick={handleEditToggle}
              disabled={isEditButtonDisabled || readOnly}
              className='flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2'
              aria-pressed={!isEditLocked}
              aria-label={isEditLocked ? 'Enable edit mode' : 'Exit edit mode'}
              title={
                readOnly ? 'Editing is not available in demo mode' : undefined
              }
            >
              <EditIcon className='w-4 h-4 shrink-0' />
              <span className='truncate'>{editButtonLabel}</span>
            </Button>
          ),
          compactContent: (
            <Button
              type='button'
              variant={isEditLocked ? 'default' : 'secondary'}
              size='icon'
              onClick={handleEditToggle}
              disabled={isEditButtonDisabled || readOnly}
              className={cn(
                'flex items-center justify-center font-semibold uppercase',
              )}
              aria-pressed={!isEditLocked}
              aria-label={isEditLocked ? 'Enable edit mode' : 'Exit edit mode'}
              title={
                readOnly ? 'Editing is not available in demo mode' : undefined
              }
            >
              <EditIcon className='w-4 h-4' />
              <span className='sr-only'>{editButtonLabel}</span>
            </Button>
          ),
          menuLabel: editButtonLabel,
          menuIcon: EditIcon,
          onMenuClick: handleEditToggle,
          disabled: isEditButtonDisabled || readOnly,
        })
      }

      // Start/Stop button - only show in edit mode when locked (view mode)
      const showToggle = mode === 'edit' && isEditLocked && onToggleStatus
      if (showToggle) {
        configs.push({
          id: 'toggle',
          priority: BUTTON_PRIORITIES.TOGGLE,
          fullContent: (
            <Button
              onClick={handleToggle}
              disabled={toggleDisabled || readOnly}
              variant='outline'
              className='flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2'
              aria-pressed={isBotActive}
              aria-label={startButtonLabel}
            >
              {togglePending ? (
                <>
                  <Loader2 className='w-4 h-4 animate-spin' />
                  <span className='truncate'>UPDATING…</span>
                </>
              ) : isBotActive ? (
                <>
                  <Square className='w-4 h-4 shrink-0' />
                  <span className='truncate'>{startButtonLabel}</span>
                </>
              ) : (
                <>
                  <Play className='w-4 h-4 shrink-0' />
                  <span className='truncate'>{startButtonLabel}</span>
                </>
              )}
            </Button>
          ),
          compactContent: (
            <Button
              onClick={handleToggle}
              size='icon'
              disabled={toggleDisabled || readOnly}
              variant='outline'
              className={cn(
                'flex items-center justify-center font-semibold uppercase',
              )}
              aria-pressed={isBotActive}
              aria-label={startButtonLabel}
            >
              {togglePending ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : isBotActive ? (
                <Square className='w-4 h-4' />
              ) : (
                <Play className='w-4 h-4' />
              )}
              <span className='sr-only'>{startButtonLabel}</span>
            </Button>
          ),
          menuLabel: togglePending ? 'Updating...' : startButtonLabel,
          menuIcon: isBotActive ? Square : Play,
          onMenuClick: handleToggle,
          disabled: toggleDisabled || readOnly,
        })
      }

      return configs
    }, [
      mode,
      isEditLocked,
      submitIsPending,
      handleSubmit,
      submitDisabled,
      readOnly,
      shouldDisplayErrorSummary,
      insufficientCredits,
      submitTitle,
      submitLabel,
      showCredits,
      credits,
      fundsInfo,
      currentExchange?.affiliate,
      handleEditToggle,
      isEditButtonDisabled,
      EditIcon,
      editButtonLabel,
      onToggleStatus,
      handleToggle,
      toggleDisabled,
      togglePending,
      isBotActive,
      startButtonLabel,
    ])

    // Convert menuConfig items to OverflowMenuItem format for the overflow menu
    const baseOverflowMenuItems = useMemo((): OverflowMenuItem[] => {
      if (!menuConfig?.items?.length) return []
      return menuConfig.items as OverflowMenuItem[]
    }, [menuConfig])

    // Save-as-template is available on the create form (unless the bot type
    // opts out via hideTemplates). It lives in the overflow menu now.
    const showSaveAsTemplate =
      !hideTemplates && !!onLoadTemplate && mode === 'create'

    // Add terminal-specific menu items (reset) so terminal forms have a 3-dots menu
    const { resetFormData } = useBotFormState()
    const combinedOverflowMenuItems = useMemo((): OverflowMenuItem[] => {
      const items = [...baseOverflowMenuItems]

      if (showSaveAsTemplate) {
        items.push({
          type: 'item',
          id: 'save-as-template',
          label: 'Save as template',
          icon: BookmarkIcon,
          onSelect: () => setSaveTemplateOpen(true),
        })
      }

      if (isTerminal) {
        items.unshift({
          type: 'item',
          id: 'reset-to-defaults',
          label: 'Reset to defaults',
          icon: RotateCcw,
          onSelect: () => {
            setShowResetConfirm(true)
          },
          disabled: mode === 'edit',
        })
      }

      return items
    }, [baseOverflowMenuItems, isTerminal, mode, showSaveAsTemplate])

    const handleGridStartSubmit = useCallback(
      (buyType: BuyTypeEnum, buyCount?: string, buyAmount?: number) => {
        if (!onToggleStatus) {
          return
        }
        onToggleStatus({
          nextStatus: isBotActive ? 'closed' : 'open',
          buyType,
          buyCount,
          buyAmount,
        })
        setStartDialogOpen(false)
      },
      [onToggleStatus, isBotActive],
    )

    const handleGridStopConfirm = useCallback(
      (cancelPartiallyFilled?: boolean, closeType?: CloseGRIDTypeEnum) => {
        setStopGridDialogOpen(false)
        onToggleStatus?.({
          nextStatus: 'closed',
          closeGridType: closeType,
          cancelPartiallyFilled,
        })
      },
      [onToggleStatus],
    )

    // Compact backtest controls grouped in their own box above the
    // primary CTA: period picker (real range), candle timeframe, run
    // button, and a "More" overflow that opens the full settings dialog.
    // While a backtest runs, the whole box becomes an inline progress bar.
    const showBacktest =
      (botType === BotTypesEnum.dca ||
        botType === BotTypesEnum.grid ||
        botType === BotTypesEnum.combo) &&
      (mode === 'create' || !isEditLocked) &&
      !isTerminal

    const [period, setPeriod] = useState<PeriodValue | null>(() => {
      const to = new Date()
      const from = new Date(to.getTime() - 29 * 86_400_000)
      return { from, to }
    })
    const [timeframe, setTimeframe] = useState<ExchangeIntervals>(
      ExchangeIntervals.oneH,
    )

    // One-shot: when the curated-presets widget staged a backtest hint
    // (interval + window matching the worker's stored ROI), apply it to
    // the inline Quick Backtest pills so the next click of BACKTEST
    // reproduces the curated-preset result. Consumed exactly once.
    const consumeBacktestHint = useBotFormPreloadStore(
      (s) => s.consumeBacktestHint,
    )
    useEffect(() => {
      const hint = consumeBacktestHint()
      if (!hint) return
      setTimeframe(hint.interval as ExchangeIntervals)
      setPeriod({ from: new Date(hint.from), to: new Date(hint.to) })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const periodChipLabel = useMemo(() => {
      if (!period) return 'Pick period'
      // Inclusive day count to match the calendar's preset labels.
      const startOfDayMs = (d: Date) =>
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const days = Math.max(
        1,
        Math.round(
          (startOfDayMs(period.to) - startOfDayMs(period.from)) / 86_400_000,
        ) + 1,
      )
      if (days < 30) return `${days}d`
      if (days < 365) return `${Math.round(days / 30)}mo`
      return `${Math.round(days / 365)}y`
    }, [period])

    const buildPeriodConfig = useCallback((): BacktestConfig | null => {
      if (!period) return null
      const fmt = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }
      return {
        mode: 'local',
        timeframe,
        startDate: fmt(period.from),
        endDate: fmt(period.to),
      }
    }, [period, timeframe])

    const handleQuickRun = useCallback(() => {
      const cfg = buildPeriodConfig()
      if (!cfg || !onRunBacktestDirect) {
        handleBacktest(formData)
        return
      }
      void onRunBacktestDirect(cfg)
    }, [buildPeriodConfig, onRunBacktestDirect, handleBacktest, formData])

    // The backtester emits progress as a fraction (0-1) during data
    // loading and sometimes as a percentage (0-100) in later phases.
    // Normalize either way.
    const progressPct = useMemo(() => {
      const p = backtestProgress?.progress ?? 0
      const normalized = p <= 1 ? p * 100 : p
      return Math.max(0, Math.min(100, Math.round(normalized)))
    }, [backtestProgress?.progress])
    // Local backtests don't flip `backtestPending` (that's only the
    // server-side mutation) — they push to `backtestProgress` instead.
    // Treat either signal as "running".
    const isRunning = backtestPending || !!backtestProgress

    const backtestButtonConfigs = useMemo((): ResponsiveButtonConfig[] => {
      const runDisabled =
        readOnly || shouldDisplayErrorSummary || isRunning || !period

      return [
        {
          id: 'period',
          priority: 1,
          fullContent: ({ isCompact }) => (
            <BacktestPeriodChip
              isCompact={isCompact}
              disabled={readOnly || backtestPending}
              label={periodChipLabel}
              value={period}
              onApply={(next) => setPeriod(next)}
              onReset={() => {
                const to = new Date()
                const from = new Date(to.getTime() - 29 * 86_400_000)
                setPeriod({ from, to })
              }}
            />
          ),
          compactContent: (
            <BacktestPeriodChip
              isCompact
              disabled={readOnly || backtestPending}
              label={periodChipLabel}
              value={period}
              onApply={(next) => setPeriod(next)}
              onReset={() => {
                const to = new Date()
                const from = new Date(to.getTime() - 29 * 86_400_000)
                setPeriod({ from, to })
              }}
            />
          ),
        },
        {
          id: 'candle',
          priority: 2,
          fullContent: ({ isCompact }) => (
            <BacktestCandleChip
              isCompact={isCompact}
              disabled={readOnly || backtestPending}
              value={timeframe}
              options={candleOptions}
              onChange={setTimeframe}
            />
          ),
          compactContent: (
            <BacktestCandleChip
              isCompact
              disabled={readOnly || backtestPending}
              value={timeframe}
              options={candleOptions}
              onChange={setTimeframe}
            />
          ),
        },
        {
          id: 'run',
          priority: 4,
          neverOverflow: true,
          fullContent: (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={handleQuickRun}
              disabled={runDisabled}
              aria-label='Run backtest'
              className='h-8 w-full gap-1 text-xs font-semibold uppercase'
            >
              {isRunning ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Play className='h-3.5 w-3.5' />
              )}
              <span className='truncate'>
                {isRunning ? 'Testing…' : 'Backtest'}
              </span>
            </Button>
          ),
          compactContent: (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleQuickRun}
              disabled={runDisabled}
              aria-label='Run backtest'
              className='h-8 w-8'
            >
              {isRunning ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Play className='h-3.5 w-3.5' />
              )}
            </Button>
          ),
        },
        {
          id: 'menu',
          priority: 3,
          alwaysCompact: true,
          neverOverflow: true,
          fullContent: null,
          compactContent: (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={() => handleBacktest(formData)}
              disabled={readOnly || backtestPending}
              aria-label='More backtest settings'
              title='More backtest settings'
              className='h-8 w-8 text-muted-foreground hover:text-foreground'
            >
              <MoreVertical className='h-4 w-4' />
            </Button>
          ),
        },
      ]
    }, [
      period,
      timeframe,
      periodChipLabel,
      readOnly,
      backtestPending,
      shouldDisplayErrorSummary,
      isRunning,
      handleQuickRun,
      handleBacktest,
      formData,
    ])

    return (
      <div className='px-1 pt-1 border-t border-border space-y-2'>
        {showBacktest && (
          <div className='rounded-lg bg-muted p-1.5'>
            {isRunning ? (
              <div className='space-y-1 px-1 py-1'>
                <div className='flex items-center justify-between gap-sm text-xs'>
                  <div className='flex min-w-0 items-center gap-xs'>
                    <Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin text-primary' />
                    <span className='truncate text-muted-foreground'>
                      {backtestProgress?.text ?? 'Running backtest…'}
                    </span>
                  </div>
                  <div className='flex shrink-0 items-center gap-1'>
                    <span className='font-semibold tabular-nums'>
                      {progressPct}%
                    </span>
                    {onCancelBacktest && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={onCancelBacktest}
                        aria-label='Cancel backtest'
                        title='Cancel backtest'
                        className='h-6 w-6 text-muted-foreground hover:text-foreground'
                      >
                        <X className='h-3.5 w-3.5' />
                      </Button>
                    )}
                  </div>
                </div>
                <ProgressBar value={progressPct} size='sm' variant='primary' />
              </div>
            ) : backtestSummary ? (
              <ViewResultsButton
                summary={backtestSummary}
                {...(onViewResults ? { onClick: onViewResults } : {})}
                {...(onDismissResults ? { onDismiss: onDismissResults } : {})}
              />
            ) : (
              <ResponsiveButtonRow
                buttons={backtestButtonConfigs}
                gap={4}
                buffer={8}
                alignment='left'
                highestPriorityFullWidth
                compactThreshold={compactThreshold}
              />
            )}
          </div>
        )}
        <ResponsiveButtonRow
          buttons={buttonConfigs}
          gap={8}
          buffer={16}
          alignment='left'
          highestPriorityFullWidth
          compactThreshold={compactThreshold}
          enableOverflowMenu={
            combinedOverflowMenuItems.length > 0 ||
            buttonConfigs.some(
              (b) => b.menuLabel && b.onMenuClick && !b.neverOverflow,
            )
          }
          overflowMenuItems={combinedOverflowMenuItems}
          overflowMenuTriggerClassName='rounded-lg'
        />
        <GridStartBotDialog
          open={startDialogOpen}
          onOpenChange={setStartDialogOpen}
          onConfirm={handleGridStartSubmit}
          isProcessing={Boolean(togglePending)}
        />
        <GridStopBotDialog
          open={stopGridDialogOpen}
          onOpenChange={setStopGridDialogOpen}
          onConfirm={handleGridStopConfirm}
          isProcessing={Boolean(togglePending)}
        />
        <CloseOptionsDialog
          open={stopDialogOpen}
          onOpenChange={setStopDialogOpen}
          onConfirm={handleStopConfirm}
          isProcessing={Boolean(togglePending)}
        />
        {showSaveAsTemplate && (
          <BotFormSaveTemplateDialog
            open={saveTemplateOpen}
            onOpenChange={setSaveTemplateOpen}
            botType={botType}
            currentFormData={formData}
          />
        )}
        <ConfirmationDialog
          open={showResetConfirm}
          onOpenChange={setShowResetConfirm}
          title='Reset to defaults?'
          description='This resets all settings to their defaults and cannot be undone.'
          confirmText='Reset'
          variant='destructive'
          onConfirm={() => {
            resetFormData()
            toast.success('Settings reset to defaults')
          }}
        />
      </div>
    )
  },
)

export default BotFormFooter
