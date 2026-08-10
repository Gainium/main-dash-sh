import React, { useMemo } from 'react';
import { useGridMargins } from '../../hooks/useSpacing';
import { cn } from '../../lib/utils';

interface WidgetContainerProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Layout variant - determines how widgets are arranged
   * - 'grid': CSS Grid with responsive columns
   * - 'flex': Flexbox layout (column direction)
   * - 'none': No special layout, just padding and gap
   */
  layout?: 'grid' | 'flex' | 'none';
  /**
   * Number of columns for grid layout (only applies when layout='grid')
   * Can be a number or responsive object
   */
  columns?:
    | number
    | {
        xs?: number;
        sm?: number;
        md?: number;
        lg?: number;
      };
  /**
   * Whether to apply vertical gaps between items
   */
  verticalGap?: boolean;
  /**
   * Whether to disable container padding
   */
  noPadding?: boolean;
  /**
   * Responsive margin configuration (like GridLayout)
   * [horizontal, vertical] pixels for each breakpoint
   */
  margin?: {
    lg?: [number, number];
    md?: [number, number];
    sm?: [number, number];
    xs?: [number, number];
    xxs?: [number, number];
  };
  /**
   * Responsive container padding configuration (like GridLayout)
   * [horizontal, vertical] pixels for each breakpoint
   */
  containerPadding?: {
    lg?: [number, number];
    md?: [number, number];
    sm?: [number, number];
    xs?: [number, number];
    xxs?: [number, number];
  };
}

/**
 * WidgetContainer provides consistent spacing for pages that don't use GridLayout.
 * It applies the same responsive gap and padding standards as GridLayout:
 * - Mobile (xs, xxs): responsive gaps and padding
 * - Desktop (sm, md, lg): responsive gaps and padding
 * Spacing automatically adapts to compact/comfortable visual settings.
 */
