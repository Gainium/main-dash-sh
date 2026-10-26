import React, { useRef, useState } from 'react';
import { describe, test, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MarkdownToolbar } from '@/components/ui/markdown-toolbar';

// Spec: main-dash-redesign specs/136.alert-template-tables.md §1 — the Table
// button is opt-in and inserts a starter pipe table at the cursor.

afterEach(cleanup);

const Harness = ({
  initial,
  showTable,
  variables,
}: {
  initial: string;
  showTable?: boolean;
  variables?: { name: string; description: string }[];
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  return (
    <>
      <MarkdownToolbar
        textareaRef={ref}
        value={value}
        onChange={setValue}
        variables={variables}
        showTable={showTable}
      />
      <textarea
        data-testid="ta"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </>
  );
};

const ta = () => screen.getByTestId('ta') as HTMLTextAreaElement;

describe('§1.1 opt-in', () => {
  test('no Table button unless asked for', () => {
    render(<Harness initial="" />);
    expect(screen.queryByLabelText('Table')).toBeNull();
  });
});

describe('§1.2 inserts a starter table on its own lines', () => {
  test('mid-line caret: the table starts on a new line and ends with one', () => {
    render(
      <Harness
        initial="Deal closedmore"
        showTable
        variables={[{ name: 'price', description: 'Price' }]}
      />
    );
    ta().setSelectionRange(11, 11);
    fireEvent.click(screen.getByLabelText('Table'));
    expect(ta().value).toBe(
      'Deal closed\n| Field | Value |\n| --- | --- |\n| price | %price% |\nmore'
    );
  });

  test('no variables: a generic row; empty box: no leading newline', () => {
    render(<Harness initial="" showTable />);
    fireEvent.click(screen.getByLabelText('Table'));
    expect(ta().value).toBe('| Field | Value |\n| --- | --- |\n| Name | Value |');
  });
});
