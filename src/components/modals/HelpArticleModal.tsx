/**
 * HelpArticleModal – renders a help article in a dialog overlay.
 *
 * Used by the Tooltip component to open internal /help/:slug articles
 * without navigating away from the current page.
 */

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import logger from '@/lib/loggerInstance';
import { getHelpDoc } from '@/services/contentApi';
import type { HelpDocBySlugResponse } from '@/types/helpCenter';
import { BookOpen, Calendar, Clock, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getStandaloneYouTubeHref,
  YouTubeEmbed,
} from '../ui/YouTubeEmbed';

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

function transformImageSrc(src: string | undefined): string {
  if (!src) return '';
  return src.startsWith('/images') ? `https://gainium.io${src}` : src;
}

function formatSlugTitle(slug: string | null): string {
  if (!slug) return 'Article';
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ─── Markdown components ──────────────────────────────────────────────────────

const markdownComponents: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <h1
      className="text-xl font-bold text-foreground mt-8 mb-4 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-lg font-semibold text-foreground mt-6 mb-3" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-base font-semibold text-foreground mt-5 mb-2"
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="font-semibold text-foreground mt-4 mb-2" {...props}>
      {children}
    </h4>
  ),
  p: ({ children, node, ...props }) => {
    // A paragraph that is just a bare YouTube link becomes an inline embed
    const youTubeHref = getStandaloneYouTubeHref(node?.children);
    if (youTubeHref) return <YouTubeEmbed url={youTubeHref} />;
    return (
      <p className="text-foreground/90 leading-relaxed mb-4" {...props}>
        {children}
      </p>
    );
  },
  ul: ({ children, ...props }) => (
    <ul
      className="text-foreground/90 list-disc list-inside mb-4 space-y-1 pl-2"
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      className="text-foreground/90 list-decimal list-inside mb-4 space-y-1 pl-2"
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-foreground/90 leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-primary/40 pl-4 my-4 text-muted-foreground italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="block bg-muted rounded-lg p-md text-sm font-mono text-foreground overflow-x-auto my-4"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      className="bg-muted rounded-lg p-md text-sm font-mono overflow-x-auto my-4"
      {...props}
    >
      {children}
    </pre>
  ),
  img: ({ src, alt, ...props }) => (
    <img
      src={transformImageSrc(src)}
      alt={alt || ''}
      className="rounded-lg border border-border/40 max-w-full my-4"
      loading="lazy"
      {...props}
    />
  ),
  hr: (props) => <hr className="border-border/40 my-6" {...props} />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table
        className="w-full border-collapse border border-border/40 rounded-lg"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      className="bg-muted/50 px-3 py-2 text-left text-sm font-semibold text-foreground border border-border/40"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-3 py-2 text-foreground/90 border border-border/40"
      {...props}
    >
      {children}
    </td>
  ),
};

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
  const [article, setArticle] = useState<HelpDocBySlugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setArticle(null);
    setError(null);
    setLoading(true);
    logger.info(`${LOG_PREFIX} Modal loading article: ${slug}`);
    getHelpDoc(slug)
      .then((doc) => {
        setArticle(doc);
        setLoading(false);
      })
      .catch((err) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to load article';
        logger.error(`${LOG_PREFIX} Modal fetch error`, { slug, error: msg });
        setError(msg);
        setLoading(false);
      });
  }, [slug]);

  const metadata = article?.metadata;
  const displayTitle = loading
    ? 'Loading…'
    : (metadata?.title ?? formatSlugTitle(slug));

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
              <div className="help-article-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {article.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
