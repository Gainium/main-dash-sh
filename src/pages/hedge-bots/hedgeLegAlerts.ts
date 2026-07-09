/**
 * Hedge leg → header alert bridge (event bus).
 *
 * The hedge form header sits OUTSIDE the leg BotFormProviders, so a leg can't
 * feed its validation alerts up through React context. Instead each mounted
 * leg (via HedgeLegAlertPublisher) — and save-time validation in
 * HedgeBotEditLayout — publishes its current alerts on this window event, and
 * the header's alert button listens and renders the active context's alerts
 * (F8, partial per-leg). Kept out of the component files so importing these
 * value exports doesn't trip react-refresh's only-export-components rule.
 */
import type { BotFormAlerts } from '@/types/bots/form';

export const HEDGE_LEG_ALERTS_EVENT = 'hedge-leg-alerts';

export interface HedgeLegAlertsDetail {
  /** 'hedge' carries shared-settings (TP/SL) validation from the layout. */
  leg: 'long' | 'short' | 'hedge';
  alerts: BotFormAlerts;
}

export const dispatchHedgeLegAlerts = (detail: HedgeLegAlertsDetail): void => {
  window.dispatchEvent(
    new CustomEvent<HedgeLegAlertsDetail>(HEDGE_LEG_ALERTS_EVENT, { detail })
  );
};
