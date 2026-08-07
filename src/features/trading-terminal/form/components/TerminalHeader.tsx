import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useBotFormSelector, useBotFormState } from '@/features/bots';
import {
  BotFormShell,
  NEW_SHELL_DEBUG_FLAG,
} from '@/features/bots/widgets/BotForm';
import {
  DCAOrderTypeEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  type BotChartData,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import type { ExampleOrdersStoreContext } from '@/utils/bots/dca/example-orders-core';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import { useTransformedExchanges } from '@/hooks/useTransformedExchanges';
import { useCallback, useEffect, useMemo } from 'react';

export interface CreateDealProps {
  widgetId?: string;
  onFormDataChange?: (data: BotChartData) => void;
}

const CreateDeal: React.FC<CreateDealProps> = (props) => {
  const { widgetId = 'create-deal', onFormDataChange } = props;
  const { updateFormData, formData } = useBotFormState();
  const terminalDealType = useBotFormSelector('terminalDealType');
  const setActiveTab = useCallback(
    (tab: TerminalDealTypeEnum) => {
      updateFormData('terminalDealType', tab);
    },
    [updateFormData]
  );

  const activeTab = useMemo(
    () =>
      (terminalDealType as TerminalDealTypeEnum) || TerminalDealTypeEnum.smart,
    [terminalDealType]
  );

  // Tab content components
  const tabs = useMemo(
    () => [
      {
        id: TerminalDealTypeEnum.simple,
        label: 'Simple',
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        ),
        description: 'Simple trade, just buy or sell.',
        helpUrl: '/help/trading-terminal-deal-types',
      },
      {
        id: TerminalDealTypeEnum.smart,
        label: 'Smart',
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
            />
          </svg>
        ),
        description:
          'Create an open deal that can be used with TP, SL, or DCA.',
        helpUrl: '/help/trading-terminal-deal-types',
      },
      {
        id: TerminalDealTypeEnum.import,
        label: 'Import',
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>
        ),
        description:
          'Create an open deal for an order that was executed before (sell existing coins, or buy back previously sold coins).',
        helpUrl: '/help/trading-terminal-deal-types',
      },
    ],
    []
  );

  const debugEnabled = useMemo(
    () => import.meta.env[NEW_SHELL_DEBUG_FLAG] === 'true',
    []
  );

  const onChartLineDrag: NonNullable<ExampleOrdersStoreContext['onDrag']> =
    useCallback(
      (price, type, index, meta) => {
        if (type === DCAOrderTypeEnum.tp) {
          updateFormData('useFixedTPPrices', true);
          if (typeof index !== 'undefined' && formData.dca.useMultiTp) {
            const mtp = (formData.dca.multiTp || []).map((tp, i) =>
              i === index ? { ...tp, fixed: `${price}` } : tp
            );
            updateFormData('multiTp', mtp);
          } else {
            updateFormData('fixedTpPrice', `${price}`);
          }
        }
        if (type === DCAOrderTypeEnum.sl) {
          updateFormData('useFixedSLPrices', true);
          if (typeof index !== 'undefined' && formData.dca.useMultiSl) {
            const msl = (formData.dca.multiSl || []).map((sl, i) =>
              i === index ? { ...sl, fixed: `${price}` } : sl
            );
            updateFormData('multiSl', msl);
          } else {
            updateFormData('fixedSlPrice', `${price}`);
          }
        }
        if (type === DCAOrderTypeEnum.limit) {
          updateFormData('baseOrderPrice', `${price}`);
        }
        if (type === DCAOrderTypeEnum.dca && typeof index !== 'undefined') {
          // Update custom DCA fixed price when dragging a DCA order line
          // Preserve all existing properties to avoid clearing other fields
          const custom = (formData.dca.dcaCustom || []).map((o, i) => {
            if (i === index) {
              const prev = meta?.prevPrice;
              const strategy = formData.dca?.strategy;
              let nextStep: string | undefined;
              if (
                typeof prev === 'number' &&
                Number.isFinite(prev) &&
                prev > 0
              ) {
                const stepCalc =
                  strategy === StrategyEnum.short
                    ? Math.abs(((price - prev) / prev) * 100)
                    : Math.abs(((prev - price) / prev) * 100);
                if (Number.isFinite(stepCalc)) {
                  nextStep = stepCalc.toFixed(2);
                }
              }

              // Preserve all existing properties and update both fixed and step (when possible)
              return {
                ...o,
                fixed: `${price}`,
                ...(nextStep ? { step: nextStep } : null),
              };
            }
            return o;
          });
          updateFormData('dcaCustom', custom);
        }
      },
      [
        formData.dca.useMultiTp,
        formData.dca.useMultiSl,
        updateFormData,
        formData.dca.multiTp,
        formData.dca.multiSl,
        formData.dca.dcaCustom,
        formData.dca.strategy,
      ]
    );

  useEffect(() => {
    if (formData.terminal) {
      exampleOrdersStore.setContext({ onDrag: onChartLineDrag });
    }
  }, [formData.terminal, onChartLineDrag]);

  // Legacy parity (index.tsx:1257-1279): the terminal must always have a pair
  // selected. When the selected exchange has loaded pairs but none is chosen
  // (fresh load, or the previous pair was dropped as unsupported on a new
  // exchange), default to BTC against USDT/USDC/USD, falling back to the first
  // available pair. Runs at the terminal level so it also fires in Quick mode,
  // where the basic-tab pair logic isn't mounted.
  const { exchanges } = useTransformedExchanges();
  const { pairsByExchange } = useTradingPairsFromContext();
  const exchangeProvider = useMemo(
    () => exchanges.find((e) => e.id === formData.exchangeUUID)?.provider,
    [exchanges, formData.exchangeUUID]
  );
  useEffect(() => {
    if (!formData.terminal || !exchangeProvider) {
      return;
    }
    const current = Array.isArray(formData.pair) ? formData.pair : [];
    if (current.length > 0) {
      return;
    }
    const providerKey = Object.keys(pairsByExchange ?? {}).find(
      (k) => k.toUpperCase() === exchangeProvider.toUpperCase()
    );
    const available = providerKey ? pairsByExchange[providerKey] : undefined;
    if (!available || available.length === 0) {
      return;
    }
    // Prefer BTC against the most liquid/owned quote first (USDT > USDC > USD)
    // rather than whichever happens to appear first.
    let preferred;
    for (const quotePref of ['USDT', 'USDC', 'USD']) {
      preferred = available.find(
        (p) =>
          p.baseAsset?.name?.toUpperCase?.() === 'BTC' &&
          p.quoteAsset?.name?.toUpperCase?.() === quotePref
      );
      if (preferred) {
        break;
      }
    }
    const chosen = preferred ?? available[0];
    const base = chosen.baseAsset?.name?.toUpperCase?.();
    const quote = chosen.quoteAsset?.name?.toUpperCase?.();
    if (!base || !quote) {
      return;
    }
    updateFormData('pair', [`${base}${quote}`]);
  }, [
    formData.terminal,
    formData.pair,
    exchangeProvider,
    pairsByExchange,
    updateFormData,
  ]);

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Tab Navigation - Terminal Deal Type Tabs (Simple, Smart, Import) */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TerminalDealTypeEnum)}
          className="shrink-0"
          paramKey="dealType"
          paramSync={true}
        >
          {/* Tabs wrapper - keep minimal layout, rely on defaults for styling */}
          <div className="px-sm">
            <div className="flex-1 overflow-x-auto">
              <TabsList variant="outlined" disableDropdown>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} variant="outlined">
                    <span className="flex items-center gap-xs">
                      {tab.icon}
                      {tab.label}
                      <Tooltip
                        tooltip={tab.description}
                        tooltipURL={tab.helpUrl}
                      >
                        <InfoIcon className="ml-1" />
                      </Tooltip>
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>
        </Tabs>

        {/* Tab Content with proper scrolling */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <BotFormShell
            widgetId={widgetId}
            mode="create"
            defaultTab="basic"
            debug={debugEnabled}
            variant="panel"
            terminal={true}
            tabDescriptorsFilter={
              activeTab === 'simple' ? (d) => d.id === 'basic' : undefined
            }
            onFormDataChange={onFormDataChange}
          />
        </div>
      </div>
    </>
  );
};

export type { CreateDealHandle } from '@/components/widgets/trading/CreateDeal/types';

export default CreateDeal;
