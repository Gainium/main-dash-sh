import { clsx } from 'clsx';
import React from 'react';

export interface WidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  rounded?: boolean;
  shadow?: boolean;
  overflow?: 'hidden' | 'auto' | 'visible';
}

export const Widget: React.FC<WidgetProps> = ({
  children,
  className,
  noPadding = false,
  rounded = true,
  shadow = true,
  overflow = 'hidden',
  ...props
}) => {
  return (
    <div
      {...props}
      className={clsx(
        'flex flex-col h-full bg-card', // Remove m-2 to eliminate widget margins
        !noPadding && 'p-xs',
        rounded && 'rounded-lg',
        shadow && 'shadow-md',
        // Apply overflow behavior
        overflow === 'hidden' && 'overflow-hidden',
        overflow === 'auto' && 'overflow-auto',
        overflow === 'visible' && 'overflow-visible',
        className
      )}
      style={props.style}
    >
      {children}
    </div>
  );
};

export default Widget;
