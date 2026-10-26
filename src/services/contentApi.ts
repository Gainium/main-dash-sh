/**
 * Gainium Content API service.
 *
 * Thin fetch-based client for https://content.gainium.io (override with
 * `VITE_CONTENT_API_URL`, e.g. a local content server).
 * Used by the in-app Help Center and blog features.
 */

import logger from '@/lib/loggerInstance';
import {
  INDICATORS_CATEGORY,
  type BlogPostBySlugResponse,
  type BlogPostsFullListResponse,
  type BlogPostsListResponse,
  type HelpArticleResponse,
  type HelpDocBySlugResponse,
  type HelpDocMetadata,
  type HelpDocsFullListResponse,
  type HelpDocsListResponse,
  type IndicatorDocBySlugResponse,
  type IndicatorDocMetadata,
  type IndicatorsListResponse,
  type SearchFullResultsResponse,
  type SearchResultItem,
  type SearchResultsResponse,
} from '@/types/helpCenter';
import { sanitizeIndicatorEdge } from '@/utils/indicatorEdge';

const DEFAULT_BASE_URL = 'https://content.gainium.io';
const BASE_URL = (
  import.meta.env.VITE_CONTENT_API_URL || DEFAULT_BASE_URL
).replace(/\/+$/, '');
const LOG_PREFIX = '[HelpCenter]';

/** Largest page the listing endpoints serve. */
const MAX_PAGE_SIZE = 100;

/** A content request that takes longer than this fails instead of hanging. */
const REQUEST_TIMEOUT_MS = 8000;

/** Error carrying the HTTP status, so callers can tell "absent" from "down". */
export class ContentApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ContentApiError';
    this.status = status;
  }
}

export function isContentNotFound(err: unknown): boolean {
  return err instanceof ContentApiError && err.status === 404;
}

// ─── Generic fetcher ────────────────────────────────────────────────────────

interface FetchOptions {
  /** A 404 is an expected answer here (e.g. an endpoint older servers lack). */
  notFoundIsExpected?: boolean;
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

async function fetchContent<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  logger.debug(`${LOG_PREFIX} Fetching ${url}`);

  const res = await fetch(url, { signal: timeoutSignal() });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    const log =
      res.status === 404 && options.notFoundIsExpected
        ? logger.debug
        : logger.error;
    log.call(logger, `${LOG_PREFIX} API error ${res.status} for ${url}`, {
      status: res.status,
      body: errorText,
    });
    throw new ContentApiError(
      res.status,
      `Content API error: ${res.status} – ${errorText}`
    );
  }

  const data = (await res.json()) as T;
  return data;
}

// ─── Query-string helpers ───────────────────────────────────────────────────

