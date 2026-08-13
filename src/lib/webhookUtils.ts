import {
  CloseConditionEnum,
  OrderSizeTypeEnum,
  StartConditionEnum,
  StrategyEnum,
  type DCABot,
} from '@/types';
import {
  type WebhookActionAvailability,
  type WebhookPayload,
  type WebhookPayloadOptions,
  PairsToSetMode,
  WebhookActionEnum,
} from '../types/webhook';

/**
 * Generate webhook URL for the current environment
 */
export function generateWebhookUrl(): string {
  const serverUrl =
    import.meta.env.VITE_API_ENDPOINT || 'https://api.gainium.io';
  const baseUrl = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
  return `${baseUrl}trade_signal`;
}

/**
 * Generate webhook payload for a specific action - matching main-dash schema exactly
 *
 * `botUuid` MUST be the bot's `uuid` field, not its Mongo `_id`: main-app's
 * webhookProcess resolves the target with `readData({ uuid })`, so a payload
 * carrying `_id` matches no bot and the signal is silently dropped.
 */
export function generateWebhookPayload(
  action: WebhookActionEnum,
  botUuid: string,
  options: WebhookPayloadOptions = {}
): WebhookPayload {
  const basePayload: WebhookPayload = {
    action,
    uuid: botUuid,
  };

  switch (action) {
    case WebhookActionEnum.start:
    case WebhookActionEnum.close:
    case WebhookActionEnum.closeSl:
      return options.symbol
        ? { ...basePayload, symbol: options.symbol }
        : basePayload;

    case WebhookActionEnum.startBot:
      return basePayload;

    case WebhookActionEnum.stopBot:
      return {
        ...basePayload,
        closeType: options.closeType || 'limit | market | leave | cancel',
      };

    case WebhookActionEnum.addFunds:
    case WebhookActionEnum.reduceFunds:
      return {
        ...basePayload,
        asset: options.asset || OrderSizeTypeEnum.base,
        qty: options.qty || 'X',
        type: options.type || 'perc | fixed',
        ...(options.symbol && { symbol: options.symbol }),
      };

    case WebhookActionEnum.changePairs:
      return {
        ...basePayload,
        pairsToSet: options.pairsToSet || ['BTC_USDT'],
        pairsToSetMode: options.pairsToSetMode || PairsToSetMode.replace,
      };

    default:
      return basePayload;
  }
}

/**
 * Webhook options matching main-dash WebhookDataProps.options
 */
export interface WebhookOptions {
  multi?: boolean;
  openDeal?: boolean;
  closeDeal?: boolean;
  closeDealSl?: boolean;
  addBase?: boolean;
  addQuote?: boolean;
  reduceBase?: boolean;
  reduceQuote?: boolean;
}

/**
 * Compute webhook options from bot settings - matching main-dash botData.tsx logic
 */
export function computeWebhookOptions(
  bot: DCABot,
  combo?: boolean,
  hedge?: boolean
): WebhookOptions {
  const settings = bot.settings;
  if (!settings) return {};

  return {
    multi: settings.useMulti,
    openDeal: settings.startCondition === StartConditionEnum.tradingviewSignals,
    closeDeal:
      settings.useTp &&
      settings.dealCloseCondition === CloseConditionEnum.webhook,
    closeDealSl:
      settings.useSl &&
      settings.dealCloseConditionSL === CloseConditionEnum.webhook,
    addBase:
      (!settings.useMulti ||
        (settings.useMulti && settings.strategy === StrategyEnum.short)) &&
      !combo &&
      !hedge,
    addQuote:
      (!settings.useMulti ||
        (settings.useMulti && settings.strategy === StrategyEnum.long)) &&
      !combo &&
      !hedge,
    reduceBase:
      (!settings.useMulti ||
        (settings.useMulti && settings.strategy === StrategyEnum.short)) &&
      !combo &&
      !hedge,
    reduceQuote:
      (!settings.useMulti ||
        (settings.useMulti && settings.strategy === StrategyEnum.long)) &&
      !combo &&
      !hedge,
  };
}

/**
 * Get all webhook actions with their availability status based on bot config.
 * Returns ALL actions, marking unavailable ones as disabled with a reason.
 */
