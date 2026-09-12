/**
 * Runner note: this file renders a React component in jsdom, so it is a Vitest
 * file (`*.vitest.test.tsx`), not one of core's Playwright `.unit.test.ts`
 * pure-function tests. Run from the parent, and with `NODE_ENV=development` —
 * a production React build has no `React.act`:
 * `NODE_ENV=development npx vitest run core/tests/bug754QuickInvestmentField.vitest.test.tsx`
 */

/**
 * Spec: `main-dash-redesign/specs/015.quick-investment-field-overwrites-what-you-type.md`.
 *
 * `BalanceInput` keeps the typed text in a draft and re-derives that draft
 * from the `value` prop in an effect. The effect was frozen only in
 * `commitOn='blur'` mode, so in the per-keystroke mode every bot-form funds
 * field uses, the number the consumer derived from a keystroke was written
 * over the text that keystroke was part of: on Quick setup's Investment field,
 * typing `1` left `1.01` in the box and the next character landed on that.
 *
 * The hosts below are wired exactly like the real consumers (§4.4) — the
 * committed value goes into state and comes back as the `value` prop, which is
 * the only way the draft sync can fire at all.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// jsdom has no ResizeObserver; BalanceInput measures its adornment with one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useBotFormSelector: () => undefined,
  useOptionalBotFormState: () => undefined,
}));

import { BalanceInput } from '@/components/ui/balance-input';
import {
  computeInvestmentFromDca,
  distributeInvestmentToDca,
  getQuickSetupPreset,
  type QuickSetupDcaLike,
} from '@/features/bots/widgets/BotForm/components/quickSetupPresets';

const MID_TERM = getQuickSetupPreset('mid-term');
if (!MID_TERM) throw new Error('the mid-term quick-setup preset is gone');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = () => container.querySelector('input') as HTMLInputElement;

const nativeValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set as (this: HTMLInputElement, value: string) => void;

const nativeSetValue = (el: HTMLInputElement, value: string) => {
  nativeValueSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

/** One keystroke, appended where the caret sits in a `type=number` box: the end. */
const typeChar = (char: string) => {
  act(() => {
    const el = field();
    nativeSetValue(el, `${el.value}${char}`);
  });
};

