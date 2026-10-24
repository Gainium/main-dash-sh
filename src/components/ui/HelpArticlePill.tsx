/**
 * HelpArticlePill — the article-link pill used across the app (tooltips,
 * the add-exchange dialog, etc). Mirrors the pill rendered inline in the
 * Max AI chat: a rounded, tinted "open this help article" chip with a
 * BookOpen icon and the article's title.
 *
 * - Internal `/help/:slug` URLs open the `HelpArticleModal` in place
 *   (or call `onActivate` when the pill lives inside an ephemeral container
 *   like a tooltip portal that would unmount the modal on close).
 * - `/help` (no slug) renders a normal internal link.
 * - Anything else renders an external link that opens in a new tab.
 *
 * The article title is resolved from the help-articles cache (static help
 * docs first, then indicator pages); while that loads (or if the slug isn't
 * cached) it falls back to the Title-cased slug, or an explicit `label`.
 */

import { BookOpen, ExternalLink } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  loadCachedHelpArticles,
  loadHelpArticlesWithIndicators,
} from '../../utils/helpArticlesCache';
import { formatHelpSlugTitle, parseHelpUrl } from '../../utils/helpUrl';
import { HelpArticleModal } from '../modals/HelpArticleModal';

interface HelpArticlePillProps {
  /** Raw URL: `/help/slug`, `/help`, a full gainium.io/help URL, or external. */
  url?: string;
  /** Override the auto-resolved label. */
  label?: string;
  className?: string;
  /**
   * Called instead of opening the internal modal. Pass this when the pill is
   * rendered inside a container that unmounts on close (e.g. a tooltip
   * portal) and should delegate modal ownership to a stable parent.
   */
  onActivate?: (slug: string) => void;
}

const PILL_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-ai-assistant-start/30 bg-ai-assistant-start/10 px-2 py-0.5 text-xs text-ai-assistant-start hover:bg-ai-assistant-start/15 transition-colors max-w-full align-middle';

export const HelpArticlePill: React.FC<HelpArticlePillProps> = ({
  url,
  label,
  className,
  onActivate,
}) => {
  const { internalHelpPath, helpSlug } = parseHelpUrl(url);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // a new slug must not keep the previous article's title while (or if)
    // its own is not in the cache
    setResolvedTitle(null);
    if (label || !helpSlug) return undefined;
    let active = true;
    const resolve = (articles: { slug: string; title: string }[]) => {
      if (!active) return;
      const found = articles.find((a) => a.slug === helpSlug);
      if (found) setResolvedTitle(found.title);
    };
    // the static list answers at once; indicator pages may arrive later
    void loadCachedHelpArticles().then(resolve);
    void loadHelpArticlesWithIndicators().then(resolve);
    return () => {
      active = false;
    };
  }, [helpSlug, label]);

  if (!url) return null;

  const displayLabel =
    label ??
    resolvedTitle ??
    (helpSlug ? formatHelpSlugTitle(helpSlug) : 'Read article');

  // Internal help article → open the modal (or delegate via onActivate).
  if (helpSlug) {
    return (
      <>
        <button
          type="button"
          className={cn(PILL_CLASS, className)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onActivate) onActivate(helpSlug);
            else setOpen(true);
          }}
        >
          <BookOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </button>
        {!onActivate && (
          <HelpArticleModal
            slug={open ? helpSlug : null}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }

  // `/help` root → internal link.
  if (internalHelpPath) {
    return (
      <a
        href={internalHelpPath}
        className={cn(PILL_CLASS, className)}
        onClick={(e) => e.stopPropagation()}
      >
        <BookOpen className="h-3 w-3 shrink-0" />
        <span className="truncate">{displayLabel}</span>
      </a>
    );
  }

  // External URL → new tab.
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(PILL_CLASS, className)}
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3 shrink-0" />
      <span className="truncate">{displayLabel}</span>
    </a>
  );
};

export default HelpArticlePill;
