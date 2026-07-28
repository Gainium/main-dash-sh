/* eslint-disable spacing/no-hardcoded-font-size */
/* eslint-disable react-hooks/set-state-in-render */
import { useWebhookEligibility } from '@/hooks/useWebhookEligibility';
import {
  trackWebhookCopyInteraction,
  trackWebhookSurfaceView,
  trackWebhookUpgradeClick,
} from '@/services/telemetry/webhookTelemetry';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Lock,
  Plus,
  Trash2,
  Webhook,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  copyToClipboard,
  formatActionName,
  generateWebhookPayload,
  generateWebhookUrl,
  getActionDescription,
  getBotSymbol,
  getWebhookActionAvailability,
  computeWebhookOptions,
} from '../../../../lib/webhookUtils';
import {
  BotWebhookOptionMethodEnum,
  BotWebhookOptionTriggerEnum,
  type BotWebhookOption,
  type WebhookActionAvailability,
  WebhookActionEnum,
  PairsToSetMode,
  type WebhookPayload,
} from '../../../../types/webhook';
import { OrderSizeTypeEnum } from '../../../../types';
import { Alert, AlertDescription, AlertTitle } from '../../../ui/alert';
import { Button } from '../../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs';
import { DrawerSection } from './DrawerSection';
import type { DrawerBot } from '@/types/bots/drawer';
import type { DCABot } from '@/types';

export interface DrawerWebhookInfoProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

const BotWebhookOptionTriggerMap: Record<BotWebhookOptionTriggerEnum, string> =
  {
    [BotWebhookOptionTriggerEnum.startBot]: 'Bot Started',
    [BotWebhookOptionTriggerEnum.stopBot]: 'Bot Stopped',
    [BotWebhookOptionTriggerEnum.startDeal]: 'Deal Started',
    [BotWebhookOptionTriggerEnum.closeDeal]: 'Deal Closed',
  };

const OUTGOING_DEFAULT_PAYLOAD = {
  trigger: '{{trigger}}',
  botName: '{{botName}}',
  botId: '{{botId}}',
  timestamp: '{{timestamp}}',
  symbol: '{{symbol}}',
  dealId: '{{dealId}}',
  exchange: '{{exchange}}',
  duration: '{{duration}}',
  closePnL: '{{closePnL}}',
};

const OUTGOING_MAX_PAYLOAD_SIZE = 500;

const BLOCKED_HOSTNAMES = [
  'localhost',
  'binance',
  'bybit',
  'bitget',
  'okx',
  'coinbase',
  'kucoin',
  'coinmarketcap',
  'coingecko',
  'gainium',
];

const OUTGOING_VARIABLES = [
  { name: '{{trigger}}', desc: 'Trigger event name' },
  { name: '{{botName}}', desc: 'Bot name' },
  { name: '{{botId}}', desc: 'Bot ID' },
  { name: '{{timestamp}}', desc: 'Current timestamp' },
  { name: '{{symbol}}', desc: 'Symbol (deal triggers only)' },
  { name: '{{dealId}}', desc: 'Deal ID (deal triggers only)' },
  { name: '{{exchange}}', desc: 'Exchange name' },
  { name: '{{duration}}', desc: 'Deal duration in ms (closeDeal only)' },
  { name: '{{closePnL}}', desc: 'Deal close PnL in $ (closeDeal only)' },
];

// --- Incoming Action Item ---
interface IncomingActionItemProps {
  availability: WebhookActionAvailability;
  /** The bot's `uuid` field — what trade_signal matches on, NOT the Mongo `_id`. */
  botUuid: string;
  botSymbol: string;
  allBotSymbols: string[];
  isMulti: boolean;
  canInteract: boolean;
  copiedItem: string | null;
  onCopy: (text: string, itemId: string) => void;
}

