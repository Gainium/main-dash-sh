import React from 'react';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import type { VarBindingPath } from '@/hooks/bots/global-variables/useBotVarBinding';
import type {
  IndicatorDefinition,
  IndicatorFieldDefinition,
  IndicatorFieldOption,
} from '@/types/indicators/indicatorTypes';
import type {
  IndicatorParamPrimitive,
  IndicatorParamsState,
} from '@/types/indicators/indicatorParams';
import { filterIntervalOptionsByExchange } from '@/types/indicators/indicatorLogic';
import {
  resolveFieldKey,
  shouldDisableField,
  shouldHideField,
  withFieldDefaults,
} from '@/utils/indicators/indicatorFieldGating';
import {
  timeIntervalMap,
  type ExchangeEnum,
  type ExchangeIntervals,
  type VarToSearchType,
} from '@/types';

interface InlineIndicatorConfigProps {
  definition: IndicatorDefinition;
  params: IndicatorParamsState;
  onChange: (params: IndicatorParamsState) => void;
  className?: string;
  // When provided, numeric fields marked `allowVariables` can be bound to
  // a global variable via `indicators.{indicatorUuid}.{fieldKey}`. Without
  // a uuid (e.g. configuring a freshly-added indicator that hasn't been
  // assigned an id yet) the binding UI is suppressed.
  indicatorUuid?: string;
  // Selected bot exchange. When provided, interval-type fields filter their
  // options to the candle intervals the exchange supports (legacy parity:
  // `filterIndicatorIntervalsByExchange`). Omitted/undefined = no filtering.
  exchange?: ExchangeEnum | undefined;
  // Minimum candle interval (in milliseconds) an interval-type field is
  // allowed to offer. Used by the dynamic ATR/ADR scaling mode, where legacy
  // restricts the indicator interval to >= 1h
  // (indicators.tsx:1415 `timeIntervalMap[int] >= 60 * 60 * 1000`). Omitted =
  // no lower bound. Applied on top of the per-exchange filter.
  minIntervalMs?: number | undefined;
}

// Global variables are typed `int` | `float` | `text`. We infer numeric
// fields' variable type from the step: a sub-1 step means decimals are
// expected (float), otherwise integers. Matches the convention used in
// the legacy frontend where `varType` was hand-picked per field.
const inferNumericVarType = (
  field: IndicatorFieldDefinition
): VarToSearchType => {
  if (typeof field.step === 'number' && field.step < 1) {
    return 'float';
  }
  return 'int';
};


