import React from 'react';
import { cn } from '../../lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Whether to apply consistent widget spacing
   * - When true: applies 4px gaps on mobile, 8px on desktop
   * - When false: no gap classes applied
   */
  withWidgetSpacing?: boolean;
  /**
   * Container padding override
   * - 'default': 8px padding (consistent with GridLayout)
   * - 'none': no padding
   * - 'large': 16px padding
   */
  padding?: 'default' | 'none' | 'large';
}

/**
 * PageContainer provides consistent container styling for pages.
 * Use this for pages that need the same padding/spacing as GridLayout
 * but don't need the actual grid functionality.
 */
const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className,
  withWidgetSpacing = true,
  padding = 'default',
}) => {
  const paddingClasses = {
    default: 'p-xs', // 8px padding (matches GridLayout containerPadding)
    none: '',
    large: 'p-md', // 16px padding
  };

  const spacingClasses = withWidgetSpacing
    ? [
        'space-y-1', // 4px vertical gap on mobile
        '', // 8px vertical gap on desktop
      ]
    : [];

  return (
    <div className={cn(paddingClasses[padding], ...spacingClasses, className)}>
      {children}
    </div>
  );
};

export default PageContainer;