export function getWebhookActionAvailability(
  bot: DCABot,
  combo?: boolean,
  terminal?: boolean
): WebhookActionAvailability[] {
  const options = computeWebhookOptions(bot, combo);
  const actions: WebhookActionAvailability[] = [];

  // Open deal
  actions.push({
    action: WebhookActionEnum.start,
    enabled: !!options.openDeal,
    disabledReason: !options.openDeal
      ? 'Set start condition to "Webhook" to use this'
      : undefined,
  });

  // Close deal
  actions.push({
    action: WebhookActionEnum.close,
    enabled: !!options.closeDeal,
    disabledReason: !options.closeDeal
      ? 'Enable TP and set close condition to "Webhook" to use this'
      : undefined,
  });

  // Close deal by SL
  actions.push({
    action: WebhookActionEnum.closeSl,
    enabled: !!options.closeDealSl,
    disabledReason: !options.closeDealSl
      ? 'Enable SL and set SL close condition to "Webhook" to use this'
      : undefined,
  });

  // Start/Stop bot - always available unless terminal
  if (!terminal) {
    actions.push({
      action: WebhookActionEnum.startBot,
      enabled: true,
    });
    actions.push({
      action: WebhookActionEnum.stopBot,
      enabled: true,
    });
  }

  // Add/Reduce funds - enabled if either base or quote is available
  const canAddFunds = !!(options.addBase || options.addQuote);
  const canReduceFunds = !!(options.reduceBase || options.reduceQuote);

  if (!combo) {
    actions.push({
      action: WebhookActionEnum.addFunds,
      enabled: canAddFunds,
      disabledReason: !canAddFunds
        ? 'Not available for this configuration'
        : undefined,
    });
    actions.push({
      action: WebhookActionEnum.reduceFunds,
      enabled: canReduceFunds,
      disabledReason: !canReduceFunds
        ? 'Not available for this configuration'
        : undefined,
    });
  }

  // Change pairs - only for multi-symbol, non-combo bots
  if (options.multi && !combo) {
    actions.push({
      action: WebhookActionEnum.changePairs,
      enabled: true,
    });
  } else if (!combo) {
    actions.push({
      action: WebhookActionEnum.changePairs,
      enabled: false,
      disabledReason: 'Enable multi-pair to use this',
    });
  }

  return actions;
}

/**
 * Determine available webhook actions for a bot (only enabled ones)
 */
export function getAvailableActions(
  bot: DCABot,
  combo?: boolean,
  terminal?: boolean
): WebhookActionEnum[] {
  return getWebhookActionAvailability(bot, combo, terminal)
    .filter((a) => a.enabled)
    .map((a) => a.action);
}

/**
 * Check if bot supports multiple symbols
 */
export function isMultiSymbolBot(bot: DCABot): boolean {
  return !!bot.settings?.useMulti;
}

/**
 * Get symbol from bot configuration
 */
export function getBotSymbol(bot: DCABot): string {
  if (bot.symbol && bot.symbol.length > 0) {
    const firstSymbol = bot.symbol[0];
    if (firstSymbol.value?.symbol) {
      return firstSymbol.value.symbol;
    }
    if (firstSymbol.value?.baseAsset && firstSymbol.value?.quoteAsset) {
      return `${firstSymbol.value.baseAsset}_${firstSymbol.value.quoteAsset}`;
    }
  }

  if (
    bot.settings?.pair &&
    Array.isArray(bot.settings.pair) &&
    bot.settings.pair.length > 0
  ) {
    const pair = bot.settings.pair[0];
    if (pair.includes('USDT')) {
      const base = pair.replace('USDT', '');
      return `${base}_USDT`;
    }
    if (pair.includes('BTC')) {
      const base = pair.replace('BTC', '');
      return base ? `${base}_BTC` : 'BTC_USDT';
    }
    return pair;
  }

  return 'BTC_USDT';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Prefer the async Clipboard API in secure contexts, but fall back to the
  // legacy execCommand path if it throws — writeText rejects with
  // NotAllowedError when the document isn't focused or clipboard-write is
  // blocked by a permissions policy (e.g. inside an embedded/preview frame).
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the execCommand fallback below
    }
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    textArea.remove();
    return success;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Format action name for display
 */
export function formatActionName(action: WebhookActionEnum): string {
  const actionNames: Record<WebhookActionEnum, string> = {
    [WebhookActionEnum.start]: 'Start Deal',
    [WebhookActionEnum.close]: 'Close Deal',
    [WebhookActionEnum.closeSl]: 'Close Deal (Stop Loss)',
    [WebhookActionEnum.startBot]: 'Start Bot',
    [WebhookActionEnum.stopBot]: 'Stop Bot',
    [WebhookActionEnum.addFunds]: 'Add Funds',
    [WebhookActionEnum.reduceFunds]: 'Reduce Funds',
    [WebhookActionEnum.changePairs]: 'Change Pairs',
  };

  return actionNames[action] || action;
}

/**
 * Get action description for display
 */
export function getActionDescription(action: WebhookActionEnum): string {
  const descriptions: Record<WebhookActionEnum, string> = {
    [WebhookActionEnum.start]: 'Start a new deal for the bot',
    [WebhookActionEnum.close]: 'Close an existing deal',
    [WebhookActionEnum.closeSl]: 'Close deal with stop loss trigger',
    [WebhookActionEnum.startBot]: 'Start the bot operation',
    [WebhookActionEnum.stopBot]: 'Stop the bot operation',
    [WebhookActionEnum.addFunds]: 'Add funds to bot or deal',
    [WebhookActionEnum.reduceFunds]: 'Reduce funds from bot or deal',
    [WebhookActionEnum.changePairs]:
      'Change trading pairs for multi-symbol bot',
  };

  return descriptions[action] || 'Webhook action';
}
