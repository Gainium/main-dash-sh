import { Check, X } from 'lucide-react';
import React from 'react';

import { PASSWORD_RULES } from '@/components/auth/passwordRules';

interface PasswordChecklistProps {
  password: string;
  confirmPassword: string;
  onChange: (isValid: boolean) => void;
}

export const PasswordChecklist: React.FC<PasswordChecklistProps> = ({
  password,
  confirmPassword,
  onChange,
}) => {
  const results = PASSWORD_RULES.map((r) => ({
    label: r.label,
    ok: r.passes(password, confirmPassword),
  }));

  const allValid = results.every((r) => r.ok);
  React.useEffect(() => {
    onChange(allValid);
  }, [allValid, onChange]);

  return (
    <ul className="space-y-xs text-xs">
      {results.map((r) => (
        <li
          key={r.label}
          className={
            r.ok
              ? 'flex items-center gap-xs text-emerald-600 dark:text-emerald-400'
              : 'flex items-center gap-xs text-muted-foreground'
          }
        >
          {r.ok ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
};
