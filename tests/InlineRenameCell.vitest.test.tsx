import React from 'react';
import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import InlineRenameCell from '@/components/ui/InlineRenameCell';

// The backtest table's Name cell: a rename icon swaps the name for an input,
// Enter/blur saves a changed non-empty name, Escape cancels, and no click
// reaches the row (a row click opens the backtest's results).

afterEach(() => {
  cleanup();
});

const setup = (name = 'BTCUSDT DCA Mid-term') => {
  const onSave = vi.fn();
  const onRowClick = vi.fn();
  render(
    <div onClick={onRowClick}>
      <InlineRenameCell id="bt1" name={name} onSave={onSave}>
        <span data-testid="adornment" />
      </InlineRenameCell>
    </div>
  );
  return { onSave, onRowClick };
};

const startRename = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Rename backtest' }));
  return screen.getByRole('textbox', { name: 'Backtest name' });
};

describe('InlineRenameCell', () => {
  test('shows the name, its adornments and a rename icon', () => {
    setup();
    expect(screen.getByText('BTCUSDT DCA Mid-term')).toBeTruthy();
    expect(screen.getByTestId('adornment')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename backtest' })).toBeTruthy();
  });

  test('Enter saves the trimmed new name without opening the row', () => {
    const { onSave, onRowClick } = setup();
    const input = startRename();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: '  My best run  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(
      'bt1',
      'My best run',
      'BTCUSDT DCA Mid-term'
    );
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('blur saves too', () => {
    const { onSave } = setup();
    const input = startRename();
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith(
      'bt1',
      'Renamed',
      'BTCUSDT DCA Mid-term'
    );
  });

  test('Escape cancels', () => {
    const { onSave } = setup();
    const input = startRename();
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('BTCUSDT DCA Mid-term')).toBeTruthy();
  });

  test('an empty or unchanged name is not saved', () => {
    const { onSave } = setup();
    let input = startRename();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    input = startRename();
    fireEvent.change(input, { target: { value: 'BTCUSDT DCA Mid-term ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });
});
