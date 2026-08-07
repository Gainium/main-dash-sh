#!/usr/bin/env node
/**
 * CSS contract test for src/index.css.
 *
 * WHY THIS EXISTS
 * ---------------
 * Tailwind v4 emits nothing — and warns about nothing — for a utility class it
 * does not know. A class that stops compiling therefore does not fail the
 * build, fail lint, or throw at runtime; the element simply loses that style
 * and the regression ships. This repo already ran into that twice:
 *
 *   1. `mt-*`, `mb-*`, `ml-*`, `mr-*`, `pt-*`, `pb-*`, `pl-*`, `pr-*` were
 *      never defined for the named tokens, and every variant-prefixed form
 *      (`md:p-md`, `sm:gap-xs`) was dead too — 593 class usages across 140
 *      files rendering as no-ops.
 *   2. `dark:` compiled to `@media (prefers-color-scheme: dark)` and followed
 *      the OS instead of the in-app theme toggle, for 225 usages.
 *
 * Both had the same root cause: a `tailwind.config.js` that was never loaded,
 * because v4 only reads it when a `@config` directive points at it. Deleting
 * that file removed the lie; this script stops an equivalent one returning.
 *
 * It compiles src/index.css through the real PostCSS pipeline and asserts the
 * generated stylesheet actually contains what the app assumes. Run it in CI.
 */
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = path.join(ROOT, 'src', 'index.css');

const TOKENS = ['xs', 'sm', 'md', 'lg', 'xl'];

/** family -> the CSS declaration it must produce, `T` = the token's var(). */
const FAMILIES = {
  'm': 'margin: T',
  'mx': 'margin-inline: T',
  'my': 'margin-block: T',
  'mt': 'margin-top: T',
  'mr': 'margin-right: T',
  'mb': 'margin-bottom: T',
  'ml': 'margin-left: T',
  'ms': 'margin-inline-start: T',
  'me': 'margin-inline-end: T',
  'p': 'padding: T',
  'px': 'padding-inline: T',
  'py': 'padding-block: T',
  'pt': 'padding-top: T',
  'pr': 'padding-right: T',
  'pb': 'padding-bottom: T',
  'pl': 'padding-left: T',
  'ps': 'padding-inline-start: T',
  'pe': 'padding-inline-end: T',
  'gap': 'gap: T',
  'gap-x': 'column-gap: T',
  'gap-y': 'row-gap: T',
};
/** These wrap their declarations in a child selector, so match loosely. */
const SPACE_FAMILIES = ['space-x', 'space-y'];

/**
 * Classes whose meaning must NOT be captured by our spacing scale.
 * `max-w-*`, `w-*`, `h-*`, `size-*` and `basis-*` read Tailwind's
 * `--container-*` namespace. If our tokens are ever declared directly in
 * `@theme` as `--spacing-*` (rather than the private `--space-*` namespace),
 * these silently switch from 28rem-class container widths to ~1.5rem spacing
 * values and every such container in the app collapses.
 */
const CONTAINER_GUARD = ['max-w-md', 'max-w-lg', 'max-w-sm', 'w-md', 'basis-md'];

/** Built-ins that our custom @utility rules must not shadow. */
const BUILTIN_GUARD = [
  ['mb-4', /margin-bottom:\s*calc\(var\(--spacing\)\s*\*\s*4\)/],
  ['mx-auto', /margin-inline:\s*auto/],
  ['mt-auto', /margin-top:\s*auto/],
  ['p-px', /padding:\s*1px/],
  ['gap-0', /gap:\s*calc\(var\(--spacing\)\s*\*\s*0\)/],
  ['space-y-4', /--tw-space-y-reverse/],
];

/** Variant forms — dead for years while the utilities were hand-written. */
const VARIANT_PROBES = ['md:p-md', 'sm:gap-xs', 'lg:space-y-xl', 'hover:mb-lg'];

const probeClasses = [
  ...Object.keys(FAMILIES).flatMap((f) => TOKENS.map((t) => `${f}-${t}`)),
  ...SPACE_FAMILIES.flatMap((f) => TOKENS.map((t) => `${f}-${t}`)),
  ...CONTAINER_GUARD,
  ...BUILTIN_GUARD.map(([c]) => c),
  ...VARIANT_PROBES,
  'dark:text-red-400',
];

