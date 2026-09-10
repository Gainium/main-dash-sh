import React from 'react';
import {
  Bold,
  Braces,
  Code,
  EyeOff,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  Strikethrough,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

/**
 * Formatting toolbar for a plain markdown `<textarea>`.
 *
 * Works on the element rather than owning the text: it reads the live
 * selection, produces the new value and hands it back through `onChange`, so a
 * controlled React textarea stays the single source of truth.
 *
 * The notes widget has its own equivalent wired into note persistence. This one
 * is standalone so any markdown field can use it; notes could adopt it later,
 * but that refactor is not worth destabilising the widget for.
 */

export interface MarkdownVariable {
  name: string;
  description: string;
}

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** Offered behind a "Variables" menu and inserted at the cursor. */
  variables?: MarkdownVariable[];
  /** Telegram-style spoiler. Not every target supports one. */
  showSpoiler?: boolean;
  disabled?: boolean;
}

const BTN =
  'rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed';

export const MarkdownToolbar = ({
  textareaRef,
  value,
  onChange,
  variables,
  showSpoiler = false,
  disabled = false,
}: MarkdownToolbarProps) => {
  /** Apply an edit, then put the caret back where the user expects it. */
  const commit = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = selStart;
      ta.selectionEnd = selEnd;
    });
  };

  const selection = () => {
    const ta = textareaRef.current;
    if (!ta) return { start: value.length, end: value.length };
    return { start: ta.selectionStart, end: ta.selectionEnd };
  };

  /** Wrap the selection, or unwrap it when the wrapper is already there. */
  const wrap = (wrapper: string, placeholder: string) => {
    const { start, end } = selection();
    const selected = value.slice(start, end) || placeholder;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const already =
      selected.length > wrapper.length * 2 &&
      selected.startsWith(wrapper) &&
      selected.endsWith(wrapper);
    const inner = already
      ? selected.slice(wrapper.length, selected.length - wrapper.length)
      : wrapper + selected + wrapper;
    const caret = start + (already ? 0 : wrapper.length);
    commit(
      before + inner + after,
      caret,
      caret + (already ? inner.length : selected.length)
    );
  };

  /** Add or remove a line prefix on every line the selection touches. */
  const prefixLines = (prefix: string) => {
    const { start, end } = selection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = value.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const allPrefixed = lines.every((l) => l.startsWith(prefix));
    const updated = lines
      .map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l))
      .join('\n');
    commit(
      value.slice(0, lineStart) + updated + value.slice(lineEnd),
      lineStart,
      lineStart + updated.length
    );
  };

  const insert = (text: string, caretOffset = text.length) => {
    const { start, end } = selection();
    const before = value.slice(0, start);
    const after = value.slice(end);
    commit(before + text + after, start + caretOffset, start + caretOffset);
  };

  const makeLink = () => {
    const { start, end } = selection();
    const selected = value.slice(start, end) || 'text';
    const before = value.slice(0, start);
    const after = value.slice(end);
    const insertion = `[${selected}](url)`;
    // Land the caret on `url` so it can be typed over immediately.
    const caret = before.length + insertion.length - 4;
    commit(before + insertion + after, caret, caret + 3);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-border/50 bg-muted/40 px-1 py-1">
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Bold"
        title="Bold"
        onClick={() => wrap('**', 'bold')}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Italic"
        title="Italic"
        onClick={() => wrap('*', 'italic')}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Strikethrough"
        title="Strikethrough"
        onClick={() => wrap('~~', 'text')}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Code"
        title="Code"
        onClick={() => wrap('`', 'code')}
      >
        <Code className="h-3.5 w-3.5" />
      </button>

      <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />

      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Heading"
        title="Heading"
        onClick={() => prefixLines('## ')}
      >
        <Heading className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Bullet list"
        title="Bullet list"
        onClick={() => prefixLines('- ')}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={BTN}
        disabled={disabled}
        aria-label="Link"
        title="Link"
        onClick={makeLink}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      {showSpoiler ? (
        <button
          type="button"
          className={BTN}
          disabled={disabled}
          aria-label="Spoiler"
          title="Spoiler — hidden until tapped"
          onClick={() => wrap('||', 'hidden')}
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {variables?.length ? (
        <>
          <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${BTN} flex items-center gap-1`}
                disabled={disabled}
                aria-label="Insert a variable"
                title="Insert a variable"
              >
                <Braces className="h-3.5 w-3.5" />
                Variables
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 w-80 overflow-y-auto"
            >
              {variables.map((v) => (
                <DropdownMenuItem
                  key={v.name}
                  onSelect={() => insert(`%${v.name}%`)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <code className="text-xs text-foreground">%{v.name}%</code>
                  <span className="text-xs text-muted-foreground">
                    {v.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  );
};

export default MarkdownToolbar;
