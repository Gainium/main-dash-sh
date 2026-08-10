import type { TradingPair } from '@/hooks/useTradingPairs';
import { useWidgetPortal } from '@/hooks/useWidgetPortal';
import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import TradingViewChart from '../shared/TradingViewChart/TradingViewChart';

interface ChartPortalProps {
  isOpen: boolean;
  onClose: () => void;
  pair: TradingPair | null;
  widgetId?: string; // Add widgetId prop for portal targeting
}

const ChartPortal: React.FC<ChartPortalProps> = ({
  isOpen,
  onClose,
  pair,
  widgetId = 'chart-portal',
}) => {
  const [mounted, setMounted] = React.useState(false);

  // Get hybrid portal configuration
  const { portalTarget, zIndexClass, shouldUsePortal } = useWidgetPortal(
    widgetId || 'default'
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!mounted || !isOpen || !pair) return null;

  // Chart content component
  const chartContent = (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 ${zIndexClass}`}
      onClick={handleBackdropClick}
    >
      <div
        className="relative bg-card shadow-lg border border-border w-screen h-screen md:w-[95vw] md:h-[95vh] md:rounded-lg rounded-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-sm hover:bg-muted/50 transition-colors z-10 bg-background/80"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="w-full h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <TradingViewChart
              symbol={pair.pair}
              interval="60"
              widgetId={widgetId}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal in normal mode, direct rendering in fullscreen
  return shouldUsePortal
    ? createPortal(chartContent, portalTarget)
    : chartContent;
};

export default ChartPortal;
