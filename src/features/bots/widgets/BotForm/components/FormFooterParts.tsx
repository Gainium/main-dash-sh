/**
 * Presentational pieces of the bot form's save footer, free of any bot-form
 * context so other forms can render the very same footer: the frame (top
 * hairline + the muted secondary row), the primary submit button, the
 * start/stop toggle and the secondary row's run button.
 */
import { Loader2, Plus, Save, type LucideIcon } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The footer frame; `secondary` renders in the muted row above `children`. */
export const FormFooterFrame: React.FC<{
  secondary?: React.ReactNode
  children: React.ReactNode
  className?: string
}> = ({ secondary, children, className }) => (
  <div className={cn('px-1 pt-1 border-t border-border space-y-2', className)}>
    {secondary ? (
      <div className='rounded-lg bg-muted p-1.5'>{secondary}</div>
    ) : null}
    {children}
  </div>
)

const SUBMIT_CLASS =
  'gradient-brand hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl duration-200 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase'

type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onClick' | 'disabled' | 'title'
> & { [dataAttr: `data-${string}`]: string | undefined }

export interface FormSubmitButtonProps extends NativeButtonProps {
  /** `create` shows a plus and glows; `edit` shows a save icon. */
  mode: 'create' | 'edit'
  label: string
  onClick: () => void
  pending?: boolean
  disabled?: boolean
  title?: string | undefined
  /** Icon-only variant used when the row is compact. */
  compact?: boolean
  /** Demo mode: the label reads "<label> (DEMO)". */
  demo?: boolean
}

/** The bot form's primary action (CREATE BOT / SAVE SETTINGS). */
export const FormSubmitButton: React.FC<FormSubmitButtonProps> = ({
  mode,
  label,
  onClick,
  pending = false,
  disabled = false,
  title,
  compact = false,
  demo = false,
  className,
  ...rest
}) => {
  const Icon = mode === 'create' ? Plus : Save
  const classes = cn(SUBMIT_CLASS, mode === 'create' && 'fx-glow', className)
  if (compact) {
    return (
      <Button
        type='button'
        aria-busy={pending}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        size='icon'
        className={classes}
        title={title}
        {...rest}
      >
        {pending ? (
          <Loader2 className='w-4 h-4 animate-spin' />
        ) : (
          <Icon className='w-4 h-4' />
        )}
        <span className='sr-only'>{label}</span>
      </Button>
    )
  }
  return (
    <Button
      type='button'
      aria-busy={pending}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      fullwidth
      className={classes}
      title={title}
      {...rest}
    >
      {pending ? (
        <>
          <Loader2 className='w-4 h-4 mr-2 animate-spin' />
          <span className='truncate'>{label}</span>
        </>
      ) : demo ? (
        `${label} (DEMO)`
      ) : (
        <div className='flex items-center justify-center w-full gap-xs'>
          <Icon className='w-4 h-4 shrink-0' />
          <span className='truncate'>{label}</span>
        </div>
      )}
    </Button>
  )
}

export interface FormToggleButtonProps {
  /** Icon shown while not pending (e.g. Square to stop, Play to start). */
  icon: LucideIcon
  label: string
  onClick: () => void
  active: boolean
  pending?: boolean
  pendingLabel?: string
  disabled?: boolean
  compact?: boolean
}

/** The bot form's start/stop button. */
export const FormToggleButton: React.FC<FormToggleButtonProps> = ({
  icon: Icon,
  label,
  onClick,
  active,
  pending = false,
  pendingLabel = 'UPDATING…',
  disabled = false,
  compact = false,
}) => {
  if (compact) {
    return (
      <Button
        onClick={onClick}
        size='icon'
        disabled={disabled}
        variant='outline'
        className='flex items-center justify-center font-semibold uppercase'
        aria-pressed={active}
        aria-label={label}
      >
        {pending ? (
          <Loader2 className='w-4 h-4 animate-spin' />
        ) : (
          <Icon className='w-4 h-4' />
        )}
        <span className='sr-only'>{label}</span>
      </Button>
    )
  }
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant='outline'
      className='flex items-center justify-center gap-xs font-semibold uppercase px-4 py-2'
      aria-pressed={active}
      aria-label={label}
    >
      {pending ? (
        <>
          <Loader2 className='w-4 h-4 animate-spin' />
          <span className='truncate'>{pendingLabel}</span>
        </>
      ) : (
        <>
          <Icon className='w-4 h-4 shrink-0' />
          <span className='truncate'>{label}</span>
        </>
      )}
    </Button>
  )
}

export interface FormRunButtonProps {
  icon: LucideIcon
  label: string
  /** Accessible name; defaults to `label`. */
  ariaLabel?: string
  onClick: () => void
  running?: boolean
  runningLabel?: string
  disabled?: boolean
  compact?: boolean
}

/** The secondary row's run button (BACKTEST). */
export const FormRunButton: React.FC<FormRunButtonProps> = ({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  running = false,
  runningLabel,
  disabled = false,
  compact = false,
}) => {
  const glyph = running ? (
    <Loader2 className='h-3.5 w-3.5 animate-spin' />
  ) : (
    <Icon className='h-3.5 w-3.5' />
  )
  if (compact) {
    return (
      <Button
        type='button'
        variant='ghost'
        size='icon'
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        className='h-8 w-8'
      >
        {glyph}
      </Button>
    )
  }
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className='h-8 w-full gap-1 text-xs font-semibold uppercase'
    >
      {glyph}
      <span className='truncate'>
        {running && runningLabel ? runningLabel : label}
      </span>
    </Button>
  )
}
