/**
 * Repairs PEM-armoured API secrets that arrive damaged from the browser.
 *
 * Coinbase's CDP "Trading key" (and any other venue whose secret is an EC
 * private key) is a multi-line PEM block. The API Secret field is a
 * single-line `<input>`, and the HTML value sanitisation algorithm strips CR
 * and LF from an input's value — so a correctly copied key silently loses its
 * line breaks on paste and stops being a parseable key. The failure surfaces
 * much later, at the venue, as jsonwebtoken's
 * `secretOrPrivateKey must be an asymmetric key when using ES256`, which reads
 * as "your key is wrong" and sends the user off to mint yet another one.
 *
 * The same opaque error covers every other way the armour gets mangled in
 * transit: a dash lost while drag-selecting (`----BEGIN`), newlines pasted as
 * spaces, a missing END footer, or the `\n` escapes from Coinbase's downloaded
 * `cdp_api_key.json` surviving a JSON round-trip as `\\n`.
 *
 * All of those describe the same key, so repair them instead of rejecting
 * them: rebuild canonical armour around the base64 body and emit the escaped
 * single-line form. That form is what Coinbase's own key file contains, it
 * survives the single-line input untouched, and `coinbase-advanced-node`
 * converts `\n` back to real newlines before signing
 * (`dist/auth/RequestSigner.js` `buildJWT`).
 */

/** Matches the PEM label of a private key, however mangled the dashes are. */
const PEM_LABEL = /-{1,}\s*BEGIN\s+([A-Z0-9 ]*PRIVATE KEY)\s*-{1,}/i;

/** A secret is PEM-shaped once it announces a private key, armour aside. */
export const looksLikePemSecret = (secret: string): boolean =>
  PEM_LABEL.test(secret.replace(/\\+n/g, "\n"));

/**
 * Rebuilds a damaged PEM into the canonical escaped one-liner.
 *
 * Returns the input trimmed and unchanged when it is not PEM-shaped (an HMAC
 * secret, a Hyperliquid hex key), and `null` when it announces a private key
 * but carries no recoverable base64 body — the one case worth surfacing to
 * the user, since nothing can be reconstructed from it.
 */
export const normalizePemSecret = (secret: string): string | null => {
  const trimmed = secret.trim();
  if (!trimmed) return trimmed;

  // Unescape first: `\n` from Coinbase's key file, `\\n` from a JSON
  // round-trip, and CRLF from a Windows clipboard all mean one line break.
  const unescaped = trimmed
    .replace(/\\+n/g, "\n")
    .replace(/\\+r/g, "")
    .replace(/\r/g, "");

  const label = unescaped.match(PEM_LABEL);
  if (!label) return trimmed;

  const keyLabel = label[1].toUpperCase().replace(/\s+/g, " ");

  // Everything after the header, minus any END footer, is the body. The
  // footer is optional here precisely because a truncated paste may have lost
  // it along with the trailing newline.
  const afterHeader = unescaped.slice((label.index ?? 0) + label[0].length);
  const body = afterHeader
    .replace(/-{1,}\s*END\s+[A-Z0-9 ]*PRIVATE KEY\s*-{1,}/i, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  if (!body) return null;

  // Re-wrap at 64 characters, the width every PEM writer uses. OpenSSL's
  // parser tolerates other widths, but matching the canonical layout keeps a
  // round-tripped key byte-identical to the one Coinbase issued.
  const lines = body.match(/.{1,64}/g) ?? [];

  // The trailing newline is part of the canonical form every PEM writer
  // emits — keeping it makes a repaired key byte-identical to the issued one.
  return (
    [`-----BEGIN ${keyLabel}-----`, ...lines, `-----END ${keyLabel}-----`].join(
      "\\n",
    ) + "\\n"
  );
};
