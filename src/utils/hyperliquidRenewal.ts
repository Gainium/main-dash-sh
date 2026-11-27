import {
  ExchangeEnum,
  type ExchangeInUser,
  type HyperliquidAgentInfo,
} from '@/types/exchange.types';

/**
 * Hyperliquid API-wallet renewal: which connections need it, and which ones a
 * renewal has to update together. Pure, so it is unit-tested on its own.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Show the "expires soon" chip this many days ahead. */
export const RENEW_WARNING_DAYS = 14;

const LIVE_HYPERLIQUID: string[] = [
  ExchangeEnum.hyperliquid,
  ExchangeEnum.hyperliquidLinear,
];

export const isLiveHyperliquid = (provider?: string | null): boolean =>
  !!provider && LIVE_HYPERLIQUID.includes(provider);

const norm = (v?: string | null) => `${v ?? ''}`.trim().toLowerCase();

export type AgentRenewal =
  | { status: 'expired'; expiresAt: number }
  | { status: 'expiring'; expiresAt: number; daysLeft: number }
  | { status: 'ok' };

/** Is this connection's agent expired, about to expire, or fine? */
export const agentRenewal = (
  agent: HyperliquidAgentInfo | null | undefined,
  now: number
): AgentRenewal => {
  const expiresAt = agent?.expiresAt;
  if (typeof expiresAt !== 'number') {
    return { status: 'ok' };
  }
  if (agent?.state === 'expired' || expiresAt <= now) {
    return { status: 'expired', expiresAt };
  }
  const daysLeft = Math.ceil((expiresAt - now) / DAY);
  if (agent?.state === 'active' && daysLeft <= RENEW_WARNING_DAYS) {
    return { status: 'expiring', expiresAt, daysLeft };
  }
  return { status: 'ok' };
};

/**
 * Every Gainium approval uses the same agent name, and Hyperliquid keeps one
 * agent per name — so approving a new agent for a wallet deregisters the one
 * that wallet's OTHER connections hold (the two legs of a "Spot & Futures"
 * connection share it). They all have to get the new key.
 *
 * A leg on the wallet's own key (`master`) never expires and is left alone.
 * Any other leg is included: if it held a differently named agent that is
 * still valid, it moves to a fresh valid one — which the backend verifies
 * before storing — so including it can never break it.
 */
export const hyperliquidSiblings = (
  wallet: string,
  all: ExchangeInUser[],
  excludeUuid?: string | null
): ExchangeInUser[] =>
  all.filter(
    (e) =>
      e.uuid !== excludeUuid &&
      isLiveHyperliquid(e.provider) &&
      !!wallet &&
      norm(e.key) === norm(wallet) &&
      e.hlAgent?.state !== 'master'
  );

/**
 * Resolve `?renew=` to a connection: an exact uuid, or `hyperliquid` for the
 * one that needs it most (expired first, then the soonest expiry, then any
 * live Hyperliquid connection).
 */
export const findRenewTarget = (
  param: string | null | undefined,
  all: ExchangeInUser[],
  now: number
): ExchangeInUser | null => {
  if (!param) return null;
  const live = all.filter((e) => isLiveHyperliquid(e.provider));
  const exact = live.find((e) => e.uuid === param);
  if (exact) return exact;
  if (param !== 'hyperliquid') return null;
  const ranked = live
    .map((e) => ({ e, r: agentRenewal(e.hlAgent, now) }))
    .sort((a, b) => {
      const rank = (x: AgentRenewal) =>
        x.status === 'expired' ? 0 : x.status === 'expiring' ? 1 : 2;
      const d = rank(a.r) - rank(b.r);
      if (d) return d;
      const ea = 'expiresAt' in a.r ? a.r.expiresAt : Infinity;
      const eb = 'expiresAt' in b.r ? b.r.expiresAt : Infinity;
      return ea - eb;
    });
  return ranked[0]?.e ?? null;
};

/** Hyperliquid's refusal once an agent has expired or was removed. */
export const isHyperliquidAgentRejection = (message?: string | null) =>
  /user or api wallet\b.*\bdoes not exist/i.test(`${message ?? ''}`);

/** The system notice subType written by the backend expiry sync. */
export const HYPERLIQUID_AGENT_NOTICE_SUBTYPE = 'Hyperliquid API wallet';

export const shortAddress = (a?: string | null) => {
  const s = `${a ?? ''}`;
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};
