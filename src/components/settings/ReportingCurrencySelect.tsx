import { REPORTING_CURRENCY_QUERY_KEY } from '@/components/layout/ReportingCurrencySync';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useFiatCurrencies } from '@/hooks/useFiatCurrencies';
import { useUpdateUserSettings } from '@/hooks/useUserSettings';
import { toast } from '@/lib/toast';
import { useReportingCurrencyStore } from '@/stores/reportingCurrencyStore';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Account-wide reporting currency. Saved on change; the store is updated
 * first so the switch is instant, and rolled back if the save fails.
 */
export function ReportingCurrencySelect({ disabled }: { disabled?: boolean }) {
  const { currencies } = useFiatCurrencies();
  const code = useReportingCurrencyStore((s) => s.code);
  const setCode = useReportingCurrencyStore((s) => s.setCode);
  const updateSettings = useUpdateUserSettings();
  const queryClient = useQueryClient();

  const onChange = (next: string) => {
    const previous = code;
    setCode(next);
    updateSettings.mutate(
      { reportingCurrency: next },
      {
        onSuccess: () => {
          queryClient.setQueryData(REPORTING_CURRENCY_QUERY_KEY, next);
          toast.success(`Reporting currency set to ${next}`);
        },
        onError: (e) => {
          setCode(previous);
          toast.error(
            e instanceof Error ? e.message : 'Could not save reporting currency'
          );
        },
      }
    );
  };

  return (
    <div>
      <Label
        htmlFor="reportingCurrency"
        className="text-muted-foreground uppercase text-xs tracking-wider inline-flex items-center gap-1"
      >
        REPORTING CURRENCY
        <Tooltip tooltip="Every fiat value in the dashboard is shown in this currency, using daily exchange rates. Balances already held in this currency are shown as-is.">
          <InfoIcon />
        </Tooltip>
      </Label>
      <Select
        value={code}
        onValueChange={onChange}
        disabled={disabled || updateSettings.isPending}
      >
        <SelectTrigger id="reportingCurrency" className="mt-1 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Keep the saved code selectable even before its rate loads. */}
          {!currencies.some((c) => c.code === code) && (
            <SelectItem value={code}>{code}</SelectItem>
          )}
          {currencies.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default ReportingCurrencySelect;
