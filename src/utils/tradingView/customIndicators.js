const colorRipeRedA200 = '#FF5252';
const colorMintyGreen400 = '#22AB94';
const colorMintyGreen100 = '#ACE5DC';
const colorRipeRed100 = '#FCCBCD';
const percentileColor = '#ff1100';
const divRed = '#FF5252';
const divTeal = '#00897B';
const divGreen = '#4CAF50';
const divOrange = '#FF9800';

const percentileRank = (data, lookback, percentage, r) => {
  if (!data.get(lookback)) {
    return r.Std.na();
  }
  let values = [];
  for (let i = 0; i < lookback; i++) {
    const v = data.get(i);
    if (v) {
      values.push(v);
    }
  }
  values = values.sort((a, b) => a - b);
  const index = Math.round((percentage / 100) * lookback) - 1;
  return values.splice(index, 1)[0];
};

const percentileInputs = [
  {
    id: 'usePercentile',
    name: 'Use Percentile',
    defval: true,
    type: 'bool',
  },
  {
    id: 'percentileLookback',
    name: 'Percentile Lookback',
    defval: 150,
    type: 'integer',
    min: 1,
    max: 1e3,
  },
  {
    id: 'percentilePercentage',
    name: 'Percentile Percentage',
    defval: 50,
    type: 'integer',
    min: 1,
    max: 100,
  },
];

const percentileDefaultInputs = {
  usePercentile: false,
  percentileLookback: '150',
  percentilePercentage: '50',
};

const percentileDefaultStyles = {
  plot_percentile: {
    linestyle: 0,
    linewidth: 1,
    plottype: 6,
    trackPrice: !1,
    transparency: 0,
    visible: !1,
    color: percentileColor,
  },
  plot_percentile_top: {
    linestyle: 0,
    linewidth: 1,
    plottype: 0,
    trackPrice: !1,
    transparency: 90,
    visible: !1,
    color: percentileColor,
  },
  plot_percentile_bottom: {
    linestyle: 0,
    linewidth: 1,
    plottype: 0,
    trackPrice: !1,
    transparency: 90,
    visible: !1,
    color: percentileColor,
  },
};

const percentilPlot = [
  {
    id: 'plot_percentile',
    type: 'line',
  },
  {
    id: 'plot_percentile_top',
    type: 'line',
  },
  {
    id: 'plot_percentile_bottom',
    type: 'line',
  },
];

const percentileStyle = {
  plot_percentile: {
    title: 'Percentile',
    histogramBase: 0,
    joinPoints: !1,
  },
  plot_percentile_top: {
    title: 'Percentile Top',
    histogramBase: 0,
    joinPoints: !1,
  },
  plot_percentile_bottom: {
    title: 'Percentile Bottom',
    histogramBase: 0,
    joinPoints: !1,
  },
};

const percentileFillStyle = {
  fill_percentile_top: {
    color: percentileColor,
    transparency: 90,
    visible: !1,
  },
  fill_percentile_bottom: {
    color: percentileColor,
    transparency: 90,
    visible: !1,
  },
};

const percentileFillAreas = [
  {
    id: 'fill_percentile_top',
    objAId: 'plot_percentile',
    objBId: 'plot_percentile_top',
    type: 'plot_plot',
    title: 'Percentile Top Fill',
  },
  {
    id: 'fill_percentile_bottom',
    objAId: 'plot_percentile',
    objBId: 'plot_percentile_bottom',
    type: 'plot_plot',
    title: 'Percentile Bottom Fill',
  },
];

const percentileLow = 0;
const percentileHigh = 100;

// The two percentile fills anchor to `plot_percentile_top` / `plot_percentile_bottom`.
// For a study whose own domain IS 0-100 (RSI, MFI, UO, ADX) the literal constants
// above are the right reference bounds. For an unbounded or small-domain study
// (MOM, MACD, AO, BBW, BBPB, KCPB, VO, MAR) they are not: plotting 0 and 100
// alongside e.g. a ~1e-4 momentum series drags the pane's autoscale out to 0…100
// and squashes the study into a flat line at the bottom — that is the ETH-renders-
// fine / PUMP-renders-flat split in bug #537 (and bug #264 for MAR). Anchor the
// band to the extremes the study itself actually printed over the lookback window
// so it always stays inside the study's own range.
const percentileBand = (usePercentile, data, lookback, r, context) =>
  usePercentile
    ? [
        r.Std.highest(data, lookback, context),
        r.Std.lowest(data, lookback, context),
      ]
    : [r.Std.na(), r.Std.na()];

const stochCalc = (i, s, n, r, context) => {
  const o = r.Std.close(context);
  const a = r.Std.high(context);
  const l = r.Std.low(context);
  const c = context.new_var(o);
  const h = context.new_var(a);
  const d = context.new_var(l);
  const u = r.Std.stoch(c, h, d, i, context);
  const p = context.new_var(u);
  const _ = r.Std.sma(p, s, context);
  const m = context.new_var(_);
  return [_, r.Std.sma(m, n, context)];
};

const mfiCalc = (r, context, length) => {
  const f_1 = (e, t, i) => {
    return e * (r.Std.ge(t, 0) ? 0 : i);
  };
  const f_0 = (e, t, i) => {
    return e * (r.Std.le(t, 0) ? 0 : i);
  };
  const s = r.Std.hlc3(context);
  const n = context.new_var(s);
  const o = r.Std.change(n);
  const a = f_0(r.Std.volume(context), o, s);
  const l = context.new_var(a);
  const c = r.Std.sum(l, length, context);
  const h = f_1(r.Std.volume(context), o, s);
  const d = context.new_var(h);
  const u = r.Std.sum(d, length, context);
  const mfi = r.Std.rsi(c, u);
  return mfi;
};
const adxCalc = (r, context, diLength, length) => {
  const f_0 = (e) => {
    const t = context.new_var(r.Std.high(context));
    const i = r.Std.change(t);
    const s = context.new_var(r.Std.low(context));
    const n = -r.Std.change(s);
    const o = context.new_var(r.Std.tr(undefined, context));
    const a = r.Std.rma(o, e, context);
    const l = context.new_var(
      r.Std.and(r.Std.gt(i, n), r.Std.gt(i, 0)) ? i : 0
    );
    const c = r.Std.fixnan((100 * r.Std.rma(l, e, context)) / a, context);
    const h = context.new_var(
      r.Std.and(r.Std.gt(n, i), r.Std.gt(n, 0)) ? n : 0
    );
    return [c, r.Std.fixnan((100 * r.Std.rma(h, e, context)) / a, context)];
  };
  const i = f_0(diLength);
  const s = i[0];
  const n = i[1];
  const o = s + n;
  const a = context.new_var(r.Std.abs(s - n) / (r.Std.eq(o, 0) ? 1 : o));
  return [100 * r.Std.rma(a, length, context)];
};
const bbwCalc = (r, context, maType, maLength, bbwLength, bbwMult) => {
  const f_0 = (e, t) => {
    return e * t;
  };
  const f_1 = (e, t) => {
    return e + t;
  };
  const f_2 = (e, t) => {
    return e - t;
  };
  const f_3 = (e, t, i) => {
    return (e - t) / i;
  };
  const close = r.Std.close(context);
  const closeVar = context.new_var(close);
  const ma = getMarValue(maType, r, closeVar, maLength, context);
  const stdev = r.Std.stdev(closeVar, bbwLength, context);
  const h = f_0(bbwMult, stdev);
  const d = f_1(ma, h);
  const u = f_2(ma, h);
  const bbw = f_3(d, u, ma);
  return bbw;
};
const macdCalc = (
  r,
  context,
  fastLength,
  slowLength,
  signalLength,
  maSource,
  maSignal,
  source
) => {
  const f_0 = (e, t) => {
    return e - t;
  };
  const i = r.Std[source](context);
  const a = context.new_var(i);
  const l = getMarValue(maSource, r, a, fastLength, context);
  const c = context.new_var(i);
  const h = getMarValue(maSource, r, c, slowLength, context);
  const d = f_0(l, h);
  const u = context.new_var(d);
  const p = getMarValue(maSignal, r, u, signalLength, context);
  const _ = f_0(d, p);
  const macd = _;
  return [macd, d, p];
};
const rsiCalc = (r, context, length) => {
  const f_0 = (e) => {
    return r.Std.max(e, 0);
  };
  const f_1 = (e) => {
    return -r.Std.min(e, 0);
  };
  const f_2 = (e, t) => {
    return r.Std.eq(e, 0) ? 100 : r.Std.eq(t, 0) ? 0 : 100 - 100 / (1 + t / e);
  };
  const i = r.Std.close(context);
  const l = context.new_var(i);
  const c = r.Std.change(l);
  const h = f_0(c);
  const d = context.new_var(h);
  const u = r.Std.rma(d, length, context);
  const p = f_1(c);
  const _ = context.new_var(p);
  const m = r.Std.rma(_, length, context);
  const g = f_2(m, u);
  return g;
};
const voCalc = (r, context, shortLength, longLength) => {
  const f_0 = (e, t) => {
    return (100 * (e - t)) / t;
  };
  const n = r.Std.volume(context);
  const o = context.new_var(n);
  const a = r.Std.ema(o, shortLength, context);
  const l = context.new_var(n);
  const c = r.Std.ema(l, longLength, context);
  const vo = f_0(a, c);
  return vo;
};
const cciCalc = (r, context, length, source = 'hlc3') => {
  const price = r.Std[source](context);
  const f_0 = (e, t, i) => {
    return (e - t) / (0.015 * i);
  };
  const l = context.new_var(price);
  const c = r.Std.sma(l, length, context);
  const h = context.new_var(price);
  const d = r.Std.dev(h, length, context);
  const u = f_0(price, c, d);
  const p = context.new_var(u);
  return [p, u];
};
const aoCalc = (r, context) => {
  const f_0 = (e, t) => {
    return e - t;
  };
  const i = r.Std.hl2(context);
  const s = context.new_var(i);
  const n = r.Std.sma(s, 5, context);
  const o = context.new_var(i);
  const a = r.Std.sma(o, 34, context);
  const l = f_0(n, a);
  return l;
};
const wrCalc = (r, context, length) => {
  const f_0 = (e, t, i) => {
    return (100 * (e - t)) / (t - i);
  };
  const s = r.Std.high(context);
  const n = context.new_var(s);
  const o = r.Std.highest(n, length, context);
  const a = r.Std.low(context);
  const l = context.new_var(a);
  const c = r.Std.lowest(l, length, context);
  const wr = f_0(r.Std.close(context), o, c);
  return wr;
};
const uoCalc = (r, context, shortLength, mediumLength, longLength) => {
  const f_0 = (e, t, i) => {
    const s = context.new_var(e);
    const n = context.new_var(t);
    return [r.Std.sum(s, i, context) / r.Std.sum(n, i, context)];
  };
  const f_1 = () => {
    const e = shortLength;
    const t = mediumLength;
    const i = longLength;
    const s = context.new_var(r.Std.close(context));
    const n = r.Std.max(r.Std.high(context), s.get(1));
    const o = context.new_var(r.Std.close(context));
    const a = r.Std.min(r.Std.low(context), o.get(1));
    const l = r.Std.close(context) - a;
    const c = n - a;
    const h = f_0(l, c, e);
    const d = f_0(l, c, t);
    const u = f_0(l, c, i);
    return [(100 * (4 * h[0] + 2 * d[0] + u[0])) / 7];
  };
  return f_1()[0];
};
const momCalc = (r, context, length, source) => {
  const s = r.Std[source](context);
  const n = context.new_var(s).get(length);
  const mom = n ? s - n : null;
  return mom;
};
const valuewhen = (context, r, bool, val, count, valuewhenVar) => {
  if (!context.symbol.isBarClosed) {
    return r.Std.na();
  }
  const b = valuewhenVar ?? context.new_var();
  if (bool) {
    b.set(val);
  }

  return b.get(b.modified ? count : count + 1);
};
const _p_pivotHigh = (r, maxLen, ph) => {
  let offset = 0;
  while (offset < maxLen) {
    if (!r.Std.na(ph.get(offset))) {
      break;
    }
    offset++;
  }
  return ph.get(offset);
};
const _p_pivotLow = (r, maxLen, pl) => {
  let offset = 0;
  while (offset < maxLen) {
    if (!r.Std.na(pl.get(offset))) {
      break;
    }
    offset++;
  }
  return pl.get(offset);
};
const priorPivot = (
  r,
  context,
  highLeftBars,
  highRightBars,
  lowLeftBars,
  lowRightBars
) => {
  const maxLen = 1000;
  const h = r.Std.high(context);
  const high = context.new_var(h);
  const l = r.Std.low(context);
  const low = context.new_var(l);
  const _ph = pivotHigh(high, highLeftBars, highRightBars, r);
  const ph = context.new_var(_ph);
  ph.get(maxLen);
  const _pl = pivotLow(low, lowLeftBars, lowRightBars, r);
  const pl = context.new_var(_pl);
  pl.get(maxLen);
  const phRes = _p_pivotHigh(r, maxLen, ph);
  const plRes = _p_pivotLow(r, maxLen, pl);
  const hh1 = context.new_var();
  hh1.get(2);
  const hh2 = context.new_var();
  hh2.get(2);
  const hl1 = context.new_var();
  hl1.get(2);
  const hl2 = context.new_var();
  hl2.get(2);
  const lh1 = context.new_var();
  lh1.get(2);
  const lh2 = context.new_var();
  lh2.get(2);
  const ll1 = context.new_var();
  ll1.get(2);
  const ll2 = context.new_var();
  ll2.get(2);
  const hhValueWhen1 = valuewhen(
    context,
    r,
    !r.Std.na(_ph),
    high.get(highLeftBars),
    1,
    hh1
  );
  const hhValueWhen2 = valuewhen(
    context,
    r,
    !r.Std.na(_ph),
    high.get(highLeftBars),
    0,
    hh2
  );
  const hlValueWhen1 = valuewhen(
    context,
    r,
    !r.Std.na(_pl),
    low.get(lowLeftBars),
    1,
    hl1
  );
  const hlValueWhen2 = valuewhen(
    context,
    r,
    !r.Std.na(_pl),
    low.get(lowLeftBars),
    0,
    hl2
  );
  const lhValueWhen1 = valuewhen(
    context,
    r,
    !r.Std.na(_ph),
    high.get(highLeftBars),
    1,
    lh1
  );
  const lhValueWhen2 = valuewhen(
    context,
    r,
    !r.Std.na(_ph),
    high.get(highLeftBars),
    0,
    lh2
  );
  const llValueWhen1 = valuewhen(
    context,
    r,
    !r.Std.na(_pl),
    low.get(lowLeftBars),
    1,
    hl1
  );
  const llValueWhen2 = valuewhen(
    context,
    r,
    !r.Std.na(_pl),
    low.get(lowLeftBars),
    0,
    hl2
  );
  const hh = r.Std.na(_ph)
    ? r.Std.na()
    : hhValueWhen1 < hhValueWhen2
      ? _ph
      : r.Std.na();

  const hl = r.Std.na(_pl)
    ? r.Std.na()
    : hlValueWhen1 < hlValueWhen2
      ? _pl
      : r.Std.na();

  const lh = r.Std.na(_ph)
    ? r.Std.na()
    : lhValueWhen1 > lhValueWhen2
      ? _ph
      : r.Std.na();

  const ll = r.Std.na(_pl)
    ? r.Std.na()
    : llValueWhen1 > llValueWhen2
      ? _pl
      : r.Std.na();

  return [phRes, plRes, hh, hl, lh, ll];
};
const bbpbCalc = (r, context, maType, maLength, bbwLength, bbwMult) => {
  const f_0 = (e, t) => {
    return e * t;
  };
  const f_1 = (e, t) => {
    return e + t;
  };
  const f_2 = (e, t) => {
    return e - t;
  };
  const f_3 = (e, t, i) => {
    return (e - t) / (i - t);
  };
  const close = r.Std.close(context);
  const closeVar = context.new_var(close);
  const ma = getMarValue(maType, r, closeVar, maLength, context);
  const stdev = r.Std.stdev(closeVar, bbwLength, context);
  const h = f_0(bbwMult, stdev);
  const d = f_1(ma, h);
  const u = f_2(ma, h);
  const bbpb = f_3(close, u, d);
  return bbpb;
};
const kcCalc = (r, context, maType, length, mult, range, rangeLength) => {
  const close = r.Std.close(context);
  const closeVar = context.new_var(close);
  const high = r.Std.high(context);
  const low = r.Std.low(context);
  const highLowVar = context.new_var(high - low);
  const ma = getMarValue(maType, r, closeVar, length, context);
  const rangeMa =
    range === 'ATR'
      ? r.Std.atr(rangeLength, context)
      : range === 'TR'
        ? r.Std.tr(context)
        : getMarValue('RMA', r, highLowVar, length, context);
  const upper = ma + rangeMa * mult;
  const lower = ma - rangeMa * mult;
  return [ma, upper, lower];
};
const pivotHigh = (val, left, right, r) => {
  let _pivotHigh = r.Std.na();
  const range = left + right;
  const leftEdge = r.Std.nz(val.get(range), r.Std.na());
  if (!r.Std.na(val) && !r.Std.na(leftEdge)) {
    const possibleHigh = val.get(right);
    const arr = [];
    for (let i = range; i >= 0; i--) {
      arr.push(val.get(i));
    }
    const max = Math.max(...arr);
    const pivotHighRightBars = arr.length - arr.lastIndexOf(max) - 1;
    if (pivotHighRightBars === right) {
      _pivotHigh = possibleHigh;
    }
  }
  return _pivotHigh;
};
const pivotLow = (val, left, right, r) => {
  let _pivotLow = r.Std.na();
  const range = left + right;
  const leftEdge = r.Std.nz(val.get(range), r.Std.na());
  if (!r.Std.na(val) && !r.Std.na(leftEdge)) {
    const possibleLow = val.get(right);
    const arr = [];
    for (let i = range; i >= 0; i--) {
      arr.push(val.get(i));
    }
    const min = Math.min(...arr);
    const pivotHighRightBars = arr.length - arr.lastIndexOf(min) - 1;

    if (pivotHighRightBars === right) {
      _pivotLow = possibleLow;
    }
  }
  return _pivotLow;
};
const crossover = (r, val1, val2) => {
  const last1 = val1.get();
  const last2 = val2.get();
  const prev1 = val1.get(1);
  const prev2 = val2.get(1);
  return (
    !r.Std.na(prev1) &&
    !r.Std.na(prev2) &&
    !r.Std.na(last1) &&
    !r.Std.na(last2) &&
    r.Std.and(r.Std.lt(prev1, prev2), r.Std.gt(last1, last2))
  );
};
const crossunder = (r, val1, val2) => {
  const last1 = val1.get();
  const last2 = val2.get();
  const prev1 = val1.get(1);
  const prev2 = val2.get(1);
  return (
    !r.Std.na(prev1) &&
    !r.Std.na(prev2) &&
    !r.Std.na(last1) &&
    !r.Std.na(last2) &&
    r.Std.and(r.Std.gt(prev1, prev2), r.Std.lt(last1, last2))
  );
};

export const MFI = (r) => ({
  name: 'Money Flow Index (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 80,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 20,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 14,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'MFI',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Money Flow Index (Custom)',
    shortDescription: 'MFI',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      ...percentileInputs,
    ],
    id: 'Money Flow(Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Money Flow Index Custom',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const usePercentile = this._input(1);
      const percentileLookback = this._input(2);
      const percentilePercentage = this._input(3);
      this._context.setMinimumAdditionalDepth(i + percentileLookback);
      const mfi = mfiCalc(r, this._context, i);
      const mfiVar = this._context.new_var(mfi);
      const percentile = usePercentile
        ? percentileRank(mfiVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        mfi,
        percentile,
        usePercentile ? percentileHigh : r.Std.na(),
        usePercentile ? percentileLow : r.Std.na(),
      ];
    };
  },
});
export const ADX = (r) => ({
  name: 'Average Directional Index (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: colorRipeRedA200,
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 14,
        in_1: 14,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'ADX',
        histogramBase: 0,
        joinPoints: !1,
        isHidden: !1,
      },
      ...percentileStyle,
    },
    description: 'Average Directional Index (Custom)',
    shortDescription: 'ADX',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'ADX Smoothing',
        defval: 14,
        type: 'integer',
        min: -1e12,
        max: 1e12,
      },
      {
        id: 'in_1',
        name: 'DI Length',
        defval: 14,
        type: 'integer',
        min: -1e12,
        max: 1e12,
      },
      ...percentileInputs,
    ],
    id: 'average_directional_Index_custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Average Directional Index (Custom)',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const usePercentile = this._input(2);
      const percentileLookback = this._input(3);
      const percentilePercentage = this._input(4);
      this._context.setMinimumAdditionalDepth(
        this._input(0) + this._input(1) + percentileLookback
      );
      const adx = adxCalc(r, this._context, this._input(1), this._input(0))[0];
      const adxVar = this._context.new_var(adx);
      const percentile = usePercentile
        ? percentileRank(adxVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        adx,
        percentile,
        usePercentile ? percentileHigh : r.Std.na(),
        usePercentile ? percentileLow : r.Std.na(),
      ];
    };
  },
});

// Getter used by TradingView.widget option `custom_indicators_getter`
// Returns a Promise that resolves to an array of custom indicator definitions
// PineJS (r) is provided by TV, we forward it to each indicator factory.
// `callback` is invoked by per-instance indicator code with `(value, id)`
// when an indicator's `useCallback: true` flag is set on its chart config.
// The consumer (TradingViewChart) filters callbacks for the specific
// indicator instance — see the wrapper in TradingViewChart.tsx.
export const custom_indicators_getter = (r, callback) => {
  try {
    const cb = typeof callback === 'function' ? callback : () => {};
    const indicators = [
      // Core oscillators / studies
      ADX(r),
      BBW(r),
      MACD(r),
      EMA(r, cb),
      WMA(r, cb),
      DEMA(r, cb),
      TEMA(r, cb),
      VWMA(r, cb),
      HMA(r, cb),
      PSAR(r, cb),
      RSI(r),
      TVTA(r),
      RMA(r, cb),
      SMA(r, cb),
      BB(r, cb),
      Stoch(r),
      SotchRSI(r),
      SR(r, cb),
      QFL(r, cb),
      MFI(r),
      VO(r),
      CCI(r),
      AO(r),
      WR(r),
      UO(r),
      MOM(r),
      // Patterns / price-based and extras
      ECD(r),
      XO(r),
      MAR(r),
      BBPB(r),
      DIV(r),
      ST(r, cb),
      PC(r),
      ATR(r, cb),
      ATRPrice(r, cb),
      PP(r, cb),
      ADR(r, cb),
      ADRPrice(r, cb),
      ATH(r, cb),
      KC(r, cb),
      KCPB(r),
      DC(r),
      OBFVG(r, cb),
      Session(r),
      LW(r, cb),
    ];

    // Filter out any undefined/null indicators and validate structure
    const validIndicators = indicators.filter((indicator) => {
      if (!indicator || typeof indicator !== 'object') {
        console.warn('Invalid indicator object:', indicator);
        return false;
      }
      if (!indicator.name || !indicator.metainfo || !indicator.constructor) {
        console.warn('Indicator missing required properties:', indicator.name);
        return false;
      }
      return true;
    });

    console.log(`Loaded ${validIndicators.length} custom indicators`);
    return Promise.resolve(validIndicators);
  } catch (error) {
    console.error('Error loading custom indicators:', error);
    return Promise.resolve([]);
  }
};

