/**
 * Utility functions for formatting data display
 */

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format date to human readable string
 */
export function formatDate(
  input: string | number | Date | null | undefined
): string {
  if (input === null || input === undefined) {
    return 'Invalid Date';
  }

  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return 'Invalid Date';
    }

    const numericCandidate = Number(trimmed);
    date =
      Number.isFinite(numericCandidate) && trimmed.match(/^\d+$/)
        ? new Date(numericCandidate)
        : new Date(trimmed);
  } else {
    return 'Invalid Date';
  }

  if (Number.isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  // If less than 7 days ago, show relative time
  if (diffInDays < 7) {
    if (diffInDays === 0) {
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      if (diffInHours === 0) {
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes}m ago`;
      }
      return diffInHours === 1 ? '1h ago' : `${diffInHours}h ago`;
    }
    return diffInDays === 1 ? 'Yesterday' : `${diffInDays}d ago`;
  }

  // Otherwise show formatted date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a price with adaptive precision depending on magnitude.
 * - very small prices show more decimals (up to 8)
 * - small prices show 4-6 decimals
 * - prices < 1 show 5 decimals
 * - otherwise use locale formatting with 2 decimals
 */
export function formatPriceWithPrecision(
  price: number,
  currencySymbol = '$',
  suffix = ''
): string {
  if (price == null || Number.isNaN(price)) {
    return `${currencySymbol}0.00${suffix}`;
  }

  const abs = Math.abs(price);
  let formatted: string;

  if (abs === 0) {
    formatted = '0.00';
  } else if (abs < 0.001) {
    formatted = price.toFixed(8);
  } else if (abs < 0.01) {
    formatted = price.toFixed(6);
  } else if (abs < 1) {
    formatted = price.toFixed(5);
  } else {
    formatted = price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return `${currencySymbol}${formatted}${suffix}`;
}

/**
 * How to render an amount denominated in a pair's QUOTE asset.
 *
 * Fiat and the dollar/euro stablecoins get their glyph as a prefix; anything
 * else (BTC, ETH, SOL, …) gets its ticker appended instead, because a bare
 * number and a wrong "$" are both worse than "0.0234 BTC". With no quote asset
 * to go on we still say "$" — that is what every call site did unconditionally
 * before, so an unknown pair is no worse off than it already was.
 *
 * This exists because the deal Orders table rendered a Kraken ETH-EUR ladder as
 * "$2,067.50 / $1,521.81": `formatCurrency` hardcodes en-US/USD, and a user
 * reading his own orders could not tell what currency the numbers were in.
 */
const QUOTE_GLYPHS: Record<string, string> = {
  USD: '$',
  USDT: '$',
  USDC: '$',
  BUSD: '$',
  FDUSD: '$',
  TUSD: '$',
  USDE: '$',
  DAI: '$',
  EUR: '€',
  EURC: '€',
  EURT: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF ',
  TRY: '₺',
  BRL: 'R$',
};

export function quoteUnits(quoteAsset?: string | null): {
  prefix: string;
  suffix: string;
} {
  const code = (quoteAsset ?? '').trim().toUpperCase();
  if (!code) {
    return { prefix: '$', suffix: '' };
  }
  const glyph = QUOTE_GLYPHS[code];
  return glyph ? { prefix: glyph, suffix: '' } : { prefix: '', suffix: ` ${code}` };
}

/**
 * Render an order's timestamp, or `null` when the order has never been placed.
 *
 * A projected ("smart") ladder level has no creation time. `useDealSmartOrders`
 * stamps it `new Date(0)` so the row still satisfies `ViewOrder.createTime`,
 * which is a required string — so epoch is the marker for "not placed yet" and
 * must never be rendered as a date. The deal Orders table used to guard with
 * `if (!raw) return null`, which cannot catch it: `"1970-01-01T00:00:00.000Z"`
 * is a truthy string, so every projected row displayed "01/01/1970, 01:00:00".
 */
export function formatOrderTime(
  raw?: string | number | null
): string | null {
  if (!raw) {
    return null;
  }
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  return new Date(ms).toLocaleString();
}

/**
 * Format a value that is denominated in a pair's quote asset (an order total,
 * a cost, a notional). Use this instead of {@link formatCurrency} whenever the
 * number belongs to a trading pair rather than to a usd-normalized stat.
 */
export function formatQuoteAmount(
  value: number,
  quoteAsset?: string | null,
  decimals = 2
): string {
  const { prefix, suffix } = quoteUnits(quoteAsset);
  const formatted = (Number.isFinite(value) ? value : 0).toLocaleString(
    'en-US',
    { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
  );
  return `${prefix}${formatted}${suffix}`;
}

/**
 * Format percentage value
 */
export function formatPercentage(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatCompactNumber(value: number): string {
  if (Math.abs(value) < 1000) {
    return value.toString();
  }

  const suffixes = ['', 'K', 'M', 'B', 'T'];
  const tier = (Math.log10(Math.abs(value)) / 3) | 0;

  if (tier === 0) return value.toString();

  const suffix = suffixes[tier];
  const scale = Math.pow(10, tier * 3);
  const scaled = value / scale;

  return scaled.toFixed(1) + suffix;
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  return `${seconds}s`;
}
