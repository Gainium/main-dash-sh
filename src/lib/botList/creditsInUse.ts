/**
 * Credits a bot is holding right now (spec 128), or `undefined` when it holds
 * none.
 *
 * Credits are a lock held while a bot is active; main-app releases it when the
 * bot is archived, or closed with no open deals (a stopped DCA/Combo bot still
 * running its deals keeps it). The bot transforms already derive exactly that
 * as `isActive`, so this reads the flag instead of re-deriving status rules.
 * The bot keeps its last `cost` after release — that leftover is not shown.
 */
export function creditsInUse(bot: {
  isActive?: boolean;
  cost?: number;
}): number | undefined {
  if (!bot.isActive) return undefined;
  return bot.cost ?? 0;
}