// React 17+ delegates onFocus/onBlur to `focusin`/`focusout` at the root, so a
// bare `focus` event reaches nothing — the freeze under test would never
// engage and the assertions would pass for the wrong reason.
const focusField = () =>
  act(() => {
    field().focus();
    field().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
const blurField = () =>
  act(() => {
    field().blur();
    field().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

const clearField = () => act(() => nativeSetValue(field(), ''));

/**
 * Quick setup's Investment row: the value is not stored, it is recomputed from
 * the per-order sizes the typed figure was distributed into.
 */
const QuickInvestmentHost: React.FC = () => {
  const [sizes, setSizes] = React.useState({
    baseOrderSize: '0',
    orderSize: '0',
  });
  const dca = {
    ordersCount: MID_TERM.values.ordersCount,
    volumeScale: MID_TERM.values.volumeScale,
    ...sizes,
  } as unknown as QuickSetupDcaLike;
  return (
    <BalanceInput
      value={computeInvestmentFromDca(dca)}
      onChange={(raw) => {
        const safe = Number.isFinite(raw) && raw >= 0 ? raw : 0;
        setSizes(distributeInvestmentToDca(safe, dca, 2));
      }}
      availableBalance={250000}
      precision={2}
      currency="USDT"
      unitLabel="USDT"
    />
  );
};

/** GridBudgetSettings / AdjustFundsDialog: the committed number goes straight back. */
const PassThroughHost: React.FC = () => {
  const [value, setValue] = React.useState(0);
  return (
    <BalanceInput
      value={value}
      onChange={(raw) => setValue(Math.round(raw * 100) / 100)}
      availableBalance={250000}
      precision={2}
      currency="USDT"
      unitLabel="USDT"
    />
  );
};

/** DcaOrderSizingControl in percentage mode: the consumer clamps to 0..100. */
const ClampingHost: React.FC = () => {
  const [value, setValue] = React.useState(0);
  return (
    <BalanceInput
      value={value}
      onChange={(raw) => setValue(Math.min(100, Math.max(0, raw)))}
      availableBalance={100}
      min={0}
      max={100}
      precision={2}
      currency="%"
      unitLabel="%"
    />
  );
};

describe('Quick setup Investment field (§4.1, §4.2)', () => {
  it("the reporter's keystrokes: typing 1 then 0 leaves 10", () => {
    act(() => root.render(<QuickInvestmentHost />));
    focusField();
    clearField();

    typeChar('1');
    expect(field().value, 'the first keystroke was rewritten').toBe('1');

    typeChar('0');
    expect(field().value).toBe('10');

    blurField();
    expect(field().value, 'the settled total is not what was typed').toBe('10');
  });

  it('a longer figure survives character by character', () => {
    act(() => root.render(<QuickInvestmentHost />));
    focusField();
    clearField();
    for (const char of '1234') {
      typeChar(char);
    }
    expect(field().value).toBe('1234');
    blurField();
    expect(field().value).toBe('1234');
  });

  // Typed one character at a time this would read `1234.` mid-way, and a
  // `type=number` box reports an empty `value` for that (the HTML
  // value-sanitization algorithm), so the fractional case is entered whole —
  // a paste — rather than faking a caret position jsdom does not model.
  it('a fractional total is not re-quantized', () => {
    act(() => root.render(<QuickInvestmentHost />));
    focusField();
    act(() => nativeSetValue(field(), '1234.56'));
    expect(field().value).toBe('1234.56');
    blurField();
    expect(field().value).toBe('1234.56');
  });

  // The one figure between 10 and 2000 whose Mid-term ladder still cannot be
  // completed to the typed total by a 2-decimal base order (spec §5.2). It is
  // the case that proves the draft is genuinely frozen: without the freeze the
  // last keystroke rewrites the box to the re-derived `1126.01`, and anything
  // typed after that lands on a number the user never entered.
  it('a figure the ladder cannot represent is still typeable', () => {
    act(() => root.render(<QuickInvestmentHost />));
    focusField();
    clearField();
    for (const char of '1126') {
      typeChar(char);
    }
    expect(field().value, 'the draft was rewritten mid-edit').toBe('1126');
    typeChar('0');
    expect(field().value, 'the next keystroke landed on a rewritten value').toBe(
      '11260'
    );
  });

  it('the settled total is honest once the edit ends', () => {
    act(() => root.render(<QuickInvestmentHost />));
    focusField();
    clearField();
    for (const char of '1126') {
      typeChar(char);
    }
    blurField();
    // §5.2: one cent, because no 2-decimal base order completes this ladder to
    // exactly 1126. It was 1126.45 before.
    expect(field().value).toBe('1126.01');
  });

  it('still commits per keystroke (the consumer sees every character)', () => {
    const seen: number[] = [];
    const Host: React.FC = () => {
      const [sizes, setSizes] = React.useState({
        baseOrderSize: '0',
        orderSize: '0',
      });
      const dca = {
        ordersCount: MID_TERM.values.ordersCount,
        volumeScale: MID_TERM.values.volumeScale,
        ...sizes,
      } as unknown as QuickSetupDcaLike;
      return (
        <BalanceInput
          value={computeInvestmentFromDca(dca)}
          onChange={(raw) => {
            seen.push(raw);
            setSizes(distributeInvestmentToDca(raw, dca, 2));
          }}
          availableBalance={250000}
          precision={2}
        />
      );
    };
    act(() => root.render(<Host />));
    focusField();
    clearField();
    typeChar('1');
    typeChar('0');
    expect(seen).toEqual([0, 1, 10]);
  });
});

describe('the other commit-on-change consumers (§4.4)', () => {
  it('a pass-through consumer still shows what was typed', () => {
    act(() => root.render(<PassThroughHost />));
    focusField();
    clearField();
    for (const char of '105') {
      typeChar(char);
    }
    expect(field().value).toBe('105');
    blurField();
    expect(field().value).toBe('105');
  });

  it('a clamping consumer still clamps — on blur, not mid-keystroke', () => {
    act(() => root.render(<ClampingHost />));
    focusField();
    clearField();
    for (const char of '150') {
      typeChar(char);
    }
    expect(field().value, 'the draft is the user text while focused').toBe(
      '150'
    );
    blurField();
    expect(field().value, 'the clamp lands when the edit ends').toBe('100');
  });

  it('the percentage buttons still fill the field while it has focus', () => {
    act(() => root.render(<PassThroughHost />));
    focusField();
    clearField();
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '25%'
    );
    expect(button).toBeTruthy();
    act(() =>
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    );
    expect(Number(field().value)).toBeCloseTo(62500, 6);
  });

  it('an external value change still reaches a field nobody is editing', () => {
    const Host: React.FC<{ value: number }> = ({ value }) => (
      <BalanceInput value={value} precision={2} availableBalance={1000} />
    );
    act(() => root.render(<Host value={12} />));
    expect(field().value).toBe('12');
    act(() => root.render(<Host value={34.5} />));
    expect(field().value).toBe('34.5');
  });
});
