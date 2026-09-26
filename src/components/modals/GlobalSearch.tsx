import { useComboBots } from '@/hooks/useComboBots';
import { useDcaBots } from '@/hooks/useDcaBots';
import { useGridBots } from '@/hooks/useGridBots';
/* import { useHedgeComboBots } from '@/hooks/useHedgeComboBots';
import { useHedgeDcaBots } from '@/hooks/useHedgeDcaBots'; */
import { useTerminal } from '@/hooks/useTerminal';
import { useLargeAccount } from '@/hooks/useLargeAccount';
import { useServerPagedBots } from '@/hooks/useServerPagedBots';
import {
  CANONICAL_DCA_STATUSES,
  CANONICAL_GRID_STATUSES,
} from '@/lib/botList/botListWindow';
import { toBotDataGridInput } from '@/lib/botList/serverBotQuery';
import type { GridBot } from '@/types/gridBot';
import logger from '@/lib/loggerInstance';
import { searchContent } from '@/services/contentApi';
import { BotTypesEnum, type ComboBot, type DCABot } from '@/types';
import type { HelpDocMetadata } from '@/types/helpCenter';
/* import { transformHedgeBotToBot } from '@/types/hedgeBot'; */
import { getBotTypeLabel } from '@/utils/botUtils';
import { loadCachedHelpArticles } from '@/utils/helpArticlesCache';
import { ArrowRight, BookOpen, Bot, FileText, Search } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { SHORTCUT_IDS } from '../../config/shortcuts';
import { ItemRowList } from '../common/ItemRowList';
import { ShortcutChip } from '../common/ShortcutChip';
import { getNavigationSections } from '../layout/navigationConfig';
import { BotTypeChip, StatusChip } from '../ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { DialogSearchInput } from '../common/DialogSearchInput';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string | undefined;
  matchExcerpt?: string;
  url: string;
  type: 'page' | 'bot' | 'help';
  icon?: React.ReactNode;
  botType?: BotTypesEnum;
  terminal?: boolean;
  status?: string;
  created?: string | number | undefined;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Highlight helper ────────────────────────────────────────────────────────

function highlightMatch(
  text: string | undefined | null,
  query: string
): React.ReactNode {
  if (!text) return text ?? '';
  if (!query.trim()) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    i % 2 !== 0 ? (
      <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/** Remove common markdown syntax so excerpts render as plain text */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '') // headings
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // bold / italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
    .replace(/!?\[([^\]]*)]\([^)]*\)/g, '$1') // links / images
    .replace(/^[-*>]\s+/gm, '') // list markers / blockquotes
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/** Rows a server-side search returns per bot type. */
const SERVER_SEARCH_LIMIT = 20;