const WidgetContainer: React.FC<WidgetContainerProps> = ({
  children,
  className,
  layout = 'flex',
  columns = { xs: 1, sm: 1, md: 2, lg: 3 },
  verticalGap = true,
  noPadding = false,
  margin: customMargin,
  containerPadding: customContainerPadding,
}) => {
  // Get dynamic margins based on visual settings
  const dynamicMargins = useGridMargins();

  // Use custom margins if provided, otherwise use dynamic margins
  const margin = useMemo(
    () => customMargin || dynamicMargins,
    [customMargin, dynamicMargins]
  );
  const containerPadding = useMemo(
    () => customContainerPadding,
    [customContainerPadding]
  );
  // Generate grid columns classes based on columns prop
  const getGridColumns = () => {
    if (typeof columns === 'number') {
      return `grid-cols-${columns}`;
    }

    const colClasses: string[] = [];
    if (columns.xs) colClasses.push(`grid-cols-${columns.xs}`);
    if (columns.sm) colClasses.push(`sm:grid-cols-${columns.sm}`);
    if (columns.md) colClasses.push(`md:grid-cols-${columns.md}`);
    if (columns.lg) colClasses.push(`lg:grid-cols-${columns.lg}`);

    return colClasses.join(' ');
  };

  // Convert pixel values to Tailwind spacing classes
  const pixelsToTailwind = (pixels: number): string => {
    // Tailwind uses rem units: 1 = 4px, 2 = 8px, etc.
    return `${pixels / 4}`;
  };

  // Generate responsive gap classes from margin prop
  const getResponsiveGaps = () => {
    if (!margin) {
      // Default responsive gaps
      return 'gap-xs';
    }

    const gapClasses: string[] = [];

    // Start with the smallest breakpoint
    if (margin.xxs) {
      const gap = pixelsToTailwind(margin.xxs[0]); // Use horizontal gap
      gapClasses.push(`gap-${gap}`);
    } else if (margin.xs) {
      const gap = pixelsToTailwind(margin.xs[0]);
      gapClasses.push(`gap-${gap}`);
    }

    // Add responsive breakpoints
    if (margin.xs && (!margin.xxs || margin.xs[0] !== margin.xxs[0])) {
      const gap = pixelsToTailwind(margin.xs[0]);
      gapClasses.push(`xs:gap-${gap}`);
    }
    if (margin.sm) {
      const gap = pixelsToTailwind(margin.sm[0]);
      gapClasses.push(`sm:gap-${gap}`);
    }
    if (margin.md) {
      const gap = pixelsToTailwind(margin.md[0]);
      gapClasses.push(`md:gap-${gap}`);
    }
    if (margin.lg) {
      const gap = pixelsToTailwind(margin.lg[0]);
      gapClasses.push(`lg:gap-${gap}`);
    }

    return gapClasses.join(' ');
  };

  // Generate responsive padding classes from containerPadding prop
  const getResponsivePadding = () => {
    if (noPadding) return '';

    if (!containerPadding) {
      // No default padding - MainLayout handles all horizontal/vertical margins
      // Individual pages can pass custom containerPadding if needed
      return '';
    }

    const paddingClasses: string[] = [];

    // Start with the smallest breakpoint
    if (containerPadding.xxs) {
      const padding = pixelsToTailwind(containerPadding.xxs[0]); // Use horizontal padding
      paddingClasses.push(`p-${padding}`);
    } else if (containerPadding.xs) {
      const padding = pixelsToTailwind(containerPadding.xs[0]);
      paddingClasses.push(`p-${padding}`);
    }

    // Add responsive breakpoints
    if (
      containerPadding.xs &&
      (!containerPadding.xxs ||
        containerPadding.xs[0] !== containerPadding.xxs[0])
    ) {
      const padding = pixelsToTailwind(containerPadding.xs[0]);
      paddingClasses.push(`xs:p-${padding}`);
    }
    if (containerPadding.sm) {
      const padding = pixelsToTailwind(containerPadding.sm[0]);
      paddingClasses.push(`sm:p-${padding}`);
    }
    if (containerPadding.md) {
      const padding = pixelsToTailwind(containerPadding.md[0]);
      paddingClasses.push(`md:p-${padding}`);
    }
    if (containerPadding.lg) {
      const padding = pixelsToTailwind(containerPadding.lg[0]);
      paddingClasses.push(`lg:p-${padding}`);
    }

    return paddingClasses.join(' ');
  };

  // Generate responsive space-y classes for flex layout
  const getResponsiveSpacing = () => {
    if (!verticalGap) return '';

    if (!margin) {
      // Default responsive spacing
      return 'space-y-1';
    }

    const spaceClasses: string[] = [];

    // Start with the smallest breakpoint
    if (margin.xxs) {
      const space = pixelsToTailwind(margin.xxs[1]); // Use vertical gap
      spaceClasses.push(`space-y-${space}`);
    } else if (margin.xs) {
      const space = pixelsToTailwind(margin.xs[1]);
      spaceClasses.push(`space-y-${space}`);
    }

    // Add responsive breakpoints
    if (margin.xs && (!margin.xxs || margin.xs[1] !== margin.xxs[1])) {
      const space = pixelsToTailwind(margin.xs[1]);
      spaceClasses.push(`xs:space-y-${space}`);
    }
    if (margin.sm) {
      const space = pixelsToTailwind(margin.sm[1]);
      spaceClasses.push(`sm:space-y-${space}`);
    }
    if (margin.md) {
      const space = pixelsToTailwind(margin.md[1]);
      spaceClasses.push(`md:space-y-${space}`);
    }
    if (margin.lg) {
      const space = pixelsToTailwind(margin.lg[1]);
      spaceClasses.push(`lg:space-y-${space}`);
    }

    return spaceClasses.join(' ');
  };

  const baseClasses = cn(getResponsivePadding(), getResponsiveGaps());

  const layoutClasses = {
    grid: cn('grid', getGridColumns(), baseClasses),
    flex: cn('flex flex-col', getResponsiveSpacing(), baseClasses),
    none: baseClasses,
  };

  return <div className={cn(layoutClasses[layout], className)}>{children}</div>;
};

export default WidgetContainer;
