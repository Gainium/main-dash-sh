import { Button } from '@/components/ui/button';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import {
  BotFieldExtensionControl,
  BotFieldExtensionSlot,
  BotFormSectionHeaderFrame,
} from '@/lib/extensions/botFieldExtensions';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type React from 'react';

export interface SectionHeaderProps {
  /** Section icon (a lucide icon component). */
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tooltip?: string;
  tooltipUrl?: string;
  /** Shows the "Disabled by Risk:Reward module" alert under the label. */
  showRiskRewardAlert?: boolean;
  /** id of the controlled section body, for `aria-controls`. */
  ariaControlsId?: string;
  /** Collapse control. */
  showCollapse?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  collapseDisabled?: boolean;
  /** Enable toggle switch. */
  hasToggle?: boolean;
  toggleChecked?: boolean;
  onToggleChange?: (checked: boolean) => void;
  toggleDisabled?: boolean;
  toggleId?: string;
  /** Form section id — host extensions registered for `section:<id>` render
   *  beside the label (see botFieldExtensions). */
  sectionId?: string;
  /** Setting path the enable toggle writes — host extensions registered for
   *  it render beside the toggle and may lock it. */
  toggleField?: string;
  /** Extra classes appended to the header container. */
  className?: string;
}

/**
 * The standard bot-form section header: a tinted, top-bordered, rounded bar
 * with the section icon, label (+ optional tooltip), an optional Risk:Reward
 * alert, a collapse chevron, and an optional enable Switch. Used by the bot
 * form and the deal editor so both stay visually in lock-step.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  label,
  tooltip,
  tooltipUrl,
  showRiskRewardAlert = false,
  ariaControlsId,
  showCollapse = false,
  collapsed = false,
  onToggleCollapse,
  collapseDisabled = false,
  hasToggle = false,
  toggleChecked = false,
  onToggleChange,
  toggleDisabled = false,
  toggleId,
  sectionId,
  toggleField,
  className,
}) => {
  const toggle = (
    <Switch
      checked={toggleChecked}
      onCheckedChange={(checked: boolean) => onToggleChange?.(checked)}
      disabled={toggleDisabled}
      {...(toggleId ? { id: toggleId } : {})}
    />
  );
  const frameClassName = cn(
    'mb-2 border-t-2 border-primary/60 pt-2 pb-2 bg-primary/10 rounded-lg px-2',
    className
  );
  const body = (
      <div className="flex items-start justify-between gap-md">
        <div className="flex-1">
          <div className="flex items-start gap-sm">
            <Icon className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-xs">
                <h2 className="text-lg font-semibold leading-tight">{label}</h2>
                {tooltip && (
                  <Tooltip
                    tooltip={tooltip}
                    {...(tooltipUrl ? { tooltipURL: tooltipUrl } : {})}
                  >
                    <InfoIcon />
                  </Tooltip>
                )}
                {sectionId && (
                  <BotFieldExtensionSlot
                    path={`section:${sectionId}`}
                    kind="section"
                  />
                )}
              </div>
              {showRiskRewardAlert && (
                <SettingsAlert title="Disabled by Risk:Reward module" />
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-xs self-start pt-0.5">
          {showCollapse && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-expanded={!collapsed}
              {...(ariaControlsId ? { 'aria-controls': ariaControlsId } : {})}
              onClick={onToggleCollapse}
              disabled={collapseDisabled}
              className={cn('p-0', collapseDisabled ? 'opacity-50' : 'opacity-100')}
              title={collapsed ? 'Expand section' : 'Collapse section'}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  collapsed ? 'rotate-0' : 'rotate-180'
                )}
              />
            </Button>
          )}
          {hasToggle && (
            <div className="flex items-center gap-xs">
              {toggleField ? (
                <BotFieldExtensionControl path={toggleField}>
                  {toggle}
                </BotFieldExtensionControl>
              ) : (
                toggle
              )}
            </div>
          )}
        </div>
      </div>
  );
  return sectionId ? (
    <BotFormSectionHeaderFrame sectionId={sectionId} className={frameClassName}>
      {body}
    </BotFormSectionHeaderFrame>
  ) : (
    <div className={frameClassName}>{body}</div>
  );
};

export default SectionHeader;
