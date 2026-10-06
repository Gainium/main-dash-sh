/**
 * Runner note: Vitest. Run from the parent:
 * `npx vitest run core/tests/botWindowStats.vitest.test.ts`.
 *
 * The Statistics tab's Lifetime / Since views: deal-derived figures from
 * `getBotWindowStats` laid over the engine-built view models.
 */
import { describe, expect, it } from 'vitest';

import {
  buildBotStatsBreakdown,
  buildBotStatsHeadline,
} from '@/components/widgets/bots/stats/botStatsViewModel';
import {
  confidenceGradeFor,
  windowBreakdown,
  windowHeadline,
  windowTooltip,
  type BotWindowStatsDTO,
} from '@/components/widgets/bots/stats/botWindowStatsViewModel';
import type { BotStats } from '@/types';

const usdAsset = (usd = 0) => ({ usd, asset: usd });

/** Engine stats since the last reset: 2 deals, ratios and run-up set. */
const engineStats = {
  numerical: {
    deals: { profit: 2, loss: 0 },
    general: { netProfitPerc: 0.01, startBalance: usdAsset(1000) },
    profit: {
      grossProfit: usdAsset(10),
      grossProfitPerc: 0.01,
      maxDealProfit: usdAsset(6),
      avgDealProfit: usdAsset(5),
      maxRunUp: usdAsset(10),
      maxRunUpPerc: 0.01,
      maxConsecutiveWins: 2,
    },
    loss: {
      grossLoss: usdAsset(0),
      maxDealLoss: usdAsset(0),
      avgDealLoss: usdAsset(0),
      maxDrawdown: usdAsset(0),
      maxEquityDrawdown: usdAsset(4),
      maxEquityDrawdownPerc: 0.004,
      maxConsecutiveLosses: 0,
    },
    ratios: {
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      cwr: 0.3,
      buyAndHold: { perc: 0.05, result: 50 },
    },
    usage: { maxTheoreticalUsage: 1000, maxActualUsage: 500 },
  },
  duration: { general: {}, profit: {}, loss: {} },
} as unknown as BotStats;

const bot = {
  profit: { total: 300, totalUsd: 300 },
  settings: { useDca: true, profitCurrency: 'quote' },
  dealsInBot: { active: 1 },
};

const lifetime: BotWindowStatsDTO = {
  from: null,
  closedDeals: 40,
  wins: 36,
  losses: 4,
  winRate: 0.9,
  realizedProfitUsd: 300,
  grossProfitUsd: 400,
  grossLossUsd: -100,
  profitFactor: 4,
  peakCapitalUsd: 2000,
  returnOnPeakCapital: 0.15,
  maxDrawdownUsd: 80,
  maxDrawdownPerc: 0.04,
  avgDealDuration: 3_600_000,
  maxDealDuration: 7_200_000,
  maxDealProfitUsd: 30,
  maxDealLossUsd: -40,
  avgDealProfitUsd: 400 / 36,
  avgDealLossUsd: -25,
  maxConsecutiveWins: 12,
  maxConsecutiveLosses: 2,
  avgWinningDealDuration: 3_600_000,
  maxWinningDealDuration: 7_200_000,
  avgLosingDealDuration: 3_600_000,
  maxLosingDealDuration: 3_600_000,
  firstCloseTime: 1,
};

describe('Statistics window views', () => {
  const baseHeadline = buildBotStatsHeadline(engineStats, bot);
  const baseBreakdown = buildBotStatsBreakdown(engineStats, bot);

  it('lifetime replaces the deal figures with the fold', () => {
    const h = windowHeadline(baseHeadline, lifetime, 'lifetime');
    expect(h.wins).toBe(36);
    expect(h.losses).toBe(4);
    expect(h.netPerc).toBe(15);
    expect(h.netUsd).toBe(300);
    expect(h.profitFactor).toBe(4);
    // Realized DD stands in for the engine's equity DD, under its own label.
    expect(h.maxEquityDdPerc).toBe(-4);
    expect(h.ddLabel).toBe('Max Realized DD');

    const b = windowBreakdown(baseBreakdown, lifetime, 'lifetime', 1);
    expect(b.winners.count).toBe(36);
    expect(b.winners.winRate).toBe(90);
    expect(b.winners.grossProfitPerc).toBe(20);
    expect(b.winners.maxConsecutiveWins).toBe(12);
    expect(b.losers.maxDealLossText).toBe('-$40');
    expect(b.general.dealsText).toBe('41 (profit - 36, loss - 4, open - 1)');
  });

  it('lifetime hides what only the engine had, for the last window only', () => {
    const b = windowBreakdown(baseBreakdown, lifetime, 'lifetime', 1);
    expect(b.hideEngineOnly).toBe(true);
    expect(b.showDca).toBe(false);
    expect(b.ratios.sharpeRatio).toBeNull();
    expect(b.losers.maxEquityDdPerc).toBeNull();
  });

  it('since keeps the engine-only figures, which cover that window', () => {
    const since = { ...lifetime, from: 5, wins: 3, losses: 0, winRate: 1 };
    const h = windowHeadline(baseHeadline, since, 'since');
    expect(h.wins).toBe(3);
    expect(h.maxEquityDdPerc).toBe(baseHeadline.maxEquityDdPerc);
    expect(h.ddLabel).toBeUndefined();

    const b = windowBreakdown(baseBreakdown, since, 'since', 1);
    expect(b.hideEngineOnly).toBe(false);
    expect(b.showDca).toBe(true);
    expect(b.ratios.sharpeRatio).toBe(1.2);
    expect(b.losers.maxEquityDdPerc).toBe(baseBreakdown.losers.maxEquityDdPerc);
  });

  it('the confidence grade and its deal count follow the window', () => {
    // The engine's stats restart at a reset, so its grade read 0 deals in
    // both views on a bot that had not closed a deal since.
    const life = windowHeadline(
      { ...baseHeadline, confidenceGrade: 'F', closedDeals: 0 },
      { ...lifetime, wins: 200, losses: 10 },
      'lifetime'
    );
    expect(life.closedDeals).toBe(210);
    expect(life.confidenceGrade).toBe('B');
    const since = windowHeadline(baseHeadline, { ...lifetime, wins: 3, losses: 1 }, 'since');
    expect(since.closedDeals).toBe(4);
    expect(since.confidenceGrade).toBe('F');
  });

  it('grade thresholds match the engine', () => {
    expect([0, 106, 107, 133, 164, 208, 273, 384, 385].map(confidenceGradeFor)).toEqual(
      ['F', 'F', 'E', 'D', 'C', 'B', 'A', 'A', 'A+']
    );
  });

  it('profit with no losses reads as Infinity', () => {
    const h = windowHeadline(
      baseHeadline,
      { ...lifetime, profitFactor: -1 },
      'lifetime'
    );
    expect(h.profitFactor).toBe(Infinity);
  });

  it('the tooltip names the change date and what each view counts', () => {
    const at = Date.UTC(2026, 9, 2, 12);
    expect(windowTooltip('lifetime', at)).toMatch(/keep counting/);
    expect(windowTooltip('since', at)).toMatch(/opened before the change/);
  });
});
