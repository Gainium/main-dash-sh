import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { parseHelpUrl } from '@/components/ui/tooltip';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import { buildIndicatorSummary } from '@/utils/indicators/indicatorFormatting';
import { Trash2 } from 'lucide-react';
import React from 'react';

interface IndicatorListProps {
  indicators: IndicatorConfig[];
  onEdit?: (indicator: IndicatorConfig) => void;
  onRemove?: (id: string) => void;
  onSelectType?: (indicator: IndicatorConfig) => void;
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
}) => {
  const [helpSlug, setHelpSlug] = React.useState<string | null>(null);
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
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {summary.join(' · ')}
                  </p>
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

            {renderExtras ? (
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
