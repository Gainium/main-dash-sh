import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card } from './card';

interface InfoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  heading: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  contentClassName?: string;
}

const InfoCard: React.FC<InfoCardProps> = ({
  heading,
  subtitle,
  icon,
  action,
  children,
  className,
  contentClassName,
  ...props
}) => {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <Card className={cn('p-5', className)} {...props}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg color-gradient-purple shadow-[var(--button-shadow)] [&>svg]:text-white">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hasChildren && (
        <div className={cn('mt-5 space-y-sm', contentClassName)}>
          {children}
        </div>
      )}
    </Card>
  );
};

export { InfoCard };
