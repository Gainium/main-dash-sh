import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IndicatorSelector } from '@/components/indicators/IndicatorSelector';
import type { IndicatorAction, IndicatorEnum } from '@/types';
import { withFavoritePreset } from '@/utils/indicators/favoritePresetScope';
import { useFavoritePresetsStore } from '@/utils/indicators/favoritePresets';

type SelectorClosedState = { open: false };

type SelectorOpenState = {
  open: true;
  allowedActions?: IndicatorAction[];
  favorites?: IndicatorEnum[];
  onToggleFavorite?: (type: IndicatorEnum, next: boolean) => void;
  favoritesMutating?: boolean;
  isFavoriteMutating?: (type: IndicatorEnum) => boolean;
  onSelect: (type: IndicatorEnum) => void;
  title?: string;
  description?: string;
};

type SelectorState = SelectorClosedState | SelectorOpenState;

export interface OpenIndicatorSelectorOptions {
  allowedActions?: IndicatorAction[];
  favorites?: IndicatorEnum[];
  onToggleFavorite?: (type: IndicatorEnum, next: boolean) => void;
  favoritesMutating?: boolean;
  isFavoriteMutating?: (type: IndicatorEnum) => boolean;
  title?: string;
  description?: string;
  onSelect: (type: IndicatorEnum) => void;
}

export interface IndicatorSelectorController {
  openSelector: (options: OpenIndicatorSelectorOptions) => void;
  closeSelector: () => void;
  selector: React.ReactNode;
  isOpen: boolean;
}

export const useIndicatorSelector = (
  overrideIndicators?: IndicatorEnum[]
): IndicatorSelectorController => {
  const [selectorState, setSelectorState] = React.useState<SelectorState>({
    open: false,
  });

  const openSelector = React.useCallback(
    (options: OpenIndicatorSelectorOptions) => {
      const nextState: SelectorOpenState = {
        open: true,
        onSelect: (type) => {
          setSelectorState({ open: false });
          // A favorite saved with settings starts from them.
          const preset = useFavoritePresetsStore.getState().presets[type];
          withFavoritePreset(type, preset, () => options.onSelect(type));
        },
      };

      if (options.allowedActions) {
        nextState.allowedActions = options.allowedActions;
      }

      if (options.favorites) {
        nextState.favorites = options.favorites;
      }

      if (options.onToggleFavorite) {
        nextState.onToggleFavorite = options.onToggleFavorite;
      }

      if (options.favoritesMutating !== undefined) {
        nextState.favoritesMutating = options.favoritesMutating;
      }

      if (options.isFavoriteMutating) {
        nextState.isFavoriteMutating = options.isFavoriteMutating;
      }

      if (options.title !== undefined) {
        nextState.title = options.title;
      }

      if (options.description !== undefined) {
        nextState.description = options.description;
      }

      setSelectorState(nextState);
    },
    []
  );

  const closeSelector = React.useCallback(() => {
    setSelectorState({ open: false });
  }, []);

  const handleSelectorChange = React.useCallback((open: boolean) => {
    if (!open) {
      setSelectorState({ open: false });
    }
  }, []);

  const selector = selectorState.open ? (
    <Dialog open={selectorState.open} onOpenChange={handleSelectorChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl overflow-hidden rounded-xl border bg-card p-0 shadow-xl">
        <DialogHeader className="space-y-xs border-b border-border/60 bg-muted/40 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg font-semibold leading-6">
            {selectorState.title ?? 'Select an indicator'}
          </DialogTitle>
          {selectorState.description ? (
            <DialogDescription className="text-sm text-muted-foreground">
              {selectorState.description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <IndicatorSelector
          onSelect={(type) => selectorState.onSelect(type)}
          className="px-6 pb-6"
          {...(selectorState.favorites
            ? { favorites: selectorState.favorites }
            : {})}
          {...(selectorState.onToggleFavorite
            ? { onToggleFavorite: selectorState.onToggleFavorite }
            : {})}
          {...(selectorState.favoritesMutating !== undefined
            ? { favoritesMutating: selectorState.favoritesMutating }
            : {})}
          {...(selectorState.isFavoriteMutating
            ? { isFavoriteMutating: selectorState.isFavoriteMutating }
            : {})}
          {...(selectorState.allowedActions
            ? { allowedActions: selectorState.allowedActions }
            : {})}
          overrideIndicators={overrideIndicators}
        />
      </DialogContent>
    </Dialog>
  ) : null;

  return {
    openSelector,
    closeSelector,
    selector,
    isOpen: selectorState.open,
  };
};
