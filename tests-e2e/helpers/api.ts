import { readFileSync } from 'node:fs';

/**
 * Direct GraphQL access, used to SEED the state a spec needs and to tear it
 * down afterwards.
 *
 * Seeding through the API rather than by clicking is deliberate. The defects
 * these specs cover are load/save fidelity defects — does a stored value reach
 * the form, does an edited value reach the wire. Building the bot itself
 * through the UI would add hundreds of fragile clicks that test the config
 * screens instead, and for some fixtures (an indicator in two roles, a short
 * futures grid) it is most of an afternoon. The UI is still what we exercise
 * for the part under test.
 */

interface TokenFile {
  token: string;
  apiEndpoint?: string;
  user?: { _id?: string; id?: string };
}

const tokenFile = (): TokenFile => {
  const path = process.env['E2E_TOKEN_FILE'];
  if (!path) {
    throw new Error(
      'E2E_TOKEN_FILE is not set. Run iso-preview.sh first and export the token path it prints — see tests-e2e/README.md.'
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as TokenFile;
};

export const apiEndpoint = (): string =>
  process.env['E2E_API'] ?? tokenFile().apiEndpoint ?? 'https://api.gainium.io';

export const userId = (): string => {
  const u = tokenFile().user;
  const id = u?._id ?? u?.id;
  if (!id) throw new Error('token file has no user id');
  return id;
};

export interface GqlResult<T = unknown> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * main-app authenticates from the `token` header, NOT `Authorization: Bearer`.
 * Sending the wrong one does not 401 — it answers 200 with a NOTOK envelope
 * inside `data`, which is easy to mistake for a logic bug.
 */
export const gql = async <T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
  opts: { paper?: boolean } = {}
): Promise<T> => {
  // Paper vs live is decided PER REQUEST by this header — nothing on the user
  // record selects it. Omit it and a paper account's bots come back as an
  // empty list with status OK, which reads exactly like "this account has no
  // bots" rather than "you asked the wrong context". Default to paper: these
  // specs create and delete bots, and they must never touch live ones.
  const paper = opts.paper ?? process.env['E2E_PAPER'] !== 'false';

  const res = await fetch(apiEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token: tokenFile().token,
      ...(paper ? { 'paper-context': 'true' } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await res.json()) as GqlResult<T>;
  if (body.errors?.length) {
    throw new Error(
      `GraphQL error for ${query.slice(0, 60).replace(/\s+/g, ' ')}…: ${body.errors
        .map((e) => e.message)
        .join('; ')}`
    );
  }
  if (!body.data) throw new Error('GraphQL returned no data');
  return body.data;
};

/** Unwraps the platform's `{status, reason, data}` envelope and fails loudly. */
export const unwrap = <T>(
  envelope: { status?: string; reason?: string | null; data?: T } | undefined,
  what: string
): T => {
  if (!envelope) throw new Error(`${what}: no envelope returned`);
  if (envelope.status && envelope.status !== 'OK') {
    throw new Error(`${what}: ${envelope.status} — ${envelope.reason ?? ''}`);
  }
  if (envelope.data === undefined || envelope.data === null) {
    throw new Error(`${what}: envelope carried no data`);
  }
  return envelope.data;
};
