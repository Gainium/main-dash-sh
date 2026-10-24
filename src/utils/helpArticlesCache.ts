/**
 * Utility to load pre-fetched help articles from the static JSON bundle.
 *
 * The file is generated at build time by `scripts/fetch-help-articles.ts`
 * and lives at `/help-articles.json` (served from `public/`). It carries the
 * help docs and, when the content server has them, the indicator pages.
 * Indicator pages missing from the file are loaded from the content API.
 *
 * Two views, both cached in memory:
 * - `loadCachedHelpArticles()` resolves as soon as the static file is read;
 * - `loadHelpArticlesWithIndicators()` resolves once the indicator pages are
 *   merged in (from the file, or from the API — which may be slower).
 * Callers that show titles use the first and upgrade to the second.
 */

import logger from '@/lib/loggerInstance';
import {
  getAllIndicators,
  indicatorToHelpDoc,
  isMovedIndicatorItem,
} from '@/services/contentApi';
import type {
  HelpDocMetadata,
  IndicatorDocMetadata,
} from '@/types/helpCenter';

const LOG_PREFIX = '[HelpCenter]';

interface CachedHelpArticles {
  fetchedAt: string;
  articles: HelpDocMetadata[];
  indicators?: IndicatorDocMetadata[];
}

let payloadPromise: Promise<CachedHelpArticles | null> | null = null;
let indicatorsPromise: Promise<IndicatorDocMetadata[]> | null = null;
let articlesPromise: Promise<HelpDocMetadata[]> | null = null;
let mergedPromise: Promise<HelpDocMetadata[]> | null = null;

function loadPayload(): Promise<CachedHelpArticles | null> {
  if (payloadPromise) return payloadPromise;

  payloadPromise = fetch('/help-articles.json')
    .then(async (res) => {
      if (!res.ok) {
        logger.debug(
          `${LOG_PREFIX} No cached help articles found (status ${res.status})`
        );
        return null;
      }
      const payload = (await res.json()) as CachedHelpArticles;
      logger.info(
        `${LOG_PREFIX} Loaded ${payload.articles.length} cached help articles (fetched at ${payload.fetchedAt})`
      );
      return payload;
    })
    .catch((err) => {
      logger.debug(`${LOG_PREFIX} Failed to load cached help articles`, {
        error: String(err),
      });
      return null;
    });

  return payloadPromise;
}

/**
 * Merge help docs with indicator pages, one entry per slug. An indicator page
 * replaces a help doc with the same slug (the article moved there).
 */
export function mergeHelpAndIndicators(
  articles: HelpDocMetadata[],
  indicators: IndicatorDocMetadata[]
): HelpDocMetadata[] {
  const bySlug = new Map<string, HelpDocMetadata>();
  for (const article of articles) bySlug.set(article.slug, article);
  for (const indicator of indicators) {
    bySlug.set(indicator.slug, indicatorToHelpDoc(indicator));
  }
  return [...bySlug.values()];
}

/**
 * Load the indicator pages: from the static JSON when it has them, else from
 * the content API. Empty when neither has any.
 */
export function loadCachedIndicators(): Promise<IndicatorDocMetadata[]> {
  if (indicatorsPromise) return indicatorsPromise;

  indicatorsPromise = loadPayload().then(async (payload) => {
    if (payload?.indicators && payload.indicators.length > 0) {
      return payload.indicators;
    }
    try {
      const live = await getAllIndicators();
      logger.info(`${LOG_PREFIX} Loaded ${live.length} indicator pages`);
      return live;
    } catch (err) {
      logger.debug(`${LOG_PREFIX} Failed to load indicator pages`, {
        error: String(err),
      });
      return [];
    }
  });

  return indicatorsPromise;
}

/**
 * The static help articles, plus the indicator pages the static file
 * carries. Resolves without waiting on the content API.
 * Returns an empty array if the file is missing (e.g. dev mode without
 * prebuild). The result is cached – subsequent calls return the same promise.
 */
export function loadCachedHelpArticles(): Promise<HelpDocMetadata[]> {
  if (articlesPromise) return articlesPromise;

  articlesPromise = loadPayload().then((payload) =>
    mergeHelpAndIndicators(payload?.articles ?? [], payload?.indicators ?? [])
  );

  return articlesPromise;
}

/** The help articles merged with every indicator page, once those load. */
export function loadHelpArticlesWithIndicators(): Promise<HelpDocMetadata[]> {
  if (mergedPromise) return mergedPromise;

  mergedPromise = Promise.all([
    loadCachedHelpArticles(),
    loadCachedIndicators(),
  ]).then(([articles, indicators]) =>
    mergeHelpAndIndicators(articles, indicators)
  );

  return mergedPromise;
}

/**
 * Whether `slug` is a known indicator page: listed by `/indicators`, or a
 * help item marked as moved there.
 */
export async function isIndicatorSlug(slug: string): Promise<boolean> {
  const [articles, indicators] = await Promise.all([
    loadCachedHelpArticles(),
    loadCachedIndicators(),
  ]);
  return (
    indicators.some((i) => i.slug === slug) ||
    articles.some((a) => a.slug === slug && isMovedIndicatorItem(a))
  );
}

/** Clear the cache so the next call re-fetches */
export function clearCachedHelpArticles(): void {
  payloadPromise = null;
  indicatorsPromise = null;
  articlesPromise = null;
  mergedPromise = null;
}