const IncomingActionItem: React.FC<IncomingActionItemProps> = ({
  availability,
  botUuid,
  botSymbol: defaultSymbol,
  allBotSymbols,
  isMulti,
  canInteract,
  copiedItem,
  onCopy,
}) => {
  const { action, enabled, disabledReason } = availability;
  const [expanded, setExpanded] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(defaultSymbol);
  const [selectedAsset, setSelectedAsset] = useState<string>(
    OrderSizeTypeEnum.base
  );
  const [selectedType, setSelectedType] = useState<string>('perc');
  const [selectedQty, setSelectedQty] = useState<string>('10');
  const [selectedCloseType, setSelectedCloseType] = useState<string>('limit');
  const [selectedPairsMode, setSelectedPairsMode] = useState<PairsToSetMode>(
    PairsToSetMode.replace
  );

  const needsSymbol =
    isMulti &&
    [
      WebhookActionEnum.start,
      WebhookActionEnum.close,
      WebhookActionEnum.closeSl,
      WebhookActionEnum.addFunds,
      WebhookActionEnum.reduceFunds,
    ].includes(action);

  const needsAsset = [
    WebhookActionEnum.addFunds,
    WebhookActionEnum.reduceFunds,
  ].includes(action);

  const needsCloseType = action === WebhookActionEnum.stopBot;
  const needsPairsMode = action === WebhookActionEnum.changePairs;

  const payload = useMemo<WebhookPayload>(() => {
    switch (action) {
      case WebhookActionEnum.start:
      case WebhookActionEnum.close:
      case WebhookActionEnum.closeSl:
        return generateWebhookPayload(action, botUuid, {
          ...(isMulti ? { symbol: selectedSymbol } : {}),
        });

      case WebhookActionEnum.stopBot:
        return generateWebhookPayload(action, botUuid, {
          closeType: selectedCloseType,
        });

      case WebhookActionEnum.addFunds:
      case WebhookActionEnum.reduceFunds:
        return generateWebhookPayload(action, botUuid, {
          asset: selectedAsset,
          qty: selectedQty || 'X',
          type: selectedType,
          ...(isMulti ? { symbol: selectedSymbol } : {}),
        });

      case WebhookActionEnum.changePairs:
        return generateWebhookPayload(action, botUuid, {
          pairsToSet: [selectedSymbol],
          pairsToSetMode: selectedPairsMode,
        });

      default:
        return generateWebhookPayload(action, botUuid, {
          ...(isMulti ? { symbol: selectedSymbol } : {}),
        });
    }
  }, [
    action,
    botUuid,
    isMulti,
    selectedSymbol,
    selectedAsset,
    selectedQty,
    selectedType,
    selectedCloseType,
    selectedPairsMode,
  ]);

  const payloadText = JSON.stringify(payload, undefined, 2);
  const itemId = `action_${action}`;

  return (
    <div
      className={`rounded-md border ${enabled ? 'border-border' : 'border-border/50 opacity-60'}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={() => enabled && setExpanded(!expanded)}
        disabled={!enabled}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {formatActionName(action)}
            </span>
            {!enabled && <Lock className="w-3 h-3 text-muted-foreground" />}
          </div>
          {!enabled && disabledReason && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {disabledReason}
            </p>
          )}
        </div>
        {enabled &&
          (expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ))}
      </button>

      {enabled && expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/50 pt-2.5">
          <p className="text-xs text-muted-foreground">
            {getActionDescription(action)}
          </p>

          {/* Per-action config options - inline rows */}
          {(needsSymbol || needsAsset || needsCloseType || needsPairsMode) && (
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
              {needsSymbol && allBotSymbols.length > 0 && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Symbol
                  </label>
                  <Select
                    value={selectedSymbol}
                    onValueChange={setSelectedSymbol}
                  >
                    <SelectTrigger size="sm" className="h-7 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allBotSymbols.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}

              {needsAsset && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Asset
                  </label>
                  <Select
                    value={selectedAsset}
                    onValueChange={setSelectedAsset}
                  >
                    <SelectTrigger size="sm" className="h-7 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OrderSizeTypeEnum.base}>
                        Base
                      </SelectItem>
                      <SelectItem value={OrderSizeTypeEnum.quote}>
                        Quote
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              {needsAsset && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Qty
                  </label>
                  <input
                    type="text"
                    className="h-7 w-full bg-transparent px-2 rounded-md text-xs border border-input focus:outline-none focus:ring-1 focus:ring-ring"
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(e.target.value)}
                    placeholder="10"
                  />
                </>
              )}

              {needsAsset && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Type
                  </label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger size="sm" className="h-7 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perc">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              {needsCloseType && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Close type
                  </label>
                  <Select
                    value={selectedCloseType}
                    onValueChange={setSelectedCloseType}
                  >
                    <SelectTrigger size="sm" className="h-7 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limit">Limit</SelectItem>
                      <SelectItem value="market">Market</SelectItem>
                      <SelectItem value="leave">Leave</SelectItem>
                      <SelectItem value="cancel">Cancel</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              {needsPairsMode && (
                <>
                  <label className="text-xs text-muted-foreground whitespace-nowrap">
                    Mode
                  </label>
                  <Select
                    value={selectedPairsMode}
                    onValueChange={(v) =>
                      setSelectedPairsMode(v as PairsToSetMode)
                    }
                  >
                    <SelectTrigger size="sm" className="h-7 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PairsToSetMode.replace}>
                        Replace
                      </SelectItem>
                      <SelectItem value={PairsToSetMode.add}>Add</SelectItem>
                      <SelectItem value={PairsToSetMode.remove}>
                        Remove
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          {/* Payload display */}
          <div className="relative group">
            <pre className="p-2 pr-8 bg-muted/50 rounded-md text-[11px] leading-relaxed font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-36 overflow-y-auto border border-border/40">
              {payloadText}
            </pre>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCopy(payloadText, itemId)}
              disabled={!canInteract}
              className="absolute top-1.5 right-1.5 h-6 w-6 p-0 opacity-60 hover:opacity-100"
            >
              {copiedItem === itemId ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Outgoing Webhook Item ---
interface OutgoingWebhookItemProps {
  data: BotWebhookOption;
  isOpen: boolean;
  onToggle: () => void;
  bannedTriggers: BotWebhookOptionTriggerEnum[];
  onSave: (data: BotWebhookOption) => void;
  onDelete: (uuid: string) => void;
}

const OutgoingWebhookItem: React.FC<OutgoingWebhookItemProps> = ({
  data,
  isOpen,
  onToggle,
  bannedTriggers,
  onSave,
  onDelete,
}) => {
  const [trigger, setTrigger] = useState(data.trigger);
  const [url, setUrl] = useState(data.url);
  const [method, setMethod] = useState(data.method);
  const [payload, setPayload] = useState(data.body || '');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    setTrigger(data.trigger);
    setUrl(data.url.trim());
    setMethod(data.method);
    setPayload((data.body || '').trim());
  }, [data]);

  const verifiedUrl = useMemo(() => {
    setUrlError('');
    const trim = url.trim();
    if (!trim.length) return false;
    try {
      const parsed = new URL(trim);
      if (
        parsed.hostname === '' ||
        BLOCKED_HOSTNAMES.some((b) => parsed.hostname.includes(b))
      ) {
        setUrlError('Hostname not allowed');
        return false;
      }
      return true;
    } catch {
      setUrlError('Invalid URL');
      return false;
    }
  }, [url]);

  const hasChanges = useMemo(() => {
    return (
      trigger !== data.trigger ||
      url.trim() !== data.url.trim() ||
      method !== data.method ||
      payload.trim() !== (data.body || '').trim()
    );
  }, [data, method, payload, trigger, url]);

  const canSave =
    verifiedUrl && hasChanges && payload.length <= OUTGOING_MAX_PAYLOAD_SIZE;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      ...data,
      trigger,
      url: url.trim(),
      method,
      body: payload.trim().slice(0, OUTGOING_MAX_PAYLOAD_SIZE),
    });
  };

  const triggers = Object.values(BotWebhookOptionTriggerEnum).filter(
    (v) => typeof v === 'string'
  );
  const methods = Object.values(BotWebhookOptionMethodEnum).filter(
    (v) => typeof v === 'string'
  );

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">
            {BotWebhookOptionTriggerMap[data.trigger]}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {data.url || 'No URL set'}
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/50 pt-2.5">
          {/* Config fields - inline grid */}
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">
              Trigger
            </label>
            <Select
              value={trigger}
              onValueChange={(v) =>
                setTrigger(v as BotWebhookOptionTriggerEnum)
              }
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {triggers.map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    disabled={
                      bannedTriggers.includes(
                        t as BotWebhookOptionTriggerEnum
                      ) && t !== data.trigger
                    }
                  >
                    {
                      BotWebhookOptionTriggerMap[
                        t as BotWebhookOptionTriggerEnum
                      ]
                    }
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="text-xs text-muted-foreground whitespace-nowrap">
              URL
            </label>
            <div>
              <input
                className="h-7 w-full bg-transparent px-2 rounded-md text-xs border border-input focus:outline-none focus:ring-1 focus:ring-ring"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
              {urlError && (
                <p className="text-[10px] text-destructive mt-0.5">
                  {urlError}
                </p>
              )}
            </div>

            <label className="text-xs text-muted-foreground whitespace-nowrap">
              Method
            </label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as BotWebhookOptionMethodEnum)}
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payload (POST only) */}
          {method === BotWebhookOptionMethodEnum.POST && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Payload</label>
                <span
                  className={`text-[10px] ${payload.length > OUTGOING_MAX_PAYLOAD_SIZE ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {payload.length}/{OUTGOING_MAX_PAYLOAD_SIZE}
                </span>
              </div>
              <textarea
                className="w-full bg-transparent px-2 py-1.5 rounded-md text-[11px] leading-relaxed font-mono border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={6}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
              <details className="text-[10px] text-muted-foreground">
                <summary className="cursor-pointer font-medium text-xs">
                  Variables
                </summary>
                <div className="mt-1 space-y-0.5 pl-2">
                  {OUTGOING_VARIABLES.map((v) => (
                    <p key={v.name}>
                      <code className="text-foreground">{v.name}</code> &ndash;{' '}
                      {v.desc}
                    </p>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => onDelete(data.uuid)}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!canSave}
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Component ---
export const DrawerWebhookInfo: React.FC<DrawerWebhookInfoProps> = ({
  widgetId,
  botId,
  bot,
}) => {
  const [selectedTab, setSelectedTab] = useState<'incoming' | 'outgoing'>(
    'incoming'
  );
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // Outgoing webhook state
  const [outgoingWebhooks, setOutgoingWebhooks] = useState<BotWebhookOption[]>(
    []
  );
  const [openOutgoing, setOpenOutgoing] = useState<string[]>([]);

  const eligibility = useWebhookEligibility({
    bot: (bot as DCABot) ?? null,
    isEditMode: true,
    context: 'drawer',
  });
  const { canInteract, showUpgradeMessage, showDowngradeWarning } = eligibility;
  const resolvedBotId = bot?._id ?? botId ?? null;
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (!resolvedBotId) {
      viewTrackedRef.current = false;
      return;
    }
    if (viewTrackedRef.current) return;
    trackWebhookSurfaceView(eligibility, {
      surface: 'drawer',
      botId: resolvedBotId,
      widgetId,
    });
    viewTrackedRef.current = true;
  }, [eligibility, resolvedBotId, widgetId]);

  // Webhook config
  const webhookUrl = useMemo(() => generateWebhookUrl(), []);

  const dcaBot = bot as DCABot | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isCombo = !!(bot as any)?.combo;

  const webhookOptions = useMemo(
    () => (dcaBot ? computeWebhookOptions(dcaBot, isCombo) : {}),
    [dcaBot, isCombo]
  );

  const actionAvailability = useMemo(
    () => (dcaBot ? getWebhookActionAvailability(dcaBot, isCombo) : []),
    [dcaBot, isCombo]
  );

  const allBotSymbols = useMemo(() => {
    if (!dcaBot) return ['BTC_USDT'];
    const symbols: string[] = [];
    if (
      dcaBot.symbol &&
      Array.isArray(dcaBot.symbol) &&
      dcaBot.symbol.length > 0
    ) {
      for (const s of dcaBot.symbol) {
        if (s.value?.symbol) {
          symbols.push(s.value.symbol);
        } else if (s.value?.baseAsset && s.value?.quoteAsset) {
          symbols.push(`${s.value.baseAsset}_${s.value.quoteAsset}`);
        }
      }
    }
    if (symbols.length === 0) {
      symbols.push(getBotSymbol(dcaBot));
    }
    return symbols;
  }, [dcaBot]);

  const botSymbol = allBotSymbols[0] || 'BTC_USDT';

  // Handle copy
  const handleCopy = useCallback(
    async (text: string, itemId: string) => {
      const metadata = {
        surface: 'drawer',
        botId: resolvedBotId,
        widgetId,
        target: itemId,
      };

      if (!canInteract) {
        trackWebhookCopyInteraction(eligibility, {
          ...metadata,
          success: false,
          reason: 'locked',
        });
        return;
      }

      const success = await copyToClipboard(text);
      trackWebhookCopyInteraction(eligibility, {
        ...metadata,
        success,
        ...(success ? {} : { reason: 'clipboard-error' }),
      });

      if (success) {
        setCopiedItem(itemId);
        setTimeout(() => setCopiedItem(null), 2000);
      }
    },
    [canInteract, eligibility, resolvedBotId, widgetId]
  );

  const emitUpgradeClick = useCallback(
    (source: string) => {
      trackWebhookUpgradeClick(eligibility, {
        surface: 'drawer',
        botId: resolvedBotId,
        widgetId,
        source,
      });
    },
    [eligibility, resolvedBotId, widgetId]
  );

  // Outgoing webhook handlers
  const bannedTriggers = useMemo(
    () => [...new Set(outgoingWebhooks.map((w) => w.trigger))],
    [outgoingWebhooks]
  );

  const handleSaveOutgoing = useCallback((data: BotWebhookOption) => {
    setOutgoingWebhooks((prev) => {
      const exists = prev.find((w) => w.uuid === data.uuid);
      if (!exists) return [...prev, data];
      return prev.map((w) => (w.uuid === data.uuid ? data : w));
    });
    // TODO: call API to persist
  }, []);

  const handleDeleteOutgoing = useCallback((uuid: string) => {
    setOutgoingWebhooks((prev) => prev.filter((w) => w.uuid !== uuid));
    setOpenOutgoing((prev) => prev.filter((id) => id !== uuid));
    // TODO: call API to persist
  }, []);

  const allTriggers = Object.values(BotWebhookOptionTriggerEnum).filter(
    (v) => typeof v === 'string'
  );
  const canAddOutgoing = bannedTriggers.length < allTriggers.length;

  const handleAddOutgoing = useCallback(() => {
    if (!canAddOutgoing) return;
    const availableTrigger = allTriggers.find(
      (t) => !bannedTriggers.includes(t as BotWebhookOptionTriggerEnum)
    ) as BotWebhookOptionTriggerEnum;
    if (!availableTrigger) return;

    const uuid = crypto.randomUUID();
    const newWebhook: BotWebhookOption = {
      trigger: availableTrigger,
      url: '',
      method: BotWebhookOptionMethodEnum.POST,
      body: JSON.stringify(OUTGOING_DEFAULT_PAYLOAD, null, 2),
      uuid,
    };
    setOutgoingWebhooks((prev) => [...prev, newWebhook]);
    setOpenOutgoing((prev) => [...prev, uuid]);
  }, [canAddOutgoing, allTriggers, bannedTriggers]);

  if (!bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-webhook-info"
        title="Webhook Configuration"
        icon={Webhook}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 8 }}
        hasOptions={false}
      >
        <div className="text-center text-muted-foreground text-sm">
          Bot not found
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-webhook-info"
      title="Webhook Configuration"
      icon={Webhook}
      minSize={{ w: 6, h: 6 }}
      maxSize={{ w: 12, h: 8 }}
      hasOptions={false}
    >
      {(showUpgradeMessage || showDowngradeWarning) && (
        <Alert className="mb-3 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertTitle className="text-xs font-semibold">
            {showUpgradeMessage
              ? 'Interactive webhook tools are locked'
              : 'Webhook tools are read-only'}
          </AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            {showUpgradeMessage ? (
              <>
                Webhook automation for terminal bots is limited to paid plans.{' '}
                <a
                  href="/subscription"
                  onClick={() => emitUpgradeClick('drawer-upsell-link')}
                  className="inline-flex items-center font-medium underline transition hover:text-amber-700 dark:hover:text-amber-200"
                >
                  Upgrade your plan
                  <Lock className="ml-1 h-3 w-3" />
                </a>{' '}
                to unlock copying payloads and advanced TradingView
                integrations.
              </>
            ) : (
              <>
                Your current plan no longer includes webhook automation.
                Existing payloads stay visible but interactions are disabled
                until you upgrade.{' '}
                <a
                  href="/subscription"
                  onClick={() => emitUpgradeClick('drawer-downgrade-link')}
                  className="inline-flex items-center font-medium underline transition hover:text-amber-700 dark:hover:text-amber-200"
                >
                  Review plans
                  <Lock className="ml-1 h-3 w-3" />
                </a>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={selectedTab}
        onValueChange={(v) => setSelectedTab(v as 'incoming' | 'outgoing')}
        className="space-y-sm"
      >
        <TabsList className="grid w-full grid-cols-2 h-8">
          <TabsTrigger value="incoming" className="text-xs px-3 py-1">
            Incoming
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="text-xs px-3 py-1">
            Outgoing
          </TabsTrigger>
        </TabsList>

        {/* === INCOMING TAB === */}
        <TabsContent value="incoming" className="mt-3 p-0">
          <div className="space-y-sm">
            {/* Webhook URL */}
            <div className="space-y-xs">
              <label className="text-xs font-medium">Webhook URL</label>
              <div className="flex items-center gap-xs">
                <code className="flex-1 p-xs bg-muted rounded text-xs font-mono break-all">
                  {webhookUrl}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(webhookUrl, 'url')}
                  disabled={!canInteract}
                  className="p-0"
                >
                  {copiedItem === 'url' ? (
                    <CheckCircle className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Available Actions */}
            <div className="space-y-xs">
              <label className="text-xs font-medium">Available Actions</label>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {actionAvailability.map((avail) => (
                  <IncomingActionItem
                    key={avail.action}
                    availability={avail}
                    botUuid={bot.uuid}
                    botSymbol={botSymbol}
                    allBotSymbols={allBotSymbols}
                    isMulti={!!webhookOptions.multi}
                    canInteract={canInteract}
                    copiedItem={copiedItem}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
              {actionAvailability.length > 0 && canInteract && (
                <p className="text-[10px] text-muted-foreground">
                  Click an action to expand and customize the payload
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* === OUTGOING TAB === */}
        <TabsContent value="outgoing" className="mt-3 p-0">
          <div className="space-y-sm">
            <p className="text-xs text-muted-foreground">
              Send HTTP requests when bot events occur.
            </p>

            {outgoingWebhooks.length > 0 ? (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {outgoingWebhooks.map((wh) => (
                  <OutgoingWebhookItem
                    key={wh.uuid}
                    data={wh}
                    isOpen={openOutgoing.includes(wh.uuid)}
                    onToggle={() =>
                      setOpenOutgoing((prev) =>
                        prev.includes(wh.uuid)
                          ? prev.filter((id) => id !== wh.uuid)
                          : [...prev, wh.uuid]
                      )
                    }
                    bannedTriggers={bannedTriggers}
                    onSave={handleSaveOutgoing}
                    onDelete={handleDeleteOutgoing}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <Webhook className="w-6 h-6 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">
                  No outgoing webhooks configured
                </p>
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              disabled={!canAddOutgoing}
              onClick={handleAddOutgoing}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Webhook
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </DrawerSection>
  );
};

export default DrawerWebhookInfo;
