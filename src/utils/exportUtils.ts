/* eslint-disable @typescript-eslint/no-explicit-any */
// Export utilities for Enhanced Balance Table
// Provides CSV, Excel, and JSON export functionality

import type { EnhancedBalanceData } from '../types/enhancedBalance.types';
import {
  getReportingCurrency,
  holdingToReporting,
} from '@/utils/reportingCurrency';

// Export format types
export type ExportFormat = 'csv' | 'excel' | 'json';

// Export options interface
export interface ExportOptions {
  format: ExportFormat;
  includeHeaders: boolean;
  includeTotalRow: boolean;
  selectedColumns: string[];
  filename?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Column definition for export
export interface ExportColumn {
  key: keyof EnhancedBalanceData;
  header: string;
  formatter?: (value: any, row: EnhancedBalanceData) => string;
}

// A row's USD value in the reporting currency (a balance already in that
// currency at its face amount), e.g. `€123.45`.
const reportingValue =
  (amountKey: keyof EnhancedBalanceData, decimals = 2) =>
  (val: any, row: EnhancedBalanceData): string => {
    const currency = getReportingCurrency();
    const value = holdingToReporting(
      row.token,
      Number(row[amountKey] || 0),
      Number(val || 0),
      currency
    );
    return `${currency.symbol}${value.toFixed(
      Math.min(decimals, currency.decimals ?? decimals)
    )}`;
  };

// "(USD)" in a header names the reporting currency.
const headerOf = (col: ExportColumn): string =>
  col.header.replace('(USD)', `(${getReportingCurrency().code})`);

// Default export columns (matching legacy dashboard)
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'token', header: 'Token' },
  { key: 'exchangeName', header: 'Exchange' },
  {
    key: 'free',
    header: 'Not In Limit',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'used',
    header: 'In Limit',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'total',
    header: 'Total',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'required',
    header: 'Max Bot Usage',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'planned',
    header: 'Planned',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'freeAndOver',
    header: 'Free',
    formatter: (val) => Number(val || 0).toFixed(8),
  },
  {
    key: 'freeUsd',
    header: 'Not In Limit (USD)',
    formatter: reportingValue('free'),
  },
  {
    key: 'usedUsd',
    header: 'In Limit (USD)',
    formatter: reportingValue('used'),
  },
  {
    key: 'totalUsd',
    header: 'Total (USD)',
    formatter: reportingValue('total'),
  },
  {
    key: 'requiredUsd',
    header: 'Max Bot Usage (USD)',
    formatter: reportingValue('required'),
  },
  {
    key: 'plannedUsd',
    header: 'Planned (USD)',
    formatter: reportingValue('planned'),
  },
  {
    key: 'freeAndOverUsd',
    header: 'Free (USD)',
    formatter: reportingValue('freeAndOver'),
  },
  {
    key: 'currentPrice',
    header: 'Current Price',
    formatter: (val, row) => {
      const currency = getReportingCurrency();
      const price = holdingToReporting(
        row.token,
        1,
        Number(val || 0),
        currency
      );
      return `${currency.symbol}${price.toFixed(8)}`;
    },
  },
  {
    key: 'requiredRatio',
    header: 'Required Ratio (%)',
    formatter: (val) => `${Number(val || 0).toFixed(2)}%`,
  },
];

// CSV Export Functions
export const exportToCSV = (
  data: EnhancedBalanceData[],
  options: ExportOptions
): void => {
  const columns = DEFAULT_EXPORT_COLUMNS.filter(
    (col) =>
      options.selectedColumns.length === 0 ||
      options.selectedColumns.includes(col.key as string)
  );

  let csvContent = '';

  // Add headers if requested
  if (options.includeHeaders) {
    csvContent += columns.map((col) => `"${headerOf(col)}"`).join(',') + '\n';
  }

  // Process data rows
  const processedData = options.includeTotalRow
    ? data
    : data.filter((row) => row.token !== 'Total');

  processedData.forEach((row) => {
    const csvRow = columns
      .map((col) => {
        const value = row[col.key];
        const formattedValue = col.formatter
          ? col.formatter(value, row)
          : String(value || '');
        // Escape quotes and wrap in quotes for CSV
        return `"${String(formattedValue).replace(/"/g, '""')}"`;
      })
      .join(',');
    csvContent += csvRow + '\n';
  });

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, options.filename || 'portfolio-balances.csv');
};

