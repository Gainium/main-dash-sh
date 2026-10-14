import { useCallback, useEffect, useState } from 'react';

/**
 * Post-save remount counter for the hedge edit page. `seq` is threaded into
 * the leg / shared widget keys; bumping it remounts them so they re-read their
 * initial form data and `initialBot` from the hedge bot.
 *
 * The bump must land in a render that already sees the refetched legs: the
 * leg forms only read their seed on mount, so a remount while the pre-save bot
 * is still current shows the old settings and never picks up the new ones.
 * `remountAfterRefetch` awaits the refetch, then waits for `currentBots` to
 * move off the pre-save value. An unchanged or failed refetch bumps at once.
 */
export const usePostSaveRemount = (currentBots: unknown) => {
  const [seq, setSeq] = useState(0);
  // The pre-save legs we are waiting to see replaced, boxed so a falsy
  // `bots` value still counts as "waiting".
  const [pending, setPending] = useState<{ bots: unknown } | null>(null);

  useEffect(() => {
    if (!pending || currentBots === pending.bots) return;
    setPending(null);
    setSeq((n) => n + 1);
  }, [pending, currentBots]);

  const remountAfterRefetch = useCallback(
    async (
      savedBots: unknown,
      refetch: () => Promise<{ bots?: unknown } | null>
    ) => {
      let fresh: { bots?: unknown } | null = null;
      try {
        fresh = await refetch();
      } catch {
        fresh = null;
      }
      if (!fresh || fresh.bots === savedBots) {
        setSeq((n) => n + 1);
        return;
      }
      setPending({ bots: savedBots });
    },
    []
  );

  return { seq, remountAfterRefetch };
};