export const InlineIndicatorConfig: React.FC<InlineIndicatorConfigProps> = ({
  definition,
  params,
  onChange,
  className,
  indicatorUuid,
  exchange,
  minIntervalMs,
}) => {
  const updateParam = (key: string, value: IndicatorParamPrimitive) => {
    const next: IndicatorParamsState = { ...params, [key]: value };
    // When a field that drives another field's conditional options changes,
    // reset the dependent select to a valid default (its defaultValue if still
    // valid, otherwise the first available option) so it never shows an empty
    // or stale selection — e.g. the Market Structure value when the trigger
    // type switches from Price to Event/Market.
    const allFields = [
      ...definition.fields,
      ...(definition.advancedFields ?? []),
    ];
    for (const f of allFields) {
      if (!f.optionsWhen?.some((e) => e.field === key)) continue;
      const opts =
        f.optionsWhen.find((e) => next[e.field] === e.equals)?.options ??
        f.options;
      const valid = opts?.map((o) => o.value);
      if (valid && !valid.includes(next[f.key] as IndicatorFieldOption['value'])) {
        (next as Record<string, IndicatorParamPrimitive>)[f.key as string] =
          f.defaultValue !== undefined &&
          valid.includes(f.defaultValue as IndicatorFieldOption['value'])
            ? (f.defaultValue as IndicatorParamPrimitive)
            : (opts?.[0]?.value as IndicatorParamPrimitive);
      }
    }
    onChange(next);
  };

  // Params with every field's default filled in, used ONLY for the
  // hiddenWhen/disabledWhen gating so it matches what the inputs actually show.
  const effectiveParams = React.useMemo(
    () => withFieldDefaults(definition, params),
    [definition, params]
  );

  const renderField = (field: IndicatorFieldDefinition) => {
    // Effective storage key may differ from `field.key` (legacy STOCH band swap).
    const { key: storageKey, defaultValue: effectiveDefault } = resolveFieldKey(
      field,
      params
    );
    const value = params[storageKey] ?? effectiveDefault;

    if (shouldHideField(field, effectiveParams)) {
      return null;
    }

    const disabled = shouldDisableField(field, effectiveParams);

    // Conditional option sets (e.g. Market Structure value list depends on the
    // selected trigger type). First matching directive wins; else fall back.
    // Interval-type fields additionally filter to the exchange's supported
    // intervals when a bot exchange is selected (legacy parity).
    const baseOptions =
      field.optionsWhen?.find((entry) => params[entry.field] === entry.equals)
        ?.options ?? field.options;
    const resolvedOptions =
      field.type === 'interval'
        ? (() => {
            const byExchange = filterIntervalOptionsByExchange(
              baseOptions,
              exchange
            );
            if (minIntervalMs === undefined) {
              return byExchange;
            }
            return byExchange?.filter(
              (option) =>
                (timeIntervalMap[option.value as ExchangeIntervals] ?? 0) >=
                minIntervalMs
            );
          })()
        : baseOptions;

    switch (field.type) {
      case 'number': {
        const numberInput = (
          <NumberInput
            id={field.key}
            value={
              typeof value === 'string' ? value : (value?.toString() ?? '')
            }
            onChange={(newValue) =>
              updateParam(
                storageKey,
                typeof newValue === 'string' ? newValue : newValue.toString()
              )
            }
            {...(field.min !== undefined && { min: field.min })}
            {...(field.max !== undefined && { max: field.max })}
            {...(field.step !== undefined && { step: field.step })}
            {...(field.suffix !== undefined && { endAdornment: field.suffix })}
            disabled={disabled}
          />
        );
        const canBind = Boolean(field.allowVariables && indicatorUuid);
        const bindingPath = canBind
          ? (`indicators.${indicatorUuid}.${storageKey}` as VarBindingPath)
          : null;
        return (
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center gap-1">
              <Label htmlFor={field.key}>{field.label}</Label>
              {field.tooltip ? (
                <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                  <InfoIcon />
                </Tooltip>
              ) : null}
            </div>
            {bindingPath ? (
              <FieldVariableBinding
                path={bindingPath}
                varType={inferNumericVarType(field)}
                variant="inline"
              >
                {numberInput}
              </FieldVariableBinding>
            ) : (
              numberInput
            )}
            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
          </div>
        );
      }

      case 'interval':
      case 'select': {
        if (field.multiple) {
          const raw = Array.isArray(value)
            ? value
            : Array.isArray(field.defaultValue)
              ? field.defaultValue
              : [];
          const selectedValues = raw.map(Number);
          return (
            <div key={field.key} className="space-y-xs">
              <div className="flex items-center gap-1">
                <Label htmlFor={field.key}>{field.label}</Label>
                {field.tooltip ? (
                  <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                    <InfoIcon />
                  </Tooltip>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {resolvedOptions?.map((option: IndicatorFieldOption) => {
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
                            ? [...selectedValues, numVal].sort(
                                (a, b) => a - b
                              )
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
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center gap-1">
              <Label htmlFor={field.key}>{field.label}</Label>
              {field.tooltip ? (
                <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                  <InfoIcon />
                </Tooltip>
              ) : null}
            </div>
            <Select
              value={value?.toString() ?? ''}
              onValueChange={(newValue) => updateParam(field.key, newValue)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={`Select ${field.label.toLowerCase()}`}
                />
              </SelectTrigger>
              <SelectContent>
                {resolvedOptions?.map((option: IndicatorFieldOption) => (
                  <SelectItem
                    key={option.value.toString()}
                    value={option.value.toString()}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
          </div>
        );
      }

      case 'boolean':
        return (
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center space-x-xs">
              <Switch
                id={field.key}
                checked={Boolean(value)}
                disabled={disabled}
                onCheckedChange={(checked) => updateParam(field.key, checked)}
              />
              <Label htmlFor={field.key}>{field.label}</Label>
              {field.tooltip ? (
                <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                  <InfoIcon />
                </Tooltip>
              ) : null}
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (!definition.fields || definition.fields.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="@container space-y-md">
        <div className="text-sm font-medium text-muted-foreground">
          {definition.label} Configuration
        </div>
        {definition.fields.length > 0 ? (
          // Column count keys off the card's own width (container query), not
          // the viewport — when the form panel is narrowed the fields wrap to
          // fewer columns instead of compressing into overlapping labels.
          <div className="grid gap-md @[26rem]:grid-cols-2 @[40rem]:grid-cols-3">
            {definition.fields.map((field) => renderField(field))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