function mergeById<T extends { _id: string }>(a: T[], b: T[]): T[] {
  if (!b.length) return a;
  const seen = new Set(a.map((x) => x._id));
  const out = a.slice();
  for (const x of b) if (!seen.has(x._id)) out.push(x);
  return out;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Inner component that only renders when dialog is open
// This prevents unnecessary bot data fetching on every page
const GlobalSearchContent: React.FC<{
  onSelect: (url: string) => void;
  header?: React.ReactNode;
}> = ({ onSelect, header }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all bots - these hooks only execute when the dialog is open
  const dcaList = useDcaBots({ all: true });
  const gridList = useGridBots();
  const comboList = useComboBots({ all: true });
  /*  const { bots: hedgeDcaBots = [] } = useHedgeDcaBots({ all: true });
  const { bots: hedgeComboBots = [] } = useHedgeComboBots({ all: true }); */

  // Large accounts, or any capped list: bots are searched ON THE SERVER by
  // name (terminal trades by pair), so bot #1,497 is findable. The unpaged
  // terminal list (thousands of rows for heavy terminal users) is not loaded
  // at all in large-account mode.
  const largeAccount = useLargeAccount();
  const serverSearch =
    largeAccount.active ||
    dcaList.isPartial ||
    gridList.isPartial ||
    comboList.isPartial;
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 300);
  const searchOn = serverSearch && debouncedQuery.length >= 2;
  const serverDca = useServerPagedBots<DCABot>({
    type: 'dca',
    statuses: CANONICAL_DCA_STATUSES,
    enabled: searchOn,
    pageIndex: 0,
    pageSize: SERVER_SEARCH_LIMIT,
    search: debouncedQuery,
  });
  const serverGrid = useServerPagedBots<GridBot>({
    type: 'grid',
    statuses: CANONICAL_GRID_STATUSES,
    enabled: searchOn,
    pageIndex: 0,
    pageSize: SERVER_SEARCH_LIMIT,
    search: debouncedQuery,
  });
  const serverCombo = useServerPagedBots<ComboBot>({
    type: 'combo',
    statuses: CANONICAL_DCA_STATUSES,
    enabled: searchOn,
    pageIndex: 0,
    pageSize: SERVER_SEARCH_LIMIT,
    search: debouncedQuery,
  });
  const terminalGrid = useMemo(
    () =>
      largeAccount.active
        ? toBotDataGridInput({
            pageIndex: 0,
            pageSize: SERVER_SEARCH_LIMIT,
            search: debouncedQuery,
            searchField: 'settings.pair',
          })
        : undefined,
    [largeAccount.active, debouncedQuery]
  );
  const { bots: terminalBots = [] } = useTerminal(
    { all: true },
    {
      enabled: !largeAccount.active || debouncedQuery.length >= 2,
      dataGridInput: terminalGrid,
    }
  );
  const dcaBots = useMemo(
    () => mergeById(dcaList.bots, searchOn ? serverDca.bots : []),
    [dcaList.bots, searchOn, serverDca.bots]
  );
  const gridBots = useMemo(
    () => mergeById(gridList.bots, searchOn ? serverGrid.bots : []),
    [gridList.bots, searchOn, serverGrid.bots]
  );
  const comboBots = useMemo(
    () => mergeById(comboList.bots, searchOn ? serverCombo.bots : []),
    [comboList.bots, searchOn, serverCombo.bots]
  );

  // Load cached help articles
  const [helpArticles, setHelpArticles] = useState<HelpDocMetadata[]>([]);
  useEffect(() => {
    loadCachedHelpArticles().then(setHelpArticles);
  }, []);

  // API-powered content search results for help articles
  const [apiHelpResults, setApiHelpResults] = useState<SearchResult[]>([]);
  const helpSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const searchHelpContent = useCallback((query: string) => {
    if (helpSearchTimeoutRef.current) {
      clearTimeout(helpSearchTimeoutRef.current);
    }
    if (!query.trim()) {
      setApiHelpResults([]);
      return;
    }
    helpSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await searchContent(query, 1, 20);
        const results = res.data
          .filter((item) => item.source === 'help')
          .map(
            (item): SearchResult => ({
              id: `help-${item.slug}`,
              title: item.title,
              subtitle: item.description,
              matchExcerpt:
                item.match !== item.title
                  ? stripMarkdown(item.match)
                  : undefined,
              url: `/help/${item.slug}`,
              type: 'help',
              icon: <BookOpen className="w-4 h-4" />,
            })
          );
        setApiHelpResults(results);
      } catch (err) {
        logger.debug('[HelpCenter] Global search content API error', {
          error: String(err),
        });
      }
    }, 300);
  }, []);

  // Convert cached help articles to search results (for no-query browsing)
  const allHelpResults = useMemo(() => {
    return helpArticles.map(
      (article): SearchResult => ({
        id: `help-${article.slug}`,
        title: article.title,
        subtitle: article.description,
        url: `/help/${article.slug}`,
        type: 'help',
        icon: <BookOpen className="w-4 h-4" />,
      })
    );
  }, [helpArticles]);

  // Get all pages from navigation config
  const allPages = useMemo(() => {
    const sections = getNavigationSections();
    const pages: SearchResult[] = [];

    type NavItem = {
      href?: string;
      label: string;
      icon?: React.ReactNode;
      children?: NavItem[];
    };

    const processItems = (items: NavItem[], parentLabel?: string) => {
      items.forEach((item) => {
        if (item.href && !item.href.startsWith('http')) {
          pages.push({
            id: item.href,
            title: parentLabel ? `${parentLabel} - ${item.label}` : item.label,
            subtitle: parentLabel,
            url: item.href,
            type: 'page',
            icon: item.icon,
          });
        }
        if (item.children) {
          processItems(item.children, item.label);
        }
      });
    };

    sections.forEach((section) => {
      processItems(section.items);
    });

    return pages;
  }, []);

  // Convert bots to search results
  const allBots = useMemo(() => {
    const results: SearchResult[] = [];

    // DCA bots (exclude terminal bots)
    dcaBots.forEach((bot) => {
      // Skip terminal bots as they'll be handled separately
      if (bot.settings?.type === 'terminal') {
        return;
      }

      results.push({
        id: bot._id,
        title: bot.settings?.name || `Bot ${bot._id.slice(-8)}`,
        subtitle: `${getBotTypeLabel(BotTypesEnum.dca)} - ${
          Array.isArray(bot.settings?.pair)
            ? bot.settings.pair.join(',')
            : bot.settings?.pair || 'Unknown'
        }`,
        url: `/bot/view/${bot._id}`,
        type: 'bot',
        botType: BotTypesEnum.dca,
        status: bot.status,
        created: bot.created,
      });
    });

    // Terminal deals
    terminalBots.forEach((bot) => {
      results.push({
        id: bot._id,
        title:
          bot.settings?.name?.replace(/^Terminal:/, 'Deal:') ||
          `Deal ${bot._id.slice(-8)}`,
        subtitle: `Terminal Deal - ${
          Array.isArray(bot.settings?.pair)
            ? bot.settings.pair.join(',')
            : bot.settings?.pair || 'Unknown'
        }`,
        url: `/terminal`,
        type: 'bot',
        botType: BotTypesEnum.dca,
        terminal: true,
        status: bot.status,
        created: bot.created,
      });
    });

    // Grid bots
    gridBots.forEach((bot) => {
      results.push({
        id: bot._id,
        title: bot.settings?.name || `Bot ${bot._id.slice(-8)}`,
        subtitle: `${getBotTypeLabel(BotTypesEnum.grid)} - ${
          bot.settings?.pair || 'Unknown'
        }`,
        url: `/grid/view/${bot._id}`,
        type: 'bot',
        botType: BotTypesEnum.grid,
        status: bot.status,
        created: bot.created,
      });
    });

    // Combo bots
    comboBots.forEach((bot) => {
      results.push({
        id: bot._id,
        title: bot.settings?.name || `Bot ${bot._id.slice(-8)}`,
        subtitle: `${getBotTypeLabel(BotTypesEnum.combo)} - ${
          Array.isArray(bot.settings?.pair)
            ? bot.settings.pair.join(',')
            : bot.settings?.pair || 'Unknown'
        }`,
        url: `/combo/view/${bot._id}`,
        type: 'bot',
        botType: BotTypesEnum.combo,
        status: bot.status,
        created: bot.created,
      });
    });

    // Hedge DCA bots (parents) - use transform to derive display fields
    /*   hedgeDcaBots.forEach((bot) => {
      const t = transformHedgeBotToBot(bot);
      results.push({
        id: bot._id,
        title: t.name || `Hedge Bot ${bot._id.slice(-8)}`,
        subtitle: `${getBotTypeLabel(BotTypesEnum.hedgeDca)} - ${
          (t.symbols && t.symbols.length > 0 ? t.symbols.join(', ') : t.pair) ||
          'Unknown'
        }`,
        url: `/hedge/bot/view/${bot._id}`,
        type: 'bot',
        botType: BotTypesEnum.hedgeDca,
        status: bot.status,
        created: bot.created,
      });
    }); */

    // Hedge Combo bots (parents) - use transform to derive display fields
    /*     hedgeComboBots.forEach((bot) => {
      const t = transformHedgeBotToBot(bot);
      results.push({
        id: bot._id,
        title: t.name || `Hedge Bot ${bot._id.slice(-8)}`,
        subtitle: `${getBotTypeLabel(BotTypesEnum.hedgeCombo)} - ${
          (t.symbols && t.symbols.length > 0 ? t.symbols.join(', ') : t.pair) ||
          'Unknown'
        }`,
        url: `/hedge/combo/view/${bot._id}`,
        type: 'bot',
        botType: BotTypesEnum.hedgeCombo,
        status: bot.status,
        created: bot.created,
      });
    }); */

    // Sort results by created date (newest first)
    results.sort((a, b) => {
      const aCreated = new Date(a.created || 0).getTime();
      const bCreated = new Date(b.created || 0).getTime();
      return bCreated - aCreated;
    });

    return results;
  }, [
    dcaBots,
    gridBots,
    comboBots,
    /*    hedgeDcaBots,
    hedgeComboBots, */
    terminalBots,
  ]);

  // Trigger API content search when query changes
  useEffect(() => {
    searchHelpContent(searchQuery);
  }, [searchQuery, searchHelpContent]);

  // Combine and filter results
  const filteredResults = useMemo(() => {
    const allResults = [...allPages, ...allBots, ...allHelpResults];

    if (!searchQuery.trim()) {
      return allResults;
    }

    const query = searchQuery.toLowerCase();
    const localFiltered = allResults.filter(
      (result) =>
        result.title.toLowerCase().includes(query) ||
        result.subtitle?.toLowerCase().includes(query) ||
        result.url.toLowerCase().includes(query)
    );

    // Merge API content-search results (deduplicate by id)
    if (apiHelpResults.length > 0) {
      const existingIds = new Set(localFiltered.map((r) => r.id));
      const newApiResults = apiHelpResults.filter(
        (r) => !existingIds.has(r.id)
      );
      return [...localFiltered, ...newApiResults];
    }

    return localFiltered;
  }, [allPages, allHelpResults, allBots, apiHelpResults, searchQuery]);

  // Group results by type and bot type
  const groupedResults = useMemo(() => {
    const pages = filteredResults.filter((r) => r.type === 'page');
    const helpArticles = filteredResults.filter((r) => r.type === 'help');
    const dcaBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.dca && !r.terminal
    );
    const gridBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.grid
    );
    const comboBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.combo
    );
    const hedgeDcaBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.hedgeDca
    );
    const hedgeComboBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.hedgeCombo
    );
    const terminalBots = filteredResults.filter(
      (r) => r.type === 'bot' && r.botType === BotTypesEnum.dca && r.terminal
    );

    return {
      pages,
      helpArticles,
      dcaBots,
      gridBots,
      comboBots,
      hedgeDcaBots,
      hedgeComboBots,
      terminalBots,
    };
  }, [filteredResults]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  // Reset selected index when search query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchQuery]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalResults = filteredResults.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < 0 ? 0 : (prev + 1) % totalResults
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < 0 ? totalResults - 1 : (prev - 1 + totalResults) % totalResults
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = selectedIndex < 0 ? 0 : selectedIndex;
      if (filteredResults[idx]) {
        handleSelect(filteredResults[idx]);
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (scrollRef.current) {
      const selectedElement = scrollRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    onSelect(result.url);
  };

  return (
    <>
      {/* Header + search row are fixed siblings of the scrolling
          results area below. We don't use `sticky` here because any
          sticky child inside the dialog's `glass-surface` cannot match
          the parent's blended translucent color, and would always read
          as a visibly tinted "box" pinned at the top. The host
          DialogContent below is flex-col + overflow-hidden so this
          works without giving up the "search stays visible while
          results scroll" UX. */}
      {header}

      <div className="px-6 py-3 pr-12 shrink-0">
        <DialogSearchInput
          ref={inputRef}
          placeholder="Type to search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div
        className="px-6 pb-6 pt-1 flex-1 min-h-0 overflow-y-auto"
        ref={scrollRef}
      >
        {filteredResults.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No results found
          </div>
        ) : (
          <div className="space-y-lg">
            {/* Helper function to render a category */}
            {(() => {
              const renderCategory = (
                title: string,
                icon: React.ReactNode,
                results: SearchResult[],
                categoryKey: string
              ) => {
                if (results.length === 0) return null;

                const maxResults = 5;
                const isExpanded = expandedCategories.has(categoryKey);
                const displayResults = isExpanded
                  ? results
                  : results.slice(0, maxResults);
                const hasMore = results.length > maxResults;

                return (
                  <div key={categoryKey}>
                    <div className="flex items-center gap-xs mb-2 text-sm font-semibold text-muted-foreground">
                      {icon}
                      <span>{title}</span>
                      <span className="text-xs">({results.length})</span>
                    </div>
                    <div className="space-y-xs">
                      {displayResults.map((result) => {
                        const globalIndex = filteredResults.indexOf(result);
                        return (
                          <ItemRowList
                            key={result.id}
                            dataIndex={globalIndex}
                            onClick={() => handleSelect(result)}
                            selected={selectedIndex === globalIndex}
                          >
                            <div className="flex items-center gap-sm text-left flex-1 min-w-0">
                              {result.type === 'bot' ? (
                                <>
                                  <div className="shrink-0">
                                    {result.botType && (
                                      <BotTypeChip
                                        botType={result.botType}
                                        iconOnly
                                        size="sm"
                                      />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-xs">
                                      <span className="font-medium">
                                        {highlightMatch(
                                          result.title,
                                          searchQuery
                                        )}
                                      </span>
                                      {result.status && (
                                        <StatusChip
                                          status={result.status}
                                          size="xs"
                                          chipStyle="soft"
                                          // showDot={false}
                                          dotOnly
                                        />
                                      )}
                                    </div>
                                    {result.subtitle && (
                                      <div className="text-sm text-muted-foreground truncate">
                                        {highlightMatch(
                                          result.subtitle,
                                          searchQuery
                                        )}
                                      </div>
                                    )}
                                    {result.matchExcerpt && (
                                      <div className="text-sm text-muted-foreground/70 italic line-clamp-2">
                                        {highlightMatch(
                                          result.matchExcerpt,
                                          searchQuery
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="shrink-0">{result.icon}</div>
                                  <div>
                                    <div className="font-medium">
                                      {highlightMatch(
                                        result.title,
                                        searchQuery
                                      )}
                                    </div>
                                    {result.subtitle && (
                                      <div className="text-sm text-muted-foreground">
                                        {highlightMatch(
                                          result.subtitle,
                                          searchQuery
                                        )}
                                      </div>
                                    )}
                                    {result.matchExcerpt && (
                                      <div className="text-sm text-muted-foreground/70 italic line-clamp-2">
                                        {highlightMatch(
                                          result.matchExcerpt,
                                          searchQuery
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </ItemRowList>
                        );
                      })}
                      {hasMore && !isExpanded && (
                        <button
                          onClick={() =>
                            setExpandedCategories((prev) =>
                              new Set(prev).add(categoryKey)
                            )
                          }
                          className="w-full py-2 text-sm text-primary hover:text-primary/80 font-medium"
                        >
                          Load more ({results.length - maxResults} more)
                        </button>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {renderCategory(
                    'DCA Bots',
                    <Bot className="w-4 h-4" />,
                    groupedResults.dcaBots,
                    'dca'
                  )}
                  {renderCategory(
                    'Terminal Deals',
                    <Bot className="w-4 h-4" />,
                    groupedResults.terminalBots,
                    'terminal'
                  )}
                  {renderCategory(
                    'Grid Bots',
                    <Bot className="w-4 h-4" />,
                    groupedResults.gridBots,
                    'grid'
                  )}
                  {renderCategory(
                    'Combo Bots',
                    <Bot className="w-4 h-4" />,
                    groupedResults.comboBots,
                    'combo'
                  )}
                  {renderCategory(
                    'Hedge DCA Bots',
                    <Bot className="w-4 h-4" />,
                    groupedResults.hedgeDcaBots,
                    'hedgeDca'
                  )}
                  {renderCategory(
                    'Hedge Combo Bots',
                    <Bot className="w-4 h-4" />,
                    groupedResults.hedgeComboBots,
                    'hedgeCombo'
                  )}
                  {renderCategory(
                    'Pages',
                    <FileText className="w-4 h-4" />,
                    groupedResults.pages,
                    'pages'
                  )}
                  {renderCategory(
                    'Help Articles',
                    <BookOpen className="w-4 h-4" />,
                    groupedResults.helpArticles,
                    'help'
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </>
  );
};

// Main component that wraps the dialog
export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();

  const handleSelect = (url: string) => {
    navigate(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col"
        zIndex={50001}
      >
        {/* Only render content when dialog is open to prevent unnecessary bot fetching */}
        {open && (
          <GlobalSearchContent
            onSelect={handleSelect}
            header={
              <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
                <DialogTitle className="flex items-center gap-xs">
                  <Search className="h-5 w-5" />
                  <span className="flex items-center gap-xs">
                    Search
                    <ShortcutChip id={SHORTCUT_IDS.ManagerGlobalSearch} />
                  </span>
                </DialogTitle>
                <DialogDescription>
                  Search for pages, help articles, and bots. Use arrow keys
                  to navigate and Enter to select.
                </DialogDescription>
              </DialogHeader>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
