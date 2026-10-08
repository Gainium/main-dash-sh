import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import type {
  WebhookPayloadEntry,
  WebhookPayloadGroup,
} from '@/features/bots/bot-types/dca/form/sections/WebhookHelper';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  useBotWebhookOptions,
  useUpdateBotWebhookOptions,
} from '@/hooks/useBotWebhooks';
import { useWebhookEligibility } from '@/hooks/useWebhookEligibility';
import { copyToClipboard, generateWebhookUrl } from '@/lib/webhookUtils';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import {
  BotWebhookOptionMethodEnum,
  BotWebhookOptionTriggerEnum,
  type BotWebhookOption,
} from '@/types/webhook';
import { resolveDealStartWebhookAvailability } from '@/utils/bots/dca/deal-start-behaviours';
import { Check, Copy, ExternalLink, Lock, Plus, Trash2 } from 'lucide-react';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

const TRIGGER_LABELS: Record<BotWebhookOptionTriggerEnum, string> = {
  [BotWebhookOptionTriggerEnum.startBot]: 'Bot Started',
  [BotWebhookOptionTriggerEnum.stopBot]: 'Bot Stopped',
  [BotWebhookOptionTriggerEnum.startDeal]: 'Deal Started',
  [BotWebhookOptionTriggerEnum.closeDeal]: 'Deal Closed',
};

const ALL_TRIGGERS = Object.values(BotWebhookOptionTriggerEnum);

const DEFAULT_OUTGOING_PAYLOAD = JSON.stringify(
  {
    trigger: '{{trigger}}',
    botName: '{{botName}}',
    botId: '{{botId}}',
    timestamp: '{{timestamp}}',
    symbol: '{{symbol}}',
    dealId: '{{dealId}}',
    exchange: '{{exchange}}',
    duration: '{{duration}}',
    closePnL: '{{closePnL}}',
  },
  null,
  2
);

const MAX_OUTGOING_PAYLOAD = 500;

interface BotWebhookSettingsProps {
  /**
   * Render the terminal-deal variant (legacy `WebhookData terminal`): one deal,
   * no bot lifecycle / open-deal / pair payloads, no outgoing webhooks, and
   * paid plans only. Defaults to the form's own `terminal` flag.
   */
  terminal?: boolean;
  /**
   * The bot uuid when the form's query context has no bot — the deal edit
   * drawer loads the terminal deal's bot itself.
   */
  botUuid?: string;
}

