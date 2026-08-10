import { motion } from 'framer-motion';
import { Filter, X } from 'lucide-react';
import React from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Label } from '../label';

export interface QuickFilterOption {
  value: string;
  label: string;
}

export interface QuickFilterConfig {
  id: string;
  label: string;
  options: QuickFilterOption[];
  type: 'multi-select' | 'single-select';
  maxDisplayed?: number; // For compact layout
}

export interface QuickFiltersProps {
  filters: QuickFilterConfig[];
  activeFilters: Record<string, string[]>;
  onFilterChange: (category: string, value: string) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
}

export const QuickFilters: React.FC<QuickFiltersProps> = ({
  filters,
  activeFilters,
  onFilterChange,
  onClearAll,
  totalCount,
  filteredCount,
}) => {
  // Calculate active filters count
  const activeFiltersCount = Object.values(activeFilters).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden shrink-0"
    >
      <div className="bg-card border border-border rounded-lg shadow-sm p-2 flex flex-wrap items-center gap-4">
        {/* Header Section */}
        <div className="flex items-center gap-2 mr-2">
          <Filter className="w-4 h-4 text-white" />
          <h3 className="text-sm font-semibold whitespace-nowrap">
            Quick Filters
          </h3>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 h-5">
              {activeFiltersCount}
            </Badge>
          )}
        </div>

        {/* Filters Section */}
        <div className="flex flex-wrap items-center gap-4 flex-1">
          {filters.map((filter) => {
            const displayOptions =
              filter.maxDisplayed && filter.maxDisplayed > 0
                ? filter.options.slice(0, filter.maxDisplayed)
                : filter.options;

            return (
              <div key={filter.id} className="flex items-center gap-2">
                <Label className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                  {filter.label}:
                </Label>
                <div className="flex flex-wrap gap-1">
                  {displayOptions.map((option) => {
                    const isActive = activeFilters[filter.id]?.includes(
                      option.value
                    );
                    return (
                      <Badge
                        key={option.value}
                        variant="outline"
                        className={`cursor-pointer text-xs px-2 py-0.5 transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95 ${
                          isActive
                            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                            : 'hover:border-primary/50'
                        }`}
                        onClick={() => onFilterChange(filter.id, option.value)}
                      >
                        {option.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Results count */}
          <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
            <span className="font-medium">{filteredCount}</span> of{' '}
            <span className="font-medium">{totalCount}</span>
          </div>

          {/* Vertical Divider */}
          <div className="h-4 w-[1px] bg-border mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground hover:bg-muted"
            disabled={activeFiltersCount === 0}
          >
            <X className="w-3 h-3 mr-1" />
            Clear All
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
