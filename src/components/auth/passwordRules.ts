// The single definition of what makes a password acceptable in the UI.
//
// These rules are the only password guidance a user ever sees, and they gate
// the submit button on both the sign-up form and the password-reset page. They
// must therefore be at least as strict as EVERY backend that can receive the
// result, otherwise a user gets a full set of green ticks and a server-side
// rejection with no way to tell what is wrong. The rules to cover:
//
//   reset  — main-app PasswordResetService.isAcceptablePassword: 8..200 chars
//   change — main-app core graphql/handlers/password.verifyPassword:
//            /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{6,}$/
//
// The list below is the union of those. It previously required only 6
// characters and never mentioned a lowercase letter, so `Haus12` (reset) and
// `PASSWORT123` (change) both passed every visible rule and were refused by
// the server. Loosening a rule here re-opens that gap; if a backend rule
// tightens, tighten this one first. tests/passwordChecklistBackendParity
// asserts the relationship and will fail if the two sides drift.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

// The atomic predicates, exported so every password form in the app tests the
// same thing. Settings has its own checklist layout and cannot reuse the
// PasswordChecklist component wholesale, but it must not re-derive the rules:
// that is how it ended up with its own copy that never checked for a lowercase
// letter while the changePassword endpoint required one.
export const hasMinLength = (p: string) =>
  p.length >= MIN_PASSWORD_LENGTH && p.length <= MAX_PASSWORD_LENGTH;
export const hasNumber = (p: string) => /\d/.test(p);
// ASCII on purpose — see the note above the rule list.
export const hasUppercase = (p: string) => /[A-Z]/.test(p);
export const hasLowercase = (p: string) => /[a-z]/.test(p);
export const passwordsMatch = (p: string, c: string) => p.length > 0 && p === c;

export interface PasswordRule {
  label: string;
  passes: (password: string, confirm: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `Between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    passes: (p) => hasMinLength(p),
  },
  {
    label: 'Contains a number',
    passes: (p) => hasNumber(p),
  },
  {
    label: 'Contains an uppercase letter',
    passes: (p) => hasUppercase(p),
  },
  {
    label: 'Contains a lowercase letter',
    passes: (p) => hasLowercase(p),
  },
  {
    label: 'Passwords match',
    passes: (p, c) => passwordsMatch(p, c),
  },
];

export const passwordMeetsAllRules = (
  password: string,
  confirm: string,
): boolean => PASSWORD_RULES.every((r) => r.passes(password, confirm));

export interface PasswordValidation {
  minLength: boolean;
  hasNumber: boolean;
  hasCapital: boolean;
  hasLowercase: boolean;
  passwordsMatch: boolean;
  /** The current-password box is non-empty. Correctness is checked server-side. */
  currentPasswordProvided: boolean;
}

/**
 * Per-rule breakdown for the Settings change-password form, which renders its
 * own checklist layout. It lives here, next to the rules it reports on, so it
 * cannot drift from them the way the previous copy in usePasswordChange did.
 */
export function validatePassword(
  password: string,
  confirmPassword: string,
  currentPassword = ''
): PasswordValidation {
  return {
    minLength: hasMinLength(password),
    hasNumber: hasNumber(password),
    hasCapital: hasUppercase(password),
    hasLowercase: hasLowercase(password),
    passwordsMatch: passwordsMatch(password, confirmPassword),
    currentPasswordProvided: currentPassword.length > 0,
  };
}
