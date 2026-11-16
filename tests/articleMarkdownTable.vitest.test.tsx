/**
 * Runner note: run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/articleMarkdownTable.vitest.test.tsx`.
 *
 * Help articles and indicator pages carry GitHub-flavoured tables (the
 * "Settings and tips" table on every indicator page). `ArticleMarkdown` is the
 * renderer behind both the help article modal and the full article page, so a
 * table must come out of it as a real `<table>`, never as a paragraph of pipes.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ArticleMarkdown } from '@/components/help/ArticleMarkdown';

const ARTICLE = `### Settings and tips

| Setting | Default | What it does |
| --- | --- | --- |
| Length | 9 | Candles that frame the close, 1 to 500. |
| Line | k | The line the condition tests: **K**, D or J. |

**Tip:** a paragraph after the table.

- first item
- second item
`;

const cells = (row: Element) =>
  Array.from(row.querySelectorAll('th,td')).map((c) => c.textContent);

afterEach(cleanup);

describe('ArticleMarkdown', () => {
  it('renders a markdown table as a table with its cells', () => {
    const { container } = render(<ArticleMarkdown>{ARTICLE}</ArticleMarkdown>);

    const tables = container.querySelectorAll('table');
    expect(tables).toHaveLength(1);
    const rows = Array.from(tables[0].querySelectorAll('tr'));
    expect(rows.map(cells)).toEqual([
      ['Setting', 'Default', 'What it does'],
      ['Length', '9', 'Candles that frame the close, 1 to 500.'],
      ['Line', 'k', 'The line the condition tests: K, D or J.'],
    ]);
    expect(rows[0].querySelectorAll('th')).toHaveLength(3);
    // inline markdown still works inside a cell
    expect(rows[2].querySelector('strong')?.textContent).toBe('K');
    // no raw pipes left anywhere in the article
    expect(container.textContent).not.toContain('|');
  });

  it('wraps the table so a wide one scrolls sideways instead of overflowing', () => {
    const { container } = render(<ArticleMarkdown>{ARTICLE}</ArticleMarkdown>);
    expect(
      container.querySelector('table')?.parentElement?.className
    ).toContain('overflow-x-auto');
  });

  it('keeps the rest of the article and applies per-surface overrides', () => {
    const { container } = render(
      <ArticleMarkdown
        components={{ a: ({ children }) => <span data-link>{children}</span> }}
      >
        {`${ARTICLE}\n[a link](https://example.com)`}
      </ArticleMarkdown>
    );
    expect(container.querySelector('h3')?.textContent).toBe(
      'Settings and tips'
    );
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('[data-link]')?.textContent).toBe('a link');
    expect(container.querySelector('a')).toBeNull();
    // the shared table renderer survives a partial override
    expect(container.querySelector('table')).not.toBeNull();
  });
});
