// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { IndicatorConfigurationModal } from '@/components/indicators/IndicatorConfigurationModal';
import { IndicatorAction, IndicatorEnum } from '@/types';
import {
  getIndicatorDefaultParams,
  getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';

/**
 * Divergences "Oscillators" is a multi-choice field (legacy: an Autocomplete
 * over `defDivergenceOscillators`, value `i.divOscillators ?? []`). With a
 * single-choice dropdown "Min number of divergences" (default 2) could never
 * be met. The 9 default oscillators stay the default; OBV and CMF are opt-in.
 */

const DEFAULT_NINE = [
  IndicatorEnum.ao,
  IndicatorEnum.cci,
  IndicatorEnum.macd,
  IndicatorEnum.mfi,
  IndicatorEnum.mom,
  IndicatorEnum.rsi,
  IndicatorEnum.stoch,
  IndicatorEnum.uo,
  IndicatorEnum.wr,
];

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(cleanup);

const divDefinition = () => getIndicatorDefinition(IndicatorEnum.div);

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no element #${id}`);
  return el;
};

const checkbox = (value: string) => byId(`divOscillators-${value}`);

// The params the last onChange/onSubmit call carried.
const lastParams = (fn: ReturnType<typeof vi.fn>): IndicatorParamsState => {
  const call = fn.mock.calls.at(-1);
  if (!call) throw new Error('never called');
  return call[0] as IndicatorParamsState;
};

const checkedValues = () =>
  [...document.querySelectorAll('[id^="divOscillators-"]')]
    .filter((el) => el.getAttribute('data-state') === 'checked')
    .map((el) => el.id.replace('divOscillators-', ''));

const renderInline = (params: IndicatorParamsState) => {
  const onChange = vi.fn();
  render(
    <InlineIndicatorConfig
      definition={divDefinition()}
      params={params}
      onChange={onChange}
    />
  );
  return onChange;
};

describe('Divergences oscillators field', () => {
  test('the catalog marks it multi-choice and defaults to the 9 oscillators', () => {
    const field = divDefinition().fields.find((f) => f.key === 'divOscillators');
    expect(field?.multiple).toBe(true);
    const defaults = getIndicatorDefaultParams(IndicatorEnum.div);
    expect([...(defaults['divOscillators'] as string[])].sort()).toEqual(
      [...DEFAULT_NINE].sort()
    );
  });

  test('inline: a new Divergence shows all 9 ticked, OBV and CMF unticked', () => {
    renderInline(getIndicatorDefaultParams(IndicatorEnum.div));
    expect(checkbox(IndicatorEnum.obv).getAttribute('data-state')).toBe('unchecked');
    expect(checkedValues().sort()).toEqual([...DEFAULT_NINE].sort());
  });

  test('inline: ticking adds, unticking removes, and the value stays an array of strings', () => {
    const params = getIndicatorDefaultParams(IndicatorEnum.div);
    const onChange = renderInline(params);

    fireEvent.click(checkbox(IndicatorEnum.cmf));
    const added = lastParams(onChange).divOscillators;
    expect(Array.isArray(added)).toBe(true);
    expect(added).toHaveLength(10);
    expect(added).toContain(IndicatorEnum.cmf);
    expect(added.every((v: unknown) => typeof v === 'string')).toBe(true);

    fireEvent.click(checkbox(IndicatorEnum.rsi));
    const removed = lastParams(onChange).divOscillators;
    expect(removed).toHaveLength(8);
    expect(removed).not.toContain(IndicatorEnum.rsi);
    expect(removed.every((v: unknown) => typeof v === 'string')).toBe(true);
  });

  test('inline: a bare string left by the old dropdown loads as a one-item array', () => {
    const params = {
      ...getIndicatorDefaultParams(IndicatorEnum.div),
      divOscillators: IndicatorEnum.rsi,
    } as unknown as IndicatorParamsState;
    const onChange = renderInline(params);
    expect(checkedValues()).toEqual([IndicatorEnum.rsi]);

    fireEvent.click(checkbox(IndicatorEnum.macd));
    const next = lastParams(onChange).divOscillators;
    expect([...next].sort()).toEqual([IndicatorEnum.macd, IndicatorEnum.rsi].sort());
  });

  test('dialog: ticking an oscillator saves an array of strings', () => {
    const onSubmit = vi.fn();
    render(
      <MemoryRouter>
        <IndicatorConfigurationModal
          open
          onOpenChange={() => undefined}
          definition={divDefinition()}
          initialParams={getIndicatorDefaultParams(IndicatorEnum.div)}
          onSubmit={onSubmit}
          action={IndicatorAction.startDeal}
        />
      </MemoryRouter>
    );
    expect(checkedValues().sort()).toEqual([...DEFAULT_NINE].sort());
    fireEvent.click(checkbox(IndicatorEnum.obv));
    fireEvent.click(checkbox(IndicatorEnum.ao));
    fireEvent.click(screen.getByRole('button', { name: 'Save indicator' }));
    const saved = lastParams(onSubmit).divOscillators;
    expect([...saved].sort()).toEqual(
      [...DEFAULT_NINE.filter((v) => v !== IndicatorEnum.ao), IndicatorEnum.obv].sort()
    );
  });
});

describe('Session Days (numeric multi-choice) is unchanged', () => {
  test('keeps saving numbers in day order', () => {
    const def = getIndicatorDefinition(IndicatorEnum.session);
    const onChange = vi.fn();
    render(
      <InlineIndicatorConfig
        definition={def}
        params={getIndicatorDefaultParams(IndicatorEnum.session)}
        onChange={onChange}
      />
    );
    const sun = byId('sessionDays-0');
    expect(byId("sessionDays-1").getAttribute("data-state")).toBe("checked");
    fireEvent.click(sun);
    expect(lastParams(onChange).sessionDays).toEqual([0, 1, 2, 3, 4, 5]);
    fireEvent.click(byId('sessionDays-3'));
    expect(lastParams(onChange).sessionDays).toEqual([1, 2, 4, 5]);
    expect(within(document.body).getByText('Sun')).toBeTruthy();
  });
});
