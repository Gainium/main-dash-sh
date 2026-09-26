// Spec 064 §5 — the unread badge is compact and capped.
import { describe, expect, it } from 'vitest';
import { formatUnreadCount } from '../src/hooks/useNotifications';

describe('formatUnreadCount (§5)', () => {
  it('is exact up to 999, then 999+', () => {
    expect(formatUnreadCount(0)).toBe('0');
    expect(formatUnreadCount(999)).toBe('999');
    expect(formatUnreadCount(1000)).toBe('999+');
    expect(formatUnreadCount(5000)).toBe('999+');
  });
});
