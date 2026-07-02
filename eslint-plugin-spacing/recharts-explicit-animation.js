/**
 * ESLint Rule: recharts-explicit-animation
 *
 * Every recharts series element (<Area>, <Line>, <Bar>, <Pie>, <Radar>,
 * <RadialBar>, <Scatter>, <Funnel>) MUST set `isAnimationActive` explicitly —
 * default it to `isAnimationActive={false}`.
 *
 * Why: recharts' JavascriptAnimate (react-smooth) calls setState from its
 * unmount cleanup. A chart that unmounts mid-enter-animation (a batch of
 * bot/trade cards unmounting when deals close, a drawer performance tab
 * switching, etc.) trips React's nested-update limit — the minified production
 * error #185, "Maximum update depth exceeded". Forcing every series to opt in
 * or out of animation makes that crash class impossible to reintroduce by
 * omission. See core/src/components/trades/TradeCard.tsx for the canonical
 * context comment.
 *
 * Scope: the rule only fires in files that import from 'recharts', so a
 * non-recharts component that happens to share a name (a Lucide `<Radar>` icon,
 * a locally-defined `<Scatter>` component) is never false-flagged.
 *
 * This mirrors the esquery selector
 *   JSXOpeningElement[name.name=/^(Area|Line|Bar|Pie|Radar|RadialBar|Scatter|Funnel)$/]:not(:has(JSXAttribute[name.name="isAnimationActive"]))
 * but adds the recharts-import guard, which a plain no-restricted-syntax rule
 * cannot express.
 */

const SERIES = new Set([
  'Area',
  'Line',
  'Bar',
  'Pie',
  'Radar',
  'RadialBar',
  'Scatter',
  'Funnel',
]);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require recharts series to set isAnimationActive explicitly (avoids React #185 crash on mid-animation unmount)',
      category: 'Possible Errors',
      recommended: true,
    },
    messages: {
      missing:
        'recharts series <{{name}}> must set isAnimationActive explicitly (default it to false) — ' +
        "recharts' JavascriptAnimate setStates from its unmount cleanup, so charts unmounting " +
        'mid-animation crash React #185 (Maximum update depth exceeded). ' +
        'See core/src/components/trades/TradeCard.tsx for context.',
    },
    schema: [],
  },
  create(context) {
    let importsRecharts = false;

    return {
      ImportDeclaration(node) {
        if (node.source && node.source.value === 'recharts') {
          importsRecharts = true;
        }
      },
      JSXOpeningElement(node) {
        if (!importsRecharts) return;
        if (!node.name || node.name.type !== 'JSXIdentifier') return;
        if (!SERIES.has(node.name.name)) return;

        const hasProp = node.attributes.some(
          (attr) =>
            attr.type === 'JSXAttribute' &&
            attr.name &&
            attr.name.name === 'isAnimationActive'
        );
        if (hasProp) return;

        context.report({
          node,
          messageId: 'missing',
          data: { name: node.name.name },
        });
      },
    };
  },
};
