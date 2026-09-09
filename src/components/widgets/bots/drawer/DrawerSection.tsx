import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../../../ui/card';
import { WidgetWrapper } from '../../WidgetWrapper';

export interface DrawerSectionProps {
  widgetId: string;
  widgetType: string;
  title?: string;
  icon?: LucideIcon;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  // Drawer widgets render in a vertical list (not a grid) and are not resizable.
  // These props are accepted for API compatibility but are not used by the wrapper.
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  hasOptions?: boolean;
  /**
   * Drop the section's own surface — inner `Card`, background, rounding and
   * shadow — so the wrapper contributes nothing but the full-screen control.
   *
   * For a section *inside* a tab the surface is the point. For a body that IS
   * the whole tab (deals, events, settings, stats) it is not: those already lay
   * out against the drawer background and bring their own cards, and the inner
   * `Card`'s padding costs them 32px of width — enough to drop the deals card
   * grid from two columns to one. They still need the wrapper, because it is
   * the only thing that renders "Enter fullscreen".
   *
   * A bare section also draws no `title`/`icon`/`headerActions` row: the tab
   * bar directly above already names it. `title` is still worth passing —
   * it names the widget in the full-screen view and the widget menu.
   */
  bare?: boolean;
}

/**
 * DrawerSection - Standardized wrapper for bot drawer sections
 *
 * Provides consistent styling and structure for all drawer widgets:
 * - Uses Card with position={1} for consistent inner container styling
 * - No custom padding, borders, or background colors
 * - Unified header behavior (disabled by default)
 * - Consistent collapsible behavior (disabled by default)
 */
export const DrawerSection: React.FC<DrawerSectionProps> = ({
  widgetId,
  widgetType,
  title,
  icon: Icon,
  headerActions,
  children,
  minSize: _minSize = { w: 6, h: 6 },
  maxSize: _maxSize = { w: 12, h: 12 },
  hasOptions = false,
  bare = false,
}) => {
  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: widgetType,
      title: title || 'Section',
      header: false, // Remove header section for unified drawer appearance
      hasOptions,
    },
    isEditable: false,
    isCollapsible: false, // Remove fold/unfold functionality for unified drawer appearance
    noPadding: true, // Remove widget wrapper padding for drawer widgets
    // `Widget` paints a card surface by default; a bare section must not.
    ...(bare
      ? { className: 'bg-transparent shadow-none rounded-none' }
      : {}),
  };

  // A bare section is a whole tab body, so its name is already on the tab
  // above it; drawing it again here would just duplicate the tab bar. The
  // name still reaches `metadata.title` for the full-screen view.
  const header = !bare && (title || Icon) && (
    <div className="flex items-center justify-between gap-sm mb-4 min-h-7">
      <div className="flex items-center gap-xs">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        {title && (
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        )}
      </div>
      {headerActions && (
        <div className="flex items-center gap-xs">{headerActions}</div>
      )}
    </div>
  );

  return (
    <WidgetWrapper {...wrapperProps}>
      {bare ? (
        // The wrapper overlays its full-screen control on the content at
        // `top-2 right-2` (8px inset + a 36px button). A section widget leaves
        // that corner free; a whole tab body does not — the deals table puts
        // its overflow menu there and the events tab its Refresh button, and
        // the control landed on top of both. Reserve the strip instead of
        // nudging the control sideways: a horizontal offset would clear the
        // deals table's 36px menu but not the events tab's much wider button.
        <div className="pt-11">
          {header}
          {children}
        </div>
      ) : (
        <Card position={2}>
          {header}
          {children}
        </Card>
      )}
    </WidgetWrapper>
  );
};

export default DrawerSection;
