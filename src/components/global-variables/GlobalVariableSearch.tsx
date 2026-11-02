import { Loader2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  StyledPopoverItem,
  StyledPopoverLabel,
  StyledPopoverSeparator,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebounce } from '@/hooks/useDebounce';
import { useGlobalVariables } from '@/hooks/useGlobalVariables';
import { cn } from '@/lib/utils';
import { GlobalVariablesTypeEnum, type VarToSearchType } from '@/types';
import type { GlobalVariable } from '@/types/globalVariables';

const MAP_TYPE_TO_LABEL: Record<GlobalVariablesTypeEnum, string> = {
  [GlobalVariablesTypeEnum.text]: 'Text',
  [GlobalVariablesTypeEnum.int]: 'Integer',
  [GlobalVariablesTypeEnum.float]: 'Decimal',
};

interface VariableSearchProps {
  varType: VarToSearchType;
  selectedId?: string | null;
  onSelect: (variable: GlobalVariable) => void;
  onClear?: () => void;
}

const toAllowedTypes = (
  varType: VarToSearchType
): GlobalVariablesTypeEnum[] => {
  switch (varType) {
    case 'number':
      return [GlobalVariablesTypeEnum.int, GlobalVariablesTypeEnum.float];
    case 'int':
      return [GlobalVariablesTypeEnum.int];
    case 'float':
      return [GlobalVariablesTypeEnum.float];
    case 'text':
    default:
      return [GlobalVariablesTypeEnum.text];
  }
};

export const VariableSearch: React.FC<VariableSearchProps> = ({
  varType,
  selectedId,
  onSelect,
  onClear,
}) => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const allowedTypes = useMemo(() => toAllowedTypes(varType), [varType]);

  // Fetch the whole list (the hook's default) and filter here: the picker has
  // no paging, and the API has no name search.
  const { variables, isLoading } = useGlobalVariables();

  const filteredVariables = useMemo(() => {
    if (!variables?.length) {
      return [];
    }
    const term = debouncedSearch.trim().toLowerCase();
    return variables.filter(
      (item) =>
        allowedTypes.includes(item.type) &&
        (!term || item.name.toLowerCase().includes(term))
    );
  }, [variables, allowedTypes, debouncedSearch]);

  return (
    <>
      <div className="p-sm border-b border-border/60">
        <div className="relative">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search variables..."
            className="pl-9"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {onClear && selectedId && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-xs text-xs"
            onClick={onClear}
          >
            Remove variable binding
          </Button>
        )}
      </div>

      <StyledPopoverLabel className="flex items-center justify-between px-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span>Available variables</span>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </StyledPopoverLabel>
      <StyledPopoverSeparator className="my-0" />

      <ScrollArea className="h-64">
        <div className="p-1 space-y-1">
          {filteredVariables.length === 0 && !isLoading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No variables found
            </div>
          ) : null}

          {filteredVariables.map((variable) => {
            const isSelected = variable.id === selectedId;
            return (
              <StyledPopoverItem
                key={variable.id}
                selected={isSelected}
                onClick={() => onSelect(variable)}
                className={cn(
                  'cursor-pointer flex-col items-start gap-1 bg-transparent',
                  isSelected && 'border border-primary/40'
                )}
              >
                <div className="flex w-full items-center justify-between gap-xs">
                  <div className="text-sm font-medium text-card-foreground">
                    {variable.name}
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {MAP_TYPE_TO_LABEL[variable.type]}
                  </span>
                </div>
                <div className="w-full text-xs text-muted-foreground/90">
                  {variable.value}
                </div>
              </StyledPopoverItem>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
};

export default VariableSearch;