function paginationParams(page?: number, limit?: number): string {
  const parts: string[] = [];
  if (page) parts.push(`page=${page}`);
  if (limit) parts.push(`limit=${limit}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function searchParams(query: string, page?: number, limit?: number): string {
  const parts = [`q=${encodeURIComponent(query)}`];
  if (page) parts.push(`page=${page}`);
  if (limit) parts.push(`limit=${limit}`);
  return `?${parts.join('&')}`;
}

// ─── Help Documentation ────────────────────────────────────────────────────

/** Get all help docs metadata (paginated, max 100/page) */
export function getHelpDocs(page?: number, limit?: number) {
  return fetchContent<HelpDocsListResponse>(
    `/help${paginationParams(page, limit)}`
  );
}

/** Get all help docs with content (paginated, max 20/page) */
export function getHelpDocsFull(page?: number, limit?: number) {
  return fetchContent<HelpDocsFullListResponse>(
    `/help/full${paginationParams(page, limit)}`
  );
}

/** Get help docs by category (metadata only) */
export function getHelpDocsByCategory(
  categoryId: string,
  page?: number,
  limit?: number
) {
  return fetchContent<HelpDocsListResponse>(
    `/help/category/${encodeURIComponent(categoryId)}${paginationParams(page, limit)}`
  );
}

/** Get help docs by category with content */
export function getHelpDocsByCategoryFull(
  categoryId: string,
  page?: number,
  limit?: number
) {
  return fetchContent<HelpDocsFullListResponse>(
    `/help/category/${encodeURIComponent(categoryId)}/full${paginationParams(page, limit)}`
  );
}

/** Get help docs by tag (metadata only) */
export function getHelpDocsByTag(tagId: string, page?: number, limit?: number) {
  return fetchContent<HelpDocsListResponse>(
    `/help/tag/${encodeURIComponent(tagId)}${paginationParams(page, limit)}`
  );
}

/** Get help docs by tag with content */
export function getHelpDocsByTagFull(
  tagId: string,
  page?: number,
  limit?: number
) {
  return fetchContent<HelpDocsFullListResponse>(
    `/help/tag/${encodeURIComponent(tagId)}/full${paginationParams(page, limit)}`
  );
}

/** Get full help doc by slug (always includes content) */
export function getHelpDoc(slug: string) {
  return fetchContent<HelpDocBySlugResponse>(
    `/help/${encodeURIComponent(slug)}`
  );
}

/** Every help doc's metadata, all pages. */
export async function getAllHelpDocs(categoryId?: string) {
  const all: HelpDocMetadata[] = [];
  for (let page = 1; ; page++) {
    const res = categoryId
      ? await getHelpDocsByCategory(categoryId, page, MAX_PAGE_SIZE)
      : await getHelpDocs(page, MAX_PAGE_SIZE);
    all.push(...res.data);
    if (!res.pagination?.hasNext) return all;
  }
}

// ─── Indicators ─────────────────────────────────────────────────────────────

/** Indicator pages built into Gainium (paginated, max 100/page) */
export function getIndicators(page?: number, limit?: number) {
  return fetchContent<IndicatorsListResponse>(
    `/indicators${paginationParams(page, limit)}`,
    { notFoundIsExpected: true }
  );
}

/** Full indicator page by slug */
export function getIndicator(slug: string) {
  return fetchContent<IndicatorDocBySlugResponse>(
    `/indicators/${encodeURIComponent(slug)}`,
    { notFoundIsExpected: true }
  );
}

/**
 * Whether a help listing or search item is really an indicator page: during
 * the move, `/help` and `/search` still serve indicator pages as help items
 * marked with `movedTo: /indicators/<slug>` and `kind`.
 */
export function isMovedIndicatorItem(item: {
  movedTo?: string;
  kind?: string;
}): boolean {
  return Boolean(item.movedTo?.startsWith('/indicators/')) || !!item.kind;
}

/**
 * One search result per article. A slug can come back both as a help item
 * (marked as moved) and as an indicator page; keep the first position and
 * prefer the indicator form. Blog posts are a separate namespace.
 */
export function dedupeSearchResults(
  items: SearchResultItem[]
): SearchResultItem[] {
  const out: SearchResultItem[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = `${item.source === 'blog' ? 'blog' : 'article'}:${item.slug}`;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, out.length);
      out.push(item);
    } else if (item.source === 'indicator' && out[at].source !== 'indicator') {
      out[at] = item;
    }
  }
  return out;
}

/**
 * Every indicator page, all pages. Resolves to an empty list when the
 * content server has no `/indicators` endpoint (older deployments).
 */
export async function getAllIndicators(): Promise<IndicatorDocMetadata[]> {
  const all: IndicatorDocMetadata[] = [];
  try {
    for (let page = 1; ; page++) {
      const res = await getIndicators(page, MAX_PAGE_SIZE);
      all.push(...res.data);
      if (!res.pagination?.hasNext) return all;
    }
  } catch (err) {
    if (isContentNotFound(err)) return [];
    throw err;
  }
}

/** Map an indicator page onto the help-doc shape the Help Center renders. */
export function indicatorToHelpDoc(
  meta: IndicatorDocMetadata
): HelpDocMetadata {
  const updatedAt = meta.updatedAt ?? '';
  return {
    slug: meta.slug,
    title: meta.name || meta.slug,
    description: meta.description ?? '',
    categories: [INDICATORS_CATEGORY],
    tags: [],
    tldr: meta.tldr ?? '',
    updatedAt,
    publishedAt: meta.publishedAt ?? updatedAt,
    kind: meta.kind,
  };
}

function fromIndicator(doc: IndicatorDocBySlugResponse): HelpArticleResponse {
  const article: HelpArticleResponse = {
    // keep page fields such as difficulty; the help-doc fields take precedence
    metadata: { ...doc.metadata, ...indicatorToHelpDoc(doc.metadata) },
    content: doc.content,
    source: 'indicator',
  };
  const edge = sanitizeIndicatorEdge(doc.edge);
  if (edge) article.edge = edge;
  return article;
}

function fromHelp(doc: HelpDocBySlugResponse): HelpArticleResponse {
  // GET /help/:slug names the article in `name`; listings call it `title`
  const title = doc.metadata.title || doc.metadata.name || doc.metadata.slug;
  return {
    metadata: { ...doc.metadata, title },
    content: doc.content,
    source: 'help',
  };
}

/** `/indicators/<slug>` → `<slug>`, for a help doc that has moved. */
function movedIndicatorSlug(doc: HelpDocBySlugResponse): string | null {
  const match = /^\/indicators\/([^/?#]+)/.exec(doc.movedTo ?? '');
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Load an article for the in-app Help Center.
 *
 * - `isIndicator`: the slug is a known indicator page → `/indicators/:slug`,
 *   falling back to `/help/:slug` if that fails (content servers without
 *   the indicators endpoint answer 404).
 * - Otherwise `/help/:slug`; a doc marked `movedTo: /indicators/...` is
 *   loaded from there, and a 404 tries `/indicators/:slug` before giving up.
 */
export async function getHelpArticle(
  slug: string,
  isIndicator = false
): Promise<HelpArticleResponse> {
  if (isIndicator) {
    try {
      return fromIndicator(await getIndicator(slug));
    } catch (err) {
      logger.debug(`${LOG_PREFIX} Indicator page unavailable, using /help`, {
        slug,
        error: String(err),
      });
      return fromHelp(await getHelpDoc(slug));
    }
  }

  let help: HelpDocBySlugResponse;
  try {
    help = await getHelpDoc(slug);
  } catch (err) {
    if (!isContentNotFound(err)) throw err;
    try {
      return fromIndicator(await getIndicator(slug));
    } catch {
      throw err;
    }
  }

  const moved = movedIndicatorSlug(help);
  if (moved) {
    try {
      return fromIndicator(await getIndicator(moved));
    } catch (err) {
      logger.debug(`${LOG_PREFIX} Moved article unavailable, using /help`, {
        slug,
        error: String(err),
      });
    }
  }
  return fromHelp(help);
}

// ─── Blog Posts ─────────────────────────────────────────────────────────────

/** Get all blog posts metadata (paginated) */
export function getBlogPosts(page?: number, limit?: number) {
  return fetchContent<BlogPostsListResponse>(
    `/blog${paginationParams(page, limit)}`
  );
}

/** Get all blog posts with content (paginated) */
export function getBlogPostsFull(page?: number, limit?: number) {
  return fetchContent<BlogPostsFullListResponse>(
    `/blog/full${paginationParams(page, limit)}`
  );
}

/** Get blog posts by category (metadata only) */
export function getBlogPostsByCategory(
  categoryId: string,
  page?: number,
  limit?: number
) {
  return fetchContent<BlogPostsListResponse>(
    `/blog/category/${encodeURIComponent(categoryId)}${paginationParams(page, limit)}`
  );
}

/** Get blog posts by tag (metadata only) */
export function getBlogPostsByTag(
  tagId: string,
  page?: number,
  limit?: number
) {
  return fetchContent<BlogPostsListResponse>(
    `/blog/tag/${encodeURIComponent(tagId)}${paginationParams(page, limit)}`
  );
}

/** Get full blog post by slug */
export function getBlogPost(slug: string) {
  return fetchContent<BlogPostBySlugResponse>(
    `/blog/${encodeURIComponent(slug)}`
  );
}

// ─── Search ─────────────────────────────────────────────────────────────────

/** Search across all content (metadata with match excerpt) */
export async function searchContent(
  query: string,
  page?: number,
  limit?: number
): Promise<SearchResultsResponse> {
  const res = await fetchContent<SearchResultsResponse>(
    `/search${searchParams(query, page, limit)}`
  );
  return { ...res, data: dedupeSearchResults(res.data) };
}

/** Search with full document content */
export function searchContentFull(
  query: string,
  page?: number,
  limit?: number
) {
  return fetchContent<SearchFullResultsResponse>(
    `/search/full${searchParams(query, page, limit)}`
  );
}