export const BBW = (r) => ({
  name: 'Bollinger Bands Width (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        ...percentileDefaultStyles,
      },
      inputs: {
        maType: 'SMA',
        maLength: 20,
        in_0: 20,
        in_1: 2,
        ...percentileDefaultInputs,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'BBW',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Bollinger Bands Width (Custom)',
    shortDescription: 'BBW',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'maType',
        name: 'MA Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'VWMA', 'HMA', 'RMA'],
      },
      {
        id: 'maLength',
        name: 'MA length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_0',
        name: 'length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_1',
        name: 'mult',
        defval: 2,
        type: 'float',
        min: 0.001,
        max: 50,
      },
      ...percentileInputs,
    ],
    id: 'Bollinger Bands Width Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Bollinger Bands Width (Custom)',
    format: {
      precision: 4,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const maType = this._input(0);
      const maLength = this._input(1);
      const bbwLength = this._input(2);
      const bbwMult = this._input(3);
      const usePercentile = this._input(4);
      const percentileLookback = this._input(5);
      const percentilePercentage = this._input(6);
      this._context.setMinimumAdditionalDepth(
        bbwLength +
          maLength * (maType === 'TEMA' ? 3 : maType === 'DEMA' ? 2 : 1) +
          percentileLookback
      );

      const bbw = bbwCalc(
        r,
        this._context,
        maType,
        maLength,
        bbwLength,
        bbwMult
      );
      const bbwVar = this._context.new_var(bbw);
      const percentile = usePercentile
        ? percentileRank(bbwVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        bbw,
        percentile,
        ...percentileBand(
          usePercentile,
          bbwVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const MACD = (r) => ({
  name: 'MACD (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 5,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: colorRipeRedA200,
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: 0,
          color: '#2196F3',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: 0,
          color: '#FF6D00',
        },
        ...percentileDefaultStyles,
      },
      palettes: {
        palette_0: {
          colors: {
            0: {
              color: colorMintyGreen400,
              width: 1,
              style: 0,
            },
            1: {
              color: colorMintyGreen100,
              width: 1,
              style: 0,
            },
            2: {
              color: colorRipeRed100,
              width: 1,
              style: 0,
            },
            3: {
              color: colorRipeRedA200,
              width: 1,
              style: 0,
            },
          },
        },
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 12,
        in_1: 26,
        in_3: 'close',
        in_2: 9,
        maSource: 'EMA',
        maSignal: 'EMA',
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
      {
        id: 'plot_3',
        palette: 'palette_0',
        target: 'plot_0',
        type: 'colorer',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Histogram',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: 'MACD',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Signal',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'MACD (Custom)',
    shortDescription: 'MACD',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    palettes: {
      palette_0: {
        colors: {
          0: {
            name: 'Color 0',
          },
          1: {
            name: 'Color 1',
          },
          2: {
            name: 'Color 2',
          },
          3: {
            name: 'Color 3',
          },
        },
      },
    },
    inputs: [
      {
        id: 'in_0',
        name: 'fastLength',
        defval: 12,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'in_1',
        name: 'slowLength',
        defval: 26,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'in_3',
        name: 'Source',
        defval: 'close',
        type: 'source',
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'],
      },
      {
        id: 'in_2',
        name: 'signalLength',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 50,
      },
      {
        id: 'maSource',
        name: 'Oscillator MA Type',
        defval: 'EMA',
        type: 'text',
        options: ['SMA', 'EMA'],
      },
      {
        id: 'maSignal',
        name: 'Signal Line MA Type',
        defval: 'EMA',
        type: 'text',
        options: ['SMA', 'EMA'],
      },
      ...percentileInputs,
    ],
    id: 'MACD Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'MACD (Custom)',
    format: {
      precision: 4,
      type: 'price',
    },
  },
  constructor: function () {
    this.f_1 = function (e) {
      const t = e > 0 ? 1 : 3;
      const i = r.Std.change(this._context.new_var(e));
      return t - (r.Std.le(i, 0) ? 0 : 1);
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const s = this._input(0);
      const n = this._input(1);
      const o = this._input(3);
      const maSource = this._input(4);
      const maSignal = this._input(5);
      const usePercentile = this._input(6);
      const percentileLookback = this._input(7);
      const percentilePercentage = this._input(8);
      this._context.setMinimumAdditionalDepth(
        Math.max(s, n) + o + percentileLookback
      );
      const _ = macdCalc(
        r,
        this._context,
        s,
        n,
        o,
        maSource,
        maSignal,
        this._input(2)
      );
      const [macd, d, p] = _;
      const macdVar = this._context.new_var(macd);
      const percentile = usePercentile
        ? percentileRank(macdVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        macd,
        d,
        p,
        this.f_1(macd),
        percentile,
        ...percentileBand(
          usePercentile,
          macdVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const EMA = (r, callback) => ({
  name: 'Moving Average Exponential (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        smoothedMA: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !1,
        },
      },
      inputs: {
        length: 9,
        source: 'close',
        offset: 0,
        smoothingLine: 'SMA',
        smoothingLength: 9,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'smoothedMA',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      smoothedMA: {
        title: 'Smoothed MA',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Moving Average Exponential (Custom)',
    shortDescription: 'EMA',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'length',
        name: 'Length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'source',
        name: 'Source',
        defval: 'close',
        type: 'source',
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'],
      },
      {
        id: 'offset',
        name: 'Offset',
        defval: 0,
        type: 'integer',
        min: -1e4,
        max: 1e4,
      },
      {
        id: 'smoothingLine',
        name: 'Smoothing Line',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA'],
      },
      {
        id: 'smoothingLength',
        name: 'Smoothing Length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Moving Average Exponential (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Moving Average Exponential (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = r.Std[this._input(1)](this._context);
      const s = this._input(0);
      const n = this._input(2);
      const o = this._input(3);
      const a = this._input(4);
      const id = this._input(5);
      this._context.setMinimumAdditionalDepth(s + a);
      let l;
      const c = this._context.new_var(i);
      const h = r.Std.ema(c, s, this._context);
      const d = this._context.new_var(h);
      if (callback) {
        callback(h, id);
      }
      return (
        o === 'EMA'
          ? (l = r.Std.ema(d, a, this._context))
          : o === 'WMA'
            ? (l = r.Std.wma(d, a, this._context))
            : o === 'SMA' && (l = r.Std.sma(d, a, this._context)),
        [
          {
            value: h,
            offset: n,
          },
          {
            value: l,
            offset: n,
          },
        ]
      );
    };
  },
});

export const WMA = (r, callback) => ({
  name: 'Moving Average Weighted (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      inputs: {
        in_0: 9,
        in_1: 'close',
        in_2: 0,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Moving Average Weighted (Custom)',
    shortDescription: 'WMA',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'in_1',
        name: 'Source',
        defval: 'close',
        type: 'source',
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'],
      },
      {
        id: 'in_2',
        name: 'Offset',
        defval: 0,
        type: 'integer',
        min: -1e4,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Moving Average Weighted (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Moving Average Weighted (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = r.Std[this._input(1)](this._context);
      const s = this._input(0);
      const n = this._input(2);
      const id = this._input(3);
      const o = this._context.new_var(i);
      const res = r.Std.wma(o, s, this._context);
      if (callback) {
        callback(res, id);
      }
      return [
        {
          value: res,
          offset: n,
        },
      ];
    };
  },
});

export const DEMA = (r, callback) => ({
  name: 'Double Exponential Moving Average (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#43A047',
        },
      },
      inputs: {
        in_0: 9,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Double EMA (Custom)',
    shortDescription: 'DEMA (Custom)',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Double Exponential Moving Average Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Double Exponential Moving Average (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.f_0 = function (e, t) {
      return 2 * e - t;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const id = this._input(1);
      this._context.setMinimumAdditionalDepth(2 * i);
      const s = r.Std.close(this._context);
      const n = this._context.new_var(s);
      const o = r.Std.ema(n, i, this._context);
      const a = this._context.new_var(o);
      const l = r.Std.ema(a, i, this._context);
      const res = this.f_0(o, l);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const TEMA = (r, callback) => ({
  name: 'Triple EMA (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      inputs: {
        in_0: 9,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Triple EMA (Custom)',
    shortDescription: 'TEMA (Custom)',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Triple EMA Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Triple EMA (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.f_0 = function (e, t, i) {
      return 3 * (e - t) + i;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const id = this._input(1);
      this._context.setMinimumAdditionalDepth(3 * i);
      const s = r.Std.close(this._context);
      const n = this._context.new_var(s);
      const o = r.Std.ema(n, i, this._context);
      const a = this._context.new_var(o);
      const l = r.Std.ema(a, i, this._context);
      const c = this._context.new_var(l);
      const h = r.Std.ema(c, i, this._context);
      const res = this.f_0(o, l, h);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const VWMA = (r, callback) => ({
  name: 'VWMA (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      inputs: {
        in_0: 20,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'VWMA (Custom)',
    shortDescription: 'VWMA (Custom)',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'len',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'VWMA Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'VWMA (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = r.Std.close(this._context);
      const s = this._input(0);
      const id = this._input(1);
      const n = this._context.new_var(i);
      const res = r.Std.vwma(n, s, this._context);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const HMA = (r, callback) => ({
  name: 'Hull MA (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      inputs: {
        in_0: 9,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Hull Moving Average (Custom)',
    shortDescription: 'HMA (Custom)',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 9,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Hull MA Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Hull MA (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.f_0 = function (e, t) {
      return 2 * e - t;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = r.Std.close(this._context);
      const s = this._input(0);
      const id = this._input(1);
      const n = Math.floor(s / 2);
      this._context.setMinimumAdditionalDepth(Math.ceil(s + n));
      const o = this._context.new_var(i);
      const a = r.Std.wma(o, n, this._context);
      const l = this._context.new_var(i);
      const c = r.Std.wma(l, s, this._context);
      const h = this.f_0(a, c);
      const d = r.Std.sqrt(s);
      const u = Math.floor(d);
      const p = this._context.new_var(h);
      const res = r.Std.wma(p, u, this._context);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const RSI = (r) => ({
  name: 'Relative Strength Index (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    isMTFGaps: 1,
    isMTFResolution: 1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        length: 14,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Relative Strength Index (Custom)',
    shortDescription: 'RSI',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'length',
        name: 'Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      ...percentileInputs,
    ],
    id: 'Relative Strength Index Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Relative Strength Index (Custom)',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;

      const s = this._input(0);
      const usePercentile = this._input(1);
      const percentileLookback = this._input(2);
      const percentilePercentage = this._input(3);
      this._context.setMinimumAdditionalDepth(s + percentileLookback);
      const g = rsiCalc(r, this._context, s);
      const rsi = g;
      const rsiVar = this._context.new_var(rsi);
      const percentile = usePercentile
        ? percentileRank(rsiVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        {
          value: g,
        },
        { value: percentile },
        { value: usePercentile ? percentileHigh : r.Std.na() },
        { value: usePercentile ? percentileLow : r.Std.na() },
      ];
    };
  },
});

export const TVTA = (r) => ({
  name: 'Tradingview Technical Analysis',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    showLegendValues: false,
    defaults: {
      styles: {
        strongBuy: {
          plottype: 'shape_label_up',
          location: 'BelowBar',
          visible: !0,
          color: '#2196F3',
          textColor: '#FFFFFF',
          transparency: 0,
        },
        strongSell: {
          plottype: 'shape_label_down',
          location: 'AboveBar',
          visible: !0,
          color: '#FF5252',
          textColor: '#FFFFFF',
          transparency: 0,
        },
        buy: {
          plottype: 'shape_label_up',
          location: 'BelowBar',
          visible: !0,
          color: '#2196F3',
          textColor: '#FFFFFF',
          transparency: 0,
        },
        sell: {
          plottype: 'shape_label_down',
          location: 'AboveBar',
          visible: !0,
          color: '#FF5252',
          textColor: '#FFFFFF',
          transparency: 0,
        },
        bgColor: {
          visible: !0,
          transparency: 90,
        },
      },
      palettes: {
        paletteBg: {
          colors: {
            0: { color: '#FFFFFF' },
            1: { color: '#2196F3' },
            2: { color: '#FF5252' },
          },
        },
      },
      inputs: {
        checkLevel: 15,
        showStrongBuy: true,
        showStrongSell: false,
        showBuy: false,
        showSell: false,
        useEntryExit: true,
      },
    },
    plots: [
      {
        id: 'strongBuy',
        type: 'shapes',
        plottype: 'shape_label_up',
        location: 'BelowBar',
      },
      {
        id: 'strongSell',
        type: 'shapes',
        plottype: 'shape_label_down',
        location: 'AboveBar',
      },
      {
        id: 'buy',
        type: 'shapes',
        plottype: 'shape_label_up',
        location: 'BelowBar',
      },
      {
        id: 'sell',
        type: 'shapes',
        plottype: 'shape_label_down',
        location: 'AboveBar',
      },
      {
        id: 'bgColor',
        type: 'bg_colorer',
        palette: 'paletteBg',
      },
    ],
    styles: {
      strongBuy: {
        title: 'Strong Buy',
        text: 'Strong Buy',
      },
      strongSell: {
        title: 'Strong Sell',
        text: 'Strong Sell',
      },
      buy: {
        title: 'Buy',
        text: 'Buy',
      },
      sell: {
        title: 'Sell',
        text: 'Sell',
      },
      bgColor: {
        title: 'Background color',
      },
    },
    palettes: {
      paletteBg: {
        colors: {
          0: { name: 'Neutral' },
          1: { name: 'Buy' },
          2: { name: 'Sell' },
        },
        valToIndex: { 0: 0, 1: 1, 2: 2 },
      },
    },
    description: 'Combined Ratings',
    shortDescription: 'Combined Ratings',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Combined Ratings@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Combined Ratings',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'checkLevel',
        name: 'Check level',
        defval: 15,
        type: 'integer',
        min: 5,
        max: 23,
      },
      {
        id: 'showStrongBuy',
        name: 'Show Strong Buy',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBuy',
        name: 'Show Buy',
        defval: false,
        type: 'bool',
      },
      {
        id: 'showStrongSell',
        name: 'Show Strong Sell',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showSell',
        name: 'Show Sell',
        defval: false,
        type: 'bool',
      },
      {
        id: 'useEntryExit',
        name: 'Use as Entry/Exit points',
        defval: true,
        type: 'bool',
      },
    ],
  },
  constructor: function () {
    this.dirmov = function (len, context) {
      const h = context.new_var(r.Std.high(context));
      const upDir = r.Std.change(h);
      const l = context.new_var(r.Std.low(context));
      const downDir = -r.Std.change(l);
      const tr = context.new_var(r.Std.tr(undefined, context));
      const truerange = r.Std.rma(tr, len, context);
      const plusDM = context.new_var(
        r.Std.and(r.Std.gt(upDir, downDir), r.Std.gt(upDir, 0)) ? upDir : 0
      );
      const c = r.Std.fixnan(
        (100 * r.Std.rma(plusDM, len, this._context)) / truerange,
        context
      );
      const minusDM = context.new_var(
        r.Std.and(r.Std.gt(downDir, upDir), r.Std.gt(downDir, 0)) ? downDir : 0
      );
      return [
        c,
        r.Std.fixnan(
          (100 * r.Std.rma(minusDM, len, context)) / truerange,
          this._context
        ),
      ];
    };
    this.adx = (diLen, adxLen, context) => {
      const [plus, minus] = this.dirmov(diLen, context);
      const sum = plus + minus;
      const rma = context.new_var(
        r.Std.abs(plus - minus) / (r.Std.eq(sum, 0) ? 1 : sum)
      );
      return [100 * r.Std.rma(rma, adxLen, context)];
    };
    this.rsi = (src, len, context) => {
      const u = context.new_var(r.Std.max(r.Std.change(src), 0));
      const d = context.new_var(-r.Std.min(r.Std.change(src), 0));
      const up = r.Std.rma(u, len, context);
      const down = r.Std.rma(d, len, context);
      const rsi = r.Std.eq(down, 0)
        ? 100
        : r.Std.eq(up, 0)
          ? 0
          : 100 - 100 / (1 + up / down);
      return rsi;
    };
    this.average = (bp, tr, length, context) =>
      r.Std.sum(bp, length, context) / r.Std.sum(tr, length, context);
    this.donchian = (len, low, high, context) =>
      r.Std.avg(
        r.Std.lowest(low, len, context),
        r.Std.highest(high, len, context)
      );
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      this._context.setMinimumAdditionalDepth(200);
      const c = r.Std.close(this._context);
      const h = r.Std.high(this._context);
      const l = r.Std.low(this._context);
      const o = r.Std.open(this._context);
      const _hl2 = r.Std.hl2(this._context);
      const hl2 = this._context.new_var(_hl2);
      const close = this._context.new_var(c);
      const high = this._context.new_var(h);
      const low = this._context.new_var(l);
      const prevClose = close.get(1);
      // sma
      const sma5 = r.Std.sma(close, 5, this._context);
      const sma10 = r.Std.sma(close, 10, this._context);
      const sma20 = r.Std.sma(close, 20, this._context);
      const sma30 = r.Std.sma(close, 30, this._context);
      const sma50 = r.Std.sma(close, 50, this._context);
      const sma100 = r.Std.sma(close, 100, this._context);
      const sma200 = r.Std.sma(close, 200, this._context);
      let smaPoints = 0;
      smaPoints += r.Std.gt(c, sma5) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma10) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma20) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma30) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma50) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma100) ? 1 : -1;
      smaPoints += r.Std.gt(c, sma200) ? 1 : -1;
      // ema
      const ema5 = r.Std.ema(close, 5, this._context);
      const ema10 = r.Std.ema(close, 10, this._context);
      const ema20 = r.Std.ema(close, 20, this._context);
      const ema30 = r.Std.ema(close, 30, this._context);
      const ema50 = r.Std.ema(close, 50, this._context);
      const ema100 = r.Std.ema(close, 100, this._context);
      const ema200 = r.Std.ema(close, 200, this._context);
      let emaPoints = 0;
      emaPoints += r.Std.gt(c, ema5) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema10) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema20) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema30) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema50) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema100) ? 1 : -1;
      emaPoints += r.Std.gt(c, ema200) ? 1 : -1;
      // rsi
      const rsi = this.rsi(close, 14, this._context);
      const band1 = 70;
      const band0 = 30;
      const rsiPoints = r.Std.gt(rsi, band1)
        ? -1
        : r.Std.lt(rsi, band0)
          ? 1
          : 0;
      // stoch
      const s = this._context.new_var(
        r.Std.stoch(close, high, low, 14, this._context)
      );
      const k = r.Std.sma(s, 3, this._context);
      const h0 = 80;
      const h1 = 20;
      const stochPoints = r.Std.gt(k, h0) ? -1 : r.Std.lt(k, h1) ? 1 : 0;
      // cci
      const ma = r.Std.sma(close, 20, this._context);
      const cci = (c - ma) / (0.015 * r.Std.dev(close, 20, this._context));
      const cciband1 = 100;
      const cciband0 = -100;
      const cciPoint = r.Std.gt(cci, cciband1)
        ? -1
        : r.Std.lt(cci, cciband0)
          ? 1
          : 0;
      // adx
      const adxLen = 14;
      const diLen = 14;
      const sig = this.adx(diLen, adxLen, this._context);
      const [_adxplus, _adxminus] = this.dirmov(diLen, this._context);
      const adxplus = this._context.new_var(_adxplus);
      const adxminus = this._context.new_var(_adxminus);
      const adxLine = 20;
      const adxPoint = r.Std.and(
        r.Std.gt(sig, adxLine),
        crossover(r, adxplus, adxminus)
      )
        ? 1
        : r.Std.and(r.Std.gt(sig, adxLine), crossunder(r, adxplus, adxminus))
          ? -1
          : 0;
      // ao
      const _ao =
        r.Std.sma(hl2, 5, this._context) - r.Std.sma(hl2, 34, this._context);
      const ao = this._context.new_var(_ao);
      const aoPoint = r.Std.and(
        r.Std.gt(ao.get(), 0),
        r.Std.gt(ao.get(), ao.get(1))
      )
        ? 1
        : r.Std.and(r.Std.lt(ao.get(), 0), r.Std.lt(ao.get(), ao.get(1)))
          ? -1
          : 0;
      // momentum
      const _mom = c - close.get(10);
      const mom = this._context.new_var(_mom);
      const momPoint = r.Std.gt(mom.get(), mom.get(1))
        ? 1
        : r.Std.lt(mom.get(), mom.get(1))
          ? -1
          : 0;
      // macd
      const fastMa = r.Std.ema(close, 12, this._context);
      const slowMa = r.Std.ema(close, 26, this._context);
      const _macd = fastMa - slowMa;
      const macd = this._context.new_var(_macd);
      const signal = r.Std.ema(macd, 9, this._context);
      const _hist = macd.get() - signal;
      const hist = this._context.new_var(_hist);
      const histPoint = r.Std.gt(hist.get(), hist.get(1)) ? 1 : -1;
      // Stoch RSI
      const _rsi1 = this.rsi(close, 14, this._context);
      const rsi1 = this._context.new_var(_rsi1);
      const rsik = r.Std.sma(
        this._context.new_var(r.Std.stoch(rsi1, rsi1, rsi1, 14, this._context)),
        3,
        this._context
      );
      const rsih0 = 80;
      const rsih1 = 20;
      const stochRsiPoint = r.Std.gt(rsik, rsih0)
        ? -1
        : r.Std.lt(rsik, rsih1)
          ? 1
          : 0;
      // %R
      const upper = r.Std.highest(high, 14, this._context);
      const lower = r.Std.lowest(low, 14, this._context);
      const out = (100 * (c - upper)) / (upper - lower);
      const rband1 = -20;
      const rband0 = -80;
      const rPoint = r.Std.gt(out, rband1) ? -1 : r.Std.lt(out, rband0) ? 1 : 0;
      // BullBearPower
      const hml = h - l;
      const hmc = h - c;
      const cml = c - l;
      const hmo = h - o;
      const hmpc = h - prevClose;
      const oml = o - l;
      const pcml = prevClose - l;
      const r1 = r.Std.lt(prevClose, o) ? r.Std.max(o - prevClose, hml) : hml;
      const r2 = r.Std.gt(prevClose, o) ? r.Std.max(prevClose - o, hml) : hml;
      const bull = r.Std.eq(c, o)
        ? r.Std.eq(hmc - cml)
          ? r.Std.gt(prevClose, o)
            ? r.Std.max(hmo, cml)
            : r1
          : r.Std.gt(hmc, cml)
            ? r.Std.lt(prevClose, o)
              ? r.Std.max(hmpc, cml)
              : hmo
            : r1
        : r.Std.lt(c, o)
          ? r.Std.lt(prevClose, o)
            ? r.Std.max(hmpc, cml)
            : r.Std.max(hmo, cml)
          : r1;
      const bear = r.Std.eq(c, o)
        ? r.Std.eq(hmc, cml)
          ? r.Std.lt(prevClose, o)
            ? r.Std.max(oml, hmc)
            : r2
          : r.Std.gt(hmc, cml)
            ? r2
            : r.Std.gt(prevClose, o)
              ? r.Std.max(pcml, hmc)
              : oml
        : r.Std.lt(c, o)
          ? r2
          : r.Std.gt(prevClose, o)
            ? r.Std.max(pcml, hmc)
            : r.Std.max(oml, hmc);
      const _bb = this._context.new_var(bull - bear);
      const bb = r.Std.sma(_bb, 30, this._context);
      const bbPoint = r.Std.gt(bb, 0) ? 1 : -1;
      // UO
      const high_ = r.Std.max(h, prevClose);
      const low_ = r.Std.min(l, prevClose);
      const _bp = c - low_;
      const _tr = high_ - low_;
      const bp = this._context.new_var(_bp);
      const tr = this._context.new_var(_tr);
      const avg7 = this.average(bp, tr, 7, this._context);
      const avg14 = this.average(bp, tr, 14, this._context);
      const avg28 = this.average(bp, tr, 28, this._context);
      const uoout = (100 * (4 * avg7 + 2 * avg14 + avg28)) / 7;
      const uoPoint = r.Std.gt(uoout, 70) ? 1 : r.Std.lt(uoout, 30) ? -1 : 0;
      // IC
      const baseLine = this.donchian(26, low, high, this._context);
      const icPoint = r.Std.gt(c, baseLine) ? 1 : -1;
      // VWMA
      const vwma = r.Std.vwma(close, 20, this._context);
      const vwmaPoint = r.Std.gt(c, vwma) ? 1 : -1;
      // HMA
      const half = r.Std.wma(close, Math.floor(9 / 2), this._context);
      const full = r.Std.wma(close, 9, this._context);
      const val = this._context.new_var(2 * half - full);
      const hullma = r.Std.wma(val, r.Std.round(r.Std.sqrt(9)));
      const hmapoint = r.Std.gt(c, hullma) ? 1 : -1;
      const totalPoints =
        smaPoints +
        emaPoints +
        rsiPoints +
        stochPoints +
        cciPoint +
        adxPoint +
        aoPoint +
        momPoint +
        histPoint +
        stochRsiPoint +
        rPoint +
        bbPoint +
        uoPoint +
        icPoint +
        vwmaPoint +
        hmapoint;
      const tp = this._context.new_var(totalPoints);
      const lastValue = tp.get(1);
      const checkLevel = this._input(0);
      const showStrongBuy = this._input(1);
      const showBuy = this._input(2);
      const showStringSell = this._input(3);
      const showSell = this._input(4);
      const useEntryExit = this._input(5);
      const strongBuy =
        (r.Std.gt(totalPoints, checkLevel) ||
          r.Std.eq(totalPoints, checkLevel)) &&
        showStrongBuy &&
        (useEntryExit ? r.Std.lt(lastValue, 0) || r.Std.eq(lastValue, 0) : true)
          ? 1
          : 0;

      const strongSell =
        (r.Std.lt(totalPoints, -checkLevel) ||
          r.Std.eq(totalPoints, -checkLevel)) &&
        showStringSell &&
        (useEntryExit ? r.Std.gt(lastValue, 0) || r.Std.eq(lastValue, 0) : true)
          ? 1
          : 0;

      const buy =
        r.Std.gt(totalPoints, 0) &&
        r.Std.lt(totalPoints, checkLevel) &&
        showBuy &&
        (useEntryExit ? r.Std.lt(lastValue, 0) || r.Std.eq(lastValue, 0) : true)
          ? 1
          : 0;

      const sell =
        r.Std.lt(totalPoints, 0) &&
        r.Std.gt(totalPoints, -checkLevel) &&
        showSell &&
        (useEntryExit ? r.Std.gt(lastValue, 0) || r.Std.eq(lastValue, 0) : true)
          ? 1
          : 0;
      const color = r.Std.eq(totalPoints, 0)
        ? 0
        : r.Std.gt(totalPoints, 0)
          ? 1
          : 2;
      return [strongBuy, strongSell, buy, sell, color];
    };
  },
});

export const RMA = (r, callback) => ({
  name: 'RMA',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      inputs: {
        in_0: 26,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Short',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'RMA',
    shortDescription: 'RMA',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 26,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'RMA@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'RMA',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const s = this._input(0);
      const id = this._input(1);
      const n = r.Std.close(this._context);
      const o = this._context.new_var(n);
      const rma = r.Std.rma(o, s, this._context);
      if (callback) {
        callback(rma, id);
      }
      return [rma];
    };
  },
});

export const SMA = (r, callback) => ({
  name: 'Simple Moving Average',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      inputs: {
        in_0: 26,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Short',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Simple Moving Average',
    shortDescription: 'SMA',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 26,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'SMA@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Simple Moving Average',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const s = this._input(0);
      const id = this._input(1);
      const n = r.Std.close(this._context);
      const o = this._context.new_var(n);
      const sma = r.Std.sma(o, s, this._context);
      if (callback) {
        callback(sma, id);
      }
      return [sma];
    };
  },
});

export const BB = (r, callback) => ({
  name: 'Bollinger Bands (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      filledAreasStyle: {
        fill_0: {
          color: '#2196F3',
          transparency: 95,
          visible: !0,
        },
      },
      inputs: {
        maType: 'SMA',
        maLength: 20,
        in_0: 20,
        in_1: 2,
        showUpper: true,
        showMiddle: true,
        showLower: true,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Median',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: 'Upper',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Bollinger Bands (Custom)',
    shortDescription: 'BB',
    is_price_study: !0,
    linkedToSeries: true,
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'plot_1',
        objBId: 'plot_2',
        type: 'plot_plot',
        title: 'Plots Background',
      },
    ],
    inputs: [
      {
        id: 'maType',
        name: 'MA Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'VWMA', 'HMA', 'RMA'],
      },
      {
        id: 'maLength',
        name: 'MA length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_0',
        name: 'length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_1',
        name: 'mult',
        defval: 2,
        type: 'float',
        min: 0.001,
        max: 50,
      },
      { id: 'showUpper', name: 'Show Upper', defval: true, type: 'bool' },
      { id: 'showMiddle', name: 'Show Middle', defval: true, type: 'bool' },
      { id: 'showLower', name: 'Show Lower', defval: true, type: 'bool' },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Bollinger Bands (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Bollinger Bands (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.f_0 = function (e, t) {
      return e * t;
    };
    this.f_1 = function (e, t) {
      return e + t;
    };
    this.f_2 = function (e, t) {
      return e - t;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const close = r.Std.close(this._context);
      const maType = this._input(0);
      const maLength = this._input(1);
      const bbwLength = this._input(2);
      const bbwMult = this._input(3);
      const showUpper = this._input(4);
      const showMiddle = this._input(5);
      const showLower = this._input(6);
      const id = this._input(7);
      this._context.setMinimumAdditionalDepth(
        bbwLength +
          maLength * (maType === 'TEMA' ? 3 : maType === 'DEMA' ? 2 : 1)
      );
      const closeVar = this._context.new_var(close);
      const ma = getMarValue(maType, r, closeVar, maLength, this._context);
      const stdev = r.Std.stdev(closeVar, bbwLength, this._context);
      const h = this.f_0(bbwMult, stdev);

      const values = [
        showMiddle ? ma : r.Std.na(),
        showUpper ? this.f_1(ma, h) : r.Std.na(),
        showLower ? this.f_2(ma, h) : r.Std.na(),
      ];
      if (callback) {
        const v = values.find((_v) => !r.Std.na(_v));
        if (v) {
          callback(v, id);
        }
      }
      return values;
    };
  },
});

export const Stoch = (r) => ({
  name: 'Stochastic (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 80,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 20,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !1,
          value: 100,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !1,
          value: 0,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#2196F3',
          transparency: 90,
          visible: !0,
        },
        fill_1: {
          color: '#2196F3',
          transparency: 90,
          visible: !1,
        },
        fill_2: {
          color: '#2196F3',
          transparency: 90,
          visible: !2,
        },
      },
      inputs: {
        in_0: 14,
        in_1: 1,
        in_2: 3,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: '%K',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: '%D',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Stochastic (Custom)',
    shortDescription: 'Stoch',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
      {
        id: 'hline_3',
        name: 'TopLimit',
      },
      {
        id: 'hline_4',
        name: 'LowLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      {
        id: 'fill_1',
        objAId: 'hline_3',
        objBId: 'hline_0',
        type: 'hline_hline',
        title: 'Hlines top Background',
      },
      {
        id: 'fill_2',
        objAId: 'hline_4',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines bottom Background',
      },
    ],
    inputs: [
      {
        id: 'in_0',
        name: '%K Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_1',
        name: '%K Smoothing',
        defval: 1,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_2',
        name: '%D Smoothing',
        defval: 3,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
    ],
    id: 'Stochastic (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Stochastic',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const s = this._input(1);
      const n = this._input(2);
      this._context.setMinimumAdditionalDepth(i + s + n);
      /* const o = r.Std.close(this._context)
      const a = r.Std.high(this._context)
      const l = r.Std.low(this._context)
      const c = this._context.new_var(o)
      const h = this._context.new_var(a)
      const d = this._context.new_var(l)
      const u = r.Std.stoch(c, h, d, i, this._context)
      const p = this._context.new_var(u)
      const _ = r.Std.sma(p, s, this._context)
      const m = this._context.new_var(_) */
      return stochCalc(i, s, n, r, this._context);
    };
  },
});

