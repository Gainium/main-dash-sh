import type { Header, Row } from '@tanstack/react-table';
import { getHeaderNames } from 'tanstack-table-export-to-csv';

/**
 * RFC-4180 CSV export for the DataTable.
 *
 * WHY THIS EXISTS: the upstream `tanstack-table-export-to-csv` package builds
 * its blob by `join(',')`-ing raw cell values with NO quoting or escaping
 * (see its `getRowsData`/`getCsvBlob`). Any cell containing a comma, a double
 * quote, or a newline corrupts the file — commas shift columns and embedded
 * newlines split one logical row across multiple physical lines (a bot's 970
 * closed deals exported as 1940 lines). The DataTable is shared across the
 * app (portfolio, trades, deals, …), so this affected every CSV export.
 *
 * We reuse the lib's `getHeaderNames` (it correctly resolves function headers
 * via react-innertext) but do the row extraction and serialization here,
 * quoting/escaping every field — header and body alike.
 */

/**
 * Encode a single value as one RFC-4180 field: wrap it in double quotes and
 * double any embedded quote (`"` → `""`). Quoting unconditionally also
 * neutralizes commas and newlines inside the value, so the field survives a
 * round-trip through any compliant CSV parser.
 */
export const csvField = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
};

// Same visible-column selection the upstream lib used, so switching to this
// encoder doesn't change which columns are exported — only how they're quoted.
const getRowValues = <TData>(row: Row<TData>): unknown[] =>
  row
    .getAllCells()
    .filter((cell) => cell.column.getIsVisible())
    .map((cell) => cell.getValue());

/**
 * Build a properly-escaped RFC-4180 CSV string from tanstack header + row
 * models. Records are CRLF-terminated per the spec.
 */
export const buildCsv = <TData>(
  headers: Header<TData, unknown>[],
  rows: Row<TData>[]
): string => {
  const headerLine = getHeaderNames(headers).map(csvField).join(',');
  const bodyLines = rows.map((row) => getRowValues(row).map(csvField).join(','));
  return [headerLine, ...bodyLines].join('\r\n') + '\r\n';
};

/**
 * Build the escaped CSV and trigger a browser download. Drop-in replacement
 * for the upstream default export, minus the corruption.
 */
export const downloadCsv = <TData>(
  fileName: string,
  headers: Header<TData, unknown>[],
  rows: Row<TData>[]
): void => {
  const blob = new Blob([buildCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
