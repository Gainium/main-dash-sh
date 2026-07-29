import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ExternalLink, Plus, RefreshCw, Rss } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { PREDEFINED_RSS_FEEDS, useRSSStore } from '../../../stores/rssStore';
import { Card } from '../../ui/card';
import WidgetWrapper from '../WidgetWrapper';

export interface NewsRSSProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  allowResize?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: import('../WidgetWrapper').WidgetMenuActions;
  variant?: 'widget' | 'panel';
  className?: string;
}

const NewsRSS: React.FC<NewsRSSProps> = ({
  widgetId = 'news-rss',
  isEditable = true,
  isCollapsible = true,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
  className,
}) => {
  const {
    feeds,
    customFeeds,
    feedColors,
    selectedFeeds,
    lastAutoRefresh,
    fetchFeed,
    addCustomFeed,
    removeCustomFeed,
    setSelectedFeeds,
  } = useRSSStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedName, setNewFeedName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6'); // blue-500
  const [urlError, setUrlError] = useState('');

  const predefinedColors = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Indigo', value: '#6366f1' },
  ];

  const allFeedUrls = [
    ...PREDEFINED_RSS_FEEDS.map((f) => f.url),
    ...Object.keys(customFeeds),
  ];

  // Fetch all selected feeds on mount and when selection changes
  useEffect(() => {
    if (selectedFeeds.length > 0) {
      // Check if we should throttle automatic refresh (5 minute cooldown)
      const AUTO_REFRESH_THROTTLE = 5 * 60 * 1000;
      const timeSinceLastRefresh = Date.now() - lastAutoRefresh;
      const shouldThrottle = timeSinceLastRefresh < AUTO_REFRESH_THROTTLE;

      setIsLoading(true);
      Promise.all(
        selectedFeeds.map((url) => fetchFeed(url, !shouldThrottle))
      ).finally(() => setIsLoading(false));
    }
  }, [selectedFeeds, fetchFeed, lastAutoRefresh]);

  // Get all items from selected feeds, sorted by date
  const allItems = selectedFeeds
    .flatMap((url) => {
      const feed = feeds[url];
      return feed?.items.map((item) => ({ ...item, feedUrl: url })) || [];
    })
    .sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

  const handleRefresh = async () => {
    if (selectedFeeds.length > 0) {
      setIsLoading(true);
      await Promise.all(selectedFeeds.map((url) => fetchFeed(url, true)));
      setIsLoading(false);
    }
  };

  const handleAddCustomFeed = () => {
    setUrlError('');

    if (!newFeedName.trim()) {
      setUrlError('Please enter a feed name');
      return;
    }

    // Basic URL validation
    try {
      const url = new URL(newFeedUrl);
      if (!url.protocol.startsWith('http')) {
        setUrlError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setUrlError('Please enter a valid URL');
      return;
    }

    // Check if feed already exists
    if (allFeedUrls.includes(newFeedUrl)) {
      setUrlError('This feed is already added');
      return;
    }

    addCustomFeed(newFeedUrl, newFeedName, selectedColor);
    setSelectedFeeds([...selectedFeeds, newFeedUrl]);
    setNewFeedUrl('');
    setNewFeedName('');
    setSelectedColor('#3b82f6');
    setIsAddDialogOpen(false);
  };

  const handleRemoveCustomFeed = (url: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeCustomFeed(url);
  };

  const getFeedName = (url: string): string => {
    const predefined = PREDEFINED_RSS_FEEDS.find((f) => f.url === url);
    if (predefined) return predefined.name;

    const customName = customFeeds[url];
    if (customName) return customName;

    // Fallback to feed title or domain
    const feed = feeds[url];
    if (feed?.title && feed.title !== 'Untitled Feed') return feed.title;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Unknown Feed';
    }
  };

  const getFeedColor = (url: string): string => {
    // Check if there's a custom color for this feed
    if (feedColors[url]) {
      return feedColors[url];
    }

    // Generate a consistent color based on feed URL hash
    const hash = url.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const colors = [
      '#3b82f6', // blue
      '#a855f7', // purple
      '#ec4899', // pink
      '#ef4444', // red
      '#f97316', // orange
      '#22c55e', // green
      '#14b8a6', // teal
      '#06b6d4', // cyan
    ];

    return colors[Math.abs(hash) % colors.length];
  };

  // Create options for MultiSelect
  const feedOptions = [
    ...PREDEFINED_RSS_FEEDS.map((feed) => ({
      label: feed.name,
      value: feed.url,
      isCustom: false,
    })),
    ...Object.entries(customFeeds).map(([url, name]) => ({
      label: name,
      value: url,
      isCustom: true,
    })),
  ];

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      return 'Just now';
    } catch {
      return dateString;
    }
  };

  const stripHtml = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const truncateText = (text: string, maxLength: number = 150): string => {
    const clean = stripHtml(text);
    if (clean.length <= maxLength) return clean;
    return clean.substring(0, maxLength).trim() + '...';
  };

  const renderContent = () => {
    if (isLoading && allItems.length === 0) {
      return (
        <div className="space-y-md p-md">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-xs">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      );
    }

    // Check if any feed has an error
    const hasError = selectedFeeds.some((url) => feeds[url]?.error);

    if (hasError && allItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-xl text-center">
          <Rss className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Failed to load feeds</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Some feeds failed to load. Please try again.
          </p>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }

    if (allItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-xl text-center">
          <Rss className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No articles found</h3>
          <p className="text-sm text-muted-foreground">
            Select feeds to see articles.
          </p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-full">
        <div className="space-y-1 p-md">
          {allItems.map((item, index: number) => {
            const feedColor = getFeedColor(item.feedUrl);
            return (
              <Card
                key={item.guid || index}
                position={1}
                className="mb-2 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => window.open(item.link, '_blank')}
              >
                <div className="flex items-start gap-sm">
                  {item.image && (
                    <div className="shrink-0">
                      <img
                        src={item.image.url}
                        alt={item.image.title || item.title}
                        className="w-20 h-20 object-cover rounded-md"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-xs">
                      <h4 className="font-medium text-sm leading-tight line-clamp-2 flex-1">
                        {item.title}
                      </h4>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {truncateText(item.description)}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-xs mt-2">
                      <div
                        className="text-xs px-2 py-1 rounded-full text-white font-medium"
                        style={{ backgroundColor: feedColor }}
                      >
                        {getFeedName(item.feedUrl)}
                      </div>
                      <div className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground font-medium ml-auto">
                        {formatDate(item.pubDate)}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapperProps: any = {
    metadata: {
      id: widgetId,
      type: 'news-rss',
      title: 'News RSS',
      defaultSize: { w: 6, h: 7 },
      minSize: { w: 4, h: 4 },
      maxSize: { w: 12, h: 10 },
      hasOptions: true,
    },
    isEditable,
    isCollapsible,
  };

  if (onRemove) wrapperProps.onRemove = onRemove;
  if (onSettings) wrapperProps.onSettings = onSettings;
  if (onCollapse) wrapperProps.onCollapse = onCollapse;
  if (onTabMove) wrapperProps.onTabMove = onTabMove;
  if (menuActions) wrapperProps.menuActions = menuActions;
  if (className) wrapperProps.className = className;

  return (
    <>
      <WidgetWrapper {...wrapperProps}>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-xs p-sm border-b">
            <MultiSelect
              options={feedOptions}
              selected={selectedFeeds}
              onChange={setSelectedFeeds}
              placeholder="Select RSS feeds..."
              className="flex-1"
              maxDisplay={1}
              onRemoveCustom={handleRemoveCustomFeed}
              customSectionLabel="Custom Feeds"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 shrink-0"
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-hidden">{renderContent()}</div>
        </div>
      </WidgetWrapper>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="px-6 py-6">
          <DialogHeader className="space-y-xs">
            <DialogTitle>Add Custom RSS Feed</DialogTitle>
            <DialogDescription>
              Enter the URL and name of an RSS feed you want to follow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-lg py-4 px-2">
            <div className="space-y-xs">
              <Label htmlFor="feed-name" className="text-sm font-medium">
                Feed Name
              </Label>
              <Input
                id="feed-name"
                placeholder="e.g., My Tech News"
                value={newFeedName}
                onChange={(e) => {
                  setNewFeedName(e.target.value);
                  setUrlError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomFeed();
                }}
                className="px-4 py-2"
              />
            </div>
            <div className="space-y-xs">
              <Label htmlFor="feed-url" className="text-sm font-medium">
                Feed URL
              </Label>
              <Input
                id="feed-url"
                placeholder="https://example.com/feed.xml"
                value={newFeedUrl}
                onChange={(e) => {
                  setNewFeedUrl(e.target.value);
                  setUrlError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustomFeed();
                }}
                className="px-4 py-2"
              />
              {urlError && (
                <p className="text-sm text-destructive">{urlError}</p>
              )}
            </div>
            <div className="space-y-sm">
              <Label className="text-sm font-medium">Feed Color</Label>
              <div className="space-y-sm">
                <div className="grid grid-cols-5 gap-xs">
                  {predefinedColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setSelectedColor(color.value)}
                      className={`w-full h-8 rounded-md transition-all border-2 ${
                        selectedColor === color.value
                          ? 'border-foreground ring-2 ring-offset-2 ring-offset-background ring-foreground'
                          : 'border-transparent hover:border-foreground/30'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-xs pt-1">
                  <Input
                    placeholder="#3b82f6"
                    value={selectedColor}
                    onChange={(e) => {
                      const hex = e.target.value;
                      if (
                        /^#[0-9A-F]{6}$/i.test(hex) ||
                        hex === '' ||
                        hex.startsWith('#')
                      ) {
                        setSelectedColor(hex);
                      }
                    }}
                    className="px-3 py-2 h-8 font-mono text-xs flex-1"
                    maxLength={7}
                  />
                  <div
                    className="w-8 h-8 rounded-md border border-foreground/20 shrink-0 transition-colors"
                    style={{
                      backgroundColor: /^#[0-9A-F]{6}$/i.test(selectedColor)
                        ? selectedColor
                        : '#ccc',
                    }}
                    title="Color preview"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setNewFeedUrl('');
                setNewFeedName('');
                setSelectedColor('#3b82f6');
                setUrlError('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddCustomFeed}>Add Feed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default NewsRSS;
