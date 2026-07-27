/* eslint-disable @typescript-eslint/no-explicit-any */
// New human-readable URL serializer
// - Sorting format: comma-separated list: "-id,otherId" (leading '-' is desc)
// - Filters format: pipe-separated list: "col:operator:value|col:operator" (value is optional for isEmpty/isNotEmpty)
// Value part is encoded with `encodeURIComponent` to avoid clashes with separators.
// Backwards compatibility: if input looks like base64, try base64 decode and JSON.parse.

const looksLikeBase64 = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);

// Operators whose value is an ARRAY, not a scalar. `String(['a','b'])` would
// flatten these to "a,b" and read back as one string, which silently breaks
// the filter: `isAnyOf` then looks for a cell containing the literal
// "a,b" (matches nothing) and `between` bails out of its Array.isArray guard
// (matches everything). Each element is encoded separately so a comma inside
// a value survives as %2C and the join stays unambiguous.
const MULTI_VALUE_OPERATORS = new Set(['isAnyOf', 'isNoneOf', 'between']);

/**
 * Read the value part of a multi-value filter back into an array.
 * Handles both the current format (each element encoded, joined with a literal
 * `,`) and legacy links written before that fix, where the whole array was
 * flattened with `String()` and encoded once, so the separators arrived as
 * `%2C` and the elements as one blob.
 */
const parseMultiValue = (raw?: string): string[] => {
  if (!raw) return [];
  if (raw.includes(',')) return raw.split(',').map((p) => decodeURIComponent(p));
  const decoded = decodeURIComponent(raw);
  return decoded.includes(',') ? decoded.split(',') : [decoded];
};

export const serializeFilters = (filters: unknown) => {
  if (!Array.isArray(filters) || filters.length === 0) return '';
  const parts = (filters as any[]).map((f) => {
    if (!f || typeof f !== 'object') return '';
    const id = String(f.id ?? '');
    let operator: string | undefined;
    let value: unknown;
    // Column filter could be a string (legacy) or object
    if (
      typeof f.value === 'string' ||
      typeof f.value === 'number' ||
      typeof f.value === 'boolean'
    ) {
      operator = 'contains';
      value = f.value;
    } else if (
      f.value &&
      typeof f.value === 'object' &&
      'operator' in f.value
    ) {
      operator = String(f.value.operator);
      value = (f.value as any).value;
    }

    if (!operator) return id;

    // Operators like isEmpty/isNotEmpty don't need a value
    if (operator === 'isEmpty' || operator === 'isNotEmpty') {
      return `${id}:${operator}`;
    }

    const valueStr =
      value === undefined || value === null
        ? ''
        : Array.isArray(value)
          ? value.map((v) => encodeURIComponent(String(v))).join(',')
          : encodeURIComponent(String(value));
    return `${id}:${operator}:${valueStr}`;
  });
  return parts.filter(Boolean).join('|');
};

export const deserializeFilters = <T>(v: string | null): T | null => {
  if (!v) return null;
  // Try human-readable format first (presence of ':' or '|')
  if (v.includes(':') || v.includes('|')) {
    try {
      const parts = v
        .split('|')
        .map((p) => {
          const [id, operator, raw] = p.split(':');
          if (!operator) return null;
          if (operator === 'isEmpty' || operator === 'isNotEmpty') {
            return { id, value: { operator } };
          }
          const value = MULTI_VALUE_OPERATORS.has(operator)
            ? parseMultiValue(raw)
            : raw
              ? decodeURIComponent(raw)
              : '';
          return { id, value: { operator, value } };
        })
        .filter(Boolean);
      return parts as unknown as T;
    } catch {
      // fallthrough to other strategies
    }
  }

  // Fallback: JSON or base64
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    // try base64 decode
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        // atob is available in browsers; fallback decodeURIComponent for node tests
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

export const serializeSorting = (sorting: unknown) => {
  if (!Array.isArray(sorting) || sorting.length === 0) return '';
  const parts = (sorting as any[]).map((s) => {
    if (!s || typeof s !== 'object') return '';
    const id = String(s.id ?? s.columnId ?? '');
    const desc = !!s.desc;
    return `${desc ? '-' : ''}${id}`;
  });
  return parts.filter(Boolean).join(',');
};

export const deserializeSorting = <T>(v: string | null): T | null => {
  if (!v) return null;
  try {
    const parts = v
      .split(',')
      .map((p) => {
        if (!p) return null;
        const desc = p.startsWith('-');
        const id = desc ? p.slice(1) : p;
        return { id, desc };
      })
      .filter(Boolean);
    return parts as unknown as T;
  } catch {
    // fallthrough to other strategies
  }

  // Fallback JSON/base64
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

// Generic serialize/deserialize that detects type and uses readable format, with fallback
export const serialize = (v: unknown) => {
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (first && typeof first === 'object' && 'desc' in first)
      return serializeSorting(v);
    if (first && typeof first === 'object' && 'value' in first)
      return serializeFilters(v);
  }
  return encodeURIComponent(JSON.stringify(v));
};

export const deserialize = <T>(v: string | null): T | null => {
  if (!v) return null;

  // Try to detect filters vs sorting vs JSON
  if (v.includes(':') || v.includes('|')) {
    return deserializeFilters<T>(v);
  }
  // Try parsing as a sorting value (single token or comma-separated)
  const sortingAttempt = deserializeSorting<T>(v);
  if (sortingAttempt) return sortingAttempt;

  // Try JSON
  try {
    return JSON.parse(decodeURIComponent(v as string)) as T;
  } catch {
    // Fallback to base64
    try {
      if (looksLikeBase64(v)) {
        const pad = (4 - (v.length % 4)) % 4;
        const base64 = (v + '='.repeat(pad))
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        const decoded =
          typeof atob === 'function'
            ? decodeURIComponent(escape(atob(base64) as unknown as string))
            : Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(decoded) as T;
      }
    } catch {
      // final fallthrough
    }
  }
  return null;
};

export default {
  serializeFilters,
  deserializeFilters,
  serializeSorting,
  deserializeSorting,
  serialize,
  deserialize,
};
