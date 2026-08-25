import { clsx } from 'clsx';
import React from 'react';
import CoinIcon from './CoinIcon';
import ExchangeIcon from './ExchangeIcon';

export interface WidgetFilterAreaProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

// Generic filter item interface
export interface FilterItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  subtitle?: string;
  isExchange?: boolean; // Flag to determine if it's an exchange or coin
  isBotType?: boolean; // Flag to determine if it's a bot type
}

// Props for the generic filter section
export interface FilterSectionProps {
  title: string;
  selectedItems: string[];
  availableItems: FilterItem[];
  onItemRemove: (itemId: string) => void;
  onShowDialog: () => void;
  addButtonText?: string;
  showAllOption?: boolean;
  renderIcon?: (item: FilterItem) => React.ReactNode; // Custom icon renderer
}

// Generic filter section component
export const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  selectedItems,
  availableItems,
  onItemRemove,
  onShowDialog,
  addButtonText = 'Add items',
  showAllOption = true,
  renderIcon,
}) => {
  return (
    <div>
      <h4 className="text-sm font-medium text-foreground mb-3">{title}</h4>
      <div className="flex flex-wrap gap-xs">
        {/* Display all selected items including "ALL" */}
        {selectedItems.map((itemId) => {
          // Handle "ALL" option
          if (itemId === 'ALL' && showAllOption) {
            return (
              <div
                key="ALL"
                className="bg-card rounded-lg p-xs flex items-center gap-xs min-w-0"
              >
                <div className="flex items-center gap-xs flex-1 min-w-0">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs bg-blue-500">
                    <span className="text-primary-foreground text-xs">🌐</span>
                  </div>
                  <span className="text-foreground text-xs font-medium truncate">
                    All {title.toLowerCase()}
                  </span>
                </div>
                {/* Only show X button if there are other selections */}
                {selectedItems.length > 1 && (
                  <button
                    onClick={() => onItemRemove('ALL')}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>
            );
          }

          // Handle individual items
          const item = availableItems.find((i) => i.id === itemId);
          if (!item) return null;

          return (
            <div
              key={itemId}
              className="bg-card rounded-lg p-xs flex items-center gap-xs min-w-0"
            >
              <div className="flex items-center gap-xs flex-1 min-w-0">
                {renderIcon ? (
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: item.color
                        ? item.color + '20'
                        : undefined,
                      color: item.color || undefined,
                    }}
                  >
                    {renderIcon(item)}
                  </div>
                ) : (
                  <>
                    {item.icon && item.isExchange && (
                      <ExchangeIcon icon={item.icon} size="w-3 h-3" />
                    )}
                    {!item.isExchange && !item.isBotType && (
                      <CoinIcon symbol={item.id} size="w-3 h-3" />
                    )}
                  </>
                )}
                <span className="text-foreground text-xs font-medium truncate">
                  {item.name}
                </span>
              </div>
              <button
                onClick={() => onItemRemove(itemId)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          );
        })}

        {/* Add Button */}
        <button
          onClick={onShowDialog}
          className="rounded-lg p-xs flex items-center gap-xs text-muted-foreground hover:text-foreground bg-card hover:bg-accent transition-all"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs">{addButtonText}</span>
        </button>
      </div>
    </div>
  );
};

// Generic selection dialog component
export interface SelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: FilterItem[];
  selectedItems: string[];
  onItemToggle: (itemId: string) => void;
  showAllOption?: boolean;
  renderIcon?: (item: FilterItem) => React.ReactNode; // Custom icon renderer
}

export const SelectionDialog: React.FC<SelectionDialogProps> = ({
  isOpen,
  onClose,
  title,
  items,
  selectedItems,
  onItemToggle,
  showAllOption = true,
  renderIcon,
}) => {
  if (!isOpen) return null;

  const allItems: FilterItem[] = showAllOption
    ? [
        {
          id: 'ALL',
          name: `All ${title}`,
          icon: '🌐',
          color: 'var(--color-primary)',
          ...(items[0]?.isBotType && { isBotType: true }),
        },
        ...items,
      ]
    : items;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-popover rounded-lg shadow-2xl p-md w-80 max-h-96 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold">Select {title}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-xs">
          {allItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-sm rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => onItemToggle(item.id)}
            >
              <div className="flex items-center gap-sm">
                {renderIcon ? (
                  renderIcon(item)
                ) : (
                  <div
                    className={`w-8 h-8 flex items-center justify-center ${item.isExchange || item.isBotType ? 'rounded-lg' : 'rounded-full'}`}
                    style={{
                      backgroundColor: item.color
                        ? item.color + '20'
                        : 'var(--color-muted)',
                      color: item.color || 'var(--color-muted-foreground)',
                    }}
                  >
                    {item.icon && item.isExchange && (
                      <ExchangeIcon icon={item.icon} size="w-6 h-6" />
                    )}
                    {!item.isExchange && !item.isBotType && (
                      <CoinIcon symbol={item.id} size="w-6 h-6" />
                    )}
                  </div>
                )}
                <div>
                  <div className="text-foreground font-medium text-sm">
                    {item.name}
                  </div>
                  {item.subtitle && (
                    <div className="text-muted-foreground text-xs">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>
              {selectedItems.includes(item.id) && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const WidgetFilterArea: React.FC<WidgetFilterAreaProps> = ({
  isOpen,
  children,
  className,
}) => {
  return (
    <div
      className={clsx(
        'overflow-hidden transition-all duration-300 ease-in-out',
        isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
      )}
    >
      <div
        className={clsx('bg-inner-container rounded-t-lg p-md mx-4', className)}
        style={{ paddingTop: '5px' }}
      >
        {children}
      </div>
    </div>
  );
};

export default WidgetFilterArea;
