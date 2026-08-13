import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/**
 * Tests for `scripts/verify-form-bindings.mjs`.
 *
 * The script guards a bug class that neither type-check nor lint can see: a
 * bot-form control that reads one form field and writes another. Both fields
 * are the same type, so the code compiles; the user just watches their input
 * snap back to the other field's value on save. This is what shipped as the
 * "cooldown after deal close always reverts to 1" bug — the interval input
 * read `cooldownAfterDealStartInterval` and wrote `cooldownAfterDealStopInterval`.
 *
 * The detection cases matter as much as the clean case: an earlier revision of
 * the script walked the AST with a callback that returned the accumulator, and
 * `ts.forEachChild` aborts on a truthy return — so it stopped at the first
 * child and reported every file clean. A checker that silently passes is worse
 * than no checker, so each rule is pinned to a fixture that must fail.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const script = path.join(repoRoot, 'scripts', 'verify-form-bindings.mjs');

/** Run the checker over `target`; return its exit code and combined report. */
function run(target: string): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [script, target], {
      encoding: 'utf8',
      cwd: repoRoot,
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { code: err.status, output: `${err.stdout}${err.stderr}` };
  }
}

/** Run the checker over a temp dir holding `source`; return its report. */
function check(source: string): { code: number; output: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'form-bindings-'));
  try {
    fs.writeFileSync(path.join(dir, 'Fixture.tsx'), source);
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MISWIRED = `
export function Fixture() {
  const stopInterval = useBotFormSelector('cooldownAfterDealStartInterval');
  return (
    <NumberInput
      value={stopInterval || ''}
      onChange={(value) => handleNumericStringChange('cooldownAfterDealStopInterval', value)}
    />
  );
}
`;

const CORRECT = `
export function Fixture() {
  const stopInterval = useBotFormSelector('cooldownAfterDealStopInterval');
  return (
    <NumberInput
      value={stopInterval || ''}
      onChange={(value) => handleNumericStringChange('cooldownAfterDealStopInterval', value)}
    />
  );
}
`;

const MISWIRED_BINDING_PATH = `
export function Fixture() {
  const stopInterval = useBotFormSelector('cooldownAfterDealStartInterval');
  return (
    <FieldVariableBinding path="cooldownAfterDealStopInterval" varType="int">
      <NumberInput value={stopInterval || ''} placeholder="1" />
    </FieldVariableBinding>
  );
}
`;

test.describe('verify-form-bindings', () => {
  test('flags a control whose value and onChange target different fields', () => {
    const { code, output } = check(MISWIRED);
    expect(code).toBe(1);
    expect(output).toContain('value/onChange disagree');
    expect(output).toContain('cooldownAfterDealStartInterval');
    expect(output).toContain('cooldownAfterDealStopInterval');
  });

  test('flags a FieldVariableBinding whose path differs from the value it wraps', () => {
    const { code, output } = check(MISWIRED_BINDING_PATH);
    expect(code).toBe(1);
    expect(output).toContain('binding path/value disagree');
  });

  test('passes a correctly wired control', () => {
    const { code, output } = check(CORRECT);
    expect(code).toBe(0);
    expect(output).toContain('OK');
  });

  test('respects the form-binding-ignore suppression comment', () => {
    const suppressed = MISWIRED.replace(
      '    <NumberInput',
      '    {/* form-binding-ignore */}\n    <NumberInput'
    );
    expect(check(suppressed).code).toBe(0);
  });

  test('the real form tree is clean', () => {
    const { code, output } = run(path.join(repoRoot, 'src'));
    expect(code, output).toBe(0);
  });
});
