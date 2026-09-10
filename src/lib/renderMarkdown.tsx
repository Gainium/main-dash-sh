import React from 'react';

/**
 * Very small, safe markdown renderer (no raw HTML) supporting a subset:
 * headings, bold, italic, code, code blocks, blockquote, lists, links, hr.
 *
 * Extracted from NotesWidget so the alert-template editor previews a template
 * with the same renderer the rest of the app uses — a preview that disagrees
 * with the real rendering is worse than no preview.
 */
export function renderMarkdown(md: string): React.ReactNode {
  const elements: React.ReactNode[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const flushParagraph = (buffer: string[]) => {
    if (!buffer.length) return;
    const text = buffer.join(' ');
    elements.push(
      <p
        key={`p-${elements.length}`}
        className="text-muted-foreground leading-relaxed mb-3"
      >
        {renderInline(text)}
      </p>
    );
    buffer.length = 0;
  };
  const renderInline = (txt: string): React.ReactNode => {
    // Escape angle brackets
    let safe = txt.replace(/[<>]/g, (m) => (m === '<' ? '&lt;' : '&gt;'));
    // Code spans
    safe = safe.replace(/`([^`]+)`/g, (_, code) => `@@CODE${btoa(code)}@@`);
    // Bold
    safe = safe
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // Italic
    safe = safe
      .replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>');
    // Links [text](url)
    safe = safe.replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    // Replace code placeholders
    const parts = safe.split(/(@@CODE[^@]+@@)/g).filter(Boolean);
    return parts.map((part, idx) => {
      const codeMatch = /^@@CODE(.+)@@$/.test(part);
      if (codeMatch) {
        const decoded = atob(part.slice(6, -2));
        return (
          <code
            key={idx}
            className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
          >
            {decoded}
          </code>
        );
      }
      // naive HTML tag parse for strong/em/a we just injected
      const temp = document.createElement('div');
      temp.innerHTML = part;
      const children: React.ReactNode[] = [];
      temp.childNodes.forEach((node, nIdx) => {
        if (node.nodeType === 3)
          children.push(
            <React.Fragment key={nIdx}>{node.textContent}</React.Fragment>
          );
        else if (node instanceof HTMLElement) {
          if (node.tagName === 'STRONG')
            children.push(
              <strong key={nIdx} className="text-foreground font-medium">
                {node.textContent}
              </strong>
            );
          else if (node.tagName === 'EM')
            children.push(
              <em key={nIdx} className="italic text-muted-foreground">
                {node.textContent}
              </em>
            );
          else if (node.tagName === 'A')
            children.push(
              <a
                key={nIdx}
                href={node.getAttribute('href') || ''}
                className="text-primary underline decoration-primary/30 hover:decoration-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {node.textContent}
              </a>
            );
          else
            children.push(
              <React.Fragment key={nIdx}>{node.textContent}</React.Fragment>
            );
        }
      });
      return <React.Fragment key={idx}>{children}</React.Fragment>;
    });
  };
  while (i < lines.length) {
    const line = lines[i];
    // Horizontal rule
    if (/^\s*---+$/.test(line)) {
      elements.push(
        <hr key={`hr-${elements.length}`} className="border-border my-4" />
      );
      i++;
      continue;
    }
    // Code block
    if (/^```/.test(line)) {
      // (language ignored for now)
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing
      elements.push(
        <pre
          key={`code-${elements.length}`}
          className="bg-muted border border-border rounded-md p-md overflow-x-auto text-xs"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }
    // Heading
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      if (level === 1) {
        elements.push(
          <h1
            key={`h-${elements.length}`}
            className="text-xl font-semibold mb-4 mt-0 text-foreground"
          >
            {renderInline(content)}
          </h1>
        );
      } else if (level === 2) {
        elements.push(
          <h2
            key={`h-${elements.length}`}
            className="text-lg font-semibold mb-3 mt-4 text-foreground"
          >
            {renderInline(content)}
          </h2>
        );
      } else {
        elements.push(
          <h3
            key={`h-${elements.length}`}
            className="text-base font-semibold mb-2 mt-3 text-foreground"
          >
            {renderInline(content)}
          </h3>
        );
      }
      i++;
      continue;
    }
    // Blockquote
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      let j = i;
      while (j < lines.length && /^>\s?/.test(lines[j])) {
        quote.push(lines[j].replace(/^>\s?/, ''));
        j++;
      }
      elements.push(
        <blockquote
          key={`bq-${elements.length}`}
          className="border-l-4 border-primary pl-4 italic text-muted-foreground my-4"
        >
          {renderInline(quote.join(' '))}
        </blockquote>
      );
      i = j;
      continue;
    }
    // Lists
    if (/^\s*([-*])\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      let j = i;
      while (j < lines.length && /^\s*([-*])\s+/.test(lines[j])) {
        items.push(
          <li key={j} className="mb-1 text-muted-foreground">
            {renderInline(lines[j].replace(/^\s*([-*])\s+/, ''))}
          </li>
        );
        j++;
      }
      elements.push(
        <ul key={`ul-${elements.length}`} className="mb-3 pl-4 list-disc">
          {items}
        </ul>
      );
      i = j;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      let j = i;
      while (j < lines.length && /^\s*\d+\.\s+/.test(lines[j])) {
        items.push(
          <li key={j} className="mb-1 text-muted-foreground">
            {renderInline(lines[j].replace(/^\s*\d+\.\s+/, ''))}
          </li>
        );
        j++;
      }
      elements.push(
        <ol key={`ol-${elements.length}`} className="mb-3 pl-4 list-decimal">
          {items}
        </ol>
      );
      i = j;
      continue;
    }
    // Blank line ends paragraph
    if (/^\s*$/.test(line)) {
      flushParagraph([]);
      i++;
      continue;
    }
    // Paragraph buffer (simple: treat single line as its own paragraph)
    elements.push(
      <p
        key={`p-${elements.length}`}
        className="text-muted-foreground leading-relaxed mb-3"
      >
        {renderInline(line)}
      </p>
    );
    i++;
  }
  return elements;
}
