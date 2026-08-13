#!/usr/bin/env node
/**
 * verify-form-bindings — static check for miswired bot-form controls.
 *
 * A controlled input in the bot form reads its value from one form field and
 * writes to another:
 *
 *   const cooldownAfterDealStopInterval = useBotFormSelector(
 *     'cooldownAfterDealStartInterval'   // <- reads the WRONG field
 *   );
 *   ...
 *   <NumberInput
 *     value={cooldownAfterDealStopInterval || ''}
 *     onChange={(v) => handleNumericStringChange('cooldownAfterDealStopInterval', v)}
 *   />
 *
 * The user types 300, the store gets 300, but the input re-renders showing the
 * *other* field — so the value appears to snap back. Typecheck can't see it
 * (both fields are numbers) and lint can't see it (the code is valid).
 *
 * This script pairs every JSX element that has BOTH a value-ish prop and a
 * change handler, resolves the form path on each side, and fails when they
 * disagree. It also checks the `path=` prop of a wrapping FieldVariableBinding,
 * which names the field a third time.
 *
 * Suppress a deliberate mismatch with `// form-binding-ignore` on the element's
 * opening line or the line above it.
 *
 * Usage: node scripts/verify-form-bindings.mjs [--json] [dir ...]
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const VALUE_PROPS = new Set(['value', 'checked', 'defaultValue', 'selected']);
const HANDLER_PROPS = new Set([
  'onChange',
  'onValueChange',
  'onCheckedChange',
  'onSelect',
  'onValueCommit',
]);
const SUPPRESS = 'form-binding-ignore';
const FIELD_RE = /^[a-z][A-Za-z0-9]*$/;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const roots = args.filter((a) => !a.startsWith('--'));
const searchRoots = roots.length ? roots : ['src'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

// NOTE: ts.forEachChild aborts as soon as the callback returns something
// truthy. Every recursive walker below therefore returns undefined from the
// callback — returning the accumulator would stop the walk at the first child.

/** Strip wrappers so `x || ''`, `String(x)`, `x ?? 0` still yield `x`. */
function collectIdentifiers(node, out = new Set()) {
  if (ts.isIdentifier(node)) {
    out.add(node.text);
    return out;
  }
  node.forEachChild((child) => {
    collectIdentifiers(child, out);
  });
  return out;
}

/** Every `foo('literal', ...)` inside a handler body. */
function collectWriteLiterals(node, out = new Set()) {
  if (ts.isCallExpression(node)) {
    const first = node.arguments[0];
    if (first && ts.isStringLiteral(first) && FIELD_RE.test(first.text)) {
      out.add(first.text);
    }
  }
  node.forEachChild((child) => {
    collectWriteLiterals(child, out);
  });
  return out;
}

function analyze(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = text.split('\n');

  // identifier -> form path, for `const x = useBotFormSelector('path')`
  const selectorOf = new Map();
  // identifier -> initializer node, for one-hop derived values
  const derivedFrom = new Map();

  const indexDeclarations = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === 'useBotFormSelector' &&
        init.arguments[0] &&
        ts.isStringLiteral(init.arguments[0])
      ) {
        selectorOf.set(node.name.text, init.arguments[0].text);
      } else {
        derivedFrom.set(node.name.text, init);
      }
    }
    node.forEachChild(indexDeclarations);
  };
  indexDeclarations(sf);

  /** Resolve an expression to the set of form paths it reads, following one hop. */
  const resolveReadPaths = (expr, depth = 0) => {
    const paths = new Set();
    for (const id of collectIdentifiers(expr)) {
      if (selectorOf.has(id)) {
        paths.add(selectorOf.get(id));
      } else if (depth < 2 && derivedFrom.has(id)) {
        for (const p of resolveReadPaths(derivedFrom.get(id), depth + 1)) paths.add(p);
      }
    }
    return paths;
  };

  const findings = [];

  const visit = (node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null;

    if (opening) {
      let valueExpr = null;
      let handlerExpr = null;

      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop) || !prop.name || !ts.isIdentifier(prop.name)) continue;
        const name = prop.name.text;
        const init = prop.initializer;
        if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
        if (VALUE_PROPS.has(name)) valueExpr = init.expression;
        else if (HANDLER_PROPS.has(name)) handlerExpr = init.expression;
      }

      if (valueExpr && handlerExpr) {
        const line = sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line;
        const nearby = [lines[line] ?? '', lines[line - 1] ?? ''].join('\n');
        if (!nearby.includes(SUPPRESS)) {
          const readPaths = resolveReadPaths(valueExpr);
          const writePaths = collectWriteLiterals(handlerExpr);

          // Only judge the unambiguous case: exactly one field on each side.
          if (readPaths.size === 1 && writePaths.size === 1) {
            const read = [...readPaths][0];
            const write = [...writePaths][0];
            if (read !== write) {
              findings.push({
                file,
                line: line + 1,
                element: opening.tagName.getText(sf),
                read,
                write,
                kind: 'value/onChange disagree',
              });
            }
          }
        }
      }
    }

    // <FieldVariableBinding path="X"> should name the same field its child binds.
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === 'FieldVariableBinding') {
      const pathAttr = node.openingElement.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name && ts.isIdentifier(p.name) && p.name.text === 'path'
      );
      if (pathAttr && pathAttr.initializer && ts.isStringLiteral(pathAttr.initializer)) {
        const declared = pathAttr.initializer.text;
        const childReads = new Set();
        const scanChildren = (n) => {
          const open = ts.isJsxSelfClosingElement(n)
            ? n
            : ts.isJsxElement(n)
              ? n.openingElement
              : null;
          if (open) {
            for (const prop of open.attributes.properties) {
              if (!ts.isJsxAttribute(prop) || !prop.name || !ts.isIdentifier(prop.name)) continue;
              if (!VALUE_PROPS.has(prop.name.text)) continue;
              const init = prop.initializer;
              if (init && ts.isJsxExpression(init) && init.expression) {
                for (const p of resolveReadPaths(init.expression)) childReads.add(p);
              }
            }
          }
          n.forEachChild(scanChildren);
        };
        node.children.forEach(scanChildren);

        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        const nearby = [lines[line] ?? '', lines[line - 1] ?? ''].join('\n');
        if (!nearby.includes(SUPPRESS) && childReads.size === 1) {
          const read = [...childReads][0];
          if (read !== declared) {
            findings.push({
              file,
              line: line + 1,
              element: 'FieldVariableBinding',
              read,
              write: declared,
              kind: 'binding path/value disagree',
            });
          }
        }
      }
    }

    node.forEachChild(visit);
  };
  visit(sf);

  return findings;
}

const files = searchRoots.flatMap((r) => walk(r));
const findings = files.flatMap((f) => analyze(f));

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else if (findings.length === 0) {
  console.log(`form-bindings: OK (${files.length} files scanned)`);
} else {
  console.error(`form-bindings: ${findings.length} miswired control(s)\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  <${f.element}>`);
    console.error(`    ${f.kind}: reads "${f.read}" but writes "${f.write}"\n`);
  }
  console.error('If a mismatch is intentional, add `// form-binding-ignore` above the element.');
}

process.exit(findings.length === 0 ? 0 : 1);
