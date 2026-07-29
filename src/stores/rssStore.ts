/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  image?: {
    url: string;
    title?: string;
    link?: string;
    width?: number;
    height?: number;
  };
}

export interface RSSFeed {
  url: string;
  title: string;
  items: RSSItem[];
  lastFetched: number;
  error?: string;
}

export interface RSSCache {
  [url: string]: RSSFeed;
}

interface RSSStore {
  feeds: RSSCache;
  customFeeds: { [url: string]: string }; // url -> name mapping
  feedColors: { [url: string]: string }; // url -> color mapping
  selectedFeeds: string[]; // Array of selected feed URLs
  lastAutoRefresh: number; // Timestamp of last automatic refresh on load
  fetchFeed: (url: string, forceRefresh?: boolean) => Promise<void>;
  addCustomFeed: (url: string, name: string, color?: string) => void;
  removeCustomFeed: (url: string) => void;
  setSelectedFeeds: (urls: string[]) => void;
  setFeedColor: (url: string, color: string) => void;
  clearCache: () => void;
}

// Predefined RSS feeds (placeholders for now)
export const PREDEFINED_RSS_FEEDS = [
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    name: 'Cointelegraph',
    url: 'https://cointelegraph.com/rss',
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
  },
  {
    name: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
  },
  {
    name: 'Bitcoin Magazine',
    url: 'https://bitcoinmagazine.com/.rss/full/',
  },
];

// Cache expiration time (30 minutes)
const CACHE_EXPIRATION = 30 * 60 * 1000;

// Helper to parse RSS XML
async function parseRSS(xml: string, url: string): Promise<RSSFeed> {
  // Validate that the response is XML, not HTML (error from proxy)
  if (
    !xml ||
    xml.trim().startsWith('<html') ||
    xml.trim().startsWith('<!DOCTYPE')
  ) {
    throw new Error('Proxy returned HTML instead of RSS feed');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');

  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    console.error('XML Parse Error:', parseError.textContent);
    throw new Error('Failed to parse RSS feed: Invalid XML format');
  }

  const channel = xmlDoc.querySelector('channel');
  if (!channel) {
    throw new Error('Invalid RSS feed format: No channel found');
  }

  const feedTitle =
    channel.querySelector('title')?.textContent || 'Untitled Feed';
  const items = Array.from(xmlDoc.querySelectorAll('item')).map((item) => {
    // Properly query for namespaced content:encoded element
    let description =
      item.querySelector('description')?.textContent ||
      item.querySelector('[content]')?.textContent ||
      '';

    // If description is empty, try to find content:encoded using getElementsByTagName
    if (!description) {
      const contentElements = item.getElementsByTagName('content:encoded');
      if (contentElements.length > 0) {
        description = contentElements[0].textContent || '';
      }
    }

    // Extract image from various sources
    let image: RSSItem['image'] | undefined;

    // Try <image> element (standard RSS)
    const imageElement = item.querySelector('image');
    if (imageElement) {
      const imageUrl = imageElement.querySelector('url')?.textContent;
      if (imageUrl) {
        const imgTitle = imageElement.querySelector('title')?.textContent;
        const imgLink = imageElement.querySelector('link')?.textContent;
        const imgWidth = parseInt(
          imageElement.querySelector('width')?.textContent || '0'
        );
        const imgHeight = parseInt(
          imageElement.querySelector('height')?.textContent || '0'
        );

        image = { url: imageUrl };
        if (imgTitle) image.title = imgTitle;
        if (imgLink) image.link = imgLink;
        if (imgWidth) image.width = imgWidth;
        if (imgHeight) image.height = imgHeight;
      }
    }

    // Try media:thumbnail (Media RSS)
    if (!image) {
      const mediaThumbnail = item.querySelector('thumbnail, [url]');
      if (mediaThumbnail) {
        const thumbnailUrl = mediaThumbnail.getAttribute('url');
        if (thumbnailUrl) {
          const thumbWidth = parseInt(
            mediaThumbnail.getAttribute('width') || '0'
          );
          const thumbHeight = parseInt(
            mediaThumbnail.getAttribute('height') || '0'
          );

          image = { url: thumbnailUrl };
          if (thumbWidth) image.width = thumbWidth;
          if (thumbHeight) image.height = thumbHeight;
        }
      }
    }

    // Try media:content
    if (!image) {
      const mediaContent = item.querySelector(
        'content[medium="image"], content[type^="image"]'
      );
      if (mediaContent) {
        const contentUrl = mediaContent.getAttribute('url');
        if (contentUrl) {
          const contentWidth = parseInt(
            mediaContent.getAttribute('width') || '0'
          );
          const contentHeight = parseInt(
            mediaContent.getAttribute('height') || '0'
          );

          image = { url: contentUrl };
          if (contentWidth) image.width = contentWidth;
          if (contentHeight) image.height = contentHeight;
        }
      }
    }

    // Try enclosure with image type
    if (!image) {
      const enclosure = item.querySelector('enclosure[type^="image"]');
      if (enclosure) {
        const enclosureUrl = enclosure.getAttribute('url');
        if (enclosureUrl) {
          image = {
            url: enclosureUrl,
          };
        }
      }
    }

    // Try extracting from description HTML
    if (!image && description) {
      const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        image = {
          url: imgMatch[1],
        };
      }
    }

    const rssItem: RSSItem = {
      title: item.querySelector('title')?.textContent || 'Untitled',
      link: item.querySelector('link')?.textContent || '#',
      description: description,
      pubDate:
        item.querySelector('pubDate')?.textContent || new Date().toISOString(),
      guid:
        item.querySelector('guid')?.textContent ||
        item.querySelector('link')?.textContent ||
        Math.random().toString(),
    };

    if (image) {
      rssItem.image = image;
    }

    return rssItem;
  });

  return {
    url,
    title: feedTitle,
    items: items.slice(0, 20), // Limit to 20 items
    lastFetched: Date.now(),
  };
}

