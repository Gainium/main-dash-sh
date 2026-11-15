import { useCallback } from 'react';
import { useUIStore } from '../../../../stores/uiStore';

/**
 * Full-screen control for a `fill` DrawerSection's own toolbar. `widgetId` is
 * the id passed to that `DrawerSection`; drawer sections use the wrapper's
 * defaults (dashboard registry, no store key). `isFullscreen` is true while
 * the section is shown in the full-screen overlay, where the control should
 * not be drawn.
 */
export const useDrawerSectionFullscreen = (widgetId: string) => {
  const isFullscreen = useUIStore(
    (s) => s.fullscreenWidget.widgetId === widgetId
  );
  const setFullscreenWidget = useUIStore((s) => s.setFullscreenWidget);
  const enterFullscreen = useCallback(
    () => setFullscreenWidget(widgetId, 'dashboard', undefined),
    [setFullscreenWidget, widgetId]
  );
  return { isFullscreen, enterFullscreen };
};
