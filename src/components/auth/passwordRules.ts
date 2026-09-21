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

export interface PasswordRule {
  label: string;
  passes: (password: string, confirm: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: `Between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    passes: (p) =>
      p.length >= MIN_PASSWORD_LENGTH && p.length <= MAX_PASSWORD_LENGTH,
  },
  {
    label: 'Contains a number',
    passes: (p) => /\d/.test(p),
  },
  // The case rules stay deliberately ASCII, mirroring the backend's [A-Z] and
  // [a-z] exactly. A Unicode-aware check here (\p{Lu}) would accept `Ärger1`
  // as having an uppercase letter while the server would not — the same class
  // of mismatch this file exists to prevent.
  {
    label: 'Contains an uppercase letter',
    passes: (p) => /[A-Z]/.test(p),
  },
  {
    label: 'Contains a lowercase letter',
    passes: (p) => /[a-z]/.test(p),
  },
  {
    label: 'Passwords match',
    passes: (p, c) => p.length > 0 && p === c,
  },
];

export const passwordMeetsAllRules = (
  password: string,
  confirm: string,
): boolean => PASSWORD_RULES.every((r) => r.passes(password, confirm));