export const SR = (r, callback) => ({
  name: 'Support Resistance',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      inputs: {
        leftBars: 15,
        rightBars: 15,
        showSupport: true,
        showResistance: true,
        id: '',
      },
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      palettes: {
        paletteId1: {
          colors: {
            0: {
              color: '#FF0000',
              width: 3,
              style: 0,
            },
            1: {
              color: '#FFFFFF',
              width: 1,
              style: 1,
            },
          },
        },
        paletteId2: {
          colors: {
            0: {
              color: '#233dee',
              width: 3,
              style: 0,
            },
            1: {
              color: '#FFFFFF',
              width: 1,
              style: 1,
            },
          },
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'colorer',
        target: 'plot_0',
        palette: 'paletteId1',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
      {
        id: 'plot_3',
        type: 'colorer',
        target: 'plot_2',
        palette: 'paletteId2',
      },
    ],
    palettes: {
      paletteId1: {
        colors: {
          0: {
            name: 'First color',
          },
          1: {
            name: 'Second color',
          },
        },
      },
      paletteId2: {
        colors: {
          0: {
            name: 'First color',
          },
          1: {
            name: 'Second color',
          },
        },
      },
    },
    styles: {
      plot_0: {
        title: 'Resistance',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Support',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Support Resistance',
    shortDescription: 'Support Resistance',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Support Resistance@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Support Resistance',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'leftBars',
        name: 'Left bars',
        defval: 15,
        type: 'integer',
      },
      {
        id: 'rightBars',
        name: 'Right bars',
        defval: 15,
        type: 'integer',
      },
      { id: 'showSupport', name: 'Show Support', defval: true, type: 'bool' },
      {
        id: 'showResistance',
        name: 'Show Resistance',
        defval: true,
        type: 'bool',
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const h = r.Std.high(this._context);
      const high = this._context.new_var(h);
      const l = r.Std.low(this._context);
      const low = this._context.new_var(l);
      const leftBars = this._input(0);
      const rightBars = this._input(1);
      const showSupport = this._input(2);
      const showResistance = this._input(3);
      const id = this._input(4);
      this._context.setMinimumAdditionalDepth(leftBars + rightBars);
      const res = pivotHigh(high, leftBars, rightBars, r);
      const fixedRes = r.Std.fixnan(res, this._context);
      const varRes = this._context.new_var(fixedRes);
      const resLow = pivotLow(low, leftBars, rightBars, r);
      const fixedResLow = r.Std.fixnan(resLow, this._context);
      const varResLow = this._context.new_var(fixedResLow);
      if (callback) {
        callback(showResistance ? fixedRes : fixedResLow, id);
      }
      return [
        {
          value: showResistance ? fixedRes : r.Std.na(),
          offset: callback ? 0 : -rightBars,
        },
        showResistance ? (r.Std.change(varRes, this._context) ? 1 : 0) : 0,
        {
          value: showSupport ? fixedResLow : r.Std.na(),
          offset: callback ? 0 : -rightBars,
        },
        showSupport ? (r.Std.change(varResLow, this._context) ? 1 : 0) : 0,
      ];
    };
  },
});

export const QFL = (r, callback) => ({
  name: 'Quickfingers Luc base scanner',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      inputs: {
        basePeriods: 36,
        pumpPeriods: 8,
        pump: 3,
        baseCrack: 3,
        showHighest: false,
        showLowest: false,
        id: '',
      },
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#9c27b0',
        },
        plot_3: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#9c27b0',
        },
        buy: {
          plottype: 'shape_label_up',
          location: 'BelowBar',
          visible: !0,
          color: '#2196F3',
          textColor: '#FFFFFF',
          transparency: 0,
        },
      },
      palettes: {
        paletteId1: {
          colors: {
            0: {
              color: '#2196F3',
              width: 3,
              style: 0,
            },
            1: {
              color: '#FFFFFF',
              width: 1,
              style: 1,
            },
          },
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'colorer',
        target: 'plot_0',
        palette: 'paletteId1',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
      {
        id: 'plot_3',
        type: 'line',
      },
      {
        id: 'buy',
        type: 'shapes',
        plottype: 'shape_label_up',
        location: 'BelowBar',
      },
    ],
    palettes: {
      paletteId1: {
        colors: {
          0: {
            name: 'First color',
          },
          1: {
            name: 'Second color',
          },
        },
      },
    },
    styles: {
      plot_0: {
        title: 'QFL',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Highest highs',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_3: {
        title: 'Simple lowest lows',
        histogramBase: 0,
        joinPoints: !1,
      },
      buy: {
        title: 'Buy',
        text: 'B',
      },
    },
    description: 'Quickfingers Luc base scanner',
    shortDescription: 'Quickfingers Luc base scanner',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Quickfingers Luc base scanner@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Quickfingers Luc base scanner',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'basePeriods',
        name: 'Base periods',
        defval: 36,
        type: 'integer',
      },
      {
        id: 'pumpPeriods',
        name: 'Pump periods',
        defval: 8,
        type: 'integer',
      },
      {
        id: 'pump',
        name: 'Pump from base (%)',
        defval: 3,
        type: 'float',
      },
      {
        id: 'baseCrack',
        name: 'Size of base crack (%)',
        defval: 3,
        type: 'float',
      },
      {
        id: 'showLowest',
        name: 'Show simple lowest lows',
        defval: false,
        type: 'bool',
      },
      {
        id: 'showHighest',
        name: 'Show highest highs',
        defval: false,
        type: 'bool',
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const basePeriods = this._input(0);
      const _pumpPeriods = this._input(1);
      const pump = this._input(2) / 100;
      const baseCrack = this._input(3) / 100;
      const showLowest = this._input(4);
      const showHighest = this._input(5);
      const id = this._input(6);
      const pumpPeriods =
        _pumpPeriods >= basePeriods ? basePeriods - 1 : _pumpPeriods;
      this._context.setMinimumAdditionalDepth(basePeriods + pumpPeriods);
      const l = r.Std.low(this._context);
      const low = this._context.new_var(l);
      const h = r.Std.high(this._context);
      const high = this._context.new_var(h);
      const ll = r.Std.lowest(low, basePeriods, this._context);
      const lowestLow = this._context.new_var(ll);
      const newBase =
        r.Std.gt(lowestLow.get(pumpPeriods + 1), lowestLow.get(pumpPeriods)) &&
        r.Std.eq(lowestLow.get(pumpPeriods), ll);
      const base = newBase ? ll : r.Std.na();
      const fixedResBase = r.Std.fixnan(base, this._context);
      const baseVar = this._context.new_var(fixedResBase);
      const highestHigh = this._context.new_var();
      const offsetHigh = r.Std.highest(high, pumpPeriods, this._context);
      const current = highestHigh.get(0);
      const prev = highestHigh.get(1);
      const hh = newBase || r.Std.gt(h, current) ? offsetHigh : prev;
      highestHigh.set(hh);
      const buyLimit =
        r.Std.gt((hh - fixedResBase) / fixedResBase, pump) &&
        r.Std.gt((fixedResBase - l) / fixedResBase, baseCrack)
          ? fixedResBase * (1 - baseCrack)
          : r.Std.na();
      if (callback) {
        callback(fixedResBase, id);
      }
      return [
        {
          value: fixedResBase,
          offset: callback ? 0 : 1 - pumpPeriods,
        },
        r.Std.change(baseVar, this._context) ? 1 : 0,
        showHighest ? hh : r.Std.na(),
        showLowest ? ll : r.Std.na(),
        buyLimit,
      ];
    };
  },
});

export const SotchRSI = (r) => ({
  name: 'Stochastic RSI (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 80,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 20,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !1,
          value: 100,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !1,
          value: 0,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#2196F3',
          transparency: 90,
          visible: !0,
        },
        fill_1: {
          color: '#2196F3',
          transparency: 90,
          visible: !1,
        },
        fill_2: {
          color: '#2196F3',
          transparency: 90,
          visible: !2,
        },
      },
      inputs: {
        in_0: 14,
        in_1: 14,
        in_2: 3,
        in_3: 3,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: '%K',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: '%D',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Stochastic RSI (Custom)',
    shortDescription: 'Stoch RSI',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
      {
        id: 'hline_3',
        name: 'TopLimit',
      },
      {
        id: 'hline_4',
        name: 'LowLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      {
        id: 'fill_1',
        objAId: 'hline_3',
        objBId: 'hline_0',
        type: 'hline_hline',
        title: 'Hlines top Background',
      },
      {
        id: 'fill_2',
        objAId: 'hline_4',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines bottom Background',
      },
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'lengthRSI',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_1',
        name: 'lengthStoch',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_2',
        name: 'smoothK',
        defval: 3,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_3',
        name: 'smoothD',
        defval: 3,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
    ],
    id: 'Stochastic RSI (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Stochastic RSI',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.f_1 = function (e, t, i) {
      const s = i.new_var(r.Std.max(r.Std.change(e), 0));
      return r.Std.rma(s, t, i);
    };
    this.f_2 = function (e, t, i) {
      const s = i.new_var(-r.Std.min(r.Std.change(e), 0));
      return r.Std.rma(s, t, i);
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = r.Std.close(this._context);
      const s = this._input(0);
      const n = this._input(1);
      const o = this._input(2);
      const a = this._input(3);
      e.setMinimumAdditionalDepth(s + n + o + a);
      const l = this._context.new_var(i);
      const c = r.Std.rsi(
        this.f_1(l, s, this._context),
        this.f_2(l, s, this._context)
      );
      const h = this._context.new_var(c);
      const d = this._context.new_var(c);
      const u = this._context.new_var(c);
      const p = r.Std.stoch(h, d, u, n, this._context);
      const _ = this._context.new_var(p);
      const m = r.Std.sma(_, o, this._context);
      const g = this._context.new_var(m);
      return [m, r.Std.sma(g, a, this._context)];
    };
  },
});

export const VO = (r) => ({
  name: 'Volume Oscillator (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 80,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 20,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 5,
        in_1: 10,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Volume Oscillator (Custom)',
    shortDescription: 'Volume Osc',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'shortlen',
        defval: 5,
        type: 'integer',
        min: 1,
        max: 4999,
      },
      {
        id: 'in_1',
        name: 'longlen',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 4999,
      },
      ...percentileInputs,
    ],
    id: 'Volume Oscillator (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Volume Oscillator (Custom)',
    format: {
      precision: 2,
      type: 'percent',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const s = this._input(1);
      const usePercentile = this._input(2);
      const percentileLookback = this._input(3);
      const percentilePercentage = this._input(4);
      this._context.setMinimumAdditionalDepth(
        Math.max(i, s) + percentileLookback
      );
      const vo = voCalc(r, this._context, i, s);
      const voVar = this._context.new_var(vo);
      const percentile = usePercentile
        ? percentileRank(voVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        vo,
        percentile,
        ...percentileBand(
          usePercentile,
          voVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const CCI = (r) => ({
  name: 'Commodity Channel Index (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        smoothedMA: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !1,
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 100,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -100,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        length: 20,
        smoothingLine: 'SMA',
        smoothingLength: 20,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'smoothedMA',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      smoothedMA: {
        title: 'Smoothed MA',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Commodity Channel Index (Custom)',
    shortDescription: 'CCI',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'length',
        name: 'length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'smoothingLine',
        name: 'Smoothing Line',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA'],
      },
      {
        id: 'smoothingLength',
        name: 'Smoothing Length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      ...percentileInputs,
    ],
    id: 'Commodity Channel Index Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Commodity Channel Index (Custom)',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const s = this._input(0);
      const n = this._input(1);
      const o = this._input(2);
      const usePercentile = this._input(3);
      const percentileLookback = this._input(4);
      const percentilePercentage = this._input(5);
      this._context.setMinimumAdditionalDepth(s + o + percentileLookback);
      let a;
      const [p, u] = cciCalc(r, this._context, s);
      const percentile = usePercentile
        ? percentileRank(p, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return (
        n === 'EMA'
          ? (a = r.Std.ema(p, o, this._context))
          : n === 'WMA'
            ? (a = r.Std.wma(p, o, this._context))
            : n === 'SMA' && (a = r.Std.sma(p, o, this._context)),
        [
          u,
          a,
          percentile,
          usePercentile ? percentileHigh : r.Std.na(),
          usePercentile ? percentileLow : r.Std.na(),
        ]
      );
    };
  },
});

export const AO = (r) => ({
  name: 'Awesome Oscillator (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 1,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#000080',
        },
        ...percentileDefaultStyles,
      },
      palettes: {
        palette_0: {
          colors: {
            0: {
              color: colorMintyGreen400,
              width: 1,
              style: 0,
            },
            1: {
              color: colorRipeRedA200,
              width: 1,
              style: 0,
            },
          },
        },
      },
      inputs: { ...percentileDefaultInputs },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
    },

    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        palette: 'palette_0',
        target: 'plot_0',
        type: 'colorer',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Awesome Oscillator (Custom)',
    shortDescription: 'AO',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    palettes: {
      palette_0: {
        colors: {
          0: {
            name: 'Color 0',
          },
          1: {
            name: 'Color 1',
          },
        },
      },
    },
    inputs: [...percentileInputs],
    id: 'Awesome Oscillator (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Awesome Oscillator (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.f_1 = function (e) {
      return r.Std.le(e, 0) ? 0 : 1;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;

      const usePercentile = this._input(0);
      const percentileLookback = this._input(1);
      const percentilePercentage = this._input(2);
      this._context.setMinimumAdditionalDepth(34 + percentileLookback);
      const l = aoCalc(r, this._context);
      const c = l;
      const h = this._context.new_var(l);
      const d = r.Std.change(h);
      const aoVar = this._context.new_var(l);
      const percentile = usePercentile
        ? percentileRank(aoVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        c,
        this.f_1(d),
        percentile,
        ...percentileBand(
          usePercentile,
          aoVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const WR = (r) => ({
  name: 'Williams %R (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -20,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -80,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        length: 14,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Williams %R (Custom)',
    shortDescription: '%R (Custom)',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'length',
        name: 'length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      ...percentileInputs,
    ],
    id: 'Williams %R (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Williams %R (Custom)',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const usePercentile = this._input(1);
      const percentileLookback = this._input(2);
      const percentilePercentage = this._input(3);
      this._context.setMinimumAdditionalDepth(i + percentileLookback);
      const wr = wrCalc(r, this._context, i);
      const wrVar = this._context.new_var(wr);
      const percentile = usePercentile
        ? percentileRank(wrVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        wr,
        percentile,
        usePercentile ? percentileHigh : r.Std.na(),
        usePercentile ? percentileLow : r.Std.na(),
      ];
    };
  },
});

export const UO = (r) => ({
  name: 'Ultimate Oscillator (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: colorRipeRedA200,
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 7,
        in_1: 14,
        in_2: 28,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Ultimate Oscillator (Custom)',
        histogramBase: 0,
        joinPoints: !1,
        isHidden: !1,
      },
      ...percentileStyle,
    },
    description: 'Ultimate Oscillator (Custom)',
    shortDescription: 'Ultimate Oscillator (Custom)',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'length7',
        defval: 7,
        type: 'integer',
        min: 1,
        max: 1e12,
      },
      {
        id: 'in_1',
        name: 'length14',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 1e12,
      },
      {
        id: 'in_2',
        name: 'length28',
        defval: 28,
        type: 'integer',
        min: 1,
        max: 1e12,
      },
      ...percentileInputs,
    ],
    id: 'Ultimate Oscillator (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Ultimate Oscillator (Custom)',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const _e = this._input(0);
      const _t = this._input(1);
      const _i = this._input(2);
      const usePercentile = this._input(3);
      const percentileLookback = this._input(4);
      const percentilePercentage = this._input(5);
      this._context.setMinimumAdditionalDepth(
        Math.max(_e, _t, _i) + percentileLookback
      );
      const uo = uoCalc(r, this._context, _e, _t, _i);
      const uoVar = this._context.new_var(uo);
      const percentile = usePercentile
        ? percentileRank(uoVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        uo,
        percentile,
        usePercentile ? percentileHigh : r.Std.na(),
        usePercentile ? percentileLow : r.Std.na(),
      ];
    };
  },
});

export const MOM = (r) => ({
  name: 'Momentum (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        in_0: 10,
        in_1: 'close',
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Mom (Custom)',
        histogramBase: 0,
        joinPoints: !1,
        isHidden: !1,
      },
      ...percentileStyle,
    },
    description: 'Momentum (Custom)',
    shortDescription: 'Mom (Custom)',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'in_1',
        name: 'Source',
        defval: 'close',
        type: 'source',
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'],
      },
      ...percentileInputs,
    ],
    id: 'Momentum (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Momentum (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const usePercentile = this._input(2);
      const percentileLookback = this._input(3);
      const percentilePercentage = this._input(4);
      this._context.setMinimumAdditionalDepth(i + percentileLookback);
      const mom = momCalc(r, this._context, i, this._input(1));
      const momVar = this._context.new_var(mom);
      const percentile = usePercentile
        ? percentileRank(momVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        mom,
        percentile,
        ...percentileBand(
          usePercentile,
          momVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const BBWP = (r) => ({
  name: 'Bollinger Bands Width Percentile',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      inputs: {
        priceSource: 'close',
        /*  basisType: 'SMA', */
        in_0: 13,
        in_1: 252,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Bollinger Bands Width Percentile',
    shortDescription: 'BBWP',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
    ],
    inputs: [
      {
        id: 'priceSource',
        name: 'Price Source',
        defval: 'close',
        type: 'text',
        options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'],
      },
      /*  {
        id: 'basisType',
        name: 'Basis Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA', 'RMA', 'VWMA'],
      }, */
      {
        id: 'in_0',
        name: 'Length',
        defval: 20,
        type: 'integer',
        min: 1,
      },
      {
        id: 'in_1',
        name: 'Lookback',
        defval: 2,
        type: 'integer',
        min: 1,
      },
    ],
    id: 'Bollinger Bands Width Percentile@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Bollinger Bands Width Percentile',
    format: {
      precision: 4,
      type: 'price',
    },
  },
  constructor: function () {
    this.f_1 = function (e, t) {
      return e + t;
    };
    this.f_2 = function (e, t) {
      return e - t;
    };
    this.f_3 = function (e, t, i) {
      return (e - t) / i;
    };
    this.maType = function (price, basisType, length, context) {
      switch (basisType) {
        case 'SMA':
          return r.Std.sma(price, length, context);
        case 'EMA':
          return r.Std.ema(price, length, context);
        case 'WMA':
          return r.Std.wma(price, length, context);
        case 'RMA':
          return r.Std.rma(price, length, context);
        default:
          return r.Std.vwma(price, length, context);
      }
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const priceSource = this._input(0);
      const price = r.Std[priceSource](this._context);
      const basisType = 'SMA';
      const length = this._input(1);
      const lookback = this._input(2);
      this._context.setMinimumAdditionalDepth(lookback + length);
      const priceVar = this._context.new_var(price);
      const basis = this.maType(priceVar, basisType, length, this._context);
      const dev = r.Std.stdev(priceVar, length, this._context);
      const sum = this.f_1(basis, dev);
      const diff = this.f_2(basis, dev);
      const bbw = this.f_3(sum, diff, basis);
      const bbwVar = this._context.new_var(bbw);
      let bbwSum = 0;
      for (let i = 0; i < lookback; i++) {
        const val = bbwVar.get(i);
        bbwSum += !r.Std.na(val) ? (val > bbw ? 0 : 1) : 0;
      }
      return [(bbwSum / lookback) * 100];
    };
  },
});

export const ECD = (r) => ({
  name: 'Engulfing candle detector',
  metainfo: {
    _metainfoVersion: 51,

    id: 'Engulfing candle detector@tv-basicstudies-1',
    name: 'Engulfing candle detector',
    description: 'Engulfing candle detector',
    shortDescription: 'Engulfing candle detector',

    isCustomIndicator: true,
    isTVScript: false,
    isTVScriptStub: false,
    is_price_study: true,
    format: {
      type: 'price',
      precision: 4,
    },
    defaults: {
      palettes: {
        palette_0: {
          colors: [{ color: '#2196F3' }, { color: '#9C27B0' }],
        },
      },
      inputs: { showBearish: true, showBullish: true },
    },
    inputs: [
      {
        id: 'showBearish',
        name: 'Show Bearish',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBullish',
        name: 'Show Bullish',
        defval: true,
        type: 'bool',
      },
    ],
    plots: [
      {
        id: 'Colors',
        type: 'bar_colorer',
        palette: 'palette_0',
      },
    ],
    palettes: {
      palette_0: {
        colors: [{ name: 'Bullish' }, { name: 'Bearish' }],
        valToIndex: {
          100: 0,
          200: 1,
        },
      },
    },
  },
  constructor: function () {
    this.main = function (context, input) {
      this._context = context;
      this._input = input;
      const showBearish = this._input(0);
      const showBullish = this._input(1);
      const close = r.Std.close(this._context);
      const open = r.Std.open(this._context);
      const closeVar = this._context.new_var(close);
      const openVar = this._context.new_var(open);
      const openBarPrevious = openVar.get(1);
      const closeBarPrevious = closeVar.get(1);
      const openBarCurrent = openVar.get(0);
      const closeBarCurrent = closeVar.get(0);
      const bullishColor = 100;
      const bearishColor = 200;
      const bullishEngulfing =
        openBarCurrent <= closeBarPrevious &&
        openBarCurrent < openBarPrevious &&
        closeBarCurrent > openBarPrevious;
      const bearishEngulfing =
        openBarCurrent >= closeBarPrevious &&
        openBarCurrent > openBarPrevious &&
        closeBarCurrent < openBarPrevious;
      return [
        bullishEngulfing && showBullish
          ? bullishColor
          : bearishEngulfing && showBearish
            ? bearishColor
            : r.Std.na(),
      ];
    };
  },
});

export const XO = (r) => ({
  name: 'Oscillator crossover',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    isCustomIndicator: !0,
    defaults: {
      styles: {
        oscillator1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
        oscillator2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: colorRipeRedA200,
        },
      },
      inputs: {
        xOscillator1: 'RSI',
        xOscillator1length: 7,
        xOscillator2: 'MFI',
        xOscillator2length: 14,
        xOscillator1voShort: 5,
        xOscillator1voLong: 10,
        xOscillator2voShort: 5,
        xOscillator2voLong: 10,
      },
    },
    plots: [
      {
        id: 'oscillator1',
        type: 'line',
      },
      {
        id: 'oscillator2',
        type: 'line',
      },
    ],
    styles: {
      oscillator1: {
        title: 'Oscillator 1',
        histogramBase: 0,
        joinPoints: !1,
      },
      oscillator2: {
        title: 'Oscillator 2',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Oscillator crossover',
    shortDescription: 'Oscillator crossover',
    is_price_study: !1,
    inputs: [
      {
        id: 'xOscillator1',
        name: 'Oscillator 1',
        defval: 'RSI',
        type: 'text',
        options: ['RSI', 'MFI', 'CCI', 'VO', 'None'],
      },
      {
        id: 'xOscillator1length',
        name: 'Oscillator 1 Length',
        defval: 7,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'xOscillator1voShort',
        name: 'Oscillator 1 VO Short',
        defval: 5,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'xOscillator1voLong',
        name: 'Oscillator 1 VO long',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'xOscillator2',
        name: 'Oscillator 2',
        defval: 'MFI',
        type: 'text',
        options: ['RSI', 'MFI', 'CCI', 'VO', 'None'],
      },
      {
        id: 'xOscillator2length',
        name: 'Oscillator 2 Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'xOscillator2voShort',
        name: 'Oscillator 2 VO Short',
        defval: 5,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'xOscillator2voLong',
        name: 'Oscillator 2 VO long',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
    ],
    id: 'Oscillator crossover@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Oscillator crossover',
    format: {
      precision: 2,
      type: 'price',
    },
  },
  constructor: function () {
    this.f_0 = function (e, t, i) {
      return (e - t) / (0.015 * i);
    };
    this.rsi1 = function (e) {
      return r.Std.max(e, 0);
    };
    this.rsi2 = function (e) {
      return -r.Std.min(e, 0);
    };
    this.rsi3 = function (e, t) {
      return r.Std.eq(e, 0)
        ? 100
        : r.Std.eq(t, 0)
          ? 0
          : 100 - 100 / (1 + t / e);
    };
    this.rsi = function (close, length, context) {
      const c = r.Std.change(close);
      const h = this.rsi1(c);
      const d = context.new_var(h);
      const u = r.Std.rma(d, length, context);
      const p = this.rsi2(c);
      const _ = context.new_var(p);
      const m = r.Std.rma(_, length, context);
      const g = this.rsi3(m, u);
      return g;
    };
    this.cci1 = function (e, t, i) {
      return (e - t) / (0.015 * i);
    };
    this.cci = function (hlc3, length, context) {
      const c = r.Std.sma(hlc3, length, context);
      const d = r.Std.dev(hlc3, length, context);
      return this.cci1(hlc3, c, d);
    };
    this.mfi1 = function (e, t, i) {
      return e * (r.Std.le(t, 0) ? 0 : i);
    };
    this.mfi2 = function (e, t, i) {
      return e * (r.Std.ge(t, 0) ? 0 : i);
    };
    this.mfi = function (hlc3, length, context) {
      const o = r.Std.change(hlc3);
      const a = this.mfi1(r.Std.volume(context), o, hlc3);
      const l = context.new_var(a);
      const c = r.Std.sum(l, length, context);
      const h = this.mfi2(r.Std.volume(context), o, hlc3);
      const d = context.new_var(h);
      const u = r.Std.sum(d, length, context);
      return r.Std.rsi(c, u);
    };
    this.vo = function (context, long, short) {
      return voCalc(r, context, short, long);
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const type1 = this._input(0);
      const type1Length = this._input(1);
      const type1voShort = this._input(2);
      const type1voLong = this._input(3);
      const type2 = this._input(4);
      const type2Length = this._input(5);
      const type2voShort = this._input(6);
      const type2voLong = this._input(7);
      const close = r.Std.close(this._context);
      const closeVar = this._context.new_var(close);
      const hlc3 = r.Std.hlc3(this._context);
      const hlc3Var = this._context.new_var(hlc3);
      this._context.setMinimumAdditionalDepth(
        Math.max(
          type1Length,
          type2Length,
          type1voLong,
          type1voShort,
          type2voLong,
          type2voShort
        )
      );
      const result1 =
        type1 === 'RSI'
          ? this.rsi(closeVar, type1Length, this._context)
          : type1 === 'CCI'
            ? this.cci(hlc3Var, type1Length, this._context)
            : type1 === 'MFI'
              ? this.mfi(hlc3Var, type1Length, this._context)
              : type1 === 'VO'
                ? this.vo(this._context, type1voLong, type1voShort)
                : r.Std.na();
      const result2 =
        type2 === 'RSI'
          ? this.rsi(closeVar, type2Length, this._context)
          : type2 === 'CCI'
            ? this.cci(hlc3Var, type2Length, this._context)
            : type2 === 'MFI'
              ? this.mfi(hlc3Var, type2Length, this._context)
              : type2 === 'VO'
                ? this.vo(this._context, type2voLong, type2voShort)
                : r.Std.na();
      return [result1, result2];
    };
  },
});

const getMarValue = (type1, r, closeVar, type1length, context) => {
  let result1 = r.Std.na();
  switch (type1) {
    case 'SMA':
      result1 = r.Std.sma(closeVar, type1length, context);
      break;
    case 'EMA':
      result1 = r.Std.ema(closeVar, type1length, context);
      break;
    case 'WMA':
      result1 = r.Std.wma(closeVar, type1length, context);
      break;
    case 'DEMA': {
      const ema1 = r.Std.ema(closeVar, type1length, context);
      const ema1var = context.new_var(ema1);
      const ema2 = r.Std.ema(ema1var, type1length, context);
      result1 = 2 * ema1 - ema2;
      break;
    }
    case 'TEMA': {
      const ema1 = r.Std.ema(closeVar, type1length, context);
      const ema1var = context.new_var(ema1);
      const ema2 = r.Std.ema(ema1var, type1length, context);
      const ema2var = context.new_var(ema2);
      const ema3 = r.Std.ema(ema2var, type1length, context);
      result1 = 3 * (ema1 - ema2) + ema3;
      break;
    }
    case 'VWMA':
      result1 = r.Std.vwma(closeVar, type1length, context);
      break;
    case 'HMA': {
      const halfLength = Math.floor(type1length / 2);
      const wmaHalf = r.Std.wma(closeVar, halfLength, context);
      const wmaFull = r.Std.wma(closeVar, type1length, context);
      const val = 2 * wmaHalf - wmaFull;
      const sqrt = r.Std.sqrt(type1length);
      const round = Math.floor(sqrt);
      const pVar = context.new_var(val);
      result1 = r.Std.wma(pVar, round, context);
      break;
    }
    case 'RMA':
      result1 = r.Std.rma(closeVar, type1length, context);
      break;
    case 'price':
      result1 = closeVar.get();
      break;
    default:
      break;
  }
  return result1;
};

export const MAR = (r) => ({
  name: 'Moving Average Ratio (MAR)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 2,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        bgColor: {
          visible: !0,
          transparency: 80,
        },
        ...percentileDefaultStyles,
      },
      inputs: {
        type1: 'EMA',
        type1length: 20,
        type2: 'price',
        type2length: 20,
        trendFilter: false,
        trendLookback: 10,
        trendDiff: 2,
        trendType: 'lower',
        ...percentileDefaultInputs,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 1.01,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 0.99,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      palettes: {
        paletteBg: {
          colors: {
            1: { color: '#048300' },
          },
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
      {
        id: 'bgColor',
        type: 'bg_colorer',
        palette: 'paletteBg',
      },
    ],
    styles: {
      plot_0: {
        title: 'MAR',
        histogramBase: 0,
        joinPoints: !1,
      },
      bgColor: {
        title: 'Background color',
      },
      ...percentileStyle,
    },
    description: 'Moving Average Ratio (MAR)',
    shortDescription: 'MAR',
    is_price_study: !1,
    palettes: {
      paletteBg: {
        colors: {
          1: { name: 'Condition' },
        },
        valToIndex: { 1: 1 },
      },
    },
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'type1',
        name: 'Type 1',
        defval: 'EMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'VWMA', 'HMA', 'RMA'],
      },
      {
        id: 'type1length',
        name: 'Type 1 length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'type2',
        name: 'Type 2',
        defval: 'price',
        type: 'text',
        options: [
          'SMA',
          'EMA',
          'WMA',
          'DEMA',
          'TEMA',
          'VWMA',
          'HMA',
          'RMA',
          'price',
        ],
      },
      {
        id: 'type2length',
        name: 'Type 2 length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'trendFilter',
        name: 'Use Trend Filter',
        defval: false,
        type: 'bool',
      },
      {
        id: 'trendLookback',
        name: 'Trend Filter Lookback',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 1e3,
      },
      {
        id: 'trendDiff',
        name: 'Trend Filter Value',
        defval: 2,
        type: 'integer',
        min: 1,
        max: 100,
      },
      {
        id: 'trendType',
        name: 'Trend Filter Type',
        defval: 'lower',
        type: 'text',
        options: ['lower', 'higher', 'between'],
      },
      ...percentileInputs,
    ],
    id: 'Moving Average Ratio (MAR)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Moving Average Ratio (MAR)',
    format: {
      precision: 8,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const type1 = this._input(0);
      const type1length = this._input(1);
      const type2 = this._input(2);
      const type2length = this._input(3);
      const useTrendFilter = this._input(4);
      const trendLookback = this._input(5);
      const trendDiff = this._input(6);
      const trendType = this._input(7);
      const usePercentile = this._input(8);
      const percentileLookback = this._input(9);
      const percentilePercentage = this._input(10);
      const bars =
        Math.max(
          type1length * (type1 === 'TEMA' ? 3 : type1 === 'DEMA' ? 2 : 1),
          type2 === 'price'
            ? 0
            : type2length * (type2 === 'TEMA' ? 3 : type2 === 'DEMA' ? 2 : 1)
        ) +
        percentileLookback +
        trendLookback;
      this._context.setMinimumAdditionalDepth(bars);
      const close = r.Std.close(this._context);
      const closeVar = this._context.new_var(close);
      const result1 = getMarValue(
        type1,
        r,
        closeVar,
        type1length,
        this._context
      );
      const result2 = getMarValue(
        type2,
        r,
        closeVar,
        type2length,
        this._context
      );
      const mar = result2 / result1;
      const marVar = this._context.new_var(mar);
      marVar.get(Math.max(trendLookback, percentileLookback));
      const trend = this._context.symbol.isBarClosed
        ? useTrendFilter
          ? trendType === 'lower'
            ? (marVar.get(trendLookback) - mar) / marVar.get(trendLookback) >=
              trendDiff / 100
              ? 1
              : 0
            : trendType === 'higher'
              ? (mar - marVar.get(trendLookback)) / mar >= trendDiff / 100
                ? 2
                : 0
              : (marVar.get(trendLookback) - mar) / marVar.get(trendLookback) <
                    trendDiff / 100 &&
                  (mar - marVar.get(trendLookback)) / mar < trendDiff / 100
                ? 3
                : 0
          : r.Std.na()
        : r.Std.na();
      const percentile = usePercentile
        ? percentileRank(marVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      // MAR is an unbounded ratio centered on 1.0, so the 0/100 constants are
      // the wrong band anchors here — see `percentileBand` (bugs #264, #537).
      return [
        mar,
        percentile,
        ...percentileBand(
          usePercentile,
          marVar,
          percentileLookback,
          r,
          this._context
        ),
        useTrendFilter && trend !== 0 && trend !== r.Std.na() ? 1 : r.Std.na(),
      ];
    };
  },
});

