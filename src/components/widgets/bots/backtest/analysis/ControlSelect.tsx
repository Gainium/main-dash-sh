import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Header control of the Analysis cards: full width in the phone grid, natural width from `sm`. */
export function ControlSelect<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const keys = Object.keys(options) as T[];
  return (
    <Select
      value={String(value)}
      onValueChange={(v) =>
        onChange((typeof value === 'number' ? Number(v) : v) as T)
      }
    >
      <SelectTrigger size="sm" className="w-full sm:w-auto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {keys.map((k) => (
          <SelectItem key={String(k)} value={String(k)}>
            {options[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Card padding / header layout shared by the Analysis cards. */
export const ANALYSIS_PAD_X = 'px-sm sm:px-md';
export const ANALYSIS_HEADER =
  'flex flex-col items-stretch gap-sm px-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-md';
export const ANALYSIS_CONTROLS =
  'grid w-full grid-cols-2 gap-xs sm:flex sm:w-auto sm:flex-wrap [&>*:last-child:nth-child(odd)]:col-span-2';
export const ANALYSIS_CARD = 'gap-sm py-sm sm:gap-md sm:py-md';
/** Below this chart width the charts drop secondary labels and axes. */
export const NARROW_PX = 480;
