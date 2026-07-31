/* eslint-disable spacing/no-hardcoded-font-size */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PlanBadge } from '@/components/subscription/PlanBadge';
import { BalanceInput } from '@/components/ui/balance-input';
// TEMP preview
import { BOT_TYPE_ANIMATIONS } from '@/components/wizards/BotAnimations';
import NewBotWizard from '@/components/wizards/NewBotWizard';
function BotAnimationsPreview() {
  const [open, setOpen] = useState(false);
  const entries: Array<[string, string]> = [
    ['dca', 'DCA Bot'],
    ['grid', 'Grid Bot'],
    ['combo', 'Combo Bot'],
  ];
  return (
    <div
      data-testid="bot-anim-preview"
      className="border-b bg-card p-lg flex flex-col gap-md"
    >
      <h2 className="text-xl font-semibold">Bot wizard animations (preview)</h2>
      <div className="grid grid-cols-3 gap-md">
        {entries.map(([id, label]) => {
          const Anim = BOT_TYPE_ANIMATIONS[id];
          if (!Anim) return null;
          return (
            <div
              key={id}
              className="flex flex-col items-center gap-xs p-md rounded-lg bg-muted"
            >
              <Anim className="w-full aspect-[16/9]" />
              <span className="text-sm font-medium">{label}</span>
            </div>
          );
        })}
      </div>
      <button
        data-testid="open-bot-wizard"
        className="self-start px-md py-sm rounded-md bg-primary text-primary-foreground"
        onClick={() => setOpen(true)}
      >
        Open NewBotWizard
      </button>
      <NewBotWizard open={open} onOpenChange={setOpen} />
    </div>
  );
}
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BotTypeChip,
  Chip,
  ExchangeChip,
  ProfitAndPerc,
  RotationChip,
  StatusChip,
  StrategyChip,
  TimeChip,
} from '@/components/ui/chip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ConfirmationDialog,
  InputDialog,
} from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DualArcProgressGauge } from '@/components/ui/DualArcProgressGauge';
import { InfoCard } from '@/components/ui/info-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveUpdateIndicator } from '@/components/ui/LiveUpdateIndicator';
import { NotificationIndicator } from '@/components/ui/notification-indicator';
import { DealClosedNotification } from '@/components/ui/notifications/DealClosedNotification';
import { DealOpenedNotification } from '@/components/ui/notifications/DealOpenedNotification';
import { OrderFilledNotification } from '@/components/ui/notifications/OrderFilledNotification';
import { NumberInput } from '@/components/ui/number-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ProfitValue } from '@/components/ui/ProfitValue';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ResponsiveText } from '@/components/ui/ResponsiveText';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { StatsBoxes } from '@/components/ui/StatsBoxes';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { TruncatedText } from '@/components/ui/TruncatedText';
import { Widget } from '@/components/ui/widget';
import VisualSettings from '@/components/VisualSettings';
import { useVisualSettingsStore } from '@/stores/visualSettingsStore';
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { BotTypesEnum } from '@/types';
import { getBotTypeConfig } from '@/utils/botUtils';
import {
  AlertCircle,
  BarChart,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  Heart,
  Info,
  Lock,
  Mail,
  Search,
  Settings,
  ShoppingCart,
  Star,
  Terminal,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';

export default function UIShowcase() {
  const [switchValue, setSwitchValue] = useState(false);
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [radioValue, setRadioValue] = useState('option1');
  const [sliderValue, setSliderValue] = useState(50);
  const [selectValue, setSelectValue] = useState('');
  const [numberInputValue, setNumberInputValue] = useState<number | string>(42);
  const [balanceInputValue, setBalanceInputValue] = useState(0);
  const [textareaValue, setTextareaValue] = useState('');
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const visualEffects = useVisualSettingsStore((s) => s.visualEffects);
  const setVisualEffects = useVisualSettingsStore((s) => s.setVisualEffects);
  const [glassPatternFull, setGlassPatternFull] = useState(true);
  const [glassDropdownOpen, setGlassDropdownOpen] = useState(true);
  const [glassPopoverOpen, setGlassPopoverOpen] = useState(true);
  const [glassSelectOpen, setGlassSelectOpen] = useState(false);
  const [glassDialogOpen, setGlassDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* TEMP */}
      <BotAnimationsPreview />

      {/* Visual Settings Section */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-lg py-lg">
          <VisualSettings />
        </div>
      </div>

      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-lg py-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                UI Component Showcase
              </h1>
              <p className="text-muted-foreground mt-xs">
                A comprehensive display of all available UI components and their
                variants
              </p>
            </div>
            <Badge variant="pro" className="text-sm px-sm py-xs">
              Design System
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-lg py-lg space-y-xs2">
        {/* Buttons Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Buttons
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Button Variants</CardTitle>
                <CardDescription>
                  Different button styles and colors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap gap-xs">
                  <Button variant="default">Default</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                  <Button variant="gradient">Gradient</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Button Sizes</CardTitle>
                <CardDescription>Different button sizes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap items-center gap-xs">
                  <Button size="sm">Small</Button>
                  <Button size="default">Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon">
                    <Heart className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Button States</CardTitle>
                <CardDescription>Loading and disabled states</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap gap-xs">
                  <Button disabled>Disabled</Button>
                  <Button>
                    <Download className="h-4 w-4 mr-xs" />
                    With Icon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Form Elements Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Form Elements
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Inputs</CardTitle>
                <CardDescription>Text inputs and variations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                  />
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="email-disabled">Email (Disabled)</Label>
                  <Input
                    id="email-disabled"
                    type="email"
                    placeholder="Enter your email"
                    disabled
                    value="user@example.com"
                  />
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                  />
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="search">Search</Label>
                  <Input
                    id="search"
                    type="text"
                    placeholder="Search..."
                    endAdornment={<Search className="h-4 w-4" />}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selects</CardTitle>
                <CardDescription>Dropdown selections</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label>Select Option</Label>
                  <Select value={selectValue} onValueChange={setSelectValue}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="option1">Option 1</SelectItem>
                      <SelectItem value="option2">Option 2</SelectItem>
                      <SelectItem value="option3">Option 3</SelectItem>
                      <SelectItem value="option4">Option 4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-xs">
                  <Label>Select Option (Disabled)</Label>
                  <Select disabled>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="option1">Option 1</SelectItem>
                      <SelectItem value="option2">Option 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-xs">
                  <Label>Small Select</Label>
                  <Select>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Small size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small1">Small 1</SelectItem>
                      <SelectItem value="small2">Small 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Switches & Checkboxes</CardTitle>
                <CardDescription>Toggle controls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    Switch Sizes
                  </Label>
                  <div className="flex items-center gap-md">
                    <div className="flex items-center space-x-xs">
                      <Switch
                        id="switch-sm"
                        size="sm"
                        checked={switchValue}
                        onCheckedChange={setSwitchValue}
                      />
                      <Label htmlFor="switch-sm">Small</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <Switch
                        id="switch-md"
                        size="md"
                        checked={switchValue}
                        onCheckedChange={setSwitchValue}
                      />
                      <Label htmlFor="switch-md">Medium</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <Switch
                        id="switch-lg"
                        size="lg"
                        checked={switchValue}
                        onCheckedChange={setSwitchValue}
                      />
                      <Label htmlFor="switch-lg">Large</Label>
                    </div>
                  </div>
                </div>
                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    Switch States
                  </Label>
                  <div className="flex items-center gap-md">
                    <div className="flex items-center space-x-xs">
                      <Switch id="switch-enabled" checked={true} />
                      <Label htmlFor="switch-enabled">Enabled</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <Switch id="switch-disabled" disabled />
                      <Label htmlFor="switch-disabled">Disabled</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <Switch
                        id="switch-checked-disabled"
                        checked={true}
                        disabled
                      />
                      <Label htmlFor="switch-checked-disabled">
                        On & Disabled
                      </Label>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-xs">
                  <Checkbox
                    id="checkbox1"
                    checked={checkboxValue}
                    onCheckedChange={(checked) =>
                      setCheckboxValue(checked === true)
                    }
                  />
                  <Label htmlFor="checkbox1">Accept terms</Label>
                </div>
                <div className="flex items-center space-x-xs">
                  <Checkbox id="checkbox2" disabled />
                  <Label htmlFor="checkbox2">Disabled checkbox</Label>
                </div>
                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    Radio Group
                  </Label>
                  <RadioGroup
                    value={radioValue}
                    onValueChange={setRadioValue}
                    className="flex flex-col gap-xs"
                  >
                    <div className="flex items-center space-x-xs">
                      <RadioGroupItem value="option1" id="radio1" />
                      <Label htmlFor="radio1">Option 1</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <RadioGroupItem value="option2" id="radio2" />
                      <Label htmlFor="radio2">Option 2</Label>
                    </div>
                    <div className="flex items-center space-x-xs">
                      <RadioGroupItem value="option3" id="radio3" disabled />
                      <Label htmlFor="radio3">Option 3 (Disabled)</Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Number & Balance Inputs</CardTitle>
                <CardDescription>Specialized numeric inputs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label>Number Input</Label>
                  <NumberInput
                    value={numberInputValue}
                    onChange={setNumberInputValue}
                    min={0}
                    max={100}
                    step={1}
                    showControls
                    endAdornment={<span>USDT</span>}
                  />
                </div>
                <div className="space-y-xs">
                  <Label>Number Input (Disabled)</Label>
                  <NumberInput
                    value={42}
                    onChange={() => {}}
                    disabled
                    showControls
                    endAdornment={<span>USDT</span>}
                  />
                </div>
                <div className="space-y-xs">
                  <Label>Balance Input</Label>
                  <BalanceInput
                    value={balanceInputValue}
                    onChange={setBalanceInputValue}
                    availableBalance={1000}
                    currency="USDT"
                    showPercentageButtons
                  />
                </div>
                <div className="space-y-xs">
                  <Label>Balance Input (Disabled)</Label>
                  <BalanceInput
                    value={500}
                    onChange={() => {}}
                    availableBalance={1000}
                    currency="USDT"
                    disabled
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Textarea</CardTitle>
                <CardDescription>Multi-line text input</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label htmlFor="textarea">Description</Label>
                  <Textarea
                    id="textarea"
                    placeholder="Enter your description here..."
                    value={textareaValue}
                    onChange={(e) => setTextareaValue(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-xs">
                  <Label htmlFor="textarea-disabled">
                    Description (Disabled)
                  </Label>
                  <Textarea
                    id="textarea-disabled"
                    placeholder="Enter your description here..."
                    disabled
                    value="This field is disabled"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Slider Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Sliders
          </h2>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Range Slider</CardTitle>
              <CardDescription>Interactive value selection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-lg">
              <div className="space-y-xs">
                <Label>Value: {sliderValue}</Label>
                <Slider
                  value={sliderValue}
                  onChange={setSliderValue}
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Sample slider"
                />
              </div>
              <div className="space-y-xs">
                <Label>Disabled Slider</Label>
                <Slider
                  value={30}
                  onChange={() => {}}
                  min={0}
                  max={100}
                  step={1}
                  disabled
                  aria-label="Disabled slider"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Badges and Chips Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Badges &amp; Chips
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Badges</CardTitle>
                <CardDescription>Status and label indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex flex-wrap gap-xs">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                  <Badge variant="pro">Pro</Badge>
                </div>
                <div className="flex flex-wrap gap-xs">
                  <Badge variant="default">
                    <Star className="h-3 w-3 mr-1" />
                    Featured
                  </Badge>
                  <Badge variant="destructive">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error
                  </Badge>
                  <Badge variant="success">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Success
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-xs block">
                    Subscription plan — sm
                  </Label>
                  <div className="flex flex-wrap items-center gap-xs">
                    {[
                      'free',
                      'mini',
                      'edge',
                      'prime',
                      'elite',
                      'master',
                      'legend',
                      'vip1',
                      'vip2',
                      'vip3',
                      'vip4',
                    ].map((p) => (
                      <PlanBadge key={p} plan={p} size="sm" />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-xs block">
                    Subscription plan — md
                  </Label>
                  <div className="flex flex-wrap items-center gap-xs">
                    {[
                      'free',
                      'mini',
                      'edge',
                      'prime',
                      'elite',
                      'master',
                      'legend',
                      'vip1',
                      'vip2',
                      'vip3',
                      'vip4',
                    ].map((p) => (
                      <PlanBadge key={p} plan={p} size="md" />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-xs block">
                    Subscription plan — lg (used on plan cards)
                  </Label>
                  <div className="flex flex-wrap items-center gap-xs">
                    {[
                      'free',
                      'mini',
                      'edge',
                      'prime',
                      'elite',
                      'master',
                      'legend',
                      'vip1',
                      'vip2',
                      'vip3',
                      'vip4',
                    ].map((p) => (
                      <PlanBadge key={p} plan={p} size="lg" />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Basic Chips</CardTitle>
                <CardDescription>Styled chip components</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Basic Variants
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <Chip variant="default" size="md">
                        Default
                      </Chip>
                      <Chip variant="primary" size="md">
                        Primary
                      </Chip>
                      <Chip variant="secondary" size="md">
                        Secondary
                      </Chip>
                      <Chip variant="success" size="md">
                        Success
                      </Chip>
                      <Chip variant="warning" size="md">
                        Warning
                      </Chip>
                      <Chip variant="error" size="md">
                        Error
                      </Chip>
                      <Chip variant="info" size="md">
                        Info
                      </Chip>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Chip Styles
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <Chip variant="primary" chipStyle="solid" size="md">
                        Solid
                      </Chip>
                      <Chip variant="primary" chipStyle="outline" size="md">
                        Outline
                      </Chip>
                      <Chip variant="primary" chipStyle="soft" size="md">
                        Soft
                      </Chip>
                      <Chip variant="primary" chipStyle="ghost" size="md">
                        Ghost
                      </Chip>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Key rotation
                    </Label>
                    <p className="text-xs text-muted-foreground mb-xs">
                      Shown on an exchange connection whose API key still needs
                      replacing. Compact variant is for dense rows.
                    </p>
                    <div className="flex flex-wrap items-center gap-xs">
                      <RotationChip rotationRequired provider="bybit" />
                      <RotationChip rotationRequired provider="hyperliquid" />
                      <RotationChip rotationRequired provider="bybit" compact />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Bot Type Icons Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Bot Type Icons
          </h2>
          <p className="text-sm text-muted-foreground mb-lg">
            Custom marks for each strategy. Each icon visually encodes the bot's
            mechanic: DCA's averaged-down entries and recovery, the grid's
            staggered orders, Combo's hybrid (DCA over grid), Terminal's
            candlestick chart, the two-legged hedge variants, and Signal's
            incoming webhook waves.
          </p>
          <Card>
            <CardHeader>
              <CardTitle>Strategy marks</CardTitle>
              <CardDescription>
                Lucide-style stroke icons, scaled across the chip sizes used in
                the app
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-md">
                {(
                  [
                    { type: BotTypesEnum.dca, key: 'dca' },
                    { type: BotTypesEnum.grid, key: 'grid' },
                    { type: BotTypesEnum.combo, key: 'combo' },
                    { type: BotTypesEnum.terminal, key: 'terminal' },
                    { type: BotTypesEnum.hedgeDca, key: 'hedgeDca' },
                    { type: BotTypesEnum.hedgeCombo, key: 'hedgeCombo' },
                    { type: 'signal' as const, key: 'signal' },
                  ] as const
                ).map(({ type, key }) => {
                  const config = getBotTypeConfig(type);
                  const Icon = config.icon;
                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center justify-between gap-sm rounded-lg p-md bg-surface-1"
                    >
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${config.color}1A` }}
                      >
                        <Icon
                          size={40}
                          style={{ color: config.color }}
                          strokeWidth={1.75}
                        />
                      </div>
                      <div className="flex items-center gap-sm">
                        <Icon
                          size={20}
                          style={{ color: config.color }}
                          strokeWidth={2}
                        />
                        <Icon
                          size={14}
                          style={{ color: config.color }}
                          strokeWidth={2}
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-foreground">
                          {config.label}
                        </div>
                        {key === 'signal' && (
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Upcoming
                          </div>
                        )}
                      </div>
                      {type !== 'signal' && (
                        <BotTypeChip
                          botType={type as BotTypesEnum}
                          size="sm"
                          chipStyle="soft"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Custom Chips Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Custom Chips &amp; Icons
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Bot Type Chips</CardTitle>
                <CardDescription>Different bot type indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Bot Types
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <BotTypeChip botType={BotTypesEnum.dca} size="sm" />
                      <BotTypeChip botType={BotTypesEnum.grid} size="sm" />
                      <BotTypeChip botType={BotTypesEnum.combo} size="sm" />
                      <BotTypeChip
                        botType={BotTypesEnum.hedgeCombo}
                        size="sm"
                      />
                      <BotTypeChip botType={BotTypesEnum.hedgeDca} size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Different Styles
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <BotTypeChip
                        botType={BotTypesEnum.dca}
                        chipStyle="solid"
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.grid}
                        chipStyle="outline"
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.combo}
                        chipStyle="soft"
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.hedgeCombo}
                        chipStyle="ghost"
                        size="sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Icon Only
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <BotTypeChip
                        botType={BotTypesEnum.dca}
                        iconOnly
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.grid}
                        iconOnly
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.combo}
                        iconOnly
                        size="sm"
                      />
                      <BotTypeChip
                        botType={BotTypesEnum.hedgeCombo}
                        iconOnly
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Exchange Chips</CardTitle>
                <CardDescription>Exchange provider indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Popular Exchanges
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <ExchangeChip exchangeId="binance" size="sm" />
                      <ExchangeChip exchangeId="bybit" size="sm" />
                      <ExchangeChip exchangeId="okx" size="sm" />
                      <ExchangeChip exchangeId="kucoin" size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Different Styles
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <ExchangeChip
                        exchangeId="binance"
                        chipStyle="solid"
                        size="sm"
                      />
                      <ExchangeChip
                        exchangeId="bybit"
                        chipStyle="outline"
                        size="sm"
                      />
                      <ExchangeChip
                        exchangeId="okx"
                        chipStyle="soft"
                        size="sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Stacked Layout
                    </Label>
                    <div className="space-y-xs">
                      <ExchangeChip
                        exchangeId="binance"
                        layout="stacked"
                        size="md"
                      />
                      <ExchangeChip
                        exchangeId="bybit"
                        layout="stacked"
                        size="md"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status & Strategy Chips</CardTitle>
                <CardDescription>
                  Status indicators and strategy types
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Status Chips - All States
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <StatusChip status="open" size="sm" />
                      <StatusChip status="active" size="sm" />
                      <StatusChip status="closed" size="sm" />
                      <StatusChip status="paused" size="sm" />
                      <StatusChip status="stopped" size="sm" />
                      <StatusChip status="error" size="sm" />
                      <StatusChip status="archive" size="sm" />
                      <StatusChip status="monitoring" size="sm" />
                      <StatusChip status="range" size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Status Chip Styles
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <StatusChip status="open" chipStyle="solid" size="sm" />
                      <StatusChip status="open" chipStyle="soft" size="sm" />
                      <StatusChip status="open" chipStyle="outline" size="sm" />
                      <StatusChip status="open" chipStyle="ghost" size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Status Chip Sizes
                    </Label>
                    <div className="flex flex-wrap gap-xs items-center">
                      <StatusChip status="open" size="xs" />
                      <StatusChip status="open" size="sm" />
                      <StatusChip status="open" size="md" />
                      <StatusChip status="open" size="lg" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Dot Only Mode
                    </Label>
                    <div className="flex flex-wrap gap-xs items-center">
                      <StatusChip status="open" dotOnly size="sm" />
                      <StatusChip status="error" dotOnly size="sm" />
                      <StatusChip status="closed" dotOnly size="sm" />
                      <StatusChip status="paused" dotOnly size="md" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Strategy Chips - All Strategies
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <StrategyChip strategy="long" size="sm" />
                      <StrategyChip strategy="short" size="sm" />
                      <StrategyChip strategy="neutral" size="sm" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Strategy Chip Styles
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <StrategyChip
                        strategy="long"
                        chipStyle="solid"
                        size="sm"
                      />
                      <StrategyChip
                        strategy="long"
                        chipStyle="soft"
                        size="sm"
                      />
                      <StrategyChip
                        strategy="long"
                        chipStyle="outline"
                        size="sm"
                      />
                      <StrategyChip
                        strategy="long"
                        chipStyle="ghost"
                        size="sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Time Chips - Sizes
                    </Label>
                    <div className="flex flex-wrap gap-xs items-center">
                      <TimeChip time="1h" size="xs" />
                      <TimeChip time="4h" size="sm" />
                      <TimeChip time="1d" size="md" />
                      <TimeChip time="1w" size="lg" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Coin Icons & Pairs Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Coin Icons &amp; Pairs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Coin Icons</CardTitle>
                <CardDescription>
                  Individual cryptocurrency icons
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Different Sizes
                    </Label>
                    <div className="flex flex-wrap items-center gap-sm">
                      <CoinIcon symbol="BTC" size="sm" />
                      <CoinIcon symbol="ETH" size="md" />
                      <CoinIcon symbol="BNB" size="lg" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Popular Coins
                    </Label>
                    <div className="flex flex-wrap gap-xs">
                      <CoinIcon symbol="BTC" size="md" />
                      <CoinIcon symbol="ETH" size="md" />
                      <CoinIcon symbol="BNB" size="md" />
                      <CoinIcon symbol="SOL" size="md" />
                      <CoinIcon symbol="ADA" size="md" />
                      <CoinIcon symbol="USDT" size="md" />
                      <CoinIcon symbol="USDC" size="md" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coin Pairs</CardTitle>
                <CardDescription>Trading pair representations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Horizontal Layout
                    </Label>
                    <div className="space-y-xs">
                      <CoinPair pair="BTC/USDT" iconSize="sm" />
                      <CoinPair pair="ETH/USDT" iconSize="md" />
                      <CoinPair pair="BNB/USDT" iconSize="lg" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Vertical Layout
                    </Label>
                    <div className="flex gap-md">
                      <CoinPair
                        pair="BTC/USDT"
                        layout="vertical"
                        iconSize="sm"
                      />
                      <CoinPair
                        pair="ETH/USDT"
                        layout="vertical"
                        iconSize="md"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-xs block">
                      Without Text
                    </Label>
                    <div className="flex gap-sm">
                      <CoinPair
                        pair="BTC/USDT"
                        showText={false}
                        iconSize="md"
                      />
                      <CoinPair
                        pair="ETH/USDT"
                        showText={false}
                        iconSize="md"
                      />
                      <CoinPair
                        pair="SOL/USDT"
                        showText={false}
                        iconSize="md"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Progress Components */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Progress Indicators
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Progress Bars</CardTitle>
                <CardDescription>Linear progress indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label>75% Complete</Label>
                  <ProgressBar value={75} />
                </div>
                <div className="space-y-xs">
                  <Label>Success State</Label>
                  <ProgressBar value={100} />
                </div>
                <div className="space-y-xs">
                  <Label>Warning State</Label>
                  <ProgressBar value={45} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dual Arc Gauge</CardTitle>
                <CardDescription>
                  Circular progress with dual values
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-lg">
                <div className="flex justify-center">
                  <DualArcProgressGauge
                    outerPercentage={65}
                    innerPercentage={35}
                    label="Performance"
                    size={120}
                  />
                </div>
                <div className="flex justify-center">
                  <DualArcProgressGauge
                    outerPercentage={85}
                    innerPercentage={60}
                    label="Efficiency"
                    size={100}
                  />
                </div>
                <div className="flex justify-center">
                  <DualArcProgressGauge
                    outerPercentage={45}
                    innerPercentage={25}
                    label="Usage"
                    size={80}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profit Values</CardTitle>
                <CardDescription>Styled profit/loss indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    Basic ProfitValue
                  </Label>
                  <div className="space-y-xs">
                    <ProfitValue
                      value={1250.75}
                      showSign={true}
                      className="text-lg font-semibold"
                    />
                    <ProfitValue
                      value={-450.25}
                      showSign={true}
                      className="text-lg font-semibold"
                    />
                    <ProfitValue
                      value={0}
                      showSign={true}
                      className="text-lg font-semibold"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    ProfitAndPerc - Position Right (Default)
                  </Label>
                  <div className="space-y-xs">
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      chipPosition="right"
                      size="md"
                    />
                    <ProfitAndPerc
                      value={-450.25}
                      percentage={-8.3}
                      privacyMode={false}
                      chipPosition="right"
                      size="md"
                    />
                    <ProfitAndPerc
                      value={0}
                      percentage={0}
                      privacyMode={false}
                      chipPosition="right"
                      size="md"
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    ProfitAndPerc - Position Bottom
                  </Label>
                  <div className="flex flex-wrap gap-md">
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      chipPosition="bottom"
                      size="md"
                    />
                    <ProfitAndPerc
                      value={-450.25}
                      percentage={-8.3}
                      privacyMode={false}
                      chipPosition="bottom"
                      size="md"
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    ProfitAndPerc - Size Variations
                  </Label>
                  <div className="flex flex-wrap gap-md items-center">
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      size="xs"
                    />
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      size="sm"
                    />
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      size="md"
                    />
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      size="lg"
                    />
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      size="xl"
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    ProfitAndPerc - Privacy Mode
                  </Label>
                  <div className="space-y-xs">
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={true}
                      size="md"
                    />
                    <ProfitAndPerc
                      value={-450.25}
                      percentage={-8.3}
                      privacyMode={true}
                      chipPosition="bottom"
                      size="md"
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <Label className="text-sm font-medium mb-xs block">
                    ProfitAndPerc - Hide Percentage
                  </Label>
                  <div className="space-y-xs">
                    <ProfitAndPerc
                      value={1250.75}
                      percentage={12.5}
                      privacyMode={false}
                      hidePercentage={true}
                      size="md"
                    />
                    <ProfitAndPerc
                      value={-450.25}
                      percentage={-8.3}
                      privacyMode={false}
                      hidePercentage={true}
                      size="lg"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Cards
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Simple Card</CardTitle>
                <CardDescription>
                  Basic card with header and content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  This is a simple card component with a header and content
                  area.
                </p>
              </CardContent>
            </Card>

            <Card position={1}>
              <CardHeader>
                <CardTitle>Position 1 Card</CardTitle>
                <CardDescription>Card with position=1 styling</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  This card uses position=1 for inner container styling.
                </p>
              </CardContent>
            </Card>

            <Card position={2}>
              <CardHeader>
                <CardTitle>Position 2 Card</CardTitle>
                <CardDescription>Card with position=2 styling</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  This card uses position=2 for alternative background.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Tabs Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">Tabs</h2>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Tab Navigation</CardTitle>
              <CardDescription>Organize content with tabs</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tab1" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="tab1">Overview</TabsTrigger>
                  <TabsTrigger value="tab2">Analytics</TabsTrigger>
                  <TabsTrigger value="tab3">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="tab1" className="space-y-md">
                  <h3 className="text-lg font-semibold">Overview</h3>
                  <p className="text-muted-foreground">
                    This is the overview tab content. It provides a general
                    summary of the information.
                  </p>
                </TabsContent>
                <TabsContent value="tab2" className="space-y-md">
                  <h3 className="text-lg font-semibold">Analytics</h3>
                  <p className="text-muted-foreground">
                    Here you would find detailed analytics and metrics about
                    performance and usage.
                  </p>
                </TabsContent>
                <TabsContent value="tab3" className="space-y-md">
                  <h3 className="text-lg font-semibold">Settings</h3>
                  <p className="text-muted-foreground">
                    Configuration options and preferences would be displayed in
                    this tab.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* Tooltips Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Tooltips
          </h2>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Tooltip Examples</CardTitle>
              <CardDescription>
                Hover over elements to see tooltips
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-md">
                <Tooltip tooltip="Click to view user information">
                  <Button variant="outline">
                    <User className="h-4 w-4 mr-xs" />
                    User Info
                  </Button>
                </Tooltip>

                <Tooltip tooltip="Open application settings">
                  <Button variant="outline">
                    <Settings className="h-4 w-4 mr-xs" />
                    Settings
                  </Button>
                </Tooltip>

                <Tooltip tooltip="View your messages and notifications">
                  <Button variant="outline">
                    <Mail className="h-4 w-4 mr-xs" />
                    Messages
                  </Button>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Icons Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Icons
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Lucide Icons</CardTitle>
              <CardDescription>
                Common icons used throughout the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-8 md:grid-cols-12 lg:grid-cols-16 gap-md">
                {[
                  { icon: Heart, name: 'Heart' },
                  { icon: Star, name: 'Star' },
                  { icon: Download, name: 'Download' },
                  { icon: Search, name: 'Search' },
                  { icon: Settings, name: 'Settings' },
                  { icon: User, name: 'User' },
                  { icon: Mail, name: 'Mail' },
                  { icon: Lock, name: 'Lock' },
                  { icon: AlertCircle, name: 'Alert' },
                  { icon: CheckCircle, name: 'Check' },
                  { icon: XCircle, name: 'X Circle' },
                  { icon: Info, name: 'Info' },
                  { icon: TrendingUp, name: 'Trending Up' },
                  { icon: TrendingDown, name: 'Trending Down' },
                ].map(({ icon: Icon, name }) => (
                  <div
                    key={name}
                    className="flex flex-col items-center gap-xs p-xs"
                  >
                    <Icon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground text-center">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Separators */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Separators
          </h2>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Visual Separators</CardTitle>
              <CardDescription>Divide content sections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-md">
              <p className="text-muted-foreground">Content above separator</p>
              <Separator />
              <p className="text-muted-foreground">Content below separator</p>
              <Separator orientation="vertical" className="h-8 mx-auto" />
              <p className="text-muted-foreground">Vertical separator above</p>
            </CardContent>
          </Card>
        </section>

        {/* Dialog, Popover, DropdownMenu Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Overlays &amp; Menus
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Dialog</CardTitle>
                <CardDescription>Modal dialogs and overlays</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Open Dialog</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Example Dialog</DialogTitle>
                      <DialogDescription>
                        This is an example dialog component. You can add any
                        content here.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-md">
                      <p className="text-sm text-muted-foreground">
                        Dialog content goes here. This could be forms,
                        information, or any other UI elements.
                      </p>
                      <div className="flex gap-xs">
                        <Button variant="default">Confirm</Button>
                        <Button variant="outline">Cancel</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confirmation Dialog</CardTitle>
                <CardDescription>
                  Pre-built confirmation dialogs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  Open Confirmation
                </Button>
                <ConfirmationDialog
                  open={showConfirmDialog}
                  onOpenChange={setShowConfirmDialog}
                  title="Delete Item"
                  description="Are you sure you want to delete this item? This action cannot be undone."
                  variant="destructive"
                  confirmText="Delete"
                  onConfirm={() => {
                    console.log('Confirmed!');
                  }}
                />

                <Button
                  variant="outline"
                  onClick={() => setShowInputDialog(true)}
                >
                  Open Input Dialog
                </Button>
                <InputDialog
                  open={showInputDialog}
                  onOpenChange={setShowInputDialog}
                  title="Enter Name"
                  description="Please provide a name for the new item."
                  placeholder="Item name"
                  onConfirm={(value) => {
                    console.log('Entered:', value);
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Popover</CardTitle>
                <CardDescription>Floating content panels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">Open Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-sm">
                      <h4 className="font-medium">Popover Content</h4>
                      <p className="text-sm text-muted-foreground">
                        This is popover content. Great for additional
                        information, quick actions, or contextual menus.
                      </p>
                      <div className="flex gap-xs">
                        <Button size="sm">Action</Button>
                        <Button size="sm" variant="outline">
                          Secondary
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dropdown Menu</CardTitle>
                <CardDescription>Contextual action menus</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Options
                      <ChevronDown className="h-4 w-4 ml-xs" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <User className="mr-xs h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="mr-xs h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Mail className="mr-xs h-4 w-4" />
                      Messages
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <Lock className="mr-xs h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Color Palette Section */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Complete Color Palette
          </h2>

          {/* Live preview swatches use the actual --surface-* tokens. */}
          <style>{`
            .surf-preview {
              --preview-base: var(--surface-base);
              --preview-1: var(--surface-1);
              --preview-2: var(--surface-2);
              --preview-muted: var(--surface-muted);
              --preview-shadow: 0 6px 20px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
            }
            [data-theme='dark'] .surf-preview {
              --preview-shadow: 0 6px 20px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.3);
            }
          `}</style>

          <div className="space-y-xl">
            {/* ───────── Surfaces (the elevation ladder) ───────── */}
            <Card>
              <CardHeader>
                <CardTitle>Surfaces</CardTitle>
                <CardDescription>
                  The 4-level elevation ladder. Higher = lighter (especially in
                  dark mode). Max 3 levels in any subtree, + 1 floating overlay.
                  See <code>DESIGN_SYSTEM.md</code> for the full rule.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-lg">
                {/* Side-by-side old vs proposed swatches */}
                <div className="surf-preview grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
                  {/* surface-base */}
                  <div className="space-y-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="h-20 w-full bg-background rounded-md" />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Current
                        </p>
                      </div>
                      <div>
                        <div
                          className="h-20 w-full rounded-md"
                          style={{ background: 'var(--preview-base)' }}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Proposed
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Level 0 · <code>--surface-base</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page canvas. Alias: <code>bg-background</code>
                      </p>
                    </div>
                  </div>

                  {/* surface-1 */}
                  <div className="space-y-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="h-20 w-full bg-card rounded-md" />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Current
                        </p>
                      </div>
                      <div>
                        <div
                          className="h-20 w-full rounded-md"
                          style={{ background: 'var(--preview-1)' }}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Proposed
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Level 1 · <code>--surface-1</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cards, panels, widgets. Alias: <code>bg-card</code>
                      </p>
                    </div>
                  </div>

                  {/* surface-2 */}
                  <div className="space-y-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="h-20 w-full bg-popover rounded-md" />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Current
                        </p>
                      </div>
                      <div>
                        <div
                          className="h-20 w-full rounded-md"
                          style={{
                            background: 'var(--preview-2)',
                            boxShadow: 'var(--preview-shadow)',
                          }}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Proposed
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Level 2 · <code>--surface-2</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Popovers, modals, dropdowns. Alias:{' '}
                        <code>bg-popover</code>
                      </p>
                    </div>
                  </div>

                  {/* surface-muted */}
                  <div className="space-y-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="h-20 w-full bg-muted rounded-md" />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Current
                        </p>
                      </div>
                      <div>
                        <div
                          className="h-20 w-full rounded-md"
                          style={{ background: 'var(--preview-muted)' }}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                          Proposed
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Inner · <code>--surface-muted</code>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Chip / input / inset fill. Alias: <code>bg-muted</code>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nested-surface demo */}
                <div>
                  <h4 className="text-sm font-medium mb-sm">
                    Nested demo (proposed)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                    {/* Live (current tokens) */}
                    <div
                      className="p-md rounded-lg"
                      style={{ background: 'var(--color-background)' }}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-xs">
                        Current
                      </p>
                      <div
                        className="p-md rounded-md"
                        style={{ background: 'var(--color-card)' }}
                      >
                        <p className="text-sm font-medium mb-xs">Outer card</p>
                        <div
                          className="p-sm rounded-md"
                          style={{ background: 'var(--color-muted)' }}
                        >
                          <p className="text-xs text-muted-foreground">
                            Inner inset (bg-muted)
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Preview (proposed tokens) */}
                    <div
                      className="surf-preview p-md rounded-lg"
                      style={{ background: 'var(--preview-base)' }}
                    >
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-xs">
                        Proposed
                      </p>
                      <div
                        className="p-md rounded-md"
                        style={{
                          background: 'var(--preview-1)',
                          boxShadow: 'var(--preview-shadow)',
                        }}
                      >
                        <p className="text-sm font-medium mb-xs">Outer card</p>
                        <div
                          className="p-sm rounded-md"
                          style={{ background: 'var(--preview-muted)' }}
                        >
                          <p className="text-xs text-muted-foreground">
                            Inner inset (bg-muted)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ───────── Borders & Focus ───────── */}
            <Card>
              <CardHeader>
                <CardTitle>Borders &amp; Focus</CardTitle>
                <CardDescription>
                  <strong>Borders are a last resort, not a default.</strong>{' '}
                  Reach for surface contrast, spacing, and typography first.
                  Borders belong on: inputs, focus rings, outlined buttons,
                  tinted state pills, peer surfaces at the same elevation, and
                  table/sticky dividers. Nothing else.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-lg">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-md">
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-background border border-border rounded-md" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Default border</p>
                      <p className="text-xs text-muted-foreground">
                        border-border
                      </p>
                    </div>
                  </div>
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-input border border-border rounded-md" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Input fill</p>
                      <p className="text-xs text-muted-foreground">bg-input</p>
                    </div>
                  </div>
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-background border-2 border-ring rounded-md" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Focus ring</p>
                      <p className="text-xs text-muted-foreground">
                        ring / border-ring
                      </p>
                    </div>
                  </div>
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-success/10 border border-success/30 rounded-md" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Tinted state pill</p>
                      <p className="text-xs text-muted-foreground">
                        bg-X/10 + border-X/30
                      </p>
                    </div>
                  </div>
                </div>

                {/* Do / Don't */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="bg-success/10 p-md rounded-md">
                    <p className="text-success font-medium mb-sm">
                      ✓ Use borders for
                    </p>
                    <ul className="text-sm space-y-1 text-foreground/90">
                      <li>Form inputs, selects, comboboxes</li>
                      <li>Focus rings (never remove)</li>
                      <li>Outlined button variant</li>
                      <li>Tinted state pills (success/warning/error/info)</li>
                      <li>Peer surfaces at the same elevation</li>
                      <li>Sticky headers / table row dividers</li>
                    </ul>
                  </div>
                  <div className="bg-destructive/10 p-md rounded-md">
                    <p className="text-destructive font-medium mb-sm">
                      ✗ Don't add borders to
                    </p>
                    <ul className="text-sm space-y-1 text-foreground/90">
                      <li>Cards (use surface contrast instead)</li>
                      <li>Chips/badges with a fill</li>
                      <li>Buttons (use fill color of variant)</li>
                      <li>Sections inside a card (use spacing)</li>
                      <li>Icon-only buttons</li>
                      <li>Tooltips (surface-2 + shadow is enough)</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ───────── Text ───────── */}
            <Card>
              <CardHeader>
                <CardTitle>Text</CardTitle>
                <CardDescription>
                  Foreground and state text colors. Use these — never hardcode
                  text colors.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  <div className="space-y-xs">
                    <p className="text-foreground">
                      Primary text · <code>text-foreground</code>
                    </p>
                    <p className="text-muted-foreground">
                      Secondary text · <code>text-muted-foreground</code>
                    </p>
                    <p className="text-foreground/60">
                      Tertiary (60% alpha) · <code>text-foreground/60</code>
                    </p>
                  </div>
                  <div className="space-y-xs">
                    <p className="text-success">
                      Success · <code>text-success</code>
                    </p>
                    <p className="text-destructive">
                      Error · <code>text-destructive</code>
                    </p>
                    <p className="text-warning">
                      Warning · <code>text-warning</code>
                    </p>
                    <p className="text-info">
                      Info · <code>text-info</code>
                    </p>
                    <p className="text-profit">
                      Profit · <code>text-profit</code>
                    </p>
                    <p className="text-loss">
                      Loss · <code>text-loss</code>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Brand Colors */}
            <Card>
              <CardHeader>
                <CardTitle>Brand Colors</CardTitle>
                <CardDescription>
                  Primary brand colors and variations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-md">
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-primary rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Primary</p>
                      <p className="text-xs text-muted-foreground">
                        bg-primary
                      </p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-secondary rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Secondary</p>
                      <p className="text-xs text-muted-foreground">
                        bg-secondary
                      </p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-accent rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Accent</p>
                      <p className="text-xs text-muted-foreground">bg-accent</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full color-gradient-purple rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Brand Gradient</p>
                      <p className="text-xs text-muted-foreground">
                        color-gradient-purple
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Semantic Colors */}
            <Card>
              <CardHeader>
                <CardTitle>Semantic Colors</CardTitle>
                <CardDescription>
                  Colors with semantic meaning for states and feedback
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-md">
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-success rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Success</p>
                      <p className="text-xs text-muted-foreground">
                        bg-success
                      </p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-destructive rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Error</p>
                      <p className="text-xs text-white/70">bg-destructive</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-warning rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-black">Warning</p>
                      <p className="text-xs text-black/70">bg-warning</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-info rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Info</p>
                      <p className="text-xs text-white/70">bg-info</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Colors */}
            <Card>
              <CardHeader>
                <CardTitle>Financial Colors</CardTitle>
                <CardDescription>
                  Colors for profit/loss and financial data visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-md">
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-profit rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Profit</p>
                      <p className="text-xs text-white/70">bg-profit</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-loss rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Loss</p>
                      <p className="text-xs text-white/70">bg-loss</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-profit/10 border border-profit/20 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Profit Light</p>
                      <p className="text-xs text-muted-foreground">
                        bg-profit/10
                      </p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-loss/10 border border-loss/20 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Loss Light</p>
                      <p className="text-xs text-muted-foreground">
                        bg-loss/10
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chart Colors */}
            <Card>
              <CardHeader>
                <CardTitle>Chart Colors</CardTitle>
                <CardDescription>
                  Color palette for data visualization and charts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-md">
                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-chart-1 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-black">Chart 1</p>
                      <p className="text-xs text-black/70">bg-chart-1</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-chart-2 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-black">Chart 2</p>
                      <p className="text-xs text-black/70">bg-chart-2</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-chart-3 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Chart 3</p>
                      <p className="text-xs text-white/70">bg-chart-3</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-chart-4 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Chart 4</p>
                      <p className="text-xs text-white/70">bg-chart-4</p>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <div className="h-16 w-full bg-chart-5 rounded-lg"></div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-black">Chart 5</p>
                      <p className="text-xs text-black/70">bg-chart-5</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Color Usage Examples */}
            <Card>
              <CardHeader>
                <CardTitle>Color Usage Examples</CardTitle>
                <CardDescription>
                  Real-world examples of color usage in UI components
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-lg">
                {/* Text colors */}
                <div>
                  <h4 className="text-lg font-medium mb-sm">Text Colors</h4>
                  <div className="space-y-xs">
                    <p className="text-foreground">
                      Primary text (text-foreground)
                    </p>
                    <p className="text-muted-foreground">
                      Secondary text (text-muted-foreground)
                    </p>
                    <p className="text-success">Success text (text-success)</p>
                    <p className="text-destructive">
                      Error text (text-destructive)
                    </p>
                    <p className="text-warning">Warning text (text-warning)</p>
                    <p className="text-info">Info text (text-info)</p>
                    <p className="text-profit">Profit text (text-profit)</p>
                    <p className="text-loss">Loss text (text-loss)</p>
                  </div>
                </div>

                {/* Background combinations */}
                <div>
                  <h4 className="text-lg font-medium mb-sm">
                    Background Combinations
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                    <div className="bg-success/10 border border-success/20 p-md rounded-lg">
                      <p className="text-success font-medium">
                        Success background with border
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        bg-success/10 border-success/20
                      </p>
                    </div>

                    <div className="bg-destructive/10 border border-destructive/20 p-md rounded-lg">
                      <p className="text-destructive font-medium">
                        Error background with border
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        bg-destructive/10 border-destructive/20
                      </p>
                    </div>

                    <div className="bg-warning/10 border border-warning/20 p-md rounded-lg">
                      <p className="text-warning font-medium">
                        Warning background with border
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        bg-warning/10 border-warning/20
                      </p>
                    </div>

                    <div className="bg-info/10 border border-info/20 p-md rounded-lg">
                      <p className="text-info font-medium">
                        Info background with border
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        bg-info/10 border-info/20
                      </p>
                    </div>
                  </div>
                </div>

                {/* Gradient examples */}
                <div>
                  <h4 className="text-lg font-medium mb-sm">
                    Gradient Examples
                  </h4>
                  <div className="space-y-md">
                    <div className="color-gradient-purple p-lg rounded-lg text-center">
                      <p className="text-black font-semibold text-lg">
                        Brand Gradient Background
                      </p>
                      <p className="text-black/70 text-sm">
                        color-gradient-purple
                      </p>
                    </div>

                    <div className="p-lg rounded-lg text-center border border-border">
                      <p className="text-gradient-purple font-semibold text-2xl">
                        Brand Gradient Text
                      </p>
                      <p className="text-muted-foreground text-sm mt-xs">
                        text-gradient-purple
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Typography Examples */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Typography
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Text Styles</CardTitle>
              <CardDescription>
                Different text sizes and weights
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-md">
              <div className="space-y-xs">
                <h1 className="text-4xl font-bold text-foreground">
                  Heading 1
                </h1>
                <h2 className="text-3xl font-bold text-foreground">
                  Heading 2
                </h2>
                <h3 className="text-2xl font-semibold text-foreground">
                  Heading 3
                </h3>
                <h4 className="text-xl font-semibold text-foreground">
                  Heading 4
                </h4>
                <h5 className="text-lg font-medium text-foreground">
                  Heading 5
                </h5>
                <h6 className="text-base font-medium text-foreground">
                  Heading 6
                </h6>
              </div>
              <Separator />
              <div className="space-y-xs">
                <p className="text-base text-foreground">
                  Regular paragraph text
                </p>
                <p className="text-sm text-muted-foreground">
                  Small muted text
                </p>
                <p className="text-xs text-muted-foreground">
                  Extra small text
                </p>
                <p className="text-lg font-semibold text-foreground">
                  Large semibold text
                </p>
                <p className="text-base font-mono text-foreground">
                  Monospace text
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Alerts & Notifications */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Alerts &amp; Notifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Alerts</CardTitle>
                <CardDescription>
                  Alert messages with different variants
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Information</AlertTitle>
                  <AlertDescription>
                    This is an informational alert message.
                  </AlertDescription>
                </Alert>

                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    This is an error alert message indicating something went
                    wrong.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notification Indicators</CardTitle>
                <CardDescription>Notification badges and dots</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="flex items-center gap-md">
                  <div className="flex items-center gap-xs">
                    <Mail className="h-5 w-5" />
                    <NotificationIndicator count={5} />
                  </div>
                  <div className="flex items-center gap-xs">
                    <Settings className="h-5 w-5" />
                    <NotificationIndicator count={42} />
                  </div>
                  <div className="flex items-center gap-xs">
                    <User className="h-5 w-5" />
                    <NotificationIndicator count={150} />
                  </div>
                </div>
                <div className="flex items-center gap-md">
                  <div className="flex items-center gap-xs">
                    <Terminal className="h-5 w-5" />
                    <NotificationIndicator showDot />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deal Notifications</CardTitle>
                <CardDescription>
                  Toast-style notifications for deal events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <DealOpenedNotification
                  botName="Bitcoin Bull Strategy"
                  pair="BTC/USDT"
                  baseAsset="BTC"
                  quoteAsset="USDT"
                  exchangeUUID="binance"
                  isPaperTrading={false}
                  price={42150.25}
                  timestamp={new Date()}
                  onClose={() => {}}
                />

                <DealClosedNotification
                  botName="Ethereum Swing Trade"
                  pair="ETH/USDT"
                  baseAsset="ETH"
                  quoteAsset="USDT"
                  exchangeUUID="binance"
                  isPaperTrading={true}
                  profit={125.5}
                  profitPercentage={8.3}
                  timestamp={new Date()}
                  onClose={() => {}}
                />

                <OrderFilledNotification
                  pair="SOL/USDT"
                  baseAsset="SOL"
                  quoteAsset="USDT"
                  exchangeUUID="binance"
                  isPaperTrading={false}
                  side="BUY"
                  price={98.45}
                  amount={10.5}
                  timestamp={new Date()}
                  onClose={() => {}}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Layout & Utility Components */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Layout &amp; Utility Components
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-xl">
            <Card>
              <CardHeader>
                <CardTitle>Scroll Area</CardTitle>
                <CardDescription>
                  Scrollable container with custom scrollbar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48 w-full rounded-md border p-md">
                  <div className="space-y-xs">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div key={i} className="text-sm">
                        Scrollable item {i + 1}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Collapsible</CardTitle>
                <CardDescription>Expandable content sections</CardDescription>
              </CardHeader>
              <CardContent>
                <Collapsible
                  open={isCollapsibleOpen}
                  onOpenChange={setIsCollapsibleOpen}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                    >
                      <span>Toggle Content</span>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          isCollapsibleOpen ? 'rotate-90' : ''
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-md space-y-xs">
                    <p className="text-sm text-muted-foreground">
                      This is collapsible content. You can put any content here
                      that you want to show or hide.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      It animates smoothly when opening and closing.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Skeletons</CardTitle>
                <CardDescription>Loading state placeholders</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="flex items-center space-x-md">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-xs flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Truncated Text</CardTitle>
                <CardDescription>Text overflow with ellipsis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label>Single Line</Label>
                  <TruncatedText
                    text="This is a very long text that will be truncated with an ellipsis when it exceeds the maximum width"
                    maxWidth="200px"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-xs">
                  <Label>Two Lines</Label>
                  <TruncatedText
                    text="This is a longer text that will be truncated after two lines. It demonstrates the multi-line truncation feature which is very useful for card descriptions and list items."
                    lines={2}
                    maxWidth="250px"
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Responsive Text</CardTitle>
                <CardDescription>
                  Text that adapts to container size
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div className="space-y-xs">
                  <Label>Auto-truncating</Label>
                  <div className="border rounded p-xs w-48">
                    <ResponsiveText
                      text="This text will automatically truncate based on available space"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-xs">
                  <Label>Simple Truncation</Label>
                  <ResponsiveText
                    text="This is a longer text with simple truncation"
                    useSimpleTruncation
                    maxLength={25}
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Widget Container</CardTitle>
                <CardDescription>Base widget wrapper component</CardDescription>
              </CardHeader>
              <CardContent>
                <Widget className="p-md">
                  <h4 className="font-semibold text-foreground mb-xs">
                    Widget Content
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    This is a widget container with rounded corners and shadow.
                  </p>
                </Widget>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Specialized Components */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Specialized Components
          </h2>
          <div className="space-y-xl">
            <Card>
              <CardHeader>
                <CardTitle>Info Cards</CardTitle>
                <CardDescription>
                  Cards with icon, heading, and optional action
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <InfoCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  heading="Total Revenue"
                  subtitle="Last 30 days"
                  action={
                    <Button size="sm" variant="ghost">
                      View
                    </Button>
                  }
                >
                  <div className="text-2xl font-bold">$45,231.89</div>
                  <p className="text-xs text-success">+20.1% from last month</p>
                </InfoCard>

                <InfoCard
                  icon={<Users className="h-5 w-5" />}
                  heading="Active Users"
                  subtitle="Currently online"
                >
                  <div className="text-2xl font-bold">2,350</div>
                  <p className="text-xs text-muted-foreground">
                    +180 since yesterday
                  </p>
                </InfoCard>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stats Boxes</CardTitle>
                <CardDescription>
                  Stat cards with icons and gradients
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatsBoxes
                  boxes={[
                    {
                      title: 'Total Sales',
                      value: '$12,345',
                      subtitle: '+12% from last month',
                      icon: <DollarSign className="h-4 w-4" />,
                      colorClass: 'from-blue-500 to-blue-600',
                    },
                    {
                      title: 'Orders',
                      value: '1,234',
                      subtitle: '+5% from last week',
                      icon: <ShoppingCart className="h-4 w-4" />,
                      colorClass: 'from-green-500 to-green-600',
                    },
                    {
                      title: 'Customers',
                      value: '567',
                      subtitle: '+8% growth',
                      icon: <Users className="h-4 w-4" />,
                      colorClass: 'from-purple-500 to-purple-600',
                    },
                    {
                      title: 'Revenue',
                      value: '$89,012',
                      subtitle: '+15% from last month',
                      icon: <BarChart className="h-4 w-4" />,
                      colorClass: 'from-orange-500 to-orange-600',
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Live Update Indicator</CardTitle>
                <CardDescription>
                  Real-time connection status indicator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-md">
                <div>
                  <Label className="mb-xs block">Connected State</Label>
                  <LiveUpdateIndicator
                    isConnected={true}
                    lastUpdateTime={new Date()}
                  />
                </div>
                <div>
                  <Label className="mb-xs block">Disconnected State</Label>
                  <LiveUpdateIndicator
                    isConnected={false}
                    lastUpdateTime={null}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Glassmorphic Surfaces */}
        <section>
          <h2 className="text-2xl font-semibold mb-lg text-foreground">
            Glassmorphic Surfaces
          </h2>

          <div className="flex flex-wrap gap-xs mb-md">
            <Button
              variant={visualEffects ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVisualEffects(!visualEffects)}
            >
              Visual effects: {visualEffects ? 'ON' : 'OFF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGlassPatternFull((v) => !v)}
            >
              Pattern opacity: {glassPatternFull ? '100%' : '50%'}
            </Button>
          </div>

          <div
            className="min-h-[600px] rounded-xl overflow-hidden relative p-lg"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, oklch(var(--primary) / 1) 0 40px, oklch(var(--info) / 1) 40px 80px, oklch(var(--success) / 1) 80px 120px, oklch(var(--warning) / 1) 120px 160px, oklch(var(--destructive) / 1) 160px 200px)`,
              opacity: glassPatternFull ? 1 : 0.5,
            }}
          >

            <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
              {/* Dropdown Menu */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Dropdown Menu
                </div>
                <DropdownMenu
                  open={glassDropdownOpen}
                  onOpenChange={setGlassDropdownOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">
                      Open dropdown
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Profile</DropdownMenuItem>
                    <DropdownMenuItem>Settings</DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem>Billing</DropdownMenuItem>
                        <DropdownMenuItem>Team</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Popover */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Popover
                </div>
                <Popover
                  open={glassPopoverOpen}
                  onOpenChange={setGlassPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm">
                      Open popover
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start">
                    <p className="text-sm text-foreground mb-sm">
                      Glass popover content sitting on the patterned panel.
                    </p>
                    <Button size="sm">Action</Button>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Select */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Select
                </div>
                <Select
                  open={glassSelectOpen}
                  onOpenChange={setGlassSelectOpen}
                  value={selectValue}
                  onValueChange={setSelectValue}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Pick an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apple">Apple</SelectItem>
                    <SelectItem value="banana">Banana</SelectItem>
                    <SelectItem value="cherry">Cherry</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tooltip stage */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Tooltip (stage)
                </div>
                <div className="flex items-start gap-xs">
                  <div className="glass-surface rounded-xl shadow-2xl ring-1 ring-border/60 px-sm py-xs text-xs text-popover-foreground">
                    Tooltip body text
                  </div>
                  <Tooltip tooltip="Live tooltip — hover">
                    <Button variant="secondary" size="sm">
                      Hover me
                    </Button>
                  </Tooltip>
                </div>
              </div>

              {/* Dialog stage */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Dialog (stage)
                </div>
                <div className="flex items-start gap-xs">
                  <div className="glass-surface rounded-lg shadow-2xl ring-1 ring-border/60 p-sm w-[200px]">
                    <div className="text-sm font-semibold text-foreground mb-xs">
                      Dialog title
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Modal body sitting on the patterned background.
                    </div>
                  </div>
                  <Dialog
                    open={glassDialogOpen}
                    onOpenChange={setGlassDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Glass dialog</DialogTitle>
                        <DialogDescription>
                          Portaled to body — open to verify against the real
                          page background.
                        </DialogDescription>
                      </DialogHeader>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Drawer stage */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Detail Drawer (stage)
                </div>
                <div className="glass-surface border-l border-border shadow-2xl ring-1 ring-border/60 rounded-r-lg p-sm w-[220px] h-[120px]">
                  <div className="text-sm font-semibold text-foreground mb-xs">
                    Drawer panel
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Right-edge drawer surface.
                  </div>
                </div>
              </div>

              {/* Styled popover stage */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Styled Popover (stage)
                </div>
                <div className="glass-surface rounded-xl shadow-2xl ring-1 ring-border/60 p-1 w-[200px]">
                  <div className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/80">
                    Item one
                  </div>
                  <div className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/80">
                    Item two
                  </div>
                  <div className="-mx-1 my-1 h-px bg-muted" />
                  <div className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/80">
                    Item three
                  </div>
                </div>
              </div>

              {/* Navigation menu stage */}
              <div>
                <div className="text-xs uppercase tracking-wider text-white/90 mb-xs drop-shadow">
                  Navigation Menu (stage)
                </div>
                <div className="glass-surface text-popover-foreground rounded-md ring-1 ring-border/60 shadow-2xl p-sm w-[240px]">
                  <div className="grid grid-cols-2 gap-xs">
                    <div className="rounded-sm p-2 text-xs hover:bg-accent">
                      Docs
                    </div>
                    <div className="rounded-sm p-2 text-xs hover:bg-accent">
                      API
                    </div>
                    <div className="rounded-sm p-2 text-xs hover:bg-accent">
                      Guides
                    </div>
                    <div className="rounded-sm p-2 text-xs hover:bg-accent">
                      Blog
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-md">
            Vivid diagonal stripes so blur and surface contrast read clearly.
            Toggle visual effects to A/B opaque vs glass; toggle pattern opacity
            to see how each surface looks against bright or dim
            backdrops.
          </p>
        </section>
      </div>
    </div>
  );
}
