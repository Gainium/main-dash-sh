import { test, expect } from '@playwright/test';

import {
  passwordMeetsAllRules,
  validatePassword,
} from '@/components/auth/passwordRules';

/**
 * The checklist is the only password guidance a user sees, and it gates the
 * submit button. If it accepts something a backend refuses, the user gets a
 * full set of green ticks and an error with nothing on the form to explain
 * it — which is exactly how `Haus12` and `PASSWORT123` used to behave.
 *
 * The two predicates below are transcribed from the server so this test fails
 * if the checklist is ever loosened past them. They are duplicated on purpose:
 * the frontend cannot import from main-app, so the only thing keeping the two
 * sides honest is an assertion that states the backend rule out loud. If a
 * server rule changes, change it here and let the test tell you whether the
 * checklist still covers it.
 */

// main-app: src/auth/PasswordResetService.ts — isAcceptablePassword
const acceptedByResetEndpoint = (pw: string) =>
  typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

// main-app: core/src/graphql/handlers/password.ts — verifyPassword
const acceptedByChangePasswordEndpoint = (pw: string) =>
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{6,}$/.test(pw);

test.describe('password checklist / backend parity', () => {
  test('the passwords that used to tick every rule and still fail are now blocked', () => {
    // Too short for the reset endpoint (it wants 8, the checklist asked 6).
    expect(passwordMeetsAllRules('Haus12', 'Haus12')).toBe(false);
    expect(acceptedByResetEndpoint('Haus12')).toBe(false);

    // No lowercase letter — the change-password endpoint requires one and the
    // checklist never mentioned it.
    expect(passwordMeetsAllRules('PASSWORT123', 'PASSWORT123')).toBe(false);
    expect(acceptedByChangePasswordEndpoint('PASSWORT123')).toBe(false);
  });

  test('a password that satisfies every backend is still accepted', () => {
    for (const pw of ['Passwort1', 'Wetter2024', 'Tr0ubadour']) {
      expect(passwordMeetsAllRules(pw, pw)).toBe(true);
      expect(acceptedByResetEndpoint(pw)).toBe(true);
      expect(acceptedByChangePasswordEndpoint(pw)).toBe(true);
    }
  });

  test('mismatched confirmation is rejected regardless of strength', () => {
    expect(passwordMeetsAllRules('Passwort1', 'Passwort2')).toBe(false);
    expect(passwordMeetsAllRules('', '')).toBe(false);
  });

  test('anything the checklist accepts is accepted by every backend', () => {
    // Deterministic sweep over a character set that mixes case, digits,
    // punctuation, whitespace and non-ASCII letters — the last of these is
    // what makes an accented capital worth checking, since the server's
    // [A-Z] does not match it.
    const chars = [...'abcXYZ019 !@#äÄöÜß-_.'];
    let accepted = 0;
    let seed = 1;
    const next = () => {
      // xorshift, so the corpus is identical on every run and a failure is
      // reproducible rather than a flake.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return Math.abs(seed);
    };

    for (let i = 0; i < 40000; i++) {
      const len = 1 + (next() % 14);
      let pw = '';
      for (let j = 0; j < len; j++) pw += chars[next() % chars.length];
      if (!passwordMeetsAllRules(pw, pw)) continue;
      accepted++;
      expect(
        acceptedByResetEndpoint(pw),
        `reset endpoint rejects checklist-approved ${JSON.stringify(pw)}`,
      ).toBe(true);
      expect(
        acceptedByChangePasswordEndpoint(pw),
        `change-password endpoint rejects checklist-approved ${JSON.stringify(pw)}`,
      ).toBe(true);
    }

    // Guards the sweep itself: if a future edit made the checklist reject
    // everything, the loop above would pass vacuously.
    expect(accepted).toBeGreaterThan(100);
  });

  test('the Settings change-password form enforces the same rules', () => {
    // Settings renders its own checklist layout rather than the shared
    // component, so it gets its own assertion. It previously carried a
    // separate copy of the rules that never checked for a lowercase letter.
    const allOf = (v: ReturnType<typeof validatePassword>) =>
      Object.values(v).every(Boolean);

    // No lowercase letter — the endpoint this form posts to requires one.
    expect(allOf(validatePassword('PASSWORT123', 'PASSWORT123', 'old'))).toBe(
      false,
    );
    expect(acceptedByChangePasswordEndpoint('PASSWORT123')).toBe(false);

    // Short enough that the old 6-character rule would have passed it.
    expect(allOf(validatePassword('Haus12', 'Haus12', 'old'))).toBe(false);

    // A password that satisfies the endpoint still gets through.
    expect(allOf(validatePassword('Passwort1', 'Passwort1', 'old'))).toBe(true);
    expect(acceptedByChangePasswordEndpoint('Passwort1')).toBe(true);

    // The current-password box is still a required gate on top of strength.
    expect(allOf(validatePassword('Passwort1', 'Passwort1', ''))).toBe(false);
  });

  test('both forms agree, rule for rule', () => {
    for (const pw of ['Passwort1', 'PASSWORT123', 'Haus12', 'wetter2024', '']) {
      const settings = validatePassword(pw, pw, 'old');
      const strengthOnly = Object.entries(settings)
        .filter(([k]) => k !== 'currentPasswordProvided')
        .every(([, v]) => v);
      expect(
        strengthOnly,
        `Settings and the shared checklist disagree on ${JSON.stringify(pw)}`,
      ).toBe(passwordMeetsAllRules(pw, pw));
    }
  });
});
