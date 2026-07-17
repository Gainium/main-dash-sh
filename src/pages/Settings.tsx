import { IS_CLOUD } from '@/config/mode';
import { useIsReadOnly } from '@/lib/demoMode';
import { Slot } from '@/lib/extensions';
import { useIsCompactSpacing } from '@/hooks/useSpacing';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Database,
  Download,
  Edit,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Key,
  Keyboard,
  Loader2,
  Palette,
  Play,
  Plug,
  RotateCcw,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import ShortcutsList from '../components/shortcuts/ShortcutsList';
import { Button } from '../components/ui/button';
import {
  ConfirmationDialog,
  InputDialog,
} from '../components/ui/confirmation-dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { InfoIcon, Tooltip } from '../components/ui/tooltip';
import VisualSettings from '../components/VisualSettings';
import PasskeyManager from '../components/auth/PasskeyManager';
import SessionsCard from '../components/settings/SessionsCard';
import QRCode from 'react-qr-code';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  use2FAOperations,
  useRegenerateRecoveryCodes,
} from '../hooks/use2FA';
import { useAPIKeysOperations } from '../hooks/useAPIKeys';
import { useLicenseKeyOperations } from '../hooks/useLicenseKey';
import { usePasswordOperations } from '../hooks/usePasswordChange';
import {
  useUserSettingsOperations,
  useSetAllowedLoginMethods,
  type AllowedLoginMethods,
} from '../hooks/useUserSettings';
import logger from '../lib/loggerInstance';
import { toast } from '../lib/toast';
import { useLocalUserSettingsStore } from '../stores/localUserSettingsStore';
import {
  AVAILABLE_SOUNDS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES_ORDER,
  SOUND_ENABLED_TYPES,
  useNotificationsSettingsStore,
} from '../stores/notificationsSettingsStore';
import { playNotificationSound } from '../utils/soundUtils';
import { useVisualSettingsStore } from '../stores/visualSettingsStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { useUIStore } from '../stores/uiStore';
// Note: Using logger.info for now - toast can be added later if needed

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  subsections?: {
    id: string;
    title: string;
    icon?: React.ReactNode;
  }[];
}

interface ShLicenseKeyFormProps {
  currentLicenseKey?: string;
  licenseKeyOps: ReturnType<typeof useLicenseKeyOperations>;
  isLoading: boolean;
}

/**
 * Self-hosted license key form. User pastes a key obtained from
 * gainium.io and we POST it via `setLicenseKey`. A `deleteLicenseKey`
 * button is shown when a key is already stored.
 */
const ShLicenseKeyForm: React.FC<ShLicenseKeyFormProps> = ({
  currentLicenseKey,
  licenseKeyOps,
  isLoading,
}) => {
  const [draft, setDraft] = useState('');
  const busy =
    licenseKeyOps.isSaving || licenseKeyOps.isDeleting || isLoading;

  const handleSave = () => {
    if (!draft.trim()) return;
    licenseKeyOps.setLicenseKey(draft.trim(), {
      onSuccess: () => setDraft(''),
    });
  };

  return (
    <>
      <div className="space-y-xs">
        <Label className="text-muted-foreground uppercase text-xs tracking-wider">
          {currentLicenseKey ? 'REPLACE KEY' : 'NEW KEY'}
        </Label>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste your license key"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          Generate one at{' '}
          <a
            href="https://app.gainium.io/subscription"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            app.gainium.io/subscription
          </a>
          .
        </p>
      </div>

      {licenseKeyOps.saveSuccess && (
        <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-xs">
          <Check className="w-4 h-4" />
          License key saved.
        </div>
      )}

      <div className="flex flex-wrap gap-xs pt-4">
        <Button
          className="bg-primary"
          onClick={handleSave}
          disabled={busy || !draft.trim()}
        >
          {licenseKeyOps.isSaving && (
            <Loader2 className="w-4 h-4 animate-spin mr-xs" />
          )}
          SAVE LICENSE KEY
        </Button>
        {currentLicenseKey && (
          <Button
            variant="outline"
            onClick={() => licenseKeyOps.deleteLicenseKey()}
            disabled={busy}
          >
            {licenseKeyOps.isDeleting && (
              <Loader2 className="w-4 h-4 animate-spin mr-xs" />
            )}
            DELETE LICENSE KEY
          </Button>
        )}
      </div>

      {licenseKeyOps.saveError && (
        <div className="text-sm text-red-500">
          Error saving license key: {licenseKeyOps.saveError.message}
        </div>
      )}
      {licenseKeyOps.deleteError && (
        <div className="text-sm text-red-500">
          Error deleting license key: {licenseKeyOps.deleteError.message}
        </div>
      )}
    </>
  );
};

