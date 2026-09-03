import { motion, useAnimationControls } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import { InfoIcon, Tooltip } from './tooltip';

export type StatBox = {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Explains how the figure is calculated, shown on the title's info icon. */
  tooltip?: string;
  icon: React.ReactNode;
  /** Tailwind gradient classes, e.g. 'from-blue-500 to-blue-600' */
  colorClass?: string;
  isLoading?: boolean;
};

export type StatsBoxesProps = {
  boxes: StatBox[];
  className?: string;
};

type StatCardProps = StatBox & { expand?: boolean };

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  //subtitle,
  tooltip,
  icon,
  //colorClass = 'from-blue-500 to-blue-600',
  isLoading = false,
  //expand = false,
}) => {
  // Border restored: these chips sit as peer surfaces at the same elevation
  // and pack tightly into a carousel on narrow screens. Per the design system,
  // borders are justified for "peer surfaces in dense layouts." A thin
  // border-border/60 reads as a separator without competing with the chip fill.
  const baseClass = `inline-flex items-center gap-3 px-3 bg-card rounded-lg h-[34px] whitespace-nowrap shrink-0`;

  if (isLoading) {
    return (
      <div className={`${baseClass} animate-pulse`}>
        <div className="w-5 h-5 bg-card rounded" />
        <div className="flex-1 min-w-0">
          <div className="h-3 bg-card rounded w-20" />
        </div>
      </div>
    );
  }

  // Icons should be neutral — no color mapping; use muted foreground

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={baseClass}
    >
      <div className="text-muted-foreground shrink-0 w-5 h-5 flex items-center justify-center">
        {icon}
      </div>

      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
          {title}
          {tooltip && (
            <Tooltip tooltip={tooltip} side="bottom">
              <InfoIcon className="h-3 w-3" />
            </Tooltip>
          )}
        </div>
        <div className="text-sm font-semibold text-foreground whitespace-nowrap">
          {value}
        </div>
      </div>
    </motion.div>
  );
};

export const StatsBoxes: React.FC<StatsBoxesProps> = ({
  boxes,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsCarousel, setNeedsCarousel] = useState(false);
  const controls = useAnimationControls();

  // Refs for controlling the automatic carousel and handling user interaction
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef<() => boolean>(() => false);
  const restartTimeoutRef = useRef<number | null>(null);

  const handlePointerDown = () => {
    // Stop automatic cycling while the user interacts
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    controls.stop();
  };

  const handlePointerUp = () => {
    if (!needsCarousel) return;
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    // Restart carousel after a short delay so the user can finish interacting
    restartTimeoutRef.current = window.setTimeout(() => {
      if (stepRef.current()) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(() => stepRef.current(), 3000);
      }
    }, 3000);
  };

  useEffect(() => {
    const checkOverflow = () => {
      if (!containerRef.current || !contentRef.current) return;

      const container = containerRef.current;
      const content = contentRef.current;

      // compute horizontal padding of container
      const containerStyle = getComputedStyle(container);
      const padLeft = parseFloat(containerStyle.paddingLeft || '0');
      const padRight = parseFloat(containerStyle.paddingRight || '0');
      const availableWidth = container.clientWidth - padLeft - padRight;

      // sum children widths + gaps
      const children = Array.from(content.children) as HTMLElement[];
      const gapStyle = getComputedStyle(content).gap || '0px';
      const gap = parseFloat(gapStyle) || 0;
      const totalChildrenWidth =
        children.reduce((sum, child) => sum + child.offsetWidth, 0) +
        Math.max(0, children.length - 1) * gap;

      // Small tolerance to avoid unnecessary carousel on tiny rounding differences
      const tolerance = 4;
      const shouldCarousel = totalChildrenWidth > availableWidth + tolerance;

      setNeedsCarousel(shouldCarousel);
    };

    // Use a small delay to ensure DOM is fully rendered before checking
    const timeoutId = setTimeout(checkOverflow, 50);
    requestAnimationFrame(checkOverflow);

    const ro = new ResizeObserver(() => {
      // Debounce resize observations
      setTimeout(checkOverflow, 100);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);

    window.addEventListener('resize', checkOverflow);
    return () => {
      clearTimeout(timeoutId);
      ro.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [boxes]);

  useEffect(() => {
    if (!needsCarousel || !contentRef.current || !containerRef.current) {
      controls.set({ x: 0 });
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      return;
    }

    const totalBoxes = boxes.length;
    let currentIndex = 0;

    const getGap = () => {
      const gapStyle =
        getComputedStyle(contentRef.current as Element).gap || '0px';
      return parseFloat(gapStyle) || 0;
    };

    const step = () => {
      if (!containerRef.current || !contentRef.current) return false;

      const children = Array.from(contentRef.current.children) as HTMLElement[];
      if (children.length === 0) return false;

      const gap = getGap();
      // compute widths and cumulative positions
      const widths = children.map((c) => c.offsetWidth);
      const positions = widths.reduce<number[]>((acc, w, i) => {
        if (i === 0) acc.push(0);
        else acc.push(acc[i - 1] + widths[i - 1] + gap);
        return acc;
      }, []);

      const containerWidth =
        containerRef.current.clientWidth -
        (parseFloat(getComputedStyle(containerRef.current).paddingLeft || '0') +
          parseFloat(
            getComputedStyle(containerRef.current).paddingRight || '0'
          ));

      // determine how many fit
      let visibleCount = 0;
      let acc = 0;
      for (let i = 0; i < widths.length; i++) {
        if (acc + widths[i] <= containerWidth) {
          visibleCount++;
          acc += widths[i] + gap;
        } else {
          break;
        }
      }

      if (visibleCount === 0) visibleCount = 1;

      // Double-check: if all boxes fit, don't carousel
      if (totalBoxes <= visibleCount) {
        controls.set({ x: 0 });
        return false; // no need to run carousel
      }

      currentIndex = (currentIndex + 1) % totalBoxes;
      const maxIndex = Math.max(0, totalBoxes - visibleCount);
      const indexToShow = currentIndex % (maxIndex + 1);
      const targetX = -(positions[indexToShow] || 0);
      controls.start({
        x: targetX,
        transition: { duration: 0.5, ease: 'easeInOut' },
      });
      return true;
    };

    // expose step via ref so it can be restarted after user interaction
    stepRef.current = step;

    // Delay initial step to ensure DOM is settled
    const initialTimeout = setTimeout(() => {
      const shouldRun = stepRef.current();
      if (shouldRun) {
        intervalRef.current = window.setInterval(() => stepRef.current(), 3000);
      }
    }, 100);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
    };
  }, [needsCarousel, boxes.length, controls]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`min-w-0 max-w-full bg-inner-container rounded-md px-3 py-1 overflow-hidden h-[45px] flex items-center ${className}`}
    >
      <motion.div
        ref={contentRef}
        animate={controls}
        className={`flex gap-3 items-center w-fit`}
        initial={{ x: 0 }}
      >
        {boxes.map((box, idx) => (
          <StatCard key={idx} {...box} />
        ))}
      </motion.div>
    </div>
  );
};

export default StatsBoxes;
