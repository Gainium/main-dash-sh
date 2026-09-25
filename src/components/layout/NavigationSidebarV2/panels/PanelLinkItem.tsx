import { ChevronRight } from 'lucide-react';
import React from 'react';

interface PanelLinkItemProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/** A navigation row inside a sidebar right panel (e.g. "Backtests"). */
const PanelLinkItem: React.FC<PanelLinkItemProps> = ({
  label,
  icon,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group text-left text-card-foreground/80 hover:text-card-foreground hover:bg-muted/30"
  >
    <div className="flex items-center gap-3">
      <div className="rounded-lg w-8 h-8 flex items-center justify-center text-card-foreground/80 group-hover:text-card-foreground">
        {icon}
      </div>
      <span className="text-sm font-medium truncate">{label}</span>
    </div>
    <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
  </button>
);

export default PanelLinkItem;