// Shape of api.rss2json.com's parsed response (only the fields we read)
interface Rss2JsonResponse {
  status: string;
  message?: string;
  feed?: { title?: string };
  items?: Array<{
    title?: string;
    link?: string;
    guid?: string;
    pubDate?: string;
    description?: string;
    content?: string;
    thumbnail?: string;
    enclosure?: { link?: string; type?: string; thumbnail?: string };
  }>;
}

// Map rss2json's pre-parsed JSON into our RSSFeed shape
function parseRss2Json(data: Rss2JsonResponse, url: string): RSSFeed {
  const items: RSSItem[] = (data.items ?? []).map((item) => {
    const description = item.description || item.content || '';

    // Best-effort image: thumbnail → image enclosure → first <img> in HTML
    let imageUrl = item.thumbnail || item.enclosure?.thumbnail || '';
    if (
      !imageUrl &&
      item.enclosure?.link &&
      (item.enclosure.type?.startsWith('image') ||
        /\.(png|jpe?g|gif|webp)(\?|$)/i.test(item.enclosure.link))
    ) {
      imageUrl = item.enclosure.link;
    }
    if (!imageUrl && description) {
      const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch?.[1]) imageUrl = imgMatch[1];
    }

    // rss2json emits "YYYY-MM-DD HH:mm:ss" (UTC); normalize to ISO so
    // `new Date(...)` parses it consistently across browsers.
    const rawDate = item.pubDate || '';
    const pubDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate)
      ? `${rawDate.replace(' ', 'T')}Z`
      : rawDate || new Date().toISOString();

    const rssItem: RSSItem = {
      title: item.title || 'Untitled',
      link: item.link || '#',
      description,
      pubDate,
      guid: item.guid || item.link || Math.random().toString(),
    };
    if (imageUrl) {
      rssItem.image = { url: imageUrl };
    }
    return rssItem;
  });

  return {
    url,
    title: data.feed?.title || 'Untitled Feed',
    items: items.slice(0, 20),
    lastFetched: Date.now(),
  };
}

