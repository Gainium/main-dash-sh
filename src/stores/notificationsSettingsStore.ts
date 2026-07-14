import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { useVisualSettingsStore } from '@/stores/visualSettingsStore';

export type NotificationType =
  | 'dailyProfit'
  | 'botError'
  | 'botWarning'
  | 'dealStarted'
  | 'dealClosedWithPnL'
  | 'dealPartiallyClosedWithPnL'
  | 'buyOrderFilled'
  | 'sellOrderFilled'
  | 'gridCloseTrigger'
  | 'botControllerWebhooksEvents'
  | 'serverSideBacktest'
  | 'dca80Percent'
  | 'dca100Percent'
  | 'priceOutOfRange';

export interface NotificationChannels {
  telegram: boolean;
  email: boolean;
  inApp: boolean;
}

export interface SoundSetting {
  enabled: boolean;
  soundFile: string; // e.g. 'ping', 'cash-register', 'buy', 'sell'
  extension: string; // e.g. 'mp3', 'm4a'
}

export type NotificationSettings = {
  [K in NotificationType]: NotificationChannels;
};

export type SoundSettings = {
  [K in NotificationType]?: SoundSetting;
};

// Available sound options for the UI
export const AVAILABLE_SOUNDS: { label: string; file: string; extension: string }[] = [
  { label: 'Ping', file: 'ping', extension: 'mp3' },
  { label: 'Cash Register', file: 'cash-register', extension: 'mp3' },
  { label: 'Buy', file: 'buy', extension: 'm4a' },
  { label: 'Sell', file: 'sell', extension: 'm4a' },
  { label: 'Achievement', file: 'achievement', extension: 'mp3' },
  { label: 'Coins', file: 'coins', extension: 'mp3' },
  { label: 'New Notification', file: 'new-notification', extension: 'mp3' },
];

// Notification types that support sound
export const SOUND_ENABLED_TYPES: NotificationType[] = [
  'dealStarted',
  'dealClosedWithPnL',
  'buyOrderFilled',
  'sellOrderFilled',
];

interface NotificationsSettingsState {
  settings: NotificationSettings;
  soundSettings: SoundSettings;

  // Actions
  setNotificationSetting: (
    type: NotificationType,
    channel: keyof NotificationChannels,
    enabled: boolean
  ) => void;
  getNotificationSetting: (
    type: NotificationType,
    channel: keyof NotificationChannels
  ) => boolean;
  setSoundSetting: (
    type: NotificationType,
    setting: Partial<SoundSetting>
  ) => void;
  getSoundSetting: (type: NotificationType) => SoundSetting | undefined;
  /**
   * Turn on the default per-type sounds when none are enabled yet. Called when
   * the user flips the global "Enable sounds" master on — otherwise that switch
   * has nothing to play, since every per-type sound defaults to off.
   */
  enableDefaultSoundsIfNone: () => void;
  resetToDefaults: () => void;
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  dealStarted: { enabled: false, soundFile: 'ping', extension: 'mp3' },
  dealClosedWithPnL: { enabled: false, soundFile: 'cash-register', extension: 'mp3' },
  buyOrderFilled: { enabled: false, soundFile: 'buy', extension: 'm4a' },
  sellOrderFilled: { enabled: false, soundFile: 'sell', extension: 'm4a' },
};

// Default notification settings
const DEFAULT_SETTINGS: NotificationSettings = {
  dailyProfit: { telegram: false, email: false, inApp: false },
  botError: { telegram: false, email: false, inApp: false },
  botWarning: { telegram: false, email: false, inApp: false },
  dealStarted: { telegram: false, email: false, inApp: true },
  dealClosedWithPnL: { telegram: false, email: false, inApp: true },
  dealPartiallyClosedWithPnL: { telegram: false, email: false, inApp: false },
  buyOrderFilled: { telegram: false, email: false, inApp: true },
  sellOrderFilled: { telegram: false, email: false, inApp: true },
  gridCloseTrigger: { telegram: false, email: false, inApp: false },
  botControllerWebhooksEvents: { telegram: false, email: false, inApp: false },
  serverSideBacktest: { telegram: false, email: false, inApp: false },
  dca80Percent: { telegram: false, email: false, inApp: false },
  dca100Percent: { telegram: false, email: false, inApp: false },
  priceOutOfRange: { telegram: false, email: false, inApp: false },
};

