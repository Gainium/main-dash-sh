import { useVisualSettingsStore } from '@/stores/visualSettingsStore';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

/**
 * Hook to apply visual settings to the document
 * This handles font size, spacing, and visual effects globally
 */
export const useApplyVisualSettings = () => {
  const { fontSize, spacing, visualEffects } = useVisualSettingsStore(
    useShallow((s) => ({
      fontSize: s.fontSize,
      spacing: s.spacing,
      visualEffects: s.visualEffects,
    }))
  );

  useEffect(() => {
    // Apply base font size as CSS custom property.
    //
    // Emitted in `rem`, NOT `px`: `fontSize` is authored as "px at the browser
    // default" (16px), so dividing by 16 preserves the exact same rendering
    // for anyone on that default while letting type scale with the browser's
    // font-size setting — which is what every layout dimension in the app
    // already does. Writing px here would pin type while boxes kept scaling,
    // the mismatch that made containers overflow their own text. See the
    // --base-font-size comment in index.css.
    document.documentElement.style.setProperty(
      '--base-font-size',
      `${fontSize / 16}rem`
    );
  }, [fontSize]);

  useEffect(() => {
    // Apply spacing mode as CSS custom property and data attribute
    const spacingClass =
      spacing === 'comfortable' ? 'spacing-comfortable' : 'spacing-compact';
    document.documentElement.setAttribute('data-spacing', spacing);
    document.documentElement.style.setProperty('--spacing-mode', spacing);

    // Remove existing spacing classes
    document.documentElement.classList.remove(
      'spacing-comfortable',
      'spacing-compact'
    );
    // Add current spacing class
    document.documentElement.classList.add(spacingClass);
  }, [spacing]);

  useEffect(() => {
    // Apply visual effects setting
    document.documentElement.setAttribute(
      'data-visual-effects',
      visualEffects.toString()
    );
    document.documentElement.style.setProperty(
      '--visual-effects',
      visualEffects ? '1' : '0'
    );

    if (visualEffects) {
      document.documentElement.classList.add('visual-effects-enabled');
      document.documentElement.classList.remove('visual-effects-disabled');
    } else {
      document.documentElement.classList.add('visual-effects-disabled');
      document.documentElement.classList.remove('visual-effects-enabled');
    }
  }, [visualEffects]);
};

/**
 * Utility hook to get visual effect classes conditionally
 */
export const useVisualEffectClasses = () => {
  const visualEffects = useVisualSettingsStore((s) => s.visualEffects);

  return {
    blur: visualEffects ? 'backdrop-blur-sm' : '',
    blurMd: visualEffects ? 'backdrop-blur-md' : '',
    blurLg: visualEffects ? 'backdrop-blur-lg' : '',
    opacity: visualEffects ? 'bg-opacity-80' : 'bg-opacity-100',
    glassmorphism: visualEffects
      ? 'backdrop-blur-sm bg-opacity-80'
      : 'bg-opacity-100',
    shadow: visualEffects ? 'shadow-lg' : 'shadow-sm',
    shadowXl: visualEffects ? 'shadow-xl' : 'shadow-md',
    transition: visualEffects
      ? 'transition-all duration-300 ease-in-out'
      : 'transition-colors duration-200',
  };
};
