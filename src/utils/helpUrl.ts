/**
 * Shared parser for help-article URLs.
 *
 * Accepts a raw tooltip / link URL and, if it points at an internal
 * `/help/:slug` article (either a bare path or a full `gainium.io/help/...`
 * URL), returns the normalized internal path and the slug. Returns nulls for
 * anything that isn't an internal help article so callers can fall back to a
 * plain external link.
 *
 * Used by both the Tooltip "read more" pill and the standalone
 * `HelpArticlePill` so the two stay in lock-step.
 */

export interface ParsedHelpUrl {
  internalHelpPath: string | null;
  helpSlug: string | null;
}

export const parseHelpUrl = (url?: string): ParsedHelpUrl => {
  if (!url) {
    return { internalHelpPath: null, helpSlug: null };
  }

  const normalizedInput = url.trim();
  let helpPath: string | null = null;

  if (normalizedInput.startsWith('/help')) {
    helpPath = normalizedInput;
  } else {
    try {
      const parsed = new URL(normalizedInput);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host === 'gainium.io' && parsed.pathname.startsWith('/help')) {
        helpPath = parsed.pathname;
      }
    } catch {
      return { internalHelpPath: null, helpSlug: null };
    }
  }

  if (!helpPath) {
    return { internalHelpPath: null, helpSlug: null };
  }

  const cleanPath = helpPath.split('?')[0].split('#')[0];
  const trimmedPath = cleanPath.replace(/\/+$/, '');
  const normalizedPath = trimmedPath.length > 0 ? trimmedPath : '/help';

  if (normalizedPath === '/help') {
    return { internalHelpPath: '/help', helpSlug: null };
  }

  const slugPrefix = '/help/';
  if (!normalizedPath.startsWith(slugPrefix)) {
    return { internalHelpPath: null, helpSlug: null };
  }

  const slug = normalizedPath.slice(slugPrefix.length).split('/')[0] ?? null;
  if (!slug) {
    return { internalHelpPath: '/help', helpSlug: null };
  }

  return {
    internalHelpPath: `${slugPrefix}${slug}`,
    helpSlug: slug,
  };
};

/** Turn a slug ("connect-to-binance") into a Title Case label. */
export const formatHelpSlugTitle = (slug: string): string =>
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const INDICATOR_PATH = /^\/indicators\/([^/?#]+)\/?([?#].*)?$/;

/**
 * Map a link inside an article to the dashboard's own Help Center when it
 * points at an indicator page — `/indicators/<slug>` or
 * `https://(www.)gainium.io/indicators/<slug>` → `/help/<slug>` (the hash is
 * kept). Any other href is returned unchanged.
 */
export const toInAppArticleHref = (href?: string): string | undefined => {
  if (!href) return href;
  const trimmed = href.trim();

  let pathWithRest: string | null = null;
  if (trimmed.startsWith('/indicators/')) {
    pathWithRest = trimmed;
  } else {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.replace(/^www\./, '');
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        host === 'gainium.io'
      ) {
        pathWithRest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return href;
    }
  }

  const match = pathWithRest ? INDICATOR_PATH.exec(pathWithRest) : null;
  if (!match) return href;
  const hash = match[2]?.includes('#') ? match[2].slice(match[2].indexOf('#')) : '';
  return `/help/${match[1]}${hash}`;
};