/** The literal selector text Tailwind emits — `md:p-md` becomes `.md\:p-md`. */
const selectorText = (cls) => '.' + cls.replace(/([:./[\]])/g, '\\$1');
/** Escape that literal text for use inside a RegExp. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const selectorRe = (cls, tail) =>
  new RegExp(esc(selectorText(cls)) + (tail ?? ''));

const failures = [];
const fail = (msg) => failures.push(msg);

const run = async () => {
  const source = fs.readFileSync(CSS, 'utf8');

  // Feed the probe classes in as an inline @source so we do not depend on any
  // of them still being used somewhere in the app.
  const probeFile = path.join(ROOT, '.css-contract-probe.html');
  fs.writeFileSync(probeFile, `<div class="${probeClasses.join(' ')}"></div>`);

  let css;
  try {
    const injected = source.replace(
      /@import\s+['"]tailwindcss['"];/,
      `@import 'tailwindcss';\n@source '${path.basename(probeFile)}';`
    );
    const res = await postcss([tailwind()]).process(injected, { from: CSS });
    css = res.css;
  } finally {
    fs.rmSync(probeFile, { force: true });
  }

  const ruleFor = (cls) => {
    const m = css.match(selectorRe(cls, '\\s*\\{([\\s\\S]*?)\\n\\s*\\}'));
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };

  // 1. Every family x token compiles, and keeps a var() reference so that
  //    switching density at runtime restyles without a rebuild.
  for (const [fam, decl] of Object.entries(FAMILIES)) {
    for (const t of TOKENS) {
      const cls = `${fam}-${t}`;
      const body = ruleFor(cls);
      if (!body) {
        fail(`.${cls} is not generated — the utility is dormant, ` +
             `every usage of it renders as nothing.`);
        continue;
      }
      const want = decl.replace('T', `var(--spacing-${t})`);
      if (!body.includes(want)) {
        fail(`.${cls} should declare "${want}" but got "${body}". ` +
             `A baked literal here breaks comfortable/compact switching.`);
      }
    }
  }

  // 2. space-x / space-y keep their token reference too.
  for (const fam of SPACE_FAMILIES) {
    for (const t of TOKENS) {
      const cls = `${fam}-${t}`;
      const body = ruleFor(cls);
      if (!body) {
        fail(`.${cls} is not generated.`);
      } else if (!body.includes(`var(--spacing-${t})`)) {
        fail(`.${cls} lost its var(--spacing-${t}) reference: "${body}"`);
      }
    }
  }

  // 3. Variants must compile. Hand-written classes in a @layer cannot be
  //    varied — that is what silently killed ~190 responsive spacing classes.
  for (const cls of VARIANT_PROBES) {
    if (!selectorRe(cls).test(css)) {
      fail(`${cls} is not generated — variant-prefixed spacing is dead, ` +
           `so responsive spacing silently does nothing.`);
    }
  }

  // 4. `dark:` must key off the in-app theme attribute, not the OS.
  const darkRule = css.match(
    selectorRe('dark:text-red-400', '\\s*\\{[\\s\\S]{0,240}?\\}')
  )?.[0];
  if (!darkRule) {
    fail('dark:text-red-400 is not generated at all.');
  } else if (/prefers-color-scheme/.test(darkRule)) {
    fail('`dark:` compiles to @media (prefers-color-scheme) — it will follow ' +
         "the OS, not the app's theme toggle. Restore the " +
         '`@custom-variant dark ([data-theme=\'dark\'] &)` declaration.');
  } else if (!/data-theme/.test(darkRule)) {
    fail(`\`dark:\` does not key off [data-theme]: ${darkRule}`);
  }

  // 5. The spacing scale must not hijack the container scale.
  for (const cls of CONTAINER_GUARD) {
    const body = ruleFor(cls);
    if (!body) {
      fail(`.${cls} is not generated.`);
    } else if (!body.includes('--container-')) {
      fail(`.${cls} resolves to "${body}" instead of the --container-* scale. ` +
           'The spacing tokens have leaked into Tailwind\'s --spacing-* ' +
           'namespace and are now overriding container widths.');
    }
  }

  // 6. Built-in numeric / keyword utilities must survive our @utility rules.
  for (const [cls, re] of BUILTIN_GUARD) {
    const body = ruleFor(cls);
    if (!body) {
      fail(`.${cls} is not generated — a custom @utility has shadowed the ` +
           'built-in Tailwind scale.');
    } else if (!re.test(body)) {
      fail(`.${cls} compiled to "${body}", which does not match the built-in ` +
           'behaviour.');
    }
  }

  // 7. Both density modes must still define the whole scale.
  for (const mode of ['spacing-comfortable', 'spacing-compact']) {
    const block = source.match(
      new RegExp(`\\.${mode}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`)
    );
    if (!block) {
      fail(`.${mode} is missing from index.css — density switching is broken.`);
      continue;
    }
    for (const t of TOKENS) {
      if (!block[1].includes(`--spacing-${t}:`)) {
        fail(`.${mode} does not define --spacing-${t}.`);
      }
    }
  }

  const checks =
    Object.keys(FAMILIES).length * TOKENS.length +
    SPACE_FAMILIES.length * TOKENS.length +
    VARIANT_PROBES.length +
    CONTAINER_GUARD.length +
    BUILTIN_GUARD.length +
    11;

  if (failures.length) {
    console.error(`\n✗ CSS contract violated (${failures.length} problem(s)):\n`);
    for (const f of failures) console.error('  • ' + f + '\n');
    console.error(
      'These are silent failures: Tailwind emits no warning for a utility it\n' +
      'does not know, so the styles just go missing at runtime.\n' +
      'See the header comment in src/index.css.\n'
    );
    process.exit(1);
  }

  console.log(`✓ CSS contract holds (${checks} assertions)`);
};

run().catch((e) => {
  console.error('✗ could not compile src/index.css:', e.message);
  process.exit(1);
});
