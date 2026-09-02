import { test, expect } from '@playwright/test';
import crypto from 'crypto';

import {
  looksLikePemSecret,
  normalizePemSecret,
} from '@/components/exchanges/secretNormalization';

/**
 * A Coinbase CDP "Trading key" secret is an EC private key in PEM form. The
 * API Secret field is a single-line `<input>`, which strips CR/LF from its
 * value — so every one of the manglings below reached the venue as a broken
 * key and came back as jsonwebtoken's
 * `secretOrPrivateKey must be an asymmetric key when using ES256`.
 *
 * The oracle here is the signer itself: each repaired secret is unescaped the
 * way `coinbase-advanced-node`'s `buildJWT` does (`replace(/\\n/g, '\n')`) and
 * fed to `crypto.createPrivateKey`, which is what jsonwebtoken calls and what
 * threw on the damaged input.
 */

const { privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});
const PEM = privateKey.export({ type: 'sec1', format: 'pem' }).toString();

/** Repairs a secret the test expects to be recoverable. */
const repair = (secret: string): string => {
  const repaired = normalizePemSecret(secret);
  if (repaired === null) {
    throw new Error('expected a repairable PEM, got an unrecoverable one');
  }
  return repaired;
};

/** Mirrors the SDK's unescaping, then asserts the key actually parses. */
const parses = (secret: string): boolean => {
  try {
    crypto.createPrivateKey(secret.replace(/\\n/g, '\n'));
    return true;
  } catch {
    return false;
  }
};

test.describe('normalizePemSecret', () => {
  test('repairs every way the browser and clipboard damage a PEM', () => {
    const damaged: Record<string, string> = {
      'clean multi-line paste': PEM,
      'literal \\n escapes (copied from cdp_api_key.json)': PEM.replace(
        /\n/g,
        '\\n'
      ),
      'newlines stripped (pasted into a single-line input)': PEM.replace(
        /\n/g,
        ''
      ),
      'newlines flattened to spaces': PEM.replace(/\n/g, ' '),
      'a dash lost while drag-selecting': PEM.replace(
        /^-----BEGIN/,
        '----BEGIN'
      ),
      'lost dash and escaped newlines together': PEM.replace(
        /^-----BEGIN/,
        '----BEGIN'
      ).replace(/\n/g, '\\n'),
      'missing END footer': PEM.replace(/-----END EC PRIVATE KEY-----\n?/, ''),
      'double-escaped \\\\n from a JSON round-trip': PEM.replace(
        /\n/g,
        '\\\\n'
      ),
      'surrounding whitespace': `\n  ${PEM}  \n`,
    };

    for (const [name, secret] of Object.entries(damaged)) {
      expect(parses(repair(secret)), name).toBe(true);
    }
  });

  test('repaired key is byte-identical to the one the venue issued', () => {
    const repaired = repair(PEM.replace(/\n/g, ''));
    expect(repaired.replace(/\\n/g, '\n')).toBe(PEM.trimEnd() + '\n');
  });

  test('survives being normalized twice (edit, save, edit again)', () => {
    const once = repair(PEM.replace(/\n/g, ' '));
    expect(parses(repair(once))).toBe(true);
    expect(repair(once)).toBe(once);
  });

  test('leaves non-PEM secrets untouched apart from trimming', () => {
    // An HMAC secret must not be reshaped — only whitespace is safe to drop.
    const hmac = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fA';
    expect(normalizePemSecret(`  ${hmac}  `)).toBe(hmac);
    // A Hyperliquid agent key is single-line hex, not PEM.
    const hex = `0x${'a1b2c3d4'.repeat(8)}`;
    expect(normalizePemSecret(hex)).toBe(hex);
    expect(normalizePemSecret('')).toBe('');
  });

  test('returns null when a PEM announces a key but carries no body', () => {
    // Worth surfacing: nothing can be reconstructed from armour alone.
    expect(
      normalizePemSecret(
        '-----BEGIN EC PRIVATE KEY-----\n-----END EC PRIVATE KEY-----'
      )
    ).toBeNull();
  });

  test('looksLikePemSecret recognises damaged armour', () => {
    expect(looksLikePemSecret(PEM)).toBe(true);
    expect(looksLikePemSecret(PEM.replace(/\n/g, '\\n'))).toBe(true);
    expect(looksLikePemSecret(PEM.replace(/^-----BEGIN/, '----BEGIN'))).toBe(
      true
    );
    expect(looksLikePemSecret('NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP')).toBe(false);
  });
});

/**
 * The premise of the fix, checked against a real browser rather than assumed:
 * a single-line `<input>` silently destroys a multi-line PEM, and the escaped
 * one-liner the normalizer emits survives it unchanged.
 */
test.describe('single-line input handling', () => {
  test('an input strips the newlines out of a PEM, the repaired form survives', async ({
    page,
  }) => {
    await page.setContent('<input id="secret" type="password" />');

    const roundTrip = (value: string) =>
      page.evaluate((v) => {
        const el = document.querySelector('#secret');
        if (!(el instanceof HTMLInputElement)) {
          throw new Error('test input missing');
        }
        el.value = v;
        return el.value;
      }, value);

    // The damage this fix exists to prevent.
    const rawInInput = await roundTrip(PEM);
    expect(rawInInput).not.toContain('\n');
    expect(parses(rawInInput)).toBe(false);

    // The repaired secret carries its line breaks as `\n` escapes, so the
    // input's value sanitisation has nothing to strip.
    const repaired = repair(PEM);
    expect(await roundTrip(repaired)).toBe(repaired);
    expect(parses(repaired)).toBe(true);
  });
});
