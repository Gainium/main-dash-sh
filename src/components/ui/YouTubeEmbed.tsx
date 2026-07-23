/**
 * YouTubeEmbed — responsive privacy-enhanced YouTube iframe used by the help
 * article renderers (HelpArticle page + HelpArticleModal).
 *
 * Help articles embed videos by placing a bare YouTube URL on its own line
 * (autolinked by remark-gfm). `getStandaloneYouTubeHref` detects a paragraph
 * whose only child is such a link so the renderer can swap the paragraph for
 * an embed — the same convention the public site's MarkdownRenderer uses.
 */

import React from 'react';
import { cn } from '../../lib/utils';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export const getYouTubeVideoId = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!YOUTUBE_HOSTS.has(hostname)) return null;

    if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (parsedUrl.pathname === '/watch') {
      return parsedUrl.searchParams.get('v');
    }

    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathSegments[0] === 'embed' || pathSegments[0] === 'shorts') {
      return pathSegments[1] || null;
    }

    return null;
  } catch {
    return null;
  }
};

/**
 * Given a hast paragraph node's children, return the href when the paragraph
 * consists solely of one YouTube link (ignoring whitespace text nodes).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getStandaloneYouTubeHref = (
  nodeChildren: unknown[] | undefined
): string | null => {
  if (!nodeChildren) return null;
  const normalizedChildren = nodeChildren.filter((child) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = child as any;
    return c?.type !== 'text' || c?.value?.trim();
  });

  if (normalizedChildren.length !== 1) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child = normalizedChildren[0] as any;
  const href = child?.tagName === 'a' ? child?.properties?.href : null;

  if (typeof href !== 'string') return null;

  return getYouTubeVideoId(href) ? href : null;
};

interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

export const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  url,
  className,
}) => {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <div
      className={cn(
        'relative w-full aspect-video my-4 rounded-lg overflow-hidden border border-border bg-muted',
        className
      )}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
};
