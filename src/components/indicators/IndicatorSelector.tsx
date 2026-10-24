import React from 'react';
import { HelpArticlePill } from '@/components/ui/HelpArticlePill';
import { Loader2, Star } from 'lucide-react';
import { DialogSearchInput } from '@/components/common/DialogSearchInput';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { parseHelpUrl } from '@/components/ui/tooltip';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import { cn } from '@/lib/utils';
import {
  getIndicatorDefinition,
  groupIndicatorsByCategory,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorDefinition } from '@/types/indicators/indicatorTypes';
import { getPopularIndicators } from '@/types/indicators/popularIndicators';
import type { IndicatorAction, IndicatorEnum } from '@/types';

const normalize = (value: string) => value.toLowerCase();

const matchesSearch = (definition: IndicatorDefinition, query: string) => {
  if (!query) {
    return true;
  }
  const haystack = [
    definition.label,
    definition.shortLabel,
    definition.description,
    definition.type,
  ]
    .filter(Boolean)
    .map(normalize);
  const needle = normalize(query);
  return haystack.some((item) => item.includes(needle));
};

const titleCase = (value: string) =>
  value
    .replace(
      /(^|_|-)([a-z])/gi,
      (_match, _prefix, char) => ` ${char.toUpperCase()}`
    )
    .trim();

interface IndicatorSelectorProps {
  onSelect: (type: IndicatorEnum) => void;
  favorites?: IndicatorEnum[];
  onToggleFavorite?: (type: IndicatorEnum, nextIsFavorite: boolean) => void;
  disabled?: boolean;
  className?: string;
  allowedActions?: IndicatorAction[];
  allowedTypes?: IndicatorEnum[];
  favoritesMutating?: boolean;
  isFavoriteMutating?: (type: IndicatorEnum) => boolean;
  overrideIndicators?: IndicatorEnum[];
}

