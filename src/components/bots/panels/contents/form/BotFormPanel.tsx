import { memo } from 'react';

import BotFormWidget, {
  type BotFormWidgetProps,
} from '@/features/bots/widgets/BotForm/BotFormWidget';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { BotChartData } from '@/types';

export interface BotFormPanelProps extends BotFormWidgetProps {
  onFormDataChange?: (data: BotChartData) => void;
  /** Force a specific variant regardless of screen size */
  forceVariant?: 'widget' | 'panel' | 'mobile';
  /**
   * When true, disables automatic mobile variant detection.
   * Useful when the form is rendered inside a parent layout (like BotPanelLayout)
   * that handles mobile layout separately.
   */
  disableMobileAutoDetect?: boolean;
}

const MOBILE_BREAKPOINT = '(max-width: 768px)';

const BotFormPanel = ({
  onFormDataChange,
  forceVariant,
  variant: propVariant,
  disableMobileAutoDetect = false,
  hideSectionNavigation,
  ...props
}: BotFormPanelProps) => {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);

  // Determine variant: forceVariant > mobile detection (if not disabled) > propVariant > 'panel'
  const resolvedVariant =
    forceVariant ??
    (isMobile && !disableMobileAutoDetect
      ? 'mobile'
      : (propVariant ?? 'panel'));

  return (
    <BotFormWidget
      {...props}
      variant={resolvedVariant}
      hideSectionNavigation={hideSectionNavigation}
      {...(onFormDataChange ? { onFormDataChange } : {})}
    />
  );
};

BotFormPanel.displayName = 'BotFormPanel';

// Memoized so a host re-render with unchanged props does not re-render the form.
const MemoBotFormPanel = memo(BotFormPanel);
MemoBotFormPanel.displayName = 'BotFormPanel';

export default MemoBotFormPanel;