// Excel Export Functions (using CSV format for now - can be enhanced with xlsx library)
export const exportToExcel = (
  data: EnhancedBalanceData[],
  options: ExportOptions
): void => {
  // For now, use CSV format with .xlsx extension
  // TODO: Implement proper Excel format with styling
  const columns = DEFAULT_EXPORT_COLUMNS.filter(
    (col) =>
      options.selectedColumns.length === 0 ||
      options.selectedColumns.includes(col.key as string)
  );

  let content = '';

  // Add headers
  if (options.includeHeaders) {
    content += columns.map(headerOf).join('\t') + '\n';
  }

  // Process data rows
  const processedData = options.includeTotalRow
    ? data
    : data.filter((row) => row.token !== 'Total');

  processedData.forEach((row) => {
    const excelRow = columns
      .map((col) => {
        const value = row[col.key];
        const formattedValue = col.formatter
          ? col.formatter(value, row)
          : String(value || '');
        return formattedValue;
      })
      .join('\t');
    content += excelRow + '\n';
  });

  // Create and download file
  const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
  downloadFile(blob, options.filename || 'portfolio-balances.xlsx');
};

// JSON Export Functions
export const exportToJSON = (
  data: EnhancedBalanceData[],
  options: ExportOptions
): void => {
  const columns = DEFAULT_EXPORT_COLUMNS.filter(
    (col) =>
      options.selectedColumns.length === 0 ||
      options.selectedColumns.includes(col.key as string)
  );

  // Process data rows
  const processedData = options.includeTotalRow
    ? data
    : data.filter((row) => row.token !== 'Total');

  const jsonData = processedData.map((row) => {
    const jsonRow: Record<string, any> = {};
    columns.forEach((col) => {
      const value = row[col.key];
      jsonRow[headerOf(col)] = col.formatter
        ? col.formatter(value, row)
        : value;
    });
    return jsonRow;
  });

  // Add metadata
  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      totalRows: jsonData.length,
      includedColumns: columns.map(headerOf),
      includesTotalRow: options.includeTotalRow,
    },
    data: jsonData,
  };

  // Create and download file
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json',
  });
  downloadFile(blob, options.filename || 'portfolio-balances.json');
};

// Generic export function
export const exportBalanceData = (
  data: EnhancedBalanceData[],
  options: ExportOptions
): void => {
  switch (options.format) {
    case 'csv':
      exportToCSV(data, options);
      break;
    case 'excel':
      exportToExcel(data, options);
      break;
    case 'json':
      exportToJSON(data, options);
      break;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
};

// File download utility
const downloadFile = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Generate filename with timestamp
export const generateFilename = (
  baseName: string = 'portfolio-balances',
  format: ExportFormat,
  includeTimestamp: boolean = true
): string => {
  const timestamp = includeTimestamp
    ? new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    : '';

  const extension = format === 'excel' ? 'xlsx' : format;

  return includeTimestamp
    ? `${baseName}-${timestamp}.${extension}`
    : `${baseName}.${extension}`;
};

// Get available export columns for selection
export const getAvailableColumns = (): { key: string; label: string }[] => {
  return DEFAULT_EXPORT_COLUMNS.map((col) => ({
    key: col.key as string,
    label: headerOf(col),
  }));
};

// Validate export options
export const validateExportOptions = (options: ExportOptions): string[] => {
  const errors: string[] = [];

  if (!options.format) {
    errors.push('Export format is required');
  }

  if (!['csv', 'excel', 'json'].includes(options.format)) {
    errors.push('Invalid export format. Must be csv, excel, or json');
  }

  if (options.selectedColumns.length === 0) {
    errors.push('At least one column must be selected for export');
  }

  return errors;
};
