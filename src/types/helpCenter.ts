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
  /** Raw price-behaviour data; read only through `sanitizeIndicatorEdge`. */
  edge?: unknown;
}

// ─── Indicator edge (price behaviour vs random entries) ─────────────────────

/**
 * Verdict on one setting: above the luck band and robust (`edge`), above it
 * but carried by one stretch (`fragile`), inside it (`none`), below it
 * (`worse`, `fragile-worse`), or too few separate moves to judge (`few`).
 */
export type IndicatorEdgeVerdict =
  | 'edge'
  | 'fragile'
  | 'none'
  | 'worse'
  | 'fragile-worse'
  | 'few';

/** A setting's result, pooled over the coins or within one market trend. */
export interface IndicatorEdgeCell {
  entries: number;
  episodes: number;
  /** Edge over random entries at the horizon, in percent. */
  edge: number;
  /** Luck band (5th to 95th percentile of random copies), in percent. */
  chance: [number, number];
  verdict: IndicatorEdgeVerdict;
}

/** The bot-form indicator config that reproduces a tested setting exactly. */
export interface IndicatorEdgeBotConfig {
  /** An `IndicatorEnum` value. */
  type: string;
  /** Catalog field key → value. */
  params: Record<string, string | number | boolean | string[] | number[]>;
}

export interface IndicatorEdgeSetting {
  id: string;
  /** Candle timeframe, e.g. `1h`, `4h`, `1d`. */
  tf: string;
  label: string;
  side: 'long' | 'short';
  pooled: IndicatorEdgeCell;
  regimes?: { up: IndicatorEdgeCell; down: IndicatorEdgeCell };
  /** `null` when no bot-form config reproduces the tested condition. */
  bot: IndicatorEdgeBotConfig | null;
}

export interface IndicatorEdgeMethod {
  horizon: number;
  horizons: number[];
  randomDraws: number;
  minEpisodes: number;
  source: string;
  pairs: string[];
  from: string;
  to: string;
  regime?: { sma: number };
}

/** `edge` on GET /indicators/:slug, rebuilt from known fields. */
export interface IndicatorEdge {
  updatedAt: string;
  defaultTf: string;
  method: IndicatorEdgeMethod;
  settings: IndicatorEdgeSetting[];
}

/**
 * An article as the in-app Help Center renders it: a help doc, or an
 * indicator page mapped onto the help-doc shape.
 */
export interface HelpArticleResponse {
  metadata: HelpDocMetadata & Partial<HelpDocFullMetadata>;
  content: string;
  source: 'help' | 'indicator';
  /** Price-behaviour data of an indicator page, when it has valid data. */
  edge?: IndicatorEdge;
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
