/**
 * ArticleMarkdown – the one renderer for content-API articles (help
 * articles, indicator pages, strategy write-ups), wherever they are shown.
 *
 * It owns the markdown dialect (GitHub-flavoured: tables, autolinks,
 * strikethrough) and the themed element renderers, so an article reads the
 * same in the help article modal and on a full page. Callers pass
 * `components` only for what differs per surface, e.g. how a link navigates.
 */

import React, { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { articleMarkdownComponents } from './articleMarkdownElements';

// stable identity: a fresh array per render makes react-markdown re-parse
const REMARK_PLUGINS = [remarkGfm];

// ─── Component ────────────────────────────────────────────────────────────────

interface ArticleMarkdownProps {
  /** The article's markdown source. */
  children: string;
  /** Per-surface overrides, merged over `articleMarkdownComponents`. */
  components?: Partial<Components>;
}

export const ArticleMarkdown: React.FC<ArticleMarkdownProps> = ({
  children,
  components,
}) => {
  const merged = useMemo(
    () =>
      components
        ? { ...articleMarkdownComponents, ...components }
        : articleMarkdownComponents,
    [components]
  );
  return (
    <div className="help-article-content">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={merged}>
        {children}
      </ReactMarkdown>
    </div>
  );
};
