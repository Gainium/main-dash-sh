/**
 * Themed element renderers for content-API articles. Used through
 * `ArticleMarkdown`; exported so a surface can extend them (e.g. router links).
 */

import type { Components } from 'react-markdown';
import { getStandaloneYouTubeHref, YouTubeEmbed } from '../ui/YouTubeEmbed';

function transformImageSrc(src: string | undefined): string {
  if (!src) return '';
  return src.startsWith('/images') ? `https://gainium.io${src}` : src;
}

export const ARTICLE_LINK_CLASS =
  'text-primary hover:text-primary/80 underline underline-offset-2 transition-colors';

// ─── Markdown components ──────────────────────────────────────────────────────

export const articleMarkdownComponents: Partial<Components> = {
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
