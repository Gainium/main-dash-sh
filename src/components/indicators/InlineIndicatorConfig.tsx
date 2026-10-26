import React from 'react';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { TimeInput } from '@/components/ui/time-input';
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
  resetInvalidConditionalSelects,
  resolveFieldKey,
  resolveFieldLabel,
  resolveFieldOptions,
  shouldDisableField,
  shouldHideField,
  withGatingParams,
} from '@/utils/indicators/indicatorFieldGating';
import { layoutFieldSpans } from '@/utils/indicators/indicatorFieldLayout';
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
    // Keep conditional-option selects valid after the edit (e.g. the Market
    // Structure value when the trigger type switches from Price to
    // Event/Market).
    onChange(resetInvalidConditionalSelects(definition, params, next, key));
  };

  // Params with every field's default filled in and the definition's derived
  // gates applied, used ONLY for the hiddenWhen/disabledWhen gating so it
  // matches what the inputs actually show.
  const effectiveParams = React.useMemo(
    () => withGatingParams(definition, params),
    [definition, params]
  );

  const renderField = (field: IndicatorFieldDefinition) => {
    // Effective storage key may differ from `field.key` (legacy STOCH band swap).
    const { key: storageKey, defaultValue: effectiveDefault } = resolveFieldKey(
      field,
      params
    );
    const value = params[storageKey] ?? effectiveDefault;
    // Named after another field's selection when `labelFrom` says so (MAR's
    // "EMA Length"); resolved off `effectiveParams` so it reads the same
    // default the driving control displays.
    const label = resolveFieldLabel(definition, field, effectiveParams);

    if (shouldHideField(field, effectiveParams)) {
      return null;
    }

    const disabled = shouldDisableField(field, effectiveParams);

    // Conditional option sets (e.g. Market Structure value list depends on the
    // selected trigger type). First matching directive wins; else fall back.
    // Interval-type fields additionally filter to the exchange's supported
    // intervals when a bot exchange is selected (legacy parity).
    const baseOptions = resolveFieldOptions(definition, field, params);
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
              <Label htmlFor={field.key}>{label}</Label>
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
                <Label htmlFor={field.key}>{label}</Label>
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
        const derive = field.derive;
        return (
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center gap-1">
              <Label htmlFor={field.key}>{label}</Label>
              {field.tooltip ? (
                <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                  <InfoIcon />
                </Tooltip>
              ) : null}
            </div>
            <Select
              value={derive ? derive.get(params) : (value?.toString() ?? '')}
              onValueChange={(newValue) =>
                derive
                  ? onChange({ ...params, ...derive.set(newValue, params) })
                  : updateParam(field.key, newValue)
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={`Select ${label.toLowerCase()}`}
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

      case 'time':
        return (
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center gap-1">
              <Label htmlFor={field.key}>{label}</Label>
              {field.tooltip ? (
                <Tooltip tooltip={field.tooltip} tooltipURL={field.tooltipURL} side="top">
                  <InfoIcon />
                </Tooltip>
              ) : null}
            </div>
            <TimeInput
              id={field.key}
              value={typeof value === 'string' ? value : ''}
              onChange={(next) => updateParam(storageKey, next)}
              disabled={disabled}
              clearable
            />
          </div>
        );

      case 'boolean': {
        const derive = field.derive;
        return (
          <div key={field.key} className="space-y-xs">
            <div className="flex items-center space-x-xs">
              <Switch
                id={field.key}
                checked={
                  derive ? derive.get(params) === 'true' : Boolean(value)
                }
                disabled={disabled}
                onCheckedChange={(checked) =>
                  derive
                    ? onChange(
                        resetInvalidConditionalSelects(
                          definition,
                          params,
                          { ...params, ...derive.set(String(checked), params) },
                          field.key
                        )
                      )
                    : updateParam(field.key, checked)
                }
              />
              <Label htmlFor={field.key}>{label}</Label>
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
      }

      default:
        return null;
    }
  };

  if (!definition.fields || definition.fields.length === 0) {
    return null;
  }

  const isVisible = (field: IndicatorFieldDefinition) =>
    !shouldHideField(field, effectiveParams);
  const ownFields = definition.fields.filter((field) => !field.section);
  const modifierFields = definition.fields.filter(
    (field) => field.section === 'modifiers'
  );

  // Column count keys off the card's own width (container query): two
  // columns from the bot form's side-panel width (~18rem card), one when the
  // card is narrower or on a phone-width viewport. Compact fields pair up;
  // wide ones span the row (`layoutFieldSpans`).
  const renderGrid = (fields: IndicatorFieldDefinition[]) => {
    const visibleFields = fields.filter(isVisible);
    if (visibleFields.length === 0) {
      return null;
    }
    const fieldSpans = layoutFieldSpans(fields, isVisible);
    return (
      <div className="grid gap-md sm:@[18rem]:grid-cols-2">
        {visibleFields.map((field, index) => (
          <div
            key={field.key}
            className={
              fieldSpans[index] === 'full'
                ? 'min-w-0 sm:@[18rem]:col-span-2'
                : 'min-w-0'
            }
          >
            {renderField(field)}
          </div>
        ))}
      </div>
    );
  };

  const modifiersGrid = renderGrid(modifierFields);

  return (
    <div className={className}>
      <div className="@container space-y-md">
        <div className="text-sm font-medium text-muted-foreground">
          {definition.label} Configuration
        </div>
        {renderGrid(ownFields)}
        {modifiersGrid ? (
          <div className="space-y-md pt-xs">
            <div className="text-sm font-medium text-muted-foreground">
              Modifiers
            </div>
            {modifiersGrid}
          </div>
        ) : null}
      </div>
    </div>
  );
};