export const useRSSStore = create<RSSStore>()(
  persist(
    (set, get) => ({
      feeds: {},
      customFeeds: {},
      feedColors: {},
      selectedFeeds: [PREDEFINED_RSS_FEEDS[0].url],
      lastAutoRefresh: 0,

      fetchFeed: async (url: string, forceRefresh?: boolean) => {
        const { feeds } = get();
        const cached = feeds[url];

        // Use cache if it's still valid (unless the caller forces a refresh)
        if (
          !forceRefresh &&
          cached &&
          !cached.error &&
          Date.now() - cached.lastFetched < CACHE_EXPIRATION
        ) {
          return;
        }

        // Fetch strategies, tried in order. Each returns a parsed RSSFeed or
        // throws. Browsers can't fetch third-party feeds directly (CORS), so
        // both strategies go through a public relay:
        // 1. allorigins — relays the raw XML (full item content, up to 20
        //    items) but has a history of outages (Cloudflare 52x).
        // 2. rss2json — very reliable, but returns pre-parsed JSON capped at
        //    10 items on the free tier, so it's the fallback.
        // (cors.bridged.cc used to sit in this list; the service is dead.)
        const strategies: Array<() => Promise<RSSFeed>> = [
          async () => {
            const response = await fetch(
              `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
            );
            if (!response.ok) {
              throw new Error(`allorigins HTTP ${response.status}`);
            }
            const responseText = await response.text();
            let data: { contents?: string };
            try {
              data = JSON.parse(responseText);
            } catch {
              // Outages return plain-text bodies like "error code: 522"
              throw new Error(
                `allorigins returned non-JSON: ${responseText.slice(0, 80)}`
              );
            }
            let xmlContent = data.contents;
            if (!xmlContent) {
              throw new Error('allorigins returned no content');
            }
            // Non-text content types come back as a base64 data: URI
            if (xmlContent.startsWith('data:')) {
              const base64 = xmlContent.split(',')[1] ?? '';
              xmlContent = new TextDecoder().decode(
                Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
              );
            }
            if (!xmlContent.trim().startsWith('<')) {
              throw new Error('allorigins response is not XML');
            }
            return parseRSS(xmlContent, url);
          },
          async () => {
            const response = await fetch(
              `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`
            );
            if (!response.ok) {
              throw new Error(`rss2json HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.status !== 'ok' || !Array.isArray(data.items)) {
              throw new Error(
                `rss2json error: ${data.message || 'no items returned'}`
              );
            }
            return parseRss2Json(data, url);
          },
        ];

        let lastError: Error | null = null;

        for (let i = 0; i < strategies.length; i++) {
          try {
            const feed = await strategies[i]();
            set((state) => ({
              feeds: {
                ...state.feeds,
                [url]: feed,
              },
            }));
            return; // Success, exit the loop
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            console.warn(
              `RSS strategy ${i + 1} failed for ${url}: ${lastError.message}`
            );
            // Continue to next strategy
          }
        }

        // All strategies failed
        const errorMessage =
          lastError?.message || 'All proxies failed to fetch RSS feed';
        console.error(`Error fetching RSS feed from ${url}:`, errorMessage);
        set((state) => ({
          feeds: {
            ...state.feeds,
            [url]: {
              url,
              title: 'Error loading feed',
              items: [],
              lastFetched: Date.now(),
              error: errorMessage,
            },
          },
        }));
      },

      addCustomFeed: (url: string, name: string, color?: string) => {
        set((state) => ({
          customFeeds: {
            ...state.customFeeds,
            [url]: name,
          },
          feedColors: color
            ? {
                ...state.feedColors,
                [url]: color,
              }
            : state.feedColors,
        }));
      },

      removeCustomFeed: (url: string) => {
        set((state) => {
          const newCustomFeeds = { ...state.customFeeds };
          const newFeedColors = { ...state.feedColors };
          delete newCustomFeeds[url];
          delete newFeedColors[url];
          return {
            customFeeds: newCustomFeeds,
            feedColors: newFeedColors,
            selectedFeeds: state.selectedFeeds.filter((feed) => feed !== url),
            feeds: Object.fromEntries(
              Object.entries(state.feeds).filter(([key]) => key !== url)
            ),
          };
        });
      },

      setSelectedFeeds: (urls: string[]) => {
        set({ selectedFeeds: urls, lastAutoRefresh: Date.now() });
      },

      setFeedColor: (url: string, color: string) => {
        set((state) => ({
          feedColors: {
            ...state.feedColors,
            [url]: color,
          },
        }));
      },

      clearCache: () => {
        set({ feeds: {} });
      },
    }),
    {
      name: 'rss-storage',
      storage: createIndexedDBStorage('rss-storage'),
      partialize: (state) => ({
        customFeeds: state.customFeeds,
        feedColors: state.feedColors,
        selectedFeeds: state.selectedFeeds,
        // Don't persist feeds, only custom feed URLs and selections
      }),
    }
  )
);
