import { Button } from '@/components/ui/button';
import { HelpArticlePill } from '@/components/ui/HelpArticlePill';
import { TestedSettingsButton } from '@/components/indicators/IndicatorEdgeControls';
import { parseHelpUrl, Tooltip } from '@/components/ui/tooltip';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import { LogicPill } from '@/components/indicators/LogicPill';
import { cn } from '@/lib/utils';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorEnum } from '@/types';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import type { EdgeApplyRequest } from '@/utils/indicators/edgeApply';
import type { EdgeSide } from '@/utils/indicatorEdge';
import { buildIndicatorSummary } from '@/utils/indicators/indicatorFormatting';
import { Pencil, Star, Trash2 } from 'lucide-react';
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
  /** The AND/OR drawn between consecutive indicators. */
  connector?: { logic: string | undefined; onToggle?: () => void };
  /**
   * Row surface. 'raised' fills rows one step above their card;
   * 'inset' puts them back on the card surface, for rows inside a group
   * that is itself the fill.
   */
  surface?: 'raised' | 'inset';
  /**
   * Apply a tested setting (the open editor's "Tested" picker) to that
   * indicator. Without it the picker is not offered.
   */
  onApplyEdgeSetting?: (
    indicator: IndicatorConfig,
    request: EdgeApplyRequest
  ) => void;
  /** The side these conditions trade in the bot, for the tested settings. */
  edgeSide?: EdgeSide | null;
}

/**
 * Indicators as compact rows: name and a one-line summary. The whole row
 * (or its "Edit" button) opens the settings inline; one row is open at a
 * time so the list stays short.
 */
export const IndicatorList: React.FC<IndicatorListProps> = ({
  indicators,
  onEdit,
  onRemove,
  emptyState,
  renderExtras,
  onSelectType,
  onToggleFavorite,
  isFavorite,
  connector,
  surface = 'raised',
  onApplyEdgeSetting,
  edgeSide = null,
}) => {
  const [helpSlug, setHelpSlug] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (!indicators.length) {
    return (
      <div className="rounded-lg bg-muted p-md text-sm text-muted-foreground text-center">
        {emptyState ?? 'No indicators configured yet.'}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col">
        {indicators.map((indicator, index) => {
          const definition = getIndicatorDefinition(indicator.type);
          const summary = buildIndicatorSummary(definition, indicator);
          const helpSlug = definition.documentationUrl
            ? parseHelpUrl(definition.documentationUrl).helpSlug
            : null;
          const isOpen = !!renderExtras && openId === indicator.uuid;
          const favorite = isFavorite?.(indicator.type) ?? false;
          const open = renderExtras
            ? () => setOpenId(isOpen ? null : indicator.uuid)
            : onEdit
              ? () => onEdit(indicator)
              : undefined;
          const stop = (event: React.SyntheticEvent) => event.stopPropagation();

          return (
            <React.Fragment key={indicator.uuid}>
              {index > 0 && connector ? (
                <LogicPill
                  logic={connector.logic}
                  onToggle={connector.onToggle}
                />
              ) : null}
              <div
                // No border: the surface step separates the row from its
                // container (DESIGN_SYSTEM §2-3). The inner fill, like a
                // toggle group's track; inside a group (itself the fill) the
                // rows take the card surface, like a toggle's selected item.
                className={cn(
                  'min-w-0 rounded-lg transition-colors',
                  surface === 'raised' ? 'bg-muted' : 'bg-card'
                )}
              >
                {/* Mouse: anywhere on the row opens it. Keyboard and screen
                    readers use the labelled Edit button, so the row itself
                    is not a second (nested) button. */}
                <div
                  data-indicator-row={indicator.type}
                  onClick={open}
                  // Name and full summary on the first row; the actions get a
                  // row of their own so they never cut the summary short.
                  className={cn(
                    'flex flex-col gap-sm px-md py-sm',
                    open && 'cursor-pointer rounded-lg hover:bg-accent/40'
                  )}
                >
                  <div className="min-w-0" title={definition.label}>
                    <div className="truncate text-sm font-semibold">
                      {definition.shortLabel || definition.label}
                    </div>
                    {summary.length > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {summary.join(' · ')}
                      </div>
                    ) : null}
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-end gap-xs"
                    onClick={stop}
                  >
                    {isOpen && onSelectType ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelectType(indicator)}
                      >
                        Change indicator
                      </Button>
                    ) : null}
                    {isOpen && onApplyEdgeSetting ? (
                      <TestedSettingsButton
                        definition={definition}
                        interval={indicator.indicatorInterval}
                        side={edgeSide}
                        onApply={(request) =>
                          onApplyEdgeSetting(indicator, request)
                        }
                      />
                    ) : null}
                    {open ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={isOpen ? 'default' : 'ghost'}
                        onClick={open}
                      >
                        {isOpen ? (
                          'Done'
                        ) : (
                          <>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </>
                        )}
                      </Button>
                    ) : onSelectType ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onSelectType(indicator)}
                      >
                        Change indicator
                      </Button>
                    ) : null}
                    {onToggleFavorite ? (
                      <Tooltip
                        tooltip={
                          favorite
                            ? 'Remove from favorites'
                            : 'Save as favorite with these settings'
                        }
                      >
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={
                            favorite
                              ? 'text-yellow-400 hover:text-yellow-400'
                              : 'text-muted-foreground'
                          }
                          onClick={() => onToggleFavorite(indicator)}
                          aria-label={
                            favorite
                              ? 'Remove from favorites'
                              : 'Save as favorite'
                          }
                        >
                          <Star
                            className={`h-4 w-4 ${favorite ? 'fill-yellow-400' : 'fill-transparent'}`}
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
                </div>

                {isOpen ? (
                  <div className="space-y-sm px-md pb-md pt-xs">
                    {helpSlug ? (
                      <div>
                        <HelpArticlePill
                          url={definition.documentationUrl}
                          onActivate={setHelpSlug}
                        />
                      </div>
                    ) : null}
                    {renderExtras?.(indicator, index)}
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <HelpArticleModal slug={helpSlug} onClose={() => setHelpSlug(null)} />
    </>
  );
};

IndicatorList.displayName = 'IndicatorList';
