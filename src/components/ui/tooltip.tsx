import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { HelpArticleModal } from '../modals/HelpArticleModal';
import { HelpArticlePill } from './HelpArticlePill';

// Re-exported for backwards compatibility — the implementation now lives in
// the shared helpUrl util so the Tooltip and HelpArticlePill agree.
// eslint-disable-next-line react-refresh/only-export-components
export { parseHelpUrl } from '../../utils/helpUrl';

interface TooltipProps {
  children: React.ReactNode;
  tooltip?: string;
  tooltipURL?: string;
  /** Label of the `tooltipURL` pill; defaults to the article title. */
  tooltipURLLabel?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  delay?: number; // Delay in milliseconds before showing tooltip
}

interface InfoIconProps {
  className?: string;
}

const InfoIcon: React.FC<InfoIconProps> = ({ className }) => {
  return (
    <div
      className={cn(
        'w-4 h-4 rounded-full bg-muted border border-muted-foreground/30 flex items-center justify-center cursor-help hover:bg-muted-foreground/10 transition-colors',
        className
      )}
    >
      <span className="text-xs text-muted-foreground font-semibold">?</span>
    </div>
  );
};

const Tooltip: React.FC<TooltipProps> = ({
  children,
  tooltip,
  tooltipURL,
  tooltipURLLabel,
  side = 'top',
  className,
  triggerClassName,
  delay = 0, // Default no delay
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [modalSlug, setModalSlug] = useState<string | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipElRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipElRef.current) return;

    // getBoundingClientRect() is viewport-relative; tooltip uses `position: fixed`,
    // so we must NOT add scrollX/scrollY. Use actual measured dimensions to avoid gaps.
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = tooltipElRef.current.offsetWidth || 288;
    const tooltipHeight = tooltipElRef.current.offsetHeight || 60;

    let top = 0;
    let left = 0;

    switch (side) {
      case 'top':
        top = rect.top - tooltipHeight - 8;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        if (top < 10) top = rect.bottom + 8; // Flip to bottom
        break;
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        if (top + tooltipHeight > viewportHeight - 10)
          top = rect.top - tooltipHeight - 8; // Flip to top
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - 8;
        if (left < 10) left = rect.right + 8; // Flip to right
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + 8;
        if (left + tooltipWidth > viewportWidth - 10)
          left = rect.left - tooltipWidth - 8; // Flip to left
        break;
    }

    // Constrain to viewport bounds
    left = Math.max(10, Math.min(left, viewportWidth - tooltipWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - tooltipHeight - 10));

    setPosition({ top, left });
    setIsPositioned(true);
  }, [side]);

  const showTooltip = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }

    const doShow = () => setIsVisible(true);

    if (delay > 0) {
      showTimeoutRef.current = setTimeout(doShow, delay);
    } else {
      doShow();
    }
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      setIsPositioned(false);
    }, 300);
  }, []);

  // Position AFTER the portal mounts using actual measured dimensions.
  // useLayoutEffect runs synchronously before the browser paints, so the user
  // never sees the `visibility: hidden` placeholder state.
  useLayoutEffect(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  // Reposition on scroll (capture phase catches nested containers) and resize
  useEffect(() => {
    if (!isVisible) return undefined;
    window.addEventListener('scroll', calculatePosition, true);
    window.addEventListener('resize', calculatePosition);
    return () => {
      window.removeEventListener('scroll', calculatePosition, true);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [isVisible, calculatePosition]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    };
  }, []);

  if (!tooltip) return <>{children}</>;

  const getArrowClasses = () => {
    const baseClasses = 'absolute w-0 h-0 border-4';
    switch (side) {
      case 'top':
        return `${baseClasses} top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-foreground/90`;
      case 'bottom':
        return `${baseClasses} bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-foreground/90`;
      case 'left':
        return `${baseClasses} left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-foreground/90`;
      case 'right':
        return `${baseClasses} right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-foreground/90`;
      default:
        return baseClasses;
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        className={cn('relative inline-block', triggerClassName)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
      >
        {children}

        {isVisible &&
          createPortal(
            <div
              ref={tooltipElRef}
              role="tooltip"
              className={cn(
                'fixed z-9999 px-4 py-3 text-sm text-foreground bg-popover backdrop-blur-sm border border-border rounded-md shadow-lg max-w-xs',
                className
              )}
              style={{
                top: position.top,
                left: position.left,
                visibility: isPositioned ? 'visible' : 'hidden',
              }}
              onMouseEnter={showTooltip}
              onMouseLeave={hideTooltip}
            >
              <div className={getArrowClasses()} />
              <div className="space-y-2">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {tooltip}
                </p>
                {tooltipURL && (
                  <HelpArticlePill
                    url={tooltipURL}
                    {...(tooltipURLLabel ? { label: tooltipURLLabel } : {})}
                    onActivate={(slug) => {
                      hideTooltip();
                      setModalSlug(slug);
                    }}
                  />
                )}
              </div>
            </div>,
            document.body
          )}
      </div>
      <HelpArticleModal slug={modalSlug} onClose={() => setModalSlug(null)} />
    </>
  );
};

export { InfoIcon, Tooltip };
