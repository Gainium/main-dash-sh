import { Pencil } from 'lucide-react';
import React, { useState } from 'react';

export interface InlineRenameCellProps {
  /** Unique identifier for the row (first argument to onSave). */
  id: string;
  /** Current name. */
  name: string;
  /** Called with the trimmed new name when it is non-empty and changed. */
  onSave: (id: string, next: string, prev: string) => void;
  /** Shown between the name and the rename icon (e.g. status icons). */
  children?: React.ReactNode;
}

/**
 * Name cell for TanStack Table with a rename icon. The icon swaps the name
 * for an input; Enter or blur commits, Escape cancels. Clicks never reach
 * the row (which opens the row's details).
 */
const InlineRenameCell: React.FC<InlineRenameCellProps> = ({
  id,
  name,
  onSave,
  children,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(name);
    setEditing(true);
  };

  const handleCommit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onSave(id, next, name);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setDraft(name);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-full min-w-[160px] max-w-80 rounded border border-border bg-background px-2 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Backtest name"
      />
    );
  }

  return (
    <div className="font-medium inline-flex items-center gap-1">
      <span>{name}</span>
      {children}
      <button
        type="button"
        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        onClick={handleStartEdit}
        title="Rename"
        aria-label="Rename backtest"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default InlineRenameCell;