export const BotWebhookSettings: React.FC<BotWebhookSettingsProps> = ({
  terminal,
  botUuid,
}) => {
  const { botId, bot } = useBotFormQuery();
  const formTerminal = useBotFormTopLevelSelector('terminal');
  const isTerminal = terminal ?? Boolean(formTerminal);
  const { isLocked: webhooksLocked } = useWebhookEligibility({
    isTerminalOverride: isTerminal,
    context: 'drawer',
  });
  const formPair = useBotFormTopLevelSelector('pair');
  const formType = useBotFormTopLevelSelector('type');
  const isCombo = formType === BotTypesEnum.combo;
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const copyTimeoutRef = React.useRef<number | null>(null);
  const isPaper = !useUIStore((s) => s.isLiveTrading);

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = React.useCallback(
    async (value: string, trackingId: string = 'webhook-url') => {
      const success = await copyToClipboard(value);
      if (!success) return;
      setCopiedId(trackingId);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copyTimeoutRef.current = null;
      }, 2000);
    },
    []
  );

  const webhookUrl = React.useMemo(() => generateWebhookUrl(), []);
  // The trade_signal endpoint resolves the bot by its `uuid` field, NOT by the
  // Mongo `_id` the route param carries (main-app webhookProcess does
  // `dcaBotDb.readData({ uuid })`). Legacy main-dash has always emitted
  // `bot.uuid` here — emitting `_id` produces payloads that silently match no
  // bot.
  const knownBotUuid = botUuid ?? bot?.uuid;
  const resolvedBotUuid = knownBotUuid ?? 'YOUR_BOT_UUID';
  const missingBotUuid = !knownBotUuid;
  // Outgoing webhooks are persisted through the bot API, which keys off `_id`.
  const missingBotId = !botId && !bot?._id;

  const [sampleBase, sampleQuote] = React.useMemo(() => {
    const firstPair = Array.isArray(formPair)
      ? formPair[0]
      : formPair;
    const metadata = formPairMetadata?.[firstPair];
    if (metadata?.baseAsset?.name && metadata?.quoteAsset?.name) {
      return [metadata.baseAsset.name, metadata.quoteAsset.name];
    }
    return ['BTC', 'USDT'];
  }, [formPair, formPairMetadata]);

  const sampleSymbol = React.useMemo(
    () => `${sampleBase}_${sampleQuote}`,
    [sampleBase, sampleQuote]
  );

  // header controls state
  const [stopCloseType, setStopCloseType] = React.useState<string>('limit');
  const [addQty, setAddQty] = React.useState<string>('10');
  const [addQtyType, setAddQtyType] = React.useState<string>('perc');
  const [reduceQty, setReduceQty] = React.useState<string>('10');
  const [reduceQtyType, setReduceQtyType] = React.useState<string>('perc');
  const [targetSymbol, setTargetSymbol] = React.useState<string>(sampleSymbol);
  const [exitsType, setExitsType] = React.useState<'perc' | 'price'>('perc');

  const useBotController = useBotFormSelector('useBotController');
  const startCondition = useBotFormSelector('startCondition');
  const strategy = useBotFormSelector('strategy');
  const useMulti = useBotFormSelector('useMulti');
  const useTp = useBotFormSelector('useTp');
  const useSl = useBotFormSelector('useSl');
  const baseOrderSize = useBotFormSelector('baseOrderSize');
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const dealCloseConditionSL = useBotFormSelector('dealCloseConditionSL');

  const availability = React.useMemo(() => {
    const resolved = resolveDealStartWebhookAvailability({
      startCondition: startCondition,
      strategy: strategy,
      useMulti: useMulti,
      useTp: useTp,
      useSl: useSl,
      dealCloseCondition: dealCloseCondition,
      dealCloseConditionSL: dealCloseConditionSL,
      primarySymbol: sampleSymbol,
      symbolExamples: [sampleSymbol],
    });
    // A terminal deal is opened from the terminal, never by a signal.
    return isTerminal ? { ...resolved, openDeal: false } : resolved;
  }, [
    isTerminal,
    startCondition,
    strategy,
    useMulti,
    useTp,
    useSl,
    dealCloseCondition,
    dealCloseConditionSL,
    sampleSymbol,
  ]);

  const lifecyclePayloads: WebhookPayloadEntry[] = [];
  if (useBotController && !isTerminal) {
    lifecyclePayloads.push(
      {
        title: 'Start bot',
        payload: JSON.stringify(
          { action: 'startBot', uuid: resolvedBotUuid },
          null,
          2
        ),
        copyLabel: 'Copy',
      },
      {
        title: 'Stop bot',
        payload: JSON.stringify(
          { action: 'stopBot', uuid: resolvedBotUuid, closeType: stopCloseType },
          null,
          2
        ),
        copyLabel: 'Copy',
        headerControls: (
          <div className="flex items-center gap-xs">
            <Label className="text-xs">closeType</Label>
            <Select value={stopCloseType} onValueChange={setStopCloseType}>
              <SelectTrigger id="stop-close-type" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="limit">limit</SelectItem>
                <SelectItem value="market">market</SelectItem>
                <SelectItem value="leave">leave</SelectItem>
                <SelectItem value="cancel">cancel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ),
      }
    );
  }

  const dealPayloads: WebhookPayloadEntry[] = [];
  if (availability.openDeal) {
    dealPayloads.push({
      title: 'Open deal for all symbols',
      payload: JSON.stringify(
        { action: 'startDeal', uuid: resolvedBotUuid },
        null,
        2
      ),
      copyLabel: 'Copy',
    });
  }
  if (availability.openDeal) {
    // Prices belong to one pair, and Combo deals take percentages only.
    const byPrice = exitsType === 'price' && !isCombo;
    dealPayloads.push({
      title: 'Open deal with its own size, TP and SL (example)',
      tooltip: `Optional fields, each replacing the bot's setting for this deal only: baseOrderSize (in the bot's base order unit), ${
        isCombo ? 'tpPerc and slPerc' : 'tpPerc or tpPrice, slPerc or slPrice'
      }. Send only the ones you need.`,
      payload: JSON.stringify(
        {
          action: 'startDeal',
          uuid: resolvedBotUuid,
          ...(useMulti ? { symbol: sampleSymbol } : {}),
          baseOrderSize: baseOrderSize || '10',
          ...(byPrice
            ? { tpPrice: 'X', slPrice: 'X' }
            : { tpPerc: '2', slPerc: '1' }),
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: isCombo ? undefined : (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">TP/SL</Label>
          <Select
            value={exitsType}
            onValueChange={(v) => setExitsType(v as 'perc' | 'price')}
          >
            <SelectTrigger id="open-deal-exits-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="price">price</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
    });
  }
  if (availability.closeDeal) {
    dealPayloads.push({
      title: isTerminal ? 'Close deal' : 'Close deal for all symbols',
      payload: JSON.stringify(
        { action: 'closeDeal', uuid: resolvedBotUuid },
        null,
        2
      ),
      copyLabel: 'Copy',
    });
  }

  if (availability.closeDealSl) {
    dealPayloads.push({
      title: isTerminal
        ? 'Close deal by SL'
        : 'Close deal by SL for all symbols',
      payload: JSON.stringify(
        { action: 'closeDealSl', uuid: resolvedBotUuid },
        null,
        2
      ),
      copyLabel: 'Copy',
    });
  }

  if (useMulti && !isTerminal) {
    if (availability.openDeal) {
      dealPayloads.push({
        title: 'Open deal for symbol (example)',
        payload: JSON.stringify(
          { action: 'startDeal', uuid: resolvedBotUuid, symbol: sampleSymbol },
          null,
          2
        ),
        copyLabel: 'Copy',
      });
    }

    if (availability.closeDeal) {
      dealPayloads.push({
        title: 'Close deal for symbol (example)',
        payload: JSON.stringify(
          { action: 'closeDeal', uuid: resolvedBotUuid, symbol: sampleSymbol },
          null,
          2
        ),
        copyLabel: 'Copy',
      });
    }

    if (availability.closeDealSl) {
      dealPayloads.push({
        title: 'Close deal by SL for symbol (example)',
        payload: JSON.stringify(
          { action: 'closeDealSl', uuid: resolvedBotUuid, symbol: sampleSymbol },
          null,
          2
        ),
        copyLabel: 'Copy',
      });
    }
  }

  // A terminal deal is one deal on one pair: base amounts need no symbol.
  const terminalFundsPayloads: WebhookPayloadEntry[] = (
    [
      ['addFunds', 'base', 'Add base amount to deal'],
      ['addFunds', 'quote', 'Add quote amount to deal'],
      ['reduceFunds', 'base', 'Reduce base amount in deal'],
      ['reduceFunds', 'quote', 'Reduce quote amount in deal'],
    ] as const
  ).map(([action, asset, title]) => {
    const isAdd = action === 'addFunds';
    const qty = isAdd ? addQty : reduceQty;
    const qtyType = isAdd ? addQtyType : reduceQtyType;
    return {
      title,
      payload: JSON.stringify(
        { action, uuid: resolvedBotUuid, asset, qty, type: qtyType },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select
            value={qtyType}
            onValueChange={isAdd ? setAddQtyType : setReduceQtyType}
          >
            <SelectTrigger id={`${action}-${asset}-type`} className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={qty}
            onChange={(e) =>
              (isAdd ? setAddQty : setReduceQty)(e.target.value)
            }
            className="w-20"
          />
        </div>
      ),
    };
  });

  const botFundsPayloads: WebhookPayloadEntry[] = [
    {
      title: 'Add base amount to all deals for symbol (example)',
      payload: JSON.stringify(
        {
          action: 'addFunds',
          uuid: resolvedBotUuid,
          asset: 'base',
          qty: addQty,
          symbol: sampleSymbol,
          type: addQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={addQtyType} onValueChange={setAddQtyType}>
            <SelectTrigger id="add-base-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
    {
      title: 'Add quote amount to all deals for all symbols',
      payload: JSON.stringify(
        {
          action: 'addFunds',
          uuid: resolvedBotUuid,
          asset: 'quote',
          qty: addQty,
          type: addQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={addQtyType} onValueChange={setAddQtyType}>
            <SelectTrigger id="add-quote-all-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
    {
      title: 'Add quote amount to all deals for symbol (example)',
      payload: JSON.stringify(
        {
          action: 'addFunds',
          uuid: resolvedBotUuid,
          asset: 'quote',
          qty: addQty,
          symbol: sampleSymbol,
          type: addQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={addQtyType} onValueChange={setAddQtyType}>
            <SelectTrigger id="add-quote-symbol-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
    {
      title: 'Reduce base amount in all deals for symbol (example)',
      payload: JSON.stringify(
        {
          action: 'reduceFunds',
          uuid: resolvedBotUuid,
          asset: 'base',
          qty: reduceQty,
          symbol: sampleSymbol,
          type: reduceQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={reduceQtyType} onValueChange={setReduceQtyType}>
            <SelectTrigger id="reduce-base-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={reduceQty}
            onChange={(e) => setReduceQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
    {
      title: 'Reduce quote amount in all deals for all symbols',
      payload: JSON.stringify(
        {
          action: 'reduceFunds',
          uuid: resolvedBotUuid,
          asset: 'quote',
          qty: reduceQty,
          type: reduceQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={reduceQtyType} onValueChange={setReduceQtyType}>
            <SelectTrigger id="reduce-quote-all-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={reduceQty}
            onChange={(e) => setReduceQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
    {
      title: 'Reduce quote amount in all deals for symbol (example)',
      payload: JSON.stringify(
        {
          action: 'reduceFunds',
          uuid: resolvedBotUuid,
          asset: 'quote',
          qty: reduceQty,
          symbol: sampleSymbol,
          type: reduceQtyType,
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">type</Label>
          <Select value={reduceQtyType} onValueChange={setReduceQtyType}>
            <SelectTrigger id="reduce-quote-symbol-type" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perc">perc</SelectItem>
              <SelectItem value="fixed">fixed</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs">qty</Label>
          <Input
            value={reduceQty}
            onChange={(e) => setReduceQty(e.target.value)}
            className="w-20"
          />
        </div>
      ),
    },
  ];
  const fundsPayloads = isTerminal ? terminalFundsPayloads : botFundsPayloads;

  const pairPayloads: WebhookPayloadEntry[] = [
    {
      title: 'Change bot pairs',
      payload: JSON.stringify(
        {
          action: 'changePairs',
          uuid: resolvedBotUuid,
          pairsToSet: [targetSymbol],
          pairsToSetMode: 'replace',
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">symbol</Label>
          <Input
            value={targetSymbol}
            onChange={(e) => setTargetSymbol(e.target.value)}
            className="w-32"
            placeholder="BTC_USDT"
          />
        </div>
      ),
    },
    {
      title: 'Add bot pairs',
      payload: JSON.stringify(
        {
          action: 'changePairs',
          uuid: resolvedBotUuid,
          pairsToSet: [targetSymbol],
          pairsToSetMode: 'add',
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">symbol</Label>
          <Input
            value={targetSymbol}
            onChange={(e) => setTargetSymbol(e.target.value)}
            className="w-32"
            placeholder="BTC_USDT"
          />
        </div>
      ),
    },
    {
      title: 'Remove bot pairs',
      payload: JSON.stringify(
        {
          action: 'changePairs',
          uuid: resolvedBotUuid,
          pairsToSet: [targetSymbol],
          pairsToSetMode: 'remove',
        },
        null,
        2
      ),
      copyLabel: 'Copy',
      headerControls: (
        <div className="flex items-center gap-xs">
          <Label className="text-xs">symbol</Label>
          <Input
            value={targetSymbol}
            onChange={(e) => setTargetSymbol(e.target.value)}
            className="w-32"
            placeholder="BTC_USDT"
          />
        </div>
      ),
    },
  ];

  const webhookPayloadGroups: WebhookPayloadGroup[] = [];
  if (lifecyclePayloads.length > 0) {
    webhookPayloadGroups.push({
      title: 'Bot lifecycle',
      description:
        'Manage automated start and stop behaviour through webhooks.',
      payloads: lifecyclePayloads,
    });
  }

  if (dealPayloads.length > 0) {
    webhookPayloadGroups.push({
      title: 'Deal management',
      description: isTerminal
        ? 'Close this deal from external signals.'
        : useMulti
          ? 'Manage deals for the bot, specify symbol for multipair bots.'
          : 'Manually open or close deals for this bot.',
      payloads: dealPayloads,
    });
  }

  if (fundsPayloads.length > 0) {
    webhookPayloadGroups.push({
      title: 'Funds management',
      description: isTerminal
        ? 'Add or remove funds in this deal via webhooks.'
        : 'Add or remove allocated capital via webhooks.',
      payloads: fundsPayloads,
    });
  }

  if (pairPayloads.length > 0 && !isTerminal) {
    webhookPayloadGroups.push({
      title: 'Pair management',
      description:
        'Modify the bot trading universe in response to external signals.',
      payloads: pairPayloads,
    });
  }

  // Outgoing webhooks — loaded from and persisted to the backend via a
  // dedicated mutation (independent of the main bot save), mirroring
  // main-dash's webhookDialog. `realBotId` is undefined for unsaved bots.
  const realBotId = botId ?? bot?._id;
  // Terminal deals have no outgoing webhooks (legacy never offered them).
  const { data: webhookOptionsResult, isLoading: webhooksLoading } =
    useBotWebhookOptions(isTerminal ? undefined : realBotId);
  const updateWebhooks = useUpdateBotWebhookOptions(realBotId);
  const outgoingWebhooks: BotWebhookOption[] = React.useMemo(
    () => webhookOptionsResult?.data ?? [],
    [webhookOptionsResult]
  );

  const [showWebhookDialog, setShowWebhookDialog] = React.useState(false);
  const [editingWebhook, setEditingWebhook] =
    React.useState<BotWebhookOption | null>(null);
  const [webhookForm, setWebhookForm] = React.useState<{
    trigger: BotWebhookOptionTriggerEnum;
    url: string;
    method: BotWebhookOptionMethodEnum;
    payload: string;
  }>({
    trigger: BotWebhookOptionTriggerEnum.startBot,
    url: '',
    method: BotWebhookOptionMethodEnum.POST,
    payload: DEFAULT_OUTGOING_PAYLOAD,
  });

  const webhookVariables = {
    always: [
      '{{trigger}}',
      '{{botName}}',
      '{{botId}}',
      '{{timestamp}}',
      '{{exchange}}',
    ],
    dealTriggers: ['{{symbol}}', '{{dealId}}'],
    closeDealOnly: ['{{duration}}', '{{closePnL}}'],
  };

  // One webhook per trigger (backend keys options by trigger). Disable the
  // triggers already used by other webhooks, like the legacy dialog.
  const usedTriggers = React.useMemo(
    () =>
      new Set(
        outgoingWebhooks
          .filter((w) => w.uuid !== editingWebhook?.uuid)
          .map((w) => w.trigger)
      ),
    [outgoingWebhooks, editingWebhook]
  );
  const allTriggersUsed = ALL_TRIGGERS.every((t) =>
    outgoingWebhooks.some((w) => w.trigger === t)
  );

  const resetWebhookForm = () => {
    setWebhookForm({
      trigger: BotWebhookOptionTriggerEnum.startBot,
      url: '',
      method: BotWebhookOptionMethodEnum.POST,
      payload: DEFAULT_OUTGOING_PAYLOAD,
    });
  };

  const handleSaveWebhook = () => {
    if (!webhookForm.url.trim()) return;

    const next: BotWebhookOption = {
      uuid: editingWebhook?.uuid ?? crypto.randomUUID(),
      trigger: webhookForm.trigger,
      url: webhookForm.url.trim(),
      method: webhookForm.method,
      body: webhookForm.payload.trim().slice(0, MAX_OUTGOING_PAYLOAD),
    };

    const nextOptions = editingWebhook
      ? outgoingWebhooks.map((w) => (w.uuid === editingWebhook.uuid ? next : w))
      : [...outgoingWebhooks, next];

    updateWebhooks.mutate(nextOptions);
    setEditingWebhook(null);
    resetWebhookForm();
    setShowWebhookDialog(false);
  };

  const handleDeleteWebhook = (uuid: string) => {
    updateWebhooks.mutate(outgoingWebhooks.filter((w) => w.uuid !== uuid));
  };

  const handleEditWebhook = (webhook: BotWebhookOption) => {
    setEditingWebhook(webhook);
    setWebhookForm({
      trigger: webhook.trigger,
      url: webhook.url,
      method: webhook.method,
      payload: webhook.body || DEFAULT_OUTGOING_PAYLOAD,
    });
    setShowWebhookDialog(true);
  };

  const handleAddWebhook = () => {
    setEditingWebhook(null);
    resetWebhookForm();
    // Default the new webhook to the first unused trigger.
    const firstFree = ALL_TRIGGERS.find(
      (t) => !outgoingWebhooks.some((w) => w.trigger === t)
    );
    if (firstFree) {
      setWebhookForm((f) => ({ ...f, trigger: firstFree }));
    }
    setShowWebhookDialog(true);
  };

  // metadataToggleHandlers intentionally disabled; toggles are in WebhookHelper

  const renderPayloadCard = (
    entry: WebhookPayloadEntry,
    trackingId: string
  ) => (
    <div
      key={trackingId}
      className="space-y-sm rounded-lg border border-border/70 bg-background p-md shadow-sm"
    >
      <div className="flex flex-col gap-xs sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-xs">
            <p className="text-sm font-semibold leading-tight">{entry.title}</p>
            {entry.tooltip ? (
              <Tooltip tooltip={entry.tooltip} side="right">
                <InfoIcon />
              </Tooltip>
            ) : null}
          </div>
          {entry.description ? (
            <p className="text-xs text-muted-foreground">{entry.description}</p>
          ) : null}
        </div>
        {entry.headerControls ? (
          <div className="flex shrink-0 items-center gap-xs">
            {entry.headerControls}
          </div>
        ) : null}
      </div>
      <Separator />
      <div className="relative flex gap-xs">
        <div className="flex-1 max-h-64 overflow-auto rounded-md border border-border/40 bg-muted/40 p-sm">
          <pre className="font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
            {entry.payload}
          </pre>
        </div>
        <Tooltip tooltip={copiedId === trackingId ? 'Copied!' : 'Copy payload'}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => handleCopy(entry.payload, trackingId)}
            className="h-8 w-8 shrink-0 self-start"
            aria-label="Copy payload"
          >
            {copiedId === trackingId ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Tabs defaultValue="incoming" className="space-y-md">
      {!isTerminal && (
        <TabsList className="w-full" fullWidth>
          <TabsTrigger value="incoming">Incoming webhooks</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing webhooks</TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="incoming" className="space-y-md">
        <Card position={2} className="space-y-md">
        <CardHeader className="p-0">
          <div className="flex flex-col gap-sm sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-base">Webhook endpoint</CardTitle>
              <CardDescription>
                {isTerminal
                  ? 'Use this URL to trigger actions on this deal from external systems.'
                  : 'Use this URL to trigger bot lifecycle and deal actions from external systems.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-xs">
              <Badge variant={isPaper ? 'outline' : 'default'}>
                {isPaper ? 'Paper trading' : 'Live trading'}
              </Badge>
              <Badge variant="secondary">Bot UUID: {resolvedBotUuid}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-sm px-0">
          <div className="flex gap-xs items-start">
            <div className="flex-1 rounded-lg border border-dashed border-border/60 bg-muted/40 p-sm">
              <div className="break-all text-xs sm:text-sm font-mono">
                {webhookUrl}
              </div>
            </div>
            <Tooltip
              tooltip={
                copiedId === 'webhook-url' ? 'Copied!' : 'Copy webhook URL'
              }
            >
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => handleCopy(webhookUrl, 'webhook-url')}
                className="h-8 w-8 shrink-0"
                aria-label="Copy webhook URL"
              >
                {copiedId === 'webhook-url' ? (
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </Tooltip>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="flex items-center gap-xs"
            >
              <a
                href="https://gainium.io/docs/webhooks"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-xs"
              >
                <ExternalLink className="h-4 w-4" />
                View docs
              </a>
            </Button>
          </div>
          {webhooksLocked ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTitle className="text-sm font-semibold">
                Webhooks are locked
              </AlertTitle>
              <AlertDescription className="text-xs sm:text-sm">
                Webhook automation for terminal deals is limited to paid
                plans.{' '}
                <RouterLink
                  to="/subscription"
                  className="inline-flex items-center font-medium underline"
                >
                  Upgrade your plan
                  <Lock className="ml-1 h-3 w-3" />
                </RouterLink>
              </AlertDescription>
            </Alert>
          ) : missingBotUuid ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTitle className="text-sm font-semibold">
                {isTerminal ? 'Place the deal first' : 'Bot UUID required'}
              </AlertTitle>
              <AlertDescription className="text-xs sm:text-sm">
                {isTerminal
                  ? 'The webhook UUID is created with the deal. After placing it, edit the deal (Open orders → Edit → Webhooks) to copy these payloads with its real UUID.'
                  : 'Save the bot first to generate a persistent identifier. Webhook payloads need a valid bot UUID.'}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {!webhooksLocked && webhookPayloadGroups.map((group) => (
        <SettingsRow
          key={group.title}
          name={group.title}
          tooltip={group.description}
          colSpan="full"
        >
          <div className="space-y-md">
            {group.payloads.map((entry, entryIndex) =>
              renderPayloadCard(entry, `${group.title}-${entryIndex}`)
            )}
          </div>
        </SettingsRow>
      ))}
      </TabsContent>

      <TabsContent value="outgoing" className="space-y-md">
      <SettingsRow
        name="Outgoing Webhooks"
        tooltip="Send bot events (start/stop, deal open/close) to external services"
        colSpan="full"
      >
        <div className="space-y-md">
          {missingBotId ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTitle className="text-sm font-semibold">
                Save the bot first
              </AlertTitle>
              <AlertDescription className="text-xs sm:text-sm">
                Outgoing webhooks are stored per bot. Create the bot before
                configuring webhook notifications.
              </AlertDescription>
            </Alert>
          ) : webhooksLoading ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-md text-sm text-muted-foreground">
              Loading webhooks…
            </div>
          ) : outgoingWebhooks.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-md text-sm text-muted-foreground">
              No outgoing webhooks configured. Click Add to create one.
            </div>
          ) : (
            <div className="space-y-sm">
              {outgoingWebhooks.map((webhook) => (
                <div
                  key={webhook.uuid}
                  className="rounded-lg border border-border/70 bg-background p-sm flex items-start justify-between gap-sm"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {TRIGGER_LABELS[webhook.trigger] ?? webhook.trigger}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {webhook.method} · {webhook.url}
                    </p>
                  </div>
                  <div className="flex gap-xs shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditWebhook(webhook)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteWebhook(webhook.uuid)}
                      disabled={updateWebhooks.isPending}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!missingBotId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleAddWebhook}
              disabled={allTriggersUsed || updateWebhooks.isPending}
              className="gap-xs"
            >
              <Plus className="h-4 w-4" />
              Add Webhook
            </Button>
          )}
        </div>
      </SettingsRow>

      {showWebhookDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
            </h2>

            <div className="space-y-md">
              <div className="space-y-xs">
                <Label htmlFor="trigger">Trigger</Label>
                <Select
                  value={webhookForm.trigger}
                  onValueChange={(value) =>
                    setWebhookForm({
                      ...webhookForm,
                      trigger: value as BotWebhookOptionTriggerEnum,
                    })
                  }
                >
                  <SelectTrigger id="trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TRIGGERS.map((t) => (
                      <SelectItem
                        key={t}
                        value={t}
                        disabled={usedTriggers.has(t)}
                      >
                        {TRIGGER_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-xs">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  placeholder="https://example.com/webhook"
                  value={webhookForm.url}
                  onChange={(e) =>
                    setWebhookForm({ ...webhookForm, url: e.target.value })
                  }
                />
              </div>

              <div className="space-y-xs">
                <Label htmlFor="method">Method</Label>
                <Select
                  value={webhookForm.method}
                  onValueChange={(value) =>
                    setWebhookForm({
                      ...webhookForm,
                      method: value as BotWebhookOptionMethodEnum,
                    })
                  }
                >
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BotWebhookOptionMethodEnum.POST}>
                      POST
                    </SelectItem>
                    <SelectItem value={BotWebhookOptionMethodEnum.GET}>
                      GET
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-xs">
                <div className="flex items-center justify-between">
                  <Label htmlFor="payload">Payload Template</Label>
                  <span className="text-xs text-muted-foreground">
                    {webhookForm.payload.length}/500
                  </span>
                </div>
                <textarea
                  id="payload"
                  className="h-40 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 font-mono text-xs resize-none"
                  value={webhookForm.payload}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setWebhookForm({
                        ...webhookForm,
                        payload: e.target.value,
                      });
                    }
                  }}
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Available variables:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {webhookVariables.always.map((v) => (
                      <code key={v} className="text-xs bg-muted p-1 rounded">
                        {v}
                      </code>
                    ))}
                  </div>
                  {[
                    BotWebhookOptionTriggerEnum.startDeal,
                    BotWebhookOptionTriggerEnum.closeDeal,
                  ].includes(webhookForm.trigger) && (
                    <div className="grid grid-cols-2 gap-1">
                      {webhookVariables.dealTriggers.map((v) => (
                        <code key={v} className="text-xs bg-muted p-1 rounded">
                          {v}
                        </code>
                      ))}
                    </div>
                  )}
                  {webhookForm.trigger ===
                    BotWebhookOptionTriggerEnum.closeDeal && (
                    <div className="grid grid-cols-2 gap-1">
                      {webhookVariables.closeDealOnly.map((v) => (
                        <code key={v} className="text-xs bg-muted p-1 rounded">
                          {v}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-xs justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowWebhookDialog(false);
                  setEditingWebhook(null);
                  resetWebhookForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveWebhook}
                disabled={!webhookForm.url.trim() || updateWebhooks.isPending}
              >
                {editingWebhook ? 'Update' : 'Add'} Webhook
              </Button>
            </div>
          </div>
        </div>
      )}
      </TabsContent>
    </Tabs>
  );
};

export default BotWebhookSettings;
