/**
 * Runner note: `.vitest.test.ts` because it renders a hook. Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/hedgePostSaveRemount.vitest.test.ts`.
 *
 * Spec 114. The hedge edit page remounts its leg forms after a save so they
 * show the server's confirmed settings. The remount (a bump of `seq`) must
 * happen in a render that already sees the REFETCHED legs; a bump that lands
 * while the pre-save bot is still current remounts the forms from the old
 * settings and they stay there.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePostSaveRemount } from '../src/pages/hedge-bots/usePostSaveRemount';

type Bots = { tpPerc: string }[];

const setup = (initial: Bots) => {
  // The bots that were current in the render where each seq first appeared.
  const botsAtSeq = new Map<number, Bots>();
  const hook = renderHook(
    ({ bots }: { bots: Bots }) => {
      const r = usePostSaveRemount(bots);
      if (!botsAtSeq.has(r.seq)) botsAtSeq.set(r.seq, bots);
      return r;
    },
    { initialProps: { bots: initial } }
  );
  return { ...hook, botsAtSeq };
};

describe('usePostSaveRemount (spec 114)', () => {
  it('§1.1 waits for the refetched bot before remounting', async () => {
    const saved: Bots = [{ tpPerc: '2' }];
    const fresh: Bots = [{ tpPerc: '3' }];
    const { result, rerender, botsAtSeq } = setup(saved);

    // The refetch resolves before React has rendered its data — the case the
    // old fire-and-forget refetch + immediate bump got wrong.
    await act(async () => {
      await result.current.remountAfterRefetch(saved, async () => ({
        bots: fresh,
      }));
    });
    expect(result.current.seq).toBe(0);

    // §1.2 the render that carries the refetched legs triggers the remount.
    rerender({ bots: fresh });
    expect(result.current.seq).toBe(1);
    expect(botsAtSeq.get(1)).toBe(fresh);
  });

  it('§1.1 remounts at once when the refetched bot already rendered', async () => {
    const saved: Bots = [{ tpPerc: '2' }];
    const fresh: Bots = [{ tpPerc: '3' }];
    const { result, rerender, botsAtSeq } = setup(saved);

    await act(async () => {
      await result.current.remountAfterRefetch(saved, async () => {
        rerender({ bots: fresh });
        return { bots: fresh };
      });
    });
    expect(result.current.seq).toBe(1);
    expect(botsAtSeq.get(1)).toBe(fresh);
  });

  it('§1.3 remounts when the refetch returns the unchanged bot', async () => {
    const saved: Bots = [{ tpPerc: '2' }];
    const { result } = setup(saved);
    await act(async () => {
      await result.current.remountAfterRefetch(saved, async () => ({
        bots: saved,
      }));
    });
    expect(result.current.seq).toBe(1);
  });

  it('§1.3 remounts when the refetch yields nothing or throws', async () => {
    const saved: Bots = [{ tpPerc: '2' }];
    const { result } = setup(saved);
    await act(async () => {
      await result.current.remountAfterRefetch(saved, async () => null);
    });
    expect(result.current.seq).toBe(1);
    await act(async () => {
      await result.current.remountAfterRefetch(saved, async () => {
        throw new Error('network');
      });
    });
    expect(result.current.seq).toBe(2);
  });
});
