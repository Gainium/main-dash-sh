import {
  AlertTriangle,
  BarChart3,
  Cpu,
  ExternalLink,
  FlaskConical,
  Play,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import {
  createTabDescriptors,
  type TabDescriptorInput,
} from '@/features/bots/shared/tabs/createTabDescriptors';
import type { BotFormTabDescriptor } from '@/features/bots/widgets/BotForm/types';

import { TerminalBasicSettings } from '@/features/trading-terminal/form/components/TerminalBasicSettings';
import { BasicSettingsTab } from './BasicSettingsTab';
import { BotControllerSettingsTab } from './BotControllerSettingsTab';
import { DCASettingsTab } from './DCASettingsTab';
import { DealStartSettingsTab } from './DealStartSettingsTab';
import { ExperimentalFeaturesTab } from './ExperimentalFeaturesTab';
import { RiskRewardSettingsTab } from './RiskRewardSettingsTab';
import { StopLossSettingsTab } from './StopLossSettingsTab';
import { StrategySettingsTab } from './StrategySettingsTab';
import { TakeProfitSettingsTab } from './TakeProfitSettingsTab';
import { WebhookSettingsTab } from './WebhookSettingsTab';

const dcaTabConfig: TabDescriptorInput[] = [
  {
    id: 'basic',
    label: 'Basic',
    icon: Settings,
    Component: BasicSettingsTab,
    description: 'Basic bot configuration and exchange settings',
    navigation: {
      previous: { id: 'basic' },
    },
    isDca: true,
  },
  {
    id: 'basic',
    label: 'Basic',
    icon: Settings,
    Component: TerminalBasicSettings,
    description: 'Basic configuration',
    navigation: {
      previous: { id: 'basic' },
    },
    isTerminal: true,
  },
  {
    id: 'strategy',
    label: 'Strategy',
    icon: Target,
    Component: StrategySettingsTab,
    description: 'Trading strategy and direction settings',
    isDca: true,
  },
  {
    id: 'deal-start',
    label: 'Deal Start',
    icon: Play,
    Component: DealStartSettingsTab,
    description: 'Configure when and how deals should start',
    isDca: true,
  },
  {
    id: 'take-profit',
    label: 'Take Profit',
    icon: TrendingUp,
    Component: TakeProfitSettingsTab,
    description: 'Take profit settings and targets',
    tooltipText: 'Configure take profit parameters',
    tooltipUrl: '/help/multiple-take-profit-targets',
    isTerminal: true,
    isDca: true,
  },
  {
    id: 'stop-loss',
    label: 'Stop Loss',
    icon: AlertTriangle,
    Component: StopLossSettingsTab,
    description: 'Stop loss and risk management settings',
    tooltipText: 'Configure stop loss parameters',
    tooltipUrl: '/help/multiple-stop-loss-targets',
    isTerminal: true,
    isDca: true,
  },
  {
    id: 'dca',
    label: 'DCA',
    icon: TrendingDown,
    Component: DCASettingsTab,
    description: 'Dollar Cost Averaging configuration',
    tooltipText: 'Enable DCA to average down on losing positions',
    tooltipUrl: '/help/dca-mode',
    isTerminal: true,
    isDca: true,
  },
  {
    id: 'risk-reward',
    label: 'Risk/Reward',
    icon: BarChart3,
    Component: RiskRewardSettingsTab,
    description: 'Advanced risk/reward ratio settings',
    tooltipText:
      'Risk:Reward is a strategy that calculates position sizes based on your desired risk level and uses price chart indicators for stop-loss. It ensures efficient risk management by automatically adjusting position sizes and setting reward targets, helping you maintain control over trades.',
    tooltipUrl: '/help/risk-reward',
    featureFlag: 'riskRewardTab',
    isTerminal: true,
    isDca: true,
  },
  {
    id: 'bot-controller',
    label: 'Bot Controller',
    icon: Cpu,
    Component: BotControllerSettingsTab,
    description: 'Automation controls and bot behavior settings',
    tooltipUrl: '/help/bot-controller',
    featureFlag: 'botControllerTab',
    isDca: true,
  },
  {
    id: 'experimental',
    label: 'Experimental',
    icon: FlaskConical,
    Component: ExperimentalFeaturesTab,
    description: 'Experimental features and beta options',
    tooltipText: 'Enable experimental features that are in beta testing',
    tooltipUrl: '/help/adaptive-close',
    featureFlag: 'experimentalTab',
    isDca: true,
  },
  {
    id: 'webhook',
    label: 'Webhooks',
    icon: ExternalLink,
    Component: WebhookSettingsTab,
    description: 'Webhook helper and prebuilt payloads',
    isTerminal: true,
    isDca: true,
  },
];

export const dcaTabDescriptors: BotFormTabDescriptor[] =
  createTabDescriptors(dcaTabConfig);

export type { BotFormTabDescriptor } from '@/features/bots/widgets/BotForm/types';
