import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    progress: vi.fn(() => ({ update: vi.fn(), dismiss: vi.fn() })),
  },
}));

import { bulkSummary } from '@/hooks/useBulkBotRunner';
import { toast } from '@/lib/toast';
import { mergeBotListSnapshot } from '@/stores/live/botListMerge';
import {
  beginBotTransition,
  clearBotTransition,
  getBotTransition,
  reportBotStatus,
  resolveFetchedBotStatus,
  CONFIRM_GRACE_MS,
  resetBotTransitions,
  TRANSITION_TIMEOUT_MS,
} from '@/stores/live/botStatusTransitions';

/**
 * Start/Stop is accepted by the API before the engine acts. Until the server
 * reports the requested status the bot is "Starting…"/"Stopping…", and a list
 * refetch that still carries the old status must not flip it back.
 */
type Bot = { _id: string; status: string; updated?: number };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  resetBotTransitions();
  vi.useRealTimers();
});

describe('bot status transitions', () => {
  it('a list refetch with the old status keeps the optimistic status', () => {
    beginBotTransition('b1', 'open', { name: 'Big bot' });
    const held: Record<string, Bot> = { b1: { _id: 'b1', status: 'open' } };

    const merged = mergeBotListSnapshot(held, [{ _id: 'b1', status: 'closed' }]);

    expect(merged.b1.status).toBe('open');
    expect(getBotTransition('b1')?.target).toBe('open');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a list response with the target status ends the transition and toasts', () => {
    beginBotTransition('b1', 'open', { name: 'Big bot' });
    const held: Record<string, Bot> = { b1: { _id: 'b1', status: 'open' } };

    mergeBotListSnapshot(held, [{ _id: 'b1', status: 'open' }]);

    expect(getBotTransition('b1')).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('Bot "Big bot" started');
  });

  it('a complete list that lacks a starting bot does not drop it', () => {
    beginBotTransition('b1', 'open');
    const held: Record<string, Bot> = { b1: { _id: 'b1', status: 'open' } };

    const merged = mergeBotListSnapshot(held, [], {
      paperContext: false,
      statuses: ['open'],
      complete: true,
    });

    expect(merged.b1).toBeDefined();
  });

  it('the socket status ends it; grid running statuses count as started', () => {
    beginBotTransition('g1', 'open', { name: 'Grid' });
    expect(reportBotStatus('g1', 'closed', 'socket')).toBeDefined();
    expect(reportBotStatus('g1', 'range', 'socket')).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('Bot "Grid" started');
  });

  it('an engine error ends it with an error toast; a listed error does not', () => {
    beginBotTransition('b1', 'open', { name: 'X' });
    expect(reportBotStatus('b1', 'error', 'list')).toBeDefined();
    expect(reportBotStatus('b1', 'error', 'socket')).toBeUndefined();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('a response read before the engine confirmed cannot undo the confirmation', () => {
    beginBotTransition('b1', 'closed');
    // The engine confirms over the socket first …
    reportBotStatus('b1', 'closed', 'socket');
    // … then a list read before its DB write arrives with the old status.
    const held: Record<string, Bot> = { b1: { _id: 'b1', status: 'closed' } };
    const merged = mergeBotListSnapshot(held, [{ _id: 'b1', status: 'open' }]);
    expect(merged.b1.status).toBe('closed');
    // A response that agrees ends the hold; later ones apply as they come.
    expect(resolveFetchedBotStatus('b1', 'closed', 'closed')).toBe('closed');
    expect(resolveFetchedBotStatus('b1', 'open', 'closed')).toBe('open');
  });

  it('the confirmation hold expires', () => {
    beginBotTransition('b1', 'open');
    reportBotStatus('b1', 'open', 'socket');
    vi.advanceTimersByTime(CONFIRM_GRACE_MS + 1);
    expect(resolveFetchedBotStatus('b1', 'closed', 'open')).toBe('closed');
  });

  it('notify off (bulk) confirms without a toast', () => {
    beginBotTransition('b1', 'closed', { notify: false });
    reportBotStatus('b1', 'closed', 'socket');
    expect(getBotTransition('b1')).toBeUndefined();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a request failure clears it silently', () => {
    beginBotTransition('b1', 'open');
    clearBotTransition('b1');
    vi.advanceTimersByTime(TRANSITION_TIMEOUT_MS + 1000);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('times out with one error toast per batch and re-fetches', () => {
    const onTimeout = vi.fn();
    beginBotTransition('a', 'open', { onTimeout });
    beginBotTransition('b', 'open', { onTimeout });
    vi.advanceTimersByTime(TRANSITION_TIMEOUT_MS + 1000);

    expect(getBotTransition('a')).toBeUndefined();
    expect(onTimeout).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toMatch(/^2 bots/);
  });
});

describe('bulk summary wording', () => {
  it('start/stop/restart say requested, not done', () => {
    expect(bulkSummary('start', 3, 0).message).toBe('Start requested for 3 bots');
    expect(bulkSummary('stop', 1, 0).message).toBe('Stop requested for 1 bot');
    expect(bulkSummary('restart', 4, 1)).toEqual({
      ok: false,
      message: 'Restart requested for 3 of 4 bots — 1 failed',
    });
  });

  it('archive keeps its done wording', () => {
    expect(bulkSummary('archive', 2, 0).message).toBe('Archived 2 bots');
    expect(bulkSummary('delete', 2, 2).message).toBe(
      'Failed to delete the selected bots'
    );
  });
});