export const IndicatorSelector: React.FC<IndicatorSelectorProps> = ({
  onSelect,
  favorites = [],
  onToggleFavorite,
  disabled,
  className,
  allowedActions,
  allowedTypes,
  favoritesMutating = false,
  isFavoriteMutating,
  overrideIndicators = [],
}) => {
  const [search, setSearch] = React.useState('');
  const [docHelpSlug, setDocHelpSlug] = React.useState<string | null>(null);

  const matchesAction = React.useCallback(
    (definition: IndicatorDefinition) => {
      if (!allowedActions || allowedActions.length === 0) {
        return true;
      }
      return allowedActions.some((action) =>
        definition.supportedActions.includes(action)
      );
    },
    [allowedActions]
  );

  const matchesAllowedType = React.useCallback(
    (definition: IndicatorDefinition) => {
      if (!allowedTypes || allowedTypes.length === 0) {
        return true;
      }
      return allowedTypes.includes(definition.type);
    },
    [allowedTypes]
  );

  const favoriteDefinitions = React.useMemo(() => {
    if (!favorites.length) {
      return [] as IndicatorDefinition[];
    }
    return favorites
      .filter(
        (f) => overrideIndicators.length === 0 || overrideIndicators.includes(f)
      )
      .map((type) => {
        try {
          return getIndicatorDefinition(type);
        } catch {
          return undefined;
        }
      })
      .filter((definition): definition is IndicatorDefinition =>
        Boolean(definition)
      )
      .filter((definition) => matchesAction(definition))
      .filter((definition) => matchesAllowedType(definition))
      .filter((definition) => matchesSearch(definition, search));
  }, [
    favorites,
    matchesAction,
    matchesAllowedType,
    search,
    overrideIndicators,
  ]);

  // The usual first picks, right under the user's favorites. Hidden while
  // searching: the category results cover them then.
  const popularDefinitions = React.useMemo(() => {
    if (search) {
      return [] as IndicatorDefinition[];
    }
    return getPopularIndicators().filter(
      (definition) =>
        !favorites.includes(definition.type) &&
        matchesAction(definition) &&
        matchesAllowedType(definition) &&
        (overrideIndicators.length === 0 ||
          overrideIndicators.includes(definition.type))
    );
  }, [
    favorites,
    matchesAction,
    matchesAllowedType,
    search,
    overrideIndicators,
  ]);

  const groupedIndicators = React.useMemo(() => {
    if (!search) {
      const grouped = groupIndicatorsByCategory();
      return Object.entries(grouped).reduce<
        Record<string, IndicatorDefinition[]>
      >((acc, [category, definitions]) => {
        const filtered = definitions.filter(
          (definition) =>
            matchesAction(definition) &&
            matchesAllowedType(definition) &&
            (overrideIndicators.length === 0 ||
              overrideIndicators.includes(definition.type))
        );
        if (filtered.length) {
          acc[category] = filtered;
        }
        return acc;
      }, {});
    }
    const grouped = groupIndicatorsByCategory();
    return Object.entries(grouped).reduce<
      Record<string, IndicatorDefinition[]>
    >((acc, [category, definitions]) => {
      const filtered = definitions.filter(
        (definition) =>
          matchesAction(definition) &&
          matchesAllowedType(definition) &&
          matchesSearch(definition, search) &&
          (overrideIndicators.length === 0 ||
            overrideIndicators.includes(definition.type))
      );
      if (filtered.length) {
        acc[category] = filtered;
      }
      return acc;
    }, {});
  }, [matchesAction, matchesAllowedType, search, overrideIndicators]);

  const hasAnySupportedIndicators = React.useMemo(() => {
    const grouped = groupIndicatorsByCategory();
    const hasActionFilter = allowedActions && allowedActions.length > 0;
    const hasTypeFilter = allowedTypes && allowedTypes.length > 0;

    if (!hasActionFilter && !hasTypeFilter) {
      return true;
    }
    return Object.values(grouped).some((definitions) =>
      definitions.some(
        (definition) =>
          matchesAction(definition) && matchesAllowedType(definition)
      )
    );
  }, [allowedActions, allowedTypes, matchesAction, matchesAllowedType]);

  const resultIsEmpty =
    favoriteDefinitions.length === 0 &&
    Object.values(groupedIndicators).every(
      (definitions) => definitions.length === 0
    );

  const renderIndicatorButton = (definition: IndicatorDefinition) => {
    const isFavorite = favorites.includes(definition.type);
    const isPendingPort = Boolean(definition.pendingPort);
    const favoriteBusy =
      favoritesMutating || Boolean(isFavoriteMutating?.(definition.type));
    const buttonDisabled = Boolean(disabled || isPendingPort);
    const favoriteToggleDisabled = isPendingPort || favoriteBusy;
    const documentationUrl = definition.documentationUrl;
    return (
      <Button
        key={definition.type}
        type="button"
        variant="ghost"
        className={cn(
          'w-full h-full items-start justify-between gap-md rounded-lg bg-card p-md text-left transition overflow-hidden',
          buttonDisabled
            ? 'cursor-not-allowed opacity-75 hover:bg-card hover:text-foreground'
            : 'hover:bg-accent hover:text-accent-foreground'
        )}
        disabled={buttonDisabled}
        onClick={() => {
          if (isPendingPort) {
            return;
          }
          onSelect(definition.type);
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 pr-2 w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {definition.label}
          </span>
          <div className="text-xs text-muted-foreground leading-relaxed wrap-break-words whitespace-normal">
            {definition.description}
          </div>
          {documentationUrl && parseHelpUrl(documentationUrl).helpSlug ? (
            <div>
              <HelpArticlePill
                url={documentationUrl}
                onActivate={setDocHelpSlug}
              />
            </div>
          ) : null}
          {isPendingPort ? (
            <div className="text-xs font-medium text-amber-600">
              Coming soon — still available in the legacy dashboard.
            </div>
          ) : null}
        </div>
        {onToggleFavorite ? (
          <span
            role="button"
            tabIndex={favoriteToggleDisabled ? -1 : 0}
            className={cn(
              'ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent transition-colors',
              isFavorite
                ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-400'
                : 'text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground',
              favoriteToggleDisabled
                ? 'cursor-not-allowed opacity-60 pointer-events-none'
                : undefined
            )}
            aria-disabled={favoriteToggleDisabled}
            aria-label={
              isPendingPort
                ? 'Indicator pending port; favorites unavailable'
                : favoriteBusy
                  ? 'Updating favorite state'
                  : isFavorite
                    ? 'Remove from favorites'
                    : 'Add to favorites'
            }
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (favoriteToggleDisabled) {
                return;
              }
              onToggleFavorite(definition.type, !isFavorite);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                if (favoriteToggleDisabled) {
                  return;
                }
                onToggleFavorite(definition.type, !isFavorite);
              }
            }}
          >
            {favoriteBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Star
                className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400' : 'fill-transparent'}`}
              />
            )}
          </span>
        ) : null}
      </Button>
    );
  };

  return (
    <>
    <div className={cn('flex flex-col gap-lg pt-4', className)}>
      <DialogSearchInput
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search indicators by name or description"
      />
      <ScrollArea className="h-[500px]">
        <div className="flex flex-col gap-md">
          {favoriteDefinitions.length > 0 && (
            <section className="space-y-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Favorites
              </h4>
              <div className="grid gap-sm sm:grid-cols-2 sm:auto-rows-fr">
                {favoriteDefinitions.map((definition) =>
                  renderIndicatorButton(definition)
                )}
              </div>
            </section>
          )}
          {popularDefinitions.length > 0 && (
            <section className="space-y-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Popular
              </h4>
              <div className="grid gap-sm sm:grid-cols-2 sm:auto-rows-fr">
                {popularDefinitions.map((definition) =>
                  renderIndicatorButton(definition)
                )}
              </div>
            </section>
          )}
          {Object.entries(groupedIndicators).map(([category, definitions]) => (
            <section key={category} className="space-y-sm">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {titleCase(category)}
              </h4>
              <div className="grid gap-sm sm:grid-cols-2 sm:auto-rows-fr">
                {definitions.map((definition) =>
                  renderIndicatorButton(definition)
                )}
              </div>
            </section>
          ))}
          {resultIsEmpty && (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              {hasAnySupportedIndicators
                ? 'No indicators match the current search.'
                : 'No indicators are available for this action yet.'}
            </div>
          )}
        </div>
        <ScrollBar orientation="vertical" className="rounded-r-xl" />
      </ScrollArea>
    </div>
    <HelpArticleModal slug={docHelpSlug} onClose={() => setDocHelpSlug(null)} />
    </>
  );
};

IndicatorSelector.displayName = 'IndicatorSelector';