const settingsSections: SettingsSection[] = [
  {
    id: 'personal-data',
    title: 'Personal Data',
    icon: <User className="w-4 h-4" />,
  },
  {
    id: 'login-security',
    title: 'Login & Security',
    icon: <Shield className="w-4 h-4" />,
  },
  {
    id: 'visual',
    title: 'Visual',
    icon: <Palette className="w-4 h-4" />,
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    icon: <Keyboard className="w-4 h-4" />,
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    icon: <Key className="w-4 h-4" />,
  },
  {
    id: 'license-key',
    title: 'License Key',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    id: 'notification-preferences',
    title: 'Notification Preferences',
    icon: <Bell className="w-4 h-4" />,
  },
  {
    id: 'connected-apps',
    title: 'Connected Apps',
    icon: <Plug className="w-4 h-4" />,
  },
  // Cloud-only: the Saved Data manager lives in the cloud overlay and
  // fills `settings.savedData`. Sh has no filler, so it never shows the
  // section rather than surfacing an empty tab.
  ...(IS_CLOUD
    ? [
        {
          id: 'saved-data',
          title: 'Local Data',
          icon: <Database className="w-4 h-4" />,
        },
      ]
    : []),
  {
    id: 'danger-zone',
    title: 'Danger Zone',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
];

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const isReadOnly = useIsReadOnly();
  const [activeSection, setActiveSection] = useState('personal-data');
  const location = useLocation();

  // Page-rhythm spacing — match Overview's xs↔md mode toggle so density
  // toggling feels identical across pages. See DESIGN_SYSTEM.md §7.
  // Outer page padding is owned by WidgetContainer via --panel-gap, so we
  // only use the toggle for *gaps between cards*, not for outer padding.
  const isCompact = useIsCompactSpacing();
  const pageGap = isCompact ? 'gap-xs' : 'gap-md';

  // Redirect if in demo mode
  useEffect(() => {
    if (isReadOnly) {
      navigate('/', { replace: true });
    }
  }, [isReadOnly, navigate]);

  // Sync activeSection with route if we're visiting a settings subtree
  useEffect(() => {
    // Determine the active section from the URL path: /settings/<section>
    const matched = location.pathname.match(/^\/settings\/?([^/]+)?/);
    const sectionFromUrl = matched && matched[1] ? matched[1] : null;

    if (sectionFromUrl) {
      setActiveSection(sectionFromUrl);
      return;
    }

    // If user visited /settings directly, make sure URL is explicit and default to personal-data
    if (
      location.pathname === '/settings' ||
      location.pathname === '/settings/'
    ) {
      navigate('/settings/personal-data', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Use UI store for settings sidebar section states
  const settingsSidebarSections = useUIStore((s) => s.settingsSidebarSections);
  const toggleSettingsSection = useUIStore((s) => s.toggleSettingsSection);
  const expandedSections = settingsSidebarSections;

  // Backend hooks
  const {
    user,
    isSettingsUpdateSuccess,
    resetSettingsState,
    isSettingsUpdateError,
    updateSettingsError,
    isTimezoneUpdateSuccess,
    resetTimezoneState,
    isTimezoneUpdateError,
    updateTimezoneError,
    updateUserSettings,
    updateTimezone,
    isLoading,
    isUpdatingTimezone,
    isUpdatingSettings,
  } = useUserSettingsOperations();
  const passwordOps = usePasswordOperations();
  const twoFAOps = use2FAOperations();
  const regenerateRecoveryCodes = useRegenerateRecoveryCodes();
  const apiKeysOps = useAPIKeysOperations();
  const licenseKeyOps = useLicenseKeyOperations();
  const setAllowedLoginMethods = useSetAllowedLoginMethods();

  // Regenerate-recovery-codes dialog state.
  // Pending API-key action driving the React rename/restrict/delete dialogs
  // (replaces native prompt()/confirm()).
  const [apiKeyAction, setApiKeyAction] = useState<
    | { kind: 'rename'; id: string; name: string }
    | { kind: 'restrict'; id: string; botId: string }
    | { kind: 'delete'; id: string }
    | null
  >(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenOtpToken, setRegenOtpToken] = useState('');
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);

  const openRegenDialog = () => {
    setRegenOpen(true);
    setRegenOtpToken('');
    setRegenError(null);
    setRegenCodes(null);
    regenerateRecoveryCodes.reset();
  };

  const handleRegenConfirm = async () => {
    setRegenError(null);
    if (regenOtpToken.length !== 6) {
      setRegenError('Enter the 6-digit code from your authenticator.');
      return;
    }
    try {
      const data = await regenerateRecoveryCodes.mutateAsync({
        otpToken: regenOtpToken,
      });
      setRegenCodes(data?.recoveryCodes || []);
    } catch (err) {
      setRegenError(
        err instanceof Error ? err.message : 'Failed to regenerate codes.'
      );
    }
  };

  const handleCopyRegenCodes = async () => {
    if (!regenCodes?.length) return;
    try {
      await navigator.clipboard.writeText(regenCodes.join('\n'));
      toast.success('Recovery codes copied to clipboard.');
    } catch {
      toast.error('Failed to copy.');
    }
  };

  const handleDownloadRegenCodes = () => {
    if (!regenCodes?.length) return;
    const blob = new Blob([regenCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gainium-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Global shortcut settings for hints
  const disableShortcutHints = useShortcutStore((s) => s.disableShortcutHints);
  const setDisableShortcutHints = useShortcutStore(
    (s) => s.setDisableShortcutHints
  );

  // Notifications settings store
  const notificationsSettings = useNotificationsSettingsStore(
    (state) => state.settings
  );
  const setNotificationSetting = useNotificationsSettingsStore(
    (state) => state.setNotificationSetting
  );
  const soundSettings = useNotificationsSettingsStore(
    (state) => state.soundSettings
  );
  const setSoundSetting = useNotificationsSettingsStore(
    (state) => state.setSoundSetting
  );
  // Global sound gate (also toggleable from the navbar). Surfaced here so the
  // on/off state is visible where per-type sounds are configured — otherwise an
  // enabled sound could stay silent with no hint the master switch is off.
  const soundEnabled = useVisualSettingsStore((state) => state.soundEnabled);
  const setSoundEnabled = useVisualSettingsStore(
    (state) => state.setSoundEnabled
  );
  const enableDefaultSoundsIfNone = useNotificationsSettingsStore(
    (state) => state.enableDefaultSoundsIfNone
  );

  // Local user settings store (for invoice address)
  const { settings: localSettings, setInvoiceAddress: saveInvoiceAddress } =
    useLocalUserSettingsStore();

  // Password visibility states
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form states - Initialize from API data
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invoiceAddress, setInvoiceAddress] = useState('');

  // Initialize invoice address from local settings
  useEffect(() => {
    setInvoiceAddress(localSettings.invoiceAddress || '');
  }, [localSettings.invoiceAddress]);

  // Handler to save invoice address on blur
  const handleInvoiceAddressSave = () => {
    if (invoiceAddress !== localSettings.invoiceAddress) {
      saveInvoiceAddress(invoiceAddress);
      logger.info('[SETTINGS] Invoice address saved', {
        address: invoiceAddress,
      });
    }
  };

  // Initialize form data from API
  useEffect(() => {
    if (user) {
      setNickname(user.nickname ?? '');
      setEmail(user.username ?? '');
      setTimezone(user.timezone ?? '');
      setWeekStart(user.weekStart ?? 'm');
      setFirstName(user.name ?? '');
      setLastName(user.lastName ?? '');
    }
  }, [user]);

  // Show toast notifications for personal data update success/error
  useEffect(() => {
    if (isSettingsUpdateSuccess) {
      toast.success('Personal details updated successfully');
      resetSettingsState();
    }
  }, [isSettingsUpdateSuccess, resetSettingsState]);

  useEffect(() => {
    if (isSettingsUpdateError) {
      toast.error(
        updateSettingsError?.message || 'Failed to update personal details'
      );
      resetSettingsState();
    }
  }, [isSettingsUpdateError, updateSettingsError, resetSettingsState]);

  // Show toast notifications for timezone update success/error
  useEffect(() => {
    if (isTimezoneUpdateSuccess) {
      toast.success('Timezone updated successfully');
      resetTimezoneState();
    }
  }, [isTimezoneUpdateSuccess, resetTimezoneState]);

  useEffect(() => {
    if (isTimezoneUpdateError) {
      toast.error(updateTimezoneError?.message || 'Failed to update timezone');
      resetTimezoneState();
    }
  }, [isTimezoneUpdateError, updateTimezoneError, resetTimezoneState]);

  // Password validation using the hook
  const passwordValidation = passwordOps.validatePassword(
    newPassword,
    confirmPassword
  );

  // Form submission handler - sends a single mutation with all changed fields
  const handlePersonalDataSubmit = () => {
    const normalizeValue = (val: string | null | undefined): string =>
      val ?? '';

    const currentName = normalizeValue(user?.name);
    const currentLastName = normalizeValue(user?.lastName);
    const currentNickname = normalizeValue(user?.nickname);

    const changes: Record<string, string> = {};

    if (firstName.trim() !== currentName) {
      changes['name'] = firstName.trim();
    }
    if (lastName.trim() !== currentLastName) {
      changes['lastName'] = lastName.trim();
    }
    if (nickname.trim() !== currentNickname) {
      changes['nickname'] = nickname.trim();
    }

    if (Object.keys(changes).length === 0) {
      toast.info('No changes detected');
      return;
    }

    updateUserSettings(changes);
  };

  const handleTimezoneSubmit = () => {
    if (timezone !== user?.timezone || weekStart !== user?.weekStart) {
      updateTimezone({ timezone, weekStart });
      logger.info('Timezone settings updated successfully');
    }
  };

  const handlePasswordSubmit = () => {
    if (!Object.values(passwordValidation).every(Boolean)) return;

    passwordOps.changePassword(
      { password: newPassword },
      {
        onSuccess: () => {
          setNewPassword('');
          setConfirmPassword('');
          toast.success('Password changed');
          logger.info('Password changed successfully');
        },
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : 'Failed to change password';
          toast.error(message);
        },
      }
    );
  };

  const handleToggle2FA = (enabled: boolean) => {
    if (enabled) {
      twoFAOps.generateOTP();
    } else {
      twoFAOps.disableOTP();
    }
  };

  const toggleSection = (sectionId: string) => {
    const section = settingsSections.find((s) => s.id === sectionId);
    if (section?.subsections) {
      // If section has subsections, toggle expand/collapse
      toggleSettingsSection(sectionId);
    } else {
      // Navigate to the section route; the location effect will set activeSection
      navigate(`/settings/${sectionId}`);
    }
  };

  const renderSettingsSidebar = () => (
    <div className="md:w-80 md:shrink-0 md:pr-3">
      <div className="bg-card rounded-xl md:sticky md:top-4 overflow-y-auto md:max-h-[calc(100vh-2rem)]">
        <div className="p-sm md:p-md">
          <nav className={`grid grid-cols-2 md:grid-cols-1 ${pageGap} md:gap-xs md:space-y-xs`}>
            {settingsSections.map((section) => (
              <div key={section.id}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className={`w-full flex items-center gap-md px-md py-sm rounded-lg text-left transition-all duration-200 ${
                    activeSection === section.id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <div
                    className={`p-1 rounded-md ${activeSection === section.id ? 'bg-card/20' : 'bg-muted'}`}
                  >
                    {section.icon}
                  </div>
                  <span className="font-medium text-sm md:text-base">
                    {section.title}
                  </span>
                  {section.subsections && (
                    <ChevronRight
                      className={`w-4 h-4 ml-auto transition-transform ${
                        expandedSections.has(section.id) ? 'rotate-90' : ''
                      }`}
                    />
                  )}
                </button>
                {section.subsections && (
                  <div
                    className={`ml-lg mt-xs space-y-xs overflow-hidden transition-all duration-300 ease-in-out ${
                      expandedSections.has(section.id)
                        ? 'max-h-96 opacity-100'
                        : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div
                      className={`transform transition-transform duration-300 ease-in-out ${
                        expandedSections.has(section.id)
                          ? 'translate-y-0'
                          : '-translate-y-2'
                      }`}
                    >
                      {section.subsections.map((subsection) => (
                        <button
                          key={subsection.id}
                          onClick={() => {
                            // Navigate to the subsection route; location effect picks up the section
                            navigate(`/settings/${subsection.id}`);
                          }}
                          className={`w-full flex items-center gap-sm px-sm py-xs rounded-md text-left text-sm transition-all duration-200 ${
                            activeSection === subsection.id
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                          }`}
                        >
                          {subsection.icon && (
                            <div className="p-0.5">{subsection.icon}</div>
                          )}
                          <span>{subsection.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );

  const renderPersonalData = () => (
    <div className="max-w-4xl">
      <div className={`grid ${pageGap}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-sm text-primary">
              Personal Data
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div className="space-y-md">
                <div>
                  <Label
                    htmlFor="firstName"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    FIRST NAME
                  </Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label
                    htmlFor="lastName"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    LAST NAME
                  </Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label
                    htmlFor="nickname"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    NICKNAME
                  </Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="mt-1"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                    PICTURE
                  </Label>
                  <div className="flex items-center gap-md mt-xs">
                    <div className="w-12 h-12 gradient-brand rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">
                        {firstName ? firstName.charAt(0).toUpperCase() : 'U'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-xs md:space-y-md">
                <div>
                  <Label
                    htmlFor="email"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    EMAIL
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    className="mt-1"
                    disabled
                    placeholder="Loading..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Email cannot be changed
                  </p>
                </div>

                <div>
                  <Label
                    htmlFor="timezone"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    TIME ZONE
                  </Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1"
                    disabled={isLoading}
                    placeholder="e.g., Asia/Bangkok"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="weekStart"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    WEEK START
                  </Label>
                  <Select
                    value={weekStart}
                    onValueChange={(v) => setWeekStart(v)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="weekStart" className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m">Monday</SelectItem>
                      <SelectItem value="s">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label
                    htmlFor="invoiceAddress"
                    className="text-muted-foreground uppercase text-xs tracking-wider"
                  >
                    ADDRESS (FOR INVOICING)
                  </Label>
                  <textarea
                    id="invoiceAddress"
                    value={invoiceAddress}
                    onChange={(e) => setInvoiceAddress(e.target.value)}
                    onBlur={handleInvoiceAddressSave}
                    className="mt-1 w-full px-sm py-xs border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors rounded-md text-sm min-h-20 resize-none"
                    placeholder="Enter your billing address for invoices"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This address will appear on downloaded invoices
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-xs pt-4">
              <Button
                variant="outline"
                onClick={handleTimezoneSubmit}
                disabled={isUpdatingTimezone || isLoading}
              >
                {isUpdatingTimezone && (
                  <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                )}
                Update Timezone
              </Button>
              <Button
                className="bg-primary"
                onClick={handlePersonalDataSubmit}
                disabled={isUpdatingSettings || isLoading}
              >
                {isUpdatingSettings && (
                  <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                )}
                Update Personal Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderLoginSecurity = () => {
    const is2FAEnabled = user?.otp?.otp_enabled || false;

    // Per-user allowed login methods (cloud-only). Absent field => all
    // allowed (the backend default), so coerce undefined to true.
    const allowedMethods: AllowedLoginMethods = {
      password: user?.allowedLoginMethods?.password !== false,
      google: user?.allowedLoginMethods?.google !== false,
      emailLink: user?.allowedLoginMethods?.emailLink !== false,
      passkey: user?.allowedLoginMethods?.passkey !== false,
    };
    const enabledMethodCount =
      Object.values(allowedMethods).filter(Boolean).length;
    const loginMethodMeta: {
      key: keyof AllowedLoginMethods;
      label: string;
      description: string;
    }[] = [
      {
        key: 'password',
        label: 'Password',
        description: 'Sign in with your email and password.',
      },
      {
        key: 'google',
        label: 'Google',
        description: 'Sign in with your linked Google account.',
      },
      {
        key: 'emailLink',
        label: 'Email link',
        description:
          'Sign in with a one-time link sent to your email — no password.',
      },
      {
        key: 'passkey',
        label: 'Passkey',
        description:
          'Sign in with a passkey (Face ID, fingerprint, or security key).',
      },
    ];
    const handleToggleLoginMethod = (
      key: keyof AllowedLoginMethods,
      next: boolean
    ) => {
      // Never let the user disable the last remaining method. The backend
      // also enforces this (and a stronger lockout guard), but blocking
      // here avoids a doomed round-trip.
      if (!next && enabledMethodCount <= 1) {
        toast.error('At least one login method must stay enabled.');
        return;
      }
      const desired: AllowedLoginMethods = { ...allowedMethods, [key]: next };
      setAllowedLoginMethods.mutate(desired, {
        onSuccess: () => toast.success('Login methods updated'),
        onError: (err) =>
          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to update login methods'
          ),
      });
    };

    return (
      <div className="max-w-4xl">
        <div className={`grid ${pageGap}`}>
          {/* Allowed Login Methods Card — cloud-only (enforcement lives in
              the cloud backend; self-hosted has no per-user gate yet). */}
          {IS_CLOUD && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-xs text-primary">
                  <Shield className="w-4 h-4" />
                  Allowed Login Methods
                  {setAllowedLoginMethods.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-md">
                <p className="text-sm text-muted-foreground">
                  Choose which methods can sign in to your account. Disabling a
                  method blocks it everywhere — at least one must stay enabled.
                </p>
                {loginMethodMeta.map((m) => {
                  const checked = allowedMethods[m.key];
                  const isLastEnabled = checked && enabledMethodCount <= 1;
                  return (
                    <div
                      key={m.key}
                      className="flex items-center justify-between gap-md"
                    >
                      <div className="space-y-xs">
                        <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                          {m.label}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {m.description}
                        </p>
                      </div>
                      <Switch
                        checked={checked}
                        disabled={
                          setAllowedLoginMethods.isPending || isLastEnabled
                        }
                        onCheckedChange={(next) =>
                          handleToggleLoginMethod(m.key, next)
                        }
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Change Password Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-xs text-primary">
                <Key className="w-4 h-4" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-md">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="space-y-xs md:space-y-md">
                  <div>
                    <Label
                      htmlFor="new-password"
                      className="text-muted-foreground uppercase text-xs tracking-wider"
                    >
                      NEW PASSWORD
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        id="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor="confirm-password"
                      className="text-muted-foreground uppercase text-xs tracking-wider"
                    >
                      CONFIRM PASSWORD
                    </Label>
                    <div className="relative mt-1">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-sm">
                  <div className="flex items-center gap-xs">
                    {passwordValidation.minLength ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                    <span
                      className={`text-sm ${passwordValidation.minLength ? 'text-green-500' : 'text-red-500'}`}
                    >
                      Password has at least 6 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-xs">
                    {passwordValidation.hasNumber ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                    <span
                      className={`text-sm ${passwordValidation.hasNumber ? 'text-green-500' : 'text-red-500'}`}
                    >
                      Password has a number
                    </span>
                  </div>
                  <div className="flex items-center gap-xs">
                    {passwordValidation.hasCapital ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                    <span
                      className={`text-sm ${passwordValidation.hasCapital ? 'text-green-500' : 'text-red-500'}`}
                    >
                      Password has a capital letter
                    </span>
                  </div>
                  <div className="flex items-center gap-xs">
                    {passwordValidation.passwordsMatch ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                    <span
                      className={`text-sm ${passwordValidation.passwordsMatch ? 'text-green-500' : 'text-red-500'}`}
                    >
                      Passwords match
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  className="bg-primary"
                  onClick={handlePasswordSubmit}
                  disabled={
                    passwordOps.isChangingPassword ||
                    !Object.values(passwordValidation).every(Boolean)
                  }
                >
                  {passwordOps.isChangingPassword && (
                    <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                  )}
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-xs text-primary">
                <Shield className="w-4 h-4" />
                Two-Factor Authentication (2FA)
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-md">
              <div className="flex items-center justify-between">
                <div className="space-y-xs">
                  <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                    TWO-FACTOR AUTHENTICATION (2FA)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
                <Switch
                  checked={is2FAEnabled}
                  onCheckedChange={handleToggle2FA}
                  disabled={
                    isLoading ||
                    twoFAOps.isGeneratingOTP ||
                    twoFAOps.isDisablingOTP
                  }
                />
              </div>

              {/* 2FA Setup Flow */}
              {twoFAOps.otpData && !is2FAEnabled && (
                <div className="bg-muted rounded-lg p-sm md:p-md space-y-xs md:space-y-md">
                  <h3 className="font-semibold text-foreground">
                    Setup Two-Factor Authentication
                  </h3>

                  <div className="space-y-sm">
                    <p className="text-sm text-muted-foreground">
                      1. Install an authenticator app like Google Authenticator
                      or Authy
                    </p>
                    <p className="text-sm text-muted-foreground">
                      2. Scan this QR code or enter the secret key manually:
                    </p>

                    {twoFAOps.otpData.otp_auth_url && (
                      <div className="flex justify-center">
                        {/* White backdrop + quiet zone so the code scans in
                            both light and dark themes. */}
                        <div className="bg-white p-md rounded-lg">
                          <QRCode
                            value={twoFAOps.otpData.otp_auth_url}
                            size={176}
                          />
                        </div>
                      </div>
                    )}

                    <div className="bg-background p-sm md:p-md rounded-lg">
                      <p className="text-xs font-mono break-all">
                        {twoFAOps.otpData.otp_base32}
                      </p>
                    </div>

                    <div className="space-y-xs">
                      <Label htmlFor="otp-token" className="text-sm">
                        Enter the 6-digit code from your authenticator app:
                      </Label>
                      <div className="flex gap-xs">
                        <Input
                          id="otp-token"
                          placeholder="000000"
                          maxLength={6}
                          className="w-32"
                          onChange={(e) => {
                            if (e.target.value.length === 6) {
                              twoFAOps.verifyOTP({ otpToken: e.target.value });
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          disabled={twoFAOps.isVerifyingOTP}
                        >
                          {twoFAOps.isVerifyingOTP && (
                            <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                          )}
                          Verify
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recovery Codes Display */}
              {twoFAOps.recoveryCodes && twoFAOps.recoveryCodes.length > 0 && (
                <div className="rounded-lg p-sm md:p-md space-y-xs md:space-y-md bg-warning/10 border border-warning/20">
                  <h3 className="font-semibold text-foreground flex items-center gap-xs">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Recovery Codes
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Save these recovery codes in a safe place. You can use them
                    to access your account if you lose your authenticator
                    device.
                  </p>
                  <div className="grid grid-cols-2 gap-xs">
                    {twoFAOps.recoveryCodes.map((code, index) => (
                      <div
                        key={index}
                        className="bg-background p-xs rounded font-mono text-sm"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading States */}
              {twoFAOps.isGeneratingOTP && (
                <div className="flex items-center gap-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Setting up 2FA...</span>
                </div>
              )}

              {twoFAOps.isDisablingOTP && (
                <div className="flex items-center gap-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Disabling 2FA...</span>
                </div>
              )}

              {/* Error Messages */}
              {twoFAOps.generateOTPError && (
                <div className="text-sm text-red-500">
                  Error setting up 2FA: {twoFAOps.generateOTPError.message}
                </div>
              )}

              {twoFAOps.verifyOTPError && (
                <div className="text-sm text-red-500">
                  Error verifying code: {twoFAOps.verifyOTPError.message}
                </div>
              )}

              {twoFAOps.disableOTPError && (
                <div className="text-sm text-red-500">
                  Error disabling 2FA: {twoFAOps.disableOTPError.message}
                </div>
              )}

              {/* Regenerate recovery codes (cloud-only; app-sh lacks the mutation) */}
              {IS_CLOUD && is2FAEnabled && (
                <div className="pt-sm border-t border-border">
                  <div className="flex items-center justify-between gap-md">
                    <div className="space-y-xs">
                      <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                        RECOVERY CODES
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Generate a fresh set of recovery codes. Old codes stop
                        working immediately.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={openRegenDialog}
                      disabled={regenerateRecoveryCodes.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-xs" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Passkeys Card — cloud-only (app-sh has no webauthn backend) */}
          {IS_CLOUD && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-xs text-primary">
                  <Fingerprint className="w-4 h-4" />
                  Passkeys
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-md">
                <PasskeyManager />
              </CardContent>
            </Card>
          )}

          {/* Active sessions — device/session management. In core so both
              self-hosted and cloud ship it; admin-impersonation sessions are
              filtered out server-side. */}
          <SessionsCard />
        </div>

        {/* Regenerate recovery codes dialog */}
        <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {regenCodes ? 'New recovery codes' : 'Regenerate recovery codes'}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {regenCodes ? (
                <div className="space-y-md">
                  <div className="rounded-lg p-md space-y-md bg-yellow-50 border border-yellow-200 text-yellow-900">
                    <p className="text-sm">
                      Save these codes somewhere safe. Each can be used once if
                      you lose access to your authenticator. Your previous
                      codes no longer work.
                    </p>
                    <div className="grid grid-cols-2 gap-xs">
                      {regenCodes.map((code, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-yellow-200 p-xs rounded font-mono text-sm text-yellow-900"
                        >
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-xs">
                    <Button
                      variant="outline"
                      onClick={handleCopyRegenCodes}
                      className="flex-1"
                    >
                      <Copy className="w-4 h-4 mr-xs" />
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDownloadRegenCodes}
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-xs" />
                      Download
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-md">
                  <div className="flex items-start gap-xs text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-md">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>
                      Regenerating will invalidate your existing recovery
                      codes. Save the new ones immediately after they appear.
                    </p>
                  </div>
                  <div className="space-y-xs">
                    <Label htmlFor="regen-otp">
                      Enter your current 6-digit authenticator code
                    </Label>
                    <Input
                      id="regen-otp"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      value={regenOtpToken}
                      onChange={(e) =>
                        setRegenOtpToken(
                          e.target.value.replace(/\D/g, '').slice(0, 6)
                        )
                      }
                    />
                  </div>
                  {regenError && (
                    <p className="text-sm text-red-500">{regenError}</p>
                  )}
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              {regenCodes ? (
                <Button onClick={() => setRegenOpen(false)}>Done</Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setRegenOpen(false)}
                    disabled={regenerateRecoveryCodes.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRegenConfirm}
                    disabled={
                      regenerateRecoveryCodes.isPending ||
                      regenOtpToken.length !== 6
                    }
                  >
                    {regenerateRecoveryCodes.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                    )}
                    Confirm
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderVisual = () => (
    <div className="max-w-4xl">
      <VisualSettings />
    </div>
  );

  const renderShortcuts = () => {
    return (
      <div className="max-w-4xl">
        <div className={`grid ${pageGap}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-primary">
                <span>Keyboard Shortcuts</span>
                <div className="flex items-center gap-sm text-sm text-muted-foreground">
                  <span>Disable shortcut hints</span>
                  <Switch
                    checked={disableShortcutHints}
                    onCheckedChange={setDisableShortcutHints}
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[60vh] min-h-[300px] flex flex-col">
                <ShortcutsList showSearch showResetAll />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderAPIKeys = () => {
    // OAuth "connected app" keys are managed under Connected apps, not here.
    const apiKeys = (user?.apiKeys || []).filter(
      (k) => !(k as { oauthClientId?: string | null }).oauthClientId,
    );

    const formatDate = (dateString: string) => {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ',\n' + date.toLocaleTimeString();
      } catch {
        return dateString;
      }
    };

    const maskKey = (key: string) => {
      if (key.length <= 8) return key;
      return key.substring(0, 2) + '****' + key.substring(key.length - 6);
    };

    return (
      <div className="max-w-6xl">
        <div className={`grid ${pageGap}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-xs text-primary">
                  API keys
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                </span>
                <Button
                  className="bg-primary"
                  onClick={() => apiKeysOps.createAPIKeys()}
                  disabled={apiKeysOps.isCreating || isLoading}
                >
                  {apiKeysOps.isCreating && (
                    <Loader2 className="w-4 h-4 animate-spin mr-xs" />
                  )}
                  ADD API KEYS
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* New API Key Display */}
              {apiKeysOps.newAPIKey && (
                <div className="mb-sm md:mb-lg p-sm md:p-md rounded-lg bg-success/10 border border-success/20">
                  <h3 className="font-semibold text-foreground mb-xs flex items-center gap-xs">
                    <Check className="w-4 h-4 text-success" />
                    New API Key Created
                  </h3>
                  <p className="text-sm text-muted-foreground mb-sm">
                    Save this API key now. You won't be able to see it again.
                  </p>
                  <div className="space-y-xs">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        API KEY
                      </Label>
                      <div className="font-mono text-sm bg-background p-xs rounded break-all">
                        {apiKeysOps.newAPIKey._id}
                      </div>
                    </div>
                    {apiKeysOps.newAPIKey.secret && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          SECRET
                        </Label>
                        <div className="font-mono text-sm bg-background p-xs rounded break-all">
                          {apiKeysOps.newAPIKey.secret}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-sm"
                    onClick={apiKeysOps.resetCreate}
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* API Keys Table */}
              <div className="overflow-x-auto">
                {apiKeys.length === 0 && !isLoading ? (
                  <div className="text-center py-lg text-muted-foreground">
                    <Key className="w-12 h-12 mx-auto mb-md opacity-50" />
                    <p>No API keys found</p>
                    <p className="text-sm">
                      Create your first API key to get started
                    </p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          KEY
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          NAME
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          PERMISSION
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          <span className="flex items-center gap-xs">
                            MODE
                            <Tooltip tooltip="Restrict this key to paper trading or real trading only (v2 API). Leave blank to allow both.">
                              <InfoIcon />
                            </Tooltip>
                          </span>
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          <span className="flex items-center gap-xs">
                            BOT ID
                            <Tooltip tooltip="Restrict this key to a specific bot ID (v2 API). Leave blank to allow all bots.">
                              <InfoIcon />
                            </Tooltip>
                          </span>
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          CREATED
                        </th>
                        <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          EXPIRES
                        </th>
                        <th className="text-right py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                          ACTIONS
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((apiKey) => (
                        <tr key={apiKey._id} className="border-b">
                          <td className="py-md px-md font-mono text-sm">
                            {maskKey(apiKey._id)}
                          </td>
                          <td className="py-md px-md">
                            <div className="flex items-center gap-xs">
                              <span className="text-sm">
                                {apiKey.name || 'Unnamed'}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setApiKeyAction({
                                    kind: 'rename',
                                    id: apiKey._id,
                                    name: apiKey.name || '',
                                  })
                                }
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-md px-md">
                            <Select
                              value={apiKey.permission}
                              onValueChange={(v) => {
                                apiKeysOps.changePermission({
                                  key: apiKey._id,
                                  permission: v as 'read' | 'write',
                                });
                              }}
                            >
                              <SelectTrigger size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="read">Read</SelectItem>
                                <SelectItem value="write">Write</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-md px-md">
                            <Select
                              value={
                                apiKey.paperContext === true
                                  ? 'true'
                                  : apiKey.paperContext === false
                                    ? 'false'
                                    : 'any'
                              }
                              onValueChange={(v) => {
                                apiKeysOps.changePaperContext({
                                  key: apiKey._id,
                                  paperContext:
                                    v === 'true'
                                      ? true
                                      : v === 'false'
                                        ? false
                                        : null,
                                });
                              }}
                            >
                              <SelectTrigger size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                <SelectItem value="true">Paper</SelectItem>
                                <SelectItem value="false">Real</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-md px-md">
                            <div className="flex items-center gap-xs">
                              <span className="text-sm font-mono">
                                {apiKey.botId
                                  ? apiKey.botId.slice(0, 8) + '…'
                                  : '—'}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setApiKeyAction({
                                    kind: 'restrict',
                                    id: apiKey._id,
                                    botId: apiKey.botId || '',
                                  })
                                }
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-md px-md text-sm text-muted-foreground whitespace-pre-line">
                            {formatDate(apiKey.created)}
                          </td>
                          <td className="py-md px-md text-sm text-muted-foreground whitespace-pre-line">
                            {formatDate(apiKey.expired)}
                          </td>
                          <td className="py-md px-md text-right">
                            <div className="flex items-center justify-end gap-xs">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  apiKeysOps.renewAPIKeys({ key: apiKey._id })
                                }
                                disabled={apiKeysOps.isRenewing}
                                title="Renew API key"
                              >
                                <Key className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setApiKeyAction({
                                    kind: 'delete',
                                    id: apiKey._id,
                                  })
                                }
                                disabled={apiKeysOps.isDeleting}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Loading States */}
              {(apiKeysOps.isRenewing ||
                apiKeysOps.isDeleting ||
                apiKeysOps.isChangingPermission ||
                apiKeysOps.isChangingName ||
                apiKeysOps.isChangingPaperContext ||
                apiKeysOps.isChangingBotId) && (
                <div className="flex items-center gap-xs text-muted-foreground mt-md">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {apiKeysOps.isRenewing && 'Renewing API key...'}
                    {apiKeysOps.isDeleting && 'Deleting API key...'}
                    {apiKeysOps.isChangingPermission &&
                      'Updating permission...'}
                    {apiKeysOps.isChangingName && 'Updating name...'}
                    {apiKeysOps.isChangingPaperContext &&
                      'Updating paper context...'}
                    {apiKeysOps.isChangingBotId && 'Updating bot ID...'}
                  </span>
                </div>
              )}

              {/* Error Messages */}
              {apiKeysOps.createError && (
                <div className="text-sm text-red-500 mt-md">
                  Error creating API key: {apiKeysOps.createError.message}
                </div>
              )}
              {apiKeysOps.renewError && (
                <div className="text-sm text-red-500 mt-md">
                  Error renewing API key: {apiKeysOps.renewError.message}
                </div>
              )}
              {apiKeysOps.deleteError && (
                <div className="text-sm text-red-500 mt-md">
                  Error deleting API key: {apiKeysOps.deleteError.message}
                </div>
              )}
              {apiKeysOps.changePaperContextError && (
                <div className="text-sm text-red-500 mt-md">
                  Error updating paper context:{' '}
                  {apiKeysOps.changePaperContextError.message}
                </div>
              )}
              {apiKeysOps.changeBotIdError && (
                <div className="text-sm text-red-500 mt-md">
                  Error updating bot ID: {apiKeysOps.changeBotIdError.message}
                </div>
              )}

              {/* React dialogs replacing the native prompt()/confirm() flows */}
              <InputDialog
                open={apiKeyAction?.kind === 'rename'}
                onOpenChange={(open) => {
                  if (!open) setApiKeyAction(null);
                }}
                title="Rename API key"
                description="Enter a new name for this API key."
                placeholder="API key name"
                defaultValue={
                  apiKeyAction?.kind === 'rename' ? apiKeyAction.name : ''
                }
                confirmText="Save"
                allowEmpty
                onConfirm={(value) => {
                  if (apiKeyAction?.kind === 'rename') {
                    apiKeysOps.changeName({
                      key: apiKeyAction.id,
                      name: value,
                    });
                  }
                  setApiKeyAction(null);
                }}
              />

              <InputDialog
                open={apiKeyAction?.kind === 'restrict'}
                onOpenChange={(open) => {
                  if (!open) setApiKeyAction(null);
                }}
                title="Restrict API key to a bot"
                description="Enter a bot ID to restrict this key to. Leave blank to allow all bots."
                placeholder="Bot ID"
                defaultValue={
                  apiKeyAction?.kind === 'restrict' ? apiKeyAction.botId : ''
                }
                confirmText="Save"
                allowEmpty
                onConfirm={(value) => {
                  if (apiKeyAction?.kind === 'restrict') {
                    apiKeysOps.changeBotId({
                      key: apiKeyAction.id,
                      botId: value.trim() || null,
                    });
                  }
                  setApiKeyAction(null);
                }}
              />

              <ConfirmationDialog
                open={apiKeyAction?.kind === 'delete'}
                onOpenChange={(open) => {
                  if (!open) setApiKeyAction(null);
                }}
                title="Delete API key?"
                description="Are you sure you want to delete this API key? This cannot be undone."
                confirmText="Delete"
                variant="destructive"
                onConfirm={() => {
                  if (apiKeyAction?.kind === 'delete') {
                    apiKeysOps.deleteAPIKeys({ key: apiKeyAction.id });
                  }
                  setApiKeyAction(null);
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderLicenseKey = () => {
    // Cloud schema returns `licenseKey` as a String; sh returns
    // `{ key, isPremium }`. Normalize to the key string for display.
    const lk = user?.licenseKey;
    const userKey =
      typeof lk === 'string' ? lk : typeof lk === 'object' ? lk?.key : null;
    const currentLicenseKey = userKey || licenseKeyOps.licenseKey;

    return (
      <div className="max-w-4xl">
        <div className={`grid ${pageGap}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-xs text-primary">
                License Key
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-md">
              <div>
                <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                  LICENSE KEY
                </Label>
                <div className="mt-xs">
                  {currentLicenseKey ? (
                    <div className="space-y-xs md:space-y-sm">
                      <div className="font-mono text-sm bg-muted p-sm rounded break-all">
                        {currentLicenseKey}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {IS_CLOUD
                          ? 'Use this license key to authenticate with Gainium services'
                          : 'License key stored. Activates premium features for this self-hosted install.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {isLoading
                        ? 'Loading...'
                        : IS_CLOUD
                          ? 'No license key found'
                          : 'No license key set. Generate one at app.gainium.io and paste it below.'}
                    </p>
                  )}
                </div>
              </div>

              {IS_CLOUD ? (
                renderCloudLicenseKeyActions(currentLicenseKey)
              ) : (
                <ShLicenseKeyForm
                  currentLicenseKey={currentLicenseKey}
                  licenseKeyOps={licenseKeyOps}
                  isLoading={isLoading}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderCloudLicenseKeyActions = (currentLicenseKey?: string) => (
    <>
      {/* New License Key Display */}
      {licenseKeyOps.generateSuccess && licenseKeyOps.licenseKey && (
        <div className="p-sm md:p-md rounded-lg bg-success/10 border border-success/20">
          <h3 className="font-semibold text-foreground mb-xs flex items-center gap-xs">
            <Check className="w-4 h-4 text-success" />
            New License Key Generated
          </h3>
          <p className="text-sm text-muted-foreground mb-sm">
            Your new license key has been generated successfully.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={licenseKeyOps.reset}
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex justify-start pt-4">
        <Button
          className="bg-primary"
          onClick={() => licenseKeyOps.generateLicenseKey()}
          disabled={licenseKeyOps.isGenerating || isLoading}
        >
          {licenseKeyOps.isGenerating && (
            <Loader2 className="w-4 h-4 animate-spin mr-xs" />
          )}
          {currentLicenseKey
            ? 'REGENERATE LICENSE KEY'
            : 'GENERATE LICENSE KEY'}
        </Button>
      </div>

      {/* Error Message */}
      {licenseKeyOps.generateError && (
        <div className="text-sm text-red-500">
          Error generating license key:{' '}
          {licenseKeyOps.generateError.message}
        </div>
      )}
    </>
  );

  const renderNotificationPreferences = () => (
    <div className="max-w-4xl">
      <div className={`grid ${pageGap}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-xs text-primary">
              Notification Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-md">
            <div className="flex items-center justify-between gap-md rounded-lg bg-surface-1 px-md py-sm">
              <div className="flex items-center gap-sm">
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-primary" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">Notification sounds</p>
                  <p className="text-xs text-muted-foreground">
                    Master switch for the per-type sounds below. Also available
                    from the account menu.
                  </p>
                </div>
              </div>
              <Switch
                checked={soundEnabled}
                onCheckedChange={(checked) => {
                  setSoundEnabled(checked);
                  if (checked) enableDefaultSoundsIfNone();
                }}
              />
            </div>
            <div>
              <Label className="text-muted-foreground uppercase text-xs tracking-wider">
                Type
              </Label>
              <div className="mt-md overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                        Type
                      </th>
                      <Slot name="settings.notificationChannels.header" />
                      <th className="text-center py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                        In-App
                      </th>
                      <th className="text-center py-sm px-md text-muted-foreground uppercase text-xs tracking-wider">
                        <div className="flex items-center justify-center gap-1">
                          <Volume2 className="w-3.5 h-3.5" />
                          Sound
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {NOTIFICATION_TYPES_ORDER.map((type) => {
                      const settings = notificationsSettings[type];
                      // Only these 4 notification types can have in-app enabled
                      const inAppEnabled = [
                        'buyOrderFilled',
                        'sellOrderFilled',
                        'dealStarted',
                        'dealClosedWithPnL',
                      ].includes(type);
                      const hasSoundSupport =
                        SOUND_ENABLED_TYPES.includes(type);
                      const soundSetting = soundSettings[type];

                      return (
                        <tr key={type} className="border-b">
                          <td className="py-md px-md text-sm">
                            {NOTIFICATION_TYPE_LABELS[type]}
                          </td>
                          <Slot
                            name="settings.notificationChannels.cell"
                            type={type}
                            settings={settings}
                            setSetting={setNotificationSetting}
                          />
                          <td className="py-md px-md text-center">
                            <Checkbox
                              checked={settings.inApp}
                              disabled={!inAppEnabled}
                              onCheckedChange={(checked) => {
                                setNotificationSetting(
                                  type,
                                  'inApp',
                                  checked as boolean
                                );
                              }}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-md px-md text-center">
                            {hasSoundSupport ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <Checkbox
                                  checked={soundSetting?.enabled ?? false}
                                  onCheckedChange={(checked) => {
                                    setSoundSetting(type, {
                                      enabled: checked as boolean,
                                    });
                                  }}
                                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                                <Select
                                  value={
                                    soundSetting
                                      ? `${soundSetting.soundFile}.${soundSetting.extension}`
                                      : undefined
                                  }
                                  onValueChange={(value) => {
                                    const sound = AVAILABLE_SOUNDS.find(
                                      (s) =>
                                        `${s.file}.${s.extension}` === value
                                    );
                                    if (sound) {
                                      setSoundSetting(type, {
                                        soundFile: sound.file,
                                        extension: sound.extension,
                                        enabled: true,
                                      });
                                    }
                                  }}
                                  disabled={!soundSetting?.enabled}
                                >
                                  <SelectTrigger className="w-[130px] h-7 text-xs">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {AVAILABLE_SOUNDS.map((sound) => (
                                      <SelectItem
                                        key={`${sound.file}.${sound.extension}`}
                                        value={`${sound.file}.${sound.extension}`}
                                      >
                                        {sound.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={!soundSetting?.enabled}
                                  onClick={() => {
                                    if (soundSetting) {
                                      playNotificationSound(
                                        soundSetting.soundFile,
                                        soundSetting.extension
                                      );
                                    }
                                  }}
                                >
                                  <Play className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderConnectedApps = () => (
    <div className="max-w-4xl">
      {/* Cloud fills with the OAuth grants list; sh has no OAuth
          provider, so the slot renders nothing. */}
      <Slot name="settings.connectedApps" />
    </div>
  );

  const renderDangerZone = () => (
    <div className="max-w-4xl">
      <div className={`grid ${pageGap}`}>
        {/* Cloud fills with Reset + Delete sections; sh sees an empty
            page here unless it registers its own filler. */}
        <Slot name="settings.dangerZone" />
      </div>
    </div>
  );

  const renderSavedData = () => (
    // Full-width — the Saved Data manager renders wide local/remote data
    // tables, so it isn't constrained to the max-w-4xl form column.
    // Cloud fills with the embedded SavedDataPage; sh registers nothing
    // (and the section is cloud-gated out of the sidebar anyway).
    <Slot name="settings.savedData" />
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'personal-data':
        return renderPersonalData();
      case 'login-security':
        return renderLoginSecurity();
      case 'visual':
        return renderVisual();
      case 'api-keys':
        return renderAPIKeys();
      case 'shortcuts':
        return renderShortcuts();
      case 'license-key':
        return renderLicenseKey();
      case 'notification-preferences':
        return renderNotificationPreferences();
      case 'connected-apps':
        return renderConnectedApps();
      case 'saved-data':
        return renderSavedData();
      case 'danger-zone':
        return renderDangerZone();
      default:
        return (
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-xs md:mb-md">
              {settingsSections.find((s) => s.id === activeSection)?.title ||
                'Settings'}
            </h1>
            <Card>
              <CardContent className="p-md md:p-lg text-center">
                <SettingsIcon className="w-16 h-16 text-muted-foreground mx-auto mb-xs md:mb-md" />
                <p className="text-muted-foreground mb-xs md:mb-md">
                  This section is currently under development.
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate('/settings/personal-data')}
                >
                  Go to Personal Data
                </Button>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <MainLayout pageTitle="Settings" activePage="/settings">
      <WidgetContainer layout="flex">
        <div className={`flex flex-col ${pageGap} md:flex-row md:gap-3 h-full bg-background`}>
          {renderSettingsSidebar()}
          {/* min-w-0 lets flex-1 actually constrain children: without it,
              a wide table inside (API keys / notifications) forces the
              flex item past the viewport instead of letting the inner
              overflow-x-auto scroll within. */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </WidgetContainer>
    </MainLayout>
  );
};

export default Settings;
