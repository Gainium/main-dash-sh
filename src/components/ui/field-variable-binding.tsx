import {
  useOptionalBotFormBinding,
  useOptionalBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import useBotVarBinding, {
  type VarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import { useVariableDetails } from '@/hooks/bots/global-variables/useVariableDetails';
import { cn } from '@/lib/utils';
import type { VarToSearchType } from '@/types';
import type { GlobalVariable } from '@/types/globalVariables';
import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { VariableChip } from '@/components/global-variables/VariableChip';
import { VariableSearch } from '@/components/global-variables/GlobalVariableSearch';
import { GlobalVariableButton } from './global-variable-button';

type FieldVariableBindingVariant = 'inline' | 'adjacent';

interface FieldVariableBindingProps {
  children?: ReactNode;
  path: VarBindingPath;
  varType: VarToSearchType;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
  contentClassName?: string;
  buttonClassName?: string;
  variant?: FieldVariableBindingVariant;
  inlinePaddingClassName?: string;
  inlineAdornment?: ReactNode;
  inlineAdornmentClassName?: string;
  onVariableSelected?: (variable: GlobalVariable) => void;
  onVariableResolved?: (variable: GlobalVariable | null) => void;
  hideBindingButton?: boolean;
}

export const FieldVariableBinding: React.FC<FieldVariableBindingProps> = ({
  children,
  path,
  varType,
  disabled,
  tooltip,
  className,
  contentClassName,
  buttonClassName,
  variant = 'adjacent',
  inlinePaddingClassName = 'pr-12',
  inlineAdornment,
  inlineAdornmentClassName,
  onVariableSelected,
  onVariableResolved,
  hideBindingButton = false,
}) => {
  // Narrow reads only: mode from the stable context, `terminal` as a single
  // top-level field. A keystroke elsewhere in the form leaves both unchanged.
  const formMode = useOptionalBotFormBinding()?.mode;
  const terminalFlag = useOptionalBotFormTopLevelSelector('terminal');
  const isDealEdit =
    formMode === 'deal-edit' || formMode === 'deal-mass-edit';
  const isSettingsReadonly = formMode === 'settings-readonly';
  const isTerminalForm = Boolean(terminalFlag);
  const shouldHideBindingButton = useMemo(
    () =>
      isSettingsReadonly || isDealEdit || hideBindingButton || isTerminalForm,
    [isSettingsReadonly, isDealEdit, hideBindingButton, isTerminalForm]
  );

  const { isBound, variableId, bindVariable, unbindVariable } =
    useBotVarBinding(path);
  const { variable } = useVariableDetails(variableId);
  const [chipPopoverOpen, setChipPopoverOpen] = useState(false);

  // Mirror VariableBindingControl's resolved-variable callback so consumers
  // that wire onVariableResolved (e.g. to push the resolved value into
  // formData) still fire when the input is hidden behind a chip.
  const lastResolvedSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onVariableResolved) {
      return;
    }
    const signature = variable
      ? `${variable.id}::${variable.value ?? ''}::${variable.updatedAt ?? ''}`
      : 'null';
    if (lastResolvedSignatureRef.current === signature) {
      return;
    }
    lastResolvedSignatureRef.current = signature;
    onVariableResolved(variable ?? null);
  }, [variable, onVariableResolved]);

  const handleChipSelect = (next: GlobalVariable) => {
    bindVariable(next.id);
    onVariableSelected?.(next);
    setChipPopoverOpen(false);
  };

  const handleChipClear = () => {
    unbindVariable();
    setChipPopoverOpen(false);
  };

  const buttonProps = useMemo(
    () => ({
      ...(disabled !== undefined ? { disabled } : {}),
      ...(tooltip ? { tooltip } : {}),
      ...(onVariableSelected ? { onVariableSelected } : {}),
      ...(onVariableResolved ? { onVariableResolved } : {}),
    }),
    [disabled, tooltip, onVariableSelected, onVariableResolved]
  );

  const isInlineVariant = useMemo(() => variant === 'inline', [variant]);

  const inlineAppearanceProps = useMemo(
    () =>
      isInlineVariant
        ? ({ appearance: 'inline', size: 'sm' } as const)
        : undefined,
    [isInlineVariant]
  );

  const inlineButtonClasses = useMemo(
    () =>
      cn(
        'pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        buttonClassName
      ),
    [buttonClassName]
  );

  const inlineButtonClassName = useMemo(
    () => (isInlineVariant ? inlineButtonClasses : buttonClassName),
    [isInlineVariant, inlineButtonClasses, buttonClassName]
  );

  const baseButton = useMemo(
    () => (
      <GlobalVariableButton
        path={path}
        varType={varType}
        {...(inlineAppearanceProps ?? {})}
        {...buttonProps}
        {...(inlineButtonClassName ? { className: inlineButtonClassName } : {})}
      />
    ),
    [path, varType, buttonProps, inlineAppearanceProps, inlineButtonClassName]
  );
  const bindingButton = useMemo(
    () => (shouldHideBindingButton ? null : baseButton),
    [shouldHideBindingButton, baseButton]
  );

  // Bound state: the input is removed entirely and replaced by a chip
  // showing the variable name + value. This prevents the user from typing a
  // stale literal next to a live binding (which would silently be
  // overridden by the backend on submit). The pencil opens the search to
  // swap variables; the X unbinds and the input returns.
  //
  // In readonly/deal-edit modes (shouldHideBindingButton=true) we still
  // render the chip so the drawer makes it obvious the value comes from a
  // global variable — just without the edit/remove handlers, which turns
  // the chip into a static display.
  //
  // IMPORTANT: this branch must come AFTER every hook call above — React's
  // rules of hooks require call order to be stable across renders, so we
  // can't short-circuit before useMemo / useEffect runs.
  if (isBound && variable) {
    if (shouldHideBindingButton) {
      return (
        <div className={cn('w-full', className)}>
          <VariableChip variable={variable} disabled />
        </div>
      );
    }
    return (
      <div className={cn('w-full', className)}>
        <Popover open={chipPopoverOpen} onOpenChange={setChipPopoverOpen}>
          <PopoverTrigger asChild>
            <div>
              <VariableChip
                variable={variable}
                disabled={Boolean(disabled)}
                onEdit={() => setChipPopoverOpen(true)}
                {...(!disabled ? { onRemove: handleChipClear } : {})}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0">
            <VariableSearch
              varType={varType}
              selectedId={variableId}
              onSelect={handleChipSelect}
              {...(!disabled ? { onClear: handleChipClear } : {})}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  if (
    isInlineVariant &&
    isValidElement(children) &&
    typeof children.type !== 'string'
  ) {
    type AdornmentCapableProps = { endAdornment?: ReactNode };
    const existingAdornment = (children.props as AdornmentCapableProps)
      .endAdornment;

    // Build combined endAdornment by filtering out null/undefined values
    const rawAdornments = [
      existingAdornment,
      inlineAdornment,
      bindingButton,
    ].filter(Boolean);

    // Ensure each adornment has a unique key when multiple nodes are passed
    const adornments = rawAdornments.map((child, i) => {
      if (isValidElement(child)) {
        return cloneElement(child as ReactElement, {
          key: `fvb-adornment-${i}`,
        });
      }
      return <span key={`fvb-adornment-${i}`}>{child}</span>;
    });

    // Return adornments directly - React will render adjacent elements without extra spacing
    const combinedEndAdornment =
      adornments.length === 0
        ? undefined
        : adornments.length === 1
          ? adornments[0]
          : adornments;

    const injectedChild = cloneElement(
      children as ReactElement<AdornmentCapableProps>,
      {
        endAdornment: combinedEndAdornment,
      }
    );

    return (
      <div className={cn('w-full', className)}>
        <div className={cn('w-full', contentClassName)}>{injectedChild}</div>
      </div>
    );
  }

  const containerClasses = cn(
    isInlineVariant
      ? 'relative flex w-full items-center'
      : 'flex items-center gap-2',
    className
  );

  const contentWrapperClasses = cn(
    'flex-1 min-w-0',
    contentClassName,
    isInlineVariant && !shouldHideBindingButton
      ? inlinePaddingClassName
      : undefined
  );

  const buttonWrapperClasses = isInlineVariant
    ? 'absolute inset-y-0 right-2 flex items-center justify-center'
    : 'shrink-0';

  return (
    <div className={containerClasses}>
      <div className={contentWrapperClasses}>{children}</div>
      <div className={buttonWrapperClasses}>
        {isInlineVariant ? (
          <>
            {inlineAdornment}
            {bindingButton}
          </>
        ) : inlineAdornment ? (
          <div
            className={cn('flex items-center gap-2', inlineAdornmentClassName)}
          >
            {bindingButton && (
              <span className="flex items-center">{bindingButton}</span>
            )}
            <span className="flex items-center">{inlineAdornment}</span>
          </div>
        ) : (
          bindingButton
        )}
      </div>
    </div>
  );
};

export default FieldVariableBinding;