export const BBPB = (r) => ({
  name: 'Bollinger Bands %B (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 1,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 0,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#26A69A',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        maType: 'SMA',
        maLength: 20,
        in_0: 20,
        in_1: 2,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Bollinger Bands %B (Custom)',
    shortDescription: 'BB %B',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'maType',
        name: 'MA Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'VWMA', 'HMA', 'RMA'],
      },
      {
        id: 'maLength',
        name: 'MA length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_0',
        name: 'length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'in_1',
        name: 'mult',
        defval: 2,
        type: 'float',
        min: 0.001,
        max: 50,
      },
      ...percentileInputs,
    ],
    id: 'Bollinger Bands %B (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Bollinger Bands %B (Custom)',
    format: {
      precision: 4,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const maType = this._input(0);
      const maLength = this._input(1);
      const bbwLength = this._input(2);
      const bbwMult = this._input(3);
      const usePercentile = this._input(4);
      const percentileLookback = this._input(5);
      const percentilePercentage = this._input(6);
      this._context.setMinimumAdditionalDepth(
        bbwLength +
          maLength * (maType === 'TEMA' ? 3 : maType === 'DEMA' ? 2 : 1) +
          percentileLookback
      );
      const bbpb = bbpbCalc(
        r,
        this._context,
        maType,
        maLength,
        bbwLength,
        bbwMult
      );
      const bbpbVar = this._context.new_var(bbpb);
      const percentile = usePercentile
        ? percentileRank(bbpbVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        bbpb,
        percentile,
        ...percentileBand(
          usePercentile,
          bbpbVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

const divBull = {
  plottype: 'shape_label_up',
  location: 'BelowBar',
  visible: !0,
  color: divTeal,
  textColor: '#FFFFFF',
  transparency: 0,
};

const divBear = {
  plottype: 'shape_label_down',
  location: 'AboveBar',
  visible: !0,
  color: divRed,
  textColor: '#FFFFFF',
  transparency: 0,
};

const divBullHidden = {
  ...divBull,
  color: divGreen,
};

const divBearHidden = {
  ...divBear,
  color: divOrange,
};

const divStyles = {
  bullOne: divBull,
  bullTwo: divBull,
  bullThree: divBull,
  bullFour: divBull,
  bullFive: divBull,
  bullSix: divBull,
  bullSeven: divBull,
  bullEight: divBull,
  bullEightPlus: divBull,
  bearOne: divBear,
  bearTwo: divBear,
  bearThree: divBear,
  bearFour: divBear,
  bearFive: divBear,
  bearSix: divBear,
  bearSeven: divBear,
  bearEight: divBear,
  bearEightPlus: divBear,
  bullOneHidden: divBullHidden,
  bullTwoHidden: divBullHidden,
  bullThreeHidden: divBullHidden,
  bullFourHidden: divBullHidden,
  bullFiveHidden: divBullHidden,
  bullSixHidden: divBullHidden,
  bullSevenHidden: divBullHidden,
  bullEightHidden: divBullHidden,
  bullEightPlusHidden: divBullHidden,
  bearOneHidden: divBearHidden,
  bearTwoHidden: divBearHidden,
  bearThreeHidden: divBearHidden,
  bearFourHidden: divBearHidden,
  bearFiveHidden: divBearHidden,
  bearSixHidden: divBearHidden,
  bearSevenHidden: divBearHidden,
  bearEightHidden: divBearHidden,
  bearEightPlusHidden: divBearHidden,
};

const divTitle = (value) => {
  return { title: `${value}`, text: `${value}` };
};

export const DIV = (r) => ({
  name: 'Divergences',
  metainfo: {
    _metainfoVersion: 53,
    showLegendValues: false,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: divStyles,
      inputs: {
        minDiv: 2,
        pivotRight: 1,
        pivotLeft: 3,
        rangeUpper: 60,
        rangeLower: 1,
        plotBull: true,
        plotBullHidden: true,
        plotBear: true,
        plotBearHidden: true,
        mfi: true,
        /*  adx: true, */
        /*  bbw: true, */
        macd: true,
        rsi: true,
        /* vo: true, */
        cci: true,
        ao: true,
        wr: true,
        uo: true,
        mom: true,
        stoch: true,
        /* bbpb: true, */
      },
    },
    plots: Object.entries(divStyles).map(([k, v]) => ({
      id: k,
      type: 'shapes',
      plottype: v.plottype,
      location: v.location,
    })),
    styles: {
      bullOne: divTitle(1),
      bullTwo: divTitle(2),
      bullThree: divTitle(3),
      bullFour: divTitle(4),
      bullFive: divTitle(5),
      bullSix: divTitle(6),
      bullSeven: divTitle(7),
      bullEight: divTitle(8),
      bullEightPlus: divTitle('8+'),
      bearOne: divTitle(1),
      bearTwo: divTitle(2),
      bearThree: divTitle(3),
      bearFour: divTitle(4),
      bearFive: divTitle(5),
      bearSix: divTitle(6),
      bearSeven: divTitle(7),
      bearEight: divTitle(8),
      bearEightPlus: divTitle('8+'),
      bullOneHidden: divTitle(1),
      bullTwoHidden: divTitle(2),
      bullThreeHidden: divTitle(3),
      bullFourHidden: divTitle(4),
      bullFiveHidden: divTitle(5),
      bullSixHidden: divTitle(6),
      bullSevenHidden: divTitle(7),
      bullEightHidden: divTitle(8),
      bullEightPlusHidden: divTitle('8+'),
      bearOneHidden: divTitle(1),
      bearTwoHidden: divTitle(2),
      bearThreeHidden: divTitle(3),
      bearFourHidden: divTitle(4),
      bearFiveHidden: divTitle(5),
      bearSixHidden: divTitle(6),
      bearSevenHidden: divTitle(7),
      bearEightHidden: divTitle(8),
      bearEightPlusHidden: divTitle('8+'),
    },
    description: 'Divergences',
    shortDescription: 'Divergences',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Divergences@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Divergences',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'minDiv',
        name: 'Minimum Divergences Count to Display',
        defval: 2,
        type: 'integer',
        min: 1,
        max: 9,
      },
      {
        id: 'pivotRight',
        name: 'Pivot Lookback Right',
        defval: 1,
        type: 'integer',
        min: 1,
        max: 1e3,
      },
      {
        id: 'pivotLeft',
        name: 'Pivot Lookback Left',
        defval: 3,
        type: 'integer',
        min: 1,
        max: 1e3,
      },
      {
        id: 'rangeUpper',
        name: 'Max of Lookback Range',
        defval: 60,
        type: 'integer',
        min: 1,
        max: 1e3,
      },
      {
        id: 'rangeLower',
        name: 'Min of Lookback Range',
        defval: 1,
        type: 'integer',
        min: 1,
        max: 1e3,
      },
      {
        id: 'plotBull',
        name: 'Plot Bullish',
        defval: true,
        type: 'bool',
      },
      {
        id: 'plotBullHidden',
        name: 'Plot Hidden Bullish',
        defval: true,
        type: 'bool',
      },
      {
        id: 'plotBear',
        name: 'Plot Bearish',
        defval: true,
        type: 'bool',
      },
      {
        id: 'plotBearHidden',
        name: 'Plot Hidden Bearish',
        defval: true,
        type: 'bool',
      },
      {
        id: 'mfi',
        name: 'Money Flow Index (MFI)',
        defval: true,
        type: 'bool',
      },
      /*  {
        id: 'adx',
        name: 'Average Directional Index (ADX)',
        defval: true,
        type: 'bool',
      }, */
      /*  {
        id: 'bbw',
        name: 'Bollinger Bands Width (BBW)',
        defval: true,
        type: 'bool',
      }, */
      {
        id: 'macd',
        name: 'MACD',
        defval: true,
        type: 'bool',
      },
      {
        id: 'rsi',
        name: 'Relative Strength Index (RSI)',
        defval: true,
        type: 'bool',
      },
      /*  {
        id: 'vo',
        name: 'Volume Oscillator (VO)',
        defval: true,
        type: 'bool',
      }, */
      {
        id: 'cci',
        name: 'Commodity Channel Index (CCI)',
        defval: true,
        type: 'bool',
      },
      {
        id: 'ao',
        name: 'Awesome Oscillator (AO)',
        defval: true,
        type: 'bool',
      },
      {
        id: 'wr',
        name: 'Williams %R (WR)',
        defval: true,
        type: 'bool',
      },
      {
        id: 'uo',
        name: 'Ultimate Oscillator (UO)',
        defval: true,
        type: 'bool',
      },
      {
        id: 'mom',
        name: 'Momentum (MOM)',
        defval: true,
        type: 'bool',
      },
      {
        id: 'stoch',
        name: 'Stochastic',
        defval: true,
        type: 'bool',
      },
      /* {
        id: 'bbpb',
        name: 'Bollinger Bands %B (BBPB)',
        defval: true,
        type: 'bool',
      }, */
    ],
  },
  constructor: function () {
    this.plFound = function (osc, left, right) {
      return !r.Std.na(pivotLow(osc, left, right, r));
    };
    this.phFound = function (osc, left, right) {
      return !r.Std.na(pivotHigh(osc, left, right, r));
    };
    this.barssince = function (bool, barssinceVar) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const b = barssinceVar ?? this._context.new_var();
      if (!bool) {
        const prev = b.get();
        if (!r.Std.na(prev)) {
          b.set(prev + 1);
        }
      } else {
        b.set(0);
      }
      return b.get();
    };
    this._inRange = function (bool, rangeLower, rangeUpper, barssinceVar) {
      const bars = this.barssince(bool, barssinceVar);
      return rangeLower <= bars && bars <= rangeUpper;
    };
    // Higher Low on indicator
    this.oscHL = function (
      osc,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      barssinceVar,
      pivotVar
    ) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const v = pivotVar ?? this._context.new_var();
      const range = this.plFound(osc, left, right);
      v.set(range);
      const inRange = this._inRange(
        v.get(1),
        rangeLower,
        rangeUpper,
        barssinceVar
      );
      return (
        osc.get(right) >
          valuewhen(
            this._context,
            r,
            this.plFound(osc, left, right),
            osc.get(right),
            1,
            valuewhenVar
          ) && inRange
      );
    };
    // Lower Low on Price
    this.priceLL = function (osc, currentLow, left, right, valuewhenVar) {
      const valWhen = valuewhen(
        this._context,
        r,
        this.plFound(osc, left, right),
        currentLow.get(right),
        1,
        valuewhenVar
      );
      return currentLow.get(right) < valWhen;
    };
    // Regular Bullish
    this.bullCond = function (
      osc,
      plotBull,
      currentLow,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      valuewhenPriceVar,
      barssinceVar,
      pivotVar
    ) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const ll = this.priceLL(osc, currentLow, left, right, valuewhenPriceVar);
      const hl = this.oscHL(
        osc,
        left,
        right,
        rangeLower,
        rangeUpper,
        valuewhenVar,
        barssinceVar,
        pivotVar
      );
      const pl = this.plFound(osc, left, right);
      return plotBull && ll && hl && pl;
    };
    // Lower High on indicator
    this.oscLH = function (
      osc,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      barssinceVar,
      pivotVar
    ) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const v = pivotVar ?? this._context.new_var();
      const range = this.phFound(osc, left, right);
      v.set(range);
      const vw = valuewhen(
        this._context,
        r,
        this.phFound(osc, left, right),
        osc.get(right),
        1,
        valuewhenVar
      );

      const inRange = this._inRange(
        v.get(1),
        rangeLower,
        rangeUpper,
        barssinceVar
      );

      return osc.get(right) < vw && inRange;
    };
    // Higher High on Price
    this.priceHH = function (osc, left, right, currentHigh, valuewhenVar) {
      const vw = valuewhen(
        this._context,
        r,
        this.phFound(osc, left, right),
        currentHigh.get(right),
        1,
        valuewhenVar
      );
      return currentHigh.get(right) > vw;
    };
    // Regular Bearish
    this.bearCond = function (
      osc,
      plotBear,
      currentHigh,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      valuewhenPriceVar,
      barssinceVar,
      pivotVar
    ) {
      const hh = this.priceHH(osc, left, right, currentHigh, valuewhenPriceVar);
      const lh = this.oscLH(
        osc,
        left,
        right,
        rangeLower,
        rangeUpper,
        valuewhenVar,
        barssinceVar,
        pivotVar
      );
      const ph = this.phFound(osc, left, right);
      return plotBear && hh && lh && ph;
    };
    // Lower Low on indicator
    this.oscLL = function (
      osc,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      barssinceVar,
      pivotVar
    ) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const v = pivotVar ?? this._context.new_var();
      const range = this.plFound(osc, left, right);
      v.set(range);
      const inRange = this._inRange(
        v.get(1),
        rangeLower,
        rangeUpper,
        barssinceVar
      );
      return (
        osc.get(right) <
          valuewhen(
            this._context,
            r,
            this.plFound(osc, left, right),
            osc.get(right),
            1,
            valuewhenVar
          ) && inRange
      );
    };
    // Higher Low on Price
    this.priceHL = function (osc, currentLow, left, right, valuewhenVar) {
      return (
        currentLow.get(right) >
        valuewhen(
          this._context,
          r,
          this.plFound(osc, left, right),
          currentLow.get(right),
          1,
          valuewhenVar
        )
      );
    };
    // Hidden Bullish
    this.hiddenBullCond = function (
      osc,
      plotHiddenBull,
      currentLow,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      valuewhenPriceVar,
      barssinceVar,
      pivotVar
    ) {
      const hl = this.priceHL(osc, currentLow, left, right, valuewhenPriceVar);
      const ll = this.oscLL(
        osc,
        left,
        right,
        rangeLower,
        rangeUpper,
        valuewhenVar,
        barssinceVar,
        pivotVar
      );
      const pl = this.plFound(osc, left, right);
      return plotHiddenBull && hl && ll && pl;
    };
    // Higher High on indicator
    this.oscHH = function (
      osc,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      barssinceVar,
      pivotVar
    ) {
      if (!this._context.symbol.isBarClosed) {
        return r.Std.na();
      }
      const v = pivotVar ?? this._context.new_var();
      const range = this.phFound(osc, left, right);
      v.set(range);
      const inRange = this._inRange(
        v.get(1),
        rangeLower,
        rangeUpper,
        barssinceVar
      );
      return (
        osc.get(right) >
          valuewhen(
            this._context,
            r,
            this.phFound(osc, left, right),
            osc.get(right),
            1,
            valuewhenVar
          ) && inRange
      );
    };
    // Lower High on Price
    this.priceLH = function (osc, left, right, currentHigh, valuewhenVar) {
      return (
        currentHigh.get(right) <
        valuewhen(
          this._context,
          r,
          this.phFound(osc, left, right),
          currentHigh.get(right),
          1,
          valuewhenVar
        )
      );
    };
    // Hidden Bearish
    this.hiddenBearCond = function (
      osc,
      plotHiddenBear,
      currentHigh,
      left,
      right,
      rangeLower,
      rangeUpper,
      valuewhenVar,
      valuewhenPriceVar,
      barssinceVar,
      pivotVar
    ) {
      const lh = this.priceLH(osc, left, right, currentHigh, valuewhenPriceVar);
      const hh = this.oscHH(
        osc,
        left,
        right,
        rangeLower,
        rangeUpper,
        valuewhenVar,
        barssinceVar,
        pivotVar
      );
      const ph = this.phFound(osc, left, right);
      return plotHiddenBear && lh && hh && ph;
    };
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      this._context.setMinimumAdditionalDepth(200);
      const minDiv = this._input(0);
      const pivotRight = this._input(1);
      const pivotLeft = this._input(2);
      const rangeUpper = this._input(3);
      const rangeLower = this._input(4);
      const plotBull = this._input(5);
      const plotBullHidden = this._input(6);
      const plotBear = this._input(7);
      const plotBearHidden = this._input(8);
      const useMfi = this._input(9);
      /*  const useAdx = this._input(10)
      const useBbw = this._input(11) */
      const useMacd = this._input(10);
      const useRsi = this._input(11);
      /* const useVo = this._input(14) */
      const useCci = this._input(12);
      const useAo = this._input(13);
      const useWr = this._input(14);
      const useUo = this._input(15);
      const useMom = this._input(16);
      const useStoch = this._input(17);
      /*  const useBbpb = this._input(20) */
      const mfi = useMfi ? mfiCalc(r, this._context, 14) : null;
      /*  const adx = useAdx ? adxCalc(r, this._context, 14, 14)[0] : null
      const bbw = useBbw ? bbwCalc(r, this._context, 'SMA', 20, 20, 2) : null */
      const macd = useMacd
        ? macdCalc(r, this._context, 12, 26, 9, 'EMA', 'EMA', 'close')[0]
        : null;
      const rsi = useRsi ? rsiCalc(r, this._context, 14) : null;
      /* const vo = useVo ? voCalc(r, this._context, 5, 10) : null */
      const cci = useCci
        ? cciCalc(r, this._context, 10, 'close')?.[0]?.get()
        : null;
      const ao = useAo ? aoCalc(r, this._context) : null;
      const wr = useWr ? wrCalc(r, this._context, 14) : null;
      const uo = useUo ? uoCalc(r, this._context, 7, 14, 28) : null;
      const mom = useMom ? momCalc(r, this._context, 10, 'close') : null;
      const stoch = useStoch
        ? stochCalc(14, 1, 3, r, this._context)?.[1]
        : null;
      /*  const bbpb = useBbpb ? bbpbCalc(r, this._context, 'SMA', 20, 20, 2) : null */
      const low = r.Std.low(this._context);
      const lowVar = this._context.new_var(low);
      const high = r.Std.high(this._context);
      const highVar = this._context.new_var(high);
      const mfiVar = this._context.new_var(mfi);
      /* const adxVar = this._context.new_var(adx)
      const bbwVar = this._context.new_var(bbw) */
      const stochVar = this._context.new_var(stoch);
      const macdVar = this._context.new_var(macd);
      const rsiVar = this._context.new_var(rsi);
      /* const voVar = this._context.new_var(vo) */
      const cciVar = this._context.new_var(cci);
      const aoVar = this._context.new_var(ao);
      const wrVar = this._context.new_var(wr);
      const uoVar = this._context.new_var(uo);
      const momVar = this._context.new_var(mom);
      /* const bbpbVar = this._context.new_var(bbpb) */
      const size = 200;
      const mfiValueWhenBearVar = this._context.new_var();
      mfiValueWhenBearVar.get(size);
      const mfiValueWhenPriceBearVar = this._context.new_var();
      mfiValueWhenPriceBearVar.get(size);
      const mfiBarsSinceBearVar = this._context.new_var();
      mfiBarsSinceBearVar.get(size);
      const mfiValueWhenBullVar = this._context.new_var();
      mfiValueWhenBullVar.get(size);
      const mfiValueWhenPriceBullVar = this._context.new_var();
      mfiValueWhenPriceBullVar.get(size);
      const mfiBarsSinceBullVar = this._context.new_var();
      mfiBarsSinceBullVar.get(size);
      const _hmfiValueWhenBearVar = this._context.new_var();
      _hmfiValueWhenBearVar.get(size);
      const _hmfiValueWhenPriceBearVar = this._context.new_var();
      _hmfiValueWhenPriceBearVar.get(size);
      const _hmfiBarsSinceBearVar = this._context.new_var();
      _hmfiBarsSinceBearVar.get(size);
      const _hmfiValueWhenBullVar = this._context.new_var();
      _hmfiValueWhenBullVar.get(size);
      const _hmfiValueWhenPriceBullVar = this._context.new_var();
      _hmfiValueWhenPriceBullVar.get(size);
      const _hmfiBarsSinceBullVar = this._context.new_var();
      _hmfiBarsSinceBullVar.get(size);
      const stochValueWhenBearVar = this._context.new_var();
      stochValueWhenBearVar.get(size);
      const stochValueWhenPriceBearVar = this._context.new_var();
      stochValueWhenPriceBearVar.get(size);
      const stochBarsSinceBearVar = this._context.new_var();
      stochBarsSinceBearVar.get(size);
      const stochValueWhenBullVar = this._context.new_var();
      stochValueWhenBullVar.get(size);
      const stochValueWhenPriceBullVar = this._context.new_var();
      stochValueWhenPriceBullVar.get(size);
      const stochBarsSinceBullVar = this._context.new_var();
      stochBarsSinceBullVar.get(size);
      const _hstochValueWhenBearVar = this._context.new_var();
      _hstochValueWhenBearVar.get(size);
      const _hstochValueWhenPriceBearVar = this._context.new_var();
      _hstochValueWhenPriceBearVar.get(size);
      const _hstochBarsSinceBearVar = this._context.new_var();
      _hstochBarsSinceBearVar.get(size);
      const _hstochValueWhenBullVar = this._context.new_var();
      _hstochValueWhenBullVar.get(size);
      const _hstochValueWhenPriceBullVar = this._context.new_var();
      _hstochValueWhenPriceBullVar.get(size);
      const _hstochBarsSinceBullVar = this._context.new_var();
      _hstochBarsSinceBullVar.get(size);
      /* const adxValueWhenBearVar = this._context.new_var()
      adxValueWhenBearVar.get(size)
      const adxValueWhenPriceBearVar = this._context.new_var()
      adxValueWhenPriceBearVar.get(size)
      const adxBarsSinceBearVar = this._context.new_var()
      adxBarsSinceBearVar.get(size)
      const adxValueWhenBullVar = this._context.new_var()
      adxValueWhenBullVar.get(size)
      const adxValueWhenPriceBullVar = this._context.new_var()
      adxValueWhenPriceBullVar.get(size)
      const adxBarsSinceBullVar = this._context.new_var()
      adxBarsSinceBullVar.get(size) */
      /* const _hadxValueWhenBearVar = this._context.new_var()
      _hadxValueWhenBearVar.get(size)
      const _hadxValueWhenPriceBearVar = this._context.new_var()
      _hadxValueWhenPriceBearVar.get(size)
      const _hadxBarsSinceBearVar = this._context.new_var()
      _hadxBarsSinceBearVar.get(size)
      const _hadxValueWhenBullVar = this._context.new_var()
      _hadxValueWhenBullVar.get(size)
      const _hadxValueWhenPriceBullVar = this._context.new_var()
      _hadxValueWhenPriceBullVar.get(size)
      const _hadxBarsSinceBullVar = this._context.new_var()
      _hadxBarsSinceBullVar.get(size) */
      /*  const bbwValueWhenBearVar = this._context.new_var()
      bbwValueWhenBearVar.get(size)
      const bbwValueWhenPriceBearVar = this._context.new_var()
      bbwValueWhenPriceBearVar.get(size)
      const bbwBarsSinceBearVar = this._context.new_var()
      bbwBarsSinceBearVar.get(size)
      const bbwValueWhenBullVar = this._context.new_var()
      bbwValueWhenBullVar.get(size)
      const bbwValueWhenPriceBullVar = this._context.new_var()
      bbwValueWhenPriceBullVar.get(size)
      const bbwBarsSinceBullVar = this._context.new_var()
      bbwBarsSinceBullVar.get(size) */
      /*  const _hbbwValueWhenBearVar = this._context.new_var()
      _hbbwValueWhenBearVar.get(size)
      const _hbbwValueWhenPriceBearVar = this._context.new_var()
      _hbbwValueWhenPriceBearVar.get(size)
      const _hbbwBarsSinceBearVar = this._context.new_var()
      _hbbwBarsSinceBearVar.get(size)
      const _hbbwValueWhenBullVar = this._context.new_var()
      _hbbwValueWhenBullVar.get(size)
      const _hbbwValueWhenPriceBullVar = this._context.new_var()
      _hbbwValueWhenPriceBullVar.get(size)
      const _hbbwBarsSinceBullVar = this._context.new_var()
      _hbbwBarsSinceBullVar.get(size) */
      const macdValueWhenBearVar = this._context.new_var();
      macdValueWhenBearVar.get(size);
      const macdValueWhenPriceBearVar = this._context.new_var();
      macdValueWhenPriceBearVar.get(size);
      const macdBarsSinceBearVar = this._context.new_var();
      macdBarsSinceBearVar.get(size);
      const macdValueWhenBullVar = this._context.new_var();
      macdValueWhenBullVar.get(size);
      const macdValueWhenPriceBullVar = this._context.new_var();
      macdValueWhenPriceBullVar.get(size);
      const macdBarsSinceBullVar = this._context.new_var();
      macdBarsSinceBullVar.get(size);
      const _hmacdValueWhenBearVar = this._context.new_var();
      _hmacdValueWhenBearVar.get(size);
      const _hmacdValueWhenPriceBearVar = this._context.new_var();
      _hmacdValueWhenPriceBearVar.get(size);
      const _hmacdBarsSinceBearVar = this._context.new_var();
      _hmacdBarsSinceBearVar.get(size);
      const _hmacdValueWhenBullVar = this._context.new_var();
      _hmacdValueWhenBullVar.get(size);
      const _hmacdValueWhenPriceBullVar = this._context.new_var();
      _hmacdValueWhenPriceBullVar.get(size);
      const _hmacdBarsSinceBullVar = this._context.new_var();
      _hmacdBarsSinceBullVar.get(size);
      const rsiValueWhenBearVar = this._context.new_var();
      rsiValueWhenBearVar.get(size);
      const rsiValueWhenPriceBearVar = this._context.new_var();
      rsiValueWhenPriceBearVar.get(size);
      const rsiBarsSinceBearVar = this._context.new_var();
      rsiBarsSinceBearVar.get(size);
      const rsiValueWhenBullVar = this._context.new_var();
      rsiValueWhenBullVar.get(size);
      const rsiValueWhenPriceBullVar = this._context.new_var();
      rsiValueWhenPriceBullVar.get(size);
      const rsiBarsSinceBullVar = this._context.new_var();
      rsiBarsSinceBullVar.get(size);
      const _hrsiValueWhenBearVar = this._context.new_var();
      _hrsiValueWhenBearVar.get(size);
      const _hrsiValueWhenPriceBearVar = this._context.new_var();
      _hrsiValueWhenPriceBearVar.get(size);
      const _hrsiBarsSinceBearVar = this._context.new_var();
      _hrsiBarsSinceBearVar.get(size);
      const _hrsiValueWhenBullVar = this._context.new_var();
      _hrsiValueWhenBullVar.get(size);
      const _hrsiValueWhenPriceBullVar = this._context.new_var();
      _hrsiValueWhenPriceBullVar.get(size);
      const _hrsiBarsSinceBullVar = this._context.new_var();
      _hrsiBarsSinceBullVar.get(size);
      /* const voValueWhenBearVar = this._context.new_var()
      voValueWhenBearVar.get(size)
      const voValueWhenPriceBearVar = this._context.new_var()
      voValueWhenPriceBearVar.get(size)
      const voBarsSinceBearVar = this._context.new_var()
      voBarsSinceBearVar.get(size)
      const voValueWhenBullVar = this._context.new_var()
      voValueWhenBullVar.get(size)
      const voValueWhenPriceBullVar = this._context.new_var()
      voValueWhenPriceBullVar.get(size)
      const voBarsSinceBullVar = this._context.new_var()
      voBarsSinceBullVar.get(size) */
      /*  const _hvoValueWhenBearVar = this._context.new_var()
      _hvoValueWhenBearVar.get(size)
      const _hvoValueWhenPriceBearVar = this._context.new_var()
      _hvoValueWhenPriceBearVar.get(size)
      const _hvoBarsSinceBearVar = this._context.new_var()
      _hvoBarsSinceBearVar.get(size)
      const _hvoValueWhenBullVar = this._context.new_var()
      _hvoValueWhenBullVar.get(size)
      const _hvoValueWhenPriceBullVar = this._context.new_var()
      _hvoValueWhenPriceBullVar.get(size)
      const _hvoBarsSinceBullVar = this._context.new_var()
      _hvoBarsSinceBullVar.get(size) */
      const cciValueWhenBearVar = this._context.new_var();
      cciValueWhenBearVar.get(size);
      const cciValueWhenPriceBearVar = this._context.new_var();
      cciValueWhenPriceBearVar.get(size);
      const cciBarsSinceBearVar = this._context.new_var();
      cciBarsSinceBearVar.get(size);
      const cciValueWhenBullVar = this._context.new_var();
      cciValueWhenBullVar.get(size);
      const cciValueWhenPriceBullVar = this._context.new_var();
      cciValueWhenPriceBullVar.get(size);
      const cciBarsSinceBullVar = this._context.new_var();
      cciBarsSinceBullVar.get(size);
      const _hcciValueWhenBearVar = this._context.new_var();
      _hcciValueWhenBearVar.get(size);
      const _hcciValueWhenPriceBearVar = this._context.new_var();
      _hcciValueWhenPriceBearVar.get(size);
      const _hcciBarsSinceBearVar = this._context.new_var();
      _hcciBarsSinceBearVar.get(size);
      const _hcciValueWhenBullVar = this._context.new_var();
      _hcciValueWhenBullVar.get(size);
      const _hcciValueWhenPriceBullVar = this._context.new_var();
      _hcciValueWhenPriceBullVar.get(size);
      const _hcciBarsSinceBullVar = this._context.new_var();
      _hcciBarsSinceBullVar.get(size);
      const aoValueWhenBearVar = this._context.new_var();
      aoValueWhenBearVar.get(size);
      const aoValueWhenPriceBearVar = this._context.new_var();
      aoValueWhenPriceBearVar.get(size);
      const aoBarsSinceBearVar = this._context.new_var();
      aoBarsSinceBearVar.get(size);
      const aoValueWhenBullVar = this._context.new_var();
      aoValueWhenBullVar.get(size);
      const aoValueWhenPriceBullVar = this._context.new_var();
      aoValueWhenPriceBullVar.get(size);
      const aoBarsSinceBullVar = this._context.new_var();
      aoBarsSinceBullVar.get(size);
      const _haoValueWhenBearVar = this._context.new_var();
      _haoValueWhenBearVar.get(size);
      const _haoValueWhenPriceBearVar = this._context.new_var();
      _haoValueWhenPriceBearVar.get(size);
      const _haoBarsSinceBearVar = this._context.new_var();
      _haoBarsSinceBearVar.get(size);
      const _haoValueWhenBullVar = this._context.new_var();
      _haoValueWhenBullVar.get(size);
      const _haoValueWhenPriceBullVar = this._context.new_var();
      _haoValueWhenPriceBullVar.get(size);
      const _haoBarsSinceBullVar = this._context.new_var();
      _haoBarsSinceBullVar.get(size);
      const wrValueWhenBearVar = this._context.new_var();
      wrValueWhenBearVar.get(size);
      const wrValueWhenPriceBearVar = this._context.new_var();
      wrValueWhenPriceBearVar.get(size);
      const wrBarsSinceBearVar = this._context.new_var();
      wrBarsSinceBearVar.get(size);
      const wrValueWhenBullVar = this._context.new_var();
      wrValueWhenBullVar.get(size);
      const wrValueWhenPriceBullVar = this._context.new_var();
      wrValueWhenPriceBullVar.get(size);
      const wrBarsSinceBullVar = this._context.new_var();
      wrBarsSinceBullVar.get(size);
      const _hwrValueWhenBearVar = this._context.new_var();
      _hwrValueWhenBearVar.get(size);
      const _hwrValueWhenPriceBearVar = this._context.new_var();
      _hwrValueWhenPriceBearVar.get(size);
      const _hwrBarsSinceBearVar = this._context.new_var();
      _hwrBarsSinceBearVar.get(size);
      const _hwrValueWhenBullVar = this._context.new_var();
      _hwrValueWhenBullVar.get(size);
      const _hwrValueWhenPriceBullVar = this._context.new_var();
      _hwrValueWhenPriceBullVar.get(size);
      const _hwrBarsSinceBullVar = this._context.new_var();
      _hwrBarsSinceBullVar.get(size);
      const uoValueWhenBearVar = this._context.new_var();
      uoValueWhenBearVar.get(size);
      const uoValueWhenPriceBearVar = this._context.new_var();
      uoValueWhenPriceBearVar.get(size);
      const uoBarsSinceBearVar = this._context.new_var();
      uoBarsSinceBearVar.get(size);
      const uoValueWhenBullVar = this._context.new_var();
      uoValueWhenBullVar.get(size);
      const uoValueWhenPriceBullVar = this._context.new_var();
      uoValueWhenPriceBullVar.get(size);
      const uoBarsSinceBullVar = this._context.new_var();
      uoBarsSinceBullVar.get(size);
      const _huoValueWhenBearVar = this._context.new_var();
      _huoValueWhenBearVar.get(size);
      const _huoValueWhenPriceBearVar = this._context.new_var();
      _huoValueWhenPriceBearVar.get(size);
      const _huoBarsSinceBearVar = this._context.new_var();
      _huoBarsSinceBearVar.get(size);
      const _huoValueWhenBullVar = this._context.new_var();
      _huoValueWhenBullVar.get(size);
      const _huoValueWhenPriceBullVar = this._context.new_var();
      _huoValueWhenPriceBullVar.get(size);
      const _huoBarsSinceBullVar = this._context.new_var();
      _huoBarsSinceBullVar.get(size);
      const momValueWhenBearVar = this._context.new_var();
      momValueWhenBearVar.get(size);
      const momValueWhenPriceBearVar = this._context.new_var();
      momValueWhenPriceBearVar.get(size);
      const momBarsSinceBearVar = this._context.new_var();
      momBarsSinceBearVar.get(size);
      const momValueWhenBullVar = this._context.new_var();
      momValueWhenBullVar.get(size);
      const momValueWhenPriceBullVar = this._context.new_var();
      momValueWhenPriceBullVar.get(size);
      const momBarsSinceBullVar = this._context.new_var();
      momBarsSinceBullVar.get(size);
      const _hmomValueWhenBearVar = this._context.new_var();
      _hmomValueWhenBearVar.get(size);
      const _hmomValueWhenPriceBearVar = this._context.new_var();
      _hmomValueWhenPriceBearVar.get(size);
      const _hmomBarsSinceBearVar = this._context.new_var();
      _hmomBarsSinceBearVar.get(size);
      const _hmomValueWhenBullVar = this._context.new_var();
      _hmomValueWhenBullVar.get(size);
      const _hmomValueWhenPriceBullVar = this._context.new_var();
      _hmomValueWhenPriceBullVar.get(size);
      const _hmomBarsSinceBullVar = this._context.new_var();
      _hmomBarsSinceBullVar.get(size);
      /*  const bbpbValueWhenBearVar = this._context.new_var()
      bbpbValueWhenBearVar.get(size)
      const bbpbValueWhenPriceBearVar = this._context.new_var()
      bbpbValueWhenPriceBearVar.get(size)
      const bbpbBarsSinceBearVar = this._context.new_var()
      bbpbBarsSinceBearVar.get(size)
      const bbpbValueWhenBullVar = this._context.new_var()
      bbpbValueWhenBullVar.get(size)
      const bbpbValueWhenPriceBullVar = this._context.new_var()
      bbpbValueWhenPriceBullVar.get(size)
      const bbpbBarsSinceBullVar = this._context.new_var()
      bbpbBarsSinceBullVar.get(size) */
      /* const _hbbpbValueWhenBearVar = this._context.new_var()
      _hbbpbValueWhenBearVar.get(size)
      const _hbbpbValueWhenPriceBearVar = this._context.new_var()
      _hbbpbValueWhenPriceBearVar.get(size)
      const _hbbpbBarsSinceBearVar = this._context.new_var()
      _hbbpbBarsSinceBearVar.get(size)
      const _hbbpbValueWhenBullVar = this._context.new_var()
      _hbbpbValueWhenBullVar.get(size)
      const _hbbpbValueWhenPriceBullVar = this._context.new_var()
      _hbbpbValueWhenPriceBullVar.get(size)
      const _hbbpbBarsSinceBullVar = this._context.new_var()
      _hbbpbBarsSinceBullVar.get(size) */
      const mfiPivotBearVar = this._context.new_var();
      mfiPivotBearVar.get(size);
      const mfiPivotBullVar = this._context.new_var();
      mfiPivotBullVar.get(size);
      const _hmfiPivotBearVar = this._context.new_var();
      _hmfiPivotBearVar.get(size);
      const _hmfiPivotBullVar = this._context.new_var();
      _hmfiPivotBullVar.get(size);
      const stochPivotBearVar = this._context.new_var();
      stochPivotBearVar.get(size);
      const stochPivotBullVar = this._context.new_var();
      stochPivotBullVar.get(size);
      const _hstochPivotBearVar = this._context.new_var();
      _hstochPivotBearVar.get(size);
      const _hstochPivotBullVar = this._context.new_var();
      _hstochPivotBullVar.get(size);
      /*  const adxPivotBearVar = this._context.new_var()
      adxPivotBearVar.get(size)
      const adxPivotBullVar = this._context.new_var()
      adxPivotBullVar.get(size)
      const _hadxPivotBearVar = this._context.new_var()
      _hadxPivotBearVar.get(size)
      const _hadxPivotBullVar = this._context.new_var()
      _hadxPivotBullVar.get(size) */
      /*  const bbwPivotBearVar = this._context.new_var()
      bbwPivotBearVar.get(size)
      const bbwPivotBullVar = this._context.new_var()
      bbwPivotBullVar.get(size)
      const _hbbwPivotBearVar = this._context.new_var()
      _hbbwPivotBearVar.get(size)
      const _hbbwPivotBullVar = this._context.new_var()
      _hbbwPivotBullVar.get(size) */
      const macdPivotBearVar = this._context.new_var();
      macdPivotBearVar.get(size);
      const macdPivotBullVar = this._context.new_var();
      macdPivotBullVar.get(size);
      const _hmacdPivotBearVar = this._context.new_var();
      _hmacdPivotBearVar.get(size);
      const _hmacdPivotBullVar = this._context.new_var();
      _hmacdPivotBullVar.get(size);
      const rsiPivotBearVar = this._context.new_var();
      rsiPivotBearVar.get(size);
      const rsiPivotBullVar = this._context.new_var();
      rsiPivotBullVar.get(size);
      const _hrsiPivotBearVar = this._context.new_var();
      _hrsiPivotBearVar.get(size);
      const _hrsiPivotBullVar = this._context.new_var();
      _hrsiPivotBullVar.get(size);
      /*  const voPivotBearVar = this._context.new_var()
      voPivotBearVar.get(size)
      const voPivotBullVar = this._context.new_var()
      voPivotBullVar.get(size)
      const _hvoPivotBearVar = this._context.new_var()
      _hvoPivotBearVar.get(size)
      const _hvoPivotBullVar = this._context.new_var()
      _hvoPivotBullVar.get(size) */
      const cciPivotBearVar = this._context.new_var();
      cciPivotBearVar.get(size);
      const cciPivotBullVar = this._context.new_var();
      cciPivotBullVar.get(size);
      const _hcciPivotBearVar = this._context.new_var();
      _hcciPivotBearVar.get(size);
      const _hcciPivotBullVar = this._context.new_var();
      _hcciPivotBullVar.get(size);
      const aoPivotBearVar = this._context.new_var();
      aoPivotBearVar.get(size);
      const aoPivotBullVar = this._context.new_var();
      aoPivotBullVar.get(size);
      const _haoPivotBearVar = this._context.new_var();
      _haoPivotBearVar.get(size);
      const _haoPivotBullVar = this._context.new_var();
      _haoPivotBullVar.get(size);
      const wrPivotBearVar = this._context.new_var();
      wrPivotBearVar.get(size);
      const wrPivotBullVar = this._context.new_var();
      wrPivotBullVar.get(size);
      const _hwrPivotBearVar = this._context.new_var();
      _hwrPivotBearVar.get(size);
      const _hwrPivotBullVar = this._context.new_var();
      _hwrPivotBullVar.get(size);
      const uoPivotBearVar = this._context.new_var();
      uoPivotBearVar.get(size);
      const uoPivotBullVar = this._context.new_var();
      uoPivotBullVar.get(size);
      const _huoPivotBearVar = this._context.new_var();
      _huoPivotBearVar.get(size);
      const _huoPivotBullVar = this._context.new_var();
      _huoPivotBullVar.get(size);
      const momPivotBearVar = this._context.new_var();
      momPivotBearVar.get(size);
      const momPivotBullVar = this._context.new_var();
      momPivotBullVar.get(size);
      const _hmomPivotBearVar = this._context.new_var();
      _hmomPivotBearVar.get(size);
      const _hmomPivotBullVar = this._context.new_var();
      _hmomPivotBullVar.get(size);
      /*  const bbpbPivotBearVar = this._context.new_var()
      bbpbPivotBearVar.get(size)
      const bbpbPivotBullVar = this._context.new_var()
      bbpbPivotBullVar.get(size)
      const _hbbpbPivotBearVar = this._context.new_var()
      _hbbpbPivotBearVar.get(size)
      const _hbbpbPivotBullVar = this._context.new_var()
      _hbbpbPivotBullVar.get(size) */
      let negdivergence = 0;
      if (
        useMfi &&
        this.bearCond(
          mfiVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          mfiValueWhenBearVar,
          mfiValueWhenPriceBearVar,
          mfiBarsSinceBearVar,
          mfiPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useStoch &&
        this.bearCond(
          stochVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          stochValueWhenBearVar,
          stochValueWhenPriceBearVar,
          stochBarsSinceBearVar,
          stochPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      /* if (
        useAdx &&
        this.bearCond(
          adxVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          adxValueWhenBearVar,
          adxValueWhenPriceBearVar,
          adxBarsSinceBearVar,
          adxPivotBearVar,
        )
      ) {
        negdivergence += 1
      } */
      /* if (
        useBbw &&
        this.bearCond(
          bbwVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          bbwValueWhenBearVar,
          bbwValueWhenPriceBearVar,
          bbwBarsSinceBearVar,
          bbwPivotBearVar,
        )
      ) {
        negdivergence += 1
      } */
      if (
        useMacd &&
        this.bearCond(
          macdVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          macdValueWhenBearVar,
          macdValueWhenPriceBearVar,
          macdBarsSinceBearVar,
          macdPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useRsi &&
        this.bearCond(
          rsiVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          rsiValueWhenBearVar,
          rsiValueWhenPriceBearVar,
          rsiBarsSinceBearVar,
          rsiPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      /* if (
        useVo &&
        this.bearCond(
          voVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          voValueWhenBearVar,
          voValueWhenPriceBearVar,
          voBarsSinceBearVar,
          voPivotBearVar,
        )
      ) {
        negdivergence += 1
      } */
      if (
        useCci &&
        this.bearCond(
          cciVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          cciValueWhenBearVar,
          cciValueWhenPriceBearVar,
          cciBarsSinceBearVar,
          cciPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useAo &&
        this.bearCond(
          aoVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          aoValueWhenBearVar,
          aoValueWhenPriceBearVar,
          aoBarsSinceBearVar,
          aoPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useWr &&
        this.bearCond(
          wrVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          wrValueWhenBearVar,
          wrValueWhenPriceBearVar,
          wrBarsSinceBearVar,
          wrPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useUo &&
        this.bearCond(
          uoVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          uoValueWhenBearVar,
          uoValueWhenPriceBearVar,
          uoBarsSinceBearVar,
          uoPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      if (
        useMom &&
        this.bearCond(
          momVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          momValueWhenBearVar,
          momValueWhenPriceBearVar,
          momBarsSinceBearVar,
          momPivotBearVar
        )
      ) {
        negdivergence += 1;
      }
      /* if (
        useBbpb &&
        this.bearCond(
          bbpbVar,
          plotBear,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          bbpbValueWhenBearVar,
          bbpbValueWhenPriceBearVar,
          bbpbBarsSinceBearVar,
          bbpbPivotBearVar,
        )
      ) {
        negdivergence += 1
      } */
      let posdivergence = 0;
      if (
        useMfi &&
        this.bullCond(
          mfiVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          mfiValueWhenBullVar,
          mfiValueWhenPriceBullVar,
          mfiBarsSinceBullVar,
          mfiPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useStoch &&
        this.bullCond(
          stochVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          stochValueWhenBullVar,
          stochValueWhenPriceBullVar,
          stochBarsSinceBullVar,
          stochPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      /* if (
        useAdx &&
        this.bullCond(
          adxVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          adxValueWhenBullVar,
          adxValueWhenPriceBullVar,
          adxBarsSinceBullVar,
          adxPivotBullVar,
        )
      ) {
        posdivergence += 1
      } */
      /* if (
        useBbw &&
        this.bullCond(
          bbwVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          bbwValueWhenBullVar,
          bbwValueWhenPriceBullVar,
          bbwBarsSinceBullVar,
          bbwPivotBullVar,
        )
      ) {
        posdivergence += 1
      } */
      if (
        useMacd &&
        this.bullCond(
          macdVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          macdValueWhenBullVar,
          macdValueWhenPriceBullVar,
          macdBarsSinceBullVar,
          macdPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useRsi &&
        this.bullCond(
          rsiVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          rsiValueWhenBullVar,
          rsiValueWhenPriceBullVar,
          rsiBarsSinceBullVar,
          rsiPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      /* if (
        useVo &&
        this.bullCond(
          voVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          voValueWhenBullVar,
          voValueWhenPriceBullVar,
          voBarsSinceBullVar,
          voPivotBullVar,
        )
      ) {
        posdivergence += 1
      } */
      if (
        useCci &&
        this.bullCond(
          cciVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          cciValueWhenBullVar,
          cciValueWhenPriceBullVar,
          cciBarsSinceBullVar,
          cciPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useAo &&
        this.bullCond(
          aoVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          aoValueWhenBullVar,
          aoValueWhenPriceBullVar,
          aoBarsSinceBullVar,
          aoPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useWr &&
        this.bullCond(
          wrVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          wrValueWhenBullVar,
          wrValueWhenPriceBullVar,
          wrBarsSinceBullVar,
          wrPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useUo &&
        this.bullCond(
          uoVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          uoValueWhenBullVar,
          uoValueWhenPriceBullVar,
          uoBarsSinceBullVar,
          uoPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      if (
        useMom &&
        this.bullCond(
          momVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          momValueWhenBullVar,
          momValueWhenPriceBullVar,
          momBarsSinceBullVar,
          momPivotBullVar
        )
      ) {
        posdivergence += 1;
      }
      /* if (
        useBbpb &&
        this.bullCond(
          bbpbVar,
          plotBull,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          bbpbValueWhenBullVar,
          bbpbValueWhenPriceBullVar,
          bbpbBarsSinceBullVar,
          bbpbPivotBullVar,
        )
      ) {
        posdivergence += 1
      } */
      let negdivergencehidden = 0;
      if (
        useMfi &&
        this.hiddenBearCond(
          mfiVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmfiValueWhenBearVar,
          _hmfiValueWhenPriceBearVar,
          _hmfiBarsSinceBearVar,
          _hmfiPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useStoch &&
        this.hiddenBearCond(
          stochVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hstochValueWhenBearVar,
          _hstochValueWhenPriceBearVar,
          _hstochBarsSinceBearVar,
          _hstochPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      /* if (
        useAdx &&
        this.hiddenBearCond(
          adxVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hadxValueWhenBearVar,
          _hadxValueWhenPriceBearVar,
          _hadxBarsSinceBearVar,
          _hadxPivotBearVar,
        )
      ) {
        negdivergencehidden += 1
      } */
      /* if (
        useBbw &&
        this.hiddenBearCond(
          bbwVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hbbwValueWhenBearVar,
          _hbbwValueWhenPriceBearVar,
          _hbbwBarsSinceBearVar,
          _hbbwPivotBearVar,
        )
      ) {
        negdivergencehidden += 1
      } */
      if (
        useMacd &&
        this.hiddenBearCond(
          macdVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmacdValueWhenBearVar,
          _hmacdValueWhenPriceBearVar,
          _hmacdBarsSinceBearVar,
          _hmacdPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useRsi &&
        this.hiddenBearCond(
          rsiVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hrsiValueWhenBearVar,
          _hrsiValueWhenPriceBearVar,
          _hrsiBarsSinceBearVar,
          _hrsiPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      /*  if (
        useVo &&
        this.hiddenBearCond(
          voVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hvoValueWhenBearVar,
          _hvoValueWhenPriceBearVar,
          _hvoBarsSinceBearVar,
          _hvoPivotBearVar,
        )
      ) {
        negdivergencehidden += 1
      } */
      if (
        useCci &&
        this.hiddenBearCond(
          cciVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hcciValueWhenBearVar,
          _hcciValueWhenPriceBearVar,
          _hcciBarsSinceBearVar,
          _hcciPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useAo &&
        this.hiddenBearCond(
          aoVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _haoValueWhenBearVar,
          _haoValueWhenPriceBearVar,
          _haoBarsSinceBearVar,
          _haoPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useWr &&
        this.hiddenBearCond(
          wrVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hwrValueWhenBearVar,
          _hwrValueWhenPriceBearVar,
          _hwrBarsSinceBearVar,
          _hwrPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useUo &&
        this.hiddenBearCond(
          uoVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _huoValueWhenBearVar,
          _huoValueWhenPriceBearVar,
          _huoBarsSinceBearVar,
          _huoPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      if (
        useMom &&
        this.hiddenBearCond(
          momVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmomValueWhenBearVar,
          _hmomValueWhenPriceBearVar,
          _hmomBarsSinceBearVar,
          _hmomPivotBearVar
        )
      ) {
        negdivergencehidden += 1;
      }
      /* if (
        useBbpb &&
        this.hiddenBearCond(
          bbpbVar,
          plotBearHidden,
          highVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hbbpbValueWhenBearVar,
          _hbbpbValueWhenPriceBearVar,
          _hbbpbBarsSinceBearVar,
          _hbbpbPivotBearVar,
        )
      ) {
        negdivergencehidden += 1
      } */
      let posdivergencehidden = 0;
      if (
        useMfi &&
        this.hiddenBullCond(
          mfiVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmfiValueWhenBullVar,
          _hmfiValueWhenPriceBullVar,
          _hmfiBarsSinceBullVar,
          _hmfiPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useStoch &&
        this.hiddenBullCond(
          stochVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hstochValueWhenBullVar,
          _hstochValueWhenPriceBullVar,
          _hstochBarsSinceBullVar,
          _hstochPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      /* if (
        useAdx &&
        this.hiddenBullCond(
          adxVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hadxValueWhenBullVar,
          _hadxValueWhenPriceBullVar,
          _hadxBarsSinceBullVar,
          _hadxPivotBullVar,
        )
      ) {
        posdivergencehidden += 1
      } */
      /* if (
        useBbw &&
        this.hiddenBullCond(
          bbwVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hbbwValueWhenBullVar,
          _hbbwValueWhenPriceBullVar,
          _hbbwBarsSinceBullVar,
          _hbbwPivotBullVar,
        )
      ) {
        posdivergencehidden += 1
      } */
      if (
        useMacd &&
        this.hiddenBullCond(
          macdVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmacdValueWhenBullVar,
          _hmacdValueWhenPriceBullVar,
          _hmacdBarsSinceBullVar,
          _hmacdPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useRsi &&
        this.hiddenBullCond(
          rsiVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hrsiValueWhenBullVar,
          _hrsiValueWhenPriceBullVar,
          _hrsiBarsSinceBullVar,
          _hrsiPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      /* if (
        useVo &&
        this.hiddenBullCond(
          voVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hvoValueWhenBullVar,
          _hvoValueWhenPriceBullVar,
          _hvoBarsSinceBullVar,
          _hvoPivotBullVar,
        )
      ) {
        posdivergencehidden += 1
      } */
      if (
        useCci &&
        this.hiddenBullCond(
          cciVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hcciValueWhenBullVar,
          _hcciValueWhenPriceBullVar,
          _hcciBarsSinceBullVar,
          _hcciPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useAo &&
        this.hiddenBullCond(
          aoVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _haoValueWhenBullVar,
          _haoValueWhenPriceBullVar,
          _haoBarsSinceBullVar,
          _haoPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useWr &&
        this.hiddenBullCond(
          wrVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hwrValueWhenBullVar,
          _hwrValueWhenPriceBullVar,
          _hwrBarsSinceBullVar,
          _hwrPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useUo &&
        this.hiddenBullCond(
          uoVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _huoValueWhenBullVar,
          _huoValueWhenPriceBullVar,
          _huoBarsSinceBullVar,
          _huoPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      if (
        useMom &&
        this.hiddenBullCond(
          momVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hmomValueWhenBullVar,
          _hmomValueWhenPriceBullVar,
          _hmomBarsSinceBullVar,
          _hmomPivotBullVar
        )
      ) {
        posdivergencehidden += 1;
      }
      /*  if (
        useBbpb &&
        this.hiddenBullCond(
          bbpbVar,
          plotBullHidden,
          lowVar,
          pivotLeft,
          pivotRight,
          rangeLower,
          rangeUpper,
          _hbbpbValueWhenBullVar,
          _hbbpbValueWhenPriceBullVar,
          _hbbpbBarsSinceBullVar,
          _hbbpbPivotBullVar,
        )
      ) {
        posdivergencehidden += 1
      } */
      return [
        posdivergence === 1 && minDiv < 2 ? 1 : 0,
        posdivergence === 2 && minDiv < 3 ? 1 : 0,
        posdivergence === 3 && minDiv < 4 ? 1 : 0,
        posdivergence === 4 && minDiv < 5 ? 1 : 0,
        posdivergence === 5 && minDiv < 6 ? 1 : 0,
        posdivergence === 6 && minDiv < 7 ? 1 : 0,
        posdivergence === 7 && minDiv < 8 ? 1 : 0,
        posdivergence === 8 && minDiv < 9 ? 1 : 0,
        posdivergence > 8 ? 1 : 0,
        negdivergence === 1 && minDiv < 2 ? 1 : 0,
        negdivergence === 2 && minDiv < 3 ? 1 : 0,
        negdivergence === 3 && minDiv < 4 ? 1 : 0,
        negdivergence === 4 && minDiv < 5 ? 1 : 0,
        negdivergence === 5 && minDiv < 6 ? 1 : 0,
        negdivergence === 6 && minDiv < 7 ? 1 : 0,
        negdivergence === 7 && minDiv < 8 ? 1 : 0,
        negdivergence === 8 && minDiv < 9 ? 1 : 0,
        negdivergence > 8 ? 1 : 0,
        posdivergencehidden === 1 && minDiv < 2 ? 1 : 0,
        posdivergencehidden === 2 && minDiv < 3 ? 1 : 0,
        posdivergencehidden === 3 && minDiv < 4 ? 1 : 0,
        posdivergencehidden === 4 && minDiv < 5 ? 1 : 0,
        posdivergencehidden === 5 && minDiv < 6 ? 1 : 0,
        posdivergencehidden === 6 && minDiv < 7 ? 1 : 0,
        posdivergencehidden === 7 && minDiv < 8 ? 1 : 0,
        posdivergencehidden === 8 && minDiv < 9 ? 1 : 0,
        posdivergencehidden > 8 ? 1 : 0,
        negdivergencehidden === 1 && minDiv < 2 ? 1 : 0,
        negdivergencehidden === 2 && minDiv < 3 ? 1 : 0,
        negdivergencehidden === 3 && minDiv < 4 ? 1 : 0,
        negdivergencehidden === 4 && minDiv < 5 ? 1 : 0,
        negdivergencehidden === 5 && minDiv < 6 ? 1 : 0,
        negdivergencehidden === 6 && minDiv < 7 ? 1 : 0,
        negdivergencehidden === 7 && minDiv < 8 ? 1 : 0,
        negdivergencehidden === 8 && minDiv < 9 ? 1 : 0,
        negdivergencehidden > 8 ? 1 : 0,
      ];
    };
  },
});

export const ST = (r, callback) => ({
  name: 'SuperTrend (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_up: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4CAF50',
        },
        plot_down: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF5252',
        },
        plot_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !1,
          color: '#2962ff',
        },
      },
      inputs: {
        in_0: 10,
        in_1: 3,
        showUp: true,
        showDown: true,
        id: '',
      },
      filledAreasStyle: {
        fill_top: {
          color: '#4CAF50',
          transparency: 90,
          visible: true,
        },
        fill_bottom: {
          color: '#FF5252',
          transparency: 90,
          visible: true,
        },
      },
    },
    plots: [
      {
        id: 'plot_up',
        type: 'line',
      },
      {
        id: 'plot_down',
        type: 'line',
      },
      {
        id: 'plot_middle',
        type: 'line',
      },
    ],
    styles: {
      plot_up: {
        title: 'Up Trend',
        histogramBase: 0,
        joinPoints: false,
        isHidden: !1,
      },
      plot_down: {
        title: 'Down Trend',
        histogramBase: 0,
        joinPoints: false,
        isHidden: !1,
      },
      plot_middle: {
        title: 'Middle line',
        histogramBase: 0,
        joinPoints: !1,
        isHidden: !1,
      },
    },
    filledAreas: [
      {
        id: 'fill_top',
        objAId: 'plot_up',
        objBId: 'plot_middle',
        type: 'plot_plot',
        title: 'Background',
      },
      {
        id: 'fill_bottom',
        objAId: 'plot_down',
        objBId: 'plot_middle',
        type: 'plot_plot',
        title: 'Background',
      },
    ],
    description: 'SuperTrend (Custom)',
    shortDescription: 'SuperTrend (Custom)',
    is_price_study: true,
    inputs: [
      {
        id: 'in_0',
        name: 'ATR Length',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 100,
      },
      {
        id: 'in_1',
        name: 'Factor',
        defval: 3,
        type: 'float',
        min: 1,
        max: 100,
      },
      { id: 'showUp', name: 'Show Up Trend', defval: true, type: 'bool' },
      { id: 'showDown', name: 'Show Down Trend', defval: true, type: 'bool' },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'SuperTrend-Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'SuperTrend (Custom)',
    isCustomIndicator: true,
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      const i = t(0);
      const s = t(1);
      this._context.setMinimumAdditionalDepth(Math.max(Math.ceil(i * 2), 500));
      const showUp = t(2);
      const showDown = t(3);
      const id = t(4);
      const close = r.Std.close(this._context);
      const open = r.Std.open(this._context);
      const bodyMiddle = (open + close) / 2;
      const [n, o] = r.Std.supertrend(s, i, e);
      if (callback) {
        callback(
          showUp ? (o === 1 ? r.Std.na() : n) : o === -1 ? r.Std.na() : n,
          id
        );
      }
      return [
        showUp ? (o === 1 ? r.Std.na() : n) : r.Std.na(),
        showDown ? (o === -1 ? r.Std.na() : n) : r.Std.na(),
        bodyMiddle,
      ];
    };
  },
});

export const PC = (r) => ({
  name: 'Price Change',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    showLegendValues: false,
    defaults: {
      styles: {
        up: {
          plottype: 'shape_triangle_up',
          location: 'BelowBar',
          visible: !0,
          color: '#4caf4f',
          textColor: '#4caf4f',
          transparency: 0,
          fontsize: 30,
        },
        down: {
          plottype: 'shape_triangle_down',
          location: 'AboveBar',
          visible: !0,
          color: '#ff5252',
          textColor: '#ff5252',
          transparency: 0,
          fontsize: 30,
        },
        bgColor: {
          visible: !0,
          transparency: 90,
        },
      },
      palettes: {
        paletteBg: {
          colors: {
            1: { color: '#4caf4f' },
            2: { color: '#ff5252' },
          },
        },
      },
      inputs: {
        up: 5,
        down: 5,
        showUp: true,
        showDown: false,
      },
    },
    plots: [
      {
        id: 'up',
        type: 'shapes',
        plottype: 'shape_triangle_up',
        location: 'BelowBar',
      },
      {
        id: 'down',
        type: 'shapes',
        plottype: 'shape_triangle_down',
        location: 'AboveBar',
      },
      {
        id: 'bgColor',
        type: 'bg_colorer',
        palette: 'paletteBg',
      },
    ],
    styles: {
      up: {
        title: 'Price increased',
      },
      down: {
        title: 'Price decreased',
      },
      bgColor: {
        title: 'Background color',
      },
    },
    palettes: {
      paletteBg: {
        colors: {
          1: { name: 'Up' },
          2: { name: 'Down' },
        },
        valToIndex: { 1: 1, 2: 2 },
      },
    },
    description: 'Price Change',
    shortDescription: 'Price Change',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Price Change@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Price Change',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'up',
        name: '% up',
        defval: 5,
        type: 'float',
        min: 1,
        max: 1000,
        step: 0.1,
      },
      {
        id: 'down',
        name: '% down',
        defval: 5,
        type: 'float',
        min: 1,
        max: 1000,
        step: 0.1,
      },
      {
        id: 'showUp',
        name: 'Show Price Increased',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showDown',
        name: 'Show Price Decreased',
        defval: true,
        type: 'bool',
      },
    ],
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      this._context.setMinimumAdditionalDepth(1);
      const high = r.Std.high(this._context);
      const low = r.Std.low(this._context);
      const open = r.Std.open(this._context);
      const upPerc = this._input(0);
      const downPerc = this._input(1);
      const showUp = this._input(2);
      const showDown = this._input(3);
      const _up = Math.abs((high - open) / open) * 100;
      const _down = Math.abs((low - open) / open) * 100;
      const up = showUp && _up > upPerc ? 1 : 0;
      const down = showDown && _down > downPerc ? 1 : 0;
      return [up, down, up ? 1 : down ? 2 : 0];
    };
  },
});

export const ATR = (r, callback) => ({
  name: 'Average True Range (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
      },
      inputs: {
        in_0: 14,
        id: '',
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Average True Range (Custom)',
    shortDescription: 'ATR (Custom)',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Average True Range Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Average True Range (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      const i = t(0);
      const id = t(1);
      const res = r.Std.atr(i, e);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const PP = (r, callback) => ({
  name: 'Market Structure',
  metainfo: {
    _metainfoVersion: 53,
    showLegendValues: false,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      inputs: {
        highLeftBars: 5,
        highRightBars: 5,
        lowLeftBars: 5,
        lowRightBars: 5,
        hh: true,
        hl: true,
        lh: true,
        ll: true,
        shh: false,
        shl: false,
        slh: false,
        sll: false,
        ihh: false,
        ihl: false,
        ilh: false,
        ill: false,
        mult: 1,
        sl: false,
        wl: false,
        sh: false,
        wh: false,
        bullMs: false,
        bearMs: false,
        id: '',
      },
      styles: {
        bgColor: {
          visible: !0,
          transparency: 80,
        },
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        hh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        lh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        hl: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        ll: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        plot_5: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        plot_6: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        shh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        slh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        shl: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        sll: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        plot_7: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        plot_8: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        ihh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        ilh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        ihl: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        ill: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        sl: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        wl: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        sh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        wh: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        plot_3: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        plot_4: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
      },
      palettes: {
        paletteBg: {
          colors: {
            1: { color: '#ff5252' },
            0: { color: '#4caf50' },
          },
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
      { id: 'hh', type: 'shapes' },
      { id: 'hl', type: 'shapes' },
      { id: 'lh', type: 'shapes' },
      { id: 'll', type: 'shapes' },
      {
        id: 'plot_5',
        type: 'line',
      },
      {
        id: 'plot_6',
        type: 'line',
      },
      { id: 'shh', type: 'shapes' },
      { id: 'sll', type: 'shapes' },
      { id: 'slh', type: 'shapes' },
      { id: 'shl', type: 'shapes' },
      {
        id: 'plot_7',
        type: 'line',
      },
      {
        id: 'plot_8',
        type: 'line',
      },
      { id: 'ihh', type: 'shapes' },
      { id: 'ill', type: 'shapes' },
      { id: 'ilh', type: 'shapes' },
      { id: 'ihl', type: 'shapes' },
      { id: 'sl', type: 'shapes' },
      { id: 'wl', type: 'shapes' },
      { id: 'sh', type: 'shapes' },
      { id: 'wh', type: 'shapes' },
      {
        id: 'plot_3',
        type: 'line',
      },
      {
        id: 'plot_4',
        type: 'line',
      },
      {
        id: 'bgColor',
        type: 'bg_colorer',
        palette: 'paletteBg',
      },
    ],
    styles: {
      plot_0: {
        title: 'High',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Low',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_3: {
        title: 'Strong/Weak High',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_4: {
        title: 'Strong/Weak Low',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_5: {
        title: 'Swing Bullish BoS/CHoCH',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_6: {
        title: 'Swing Bearish BoS/CHoCH',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_7: {
        title: 'Internal Bullish BoS/CHoCH',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_8: {
        title: 'Internal Bearish BoS/CHoCH',
        histogramBase: 0,
        joinPoints: !1,
      },
      hh: {
        title: 'Higher High',
        text: 'HH',
      },
      hl: {
        title: 'Higher Low',
        text: 'HL',
      },
      lh: {
        title: 'Lower High',
        text: 'LH',
      },
      ll: {
        title: 'Lower Low',
        text: 'LL',
      },
      shh: {
        title: 'Swing Bullish BoS',
        text: 'BoS',
      },
      slh: {
        title: 'Swing Bullish CHoCH',
        text: 'CHoCH',
      },
      shl: {
        title: 'Swing Bearish CHoCH',
        text: 'CHoCH',
      },
      sll: {
        title: 'Swing Bearish BoS',
        text: 'BoS',
      },
      ihh: {
        title: 'Internal Bullish BoS',
        text: 'BoS',
      },
      ilh: {
        title: 'Internal Bullish CHoCH',
        text: 'CHoCH',
      },
      ihl: {
        title: 'Internal Bearish CHoCH',
        text: 'CHoCH',
      },
      ill: {
        title: 'Internal Bearish BoS',
        text: 'BoS',
      },
      sl: {
        title: 'Strong Low',
        text: 'Strong Low',
      },
      wl: {
        title: 'Weak Low',
        text: 'Weak Low',
      },
      sh: {
        title: 'Strong High',
        text: 'Strong High',
      },
      wh: {
        title: 'Weak High',
        text: 'Weak High',
      },
      bgColor: {
        title: 'Background color',
      },
    },
    description: 'Market Structure',
    shortDescription: 'Market Structure',
    is_price_study: !0,
    linkedToSeries: true,
    id: 'Market Structure@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Market Structure',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'highLeftBars',
        name: 'High Left bars',
        defval: 5,
        type: 'integer',
      },
      {
        id: 'highRightBars',
        name: 'High Right bars',
        defval: 5,
        type: 'integer',
      },
      {
        id: 'lowLeftBars',
        name: 'Low Left bars',
        defval: 5,
        type: 'integer',
      },
      {
        id: 'lowRightBars',
        name: 'Low Right bars',
        defval: 5,
        type: 'integer',
      },
      {
        id: 'mult',
        name: 'Multiplier',
        defval: 1,
        type: 'float',
      },
      {
        id: 'hh',
        name: 'Show HH',
        defval: true,
        type: 'bool',
      },
      {
        id: 'hl',
        name: 'Show HL',
        defval: true,
        type: 'bool',
      },
      {
        id: 'lh',
        name: 'Show LH',
        defval: true,
        type: 'bool',
      },
      {
        id: 'll',
        name: 'Show LL',
        defval: true,
        type: 'bool',
      },
      {
        id: 'shh',
        name: 'Show Swing Bullish BoS',
        defval: false,
        type: 'bool',
      },
      {
        id: 'shl',
        name: 'Show Swing Bearish CHoCH',
        defval: false,
        type: 'bool',
      },
      {
        id: 'slh',
        name: 'Show Swing Bullish CHoCH',
        defval: false,
        type: 'bool',
      },
      {
        id: 'sll',
        name: 'Show Swing Bearish BoS',
        defval: false,
        type: 'bool',
      },
      {
        id: 'ihh',
        name: 'Show Internal Bullish BoS',
        defval: false,
        type: 'bool',
      },
      {
        id: 'ihl',
        name: 'Show Internal Bearish CHoCH',
        defval: false,
        type: 'bool',
      },
      {
        id: 'ilh',
        name: 'Show Internal Bullish CHoCH',
        defval: false,
        type: 'bool',
      },
      {
        id: 'ill',
        name: 'Show Internal Bearish BoS',
        defval: false,
        type: 'bool',
      },
      {
        id: 'sl',
        name: 'Show Strong Low',
        defval: false,
        type: 'bool',
      },
      {
        id: 'wl',
        name: 'Show Weak Low',
        defval: false,
        type: 'bool',
      },
      {
        id: 'sh',
        name: 'Show Strong High',
        defval: false,
        type: 'bool',
      },
      {
        id: 'wh',
        name: 'Show Weak High',
        defval: false,
        type: 'bool',
      },
      {
        id: 'bearMs',
        name: 'Show Bearish Market Structure',
        defval: false,
        type: 'bool',
      },
      {
        id: 'bullMs',
        name: 'Show Bullish Market Structure',
        defval: false,
        type: 'bool',
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
        hidden: true,
      },
    ],
    palettes: {
      paletteBg: {
        colors: {
          1: { name: 'Bearish Market Structure' },
          0: { name: 'Bullish Market Structure' },
        },
        valToIndex: { 1: 1, 0: 0 },
      },
    },
  },

  constructor: function () {
    this.swings = (_len, swingVar, high, low) => {
      const len = _len + 1;
      if (!this._context.symbol.isBarClosed) {
        return [r.Std.na(), r.Std.na()];
      }
      const upper = r.Std.highest(high, len, this._context);
      const lower = r.Std.lowest(low, len, this._context);

      const currentOs =
        high.get(len) > upper ? 0 : low.get(len) < lower ? 1 : swingVar.get(1);
      const top =
        currentOs === 0 && swingVar.get() !== 0 ? high.get(len) : r.Std.na();
      const btm =
        currentOs === 1 && swingVar.get() !== 1 ? low.get(len) : r.Std.na();
      swingVar.set(currentOs);
      return [top, btm];
    };
    this.updateTrendMap = (_var, value) => {
      const map =
        typeof _var.get() !== 'object' ? new Map() : (_var.get() ?? new Map());

      map.set(1, map.get(0) ?? r.Std.na());
      map.set(0, value);
      _var.set(map);
    };

    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const h = r.Std.high(this._context);
      const high = this._context.new_var(h);
      high.get(51);
      const l = r.Std.low(this._context);
      const low = this._context.new_var(l);
      low.get(51);
      const c = r.Std.close(this._context);
      const close = this._context.new_var(c);
      close.get(1);
      const highLeftBars = this._input(0);
      const highRightBars = this._input(1);
      const lowLeftBars = this._input(2);
      const lowRightBars = this._input(3);
      const mult = this._input(4);
      const showHH = this._input(5);
      const showHL = this._input(6);
      const showLH = this._input(7);
      const showLL = this._input(8);
      const SshowHH = this._input(9);
      const SshowHL = this._input(10);
      const SshowLH = this._input(11);
      const SshowLL = this._input(12);
      const IshowHH = this._input(13);
      const IshowHL = this._input(14);
      const IshowLH = this._input(15);
      const IshowLL = this._input(16);
      const showSL = this._input(17);
      const showWL = this._input(18);
      const showSH = this._input(19);
      const showWH = this._input(20);
      const showBullMs = this._input(22);
      const showBearMs = this._input(21);
      const id = this._input(23);
      this._context.setMinimumAdditionalDepth(
        Math.max(highLeftBars + highRightBars, lowLeftBars + lowRightBars) +
          1000
      );
      const [phRes, plRes, hh, hl, lh, ll] = priorPivot(
        r,
        this._context,
        highLeftBars,
        highRightBars,
        lowLeftBars,
        lowRightBars
      );
      const currentSeriesH = this._context.new_var();
      const currentSeriesL = this._context.new_var();
      if (!r.Std.na(hh)) {
        currentSeriesH.set('hh');
      }
      if (!r.Std.na(hl)) {
        currentSeriesL.set('hl');
      }
      if (!r.Std.na(lh)) {
        currentSeriesH.set('lh');
      }
      if (!r.Std.na(ll)) {
        currentSeriesL.set('ll');
      }
      const showPhRes =
        (currentSeriesH.get() === 'hh' && showHH) ||
        (currentSeriesH.get() === 'lh' && showLH);
      const showPlRes =
        (currentSeriesL.get() === 'hl' && showHL) ||
        (currentSeriesL.get() === 'll' && showLL);
      const swingVar = this._context.new_var();
      swingVar.get(2);
      const IswingVar = this._context.new_var();
      IswingVar.get(2);
      const [top, btm] = this.swings(50, swingVar, high, low);
      const [Itop, Ibtm] = this.swings(5, IswingVar, high, low);
      const top_cross = this._context.new_var();
      top_cross.get(0);
      const btm_cross = this._context.new_var();
      btm_cross.get(0);
      const trend = this._context.new_var();
      trend.get();
      let newTrend = 0;
      const topY = this._context.new_var();
      topY.get(1);
      const btmY = this._context.new_var();
      btmY.get(1);
      const Itop_cross = this._context.new_var();
      Itop_cross.get(0);
      const Ibtm_cross = this._context.new_var();
      Ibtm_cross.get(0);
      const Itrend = this._context.new_var();
      Itrend.get();
      let newItrend = 0;
      const ItopY = this._context.new_var();
      ItopY.get(1);
      const IbtmY = this._context.new_var();
      IbtmY.get(1);
      let Shh = r.Std.na();
      let Slh = r.Std.na();
      let Sll = r.Std.na();
      let Shl = r.Std.na();
      let Ihh = r.Std.na();
      let Ilh = r.Std.na();
      let Ill = r.Std.na();
      let Ihl = r.Std.na();
      const trailingUp = this._context.new_var();
      trailingUp.get(1);
      const trailingDown = this._context.new_var();
      trailingDown.get(1);
      if (this._context.symbol.isBarClosed) {
        if (!r.Std.na(top) && top) {
          top_cross.set(true);
          if (top > topY.get()) {
            Shh = top;
          } else {
            Slh = top;
          }
          topY.set(top);
          trailingUp.set(top);
        }
        if (!r.Std.na(btm) && btm) {
          btm_cross.set(true);
          if (btm < btmY.get()) {
            Sll = btm;
          } else {
            Shl = btm;
          }
          btmY.set(btm);
          trailingDown.set(btm);
        }
        if (crossover(r, close, topY)) {
          if (top_cross.get()) {
            newTrend = 1;
          }
          top_cross.set(false);
        }
        if (crossunder(r, close, btmY)) {
          if (btm_cross.get()) {
            newTrend = -1;
          }
          btm_cross.set(false);
        }
        if (!r.Std.na(Itop) && Itop) {
          Itop_cross.set(true);
          if (Itop > ItopY.get()) {
            Ihh = Itop;
          } else {
            Ilh = Itop;
          }
          ItopY.set(Itop);
        }
        if (!r.Std.na(Ibtm) && Ibtm) {
          Ibtm_cross.set(true);
          if (Ibtm < IbtmY.get()) {
            Ill = Ibtm;
          } else {
            Ihl = Ibtm;
          }
          IbtmY.set(Ibtm);
        }
        if (crossover(r, close, ItopY)) {
          if (Itop_cross.get() && ItopY.get() !== topY.get()) {
            newItrend = 1;
          }
          Itop_cross.set(false);
        }
        if (crossunder(r, close, IbtmY)) {
          if (Ibtm_cross.get() && IbtmY.get() !== btmY.get()) {
            newItrend = -1;
          }
          Ibtm_cross.set(false);
        }
      }
      let trendVal = (
        typeof trend.get() === 'object' ? (trend.get() ?? new Map()) : new Map()
      ).get(0);
      trendVal = isNaN(trendVal) ? 0 : (trendVal ?? 0);
      let ItrendVal = (
        typeof Itrend.get() === 'object'
          ? (Itrend.get() ?? new Map())
          : new Map()
      ).get(0);
      ItrendVal = isNaN(ItrendVal) ? 0 : (ItrendVal ?? 0);
      const SlLabel = btm && trendVal > 0;
      const WLLabel = btm && trendVal <= 0;
      const SHLabel = top && trendVal < 0;
      const WHLabel = top && trendVal >= 0;
      if (!r.Std.na(trailingUp.get())) {
        trailingUp.set(Math.max(trailingUp.get(), high.get()));
      }
      if (!r.Std.na(trailingDown.get())) {
        trailingDown.set(Math.min(trailingDown.get(), low.get()));
      }

      const currentWSLSeries = this._context.new_var();
      const currentWSHSeries = this._context.new_var();
      const slValue = this._context.new_var();
      const wlValue = this._context.new_var();
      const shValue = this._context.new_var();
      const whValue = this._context.new_var();
      if (SlLabel) {
        currentWSLSeries.set('sl');
      }
      if (WLLabel) {
        currentWSLSeries.set('wl');
      }
      if (SHLabel) {
        currentWSHSeries.set('sh');
      }
      if (WHLabel) {
        currentWSHSeries.set('wh');
      }
      const SLLabelOnChart =
        SlLabel ||
        (r.Std.change(trailingDown) && currentWSLSeries.get() === 'sl');
      const SHLabelOnChart =
        WLLabel ||
        (r.Std.change(trailingDown) && currentWSLSeries.get() === 'wl');
      const WHLabelOnChart =
        WHLabel ||
        (r.Std.change(trailingUp) && currentWSHSeries.get() === 'wh');
      const WLLabelOnChart =
        WLLabel ||
        (r.Std.change(trailingDown) && currentWSLSeries.get() === 'wl');
      if (SLLabelOnChart) {
        slValue.set(trailingDown.get());
      }
      if (SHLabelOnChart) {
        shValue.set(trailingUp.get());
      }
      if (WLLabelOnChart) {
        wlValue.set(trailingDown.get());
      }
      if (WHLabelOnChart) {
        whValue.set(trailingUp.get());
      }
      const showWSH =
        (showSH && currentWSHSeries.get() === 'sh') ||
        (showWH && currentWSHSeries.get() === 'wh');

      const showWSL =
        (showSL && currentWSLSeries.get() === 'sl') ||
        (showWL && currentWSLSeries.get() === 'wl');

      const ScurrentSeriesH = this._context.new_var();
      const ScurrentSeriesL = this._context.new_var();
      const SphRes = this._context.new_var();
      const SplRes = this._context.new_var();
      SphRes.get(1);
      SplRes.get(1);
      if (!r.Std.na(Shh)) {
        ScurrentSeriesH.set('hh');
        SphRes.set(Shh);
      }
      if (!r.Std.na(Shl)) {
        ScurrentSeriesL.set('hl');
        SplRes.set(Shl);
      }
      if (!r.Std.na(Slh)) {
        ScurrentSeriesH.set('lh');
        SphRes.set(Slh);
      }
      if (!r.Std.na(Sll)) {
        ScurrentSeriesL.set('ll');
        SplRes.set(Sll);
      }
      const SshowPhRes =
        (ScurrentSeriesH.get() === 'hh' && SshowHH) ||
        (ScurrentSeriesH.get() === 'lh' && SshowLH);
      const SshowPlRes =
        (ScurrentSeriesL.get() === 'hl' && SshowHL) ||
        (ScurrentSeriesL.get() === 'll' && SshowLL);

      const currentMarket = this._context.new_var();

      const _bullBoS =
        trendVal >= 0 && crossover(r, close, SphRes) && ScurrentSeriesH.get();
      const _bearBoS =
        trendVal <= 0 && crossunder(r, close, SplRes) && ScurrentSeriesL.get();
      const _bullCHoCH =
        trendVal < 0 && crossover(r, close, SphRes) && ScurrentSeriesH.get();
      const _bearCHoCH =
        trendVal > 0 && crossunder(r, close, SplRes) && ScurrentSeriesL.get();
      const bullCHoCH = SshowLH && _bullCHoCH;
      const bearCHoCH = SshowHL && _bearCHoCH;
      const bullBoS = SshowHH && _bullBoS;
      const bearBoS = SshowLL && _bearBoS;
      if (_bullBoS || _bullCHoCH) {
        ScurrentSeriesH.set(null);
      }
      if (_bearBoS || _bearCHoCH) {
        ScurrentSeriesL.set(null);
      }
      if (_bullCHoCH) {
        currentMarket.set('bull');
      }
      if (_bearCHoCH) {
        currentMarket.set('bear');
      }
      const SphResVal = SphRes.get();
      const SplResVal = SplRes.get();

      const IcurrentSeriesH = this._context.new_var();
      const IcurrentSeriesL = this._context.new_var();
      const IphRes = this._context.new_var();
      const IplRes = this._context.new_var();
      IphRes.get(1);
      IplRes.get(1);
      if (!r.Std.na(Ihh)) {
        IcurrentSeriesH.set('hh');
        IphRes.set(Ihh);
      }
      if (!r.Std.na(Ihl)) {
        IcurrentSeriesL.set('hl');
        IplRes.set(Ihl);
      }
      if (!r.Std.na(Ilh)) {
        IcurrentSeriesH.set('lh');
        IphRes.set(Ilh);
      }
      if (!r.Std.na(Ill)) {
        IcurrentSeriesL.set('ll');
        IplRes.set(Ill);
      }
      const IshowPhRes =
        (IcurrentSeriesH.get() === 'hh' && IshowHH) ||
        (IcurrentSeriesH.get() === 'lh' && IshowLH);
      const IshowPlRes =
        (IcurrentSeriesL.get() === 'hl' && IshowHL) ||
        (IcurrentSeriesL.get() === 'll' && IshowLL);

      const _IbullBoS =
        ItrendVal >= 0 && crossover(r, close, IphRes) && IcurrentSeriesH.get();
      const _IbearBoS =
        ItrendVal <= 0 && crossunder(r, close, IplRes) && IcurrentSeriesL.get();
      const _IbullCHoCH =
        ItrendVal < 0 && crossover(r, close, IphRes) && IcurrentSeriesH.get();
      const _IbearCHoCH =
        ItrendVal > 0 && crossunder(r, close, IplRes) && IcurrentSeriesL.get();
      const IbullCHoCH = IshowLH && _IbullCHoCH;
      const IbearCHoCH = IshowHL && _IbearCHoCH;
      const IbullBoS = IshowHH && _IbullBoS;
      const IbearBoS = IshowLL && _IbearBoS;
      if (_IbullBoS || _IbullCHoCH) {
        IcurrentSeriesH.set(null);
      }
      if (_IbearBoS || _IbearCHoCH) {
        IcurrentSeriesL.set(null);
      }
      const IphResVal = IphRes.get();
      const IplResVal = IplRes.get();

      if (newItrend) {
        this.updateTrendMap(Itrend, newItrend);
      }

      if (newTrend) {
        this.updateTrendMap(trend, newTrend);
      }

      const bullMs = showBullMs && currentMarket.get() === 'bull';
      const bearMs = showBearMs && currentMarket.get() === 'bear';
      if (callback) {
        const val =
          (showSL && showWL
            ? trailingDown.get()
            : showSL
              ? slValue.get()
              : showWL
                ? wlValue.get()
                : showSH && showWH
                  ? trailingUp.get()
                  : showSH
                    ? shValue.get()
                    : showWH
                      ? whValue.get()
                      : showHH && showLH
                        ? isNaN(hh)
                          ? lh
                          : hh
                        : showHL && showLL
                          ? isNaN(hl)
                            ? ll
                            : hl
                          : showHH
                            ? hh
                            : showHL
                              ? hl
                              : showLH
                                ? lh
                                : ll) * mult;
        callback(val, id);
      }
      return [
        ...[
          showPhRes ? phRes : r.Std.na(),
          showPlRes ? plRes : r.Std.na(),
          showHH ? hh : r.Std.na(),
          showHL ? hl : r.Std.na(),
          showLH ? lh : r.Std.na(),
          showLL ? ll : r.Std.na(),
          SshowPhRes ? SphResVal : r.Std.na(),
          SshowPlRes ? SplResVal : r.Std.na(),
          bullBoS ? SphResVal : r.Std.na(),
          bearBoS ? SplResVal : r.Std.na(),
          bullCHoCH ? SphResVal : r.Std.na(),
          bearCHoCH ? SplResVal : r.Std.na(),
          IshowPhRes ? IphResVal : r.Std.na(),
          IshowPlRes ? IplResVal : r.Std.na(),
          IbullBoS ? IphResVal : r.Std.na(),
          IbearBoS ? IplResVal : r.Std.na(),
          IbullCHoCH ? IphResVal : r.Std.na(),
          IbearCHoCH ? IplResVal : r.Std.na(),
          showSL && SLLabelOnChart ? trailingDown.get() : r.Std.na(),
          showWL && WLLabelOnChart ? trailingDown.get() : r.Std.na(),
          showSH && SHLabelOnChart ? trailingUp.get() : r.Std.na(),
          showWH && WHLabelOnChart ? trailingUp.get() : r.Std.na(),
          showWSH ? trailingUp.get() : r.Std.na(),
          showWSL ? trailingDown.get() : r.Std.na(),
        ].map((v) =>
          this._context.symbol.isBarClosed ? v * mult : r.Std.na()
        ),
        bullMs ? 0 : bearMs ? 1 : r.Std.na(),
      ];
    };
  },
});

export const PSAR = (r, callback) => ({
  name: 'Parabolic SAR (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 3,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
      },
      inputs: {
        in_0: 0.02,
        in_1: 0.02,
        in_2: 0.2,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Parabolic SAR (Custom)',
    shortDescription: 'SAR (Custom)',
    is_price_study: !0,
    linkedToSeries: true,
    inputs: [
      {
        id: 'in_0',
        name: 'start',
        defval: 0.02,
        type: 'float',
        min: -1e12,
        max: 1e12,
      },
      {
        id: 'in_1',
        name: 'increment',
        defval: 0.02,
        type: 'float',
        min: -1e12,
        max: 1e12,
      },
      {
        id: 'in_2',
        name: 'maximum',
        defval: 0.2,
        type: 'float',
        min: -1e12,
        max: 1e12,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Parabolic SAR (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Parabolic SAR (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const s = this._input(1);
      const n = this._input(2);
      const id = this._input(3);
      const res = r.Std.sar(i, s, n, this._context);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const ADR = (r, callback) => ({
  name: 'Average Daily Range',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#7E57C2',
        },
      },
      inputs: {
        in_0: 14,
        id: '',
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 70,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Average Daily Range',
    shortDescription: 'ADR',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Average Daily Range@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Average Daily Range',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const id = t(1);
      const h = r.Std.high(this._context);
      const l = r.Std.low(this._context);
      const high = this._context.new_var(h);
      const low = this._context.new_var(l);
      const dr = high - low;
      const drVar = this._context.new_var(dr);
      const res = r.Std.sma(drVar, i, this._context);
      if (callback) {
        callback(res, id);
      }
      return [res];
    };
  },
});

export const ATRPrice = (r, callback) => ({
  name: 'Average True Range Price (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    showLegendValues: false,
    showLabelsOnPriceScale: false,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          // Dynamic-AR mode uses this study only to emit its value (via the
          // callback) for positioning the order lines — the line itself is
          // never drawn (legacy parity).
          visible: false,
          color: '#7E57C2',
        },
      },
      inputs: {
        in_0: 14,
        id: '',
        factor: 1,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Average True Range Price (Custom)',
    shortDescription: 'ATR Price (Custom)',
    is_price_study: 1,
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },

      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
      {
        id: 'factor',
        name: 'Factor',
        defval: 1,
        type: 'float',
        min: -2e3,
        max: 2e3,
      },
    ],
    id: 'Average True Range Price Custom@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Average True Range Price (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      const i = t(0);
      const id = t(1);
      const res = r.Std.atr(i, e);
      if (callback) {
        callback(res, id);
      }
      // Dynamic-AR mode consumes `res` via the callback to position the order
      // lines; the indicator itself is never plotted (legacy parity), so emit
      // no value (NaN renders nothing).
      return [NaN];
    };
  },
});

export const ADRPrice = (r, callback) => ({
  name: 'Average Daily Range Price',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    showLegendValues: false,
    showLabelsOnPriceScale: false,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          // Dynamic-AR mode uses this study only to emit its value (via the
          // callback) for positioning the order lines — the line itself is
          // never drawn (legacy parity).
          visible: false,
          color: '#7E57C2',
        },
      },
      inputs: {
        in_0: 14,
        id: '',
        factor: 1,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Average Daily Range Price',
    shortDescription: 'ADR Price',
    is_price_study: 1,
    inputs: [
      {
        id: 'in_0',
        name: 'Length',
        defval: 14,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
      {
        id: 'factor',
        name: 'Factor',
        defval: 1,
        type: 'integer',
        min: -2e3,
        max: 2e3,
      },
    ],
    id: 'Average Daily Range Price@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Average Daily Range Price',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const id = this._input(1);
      const h = r.Std.high(this._context);
      const l = r.Std.low(this._context);
      const high = this._context.new_var(h);
      const low = this._context.new_var(l);
      const dr = high - low;
      const drVar = this._context.new_var(dr);
      const res = r.Std.sma(drVar, i, this._context);
      if (callback) {
        callback(res, id);
      }
      // Dynamic-AR mode consumes `res` via the callback to position the order
      // lines; the indicator itself is never plotted (legacy parity), so emit
      // no value (NaN renders nothing).
      return [NaN];
    };
  },
});

export const ATH = (r, callback) => ({
  name: 'ATH Drawdown',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        mean: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !1,
          color: '#2962ff',
        },
        dd: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#27a69a',
        },
      },
      inputs: {
        id: '',
        lookback: 100,
      },
      bands: [
        {
          color: '#808080',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 0,
        },
        {
          color: '#808080',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -25,
        },
        {
          color: '#808080',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -50,
        },
        {
          color: '#808080',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -75,
        },
        {
          color: '#808080',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: -100,
        },
        {
          color: '#787B86',
          linestyle: 1,
          linewidth: 2,
          visible: !0,
          value: -70,
        },
        {
          color: '#787B86',
          linestyle: 1,
          linewidth: 2,
          visible: !0,
          value: -30,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#7E57C2',
          transparency: 90,
          visible: !0,
        },
      },
    },
    plots: [
      {
        id: 'mean',
        type: 'line',
      },
      {
        id: 'dd',
        type: 'line',
      },
    ],
    styles: {
      mean: {
        title: 'Mean',
        histogramBase: 0,
        joinPoints: !1,
      },
      dd: {
        title: 'DD',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'ATH Drawdown',
    shortDescription: 'ATH',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'Level',
      },
      {
        id: 'hline_1',
        name: 'Level',
      },
      {
        id: 'hline_2',
        name: 'Level',
      },
      {
        id: 'hline_3',
        name: 'Level',
      },
      {
        id: 'hline_4',
        name: 'Level',
      },
      {
        id: 'hline_5',
        name: 'UpperLimit',
      },
      {
        id: 'hline_6',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_5',
        objBId: 'hline_6',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
    ],
    inputs: [
      {
        id: 'lookback',
        name: 'Lookback',
        defval: 100,
        type: 'integer',
        min: 100,
        max: 20e3,
      },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'ATH Drawdown@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'ATH Drawdown',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.drawdown = (val, ath) => (val / ath - 1) * 100;
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const lookback = this._input(0);
      const id = this._input(1);
      const h = r.Std.high(this._context);
      const high = this._context.new_var(h);
      const l = r.Std.low(this._context);
      //const low = this._context.new_var(l);
      this._context.setMinimumAdditionalDepth(lookback);
      let ath = NaN;
      //let totalDD = 0;
      for (const i of Array(lookback).keys()) {
        const index = lookback - i - 1;
        const localH = high.get(index);
        //const localL = low.get(index);
        //let isAthBar = false;
        if (isNaN(ath) || localH > ath) {
          ath = localH;
          //isAthBar = true;
        }
        //const dd = isAthBar ? 0 : this.drawdown(localL, ath);
        //totalDD += dd;
      }
      const dd = this.drawdown(l, ath);
      //const mean = totalDD / lookback;
      if (callback) {
        callback(dd, id);
      }
      return [NaN, dd];
    };
  },
});

export const KC = (r, callback) => ({
  name: 'Keltner Channel (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2962ff',
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2962ff',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2962ff',
        },
      },
      filledAreasStyle: {
        fill_0: {
          color: '#2196f3',
          transparency: 95,
          visible: !0,
        },
      },
      inputs: {
        maType: 'EMA',
        length: 20,
        mult: 2,
        range: 'ATR',
        rangeLength: 10,
        showUpper: true,
        showBasis: true,
        showLower: true,
        id: '',
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Basis',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: 'Upper',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Keltner Channel (Custom)',
    shortDescription: 'KC',
    is_price_study: !0,
    linkedToSeries: true,
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'plot_1',
        objBId: 'plot_2',
        type: 'plot_plot',
        title: 'Background',
      },
    ],
    inputs: [
      {
        id: 'maType',
        name: 'MA Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA'],
      },
      {
        id: 'length',
        name: 'Length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'mult',
        name: 'Multiplier',
        defval: 2,
        type: 'float',
        min: 0.001,
        max: 50,
      },
      {
        id: 'range',
        name: 'Range',
        defval: 'ATR',
        type: 'text',
        options: ['ATR', 'TR', 'R'],
      },
      {
        id: 'rangeLength',
        name: 'Length',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      { id: 'showUpper', name: 'Show Upper', defval: true, type: 'bool' },
      { id: 'showBasis', name: 'Show Basis', defval: true, type: 'bool' },
      { id: 'showLower', name: 'Show Lower', defval: true, type: 'bool' },
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
    id: 'Keltner Channel (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Keltner Channel (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const maType = this._input(0);
      const length = this._input(1);
      const mult = this._input(2);
      const range = this._input(3);
      const rangeLength = this._input(4);
      const showUpper = this._input(5);
      const showBasis = this._input(6);
      const showLower = this._input(7);
      const id = this._input(8);
      this._context.setMinimumAdditionalDepth(length + rangeLength);
      const [ma, upper, lower] = kcCalc(
        r,
        this._context,
        maType,
        length,
        mult,
        range,
        rangeLength
      );
      const values = [
        showBasis ? ma : r.Std.na(),
        showUpper ? upper : r.Std.na(),
        showLower ? lower : r.Std.na(),
      ];
      if (callback) {
        const v = values.find((_v) => !r.Std.na(_v));
        if (v) {
          callback(v, id);
        }
      }
      return values;
    };
  },
});

export const KCPB = (r) => ({
  name: 'Keltner Channel %B',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
        ...percentileDefaultStyles,
      },
      bands: [
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 1,
        },
        {
          color: '#787B86',
          linestyle: 2,
          linewidth: 1,
          visible: !0,
          value: 0,
        },
      ],
      filledAreasStyle: {
        fill_0: {
          color: '#26A69A',
          transparency: 90,
          visible: !0,
        },
        ...percentileFillStyle,
      },
      inputs: {
        maType: 'EMA',
        length: 20,
        mult: 2,
        range: 'ATR',
        rangeLength: 10,
        ...percentileDefaultInputs,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      ...percentilPlot,
    ],
    styles: {
      plot_0: {
        title: 'Plot',
        histogramBase: 0,
        joinPoints: !1,
      },
      ...percentileStyle,
    },
    description: 'Keltner Channel %B',
    shortDescription: 'KC %B',
    is_price_study: !1,
    bands: [
      {
        id: 'hline_0',
        name: 'UpperLimit',
      },
      {
        id: 'hline_1',
        name: 'LowerLimit',
      },
    ],
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'hline_0',
        objBId: 'hline_1',
        type: 'hline_hline',
        title: 'Hlines Background',
      },
      ...percentileFillAreas,
    ],
    inputs: [
      {
        id: 'maType',
        name: 'MA Type',
        defval: 'SMA',
        type: 'text',
        options: ['SMA', 'EMA'],
      },
      {
        id: 'length',
        name: 'Length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      {
        id: 'mult',
        name: 'Multiplier',
        defval: 2,
        type: 'float',
        min: 0.001,
        max: 50,
      },
      {
        id: 'range',
        name: 'Range',
        defval: 'ATR',
        type: 'text',
        options: ['ATR', 'TR', 'R'],
      },
      {
        id: 'rangeLength',
        name: 'Length',
        defval: 10,
        type: 'integer',
        min: 1,
        max: 1e4,
      },
      ...percentileInputs,
    ],
    id: 'Keltner Channel %B@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Keltner Channel %B',
    format: {
      precision: 4,
      type: 'price',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const maType = this._input(0);
      const length = this._input(1);
      const mult = this._input(2);
      const range = this._input(3);
      const rangeLength = this._input(4);
      const usePercentile = this._input(5);
      const percentileLookback = this._input(6);
      const percentilePercentage = this._input(7);
      this._context.setMinimumAdditionalDepth(
        length + rangeLength + percentileLookback
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, upper, lower] = kcCalc(
        r,
        this._context,
        maType,
        length,
        mult,
        range,
        rangeLength
      );
      const close = r.Std.close(this._context);
      const kcpb = (close - lower) / (upper - lower);
      const kcpbVar = this._context.new_var(kcpb);
      const percentile = usePercentile
        ? percentileRank(kcpbVar, percentileLookback, percentilePercentage, r)
        : r.Std.na();
      return [
        kcpb,
        percentile,
        ...percentileBand(
          usePercentile,
          kcpbVar,
          percentileLookback,
          r,
          this._context
        ),
      ];
    };
  },
});

export const DC = (r) => ({
  name: 'Donchian Channels (Custom)',
  metainfo: {
    _metainfoVersion: 53,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        plot_0: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_1: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#2196F3',
        },
        plot_2: {
          linestyle: 0,
          linewidth: 1,
          plottype: 0,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#FF6D00',
        },
      },
      filledAreasStyle: {
        fill_0: {
          color: '#2196F3',
          transparency: 95,
          visible: !0,
        },
      },
      inputs: {
        in_0: 20,
      },
    },
    plots: [
      {
        id: 'plot_0',
        type: 'line',
      },
      {
        id: 'plot_1',
        type: 'line',
      },
      {
        id: 'plot_2',
        type: 'line',
      },
    ],
    styles: {
      plot_0: {
        title: 'Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_1: {
        title: 'Upper',
        histogramBase: 0,
        joinPoints: !1,
      },
      plot_2: {
        title: 'Basis',
        histogramBase: 0,
        joinPoints: !1,
      },
    },
    description: 'Donchian Channels (Custom)',
    shortDescription: 'DC',
    is_price_study: !0,
    linkedToSeries: true,
    filledAreas: [
      {
        id: 'fill_0',
        objAId: 'plot_1',
        objBId: 'plot_0',
        type: 'plot_plot',
        title: 'Plots Background',
      },
    ],
    inputs: [
      {
        id: 'in_0',
        name: 'length',
        defval: 20,
        type: 'integer',
        min: 1,
        max: 2e3,
      },
    ],
    id: 'Donchian Channels (Custom)@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Donchian Channels (Custom)',
    format: {
      type: 'inherit',
    },
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const i = this._input(0);
      const s = r.Std.low(this._context);
      const n = this._context.new_var(s);
      const lows = Array(i)
        .fill(0)
        .map((_, ind) => n.get(i - ind));
      const o = Math.min(...lows);
      const a = r.Std.high(this._context);
      const l = this._context.new_var(a);
      const highs = Array(i)
        .fill(0)
        .map((_, ind) => l.get(i - ind));
      const c = Math.max(...highs);
      return [o, c, r.Std.avg(c, o)];
    };
  },
});

export const OBFVG = (r, callback) => ({
  name: 'Fair Value Gaps',
  metainfo: {
    _metainfoVersion: 52,
    showLegendValues: false,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      inputs: {
        showBearishFVG: true,
        showBullishFVG: true,
        /* showBearishInternalOrderBlocks: true,
        showBullishInternalOrderBlocks: true,
        showBearishSwingOrderBlocks: true,
        showBullishSwingOrderBlocks: true, */
        id: '',
      },
      styles: {
        bearish_fvg_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#e6a55c',
        },
        bearish_fvg_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#e6a55c',
        },
        bearish_fvg_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#e6a55c',
        },
        bullish_fvg_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#5c58d6',
        },
        bullish_fvg_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#5c58d6',
        },
        bullish_fvg_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#5c58d6',
        },
        /* bearish_ob_i_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        bearish_ob_i_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        bearish_ob_i_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#ff5252',
        },
        bullish_ob_i_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        bullish_ob_i_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        bullish_ob_i_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#4caf50',
        },
        bearish_ob_s_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#bf6ecc',
        },
        bearish_ob_s_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#bf6ecc',
        },
        bearish_ob_s_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#bf6ecc',
        },
        bullish_ob_s_lower: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#6788cf',
        },
        bullish_ob_s_higher: {
          linestyle: 0,
          linewidth: 1,
          plottype: 7,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#6788cf',
        },
        bullish_ob_s_middle: {
          linestyle: 0,
          linewidth: 1,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#6788cf',
        },
        bullish_ob_i_label: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#4caf50',
          textColor: '#ffffff',
          transparency: 0,
        },
        bullish_ob_s_label: {
          plottype: 'shape_label_down',
          location: 'Absolute',
          visible: !0,
          color: '#6788cf',
          textColor: '#ffffff',
          transparency: 0,
        },
        bearish_ob_i_label: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#ff5252',
          textColor: '#ffffff',
          transparency: 0,
        },
        bearish_ob_s_label: {
          plottype: 'shape_label_up',
          location: 'Absolute',
          visible: !0,
          color: '#bf6ecc',
          textColor: '#ffffff',
          transparency: 0,
        }, */
      },
    },
    plots: [
      {
        id: 'bearish_fvg_lower',
        type: 'line',
      },
      {
        id: 'bearish_fvg_higher',
        type: 'line',
      },
      {
        id: 'bearish_fvg_middle',
        type: 'line',
      },
      {
        id: 'bullish_fvg_lower',
        type: 'line',
      },
      {
        id: 'bullish_fvg_higher',
        type: 'line',
      },
      {
        id: 'bullish_fvg_middle',
        type: 'line',
      },
      /* {
        id: 'bearish_ob_i_lower',
        type: 'line',
      },
      {
        id: 'bearish_ob_i_higher',
        type: 'line',
      },
      {
        id: 'bearish_ob_i_middle',
        type: 'line',
      },
      {
        id: 'bullish_ob_i_lower',
        type: 'line',
      },
      {
        id: 'bullish_ob_i_higher',
        type: 'line',
      },
      {
        id: 'bullish_ob_i_middle',
        type: 'line',
      },
      {
        id: 'bearish_ob_s_lower',
        type: 'line',
      },
      {
        id: 'bearish_ob_s_higher',
        type: 'line',
      },
      {
        id: 'bearish_ob_s_middle',
        type: 'line',
      },
      {
        id: 'bullish_ob_s_lower',
        type: 'line',
      },
      {
        id: 'bullish_ob_s_higher',
        type: 'line',
      },
      {
        id: 'bullish_ob_s_middle',
        type: 'line',
      },
      { id: 'bearish_ob_i_label', type: 'shapes' },
      { id: 'bullish_ob_i_label', type: 'shapes' },
      { id: 'bearish_ob_s_label', type: 'shapes' },
      { id: 'bullish_ob_s_label', type: 'shapes' }, */
    ],
    styles: {
      bearish_fvg_lower: {
        title: 'Bearish FVG Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_fvg_higher: {
        title: 'Bearish FVG Higher',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_fvg_middle: {
        title: 'Bearish FVG Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_fvg_lower: {
        title: 'Bullish FVG Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_fvg_higher: {
        title: 'Bullish FVG Higher',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_fvg_middle: {
        title: 'Bullish FVG Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      /* bearish_ob_i_lower: {
        title: 'Bearish OB Internal Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_ob_i_higher: {
        title: 'Bearish OB Internal Higher',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_ob_i_middle: {
        title: 'Bearish OB Internal Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_i_lower: {
        title: 'Bullish OB Internal Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_i_higher: {
        title: 'Bullish OB Internal Higher',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_i_middle: {
        title: 'Bullish OB Internal Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_ob_s_lower: {
        title: 'Bearish OB Swing Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_ob_s_higher: {
        title: 'Bearish OB Swing Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bearish_ob_s_middle: {
        title: 'Bearish OB Swing Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_s_lower: {
        title: 'Bullish OB Swing Lower',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_s_higher: {
        title: 'Bullish OB Swing Higher',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_s_middle: {
        title: 'Bullish OB Swing Middle',
        histogramBase: 0,
        joinPoints: !1,
      },
      bullish_ob_i_label: {
        title: 'Bullish OB Internal',
        text: 'Bull I',
      },
      bullish_ob_s_label: {
        title: 'Bullish OB Swing',
        text: 'Bull S',
      },
      bearish_ob_i_label: {
        title: 'Bear OB Internal',
        text: 'Bear I',
      },
      bearish_ob_s_label: {
        title: 'Bear OB Swing',
        text: 'Bear S',
      }, */
    },
    description: 'Fair Value Gaps',
    shortDescription: 'Fair Value Gaps',
    is_price_study: !0,
    id: 'Fair Value Gaps@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Fair Value Gaps',
    format: {
      type: 'inherit',
    },
    inputs: [
      {
        id: 'showBearishFVG',
        name: 'Show Bearish FVG',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBullishFVG',
        name: 'Show Bullish FVG',
        defval: true,
        type: 'bool',
      },
      /* {
        id: 'showBearishInternalOrderBlocks',
        name: 'Show Bearish OB Internal',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBullishInternalOrderBlocks',
        name: 'Show Bullish OB Internal',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBearishSwingOrderBlocks',
        name: 'Show Bearish OB Swing',
        defval: true,
        type: 'bool',
      },
      {
        id: 'showBullishSwingOrderBlocks',
        name: 'Show Bullish OB Swing',
        defval: true,
        type: 'bool',
      }, */
      {
        id: 'id',
        name: 'ID',
        defval: '',
        type: 'text',
      },
    ],
  },

  constructor: function () {
    /* this.removeRef = function (object) {
      return JSON.parse(JSON.stringify(object))
    } */
    this.fairValueGaps = function (context) {
      const c = r.Std.close(context);
      const close = context.new_var(c);
      const lastClose = close.get(1);
      const o = r.Std.open(context);
      const open = context.new_var(o);
      const lastOpen = open.get(1);
      const h = r.Std.high(context);
      const high = context.new_var(h);
      const last2high = high.get(2);
      const currentHigh = high.get(0);
      const l = r.Std.low(context);
      const low = context.new_var(l);
      const last2low = low.get(2);
      const currentLow = low.get(0);
      const barDeltaPercent = (lastClose - lastOpen) / (lastOpen * 100);
      const abs = Math.abs(barDeltaPercent);

      // Efficient rolling sum for threshold calculation
      const lookbackPeriod = 1000;
      const rollingSum = context.new_var(0);
      const counter = context.new_var(0);

      // Get previous values
      const prevSum = rollingSum.get(1) || 0;
      const prevCounter = counter.get(1) || 0;

      // Get the value from lookbackPeriod bars ago to subtract
      const oldValue = context.new_var(abs).get(lookbackPeriod) || 0;

      // Calculate new rolling sum
      let newSum = prevSum + abs;
      let newCounter = prevCounter + 1;

      // If we have enough bars, subtract the oldest value
      if (newCounter > lookbackPeriod) {
        newSum -= oldValue;
        newCounter = lookbackPeriod;
      }

      // Store new values
      rollingSum.set(newSum);
      counter.set(newCounter);

      // Calculate threshold as 2x the average
      const avgDelta = newCounter > 0 ? newSum / newCounter : 0;
      const threshold = avgDelta * 2;

      const { time } = context.symbol;
      const timeVar = context.new_var(time);
      timeVar.get(1);
      const bullishFairValueGap =
        currentLow > last2high &&
        lastClose > last2high &&
        barDeltaPercent > threshold;
      const bearishFairValueGap =
        currentHigh < last2low &&
        lastClose < last2low &&
        -barDeltaPercent > threshold;
      const extend = 9;
      let trigger = NaN;
      const triggerTime = context.new_var(trigger);
      triggerTime.get(1);
      let lower = NaN;
      let higher = NaN;
      let middle = NaN;
      let side = NaN;
      const resultLower = context.new_var(lower);
      const resultHigher = context.new_var(higher);
      const resultMiddle = context.new_var(middle);
      const resultSide = context.new_var(side);
      resultLower.get(1);
      resultHigher.get(1);
      resultMiddle.get(1);
      resultSide.get(1);
      /* const val =
        barDeltaPercent > threshold ? 1 : -barDeltaPercent > threshold ? -1 : 0; */

      if (
        isNaN(triggerTime.get(1)) &&
        (bullishFairValueGap || bearishFairValueGap)
      ) {
        trigger = time;
        triggerTime.set(time);
        if (bullishFairValueGap) {
          lower = last2high;
          higher = currentLow;
          middle = (last2high + currentLow) / 2;
          side = 1;
        }
        if (bearishFairValueGap) {
          lower = currentHigh;
          higher = last2low;
          middle = (currentHigh + last2low) / 2;
          side = -1;
        }
        resultLower.set(lower);
        resultHigher.set(higher);
        resultMiddle.set(middle);
        resultSide.set(side);
      } else if (
        !isNaN(triggerTime.get(1)) &&
        time - triggerTime.get(1) <= extend * (timeVar.get() - timeVar.get(1))
      ) {
        lower = resultLower.get(1);
        higher = resultHigher.get(1);
        middle = resultMiddle.get(1);
        side = resultSide.get(1);
        resultLower.set(lower);
        resultHigher.set(higher);
        resultMiddle.set(middle);
        resultSide.set(side);
        triggerTime.set(triggerTime.get(1));
      } else if (
        !isNaN(triggerTime.get(1)) &&
        isNaN(triggerTime.get(0)) &&
        time - triggerTime.get(1) > extend * (timeVar.get() - timeVar.get(1))
      ) {
        triggerTime.set(NaN);
      }
      return [lower, higher, middle, side];
    };
    /* this.orderBlocks = function (context) {
      const atr = r.Std.atr(200, context)
      if (!atr) {
        return
      }
      const iSize = 5
      const sSize = 50
      const h = r.Std.high(context)
      const high = context.new_var(h)
      const l = r.Std.low(context)
      const low = context.new_var(l)
      const c = r.Std.close(context)
      const close = context.new_var(c)
      const highVolatilityBar = h - l >= 2 * atr
      const parsedHigh = highVolatilityBar ? l : h
      const parsedLow = highVolatilityBar ? h : l
      const internalLeg = this.leg(context, iSize, high, low)
      const swingLeg = this.leg(context, sSize, high, low)
      const pivot = {
        lastLevel: NaN,
        currentLevel: NaN,
        crossed: false,
        hh: 0,
        ll: 0,
      }
      const internalLow = this.removeRef(pivot)
      const il = context.new_var(internalLow)
      if (!isNaN(il.get(1).currentLevel)) {
        il.set(il.get(1))
      }
      const internalHigh = this.removeRef(pivot)
      const ih = context.new_var(internalHigh)
      if (!isNaN(ih.get(1).currentLevel)) {
        ih.set(ih.get(1))
      }
      const swingLow = this.removeRef(pivot)
      const sl = context.new_var(swingLow)
      if (!isNaN(sl.get(1).currentLevel)) {
        sl.set(sl.get(1))
      }
      const swingHigh = this.removeRef(pivot)
      const sh = context.new_var(swingHigh)
      if (!isNaN(sh.get(1).currentLevel)) {
        sh.set(sh.get(1))
      }
      if (internalLeg.startOfBullishLeg) {
        const get =
          (il.modified ? il.get() : il.get(1)) || this.removeRef(pivot)
        internalLow.lastLevel = get.currentLevel
        internalLow.currentLevel = low.get(iSize)
        internalLow.crossed = false
        il.set(internalLow)
      } else if (internalLeg.startOfBearishLeg) {
        const get =
          (ih.modified ? ih.get() : ih.get(1)) || this.removeRef(pivot)
        internalHigh.lastLevel = get.currentLevel
        internalHigh.currentLevel = high.get(iSize)
        internalHigh.crossed = false
        ih.set(internalHigh)
      }
      if (swingLeg.startOfBullishLeg) {
        const get =
          (sl.modified ? sl.get() : sl.get(1)) || this.removeRef(pivot)
        swingLow.lastLevel = get.currentLevel
        swingLow.currentLevel = low.get(sSize)
        swingLow.crossed = false
        sl.set(swingLow)
      } else if (swingLeg.startOfBearishLeg) {
        const get =
          (sh.modified ? sh.get() : sh.get(1)) || this.removeRef(pivot)
        swingHigh.lastLevel = get.currentLevel
        swingHigh.currentLevel = high.get(sSize)
        swingHigh.crossed = false
        sh.set(swingHigh)
      }
      const _sh = sh.modified ? sh.get() : sh.get(1)
      const _sl = sl.modified ? sl.get() : sl.get(1)
      const _ih = ih.modified ? ih.get() : ih.get(1)
      const _il = il.modified ? il.get() : il.get(1)
      if (_sh && !_sh.crossed) {
        if (!_sh.hh || parsedHigh > _sh.hh) {
          _sh.hh = parsedHigh
          sh.set(_sh)
        }
        if (!_sh.ll || parsedLow < _sh.ll) {
          _sh.ll = parsedLow
          sh.set(_sh)
        }
      }
      if (_sl && !_sl.crossed) {
        if (!_sl.hh || parsedHigh > _sl.hh) {
          _sl.hh = parsedHigh
          sl.set(_sl)
        }
        if (!_sl.ll || parsedLow < _sl.ll) {
          _sl.ll = parsedLow
          sl.set(_sl)
        }
      }
      if (_ih && !_ih.crossed) {
        if (!_ih.hh || parsedHigh > _ih.hh) {
          _ih.hh = parsedHigh
          ih.set(_ih)
        }
        if (!_ih.ll || parsedLow < _ih.ll) {
          _ih.ll = parsedLow
          ih.set(_ih)
        }
      }
      if (_il && !_il.crossed) {
        if (!_il.hh || parsedHigh > _il.hh) {
          _il.hh = parsedHigh
          il.set(_il)
        }
        if (!_il.ll || parsedLow < _il.ll) {
          _il.ll = parsedLow
          il.set(_il)
        }
      }
      const getIh =
        (ih.modified ? ih.get() : ih.get(1)) || this.removeRef(pivot)
      const getSh =
        (sh.modified ? sh.get() : sh.get(1)) || this.removeRef(pivot)
      const getIl =
        (il.modified ? il.get() : il.get(1)) || this.removeRef(pivot)
      const getSl =
        (sl.modified ? sl.get() : sl.get(1)) || this.removeRef(pivot)
      const ihCl = context.new_var(getIh.currentLevel)
      const shCl = context.new_var(getSh.currentLevel)
      const ilCl = context.new_var(getIl.currentLevel)
      const slCl = context.new_var(getSl.currentLevel)
      ihCl.get(1)
      shCl.get(1)
      ilCl.get(1)
      slCl.get(1)
      let iBullH = r.Std.na()
      let iBullL = r.Std.na()
      let iBullM = r.Std.na()
      let sBullH = r.Std.na()
      let sBullL = r.Std.na()
      let sBullM = r.Std.na()
      let iBearH = r.Std.na()
      let iBearL = r.Std.na()
      let iBearM = r.Std.na()
      let sBearH = r.Std.na()
      let sBearL = r.Std.na()
      let sBearM = r.Std.na()
      const timeString = context.symbol.time
        ? new Date(context.symbol.time).toISOString()
        : 'no time'
      if (
        crossover(r, close, ihCl) &&
        !getIh.crossed &&
        getIh.currentLevel !== getSh.currentLevel
      ) {
        getIh.crossed = true
        ih.set(getIh)
        iBullH = getIh.hh
        iBullL = getIh.ll
        iBullM = (getIh.hh + getIh.ll) / 2
      }
      if (crossover(r, close, shCl) && !getSh.crossed) {
        getSh.crossed = true
        sh.set(getSh)
        sBullH = getSh.hh
        sBullL = getSh.ll
        sBullM = (getSh.hh + getSh.ll) / 2
      }
      if (
        crossunder(r, close, ilCl) &&
        !getIl.crossed &&
        getIl.currentLevel !== getSl.currentLevel
      ) {
        getIl.crossed = true
        il.set(getIl)
        iBearH = getIl.hh
        iBearL = getIl.ll
        iBearM = (getIl.hh + getIl.ll) / 2
      }
      if (crossunder(r, close, slCl) && !getSl.crossed) {
        getSl.crossed = true
        sl.set(getSl)
        sBearH = getSl.hh
        sBearL = getSl.ll
        sBearM = (getSl.hh + getSl.ll) / 2
      }
      return [
        iBullH,
        iBullL,
        iBullM,
        iBearH,
        iBearL,
        iBearM,
        sBullH,
        sBullL,
        sBullM,
        sBearH,
        sBearL,
        sBearM,
      ]
    }
    this.leg = function (context, size, high, low) {
      let _leg = 0
      const newLegHigh = high.get(size) > r.Std.highest(high, size, context)
      const newLegLow = low.get(size) < r.Std.lowest(low, size, context)

      if (newLegHigh) {
        _leg = 0
      } else if (newLegLow) {
        _leg = 1
      }
      const leg = context.new_var(_leg)
      const startOfNewLeg = leg.get(1) !== leg.get()
      const startOfBearishLeg = startOfNewLeg && leg.get(0) - leg.get(1) === -1
      const startOfBullishLeg = startOfNewLeg && leg.get(0) - leg.get(1) === 1
      return { startOfBearishLeg, startOfBullishLeg }
    } */
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const showBearishFVG = this._input(0);
      const showBullishFVG = this._input(1);
      /* const showBearishInternalOrderBlocks = this._input(2)
      const showBullishInternalOrderBlocks = this._input(3)
      const showBearishSwingOrderBlocks = this._input(4)
      const showBullishSwingOrderBlocks = this._input(5) */
      const id = this._input(2 /* 6 */);
      this._context.setMinimumAdditionalDepth(1000);
      if (callback) {
        const val = NaN;
        callback(val, id);
      }
      let bearishFVGHigh = r.Std.na();
      let bearishFVGMiddle = r.Std.na();
      let bearishFVGLow = r.Std.na();
      let bullishFVGHigh = r.Std.na();
      let bullishFVGMiddle = r.Std.na();
      let bullishFVGLow = r.Std.na();
      /* let bearishOBILow = r.Std.na()
      let bearishOBIMiddle = r.Std.na()
      let bearishOBIHigh = r.Std.na()
      let bullishOBILow = r.Std.na()
      let bullishOBIMiddle = r.Std.na()
      let bullishOBIHigh = r.Std.na()
      let bearishOBSLow = r.Std.na()
      let bearishOBSMiddle = r.Std.na()
      let bearishOBSHigh = r.Std.na()
      let bullishOBSLow = r.Std.na()
      let bullishOBSMiddle = r.Std.na()
      let bullishOBSHigh = r.Std.na() */

      if (this._context.symbol.index > 0 && this._context.symbol.isBarClosed) {
        // Fair Value Gaps
        const [lower, higer, middle, side] = this.fairValueGaps(this._context);
        if (side === 1) {
          bullishFVGHigh = higer;
          bullishFVGMiddle = middle;
          bullishFVGLow = lower;
        }
        if (side === -1) {
          bearishFVGHigh = higer;
          bearishFVGMiddle = middle;
          bearishFVGLow = lower;
        }

        // Order Blocks
        /* if (
          showBearishInternalOrderBlocks ||
          showBullishInternalOrderBlocks ||
          showBearishSwingOrderBlocks ||
          showBullishSwingOrderBlocks
        ) {
          const res = this.orderBlocks(this._context)
          if (res) {
            ;[
              bullishOBIHigh,
              bullishOBILow,
              bullishOBIMiddle,
              bearishOBIHigh,
              bearishOBILow,
              bearishOBIMiddle,
              bullishOBSHigh,
              bullishOBSLow,
              bullishOBSMiddle,
              bearishOBSHigh,
              bearishOBSLow,
              bearishOBSMiddle,
            ] = res
          }
        } */
      }
      return [
        showBearishFVG ? bearishFVGLow : r.Std.na(),
        showBearishFVG ? bearishFVGHigh : r.Std.na(),
        showBearishFVG ? bearishFVGMiddle : r.Std.na(),
        showBullishFVG ? bullishFVGLow : r.Std.na(),
        showBullishFVG ? bullishFVGHigh : r.Std.na(),
        showBullishFVG ? bullishFVGMiddle : r.Std.na(),
        /* showBearishInternalOrderBlocks ? bearishOBILow : r.Std.na(),
        showBearishInternalOrderBlocks ? bearishOBIHigh : r.Std.na(),
        showBearishInternalOrderBlocks ? bearishOBIMiddle : r.Std.na(),
        showBullishInternalOrderBlocks ? bullishOBILow : r.Std.na(),
        showBullishInternalOrderBlocks ? bullishOBIHigh : r.Std.na(),
        showBullishInternalOrderBlocks ? bullishOBIMiddle : r.Std.na(),
        showBearishSwingOrderBlocks ? bearishOBSLow : r.Std.na(),
        showBearishSwingOrderBlocks ? bearishOBSHigh : r.Std.na(),
        showBearishSwingOrderBlocks ? bearishOBSMiddle : r.Std.na(),
        showBullishSwingOrderBlocks ? bullishOBSLow : r.Std.na(),
        showBullishSwingOrderBlocks ? bullishOBSHigh : r.Std.na(),
        showBullishSwingOrderBlocks ? bullishOBSMiddle : r.Std.na(), */
      ];
    };
  },
});

export const Session = () => ({
  name: 'Session Selector',
  metainfo: {
    _metainfoVersion: 52,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    showLegendValues: false,
    defaults: {
      styles: {
        bgColor: {
          visible: !0,
          transparency: 85,
        },
      },
      palettes: {
        paletteBg: {
          colors: {
            1: { color: '#2196F3' },
          },
        },
      },
      inputs: {
        sun: false,
        mon: true,
        tue: true,
        wed: true,
        thu: true,
        fri: true,
        sat: false,
        inSession: true,
      },
    },
    plots: [
      {
        id: 'bgColor',
        type: 'bg_colorer',
        palette: 'paletteBg',
      },
    ],
    styles: {
      bgColor: {
        title: 'Session background',
      },
    },
    palettes: {
      paletteBg: {
        colors: {
          1: { name: 'In session' },
        },
        valToIndex: { 1: 1 },
      },
    },
    description: 'Session Selector',
    shortDescription: 'Session',
    is_price_study: !0,
    id: 'Session Selector@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Session Selector',
    format: {
      type: 'inherit',
    },
    inputs: [
      { id: 'sun', name: 'Sunday', defval: false, type: 'bool' },
      { id: 'mon', name: 'Monday', defval: true, type: 'bool' },
      { id: 'tue', name: 'Tuesday', defval: true, type: 'bool' },
      { id: 'wed', name: 'Wednesday', defval: true, type: 'bool' },
      { id: 'thu', name: 'Thursday', defval: true, type: 'bool' },
      { id: 'fri', name: 'Friday', defval: true, type: 'bool' },
      { id: 'sat', name: 'Saturday', defval: false, type: 'bool' },
      { id: 'inSession', name: 'In session', defval: true, type: 'bool' },
    ],
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      const days = [
        this._input(0), // sun = 0
        this._input(1), // mon = 1
        this._input(2), // tue = 2
        this._input(3), // wed = 3
        this._input(4), // thu = 4
        this._input(5), // fri = 5
        this._input(6), // sat = 6
      ];
      const inSession = this._input(7);
      const barTime = e.symbol.time;
      if (!barTime) return [0];
      const utcDay = new Date(barTime).getUTCDay();
      const dayMatch = days[utcDay];
      const active = inSession ? dayMatch : !dayMatch;
      return [active ? 1 : 0];
    };
  },
});

export const LW = (r, callback) => ({
  name: 'Long Wick Detector',
  metainfo: {
    _metainfoVersion: 52,
    isTVScript: !1,
    isTVScriptStub: !1,
    is_hidden_study: !1,
    defaults: {
      styles: {
        bullLevel: {
          linestyle: 0,
          linewidth: 2,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#089981',
        },
        bearLevel: {
          linestyle: 0,
          linewidth: 2,
          plottype: 6,
          trackPrice: !1,
          transparency: 0,
          visible: !0,
          color: '#F23645',
        },
      },
      inputs: {
        threshold: 0.25,
        maxDuration: 100,
        showTop: true,
        showBottom: true,
        id: '',
      },
    },
    plots: [
      { id: 'bullLevel', type: 'line' },
      { id: 'bearLevel', type: 'line' },
    ],
    styles: {
      bullLevel: { title: 'Top wick level', histogramBase: 0 },
      bearLevel: { title: 'Bottom wick level', histogramBase: 0 },
    },
    description: 'Long Wick Detector',
    shortDescription: 'Long Wick',
    is_price_study: !0,
    id: 'Long Wick Detector@tv-basicstudies-1',
    scriptIdPart: '',
    name: 'Long Wick Detector',
    format: { type: 'inherit' },
    inputs: [
      {
        id: 'threshold',
        name: 'Wick Threshold',
        defval: 0.25,
        type: 'float',
        min: 0.25,
        max: 100,
        step: 0.25,
      },
      {
        id: 'maxDuration',
        name: 'Max Duration',
        defval: 100,
        type: 'integer',
        min: 10,
        max: 10000,
      },
      { id: 'showTop', name: 'Show Top', defval: true, type: 'bool' },
      { id: 'showBottom', name: 'Show Bottom', defval: true, type: 'bool' },
      { id: 'id', name: '', defval: '', type: 'text', isHidden: true },
    ],
  },
  constructor: function () {
    this.main = function (e, t) {
      this._context = e;
      this._input = t;
      this._context.setMinimumAdditionalDepth(200);
      const high = r.Std.high(this._context);
      const low = r.Std.low(this._context);
      const open = r.Std.open(this._context);
      const close = r.Std.close(this._context);
      const threshold = this._input(0);
      const maxDuration = this._input(1);
      const showTop = this._input(2);
      const showBottom = this._input(3);
      const atr = r.Std.atr(200, e);
      const volatility = atr * threshold;
      const bodyTop = Math.max(open, close);
      const bodyBottom = Math.min(open, close);
      const topWick = high - bodyTop;
      const bottomWick = bodyBottom - low;
      const bullLevel = this._context.new_var(NaN);
      const bearLevel = this._context.new_var(NaN);
      const bullCount = this._context.new_var(0);
      const bearCount = this._context.new_var(0);
      let lastBull = bullLevel.get(1);
      let lastBear = bearLevel.get(1);
      let lastBullCount = bullCount.get(1);
      let lastBearCount = bearCount.get(1);
      // Detect new long wicks
      let newBull = false;
      let newBear = false;
      if (topWick >= volatility) {
        lastBull = high;
        lastBullCount = 0;
        newBull = true;
      }
      if (bottomWick >= volatility) {
        lastBear = low;
        lastBearCount = 0;
        newBear = true;
      }
      // Check mitigation/expiry for bull level
      if (!isNaN(lastBull) && !newBull) {
        lastBullCount++;
        if (bodyTop >= lastBull || lastBullCount > maxDuration) {
          lastBull = NaN;
          lastBullCount = 0;
        }
      }
      // Check mitigation/expiry for bear level
      if (!isNaN(lastBear) && !newBear) {
        lastBearCount++;
        if (bodyBottom <= lastBear || lastBearCount > maxDuration) {
          lastBear = NaN;
          lastBearCount = 0;
        }
      }

      bullLevel.set(lastBull);
      bearLevel.set(lastBear);
      bullCount.set(lastBullCount);
      bearCount.set(lastBearCount);

      const bull = showTop && !isNaN(lastBull) ? lastBull : r.Std.na();
      const bear = showBottom && !isNaN(lastBear) ? lastBear : r.Std.na();
      if (callback) {
        const id = this._input(4);
        if (id) {
          callback({ id, bull, bear });
        }
      }
      return [bull, bear];
    };
  },
});
