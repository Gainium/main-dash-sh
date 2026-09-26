/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/lib/loggerInstance';
import { createDynamicPriceFormatter } from '@/lib/utils';
import {
  useTradingViewStore,
  type ChartMetaInfo,
} from '@/stores/tradingViewStore';
import { useResolvedTheme } from '@/stores/visualSettingsStore';
import { custom_indicators_getter as getCustomIndicators } from '@/utils/tradingView/customIndicators.js';
import { createDatafeed } from '@/utils/tradingViewDatafeed';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCSSVar } from '../../../../lib/utils/chart';
import {
  CHART_READY_WATCHDOG_MS,
  canRecoverWithoutReady,
  collectChartStallDiagnostics,
  reportChartStall,
} from './chartReadyWatchdog';
import { replayMissedInnerWindowLoad } from './innerWindowLoadReplay';
import { ZustandSaveLoadAdapter } from './TradingViewSaveLoadAdapter';
import { getCustomThemeColors } from './themeColors';
import type { TradingViewWidgetInstance } from './types';

interface WindowWithTradingView extends Window {
  TradingView?: { widget: new (config: unknown) => TradingViewWidgetInstance };
}

interface InitParams {
  initialSymbol: string;
  initialInterval: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onChartReady?: (() => void) | undefined;
  onVisibleRange?: ((range?: { from: number; to: number }) => void) | undefined;
  onSymbolChange?: ((s: string) => void) | undefined;
  onIntervalChange?: ((i: string) => void) | undefined;
  /**
   * Force enabling TradingView native auto-save even if symbol contains special markers
   * (e.g. ManualBacktesting). Default: true.
   */
  enableAutoSave?: boolean;
  /**
   * Force enabling load_last_chart even if symbol contains special markers. Default: true.
   */
  enableLoadLastChart?: boolean;
  /**
   * Enable separate drawings storage featureset so our adapter persists user drawings.
   * Default: true.
   */
  enableSeparateDrawingsStorage?: boolean;
  initialLayoutId?: string | null;
  initialLayoutName?: string | null;
  layoutPersistenceKey?: string | undefined;
  onLayoutChange?: (
    layout: { id: string; name?: string | null } | null
  ) => void;
  // Initial timeframe to show when chart first loads (UNIX timestamps in seconds)
  initialTimeframe?: { from: number; to: number };
  /**
   * Stable callback invoked by custom indicators when their `useCallback`
   * flag is set on the chart config. Receives the latest indicator value
   * and the source indicator's uuid. Filtering for the `useCallback` flag
   * happens in TradingViewChart's wrapper; this hook just threads the
   * callable through to `custom_indicators_getter`.
   */
  indicatorValueCallback?: (value: number, id: string) => void;
  /**
   * Custom datafeed for this chart instance. When omitted, the shared
   * live createDatafeed() is used. Cloud manual-backtesting injects its
   * own fully-independent IBasicDataFeed here.
   */
  datafeed?: import('@/utils/tradingView/types').IBasicDataFeed;
}

const tvTimezones = [
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Caracas',
  'America/Chicago',
  'America/El_Salvador',
  'America/Juneau',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Almaty',
  'Asia/Ashkhabad',
  'Asia/Bahrain',
  'Asia/Bangkok',
  'Asia/Chongqing',
  'Asia/Dubai',
  'Asia/Ho_Chi_Minh',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Kuwait',
  'Asia/Manila',
  'Asia/Muscat',
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/ACT',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Belgrade',
  'Europe/Berlin',
  'Europe/Bratislava',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Luxembourg',
  'Europe/Madrid',
  'Europe/Malta',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Riga',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Tallinn',
  'Europe/Vilnius',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Fakaofo',
  'Pacific/Honolulu',
  'Pacific/Norfolk',
  'US/Mountain',
];

