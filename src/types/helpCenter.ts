/**
 * Types for the Gainium Content API (https://content.gainium.io)
 * Used by the in-app Help Center feature.
 */

// ─── Pagination ─────────────────────────────────────────────────────────────

export interface ContentPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─── Help Document ──────────────────────────────────────────────────────────

/** Metadata returned in list/browse endpoints (no content) */
export interface HelpDocMetadata {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  tldr: string;
  updatedAt: string;
  publishedAt: string;
  /** Set on an indicator page still served as a help item, e.g. `/indicators/rsi`. */
  movedTo?: string;
  /** Set on an indicator page still served as a help item. */
  kind?: IndicatorKind;
}

/** Full metadata returned when fetching a single doc by slug */
export interface HelpDocFullMetadata extends HelpDocMetadata {
  id: number;
  name: string;
  createdAt: string;
  locale: string;
  difficulty?: string;
  ingested?: boolean;
  ingestedAt?: string;
}

/** Document with content (from /full endpoints or by-slug) */
export interface HelpDocWithContent {
  metadata: HelpDocMetadata | HelpDocFullMetadata;
  content: string;
}

/** Single doc response (GET /help/:slug) */
export interface HelpDocBySlugResponse {
  metadata: HelpDocFullMetadata;
  content: string;
  /** Set when the article has moved to another content type, e.g. `/indicators/rsi`. */
  movedTo?: string;
}

/** Paginated list of metadata-only docs */
export interface HelpDocsListResponse {
  data: HelpDocMetadata[];
  pagination: ContentPagination;
}

/** Paginated list of docs with content */
export interface HelpDocsFullListResponse {
  data: HelpDocWithContent[];
  pagination: ContentPagination;
}

// ─── Indicator ──────────────────────────────────────────────────────────────

/** Help Center category that lists the indicator pages. */
export const INDICATORS_CATEGORY = 'technical-indicators';

export type IndicatorKind = 'native' | 'builtin' | 'community';

/** Indicator page metadata (GET /indicators, GET /indicators/:slug) */
export interface IndicatorDocMetadata {
  slug: string;
  name: string;
  kind: IndicatorKind;
  aliases: string[];
  /** trend / momentum / volatility / volume / structure / composite */
  category: string;
  description: string;
  tldr: string;
  /** Indicator catalog keys this page documents */
  catalogKeys: string[];
  updatedAt: string;
  publishedAt?: string;
}

/** Paginated list of indicator pages (GET /indicators) */
export interface IndicatorsListResponse {
  data: IndicatorDocMetadata[];
  pagination: ContentPagination;
}

/** Single indicator page (GET /indicators/:slug) */
export interface IndicatorDocBySlugResponse {
  metadata: IndicatorDocMetadata;
  content: string;
}

/**
 * An article as the in-app Help Center renders it: a help doc, or an
 * indicator page mapped onto the help-doc shape.
 */
export interface HelpArticleResponse {
  metadata: HelpDocMetadata & Partial<HelpDocFullMetadata>;
  content: string;
  source: 'help' | 'indicator';
}

// ─── Blog Post ──────────────────────────────────────────────────────────────

/** Blog post metadata */
export interface BlogPostMetadata {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  tldr: string;
  updatedAt: string;
  publishedAt: string;
}

export interface BlogPostFullMetadata extends BlogPostMetadata {
  id: number;
  name: string;
  createdAt: string;
  locale: string;
}

export interface BlogPostWithContent {
  metadata: BlogPostMetadata | BlogPostFullMetadata;
  content: string;
}

export interface BlogPostBySlugResponse {
  metadata: BlogPostFullMetadata;
  content: string;
}

export interface BlogPostsListResponse {
  data: BlogPostMetadata[];
  pagination: ContentPagination;
}

export interface BlogPostsFullListResponse {
  data: BlogPostWithContent[];
  pagination: ContentPagination;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export type ContentSource = 'help' | 'blog' | 'indicator';

export interface SearchResultItem {
  source: ContentSource;
  slug: string;
  title: string;
  description: string;
  match: string;
  relevance: number;
  /** Set on an indicator page returned as a help item, e.g. `/indicators/rsi`. */
  movedTo?: string;
  kind?: IndicatorKind;
}

export interface SearchResultsResponse {
  query: string;
  data: SearchResultItem[];
  pagination: ContentPagination;
}

export interface SearchFullResultItem {
  source: ContentSource;
  slug: string;
  title: string;
  description: string;
  match: string;
  relevance: number;
  content: string;
}

export interface SearchFullResultsResponse {
  query: string;
  data: SearchFullResultItem[];
  pagination: ContentPagination;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export interface ContentMetadataResponse {
  lastCommit: string;
  [key: string]: unknown;
}
