/**
 * Read-only view of a hedge bot's SHARED settings — the take-profit /
 * stop-loss applied at the hedge level across both legs. Mirrors the "Hedge"
 * tab on the new hedge bot page (which edits these); here we just display the
 * current values. The shared TP/SL are mirrored into both legs' settings, so
 * we read them off whichever leg we have.
 */

interface SharedSettingsLike {
  useTp?: boolean;
  tpPerc?: string | number;
  useSl?: boolean;
  slPerc?: string | number;
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between rounded-lg bg-muted p-sm">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold">{value}</span>
  </div>
);

export const HedgeSharedSettingsCard: React.FC<{
  settings?: SharedSettingsLike;
}> = ({ settings }) => {
  if (!settings) {
    return (
      <div className="rounded-lg bg-muted p-sm text-sm text-muted-foreground">
        No shared settings available.
      </div>
    );
  }
  const tp =
    settings.useTp && settings.tpPerc != null
      ? `${settings.tpPerc}%`
      : 'Off';
  const sl =
    settings.useSl && settings.slPerc != null
      ? `${settings.slPerc}%`
      : 'Off';
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Applied across both legs at the hedge level.
      </p>
      <Row label="Take profit" value={tp} />
      <Row label="Stop loss" value={sl} />
    </div>
  );
};

export default HedgeSharedSettingsCard;
