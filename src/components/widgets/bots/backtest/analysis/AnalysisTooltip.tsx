// eslint-disable-next-line react-refresh/only-export-components
export const fmtPct = (v: number) =>
  Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '';

/** Chart tooltip body shared by the Analysis cards: a title and label/value rows. */
export function AnalysisTooltip({
  title,
  rows,
}: {
  title: string;
  rows: [label: string, value: string, color?: string][];
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-background p-md text-foreground shadow-xl backdrop-blur-md">
      <div className="mb-2 text-sm font-medium text-foreground/90">{title}</div>
      <div className="space-y-1 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value, color]) => (
            <div key={label} className="flex items-center justify-between gap-md">
              <span className="flex items-center gap-xs text-muted-foreground">
                {color ? (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ) : null}
                {label}
              </span>
              <span className="font-medium tabular-nums">{value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
