import { test, expect } from '@playwright/test';

import { INDICATOR_CATALOG } from '@/types/indicators/indicatorCatalog';
import { IndicatorEnum } from '@/types';

/**
 * Spec: specs/001.mcginley-dynamic-indicator.md §3
 *
 * INDICATOR_CATALOG is `Record<IndicatorEnum, IndicatorDefinition>` — a
 * missing entry is a compile error, not a runtime gap, so there's nothing
 * to assert about *presence*. What matters is the *shape*: per §3's
 * resolution, McGinley Dynamic must reuse only the generic
 * indicatorLength/indicatorInterval/indicatorCondition/indicatorValue
 * fields (mirroring ATR), not ma's bespoke maCrossingValue/maType fields —
 * app-sh has no handling for those on this indicator, so shipping them
 * here would silently produce settings app-sh never reads.
 *
 * (indicatorStudyConfig.ts's buildTradingViewStudyDescriptor — which
 * exercises STUDY_NAME_MAP + buildInputs() together — is not covered here:
 * that module transitively imports src/lib/loggerInstance.ts, which reads
 * import.meta.env.MODE and throws outside a real Vite context; confirmed
 * this is a pre-existing gap in this repo's Playwright unit-test harness,
 * not something introduced by this change, by reproducing the identical
 * failure importing that module for an existing indicator, IndicatorEnum.atr.)
 */
test.describe('INDICATOR_CATALOG[IndicatorEnum.mg]', () => {
  test('reuses generic threshold fields only, no ma-style bespoke fields', () => {
    const entry = INDICATOR_CATALOG[IndicatorEnum.mg];
    const keys = entry.fields.map((f) => f.key);
    expect(keys).toContain('indicatorLength');
    expect(keys).toContain('indicatorInterval');
    expect(keys).toContain('indicatorCondition');
    expect(keys).toContain('indicatorValue');
    expect(keys).not.toContain('maCrossingValue');
    expect(keys).not.toContain('maType');
  });
});
