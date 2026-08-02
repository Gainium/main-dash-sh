import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import type { VarBindingPath } from '@/hooks/bots/global-variables/useBotVarBinding';
import type {
  VarToSearchType,
  IndicatorAction,
  IndicatorSection,
  ExchangeEnum,
} from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InfoIcon, Tooltip, parseHelpUrl } from '@/components/ui/tooltip';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import {
  filterIntervalOptionsByExchange,
  getIndicatorDefaultParams,
  validateIndicatorParams,
} from '@/types/indicators/indicatorLogic';
import type {
  IndicatorDefinition,
  IndicatorFieldDefinition,
  IndicatorFieldOption,
} from '@/types/indicators/indicatorTypes';
import type {
  IndicatorParamPrimitive,
  IndicatorParamsState,
} from '@/types/indicators/indicatorParams';
import { sanitizeIndicatorParams } from '@/utils/indicators/indicatorConfigUtils';
import {
  resolveFieldKey,
  resolveFieldLabel,
  shouldDisableField,
  shouldHideField,
} from '@/utils/indicators/indicatorFieldGating';

interface IndicatorConfigurationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: IndicatorDefinition | null;
  initialParams?: IndicatorParamsState;
  onSubmit: (params: IndicatorParamsState) => void;
  title?: string;
  submitLabel?: string;
  action: IndicatorAction;
  section?: IndicatorSection;
  // Selected bot exchange. When provided, interval-type fields filter their
  // options to the candle intervals the exchange supports (legacy parity).
  exchange?: ExchangeEnum | undefined;
}

const normalizeParams = (
  params: IndicatorParamsState,
  definition: IndicatorDefinition
): IndicatorParamsState => {
  const normalized: Partial<Record<string, IndicatorParamPrimitive>> = {};
  const fields: IndicatorFieldDefinition[] = [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ];

  for (const field of fields) {
    const rawValue = params[field.key];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    if (
      field.type === 'number' &&
      typeof rawValue === 'string' &&
      rawValue.trim().length
    ) {
      const parsed = Number(rawValue);
      normalized[field.key] = Number.isFinite(parsed) ? parsed : rawValue;
      continue;
    }

    normalized[field.key] = rawValue;
  }

  return normalized as IndicatorParamsState;
};

const getFieldLabel = (
  definition: IndicatorDefinition,
  key: string
): string | undefined => {
  const fields: IndicatorFieldDefinition[] = [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ];
  return fields.find((field) => field.key === key)?.label;
};

export const IndicatorConfigurationModal: React.FC<
  IndicatorConfigurationModalProps