export function useInitializeWidget({
  initialSymbol,
  initialInterval,
  containerRef,
  onChartReady,
  onVisibleRange,
  onSymbolChange,
  onIntervalChange,
  enableAutoSave = true,
  enableLoadLastChart = true,
  enableSeparateDrawingsStorage = true,
  initialLayoutId = null,
  initialLayoutName = null,
  layoutPersistenceKey,
  onLayoutChange,
  initialTimeframe,
  indicatorValueCallback,
  datafeed: datafeedProp,
}: InitParams) {
  const widgetRef = useRef<TradingViewWidgetInstance | null>(null);
  const isInitializedRef = useRef(false);
  const currentTheme = useResolvedTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);
  // Set by the chart-ready watchdog when the chart neither became ready nor
  // could be recovered; the overlay then offers a retry instead of spinning.
  const [stalled, setStalled] = useState(false);
  // Bumped by retry() to tear the widget down and build a fresh one.
  const [attempt, setAttempt] = useState(0);
  const retryingRef = useRef(false);
  const layoutStateRef = useRef<{ id: string | null; name: string | null }>({
    id: initialLayoutId ?? null,
    name: initialLayoutName ?? null,
  });

  useEffect(() => {
    if (isInitializedRef.current) return;
    retryingRef.current = false;
    let isMounted = true;
    const containerElement = containerRef.current;
    let readyHandled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let stopLoadReplay: () => void = () => undefined;
    // What TradingView restored through `load_last_chart` before it became
    // ready — reported by the watchdog, since a stored layout is per-browser.
    let bootLayout: {
      symbol: string | null;
      resolution: string | null;
    } | null = null;

    const emitLayoutChange = (
      layout: { id: string; name?: string | null } | null
    ) => {
      const nextId = layout?.id ?? null;
      const rawName = layout?.name ?? null;
      const current = layoutStateRef.current;
      const resolvedName =
        rawName && rawName.length > 0 ? rawName : (current.name ?? null);

      const hasChanged =
        current.id !== nextId ||
        current.name !== (nextId ? resolvedName : null);

      layoutStateRef.current = {
        id: nextId,
        name: nextId ? resolvedName : null,
      };

      if (!hasChanged) return;

      if (nextId) {
        onLayoutChange?.({ id: nextId, name: resolvedName ?? null });
      } else {
        onLayoutChange?.(null);
      }
    };

    const resolveLayoutMeta = async (
      layoutId: string | null | undefined
    ): Promise<ChartMetaInfo | null> => {
      if (!layoutId) return null;
      try {
        const store = useTradingViewStore.getState();
        const charts = await store.getAllCharts(layoutPersistenceKey);
        return charts.find((chart) => chart.id === layoutId) ?? null;
      } catch (err) {
        logger.warn('TradingView layout metadata load failed:', err);
        return null;
      }
    };

    const tryLoadLayout = async (
      tvWidget: TradingViewWidgetInstance,
      candidateId: string | null | undefined
    ): Promise<boolean> => {
      if (!candidateId) return false;
      const meta = await resolveLayoutMeta(candidateId);
      if (!meta || typeof tvWidget.loadChartFromServer !== 'function') {
        return false;
      }
      try {
        await tvWidget.loadChartFromServer(meta);
        emitLayoutChange({ id: meta.id, name: meta.name ?? null });
        useTradingViewStore.getState().setLastSavedLayoutId(meta.id);
        return true;
      } catch (err) {
        logger.warn('TradingView layout load failed:', err);
        return false;
      }
    };

    const loadLibrary = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const existing = (window as unknown as WindowWithTradingView)
          .TradingView;
        if (existing?.widget) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = '/static/charting_library/charting_library.standalone.js';
        script.async = false;
        script.onload = () => {
          let attempts = 0;
          const maxAttempts = 10;
          const check = () => {
            attempts++;
            const loaded = (window as unknown as WindowWithTradingView)
              .TradingView;
            if (loaded?.widget) resolve();
            else if (attempts < maxAttempts) setTimeout(check, 200);
            else
              reject(new Error('TradingView library components not available'));
          };
          check();
        };
        script.onerror = () =>
          reject(new Error('Failed to load TradingView charting library'));
        document.head.appendChild(script);
      });
    const findOffset = (timeZone?: string) => {
      const tzone =
        timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

      const date = new Date();
      const tz = new Date()
        .toLocaleString('en', {
          timeZone: tzone,
          timeStyle: 'long',
        })
        .split(' ')
        .slice(-1)[0];
      const diff =
        (Date.parse(`${date} UTC`) - Date.parse(`${date} ${tz}`)) /
        (60 * 60 * 1000);
      return diff;
    };
    const findTimezone = () => {
      const fallback = 'Etc/UTC';
      const userOffset = findOffset();
      for (const t of tvTimezones) {
        if (findOffset(t) === userOffset) {
          return t;
        }
      }
      return fallback;
    };
    const init = async () => {
      if (!containerElement || !document.contains(containerElement)) return;
      setIsLoading(true);
      setError(null);
      await loadLibrary();
      if (!isMounted) return;
      const TradingView = (window as unknown as WindowWithTradingView)
        .TradingView;
      if (!TradingView?.widget)
        throw new Error('TradingView library not properly loaded');

      const saveLoadAdapter = new ZustandSaveLoadAdapter(
        {
          onLayoutSaved: (layout: { id: string; name?: string | null }) => {
            if (!layout?.id) return;
            emitLayoutChange({ id: layout.id, name: layout.name ?? null });
            useTradingViewStore
              .getState()
              .setLastSavedLayoutId(layout.id, layoutPersistenceKey);
          },
          onLayoutLoaded: (layout: {
            id: string;
            name?: string | null;
            symbol?: string | null;
            resolution?: string | null;
          }) => {
            if (!layout?.id) return;
            if (!readyHandled) {
              bootLayout = {
                symbol: layout.symbol ?? null,
                resolution: layout.resolution ?? null,
              };
            }
            emitLayoutChange({ id: layout.id, name: layout.name ?? null });
            useTradingViewStore
              .getState()
              .setLastSavedLayoutId(layout.id, layoutPersistenceKey);
          },
        },
        layoutPersistenceKey
      );

      const datafeed = datafeedProp ?? createDatafeed();
      const lightThemeColors = getCustomThemeColors('light');
      const darkThemeColors = getCustomThemeColors('dark');

      // Match the TradingView pane to the surrounding card surface so the
      // chart doesn't show a different background than the card it sits in.
      const cardColor = getCSSVar('--color-card');
      const borderColor = getCSSVar('--color-border');

      logger.info('[JournalEntryChart] Creating TradingView widget', {
        symbol: initialSymbol,
        interval: initialInterval,
        hasInitialTimeframe: !!initialTimeframe,
        initialTimeframe: initialTimeframe
          ? {
              from: initialTimeframe.from,
              to: initialTimeframe.to,
              fromDate: new Date(initialTimeframe.from * 1000).toISOString(),
              toDate: new Date(initialTimeframe.to * 1000).toISOString(),
            }
          : null,
        enableLoadLastChart,
        enableAutoSave,
      });

      const widgetConfig = {
        timezone: findTimezone(),
        autosize: true,
        symbol: initialSymbol,
        interval: initialInterval,
        container: containerElement,
        datafeed,
        library_path: '/static/charting_library/',
        locale: 'en',
        theme: currentTheme === 'dark' ? 'dark' : 'light',
        allow_symbol_change: true,
        details: false,
        hotlist: false,
        calendar: false,
        load_last_chart: enableLoadLastChart,
        // auto_save_delay: 5 triggers native auto-save; 0 disables
        auto_save_delay: enableAutoSave ? 5 : 0,
        ...(initialTimeframe ? { timeframe: initialTimeframe } : {}),
        disabled_features: [
          'use_localstorage_for_settings',
          'volume_force_overlay',
          'create_volume_indicator_by_default',
          'create_volume_indicator_by_default_once',
          // Disable TradingView's built-in Google Analytics usage telemetry
          // (gated on featureset '14851' inside library.js — it loads
          // analytics.js / UA-112911840-1 for ~2% of chart loads). We use
          // PostHog exclusively, so opt out of Google Analytics entirely.
          '14851',
        ],
        enabled_features: [
          // In TV CL v28.5 the chunk that reads `disabledFeatures` / `enabledFeatures`
          // pulls them from `window.location.search` of the iframe — which is
          // only populated when the iframe is loaded via `sameorigin.html`.
          // Without this flag, the iframe is built inline and the chunk throws
          // "Cannot read properties of undefined (reading 'disabledFeatures')"
          // during init, leaving the widget stuck on "Loading chart…".
          'iframe_loading_same_origin',
          'study_templates',
          'chart_template_storage',
          'snapshot_trading_drawings',
          'support_multicharts',
          'trading_account_manager',
          'chart_crosshair_menu',
          'contextual_menus',
          'items_favoriting',
          'order_panel',
          'order_line_modification',
          'modify_order_line',
          'drag_order_lines',
          'move_logo_to_main_pane',
          'use_resolution_as_symbol_search_prefix',
          // Mobile touch support for order lines and zoom/move controls
          'show_zoom_and_move_buttons_on_touch',
          ...(enableSeparateDrawingsStorage
            ? ['saveload_separate_drawings_storage']
            : []),
          //'charting_library_debug_mode',
        ],
        //debug: true,
        custom_indicators_getter: (pineJs: unknown) =>
          getCustomIndicators(pineJs, indicatorValueCallback),
        custom_css_url: '/static/charting_library/tradingview-custom.css',
        save_load_adapter: saveLoadAdapter,
        priceFormatter: createDynamicPriceFormatter(),
        custom_themes: {
          light: lightThemeColors,
          dark: darkThemeColors,
        },
        loading_screen: { backgroundColor: cardColor },
        overrides: {
          'paneProperties.background': cardColor,
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': borderColor,
          'paneProperties.horzGridProperties.color': borderColor,
        },
      };

      logger.info('[JournalEntryChart] Final widget config', {
        hasTimeframe: 'timeframe' in widgetConfig,
        timeframe: (widgetConfig as any).timeframe,
        load_last_chart: enableLoadLastChart,
        auto_save_delay: enableAutoSave ? 5 : 0,
      });

      const widget = new TradingView.widget(widgetConfig);

      logger.info('[JournalEntryChart] Widget instance created', {
        hasWidget: !!widget,
        widgetType: typeof widget,
      });

      widgetRef.current = widget;
      isInitializedRef.current = true;
      const createdAt = Date.now();
      // Safari can boot the chart frame before the widget listens for it,
      // which would leave the chart without onChartReady for good.
      stopLoadReplay = replayMissedInnerWindowLoad(widget, containerElement);

      const handleChartReady = async () => {
        if (readyHandled || !isMounted) return;
        readyHandled = true;
        clearTimeout(watchdog);
        setIsChartReady(true);
        setIsLoading(false);
        setStalled(false);

        const widgetAny = widget as unknown as {
          subscribe?: (event: string, cb: () => void) => void;
          saveChartToServer?: (
            onComplete?: (chartId: { uid: string }) => void,
            onFail?: (error: unknown) => void,
            options?: Record<string, unknown>
          ) => void;
        };

        if (enableAutoSave && typeof widgetAny.subscribe === 'function') {
          widgetAny.subscribe('onAutoSaveNeeded', () => {
            const activeLayoutId = layoutStateRef.current.id;
            const activeLayoutName = layoutStateRef.current.name;
            // TradingView rejects saves without a chart name. Skip auto-save
            // until the user has named the layout (or we already have an id).
            if (!activeLayoutId && !activeLayoutName) {
              return;
            }
            const saveOptions: Record<string, unknown> = {};
            if (activeLayoutId) {
              saveOptions['chartId'] = activeLayoutId;
            }
            if (activeLayoutName) {
              saveOptions['chartName'] = activeLayoutName;
            }
            widgetAny.saveChartToServer?.(
              (chartId: { uid: string }) => {
                emitLayoutChange({
                  id: chartId.uid,
                  name: layoutStateRef.current.name ?? null,
                });
                useTradingViewStore
                  .getState()
                  .setLastSavedLayoutId(chartId.uid, layoutPersistenceKey);
              },
              (error) => {
                logger.error('TradingView auto-save failed', error);
              },
              saveOptions
            );
          });
        }
        if (enableLoadLastChart) {
          const loadedExisting =
            (await tryLoadLayout(widget, layoutStateRef.current.id)) ||
            (await tryLoadLayout(
              widget,
              useTradingViewStore
                .getState()
                .getLastSavedLayoutId(layoutPersistenceKey)
            ));

          if (!loadedExisting && layoutStateRef.current.id) {
            emitLayoutChange(null);
            useTradingViewStore
              .getState()
              .setLastSavedLayoutId(null, layoutPersistenceKey);
          }
        }

        try {
          const chartApi = (widget as { chart?: () => unknown })?.chart?.();
          logger.info(
            '[ScrollLoadBars] Setting up visible range subscription',
            {
              chartApi: !!chartApi,
              hasOnVisibleRangeChanged:
                typeof (chartApi as any)?.onVisibleRangeChanged === 'function',
            }
          );

          const visibleRangeChanged =
            chartApi &&
            typeof (chartApi as any).onVisibleRangeChanged === 'function'
              ? (chartApi as any).onVisibleRangeChanged()
              : null;

          logger.info(
            '[ScrollLoadBars] Visible range changed subscription object',
            {
              hasVisibleRangeChanged: !!visibleRangeChanged,
              hasSubscribe:
                typeof visibleRangeChanged?.subscribe === 'function',
            }
          );

          const subscribeFn = visibleRangeChanged?.subscribe;
          if (typeof subscribeFn === 'function') {
            subscribeFn.call(
              visibleRangeChanged,
              null,
              (r: { from: number; to: number }) => {
                logger.debug(
                  '[ScrollLoadBars] Visible range changed callback fired',
                  {
                    range: r,
                    hasFrom: !!r?.from,
                    hasTo: !!r?.to,
                  }
                );
                if (r?.from && r?.to) {
                  logger.info(
                    '[ScrollLoadBars] Calling onVisibleRange callback',
                    {
                      from: new Date(r.from * 1000).toISOString(),
                      to: new Date(r.to * 1000).toISOString(),
                    }
                  );
                  onVisibleRange?.(r);
                } else {
                  // TradingView fires this callback once at startup with an
                  // empty range before bars are loaded — expected, not an error.
                  logger.debug('[ScrollLoadBars] Range missing from or to', {
                    range: r,
                  });
                }
              }
            );
            logger.info(
              '[ScrollLoadBars] Successfully subscribed to visible range changes'
            );
          } else {
            logger.warn(
              '[ScrollLoadBars] Visible range subscription unavailable on chart instance'
            );
          }
        } catch (error) {
          logger.error(
            '[ScrollLoadBars] Failed to subscribe to visible range changes',
            error
          );
        }
        // Debug: surface widget meta
        try {
          logger.info('[TV Init] Chart ready', {
            symbol: initialSymbol,
            interval: initialInterval,
            enableAutoSave,
            enableLoadLastChart,
            enableSeparateDrawingsStorage,
          });
        } catch (error) {
          logger.debug?.('Chart ready console log failed', error);
        }
        onChartReady?.();
        try {
          const active = (
            widget as unknown as { activeChart?: () => unknown }
          ).activeChart?.() as unknown as {
            onSymbolChanged?: () => {
              subscribe: (c: null, cb: () => void) => void;
            };
            onIntervalChanged?: () => {
              subscribe: (c: null, cb: (r: string) => void) => void;
            };
            symbol?: () => string;
          };
          if (active?.onSymbolChanged) {
            active.onSymbolChanged().subscribe(null, () => {
              try {
                const sym = active.symbol?.();
                if (sym) onSymbolChange?.(sym);
              } catch (err) {
                logger.warn('Symbol change error', err);
              }
            });
          }
          if (active?.onIntervalChanged) {
            active.onIntervalChanged().subscribe(null, (res: string) => {
              logger.info('📊 TradingView widget interval changed', {
                newInterval: res,
              });
              onIntervalChange?.(res);
            });
          }
        } catch (e) {
          logger.warn('Subscription setup failed', e);
        }
      };

      widget.onChartReady(() => {
        logger.info('[JournalEntryChart] onChartReady callback fired', {
          isMounted,
          hasInitialTimeframe: !!initialTimeframe,
          initialTimeframe,
        });
        void handleChartReady();
      });

      // onChartReady waits for the main series' history, so a datafeed call
      // that never answers — or a ready signal lost on the way — leaves the
      // chart loading forever with nothing thrown. Say what it was waiting on.
      watchdog = setTimeout(() => {
        if (readyHandled) return;
        const diagnostics = collectChartStallDiagnostics({
          widget,
          container: containerElement,
          symbol: initialSymbol,
          interval: initialInterval,
          createdAt,
          attempt,
          mounted: isMounted,
          loadLastChart: enableLoadLastChart,
          customDatafeed: Boolean(datafeedProp),
          bootLayout,
        });
        // An ordinary unmount leaves nothing on screen to explain.
        if (!diagnostics.mounted && !diagnostics.containerConnected) return;
        const recovered = canRecoverWithoutReady(diagnostics);
        reportChartStall(diagnostics, recovered);
        if (recovered) {
          void handleChartReady();
        } else if (isMounted) {
          setStalled(true);
        }
      }, CHART_READY_WATCHDOG_MS);
    };

    init().catch((err) => {
      logger.error('TradingView init failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      stopLoadReplay();
      // Kept on an ordinary teardown so the watchdog can still report a chart
      // that was torn down yet left on screen; a retry replaces it instead.
      if (retryingRef.current) clearTimeout(watchdog);
      try {
        widgetRef.current?.remove?.();
      } catch {
        /* noop */
      }
      widgetRef.current = null;
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => {
    retryingRef.current = true;
    setStalled(false);
    setError(null);
    setIsChartReady(false);
    setIsLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return {
    widgetRef,
    isLoading,
    error,
    isChartReady,
    stalled,
    retry,
  } as const;
}
