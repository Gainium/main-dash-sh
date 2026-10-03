import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Search, Trash2, X } from 'lucide-react';
import * as React from 'react';

export interface MultiSelectOption {
  label: string;
  value: string;
  isCustom?: boolean;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  maxDisplay?: number;
  onRemoveCustom?: (value: string) => void;
  customSectionLabel?: string;
  /** Extra classes for the options panel (e.g. a z-index above a dialog). */
  contentClassName?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select items...',
  className,
  maxDisplay = 2,
  onRemoveCustom,
  customSectionLabel = 'Custom',
  contentClassName,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((item) => item !== value));
  };

  const handleRemoveCustom = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveCustom) {
      onRemoveCustom(value);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const getLabel = (value: string) => {
    return options.find((opt) => opt.value === value)?.label || value;
  };

  // Group options into predefined and custom
  const predefinedOptions = options.filter((opt) => !opt.isCustom);
  const customOptions = options.filter((opt) => opt.isCustom);

  // Filter options based on search query
  const filteredPredefined = predefinedOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredCustom = customOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between h-auto min-h-8 px-3 py-2',
            className
          )}
        >
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden mr-2">
            {selected.length === 0 && (
              <span className="text-muted-foreground text-xs">
                {placeholder}
              </span>
            )}
            {selected.slice(0, maxDisplay).map((value) => (
              <Badge
                key={value}
                variant="secondary"
                className="text-xs px-2 py-0.5 inline-flex items-center gap-1 max-w-[calc(100%-2rem)]"
              >
                <span className="truncate min-w-0">{getLabel(value)}</span>
                <button
                  className="rounded-full outline-none hover:bg-muted shrink-0"
                  onMouseDown={(e) => handleRemove(value, e)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selected.length > maxDisplay && (
              <Badge
                variant="secondary"
                className="text-xs px-2 py-0.5 shrink-0"
              >
                +{selected.length - maxDisplay} more
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selected.length > 0 && (
              <button
                onClick={handleClear}
                className="rounded-full outline-none hover:bg-muted p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-full p-0', contentClassName)} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filteredPredefined.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <div
                key={option.value}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                  isSelected && 'bg-accent/50'
                )}
                onClick={() => handleSelect(option.value)}
              >
                <div
                  className={cn(
                    'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'opacity-50 [&_svg]:invisible'
                  )}
                >
                  <Check className="h-3 w-3" />
                </div>
                <span className="flex-1">{option.label}</span>
              </div>
            );
          })}

          {filteredCustom.length > 0 && (
            <>
              <Separator className="my-1" />
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                {customSectionLabel}
              </div>
              {filteredCustom.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={cn(
                      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground group',
                      isSelected && 'bg-accent/50'
                    )}
                    onClick={() => handleSelect(option.value)}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="flex-1">{option.label}</span>
                    {onRemoveCustom && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => handleRemoveCustom(option.value, e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
