export enum WebhookActionEnum {
  /** Start deal */
  start = 'startDeal',
  /** Close deal */
  close = 'closeDeal',
  /** Close deal with stop loss */
  closeSl = 'closeDealSl',
  /** Start bot */
  startBot = 'startBot',
  /** Stop bot */
  stopBot = 'stopBot',
  /** Add funds */
  addFunds = 'addFunds',
  /** Reduce funds */
  reduceFunds = 'reduceFunds',
  /** Change pairs */
  changePairs = 'changePairs',
}

export enum PairsToSetMode {
  add = 'add',
  remove = 'remove',
  replace = 'replace',
}

export interface WebhookPayload {
  action: WebhookActionEnum;
  uuid: string;
  symbol?: string;
  asset?: string;
  qty?: string;
  type?: string;
  closeType?: string;
  pairsToSet?: string[];
  pairsToSetMode?: PairsToSetMode;
}

export interface WebhookPayloadOptions {
  symbol?: string;
  asset?: string;
  qty?: string;
  type?: string;
  closeType?: string;
  pairsToSet?: string[];
  pairsToSetMode?: PairsToSetMode;
}

export interface WebhookConfiguration {
  url: string;
  availableActions: WebhookActionEnum[];
  payloads: Record<string, WebhookPayload>;
}

export interface WebhookActionCategory {
  name: string;
  description: string;
  actions: WebhookActionEnum[];
}

export const WEBHOOK_ACTION_CATEGORIES: WebhookActionCategory[] = [
  {
    name: 'Deal Management',
    description: 'Start and close trading deals',
    actions: [
      WebhookActionEnum.start,
      WebhookActionEnum.close,
      WebhookActionEnum.closeSl,
    ],
  },
  {
    name: 'Bot Control',
    description: 'Start and stop bot operations',
    actions: [WebhookActionEnum.startBot, WebhookActionEnum.stopBot],
  },
  {
    name: 'Fund Management',
    description: 'Add or reduce funds in deals',
    actions: [WebhookActionEnum.addFunds, WebhookActionEnum.reduceFunds],
  },
  {
    name: 'Symbol Management',
    description: 'Change trading pairs for multi-symbol bots',
    actions: [WebhookActionEnum.changePairs],
  },
];

/** Webhook options for a specific action - which config options are available */
export interface WebhookActionAvailability {
  action: WebhookActionEnum;
  enabled: boolean;
  disabledReason?: string;
}

/** Outgoing webhook types - copied from main-dash */
export enum BotWebhookOptionTriggerEnum {
  startBot = 'startBot',
  stopBot = 'stopBot',
  closeDeal = 'closeDeal',
  startDeal = 'startDeal',
}

export enum BotWebhookOptionMethodEnum {
  POST = 'POST',
  GET = 'GET',
}

export type BotWebhookOption = {
  trigger: BotWebhookOptionTriggerEnum;
  url: string;
  method: BotWebhookOptionMethodEnum;
  body?: string;
  uuid: string;
};

export type BotWebhookLogs = {
  _id: string;
  optionUuid: string;
  requestBody: string;
  responseBody: string;
  status: number;
  url: string;
  trigger: BotWebhookOptionTriggerEnum;
  method: BotWebhookOptionMethodEnum;
  created: string;
};
