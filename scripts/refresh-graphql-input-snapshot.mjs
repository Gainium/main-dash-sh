#!/usr/bin/env node
/**
 * Refresh the committed snapshot of the bot-mutation GraphQL input fields.
 *
 * Why a snapshot at all: the schema that decides which fields a save may carry
 * lives in main-app, a SEPARATE repo. This repo is also the open-source
 * self-hosted dashboard, so the guard that consumes this snapshot
 * (tests/botSavePayloadSchema.unit.test.ts) has to run with no main-app
 * checkout, no network and no Gainium credentials. Hence: generate here,
 * commit the result, and let the test read the committed JSON.
 *
 * Run this whenever main-app's change{DCA,Combo,}BotInput changes:
 *
 *   node scripts/refresh-graphql-input-snapshot.mjs
 *   GAINIUM_MAIN_APP_SCHEMA=/path/to/main-app/core/src/graphql/schema.ts \
 *     node scripts/refresh-graphql-input-snapshot.mjs
 *
 * A missing main-app checkout is NOT an error — the script says so and exits 0,
 * leaving the committed snapshot in place. Only a schema it can see but cannot
 * trust (interpolation, missing block) is a hard failure.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = resolve(REPO, 'tests/fixtures/graphql-bot-input-fields.json');

/** The inputs a bot save can target, keyed by the mutation that takes them. */
const INPUTS = {
  changeDCABotInput: 'changeDCABot',
  changeComboBotInput: 'changeComboBot',
  changeBotInput: 'changeBot',
};

const CANDIDATES = [
  process.env.GAINIUM_MAIN_APP_SCHEMA,
  // Frontends live at App/Frontend/{Local,Remote}-Frontends/main-dash-redesign/core
  resolve(REPO, '../../../../main-app/core/src/graphql/schema.ts'),
  // Desktop build: App/Frontend/desktop/main-dash-redesign
  resolve(REPO, '../../../main-app/core/src/graphql/schema.ts'),
  '/root/git/main-app/core/src/graphql/schema.ts',
].filter(Boolean);

const schemaPath = CANDIDATES.find((p) => existsSync(p));

if (!schemaPath) {
  console.log(
    'No main-app schema found; keeping the committed snapshot.\n' +
      'Set GAINIUM_MAIN_APP_SCHEMA to refresh it. Looked in:\n  ' +
      CANDIDATES.join('\n  ')
  );
  process.exit(0);
}

const source = readFileSync(schemaPath, 'utf8');

/**
 * Extract one `input Name { ... }` block.
 *
 * The schema is a TypeScript template literal, so a `${}` anywhere inside the
 * block would mean the field list is not statically knowable and this whole
 * approach is invalid. There is none today; if one ever appears we fail loudly
 * rather than snapshot a half-truth.
 */
const extract = (name) => {
  const match = source.match(new RegExp(`\\n(\\s*)input ${name} \\{\\n([\\s\\S]*?)\\n\\1\\}`));
  if (!match) throw new Error(`input ${name} not found in ${schemaPath}`);

  const body = match[2];
  if (body.includes('${')) {
    throw new Error(
      `input ${name} contains \${} interpolation — its field list is not ` +
        'statically knowable, so this snapshot cannot be trusted. Switch the ' +
        'guard to a different source of truth.'
    );
  }

  const fields = [...body.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
  if (fields.length === 0) throw new Error(`input ${name} parsed to zero fields`);

  const unique = [...new Set(fields)].sort();
  if (unique.length !== fields.length) {
    throw new Error(`input ${name} has duplicate field names`);
  }
  return unique;
};

const gitInfo = () => {
  try {
    const at = dirname(schemaPath);
    const run = (...args) =>
      execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim();
    return { commit: run('rev-parse', 'HEAD'), describe: run('rev-parse', '--short', 'HEAD') };
  } catch {
    return { commit: 'unknown', describe: 'unknown' };
  }
};

const { commit, describe } = gitInfo();

const snapshot = {
  $comment:
    'GENERATED — do not hand-edit. Run scripts/refresh-graphql-input-snapshot.mjs. ' +
    'Declared input fields of the bot-change mutations in main-app. Consumed by ' +
    'tests/botSavePayloadSchema.unit.test.ts to prove no save payload carries an ' +
    'undeclared field (prod Apollo rejects those with BAD_USER_INPUT).',
  source: {
    repo: 'main-app',
    path: 'core/src/graphql/schema.ts',
    commit,
    commitShort: describe,
  },
  inputs: Object.fromEntries(
    Object.entries(INPUTS).map(([input, mutation]) => {
      const fields = extract(input);
      return [input, { mutation, fieldCount: fields.length, fields }];
    })
  ),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Wrote ${OUT}`);
console.log(`  source: main-app @ ${describe} (${schemaPath})`);
for (const [name, { fieldCount }] of Object.entries(snapshot.inputs)) {
  console.log(`  ${name}: ${fieldCount} fields`);
}
