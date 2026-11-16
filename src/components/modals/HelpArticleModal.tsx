/**
 * HelpArticleModal – renders a help article in a dialog overlay.
 *
 * Used by the Tooltip component to open internal /help/:slug articles
 * without navigating away from the current page.
 */

import { IndicatorEdgePanel } from '@/components/indicators/IndicatorEdgePanel';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import logger from '@/lib/loggerInstance';
import { getHelpArticle } from '@/services/contentApi';
import type { HelpArticleResponse } from '@/types/helpCenter';
import { isIndicatorSlug } from '@/utils/helpArticlesCache';
import { parseHelpUrl, toInAppArticleHref } from '@/utils/helpUrl';
import { BookOpen, Calendar, Clock, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { Components } from 'react-markdown';
import { ArticleMarkdown } from '../help/ArticleMarkdown';
import { ARTICLE_LINK_CLASS as LINK_CLASS } from '../help/articleMarkdownElements';

const LOG_PREFIX = '[HelpCenter]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCategoryLabel(s: string) {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return s;
  }
}

function formatSlugTitle(slug: string | null): string {
  if (!slug) return 'Article';
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

const ArticleSkeleton: React.FC = () => (
  <div className="space-y-sm p-md">
    <Skeleton className="h-7 w-3/4" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <div className="space-y-xs">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3 w-full"
          style={{ width: `${75 + (i % 3) * 10}%` }}
        />
      ))}
    </div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface HelpArticleModalProps {
  slug: string | null;
  onClose: () => void;
}

export const HelpArticleModal: React.FC<HelpArticleModalProps> = ({
  slug,
  onClose,
}) => {
  const [article, setArticle] = useState<HelpArticleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // an in-app article link followed inside the modal; reset per opened slug
  const [linkedSlug, setLinkedSlug] = useState<string | null>(null);
  useEffect(() => setLinkedSlug(null), [slug]);
  const activeSlug = slug ? (linkedSlug ?? slug) : null;

  const components = useMemo<Partial<Components>>(
    () => ({
      a: ({ children, href, ...props }) => {
        const target = toInAppArticleHref(href);
        const inAppSlug = target?.startsWith('/help/')
          ? parseHelpUrl(target).helpSlug
          : null;
        if (inAppSlug) {
          return (
            <a
              href={target}
              className={LINK_CLASS}
              {...props}
              onClick={(e) => {
                e.preventDefault();
                setLinkedSlug(inAppSlug);
              }}
            >
              {children}
            </a>
          );
        }
        return (
          <a
            href={target}
            target={target?.startsWith('http') ? '_blank' : undefined}
            rel={target?.startsWith('http') ? 'noopener noreferrer' : undefined}
            className={LINK_CLASS}
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    []
  );

  useEffect(() => {
    const current = activeSlug;
    if (!current) return undefined;
    let active = true;
    setArticle(null);
    setError(null);
    setLoading(true);
    logger.info(`${LOG_PREFIX} Modal loading article: ${current}`);
    isIndicatorSlug(current)
      .then((isIndicator) => getHelpArticle(current, isIndicator))
      .then((doc) => {
        if (!active) return;
        setArticle(doc);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof Error ? err.message : 'Failed to load article';
        logger.error(`${LOG_PREFIX} Modal fetch error`, {
          slug: current,
          error: msg,
        });
        setError(msg);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeSlug]);

  const metadata = article?.metadata;
  const displayTitle = loading
    ? 'Loading…'
    : (metadata?.title ?? formatSlugTitle(activeSlug));

  return (
    <Dialog
      open={!!slug}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        zIndex={90}
        className="max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden"
      >
        <DialogHeader className="glass-surface sticky top-0 z-10 rounded-t-lg px-md pt-8 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-sm">
            <div className="flex items-center gap-xs min-w-0">
              <BookOpen className="w-5 h-5 text-muted-foreground shrink-0" />
              <DialogTitle className="text-2xl font-semibold leading-tight truncate">
                {displayTitle}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-1 rounded-sm hover:bg-muted/50 transition-colors"
              aria-label="Close article modal"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Meta: date + categories */}
          {metadata && (
            <div className="flex flex-wrap items-center gap-sm text-sm text-muted-foreground">
              {metadata.publishedAt && (
                <span className="flex items-center gap-xs">
                  <Calendar className="w-3 h-3" />
                  {formatDate(metadata.publishedAt)}
                </span>
              )}
              {metadata.updatedAt &&
                metadata.updatedAt !== metadata.publishedAt && (
                  <span className="flex items-center gap-xs">
                    <Clock className="w-3 h-3" />
                    Updated {formatDate(metadata.updatedAt)}
                  </span>
                )}
              {metadata.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {formatCategoryLabel(cat)}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && <ArticleSkeleton />}

          {error && (
            <div className="p-md">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-sm">
                <p className="text-sm text-destructive font-medium">
                  Failed to load article
                </p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          )}

          {!loading && article && metadata && (
            <div className="p-md space-y-md">
              {/* Read-only here: the bot form's indicator editors apply. */}
              {article.edge ? (
                <IndicatorEdgePanel
                  key={metadata.slug}
                  edge={article.edge}
                  slug={metadata.slug}
                />
              ) : null}

              {/* TL;DR */}
              {metadata.tldr && (
                <div className="flex items-start gap-sm p-sm bg-muted/30 border border-primary/20 rounded-lg">
                  <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">TL;DR</p>
                    <p className="text-foreground/80 leading-relaxed">
                      {metadata.tldr}
                    </p>
                  </div>
                </div>
              )}

              {/* Content */}
              <ArticleMarkdown components={components}>
                {article.content}
              </ArticleMarkdown>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
