import React from 'react';
import { cn } from '../../lib/utils';

export interface ResponsiveFormLayoutProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Layout mode: 'grid' for multi-column, 'stack' for single column, 'auto' for responsive
   * @default "auto"
   */
  mode?: 'grid' | 'stack' | 'auto';
  /**
   * Breakpoints configuration for responsive columns
   * @default { base: 1, sm: 2, md: 3 }
   */
  breakpoints?: {
    base?: number; // Default columns (no breakpoint) - single column for very small widgets
    sm?: number; // @[500px]: small widgets - 2 columns
    md?: number; // @[800px]: medium widgets - 3 columns
    lg?: number; // @[1200px]: large widgets - 4 columns (optional)
    xl?: number; // @[1600px]: extra large widgets - more columns if needed (optional)
  };
  /**
   * Gap between form fields
   * @default "gap-4"
   */
  gap?: string;
  /**
   * Minimum field width to prevent squishing (in pixels) - used for auto mode
   * @default 200
   */
  minFieldWidth?: number;
  /**
   * Maximum field width (optional) - used for auto mode
   */
  maxFieldWidth?: number;
  /**
   * Whether to stack fields vertically on very small screens
   * @default true
   */
  stackOnMobile?: boolean;
  /**
   * Custom spacing for different breakpoints
   */
  spacing?: {
    base?: string;
    sm?: string;
    md?: string;
    lg?: string;
    xl?: string;
  };
}

/**
 * ResponsiveFormLayout component that automatically adjusts form field layout
 * based on widget/container width using container queries (@container).
 *
 * This component prevents form fields from becoming squished or overlapping
 * when widgets are resized to smaller dimensions by:
 * - Dynamically changing column count based on available width (grid/auto modes)
 * - Stacking fields vertically when space is limited (stack mode)
 * - Adjusting gaps and spacing appropriately
 * - Ensuring minimum field widths are maintained
 *
 * Usage:
 * ```tsx
 * // Auto mode - automatically adjusts columns based on space and field type
 * <ResponsiveFormLayout mode="auto" minFieldWidth={200}>
 *   <FormField>...</FormField>
 *   <FormField>...</FormField>
 * </ResponsiveFormLayout>
 *
 * // Grid mode - uses fixed breakpoints for widget sizes (1 col -> 2 cols @500px -> 3 cols @800px)
 * <ResponsiveFormLayout mode="grid" breakpoints={{ base: 1, sm: 2, md: 3 }}>
 *   <SettingsRow>...</SettingsRow>
 *   <SettingsRow colSpan={2}>...</SettingsRow> // Spans 2 columns when available
 *   <SettingsRow colSpan={3}>...</SettingsRow> // Spans 3 columns when available
 * </ResponsiveFormLayout>
 *
 * // Stack mode - always single column
 * <ResponsiveFormLayout mode="stack">
 *   <FormField>...</FormField>
 * </ResponsiveFormLayout>
 * ```
 */
export const ResponsiveFormLayout: React.FC<ResponsiveFormLayoutProps> = ({
  children,
  className = '',
  mode = 'auto',
  breakpoints = { base: 1, sm: 2, md: 3, lg: 4 },
  gap = 'gap-sm',
  minFieldWidth = 200,
  maxFieldWidth,
  stackOnMobile = true,
  spacing,
}) => {
  // Generate responsive grid classes based on breakpoints
  const generateGridClasses = () => {
    // If mode is 'stack', always use single column
    if (mode === 'stack') {
      return 'grid-cols-1';
    }

    // If mode is 'grid', use the breakpoints configuration
    if (mode === 'grid') {
      const classes = [];

      // Base columns (no breakpoint) - single column for very small widgets
      if (breakpoints.base) {
        classes.push(`grid-cols-${breakpoints.base}`);
      }

      // Small breakpoint (@[500px]) - 2 columns for small widgets
      if (breakpoints.sm) {
        classes.push(`@[500px]:grid-cols-${breakpoints.sm}`);
      }

      // Medium breakpoint (@[800px]) - 3 columns for medium widgets
      if (breakpoints.md) {
        classes.push(`@[800px]:grid-cols-${breakpoints.md}`);
      }

      // Large breakpoint (@[1200px]) - 4 columns for large widgets (optional)
      if (breakpoints.lg) {
        classes.push(`@[1200px]:grid-cols-${breakpoints.lg}`);
      }

      // Extra large breakpoint (@[1600px]) - more columns for very large widgets (optional)
      if (breakpoints.xl) {
        classes.push(`@[1600px]:grid-cols-${breakpoints.xl}`);
      }

      return classes.join(' ');
    }

    // Default 'auto' mode - use intelligent responsive auto-fit grid
    // This mode tries to fit as many columns as possible while maintaining minimum widths
    return '';
  };

  // Generate responsive gap classes
  const generateGapClasses = () => {
    const gapClasses = [gap]; // Default gap

    // Adjust gaps for smaller containers
    if (spacing?.base) {
      gapClasses.push(`@[0px]:${spacing.base}`);
    }
    if (spacing?.sm) {
      gapClasses.push(`@[500px]:${spacing.sm}`);
    }
    if (spacing?.md) {
      gapClasses.push(`@[800px]:${spacing.md}`);
    }
    if (spacing?.lg) {
      gapClasses.push(`@[1200px]:${spacing.lg}`);
    }
    if (spacing?.xl) {
      gapClasses.push(`@[1600px]:${spacing.xl}`);
    }

    return gapClasses.join(' ');
  };

  const gridClasses = generateGridClasses();
  const gapClasses = generateGapClasses();

  // Generate grid template columns based on mode
  const getGridTemplateColumns = () => {
    if (mode === 'stack') {
      return '1fr';
    }

    if (mode === 'grid') {
      return undefined; // Use Tailwind classes
    }

    // Auto mode - use intelligent CSS Grid auto-fit
    // This creates a responsive grid that:
    // - Shows 1 column when container < 2 * minFieldWidth
    // - Shows 2 columns when container >= 2 * minFieldWidth
    // - Shows 3 columns when container >= 3 * minFieldWidth
    // - And so on...
    const maxWidth = maxFieldWidth ? `${maxFieldWidth}px` : '1fr';
    return `repeat(auto-fit, minmax(${minFieldWidth}px, ${maxWidth}))`;
  };

  const gridTemplateColumns = getGridTemplateColumns();

  return (
    <div className="@container w-full">
      <div
        className={cn(
          'grid w-full',
          mode === 'auto' ? '' : gridClasses,
          gapClasses,
          stackOnMobile && 'items-start',
          className
        )}
        style={{
          ...(gridTemplateColumns && { gridTemplateColumns }),
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ResponsiveFormLayout;
