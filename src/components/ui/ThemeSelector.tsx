import { Monitor, Moon, Sun } from 'lucide-react';
import React from 'react';
import {
  useVisualSettingsStore,
  type ThemeMode,
} from '../../stores/visualSettingsStore';

interface ThemeSelectorProps {
  onThemeChange?: (theme: ThemeMode) => void;
  className?: string;
  variant?: 'cards' | 'buttons';
  showDescription?: boolean;
  autoAdvance?: boolean;
  autoAdvanceDelay?: number;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  onThemeChange,
  className = '',
  variant = 'cards',
  showDescription = true,
  autoAdvance = false,
  autoAdvanceDelay = 500,
}) => {
  const { theme, setTheme } = useVisualSettingsStore();

  const themes: Array<{
    id: ThemeMode;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'light',
      label: 'Light',
      description: 'Clean and bright interface',
      icon: <Sun className="w-6 h-6" />,
    },
    {
      id: 'dark',
      label: 'Dark',
      description: 'Easy on the eyes',
      icon: <Moon className="w-6 h-6" />,
    },
    {
      id: 'system',
      label: 'System',
      description: 'Follows your OS preference',
      icon: <Monitor className="w-6 h-6" />,
    },
  ];

  const handleThemeSelect = (selectedTheme: ThemeMode) => {
    setTheme(selectedTheme);
    onThemeChange?.(selectedTheme);

    if (autoAdvance) {
      setTimeout(() => {
        // This can be used by parent components to trigger next actions
      }, autoAdvanceDelay);
    }
  };

  if (variant === 'buttons') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {themes.map((themeOption) => (
          <button
            key={themeOption.id}
            onClick={() => handleThemeSelect(themeOption.id)}
            className={`
              flex items-center gap-2 px-2 py-1 rounded-md transition-all duration-200
              ${
                theme === themeOption.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }
            `}
          >
            <div className="w-4 h-4">
              {themeOption.id === 'light' && <Sun className="w-4 h-4" />}
              {themeOption.id === 'dark' && <Moon className="w-4 h-4" />}
              {themeOption.id === 'system' && <Monitor className="w-4 h-4" />}
            </div>
            <span className="text-sm font-medium">{themeOption.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 gap-sm max-w-2xl mx-auto ${className}`}
    >
      {themes.map((themeOption) => (
        <button
          key={themeOption.id}
          onClick={() => handleThemeSelect(themeOption.id)}
          className={`
            relative p-2 md:p-3 rounded-md border-2 transition-all duration-200 hover:scale-105
            ${
              theme === themeOption.id
                ? 'border-primary bg-primary text-primary-foreground shadow-lg'
                : 'border-border bg-card hover:border-primary/50'
            }
          `}
        >
          {/* Selection highlights moved to full-button backgrounds */}

          <div className="flex flex-col items-center space-y-3">
            <div
              className={`text-primary transition-colors ${
                theme === themeOption.id
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`}
            >
              {themeOption.icon}
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">
                {themeOption.label}
              </h3>
              {showDescription && (
                <p className="text-sm text-muted-foreground">
                  {themeOption.description}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};
