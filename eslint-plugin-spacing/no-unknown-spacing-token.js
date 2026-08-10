/**
 * Flag spacing utilities written with a token the stylesheet does not define.
 *
 * Tailwind emits nothing for a class it does not recognise — no build error,
 * no lint error, no runtime warning. `mb-huge` or `gap-base` therefore looks
 * fine in review and silently renders as zero spacing. That is exactly how
 * ~600 dead spacing classes accumulated in this codebase before they were
 * found; see the header of src/index.css.
 *
 * The scale is xs · sm · md · lg · xl (density-aware, defined via @utility in
 * src/index.css). Tailwind's own numeric scale, `auto`, `px`, arbitrary
 * values and CSS-var values stay legal.
 *
 * The companion check is scripts/verify-css-contract.mjs, which proves the
 * tokens listed here actually compile. This rule catches the author-side
 * mistake; that script catches the config-side one.
 */

const NAMED_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl'];

const FAMILIES = [
  'space-x', 'space-y',
  'gap-x', 'gap-y', 'gap',
  'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me', 'm',
  'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe', 'p',
];

// Values Tailwind resolves on its own — never our scale's business.
// A trailing `!` is Tailwind's importance modifier (`gap-0!`).
const BUILTIN_VALUE = /^(?:\d+(?:\.\d+)?|px|auto|full|screen|min|max|fit|reverse|\[[^\]]*\]|\((?:--)?[^)]*\))!?$/;

/** Helpers that take class strings as arguments. */
const CLASS_HELPERS = new Set([
  'cn', 'clsx', 'classnames', 'classNames', 'cx', 'twMerge', 'twJoin', 'cva',
]);

const FAMILY_ALT = FAMILIES.map((f) => f.replace('-', '\\-')).join('|');
// optional variants, optional negative, family, value
const CLASS_RE = new RegExp(
  `^(?:[A-Za-z0-9_@\\[\\]&>.,%#'"=+*/^$~-]+:)*-?(${FAMILY_ALT})-(.+)$`
);

/** Heuristic: only inspect strings that plausibly hold utility classes. */
const looksLikeClassList = (s) =>
  s.length < 800 && /^[\w\s:./[\]()@#%&>,'"=+*^$~!-]*$/.test(s);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow spacing utilities using a token outside the xs/sm/md/lg/xl scale',
    },
    schema: [],
    messages: {
      unknown:
        "'{{cls}}' uses the spacing token '{{token}}', which does not exist. " +
        'The scale is xs, sm, md, lg, xl (or a numeric/arbitrary Tailwind ' +
        'value). Tailwind emits no CSS and no warning for an unknown ' +
        'utility, so this would silently render as no spacing at all.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * Only strings that actually reach the DOM as classes are candidates.
     * Without this, ordinary data — localStorage keys like
     * 'mb-right-collapsed', test fixture ids like 'ms-range' — trip the rule.
     */
    const isClassPosition = (node) => {
      const ancestors = sourceCode.getAncestors
        ? sourceCode.getAncestors(node)
        : context.getAncestors();
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        if (
          a.type === 'JSXAttribute' &&
          a.name &&
          (a.name.name === 'className' || a.name.name === 'class')
        ) {
          return true;
        }
        if (
          a.type === 'CallExpression' &&
          ((a.callee.type === 'Identifier' && CLASS_HELPERS.has(a.callee.name)) ||
            (a.callee.type === 'MemberExpression' &&
              a.callee.property.type === 'Identifier' &&
              CLASS_HELPERS.has(a.callee.property.name)))
        ) {
          return true;
        }
        // Stop climbing at a function boundary — anything further out is not
        // lexically part of this class expression.
        if (
          a.type === 'FunctionDeclaration' ||
          a.type === 'FunctionExpression' ||
          a.type === 'ArrowFunctionExpression'
        ) {
          return false;
        }
      }
      return false;
    };

    const check = (node, raw) => {
      if (typeof raw !== 'string' || !raw.includes('-')) return;
      if (!looksLikeClassList(raw)) return;
      if (!isClassPosition(node)) return;

      for (const tok of raw.split(/\s+/)) {
        if (!tok) continue;
        const m = CLASS_RE.exec(tok);
        if (!m) continue;
        const [, , rawValue] = m;
        // A trailing `!` is Tailwind's importance modifier and applies to our
        // named tokens too (`space-y-sm!`).
        const value = rawValue.endsWith('!') ? rawValue.slice(0, -1) : rawValue;
        if (NAMED_TOKENS.includes(value)) continue;
        if (BUILTIN_VALUE.test(rawValue)) continue;
        // Ignore anything holding a template placeholder.
        if (value.includes('$') || value.includes('{')) continue;
        // A template literal splits `gap-[${n}px]` into the chunk `gap-[`;
        // an unbalanced bracket means we are looking at half a class.
        if (value.includes('[') && !value.endsWith(']')) continue;
        context.report({
          node,
          messageId: 'unknown',
          data: { cls: tok, token: value },
        });
      }
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
