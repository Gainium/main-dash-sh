import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PortfolioContext } from '../../../contexts/PortfolioContext';
import { useTransformedExchangesFromContext } from '../../../contexts/ExchangeDataContext';
import { ListModal } from './ListModal';
import { FilterSection, type FilterItem } from './WidgetFilterArea';

/** Profit rows only carry their exchange from the release that added it. */
export const PROFIT_EXCHANGE_FILTER_TOOLTIP =
  'Profit made before per-exchange tracking was added counts only toward All exchanges.';

interface Options {
  /** Persisted selection — exchange UUIDs, or `['ALL']`. */
  selectedExchanges: string[];
  setSelectedExchanges: (value: string[]) => void;
  /** Tooltip on the "Exchanges" filter title. */
  tooltip?: string;
}

/**
 * Exchange picker for a widget's filter area: the same chips + list dialog the
 * portfolio widgets use, kept in step with the page-level selection when a
 * <PortfolioProvider> is mounted.
 *
 * `exchangeUUIDs` is `undefined` while "All exchanges" is selected, so callers
 * can leave the field out of a query entirely in that case.
 */
export function useWidgetExchangeFilter({
  selectedExchanges,
  setSelectedExchanges,
  tooltip,
}: Options) {
  const { exchanges } = useTransformedExchangesFromContext();
  const portfolioContext = useContext(PortfolioContext);
  const [showDialog, setShowDialog] = useState(false);

  const select = useCallback(
    (next: string[]) => {
      const value = next.length ? next : ['ALL'];
      setSelectedExchanges(value);
      portfolioContext?.setSelectedExchanges(value);
    },
    [setSelectedExchanges, portfolioContext],
  );

  // Follow the page-level selection (Overview / Portfolio pages).
  const contextSelection = portfolioContext?.selectedExchanges;
  useEffect(() => {
    if (!contextSelection) return;
    const same =
      contextSelection.length === selectedExchanges.length &&
      contextSelection.every((v, i) => v === selectedExchanges[i]);
    if (!same) setSelectedExchanges(contextSelection);
  }, [contextSelection, selectedExchanges, setSelectedExchanges]);

  const handleToggle = useCallback(
    (id: string) => {
      if (id === 'ALL') {
        if (!(
          selectedExchanges.includes('ALL') && selectedExchanges.length === 1
        )) {
          select(['ALL']);
        }
        return;
      }
      if (selectedExchanges.includes(id)) {
        select(selectedExchanges.filter((e) => e !== id));
      } else {
        select([...selectedExchanges.filter((e) => e !== 'ALL'), id]);
      }
    },
    [selectedExchanges, select],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (id === 'ALL' && selectedExchanges.length === 1) return;
      select(selectedExchanges.filter((e) => e !== id));
    },
    [selectedExchanges, select],
  );

  const filterItems: FilterItem[] = useMemo(
    () =>
      exchanges
        .filter((exchange) => exchange.id !== 'ALL')
        .map((exchange) => ({
          id: exchange.id,
          name: exchange.name,
          icon: exchange.icon,
          color: exchange.color || '#64748b',
          isExchange: true,
        })),
    [exchanges],
  );

  const modalItems = useMemo(
    () => [
      {
        symbol: 'ALL',
        name: 'All Exchanges',
        icon: '🏢',
        color: '#3b82f6',
        isExchange: true,
      },
      ...exchanges
        .filter((exchange) => exchange.id !== 'ALL')
        .map((exchange) => ({
          symbol: exchange.id,
          name: exchange.name,
          icon: exchange.icon,
          color: exchange.color || '#64748b',
          subtitle: exchange.provider,
          isExchange: true,
        })),
    ],
    [exchanges],
  );

  const filtersActive = !selectedExchanges.includes('ALL');

  const exchangeUUIDs = useMemo(
    () => (filtersActive ? selectedExchanges : undefined),
    [filtersActive, selectedExchanges],
  );

  const clearFilters = useCallback(() => select(['ALL']), [select]);

  const filterContent = useMemo(
    () => (
      <div className="space-y-md">
        <FilterSection
          title="Exchanges"
          selectedItems={selectedExchanges}
          availableItems={filterItems}
          onItemRemove={handleRemove}
          onShowDialog={() => setShowDialog(true)}
          addButtonText="Add exchanges"
          showAllOption={true}
          {...(tooltip ? { tooltip } : {})}
        />
        <ListModal
          isOpen={showDialog}
          onClose={() => setShowDialog(false)}
          title="Select Exchanges"
          items={modalItems}
          selectedItems={selectedExchanges}
          onItemToggle={handleToggle}
          searchPlaceholder="Search exchanges..."
        />
      </div>
    ),
    [
      selectedExchanges,
      filterItems,
      handleRemove,
      tooltip,
      showDialog,
      modalItems,
      handleToggle,
    ],
  );

  return { exchangeUUIDs, filtersActive, clearFilters, filterContent };
}
