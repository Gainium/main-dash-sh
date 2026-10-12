import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { parseHelpUrl, Tooltip } from '@/components/ui/tooltip';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorEnum } from '@/types';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import { buildIndicatorSummary } from '@/utils/indicators/indicatorFormatting';
import { ChevronDown, Star, Trash2 } from 'lucide-react';
import React from 'react';

interface IndicatorListProps {
  indicators: IndicatorConfig[];
  onEdit?: (indicator: IndicatorConfig) => void;
  onRemove?: (id: string) => void;
  onSelectType?: (indicator: IndicatorConfig) => void;
  /** Star an indicator as a favorite, keeping its current settings. */
  onToggleFavorite?: (indicator: IndicatorConfig) => void;
  isFavorite?: (type: IndicatorEnum) => boolean;
  emptyState?: string;
  renderExtras?: (indicator: IndicatorConfig, index: number) => React.ReactNode;
}

export const IndicatorList: React.FC<IndicatorListProps> = ({
  indicators,
  onEdit,
  onRemove,
  emptyState,
  renderExtras,
  onSelectType,
  onToggleFavorite,
  isFavorite,
}) => {
  const [helpSlug, setHelpSlug] = React.useState<string | null>(null);
  // Settings start folded: the summary line already says what each
  // indicator is set to, so the full form only opens on demand.
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set()
  );
  const toggleExpanded = (uuid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  if (!indicators.length) {
    return (
      <div className="rounded-lg bg-muted p-md text-sm text-muted-foreground text-center">
        {emptyState ?? 'No indicators configured yet.'}
      </div>
    );
  }

  return (
    <>
    <MasonryLayout
      gap={16}
      // Never more columns than indicators: one indicator uses the full
      // width instead of leaving an empty column beside it.
      containerBreakpoints={{
        default: 1,
        640: Math.min(2, indicators.length),
        1024: Math.min(3, indicators.length),
      }}
    >
      {indicators.map((indicator, index) => {
        const definition = getIndicatorDefinition(indicator.type);
        const summary = buildIndicatorSummary(definition, indicator);
        const documentationUrl = definition.documentationUrl;
        const isExpanded = expanded.has(indicator.uuid);

        return (
          <div
            key={indicator.uuid}
            className="space-y-md rounded-lg bg-muted p-md"
          >
            <div className="flex items-start justify-between gap-sm">
              <div className="min-w-0 space-y-xs">
                <div className="flex flex-wrap items-center gap-xs">
                  <h4 className="text-sm font-semibold leading-none sm:text-base">
                    {definition.label}
                  </h4>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase tracking-wide text-secondary-foreground">
                    {definition.category}
                  </span>
                </div>
                {summary.length > 0 ? (
                  renderExtras ? (
                    <button
                      type="button"
                      className="text-left text-xs text-muted-foreground hover:text-foreground sm:text-sm"
                      onClick={() => toggleExpanded(indicator.uuid)}
                    >
                      {summary.join(' · ')}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground sm:text-sm">
                      {summary.join(' · ')}
                    </p>
                  )
                ) : null}
                {documentationUrl && parseHelpUrl(documentationUrl).helpSlug ? (
                  <button
                    type="button"
                    className="inline-flex items-center text-xs font-medium text-primary transition hover:text-primary/80 hover:underline"
                    onClick={() => setHelpSlug(parseHelpUrl(documentationUrl).helpSlug)}
                  >
                    Learn more
                  </button>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-xs">
                <div className="flex items-center gap-xs">
                {renderExtras ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleExpanded(indicator.uuid)}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? 'Hide indicator settings'
                        : 'Edit indicator settings'
                    }
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </Button>
                ) : null}
                {onToggleFavorite ? (
                  <Tooltip
                    tooltip={
                      isFavorite?.(indicator.type)
                        ? 'Remove from favorites'
                        : 'Save as favorite with these settings'
                    }
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={
                        isFavorite?.(indicator.type)
                          ? 'text-yellow-400 hover:text-yellow-400'
                          : 'text-muted-foreground'
                      }
                      onClick={() => onToggleFavorite(indicator)}
                      aria-label={
                        isFavorite?.(indicator.type)
                          ? 'Remove from favorites'
                          : 'Save as favorite'
                      }
                    >
                      <Star
                        className={`h-4 w-4 ${isFavorite?.(indicator.type) ? 'fill-yellow-400' : 'fill-transparent'}`}
                      />
                    </Button>
                  </Tooltip>
                ) : null}
                {onRemove ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRemove(indicator.uuid)}
                    aria-label="Remove indicator"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
                </div>
                {onSelectType ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectType(indicator)}
                  >
                    Change indicator
                  </Button>
                ) : null}
                {onEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(indicator)}
                  >
                    Edit indicator
                  </Button>
                ) : null}
              </div>
            </div>

            {renderExtras && isExpanded ? (
              <div className="pt-xs">
                {renderExtras(indicator, index)}
              </div>
            ) : null}
          </div>
        );
      })}
    </MasonryLayout>
    <HelpArticleModal slug={helpSlug} onClose={() => setHelpSlug(null)} />
    </>
  );
};

IndicatorList.displayName = 'IndicatorList';
