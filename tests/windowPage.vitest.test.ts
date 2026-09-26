/**
 * Runner: Vitest. `npx vitest run core/tests/windowPage.vitest.test.ts`.
 * Spec: specs/065 §6 (parent repo) — a server-paged table answers from the
 * loaded window whenever it can, and previews a sort/search from it while the
 * server's page loads.
 */
import { describe, expect, it } from 'vitest';
import { isDefaultQuery, previewPage, servesFromWindow } from '@/lib/botList/windowPage';

const bots = Array.from({ length: 30 }, (_, i) => ({
  _id: `b${i}`,
  created: new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString(),
  settings: { name: `Farm-${String(i).padStart(3, '0')}` },
  profit: { totalUsd: (i * 7) % 11 },
}));
const DEF = { field: 'created', direction: 'desc' as const };

describe('servesFromWindow', () => {
  it('answers default-order pages inside the window without a request', () => {
    expect(servesFromWindow({ pageIndex: 0, pageSize: 10 }, 500, false, DEF)).toBe(true);
    expect(servesFromWindow({ pageIndex: 49, pageSize: 10 }, 500, false, DEF)).toBe(true);
    expect(servesFromWindow({ pageIndex: 50, pageSize: 10 }, 500, false, DEF)).toBe(false);
  });
  it('needs the server for a sort or search over a partial window', () => {
    expect(servesFromWindow({ pageIndex: 0, pageSize: 10, sort: { field: 'settings.name', direction: 'asc' } }, 500, false, DEF)).toBe(false);
    expect(servesFromWindow({ pageIndex: 0, pageSize: 10, search: 'x' }, 500, false, DEF)).toBe(false);
  });
  it('answers anything from a complete window', () => {
    expect(servesFromWindow({ pageIndex: 3, pageSize: 10, search: 'x', sort: { field: 'a', direction: 'asc' } }, 20, true)).toBe(true);
  });
  it('treats the explicit default sort as default', () => {
    expect(isDefaultQuery({ pageIndex: 0, pageSize: 10, sort: DEF }, DEF)).toBe(true);
  });
});

describe('previewPage', () => {
  it('default order newest first, paged', () => {
    const r = previewPage(bots, { pageIndex: 1, pageSize: 5 }, { defaultSort: DEF });
    expect(r.rows.map((b) => b._id)).toEqual(['b24', 'b23', 'b22', 'b21', 'b20']);
    expect(r.matched).toBe(30);
  });
  it('sorts by a dotted server field in the direction asked', () => {
    const r = previewPage(bots, { pageIndex: 0, pageSize: 3, sort: { field: 'settings.name', direction: 'asc' } });
    expect(r.rows.map((b) => b.settings.name)).toEqual(['Farm-000', 'Farm-001', 'Farm-002']);
    const d = previewPage(bots, { pageIndex: 0, pageSize: 1, sort: { field: 'profit.totalUsd', direction: 'desc' } });
    expect(d.rows[0].profit.totalUsd).toBe(10);
  });
  it('searches the name case-insensitively and reports the match count', () => {
    const r = previewPage(bots, { pageIndex: 0, pageSize: 10, search: 'farm-02' });
    expect(r.matched).toBe(10);
  });
});