> = ({
  open,
  onOpenChange,
  definition,
  initialParams,
  onSubmit,
  title,
  submitLabel,
  action,
  section,
  exchange,
}) => {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [paramsState, setParamsState] =
    React.useState<IndicatorParamsState | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const documentationUrl = definition?.documentationUrl;
  const [docHelpSlug, setDocHelpSlug] = React.useState<string | null>(null);
  const docParsed = parseHelpUrl(documentationUrl);

  React.useEffect(() => {
    if (!definition || !open) {
      return;
    }
    const defaults = getIndicatorDefaultParams(
      definition.type,
      action,
      section
    );
    // Drop nullish entries before they land on top of the defaults. A bot
    // loaded from the API sends an explicit `null` for every field the GraphQL
    // selection asks for that its document never stored, and a plain spread
    // lets that `null` overwrite a perfectly good default — so reopening a
    // saved indicator re-blanks exactly the fields the defaults are here to
    // fill, and `hiddenWhen` can no longer match (MAR's "Comparison MA length"
    // stayed on screen while Reference read its default "Current price").
    // `sanitizeIndicatorParams` is the existing helper for "keep only params
    // that carry a real value" — the same one the save path uses.
    setParamsState({
      ...defaults,
      ...(initialParams ? sanitizeIndicatorParams(initialParams) : {}),
    });
    setErrors([]);
  }, [definition, initialParams, open, action, section]);

  const updateParam = React.useCallback(
    (key: string, value: IndicatorParamPrimitive) => {
      setParamsState((prev) => {
        if (!prev) {
          return null;
        }
        const next: IndicatorParamsState = { ...prev, [key]: value };
        // Reset dependent conditional-option selects to a valid default when
        // their driving field changes (e.g. Market Structure value when the
        // trigger type switches), so they never show an empty/stale selection.
        const allFields = definition
          ? [...definition.fields, ...(definition.advancedFields ?? [])]
          : [];
        for (const f of allFields) {
          if (!f.optionsWhen?.some((e) => e.field === key)) continue;
          const opts =
            f.optionsWhen.find((e) => next[e.field] === e.equals)?.options ??
            f.options;
          const valid = opts?.map((o) => o.value);
          if (
            valid &&
            !valid.includes(next[f.key] as IndicatorFieldOption['value'])
          ) {
            (next as Record<string, IndicatorParamPrimitive>)[f.key as string] =
              f.defaultValue !== undefined &&
              valid.includes(f.defaultValue as IndicatorFieldOption['value'])
                ? (f.defaultValue as IndicatorParamPrimitive)
                : (opts?.[0]?.value as IndicatorParamPrimitive);
          }
        }
        return next;
      });
    },
    [definition]
  );

  const renderField = (field: IndicatorFieldDefinition) => {
    if (!definition) {
      return null;
    }

    if (shouldHideField(field, paramsState)) {
      return null;
    }

    const disabled = shouldDisableField(field, paramsState);
    if (!paramsState) {
      return null;
    }
    // Effective storage key may differ from `field.key` (legacy STOCH band swap).
    const { key: storageKey, defaultValue: effectiveDefault } = resolveFieldKey(
      field,
      paramsState
    );
    const value = paramsState[storageKey];
    // Conditional option sets (e.g. Market Structure value list depends on the
    // selected trigger type). First matching directive wins; else fall back.
    // Interval-type fields additionally filter to the exchange's supported
    // intervals when a bot exchange is selected (legacy parity).
    const baseOptions =
      field.optionsWhen?.find(
        (entry) => paramsState[entry.field] === entry.equals
      )?.options ?? field.options;
    const resolvedOptions =
      field.type === 'interval'
        ? filterIntervalOptionsByExchange(baseOptions, exchange)
        : baseOptions;
    const commonLabel = (
      <div className="flex items-start justify-between gap-sm">
        <div className="flex items-center gap-1">
          <Label htmlFor={field.key} className="text-sm font-medium">
            {resolveFieldLabel(definition, field, paramsState)}
          </Label>
          {field.tooltip ? (
            <Tooltip
              tooltip={field.tooltip}
              tooltipURL={field.tooltipURL}
              side="top"
            >
              <InfoIcon />
            </Tooltip>
          ) : null}
        </div>
        {field.description ? (
          <span className="text-xs text-muted-foreground ml-auto max-w-[60%] text-right leading-relaxed">
            {field.description}
          </span>
        ) : null}
      </div>
    );

    switch (field.type) {
      case 'select':
      case 'interval': {
        if (field.multiple) {
          const raw = Array.isArray(value)
            ? value
            : Array.isArray(field.defaultValue)
              ? field.defaultValue
              : [];
          const selectedValues = raw.map(Number);
          return (
            <div key={field.key} className="space-y-1.5">
              {commonLabel}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {resolvedOptions?.map((option) => {
                  const numVal = Number(option.value);
                  const checked = selectedValues.includes(numVal);
                  return (
                    <div
                      key={String(option.value)}
                      className="flex items-center gap-1.5"
                    >
                      <Checkbox
                        id={`${field.key}-${option.value}`}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(c) => {
                          const next = c
                            ? [...selectedValues, numVal].sort((a, b) => a - b)
                            : selectedValues.filter((v) => v !== numVal);
                          updateParam(field.key, next);
                        }}
                      />
                      <Label
                        htmlFor={`${field.key}-${option.value}`}
                        className="text-sm"
                      >
                        {option.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        return (
          <div key={field.key} className="space-y-1.5">
            {commonLabel}
            <Select
              value={
                (value as string) ??
                (field.defaultValue as string | undefined) ??
                ''
              }
              onValueChange={(next) => updateParam(field.key, next)}
              disabled={disabled}
            >
              <SelectTrigger id={field.key} className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {resolvedOptions?.map((option) => (
                  <SelectItem
                    key={String(option.value)}
                    value={String(option.value)}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      }
      case 'boolean': {
        return (
          <div
            key={field.key}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
          >
            <div>
              <div className="flex items-center gap-1">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {resolveFieldLabel(definition, field, paramsState)}
                </Label>
                {field.tooltip ? (
                  <Tooltip
                    tooltip={field.tooltip}
                    tooltipURL={field.tooltipURL}
                    side="top"
                  >
                    <InfoIcon />
                  </Tooltip>
                ) : null}
              </div>
              {field.description ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {field.description}
                </p>
              ) : null}
            </div>
            <Switch
              id={field.key}
              checked={Boolean(value ?? field.defaultValue)}
              disabled={disabled}
              onCheckedChange={(checked) => updateParam(field.key, checked)}
            />
          </div>
        );
      }
      case 'string':
      case 'number':
      default: {
        const stringValue =
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : effectiveDefault !== undefined
              ? String(effectiveDefault)
              : '';
        const inputElement = (
          <Input
            id={field.key}
            type={
              field.type === 'number' && !field.allowVariables
                ? 'number'
                : 'text'
            }
            value={stringValue}
            onChange={(event) => updateParam(storageKey, event.target.value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            disabled={disabled}
          />
        );
        // The modal stores params locally and only commits on submit, but
        // variable bindings are stored on the parent bot form (BotVars) and
        // persist independently of the literal value. We can only bind if
        // the indicator already has a uuid (i.e. edit flow) — newly added
        // indicators get their uuid post-save, after which the inline
        // config can bind.
        const indicatorUuid = (paramsState as { uuid?: string } | null)?.uuid;
        const canBind = Boolean(
          field.type === 'number' && field.allowVariables && indicatorUuid
        );
        const varType: VarToSearchType =
          typeof field.step === 'number' && field.step < 1 ? 'float' : 'int';
        return (
          <div key={field.key} className="space-y-1.5">
            {commonLabel}
            {canBind ? (
              <FieldVariableBinding
                path={
                  `indicators.${indicatorUuid}.${storageKey}` as VarBindingPath
                }
                varType={varType}
                variant="inline"
              >
                {inputElement}
              </FieldVariableBinding>
            ) : (
              inputElement
            )}
          </div>
        );
      }
    }
  };

  const handleSubmit = () => {
    if (!definition) {
      return;
    }
    if (!paramsState) {
      return;
    }
    const normalized = normalizeParams(paramsState, definition);
    const validationErrors = validateIndicatorParams(
      definition.type,
      normalized
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSubmit(normalized);
    onOpenChange(false);
  };

  const handleDialogChange = (openState: boolean) => {
    if (!openState) {
      setErrors([]);
    }
    onOpenChange(openState);
  };

  const dialogTitle =
    title ??
    (definition ? `${definition.label} configuration` : 'Configure indicator');
  const submitText = submitLabel ?? 'Save indicator';

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl overflow-hidden rounded-xl border bg-card p-0 shadow-xl">
          <DialogHeader className="space-y-xs border-b border-border/60 bg-muted/40 px-6 pt-6 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <DialogTitle className="text-lg font-semibold leading-6">
                {dialogTitle}
              </DialogTitle>
              {docParsed.helpSlug ? (
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => setDocHelpSlug(docParsed.helpSlug)}
                >
                  Learn more
                </button>
              ) : null}
            </div>
            <DialogDescription className="text-sm text-muted-foreground">
              {definition?.description ??
                'Select an indicator to configure its settings.'}
            </DialogDescription>
          </DialogHeader>

          {definition ? (
            <form
              ref={formRef}
              className="flex flex-col gap-lg px-6 py-6"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
            >
              {errors.length > 0 ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-md text-sm text-destructive shadow-sm">
                  <p className="mb-2 font-medium">
                    Please review the highlighted fields:
                  </p>
                  <ul className="ml-4 list-disc space-y-1 text-destructive">
                    {errors.map((key) => (
                      <li key={key}>{getFieldLabel(definition, key) ?? key}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ScrollArea className="max-h-104 pr-1">
                <div className="space-y-5 pr-1">
                  {[
                    ...definition.fields,
                    ...(definition.advancedFields ?? []),
                  ].map((field) => renderField(field))}
                </div>
              </ScrollArea>

              <DialogFooter className="gap-sm border-t border-border/60 px-6 pt-4 pb-6">
                <div className="flex w-full flex-col-reverse gap-sm sm:flex-row sm:justify-end sm:gap-xs">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    className="sm:min-w-[120px]"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="sm:min-w-[140px]">
                    {submitText}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              Pick an indicator to begin configuring parameters.
            </div>
          )}
        </DialogContent>
      </Dialog>
      <HelpArticleModal
        slug={docHelpSlug}
        onClose={() => setDocHelpSlug(null)}
      />
    </>
  );
};

IndicatorConfigurationModal.displayName = 'IndicatorConfigurationModal';
