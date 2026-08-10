import { motion } from 'framer-motion';
import React from 'react';
import WidgetContainer from '../layout/WidgetContainer';
import { PageTransition } from './MotionWrapper';
import Widget from './widget';

type Columns = { xs: number; sm: number; md: number; lg: number };

type BotsSkeletonProps = {
  title?: string;
  description?: string;
  statCount?: number;
  statColumns?: Columns;
  rowCount?: number;
  statCardPadding?: string;
  headerPadding?: string;
};

const BotsSkeleton: React.FC<BotsSkeletonProps> = ({
  title = 'Loading Bots',
  description = 'Fetching your bot data and performance metrics...',
  //statCount = 4,
  //statColumns = { xs: 1, sm: 2, md: 2, lg: 4 },
  rowCount = 3,
  //statCardPadding = 'p-sm',
  headerPadding = 'p-4 md:p-6',
}) => {
  return (
    <PageTransition className="h-full min-h-0 flex flex-col">
      <WidgetContainer
        layout="flex"
        verticalGap
        className="h-full min-h-0 flex-1"
      >
        <div className="flex-1 min-h-0">
          <Widget className="h-full flex flex-col">
            <div className={`${headerPadding} border-b`}>
              <div className="space-y-xs animate-pulse">
                <div className="h-8 bg-muted rounded w-48"></div>
                <div className="h-4 bg-muted rounded w-32"></div>
              </div>
              <div className="flex gap-xs animate-pulse mt-0">
                <div className="h-10 bg-muted rounded w-24"></div>
                <div className="h-10 bg-muted rounded w-20"></div>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-md">
                <div className="flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                    className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full"
                  />
                </div>
                <div className="space-y-xs">
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            </div>

            <div className="p-sm space-y-sm">
              {Array.from({ length: rowCount }).map((_, index) => (
                <div key={`skeleton-row-${index}`} className="animate-pulse">
                  <div className="flex items-center space-x-md p-3 md:p-4 border rounded-lg">
                    <div className="h-12 w-12 bg-muted rounded-full"></div>
                    <div className="flex-1 space-y-xs">
                      <div className="h-4 bg-muted rounded w-32"></div>
                      <div className="h-3 bg-muted rounded w-24"></div>
                    </div>
                    <div className="space-y-xs">
                      <div className="h-4 bg-muted rounded w-16"></div>
                      <div className="h-3 bg-muted rounded w-12"></div>
                    </div>
                    <div className="h-8 bg-muted rounded w-20"></div>
                  </div>
                </div>
              ))}
            </div>
          </Widget>
        </div>
      </WidgetContainer>
    </PageTransition>
  );
};

export default BotsSkeleton;
