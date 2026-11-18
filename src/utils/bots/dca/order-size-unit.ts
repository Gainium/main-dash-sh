/**
 * The unit an order size is written in, from the bot's `orderSizeType`, with
 * its leading space (`' USDT'`, `' BTC'`, `'% of free'`). An order size is in
 * the order currency, which is not the profit currency: a base-profit bot
 * still sizes its orders in quote when `orderSizeType` is `quote`.
 */
export function sizeUnit(
  type: string | null | undefined,
  quote?: string,
  base?: string
): string {
  switch (type) {
    case 'base':
      return base ? ` ${base}` : '';
    case 'quote':
      return quote ? ` ${quote}` : '';
    case 'usd':
      return ' USD';
    case 'percTotal':
      return '% of total';
    case 'percFree':
      return '% of free';
    default:
      return '';
  }
}