export const useNotificationsSettingsStore =
  create<NotificationsSettingsState>()(
    devtools(
      persist(
        (set, get) => ({
          settings: DEFAULT_SETTINGS,
          soundSettings: DEFAULT_SOUND_SETTINGS,

          setNotificationSetting: (type, channel, enabled) =>
            set(
              (state) => ({
                settings: {
                  ...state.settings,
                  [type]: {
                    ...state.settings[type],
                    [channel]: enabled,
                  },
                },
              }),
              false,
              'notifications-settings/setNotificationSetting'
            ),

          getNotificationSetting: (type, channel) => {
            const state = get();
            return state.settings[type]?.[channel] ?? false;
          },

          setSoundSetting: (type, setting) => {
            set(
              (state) => ({
                soundSettings: {
                  ...state.soundSettings,
                  [type]: {
                    ...state.soundSettings[type],
                    ...setting,
                  },
                },
              }),
              false,
              'notifications-settings/setSoundSetting'
            );
            // Per-type sound is configured on the Settings page, but playback is
            // also gated by the global `soundEnabled` flag (the navbar mute), which
            // defaults off. Turning on a sound here would otherwise stay silent with
            // no hint why — so un-mute globally whenever a type's sound is enabled.
            if (setting.enabled) {
              useVisualSettingsStore.getState().setSoundEnabled(true);
            }
          },

          getSoundSetting: (type) => {
            const state = get();
            return state.soundSettings[type];
          },

          enableDefaultSoundsIfNone: () =>
            set(
              (state) => {
                const anyEnabled = SOUND_ENABLED_TYPES.some(
                  (type) => state.soundSettings[type]?.enabled
                );
                // Preserve any existing per-type choices; only seed when the
                // user has never enabled a sound.
                if (anyEnabled) return {};
                const soundSettings: SoundSettings = { ...state.soundSettings };
                for (const type of SOUND_ENABLED_TYPES) {
                  const base =
                    soundSettings[type] ??
                    DEFAULT_SOUND_SETTINGS[type] ?? {
                      enabled: false,
                      soundFile: 'ping',
                      extension: 'mp3',
                    };
                  soundSettings[type] = { ...base, enabled: true };
                }
                return { soundSettings };
              },
              false,
              'notifications-settings/enableDefaultSoundsIfNone'
            ),

          resetToDefaults: () =>
            set(
              { settings: DEFAULT_SETTINGS, soundSettings: DEFAULT_SOUND_SETTINGS },
              false,
              'notifications-settings/resetToDefaults'
            ),
        }),
        {
          name: 'notifications-settings-store',
          partialize: (state) => ({
            settings: state.settings,
            soundSettings: state.soundSettings,
          }),
        }
      ),
      {
        name: 'notifications-settings-store',
      }
    )
  );

// Helper to get human-readable notification type labels
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  dailyProfit: 'Daily Profit',
  botError: 'Bot Error',
  botWarning: 'Bot Warning',
  dealStarted: 'Deal Started',
  dealClosedWithPnL: 'Deal Closed with PnL',
  dealPartiallyClosedWithPnL: 'Deal Partially Closed with PnL',
  buyOrderFilled: 'Buy Order Filled',
  sellOrderFilled: 'Sell Order Filled',
  gridCloseTrigger: 'Grid Close Trigger',
  botControllerWebhooksEvents: 'Bot Controller/webhooks Events',
  serverSideBacktest: 'Server Side Backtest',
  dca80Percent: '80% DCA',
  dca100Percent: '100% DCA (alert for deals that have DCA activated)',
  priceOutOfRange: 'Price Out of Range',
};

// Ordered list of notification types for display
export const NOTIFICATION_TYPES_ORDER: NotificationType[] = [
  'dailyProfit',
  'botError',
  'botWarning',
  'dealStarted',
  'dealClosedWithPnL',
  'dealPartiallyClosedWithPnL',
  'buyOrderFilled',
  'sellOrderFilled',
  'gridCloseTrigger',
  'botControllerWebhooksEvents',
  'serverSideBacktest',
  'dca80Percent',
  'dca100Percent',
  'priceOutOfRange',
];
