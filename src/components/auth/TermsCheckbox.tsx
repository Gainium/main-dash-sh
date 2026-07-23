import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import React from 'react';

/** The ToS acceptance checkbox shared by Login and SignUp. */
const TermsCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => (
  <div className="mt-10 flex items-start space-x-xs">
    <Checkbox
      id="terms"
      className="mt-0.5 size-5 sm:size-4"
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
    />
    <Label
      htmlFor="terms"
      className="text-sm text-muted-foreground leading-relaxed"
    >
      Accept{' '}
      <a
        href="https://gainium.io/legal/terms-and-conditions"
        className="text-primary hover:text-primary/80 underline transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        terms and conditions
      </a>
    </Label>
  </div>
);

export default TermsCheckbox;
